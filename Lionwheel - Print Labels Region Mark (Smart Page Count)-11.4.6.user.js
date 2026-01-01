// ==UserScript==
// @name         Lionwheel - Print Labels Region Mark (Smart Page Count)
// @namespace    https://members.lionwheel.com/
// @version      11.4.6
// @description  Fix race conditions with immediate injection and safe PDF hiding.
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
    thickness: 2.2,       // עובי מודגש למדפסת טרמית
    color: [0, 0, 0],     // שחור מוחלט
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
    pendingPdf: false,
    lastModifiedUrl: '',
    processing: false,
    skipCaptureFlagName: '__LabelsMarkSkipCapture',
    shadowRoot: null,
    overlayFrame: null,
    statusIndicator: null,
    lastProcessedHash: '',
    resizeObserver: null,
    observedViewer: null
  };

  // --- שלב 1: הזרקת קוד מיידית (עוד לפני טעינת ה-DOM) ---
  (function injectHooksEarly() {
    const code = `(function() {
      const TAG = '[LM-Hook]';
      const send = (type, payload) => window.postMessage({ __LM_MSG: true, type, payload }, '*');
      const skipFlag = '${state.skipCaptureFlagName}';
      const seenBlobs = new WeakSet();
      
      // 1. Safe Fetch Hook
      const origFetch = window.fetch;
      window.fetch = async function(...args) {
          const res = await origFetch.apply(this, args);
          const url = (args[0] && args[0].url) ? args[0].url : String(args[0] || '');
          if (url.includes('labels') || url.includes('tasks')) {
              const ct = res.headers.get('content-type');
              if (ct && ct.includes('json')) {
                  res.clone().json()
                    .then(d => send('json_intercept', JSON.stringify(d)))
                    .catch(() => {});
              }

              // 🔴 PDF via fetch (cached React-PDF path)
              if (ct && ct.includes('application/pdf')) {
                  res.clone().blob().then(blob => {
                      if (!seenBlobs.has(blob) && !window[skipFlag]) {
                          seenBlobs.add(blob);
                          const url = URL.createObjectURL(blob);
                          console.log('[LabelsMark] PDF Blob detected (fetch)');
                          send('pdf_intercept', url);
                      }
                  }).catch(() => {});
              }
          }
          return res;
      };

      // 2. Safe XHR Hook (Fixes the InvalidStateError)
      const origOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function() {
          this.addEventListener('load', function() {
              try {
                  // Only attempt to read if it's text/json and NOT a blob
                  if (this.responseType === '' || this.responseType === 'text') {
                      if (this.responseText && (this.responseText.includes('"tasks"') || this.responseText.includes('"dest_region"'))) {
                          send('json_intercept', this.responseText);
                      }
                  }
              } catch (e) { /* Ignore binary data access errors */ }
          });
          return origOpen.apply(this, arguments);
      };

      // 3. PDF Capture Hook
      const origCOU = URL.createObjectURL;
      URL.createObjectURL = function(blob) {
          const url = origCOU.call(URL, blob);
          try {
              if (blob && blob.type === 'application/pdf' && !window[skipFlag] && !seenBlobs.has(blob)) {
                  seenBlobs.add(blob);
                  console.log('[LabelsMark] PDF Blob detected (createObjectURL)');
                  send('pdf_intercept', url);
              }
          } catch (_) {
              /* Safari / opaque blobs */
          }
          return url;
      };
      console.log(TAG, 'Hooks injected successfully at document-start');
    })();`;
    const script = document.createElement('script');
    script.textContent = code;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  })();

  // 🔁 Re-arm hooks after load (React cache reload fix)
  window.addEventListener('pageshow', (e) => {
      if (e.persisted) {
          console.log('[LabelsMark] pageshow persisted – rearming hooks');
          try {
              window.postMessage({ __LM_REARM: true }, '*');
          } catch (_) {}
      }
  });

  // --- שלב 2: לוגיקת עיבוד הנתונים ---

  function findTasksInObject(obj) {
      if (!obj || typeof obj !== 'object') return null;
      if (Array.isArray(obj)) {
          const hasTaskFields = obj.length > 0 && obj[0] && (obj[0].dest_region !== undefined || obj[0].packages_quantity !== undefined);
          if (hasTaskFields) return obj;
          for (let item of obj) {
              const found = findTasksInObject(item);
              if (found) return found;
          }
      } else {
          for (let key in obj) {
              const found = findTasksInObject(obj[key]);
              if (found) return found;
          }
      }
      return null;
  }

  function harvestTasks(data) {
    const tasks = findTasksInObject(data);
    if (!tasks || !Array.isArray(tasks)) return false;

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

    if (newOrder.length > 0) {
        state.taskOrder = newOrder;
        console.log(TAG, `Successfully harvested ${newOrder.length} pages logic.`);
        return true;
    }
    return false;
  }

  function tryHarvestFromReact() {
    try {
      const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
      if (!hook || !hook.renderers) return false;

      for (const renderer of hook.renderers.values()) {
        const roots = hook.getFiberRoots(renderer.rendererPackageName);
        for (const root of roots) {
          let node = root.current;
          const stack = [node];
          while (stack.length) {
            const n = stack.pop();
            if (n?.memoizedProps?.tasks) {
              if (harvestTasks({ tasks: n.memoizedProps.tasks })) {
                console.log(TAG, 'Tasks harvested from React fiber');
                return true;
              }
            }
            if (n.child) stack.push(n.child);
            if (n.sibling) stack.push(n.sibling);
          }
        }
      }
    } catch (e) {
      console.warn(TAG, 'React harvest failed', e);
    }
    return false;
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

    // Auto-align logic
    if (pages.length !== state.taskOrder.length) {
        if (state.taskOrder.length === pages.length + 1) {
            const lastNullIndex = state.taskOrder.lastIndexOf(null);
            if (lastNullIndex !== -1) state.taskOrder.splice(lastNullIndex, 1);
        }
    }

    if (pages.length !== state.taskOrder.length) {
        throw new Error(`Mismatch! PDF has ${pages.length} pages, Data has ${state.taskOrder.length}`);
    }

    const color = PDFLib.rgb(0, 0, 0); // Pure Black
    pages.forEach((page, i) => {
      const lane = state.taskOrder[i];
      if (lane === null) return;
      const { width, height } = page.getSize();
      let x = (lane === 0) ? width * 0.08 : (lane === 1) ? width * 0.51 : width * 0.92;
      page.drawLine({
          start: { x: x, y: STRIPE_CFG.marginY },
          end: { x: x, y: height - STRIPE_CFG.marginY },
          thickness: STRIPE_CFG.thickness,
          color: color
      });
    });
    return await pdfDoc.save();
  }

  async function maybeProcess() {
    if (state.processing || !state.pdfBlobUrl) return;
    if (state.pdfBlobUrl === state.lastProcessedHash) return;
    if (state.taskOrder.length === 0) {
        state.pendingPdf = true;
        tryHarvestFromReact();
        console.log(TAG, 'PDF waiting for taskOrder');
        return;
    }

    state.processing = true;
    updateStatus('processing');

    try {
      const res = await fetch(state.pdfBlobUrl);
      const buf = await res.arrayBuffer();
      const stampedBytes = await stampPdf(buf);

      if (state.lastModifiedUrl) URL.revokeObjectURL(state.lastModifiedUrl);
      window[state.skipCaptureFlagName] = true;
      state.lastModifiedUrl = URL.createObjectURL(new Blob([stampedBytes], { type: 'application/pdf' }));
      setTimeout(() => window[state.skipCaptureFlagName] = false, 500);

      state.lastProcessedHash = state.pdfBlobUrl;
      updateOverlay();
      updateStatus('success');
    } catch (e) {
        console.error(TAG, e);
        updateStatus('warning', e.message);
    } finally { state.processing = false; }
  }

  function initUI() {
    if (state.shadowRoot || !document.body) return;
    const host = document.createElement('div');
    host.id = 'lm-overlay-host';
    host.style.cssText = 'position:absolute; top:0; left:0; width:0; height:0; z-index:2147483647; pointer-events:none;';
    document.body.appendChild(host);
    state.shadowRoot = host.attachShadow({ mode: 'closed' });

    state.statusIndicator = document.createElement('div');
    state.statusIndicator.style.cssText = 'position:fixed; bottom:15px; right:15px; width:12px; height:12px; border-radius:50%; border:2px solid white; background: #757575; z-index: 2147483647; pointer-events:auto; cursor:help;';
    state.shadowRoot.appendChild(state.statusIndicator);
  }

  function updateStatus(status, title = '') {
      if (!state.statusIndicator) return;
      const colors = { idle: '#757575', processing: '#FB8C00', success: '#43A047', error: '#E53935', warning: '#FFEB3B' };
      state.statusIndicator.style.background = colors[status] || colors.idle;
      if (title) state.statusIndicator.title = title;
      console.log(TAG, `Status: ${status} ${title}`);
  }

  function updateOverlay() {
    if (!state.lastModifiedUrl || !state.shadowRoot) return;
    const viewer = document.querySelector('iframe[src*="blob:"], embed[type="application/pdf"], object[data*="blob:"]');
    if (!viewer) return;

    if (!state.overlayFrame) {
      state.overlayFrame = document.createElement('iframe');
      state.overlayFrame.style.cssText = 'position:fixed; z-index:2147483646; border:none; background:white; pointer-events:auto;';
      state.shadowRoot.appendChild(state.overlayFrame);
    }

    if (state.observedViewer !== viewer) {
        if (state.resizeObserver) state.resizeObserver.disconnect();
        state.resizeObserver = new ResizeObserver(() => {
            const rect = viewer.getBoundingClientRect();
            if (rect.width === 0) return;
            Object.assign(state.overlayFrame.style, {
                top: rect.top + 'px', left: rect.left + 'px',
                width: rect.width + 'px', height: rect.height + 'px',
                display: 'block'
            });
        });
        state.resizeObserver.observe(viewer);
        state.observedViewer = viewer;
    }

    // שימוש ב-Opacity במקום Visibility כדי לא לשבור את React
    viewer.style.opacity = '0';
    if (state.overlayFrame.src !== state.lastModifiedUrl) state.overlayFrame.src = state.lastModifiedUrl;
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
          if (harvestTasks(data)) {
              console.log(TAG, 'Task data Intercepted');
              if (state.pendingPdf) {
                  state.pendingPdf = false;
              }
              maybeProcess();
          }
      } catch(err) {}
    }
  });

  if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', () => {
          initUI();
          if (state.pendingPdf && state.taskOrder.length === 0) {
              tryHarvestFromReact();
              maybeProcess();
          }
      });
  } else {
      initUI();
      if (state.pendingPdf && state.taskOrder.length === 0) {
          tryHarvestFromReact();
          maybeProcess();
      }
  }

  const observer = new MutationObserver(() => {
      if (document.querySelector('iframe[src*="blob:"], embed[type="application/pdf"]')) {
          updateOverlay();
      }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

})();