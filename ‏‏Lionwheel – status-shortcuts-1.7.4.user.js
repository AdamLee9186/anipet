// ==UserScript==
// @name         Lionwheel – כפתורי סטטוס
// @namespace    https://adam-lee.tools/userscripts
// @version      1.7.4
// @description  מוסיף ב-Offcanvas של Lionwheel שלושה כפתורים עם SVG בצבעים קבועים: וי ירוק, חצי־וי כתום, איקס אדום. פעולות: וי — אושר → נהג ברירת מחדל (ניתן לבחירה) → לוקט → פתיחת מודל חבילות; חצי־וי — בהעברה → לוקט חלקית → פתיחת חלונית ליקוט; איקס — בהעברה → המתנה. יוצר: Adam Lee
// @author       Adam Lee
// @match        https://members.lionwheel.com/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function () {
  "use strict";

  /** ================= SVGs (fill אינליין כדי שלא יידרס) ================= */
  const SVG_GREEN_CHECK = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true" focusable="false">
  <path fill="#2e7d32" d="M320,112c114.9,0,208,93.1,208,208s-93.1,208-208,208-208-93.1-208-208,93.1-208,208-208ZM320,576c141.4,0,256-114.6,256-256S461.4,64,320,64,64,178.6,64,320s114.6,256,256,256ZM404.4,276.7c7-11.2,3.6-26-7.6-33.1-11.2-7.1-26-3.6-33.1,7.6l-61.4,98.3-27-36c-8-10.6-23-12.8-33.6-4.8-10.6,8-12.8,23-4.8,33.6l48,64c4.7,6.3,12.3,9.9,20.2,9.6,7.9-.3,15.1-4.5,19.3-11.3l80-128v.1Z"/>
</svg>`.trim();

  const SVG_ORANGE_HALF = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true" focusable="false">
  <path fill="#ff9800" d="M245.23,345.02c-13.6-.24-24.55-11.33-24.56-24.99,0-13.81,11.18-25,24.99-25.01l148.66-.06c.15,0,.3,0,.45,0,13.6.24,24.55,11.33,24.56,24.99,0,13.81-11.18,25-24.99,25.01l-148.66.06c-.15,0-.3,0-.45,0Z"/>
  <path fill="#ff9800" d="M320,112c114.9,0,208,93.1,208,208s-93.1,208-208,208-208-93.1-208-208,93.1-208,208-208ZM320,576c141.4,0,256-114.6,256-256S461.4,64,320,64,64,178.6,64,320s114.6,256,256,256Z"/>
</svg>`.trim();

  // SVG איקס אדום בעיגול (X אמיתי)
  const SVG_RED_X = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true" focusable="false">
  <path fill="#e53935" d="M320,112c114.9,0,208,93.1,208,208s-93.1,208-208,208-208-93.1-208-208,93.1-208,208-208ZM320,576c141.4,0,256-114.6,256-256S461.4,64,320,64,64,178.6,64,320s114.6,256,256,256ZM231,231c-9.4,9.4-9.4,24.6,0,33.9l55,55-55,55c-9.4,9.4-9.4,24.6,0,33.9,9.4,9.3,24.6,9.4,33.9,0l55-55,55,55c9.4,9.4,24.6,9.4,33.9,0,9.3-9.4,9.4-24.6,0-33.9l-55-55,55-55c9.4-9.4,9.4-24.6,0-33.9-9.4-9.3-24.6-9.4-33.9,0l-55,55-55-55c-9.4-9.4-24.6-9.4-33.9,0Z"/>
</svg>`.trim();

  /** ======================= Styles ======================= */
  const style = document.createElement("style");
  style.textContent = `
    .lw-quick-wrapper{
      direction: rtl;
      display:inline-flex;
      align-items:center;
      gap:8px;
      margin-inline:8px;
    }
    .lw-quick-btn{
      background:transparent !important;
      border:none !important;
      padding:0;
      margin:0;
      cursor:pointer;
      line-height:1;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      transition:transform .06s ease, opacity .15s ease;
    }
    .lw-quick-btn:active{ transform:scale(0.96); }
    .lw-quick-btn svg{ width:40px; height:40px; display:block; } /* הוגדל מעט */
    .lw-quick-btn[disabled]{ opacity:.6; cursor:not-allowed; }
  `;
  document.head.appendChild(style);

  /** ============================= Helpers ============================= */
  const $jq = window.jQuery || window.$;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const qs = (s, r = document) => r.querySelector(s);
  const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));

  // === Driver persistence helpers ===
  const ANIPET_DRIVER_ID = 26055;
  const ANIPET_DRIVER_NAME = "אניפט שליחויות";

  // ===== Default-driver storage (Tampermonkey) =====
  const DEFAULT_KEY = "lw_default_driver";
  function getStoredDefaultDriver() {
    try { return GM_getValue(DEFAULT_KEY, null); } catch { return null; }
  }
  function setStoredDefaultDriver(id, name) {
    if (!id) return;
    try { GM_setValue(DEFAULT_KEY, { id: String(id), name: name || "" }); } catch {}
  }
  function getEffectiveDefaultDriver() {
    const s = getStoredDefaultDriver();
    if (s?.id) return s;
    return { id: String(ANIPET_DRIVER_ID), name: ANIPET_DRIVER_NAME };
  }
  function collectDriverCatalog() {
    const map = new Map();
    document.querySelectorAll('select.visit-drivers-select2 option[value]').forEach(opt => {
      const id = opt.value?.trim();
      if (!id || id === "-1" || id === "0") return;
      const name = (opt.textContent || "").trim();
      if (name) map.set(id, name);
    });
    return map;
  }
  function promptChooseDriverId() {
    const catalog = collectDriverCatalog();
    if (!catalog.size) {
      alert("לא נמצאו נהגים בתפריטים בדף. פתח דף שבו מופיעה רשימת נהגים ונסה שוב.");
      return null;
    }
    const entries = Array.from(catalog.entries());
    const lines = entries.map(([id, name], i) => `${i + 1}. ${name}  (id=${id})`).join("\n");
    const ans = prompt("בחר נהג ברירת מחדל להקצאה אוטומטית:\n\n" + lines + "\n\nהכנס מספר מהרשימה, או ID מפורש:");
    if (!ans) return null;
    const idx = Number(ans);
    if (Number.isInteger(idx) && idx >= 1 && idx <= entries.length) {
      const [id, name] = entries[idx - 1];
      return { id, name };
    }
    const byId = entries.find(([id]) => id === ans.trim());
    if (byId) return { id: byId[0], name: byId[1] };
    alert("בחירה לא תקינה.");
    return null;
  }

  function getCsrfToken() {
    const t = document.querySelector('meta[name="csrf-token"]')?.content;
    if (!t) throw new Error("Missing CSRF token (meta[name='csrf-token'])");
    return t;
  }

  async function postSetDriver(visitId, driverId) {
    if (!visitId) throw new Error("postSetDriver: missing visitId");
    const res = await fetch(`/visits/${visitId}/set_driver`, {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": getCsrfToken(),
        "accept": "*/*",
      },
      body: JSON.stringify({ new_driver: Number(driverId) }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`set_driver failed for visit ${visitId}: ${res.status} ${body}`);
    }
    return true;
  }

  async function removeDriver(visitId) {
    if (!visitId) throw new Error("removeDriver: missing visitId");
    const res = await fetch(`/visits/${visitId}/set_driver`, {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": getCsrfToken(),
        "accept": "*/*",
      },
      body: JSON.stringify({ new_driver: "-1" }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`remove_driver failed for visit ${visitId}: ${res.status} ${body}`);
    }
    return true;
  }

  /**
   * Given the HIDDEN select (select.visit-drivers-select2), persist to backend,
   * then reflect in the Select2 UI and keep data-current-id in sync.
   */
  async function setDriverForSelect(selectEl, driverId = ANIPET_DRIVER_ID, driverName = ANIPET_DRIVER_NAME) {
    if (!selectEl || !selectEl.matches("select.visit-drivers-select2")) {
      throw new Error("setDriverForSelect: not a visit-drivers-select2 select");
    }

    // Visit ID is already provided by Lionwheel in data-target-id
    const visitId = selectEl.dataset.targetId;
    if (!visitId) throw new Error("setDriverForSelect: missing data-target-id on select");

    // 1) Persist to backend (source of truth)
    await postSetDriver(visitId, driverId);

    // 2) Reflect in UI (Select2 + hidden select)
    try {
      if (window.jQuery && window.jQuery.fn && window.jQuery.fn.select2) {
        const $sel = window.jQuery(selectEl);
        $sel.val(String(driverId)).trigger("change");
        // Some skins/components use this event to re-render avatar/label
        $sel.trigger({
          type: "select2:select",
          params: { data: { id: String(driverId), text: driverName } },
        });
      } else {
        selectEl.value = String(driverId);
        selectEl.dispatchEvent(new Event("change", { bubbles: true }));
      }
    } catch (e) {
      console.warn("UI reflect failed (non-fatal):", e);
    }

    // 3) Sync bookkeeping attribute so later logic can skip already-set rows
    selectEl.dataset.currentId = String(driverId);
  }

  /**
   * Convenience bulk setter used by buttons/shortcuts.
   * Skips selects already set, skips ones without the driver option,
   * and skips "floating-visit-drivers-select2" (no visit id).
   */
  async function setAllToAnipet() {
    const def = getEffectiveDefaultDriver();
    const selects = Array.from(document.querySelectorAll("select.visit-drivers-select2.select2-hidden-accessible"));
    for (const sel of selects) {
      try {
        if (!sel.querySelector(`option[value="${def.id}"]`)) continue;
        if (sel.dataset.currentId === String(def.id)) continue;
        await setDriverForSelect(sel, def.id, def.name);
      } catch (e) {
        console.warn("setAllToDefaultDriver row failed:", e);
      }
    }
  }

  function findHeaderRow() {
    const panel = qs("#task_offcanvas");
    if (!panel) return null;
    return (
      qsa(".d-flex.align-items-center.flex-wrap", panel).find((el) =>
        el.querySelector(".ajax-status-container")
      ) || null
    );
  }

  function getTaskId(headerRow) {
    return (
      qs(".position-relative.ajax-status-container", headerRow)?.getAttribute(
        "data-task-id"
      ) || null
    );
  }

  function getVisitId(headerRow) {
    const sel = qs(".visit-drivers-select2", headerRow) || qs(".visit-drivers-select2");
    return sel?.dataset?.targetId || null;
  }

  function ensureWrapper() {
    const headerRow = findHeaderRow();
    if (!headerRow) return null;

    let wrapper = qs('[data-lw-quick-wrapper="1"]', headerRow);
    if (wrapper) return wrapper;

    wrapper = document.createElement("div");
    wrapper.className = "lw-quick-wrapper";
    wrapper.setAttribute("data-lw-quick-wrapper", "1");

    const divider = qs(".mo-divider", headerRow);
    const statusContainer = qs(".position-relative.ajax-status-container", headerRow);

    // למקם מימין ל־ajax-status-container ומשמאל ל־divider
    if (divider) {
      divider.parentNode.insertBefore(wrapper, divider);
    } else if (statusContainer) {
      statusContainer.parentNode.insertBefore(wrapper, statusContainer.nextSibling);
    } else {
      headerRow.appendChild(wrapper);
    }
    return wrapper;
  }

  function clickStatus(headerRow, newStatus) {
    const el = qs(
      `.position-relative.ajax-status-container .task-set-status[data-new-status="${newStatus}"]`,
      headerRow
    );
    if (el) {
      el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      return true;
    }
    return false;
  }

  function clickPickStatus(headerRow, className) {
    const el = qs(`.task-pick-status-dropdown .task-set-pick-status.${className}`, headerRow);
    if (el) {
      el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      return true;
    }
    return false;
  }

  async function openPickedQuantityModal(headerRow) {
    const ok = clickPickStatus(headerRow, "pick-status-picked");
    if (!ok) {
      document.querySelector(".task-set-pick-status.pick-status-picked")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      );
    }
  }

  async function openOrderItemsModal(headerRow, taskId) {
    const startBtn = document.querySelector("#btn-pick-order-item");
    if (startBtn) {
      startBtn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      return;
    }
    if (!taskId) return;
    try {
      const res = await fetch(`/tasks/${taskId}/order_items_modal`, { credentials: "include" });
      const html = await res.text();
      const holder = document.createElement("div");
      holder.innerHTML = html;
      const modal = holder.querySelector(".modal-dialog")?.parentElement;
      if (modal) {
        document.body.appendChild(modal);
        if (window.jQuery) window.jQuery(modal).modal("show");
        else { modal.style.display = "block"; modal.classList.add("show"); }
      }
    } catch (_) {}
  }

  async function setDriver26055(headerRow) {
    const sel = qs(".visit-drivers-select2", headerRow) || qs(".visit-drivers-select2");
    if (!sel) return false;

    try {
      // Use user-configured default driver (fallback to Anipet)
      const def = getEffectiveDefaultDriver();
      await setDriverForSelect(sel, def.id, def.name);
      return true;
    } catch (e) {
      console.warn("setDriver26055 failed:", e);
      return false;
    }
  }

  function disableFor(btn, ms) {
    btn.disabled = true;
    setTimeout(() => (btn.disabled = false), ms);
  }

  function buildButtons(wrapper) {
    if (!wrapper || wrapper.childElementCount) return;

    // סדר RTL: וי, חצי־וי, איקס
    const btnV = document.createElement("button");
    btnV.type = "button";
    btnV.className = "lw-quick-btn";
    btnV.title = "לוקט";
    btnV.innerHTML = SVG_GREEN_CHECK;

    const btnHalf = document.createElement("button");
    btnHalf.type = "button";
    btnHalf.className = "lw-quick-btn";
    btnHalf.title = "לוקט חלקית";
    btnHalf.innerHTML = SVG_ORANGE_HALF;

    const btnX = document.createElement("button");
    btnX.type = "button";
    btnX.className = "lw-quick-btn";
    btnX.title = "בהעברה";
    btnX.innerHTML = SVG_RED_X;

    wrapper.appendChild(btnV);
    wrapper.appendChild(btnHalf);
    wrapper.appendChild(btnX);

    // פעולות
    btnV.addEventListener("click", async () => {
      if (btnV.disabled) return;
      const headerRow = findHeaderRow();
      if (!headerRow) return;
      disableFor(btnV, 1800);

      clickStatus(headerRow, "ASSIGNED");            // 1) אושר
      await sleep(200);

      await setDriver26055(headerRow);               // 2) נהג 26055
      await sleep(200);

      await openPickedQuantityModal(headerRow);      // 3+4) לוקט + מודל חבילות
    });

    btnHalf.addEventListener("click", async () => {
      if (btnHalf.disabled) return;
      const headerRow = findHeaderRow();
      if (!headerRow) return;
      const taskId = getTaskId(headerRow);
      const visitId = getVisitId(headerRow);
      disableFor(btnHalf, 1600);

      clickStatus(headerRow, "IN_TRANSFER");         // 1) בהעברה
      await sleep(200);

      clickPickStatus(headerRow, "pick-status-partially_picked"); // 2) לוקט חלקית
      await sleep(150);

      await openOrderItemsModal(headerRow, taskId);  // 3) חלונית ליקוט
      
      // 4) הסרת נהג
      if (visitId) {
        try {
          await removeDriver(visitId);
          console.log("Driver removed successfully for visit:", visitId);
        } catch (e) {
          console.warn("Failed to remove driver:", e);
        }
      }
    });

    btnX.addEventListener("click", async () => {
      if (btnX.disabled) return;
      const headerRow = findHeaderRow();
      if (!headerRow) return;
      const visitId = getVisitId(headerRow);
      disableFor(btnX, 900);

      clickStatus(headerRow, "IN_TRANSFER");         // 1) בהעברה
      await sleep(150);

      clickPickStatus(headerRow, "pick-status-pending"); // 2) המתנה
      
      // 3) הסרת נהג
      if (visitId) {
        try {
          await removeDriver(visitId);
          console.log("Driver removed successfully for visit:", visitId);
        } catch (e) {
          console.warn("Failed to remove driver:", e);
        }
      }
    });
  }

  /** ============================ Init & Observe ============================ */
  function init() {
    const headerRow = findHeaderRow();
    if (!headerRow) return;
    const wrapper = ensureWrapper();
    buildButtons(wrapper);
  }

  init();
  const mo = new MutationObserver(() => init());
  mo.observe(document.documentElement, { childList: true, subtree: true });

  // ===== Tampermonkey Menu =====
  try {
    GM_registerMenuCommand("בחר נהג ברירת מחדל…", () => {
      const chosen = promptChooseDriverId();
      if (chosen) {
        setStoredDefaultDriver(chosen.id, chosen.name);
        alert(`נשמר: ${chosen.name} (id=${chosen.id})`);
      }
    });
    GM_registerMenuCommand("הצג נהג ברירת מחדל נוכחי", () => {
      const cur = getEffectiveDefaultDriver();
      alert(`נהג ברירת מחדל:\n${cur.name || "(ללא שם)"}  (id=${cur.id})`);
    });
    GM_registerMenuCommand("אפס נהג ברירת מחדל", () => {
      setStoredDefaultDriver(ANIPET_DRIVER_ID, ANIPET_DRIVER_NAME);
      alert(`נהג ברירת מחדל אופס ל: ${ANIPET_DRIVER_NAME} (id=${ANIPET_DRIVER_ID})`);
    });
  } catch {}
})();
