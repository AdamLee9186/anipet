// ==UserScript==
// @name         Lionwheel → Supabase Orders Sync with Forecast
// @namespace    http://tampermonkey.net/
// @version      0.8.6
// @description  Server-side date filtering, improved getDateRange, Product view only (n_open > 0), Exclude Gift/Club/Shipping, Smart image cache, Table/Grid view toggle, Click-to-sort table headers, Enhanced drilldown with detailed logging and improved forecast status detection
// @author       Adam
// @match        https://members.lionwheel.com/operator/store_visits*
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function() {
    'use strict';

    // =========================================================
    // Drilldown UX fixes:
    // 1) Remove "Days" column (reduces horizontal scroll)
    // 2) Single vertical scroll for the modal (no nested scrollbars)
    // 3) Consumption: show DATE only if within ±14, otherwise show "holds ≈X days"
    // 4) IMPORTANT: do NOT filter out consumption rows by date at fetch-time
    // =========================================================

    // bump cache version to invalidate older cached shapes/filters
    const LW_CONSUMPTION_BATCH_CACHE_VERSION = 4;

    // =========================
    // Consumption ↔ Product gap warning (UX step 2)
    // =========================
    const TMC_CONS_GAP_WARN_DAYS = 21;

    function tmcSafeDateDiffDays(aStr, bStr) {
      if (!aStr || !bStr) return null;
      const a = new Date(aStr);
      const b = new Date(bStr);
      if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
      a.setHours(0,0,0,0);
      b.setHours(0,0,0,0);
      return Math.round((a - b) / (1000 * 60 * 60 * 24));
    }

    function tmcGapWarnBadge(prodDateStr, catDateStr, catLabel) {
      const diff = tmcSafeDateDiffDays(prodDateStr, catDateStr);
      if (diff == null) return '';
      const ad = Math.abs(diff);
      if (ad < TMC_CONS_GAP_WARN_DAYS) return '';

      const prod = (typeof tmcFmtDDMM === 'function') ? tmcFmtDDMM(prodDateStr) : prodDateStr;
      const cat = (typeof tmcFmtDDMM === 'function') ? tmcFmtDDMM(catDateStr) : catDateStr;
      const when = diff > 0 ? 'מאוחר יותר' : 'מוקדם יותר';
      const title = `פער גדול בין צפי המוצר לצפי ${catLabel}: צפי מוצר ${prod}, צפי קטגוריה ${cat} (פער ${ad} ימים, המוצר ${when}). ייתכן סטוק-אפ / מוצר נוסף באותה קטגוריה / שינוי הרגלים.`;
      return `<span class="tmc-cons-badge tmc-cons-warn" title="${escapeHtml(title)}">⚠</span>`;
    }

    // -----------------------------
    // Consumption UI helpers (clean labels, no confusing emojis)
    // -----------------------------
    function tmcUnitShort(u) {
      const x = String(u || '').toLowerCase();
      if (x === 'kg') return 'ק״ג';
      if (x === 'l') return "ל׳";
      if (x === 'g') return "ג׳";
      return x || '';
    }

    function tmcCatLabel(cat) {
      switch (cat) {
        case 'dog_food': return 'מזון לכלב';
        case 'cat_food': return 'מזון לחתול';
        case 'cat_litter': return 'חול לחתול';
        default: return null;
      }
    }

    function tmcFmtAmount(n) {
      const v = Number(n);
      if (!Number.isFinite(v)) return null;
      const isInt = Math.abs(v - Math.round(v)) < 1e-9;
      return isInt ? String(Math.round(v)) : String(Math.round(v * 10) / 10);
    }

    // Robust date parser: accepts Date | "YYYY-MM-DD" | ISO string | timestamp
    function tmcAsDate(v) {
      if (!v) return null;
      if (v instanceof Date) {
        const t = v.getTime();
        return Number.isNaN(t) ? null : new Date(t);
      }
      if (typeof v === 'number') {
        const d = new Date(v);
        return Number.isNaN(d.getTime()) ? null : d;
      }
      if (typeof v === 'string') {
        const s = String(v).trim();
        if (!s) return null;
        let d;
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) d = new Date(s + 'T00:00:00');
        else d = new Date(s);
        return Number.isNaN(d.getTime()) ? null : d;
      }
      return null;
    }

    function tmcFmtDDMM(dateLike) {
      if (!dateLike) return '';
      try {
        const d =
          dateLike instanceof Date
            ? dateLike
            : new Date(String(dateLike).slice(0, 10) + 'T00:00:00');
        if (Number.isNaN(d.getTime())) return '';
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        return `${dd}/${mm}`;
      } catch {
        return '';
      }
    }

    function ensureTmcConsumptionCss() {
      const id = 'tmc-consumption-css-v1';
      if (document.getElementById(id)) return;
      const s = document.createElement('style');
      s.id = id;
      s.textContent = `
        .tmc-td-consumption { white-space: normal !important; line-height: 1.25; }
        .tmc-cons-line { margin: 2px 0; font-size: 12px; color: #344054; }
        .tmc-cons-line b { font-weight: 700; color: #101828; }
        .tmc-cons-muted { color: #98a2b3; }
        .tmc-cons-badge { margin-inline-start: 6px; font-size: 12px; cursor: help; }
        .tmc-cons-warn { border-color:#fed7aa; background:#fff7ed; color:#b45309; }
        /* modal single scroll container (prevents nested scrollbars + clipping) */
        .tmc-panel { max-height: 85vh; display: flex; flex-direction: column; }
        .tmc-panel .tmc-body { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; }
        .tmc-panel .tmc-outcomes-wrap,
        .tmc-panel .tmc-table-wrap { overflow: visible !important; max-height: none !important; }
      `;
      document.head.appendChild(s);
    }
  
    /************************************************************
     *  Supabase config
     ************************************************************/
    const SUPABASE_URL = 'https://qgqpjlubdvxfzxjtocrh.supabase.co';
    const SUPABASE_ANON_KEY =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFncXBqbHViZHZ4Znp4anRvY3JoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMjc1MTcsImV4cCI6MjA4NDcwMzUxN30.UBsJrTtys9Sf8u2q3Jm3Y2uLrq64NsnHP-D8irDgCLs';
    const SUPABASE_TABLE = 'lionwheel_export_tasks_raw';
    const SUPABASE_ITEMS_TABLE = 'lionwheel_export_task_items_raw';
    const SUPABASE_VISITS_TABLE = 'store_visits_raw';
    // Buyer mode: what to order now (by supplier cycle)
    const FORECAST_VIEW = 'v_product_order_qty_by_cycle';

    /************************************************************
     *  EXCLUSIONS - פריטים שלא נשלחים ל-Supabase ולא מוצגים בתחזית
     ************************************************************/
    const EXCLUDED_BARCODES = ['10000', '491', '1948', '1949', '555503', '2543'];
    const EXCLUDED_KEYWORDS = ['מתנה', 'מועדון', 'משלוח'];

    /**
     * פונקציה מרכזית לבדיקה אם פריט פסול (לפי מק"ט או שם)
     * @param {string|number} sku - מק"ט/ברקוד של הפריט
     * @param {string} name - שם הפריט
     * @returns {boolean} true אם הפריט צריך להיות מסונן החוצה
     */
    function isItemExcluded(sku, name) {
      if (!sku && !name) return false;
      const sSku = String(sku || '').trim();
      const sName = String(name || '').trim();

      // בדיקת מק"ט
      if (EXCLUDED_BARCODES.includes(sSku)) {
        logDebug('[Exclude] Item excluded by barcode:', sSku);
        return true;
      }

      // בדיקת מילים בשם הפריט
      if (EXCLUDED_KEYWORDS.some(word => sName.includes(word))) {
        logDebug('[Exclude] Item excluded by keyword:', sName);
        return true;
      }

      return false;
    }
  
    /*
     * ## Supabase IO Summary
     * **Writes (POST/upsert)**:
     * - `lionwheel_export_tasks_raw` → `/rest/v1/lionwheel_export_tasks_raw?on_conflict=order_id`
     * - `lionwheel_export_task_items_raw` → `/rest/v1/lionwheel_export_task_items_raw?on_conflict=order_id,line_no`
     * - `store_visits_raw` → `/rest/v1/store_visits_raw?on_conflict=task_id`
     *
     * **Reads (GET)**:
     * - `v_forecast_with_status` → `/rest/v1/v_forecast_with_status?select=*`
     */

    /************************************************************
     *  Performance / Infra (inspired by MissingTable.js)
     *  ניתן לעדכן מבחוץ דרך window.LW_ORDERS_CONFIG לפני טעינת הסקריפט
     ************************************************************/
    const LW_ORDERS_CONFIG = Object.assign({
      DEBUG: false,
      SUPABASE_CONCURRENCY: 4,
      SUPABASE_CHUNK_SIZE: 200,
      YIELD_EVERY: 50,
      SUPABASE_YIELD_EVERY_CHUNKS: 1,
      ENABLE_LEGACY_MV_REFRESH: false, // legacy MV refresh (active_enriched). DOS refresh is via pg_cron.
      ENABLE_STORE_VISITS: true, // false = don't inject sync button / auto-sync on #operator-store-visits-table
    }, (typeof window !== 'undefined' && window.LW_ORDERS_CONFIG) || {});

    const lwOrdersLog = {
      debug: (...a) => LW_ORDERS_CONFIG.DEBUG && console.log('[LW-ORDERS]', ...a),
      info: (...a) => console.log('[LW-ORDERS]', ...a),
      warn: (...a) => console.warn('[LW-ORDERS]', ...a),
      error: (...a) => console.error('[LW-ORDERS]', ...a),
    };

    // Throttled debug log (max once per 500ms) to avoid Violations from heavy logging in hot paths
    let _lwDebugLogLastTs = 0;
    function debugLogThrottled(...args) {
      if (!LW_ORDERS_CONFIG.DEBUG) return;
      const now = performance.now();
      if (now - _lwDebugLogLastTs < 500) return;
      _lwDebugLogLastTs = now;
      console.log(...args);
    }

    // Yield using MessageChannel to avoid "setTimeout handler took Nms" Violations (Chrome flags setTimeout, not MessagePort)
    const lwYieldToMain = () => {
      if (typeof MessageChannel === 'function') {
        return new Promise(resolve => {
          const ch = new MessageChannel();
          ch.port1.onmessage = () => { ch.port1.onmessage = null; resolve(); };
          ch.port2.postMessage(0);
        });
      }
      if (typeof requestAnimationFrame === 'function') {
        return new Promise(resolve => requestAnimationFrame(() => resolve()));
      }
      return new Promise(resolve => setTimeout(resolve, 0));
    };

    function yieldToBrowser(timeoutMs = 16) {
      if (typeof MessageChannel === 'function') {
        return new Promise(resolve => {
          const ch = new MessageChannel();
          ch.port1.onmessage = () => { ch.port1.onmessage = null; resolve(); };
          ch.port2.postMessage(0);
        });
      }
      if (typeof requestAnimationFrame === 'function') {
        return new Promise(resolve => requestAnimationFrame(() => resolve()));
      }
      return new Promise(resolve => setTimeout(resolve, 0));
    }

    async function lwMaybeYield(i, every = LW_ORDERS_CONFIG.YIELD_EVERY) {
      if (!every || every <= 0) return;
      if (i % every === 0) await lwYieldToMain();
    }

    function lwPLimit(concurrency) {
      let active = 0;
      const queue = [];

      const next = () => {
        if (active >= concurrency || queue.length === 0) return;
        active++;
        const { fn, resolve, reject } = queue.shift();
        Promise.resolve()
          .then(fn)
          .then((value) => {
            active--;
            resolve(value);
            next();
          })
          .catch((err) => {
            active--;
            reject(err);
            next();
          });
      };

      return (fn) => new Promise((resolve, reject) => {
        queue.push({ fn, resolve, reject });
        next();
      });
    }


    /************************************************************
     *  Orders Sync CONFIG (MissingTable-style)
     ************************************************************/
    const ORDERS_SYNC_CONFIG = {
      // כמה משימות (tasks) מ-Lionwheel לסנכרן במקביל.
      // 4 גרם מדי פעם ל-HTTP 429 (Too Many Requests) → נוריד ל-2 כדי להיות עדינים יותר.
      UPSERT_CONCURRENCY: 2,
      YIELD_EVERY_ROWS: 400,
      TASK_CACHE_TTL_MS: 15 * 60 * 1000,
      LOG_PREFIX: '[LW OrdersSync]',
      DEBUG: true,
      AUTOSYNC_INTERVAL_MS: 4 * 60 * 60 * 1000, // סנכרון אוטומטי כל 4 שעות
    };

    function logDebug(...args) {
      if (!ORDERS_SYNC_CONFIG.DEBUG) return;
      console.debug(ORDERS_SYNC_CONFIG.LOG_PREFIX, ...args);
    }

    function yieldToMain() {
      if (typeof MessageChannel === 'function') {
        return new Promise(resolve => {
          const ch = new MessageChannel();
          ch.port1.onmessage = () => { ch.port1.onmessage = null; resolve(); };
          ch.port2.postMessage(0);
        });
      }
      if (typeof requestAnimationFrame === 'function') {
        return new Promise(resolve => requestAnimationFrame(() => resolve()));
      }
      return new Promise(resolve => setTimeout(resolve, 0));
    }

    function createLimiter(limit) {
      let activeCount = 0;
      const queue = [];
      const next = () => {
        activeCount--;
        if (queue.length > 0) {
          const fn = queue.shift();
          fn();
        }
      };
      const run = (fn, resolve, reject) => {
        activeCount++;
        fn()
          .then(
            (val) => { resolve(val); next(); },
            (err) => { reject(err); next(); }
          );
      };
      return function limitFn(fn) {
        return new Promise((resolve, reject) => {
          if (activeCount < limit) run(fn, resolve, reject);
          else queue.push(() => run(fn, resolve, reject));
        });
      };
    }

    const TASK_CACHE_KEY_PREFIX = 'orders_sync_task_cache_v1:';

    function safeSetItem(storage, key, value) {
      try {
        storage.setItem(key, value);
      } catch (e) {
        if (e && e.name === 'QuotaExceededError') {
          logDebug('QuotaExceededError, clearing task cache keys');
          try {
            for (let i = storage.length - 1; i >= 0; i--) {
              const k = storage.key(i);
              if (k && k.startsWith(TASK_CACHE_KEY_PREFIX)) storage.removeItem(k);
            }
            storage.setItem(key, value);
          } catch (e2) {
            logDebug('Still failed to save after cleanup', e2);
          }
        } else {
          logDebug('safeSetItem error', e);
        }
      }
    }

    function loadTaskCache(taskId) {
      try {
        const raw = sessionStorage.getItem(TASK_CACHE_KEY_PREFIX + taskId);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed.ts || !parsed.data) return null;
        const age = Date.now() - parsed.ts;
        if (age > ORDERS_SYNC_CONFIG.TASK_CACHE_TTL_MS) return null;
        return parsed.data;
      } catch (err) {
        logDebug('loadTaskCache error', err);
        return null;
      }
    }

    function saveTaskCache(taskId, data) {
      try {
        const payload = JSON.stringify({ ts: Date.now(), data });
        safeSetItem(sessionStorage, TASK_CACHE_KEY_PREFIX + taskId, payload);
      } catch (err) {
        logDebug('saveTaskCache error', err);
      }
    }

    function invalidateTaskCache(taskId) {
      try {
        sessionStorage.removeItem(TASK_CACHE_KEY_PREFIX + String(taskId));
        logDebug('Invalidated task cache for', taskId);
      } catch (e) {
        logDebug('invalidateTaskCache error', e);
      }
    }

    function extractTaskIdFromBulkUpdateBody(body) {
      if (body == null) return null;
      let obj = null;
      if (typeof body === 'string') {
        try { obj = JSON.parse(body); } catch { return null; }
      } else if (typeof body === 'object' && !(body instanceof FormData)) {
        obj = body;
      }
      if (!obj) return null;
      const id = obj.task_id ?? obj.taskId ?? obj.order_id ?? obj.orderId ?? obj.data?.task_id ?? obj.data?.taskId ?? null;
      return id != null ? String(id).trim() || null : null;
    }

    (function patchFetchForTaskCacheInvalidation() {
      if (typeof window === 'undefined' || !window.fetch) return;
      const origFetch = window.fetch;
      window.fetch = function patchedFetch(input, init) {
        try {
          const url = (typeof input === 'string' ? input : input?.url) ?? '';
          if (url && String(url).includes('order_items/bulk_update')) {
            const body = init?.body;
            const taskId = extractTaskIdFromBulkUpdateBody(body);
            if (taskId) invalidateTaskCache(taskId);
          }
        } catch (err) {
          logDebug('patchFetch error', err);
        }
        return origFetch.apply(this, arguments);
      };
    })();

    /************************************************************
     *  Forecast Globals & Cache
     ************************************************************/
    let FORECAST_CACHE = {
      data: null,
      timestamp: 0,
      TTL: 60 * 1000 // 60 seconds
    };

    // Cache for per-SKU "מתי צפוי" summaries (computed from customer forecast rows)
    // Keyed by `${sku}::${dateRangeKey}`
    const FORECAST_WHEN_SUMMARY_CACHE = new Map();
    const FORECAST_WHEN_SUMMARY_TTL_MS = 5 * 60 * 1000; // 5 minutes

    // Debug flags: URL > sessionStorage > localStorage (no unsafeWindow — settable from page console).
    // From console: localStorage.setItem('TMC_DISABLE_SERVER_SUMMARY','1'); location.reload();
    // Or URL: ?tmc_debug_sku=7290113302235 or ?tmc_disable_server_summary=1
    var TMC_FLAG_URL_PARAMS = { TMC_DEBUG_SKU: 'tmc_debug_sku', TMC_DISABLE_SERVER_SUMMARY: 'tmc_disable_server_summary', TMC_FORCE_CLIENT_SUMMARY: 'tmc_force_client_summary', TMC_DRILLDOWN_DEBUG: 'tmc_drilldown_debug', TMC_DISABLE_WHEN_CACHE: 'tmc_disable_when_cache' };
    function tmcGetGlobal() {
      try {
        if (typeof unsafeWindow !== 'undefined' && unsafeWindow) return unsafeWindow;
      } catch (_) {}
      return (typeof window !== 'undefined' ? window : {});
    }
    function tmcGetFlag(name) {
      let v = null;
      try {
        const param = TMC_FLAG_URL_PARAMS[name];
        if (param && typeof location !== 'undefined' && location.search) {
          const q = new URLSearchParams(location.search);
          const p = q.get(param);
          if (p !== null && p !== '') v = p;
        }
        if (v == null && typeof sessionStorage !== 'undefined') v = sessionStorage.getItem(name);
        if (v == null && typeof localStorage !== 'undefined') v = localStorage.getItem(name);
      } catch (_) {}
      if (name === 'TMC_DISABLE_WHEN_CACHE' && (v === '1' || v === 'true')) return true;
      return (v !== undefined && v !== null) ? v : undefined;
    }
    function tmcFlagOn(name) {
      const v = tmcGetFlag(name);
      return v === '1' || v === 'true' || v === 'yes' || v === 'on';
    }

  // Product image mapping from Supabase (public)
  // Structure: { 'SKU123': 'https://image.url/...' }
  const PRODUCT_THUMB_MAP = new Map();
  let PRODUCT_THUMB_LOADING = false;

  // --- Anipet SKU images (Supabase) ---
  // טבלת התמונות שיצרת
  const ANIPET_SKU_IMAGES_TABLE = 'anipet_sku_images';
  // Cache מקומי: מתמלא בהדרגה (רק SKUs שצריך למסך הנוכחי)
  const PRODUCT_THUMB_CACHE_KEY = 'tmc_anipet_sku_images_cache_v1';
  let PRODUCT_THUMB_CACHE_LOADED = false;

  // Placeholder קטן (SVG) – משמש כשאין image_url ב-Supabase או טרם נטען
  const PRODUCT_THUMB_PLACEHOLDER =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">
         <rect width="80" height="80" rx="14" fill="#F3F4F6"/>
         <path d="M26 50c6-10 10-14 14-14s8 4 14 14" fill="none" stroke="#C7CBD1" stroke-width="4" stroke-linecap="round"/>
         <circle cx="30" cy="30" r="5" fill="#C7CBD1"/>
         <circle cx="50" cy="30" r="5" fill="#C7CBD1"/>
       </svg>`
    );
  
    /************************************************************
   *  Anipet Catalog (SKU → Barcode + Supplier) via Supabase Table
   *  - Fetch only SKUs that appear on-screen (chunked)
   *  - Local cache keyed by catalog version (from anipet_catalog_meta)
   ************************************************************/
  // Use the normalized keymap view (2.1)
  const ANIPET_CATALOG_TABLE = 'v_anipet_products_keymap';
  const ANIPET_CATALOG_META_TABLE = 'anipet_catalog_meta';

  // skuDigits -> { sku, barcode, supplier }; barcodeDigits -> same entry (אותו מוצר: מק"ט וברקוד)
  const CATALOG_BY_SKU = new Map();
  const CATALOG_BY_BARCODE = new Map();
  const SUPPLIERS_IN_CACHE = new Set();
  let CATALOG_CACHE_LOADED = false;

  const CATALOG_CACHE_KEY = 'tmc_anipet_catalog_cache_v1';
  const CATALOG_CACHE_KEY_GM = 'tmc_anipet_catalog_cache_v1_gm';
  const CATALOG_VERSION_KEY = 'tmc_anipet_catalog_version_v1';
  const CATALOG_VERSION_CHECK_TTL_MS = 5 * 60 * 1000; // 5 minutes
  let CATALOG_VERSION_LAST_CHECK = 0;
  let CATALOG_WARM_IN_PROGRESS = false;
  let CATALOG_WARM_LAST_RUN = 0;
  const CATALOG_WARM_MIN_INTERVAL_MS = 5 * 60 * 1000;

  function normalizeDigits(v) {
    return String(v || '').replace(/\D/g, '').trim();
  }

  function loadCatalogCacheOnce() {
    if (CATALOG_CACHE_LOADED) return;
    CATALOG_CACHE_LOADED = true;

    try {
      let raw = null;
      try {
        raw = (typeof GM_getValue !== 'undefined')
          ? GM_getValue(CATALOG_CACHE_KEY_GM, null)
          : null;
      } catch {}
      if (!raw) {
        raw = localStorage.getItem(CATALOG_CACHE_KEY);
      }
      if (!raw) return;

      let obj = null;
      try { obj = JSON.parse(raw); } catch {}
      if (!obj) obj = decompressData(raw);
      const mapObj = obj?.map;
      if (!mapObj || typeof mapObj !== 'object') return;

      for (const [skuDigits, rec] of Object.entries(mapObj)) {
        if (!skuDigits) continue;
        const sku = normalizeDigits(rec?.sku || skuDigits);
        const barcode = normalizeDigits(rec?.barcode || '');
        const supplier = String(rec?.supplier || '').trim();
        const entry = { sku, barcode, supplier };
        CATALOG_BY_SKU.set(String(skuDigits), entry);
        if (barcode) CATALOG_BY_BARCODE.set(String(barcode), entry);
        if (supplier) SUPPLIERS_IN_CACHE.add(supplier);
      }
    } catch (e) {
      console.warn('[Forecast] Failed to load catalog cache:', e);
    }
  }

  function saveCatalogCache() {
    try {
      const obj = { t: Date.now(), map: Object.fromEntries(CATALOG_BY_SKU.entries()) };
      const compressed = compressData(obj) || JSON.stringify(obj);
      let saved = false;
      if (typeof GM_setValue !== 'undefined') {
        try {
          GM_setValue(CATALOG_CACHE_KEY_GM, compressed);
          saved = true;
        } catch {}
      }
      if (!saved) {
        localStorage.setItem(CATALOG_CACHE_KEY, compressed);
      }
    } catch (e) {
      console.warn('[Forecast] Failed to save catalog cache:', e);
    }
  }

  async function fetchCatalogVersion() {
    try {
      // Expect a single-row table with id=1
      const rows = await supaRestFetch(`/rest/v1/${ANIPET_CATALOG_META_TABLE}?select=version,last_updated&limit=1`, { method: 'GET' });
      const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
      const v = row?.version ? String(row.version) : null;
      return v;
    } catch (e) {
      console.warn('[Forecast] fetchCatalogVersion failed:', e);
      return null;
    }
  }

  async function ensureCatalogVersionFresh() {
    loadCatalogCacheOnce();

    const now = Date.now();
    if (CATALOG_VERSION_LAST_CHECK && (now - CATALOG_VERSION_LAST_CHECK) < CATALOG_VERSION_CHECK_TTL_MS) {
      return;
    }
    CATALOG_VERSION_LAST_CHECK = now;

    const cachedVersion = (() => {
      try { return String(localStorage.getItem(CATALOG_VERSION_KEY) || ''); } catch { return ''; }
    })();

    const remoteVersion = await fetchCatalogVersion();
    if (!remoteVersion) return; // can't validate now

    if (cachedVersion !== remoteVersion) {
      console.log(`[Forecast] Catalog version changed (${cachedVersion || 'none'} → ${remoteVersion}). Clearing local catalog cache.`);
      CATALOG_BY_SKU.clear();
      CATALOG_BY_BARCODE.clear();
      SUPPLIERS_IN_CACHE.clear();
      try { localStorage.removeItem(CATALOG_CACHE_KEY); } catch {}
      try { localStorage.setItem(CATALOG_VERSION_KEY, remoteVersion); } catch {}
    }
  }

  const CATALOG_FETCH_CHUNK_SIZE = 200;
  const CATALOG_FETCH_CONCURRENCY = 4;

  async function loadCatalogForSkus(skusToFetch) {
    try {
      await ensureCatalogVersionFresh();

      // 1) Normalize + dedupe + skip already cached
      const normalized = Array.from(new Set(
        (Array.isArray(skusToFetch) ? skusToFetch : [skusToFetch])
          .map(s => normalizeDigits(s))
          .filter(Boolean)
      ));
      const missing = normalized.filter(s => !CATALOG_BY_SKU.has(String(s)) && !CATALOG_BY_BARCODE.has(String(s)));
      if (!missing.length) return;

      const t0 = performance.now();
      const chunkSize = CATALOG_FETCH_CHUNK_SIZE;
      const totalChunks = Math.ceil(missing.length / chunkSize);
      console.log(`[Forecast] Catalog fetch: missing=${missing.length} chunks=${totalChunks}`);

      // 2) Fetch in chunks using normalized keys (sku_norm / barcode_norm)
      const limiter = lwPLimit(CATALOG_FETCH_CONCURRENCY);
      const tasks = [];
      for (let i = 0; i < missing.length; i += chunkSize) {
        const chunk = missing.slice(i, i + chunkSize);
        tasks.push(limiter(async () => {
          // Use in.(...) instead of multiple eq to avoid long URLs and improve performance
          const encodedValues = chunk.map(s => encodeURIComponent(String(s))).join(',');
          const path =
            `/rest/v1/${ANIPET_CATALOG_TABLE}` +
            `?select=sku,barcode,supplier,sku_norm,barcode_norm` +
            `&or=(sku_norm.in.(${encodedValues}),barcode_norm.in.(${encodedValues}))`;

          const data = await supaRestFetch(path, { method: 'GET' });
          if (!Array.isArray(data) || !data.length) return;

          for (const r of data) {
            const skuDigits = normalizeDigits(r?.sku);
            const barcodeDigits = normalizeDigits(r?.barcode || '');
            const skuKey = normalizeDigits(r?.sku_norm || r?.sku);
            const barKey = normalizeDigits(r?.barcode_norm || r?.barcode);
            const supplier = String(r?.supplier || '').trim();

            const entry = {
              sku: skuDigits || skuKey || null,
              barcode: barcodeDigits || barKey || null,
              supplier
            };

            // Index by BOTH canonical + normalized keys
            if (skuKey) CATALOG_BY_SKU.set(String(skuKey), entry);
            if (skuDigits) CATALOG_BY_SKU.set(String(skuDigits), entry);
            if (barKey) CATALOG_BY_BARCODE.set(String(barKey), entry);
            if (barcodeDigits) CATALOG_BY_BARCODE.set(String(barcodeDigits), entry);

            if (supplier) SUPPLIERS_IN_CACHE.add(supplier);
          }
        }));
      }
      await Promise.all(tasks);

      saveCatalogCache();
      const ms = Math.round(performance.now() - t0);
      console.log(`[Forecast] Catalog fetch done: ${ms}ms`);
    } catch (e) {
      console.warn('[Forecast] loadCatalogForSkus failed:', e);
    }
  }

  function getCatalogForSku(skuLike) {
    const digits = normalizeDigits(skuLike);
    if (!digits) return null;
    return CATALOG_BY_SKU.get(String(digits)) || CATALOG_BY_BARCODE.get(String(digits)) || null;
  }


// --- קונפיגורציה לקאש (בהשראת Toolbox.js) ---
  const PRODUCT_CACHE_KEY = 'forecast_product_data_cache_v1';
  const CACHE_TIMESTAMP_KEY = 'forecast_cache_timestamp';
  const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 שעות (רענון פעם ביום)

  // --- פונקציות עזר לדחיסה (מועתקות מ-Toolbox.js) ---
  function compressData(data) {
    try {
      return encodeURIComponent(JSON.stringify(data));
    } catch (e) {
      console.error('[Forecast] Compression error', e);
      return null;
    }
  }

  function decompressData(compressed) {
    try {
      return compressed ? JSON.parse(decodeURIComponent(compressed)) : null;
    } catch (e) {
      console.error('[Forecast] Decompression error', e);
      return null;
    }
  }

  // Helper: Safe GM_getValue wrapper (works with or without Tampermonkey)
  // Note: GM_getValue is synchronous in Tampermonkey, but we keep it async for consistency
  function safeGM_getValue(key, defaultValue) {
    if (typeof GM_getValue !== 'undefined') {
      try {
        return GM_getValue(key, defaultValue);
      } catch (e) {
        console.warn('[Forecast] GM_getValue failed, using fallback:', e);
      }
    }
    // Fallback to localStorage if GM_getValue not available
    try {
      const stored = localStorage.getItem(key);
      if (stored === null) return defaultValue;
      return JSON.parse(stored);
    } catch (e) {
      console.warn('[Forecast] localStorage get failed:', e);
      return defaultValue;
    }
  }

  // Helper: Safe GM_setValue wrapper
  // Note: GM_setValue is synchronous in Tampermonkey
  function safeGM_setValue(key, value) {
    if (typeof GM_setValue !== 'undefined') {
      try {
        GM_setValue(key, value);
        return;
      } catch (e) {
        console.warn('[Forecast] GM_setValue failed, using fallback:', e);
      }
    }
    // Fallback to localStorage
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn('[Forecast] Failed to save to localStorage:', e);
    }
  }
  
    // Helper: Deterministic color from string
    function stringToColor(str) {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
      }
      const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
      return '#' + '00000'.substring(0, 6 - c.length) + c;
    }
  
  // --- Anipet SKU images (Supabase) ---
  async function loadProductImages(skusToFetch = null) {
    try {
      // 1) טען cache מקומי פעם אחת
      if (!PRODUCT_THUMB_CACHE_LOADED) {
        try {
          const raw = localStorage.getItem(PRODUCT_THUMB_CACHE_KEY);
          if (raw) {
            const obj = JSON.parse(raw);
            if (obj && obj.map && typeof obj.map === 'object') {
              for (const [sku, v] of Object.entries(obj.map)) {
                if (!sku) continue;
                PRODUCT_THUMB_MAP.set(String(sku), {
                  imageUrl: v?.imageUrl || v?.image_url || '',
                  productUrl: v?.productUrl || v?.product_url || '',
                  name: v?.name || v?.product_name || ''
                });
              }
            }
          }
        } catch {}
        PRODUCT_THUMB_CACHE_LOADED = true;
      }

      // אם לא ביקשו SKUs ספציפיים – אין יותר "טעינה מלאה" (חוסך network)
      if (!skusToFetch) return;

      // 2) נרמל + dedupe
      const normalized = Array.from(new Set(
        (Array.isArray(skusToFetch) ? skusToFetch : [skusToFetch])
          .map(s => tmcNormalizeDigits(s))
          .filter(Boolean)
      ));

      // 3) בקש רק מה שחסר במסך הנוכחי
      const missing = normalized.filter(sku => !PRODUCT_THUMB_MAP.has(String(sku)));
      if (!missing.length) return;

      // 4) Fetch ב-chunks עם or=(sku.eq...,sku.eq...) כדי למזער network
      const chunkSize = 150; // תכל'ס: 100–200 עובד טוב (URL length)
      for (let i = 0; i < missing.length; i += chunkSize) {
        const chunk = missing.slice(i, i + chunkSize);
        const orParts = chunk.map(sku => `sku.eq.${encodeURIComponent(String(sku))}`).join(',');
        const path = `/rest/v1/${ANIPET_SKU_IMAGES_TABLE}?select=sku,image_url&or=(${orParts})`;

        // retry קצר פעם אחת
        let data = null;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            data = await supaRestFetch(path, { method: 'GET' });
            if (Array.isArray(data)) break;
          } catch (e) {
            if (attempt === 0) await new Promise(r => setTimeout(r, 250));
            else throw e;
          }
        }

        if (!Array.isArray(data) || !data.length) continue;
        for (const r of data) {
          const sku = tmcNormalizeDigits(r?.sku);
          if (!sku) continue;
          PRODUCT_THUMB_MAP.set(String(sku), {
            imageUrl: String(r?.image_url || '').trim(),
            productUrl: '',
            name: ''
          });
        }
      }

      // 5) cache מקומי (incremental)
      try {
        const obj = { t: Date.now(), map: Object.fromEntries(PRODUCT_THUMB_MAP.entries()) };
        localStorage.setItem(PRODUCT_THUMB_CACHE_KEY, JSON.stringify(obj));
      } catch {}
    } catch (err) {
      console.warn('[Forecast] loadProductImages failed', err);
    }
  }
  
  // Helper: Get Thumb URL (or placeholder if missing)
  function getProductThumbUrl(skuLike) {
    try {
      if (!skuLike) return '';
      // skuLike might include multiple digits (from name), choose first match
      const sku = tmcNormalizeDigits(String(skuLike));
      if (!sku) return '';

      const v = PRODUCT_THUMB_MAP.get(String(sku));
      const imageUrl = v?.imageUrl || '';
      return imageUrl || PRODUCT_THUMB_PLACEHOLDER;
    } catch {
      return PRODUCT_THUMB_PLACEHOLDER;
    }
  }
  
    /************************************************************
     *  Supabase REST helper – בלי supabase-js
     ************************************************************/
    async function supabaseUpsertOrderRow(orderRow) {
      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        throw new Error('SUPABASE_URL או SUPABASE_ANON_KEY לא הוגדרו בסקריפט');
      }
  
      // upsert לפי order_id – בגלל שיש unique constraint lionwheel_export_tasks_raw_order_id_key
      const endpoint =
        `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${SUPABASE_TABLE}?on_conflict=order_id`;
  
      const payload = [orderRow]; // Supabase REST מצפה למערך של רשומות
  
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          // מאפשר merge במקום 409
          Prefer: 'return=representation,resolution=merge-duplicates',
        },
        body: JSON.stringify(payload),
      });
  
      const textResp = await resp.text();
      if (!resp.ok) {
        console.error('[Supabase Sync] Supabase REST error:', resp.status, textResp);
        throw new Error(`Supabase REST error ${resp.status}: ${textResp}`);
      }
  
      let data = null;
      try {
        data = textResp ? JSON.parse(textResp) : null;
      } catch (e) {
        console.warn('[Supabase Sync] failed to parse Supabase response JSON', e);
      }

      debugLogThrottled('[Supabase Sync] Supabase REST upsert ok: 1 row');
      return data;
    }
  
    async function supabaseUpsertOrderItemsRows(itemRows) {
      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        throw new Error('SUPABASE_URL או SUPABASE_ANON_KEY לא הוגדרו בסקריפט');
      }
      if (!Array.isArray(itemRows) || itemRows.length === 0) {
        if (LW_ORDERS_CONFIG.DEBUG) console.warn('[Supabase Sync] No items to upsert (lionwheel_export_task_items_raw)');
        return null;
      }
  
      // upsert לפי (order_id, line_no) – נדרש unique constraint על הצמד הזה
      const endpoint =
        `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${SUPABASE_ITEMS_TABLE}?on_conflict=order_id,line_no`;
  
      const chunkSize = Math.max(1, Number(LW_ORDERS_CONFIG.SUPABASE_CHUNK_SIZE || 200));
      const yieldEveryChunks = Math.max(0, Number(LW_ORDERS_CONFIG.SUPABASE_YIELD_EVERY_CHUNKS || 1));

      const allResponses = [];
      let chunkIndex = 0;

      for (let i = 0; i < itemRows.length; i += chunkSize) {
        const chunk = itemRows.slice(i, i + chunkSize);

        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation,resolution=merge-duplicates',
          },
          body: JSON.stringify(chunk),
        });

        const textResp = await resp.text();
        if (!resp.ok) {
          console.error('[Supabase Sync] Supabase REST items error:', resp.status, textResp);
          throw new Error(`Supabase REST items error ${resp.status}: ${textResp}`);
        }

        let data = null;
        try {
          data = textResp ? JSON.parse(textResp) : null;
        } catch (e) {
          console.warn('[Supabase Sync] failed to parse Supabase items response JSON', e);
        }

        allResponses.push(data);
        chunkIndex++;
        if (yieldEveryChunks > 0 && (chunkIndex % yieldEveryChunks === 0)) {
          await yieldToBrowser(50);
        }
      }

      const totalRows = (allResponses || []).reduce((sum, r) => sum + (Array.isArray(r) ? r.length : 0), 0);
      debugLogThrottled('[Supabase Sync] Supabase REST items upsert ok (chunked): chunks=', allResponses.length, 'totalRows=', totalRows);
      return allResponses;
    }
  
    /************************************************************
     *  Generic Supabase upsert helper
     ************************************************************/
    async function supabaseUpsert(tableName, rows, onConflictCols) {
      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        throw new Error('SUPABASE_URL או SUPABASE_ANON_KEY לא הוגדרו בסקריפט');
      }
      if (!Array.isArray(rows) || rows.length === 0) {
        console.warn(`[Supabase Sync] No rows to upsert (${tableName})`);
        return null;
      }
  
      const onConflict = Array.isArray(onConflictCols)
        ? onConflictCols.join(',')
        : String(onConflictCols || 'id');
      const endpoint = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${tableName}?on_conflict=${onConflict}`;
  
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation,resolution=merge-duplicates',
        },
        body: JSON.stringify(rows),
      });
  
      const textResp = await resp.text();
      if (!resp.ok) {
        console.error(`[Supabase Sync] Supabase REST error (${tableName}):`, resp.status, textResp);
        throw new Error(`Supabase REST error ${resp.status}: ${textResp}`);
      }
  
      let data = null;
      try {
        data = textResp ? JSON.parse(textResp) : null;
      } catch (e) {
        console.warn(`[Supabase Sync] failed to parse Supabase response JSON (${tableName})`, e);
      }

      const count = Array.isArray(data) ? data.length : (data ? 1 : 0);
      debugLogThrottled('[Supabase Sync] Supabase REST upsert ok (' + tableName + '): count=', count);
      return data;
    }

    /** GET rows with optional filter. inFilter: { column, values: string[] } → column=in.(v1,v2,...) */
    async function supabaseGet(tableName, { select = '*', inFilter } = {}) {
      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        throw new Error('SUPABASE_URL או SUPABASE_ANON_KEY לא הוגדרו בסקריפט');
      }
      let url = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${tableName}?select=${encodeURIComponent(select)}`;
      if (inFilter && inFilter.column && Array.isArray(inFilter.values) && inFilter.values.length > 0) {
        const vals = inFilter.values.map((v) => String(v).trim()).filter(Boolean);
        if (vals.length) {
          const list = vals.map((v) => (/^\d+$/.test(v) ? v : `"${v.replace(/"/g, '\\"')}"`)).join(',');
          url += `&${inFilter.column}=in.(${list})`;
        }
      }
      const resp = await fetch(url, {
        method: 'GET',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          Accept: 'application/json',
        },
      });
      const textResp = await resp.text();
      if (!resp.ok) {
        console.warn(`[Supabase Sync] GET ${tableName} error:`, resp.status, textResp);
        return { data: [], error: new Error(`GET ${resp.status}: ${textResp}`) };
      }
      let data = [];
      try {
        data = textResp ? JSON.parse(textResp) : [];
        if (!Array.isArray(data)) data = [data];
      } catch (e) {
        console.warn(`[Supabase Sync] GET ${tableName} parse error`, e);
      }
      return { data, error: null };
    }

    /** GET with in-filter in chunks to avoid URL length limits. Returns { data: merged[], error } */
    async function supabaseGetInChunks(tableName, select, column, values, chunkSize = 80) {
      const vals = [...new Set(values.map((v) => String(v).trim()).filter(Boolean))];
      const merged = [];
      let err = null;
      for (let i = 0; i < vals.length; i += chunkSize) {
        const chunk = vals.slice(i, i + chunkSize);
        const { data, error } = await supabaseGet(tableName, { select, inFilter: { column, values: chunk } });
        if (error) err = error;
        if (Array.isArray(data)) merged.push(...data);
      }
      return { data: merged, error: err };
    }
  
    /************************************************************
     *  Toast UI helpers
     ************************************************************/
    function ensureToastWrap() {
      let wrap = document.querySelector('.lw-toast-wrap');
      if (!wrap) {
        wrap = document.createElement('div');
        wrap.className = 'lw-toast-wrap';
        document.documentElement.appendChild(wrap);
      }
      return wrap;
    }

    function showToast(type, title, msg, opts = {}) {
      const wrap = ensureToastWrap();
      const t = document.createElement('div');
      const safeType = ['success','error','info','warn'].includes(type) ? type : 'info';
      t.className = `lw-toast lw-toast--${safeType}`;

      const body = document.createElement('div');
      const ttl = document.createElement('div');
      ttl.className = 'lw-toast-title';
      ttl.textContent = title || '';
      const m = document.createElement('div');
      m.className = 'lw-toast-msg';
      m.textContent = msg || '';
      body.appendChild(ttl);
      body.appendChild(m);

      const close = document.createElement('button');
      close.className = 'lw-toast-close';
      close.type = 'button';
      close.textContent = '×';
      close.addEventListener('click', () => t.remove());

      t.appendChild(body);
      t.appendChild(close);
      wrap.appendChild(t);

      // animate in
      requestAnimationFrame(() => t.classList.add('show'));

      const ms = Number(opts.timeoutMs ?? 3500);
      if (ms > 0) {
        setTimeout(() => {
          t.classList.remove('show');
          setTimeout(() => t.remove(), 200);
        }, ms);
      }
    }

    /************************************************************
     *  Small helpers
     ************************************************************/
    const text = (el) => (el ? el.textContent.trim() : '');
  
    function cleanCellText(cell) {
      if (!cell) return '';
  
      // innerText בדרך כלל מתעלם מטקסט שמגיע מ-<style> בתוך <svg> וכד'
      let v = (cell.innerText || '').trim();
  
      // fallback
      if (!v) v = (cell.textContent || '').trim();
  
      // ניקוי מקרים ידועים שבהם נגרר CSS מה-SVG (למשל ".c{fill:#...}")
      if (v && /\.[a-zA-Z]\w*\s*\{[^}]*\}/.test(v)) {
        // אם זה נראה כמו CSS, נסה לקחת רק שורה/חלק ראשון שאינו CSS
        const parts = v
          .split(/\n+/)
          .map((s) => s.trim())
          .filter(Boolean)
          .filter((s) => !/\.[a-zA-Z]\w*\s*\{[^}]*\}/.test(s));
        v = parts.join(' ').trim();
      }
  
      return v;
    }
  
    function parseQtyPair(qtyText) {
      // '0 / 1' -> { picked: 0, ordered: 1 }
      if (!qtyText) return { picked: null, ordered: null, raw: '' };
      const raw = String(qtyText).trim();
      const m = raw.match(/(-?\d+(?:[.,]\d+)?)\s*\/\s*(-?\d+(?:[.,]\d+)?)/);
      if (!m) return { picked: null, ordered: null, raw };
      const picked = parseFloat(m[1].replace(',', '.'));
      const ordered = parseFloat(m[2].replace(',', '.'));
      return {
        picked: Number.isFinite(picked) ? picked : null,
        ordered: Number.isFinite(ordered) ? ordered : null,
        raw,
      };
    }
  
    function parseNumberLoose(v) {
      if (v === null || v === undefined) return null;
      const s = String(v).trim();
      if (!s) return null;
      const num = parseFloat(s.replace(/[^א-ת\d.,-]/g, '').replace(',', '.'));
      return Number.isFinite(num) ? num : null;
    }
  
    function getRowValueByDataName(dataName, taskDoc = document) {
      const row = taskDoc.querySelector(
        `.row.align-items-center[data-name="${dataName}"]`
      );
      if (!row) return '';
      const valueCell =
        row.querySelector('.col-xxl-7.col-6 .hover-copy') ||
        row.querySelector('.col-xxl-7.col-6');
      return text(valueCell);
    }
  
    function getRowValueByLabel(labelText, taskDoc = document) {
      const rows = Array.from(taskDoc.querySelectorAll('.row.align-items-center'));
      for (const row of rows) {
        const labelCell = row.querySelector('.col-xxl-5.col-6 span');
        if (!labelCell) continue;
        if (text(labelCell) === labelText) {
          const valueCell =
            row.querySelector('.col-xxl-7.col-6 .hover-copy') ||
            row.querySelector('.col-xxl-7.col-6');
          return text(valueCell);
        }
      }
      return '';
    }
  
    function parseDateOnlyHebrew(d) {
      // קלט: '23/01/2026' → '2026-01-23'
      if (!d) return null;
      const m = d.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
      if (!m) return null;
      const [, day, month, year] = m;
      const dd = day.padStart(2, '0');
      const mm = month.padStart(2, '0');
      return `${year}-${mm}-${dd}`;
    }
  
    function parseDateTimeHebrew(d) {
      // קלט: '22/01/2026 17:50' → '2026-01-22T17:50:00'
      if (!d) return null;
      const m = d.match(
        /(\d{1,2})[./](\d{1,2})[./](\d{4})\s+(\d{1,2}):(\d{2})/
      );
      if (!m) return null;
      const [, day, month, year, hh, mm] = m;
      const dd = day.padStart(2, '0');
      const MM = month.padStart(2, '0');
      const HH = hh.padStart(2, '0');
      return `${year}-${MM}-${dd}T${HH}:${mm}:00`;
    }
  
    /************************************************************
     *  Header/Table helpers for data-label → header map → fallback
     ************************************************************/
    function normHeader(s) {
      return String(s || '')
        .replace(/\u00A0/g, ' ')
        .replace(/[״"]/g, '"')
        .replace(/\s+/g, ' ')
        .trim();
    }
  
    function buildHeaderIndexMap(tableEl) {
      const map = new Map(); // headerText -> columnIndex
      const ths = Array.from(tableEl.querySelectorAll('thead th'));
      ths.forEach((th, idx) => {
        const h = normHeader(th.textContent);
        if (h) map.set(h, idx);
      });
      return map;
    }
  
    function getCellByPriority(rowEl, headerMap, opts) {
      // opts: { dataLabel, headerText, fallbackIndex }
      const tds = Array.from(rowEl.querySelectorAll('td'));
      if (opts?.dataLabel) {
        const td = rowEl.querySelector(`td[data-label="${opts.dataLabel}"]`);
        if (td) return td;
      }
      if (opts?.headerText && headerMap?.has(opts.headerText)) {
        const i = headerMap.get(opts.headerText);
        if (Number.isInteger(i) && tds[i]) return tds[i];
      }
      if (Number.isInteger(opts?.fallbackIndex) && tds[opts.fallbackIndex]) {
        return tds[opts.fallbackIndex];
      }
      return null;
    }
  
    function textFrom(el) {
      if (!el) return '';
      return String(el.textContent || '').replace(/\u00A0/g, ' ').trim();
    }

    function lwFirstLine(v) {
      if (!v) return '';
      const s = String(v);
      const line = s.split(/\r?\n/).map(x => x.trim()).filter(Boolean)[0];
      return line || '';
    }

    function computeCompletion(picked, ordered) {
      if (!Number.isFinite(picked) || !Number.isFinite(ordered) || ordered <= 0) return null;
      const r = picked / ordered;
      // clamp
      return Math.max(0, Math.min(1, r));
    }
  
    /************************************************************
     *  Extract full order data from /tasks/{id} page
     ************************************************************/
    function extractOrderFromTaskPage(taskDoc = document, taskPath = location.pathname) {
      // task id from URL: /tasks/21977122
      const taskIdMatch = taskPath.match(/\/tasks\/(\d+)/);
      const task_id = taskIdMatch ? taskIdMatch[1] : null;
  
      // Meta info
      const wp_order_id = getRowValueByDataName('wp_order_id', taskDoc); // PA_1_10323569
      const created_at = getRowValueByLabel('תאריך יצירה', taskDoc);
      const pickup_at = getRowValueByDataName('pickup_at', taskDoc); // תאריך משלוח
      const shipped_delivery_id = getRowValueByLabel('מזהה משלוח משוגר', taskDoc);
      const packages_quantity = getRowValueByDataName('packages_quantity', taskDoc);
      const source = getRowValueByLabel('מקור יצירה', taskDoc); // "משוגר" / Online

      // Customer extra fields
      const customer_number = getRowValueByLabel('מספר לקוח', taskDoc); // מה-extra.*

      const is_self_pickup_str = getRowValueByDataName('is_self_pickup', taskDoc);
      const total_value_raw = getRowValueByLabel('שווי סחורה', taskDoc);
  
      // Destination
      const destination = {
        region: getRowValueByDataName('destination_region_str', taskDoc),
        city: getRowValueByDataName('destination_city', taskDoc),
        street: getRowValueByDataName('destination_street', taskDoc),
        building_number: getRowValueByDataName('destination_number', taskDoc),
        floor: getRowValueByDataName('destination_floor', taskDoc),
        apartment: getRowValueByDataName('destination_apartment', taskDoc),
        entrance: getRowValueByDataName('destination_entrance', taskDoc),
        entrance_code: getRowValueByDataName('destination_entrance_code', taskDoc),
        notes: getRowValueByDataName('destination_notes', taskDoc),
      };

      // Contact
      const contact = {
        name: getRowValueByDataName('destination_recipient_name', taskDoc),
        phone: getRowValueByDataName('destination_phone', taskDoc),
        phone2: getRowValueByDataName('destination_phone2', taskDoc),
        email: getRowValueByDataName('destination_email', taskDoc),
      };
  
      // Notes / tracking
      const comments = {
        delivery_notes: getRowValueByDataName('notes', taskDoc),
        driver_notes: getRowValueByDataName('driver_note', taskDoc),
        tracking_code: getRowValueByLabel('קוד מעקב', taskDoc),
      };
  
      // Items table (upper "פריטים במשלוח" table – not the edit modal)
      const items = [];
      const table = taskDoc.querySelector('.table.table-hover');
      if (!table) {
        console.warn('[Supabase Sync] Items table not found');
      } else {
        // ---------- 1) Build headerMap from THEAD (fallback tier) ----------
        const thead = table.querySelector('thead');
        const headerMap = {};
        if (thead) {
          const headers = thead.querySelectorAll('th');
          headers.forEach((th, idx) => {
            const headerText = cleanCellText(th).toLowerCase();
  
            if (headerText.includes('ברקוד') || headerText.includes('מקט') || headerText.includes('מק״ט') || headerText.includes('sku') || headerText.includes('קוד')) {
              headerMap.sku = idx;
            }
            if (headerText.includes('שם') || headerText.includes('מוצר') || headerText.includes('product')) {
              headerMap.name = idx;
            }
            if (headerText.includes('כמות') || headerText.includes('quantity') || headerText.includes('qty')) {
              headerMap.quantity = idx;
            }
            if (headerText.includes('מחיר') || headerText.includes('price') || headerText.includes('שווי')) {
              headerMap.price = idx;
            }
            if (headerText.includes('משקל') || headerText.includes('weight')) {
              headerMap.weight = idx;
            }
          });
        }
  
        // ---------- 2) Fallback indexes (last resort) ----------
        const skuIdx    = (headerMap.sku      !== undefined) ? headerMap.sku      : 1;
        const nameIdx   = (headerMap.name     !== undefined) ? headerMap.name     : 2;
        const qtyIdx    = (headerMap.quantity !== undefined) ? headerMap.quantity : 4;
        const priceIdx  = (headerMap.price    !== undefined) ? headerMap.price    : 5;
        const weightIdx = (headerMap.weight   !== undefined) ? headerMap.weight   : 6;
  
        // ---------- 3) Helpers: prefer data-label, then headerMap index, then fallback ----------
        const LABEL_SYNONYMS = {
          sku:      ['ברקוד', 'מק״ט', 'מקט', 'sku'],
          name:     ['שם', 'מוצר', 'product'],
          quantity: ['כמות', 'לוקט', 'quantity', 'qty'],
          price:    ['מחיר', 'price'],
          weight:   ['משקל', 'weight'],
        };
  
        function findCellByDataLabel(tr, key) {
          const wants = LABEL_SYNONYMS[key] || [];
          const tds = Array.from(tr.querySelectorAll('td'));
          for (const td of tds) {
            const dl = (td.getAttribute('data-label') || '').trim().toLowerCase();
            if (!dl) continue;
            if (wants.some(w => dl.includes(String(w).toLowerCase()))) return td;
          }
          return null;
        }
  
        function pickCell(tr, key, idxFallback) {
          const byLabel = findCellByDataLabel(tr, key);
          if (byLabel) return byLabel;
  
          const tds = tr.querySelectorAll('td');
          const idx = idxFallback;
          return (idx >= 0 && idx < tds.length) ? tds[idx] : null;
        }
  
        // ---------- 4) Extract rows ----------
        const tbody = table.querySelector('tbody');
        if (!tbody) {
          console.warn('[Supabase Sync] Items tbody not found');
        } else {
          const rows = tbody.querySelectorAll('tr');
          rows.forEach((tr) => {
            const skuCell = pickCell(tr, 'sku', skuIdx);
            const nameCell = pickCell(tr, 'name', nameIdx);
            const qtyCell = pickCell(tr, 'quantity', qtyIdx);
            const priceCell = pickCell(tr, 'price', priceIdx);
            const weightCell = pickCell(tr, 'weight', weightIdx);
  
            // sku: עדיף "ברקוד" נקי (ספרות בלבד)
            const skuText = skuCell ? cleanCellText(skuCell) : '';
            const sku = (skuText || '').replace(/[^\d]/g, '').trim();
  
            // original_sku (אם toolbox הוסיף data-original-sku על תא הברקוד)
            const originalSku = skuCell?.getAttribute('data-original-sku') || null;
  
            // name: חילוץ עמיד (לינקים/אייקונים/וכו')
            let name = '';
            if (nameCell) {
              name = cleanCellText(nameCell);
  
              if (!name) {
                const link = nameCell.querySelector('a[title]');
                if (link) name = (link.getAttribute('title') || '').trim();
              }
  
              if (!name) {
                const elem = nameCell.querySelector('[data-original-title]');
                if (elem) name = (elem.getAttribute('data-original-title') || '').trim();
              }
  
              if (!name) {
                const clone = nameCell.cloneNode(true);
                clone.querySelectorAll('svg, style').forEach(el => el.remove());
                name = (clone.textContent || '').trim();
              }
            }
  
            // quantity: "picked / ordered"
            const qtyText = qtyCell ? cleanCellText(qtyCell) : '';
            const qtyPair = parseQtyPair(qtyText);
  
            // price/weight raw (ל־QA / extra_json)
            const priceRaw = priceCell ? cleanCellText(priceCell) : '';
            const weightRaw = weightCell ? cleanCellText(weightCell) : '';
  
            // completion & is_fully_picked
            const completion = computeCompletion(qtyPair.picked, qtyPair.ordered);
            const is_fully_picked =
              (qtyPair.picked !== null && qtyPair.ordered !== null && qtyPair.ordered !== 0 && qtyPair.picked === qtyPair.ordered);
  
            // דילוג על שורות ריקות
            if (!sku && !name) return;
  
            items.push({
              sku: sku || null,
              original_sku: originalSku,
              name: (name || '').trim(),
              qty_picked: qtyPair.picked,
              qty_ordered: qtyPair.ordered,
              qty_raw: qtyPair.raw,
              completion,
              is_fully_picked,
              price_raw: priceRaw,
              weight_raw: weightRaw,
              price: parseNumberLoose(priceRaw),
              weight: parseNumberLoose(weightRaw),
            });
          });
        }
      }
  
      // נהג: בדף משימה בודדת – .drivers-dropdown-current-driver (רק הנהג הנבחר)
      const driverEl = taskDoc.querySelector('.drivers-dropdown-current-driver');
      const driver_name = driverEl ? textFrom(driverEl) : null;

      // סטטוס: מ־.ajax-status-current-text או מ־canceled-task/completed-task וכו'
      const statusEl = taskDoc.querySelector('.ajax-status-current-text');
      const status_text = statusEl ? textFrom(statusEl).trim() : null;

      return {
        order_meta: {
          task_id,
          wp_order_id,
          created_at,
          pickup_at,
          shipped_delivery_id,
          packages_quantity,
          source,
          customer_number,
          is_self_pickup_str,
          total_value_raw,
          driver_name: driver_name || null,
          status_text: status_text || null,
        },
        destination,
        contact,
        comments,
        items,
      };
    }

    function extractOrderWithCache(taskDoc = document, taskPath = location.pathname) {
      const data = extractOrderFromTaskPage(taskDoc, taskPath);
      const taskId = String(data?.order_meta?.task_id || '').trim();
      if (taskId) saveTaskCache(taskId, data);
      return data;
    }

    // ===== Supabase performance helpers (inspired by MissingTable.js) =====
    // מגביל כמה בקשות Supabase רצות במקביל כדי למנוע חניקה / 429 / זמן תגובה איטי
    const SUPABASE_CONCURRENCY = 3; // 3–4 זה בדרך כלל sweet spot ל-Tampermonkey

    function pLimit(concurrency) {
      let active = 0;
      const queue = [];

      const next = () => {
        if (active >= concurrency || queue.length === 0) return;
        const { fn, resolve, reject } = queue.shift();
        active++;
        Promise.resolve()
          .then(fn)
          .then((val) => {
            active--;
            resolve(val);
            next();
          })
          .catch((err) => {
            active--;
            reject(err);
            next();
          });
      };

      return (fn) =>
        new Promise((resolve, reject) => {
          queue.push({ fn, resolve, reject });
          next();
        });
    }

    const _limitSupabaseRaw = pLimit(SUPABASE_CONCURRENCY);

    function limitSupabase(label, fn) {
      return _limitSupabaseRaw(async () => {
        try {
          return await fn();
        } catch (err) {
          console.error('[OrdersSync] Supabase error in', label, err);
          throw err;
        }
      });
    }

    /**
     * upsertRowsBatched – דוחף לרצף של בקשות batched קטנות במקום ירייה אחת ענקית.
     * השימוש: upsertFn מקבל batch ומחזיר Promise של בקשה ל-Supabase (fetch או supabase-js).
     * תבנית עם fetch/supabaseUpsert:
     *   await upsertRowsBatched({
     *     label: 'orders_raw',
     *     rows: orderRows,
     *     batchSize: 200,
     *     upsertFn: (batch) => supabaseUpsert(SUPABASE_TABLE, batch, 'order_id'),
     *   });
     */
    async function upsertRowsBatched({ label, rows, batchSize = 200, upsertFn }) {
      if (!Array.isArray(rows) || rows.length === 0) {
        return { batches: 0, rows: 0 };
      }

      let batches = 0;
      let totalRows = 0;
      for (let i = 0; i < rows.length; i += batchSize) {
        if (batches > 0) await lwYieldToMain();
        const batch = rows.slice(i, i + batchSize);
        batches++;
        totalRows += batch.length;
        await limitSupabase(label, () => upsertFn(batch));
      }
      return { batches, rows: totalRows };
    }

    /* תבנית החלפה לקריאות upsert קיימות (fetch/REST – supabaseUpsert):
     * - store_visits:  supabaseUpsert(SUPABASE_VISITS_TABLE, rows, 'task_id')
     *   → upsertRowsBatched({ label: 'store_visits_raw', rows, batchSize: 200, upsertFn: (b) => supabaseUpsert(SUPABASE_VISITS_TABLE, b, 'task_id') })
     * - משימה בודדת:  supabaseUpsertOrderRow(orderRow) + supabaseUpsertOrderItemsRows(itemRows)
     *   → order: upsertRowsBatched({ label: 'lionwheel_export_tasks_raw', rows: [orderRow], batchSize: 200, upsertFn: (b) => supabaseUpsert(SUPABASE_TABLE, b, 'order_id') })
     *   → items: upsertRowsBatched({ label: 'lionwheel_export_task_items_raw', rows: itemRows, batchSize: 200, upsertFn: (b) => supabaseUpsert(SUPABASE_ITEMS_TABLE, b, 'order_id,line_no') })
     */

    async function buildOrderItemsRawRecordsFromTask(data) {
      const orderId = String(data?.order_meta?.task_id || '').trim();
      if (!orderId) throw new Error('Missing task_id; cannot build items rows.');
  
      const items = Array.isArray(data.items) ? data.items : [];
  
      // ✅ אם בעתיד תוסיף עמודה is_fully_picked בטבלת lionwheel_export_task_items_raw:
      //    1) הוסף עמודה boolean בשם is_fully_picked
      //    2) שנה ל-true
      const INCLUDE_IS_FULLY_PICKED_COLUMN = false;
      const rows = [];
      const yieldEvery = ORDERS_SYNC_CONFIG.YIELD_EVERY_ROWS;

      for (let idx = 0; idx < items.length; idx++) {
        if (idx > 0 && idx % yieldEvery === 0) await yieldToMain();

        const it = items[idx];
        const barcodeOrSku = (it.sku || '').trim() || null;
        const rawName = (it.name || '').trim() || null;

        let name = rawName;
        let qtySignedFromNamePrefix = null;
        if (rawName) {
          const mQty = rawName.match(/^(-?\d+)\s*:\s*(.+)$/);
          if (mQty) {
            const signed = parseInt(mQty[1], 10);
            if (!Number.isNaN(signed)) qtySignedFromNamePrefix = signed;
            name = (mQty[2] || '').trim() || null;
          }
        }

        const decision = lwDecideQtyAndMaybeSkip(it, barcodeOrSku, name, qtySignedFromNamePrefix);
        if (decision.skip) {
          continue;
        }

        let quantity = decision.qty;
        let quantity_signed = null;
        if (quantity === null || Number.isNaN(quantity) || quantity <= 0) {
          quantity = 1;
        }

        const qtyPicked = (typeof it.qty_picked === 'number') ? it.qty_picked : null;
        const qtyOrdered = (typeof it.qty_ordered === 'number') ? Math.abs(it.qty_ordered) : quantity;
        const qty_ordered_signed = (typeof it.qty_ordered === 'number') ? it.qty_ordered : null;
        const completion = computeCompletion(qtyPicked, qtyOrdered);
        const is_fully_picked =
          (qtyPicked !== null && qtyOrdered !== null && qtyOrdered !== 0 && qtyPicked === qtyOrdered);

        const extra_json = {
          ...it,
          qty_picked: qtyPicked,
          qty_ordered: qtyOrdered,
          qty_ordered_signed: qty_ordered_signed,
          qty_from_name_prefix_signed: qtySignedFromNamePrefix,
          quantity_signed,
          quantity_was_normalized: (quantity_signed !== null) || (qtySignedFromNamePrefix !== null),
          qty_raw: it.qty_raw || null,
          original_sku: it.original_sku || null,
          price: (typeof it.price === 'number') ? it.price : null,
          weight: (typeof it.weight === 'number') ? it.weight : null,
          price_raw: it.price_raw || null,
          weight_raw: it.weight_raw || null,
          completion,
          is_fully_picked
        };

        const row = {
          task_id: orderId,
          order_id: orderId,
          line_no: idx + 1,
          sku: barcodeOrSku,
          name,
          variant: null,
          quantity: (Number.isFinite(qtyOrdered) && qtyOrdered > 0) ? qtyOrdered : (qtyPicked ?? quantity),
          unit_price: null,
          weight: null,
          extra_json
        };
        if (INCLUDE_IS_FULLY_PICKED_COLUMN) row.is_fully_picked = is_fully_picked;
        rows.push(row);
      }

      logDebug('lionwheel_export_task_items_raw rows built:', rows.length);
      return rows;
    }
  
    /************************************************************
     *  Map to lionwheel_export_tasks_raw row
     *  
     *  חשוב: הפונקציה ממלאת את כל שדות התאריך הנדרשים:
     *    - order_date: תאריך ההזמנה (מ-pickup_at/created_at או מ-order_datetime)
     *    - order_datetime: תאריך ושעה מלא (מ-created_at)
     *    - created_date: תאריך ל־v_forecast_with_status / היסטוריית הזמנות בתחזית
     *    - order_time: שעה בלבד (HH:mm) ל־v_forecast_with_status
     *  
     *  הערה: שורות ישנות שנכנסו לפני עדכון זה עלולות להיות חסרות
     *        created_date/order_time. ראה fix_missing_dates.sql לתיקון.
     ************************************************************/
    function buildOrdersRawRecordFromTask(data) {
      if (!data?.order_meta?.task_id) {
        throw new Error('לא נמצא task_id ב-URL');
      }
  
      const createdAt = data?.order_meta?.created_at;
      const pickupAt = data?.order_meta?.pickup_at;
      const order_datetime = parseDateTimeHebrew(data.order_meta.created_at);
      const final_order_date = parseDateOnlyHebrew(createdAt) || parseDateOnlyHebrew(pickupAt) || (order_datetime ? order_datetime.slice(0, 10) : null);
      const final_pickup_date = parseDateOnlyHebrew(pickupAt) || null;

      const isSelfPickupStr = data.order_meta.is_self_pickup_str ?? '';
      let is_self_pickup = null;
      if (isSelfPickupStr === 'כן') is_self_pickup = true;
      else if (isSelfPickupStr === 'לא') is_self_pickup = false;

      const totalValueRaw = data.order_meta.total_value_raw ?? '';
      let total_value = null;
      if (totalValueRaw) {
        const num = parseFloat(String(totalValueRaw).replace(/[^\d.,]/g, '').replace(',', '.'));
        if (!Number.isNaN(num)) total_value = num;
      }
  
      const items_count = Array.isArray(data.items) ? data.items.length : null;
  
      const record = {
        // חשוב: למלא גם task_id כי אצלך הוא NOT NULL
        task_id: String(data.order_meta.task_id),
        // מזהים
        order_id: String(data.order_meta.task_id), // 21977122
        wp_order_id: data.order_meta.wp_order_id || null,
        delivery_id: data.order_meta.shipped_delivery_id || null,
  
        // תאריכים (created_date נדרש ל־v_forecast_with_status / היסטוריית הזמנות בתחזית)
        order_date: final_order_date, // '2026-01-23' (מ-created_at ואז pickup_at או מ-order_datetime)
        pickup_date: final_pickup_date, // תאריך איסוף
        order_datetime: order_datetime, // '2026-01-22T17:50:00' או null
        created_date: final_order_date, // כמו Excel – תאריך ל־order_history בתחזית (תמיד מולא אם יש order_datetime)
        order_time: order_datetime ? order_datetime.slice(11, 16) : null, // 'HH:mm' מתוך order_datetime
  
        // מקור / סטטוס / איסוף (status_text מועבר מ־store_visits או מחולץ מדף המשימה)
        source: data.order_meta.source || null, // "משוגר" / "Online" וכו'
        source_page: 'userscript_sync', // הזמנות מהסקריפט (בניגוד ל-excel_export)
        is_self_pickup: is_self_pickup, // true / false / null
        status_text: data.order_meta.status_text || null, // בוטל / בוצע / אושר וכו' — להחלפה מ־store_visits
  
        // כתובת
        region: data.destination.region || null,
        city: data.destination.city || null,
        street: data.destination.street || null,
        building_number: data.destination.building_number || null,
        entrance: data.destination.entrance || null,
        floor: data.destination.floor || null,
        apartment: data.destination.apartment || null,
        address_notes: data.destination.notes || null,
  
        // לקוח
        customer_name: data.contact.name || null,
        customer_phone: data.contact.phone || null,
        customer_phone2: data.contact.phone2 || null,
        customer_email: data.contact.email || null,
        customer_number: data.order_meta.customer_number || null,
  
        // משלוח / שליח / חברה / קוד מעקב
        courier_name: data.order_meta.driver_name || null,
        driver_name: data.order_meta.driver_name || null,
        delivery_company: null, // אפשר לחלץ מהלוגו אם נרצה
        tracking_code: data.comments.tracking_code || null,
  
        // חבילות / סכומים
        packages_quantity: data.order_meta.packages_quantity || null,
        items_count: items_count,
        total_value: total_value,
        currency: 'ILS',
  
        // הערות
        driver_note: data.comments.driver_notes || null,
        delivery_notes: data.comments.delivery_notes || null,
        internal_notes: null, // אפשר לחלץ מתוך "הערות משלוח" אחרות בעתיד
  
        // raw data – לשימוש עתידי / דיבוג (jsonb מצפה לאובייקט, לא מחרוזת)
        raw_task: data,
        raw_store_visit: null,
      };
  
      logDebug('lionwheel_export_tasks_raw record built:', record.order_id);
      return record;
    }

    const LS_KEY_STOREVISITS_AUTOSYNC_YMD = 'lw_storevisits_autosync_ymd';

    function getLocalYMD() {
      // YYYY-MM-DD לפי הזמן המקומי של המחשב
      const d = new Date();
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }

    async function autoSyncStoreVisitsOncePerDay() {
      try {
        const today = getLocalYMD();
        const last = localStorage.getItem(LS_KEY_STOREVISITS_AUTOSYNC_YMD);

        if (last === today) {
          return; // כבר בוצע היום
        }

        // ודא שהטבלה קיימת לפני ריצה
        const table = document.querySelector('#operator-store-visits-table');
        if (!table) return;

        // סימון מראש כדי למנוע double-run אם יש 2 init calls (יש אצלך run + setTimeout(run,2000))
        localStorage.setItem(LS_KEY_STOREVISITS_AUTOSYNC_YMD, today);

        showToast('info', 'Supabase Sync', 'סנכרון אוטומטי של store_visits התחיל…', { timeoutMs: 2200 });
        const res = await syncStoreVisitsIndexToSupabase();

        if (!res?.ok) {
          // אם נכשל, נאפשר ניסיון חוזר בהמשך היום (לא ננעל על "בוצע")
          localStorage.removeItem(LS_KEY_STOREVISITS_AUTOSYNC_YMD);
        }
      } catch (e) {
        console.error('[Supabase Sync] autoSyncStoreVisitsOncePerDay failed:', e);
        // גם פה – לא "לנעול" את היום
        localStorage.removeItem(LS_KEY_STOREVISITS_AUTOSYNC_YMD);
        showToast('error', 'Supabase Sync נכשל', 'האוטו-סנכרון נכשל (ראה console)');
      }
    }

    /************************************************************
     *  Store Visits extraction (from /operator/store_visits)
     ************************************************************/
    function parseDateDDMMYYYY(s) {
      // "23/01/2026" -> "2026-01-23"
      const m = String(s || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (!m) return null;
      const dd = m[1].padStart(2, '0');
      const mm = m[2].padStart(2, '0');
      const yyyy = m[3];
      return `${yyyy}-${mm}-${dd}`;
    }
  
    function extractStoreVisitsFromIndexTable() {
      const table = document.querySelector('#operator-store-visits-table');
      if (!table) {
        console.warn('[Supabase Sync] store_visits table not found (#operator-store-visits-table)');
        return [];
      }
  
      const headerMap = buildHeaderIndexMap(table);
      const rows = Array.from(table.querySelectorAll('tbody tr[data-task-id]'));
  
      return rows.map((tr) => {
        const task_id = String(tr.getAttribute('data-task-id') || '').trim() || null;
  
        // עמודות "בטוחות" לפי כותרת (כי data-label לא תמיד קיים ב-index table)
        const tdOrder = getCellByPriority(tr, headerMap, { headerText: 'הזמנה', fallbackIndex: 3 });
        const tdCity  = getCellByPriority(tr, headerMap, { headerText: 'עיר',   fallbackIndex: 5 });
        const tdAddr  = getCellByPriority(tr, headerMap, { headerText: 'כתובת', fallbackIndex: 6 });
        // שם: העדפה ל־data-label (מנעה קריאת תא סטטוס עם כל האפשרויות)
        const tdName  = tr.querySelector('td[data-label="שם"]') || getCellByPriority(tr, headerMap, { headerText: 'שם', fallbackIndex: 8 });
        const tdRegion= getCellByPriority(tr, headerMap, { headerText: 'איזור',  fallbackIndex: 16 });
  
        // סטטוס/ליקוט: יש שם badge עם טקסט פנימי
        const tdStatus    = getCellByPriority(tr, headerMap, { headerText: 'סטטוס', fallbackIndex: 9 });
        const tdPick      = getCellByPriority(tr, headerMap, { headerText: 'ליקוט',  fallbackIndex: 10 });
  
        const status_text = lwFirstLine(
          textFrom(
            tdStatus?.querySelector('button.status-dropdown-btn .ajax-status-current-text')
            || tdStatus?.querySelector('.ajax-status-current-text')
            || tdStatus
          )
        );
        const pick_status_text = lwFirstLine(
          textFrom(
            tdPick?.querySelector('button.pick-status .pick-status-text')
            || tdPick?.querySelector('.pick-status-text')
            || tdPick
          )
        );
  
        // תאריך איסוף: input בתוך תא "תאריך"
        const tdDate = getCellByPriority(tr, headerMap, { headerText: 'תאריך', fallbackIndex: 12 });
        const pickup_date_raw = tdDate?.querySelector('input.visit-pickup-date')?.value || textFrom(tdDate);
  
        // נהג: קודם .drivers-dropdown-current-driver (רק הנהג הנבחר), אחרת title של select2 (לא כל הרשימה)
        const tdDriver = getCellByPriority(tr, headerMap, { headerText: 'נהג', fallbackIndex: 14 });
        const driverSpan = tdDriver?.querySelector('.drivers-dropdown-current-driver');
        const driverSelect2 = tdDriver?.querySelector('.select2-selection__rendered');
        const driver_name =
          (driverSpan ? textFrom(driverSpan) : null) ||
          (driverSelect2?.getAttribute('title') ? String(driverSelect2.getAttribute('title')).trim() : null) ||
          textFrom(driverSelect2) ||
          textFrom(tdDriver);
  
        const wp_order_id = textFrom(tdOrder);
        // שם לקוח: תא עם data-label="שם" מכיל span עם השם בלבד (לא dropdown סטטוס)
        const nameSpan = tdName?.querySelector('span');
        const customer_name = (nameSpan ? textFrom(nameSpan).trim() : null) || textFrom(tdName) || null;
  
        return {
          task_id,
          wp_order_id: wp_order_id || null,
          city: textFrom(tdCity) || null,
          address: textFrom(tdAddr) || null,
          customer_name: customer_name || null,
          region: textFrom(tdRegion) || null,
          status_text: status_text || null,
          pick_status_text: pick_status_text || null,
          pickup_date_raw: pickup_date_raw || null, // נשאיר raw וננרמל בהמשך
          driver_name: driver_name || null,
          source_page: 'operator_store_visits',
          extra_json: {
            row_id: tr.id || null
          }
        };
      });
    }
  
  /************************************************************
   * Exclusion rules (do NOT collect / sync these tasks)
   ************************************************************/
  const LW_EXCLUDE_RULES = {
    regionEquals: new Set(['מרלוג צור יגאל (צ\'יטה)']),
    driverNameEquals: new Set(['שיגור למרלוג'])
  };

  function lwNormText(s) {
    return String(s ?? '').trim();
  }

  function lwShouldExcludeTaskByMeta(meta) {
    const region = lwNormText(meta?.region);
    const driverName =
      lwNormText(meta?.driver_name) ||
      lwNormText(meta?.driverName) ||
      lwNormText(meta?.courier_name) ||
      lwNormText(meta?.courierName);

    return (
      (region && LW_EXCLUDE_RULES.regionEquals.has(region)) ||
      (driverName && LW_EXCLUDE_RULES.driverNameEquals.has(driverName))
    );
  }

  /************************************************************
   * Hybrid Pagination (DataTables API first, UI click fallback)
   ************************************************************/
  const lwWait = (ms) => new Promise((r) => setTimeout(r, ms));

  /************************************************************
   * 1-hour task sync cache (skip re-sync within last hour)
   ************************************************************/
  const LW_TASK_SYNC_CACHE_KEY = 'lw_task_sync_cache_v1';
  const LW_TASK_SYNC_TTL_MS = 60 * 60 * 1000; // 1 hour

  function lwNowMs() { return Date.now(); }

  // ========= Sync stats (reset per run) =========
  const LW_SYNC_STATS = {
    skipped_negative_items: 0,
    skipped_zero_items: 0,
    skipped_excluded_items: 0,
  };

  function lwResetSyncStats() {
    LW_SYNC_STATS.skipped_negative_items = 0;
    LW_SYNC_STATS.skipped_zero_items = 0;
    LW_SYNC_STATS.skipped_excluded_items = 0;
  }

  function lwTrackSkippedQty(qtyRaw) {
    const q = Number(qtyRaw);
    if (!Number.isFinite(q)) return;
    if (q < 0) LW_SYNC_STATS.skipped_negative_items++;
    else if (q === 0) LW_SYNC_STATS.skipped_zero_items++;
  }

  /**
   * נקודת אמת אחת לכל החלטות הדילוג של items.
   * - excludes לפי barcode/keyword
   * - דילוג לפי qty בעייתי (<=0) + עדכון סטטיסטיקות
   *
   * @param {object} it - item object (כולל qty_ordered/qty_picked)
   * @param {string|number} sku - SKU/Barcode
   * @param {string} name - שם הפריט
   * @param {number|null} qtyFallback - fallback quantity אם אין qty_ordered מספרי
   * @returns {{skip:boolean, qty:number|null, reason?:string}}
   */
  function lwDecideQtyAndMaybeSkip(it, sku, name, qtyFallback, opts) {
    const track = (opts && typeof opts.track === 'boolean') ? opts.track : true;
    const allowZeroQty = opts && opts.allowZeroQty === true;
    if (isItemExcluded(sku, name)) {
      if (track) LW_SYNC_STATS.skipped_excluded_items++;
      return { skip: true, qty: null, reason: 'excluded' };
    }

    const ordered = Number(it?.qty_ordered);
    const picked = Number(it?.qty_picked);

    if (!allowZeroQty && Number.isFinite(ordered) && ordered <= 0) {
      if (track) lwTrackSkippedQty(ordered);
      return { skip: true, qty: null, reason: 'ordered<=0' };
    }

    if (!Number.isFinite(ordered) && Number.isFinite(picked) && picked < 0) {
      if (track) lwTrackSkippedQty(picked);
      return { skip: true, qty: null, reason: 'picked<0' };
    }

    const qFallback = (qtyFallback == null ? null : Number(qtyFallback));
    if (!allowZeroQty && qFallback != null && Number.isFinite(qFallback) && qFallback <= 0) {
      if (track) lwTrackSkippedQty(qFallback);
      return { skip: true, qty: null, reason: 'fallback<=0' };
    }

    const qty = Number.isFinite(ordered)
      ? ordered
      : (qFallback != null && Number.isFinite(qFallback) ? qFallback : null);
    return { skip: false, qty };
  }

  function lwLoadTaskSyncCache() {
    try {
      const raw = localStorage.getItem(LW_TASK_SYNC_CACHE_KEY);
      const obj = raw ? JSON.parse(raw) : {};
      return (obj && typeof obj === 'object') ? obj : {};
    } catch (e) {
      return {};
    }
  }

  function lwSaveTaskSyncCache(cache) {
    try {
      localStorage.setItem(LW_TASK_SYNC_CACHE_KEY, JSON.stringify(cache || {}));
    } catch (e) {}
  }

  function lwPruneTaskSyncCache(cache) {
    const now = lwNowMs();
    let changed = false;
    for (const [tid, ts] of Object.entries(cache)) {
      const t = Number(ts);
      if (!Number.isFinite(t) || (now - t) > LW_TASK_SYNC_TTL_MS) {
        delete cache[tid];
        changed = true;
      }
    }
    if (changed) lwSaveTaskSyncCache(cache);
    return cache;
  }

  function lwWasTaskSyncedRecently(taskId, cache) {
    const ts = Number(cache?.[taskId]);
    if (!Number.isFinite(ts)) return false;
    return (lwNowMs() - ts) <= LW_TASK_SYNC_TTL_MS;
  }

  function lwMarkTaskSynced(taskId, cache) {
    cache[String(taskId)] = lwNowMs();
  }

  function lwFormatMinLeft(tsMs) {
    const left = Math.max(0, LW_TASK_SYNC_TTL_MS - (lwNowMs() - tsMs));
    return Math.ceil(left / 60000);
  }

  /************************************************************
   * Overlay (reduce flicker during pagination crawl)
   ************************************************************/
  function lwShowPaginationOverlay(text = 'אוסף נתונים מכל העמודים…') {
    try {
      const wrap =
        document.querySelector('#operator-store-visits-table_wrapper') ||
        document.querySelector('#operator-store-visits-table')?.closest('.dataTables_wrapper') ||
        document.querySelector('#operator-store-visits-table')?.parentElement;
      if (!wrap) return;

      const cs = getComputedStyle(wrap);
      if (cs.position === 'static') wrap.style.position = 'relative';

      let ov = wrap.querySelector('#lw-pagination-overlay');
      if (!ov) {
        ov = document.createElement('div');
        ov.id = 'lw-pagination-overlay';
        ov.style.position = 'absolute';
        ov.style.inset = '0';
        ov.style.zIndex = '9999';
        ov.style.display = 'flex';
        ov.style.alignItems = 'center';
        ov.style.justifyContent = 'center';
        ov.style.pointerEvents = 'auto';
        ov.style.background = 'rgba(255,255,255,0.35)';
        ov.style.backdropFilter = 'blur(1px)';
        ov.style.webkitBackdropFilter = 'blur(1px)';

        const card = document.createElement('div');
        card.style.padding = '10px 14px';
        card.style.borderRadius = '10px';
        card.style.background = 'rgba(255,255,255,0.70)';
        card.style.boxShadow = '0 6px 18px rgba(0,0,0,0.12)';
        card.style.display = 'flex';
        card.style.alignItems = 'center';
        card.style.gap = '10px';

        const spinner = document.createElement('div');
        spinner.style.width = '16px';
        spinner.style.height = '16px';
        spinner.style.border = '2px solid rgba(0,0,0,0.18)';
        spinner.style.borderTopColor = 'rgba(0,0,0,0.55)';
        spinner.style.borderRadius = '50%';
        spinner.style.animation = 'lwSpin 0.9s linear infinite';

        const label = document.createElement('div');
        label.id = 'lw-pagination-overlay-text';
        label.style.fontSize = '13px';
        label.style.fontWeight = '600';
        label.style.color = 'rgba(0,0,0,0.78)';
        label.textContent = text;

        card.appendChild(spinner);
        card.appendChild(label);
        ov.appendChild(card);
        wrap.appendChild(ov);

        if (!document.querySelector('#lw-pagination-overlay-style')) {
          const st = document.createElement('style');
          st.id = 'lw-pagination-overlay-style';
          st.textContent = `
            @keyframes lwSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          `;
          document.head.appendChild(st);
        }
      } else {
        const label = ov.querySelector('#lw-pagination-overlay-text');
        if (label) label.textContent = text;
      }

      ov.style.display = 'flex';
      return ov;
    } catch (e) {
      // non-fatal
    }
  }

  function lwHidePaginationOverlay() {
    try {
      const wrap =
        document.querySelector('#operator-store-visits-table_wrapper') ||
        document.querySelector('#operator-store-visits-table')?.closest('.dataTables_wrapper') ||
        document.querySelector('#operator-store-visits-table')?.parentElement;
      const ov = wrap?.querySelector('#lw-pagination-overlay');
      if (ov) ov.style.display = 'none';
    } catch (e) {}
  }

  function lwUpdatePaginationOverlay(text) {
    try {
      const wrap =
        document.querySelector('#operator-store-visits-table_wrapper') ||
        document.querySelector('#operator-store-visits-table')?.closest('.dataTables_wrapper') ||
        document.querySelector('#operator-store-visits-table')?.parentElement;
      const label = wrap?.querySelector('#lw-pagination-overlay-text');
      if (label) label.textContent = text;
    } catch (e) {}
  }

  function getStoreVisitsDataTable() {
    try {
      const w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
      const $ = w.jQuery || w.$;
      if (!$ || !$.fn || !$.fn.DataTable) return null;
      if (!$.fn.DataTable.isDataTable('#operator-store-visits-table')) return null;
      return $('#operator-store-visits-table').DataTable();
    } catch (e) {
      return null;
    }
  }

  function parseCurrentPageFromInfo() {
    // "מציג עמוד 2 מתוך 5" -> 2
    const el = document.querySelector('#operator-store-visits-table_info');
    const m = String(el?.textContent || '').match(/עמוד\s+(\d+)\s+מתוך\s+(\d+)/);
    if (!m) return { page1: 1, pages: 1 };
    return { page1: Number(m[1]) || 1, pages: Number(m[2]) || 1 };
  }

  async function waitForDtDraw(dt, timeoutMs = 1500) {
    return new Promise((resolve) => {
      let done = false;
      const t = setTimeout(() => {
        if (!done) {
          done = true;
          resolve(false);
        }
      }, timeoutMs);
      try {
        dt.one('draw', () => {
          if (done) return;
          done = true;
          clearTimeout(t);
          resolve(true);
        });
      } catch (e) {
        clearTimeout(t);
        resolve(false);
      }
    });
  }

  async function crawlStoreVisitsViaDataTablesAPI(dt, silent = false) {
    const info = dt.page.info();
    const originalPage0 = info?.page ?? 0; // 0-based
    const pagesCount = info?.pages ?? 1;

    const all = [];
    const seen = new Set();

    for (let p = 0; p < pagesCount; p++) {
      if (!silent) {
        showToast(`אוסף (API): עמוד ${p + 1}/${pagesCount} • נאספו ${all.length}`, 'info', 1000);
        lwUpdatePaginationOverlay(`Pagination (API): עמוד ${p + 1}/${pagesCount} • נאספו ${all.length}`);
      }

      if (p !== dt.page()) {
        const drawP = waitForDtDraw(dt);
        dt.page(p).draw('page');
        await drawP;
      }

      // יותר בטוח מ-tick 0ms
      await lwWait(50);

      const pageRows = extractStoreVisitsFromIndexTable();
      for (const row of pageRows) {
        const id = String(row?.task_id || '').trim();
        if (id) {
          if (seen.has(id)) continue;
          seen.add(id);
        }
        all.push(row);
      }
      await lwYieldToMain();
    }

    // חזרה לעמוד המקורי בדיוק
    if (originalPage0 !== dt.page()) {
      dt.page(originalPage0).draw('page');
    }

    return all;
  }

  function waitForTableChange(oldFirstTaskId, timeoutMs = 3000) {
    return new Promise((resolve) => {
      const start = Date.now();
      const check = () => {
        const firstRow = document.querySelector('#operator-store-visits-table tbody tr[data-task-id]');
        const newId = firstRow ? firstRow.getAttribute('data-task-id') : null;
        if (newId !== oldFirstTaskId) resolve(true);
        else if (Date.now() - start > timeoutMs) resolve(false);
        else requestAnimationFrame(check);
      };
      check();
    });
  }

  async function gotoPageByNumber_1based(page1) {
    const a = Array.from(document.querySelectorAll('.paginate_button a'))
      .find(el => el.textContent.trim() === String(page1));
    if (a) a.click();
  }

  async function crawlStoreVisitsViaButtons(silent = false) {
    const { page1: originalPage1 } = parseCurrentPageFromInfo();

    const all = [];
    const seen = new Set();
    let pageNum = originalPage1;

    while (true) {
      await lwYieldToMain();
      const rows = extractStoreVisitsFromIndexTable();
      for (const row of rows) {
        const id = String(row?.task_id || '').trim();
        if (id) {
          if (seen.has(id)) continue;
          seen.add(id);
        }
        all.push(row);
      }

      if (!silent) {
        showToast(`אוסף (Buttons): עמוד ${pageNum} • נאספו ${all.length}`, 'info', 1000);
        lwUpdatePaginationOverlay(`Pagination (Buttons): עמוד ${pageNum} • נאספו ${all.length}`);
      }

      const nextBtn = document.querySelector('#operator-store-visits-table_next');
      const isNextDisabled = nextBtn ? nextBtn.classList.contains('disabled') : true;
      if (!nextBtn || isNextDisabled) break;

      const firstRow = document.querySelector('#operator-store-visits-table tbody tr[data-task-id]');
      const oldId = firstRow ? firstRow.getAttribute('data-task-id') : null;
      const link = nextBtn.querySelector('a');
      if (!link) break;

      link.click();
      await yieldToMain();
      await waitForTableChange(oldId);
      pageNum++;
      await lwWait(100);
    }

    // החזרה לעמוד המקורי (לא רק לעמוד 1)
    if (pageNum !== originalPage1) {
      await gotoPageByNumber_1based(originalPage1);
    }

    return all;
  }

  async function crawlAllStoreVisitsPages(silent = false) {
    if (!silent) lwShowPaginationOverlay('Pagination: מאתחל איסוף מכל העמודים…');
    try {
      const dt = getStoreVisitsDataTable();
      if (dt) {
        try {
          return await crawlStoreVisitsViaDataTablesAPI(dt, silent);
        } catch (e) {
          if (!silent) console.warn('[LW Pagination] API failed, switching to Buttons fallback:', e);
        }
      }
      return await crawlStoreVisitsViaButtons(silent);
    } finally {
      if (!silent) lwHidePaginationOverlay();
    }
  }

  async function buildStoreVisitsRawRecords(silent = false) {
    const visitsAll = await crawlAllStoreVisitsPages(silent);
    const excluded = visitsAll.filter(lwShouldExcludeTaskByMeta);
    if (excluded.length) {
      let byRegionOnly = 0;
      let byDriverOnly = 0;
      let byBoth = 0;
      const sampleRegion = [];
      const sampleDriver = [];
      const sampleBoth = [];

      for (const v of excluded) {
        const region = String(v?.region ?? '').trim();
        const driver = String(v?.driver_name ?? v?.driverName ?? '').trim();

        const hitRegion = !!(LW_EXCLUDE_RULES?.regionEquals?.has(region));
        const hitDriver = !!(LW_EXCLUDE_RULES?.driverNameEquals?.has(driver));

        const tid = String(v?.task_id ?? '').trim();
        if (hitRegion && hitDriver) {
          byBoth++;
          if (tid && sampleBoth.length < 3) sampleBoth.push(tid);
        } else if (hitRegion) {
          byRegionOnly++;
          if (tid && sampleRegion.length < 3) sampleRegion.push(tid);
        } else if (hitDriver) {
          byDriverOnly++;
          if (tid && sampleDriver.length < 3) sampleDriver.push(tid);
        } else {
          byBoth++;
          if (tid && sampleBoth.length < 3) sampleBoth.push(tid);
        }
      }

    }
    const visits = visitsAll.filter((v) => !lwShouldExcludeTaskByMeta(v));
    return visits
      .filter(v => v.task_id)
      .map(v => ({
        task_id: v.task_id,
        wp_order_id: v.wp_order_id,
        city: v.city,
        address: v.address,
        customer_name: v.customer_name,
        region: v.region,
        status_text: v.status_text,
        pick_status_text: v.pick_status_text,
        pickup_date: parseDateDDMMYYYY(v.pickup_date_raw),
        driver_name: v.driver_name,
        source_page: v.source_page,
        extra_json: v.extra_json
      }));
    }
  
    async function syncStoreVisitsIndexToSupabase({
      alsoSyncTasks = true,
      forceTasks = false,
      mvRefreshForce = false,
    } = {}) {
      let didWork = false;
      let stats = null;
      let fail = 0;
      let skippedByCache = 0;
      const syncedTaskIds = [];

      try {
        await lwYieldToMain();
        lwResetSyncStats();

        const urlType = new URLSearchParams(window.location.search).get('type') || 'default';
        if (urlType === 'canceled') {
          showToast('מסנכרן הזמנות מבוטלות (type=canceled) — status_text=בוטל', 'info', 2000);
        } else if (urlType === 'completed') {
          showToast('מסנכרן הזמנות שבוצעו (type=completed) — status_text=בוצע', 'info', 2000);
        }

        showToast('מאתחל סריקת כל העמודים…', 'info', 1500);
        const rows = await buildStoreVisitsRawRecords(true);
        if (!rows.length) {
          showToast('לא נמצאו רשומות ב־store_visits לסנכרון', 'info');
          return;
        }

        await lwYieldToMain();
        showToast(`נאספו ${rows.length} ביקורים. מתחיל שליחה…`, 'info', 1500);

        const taskIdsAll = Array.from(
          new Set(rows.map((r) => String(r.task_id || '').trim()).filter(Boolean))
        );
        const IN_CHUNK = 80;

        // Fetch existing rows to compute new vs updated
        const { data: existingVisits } = await supabaseGetInChunks(
          SUPABASE_VISITS_TABLE,
          'task_id',
          'task_id',
          taskIdsAll,
          IN_CHUNK
        );
        const existingVisitIds = new Set(
          (existingVisits || []).map((r) => String(r.task_id || ''))
        );

        let newVisits = 0;
        let updatedVisits = 0;
        for (const r of rows) {
          const id = String(r.task_id || '');
          if (existingVisitIds.has(id)) updatedVisits++;
          else newVisits++;
        }

        // 1) Upsert store_visits_raw (batched)
        await upsertRowsBatched({
          label: 'store_visits_raw',
          rows,
          batchSize: 200,
          upsertFn: (batch) => supabaseUpsert(SUPABASE_VISITS_TABLE, batch, 'task_id'),
        });
        didWork = true;
        await lwYieldToMain();

        let newTasks = 0;
        let updatedTasks = 0;
        let totalNewItems = 0;
        let totalUpdatedItems = 0;
        let totalItems = 0;
        fail = 0;
        let existingOrderIds = new Set();
        let existingItemKeys = new Set();

        // Apply 1-hour cache only to FULL TASK sync (lwSupabaseSendTaskById).
        // Visits are still upserted every run.
        let taskIds = taskIdsAll;
        let cache = lwPruneTaskSyncCache(lwLoadTaskSyncCache());

        if (alsoSyncTasks && taskIdsAll.length) {
          const toRun = [];
          for (const tid of taskIdsAll) {
            if (!forceTasks && lwWasTaskSyncedRecently(tid, cache)) {
              skippedByCache++;
            } else {
              toRun.push(tid);
            }
          }
          taskIds = toRun;

          if (skippedByCache) {
            showToast(`דילוג על ${skippedByCache} משימות (סונכרנו בשעה האחרונה)`, 'info', 1800);
          }
        }

        if (alsoSyncTasks && taskIds.length) {
          const { data: existingOrders } = await supabaseGetInChunks(
            SUPABASE_TABLE,
            'order_id',
            'order_id',
            taskIds,
            IN_CHUNK
          );
          existingOrderIds = new Set(
            (existingOrders || []).map((r) => String(r.order_id || ''))
          );

          const { data: existingItems } = await supabaseGetInChunks(
            SUPABASE_ITEMS_TABLE,
            'order_id,line_no',
            'order_id',
            taskIds,
            IN_CHUNK
          );
          for (const r of existingItems || []) {
            existingItemKeys.add(`${r.order_id}|${r.line_no}`);
          }

          const statusByTaskId = new Map(
            rows.map((r) => [String(r.task_id || '').trim(), lwFirstLine(r.pick_status_text || r.status_text)])
          );
          const pickStatusByTaskId = new Map(
            rows.map((r) => [String(r.task_id || '').trim(), r.pick_status_text])
          );
          const limit = createLimiter(ORDERS_SYNC_CONFIG.UPSERT_CONCURRENCY);
          // כדי לא להציף את Lionwheel בבקשות, נעבוד בבאצ'ים קטנים יותר ונוסיף השהייה קצרה בין באצ'ים.
          const TASK_BATCH_SIZE = 8; // היה 15
          const results = [];

          for (let i = 0; i < taskIds.length; i += TASK_BATCH_SIZE) {
            const chunk = taskIds.slice(i, i + TASK_BATCH_SIZE);
            // השהייה קטנה בין כל באצ' – מפחית סיכוי ל-HTTP 429 מ-Lionwheel
            if (i > 0) {
              await lwWait(250);
            }

            const chunkResults = await Promise.allSettled(
              chunk.map((taskId) => {
                syncedTaskIds.push(String(taskId));
                return limit(() =>
                  lwSupabaseSendTaskById(taskId, {
                    silent: true,
                    existingItemKeys,
                    statusFromVisit: statusByTaskId.get(String(taskId)) ?? null,
                    pickStatusFromVisit: pickStatusByTaskId.get(String(taskId)) ?? null,
                  })
                );
              })
            );
            results.push(...chunkResults);
            if (i + TASK_BATCH_SIZE < taskIds.length) await lwYieldToMain();
          }

          results.forEach((r, i) => {
            const tid = taskIds[i];
            if (r.status === 'fulfilled') {
              const v = r.value;
              if (existingOrderIds.has(String(tid))) updatedTasks++;
              else newTasks++;
              totalNewItems += v.newItems ?? 0;
              totalUpdatedItems += v.updatedItems ?? 0;
              totalItems += v.itemCount ?? 0;

              // mark cache only on successful sync
              lwMarkTaskSynced(String(tid), cache);
            } else {
              fail++;
              logDebug('task sync failed:', tid, r.reason);
            }
          });

          // persist cache updates
          lwSaveTaskSyncCache(cache);
        }

        stats = {
          visits: { new: newVisits, updated: updatedVisits, total: rows.length },
          tasks: { new: newTasks, updated: updatedTasks, total: newTasks + updatedTasks, fail },
          items: { new: totalNewItems, updated: totalUpdatedItems, total: totalItems },
        };

        const lines = [
          '[Supabase Sync] —— סטטיסטיקת סנכרון "שלח ביקורים ל־Supabase" ——',
          'ביקורים (store_visits):   חדשים ' +
            stats.visits.new +
            ' | עודכנו ' +
            stats.visits.updated +
            ' | סה"כ נשלחו ' +
            stats.visits.total,
        ];
        if (alsoSyncTasks) {
          lines.push(
            'משימות (הזמנות):        חדשות ' +
              stats.tasks.new +
              ' | עודכנו ' +
              stats.tasks.updated +
              ' | סה"כ ' +
              stats.tasks.total +
              (fail ? ' | נכשלו ' + fail : '')
          );
          lines.push(
            'פריטים (order_items):   חדשים ' +
              stats.items.new +
              ' | עודכנו ' +
              stats.items.updated +
              ' | סה"כ upsert ' +
              stats.items.total
          );
          lines.push(
            '—— סיכום: ' +
              stats.visits.total +
              ' ביקורים, ' +
              stats.tasks.total +
              ' משימות, ' +
              stats.items.total +
              ' פריטים נשלחו. חדש: ' +
              stats.visits.new +
              '+' +
              stats.tasks.new +
              '+' +
              stats.items.new +
              ' | עודכן: ' +
              stats.visits.updated +
              '+' +
              stats.tasks.updated +
              '+' +
              stats.items.updated +
              (fail ? ' | נכשלו: ' + fail : '') +
              ' ——'
          );
        } else {
          lines.push(
            '—— סיכום: ' +
              stats.visits.total +
              ' ביקורים נשלחו (חדש ' +
              stats.visits.new +
              ', עודכן ' +
              stats.visits.updated +
              ') ——'
          );
        }

        const msg = alsoSyncTasks
          ? `סונכרנו ${rows.length} ביקורים + ${stats.tasks.total} משימות (נכשלו ${fail})` +
            `${skippedByCache ? ` | דולגו ${skippedByCache}` : ''}` +
            `${forceTasks ? ' [FORCE]' : ''}`
          : `סונכרנו ${rows.length} ביקורים`;

        try {
          localStorage.setItem('lw_store_visits_last_sync_ts', String(Date.now()));
        } catch (_) {}

        showToast(msg, fail ? 'warning' : 'success');
      } catch (err) {
        console.error('[Supabase Sync] error syncing store_visits:', err);
        showToast('שגיאה בסנכרון store_visits – ראה console', 'error');
      } finally {
        // match_forecast_predictions: שידוך תחזיות עם הזמנות (לעדכון fulfilled/missed)
        if (didWork) {
          try {
            if (syncedTaskIds.length > 0) {
              await supaRestFetch('/rest/v1/rpc/match_forecast_predictions_batch', {
                method: 'POST',
                body: { p_task_ids: syncedTaskIds },
              });
            } else {
              const mfp = await supaRestFetch('/rest/v1/rpc/match_forecast_predictions', {
                method: 'POST',
                body: {},
              });
              const row = Array.isArray(mfp) && mfp[0] ? mfp[0] : null;
              if (row && (row.matched || row.fulfilled || row.missed)) {
                logDebug('[Supabase Sync] match_forecast_predictions:', row);
              }
            }
            scheduleForecastRefetch('after_sync_match');
          } catch (e) {
            if (LW_ORDERS_CONFIG.DEBUG) {
              console.warn('[Supabase Sync] match_forecast_predictions failed:', e);
            }
          }
        }

        // Legacy MV refresh (refresh_mv_forecast_active_enriched):
        // gated by LW_ORDERS_CONFIG.ENABLE_LEGACY_MV_REFRESH
        if (LW_ORDERS_CONFIG.ENABLE_LEGACY_MV_REFRESH && (didWork || mvRefreshForce)) {
          try {
            await maybeRefreshMV({
              reason: mvRefreshForce
                ? 'manual_force'
                : `post_sync (tasks=${stats?.tasks?.total ?? 0}, fail=${fail}, skippedByCache=${skippedByCache}, force=${forceTasks})`,
              force: !!mvRefreshForce,
              toast: true,
            });
          } catch (e) {
            console.warn('[MV Refresh] unexpected error:', e);
          }
        }
      }
    }
  
    /************************************************************
     *  Public API (exposed to window)
     ************************************************************/
    async function lwSupabaseDemo() {
      try {
        const demoRow = {
          order_id: 'DEMO_' + Date.now(),
          order_date: new Date().toISOString().slice(0, 10),
          order_datetime: new Date().toISOString(),
          customer_phone: '0500000000',
          customer_name: 'Demo Customer',
          customer_number: null,
        };

        await supabaseUpsertOrderRow(demoRow);
  
        alert('שורת DEMO נשמרה ב-Supabase (lionwheel_export_tasks_raw)');
      } catch (err) {
        console.error('[Supabase Sync] demo error:', err);
        alert('Demo Supabase נכשל – ראה console');
      }
    }
  
    async function lwSupabaseSendCurrentTask() {
      try {
        const data = extractOrderWithCache(document, location.pathname);
        const orderRow = buildOrdersRawRecordFromTask(data);
        const itemRows = await buildOrderItemsRawRecordsFromTask(data);
  
        logDebug('sending orderRow via REST:', orderRow.order_id);
        await supabaseUpsertOrderRow(orderRow);
        if (itemRows && itemRows.length) {
          logDebug('sending itemsRows via REST:', itemRows.length);
          await supabaseUpsertOrderItemsRows(itemRows);
        }
        showToast('המשלוח נשמר ב-Supabase בהצלחה (lionwheel_export_tasks_raw + lionwheel_export_task_items_raw)', 'success');
      } catch (err) {
        console.error(ORDERS_SYNC_CONFIG.LOG_PREFIX, 'error saving current task:', err);
        showToast('שגיאה בשמירה ל-Supabase – ראה console', 'error');
      }
    }

    // Backward-compat: older call sites used supabaseUpsertItemRows()
    const supabaseUpsertItemRows = supabaseUpsertOrderItemsRows;

    async function fetchTaskDocument(taskId) {
      const url = `/tasks/${encodeURIComponent(taskId)}`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error(`Failed to fetch task page ${taskId}: HTTP ${res.status}`);
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      return { doc, path: `/tasks/${taskId}` };
    }

    async function lwSupabaseSendTaskById(taskId, { silent = false, existingItemKeys = null, statusFromVisit = null, pickStatusFromVisit = null } = {}) {
      let data = loadTaskCache(taskId);
      if (!data) {
        const { doc, path } = await fetchTaskDocument(taskId);
        data = extractOrderFromTaskPage(doc, path);
        saveTaskCache(taskId, data);
      }
      const orderRow = buildOrdersRawRecordFromTask(data);
      if (statusFromVisit != null && statusFromVisit !== '') {
        orderRow.status_text = statusFromVisit;
      }
      const itemRows = await buildOrderItemsRawRecordsFromTask(data);
      let newItems = 0;
      let updatedItems = 0;
      if (existingItemKeys && typeof existingItemKeys.has === 'function') {
        for (const row of itemRows) {
          const k = `${row.order_id}|${row.line_no}`;
          if (existingItemKeys.has(k)) updatedItems++;
          else newItems++;
        }
      }
      await supabaseUpsertOrderRow(orderRow);
      await supabaseUpsertOrderItemsRows(itemRows);
      if (!silent) {
        showToast(`Task ${taskId}: נשמר ל־Supabase (${itemRows.length} פריטים)`, 'success');
      }
      return {
        itemCount: itemRows.length,
        newItems,
        updatedItems,
      };
    }

    function isStoreVisitsPage() {
      // דף ביקורים, למשל /operator/store_visits
      return /\/operator\/store_visits/.test(window.location.pathname);
    }
  
    function injectSupabaseButtonIntoStoreVisits() {
      try {
        if (document.querySelector('.lw-forecast-split-btn')) return;
  
        const table = document.querySelector('#operator-store-visits-table');
        if (!table) {
          console.warn('[Supabase Sync] store_visits table not found');
          return;
        }
  
        let buttonContainer = document.querySelector('#extract-missing-button')?.parentElement
          || document.querySelector('.order-items-summary-btn')?.parentElement
          || document.querySelector('#store-visits-excel')?.parentElement
          || document.querySelector('.d-flex.flex-wrap.align-items-center');
  
        if (!buttonContainer) {
          const header = table.closest('.container, .row')?.querySelector('h1, h2, .page-header, .btn-group');
          buttonContainer = header?.parentElement || document.querySelector('.btn-toolbar, .actions, .toolbar');
        }
        if (!buttonContainer) {
          buttonContainer = document.createElement('div');
          buttonContainer.className = 'mb-3';
          table.parentElement.insertBefore(buttonContainer, table);
        }
  
        const wrap = document.createElement('div');
        wrap.className = 'lw-forecast-split-btn btn-group btn-group-sm m-0 mx-1 mx-md-0 m-md-1';
        wrap.setAttribute('role', 'group');
  
        const mainBtn = document.createElement('button');
        mainBtn.type = 'button';
        mainBtn.className = 'btn lw-forecast-split-main';
        mainBtn.textContent = 'תחזית';
        mainBtn.title = 'פתח תחזית הזמנות';
  
        const syncBtn = document.createElement('button');
        syncBtn.type = 'button';
        syncBtn.className = 'btn lw-forecast-split-sync';
        syncBtn.innerHTML = `<svg class="lw-forecast-sync-svg" xmlns="http://www.w3.org/2000/svg" viewBox="-0.135 0 122.88 122.88" aria-hidden="true" focusable="false"><path fill="currentColor" d="M111.9,61.57a5.36,5.36,0,0,1,10.71,0A61.3,61.3,0,0,1,17.54,104.48v12.35a5.36,5.36,0,0,1-10.72,0V89.31A5.36,5.36,0,0,1,12.18,84H40a5.36,5.36,0,1,1,0,10.71H23a50.6,50.6,0,0,0,88.87-33.1ZM106.6,5.36a5.36,5.36,0,1,1,10.71,0V33.14A5.36,5.36,0,0,1,112,38.49H84.44a5.36,5.36,0,1,1,0-10.71H99A50.6,50.6,0,0,0,10.71,61.57,5.36,5.36,0,1,1,0,61.57,61.31,61.31,0,0,1,91.07,8,61.83,61.83,0,0,1,106.6,20.27V5.36Z"/></svg>`;
        syncBtn.title = 'סנכרן ביקורים ל-Supabase. לבוטלות: ?type=canceled | לבוצע: ?type=completed';
  
        mainBtn.addEventListener('click', async () => {
          try {
            await openForecastUI({ deferShow: true });
          } catch (err) {
            console.error('[Supabase Sync] error opening forecast UI:', err);
            alert('שגיאה בפתיחת תחזית – ראה console');
          }
        });
  
        syncBtn.addEventListener('click', (e) => {
          if (syncBtn.classList.contains('lw-syncing')) return;
          syncBtn.classList.add('lw-syncing');
          syncBtn.disabled = true;
          const forceTasks = !!e.shiftKey;
          if (forceTasks) {
            console.log('[Supabase Sync] FORCE TASK SYNC: Shift+Click detected');
            showToast('Force Sync: מסנכרן משימות גם אם סונכרנו בשעה האחרונה', 'warning', 2500);
          }
          const doSync = async () => {
            try {
              await syncStoreVisitsIndexToSupabase({ alsoSyncTasks: true, forceTasks, mvRefreshForce: true });
            } catch (err) {
              console.error('[Supabase Sync] error in sync button:', err);
              showToast('error', 'Supabase Sync נכשל', 'שגיאה בשמירת ביקורים (ראה console)');
            } finally {
              scheduleForecastRefetch('mv_refresh_click_finally');
              syncBtn.classList.remove('lw-syncing');
              syncBtn.disabled = false;
            }
          };
          if (typeof queueMicrotask === 'function') {
            queueMicrotask(() => doSync().catch(() => {}));
          } else if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(() => doSync().catch(() => {}), { timeout: 0 });
          } else {
            setTimeout(doSync, 0);
          }
        });
  
        wrap.appendChild(syncBtn);
        wrap.appendChild(mainBtn);
        buttonContainer.appendChild(wrap);
        console.log('[Supabase Sync] Forecast split button injected');
      } catch (e) {
        console.error('[Supabase Sync] failed to inject Forecast button:', e);
      }
    }

    let __lwToastStyleInjected = false;

    function ensureToastStyles() {
      if (__lwToastStyleInjected) return;
      __lwToastStyleInjected = true;

      const style = document.createElement('style');
      style.textContent = `
        .lw-toast {
          position: fixed;
          z-index: 999999;
          left: 16px;
          bottom: 16px;
          background: rgba(20,20,20,0.92);
          color: #fff;
          padding: 10px 12px;
          border-radius: 10px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.25);
          font-size: 13px;
          max-width: 420px;
          line-height: 1.35;
          direction: rtl;
          opacity: 0;
          transform: translateY(8px);
          transition: opacity 160ms ease, transform 160ms ease;
          pointer-events: none;
        }
        .lw-toast.lw-toast--show { opacity: 1; transform: translateY(0); }
        .lw-toast.lw-toast--success { background: rgba(16,120,60,0.92); }
        .lw-toast.lw-toast--warning { background: rgba(160,120,20,0.92); }
        .lw-toast.lw-toast--error   { background: rgba(150,40,40,0.92); }
        .lw-toast.lw-toast--info    { background: rgba(20,80,160,0.92); }
      `;
      document.head.appendChild(style);
    }

    function showToast(text, type = 'info', ms = 2800) {
      ensureToastStyles();

      const el = document.createElement('div');
      el.className = `lw-toast lw-toast--${type}`;
      el.textContent = String(text || '');

      document.body.appendChild(el);
      requestAnimationFrame(() => el.classList.add('lw-toast--show'));

      window.setTimeout(() => {
        el.classList.remove('lw-toast--show');
        window.setTimeout(() => el.remove(), 220);
      }, ms);
    }

    /**
     * ממתין עד שטבלת הביקורים תיטען ותכיל נתונים.
     * משתמש ב-MutationObserver במקום polling – מפחית Violations מ-setTimeout/requestIdleCallback.
     */
    function waitForStoreVisitsRows(maxWaitMs = 30000) {
      return new Promise((resolve) => {
        const table = document.querySelector('#operator-store-visits-table');
        if (!table) return resolve(false);

        const check = () => {
          const rows = table.querySelectorAll('tbody tr[data-task-id]');
          if (rows.length > 0) {
            console.log(`[Supabase Sync] ✅ הטבלה נטענה עם ${rows.length} שורות.`);
            resolve(true);
            return true;
          }
          return false;
        };

        if (check()) return;

        let timeoutId, resolved = false;
        const done = (ok) => {
          if (resolved) return;
          resolved = true;
          if (timeoutId) clearTimeout(timeoutId);
          obs?.disconnect();
          if (!ok) console.warn('[Supabase Sync] ⚠️ פסק זמן (Timeout) בהמתנה לטעינת הטבלה.');
          resolve(ok);
        };

        const obs = new MutationObserver(() => { if (check()) done(true); });
        obs.observe(table, { childList: true, subtree: true });

        timeoutId = setTimeout(() => done(check()), maxWaitMs);
      });
    }

    const LS_KEY_LAST_SYNC_TS = 'lw_store_visits_last_sync_ts';

    function shouldRunAutoSync() {
      const last = localStorage.getItem(LS_KEY_LAST_SYNC_TS);
      if (!last) return true;
      const elapsed = Date.now() - Number(last);
      return elapsed >= (ORDERS_SYNC_CONFIG.AUTOSYNC_INTERVAL_MS || 4 * 60 * 60 * 1000);
    }

    async function runStoreVisitsAutoSyncIfNeeded() {
      try {
        if (!shouldRunAutoSync()) return;

        if (!document.querySelector('#operator-store-visits-table')) return;

        console.log('[Supabase Sync] ⏳ סנכרון אוטומטי – ממתין לטעינת הנתונים בטבלה...');

        const isReady = await waitForStoreVisitsRows();

        if (!isReady) {
          console.log('[Supabase Sync] ❌ הטבלה עדיין ריקה. מדלג על אוטו-סנכרון.');
          return;
        }

        syncStoreVisitsIndexToSupabase({ alsoSyncTasks: true })
          .catch((e) => {
            console.error('[Supabase Sync] auto sync failed:', e);
            showToast('Auto-sync נכשל – ראה console', 'error');
          });
      } catch (e) {
        console.warn('[Supabase Sync] runStoreVisitsAutoSyncIfNeeded failed:', e);
      }
    }

    let _autosyncIntervalId = null;

    function schedulePeriodicAutoSync() {
      if (_autosyncIntervalId) return;
      const INTERVAL_CHECK_MS = 30 * 60 * 1000; // בודק כל 30 דקות
      _autosyncIntervalId = setInterval(() => {
        if (!isStoreVisitsPage()) return;
        if (!shouldRunAutoSync()) return;
        runStoreVisitsAutoSyncIfNeeded();
      }, INTERVAL_CHECK_MS);
    }

    async function warmCatalogCacheInBackground() {
      try {
        const doWarm = async () => {
          try {
            const now = Date.now();
            if (CATALOG_WARM_IN_PROGRESS) return;
            if (CATALOG_WARM_LAST_RUN && (now - CATALOG_WARM_LAST_RUN) < CATALOG_WARM_MIN_INTERVAL_MS) {
              return;
            }
            CATALOG_WARM_IN_PROGRESS = true;
            await ensureCatalogVersionFresh();
            // If cache already populated, skip
            if (CATALOG_BY_SKU.size > 0) {
              console.log('[Forecast] Catalog cache warm: already populated');
              CATALOG_WARM_IN_PROGRESS = false;
              CATALOG_WARM_LAST_RUN = now;
              return;
            }
            // Use the current forecast view to get SKU list quickly (no filters)
            const url = `/rest/v1/${FORECAST_VIEW}?select=sku&limit=5000`;
            const rows = await supaRestFetch(url, { method: 'GET' });
            const skuList = Array.isArray(rows) ? rows.map(r => r?.sku).filter(Boolean) : [];
            if (!skuList.length) {
              CATALOG_WARM_IN_PROGRESS = false;
              CATALOG_WARM_LAST_RUN = now;
              return;
            }
            console.log(`[Forecast] Warming catalog cache for ${skuList.length} SKUs...`);
            await loadCatalogForSkus(skuList);
            CATALOG_WARM_IN_PROGRESS = false;
            CATALOG_WARM_LAST_RUN = now;
          } catch (e) {
            CATALOG_WARM_IN_PROGRESS = false;
            console.warn('[Forecast] warmCatalogCacheInBackground failed:', e);
          }
        };
        if (typeof requestIdleCallback === 'function') {
          requestIdleCallback(doWarm, { timeout: 1500 });
        } else {
          setTimeout(doWarm, 1500);
        }
      } catch (e) {
        console.warn('[Forecast] warmCatalogCacheInBackground outer failed:', e);
      }
    }

    function initSupabaseOrdersSync() {
      // Inject styles once
      injectForecastStyles();
  
      const run = () => {
        try {
          if (isStoreVisitsPage() && LW_ORDERS_CONFIG.ENABLE_STORE_VISITS) {
            injectSupabaseButtonIntoStoreVisits();
            runStoreVisitsAutoSyncIfNeeded();
            schedulePeriodicAutoSync();
          }
          warmCatalogCacheInBackground();
        } catch (e) {
          console.error('[Supabase Sync] initSupabaseOrdersSync failed:', e);
        }
      };
  
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run);
      } else {
        run();
      }
  
      // גם לנסות אחרי טעינה מאוחרת (אם הטבלה נטענת דרך AJAX) – requestIdleCallback מונע "setTimeout handler" Violations
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(run, { timeout: 2000 });
      } else {
        setTimeout(run, 2000);
      }
    }
  
    /************************************************************
     *  Forecast Styles Injection
     ************************************************************/
    function injectForecastStyles() {
      const css = `
        /* Modal Overlay & Container */
        .tmc-modal-overlay {
          position: fixed; inset: 0; z-index: 99999;
          background: rgba(0,0,0,0.4); backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center;
          font-family: "Noto Sans Hebrew", Poppins, Helvetica, sans-serif;
          direction: rtl; /* RTL GLOBAL */
        }
        .tmc-card {
          width: min(900px, 94vw); height: min(85vh, 900px);
          background: #f8f9fa; border-radius: 12px;
          box-shadow: 0 20px 40px rgba(0,0,0,0.2);
          display: flex; flex-direction: column; overflow: hidden;
        }
  
        /* Header - FIXED ALIGNMENT & Z-INDEX */
        .tmc-header {
          background: #fff; padding: 16px 20px; border-bottom: 1px solid #e0e0e0;
          display: flex; gap: 24px; /* Space between Title and Controls */
          align-items: center; 
          justify-content: flex-start; /* Align everything to the Right (RTL) */
          flex-wrap: wrap; 
          z-index: 100; /* Higher than table header */
          position: relative;
        }
        .tmc-close-top-left {
          position: absolute !important;
          left: 16px !important;
          top: 16px !important;
          background: #fff !important;
          border: 1px solid #ddd !important;
          border-radius: 4px !important;
          padding: 4px 10px !important;
          font-size: 18px !important;
          cursor: pointer !important;
          color: #666 !important;
          font-weight: bold !important;
          line-height: 1 !important;
          z-index: 10001 !important; /* Highest */
          transition: all 0.2s;
        }
        .tmc-close-top-left:hover {
          color: #d9534f !important;
          background: #f5f5f5 !important;
          border-color: #ccc !important;
        }
        .tmc-title { 
          font-weight: 700; 
          font-size: 20px; 
          color: #2c3e50; 
          display: flex;
          align-items: center;
          gap: 12px;
          flex-shrink: 0;
        }
        .tmc-controls { 
          display: flex; 
          gap: 12px; 
          align-items: center; 
          flex-wrap: wrap;
          /* Removed justify-content: flex-end to keep it near title */
        }


        /* Supplier filter */
        .tmc-supplier-filter { position: relative; }
        .tmc-select {
          height: 32px;
          border-radius: 6px;
          border: 1px solid #e0e0e0;
          background: #fff;
          padding: 0 10px;
          font-size: 13px;
          outline: none;
          cursor: pointer;
          max-width: 220px;
          box-sizing: border-box;
        }
        .tmc-select:focus { border-color: #b9d7ff; box-shadow: 0 0 0 3px rgba(0,123,255,0.12); }

        /* Date range control */
        .tmc-date-range {
          position: relative;
          font-size: 14px;
        }
        .tmc-date-trigger {
          display: inline-flex;
          align-items: center;
          justify-content: flex-start; /* Align text to Right (RTL start) */
          gap: 6px;
          padding: 6px 12px;
          border-radius: 6px;
          border: 1px solid #dce0e4;
          background: #fff;
          cursor: pointer;
          white-space: nowrap;
          font-weight: 500;
          color: #333;
          transition: all 0.2s ease;
          min-width: 130px;
          height: 32px;
          box-sizing: border-box;
        }
        .tmc-date-trigger:hover {
          border-color: #b0b8c1;
          background: #f8f9fa;
        }
        
        /* Export Button */
        .tmc-btn-export {
          display: inline-flex; align-items: center; justify-content: center;
          width: 34px; height: 34px;
          border-radius: 6px; border: 1px solid #dce0e4;
          background: #fff; color: #1976d2; cursor: pointer;
          transition: all 0.2s; font-size: 14px;
        }
        .tmc-btn-export:hover { background: #f0f7ff; border-color: #1976d2; }
        
        /* Menu styles - FIXED Z-INDEX */
        .tmc-date-menu {
          position: absolute;
          top: 115%;
          right: 0 !important;
          left: auto !important;
          direction: rtl !important;
          text-align: right !important;
          font-family: "Noto Sans Hebrew", Poppins, Helvetica, sans-serif !important;
          border-radius: 8px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.15);
          padding: 8px 0;
          z-index: 10000 !important; /* Float above table headers */
          background: white !important;
          border: 1px solid #eee;
          min-width: 180px;
        }
        .tmc-date-menu:not([hidden]) {
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
        }
        .tmc-date-menu .ranges ul {
          list-style: none;
          margin: 0;
          padding: 0;
          max-height: 280px;
          overflow: auto;
        }
        .tmc-date-menu .ranges li {
          padding: 6px 12px;
          font-size: 13px;
          cursor: pointer;
        }
        .tmc-date-menu .ranges li:hover {
          background-color: #f0f7ff;
        }
        .tmc-date-menu .ranges li label {
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
          width: 100%;
          margin: 0;
          padding: 2px 0;
          color: #444;
        }
        .tmc-date-menu .ranges li input[type="checkbox"] {
          accent-color: #1976d2;
          width: 16px;
          height: 16px;
        }
        .tmc-date-menu .ranges li input[type="checkbox"]:checked + span {
          font-weight: 600;
          color: #1967d2;
        }
        
        .tmc-date-custom {
          border-top: 1px solid #eee;
          padding: 10px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .tmc-date-custom div { display: flex; align-items: center; gap: 8px; }
        .tmc-date-custom input[type="date"] {
          font-size: 12px;
          padding: 4px;
          border: 1px solid #ddd;
          border-radius: 4px;
          width: 100%;
        }
        .tmc-btn.tmc-date-apply {
          background: #1976d2; color: white; border: none;
          padding: 6px; border-radius: 4px; font-weight: 600;
          text-align: center; width: 100%; margin-top: 4px;
        }

        /* Body */
        .tmc-body { padding: 20px; overflow-y: auto; scroll-behavior: smooth; display: flex; flex-direction: column; gap: 8px; background: #f4f6f8; flex: 1; }
  
        /* Loader */
        .tmc-loader{
          font-size:13px;
          font-weight:600;
          padding: 4px 12px;
          border: 1px solid #e6e6e6;
          background: #fff;
          border-radius: 6px;
          color: #555;
          margin-inline-start: 10px;
        }
  
        /* --- Forecast table search (client-side filter) --- */
        .tmc-forecast-search-wrap {
          width: 100%;
          margin-bottom: 12px;
          flex-shrink: 0;
        }
        .tmc-forecast-search {
          width: 100%;
          box-sizing: border-box;
          padding: 10px 14px;
          font-size: 14px;
          font-family: inherit;
          border: 1px solid #eaecf0;
          border-radius: 8px;
          background: #fff;
          color: #101828;
          direction: rtl;
        }
        .tmc-forecast-search::placeholder {
          color: #98a2b3;
        }
        .tmc-forecast-search:focus {
          outline: none;
          border-color: #1976d2;
          box-shadow: 0 0 0 3px rgba(25,118,210,0.15);
        }

        /* --- Table View Styles (Facelift) --- */
        .tmc-table-container {
          width: 100%;
          max-height: calc(100vh - 220px);
          overflow: auto;
          background: #fff;
          border-radius: 10px;
          border: 1px solid #eaecf0;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }
        .tmc-table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          font-size: 14px;
        }
        .tmc-table th {
          text-align: right;
          padding: 14px 16px;
          background: #f8f9fb;
          color: #475467;
          font-weight: 600;
          font-size: 13px;
          border-bottom: 1px solid #eaecf0;
          white-space: nowrap;
          position: sticky;
          top: 0;
          z-index: 10;
          box-shadow: 0 1px 0 0 #eaecf0;
        }
        .tmc-table td {
          padding: 12px 16px;
          border-bottom: 1px solid #eaecf0;
          vertical-align: middle;
          color: #101828;
        }
        .tmc-why-btn {
          border: 1px solid #d0d5dd;
          background: #fff;
          color: #344054;
          border-radius: 6px;
          padding: 4px 8px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
        }
        .tmc-why-btn:hover {
          background: #f8f9fb;
          border-color: #b9d7ff;
          color: #1d4ed8;
        }
        .tmc-table tr:last-child td {
          border-bottom: none;
        }
        
        /* Striped Rows & Hover */
        .tmc-table tr:hover {
          background-color: #f0f7ff !important;
          cursor: pointer;
        }
        .tmc-table tbody tr:nth-child(even) {
          background-color: #fafafa;
        }

        /* --- Priority bars (Forecast) --- */
        .tmc-priority-bars {
          display: inline-flex;
          /* RTL: הבר הקטן מימין, הגבוה משמאל */
          direction: rtl;
          flex-direction: row;
          align-items: flex-end;
          gap: 2px;
          height: 18px;
          min-width: 34px;
        }
        .tmc-priority-bars .bar { width: 6px; border-radius: 2px; background: #d0d5dd; opacity: 0.85; }
        .tmc-priority-bars .bar.h1 { height: 6px; }
        .tmc-priority-bars .bar.h2 { height: 10px; }
        .tmc-priority-bars .bar.h3 { height: 14px; }
        .tmc-priority-bars .bar.h4 { height: 18px; }
        .tmc-priority-bars[data-level="1"] .bar.active { background: #f04438; }
        .tmc-priority-bars[data-level="2"] .bar.active { background: #f79009; }
        .tmc-priority-bars[data-level="3"] .bar.active { background: #fdb022; }
        .tmc-priority-bars[data-level="4"] .bar.active { background: #12b76a; }
        .tmc-priority-bars[data-level="0"] .bar.active { background: #d0d5dd; opacity: 0.25; }
        /* THUMB INCREASED */
        .tmc-tbl-thumb {
          width: 48px;
          height: 48px;
          border-radius: 6px;
          object-fit: cover;
          border: 1px solid #eaecf0;
          background: #fff;
        }
        .tmc-tbl-placeholder {
          width: 48px; height: 48px; border-radius: 6px; background: #f2f4f7;
          display: flex; align-items: center; justify-content: center;
          font-size: 16px; color: #98a2b3; font-weight: bold;
        }

        /* --- Table Sorting --- */
        .tmc-table th.sortable {
          cursor: pointer;
          user-select: none;
          transition: background 0.2s;
        }
        .tmc-prio-high { color: #cc0000 !important; }
        .tmc-prio-mid { color: #e4a70d !important; }
        .tmc-prio-low { color: #667085 !important; }
        .tmc-when-urgent { color: #b42318 !important; font-weight: 600; }
        .tmc-when-soon { color: #ff6d02 !important; font-weight: 500; }
        .tmc-when-ontime { color: #667085 !important; }
        .tmc-when-muted { color: #667085 !important; }
        .tmc-table th.sortable:hover {
          background-color: #eaecf0;
          color: #101828;
        }
        .tmc-sort-icon {
          margin-right: 0;
          margin-inline-end: 4px;
          color: #1976d2;
          font-size: 12px;
        }
        .tmc-consumption-cell {
          font-size: 12px;
          color: #344054;
          white-space: nowrap;
        }
        .tmc-consumption-cell .tmc-cons-line {
          display: block;
          line-height: 1.25;
        }

        /* --- Forecast Split Button (toolbar) - RTL: תחזית שמאל, sync ימין. 90%-10% ratio --- */
        @keyframes lw-forecast-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .lw-forecast-split-btn.btn-group {
          font-family: "Noto Sans Hebrew", Poppins, Helvetica, sans-serif;
          display: inline-flex;
          flex-wrap: nowrap;
          flex-shrink: 0;
          max-width: 85px;
        }
        .lw-forecast-split-btn.btn-group .btn {
          border: none !important;
          border-radius: 0;
          font-size: 12px;
          font-weight: 400;
          padding: 7px 10px;
          height: 32px;
          box-sizing: border-box;
          transition: color 0.15s ease, background-color 0.15s ease;
        }
        .lw-forecast-split-btn.btn-group .btn:first-child { border-radius: 0 5.5px 5.5px 0; }
        .lw-forecast-split-btn.btn-group .btn:last-child { border-radius: 5.5px 0 0 5.5px; border-right: 1px solid rgba(137, 80, 252, 0.35) !important; }
        .lw-forecast-split-main { flex: 9 1 auto; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .lw-forecast-split-sync { flex: 0 0 auto; min-width: 28px; padding: 7px 6px !important; display: inline-flex; align-items: center; justify-content: center; }
        .lw-forecast-split-sync .lw-forecast-sync-svg {
          width: 12px; height: 12px; color: inherit;
          transform-origin: 50% 50%; transform-box: fill-box;
        }
        .lw-forecast-split-sync.lw-syncing .lw-forecast-sync-svg { animation: lw-forecast-spin 0.8s linear infinite; }
        .lw-forecast-split-main, .lw-forecast-split-sync {
          background: #e4d6ff !important;
          color: #8950fc !important;
        }
        .lw-forecast-split-main:hover, .lw-forecast-split-sync:hover:not(:disabled) {
          background: #8950fc !important;
          color: #fff !important;
        }
        .lw-forecast-split-btn.btn-group:hover .btn:last-child { border-right-color: rgba(255,255,255,0.5) !important; }
        .lw-forecast-split-main:active, .lw-forecast-split-sync:active:not(:disabled) {
          background: #7a48e0 !important;
          color: #fff !important;
        }
        .lw-forecast-split-sync:disabled, .lw-forecast-split-sync.lw-syncing {
          opacity: 0.6 !important;
          cursor: not-allowed !important;
          background: #d4c4ed !important;
          color: #8a7a9a !important;
        }
        
        /* --- Drilldown Dots (Fixed Colors & Visibility) --- */
        .tmc-drill-header { display: flex; align-items: center; gap: 15px; padding-bottom: 15px; border-bottom: 1px solid #eee; margin-bottom: 15px; }
        
        /* Base Pulse Dot */
        .tmc-status-dot-pulse {
          display: inline-block; /* MUST be inline-block to have size */
          width: 10px;
          height: 10px;
          border-radius: 50%;
          margin-inline-end: 8px;
          vertical-align: middle;
        }
        
        /* Specific Colors */
        .tmc-dot-red    { background-color: #FF605C; box-shadow: 0 0 0 rgba(255, 96, 92, 0.4);   animation: pulse-red 2s infinite; }
        .tmc-dot-yellow { background-color: #FFBD44; box-shadow: 0 0 0 rgba(255, 189, 68, 0.4);  animation: pulse-yellow 2s infinite; }
        .tmc-dot-green  { background-color: #00CA4E; box-shadow: 0 0 0 rgba(0, 202, 78, 0.4);    animation: pulse-green 2s infinite; }

        @keyframes pulse-red    { 0% { box-shadow: 0 0 0 0 rgba(255, 96, 92, 0.4); } 70% { box-shadow: 0 0 0 6px rgba(255, 96, 92, 0); } 100% { box-shadow: 0 0 0 0 rgba(255, 96, 92, 0); } }
        @keyframes pulse-yellow { 0% { box-shadow: 0 0 0 0 rgba(255, 189, 68, 0.4); } 70% { box-shadow: 0 0 0 6px rgba(255, 189, 68, 0); } 100% { box-shadow: 0 0 0 0 rgba(255, 189, 68, 0); } }
        @keyframes pulse-green  { 0% { box-shadow: 0 0 0 0 rgba(0, 202, 78, 0.4); }  70% { box-shadow: 0 0 0 6px rgba(0, 202, 78, 0); }  100% { box-shadow: 0 0 0 0 rgba(0, 202, 78, 0); } }
        
        /* Drilldown Row Backgrounds */
        .tmc-row-due     { background: rgba(255, 96, 92, 0.08); }
        .tmc-row-soon    { background: rgba(255, 189, 68, 0.10); }
        .tmc-row-notyet  { background: rgba(0, 202, 78, 0.08); }
        
        /* Badges */
        .tmc-badge { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 99px; display: inline-block; }
        .tmc-badge-overdue { background: #fef2f2; color: #b42318; border: 1px solid #fecdca; }
        .tmc-badge-soon { background: #fffaeb; color: #b54708; border: 1px solid #fedf89; }
        .tmc-badge-future { background: #f0f9ff; color: #026aa2; border: 1px solid #b9e6fe; }
        .tmc-badge-unknown { background: #f2f4f7; color: #344054; border: 1px solid #d0d5dd; }

        /* Toasts */
        .lw-toast-wrap{ position: fixed; top: 12px; right: 12px; z-index: 100000; display: flex; flex-direction: column; gap: 8px; pointer-events: none; }
        .lw-toast{ pointer-events: auto; min-width: 240px; background: #111; color: #fff; border-radius: 10px; padding: 10px 12px; box-shadow: 0 12px 24px rgba(0,0,0,0.25); display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; opacity: 0; transform: translateY(-6px); transition: opacity .18s ease, transform .18s ease; direction: rtl; }
        .lw-toast.show{ opacity: 1; transform: translateY(0); }
      `;
      const style = document.createElement('style');
      style.textContent = css;
      document.head.appendChild(style);
    }
  
    /************************************************************
     *  Forecast UI (Supabase v_forecast_with_status)
     ************************************************************/
  
    function supaRestFetch(path, { method = 'GET', body = null } = {}) {
      // תומך גם בנתיב יחסי (/rest/v1/...) וגם ב-URL מלא (https://...)
      const base = SUPABASE_URL.replace(/\/$/, '');
      const url = path.startsWith('http')
        ? path
        : `${base}${path.startsWith('/') ? '' : '/'}${path}`;

      const headers = {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      };


      return fetch(url, { method, headers, body: body ? JSON.stringify(body) : null })
        .then(async (res) => {
          const text = await res.text();
          let json;
          try { json = text ? JSON.parse(text) : null; } catch { json = text; }
          if (!res.ok) {
            const msg = typeof json === 'string' ? json : JSON.stringify(json);
            throw new Error(`Supabase REST ${res.status}: ${msg}`);
          }
          return json;
        });
    }

    // ==========================
    // MV Refresh (Forecast Cache)
    // ==========================
    const LW_MV_REFRESH_THROTTLE_MS = 10 * 60 * 1000; // 10 minutes
    const LW_MV_REFRESH_LAST_TS_KEY = 'lw_mv_fae_last_refresh_ts';
    let LW_MV_REFRESH_INFLIGHT = false;

    function lwGetNumLS(key, fallback = 0) {
      try {
        const v = Number(localStorage.getItem(key));
        return Number.isFinite(v) ? v : fallback;
      } catch (_) {
        return fallback;
      }
    }

    function lwSetNumLS(key, value) {
      try { localStorage.setItem(key, String(value)); } catch (_) {}
    }

    async function refreshMVForecastActiveEnrichedRpc() {
      await supaRestFetch('/rest/v1/rpc/refresh_mv_forecast_active_enriched', { method: 'POST', body: {} });
    }

    // ============================
    // MV Refresh: verify + refetch + cache-bust
    // ============================
    // Single attempt: GET v_forecast_active_enriched?select=*&limit=3. If 400 → null immediately (no extra candidates).
    // Extra: remember 400 and skip any future verify attempts in this page session (avoid repeated failing calls).

    let LW_FORECAST_VERIFY_VIEW_UNAVAILABLE = false;

    async function safeReadText(res) {
      try { return res ? await res.text() : ''; } catch (_) { return ''; }
    }

    function stableMiniFingerprint(rows) {
      if (!Array.isArray(rows) || rows.length === 0) return '';
      const slice = rows.slice(0, 3).map(r => {
        const o = {};
        for (const k in r) {
          if (!Object.prototype.hasOwnProperty.call(r, k)) continue;
          if (k === 'fingerprint' || k === 'customer_names' || k === 'extra_json') continue;
          o[k] = r[k];
        }
        return o;
      });
      return JSON.stringify(slice.map(r => {
        const keys = Object.keys(r).sort();
        const out = {};
        keys.forEach(k => { out[k] = r[k]; });
        return out;
      }));
    }

    /**
     * Forecast verify / fingerprint: ONE attempt only.
     * GET /rest/v1/v_forecast_active_enriched?select=*&limit=3
     * If 400 (view not exposed, RLS, schema) → return null immediately. Quiet when DEBUG=false.
     */
    async function getForecastVerifyFingerprintOrNull() {
      if (LW_FORECAST_VERIFY_VIEW_UNAVAILABLE) return null;

      const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      const base = SUPABASE_URL.replace(/\/$/, '');
      const url = base + '/rest/v1/v_forecast_active_enriched?select=*&limit=3';

      let res;
      try {
        res = await fetch(url, {
          method: 'GET',
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store'
          }
        });
      } catch (e) {
        if (LW_ORDERS_CONFIG.DEBUG) console.debug('[Forecast Verify] fetch failed (network). Returning null.', e);
        return null;
      }

      if (res && res.status === 400) {
        LW_FORECAST_VERIFY_VIEW_UNAVAILABLE = true;
        if (LW_ORDERS_CONFIG.DEBUG) {
          const dt = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - t0;
          console.debug('[Forecast Verify] view returned 400; returning null (single attempt). dtMs=', Math.round(dt));
        }
        return null;
      }

      if (!res || !res.ok) {
        if (LW_ORDERS_CONFIG.DEBUG) {
          const txt = await safeReadText(res);
          console.debug('[Forecast Verify] view not ok; status=', res ? res.status : 'no-res', 'body=', txt);
        }
        return null;
      }

      let rows = null;
      try {
        rows = await res.json();
      } catch (e) {
        if (LW_ORDERS_CONFIG.DEBUG) console.debug('[Forecast Verify] json parse failed; returning null.', e);
        return null;
      }

      const fp = stableMiniFingerprint(rows);
      if (LW_ORDERS_CONFIG.DEBUG) {
        const dt = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - t0;
        console.debug('[Forecast Verify] ok. cnt=', Array.isArray(rows) ? rows.length : 0, 'fpLen=', fp ? fp.length : 0, 'dtMs=', Math.round(dt));
      }
      return fp;
    }

    async function verifyMVChangeAfterRefresh() {
      try {
        const fp = await getForecastVerifyFingerprintOrNull();
        return { cnt: null, fp };
      } catch (e) {
        if (LW_ORDERS_CONFIG.DEBUG) console.warn('[MV Refresh] verify failed:', e);
        return { cnt: null, fp: null };
      }
    }

    let __lwForecastRefetchFn = null;
    let __lwForecastRefetchScheduled = false;
    let __lwForecastRefetchLastAt = 0;
    const LW_FORECAST_REFETCH_COOLDOWN_MS = 800;

    async function forceRefetchAndRenderForecast(reason) {
      if (LW_ORDERS_CONFIG.DEBUG) console.log('[Forecast] force refetch+render:', reason);
      try {
        if (typeof FORECAST_PRODUCT_CACHE !== 'undefined') {
          FORECAST_PRODUCT_CACHE.data = null;
          FORECAST_PRODUCT_CACHE.timestamp = 0;
        }
      } catch (_) {}
      try {
        if (typeof forecastProductRows !== 'undefined') forecastProductRows = [];
      } catch (_) {}
      if (typeof __lwForecastRefetchFn === 'function') {
        await yieldToBrowser(200);
        await yieldToBrowser(200);
        await __lwForecastRefetchFn();
        return;
      }
      if (LW_ORDERS_CONFIG.DEBUG) console.warn('[Forecast] No forecast UI open; refetch skipped.');
    }

    function scheduleForecastRefetch(reason) {
      const now = Date.now();
      if (__lwForecastRefetchScheduled) return;
      if (now - __lwForecastRefetchLastAt < LW_FORECAST_REFETCH_COOLDOWN_MS) return;
      __lwForecastRefetchScheduled = true;
      const doRefetch = () => {
        __lwForecastRefetchScheduled = false;
        __lwForecastRefetchLastAt = Date.now();
        forceRefetchAndRenderForecast(reason).catch((e) => { if (LW_ORDERS_CONFIG.DEBUG) console.warn('[Forecast] scheduled refetch failed:', e); });
      };
      if (typeof queueMicrotask === 'function') {
        queueMicrotask(doRefetch);
      } else if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(doRefetch, { timeout: 50 });
      } else {
        setTimeout(doRefetch, 0);
      }
    }

    async function maybeRefreshMV({ reason = 'unspecified', force = false, toast = true } = {}) {
      if (!LW_ORDERS_CONFIG.ENABLE_LEGACY_MV_REFRESH) {
        return { didRefresh: false, skipped: 'disabled' };
      }

      if (LW_MV_REFRESH_INFLIGHT) {
        return { didRefresh: false, skipped: 'inflight' };
      }

      const now = Date.now();
      const last = lwGetNumLS(LW_MV_REFRESH_LAST_TS_KEY, 0);
      const age = now - last;

      if (!force && last && age < LW_MV_REFRESH_THROTTLE_MS) {
        const leftSec = Math.ceil((LW_MV_REFRESH_THROTTLE_MS - age) / 1000);
        return { didRefresh: false, skipped: 'throttle', leftSec };
      }

      let before = null;
      if (!LW_FORECAST_VERIFY_VIEW_UNAVAILABLE) {
        try { before = await verifyMVChangeAfterRefresh(); } catch (_) {}
      }

      LW_MV_REFRESH_INFLIGHT = true;
      try {
        if (toast) showToast('מרענן תחזית (MV)…', 'info', 1200);
        await refreshMVForecastActiveEnrichedRpc();
        lwSetNumLS(LW_MV_REFRESH_LAST_TS_KEY, now);
        if (toast) showToast('התחזית עודכנה', 'success', 1200);
        const result = { didRefresh: true };
        let after = null;
        if (!LW_FORECAST_VERIFY_VIEW_UNAVAILABLE) {
          after = await verifyMVChangeAfterRefresh();
          if (LW_ORDERS_CONFIG.DEBUG) console.log('[MV Refresh] verify diff:', { before, after });
        }
        scheduleForecastRefetch('mv_refresh_didRefresh=true');
        return result;
      } catch (err) {
        console.error('[MV Refresh] failed:', err);
        if (toast) showToast('רענון תחזית נכשל (ראה console)', 'warning', 2200);
        return { didRefresh: false, error: String(err?.message || err) };
      } finally {
        LW_MV_REFRESH_INFLIGHT = false;
      }
    }

    async function supaRestFetchPaged(path, { method = 'GET', body = null, pageSize = 1000 } = {}) {
      const base = SUPABASE_URL.replace(/\/$/, '');
      const url = path.startsWith('http')
        ? path
        : `${base}${path.startsWith('/') ? '' : '/'}${path}`;
      const isRpc = url.includes('/rpc/');

      const baseHeaders = {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      };

      if (isRpc && method !== 'GET') {
        const res = await fetch(url, { method, headers: baseHeaders, body: body ? JSON.stringify(body) : null });
        const text = await res.text();
        let json;
        try { json = text ? JSON.parse(text) : null; } catch { json = text; }
        if (!res.ok) {
          const msg = typeof json === 'string' ? json : JSON.stringify(json);
          throw new Error(`Supabase REST ${res.status}: ${msg}`);
        }
        return json;
      }

      const all = [];
      let from = 0;
      let page = 0;
      const MAX_PAGES = 200;
      while (true) {
        let pageUrl = url;
        let headers = baseHeaders;

        if (isRpc) {
          const hasQuery = pageUrl.includes('?');
          const sep = hasQuery ? '&' : '?';
          pageUrl = `${pageUrl}${sep}limit=${pageSize}&offset=${from}`;
        } else {
          const to = from + pageSize - 1;
          headers = {
            ...baseHeaders,
            'Range': `${from}-${to}`
          };
        }

        const res = await fetch(pageUrl, { method, headers, body: body ? JSON.stringify(body) : null });
        const text = await res.text();
        let json;
        try { json = text ? JSON.parse(text) : null; } catch { json = text; }
        if (!res.ok) {
          const msg = typeof json === 'string' ? json : JSON.stringify(json);
          throw new Error(`Supabase REST ${res.status}: ${msg}`);
        }

        if (!Array.isArray(json)) return json;
        all.push(...json);

        if (isRpc) {
          if (json.length < pageSize) break;
        } else {
          const contentRange = res.headers.get('content-range');
          if (!contentRange) {
            if (json.length < pageSize) break;
          } else {
            const m = contentRange.match(/(\d+)-(\d+)\/(\d+|\*)/);
            if (m && m[3] !== '*') {
              const total = Number(m[3]);
              if (Number.isFinite(total) && (from + pageSize >= total)) break;
            } else if (json.length < pageSize) {
              break;
            }
          }
        }

        if (json.length === 0) break;
        from += pageSize;
        page += 1;
        if (page >= MAX_PAGES) break;
      }

      return all;
    }
  
    function normalizeStr(x) {
      return String(x ?? '').trim();
    }
  
    function safeDate(x) {
      // accepts ISO or yyyy-mm-dd; returns Date or null
      const s = normalizeStr(x);
      if (!s) return null;
      const d = new Date(s);
      return isNaN(d.getTime()) ? null : d;
    }
  
    function daysBetween(a, b) {
      // floor diff in days (b - a)
      const ms = (b.getTime() - a.getTime());
      return Math.floor(ms / (1000 * 60 * 60 * 24));
    }
  
    /**
     * Helper: Format date to Hebrew format (dd.mm)
     */
    function formatHebDate(value) {
      if (!value) return '';
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return String(value);
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      return `${day}.${month}`;
    }

    /**
     * Compute forecast status from a row (mv_forecast_dos_final).
     * next_due_date: mapped from due_date. hasEnoughHistory: (total_orders || 0) >= 1.
     * Passes through is_stockup, recommended_qty from view.
     */
    function computeForecastStatusFromRow(row) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const next_due_date = row.next_due_date ?? row.due_date;
      let daysUntilNext = null;

      if (next_due_date) {
        const nd = new Date(next_due_date);
        nd.setHours(0, 0, 0, 0);
        const diffMs = nd.getTime() - today.getTime();
        daysUntilNext = Math.round(diffMs / (1000 * 60 * 60 * 24));
      }

      const __minOrders = (typeof FORECAST_MIN_ORDERS === 'number' ? FORECAST_MIN_ORDERS : 3);
      const hasEnoughHistory = (row.total_orders || 0) >= __minOrders;

      let n_due  = 0;
      let n_soon = 0;
      let n_open = 0;
      let status_tag = 'none';

      if (daysUntilNext !== null && hasEnoughHistory) {
        if (daysUntilNext <= 0) {
          n_due = 1;
          status_tag = 'due';
        } else if (daysUntilNext <= 7) {
          n_soon = 1;
          status_tag = 'soon';
        }

        if (daysUntilNext <= 30) {
          n_open = 1;
        }
      }

      return {
        ...row,
        next_due_date: next_due_date ?? row.due_date,
        hasEnoughHistory,
        is_stockup: row.is_stockup,
        recommended_qty: row.recommended_qty,
        days_until_next: daysUntilNext,
        n_due,
        n_soon,
        n_open,
        status_tag
      };
    }

    /**
     * Fetch forecast data from v_mv_forecast_dos_final_canon (Days of Supply, canonical SKU).
     * Schema: customer_phone, customer_name, sku, product_name, last_order_date, last_qty,
     * total_orders, days_of_supply, due_date, is_stockup, recommended_qty.
     * Filter: due_date <= (now + 180 days). Order: due_date asc.
     */
    const FORECAST_DAYS_WINDOW = 180;
    const FORECAST_DOS_VIEW = 'v_mv_forecast_dos_final_canon';

    async function fetchForecastDataByProduct(dateFilter = null) {
      const now = Date.now();

      if (FORECAST_CACHE.data && (now - FORECAST_CACHE.timestamp < FORECAST_CACHE.TTL)) {
        if (LW_ORDERS_CONFIG.DEBUG) console.log('[Forecast] Returning cached data');
        return FORECAST_CACHE.data;
      }

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + FORECAST_DAYS_WINDOW);
      const futureIso = futureDate.toISOString();

      const url = `/rest/v1/${FORECAST_DOS_VIEW}?select=*` +
        `&due_date=lte.${encodeURIComponent(futureIso)}` +
        `&order=due_date.asc&limit=5000`;

      let rows = [];
      try {
        rows = await supaRestFetch(url, { method: 'GET' });
      } catch (err) {
        console.error('[Forecast] Error fetching forecast:', err);
        return FORECAST_CACHE.data || [];
      }
      if (!Array.isArray(rows)) rows = [];

      // Normalize: enforce canonical SKU for grouping, but keep raw SKU for drilldown/debug.
      rows = rows.map(r => {
        const skuCanon = String(r?.sku_canon ?? r?.skuCanon ?? r?.sku ?? '').trim();
        const skuRaw = String(r?.sku_raw ?? r?.skuRaw ?? r?.sku ?? '').trim();
        return {
          ...r,
          sku: skuCanon || skuRaw,
          sku_canon: skuCanon || null,
          sku_raw: skuRaw || null,
          barcode: (r?.barcode != null) ? String(r.barcode).trim() : '',
          supplier: (r?.supplier != null) ? String(r.supplier).trim() : ''
        };
      });

      const enrichedRows = rows.map(computeForecastStatusFromRow);
      FORECAST_CACHE.data = enrichedRows;
      FORECAST_CACHE.timestamp = now;
      return enrichedRows;
    }

    async function fetchForecastRows(forceRefresh = false) {
      const now = Date.now();

      // Return cache if valid
      if (!forceRefresh && FORECAST_CACHE.data && (now - FORECAST_CACHE.timestamp < FORECAST_CACHE.TTL)) {
        console.log('[Forecast] Returning cached data');
        return FORECAST_CACHE.data;
      }

      // Fetch new from mv_forecast_dos_final
      const rows = await fetchForecastDataByProduct();

      // Update Cache
      FORECAST_CACHE.data = rows;
      FORECAST_CACHE.timestamp = now;

      return rows;
    }

    // Cache נפרד ל־overview לפי מוצר
    const FORECAST_PRODUCT_CACHE = {
      data: null,
      timestamp: 0,
      TTL: 5 * 60 * 1000 // 5 דקות
    };

    // SKUs שצריך להוציא מהתצוגה
    const FORECAST_EXCLUDED_SKUS = new Set(['491', '1949']);

    // Helper: Parse JSON array safely
    function safeJsonArrayParse(val) {
      if (!val) return [];
      try {
        const parsed = JSON.parse(val);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }

    // Helper: Normalize product row.
    // Supports BOTH:
    // - legacy: v_forecast_product_overview / v_forecast_api fallback
    // - new:    v_product_order_qty_by_cycle (supplier cycle + qty within cycle)
    function normalizeProductRow(r) {
      const forecastQtyRaw = r?.forecast_qty ?? r?.forecastQty ?? null;
      const forecastQty =
        (forecastQtyRaw == null || Number.isNaN(Number(forecastQtyRaw)))
          ? null
          : Number(forecastQtyRaw);

      const qtyWithinRaw = r?.qty_within_cycle ?? r?.qtyWithinCycle ?? null;
      const qtyWithinCycle =
        (qtyWithinRaw == null || Number.isNaN(Number(qtyWithinRaw)))
          ? null
          : Number(qtyWithinRaw);

      const cycleRaw = r?.suggested_cycle_days ?? r?.suggestedCycleDays ?? null;
      const suggestedCycleDays =
        (cycleRaw == null || Number.isNaN(Number(cycleRaw)))
          ? null
          : Number(cycleRaw);

      return {
        ...r,
        sku: String(r.sku ?? '').trim(),
        product_name: String(r.product_name ?? r.name ?? '').trim(),
        supplier: String(r.supplier ?? '').trim(),

        // New (supplier cycle)
        suggested_cycle_days: suggestedCycleDays,
        qty_within_cycle: qtyWithinCycle,
        n_records: Number(r.n_records) || 0,
        first_due_date: r.first_due_date || null,
        last_due_date: r.last_due_date || null,

        // Legacy (forecast overview)
        customer_names: safeJsonArrayParse(r.customer_names),
        customer_keys: safeJsonArrayParse(r.customer_keys),
        forecast_qty: forecastQty,
        n_customer_forecasts: Number(r.n_customer_forecasts) || 0,
        n_customers: Number(r.n_customers) || 0,
        n_fulfilled: Number(r.n_fulfilled) || 0,
        n_pending: Number(r.n_pending) || 0,
        n_missed: Number(r.n_missed) || 0,
        n_due: Number(r.n_due) || 0,
        n_soon: Number(r.n_soon) || 0,
        n_open: Number(r.n_open) || 0,
      };
    }

    // Global state for forecast product rows (after normalization and filtering)
    let forecastProductRows = [];

    async function fetchProductOverviewRows({ forceRefresh = false, dateFrom = null, dateTo = null } = {}) {
      const now = Date.now();

      // החזרת cache אם עדיין בתוקף
      if (!forceRefresh &&
          FORECAST_PRODUCT_CACHE.data &&
          (now - FORECAST_PRODUCT_CACHE.timestamp < FORECAST_PRODUCT_CACHE.TTL)) {
        console.log('[Forecast] Returning cached product overview data');
        return FORECAST_PRODUCT_CACHE.data;
      }

      // NEW: Fetch by supplier cycle (what to order per supplier cycle window)
      // Note: Keep the select explicit to reduce payload.
      let url = `/rest/v1/v_product_order_qty_by_cycle` +
        `?select=sku,product_name,supplier,suggested_cycle_days,qty_within_cycle,n_records,first_due_date,last_due_date,n_missed` +
        `&order=qty_within_cycle.desc.nullslast&limit=5000`;

      console.log('[Forecast] Fetching product overview (cycle) from:', url);

      let rawRows;
      try {
        rawRows = await supaRestFetch(url, { method: 'GET' });
      } catch (error) {
        console.error('[Forecast] Error fetching product overview:', error);
        // If the view doesn't exist or has errors, try to use v_forecast_api as fallback
        console.log('[Forecast] Trying fallback to v_forecast_api...');
        try {
          const fallbackUrl = `/rest/v1/v_forecast_api?select=*&limit=5000`;
          const fallbackRows = await supaRestFetch(fallbackUrl, { method: 'GET' });
          // Group by SKU to create product overview
          const grouped = {};
          fallbackRows.forEach(row => {
            const sku = row.sku || '';
            if (!sku) return;
            if (!grouped[sku]) {
              grouped[sku] = {
                sku,
                product_name: row.product_name || '',
                n_customer_forecasts: 0,
                n_customers: new Set(),
                customer_names: [],
                customer_keys: [],
                n_fulfilled: 0,
                n_pending: 0,
                n_missed: 0,
                n_due: 0,
                n_soon: 0,
                n_open: 0,
                first_expected_date: null,
                last_expected_date: null
              };
            }
            const g = grouped[sku];
            g.n_customer_forecasts++;
            if (row.customer_phone) g.n_customers.add(row.customer_phone);
            if (row.customer_name) g.customer_names.push(row.customer_name);
            if (row.customer_phone) g.customer_keys.push(row.customer_phone);
            if (row.n_due) g.n_due += row.n_due;
            if (row.n_soon) g.n_soon += row.n_soon;
            if (row.n_open) g.n_open += row.n_open;
            if (row.next_due_date) {
              const date = new Date(row.next_due_date);
              if (!g.first_expected_date || date < new Date(g.first_expected_date)) {
                g.first_expected_date = row.next_due_date;
              }
              if (!g.last_expected_date || date > new Date(g.last_expected_date)) {
                g.last_expected_date = row.next_due_date;
              }
            }
          });
          rawRows = Object.values(grouped).map(g => ({
            ...g,
            n_customers: g.n_customers.size,
            customer_names: [...new Set(g.customer_names)],
            customer_keys: [...new Set(g.customer_keys)]
          }));
          console.log('[Forecast] Using fallback data, grouped into', rawRows.length, 'products');
        } catch (fallbackError) {
          console.error('[Forecast] Fallback also failed:', fallbackError);
          rawRows = [];
        }
      }

      // Normalize and filter excluded SKUs
      const normalizedRows = (rawRows || [])
        .map(normalizeProductRow)
        .filter(row => !FORECAST_EXCLUDED_SKUS.has(row.sku));

      // Update global state
      forecastProductRows = normalizedRows;

      // Cache the normalized rows
      FORECAST_PRODUCT_CACHE.data = normalizedRows;
      FORECAST_PRODUCT_CACHE.timestamp = now;

      return normalizedRows;
    }

    /**
     * Fetch order history for a specific customer and SKU from Supabase
     * @param {string} customerKey - Customer key (phone/email)
     * @param {string} sku - Product SKU
     * @returns {Promise<Array>} - Array of order history items
     */
    async function fetchOrderHistory(customerKey, sku) {
      if (!customerKey || !sku) {
        console.warn('[Forecast] fetchOrderHistory: missing customerKey or sku');
        return [];
      }

      try {
        // First, fetch orders for this customer using inFilter (works with single value too)
        const { data: orders } = await supabaseGet(
          SUPABASE_TABLE,
          {
            select: 'order_id,order_date,created_date,task_id,customer_phone,customer_name',
            inFilter: { column: 'customer_phone', values: [customerKey] }
          }
        );

        if (!Array.isArray(orders) || orders.length === 0) {
          return [];
        }

        const orderIds = orders.map(o => o.order_id).filter(Boolean);
        if (orderIds.length === 0) {
          return [];
        }

        // Fetch items for these orders that match the SKU
        const { data: items } = await supabaseGetInChunks(
          SUPABASE_ITEMS_TABLE,
          'order_id,sku',
          'order_id',
          orderIds,
          80
        );

        if (!Array.isArray(items) || items.length === 0) {
          return [];
        }

        // Get unique order IDs that have this SKU
        // Normalize SKU by removing non-digits for comparison
        const normalizedSku = String(sku).replace(/\D/g, '').trim();
        const matchingOrderIds = new Set(
          items
            .filter(i => {
              const itemSku = String(i.sku || '').replace(/\D/g, '').trim();
              return itemSku === normalizedSku;
            })
            .map(i => i.order_id)
            .filter(Boolean)
        );

        // Build history from matching orders
        const history = orders
          .filter(o => matchingOrderIds.has(o.order_id))
          .map(o => ({
            orderDate: o.order_date || o.created_date || null,
            taskId: o.task_id || o.order_id || null,
            orderId: o.order_id || null,
            customerName: o.customer_name || null,
          }))
          .filter(h => h.orderDate || h.taskId || h.orderId)
          .sort((a, b) => {
            // Sort by date descending
            const dateA = a.orderDate || '';
            const dateB = b.orderDate || '';
            return dateB.localeCompare(dateA);
          });

        return history;
      } catch (error) {
        console.error('[Forecast] Error fetching order history:', error);
        return [];
      }
    }

    /**
     * Fetch all orders for a specific SKU (across all customers)
     * @param {string} sku - Product SKU
     * @returns {Promise<Array>} - Array of order history items with customer info
     */
    async function fetchOrderHistoryBySku(sku) {
      if (!sku) {
        console.warn('[Forecast] fetchOrderHistoryBySku: missing sku');
        return [];
      }

      try {
        // Normalize SKU
        const normalizedSku = String(sku).replace(/\D/g, '').trim();
        if (!normalizedSku) {
          return [];
        }

        console.log(`[Forecast] Fetching order history for SKU: ${normalizedSku}`);

        // Build query URL with SKU filter directly in the API
        // Use Supabase REST API filter: sku=eq.{value} for exact match
        // Since SKU might be stored with different formats, we'll try both exact match and normalized match
        // First try exact match
        let path = `/rest/v1/${SUPABASE_ITEMS_TABLE}?select=order_id,sku&sku=eq.${encodeURIComponent(normalizedSku)}&limit=5000`;
        
        let itemsResponse = await supaRestFetch(path, { method: 'GET' });
        
        // If no results with exact match, try with original SKU format (might have non-digits)
        if (!Array.isArray(itemsResponse) || itemsResponse.length === 0) {
          const originalSku = String(sku).trim();
          if (originalSku !== normalizedSku) {
            console.log(`[Forecast] No results with normalized SKU, trying original format: ${originalSku}`);
            path = `/rest/v1/${SUPABASE_ITEMS_TABLE}?select=order_id,sku&sku=eq.${encodeURIComponent(originalSku)}&limit=5000`;
            itemsResponse = await supaRestFetch(path, { method: 'GET' });
          }
        }

        // If still no results, fall back to client-side filtering (for edge cases)
        if (!Array.isArray(itemsResponse) || itemsResponse.length === 0) {
          console.log(`[Forecast] No results with API filter, trying client-side filtering`);
          path = `/rest/v1/${SUPABASE_ITEMS_TABLE}?select=order_id,sku&limit=5000`;
          const allItems = await supaRestFetch(path, { method: 'GET' });
          
          if (Array.isArray(allItems)) {
            itemsResponse = allItems.filter(i => {
              const itemSku = String(i.sku || '').replace(/\D/g, '').trim();
              return itemSku === normalizedSku;
            });
          }
        }
        
        if (!Array.isArray(itemsResponse) || itemsResponse.length === 0) {
          console.log(`[Forecast] No items found for SKU ${normalizedSku}`);
          return [];
        }

        console.log(`[Forecast] Found ${itemsResponse.length} items for SKU ${normalizedSku}`);

        // Get unique order IDs
        const orderIds = [...new Set(itemsResponse.map(i => i.order_id).filter(Boolean))];
        if (orderIds.length === 0) {
          return [];
        }

        console.log(`[Forecast] Found ${orderIds.length} unique orders for SKU ${normalizedSku}`);

        // Fetch orders for these order IDs
        const { data: orders } = await supabaseGetInChunks(
          SUPABASE_TABLE,
          'order_id,order_date,created_date,task_id,customer_phone,customer_name,wp_order_id',
          'order_id',
          orderIds,
          80
        );

        if (!Array.isArray(orders) || orders.length === 0) {
          console.log(`[Forecast] No orders found for order IDs`);
          return [];
        }

        console.log(`[Forecast] Found ${orders.length} orders with customer info`);

        // Build history from orders
        const history = orders
          .map(o => ({
            orderDate: o.order_date || o.created_date || null,
            taskId: o.task_id || o.order_id || null,
            orderId: o.order_id || null,
            wpOrderId: o.wp_order_id || null,
            customerName: o.customer_name || null,
            customerPhone: o.customer_phone || null,
          }))
          .filter(h => h.orderDate || h.taskId || h.orderId)
          .sort((a, b) => {
            // Sort by date descending
            const dateA = a.orderDate || '';
            const dateB = b.orderDate || '';
            return dateB.localeCompare(dateA);
          });

        console.log(`[Forecast] Returning ${history.length} history items for SKU ${normalizedSku}`);
        return history;
      } catch (error) {
        console.error('[Forecast] Error fetching order history by SKU:', error);
        return [];
      }
    }
  
    const FORECAST_FIELD_MAP = {
      customer_key: 'customerKey',
      customer_name: 'customerName',
      product_key: 'productKey',
      sku: 'sku',
      product_name: 'productName',
      n_orders: 'nOrders',
      last_order_date: 'lastOrderDate',
      avg_gap_days_recent: 'avgGapDays',
      next_expected_date: 'nextExpectedDate',
      alert_window_days: 'alertWindowDays',
      days_until_expected: 'daysUntilExpected',
      status: 'status',
      last_any_order_date: 'lastAnyOrderDate',
      days_since_any_order: 'daysSinceAnyOrder',
      forecast_status: 'forecastStatus',
      forecast_qty: 'forecastQty',
      actual_qty: 'actualQty',
      first_match_date: 'firstMatchDate',
      matched_order_ids: 'matchedOrderIds',
      fulfillment_task_id: 'fulfillmentTaskId',
      fulfillment_task_date: 'fulfillmentTaskDate',
    };
  
    function normalizeForecastRow(row) {
      const mapped = {};
      for (const [apiField, normalizedField] of Object.entries(FORECAST_FIELD_MAP)) {
        mapped[normalizedField] = row ? row[apiField] : null;
      }
  
      // Try to extract order history from raw row (if view provides it).
      // Supported shapes:
      // 1) row.order_history is array: [{ order_date, task_id, order_id }, ...]
      // 2) row.order_history_json / row.orders_json is JSON string of same
      function extractOrderHistory(r) {
        if (!r) return [];
  
        // 1) נסה כמה שמות נפוצים למערך ישיר
        const directCandidates = [
          'order_history',
          'orders_history',
          'history',
          'orders',
          'orderHistory',
          'order_history_arr',
          'order_history_list'
        ];
  
        for (const k of directCandidates) {
          if (Array.isArray(r[k])) return r[k];
        }
  
        // 2) נסה כמה שמות נפוצים ל-JSON string
        const jsonCandidates = [
          'order_history_json',
          'orders_json',
          'order_history_text',
          'orders_history_json',
          'history_json',
          'history_text'
        ];
  
        for (const k of jsonCandidates) {
          const s = r[k];
          if (typeof s === 'string' && s.trim()) {
            try {
              const parsed = JSON.parse(s);
              if (Array.isArray(parsed)) return parsed;
            } catch {}
          }
        }
  
        // 3) fallback: אם יש שדה שהוא string עם תאריכים/מזהים בפורמט לא-JSON (נדיר)
        // אפשר להוסיף כאן parser לפי הפורמט האמיתי אם תגלה כזה.
  
        return [];
      }
  
      const orderHistoryRaw = extractOrderHistory(row);
      const orderHistory = orderHistoryRaw
        .map(x => ({
          orderDate: normalizeStr(x?.order_date || x?.date || x?.orderDate),
          taskId: normalizeStr(x?.task_id || x?.taskId),
          orderId: normalizeStr(x?.order_id || x?.orderId),
        }))
        .filter(x => x.orderDate || x.taskId || x.orderId);
  
      // Extract matched_order_ids (can be array or JSON string)
      let matchedOrderIds = [];
      if (row) {
        const rawMatched = row.matched_order_ids;
        if (Array.isArray(rawMatched)) {
          matchedOrderIds = rawMatched;
        } else if (typeof rawMatched === 'string' && rawMatched.trim()) {
          try {
            const parsed = JSON.parse(rawMatched);
            if (Array.isArray(parsed)) matchedOrderIds = parsed;
          } catch {}
        }
      }

      // שדות התחזית מה-View
      const forecastStatus = normalizeStr(mapped.forecastStatus) || 'unknown';
      const forecastQtyRaw = mapped.forecastQty ?? row?.forecast_qty ?? 1;
      const actualQtyRaw = mapped.actualQty ?? row?.actual_qty ?? 0;
      const firstMatchDateRaw = mapped.firstMatchDate ?? row?.first_match_date ?? null;
      const fulfillmentTaskIdRaw = mapped.fulfillmentTaskId ?? row?.fulfillment_task_id ?? null;
      const fulfillmentTaskDateRaw = mapped.fulfillmentTaskDate ?? row?.fulfillment_task_date ?? null;

      const forecastQty =
        typeof forecastQtyRaw === 'number' ? forecastQtyRaw : Number(forecastQtyRaw) || 1;
      const actualQty =
        typeof actualQtyRaw === 'number' ? actualQtyRaw : Number(actualQtyRaw) || 0;
      const firstMatchDate = firstMatchDateRaw ? normalizeStr(firstMatchDateRaw) : null;
      const fulfillmentTaskId = fulfillmentTaskIdRaw ? normalizeStr(fulfillmentTaskIdRaw) : null;
      const fulfillmentTaskDate = fulfillmentTaskDateRaw ? normalizeStr(fulfillmentTaskDateRaw) : null;
      const isFulfilled = forecastStatus === 'fulfilled';

      return {
        customerKey: normalizeStr(mapped.customerKey) || 'UNKNOWN',
        customerName: normalizeStr(mapped.customerName) || 'ללא שם',
        productKey: normalizeStr(mapped.productKey) || null,
        sku: normalizeStr(mapped.sku) || null,
        productName: normalizeStr(mapped.productName) || 'ללא שם מוצר',
        nOrders: mapped.nOrders ?? 0,
        lastOrderDate: normalizeStr(mapped.lastOrderDate),
        lastAnyOrderDate: normalizeStr(mapped.lastAnyOrderDate),
        avgGapDays: mapped.avgGapDays ? parseFloat(mapped.avgGapDays) : null,
        nextExpectedDateStr: normalizeStr(mapped.nextExpectedDate),
        nextExpectedDate: safeDate(mapped.nextExpectedDate),
        daysUntilExpected: mapped.daysUntilExpected ?? null,
        daysSinceAnyOrder: mapped.daysSinceAnyOrder ?? null,
        alertWindowDays: mapped.alertWindowDays ?? null,
        status: normalizeStr(mapped.status) || '',
        forecastStatus,
        forecastQty,
        actualQty,
        firstMatchDate,
        isFulfilled,
        fulfillmentTaskId,
        fulfillmentTaskDate,
        matchedOrderIds,
        orderHistory,
        raw: row,
      };
    }
  
    function getForecastStatusMeta(status) {
      switch (status) {
        case 'fulfilled':
          return {
            label: 'התגשמה',
            color: '#27ae60', // ירוק רגוע
            bg: 'rgba(39,174,96,0.12)',
            icon: '✅',
          };
        case 'pending':
          return {
            label: 'ממתינה',
            color: '#f39c12', // כתום
            bg: 'rgba(243,156,18,0.12)',
            icon: '⏳',
          };
        case 'missed':
          return {
            label: 'הוחמצה',
            color: '#e74c3c', // אדום
            bg: 'rgba(231,76,60,0.12)',
            icon: '⚠️',
          };
        case 'partial_active':
          return {
            label: 'חלקית (חלון פתוח)',
            color: '#8e44ad',
            bg: 'rgba(142,68,173,0.12)',
            icon: '🟣',
          };
        case 'partial_expired':
          return {
            label: 'חלקית (חלון נסגר)',
            color: '#8e44ad',
            bg: 'rgba(142,68,173,0.12)',
            icon: '🟣',
          };
        default:
          return {
            label: 'לא ידוע',
            color: '#7f8c8d',
            bg: 'rgba(127,140,141,0.12)',
            icon: '➖',
          };
      }
    }

    /**
     * Initialize date range controls for forecast modal
     */
    function initForecastDateRangeControls(container, state, onRangeChange) {
      const trigger = container.querySelector('.tmc-date-trigger');
      const menu = container.querySelector('.tmc-date-menu');
      const labelSpan = container.querySelector('.tmc-date-label');
      const customBox = container.querySelector('.tmc-date-custom');
      const fromInput = container.querySelector('.tmc-date-from');
      const toInput = container.querySelector('.tmc-date-to');
      const applyBtn = container.querySelector('.tmc-date-apply');

      if (!trigger || !menu) return;

      function openMenu() {
        menu.hidden = false;
        document.addEventListener('click', onDocumentClick, true);
        document.addEventListener('keydown', onKeydown, true);
      }

      function closeMenu() {
        menu.hidden = true;
        document.removeEventListener('click', onDocumentClick, true);
        document.removeEventListener('keydown', onKeydown, true);
      }

      function onDocumentClick(e) {
        if (!menu.contains(e.target) && !trigger.contains(e.target)) {
          closeMenu();
        }
      }

      function onKeydown(e) {
        if (e.key === 'Escape') {
          closeMenu();
        }
      }

      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        if (menu.hidden) openMenu();
        else closeMenu();
      });

      // לחיצה על pre-sets (היום / השבוע / וכו')
      const rangeItems = menu.querySelectorAll('.ranges li');
      rangeItems.forEach(li => {
        li.addEventListener('click', () => {
          const key = li.getAttribute('data-range-key');
          if (!key) return;

          state.dateRangeKey = key;
          if (labelSpan) labelSpan.textContent = key;

          if (key === 'טווח מותאם אישית') {
            if (customBox) customBox.hidden = false;
          } else {
            if (customBox) customBox.hidden = true;
            state.dateFrom = null;
            state.dateTo = null;
            if (fromInput) fromInput.value = '';
            if (toInput) toInput.value = '';

            closeMenu();
            if (typeof onRangeChange === 'function') {
              onRangeChange(state);
            }
          }
        });
      });

      // החלת טווח מותאם אישית
      if (applyBtn) {
        applyBtn.addEventListener('click', () => {
          state.dateRangeKey = 'טווח מותאם אישית';
          
          // Get and validate date values (input[type="date"] returns YYYY-MM-DD)
          let fromVal = fromInput && fromInput.value ? fromInput.value.trim() : null;
          let toVal = toInput && toInput.value ? toInput.value.trim() : null;
          
          // Validate format (must be YYYY-MM-DD)
          if (fromVal && !/^\d{4}-\d{2}-\d{2}$/.test(fromVal)) {
            console.warn('[Forecast] Invalid dateFrom format:', fromVal);
            fromVal = null;
          }
          if (toVal && !/^\d{4}-\d{2}-\d{2}$/.test(toVal)) {
            console.warn('[Forecast] Invalid dateTo format:', toVal);
            toVal = null;
          }
          
          state.dateFrom = fromVal;
          state.dateTo = toVal;

          let label = 'טווח מותאם אישית';
          if (fromVal && toVal) label = `${fromVal} – ${toVal}`;
          else if (fromVal) label = `מ־${fromVal}`;
          else if (toVal) label = `עד ${toVal}`;
          if (labelSpan) labelSpan.textContent = label;

          closeMenu();
          if (typeof onRangeChange === 'function') {
            onRangeChange(state);
          }
        });
      }
    }

    function buildForecastModal() {
      const existing = document.getElementById('tmc-forecast-modal');
      if (existing) existing.remove();
  
      const wrap = document.createElement('div');
      wrap.className = 'tmc-modal-overlay';
      wrap.id = 'tmc-forecast-modal';
  
      wrap.innerHTML = `
        <div class="tmc-card">
          <div class="tmc-header">
            <button id="tmc-fc-close" class="tmc-close-top-left">✕</button>
            <div class="tmc-title">
              תחזית הזמנות
              <span id="tmc-fc-count" style="font-size:14px; color:#666; font-weight:400;"></span>
            </div>
  
            <div class="tmc-controls">
              <button id="tmc-export-csv" class="tmc-btn-export" title="ייצא לאקסל (CSV)">
                <i class="fa fa-file-csv"></i>
              </button>

              <div class="tmc-supplier-filter">
                <select id="tmc-supplier-filter" class="tmc-select" title="סינון לפי ספק">
                  <option value="__ALL__">כל הספקים</option>
                  <option value="__UNKNOWN__">ללא ספק</option>
                </select>
              </div>

              <div class="tmc-date-range">
                <div class="tmc-date-trigger">
                  <span class="tmc-date-label">החודש</span>
                </div>
                <div class="tmc-date-menu" hidden>
                  <div class="ranges">
                    <ul>
                      <li data-range-key="היום">
                        <label><input type="checkbox" data-range-key="היום"><span>היום</span></label>
                      </li>
                      <li data-range-key="מחר">
                        <label><input type="checkbox" data-range-key="מחר"><span>מחר</span></label>
                      </li>
                      <li data-range-key="השבוע">
                        <label><input type="checkbox" data-range-key="השבוע"><span>השבוע</span></label>
                      </li>
                      <li data-range-key="השבוע הבא">
                        <label><input type="checkbox" data-range-key="השבוע הבא"><span>השבוע הבא</span></label>
                      </li>
                      <li data-range-key="החודש">
                        <label><input type="checkbox" data-range-key="החודש"><span>החודש</span></label>
                      </li>
                      <li data-range-key="החודש הבא">
                        <label><input type="checkbox" data-range-key="החודש הבא"><span>החודש הבא</span></label>
                      </li>
                      <li data-range-key="כל הפתוחים">
                        <label><input type="checkbox" data-range-key="כל הפתוחים"><span>כל הפתוחים</span></label>
                      </li>
                      <li data-range-key="טווח מותאם אישית">
                        <label><input type="checkbox" data-range-key="טווח מותאם אישית"><span>טווח מותאם אישית</span></label>
                      </li>
                    </ul>
                  </div>
                  <div class="tmc-date-custom" hidden>
                    <div><input type="date" class="tmc-date-from"><span>עד</span><input type="date" class="tmc-date-to"></div>
                    <button class="tmc-btn tmc-date-apply">החל</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
  
          <div class="tmc-body">
            <div id="tmc-fc-list"></div>
          </div>
        </div>
      `;
  
      document.body.appendChild(wrap);
  
      const close = () => wrap.remove();
      wrap.querySelector('#tmc-fc-close').addEventListener('click', close);
      wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
  
      const escListener = (e) => { if(e.key === 'Escape') { close(); document.removeEventListener('keydown', escListener); }};
      document.addEventListener('keydown', escListener);
  
      const listWrap = wrap.querySelector('#tmc-fc-list');
      const closeBtn = wrap.querySelector('#tmc-fc-close');
      const counterLabel = wrap.querySelector('#tmc-fc-count');
      const exportBtn = wrap.querySelector('#tmc-export-csv');

      const supplierSelect = wrap.querySelector('#tmc-supplier-filter');

      const dateTrigger = wrap.querySelector('.tmc-date-trigger');
      const dateMenu = wrap.querySelector('.tmc-date-menu');
      const dateLabelEl = wrap.querySelector('.tmc-date-label');
      const dateRangesList = wrap.querySelector('.tmc-date-menu .ranges');
      const dateCustom = wrap.querySelector('.tmc-date-custom');
      const dateFromInput = wrap.querySelector('.tmc-date-from');
      const dateToInput = wrap.querySelector('.tmc-date-to');
      const dateApplyBtn = wrap.querySelector('.tmc-date-apply');

      return {
        wrap,
        listWrap,
        body: listWrap,
        closeBtn,
        countLabel: counterLabel,
        exportBtn,
        supplierSelect,
        dateTrigger,
        dateMenu,
        dateLabel: dateLabelEl,
        dateRangesList,
        dateCustom,
        dateFrom: dateFromInput,
        dateTo: dateToInput,
        dateApplyBtn
      };
    }
  
    function groupByCustomer(rows) {
      const by = new Map();
      for (const r of rows) {
        const normalized = normalizeForecastRow(r);
        const item = {
          raw: normalized.raw,
          productName: normalized.productName,
          sku: normalized.sku,
          nextExpectedDateStr: normalized.nextExpectedDateStr,
          nextExpectedDate: normalized.nextExpectedDate,
          daysUntilExpected: normalized.daysUntilExpected,
          status: normalized.status,
          forecastStatus: normalized.forecastStatus,
          forecastQty: normalized.forecastQty,
          actualQty: normalized.actualQty,
          firstMatchDate: normalized.firstMatchDate,
          matchedOrderIds: normalized.matchedOrderIds,
          nOrders: normalized.nOrders,
          lastOrderDate: normalized.lastOrderDate,
          lastAnyOrderDate: normalized.lastAnyOrderDate,
          daysSinceAnyOrder: normalized.daysSinceAnyOrder,
          avgGapDays: normalized.avgGapDays
        };
  
        if (!by.has(normalized.customerKey)) {
          by.set(normalized.customerKey, {
            customerKey: normalized.customerKey,
            customerName: normalized.customerName,
            items: [],
          });
        }
        const g = by.get(normalized.customerKey);
        // keep "best" name if we got one later
        if (normalized.customerName && normalized.customerName !== 'ללא שם') g.customerName = normalized.customerName;
        g.items.push(item);
      }
      return Array.from(by.values());
    }
  
    // Helper functions for forecast rendering (moved outside to be accessible from event handlers)
    function getTaskUrl(taskId) {
      if (!taskId) return '';
      // prefer /tasks/:id (you already use /tasks/:id elsewhere)
      return location.origin + '/tasks/' + encodeURIComponent(taskId);
    }

    function formatHistoryDate(dateStr) {
      if (!dateStr) return '';
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const [year, month, day] = parts;
        return day + '/' + month + '/' + year;
      }
      return dateStr;
    }

    function formatExpectedDate(dateStr) {
      if (!dateStr) return '';
      // Convert YYYY-MM-DD to DD/MM/YYYY format
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const [year, month, day] = parts;
        return 'צפי: ' + day + '/' + month + '/' + year;
      }
      return 'צפי: ' + dateStr;
    }

    /**
     * Format frequency text from avg_gap_days and n_orders
     * Handles edge cases: too few orders, zero/negative gaps, etc.
     * @param {number|null} avgGapDays - Average gap in days
     * @param {number} nOrders - Total number of orders
     * @returns {string|null} - Formatted frequency text or null if should not display
     */
    function formatFrequency(avgGapDays, nOrders) {
      const gap = avgGapDays !== null && avgGapDays !== undefined ? Number(avgGapDays) : null;
      const orders = Number(nOrders) || 0;

      // Not enough history → don't show frequency
      if (!Number.isFinite(gap) || gap <= 0 || orders < 3) {
        return null; // Don't display anything
      }

      // Round to nearest day
      const rounded = Math.round(gap);

      // Special case: 1 day → "approximately every day"
      if (rounded === 1) {
        return 'בערך כל יום';
      }

      return `כל ${rounded} ימים`;
    }

    /**
     * Helper: Parse date value from string
     */
    function parseDateValue(val) {
      if (!val) return null;
      const d = new Date(val);
      return Number.isNaN(d.getTime()) ? null : d;
    }

    /**
     * Get date range for a given range key
     */
    // Helper: המרה בטוחה לתאריך YYYY-MM-DD (לוקאלי)
    function toISODate(date) {
      if (!date) return null;
      const offset = date.getTimezoneOffset() * 60000;
      return new Date(date.getTime() - offset).toISOString().slice(0, 10);
    }

    // Parse date as LOCAL date (avoid UTC shift)
    function tmcParseISODateLocal(input) {
      if (!input) return null;
      const s = String(input).trim();
      const mIso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
      if (mIso) {
        const y = Number(mIso[1]);
        const mo = Number(mIso[2]) - 1;
        const d = Number(mIso[3]);
        return new Date(y, mo, d, 0, 0, 0, 0);
      }
      const mDmy = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
      if (mDmy) {
        const d = Number(mDmy[1]);
        const mo = Number(mDmy[2]) - 1;
        const y = Number(mDmy[3]);
        return new Date(y, mo, d, 0, 0, 0, 0);
      }
      const dt = new Date(s);
      if (Number.isNaN(dt.getTime())) return null;
      return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), 0, 0, 0, 0);
    }

    function tmcEndOfLocalDay(d) {
      if (!d) return null;
      const x = new Date(d.getTime());
      x.setHours(23, 59, 59, 999);
      return x;
    }

    // פונקציית עזר לחישוב טווח בודד
    function getSingleRange(key) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const start = new Date(today);
      const end = new Date(today);

      switch (key) {
        case 'היום':
          return { from: start, to: end };
        case 'אתמול':
          start.setDate(today.getDate() - 1);
          end.setDate(today.getDate() - 1);
          return { from: start, to: end };
        case 'מחר':
          start.setDate(today.getDate() + 1);
          end.setDate(today.getDate() + 1);
          return { from: start, to: end };
        case 'השבוע':
          const day = today.getDay(); // 0 = Sunday
          start.setDate(today.getDate() - day);
          end.setDate(today.getDate() + (6 - day));
          return { from: start, to: end };
        case 'השבוע הבא':
        case 'שבוע הבא':
          const dayNext = today.getDay();
          start.setDate(today.getDate() - dayNext + 7);
          end.setDate(today.getDate() + (6 - dayNext) + 7);
          return { from: start, to: end };
        case 'החודש':
          start.setDate(1);
          end.setMonth(today.getMonth() + 1);
          end.setDate(0);
          return { from: start, to: end };
        case 'החודש הקודם':
          start.setMonth(today.getMonth() - 1);
          start.setDate(1);
          end.setDate(0); 
          return { from: start, to: end };
        case 'החודש הבא':
          start.setMonth(today.getMonth() + 1);
          start.setDate(1);
          end.setMonth(start.getMonth() + 1);
          end.setDate(0);
          return { from: start, to: end };
        case 'כל הפתוחים':
          start.setDate(today.getDate() - 180);
          end.setDate(today.getDate() + 365);
          return { from: start, to: end };
        default:
          return null;
      }
    }

    // הפונקציה הראשית שמחשבת איחוד של טווחים (תומכת במערך של בחירות)
    function getDateRange(keysInput) {
      // אם התקבל ערך בודד, המר למערך
      let keys = Array.isArray(keysInput) ? keysInput : [keysInput];
      // תמיכה במחרוזת עם פסיקים ("השבוע, השבוע הבא")
      if (typeof keysInput === 'string' && keysInput.includes(',')) {
        keys = keysInput.split(',').map(k => k.trim()).filter(Boolean);
      }
      if (!keys.length) return null;

      let minDate = null;
      let maxDate = null;

      keys.forEach(key => {
        const r = getSingleRange(key);
        if (r) {
          if (!minDate || r.from < minDate) minDate = r.from;
          if (!maxDate || r.to > maxDate) maxDate = r.to;
        }
      });

      if (!minDate || !maxDate) return null;
      return { from: toISODate(minDate), to: toISODate(maxDate) };
    }

    // שמירה על הפונקציה הישנה לתאימות לאחור (אם יש שימושים נוספים)
    function getDateRangeForKey(key) {
      const range = getDateRange(key);
      if (!range) return null;
      // המרה חזרה לאובייקטי Date לתאימות
      const from = tmcParseISODateLocal(range.from);
      const to = tmcEndOfLocalDay(tmcParseISODateLocal(range.to));
      if (!from || !to) return null;
      return {
        from,
        to
      };
    }

    function getPlanningRange(state) {
      if (!state) return null;
      const hasCustom =
        state.dateRangeKey === 'טווח מותאם אישית' ||
        (Array.isArray(state.dateRangeKeys) && state.dateRangeKeys.includes('טווח מותאם אישית'));

      if (hasCustom) {
        const from = tmcParseISODateLocal(state?.dateFrom);
        const to = tmcEndOfLocalDay(tmcParseISODateLocal(state?.dateTo));
        if (!from || !to) return null;
        return { from, to };
      }

      // "כל הפתוחים" = טווח רחב (-180 .. +365) כדי שה-RPC יקבל תאריכים ויחזיר את כל התחזיות הפתוחות.
      const isAllOpenKey =
        state.dateRangeKey === 'כל הפתוחים' ||
        (Array.isArray(state.dateRangeKeys) && state.dateRangeKeys.includes('כל הפתוחים'));
      if (isAllOpenKey) {
        const r = getDateRange('כל הפתוחים');
        if (r?.from && r?.to) {
          const from = tmcParseISODateLocal(r.from);
          const to = tmcEndOfLocalDay(tmcParseISODateLocal(r.to));
          if (from && to) return { from, to };
        }
      }

      const keyInput =
        Array.isArray(state.dateRangeKeys) && state.dateRangeKeys.length
          ? state.dateRangeKeys
          : state.dateRangeKey;
      const r = getDateRange(keyInput);
      if (!r?.from || !r?.to) return null;
      const from = tmcParseISODateLocal(r.from);
      const to = tmcEndOfLocalDay(tmcParseISODateLocal(r.to));
      if (!from || !to) return null;
      return { from, to };
    }

    // Predicate אחד לכל מקום: דרילדאון, "מתי צפוי", "כמה להזמין"
    function isActiveStatus(r) {
      const s = String(r?.status || '').trim();
      return s === 'due_or_late' || s === 'soon' || s === 'not_yet';
    }
    function isAllOpenMode(opts, range) {
      return (
        opts?.dateRangeKey === 'כל הפתוחים' ||
        (Array.isArray(opts?.dateRangeKeys) && opts.dateRangeKeys.includes('כל הפתוחים')) ||
        !range
      );
    }
    function normalizeForecastStatus(row) {
      const status = String(row?.status || '').trim();
      if (status === 'insufficient_history') return status;
      if (status === 'due_or_late' || status === 'soon' || status === 'not_yet') return status;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const d = row?.next_expected_date ? new Date(row.next_expected_date) : null;
      if (!d || Number.isNaN(d.getTime())) return status || 'insufficient_history';
      d.setHours(0, 0, 0, 0);
      const diffDays = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays <= 0) return 'due_or_late';
      if (diffDays <= 7) return 'soon';
      return 'not_yet';
    }
    function rowPassesPlanningFilter(r, opts, range) {
      const allOpen = isAllOpenMode(opts, range);
      if (allOpen) return true;  // במצב "כל הפתוחים", לא מסננים לפי סטטוס או טווח
      if (!isActiveStatus(r)) return false;

      // Guard: if range is invalid, do not show anything
      if (!range || !range.from || !range.to) return false;

      const iso =
        r?.due_date ||
        r?.next_expected_date ||
        r?.next_expected_date_iso ||
        r?.expected_date ||
        r?.first_expected_date ||
        r?.last_expected_date;
      const d = tmcParseISODateLocal(iso);
      if (!d) return false;
      return d >= range.from && d <= range.to;
    }

    function tmcFilterRowsToPlanningRange(rows, opts, range, label) {
      if (!Array.isArray(rows) || !rows.length || !range) return rows || [];
      const filtered = rows.filter(r => rowPassesPlanningFilter(r, opts, range));
      const dropped = rows.length - filtered.length;
      if (dropped > 0) {
        console.warn('[RangeGuard] filtered out-of-range rows:', label, {
          dropped,
          kept: filtered.length,
          from: toISODate(range.from),
          to: toISODate(range.to)
        });
      }
      return filtered;
    }

    const FORECAST_MIN_ORDERS = 3;

    function getForecastMinOrders(row) {
      const candidates = [
        row?.min_n_orders,
        row?.min_orders,
        row?.min_n_orders_recent,
        row?.min_orders_recent,
        row?.min_n_orders_open,
        row?.min_orders_open,
        row?.min_n_orders_active,
        row?.min_orders_active,
        row?.min_n_orders_forecast,
        row?.min_orders_forecast,
        row?.n_orders_min,
        row?.n_orders,
        row?.min_orders,
        row?.min_n_orders,
        row?.min_total_orders,
        row?.total_orders
      ];
      for (const v of candidates) {
        const n = Number(v);
        if (Number.isFinite(n)) return n;
      }
      return null;
    }

    function getForecastMaxOrders(row) {
      const candidates = [
        row?.max_n_orders,
        row?.max_orders,
        row?.max_n_orders_recent,
        row?.max_orders_recent,
        row?.max_n_orders_open,
        row?.max_orders_open,
        row?.max_n_orders_active,
        row?.max_orders_active,
        row?.max_n_orders_forecast,
        row?.max_orders_forecast,
        row?.n_orders_max,
        row?.max_orders,
        row?.max_n_orders,
        row?.max_total_orders,
        row?.total_orders
      ];
      for (const v of candidates) {
        const n = Number(v);
        if (Number.isFinite(n)) return n;
      }
      return null;
    }

    /**
     * Get filtered and sorted product rows based on current state
     */
    function getFilteredAndSortedProductRows(state) {
      const range = getPlanningRange(state);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let rows = forecastProductRows.slice();

      rows = rows.filter(row => {
        // סינון ראשוני: Exclude פריטים פסולים (מתנה, מועדון, משלוח, מק"טים אסורים)
        const _skuDigits = normalizeDigits(row.sku);
        const _barcodeDigits = normalizeDigits(row.barcode);

        // סינון ראשוני: Exclude פריטים פסולים (מתנה, מועדון, משלוח, מק"טים/ברקודים אסורים)
        if (isItemExcluded(_skuDigits, row.product_name) || (_barcodeDigits && isItemExcluded(_barcodeDigits, row.product_name))) {
          return false;
        }

        // סינון: במצב cycle, דרוש qty חיובי – אבל "כמה להזמין" מגיע מ־summary
        // (forecast_product_summary_by_range), לא מ־qty_within_cycle. לכן מאפשרים qty=0/null –
        // החסימה תיעשה בשלב העשרת ה־summary (רק מוצרים עם תחזית אמיתית יוצגו).
        // (הוסר: if (qtyForFilter <= 0) return false)

        // סינון: תחזיות עם היסטוריה חלשה (נ_orders <= 2) לא נכנסות לצפי
        const minOrders = getForecastMinOrders(row);
        const maxOrders = getForecastMaxOrders(row);
        if (maxOrders !== null && maxOrders < FORECAST_MIN_ORDERS) {
          return false;
        }
        if (maxOrders === null && minOrders !== null && minOrders < FORECAST_MIN_ORDERS) {
          return false;
        }

        // סינון לפי ספק (state.supplierKey)
        const supplierKey = state.supplierKey || '__ALL__';
        if (supplierKey !== '__ALL__') {
          const s = String(row.supplier || '').trim();
          if (supplierKey === '__UNKNOWN__') {
            if (s) return false;
          } else {
            if (s !== supplierKey) return false;
          }
        }

        // חישוב חלון תאריכים – עדיפות לשדות cycle (first/last_due_date), אחרת fallback לשדות ישנים
        const firstDate = parseDateValue(row.first_due_date) ||
                          parseDateValue(row.next_expected_date) ||
                          parseDateValue(row.first_expected_date);
        const lastDate = parseDateValue(row.last_due_date) ||
                         parseDateValue(row.next_expected_date) ||
                         parseDateValue(row.last_expected_date);

        // סינון לפי טווח תאריכים (אם יש range)
        if (range) {
          const start = firstDate ? new Date(firstDate) : null;
          const end = lastDate ? new Date(lastDate) : null;
          if (start) start.setHours(0, 0, 0, 0);
          if (end) end.setHours(0, 0, 0, 0);

          if (start && end) {
            if (end < range.from || start > range.to) return false;
          } else if (start) {
            if (start < range.from || start > range.to) return false;
          } else if (end) {
            if (end < range.from || end > range.to) return false;
          }
        }

        return true;
      });

      // REMOVED SEARCH FILTER LOGIC HERE

      // מיון לפי state.sortBy
      const sortBy = state.sortBy || 'forecasts';
      
      rows.sort((a, b) => {
        if (sortBy === 'forecasts') {
          // מיון לפי כמות תחזיות (פתוחות)
          const aForecasts = a.n_open || a.n_customer_forecasts || 0;
          const bForecasts = b.n_open || b.n_customer_forecasts || 0;
          return bForecasts - aForecasts;
        } else if (sortBy === 'customers') {
          // מיון לפי כמות לקוחות
          const aCustomers = a.n_customers || 0;
          const bCustomers = b.n_customers || 0;
          return bCustomers - aCustomers;
        } else if (sortBy === 'date') {
          // מיון לפי תאריך התחזית הקרוב
          const da = parseDateValue(a.first_expected_date) ||
                     parseDateValue(a.last_expected_date);
          const db = parseDateValue(b.first_expected_date) ||
                     parseDateValue(b.last_expected_date);

          if (!da && !db) return 0;
          if (!da) return 1;
          if (!db) return -1;

          const dateA = new Date(da);
          const dateB = new Date(db);
          dateA.setHours(0, 0, 0, 0);
          dateB.setHours(0, 0, 0, 0);

          // מיון לפי תאריך קרוב יותר (הכי קרוב קודם)
          const diffA = Math.abs(dateA.getTime() - today.getTime());
          const diffB = Math.abs(dateB.getTime() - today.getTime());

          return diffA - diffB;
        }
        
        // ברירת מחדל - מיון לפי תאריך
        return 0;
      });

      return rows;
    }

    /**
     * פונקציית עזר ל-GM_xmlhttpRequest עם Promise
     */
    function GM_xmlhttpRequestPromise(details) {
      return new Promise((resolve, reject) => {
        if (typeof GM_xmlhttpRequest !== 'undefined') {
          GM_xmlhttpRequest({
            ...details,
            onload: resolve,
            onerror: reject
          });
        } else {
          // Fallback ל-fetch אם GM_xmlhttpRequest לא זמין
          fetch(details.url, {
            method: details.method || 'GET',
            headers: details.headers || {},
            body: details.data || null
          })
            .then(res => res.text())
            .then(text => resolve({ responseText: text, status: 200 }))
            .catch(reject);
        }
      });
    }

    // REMOVED: openForecastProductDrilldown - כל ה-click handlers עכשיו קוראים ישירות ל-unsafeWindow.openProductDrilldown
    // זה מונע בעיות של event handlers שמחזיקים רפרנס לפונקציה ישנה

    /**
     * פונקציית עזר למצב ריק (משותפת)
     */
    function renderEmptyState(container) {
      container.innerHTML = `
        <div class="tmc-empty-state" style="text-align:center; padding:40px; color:#666;">
          <i class="fa-light fa-box-open" style="font-size: 48px; margin-bottom: 10px; opacity: 0.3; display: block;"></i>
          <p style="margin: 0;">לא נמצאו מוצרים עם תחזיות פעילות בטווח שנבחר.</p>
        </div>
      `;
    }

    /**
     * Render "signal bars" for priority_level (0–4).
     * RTL note: bar 1 (lowest) is on the RIGHT, bar 4 (highest) on the LEFT.
     * @param {number|null|undefined} priorityLevel
     * @returns {string} HTML
     */
    function renderPriorityBars(priorityLevel) {
      const lvl = Math.max(0, Math.min(4, Number(priorityLevel) || 0));
      const isActive = (n) => (lvl >= n ? 'active' : '');
      return `
        <div class="tmc-priority-bars" data-level="${lvl}" title="עדיפות: ${lvl}/4">
          <span class="bar h1 ${isActive(1)}"></span>
          <span class="bar h2 ${isActive(2)}"></span>
          <span class="bar h3 ${isActive(3)}"></span>
          <span class="bar h4 ${isActive(4)}"></span>
        </div>
      `;
    }

    // -------------------------
    // Forecast UI helpers (cycle view)
    // -------------------------
    function tmcFmtShortDate(v) {
      if (!v) return '';
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) return '';
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      return `${dd}/${mm}`;
    }

    // -----------------------------
    // "מתי צפוי" (ELI5) helpers
    // -----------------------------

    const TMC_DAY_NAMES_HE = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
    const TMC_NEXT_SUFFIX_BY_DOW = ['הבא','הבא','הבא','הבא','הבא','הבא','הבאה']; // שבת = הבאה

    function tmcStartOfWeekSunday(d) {
      const x = new Date(d);
      x.setHours(0, 0, 0, 0);
      const day = x.getDay(); // 0 = Sunday
      x.setDate(x.getDate() - day);
      return x;
    }

    function tmcIsSameWeekSunday(a, b) {
      return tmcStartOfWeekSunday(a).getTime() === tmcStartOfWeekSunday(b).getTime();
    }

    function tmcIsNextWeekSunday(d, now) {
      const wNow = tmcStartOfWeekSunday(now).getTime();
      const wD = tmcStartOfWeekSunday(d).getTime();
      return wD === (wNow + 7 * 24 * 60 * 60 * 1000);
    }

    function tmcFmtDDMM(dateLike) {
      if (!dateLike) return '';
      try {
        const d =
          dateLike instanceof Date
            ? dateLike
            : new Date(String(dateLike).slice(0, 10) + 'T00:00:00');
        if (Number.isNaN(d.getTime())) return '';
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        return `${dd}/${mm}`;
      } catch {
        return '';
      }
    }

    function tmcHumanizeWhenToken(dateStr) {
      const then = tmcAsDate(dateStr);
      if (!then) return '';

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      then.setHours(0, 0, 0, 0);

      const diffDays = Math.round((then - today) / (1000 * 60 * 60 * 24));

      // Very close → words
      if (diffDays === 0) return 'היום';
      if (diffDays === 1) return 'מחר';
      if (diffDays === 2) return 'מחרתיים';
      if (diffDays === -1) return 'אתמול';
      if (diffDays < 0 && diffDays >= -7) return `לפני ${Math.abs(diffDays)} ימים`;

      // Medium range → day name (and "הבא/הבאה" if next week)
      if (diffDays > 2 && diffDays <= 13) {
        const dow = then.getDay();
        const name = TMC_DAY_NAMES_HE[dow] || '';
        if (!name) return tmcFmtDDMM(then);

        if (tmcIsNextWeekSunday(then, today)) {
          const suffix = TMC_NEXT_SUFFIX_BY_DOW[dow] || 'הבא';
          return `${name} ${suffix}`;
        }
        // Same week → just the day name
        if (tmcIsSameWeekSunday(then, today)) {
          return name;
        }
        // Beyond next week but still in 13 days → keep it simple: show DD/MM
        return tmcFmtDDMM(then);
      }

      // Far → DD/MM
      return tmcFmtDDMM(then);
    }

    function tmcNormalizeISODateLocal(val) {
      if (!val) return null;
      const d = new Date(val);
      if (Number.isNaN(d.getTime())) return null;
      d.setHours(0, 0, 0, 0);
      return toISODate(d); // YYYY-MM-DD (local)
    }

    function tmcUniqueSortedIsoDates(vals) {
      const set = new Set();
      for (const v of vals || []) {
        const iso = tmcNormalizeISODateLocal(v);
        if (iso) set.add(iso);
      }
      const arr = Array.from(set);
      arr.sort((a, b) => new Date(a) - new Date(b));
      return arr;
    }

    function tmcSummarizeWhenDates(isoDates, maxShow) {
      const dates = Array.isArray(isoDates) ? isoDates : [];
      const maxN = Number.isFinite(maxShow) ? Math.max(1, maxShow) : 3;

      if (!dates.length) return '';

      const shown = dates.slice(0, maxN).map(d => tmcHumanizeWhenToken(d)).filter(Boolean);
      const remaining = Math.max(0, dates.length - shown.length);

      if (!shown.length) return '';

      return remaining > 0 ? `${shown.join(', ')} ועוד ${remaining}` : shown.join(', ');
    }

    async function tmcComputeWhenSummaryForSku(sku, state, row = null) {
      const normalizedSku = tmcNormalizeDigits(sku);
      if (!normalizedSku) return { summary: '', qty: null };

      const dateKey = Array.isArray(state?.dateRangeKeys)
        ? state.dateRangeKeys.join(', ')
        : (state?.dateRangeKey || '');
      const cacheKey = `${normalizedSku}::${dateKey}::${state?.dateFrom || ''}::${state?.dateTo || ''}`;
      const nowTs = Date.now();
      const cacheDisabled = tmcGetFlag('TMC_DISABLE_WHEN_CACHE') === true;

      const cached = cacheDisabled ? null : FORECAST_WHEN_SUMMARY_CACHE.get(cacheKey);
      if (cached && (nowTs - cached.ts) < FORECAST_WHEN_SUMMARY_TTL_MS) {
        return cached.value || { summary: '', qty: null };
      }

      // Pull per-customer rows – predicate אחד: אותו filtered ל"מתי צפוי" ול"כמה להזמין"
      let rows = [];
      try {
        const aliases = [];
        if (row?.sku) aliases.push(String(row.sku).trim());
        if (row?.barcode) aliases.push(String(row.barcode).trim());
        rows = await tmcFetchCustomerForecastBySku(normalizedSku, { ...state, skuAliases: aliases });
      } catch (e) {
        console.warn('[Forecast] failed to fetch per-customer forecast for when-summary', normalizedSku, e);
        rows = [];
      }

      const range = getPlanningRange(state);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const filtered = tmcFilterRowsToPlanningRange(
        (rows || []).map(r => ({ ...r, status: normalizeForecastStatus(r) })),
        state,
        range,
        'when-summary'
      );

      // רק שורות שתורמות כמות (last_quantity מספרי וחיובי) – בסיס משותף ל"מתי צפוי" ו"כמה להזמין"
      const contributing = (filtered || []).filter(r => {
        const q = Number(r?.last_quantity);
        return Number.isFinite(q) && q > 0;
      });

      if (tmcGetFlag('TMC_DEBUG_SKU') && tmcNormalizeDigits(normalizedSku) === tmcNormalizeDigits(String(tmcGetFlag('TMC_DEBUG_SKU')))) {
        const qVals = filtered.map(r => Number(r.last_quantity));
        const nFinite = qVals.filter(x => Number.isFinite(x)).length;
        const nPos = qVals.filter(x => Number.isFinite(x) && x > 0).length;
        const sumFiltered = qVals.reduce((a, x) => a + (Number.isFinite(x) ? x : 0), 0);
        const dates = filtered.map(r => (r.next_expected_date ? String(r.next_expected_date).slice(0, 10) : null)).filter(Boolean);
        const uniqDates = Array.from(new Set(dates)).sort();
        console.log('[DBG SKU]', normalizedSku, {
          rowsN: filtered.length,
          contributingN: contributing.length,
          datesN: dates.length,
          uniqDatesN: uniqDates.length,
          nFiniteLastQty: nFinite,
          nPosLastQty: nPos,
          sumLastQty: sumFiltered,
          sampleLastQty: qVals.slice(0, 10),
          sampleDates: uniqDates.slice(0, 10),
        });
      }

      const allIsoFromContributing = tmcUniqueSortedIsoDates(
        contributing
          .map(r => r.next_expected_date)
          .filter(Boolean)
          .map(tmcNormalizeISODateLocal)
          .filter(Boolean)
      );
      const overdueRecentIsoDates = tmcUniqueSortedIsoDates(
        allIsoFromContributing.filter(iso => {
          const d = new Date(iso);
          d.setHours(0, 0, 0, 0);
          return d < today;
        })
      );
      const upcomingIsoDates = tmcUniqueSortedIsoDates(
        allIsoFromContributing.filter(iso => {
          const d = new Date(iso);
          d.setHours(0, 0, 0, 0);
          return d >= today;
        })
      );

      const summaryUpc = tmcSummarizeWhenDates(upcomingIsoDates, 3);
      const summaryOvd = tmcSummarizeWhenDates(overdueRecentIsoDates, 3) || (overdueRecentIsoDates.length ? 'חריגים' : '');
      const summary = [summaryOvd, summaryUpc].filter(Boolean).join(', ') || '';

      const qty = contributing.reduce((acc, r) => acc + Number(r.last_quantity), 0);

      const allDates = [...new Set([...overdueRecentIsoDates, ...upcomingIsoDates])].sort();
      const earliestIso = allDates.length ? allDates[0] : null;
      let urgencyTier = 0;
      if (earliestIso) {
        const d = new Date(earliestIso);
        d.setHours(0, 0, 0, 0);
        const diffDays = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays < 0) urgencyTier = 3;
        else if (diffDays <= 7) urgencyTier = 2;
        else urgencyTier = 1;
      }
      const qtyNum = Number.isFinite(qty) && qty > 0 ? qty : 0;
      const priorityScore = urgencyTier * 50 + qtyNum;
      const value = { summary, qty: qtyNum ? qty : null, earliestDate: earliestIso, priorityScore, overdueDates: overdueRecentIsoDates, upcomingDates: upcomingIsoDates };
      if (!cacheDisabled) FORECAST_WHEN_SUMMARY_CACHE.set(cacheKey, { ts: nowTs, value });
      return value;
    }

      const SUMMARY_RPC_BATCH = 120;
      const MAX_SKUS_FOR_SUMMARY = 500;

      /** טוען ציון אמינות (תחזית שהתגשמה/פוספסה) לפי SKU – ל-badge בטבלה */
      async function tmcFetchSkuReliabilityMap(skus) {
        if (!Array.isArray(skus) || skus.length === 0) return new Map();
        try {
          const rows = await supaRestFetch(
            `/rest/v1/v_sku_reliability?select=sku,fulfilled_cnt,missed_cnt&limit=5000`,
            { method: 'GET' }
          );
          if (!Array.isArray(rows)) return new Map();
          const map = new Map();
          for (const r of rows) {
            const sku = tmcNormalizeDigits(r?.sku);
            if (!sku) continue;
            map.set(sku, {
              fulfilled_cnt: Number(r?.fulfilled_cnt) || 0,
              missed_cnt: Number(r?.missed_cnt) || 0
            });
          }
          return map;
        } catch (e) {
          if (LW_ORDERS_CONFIG.DEBUG) console.warn('[Forecast] v_sku_reliability not available:', e?.message || e);
          return new Map();
        }
      }

      async function tmcFetchSummaryMapFromRpc(state, skus) {
      const range = getPlanningRange(state);
      if (!range) return null;
      const dateFrom = toISODate(range.from);
      const dateTo = toISODate(range.to);
      if (!dateFrom || !dateTo) return null;

      const limited = skus.slice(0, MAX_SKUS_FOR_SUMMARY);
      const rpcPath = '/rest/v1/rpc/forecast_product_summary_by_range_active_v2';
      const __minOrders = (typeof FORECAST_MIN_ORDERS === 'number' ? FORECAST_MIN_ORDERS : 3);
      const allData = [];
      try {
        for (let i = 0; i < limited.length; i += SUMMARY_RPC_BATCH) {
          const chunk = limited.slice(i, i + SUMMARY_RPC_BATCH);
          const data = await supaRestFetch(rpcPath, {
            method: 'POST',
            body: {
              p_date_from: dateFrom,
              p_date_to: dateTo,
              p_skus: chunk.length ? chunk : null,
              p_min_orders: __minOrders
            }
          });
          if (Array.isArray(data)) allData.push(...data);
        }
      } catch (e) {
        console.warn('[Forecast] RPC forecast_product_summary_by_range failed, using client-side fallback:', e?.message || e);
        return null;
      }
      if (!allData.length) return new Map();
      const data = allData;

      const map = new Map();
      for (const row of data) {
        const sku = tmcNormalizeDigits(row?.sku);
        if (!sku) continue;
        const qty = (row?.qty_to_order != null && !Number.isNaN(Number(row.qty_to_order)))
          ? Number(row.qty_to_order) : null;
        let upc = [];
        let ovd = [];
        try {
          if (row?.upcoming_dates && Array.isArray(row.upcoming_dates)) upc = row.upcoming_dates;
          else if (row?.upcoming_dates) upc = JSON.parse(JSON.stringify(row.upcoming_dates));
        } catch {}
        try {
          if (row?.overdue_dates && Array.isArray(row.overdue_dates)) ovd = row.overdue_dates;
          else if (row?.overdue_dates) ovd = JSON.parse(JSON.stringify(row.overdue_dates));
        } catch {}
        const upcomingIsoRaw = (upc || []).map(d => (typeof d === 'string' ? d : (d && d.toISOString ? d.toISOString().slice(0, 10) : null))).filter(Boolean);
        const overdueIsoRaw = (ovd || []).map(d => (typeof d === 'string' ? d : (d && d.toISOString ? d.toISOString().slice(0, 10) : null))).filter(Boolean);
        // dedupe פעם אחת
        const upcomingIso = tmcUniqueSortedIsoDates(upcomingIsoRaw);
        const overdueIso = tmcUniqueSortedIsoDates(overdueIsoRaw);

        // RPC לפעמים מחזיר תאריכים מחוץ לטווח. מקצצים לטווח הנבחר כדי ש"מתי צפוי" יתאים ל־UI.
        const from = new Date(range.from);
        const to = new Date(range.to);
        from.setHours(0, 0, 0, 0);
        to.setHours(0, 0, 0, 0);
        const isoInRange = (iso) => {
          if (!iso) return false;
          const d = new Date(iso);
          if (Number.isNaN(d.getTime())) return false;
          d.setHours(0, 0, 0, 0);
          return d >= from && d <= to;
        };
        const upcomingIsoInRange = (upcomingIso || []).filter(isoInRange);
        // ✅ overdue לא מקוצץ לטווח (השרת כבר מחזיר overdue "רלוונטי" – למשל 365 יום אחורה)
        const overdueIsoRecent = (overdueIso || []);

        const summaryUpc = tmcSummarizeWhenDates(tmcUniqueSortedIsoDates(upcomingIsoInRange), 3);
        const summaryOvd = tmcSummarizeWhenDates(tmcUniqueSortedIsoDates(overdueIsoRecent), 3);
        const summary = [summaryOvd, summaryUpc].filter(Boolean).join(', ') || '';
        const allDates = [...overdueIsoRecent, ...upcomingIsoInRange].filter(Boolean);
        const earliestIso = allDates.length ? allDates.slice().sort()[0] : null;
        let urgencyTier = 0;
        if (earliestIso) {
          const d = new Date(earliestIso);
          d.setHours(0, 0, 0, 0);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const diffDays = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays < 0) urgencyTier = 3;
          else if (diffDays <= 7) urgencyTier = 2;
          else urgencyTier = 1;
        }
        const qtyNum = (qty != null && qty > 0) ? Number(qty) : 0;
        const nOrdersSum = (row?.n_orders_sum != null && !Number.isNaN(Number(row.n_orders_sum))) ? Number(row.n_orders_sum) : 0;
        const nForecasts = (row?.n_forecasts != null && !Number.isNaN(Number(row.n_forecasts))) ? Number(row.n_forecasts) : 0;
        const priorityScore = urgencyTier * 50 + qtyNum;
        let customerNames = [];
        if (Array.isArray(row.customer_names)) {
          customerNames = row.customer_names.map(n => String(n || '').trim()).filter(Boolean);
        } else if (row.customer_names && typeof row.customer_names === 'string') {
          try {
            const p = JSON.parse(row.customer_names);
            if (Array.isArray(p)) customerNames = p.map(n => String(n || '').trim()).filter(Boolean);
          } catch (_) {}
        }
        const entry = {
          summary,
          qty: qtyNum ? qtyNum : null,
          earliestDate: earliestIso,
          priorityScore,
          overdueDates: tmcUniqueSortedIsoDates(overdueIsoRecent),
          upcomingDates: tmcUniqueSortedIsoDates(upcomingIsoInRange),
          nOrdersSum,
          nForecasts,
          customerNames
        };
        if (tmcGetFlag('TMC_DEBUG_SKU') && tmcNormalizeDigits(sku) === tmcNormalizeDigits(String(tmcGetFlag('TMC_DEBUG_SKU')))) {
          console.log('[DBG SKU]', sku, 'upcomingRaw=', upcomingIsoRaw.length, 'upcomingUniq=', upcomingIso.length, 'overdueRaw=', overdueIsoRaw.length, 'overdueUniq=', overdueIso.length, 'qty=', qtyNum, 'range=', { dateFrom, dateTo });
        }
        map.set(sku, entry);
        const cat = getCatalogForSku(sku);
        if (cat?.barcode && cat.barcode !== sku) map.set(cat.barcode, entry);
      }
      return map;
    }

      async function tmcComputeWhenSummaryMap(rows, state) {
      const skuToRow = new Map();
      (rows || []).forEach(r => {
        const sku = tmcNormalizeDigits(r.sku);
        if (sku && !skuToRow.has(sku)) skuToRow.set(sku, r);
      });
      const skus = Array.from(skuToRow.keys());
      const resultMap = new Map();
      if (!skus.length) return resultMap;

      const range = getPlanningRange(state);
      const dateFrom = range ? toISODate(range.from) : null;
      const dateTo = range ? toISODate(range.to) : null;
      if (dateFrom && dateTo) {
        const t0 = performance.now();
        loadCatalogCacheOnce();
        const skusExpanded = new Set(skus);
        for (const s of skus) {
          const cat = getCatalogForSku(s);
          if (cat?.barcode && cat.barcode !== s) skusExpanded.add(cat.barcode);
          if (cat?.sku && cat.sku !== s) skusExpanded.add(cat.sku);
        }
        const skusLimited = Array.from(skusExpanded).slice(0, MAX_SKUS_FOR_SUMMARY);
        if (skusExpanded.size > MAX_SKUS_FOR_SUMMARY) {
          console.log(`[Forecast] Capping to ${MAX_SKUS_FOR_SUMMARY} SKUs (had ${skusExpanded.size})`);
        }
        const disableServerSummary = tmcFlagOn('TMC_DISABLE_SERVER_SUMMARY') || tmcFlagOn('TMC_FORCE_CLIENT_SUMMARY');
        if (disableServerSummary) {
          console.log('[Forecast] Server-side summary disabled via flag');
        }

        let serverMap = null;
        if (!disableServerSummary) {
          serverMap = await tmcFetchSummaryMapFromRpc(state, skusLimited);
        }

        if (serverMap && serverMap.size > 0) {
          skus.forEach(sku => {
            const entry = serverMap.get(sku) || { summary: '', qty: null, priorityScore: 0, earliestDate: null, overdueDates: [], upcomingDates: [], nOrdersSum: 0, nForecasts: 0, customerNames: [] };
            resultMap.set(sku, entry);
          });
          try {
            const relMap = await tmcFetchSkuReliabilityMap([...resultMap.keys()]);
            const RELIABILITY_FULFILLED_BONUS = 10;
            const RELIABILITY_MISSED_PENALTY = 10;
            for (const [sku, entry] of resultMap) {
              const rel = relMap.get(sku) || { fulfilled_cnt: 0, missed_cnt: 0 };
              entry.priorityScore = (entry.priorityScore || 0) + (rel.fulfilled_cnt * RELIABILITY_FULFILLED_BONUS) - (rel.missed_cnt * RELIABILITY_MISSED_PENALTY);
            }
          } catch (e) { if (LW_ORDERS_CONFIG.DEBUG) console.warn('[Forecast] reliability enrichment failed:', e); }
          console.log(`[Forecast] Server-side summary: ${serverMap.size} SKUs in ${Math.round(performance.now() - t0)}ms`);

          // DEBUG: כפיית חישוב קליינט־סייד ל־SKU ספציפי כדי להשוות ל־RPC (לראות אם השרת "משקר").
          try {
            const dbgFlagRaw = tmcGetFlag('TMC_DEBUG_SKU');
            const dbgSku = dbgFlagRaw ? tmcNormalizeDigits(String(dbgFlagRaw)) : null;
            if (dbgSku) {
              console.log('[Forecast][DEBUG] TMC_DEBUG_SKU active:', dbgSku, '(from URL/flag)');
              const local = await tmcComputeWhenSummaryForSku(dbgSku, state);
              const server = resultMap.get(dbgSku) || null;
              if (resultMap.has(dbgSku)) {
                if (local) {
                  console.log('[Forecast][DEBUG] Override server summary for SKU:', dbgSku, { server, local });
                  resultMap.set(dbgSku, local);
                } else {
                  console.log('[Forecast][DEBUG] No local summary for SKU:', dbgSku, { server });
                }
              } else {
                console.log('[Forecast][DEBUG] SKU not in table (not in server list). Local summary:', dbgSku, { local, server: server || 'N/A' });
                if (local) resultMap.set(dbgSku, local);
              }
            }
          } catch (e) {
            console.warn('[Forecast][DEBUG] TMC_DEBUG_SKU error:', e);
          }

          return resultMap;
        }
      }

      const CONCURRENCY = 4;
      const MAX_FALLBACK_SKUS = 150;
      const fallbackSkus = skus.slice(0, MAX_FALLBACK_SKUS);
      let idx = 0;
      const worker = async () => {
        let processed = 0;
        while (idx < fallbackSkus.length) {
          const sku = fallbackSkus[idx++];
          try {
            const value = await tmcComputeWhenSummaryForSku(sku, state);
            if (value) {
              resultMap.set(sku, value);
            } else {
              resultMap.set(sku, { summary: '', qty: null, priorityScore: 0, overdueDates: [], upcomingDates: [], nOrdersSum: 0, nForecasts: 0, customerNames: [] });
            }
          } catch (e) {
            resultMap.set(sku, { summary: '', qty: null });
          }
          processed++;
          if (processed % 8 === 0) { try { await lwYieldToMain(); } catch {} }
        }
      };
      const workers = [];
      for (let i = 0; i < CONCURRENCY; i++) workers.push(worker());
      await Promise.all(workers);
      try {
        const relMap = await tmcFetchSkuReliabilityMap([...resultMap.keys()]);
        const RELIABILITY_FULFILLED_BONUS = 10;
        const RELIABILITY_MISSED_PENALTY = 10;
        for (const [sku, entry] of resultMap) {
          const rel = relMap.get(sku) || { fulfilled_cnt: 0, missed_cnt: 0 };
          entry.priorityScore = (entry.priorityScore || 0) + (rel.fulfilled_cnt * RELIABILITY_FULFILLED_BONUS) - (rel.missed_cnt * RELIABILITY_MISSED_PENALTY);
        }
      } catch (e) { if (LW_ORDERS_CONFIG.DEBUG) console.warn('[Forecast] reliability enrichment failed:', e); }
      return resultMap;
    }

    function tmcRenderCycleCell(row) {
      const days = Number(row?.suggested_cycle_days);
      if (!days || Number.isNaN(days)) return `<span style="color:#98a2b3;">—</span>`;
      return `
        <div style="font-weight:700; font-size:14px; color:#101828; line-height:1.1;">
          ${days} <span style="font-weight:600; color:#475467;">ימים</span>
        </div>
      `;
    }

    
    function tmcRenderQtyValue(qty) {
      const n = qty != null ? Number(qty) : null;
      if (!Number.isFinite(n) || n <= 0) return `<span style="color:#98a2b3;">—</span>`;
      const val = Math.abs(n - Math.round(n)) < 1e-9 ? String(Math.round(n)) : String(Math.round(n * 100) / 100);
      return `
        <div style="font-weight:800; font-size:18px; color:#101828; line-height:1;">
          ${escapeHtml(val)}
        </div>
      `;
    }

    function tmcRenderQtyWithinCycleCell(qty) {
      return `<div class="tmc-qty-cell">${tmcRenderQtyValue(qty)}</div>`;
    }

    /** Gradient: אפור → אדום כהה → אדום בוהק → כתום → כתום בוהק. position 0=gray, 1=urgent (היום/מחר). */
    const TMC_WHEN_GRADIENT_STOPS = [
      [0, '#667085'],   [0.15, '#7a2020'], [0.3, '#a82a2a'], [0.5, '#c94a4a'],
      [0.7, '#e85a20'], [0.85, '#ff6d02'], [1, '#ff9500']
    ];
    function tmcWhenGradientColor(diffDays) {
      const t = diffDays;
      let pos;
      if (t >= 0) {
        const effective = t === 0 ? 1 : t === 1 ? 0 : t;
        pos = 1 - effective / 7;
      } else {
        // overdue: 1 day late => light red, older late => darker red (cap at 30d)
        const over = Math.abs(t);
        const maxOver = 30;
        const over01 = Math.max(0, Math.min(1, (over - 1) / (maxOver - 1)));
        // map to the red range in stops: 0.5 (light) -> 0.15 (dark)
        pos = 0.5 - over01 * (0.5 - 0.15);
      }
      pos = Math.max(0, Math.min(1, pos));
      let i = 0;
      while (i < TMC_WHEN_GRADIENT_STOPS.length - 1 && TMC_WHEN_GRADIENT_STOPS[i + 1][0] <= pos) i++;
      const [p0, c0] = TMC_WHEN_GRADIENT_STOPS[i];
      const next = TMC_WHEN_GRADIENT_STOPS[i + 1];
      if (!next || p0 === next[0]) return c0;
      const [p1, c1] = next;
      const f = (pos - p0) / (p1 - p0);
      const hex = (x) => parseInt(x, 16);
      const lerp = (a, b) => Math.round(a + (b - a) * f);
      const r = lerp(hex(c0.slice(1, 3)), hex(c1.slice(1, 3)));
      const g = lerp(hex(c0.slice(3, 5)), hex(c1.slice(3, 5)));
      const b = lerp(hex(c0.slice(5, 7)), hex(c1.slice(5, 7)));
      return '#' + [r, g, b].map(n => n.toString(16).padStart(2, '0')).join('');
    }

    function tmcRenderWhenCell(summary, overdueDates, upcomingDates, earliestDateIso) {
      const MAX_SHOW = 6;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const allIso = [
        ...(Array.isArray(overdueDates) ? overdueDates : []),
        ...(Array.isArray(upcomingDates) ? upcomingDates : [])
      ];
      const items = [];
      allIso.forEach(iso => {
        const text = tmcHumanizeWhenToken(iso);
        if (text) {
          const d = new Date(iso);
          d.setHours(0, 0, 0, 0);
          const diffDays = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          const color = tmcWhenGradientColor(diffDays);
          const fw = (diffDays >= -2 && diffDays <= 2) ? 600 : 500;
          items.push({ diffDays, html: `<span style="color:${color};font-weight:${fw}">${escapeHtml(text)}</span>` });
        }
      });
      items.sort((a, b) => Math.abs(a.diffDays) - Math.abs(b.diffDays));
      const parts = items.slice(0, MAX_SHOW).map(x => x.html);
      const remaining = Math.max(0, items.length - MAX_SHOW);
      let html;
      if (parts.length) {
        html = remaining > 0 ? parts.join(', ') + ` <span class="tmc-when-muted">ועוד ${remaining}</span>` : parts.join(', ');
      } else {
        const text = summary || '—';
        let style = 'color:#667085';
        if (earliestDateIso) {
          const d = new Date(earliestDateIso);
          d.setHours(0, 0, 0, 0);
          const diffDays = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          style = `color:${tmcWhenGradientColor(diffDays)}`;
        }
        html = `<span style="${style}">${escapeHtml(text)}</span>`;
      }
      return `<div class="tmc-when-cell">${html}</div>`;
    }

    /**
     * פונקציית מיון משותפת לטבלה ולגריד
     */
    function getSortedRows(rows, state) {
      const col = state.sortCol;
      const dir = state.sortDir === 'asc' ? 1 : -1;

      return [...rows].sort((a, b) => {
        let valA, valB;
        let usePrecomputed = false;
        let tiebreakerDateAsc = false;
        if (col === 'priority' && (a._hasDrilldown !== b._hasDrilldown)) {
          if (a._hasDrilldown && !b._hasDrilldown) return -1;
          if (!a._hasDrilldown && b._hasDrilldown) return 1;
        }
        if (col === 'priority' && (a._sortPriorityOrder !== undefined || b._sortPriorityOrder !== undefined)) {
          const orderA = Number(a._sortPriorityOrder) || 0;
          const orderB = Number(b._sortPriorityOrder) || 0;
          if (orderA !== orderB) return orderA > orderB ? 1 * dir : -1 * dir;
          const closeA = Number(a._sortCloseness) ?? -999;
          const closeB = Number(b._sortCloseness) ?? -999;
          if (closeA !== closeB) return closeA > closeB ? 1 * dir : -1 * dir;
          const nA = Number(a._sortNOrders) ?? 0;
          const nB = Number(b._sortNOrders) ?? 0;
          if (nA !== nB) return nB - nA;
          const fA = Number(a._sortNForecasts) ?? 0;
          const fB = Number(b._sortNForecasts) ?? 0;
          return fB - fA;
        } else if (col === 'qty_within_cycle' && (a._sortQty !== undefined || b._sortQty !== undefined)) {
          valA = Number(a._sortQty) || 0;
          valB = Number(b._sortQty) || 0;
          usePrecomputed = true;
        } else if (col === 'first_due_date' && (a._sortWhen !== undefined || b._sortWhen !== undefined)) {
          valA = Number(a._sortWhen) || 0;
          valB = Number(b._sortWhen) || 0;
          usePrecomputed = true;
        } else {
          valA = a[col];
          valB = b[col];
        }

        if (!usePrecomputed) {
          // טיפול בתאריכים
          if (col && (
            col.includes('date') ||
            col === 'first_expected_date' || col === 'last_expected_date' ||
            col === 'first_due_date' || col === 'last_due_date'
          )) {
            valA = valA ? new Date(valA).getTime() : 0;
            valB = valB ? new Date(valB).getTime() : 0;
          }
          // טיפול במספרים (null = 0) – חייב Number() למניעת מיון כמחרוזת (168, 25 -> 168>25)
          else if (
            typeof valA === 'number' || typeof valB === 'number' ||
            col === 'n_open' || col === 'n_customers' || col === 'n_due' || col === 'n_soon' ||
            col === 'forecast_qty' || col === 'forecastQty' ||
          col === 'priority' || col === 'qty_within_cycle' || col === 'suggested_cycle_days' || col === 'n_records' ||
          col === 'n_missed'
          ) {
            valA = Number(valA) || 0;
            valB = Number(valB) || 0;
          }
          // טיפול בטקסט
          else {
            valA = (valA || '').toString().toLowerCase();
            valB = (valB || '').toString().toLowerCase();
          }
        }

        const cmpDir = tiebreakerDateAsc ? 1 : dir;
        if (valA < valB) return -1 * cmpDir;
        if (valA > valB) return 1 * cmpDir;
        return 0;
      });
    }

    /**
     * הנדלר ללחיצה על כותרת טבלה
     */
    async function handleHeaderClick(columnKey, state, refs, renderFn) {
      if (state.sortCol === columnKey) {
        // אם כבר ממוין לפי זה - הפוך כיוון
        state.sortDir = state.sortDir === 'desc' ? 'asc' : 'desc';
      } else {
        // מיון חדש - תמיד התחל מהגדול לקטן (הכי הגיוני למספרים)
        state.sortCol = columnKey;
        state.sortDir = 'desc';
      }
      if (typeof renderFn === 'function') {
        await renderFn(state, refs);
      }
    }


    /**
     * Cache ל־product_catalog_enriched (pack_value, pack_unit, consumption_category).
     * Lookup לפי sku או barcode – כי ב־UI "SKU" עשוי להיות ברקוד.
     */
    const ENRICHED_CATALOG_CACHE_KEY = 'TM_CATALOG_ENRICHED_CACHE_V1';
    const ENRICHED_SELECT = 'sku,barcode,group_name,category_name,pack_value,pack_unit,consumption_category';
    const ENRICHED_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days
    let ENRICHED_CATALOG_CACHE = null;
    let _enrichedSaveT = null;

    function loadEnrichedCatalogCache() {
      if (ENRICHED_CATALOG_CACHE) return ENRICHED_CATALOG_CACHE;
      try {
        const raw = localStorage.getItem(ENRICHED_CATALOG_CACHE_KEY);
        const obj = raw ? JSON.parse(raw) : null;
        ENRICHED_CATALOG_CACHE = obj && typeof obj === 'object' && obj.byKey
          ? obj
          : { v: 1, ts: 0, byKey: {} };
      } catch (_) {
        ENRICHED_CATALOG_CACHE = { v: 1, ts: 0, byKey: {} };
      }
      return ENRICHED_CATALOG_CACHE;
    }

    function saveEnrichedCatalogCacheSoon() {
      loadEnrichedCatalogCache();
      if (_enrichedSaveT) return;
      _enrichedSaveT = setTimeout(() => {
        _enrichedSaveT = null;
        try {
          ENRICHED_CATALOG_CACHE.ts = Date.now();
          localStorage.setItem(ENRICHED_CATALOG_CACHE_KEY, JSON.stringify(ENRICHED_CATALOG_CACHE));
        } catch (_) {}
      }, 500);
    }

    function getEnrichedByKey(key) {
      if (!key) return null;
      loadEnrichedCatalogCache();
      const k = String(key).trim();
      return ENRICHED_CATALOG_CACHE.byKey[k] || null;
    }

    function upsertEnrichedRec(rec) {
      if (!rec) return;
      loadEnrichedCatalogCache();
      const packVal = Number(rec.pack_value);
      const unitRaw = (rec.pack_unit || 'unknown').toString().toLowerCase();
      const entry = {
        consumption_category: rec.consumption_category ? String(rec.consumption_category) : null,
        pack_value: Number.isFinite(packVal) ? packVal : null,
        pack_unit: unitRaw,
        group_name: rec.group_name ? String(rec.group_name) : '',
        category_name: rec.category_name ? String(rec.category_name) : ''
      };
      const sku = rec.sku ? String(rec.sku).trim() : '';
      const bc = rec.barcode ? String(rec.barcode).trim() : '';
      if (sku) ENRICHED_CATALOG_CACHE.byKey[sku] = entry;
      if (bc) ENRICHED_CATALOG_CACHE.byKey[bc] = entry;
    }

    function tmcStatusDot(status) {
      if (status === 'due_or_late') return '🔴';
      if (status === 'soon') return '🟠';
      if (status === 'not_yet') return '🟡';
      return '⚪';
    }
    function tmcConsumptionIcon(consumptionCategory) {
      if (consumptionCategory === 'dog_food') return '🐶';
      if (consumptionCategory === 'cat_food') return '🐱';
      if (consumptionCategory === 'cat_litter') return '🐱🧻';
      return '📦';
    }
    function tmcFmtNumSmart(n) {
      const x = Number(n);
      if (!Number.isFinite(x)) return null;
      if (x < 10) return (Math.round(x * 10) / 10).toString().replace(/\.0$/, '');
      return String(Math.round(x));
    }
    function tmcFmtDdMm(dateStr) {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      if (!Number.isFinite(d.getTime())) return '';
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      return `${dd}/${mm}`;
    }
    function tmcBuildConsumptionCell(row) {
      const keysToTry = [row?.sku, row?.barcode, tmcNormalizeDigits(row?.sku), tmcNormalizeDigits(row?.barcode)]
        .filter(Boolean).map(k => String(k).trim());
      let e = null;
      for (const k of keysToTry) {
        e = getEnrichedByKey(k);
        if (e) break;
      }
      if (!e) {
        return { html: '<span title="לא נמצא ב-product_catalog_enriched (לפי sku/barcode)">—</span>', sort: null };
      }
      const packValue = Number(e.pack_value);
      const unit = (e.pack_unit || 'unknown').toString();
      if (!Number.isFinite(packValue) || packValue <= 0 || unit === 'unknown') {
        return { html: '<span title="חסר pack_value/pack_unit ב-product_catalog_enriched">—</span>', sort: null };
      }
      const unitsToOrder = Number(row.qty_within_cycle);
      if (!Number.isFinite(unitsToOrder) || unitsToOrder <= 0) {
        return { html: '<span title="אין qty_within_cycle לחישוב">—</span>', sort: null };
      }
      const total = unitsToOrder * packValue;
      const totalTxt = tmcFmtNumSmart(total);
      const status = normalizeForecastStatus(row);
      const dot = tmcStatusDot(status);
      const icon = tmcConsumptionIcon(e.consumption_category);
      const due = row._earliestDateIso || row.first_due_date || row.next_expected_date || null;
      const dueTxt = tmcFmtDdMm(due);
      const whenPart = dueTxt ? `עד ${dueTxt}` : '';
      const unitLabel = unit === 'kg' ? 'ק״ג' : unit === 'l' ? 'ל׳' : unit === 'count' ? 'יח׳' : '';
      const text = `${dot} ${icon} ${whenPart ? (whenPart + ' · ') : ''}~${totalTxt} ${unitLabel}`.trim();
      const tip = `${e.group_name || ''} / ${e.category_name || ''}`.trim();
      return { html: `<span title="${escapeHtml(tip)}">${escapeHtml(text)}</span>`, sort: total };
    }

    async function ensureEnrichedForKeys(keys) {
      const uniq = Array.from(new Set((keys || []).map(k => String(k || '').trim()).filter(Boolean)));
      if (!uniq.length) return;
      loadEnrichedCatalogCache();
      const missing = uniq.filter(k => !ENRICHED_CATALOG_CACHE.byKey[k]);
      if (!missing.length) return;

      try {
        const { data: bySku } = await supabaseGetInChunks('product_catalog_enriched', ENRICHED_SELECT, 'sku', missing, 80);
        (bySku || []).forEach(upsertEnrichedRec);
        const stillMissing = missing.filter(k => !ENRICHED_CATALOG_CACHE.byKey[k]);
        if (stillMissing.length) {
          const { data: byBarcode } = await supabaseGetInChunks('product_catalog_enriched', ENRICHED_SELECT, 'barcode', stillMissing, 80);
          (byBarcode || []).forEach(upsertEnrichedRec);
        }
        saveEnrichedCatalogCacheSoon();
      } catch (e) {
        if (LW_ORDERS_CONFIG.DEBUG) console.warn('[Forecast] ensureEnrichedForKeys failed:', e);
      }
    }

    /**
     * רינדור תצוגת טבלה עם מיון בראש הטבלה
     */
    async function renderProductOverviewTable(ui, rows) {
      const listEl = ui.body || ui.listWrap;
      listEl.innerHTML = '<div class="tmc-body-loader" style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:320px;color:#667085;position:relative;z-index:10002;"><i class="fa fa-spinner fa-spin" style="font-size:48px;display:block;margin-bottom:16px;"></i><span style="font-size:16px;">טוען סיכום צפי…</span></div>';

      // Apply the same exclusions as sync (without tracking stats)
      const filteredRows = [];
      const YIELD_EVERY = Math.max(10, Number(LW_ORDERS_CONFIG.YIELD_EVERY || 50));
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const sku = row?.sku ?? row?.barcode ?? row?.product_sku ?? null;
        const name = row?.product_name ?? row?.name ?? row?.product ?? '';
        // For exclusion logic, prefer the actual "what to order" quantity (cycle window)
        // and fall back to legacy overview fields.
        const qtyFromRow =
          (row?.qty_within_cycle != null ? row.qty_within_cycle :
          (row?.forecast_qty != null ? row.forecast_qty :
          (row?.forecastQty != null ? row.forecastQty :
          (row?.n_open != null ? row.n_open :
          (row?.n_customer_forecasts != null ? row.n_customer_forecasts : null)))));

        const decision = lwDecideQtyAndMaybeSkip(
          { qty_ordered: qtyFromRow, qty_picked: null },
          sku,
          name,
          null,
          { track: false, allowZeroQty: true }
        );
        if (!decision.skip) filteredRows.push(row);

        if (i > 0 && (i % YIELD_EVERY === 0)) {
          await lwYieldToMain();
        }
      }

      rows = filteredRows;
      if (!rows.length) {
        renderEmptyState(listEl);
        return;
      }

      // Compute "מתי צפוי" + "כמה להזמין" BEFORE rendering (avoid waves)
      const state = ui.state || {};
      const skusKey = rows.map(r => tmcNormalizeDigits(r?.sku)).filter(Boolean).sort().join(',');
      const summaryKey = `${state.dateRangeKey || ''}::${state.dateFrom || ''}::${state.dateTo || ''}::${skusKey}`;
      let summaryMap = (state.whenSummaryMapKey === summaryKey && state.whenSummaryMap)
        ? state.whenSummaryMap
        : null;
      if (!summaryMap) {
        summaryMap = await tmcComputeWhenSummaryMap(rows, state);
        state.whenSummaryMap = summaryMap;
        state.whenSummaryMapKey = summaryKey;
      }

      // Show rows that have upcoming OR overdue (DOS truth; never "empty" on small ranges if overdue exists)
      rows = rows.filter(r => {
        const sku = tmcNormalizeDigits(r?.sku);
        const res = summaryMap?.get(sku) || summaryMap?.get(tmcNormalizeDigits(r?.barcode)) || {};
        const upc = Array.isArray(res?.upcomingDates) ? res.upcomingDates.length : 0;
        const ovd = Array.isArray(res?.overdueDates) ? res.overdueDates.length : 0;
        return (upc + ovd) > 0;
      });
      loadCatalogCacheOnce();
      const seenCanonical = new Set();
      rows = rows.filter(r => {
        const cat = getCatalogForSku(r?.sku || r?.barcode);
        const canonical = cat ? String(cat.sku || r?.sku || '').trim() : tmcNormalizeDigits(r?.sku) || '';
        if (!canonical || seenCanonical.has(canonical)) return false;
        seenCanonical.add(canonical);
        return true;
      });

      // לא מסננים כאן לפי drilldown (חוק "2 הזמנות") – סינון כזה צמצם ל־3–4 מוצרים בלבד. הסינון חל רק בפתיחת חלון ה-drilldown.

      // עדכון רשימת ספקים - תמיד רק מספקים של המוצרים המוצגים (גם כש-0 כדי לאפס בחירה לא תקינה)
      if (ui.supplierSelect) {
        const suppliers = Array.from(new Set(
          rows.map(x => String(x?.supplier || '').trim()).filter(Boolean)
        )).sort((a, b) => a.localeCompare(b, 'he'));
        const currentVal = ui.supplierSelect.value || '__ALL__';
        const isValid = suppliers.includes(currentVal) || currentVal === '__ALL__' || currentVal === '__UNKNOWN__';
        ui.supplierSelect.innerHTML = '';
        ui.supplierSelect.insertAdjacentHTML('beforeend', `<option value="__ALL__">כל הספקים</option>`);
        ui.supplierSelect.insertAdjacentHTML('beforeend', `<option value="__UNKNOWN__">ללא ספק</option>`);
        for (const s of suppliers) {
          ui.supplierSelect.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`);
        }
        if (!isValid || (rows.length === 0 && currentVal !== '__ALL__')) {
          ui.supplierSelect.value = '__ALL__';
          if (state) state.supplierKey = '__ALL__';
        } else {
          ui.supplierSelect.value = currentVal;
        }
      }

      // טען ציון אמינות (תחזית שהתגשמה/פוספסה) לפי SKU
      const skusForReliability = Array.from(new Set(rows.map(r => tmcNormalizeDigits(r?.sku)).filter(Boolean)));
      let reliabilityMap = new Map();
      try {
        reliabilityMap = await tmcFetchSkuReliabilityMap(skusForReliability);
      } catch (_) {}

      // Enrich for sort: עדיפות משולבת = דחיפות (תאריך) + אמינות (התגשמה/פוספסה)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const PRIORITY_THRESHOLD_HIGH = 70;
      const PRIORITY_THRESHOLD_MID = 40;
      const RELIABILITY_FLOOR_FOR_HIGH = -10;
      rows.forEach(r => {
        const sku = tmcNormalizeDigits(r?.sku);
        const res = summaryMap?.get(sku) || {};
        r._sortQty = res?.qty ?? r?.qty_within_cycle ?? 0;
        r._sortWhen = res?.earliestDate ? new Date(res.earliestDate).getTime() : 0;
        r._earliestDateIso = res?.earliestDate || null;
        r._overdueDates = res?.overdueDates || [];
        r._upcomingDates = res?.upcomingDates || [];
        const rel = reliabilityMap?.get(sku) || reliabilityMap?.get(tmcNormalizeDigits(r?.barcode));
        r._fulfilledCnt = rel?.fulfilled_cnt ?? 0;
        r._missedCnt = rel?.missed_cnt ?? 0;
        const totalPred = r._fulfilledCnt + r._missedCnt;
        const rate = totalPred > 0 ? r._fulfilledCnt / totalPred : 0.5;
        const clampAbs = totalPred >= 4 && rate >= 0.5 ? 30 : totalPred >= 2 || (totalPred >= 1 && rate >= 0.3) ? 20 : 10;
        r._reliabilityClampAbs = clampAbs;
        let urgencyTier = 0;
        let diffDays = 999;
        if (res?.earliestDate) {
          const d = new Date(res.earliestDate);
          d.setHours(0, 0, 0, 0);
          diffDays = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays < 0) urgencyTier = 3;
          else if (diffDays <= 7) urgencyTier = 2;
          else urgencyTier = 1;
        }
        r._urgencyTier = urgencyTier;
        const urgencyScore = urgencyTier === 3 ? 90 : urgencyTier === 2 ? (diffDays <= 2 ? 75 : 60) : urgencyTier === 1 ? 40 : 20;
        r._urgencyScore = urgencyScore;
        const rawRel = (r._fulfilledCnt * 10) - (r._missedCnt * 10);
        const reliabilityScore = Math.max(-clampAbs, Math.min(clampAbs, rawRel));
        r._reliabilityScore = reliabilityScore;
        const totalScore = urgencyScore + reliabilityScore;
        r._sortPriority = totalScore;
        const canBeHigh = totalScore >= PRIORITY_THRESHOLD_HIGH && reliabilityScore >= RELIABILITY_FLOOR_FOR_HIGH;
        if (canBeHigh) r._priorityLabel = 'גבוה';
        else if (totalScore >= PRIORITY_THRESHOLD_MID) r._priorityLabel = 'בינוני';
        else r._priorityLabel = 'נמוך';
        r._sortPriorityOrder = r._priorityLabel === 'גבוה' ? 3 : (r._priorityLabel === 'בינוני' ? 2 : 1);
        const allDates = [...(res?.overdueDates || []), ...(res?.upcomingDates || [])];
        const absDaysList = [];
        allDates.forEach(iso => {
          const d = new Date(iso);
          d.setHours(0, 0, 0, 0);
          const dd = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          absDaysList.push(Math.abs(dd));
        });
        const minAbs = absDaysList.length ? Math.min(...absDaysList) : 999;
        r._sortCloseness = -minAbs;
        r._sortNOrders = Number(res?.nOrdersSum) ?? 0;
        r._sortNForecasts = Number(res?.nForecasts) ?? 0;
      });

      // זמינות Drilldown: לפי מינימום הזמנות (DOS Source-of-Truth), בלי RPC ישן
      {
        const __minOrders = (typeof FORECAST_MIN_ORDERS === 'number' ? FORECAST_MIN_ORDERS : 3);
        rows.forEach(r => {
          const mn = Number(getForecastMinOrders(r)) || 0;
          const mx = Number(getForecastMaxOrders(r)) || 0;
          r._hasDrilldown = (mx >= __minOrders) || (mn >= __minOrders);
        });
      }

      rows = getSortedRows(rows, state);

      if (!rows.length) {
        renderEmptyState(listEl);
        return;
      }

      // טען תמונות *רק* עבור ה-SKUs שמופיעים כרגע במסך
      try {
        const skusNeeded = Array.from(new Set(rows.map(r => tmcNormalizeDigits(r?.sku)).filter(Boolean)));
        if (skusNeeded.length) {
          const tImg = performance.now();
          await loadProductImages(skusNeeded);
          const imgMs = Math.round(performance.now() - tImg);
          console.log(`[Forecast] Images loaded for ${skusNeeded.length} SKUs in ${imgMs}ms`);
        }
      } catch (e) {
        console.warn('[Forecast] loadProductImages failed:', e);
      }

      // עדכון כותרת ספירה (מוצרים מוצגים)
      if (ui.countLabel) {
        ui.countLabel.textContent = ` (${rows.length.toLocaleString('he-IL')} מוצרים)`;
      }

      // קטלוג מועשר (pack_value, pack_unit) – לעמודת "תחזית צריכה". Lookup לפי sku וגם barcode (ב־UI "SKU" עשוי להיות ברקוד)
      const keysForCatalog = Array.from(new Set(rows.flatMap(r =>
        [r?.sku, r?.barcode, tmcNormalizeDigits(r?.sku), tmcNormalizeDigits(r?.barcode)].filter(Boolean)
      ).map(k => String(k).trim())));
      try {
        await ensureEnrichedForKeys(keysForCatalog);
      } catch (_) {}

      const tableWrap = document.createElement('div');
      tableWrap.className = 'tmc-table-container';

      const table = document.createElement('table');
      table.className = 'tmc-table';

      // Minimalist buyer-oriented table:
      // - "כמות להזמנה" = qty within supplier cycle window
      // - "מחזור" = suggested order cycle days (4/7/14/30)
      // Any additional diagnostics (n_records + due date range) goes inside the quantity cell as small text.
      const columns = [
        { key: '_num', label: '#', width: '36px', noSort: true },
        { key: null, label: '', width: '70px' },
        { key: 'sku', label: 'מה', title: 'שם המוצר והמק"ט', icon: 'fa-cube' },
        { key: 'priority', label: 'עדיפות', width: '90px', title: 'עדיפות משולבת: דחיפות לפי תאריך + אמינות (✅התגשמה / ❌פוספס, ±14 ימים). מוצר עם הרבה פספוסים יכול לרדת בעדיפות גם אם קרוב בזמן.', icon: 'fa-flag' },
        { key: 'qty_within_cycle', label: 'כמה להזמין', width: '140px', title: 'כמה יחידות מומלץ להזמין במחזור ההזמנה של הספק', icon: 'fa-cubes' },
        { key: 'first_due_date', label: 'מתי צפוי', width: '220px', title: 'באילו ימים צפויות הזמנות (היום/מחר/שני הבא...) לפי התקופה שנבחרה' },
        { key: 'consumption', label: 'תחזית צריכה', width: '160px', title: 'תחזית צריכה (MVP)', noSort: true },
      ];

      // בניית הכותרות
      const thead = document.createElement('thead');
      const trHead = document.createElement('tr');
      
      columns.forEach(col => {
        const th = document.createElement('th');
        if (col.width) th.style.width = col.width;
        
        if (col.key && !col.noSort) {
          th.className = 'sortable';
          if (col.title) th.title = col.title;
          th.addEventListener('click', async (e) => {
            if (e.target?.closest?.('.tmc-col-date-trigger')) return;
            await handleHeaderClick(col.key, state, ui, async (s, r) => {
              Object.assign(r.state, { sortCol: s.sortCol, sortDir: s.sortDir });
              const filteredRows = getFilteredAndSortedProductRows(r.state);
              await renderProductOverviewTable(r, filteredRows);
            });
          });
          
          // תוכן הכותרת עם אייקון מיון
          let icon = '';
          if (state.sortCol === col.key) {
            const iconClass = state.sortDir === 'desc' 
              ? 'fa-arrow-down' : 'fa-arrow-up';
            icon = `<i class="fa-light ${iconClass} tmc-sort-icon"></i>`;
          }
          const dateDropdown = (col.key === 'first_due_date' && ui.dateTrigger)
            ? `<span class="tmc-col-date-trigger" title="בחירת טווח תאריכים" style="margin-left:6px;cursor:pointer;opacity:0.7"><i class="fa-light fa-calendar"></i></span>`
            : '';
          const colIcon = col.icon ? `<i class="fa-light ${col.icon}" style="margin-left:6px;opacity:0.7"></i>` : '';
          th.innerHTML = (col.key === 'first_due_date')
            ? `${dateDropdown}${icon}${col.label}`
            : (col.icon ? `${colIcon}${icon}${col.label}` : `${icon}${col.label}`);
          if (dateDropdown) {
            const trigger = th.querySelector('.tmc-col-date-trigger');
            if (trigger) {
              trigger.addEventListener('click', (ev) => {
                ev.stopPropagation();
                ev.preventDefault();
                ui.dateTrigger?.click();
              });
            }
          }
        } else {
          th.textContent = col.label;
        }
        trHead.appendChild(th);
      });
      thead.appendChild(trHead);
      table.appendChild(thead);

      // גוף הטבלה – DocumentFragment + yield כל 100 שורות להפחתת Violations
      const tbody = document.createElement('tbody');
      const frag = document.createDocumentFragment();

      function getRelativeTimeStr(targetDate) {
        if (!targetDate) return '';
        const now = new Date();
        now.setHours(0,0,0,0);
        const then = new Date(targetDate);
        then.setHours(0,0,0,0);
        
        const diffTime = then.getTime() - now.getTime();
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) return 'היום';
        if (diffDays === 1) return 'מחר';
        if (diffDays === 2) return 'מחרתיים';
        if (diffDays === -1) return 'אתמול';
        if (diffDays > 0) return `עוד ${diffDays} ימים`;
        return `לפני ${Math.abs(diffDays)} ימים`;
      }

      for (let idx = 0; idx < rows.length; idx++) {
        const row = rows[idx];
        const skuNorm = tmcNormalizeDigits(row?.sku);
        const summaryInfo = summaryMap?.get(skuNorm) || {};
        const whenSummary = summaryInfo?.summary || '';
        const qtySummary = summaryInfo?.qty ?? null;
        const customerNames = Array.isArray(summaryInfo?.customerNames) ? summaryInfo.customerNames : [];
        const customerNamesStr = customerNames.join(' ').trim();
        const searchTermsForAttr = (customerNamesStr || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
        const tr = document.createElement('tr');
        if (skuNorm) tr.setAttribute('data-sku', skuNorm);
        if (searchTermsForAttr) tr.setAttribute('data-search-terms', searchTermsForAttr);
        
        const metaBarcode = (row && row.barcode) ? String(row.barcode).trim() : String(row?.sku || '').trim();
        const metaSupplier = String(row?.supplier || '').trim();
        const metaBarcodeHtml = metaBarcode ? `${escapeHtml(metaBarcode)}` : '';
        const metaSupplierHtml = metaSupplier ? `${escapeHtml(metaSupplier)}` : '';
        const metaLineHtml =
          (metaBarcodeHtml || metaSupplierHtml)
            ? `${metaBarcodeHtml}${metaBarcodeHtml && metaSupplierHtml ? ' · ' : ''}${metaSupplierHtml}`
            : '—';
        
        const thumbUrl = getProductThumbUrl(row.sku);
        const imgHtml = thumbUrl 
          ? `<img src="${escapeHtml(thumbUrl)}" class="tmc-tbl-thumb" loading="lazy" alt="תמונת מוצר">`
          : `<div class="tmc-tbl-placeholder">${escapeHtml((row.product_name || '?')[0])}</div>`;

        const priorityLabel = row._priorityLabel || '—';
        const priorityClass = priorityLabel === 'גבוה' ? 'tmc-prio-high' : (priorityLabel === 'בינוני' ? 'tmc-prio-mid' : 'tmc-prio-low');
        const f = row._fulfilledCnt ?? 0;
        const m = row._missedCnt ?? 0;
        const accuracyParts = [];
        if (f > 0) accuracyParts.push(`✅${f}`);
        if (m > 0) accuracyParts.push(`❌${m}`);
        const accuracyBadge = accuracyParts.length
          ? ` <span class="tmc-accuracy-badge" style="font-size:11px;opacity:0.9;" title="דיוק (היסטוריה מלאה): ${f} התגשמו, ${m} חרגו (±14 ימים מצפי הזמנה). דחיפות = תאריך נפרד. לפריסה — לחץ.">${accuracyParts.join(' ')} (היסטוריה מלאה)</span>`
          : '';
        const uSc = row._urgencyScore ?? 0;
        const rSc = row._reliabilityScore ?? 0;
        const tot = (row._sortPriority != null ? row._sortPriority : uSc + rSc);
        const priorityTitle = `ציון משולב: ${Math.round(tot)} (דחיפות ${uSc} + אמינות ${rSc >= 0 ? '+' : ''}${rSc}) — ✅${f} התגשמו, ❌${m} חרגו. Qty: ${row._sortQty ?? '?'}. לחץ לפריסה.`.trim();
        const cons = tmcBuildConsumptionCell(row);
        tr.innerHTML = `
          <td style="color:#667085;font-size:12px;font-weight:500;">${idx + 1}</td>
          <td>${imgHtml}</td>
          <td>
            <div style="font-weight:600; font-size:14px; color:#101828; margin-bottom:2px; line-height:1.2;">
              ${escapeHtml(row.product_name || 'ללא שם')}
            </div>
            <div style="display:block; color:#667085; font-size:12px; line-height:1.1;">
              ${metaLineHtml}
            </div>
          </td>
          <td class="${priorityClass}" style="font-weight:500;" title="${escapeHtml(priorityTitle)}">
            <div style="line-height:1.3;">${escapeHtml(priorityLabel)}</div>
            <div style="font-size:11px;color:#667085;">${accuracyParts.length ? accuracyParts.join(' ') + ' (היסטוריה מלאה)' : '—'}</div>
          </td>
          <td>${tmcRenderQtyWithinCycleCell(qtySummary)}</td>
          <td>${tmcRenderWhenCell(whenSummary, row._overdueDates, row._upcomingDates, row._earliestDateIso)}</td>
          <td class="tmc-consumption-cell">${cons.html}</td>
        `;
        
        tr.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          const sku = String(row?.sku || '').replace(/\D/g, '').trim();
          if (sku && unsafeWindow?.openProductDrilldown) {
            unsafeWindow.openProductDrilldown(sku, {
              dateRangeKey: state?.dateRangeKey,
              dateRangeKeys: state?.dateRangeKeys,
              dateFrom: state?.dateFrom,
              dateTo: state?.dateTo
            });
          }
        });
        
        frag.appendChild(tr);
        if ((idx + 1) % 100 === 0) await yieldToBrowser(50);
      }

      tbody.appendChild(frag);
      table.appendChild(tbody);
      tableWrap.appendChild(table);

      const searchWrap = document.createElement('div');
      searchWrap.className = 'tmc-forecast-search-wrap';
      const searchInput = document.createElement('input');
      searchInput.type = 'text';
      searchInput.placeholder = 'חיפוש לפי שם לקוח, מוצר או מק"ט...';
      searchInput.className = 'tmc-forecast-search';
      searchInput.setAttribute('aria-label', 'חיפוש בתחזית');
      searchWrap.appendChild(searchInput);

      listEl.innerHTML = '';
      listEl.appendChild(searchWrap);
      listEl.appendChild(tableWrap);

      searchInput.addEventListener('input', function filterForecastTableBySearch() {
        const term = (searchInput.value || '').trim().toLowerCase();
        const tbodyRows = tableWrap.querySelectorAll('tbody tr');
        for (let i = 0; i < tbodyRows.length; i++) {
          const tr = tbodyRows[i];
          const searchTerms = tr.getAttribute('data-search-terms') || '';
          const haystack = (tr.textContent + ' ' + searchTerms).toLowerCase();
          const match = !term || haystack.indexOf(term) !== -1;
          tr.style.display = match ? '' : 'none';
        }
      });
    }


    /**
     * Apply filters to forecast rows (search + status filter)
     */
    function applyForecastFilters(rows, activeFilter, searchTerm) {
      const term = (searchTerm || '').trim().toLowerCase();

      let filtered = rows;

      // חיפוש טקסט
      if (term) {
        filtered = filtered.filter(row => {
          const haystack = [
            row.product_name,
            row.sku,
            row.customer_name,
            row.customer_phone,
            row.city
          ].filter(Boolean).join(' ').toLowerCase();
          return haystack.includes(term);
        });
      }

      // פילטר סטטוס
      if (activeFilter === 'smart') {
        // "רלוונטי" = באיחור או בקרוב
        filtered = filtered.filter(row => (row.n_due || 0) > 0 || (row.n_soon || 0) > 0);
      } else if (activeFilter === 'soon') {
        filtered = filtered.filter(row => (row.n_soon || 0) > 0);
      } else if (activeFilter === 'due') {
        filtered = filtered.filter(row => (row.n_due || 0) > 0);
      } else if (activeFilter === 'all') {
        // לא מסנן
      }

      return filtered;
    }

    /**
     * Initialize header interactions (tabs and date range picker)
     * @param {Object} refs - References from buildForecastModal
     * @param {Object} state - Forecast state object
     * @param {Function} render - Render function (state, refs) => void
     * @param {Function} reloadData - Optional reload function (state) => Promise
     */
    function initForecastHeaderInteractions(refs, state, render, reloadData) {
      let {
        dateTrigger,
        dateMenu,
        dateLabelEl,
        dateRangesList,
        dateCustom,
        dateFrom: dateFromInput,
        dateTo: dateToInput,
        dateApplyBtn,
        wrap
      } = refs;

      // --- dropdown של טווח תאריכים ---

      // מצב התחלתי: התפריט סגור
      if (dateMenu) {
        dateMenu.hidden = true;
        dateMenu.classList.remove('is-open');
      }
      if (dateTrigger) {
        dateTrigger.setAttribute('aria-expanded', 'false');
      }

      function openDateMenu() {
        if (!dateMenu || !dateTrigger) return;
        dateMenu.hidden = false;
        dateMenu.classList.add('is-open');
        dateTrigger.setAttribute('aria-expanded', 'true');
      }

      function closeDateMenu() {
        if (!dateMenu || !dateTrigger) return;
        dateMenu.hidden = true;
        dateMenu.classList.remove('is-open');
        dateTrigger.setAttribute('aria-expanded', 'false');
      }

      if (dateTrigger && dateMenu) {
        // ביטול כל מאזין קודם אם קיים
        const newTrigger = dateTrigger.cloneNode(true);
        dateTrigger.parentNode.replaceChild(newTrigger, dateTrigger);
        const actualTrigger = newTrigger;
        refs.dateTrigger = actualTrigger;
        
        // עדכון רפרנס לתווית במקרה שהיא בפנים
        const newLabel = actualTrigger.querySelector('.tmc-date-label');
        if (newLabel) refs.dateLabel = newLabel;
        dateLabelEl = refs.dateLabel;

        let isProcessing = false;
        let outsideClickHandler = null;

        const setMenuState = (open) => {
          if (!dateMenu || !actualTrigger) return;
          dateMenu.hidden = !open;
          dateMenu.classList.toggle('is-open', open);
          actualTrigger.setAttribute('aria-expanded', open.toString());
          
          if (open) {
            setTimeout(() => {
              outsideClickHandler = (e) => {
                if (!dateMenu.contains(e.target) && !actualTrigger.contains(e.target)) {
                  setMenuState(false);
                }
              };
              document.addEventListener('click', outsideClickHandler, true);
            }, 100);
          } else {
            if (outsideClickHandler) {
              document.removeEventListener('click', outsideClickHandler, true);
              outsideClickHandler = null;
            }
          }
        };

        actualTrigger.onclick = (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          ev.stopImmediatePropagation();
          if (isProcessing) return;
          isProcessing = true;
          const willOpen = dateMenu.hidden;
          setMenuState(willOpen);
          setTimeout(() => { isProcessing = false; }, 100);
        };

        // בחירת טווחים מוכנים מראש - Multi-select
        if (dateRangesList) {
          let selectedKeys = Array.isArray(state.dateRangeKeys) && state.dateRangeKeys.length
            ? [...state.dateRangeKeys]
            : (state.dateRangeKey
                ? (state.dateRangeKey === 'טווח מותאם אישית'
                    ? ['טווח מותאם אישית']
                    : (state.dateRangeKey.includes(',') ? state.dateRangeKey.split(',').map(k => k.trim()) : [state.dateRangeKey]))
                : ['השבוע', 'השבוע הבא']);

          const newRangesList = dateRangesList.cloneNode(true);
          dateRangesList.parentNode.replaceChild(newRangesList, dateRangesList);
          const actualRangesList = newRangesList;
          refs.dateRangesList = actualRangesList;

          const updateMenuUi = () => {
            const checkboxes = actualRangesList.querySelectorAll('input[type="checkbox"][data-range-key]');
            checkboxes.forEach(checkbox => {
              const k = checkbox.getAttribute('data-range-key');
              checkbox.checked = selectedKeys.includes(k);
            });
          };
          updateMenuUi();

          const syncTriggerLabel = () => {
            let label = '';
            // בדיקה אם המצב הנוכחי הוא מותאם אישית
            if (selectedKeys.includes('טווח מותאם אישית')) {
               if (state.dateFrom && state.dateTo) label = `${state.dateFrom} עד ${state.dateTo}`;
               else label = 'טווח מותאם אישית';
               if (dateCustom) dateCustom.hidden = false;
            } else {
              label = selectedKeys.join(', ');
              if (selectedKeys.length > 2) label = `${selectedKeys.length} תקופות נבחרו`;
              if (dateCustom) dateCustom.hidden = true;
            }
            if (dateLabelEl) dateLabelEl.textContent = label;
          };
          syncTriggerLabel();
          
          actualRangesList.addEventListener('change', (ev) => {
            const checkbox = ev.target;
            if (checkbox.type !== 'checkbox' || !checkbox.hasAttribute('data-range-key')) return;

            const key = checkbox.getAttribute('data-range-key');
            if (!key) return;

            ev.stopPropagation();

            // לוגיקה ייחודית לטווח מותאם אישית / כל הפתוחים
            if (key === 'טווח מותאם אישית' || key === 'כל הפתוחים') {
              if (checkbox.checked) {
                selectedKeys = [key];
                // uncheck all others visually
                const allCheckboxes = actualRangesList.querySelectorAll('input[type="checkbox"][data-range-key]');
                allCheckboxes.forEach(cb => {
                  if (cb.getAttribute('data-range-key') !== key) cb.checked = false;
                });
              } else {
                selectedKeys = [];
              }
            } else {
              // נקה בחירות "אקסקלוסיביות" אם בוחרים טווח רגיל
              if (selectedKeys.includes('טווח מותאם אישית') || selectedKeys.includes('כל הפתוחים')) {
                selectedKeys = [];
                const specialCheckboxes = actualRangesList.querySelectorAll('input[type="checkbox"][data-range-key="טווח מותאם אישית"], input[type="checkbox"][data-range-key="כל הפתוחים"]');
                specialCheckboxes.forEach(cb => cb.checked = false);
              }
              
              if (checkbox.checked) {
                if (!selectedKeys.includes(key)) selectedKeys.push(key);
              } else {
                selectedKeys = selectedKeys.filter(k => k !== key);
              }
            }

            if (selectedKeys.length === 0) {
              // fallback default
              selectedKeys = ['החודש'];
              const defaultCheckbox = actualRangesList.querySelector('input[type="checkbox"][data-range-key="החודש"]');
              if (defaultCheckbox) defaultCheckbox.checked = true;
            }

            // עדכון state לוגי
            state.dateRangeKeys = [...selectedKeys];
            state.dateRangeKey = selectedKeys.join(', '); // fallback string

            // עדכון UI במקום (הצגת/הסתרת Custom Box)
            if (key === 'טווח מותאם אישית') {
              if (dateCustom) dateCustom.hidden = !checkbox.checked;
              
              // ★★★ תיקון קריטי: אם סימנו מותאם אישית, עוצרים כאן! ★★★
              // לא מרעננים נתונים עד שהמשתמש לוחץ "החל"
              if (checkbox.checked) {
                  if (dateLabelEl) dateLabelEl.textContent = 'טווח מותאם אישית';
                  // מילוי ברירת מחדל (השבוע) כדי ש"החל" יעבוד גם בלי בחירה ידנית
                  const defRange = getDateRange('השבוע');
                  if (dateFromInput && dateToInput && defRange?.from && defRange?.to) {
                    dateFromInput.value = defRange.from;
                    dateToInput.value = defRange.to;
                  }
                  return; 
              }
            } else {
              if (dateCustom) dateCustom.hidden = true;
            }

            // חישוב תאריכים לטווחים רגילים
            if (selectedKeys.includes('כל הפתוחים')) {
              state.dateFrom = null;
              state.dateTo = null;
            } else {
              // אם ביטלנו מותאם אישית, מחשבים טווח רגיל
              const range = getDateRange(selectedKeys);
              state.dateFrom = range ? range.from : null;
              state.dateTo = range ? range.to : null;
            }
            
            // עדכון התווית למעלה
            let label = selectedKeys.join(', ');
            if (selectedKeys.length > 2) label = `${selectedKeys.length} תקופות נבחרו`;
            if (dateLabelEl) dateLabelEl.textContent = label;

            console.log(`[Forecast] Range change: ${selectedKeys.join('+')} -> Fetching...`);

            // ביצוע הרענון בפועל (רק אם זה לא מותאם אישית שסומן כרגע)
            if (typeof fetchDataAndRender === 'function') {
              fetchDataAndRender(state);
            } else if (typeof reloadData === 'function') {
              reloadData(state).then(() => render(state, refs));
            } else {
              render(state, refs);
            }
          }, true);
        }

        dateMenu.addEventListener('click', (ev) => {
          ev.stopPropagation();
        });

        // כפתור "החל" (לטווח מותאם אישית)
        if (dateApplyBtn) {
          dateApplyBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            ev.stopImmediatePropagation();
            
            const from = dateFromInput && dateFromInput.value ? dateFromInput.value.trim() : null;
            const to   = dateToInput && dateToInput.value   ? dateToInput.value.trim()   : null;

            // עדכון ה-state
            state.dateRangeKeys = ['טווח מותאם אישית'];
            state.dateRangeKey = 'טווח מותאם אישית';
            state.dateFrom = from || null;
            state.dateTo = to || null;

            if (from && to) {
              if (dateLabelEl) dateLabelEl.textContent = `${from} עד ${to}`;
            } else {
              if (dateLabelEl) dateLabelEl.textContent = 'טווח מותאם אישית';
            }

            setMenuState(false); // סגור תפריט

            // ★ אין טעינה בלי תאריכים – מונע מאותיות Drilldown "From: null, To: null" ★
            if (!from || !to) {
              console.warn('[Forecast] טווח מותאם אישית: יש לבחור תאריך התחלה וסיום ולחץ החל');
              return;
            }

            // ★ כאן מבצעים את הטעינה האמיתית ★
            if (typeof reloadData === 'function') {
              reloadData(state).then(() => render(state, refs));
            } else if (typeof fetchDataAndRender === 'function') {
              fetchDataAndRender(state);
            } else {
              render(state, refs);
            }
          });
        }

        const escapeHandler = (ev) => {
          if (ev.key === 'Escape' && dateMenu && !dateMenu.hidden) {
            setMenuState(false);
          }
        };
        document.addEventListener('keydown', escapeHandler);
      } else {
        console.warn('[Forecast] dateTrigger or dateMenu not found, skipping date range controls initialization');
      }
    }
  
    function escapeHtml(s) {
      return String(s ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
    }
  
    function showForecastLoader() {
      try {
        document.querySelectorAll('[data-lw-forecast-loader="1"]').forEach((el) => el.remove());
        const existing = document.getElementById('lw-forecast-loading-msg');
        if (existing) existing.remove();
      } catch {}

      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop fade show';
      backdrop.setAttribute('data-lw-forecast-loader', '1');
      document.body.appendChild(backdrop);

      const loader = document.createElement('div');
      loader.id = 'lw-forecast-loading-msg';
      loader.innerHTML = `
        <div class="position-fixed w-100 h-100 d-flex justify-content-center align-items-center" style="z-index: 9999; top: 0; left: 0;">
          <div class="spinner-border text-primary" role="status" style="width: 3rem; height: 3rem;">
            <span class="sr-only">טוען...</span>
          </div>
        </div>
      `;
      document.body.appendChild(loader);
    }

    function hideForecastLoader() {
      try {
        const loader = document.getElementById('lw-forecast-loading-msg');
        if (loader) loader.remove();
        document.querySelectorAll('[data-lw-forecast-loader="1"]').forEach((el) => el.remove());
      } catch {}
    }

    async function openForecastUI(opts = {}) {
      const deferShow = !!opts.deferShow;
      if (deferShow) showForecastLoader();
      const refs = buildForecastModal();
      if (deferShow && refs.wrap) refs.wrap.style.display = 'none';
      refs.countLabel.textContent = '(טוען...)';
      if (refs.listWrap) refs.listWrap.innerHTML = '<div class="tmc-body-loader" style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:320px;color:#667085;position:relative;z-index:10002;"><i class="fa fa-spinner fa-spin" style="font-size:48px;display:block;margin-bottom:16px;"></i><span style="font-size:16px;">טוען…</span></div>';
  
      // Initialize state
      const state = {
        forecasts: [],
        productOverviewRows: null,
        dateRangeKey: 'השבוע, השבוע הבא',
        dateRangeKeys: ['השבוע', 'השבוע הבא'],
        dateFrom: null,
        dateTo: null,
        // Buyer-oriented default: sort by "כמות להזמנה" (within supplier cycle)
        sortCol: 'priority',
        sortDir: 'desc',
        viewMode: 'table',
        supplierKey: '__ALL__'
      };

      // תמונות נטענות "לפי צורך" אחרי שליפת הנתונים (per current SKUs),
      // כדי לא למשוך קטלוג ענק.

      // --- פונקציית הטעינה והרינדור הראשית ---
      const FORECAST_FETCH_TIMEOUT_MS = 75000;
      const FORECAST_PROGRESS_MSG_MS = 15000;
      function withTimeout(promise, ms) {
        return Promise.race([
          promise,
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))
        ]);
      }
      async function fetchDataAndRender(stateArg) {
        if (refs.listWrap) refs.listWrap.innerHTML = '<div class="tmc-body-loader" style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:320px;color:#667085;position:relative;z-index:10002;"><i class="fa fa-spinner fa-spin" style="font-size:48px;display:block;margin-bottom:16px;"></i><span id="tmc-fc-loader-msg" style="font-size:16px;">טוען…</span></div>';
        let progressTimer;
        try {
          progressTimer = setTimeout(() => {
            const span = refs.listWrap?.querySelector('#tmc-fc-loader-msg');
            if (span) span.textContent = 'טוען… (עשוי לקחת דקה)';
          }, FORECAST_PROGRESS_MSG_MS);
          let range = getPlanningRange(stateArg);
          const hasAllOpen =
            stateArg?.dateRangeKey === 'כל הפתוחים' ||
            (Array.isArray(stateArg?.dateRangeKeys) && stateArg.dateRangeKeys.includes('כל הפתוחים'));
          if (!range && hasAllOpen) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const start = new Date(today);
            start.setDate(start.getDate() - 180);
            const end = new Date(today);
            end.setDate(end.getDate() + 365);
            range = { from: start, to: end };
          }
          if (!range && stateArg?.dateFrom && stateArg?.dateTo) {
            const from = new Date(stateArg.dateFrom);
            const to = new Date(stateArg.dateTo);
            if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime())) {
              from.setHours(0, 0, 0, 0);
              to.setHours(0, 0, 0, 0);
              range = { from, to };
            }
          }

          const rangeFrom = range ? toISODate(range.from) : null;
          const rangeTo = range ? toISODate(range.to) : null;

          let data = null;

          if (rangeFrom && rangeTo) {
            // Prefer RPC that respects selected planning range (paged via limit/offset)
            const rpcPath = `/rest/v1/rpc/forecast_product_qty_by_range_active`;
            const rpcGet = `${rpcPath}?date_from=${encodeURIComponent(rangeFrom)}&date_to=${encodeURIComponent(rangeTo)}`;
            try {
              data = await withTimeout(supaRestFetchPaged(rpcGet, { method: 'GET' }), FORECAST_FETCH_TIMEOUT_MS);
            } catch (e) {
              if (LW_ORDERS_CONFIG.DEBUG) {
                if (e?.message === 'timeout') console.warn('[Forecast] RPC GET timeout, trying POST or view');
                else console.warn('[Forecast] RPC GET failed, trying POST:', e);
              } else {
                console.log('[Forecast] RPC unavailable, using view');
              }
              try {
                const body = { date_from: rangeFrom, date_to: rangeTo };
                data = await withTimeout(supaRestFetch(rpcPath, { method: 'POST', body }), 30000);
              } catch (e2) {
                if (LW_ORDERS_CONFIG.DEBUG) {
                  if (e2?.message === 'timeout') console.warn('[Forecast] RPC POST timeout, falling back to view');
                  else console.warn('[Forecast] RPC POST failed, falling back to view:', e2);
                }
              }
            }
          }

          if (!Array.isArray(data)) {
            let url = `/rest/v1/${FORECAST_VIEW}` +
              `?select=sku,product_name,supplier,suggested_cycle_days,qty_within_cycle,n_records,first_due_date,last_due_date,n_missed` +
              `&order=qty_within_cycle.desc,sku.asc&limit=5000`;

            // Apply date filter if provided (overlapping window)
            if (rangeFrom || rangeTo) {
              if (rangeFrom && rangeTo) {
                url += `&first_due_date=lte.${rangeTo}&last_due_date=gte.${rangeFrom}`;
              } else if (rangeFrom) {
                url += `&last_due_date=gte.${rangeFrom}`;
              } else if (rangeTo) {
                url += `&first_due_date=lte.${rangeTo}`;
              }
            }

            data = await supaRestFetchPaged(url, { method: 'GET' });
          }
          const normalizedRows = (data || []).map(normalizeProductRow);
          
          forecastProductRows = normalizedRows;

          stateArg.productOverviewRows = normalizedRows;
          stateArg.forecasts = normalizedRows; 
          stateArg.totalFetched = normalizedRows.length;
         
          await renderForecastWrapper(stateArg, refs);

          // --- Catalog enrichment (SKU → barcode + supplier) in background ---
          (async () => {
            try {
              const skuList = normalizedRows.map(r => r?.sku).filter(Boolean);
              await loadCatalogForSkus(skuList);

              for (const r of normalizedRows) {
                const cat = getCatalogForSku(r?.sku);
                if (!cat) continue;

                // Keep original sku, but enrich with barcode/supplier for filtering & display
                if (cat.barcode) r.barcode = cat.barcode;
                if (cat.supplier) r.supplier = cat.supplier;
              }

              // Supplier dropdown is now populated in renderProductOverviewTable from displayed rows only

              if (refs.wrap && refs.wrap.isConnected) {
                await renderForecastWrapper(stateArg, refs);
              }
            } catch (e) {
              console.warn('[Forecast] Catalog enrichment failed (continuing):', e);
            }
          })();

        } catch (err) {
          console.error('[Forecast] Fetch error:', err);
          if (refs.listWrap) {
            refs.listWrap.innerHTML = `<div style="color:red; text-align:center; padding:20px;"><b>שגיאה בטעינת נתונים</b><br><small>נסה לצמצם טווח תאריכים או לרענן</small></div>`;
          }
        } finally {
          if (progressTimer) clearTimeout(progressTimer);
        }
      }

      async function renderForecastWrapper(stateArg, refsArg) {
        if (!refsArg.state) refsArg.state = {};
        
        Object.assign(refsArg.state, {
          dateRangeKey: stateArg.dateRangeKey,
          dateRangeKeys: stateArg.dateRangeKeys,
          dateFrom: stateArg.dateFrom,
          dateTo: stateArg.dateTo,
          sortCol: stateArg.sortCol || 'priority',
          sortDir: stateArg.sortDir || 'desc',
          supplierKey: stateArg.supplierKey || '__ALL__',
          totalFetched: Number(stateArg.totalFetched) || 0
        });

        let filteredRows = getFilteredAndSortedProductRows(refsArg.state);

        // תמיד מרנדר טבלה (מיון מתבצע בתוך renderProductOverviewTable לאחר enrichment מ-summaryMap)
        await renderProductOverviewTable(refsArg, filteredRows);
      }

      // Initialize Date Interactions
      initForecastHeaderInteractions(refs, state, renderForecastWrapper, fetchDataAndRender);

      // Supplier dropdown interactions
      if (refs.supplierSelect) {
        refs.supplierSelect.addEventListener('change', () => {
          state.supplierKey = refs.supplierSelect.value || '__ALL__';
          renderForecastWrapper(state, refs);
        });
      }


      // CSV Export Logic
      if (refs.exportBtn) {
        refs.exportBtn.addEventListener('click', () => {
           let rows = getFilteredAndSortedProductRows(state);
           rows = getSortedRows(rows, state);
           
           if (!rows || !rows.length) {
             alert('אין נתונים לייצוא');
             return;
           }

          const csvRows = [];
         csvRows.push(['שם מוצר', 'מק"ט', 'ספק', 'כמות להזמנה (במחזור)', 'מחזור (ימים)', 'חלון (מ..עד)', 'פספוסים']);

           rows.forEach(r => {
             const safeName = (r.product_name || '').replace(/"/g, '""');
             const safeSku = (r.sku || '').replace(/"/g, '""');
           const cycleDays = Number(r?.suggested_cycle_days ?? r?.suggestedCycleDays) || '';
           const qty = Number(r?.qty_within_cycle ?? 0) || 0;
           const fd = parseDateValue(r.first_due_date);
           const ld = parseDateValue(r.last_due_date);
           const fdStr = fd ? fd.toISOString().slice(0, 10) : '';
           const ldStr = ld ? ld.toISOString().slice(0, 10) : '';
           const windowStr = (fdStr || ldStr) ? `${fdStr}..${ldStr}` : '';
           csvRows.push([
             `"${safeName}"`,
             `"${safeSku}"`,
             `"${(r.supplier || '').replace(/"/g,'""')}"`,
             qty,
             cycleDays,
             `"${windowStr}"`,
             Number(r?.n_missed ?? 0) || 0
           ]);
           });

           const csvContent = csvRows.map(e => e.join(',')).join('\n');
           const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
           const link = document.createElement("a");
           const url = URL.createObjectURL(blob);
           link.setAttribute("href", url);
           link.setAttribute("download", `forecast_export_${new Date().toISOString().slice(0,10)}.csv`);
           link.style.visibility = 'hidden';
           document.body.appendChild(link);
           link.click();
           document.body.removeChild(link);
        });
      }

      __lwForecastRefetchFn = () => fetchDataAndRender(state);

      // Initial Load
      const initialRange = getDateRange(state.dateRangeKey);
      if (initialRange) {
        state.dateFrom = initialRange.from;
        state.dateTo = initialRange.to;
      }
      
      try {
        await fetchDataAndRender(state);
      } catch (e) {
        if (refs.countLabel) refs.countLabel.textContent = '(שגיאה)';
      } finally {
        if (deferShow && refs.wrap) refs.wrap.style.display = '';
        if (deferShow) hideForecastLoader();
      }
    }
  
    function injectForecastButton(anchorEl) {
      // anchorEl: where you want it; fallback to body
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Forecast';
      btn.style.cssText = `
        margin-inline-start: 8px;
        padding: 6px 10px;
        border-radius: 8px;
        border: 1px solid #ddd;
        background: #fff;
        cursor: pointer;
        font-weight: 700;
      `;
      btn.addEventListener('click', openForecastUI);
  
      (anchorEl || document.body).appendChild(btn);
      return btn;
    }
  
    /************************************************************
     *  Expose to page (unsafeWindow) & init
     ************************************************************/
    initSupabaseOrdersSync();
  
    // --- DRILLDOWN: גרסה סופית מאוחדת (כולל כותרת משופרת + צבעי שורות מתוקנים) ---
    
    // 1. פונקציות עזר ל-Drilldown
    function tmcNormalizeDigits(v) {
      return String(v || '').replace(/\D/g, '').trim();
    }

    function tmcEnsureDrilldownCssOnce() {
      if (document.getElementById('tmc-drilldown-css')) return;

      const style = document.createElement('style');
      style.id = 'tmc-drilldown-css';
      style.textContent = `
        /* מודאל ורקע */
        /* ---------------------------------------------------------
           Drilldown modal: single vertical scroll, no horizontal
        --------------------------------------------------------- */
        #tmc-drilldown-modal .tmc-modal-card,
        #tmc-drilldown-modal .tmc-modal-content,
        #tmc-drilldown-modal .tmc-panel {
          max-height: 85vh !important;
          display: flex !important;
          flex-direction: column !important;
        }
        #tmc-drilldown-modal .tmc-modal-body,
        #tmc-drilldown-modal .tmc-modal-inner,
        #tmc-drilldown-modal .tmc-modal-main,
        #tmc-drilldown-modal .tmc-body {
          overflow-y: auto !important;
          overflow-x: hidden !important;
          min-height: 0 !important;
        }

        /* kill nested scrollbars (the modal body should be the only scroller) */
        #tmc-drilldown-modal .tmc-outcomes-wrap,
        #tmc-drilldown-modal .tmc-table-wrap {
          max-height: none !important;
          overflow: visible !important;
        }

        /* Drilldown: single vertical scroll (prevent hiding table when outcomes is long) */
        #tmc-drilldown-modal .tmc-body {
          flex: 1 1 auto !important;
          min-height: 0 !important;  /* critical: allow scrolling to reach the table */
        }
        #tmc-drilldown-modal .tmc-table-wrap table {
          table-layout: fixed !important;
          width: 100% !important;
        }
        #tmc-drilldown-modal .tmc-table-wrap th,
        #tmc-drilldown-modal .tmc-table-wrap td {
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          vertical-align: top !important;
        }

        /* reduce table width pressure */
        #tmc-drilldown-modal table {
          width: 100% !important;
          table-layout: fixed !important;
        }
        #tmc-drilldown-modal th,
        #tmc-drilldown-modal td {
          padding: 10px 12px !important;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        #tmc-drilldown-modal .tmc-td-name,
        #tmc-drilldown-modal .tmc-td-consumption {
          white-space: normal !important;
          word-break: break-word !important;
        }

        #tmc-drilldown-modal { position: fixed; inset: 0; z-index: 2147483647; display: flex; align-items: center; justify-content: center; font-family: "Noto Sans Hebrew", Poppins, Helvetica, sans-serif; direction: rtl; }
        #tmc-drilldown-modal .tmc-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.35); backdrop-filter: none !important; }
        #tmc-drilldown-modal .tmc-panel { position: relative; width: min(980px, calc(100vw - 24px)); max-height: 85vh; overflow: hidden; background: #fff; border-radius: 12px; box-shadow: 0 12px 40px rgba(0,0,0,0.25); padding: 0; display: flex; flex-direction: column; }
        
        /* כותרת */
        #tmc-drilldown-modal .tmc-header { 
            display: flex; align-items: center; justify-content: space-between; 
            padding: 16px 20px; border-bottom: 1px solid #eaecf0; background: #fff;
            border-radius: 12px 12px 0 0;
            flex-shrink: 0;
        }
        #tmc-drilldown-modal .tmc-header-content { display: flex; align-items: center; gap: 16px; }
        #tmc-drilldown-modal .tmc-prod-thumb { width: 48px; height: 48px; border-radius: 6px; object-fit: cover; border: 1px solid #eaecf0; }
        #tmc-drilldown-modal .tmc-prod-placeholder { width: 48px; height: 48px; border-radius: 6px; background: #f2f4f7; display: flex; align-items: center; justify-content: center; font-weight: bold; color: #98a2b3; font-size: 20px; }
        
        #tmc-drilldown-modal .tmc-title-main { font-size: 18px; font-weight: 700; color: #101828; line-height: 1.2; }
        #tmc-drilldown-modal .tmc-title-sub { font-size: 13px; color: #667085; margin-top: 4px; }

        #tmc-drilldown-modal .tmc-close { border: 0; background: transparent; font-size: 24px; color: #667085; cursor: pointer; padding: 4px; transition: color 0.2s; }
        #tmc-drilldown-modal .tmc-close:hover { color: #1d2939; }
        
        /* טבלה */
        /* UX: allow vertical scroll, prevent horizontal scroll in drilldown */
        #tmc-drilldown-modal .tmc-body {
          flex: 1;
          min-height: 0;
          padding: 0;
          overflow-y: auto;   /* vertical scrollbar when content is long */
          overflow-x: hidden; /* never show horizontal scrollbar */
        }
        /* IMPORTANT: prevent nested scrollbars - only .tmc-body should scroll */
        #tmc-drilldown-modal .tmc-outcomes-wrap {
          overflow: visible !important;
          max-height: none !important;
        }
        #tmc-drilldown-modal .tmc-table-wrap {
          display: block;
          width: 100%;
          overflow: visible !important;
          max-height: none !important;
        }

        /* If something forces internal scrolling on the inner prediction table - kill it too */
        #tmc-drilldown-modal .tmc-outcomes-wrap table {
          overflow: visible !important;
          max-height: none !important;
        }

        /* Keep tables from pushing sideways */
        #tmc-drilldown-modal .tmc-outcomes-wrap,
        #tmc-drilldown-modal .tmc-table-wrap,
        #tmc-drilldown-modal table {
          max-width: 100%;
        }

        #tmc-drilldown-modal table { width: 100%; border-collapse: collapse; font-size: 13px; table-layout: fixed; }
        #tmc-drilldown-modal th, #tmc-drilldown-modal td { padding: 10px 12px; border-bottom: 1px solid #eaecf0; vertical-align: middle; text-align: right; }
        #tmc-drilldown-modal th { white-space: nowrap; }
        #tmc-drilldown-modal td { white-space: normal; overflow-wrap: anywhere; }

        /* Specific cells that must keep their compact single-line look */
        #tmc-drilldown-modal td[dir="ltr"] { white-space: nowrap; }
        #tmc-drilldown-modal .tmc-td-name { white-space: normal; }
        #tmc-drilldown-modal .tmc-td-consumption { white-space: normal; }
        #tmc-drilldown-modal th { position: sticky; top: 0; background: #f9fafb; z-index: 1; font-weight: 600; color: #475467; border-bottom: 1px solid #eaecf0; }
        #tmc-drilldown-modal th.sortable { cursor: pointer; user-select: none; transition: background 0.2s; }
        #tmc-drilldown-modal th.sortable:hover { background-color: #eaecf0; color: #101828; }
        #tmc-drilldown-modal td.tmc-td-name { white-space: normal; width: 30%; color: #101828; font-weight: 500; }

        /* Consumption cell (drilldown) */
        #tmc-drilldown-modal .tmc-cons-cell { display: flex; flex-direction: column; gap: 2px; line-height: 1.15; }
        #tmc-drilldown-modal .tmc-cons-line { font-size: 12px; color: #101828; }
        #tmc-drilldown-modal .tmc-cons-muted { font-size: 12px; color: #98a2b3; }
        #tmc-drilldown-modal .tmc-cons-sub { font-size: 11px; color: #667085; }
        #tmc-drilldown-modal .tmc-cons-badge { display: inline-block; font-size: 10px; padding: 1px 6px; border-radius: 999px; background: #f2f4f7; color: #344054; margin-inline-end: 6px; }
        #tmc-drilldown-modal .tmc-cons-warn { border: 1px solid #fed7aa; background: #fff7ed; color: #b45309; }
        #tmc-drilldown-modal .tmc-cons-divider { height: 1px; background: #f2f4f7; margin: 4px 0; }

        /* --- נקודות סטטוס --- */
        .tmc-drill-dot {
          display: inline-block !important;
          width: 8px; height: 8px;
          border-radius: 50%;
          margin-left: 8px;
          vertical-align: middle;
          flex-shrink: 0;
        }
        
        .tmc-dot-red    { background-color: #FF605C; box-shadow: 0 0 0 rgba(255, 96, 92, 0.4);   animation: pulse-red 2s infinite; }
        .tmc-dot-yellow { background-color: #FFBD44; box-shadow: 0 0 0 rgba(255, 189, 68, 0.4);  animation: pulse-yellow 2s infinite; }
        .tmc-dot-green  { background-color: #00CA4E; box-shadow: 0 0 0 rgba(0, 202, 78, 0.4);    animation: pulse-green 2s infinite; }

        @keyframes pulse-red    { 0% { box-shadow: 0 0 0 0 rgba(255, 96, 92, 0.4); } 70% { box-shadow: 0 0 0 6px rgba(255, 96, 92, 0); } 100% { box-shadow: 0 0 0 0 rgba(255, 96, 92, 0); } }
        @keyframes pulse-yellow { 0% { box-shadow: 0 0 0 0 rgba(255, 189, 68, 0.4); } 70% { box-shadow: 0 0 0 6px rgba(255, 189, 68, 0); } 100% { box-shadow: 0 0 0 0 rgba(255, 189, 68, 0); } }
        @keyframes pulse-green  { 0% { box-shadow: 0 0 0 0 rgba(0, 202, 78, 0.4); }  70% { box-shadow: 0 0 0 6px rgba(0, 202, 78, 0); }  100% { box-shadow: 0 0 0 0 rgba(0, 202, 78, 0); } }

        /* צבעי שורות - אטומים כדי למנוע ערבוב עם רקע */
        .tmc-row-due     { background: #fff5f5 !important; }
        .tmc-row-bg-yellow { background: #fff9db !important; }
        .tmc-row-bg-green  { background: #e6fffa !important; }
      `;
      document.head.appendChild(style);
    }

    // -----------------------------
    // Consumption helpers (Drilldown hydration)
    // -----------------------------
    const tmcNormalizeILPhone = (v) => {
      const s = String(v ?? '').trim();
      if (!s) return '';
      const digits = s.replace(/\D/g, '');
      if (!digits) return '';
      if (digits.startsWith('972')) {
        const rest = digits.slice(3);
        return rest.startsWith('0') ? rest : ('0' + rest);
      }
      if (digits.length === 9 && digits.startsWith('5')) return '0' + digits;
      if (digits.length === 10 && digits.startsWith('0')) return digits;
      return digits;
    };

    const tmcDaysDiffFromToday = (dateStr) => {
      if (!dateStr) return null;
      const d = new Date(dateStr);
      if (Number.isNaN(d.getTime())) return null;
      const today = new Date();
      today.setHours(0,0,0,0);
      d.setHours(0,0,0,0);
      return Math.round((d - today) / 86400000);
    };

    const LW_CONS_TTL_MS = 5 * 60 * 1000;
    let lwConsCache = { ts: 0, key: '', byPhone: new Map() };

    const tmcFetchConsumptionBatch = async (phones) => {
      const norm = Array.from(new Set((phones ?? []).map(tmcNormalizeILPhone).filter(Boolean))).sort();
      const key = norm.join(',');
      const now = Date.now();
      if (key && lwConsCache.key === key && (now - lwConsCache.ts) < LW_CONS_TTL_MS) return lwConsCache.byPhone;

      const rows = await supaRestFetch('/rest/v1/rpc/get_customer_consumption_forecast_batch', {
        method: 'POST',
        body: { p_phones: norm }
      });
      const byPhone = new Map();
      for (const r of (Array.isArray(rows) ? rows : [])) {
        const p = tmcNormalizeILPhone(r.customer_phone);
        if (!p) continue;
        if (!byPhone.has(p)) byPhone.set(p, []);
        byPhone.get(p).push(r);
      }
      lwConsCache = { ts: now, key, byPhone };
      return byPhone;
    };

    const tmcBuildConsumptionLine = (r) => {
      if (!r) return '';
      const label = tmcCatLabel ? tmcCatLabel(r.consumption_category) : '';
      if (!label) return '';

      const du = Number(r.daily_usage);
      // אין daily_usage => מבחינת UI זה "אין מספיק מידע" => לא מציגים שורת קטגוריה בכלל
      if (!Number.isFinite(du) || du <= 0) return '';

      const unit = tmcUnitShort ? tmcUnitShort(r.unit) : (r.unit || '');
      const amt = Number(r.expected_next_total_amount ?? r.last_total_amount ?? 0);
      const amtTxt = (Number.isFinite(amt) && amt > 0) ? `~${tmcFmtAmount ? tmcFmtAmount(amt) : amt}` : '';

      const daysUntil = Number.isFinite(Number(r.days_until_expected)) ? Number(r.days_until_expected) : null;
      const within14 = (r.within_14 === true) || (daysUntil !== null && Math.abs(daysUntil) <= 14);

      let tail = '';
      const ddmm = tmcFmtDDMM(r.next_expected_date);
      if (within14 && ddmm) {
        tail = `עד ${ddmm}`;
      } else if (daysUntil !== null && daysUntil < 0) {
        tail = `נגמר לפני ${Math.abs(daysUntil)} ימים`;
      } else {
        const dos = Number(r.dos_days);
        const dosDays = Number.isFinite(dos) && dos > 0 ? Math.round(dos) : null;
        tail = dosDays ? `מחזיק ≈${dosDays} ימים` : 'מחזיק';
      }

      const learnBadge =
        (r.regime_state === 'insufficient')
          ? `<span class="tmc-cons-badge" title="יש קצב צריכה, אבל עדיין אין מספיק הזמנות כדי לזהות שינוי קבוע/סטוק-אפ בוודאות">לומד</span> `
          : '';

      const title = `daily_usage=${du}` + (r.next_expected_date ? ` | next_expected_date=${r.next_expected_date}` : '') + (r.regime_state ? ` | regime_state=${r.regime_state}` : '');

      return `
    <div class="tmc-cons-line" title="${escapeHtml ? escapeHtml(title) : title}">
      ${learnBadge}<b>${label}</b>: ${amtTxt} ${unit}${tail ? ` · ${tail}` : ''}
    </div>
  `;
    };

    function tmcPickCategoryRowForSku(consRowsForPhone, skuRow, state) {
      const rows = Array.isArray(consRowsForPhone) ? consRowsForPhone : [];
      let cat = (skuRow && (skuRow.consumption_category || skuRow.consumptionCategory)) || null;
      let unit = (skuRow && (skuRow.pack_unit || skuRow.unit)) || null;

      if (!cat && state && (state.productConsumptionCategory || state.consumption_category)) {
        cat = state.productConsumptionCategory || state.consumption_category;
      }
      if (!unit && state && (state.productPackUnit || state.pack_unit)) {
        unit = state.productPackUnit || state.pack_unit;
      }

      const catNorm = cat ? String(cat).trim() : null;
      const unitNorm = unit ? String(unit).trim().toLowerCase() : null;

      if (catNorm) {
        let hit = null;
        if (unitNorm) {
          hit = rows.find(r => String(r.consumption_category || '').trim() === catNorm && String(r.unit || '').toLowerCase() === unitNorm) || null;
        }
        if (!hit) {
          hit = rows.find(r => String(r.consumption_category || '').trim() === catNorm) || null;
        }
        return hit;
      }
      for (const c of ['dog_food', 'cat_food', 'cat_litter']) {
        const h = rows.find(r => String(r.consumption_category || '').trim() === c);
        if (h) return h;
      }
      return null;
    }

    const tmcBuildProductForecastLine = (skuRow, consRowsForPhone, state) => {
      const qty = (skuRow?.last_quantity ?? skuRow?.forecast_qty ?? skuRow?.expected_qty ?? '') !== '' ? (skuRow.last_quantity ?? skuRow.forecast_qty ?? skuRow.expected_qty) : '—';
      const prodDate = skuRow?.next_expected_date ?? null;
      const ddmm = prodDate ? tmcFmtDDMM(prodDate) : '';
      const d = prodDate ? tmcDaysDiffFromToday(prodDate) : null;
      let rel = '';
      if (typeof d === 'number') {
        if (d === 0) rel = 'היום';
        else if (d === 1) rel = 'מחר';
        else if (d === -1) rel = 'אתמול';
        else if (d > 1) rel = `עוד ${d} ימים`;
        else rel = `לפני ${Math.abs(d)} ימים`;
      }
      const when = ddmm ? `צפי ${ddmm}${rel ? ` · ${rel}` : ''}` : (rel || 'אין תאריך');
      const qtyText = (qty == null || qty === '') ? '—' : `כמות צפויה ${escapeHtml(String(qty))}`;
      const dateText = ddmm || '—';

      const catRow = tmcPickCategoryRowForSku(consRowsForPhone || [], skuRow, state || {});
      const catDate = catRow?.next_expected_date ?? null;
      const catLabel = tmcCatLabel(catRow?.consumption_category || skuRow?.consumption_category || '') || 'הקטגוריה';
      const warn = tmcGapWarnBadge(prodDate, catDate, catLabel);

      return `<div class="tmc-cons-line"><span class="tmc-cons-badge">למוצר הזה</span> <span>${qtyText}</span> · צפי ${escapeHtml(dateText)} ${warn}</div>`;
    };

    const tmcHydrateDrilldownConsumption = async (wrap, sortedRows, state) => {
      state.__consToken = (state.__consToken ?? 0) + 1;
      const token = state.__consToken;
      const rowByPhone = new Map();
      const phones = [];
      for (const r of (sortedRows ?? [])) {
        const p = tmcNormalizeILPhone(r.customer_key || r.customer_phone);
        if (!p) continue;
        rowByPhone.set(p, r);
        phones.push(p);
      }
      if (!phones.length) return;

      let byPhone;
      try {
        byPhone = await tmcFetchConsumptionBatch(phones);
      } catch (e) {
        console.warn('[Consumption] batch failed', e);
        return;
      }
      if (token !== state.__consToken) return;

      wrap.querySelectorAll('td.tmc-td-consumption').forEach(td => {
        const p = tmcNormalizeILPhone(td.getAttribute('data-customer-phone'));
        const skuRow = rowByPhone.get(p);
        const consRowsForPhone = (byPhone.get(p) ?? []).slice().sort((a,b) => String(a.consumption_category || '').localeCompare(String(b.consumption_category || '')));
        const dog = (consRowsForPhone || []).find(r => r.consumption_category === 'dog_food');
        const cat = (consRowsForPhone || []).find(r => r.consumption_category === 'cat_food');
        const lit = (consRowsForPhone || []).find(r => r.consumption_category === 'cat_litter');

        const catLines = [
          tmcBuildConsumptionLine(dog),
          tmcBuildConsumptionLine(cat),
          tmcBuildConsumptionLine(lit),
        ].filter(Boolean);

        const prodLine = tmcBuildProductForecastLine(skuRow || {}, consRowsForPhone, state);
        const divider = catLines.length ? `<div class="tmc-cons-divider"></div>` : '';

        const content = catLines.join('') + divider + prodLine;
        td.innerHTML = `<div class="tmc-cons-cell">${content}</div>`;
      });
    };

    function tmcStatusUi(statusRaw) {
      const status = String(statusRaw || '').trim();
      if (status === 'due_or_late') return { dot: 'tmc-drill-dot tmc-dot-red',    row: 'tmc-row-due',       text: 'באיחור' };
      if (status === 'soon')        return { dot: 'tmc-drill-dot tmc-dot-green',  row: 'tmc-row-bg-green', text: 'בקרוב' };
      if (status === 'not_yet')     return { dot: 'tmc-drill-dot tmc-dot-yellow', row: 'tmc-row-bg-yellow', text: 'בתחזית' };
      if (status === 'insufficient_history') return { dot: '', row: '', text: 'אין מספיק היסטוריה' };
      
      return { dot: '', row: '', text: 'היסטוריה' };
    }

    function calcDosDays(row) {
      // prefer server-provided dos_days if exists
      const v = Number(row?.dos_days);
      if (Number.isFinite(v) && v > 0) return v;
      const amt = Number(row?.expected_next_total_amount);
      const du = Number(row?.daily_usage);
      if (!Number.isFinite(amt) || !Number.isFinite(du) || du <= 0) return null;
      return amt / du;
    }

    function isWithinPlusMinusDays(dateStr, days) {
      try {
        if (!dateStr) return false;
        const d = new Date(dateStr);
        if (Number.isNaN(d.getTime())) return false;
        const today = new Date();
        today.setHours(0,0,0,0);
        d.setHours(0,0,0,0);
        const diffDays = Math.round((d - today) / 86400000);
        return Math.abs(diffDays) <= days;
      } catch (_) {
        return false;
      }
    }

    /** Cache ל־get_customer_consumption_forecast_batch – TTL 10 min, key = sorted phones */
    const CONSUMPTION_FORECAST_BATCH_CACHE = new Map();
    const CONSUMPTION_FORECAST_TTL_MS = 10 * 60 * 1000;

    /** נרמול טלפון ישראל: DB בדרך כלל "0XXXXXXXXX", UI לפעמים "9725..." או בלי 0 – מחזיר תמיד מפתח אחיד. */
    function normalizeILPhone(input) {
      let s = String(input || '').trim();
      if (!s) return '';
      s = s.replace(/\D/g, '');
      if (!s) return '';
      if (s.startsWith('972') && s.length >= 12) s = '0' + s.slice(3);
      if (s.length === 9 && s[0] !== '0') s = '0' + s;
      return s;
    }

    async function getCustomerConsumptionForecastBatchCached(phones) {
      const list = Array.from(new Set((phones || [])
        .map(p => tmcNormalizeILPhone(p))
        .filter(Boolean)
      ));
      if (!list.length) return { byPhone: {}, error: null, phonesSent: [], rowsCount: 0 };
      const cacheKey = `lw_consumption_forecast_batch:v${LW_CONSUMPTION_BATCH_CACHE_VERSION}:${list.slice().sort().join('|')}`;
      const now = Date.now();
      const cached = CONSUMPTION_FORECAST_BATCH_CACHE.get(cacheKey);
      if (cached && (now - cached.ts) < CONSUMPTION_FORECAST_TTL_MS) return cached.data;
      try {
        const data = await supaRestFetch('/rest/v1/rpc/get_customer_consumption_forecast_batch', {
          method: 'POST',
          body: { p_phones: list }
        });
        let rows = Array.isArray(data) ? data : (data ? [data] : []);
        // IMPORTANT: Do NOT filter rows out by date here.
        // We want consumption to exist for every customer in drilldown.
        // We'll decide in UI whether to show the date (±14) or show "holds ≈X days".
        const byPhone = {};
        rows.forEach(row => {
          const key = tmcNormalizeILPhone(row.customer_phone);
          if (!key) return;
          if (!byPhone[key]) byPhone[key] = [];
          byPhone[key].push(row);
        });
        const out = { byPhone, error: null, phonesSent: list, rowsCount: rows.length };
        CONSUMPTION_FORECAST_BATCH_CACHE.set(cacheKey, { ts: now, data: out });
        if (LW_ORDERS_CONFIG.DEBUG) {
          console.log('[Consumption] batch', { phonesSent: out.phonesSent, rowsCount: out.rowsCount, byPhoneKeys: Object.keys(byPhone) });
        }
        return out;
      } catch (e) {
        const out = { byPhone: {}, error: e, phonesSent: list, rowsCount: 0 };
        CONSUMPTION_FORECAST_BATCH_CACHE.set(cacheKey, { ts: now, data: out });
        console.warn('[Consumption] get_customer_consumption_forecast_batch failed:', e?.message || e);
        return out;
      }
    }

    function __fmtShortDate(d) {
      if (!d) return null;
      const dt = new Date(d);
      if (Number.isNaN(dt.getTime())) return null;
      return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}`;
    }

    function __fmtAmount(n) {
      const x = Number(n);
      if (!Number.isFinite(x)) return null;
      const r = (Math.round(x * 10) / 10);
      return (Math.abs(r - Math.round(r)) < 1e-9) ? String(Math.round(r)) : String(r);
    }

    // Small, non-intrusive behavior badge (stock-up / shift / return)
    function getConsumptionBehaviorBadge(row) {
      if (!row) return null;
      const state = String(row.regime_state || '');

      if (row.stock_up === true) {
        return { icon: '📦', title: 'Stock-up חד פעמי (הוזמן יותר מהרגיל פעם אחת)' };
      }
      if (state === 'shift_up') {
        return { icon: '⬆️', title: 'שינוי קבוע: הלקוח עבר לרמה גבוהה יותר' };
      }
      if (state === 'shift_down') {
        return { icon: '⬇️', title: 'שינוי קבוע: הלקוח עבר לרמה נמוכה יותר' };
      }
      if (state === 'return_up' || state === 'return_down') {
        return { icon: '↩️', title: 'חזרה לרמה קודמת (אחרי תקופה שונה)' };
      }
      return null;
    }

    function formatNumMaybe(x) {
      if (x === null || x === undefined || x === '') return '—';
      const n = Number(x);
      if (!Number.isFinite(n)) return String(x);
      return (Math.round(n * 100) / 100).toString();
    }

    function __pickLatestRow(rows, category) {
      const r = (rows || []).filter(x => x && x.consumption_category === category);
      if (!r.length) return null;
      r.sort((a,b) => new Date(b.last_order_date || 0) - new Date(a.last_order_date || 0));
      return r[0];
    }

    function __consumptionCellHtml(phone, byPhone, error) {
      ensureTmcConsumptionCss();
      if (error) {
        const msg = (error && (error.message || String(error))) || 'RPC error';
        return `<span class="tmc-td-consumption"><div class="tmc-cons-line" title="${escapeHtml(msg)}" style="color:#b42318;">⚠ תקלה</div></span>`;
      }
      const phoneKey = tmcNormalizeILPhone(phone);
      const rows = (byPhone && byPhone[phoneKey]) ? byPhone[phoneKey] : [];

      // keep only known categories; one row per category (first found)
      const byCat = new Map();
      for (const r of (rows || [])) {
        const lbl = tmcCatLabel(r && r.consumption_category);
        if (!lbl) continue;
        if (!byCat.has(r.consumption_category)) byCat.set(r.consumption_category, r);
      }

      if (byCat.size === 0) {
        return `<span class="tmc-td-consumption"><div class="tmc-cons-line tmc-cons-muted" title="אין נתונים">אין נתונים</div></span>`;
      }

      function badge(r) {
        if (r && r.stock_up) return `<span class="tmc-cons-badge" title="📦 קנייה גדולה חד־פעמית (stock-up) – דוחה את הצפי אבל לא בהכרח משנה צריכה קבועה">📦</span>`;
        return '';
      }

      function suffix(r) {
        const ddmm = tmcFmtDDMM(r && r.next_expected_date);
        const within14 = typeof r?.within_14 === 'boolean' ? r.within_14 : isWithinPlusMinusDays(r?.next_expected_date, 14);
        let dos = Number(r && r.dos_days);
        if (!Number.isFinite(dos)) dos = calcDosDays(r);
        if (within14 && ddmm) return `עד ${ddmm}`;
        if (Number.isFinite(dos) && dos >= 3 && dos <= 365) return `מחזיק ≈${Math.round(dos)} ימים`;
        return `חסר היסטוריה`;
      }

      const order = ['dog_food', 'cat_food', 'cat_litter'];
      const lines = order
        .filter(c => byCat.has(c))
        .map(c => {
          const r = byCat.get(c);
          const lbl = tmcCatLabel(c);
          const unit = tmcUnitShort(r && r.unit);
          const amt = tmcFmtAmount((r && (r.expected_next_total_amount ?? r.last_total_amount)));
          const titleParts = [];
          if (r && r.daily_usage != null) titleParts.push(`daily_usage=${r.daily_usage}`);
          if (r && r.regime_state) titleParts.push(`regime=${r.regime_state}`);
          if (r && r.next_expected_date) titleParts.push(`next_expected_date=${r.next_expected_date}`);
          const title = titleParts.join(' | ') || '';
          if (!amt || !unit) return '';
          return `<div class="tmc-cons-line" title="${escapeHtml(title)}"><b>${lbl}</b>: ~${escapeHtml(amt)} ${escapeHtml(unit)} · ${suffix(r)}${badge(r)}</div>`;
        })
        .filter(Boolean)
        .join('');

      return `<span class="tmc-td-consumption">${lines}</span>`;
    }

    function formatConsumptionCell(phone, byPhone, err) {
      if (err) {
        const msg = (err && err.message) ? String(err.message) : 'שגיאה בקבלת תחזית צריכה';
        return `<span class="tmc-td-consumption" title="${escapeHtml(msg)}" style="color:#f04438;"><i class="fa-light fa-triangle-exclamation"></i> שגיאה</span>`;
      }
      if (byPhone === undefined || byPhone === null) {
        return '<span class="tmc-td-consumption tmc-consumption-loading" style="color:#98a2b3;">…</span>';
      }
      const phoneKey = tmcNormalizeILPhone(phone);
      if (!phoneKey) return '<span class="tmc-td-consumption" style="color:#98a2b3;">—</span>';
      const forecastRows = (byPhone && phoneKey) ? (byPhone[phoneKey] || []) : [];
      const labels = { dog_food: 'אוכל לכלב', cat_food: 'אוכל לחתול', cat_litter: 'חול' };
      const icons = { dog_food: '🐶', cat_food: '🐱', cat_litter: '🐱🧻' };
      const unitLabels = { kg: 'ק״ג', l: 'ל׳' };
      const parts = [];
      for (const cat of ['dog_food', 'cat_food', 'cat_litter']) {
        const row = (forecastRows || []).find(r => r.consumption_category === cat && r.status === 'ok');
        if (row) {
          const amt = Number(row.expected_next_total_amount);
          const unit = (row.unit || 'kg').toLowerCase();
          const amtStr = Number.isFinite(amt) ? (amt < 10 ? (Math.round(amt * 10) / 10).toString().replace(/\.0$/, '') : String(Math.round(amt))) : '?';
          const due = row.next_expected_date ? `${String(new Date(row.next_expected_date).getDate()).padStart(2,'0')}/${String(new Date(row.next_expected_date).getMonth()+1).padStart(2,'0')}` : '';
          const tip = row.level_up ? `זוהה מעבר לכמות גבוהה יותר. הזמנה אחרונה: ${row.last_total_amount} ${unitLabels[unit] || unit}` : `צריכה יומית: ~${Number(row.daily_usage || 0).toFixed(2)} ${unitLabels[unit] || unit}`;
          parts.push(`<div title="${escapeHtml(tip)}" style="margin:2px 0;font-size:12px;">${icons[cat] || '📦'} ~${amtStr} ${unitLabels[unit] || unit}${due ? ' עד ' + due : ''}</div>`);
        } else {
          const other = (forecastRows || []).find(r => r.consumption_category === cat);
          const status = other?.status;
          const msg = status === 'mixed' ? 'מצעים ביחידות מעורבות' : (status === 'insufficient_data' ? 'חסר משקל/יחידה' : 'אין נתונים');
          parts.push(`<div title="${escapeHtml(msg)}" style="margin:2px 0;font-size:12px;color:#98a2b3;">${icons[cat] || '📦'} —</div>`);
        }
      }
      return `<span class="tmc-td-consumption">${parts.join('')}</span>`;
    }

    async function tmcFetchCustomerForecastBySku(sku, opts = {}) {
      const normalizedSku = tmcNormalizeDigits(sku);
      if (!normalizedSku) return [];

      if (typeof supaRestFetch !== 'function') {
        console.error('supaRestFetch not found');
        return [];
      }

      // נסה לחלץ תאריכים ישירות מה-opts (אם הגיעו מ-drilldown) או דרך חישוב הטווח
      let dateFrom = opts.dateFrom || null;
      let dateTo = opts.dateTo || null;

      // אם לא הגיעו ישירות, נסה לחשב דרך getPlanningRange
      if (!dateFrom || !dateTo) {
          const range = (typeof getPlanningRange === 'function') ? getPlanningRange(opts) : null;
          if (range) {
              dateFrom = toISODate(range.from);
              dateTo = toISODate(range.to);
          }
      }

      // ★ לוג דיבאג קריטי: מה אנחנו שולחים לשרת? ★
      console.log(`[Drilldown Debug] SKU: ${normalizedSku}, Range Key: ${opts.dateRangeKey}`);
      console.log(`[Drilldown Debug] Sending Dates -> From: ${dateFrom}, To: ${dateTo}`);

      // הגנה: אם זה טווח מותאם אישית ואין תאריכים, אל תעשה fallback! זה רק יביא זבל.
      const isCustom = opts.dateRangeKey === 'טווח מותאם אישית' || (Array.isArray(opts.dateRangeKeys) && opts.dateRangeKeys.includes('טווח מותאם אישית'));

      if ((!dateFrom || !dateTo) && isCustom) {
          console.warn('[Drilldown] Custom range selected but dates are missing. Aborting fetch to prevent fallback to defaults.');
          return [];
      }

      // Fallback (ברירת מחדל) - פעיל רק אם זה *לא* טווח מותאם אישית
      if (!dateFrom || !dateTo) {
        console.log('[Drilldown] No specific range found, using DEFAULT wide range (-365 to +180)');
        const today0 = new Date(); today0.setHours(0,0,0,0);
        const from = new Date(today0); from.setDate(from.getDate() - 365);
        const to = new Date(today0);   to.setDate(to.getDate() + 180);
        dateFrom = toISODate(from);
        dateTo = toISODate(to);
      }

      const minOrders = (typeof FORECAST_MIN_ORDERS === 'number' ? FORECAST_MIN_ORDERS : 3);

      const rpcRows = await supaRestFetch('/rest/v1/rpc/forecast_dos_drilldown_by_range_active', {
        method: 'POST',
        body: {
          p_date_from: dateFrom,
          p_date_to: dateTo,
          p_sku: normalizedSku,
          p_min_orders: minOrders
        }
      });

      const today0 = new Date(); today0.setHours(0,0,0,0);

      const mapped = Array.isArray(rpcRows) ? rpcRows.map((r) => {
        const nextExpected = r?.due_date ? new Date(r.due_date) : null;
        if (nextExpected) nextExpected.setHours(0,0,0,0);
        const daysUntil = nextExpected ? Math.round((nextExpected.getTime() - today0.getTime()) / (24*60*60*1000)) : null;

        return {
          sku: r?.sku_canon || normalizedSku,
          sku_raw: r?.sku_raw || '',
          product_name: r?.product_name || '',
          customer_name: r?.customer_name || '',
          customer_phone: r?.customer_phone || '',
          customer_key: r?.customer_phone || '',
          status: r?.status || '',
          last_quantity: (r?.recommended_qty != null ? String(r.recommended_qty) : ''),
          avg_gap_days_recent: (r?.days_of_supply != null ? Number(r.days_of_supply) : null), // DOS
          next_expected_date: r?.due_date || null,
          days_until_expected: daysUntil,
          last_order_date: r?.last_order_date || null,
          total_orders: (r?.total_orders != null ? Number(r.total_orders) : null),
          n_orders: (r?.total_orders != null ? Number(r.total_orders)
                : (r?.n_orders != null ? Number(r.n_orders) : 0)),
        };
      }) : [];

      return mapped;
    }

    // 2. הפונקציה הראשית
    unsafeWindow.openProductDrilldown = async function(sku, opts = {}) {
      const normalizedSku = tmcNormalizeDigits(sku);
      if (!normalizedSku) return;

      // 1. איתור שם מוצר ותמונה
      let productName = 'מוצר לא ידוע';
      let supplierName = '';
      let barcode = '';
      // ניסיון למצוא את השם מתוך המערך הגלובלי שנטען בטבלה הראשית
      if (typeof forecastProductRows !== 'undefined' && Array.isArray(forecastProductRows)) {
          const found = forecastProductRows.find(r => String(r.sku).trim() === normalizedSku);
          if (found && found.product_name) productName = found.product_name;
          if (found && found.supplier) supplierName = String(found.supplier).trim();
          if (found && found.barcode) barcode = String(found.barcode).trim();
      }

      // Try catalog lookup for barcode/supplier (if available)
      try {
        const cat = getCatalogForSku(normalizedSku);
        if (cat) {
          if (!barcode && cat.barcode) barcode = String(cat.barcode).trim();
          if (!supplierName && cat.supplier) supplierName = String(cat.supplier).trim();
        }
      } catch {}
      
      // ודא שלפחות ה-SKU הזה נטען מ-Supabase (retry כבר בפנים)
      try { await loadProductImages([normalizedSku]); } catch {}

      const thumbUrl = getProductThumbUrl(normalizedSku);

      // ניקוי מודאלים ישנים
      ['tmc-fc-drilldown-modal', 'tmc-drilldown-modal'].forEach(id => { try { document.getElementById(id)?.remove(); } catch {} });
      document.querySelectorAll('.tmc-modal-overlay').forEach(el => { if(el.id && el.id.includes('drill')) el.remove(); });
      
      // הזרקת CSS
      tmcEnsureDrilldownCssOnce();

      // יצירת המודאל
      const root = document.createElement('div');
      root.id = 'tmc-drilldown-modal';
      
      const overlay = document.createElement('div');
      overlay.className = 'tmc-overlay';
      overlay.onclick = () => root.remove();

      const panel = document.createElement('div');
      panel.className = 'tmc-panel';
      
      // בניית הכותרת המשופרת
      const imgHtml = thumbUrl 
        ? `<img src="${thumbUrl}" class="tmc-prod-thumb">`
        : `<div class="tmc-prod-placeholder">${productName.charAt(0)}</div>`;
      const skuOrBarcode = barcode || normalizedSku;
      const supplierLine = supplierName ? `<div class="tmc-title-sub">${escapeHtml(supplierName)}</div>` : '';

      panel.innerHTML = `
        <div class="tmc-header">
          <div class="tmc-header-content">
             ${imgHtml}
             <div>
               <div class="tmc-title-main">תחזית לקוחות ל${escapeHtml(productName)}</div>
               <div class="tmc-title-sub">${escapeHtml(skuOrBarcode)}</div>
               ${supplierLine}
             </div>
          </div>
          <button class="tmc-close" onclick="document.getElementById('tmc-drilldown-modal').remove()">✕</button>
        </div>
        <div class="tmc-body">
          <div class="tmc-loading" style="padding:40px; text-align:center; color:#666;">
            <i class="fa fa-spinner fa-spin" style="font-size:24px; margin-bottom:10px; display:block;"></i>
            טוען נתונים...
          </div>
          <div class="tmc-forecast-explanation" style="display:none; font-size:12px; color:#667085; padding:8px 0 12px; border-bottom:1px solid #eaecf0; margin-bottom:12px;">
            התחזית מתייחסת להזמנה הבאה (לא להזמנה האחרונה). עמודות "הזמנה אחרונה" ו"צפי" = מתי הייתה ההזמנה האחרונה ומתי צפויה הבאה; סימון "התגשמה" יופיע רק כשיהיה תאריך התקבלה בתוך חלון הצפי.
          </div>
          <div class="tmc-outcomes-wrap" style="display:none; margin-bottom:16px;"></div>
          <div class="tmc-table-wrap" style="display:none;"></div>
        </div>
      `;

      root.appendChild(overlay);
      root.appendChild(panel);
      document.body.appendChild(root);

      // שליפת נתונים – מק"ט וברקוד: אותו מוצר, שני מזהים
      let rows = [];
      try {
        const cat = getCatalogForSku(normalizedSku);
        const aliases = new Set([normalizedSku, String(sku || '').trim(), barcode]);
        if (cat?.sku) aliases.add(String(cat.sku).trim());
        if (cat?.barcode) aliases.add(String(cat.barcode).trim());
        const skuAliases = Array.from(aliases).filter(Boolean);
        rows = await tmcFetchCustomerForecastBySku(normalizedSku, { ...opts, skuAliases });
      } catch (e) {
        console.error(e);
        panel.querySelector('.tmc-loading').textContent = 'שגיאה בטעינת נתונים';
        return;
      }

      // predicate אחד: אותו לוגיקה כמו "מתי צפוי" ו"כמה להזמין"
      const range = getPlanningRange(opts);
      const rowsBeforeFilter = (rows || []).length;
      rows = tmcFilterRowsToPlanningRange(
        (rows || []).map(r => ({ ...r, status: normalizeForecastStatus(r) })),
        opts,
        range,
        'drilldown'
      );

      if (typeof console !== 'undefined' && console.log && /^\s*(1|true|yes)\s*$/i.test(String(tmcGetFlag('TMC_DRILLDOWN_DEBUG') || ''))) {
        const allDates = (rows || []).map(r => r.next_expected_date).filter(Boolean).sort();
        console.log('[DRILLDOWN] key=', opts?.dateRangeKey, 'range=', range ? { from: range.from, to: range.to } : null);
        console.log('[DRILLDOWN] rows=', rowsBeforeFilter, 'filtered=', rows?.length);
        console.log('[DRILLDOWN] filtered date min/max=', allDates[0] ?? null, allDates[allDates.length - 1] ?? null);
      }

      if (!rows || !rows.length) {
        panel.querySelector('.tmc-loading').textContent = 'לא נמצאו לקוחות עם תחזית פעילה למוצר זה (באיחור / בקרוב / בתחזית) בטווח הנבחר.';
        return;
      }

      let productConsumptionCategory = null;
      let productPackUnit = null;
      try {
        const enriched = typeof getEnrichedByKey === 'function'
          ? (getEnrichedByKey(normalizedSku) || getEnrichedByKey(barcode))
          : null;
        if (enriched) {
          productConsumptionCategory = enriched.consumption_category || null;
          productPackUnit = enriched.pack_unit || null;
        }
      } catch (_) {}
      const sortState = {
        sortCol: 'status',
        sortDir: 'asc',
        productConsumptionCategory,
        productPackUnit
      };

      function sortDrilldownRows(list, state) {
        const dir = state.sortDir === 'asc' ? 1 : -1;
        const isHistory = (r) => {
          const status = String(r.status || '').trim();
          return status !== 'due_or_late' && status !== 'soon' && status !== 'not_yet';
        };
        const statusRank = (s) => (s === 'due_or_late' ? 0 : s === 'soon' ? 1 : s === 'not_yet' ? 2 : 3);
        const toTime = (v) => (v ? new Date(v).getTime() : null);

        return [...list].sort((a, b) => {
          const aHistory = isHistory(a);
          const bHistory = isHistory(b);
          if (aHistory !== bHistory) return aHistory ? 1 : -1;
          let valA;
          let valB;
          switch (state.sortCol) {
            case 'customer_name':
              valA = (a.customer_name || '').toString().toLowerCase();
              valB = (b.customer_name || '').toString().toLowerCase();
              break;
            case 'status':
              valA = statusRank(a.status);
              valB = statusRank(b.status);
              break;
            case 'last_order_date':
            case 'next_expected_date': {
              const timeA = toTime(a[state.sortCol]);
              const timeB = toTime(b[state.sortCol]);
              valA = timeA != null ? timeA : (dir > 0 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY);
              valB = timeB != null ? timeB : (dir > 0 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY);
              break;
            }
            case 'days_until_expected':
            case 'n_orders':
            case 'last_quantity':
            case 'avg_gap_days_recent':
              valA = a[state.sortCol] ?? 0;
              valB = b[state.sortCol] ?? 0;
              break;
            default:
              valA = (a[state.sortCol] ?? '').toString().toLowerCase();
              valB = (b[state.sortCol] ?? '').toString().toLowerCase();
          }
          if (valA < valB) return -1 * dir;
          if (valA > valB) return 1 * dir;
          const absDays = (r) => Math.abs(Number(r.days_until_expected) ?? 999);
          const absA = absDays(a);
          const absB = absDays(b);
          if (absA !== absB) return absA - absB;
          const nA = Number(a.n_orders) ?? 0;
          const nB = Number(b.n_orders) ?? 0;
          return nB - nA;
        });
      }

      // טען תוצאות תחזית (התגשמה/פוספסה) ברקע – לא חוסם את הצגת הטבלה
      let allOutcomes = [];
      let filteredByRange = [];
      let outcomesMeta = { total: 0, inRange: 0, shown: 0, historyFulfilled: 0, historyMissed: 0, rangeFulfilled: 0, rangeMissed: 0 };
      function loadOutcomesInBackground() {
        let outDateFrom = opts.dateFrom || null;
        let outDateTo = opts.dateTo || null;
        if (!outDateFrom || !outDateTo) {
          const outRange = (typeof getPlanningRange === 'function') ? getPlanningRange(opts) : null;
          if (outRange) { outDateFrom = toISODate(outRange.from); outDateTo = toISODate(outRange.to); }
        }
        const predUrl = `/rest/v1/forecast_predictions?status=in.(fulfilled,missed)&sku=eq.${encodeURIComponent(normalizedSku)}&select=id,customer_name,due_date,expected_order_date,matched_order_date,diff_days,status,created_at&order=matched_order_date.desc&limit=50`;
        supaRestFetch(predUrl, { method: 'GET' }).then((predData) => {
          allOutcomes = Array.isArray(predData) ? predData : [];
          const outFrom = outDateFrom ? new Date(outDateFrom) : null;
          const outTo = outDateTo ? new Date(outDateTo) : null;
          if (outFrom) outFrom.setHours(0, 0, 0, 0);
          if (outTo) outTo.setHours(23, 59, 59, 999);
          const inRange = (d) => {
            if (!d || !outFrom || !outTo) return true;
            const x = new Date(d); x.setHours(0, 0, 0, 0);
            return x >= outFrom && x <= outTo;
          };
          filteredByRange = outFrom && outTo ? allOutcomes.filter((o) => inRange(o.due_date) || inRange(o.matched_order_date)) : allOutcomes;
          outcomesMeta = {
            total: allOutcomes.length,
            inRange: filteredByRange.length,
            shown: 0,
            historyFulfilled: allOutcomes.filter(o => o.status === 'fulfilled').length,
            historyMissed: allOutcomes.filter(o => o.status === 'missed').length,
            rangeFulfilled: filteredByRange.filter(o => o.status === 'fulfilled').length,
            rangeMissed: filteredByRange.filter(o => o.status === 'missed').length
          };
          renderOutcomesSection(tmcShowAllOutcomes);
        }).catch(() => {});
      }

      let tmcShowAllOutcomes = true;
      function renderOutcomesSection(showAll) {
        const wrap = panel.querySelector('.tmc-outcomes-wrap');
        if (!wrap) return;
        const outcomes = showAll ? allOutcomes : filteredByRange;
        const toShow = outcomes.slice(0, 20);
        outcomesMeta.shown = toShow.length;
        if (allOutcomes.length === 0) {
          wrap.style.display = 'none';
          return;
        }
        wrap.style.display = 'block';
        const fmt = (d) => {
          if (!d) return '—';
          const x = new Date(d);
          return `${String(x.getDate()).padStart(2,'0')}/${String(x.getMonth()+1).padStart(2,'0')}/${x.getFullYear()}`;
        };
        const m = outcomesMeta;
        const scopeText = m.total > 0
          ? (m.inRange !== m.total
            ? `סה״כ היסטוריה מלאה: ✅${m.historyFulfilled} ❌${m.historyMissed}. בטווח הנבחר: ✅${m.rangeFulfilled} ❌${m.rangeMissed}. כרגע מוצגות: ${toShow.length} רשומות${showAll ? ' (כולל מחוץ לטווח)' : ' (בטווח בלבד)'}.`
            : `סה״כ היסטוריה מלאה: ✅${m.historyFulfilled} ❌${m.historyMissed}. כרגע מוצגות: ${toShow.length}.`)
          : 'מוצגות רשומות בטווח הנבחר.';
        const rowsHtml = toShow.map(o => {
          const isFulfilled = o.status === 'fulfilled';
          const color = isFulfilled ? '#12b76a' : '#f04438';
          const icon = isFulfilled ? '✅' : '❌';
          let statusTxt;
          if (isFulfilled) {
            statusTxt = 'התגשמה';
          } else if (o.diff_days != null) {
            const abs = Math.abs(o.diff_days);
            statusTxt = o.diff_days < 0
              ? `חרג מוקדם (${abs} ימים)`
              : `חרג מאוחר (${abs} ימים)`;
          } else {
            statusTxt = 'חרג מהחלון';
          }
          const createdTip = o.created_at
            ? `תחזית נוצרה: ${fmt(o.created_at)}. אם נוצרה אחרי "התקבל" — שידוך שגוי.`
            : 'כל הערכים מהטבלה forecast_predictions (snapshot).';
          const expectDate = o.expected_order_date || o.due_date;
          return `<tr><td>${icon}</td><td>${escapeHtml(o.customer_name || '—')}</td><td dir="ltr" title="${createdTip}">${fmt(expectDate)}</td><td dir="ltr">${fmt(o.matched_order_date)}</td><td style="color:${color};font-weight:600;" title="השוואה ל־expected_order_date; חלון ±14 ימים">${statusTxt}</td></tr>`;
        }).join('');
        const toggleId = 'tmc-show-all-preds-' + normalizedSku.replace(/\D/g, '');
        wrap.innerHTML = `
          <div style="background:#f9fafb; border:1px solid #eaecf0; border-radius:8px; padding:12px 16px;">
            <div style="font-weight:600; color:#475467; margin-bottom:8px;">דיוק תחזית (התגשמה = ±14 ימים מצפי הזמנה)</div>
            <div style="font-size:11px; color:#98a2b3; margin-bottom:8px;">התחזית מתייחסת להזמנה הבאה; אין עדיין סימון התגשמה = עדיין לא הייתה הזמנה בתוך חלון הצפי. צפי/התקבל/סטטוס מהטבלה forecast_predictions. ${scopeText}</div>
            <label style="font-size:11px; color:#667085; display:inline-flex; align-items:center; gap:6px; margin-bottom:8px; cursor:pointer;">
              <input type="checkbox" id="${toggleId}" ${showAll ? 'checked' : ''}>
              הצג גם תחזיות מחוץ לטווח
            </label>
            <table data-tm-static-links="1" style="width:100%; font-size:12px;"><thead><tr><th></th><th>לקוח</th><th>צפי הזמנה</th><th>התקבל</th><th>סטטוס</th></tr></thead><tbody>${rowsHtml}</tbody></table>
          </div>`;
        const cb = wrap.querySelector('#' + toggleId);
        if (cb) {
          cb.addEventListener('change', () => {
            tmcShowAllOutcomes = cb.checked;
            renderOutcomesSection(tmcShowAllOutcomes);
          });
        }
      }

      renderOutcomesSection(tmcShowAllOutcomes);

      function renderDrilldownTable(list, state) {
        const sorted = sortDrilldownRows(list, state);
        const html = [];
        const iconFor = (key) => {
          if (state.sortCol !== key) return '';
          const iconClass = state.sortDir === 'desc' ? 'fa-arrow-down' : 'fa-arrow-up';
          return `<i class="fa-light ${iconClass} tmc-sort-icon"></i>`;
        };

        const __normPhoneFromKey = (key) => {
          const d = String(key || '').replace(/\D/g,'');
          if (!d) return null;
          let x = d;
          if (x.startsWith('972')) x = '0' + x.slice(3);
          if (x.length === 9 && !x.startsWith('0')) x = '0' + x;
          if (x.length < 8) return null;
          return x;
        };

        html.push(`
          <table data-tm-static-links="1">
            <thead>
              <tr>
                <th class="sortable" data-col="customer_name" style="width:25%;" title="שם הלקוח + מזהה/טלפון">${iconFor('customer_name')}לקוח</th>
                <th class="sortable" data-col="status" title="סטטוס התחזית לפי תאריך צפוי">${iconFor('status')}סטטוס</th>
                <th title="תחזית צריכה לפי קטגוריה (מזון/חול) + שורת 'למוצר הזה'">צריכה</th>
                <th class="sortable" data-col="last_quantity" title="כמות מומלצת להזמנה עכשיו (בדרך כלל כמות אחרונה; אם הייתה סטוקאפ, מתוקן לכמות טיפוסית)">${iconFor('last_quantity')}כמות צפויה</th>
                <th class="sortable" data-col="avg_gap_days_recent" title="מחזיק להזמנה (DOS): כמה ימים הכמות המומלצת מחזיקה. מוצג גם ≈ ימים ליחידה (מחזיק/כמות)">${iconFor('avg_gap_days_recent')}מחזיק (ימים)</th>
                <th class="sortable" data-col="last_order_date" title="תאריך ההזמנה האחרונה של הלקוח למוצר">${iconFor('last_order_date')}הזמנה אחרונה</th>
                <th class="sortable" data-col="next_expected_date" title="התאריך הצפוי הבא לפי DOS">${iconFor('next_expected_date')}צפי</th>
                <th class="sortable" data-col="n_orders" title="מספר ההזמנות ההיסטוריות של הלקוח למוצר">${iconFor('n_orders')}הזמנות עבר</th>
              </tr>
            </thead>
            <tbody>
        `);

        for (const r of sorted) {
          const ui = tmcStatusUi(r.status);

          const fmtDate = (dStr) => {
            if (!dStr) return '—';
            const d = new Date(dStr);
            return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
          };
          const lastOrder = fmtDate(r.last_order_date);
          const isActiveForecastStatus = r.status === 'due_or_late' || r.status === 'soon' || r.status === 'not_yet';
          const forecastQty =
            (!isActiveForecastStatus || r.last_quantity == null || Number.isNaN(Number(r.last_quantity)))
              ? null
              : Number(r.last_quantity);
          const avgGapDays = Number(r.avg_gap_days_recent);
          const avgGapDisplay = Number.isFinite(avgGapDays) ? Math.round(avgGapDays) : '—';

          const __forecastQtyNum = Number(r?.last_quantity ?? r?.recommended_qty ?? NaN);
          const __perUnitDays = (Number.isFinite(avgGapDays) && Number.isFinite(__forecastQtyNum) && __forecastQtyNum > 1)
            ? (avgGapDays / __forecastQtyNum)
            : null;
          const __perUnitDisplay = (Number.isFinite(__perUnitDays) ? Math.max(1, Math.round(__perUnitDays)) : null);
          const avgGapCellHtml = (__perUnitDisplay
            ? `${avgGapDisplay} <span style="font-size:11px;color:#98A2B3;">(≈${__perUnitDisplay} ליח')</span>`
            : `${avgGapDisplay}`);
          const avgGapCellTitle = (
            (Number.isFinite(avgGapDays) ? `מחזיק להזמנה: ${avgGapDisplay} ימים` : 'מחזיק להזמנה: —') +
            (__perUnitDisplay ? ` | ≈ ${__perUnitDisplay} ימים ליחידה (מחזיק/כמות מומלצת)` : '')
          );
          // Expected date with relative time (two lines)
          let nextExpHtml = '—';
          if (r.next_expected_date) {
            const d = new Date(r.next_expected_date);
            const dateStr = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;

            const now = new Date();
            now.setHours(0,0,0,0);
            const then = new Date(d);
            then.setHours(0,0,0,0);
            const diff = Math.round((then - now) / (1000 * 60 * 60 * 24));

            let rel = '';
            if (diff === 0) rel = 'היום';
            else if (diff === 1) rel = 'מחר';
            else if (diff === 2) rel = 'מחרתיים';
            else if (diff === -1) rel = 'אתמול';
            else if (diff > 0) rel = `עוד ${diff} ימים`;
            else rel = `לפני ${Math.abs(diff)} ימים`;

            nextExpHtml = `
              <div style="line-height:1.2;">${dateStr}</div>
              <div style="font-size:11px; color:#667085; font-weight:normal; line-height:1.2;">${rel}</div>
            `;
          }

          const statusHtml = ui.dot 
            ? `<span class="${ui.dot}"></span> <span style="font-weight:600;">${ui.text}</span>`
            : `<span style="color:#98a2b3;">${ui.text}</span>`;

          const phoneNorm = __normPhoneFromKey(r.customer_phone || r.customer_key);
          const consumptionPlaceholder = `<div class="tmc-cons-cell"><div class="tmc-cons-muted">טוען...</div></div>`;

          html.push(`
            <tr class="${ui.row}">
              <td class="tmc-td-name">
                <div style="font-weight:600; font-size:14px;">${escapeHtml(r.customer_name || '—')}</div>
                <div style="color:#667085; font-size:12px;">${escapeHtml(r.customer_key || '')}</div>
              </td>
              <td>${statusHtml}</td>
              <td class="tmc-td-consumption" data-customer-phone="${escapeHtml(phoneNorm || '')}" style="max-width:240px;">
                ${consumptionPlaceholder}
              </td>
              <td style="font-weight:700; color:#101828; font-size:14px;">${forecastQty == null ? '—' : forecastQty}</td>
              <td style="color:#475467;" title="${escapeHtml(avgGapCellTitle)}">${avgGapCellHtml}</td>
              <td dir="ltr" style="color:#475467;">${lastOrder}</td>
              <td dir="ltr" style="font-weight:600; color:#101828;">${nextExpHtml}</td>
              <td style="color:#475467;">${(r.n_orders ?? r.total_orders ?? 0)}</td>
            </tr>
          `);
        }
        html.push('</tbody></table>');

        const wrap = panel.querySelector('.tmc-table-wrap');
        wrap.innerHTML = html.join('');
        wrap.style.display = 'block';
        const explEl = panel.querySelector('.tmc-forecast-explanation');
        if (explEl) explEl.style.display = 'block';
        panel.querySelector('.tmc-loading').style.display = 'none';

        // Hydrate consumption cells (async, cached) + product forecast line
        tmcHydrateDrilldownConsumption(wrap, sorted, state);

        wrap.querySelectorAll('th.sortable').forEach(th => {
          th.addEventListener('click', () => {
            const key = th.getAttribute('data-col');
            if (!key) return;
            if (state.sortCol === key) {
              state.sortDir = state.sortDir === 'desc' ? 'asc' : 'desc';
            } else {
              state.sortCol = key;
              state.sortDir = 'asc';
            }
            renderDrilldownTable(list, state);
          });
        });
      }

      renderDrilldownTable(rows, sortState);

      loadOutcomesInBackground();
    };

    try {
      unsafeWindow.lwSupabaseDemo = lwSupabaseDemo;
      unsafeWindow.lwSupabaseSendCurrentTask = lwSupabaseSendCurrentTask;
      unsafeWindow.syncStoreVisitsIndexToSupabase = syncStoreVisitsIndexToSupabase;
      unsafeWindow.openForecastUI = openForecastUI;
    } catch (e) {
      console.error(
        '[Supabase Sync] failed to expose functions on unsafeWindow:',
        e
      );
    }

    // ===== DEBUG EXPORT (optional) =====
    const LW_EXPOSE_DEBUG_API = true; // שנה ל-false אחרי הבדיקות

    if (LW_EXPOSE_DEBUG_API) {
      try {
        const w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
        w.__LW_DEBUG = {
          supaRestFetch,
          supaRestFetchPaged,
          // helpers:
          clearCatalogCache: () => {
            try { localStorage.removeItem(CATALOG_CACHE_KEY); } catch {}
            try { localStorage.removeItem(CATALOG_VERSION_KEY); } catch {}
            try { if (typeof GM_deleteValue !== 'undefined') GM_deleteValue(CATALOG_CACHE_KEY_GM); } catch {}
            try { if (typeof GM_deleteValue !== 'undefined') GM_deleteValue(CATALOG_VERSION_KEY); } catch {}
            console.log("[LW_DEBUG] catalog cache cleared");
          },
          // state:
          CATALOG_BY_SKU,
          CATALOG_BY_BARCODE,
          SUPPLIERS_IN_CACHE,
        };
        console.log("[LW_DEBUG] __LW_DEBUG exported");
      } catch (e) {
        console.warn("[LW_DEBUG] export failed", e);
      }
    }

    // תאימות לשם ישן אם קיים
    try {
        unsafeWindow.openForecastProductDrilldown = unsafeWindow.openProductDrilldown;
    } catch(e) {}

})();
 // End of script closure