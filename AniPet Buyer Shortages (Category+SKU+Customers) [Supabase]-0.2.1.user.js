// ==UserScript==
// @name         AniPet Buyer Shortages (Category+SKU+Customers) [Supabase]
// @namespace    anipet.buyer
// @version      0.2.1
// @description  Buyer-first: Category summary -> SKU breakdown -> SKU customers + Category customers rollup. Uses Supabase RPCs from *_from_events.
// @match        https://*/*
// @grant        GM_xmlhttpRequest
// @connect      qgqpjlubdvxfzxjtocrh.supabase.co
// ==/UserScript==

(() => {
  "use strict";

  // ============================================================
  // CONFIG
  // ============================================================
  const SUPABASE_URL = "https://qgqpjlubdvxfzxjtocrh.supabase.co";

  // NOTE: If your anon key differs, replace it here (keep it as a string).
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFncXBqbHViZHZ4Znp4anRvY3JoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMjc1MTcsImV4cCI6MjA4NDcwMzUxN30.UBsJrTtys9Sf8u2q3Jm3Y2uLrq64NsnHP-D8irDgCLs";

  const RPC = {
    CATEGORY_SUMMARY: "buyer_category_summary_by_window_from_events",
    CATEGORY_SKU_BREAKDOWN: "buyer_category_sku_breakdown_by_window_from_events",
    CATEGORY_CUSTOMERS_ROLLUP: "buyer_customer_category_rollup_by_window",
    SKU_CUSTOMERS: "buyer_sku_customers_by_window_from_events",
  };

  const DEFAULTS = {
    // Buyer window semantics:
    // window_days = forward days from today
    // grace_past_days = how many days back we still consider "already due / just missed"
    WINDOW_DAYS: 30,
    GRACE_PAST_DAYS: 7,

    // continuity filters (ignore very short gaps like replacements)
    GAP_MIN_DAYS: 7,
    GAP_MAX_DAYS: 120,

    // "LOW" horizon (buyers care about near-term)
    LOW_DAYS: 7,

    // Minimum amounts (buyer view)
    INCLUDE_UNIT: false, // default buyer view: kg/l only
    MIN_KG: 1,
    MIN_L: 1,
    MIN_UNIT: 1, // only used if INCLUDE_UNIT=true

    LIMIT: 300,
  };

  const UI = {
    ROOT_STYLE: {
      position: "fixed",
      right: "12px",
      top: "12px",
      zIndex: "999999",
      background: "#fff",
      border: "1px solid #ddd",
      borderRadius: "10px",
      boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
      padding: "10px",
      width: "min(1100px, calc(100vw - 24px))",
      maxHeight: "calc(100vh - 24px)",
      overflow: "auto",
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
    },
  };

  // ============================================================
  // HTTP (GM_xmlhttpRequest)
  // ============================================================
  function gmFetch(url, { method = "GET", headers = {}, body = null } = {}) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method,
        url,
        headers,
        data: body,
        responseType: "text",
        onload: (res) => {
          resolve({
            ok: res.status >= 200 && res.status < 300,
            status: res.status,
            statusText: res.statusText,
            responseText: res.responseText,
          });
        },
        onerror: (err) => reject(err),
      });
    });
  }

  function sbHeaders(extra = {}) {
    return {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...extra,
    };
  }

  function safeJsonParse(txt) {
    try {
      return JSON.parse(txt);
    } catch {
      return null;
    }
  }

  function toNum(x, fallback = 0) {
    const n = Number(x);
    return Number.isFinite(n) ? n : fallback;
  }

  function fmtDate(d) {
    if (!d) return "";
    return String(d);
  }

  function fmtNum(n, digits = 2) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "";
    return x.toLocaleString(undefined, { maximumFractionDigits: digits });
  }

  async function sbRpc(fnName, args = {}) {
    const url = `${SUPABASE_URL}/rest/v1/rpc/${encodeURIComponent(fnName)}`;
    const res = await gmFetch(url, {
      method: "POST",
      headers: sbHeaders(),
      body: JSON.stringify(args),
    });

    if (!res.ok) {
      throw {
        message: "Supabase RPC failed",
        fnName,
        url,
        status: res.status,
        body: safeJsonParse(res.responseText) ?? res.responseText,
      };
    }

    const data = safeJsonParse(res.responseText);
    if (!Array.isArray(data)) return [];
    return data;
  }

  // ============================================================
  // DOM helpers
  // ============================================================
  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    Object.assign(node, props);
    if (props.style) Object.assign(node.style, props.style);
    for (const c of children) node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    return node;
  }

  function btn(label, onClick, extraStyle = {}) {
    return el(
      "button",
      {
        type: "button",
        textContent: label,
        onclick: onClick,
        style: {
          padding: "6px 10px",
          borderRadius: "8px",
          border: "1px solid #ccc",
          background: "#fafafa",
          cursor: "pointer",
          ...extraStyle,
        },
      },
      []
    );
  }

  function badge(text, extraStyle = {}) {
    return el("span", {
      textContent: text,
      style: {
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: "999px",
        border: "1px solid #ddd",
        background: "#f7f7f7",
        fontSize: "12px",
        ...extraStyle,
      },
    });
  }

  function hr() {
    return el("div", { style: { height: "1px", background: "#eee", margin: "10px 0" } });
  }

  function table(headers, rows) {
    const thead = el("thead", {}, [
      el("tr", {}, headers.map((h) => el("th", { textContent: h, style: { textAlign: "left", padding: "8px", borderBottom: "1px solid #eee", fontSize: "12px", color: "#555" } }))),
    ]);

    const tbody = el(
      "tbody",
      {},
      rows.map((r) =>
        el(
          "tr",
          {},
          r.map((cell) =>
            el("td", {
              style: { padding: "8px", borderBottom: "1px solid #f2f2f2", verticalAlign: "top", fontSize: "13px" },
              ...(cell && cell.__isNode ? {} : {}),
            }, cell && cell.__isNode ? [cell] : [String(cell ?? "")])
          )
        )
      )
    );

    return el("table", { style: { width: "100%", borderCollapse: "collapse" } }, [thead, tbody]);
  }

  function asNode(n) {
    n.__isNode = true;
    return n;
  }

  // ============================================================
  // State
  // ============================================================
  const state = {
    windowDays: DEFAULTS.WINDOW_DAYS,
    gracePastDays: DEFAULTS.GRACE_PAST_DAYS,
    gapMinDays: DEFAULTS.GAP_MIN_DAYS,
    gapMaxDays: DEFAULTS.GAP_MAX_DAYS,
    lowDays: DEFAULTS.LOW_DAYS,

    includeUnit: DEFAULTS.INCLUDE_UNIT,
    minKg: DEFAULTS.MIN_KG,
    minL: DEFAULTS.MIN_L,
    minUnit: DEFAULTS.MIN_UNIT,

    limit: DEFAULTS.LIMIT,

    expandedKey: null, // group|category|unit
    expandedTab: "sku", // 'sku' | 'customers'
    expandedSku: null, // sku currently expanded inside breakdown
  };

  // ============================================================
  // UI Root
  // ============================================================
  const root = el("div", { id: "anipet-buyer-shortages-root", style: UI.ROOT_STYLE });
  const header = el("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" } }, [
    el("div", { style: { display: "flex", flexDirection: "column", gap: "2px" } }, [
      el("div", { textContent: "AniPet · Buyer Shortages (from events)", style: { fontWeight: "700", fontSize: "14px" } }),
      el("div", { textContent: "סיכום לפי קבוצה+קטגוריה → פירוק SKU → לקוחות", style: { fontSize: "12px", color: "#666" } }),
    ]),
    btn("✕", () => root.remove(), { background: "#fff" }),
  ]);

  const controls = el("div", { style: { marginTop: "10px", display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: "8px", alignItems: "end" } });

  function labeledInput(label, inputNode) {
    return el("div", { style: { gridColumn: "span 3", display: "flex", flexDirection: "column", gap: "4px" } }, [
      el("div", { textContent: label, style: { fontSize: "12px", color: "#555" } }),
      inputNode,
    ]);
  }

  function mkSelect(options, value, onChange) {
    const s = el("select", { style: { padding: "6px 8px", borderRadius: "8px", border: "1px solid #ccc", background: "#fff" } });
    for (const opt of options) {
      const o = el("option", { value: String(opt.value), textContent: opt.label });
      if (String(opt.value) === String(value)) o.selected = true;
      s.appendChild(o);
    }
    s.onchange = () => onChange(s.value);
    return s;
  }

  function mkNumber(value, onChange) {
    const i = el("input", {
      type: "number",
      value: String(value),
      min: "0",
      step: "1",
      style: { padding: "6px 8px", borderRadius: "8px", border: "1px solid #ccc", background: "#fff" },
    });
    i.onchange = () => onChange(i.value);
    return i;
  }

  function mkToggle(checked, onChange) {
    const i = el("input", { type: "checkbox", checked });
    i.onchange = () => onChange(i.checked);
    return i;
  }

  controls.appendChild(
    labeledInput(
      "טווח קדימה (ימים)",
      mkSelect(
        [
          { label: "7", value: 7 },
          { label: "14", value: 14 },
          { label: "30", value: 30 },
          { label: "60", value: 60 },
          { label: "90", value: 90 },
        ],
        state.windowDays,
        (v) => {
          state.windowDays = parseInt(v, 10) || 0;
          refresh();
        }
      )
    )
  );

  controls.appendChild(
    labeledInput(
      "חסד אחורה (ימים)",
      mkSelect(
        [
          { label: "0", value: 0 },
          { label: "3", value: 3 },
          { label: "7", value: 7 },
          { label: "14", value: 14 },
        ],
        state.gracePastDays,
        (v) => {
          state.gracePastDays = parseInt(v, 10) || 0;
          refresh();
        }
      )
    )
  );

  controls.appendChild(
    labeledInput("רציפות מינימום (ימים)", mkNumber(state.gapMinDays, (v) => {
      state.gapMinDays = parseInt(v, 10) || 0;
      refresh();
    }))
  );

  controls.appendChild(
    labeledInput("רציפות מקסימום (ימים)", mkNumber(state.gapMaxDays, (v) => {
      state.gapMaxDays = parseInt(v, 10) || 0;
      refresh();
    }))
  );

  controls.appendChild(
    labeledInput("LOW עד (ימים קדימה)", mkNumber(state.lowDays, (v) => {
      state.lowDays = parseInt(v, 10) || 0;
      refresh();
    }))
  );

  // NOTE: label text here is static; functional toggle is correct.
  controls.appendChild(
    labeledInput(
      "כולל יחידות (unit)?",
      el("label", { style: { display: "flex", gap: "8px", alignItems: "center", padding: "6px 8px", border: "1px solid #ccc", borderRadius: "8px" } }, [
        mkToggle(state.includeUnit, (b) => {
          state.includeUnit = !!b;
          refresh();
        }),
        el("span", { textContent: state.includeUnit ? "כן" : "לא", style: { fontSize: "12px", color: "#333" } }),
      ])
    )
  );

  controls.appendChild(
    labeledInput("מינימום ק״ג", mkNumber(state.minKg, (v) => {
      state.minKg = toNum(v, 0);
      refresh();
    }))
  );

  controls.appendChild(
    labeledInput("מינימום ליטר", mkNumber(state.minL, (v) => {
      state.minL = toNum(v, 0);
      refresh();
    }))
  );

  controls.appendChild(
    labeledInput("מינימום יחידות", mkNumber(state.minUnit, (v) => {
      state.minUnit = toNum(v, 0);
      refresh();
    }))
  );

  controls.appendChild(
    labeledInput("Limit", mkNumber(state.limit, (v) => {
      state.limit = parseInt(v, 10) || 0;
      refresh();
    }))
  );

  const statusLine = el("div", { style: { marginTop: "10px", fontSize: "12px", color: "#666", display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" } });
  const main = el("div", { style: { marginTop: "10px" } });

  root.appendChild(header);
  root.appendChild(controls);
  root.appendChild(statusLine);
  root.appendChild(hr());
  root.appendChild(main);
  document.documentElement.appendChild(root);

  // ============================================================
  // Render helpers
  // ============================================================
  function keyOf(row) {
    return [row.group_key, row.category_key, row.unit_key].map((x) => String(x ?? "")).join("|");
  }

  function setStatus(text, kind = "info") {
    statusLine.innerHTML = "";
    const pill =
      kind === "err"
        ? badge("שגיאה", { background: "#fee", borderColor: "#fbb", color: "#900" })
        : badge("סטטוס", { background: "#eef6ff", borderColor: "#cfe3ff", color: "#045" });

    statusLine.appendChild(pill);
    statusLine.appendChild(el("span", { textContent: text }));
  }

  function renderTabs(container, tabs, activeKey, onPick) {
    const bar = el("div", { style: { display: "flex", gap: "8px", alignItems: "center", margin: "8px 0" } });
    for (const t of tabs) {
      const b = btn(t.label, () => onPick(t.key), {
        background: t.key === activeKey ? "#111" : "#fafafa",
        color: t.key === activeKey ? "#fff" : "#111",
        borderColor: t.key === activeKey ? "#111" : "#ccc",
      });
      bar.appendChild(b);
    }
    container.appendChild(bar);
  }

  // ============================================================
  // Data fetchers
  // ============================================================
  async function fetchCategorySummary() {
    const args = {
      p_window_days: state.windowDays,
      p_limit: state.limit,
      p_include_unit: !!state.includeUnit,
      p_min_kg: state.minKg,
      p_min_l: state.minL,
      p_min_unit: state.minUnit,
      p_grace_past_days: state.gracePastDays,
      p_gap_min_days: state.gapMinDays,
      p_gap_max_days: state.gapMaxDays,
      p_low_days: state.lowDays,
    };

    try {
      return await sbRpc(RPC.CATEGORY_SUMMARY, args);
    } catch (e) {
      const isTimeout =
        e?.body?.code === "57014" ||
        String(e?.body?.message || "").includes("statement timeout");
      if (!isTimeout) throw e;

      const args2 = { ...args };
      args2.p_window_days = Math.min(args2.p_window_days, 14);
      args2.p_grace_past_days = Math.min(args2.p_grace_past_days, 3);
      args2.p_limit = Math.min(args2.p_limit, 120);

      setStatus("השרת חנק (timeout) — מנסה חלון מצומצם אוטומטית…");
      return await sbRpc(RPC.CATEGORY_SUMMARY, args2);
    }
  }

  async function fetchCategorySkuBreakdown(groupKey, categoryKey, unitKey) {
    return sbRpc(RPC.CATEGORY_SKU_BREAKDOWN, {
      p_group_key: String(groupKey),
      p_category_key: String(categoryKey),
      p_unit_key: String(unitKey),
      p_window_days: state.windowDays,
      p_grace_past_days: state.gracePastDays,
      p_gap_min_days: state.gapMinDays,
      p_gap_max_days: state.gapMaxDays,
      p_low_days: state.lowDays,
      p_limit: state.limit,
    });
  }

  async function fetchCategoryCustomersRollup(groupKey, categoryKey, unitKey) {
    return sbRpc(RPC.CATEGORY_CUSTOMERS_ROLLUP, {
      p_group_key: String(groupKey),
      p_category_key: String(categoryKey),
      p_unit_key: String(unitKey),
      p_window_days: state.windowDays,
      p_grace_past_days: state.gracePastDays,
      p_min_unit: (unitKey === "kg" ? state.minKg : unitKey === "l" ? state.minL : state.minUnit),
    });
  }

  async function fetchSkuCustomers(sku, unitKey) {
    return sbRpc(RPC.SKU_CUSTOMERS, {
      p_sku: String(sku),
      p_unit_key: String(unitKey),
      p_window_days: state.windowDays,
      p_grace_past_days: state.gracePastDays,
      p_gap_min_days: state.gapMinDays,
      p_gap_max_days: state.gapMaxDays,
      p_low_days: state.lowDays,
      p_limit: state.limit,
    });
  }

  // ============================================================
  // Main render
  // ============================================================
  async function refresh() {
    main.innerHTML = "";
    setStatus("טוען נתונים…");

    let rows;
    try {
      rows = await fetchCategorySummary();
    } catch (e) {
      console.error(e);
      setStatus(`${e.message || "שגיאה"} · ${e.fnName || ""} · ${e.status || ""}`, "err");
      const pre = el("pre", { textContent: JSON.stringify(e, null, 2), style: { whiteSpace: "pre-wrap", fontSize: "12px", background: "#fff7f7", border: "1px solid #f3caca", padding: "10px", borderRadius: "8px" } });
      main.appendChild(pre);
      return;
    }

    setStatus(
      `חלון: קדימה ${state.windowDays} · אחורה ${state.gracePastDays} | רציפות ${state.gapMinDays}–${state.gapMaxDays} | LOW עד ${state.lowDays} | kg/l בלבד: ${state.includeUnit ? "לא" : "כן"} | שורות: ${rows.length}`
    );

    if (!rows.length) {
      main.appendChild(el("div", { textContent: "אין תוצאות לפי המסננים הנוכחיים.", style: { padding: "8px", color: "#666" } }));
      return;
    }

    const wrap = el("div", {});
    for (const r of rows) {
      const k = keyOf(r);
      const isOpen = state.expandedKey === k;

      const topLine = el("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", padding: "8px 10px", border: "1px solid #eee", borderRadius: "10px", marginBottom: "8px" } }, [
        el("div", { style: { display: "flex", flexDirection: "column", gap: "3px" } }, [
          el("div", { style: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" } }, [
            badge(`קבוצה: ${r.group_key}`),
            badge(`קטגוריה: ${r.category_key}`),
            badge(`יחידה: ${r.unit_key}`),
          ]),
          el("div", { style: { display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", fontSize: "13px" } }, [
            badge(`CRIT: ${r.buyer_crit_customers}`, { background: "#fee", borderColor: "#fbb", color: "#900" }),
            badge(`LOW: ${r.buyer_low_customers}`, { background: "#fff5e6", borderColor: "#ffd7a8", color: "#7a3d00" }),
            badge(`HOT: ${r.hot_customers}`, { background: "#eef6ff", borderColor: "#cfe3ff", color: "#045" }),
            el("span", { textContent: `סה״כ אחרון: ${fmtNum(r.qty_sum_last_unit)} ${r.unit_key}`, style: { color: "#111" } }),
            el("span", { textContent: `תאריך קרוב: ${fmtDate(r.nearest_due_date)} (מינ' ימים: ${r.min_days_until_due})`, style: { color: "#333" } }),
          ]),
        ]),
        btn(isOpen ? "סגור" : "פתח", async () => {
          state.expandedKey = isOpen ? null : k;
          state.expandedTab = "sku";
          state.expandedSku = null;
          await refresh();
        }),
      ]);

      wrap.appendChild(topLine);

      if (isOpen) {
        const panel = el("div", { style: { marginBottom: "14px", padding: "10px", border: "1px solid #eee", borderRadius: "10px", background: "#fcfcfc" } });

        renderTabs(panel, [
          { key: "sku", label: "פירוק לפי SKU" },
          { key: "customers", label: "לקוחות לפי קטגוריה" },
        ], state.expandedTab, async (tabKey) => {
          state.expandedTab = tabKey;
          state.expandedSku = null;
          await refresh();
        });

        if (state.expandedTab === "sku") {
          panel.appendChild(el("div", { textContent: "טוען פירוק SKU…", style: { fontSize: "12px", color: "#666" } }));
          wrap.appendChild(panel);

          try {
            const skus = await fetchCategorySkuBreakdown(r.group_key, r.category_key, r.unit_key);
            panel.innerHTML = "";
            renderTabs(panel, [
              { key: "sku", label: "פירוק לפי SKU" },
              { key: "customers", label: "לקוחות לפי קטגוריה" },
            ], state.expandedTab, async (tabKey) => {
              state.expandedTab = tabKey;
              state.expandedSku = null;
              await refresh();
            });

            if (!skus.length) {
              panel.appendChild(el("div", { textContent: "אין SKUs לפי המסננים.", style: { padding: "6px", color: "#666" } }));
            } else {
              const rows2 = skus.map((s) => {
                const skuOpen = state.expandedSku === String(s.sku);
                const openBtn = btn(skuOpen ? "סגור לקוחות" : "לקוחות", async () => {
                  state.expandedSku = skuOpen ? null : String(s.sku);
                  await refresh();
                });

                const name = s.product_name || s.name || s.sku;
                return [
                  asNode(el("div", { style: { display: "flex", flexDirection: "column", gap: "2px" } }, [
                    el("div", { textContent: String(name), style: { fontWeight: "600" } }),
                    el("div", { textContent: `SKU: ${s.sku}`, style: { fontSize: "12px", color: "#666" } }),
                  ])),
                  asNode(el("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" } }, [
                    badge(`CRIT ${s.buyer_crit_customers ?? 0}`, { background: "#fee", borderColor: "#fbb", color: "#900" }),
                    badge(`LOW ${s.buyer_low_customers ?? 0}`, { background: "#fff5e6", borderColor: "#ffd7a8", color: "#7a3d00" }),
                    badge(`HOT ${s.hot_customers ?? 0}`, { background: "#eef6ff", borderColor: "#cfe3ff", color: "#045" }),
                  ])),
                  `${fmtNum(s.qty_sum_last_unit)} ${r.unit_key}`,
                  fmtDate(s.nearest_due_date),
                  String(s.min_days_until_due ?? ""),
                  asNode(openBtn),
                ];
              });

              panel.appendChild(
                table(
                  ["מוצר", "לקוחות", "סה״כ אחרון", "Due", "min days", ""],
                  rows2
                )
              );

              if (state.expandedSku) {
                panel.appendChild(hr());
                panel.appendChild(el("div", { textContent: `טוען לקוחות ל־SKU ${state.expandedSku}…`, style: { fontSize: "12px", color: "#666" } }));

                try {
                  const cust = await fetchSkuCustomers(state.expandedSku, r.unit_key);
                  panel.lastChild.remove();

                  if (!cust.length) {
                    panel.appendChild(el("div", { textContent: "אין לקוחות ל־SKU הזה לפי המסננים.", style: { padding: "6px", color: "#666" } }));
                  } else {
                    const custRows = cust.map((c) => {
                      const packs = c.total_packs ?? c.total_qty_pack ?? "";
                      const unit = c.total_unit ?? c.total_qty_unit ?? "";
                      return [
                        c.customer_phone_raw ?? c.customer_phone ?? c.customer_key ?? "",
                        c.customer_name ?? "",
                        fmtDate(c.last_order_date ?? c.last_event_date),
                        String(packs),
                        `${fmtNum(unit)} ${r.unit_key}`,
                        fmtDate(c.due_date_est ?? c.due_date),
                        String(c.dos_days_est ?? c.dos_days ?? ""),
                      ];
                    });

                    panel.appendChild(
                      table(
                        ["טלפון", "שם", "הזמנה אחרונה", "שקים", "סה״כ יחידה", "Due", "DOS"],
                        custRows
                      )
                    );
                  }
                } catch (e2) {
                  console.error(e2);
                  panel.appendChild(el("pre", {
                    textContent: JSON.stringify(e2, null, 2),
                    style: { whiteSpace: "pre-wrap", fontSize: "12px", background: "#fff7f7", border: "1px solid #f3caca", padding: "10px", borderRadius: "8px" }
                  }));
                }
              }
            }
          } catch (e1) {
            console.error(e1);
            panel.innerHTML = "";
            panel.appendChild(el("pre", {
              textContent: JSON.stringify(e1, null, 2),
              style: { whiteSpace: "pre-wrap", fontSize: "12px", background: "#fff7f7", border: "1px solid #f3caca", padding: "10px", borderRadius: "8px" }
            }));
          }
        } else {
          panel.appendChild(el("div", { textContent: "טוען לקוחות לפי קטגוריה…", style: { fontSize: "12px", color: "#666" } }));
          wrap.appendChild(panel);

          try {
            const cust = await fetchCategoryCustomersRollup(r.group_key, r.category_key, r.unit_key);

            panel.innerHTML = "";
            renderTabs(panel, [
              { key: "sku", label: "פירוק לפי SKU" },
              { key: "customers", label: "לקוחות לפי קטגוריה" },
            ], state.expandedTab, async (tabKey) => {
              state.expandedTab = tabKey;
              state.expandedSku = null;
              await refresh();
            });

            if (!cust.length) {
              panel.appendChild(el("div", { textContent: "אין לקוחות לפי קטגוריה לפי המסננים.", style: { padding: "6px", color: "#666" } }));
            } else {
              const rows3 = cust.map((c) => [
                c.customer_phone_raw ?? c.customer_phone ?? c.customer_key ?? "",
                c.customer_name ?? "",
                String(c.total_packs ?? ""),
                `${fmtNum(c.total_unit)} ${r.unit_key}`,
                fmtDate(c.last_order_date ?? c.last_event_date),
                c.top_skus ?? "",
              ]);

              panel.appendChild(
                table(
                  ["טלפון", "שם", "שקים", "סה״כ יחידה", "אחרון", "Top SKUs"],
                  rows3
                )
              );

              panel.appendChild(el("div", {
                textContent: "המסך הזה הוא בדיוק ה־rollup: כמה שקים וכמה ק״ג/ליטר ללקוח בתוך הקטגוריה.",
                style: { marginTop: "8px", fontSize: "12px", color: "#666" }
              }));
            }
          } catch (e3) {
            console.error(e3);
            panel.innerHTML = "";
            panel.appendChild(el("pre", {
              textContent: JSON.stringify(e3, null, 2),
              style: { whiteSpace: "pre-wrap", fontSize: "12px", background: "#fff7f7", border: "1px solid #f3caca", padding: "10px", borderRadius: "8px" }
            }));
          }
        }

        wrap.appendChild(panel);
      }
    }

    main.appendChild(wrap);
  }

  refresh();
})();
