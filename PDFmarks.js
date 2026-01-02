// ==UserScript==
// @name         Lionwheel - Print Labels Region Mark (Smart Page Count + Thermal Fix)
// @namespace    https://members.lionwheel.com/
// @version      11.8.0
// @description  Dynamic page count, Black stripes for thermal print, Crash fixes, XHR interception, direct PDF replacement, multi-CDN fallback, and direct print.
// @author       Adam Lee
// @match        https://members.lionwheel.com/tasks/*/print_labels
// @match        https://members.lionwheel.com/tasks/print_labels
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const TAG = '[LabelsMark]';
  const MIN_ITEMS_FOR_EXTRA_PAGE = 5;

  const STRIPE_CFG = {
    thickness: 2.0,       // עובי מוגבר מעט למדפסות תרמיות
    color: [0, 0, 0],     // שחור מלא (Pure Black)
    marginY: 20,
  };

  const REGION_RULES = [
    { lane: 2, match: ["סולו חיפה + טירה", "סולו קריות"] },
    { lane: 1, match: ["איזור 2 (א+ג+ה)"] },
    { lane: 0, match: ["איזור 1 (ב+ד+ו)"] }
  ];

  const state = {
    taskOrder: [],
    pdfBlobUrl: '',
    lastModifiedUrl: '',
    processing: false,
    skipCaptureFlagName: '__LabelsMarkSkipCapture',
    overlayHost: null,
    overlayFrame: null,
    statusIndicator: null,
    lastProcessedHash: '',
    resizeObserver: null,
    observedViewer: null,
    taskId: null,
    hooksInjected: false,
    lastWaitLogAt: 0,
    pdfLibPromise: null
  };

  function getTaskId() {
      const match = location.href.match(/tasks\/([a-zA-Z0-9-]+)\/print/);
      return match ? match[1] : 'global_context';
  }

  function saveToCache(orderData) {
      if (!state.taskId) state.taskId = getTaskId();
      try {
          sessionStorage.setItem('LW_Tasks_' + state.taskId, JSON.stringify(orderData));
          console.log(TAG, 'Data saved to session cache for ID:', state.taskId);
      } catch (e) {}
  }

  function loadFromCache() {
      if (!state.taskId) state.taskId = getTaskId();
      try {
          const cached = sessionStorage.getItem('LW_Tasks_' + state.taskId);
          if (cached) {
              state.taskOrder = JSON.parse(cached);
              console.log(TAG, 'Restored data from cache:', state.taskOrder.length, 'pages');
              return true;
          }
      } catch (e) {}
      return false;
  }

  function initUI() {
    if (state.statusIndicator || !document.body) return;
    state.statusIndicator = document.createElement('div');
    state.statusIndicator.style.cssText =
      'position:fixed; bottom:20px; right:20px; width:16px; height:16px; border-radius:50%;' +
      'z-index:2147483647; border:2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.5);' +
      'cursor:pointer; pointer-events:auto; background:#757575; transition: transform 0.2s, background 0.3s;';
    state.statusIndicator.title = 'LabelsMark: waiting';

    state.statusIndicator.addEventListener('click', () => {
      if (!state.lastModifiedUrl) return;
      openStampedAndPrint();
    });

    document.body.appendChild(state.statusIndicator);
  }

  function updateStatus(status, title = '') {
      if (!state.statusIndicator) return;
      const colors = { idle: '#757575', processing: '#FB8C00', success: '#000000', error: '#E53935', warning: '#FFEB3B' }; // Success is black now too
      state.statusIndicator.style.background = colors[status] || colors.idle;
      if (status === 'success') {
           state.statusIndicator.style.transform = 'scale(1.2)';
           state.statusIndicator.style.border = '2px solid #4CAF50'; // Green border for success
      } else {
           state.statusIndicator.style.transform = 'scale(1)';
           state.statusIndicator.style.border = '2px solid white';
      }

      if (title) state.statusIndicator.title = title;
  }

  async function ensurePdfLib() {
    if (window.PDFLib) return window.PDFLib;
    if (state.pdfLibPromise) return state.pdfLibPromise;

    const loadScript = (src, timeoutMs = 8000) => new Promise((resolve, reject) => {
      const s = document.createElement('script');
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        try { s.remove(); } catch (_) {}
        reject(new Error('Timeout loading: ' + src));
      }, timeoutMs);
      s.src = src;
      s.async = true;
      s.onload = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(true);
      };
      s.onerror = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        reject(new Error('Failed loading: ' + src));
      };
      (document.head || document.documentElement).appendChild(s);
    });

    state.pdfLibPromise = (async () => {
      const sources = [
        'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js',
        'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js',
        'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js'
      ];
      let lastErr = null;
      for (const src of sources) {
        try {
          await loadScript(src, 8000);
          if (window.PDFLib) return window.PDFLib;
        } catch (e) {
          lastErr = e;
        }
      }
      const msg = 'PDFLib failed to load (CDN blocked/offline). Enable access to unpkg/jsdelivr/cdnjs or bake PDFLib into the script.';
      throw new Error(msg + (lastErr ? (' | ' + lastErr.message) : ''));
    })();

    return state.pdfLibPromise;
  }

  async function stampPdf(pdfBytes) {
    const PDFLib = await ensurePdfLib();
    const pdfDoc = await PDFLib.PDFDocument.load(pdfBytes);
    let pages = pdfDoc.getPages();

    if (pages.length !== state.taskOrder.length) {
        console.warn(TAG, `Mismatch detected. PDF: ${pages.length}, Data: ${state.taskOrder.length}`);
        if (state.taskOrder.length === pages.length + 1) {
            const lastNullIndex = state.taskOrder.lastIndexOf(null);
            if (lastNullIndex !== -1) {
                state.taskOrder.splice(lastNullIndex, 1);
                console.log(TAG, "Auto-fix: Removed one grocery page from data mapping.");
            }
        }
    }

    if (pages.length !== state.taskOrder.length) {
        const msg = `Critical Mismatch! PDF Pages: ${pages.length}, Data Pages: ${state.taskOrder.length}`;
        console.error(TAG, msg);
        throw new Error(msg + "\nנסה לרענן את העמוד (F5)");
    }

    const color = PDFLib.rgb(STRIPE_CFG.color[0], STRIPE_CFG.color[1], STRIPE_CFG.color[2]); // RGB 0-1 range not needed if we pass 0,0,0
    pages.forEach((page, i) => {
      const lane = state.taskOrder[i];
      if (lane === null) return;

      const { width, height } = page.getSize();
      let x = (lane === 0) ? width * 0.08 : (lane === 1) ? width * 0.51 : width * 0.92;
      page.drawLine({ start: { x: x, y: STRIPE_CFG.marginY }, end: { x: x, y: height - STRIPE_CFG.marginY }, thickness: STRIPE_CFG.thickness, color: color });
    });
    return await pdfDoc.save();
  }

  function harvestTasks(obj) {
    let tasks = obj.tasks || (obj.data && obj.data.tasks);
    if (!Array.isArray(tasks)) return false;

    const newOrder = [];
    tasks.forEach(t => {
        const qty = Math.max(1, parseInt(t.packages_quantity || 1));
        const region = (t.dest_region || "").trim().replace(/\s+/g, ' ');
        const lane = REGION_RULES.find(r => r.match.some(m => region.includes(m)))?.lane || 0;

        for (let i = 0; i < qty; i++) { newOrder.push(lane); }

        if (t.order_items && t.order_items.length >= MIN_ITEMS_FOR_EXTRA_PAGE) {
            newOrder.push(null);
        }
    });

    state.taskOrder = newOrder;
    saveToCache(newOrder);
    console.log(TAG, `Data Loaded & Cached: ${newOrder.length} pages expected.`);
    return true;
  }

  function getViewerEl() {
    return document.querySelector('iframe[src*="blob:"], embed[type="application/pdf"], object[data*="blob:"]');
  }

  function clearOverlay() {
    try {
      if (state.resizeObserver) state.resizeObserver.disconnect();
      state.resizeObserver = null;
      state.observedViewer = null;
    } catch (_) {}
    if (state.overlayHost) {
      try { state.overlayHost.remove(); } catch (_) {}
      state.overlayHost = null;
      state.overlayFrame = null;
    }
  }

  function tryReplaceViewerSource() {
    if (!state.lastModifiedUrl) return false;
    const viewer = getViewerEl();
    if (!viewer) return false;
    try {
      const tag = (viewer.tagName || '').toUpperCase();
      if (tag === 'IFRAME') {
        if (viewer.src !== state.lastModifiedUrl) viewer.src = state.lastModifiedUrl;
      } else if (tag === 'EMBED') {
        if (viewer.src !== state.lastModifiedUrl) viewer.src = state.lastModifiedUrl;
      } else if (tag === 'OBJECT') {
        if (viewer.data !== state.lastModifiedUrl) viewer.data = state.lastModifiedUrl;
      } else {
        return false;
      }
      viewer.style.opacity = '1';
      clearOverlay();
      return true;
    } catch (e) {
      return false;
    }
  }

  function applyStampedPdfToViewer() {
    // Prefer "real replacement" so Chrome printing uses the stamped bytes.
    if (tryReplaceViewerSource()) return;
    // Fallback overlay if replacement is blocked for any reason.
    updateOverlay();
  }

  function openStampedAndPrint() {
    if (!state.lastModifiedUrl) return;
    const w = window.open(state.lastModifiedUrl, '_blank', 'noopener,noreferrer');
    if (!w) return;
    const started = Date.now();
    const t = setInterval(() => {
      if (Date.now() - started > 8000) { clearInterval(t); return; }
      try {
        w.focus();
        w.print();
        clearInterval(t);
      } catch (_) {}
    }, 700);
  }

  async function maybeProcess() {
    if (state.pdfBlobUrl && !state.taskOrder.length) loadFromCache();

    if (state.processing) return;
    if (!state.pdfBlobUrl || !state.taskOrder.length) {
      const now = Date.now();
      if (state.pdfBlobUrl && !state.taskOrder.length && (now - state.lastWaitLogAt > 1500)) {
        state.lastWaitLogAt = now;
        console.warn(TAG, 'Waiting for task data (taskOrder not ready yet).');
        updateStatus('idle', 'Waiting for task data…');
      }
      return;
    }

    if (state.pdfBlobUrl === state.lastProcessedHash) return;

    state.processing = true;
    updateStatus('processing', 'Stamping PDF…');

    try {
      const res = await fetch(state.pdfBlobUrl);
      const buf = await res.arrayBuffer();
      const stampedBytes = await stampPdf(buf);

      if (state.lastModifiedUrl) URL.revokeObjectURL(state.lastModifiedUrl);
      window[state.skipCaptureFlagName] = true;
      state.lastModifiedUrl = URL.createObjectURL(new Blob([stampedBytes], { type: 'application/pdf' }));
      setTimeout(() => window[state.skipCaptureFlagName] = false, 100);

      state.lastProcessedHash = state.pdfBlobUrl;
      applyStampedPdfToViewer();
      updateStatus('success', 'Ready. Click the dot to print the stamped PDF.');
    } catch (e) {
        updateStatus('error', e.message || 'Error');
        console.error(e);
        if (state.overlayHost) state.overlayHost.style.display = 'none';
        const viewer = getViewerEl();
        if (viewer) viewer.style.opacity = '1';
    } finally { state.processing = false; }
  }

  function updateOverlay() {
    if (!state.lastModifiedUrl || !document.body) return;
    const viewer = getViewerEl();
    if (!viewer) return;

    if (!state.overlayHost) {
      state.overlayHost = document.createElement('div');
      state.overlayHost.id = 'lm-overlay-host';
      state.overlayHost.style.cssText = 'position:fixed; z-index:2147483646; background:white; pointer-events:auto; overflow:hidden;';
      state.overlayFrame = document.createElement('iframe');
      state.overlayFrame.style.cssText = 'width:100%; height:100%; border:none;';
      state.overlayHost.appendChild(state.overlayFrame);
      document.body.appendChild(state.overlayHost);
    }

    if (state.observedViewer !== viewer) {
        if (state.resizeObserver) state.resizeObserver.disconnect();
        state.resizeObserver = new ResizeObserver(() => requestAnimationFrame(updateOverlay));
        state.resizeObserver.observe(viewer);
        state.observedViewer = viewer;
    }

    const rect = viewer.getBoundingClientRect();
    Object.assign(state.overlayHost.style, { top: rect.top + 'px', left: rect.left + 'px', width: rect.width + 'px', height: rect.height + 'px', display: 'block' });
    viewer.style.opacity = '0';

    if (state.overlayFrame.src !== state.lastModifiedUrl) {
        state.overlayFrame.src = state.lastModifiedUrl;
    }
  }

  function injectHooks() {
    if (state.hooksInjected) return;
    const code = `(function() {
      const send = (type, payload) => window.postMessage({ __LM_MSG: true, type, payload }, '*');
      const skipFlag = '${state.skipCaptureFlagName}';

      const shouldInspectUrl = (u) => {
        try {
          const s = String(u || '');
          return s.includes('labels') || s.includes('tasks');
        } catch (_) { return false; }
      };

      const trySendJsonText = (txt) => {
        try {
          if (!txt) return;
          const t = String(txt).trim();
          if (!t) return;
          const c = t[0];
          if (c !== '{' && c !== '[') return;
          JSON.parse(t);
          send('json_intercept', t);
        } catch (_) {}
      };

      const origFetch = window.fetch;
      window.fetch = async function(...args) {
          const res = await origFetch.apply(this, args);
          const url = (args[0] && args[0].url) ? args[0].url : String(args[0] || '');
          if (shouldInspectUrl(url)) {
              const ct = (res.headers && res.headers.get) ? (res.headers.get('content-type') || '') : '';
              // Be tolerant: sometimes JSON arrives with non-standard content-type.
              res.clone().text().then(trySendJsonText).catch(()=>{});
          }
          return res;
      };

      // XHR interception (Lionwheel sometimes uses XHR in some flows)
      try {
        const XHROpen = XMLHttpRequest.prototype.open;
        const XHRSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.open = function(method, url) {
          try { this.__lm_url = String(url || ''); } catch (_) { this.__lm_url = ''; }
          return XHROpen.apply(this, arguments);
        };
        XMLHttpRequest.prototype.send = function() {
          try {
            this.addEventListener('load', function() {
              try {
                const url = this.__lm_url || '';
                if (!shouldInspectUrl(url)) return;
                const rt = this.responseType;
                if (rt && rt !== '' && rt !== 'text') return;
                trySendJsonText(this.responseText);
              } catch (_) {}
            });
          } catch (_) {}
          return XHRSend.apply(this, arguments);
        };
      } catch (_) {}

      const origCOU = URL.createObjectURL;
      URL.createObjectURL = function(blob) {
          const url = origCOU.call(URL, blob);
          if (blob && blob.type === 'application/pdf' && !window[skipFlag]) send('pdf_intercept', url);
          return url;
      };
    })();`;

    const script = document.createElement('script');
    script.textContent = code;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
    state.hooksInjected = true;
    console.log(TAG, 'Hooks injected (fetch + XHR + createObjectURL).');
  }

  window.addEventListener('message', (e) => {
    if (!e.data || !e.data.__LM_MSG) return;

    if (e.data.type === 'pdf_intercept') {
      if (e.data.payload !== state.pdfBlobUrl && e.data.payload !== state.lastModifiedUrl) {
          state.pdfBlobUrl = e.data.payload;
          console.log(TAG, 'PDF Intercepted');
          maybeProcess();
      }
    }

    if (e.data.type === 'json_intercept') {
      try {
          const data = JSON.parse(e.data.payload);
          if (harvestTasks(data)) maybeProcess();
      } catch(err) {}
    }
  });

  // Inject hooks ASAP (document-start), UI when body is ready
  injectHooks();
  const bootUI = () => { 
      initUI(); 
      loadFromCache();
  };
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', bootUI); else bootUI();

  const observer = new MutationObserver(() => {
      const viewer = getViewerEl();
      if (!viewer) return;
      if (state.lastModifiedUrl) {
        // Keep viewer pointed at stamped PDF even if Lionwheel re-renders the element.
        applyStampedPdfToViewer();
      } else {
        updateOverlay();
      }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

})();