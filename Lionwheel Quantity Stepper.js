// ==UserScript==
// @name         Lionwheel Quantity Stepper
// @namespace    adam.lionwheel.touch.stepper
// @version      2.1.9
// @description  Touch-friendly quantity input with smart animation and accessibility
// @author       Adam Lee
// @license      MIT
// @match        https://members.lionwheel.com/*
// @match        https://lionwheel.com/*
// @grant        GM_addStyle
// @run-at       document-start
// @homepage     https://github.com/AdamLee9186/anipet
// @supportURL   https://github.com/AdamLee9186/anipet
// @updateURL    https://raw.githubusercontent.com/AdamLee9186/anipet/main/Lionwheel%20Quantity%20Stepper.js
// @downloadURL  https://raw.githubusercontent.com/AdamLee9186/anipet/main/Lionwheel%20Quantity%20Stepper.js
// ==/UserScript==

(function () {
  'use strict';

  // Add a global booting class ASAP to prevent first-paint value flash
  document.documentElement.classList.add('lwq-booting');

  // Configuration
  const CONFIG = {
    VERSION: '2.1.9',
    MIN_VALUE: -999,
    MAX_VALUE: 999999,
    HOLD_DELAY: 400,
    REPEAT_INTERVALS: [160, 90, 60], // ms intervals for hold repeat
    ANIMATION_DURATION: 300,
    BUTTON_SIZE: 32,
    MIN_INPUT_WIDTH: 'calc(6ch + 20px)',
    ENABLE_HOLD_REPEAT: true,
    DEFAULT_VALUE: 1
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
    /* Global booting: hide digits before enhancement/first scan */
    .lwq-booting input[type="number"][name*="[quantity]"],
    .lwq-booting input[type="number"][id$="_quantity"],
    .lwq-booting input.order-item-quantity-input[type="number"] {
      color: transparent !important;
      caret-color: transparent !important;
      text-shadow: none !important;
    }

    /* Modal-scoped booting (no global flicker) */
    .modal.lwq-booting input[type="number"][name*="[quantity]"],
    .modal.lwq-booting input[type="number"][id$="_quantity"],
    .modal.lwq-booting input.order-item-quantity-input[type="number"] {
      color: transparent !important;
      caret-color: transparent !important;
      text-shadow: none !important;
    }

    /* Keep current per-input hiding as a second safety net */
    input[type="number"][name*="[quantity]"]:not([data-lwq="1"]),
    input[type="number"][id$="_quantity"]:not([data-lwq="1"]),
    input.order-item-quantity-input[type="number"]:not([data-lwq="1"]) {
      color: transparent !important;
      caret-color: transparent !important;
      text-shadow: none !important;
    }
    input[type="number"][name*="[quantity]"]:not([data-lwq="1"])::placeholder,
    input[type="number"][id$="_quantity"]:not([data-lwq="1"])::placeholder,
    input.order-item-quantity-input[type="number"]:not([data-lwq="1"])::placeholder {
      color: transparent !important;
    }

    /* Give the quantity column enough room for [-][###][+] with proper spacing */
    .order-item-input.order-item-small:has([name*="[quantity]"]),
    .order-item-input.order-item-small:has([id$="_quantity"]),
    .order-item-input.order-item-small:has(.order-item-quantity-input) {
      min-width: 140px;            /* increased to accommodate wider input + buttons */
      flex: 0 0 auto;
    }

    /* Reduce product name field width to give more space to other columns */
    .order-item-input.order-item-big:has([name*="[name]"]),
    .order-item-input.order-item-big:has([id$="_name"]) {
      min-width: 230px;            /* reduced from default to give more space to price column */
      max-width: 280px;            /* prevent it from taking too much space */
      flex: 1 0 auto;              /* allow it to grow but not shrink below minimum */
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

    /* Visual feedback for drag prevention */
    .lwq-btn.lwq-dragging {
      opacity: 0.6 !important;
      transform: scale(0.95) translateY(1px) !important;
      background: #f0f0f0 !important;
    }

    /* Input feedback animations */
    .lwq-input.form-control {
      transition: transform 0.15s ease, background-color 0.3s ease, border-color 0.2s ease;
      position: relative;
      overflow: hidden;
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

    /* Display wrapper for number animation */
    .lwq-display-wrapper {
      position: relative;
      display: inline-block;
      width: 100%;
      height: 100%;
    }

    .lwq-display-wrapper input.lwq-input {
      color: transparent; /* Hide the real number visually */
      caret-color: auto; /* Keep cursor visible */
      position: relative;
      z-index: 1;
      background: transparent;
    }

    .lwq-display-value {
      position: absolute;
      top: 50%;
      left: 0;
      width: 100%;
      transform: translateY(-50%);
      text-align: center;
      pointer-events: none;
      z-index: 2;
      transition: transform 0.3s ease, opacity 0.3s ease;
      font-family: inherit;
      font-size: inherit;
      line-height: inherit;
      will-change: transform, opacity;
    }

    .lwq-display-value.lwq-slide-up {
      animation: lwq-slide-up-number 0.3s ease-out;
    }

    .lwq-display-value.lwq-slide-down {
      animation: lwq-slide-down-number 0.3s ease-out;
    }

    @keyframes lwq-slide-up-number {
      0%   { transform: translateY(-50%); opacity: 1; }
      50%  { transform: translateY(-150%); opacity: 0; }
      51%  { transform: translateY(50%); opacity: 0; }
      100% { transform: translateY(-50%); opacity: 1; }
    }

    @keyframes lwq-slide-down-number {
      0%   { transform: translateY(-50%); opacity: 1; }
      50%  { transform: translateY(50%); opacity: 0; }
      51%  { transform: translateY(-150%); opacity: 0; }
      100% { transform: translateY(-50%); opacity: 1; }
    }

    /* Prevent line breaks in quantity max indicators */
    .col-sm-4 .mx-1,
    .d-flex.align-items-center .mx-1 {
      white-space: nowrap !important;
      word-break: keep-all !important;
      overflow-wrap: normal !important;
      display: inline-block !important;
    }

    /* Keep the quantity row from pushing the checkmark column (desktop/default) */
    .pick-order-item-row .col-sm-4 > .d-flex.align-items-center {
      flex-wrap: nowrap;
      gap: 6px; /* breathing room for [-][input][+] */
      align-items: center;
    }
    /* Do not let the quantity input grow; keep its fixed width so the checkmark stays in its column */
    .pick-order-item-row .col-sm-4 .lwq-row .lwq-input.form-control {
      flex: 0 0 auto !important;
      width: 65px !important; /* match site inline style */
    }
    /* Buttons near the fixed-width input should not grow either */
    .pick-order-item-row .col-sm-4 .lwq-row .lwq-minus,
    .pick-order-item-row .col-sm-4 .lwq-row .lwq-plus {
      flex: 0 0 32px !important;
    }
    /* Avoid clipping stepper inside narrow grids */
    .pick-order-item-row .col-sm-4 > .d-flex.align-items-center { overflow: visible; }

    /* --- Prevent title from colliding with "/ max" by reserving space for the stepper --- */
    /* Keep row on one line */
    .pick-order-item-row .row.d-flex.align-items-center { flex-wrap: nowrap; }

    /* Title column: takes the remaining width and can wrap */
    .pick-order-item-row .col-sm-6 {
      flex: 1 1 0% !important;
      min-width: 0 !important;               /* allow wrapping instead of overflow */
    }
    .pick-order-item-row .col-sm-6 .text-break {
      overflow-wrap: anywhere;
      word-break: break-word;
    }

    /* Middle column: fixed, non-wrapping width that fits (-)[qty](+) + " / max" */
    .pick-order-item-row .col-sm-4 {
      flex: 0 0 180px !important;            /* reserve enough room */
      max-width: 180px !important;
    }
    .pick-order-item-row .col-sm-4 > .d-flex.align-items-center {
      white-space: nowrap;                    /* keep everything on one line */
      gap: 6px;
      align-items: center;
    }

    /* Right column (checkmark): compact, natural width */
    .pick-order-item-row .col-sm-2 {
      flex: 0 0 auto !important;
      width: auto !important;
    }

    /* Extra-tight layout for very narrow modals */
    @media (max-width: 620px) {
      .pick-order-item-row .col-sm-4 {
        flex-basis: 164px !important;
        max-width: 164px !important;
      }
      .pick-order-item-row .col-sm-4 .lwq-row { gap: 4px; }
      .pick-order-item-row .col-sm-4 .lwq-row .lwq-input.form-control { width: 56px !important; }
      .pick-order-item-row .col-sm-4 .lwq-row .lwq-minus,
      .pick-order-item-row .col-sm-4 .lwq-row .lwq-plus {
        width: 28px !important; height: 28px !important;
        min-width: 28px !important; min-height: 28px !important;
        flex: 0 0 28px !important;
      }
    }
  `);

  // Treat native quantity inputs, plus Lionwheel order rows, as eligible
  const isQtyInput = el =>
    el
    && el.tagName === 'INPUT'
    && el.type === 'number'
    && (
      // existing broad support
      true
      // explicit allow-list for Lionwheel order rows
      || el.classList.contains('order-item-quantity-input')
      || (el.name && /\[quantity\]/.test(el.name))
      || (el.id && /_quantity$/.test(el.id))
    );

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

  // Read the original numeric value that the page set (value property, value attr, or defaultValue)
  const getInitialNumericValue = (input) => {
    const candidates = [
      input.value,
      input.getAttribute('value'),
      input.defaultValue
    ];
    for (const c of candidates) {
      if (c !== null && c !== '' && !Number.isNaN(Number(c))) return Number(c);
    }
    return CONFIG.DEFAULT_VALUE;
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

  function resetAllQtyToDefault(root = document) {
    root.querySelectorAll('input[type="number"][data-lwq="1"]').forEach((el) => {
      const v = (el.dataset.lwqInitial ?? el.value);
      if (v !== undefined) {
        el.value = String(v);
        el.defaultValue = el.value;
        el.setAttribute('value', el.value);
        const span = el.closest('.lwq-display-wrapper')?.querySelector('.lwq-display-value');
        if (span) span.textContent = el.value;
      }
    });
  }

  function liftBootingWhenReady(root = document) {
    // If no target inputs remain unenhanced, lift the booting class
    const pending = root.querySelector('input[type="number"][name*="[quantity]"]:not([data-lwq="1"]), input[type="number"][id$="_quantity"]:not([data-lwq="1"]), input.order-item-quantity-input[type="number"]:not([data-lwq="1"])');
    if (!pending) {
      document.documentElement.classList.remove('lwq-booting');
      return true;
    }
    return false;
  }

  function setModalBooting(modal, on) {
    if (!modal) return;
    modal.classList.toggle('lwq-booting', !!on);
  }

  // Helper: robustly read the "max" shown to the user
  function getRowMax(input) {
    // 1) Prefer numeric max attribute
    const amax = input.getAttribute('max');
    if (amax !== null && amax !== '' && Number.isFinite(Number(amax))) {
      return Number(amax);
    }
    // 2) Fallback: parse the sibling "/ N" text
    const wrap = input.closest('.d-flex.align-items-center');
    const slashSpan = wrap && wrap.querySelector('.mx-1');
    if (slashSpan) {
      const m = String(slashSpan.textContent || '').match(/\/\s*([+-]?\d+)/);
      if (m) return Number(m[1]);
    }
    return null;
  }

  // Helper function to set quantity programmatically with proper event firing
  function setQtyProgrammatically(input, value) {
    const oldValue = input.value;
    input.value = String(value);
    input.defaultValue = input.value;
    input.setAttribute('value', input.value);
    
    // Update the display overlay
    const displaySpan = input.closest('.lwq-display-wrapper')?.querySelector('.lwq-display-value');
    if (displaySpan) {
      displaySpan.textContent = input.value;
    }
    
    // Fire events to notify the site's logic
    if (oldValue !== input.value) {
      fire(input);
    }
  }

  // Delegate checkmark clicks: CHECK -> fill max (remember previous), UNCHECK -> restore previous
  function installCheckmarkSync(root = document) {
    if (root.__lwqCheckmarkSyncInstalled) return;
    root.__lwqCheckmarkSyncInstalled = true;
    root.addEventListener('click', (ev) => {
      const icon = ev.target && (ev.target.closest?.('.order-item-checked'));
      if (!icon) return;
      const row = icon.closest('.pick-order-item-row') || icon.closest('tr');
      if (!row) return;
      const pickInput = () =>
        row.querySelector('input.lwq-input.order-item-quantity-input[type="number"]') ||
        row.querySelector('input.order-item-quantity-input[type="number"]') ||
        row.querySelector('input[type="number"]');
      const input = pickInput();
      if (!input) return; // nothing to sync

      // State BEFORE site handler toggles it
      const wasChecked =
        icon.getAttribute('data-item-checked') === 'true' ||
        icon.classList.contains('item-check-picked') ||
        row.classList.contains('bg-success-picked');
      // Snapshot BEFORE toggle
      const prevValueBeforeToggle = input.value;
      const preToggleMax = getRowMax(input);  // read before attributes change

      // Let the site's handler run first (toggle classes, disable, etc.)
      setTimeout(() => {
        // Re-acquire the input in case the site re-rendered/replaced it
        const curInput = pickInput() || input;
        const isCheckedNow =
          icon.getAttribute('data-item-checked') === 'true' ||
          icon.classList.contains('item-check-picked') ||
          row.classList.contains('bg-success-picked');

        // Transition: UNCHECKED -> CHECKED
        if (!wasChecked && isCheckedNow) {
          // Store previous value on both the input and the row (survives input replacement)
          curInput.dataset.lwqPrev = String(prevValueBeforeToggle);
          row.dataset.lwqPrev = String(prevValueBeforeToggle);
          const targetMax = (preToggleMax ?? getRowMax(curInput));
          if (targetMax === null || Number.isNaN(targetMax)) return;
          setQtyProgrammatically(curInput, targetMax);
          return;
        }

        // Transition: CHECKED -> UNCHECKED
        if (wasChecked && !isCheckedNow) {
          const restore =
            (row.dataset.lwqPrev ?? '') !== '' ? row.dataset.lwqPrev :
            (curInput.dataset.lwqPrev ?? '') !== '' ? curInput.dataset.lwqPrev :
            (curInput.dataset.lwqInitial ?? '');
          if ((restore ?? '') !== '') setQtyProgrammatically(curInput, restore);
          // Clear stored previous value
          delete row.dataset.lwqPrev;
          delete curInput.dataset.lwqPrev;
        }
      }, 0);
    }, true); // capture phase to observe pre-toggle state too
  }

  function enhance(input) {
    // Strict feature detection
    if (!(input instanceof HTMLInputElement)) {
      console.warn('[Lionwheel Stepper] Input is not an HTMLInputElement, skipping enhancement');
      return;
    }

    if (!isQtyInput(input) || already(input) || input.readOnly) {
      return;
    }

    try {
      // Defensive code around DOM mutation
      if (!input.parentNode || !input.parentNode.isConnected) {
        console.warn('[Lionwheel Stepper] Input has no valid parent node, skipping enhancement');
        return;
      }

    const row = document.createElement('span');
    row.className = 'lwq-row';

    const minus = document.createElement('button');
    minus.type = 'button';
    minus.className = 'lwq-btn lwq-minus';
    minus.setAttribute('aria-label', 'Decrease quantity');
    minus.setAttribute('role', 'button');
    minus.setAttribute('tabindex', '0');
    minus.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 11h14v2H5z"/></svg>`;

    const plus = document.createElement('button');
    plus.type = 'button';
    plus.className = 'lwq-btn lwq-plus';
    plus.setAttribute('aria-label', 'Increase quantity');
    plus.setAttribute('role', 'button');
    plus.setAttribute('tabindex', '0');
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

    // Defensive DOM mutation with validation
    if (!input.parentNode || !input.parentNode.isConnected) {
      console.warn('[Lionwheel Stepper] Input parent disconnected during enhancement');
      return;
    }

    input.parentNode.insertBefore(row, input);
    row.append(minus, input, plus);

    // Preserve the **original** quantity from the page instead of forcing a default
    const initial = getInitialNumericValue(input);
    input.dataset.lwqInitial = String(initial);
    input.value = String(initial);
    input.defaultValue = input.value;
    input.setAttribute('value', input.value);

    // Keep ensureNumeric for safety
    ensureNumeric();

    input.classList.add('lwq-input');
    input.dataset.lwq = '1';
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('spellcheck', 'false');

    /* Create display wrapper for number animation */
    const displayWrapper = document.createElement('div');
    displayWrapper.className = 'lwq-display-wrapper';
    displayWrapper.innerHTML = `<span class="lwq-display-value">${input.value || '0'}</span>`;

    /* Replace input with wrapper and put input inside */
    if (!input.parentNode || !input.parentNode.isConnected) {
      console.warn('[Lionwheel Stepper] Input parent disconnected during wrapper creation');
      return;
    }

    input.parentNode.insertBefore(displayWrapper, input);
    displayWrapper.appendChild(input);

    // Make sure overlay shows the current (preserved) value now
    const displaySpan = displayWrapper.querySelector('.lwq-display-value');
    const syncDisplay = () => { if (displaySpan) displaySpan.textContent = input.value || '0'; };
    syncDisplay();

    // Immediate sync and short early watch to catch late programmatic value sets
    const watchUntil = performance.now() + 1500;
    (function rafWatch() {
      syncDisplay();
      if (performance.now() < watchUntil) {
        requestAnimationFrame(rafWatch);
      }
    })();

    // Add more event hooks to keep display in sync
    ['change','keyup','keydown','blur','focus','pointerdown'].forEach(ev => {
      input.addEventListener(ev, syncDisplay, { passive: true });
    });

    /* responsive width */
    const isInModal = input.closest('.modal') !== null;
    const padding = isInModal ? '16px' : '8px';

    input.style.minWidth = 'calc(6ch + 20px)';
    input.style.paddingInline = padding;
    // IMPORTANT: do not let the input grow; keep it fixed so the checkmark column remains at the end
    input.style.flex = '0 0 auto';

    const syncDisabled = () => {
      const dis = input.disabled || input.readOnly;
      [minus, plus].forEach(b => b.classList.toggle('lwq-disabled', dis));
    };
    syncDisabled();

    const cfg = () => ({
      step: numAttr(input, 'step', 1),
      min:  numAttr(input, 'min', CONFIG.MIN_VALUE),
      max:  numAttr(input, 'max', CONFIG.MAX_VALUE),
    });

    function ensureNumeric() {
      if (input.value === '' || Number.isNaN(Number(input.value))) {
        const fallback = input.dataset.lwqInitial ?? CONFIG.DEFAULT_VALUE;
        input.value = String(fallback);
        input.defaultValue = input.value;
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
                // Apply vertical slide animation based on direction
        const oldValue = cur;
        const newValue = next;

        // Update the display value and animate it
        const displaySpan = input.closest('.lwq-display-wrapper')?.querySelector('.lwq-display-value');
        if (displaySpan) {
          displaySpan.textContent = String(newValue);

          // Add slide animation
          const slideClass = newValue > oldValue ? 'lwq-slide-up' : 'lwq-slide-down';
          displaySpan.classList.add(slideClass);
          setTimeout(() => displaySpan.classList.remove(slideClass), CONFIG.ANIMATION_DURATION);
        }

        if (newValue > oldValue) {
          input.style.backgroundColor = '#d0f0d0';
          setTimeout(() => input.style.backgroundColor = '', CONFIG.ANIMATION_DURATION);
        } else if (newValue < oldValue) {
          input.style.backgroundColor = '#fce0e0';
          setTimeout(() => input.style.backgroundColor = '', CONFIG.ANIMATION_DURATION);
        }

        input.value = String(next);
        fire(input);

        // Visual feedback
        input.classList.add('lwq-feedback');
        setTimeout(() => input.classList.remove('lwq-feedback'), CONFIG.ANIMATION_DURATION);
      }
    }

    // Enhanced click/tap with optional hold-to-repeat functionality
    function bindClick(btn, dir) {
      let startX = 0, startY = 0;
      const DRAG_THRESHOLD = 5; // Reduced threshold for more precise detection
      const CLICK_DEBOUNCE = 100; // ms
      let hasMoved = false;
      let isPressed = false;
      let lastClickTime = 0;
      let holdTimer = null;
      let repeatTimer = null;
      let repeatIntervalIndex = 0;

      const startHoldRepeat = () => {
        if (!CONFIG.ENABLE_HOLD_REPEAT) return;

        // Initial delay before starting repeat
        holdTimer = setTimeout(() => {
          repeatIntervalIndex = 0;
          const repeat = () => {
            if (!isPressed || input.disabled || input.readOnly) return;

            adjust(dir);

            // Use next interval, or stay at the last one
            const interval = CONFIG.REPEAT_INTERVALS[repeatIntervalIndex] ||
                           CONFIG.REPEAT_INTERVALS[CONFIG.REPEAT_INTERVALS.length - 1];

            repeatIntervalIndex++;
            repeatTimer = setTimeout(repeat, interval);
          };
          repeat();
        }, CONFIG.HOLD_DELAY);
      };

      const stopHoldRepeat = () => {
        if (holdTimer) {
          clearTimeout(holdTimer);
          holdTimer = null;
        }
        if (repeatTimer) {
          clearTimeout(repeatTimer);
          repeatTimer = null;
        }
        repeatIntervalIndex = 0;
      };

      const down = e => {
        if (input.disabled || input.readOnly) return;
        startX = e.clientX; startY = e.clientY;
        hasMoved = false;
        isPressed = true;
        e.preventDefault(); e.stopPropagation();
        if (!navigator.maxTouchPoints || e.pointerType !== 'touch') {
          input.focus({ preventScroll: true });
        }

        // Start hold-to-repeat timer
        startHoldRepeat();
      };

      const move = e => {
        if (!isPressed || input.disabled || input.readOnly) return;
        const deltaX = Math.abs(e.clientX - startX);
        const deltaY = Math.abs(e.clientY - startY);
        if (deltaX > DRAG_THRESHOLD || deltaY > DRAG_THRESHOLD) {
          hasMoved = true;
          btn.classList.add('lwq-dragging');
          stopHoldRepeat(); // Stop repeat if dragging
        }
      };

      const up = e => {
        if (!isPressed || input.disabled || input.readOnly) return;
        isPressed = false;
        btn.classList.remove('lwq-dragging');

        // Stop hold-to-repeat
        stopHoldRepeat();

        // Only trigger if it wasn't a drag and the pointer is still over the button
        if (!hasMoved && btn.contains(e.target)) {
          const now = Date.now();
          if (now - lastClickTime > CLICK_DEBOUNCE) {
            lastClickTime = now;
            // Haptic feedback for mobile devices
            if (navigator.vibrate) {
              navigator.vibrate(10);
            }
            adjust(dir);
          }
        }
      };

      // Keyboard accessibility
      btn.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const now = Date.now();
          if (now - lastClickTime > CLICK_DEBOUNCE) {
            lastClickTime = now;
            adjust(dir);
          }
        }
      });

      btn.addEventListener('pointerdown', down, { passive: false });
      window.addEventListener('pointermove', move, { passive: true });
      window.addEventListener('pointerup', up, { passive: true });
      window.addEventListener('pointercancel', up, { passive: true });
      window.addEventListener('blur', up, { passive: true });
      btn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); }, { passive: false });
    }

    bindClick(minus, -1);
    bindClick(plus, +1);

    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowUp')   { e.preventDefault(); adjust(+1); }
      if (e.key === 'ArrowDown') { e.preventDefault(); adjust(-1); }
    });

    // Note: 'input' event is already covered by the syncDisplay event listeners above

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
  } catch (error) {
    console.error('[Lionwheel Stepper] Error enhancing input:', error);
  }
  }

  // Debounced scan function for performance
  const debouncedScan = debounce((root = document) => {
    // Use requestAnimationFrame for better performance
    requestAnimationFrame(() => {
      const inputs = root.querySelectorAll('input[type="number"]');
      inputs.forEach(el => {
        if (isQtyInput(el)) {
          enhance(el);
        }
      });
    });
  }, 100);

  function scan(root = document, forceImmediate = false) {
    if (forceImmediate) {
      // Immediate scan without debouncing
      const inputs = root.querySelectorAll('input[type="number"]');
      inputs.forEach(el => {
        if (isQtyInput(el)) {
          enhance(el);
        }
      });
    } else {
      debouncedScan(root);
    }
  }

  // Initialize with performance optimization
  if (window.requestIdleCallback) {
    requestIdleCallback(() => scan(), { timeout: 2000 });
  } else {
    // Fallback for browsers without requestIdleCallback
    setTimeout(() => scan(), 0);
  }
  console.log(`[Lionwheel Stepper] v${CONFIG.VERSION} initialized`);
  
  // Install checkmark sync functionality
  installCheckmarkSync();

  // After initial scan scheduling, lift booting when ready
  const deadline = performance.now() + 1500; // up to ~1.5s window
  (function tick() {
    if (liftBootingWhenReady()) return;
    if (performance.now() < deadline) {
      requestAnimationFrame(tick);
    } else {
      // Failsafe: lift anyway to avoid locking UI
      document.documentElement.classList.remove('lwq-booting');
    }
  })();

  // Optimized mutation observer with batched DOM queries
  const observer = new MutationObserver(muts => {
    let shouldScan = false;
    const inputsToEnhance = [];

    for (const m of muts) {
      if (m.type === 'childList' && m.addedNodes.length > 0) {
        shouldScan = true;
        break;
      }
      if (m.type === 'attributes' && isQtyInput(m.target)) {
        inputsToEnhance.push(m.target);
      }
    }

    // Batch DOM queries using requestAnimationFrame
    if (inputsToEnhance.length > 0) {
      requestAnimationFrame(() => {
        inputsToEnhance.forEach(input => enhance(input));
      });
    }

    if (shouldScan) {
      scan();
    }
  });

  // Defer MutationObserver start until DOM is fully ready
  const startObserver = () => {
    safeExecute(() => {
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['type','name','id']
      });
    }, 'mutation observer setup');
  };

  if (window.requestIdleCallback) {
    requestIdleCallback(startObserver);
  } else {
    window.addEventListener('DOMContentLoaded', startObserver);
  }

  // Event listeners
  window.addEventListener('turbo:load', () => {
    document.documentElement.classList.add('lwq-booting');
    resetAllQtyToDefault();
    scan();
    installCheckmarkSync();
    // Let enhancement settle, then lift
    const deadline = performance.now() + 1200;
    (function tick(){
      if (liftBootingWhenReady()) return;
      if (performance.now() < deadline) requestAnimationFrame(tick);
      else document.documentElement.classList.remove('lwq-booting');
    })();
  }, { passive: true });
  window.addEventListener('popstate', () => requestAnimationFrame(() => scan()), { passive: true });

    // Async polling function to wait for inputs in modal
  async function waitForInputsInModal(modal, timeout = 3000) {
    const start = performance.now();
    let attempts = 0;
    let lastInputCount = 0;

    while (performance.now() - start < timeout) {
      attempts++;
      const inputs = modal.querySelectorAll('input[type="number"]');
      const inputCount = inputs.length;

      if (inputCount > 0) {
        scan(modal, true); // Force immediate scan

        // Wait a bit and check if enhancement worked
        await new Promise(r => setTimeout(r, 200));

        const enhancedInputs = modal.querySelectorAll('input[type="number"][data-lwq="1"]');
        const unenhancedInputs = modal.querySelectorAll('input[type="number"]:not([data-lwq="1"])');

        if (unenhancedInputs.length > 0) {
          // Force immediate scan without debouncing
          const inputsToEnhance = modal.querySelectorAll('input[type="number"]:not([data-lwq="1"])');
          inputsToEnhance.forEach(input => {
            enhance(input);
          });
        } else {
          return;
        }
      }

      // If input count changed, reset the attempt counter
      if (inputCount !== lastInputCount) {
        attempts = 0;
        lastInputCount = inputCount;
      }

      // More aggressive polling for the first few attempts
      const delay = attempts <= 5 ? 50 : 100;
      await new Promise(r => setTimeout(r, delay));
    }
    console.warn('[Lionwheel Stepper] Timeout waiting for inputs in modal');
  }

  // Enhanced modal detection for multiple Bootstrap versions and modal systems
  const modalEvents = [
    'shown.bs.modal',      // Bootstrap 4/5
    'shown',               // Bootstrap 3
    'modal:shown',         // Alternative
    'modal.shown'          // Alternative
  ];

  const showEvents = [
    'show.bs.modal',       // Bootstrap 4/5
    'show',                // Bootstrap 3
    'modal:show',          // Alternative
    'modal.show'           // Alternative
  ];

  // Add booting on show events
  showEvents.forEach(eventName => {
    document.addEventListener(eventName, event => {
      const modal = event.target;
      if (modal && modal.matches('.modal')) {
        setModalBooting(modal, true);
        resetAllQtyToDefault(modal);
        scan(modal);
        installCheckmarkSync(modal);
      }
    }, { passive: true });
  });

  // Remove booting on shown events (after enhancement completes)
  modalEvents.forEach(eventName => {
    document.addEventListener(eventName, event => {
      const modal = event.target;
      if (modal && modal.matches('.modal')) {
        // After enhancement + reset, lift
        waitForInputsInModal(modal)
          .then(() => { 
            resetAllQtyToDefault(modal); 
            installCheckmarkSync(modal);
          })
          .finally(() => { setModalBooting(modal, false); });
      }
    }, { passive: true });
  });

  // Additional fallback: watch for modal visibility changes
  const observerModal = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
        const modal = mutation.target;
        if (modal && modal.matches('.modal') &&
            (modal.style.display === 'block' || modal.classList.contains('show'))) {
          setTimeout(() => waitForInputsInModal(modal).then(() => {
            resetAllQtyToDefault(modal);
            installCheckmarkSync(modal);
          }), 50);
        }
      }
    });
  });

  // Observe all modals for style changes
  document.querySelectorAll('.modal').forEach(modal => {
    observerModal.observe(modal, { attributes: true, attributeFilter: ['style', 'class'] });
  });

  // Also watch for new modals being added
  const observerNewModals = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === 1 && node.matches && node.matches('.modal')) {
          observerModal.observe(node, { attributes: true, attributeFilter: ['style', 'class'] });
        }
      });
    });
  });

  observerNewModals.observe(document.body, { childList: true, subtree: true });

  // Specific listener for the order-items-edit-modal button
  document.addEventListener('click', event => {
    const target = event.target;
    if (target && target.matches('[data-target="#order-items-edit-modal"]')) {
      // Wait for modal to appear and then scan
      setTimeout(() => {
        const modal = document.getElementById('order-items-edit-modal');
        if (modal) {
          waitForInputsInModal(modal).then(() => {
            resetAllQtyToDefault(modal);
            installCheckmarkSync(modal);
          });
        }
      }, 100);
    }
  }, { passive: true });

  // Also listen for any modal opening via data-toggle
  document.addEventListener('click', event => {
    const target = event.target;
    if (target && target.matches('[data-toggle="modal"]')) {
      const modalId = target.getAttribute('data-target');
      if (modalId) {
        setTimeout(() => {
          const modal = document.querySelector(modalId);
          if (modal) {
            waitForInputsInModal(modal).then(() => {
              resetAllQtyToDefault(modal);
              installCheckmarkSync(modal);
            });
          }
        }, 100);
      }
    }
  }, { passive: true });





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
