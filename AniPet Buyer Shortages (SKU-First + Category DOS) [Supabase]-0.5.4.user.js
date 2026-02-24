// ==UserScript==
// @name         AniPet Buyer Shortages (SKU-First + Category DOS) [Supabase]
// @namespace    anipet.buyer
// @version      0.5.4
// @description  Buyer-first SKU view based on Category DOS. Includes Detective Info Button.
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

  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFncXBqbHViZHZ4Znp4anRvY3JoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMjc1MTcsImV4cCI6MjA4NDcwMzUxN30.UBsJrTtys9Sf8u2q3Jm3Y2uLrq64NsnHP-D8irDgCLs";

  const RPC = {
    CATEGORY_SUMMARY: "buyer_category_summary_by_window_from_events",
    CATEGORY_SKU_BREAKDOWN: "buyer_category_sku_breakdown_by_window_from_events",
    CATEGORY_CUSTOMERS_ROLLUP: "buyer_customer_category_rollup_by_window",
    SKU_CUSTOMERS: "buyer_sku_customers_by_window_from_events",
    SKU_SHORTAGES_MAIN: "buyer_sku_shortages_based_on_category",
    SKU_SHORTAGES_DRILLDOWN_STEP1: "buyer_sku_shortages_drilldown_step1_base",
    RAW_NAMES: "buyer_sku_shortages_raw_names",
    RAW_ORDERS_SINGLE: "buyer_sku_shortages_raw_orders_single",
  };

  const DEFAULTS = {
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

  function fmtDate(d) {
    if (!d) return "";
    return String(d);
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
              style: { padding: "8px", borderBottom: "1px solid #f2f2f2", verticalAlign: "middle", fontSize: "13px" },
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

  const state = {
    limit: DEFAULTS.LIMIT,
    expandedKey: null,
  };

  const root = el("div", { id: "anipet-buyer-shortages-root", style: UI.ROOT_STYLE });

  const header = el("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" } }, [
    el("div", { style: { display: "flex", flexDirection: "column", gap: "2px" } }, [
      el("div", { textContent: "AniPet · Buyer Shortages (SKU-First / Category DOS)", style: { fontWeight: "700", fontSize: "14px" } }),
      el("div", { textContent: "סיכום מבוסס מוצר → חריגות כמות ושימור לקוחות", style: { fontSize: "12px", color: "#666" } }),
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

  controls.appendChild(
    labeledInput("Limit (מוצרים)", mkNumber(state.limit, (v) => {
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

  function setStatus(text, kind = "info") {
    statusLine.innerHTML = "";
    const pill =
      kind === "err"
        ? badge("שגיאה", { background: "#fee", borderColor: "#fbb", color: "#900" })
        : badge("סטטוס", { background: "#eef6ff", borderColor: "#cfe3ff", color: "#045" });

    statusLine.appendChild(pill);
    statusLine.appendChild(el("span", { textContent: text }));
  }

  async function fetchSkuShortagesMain() {
    return await sbRpc(RPC.SKU_SHORTAGES_MAIN, { p_category_key: null, p_limit: state.limit });
  }

  async function fetchSkuShortagesDrilldown(recommend_sku) {
    try {
      const users = await sbRpc(RPC.SKU_SHORTAGES_DRILLDOWN_STEP1, {
        p_recommend_sku: String(recommend_sku).trim(),
        p_category_key: null,
        p_limit: state.limit
      });

      if (!users || users.length === 0) return [];
      const phones = users.map(u => u.p9);
      const cat = users[0].category_key;

      let namesRaw = [];
      let namesError = false;
      try {
        namesRaw = await sbRpc(RPC.RAW_NAMES, { p_phones: phones });
      } catch(e) { namesError = true; }

      let ordersRaw = [];
      let ordersError = false;
      try {
        const orderPromises = phones.map(async (phone) => {
          try {
            const res = await sbRpc(RPC.RAW_ORDERS_SINGLE, { p_phone: phone, p_category: cat });
            return res.map(r => ({ p9: phone, o_date: r.o_date, qty: r.qty }));
          } catch (err) {
            ordersError = true;
            return [];
          }
        });

        const resultsArray = await Promise.all(orderPromises);
        ordersRaw = resultsArray.flat();
      } catch(e) {
        ordersError = true;
      }

      const nameMap = {};
      for (const n of namesRaw) nameMap[n.p9] = n.c_name;

      const ordersMap = {};
      for (const o of ordersRaw) {
        if (!ordersMap[o.p9]) ordersMap[o.p9] = [];
        ordersMap[o.p9].push({ date: new Date(o.o_date), qty: Number(o.qty) });
      }

      return users.map(u => {
        const p9 = u.p9;
        const c_name = namesError ? "שגיאת שליפת שם" : (nameMap[p9] || 'לקוח לא ידוע');

        let last_o_date = null;
        let last_qty = 0;
        let avg_past_qty = 0;
        let anomaly_flag = ordersError ? "שגיאת תקשורת" : "NORMAL";
        let qty_diff = 0;

        if (!ordersError) {
          let userOrders = ordersMap[p9] || [];
          userOrders.sort((a,b) => b.date - a.date);

          if (userOrders.length > 0) {
            last_o_date = userOrders[0].date.toISOString().split('T')[0];
            last_qty = userOrders[0].qty;

            let pastOrders = userOrders.slice(1, 4);
            if (pastOrders.length > 0) {
              let sum = 0;
              for (const po of pastOrders) sum += po.qty;
              avg_past_qty = sum / pastOrders.length;

              if (last_qty <= avg_past_qty * 0.85) anomaly_flag = "QTY_DROP";
              else if (last_qty >= avg_past_qty * 1.15) anomaly_flag = "QTY_SPIKE";
            } else {
              avg_past_qty = last_qty;
            }
            qty_diff = last_qty - avg_past_qty;
          }
        }

        return {
          ...u,
          customer_name: c_name,
          actual_last_order_date: last_o_date,
          anomaly_flag,
          qty_diff: Number(qty_diff.toFixed(2)),
          last_qty: Number(last_qty.toFixed(2)),
          avg_past_qty: Number(avg_past_qty.toFixed(2))
        };
      });

    } catch (e) {
      console.error("Drilldown Fetch Error:", e);
      throw e;
    }
  }

  async function refresh() {
    main.innerHTML = "";
    setStatus("טוען מוצרים להזמנה (מבוסס צריכת קטגוריה)...");

    let skus;
    try {
      skus = await fetchSkuShortagesMain();
    } catch (e) {
      console.error(e);
      setStatus(`שגיאה בטעינת נתונים`, "err");
      main.appendChild(el("pre", { textContent: JSON.stringify(e, null, 2), style: { whiteSpace: "pre-wrap", fontSize: "12px", background: "#fff7f7", border: "1px solid #f3caca", padding: "10px", borderRadius: "8px" } }));
      return;
    }

    setStatus(`מציג ${skus.length} מוצרים דחופים | כולל זיהוי ירידת/עליית כמות לקוח`);
    if (!skus.length) {
      main.appendChild(el("div", { textContent: "אין מוצרים דחופים להזמנה כרגע.", style: { padding: "8px", color: "#666" } }));
      return;
    }

    const wrap = el("div", {});
    for (const s of skus) {
      const isOpen = state.expandedKey === s.recommend_sku;
      const topLine = el("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", padding: "8px 10px", border: "1px solid #eee", borderRadius: "10px", marginBottom: "8px", background: isOpen ? "#f0f7ff" : "#fff" } }, [
        el("div", { style: { display: "flex", flexDirection: "column", gap: "3px" } }, [
          el("div", { style: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" } }, [
            el("span", { textContent: s.product_name || "שם מוצר חסר", style: { fontWeight: "bold", fontSize: "14px" } }),
            badge(`SKU: ${s.recommend_sku}`),
            badge(`קטגוריה: ${s.category_key}`),
          ]),
          el("div", { style: { display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", fontSize: "13px", marginTop: "4px" } }, [
            badge(`לקוחות CRIT: ${s.buyer_crit_customers}`, { background: "#fee", borderColor: "#fbb", color: "#900" }),
            badge(`לקוחות LOW: ${s.buyer_low_customers}`, { background: "#fff5e6", borderColor: "#ffd7a8", color: "#7a3d00" }),
            el("span", { textContent: `סה"כ דחופים: ${s.hot_customers}`, style: { color: "#111", fontWeight: "600" } }),
            el("span", { textContent: `| תאריך קרוב: ${fmtDate(s.nearest_due_date)}`, style: { color: "#333" } }),
          ]),
        ]),
        btn(isOpen ? "סגור לקוחות" : "הצג לקוחות", async () => {
          state.expandedKey = isOpen ? null : s.recommend_sku;
          await refresh();
        }, { fontWeight: "bold" }),
      ]);
      wrap.appendChild(topLine);

      if (isOpen) {
        const panel = el("div", { style: { marginBottom: "14px", padding: "10px", border: "1px solid #cfe3ff", borderRadius: "10px", background: "#fcfcfc", marginLeft: "20px" } });
        panel.appendChild(el("div", { textContent: "טוען לקוחות...", style: { fontSize: "12px", color: "#666" } }));
        wrap.appendChild(panel);

        try {
          const customers = await fetchSkuShortagesDrilldown(s.recommend_sku);
          panel.innerHTML = "";
          if (!customers.length) {
            panel.appendChild(el("div", { textContent: "לא נמצאו לקוחות דחופים למוצר זה.", style: { padding: "6px", color: "#666" } }));
          } else {
            const custRows = customers.map((c) => {
              const urgencyColor = c.dos_bucket === "CRIT" ? "#900" : "#7a3d00";
              const urgencyBg = c.dos_bucket === "CRIT" ? "#fee" : "#fff5e6";

              let anomalyBadge = "";
              if (c.anomaly_flag === "QTY_DROP") {
                anomalyBadge = badge(`חסר ${Math.abs(c.qty_diff)} (קנה ${c.last_qty} במקום ${c.avg_past_qty})`, { background: "#fff0f0", color: "#d00", borderColor: "#fcc" });
              } else if (c.anomaly_flag === "QTY_SPIKE") {
                anomalyBadge = badge(`עודף ${Math.abs(c.qty_diff)} (קנה ${c.last_qty} במקום ${c.avg_past_qty})`, { background: "#f0fdf4", color: "#006400", borderColor: "#bbf7d0" });
              } else if (c.anomaly_flag === "שגיאת תקשורת") {
                anomalyBadge = badge("שגיאת שליפה", { background: "#fee", color: "#900", borderColor: "#fbb" });
              } else {
                anomalyBadge = badge("יציב", { background: "#f8fafc", color: "#999", borderColor: "#eee" });
              }

              // --- כפתור הבלש ---
              const dateCell = el("div", { style: { display: "flex", alignItems: "center", gap: "6px" } });
              dateCell.appendChild(el("span", { textContent: fmtDate(c.actual_last_order_date) }));

              const infoBtn = el("span", {
                  textContent: "ℹ️",
                  title: "לחץ לפירוט פריטי ההזמנות האחרונות",
                  style: { cursor: "pointer", fontSize: "14px", padding: "2px", userSelect: "none" }
              });

              infoBtn.onclick = async () => {
                  infoBtn.textContent = "⏳"; // אייקון טעינה
                  try {
                      // יצירת בקשת REST API ישירות דרך gmFetch
                      const cat = encodeURIComponent(c.category_key);
                      const p9 = (c.customer_phone || "").slice(-9);
                      const url = `${SUPABASE_URL}/rest/v1/v_orders_items_norm?select=order_date,item_name,qty_pack&consumption_category=eq.${cat}&customer_key=like.*${p9}&order=order_date.desc&limit=10`;

                      const res = await gmFetch(url, { method: "GET", headers: sbHeaders() });
                      if (!res.ok) throw new Error("Failed fetching history");

                      const data = JSON.parse(res.responseText);
                      if (!data || data.length === 0) {
                          alert("לא נמצאו פריטים קודמים בקטגוריה זו.");
                          return;
                      }

                      // עיצוב התוצאות
                      const details = data.map(d => `📅 ${d.order_date} | ${d.item_name} (${d.qty_pack} ק"ג)`).join('\n');
                      alert(`📦 פירוט הזמנות אחרונות ללקוח ${c.customer_name}:\n\n${details}`);

                  } catch(err) {
                      console.error("Info Button Error:", err);
                      alert("שגיאה בשליפת הנתונים מסופאבייס.");
                  } finally {
                      infoBtn.textContent = "ℹ️"; // חזרה לאייקון רגיל
                  }
              };

              dateCell.appendChild(infoBtn);
              // --- סוף כפתור הבלש ---

              return [
                c.customer_phone || "",
                c.customer_name || "לא ידוע",
                asNode(badge(c.category_key)),
                asNode(dateCell), // הכנסת התא החדש עם הכפתור
                asNode(anomalyBadge),
                asNode(badge(c.dos_bucket, { background: urgencyBg, color: urgencyColor, borderColor: "transparent" })),
                fmtDate(c.next_expected_date),
                String(c.order_days_180d ?? "")
              ];
            });

            panel.appendChild(
              table(
                ["טלפון", "שם לקוח", "קטגוריה", "הזמנה אחרונה", "מגמת כמות בקטגוריה", "דחיפות", "צפי סיום", "הזמנות (חצי שנה)"],
                custRows
              )
            );
          }
        } catch (e2) {
          console.error(e2);
          panel.innerHTML = "";
          panel.appendChild(el("pre", {
            textContent: JSON.stringify(e2, null, 2),
            style: { whiteSpace: "pre-wrap", fontSize: "12px", background: "#fff7f7", border: "1px solid #f3caca", padding: "10px", borderRadius: "8px" }
          }));
        }
      }
    }

    main.appendChild(wrap);
  }

  refresh();
})();