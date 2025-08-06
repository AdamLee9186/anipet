// ==UserScript==
// @name         Lionwheel Quantity Stepper
// @namespace    adam.lionwheel.touch.stepper
// @version      2.0.0
// @description  Enhanced quantity stepper with touch-friendly +/- buttons, visual feedback, and responsive design. Works on all number inputs with negative number support.
// @author       Adam Lee
// @match        https://members.lionwheel.com/*
// @match        https://lionwheel.com/*
// @grant        GM_addStyle
// @run-at       document-end
// @homepage     https://github.com/AdamLee9186/anipet
// @supportURL   https://github.com/AdamLee9186/anipet
// @updateURL    https://raw.githubusercontent.com/AdamLee9186/anipet/main/Lionwheel%20Quantity%20Stepper.js
// @downloadURL  https://raw.githubusercontent.com/AdamLee9186/anipet/main/Lionwheel%20Quantity%20Stepper.js
// ==/UserScript==

(function () {
  'use strict';

  // Configuration
  const CONFIG = {
    VERSION: '2.0.0',
    MIN_VALUE: -999,
    MAX_VALUE: 999999,
    HOLD_DELAY: 400,
    REPEAT_INTERVALS: [160, 90, 60], // ms intervals for hold repeat
    ANIMATION_DURATION: 300,
    BUTTON_SIZE: 32,
    MIN_INPUT_WIDTH: 'calc(6ch + 20px)'
  };

  // Error handling utility
  const safeExecute = (fn, context = 'Unknown') => {
    try {
      return fn();
    } catch (error) {
      console.error(`[Lionwheel Stepper] Error in ${context}:`, error);
      return null;
    }
  };

  // Performance optimization: debounced function
  const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  };

  GM_addStyle(`
    /* Give the quantity column enough room for [-][###][+] with proper spacing */
    .order-item-input.order-item-small:has([name*="[quantity]"]),
    .order-item-input.order-item-small:has([id$="_quantity"]) {
      min-width: 140px;            /* increased to accommodate wider input + buttons */
      flex: 0 0 auto;
    }

    .lwq-row {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      vertical-align: middle;
      min-width: fit-content;
    }

.lwq-row .lwq-input.form-control {
  min-width: calc(6ch + 20px) !important;   /* wider minimum for 3 digits */
  padding-inline: 8px !important;
  text-align: center !important;
  font-variant-numeric: tabular-nums;
  -moz-appearance: textfield;
  box-sizing: border-box;
  flex: 1 1 auto !important;            /* allow flex to grow and fill space */
}

/* Wider padding for modal contexts */
.modal .lwq-row .lwq-input.form-control {
  padding-inline: 16px !important;
}
    .lwq-input::-webkit-outer-spin-button,
    .lwq-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }

    .lwq-btn {
      all: unset;
      display: grid;
      place-items: center;
      width: 32px !important;
      height: 32px !important;
      min-width: 32px !important;
      min-height: 32px !important;
      border-radius: 999px;
      box-shadow: 0 1px 3px rgba(0,0,0,.14);
      background: #fff;
      border: 1px solid rgba(0,0,0,.12);
      line-height: 0;
      cursor: pointer;
      user-select: none;
      -webkit-tap-highlight-color: transparent;
      transition: all 0.15s ease !important;
      touch-action: manipulation;
      flex: 0 0 32px !important;
      transform: translateY(0);
    }
    .lwq-btn:hover {
      background: #f8f9fa !important;
      transform: translateY(-1px) !important;
      box-shadow: 0 2px 6px rgba(0,0,0,.16) !important;
    }
    .lwq-btn:active { 
      transform: scale(0.95) translateY(1px) !important; 
      background: #f6f6f6 !important; 
    }
    .lwq-disabled { opacity:.45; pointer-events:none; }

    .lwq-btn svg { width: 16px; height: 16px; }
    
    /* Input feedback animations */
    .lwq-input.form-control {
      transition: transform 0.15s ease, background-color 0.3s ease, border-color 0.2s ease;
    }
    .lwq-input.form-control:focus {
      border-color: #007bff;
      box-shadow: 0 0 0 0.2rem rgba(0,123,255,.25);
    }
    .lwq-input.form-control.lwq-feedback {
      animation: lwq-pulse 0.3s ease;
    }
    @keyframes lwq-pulse {
      0% { transform: scale(1); }
      50% { transform: scale(1.05); }
      100% { transform: scale(1); }
    }
    
    /* Prevent line breaks in quantity max indicators */
    .col-sm-4 .mx-1,
    .d-flex.align-items-center .mx-1 {
      white-space: nowrap !important;
      word-break: keep-all !important;
      overflow-wrap: normal !important;
      display: inline-block !important;
    }
  `);

  const isQtyInput = el =>
    el && el.tagName === 'INPUT' && el.type === 'number';

  const already = el => el.dataset.lwq === '1';

  const clamp = (v, min, max) => {
    if (Number.isFinite(min)) v = Math.max(v, min);
    if (Number.isFinite(max)) v = Math.min(v, max);
    return v;
  };

  const numAttr = (el, a, fb) => {
    const v = el.getAttribute(a);
    if (v === null || v === '') return fb;
    const n = Number(v);
    return Number.isFinite(n) ? n : fb;
  };

  const snapTo = (val, step, base) => {
    if (!Number.isFinite(step) || step <= 0) return val;
    const b = Number.isFinite(base) ? base : 0;
    const k = Math.round((val - b) / step);
    return b + k * step;
  };

  const fire = el => {
    safeExecute(() => {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, 'fire events');
  };

  function enhance(input) {
    if (!isQtyInput(input) || already(input) || input.readOnly) {
      return;
    }

    const row = document.createElement('span');
    row.className = 'lwq-row';

    const minus = document.createElement('button');
    minus.type = 'button';
    minus.className = 'lwq-btn lwq-minus';
    minus.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 11h14v2H5z"/></svg>`;
    
    const plus = document.createElement('button');
    plus.type = 'button';
    plus.className = 'lwq-btn lwq-plus';
    plus.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/></svg>`;
    
    /* ensure buttons maintain touch-friendly size */
    [minus, plus].forEach(btn => {
      btn.style.width = '32px';
      btn.style.height = '32px';
      btn.style.minWidth = '32px';
      btn.style.minHeight = '32px';
      btn.style.flex = '0 0 32px';
      btn.style.transition = 'all 0.15s ease';
      btn.style.transform = 'translateY(0)';
    });

    input.parentNode.insertBefore(row, input);
    row.append(minus, input, plus);

    input.classList.add('lwq-input');
    input.dataset.lwq = '1';

    /* responsive width - let flex handle the sizing */
    const isInModal = input.closest('.modal') !== null;
    const padding = isInModal ? '16px' : '8px';
    
    input.style.minWidth = 'calc(6ch + 20px)';
    input.style.paddingInline = padding;
    input.style.flex = '1 1 auto';

    const syncDisabled = () => {
      const dis = input.disabled || input.readOnly;
      [minus, plus].forEach(b => b.classList.toggle('lwq-disabled', dis));
    };
    syncDisabled();

    const cfg = () => ({
      step: numAttr(input, 'step', 1),
      min:  CONFIG.MIN_VALUE,
      max:  numAttr(input, 'max', CONFIG.MAX_VALUE),
    });

    function ensureNumeric() {
      if (input.value === '' || isNaN(Number(input.value))) {
        const { min } = cfg();
        input.value = Number.isFinite(min) ? String(min) : '0';
      }
    }

    function adjust(steps) {
      ensureNumeric();
      const { step, min, max } = cfg();
      const s = Number.isFinite(step) && step > 0 ? step : 1;
      const cur = Number(input.value);
      let next = clamp(cur + steps * s, min, max);
      next = snapTo(next, s, min);
      if (next !== cur) { 
        input.value = String(next); 
        fire(input);
        
        // Visual feedback
        input.classList.add('lwq-feedback');
        setTimeout(() => input.classList.remove('lwq-feedback'), CONFIG.ANIMATION_DURATION);
        
        // Color feedback based on direction
        const oldValue = cur;
        const newValue = next;
        if (newValue > oldValue) {
          input.style.backgroundColor = '#e8f5e8';
          setTimeout(() => input.style.backgroundColor = '', CONFIG.ANIMATION_DURATION);
        } else if (newValue < oldValue) {
          input.style.backgroundColor = '#ffe8e8';
          setTimeout(() => input.style.backgroundColor = '', CONFIG.ANIMATION_DURATION);
        }
      }
    }

    // Tap = ±1; hold begins after 400ms
    function bindHold(btn, dir) {
      let timer = null, raf = null, start = 0, running = false, last = 0;

      const startRepeat = () => {
        running = true; start = 0; last = 0;
        raf = requestAnimationFrame(function loop(ts) {
          if (!running) return;
          if (!start) start = ts;
          const ms = ts - start;
          const interval = ms < 800 ? CONFIG.REPEAT_INTERVALS[0] : ms < 1600 ? CONFIG.REPEAT_INTERVALS[1] : CONFIG.REPEAT_INTERVALS[2];
          if (ts - last >= interval) { last = ts; adjust(dir); }
          raf = requestAnimationFrame(loop);
        });
      };

      const down = e => {
        if (input.disabled || input.readOnly) return;
        e.preventDefault(); e.stopPropagation();
        input.focus({ preventScroll: true });
        adjust(dir); // single step
        timer = setTimeout(startRepeat, CONFIG.HOLD_DELAY);
      };
      const up = () => {
        clearTimeout(timer); timer = null;
        running = false;
        if (raf) cancelAnimationFrame(raf); raf = null;
      };

      btn.addEventListener('pointerdown', down, { passive: false });
      window.addEventListener('pointerup', up, { passive: true });
      window.addEventListener('pointercancel', up, { passive: true });
      window.addEventListener('blur', up, { passive: true });
      btn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); }, { passive: false });
    }

    bindHold(minus, -1);
    bindHold(plus, +1);

    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowUp')   { e.preventDefault(); adjust(+1); }
      if (e.key === 'ArrowDown') { e.preventDefault(); adjust(-1); }
    });
    
    // Enhanced focus handling
    input.addEventListener('focus', () => {
      input.style.borderColor = '#007bff';
      input.style.boxShadow = '0 0 0 0.2rem rgba(0,123,255,.25)';
    });
    
    input.addEventListener('blur', () => {
      input.style.borderColor = '';
      input.style.boxShadow = '';
    });

    new MutationObserver(syncDisabled).observe(input, { attributes: true, attributeFilter: ['disabled','readonly'] });
  }

  // Debounced scan function for performance
  const debouncedScan = debounce((root = document) => {
    // Use requestAnimationFrame for better performance
    requestAnimationFrame(() => {
      root.querySelectorAll('input[type="number"]').forEach(el => { 
        if (isQtyInput(el)) enhance(el); 
      });
    });
  }, 100);

  function scan(root = document) {
    debouncedScan(root);
  }

  // Initialize
  scan();
  console.log(`[Lionwheel Stepper] v${CONFIG.VERSION} initialized`);

  // Optimized mutation observer
  const observer = new MutationObserver(muts => {
    let shouldScan = false;
    
    for (const m of muts) {
      if (m.type === 'childList' && m.addedNodes.length > 0) {
        shouldScan = true;
        break;
      }
      if (m.type === 'attributes' && isQtyInput(m.target)) {
        enhance(m.target);
      }
    }
    
    if (shouldScan) {
      scan();
    }
  });

  safeExecute(() => {
    observer.observe(document.documentElement, { 
      childList: true, 
      subtree: true, 
      attributes: true, 
      attributeFilter: ['type','name','id'] 
    });
  }, 'mutation observer setup');

  // Event listeners
  window.addEventListener('turbo:load', () => scan(), { passive: true });
  window.addEventListener('popstate', () => requestAnimationFrame(() => scan()), { passive: true });

  // Cleanup function for page unload
  window.addEventListener('beforeunload', () => {
    safeExecute(() => {
      observer.disconnect();
    }, 'cleanup');
  });

  // Expose version for debugging
  window.LionwheelStepper = {
    version: CONFIG.VERSION,
    config: CONFIG
  };

})();
