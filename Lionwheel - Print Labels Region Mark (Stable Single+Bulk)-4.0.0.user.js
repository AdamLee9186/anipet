// ==UserScript==
// @name         Lionwheel - Print Labels Region Mark (Stable Overlay + PDFLib) [Single+Bulk]
// @namespace    https://members.lionwheel.com/
// @version      2.0.0
// @description  Adds region “stripes” to Lionwheel label PDFs (single + bulk) by intercepting labels_data + PDF blob, stamping PDF via pdf-lib, and showing a stable body-fixed overlay (no flicker / no white screen).
// @match        https://members.lionwheel.com/tasks/*/print_labels
// @match        https://members.lionwheel.com/tasks/print_labels
// @run-at       document-start
// @grant        none
// ==/UserScript==

/*
  IMPORTANT NOTES
  1) ERR_BLOCKED_BY_CLIENT (Cloudflare beacon / Rollbar / Zaraz) is caused by adblock/uBlock etc. Not related.
  2) react-pdf.browser.js warning "Invalid '' string child outside <Text>" is Lionwheel-side (React PDF renderer). Not related.
  3) This script DOES NOT rely on reading #label iframe src (often undefined) and does NOT rely on blob: in DOM.
     It intercepts:
      - labels_data JSON (via fetch/XHR hooks in page context)
      - PDF blob creation (via URL.createObjectURL hook in page context)
     Then stamps the PDF and displays it via a stable overlay iframe on top of the viewer.
*/

(function () {
  'use strict';

  const TAG = '[LabelsMark]';
  const DEBUG = true;

  // -----------------------------
  // Configuration (edit as needed)
  // -----------------------------

  // If we fail to detect a region from labels_data task object, still draw a fallback mark
  // so you never end up with "no stripes at all".
  const FALLBACK_MARK = {
    enabled: true,
    lane: 0,           // 0..(REGION_MARK.lanes-1)
    regionName: 'OTHER'
  };

  // Region mark geometry (in PDF points)
  // We draw ONE solid vertical mark in ONE of 4 fixed "lanes".
  // This prevents "4 thick stripes" and puts the mark in the correct lane position.
  const REGION_MARK = {
    baseX: 8,       // left margin from page edge (slightly bigger to avoid trimming/crop)
    laneW: 7,       // width of each lane mark (a bit thicker for visibility)
    laneGap: 2,     // gap between lanes
    lanes: 4,       // number of lane positions (e.g. 4 regions)
    marginY: 10,    // top/bottom margin
    opacity: 0.70,  // mark opacity
  };

  // Region colors (RGB 0..1) used for stripes
  // You can add more and change mapping logic below.
  const REGION_COLORS = {
    HAIFA:  [0.05, 0.35, 0.95],
    CENTER: [0.10, 0.70, 0.20],
    SOUTH:  [0.95, 0.25, 0.15],
    NORTH:  [0.55, 0.25, 0.85],
    OTHER:  [0.25, 0.25, 0.25],
  };

  // Heuristic mapping: decide "region" for a task.
  // Adjust strings according to your real cities/regions.
  function collectStringsDeep(root, maxDepth = 5, maxItems = 250) {
    const out = [];
    const seen = new Set();
    const q = [{ v: root, d: 0 }];
    while (q.length && out.length < maxItems) {
      const { v, d } = q.shift();
      if (v == null) continue;
      if (typeof v === 'string') {
        const s = v.trim();
        if (s && s.length <= 200 && !seen.has(s)) { // keep it bounded
          seen.add(s);
          out.push(s);
        }
        continue;
      }
      if (typeof v === 'number' || typeof v === 'boolean') continue;
      if (d >= maxDepth) continue;

      if (Array.isArray(v)) {
        for (const item of v) q.push({ v: item, d: d + 1 });
        continue;
      }
      if (typeof v === 'object') {
        for (const k of Object.keys(v)) q.push({ v: v[k], d: d + 1 });
      }
    }
    return out;
  }

  function getRegionForTask(task) {
    // Try to extract any usable location string from task shapes + deep scan (Lionwheel task shapes vary)
    const shallow = [
      task?.destination?.partial_address,
      task?.destination?.name,
      task?.address,
      task?.shipping_address,
      task?.shippingAddress,
      task?.city,
      task?.destination_city,
      task?.customer_city,
      task?.customer?.city,
      task?.customer?.address,
      task?.contact?.city,
      task?.contact?.address,
    ].filter(Boolean);

    const deep = collectStringsDeep(task, 5, 250);
    const s = [...shallow, ...deep].join(' | ').toLowerCase();

    if (!s) return 'OTHER';

    // Examples (customize):
    if (s.includes('חיפה') || s.includes('haifa') || s.includes('קריות') || s.includes('kiryat')) return 'HAIFA';
    if (s.includes('תל אביב') || s.includes('tel aviv') || s.includes('גבעתיים') || s.includes('רמת גן')) return 'CENTER';
    if (s.includes('אשדוד') || s.includes('ashdod') || s.includes('אשקלון') || s.includes('ashkelon') || s.includes('באר שבע')) return 'SOUTH';
    if (s.includes('נהריה') || s.includes('nahariya') || s.includes('עכו') || s.includes('akko') || s.includes('קרית שמונה')) return 'NORTH';

    return 'OTHER';
  }

  function regionToColor(region) {
    return REGION_COLORS[region] || REGION_COLORS.OTHER;
  }

  // Map region => lane index (0..lanes-1)
  // Adjust mapping to your real business logic.
  function regionToLane(region) {
    switch (region) {
      case 'HAIFA':  return 0;
      case 'CENTER': return 1;
      case 'SOUTH':  return 2;
      case 'NORTH':  return 3;
      default:
        // If enabled, always return a lane for unknown/OTHER so we still stamp something.
        return FALLBACK_MARK.enabled ? FALLBACK_MARK.lane : null;
    }
  }

  // --------------------------------
  // Minimal logger
  // --------------------------------
  function log(...args) { if (DEBUG) console.log(TAG, ...args); }
  function warn(...args) { console.warn(TAG, ...args); }
  function err(...args) { console.error(TAG, ...args); }

  // --------------------------------
  // State
  // --------------------------------
  const state = {
    // captured
    labelsData: null,       // parsed JSON of labels_data
    pdfBlobUrl: '',         // blob: URL captured from URL.createObjectURL
    lastPdfBlobUrl: '',

    // stamping
    pdfLibReady: false,
    processing: false,
    lastModifiedUrl: '',

    // overlay (BODY-fixed, React-safe)
    overlayHost: null,
    overlayFrame: null,
    overlayTargetEl: null,
    overlayLastAppliedUrl: '',
    overlayFrameLoaded: false,

    // debouncing
    applyTick: 0,
    lastViewerScanAt: 0,

    // guards
    skipCaptureFlagName: '__LabelsMarkSkipCapture',
  };

  // If labels_data is not captured (some Lionwheel flows don't fetch JSON),
  // still stamp a fallback lane so you never end up with "no stripes at all".
  function getEffectiveLabelsData() {
    if (state.labelsData) return state.labelsData;
    if (!FALLBACK_MARK.enabled) return null;

    const fallback = {
      __fallback: true,
      labels_on_page: 1,
      tasks: [{}], // dummy task so stamping loop has something to map
    };
    try { window.__LabelsMarkFallbackUsed = true; } catch (_) {}
    return fallback;
  }

  // --------------------------------
  // Load pdf-lib on demand
  // --------------------------------
  function ensurePdfLib() {
    if (window.PDFLib) {
      state.pdfLibReady = true;
      return Promise.resolve(window.PDFLib);
    }
    return new Promise((resolve, reject) => {
      const src = 'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js';
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => {
        state.pdfLibReady = true;
        log('PDFLib loaded:', src);
        resolve(window.PDFLib);
      };
      s.onerror = () => reject(new Error('Failed loading pdf-lib'));
      document.documentElement.appendChild(s);
    });
  }

  // --------------------------------
  // Overlay logic (BODY-fixed)
  // --------------------------------
  function isViewerCandidate(el) {
    if (!el || el.nodeType !== 1) return false;
    const tag = el.tagName;
    if (tag !== 'IFRAME' && tag !== 'EMBED' && tag !== 'OBJECT') return false;

    const src = (tag === 'OBJECT')
      ? (el.getAttribute('data') || el.data || '')
      : (el.getAttribute('src') || el.src || '');

    const type = (tag === 'EMBED') ? (el.getAttribute('type') || '') : '';

    if (typeof src === 'string' && src.startsWith('blob:')) return true;
    if (typeof src === 'string' && src.startsWith('chrome-extension://')) return true;
    if (String(type).toLowerCase().includes('application/pdf')) return true;

    const w = el.clientWidth || 0, h = el.clientHeight || 0;
    return (w > 400 && h > 300);
  }

  function pickBestViewerCandidate() {
    const now = Date.now();
    // avoid scanning too often
    if (now - state.lastViewerScanAt < 250) return null;
    state.lastViewerScanAt = now;

    const els = Array.from(document.querySelectorAll('iframe,embed,object'))
      .filter(isViewerCandidate)
      .map(el => ({
        el,
        tag: el.tagName,
        src: el.tagName === 'OBJECT' ? (el.getAttribute('data') || el.data || '') : (el.getAttribute('src') || el.src || ''),
        w: el.clientWidth || 0,
        h: el.clientHeight || 0,
      }));

    els.sort((a, b) => (b.w * b.h) - (a.w * a.h));
    return els[0] || null;
  }

  function ensureBodyOverlay() {
    if (state.overlayHost && document.body && document.body.contains(state.overlayHost)) return;
    if (!document.body) return;

    const host = document.createElement('div');
    host.setAttribute('data-lm-overlay-host', '1');
    host.style.position = 'fixed';
    host.style.left = '0';
    host.style.top = '0';
    host.style.width = '0';
    host.style.height = '0';
    host.style.zIndex = '2147483647';
    host.style.background = '#fff';
    host.style.pointerEvents = 'auto';

    const frame = document.createElement('iframe');
    frame.setAttribute('data-lm-overlay-frame', '1');
    frame.style.width = '100%';
    frame.style.height = '100%';
    frame.style.border = '0';
    frame.style.display = 'block';
    frame.style.background = '#fff';

    frame.addEventListener('load', () => {
      state.overlayFrameLoaded = true;
      // Hide original only after overlay loads => prevents white page
      if (state.overlayTargetEl && state.overlayTargetEl.isConnected) {
        state.overlayTargetEl.style.opacity = '0';
        state.overlayTargetEl.style.pointerEvents = 'none';
      }
    });

    host.appendChild(frame);
    document.body.appendChild(host);

    state.overlayHost = host;
    state.overlayFrame = frame;
    state.overlayFrameLoaded = false;
  }

  function positionOverlayOver(el) {
    if (!state.overlayHost) return false;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return false;

    state.overlayHost.style.left = `${Math.max(0, r.left)}px`;
    state.overlayHost.style.top = `${Math.max(0, r.top)}px`;
    state.overlayHost.style.width = `${Math.max(0, r.width)}px`;
    state.overlayHost.style.height = `${Math.max(0, r.height)}px`;
    return true;
  }

  function restoreOriginalViewer(el) {
    if (!el || !el.isConnected) return;
    el.style.opacity = '';
    el.style.pointerEvents = '';
  }

  function tryApplyOverlay() {
    if (!state.lastModifiedUrl) return false;

    const now = Date.now();
    if (now - state.applyTick < 250) return false;
    state.applyTick = now;

    const best = pickBestViewerCandidate();
    if (!best) return false;

    ensureBodyOverlay();
    if (!state.overlayHost || !state.overlayFrame) return false;

    // restore previous
    if (state.overlayTargetEl && state.overlayTargetEl !== best.el) {
      restoreOriginalViewer(state.overlayTargetEl);
    }

    state.overlayTargetEl = best.el;

    // keep original visible until overlay loads
    best.el.style.opacity = '1';
    best.el.style.pointerEvents = '';

    const positioned = positionOverlayOver(best.el);

    if (state.overlayLastAppliedUrl !== state.lastModifiedUrl) {
      state.overlayFrameLoaded = false;
      state.overlayFrame.src = state.lastModifiedUrl;
      state.overlayLastAppliedUrl = state.lastModifiedUrl;
    }

    if (positioned) {
      log('Overlay positioned on', best.tag, 'w=', best.w, 'h=', best.h, 'viewerSrc=', String(best.src).slice(0, 80));
    }
    return true;
  }

  // keep overlay aligned
  window.addEventListener('scroll', () => {
    if (state.overlayTargetEl) positionOverlayOver(state.overlayTargetEl);
  }, true);

  window.addEventListener('resize', () => {
    if (state.overlayTargetEl) positionOverlayOver(state.overlayTargetEl);
  });

  // Mutation observer: re-apply when viewer rerenders
  function startViewerObserver() {
    const mo = new MutationObserver(() => {
      // Reposition (cheap) + try apply (throttled)
      if (state.overlayTargetEl) positionOverlayOver(state.overlayTargetEl);
      tryApplyOverlay();
    });
    const root = document.documentElement;
    if (root) mo.observe(root, { childList: true, subtree: true, attributes: true });
  }

  // --------------------------------
  // PDF stamping logic
  // --------------------------------
  function calcTaskAssignment(labelsData, pageCount) {
    // Explicit fallback: mark every page using the single dummy task.
    if (labelsData && labelsData.__fallback) {
      const labelsOnPage = 1;
      return { tasks: labelsData.tasks || [{}], labelsOnPage, mode: 'first' };
    }

    // Expected: labelsData.tasks array
    const tasks = Array.isArray(labelsData?.tasks) ? labelsData.tasks : [];
    const labelsOnPage = Number(labelsData?.labels_on_page || labelsData?.labelsOnPage || 1) || 1;

    const totalLabelSlots = pageCount * labelsOnPage;

    // If tasks length equals totalLabelSlots => each slot maps to a task
    // Else if tasks length equals pageCount => one task per page
    // Else fallback => first task
    let mode = 'fallback';
    if (tasks.length === totalLabelSlots) mode = 'slot';
    else if (tasks.length === pageCount) mode = 'page';
    else if (tasks.length > 0) {
      // Common case you have: pages > tasks by a small amount (extra pages at end).
      // Prefer page mapping for the first tasks pages, and skip marking the rest.
      if (labelsOnPage === 1 && pageCount > tasks.length && pageCount <= tasks.length + 3) mode = 'page';
      else mode = 'first';
    }

    return { tasks, labelsOnPage, mode };
  }

  async function stampPdfWithStripes(pdfBytes, labelsData) {
    const PDFLib = await ensurePdfLib();
    const { PDFDocument, rgb } = PDFLib;

    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();

    const assignment = calcTaskAssignment(labelsData, pages.length);
    log('PDF pages=', pages.length, 'tasks=', assignment.tasks.length, 'labels_on_page=', assignment.labelsOnPage, 'mode=', assignment.mode);

    for (let pIndex = 0; pIndex < pages.length; pIndex++) {
      const page = pages[pIndex];
      const { width, height } = page.getSize();

      // Determine which task influences this page (simplified)
      let task = null;
      if (assignment.mode === 'page') task = (pIndex < assignment.tasks.length) ? assignment.tasks[pIndex] : null;
      else if (assignment.mode === 'slot') task = assignment.tasks[pIndex * assignment.labelsOnPage] || null; // first slot on page
      else if (assignment.mode === 'first') task = assignment.tasks[0] || null;

      // If no task for this page (extra pages), do not mark.
      if (!task) continue;

      const region = getRegionForTask(task || {});
      let lane = regionToLane(region);
      let effectiveRegion = region;
      if (lane == null && FALLBACK_MARK.enabled) {
        lane = FALLBACK_MARK.lane;
        effectiveRegion = FALLBACK_MARK.regionName || 'OTHER';
      }
      if (lane == null) continue;

      const [r, g, b] = regionToColor(effectiveRegion);

      // Draw ONE solid mark in the appropriate lane
      const y0 = REGION_MARK.marginY;
      const h = Math.max(1, height - 2 * REGION_MARK.marginY);
      const xRaw = REGION_MARK.baseX + lane * (REGION_MARK.laneW + REGION_MARK.laneGap);
      const x = Math.min(Math.max(0, xRaw), Math.max(0, width - REGION_MARK.laneW));
      page.drawRectangle({
        x,
        y: y0,
        width: REGION_MARK.laneW,
        height: h,
        color: rgb(r, g, b),
        opacity: REGION_MARK.opacity,
      });

      if (DEBUG && pIndex === 0) {
        log('Stamp debug:', { region, effectiveRegion, lane, x, y0, w: REGION_MARK.laneW, h });
      }

      // Optional: small region text on bottom-left (comment out if you don't want text)
      // page.drawText(region, { x: bandX, y: 4, size: 8, color: rgb(r, g, b), opacity: 0.9 });
    }

    const out = await pdfDoc.save();
    return out;
  }

  // --------------------------------
  // Blob helpers (avoid capturing our own createObjectURL)
  // --------------------------------
  function createModifiedBlobUrl(bytes) {
    // Tell page hook to ignore this createObjectURL (prevent loops)
    try { window[state.skipCaptureFlagName] = true; } catch (_) {}

    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);

    // release flag soon
    setTimeout(() => {
      try { window[state.skipCaptureFlagName] = false; } catch (_) {}
    }, 0);

    return url;
  }

  // --------------------------------
  // Pipeline trigger
  // --------------------------------
  async function maybeProcess() {
    if (state.processing) return;
    if (!state.pdfBlobUrl) return;

    const effectiveLabelsData = getEffectiveLabelsData();
    if (!effectiveLabelsData) return;

    // If blob changed (new PDF), reprocess
    if (state.pdfBlobUrl === state.lastPdfBlobUrl && state.lastModifiedUrl) {
      // already processed this blob, just ensure overlay applied
      tryApplyOverlay();
      return;
    }

    state.processing = true;
    state.lastPdfBlobUrl = state.pdfBlobUrl;

    try {
      log('Processing PDF blob:', state.pdfBlobUrl);

      const res = await fetch(state.pdfBlobUrl);
      const buf = await res.arrayBuffer();
      if (!buf || buf.byteLength < 1000) throw new Error('PDF blob fetch returned empty/small buffer');

      const stamped = await stampPdfWithStripes(buf, effectiveLabelsData);
      const modifiedUrl = createModifiedBlobUrl(stamped);

      state.lastModifiedUrl = modifiedUrl;
      log('Modified PDF ready:', modifiedUrl);

      // Apply overlay (and keep trying as viewer appears/rerenders)
      tryApplyOverlay();
    } catch (e) {
      err('Failed processing/stamping PDF:', e);
    } finally {
      state.processing = false;
    }
  }

  // --------------------------------
  // labels_data parsing heuristics
  // --------------------------------
  function looksLikeLabelsData(obj) {
    if (!obj || typeof obj !== 'object') return false;
    // Accept a few shapes
    if (Array.isArray(obj.tasks) && ('labels_on_page' in obj || 'labelsOnPage' in obj || 'labels' in obj)) return true;
    if (Array.isArray(obj.tasks) && obj.tasks.length >= 0) return true;
    return false;
  }

  function normalizeLabelsData(obj) {
    if (!obj || typeof obj !== 'object') return obj;

    // Normalize common keys
    if (!('labels_on_page' in obj) && ('labelsOnPage' in obj)) {
      obj.labels_on_page = obj.labelsOnPage;
    }
    return obj;
  }

  // --------------------------------
  // PAGE CONTEXT HOOKS (fetch/XHR/createObjectURL)
  // --------------------------------
  function injectPageHooks() {
    const code = `
      (function(){
        const TAG='[LabelsMark]';
        function post(type, payload){
          window.postMessage({ __LabelsMark: true, type, payload }, '*');
        }

        // ---- fetch hook ----
        try{
          const origFetch = window.fetch;
          window.fetch = async function(...args){
            const res = await origFetch.apply(this, args);
            try{
              const url = (args && args[0]) ? String(args[0].url || args[0]) : '';
              const ct = (res.headers && res.headers.get) ? (res.headers.get('content-type') || '') : '';
              if (url.includes('labels') || url.includes('print_labels') || url.includes('labels_data') || ct.includes('application/json')) {
                const clone = res.clone();
                clone.text().then(txt=>{
                  // avoid huge
                  if (txt && txt.length < 5_000_000) post('fetch_text', { url, ct, text: txt });
                }).catch(()=>{});
              }
            }catch(_){}
            return res;
          };
          console.log(TAG,'fetch() hooked (labels_data capture).');
        }catch(e){ console.warn(TAG,'fetch hook failed', e); }

        // ---- XHR hook ----
        try{
          const OrigOpen = XMLHttpRequest.prototype.open;
          const OrigSend = XMLHttpRequest.prototype.send;
          XMLHttpRequest.prototype.open = function(method, url, ...rest){
            this.__lm_url = String(url||'');
            return OrigOpen.call(this, method, url, ...rest);
          };
          XMLHttpRequest.prototype.send = function(body){
            this.addEventListener('load', function(){
              try{
                const url = String(this.__lm_url || '');
                const ct = String(this.getResponseHeader('content-type') || '');
                if (url.includes('labels') || url.includes('print_labels') || url.includes('labels_data') || ct.includes('application/json')) {
                  const txt = (typeof this.responseText === 'string') ? this.responseText : '';
                  if (txt && txt.length < 5_000_000) post('xhr_text', { url, ct, text: txt });
                }
              }catch(_){}
            });
            return OrigSend.call(this, body);
          };
          console.log(TAG,'XMLHttpRequest hooked (labels_data capture).');
        }catch(e){ console.warn(TAG,'XHR hook failed', e); }

        // ---- URL.createObjectURL hook ----
        try{
          const origCOU = URL.createObjectURL.bind(URL);
          URL.createObjectURL = function(obj){
            // Allow userscript to signal "don't capture" for our modified PDFs
            try{
              if (window.__LabelsMarkSkipCapture) return origCOU(obj);
            }catch(_){}

            const url = origCOU(obj);
            try{
              const t = obj && obj.type ? String(obj.type) : '';
              const size = obj && obj.size ? Number(obj.size) : 0;

              if (t.includes('pdf') || t === 'application/pdf' || (t==='' && size>50000)) {
                post('pdf_blob_url', { url, type: t, size: size });
              }
            }catch(_){}
            return url;
          };
          console.log(TAG,'URL.createObjectURL hooked (PDF blob capture).');
        }catch(e){ console.warn(TAG,'createObjectURL hook failed', e); }

      })();
    `;

    const s = document.createElement('script');
    s.textContent = code;
    document.documentElement.appendChild(s);
    s.remove();
  }

  function handlePossibleLabelsData(text, meta) {
    if (!text || typeof text !== 'string') return false;

    // Very defensive JSON parse (ignore HTML)
    if (!text.trim().startsWith('{') && !text.trim().startsWith('[')) return false;

    let obj = null;
    try {
      obj = JSON.parse(text);
    } catch {
      return false;
    }

    // sometimes response wraps labels_data inside another object
    // try to find a nested object that looks like labelsData
    const candidates = [];
    candidates.push(obj);

    if (obj && typeof obj === 'object') {
      for (const k of Object.keys(obj)) {
        if (obj[k] && typeof obj[k] === 'object') candidates.push(obj[k]);
      }
    }

    const found = candidates.find(looksLikeLabelsData);
    if (!found) return false;

    const normalized = normalizeLabelsData(found);

    state.labelsData = normalized;
    // expose for debugging from console:
    try { window.__LabelsMarkLastLabelsData = normalized; } catch (_) {}
    try { window.__LabelsMarkLastTask0 = (Array.isArray(normalized?.tasks) ? normalized.tasks[0] : null); } catch (_) {}
    const tasksCount = Array.isArray(normalized.tasks) ? normalized.tasks.length : 0;
    const labelsOnPage = normalized.labels_on_page || normalized.labelsOnPage || normalized.labels || 1;
    log('labels_data captured', meta?.via || '', 'tasks=', tasksCount, 'labels_on_page=', labelsOnPage);

    // kick pipeline
    maybeProcess();
    return true;
  }

  // --------------------------------
  // Receive messages from injected hooks
  // --------------------------------
  function startMessageBridge() {
    window.addEventListener('message', (e) => {
      const d = e?.data;
      if (!d || !d.__LabelsMark) return;

      try {
        if (d.type === 'fetch_text' || d.type === 'xhr_text') {
          handlePossibleLabelsData(d.payload?.text, { via: d.type, url: d.payload?.url, ct: d.payload?.ct });
          return;
        }

        if (d.type === 'pdf_blob_url') {
          const u = d.payload?.url || '';
          if (!u || typeof u !== 'string') return;

          // Only keep the last seen blob url
          state.pdfBlobUrl = u;
          log('PDF blob captured:', u, 'type=', d.payload?.type, 'size=', d.payload?.size);

          // kick pipeline (sometimes labels_data arrives slightly after the PDF)
          maybeProcess();
          setTimeout(maybeProcess, 80);
          setTimeout(maybeProcess, 250);
          return;
        }
      } catch (ex) {
        err('Message handler error:', ex);
      }
    });
  }

  // --------------------------------
  // Boot
  // --------------------------------
  (function boot() {
    log('Ready on', location.href);

    startMessageBridge();
    injectPageHooks();

    // Viewer observer should start after DOM exists, but it’s safe to start early
    // (it will attach to documentElement).
    startViewerObserver();

    // Also try applying overlay periodically (in case viewer appears late)
    setInterval(() => {
      if (state.lastModifiedUrl) tryApplyOverlay();
    }, 500);
  })();

})();
