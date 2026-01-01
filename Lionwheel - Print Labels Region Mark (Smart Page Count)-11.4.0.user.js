// ==UserScript==
// @name         Lionwheel - Print Labels Region Mark (Smart Page Count)
// @namespace    https://members.lionwheel.com/
// @version      11.4.0
// @description  Dynamic page count adjustment to solve Mismatch.
// @author       Gemini & AdamLee
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
    thickness: 1.5,
    color: [180, 180, 180],
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
    observedViewer: null
  };

  function initUI() {
    if (state.statusIndicator || !document.body) return;
    state.statusIndicator = document.createElement('div');
    state.statusIndicator.style.cssText = 'position:fixed; bottom:20px; right:20px; width:14px; height:14px; border-radius:50%; z-index:2147483647; border:2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.3); pointer-events:none; background: #757575; transition: background 0.3s;';
    document.body.appendChild(state.statusIndicator);
  }

  function updateStatus(status, title = '') {
      if (!state.statusIndicator) return;
      const colors = { idle: '#757575', processing: '#FB8C00', success: '#43A047', error: '#E53935', warning: '#FFEB3B' };
      state.statusIndicator.style.background = colors[status] || colors.idle;
      if (title) state.statusIndicator.title = title;
  }

  async function ensurePdfLib() {
    if (window.PDFLib) return window.PDFLib;
    return new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js';
      s.onload = () => resolve(window.PDFLib);
      (document.head || document.documentElement).appendChild(s);
    });
  }

  async function stampPdf(pdfBytes) {
    const PDFLib = await ensurePdfLib();
    const pdfDoc = await PDFLib.PDFDocument.load(pdfBytes);
    let pages = pdfDoc.getPages();

    // מנגנון תיקון אוטונומי: אם יש סטייה של דף אחד, ננסה להתאים את ה-Data ל-PDF
    if (pages.length !== state.taskOrder.length) {
        console.warn(TAG, `Attempting auto-fix. PDF: ${pages.length}, Data: ${state.taskOrder.length}`);

        // אם ב-Data יש דף אחד יותר והוא "מכולת" (null), נסיר אותו
        if (state.taskOrder.length === pages.length + 1) {
            const lastNullIndex = state.taskOrder.lastIndexOf(null);
            if (lastNullIndex !== -1) {
                state.taskOrder.splice(lastNullIndex, 1);
                console.log(TAG, "Auto-fix: Removed one grocery page from data mapping.");
            }
        }
    }

    // בדיקה סופית אחרי ניסיון התיקון
    if (pages.length !== state.taskOrder.length) {
        const msg = `Mismatch! PDF: ${pages.length}, Data: ${state.taskOrder.length}`;
        console.error(TAG, msg, "Order:", state.taskOrder);
        throw new Error(msg);
    }

    const color = PDFLib.rgb(STRIPE_CFG.color[0]/255, STRIPE_CFG.color[1]/255, STRIPE_CFG.color[2]/255);
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

        // דף מכולת מתווסף רק אם יש באמת הרבה פריטים
        if (t.order_items && t.order_items.length >= MIN_ITEMS_FOR_EXTRA_PAGE) {
            newOrder.push(null);
        }
    });

    state.taskOrder = newOrder;
    console.log(TAG, `Data Loaded: ${newOrder.length} pages expected.`);
    return true;
  }

  async function maybeProcess() {
    if (state.processing || !state.pdfBlobUrl || !state.taskOrder.length) return;
    if (state.pdfBlobUrl === state.lastProcessedHash) return;

    state.processing = true;
    updateStatus('processing');

    try {
      const res = await fetch(state.pdfBlobUrl);
      const buf = await res.arrayBuffer();
      const stampedBytes = await stampPdf(buf);

      if (state.lastModifiedUrl) URL.revokeObjectURL(state.lastModifiedUrl);
      window[state.skipCaptureFlagName] = true;
      state.lastModifiedUrl = URL.createObjectURL(new Blob([stampedBytes], { type: 'application/pdf' }));
      setTimeout(() => window[state.skipCaptureFlagName] = false, 100);

      state.lastProcessedHash = state.pdfBlobUrl;
      updateOverlay();
      updateStatus('success');
    } catch (e) {
        updateStatus('warning', e.message);
        if (state.overlayHost) state.overlayHost.style.display = 'none';
        const viewer = document.querySelector('iframe[src*="blob:"], embed[type="application/pdf"]');
        if (viewer) viewer.style.opacity = '1';
    } finally { state.processing = false; }
  }

  function updateOverlay() {
    if (!state.lastModifiedUrl || !document.body) return;
    const viewer = document.querySelector('iframe[src*="blob:"], embed[type="application/pdf"], object[data*="blob:"]');
    if (!viewer) return;
    if (!state.overlayHost) {
      state.overlayHost = document.createElement('div');
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
    if (state.overlayFrame.src !== state.lastModifiedUrl) state.overlayFrame.src = state.lastModifiedUrl;
  }

  function injectHooks() {
    const code = `(function() {
      const send = (type, payload) => window.postMessage({ __LM_MSG: true, type, payload }, '*');
      const skipFlag = '${state.skipCaptureFlagName}';
      const origFetch = window.fetch;
      window.fetch = async function(...args) {
          const res = await origFetch.apply(this, args);
          const url = (args[0] && args[0].url) ? args[0].url : String(args[0] || '');
          if (url.includes('labels') || url.includes('tasks')) {
              const ct = res.headers.get('content-type');
              if (ct && ct.includes('json')) res.clone().json().then(d => send('json_intercept', JSON.stringify(d))).catch(()=>{});
          }
          return res;
      };
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
  }

  window.addEventListener('message', (e) => {
    if (!e.data || !e.data.__LM_MSG) return;
    if (e.data.type === 'pdf_intercept') {
      if (e.data.payload !== state.pdfBlobUrl && e.data.payload !== state.lastModifiedUrl) {
          state.pdfBlobUrl = e.data.payload;
          maybeProcess();
      }
    }
    if (e.data.type === 'json_intercept') {
      try { if (harvestTasks(JSON.parse(e.data.payload))) maybeProcess(); } catch(err) {}
    }
  });

  const boot = () => { initUI(); injectHooks(); };
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', boot); else boot();

  const observer = new MutationObserver(() => {
      if (document.querySelector('iframe[src*="blob:"], embed[type="application/pdf"]')) updateOverlay();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

})();