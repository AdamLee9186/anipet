// ==UserScript==
// @name         Lionwheel – כפתורי סטטוס
// @namespace    https://github.com/AdamLee9186/anipet
// @version      2.0.0
// @description  מוסיף ב-Offcanvas של Lionwheel שלושה כפתורים עם SVG בצבעים קבועים: וי ירוק, חצי־וי כתום, איקס אדום. פעולות: וי — אושר → נהג ברירת מחדל (ניתן לבחירה) → לוקט → פתיחת מודל חבילות; חצי־וי — בהעברה → לוקט חלקית → פתיחת חלונית ליקוט; איקס — בהעברה → המתנה. Ctrl+click או החזקה ארוכה: חצי־וי — אושר → לוקט חלקית, איקס — אושר → המתנה. יוצר: Adam Lee
// @author       Adam Lee
// @match        https://members.lionwheel.com/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @downloadURL  https://raw.githubusercontent.com/AdamLee9186/anipet/main/status-shortcuts.js
// @updateURL    https://raw.githubusercontent.com/AdamLee9186/anipet/main/status-shortcuts.js
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
  function injectQuickStyles() {
    if (qs("#lw-quick-styles")) return;
    const css = `
      .lw-quick-wrapper{
        direction: rtl;
        display:flex;
        flex-direction: row;
        align-items: flex-start;
        gap: 0.5rem;
        margin:0 .5rem 0 0;
        flex:0 0 auto;
        white-space:nowrap;
        padding-left: 0.5rem;
      }
      .lw-quick-btn{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        width:36px;
        height:36px;
        padding:0;
        border:0;
        background:transparent !important;
        line-height:1;
        cursor:pointer;
        /* Compose transforms via CSS vars so different states don't override each other */
        --tx: 0;          /* translateX offset (e.g., bottom-row centering) */
        --scale: 1;       /* press/long-press scale */
        transition: transform .06s ease, opacity .15s ease, filter .15s ease;
        transform: translateX(var(--tx)) scale(var(--scale));
      }
      .lw-quick-btn:hover{ 
        filter: brightness(1.2);
      }
      .lw-quick-btn:active{ --scale: 0.96; }
      .lw-quick-btn svg{ width:100%; height:100%; display:block; }
      .lw-quick-btn[disabled]{ opacity:.6; cursor:not-allowed; }
      
      /* Spinning animation for loader */
      /* Rotate only the SVG so button-level translateX/scale stay intact */
      .lw-quick-btn.spinning svg { animation: spin 1s linear infinite; }
      
      @keyframes spin {
        from { transform: rotate(0deg); }
        to   { transform: rotate(360deg); }
      }
      
      /* Long press visual feedback */
      .lw-quick-btn.long-pressing {
        --scale: 0.9;
        opacity: 0.8;
        transition: transform 0.1s ease, opacity 0.1s ease;
      }
      
      /* Sidepanel "Olympics": 3 on top, 2 centered under the gaps — without growing width */
      .lw-sidepanel-header .lw-quick-wrapper.lw-quick--stacked{
        --slot: 36px;        /* sidepanel button size - same as fullscreen */
        --gap: 8px;          /* horizontal gap */
        display: grid;
        grid-template-columns: repeat(3, var(--slot));
        column-gap: var(--gap);
        row-gap: 4px;        /* reduced from 8px for denser layout */
        align-items: center;
        justify-items: center;       /* center each icon in its cell */
        justify-content: center;     /* center the whole 3-slot block */
        flex: 0 0 auto;
        min-width: 0;
        /* top-align this 2-row block with the rest of the toolbar */
        align-self: flex-start;
        margin-top: -4px;   /* tweak: -2..-6px to match your exact toolbar height */
      }
      
      /* Make sure long neighbors don't wrap because of grid sizing */
      .lw-sidepanel-actions{ flex-wrap: nowrap; }
      
      /* Top-align the whole actions bar when the stacked quick-buttons exist */
      .lw-sidepanel-header .lw-sidepanel-actions{
        align-items: flex-start !important;
      }
      
      /* Make sure the stacked grid itself uses the top edge, not center */
      .lw-sidepanel-header .lw-quick-wrapper.lw-quick--stacked{
        align-self: flex-start;
        align-content: start;         /* grid's cross-axis distribution */
        margin-top: 0 !important;     /* cancel the earlier nudge */
      }
      
      /* Make sure grid items use the top edge as their baseline (prevents subtle re-centering) */
      .lw-quick--stacked .lw-quick-btn{ align-self: start; }
      
      /* Top row (✓, ◐, ✕) fills the 3 columns */
      .lw-quick--stacked .lw-quick-btn:nth-child(1){ grid-column: 1; grid-row: 1; }
      .lw-quick--stacked .lw-quick-btn:nth-child(2){ grid-column: 2; grid-row: 1; }
      .lw-quick--stacked .lw-quick-btn:nth-child(3){ grid-column: 3; grid-row: 1; }
      /* Bottom row circles: center them under the gaps between top buttons */
      .lw-quick--stacked .lw-quick-btn:nth-child(4){
        grid-column: 2; grid-row: 2;
        --tx: calc(-1 * (var(--slot) + var(--gap)) / 2);
      }
      .lw-quick--stacked .lw-quick-btn:nth-child(5){
        grid-column: 2; grid-row: 2;
        --tx: calc((var(--slot) + var(--gap)) / 2);
      }
      
      /* Size (sidepanel) */
      .lw-quick--stacked .lw-quick-btn{ width: var(--slot); height: var(--slot); }
      .lw-quick--stacked .lw-quick-btn svg{ width: 36px; height: 36px; }
      
      /* Auto-tighten when space is tight (uses your existing classes) */
      .lw-quick-wrapper.lw-compact{ --slot: 38px; --gap: 6px; }
      .lw-quick-wrapper.lw-ultra  { --slot: 32px; --gap: 4px; }
      
      /* Compact mode when space is tight */
      .lw-quick-wrapper.lw-compact{gap:.35rem; margin-right:.25rem; padding-left: 0.35rem}
      .lw-quick-wrapper.lw-compact .lw-quick-btn{width:30px; height:30px}
      /* Ultra-compact as last resort */
      .lw-quick-wrapper.lw-ultra{gap:.25rem; padding-left: 0.25rem}
      .lw-quick-wrapper.lw-ultra .lw-quick-btn{width:26px; height:26px}
      
      /* Fix side panel header layout issues */
      .offcanvas .task-header-bar {
        display: flex;
        flex-wrap: nowrap !important;
      }
      .offcanvas .task-header-bar > * { 
        min-width: 0; 
      }
      .offcanvas .task-header-bar .text-nowrap.ml-4 {
        max-width: 8rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .lw-quick-wrapper { 
        flex: 0 0 auto; 
      }
      
      /* Sidepanel header layout - tight, safe fix */
      .lw-sidepanel-header {               /* applied to the top bar row */
        flex-wrap: nowrap !important;      /* keep title + actions on the same row */
        align-items: flex-start !important; /* align content to top instead of center */
      }

      /* Let title shrink, avoid pushing actions to a new line */
      .lw-sidepanel-title {
        flex: 1 1 auto;
        min-width: 0;                      /* allow ellipsis */
        display: flex;
        align-items: center;
      }
      
      /* Add spacing between "משלוח" and the order number */
      .lw-sidepanel-title .font-size-h2:first-child {
        margin-left: 0.5rem;  /* Add right margin to create space after "משלוח" */
      }

      /* Price shouldn't force wrapping */
      .lw-sidepanel-price {
        white-space: nowrap;
        max-width: 8ch;                    /* trims long prices safely */
        overflow: hidden;
        text-overflow: ellipsis;
      }

      /* Actions can wrap internally without vertical "phantom" gaps */
      .lw-sidepanel-actions {
        flex: 0 1 auto;
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 0 .25rem;                     /* use gap instead of per-button margins */
      }
      .lw-sidepanel-actions .btn { margin-bottom: 0 !important; }

      /* If space is tight, hide the price entirely */
      .lw-hide-price { display: none !important; }

      /* Optional: on very narrow panels, always hide price */
      @media (max-width: 480px) {
        .lw-sidepanel-price { display: none !important; }
      }
    `;
    const style = document.createElement("style");
    style.id = "lw-quick-styles";
    style.textContent = css;
    document.head.appendChild(style);
  }

  /** ============================= Helpers ============================= */
  const $jq = window.jQuery || window.$;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const qs = (s, r = document) => r.querySelector(s);
  const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));
  
  // DOM element cache for frequently accessed elements
  const domCache = new Map();
  
  // Cached query selector with automatic cache invalidation
  function cachedQuery(selector, root = document, cacheKey = null) {
    const key = cacheKey || selector;
    const cached = domCache.get(key);
    
    if (cached && document.contains(cached)) {
      return cached;
    }
    
    const element = root.querySelector(selector);
    if (element) {
      domCache.set(key, element);
    }
    return element;
  }
  
  // Clear DOM cache when page changes
  function clearDomCache() {
    domCache.clear();
  }

  // Touch-friendly long press detection with optimized event handling
  function createLongPressHandler(element, onLongPress, onNormalClick, longPressDelay = 500) {
    let pressTimer = null;
    let visualTimer = null;
    let hasMoved = false;
    let startX, startY;
    let isCtrlPressed = false;

    const startPress = (e) => {
      // Check if Ctrl key is pressed (for mouse events)
      isCtrlPressed = e.ctrlKey || e.metaKey;
      
      // If Ctrl is pressed, don't start long press timer - let the click handler deal with it
      if (isCtrlPressed && e.type === 'mousedown') {
        return;
      }
      
      hasMoved = false;
      startX = e.type === 'mousedown' ? e.clientX : e.touches[0].clientX;
      startY = e.type === 'mousedown' ? e.clientY : e.touches[0].clientY;
      
      // Add visual feedback when long press threshold is reached
      visualTimer = setTimeout(() => {
        if (!hasMoved) {
          element.classList.add('long-pressing');
        }
      }, longPressDelay - 100); // Show feedback slightly before action
      
      pressTimer = setTimeout(() => {
        if (!hasMoved) {
          onLongPress(e);
        }
        if (visualTimer) {
          clearTimeout(visualTimer);
          visualTimer = null;
        }
      }, longPressDelay);
    };

    const endPress = (e) => {
      // Remove visual feedback
      element.classList.remove('long-pressing');
      
      // Clear all timers
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
      if (visualTimer) {
        clearTimeout(visualTimer);
        visualTimer = null;
      }
      
      // If Ctrl was pressed during this interaction, don't trigger normal click
      // Let the click event handler deal with it
      if (!hasMoved && !isCtrlPressed) {
        onNormalClick(e);
      }
    };

    const movePress = (e) => {
      if (!startX || !startY) return;
      
      const currentX = e.type === 'mousemove' ? e.clientX : e.touches[0].clientX;
      const currentY = e.type === 'mousemove' ? e.clientY : e.touches[0].clientY;
      
      const deltaX = Math.abs(currentX - startX);
      const deltaY = Math.abs(currentY - startY);
      
      if (deltaX > 10 || deltaY > 10) {
        hasMoved = true;
        if (pressTimer) {
          clearTimeout(pressTimer);
          pressTimer = null;
        }
        // Remove visual feedback if moved
        element.classList.remove('long-pressing');
      }
    };

    const cancelPress = () => {
      // Remove visual feedback
      element.classList.remove('long-pressing');
      
      // Clear all timers
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
      if (visualTimer) {
        clearTimeout(visualTimer);
        visualTimer = null;
      }
      
      // Reset state
      hasMoved = false;
      startX = startY = null;
      isCtrlPressed = false;
    };

    // Mouse events
    element.addEventListener('mousedown', startPress);
    element.addEventListener('mouseup', endPress);
    element.addEventListener('mouseleave', cancelPress);
    element.addEventListener('mousemove', movePress);
    
    // Special handling for Ctrl+click to prevent conflicts
    element.addEventListener('click', (e) => {
      if (e.ctrlKey || e.metaKey) {
        // If this was a Ctrl+click, cancel any ongoing long press
        cancelPress();
      }
    });

    // Touch events
    element.addEventListener('touchstart', startPress, { passive: false });
    element.addEventListener('touchend', endPress);
    element.addEventListener('touchcancel', cancelPress);
    element.addEventListener('touchmove', movePress, { passive: false });

    // Prevent context menu on long press
    element.addEventListener('contextmenu', (e) => e.preventDefault());
    
    // Return cleanup function for proper memory management
    return () => {
      element.removeEventListener('mousedown', startPress);
      element.removeEventListener('mouseup', endPress);
      element.removeEventListener('mouseleave', cancelPress);
      element.removeEventListener('mousemove', movePress);
      element.removeEventListener('click', (e) => {
        if (e.ctrlKey || e.metaKey) {
          cancelPress();
        }
      });
      element.removeEventListener('touchstart', startPress);
      element.removeEventListener('touchend', endPress);
      element.removeEventListener('touchcancel', cancelPress);
      element.removeEventListener('touchmove', movePress);
      element.removeEventListener('contextmenu', (e) => e.preventDefault());
      
      // Clear any remaining timers
      cancelPress();
    };
  }

  // Wait for jQuery ajax (if present) to go idle
  async function waitForAjaxIdle(timeoutMs = 2500) {
    const start = Date.now();
    while (window.jQuery && window.jQuery.active > 0) {
      if (Date.now() - start > timeoutMs) break;
      await sleep(50);
    }
  }

  // Fullscreen: assign, then re-assign shortly after to beat late writers
  async function assignDriverForTaskRobust(taskId, driverId, transferDetails) {
    // let Lionwheel finish any status writes
    await waitForAjaxIdle(2000);
    await sleep(150);

    // first assign
    try {
      const r1 = await assignDriverForTask(taskId, driverId, transferDetails);
      console.log("[LW] assign_driver #1 ok", r1);
    } catch (e) {
      console.warn("[LW] assign_driver #1 failed", e);
    }

    // second pass a bit later in case something wrote after us
    setTimeout(async () => {
      try {
        const r2 = await assignDriverForTask(taskId, driverId, transferDetails);
        console.log("[LW] assign_driver #2 ok", r2);
      } catch (e) {
        console.warn("[LW] assign_driver #2 failed", e);
      }
    }, 700);
  }

  // === Driver persistence helpers ===
  const ANIPET_DRIVER_ID = 26055;
  const ANIPET_DRIVER_NAME = "אניפט שליחויות";
  // Special driver: שיגור למרלוג
  const MERLOG_DRIVER_ID = 14151;
  const MERLOG_DRIVER_NAME = "שיגור למרלוג";

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

  async function assignDriverForTask(taskId, driverId, transferDetails) {
    const token =
      document.querySelector('meta[name="csrf-token"]')?.content ||
      document.querySelector('meta[name=csrf-token]')?.content;

    const res = await fetch("/tasks/assign_driver.json", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/javascript, */*; q=0.01",
        "X-CSRF-Token": token,
        "X-Requested-With": "XMLHttpRequest",
      },
      credentials: "include",
      body: JSON.stringify({
        task_id: String(taskId),
        driver_id: String(driverId),
        ...(transferDetails ? { transfer_details: transferDetails } : {})
      }),
    });

    const text = await res.text();
    if (!res.ok) throw new Error(`assign_driver failed: ${res.status} ${text}`);
    try { return JSON.parse(text); } catch { return { raw: text }; }
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
   * Scope-aware setter for the driver <select> (updates select2 UI too)
   * Works in either fullscreen or side-panel contexts
   */
  async function setDriverForSelect(scopeEl, driverId, driverName = "") {
    const scope = scopeEl || document;

    // Try the driver select used by Lionwheel (works in both fullscreen & side panel)
    const select =
      scope.querySelector("select[name='order[driver_id]']") ||
      scope.querySelector("select.visit-drivers-select2") ||
      scope.querySelector("select[data-controller='select2']");

    if (select) {
      const val = driverId ? String(driverId) : "";
      // If select2/jQuery is present, it will also update the visible .select2 container
      if (window.jQuery && window.jQuery.fn && window.jQuery(select).val) {
        window.jQuery(select).val(val).trigger("change.select2");
      } else {
        // Fallback: set native value
        select.value = val;
        // Fallback UI text if select2 container exists but jQuery not present
        const rendered =
          scope.querySelector(".select2-selection__rendered") ||
          document.getElementById(select.getAttribute("aria-labelledby"));
        if (rendered) {
          rendered.textContent = driverId ? driverName : "";
        }
      }
    }

    // Also keep the fullscreen header dropdown in sync if it exists
    const headerRow = findHeaderRow();
    if (headerRow) {
      updateDriverUI(headerRow, driverName || "", driverId || null);
    }
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
        const visitId = sel.dataset.targetId;
        if (!visitId) continue; // Skip floating selects
        await setDriverForSelect(visitId, def.id, def.name);
      } catch (e) {
        console.warn("setAllToDefaultDriver row failed:", e);
      }
    }
  }

  // Cached header row for better performance
  let cachedHeaderRow = null;
  let lastHeaderCheck = 0;
  const HEADER_CACHE_TTL = 2000; // 2 seconds cache
  
  function findHeaderRow() {
    const now = Date.now();
    
    // Return cached header if still valid
    if (cachedHeaderRow && document.contains(cachedHeaderRow) && (now - lastHeaderCheck) < HEADER_CACHE_TTL) {
      return cachedHeaderRow;
    }
    
    // 1) Offcanvas (existing behavior)
    const panel = qs("#task_offcanvas");
    if (panel) {
      const offcanvasHeader = qsa(".d-flex.align-items-center.flex-wrap", panel)
        .find((el) => el.querySelector(".ajax-status-container"));
      if (offcanvasHeader) {
        cachedHeaderRow = offcanvasHeader;
        lastHeaderCheck = now;
        return offcanvasHeader;
      }
    }
    
    // 2) Fullscreen order header: look globally for a row that contains the ajax-status-container
    //    The fullscreen page renders the controls inside the subheader toolbar area.
    const fullscreenHeader =
      qsa(".container-fluid.d-flex.align-items-center.justify-content-between.flex-wrap.flex-sm-nowrap, .row.justify-content-start.ml-0, .d-flex.align-items-center.flex-wrap")
        .find((el) => el.querySelector(".position-relative.ajax-status-container"));
    
    if (fullscreenHeader) {
      cachedHeaderRow = fullscreenHeader;
      lastHeaderCheck = now;
      return fullscreenHeader;
    }
    
    // Clear cache if nothing found
    cachedHeaderRow = null;
    return null;
  }

  function getTaskId(headerRow) {
    return (
      qs(".position-relative.ajax-status-container", headerRow)?.getAttribute(
        "data-task-id"
      ) || null
    );
  }

  // Robust resolver: works in fullscreen (URL) and side-panel (data attr)
  function getTaskIdRobust(headerRow) {
    // 1) Prefer DOM data-task-id (exists in side-panel/offcanvas)
    const fromDom = getTaskId(headerRow);
    if (fromDom) return fromDom;
    
    // 2) Fallback: parse /tasks/:id from URL (fullscreen)
    const m = location.pathname.match(/^\/tasks\/(\d+)/);
    if (m && m[1]) return m[1];
    
    // 3) Last resort: hidden input if present
    const hidden = document.querySelector("input[name='order[id]'], input[name='task[id]']");
    if (hidden && hidden.value) return hidden.value;
    
    return null;
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

    // Tag as stacked if we're in sidepanel
    if (headerIsOffcanvas(headerRow)) {
      wrapper.classList.add("lw-quick--stacked");
    }

    // Find the ajax-status-container (the first status dropdown)
    const statusContainer = qs(".position-relative.ajax-status-container", headerRow);
    
    if (statusContainer && statusContainer.parentNode) {
      // Place our wrapper BEFORE the status container (to the right of it in RTL)
      statusContainer.parentNode.insertBefore(wrapper, statusContainer);
    } else {
      headerRow.appendChild(wrapper);
    }

    // Make sure styles are injected once
    injectQuickStyles();
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

  /**
   * Persist UNASSIGNED (טרם אושר) reliably in fullscreen & offcanvas.
   * Strategy:
   *  - wait for ajax idle → POST → small delay → POST again (beats late writers)
   *  - mirror the exact request shape used manually by the app
   */
  async function setTaskStatusUNASSIGNED(headerRow, taskId) {
    // 0) Visual update first (harmless even if server overwrites)
    clickStatus(headerRow, "UNASSIGNED");
    await sleep(80);

    // 1) Resolve task id robustly
    taskId = taskId || getTaskIdRobust(headerRow);
    if (!taskId) {
      console.warn("setTaskStatusUNASSIGNED: No task ID found", { url: location.pathname });
      return false;
    }

    // 2) Let Lionwheel finish any pending writes before we send ours
    await waitForAjaxIdle(2000);

    // 3) POST (retry once after short delay to win races)
    const token = getCsrfToken();
    const url = `/tasks/${String(taskId)}/set_status`;
    const payload = JSON.stringify({ new_task_status: "UNASSIGNED" });
    const headers = {
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "Content-Type": "application/json",
      "X-CSRF-Token": token,
      "X-Requested-With": "XMLHttpRequest",
    };

    const doPost = async () => {
      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers,
        body: payload,
        // Setting a friendly referrer helps mimic the manual call in fullscreen
        referrer: `/tasks/${String(taskId)}`,
        referrerPolicy: "strict-origin-when-cross-origin",
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`set_status UNASSIGNED failed: ${res.status} ${body}`);
      }
    };

    try {
      await doPost();
      await sleep(250);
      await doPost(); // second pass to beat any late in-flight writers
    } catch (e) {
      console.warn("setTaskStatusUNASSIGNED: POST failed", e);
      throw e;
    }

    // 4) Sync UI once more (keeps dropdown label consistent)
    clickStatus(headerRow, "UNASSIGNED");
    return true;
  }

  function clickPickStatus(headerRow, className) {
    const el = qs(`.task-pick-status-dropdown .task-set-pick-status.${className}`, headerRow);
    if (el) {
      el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      return true;
    }
    return false;
  }

  /**
   * Try to set pick status to NEW using the UI; if not available, fallback to POST.
   * Ensures UI reflects the change when possible.
   */
  async function setPickStatusNEW(headerRow, taskId) {
    // 1) prefer native click so Lionwheel updates UI immediately
    const clicked = clickPickStatus(headerRow, "pick-status-new");
    if (clicked) return true;
    // 2) fallback: POST to set_pick_status with correct endpoint structure
    if (!taskId) return false;
    const token = getCsrfToken();
    const res = await fetch(`/tasks/${String(taskId)}/set_pick_status`, {
      method: "POST",
      headers: {
        "accept": "application/json, text/javascript, */*; q=0.01",
        "content-type": "application/json",
        "x-csrf-token": token,
        "x-requested-with": "XMLHttpRequest",
      },
      credentials: "include",
      body: JSON.stringify({ new_status: "NEW", packages_quantity: "" }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`set_pick_status NEW failed: ${res.status} ${body}`);
    }
    return true;
  }

  async function openPickedQuantityModal(headerRow) {
    const ok = clickPickStatus(headerRow, "pick-status-picked");
    if (!ok) {
      const element = document.querySelector(".task-set-pick-status.pick-status-picked");
      if (element) {
        // Add a temporary event listener to prevent default behavior
        const preventDefault = (e) => {
          e.preventDefault();
          e.stopPropagation();
        };
        element.addEventListener("click", preventDefault, { capture: true, once: true });
        
        const event = new MouseEvent("click", { 
          bubbles: true, 
          cancelable: true
        });
        element.dispatchEvent(event);
      }
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



  function disableFor(btn, ms) {
    btn.disabled = true;
    btn.classList.add('spinning');
    setTimeout(() => {
      btn.disabled = false;
      btn.classList.remove('spinning');
    }, ms);
  }

  // Update driver UI in the fullscreen header dropdown
  function updateDriverUI(headerRow, driverName, driverId) {
    const taskMatch = location.pathname.match(/^\/tasks\/(\d+)/);
    const isFullscreen = !!taskMatch;
    const taskId = isFullscreen ? taskMatch[1] : null;

    if (isFullscreen && taskId) {
      const label = document.querySelector(
        `.drivers-dropdown-current-driver[data-task-id="${taskId}"]`
      );
      if (label) {
        label.textContent = driverId ? (driverName || "הנהג נבחר") : "נהג";
      }
    }
  }

  // Clear driver in current context (fullscreen or side-panel) + update UI quietly
  async function clearDriverForContext(headerRow) {
    const taskMatch = location.pathname.match(/^\/tasks\/(\d+)/);
    const isFullscreen = !!taskMatch;
    const taskId = isFullscreen ? taskMatch[1] : null;
    const visitId = getVisitId(headerRow);

    try {
      if (isFullscreen && taskId) {
        // Fullscreen: unassign via /tasks/assign_driver.json
        await assignDriverForTask(taskId, ""); // driver_id: ""
        // Reflect in the big header dropdown label
        const label = document.querySelector(
          `.drivers-dropdown-current-driver[data-task-id="${taskId}"]`
        );
        if (label) label.textContent = "נהג";
      } else if (visitId) {
        // Side-panel: unassign via /visits/:id/set_driver
        await removeDriver(visitId);
        // Quietly reflect in select2 without firing change events
        const sel = document.querySelector(
          `select.visit-drivers-select2[data-target-id="${visitId}"]`
        );
        if (sel) {
          if (sel.querySelector('option[value="-1"]')) sel.value = "-1";
          else if (sel.querySelector('option[value="0"]')) sel.value = "0";
          else sel.value = "";
          sel.dataset.currentId = "";
          const rendered = sel
            .closest(".select2-container")
            ?.querySelector(".select2-selection__rendered");
          if (rendered) rendered.textContent = "בחר נהג";
        }
      }
    } catch (e) {
      console.warn("clearDriverForContext failed:", e);
    }
  }

  // Performance monitoring (only in development)
  const DEBUG_PERFORMANCE = false;
  
  function logPerformance(label, startTime) {
    if (DEBUG_PERFORMANCE) {
      console.log(`[LW Performance] ${label}: ${Date.now() - startTime}ms`);
    }
  }
  
  function buildButtons(wrapper) {
    if (!wrapper || wrapper.childElementCount) return;
    
    const startTime = DEBUG_PERFORMANCE ? Date.now() : 0;

    // סדר RTL: וי, חצי־וי, איקס, עיגול 1, עיגול 2 (כל הכפתורים בשורה אחת)
    const btnV = document.createElement("button");
    btnV.type = "button";
    btnV.className = "lw-quick-btn";
    btnV.title = "לוקט (Ctrl+click או החזקה: טרם אושר + חדש + הסר נהג)";
    btnV.innerHTML = SVG_GREEN_CHECK;

    const btnHalf = document.createElement("button");
    btnHalf.type = "button";
    btnHalf.className = "lw-quick-btn";
    btnHalf.title = "לוקט חלקית (Ctrl+click או החזקה: אושר + לוקט חלקית)";
    btnHalf.innerHTML = SVG_ORANGE_HALF;

    const btnX = document.createElement("button");
    btnX.type = "button";
    btnX.className = "lw-quick-btn";
    btnX.title = "בהעברה (Ctrl+click או החזקה: אושר + המתנה)";
    btnX.innerHTML = SVG_RED_X;

    // Blue button  — : בהעברה → המתנה → שיגור למרלוג
    const btnCircle1 = document.createElement("button");
    btnCircle1.type = "button";
    btnCircle1.className = "lw-quick-btn";
    btnCircle1.title = "בהעברה → המתנה → נהג: שיגור למרלוג";
    btnCircle1.innerHTML = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true" focusable="false">
  <path fill="#3333ff" d="M320,112c114.9,0,208,93.1,208,208s-93.1,208-208,208-208-93.1-208-208,93.1-208,208-208ZM320,576c141.4,0,256-114.6,256-256S461.4,64,320,64,64,178.6,64,320s114.6,256,256,256ZM423.16,394.71l-40.64,35.61-103.35-115.35v108.38h-54.97v-127.35l31.35-7.35-38.71-43.35,41.03-35.61,97.93,109.54v-46.45h-23.23l10.45-53.03h34.84c22.06,0,32.9,11.23,32.9,33.68v75.87l-31.74,15.87,44.13,49.55Z"/>
</svg>`.trim();

    // New button 2 - Reload symbol icon (pink/magenta)
    const btnCircle2 = document.createElement("button");
    btnCircle2.type = "button";
    btnCircle2.className = "lw-quick-btn";
    btnCircle2.title = "אושר → חדש → הסר נהג";
    btnCircle2.innerHTML = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true" focusable="false">
  <path fill="#FF00FF" d="M320,112c114.9,0,208,93.1,208,208s-93.1,208-208,208-208-93.1-208-208,93.1-208,208-208ZM320,576c141.4,0,256-114.6,256-256S461.4,64,320,64,64,178.6,64,320s114.6,256,256,256ZM241.1,308.41c5.53-38.68,38.85-68.43,79.07-68.43,22.05,0,42.01,8.94,56.49,23.38.08.08.17.17.25.25l3.16,2.99h-19.92c-7.36,0-13.31,5.95-13.31,13.31s5.95,13.31,13.31,13.31h53.24c7.36,0,13.31-5.95,13.31-13.31v-53.24c0-7.36-5.95-13.31-13.31-13.31s-13.31,5.95-13.31,13.31v22.21l-4.7-4.45c-19.26-19.18-45.88-31.07-75.21-31.07-53.66,0-98.04,39.68-105.4,91.3-1.04,7.28,3.99,14.02,11.27,15.06s14.02-4.03,15.06-11.27v-.04ZM425.58,335.03c1.04-7.28-4.03-14.02-11.27-15.06-7.24-1.04-14.02,4.03-15.06,11.27-5.53,38.68-38.85,68.43-79.07,68.43-22.05,0-42.01-8.94-56.49-23.38-.08-.08-.17-.17-.25-.25l-3.16-2.99h19.92c7.36,0,13.31-5.95,13.31-13.31s-5.95-13.31-13.31-13.31l-53.2.04c-3.54,0-6.95,1.41-9.44,3.95s-3.91,5.91-3.87,9.48l.42,52.83c.04,7.36,6.07,13.27,13.44,13.19,7.36-.08,13.27-6.07,13.19-13.44l-.17-21.42,4.45,4.2c19.26,19.18,45.84,31.07,75.16,31.07,53.66,0,98.04-39.68,105.4-91.3Z"/>
</svg>`.trim();

    // Add all buttons directly to wrapper (single row)
    wrapper.appendChild(btnV);
    wrapper.appendChild(btnHalf);
    wrapper.appendChild(btnX);
    wrapper.appendChild(btnCircle1);
    wrapper.appendChild(btnCircle2);

    // פעולות
    // Per-button guard to prevent the default path after an alt Ctrl/⌘ click
    let suppressNormalClick = false;

    const handleGreenButtonClick = async (isAlternativeAction = false) => {
      if (btnV.disabled) return;
      const headerRow = findHeaderRow();
      if (!headerRow) return;
      disableFor(btnV, 1800);

      const taskId = getTaskIdRobust(headerRow);

      if (isAlternativeAction) {
        // === Alternative: טרם אושר + חדש + הסר נהג ===
        // 1) task status: UNASSIGNED (טרם אושר) — persist to server robustly
        await setTaskStatusUNASSIGNED(headerRow, taskId);
        await sleep(180);
        // 2) pick status: NEW (חדש) — via UI if possible, fallback to POST
        await setPickStatusNEW(headerRow, taskId);
        await sleep(150);
        // 3) remove driver (fullscreen or side-panel) and reflect UI
        await clearDriverForContext(headerRow);
        if (headerIsOffcanvas(headerRow)) {
          const sidePanelRoot = headerRow.closest(".offcanvas, .modal, [id*='offcanvas']") || document;
          await setDriverForSelect(sidePanelRoot, "", "");
        } else {
          await setDriverForSelect(headerRow, "", "");
        }
      } else {
        // === Default: אושר → לוקט → נהג ברירת מחדל ===
        // 1) אושר
        clickStatus(headerRow, "ASSIGNED");
        await sleep(200);

        if (headerIsOffcanvas(headerRow)) {
          // side panel: existing flow opens the modal which flips to "לוקט"
          await openPickedQuantityModal(headerRow);
        } else {
          // fullscreen: explicitly set "לוקט" (picked)
          clickPickStatus(headerRow, "pick-status-picked");
          await sleep(150);
        }

        // 3) נהג — LAST (so any Lionwheel reloads happen after statuses are done)
        const visitId = getVisitId(headerRow);
        const def = getEffectiveDefaultDriver();
        
        if (headerIsOffcanvas(headerRow)) {
          // Side-panel: use visits endpoint and update UI
          await postSetDriver(visitId, def.id);
          const sidePanelRoot = headerRow.closest(".offcanvas, .modal, [id*='offcanvas']") || document;
          await setDriverForSelect(sidePanelRoot, def.id, def.name);
        } else {
          // Fullscreen: use tasks endpoint and update UI
          const taskMatch = location.pathname.match(/^\/tasks\/(\d+)/);
          const fTaskId = taskMatch ? taskMatch[1] : null;
          if (fTaskId) {
            await assignDriverForTaskRobust(fTaskId, def.id, null);
            await setDriverForSelect(headerRow, def.id, def.name);
          }
        }
      }
    };

    // Ctrl+click on desktop triggers the alternative flow
    btnV.addEventListener("click", async (event) => {
      if (event.ctrlKey || event.metaKey) {
        // Block any other click handlers and the normal click path
        suppressNormalClick = true;
        event.preventDefault();
        event.stopImmediatePropagation();
        try {
          await handleGreenButtonClick(true);
        } finally {
          // Small delay to ensure mouseup/normal-path has fully settled
          setTimeout(() => { suppressNormalClick = false; }, 250);
        }
      }
    });

    // Long press: alternative; Normal press: default
    createLongPressHandler(
      btnV,
      () => handleGreenButtonClick(true),   // onLongPress -> alternative
      () => {                               // onNormalClick -> default (unless suppressed)
        if (suppressNormalClick) return;
        handleGreenButtonClick(false);
      }
    );

    const handleOrangeButtonClick = async (isAlternativeAction = false) => {
      if (btnHalf.disabled) return;
      const headerRow = findHeaderRow();
      if (!headerRow) return;
      const taskId = getTaskIdRobust(headerRow);
      const visitId = getVisitId(headerRow);
      disableFor(btnHalf, 1600);

      if (isAlternativeAction) {
        // Long press or Ctrl+click: אושר + לוקט חלקית
        clickStatus(headerRow, "ASSIGNED");         // 1) אושר
        await sleep(200);
      } else {
        // Normal click: בהעברה + לוקט חלקית
        clickStatus(headerRow, "IN_TRANSFER");         // 1) בהעברה
        await sleep(200);
      }

      clickPickStatus(headerRow, "pick-status-partially_picked"); // 2) לוקט חלקית
      await sleep(150);

      await openOrderItemsModal(headerRow, taskId);  // 3) חלונית ליקוט
      
      // 4) הסרת נהג — LAST (fullscreen or side-panel)
      await clearDriverForContext(headerRow);
      
      // Also update UI in side panel if present
      if (headerIsOffcanvas(headerRow)) {
        const sidePanelRoot = headerRow.closest(".offcanvas, .modal, [id*='offcanvas']") || document;
        await setDriverForSelect(sidePanelRoot, "", "");
      }
    };

    // Handle Ctrl+click for desktop
    btnHalf.addEventListener("click", async (event) => {
      // Only handle Ctrl+click here, normal clicks are handled by long press handler
      if (event.ctrlKey) {
        handleOrangeButtonClick(true);
      }
    });

    // Use long press handler for touch-friendly interaction and normal clicks
    createLongPressHandler(btnHalf, 
      () => handleOrangeButtonClick(true),  // Long press: alternative action
      () => handleOrangeButtonClick(false)  // Normal press: default action
    );

    const handleRedButtonClick = async (isAlternativeAction = false) => {
      if (btnX.disabled) return;
      const headerRow = findHeaderRow();
      if (!headerRow) return;
      const visitId = getVisitId(headerRow);
      disableFor(btnX, 900);

      if (isAlternativeAction) {
        // Long press or Ctrl+click: אושר + המתנה
        clickStatus(headerRow, "ASSIGNED");         // 1) אושר
        await sleep(150);
      } else {
        // Normal click: בהעברה + המתנה
        clickStatus(headerRow, "IN_TRANSFER");         // 1) בהעברה
        await sleep(150);
      }

      clickPickStatus(headerRow, "pick-status-pending"); // 2) המתנה
      
      // 3) הסרת נהג — LAST (fullscreen או side-panel)
      await clearDriverForContext(headerRow);
      
      // Also update UI in side panel if present
      if (headerIsOffcanvas(headerRow)) {
        const sidePanelRoot = headerRow.closest(".offcanvas, .modal, [id*='offcanvas']") || document;
        await setDriverForSelect(sidePanelRoot, "", "");
      }
    };

    // Handle Ctrl+click for desktop
    btnX.addEventListener("click", async (event) => {
      // Only handle Ctrl+click here, normal clicks are handled by long press handler
      if (event.ctrlKey) {
        handleRedButtonClick(true);
      }
    });

    // Use long press handler for touch-friendly interaction and normal clicks
    createLongPressHandler(btnX, 
      () => handleRedButtonClick(true),  // Long press: alternative action
      () => handleRedButtonClick(false)  // Normal press: default action
    );

    // === BLUE button: בהעברה → המתנה → assign "שיגור למרלוג" ===
    const handleBlueButtonClick = async () => {
      if (btnCircle1.disabled) return;
      const headerRow = findHeaderRow();
      if (!headerRow) return;
      disableFor(btnCircle1, 1800);

      const taskId  = getTaskIdRobust(headerRow);
      const visitId = getVisitId(headerRow);

      // (1) First status → בהעברה
      clickStatus(headerRow, "IN_TRANSFER");
      await sleep(160);

      // (2) Second status → בהמתנה
      clickPickStatus(headerRow, "pick-status-pending");
      await sleep(140);

      // (3) Driver → שיגור למרלוג (id=14151)
      if (headerIsOffcanvas(headerRow)) {
        // Side-panel: try visits API first (usually no modal),
        // then mirror the select2 UI
        try {
          if (visitId) {
            await postSetDriver(visitId, MERLOG_DRIVER_ID);
          }
        } catch (e) {
          console.warn("[BLUE] postSetDriver failed, fallback to /tasks/assign_driver.json with transfer_details={}", e);
          if (taskId) {
            await assignDriverForTaskRobust(taskId, MERLOG_DRIVER_ID, {});
          }
        }
        const sideRoot = headerRow.closest(".offcanvas, .modal, [id*='offcanvas']") || document;
        await setDriverForSelect(sideRoot, MERLOG_DRIVER_ID, MERLOG_DRIVER_NAME);
      } else {
        // Fullscreen: call assign_driver.json with transfer_details to skip the confirm modal
        if (taskId) {
          await assignDriverForTaskRobust(taskId, MERLOG_DRIVER_ID, {});
        }
        await setDriverForSelect(headerRow, MERLOG_DRIVER_ID, MERLOG_DRIVER_NAME);
      }
    };
    btnCircle1.addEventListener("click", handleBlueButtonClick);

    // === MAGENTA button: אושר → חדש → הסר נהג ===
    const handleMagentaButtonClick = async () => {
      if (btnCircle2.disabled) return;
      const headerRow = findHeaderRow();
      if (!headerRow) return;
      disableFor(btnCircle2, 1600);

      const taskId = getTaskIdRobust(headerRow);

      // (1) First status → אושר
      clickStatus(headerRow, "ASSIGNED");
      await sleep(150);

      // (2) Second status → חדש  (UI first; fallback POST inside helper)
      await setPickStatusNEW(headerRow, taskId);
      await sleep(120);

      // (3) הסר נהג — handles fullscreen/side-panel + UI sync
      await clearDriverForContext(headerRow);
      // Force-select2/UI sync in current scope (mirrors other buttons' pattern)
      if (headerIsOffcanvas(headerRow)) {
        const sideRoot = headerRow.closest(".offcanvas, .modal, [id*='offcanvas']") || document;
        await setDriverForSelect(sideRoot, "", "");
      } else {
        await setDriverForSelect(headerRow, "", "");
      }
    };
    btnCircle2.addEventListener("click", handleMagentaButtonClick);
    
    if (DEBUG_PERFORMANCE) {
      logPerformance('Button creation', startTime);
    }
  }

  /** ============================ Init & Observe ============================ */
  function init() {
    const headerRow = findHeaderRow();
    if (!headerRow) return;
    const wrapper = ensureWrapper();
    buildButtons(wrapper);
    // Fix layout issues specifically in the sidepanel header (tight space)
    tightenSidepanelHeader(headerRow, wrapper);
    
    // Apply the new tight layout fix for sidepanel headers
    if (headerIsOffcanvas(headerRow)) {
      const sidepanel = headerRow.closest(".offcanvas, .drawer, [data-offcanvas]") || document;
      tightenSidepanelTopbar(sidepanel);
    }
  }

  // ------------------------------------------------------------
  // Layout helpers (compacting & CSS)
  // ------------------------------------------------------------
  function headerIsOffcanvas(headerRow){
    return !!headerRow.closest("#task_offcanvas");
  }

  // Reduce spacing ONLY in the offcanvas header when we detect overflow.
  function tightenSidepanelHeader(headerRow, wrapper){
    if (!headerIsOffcanvas(headerRow)) return;

    // Start in normal size
    wrapper.classList.remove("lw-compact","lw-ultra");

    // Reclaim a few pixels: soften the large left margin on price if present
    const price = headerRow.querySelector('.font-weight-bolder .text-nowrap.ml-4[style*="color"]');
    if (price && !price.dataset.lwTightened) {
      price.dataset.lwTightened = "1";
      price.classList.remove("ml-4");
      price.classList.add("ml-2"); // save ~8px without visual harm
    }

    // Also trim the divider's horizontal margins a bit
    const divider = headerRow.querySelector(".mo-divider");
    if (divider && !divider.dataset.lwTightened) {
      divider.dataset.lwTightened = "1";
      divider.style.marginRight = "0.25rem";
      divider.style.marginLeft = "0.25rem";
    }

    // If still overflowing, step down to compact, then ultra-compact
    const container = headerRow; // flex container we measured against
    const overflowing = () => container.scrollWidth > container.clientWidth + 2;

    if (overflowing()) {
      wrapper.classList.add("lw-compact");
    }
    if (overflowing()) {
      wrapper.classList.add("lw-ultra");
    }
  }

  // Simple resize handler for layout adjustments
  function handleResize() {
    const headerRow = findHeaderRow();
    if (!headerRow) return;
    const wrapper = qs('[data-lw-quick-wrapper="1"]', headerRow);
    if (wrapper) {
      tightenSidepanelHeader(headerRow, wrapper);
    }
  }

  // Optimized debounced resize handler with RAF for better performance
  let resizeTimeout;
  let resizeRAF;
  
  function debouncedResize() {
    clearTimeout(resizeTimeout);
    if (resizeRAF) {
      cancelAnimationFrame(resizeRAF);
    }
    
    resizeTimeout = setTimeout(() => {
      resizeRAF = requestAnimationFrame(handleResize);
    }, 100);
  }
  
  window.addEventListener("resize", debouncedResize, { passive: true });

  // Tighten sidepanel header layout - prevents wrapping and removes phantom gaps
  function tightenSidepanelTopbar(sidepanelRoot) {
    const row = sidepanelRoot.querySelector(
      ".d-flex.justify-content-between.align-items-center.position-relative.pr-8"
    );
    if (!row) return;

    // Title (left) + Actions (right)
    const title = row.children[0];
    const actions = row.children[1];
    if (!title || !actions) return;

    row.classList.add("lw-sidepanel-header");
    title.classList.add("lw-sidepanel-title");
    actions.classList.add("lw-sidepanel-actions");

    // Price span (may exist; may be empty)
    const price = title.querySelector(".text-nowrap");
    if (price) price.classList.add("lw-sidepanel-price");

    // Remove bottom margins that bloat height when wrapping
    actions.querySelectorAll(".btn.mb-2").forEach(btn => btn.classList.remove("mb-2"));

    // If the row is still taller than one line, hide price to reclaim space
    // (40–56px tends to be a single-line header height range; adjust if needed)
    requestAnimationFrame(() => {
      const singleLineMax = 56;
      if (row.scrollHeight > singleLineMax && price) {
        price.classList.add("lw-hide-price");
      }
    });
  }

  // Optimized mutation observer with debouncing
  let initTimeout;
  let isInitializing = false;
  
  function debouncedInit() {
    if (isInitializing) return;
    
    clearTimeout(initTimeout);
    initTimeout = setTimeout(() => {
      isInitializing = true;
      init();
      isInitializing = false;
    }, 100);
  }
  
  init();
  const mo = new MutationObserver(debouncedInit);
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
    
    // Performance monitoring toggle
    GM_registerMenuCommand("הפעל/כבה ניטור ביצועים", () => {
      DEBUG_PERFORMANCE = !DEBUG_PERFORMANCE;
      alert(`ניטור ביצועים ${DEBUG_PERFORMANCE ? 'מופעל' : 'כבוי'}`);
    });
  } catch {}
  
  // Cleanup function for better memory management
  function cleanup() {
    // Clear timers
    if (resizeTimeout) clearTimeout(resizeTimeout);
    if (resizeRAF) cancelAnimationFrame(resizeRAF);
    if (initTimeout) clearTimeout(initTimeout);
    
    // Disconnect mutation observer
    if (mo) mo.disconnect();
    
    // Clear DOM cache
    clearDomCache();
    
    // Clear header cache
    cachedHeaderRow = null;
    lastHeaderCheck = 0;
    
    // Remove event listeners
    window.removeEventListener("resize", debouncedResize);
  }
  
  // Cleanup on page unload
  window.addEventListener("beforeunload", cleanup);
})();
