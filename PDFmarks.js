// ==UserScript==
// @name         Lionwheel - Print Labels Region Mark (Ultimate Stability)
// @namespace    https://members.lionwheel.com/
// @version      9.5.0
// @description  Optimized with Observers, Safe DOM loading, and improved Interactivity.
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
    thickness: 1, // PDF Points
    color: [200, 200, 200],
    marginY: 10,
  };

  const REGION_RULES = [
    { lane: 2, match: ["סולו חיפה + טירה", "סולו קריות"] },
    { lane: 1, match: ["איזור 2 (א+ג+ה)"] },
    { lane: 0, match: ["איזור 1 (ב+ד+ו)"] }
  ];

  const state = {
    taskOrder: JSON.parse(sessionStorage.getItem('__LM_LAST_TASKS') || '[]'),
    pdfBlobUrl: '',
    lastModifiedUrl: '',
    processing: false,
    skipCaptureFlagName: '__LabelsMarkSkipCapture',
    overlayHost: null,
    overlayFrame: null,
    statusIndicator: null,
    lastProcessedHash: ''
  };

  // --- UI & Status ---
  function initUI() {
    if (state.statusIndicator || !document.body) return;

    state.statusIndicator = document.createElement('div');
    state.statusIndicator.style.cssText = 'position:fixed; bottom:20px; right:20px; width:14px; height:14px; border-radius:50%; z-index:2147483647; border:2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.3); pointer-events:none; transition: background 0.2s; background: #757575;';
    document.body.appendChild(state.statusIndicator);

    updateOverlay(); // Initial position
  }

  function updateStatus(status) {
      if (!state.statusIndicator) return;
      const colors = { idle: '#757575', processing: '#FB8C00', success: '#43A047', error: '#E53935' };
      state.statusIndicator.style.background = colors[status] || colors.idle;
  }

  // --- PDF Logic ---
  async function ensurePdfLib() {
    if (window.PDFLib) return window.PDFLib;
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js';
      s.onload = () => resolve(window.PDFLib);
      s.onerror = () => { updateStatus('error'); reject(new Error('PDFLib load failed')); };
      (document.head || document.documentElement).appendChild(s);
    });
  }

  async function stampPdf(pdfBytes) {
    const PDFLib = await ensurePdfLib();
    const pdfDoc = await PDFLib.PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();
    const color = PDFLib.rgb(STRIPE_CFG.color[0]/255, STRIPE_CFG.color[1]/255, STRIPE_CFG.color[2]/255);

    pages.forEach((page, i) => {
      const { width, height } = page.getSize();
      const lane = (state.taskOrder[i] !== undefined) ? state.taskOrder[i] : 0;
      let x = (lane === 0) ? 6 : (lane === 1) ? (width / 2) : (width - 6 - STRIPE_CFG.thickness);

      page.drawLine({
        start: { x: x, y: STRIPE_CFG.marginY },
        end: { x: x, y: height - STRIPE_CFG.marginY },
        thickness: STRIPE_CFG.thickness,
        color: color,
      });
    });
    return await pdfDoc.save();
  }

  function harvestTasks(obj) {
    if (!obj || typeof obj !== 'object' || !Array.isArray(obj.tasks)) return false;
    const newOrder = [];
    obj.tasks.forEach(t => {
        let qty = parseInt(t.packages_quantity || 1);
        if (t.order_items && t.order_items.length >= MIN_ITEMS_FOR_EXTRA_PAGE) qty += 1;
        const lane = REGION_RULES.find(r => r.match.some(m => t.dest_region?.includes(m)))?.lane || 0;
        for (let i = 0; i < qty; i++) newOrder.push(lane);
    });
    state.taskOrder = newOrder;
    sessionStorage.setItem('__LM_LAST_TASKS', JSON.stringify(newOrder));
    return true;
  }

  async function maybeProcess() {
    if (state.processing || !state.pdfBlobUrl || !state.taskOrder.length || state.pdfBlobUrl === state.lastProcessedHash) return;

    state.processing = true;
    updateStatus('processing');

    try {
      const res = await fetch(state.pdfBlobUrl);
      const buf = await res.arrayBuffer();
      const stampedBytes = await stampPdf(buf);

      if (state.lastModifiedUrl) URL.revokeObjectURL(state.lastModifiedUrl);
      state.lastModifiedUrl = URL.createObjectURL(new Blob([stampedBytes], { type: 'application/pdf' }));
      state.lastProcessedHash = state.pdfBlobUrl;

      updateOverlay();
      updateStatus('success');
    } catch (e) {
      console.error(TAG, e);
      updateStatus('error');
    } finally {
      state.processing = false;
    }
  }

  // --- Observers & Layout ---
  function updateOverlay() {
    if (!state.lastModifiedUrl || !document.body) return;
    const viewer = document.querySelector('iframe[src*="blob:"], embed[type="application/pdf"], object[data*="blob:"]');
    if (!viewer) return;

    if (!state.overlayHost) {
      state.overlayHost = document.createElement('div');
      state.overlayHost.style.cssText = 'position:fixed; z-index:2147483646; background:white; pointer-events:auto;'; // Enabled pointer-events
      state.overlayFrame = document.createElement('iframe');
      state.overlayFrame.style.cssText = 'width:100%; height:100%; border:none;';
      state.overlayHost.appendChild(state.overlayFrame);
      document.body.appendChild(state.overlayHost);

      // Observe size changes instead of setInterval
      const ro = new ResizeObserver(() => updateOverlay());
      ro.observe(viewer);
    }

    const rect = viewer.getBoundingClientRect();
    if (rect.width < 50) return;

    Object.assign(state.overlayHost.style, {
      top: rect.top + 'px', left: rect.left + 'px', width: rect.width + 'px', height: rect.height + 'px', display: 'block'
    });

    viewer.style.opacity = '0';
    window[state.skipCaptureFlagName] = true;
    if (state.overlayFrame.src !== state.lastModifiedUrl) state.overlayFrame.src = state.lastModifiedUrl;
    setTimeout(() => { window[state.skipCaptureFlagName] = false; }, 500);
  }

  // --- Interception ---
  function injectHooks() {
    const code = `(function() {
      const send = (type, payload) => window.postMessage({ __LM_MSG: true, type, payload }, '*');
      const origFetch = window.fetch;
      window.fetch = async function(...args) {
          const res = await origFetch.apply(this, args);
          const url = (args[0] && args[0].url) ? args[0].url : String(args[0] || '');
          if (url.includes('labels') || url.includes('tasks')) {
              const ct = res.headers.get('content-type');
              if (ct && ct.includes('application/json')) {
                  res.clone().json().then(data => send('json_intercept', JSON.stringify(data))).catch(()=>{});
              }
          }
          return res;
      };
      const origCOU = URL.createObjectURL;
      URL.createObjectURL = function(blob) {
          const url = origCOU.call(URL, blob);
          if (!window['${state.skipCaptureFlagName}'] && blob && blob.type === 'application/pdf') send('pdf_intercept', url);
          return url;
      };
    })();`;
    const script = document.createElement('script');
    script.textContent = code;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  }

  // --- Entry ---
  window.addEventListener('message', (e) => {
    if (!e.data || !e.data.__LM_MSG) return;
    if (e.data.type === 'json_intercept') {
      try { if(harvestTasks(JSON.parse(e.data.payload))) maybeProcess(); } catch(err) {}
    }
    if (e.data.type === 'pdf_intercept' && e.data.payload !== state.pdfBlobUrl) {
      state.pdfBlobUrl = e.data.payload;
      maybeProcess();
    }
  });

  // Safe Boot
  if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', initUI);
  } else {
      initUI();
  }

  // Watch for PDF viewer appearing in DOM
  const observer = new MutationObserver(() => {
      if (document.querySelector('iframe[src*="blob:"], embed[type="application/pdf"]')) {
          initUI();
          updateOverlay();
      }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  injectHooks();
})();