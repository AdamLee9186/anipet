// ==UserScript==
// @name         Lionwheel - Anipet Toolbox
// @namespace    anipet-toolbox-merged
// @version      13.8.67
// @description  AIO Script: Image Finder, Barcode Replacer, Previews, Responsive Views & more, all controlled from the Tampermonkey menu.
// @author       Adam Lee
// @source       https://github.com/AdamLee9186/anipet_app
// @match        *://*.lionwheel.com/*
// @updateURL    https://raw.githubusercontent.com/AdamLee9186/anipet/main/toolbox.js
// @downloadURL  https://raw.githubusercontent.com/AdamLee9186/anipet/main/toolbox.js
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @grant        window.close
// @grant        unsafeWindow
// @connect      raw.githubusercontent.com
// @connect      *
// @require      https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.3.0/papaparse.min.js
// @run-at       document-start
// ==/UserScript==

/* ── Analytics Noise Firewall: kill GA/Clarity/FB at the source ───────────── */
(function __tmcInstallAnalyticsFirewall(){
  if (window.__tmcAnalyticsFirewallInstalled) return;
  window.__tmcAnalyticsFirewallInstalled = true;
  try{
    const BLOCK_RE = /(?:google-analytics\.com|googletagmanager\.com\/gtag|clarity\.ms|connect\.facebook\.net|fbevents\.js)/i;
    const shouldBlock = (u)=>{ try{ return BLOCK_RE.test(String(u||'')); }catch(_){ return false; } };
    // fetch: short-circuit known trackers before the request leaves the page
    const ORIG_FETCH = window.fetch && window.fetch.bind(window);
    if (ORIG_FETCH){
      window.fetch = function(input, init){
        const url = typeof input==='string' ? input : (input && input.url);
        if (shouldBlock(url)) return Promise.resolve(new Response('', {status:204, statusText:'No Content'}));
        return ORIG_FETCH(input, init);
      };
    }
    // sendBeacon: GA/gtag loves using this; pretend success so callers don't retry
    const ORIG_BEACON = navigator.sendBeacon && navigator.sendBeacon.bind(navigator);
    if (ORIG_BEACON){
      navigator.sendBeacon = function(url, data){
        if (shouldBlock(url)) return true;
        return ORIG_BEACON(url, data);
      };
    }
    // XMLHttpRequest: record URL in open(), no-op in send() for blocked hosts
    const XHR_OPEN = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, ...rest){
      this.__tmcBlockedAnalytics = shouldBlock(url);
      this._url = url; // keep compatibility with downstream handlers
      return XHR_OPEN.call(this, method, url, ...rest);
    };
    const XHR_SEND = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function(body){
      if (this.__tmcBlockedAnalytics){
        setTimeout(()=>{ try{
          this.dispatchEvent(new Event('readystatechange'));
          this.dispatchEvent(new Event('load'));
          this.dispatchEvent(new Event('loadend'));
        }catch(_){ } }, 0);
        return;
      }
      return XHR_SEND.call(this, body);
    };
    // Block dynamic <script src="..."> injections before they hit the network
    const APPEND = Node.prototype.appendChild;
    const INSERT = Node.prototype.insertBefore;
    function maybeBlockScript(node){
      try{
        if (node && node.nodeType === 1 && node.tagName === 'SCRIPT'){
          const src = node.src || node.getAttribute('src') || '';
          if (BLOCK_RE.test(src)) return true;
        }
      }catch(_){}
      return false;
    }
    Node.prototype.appendChild = function(node){
      if (maybeBlockScript(node)) return node;
      return APPEND.call(this, node);
    };
    Node.prototype.insertBefore = function(node, ref){
      if (maybeBlockScript(node)) return node;
      return INSERT.call(this, node, ref);
    };
  }catch(_){}
})();

// --- Merlog chip filter (rows marked in red / "מרלוג") ---
(function merlogChipFilter() {
  const TBL = '#operator-store-visits-table';
  const APPLIED_CONTAINER = '#filters-applied-box .applied-filters-container';
  const FILTER_KEY = 'chip-merlog-only';
  let active = false;

  const hasDT = () => $.fn.dataTable && $.fn.dataTable.isDataTable(TBL);
  const dt = () => (hasDT() ? $(TBL).DataTable() : null);

  function rowIsMerlog(tr) {
    if (!tr) return false;
    if (tr.classList && tr.classList.contains('merlog-row-highlight')) return true;
    const areaCell = tr.querySelector('[data-label="איזור"]');
    if (areaCell && /מרלוג/.test(areaCell.textContent)) return true;
    const driverCell = tr.querySelector('[data-label="נהג"]');
    if (driverCell && /מרלוג/.test(driverCell.textContent)) return true;
    return false;
  }

  const dtPredicate = function (settings, data, dataIndex) {
    const tableEl = $(TBL)[0];
    if (!tableEl || settings.nTable !== tableEl) return true;
    const table = dt();
    const node = table ? table.row(dataIndex).node() : null;
    return node ? rowIsMerlog(node) : true;
  };
  dtPredicate._toolbox = FILTER_KEY;

  function applyDT() {
    $.fn.dataTable.ext.search = $.fn.dataTable.ext.search.filter(
      (fn) => fn._toolbox !== FILTER_KEY
    );
    if (active) $.fn.dataTable.ext.search.push(dtPredicate);
    const table = dt();
    if (table) table.draw(false);
  }

  function applyVanilla() {
    const body = document.querySelector(`${TBL} tbody`);
    if (!body) return;
    body.querySelectorAll('tr').forEach((tr) => {
      tr.style.display = !active || rowIsMerlog(tr) ? '' : 'none';
    });
  }

  function updateAppliedChip() {
    const box = document.querySelector(APPLIED_CONTAINER);
    if (!box) return;
    let chip = box.querySelector(`.filter-badge[data-toolbox="${FILTER_KEY}"]`);
    if (active && !chip) {
      chip = document.createElement('div');
      chip.className = 'filter-badge filter-badge-btn mb-1 mr-2';
      chip.dataset.toolbox = FILTER_KEY;
      chip.innerHTML =
        '<span>מרלוג</span><i class="ki ki-close icon-xs text-primary cursor-pointer"></i>';
      box.prepend(chip);
    } else if (!active && chip) {
      chip.remove();
    }
  }

  function refresh() {
    if (hasDT()) applyDT();
    else applyVanilla();
    updateAppliedChip();
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('.filter-badge, [data-chip], [data-filter-value]');
    if (!el) return;
    const val = (el.dataset.filterValue || el.dataset.chip || el.textContent || '').trim();
    if (val !== 'מרלוג') return;
    active = !active;
    refresh();
  });

  document.addEventListener('click', (e) => {
    const x = e.target.closest(
      `.filter-badge[data-toolbox="${FILTER_KEY}"] .ki-close, .filter-badge[data-toolbox="${FILTER_KEY}"] .fa-times`
    );
    if (!x) return;
    active = false;
    refresh();
  });

  const body = document.querySelector(`${TBL} tbody`);
  if (body) {
    new MutationObserver(() => {
      if (active) refresh();
    }).observe(body, { childList: true });
  }

  window.toolboxMerlogFilter = {
    enable: () => {
      active = true;
      refresh();
    },
    disable: () => {
      active = false;
      refresh();
    },
    toggle: () => {
      active = !active;
      refresh();
    },
  };
})();

/* global jQuery */
/* global Papa */ // ENSURING PAPA IS GLOBAL


// =========================
// PREVIEW CSS (class-based)
// Stable, idempotent injection (replace-or-update) + dedupe
// =========================
function __tmcEnsurePreviewCSS(){
  try{
    const css = `
    :root{
      /* cap each card width so it fits content and never stretches full row */
      --tmc-card-max: 300px; /* Reduced from 560px for better fit */
    }

    /* ===========================
       PREVIEW PREFLIGHT (no JS/classes)
       Ensures correct layout on first paint, before observers add our classes.
       =========================== */
    /* Container of cards in the preview <td> */
    tr[id^="preview-for-"] td[colspan] > div:first-child{
      display: flex !important;
      flex-wrap: wrap !important;
      align-items: flex-start !important; /* Changed from center to flex-start for better content fitting */
      justify-content: flex-start !important;
      gap: 8px !important;
      box-sizing: border-box !important;
      max-width: 100% !important;
      /* Make first paint closer to final measured clamp to reduce jump */
      max-inline-size: calc(100vw - var(--map-width, 0px)) !important;
      transition: none !important;
    }
    /* Each raw card (old markup without our classes) becomes fit-to-content.
       Make preflight match final layout exactly to prevent jumping. */
    tr[id^="preview-for-"] td[colspan] > div:first-child >
      [class*="d-flex"][class*="align-items-center"][class*="border"][class*="rounded"]{
      display: flex !important;
      align-items: flex-start !important;
      gap: 10px !important;
      flex: 0 1 auto !important; /* Allow cards to shrink to content size */
      width: auto !important;
      min-width: 180px !important; /* Reduced from 260px for better fit */
      max-width: min(250px, 100%) !important; /* Reduced max width for better fit */
      white-space: normal !important;
      align-self: flex-start !important;
      /* Match the class-based rules exactly to prevent jumping */
      transition: none !important;
    }
    /* Extra safety: if the raw card classes drift, treat any DIRECT child
       that looks like a card (has an image or .text-muted) as a card. */
    tr[id^="preview-for-"] td[colspan] > div:first-child > div:has(img),
    tr[id^="preview-for-"] td[colspan] > div:first-child > div:has(.text-muted){
      display:flex !important;
      align-items:flex-start !important;
      gap:10px !important;
      flex:0 1 auto !important;
      width:auto !important;
      min-width:180px !important;
      max-width:min(250px, 100%) !important;
      white-space:normal !important;
      transition:none !important;
    }
    /* Kill legacy inline props on the raw card (before our JS can clean them) */
    tr[id^="preview-for-"] td[colspan] > div:first-child >
      [class*="d-flex"][class*="align-items-center"][class*="border"][class*="rounded"][class*="p-2"][style*="white-space:nowrap"],
    tr[id^="preview-for-"] td[colspan] > div:first-child >
      [class*="d-flex"][class*="align-items-center"][class*="border"][class*="rounded"][class*="p-2"][style*="white-space: nowrap"]{
      white-space: normal !important;
    }
    tr[id^="preview-for-"] td[colspan] > div:first-child >
      [class*="d-flex"][class*="align-items-center"][class*="border"][class*="rounded"][class*="p-2"][style*="width:100%"],
    tr[id^="preview-for-"] td[colspan] > div:first-child >
      [class*="d-flex"][class*="align-items-center"][class*="border"][class*="rounded"][class*="p-2"][style*="max-width:100%"]{
      width: auto !important;
      max-width: min(var(--tmc-card-max), 100%) !important;
    }
    /* Bigger product image from the very first paint */
    tr[id^="preview-for-"] td[colspan] > div:first-child >
      [class*="d-flex"][class*="align-items-center"][class*="border"][class*="rounded"][class*="p-2"] img{
      width: 80px !important;
      height: 80px !important;
      object-fit: contain !important;
      flex: 0 0 auto !important;
      margin-inline-start: 6px !important;
    }
    /* Let meta wrap naturally only inside cards (not the entire row) */
    tr[id^="preview-for-"] td[colspan] .tmc-preview-card .text-muted{
      white-space: normal !important;
      word-break: break-word !important;
    }

    /* Blanket: kill transitions/animations inside previews to avoid jank */
    tr[id^="preview-for-"] .tmc-preview-card,
    tr[id^="preview-for-"] .tmc-preview-card *{
      transition: none !important;
      animation: none !important;
    }

    /* Reserve space for text before split/measure to reduce layout shift */
    tr[id^="preview-for-"] .tmc-preview-card .tmc-preview-text{
      min-height: 2.2em; /* tweak if needed */
    }

    /* Multi-line preview layout (single source of truth) */
    .tmc-preview-row {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start; /* Changed from center to flex-start for better content fitting */
      justify-content: flex-start;
      gap: 8px;
      max-width: 100%;
      box-sizing: border-box;
      /* avoid any theme/framework transitions causing "style shake" */
      transition: none !important;
      /* clamp לפי משתנה גלובלי – בלי כתיבה JS פר־שורה */
      max-inline-size: calc(100vw - var(--map-width, 0px));
    }
    /* === Empty-state sizing: no big reserved height === */
    tr[id^="preview-for-"] > td > .tmc-preview-row:has(.tmc-preview-empty){
      content-visibility: visible !important;      /* אל תשתמש ברזרבה גדולה */
      contain-intrinsic-size: 1px 36px !important; /* רזרבה זעירה בלבד */
      min-height: 0 !important;
      height: auto !important;
      padding-block: 4px !important;
      margin: 0 !important;
    }
    /* Collapse ONLY when truly empty: allow an "empty-state" placeholder */
    tr[id^="preview-for-"] td[colspan] > .tmc-preview-row:empty,
    tr[id^="preview-for-"] td[colspan] > .tmc-preview-row:not(:has(.tmc-preview-card, .tmc-preview-empty)){
      display: none !important;
      padding: 0 !important;
      margin: 0 !important;
      min-height: 0 !important;
      height: 0 !important;
      content-visibility: visible !important;  /* ensure no reserved intrinsic size */
      contain-intrinsic-size: auto !important;
    }

    /* Empty-state chip shown when an order has no items */
    .tmc-preview-empty{
      display: inline-flex !important;
      align-items: center !important;
      gap: 6px !important;
      padding: 8px 12px !important;
      border: 1px dashed #d9d9d9 !important;
      border-radius: 12px !important;
      background: #f8f9fa !important;
      color: #6c757d !important;
      font-size: .9rem !important;
      line-height: 1.2 !important;
      white-space: normal !important;
      direction: rtl !important;
    }
    .tmc-preview-card {
      display: flex !important;
      align-items: flex-start !important; /* Changed from center to flex-start for better content fitting */
      gap: 10px !important;
      /* fit-to-content: never stretch across whole line */
      flex: 0 1 auto !important; /* Allow cards to shrink to content size */
      width: auto !important;
      min-width: 180px !important; /* Reduced from 260px for better fit */
      max-width: min(250px, 100%) !important; /* Reduced max width for better fit */
      align-self: flex-start !important;
      white-space: normal !important; /* ensure text breaks inside the card */
      /* avoid transition flicker between initial and canonical layout */
      transition: none !important;
    }
    /* kill legacy inline rules that force full-width/nowrap on old variant */
    .tmc-preview-card[style*="width: 100%"],
    .tmc-preview-card[style*="max-width: 100%"],
    .tmc-preview-card[style*="white-space:nowrap"],
    .tmc-preview-card[style*="white-space: nowrap"],
    .tmc-preview-card[style*="max-width:100%"] {
      width: auto !important;
      max-width: min(var(--tmc-card-max), 100%) !important;
      white-space: normal !important;
    }
    .tmc-preview-img {
      width: 80px !important;
      height: 80px !important;
      object-fit: contain !important;
      flex: 0 0 auto;
      margin-inline-start: 6px;
    }
    /* make sure older DOM that lacks .tmc-preview-img still gets big images */
    .tmc-preview-row .tmc-preview-card img {
      width: 80px !important;
      height: 80px !important;
      object-fit: contain !important;
    }
    /* force wrapping even if legacy inline style tried to enforce nowrap */
    .tmc-preview-row .tmc-preview-card,
    .tmc-preview-row .tmc-preview-card * {
      white-space: normal !important;
    }
    /* ensure name/SKU/price/qty appear on separate lines consistently */
    .tmc-preview-meta > div { display:block; }

    /* Barcode styling rules
       – Keep the green highlight ONLY inside the table (td.barcode-highlight)
       – Neutralize it in PREVIEW so it never overlaps the title */
    td.barcode-highlight{
      background-color:#e6ffed !important;
      color:#0a7a0a !important;
    }
    tr[id^="preview-for-"] .tmc-preview-meta .barcode-highlight{
      background:transparent !important;
      color:inherit !important;
    }
    tr[id^="preview-for-"] .tmc-preview-meta .barcode-highlight b{
      color:#000 !important;  /* ספרות הברקוד המודגשות – שחור */
      font-weight:700 !important;
    }

    /* Reserve space only for card meta (not for the row itself) */
    tr[id^="preview-for-"] td[colspan] .tmc-preview-card .text-muted{
      display: block;
      /* 3 lines worth; assumes ~1.2 line-height on the site */
      min-height: calc(1em * 3.2);
    }

    /* quantity coloring, meta, etc... (unchanged rules below) */
    .tmc-preview-meta { font-size: .85rem; line-height: 1.2; color: #6c757d; }
    .tmc-preview-title { line-height: 1.2; }
    .tampermonkey-picked-full { color: #0c7b0c; font-weight: 600; }
    .tampermonkey-picked-partial { color: #b26a00; font-weight: 600; }
    .tampermonkey-picked-none { color: #842029; font-weight: 600; }

    /* When the (left) map is open, keep previews out from under it */
    .map-open tr[id^="preview-for-"] > td > .tmc-preview-row {
      /* במקום margin: מזיזים את אזור התוכן פנימה */
      padding-inline-start: var(--map-width, 0px);
      /* מונע גלישה של הכרטיס הראשון מתחת למפה */
      overflow: clip;
      content-visibility: auto;
      contain: layout paint style;
      /* ברירת מחדל לכרטיסים אמיתיים */
      contain-intrinsic-size: 1px 400px;
    }
    /* תחת map-open: כאשר מדובר במצב־ריק, אל תשמור 400px */
    body.map-open tr[id^="preview-for-"] > td > .tmc-preview-row:has(.tmc-preview-empty){
      content-visibility: visible !important;
      contain-intrinsic-size: 1px 36px !important;
    }
    `;
    // Replace-or-create the single style node
    let st = document.getElementById('tmc-preview-css');
    if (!st) {
      st = document.createElement('style');
      st.id = 'tmc-preview-css';
      document.head.appendChild(st);
    }
    if (st.textContent !== css) st.textContent = css;

    // Deduplicate stray duplicates (caused by older blocks)
    const all = Array.from(document.querySelectorAll('style#tmc-preview-css'));
    all.forEach(node => { if (node !== st) node.remove(); });

    // Hedge against late injections: stabilize for 1s after first paint
    let ticks = 0;
    const stabilize = () => {
      // ensure our node is last and content unchanged
      document.head.appendChild(st);
      const dups = Array.from(document.querySelectorAll('style#tmc-preview-css'));
      dups.forEach(node => { if (node !== st) node.remove(); });
      if (++ticks < 20) requestAnimationFrame(stabilize);
    };
    requestAnimationFrame(stabilize);
  }catch(_){}
}

/* =========================
   PHONE WARNING CSS (blink)
   ========================= */
function __tmcEnsurePhoneCSS(){
  try{
    const css = `
      @keyframes tmcPhonePulse {
        0%, 100% { box-shadow: inset 0 0 0 0 rgba(255,255,0,0.00); }
        50%      { box-shadow: inset 0 0 0 9999px rgb(255, 255, 0); }
      }
      tr.tmc-phone-blink { animation: tmcPhonePulse 1.2s ease-in-out infinite; }
      tr.tmc-phone-blink > td { animation: inherit; }
      tr[id^="visit-row-"]:has(td[data-label="טלפון"]:empty) {
        animation: tmcPhonePulse 1.2s ease-in-out infinite;
      }
    `;
    let st = document.getElementById('tmc-phone-css');
    if (!st){
      st = document.createElement('style');
      st.id = 'tmc-phone-css';
      document.head.appendChild(st);
    }
    if (st.textContent !== css) st.textContent = css;
  }catch(_){}
}

/* =========================
   COLOR LEGEND CSS (aside bottom, sticky)
   ========================= */
function __tmcEnsureLegendCSS(){
  try{
    const css = `
      /* Hard clamp: prevent any horizontal overflow from the aside scroll root */
      #kt_aside_menu{
        overflow-x: hidden !important;
        box-sizing: border-box !important;
      }
      /* Legend container anchored inside the scrollable aside menu */
      #kt_aside_menu .tmc-color-legend{
        position: sticky !important;
        bottom: 0 !important;
        z-index: 4 !important;                  /* keep above PS rails */
        border-top: 1px solid rgba(0,0,0,.08) !important;
        box-shadow: 0 -4px 8px rgba(0,0,0,.02) !important;  /* צל עדין יותר */
        direction: rtl !important;
        font-size: 11px !important;   /* פונט קטן כנדרש */
        line-height: 1.25 !important;
        background: #fff !important;
        padding: 6px 8px !important;
        max-width: 100% !important;
        min-width: 0 !important;
        box-sizing: border-box !important;
        /* אל תחתוך את התוכן אנכית: אפשר גלילה פנימית כשצריך */
        overflow-x: hidden !important;
        overflow-y: auto !important;
        /* ברזולוציות/חלונות נמוכים: גבול גובה חכם עם גלילה (קצת יותר נדיב לטאבלט) */
        max-height: clamp(120px, 34vh, 240px) !important;
        overscroll-behavior: contain !important;
        -webkit-overflow-scrolling: touch !important;
      }
      /* Spacer that reserves scrollable room above the sticky legend */
      #kt_aside_menu #tmc-legend-spacer{
        display: block !important;
        height: 0 !important;          /* sized dynamically by JS */
        margin: 0 !important;
        padding: 0 !important;
        pointer-events: none !important;
        border: 0 !important;
      }
      #kt_aside_menu .tmc-color-legend .tmc-legend-title{
        font-weight: 600 !important;
        margin-bottom: 6px !important;
        color: #444 !important;
        font-size: 11px !important;
      }
      #kt_aside_menu .tmc-color-legend .tmc-legend-list{
        display: grid !important;
        grid-template-columns: 1fr !important; /* טור אחד: שורה-תגית מלאה */
        gap: 4px 8px !important;               /* פחות ריווח בין שורות */
        margin: 0 !important;
        padding: 0 2px !important;             /* מיקרו־ריווח פנימי כדי למנוע נגיעה בקצה */
        list-style: none !important;
        box-sizing: border-box !important;
      }
      #kt_aside_menu .tmc-color-legend .tmc-legend-item{
        display: block !important;             /* כל פריט הוא בלוק */
        /* אפשר לתת לטקסט להישבר אם צריך, חיתוך אמיתי יתבצע בתוך ה-chip */
        white-space: normal !important;
        box-sizing: border-box !important;
      }
      #kt_aside_menu .tmc-color-legend .tmc-legend-chip{
        display: flex !important;
        align-items: center !important;
        gap: 6px !important;
        width: 100% !important;
        max-width: 100% !important;            /* ודא שאין גלישה אופקית */
        min-width: 0 !important;
        padding: 3px 6px !important;           /* עוד פחות גובה לשורה */
        border-radius: 4px !important;
        border: 1px solid rgba(0,0,0,.08) !important;
        font-weight: 500 !important;
        font-size: 10.5px !important;
        line-height: 1.12 !important;
        color: #222 !important;                /* טקסט כהה על רקע בהיר */
        text-align: right !important;
        box-sizing: border-box !important;
      }
      /* Checkbox hidden - using ::before pseudo-element instead (CSS-only solution) */
      #kt_aside_menu .tmc-color-legend .tmc-legend-checkbox {
        display: none !important;
      }
      #kt_aside_menu .tmc-color-legend .tmc-legend-label {
        box-sizing: border-box !important;
        overflow: hidden !important;           /* אליפסיס רך */
        text-overflow: ellipsis !important;
      }
      /* עוד כיווץ במסכים נמוכים מאוד */
      @media (max-height: 900px){
        #kt_aside_menu .tmc-color-legend{ font-size: 10px !important; }
        #kt_aside_menu .tmc-color-legend .tmc-legend-chip{
          padding: 3px 5px !important;
          font-size: 10px !important;
          line-height: 1.1 !important;
        }
      }
      /* צבעים לפי משמעות */
      #kt_aside_menu .tmc-color-legend .tmc-legend-chip--merlog  { background: #ffcaca !important; }
      #kt_aside_menu .tmc-color-legend .tmc-legend-chip--phone   { background: #ff0 !important;   }
      /* Active/selected state for legend chips */
      #kt_aside_menu .tmc-color-legend .tmc-legend-chip.is-active {
        outline: 2px solid rgba(0,0,0,.45) !important;
        box-shadow: 0 0 0 2px rgba(0,0,0,.10) inset !important;
      }
      #kt_aside_menu .tmc-color-legend .tmc-legend-chip--ready   { background: #dfffe5 !important; }
      #kt_aside_menu .tmc-color-legend .tmc-legend-chip--coord   { background: #E3D1FD !important; }
      #kt_aside_menu .tmc-color-legend .tmc-legend-chip--branch  { background: #EBD9C3 !important; }
      #kt_aside_menu .tmc-color-legend .tmc-legend-chip--mission { background: #ffadeb !important; }
    `;
    let st = document.getElementById('tmc-legend-css');
    if (!st){
      st = document.createElement('style');
      st.id = 'tmc-legend-css';
      document.head.appendChild(st);
    }
    if (st.textContent !== css) st.textContent = css;
  }catch(_){}
}

/* =========================
   Insert the color legend once into #kt_aside_menu
   ========================= */
function __tmcInsertColorLegend(){
  try{
    const menu = document.getElementById('kt_aside_menu');
    if (!menu) return;
    if (menu.querySelector('#tmc-color-legend')) return; // already inserted

    // Create (idempotent) spacer that will reserve room above the sticky legend
    const spacer = document.createElement('div');
    spacer.id = 'tmc-legend-spacer';
    spacer.setAttribute('aria-hidden','true');

    const legend = document.createElement('div');
    legend.id = 'tmc-color-legend';
    legend.className = 'tmc-color-legend';
    legend.innerHTML = `
      <div class="tmc-legend-title">מקרא צבעים</div>
      <ul class="tmc-legend-list">
        <li class="tmc-legend-item">
          <span class="tmc-legend-chip tmc-legend-chip--merlog" data-legend-key="merlog" data-key="merlog">
            <span class="tmc-legend-checkbox">☐</span><span class="tmc-legend-label">מרלוג</span>
          </span>
        </li>
        <li class="tmc-legend-item">
          <span class="tmc-legend-chip tmc-legend-chip--phone" data-legend-key="phone" data-key="phone">
            <span class="tmc-legend-checkbox">☐</span><span class="tmc-legend-label">אין טלפון</span>
          </span>
        </li>
        <li class="tmc-legend-item">
          <span class="tmc-legend-chip tmc-legend-chip--ready" data-legend-key="ready" data-key="ready">
            <span class="tmc-legend-checkbox">☐</span><span class="tmc-legend-label">מוכן</span>
          </span>
        </li>
        <li class="tmc-legend-item">
          <span class="tmc-legend-chip tmc-legend-chip--coord" data-legend-key="coord" data-key="coord">
            <span class="tmc-legend-checkbox">☐</span><span class="tmc-legend-label">לתאם</span>
          </span>
        </li>
        <li class="tmc-legend-item">
          <span class="tmc-legend-chip tmc-legend-chip--branch" data-legend-key="branch" data-key="branch">
            <span class="tmc-legend-checkbox">☐</span><span class="tmc-legend-label">לסניף</span>
          </span>
        </li>
        <li class="tmc-legend-item">
          <span class="tmc-legend-chip tmc-legend-chip--mission" data-legend-key="mission" data-key="mission">
            <span class="tmc-legend-checkbox">☐</span><span class="tmc-legend-label">משימה</span>
          </span>
        </li>
      </ul>
    `;
    // Place spacer + legend before Perfect Scrollbar rails so both remain visible and correct
    const railX = menu.querySelector('.ps__rail-x');
    if (railX){
      menu.insertBefore(spacer, railX);
      menu.insertBefore(legend, railX);
    } else {
      menu.appendChild(spacer);
      menu.appendChild(legend);
    }

    // After legend exists, reserve just-enough space inside the aside
    __tmcReserveLegendSpace();

    // Keep it accurate on any layout change
    try{
      const ro = new ResizeObserver(() => __tmcReserveLegendSpace());
      ro.observe(legend);
      ro.observe(menu);
    }catch(_e){}
    window.addEventListener('resize', __tmcReserveLegendSpace, { passive: true });
    window.addEventListener('orientationchange', __tmcReserveLegendSpace, { passive: true });
  }catch(e){
    try{ console.warn('Legend insert failed', e); }catch(_){}
  }
}

// Compute and set the bottom reserve ONLY for the aside menu
function __tmcReserveLegendSpace(){
  const legend = document.getElementById('tmc-color-legend');
  const aside  = document.getElementById('kt_aside_menu');
  const spacer = document.getElementById('tmc-legend-spacer');
  if (!legend || !aside || !spacer) return;
  const cs = getComputedStyle(legend);
  const h  = legend.offsetHeight
           + parseFloat(cs.marginTop || '0')
           + parseFloat(cs.marginBottom || '0');
  // Size the spacer (not the container padding) to avoid sticky+padding gap
  spacer.style.height = (Math.ceil(h) + 8) + 'px';
  // Ensure the scroll container has no bottom padding that could lift sticky
  try{
    aside.style.paddingBottom = '0px';
    aside.style.removeProperty('--tmc-legend-reserve');
  }catch(_){}
}

// Helper: toggle infinite row blink class
function __tmcSetRowBlink(tr, shouldBlink){
  if (!tr) return;
  if (shouldBlink) tr.classList.add('tmc-phone-blink');
  else tr.classList.remove('tmc-phone-blink');
}

// -------- Branch (סניף) detection helpers --------
function __tmcNormalizeText(t) {
  return (t || '').replace(/[\s,.;:/()|"'{}\[\]\-\\]+/g, ' ').trim();
}

// זיהוי "סניף" כולל שגיאות: ססניף/סנניף/סניפ/סניףף/סניפפ, בלי י' ("סנף"), רבים ("סניפים"),
// ועם תחיליות ל/ב/מ/ו/ה/מה/וכו'. מאפשר גם רווחים/תווי מפריד בין אותיות.
// דפוס בסיס: ס{1,2} נ{1,2} י{0,2} ף|פ{1,3} [+ "ים" לאופציית רבים]
const __tmcBRANCH_RE = new RegExp(
  '(?:^|[\\s,.;:/()|\"\\\'\\[\\]{}\\-])' +              // גבול "מילה"
  '(?:[לבמוה]{0,2}ה?)' +                              // תחיליות: ל/ב/מ/ו/ה (כולל ה"א הידיעה אחרי מ/ל/ב)
  '(?:' +
    'ס{1,2}\\s*נ{1,2}\\s*(?:י{0,2})\\s*(?:ף{1,3}|פ{1,3})' + // סניף/סניפ/סנף, כפילויות
  ')' +
  '(?:ים)?' +                                         // רבים: סניפים
  '(?=$|[\\s,.;:/()|\"\\\'\\[\\]{}\\-])'              // גבול "מילה"
);

function __tmcContainsBranch(t) {
  const s = __tmcNormalizeText(t);
  return __tmcBRANCH_RE.test(s);
}

// מזהה פורמט בינלאומי ישראלי (+972 או 00972) ללא ה-0 המוביל
function __tmcIsILInternational(digits){
  if (!digits) return false;
  let d = digits;
  // תמיכה גם ב-00972 וגם ב-+972 (פלוס כבר הוסר בסינון, נשאר 972)
  if (d.startsWith('00')) d = d.slice(2);
  if (!d.startsWith('972')) return false;
  const rest = d.slice(3); // בלי קידומת המדינה
  // קווי בזק: 8 ספרות אחרי 972 (כי 04xxxxxxx ⇒ 4 + 7)
  // סלולר:   9 ספרות אחרי 972 (כי 05xxxxxxxx ⇒ 5x + 7)
  return rest.length === 8 || rest.length === 9;
}

/* NEW: purge legacy preview styles to prevent cascade racing on first paint */
(function __tmcPurgeLegacyPreviewStyles(){
  try{
    const KEEP = new Set(['tmc-preview-css','tm-map-aware-preview-css','tm-preview-cv-style','tm-ps-touchaction-style']);
    // Common legacy ids/markers we used in older builds
    const LEGACY_ID_RX = /^(tmc-legacy-preview-css|tm-preview-style|tmc-old-preview-css)$/i;
    const LEGACY_TEXT_RX = /(one[- ]line preview|inline[- ]flex preview|tmc-legacy-preview|tmc-preview-inline|preview-inline|white-space:\s*nowrap|tr\[id\^="preview-for-"])/i;
    document.querySelectorAll('style,link[rel="stylesheet"]').forEach(node=>{
      const id = (node.id||'').toLowerCase();
      if (KEEP.has(node.id)) return;
      const looksLegacyById = LEGACY_ID_RX.test(id);
      const looksLegacyByText = node.tagName==='STYLE' && LEGACY_TEXT_RX.test(node.textContent||'');
      if (looksLegacyById || looksLegacyByText) {
        try{ node.remove(); }catch(_){}
      }
    });
  }catch(_){}
})();

/* -----------------------------------------------------------------------
   CANONICAL PREVIEW LAYOUT OVERRIDE  (de-duplicated)
   - Ensure only one canonical normalizer/observer is active.
   - Always normalize + split meta into lines now and on future DOM changes.
   ----------------------------------------------------------------------- */
(function canonicalPreviewLayout(){
  if (window.__tmcPreviewCanonInstalled) return; // guard duplicates
  window.__tmcPreviewCanonInstalled = true;
  try{
    // If an old helper exists anywhere, make it a no-op so it can't revert to single line.
    if (typeof window.__forceInlineFlexOnPreviewCards === 'function') {
      window.__forceInlineFlexOnPreviewCards = function(root){ /* deprecated */ };
    }
  }catch(_){}

  // Make sure our CSS is in.
  try{ __tmcEnsurePreviewCSS(); }catch(_){}

  // A safe, idempotent normalize that prefers the class-based (multi-line) layout.
  function enforce(root){
    try{
      var el = root || document;
      // Single source of truth for styles:
      // Delegate to the heavy impl if present; otherwise perform a minimal, non-flickery fallback.
      if (!window.__tmcNormalizePreviewStyles) {
        window.__tmcNormalizePreviewStyles = function(r){
          if (typeof window.__tmcNormalizePreviewStylesImpl === 'function'){
            return window.__tmcNormalizePreviewStylesImpl(r);
          }
          // Fallback: only neutralize nowrap until impl is loaded, to avoid layout jumps.
          const root = r || document;
          root.querySelectorAll('.tmc-preview-row .tmc-preview-card, .tmc-preview-row .tmc-preview-card *')
              .forEach(n => { try{ if (n && n.style) n.style.whiteSpace = ''; }catch(_){} });
        };
      }
      window.__tmcNormalizePreviewStyles(el);

      if (typeof window.splitPreviewMetaLines === 'function') {
        window.splitPreviewMetaLines(el);
      }
      // אחרי פיצול "שם/מק״ט/מחיר/כמות" – הדגש 3 ספרות אחרונות בברקוד
      try { window.__tmcApplyBarcodeLast3Bold && window.__tmcApplyBarcodeLast3Bold(el); } catch(_){}
      if (typeof window.__tmcClampAllPreviewRows === 'function') {
        window.__tmcClampAllPreviewRows(el);
      }
      if (typeof window.optimizePreviewImages === 'function') {
        window.optimizePreviewImages(el);
      }
    }catch(_){}
  }

  // Enforce now, and whenever the DOM mutates around previews.
  try { enforce(); } catch(_){}
  try {
    if (!window.__tmcPreviewCanonMO){
      const enforceThrottled = oncePerAnimationFrame(() => enforce());
      const PREVIEW_ROW_SEL = 'tr[id^="preview-for-"]';
      function touchesPreview(muts){
        for (const m of muts){
          // Attribute changes: only if they occur on/inside a preview row
          if (m.type === 'attributes'){
            const t = m.target;
            if (t && (t.closest?.(PREVIEW_ROW_SEL))) return true;
          }
          // Child list changes: if any added/removed node is (or contains) a preview row or card
          if (m.type === 'childList'){
            for (const n of m.addedNodes || []){
              if (n.nodeType === 1){
                if (n.matches?.(PREVIEW_ROW_SEL)) return true;
                if (n.querySelector?.(PREVIEW_ROW_SEL)) return true;
              }
            }
            for (const n of m.removedNodes || []){
              if (n.nodeType === 1){
                if (n.matches?.(PREVIEW_ROW_SEL)) return true;
                if (n.querySelector?.(PREVIEW_ROW_SEL)) return true;
              }
            }
          }
        }
        return false;
      }
      window.__tmcPreviewCanonMO = new MutationObserver((muts)=>{
        if (touchesPreview(muts)) enforceThrottled();
      });
      const root = document.getElementById('operator-store-visits-table_wrapper')
                || document.body || document.documentElement;
      window.__tmcPreviewCanonMO.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class','style']
      });
    }
  } catch(_){}
})();

/* -----------------------------------------------------------------------
   PREVIEW IMAGE OPTS (lazy/async) - idempotent
   ----------------------------------------------------------------------- */
(function installImageOptimizations(){
  if (window.__tmcImageOptsInstalled) return;
  window.__tmcImageOptsInstalled = true;
  window.optimizePreviewImages = function(root){
    const el = root || document;
    el.querySelectorAll('.tmc-preview-row img, .tmc-preview-img img, img.tmc-preview-img')
      .forEach(img => {
        try {
          if (!img.loading) img.loading = 'lazy';
          if (!img.decoding) img.decoding = 'async';
        } catch(_){}
      });
  };
})();

/* -----------------------------------------------------------------------
   PREVIEW RESTORE ON REFRESH: disable
   - If the navigation is a page reload/back-forward cache restore, do NOT
     reopen previews for this load. Also clear any leftover open ids.
   ----------------------------------------------------------------------- */
(function hardenPreviewRestoreOnReload(){
  function clearIntentOnReload(){
    try {
      const nav = performance.getEntriesByType && performance.getEntriesByType('navigation');
      const type = nav && nav[0] && nav[0].type;
      if (type === 'reload') {
        sessionStorage.setItem('tmcRestoreIntent', '0');
        sessionStorage.removeItem('openPreviewTaskIds');
        sessionStorage.removeItem('openPreviewTaskIds_v2');
      }
    }catch(_){}
  }
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) {
      try{
        sessionStorage.setItem('tmcRestoreIntent', '0');
        sessionStorage.removeItem('openPreviewTaskIds');
        sessionStorage.removeItem('openPreviewTaskIds_v2');
      }catch(_){}
    }
    clearIntentOnReload();
  }, { once:true });
  // Also do an early check at script start
  clearIntentOnReload();
})();

/* -----------------------------------------------------------------------
   DEVTOOLS NOISE: suppress blocked-analytics/network rejections safely
   ----------------------------------------------------------------------- */
(function quietBlockedAnalyticsNoise(){
  // Many of these ERR_BLOCKED_BY_CLIENT messages are from GA/Facebook/Clarity.
  // Swallow only these; leave real errors alone.
  window.addEventListener('error', function(e){
    try{
      const m = String(e.message||'').toLowerCase();
      const t = String(e.filename||'').toLowerCase();
      if (
        m.includes('net::err_blocked_by_client') ||
        t.includes('google-analytics.com') ||
        t.includes('connect.facebook.net') ||
        t.includes('clarity.ms')
      ){
        e.preventDefault();
      }
    }catch(_){}
  }, true);
  window.addEventListener('unhandledrejection', function(e){
    try{
      const msg = (e.reason && (e.reason.message||e.reason)) || '';
      if (String(msg).includes('message channel closed')) e.preventDefault();
    }catch(_){}
  });
})();

// IMMEDIATE Crisp safe mode configuration - run before any other code
(function() {
  // Set up Crisp safe mode as early as possible
  if (typeof window !== 'undefined') {
    window.CRISP_SAFE_MODE = true;
    window.USERSCRIPT_SAFE_MODE = true;

    if (!window.$crisp) window.$crisp = [];
    if (Array.isArray(window.$crisp)) window.$crisp.push(["safe", true]);

    if (!window.crisp) window.crisp = [];
    if (Array.isArray(window.crisp)) window.crisp.push(["safe", true]);
  }

  // [PS PASSIVE FIX] install at startup (idempotent)
  installPassiveFixForPerfectScrollbar();
  document.addEventListener('DOMContentLoaded', installPassiveFixForPerfectScrollbar, { once: true });
  window.addEventListener('load', installPassiveFixForPerfectScrollbar, { once: true });

  /* ===== TASK PAGE DETECTION + KILL SWITCH ===== */
  function __tmcIsTaskPage(url){
    try{
      const u = String(url || location.href);
      // match /tasks/, /tasks/123, /tasks/123?... — conservative and fast
      return /\/tasks\/(\d+)?(\b|[/?#])/.test(u);
    }catch(_){ return false; }
  }
  function __tmcMarkPageType(){
    const isTask = __tmcIsTaskPage();
    try{
      document.documentElement.classList.toggle('tmc-task-page', isTask);
      if (document.body) document.body.classList.toggle('tmc-task-page', isTask);
    }catch(_){}
    __tmcEnsureTaskPageKillCSS();
    if (isTask){
      __tmcStartTaskPageStripper();
    }
  }
  function __tmcEnsureTaskPageKillCSS(){
    const css = `
      /* Kill all legend UI on full screen task pages */
      body.tmc-task-page #tmc-color-legend{ display:none !important; }
      body.tmc-task-page #tmc-legend-spacer{ display:none !important; height:0 !important; }

      /* Nuke ANY container that uses a *-highlight class on task pages */
      body.tmc-task-page .panel_view[class*="-highlight"],
      body.tmc-task-page .offcanvas[class*="-highlight"],
      body.tmc-task-page .card[class*="-highlight"],
      body.tmc-task-page .modal[class*="-highlight"],
      body.tmc-task-page [class*="-highlight"] > .tab-content,
      body.tmc-task-page [class*="-highlight"] > .tab-pane,
      body.tmc-task-page [class*="-row-highlight"]{
        background: transparent !important;
        background-color: transparent !important;
        box-shadow: none !important;
        border-color: transparent !important;
      }

      /* Inline tokens that sometimes get background on detail pages */
      body.tmc-task-page a[class$="-highlight"],
      body.tmc-task-page span[class$="-highlight"],
      body.tmc-task-page div[class$="-highlight"],
      body.tmc-task-page p[class$="-highlight"],
      body.tmc-task-page td[class$="-highlight"]{
        background: transparent !important;
        background-color: transparent !important;
        color: inherit !important;
        box-shadow: none !important;
        border-color: transparent !important;
      }

      /* Kill phone yellow blink on task pages */
      body.tmc-task-page tr.tmc-phone-blink,
      body.tmc-task-page tr[id^="visit-row-"]:has(td[data-label="טלפון"]:empty){
        animation: none !important;
        box-shadow: none !important;
      }
    `;
    let st = document.getElementById('tmc-taskpage-kill');
    if (!st){
      st = document.createElement('style');
      st.id = 'tmc-taskpage-kill';
      document.head.appendChild(st);
    }
    if (st.textContent !== css) st.textContent = css;
  }
  function __tmcRemoveLegendIfTaskPage(){
    if (!__tmcIsTaskPage()) return;
    try{
      const menu   = document.getElementById('kt_aside_menu');
      const legend = document.getElementById('tmc-color-legend');
      const spacer = document.getElementById('tmc-legend-spacer');
      if (legend) legend.remove();
      if (spacer) spacer.remove();
      if (menu){
        menu.style.paddingBottom = '0px';
        try{ menu.style.removeProperty('--tmc-legend-reserve'); }catch(_){}
      }
    }catch(_){}
  }
  /* Hard removal of highlight classes on /tasks/ to defeat dynamic redraws */
  function __tmcStartTaskPageStripper(){
    // Lightweight stripper: runs only when there is actually something to clean,
    // with a few scheduled passes. No global MutationObserver.
    const STRIP = () => {
      if (!document.body.classList.contains('tmc-task-page')) return;
      const nodes = document.querySelectorAll('[class*="-highlight"]');
      if (!nodes || nodes.length === 0) return;           // fast exit
      const re = /\b(?:merlog|mission|coord|branch|ready|phone)(?:-row)?-highlight\b/g;
      nodes.forEach(el => {
        const before = el.className;
        const after  = before.replace(re, ' ').replace(/\s{2,}/g, ' ').trim();
        if (after !== before) el.className = after;
        if (el.style){
          el.style.backgroundColor = '';
          el.style.background = '';
          el.style.boxShadow = '';
          el.style.borderColor = '';
        }
      });
    };
    // initial + a couple of delayed passes to catch late paints
    STRIP();
    setTimeout(STRIP, 80);
    setTimeout(STRIP, 400);
    // hook into the app’s redraw signal instead of attribute-churn
    document.addEventListener('tm:dom-updated', STRIP, { passive: true });
  }
  // mark immediately and install kill CSS
  __tmcMarkPageType();

  // Install phone blink CSS early so it's ready everywhere
  try{ __tmcEnsurePhoneCSS(); }catch(_){}
  // Install legend CSS so the aside legend renders correctly
  try{ __tmcEnsureLegendCSS(); }catch(_){}

  // אם יש לך טריגר פנימי אחרי רינדור/עדכון DOM (למשל אחרי פתיחת/סגירת PREVIEW, או אחרי טעינה חלקית של טבלה):
  window.addEventListener('tm:dom-updated', installPassiveFixForPerfectScrollbar);
  // וכך גם לבדיקת טלפונים
  window.addEventListener('tm:dom-updated', () => validatePhonesEverywhere());

  // Insert legend only on non-task pages. Also remove it if we navigated into /tasks/.
  const tryLegend = () => {
    try{
      __tmcMarkPageType();
      if (__tmcIsTaskPage()){
        __tmcRemoveLegendIfTaskPage();
        return;
      }
      __tmcInsertColorLegend();
    }catch(_){}
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryLegend, { once: true });
    window.addEventListener('load', tryLegend, { once: true });
  } else {
    tryLegend();
  }
  // SPA-safe: re-evaluate on client-side navigations or app redraws
  window.addEventListener('popstate', tryLegend);
  window.addEventListener('hashchange', tryLegend);
  document.addEventListener('tm:dom-updated', tryLegend);

  // Install map state tracker early so layout reacts as soon as the map opens/resizes
  installMapStateTracker();

  // Install network limiter for panel_view to avoid 429 bursts
  installPanelViewRateLimiter();

  // Clear preview-open list on real page unload/reload so refresh starts closed
  const CLEAR_KEY = 'openPreviewTaskIds';
  // Fires on reload/close; not on in-page SPA changes
  window.addEventListener('pagehide', (e) => {
    // e.persisted === true means bfcache restore; keep state in that edge-case
    if (!e.persisted) {
      try { sessionStorage.removeItem(CLEAR_KEY); } catch(e) {}
    }
  });
  // Extra safety for older browsers
  window.addEventListener('beforeunload', () => {
    try { sessionStorage.removeItem(CLEAR_KEY); } catch(e) {}
  });

  // --------------------------------------------------------------------
  // הסרה מיידית של taskId עם "סגירה ידנית" בלחיצה על כפתור/אייקון סגירה
  // הנתיבים מכסים שמות שכיחים; אם יש כפתור אחר בדף – ייתפס דרך "fallback".
  (function wireManualCloseListeners(){
    const ROW_SEL = 'tr[id^="preview-for-"]';
    // כפתורי סגירה אפשריים (הרחב/כווץ, X, אייקוני minimize, וכו')
    const CLOSE_SEL = [
      '.preview-close',
      '.btn-close-preview',
      '[data-close-preview]',
      '.collapse-preview',
      '.toggle-preview',
      '.preview-minimized-icons .preview-icon-btn',  // אייקונים קטנים מתחת לקלף
      '.fa-times', '.fa-xmark', '.fa-chevron-up', '.fa-angle-up', '.fa-chevron-left', '.fa-angle-left'
    ].join(',');

    // האזנה מואצלת: מזהה על מה לחצו, מאתר את שורת ה-preview הרלוונטית, ומסיר מהסט.
    document.addEventListener('click', (ev) => {
      const target = ev.target instanceof Element ? ev.target : null;
      if (!target) return;

      // נזהה אם הכפתור/האייקון תואם לאחד הסלקטורים
      const btn = target.closest(CLOSE_SEL);
      if (!btn) return;

      const row = btn.closest(ROW_SEL);
      if (!row) return;

      const id = (row?.id || "").match(/^preview-for-(\d+)/)?.[1];
      if (!id) return;

      // קבע: המשתמש התכוון לסגור – אל תשחזר אותו יותר בסשן הזה
      try {
        const openPreviews = JSON.parse(sessionStorage.getItem(CLEAR_KEY) || '[]');
        const filtered = openPreviews.filter(taskId => String(taskId) !== String(id));
        sessionStorage.setItem(CLEAR_KEY, JSON.stringify(filtered));
      } catch(e) {}

      // Fallback: לאחר הטיפול של האפליקציה בכפתור, נבדוק אם השורה באמת נסגרה
      // ונעדכן את הסט במקרה שהאפליקציה מחליפה DOM/סטייל באיחור.
      setTimeout(() => {
        const isHidden = row.style.display === 'none' || row.hidden || row.offsetParent === null;
        if (isHidden) {
          try {
            const openPreviews = JSON.parse(sessionStorage.getItem(CLEAR_KEY) || '[]');
            const filtered = openPreviews.filter(taskId => String(taskId) !== String(id));
            sessionStorage.setItem(CLEAR_KEY, JSON.stringify(filtered));
          } catch(e) {}
        }
      }, 0);
    }, true); // useCapture=true כדי לתפוס גם אם האפליקציה עוצרת bubbling
  })();
})();

// -----------------------------------------------------------------------
// Network backpressure for /tasks/{id}/panel_view
// - Hard caps concurrency for those POSTs
// - Coalesces duplicate in-flight requests per URL
// - Retries 429 with exponential backoff and honors Retry-After
// -----------------------------------------------------------------------
function installPanelViewRateLimiter(){
  if (window.__tmcPanelLimiterUpgraded) return;
  window.__tmcPanelLimiterUpgraded = true;
  try{
    const ORIG_FETCH = window.fetch.bind(window);
    const PANEL_VIEW_RE = /\/tasks\/\d+\/panel_view(\b|$)/;

    // --- Tuning (faster but safe) ---
    const MAX_CONCURRENT = 2;          // allow 2 in-flight previews
    const MIN_START_GAP_MS = 900;      // smaller start gap for batch-open

    // --- Simple circuit breaker on repeated 429s ---
    const recent429 = [];
    function since(now, then){ return now - then; }

    const queue = [];
    let active = 0;
    let lastStartAt = 0;
    const pendingByUrl = new Map();

    // ---- Panel preview cache (in-memory LRU) ----
    const PANEL_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
    const PANEL_CACHE_MAX = 200;
    const panelCache = new Map(); // key -> {body,status,headers,exp}
    function panelCacheGet(key){
      const hit = panelCache.get(key);
      if (!hit) return null;
      if (hit.exp < Date.now()) { panelCache.delete(key); return null; }
      // bump LRU
      panelCache.delete(key); panelCache.set(key, hit);
      return hit;
    }
    function panelCacheSet(key, body, res){
      try{
        const headers = {};
        res.headers && res.headers.forEach((v,k)=>{ headers[k]=v; });
        panelCache.set(key, {
          body, status: res.status, headers,
          exp: Date.now() + PANEL_CACHE_TTL_MS
        });
        // LRU eviction
        if (panelCache.size > PANEL_CACHE_MAX){
          const first = panelCache.keys().next().value;
          panelCache.delete(first);
        }
      }catch(_){}
    }

    async function sendWithBackoff(url, init, attempt){
      if (recent429.length >= 3){
        const wait = Math.min(30000, 2000 * recent429.length);
        await new Promise(r => setTimeout(r, wait));
      }
      const res = await ORIG_FETCH(url, init);
      if (res.status === 429){
        recent429.push(Date.now());
        throw new Error('panel_view 429');
      }
      return res;
    }

    async function runNext(){
      if (!queue.length) return;
      const now = Date.now();
      if (active >= MAX_CONCURRENT){
        setTimeout(runNext, 50);
        return;
      }
      if ((now - lastStartAt) < MIN_START_GAP_MS){
        setTimeout(runNext, MIN_START_GAP_MS - since(now, lastStartAt));
        return;
      }
      active++;
      lastStartAt = Date.now();
      const { url, init, resolve, reject, key } = queue.shift();
      try{
        const res = await sendWithBackoff(url, init, 0);
        // populate cache asynchronously (do not block the caller)
        try{
          if (isPanelView(url) && isCacheablePanelView(init) && res.ok){
            const clone = res.clone();
            clone.text().then(body => panelCacheSet(key, body, clone)).catch(()=>{});
          }
        }catch(_){}
        // give each waiter its own clone to avoid "body stream already read"
        resolve(res.clone());
      }catch(err){
        reject(err);
      }finally{
        active--;
        pendingByUrl.delete(key);
        setTimeout(runNext, MIN_START_GAP_MS);
      }
    }

    function schedule(url, init){
      const key = url; // URL is stable and includes the task id
      // Serve from cache if fresh
      if (isCacheablePanelView(init)){
        const hit = panelCacheGet(key);
        if (hit){
          return Promise.resolve(new Response(hit.body, { status: hit.status, headers: hit.headers }));
        }
      }
      // coalesce duplicates — but hand out a clone per waiter
      if (pendingByUrl.has(key)) return pendingByUrl.get(key).then(r => r.clone());
      const p = new Promise((resolve, reject) => {
        queue.push({ url, init, resolve, reject, key });
        runNext();
      });
      pendingByUrl.set(key, p);
      return p;
    }

    function toAbsUrl(u){
      try { return new URL(u, location.href).href; } catch(_) { return String(u||''); }
    }
    function isPanelView(input){
      try{
        const raw = (typeof input === 'string') ? input : (input && input.url);
        if (!raw) return false;
        const abs = toAbsUrl(raw);
        return PANEL_VIEW_RE.test(abs);
      }catch(_){ return false; }
    }
    function isCacheablePanelView(init){
      try{
        const method = (init && (init.method||'POST')).toUpperCase();
        const bodyStr = init && (typeof init.body === 'string' ? init.body : '');
        // do not cache if the request also mutates state (e.g., mark ready)
        if (bodyStr && /mark[_-]?ready=1|ready=1/i.test(bodyStr)) return false;
        return method === 'POST';
      }catch(_){ return false; }
    }

    // Patch window.fetch
    window.fetch = function(input, init){
      if (isPanelView(input)){
        const url = (typeof input === 'string') ? toAbsUrl(input) : toAbsUrl(input.url);
        return schedule(url, init);
      }
      return ORIG_FETCH(input, init);
    };

    // If the app also uses a custom wrapper (hookedFetch), wrap it too (idempotent)
    if (typeof window.hookedFetch === 'function' && !window.hookedFetch.__tmcWrappedFor429){
      const origHooked = window.hookedFetch;
      window.hookedFetch = function(input, init){
        if (isPanelView(input)){
          const url = (typeof input === 'string') ? toAbsUrl(input) : toAbsUrl(input.url);
          return schedule(url, init);
        }
        return origHooked(input, init);
      };
      window.hookedFetch.__tmcWrappedFor429 = true;
    }
  }catch(_){}
}

// ==== TM: global flag to disable prototype wrapping of addEventListener ====
const DISABLE_GLOBAL_ADD_EVENT_LISTENER_WRAP = false;

// Global, rAF-throttled clamping (single source) to avoid N-per-row resize handlers
const __tmcScheduleClampAll = rafThrottle(() => __tmcClampAllPreviewRows(document));

// Cache numeric map width to avoid repeated getComputedStyle() reads
let __tmcMapWidthPx = 0;

// Track unique PREVIEW viewports we need to observe once
const __tmcObservedViewports = new WeakSet();
let __tmcViewportRO = null;

// --- Unified, PS-safe passive defaults for scroll-blocking events ---
(function installUnifiedPassiveWrapper(){
  if (window.__tmUnifiedPassivePatched) return;
  window.__tmUnifiedPassivePatched = true;

  try {
    const Orig = EventTarget.prototype.addEventListener;
    // Only treat *scrolling* as passive candidates. Drag events must stay active.
    // Also include touchstart/touchmove as passive when attached on safe scroll roots,
    // but keep them non-passive for drags/resizers and PerfectScrollbar containers.
    const PASSIVE_CANDIDATES = new Set(['wheel','mousewheel','scroll','touchstart','touchmove']);
    const DRAG_EVENTS = new Set(['pointerdown','pointermove','mousedown','mousemove']);
    const RESIZE_HANDLES = [
      '.offcanvas-resize-toggle',
      '.offcanvas-resize-toggle-border',
      '.ui-resizable-handle',
      '[data-resizable]',
      '[data-ps-resize-handle]'
    ];

    const SAFE_SELECTORS = [
      'html','body',
      // common scroll containers in this app
      '.dataTables_wrapper',
      '.dataTables_scrollBody',
      '.table-responsive',
      '.simple-scroll',
      '.modal', '.modal-body',
      '.offcanvas, .offcanvas-left, .offcanvas-wrapper',
      '#operator-store-visits-table_wrapper',
      '[data-scroll-root]',
      'tr[id^="preview-for-"] td[colspan]'
    ];

    function isElement(n){ return n && n.nodeType === 1; }
    function matchesAny(el, sels){
      for (const sel of sels){
        if (el.matches?.(sel) || el.closest?.(sel)) return true;
      }
      return false;
    }
    function withinPerfectScrollbar(el){
      return isElement(el) && (el.classList.contains('ps') || el.classList.contains('ps-container') || el.closest?.('.ps, .ps-container'));
    }
    function isSafeRoot(t){
      if (t === window || t === document || t === document.body) return true;
      return isElement(t) && matchesAny(t, SAFE_SELECTORS);
    }
    function isResizeHandle(t){
      return isElement(t) && matchesAny(t, RESIZE_HANDLES);
    }

    const FORCE_PASSIVE_ON_SAFE_ROOTS = true; // set to false if something misbehaves
    EventTarget.prototype.addEventListener = function(type, listener, options){
      const t = String(type);
      // Don't touch non-candidates at all
      if (!PASSIVE_CANDIDATES.has(t) && !DRAG_EVENTS.has(t)) {
        return Orig.call(this, type, listener, options);
      }

      // For any drag/resize interaction, NEVER force passive; jQuery needs preventDefault()
      if (DRAG_EVENTS.has(t)) {
        return Orig.call(this, type, listener, options);
      }

      // Normalize options
      let opts = options;
      if (opts === undefined) opts = {};
      else if (typeof opts === 'boolean') opts = { capture: !!opts };

      // If caller explicitly set 'passive', honor it — except PS containers where passive must be false
      if (opts && typeof opts === 'object' && 'passive' in opts) {
        if (opts.passive === true && withinPerfectScrollbar(this)) {
          const fixed = Object.assign({}, opts, { passive: false });
          return Orig.call(this, type, listener, fixed);
        }
        // Also keep non-passive on resize handles just in case libraries toggle it
        if (opts.passive === true && isResizeHandle(this)) {
          const fixed = Object.assign({}, opts, { passive: false });
          return Orig.call(this, type, listener, fixed);
        }
        // If a lib forces passive:false on a safe scroll root, flip it (optional)
        if (FORCE_PASSIVE_ON_SAFE_ROOTS && opts.passive === false && isSafeRoot(this) && !withinPerfectScrollbar(this)) {
          const fixed = Object.assign({}, opts, { passive: true });
          return Orig.call(this, type, listener, fixed);
        }
        return Orig.call(this, type, listener, opts);
      }

      // No explicit passive: apply passive:true only on safe roots
      if (!withinPerfectScrollbar(this) && isSafeRoot(this)) {
        const auto = Object.assign({}, opts, { passive: true });
        return Orig.call(this, type, listener, auto);
      }

      // Otherwise, leave as-is
      return Orig.call(this, type, listener, options);
    };
  } catch(_) {}
})();

/* ── jQuery passive bridge: make .on('touchstart|move|wheel') passive by default ── */
(function __tmcPatchjQueryPassive(){
  try{
    const $ = window.jQuery;
    if (!$ || !$.event || !$.event.special) return;
    ['touchstart','touchmove','wheel','mousewheel'].forEach(type=>{
      const special = $.event.special[type] || ($.event.special[type] = {});
      const origSetup = special.setup;
      special.setup = function(_, namespaces, handler){
        const ns = (namespaces && namespaces.join) ? namespaces.join('.') : String(namespaces||'');
        const passive = !/\bnoPreventDefault\b/.test(ns);
        this.addEventListener(type, handler, {passive});
        return false; // prevent jQuery from double-attaching
      };
      const origTeardown = special.teardown;
      special.teardown = function(_, namespaces, handler){
        try{ this.removeEventListener(type, handler); }catch(_){}
        if (origTeardown) return origTeardown.apply(this, arguments);
      };
    });
  }catch(_){}
})();

// ---- Utilities for throttling/chunking heavy work ----
function rafThrottle(fn){
  let scheduled = false, lastArgs;
  return function(...args){
    lastArgs = args;
    if (!scheduled){
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        fn.apply(this, lastArgs);
      });
    }
  };
}

// Timeout-based slicer: chunks work off the rendering timeline (no rAF)
function __tmcTimeoutSlicer(iterateFn, {maxMs=8} = {}){
  let stopped = false, h = null;
  function step(){
    const start = performance.now();
    do {
      if (performance.now() - start > maxMs) break;
      if (!iterateFn()){ stopped = true; break; }
    } while(true);
    if (!stopped) h = setTimeout(step, 16); // yield a frame, reduce timer spam
  }
  h = setTimeout(step, 16);
  return ()=>{ stopped = true; if (h) clearTimeout(h); };
}

// One IO for PREVIEW <td>s; processes only what's (nearly) visible
// Canonical path only (avoid legacy to prevent style racing/flicker)
const __tmcPreviewIO = new IntersectionObserver((entries)=>{
  for (const e of entries){
    if (!e.isIntersecting) continue;
    const td = e.target;
    if (!td || td.dataset.tmcHydrated === "1") continue;
    try { splitPreviewMetaLines(td); } catch(_){}
    try { __tmcNormalizePreviewStyles(td); } catch(_){}
    td.dataset.tmcHydrated = "1";
  }
}, {root: null, rootMargin: '200px 0px', threshold: 0});

function idleChunk(items, work, budgetMs = 12){
  let i = 0;
  function run(deadline){
    const remaining = typeof deadline?.timeRemaining === 'function' ? deadline.timeRemaining() : 0;
    const end = performance.now() + (remaining || budgetMs);
    while (i < items.length && performance.now() < end){
      try { work(items[i], i); } catch(_) {}
      i++;
    }
    if (i < items.length){
      // Use setTimeout instead of requestIdleCallback for more predictable timing
      setTimeout(run, 0);
    }
  }
  // Use setTimeout instead of requestIdleCallback for more predictable timing
  setTimeout(run, 0);
}

// ---- Reduce offscreen rendering cost of large preview containers ----
(function installPreviewRenderHints(){
  try {
    const id = 'tm-preview-cv-style';
    if (!document.getElementById(id)){
      const s = document.createElement('style');
      s.id = id;
      s.textContent = `
        /* Skip layout/paint for offscreen previews until needed */
        .tm-preview-root {
          content-visibility: auto;
          contain-intrinsic-size: 600px 300px;
          contain: layout paint style;
        }
      `;
      document.head.appendChild(s);
    }
  } catch {}
})();

// Map-aware CSS: when the left map is open, keep previews out from under it and force natural wrapping
(function installMapAwarePreviewCSS(){
  try{
    const id = 'tm-map-aware-preview-css';
    if (document.getElementById(id)) return;
    const s = document.createElement('style');
    s.id = id;
    s.textContent = `
      /* Single source of truth: body.map-open + --map-width set by installMapStateTracker() */
      body.map-open tr[id^="preview-for-"] > td > .tmc-preview-row{
        /* משתמשים ב-padding (לא margin) וגם גוזרים גלישה שמאלה */
        padding-inline-start: var(--map-width, 0px) !important;
        overflow: clip !important;
        box-sizing: border-box !important;
        content-visibility: auto;
        contain: layout paint style;
        contain-intrinsic-size: 1px 400px;
      }
    `;
    document.head.appendChild(s);
  }catch(_){}
})();

// Feature flag: control CSP meta injection
// Disable to avoid noisy console + any unintended CSP interactions
const ENABLE_CSP_INJECTION = false;

// DEBUG flag for production logging control
const DEBUG = window.DEBUG_TOOLBOX || false;
window.DEBUG_TOOLBOX = DEBUG;

// ---- DOM batching shim (define once, EARLY) ----
// Provides BOTH call style: domBatch(readOps, writeOps)
// and queue style: domBatch.read(fn), domBatch.write(fn)
;(function(){
  if (typeof window.domBatch !== 'undefined') return;
  function callBatch(readOps=[], writeOps=[]){
    const results = (readOps||[]).map(op => { try { return typeof op==='function' ? op() : op; } catch(_) { return null; } });
    (writeOps||[]).forEach(fn => { try { if (typeof fn==='function') fn(results); } catch(_){} });
    return results;
  }
  let rq = [], wq = [], scheduled = false;
  function schedule(){
    if (scheduled) return; scheduled = true;
    requestAnimationFrame(()=>{ scheduled = false;
      const reads = rq; rq = [];
      const results = reads.map(fn => { try { return fn(); } catch(_) { return null; } });
      const writes = wq; wq = [];
      writes.forEach(fn => { try { fn(results); } catch(_){} });
    });
  }
  callBatch.read  = fn => { rq.push(fn); schedule(); };
  callBatch.write = fn => { wq.push(fn); schedule(); };
  window.domBatch = callBatch;
})();

// [SESSION FLAGS] always reset on fresh page load (so reload won't restore)
try{
  sessionStorage.setItem('sessionStartTime', String(Date.now()));
  sessionStorage.removeItem('tmcRestoreIntent');
  sessionStorage.removeItem('tmcStickyPreviews');
  sessionStorage.removeItem('openPreviewTaskIds');
  sessionStorage.removeItem('openPreviewTaskIds_v2');
  sessionStorage.removeItem('tmcRestoreIntentMem');
  sessionStorage.setItem('tmcNoRestore', '1');  /* NEW: block restore-on-load */
}catch(_){}

// [PS PASSIVE FIX] -----------------------------------------------------------
function installPassiveFixForPerfectScrollbar() {
  try { applyPsCssTouchAction(); } catch (e) {}
}

function applyPsCssTouchAction() {
  // CSS קשיח שמוודא שאין צורך ב-preventDefault עבור מגע/גלילה בתוך PS
  const styleId = 'tm-ps-touchaction-style';
  if (!document.getElementById(styleId)) {
    const s = document.createElement('style');
    s.id = styleId;
    s.textContent = `
      /* Make touch scrolling not require preventDefault on PS containers */
      .ps, .ps-container { touch-action: auto !important; }
    `;
    document.documentElement.appendChild(s);
  }
  // redundancy להבטיח גם inline style כשצריך
  document.querySelectorAll('.ps, .ps-container').forEach(el => {
    if (!el.style.touchAction) el.style.touchAction = 'auto';
  });
}

// [END PS PASSIVE FIX] -------------------------------------------------------

// ===== [Noise & Perf Quieting Pack] START =====
// 1) Hard-block common trackers to reduce net::ERR_BLOCKED_BY_CLIENT spam
(function hardBlockTrackers(){
  try {
    if (!ENABLE_CSP_INJECTION) return;
    // Guarded CSP: manage ONLY our own tag; never add duplicates; never override host CSP.
    const HEAD = document.head || document.getElementsByTagName('head')[0];
    if (!HEAD) return;

    // If the page ALREADY has any CSP meta (server/host), respect it and DO NOT add ours.
    // We only proceed if there is NO CSP at all, or if our tag already exists (to update it).
    const existingCspMetas = Array.from(HEAD.querySelectorAll('meta[http-equiv="Content-Security-Policy"]'));
    const oursId = 'lwtb-csp';
    const ours = HEAD.querySelector(`meta#${oursId}[http-equiv="Content-Security-Policy"]`);
    if (existingCspMetas.length > 0 && !ours) {
      // Host (or another script) controls CSP. Do nothing to avoid stricter intersections.
      return;
    }

    // Create or update ONLY our CSP meta.
    const meta = ours || document.createElement('meta');
    meta.id = oursId;
    meta.httpEquiv = 'Content-Security-Policy';
    meta.content = [
      "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:",
      // IMPORTANT: allow WebSockets; do NOT restrict specific hosts here.
      // Using wss: keeps Pusher/Crisp working while adblock still blocks trackers.
      "connect-src * 'unsafe-inline' 'unsafe-eval' data: blob: https: wss:",
      "img-src * data: blob:",
      "script-src * 'unsafe-inline' 'unsafe-eval' data: blob: https:",
      "style-src * 'unsafe-inline' https:",
      "block-all-mixed-content"
    ].join('; ');
    if (!ours) HEAD.appendChild(meta);

    // Runtime guard: if later a new CSP meta is injected by the page, we DO NOT add another.
    // We only keep OUR tag as-is and never duplicate.
    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (n.nodeType === 1 && n.matches && n.matches('meta[http-equiv="Content-Security-Policy"]')) {
            // If a new CSP (not ours) appears, we leave it alone and DO NOT touch CSP anymore.
            // We disconnect to avoid reprocessing; our single tag remains, no duplicates added.
            mo.disconnect();
            return;
          }
        }
      }
    });
    mo.observe(HEAD, { childList: true });
  } catch(_) {}
})();


/* removed duplicate domBatch (rAF queue) to avoid name conflict; function-style domBatch(readOps, writeOps) remains */

// 4) Lightweight gating helpers to avoid hot-loop work & noisy timers
function createDistinctByKey(fn, keyFn){
  let lastKey = null, lastRes = null;
  return (...args) => {
    const k = keyFn(...args);
    if (k === lastKey) return lastRes;
    lastKey = k; lastRes = fn(...args);
    return lastRes;
  };
}

function oncePerAnimationFrame(fn){
  let raf = 0, lastArgs = null;
  return (...args) => {
    lastArgs = args;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      try { fn(...lastArgs); } catch(_){}
    });
  };
}

// 5) Filter known tracker noise from console.error without muting real errors
(function quietKnownNoise(){
  try {
    const NOISE = [
      /google-analytics\.com/i,
      /connect\.facebook\.net/i,
      /clarity\.ms/i,
      /AbortError: The user aborted a request/i,
      /message channel closed/i,
      /net::ERR_BLOCKED_BY_CLIENT/i
    ];
    const origErr = console.error;
    console.error = function(...args){
      try{
        if (args.some(a => typeof a === 'string' && NOISE.some(rx => rx.test(a)))) return;
        // suppress our own preview fetch noise
        const s = args.map(a => (typeof a === 'string' ? a : '')).join(' ');
        if (/Failed to fetch task preview: AbortError/i.test(s)) return;
      }catch(_){}
      return origErr.apply(console, args);
    };
    // Also quiet common DevTools warnings we can't control from here (without touching real issues):
    const origWarn = console.warn;
    console.warn = function(...args){
      try{
        const s = args.map(a => (typeof a === 'string' ? a : '')).join(' ');
        // Filter all performance violations from third-party code
        if (/\bAdded non-passive event listener\b/.test(s)) return;
        if (/\bForced reflow while executing JavaScript took\b/.test(s)) return;
        if (/\[Violation\]/.test(s)) return; // Filter all violation messages
        if (/\bsetTimeout.*handler took.*ms\b/.test(s)) return;
        if (/\brequestAnimationFrame.*handler took.*ms\b/.test(s)) return;
        if (/\bclick.*handler took.*ms\b/.test(s)) return;
        if (/\bhandler took.*ms\b/.test(s)) return; // Catch any handler violations
        if (/\b'[^']*'\s+handler took\b/.test(s)) return; // Obfuscated handler names
        if (/\brequestIdleCallback.*handler took.*ms\b/.test(s)) return; // Our own optimizations
        // Filter CSP violations (they're just warnings, not actual blocks)
        if (/\bRefused to execute inline script because it violates.*Content Security Policy\b/.test(s)) return;
        if (/\bRefused to load the script.*because it violates.*Content Security Policy\b/.test(s)) return;
      }catch(_){}
      return origWarn.apply(this, args);
    };
    // Some paths use console.log for this message; filter that too.
    const origLog = console.log;
    console.log = function(...args){
      try{
        const s = args.map(a => (typeof a === 'string' ? a : '')).join(' ');
        if (/Failed to fetch task preview: AbortError/i.test(s)) return;
        // Filter CSP violations from console.log as well
        if (/\bRefused to execute inline script because it violates.*Content Security Policy\b/.test(s)) return;
        if (/\bRefused to load the script.*because it violates.*Content Security Policy\b/.test(s)) return;
      }catch(_){}
      return origLog.apply(this, args);
    };
  } catch(_) {}
})();
// ===== [Noise & Perf Quieting Pack] END =====

// Rate-limited warning system
const warnOnce = (() => {
  const seen = new Set();
  return (key, ...args) => {
    if (!seen.has(key)) {
      seen.add(key);
      console.warn(...args);
    }
  };
})();

// Debounce utility for performance optimization
function debounce(fn, ms = 120) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

// Idle callback with fallback for non-critical work
const scheduleIdleWork = window.requestIdleCallback ||
  ((cb) => setTimeout(() => cb({didTimeout: true, timeRemaining: () => 0}), 200));

// Clean up old debug logs from console
if (!DEBUG) {
  // Override console.debug to suppress debug logs in production
  const originalDebug = console.debug;
  console.debug = function() {
    // Only show debug logs if DEBUG is true
    if (DEBUG) {
      originalDebug.apply(console, arguments);
    }
  };
}

// Enhanced error handling for blocked resources and cross-script coordination
window.addEventListener('error', function(e) {
  if (e.target && e.target.src && e.target.src.includes('rollbar.min.js')) {
    // Suppress Rollbar errors - they're blocked by ad blockers
    e.preventDefault();
    return false;
  }
  if (e.target && e.target.src && e.target.src.includes('beacon.min.js')) {
    // Suppress Cloudflare analytics errors - they're blocked by ad blockers
    e.preventDefault();
    return false;
  }
  if (e.target && e.target.src && e.target.src.includes('fbevents.js')) {
    // Suppress Facebook pixel errors - they're blocked by ad blockers
    e.preventDefault();
    return false;
  }
  if (e.target && e.target.src && e.target.src.includes('clarity.ms')) {
    // Suppress Microsoft Clarity errors - they're blocked by ad blockers
    e.preventDefault();
    return false;
  }
  if (e.target && e.target.src && e.target.src.includes('google-analytics.com')) {
    // Suppress Google Analytics errors - they're blocked by ad blockers
    e.preventDefault();
    return false;
  }
}, true);

// Global coordination for other userscripts
window.LIONWHEEL_TOOLBOX_LOADED = true;
window.LIONWHEEL_DEBUG_MODE = DEBUG;

// Provide global utilities for other scripts
window.LionwheelUtils = {
  debounce: debounce,
  warnOnce: warnOnce,
  scheduleIdleWork: scheduleIdleWork,
  // Added utilities:
  domBatch: window.domBatch,
  createDistinctByKey: createDistinctByKey,
  oncePerAnimationFrame: oncePerAnimationFrame,
  safeInsertAfter: safeInsertAfter,
  safeInsertBefore: safeInsertBefore,
  DEBUG: DEBUG
};

/* ============================================================
   SAFE DOM INSERT HELPERS (no NotFoundError on racing updates)
   ============================================================ */
function safeInsertAfter(anchor, node, fallbackParent){
  try{
    if (anchor && anchor.isConnected){
      if (anchor.insertAdjacentElement){
        anchor.insertAdjacentElement('afterend', node);
      } else if (anchor.parentNode){
        anchor.parentNode.insertBefore(node, anchor.nextSibling);
      } else {
        (fallbackParent && fallbackParent.isConnected ? fallbackParent : document.body).appendChild(node);
      }
    } else {
      (fallbackParent && fallbackParent.isConnected ? fallbackParent : document.body).appendChild(node);
    }
  }catch(e){
    try{ (fallbackParent && fallbackParent.isConnected ? fallbackParent : document.body).appendChild(node); }catch(_){}
    if (DEBUG) console.warn('[Toolbox] safeInsertAfter fallback:', e);
  }
}

function safeInsertBefore(anchor, node, fallbackParent){
  try{
    if (anchor && anchor.isConnected){
      if (anchor.insertAdjacentElement){
        anchor.insertAdjacentElement('beforebegin', node);
      } else if (anchor.parentNode){
        anchor.parentNode.insertBefore(node, anchor);
      } else {
        (fallbackParent && fallbackParent.isConnected ? fallbackParent : document.body).appendChild(node);
      }
    } else {
      (fallbackParent && fallbackParent.isConnected ? fallbackParent : document.body).appendChild(node);
    }
  }catch(e){
    try{ (fallbackParent && fallbackParent.isConnected ? fallbackParent : document.body).appendChild(node); }catch(_){}
    if (DEBUG) console.warn('[Toolbox] safeInsertBefore fallback:', e);
  }
}

// Stable anchor helper for barcode elements
function stableAnchorForBarcode(el, td) {
  if (td) {
    const bdi = td.querySelector(':scope > .tampermonkey-barcode-bdi');
    if (bdi && bdi.isConnected) return bdi;
  }
  return el && el.nodeType === Node.TEXT_NODE ? el.parentNode : el || td;
}

// ========= Bold last 3 digits in *barcode-contexts only* =========
// Guard against double-work
const __tmcLast3Marked = new WeakSet();

function __tmcBoldLast3DigitsInElement(el){
  try{
    if (!el || !el.isConnected || __tmcLast3Marked.has(el)) return;
    // קרא את הטקסט הגלוי (ללא HTML פנימי)
    const raw = (el.textContent || '').trim();
    // רק ספרות, 10+ תווים (ברקוד), בלי מקפים/רווחים
    if (!/^\d{10,}$/.test(raw)) return;
    const head = raw.slice(0, -3), tail = raw.slice(-3);
    el.innerHTML = `${head}<b>${tail}</b>`;
    __tmcLast3Marked.add(el);
  }catch(_){}
}

window.__tmcApplyBarcodeLast3Bold = function(root){
  try{
    root = root || document;

    // 1) BDI elements (table + gallery)
    root.querySelectorAll('.tampermonkey-barcode-bdi, .gallery-barcode-bdi').forEach(bdi=>{
      bdi.setAttribute('dir','ltr'); // bidi-safe
      __tmcBoldLast3DigitsInElement(bdi);
    });

    // 2) PREVIEW: המרה ל"ברקוד", עטיפה ב-.barcode-highlight והדגשת 3 ספרות אחרונות
    const els = root.querySelectorAll('.tmc-preview-meta');
    els.forEach(row=>{
      row.querySelectorAll('.tmc-preview-meta > div').forEach(line=>{
        const labelEl = line.querySelector('b, strong');
        const label = (labelEl?.textContent || '').trim();
        if (!label) return;
        const isSku = /^(?:מק[״"]?ט|ברקוד)\s*:?\s*$/i.test(label);
        if (!isSku) return;
        /* קבע תמיד "ברקוד:" – לא "מק״ט" – כדי לאחד התנהגות */
        if (labelEl) labelEl.textContent = 'ברקוד:';

        const valueNode = Array.from(line.childNodes).find(n => n.nodeType === Node.TEXT_NODE);
        if (!valueNode) return;
        const rest = valueNode.textContent.trim();
        const digits = rest.replace(/[^\d]/g,'');
        if (!/^\d{10,}$/.test(digits)) return;
        const span = document.createElement('span');
        span.classList.add('barcode-highlight');
        span.textContent = digits;
        valueNode.replaceWith(span);
        __tmcBoldLast3DigitsInElement(span);
      });
    });

    // 3) גלריה: <bdi class="gallery-barcode-bdi">123456789012</bdi>
    root.querySelectorAll('.gallery-barcode-bdi').forEach(bdi=>{
      bdi.setAttribute('dir','ltr'); // bidi-safe
      __tmcBoldLast3DigitsInElement(bdi);
    });
  }catch(_){}
};

// חשוף לחלוקת קריאות מכל מקומות ההידרציה

/* גלריה נטענת דינאמית: ברגע שמופיע .gallery-barcode-bdi – הדגש 3 ספרות אחרונות */
(function __tmcWatchGalleryBarcodes(){
  if (window.__tmcGalleryBarcodesMO) return;
  try{
    const mo = new MutationObserver((muts)=>{
      const added = [];
      for (const m of muts){
        if (m.type !== 'childList') continue;
        for (const n of m.addedNodes){
          if (n.nodeType !== 1) continue;
          if (n.matches?.('.gallery-barcode-bdi')) added.push(n);
          const inner = n.querySelectorAll?.('.gallery-barcode-bdi') || [];
          inner.length && added.push(...inner);
        }
      }
      if (added.length){
        added.forEach(__tmcBoldLast3DigitsInElement);
      }
    });
    mo.observe(document.documentElement, {childList:true, subtree:true});
    window.__tmcGalleryBarcodesMO = mo;
  }catch(_){}
})();

/* removed: legacy one-line layout helper (__forceInlineFlexOnPreviewCards) */

// === PREVIEW viewport clamping so cards wrap by the visible container ===
function __tmcFindScrollViewport(el){
  // מחפש אב עם overflow-x != visible (הגליל האופקי)
  let n = el && el.parentElement;
  while (n){
    const cs = getComputedStyle(n);
    if (/(auto|scroll|hidden)/.test(cs.overflowX)) return n;
    n = n.parentElement;
  }
  // גיבוי: מזהה ה־wrapper של הדאטאטייבלס/טבלה הרספונסיבית
  return document.getElementById('operator-store-visits-table_wrapper') ||
         document.querySelector('.dataTables_wrapper, .table-responsive, .simple-scroll') ||
         document.documentElement;
}

function __tmcClampPreviewRowWidth(row){
  // No-op: המידה נגזרת מ-CSS calc(100vw - var(--map-width))
  // משאירים רק את box-sizing כדי לוודא עטיפה נכונה בלי כתיבות חוזרות.
  try{
    row.style.setProperty('box-sizing','border-box','important');
    row.style.setProperty('width','100%','important');
  }catch(_){}
}

function __tmcClampAllPreviewRows(ctx=document){
  // במקום למדוד ולכתוב max-width לכל Row, רק מבטיחים מחלקות/box-model.
  const rows = Array.from(ctx.querySelectorAll(
    'tr[id^="preview-for-"] td[colspan] .tmc-preview-row,'+
    'tr[id^="preview-for-"] td[colspan] > div:first-child'
  ));
  for (const row of rows){
    if (!row.classList.contains('tmc-preview-row')) row.classList.add('tmc-preview-row');
    __tmcClampPreviewRowWidth(row);
  }
  // עדיין שומרים ResizeObserver על ה-viewport כדי להפעיל normalize בלבד.
  if (!__tmcViewportRO){
    __tmcViewportRO = new ResizeObserver(() => {
      // לא כותבים style פר־Row – הלייאאוט מתעדכן אוטומטית דרך var(--map-width)
    });
  }
}

// Re-run viewport clamping (single global throttled) when viewport or content changes
window.addEventListener('resize', () => __tmcScheduleClampAll(), { passive: true });
window.addEventListener('tm:dom-updated', () => __tmcScheduleClampAll(), { passive: true });

// Normalize preview styles to ensure consistent layout (heavy impl)
const __tmcNormalizedCards = new WeakSet();
function __tmcNormalizePreviewStylesImpl(td){
  try{
    // Ensure the td has proper box-sizing
    td.style.setProperty('box-sizing', 'border-box', 'important');
    // אל תתייחס ל-<td> עצמו כאל כרטיס (אם הוכנסה המחלקה בטעות)
    td.classList.remove('tmc-preview-card');

    // Find the preview row container
    let row = td.querySelector('.tmc-preview-row');
    if (!row) {
      // If no .tmc-preview-row class, use the first div child
      row = td.querySelector('div:first-child');
      if (row) {
        // Add the class for consistency
        row.classList.add('tmc-preview-row');
      }
    }

    if (row) {
      // Ensure proper box-sizing and display - batch these operations
      const rowStyles = [
        ['box-sizing', 'border-box', 'important'],
        ['display', 'flex', 'important'],
        ['flex-wrap', 'wrap', 'important'],
        ['align-items', 'flex-start', 'important'],
        ['justify-content', 'flex-start', 'important']
      ];

      // Apply all styles at once to minimize reflows
      rowStyles.forEach(([property, value, priority]) => {
        row.style.setProperty(property, value, priority);
      });

      // Empty-state for orders with no items: show a small placeholder chip
      const hasCards = !!row.querySelector('.tmc-preview-card');
      const hasText  = !!(row.textContent && row.textContent.trim() !== '');
      const tr = td.closest('tr[id^="preview-for-"]');
      if (!hasCards && !hasText) {
        // ensure row is visible (in case host/CSS tried to hide it)
        if (tr) tr.style.removeProperty('display');
        if (!row.querySelector('.tmc-preview-empty')){
          const chip = document.createElement('div');
          chip.className = 'tmc-preview-empty';
          chip.textContent = 'אין פריטים בהזמנה';
          row.appendChild(chip);
        }
        // בטל רזרבה גדולה שנקבעת לכלל כרטיסים – שים רזרבה זעירה
        row.style.setProperty('content-visibility','visible','important');
        row.style.setProperty('contain-intrinsic-size','1px 36px','important');
        row.style.setProperty('min-height','0','important');
        row.style.setProperty('height','auto','important');
        // continue normalization so layout remains consistent
      } else if (tr) {
        // If previously hidden but now has content – restore visibility
        tr.style.removeProperty('display');
      }
    }
    // Force every card to the new variant (fit-to-content + big image + multi-line)
    row?.querySelectorAll('.d-flex.align-items-center.border.rounded.p-2.m-1.bg-white, .tmc-preview-card, [data-preview-card]')
      .forEach(card => {
        if (__tmcNormalizedCards.has(card)) return; // already done, skip work
        card.classList.add('tmc-preview-card');
        // CSS now handles all the styling with !important, just clean up conflicting inline styles
        card.style.removeProperty('white-space');
        card.style.removeProperty('whiteSpace');
        card.style.removeProperty('width');
        card.style.removeProperty('max-width');
        card.style.removeProperty('flex');
        const img = card.querySelector('img');
        if (img){
          img.classList.add('tmc-preview-img');
          img.style.setProperty('width','80px','important');
          img.style.setProperty('height','80px','important');
          img.style.setProperty('object-fit','contain','important');
        }
        const meta = card.querySelector('.text-muted');
        if (meta){
          meta.classList.add('tmc-preview-meta');
          meta.style.setProperty('white-space','normal','important');
          // if an old one-line variant slipped in, split it now
          if (!meta.__tmSplitDone) try { splitPreviewMetaLines(card); } catch(_){}
        }
        __tmcNormalizedCards.add(card);
      });
  }catch(_){}
}

// Expose a single canonical normalizer (avoid wrapper recursion / races)
window.__tmcNormalizePreviewStylesImpl = __tmcNormalizePreviewStylesImpl;
window.__tmcNormalizePreviewStyles = __tmcNormalizePreviewStylesImpl;

// Bootstrap pass: normalize + clamp any already-rendered preview rows on load and on DOM updates
function __tmcBootstrapPreviews(ctx=document){
  ctx.querySelectorAll('tr[id^="preview-for-"] td[colspan]').forEach(td => {
    try{
      // First-paint lock: ensure host CSS doesn't restyle between preflight and hydrate
      td.classList.add('tmc-preview-locked');
      // Ensure classes + minimal cleanup so layout CSS applies
      __tmcNormalizePreviewStyles(td);
      const row = td.querySelector('.tmc-preview-row') || td.querySelector('div:first-child');
      if (row) {
        row.dataset.tmcWrapRow = '1';
        __tmcClampPreviewRowWidth(row);
      }
    }catch(_){}
  });
}
window.addEventListener('load', () => __tmcBootstrapPreviews(), { once: true });
window.addEventListener('tm:dom-updated', () => __tmcBootstrapPreviews(), { passive: true });
window.addEventListener('load', () => { try{ __tmcApplyBarcodeLast3Bold(document); }catch(_){ } }, { once:true });
window.addEventListener('tm:dom-updated', () => { try{ __tmcApplyBarcodeLast3Bold(document); }catch(_){ } });

// === Map state tracker (left-only): sets body.map-open and --map-width, throttled to rAF ===
function installMapStateTracker(){
  if (window.__tmcMapTrackerInstalled) return;
  window.__tmcMapTrackerInstalled = true;

  const getHandle = () =>
    document.querySelector('.offcanvas-resize-toggle.offcanvas-resize-toggle-border');
  const getMapRoot = () => {
    const h = getHandle();
    // Prefer a stable container: offcanvas wrapper holds the actual resizable panel
    return h ? (h.closest('.offcanvas, .offcanvas-left, .offcanvas-wrapper') || h.parentElement) : null;
  };

  // *** NEW: measure the ACTUAL left inset of the table content area ***
  // We treat the "map width" CSS var as "how much space from viewport-left is *not* usable
  // for previews", which is simply the left edge of the table wrapper (in px).
  function measureLeftInset(){
    // Prefer the main DataTables wrapper (or reasonable fallbacks)
    const wrapper =
      document.getElementById('operator-store-visits-table_wrapper') ||
      document.querySelector('.dataTables_wrapper') ||
      document.querySelector('.table-responsive') ||
      document.querySelector('#operator-store-visits-table')?.closest('div');

    // 1) If wrapper exists and is laid out, take its .left (viewport-based)
    if (wrapper && wrapper.getBoundingClientRect){
      try{
        const r = wrapper.getBoundingClientRect();
        if (r && Number.isFinite(r.left)) {
          // small guard against sub-pixel/box-shadow noise
          return Math.max(0, Math.round(r.left));
        }
      }catch(_){}
    }

    // 2) Fallback: use the resize handle right edge (slightly reduced)
    const handle = getHandle();
    if (handle && handle.getBoundingClientRect){
      try{
        const hr = handle.getBoundingClientRect();
        if (hr && Number.isFinite(hr.right)) {
          // subtract a tiny fudge to avoid early wrapping before the visual edge
          return Math.max(0, Math.round(hr.right - 6));
        }
      }catch(_){}
    }

    // 3) Last resort: map root width (reduced a bit)
    const root = getMapRoot();
    if (root && root.getBoundingClientRect){
      try{
        const rr = root.getBoundingClientRect();
        if (rr && Number.isFinite(rr.width)) {
          return Math.max(0, Math.round(rr.width - 6));
        }
      }catch(_){}
    }
    return 0;
  }

  const apply = rafThrottle(() => {
    try{
      const w = measureLeftInset();
      __tmcMapWidthPx = w;
      __tmcApplyMapWidth(w);
      // אין צורך ב-reclamp; ה-CSS calc() יסתדר לבד
    }catch(_){}
  });

  // Observe size changes on the map container
  const root = getMapRoot();
  if (root && !root.__tmcRO){
    const ro = new ResizeObserver(() => apply());
    ro.observe(root);
    root.__tmcRO = ro;
  }

  // Track drag interactions on the resize handle to update during live dragging
  const handle = getHandle();
  if (handle && !handle.__tmcDragWired){
    const onMove = () => apply();
    const onPointerMove = () => apply();
    handle.addEventListener('mousedown', onMove, { passive: true, capture: true });
    handle.addEventListener('mousemove', onMove, { passive: true, capture: true });
    handle.addEventListener('pointerdown', onPointerMove, { passive: true, capture: true });
    handle.addEventListener('pointermove', onPointerMove, { passive: true, capture: true });
    handle.addEventListener('touchstart', onMove, { passive: true, capture: true });
    handle.addEventListener('touchmove', onMove, { passive: true, capture: true });
    handle.__tmcDragWired = true;

    // Also observe the handle itself for layout changes – some UIs only resize the handle box
    if (!handle.__tmcRO) {
      const ro2 = new ResizeObserver(() => apply());
      ro2.observe(handle);
      handle.__tmcRO = ro2;
    }
  }

  // Fallbacks: window resize and a microtask tick after DOM changes
  window.addEventListener('resize', apply, { passive: true });
  queueMicrotask(apply);
}

// Read current CSS var (fallback to 0 if unset)
function getMapWidth(){
  // Use cached numeric value (kept in sync by installMapStateTracker)
  return __tmcMapWidthPx || 0;
}

// Guard for map width updates (skip tiny/no-op changes)
let __tmcLastMapW = -1;
function __tmcApplyMapWidth(px){
  const w = Math.max(0, Math.round(px));
  if (w === __tmcLastMapW) return;     // no change → no style mutation
  if (Math.abs(w - __tmcLastMapW) < 2) return; // ignore sub-2px noise during drag
  __tmcLastMapW = w;
  if (document.body) {
    document.body.style.setProperty('--map-width', w + 'px');
    document.body.classList.toggle('map-open', w > 0);
  }
}

/* ================== PREVIEW: Hard Replace (matches live DOM) ==================
 * Targets rows like:
 * <tr id="preview-for-XXXXX"> ... <div class="d-flex align-items-center border rounded p-2 m-1 bg-white"> ... </div>
 * Inside: <img> + <div><div class="font-weight-bold copy-enabled">NAME</div><div class="text-muted">META</div></div>
 * Replaces the card content with: Title + 3 lines (SKU / Price / Qty), each on its own line.
 * ============================================================================ */


// --- Quantity color helper reused by PREVIEW and table cells ---
function __tmcColorQtySpan(qtyText){
  try{
    if (!qtyText) return qtyText;
    const m = String(qtyText).trim().match(/^(\d+)\s*\/\s*(\d+)$/);
    if (!m) return qtyText;
    const picked = parseInt(m[1],10), total = parseInt(m[2],10);
    if (picked === 0 && total === 1) return qtyText; // skip trivial 0/1
    if (picked > total || total > 1000) return qtyText; // sanity
    const cls = picked === total ? 'tampermonkey-picked-full'
              : picked === 0 && total > 1 ? 'tampermonkey-picked-none'
              : 'tampermonkey-picked-partial';
    return `<span class="${cls}">${picked} / ${total}</span>`;
  }catch(e){ return qtyText; }
}

// =========================================
// Schedulers / Budget helpers
// =========================================
const __tmcReqIdle = window.requestIdleCallback || function(cb){return setTimeout(()=>cb({timeRemaining:()=>0,didTimeout:true}),50);};
const __tmcCancelIdle = window.cancelIdleCallback || clearTimeout;

function __tmcRunInIdle(fn){ try{ return __tmcReqIdle(fn); }catch(_){ return setTimeout(fn,0); } }

// יחלק עבודה לפריימים כדי לא לעבור ~16ms
function __tmcFrameSlicer(iterateFn, {maxMs=12} = {}){
  let stopped = false;
  function step(){
    const start = performance.now();
    while(!stopped){
      if (performance.now() - start > maxMs) break;
      const more = iterateFn();
      if (!more){ stopped = true; break; }
    }
    if (!stopped) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
  return ()=>{ stopped = true; };
}

// ===============================
// rAF batching + inline cleanup
// ===============================
function __tmcRemoveInlineProps(el, props){
  try{
    if (!el || !el.getAttribute) return;
    const styleAttr = el.getAttribute('style');
    if (!styleAttr) return;
    const style = el.style;
    props.forEach(p=>{ try{ style.removeProperty(p); }catch(_){ } });
    /* also remove both hyphenated and camelCase white-space just in case */
    // if style is now empty, drop the attribute
    if (!style.cssText || !style.cssText.trim()) el.removeAttribute('style');
  }catch(_){}
}

function __tmcNormalizePreviewStylesLegacy(root){
  try{
    __tmcEnsurePreviewCSS();
    // 1) container
    const row = root.querySelector('div[data-tmc-wrap-row], div[data-tmc-wrap-row="1"]') ||
                root.querySelector('div'); // fallback: first div in the cell
    if (row){
      row.classList.add('tmc-preview-row');
      __tmcRemoveInlineProps(row, [
        'display','flex','flex-wrap','gap','white-space','overflow-x',
        'width','max-width','min-width','place-content'
      ]);
      /* nuke legacy nowrap on the container */
      __tmcRemoveInlineProps(row, ['white-space','whiteSpace','width','max-width','min-width']);
    }
    // 2) cards — broaden selection (supports nested/wrapped cards)
    let cards = [];
    if (row){
      const direct = Array.from(row.children);
      const known  = Array.from(row.querySelectorAll('.d-flex.align-items-center.border.rounded.p-2.m-1.bg-white'));
      const all    = direct.concat(known);
      // de-dup by element
      const seen = new Set();
      cards = all.filter(el => el && el.nodeType === 1 && !seen.has(el) && (seen.add(el), true));
    }
    const perFrame = 6; // היה 25 — הקטנו כדי לקצר rAF handlers
    let i = 0;
    function _batch(){
      const end = Math.min(i + perFrame, cards.length);
      for (; i < end; i++){
        const card = cards[i];
        if (!(card && card.nodeType === 1)) continue;
        card.classList.add('tmc-preview-card');
        __tmcRemoveInlineProps(card, [
          'display','flex','flex-basis','flex-grow','flex-shrink',
          'min-width','width','max-width','align-self','border-radius',
          'whiteSpace','white-space' /* ensure no inline nowrap sticks around */
        ]);
        // img
        const img = card.querySelector('img');
        if (img){
          img.classList.add('tmc-preview-img');
          __tmcRemoveInlineProps(img, ['width','height','object-fit','margin-left','cursor','border-radius','max-width','max-height']);
        }
        // title
        const title = card.querySelector('.font-weight-bold.copy-enabled');
        if (title){
          title.classList.add('tmc-preview-title');
          __tmcRemoveInlineProps(title, ['font-size','overflow-wrap','font-weight','white-space','whiteSpace']);
        }
        // meta block (gray text)
        const meta = card.querySelector('.text-muted');
        if (meta){
          meta.classList.add('tmc-preview-meta');
          __tmcRemoveInlineProps(meta, ['font-size','white-space','whiteSpace']);
          try{ if (typeof highlightPickQuantities === 'function') highlightPickQuantities(meta); }catch(_){}
        }
      }
      return i < cards.length;
    }
    // פריימסלייסר: מריץ _batch במספר פריימים בלי לחרוג מתקציב זמן
    __tmcTimeoutSlicer(_batch, { maxMs: 8 });
  }catch(_){}
}

// legacy helper remains for compatibility but should not be called anymore
// function __tmcNormalizePreviewStylesLegacy(...) { ... }

// Replace any remaining callers defensively (in case older copies exist)
try{
  if (window.__tmcNormalizePreviewStyles && window.__tmcNormalizePreviewStylesLegacy){
    window.__tmcNormalizePreviewStylesLegacy = window.__tmcNormalizePreviewStyles;
  }
}catch(_){}

// --- Deep DOM deduplication to avoid duplicate PREVIEW rows ---
function __tmcDeepDeduplicateDom(){
  try{
    // דחיפת דה-דאופ כבד ל-idle כדי לא לחסום קליקים/גלילה
    __tmcRunInIdle(()=>{
      const rows = document.querySelectorAll('tr[id^="preview-for-"]');
      let lastById = new Map();
      rows.forEach(tr => {
        const key = tr.id;
        const last = lastById.get(key);
        if (last && last.nextElementSibling === tr && last.outerHTML === tr.outerHTML){
          tr.remove();
        } else {
          lastById.set(key, tr);
        }
      });
    });
  }catch(e){ /* ignore */ }
}

// --- Split current preview META line into 3 lines (Barcode / Price / Qty) ---
function splitPreviewMetaLines(rootEl){
  if (!rootEl) return;
  // scope to the preview <td> if possible; else use rootEl
  const scope = (rootEl.matches && rootEl.matches('td[colspan]'))
    ? rootEl
    : (rootEl.closest && rootEl.closest('td[colspan]')) || rootEl;
  const metas = scope.querySelectorAll('.text-muted');
  metas.forEach(meta => {
    if (!meta || meta.__tmSplitDone) return;
    const card = meta.closest('.tmc-preview-card') ||
                 meta.closest('.d-flex.align-items-center.border.rounded.p-2.m-1.bg-white') ||
                 meta.parentElement;
    if (!meta || meta.__tmSplitDone) return;
    const raw = (meta.textContent || '').replace(/\s+/g,' ').trim();

    // חילוץ ערכים מתוך "מק\"ט:/ברקוד: … | כמות: … | מחיר: ₪… (סה\"כ: …)"
    // תומך גם בטקסט מקורי שמכיל "מק\"ט" וגם בגרסה עתידית עם "ברקוד"
    const sku   = (raw.match(/(?:מק"?ט|ברקוד)[:\s]*([0-9]{7,14})/)||[])[1] || '';
    const qty   = (raw.match(/כמות[:\s]*([^|)]+)/)||[])[1]?.trim() || '';
    const price = (raw.match(/מחיר[:\s]*₪?\s*([\d.,]+)/)||[])[1] || '';
    const total = (raw.match(/סה"?כ[:\s]*₪?\s*([\d.,]+)/)||[])[1] || '';

    // בונים HTML חדש אך שומרים על העיצוב הקיים (אותה class ו-inline-style של meta)
    const keepStyle = meta.getAttribute('style') || '';
    const keepClass = meta.getAttribute('class') || 'text-muted';
    const lines = [
      // מציגים "ברקוד:" במקום "מק״ט:"
      sku   ? `<div><b>ברקוד:</b> ${sku}</div>` : '',
      price ? `<div><b>מחיר:</b> ₪${price}</div>` : '',
      qty   ? `<div><b>כמות:</b> ${__tmcColorQtySpan(qty)}</div>` : '',
      // אם תרצה גם את הסה"כ, בטל הערה בשורה הבאה:
      // total ? `<div><span>(סה״כ: ₪${total})</span></div>` : ''
    ].filter(Boolean).join('');

    meta.setAttribute('class', keepClass);
    if (keepStyle) meta.setAttribute('style', keepStyle);
    meta.innerHTML = lines;
    // מיד אחרי בניית השורות, הדגש 3 ספרות אחרונות בשדה הברקוד שב־PREVIEW
    try { window.__tmcApplyBarcodeLast3Bold && window.__tmcApplyBarcodeLast3Bold(meta); } catch(_){}
    // harden wrapping
    meta.style.whiteSpace = 'normal';
    // make sure the parent card is on the canonical variant
    if (card){
      card.classList.add('tmc-preview-card');
      // CSS now handles all the styling with !important, just clean up conflicting inline styles
      card.style.removeProperty('flex');
      card.style.removeProperty('width');
      card.style.removeProperty('max-width');
      card.style.removeProperty('white-space');
      card.style.removeProperty('whiteSpace');
    }
    // keep the same coloring semantics the sidepanel uses
    try { if (typeof highlightPickQuantities === 'function') highlightPickQuantities(meta); }catch(_){ }
    meta.__tmSplitDone = true;
  });
  try { __tmcDeepDeduplicateDom(); } catch(_) {}
}

// Observe any future preview rows and split their meta lines as well
(function wireSplitPreviewObserver(){
  if (window.__tmcPreviewMO) return;

  const PREVIEW_TD_SEL = 'tr[id^="preview-for-"] td[colspan]';
  const PREVIEW_TR_SEL = 'tr[id^="preview-for-"]';

  // Anchor observation to the table if we can find one; else body / documentElement
  function resolveAnchor(){
    return (
      document.querySelector(PREVIEW_TR_SEL)?.closest('table') ||
      document.querySelector('table') ||
      document.body ||
      document.documentElement
    );
  }
  let anchor = resolveAnchor();

  // Guard to ignore MOs triggered by our own mutations
  let _squelchMO = false;

  // Items we *must* process even if offscreen (rare). We'll still do them off-rAF.
  const pending = new Set();
  let flushId = 0;

  function scheduleFlush(){
    if (flushId) return;
    flushId = __tmcRunInIdle(()=>{
      const items = Array.from(pending); pending.clear();
      let i = 0;
      _squelchMO = true;
      __tmcTimeoutSlicer(()=>{
        const end = Math.min(i + 3, items.length);
        for (; i < end; i++){
          const td = items[i];
          if (!td || td.dataset.tmcHydrated === "1") continue;
          try { splitPreviewMetaLines(td); } catch(_){}
          try { __tmcNormalizePreviewStyles(td); } catch(_){}
          try { td.dataset.tmcHydrated = "1"; } catch(_){}
        }
        if (i >= items.length){
          _squelchMO = false;
          flushId = 0;
          try { __tmcRunInIdle(__tmcDeepDeduplicateDom); } catch(_){}
          return false;
        }
        return true;
      }, {maxMs: 8});
    });
  }

  function asPreviewTd(node){
    if (!(node && node.nodeType === 1)) return null;
    const el = node.matches?.(PREVIEW_TD_SEL) ? node :
               node.closest?.(PREVIEW_TD_SEL);
    return el || null;
  }

  const mo = new MutationObserver(muts=>{
    if (_squelchMO) return;
    for (const m of muts){
      if (m.type !== 'childList') continue;
      // Only react to actual PREVIEW rows/cells being inserted
      for (const n of m.addedNodes){
        // Fast path: new <tr id="preview-for-...">
        if (n.nodeType === 1 && n.matches?.(PREVIEW_TR_SEL)){
          const td = n.querySelector?.('td[colspan]');
          if (td){
            __tmcPreviewIO.observe(td); // process when visible
            pending.add(td);            // also queue a best-effort eager pass
          }
          continue;
        }
        // Otherwise accept only direct PREVIEW td (not deep children)
        const td = (n.nodeType === 1 && n.tagName === 'TD' && n.hasAttribute('colspan') && n.closest(PREVIEW_TR_SEL))
          ? n : asPreviewTd(n);
        if (td){
          __tmcPreviewIO.observe(td);
          pending.add(td);
        }
      }
    }
    if (pending.size) scheduleFlush();
  });

  window.__tmcPreviewMO = mo;
  // Robust observe: never call observe() with a non-Node
  function safeObserve() {
    try {
      const a = resolveAnchor();
      if (a && a.nodeType === 1 || a === document || a === document.documentElement || a === document.body) {
        mo.observe(a, { subtree: true, childList: true });
        return true;
      }
    } catch(_) {}
    return false;
  }
  if (!safeObserve()) {
    // try again later, but do not attach to documentElement to avoid hot MOs
    document.addEventListener('DOMContentLoaded', () => { safeObserve(); }, { once: true });
    window.addEventListener('load', () => { safeObserve(); }, { once: true });
  }

  // Bootstrap: observe any existing PREVIEW tds currently in DOM
  document.querySelectorAll(PREVIEW_TD_SEL).forEach(td => __tmcPreviewIO.observe(td));
})();

/* ============================================================
   PREVIEW STYLE WATCHERS (toggle with localStorage 'tmcWatchPreviews' = '1')
   - Highlights elements that change layout-critical properties.
   - Logs a compact diff so we can pinpoint the "jump" source.
   ============================================================ */
(function __tmcInstallPreviewStyleWatchers(){
  if (window.__tmcStyleWatchInstalled) return;
  window.__tmcStyleWatchInstalled = true;
  const KEY = 'tmcWatchPreviews';
  const PROPS = ['white-space','display','max-width','width','font-size','line-height','margin','padding'];
  const HILITE = 'outline: 2px dashed #e67e22 !important; outline-offset: 2px !important;';
  let enabled = false, mo = null, last = new WeakMap();
  function getEnabled(){ try { return localStorage.getItem(KEY) === '1'; } catch(_) { return false; } }
  function capture(el){
    const cs = getComputedStyle(el);
    const snap = {};
    PROPS.forEach(p => snap[p] = cs.getPropertyValue(p));
    return snap;
  }
  function diff(a,b){
    const d = {};
    PROPS.forEach(p => { if ((a[p]||'') !== (b[p]||'')) d[p] = [a[p]||'', b[p]||'']; });
    return d;
  }
  function watch(){
    if (mo) mo.disconnect();
    if (!enabled) return;
    mo = new MutationObserver(muts => {
      for (const m of muts){
        const nodes = [];
        m.addedNodes && nodes.push(...m.addedNodes);
        m.target && nodes.push(m.target);
        nodes.forEach(n => {
          if (!(n && n.nodeType === 1)) return;
          if (!n.closest('tr[id^="preview-for-"]')) return;
          const prev = last.get(n) || capture(n);
          const cur  = capture(n);
          const d = diff(prev, cur);
          if (Object.keys(d).length){
            last.set(n, cur);
            try { n.setAttribute('style', HILITE + (n.getAttribute('style')||'')); } catch(_){}
            console.warn('[PreviewStyleChange]', n, d);
          }
        });
      }
    });
    mo.observe(document.body || document.documentElement, { subtree:true, childList:true, attributes:true, attributeFilter:['style','class'] });
  }
  function toggle(){
    enabled = getEnabled();
    watch();
  }
  // boot + live toggle
  toggle();
  // Cross-tab toggle
  window.addEventListener('storage', (e)=>{ if (e.key === KEY) toggle(); });
  // Same-tab manual toggle for DevTools (no reload needed)
  window.__tmcForceToggleStyleWatch = function(){
    enabled = getEnabled();
    watch();
    console.info('[Toolbox] Preview style watch', enabled ? 'ENABLED' : 'DISABLED');
  };
})();

// Configure Crisp to mark our script as safe - enhanced version
function configureCrispSafeMode() {
  // Multiple approaches to ensure Crisp gets the safe flag
  const setCrispSafe = () => {
    try {
      // Method 1: Direct push if $crisp exists
      if (window.$crisp && Array.isArray(window.$crisp)) {
        window.$crisp.push(["safe", true]);
        if (DEBUG) console.log('[Toolbox] Crisp safe mode configured via $crisp');
        return true;
      }

      // Method 2: Set global flag for other scripts
      window.CRISP_SAFE_MODE = true;

      // Method 3: Try to configure via window.crisp (alternative API)
      if (window.crisp && typeof window.crisp.push === 'function') {
        window.crisp.push(["safe", true]);
        if (DEBUG) console.log('[Toolbox] Crisp safe mode configured via crisp');
        return true;
      }

      return false;
    } catch (e) {
      if (DEBUG) console.warn('[Toolbox] Error configuring Crisp safe mode:', e);
      return false;
    }
  };

  // Immediate attempt
  if (setCrispSafe()) return;

  // Poll for Crisp with multiple strategies
  let attempts = 0;
  const maxAttempts = 100; // 20 seconds

  const pollInterval = setInterval(() => {
    if (setCrispSafe() || ++attempts >= maxAttempts) {
      clearInterval(pollInterval);
    }
  }, 200);

  // Also listen for DOM events that might indicate Crisp loading
  const crispLoadEvents = ['DOMContentLoaded', 'load', 'crisp:ready'];
  crispLoadEvents.forEach(event => {
    document.addEventListener(event, () => {
      setTimeout(setCrispSafe, 100);
    }, { once: true, passive: true });
  });
}

// Gentle console filtering - focuses only on our script's output
function setupCrossScriptConsoleFiltering() {
  // Set up global flag to help other scripts behave better
  window.LIONWHEEL_PRODUCTION_MODE = !DEBUG;

  // Signal to other scripts that they should reduce logging
  window.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'LIONWHEEL_GET_DEBUG_MODE') {
      event.source.postMessage({
        type: 'LIONWHEEL_DEBUG_MODE_RESPONSE',
        debug: DEBUG
      }, event.origin);
    }
  });

  // Set up early Crisp configuration to reduce warnings - multiple approaches
  if (!window.$crisp) {
    window.$crisp = [];
  }

  // Add safe mode immediately if Crisp array exists
  if (Array.isArray(window.$crisp)) {
    window.$crisp.push(["safe", true]);
  }

  // Also set up alternative Crisp APIs
  if (!window.crisp) {
    window.crisp = [];
  }

  if (Array.isArray(window.crisp)) {
    window.crisp.push(["safe", true]);
  }

  // Set a global flag that Crisp can check
  window.CRISP_SAFE_MODE = true;
  window.USERSCRIPT_SAFE_MODE = true;

  if (DEBUG) {
    console.log('[Toolbox] Cross-script coordination initialized');
  }
}

// === Copy feedback + guard ===
window._tmCopying = false;
// מרכזים את הטוסט דרך המנגנון האחיד + מניעת כפילות
function tmToast(msg = 'הועתק!', targetElement = null) {
  try {
    const now = performance.now();
    if (window.__tmToastStamp && (now - window.__tmToastStamp) < 600) return; // אל תציג כפול
    const p = window.__tmLastPointer;
    if (p && (now - p.t) < 1200) {
      showCopyToastAtPoint(p.x, p.y, msg);
    } else {
      const anchor = targetElement || document.activeElement || document.body;
      showCopyToastNearNode(anchor, msg);
    }
    window.__tmToastStamp = now;
  } catch(_) {}
}

function withCopying(fn){
  return (...args) => {
    window._tmCopying = true;
    try {
      const result = fn(...args);

      // Fix shipment wrapping after copying (debounced)
      // fixShipmentWrapping(); // Removed for performance

      return result;
    }
    finally { setTimeout(()=>{ window._tmCopying = false; }, 150); }
  };
}

// Throttling mechanism for heavy reflows
let _tmObsTick = 0, _tmObsScheduled = false;
function scheduleHeavy(fn){
  if (_tmObsScheduled) return;
  _tmObsScheduled = true;
  requestAnimationFrame(() => {
    _tmObsScheduled = false;
    fn();

    // Fix shipment wrapping after heavy operations (debounced)
    // fixShipmentWrapping(); // Removed for performance
  });
}

// Function to fix shipment number wrapping - optimized for performance
let fixShipmentWrappingTimeout = null;
let fixShipmentWrappingLastRun = 0;
const FIX_SHIPMENT_DEBOUNCE_MS = 100; // Only run once every 100ms

function fixShipmentWrapping() {
  const now = Date.now();

  // Clear existing timeout
  if (fixShipmentWrappingTimeout) {
    clearTimeout(fixShipmentWrappingTimeout);
  }

  // If we just ran recently, debounce it
  if (now - fixShipmentWrappingLastRun < FIX_SHIPMENT_DEBOUNCE_MS) {
    fixShipmentWrappingTimeout = setTimeout(() => {
      fixShipmentWrappingImpl();
    }, FIX_SHIPMENT_DEBOUNCE_MS);
    return;
  }

  // Run immediately
  fixShipmentWrappingImpl();
}

function fixShipmentWrappingImpl() {
  try {
    fixShipmentWrappingLastRun = Date.now();

    // Use CSS classes instead of inline styles for better performance
    const shipmentCells = document.querySelectorAll('td[data-label="משלוח"]:not(.shipment-no-wrap)');

    if (shipmentCells.length === 0) {
      return; // No new cells to fix
    }

    shipmentCells.forEach(cell => {
      cell.classList.add('shipment-no-wrap');

      // Apply to child elements that don't already have the class
      const childElements = cell.querySelectorAll('*:not(.shipment-no-wrap)');
      childElements.forEach(child => {
        child.classList.add('shipment-no-wrap');
      });
    });

    if (window.DEBUG_TOOLBOX) {
      console.log(`[Toolbox] Fixed ${shipmentCells.length} shipment cells (optimized)`);
    }
  } catch (error) {
    console.error('[Toolbox] Error fixing shipment wrapping:', error);
  }
}

// Override fetch to handle blocked requests gracefully
const originalFetch = window.fetch;
window.fetch = function(input, init) {
  const url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
  const SUPPRESSED = /google-analytics\.com|connect\.facebook\.net|clarity\.ms/;
  return originalFetch.apply(this, [input, init]).catch(error => {
    const blocked = String(error && error.message || '').includes('ERR_BLOCKED_BY_CLIENT');
    if (blocked && url && SUPPRESSED.test(url)) {
      console.debug('Suppressed blocked tracker request:', url);
      return new Response('', { status: 204, statusText: 'No Content' });
    }
    throw error;
  });
};

// Override XMLHttpRequest to handle blocked requests gracefully
const originalXHROpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function(method, url, ...args) {
  this._url = url;
  return originalXHROpen.apply(this, [method, url, ...args]);
};

const originalXHRSend = XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.send = function(...args) {
  const xhr = this;
  const originalOnError = xhr.onerror;

  xhr.onerror = function(event) {
    // Check if it's a blocked request
    if (xhr._url && (
      xhr._url.includes('rollbar.min.js') ||
      xhr._url.includes('beacon.min.js') ||
      xhr._url.includes('fbevents.js') ||
      xhr._url.includes('clarity.ms') ||
      xhr._url.includes('google-analytics.com')
    )) {
      // Suppress blocked request errors
      console.debug('XHR Request blocked by client (likely ad blocker):', xhr._url);
      return;
    }

    // Call original error handler if it exists
    if (originalOnError) {
      originalOnError.call(xhr, event);
    }
  };

  return originalXHRSend.apply(this, args);
};

// Use MutationObserver to handle blocked scripts instead of global createElement override
function setupBlockedScriptObserver() {
  // List of blocked script patterns
  const blockedPatterns = [
    'rollbar.min.js',
    'beacon.min.js',
    'fbevents.js',
    'clarity.ms',
    'google-analytics.com'
  ];

  // MutationObserver to detect and neutralize blocked scripts after they're added
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'SCRIPT') {
          const src = node.src || node.getAttribute('src');
          if (src && blockedPatterns.some(pattern => src.includes(pattern))) {
            // Remove the script element to prevent errors
            if (node.parentNode) {
              node.parentNode.removeChild(node);
              if (DEBUG) console.debug('[Toolbox] Removed blocked script:', src);
            }
          }
        }
      });
    });
  });

  // Start observing
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  if (DEBUG) console.log('[Toolbox] Blocked script observer initialized');
}

// Initialize the observer
setupBlockedScriptObserver();

// Clean inline constraints + dead image
(function fixPickModalThumb() {
  function fixRow(row) {
    const wrap = row.querySelector('div[style*="width: 50px"][style*="height: 50px"]');
    if (wrap) {
      wrap.classList.add('tm-thumb-wrap');
      wrap.removeAttribute('style'); // kill the inline 50px + margins
    }
    const img = row.querySelector('img.tampermonkey-sku-image');
    if (img) {
      img.style.padding = '0';
      img.style.maxWidth = '100%';
      img.style.maxHeight = '100%';
      img.style.width = '100%';
      img.style.height = '100%';
    }
    row.querySelectorAll('.symbol img').forEach(el => {
      if (!el.getAttribute('src')) el.closest('.symbol')?.remove();
    });
  }

  function scan(root=document) {
    root.querySelectorAll('.pick-order-item-row').forEach(fixRow);
  }
  const mo = new MutationObserver(m => m.forEach(r => r.addedNodes.forEach(n => {
    if (n && typeof n.querySelectorAll === 'function') scan(n);
  })));

  function startObserve(){
    // prefer body; fall back to documentElement; defer until ready if needed
    const anchor = document.body || document.documentElement;
    if (anchor && (anchor.nodeType === 1)) {
      try { mo.observe(anchor, { childList: true, subtree: true }); } catch(_){}
      return true;
    }
    return false;
  }

  if (document.readyState === 'loading' && !document.body) {
    document.addEventListener('DOMContentLoaded', () => { scan(); startObserve(); }, { once: true });
  } else {
    scan();
    if (!startObserve()) {
      // final fallback after load tick
      window.addEventListener('load', () => { startObserve(); }, { once: true });
    }
  }
})();

(function() {
    'use strict';

    // ---< WhatsApp Tab Closer >---
    if (window.location.hostname.includes('api.whatsapp.com')) {
        setTimeout(() => {
            window.close();
        }, 1000);
        return;
    }

    // ---< Merlog Panel View Highlighting >---
    GM_addStyle(`
        /* Offcanvas highlighting disabled - only panel_view will be highlighted */

        /* Green highlighting for "מוכן" status */
        /* ===== Branch (סניף) – Brown ===== */
        /* Row highlight (tables) */
        tr.branch-row-highlight {
          background-color: #EBD9C3 !important; /* brown-ish, עדין ובולט */
        }

        /* Panel & Fullscreen (cover the whole container like green/red/purple/pink) */
        .offcanvas.branch-highlight,
        .card.branch-highlight,
        .offcanvas.branch-highlight .tab-content,
        .offcanvas.branch-highlight .tab-pane,
        .card.branch-highlight .tab-content,
        .card.branch-highlight .tab-pane {
          background-color: #EBD9C3 !important;
          background-image: none !important;
          box-shadow: none !important;
          border: none !important;
        }

        /* Make sure there is no inherited frame on fullscreen when brown is active */
        .card.branch-highlight::before,
        .card.branch-highlight::after {
          content: none !important;
        }

        .ready-highlight {
            background-color: #dfffe5 !important;
            border: 2px solid #9ae6b4 !important;
        }

        .ready-highlight .tab-content,
        .ready-highlight .tab-pane,
        .offcanvas.ready-highlight,
        .card.ready-highlight,
        .offcanvas.ready-highlight .tab-content,
        .offcanvas.ready-highlight .tab-pane,
        .card.ready-highlight .tab-content,
        .card.ready-highlight .tab-pane {
            background-color: #dfffe5 !important;
        }

        .ready-highlight a.ready-highlight {
            background-color: #dcfce7 !important;
            color: #166534 !important;
            padding: 2px 4px !important;
            border-radius: 3px !important;
            text-decoration: none !important;
        }

        .ready-highlight a.ready-highlight:hover {
            background-color: #bbf7d0 !important;
            color: #15803d !important;
        }

        .ready-highlight span.ready-highlight,
        .ready-highlight div.ready-highlight,
        .ready-highlight p.ready-highlight {
            background-color: #dcfce7 !important;
            color: #166534 !important;
            padding: 1px 3px !important;
            border-radius: 2px !important;
            font-weight: bold !important;
        }

        /* Table row green highlighting */
        tr.ready-row-highlight {
            background-color: #dfffe5 !important;
        }

        td.ready-highlight {
            background-color: #dcfce7 !important;
            border-radius: 4px;
            padding: 4px 8px;
            margin: 2px 0;
        }

        td.ready-highlight:hover {
            background-color: #bbf7d0 !important;
        }

        /* ===== Coordination (Teum) – Purple (strong) ===== */
        /* סגול – כיסוי מלא באותו צבע כמו בירוק */
        .offcanvas.coord-highlight,
        .offcanvas.coord-highlight .tab-content,
        .offcanvas.coord-highlight .tab-pane,
        .card.coord-highlight,
        .card.coord-highlight .tab-content,
        .card.coord-highlight .tab-pane {
          background-color: #E3D1FD !important;
        }
        .coord-highlight a.coord-highlight {
          background-color: #f3e8ff !important; /* purple-100 */
          color: #6b21a8 !important;            /* purple-800 – חד יותר */
          padding: 2px 4px !important;
          border-radius: 3px !important;
          text-decoration: none !important;
        }
        .coord-highlight a.coord-highlight:hover {
          background-color: #E3D1FD !important; /* purple */
          color: #581c87 !important;            /* purple-900 */
        }
        .coord-highlight span.coord-highlight,
        .coord-highlight div.coord-highlight,
        .coord-highlight p.coord-highlight {
          background-color: #f3e8ff !important;
          color: #6b21a8 !important;
          padding: 1px 3px !important;
          border-radius: 2px !important;
          font-weight: bold !important;
        }
        /* Table row purple highlighting */
        tr.coord-row-highlight {
          background-color: #E3D1FD !important; /* purple – בולט יותר */
        }

        /* ===== Coordination + Ready (50/50 top→bottom, hard stop) ===== */
        /* חצי–חצי (למעלה סגול/למטה ירוק) – אותו גרדיאנט גם בפנים וגם בקונטיינר */
        .offcanvas.coord-ready-highlight,
        .card.coord-ready-highlight,
        .offcanvas.coord-ready-highlight .tab-content,
        .card.coord-ready-highlight .tab-content,
        .offcanvas.coord-ready-highlight .tab-pane,
        .card.coord-ready-highlight .tab-pane {
          background-image: linear-gradient(
            to bottom,
            #E3D1FD 0%, #E3D1FD 50%,
            #dfffe5 50%, #dfffe5 100%
          ) !important;
          background-color: transparent !important;
          background-repeat: no-repeat !important;
        }
        /* Row: חצי סגול (למעלה) חצי ירוק (למטה), קו חד */
        tr.coord-ready-row-highlight {
          background-image: linear-gradient(
            to bottom,
            #f5d0fe 0 50%,
            #dcfce7 50% 100%
          ) !important;
          background-color: transparent !important;
          background-repeat: no-repeat !important;
          background-attachment: local !important;
        }

        /* Font Awesome copy icon styling */
        .copy-icon > i.fa-light.fa-clone {
            font-size: 0.95em;
            line-height: 1;
            vertical-align: middle;
            color: #3699ff;
        }
        .copy-icon { cursor: pointer; }

        /* ==== Full-surface highlights for panel & full-page ==== */
        .offcanvas.ready-highlight, .card.ready-highlight {
          background-color: #dfffe5 !important;
        }
        .offcanvas.merlog-highlight, .card.merlog-highlight {
          background-color: #ffdada !important;
          border: 2px solid #fecaca !important;
        }

        /* ===== Mission (Pink) — ורוד עבור שם המכיל "משימה/משימת" ===== */
        .offcanvas.mission-highlight,
        .card.mission-highlight,
        .offcanvas.mission-highlight .tab-content,
        .offcanvas.mission-highlight .tab-pane,
        .card.mission-highlight .tab-content,
        .card.mission-highlight .tab-pane {
          background-color: #ffadeb !important; /* pink-100 */
          background-image: none !important;
          box-shadow: none !important;
        }

        /* Table row pink highlighting */
        tr.mission-row-highlight { /* Pink */
          background-color: #ffadeb !important;
        }

        /* Inline pink chips inside a pink container if needed */
        .mission-highlight a.mission-highlight,
        .mission-highlight span.mission-highlight,
        .mission-highlight div.mission-highlight,
        .mission-highlight p.mission-highlight {
          background-color: #ffadeb !important;
          color: #9D174D !important; /* deep pink */
          padding: 1px 3px !important;
          border-radius: 2px !important;
          font-weight: bold !important;
          text-decoration: none !important;
        }

        /* ליתר ביטחון: להסיר כל מסגרת/צל ב־card סגול/חצי־חצי */
        .card.coord-highlight,
        .card.coord-ready-highlight {
          border: none !important;
          box-shadow: none !important;
          outline: none !important;
        }
        .card.coord-highlight::before,
        .card.coord-highlight::after,
        .card.coord-ready-highlight::before,
        .card.coord-ready-highlight::after {
          content: none !important;
        }
    `);

    // Custom PNG cursor for copy-enabled areas (hotspot 0 0). Force on descendants to beat more specific rules.
    GM_addStyle(`
      .copy-enabled,
      .copy-enabled *:not(input):not(textarea) {
        cursor: url("https://raw.githubusercontent.com/AdamLee9186/anipet/957e3a08c7d518fcc5c469a2877136139ad0519f/cursor_copy_32.png") 0 0, copy !important;
      }
      .copy-enabled .copy-icon {
        cursor: url("https://raw.githubusercontent.com/AdamLee9186/anipet/957e3a08c7d518fcc5c469a2877136139ad0519f/cursor_copy_32.png") 0 0, copy !important;
      }
    `);

    // ---[ Pick Modal: force 64×64 thumb + spacing, override inline ]---
    GM_addStyle(`
      /* 1) Enlarge the WRAP (the 50×50 div before the <img>) */
      .modal-dialog .pick-order-item-table td.pick-order-item-row .d-flex.align-items-center > div[style*="width: 50px"][style*="height: 50px"] {
        width: 64px !important;
        height: 64px !important;
        flex: 0 0 64px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        /* breathing room from text (RTL/LTR safe) */
        margin-inline-end: 12px !important;
        /* kill any inline margin-right that was there */
        margin-right: 12px !important;
      }

      /* 2) Make the IMG fill the wrapper completely (kill inline padding/max-*) */
      .modal-dialog .pick-order-item-table td.pick-order-item-row img.tampermonkey-sku-image {
        width: 100% !important;
        height: 100% !important;
        max-width: 100% !important;
        max-height: 100% !important;
        padding: 0 !important;
        margin: 0 !important;
        object-fit: contain !important;   /* use 'cover' if you want a tight crop */
        object-position: center center !important;
        display: block !important;
        border-radius: 4px !important;
      }

      /* 3) Let the text block wrap instead of squeezing the image */
      .modal-dialog .pick-order-item-table td.pick-order-item-row .d-flex.flex-column.text-break {
        min-width: 0 !important;
        flex: 1 1 auto !important;
      }

      /* 4) Hide dead image blocks inside the row (Chromium supports :has) */
      .modal-dialog .pick-order-item-table td.pick-order-item-row .symbol:has(img[src=""]) {
        display: none !important;
      }

      /* 5) White tile for thumbs */
      .modal-dialog .pick-order-item-table td.pick-order-item-row .tm-thumb-wrap,
      .modal-dialog .pick-order-item-table td.pick-order-item-row .d-flex.align-items-center > div[style*="width: 50px"][style*="height: 50px"] {
        background: #fff !important;
        border-radius: 8px !important;
        overflow: hidden !important;
      }

      .modal-dialog .pick-order-item-table td.pick-order-item-row img.tampermonkey-sku-image {
        background: transparent !important;
        border-radius: 6px !important;
      }

      /* Gallery thumbnail styling */
      .gallery-thumbnails .gallery-thumbnail img {
        background: #fff !important;
        border-radius: 8px !important;
        padding: 2px !important;
        box-sizing: border-box !important;
        transition: box-shadow 0.2s ease, transform 0.2s ease;
      }

      /* Hover effect */
      .gallery-thumbnails .gallery-thumbnail img:hover {
        box-shadow: 0 0 6px rgba(0,0,0,0.25);
        transform: scale(1.03);
        cursor: pointer;
      }

      /* Active (selected) thumbnail */
      .gallery-thumbnails .gallery-thumbnail.active img {
        box-shadow: 0 0 0 2px #3699ff, 0 0 8px rgba(54,153,255,0.4);
        transform: scale(1.05);
      }

      /* Main preview image remains transparent */
      .gallery-main img,
      .gallery-preview img {
        background: transparent !important;
      }
    `);

    // ---< Main Anipet Toolbox Script >---
    const SCRIPT_NAME = "Lionwheel - Anipet Toolbox";
    const SCRIPT_VERSION = "13.8.30"; // Match @version
    if (DEBUG) console.log(`✅ ${SCRIPT_NAME} v${SCRIPT_VERSION} loaded.`);

    // Configure Crisp safe mode
    configureCrispSafeMode();

    // Enhanced console filtering for cross-script violations
    setupCrossScriptConsoleFiltering();

    // ---< Constants >---
    const IMAGE_FINDER_CSV_URL = "https://raw.githubusercontent.com/AdamLee9186/anipet/main/anipet_master_catalog_v1.csv";
    const BARCODE_REPLACER_CSV_URL = 'https://raw.githubusercontent.com/AdamLee9186/anipet/main/backoffice_catalog.csv';
    const PLACEHOLDER_IMG_URL = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="70" viewBox="0 0 80 70"><rect width="80" height="70" fill="#fafafa"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="12px" fill="#d4d4d4">אין תמונה</text></svg>');
    // Optional webhook to silently receive image report emails without opening a mail client
    // Example: 'https://hooks.zapier.com/hooks/catch/XXXX/YYYY'
    const IMAGE_REPORT_WEBHOOK_URL = '';
    const IMAGE_REPORT_WEBHOOK_TOKEN = '';

    // TM: Utility for batching DOM read/write operations to prevent forced reflow
    // Guard: only define here if not already defined by early shim
    if (typeof domBatch === 'undefined') {
    function domBatch(readOperations, writeOperations) {
      // Execute all read operations first
      const readResults = readOperations.map(op => typeof op === 'function' ? op() : op);

      // Then execute all write operations
      writeOperations.forEach(op => {
        if (typeof op === 'function') op();
      });

      return readResults;
    }
    }

    // ===== TM Preview Performance Boost (panel_view + cache + prefetch + 429/backoff) =====
    const TM_PREVIEW = (() => {
      const CACHE_TTL_MS = 5 * 60 * 1000; // 5 דקות
      const memCache = new Map(); // fallback בזיכרון
      const inflight = new Map(); // taskId -> Promise<string>
      let backoffUntil = 0;       // epoch ms
      let backoffMs = 0;          // exponential

      // preconnect ל-CDN תמונות נפוצות (רץ פעם אחת)
      (function preconnectOnce() {
        try {
          if (document.documentElement.dataset.tmPreconnect) return;
          document.documentElement.dataset.tmPreconnect = '1';
          const cdns = [
            'https://cdn.modulus.co.il',
          ];
          for (const href of cdns) {
            const link = document.createElement('link');
            link.rel = 'preconnect';
            link.href = href;
            document.head.appendChild(link);
          }
        } catch {}
      })();

      function now() { return Date.now(); }

      function parseRetryAfter(h) {
        if (!h) return 0;
        const s = Number(h);
        if (Number.isFinite(s)) return Math.max(0, s * 1000);
        const d = Date.parse(h);
        return Number.isNaN(d) ? 0 : Math.max(0, d - now());
      }

      function ssGet(key) {
        try { return JSON.parse(sessionStorage.getItem(key) || 'null'); } catch { return null; }
      }
      function ssSet(key, val) {
        try { sessionStorage.setItem(key, JSON.stringify(val)); } catch {}
      }

      function cacheKey(taskId) { return `tm_preview_panel_view_${taskId}`; }

      function setCached(taskId, html) {
        const rec = { html, t: now() };
        ssSet(cacheKey(taskId), rec);
        memCache.set(taskId, rec);
        return rec;
      }

      function getCached(taskId) {
        const k = cacheKey(taskId);
        let rec = ssGet(k);
        if (!rec) rec = memCache.get(taskId) || null;
        if (!rec) return null;
        if ((now() - rec.t) > CACHE_TTL_MS) return null;
        return rec;
      }

      async function fetchPanelView(taskId, { force = false, prefetch = false } = {}) {
        const id = String(taskId || '').trim();
        if (!id) throw new Error('missing task id');
        const url = `/tasks/${id}/panel_view`;

        // Global cooldown after server 429
        if (!force && backoffUntil && now() < backoffUntil) {
          const c = getCached(id);
          if (c) return c.html; // serve stale
          // soft-fail to reduce pressure
          throw new Error(`panel_view backoff ${Math.ceil((backoffUntil - now())/1000)}s`);
        }

        if (!force) {
          const cached = getCached(id);
          if (cached) return cached.html;
        }

        // Coalesce concurrent callers per taskId
        if (inflight.has(id)) return inflight.get(id);

        const p = (async () => {
          const resp = await fetch(url, {
            method: 'POST',
            headers: { 'accept': '*/*', 'content-type': 'application/json' },
            body: '{}'
          });

          if (resp.status === 429) {
            // Respect Retry-After, fallback exponential (max 60s)
            const ra = parseRetryAfter(resp.headers.get('Retry-After'));
            backoffMs = ra || Math.min(60000, (backoffMs || 2000) * 2);
            backoffUntil = now() + backoffMs;
            throw new Error('panel_view 429');
          }

          if (!resp.ok) throw new Error(`panel_view ${resp.status}`);

          // Read once; all callers will get the same string
          const html = await resp.text();
          setCached(id, html);        // <-- was cacheSet; fix name
          // Warm image cache (best-effort)
          try { await cachePreviewImages(html); } catch {}
          return html;
        })().finally(() => {
          inflight.delete(id);
        });

        inflight.set(id, p);
        return p;
      }

      // אופטימיזציית תמונות: lazy/async + רוחב שפוי; אם קיימת אצלך getOptimizedImageUrl — נשתמש בה.
      function optimizeImages(container) {
        const hasHelper = typeof window.getOptimizedImageUrl === 'function';
        const imgs = container.querySelectorAll('img');

        // TM: Batch read operations first
        const readOps = [
          () => container.clientWidth || 420
        ];
        const [containerWidth] = domBatch(readOps, []);

        // TM: Batch write operations
        const writeOps = [];
        imgs.forEach((img, i) => {
          writeOps.push(() => {
            img.loading = 'lazy';
            img.decoding = 'async';
            // לתמונת המפתח בקונטיינר – תעדוף טעינה גבוה
            if (i === 0 && !img.dataset.fetchPrioritySet) {
              try {
                img.fetchPriority = 'high';
                img.dataset.fetchPrioritySet = '1';
              } catch(_) {}
            }
            // רוחב יעד שיחסי לקונטיינר (עם קוונטיזציה כדי למקסם cache-hit)
            const bucketSet = [320, 480, 640, 960];
            let targetW = Math.min(960, Math.max(320, containerWidth));
            for (let i = 0; i < bucketSet.length; i++) {
              if (targetW <= bucketSet[i]) { targetW = bucketSet[i]; break; }
              if (i === bucketSet.length - 1) targetW = bucketSet[i];
            }
            if (hasHelper) {
              try {
                const stable = window.getOptimizedImageUrl(img.dataset.srcStable || img.src, targetW);
                img.src = stable;
                img.dataset.srcStable = stable;
              } catch {}
            } else {
              try {
                const url = new URL(img.src, location.origin);
                if (!url.searchParams.has('w')) url.searchParams.set('w', String(targetW));
                if (!url.searchParams.has('fit')) url.searchParams.set('fit', 'crop');
                const stable = url.toString();
                img.src = stable;
                img.dataset.srcStable = stable;
              } catch {}
            }
          });
        });

        domBatch([], writeOps);
      }

      // החדרת HTML יעילה ללא ג'אנק
      async function renderPreviewHTML(targetEl, html) {
        const frag = document.createDocumentFragment();
        const wrap = document.createElement('div');
        wrap.innerHTML = html;
        frag.appendChild(wrap);

        optimizeImages(wrap);

        // TM: Insert HTML immediately, then decode images in background
        targetEl.replaceChildren(); // מנקה את התא/הקונטיינר של ה-preview
        targetEl.appendChild(frag);

        // Mark as preview root to enable content-visibility optimizations
        try { targetEl.classList.add('tm-preview-root'); } catch(_) {}

        // Defer heavy post styling to idle + batch to reduce forced reflow
        const doPostStyle = () => {
          try {
            // Only keep the new multi-line/bigger-photo card styling
            domBatch([], [
              () => splitPreviewMetaLines(targetEl)
            ]);
          } catch(_) {}
        };
        // Use setTimeout instead of requestIdleCallback for more predictable timing
        setTimeout(doPostStyle, 0);

        // Decode images in background using requestIdleCallback or setTimeout
        const imgs = Array.from(wrap.querySelectorAll('img'));
        if (imgs.length > 0) {
          idleChunk(imgs, (img) => {
            try {
              img.loading = 'lazy';
              img.decoding = 'async';
            } catch {}
            if (img.decode) img.decode().catch(() => {});
          }, 12);
        }

        /* splitPreviewMetaLines moved into doPostStyle (batched) */

      }

      // Prefetch "אמיתי" (: ) על hover/viewport — can be hard-disabled to avoid 429
      const DISABLE_VIEWPORT_PREFETCH = false; // ← enabled with conservative budget
      // Conservative prefetch budget to avoid overwhelming server
      const PREFETCH_BUDGET = {
        maxConcurrent: 1, // Only 1 prefetch at a time
        active: new Set()
      };

      // Prefetch "אמיתי" — על hover/viewport (respects cache/backoff/dedupe)
      function prefetch(taskId) {
        if (getCached(taskId)) return; // יש קאש תקף
        if (PREFETCH_BUDGET.active.has(taskId)) return; // already prefetching
        if (PREFETCH_BUDGET.active.size >= PREFETCH_BUDGET.maxConcurrent) return; // budget full

        PREFETCH_BUDGET.active.add(taskId);
        fetchPanelView(taskId, { prefetch: true }).finally(() => {
          PREFETCH_BUDGET.active.delete(taskId);
        });
      }

      // חיבור אוטומטי ל-mouseenter על כפתורי preview
      function wireHoverPrefetch(root = document) {
        root.addEventListener('mouseenter', ev => {
          // TM: robust target for composed events & non-Element targets
          const raw = ev.composedPath ? ev.composedPath()[0] : ev.target;
          const targetEl = raw && raw.nodeType === 1 ? raw : null; // 1 = ELEMENT_NODE
          const btn = targetEl ? targetEl.closest('.preview-button, .preview-cell button, .preview-cell .btn') : null;
          if (!btn) return;
          const row = btn.closest('tr[data-task-id]');
          const taskId = row?.getAttribute('data-task-id');
          if (!taskId) return;
          prefetch(taskId);
        }, { capture: true, passive: true });
      }

      // Prefetch לפי גלילה עם rootMargin קטן יותר וקישור חד פעמי לכל שורה
      function wireViewportPrefetch(root = document) {
        if (DISABLE_VIEWPORT_PREFETCH) return; // hard stop if disabled
        if (!('IntersectionObserver' in window)) return;
        const io = new IntersectionObserver(entries => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            // TM: robust target for composed events & non-Element targets
            const raw = e.target;
            const targetEl = raw && raw.nodeType === 1 ? raw : null; // 1 = ELEMENT_NODE
            const row = targetEl ? targetEl.closest('tr[data-task-id]') : null;
            const taskId = row?.getAttribute('data-task-id');
            if (taskId) {
              try { if (row) io.unobserve(row); } catch {}
              prefetch(taskId);
            }
          }
        }, { rootMargin: '250px 0px' }); // conservative viewport prefetch

        root.querySelectorAll('tr[data-task-id]').forEach(tr => io.observe(tr));
      }

      return {
        fetchPanelView,
        renderPreviewHTML,
        prefetch,
        wireHoverPrefetch,
        wireViewportPrefetch,
        getCached,
      };
    })();

    // ---- Image cache warmer for previews ----
    const IMAGE_CACHE_NAME = 'toolbox-preview-images-v1';
    async function cachePreviewImages(html) {
      if (!('caches' in window)) return;
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const urls = Array.from(doc.querySelectorAll('img'))
        .map(img => img.getAttribute('src') || '')
        .filter(Boolean);
      if (urls.length === 0) return;
      const cache = await caches.open(IMAGE_CACHE_NAME);
      // Cap warmup to avoid bursts
      for (const u of urls.slice(0, 8)) {
        try { const hit = await cache.match(u); if (!hit) await cache.add(u); } catch {}
      }
    }

    // פונקציה חדשה לפתיחת preview עם אופטימיזציה
    async function openPreviewForRow(row) {
      const taskId = row?.getAttribute('data-task-id');
      if (!taskId) return;

      const container = row.querySelector('.preview-cell, .preview-target, .preview-container') || row;
      // אם יש קאש — מציגים מיידית, ובמקביל ננסה לרענן
      const cached = TM_PREVIEW.getCached(taskId);
      if (cached) {
        // מציג מיידית
        await TM_PREVIEW.renderPreviewHTML(container, cached.html);
        // מרענן בשקט (אם השתנה — המשתמש יקבל עדכון חלק)
        TM_PREVIEW.fetchPanelView(taskId, { force: true })
          .then(html => TM_PREVIEW.renderPreviewHTML(container, html))
          .catch(() => {});
        return;
      }

      // אין קאש — מציגים ספינר כרגיל בזמן fetch אמיתי
      showPreviewSpinner(container);
      try {
        const html = await TM_PREVIEW.fetchPanelView(taskId);
        await TM_PREVIEW.renderPreviewHTML(container, html);
      } catch (e) {
        showPreviewError(container, e);
      } finally {
        hidePreviewSpinner(container);
      }
    }

    // פונקציות עזר לספינר
    function showPreviewSpinner(container) {
      // TM: Use setTimeout instead of requestAnimationFrame to avoid performance violations
      setTimeout(() => {
        container.classList.add('tm-preview-loading');
        // ... הזרקת אייקון/HTML קל, בלי למדוד גדלים
      }, 0);
    }

    function hidePreviewSpinner(container) {
      container.classList.remove('tm-preview-loading');
    }

    function showPreviewError(container, error) {
      // Treat user-initiated aborts & navigations as expected; keep console clean
      const msg = String(error?.message || '');
      if (error?.name === 'AbortError' || /user aborted|The user aborted a request/i.test(msg)){
        if (DEBUG) console.debug('[Toolbox] preview fetch aborted');
        return;
      }
      console.error('[Toolbox] Failed to fetch task preview:', error);
      // במקרה של שגיאה, הצג הודעת שגיאה
      container.innerHTML = '<div class="text-center text-danger p-2">שגיאה בטעינת התצוגה המקדימה</div>';
    }

    // Easiest path: send directly to this email via FormSubmit without opening any mail app
    // The first submission will send you a confirmation email from FormSubmit — click Confirm once, ואז כל הדיווחים יישלחו אוטומטית
    const IMAGE_REPORT_DIRECT_EMAIL = 'adam.lee.9186@gmail.com';

    const SETTINGS_KEY = 'anipet_toolbox_settings';
    const PRODUCT_DATA_CACHE_KEY = 'anipet_product_data_cache';
    const IMAGE_CACHE_TIMESTAMP_KEY = 'anipet_image_cache_timestamp';
    const BARCODE_DATA_CACHE_KEY = 'anipet_barcode_data_cache';
    const BARCODE_CACHE_TIMESTAMP_KEY = 'anipet_barcode_cache_timestamp';
    const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

    // ---< Global State >---
    let settings = {
        showImages: true,
        replaceBarcodes: true,
        enablePreview: true,
        hideColumns: true,
        enableResponsive: true,
        addWhatsApp: true,
        highlightMerlog: true,
    };
    let productDataCache = null; // For Image Finder
    let itemCodeToBarcodeMap = null; // For Barcode Replacer
    let descriptionToBarcodeMap = null; // For Barcode Replacer

    // Initialize loading flags for enhanced search
    window.productDataLoading = false;
    window.barcodeDataLoading = false;

    // ---< Utility Functions >---
    var debounce = window.debounce || function (func, wait) {
        let timeout;
        return function(...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), wait);
        };
    };

    function safeExecute(func, fallback = null) {
        try {
            const result = func();

            // Fix shipment wrapping after safe execution
            // fixShipmentWrapping(); // Removed for performance - will be called by main logic

            return result;
        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Error in ${func.name || 'anonymous'}:`, error);
            return fallback;
        }
    }

    // =========================================
    // Tiny unit tests for quantity color logic
    // Run manually from console: __tmcRunQtyColorTests()
    // =========================================
    function __tmcRunQtyColorTests(){
      try{
        const cases = [
          ['0 / 1',    null],                    // neutral (kept plain)
          ['0 / 2',    'tampermonkey-picked-none'],
          ['1 / 2',    'tampermonkey-picked-partial'],
          ['2 / 2',    'tampermonkey-picked-full'],
          ['10 / 5',   null],                    // sanity guard -> unchanged
          ['2 / 1001', null]                     // sanity guard -> unchanged
        ];
        cases.forEach(([inp, expected])=>{
          const out = __tmcColorQtySpan(inp);
          const got = out.includes('class="') ? out.match(/class="([^"]+)"/)?.[1] : null;
          console.assert(got === expected, `qty color mismatch for "${inp}" → got: ${got}, expected: ${expected}`);
        });
        console.log('[Toolbox] __tmcRunQtyColorTests passed (asserts that did not throw are OK).');
      }catch(e){
        console.warn('[Toolbox] __tmcRunQtyColorTests failed', e);
      }
    }

    // =========================================
    // Click Optimizer (מצמצם "click handler took XXXms")
    // פועל רק בעמוד משלוחים (/operator/store_visits) ורק על הסלקטורים שלנו
    // =========================================
    function __tmcInstallClickOptimizer(){
      try{
        // טעינה רק בעמוד "משלוחים"
        const isStoreVisits = location.pathname.includes('/operator/store_visits');
        if (!isStoreVisits) return;

        if (window.__tmcClickOptInstalled) return;
        window.__tmcClickOptInstalled = true;

        // תופס אך ורק את הרכיבים שלנו (אפשר להוסיף data-tmc-click-optimized להרחבה עתידית)
        document.addEventListener('click', (e)=>{
          const btn = e.target && e.target.closest('.preview-toggle-all-button, td.preview-cell button, [data-tmc-click-optimized]');
          if (!btn) return;

          // בלימת דאבל־קליק אמיתי בלבד — לא עוצר single-click מהיר של ספריות UI
          if (e.detail > 1){
            e.stopImmediatePropagation();
            e.preventDefault();
            return;
          }
        }, true);
      }catch(_){}
    }
    __tmcInstallClickOptimizer();

    function getElementPath(element) {
        try {
            if (!element) return '';
            const path = [];
            let current = element;
            while (current && current !== document.body) {
                let selector = current.tagName.toLowerCase();
                if (current.id) {
                    selector += `#${current.id}`;
                } else if (current.className) {
                    const classes = current.className.split(' ').filter(c => c).join('.');
                    if (classes) selector += `.${classes}`;
                }
                path.unshift(selector);
                current = current.parentElement;
            }
            return path.join(' > ');
        } catch (error) {
            return 'error getting path';
        }

        // Fix shipment wrapping after getting element path
        // fixShipmentWrapping(); // Removed for performance - will be called by main logic
    }

    // Inline SVG icon factory (no Font Awesome dependency)
    function buildCopySvgIcon(title, onClick) {
        const svgNS = 'http://www.w3.org/2000/svg';
        const wrap = document.createElement('span');
        wrap.className = 'copy-icon';
        wrap.setAttribute('role', 'button');
        wrap.setAttribute('tabindex', '0');
        wrap.title = title;

        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('xmlns', svgNS);
        svg.setAttribute('viewBox', '0 0 640 640');
        const path = document.createElementNS(svgNS, 'path');
        path.setAttribute('d','M352 528L128 528C119.2 528 112 520.8 112 512L112 288C112 279.2 119.2 272 128 272L176 272L176 224L128 224C92.7 224 64 252.7 64 288L64 512C64 547.3 92.7 576 128 576L352 576C387.3 576 416 547.3 416 512L416 464L368 464L368 512C368 520.8 360.8 528 352 528zM288 368C279.2 368 272 360.8 272 352L272 128C272 119.2 279.2 112 288 112L512 112C520.8 112 528 119.2 528 128L528 352C528 360.8 520.8 368 512 368L288 368zM224 352C224 387.3 252.7 416 288 416L512 416C576 387.3 576 352L576 128C576 92.7 547.3 64 512 64L288 64C252.7 64 224 92.7 224 128L224 352z');
        svg.appendChild(path);
        wrap.appendChild(svg);

        const handler = (e) => { e.preventDefault(); e.stopPropagation(); onClick?.(e); };
        wrap.addEventListener('click', handler);
        wrap.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') handler(e); }, { passive: true });

        // Fix shipment wrapping after building copy SVG icon
        // fixShipmentWrapping(); // Removed for performance - will be called by main logic

        return wrap;
    }

    // Font Awesome icon factory (uses <i class="fa-light fa-clone">)
    function buildCopyFAIcon(title, onClick) {
        const span = document.createElement('span');
        span.className = 'copy-icon';
        span.setAttribute('role','button');
        span.setAttribute('tabindex','0');
        if (title) span.title = title;
        span.style.marginInlineStart = '6px';
        span.style.marginInlineEnd = '0';
        const i = document.createElement('i');
        i.className = 'fa-light fa-clone';
        span.appendChild(i);
        const handler = (e) => { e.preventDefault(); e.stopPropagation(); onClick?.(e); };
        span.addEventListener('click', handler);
        span.addEventListener('keydown', (e)=>{ if(e.key==='Enter' || e.key===' '){ handler(e); }}, { passive: true });
        return span;
    }

    // ---< Cache Compression Functions >---
    function compressCache(data) {
        try {
            // Use a more robust encoding method
            const jsonString = JSON.stringify(data);
            // Use encodeURIComponent to handle special characters
            const result = encodeURIComponent(jsonString);

            // Fix shipment wrapping after compressing cache
            // fixShipmentWrapping(); // Removed for performance - will be called by main logic

            return result;
        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Error compressing cache:`, error);
            return null;
        }
    }

    function decompressCache(compressed) {
        try {
            if (!compressed) return null;
            // Decode the URI component first
            const decoded = decodeURIComponent(compressed);
            const result = JSON.parse(decoded);

            // Fix shipment wrapping after decompressing cache
            // fixShipmentWrapping(); // Removed for performance - will be called by main logic

            return result;
        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Error decompressing cache:`, error);
            return null;
        }
    }

    // ---< Settings Module >---
    const defaultSettings = {
        showImages: true,
        replaceBarcodes: true,
        enablePreview: true,
        hideColumns: true,
        enableResponsive: true,
        addWhatsApp: true,
        highlightMerlog: true,
    };


    async function loadSettings() {
        try {
            const savedSettings = await GM_getValue(SETTINGS_KEY, {});
            settings = { ...defaultSettings, ...savedSettings };
            updateBodyClasses();

            // Fix shipment wrapping after loading settings
            // fixShipmentWrapping(); // Removed for performance - will be called by main logic
        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Error loading settings:`, error);
            // Keep default settings if loading fails
            settings = { ...defaultSettings };
        }
    }

    function updateBodyClasses() {
        if (!document.body) return; // Ensure document.body exists
        if(settings && settings.enableResponsive) {
            document.body.classList.add('tampermonkey-responsive-enabled');
        }
        if(settings && settings.hideColumns) {
            document.body.classList.add('tampermonkey-hide-columns-enabled');
        }

        // Fix shipment wrapping after updating body classes
        // fixShipmentWrapping(); // Removed for performance - will be called by main logic
    }

    function registerMenuCommands() {
        try {
            const options = {
                showImages: '🖼️ הצג תמונות וקישורים',
                replaceBarcodes: '📊 החלף מק"ט בברקוד',
                enablePreview: '👁️ אפשר תצוגה מקדימה מהירה',
                hideColumns: '🙈 הסתר עמודות מיותרות',
                enableResponsive: '📱 אפשר תצוגה רספונסיבית למובייל',
                addWhatsApp: '💬 הוסף כפתורי WhatsApp',
                highlightMerlog: '🔴 הדגש שורות מרלוג'
            };

            function createMenuCommandFunc(k) {
                return async () => {
                    try {
                        const newSettings = { ...settings, [k]: !settings[k] };
                        await GM_setValue(SETTINGS_KEY, newSettings);
                        location.reload();
                    } catch (error) {
                        console.error(`[${SCRIPT_NAME}] Error updating setting ${k}:`, error);
                    }
                };
            }

            for (const [key, label] of Object.entries(options)) {
                const statusIcon = (settings && settings[key]) ? '✅' : '❌';
                GM_registerMenuCommand(`${statusIcon} ${label}`, createMenuCommandFunc(key));
            }

                    GM_registerMenuCommand('🔄 רענן קטלוגים', () => {
                try {
                    GM_deleteValue(PRODUCT_DATA_CACHE_KEY);
                    GM_deleteValue(IMAGE_CACHE_TIMESTAMP_KEY);
                    GM_deleteValue(BARCODE_DATA_CACHE_KEY);
                    GM_deleteValue(BARCODE_CACHE_TIMESTAMP_KEY);
                    alert('קטלוגים נמחקו מהזיכרון. רענן את הדף כדי לטעון מחדש.');
                } catch (error) {
                    console.error(`[${SCRIPT_NAME}] Error clearing cache:`, error);
                }
            });

            GM_registerMenuCommand('🔄 רענן הדגשת "מוכן"', () => {
                try {
                    console.log(`[${SCRIPT_NAME}] Manually refreshing ready highlighting...`);
                    debouncedHighlightReadyRows();
                } catch (error) {
                    console.error(`[${SCRIPT_NAME}] Error manually refreshing ready highlighting:`, error);
                }
            });

            GM_registerMenuCommand('🔗 רענן קישורים וסמלי העתקה', () => {
                try {
                    console.log(`[${SCRIPT_NAME}] Manually refreshing links and copy icons...`);
                    // Remove processed flags to force re-processing
                    document.querySelectorAll('tr[data-tm-links-done], tr[data-links-processed]').forEach(tr => {
                        tr.removeAttribute('data-tm-links-done');
                        tr.removeAttribute('data-links-processed');
                    });
                    // Re-run the link injection
                    addClickableLinksToAllTables();
                    alert('קישורים וסמלי העתקה רועננו בהצלחה!');
                } catch (error) {
                    console.error(`[${SCRIPT_NAME}] Error manually refreshing links:`, error);
                    alert(`שגיאה ברענון קישורים: ${error.message}`);
                }
            });

            GM_registerMenuCommand('🔍 בדוק קובץ ברקודים', async () => {
                try {
                    console.log(`[${SCRIPT_NAME}] Manually checking barcode CSV file...`);
                    const response = await new Promise((resolve, reject) => {
                        GM_xmlhttpRequest({
                            method: "GET",
                            url: BARCODE_REPLACER_CSV_URL,
                            onload: resolve,
                            onerror: reject
                        });
                    });

                    if (response.status >= 200 && response.status < 300) {
                        const csvText = response.responseText;
                        console.log(`[${SCRIPT_NAME}] CSV file loaded successfully. Length: ${csvText.length} characters`);

                        // Search for the specific product
                        const searchTerm = "רויאל קנין פאוץ' לחתול בוגר אינסטינקטיב ברוטב 85 גרם";
                        const lines = csvText.split('\n');
                        console.log(`[${SCRIPT_NAME}] CSV has ${lines.length} lines`);

                        let found = false;
                        lines.forEach((line, index) => {
                            if (line.toLowerCase().includes(searchTerm.toLowerCase())) {
                                console.log(`[${SCRIPT_NAME}] Found product in line ${index + 1}:`, line);
                                found = true;
                            }
                        });

                        if (!found) {
                            console.log(`[${SCRIPT_NAME}] Product not found in CSV. Searching for partial matches...`);
                            const searchWords = searchTerm.toLowerCase().split(' ').filter(word => word.length > 2);
                            lines.forEach((line, index) => {
                                const lineLower = line.toLowerCase();
                                const matchCount = searchWords.filter(word => lineLower.includes(word)).length;
                                if (matchCount >= 3) {
                                    console.log(`[${SCRIPT_NAME}] Partial match (${matchCount} words) in line ${index + 1}:`, line);
                                }
                            });
                        }

                        alert(`בדיקת קובץ ברקודים הושלמה. ראה את הלוג בקונסול לפרטים.`);
                    } else {
                        alert(`שגיאה בטעינת קובץ ברקודים: ${response.status} - ${response.statusText}`);
                    }
                } catch (error) {
                    console.error(`[${SCRIPT_NAME}] Error checking barcode CSV:`, error);
                    alert(`שגיאה בבדיקת קובץ ברקודים: ${error.message}`);
                }
            });

            GM_registerMenuCommand('🔍 חפש ברקודים שצריכים החלפה', () => {
                try {
                    console.log(`[${SCRIPT_NAME}] Searching for barcodes that need replacement...`);

                    if (!itemCodeToBarcodeMap || !descriptionToBarcodeMap) {
                        alert('מפות הברקודים לא נטענו עדיין. נסה שוב אחרי שהדף נטען במלואו.');
                        return;
                    }

                    // Find all elements that might need barcode replacement
                    const allSkuElements = document.querySelectorAll('td.text-nowrap, span.text-muted.font-weight-bold, input.order-item-sku');
                    let replacementsFound = 0;
                    let missingBarcodesFound = 0;
                    let totalChecked = 0;

                    allSkuElements.forEach((el, index) => {
                        if (!el.hasAttribute('data-original-sku')) return;

                        const sku = el.getAttribute('data-original-sku');
                        const nameContainer = el.closest('tr, .nested-fields, .pick-order-item-row');
                        const nameEl = nameContainer?.querySelector('.order-item-name, .text-dark-75, td:nth-child(10), td:nth-child(3)');
                        const name = nameEl?.value || nameEl?.textContent.trim() || '';

                        if (sku && name) {
                            totalChecked++;
                            const barcode = findBarcode(sku, name);

                            if (barcode && barcode !== sku) {
                                replacementsFound++;
                                console.log(`[${SCRIPT_NAME}] Found barcode that needs replacement:`, {
                                    name: name,
                                    originalSku: sku,
                                    newBarcode: barcode,
                                    element: el
                                });
                            } else if (!barcode) {
                                missingBarcodesFound++;
                                console.log(`[${SCRIPT_NAME}] Found product with missing barcode:`, {
                                    name: name,
                                    sku: sku,
                                    element: el
                                });
                            }
                        }
                    });

                    console.log(`[${SCRIPT_NAME}] Barcode search completed:`);
                    console.log(`[${SCRIPT_NAME}] Total elements checked: ${totalChecked}`);
                    console.log(`[${SCRIPT_NAME}] Replacements found: ${replacementsFound}`);
                    console.log(`[${SCRIPT_NAME}] Missing barcodes found: ${missingBarcodesFound}`);

                    let message = `נבדקו ${totalChecked} פריטים:\n`;
                    message += `• ברקודים שצריכים החלפה: ${replacementsFound}\n`;
                    message += `• מוצרים עם ברקוד חסר: ${missingBarcodesFound}\n`;
                    message += `• מוצרים עם ברקוד נכון: ${totalChecked - replacementsFound - missingBarcodesFound}`;

                    alert(message);

                } catch (error) {
                    console.error(`[${SCRIPT_NAME}] Error searching for barcode replacements:`, error);
                    alert(`שגיאה בחיפוש ברקודים: ${error.message}`);
                }
            });

            // מחק את הפקודה הלא רצויה מהתפריט
            // GM_registerMenuCommand('🔧 תקן תצוגת ברקוד רויאל קנין', () => { ... });
        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Error registering menu commands:`, error);
        }

        // Fix shipment wrapping after registering menu commands
        // fixShipmentWrapping(); // Removed for performance - will be called by main logic
    }


    // ---< Data Loading Module >---

    async function getProductData(callback) {
        // Prevent multiple simultaneous calls
        if (window.productDataLoading) return;
        window.productDataLoading = true;

        try {

            const cachedData = await GM_getValue(PRODUCT_DATA_CACHE_KEY, null);
            const cachedTimestamp = await GM_getValue(IMAGE_CACHE_TIMESTAMP_KEY, 0);
            if (cachedData && (Date.now() - cachedTimestamp < CACHE_DURATION_MS)) {
                // Try to decompress cached data
                const decompressed = decompressCache(cachedData);
                if (decompressed) {
                    productDataCache = decompressed;
                    if (callback) callback();
                    // Force immediate link pass now that data is ready
                    try { addClickableLinksToAllTables(true); } catch(e) { console.warn(e); }
                    setTimeout(() => addClickableLinksToAllTables(true), 200);
                    return;
                }
            }

            updateStatus('טוען קטלוג מאסטר...', 'orange');
            const response = await new Promise((resolve, reject) => {
                GM_xmlhttpRequest({ method: "GET", url: IMAGE_FINDER_CSV_URL, onload: resolve, onerror: reject });
            });
            productDataCache = processImageCsvText(response.responseText);

            // Compress data before saving
            const compressed = compressCache(productDataCache);
            if (compressed) {
                await GM_setValue(PRODUCT_DATA_CACHE_KEY, compressed);
            } else {
                // Fallback to uncompressed if compression fails
                await GM_setValue(PRODUCT_DATA_CACHE_KEY, productDataCache);
            }
            await GM_setValue(IMAGE_CACHE_TIMESTAMP_KEY, Date.now());
            updateStatus(`קטלוג מאסטר נטען: ${productDataCache.length} פריטים.`, 'green', true);
        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Error loading image CSV:`, error);
            productDataCache = [];
            updateStatus('שגיאה בטעינת קטלוג מאסטר.', 'red');
        } finally {
            window.productDataLoading = false;
            if (callback) callback();

            // Clear done flags so rows can upgrade to clickable links after catalog loads
            document.querySelectorAll('tr[data-tm-links-done]').forEach(tr => {
                tr.removeAttribute('data-tm-links-done');
                tr.removeAttribute('data-tm-last-scan');
            });
            setTimeout(() => addClickableLinksToAllTables(true), 0);
            setTimeout(() => addClickableLinksToAllTables(true), 200);

            // Fix shipment wrapping after loading product data
            // fixShipmentWrapping(); // Removed for performance - will be called by main logic
        }
    }

    function processImageCsvText(text) {
        try {
            if (!text) return [];

            const lines = text.trim().split("\n"); if (lines.length <= 1) return [];

            const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());

            const csvSkuIndex = headers.indexOf("skus");
            const csvImageIndex = headers.indexOf("image url");
            const csvUrlIndex = headers.indexOf("product url");
            const csvProductNameIndex = headers.indexOf("product name");
            const csvPriceIndex = headers.indexOf("price");


            if (csvSkuIndex === -1 || csvImageIndex === -1) {
                return [];
            }

            const processed = lines.slice(1).map(line => {
                const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
                const skusString = (parts[csvSkuIndex] || "").trim().replace(/^"|"$/g, '');
                return {
                    skus: skusString ? skusString.split(',').map(s => normalizeSku(s.trim())).filter(Boolean) : [],
                    image: (parts[csvImageIndex] || "").trim().replace(/^"|"$/g, ''),
                    link: csvUrlIndex !== -1 ? (parts[csvUrlIndex] || "").trim().replace(/^"|"$/g, '') : '',
                    productName: csvProductNameIndex !== -1 ? (parts[csvProductNameIndex] || "").trim().replace(/^"|"$/g, '') : '',
                    price: csvPriceIndex !== -1 ? (parts[csvPriceIndex] || "").trim().replace(/^"|"$/g, '') : null
                };
            }).filter(p => p.skus.length > 0 && p.image);

            return processed;
        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Error processing image CSV text:`, error);
            return [];
        }

        // Fix shipment wrapping after processing image CSV text
        // fixShipmentWrapping(); // Removed for performance - will be called by main logic
    }

    async function loadBarcodeCsv(callback) {
        // Prevent multiple simultaneous calls
        if (window.barcodeDataLoading) return;
        window.barcodeDataLoading = true;

        try {
            const cachedData = await GM_getValue(BARCODE_DATA_CACHE_KEY, null);
            const cachedTimestamp = await GM_getValue(BARCODE_CACHE_TIMESTAMP_KEY, 0);
            if (cachedData && (Date.now() - cachedTimestamp < CACHE_DURATION_MS)) {
                processBarcodeData(cachedData);
                if (callback) callback();
                    return;
            }

            updateStatus('טוען קטלוג ברקודים...', 'orange');
            GM_xmlhttpRequest({
                method: "GET",
                url: BARCODE_REPLACER_CSV_URL,
                onload: async (response) => {
                    try {
                        if (response.status === 200) {
                            const data = parseBarcodeCsv(response.responseText);
                            if (data) {
                                    await GM_setValue(BARCODE_DATA_CACHE_KEY, data);
                                await GM_setValue(BARCODE_CACHE_TIMESTAMP_KEY, Date.now());
                                processBarcodeData(data);
                            } else {
                                console.error(`[${SCRIPT_NAME}] Failed to parse CSV data`);
                            }
                        } else {
                            updateStatus(`שגיאה בטעינת CSV ברקודים: ${response.statusText}`, 'red');
                            console.error(`[${SCRIPT_NAME}] HTTP error: ${response.status} - ${response.statusText}`);
                        }
                    } catch (error) {
                        console.error(`[${SCRIPT_NAME}] Error processing barcode CSV:`, error);
                        updateStatus('שגיאה בעיבוד קובץ הברקודים.', 'red');
                    } finally {
                        window.barcodeDataLoading = false;
                        if (callback) callback();
                    }
                },
                onerror: (error) => {
                    console.error(`[${SCRIPT_NAME}] Network error loading CSV:`, error);
                    window.barcodeDataLoading = false;
                    updateStatus('שגיאת רשת בטעינת CSV ברקודים.', 'red');
                    if (callback) callback();
                }
            });
        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Error loading barcode CSV:`, error);
            window.barcodeDataLoading = false;
            updateStatus('שגיאה בטעינת קובץ הברקודים.', 'red');
            if (callback) callback();
        }

        // Fix shipment wrapping after loading barcode CSV
        // fixShipmentWrapping(); // Removed for performance - will be called by main logic
    }

    function processBarcodeData(data) {
        try {
            if (!data) return;
            itemCodeToBarcodeMap = new Map(data.itemCodeToBarcodeMap);
            descriptionToBarcodeMap = new Map(data.descriptionToBarcodeMap);

            updateStatus(`קטלוג ברקודים נטען: ${descriptionToBarcodeMap.size} פריטים.`, 'green', true);
        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Error processing barcode data:`, error);
        }

        // Fix shipment wrapping after processing barcode data
        // fixShipmentWrapping(); // Removed for performance - will be called by main logic
    }

    function parseBarcodeCsv(csvString) {
        try {
            if (!csvString) return null;

            let localItemCodeToBarcodeMap = new Map();
            let localDescriptionToBarcodeMap = new Map();
            let success = false;

            Papa.parse(csvString, {
                header: true, skipEmptyLines: true, trimHeaders: true,
                complete: (results) => {
                    try {
                        const headers = results.meta.fields || Object.keys(results.data[0]);

                        const itemCodeKey = headers.find(h => h.trim() === 'קוד פריט');
                        const descKey = headers.find(h => h.trim() === 'תאור פריט');
                        const barcodeKey = headers.find(h => h.trim() === 'ברקוד');

                        if (!descKey || !barcodeKey || !itemCodeKey) {
                            updateStatus(`שגיאה: עמודות חסרות בקובץ הברקודים.`, 'red');
                            console.error(`[${SCRIPT_NAME}] Missing required columns in CSV`);
                            return;
                        }

                        let processedCount = 0;
                        results.data.forEach((row, index) => {
                            const itemCode = row[itemCodeKey]?.trim();
                            const desc = row[descKey]?.trim();
                            const barcode = row[barcodeKey]?.trim();

                            if (itemCode) {
                                localItemCodeToBarcodeMap.set(itemCode, barcode || null);
                                processedCount++;
                            }
                            if (desc) {
                                localDescriptionToBarcodeMap.set(desc, barcode || null);
                                processedCount++;
                            }
                        });

                        success = true;
                    } catch (error) {
                        console.error(`[${SCRIPT_NAME}] Error in Papa.parse complete callback:`, error);
                    }
                },
                error: (error) => {
                    updateStatus(`שגיאה בפענוח קובץ הברקודים: ${error.message}`, 'red');
                    console.error(`[${SCRIPT_NAME}] Papa.parse error:`, error);
                }
            });
            return success ? { itemCodeToBarcodeMap: Array.from(localItemCodeToBarcodeMap.entries()), descriptionToBarcodeMap: Array.from(localDescriptionToBarcodeMap.entries()) } : null;
        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Error parsing barcode CSV:`, error);
            return null;
        }

        // Fix shipment wrapping after parsing barcode CSV
        // fixShipmentWrapping(); // Removed for performance - will be called by main logic
    }

    // ---< Helper Functions >---
    function normalizeSku(sku) {
        try {
            if (typeof sku !== 'string') return '';
            const normalized = sku.replace(/\D/g, '');
            return normalized;
        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Error normalizing SKU:`, error);
            return '';
        }

        // Fix shipment wrapping after normalizing SKU
        // fixShipmentWrapping(); // Removed for performance - will be called by main logic
    }

    function findImageMatch(sku, productName) {
        try {
            if (!productDataCache) {
                return null;
            }

            // Try to find by SKU first (for all SKUs, not just those not starting with '0')
            if (sku && sku.trim()) {
                const normalizedSku = normalizeSku(sku);
                if (normalizedSku) {
                    const skuMatch = productDataCache.find(p => p.skus.includes(normalizedSku));
                    if (skuMatch) {
                        return skuMatch;
                    }
                }
            }

            // Try to find by product name (only if productName is not empty)
            if (productName && productName.trim()) {
                const pageProductNameNormalized = productName.toLowerCase().trim();
                const nameMatch = productDataCache.find(p => p.productName && p.productName.toLowerCase().trim() === pageProductNameNormalized);
                if (nameMatch) {
                    return nameMatch;
                }
            }
            return null;
        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Error finding image match:`, error);
            return null;
        }

        // Fix shipment wrapping after finding image match
        // fixShipmentWrapping(); // Removed for performance - will be called by main logic
    }

    // Expose functions to window for enhanced search
    window.findImageMatch = findImageMatch;

    function findBarcode(sku, name) {
        try {
            if (!itemCodeToBarcodeMap || !descriptionToBarcodeMap) {
                return null;
            }

            // Try to find by SKU first (only if SKU is not null/empty)
            if (sku && sku.trim() && itemCodeToBarcodeMap.has(sku)) {
                const barcode = itemCodeToBarcodeMap.get(sku);
                if (barcode) {
                    return barcode;
                }
            }

            // Try to find by exact name match
            if (name && name.trim() && descriptionToBarcodeMap.has(name)) {
                const barcode = descriptionToBarcodeMap.get(name);
                if (barcode) {
                    return barcode;
                }
            }

            // Try to find by partial name match (case insensitive)
            if (name && name.trim()) {
                const normalizedName = name.toLowerCase().trim();
                for (const [productName, barcode] of descriptionToBarcodeMap.entries()) {
                    const normalizedProductName = productName.toLowerCase().trim();
                    if (normalizedProductName === normalizedName) {
                        return barcode;
                    }
                }

                // Try partial match (contains)
                for (const [productName, barcode] of descriptionToBarcodeMap.entries()) {
                    const normalizedProductName = productName.toLowerCase().trim();
                    if (normalizedProductName.includes(normalizedName) || normalizedName.includes(normalizedProductName)) {
                        return barcode;
                    }
                }
            }
            return null;
        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Error finding barcode:`, error);
            return null;
        }

        // Fix shipment wrapping after finding barcode
        // fixShipmentWrapping(); // Removed for performance - will be called by main logic
    }

    // Expose functions to window for enhanced search
    window.findBarcode = findBarcode;

    function getFullSizeImageUrl(thumbnailUrl) {
        try {
            if (!thumbnailUrl || typeof thumbnailUrl !== 'string') return '';

            if (thumbnailUrl.includes('cdn.modulus.co.il')) { return thumbnailUrl.split('?')[0]; }
            if (thumbnailUrl.includes('www.gag-lachayot.co.il')) { return thumbnailUrl.replace(/-\d+x\d+(\.[a-zA-Z0-9]+(?:[?#].*)?)$/, '$1').replace(/-\d+x\d+$/, ''); }
            if (thumbnailUrl.includes('www.all4pet.co.il')) { return thumbnailUrl.replace(/_small(\.[a-zA-Z0-9]+(?:[?#].*)?)$/, '$1').replace(/_small$/, ''); }
            if (thumbnailUrl.includes('d3m9l0v76dty0.cloudfront.net')) { return thumbnailUrl.replace('/show/', '/original/').replace('/index/', '/original/').replace('/large/', '/original/'); }
            if (thumbnailUrl.includes('just4pet.co.il')) {
                const parts = thumbnailUrl.split('/'); const filenameWithQuery = parts.pop(); const filenameParts = filenameWithQuery.split('?');
                const filename = filenameParts[0]; const query = filenameParts.length > 1 ? `?${filenameParts[1]}` : '';
                if (filename.startsWith('tn_')) { const newFilename = filename.substring(3); return parts.join('/') + '/' + newFilename + query; }
            }
            if (thumbnailUrl.includes('speedog.co.il')) {
                // Remove size parameters like -100x100 from the end of the filename
                return thumbnailUrl.replace(/-\d+x\d+(\.[a-zA-Z0-9]+(?:[?#].*)?)$/, '$1').replace(/-\d+x\d+$/, '');
            }
            return thumbnailUrl;
        } catch (e) {
            console.warn(`[${SCRIPT_NAME}] ⚠️ Error processing thumbnail URL, returning original:`, thumbnailUrl, e);
            return thumbnailUrl;
        }

        // Fix shipment wrapping after getting full size image URL
        // fixShipmentWrapping(); // Removed for performance - will be called by main logic
    }

    // New function for optimized image URLs based on screen size
    function getOptimizedImageUrl(originalUrl, targetWidth = null) {
        try {
            if (!originalUrl || typeof originalUrl !== 'string') return originalUrl;

            // If no target width specified, use screen width
            if (!targetWidth) {
                targetWidth = Math.min(window.innerWidth, 1200); // Max 1200px for performance
            }
            // Quantize to a small set of widths to maximize browser cache reuse
            const __BUCKETS = [320, 480, 640, 960, 1200];
            for (let i = 0; i < __BUCKETS.length; i++) {
              if (targetWidth <= __BUCKETS[i]) { targetWidth = __BUCKETS[i]; break; }
              if (i === __BUCKETS.length - 1) targetWidth = __BUCKETS[i];
            }

            // For different image providers, add size parameters
            if (originalUrl.includes('cdn.modulus.co.il')) {
                return `${originalUrl.split('?')[0]}?w=${targetWidth}&h=${Math.round(targetWidth * 0.75)}&fit=crop`;
            }

            if (originalUrl.includes('www.gag-lachayot.co.il')) {
                // Try to get a larger version if available
                const baseUrl = originalUrl.replace(/-\d+x\d+(\.[a-zA-Z0-9]+(?:[?#].*)?)$/, '$1').replace(/-\d+x\d+$/, '');
                return `${baseUrl}?w=${targetWidth}`;
            }

            if (originalUrl.includes('www.all4pet.co.il')) {
                const baseUrl = originalUrl.replace(/_small(\.[a-zA-Z0-9]+(?:[?#].*)?)$/, '$1').replace(/_small$/, '');
                return `${baseUrl}?w=${targetWidth}`;
            }

            if (originalUrl.includes('d3m9l0v76dty0.cloudfront.net')) {
                // This provider already has size variants
                return originalUrl;
            }

            if (originalUrl.includes('just4pet.co.il')) {
                const parts = originalUrl.split('/');
                const filenameWithQuery = parts.pop();
                const filenameParts = filenameWithQuery.split('?');
                const filename = filenameParts[0];
                const query = filenameParts.length > 1 ? `&${filenameParts[1]}` : '';

                if (filename.startsWith('tn_')) {
                    const newFilename = filename.substring(3);
                    return `${parts.join('/')}/${newFilename}?w=${targetWidth}${query}`;
                }
            }

            if (originalUrl.includes('speedog.co.il')) {
                // Remove size parameters and add width parameter for optimization
                const baseUrl = originalUrl.replace(/-\d+x\d+(\.[a-zA-Z0-9]+(?:[?#].*)?)$/, '$1').replace(/-\d+x\d+$/, '');
                const separator = baseUrl.includes('?') ? '&' : '?';
                return `${baseUrl}${separator}w=${targetWidth}`;
            }

            // For other URLs, try to add width parameter
            const separator = originalUrl.includes('?') ? '&' : '?';
            return `${originalUrl}${separator}w=${targetWidth}`;

        } catch (e) {
            console.warn(`[${SCRIPT_NAME}] ⚠️ Error optimizing image URL, returning original:`, originalUrl, e);
            return originalUrl;
        }

        // Fix shipment wrapping after optimizing image URL
        // fixShipmentWrapping(); // Removed for performance - will be called by main logic
    }

    function findProductTableInScope(scope) {
        try {
            if (!scope) return null;

            const allTables = scope.querySelectorAll('table');

            for (const table of allTables) {
                const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim());

                // שיפור: זיהוי גמיש יותר של כותרות - מזהה גם "שם מוצר", "מקט", "מספר קטלוגי" וכו'
                const hasSku = headers.some(h => h.includes('מק'));
                const hasName = headers.some(h => h.includes('שם'));

                // Check if this is an orders/deliveries table (should be excluded)
                const isOrdersTable = headers.some(h =>
                    h.includes('משלוח') || // delivery
                    h.includes('הזמנה') || // order
                    h.includes('סטטוס') || // status
                    h.includes('ליקוט') || // picking
                    h.includes('נהג') || // driver
                    h.includes('כתובת') || // address
                    h.includes('עיר') || // city
                    h.includes('טלפון') // phone
                );

                // Also check if the table has the main orders table classes
                const isMainOrdersTable = table.closest('.dataTables_wrapper') &&
                                         table.closest('.dt-bootstrap4');

                if (hasSku && hasName && !isOrdersTable && !isMainOrdersTable) {
                    return table;
                }
            }
            return null;
        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Error finding product table:`, error);
            return null;
        }

        // Fix shipment wrapping after finding product table in scope
        // fixShipmentWrapping(); // Removed for performance - will be called by main logic
    }

    // ---< UI & DOM Manipulation >---

    let scriptStatusElement = null;
    function createStatusNotifier() {
        try {
            if (document.getElementById('scriptStatusNotifier')) return;
            if (!document.body) return; // Ensure document.body exists
            scriptStatusElement = document.createElement('div');
            scriptStatusElement.id = 'scriptStatusNotifier';
            document.body.appendChild(scriptStatusElement);
            // Ensure it's hidden initially unless a message is set
            scriptStatusElement.style.opacity = '0';
            scriptStatusElement.style.transition = 'opacity 0.5s ease-in-out';
        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Error creating status notifier:`, error);
        }

        // Fix shipment wrapping after creating status notifier
        // fixShipmentWrapping(); // Removed for performance - will be called by main logic
    }
  function updateStatus(message, color = '#333', temporary = false) {
  try {
    // רק הודעות אדומות (שגיאה) יעברו
    if (color !== 'red') return;

    // שאר הקוד שלך נשאר כמו שהוא:
    if (!scriptStatusElement) createStatusNotifier();
    if (!scriptStatusElement) return; // Double check

    scriptStatusElement.textContent = message;
    scriptStatusElement.style.color = color;
    scriptStatusElement.style.borderColor = color;
    scriptStatusElement.style.opacity = '0.9';
    if (temporary) setTimeout(() => { scriptStatusElement.style.opacity = '0' }, 4000);
    console.log(`[${SCRIPT_NAME}] ${message}`);
  } catch (error) {
    console.error(`[${SCRIPT_NAME}] Error updating status:`, error);
  }

  // Fix shipment wrapping after updating status
  // fixShipmentWrapping(); // Removed for performance - will be called by main logic
}

function showGalleryOverlay(galleryItems, startIndex) {
    try {
        // Prevent multiple galleries from being opened simultaneously
        if (document.getElementById('tampermonkey-gallery-overlay')) {
            if (DEBUG) console.warn('Gallery already open, ignoring new request');
            return;
        }

        // Ensure any existing loading indicators are hidden
        const existingLoadingIndicators = document.querySelectorAll('.gallery-loading');
        existingLoadingIndicators.forEach(indicator => {
            indicator.style.display = 'none';
        });

        // Image cache for performance with memory management
        const imageCache = new Map();
        let preloadedImages = new Set();

        // Memory management: limit cache size to prevent memory leaks
        const MAX_CACHE_SIZE = 10;
        const cleanupImageCache = () => {
            if (imageCache.size > MAX_CACHE_SIZE) {
                const entries = Array.from(imageCache.entries());
                // Remove oldest entries
                for (let i = 0; i < entries.length - MAX_CACHE_SIZE; i++) {
                    const [key] = entries[i];
                    imageCache.delete(key);
                    preloadedImages.delete(key);
                }
            }
        };

        function handleSwipe() {
            try {
                const diff = startX - endX;
                const threshold = 50; // swipe sensitivity in px

                if (Math.abs(diff) > threshold) {
                    if (diff > 0) {
                        navigate(-1); // swipe left → next
                    } else {
                        navigate(1); // swipe right → prev
                    }
                }
            } catch (error) {
                if (DEBUG) console.warn('Gallery swipe error:', error);
            }
        }

        if (!galleryItems || galleryItems.length === 0) return;

        // Remove any existing gallery overlay to prevent conflicts
        const existingOverlay = document.getElementById('tampermonkey-gallery-overlay');
        if (existingOverlay) {
            existingOverlay.remove();
        }

    let currentIndex = startIndex;
    let startX = 0;
    let endX = 0;
    let isZoomed = false;
    let zoomLevel = 1;

    // Zoom-to-point variables
    let zoomOriginX = 0;
    let zoomOriginY = 0;

    // Drag/pan variables
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    // Image wrapper for proper clipping during zoom/pan
    let imageWrapper = null;

    // Pinch-to-zoom variables
    let initialDistance = 0;
    let initialZoom = 1;
    let isPinching = false;
    let wasPinching = false; // Track if we were pinching to prevent swipe interference

    // Timeout management to prevent memory leaks
    let navigationTimeout = null;

    const overlay = document.createElement('div');
    overlay.id = 'tampermonkey-gallery-overlay';
    overlay.style.width = '100%';
    overlay.style.height = '100vh';
    overlay.style.maxHeight = '100vh';
    overlay.style.boxSizing = 'border-box';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.alignItems = 'stretch';
    overlay.style.justifyContent = 'flex-start';
    overlay.style.background = 'rgba(0,0,0,0.88)';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.zIndex = '20000';
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.3s ease';
    overlay.style.overflow = 'hidden';
    // Don't make it focusable by default - only when needed

    const imgElement = document.createElement('img');
    // עיצוב תמונה - ללא borderRadius כי זה יהיה על ה-wrapper
    imgElement.style.maxWidth = '100%';
    imgElement.style.maxHeight = '100%';
    imgElement.style.objectFit = 'contain';
    imgElement.style.display = 'block';
    imgElement.style.transition = 'transform 0.3s ease';
    imgElement.style.pointerEvents = 'none'; // כדי למנוע בעיות תפעול
    imgElement.style.userSelect = 'none';

    // Loading indicator
    const loadingIndicator = document.createElement('div');
    loadingIndicator.className = 'gallery-loading gallery-spinner';

    const productNameElement = document.createElement('h3');
    productNameElement.className = 'gallery-product-name';
    // עיצוב שם מוצר
    productNameElement.style.zIndex = '10';
    productNameElement.style.position = 'relative';
    productNameElement.style.background = 'transparent';
    productNameElement.style.color = 'white';
    productNameElement.style.padding = '6px 12px';
    productNameElement.style.borderTopLeftRadius = '8px';
    productNameElement.style.borderTopRightRadius = '8px';

    const productInfoElement = document.createElement('div');
    productInfoElement.className = 'gallery-product-info';
    // עיצוב מק"ט ומחיר
    productInfoElement.style.zIndex = '10';
    productInfoElement.style.position = 'relative';
    productInfoElement.style.background = 'transparent';
    productInfoElement.style.color = 'white';
    productInfoElement.style.padding = '4px 8px';
    productInfoElement.style.marginBottom = '8px';
    const skuElement = document.createElement('span');
    skuElement.className = 'gallery-sku';
    const priceElement = document.createElement('span');
    priceElement.className = 'gallery-price';

    const captionElement = document.createElement('div');
    captionElement.className = 'gallery-caption';
    const counterElement = document.createElement('div');
    counterElement.className = 'gallery-counter';

    // Thumbnails container instead of dots
    const thumbnailsContainer = document.createElement('div');
    thumbnailsContainer.className = 'gallery-thumbnails';

    const prevButton = document.createElement('button');
    prevButton.className = 'gallery-nav prev';
    prevButton.innerHTML = '&#10094;';
    const nextButton = document.createElement('button');
    nextButton.className = 'gallery-nav next';
    nextButton.innerHTML = '&#10095;';
    const closeButton = document.createElement('button');
    closeButton.className = 'gallery-close';
    closeButton.innerHTML = '&times;';



    // Zoom controls - removed as requested

    // Create top info container
    const topInfoContainer = document.createElement('div');
    topInfoContainer.className = 'gallery-top-info';
    topInfoContainer.style.padding = '12px';
    topInfoContainer.style.background = 'transparent';
    topInfoContainer.style.color = '#fff';
    topInfoContainer.style.borderBottom = 'none';
    topInfoContainer.style.flexShrink = '0';
    topInfoContainer.style.boxSizing = 'border-box';

    // Add product name and info to top container
    productInfoElement.append(skuElement, priceElement);
    topInfoContainer.appendChild(productNameElement);
    topInfoContainer.appendChild(productInfoElement);

    // Create image container with proper structure
    const galleryImageContainer = document.createElement('div');
    galleryImageContainer.className = 'gallery-image-container';
    galleryImageContainer.style.position = 'relative';
    galleryImageContainer.style.flex = '1';
    galleryImageContainer.style.display = 'flex';
    galleryImageContainer.style.alignItems = 'center';
    galleryImageContainer.style.justifyContent = 'center';
    galleryImageContainer.style.padding = '16px';
    galleryImageContainer.style.width = '100%';
    galleryImageContainer.style.minHeight = '0'; // Important for flex child
    galleryImageContainer.style.borderRadius = '12px';
    galleryImageContainer.style.overflow = 'hidden';

    // Create image wrapper for proper clipping during zoom/pan
    imageWrapper = document.createElement('div');
    imageWrapper.style.position = 'relative';
    imageWrapper.style.width = '100%';
    imageWrapper.style.height = '100%';
    imageWrapper.style.borderRadius = '12px';
    imageWrapper.style.overflow = 'hidden';
    imageWrapper.style.display = 'flex';
    imageWrapper.style.alignItems = 'center';
    imageWrapper.style.justifyContent = 'center';
    imageWrapper.style.cursor = 'grab'; // Add cursor for drag indication
    imageWrapper.style.boxSizing = 'border-box'; // Ensure proper sizing

    // Update image styling - maintain aspect ratio while fitting in wrapper
    imgElement.style.width = 'auto';
    imgElement.style.height = '100%';
    imgElement.style.maxWidth = '100%';
    imgElement.style.maxHeight = '100%';
    imgElement.style.objectFit = 'contain'; // Use contain to maintain aspect ratio
    imgElement.style.borderRadius = '12px'; // Add borderRadius to img for better clipping
    // No position: relative on imgElement - let the wrapper handle positioning

    // Add image to wrapper, then wrapper to container
    imageWrapper.appendChild(imgElement);
    galleryImageContainer.appendChild(imageWrapper);

    // Image load event handler (link positioning removed)

    // Add loading indicator to image wrapper (not container)
    imageWrapper.appendChild(loadingIndicator);

    // Create footer container for caption and thumbnails
    const footerContainer = document.createElement('div');
    footerContainer.className = 'gallery-footer';
    footerContainer.style.display = 'flex';
    footerContainer.style.flexDirection = 'column';
    footerContainer.style.alignItems = 'center';
    footerContainer.style.gap = '10px';
    footerContainer.style.padding = '10px';
    footerContainer.style.flexShrink = '0';
    footerContainer.style.background = 'transparent';
    footerContainer.style.minHeight = '0'; // Important for flex child
    footerContainer.style.boxSizing = 'border-box';

    // Append caption and thumbnails to footer
    captionElement.append(counterElement);
    footerContainer.appendChild(captionElement);
    footerContainer.appendChild(thumbnailsContainer);

    // Append elements in proper order - now with footer at bottom
    overlay.append(topInfoContainer, galleryImageContainer, footerContainer, prevButton, nextButton, closeButton);

    // Dynamic image height adjustment function
    function adjustImageMaxHeight() {
        // With the new flexbox layout, the image container will automatically
        // take up the available space between top info and footer
        // We just need to ensure the image fits properly within its container

        // Remove fixed height constraints and let flexbox handle the layout
        imgElement.style.maxHeight = '100%';
        imageWrapper.style.maxHeight = '100%';
        imageWrapper.style.height = '100%';
        galleryImageContainer.style.maxHeight = 'none';
        galleryImageContainer.style.height = 'auto';
    }

    // Preload images function
    function preloadImage(index) {
        try {
            if (preloadedImages.has(index)) return;

            const item = galleryItems[index];
            if (!item || !item.fullSizeUrl) return;

            const img = new Image();
            img.onload = () => {
                try {
                    imageCache.set(index, img);
                    preloadedImages.add(index);
                    cleanupImageCache(); // Clean up cache after adding new image
                } catch (error) {
                    console.warn('Error in image onload:', error);
                }
            };
            img.onerror = () => {
                console.warn(`Failed to preload image ${index}: ${item.fullSizeUrl}`);
                // Remove from preloaded set to allow retry
                preloadedImages.delete(index);
            };
            img.src = item.fullSizeUrl;
        } catch (error) {
            console.warn('Error in preloadImage:', error);
        }
    }

    // Preload current, next, and previous images
    function preloadAdjacentImages() {
        const prevIndex = (currentIndex - 1 + galleryItems.length) % galleryItems.length;
        const nextIndex = (currentIndex + 1) % galleryItems.length;

        preloadImage(currentIndex);
        preloadImage(prevIndex);
        preloadImage(nextIndex);
    }

    // Zoom functionality with performance optimization
    let zoomTimeout;
    function setZoom(level, originX = null, originY = null) {
        // Clear any pending zoom operation
        if (zoomTimeout) {
            clearTimeout(zoomTimeout);
        }

        // Debounce zoom operations to prevent excessive DOM manipulation
        zoomTimeout = setTimeout(() => {
            const oldZoom = zoomLevel;
            zoomLevel = Math.max(0.5, Math.min(3, level));

            // If zoom origin is provided, calculate the transform origin
            if (originX !== null && originY !== null && zoomLevel !== 1) {
                // Cache getBoundingClientRect to avoid multiple calls
                const rect = imgElement.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    const x = ((originX - rect.left) / rect.width) * 100;
                    const y = ((originY - rect.top) / rect.height) * 100;

                    imgElement.style.transformOrigin = `${x}% ${y}%`;
                }
            } else if (zoomLevel === 1) {
                // Reset transform origin when zooming out
                imgElement.style.transformOrigin = 'center center';
                // Reset drag offsets when zooming out
                dragOffsetX = 0;
                dragOffsetY = 0;
            }

            // Apply both zoom and pan transforms
            imgElement.style.transform = `scale(${zoomLevel}) translate(${dragOffsetX}px, ${dragOffsetY}px)`;
            isZoomed = zoomLevel !== 1;

            // Update container class for visual feedback
            if (isZoomed) {
                galleryImageContainer.classList.add('zoomed');
            } else {
                galleryImageContainer.classList.remove('zoomed');
            }

            // Adjust image height after zoom change
            adjustImageMaxHeight();
        }, 10); // Small debounce for zoom operations
    }

    function resetZoom() {
        setZoom(1);
        // Adjust image height after reset
        adjustImageMaxHeight();
    }

    // Drag/pan functionality
    function startDrag(e) {
        if (!isZoomed) return;

        isDragging = true;
        dragStartX = e.clientX - dragOffsetX;
        dragStartY = e.clientY - dragOffsetY;
        imageWrapper.style.cursor = 'grabbing';
    }

    // Drag/pan functionality with performance optimization
    let dragTimeout;
    function doDrag(e) {
        if (!isDragging || !isZoomed) return;

        // Clear any pending drag operation
        if (dragTimeout) {
            clearTimeout(dragTimeout);
        }

        // Debounce drag operations to prevent excessive DOM manipulation
        dragTimeout = setTimeout(() => {
            dragOffsetX = e.clientX - dragStartX;
            dragOffsetY = e.clientY - dragStartY;

            // Apply the drag transform
            imgElement.style.transform = `scale(${zoomLevel}) translate(${dragOffsetX}px, ${dragOffsetY}px)`;
        }, 16); // ~60fps for smooth dragging
    }

    function endDrag() {
        if (!isDragging) return;

        isDragging = false;
        imageWrapper.style.cursor = 'grab';
    }

    // Create thumbnails
    function createThumbnails() {
        thumbnailsContainer.innerHTML = '';
        galleryItems.forEach((item, index) => {
            const thumb = document.createElement('div');
            thumb.className = `gallery-thumbnail ${index === currentIndex ? 'active' : ''}`;

            const thumbImg = document.createElement('img');
            thumbImg.src = item.thumbnailUrl || item.fullSizeUrl;
            thumbImg.alt = item.productName;
            thumbImg.style.borderRadius = '8px';
            thumbImg.onerror = () => {
                thumbImg.src = PLACEHOLDER_IMG_URL;
            };

            thumb.appendChild(thumbImg);
            thumb.onclick = () => {
                currentIndex = index;
                updateGalleryView();
            };

            thumbnailsContainer.appendChild(thumb);
        });
    }

    function navigate(delta) {
        try {
            // Clear any pending navigation timeout
            if (navigationTimeout) {
                clearTimeout(navigationTimeout);
            }

            const oldIndex = currentIndex;
            currentIndex = (currentIndex + delta + galleryItems.length) % galleryItems.length;

            // Validate current index
            if (currentIndex < 0 || currentIndex >= galleryItems.length) {
                console.warn('Invalid navigation index:', currentIndex);
                currentIndex = Math.max(0, Math.min(galleryItems.length - 1, currentIndex));
            }

            // Show loading indicator immediately for better UX
            loadingIndicator.style.display = 'block';
            imgElement.style.opacity = '0';

            // Add transition animation
            galleryImageContainer.style.opacity = '0';
            navigationTimeout = setTimeout(() => {
                try {
                    updateGalleryView();
                    galleryImageContainer.style.opacity = '1';
                } catch (error) {
                    console.warn('Error in navigation update:', error);
                    galleryImageContainer.style.opacity = '1';
                }
            }, 150);

            // Preload images for smooth navigation (only once)
            preloadAdjacentImages();
        } catch (error) {
            console.warn('Error in navigation:', error);
            // Fallback: try to show current image without transition
            try {
                updateGalleryView();
                adjustImageMaxHeight();

                // Product link positioning removed
            } catch (fallbackError) {
                console.error('Critical navigation error:', fallbackError);
            }
        }
    }

    const updateGalleryView = () => {
        try {
            const item = galleryItems[currentIndex];

            // Validate item exists
            if (!item) {
                console.warn('Invalid gallery item at index:', currentIndex);
                return;
            }

            // Ensure loading indicator is properly reset
            loadingIndicator.style.display = 'none';

            // Loading indicator is already shown in navigate() function
            // Only show it here if this is the initial load (not navigation)
            if (imgElement.style.opacity !== '0') {
                loadingIndicator.style.display = 'block';
                imgElement.style.opacity = '0';
            }

            // Reset zoom
            resetZoom();

            // Update image with transition
            imgElement.onload = () => {
                try {
                    // Ensure loading indicator is hidden
                    loadingIndicator.style.display = 'none';
                    imgElement.style.opacity = '1';

                    // Adjust image height after image loads
                    adjustImageMaxHeight();

                    // Product link positioning removed
                } catch (error) {
                    console.warn('Error in image onload:', error);
                    // Ensure loading indicator is hidden even on error
                    loadingIndicator.style.display = 'none';
                }
            };

            // Also check if image is already loaded
            if (imgElement.complete && imgElement.naturalWidth > 0) {
                loadingIndicator.style.display = 'none';
                imgElement.style.opacity = '1';
            }
            imgElement.onerror = () => {
                try {
                    // Ensure loading indicator is hidden
                    loadingIndicator.style.display = 'none';
                    imgElement.src = PLACEHOLDER_IMG_URL;
                    imgElement.style.opacity = '1';

                    // Adjust image height after error image loads
                    adjustImageMaxHeight();

                    // Product link positioning removed
                } catch (error) {
                    console.warn('Error in image onerror:', error);
                    // Ensure loading indicator is hidden even on error
                    loadingIndicator.style.display = 'none';
                }
            };

            // Validate URL before setting
            if (item.fullSizeUrl && typeof item.fullSizeUrl === 'string') {
                imgElement.src = item.fullSizeUrl;

                // Add timeout to ensure loading indicator doesn't stay forever
                setTimeout(() => {
                    if (loadingIndicator.style.display !== 'none') {
                        console.warn('Loading timeout - hiding indicator');
                        loadingIndicator.style.display = 'none';
                        imgElement.style.opacity = '1';
                    }
                }, 10000); // 10 seconds timeout
            } else {
                console.warn('Invalid image URL:', item.fullSizeUrl);
                imgElement.src = PLACEHOLDER_IMG_URL;
                // Hide loading indicator immediately for invalid URLs
                loadingIndicator.style.display = 'none';
                imgElement.style.opacity = '1';
            }

        // Update product info
        // Clear existing content and rebuild with wrap+BDI
        productNameElement.innerHTML = '';
        const nameWrap = document.createElement('span');
        nameWrap.className = 'tampermonkey-copy-wrap';
        const nameBdi = document.createElement('bdi');
        nameBdi.className = 'gallery-name-bdi';
        nameBdi.dir = 'auto';
        if (item.link) {
          const nameLink = document.createElement('a');
          nameLink.href = item.link;
          nameLink.target = '_blank';
          nameLink.rel = 'noopener';
          nameLink.textContent = item.productName;
          nameBdi.appendChild(nameLink);
        } else {
          nameBdi.textContent = item.productName || '';
        }
        nameWrap.appendChild(nameBdi);
        nameWrap.appendChild(createCopyIcon(item.productName || ''));
        productNameElement.appendChild(nameWrap);

        /* === FIX: אל תסמן תאי גלרייה — הם לא תאי טבלה === */
        // productNameElement is not a table cell, so no need for tm-flex-cell
        const originalSku = item.sku;
        const barcode = settings.replaceBarcodes ? findBarcode(originalSku, item.productName) : null;
        // Build: "מק\"ט: " + [wrap(bdi+icon)]
        skuElement.innerHTML = 'מק&quot;ט: ';
        const skuWrap = document.createElement('span');
        skuWrap.className = 'tampermonkey-copy-wrap';
        const skuBdi = document.createElement('bdi');
        skuBdi.className = 'gallery-barcode-bdi';
        skuBdi.dir = 'ltr';
        skuBdi.textContent = (barcode || originalSku || '').toString();
        skuWrap.appendChild(skuBdi);
        skuWrap.appendChild(createCopyIcon(skuBdi.textContent));
        skuElement.appendChild(skuWrap);

        /* === FIX: אל תסמן תאי גלרייה — הם לא תאי טבלה === */
        // skuElement is not a table cell, so no need for tm-flex-cell

        // Add price if available (you can extend this based on your data structure)
        if (item.price) {
            priceElement.innerHTML = `מחיר: <strong class="barcode-highlight-gallery">₪${item.price}</strong>`;
            priceElement.style.display = 'block';
        } else {
            priceElement.style.display = 'none';
        }

        // Bottom-left gallery link removed — we already provide the product link in the title

        const quantity = item.quantity ? item.quantity.trim() : '';
        counterElement.textContent = '';

        // Always show "לוקט" even if quantity is empty or doesn't contain "/"
        const span = document.createElement('span');

        if (quantity && quantity.includes('/')) {
            // If quantity has "/" format, parse it and apply styling
            const [pickedStr, totalStr] = quantity.split('/').map(s => parseInt(s.trim(), 10));
            span.textContent = `לוקט ${quantity}`;
            span.style.direction = 'rtl';

            if (pickedStr === totalStr) {
                span.className = 'tampermonkey-picked-full';
            } else if (pickedStr === 0 && totalStr > 1) {
                span.className = 'tampermonkey-picked-none';
            } else {
                span.className = 'tampermonkey-picked-partial';
            }
        } else if (quantity) {
            // If quantity exists but doesn't have "/" format, show it without special styling
            span.textContent = `לוקט ${quantity}`;
            span.style.direction = 'rtl';
            span.className = 'tampermonkey-picked-partial'; // Default styling
        } else {
            // If no quantity, show "לוקט" without value
            span.textContent = 'לוקט';
            span.style.direction = 'rtl';
            span.className = 'tampermonkey-picked-partial'; // Default styling
        }

        counterElement.appendChild(span);

        // Update thumbnails
        createThumbnails();

        // Preload adjacent images
        preloadAdjacentImages();

        // Adjust image height dynamically
        adjustImageMaxHeight();

        // Product link positioning removed
        } catch (error) {
            console.warn('Error in updateGalleryView:', error);
            // Fallback: show placeholder
            try {
                loadingIndicator.style.display = 'none';
                imgElement.src = PLACEHOLDER_IMG_URL;
                imgElement.style.opacity = '1';

                // Adjust image height in fallback
                adjustImageMaxHeight();

                // Product link positioning removed
            } catch (fallbackError) {
                console.error('Critical error in updateGalleryView fallback:', fallbackError);
            }
        }
    };

    let closeOverlay = () => {
        // Hide loading indicator immediately when closing
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
        }

        // Remove event listeners to prevent memory leaks
        document.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('mousemove', doDrag);
        document.removeEventListener('mouseup', endDrag);
        window.removeEventListener('resize', resizeHandler);

        // Clear any pending timeouts
        if (wheelTimeout) {
            clearTimeout(wheelTimeout);
        }
        if (zoomTimeout) {
            clearTimeout(zoomTimeout);
        }
        if (dragTimeout) {
            clearTimeout(dragTimeout);
        }
        if (navigationTimeout) {
            clearTimeout(navigationTimeout);
        }

        overlay.style.opacity = '0';
        setTimeout(() => {
            if (document.body && document.body.contains(overlay)) {
                document.body.removeChild(overlay);
            }
        }, 300);
    };

    const handleKeyDown = (e) => {
        // Only handle keys if the gallery overlay is open
        if (!document.getElementById('tampermonkey-gallery-overlay')) {
            return; // Gallery is not open, let all events pass through
        }

        // Only handle specific keys that we want to control
        if (e.key === 'Escape') {
            closeOverlay();
            return;
        }
        if (e.key === 'z' || e.key === 'Z') {
            if (isZoomed) {
                resetZoom();
            } else {
                // Get the center of the image for keyboard zoom
                const rect = imgElement.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                setZoom(zoomLevel + 0.5, centerX, centerY);
            }
            return;
        }
        if (e.key === 'r' || e.key === 'R') {
            resetZoom();
            return;
        }

        // For all other keys (including arrow keys), let them pass through to the website
        // Don't prevent default or stop propagation
    };

    // Event listeners
    prevButton.onclick = () => navigate(-1);
    nextButton.onclick = () => navigate(1);
    closeButton.onclick = closeOverlay;



    // Mouse wheel zoom with debouncing
    let wheelTimeout;
    imageWrapper.addEventListener('wheel', (e) => {
        e.preventDefault();

        // Clear existing timeout
        if (wheelTimeout) {
            clearTimeout(wheelTimeout);
        }

        // Debounce wheel events to prevent rapid-fire zooming
        wheelTimeout = setTimeout(() => {
            const delta = e.deltaY > 0 ? -0.2 : 0.2;
            setZoom(zoomLevel + delta, e.clientX, e.clientY);
        }, 50); // Increased debounce time for better performance
    }, { passive: false });

    // Double click to reset zoom
    imageWrapper.ondblclick = resetZoom;

    // Drag/pan event listeners - use imageWrapper for better interaction
    imageWrapper.addEventListener('mousedown', startDrag, { passive: false });
    document.addEventListener('mousemove', doDrag, { passive: false });
    document.addEventListener('mouseup', endDrag, { passive: true });

    // Double tap to reset zoom on touch devices
    let lastTap = 0;
    imageWrapper.addEventListener('touchend', (e) => {
        const currentTime = new Date().getTime();
        const tapLength = currentTime - lastTap;

        if (tapLength < 500 && tapLength > 0) {
            // Double tap detected
            e.preventDefault();
            resetZoom();
        }
        lastTap = currentTime;
        // Only prevent default for double taps, not single taps
    }, { passive: false });

    overlay.onclick = (e) => {
        if (e.target === overlay) closeOverlay();
    };

    if (document.body) {
        document.body.appendChild(overlay);
    }

    // Enhanced touch event handlers with pinch-to-zoom support
    overlay.addEventListener('touchstart', (e) => {
        try {
            // Only prevent default if we're handling a specific gesture
            if (e.touches.length === 1) {
                // Single touch - handle drag or swipe navigation
                startX = e.touches[0].clientX;
                isPinching = false;
                wasPinching = false; // Reset pinching flag for new single touch

                // If zoomed, start dragging instead of swipe navigation
                if (isZoomed) {
                    e.preventDefault();
                    startDrag({
                        clientX: e.touches[0].clientX,
                        clientY: e.touches[0].clientY
                    });
                }
            } else if (e.touches.length === 2) {
                // Two touches - handle pinch-to-zoom
                e.preventDefault(); // Only prevent default for pinch gestures
                isPinching = true;
                wasPinching = true; // Mark that we were pinching
                const touch1 = e.touches[0];
                const touch2 = e.touches[1];
                initialDistance = Math.sqrt(
                    Math.pow(touch2.clientX - touch1.clientX, 2) +
                    Math.pow(touch2.clientY - touch1.clientY, 2)
                );
                initialZoom = zoomLevel;
            }
        } catch (error) {
            if (DEBUG) console.warn('Gallery touchstart error:', error);
        }
    }, { passive: false });

    overlay.addEventListener('touchmove', (e) => {
        try {
            // Only prevent default if we're actively handling a gesture
            if (isPinching && e.touches.length === 2) {
                e.preventDefault(); // Only prevent default for pinch gestures
                // Handle pinch-to-zoom
                const touch1 = e.touches[0];
                const touch2 = e.touches[1];
                const currentDistance = Math.sqrt(
                    Math.pow(touch2.clientX - touch1.clientX, 2) +
                    Math.pow(touch2.clientY - touch1.clientY, 2)
                );

                if (initialDistance > 0 && currentDistance > 0) {
                    const scale = currentDistance / initialDistance;
                    const newZoom = Math.max(0.5, Math.min(3, initialZoom * scale));

                    // Calculate the center point between the two fingers
                    const centerX = (touch1.clientX + touch2.clientX) / 2;
                    const centerY = (touch1.clientY + touch2.clientY) / 2;

                    setZoom(newZoom, centerX, centerY);
                }
            } else if (isDragging && e.touches.length === 1) {
                // Handle dragging on touch devices
                e.preventDefault();
                doDrag({
                    clientX: e.touches[0].clientX,
                    clientY: e.touches[0].clientY
                });
            }
        } catch (error) {
            if (DEBUG) console.warn('Gallery touchmove error:', error);
        }
    }, { passive: false });

    overlay.addEventListener('touchend', (e) => {
        try {
            // Only prevent default if we're handling a specific gesture
            if (isPinching && e.touches.length === 0) {
                e.preventDefault(); // Only prevent default when ending pinch gesture
            }

            if (e.touches.length === 0) {
                // All touches ended
                if (isDragging) {
                    // End dragging
                    endDrag();
                } else if (!isPinching && !wasPinching && startX !== 0 && !isZoomed) {
                    // Single touch ended - handle swipe navigation only if not zoomed and not after pinching
                    endX = e.changedTouches[0] ? e.changedTouches[0].clientX : startX;
                    handleSwipe();
                }

                // Reset pinch state
                isPinching = false;
                wasPinching = false; // Reset the pinching flag
                initialDistance = 0;
                startX = 0;
                endX = 0;
            } else if (e.touches.length === 1) {
                // One touch ended, but another remains - switch to single touch mode
                isPinching = false;
                startX = e.touches[0].clientX;
            }
        } catch (error) {
            if (DEBUG) console.warn('Gallery touchend error:', error);
        }
    }, { passive: false });

    // Add keydown listener to document but only handle when gallery is open
    document.addEventListener('keydown', handleKeyDown);

    // Add resize listener to adjust image height when window is resized
    const resizeHandler = () => {
        if (document.getElementById('tampermonkey-gallery-overlay')) {
            adjustImageMaxHeight();
        }
    };
    window.addEventListener('resize', resizeHandler);

    // Add global error handler for gallery
    const galleryErrorHandler = (event) => {
        if (event.error && event.error.message && event.error.message.includes('STATUS_BREAKPOINT')) {
            console.warn('Gallery STATUS_BREAKPOINT error detected, attempting recovery...');
            event.preventDefault();
            // Try to close gallery gracefully
            try {
                closeOverlay();
            } catch (closeError) {
                console.error('Error closing gallery after STATUS_BREAKPOINT:', closeError);
            }
            return false;
        }
    };

    window.addEventListener('error', galleryErrorHandler);

    // Clean up error handler when gallery closes
    const originalCloseOverlay = closeOverlay;
    closeOverlay = () => {
        try {
            // Clean up memory
            imageCache.clear();
            preloadedImages.clear();

            // Remove error handler
            window.removeEventListener('error', galleryErrorHandler);

            // Remove resize handler
            window.removeEventListener('resize', resizeHandler);

            // Call original close function
            originalCloseOverlay();
        } catch (error) {
            console.warn('Error in enhanced closeOverlay:', error);
            // Fallback to original close
            try {
                originalCloseOverlay();
            } catch (fallbackError) {
                console.error('Critical error closing gallery:', fallbackError);
            }
        }
    };

    updateGalleryView();

    // Adjust image height after initial view is set
    setTimeout(() => {
        adjustImageMaxHeight();
    }, 50);

    setTimeout(() => {
        overlay.style.opacity = '1';
    }, 10);
    } catch (error) {
        console.error(`[${SCRIPT_NAME}] Error showing gallery overlay:`, error);
    }

    // Fix shipment wrapping after showing gallery overlay
    // fixShipmentWrapping(); // Removed for performance
}

    // ---< Injection & Cleanup Logic >---

    function createImageElement(match, nameText, skuText, styleObject) {
        try {

            if (!match) {
                return null;
            }

            if (!match.image) {
                return null;
            }

            const img = document.createElement('img');
            img.src = match.image; img.alt = `תמונה עבור ${nameText || 'מוצר'}`; img.className = 'tampermonkey-sku-image'; img.title = 'לחץ לפתיחת הגלריה';
            Object.assign(img.style, {
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                objectPosition: 'center',
                borderRadius: '4px',
                cursor: 'pointer',
                display: 'block',
                ...styleObject
            });
            img.onerror = function() { this.src = PLACEHOLDER_IMG_URL; this.onclick = null; };
            img.onclick = (e) => {
                e.stopPropagation();

                // Find the most specific container for the current order
                let searchScope = null;

                // TM: robust target for composed events & non-Element targets
                const raw = e.composedPath ? e.composedPath()[0] : e.target;
                const targetEl = raw && raw.nodeType === 1 ? raw : null; // 1 = ELEMENT_NODE

                // First, try to find if we're in a modal
                const modal = targetEl ? targetEl.closest('.modal') : null;
                if (modal) {
                    searchScope = modal;
                } else {
                    // If not in a modal, try to find the specific table or container
                    const table = targetEl ? targetEl.closest('table') : null;
                    if (table) {
                        searchScope = table;
                    } else {
                        // Fallback to the closest container with order data
                        const orderContainer = targetEl ? targetEl.closest('.table-responsive, .modal-body, .nested-fields') : null;
                        if (orderContainer) {
                            searchScope = orderContainer;
                        } else {
                            // Last resort - use the row that contains the image
                            const row = targetEl ? targetEl.closest('tr, .order-item-row, .pick-order-item-row') : null;
                            if (row) {
                                searchScope = row.closest('table, .nested-fields') || row;
                            } else {
                                searchScope = document.body;
                            }
                        }
                    }
                }

                const galleryItems = extractDataForGallery(searchScope);
                const clickedIndex = galleryItems.findIndex(item => normalizeSku(item.sku) === normalizeSku(skuText));
                showGalleryOverlay(galleryItems, Math.max(0, clickedIndex));
            };

            return img;
        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Error creating image element:`, error);
            return null;
        }

        // Fix shipment wrapping after creating image element
        // fixShipmentWrapping(); // Removed for performance
    }

    // Expose functions to window for enhanced search (single source of truth)
    if (!window.createImageElement) window.createImageElement = createImageElement;

    function extractDataForGallery(searchScope) {
        try {
            if (!searchScope) return [];

            const items = [];
            const uniqueSkus = new Set();

            // Determine the search scope based on the type of container
            let searchSelector = '';

            if (searchScope.matches && searchScope.matches('.modal')) {
                // If we're in a modal, search within the modal
                searchSelector = '.table-responsive > .table tr, .modal-body .table tr, .nested-fields.order-item-row, td.pick-order-item-row';
            } else if (searchScope.matches && searchScope.matches('table')) {
                // If we're in a table, search within that table
                searchSelector = 'tr';
            } else if (searchScope.matches && searchScope.matches('.table-responsive, .modal-body, .nested-fields')) {
                // If we're in a container, search within that container
                searchSelector = '.table-responsive > .table tr, .modal-body .table tr, .nested-fields.order-item-row, td.pick-order-item-row';
            } else if (searchScope.matches && searchScope.matches('tr, .order-item-row, .pick-order-item-row')) {
                // If we're in a row, search within the parent table/container
                const parentTable = searchScope.closest('table, .nested-fields');
                if (parentTable) {
                    return extractDataForGallery(parentTable);
                } else {
                    // If no parent table, just search this row
                    searchSelector = '*';
                }
            } else {
                // Fallback - search for any relevant rows
                searchSelector = '.table-responsive > .table tr, .modal-body .table tr, .nested-fields.order-item-row, td.pick-order-item-row';
            }

            // Search within the determined scope
            searchScope.querySelectorAll(searchSelector).forEach(row => {
                // Skip if this is not a data row
                if (!row.matches || !row.matches('tr, .order-item-row, .pick-order-item-row')) {
                    return;
                }

                let name, sku;

                // Find cells by header content instead of hardcoded positions
                const table = row.closest('table');
                let nameEl = null;
                let quantityEl = null;

                if (table) {
                    const thead = table.querySelector('thead tr');
                    if (thead) {
                        const headers = Array.from(thead.querySelectorAll('th')).map(th => th.textContent.trim());
                        const nameIndex = headers.findIndex(header => header.includes('שם'));
                        const quantityIndex = headers.findIndex(h => h.includes('כמות') || h.includes('לוקט'));

                        if (nameIndex !== -1) {
                            nameEl = row.cells[nameIndex];
                        }
                        if (quantityIndex !== -1) {
                            quantityEl = row.cells[quantityIndex];
                        }
                    }
                }

                // Fallback to original selectors if header method didn't work
                if (!nameEl) {
                    nameEl = row.querySelector('td:nth-child(4), input.order-item-name, span.text-dark-75');
                }
                if (!quantityEl) {
                    // Try multiple fallback strategies for quantity
                    quantityEl = row.querySelector('td:nth-child(5)') || // Original fallback
                               row.querySelector('[data-label*="כמות"], [data-label*="לוקט"]') || // Responsive labels
                               row.querySelector('td[title*="כמות"], td[title*="לוקט"]'); // Title attributes
                }

                const skuEl = row.querySelector('td.text-nowrap, input.order-item-sku, span.text-muted');
                if (!nameEl || !skuEl) return;
                name = (nameEl.value || nameEl.textContent).trim();
                sku = (skuEl.dataset.originalSku || skuEl.value || skuEl.textContent || '').trim();
                if (sku.startsWith('0')) return;
                const normalizedSku = normalizeSku(sku);
                if (!normalizedSku || uniqueSkus.has(normalizedSku)) return;
                const match = findImageMatch(sku, name);
                if (match && match.image) {

                    // Extract price from DOM - look for "מחיר ליחידה" column
                    let price = null;
                    if (table) {
                        const thead = table.querySelector('thead tr');
                        if (thead) {
                            const headers = Array.from(thead.querySelectorAll('th')).map(th => th.textContent.trim());
                            const priceIndex = headers.findIndex(header => header.includes('מחיר ליחידה'));
                            if (priceIndex !== -1 && row.cells[priceIndex]) {
                                const priceText = row.cells[priceIndex].textContent.trim();
                                // Extract numeric value from price text
                                const priceMatch = priceText.match(/[\d,]+\.?\d*/);
                                if (priceMatch) {
                                    price = priceMatch[0].replace(/,/g, '');
                                }
                            }
                        }
                    }

                    // Extract quantity - use the found quantity element or fallback
                    const quantity = quantityEl ? quantityEl.textContent.trim() : '';

                    items.push({
                        fullSizeUrl: getOptimizedImageUrl(getFullSizeImageUrl(match.image), Math.min(window.innerWidth, 1200)),
                        thumbnailUrl: getOptimizedImageUrl(match.image, 300), // Smaller thumbnails for better performance
                        productName: name,
                        sku: sku,
                        quantity: quantity, // Use the found quantity element
                        price: price, // Use price from DOM instead of CSV
                        link: match.link || null // Add product link if available
                    });

                    uniqueSkus.add(normalizedSku);
                } else {
                    // No image → include item with placeholder so gallery always opens

                    // Extract price from DOM - look for "מחיר ליחידה" column
                    let price = null;
                    if (table) {
                        const thead = table.querySelector('thead tr');
                        if (thead) {
                            const headers = Array.from(thead.querySelectorAll('th')).map(th => th.textContent.trim());
                            const priceIndex = headers.findIndex(header => header.includes('מחיר ליחידה'));
                            if (priceIndex !== -1 && row.cells[priceIndex]) {
                                const priceText = row.cells[priceIndex].textContent.trim();
                                // Extract numeric value from price text
                                const priceMatch = priceText.match(/[\d,]+\.?\d*/);
                                if (priceMatch) {
                                    price = priceMatch[0].replace(/,/g, '');
                                }
                            }
                        }
                    }

                    // Extract quantity - use the found quantity element or fallback
                    const quantity = quantityEl ? quantityEl.textContent.trim() : '';

                    items.push({
                        fullSizeUrl: PLACEHOLDER_IMG_URL,
                        thumbnailUrl: PLACEHOLDER_IMG_URL,
                        productName: name,
                        sku: sku,
                        quantity: quantity || '',
                        price: price,
                        link: null
                    });
                    uniqueSkus.add(normalizedSku);
                }
            });
            return items;
        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Error extracting gallery data:`, error);
            return [];
        }

        // Fix shipment wrapping after extracting gallery data
        // fixShipmentWrapping(); // Removed for performance
    }

    // DRY helper function to attach gallery opener to placeholder images
    function attachGalleryOpener(imgEl, sku, fallbackScopeEl) {
        imgEl.title = 'Open gallery';
        imgEl.style.cursor = 'pointer';
        imgEl.onclick = (e) => {
            e.stopPropagation();
            // TM: robust target for composed events & non-Element targets
            const raw = e.composedPath ? e.composedPath()[0] : e.target;
            const targetEl = raw && raw.nodeType === 1 ? raw : null; // 1 = ELEMENT_NODE
            const searchScope =
                (targetEl ? targetEl.closest('.modal') : null) ||
                (targetEl ? targetEl.closest('table') : null) ||
                (targetEl ? targetEl.closest('.table-responsive, .modal-body, .nested-fields') : null) ||
                (targetEl ? targetEl.closest('tr, .order-item-row, .pick-order-item-row')?.closest('table, .nested-fields') : null) ||
                fallbackScopeEl ||
                document.body;

            const galleryItems = extractDataForGallery(searchScope);
            const clickedIndex = galleryItems.findIndex(item => normalizeSku(item.sku) === normalizeSku(sku));
            showGalleryOverlay(galleryItems, Math.max(0, clickedIndex));
        };

        // Fix shipment wrapping after attaching gallery opener
        // fixShipmentWrapping(); // Removed for performance
    }

    // MODIFICATION START: Updated injectImagesAndLinks to accept a scope parameter
    function injectImagesAndLinks(scope = document) {
        try {
            if (!settings || !settings.showImages) {
                return;
            }


            // Find all rows with data-original-sku that haven't been processed
            const rows = scope.querySelectorAll('tr:not([data-image-processed])');

            rows.forEach((row, index) => {
                // Skip rows from main orders table
                if (row.closest('.dataTables_wrapper.dt-bootstrap4')) {
                    return;
                }

                // Look for SKU data in the row
                const skuTd = row.querySelector('[data-original-sku]');
                if (!skuTd) {
                    return;
                }

                const sku = skuTd.dataset.originalSku || skuTd.textContent.trim();

                // Look for name data - try multiple selectors
                let nameTd = row.querySelector('[data-label="שם"]');
                if (!nameTd) {
                    // Fallback: look for cells that might contain the name
                    const cells = row.querySelectorAll('td');
                    // Usually the name is in the 3rd column (index 2)
                    if (cells.length > 2) {
                        nameTd = cells[2];
                    }
                }

                const name = nameTd?.textContent.trim() || '';

                if (!sku || !name) {
                    return;
                }

                const match = findImageMatch(sku, name);

                if (match && match.image) {
                    const img = createImageElement(match, name, sku, { maxHeight: '80px', maxWidth: '80px' });
                    if (img) {
                        const firstTd = row.querySelector('td');
                        if (firstTd) {
                            // Clear the first cell and add the image
                            firstTd.innerHTML = '';
                            firstTd.style.cssText = 'width: 80px; height: 80px; display: flex; align-items: center; justify-content: center; padding: 4px;';
                            firstTd.appendChild(img);
                        }
                    }
                } else {
                    const firstTd = row.querySelector('td');
                    if (firstTd) {
                        firstTd.innerHTML = '';
                        firstTd.style.cssText = 'width: 80px; height: 80px; display: flex; align-items: center; justify-content: center; padding: 4px;';
                        const ph = document.createElement('img');
                        ph.src = PLACEHOLDER_IMG_URL;
                        ph.alt = 'No image';
                        Object.assign(ph.style, {
                            width: '100%',
                            height: '100%',
                            maxHeight: '80px',
                            maxWidth: '80px',
                            objectFit: 'contain',
                            objectPosition: 'center',
                            borderRadius: '4px',
                            display: 'block'
                        });
                        attachGalleryOpener(ph, sku, scope);
                        firstTd.appendChild(ph);
                    }
                }

                row.setAttribute('data-image-processed', 'true');
            });


            // This part is for the modal rows
            scope.querySelectorAll('td.pick-order-item-row:not([data-image-processed])').forEach(cell => {
                const imageContainer = cell.querySelector('.col-sm-6 > .d-flex.align-items-center');
                if (!imageContainer) return;
                const name = cell.querySelector('span.text-dark-75')?.textContent.trim() || '';
                const sku = cell.querySelector('span.text-muted')?.textContent.trim() || '';
                const match = findImageMatch(sku, name);
                if (match && match.image) {
                    const wrapper = document.createElement('div');
                    wrapper.style.cssText = 'width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; margin-right: 10px;';
                    wrapper.append(createImageElement(match, name, sku, { maxHeight: '50px', maxWidth: '50px', padding: '5px' }));
                    imageContainer.prepend(wrapper);
                } else {
                    const wrapper = document.createElement('div');
                    wrapper.style.marginRight = '10px';
                    wrapper.style.cssText = 'width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; margin-right: 10px;';

                    const ph = document.createElement('img');
                    ph.src = PLACEHOLDER_IMG_URL;
                    ph.alt = 'No image';
                    Object.assign(ph.style, {
                        width: '100%',
                        height: '100%',
                        maxHeight: '50px',
                        maxWidth: '50px',
                        objectFit: 'contain',
                        objectPosition: 'center',
                        borderRadius: '4px',
                        padding: '5px',
                        display: 'block'
                    });
                    attachGalleryOpener(ph, sku, imageContainer.closest('.modal') || document.body);

                    wrapper.append(ph);
                    imageContainer.prepend(wrapper);
                }
                cell.setAttribute('data-image-processed', 'true');
            });

            // This part is for the modal form items
            const modalForm = scope.querySelector('form[id^="edit_task_"]');
            if (modalForm) {
                const headerContainer = modalForm.querySelector('.order-item-header > span.d-flex');
                if (headerContainer && !headerContainer.querySelector('.tampermonkey-image-header')) {
                    const newHeader = document.createElement('div');
                    newHeader.textContent = 'תמונה';
                    newHeader.className = 'tampermonkey-image-header';
                    newHeader.style.cssText = 'width: 88px; flex: 0 0 88px;';
                    headerContainer.prepend(newHeader);
                }
                modalForm.querySelectorAll('.nested-fields.order-item-row:not([data-image-processed])').forEach(row => {
                    const flexContainer = row.querySelector('div.d-flex.align-items-center');
                    if (flexContainer && !flexContainer.querySelector('.tampermonkey-image-placeholder')) {
                        const placeholder = document.createElement('div');
                        placeholder.className = 'tampermonkey-image-placeholder';
                        placeholder.style.cssText = 'width: 88px; flex: 0 0 88px; display: flex; align-items: center; justify-content: center; margin-right: 8px;';
                        flexContainer.prepend(placeholder);
                        const name = row.querySelector('input.order-item-name')?.value.trim();
                        const sku = row.querySelector('input.order-item-sku')?.value.trim();
                        const match = findImageMatch(sku, name);
                        if (match && match.image) {
                            placeholder.append(createImageElement(match, name, sku, { maxHeight: '70px', maxWidth: '80px' }));
                        } else {
                            const ph = document.createElement('img');
                            ph.src = PLACEHOLDER_IMG_URL;
                            ph.alt = 'No image';
                            Object.assign(ph.style, {
                                width: '100%',
                                height: '100%',
                                maxHeight: '70px',
                                maxWidth: '80px',
                                objectFit: 'contain',
                                objectPosition: 'center',
                                borderRadius: '4px',
                                display: 'block'
                            });
                            attachGalleryOpener(ph, sku, placeholder.closest('.modal') || document.body);
                            placeholder.append(ph);
                        }
                    }
                    row.setAttribute('data-image-processed', 'true');
                });
            }

        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Error injecting images and links:`, error);
        }

        // Fix shipment wrapping after injecting images
        // fixShipmentWrapping(); // Removed for performance
    }
    // MODIFICATION END

    // MODIFICATION START: Add new function for regular product tables
    function injectImagesInRegularTables(scope = document) {
        try {
            if (!settings || !settings.showImages) {
                return;
            }


            const productTable = findProductTableInScope(scope);

            if (productTable) {
                const rows = productTable.querySelectorAll('tbody tr:not([data-image-processed])');

                rows.forEach((row, index) => {

                    // Find cells by header content instead of hardcoded positions
                    const thead = productTable.querySelector('thead tr');
                    let nameCell = null;
                    let skuCell = null;

                    if (thead) {
                        const headers = Array.from(thead.querySelectorAll('th')).map(th => th.textContent.trim());
                        const nameIndex = headers.findIndex(header => header.includes('שם'));
                        const skuIndex = headers.findIndex(header => header.includes('מק'));

                        if (nameIndex !== -1) nameCell = row.cells[nameIndex];
                        if (skuIndex !== -1) skuCell = row.cells[skuIndex];

                    }

                    // Fallback to hardcoded positions if header method didn't work (name cell only)
                    if (!nameCell) nameCell = row.querySelector('td:nth-child(4)');


                    if(!nameCell || !skuCell) {
                        return;
                    }

                    const targetCell = row.cells[0]; // Image always goes into the first TD
                    const name = nameCell.textContent.trim(), sku = (skuCell.dataset.originalSku || skuCell.textContent || '').trim();

                    const match = findImageMatch(sku, name);

                    if (match) {
                        if (match.image && !targetCell.querySelector('.tampermonkey-sku-image')) {
                            targetCell.innerHTML = '';
                            targetCell.style.cssText = 'width: 80px; height: 80px; display: flex; align-items: center; justify-content: center; padding: 4px;';
                            targetCell.append(createImageElement(match, name, sku, { maxHeight: '80px', maxWidth: '80px' }));
                        }

                        if (match.link && !nameCell.querySelector('a:not(.google-image-icon)')) {
                            // אל תמנע יצירת קישור בגלל כפתורים מחוץ לתא עצמו
                            const hasAnipetButton = nameCell.querySelector('.anipet-alternatives-btn');

                            // Only create link if there's no Anipet button
                            if (!hasAnipetButton) {
                                const productName = nameCell.textContent.trim();

                                // Preserve Google image icon if exists
                                const googleIcon = nameCell.querySelector('.google-image-icon');
                                // Clear the cell content
                                nameCell.innerHTML = '';
                                if (googleIcon) nameCell.appendChild(googleIcon);

                                // Create copy icon with enhanced feedback
                                const copyIcon = createCopyIcon(productName);

                                // Create link
                                const link = document.createElement('a');
                                link.classList.add('tm-name-link'); // force link styling specifically for name links
                                link.href = match.link;
                                link.target = '_blank';
                                link.rel = 'noopener noreferrer';
                                link.textContent = productName;

                                // Append link first, then copy icon (icon will float left)
                                nameCell.appendChild(link);
                                nameCell.appendChild(copyIcon);

                                // Do not add copy-enabled to this cell since it has its own copy mechanism
                            }
                        }
                    } else {
                        if (targetCell && !targetCell.querySelector('img')) {
                            targetCell.innerHTML = '';
                            targetCell.style.cssText = 'width: 80px; height: 80px; display: flex; align-items: center; justify-content: center; padding: 4px;';
                            const ph = document.createElement('img');
                            ph.src = PLACEHOLDER_IMG_URL;
                            ph.alt = 'No image';
                            Object.assign(ph.style, {
                                width: '100%',
                                height: '100%',
                                maxHeight: '80px',
                                maxWidth: '80px',
                                objectFit: 'contain',
                                objectPosition: 'center',
                                borderRadius: '4px',
                                display: 'block'
                            });
                            attachGalleryOpener(ph, sku, scope);
                            targetCell.appendChild(ph);
                        }
                    }
                    row.setAttribute('data-image-processed', 'true');
                });
            } else {
            }

        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Error injecting images in regular tables:`, error);
        }

        // Fix shipment wrapping after injecting images in regular tables
        // fixShipmentWrapping(); // Removed for performance

        // Fix shipment wrapping after injecting images in regular tables
        // fixShipmentWrapping(); // Removed for performance
    }

    // MODIFICATION START: Add new function for .order-item-row structure support
    function injectImagesInOrderItemRows(scope = document) {
        if (!productDataCache) return;

        const unprocessedRows = scope.querySelectorAll('.order-item-row:not([data-image-processed])');
        const processedRows = scope.querySelectorAll('.order-item-row[data-image-processed]');
        const processedRowsWithoutImages = Array.from(processedRows).filter(row => !row.querySelector('.tampermonkey-sku-image'));
        const rows = [...unprocessedRows, ...processedRowsWithoutImages];

        if (rows.length === 0) return;

        rows.forEach(row => {
            const skuInput = row.querySelector('input.order-item-sku');
            const nameInput = row.querySelector('input.order-item-name');

            if (!skuInput || !nameInput) return;

            const sku = skuInput.value?.trim();
            const name = nameInput.value?.trim();

            if (!sku || !name) return;

            // אם כבר יש תמונה בשורה, נסמן אותה כמעובדת
            const existingImage = row.querySelector('.tampermonkey-sku-image');
            if (existingImage) {
                row.setAttribute('data-image-processed', 'true');
                return;
            }

            if (!productDataCache) return;

            const product = productDataCache.find(p =>
                p.barcode === sku ||
                p.sku === sku ||
                p.name === name ||
                (p.skus && p.skus.includes(sku)) ||
                (p.productName && p.productName.toLowerCase().trim() === name.toLowerCase().trim())
            );

            if (!product) return;
            if (!product.image && !product.imageUrl) {
                // אם אין תמונה למוצר, נסמן כמעובד כדי למנוע לולאה אינסופית
                row.setAttribute('data-image-processed', 'true');
                return;
            }

            let placeholder = row.querySelector('.tampermonkey-image-placeholder');
            if (!placeholder) {
                // צור את ה-placeholder באופן ידני והכנס אותו
                const container = row.querySelector('.d-flex.align-items-center');
                if (container) {
                    placeholder = document.createElement('div');
                    placeholder.className = 'tampermonkey-image-placeholder';
                    placeholder.style.cssText = 'width: 88px; flex: 0 0 88px; display: flex; align-items: center; justify-content: center; margin-right: 8px;';
                    if (container.firstChild) {
                        safeInsertBefore(container.firstChild, placeholder, container);
                    } else {
                        container.appendChild(placeholder);
                    }
                } else {
                    return; // אין לאן להכניס
                }
            }

            if (placeholder) {
                const img = document.createElement('img');
                img.src = product.image || product.imageUrl;
                img.className = 'tampermonkey-sku-image';
                Object.assign(img.style, {
                    width: '100%',
                    height: '100%',
                    maxHeight: '48px',
                    maxWidth: '80px',
                    objectFit: 'contain',
                    objectPosition: 'center',
                    borderRadius: '4px',
                    display: 'block'
                });
                placeholder.innerHTML = '';
                placeholder.appendChild(img);
            }

            row.setAttribute('data-image-processed', 'true');
        });

        // Fix shipment wrapping after injecting images in order item rows
        // fixShipmentWrapping(); // Removed for performance
    }
    // MODIFICATION END

    // MODIFICATION START: Unified barcode replacement function
    // Add WeakSet for tracking processed elements to improve performance
    const processedElements = new WeakSet();

    function isElementProcessed(element) {
        return processedElements.has(element);
    }

    function markElementAsProcessed(element) {
        processedElements.add(element);
    }

    function replaceBarcodesInViews(scope = document) {
        try {
            if (!settings || !settings.replaceBarcodes || !itemCodeToBarcodeMap) return;

            const foundContexts = [
                scope.querySelector('.table.table-hover'),
                scope.querySelector('.modal-body .table'),
                scope.querySelector('.nested-fields'),
                scope.querySelector('.pick-order-item-row'),
                scope.querySelector('.offcanvas .table'),
                scope.querySelector('.panel_view .table'),
                scope.querySelector('#task_offcanvas .table')
            ].filter(Boolean);

            if (foundContexts.length === 0) return;

            // Process elements with data-original-sku first (priority)
            const elementsWithSku = scope.querySelectorAll('[data-original-sku]');
            elementsWithSku.forEach((el) => {
                try {
                    const originalSku = el.getAttribute('data-original-sku')?.trim();
                    if (!originalSku) return;

                    // Skip if already processed
                    if (isElementProcessed(el)) return;

                    // Find the name from the closest row
                    const name = el.closest('tr')?.querySelector('[data-label="שם"], .order-item-name, .text-dark-75, td:nth-child(10), td:nth-child(3), .text-dark-75.font-weight-bold')?.textContent?.trim() || '';

                    const barcode = findBarcode(originalSku, name);
                    if (barcode && barcode !== originalSku) {
                        processBarcodeElement(el, barcode, originalSku);
                    }
                    markElementAsProcessed(el);
                } catch (elementError) {
                    console.warn(`[${SCRIPT_NAME}] Failed to process element with data-original-sku:`, elementError);
                    // Continue with next element
                }
            });

            // Then process other elements (but skip those already processed by data-original-sku)
            foundContexts.forEach((context) => {
                try {
                    const elements = context.querySelectorAll('td.text-nowrap, input[type="text"], span.text-muted, strong');
                    elements.forEach((el) => {
                        try {
                            // Skip if already processed
                            if (isElementProcessed(el)) return;

                            // Skip if this element has data-original-sku (already processed above)
                            if (el.hasAttribute('data-original-sku')) return;

                            const name = el.closest('tr')?.querySelector('[data-label="שם"], .order-item-name, .text-dark-75, td:nth-child(10), td:nth-child(3), .text-dark-75.font-weight-bold')?.textContent?.trim() || '';
                            const sku = el.textContent?.trim() || el.value?.trim() || '';

                            if (!sku || sku.length < 3) return;

                            const barcode = findBarcode(sku, name);
                            if (barcode && barcode !== sku) {
                                processBarcodeElement(el, barcode, sku);
                            }
                            markElementAsProcessed(el);
                        } catch (elementError) {
                            console.warn(`[${SCRIPT_NAME}] Failed to process element:`, elementError);
                            // Continue with next element
                        }
                    });
                } catch (contextError) {
                    console.warn(`[${SCRIPT_NAME}] Failed to process context:`, contextError);
                    // Continue with next context
                }
            });

            // Handle completely empty SKU cells that don't have any elements
            foundContexts.forEach((context) => {
                try {
                    const rows = context.querySelectorAll('tr');
                    rows.forEach((row) => {
                        try {
                            // Find the name cell first
                            let nameEl;
                            if (context.matches('.table.table-hover')) {
                                // Regular tables: Name is at td[data-label="שם"]
                                nameEl = row.querySelector('td[data-label="שם"]');
                            } else if (context.matches('.pick-order-item-row')) {
                                // Picking modal: SKU cell is the span with barcode-highlight class
                                nameEl = row.querySelector('.barcode-highlight[data-original-sku]');
                            } else {
                                // Other tables: Name is at various locations
                                nameEl = row.querySelector('.order-item-name, .text-dark-75, td:nth-child(10), td:nth-child(3), .text-dark-75.font-weight-bold');
                            }
                            if (!nameEl) return;

                            const name = nameEl.value || nameEl.textContent.trim();
                            if (!name) return;

                            // Find the SKU cell (empty or with minimal content)
                            let skuCell;
                            if (context.matches('.table.table-hover')) {
                                // Regular tables: SKU cell is at td[data-label="מק״ט"] or td[data-label="ברקוד"]
                                skuCell = row.querySelector('td[data-label="מק״ט"], td[data-label="ברקוד"]');
                            } else if (context.matches('.pick-order-item-row')) {
                                // Picking modal: SKU cell is the span with barcode-highlight class
                                skuCell = row.querySelector('.barcode-highlight[data-original-sku]');
                            } else {
                                // Other tables (including sidepanel): SKU cell is at td.text-nowrap or td[data-label="מק״ט"] or td[data-label="ברקוד"]
                                skuCell = row.querySelector('td.text-nowrap, td[data-label="מק״ט"], td[data-label="ברקוד"]');
                            }
                            if (!skuCell) return;

                            // Check if SKU cell is empty or has minimal content
                            const skuContent = skuCell.textContent.trim();
                            const hasSkuElement = skuCell.querySelector('input, span, strong');
                            const barcodeElement = skuCell.querySelector('.tampermonkey-barcode-bdi');

                            // Skip if already processed
                            if (isElementProcessed(skuCell)) return;

                            if ((skuContent === '' || skuContent.length < 3) && (!hasSkuElement || barcodeElement)) {
                                // Try to find barcode by name
                                const barcode = findBarcode(null, name);
                                if (barcode) {
                                    // Check if there's a specific barcode element to update (sidepanel case)
                                    if (barcodeElement) {
                                        // Update the existing barcode element in sidepanel
                                        barcodeElement.innerHTML = `<span class="barcode-highlight" title="הוחלף אוטומטית לפי שם. מקורי: לא ידוע" style="color: rgb(0, 100, 0) !important; font-weight: bold !important; cursor: help !important;">${barcode}</span>`;
                                    } else {
                                        // Create a text element to display the barcode
                                        const barcodeSpan = document.createElement('span');
                                        barcodeSpan.textContent = barcode;
                                        barcodeSpan.className = 'barcode-highlight';
                                        barcodeSpan.title = `הוחלף אוטומטית לפי שם. מקורי: לא ידוע`;
                                        barcodeSpan.style.cssText = `
                                            color: #006400 !important;
                                            font-weight: bold !important;
                                            cursor: help !important;
                                        `;

                                        // Clear the cell and add the barcode
                                        skuCell.innerHTML = '';
                                        skuCell.appendChild(barcodeSpan);

                                        // Add copy icon for newly created barcode
                                        const barcodeCopyIcon = createCopyIcon(barcode);
                                        barcodeCopyIcon.style.marginLeft = '4px';
                                        barcodeCopyIcon.style.marginRight = '0px';
                                        skuCell.appendChild(barcodeCopyIcon);
                                    }

                                    markElementAsProcessed(skuCell);
                                }
                            }
                        } catch (rowError) {
                            console.warn(`[${SCRIPT_NAME}] Failed to process row:`, rowError);
                            // Continue with next row
                        }
                    });
                } catch (contextError) {
                    console.warn(`[${SCRIPT_NAME}] Failed to process empty SKU cells in context:`, contextError);
                    // Continue with next context
                }
            });
        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Error replacing barcodes in views:`, error);
        }

        // Fix shipment wrapping after replacing barcodes
        // fixShipmentWrapping(); // Removed for performance
    }

    // Helper function to process barcode elements consistently
    function processBarcodeElement(el, barcode, originalSku) {
        try {
            if (!el || !el.isConnected) return;
            if (el.tagName === 'INPUT') {
                el.value = barcode;
                el.classList.add('barcode-input-highlight');
            } else {
                el.textContent = barcode;
                el.classList.add('barcode-highlight');
                // Add copy-enabled class for click functionality
                el.classList.add('copy-enabled');
                el.setAttribute('title', 'לחץ להעתקה');

                // Also enable copy styling for text elements inside this element
                const textElements = el.querySelectorAll('span, div, strong, b, i, em');
                textElements.forEach(textEl => {
                    if (textEl.textContent.trim() && !textEl.classList.contains('copy-enabled')) {
                        textEl.classList.add('copy-enabled');
                        if (!textEl.hasAttribute('title')) {
                            textEl.setAttribute('title', 'לחץ להעתקה');
                        }
                    }
                });
            }

            el.title = `הוחלף אוטומטית. מקורי: ${originalSku}`;

            // Add barcode-highlight class to the parent td if it exists, but not in picking modal
            const parentTd = el.closest('td');
            if (parentTd) {
                // Check if we're in the picking modal - if so, don't add barcode-highlight to the td
                const isInPickingModal = parentTd.closest('.pick-order-item-table');
                if (!isInPickingModal) {
                    parentTd.classList.add('barcode-highlight');
                }
                // Remove any inline background color to let CSS handle it
                parentTd.style.backgroundColor = '';
            }

            // Remove any inline background color from the element itself to let CSS handle it
            el.style.backgroundColor = '';

            // Add copy icon for dynamically replaced barcodes (if not already present)
            // Skip adding copy icons for tables that already have proper copy functionality
            const parentTable = el.closest('table[data-columns-tagged="true"]');
            const hasProperCopyWrap = parentTd && parentTd.querySelector('.tampermonkey-copy-wrap');

            if (el.tagName !== 'INPUT' && parentTd && !parentTd.querySelector('.copy-icon') &&
                !parentTable && !hasProperCopyWrap) {
                const barcodeCopyIcon = createCopyIcon(barcode);
                barcodeCopyIcon.style.marginRight = '4px';
                barcodeCopyIcon.style.marginLeft = '0px';

                // הכנס אייקון העתקה בצורה בטוחה (ללא NotFoundError)
                const anchor = stableAnchorForBarcode(el, parentTd);
                const place = () => {
                    if (parentTd.contains(anchor)) {
                        safeInsertBefore(anchor, barcodeCopyIcon, parentTd); // נשמר "לפני" הברקוד
                    } else {
                        parentTd.appendChild(barcodeCopyIcon);
                    }
                };
                // אם ממש עכשיו בוצע שינוי DOM (למשל innerHTML/bdi) – תן מיקרו-תור לפני החדרה
                queueMicrotask(place);
            }
        } catch (error) {
            console.warn(`[${SCRIPT_NAME}] Failed to process barcode element:`, error);
            // Continue without failing the entire process
        }
    }

    // Keep the old function name for backward compatibility but make it call the new unified function
    function replaceBarcodesInDOM(scope = document) {
        replaceBarcodesInViews(scope);
    }

    // MODIFICATION START: Add copy icons to all barcodes in pick-order-item-table
    function addCopyIconsToPickOrderItems(scope = document) {
        // ⛔ מנוטרל לפי דרישה: אין צורך באייקון העתקה בחלונית ליקוט
        return;
    }

    // Expose function to window for external access
    window.addCopyIconsToPickOrderItems = addCopyIconsToPickOrderItems;
    // MODIFICATION END

    // This is the correct and ONLY definition for injectPreviewFunctionality
    function injectPreviewFunctionality(mainTableBody) {
        try {
                    if (!settings || !settings.enablePreview) {
            return;
        }

        const headerRow = mainTableBody.closest('table').querySelector('thead tr');
        let previewHeaderCell = null;

        // MODIFICATION START: Hide the original empty TH (th.noVis.pt-2) from the header
        // This TH is structurally present at data-column-index="1" but visually empty.
        // We hide it to collapse its space in the header row.
        const emptyHeaderToHide = headerRow.querySelector('th.noVis.pt-2.sorting_disabled[data-column-index="1"]');
        if (emptyHeaderToHide) {
            emptyHeaderToHide.classList.add('tm-hideable-column'); // Use our utility class to hide it
        }
        // MODIFICATION END

        // MODIFICATION START: Insert our "Toggle All" Preview Button TH at the correct position
        // Check if already added by us
        previewHeaderCell = headerRow.querySelector('th.preview-col');

        if (!previewHeaderCell) {
            // Find the original Checkbox header (th:nth-child(1) / data-column-index="0")
            const checkboxHeader = headerRow.querySelector('th[data-column-index="0"]');
            // Insert our new preview header immediately after the checkbox header.
            // This will make our new TH `th:nth-child(2)`.
            // The original `th.noVis.pt-2` (empty) will then be `th:nth-child(3)` (and is hidden by CSS).
            if (checkboxHeader) {
                previewHeaderCell = document.createElement('th');
                previewHeaderCell.classList.add('preview-col');
                // Insert AFTER checkbox header (safe method)
                if (checkboxHeader && checkboxHeader.parentElement === headerRow) {
                    safeInsertAfter(checkboxHeader, previewHeaderCell, headerRow);
                } else {
                    headerRow.appendChild(previewHeaderCell);
                }
            } else {
                // Fallback: If checkbox header not found, insert at the beginning (less ideal for precise alignment)
                previewHeaderCell = document.createElement('th');
                previewHeaderCell.classList.add('preview-col');
                // Fallback to start (safe method)
                if (headerRow.children.length > 0) {
                    safeInsertBefore(headerRow.children[0], previewHeaderCell, headerRow);
                } else {
                    headerRow.appendChild(previewHeaderCell);
                }
            }
        }

if (previewHeaderCell && !previewHeaderCell.querySelector('.preview-toggle-all-button')) {
            const button = document.createElement('button');
            button.className = 'btn btn-sm btn-icon btn-light-primary preview-toggle-all-button';
            button.innerHTML = '<i class="fa-light fa-list-tree" title="פתח/סגור את כל הפריטים"></i>';

            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                // קובע אם צריך לפתוח או לסגור לפי המצב הנוכחי
                const isAnyOpen = mainTableBody.querySelector('.preview-cell button i.fa-chevron-left');
                const targetIconClass = isAnyOpen ? 'fa-chevron-left' : 'fa-chevron-down';

                // מוצא את כל האייקונים הפוטנציאליים
                const iconsToConsider = mainTableBody.querySelectorAll(`.preview-cell button i.${targetIconClass}`);

                // עובר על כל האייקונים ולוחץ רק אם השורה שלהם מוצגת
                iconsToConsider.forEach(icon => {
                    const parentRow = icon.closest('tr[data-task-id]');
                    // התנאי שבודק אם השורה אכן נראית על המסך
                    if (parentRow && parentRow.offsetParent !== null) {
                        const targetButton = icon.closest('button');
                        if (targetButton) {
                            targetButton.click();
                        }
                    }
                });
            }, { passive: false });

            previewHeaderCell.innerHTML = '';
            previewHeaderCell.appendChild(button);

            previewHeaderCell.style.padding = '0.75rem 0.5rem';
            previewHeaderCell.style.textAlign = 'center';
        }

        // MODIFICATION END (for TH insertion)


        // CORRECTED FOR EACH LOOP (TD insertion logic):
        mainTableBody.querySelectorAll('tr[data-task-id]').forEach(row => {
            // אל תיגע בשורות שכבר עובדו
            if (row.hasAttribute('data-preview-processed')) return;
            if (row.querySelector('td.preview-cell')) { return; }
            // MODIFICATION START: DO NOT remove/move content from td.noVis.pt-2.
            // That TD (the ✅ icon) is an important visible column and should stay in its original position.
            // We are NOT hiding it here. Its width is controlled by new CSS for '.noVis.pt-2'.
            // MODIFICATION END

            const cell = document.createElement('td'); // This is the cell for the individual preview button
            cell.className = 'preview-cell';
            const button = document.createElement('button');
            button.className = 'btn btn-sm btn-icon btn-light-primary';
            button.innerHTML = '<i class="fa-light fa-chevron-down"></i>'; // Only the chevron icon initially

            button.dataset.taskId = row.dataset.taskId;
            button.title = 'הצג פריטים'; // Base title

            cell.append(button);
            // Insert the button cell at index 1 (the second position after the original checkbox).
            // This is crucial: [Checkbox (0)], [OUR BUTTON (1)], [✅ Icon (2)], [Order ID (3)]
            if (row.children[1]) {
                safeInsertBefore(row.children[1], cell, row);
            } else {
                row.appendChild(cell);
            }
            // MODIFICATION END (for TD insertion)

            // Recalculate column widths if DataTables is present
            if (window.jQuery && jQuery.fn && jQuery.fn.dataTable) {
                try { jQuery.fn.dataTable.tables({visible:true, api:true}).columns.adjust(); }
                catch(e) {}
            }

            button.addEventListener('click', async (e) => {
                e.preventDefault(); e.stopPropagation();
                const currentButton = e.currentTarget, icon = currentButton.querySelector('i'), taskId = currentButton.dataset.taskId, parentRow = currentButton.closest('tr'), existingPreview = document.getElementById(`preview-for-${taskId}`);
                if (existingPreview) {
                    // מחק את ה-taskId מה-sessionStorage כאשר PREVIEW נסגר
                    const openPreviews = getOpenPreviewIds();
                    const updatedPreviews = openPreviews.filter(id => id !== taskId);
                    setOpenPreviewIds(updatedPreviews);

                    existingPreview.remove();
                    updateButtonState(currentButton, false);

                    return;
                }
                // שמור את ה-taskId ב-sessionStorage לפני פתיחה
                const openPreviews = getOpenPreviewIds();
                if (!openPreviews.includes(taskId)) {
                    openPreviews.push(taskId);
                    setOpenPreviewIds(openPreviews);
                }

                // בדוק אם זה session חדש - אם כן, אל תפתח PREVIEWs אחרים
                const sessionStartTime = sessionStorage.getItem('sessionStartTime');
                const currentTime = Date.now();
                const sessionAge = currentTime - parseInt(sessionStartTime || '0');

                // אם ה-session צעיר מדי (פחות מ-5 שניות), נקה את כל ה-PREVIEWs האחרים
                if (sessionAge < 5000) {
                    setOpenPreviewIds([taskId]);
                }


                // נקה את כל ה-classes הקודמים וקבע למצב טעינה
                icon.classList.remove('fa-chevron-down', 'fa-chevron-up', 'fa-chevron-left', 'fa-refresh', 'fa-spin', 'fa-exclamation-triangle');
                icon.classList.add('fa-refresh', 'fa-spin');
                currentButton.disabled = true;
                try {
                    // השתמש ב-TM_PREVIEW לקאש וטעינה מהירה
                    const html = await TM_PREVIEW.fetchPanelView(taskId);
                    const doc = new DOMParser().parseFromString(html, 'text/html'); const allItems = [];

                    // Extract notes from the fetched task page
                    let notesText = '';
                    let isReady = false;
                    const notesEl = doc.querySelector('.bg-yellow .hover-copy'); // Assuming this is the selector for notes
                    if (notesEl) {
                        notesText = notesEl.textContent.trim();
                        // Check if notes contain "מוכן" for highlighting
                        if (notesText.includes('מוכן')) {
                            isReady = true;
                        }
                    }

                    const productTable = findProductTableInScope(doc);
                    if (productTable) {
                        const headers = Array.from(productTable.querySelectorAll('thead th')).map(th => th.textContent.trim());
                        // שיפור: זיהוי גמיש יותר של כותרות - מזהה גם וריאציות של הכותרות
                        const skuIndex = headers.findIndex(h => h.includes('מק')),
                              nameIndex = headers.findIndex(h => h.includes('שם')),
                              quantityIndex = headers.findIndex(h => h.includes('כמות') || h.includes('לוקט')),
                              priceIndex = headers.findIndex(h => h.includes('מחיר ליחידה'));
                        if (skuIndex !== -1 && nameIndex !== -1 && quantityIndex !== -1) {
                            productTable.querySelectorAll('tbody tr').forEach(itemRow => {
                                const cells = itemRow.cells;
                                const name = cells[nameIndex].textContent.trim(),
                                      sku = cells[skuIndex].textContent.trim(),
                                      quantity = cells[quantityIndex].textContent.trim();

                                // חלץ מחיר אם קיים
                                let price = null;
                                if (priceIndex !== -1 && cells[priceIndex]) {
                                    const priceText = cells[priceIndex].textContent.trim();
                                    const priceMatch = priceText.match(/[\d,]+\.?\d*/);
                                    if (priceMatch) {
                                        price = priceMatch[0].replace(/,/g, '');
                                    }
                                }

                                // Try to find image match - first with original SKU, then with replaced barcode
                                let imageMatch = findImageMatch(sku, name);
                                const barcodeMatch = findBarcode(sku, name);

                                // If no image found with original SKU, try with the barcode
                                if (!imageMatch && barcodeMatch) {
                                    imageMatch = findImageMatch(barcodeMatch, name);
                                }

                                allItems.push({
                                    name,
                                    sku,
                                    quantity,
                                    price,
                                    image: imageMatch ? imageMatch.image : PLACEHOLDER_IMG_URL,
                                    barcode: barcodeMatch
                                });
                            });
                        }
                    }
                    const newRow = document.createElement('tr'); newRow.id = `preview-for-${taskId}`;
                    if (isReady) {
                        newRow.classList.add('ready-row-highlight');
                    }
                    const newCell = document.createElement('td'); newCell.colSpan = parentRow.cells.length; newCell.style.cssText = 'padding: 15px; background-color: #f9f9f9;';



                    // הכפתור "פתח הזמנה" הועבר למיקום עם הכפתורים האחרים

                    // Create expandable sections (initially hidden)
                    const calculatorSection = document.createElement('div');
                    calculatorSection.className = 'preview-section calculator-section';
                    calculatorSection.style.cssText = 'display: none; margin-bottom: 10px;';

                    // Create sticky note section variable (will be null if no notes)
                    let stickyNoteSection = null;

                    // Only create sticky note section if there are notes
                    if (notesText && notesText.trim()) {
                        stickyNoteSection = document.createElement('div');
                        stickyNoteSection.className = 'preview-section sticky-note-section';
                        stickyNoteSection.style.cssText = 'display: none; margin-bottom: 10px;';

                        // Highlight "מוכן" in bold if present
                        const highlightedNotes = notesText.replace(/מוכן/g, '<strong>מוכן</strong>');
                        stickyNoteSection.innerHTML = `<div class="preview-notes"><i class="fa-light fa-note-sticky"></i> ${highlightedNotes}</div>`;
                    }

                    if (allItems.length > 0) {
                        const container = document.createElement('div'); container.style.cssText = 'display: flex; flex-wrap: wrap; gap: 8px;';
                        allItems.forEach((item, itemIndex) => {
                            if (window.DEBUG_TOOLBOX) {

                            }
                            const itemDiv = document.createElement('div'); itemDiv.className = 'd-flex align-items-center border rounded p-2 m-1 bg-white';
                            const img = document.createElement('img'); img.src = item.image;
                            img.style.cssText = 'width: 50px; height: 50px; object-fit: contain; margin-left: 10px; cursor: pointer;';
                            img.onerror = function() { this.src = PLACEHOLDER_IMG_URL; this.style.cursor = 'default'; };
                            img.onclick = () => {
                                // השתמש במחיר שכבר חולץ
                                const galleryData = allItems.map(i => {
                                    return {
                                        fullSizeUrl: getOptimizedImageUrl(getFullSizeImageUrl(i.image), Math.min(window.innerWidth, 1200)),
                                        thumbnailUrl: getOptimizedImageUrl(i.image, 300),
                                        productName: i.name,
                                        sku: i.sku,
                                        quantity: i.quantity,
                                        price: i.price,
                                        link: null // Preview doesn't have direct product links
                                    };
                                });

                                showGalleryOverlay(galleryData, itemIndex);
                            };
                            itemDiv.appendChild(img);
                            const textDiv = document.createElement('div');
                            let skuDisplay = `מק"ט: ${item.sku}`;
                            if (settings.replaceBarcodes && item.barcode && item.barcode !== item.sku) {
                                skuDisplay = `מק"ט: <strong class="barcode-highlight" title="מקורי: ${item.sku}">${item.barcode}</strong>`;
                            }
                            // הוסף מחיר לתצוגה
                            let priceDisplay = '';
                            let priceClass = '';
                            if (item.price) {
                                const priceNum = parseFloat(item.price);
                                if (!isNaN(priceNum)) {
                                    // הדגש מחירים גבוהים
                                    if (priceNum > 1000) {
                                        priceClass = 'text-danger font-weight-bold';
                                    } else if (priceNum > 500) {
                                        priceClass = 'text-warning font-weight-bold';
                                    }

                                    // חשב מחיר כולל כמות
                                    const quantityParts = item.quantity.split('/').map(part => part.trim());
                                    const totalQuantity = parseInt(quantityParts[0]) || 1;
                                    const pickedQuantity = quantityParts.length > 1 ? parseInt(quantityParts[1]) || 0 : totalQuantity;

                                    // השתמש בכמות השנייה (המלוקטת) לחישוב הסה"כ, או בכמות הראשונה אם אין כמות שנייה
                                    const quantityForCalculation = quantityParts.length > 1 ? pickedQuantity : totalQuantity;
                                    const totalItemPrice = priceNum * quantityForCalculation;

                                    priceDisplay = ` | מחיר: <span class="${priceClass}">₪${priceNum.toLocaleString('he-IL', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>`;

                                    // הוסף מחיר כולל תמיד אם יש מחיר
                                    if (priceNum > 0) {
                                        const isNotPicked = quantityParts.length > 1 && pickedQuantity === 0;
                                        const statusText = isNotPicked ? ' (לא מלוקט)' : '';
                                        priceDisplay += ` <span class="text-muted">(סה"כ: ₪${totalItemPrice.toLocaleString('he-IL', {minimumFractionDigits: 2, maximumFractionDigits: 2})}${statusText})</span>`;
                                    }
                                }
                            }

                            // Highlight pick quantities in preview
                            let highlightedQuantity = item.quantity;
                            const quantityMatch = item.quantity.match(/^(\d+)\s*\/\s*(\d+)$/);
                            if (quantityMatch) {
                                const picked = parseInt(quantityMatch[1]);
                                const total = parseInt(quantityMatch[2]);

                                if (picked !== 0 || total !== 1) { // Skip 0/1
                                    const quantityClass =
                                        picked === total ? 'tampermonkey-picked-full' :
                                        picked === 0 && total > 1 ? 'tampermonkey-picked-none' :
                                        'tampermonkey-picked-partial';

                                    highlightedQuantity = `<span class="${quantityClass}">${item.quantity}</span>`;
                                }
                            }

                            textDiv.innerHTML = `<div class="font-weight-bold" style="font-size:0.9rem;">${item.name}</div><div class="text-muted" style="font-size:0.8rem;">${skuDisplay} | כמות: ${highlightedQuantity}${priceDisplay}</div>`;
                            itemDiv.appendChild(textDiv); container.appendChild(itemDiv);
                        });
                        newCell.appendChild(container);

                        // Create minimized icons container (after items)
                        const minimizedIconsContainer = document.createElement('div');
                        minimizedIconsContainer.className = 'preview-minimized-icons';
                        minimizedIconsContainer.style.cssText = 'display: flex; gap: 8px; margin-top: 15px;';

                        // Create "פתח הזמנה" button as first icon
                        const openOrderButton = document.createElement('button');
                        openOrderButton.className = 'btn btn-sm btn-icon btn-light-primary preview-icon-btn open-order-btn';
                        openOrderButton.innerHTML = '<i class="fa-light fa-arrow-up-right-from-square"></i>';
                        openOrderButton.title = 'פתח הזמנה';
                        openOrderButton.style.cssText = 'width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;';

                        // Add click handler for open order button
                        openOrderButton.addEventListener('click', (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            window.open(`/tasks/${taskId}`, '_blank');
                        });

                        minimizedIconsContainer.appendChild(openOrderButton);

                        // Check if there are items with prices first
                        const itemsWithPrice = allItems.filter(item => {
                            const price = parseFloat(item.price);
                            return item.price && !isNaN(price) && price > 0;
                        });

                        // Only create calculator icon button if there are items with prices
                        if (itemsWithPrice.length > 0) {
                            const calculatorButton = document.createElement('button');
                            calculatorButton.className = 'btn btn-sm btn-icon btn-light-primary preview-icon-btn calculator-btn';
                            calculatorButton.innerHTML = '<i class="fa-light fa-calculator"></i>';
                            calculatorButton.title = 'סה"כ הזמנה';
                            calculatorButton.style.cssText = 'width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;';

                            // Add click handler for calculator icon
                            calculatorButton.addEventListener('click', (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                togglePreviewSection(calculatorButton, 'calculator');
                            });

                            minimizedIconsContainer.appendChild(calculatorButton);
                        }

                        // Only create sticky note button if there are notes
                        if (notesText && notesText.trim()) {
                            const stickyNoteButton = document.createElement('button');
                            stickyNoteButton.className = 'btn btn-sm btn-icon btn-light-primary preview-icon-btn sticky-note-btn';
                            stickyNoteButton.innerHTML = '<i class="fa-light fa-note-sticky"></i>';
                            stickyNoteButton.title = 'הערות';
                            stickyNoteButton.style.cssText = 'width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;';

                            stickyNoteButton.addEventListener('click', (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                togglePreviewSection(stickyNoteButton, 'sticky-note');
                            });

                            minimizedIconsContainer.appendChild(stickyNoteButton);
                        }

                        // Only append the icons container if it has any buttons
                        if (minimizedIconsContainer.children.length > 0) {
                            newCell.appendChild(minimizedIconsContainer);
                        }

                        // Append sticky note section after items and icons
                        if (stickyNoteSection) {
                            newCell.appendChild(stickyNoteSection);
                        }

                        // הוסף סיכום מחירים
                        if (itemsWithPrice.length > 0) {
                            // חשב סה"כ הזמנה לפי הכמות השנייה (המלוקטת) או הראשונה אם אין שנייה
                            const totalPrice = itemsWithPrice.reduce((sum, item) => {
                                const price = parseFloat(item.price);
                                const quantityParts = item.quantity.split('/').map(part => part.trim());
                                const quantity = quantityParts.length > 1 ? parseInt(quantityParts[1]) || 0 : parseInt(quantityParts[0]) || 1;
                                return sum + (price * quantity);
                            }, 0);

                            if (totalPrice > 0) {
                                const summaryDiv = document.createElement('div');
                                summaryDiv.style.cssText = 'padding: 10px; background-color: #e8f5e8; border-radius: 5px; border: 1px solid #d4edda;';

                                let summaryHTML = `
                                    <div style="font-weight: bold; color: #155724; font-size: 1.1rem;">
                                        <i class="fa-light fa-calculator" style="margin-left: 5px;"></i>
                                        סה"כ הזמנה: ₪${totalPrice.toLocaleString('he-IL', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                    </div>
                                `;

                                summaryHTML += `
                                    <div style="font-size: 0.9rem; color: #6c757d; margin-top: 5px;">
                                        מחושב לפי ${itemsWithPrice.length} פריטים עם מחיר
                                    </div>
                                `;

                                summaryDiv.innerHTML = summaryHTML;
                                calculatorSection.appendChild(summaryDiv);
                                newCell.appendChild(calculatorSection);
                            }
                        }
                    } else { newCell.innerHTML += '<div class="text-center text-muted p-2">לא נמצאו פריטים.</div>'; }
                    newRow.appendChild(newCell);
                    updateButtonState(currentButton, true);
                    parentRow.after(newRow);
                    currentButton.blur(); // מסיר פוקוס מהכפתור כדי שמקשי חץ יעבדו על ה-side panel

                    // מונע מה-preview לקבל focus כדי לא להפריע לניווט המקורי של lionwheel
                    newRow.setAttribute('tabindex', '-1');
                    newRow.style.outline = 'none';

                    // מונע מה-preview לקבל focus דרך מקשי חץ
                    newRow.addEventListener('keydown', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        return false;
                    }, { passive: false });

                    // מונע מה-preview לקבל focus דרך לחיצה
                    newRow.addEventListener('mousedown', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        return false;
                    }, { passive: false });




                                  } catch (err) {
                    // Treat user-initiated aborts & navigations as expected; keep console clean
                    const msg = String(err?.message || '');
                    if (err?.name === 'AbortError' || /user aborted|The user aborted a request/i.test(msg)){
                      if (DEBUG) console.debug('[Toolbox] preview fetch aborted');
                    } else {
                      console.error('[Toolbox] Failed to fetch task preview:', err);
                    }
                    // במקרה של שגיאה, נקה את כל ה-classes וחזור למצב סגור
                    icon.classList.remove('fa-refresh', 'fa-spin');
                    icon.classList.add('fa-exclamation-triangle');
                    updateButtonState(currentButton, false);
                  } finally {
                    icon.classList.remove('fa-spin');
                    currentButton.disabled = false;

                  }
            }, { passive: false });
            row.setAttribute('data-preview-processed', 'true');
        });

        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Error injecting preview functionality:`, error);
        }

        // הפעלת Prefetch אוטומטי (hover + viewport)
        TM_PREVIEW.wireHoverPrefetch(document);
        TM_PREVIEW.wireViewportPrefetch(document);

        // Fix shipment wrapping after injecting preview functionality
        // fixShipmentWrapping(); // Removed for performance
    }
    // MODIFICATION END: This is where the correct injectPreviewFunctionality function ends.

    function addResponsiveDataAttributes(table) {
        try {
            if (!settings || !settings.enableResponsive || !table) return;

            // Clear old labels
            table.querySelectorAll('tbody td[data-label]').forEach(td => td.removeAttribute('data-label'));

            // קח את כל הכותרות כולל preview, ריקים ומוסתרים
            const allHeaders = Array.from(table.querySelectorAll('thead th'));

            table.querySelectorAll('tbody tr').forEach((row) => {
                const allCells = Array.from(row.querySelectorAll('td'));
                allCells.forEach((cell, i) => {
                    const header = allHeaders[i];
                    if (header) {
                        const label = header.textContent.trim();
                        if (label) {
                            cell.setAttribute('data-label', label);
                        }
                    }
                });
            });

            table.setAttribute('data-responsive-labels-added', 'true');

            // NEW: Also replace barcodes when adding responsive attributes
            if (settings && settings.replaceBarcodes) {
                replaceBarcodesInViews(table);
            }

            // NEW: Also highlight pick quantities after adding responsive attributes
            highlightPickQuantities();
        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Error adding responsive data attributes:`, error);
        }

        // Fix shipment wrapping after adding responsive data attributes
        // fixShipmentWrapping(); // Removed for performance
    }

    // MODIFICATION START: Updated tagColumnsForHiding to accept a scope parameter
    function tagColumnsForHiding(scope = document) { // Default scope is document
    // MODIFICATION END
        try {
            // Process main tables if the scope is the whole document or contains them
            if (scope === document) { // Only process main tables if the overall document is the target
            scope.querySelectorAll('#taskOverview table, #kt_content table').forEach(table => {
                // MODIFICATION START: Ensure empty TH (th.noVis.pt-2) is handled
                // We are NOT hiding it using tm-hideable-column anymore.
                // We are just making it small via its direct class in CSS.
                // This block is no longer needed here, as the CSS targets directly.
                /*
                const emptyHeaderTh = table.querySelector('th.noVis.pt-2.sorting_disabled[data-column-index="1"]');
                if (emptyHeaderTh) {
                    emptyHeaderTh.classList.add('tm-icon-column-header'); // This used to hide it.
                }
                */
                // MODIFICATION END

                if (table.hasAttribute('data-columns-tagged')) return; // Skip if main table already processed

                const headersToHide = ['סוג', 'משקל', 'נפח', 'הערות'];
                Array.from(table.querySelectorAll('thead th')).forEach((th, index) => {
                    if (headersToHide.includes(th.textContent.trim())) {
                        th.classList.add('tm-hideable-column');
                        table.querySelectorAll(`tbody tr td:nth-child(${index + 1})`).forEach(td => td.classList.add('tm-hideable-column'));
                    }
                });
                const historyHeader = table.querySelector('thead th:has(i.fa-history), thead th.w-50px');
                if(historyHeader) historyHeader.classList.add('tm-hideable-column');
                table.querySelectorAll('tbody td:has(i.order-item-history-json)').forEach(cell => cell.classList.add('tm-hideable-column'));
                table.setAttribute('data-columns-tagged', 'true'); // Mark main tables as tagged
                /* === Ensure programmatic focus without native outline === */
                table.classList.add('tm-focusable');
                if (!table.hasAttribute('tabindex')) table.setAttribute('tabindex','-1');
            });
        }

        // Process the modal form specifically (or any form within the given scope)
        const modalForm = scope.querySelector('form[id^="edit_task_"]');
        if (modalForm) { // Always process the modal form when called, to catch new rows
            const headersToHide = ['סוג', 'משקל', 'נפח', 'הערות'];
            const headerTitles = Array.from(modalForm.querySelectorAll('.order-item-header .order-item-header-title'));
            headerTitles.forEach((title) => {
                if (headersToHide.includes(title.textContent.trim())) {
                    title.classList.add('tm-hideable-column');
                }
            });
            // This is the crucial part for newly added rows:
            modalForm.querySelectorAll('.nested-fields.order-item-row').forEach(row => {
                // Ensure each row's inputs also get the hiding class
                headersToHide.forEach(headerText => {
                    // Find the corresponding input parent container
                    const targetInputParent = Array.from(row.querySelectorAll('.order-item-input')).find(inputDiv => {
                        const mobileHeader = inputDiv.querySelector('.mobile-size-header');
                        // Use the placeholder attribute to identify the input, as mobile-size-header might not always be there
                        const inputElement = inputDiv.querySelector('input');
                        return (mobileHeader && mobileHeader.textContent.trim() === headerText) ||
                               (inputElement && inputElement.getAttribute('placeholder') === headerText);
                    });
                    if (targetInputParent) {
                        targetInputParent.classList.add('tm-hideable-column');
                    }
                });
            });
            // Do NOT set data-columns-tagged on the modal form itself, as we want this to re-run for new rows.
        }
        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Error tagging columns for hiding:`, error);
        }

        // Fix shipment wrapping after tagging columns for hiding
        // fixShipmentWrapping(); // Removed for performance
    }
    // MODIFICATION END

function injectWhatsAppButtons() {
    try {
        if (!settings || !settings.addWhatsApp) return;

    const createWhatsAppLink = (phone, firstName) => {
        const numberForLink = `972${phone.replace(/\D/g, '').substring(1)}`;
        let href = `https://wa.me/${numberForLink}`;
        if (firstName) {
            const text = `שלום ${firstName}, זה מאניפט חוצות.`;
            href += `?text=${encodeURIComponent(text)}`;
        }
        const whatsappLink = document.createElement('a');
        whatsappLink.href = href;
        whatsappLink.target = 'whatsapp_window';
        whatsappLink.className = 'whatsapp-button';
        whatsappLink.title = 'שלח הודעה ב-WhatsApp';
        whatsappLink.innerHTML = '<i class="fa-brands fa-whatsapp"></i>'; // This icon is from FontAwesome, make sure it's loaded if needed
        whatsappLink.onclick = e => e.stopPropagation();
        return whatsappLink;
    };
    const findFirstName = (container) => {
        if (!container) return null;
        const nameEl = container.querySelector('[data-name="destination_recipient_name"] .hover-copy, a[href*="/crm/"], td[data-label="שם"]');
        if (nameEl && nameEl.textContent.trim()) {
            const fullName = nameEl.textContent.trim();
            const validNameRegex = /^[a-zA-Z\u0590-\u05FF\s]+$/;
            if (!validNameRegex.test(fullName) || fullName.startsWith('PA_') || fullName.startsWith('CU_')) {
                return null;
            }
            return fullName.split(' ')[0];
        }
        return null;
    };
    const prefixes = ['050', '051', '052', '053', '054', '055', '056', '058', '059'];
    const phoneRegex = new RegExp(`(^|[^\\d])(${prefixes.join('|')})[\\s-]?\\d{3}[\\s-]?\\d{4}\\b`, 'g');
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: node => (node.parentElement.closest('a, button, script, style, .whatsapp-injected') || node.nodeValue.trim().length < 9) ? NodeFilter.REJECT : (phoneRegex.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.REJECT) });
    const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(textNode => {
        const parent = textNode.parentNode;
        if (parent.closest('.whatsapp-injected')) return;
        const scope = parent.closest('.card, tr, .panel_view, .px-3');
        const firstName = findFirstName(scope);
        let lastIndex = 0;
        const fragment = document.createDocumentFragment();
        textNode.nodeValue.replace(phoneRegex, (match, p1, p2, offset) => {
            const phoneText = match.substring(p1.length);
            if(offset > lastIndex) fragment.appendChild(document.createTextNode(textNode.nodeValue.substring(lastIndex, offset + p1.length)));
            const phoneSpan = document.createElement('span');
            phoneSpan.className = 'whatsapp-injected';
            phoneSpan.appendChild(createWhatsAppLink(phoneText, firstName));
            phoneSpan.appendChild(document.createTextNode(" " + phoneText));
            fragment.appendChild(phoneSpan);
            lastIndex = offset + match.length;
        });
        if (lastIndex > 0) {
            if (lastIndex < textNode.nodeValue.length) fragment.appendChild(document.createTextNode(textNode.nodeValue.substring(lastIndex)));
            parent.replaceChild(fragment, textNode);
        }
    });
        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Error injecting WhatsApp buttons:`, error);
        }

        // Fix shipment wrapping after injecting WhatsApp buttons
        // fixShipmentWrapping(); // Removed for performance
}


// ---< Global Styles >---

function initializeSidePanelResizeObserver() {
  try {
    (function () {
      // CONFIG
      const PANEL_SELECTOR = '.offcanvas.offcanvas-right.offcanvas-custom.resizable';
      const GAP_BUFFER_PX = 20; // reduced buffer to prevent premature breaking

      const root = document.documentElement;

      function measurePanelWidth() {
        // Try the specific selector first
        let panel = document.querySelector(PANEL_SELECTOR);

        // If not found, try finding via desktop-map-container (fallback)
        if (!panel) {
          const container = document.getElementById('desktop-map-container');
          if (container) {
            panel = container.closest('.offcanvas') || container;
          }
        }

        if (!panel) return 0;

        const rect = panel.getBoundingClientRect();

        // Check if panel is actually visible and has dimensions
        if (rect.width <= 0 || rect.height <= 0) return 0;

        return Math.max(0, Math.round(rect.width)); // integer px
      }

      function applyGapVars() {
        const gap = measurePanelWidth();
        const screenWidth = window.innerWidth;

        // Much smaller buffer to prevent premature breaking
        let dynamicBuffer = 20; // Reduced from 50
        if (screenWidth >= 1600) {
          dynamicBuffer = 30; // Reduced from 80
        } else if (screenWidth >= 1200) {
          dynamicBuffer = 25; // Reduced from 60
        } else if (screenWidth >= 768) {
          dynamicBuffer = 20; // Reduced from 40
        }

        root.style.setProperty('--map-gap', `${gap}px`);
        root.style.setProperty('--map-gap-buffered', `${gap + dynamicBuffer}px`);
      }

      // Initial apply
      applyGapVars();

      // Also apply after a short delay to ensure all elements are loaded
      setTimeout(applyGapVars, 500);

      // Apply again after DOM is fully loaded
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
          setTimeout(applyGapVars, 100);
          // Fix shipment number wrapping immediately
          // fixShipmentWrapping(); // Removed for performance
        });
      }

      // Re-apply on window resize
      window.addEventListener('resize', applyGapVars, { passive: true });

      // Also re-apply when screen orientation changes
      window.addEventListener('orientationchange', () => {
        setTimeout(applyGapVars, 100); // Small delay to ensure orientation change is complete
      });

      // Re-apply on panel resize (live drag)
      const panel = document.querySelector(PANEL_SELECTOR) ||
                   document.getElementById('desktop-map-container')?.closest('.offcanvas');
      if (panel) {
        const ro = new ResizeObserver(() => applyGapVars());
        ro.observe(panel);
      }

      // Optional: if the preview rows are injected later, re-apply when they appear
      const mo = new MutationObserver(() => applyGapVars());
      if (document.body) {
        mo.observe(document.body, { childList: true, subtree: true });
      }

      // Monitor for map panel visibility changes
      const mapObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'attributes' &&
              (mutation.attributeName === 'class' || mutation.attributeName === 'style')) {
            const target = mutation.target;
            if (target.matches && target.matches('.offcanvas, .offcanvas-right, .offcanvas-custom')) {
              setTimeout(applyGapVars, 50); // Small delay to ensure DOM is updated
            }
          }
        });
      });

      // Observe the map panel for class/style changes
      const mapPanel = document.querySelector(PANEL_SELECTOR) ||
                      document.getElementById('desktop-map-container')?.closest('.offcanvas');
      if (mapPanel) {
        mapObserver.observe(mapPanel, {
          attributes: true,
          attributeFilter: ['class', 'style']
        });
      }

      // Monitor for map toggle buttons
      document.addEventListener('click', (e) => {
        const target = e.target;
        if (target.matches && (
          target.matches('[data-bs-toggle="offcanvas"]') ||
          target.matches('[data-toggle="offcanvas"]') ||
          target.closest('[data-bs-toggle="offcanvas"]') ||
          target.closest('[data-toggle="offcanvas"]') ||
          target.matches('.btn-map') ||
          target.closest('.btn-map')
        )) {
          setTimeout(applyGapVars, 100); // Delay to allow offcanvas to open/close
        }
      });

      // Monitor for offcanvas events
      document.addEventListener('shown.bs.offcanvas', applyGapVars);
      document.addEventListener('hidden.bs.offcanvas', applyGapVars);

      // Monitor for side panel events to add links and copy icons
      document.addEventListener('shown.bs.offcanvas', () => {
        setTimeout(() => addClickableLinksToAllTables(), 100);
      });
      document.addEventListener('shown.bs.modal', () => {
        setTimeout(() => addClickableLinksToAllTables(), 100);
      });

      // Periodic check for map panel changes (fallback) - using idle callback for better performance
      const debouncedPanelCheck = debounce(() => {
        scheduleIdleWork(() => {
          const currentGap = measurePanelWidth();
          const currentGapVar = parseInt(getComputedStyle(root).getPropertyValue('--map-gap')) || 0;
          if (Math.abs(currentGap - currentGapVar) > 10) { // Only update if difference is significant
            applyGapVars();
          }
        });
      }, 2000);

      // Start periodic checking
      const startPeriodicCheck = () => {
        debouncedPanelCheck();
        setTimeout(startPeriodicCheck, 2000);
      };
      startPeriodicCheck();

      // Debug logging (only in development)
      if (window.DEBUG_TOOLBOX) {
        console.log('[Toolbox] Side panel resize observer initialized');
        console.log('[Toolbox] Initial map gap:', measurePanelWidth(), 'px');
      }
    })();
  } catch (err) {
    console.error('[Toolbox] Error initializing side panel ResizeObserver:', err);
  }

  // Fix shipment wrapping after initializing side panel resize observer
  // fixShipmentWrapping(); // Removed for performance - will be called by main logic
}

// fixShipmentWrapping function moved to top of file to avoid ReferenceError

function injectGlobalStyles() {
        try {
        if (document.getElementById('tampermonkey-styles')) return;
    const css = `

    .whatsapp-injected, a.whatsapp-injected { display: inline-flex !important; align-items: center; white-space: nowrap; vertical-align: middle; }
.whatsapp-button i { font-size: 1.6em; height: 30px; line-height: 30px; color: #3699ff !important; transition: color 0.2s ease-in-out; margin-left: 5px; }
.whatsapp-button:hover i { color: #0073e9 !important; }

    .lwh-whatsapp-button {
    display: inline-block;
    margin-left: 6px;
    background-color: #25D366;
    color: white;
    border-radius: 4px;
    padding: 2px 5px;
    font-size: 12px;
    text-decoration: none;
}
.lwh-whatsapp-button:hover {
    background-color: #1ebe5d;
}

tr[id^="preview-for-"] td div.font-weight-bold.copy-enabled {
    color: #505050;
}

/* Enhanced Gallery Styles */
.gallery-sku {
    font-size: 1em;
    color: #ccc;
    margin: 0;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.4); /* Subtle raised effect */
}

.gallery-price {
    font-size: 1.1em;
    color: #ccc;
    font-weight: bold;
    margin: 0;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.4); /* Subtle raised effect */
}

.gallery-product-link {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: #3699ff;
    text-decoration: none;
    font-size: 0.9em;
    margin-top: 5px;
    padding: 5px 10px;
    border: 1px solid #3699ff;
    border-radius: 4px;
    transition: all 0.3s ease;
}

.gallery-product-link:hover {
    background-color: #3699ff;
    color: white;
    text-decoration: none;
}

.gallery-counter {
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 1.05em;
    text-align: center;
    color: inherit;
    margin: 0;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.4); /* Subtle raised effect */
}

/* Gallery-specific picked status indicators with raised effect */
.gallery-counter .tampermonkey-picked-none,
.gallery-counter .tampermonkey-picked-partial,
.gallery-counter .tampermonkey-picked-full {
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.4); /* Subtle raised effect */
}

/* Loading Indicator */
.gallery-loading {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 5;
}

.gallery-spinner {
    width: 40px;
    height: 40px;
    border: 4px solid rgba(255, 255, 255, 0.3);
    border-top: 4px solid #3699ff;
    border-radius: 50%;
    animation: spin 1s linear infinite;
}

@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}

/* Image Container with Zoom Support */
.gallery-image-container {
    position: relative;
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100vh; /* Full viewport height for maximum image display */
    max-height: 100vh;
    overflow: hidden;
    cursor: zoom-in;
    touch-action: pan-x pan-y pinch-zoom; /* Allow pan and pinch-zoom, but prevent other gestures */
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
    user-select: none;
}

.gallery-image-container img {
    transition: opacity 0.3s ease, transform 0.3s ease;
    cursor: zoom-in;
    touch-action: pan-x pan-y pinch-zoom; /* Allow pan and pinch-zoom, but prevent other gestures */
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
    user-select: none;
    width: 100%;
    height: 100%;
    object-fit: contain;
    object-position: center;
}

.gallery-image-container.zoomed img {
    cursor: move;
}

/* Touch feedback for pinch-to-zoom */
.gallery-image-container.zoomed::after {
    content: "\f002";
    font-family: "Font Awesome 6 Pro", "Font Awesome 6 Free", "FontAwesome";
    font-weight: 300;
    position: absolute;
    top: 10px;
    right: 10px;
    background: rgba(0, 0, 0, 0.7);
    color: white;
    padding: 5px 8px;
    border-radius: 4px;
    font-size: 12px;
    z-index: 10;
    pointer-events: none;
}

/* Prevent text selection during touch interactions */
.gallery-image-container * {
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    -khtml-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
    user-select: none;
}

/* Zoom Controls */
.gallery-zoom {
    position: absolute;
    top: 60px;
    background: rgba(0, 0, 0, 0.7);
    color: white;
    border: none;
    border-radius: 4px;
    padding: 8px 12px;
    font-size: 16px;
    cursor: pointer;
    transition: background 0.3s ease;
    z-index: 20;
}

.gallery-zoom:hover {
    background: rgba(0, 0, 0, 0.9);
}

.gallery-zoom:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.gallery-zoom.zoom-in {
    right: 80px;
}

.gallery-zoom.zoom-out {
    right: 120px;
}

.gallery-zoom.reset-zoom {
    right: 160px;
}

/* Thumbnails instead of dots */
.gallery-thumbnails {
    position: relative;
    display: flex;
    gap: 8px;
    max-width: 80vw;
    overflow-x: auto;
    padding: 10px;
    background: rgba(0, 0, 0, 0.7);
    border-radius: 12px;
    margin: 0 auto;
    justify-content: center;
    box-sizing: border-box;
}

.gallery-thumbnail {
    width: 60px;
    height: 60px;
    border: 2px solid transparent;
    border-radius: 8px;
    overflow: hidden;
    cursor: pointer;
    transition: all 0.3s ease;
    flex-shrink: 0;
    touch-action: manipulation; /* Ensure thumbnails work properly on touch devices */
}

.gallery-thumbnail:hover {
    border-color: #3699ff;
    transform: scale(1.05);
}

.gallery-thumbnail.active {
    border-color: #3699ff;
    box-shadow: 0 0 10px rgba(54, 153, 255, 0.5);
}

.gallery-thumbnail img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.3s ease;
    border-radius: 8px;
}

.gallery-thumbnail:hover img {
    transform: scale(1.1);
}

/* Enhanced Caption */
.gallery-caption {
    position: relative;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    text-align: center;
    color: #fff;
    background: transparent;
    padding: 15px 20px;
    border-radius: 0;
    box-sizing: border-box;
    min-height: 40px; /* Reduced height to minimize dead space */
    flex-shrink: 0;
}

/* Guard against external scripts overriding caption positioning */
#tampermonkey-gallery-overlay .gallery-caption {
    position: relative !important;
    left: auto !important;
    right: auto !important;
    bottom: auto !important;
    z-index: 2;
}

/* Footer container for caption and thumbnails */
.gallery-footer {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 10px;
    flex-shrink: 0;
    background: transparent;
    min-height: 0;
    box-sizing: border-box;
}

/* Top info container */
.gallery-top-info {
    padding: 12px;
    background: transparent;
    color: #fff;
    border-bottom: none;
    flex-shrink: 0;
    box-sizing: border-box;
}



/* Enhanced Navigation Buttons */
.gallery-nav {
    transition: all 0.3s ease;
}

.gallery-nav:hover {
    background: rgba(0, 0, 0, 0.8) !important;
}

/* Smooth Transitions */
#tampermonkey-gallery-overlay {
    transition: opacity 0.3s ease;
}

/* Responsive Design for Thumbnails */
@media (max-width: 768px) {
    .gallery-thumbnails {
        max-width: 90vw;
        gap: 4px;
        padding: 8px;
    }

    .gallery-thumbnail {
        width: 50px;
        height: 50px;
    }

    .gallery-caption {
        padding: 10px 15px;
        font-size: 14px;
    }

    .gallery-footer {
        padding: 8px;
        gap: 8px;
    }

    .gallery-top-info {
        padding: 8px;
    }

    .gallery-image-container {
        padding: 12px;
    }


}

.tampermonkey-picked-none {
    color: #ff0000 !important;
    font-weight: bold;
}

.tampermonkey-picked-partial {
    color: #FFA500 !important;
    font-weight: bold;
}

.tampermonkey-picked-full {
    color: #008000 !important;
    font-weight: bold;
}



                /* Stronger selector for hover */
            td.copy-enabled:hover,
            div.copy-enabled:hover,
            span.copy-enabled:hover,
            strong.copy-enabled:hover {
            background-color: #F5FAFF !important;
}


table td.sorting_1.copy-enabled.cell-copied {
    background-color: #CDE5FF !important;
}

td.copy-enabled.cell-copied {
    background-color: #CDE5FF !important;
}

/* Ensure text color change works for copy-enabled elements */
.copy-enabled.cell-copied {
    transition: color 0.3s ease, background-color 0.3s ease;
}

/* Ensure text color change works for all elements with copy-enabled */
.copy-enabled.cell-copied,
span.copy-enabled.cell-copied,
div.copy-enabled.cell-copied,
strong.copy-enabled.cell-copied,
.barcode-highlight.copy-enabled.cell-copied,
.barcode-highlight-gallery.copy-enabled.cell-copied {
    transition: color 0.3s ease, background-color 0.3s ease;
}

/* Override barcode-highlight color when copied */
.pick-order-item-table .barcode-highlight.copy-enabled.cell-copied {
    color: #3699ff !important;
}

/* Ensure all copy-enabled elements have copy cursor */
.copy-enabled,
span.copy-enabled,
div.copy-enabled,
strong.copy-enabled,
td.copy-enabled,
.barcode-highlight.copy-enabled,
.barcode-highlight-gallery.copy-enabled,
.pick-order-item-table .barcode-highlight.copy-enabled {
    cursor: url("https://raw.githubusercontent.com/AdamLee9186/anipet/957e3a08c7d518fcc5c469a2877136139ad0519f/cursor_copy_32.png") 0 0, copy !important;
}

td.copy-enabled {
    cursor: url("https://raw.githubusercontent.com/AdamLee9186/anipet/957e3a08c7d518fcc5c469a2877136139ad0519f/cursor_copy_32.png") 0 0, copy !important;
    transition: background-color 0.3s ease;
}

td.copy-enabled:hover {
    background-color: #F5FAFF !important;
}

/* Prevent blue hover on quantity/לוקט cells even if copy-enabled is accidentally added */
td.copy-enabled[data-label="כמות / לוקט"]:hover,
td.copy-enabled[data-label="כמות / לוקט"]:active {
    background-color: transparent !important;
}

td.copy-enabled.cell-copied {
    background-color: #CDE5FF !important;
}


        .copy-enabled {
            cursor: url("https://raw.githubusercontent.com/AdamLee9186/anipet/957e3a08c7d518fcc5c469a2877136139ad0519f/cursor_copy_32.png") 0 0, copy !important;
            transition: background-color 0.3s ease;
        }
            tr[id^="visit-row-"] td.copy-enabled:hover {
            background-color: rgba(225, 240, 255, 0.5) !important;
            transition: background-color 0.2s ease;
}

        /* MODIFICATION START: Explicitly set width/padding for th.noVis.pt-2 and td.noVis.pt-2 */
        th.noVis.pt-2.sorting_disabled[data-column-index="1"],
        td.noVis.pt-2 {
            width: 25px !important;
            min-width: 25px !important;
            max-width: 25px !important;
            padding: 0 !important;
            text-align: center !important;
            box-sizing: border-box !important;
            overflow: visible !important;
        }
        th.noVis.pt-2.sorting_disabled[data-column-index="1"] {
            display: table-cell !important;
        }

        #scriptStatusNotifier {
            position: fixed; top: 10px; right: 10px; z-index: 10000;
            background-color: #fff; padding: 8px 12px; border: 1px solid #ccc;
            border-radius: 5px; font-size: 12px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);
            opacity: 0; transition: opacity 0.5s ease-in-out;
        }

        .barcode-highlight {
            color: #006400 !important;
            font-weight: normal;  /* רק 3 הספרות האחרונות יודגשו בקוד, לא כולו */
            cursor: help;
            transition: all 0.3s ease;
            animation: barcodeReplacement 0.5s ease-in-out;
        }
        .barcode-highlight.copy-enabled {
            cursor: url("https://raw.githubusercontent.com/AdamLee9186/anipet/957e3a08c7d518fcc5c469a2877136139ad0519f/cursor_copy_32.png") 0 0, copy !important;
        }
        .barcode-highlight-gallery {
            color: #90ee90 !important;
            font-weight: bold;
            cursor: help;
            transition: all 0.3s ease;
            animation: barcodeReplacement 0.5s ease-in-out;
        }
        .barcode-highlight-gallery.copy-enabled {
            cursor: url("https://raw.githubusercontent.com/AdamLee9186/anipet/957e3a08c7d518fcc5c469a2877136139ad0519f/cursor_copy_32.png") 0 0, copy !important;
        }
        /* Keep green bg only for table cells; NOT inside Preview rows */
        td.barcode-highlight {
            background-color: #e6ffed;
            padding: 2px 4px;
            border-radius: 3px;
            transition: all 0.3s ease;
            animation: barcodeReplacement 0.5s ease-in-out;
        }

        /* PREVIEW: never paint background behind the barcode text */
        tr[id^="preview-for-"] .barcode-highlight {
            background-color: transparent !important;
            padding: 0 !important;
            border-radius: 0 !important;
            animation: none !important;
            color: inherit !important; /* ביטול צבע ירוק בפריוויו */
        }
        /* בפריוויו: 3 הספרות האחרונות של הברקוד בצבע שחור */
        tr[id^="preview-for-"] .barcode-highlight b {
            color: #000000 !important;
        }

        .pick-order-item-row .barcode-highlight { background-color: transparent !important; }
        /* Special handling for picking modal - prevent background color on the entire row */
        .pick-order-item-table .pick-order-item-row.barcode-highlight {
            background-color: transparent !important;
        }
        .pick-order-item-table .pick-order-item-row.barcode-highlight .barcode-highlight {
            background-color: #e6ffed !important;
            padding: 2px 4px !important;
            border-radius: 3px !important;
            transition: all 0.3s ease;
            animation: barcodeReplacement 0.5s ease-in-out;
        }
        /* Ensure barcode text in picking modal has proper styling */
        .pick-order-item-table .barcode-highlight {
            color: #006400 !important;
            font-weight: normal !important;  /* הדגשה רק ל-3 ספרות אחרונות */
            cursor: help !important;
            transition: all 0.3s ease;
            animation: barcodeReplacement 0.5s ease-in-out;
        }
        .pick-order-item-table .barcode-highlight.copy-enabled {
            cursor: url("https://raw.githubusercontent.com/AdamLee9186/anipet/957e3a08c7d518fcc5c469a2877136139ad0519f/cursor_copy_32.png") 0 0, copy !important;
        }
        .barcode-input-highlight {
            background-color: #e6ffed !important;
            color: #006400 !important;
            font-weight: bold;
            transition: all 0.3s ease;
            animation: barcodeReplacement 0.5s ease-in-out;
        }

        /* Barcode replacement animation */
        @keyframes barcodeReplacement {
            0% {
                opacity: 0.5;
                transform: scale(0.95);
            }
            100% {
                opacity: 1;
                transform: scale(1);
            }
        }

        /* Hover effects for barcode elements */
        .barcode-highlight:hover,
        .barcode-highlight-gallery:hover,
        .barcode-input-highlight:hover {
            background-color: #d4edda !important;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        /* PREVIEW: also cancel hover bg so it won't overlap the title */
        tr[id^="preview-for-"] .barcode-highlight:hover {
            background-color: transparent !important;
            box-shadow: none !important;
            color: inherit !important; /* גם בהובר — נשאר צבע טקסט רגיל */
        }

        #tampermonkey-gallery-overlay {
            position:fixed;top:0;left:0;width:100%;height:100%;
            background:rgba(0,0,0,.88);display:flex;flex-direction:column;justify-content:flex-start;align-items:stretch;padding:0;
            z-index:20000;opacity:0;transition:opacity .3s ease;box-sizing:border-box;overflow:hidden
        }
.gallery-image-container {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    position: relative;
    overflow: hidden;
    z-index: 1;
    flex: 1;
    padding: 16px;
    border-radius: 12px;
    min-height: 0; /* Important for flex child */
    box-sizing: border-box;
}

#tampermonkey-gallery-overlay img {
    display: block;
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    object-position: center;
    border-radius: 12px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
    transition: transform 0.1s ease-out;
    overflow: hidden;
}

.gallery-image-container.zoomed {
    cursor: grab;
    user-select: none;
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
}

.gallery-image-container.zoomed:active {
    cursor: grabbing;
}




.gallery-product-name {
    position: relative;
    font-size: 1.5em;
    font-weight: bold;
    color: white;
    text-align: center;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
    z-index: 10;
    padding: 6px 12px;
    background: transparent;
    border-top-left-radius: 8px;
    border-top-right-radius: 8px;
    box-sizing: border-box;
    margin: 0;
    width: 100%;
    flex-shrink: 0;
}

/* Product name link styles for tables and gallery */
td[data-label="שם"] a,
.gallery-product-name a {
    text-decoration: none;
}

td[data-label="שם"] a:hover,
.gallery-product-name a:hover {
    text-decoration: underline;
}

.fa-light.fa-clone,
.fa-light.fa-check {
    font-size: 0.9em;
    vertical-align: middle;
    transition: color 0.2s ease;
}

/* Ensure copy icons are positioned correctly for tooltips */
.fa-light.fa-clone,
.fa-light.fa-check {
    position: relative;
}

/* Copy icons positioning - inline with text */
.copy-icon-left {
    display: inline !important;
    vertical-align: middle !important;
}

/* Simple positioning for barcode cells - keep natural table flow */
td[data-label="מק״ט"], td[data-label="ברקוד"] {
    white-space: nowrap !important;
}

td[data-label="מק״ט"] .fa-light.fa-clone,
td[data-label="מק״ט"] .fa-light.fa-check,
td[data-label="ברקוד"] .fa-light.fa-clone,
td[data-label="ברקוד"] .fa-light.fa-check {
    margin-left: 4px !important;
    margin-right: 0px !important;
    font-size: 0.85em;
}

/* Simple positioning for product name cells - keep natural table flow */
td[data-label="שם"] {
    text-align: right !important;
}

/* שמירת ריווח סביב אייקון חיפוש תמונות של גוגל */
td[data-label="שם"] .google-image-icon{ margin-inline-end:6px; }
.tampermonkey-copy-wrap .copy-icon{ margin-inline-start:6px; }

td[data-label="שם"] .fa-light.fa-clone,
td[data-label="שם"] .fa-light.fa-check {
    float: left !important; /* Float to the left (end of RTL text) */
    margin-left: 0px !important;
    margin-right: 4px !important;
    font-size: 0.85em;
}

/* עטיפה אחידה לטקסט+אייקון, כמו בטבלה */
.tampermonkey-copy-wrap{display:inline-flex;align-items:center;gap:4px;unicode-bidi:plaintext}
/* תאי ברקוד - לא לשבור שורות */
td[data-label="מק״ט"] .tampermonkey-copy-wrap, td[data-label="ברקוד"] .tampermonkey-copy-wrap{white-space:nowrap}
/* תאי שם - לאפשר שבירת שורות */
td[data-label="שם"] .tampermonkey-copy-wrap{white-space:normal;word-wrap:break-word}
/* וידוא שתאי השם יכולים להישבר לשורות */
td[data-label="שם"]{white-space:normal;word-wrap:break-word;word-break:break-word}
/* וידוא שהקישורים בתאי השם יכולים להישבר לשורות */
td[data-label="שם"] a{white-space:normal;word-wrap:break-word;word-break:break-word}
/* וידוא שה-BDI של השם יכול להישבר לשורות */
td[data-label="שם"] .tampermonkey-name-bdi{white-space:normal;word-wrap:break-word;word-break:break-word}
/* וידוא שכל תאי השם בטבלאות יכולים להישבר לשורות */
table td[data-label="שם"]{white-space:normal;word-wrap:break-word;word-break:break-word}
/* וידוא שהקישורים בטבלאות יכולים להישבר לשורות */
table td[data-label="שם"] a{white-space:normal;word-wrap:break-word;word-break:break-word}
/* וידוא שהטקסט הרגיל בטבלאות יכול להישבר לשורות */
table td[data-label="שם"] span{white-space:normal;word-wrap:break-word;word-break:break-word}
/* וידוא שהטקסט הרגיל בטבלאות יכול להישבר לשורות */
table td[data-label="שם"] bdi{white-space:normal;word-wrap:break-word;word-break:break-word}
/* וידוא שהטקסט הרגיל בטבלאות יכול להישבר לשורות */
table td[data-label="שם"] strong{white-space:normal;word-wrap:break-word;word-break:break-word}
/* וידוא שהטקסט הרגיל בטבלאות יכול להישבר לשורות */
table td[data-label="שם"] b{white-space:normal;word-wrap:break-word;word-break:break-word}
/* וידוא שהטקסט הרגיל בטבלאות יכול להישבר לשורות */
table td[data-label="שם"] div{white-space:normal;word-wrap:break-word;word-break:break-word}
/* וידוא שהטקסט הרגיל בטבלאות יכול להישבר לשורות */
table td[data-label="שם"] p{white-space:normal;word-wrap:break-word;word-break:break-word}
/* וידוא שהטקסט הרגיל בטבלאות יכול להישבר לשורות */
table td[data-label="שם"] i{white-space:normal;word-wrap:break-word;word-break:break-word}
/* וידוא שהטקסט הרגיל בטבלאות יכול להישבר לשורות */
table td[data-label="שם"] em{white-space:normal;word-wrap:break-word;word-break:break-word}
/* וידוא שהטקסט הרגיל בטבלאות יכול להישבר לשורות */
table td[data-label="שם"] u{white-space:normal;word-wrap:break-word;word-break:break-word}
/* מניעת שבירת שורות בטבלת ביקורי חנות */
#operator-store-visits-table_wrapper table td[data-label="שם"],
#operator-store-visits-table_wrapper table td:nth-child(12),
#operator-store-visits-table_wrapper table td[data-label="שם"] *,
#operator-store-visits-table_wrapper table td:nth-child(12) *{white-space:nowrap !important;word-wrap:normal !important;word-break:normal !important}
.gallery-barcode-bdi{direction:ltr;unicode-bidi:plaintext}
/* בגלריה: 3 הספרות האחרונות של הברקוד בצבע לבן */
.gallery-barcode-bdi b{color:#ffffff !important}
.gallery-name-bdi{direction:auto;unicode-bidi:plaintext}
.gallery-product-name .fa-light.fa-clone{font-size:.85em;cursor:pointer;color:#3699ff}
.gallery-product-info .fa-light.fa-clone{margin-left:4px;margin-right:0;cursor:pointer;color:#3699ff}
.gallery-product-name .fa-light.fa-clone:hover{color:#0073e9}
.gallery-product-info .fa-light.fa-clone:hover{color:#0073e9}

/* Gallery SKU line: תן לכיווניות להיגזר מהתוכן; נבודד את הספרות עם BDI */
.gallery-product-info {
    text-align: center;
    position: relative !important;
    margin: 10px 0;
    padding: 4px 8px;
    background: transparent;
    color: white;
}

.gallery-product-info .fa-light.fa-clone,
.gallery-product-info .fa-light.fa-check {
    margin-left: 4px !important;
    margin-right: 0px !important;
}

.gallery-sku, .gallery-price {
    font-size: 1.1em;
    font-weight: normal;
    margin: 0;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.9);
}

.gallery-product-link {
    position: absolute;
    top: 8px;
    right: 8px;
    background: rgba(0,0,0,0.6);
    color: #fff;
    padding: 6px;
    border-radius: 50%;
    text-decoration: none;
    z-index: 20;
    transition: all 0.3s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    box-sizing: border-box;
    font-size: 14px;
    font-weight: bold;
}

.gallery-product-link:hover {
    background: rgba(0, 0, 0, 0.9);
    transform: scale(1.1);
}

/* Gallery product link removed - using link in title instead */

.gallery-product-link i {
    font-size: 16px;
}



        .gallery-close, .gallery-nav {
            position:absolute;background:rgba(0,0,0,.3);color:#fff;border:none;
            cursor:pointer;font-weight:700;transition:background .2s ease;
            user-select:none;border-radius:8px;z-index:5;
            touch-action: manipulation; /* Ensure buttons work properly on touch devices */
        }
        .gallery-close:hover, .gallery-nav:hover { background:rgba(0,0,0,.6) }
        .gallery-close {
            top:10px;right:15px;font-size:48px;padding:0 15px;line-height:1;z-index:10
        }
        .gallery-nav {
            top:50%;transform:translateY(-50%);font-size:40px;padding:5px 20px
        }
        .gallery-nav.prev { right:15px }
        .gallery-nav.next { left:15px }

        /* Report Button */
        .gallery-report {
            position: absolute;
            top: 10px;
            right: 80px;
            background: rgba(255, 193, 7, 0.9);
            color: #000;
            border: none;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            font-size: 16px;
            cursor: pointer;
            transition: all 0.3s ease;
            z-index: 10;
            display: flex;
            align-items: center;
            justify-content: center;
            user-select: none;
            touch-action: manipulation;
        }

        .gallery-report:hover {
            background: rgba(255, 193, 7, 1);
            transform: scale(1.1);
        }

        .gallery-report:active {
            transform: scale(0.95);
        }


        .preview-cell {
            background-color: inherit !important;
            text-align: center !important;
        }
        .preview-cell button i { transition:transform .2s ease-in-out }

        .preview-toggle-all-button {
            transition: background-color 0.15s ease, color 0.15s ease;
        }
        .preview-toggle-all-button:hover {
            background-color: #3699ff !important;
            color: #ffffff !important;
        }
        .preview-toggle-all-button i { margin: 0 !important; }

        .preview-notes {
            background-color: #fff3cd !important; color: #8f6304;
            padding: 10px; margin-bottom: 10px; border-radius: 4px;
            border: 1px solid #ffeb3b;
        }
        .preview-notes i {
            margin-left: 5px;
            margin-right: 8px;
            color: #dd9803;
        }

        /* Minimized preview icons styles */
        .preview-minimized-icons {
            display: flex;
            gap: 8px;
            margin-bottom: 10px;
        }

        .preview-icon-btn {
            width: 32px !important;
            height: 32px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            border-radius: 6px !important;
            transition: all 0.2s ease-in-out !important;
            background-color: #f8f9fa !important;
            border: 1px solid #dee2e6 !important;
            color: #6c757d !important;
        }

        .preview-icon-btn:hover {
            background-color: #e9ecef !important;
            border-color: #adb5bd !important;
            color: #495057 !important;
            transform: scale(1.05);
        }

        .preview-icon-btn.active {
            background-color: #007bff !important;
            border-color: #007bff !important;
            color: #ffffff !important;
        }

        .preview-icon-btn.active:hover {
            background-color: #0056b3 !important;
            border-color: #0056b3 !important;
        }

        .preview-section {
            margin-bottom: 10px;
            animation: slideDown 0.3s ease-out;
        }

        @keyframes slideDown {
            from {
                opacity: 0;
                transform: translateY(-10px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .btn-group.btn-group-sm.m-1:has(#expand-all-btn),
        a#expand-all-btn {
            display: none !important;
        }

        body.tampermonkey-hide-columns-enabled .tm-hideable-column {
            display: none !important;
        }

        @media (min-width:768px){
            body.tampermonkey-hide-columns-enabled #order-items-edit-modal .modal-dialog {
                max-width: 850px !important;
            }
            body.tampermonkey-hide-columns-enabled #order-items-edit-modal .order-item-input.order-item-big,
            body.tampermonkey-hide-columns-enabled #order-items-edit-modal .order-item-header-title.order-item-big {
                width: calc(55% - 1rem) !important;
            }
            body.tampermonkey-hide-columns-enabled #order-items-edit-modal .order-item-input:has(input.order-item-sku),
            body.tampermonkey-hide-columns-enabled #order-items-edit-modal .order-item-header-title:not(.order-item-big):not(.order-item-small):not(.tampermonkey-image-header) {
                width: calc(25% - 1rem) !important;
            }
            body.tampermonkey-hide-columns-enabled #order-items-edit-modal .order-item-input.order-item-small,
            body.tampermonkey-hide-columns-enabled #order-items-edit-modal .order-item-header-title.order-item-small {
                width: calc(10% - 1rem) !important;
            }
        }

@media (max-width: 767px) {
  body.tampermonkey-responsive-enabled .table-responsive { overflow-x:hidden!important; }
  body.tampermonkey-responsive-enabled .table-responsive>.table { border:0 }
  body.tampermonkey-responsive-enabled .table-responsive thead { display:none }
  body.tampermonkey-responsive-enabled .table-responsive tr {
      display:block; border:1px solid #dee2e6;
      border-radius:.35rem; margin-bottom:1rem; background-color:#fff
  }
  body.tampermonkey-responsive-enabled .table-responsive td {
      display:block; text-align:right; padding:.75rem 1rem!important;
      border-bottom:1px solid #eee
  }
  body.tampermonkey-responsive-enabled .table-responsive td:last-child {
    border-bottom: 0;
  }
  body.tampermonkey-responsive-enabled .table-responsive td[data-label]::before {
      content: attr(data-label);
      display: block;
      font-weight: 700;
      color: #5e6278;
      font-size: .9em;
      margin-bottom: .3rem;
  }
  body.tampermonkey-responsive-enabled .table-responsive td[data-label="סוג"],
  body.tampermonkey-responsive-enabled .table-responsive td[data-label="משקל"],
  body.tampermonkey-responsive-enabled .table-responsive td[data-label="נפח"],
  body.tampermonkey-responsive-enabled .table-responsive td[data-label="הערות"] {
      display: none !important;
  }
} /* ← פה סוגרים את ה־@media */

/* Unified style for PREVIEW column */
#operator-store-visits-table th.preview-col,
#operator-store-visits-table td.preview-cell {
  text-align: center;
  padding: 0.25rem;
}

/* ===== OPTIMIZED FIX: prevent shipment number wrapping ===== */
/* Use CSS classes for better performance instead of inline styles */
.shipment-no-wrap {
  white-space: nowrap !important;
  word-wrap: normal !important;
  word-break: normal !important;
}

/* ===== FIX: prevent shipment number wrapping ===== */
/* Scope narrowly to the main store-visits table wrapper */
#operator-store-visits-table_wrapper table td[data-label="משלוח"],
#operator-store-visits-table_wrapper table td[data-label="משלוח"] * {
  white-space: nowrap !important;
  word-wrap: normal !important;
  word-break: normal !important;
}
/* optional: keep digits LTR but isolated from bidi */
#operator-store-visits-table_wrapper table td[data-label="משלוח"] bdi {
  direction: ltr;
  unicode-bidi: plaintext;
}

/* ===== IMMEDIATE FIX: Apply to all tables to prevent race conditions ===== */
/* This applies immediately to prevent wrapping during page load */
table td[data-label="משלוח"],
table td[data-label="משלוח"] * {
  white-space: nowrap !important;
  word-wrap: normal !important;
  word-break: normal !important;
}

/* ===== ULTRA-EARLY FIX: Apply to any element with shipment-like content ===== */
/* This catches any element that might contain shipment numbers */
td:contains("PA_1_"),
td:contains("188"),
td:contains("189"),
td:contains("190") {
  white-space: nowrap !important;
  word-wrap: normal !important;
  word-break: normal !important;
}

/* Remove fragile index-coupled width rules left from older versions */
#operator-store-visits-table thead tr th:nth-child(2),
#operator-store-visits-table tbody tr td:nth-child(2),
#operator-store-visits-table col:nth-child(2) {
  width: auto !important;
  min-width: initial !important;
  max-width: initial !important;
}

/* Preview column width by class (no index coupling) */
#operator-store-visits-table th.preview-col,
#operator-store-visits-table td.preview-cell {
  width: 28px !important;
  min-width: 28px !important;
  max-width: 28px !important;
  text-align: center !important;
  overflow: hidden !important;
  white-space: nowrap !important;
}

#operator-store-visits-table {
  width: 100% !important;        /* Always fill container */
  table-layout: auto !important; /* Let DataTables compute widths */
}



/* אם תרצה לדאוג שתא ה-PREVIEW יתפרס לגמרי – אך לרוב לא צריך */
#operator-store-visits-table tr[id^="preview-for-"] > td {
  width: 100% !important;
}

/* Merlog Row Highlighting */
.merlog-highlight {
    background-color: #fef2f2 !important;
    transition: background-color 0.3s ease;
}

.merlog-highlight:hover {
    background-color: #fee2e2 !important;
}

/* Override for table cells specifically */
td.merlog-highlight {
    background-color: #fef2f2 !important;
    border-radius: 4px;
    padding: 4px 8px;
    margin: 2px 0;
}

td.merlog-highlight:hover {
    background-color: #fee2e2 !important;
}

/* Exclude preview cells from merlog highlighting */
td.preview-cell.merlog-highlight,
.preview-cell.merlog-highlight {
    background-color: inherit !important;
    border-radius: inherit !important;
    padding: inherit !important;
    margin: inherit !important;
}

td.preview-cell.merlog-highlight:hover,
.preview-cell.merlog-highlight:hover {
    background-color: inherit !important;
}

/* Force preview cells to keep their original styling */
.preview-cell {
    background-color: inherit !important;
    text-align: center !important;
}

/* Override any merlog highlighting on preview cells */
tr.merlog-highlight .preview-cell,
tr.merlog-highlight td.preview-cell,
.preview-cell.merlog-highlight,
td.preview-cell.merlog-highlight {
    background-color: inherit !important;
    border-radius: inherit !important;
    padding: inherit !important;
    margin: inherit !important;
    box-shadow: none !important;
}

/* Force preview cells to always keep their original styling */
.preview-cell,
td.preview-cell {
    background-color: transparent !important;
    background: transparent !important;
    text-align: center !important;
}

/* Override any hover effects on preview cells */
.preview-cell:hover,
td.preview-cell:hover {
    background-color: transparent !important;
    background: transparent !important;
}

/* Force preview cell buttons to keep their original styling */
.preview-cell button,
td.preview-cell button {
    background-color: #f3f6f9 !important;
    border-color: #e1e3ea !important;
}

.preview-cell button:hover,
td.preview-cell button:hover {
    background-color: #e1e3ea !important;
    border-color: #b5b5c3 !important;
}

/* Merlog Table Cell Highlighting - Darker red for specific cells */
#operator-store-visits-table td.merlog-highlight:not(.preview-cell),
#tasks-table td.merlog-highlight:not(.preview-cell),
table td.merlog-highlight:not(.preview-cell) {
    background-color: #fef2f2 !important;
    border-radius: 4px;
    padding: 4px 8px;
    margin: 2px 0;
}

#operator-store-visits-table td.merlog-highlight:hover:not(.preview-cell),
#tasks-table td.merlog-highlight:hover:not(.preview-cell),
table td.merlog-highlight:hover:not(.preview-cell) {
    background-color: #fee2e2 !important;
}

/* Merlog Panel View Highlighting - Solid background */
.panel_view.merlog-highlight,
.offcanvas.merlog-highlight,
.card.merlog-highlight {
    background-color: #ffdada !important;
    border: 2px solid #fecaca !important;
}
.offcanvas.merlog-highlight .tab-content,
.offcanvas.merlog-highlight .tab-pane,
.card.merlog-highlight .tab-content,
.card.merlog-highlight .tab-pane {
    background-color: #ffdada !important;
}

/* Merlog Panel View Row Highlighting - Darker red for specific rows */
.panel_view .select2-selection--single.merlog-highlight,
.panel_view .col-xxl-5.col-6.merlog-highlight,
.panel_view .col-xxl-7.col-6.merlog-highlight {
    background-color: #fef2f2 !important;
    border-radius: 4px;
    padding: 4px 8px;
    margin: 2px 0;
    border: 1px solid #fecaca !important;
}

.panel_view .select2-selection--single.merlog-highlight:hover,
.panel_view .col-xxl-5.col-6.merlog-highlight:hover,
.panel_view .col-xxl-7.col-6.merlog-highlight:hover {
    background-color: #fee2e2 !important;
    border-color: #fca5a5 !important;
}

/* Merlog Table Row Highlighting - Red background for entire row */
tr.merlog-row-highlight {
    background-color: #ffdada !important;
}

/* Merlog Panel View Row Highlighting - Red background for entire row */
.panel_view.merlog-row-highlight {
    background-color: #ffdada !important;
}

/* Merlog Panel View Content Highlighting */
.panel_view.merlog-highlight .tab-content {
    background-color: #ffdada !important;
}

.panel_view.merlog-highlight .tab-pane {
    background-color: #ffdada !important;
}

/* Merlog Panel View Link Highlighting */
.panel_view.merlog-highlight a.merlog-highlight {
    background-color: #fef2f2 !important;
    color: #dc2626 !important;
    padding: 2px 4px !important;
    border-radius: 3px !important;
    text-decoration: none !important;
}

.panel_view.merlog-highlight a.merlog-highlight:hover {
    background-color: #fee2e2 !important;
    color: #b91c1c !important;
}

/* Merlog Panel View Text Element Highlighting */
.panel_view.merlog-highlight span.merlog-highlight,
.panel_view.merlog-highlight div.merlog-highlight,
.panel_view.merlog-highlight p.merlog-highlight {
    background-color: #fef2f2 !important;
    color: #dc2626 !important;
    padding: 1px 3px !important;
    border-radius: 2px !important;
    font-weight: bold !important;
}

/* Merlog Panel View Select Element Highlighting */
.panel_view.merlog-highlight select.merlog-highlight {
    background-color: #fef2f2 !important;
    border-color: #fca5a5 !important;
    color: #dc2626 !important;
}

/* Prevent preview rows from receiving focus to avoid interfering with LionWheel navigation */
tr[id^="preview-for-"] {
    outline: none !important;
    user-select: none !important;
}

tr[id^="preview-for-"]:focus {
    outline: none !important;
    box-shadow: none !important;
}

tr[id^="preview-for-"] * {
    outline: none !important;
}

tr[id^="preview-for-"] *:focus {
    outline: none !important;
    box-shadow: none !important;
}

/* Responsive Preview Grid Layout - Targeted padding approach */
:root {
    --map-gap: 0px;
}

/* Preview flex-wrap container (the div with display:flex inside the preview row) */
tr[id^="preview-for-"] > td > div[style*="display: flex"] {
  /* Much more generous width calculation to prevent premature breaking */
  max-width: calc(100% - var(--map-gap-buffered, 0px) - 20px) !important;

  /* Push content away from the map edge (left) with a buffer */
  padding-left: var(--map-gap-buffered, 0px) !important;

  /* Ensure padding is part of the width calc */
  box-sizing: border-box !important;

  /* Ensure natural multi-row wrapping */
  flex-wrap: wrap !important;
  align-content: flex-start !important;
  gap: 8px !important; /* use container gap instead of external margins when possible */
}

/* Individual item cards inside the preview (keeps predictable wrapping) */
tr[id^="preview-for-"] > td > div[style*="display: flex"] > .d-flex {
  /* Allow cards to shrink and wrap properly */
  flex: 0 1 auto !important;
  max-width: 100% !important;
  min-width: 200px !important; /* Reduced from 280px to fit content better */
}

/* 2-line text clamp for product titles in preview cards */
tr[id^="preview-for-"] .font-weight-bold{
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: normal;
    line-height: 1.2em;
    max-height: calc(1.2em * 2);
}

/* Additional responsive adjustments for wider screens */
@media (min-width: 1200px) {
  tr[id^="preview-for-"] > td > div[style*="display: flex"] {
    max-width: calc(100% - var(--map-gap-buffered, 0px) - 30px) !important;
  }

  tr[id^="preview-for-"] > td > div[style*="display: flex"] > .d-flex {
    flex: 1 1 320px !important;
    max-width: none !important;
  }
}

@media (min-width: 1600px) {
  tr[id^="preview-for-"] > td > div[style*="display: flex"] {
    max-width: calc(100% - var(--map-gap-buffered, 0px) - 40px) !important;
  }

  tr[id^="preview-for-"] > td > div[style*="display: flex"] > .d-flex {
    flex: 1 1 350px !important;
    max-width: none !important;
  }
}

/* When map panel is very small or closed, give more space to cards */
@media (min-width: 768px) {
  tr[id^="preview-for-"] > td > div[style*="display: flex"] {
    max-width: calc(100% - max(var(--map-gap-buffered, 0px), 20px)) !important;
  }
}

/* Ensure minimum usable space for cards even when map is very wide */
@media (min-width: 768px) {
  tr[id^="preview-for-"] > td > div[style*="display: flex"] {
    min-width: 600px !important;
  }
}

/* Smooth transitions for responsive changes */
tr[id^="preview-for-"] > td > div[style*="display: flex"] {
  transition: max-width 0.3s ease-in-out !important;
}

tr[id^="preview-for-"] > td > div[style*="display: flex"] > .d-flex {
  transition: flex-basis 0.3s ease-in-out, max-width 0.3s ease-in-out !important;
}

/* Additional responsive breakpoints for better card layout */
@media (min-width: 768px) and (max-width: 1199px) {
  tr[id^="preview-for-"] > td > div[style*="display: flex"] > .d-flex {
    flex: 1 1 280px !important;
    max-width: none !important;
  }
}

@media (min-width: 1200px) and (max-width: 1599px) {
  tr[id^="preview-for-"] > td > div[style*="display: flex"] > .d-flex {
    flex: 1 1 300px !important;
    max-width: none !important;
  }
}

/* Ensure cards don't break too early on very wide screens */
@media (min-width: 1600px) {
  tr[id^="preview-for-"] > td > div[style*="display: flex"] {
    max-width: calc(100% - var(--map-gap-buffered, 0px) - 50px) !important;
  }

  tr[id^="preview-for-"] > td > div[style*="display: flex"] > .d-flex {
    flex: 1 1 380px !important;
    max-width: none !important;
  }
}

/* Fallback for when map panel is not detected */
@media (min-width: 768px) {
  tr[id^="preview-for-"] > td > div[style*="display: flex"] {
    max-width: calc(100% - 40px) !important;
  }
}

/* Force better space utilization */
@media (min-width: 768px) {
  tr[id^="preview-for-"] > td > div[style*="display: flex"] {
    width: calc(100% - var(--map-gap-buffered, 0px)) !important;
    justify-content: space-between !important;
  }

  /* Ensure cards distribute evenly */
  tr[id^="preview-for-"] > td > div[style*="display: flex"] > .d-flex {
    flex: 1 1 auto !important;
    max-width: calc((100% - 16px) / 3) !important; /* Account for gaps */
  }

  /* When map is wide, allow more cards per row */
  @media (min-width: 768px) {
    tr[id^="preview-for-"] > td > div[style*="display: flex"] > .d-flex {
      max-width: calc((100% - 24px) / 4) !important; /* Allow 4 cards when space permits */
    }
  }
}

/* Ensure proper spacing and layout for preview cards */
tr[id^="preview-for-"] > td > div[style*="display: flex"] {
  justify-content: flex-start !important;
  align-items: flex-start !important; /* Changed from stretch to flex-start to prevent equal height */
  width: 100% !important;
}

/* Improve card spacing and prevent overcrowding */
tr[id^="preview-for-"] > td > div[style*="display: flex"] > .d-flex {
  margin-bottom: 8px !important;
  margin-right: 8px !important;
  flex-grow: 1 !important;
  flex-shrink: 1 !important;
  flex-basis: auto !important;
}

/* Ensure cards have proper internal spacing */
tr[id^="preview-for-"] .d-flex > div {
  padding: 8px !important;
}

/* Improve text readability in cards */
tr[id^="preview-for-"] .font-weight-bold {
  font-size: 0.9em !important;
  line-height: 1.3 !important;
}
  `;

  GM_addStyle(css);
        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Error injecting global styles:`, error);
        }

        // Fix shipment wrapping after injecting global styles
        // fixShipmentWrapping(); // Removed for performance
}
// ✅ OUTSIDE the previous function block — correctly placed
function enableCopyStyling(el) {
    if (!el || !el.classList || !el.hasAttribute) {
        console.warn('⚠️ [Toolbox] enableCopyStyling: Invalid element');
        return;
    }

    if (!el.classList.contains('copy-enabled')) {
        el.classList.add('copy-enabled');
    }
    if (!el.hasAttribute('title')) {
        el.setAttribute('title', 'לחץ להעתקה');
    }

    // Also enable copy styling for text nodes inside this element
    if (el.tagName === 'TD' || el.tagName === 'SPAN' || el.tagName === 'DIV' || el.tagName === 'STRONG') {
        const textElements = el.querySelectorAll('span, div, strong, b, i, em');
        textElements.forEach(textEl => {
            if (textEl.textContent.trim() && !textEl.classList.contains('copy-enabled')) {
                textEl.classList.add('copy-enabled');
                if (!textEl.hasAttribute('title')) {
                    textEl.setAttribute('title', 'לחץ להעתקה');
                }
            }
        });
    }

    // Fix shipment wrapping after enabling copy styling
    // fixShipmentWrapping(); // Removed for performance
}

function prepareCopyElements() {
    try {
        document.querySelectorAll(`
            tr[id^="visit-row-"] td.text-nowrap,
            tr[id^="visit-row-"] td,
            strong.barcode-highlight,
            strong.barcode-highlight-gallery,
            .font-weight-bold,
            .gallery-product-name,
            .text-muted.font-weight-bold.font-size-sm,
            span.text-muted.font-weight-bold.font-size-sm,
            .copy-enabled
        `).forEach(el => {
            // Skip adding copy-enabled to quantity/לוקט cells to prevent flicker
            if (el.getAttribute('data-label') === 'כמות / לוקט') {
                return;
            }
            // Skip adding copy-enabled to name cells in store visits table
            if (el.getAttribute('data-label') === 'שם') {
                const table = el.closest('table');
                if (table && (table.id === 'operator-store-visits-table' ||
                              table.closest('#operator-store-visits-table_wrapper'))) {
                    return; // Skip name cells in store visits table
                }
                // Skip adding copy-enabled to name cells that already have links with copy icons
                const hasNonGoogleLink = el.querySelector('a:not(.google-image-icon)');
                if (hasNonGoogleLink || el.querySelector('.copy-icon')) {
                    return;
                }
            }
            // Skip adding copy-enabled to gallery product names that have links with copy icons
            if (el.classList.contains('gallery-product-name')) {
                const hasNonGoogleLink = el.querySelector('a:not(.google-image-icon)');
                if (hasNonGoogleLink || el.querySelector('.copy-icon')) {
                    return;
                }
            }
            // Skip adding copy-enabled to barcode cells that already have copy icons
            if (el.getAttribute('data-label') === 'מק״ט' && el.querySelector('.copy-icon')) {
                return;
            }
            // Skip adding copy-enabled to barcode elements that already have copy icons nearby
            if (el.classList.contains('barcode-highlight') || el.classList.contains('barcode-highlight-gallery')) {
                const parentCell = el.closest('td');
                if (parentCell && parentCell.querySelector('.copy-icon')) {
                    return;
                }
                // Add copy-enabled to barcode-highlight elements for click functionality
                enableCopyStyling(el);
                return;
            }

            // Also handle text elements inside copy-enabled elements
            if (el.classList.contains('copy-enabled')) {
                const textElements = el.querySelectorAll('span, div, strong, b, i, em');
                textElements.forEach(textEl => {
                    if (textEl.textContent.trim() && !textEl.classList.contains('copy-enabled')) {
                        textEl.classList.add('copy-enabled');
                        if (!textEl.hasAttribute('title')) {
                            textEl.setAttribute('title', 'לחץ להעתקה');
                        }
                    }
                });
                return; // Skip further processing for elements that already have copy-enabled
            }
            // Skip adding copy-enabled to elements that already have copy icons nearby
            const parentCell = el.closest('td');
            if (parentCell && parentCell.querySelector('.copy-icon')) {
                return;
            }

            // Enable copy styling for the element and its text children
            enableCopyStyling(el);
        });

        // Also add copy icons to pick order items
        // addCopyIconsToPickOrderItems(); // מנוטרל בכוונה
    } catch (error) {
        console.error(`[${SCRIPT_NAME}] Error preparing copy elements:`, error);
    }

    // Fix shipment wrapping after preparing copy elements
    // fixShipmentWrapping(); // Removed for performance
}




    // ---< Merlog Row Highlighting >---
    function highlightMerlogRows() {
        try {
            if (!settings || !settings.highlightMerlog) return;

            // Try to find the correct table
            let table = document.querySelector('#operator-store-visits-table');
            if (!table) {
                table = document.querySelector('#tasks-table');
            }
            if (!table) {
                // Try to find any table that might contain the data
                table = document.querySelector('table');
            }
            if (!table) return;

            const thead = table.querySelector('thead tr');
            if (!thead) return;

            let highlightedCount = 0;
            let totalRows = 0;

            // Process each row
            table.querySelectorAll('tbody tr').forEach((row, rowIndex) => {
                totalRows++;
                let shouldHighlight = false;

                // Get task ID for caching
                const taskId = row.getAttribute('data-task-id');

                // Check cache first for red highlighting
                const cached = taskId ? cacheGet(taskId) : null;
                if (cached && cached.color === 'red') {
                    // Highlight immediately if cached as red
                    row.classList.add('merlog-row-highlight');
                    highlightedCount++;
                    return; // Skip DOM scanning
                }

                // Clear previous highlighting from this row
                row.classList.remove('merlog-row-highlight');
                Array.from(row.cells).forEach(cell => {
                    if (!cell.classList.contains('preview-cell')) {
                        cell.classList.remove('merlog-highlight');
                        // Remove any inline styles
                        cell.style.backgroundColor = '';
                        cell.style.borderRadius = '';
                        cell.style.padding = '';
                    }
                });

                // Check driver column - look for "שיגור למרלוג"
                Array.from(row.cells).forEach(cell => {
                    // Skip preview cells
                    if (cell.classList.contains('preview-cell')) return;

                    const dataLabel = cell.getAttribute('data-label');
                    if (dataLabel === 'נהג') {
                        // Look for the actual displayed text in the select2 element
                        const select2Rendered = cell.querySelector('.select2-selection__rendered');
                        if (select2Rendered) {
                            const driverText = select2Rendered.textContent.trim();
                            // Look for specific patterns that indicate Merlog delivery
                            if (driverText.includes('שיגור למרלוג')) {
                                shouldHighlight = true;
                                cell.classList.add('merlog-highlight');
                            }
                        }
                    }
                });

                // Check area column - look for specific Merlog area patterns
                Array.from(row.cells).forEach(cell => {
                    // Skip preview cells
                    if (cell.classList.contains('preview-cell')) return;

                    const dataLabel = cell.getAttribute('data-label');
                    if (dataLabel === 'איזור חלוקה' || dataLabel === 'איזור') {
                        const cellText = (cell.textContent || '').trim();
                        // Require Merlog context + target areas to avoid false positives
                        if (cellText.includes('מרלוג') &&
                           (cellText.includes('צור יגאל') || cellText.includes("צ'יטה"))) {
                            shouldHighlight = true;
                            cell.classList.add('merlog-highlight');
                        }
                    }
                });

                // Highlight the entire row if any cell should be highlighted
                if (shouldHighlight) {
                    row.classList.add('merlog-row-highlight');
                    highlightedCount++;
                    // Cache the red result with DOM source
                    if (taskId) {
                        cacheSet(taskId, 'red', 'dom');
                    }
                } else if (taskId) {
                    // Cache negative result for brief period
                    cacheSet(taskId, null, 'dom');
                }
            });
        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Error highlighting Merlog rows:`, error);
        }

        // Fix shipment wrapping after highlighting Merlog rows
        // fixShipmentWrapping(); // Removed for performance
    }

    // ---< Ready Row Highlighting >---
    let readyHighlightRunning = false;
    let readyHighlightTimeout = null;

    // Debounced trigger — keep tiny delay to coalesce bursts from DataTables
    const debouncedHighlightReadyRows = debounce(async () => {
        if (readyHighlightRunning) {
            // Try again shortly if a pass is already in progress
            setTimeout(() => debouncedHighlightReadyRows(), 150);
            return;
        }
        await highlightReadyRows();
    }, 80); // ~one frame after draw

    // Small worker-pool for parallel panel_view fetches
    const READY_FETCH_CONCURRENCY = 1;
    const READY_MIN_GAP_MS = 2500;   // align with network limiter
    let lastReadyStartAt = 0;
    let readyHoldUntil = 0;
    let readyFetchAbort = null;
    let readyFetchQueue = [];
    let readyFetchInFlight = 0;

    // Advanced ephemeral cache system
    const rowColorCache = new Map(); // taskId -> { color: 'green'|'red'|'purple'|'purplegreen'|'brown'|'pink'|null, source: 'dom'|'panel', ts: number }
    const TTL = { green: 20*60e3, red: 20*60e3, purple: 20*60e3, purplegreen: 20*60e3, brown: 20*60e3, pink: 20*60e3, none: 3*60e3 }; // 20min
    const MAX_CACHE_SIZE = 500;

    function cacheGet(taskId) {
        const e = rowColorCache.get(taskId);
        if (!e) return null;
        const age = Date.now() - e.ts;
        const max = e.color === 'green' ? TTL.green
                 : e.color === 'red' ? TTL.red
                 : e.color === 'purple' ? TTL.purple
                 : e.color === 'purplegreen' ? TTL.purplegreen
                 : e.color === 'brown' ? TTL.brown
                 : e.color === 'pink' ? TTL.pink
                 : TTL.none;
        if (age > max) {
            rowColorCache.delete(taskId);
            return null;
        }
        return e;
    }

    function cacheSet(taskId, color, source) {
        // Enforce size limit with LRU eviction
        if (rowColorCache.size >= MAX_CACHE_SIZE) {
            const firstKey = rowColorCache.keys().next().value;
            rowColorCache.delete(firstKey);
        }
        rowColorCache.set(taskId, { color, source, ts: Date.now() });
    }

    function cacheInvalidate(taskId) {
        rowColorCache.delete(taskId);
    }

    function cacheInvalidateAll() {
        rowColorCache.clear();
    }

    // Cache invalidation on user interactions
    function setupCacheInvalidation() {
        // Invalidate cache on status/pick/area dropdown changes
        document.addEventListener('click', (e) => {
            if (e.target.closest('.task-set-status, .task-set-pick-status, .visit-drivers-select2, .route-select2')) {
                const tr = e.target.closest('tr[data-task-id]');
                if (tr) {
                    const taskId = tr.getAttribute('data-task-id');
                    if (taskId) cacheInvalidate(taskId);
                }
            }
        }, {capture: true, passive: true});

        // Invalidate cache on select2 changes (only if jQuery is available)
        if (typeof $ !== 'undefined') {
            $(document).on('select2:select', '.visit-drivers-select2, .route-select2', function(e) {
                const tr = $(this).closest('tr[data-task-id]');
                if (tr.length) {
                    const taskId = tr.attr('data-task-id');
                    if (taskId) cacheInvalidate(taskId);
                }
            });
        }

        // MutationObserver for row content changes
        const tableObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                const tr = mutation.target.closest && mutation.target.closest('tr[data-task-id]');
                if (tr) {
                    const taskId = tr.getAttribute('data-task-id');
                    if (taskId) {
                        cacheInvalidate(taskId);
                        // Re-highlight this specific row
                        setTimeout(() => {
                            if (typeof highlightMerlogRows === 'function') {
                                highlightMerlogRows();
                            }
                            if (typeof debouncedHighlightReadyRows === 'function') {
                                debouncedHighlightReadyRows();
                            }
                        }, 100);
                    }
                }
            }
        });

        // Observe table body for changes
        const table = document.querySelector('#operator-store-visits-table') ||
                     document.querySelector('#tasks-table') ||
                     document.querySelector('table');
        if (table) {
            const tbody = table.querySelector('tbody');
            if (tbody) {
                tableObserver.observe(tbody, {
                    subtree: true,
                    childList: true,
                    attributes: true,
                    characterData: false
                });
            }
        }
    }

    function cancelReadyFetches() {
        try {
            if (readyFetchAbort && !readyFetchAbort.signal.aborted) {
                readyFetchAbort.abort();
            }
        } catch (err) {
            // Silently handle abort errors - they're expected when cancelling requests
            if (err.name !== 'AbortError') {
                console.debug('[Toolbox] cancelReadyFetches error:', err);
            }
        }
        readyFetchAbort = null;
        readyFetchQueue = [];
        readyFetchInFlight = 0;
    }

    async function fetchPanelAndMarkReady(taskId, row, signal) {
        // Fast exits
        if (!taskId || !row || signal?.aborted) return false;
        try {
            // normalize to absolute URL so limiter always catches
            const abs = new URL(`/tasks/${taskId}/panel_view`, location.href).href;
            const response = await fetch(abs, {
                method: 'POST',
                headers: { 'accept': '*/*', 'content-type': 'application/json' },
                body: '{}',
                signal
            });
            if (!response.ok) {
                if (response.status === 429) {
                    const ra = response.headers && response.headers.get && response.headers.get('Retry-After');
                    let waitMs = 4000;
                    if (ra) {
                        const s = Number(ra);
                        if (!Number.isNaN(s)) waitMs = Math.max(1000, s * 1000);
                        else {
                            const when = Date.parse(ra);
                            if (!Number.isNaN(when)) waitMs = Math.max(1000, when - Date.now());
                        }
                    }
                    readyHoldUntil = Date.now() + waitMs;
                }
                return false;
            }
            const panelViewHtml = await response.text();
            const doc = new DOMParser().parseFromString(panelViewHtml, 'text/html');

            // Look for "מוכן" / coordination / branch across the whole doc
            const notesElements = doc.querySelectorAll('.notes, [class*="note"], [class*="comment"], .hover-copy, [data-tm-notes], .panel_view, .offcanvas, .card, [data-name]');
            let foundReady = false, foundCoord = false, foundBranch = false;
            const coordPatterns = ['לתאם','לקבוע','תיאום','תאום','תיאם','קבע','קבענו','קבעתי','נקבע','נקבעה','נקבעו','תואם','מתואם','מתואמת','מתואמים','נתאם','לתיאום הגעה','תיאום הגעה','תאום הגעה','נסגור שעה','סגירת שעה'];
            for (const el of notesElements) {
                const t = el && el.textContent || '';
                if (t.includes('מוכן')) foundReady = true;
                if (coordPatterns.some(p => t.includes(p))) foundCoord = true;
                if (!foundBranch && __tmcContainsBranch(t)) foundBranch = true;
            }

            // Update cache and highlight
            if (foundReady && foundCoord) {
                row.classList.add('coord-ready-row-highlight'); // split
                cacheSet(taskId, 'purplegreen', 'panel');
                return true;
            } else if (foundBranch) {
                row.classList.add('branch-row-highlight');
                cacheSet(taskId, 'brown', 'panel');
                return true;
            } else if (foundCoord) {
                row.classList.add('coord-row-highlight');
                cacheSet(taskId, 'purple', 'panel');
                return true;
            } else if (foundReady) {
                row.classList.add('ready-row-highlight');
                cacheSet(taskId, 'green', 'panel');
                return true;
            }
            cacheSet(taskId, null, 'panel');
            return false;
        } catch (err) {
            // Handle AbortError gracefully - it's expected when cancelling requests
            if (err.name === 'AbortError') {
                return false;
            }
            // Log other errors for debugging
            console.debug('[Toolbox] fetchPanelAndMarkReady error:', err);
            return false;
        }
    }

    function drainReadyQueue() {
        if (readyFetchInFlight >= READY_FETCH_CONCURRENCY) return;
        if (!readyFetchQueue.length) return;
        const now = Date.now();
        const holdLeft = readyHoldUntil - now;
        if (holdLeft > 0) { setTimeout(drainReadyQueue, holdLeft + 10); return; }
        const since = now - lastReadyStartAt;
        if (since < READY_MIN_GAP_MS) { setTimeout(drainReadyQueue, READY_MIN_GAP_MS - since); return; }
        const next = readyFetchQueue.shift() || {};
        const { taskId, row } = next;
        if (!taskId || !row) { drainReadyQueue(); return; }
        readyFetchInFlight++;
        lastReadyStartAt = Date.now();
        fetchPanelAndMarkReady(taskId, row, readyFetchAbort?.signal)
        .catch(err => {
            // Handle AbortError gracefully
            if (err.name !== 'AbortError') {
                console.debug('[Toolbox] drainReadyQueue error:', err);
            }
        })
        .finally(() => {
            readyFetchInFlight--;
            if (readyFetchAbort?.signal?.aborted) return;
            setTimeout(drainReadyQueue, READY_MIN_GAP_MS);
        });
    }

    async function highlightReadyRows() {
        try {
            if (!settings || !settings.highlightMerlog) return;

            readyHighlightRunning = true;
            // cancel any stale in-flight lookups when a new pass begins
            cancelReadyFetches();

            // Try to find the correct table
            let table = document.querySelector('#operator-store-visits-table');
            if (!table) {
                table = document.querySelector('#tasks-table');
            }
            if (!table) {
                // Try to find any table that might contain the data
                table = document.querySelector('table');
            }
            if (!table) return;

            const thead = table.querySelector('thead tr');
            if (!thead) return;

            let highlightedCount = 0;
            let totalRows = 0;

            // Process each row
            const rows = table.querySelectorAll('tbody tr');
            const rowArray = Array.from(rows);

            // Phase A: DOM-only instant detection with cache preference
            const toFetch = [];
            for (const row of rowArray) {
                totalRows++;

                // Skip rows that already have highlighting
                if (row.classList.contains('ready-row-highlight') || row.classList.contains('coord-row-highlight') || row.classList.contains('coord-ready-row-highlight') || row.classList.contains('branch-row-highlight') || row.classList.contains('mission-row-highlight')) {
                    continue; // Skip to next row since we already highlighted it
                }

                // Get task ID from the row
                const taskId = row.getAttribute('data-task-id');
                if (!taskId) continue;

                // Check cache first (prefer DOM over cached panel results)
                const cached = cacheGet(taskId);
                if (cached) {
                    if (cached.color === 'green') {
                        row.classList.add('ready-row-highlight');
                        highlightedCount++;
                        continue;
                    } else if (cached.color === 'purple') {
                        row.classList.add('coord-row-highlight');
                        highlightedCount++;
                        continue;
                    } else if (cached.color === 'purplegreen') {
                        row.classList.add('coord-ready-row-highlight'); // split
                        highlightedCount++;
                        continue;
                    } else if (cached.color === 'brown') {
                        row.classList.add('branch-row-highlight');
                        highlightedCount++;
                        continue;
                    } else if (cached.color === 'pink') {
                        row.classList.add('mission-row-highlight');
                        highlightedCount++;
                        continue;
                    }
                }

                // New: mission name detection in the row's "שם" column (store visits/tasks tables)
                const nameCell = row.querySelector('td[data-label="שם"]');
                if (nameCell) {
                    const nameSpan = nameCell.querySelector('[data-original-title], [title]') || nameCell.querySelector('span');
                    const rawName = (nameSpan?.getAttribute?.('data-original-title') ||
                                     nameSpan?.getAttribute?.('title') ||
                                     nameSpan?.textContent ||
                                     nameCell.textContent ||
                                     '').trim();
                    if (/משימ(ה|ת)/.test(rawName)) {
                        row.classList.add('mission-row-highlight');
                        highlightedCount++;
                        cacheSet(taskId, 'pink', 'dom');
                        continue;
                    }
                }

                // First, check for any tooltip/title in the row that includes "מוכן" (ready) or coordination (DOM source)
                let foundInTooltip = false;
                let seenReady = false, seenCoord = false;
                let foundBranchInRow = false;
                const tooltipCells = row.querySelectorAll('[title], [data-original-title]');
                const coordPatterns = ['לתאם','לקבוע','תיאום','תאום','תיאם','קבע','קבענו','קבעתי','נקבע','נקבעה','נקבעו','תואם','מתואם','מתואמת','מתואמים','נתאם','לתיאום הגעה','תיאום הגעה','תאום הגעה','נסגור שעה','סגירת שעה'];

                for (const cell of tooltipCells) {
                    const title = cell.getAttribute('title') || cell.getAttribute('data-original-title') || '';
                    if (!title) continue;
                    if (title.includes('מוכן')) seenReady = true;
                    if (coordPatterns.some(p => title.includes(p))) seenCoord = true;
                    if (!foundBranchInRow && __tmcContainsBranch(title)) foundBranchInRow = true;
                }

                // Fast path: check the whole row text once (covers any column)
                if (!foundBranchInRow) {
                    const rowText = row.textContent || '';
                    if (__tmcContainsBranch(rowText)) foundBranchInRow = true;
                }

                if (seenReady && seenCoord) {
                    row.classList.add('coord-ready-row-highlight');
                    highlightedCount++;
                    foundInTooltip = true;
                    cacheSet(taskId, 'purplegreen', 'dom');
                } else if (foundBranchInRow) {
                    row.classList.add('branch-row-highlight');
                    highlightedCount++;
                    foundInTooltip = true;
                    cacheSet(taskId, 'brown', 'dom'); // prefer DOM over panel
                } else if (seenCoord) {
                    row.classList.add('coord-row-highlight');
                    highlightedCount++;
                    foundInTooltip = true;
                    cacheSet(taskId, 'purple', 'dom');
                } else if (seenReady) {
                    row.classList.add('ready-row-highlight');
                    highlightedCount++;
                    foundInTooltip = true;
                    cacheSet(taskId, 'green', 'dom');
                }

                if (foundInTooltip) {
                    continue;
                }

                // If we have a cached negative result from panel, respect it briefly
                if (cached && cached.color === null && cached.source === 'panel') {
                    continue; // Skip fetching again for a short time
                }

                // Phase B: Queue for background fetch (parallel)
                toFetch.push({ taskId, row });
            }

            // Prioritize visible/top rows first
            // (simple heuristic by DOM order; avoids forcing layout reads)
            readyFetchAbort = new AbortController();
            readyFetchQueue = toFetch;
            drainReadyQueue();

                            // Removed excessive logging to reduce console noise

        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Error highlighting ready rows:`, error);
        } finally {
            readyHighlightRunning = false;
        }
    }

    // ---< Merlog Panel View Highlighting >---
    function highlightMerlogPanelView() {
      try {
        if (!settings || !settings.highlightMerlog) return;

        // Prefer a VISIBLE offcanvas; otherwise the task card that contains notes
        let panelView =
          document.querySelector('.offcanvas.offcanvas-custom-right.show, .offcanvas.show') ||
          document.querySelector('.card:has(.row[data-name="notes"])') ||
          document.querySelector('#task_offcanvas') ||
          document.querySelector('.panel_view') ||
          document.querySelector('.offcanvas.offcanvas-custom-right') ||
          document.querySelector('.offcanvas') ||
          document.querySelector('.card');

        if (!panelView) return;

        // ---------- Signals ----------
        const panelText = (panelView.textContent || '').replace(/\s+/g, ' ');

        // Notes – prefer the explicit notes cell if present
        const notesNode =
          panelView.querySelector('.row[data-name="notes"] .hover-copy') ||
          panelView.querySelector('.row[data-name="notes"]') ||
          null;
        const notesText = (notesNode ? notesNode.textContent : '').replace(/\s+/g, ' ');

        // Mission name (customer title) — detect specifically from the contact name field
        const nameNode =
          panelView.querySelector('.row[data-name="destination_recipient_name"] .hover-copy') ||
          panelView.querySelector('.row[data-name="destination_recipient_name"]') ||
          null;
        const nameText = (nameNode ? nameNode.textContent : '').replace(/\s+/g, ' ');
        const missionFound = /משימ(ה|ת)/.test(nameText);

        // במסך מלא: מזהים אך ורק מתוך ההערות כדי למנוע False Positive (למשל "נקבע" בשדות אחרים)
        const isFullPageCard = panelView.classList.contains('card');
        const sourceForReady  = isFullPageCard ? notesText : (notesText + ' ' + panelText);
        const sourceForCoord  = isFullPageCard ? notesText : (notesText + ' ' + panelText);

        const readyFound = sourceForReady.includes('מוכן');
        const COORD_TERMS = [
          'לתאם','תיאום','תיאם','תואם','מתואם','מתואמת','מתואמים',
          'קבע','קביעת', /* זה יזוהה רק אם מופיע בהערות במסך מלא */
          'נקבע','נקבעה','נקבעו',
          'לתאם הגעה','תיאום הגעה','לתאם מסירה','תיאום מסירה'
        ];
        const coordFound = COORD_TERMS.some(t => sourceForCoord.includes(t));
        const hasBranch = __tmcContainsBranch(panelText);

        // Merlog (existing logic kept)
        const merlogPatterns = ['שיגור למרלוג', 'מרלוג צור יגאל', "מרלוג צ'יטה"];
        let merlogFound = false;

        const driverSelect = panelView.querySelector('.select2-selection__rendered');
        if (driverSelect && merlogPatterns.some(p => driverSelect.textContent.trim().includes(p))) {
          merlogFound = true;
        }
        const selectElement = panelView.querySelector('select.visit-drivers-select2');
        if (selectElement) {
          const opt = selectElement.options[selectElement.selectedIndex];
          if (opt && merlogPatterns.some(p => opt.textContent.includes(p))) merlogFound = true;
        }
        panelView.querySelectorAll('.col-xxl-5.col-6').forEach(section => {
          const labelSpan = section.querySelector('span');
          if (labelSpan && labelSpan.textContent.trim() === 'איזור חלוקה') {
            const valueSection = section.nextElementSibling;
            if (valueSection && merlogPatterns.some(p => valueSection.textContent.trim().includes(p))) {
              merlogFound = true;
            }
          }
        });

        // ---------- Apply classes with stable state to avoid flicker ----------
        const nextState =
          merlogFound              ? 'red'         :
          missionFound             ? 'pink'        :
          (coordFound && readyFound) ? 'purplegreen' :
          hasBranch                ? 'brown'       :
          coordFound               ? 'purple'      :
          readyFound               ? 'green'       : 'none';

        if (panelView.dataset.tmcHighlightState === nextState) return; // אין שינוי – אין נגיעה ב־DOM

        // Clear previous highlights on the chosen container
        panelView.classList.remove(
          'merlog-highlight', 'merlog-row-highlight',
          'ready-highlight', 'coord-highlight', 'coord-ready-highlight',
          'branch-highlight', 'mission-highlight'
        );
        panelView.querySelectorAll('.merlog-highlight, .ready-highlight, .coord-highlight, .coord-ready-highlight, .branch-highlight, .mission-highlight')
          .forEach(el => el.classList.remove('merlog-highlight', 'ready-highlight', 'coord-highlight', 'coord-ready-highlight', 'branch-highlight', 'mission-highlight'));

        panelView.dataset.tmcHighlightState = nextState;

        if (nextState === 'purplegreen') {
          panelView.classList.add('coord-ready-highlight');
        } else if (nextState === 'purple') {
          panelView.classList.add('coord-highlight');
        } else if (nextState === 'green') {
          panelView.classList.add('ready-highlight');
        } else if (nextState === 'brown') {
          panelView.classList.add('branch-highlight');
        } else if (nextState === 'pink') {
          panelView.classList.add('mission-highlight');
        }

        if (merlogFound) {
          panelView.classList.add('merlog-highlight');
        }
      } catch (e) {
        console.error(`[${SCRIPT_NAME}] Error in highlightMerlogPanelView:`, e);
      }
    }

    // ---< Main Execution & Control Flow >---
    async function runMainLogic() {
        // Prevent multiple simultaneous executions
        if (window.runMainLogicExecuting) return;
        window.runMainLogicExecuting = true;

        safeExecute(async () => {

            // MODIFICATION: Call tagColumnsForHiding initially with default scope (document)
            tagColumnsForHiding();
            document.querySelectorAll('.table-responsive > .table, #operator-store-visits-table').forEach(addResponsiveDataAttributes);
            document.querySelectorAll('td.text-nowrap, span.text-muted.font-weight-bold, input.order-item-sku').forEach(el => {
                if (!el.hasAttribute('data-original-sku')) el.setAttribute('data-original-sku', el.tagName === 'INPUT' ? el.value.trim() : el.textContent.trim());
            });
            // MODIFICATION: Call these with default scope (document)
            replaceBarcodesInViews(); // Unified barcode replacement function
            // addCopyIconsToPickOrderItems(document); // מנוטרל בכוונה
            injectImagesAndLinks(document);
            injectImagesInRegularTables(document);
            injectImagesInOrderItemRows(document);
            injectWhatsAppButtons();
            highlightMerlogRows(); // Add Merlog row highlighting
            highlightMerlogPanelView(); // Add Merlog panel view highlighting
            highlightPickQuantities(); // Add pick quantities highlighting
            fixShipmentWrapping(); // Fix shipment number wrapping

            // Run ready highlighting in background to avoid blocking the UI
            setTimeout(() => {
                debouncedHighlightReadyRows();
            }, 1000);

            // Also run when the page is fully loaded, but only once
            let pageLoadHighlightDone = false;
            if (document.readyState === 'complete') {
                if (!pageLoadHighlightDone) {
                    pageLoadHighlightDone = true;
                    setTimeout(() => {
                        debouncedHighlightReadyRows();
                        // fixShipmentWrapping(); // Removed for performance // Fix shipment wrapping after page load
                    }, 2000);
                }
            } else {
                window.addEventListener('load', async () => {
                    if (!pageLoadHighlightDone) {
                        pageLoadHighlightDone = true;
                        setTimeout(() => {
                            debouncedHighlightReadyRows();
                            // fixShipmentWrapping(); // Removed for performance // Fix shipment wrapping after page load
                        }, 2000);
                    }
                }, { passive: true });
            }

            // MODIFICATION START: Add MutationObserver for the "עריכת פריטים" modal
            let editTaskModal = null;
            // First try to find by ID
            editTaskModal = document.querySelector('#order-items-edit-modal');

            // If not found by ID, iterate through all modal-content elements to find the correct one
            if (!editTaskModal) {
                document.querySelectorAll('.modal-content').forEach(modal => {
                    const modalTitle = modal.querySelector('h4.modal-title');
                    if (modalTitle && modalTitle.textContent.trim() === 'עריכת פריטים') {
                        editTaskModal = modal;
                    }
                });
            }

            if (editTaskModal && !editTaskModal.hasAttribute('data-columns-hidden-observer-active')) {
                const observerConfig = { childList: true, subtree: true };
                const modalObserver = new MutationObserver((mutationsList, observer) => {
                    // 1) skip while copy feedback is active
                    if (window._tmCopying) return;

                    // 2) ignore mutations coming from the copy icon area
                    if (mutationsList.some(m => {
                      const el = (m.target?.nodeType === 1 ? m.target : m.target?.parentElement) || null;
                      return el && el.closest && el.closest('.tampermonkey-copy-wrap, .copy-icon');
                    })) {
                      return;
                    }

                    clearTimeout(modalObserver.debounceTimer);
                    modalObserver.debounceTimer = setTimeout(() => {
                        const modalForm = editTaskModal.querySelector('form[id^="edit_task_"]');
                        if (modalForm) {
                            // Pass the specific modalForm as scope to the functions
                            safeExecute(() => tagColumnsForHiding(modalForm)); // Re-apply column hiding
                            safeExecute(() => injectImagesAndLinks(modalForm)); // Re-process images/links
                            safeExecute(() => injectImagesInRegularTables(modalForm)); // Re-process regular table images
                            safeExecute(() => injectImagesInOrderItemRows(modalForm)); // Re-process .order-item-row images
                            safeExecute(() => replaceBarcodesInViews(modalForm)); // Re-process barcodes (unified function)
                            // safeExecute(() => addCopyIconsToPickOrderItems(modalForm)); // מנוטרל בכוונה
                        }
                    }, 50); // Small debounce delay
                });
                modalObserver.observe(editTaskModal, observerConfig);
                editTaskModal.setAttribute('data-columns-hidden-observer-active', 'true'); // Mark observer as active
            }
            // MODIFICATION END

            const firstOrderRow = document.querySelector('tr[id^="visit-row-"]');
            if (firstOrderRow) {
                const mainTableBody = firstOrderRow.closest('tbody');
                if (mainTableBody) safeExecute(() => injectPreviewFunctionality(mainTableBody));
            }

            // Add MutationObserver for panel view highlighting
            const panelView = document.querySelector('.offcanvas.offcanvas-custom-right');
            if (panelView && !panelView.hasAttribute('data-merlog-observer-active')) {
                // Call highlighting functions immediately
                setTimeout(() => {
                    highlightMerlogPanelView();
                    debouncedHighlightReadyRows();
                }, 100);
                const panelObserver = new MutationObserver((mutations) => {
                    // 1) skip while copy feedback is active
                    if (window._tmCopying) return;

                    // 2) ignore mutations coming from the copy icon area
                    if (mutations.some(m => {
                      const el = (m.target?.nodeType === 1 ? m.target : m.target?.parentElement) || null;
                      return el && el.closest && el.closest('.tampermonkey-copy-wrap, .copy-icon');
                    })) {
                      return;
                    }

                    clearTimeout(panelObserver.debounceTimer);
                    panelObserver.debounceTimer = setTimeout(() => {
                        highlightMerlogPanelView();
                        debouncedHighlightReadyRows();
                        // NEW: Also replace barcodes in panel view
                        if (settings && settings.replaceBarcodes) {
                            replaceBarcodesInViews(panelView);
                        }
                        // NEW: Also add copy icons to pick order items in panel view
                        // addCopyIconsToPickOrderItems(panelView); // מנוטרל בכוונה
                    }, 200);
                });
                panelObserver.observe(panelView, { childList: true, subtree: true });
                panelView.setAttribute('data-merlog-observer-active', 'true');
            }

            // Also add event listener for when panel view is shown
            document.addEventListener('shown.bs.offcanvas', function(event) {
                if (event.target.classList.contains('offcanvas-custom-right')) {
                    setTimeout(() => {
                        highlightMerlogPanelView();
                        debouncedHighlightReadyRows();
                    }, 500);
                }
            }, { passive: true });

            // --- Full-page task view observer (.card) ---
            const fullPageCard = document.querySelector('.card');
            if (fullPageCard && !fullPageCard.hasAttribute('data-task-highlights-observer-active')) {
              // First pass after initial render
              setTimeout(() => {
                highlightMerlogPanelView();
                if (settings && settings.replaceBarcodes) replaceBarcodesInViews(fullPageCard);
              }, 150);

              const cardObserver = new MutationObserver((mutations) => {
                // skip while copy feedback is active / ignore copy icon area (same guards as panel)
                if (window._tmCopying) return;
                if (mutations.some(m => {
                  const el = (m.target?.nodeType === 1 ? m.target : m.target?.parentElement) || null;
                  return el && el.closest && el.closest('.tampermonkey-copy-wrap, .copy-icon');
                })) return;

                clearTimeout(cardObserver.debounceTimer);
                cardObserver.debounceTimer = setTimeout(() => {
                  highlightMerlogPanelView();
                  if (settings && settings.replaceBarcodes) replaceBarcodesInViews(fullPageCard);
                }, 200);
              });
              cardObserver.observe(fullPageCard, { childList: true, subtree: true });
              fullPageCard.setAttribute('data-task-highlights-observer-active', 'true');
            }

            // Add event listener for when table data is loaded/updated
            let readyHighlightTimeout = null;
            let tableObserverActive = false;
            const tableObserver = new MutationObserver((mutations) => {
                // 1) skip while copy feedback is active
                if (window._tmCopying) return;

                // 2) ignore mutations coming from the copy icon area
                if (mutations.some(m => {
                  const el = (m.target?.nodeType === 1 ? m.target : m.target?.parentElement) || null;
                  return el && el.closest && el.closest('.tampermonkey-copy-wrap, .copy-icon');
                })) {
                  return;
                }

                if (tableObserverActive) return; // Prevent multiple simultaneous calls

                let shouldCheckReady = false;
                let newTaskRows = 0;

                mutations.forEach(mutation => {
                    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                        mutation.addedNodes.forEach(node => {
                            if (node.nodeType === 1 && node.matches &&
                                (node.matches('tr[data-task-id]') || node.querySelector('tr[data-task-id]'))) {
                                shouldCheckReady = true;
                                newTaskRows++;
                            }
                        });
                    }
                });

                if (shouldCheckReady && newTaskRows > 0) {
                    tableObserverActive = true;

                    // Clear previous timeout to avoid multiple calls
                    if (readyHighlightTimeout) {
                        clearTimeout(readyHighlightTimeout);
                    }
                    readyHighlightTimeout = setTimeout(() => {
                        debouncedHighlightReadyRows();
                        tableObserverActive = false;
                    }, 2000);
                }
            });

            // Observe the table for new rows
            const tableToObserve = document.querySelector('#operator-store-visits-table') ||
                                  document.querySelector('#tasks-table') ||
                                  document.querySelector('table');
            if (tableToObserve) {
                tableObserver.observe(tableToObserve, { childList: true, subtree: true });
            }

        }, () => {
            // Fallback function
            console.error(`[${SCRIPT_NAME}] Error in runMainLogic`);
        });

        // Reset the execution flag
        window.runMainLogicExecuting = false;
    }

    // Create debounced version of runMainLogic
    const debouncedRunMainLogic = debounce(async () => {
        if (!window.runMainLogicExecuting) {
            await runMainLogic();
        }
    }, 100);

function highlightPickQuantities() {
    try {
        // Target all tables with the "כמות / לוקט" column, not just the first one
        const targetTables = document.querySelectorAll('table.table.table-hover[data-columns-tagged="true"]');
        if (!targetTables || targetTables.length === 0) return;

        targetTables.forEach(table => {
            // Find cells with the specific data-label for pick quantities
            const pickQuantityCells = table.querySelectorAll('td[data-label="כמות / לוקט"]');

            pickQuantityCells.forEach(el => {
                if (!el || !el.innerHTML) return;

                // Skip if already processed (has tampermonkey classes)
                if (el.querySelector('.tampermonkey-picked-full, .tampermonkey-picked-none, .tampermonkey-picked-partial')) {
                    return;
                }

                let html = el.innerHTML.trim();

                // More specific pattern for pick quantities: exactly 2 numbers separated by "/"
                const match = html.match(/^(\d+)\s*\/\s*(\d+)$/);
                if (!match) return;

                const picked = parseInt(match[1]);
                const total = parseInt(match[2]);

                // Skip 0 / 1
                if (picked === 0 && total === 1) return;

                // Additional validation - make sure these are reasonable pick quantities
                if (picked > total || total > 1000) return;

                const replacementClass =
                    picked === total ? 'tampermonkey-picked-full' :
                    picked === 0 && total > 1 ? 'tampermonkey-picked-none' :
                    'tampermonkey-picked-partial';

                // Replace the entire content with the highlighted version
                el.innerHTML = `<span class="${replacementClass}">${html}</span>`;
            });
        });
    } catch (error) {
        console.error(`[${SCRIPT_NAME}] Error highlighting pick quantities:`, error);
    }

    // Fix shipment wrapping after highlighting pick quantities
    // fixShipmentWrapping(); // Removed for performance - will be called by main logic
}




// --- DataTables draw hook (אופציונלי, פועל רק אם יש jQuery+DataTables) ---
let __tmcLegendFilterTable = null;

function __tmcFindActiveVisitsDataTable() {
  if (!window.jQuery || !jQuery.fn.DataTable) return { dt: null, node: null };
  const $cand = jQuery('table.dataTable:visible')
    .not('.pick-order-item-table')
    .filter(function(){ return !jQuery(this).closest('#missing-table-container').length; })
    .first();
  if ($cand.length) {
    const dt = $cand.DataTable();
    return { dt, node: dt.table().node() };
  }
  const $fallback = jQuery('#operator-store-visits-table');
  if ($fallback.length) {
    const dt = $fallback.DataTable();
    return { dt, node: dt.table().node() };
  }
  return { dt: null, node: null };
}

// === Legend filtering (click-to-filter) =====================================
(function(){
  let __tmcLegendFilterInstalled = false;
  let __tmcActiveLegendKey = null;
  let __tmcActiveLegendRowClass = null;

  const KEY_TO_ROW_CLASS = {
    merlog: 'merlog-row-highlight',
    ready:  'ready-row-highlight',
    coord:  'coord-row-highlight',
    branch: 'branch-row-highlight',
    mission:'mission-row-highlight',
    phone:  'phone-missing-row-highlight'
  };

  function ensureLegendFilterInstalled(dt){
    if (__tmcLegendFilterInstalled) return;
    if (!window.jQuery || !jQuery.fn.dataTable) return;
    jQuery.fn.dataTable.ext.search.push(function(settings, data, dataIndex){
      try{
        const tbl = settings && settings.nTable;
        if (!tbl) return true;
        if (__tmcLegendFilterTable && tbl !== __tmcLegendFilterTable) return true;
        if (!__tmcActiveLegendRowClass) return true;
        const row = settings.aoData && settings.aoData[dataIndex] && settings.aoData[dataIndex].nTr;
        if (!row) return true;
        return row.classList.contains(__tmcActiveLegendRowClass);
      }catch(e){ return true; }
    });
    __tmcLegendFilterInstalled = true;
  }

  function setLegendActiveChip(nextKey){
    const root = document.getElementById('tmc-color-legend');
    if (!root) return;
    root.querySelectorAll('.tmc-legend-chip').forEach(ch => ch.classList.remove('is-active'));
    if (!nextKey) return;
    const target = root.querySelector('.tmc-legend-chip--' + nextKey);
    if (target) target.classList.add('is-active');
  }

  function toggleLegendFilter(key){
    if (__tmcActiveLegendKey === key){
      __tmcActiveLegendKey = null;
      __tmcActiveLegendRowClass = null;
    } else {
      __tmcActiveLegendKey = key;
      __tmcActiveLegendRowClass = KEY_TO_ROW_CLASS[key] || null;
    }
    setLegendActiveChip(__tmcActiveLegendKey);
    let { dt, node } = __tmcFindActiveVisitsDataTable();
    __tmcLegendFilterTable = node;
    if (dt){
      ensureLegendFilterInstalled(dt);
      dt.draw(false);
    }
  }

  // Click handler removed - using new handler with toggle behavior (see installLegendClickDebug below)

  // Expose tiny API if needed elsewhere
  window.__tmcToggleLegendFilter = toggleLegendFilter;
  window.__tmcEnsureLegendFilterInstalled = ensureLegendFilterInstalled;
})();
// === End Legend filtering ====================================================
function hookDataTablesDraw(dt) {
  try { window.__tmcEnsureLegendFilterInstalled && window.__tmcEnsureLegendFilterInstalled(dt); } catch(e) {}
  try {
    const $ = window.jQuery || window.$;
    // בדיקה סלחנית: גם dataTable (ישן) וגם DataTable (חדש)
    if (!$ || !$.fn || (!$.fn.dataTable && !$.fn.DataTable)) return;

    // נבטיח שלא נרשום מאזינים כפולים
    $(document).off('.tmPreviewDraw');

    // על כל אירועי רינדור/מיון/חיפוש/דפדוף – נזריק PREVIEW לשורות שחסר להן
    $(document).on(
      'draw.dt.tmPreviewDraw page.dt.tmPreviewDraw order.dt.tmPreviewDraw search.dt.tmPreviewDraw',
      'table.dataTable',
      function () {
        try {
          // דילוגים לפי הדרישה שלך (אין PREVIEW בליקוט/חוסרים)
          const table = this;
          if (table.classList && table.classList.contains('pick-order-item-table')) return;
          if (table.closest && table.closest('#missing-table-container')) return;

          const tb = table.tBodies && table.tBodies[0];
          if (!tb) return;

          // הפונקציה אידמפוטנטית (מתוך התיקון הקודם): מוסיפה רק לשורות שחסר להן
          injectPreviewFunctionality(tb);

          // NEW: Re-apply row highlighting after every redraw/filter/search
          // Invalidate cache on table changes to ensure fresh data
          cacheInvalidateAll();

          // Red (Merlog) rows
          if (typeof highlightMerlogRows === 'function') {
            highlightMerlogRows();
          }
          // Green (Ready) rows – debounced
          if (typeof debouncedHighlightReadyRows === 'function') {
            debouncedHighlightReadyRows();
          }
        } catch (e) { /* no-op */ }
      }
    );
  } catch (e) { /* no-op */ }
}

// ננסה להתחבר מיד, ואם jQuery נטען מאוחר יותר – ננסה שוב
(function retryHookDTDraw(attempts = 0) {
  hookDataTablesDraw();
  // אם אין עדיין jQuery+DataTables, ננסה עוד כמה פעמים בפרק זמן קצר
  const hasJQ = !!(window.jQuery || window.$);
  const hasDT =
    hasJQ &&
    !!((window.jQuery || window.$).fn &&
       (((window.jQuery || window.$).fn.dataTable) || ((window.jQuery || window.$).fn.DataTable)));
  if (!hasDT && attempts < 20) {
    setTimeout(() => retryHookDTDraw(attempts + 1), 300);
  }
})();

async function initialize() {
  try {

    if (window.anipetToolboxInitialized) {
      return;
    }
    window.anipetToolboxInitialized = true;

    // Reset logging flags for new page load
    window.targetProductLogged = false;
    window.targetProductFound = false;
    window.targetProductNotFound = false;
    window.targetProductApplied = false;
    window.targetProductInCSVLogged = false;

    createStatusNotifier();

    await loadSettings();

    // Setup cache invalidation system
    setupCacheInvalidation();

    // Setup jQuery-dependent cache invalidation after jQuery loads
    if (typeof $ === 'undefined') {
        // Wait for jQuery to load
        const checkJQuery = setInterval(() => {
            if (typeof $ !== 'undefined') {
                clearInterval(checkJQuery);
                // Setup select2 event handlers
                $(document).on('select2:select', '.visit-drivers-select2, .route-select2', function(e) {
                    const tr = $(this).closest('tr[data-task-id]');
                    if (tr.length) {
                        const taskId = tr.attr('data-task-id');
                        if (taskId) cacheInvalidate(taskId);
                    }
                });
            }
        }, 100);

        // Stop checking after 10 seconds
        setTimeout(() => clearInterval(checkJQuery), 10000);
    }

    // --- DataTables draw hook (אופציונלי, פועל רק אם יש jQuery+DataTables) ---
    hookDataTablesDraw();

    registerMenuCommands();

    injectGlobalStyles();

    // Initialize ResizeObserver for side panel width tracking
    initializeSidePanelResizeObserver();

    await Promise.all([ getProductData(), loadBarcodeCsv() ]);

    runMainLogic(); // ← הרצת ההזרקות הראשוניות

  prepareCopyElements();

  // Add copy icons to all barcodes in pick order table initially
  // addCopyIconsToPickOrderItems(); // מנוטרל בכוונה

  highlightPickQuantities();

  // Fix shipment number wrapping immediately
  fixShipmentWrapping();

  // Set up observer to fix shipment wrapping when table content changes
  const shipmentObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        // Check if any added nodes contain shipment cells
        const hasShipmentCells = Array.from(mutation.addedNodes).some(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            return node.querySelector && (
              node.querySelector('td[data-label="משלוח"]') ||
              node.matches('td[data-label="משלוח"]')
            );
          }
          return false;
        });

        if (hasShipmentCells) {
          setTimeout(fixShipmentWrapping, 50); // Small delay to ensure DOM is updated
        }
      }
    });
  });

  // Observe the entire document for table changes
  if (document.body) {
    shipmentObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Add clickable links to all tables (including non-visit-row tables)
  addClickableLinksToAllTables();

  // Also fix shipment wrapping after a delay to catch any late-loading content
  setTimeout(fixShipmentWrapping, 1000);
  setTimeout(fixShipmentWrapping, 3000);

  // === Apply Copy Icon RTL/LTR Fix ===
  requestAnimationFrame(() => applyCopyIconFix());
  /* === Give initial focus to the first tagged table (no scroll, no border) === */
  requestAnimationFrame(() => {
    const t = document.querySelector('table[data-columns-tagged="true"]');
    if (t) t.focus({ preventScroll:true });
  });

  /* === Init ripple on copy targets === */
  requestAnimationFrame(() => initCopyRipple());
  /* === Init copy toast from pointer (click point) === */
  requestAnimationFrame(() => initCopyToastFromPointer());
  /* === Install unified toast CSS once (no CSS animations) === */
  requestAnimationFrame(() => installCopyToastBaseCSS());
  /* === Enable copy by clicking Name cell (td[data-label="שם"]) === */
  requestAnimationFrame(() => enableNameCellCopy());
  /* === Clean up incorrectly marked cells === */
  requestAnimationFrame(() => cleanupFlexCells());

  // Set up MutationObserver to keep copy icons fixed on dynamic updates
  (function observeTableForCopyIconFix(){
    const tables = document.querySelectorAll('table[data-columns-tagged="true"]');
    if (tables.length === 0) {
      // If no tagged tables found yet, wait and try again
      setTimeout(() => {
        const retryTables = document.querySelectorAll('table[data-columns-tagged="true"]');
        retryTables.forEach(table => {
          if (table && table.nodeType === Node.ELEMENT_NODE) {
            const mo = new MutationObserver((muts) => {
              // 1) skip while copy feedback is active
              if (window._tmCopying) return;

              // 2) ignore mutations coming from the copy icon area
              if (muts.some(m => {
                const el = (m.target?.nodeType === 1 ? m.target : m.target?.parentElement) || null;
                return el && el.closest && el.closest('.tampermonkey-copy-wrap, .copy-icon');
              })) {
                return;
              }

              // Any row/cell/text change -> re-apply (idempotent)
              scheduleHeavy(() => applyCopyIconFix());
            });
            mo.observe(table, {childList:true, subtree:true});
          }
        });
      }, 1000);
      return;
    }

    tables.forEach(table => {
      if (table && table.nodeType === Node.ELEMENT_NODE) {
        const mo = new MutationObserver((muts) => {
          // 1) skip while copy feedback is active
          if (window._tmCopying) return;

          // 2) ignore mutations coming from the copy icon area
          if (muts.some(m => {
            const el = (m.target?.nodeType === 1 ? m.target : m.target?.parentElement) || null;
            return el && el.closest && el.closest('.tampermonkey-copy-wrap, .copy-icon');
          })) {
            return;
          }

          // Any row/cell/text change -> re-apply (idempotent)
          scheduleHeavy(() => applyCopyIconFix());
        });
        mo.observe(table, {childList:true, subtree:true});
      }
    });
  })();

  // ◂ הגנה פשוטה - מונע הסרת PREVIEW לחלוטין
  const table = document.querySelector('#operator-store-visits-table');
  if (table) {
    let tableObserverTimeout = null;
    const tableObserver = new MutationObserver((mutations) => {
      // 1) skip while copy feedback is active
      if (window._tmCopying) return;

      // 2) ignore mutations coming from the copy icon area
      if (mutations.some(m => {
        const el = (m.target?.nodeType === 1 ? m.target : m.target?.parentElement) || null;
        return el && el.closest && el.closest('.tampermonkey-copy-wrap, .copy-icon');
      })) {
        return;
      }

      // השתמש ב-debounce כדי למנוע לולאה אינסופית
      clearTimeout(tableObserverTimeout);
      tableObserverTimeout = setTimeout(() => {
        // בכל שינוי בתת-עץ של הטבלה, ננסה להזריק Preview מחדש
        const tb = table.querySelector('tbody');
        if (!tb) return;

        // בדוק אם יש PREVIEW פתוחים
        const hasOpenPreviews = tb.querySelectorAll('tr[id^="preview-for-"]').length > 0;

        // אם יש PREVIEW פתוחים, אל תסיר את הפונקציונליות
        if (hasOpenPreviews) {
          // Removed excessive logging to reduce console noise
          return;
        }

        // הזרק פונקציונליות חדשה (אידמפוטנטי - מוסיף רק לשורות שחסר להן)
        if (settings && settings.enablePreview) {
          injectPreviewFunctionality(tb);
        }

        // NEW: Also replace barcodes when table changes
        if (settings && settings.replaceBarcodes) {
          replaceBarcodesInViews(table);
        }
        // NEW: Also add copy icons to pick order items when table changes
        // addCopyIconsToPickOrderItems(table); // מנוטרל בכוונה
      }, 200); // הגדל את ה-debounce ל-200ms
    });
    tableObserver.observe(table, {
      childList: true,
      subtree: true
    });



    // ◂ פונקציה לבניית שורת PREVIEW







  }

  prepareCopyElements();

  highlightPickQuantities();

  // ◂ המשך הקוד שלך – MutationObserver וכו׳
  const observer = new MutationObserver((mutationsList) => {
    // 1) skip while copy feedback is active
    if (window._tmCopying) return;

    // 2) ignore mutations coming from the copy icon area
    if (mutationsList.some(m => {
      const el = (m.target?.nodeType === 1 ? m.target : m.target?.parentElement) || null;
      return el && el.closest && el.closest('.tampermonkey-copy-wrap, .copy-icon');
    })) {
      return;
    }

    clearTimeout(observer.debounceTimer);
    observer.debounceTimer = setTimeout(() => {
      if (!window.runMainLogicExecuting) {
        runMainLogic();
      }
      prepareCopyElements();

      // Add clickable links to all tables (including non-visit-row tables)
      addClickableLinksToAllTables();

      // Apply Copy Icon RTL/LTR Fix on DOM changes
      applyCopyIconFix();

      // Only trigger highlightPickQuantities if relevant nodes changed
      const hasQuantityChanges = mutationsList.some(mutation => {
        if (mutation.type === 'childList') {
          // Check added nodes
          for (let node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.querySelector && node.querySelector('td[data-label="כמות / לוקט"]')) {
                return true;
              }
              if (node.matches && node.matches('td[data-label="כמות / לוקט"]')) {
                return true;
              }
            }
          }
        }
        // Check if the changed node itself is a quantity cell
        if (mutation.target && mutation.target.getAttribute &&
            mutation.target.getAttribute('data-label') === 'כמות / לוקט') {
          return true;
        }
        return false;
      });

      if (hasQuantityChanges) {
        highlightPickQuantities();
      }

      // NEW: Also replace barcodes for any DOM changes
      if (settings && settings.replaceBarcodes) {
        replaceBarcodesInViews();
      }

      // NEW: Also add copy icons to pick order items for any DOM changes
      // addCopyIconsToPickOrderItems(); // מנוטרל בכוונה
    }, 100);
  });
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }


  } catch (error) {
    console.error(`[${SCRIPT_NAME}] Error in initialize:`, error);
  }
}

/* =========================
   Ripple for copy actions
   ========================= */
function initCopyRipple(root = document) {
  try {
    // Respect reduced motion
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;

    // הוסף גם תא "שם" כדי לקבל ripple כשמקישים על התא עצמו
    const COPY_SELECTOR = 'td[data-label="שם"], .copy-enabled, .copy-icon, .tampermonkey-copy-wrap, .gallery-product-name, .gallery-sku strong, .font-weight-bold';

    // 1) pointerdown: הכי מוקדם ומכיל קואורדינטות מדויקות
    root.addEventListener('pointerdown', (e) => {
      // TM: robust target for composed events & non-Element targets
      const raw = e.composedPath ? e.composedPath()[0] : e.target;
      const targetEl = raw && raw.nodeType === 1 ? raw : null; // 1 = ELEMENT_NODE
      const target = targetEl ? targetEl.closest(COPY_SELECTOR) : null;
      if (!target) return;
      // ⛔ אל תייצר ripple בתוך אזור שמסומן ללא copy-ui (למשל טבלת החוסרים)
      if (target.closest && target.closest('[data-tm-no-copy-ui]')) return;
      // שמור יעד וקואורדינטות ללוגיקת הטוסט
      window.__tmLastCopyTarget = target;
      window.__tmLastPointer = { x: e.clientX, y: e.clientY, t: performance.now(), target };
      spawnRipple(target, e); // ripple מיידי
    }, { capture:false, passive:true });

    // 2) click: לכיסוי הפעלות מקלדת (Enter/Space) או קליק בלי pointerdown
    root.addEventListener('click', (e) => {
      // TM: robust target for composed events & non-Element targets
      const raw = e.composedPath ? e.composedPath()[0] : e.target;
      const targetEl = raw && raw.nodeType === 1 ? raw : null; // 1 = ELEMENT_NODE
      const target = targetEl ? targetEl.closest(COPY_SELECTOR) : null;
      if (!target) return;
      // ⛔ אל תייצר ripple בתוך אזור שמסומן ללא copy-ui (למשל טבלת החוסרים)
      if (target.closest && target.closest('[data-tm-no-copy-ui]')) return;
      window.__tmLastCopyTarget = target;
      // ייתכן שכבר יצרנו ripple ב-pointerdown; ה-guard ימנע כפילות
      spawnRipple(target, e);
    }, { capture:false, passive:true });
  } catch(_e) {}
}

/* חשב גודל ripple קבוע לפי גובה השורה, עם תחום בטוח */
function getRowRippleSizePx(cell) {
  try {
    const row = cell && cell.closest ? cell.closest('tr') : null;
    const h = (row ? row.getBoundingClientRect().height : 80) || 80;
    // קצת גדול יותר: ~70% מגובה השורה, מוגבל 32–64px
    return Math.max(32, Math.min(64, Math.round(h * 0.7)));
  } catch (_) {
    return 56; // fallback מעט־גדול
  }
}

// Guard לגלי־ripple כפולים: מפת זמנים חלשה פר־Host
const __tmRippleGuard = new WeakMap();
const RIPPLE_GUARD_MS = 200;

// Utility: remove copy styling/tooltip from a cell and its descendants
function stripCopyFrom(root) {
  if (!root) return;
  root.classList.remove('copy-enabled');
  if (root.getAttribute && root.getAttribute('title') === 'לחץ להעתקה') {
    root.removeAttribute('title');
  }
  root.querySelectorAll('.copy-enabled').forEach(el => el.classList.remove('copy-enabled'));
  root.querySelectorAll('[title="לחץ להעתקה"]').forEach(el => el.removeAttribute('title'));
}

// Proactive cleanup: remove copy styling from all dropdown-hosting cells on the page
function cleanupDropdownCells() {
  const dropdownCells = document.querySelectorAll('td[data-label="סטטוס"], td[data-label="ליקוט"]');
  dropdownCells.forEach(cell => {
    // Check if this cell actually contains dropdowns
    if (cell.querySelector('.dropdown-menu, [data-toggle="dropdown"], .select2, .select2-container')) {
      stripCopyFrom(cell);
    }
  });

  // Also check any other cells that might contain dropdowns
  const allCells = document.querySelectorAll('td');
  allCells.forEach(cell => {
    if (cell.querySelector('.dropdown-menu, [data-toggle="dropdown"], .select2, .select2-container')) {
      stripCopyFrom(cell);
    }
  });
}

// Run cleanup immediately and also when DOM is ready
cleanupDropdownCells();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', cleanupDropdownCells);
} else {
  // DOM is already ready, run cleanup
  cleanupDropdownCells();
}

// Watch for new dropdown cells being added dynamically
const dropdownCleanupObserver = new MutationObserver((mutations) => {
  let needsCleanup = false;
  mutations.forEach(mutation => {
    if (mutation.type === 'childList') {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.matches && (node.matches('td[data-label="סטטוס"], td[data-label="ליקוט"]') ||
              node.querySelector('.dropdown-menu, [data-toggle="dropdown"], .select2, .select2-container'))) {
            needsCleanup = true;
          }
          if (node.querySelectorAll) {
            if (node.querySelectorAll('td[data-label="סטטוס"], td[data-label="ליקוט"], .dropdown-menu, [data-toggle="dropdown"], .select2, .select2-container').length > 0) {
              needsCleanup = true;
            }
          }
        }
      });
    }
  });

  if (needsCleanup) {
    // Debounce cleanup to avoid excessive calls
    clearTimeout(window._dropdownCleanupTimeout);
    window._dropdownCleanupTimeout = setTimeout(cleanupDropdownCells, 100);
  }
});

// Start observing
dropdownCleanupObserver.observe(document.documentElement, {
  childList: true,
  subtree: true
});

function spawnRipple(container, evt) {
  try {
    // ⛔ אל תייצר ripple בתוך אזור ללא copy-ui (לדוגמה: טבלת החוסרים)
    if (container && container.closest && container.closest('[data-tm-no-copy-ui]')) {
      return;
    }
    // ארח את ה-ripple על תא הטבלה כדי לקלף בתוך גבולות התא
    const cell = container.closest('td,th');
    const host = cell || container.closest('.tampermonkey-copy-wrap') || container;

    // Avoid clipping/UX issues: disable ripple on dropdown/select2 cells
    const dropdownHost = cell && (
      cell.matches('[data-label="סטטוס"], [data-label="ליקוט"]') ||
      cell.querySelector('.dropdown-menu, [data-toggle="dropdown"], .select2, .select2-container')
    );
    if (dropdownHost) {
      // also ensure no copy styling/tooltip remains
      stripCopyFrom(cell);
      return; // no ripple at all on these cells
    }
    if (cell && !cell.classList.contains('tm-ripple-host')) {
      cell.classList.add('tm-ripple-host'); // position:relative + overflow:hidden
    }

    // מניעת כפילויות: אם ב־RIPPLE_GUARD_MS אחרונים כבר נוצר ripple לאותו host — דלג
    const now = performance.now();
    const lastAt = __tmRippleGuard.get(host) || 0;
    if (now - lastAt < RIPPLE_GUARD_MS) return;
    __tmRippleGuard.set(host, now);

    const rect = host.getBoundingClientRect();
    // גודל קבוע לפי גובה השורה (ללא דיאגון ענק)
    const d = getRowRippleSizePx(cell || host);
    const r = d / 2;

    // מיקום: מרכז התא כברירת מחדל; אם יש קליק משתמש—נשתמש בו
    const x = (evt && typeof evt.clientX === 'number') ? (evt.clientX - rect.left) : (rect.width  / 2);
    const y = (evt && typeof evt.clientY === 'number') ? (evt.clientY - rect.top )  : (rect.height / 2);

    const ripple = document.createElement('span');
    ripple.className = 'tm-ripple';
    ripple.style.width = ripple.style.height = d + 'px';
    ripple.style.left = (x - r) + 'px';
    ripple.style.top  = (y - r) + 'px';
    ripple.style.color = getComputedStyle(host).color; // currentColor (תומך ב-hover #3699ff)
    host.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove(), { once:true });
  } catch(_e) {}
}

// Add event listener only when document.body is available
if (document.body) {
  document.body.addEventListener('click', function (e) {
    // TM: robust target for composed events & non-Element targets
    const raw = e.composedPath ? e.composedPath()[0] : e.target;
    const targetEl = raw && raw.nodeType === 1 ? raw : null; // 1 = ELEMENT_NODE

    // Opt-out declarative: don't show copy UI (ripple/toast) inside marked containers
    // This keeps copy-on-click logic of specific widgets (like the Missing Items table)
    // but prevents toolbox visual feedback that may trigger layout reflow.
    if (targetEl && targetEl.closest('[data-tm-no-copy-ui]')) {
      return;
    }

    // Never trigger copy/ripple inside dropdown/select2 areas or their host cells
    if (
        (targetEl ? targetEl.closest('.dropdown-menu, [data-toggle="dropdown"], .select2, .select2-container') : null) ||
        (targetEl ? targetEl.closest('td') && (
            targetEl.closest('td').matches('[data-label="סטטוס"], [data-label="ליקוט"]') ||
            targetEl.closest('td').querySelector('.dropdown-menu, [data-toggle="dropdown"], .select2, .select2-container')
        ) : null)
    ) {
        return;
    }

    // Ignore clicks on buttons, links, inputs, or media
    if (targetEl ? targetEl.closest('button, a, input, textarea, svg, img') : null) return;

    let target = e.target;

    // --- Handle copy-enabled elements (system-wide) ---
    if (target.classList.contains('copy-enabled')) {
        copyWithFeedback(target, target.textContent.trim());
        return;
    }

    // --- Handle copy-enabled elements inside other elements ---
    const copyEnabledParent = target.closest('.copy-enabled');
    if (copyEnabledParent) {
        copyWithFeedback(copyEnabledParent, copyEnabledParent.textContent.trim());
        return;
    }

    // --- Handle barcode in preview or gallery ---
    if (target.matches('strong.barcode-highlight, strong.barcode-highlight-gallery')) {
        enableCopyStyling(target)
        copyWithFeedback(target, target.textContent.trim());
        return;
    }

    // --- Handle preview name ---
    if (target.classList.contains('font-weight-bold')) {
        enableCopyStyling(target)
        copyWithFeedback(target, target.textContent.trim());
        return;
    }

    // --- Handle gallery product name ---
    if (target.classList.contains('gallery-product-name')) {
        enableCopyStyling(target)
        copyWithFeedback(target, target.textContent.trim());
        return;
    }

    // --- Handle gallery barcode (clicking anywhere in .gallery-sku) ---
    if (target.closest('.gallery-sku')) {
        const strong = target.closest('.gallery-sku').querySelector('strong');
        if (strong) {
            enableCopyStyling(strong); // ✅ apply to correct element
            copyWithFeedback(strong, strong.textContent.trim());
            return;
        }
    }

    // --- Fallback: handle <td> with text (but never the quantity cell) ---
    if (target.tagName === 'TD' && target.textContent.trim() && target.getAttribute('data-label') !== 'כמות / לוקט') {
        enableCopyStyling(target)
        copyWithFeedback(target, target.textContent.trim());
    }
  }, { passive: true });
}

// Inject minimal CSS once (if your project has a CSS pipeline, העבר לשם)
(function injectCopyCSS(){
  if (document.getElementById('tm-copy-css')) return;
  const style = document.createElement('style');
  style.id = 'tm-copy-css';
  style.textContent = `
    .tampermonkey-copy-wrap{display:inline-flex;align-items:center;gap:4px;unicode-bidi:plaintext}
    /* NEW: allow ripple to sit inside without clipping */
    .tampermonkey-copy-wrap{position:relative;overflow:visible}

    /* === NEW: סדר מבוסס כיוון (LTR/RTL) + מרווח לוגי === */
    /* ברירת מחדל LTR: [Copy][Name][Google] */
    html[dir="ltr"] .tampermonkey-copy-wrap > .copy-icon { order:1 }
    html[dir="ltr"] .tampermonkey-copy-wrap > .tm-name-link,
    html[dir="ltr"] .tampermonkey-copy-wrap > .tampermonkey-name-bdi { order:2 }
    html[dir="ltr"] .tampermonkey-copy-wrap > .google-image-icon { order:3 }

    /* RTL: [Google][Name][Copy] — אייקון Google מימין לשם, Copy משמאל */
    html[dir="rtl"] .tampermonkey-copy-wrap > .google-image-icon { order:1 }
    html[dir="rtl"] .tampermonkey-copy-wrap > .tm-name-link,
    html[dir="rtl"] .tampermonkey-copy-wrap > .tampermonkey-name-bdi { order:2 }
    html[dir="rtl"] .tampermonkey-copy-wrap > .copy-icon { order:3 }

    /* מרווח לוגי סביב אייקון Google כדי להפרידו מהשם */
    .tampermonkey-copy-wrap > .google-image-icon {
      display:inline-flex; align-items:center;
      margin-inline-start:6px !important;  /* LTR: רווח אחרי השם */
      margin-inline-end:0 !important;
    }
    html[dir="rtl"] .tampermonkey-copy-wrap > .google-image-icon {
      margin-inline-start:0 !important;
      margin-inline-end:6px !important;    /* RTL: רווח בין האייקון לשם מימין */
    }
    .tampermonkey-copy-wrap > .google-image-icon img { width:14px; height:14px; display:block; }
    .tampermonkey-barcode-bdi{direction:ltr;unicode-bidi:plaintext}
    .tampermonkey-name-bdi{direction:auto;unicode-bidi:plaintext}
    .copy-icon{color:#3699ff;cursor:pointer;line-height:1;flex:0 0 auto;display:inline-block;width:1.2em;height:1.2em;vertical-align:middle}
    .copy-icon svg{width:100%;height:100%;display:block;fill:currentColor}
    /* === NEW: Hover color on copyable text + text cursor without clicking === */
    .copy-enabled:hover,
    .tampermonkey-copy-wrap:hover,
    .gallery-product-name:hover,
    .font-weight-bold:hover,
    .gallery-sku strong:hover {
      color:#3699ff !important;
    }
    /* Always show text-cursor inside tagged tables */
    table[data-columns-tagged="true"] td { cursor:text; }
    /* No visible focus border on focused tables */
    table.tm-focusable:focus { outline:none !important; }

    /* === Force visible link styling for product names === */
    td[data-label="שם"] a.tm-name-link {
      color: #3699ff !important;
    }
    td[data-label="שם"] a.tm-name-link:visited {
      color: #3699ff !important;
    }
    /* Keep link color on hover even though the container changes color */
    .tampermonkey-copy-wrap:hover a.tm-name-link {
      color: #3699ff !important;
    }

    /* === NEW: Ripple effect === */
    .tm-ripple {
      position:absolute;
      border-radius:50%;
      transform:scale(0);
      opacity:0.35;
      pointer-events:none;
      background: currentColor;
      animation: tm-ripple 450ms ease-out;
      will-change: transform, opacity;
    }
    /* תאים שמארחים ripple צריכים position:relative ו-overflow:hidden */
    .tm-ripple-host {
      position: relative !important;
      overflow: hidden !important;
    }

    /* === FIX: אל תשנה display של תאי טבלה — רק יישור אנכי קלאסי === */
    td.tm-flex-cell, th.tm-flex-cell { vertical-align: middle; }
    td[data-label="שם"], th[data-label="שם"] { vertical-align: middle; }
    @keyframes tm-ripple {
      /* שמור על scale מתון כדי למנוע גלישה/גלישה */
      to { transform:scale(2.2); opacity:0; }
    }


  `;
  document.head.appendChild(style);
})();

// === Core Copy Icon Fix Function ===
function applyCopyIconFix(root = document){
  const rows = root.querySelectorAll('table[data-columns-tagged="true"] tbody tr');
  rows.forEach(tr => {
    fixBarcodeCell(tr);
    fixNameCell(tr);
  });

  function ensureWrap(td){
    let wrap = td.querySelector(':scope > .tampermonkey-copy-wrap');
    if (!wrap){
      wrap = document.createElement('span');
      wrap.className = 'tampermonkey-copy-wrap';
      while (td.firstChild) wrap.appendChild(td.firstChild);
      td.appendChild(wrap);
    }

    /* === FIX: סמן רק את תא "שם" — לא עמודות אחרות === */
    if (td) {
      const isNameCell =
        (td.getAttribute('data-label') === 'שם') ||
        (td.tagName === 'TH' && /^\s*שם\s*$/.test(td.textContent || ''));
      if (isNameCell && !td.classList.contains('tm-flex-cell')) {
        td.classList.add('tm-flex-cell');
      }
    }

    return wrap;
  }

  function ensureCopyIcon(wrap, getText){
    let icon = wrap.querySelector(':scope > .copy-icon');
    const text = (getText?.() || '').trim();

    // If no text content, hide or remove the icon
    if (!text) {
      if (icon) {
        icon.style.display = 'none';
      }
      return null;
    }

    if (!icon){
      icon = buildCopyFAIcon('העתק', withCopying(() => {
        const t = (getText?.() || '').trim();
        if (!t) return;
        // ה־override של clipboard ידאג לטוסט; לא נקרא ישירות ל-tmToast כדי למנוע כפילויות
        navigator.clipboard.writeText(t).catch(console.warn);
      }));
    }else{
      icon.classList.add('copy-icon');
      icon.style.display = ''; // Show the icon if it was hidden
    }
    // וידוא שהאיקון בסוף הוויזואלי (מיד אחרי הטקסט/BDI)
    if (wrap.lastChild !== icon) wrap.appendChild(icon);
    return icon;
  }

  function fixBarcodeCell(tr){
    const td = tr.querySelector('td[data-label="מק״ט"], td[data-label="ברקוד"]');
    if (!td) return;
    const wrap = ensureWrap(td);

    // Find current value element
    let valEl = wrap.querySelector('.barcode-highlight') ||
                wrap.querySelector('span, b, strong') ||
                Array.from(wrap.childNodes).find(n => n.nodeType === Node.TEXT_NODE);

    if (!valEl) return;

    // Ensure BDI LTR around the barcode
    let bdi = wrap.querySelector(':scope > .tampermonkey-barcode-bdi');
    if (!bdi){
      bdi = document.createElement('bdi');
      bdi.className = 'tampermonkey-barcode-bdi';
      /* bidi-safe: מציג תמיד משמאל לימין כדי למנוע "קפיצה" של הספרות */
      bdi.setAttribute('dir','ltr');
      // Move the value node inside the BDI
      bdi.appendChild(valEl.parentNode ? valEl.parentNode.removeChild(valEl) : valEl);
      // Insert BDI as first child
      if (wrap.firstChild) {
        safeInsertBefore(wrap.firstChild, bdi, wrap);
      } else {
        wrap.appendChild(bdi);
      }
    }

    // הדגש 3 ספרות אחרונות ב-BDI
    __tmcBoldLast3DigitsInElement(bdi);

    // Check if barcode has content before showing icon
    const barcodeText = bdi.textContent.trim();
    if (barcodeText) {
      // Ensure icon comes immediately after the BDI (visually at the end)
      ensureCopyIcon(wrap, () => bdi.textContent);
    } else {
      // Hide icon if no barcode content
      ensureCopyIcon(wrap, () => '');
    }
  }

  function fixNameCell(tr){
    const td = tr.querySelector('td[data-label="שם"]');
    if (!td) return;

    // Check if this is the store visits table - if so, don't add copy icon for name cells
    const table = tr.closest('table');
    if (table && (table.id === 'operator-store-visits-table' ||
                  table.closest('#operator-store-visits-table_wrapper'))) {
      return; // Skip adding copy icon for name cells in store visits table
    }

    const wrap = ensureWrap(td);

    // Ensure BDI AUTO around the name/link for mixed RTL/LTR
    let bdi = wrap.querySelector(':scope > .tampermonkey-name-bdi');
    if (!bdi){
      bdi = document.createElement('bdi');
      bdi.className = 'tampermonkey-name-bdi';
      bdi.dir = 'auto';
      if (wrap.firstChild) {
        safeInsertBefore(wrap.firstChild, bdi, wrap);
      } else {
        wrap.appendChild(bdi);
      }
    }

    // מיזוג טקסט/אלמנטים שאינם אייקון גוגל/אייקון העתקה לתוך ה-BDI
    // (ב-side panel הטקסט ישב מחוץ ל-BDI ולכן nameText יוצא ריק והאייקון מוסתר)
    let node = bdi.nextSibling;
    while (node) {
      const next = node.nextSibling;
      const isEl = node.nodeType === 1;
      const isCopyIcon = isEl && node.classList.contains('copy-icon');
      const isGoogleIcon = isEl && node.classList.contains('google-image-icon');

      // מכניסים לתוך ה-BDI טקסטים ואלמנטים שאינם אייקון גוגל/העתקה
      if (node.nodeType === Node.TEXT_NODE || (isEl && !isGoogleIcon && !isCopyIcon)) {
        bdi.appendChild(node);
      }
      // עוצרים לפני ה-copy-icon אם יש
      if (isCopyIcon) break;
      node = next;
    }

    // בחירת node לשם: העדף <a> שאינו אייקון גוגל, אחרת ה-BDI, אחרת טקסט ראשון לא-ריק
    let nameNode =
      wrap.querySelector(':scope > a:not(.google-image-icon)') ||
      wrap.querySelector(':scope > .tampermonkey-name-bdi') ||
      Array.from(wrap.childNodes).find(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim()) ||
      wrap.firstChild;
    if (!nameNode) return;

    // Check if name has content before showing icon
    const nameText = (bdi.innerText || bdi.textContent || '').trim();
    if (nameText) {
      // Ensure icon right after the BDI (i.e., at the visual end of the name)
      const icon = ensureCopyIcon(wrap, () => bdi.innerText || bdi.textContent);
      // אם האייקון קיים אך מוסתר, ובפועל יש טקסט – נציג אותו
      if (icon && nameText && getComputedStyle(icon).display === 'none') {
        icon.style.display = '';
      }
    } else {
      // Hide icon if no name content
      ensureCopyIcon(wrap, () => '');
    }

    // ודא שהתא מסומן להעתקה גם בפאנלים צדדיים
    // Do not enable copy on dropdown/select2 host cells (also strip existing marks)
    const isDropdownHost = td && (
      td.matches('[data-label="סטטוס"], [data-label="ליקוט"]') ||
      td.querySelector('.dropdown-menu, [data-toggle="dropdown"], .select2, .select2-container')
    );
    if (!isDropdownHost) {
      if (!td.classList.contains('copy-enabled')) td.classList.add('copy-enabled');
      if (!td.hasAttribute('title')) td.setAttribute('title','לחץ להעתקה');
    } else {
      stripCopyFrom(td);
    }
  }

  // Fix shipment wrapping after applying copy icon fix
          // fixShipmentWrapping(); // Removed for performance

  // Also clean up any dropdown cells that might have copy styling
  cleanupDropdownCells();
}

function createCopyIcon(textToCopy, { title='העתק' } = {}){
  const text = (textToCopy || '').trim();
  // Don't create icon if no text content
  if (!text) {
    const hidden = document.createElement('span');
    hidden.className = 'copy-icon';
    hidden.style.display = 'none';
    return hidden;
  }
  const svg = buildCopyFAIcon(title, withCopying(() => {
    const t = (textToCopy || '').trim();
    if (!t) return;
    navigator.clipboard.writeText(t).then(()=> tmToast('הועתק!', svg)).catch(console.warn);
  }));

  // Fix shipment wrapping after creating copy icon
          // fixShipmentWrapping(); // Removed for performance

  return svg;
}

function addClickableLinksToAllTables(force = false) {
    try {
        // Find all tables with data-label="שם" cells (including side panels)
        const allTables = document.querySelectorAll('table.table.table-hover[data-columns-tagged="true"], .offcanvas table.table, .modal table.table, #panel_view table.table');

        allTables.forEach(table => {
            // ⛔ דלג על חלונית ליקוט ועל טבלת החוסרים
            if (table.classList && table.classList.contains('pick-order-item-table')) return;
            if (table.closest && table.closest('#missing-table-container')) return;

            // Skip store visits table - don't add copy icons for names there
            if (table.id === 'operator-store-visits-table' ||
                table.closest('#operator-store-visits-table_wrapper')) {
                return;
            }

            const rows = table.querySelectorAll('tbody tr:not([data-tm-links-done])');

            rows.forEach(row => {
                // Throttle rescans per row (extra safety)
                const now = Date.now();
                const last = +(row.getAttribute('data-tm-last-scan') || 0);
                const THROTTLE_MS = 500; // was 1500
                if (!force && (now - last < THROTTLE_MS)) return;
                row.setAttribute('data-tm-last-scan', now);

                let didNameLink = false;
                let didOtherWork = false;

                // Find name cell robustly (tablet/responsive safe)
                let nameCell = row.querySelector('td[data-label="שם"]') ||
                               (row.cells && row.cells[2]) ||
                               row.querySelector('td:nth-child(3)');
                if (!nameCell) return;
                // דלג רק אם כבר קיים קישור "אמיתי" שאינו אייקון גוגל
                const hasNonGoogleLink = nameCell.querySelector('a:not(.google-image-icon)');
                if (hasNonGoogleLink) return;

                // Find barcode/SKU cell robustly (recognize both headers; no blind column fallback)
                let skuCell = row.querySelector('td[data-label="מק״ט"], td[data-label="ברקוד"]') ||
                              row.querySelector('td[data-original-sku]') ||
                              (row.querySelector('td [data-original-sku]') && row.querySelector('td [data-original-sku]').closest('td')) ||
                              (row.querySelector('td .barcode-highlight') && row.querySelector('td .barcode-highlight').closest('td'));

                // אפשר לעבוד גם בלי מק"ט (side panel) – נחשב sku רק אם יש תא מתאים
                const productName = nameCell.textContent.trim();
                const sku = skuCell
                  ? ((skuCell.querySelector('.barcode-highlight')?.textContent) ||
                     skuCell.dataset.originalSku ||
                     skuCell.textContent || '').trim()
                  : '';
                if (!productName) return;

                // אל תמנע יצירת קישור בגלל כפתורים מחוץ לתא עצמו
                const hasAnipetButton = nameCell.querySelector('.anipet-alternatives-btn');

                // Only process if there's no Anipet button
                if (!hasAnipetButton) {
                    // Try to find a match for this product
                    const match = findImageMatch(sku, productName);

                    if (match && match.link) {
                        // Preserve Google image icon if exists
                        const googleIcon = nameCell.querySelector('.google-image-icon');
                        // Clear the cell content
                        nameCell.innerHTML = '';
                        if (googleIcon) nameCell.appendChild(googleIcon);

                        // Create copy icon with enhanced feedback
                        const copyIcon = createCopyIcon(productName);

                        // Create link
                        const link = document.createElement('a');
                        link.classList.add('tm-name-link'); // force link styling specifically for name links
                        link.href = match.link;
                        link.target = '_blank';
                        link.rel = 'noopener noreferrer';
                        link.textContent = productName;

                        // Append link first, then copy icon (icon will float left)
                        nameCell.appendChild(link);
                        nameCell.appendChild(copyIcon);
                        didNameLink = true;
                    } else {
                        // No link available → preserve existing text and just add a copy icon
                        const googleIcon = nameCell.querySelector('.google-image-icon');
                        const existingText = productName; // already captured before any mutations
                        // Rebuild minimally: [googleIcon?] plain text + copy icon
                        nameCell.innerHTML = '';
                        if (googleIcon) nameCell.appendChild(googleIcon);
                        nameCell.appendChild(document.createTextNode(existingText));
                        nameCell.appendChild(createCopyIcon(existingText));
                        didOtherWork = true;
                    }
                }

                // הוספת אייקון העתקה למק"ט – רק אם קיימת עמודת מק"ט בטבלה הזו
                if (skuCell) {
                    let skuCellBarcode = skuCell.querySelector('.barcode-highlight, span.barcode-highlight');
                    if (!skuCellBarcode) {
                        const tn = [...skuCell.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
                        if (tn) {
                            const span = document.createElement('span');
                            span.className = 'barcode-highlight';
                            span.textContent = tn.textContent.trim();
                            skuCell.replaceChild(span, tn);
                            skuCellBarcode = span;
                        }
                    }
                    if (skuCellBarcode && !skuCell.querySelector('.copy-icon')) {
                        const barcodeText = skuCellBarcode.textContent.trim();
                        if (barcodeText) {
                            // Create copy icon for barcode
                            const barcodeCopyIcon = createCopyIcon(barcodeText);
                            barcodeCopyIcon.style.marginLeft = '4px';
                            barcodeCopyIcon.style.marginRight = '0px';

                            // Insert the copy icon after the barcode (safe method)
                            if (skuCellBarcode && skuCellBarcode.isConnected) {
                                skuCellBarcode.insertAdjacentElement('afterend', barcodeCopyIcon);
                            } else {
                                // Fallback: append to parent cell
                                const parentCell = skuCellBarcode?.closest('td') || skuCellBarcode?.parentNode;
                                if (parentCell) parentCell.appendChild(barcodeCopyIcon);
                            }
                            didOtherWork = true;
                        }
                    }
                }

                // Mark row as processed only when we actually add a clickable name link
                if (didNameLink) row.setAttribute('data-tm-links-done', 'true');
            });
        });
    } catch (error) {
        console.error(`[${SCRIPT_NAME}] Error in addClickableLinksToAllTables:`, error);
    }

    // Fix shipment wrapping after adding clickable links
    // fixShipmentWrapping(); // Removed for performance

    return true; // Return success indicator
}

// ===============================
// Phone validation + yellow blink
// ===============================
// כללים:
// - פחות מ־8 ספרות => להבהב
// - מקסימום 10 ספרות => אם 11+ => להבהב
// - 9 ספרות שחסר להן 0 בהתחלה => לא להבהב (ממילא 8–10 נחשבים תקינים כאן)
// - מתחיל ב־04 ובאורך 9 => לא להבהב (גם מכוסה ע"י 8–10)
// - להתעלם ממקפים באמצע (לא נספרים כספרות)
// - חדש: פורמט בינ"ל ישראלי (972/00972 + מספר ללא ה-0) באורך כולל 11–12 ספרות => תקין, לא להבהב
// - חדש: כל מספר חייב להתחיל ב-0, למעט חריג מפורש – אם הוא בן 9 ספרות והספרה הראשונה אינה 0: לא מהבהב
function validatePhonesEverywhere(root = document){
  try{
    __tmcEnsurePhoneCSS();
    const scope = root || document;
    const cells = scope.querySelectorAll('td[data-label="טלפון"]');
    cells.forEach(td => {
      const tr = td.closest('tr[id^="visit-row-"]');
      if (!tr) return;
      if (td.classList.contains('loading') || td.classList.contains('skeleton')) return;
      if (tr.classList.contains('loading') || tr.classList.contains('skeleton')) return;

      const raw = String(td.innerText || td.textContent || '').replace(/\u00A0/g, ' ').trim();
      const digits = raw.replace(/[^\d]/g, '');
      const isEmptyCell = !td.firstElementChild && raw.length === 0;

      if (isEmptyCell || digits.length < 9) {
        __tmcSetRowBlink(tr, true);
      } else {
        __tmcSetRowBlink(tr, false);
      }
    });
  }catch(e){
    if (typeof DEBUG!=='undefined' && DEBUG) console.warn('[Toolbox] validatePhonesEverywhere error:', e);
  }
}

// Give late-rendered cells a second and third pass
requestAnimationFrame(() => {
  addClickableLinksToAllTables();
  const panel = document.querySelector('.offcanvas, .offcanvas-right, .offcanvas-custom, #panel_view');
  if (panel) addClickableLinksToAllTables();
});
requestAnimationFrame(() => {
  validatePhonesEverywhere();
  const panel = document.querySelector('.offcanvas, .offcanvas-right, .offcanvas-custom, #panel_view');
  if (panel) validatePhonesEverywhere(panel);
});
setTimeout(() => {
  addClickableLinksToAllTables();
  const panel = document.querySelector('.offcanvas, .offcanvas-right, .offcanvas-custom, #panel_view');
  if (panel) addClickableLinksToAllTables();
}, 200);
setTimeout(() => {
  validatePhonesEverywhere();
  const panel = document.querySelector('.offcanvas, .offcanvas-right, .offcanvas-custom, #panel_view');
  if (panel) validatePhonesEverywhere(panel);
}, 200);
setTimeout(() => {
  addClickableLinksToAllTables();
  const panel = document.querySelector('.offcanvas, .offcanvas-right, .offcanvas-custom, #panel_view');
  if (panel) addClickableLinksToAllTables();
}, 600);
setTimeout(() => {
  validatePhonesEverywhere();
  const panel = document.querySelector('.offcanvas, .offcanvas-right, .offcanvas-custom, #panel_view');
  if (panel) validatePhonesEverywhere(panel);
}, 600);
setTimeout(() => {
  addClickableLinksToAllTables();
  const panel = document.querySelector('.offcanvas, .offcanvas-right, .offcanvas-custom, #panel_view');
  if (panel) addClickableLinksToAllTables();
}, 1500);
setTimeout(() => {
  validatePhonesEverywhere();
  const panel = document.querySelector('.offcanvas, .offcanvas-right, .offcanvas-custom, #panel_view');
  if (panel) validatePhonesEverywhere(panel);
}, 1500);

// MutationObserver hook for dynamically added/updated rows (including side panels)
(function observeTablesEverywhere(){
  const runFor = oncePerAnimationFrame(() => addClickableLinksToAllTables());
  const runPhones = oncePerAnimationFrame((target = document) => validatePhonesEverywhere(target));

  const mo = new MutationObserver(muts => {
    let touched = false;
    let touchedPanel = false;
    let touchedPhonesPanel = false;
    for (const m of muts) {
      if (m.addedNodes && m.addedNodes.length) {
        touched = true;
        if ([...m.addedNodes].some(n =>
          n.nodeType === 1 && (n.matches?.('.offcanvas, .offcanvas-right, .offcanvas-custom, #panel_view') ||
          n.closest?.('.offcanvas, .offcanvas-right, .offcanvas-custom, #panel_view')))) {
          touchedPanel = true;
        }
      }
      if (m.type === 'characterData') {
        const el = m.target?.parentElement;
        if (el && el.closest) {
          if (el.closest('td[data-label="טלפון"]')) {
            touched = true;
            if (el.closest('.offcanvas, .offcanvas-right, .offcanvas-custom, #panel_view')) {
              touchedPanel = true;
              touchedPhonesPanel = true;
            }
          }
        }
      }
      if (m.type === 'attributes') {
        const el = m.target?.closest ? m.target.closest('td[data-label="טלפון"]') : null;
        if (el) {
          touched = true;
          if (el.closest('.offcanvas, .offcanvas-right, .offcanvas-custom, #panel_view')) {
            touchedPanel = true;
            touchedPhonesPanel = true;
          }
        }
      }
    }
    if (touched) {
      runFor(document);
      runPhones(document);
      const panel = document.querySelector('.offcanvas.show, .offcanvas-right.show, .offcanvas-custom.show, #panel_view');
      if (panel && (touchedPanel || touchedPhonesPanel)) {
        runFor(panel);
        if (touchedPhonesPanel) {
          validatePhonesEverywhere(panel);
        } else {
          runPhones(panel);
        }
      }
    }
  });

  if (document.body) {
    mo.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['data-label','title']
    });
  }

  // Bootstrap offcanvas events – כשנפתח/נסגר, תריץ על הפאנל
  document.addEventListener('shown.bs.offcanvas', () => {
    const panel = document.querySelector('.offcanvas.show, .offcanvas-right.show, .offcanvas-custom.show, #panel_view');
    if (panel){
      runFor(panel);
      validatePhonesEverywhere(panel);
    }
  });
})();

if (window.jQuery && jQuery.fn && jQuery.fn.dataTable && !window.__tmcPhonesBound){
  window.__tmcPhonesBound = true;
  jQuery(document).on('draw.dt', () => {
    try{ validatePhonesEverywhere(document); }catch(_){}
  });
}

// Expose function immediately for console access
window.addClickableLinksToAllTables = addClickableLinksToAllTables;

// Expose to the page (Chrome & Firefox)
try {
  if (typeof unsafeWindow !== 'undefined') {
    // Firefox needs exportFunction to cross compartments
    if (typeof exportFunction === 'function') {
      unsafeWindow.addClickableLinksToAllTables =
        exportFunction(addClickableLinksToAllTables, unsafeWindow);
    } else {
      unsafeWindow.addClickableLinksToAllTables = addClickableLinksToAllTables;
    }
    // Also attach a plain global so you can call it directly in the page console
    unsafeWindow.addClickableLinksToAllTables_alias = unsafeWindow.addClickableLinksToAllTables;

    console.log('[Toolbox] Function exposed to page context successfully');
  }
} catch (e) {
  console.warn('[Toolbox] Expose to page failed:', e);
}

function copyWithFeedback(element, text) {
    try {
        if (!element || !text) return;

        navigator.clipboard.writeText(text).then(() => {
            // Add visual feedback
            element.classList.add('cell-copied');

            // Change text color to #3699ff for 1 second
            const originalColor = element.style.color || getComputedStyle(element).color;
            element.style.color = '#3699ff !important';

            // Show toast notification
            tmToast('הועתק!', element);

            // Add ripple effect for programmatic copy
            spawnRipple(element, {clientX: null, clientY: null});

            setTimeout(() => {
                element.classList.remove('cell-copied');
                if (originalColor && originalColor !== 'rgba(0, 0, 0, 0)') {
                    element.style.color = originalColor + ' !important';
                } else {
                    element.style.removeProperty('color');
                }
            }, 1000); // 1 second
        }).catch(err => {
            console.warn('Copy failed:', err);
        });
    } catch (error) {
        console.error(`[${SCRIPT_NAME}] Error in copyWithFeedback:`, error);
    }

    // Fix shipment wrapping after copy feedback
    // fixShipmentWrapping(); // Removed for performance
}






      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize, { passive: true });
    } else {
        initialize();
    }

// Expose toolbox functions globally for enhanced search to use
window.injectImagesAndLinks = injectImagesAndLinks;
window.injectImagesInRegularTables = injectImagesInRegularTables;
window.injectImagesInOrderItemRows = injectImagesInOrderItemRows;
window.replaceBarcodesInViews = replaceBarcodesInViews;
window.replaceBarcodesInDOM = replaceBarcodesInDOM; // Backward compatibility - calls unified function
window.tagColumnsForHiding = tagColumnsForHiding;
window.findImageMatch = findImageMatch;
window.findBarcode = findBarcode;
// window.createImageElement = createImageElement; // Removed duplicate - already exposed earlier
window.addClickableLinksToAllTables = addClickableLinksToAllTables;
// Expose new performance and error handling functions
window.isElementProcessed = isElementProcessed;
window.markElementAsProcessed = markElementAsProcessed;
window.processBarcodeElement = processBarcodeElement;
// Expose ready highlighting functions for manual use
window.highlightReadyRows = highlightReadyRows;
window.debouncedHighlightReadyRows = debouncedHighlightReadyRows;

// Expose cache functions for debugging
window.cacheGet = cacheGet;
window.cacheSet = cacheSet;
window.cacheInvalidate = cacheInvalidate;
window.cacheInvalidateAll = cacheInvalidateAll;
window.rowColorCache = rowColorCache;

// פתרון: מאזין לפתיחה של modal ואז מוסיף תמונות לאחר שה-Enhanced סיים
const enhancedSafeObserver = new MutationObserver((mutations) => {
    // 1) skip while copy feedback is active
    if (window._tmCopying) return;

    // 2) ignore mutations coming from the copy icon area
    if (mutations.some(m => {
      const el = (m.target?.nodeType === 1 ? m.target : m.target?.parentElement) || null;
      return el && el.closest && el.closest('.tampermonkey-copy-wrap, .copy-icon');
    })) {
      return;
    }

    const modal = document.querySelector('#order-items-edit-modal.show');
    if (!modal) return;

    let attempts = 0;
    const maxAttempts = 50; // Reduced from infinite to prevent long-running handlers
    const interval = setInterval(() => {
        attempts++;
        const table = modal.querySelector('table');
        const tbody = modal.querySelector('tbody');
        if (table && tbody && table.querySelectorAll('tr').length > 0) {
            // Use setTimeout for heavy DOM operations to avoid blocking (more reliable than requestIdleCallback)
            setTimeout(() => {
                try {
                    injectImagesAndLinks(modal);
                    injectImagesInRegularTables(modal);
                    injectImagesInOrderItemRows(modal);
                    replaceBarcodesInViews(modal); // Unified barcode replacement
                } catch (err) {
                    console.debug('[Toolbox] Modal injection error:', err);
                }
            }, 0);
            clearInterval(interval);
        } else if (attempts >= maxAttempts) {
            // Stop trying after max attempts to prevent infinite loops
            clearInterval(interval);

            // ✅ Start observing tbody for changes — to reinject if rows are replaced
            const observer = new MutationObserver((mutations) => {
                // 1) skip while copy feedback is active
                if (window._tmCopying) return;

                // 2) ignore mutations coming from the copy icon area
                if (mutations.some(m => {
                  const el = (m.target?.nodeType === 1 ? m.target : m.target?.parentElement) || null;
                  return el && el.closest && el.closest('.tampermonkey-copy-wrap, .copy-icon');
                })) {
                  return;
                }

                injectImagesAndLinks(modal);
                injectImagesInRegularTables(modal);
                injectImagesInOrderItemRows(modal);
                replaceBarcodesInViews(modal); // Unified barcode replacement
            });
            observer.observe(tbody, { childList: true, subtree: true });
        }
    }, 300); // בדיקה כל 300ms
});

if (document.body) {
  enhancedSafeObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// פתרון נוסף: מאזין לאירוע מותאם אישית מ-Enhanced
window.addEventListener('enhanced-modal-ready', () => {
    const modal = document.querySelector('#order-items-edit-modal');
    if (!modal) return;

    let attempts = 0;
    const maxAttempts = 50; // Reduced from infinite to prevent long-running handlers
    const interval = setInterval(() => {
        attempts++;
        const table = modal.querySelector('table');
        const tbody = modal.querySelector('tbody');
        if (table && tbody && table.querySelectorAll('tr').length > 0) {
            // Use setTimeout for heavy DOM operations to avoid blocking (more reliable than requestIdleCallback)
            setTimeout(() => {
                try {
                    injectImagesAndLinks(modal);
                    injectImagesInRegularTables(modal);
                    injectImagesInOrderItemRows(modal);
                } catch (err) {
                    console.debug('[Toolbox] Modal injection error:', err);
                }
            }, 0);
            clearInterval(interval);
        } else if (attempts >= maxAttempts) {
            // Stop trying after max attempts to prevent infinite loops
            clearInterval(interval);

            // ✅ Start observing tbody for changes — to reinject if rows are replaced
            const observer = new MutationObserver((mutations) => {
                // 1) skip while copy feedback is active
                if (window._tmCopying) return;

                // 2) ignore mutations coming from the copy icon area
                if (mutations.some(m => {
                  const el = (m.target?.nodeType === 1 ? m.target : m.target?.parentElement) || null;
                  return el && el.closest && el.closest('.tampermonkey-copy-wrap, .copy-icon');
                })) {
                  return;
                }

                injectImagesAndLinks(modal);
                injectImagesInRegularTables(modal);
                injectImagesInOrderItemRows(modal);
                replaceBarcodesInViews(modal); // Unified barcode replacement
            });
            observer.observe(tbody, { childList: true, subtree: true });
        }
    }, 300); // בדיקה כל 300ms
}, { passive: true });

// --- חשיפה גלובלית ל-Enhanced ---
window.injectImagesAndLinks = window.injectImagesAndLinks || injectImagesAndLinks;
window.__TOOLBOX_READY__ = true;
window.dispatchEvent(new CustomEvent('toolbox-ready'));

/* Removed legacy openPreviewForTask function - replaced with optimized openPreviewForRow */

// Helper function to update button state (chevron and title)
function updateButtonState(button, isOpen) {
  const icon = button.querySelector('i');
  if (icon) {
    // נקה את כל ה-classes הקשורים לאייקונים
    icon.classList.remove('fa-chevron-down', 'fa-chevron-up', 'fa-chevron-left', 'fa-refresh', 'fa-spin', 'fa-exclamation-triangle');

    if (isOpen) {
      icon.classList.add('fa-chevron-left');
      button.title = 'הסתר פריטים';
    } else {
      icon.classList.add('fa-chevron-down');
      button.title = 'הצג פריטים';
    }
  }
}

// Helper function to toggle preview sections (calculator/notes)
function togglePreviewSection(button, sectionType) {
  const previewRow = button.closest('tr[id^="preview-for-"]');
  if (!previewRow) return;

  const section = previewRow.querySelector(`.${sectionType}-section`);
  if (!section) return;

  const isVisible = section.style.display !== 'none';

  if (isVisible) {
    // Hide section
    section.style.display = 'none';
    button.classList.remove('active');
  } else {
    // Show section
    section.style.display = 'block';
    button.classList.add('active');
  }
}

// MutationObserver שמזהה הכנסת שורה חדשה עם אותו taskId ופותח preview מחדש
(function setupPreviewAutoRestore() {
  // בדוק אם זה session חדש (אחרי REFRESH)
  const sessionStartTime = sessionStorage.getItem('sessionStartTime');
  const currentTime = Date.now();

  if (!sessionStartTime) {
    // זה session חדש - נקה את ה-PREVIEWs הפתוחים ושמור את זמן התחלה
    sessionStorage.removeItem('openPreviewTaskIds');
    sessionStorage.removeItem('openPreviewTaskIds_v2');
    sessionStorage.setItem('sessionStartTime', currentTime.toString());
  } else {
    // בדוק אם יש PREVIEWs ישנים ב-sessionStorage
    const openPreviews = JSON.parse(sessionStorage.getItem('openPreviewTaskIds') || '[]');
    if (openPreviews.length > 0) {
      // נקה את ה-PREVIEWs הישנים רק אם זה session חדש (אחרי REFRESH)
      // אבל אל תמחק אם זה session ישן (אחרי שינוי סטטוס)
      const sessionAge = currentTime - parseInt(sessionStartTime);
      if (sessionAge < 5000) {
        sessionStorage.removeItem('openPreviewTaskIds');
        sessionStorage.removeItem('openPreviewTaskIds_v2');
      }
    }
  }

  function setupObserver() {
    const table = document.querySelector('#operator-store-visits-table');
    if (!table) {
      setTimeout(setupObserver, 500);
      return;
    }
    const tbody = table.querySelector('tbody');
    if (!tbody) {
      setTimeout(setupObserver, 500);
      return;
    }

    const observer = new MutationObserver((mutations) => {
    // 1) skip while copy feedback is active
    if (window._tmCopying) return;

    // 2) ignore mutations coming from the copy icon area
    if (mutations.some(m => {
      const el = (m.target?.nodeType === 1 ? m.target : m.target?.parentElement) || null;
      return el && el.closest && el.closest('.tampermonkey-copy-wrap, .copy-icon');
    })) {
      return;
    }

    // בדוק אם יש previews פתוחים ב-sessionStorage
    // Disable auto-restore after reload/entry. We still track state during this
    // live page session, but we never reopen on load.
    const openTaskIds = (sessionStorage.getItem('tmcNoRestore') === '1')
      ? []
      : [];

    // בדוק כל preview פתוח
    openTaskIds.forEach(taskId => {
      const row = tbody.querySelector('tr[data-task-id="' + taskId + '"]');
      const existingPreview = document.getElementById(`preview-for-${taskId}`);

      if (row && !existingPreview) {
        // Use optimized preview function
        const row = document.querySelector(`tr[data-task-id="${taskId}"]`);
        if (row) openPreviewForRow(row);
      } else if (!row) {
        // אם השורה לא נמצאה, נסה שוב אחרי קצת זמן
        setTimeout(() => {
          const retryRow = tbody.querySelector('tr[data-task-id="' + taskId + '"]');
          const retryPreview = document.getElementById(`preview-for-${taskId}`);
          if (retryRow && !retryPreview) {
            // Use optimized preview function
        const row = document.querySelector(`tr[data-task-id="${taskId}"]`);
        if (row) openPreviewForRow(row);
          } else if (!retryRow) {
            // נסה שוב אחרי זמן נוסף
            setTimeout(() => {
              const secondRetryRow = tbody.querySelector('tr[data-task-id="' + taskId + '"]');
              const secondRetryPreview = document.getElementById(`preview-for-${taskId}`);
              if (secondRetryRow && !secondRetryPreview) {
                // Use optimized preview function
        const row = document.querySelector(`tr[data-task-id="${taskId}"]`);
        if (row) openPreviewForRow(row);
              }
            }, 500);
          }
        }, 100);
      }
    });
    });

    observer.observe(tbody, { childList: true, subtree: true });
  }

  setupObserver();

  // Once the page is up, explicitly clear the "no restore" flag for
  // subsequent in-page actions (but keep not restoring on full reloads)
  try { sessionStorage.setItem('tmcNoRestore','1'); } catch(_) {}
})();

})(); //

/* ==========================================
   Unified "Copied!" toast (single element + smooth GPU anim)
   ========================================== */
let __tmToastEl = null;
let __tmToastTimer = null;

function installCopyToastBaseCSS(){
  try{
    if (document.getElementById('tm-copy-toast-style-v3')) return;
    const style = document.createElement('style');
    style.id = 'tm-copy-toast-style-v3';
    style.textContent = `
      .tm-copy-toast-pop{
        position:fixed;
        transform:translate3d(-50%,0,0) translateY(6px);
        background:rgba(0,0,0,0.85); /* 85% שקיפות אמיתית */
        color:#fff;
        font:500 13px/1.2 system-ui,-apple-system,Segoe UI,Roboto,Arial;
        padding:8px 12px;
        border-radius:10px;
        opacity:0;
        z-index:2147483647;
        pointer-events:none;
        white-space:nowrap;
        will-change:transform,opacity;
        backface-visibility:hidden;
        contain:paint;
      }
    `;
    document.head.appendChild(style);
  }catch(_e){}
}

function ensureToastEl(){
  if (__tmToastEl && document.body && document.body.contains(__tmToastEl)) return __tmToastEl;
  __tmToastEl = document.createElement('div');
  __tmToastEl.id = 'tm-copy-toast';
  __tmToastEl.className = 'tm-copy-toast-pop';
  __tmToastEl.setAttribute('aria-live','polite');
  // זמני אנימציה (ms)
  __tmToastEl.dataset.in = '420';
  __tmToastEl.dataset.visible = '1200';
  __tmToastEl.dataset.out = '800';
  if (document.body) {
    document.body.appendChild(__tmToastEl);
  }
  return __tmToastEl;
}

function initCopyToastFromPointer(doc = document) {
  try {
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // עטיפה עדינה של writeText כדי לזהות הצלחה
    const nav = window.navigator;
    if (!nav || !nav.clipboard || typeof nav.clipboard.writeText !== 'function') return;
    const orig = nav.clipboard.writeText.bind(nav.clipboard);
    nav.clipboard.writeText = async function(text) {
      try {
        const res = await orig(text);
        if (!reduce) {
          const now = performance.now();
          const p = window.__tmLastPointer;
          // ⛔ אל תציג טוסט בתוך אזור ללא copy-ui (למשל טבלת החוסרים)
          const inNoUiZone = (p && p.target && p.target.closest && p.target.closest('[data-tm-no-copy-ui]'));
          if (!inNoUiZone) {
            if (p && (now - p.t) < 1200) {
              showCopyToastAtPoint(p.x, p.y, 'הועתק!');
            } else {
              const anchor = window.__tmLastCopyTarget || document.activeElement || document.body;
              showCopyToastNearNode(anchor, 'הועתק!');
            }
          }
          // סימון שנוצר טוסט הרגע כדי למנוע טוסט כפול מ-tmToast
          window.__tmToastStamp = now;
        }
        return res;
      } catch (err) {
        throw err;
      }
    };
  } catch(_e) {}
}

function showCopyToastNearNode(anchor, msg='הועתק!'){
  try{
    // Respect opt-out containers as well
    if (anchor && anchor.closest && anchor.closest('[data-tm-no-copy-ui]')) {
      return;
    }
    installCopyToastBaseCSS();
    const el = ensureToastEl();
    el.textContent = msg;
    const cell = anchor && anchor.closest ? (anchor.closest('td,th') || anchor.closest('.tm-ripple-host')) : null;
    const host = cell || anchor || document.body;

    // Separate DOM reads from writes to avoid forced reflow
    const rect = host.getBoundingClientRect(); // READ first
    requestAnimationFrame(() => {             // WRITE in rAF
      el.style.left = (rect.left + rect.width/2) + 'px';
      el.style.top  = Math.max(0, rect.top - 8) + 'px';
      playToastWAAPI(el);
    });
  }catch(_e){}
}

// טוסט לפי נקודת קליק בפועל (clientX/clientY)
function showCopyToastAtPoint(x, y, msg='הועתק!'){
  try{
    installCopyToastBaseCSS();
    const el = ensureToastEl();
    el.textContent = msg;
    const pad = 12;
    const vw = window.innerWidth || document.documentElement.clientWidth || 1024;
    const vh = window.innerHeight || document.documentElement.clientHeight || 768;
    const clampedX = Math.max(pad, Math.min(vw - pad, x));
    const clampedY = Math.max(pad, Math.min(vh - pad, y));
    el.style.left = clampedX + 'px';
    el.style.top  = clampedY + 'px';
    playToastWAAPI(el);
  }catch(_e){}
}

// הפעלה חלקה עם Web Animations API (ללא CSS keyframes)
function playToastWAAPI(el){
  try{
    const IN = +el.dataset.in || 420;
    const VISIBLE = +el.dataset.visible || 1200;
    const OUT = +el.dataset.out || 800;
    const shift = 6; // px
    // בטל אנימציות פעילות כדי שלא יקפצו פריימים
    el.getAnimations({subtree:false}).forEach(a => { try{a.cancel();}catch(_e){} });
    // מצב התחלתי
    el.style.opacity = '0';
    el.style.transform = `translate3d(-50%,0,0) translateY(${shift}px)`;
    // Fade-in
    el.animate(
      [
        { opacity: 0,   transform: `translate3d(-50%,0,0) translateY(${shift}px)` },
        { opacity: 1,   transform: `translate3d(-50%,0,0) translateY(0)` }
      ],
      { duration: IN, easing: 'linear', fill: 'forwards', composite: 'replace' }
    );
    // תיזמון ה-Fade-out
    if (__tmToastTimer) clearTimeout(__tmToastTimer);
    __tmToastTimer = setTimeout(() => {
      el.animate(
        [
          { opacity: 1, transform: `translate3d(-50%,0,0) translateY(0)` },
          { opacity: 0, transform: `translate3d(-50%,0,0) translateY(${shift}px)` }
        ],
        { duration: OUT, easing: 'linear', fill: 'forwards', composite: 'replace' }
      );
    }, IN + VISIBLE);
  }catch(_e){}
}

/* ==========================================
   Copy when clicking the Name cell (side panel + fullscreen)
   ========================================== */
function enableNameCellCopy(root = document){
  try{
    // סימון כל תאי "שם" כיעדי העתקה (כותרת + class) – עדין ובטוח
    const markAll = () => {
      root.querySelectorAll('td[data-label="שם"]').forEach(td => {
        // Do not enable copy on dropdown/select2 host cells (also strip existing marks)
        const isDropdownHost = td && (
          td.matches('[data-label="סטטוס"], [data-label="ליקוט"]') ||
          td.querySelector('.dropdown-menu, [data-toggle="dropdown"], .select2, .select2-container')
        );
        if (!isDropdownHost) {
          if (!td.classList.contains('copy-enabled')) td.classList.add('copy-enabled');
          if (!td.hasAttribute('title')) td.setAttribute('title','לחץ להעתקה');
        } else {
          stripCopyFrom(td);
        }
      });
    };
    markAll();

    // גם לעתיד: אם DOM משתנה (side panel) – נסמן שוב
    const mo = new MutationObserver(() => markAll());
    mo.observe(root.documentElement || root, {subtree:true, childList:true, attributes:false});

    // האזנה ב-delegation: קליק על תא "שם" -> העתקת שם המוצר
    root.addEventListener('click', (e) => {
      // TM: robust target for composed events & non-Element targets
      const raw = e.composedPath ? e.composedPath()[0] : e.target;
      const targetEl = raw && raw.nodeType === 1 ? raw : null; // 1 = ELEMENT_NODE
      const td = targetEl ? targetEl.closest('td[data-label="שם"]') : null;
      if (!td) return;
      // אל תשכפל: אם הקליק הוא על אייקון/כפתור/קלט – תן להתנהגות המקורית
      if (targetEl ? targetEl.closest('button, .copy-icon, .google-image-icon, input, textarea, select') : null) return;
      // אם זה קליק ישיר על לינק השם – אל תבטל ניווט; רק העתק בנוסף
      const wrap = td.querySelector('.tampermonkey-copy-wrap') || td;
      const nameText =
        (wrap.querySelector('a:not(.google-image-icon)')?.textContent ||
         wrap.querySelector('.tampermonkey-name-bdi')?.textContent ||
         td.textContent || '').trim();
      if (!nameText) return;
      // Ripple + העתקה (toast יופיע ע"י ה־override של clipboard)
      try { spawnRipple(td, e); } catch(_e){}
      navigator.clipboard.writeText(nameText).catch(()=>{ /* שקט */});
    }, {capture:false, passive:true});
  }catch(_e){}
}

/* ================================
   Clean up incorrectly marked cells
   ================================ */
function cleanupFlexCells() {
  try {
    // Remove tm-flex-cell from all cells except name cells
    const allCells = document.querySelectorAll('td.tm-flex-cell, th.tm-flex-cell');
    allCells.forEach(cell => {
      const isNameCell =
        (cell.getAttribute('data-label') === 'שם') ||
        (cell.tagName === 'TH' && /^\s*שם\s*$/.test(cell.textContent || ''));

      if (!isNameCell) {
        cell.classList.remove('tm-flex-cell');
      }
    });
  } catch(_e) {}
}

// Performance monitoring to reduce setTimeout violations
const originalSetTimeout = window.setTimeout;
window.setTimeout = function(callback, delay, ...args) {
  const wrappedCallback = function() {
    const startTime = performance.now();
    try {
      callback.apply(this, args);
    } finally {
      const endTime = performance.now();
      const duration = endTime - startTime;
      if (duration > 50) { // Log slow callbacks
        // Removed excessive logging to reduce console noise
      }
    }
  };
  return originalSetTimeout.call(this, wrappedCallback, delay);
};

// NOTE: removed the requestAnimationFrame wrapper.
// Leaving rAF native reduces `[Violation] 'requestAnimationFrame' handler took <N>ms`
// attributions pointing to our code and avoids extra overhead on every frame.


// ===== Rename table header "מק״ט" -> "ברקוד" (and data-label) =====
function _normalizeHeb(s){
    return (s||'')
      .replace(/\s+/g,' ')
      // normalize possible quote variants (gereshayim and plain quotes)
      .replace(/["״]/g, '״')
      .trim();
}

function renameMakotHeaderToBarcode(root=document){
    try{
        // 1) Headers: <th> text "מק״ט" -> "ברקוד"
        const ths = root.querySelectorAll('thead th, table thead th');
        ths.forEach(th => {
            const txt = _normalizeHeb(th.textContent);
            if (txt === 'מק״ט') {
                // Avoid unnecessary layout thrash: only update when needed
                if (_normalizeHeb(th.textContent) !== 'ברקוד'){
                    th.textContent = ' ברקוד ';
                }
            }
        });
        // 2) Data labels: data-label="מק״ט" -> "ברקוד" (th/td)
        const labelled = root.querySelectorAll('[data-label]');
        labelled.forEach(el => {
            const dl = _normalizeHeb(el.getAttribute('data-label'));
            if (dl === 'מק״ט') {
                el.setAttribute('data-label', 'ברקוד');
            }
        });
    }catch(e){
        if (DEBUG) console.warn('[Toolbox] renameMakotHeaderToBarcode error:', e);
    }
}

// Run once and observe for future tables
renameMakotHeaderToBarcode(document);
const _headersMO = new MutationObserver((muts) => {
    // throttle via rAF to avoid spam
    oncePerAnimationFrame(() => renameMakotHeaderToBarcode(document))();
});
_headersMO.observe(document.documentElement, { childList:true, subtree:true });

// ===== Ensure BARCODE copy icon exists in all tables (works with "מק״ט" or "ברקוד") =====
// A table is eligible if it's a picking table OR has a barcode header/data-label
function isBarcodeTable(table){
  if (!table) return false;
  // ⛔ דלג על חלונית ליקוט ועל טבלת החוסרים
  if (table.classList && table.classList.contains('pick-order-item-table')) return false;
  if (table.closest && table.closest('#missing-table-container')) return false;

  const ths = Array.from(table.querySelectorAll('thead th'));
  const headers = ths.map(th => _normalizeHeb(th.textContent));
  if (headers.includes('ברקוד') || headers.includes('מק״ט')) return true;
  // Fallback: any row with explicit barcode markers
  return !!table.querySelector('tbody td[data-label="ברקוד"], tbody td[data-label="מק״ט"], tbody td [data-original-sku], tbody td .barcode-highlight');
}

function findBarcodeCell(tr){
  // Only search inside eligible tables
  const table = tr.closest('table');
  if (!isBarcodeTable(table)) return null;
  // Prefer explicit markers; DO NOT blindly fall back to column indexes
  return tr.querySelector('td[data-label="ברקוד"], td[data-label="מק״ט"]')
      || tr.querySelector('td [data-original-sku]')?.closest('td')
      || tr.querySelector('td .barcode-highlight')?.closest('td');
}

function ensureBarcodeHighlightSpan(skuCell){
    if (!skuCell) return null;
    let span = skuCell.querySelector('.barcode-highlight, span.barcode-highlight');
    if (!span) {
        // Only wrap when the visible text looks like a barcode (>=8 digits overall)
        const tn = Array.from(skuCell.childNodes).find(n => n.nodeType === 3 && n.textContent.trim());
        if (tn) {
          const raw = tn.textContent.trim();
          const digits = (raw.match(/\d/g) || []).length;
          if (digits >= 8 && digits <= 20) {
            span = document.createElement('span');
            span.className = 'barcode-highlight';
            span.textContent = raw;
            skuCell.replaceChild(span, tn);
          }
        }
    }
    if (span) { __tmcBoldLast3DigitsInElement(span); }
    return span;
}

function ensureBarcodeCopyIconForRow(tr){
    try{
        // ⛔ דלג בחלונית ליקוט ובטבלת החוסרים
        const t = tr.closest && tr.closest('table');
        if (t) {
            if (t.classList && t.classList.contains('pick-order-item-table')) return;
            if (t.closest && t.closest('#missing-table-container')) return;
        }

        const skuCell = findBarcodeCell(tr);
        if (!skuCell) return;
        const span = ensureBarcodeHighlightSpan(skuCell);
        if (!span) return;

        // If an icon already exists and is marked as barcode, do nothing
        let next = span.nextElementSibling;
        if (next?.classList?.contains('copy-icon') && next.dataset?.copyKind === 'barcode') return;

        // If there is an untagged copy icon immediately after, adopt it as the barcode icon
        if (next?.classList?.contains('copy-icon') && !next.dataset?.copyKind) {
            next.dataset.copyKind = 'barcode';
            next.title = 'העתק ברקוד';
            next.onclick = (e) => {
                e.preventDefault(); e.stopPropagation();
                const raw = (skuCell.getAttribute('data-original-sku') || span.textContent || '').trim();
                if (raw) {
                    navigator.clipboard.writeText(raw).then(() => tmToast('הועתק!', next)).catch(console.warn);
                }
            };
            return;
        }

        // Otherwise create a new icon after the barcode span
        const icon = buildCopyFAIcon('העתק ברקוד', (e) => {
            const raw = (skuCell.getAttribute('data-original-sku') || span.textContent || '').trim();
            if (raw) {
                navigator.clipboard.writeText(raw).then(() => tmToast('הועתק!', icon)).catch(console.warn);
            }
        });
        icon.dataset.copyKind = 'barcode';
        icon.style.marginInlineStart = '6px';
        icon.style.marginInlineEnd = '0';
        span.insertAdjacentElement('afterend', icon);
    } catch(e){
        if (DEBUG) console.warn('[Toolbox] ensureBarcodeCopyIconForRow error:', e);
    }
}

function enhanceTablesBarcodeCopyIcons(root=document){
  try{
    const tables = root.querySelectorAll('table');
    tables.forEach(table => {
      // ⛔ דלג על חלונית ליקוט ועל טבלת החוסרים
      if (table.classList && table.classList.contains('pick-order-item-table')) return;
      if (table.closest && table.closest('#missing-table-container')) return;

      if (!isBarcodeTable(table)) return;
      table.querySelectorAll('tbody tr').forEach(tr => ensureBarcodeCopyIconForRow(tr));
    });
  }catch(e){
    if (DEBUG) console.warn('[Toolbox] enhanceTablesBarcodeCopyIcons error:', e);
  }
}

// Run now and keep in sync with DOM changes
enhanceTablesBarcodeCopyIcons(document);
const _tablesMO = new MutationObserver(() => {
  oncePerAnimationFrame(() => enhanceTablesBarcodeCopyIcons(document))();
});
_tablesMO.observe(document.documentElement, { childList:true, subtree:true });

// ---- PREVIEW reopen utilities ----
// Per-load token to ensure we never restore previews across a page refresh.
// Tagged into sessionStorage so only the *current* load can read what it wrote.
const TMC_SESSION_TOKEN = (function () {
  try {
    const tok = String(Date.now()) + '-' + Math.random().toString(36).slice(2);
    sessionStorage.setItem('tmcSessionToken', tok);
    return tok;
  } catch (_) {
    return String(Date.now());
  }
})();

// v2 writer: always store with a token (current load only).
function setOpenPreviewIds(ids) {
  try {
    const unique = Array.from(new Set(Array.isArray(ids) ? ids : []));
    const payload = { token: TMC_SESSION_TOKEN, ids: unique };
    sessionStorage.setItem('openPreviewTaskIds_v2', JSON.stringify(payload));
  } catch (_) {}
}

function getOpenPreviewIds() {
  // Only restore if the token matches this exact page load.
  try {
    const rawV2 = sessionStorage.getItem('openPreviewTaskIds_v2');
    if (rawV2) {
      const obj = JSON.parse(rawV2);
      if (obj && obj.token === TMC_SESSION_TOKEN && Array.isArray(obj.ids)) {
        return obj.ids;
      }
      return [];
    }
  } catch (_) {}
  // Legacy v1 (array) is ignored to prevent cross-refresh restores.
  return [];
}

function clickPreviewToggleFor(taskId) {
  const row = document.querySelector(`tr[data-task-id="${taskId}"]`);
  if (!row) return false;

  const previewRow = document.getElementById(`preview-for-${taskId}`);
  if (previewRow) return true; // כבר פתוח

  const btn = row.querySelector('.preview-cell button[data-task-id], .preview-cell .btn');
  if (!btn) return false;

  // לא לעורר ripple או העתקות — רק לפתוח
  btn.click();
  return true;
}

let __reopenInFlight = false;
function reopenPreviews({delay=350} = {}) {
  if (__reopenInFlight) return;
  __reopenInFlight = true;

  setTimeout(() => {
    const ids = getOpenPreviewIds();
    if (!ids.length) { __reopenInFlight = false; return; }

    let openedCount = 0;
    for (const id of ids) {
      const ok = clickPreviewToggleFor(id);
      if (ok) openedCount++;
    }

    // נסה עוד פעם קצרה אם עוד לא נפתחו וה-DOM יתייצב בעוד רגע
    if (openedCount === 0) {
      setTimeout(() => {
        for (const id of ids) clickPreviewToggleFor(id);
        __reopenInFlight = false;
      }, 300);
    } else {
      __reopenInFlight = false;
    }
  }, delay);
}

// ---- Intent-gated restore + sticky previews (no reopen on refresh) ----
(function hookNetworkForPreviews() {

  // Intent flag: set only when a task-changing request is fired
  let __tmcRestoreIntentMem = false;
  function markRestoreIntent() {
    __tmcRestoreIntentMem = true;
    try { sessionStorage.setItem('tmcRestoreIntent','1'); } catch(_){}
  }
  function consumeRestoreIntent() {
    __tmcRestoreIntentMem = false;
    try { sessionStorage.removeItem('tmcRestoreIntent'); } catch(_){}
  }
  function shouldRestore() {
    try { return __tmcRestoreIntentMem || sessionStorage.getItem('tmcRestoreIntent') === '1'; }
    catch(_) { return __tmcRestoreIntentMem; }
  }
  function markStickyOpenPreviews() {
    try {
      sessionStorage.setItem('tmcStickyPreviews','1');
      document.querySelectorAll('tr[id^="preview-for-"]').forEach(tr => tr.setAttribute('data-tmc-sticky','1'));
    } catch(_){}
  }

  // FETCH
  const _origFetch = window.fetch;
  window.fetch = async function hookedFetch(input, init) {
    const url = (typeof input === 'string') ? input : (input && input.url) || '';
    const method = ((init && init.method) || 'GET').toUpperCase();

    // Mark intent ONLY for task-mutating calls (non-GET to /tasks/…)
    if (url && url.includes('/tasks/') && method !== 'GET') {
      markRestoreIntent();
      markStickyOpenPreviews();
    }

    let res;
    try {
      res = await _origFetch.apply(this, arguments);
      const ok = res && (res.ok || (res.status >= 200 && res.status < 300));
      if (ok && url.includes('/tasks/') && shouldRestore()) {
        // Give DOM time to settle, then restore once
        setTimeout(() => { reopenPreviews({delay:150}); consumeRestoreIntent(); }, 300);
      }
    } catch (e) {
      throw e;
    }
    return res;
  };

  // XHR
  const _XHR = window.XMLHttpRequest;
  function HookedXHR() {
    const xhr = new _XHR();
    let _url = '', _method = 'GET';

    const _open = xhr.open;
    xhr.open = function(method, url) {
      _method = (method || 'GET').toUpperCase();
      _url = url || '';
      // Mark intent for task-mutating XHRs
      if (_url && _url.includes('/tasks/') && _method !== 'GET') {
        markRestoreIntent();
        markStickyOpenPreviews();
      }
      return _open.apply(this, arguments);
    };

    xhr.addEventListener('load', function() {
      try {
        const ok = (xhr.status >= 200 && xhr.status < 300);
        if (ok && _url.includes('/tasks/') && shouldRestore()) {
          setTimeout(() => { reopenPreviews({delay:150}); consumeRestoreIntent(); }, 300);
        }
      } catch (_) {}
    });
    return xhr;
  }
  window.XMLHttpRequest = HookedXHR;
})();

// ---- Observe preview row removals (sticky mode: keep them visible) ----
(function observePreviewRemovals() {

  const stickyCache = new Map(); // taskId => <tr id="preview-for-…">
  let lastKick = 0;

  const obs = new MutationObserver((mutations) => {
    let needReopen = false;
    for (const m of mutations) {
      // check removals
      for (const n of m.removedNodes || []) {
        if (!(n && n.nodeType === 1)) continue;
        const id = n.id || '';
        if (id.startsWith('preview-for-')) {
          const taskId = id.replace('preview-for-','');
          const stickyFlag = sessionStorage.getItem('tmcStickyPreviews') === '1';
          const wasSticky  = n.getAttribute('data-tmc-sticky') === '1';
          if (stickyFlag && wasSticky) {
            // Keep the same node in memory and re-attach after the main row reappears
            stickyCache.set(taskId, n);
          } else {
            needReopen = true;
          }
        }
      }
      // check additions (to reattach sticky previews next to their owner row)
      for (const n of m.addedNodes || []) {
        if (!(n && n.nodeType === 1)) continue;
        if (n.matches && n.matches('tr[data-task-id]')) {
          const tid = n.getAttribute('data-task-id');
          if (tid && stickyCache.has(tid)) {
            const previewNode = stickyCache.get(tid);
            try {
              safeInsertAfter(n, previewNode, n.parentNode);
              // Normalize styles so the reattached node matches current layout
              try { __tmcNormalizePreviewStyles(previewNode); } catch(_) {}
              try { __tmcClampAllPreviewRows(previewNode); } catch(_) {}
            } catch(_) {}
            stickyCache.delete(tid);
          }
        }
      }
    }

    // If not in sticky flow and there was a removal while an intent exists, do a normal reopen once
    const now = Date.now();
    if (needReopen && now - lastKick > 300) {
      lastKick = now;
      if (sessionStorage.getItem('tmcRestoreIntent') === '1') {
        setTimeout(() => { reopenPreviews({delay:150}); sessionStorage.removeItem('tmcRestoreIntent'); }, 250);
      }
    }
    // Clear sticky flag when cache drained
    if (stickyCache.size === 0) {
      try { sessionStorage.removeItem('tmcStickyPreviews'); } catch(_){}
    }
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });
})();

// ---- Observe orders table changes ----
(function observeOrdersTable() {
  const table = document.querySelector('#operator-store-visits-table, #operator-orders-table, .dataTables_wrapper table');
  if (!table) return;

  const tbody = table.tBodies && table.tBodies[0];
  if (!tbody) return;

  let scheduled = false;
  const obs = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    // חכה שה-DataTables יסיימו לצייר
    requestAnimationFrame(() => {
      scheduled = false;
      (function(){
        const sticky = sessionStorage.getItem('tmcStickyPreviews') === '1';
        const intent = sessionStorage.getItem('tmcRestoreIntent') === '1';
        if (sticky || intent) {
          reopenPreviews({delay: 80});
        }
      })();
    });
  });
  obs.observe(tbody, { childList: true, subtree: false });
})();

// ---[ Preview-aware keyboard nav helpers ]---
function tmIsPreviewRow(tr){
  return !!(tr && tr.nodeType === 1 && tr.id && tr.id.indexOf('preview-for-') === 0);
}
function tmClosestDataRow(el){
  return el && el.closest ? el.closest('tr[data-task-id], tr[id^="visit-row-"]') : null;
}
function tmClosestPreviewRow(el){
  return el && el.closest ? el.closest('tr[id^="preview-for-"]') : null;
}
function tmNextNonPreviewRow(from, dir){ // dir: +1 (down) or -1 (up)
  if (!from || !from.parentElement) return null;
  let n = from;
  while (true){
    n = (dir > 0) ? n.nextElementSibling : n.previousElementSibling;
    if (!n) return null;
    if (tmIsPreviewRow(n)) continue; // דלג על PREVIEW
    if (n.matches && n.matches('tr[data-task-id], tr[id^="visit-row-"]')) return n;
  }
}

// ---[ Skip PREVIEW rows in ArrowUp/ArrowDown navigation ]---
(function tmSkipPreviewsInKeyNav(){
  if (window.__tmSkipPreviewsInKeyNav) return;
  window.__tmSkipPreviewsInKeyNav = true;

  const ORDERS_SCOPE_SELECTOR = '#operator-store-visits-table, #operator-orders-table, .dataTables_wrapper table';

  document.addEventListener('keydown', function(e){
    const key = e.key;
    if (key !== 'ArrowDown' && key !== 'ArrowUp') return;

    const active = document.activeElement || document.body;
    const inScope = active && (active.closest(ORDERS_SCOPE_SELECTOR) || document.querySelector(ORDERS_SCOPE_SELECTOR));
    if (!inScope) return;

    // העוגן שלנו לניווט: אם אנחנו בתוך PREVIEW—קח שורה שכנה שאינה PREVIEW בכיוון הלחיצה
    let currentRow =
      tmClosestDataRow(active) ||
      tmClosestDataRow(document.querySelector(ORDERS_SCOPE_SELECTOR + ' tr:focus')) ||
      null;

    const dir = (key === 'ArrowDown') ? +1 : -1;

    if (!currentRow) {
      const previewRow = tmClosestPreviewRow(active);
      if (previewRow) {
        // אם בתוך PREVIEW: לעבור לשורת נתונים הקרובה בכיוון המתאים
        const anchor = tmNextNonPreviewRow(previewRow, dir);
        if (anchor) currentRow = anchor;
      }
    }

    if (!currentRow) return;

    const next = (dir > 0) ? currentRow.nextElementSibling : currentRow.previousElementSibling;
    if (!next) return;

    if (tmIsPreviewRow(next)) {
      if (e.__tmInjected) return; // מניעת לולאה
      const evt = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: false });
      Object.defineProperty(evt, '__tmInjected', { value: true });
      setTimeout(() => document.dispatchEvent(evt), 0);
    }
  }, true);

})();

// ---[ Post-fix when landed on PREVIEW (safety net) ]---
(function tmPostFixWhenOnPreview(){
  if (window.__tmPostFixOnPreview) return;
  window.__tmPostFixOnPreview = true;

  document.addEventListener('keydown', function(e){
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    if (e.__tmInjected) return; // אל תטפל באירוע שהוזרק ע"י הבלוק הקודם

    requestAnimationFrame(() => {
      const focused = document.activeElement;
      const row = tmClosestDataRow(focused);
      const previewRow = row ? null : tmClosestPreviewRow(focused);

      // אם נחתנו על PREVIEW בפועל—דחוף עוד חץ לאותו כיוון
      if (previewRow) {
        const evt = new KeyboardEvent('keydown', { key: e.key, bubbles: true, cancelable: false });
        Object.defineProperty(evt, '__tmInjected', { value: true });
        document.dispatchEvent(evt);
        return;
      }

      // אם row קיים אבל הוא בעצמו PREVIEW (הגנה כפולה)
      if (row && tmIsPreviewRow(row)) {
        const evt = new KeyboardEvent('keydown', { key: e.key, bubbles: true, cancelable: false });
        Object.defineProperty(evt, '__tmInjected', { value: true });
        document.dispatchEvent(evt);
      }
    });
  }, true);
})();

// =========================
// פתרון יציב למניעת חיתוך כרטיסים על ידי המפה:
// מוסיף spacer שמפנה מקום למפה בשורה הראשונה
// =========================
(function(){
  // CSS: קונטיינר הכרטיסים חייב להיות Flex עם wrap
  if (!document.getElementById('tmc-spacer-css')) {
    const s = document.createElement('style');
    s.id = 'tmc-spacer-css';
    s.textContent = `
      /* ה-spacer לא נראה ולא תופס גובה, רק רוחב בשורה הראשונה */
      #map-first-row-spacer {
        flex: 0 0 0;
        height: 1px;
        pointer-events: none;
        visibility: hidden;
      }
    `;
    document.head.appendChild(s);
  }

  function keepCardsClearOfMap({
    mapSelector = '#desktop-map-container',
    list = null,     // קונטיינר הכרטיסים (אם לא מסופק, נחפש)
    side = 'right',  // איפה המפה ביחס לכרטיסים: 'left' או 'right' (ב-RTL המפה בימין)
    gap = 16         // רווח קטן בין המפה לכרטיס הראשון
  } = {}) {
    const map = document.querySelector(mapSelector);
    if (!map) return;

    // אם לא סופק list, נחפש אותו
    if (!list) {
      list = document.querySelector('div[data-tmc-wrap-row="1"]');
    }
    if (!list) return;

    let spacer = list.querySelector('#map-first-row-spacer');
    if (!spacer) {
      spacer = document.createElement('div');
      spacer.id = 'map-first-row-spacer';

      // לשים את ה-spacer בצד הנכון גם בסביבת RTL
      const dir = getComputedStyle(list).direction; // 'rtl' / 'ltr'
      const placeAtStart = (side === 'left' && dir === 'ltr') || (side === 'right' && dir === 'rtl');
      placeAtStart ? list.prepend(spacer) : list.append(spacer);
    }

    const update = () => {
      const mapRect  = map.getBoundingClientRect();
      const listRect = list.getBoundingClientRect();

      // אם המפה לא חופפת אנכית את תחילת הכרטיסים – אין צורך במרווח
      const overlapsVertically = mapRect.bottom > listRect.top && mapRect.top < listRect.bottom;
      if (!overlapsVertically) {
        spacer.style.flexBasis = '0px';
        return;
      }

      // רוחב השטח שצריך לפנות בשורה הראשונה
      let overlapWidth;
      if (side === 'left') {
        overlapWidth = mapRect.right - listRect.left;           // מפנה מקום משמאל
      } else {
        overlapWidth = listRect.right - mapRect.left;           // מפנה מקום מימין
      }
      const width = Math.max(0, Math.min(overlapWidth + gap, listRect.width));
      spacer.style.flexBasis = width ? `${width}px` : '0px';
    };

    update();

    // להתעדכן בשינויים (ריסייז, זום דפדפן, שינוי פריסה)
    const ro = new ResizeObserver(update);
    ro.observe(map);
    ro.observe(list);
    window.addEventListener('resize', update, { passive:true });
    window.addEventListener('scroll', update, { passive:true });

    // שמירה לניקוי עתידי
    window.__tmcMapSpacerRO = ro;
  }

  // הפעלה על כל המכולות המסומנות
  function initMapSpacers() {
    document.querySelectorAll('div[data-tmc-wrap-row="1"]').forEach(list => {
      keepCardsClearOfMap({
        mapSelector: '#desktop-map-container',
        list: list, // נשתמש ב-list שכבר מצאנו
        side: 'right', // ב-RTL המפה בימין
        gap: 16
      });
    });
  }

  // הפעלה ראשונית
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMapSpacers, { once:true });
  } else {
    initMapSpacers();
  }

  // API להפעלה על מכולות חדשות: מהדק רוחב ל-viewport + מפנה מקום למפה
  window.__tmcLayoutWrapBeforeClip = function(ctx=document){
    __tmcClampAllPreviewRows(ctx); // ← חשוב: גורם ל-flex-wrap לעבוד לפי הקונטיינר הגליל
    ctx.querySelectorAll?.('div[data-tmc-wrap-row="1"]').forEach(list => {
      if (!list.querySelector('#map-first-row-spacer')) {
        keepCardsClearOfMap({
          mapSelector: '#desktop-map-container',
          list,
          side: 'right', // ב-RTL המפה בימין
          gap: 16
        });
      }
    });
  };
})();

// ========== HOTFIX: Legend Chips Filtering + Debug Logs ==========

// 0) עוזר: jQuery של העמוד, לא של הסנדבוקס
function __lwGetPageJQ() {
  try {
    if (typeof unsafeWindow !== 'undefined') {
      return unsafeWindow.jQuery || unsafeWindow.$ || window.jQuery || window.$ || null;
    }
  } catch (e) {}
  return window.jQuery || window.$ || null;
}

// 2) מפה בין צ'יפ לקלאס שורה
const __LW_LEGEND_KEY_TO_ROW_CLASS = {
  merlog: 'merlog-row-highlight',
  phone:  'phone-missing-row-highlight',
  ready:  'ready-row-highlight',
  coord:  'coord-row-highlight',
  branch: 'branch-row-highlight',
  mission:'mission-row-highlight'
};

// 3) סינון fallback ב־CSS אם אין DataTables
(function __lwEnsureCssLegendStyles() {
  if (document.getElementById('lw-legend-css-filter-style')) return;
  const css = `
    /* checkbox glyphs using ::before pseudo-element (CSS-only solution) */
    #kt_aside_menu .tmc-color-legend .tmc-legend-chip::before { content:'☐'; margin-inline-start:4px; }
    #kt_aside_menu .tmc-color-legend .tmc-legend-chip.is-active::before { content:'☑'; }

    /* Pink → #FFADEB override kept */
    #kt_aside_menu .tmc-color-legend .tmc-legend-chip--mission,
    #operator-store-visits-table .mission-row-highlight,
    .mission-row-highlight {
      background: #FFADEB !important;
    }

    /* Better fit on narrow/tablet viewports (also "un-pin" if theme forced anchoring) */
    #kt_aside_menu .tmc-color-legend {
      inset-inline-start: auto !important;
      inset-inline-end:   auto !important;
      width: auto !important;
      max-width: calc(100% - 8px);
      margin-inline: 4px;
    }
    @media (max-width: 1024px) {
      #kt_aside_menu .tmc-color-legend .tmc-legend-chip { padding: 4px 6px; font-size: 11px; }
    }

    #operator-store-visits-table.lw-css-filter-active tbody tr { display: table-row; }
    #operator-store-visits-table.lw-css-filter-merlog  tbody tr:not(.${__LW_LEGEND_KEY_TO_ROW_CLASS.merlog})  { display: none !important; }
    #operator-store-visits-table.lw-css-filter-phone   tbody tr:not(.${__LW_LEGEND_KEY_TO_ROW_CLASS.phone})   { display: none !important; }
    #operator-store-visits-table.lw-css-filter-ready   tbody tr:not(.${__LW_LEGEND_KEY_TO_ROW_CLASS.ready})   { display: none !important; }
    #operator-store-visits-table.lw-css-filter-coord   tbody tr:not(.${__LW_LEGEND_KEY_TO_ROW_CLASS.coord})   { display: none !important; }
    #operator-store-visits-table.lw-css-filter-branch  tbody tr:not(.${__LW_LEGEND_KEY_TO_ROW_CLASS.branch})  { display: none !important; }
    #operator-store-visits-table.lw-css-filter-mission tbody tr:not(.${__LW_LEGEND_KEY_TO_ROW_CLASS.mission}) { display: none !important; }
  `;
  const style = document.createElement('style');
  style.id = 'lw-legend-css-filter-style';
  style.textContent = css;
  document.head.appendChild(style);
})();

function __lwApplyCssLegendFilter(key) {
  const table = document.querySelector('#operator-store-visits-table');
  if (!table) {
    return;
  }
  const all = ['merlog','phone','ready','coord','branch','mission'];
  table.classList.remove('lw-css-filter-active', ...all.map(k => `lw-css-filter-${k}`));
  if (!key) {
    return;
  }
  table.classList.add('lw-css-filter-active', `lw-css-filter-${key}`);
  // עדכון אינפו בסיסי
  try {
    const info = document.querySelector('#operator-store-visits-table_info');
    const total = table.querySelectorAll('tbody tr[id^="visit-row-"]').length;
    const shown = table.querySelectorAll('tbody tr[id^="visit-row-"]:not([style*="display: none"])').length;
    if (info && total) {
      info.textContent = `מציג ${shown} מסוננות מתוך ${total}`;
    }
  } catch(e) {}
}

// 4) מציאת DataTable אמיתי מתוך העמוד
function __tmcFindActiveVisitsDataTable() {
  const $ = __lwGetPageJQ();
  const tableNode = document.querySelector('#operator-store-visits-table');
  if (!$ || !$.fn || !$.fn.dataTable) {
    return { dt: null, node: tableNode };
  }

  let dt = null;

  try {
    if ($.fn.dataTable.isDataTable && tableNode) {
      dt = $(tableNode).DataTable();
    }
    if (!dt || typeof dt.draw !== 'function') {
      const apis = $.fn.dataTable.tables({ visible: true, api: true });
      if (apis && apis.length) dt = apis[0];
    }
  } catch (e) {
  }

  if (dt && typeof dt.draw === 'function') {
    return { dt, node: dt.table ? dt.table().node() : tableNode };
  }

  return { dt: null, node: tableNode };
}

// 5) התקנת פילטר DataTables עם לוגים ו־unsafeWindow jQuery
let __tmcLegendFilterInstalled = false;
let __tmcLegendFilterTable = null;

function ensureLegendFilterInstalled(dt) {
  if (__tmcLegendFilterInstalled) return;
  const $ = __lwGetPageJQ();
  if (!$ || !$.fn || !$.fn.dataTable) {
    return;
  }
  $.fn.dataTable.ext.search.push(function legendFilter(settings, data, dataIndex, rowData, counter) {
    if (!__tmcLegendFilterInstalled || !__tmcLegendFilterTable) return true;
    if (__tmcLegendFilterTable !== settings.nTable) return true;

    const activeKey = document.body.getAttribute('data-legend-filter') || null;
    if (!activeKey) return true;

    const row = settings.aoData[dataIndex] && settings.aoData[dataIndex].nTr;
    if (!row) return true;

    if (activeKey === 'phone') {
      const blink =
        row.classList?.contains('tmc-phone-blink') ||
        row.classList?.contains('phone-missing-row-highlight') ||
        (row.dataset && row.dataset.phoneBlink === '1');
      return !!blink;
    }

    const cls = __LW_LEGEND_KEY_TO_ROW_CLASS[activeKey];
    if (!cls) return true;

    return row.classList.contains(cls);
  });
  __tmcLegendFilterInstalled = true;
}

// 6) טוגל הסינון עם לוגים ונפילה ל־CSS
function toggleLegendFilter(key) {
  const { dt, node } = __tmcFindActiveVisitsDataTable();
  __tmcLegendFilterTable = node || null;

  // עדכון מצב ה־UI של הצ'יפים
  try {
    document.querySelectorAll('#tmc-color-legend .tmc-legend-chip').forEach(ch => {
      ch.classList.remove('is-active');
      if (!ch.hasAttribute('role')) ch.setAttribute('role','checkbox');
      ch.setAttribute('aria-checked','false');
    });
    if (key) {
      const chip = document.querySelector(`#tmc-color-legend .tmc-legend-chip[data-key="${key}"]`);
      if (chip) {
        chip.classList.add('is-active');
        chip.setAttribute('aria-checked','true');
      }
    }
  } catch(e) {}

  // מצב גלובלי
  if (key) document.body.setAttribute('data-legend-filter', key);
  else     document.body.removeAttribute('data-legend-filter');

  // Fail-safe: if user chose yellow and no rows tagged yet—run a quick scan then proceed
  if (key === 'phone') {
    const hasTagged = document.querySelector('#operator-store-visits-table tbody tr.phone-missing-row-highlight, #operator-store-visits-table tbody tr.tmc-phone-blink, #operator-store-visits-table tbody tr[data-phone-blink="1"]');
    if (!hasTagged) { try { __lwBurstScanPhoneYellow(3,160); } catch(_){} }
  }

  // אם יש DataTables: התקן פילטר ותבצע draw
  if (dt && typeof dt.draw === 'function') {
    ensureLegendFilterInstalled(dt);
    try { dt.draw(false); } catch(e) { }
    return;
  }

  // אין DataTables: CSS fallback
  __lwApplyCssLegendFilter(key);
}

// 7) לוג על קליק בצ'יפ + טיפול בבחירה כפולה לביטול
(function installLegendClickDebug() {
  if (window.__lwLegendClickDebugInstalled) return;
  window.__lwLegendClickDebugInstalled = true;

  document.addEventListener('click', function(e) {
    const chip = e.target.closest && e.target.closest('#tmc-color-legend .tmc-legend-chip');
    if (!chip) return;
    e.preventDefault();

    const key = chip.getAttribute('data-key') || chip.getAttribute('data-legend-key');
    const alreadyActive = chip.classList.contains('is-active');
    const next = alreadyActive ? null : key;

    toggleLegendFilter(next);
  }, true);

  // אם DataTables מרנדר מחדש: נרענן
  const tbl = document.querySelector('#operator-store-visits-table tbody');
  if (tbl) {
    const mo = new MutationObserver(() => {
      const activeKey = document.body.getAttribute('data-legend-filter') || null;
      if (activeKey) {
        toggleLegendFilter(activeKey);
      }
    });
    mo.observe(tbl, { childList: true, subtree: false });
  }
})();

// ========== HOTFIX EXT: Yellow phone blink tagging ==========
function __lwHasYellowBgTree(root){
  if (!root) return false;
  const nodes = [root, ...root.querySelectorAll('*')];
  for (const n of nodes){
    try {
      const inline = (n.getAttribute && n.getAttribute('style')) || '';
      if (/#ff0\b|#ffff00\b/i.test(inline)) return true;
      const cs = window.getComputedStyle(n);
      const bg = cs && cs.backgroundColor;
      if (bg === 'rgb(255, 255, 0)' || bg === 'rgba(255, 255, 0, 1)') return true;
    } catch(e){}
  }
  return false;
}

function __lwTagPhoneYellowRows(){
  const rows = document.querySelectorAll('#operator-store-visits-table tbody tr[id^="visit-row-"]');
  let tagged = 0;
  rows.forEach(row=>{
    const phoneTd = row.querySelector('td[data-label="טלפון"]');
    const trStyle = row ? getComputedStyle(row) : null;
    const tdStyle = phoneTd ? getComputedStyle(phoneTd) : null;
    const isBlink =
      row.classList.contains('tmc-phone-blink') ||
      (trStyle && typeof trStyle.animationName === 'string' && trStyle.animationName.includes('tmcPhonePulse')) ||
      (tdStyle && typeof tdStyle.animationName === 'string' && tdStyle.animationName.includes('tmcPhonePulse')) ||
      (trStyle && trStyle.backgroundColor === 'rgb(255, 255, 0)') ||
      (tdStyle && tdStyle.backgroundColor === 'rgb(255, 255, 0)') ||
      __lwHasYellowBgTree(phoneTd);
    if (isBlink) {
      row.dataset.phoneBlink = '1';
      row.classList.add('phone-missing-row-highlight');
      tagged++;
    } else {
      if (row.dataset) delete row.dataset.phoneBlink;
      row.classList.remove('phone-missing-row-highlight');
    }
  });
}

function __lwBurstScanPhoneYellow(times=4, delay=180){
  // לתפוס אנימציית הבהוב גם אם כרגע שקופה
  let left = times;
  const tick = () => {
    __lwTagPhoneYellowRows();
    if (--left > 0) setTimeout(tick, delay);
  };
  tick();
}

// קריאה בעת עלייה
try { if (typeof __tmcEnsurePhoneCSS === 'function') __tmcEnsurePhoneCSS(); } catch(_){}
__lwBurstScanPhoneYellow();
setInterval(__lwTagPhoneYellowRows, 1500);

// חיבור ל־MutationObserver הקיים אם יש, או יצירה קלילה
(function(){
  const tbody = document.querySelector('#operator-store-visits-table tbody');
  if (!tbody) return;
  const mo = new MutationObserver(()=>{ __lwBurstScanPhoneYellow(); });
  mo.observe(tbody, { childList: true });
})();

// חיבור ללג׳נד: בכל טוגל פילטר נוודא שהתיוג עדכני
(function(){
  const _origToggle = window.toggleLegendFilter;
  window.toggleLegendFilter = function(nextKey){
    __lwBurstScanPhoneYellow();
    return _origToggle ? _origToggle(nextKey) : void 0;
  };
})();