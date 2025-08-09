// ==UserScript==
// @name         LionWheel Refresh Button
// @namespace    http://tampermonkey.net/
// @version      6.4
// @description  Combined script: Auto-redirect to full open range in LionWheel with refresh button and loading animation
// @match        https://members.lionwheel.com/*
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_log
// @homepageURL  https://github.com/youruser/lionwheel-combined
// @supportURL   https://github.com/youruser/lionwheel-combined/issues
// @run-at       document-idle
// ==/UserScript==

/*
 * ===== PERFECTLY CENTERED DETAILED REFRESH ICON v6.4 =====
 * 
 * This version integrates a clean, robust refresh button implementation with:
 * 
 * 1. EXACT HEADER TARGETING: Button injects precisely after .daterangepicker-init
 *    in the store visits header (div.d-flex.justify-content-between.position-relative)
 * 
 * 2. PERFECTLY CENTERED SPIN: Uses unified CSS with .is-loading class, squared icon box,
 *    and proper transform-origin for visually perfect centering
 * 
 * 3. COMPREHENSIVE LOADING DETECTION: Spins on manual refresh (F5/Ctrl+R/browser button)
 *    AND whenever LionWheel shows .data-preloader
 * 
 * 4. ROBUST DOM WATCHING: Works across main document + same-origin iframes with
 *    stable insertion that only removes out-of-place duplicates
 * 
 * 5. CLASS-BASED STATE: No inline style conflicts - all animation via .is-loading class
 * 
 * Key improvements:
 * - Detailed refresh icon SVG with perfect mathematical centering
 * - transform-box: fill-box + 50% 50% transform-origin for flawless rotation
 * - classList.toggle() for clean class-based state management
 * - Automatic detection of manual refresh AND .data-preloader visibility
 * - Single .is-loading class controls all animation (no inline styles)
 */

(function () {
    'use strict';
    
    // ===== CONFIGURATION CONSTANTS =====
    const SETTING_KEY = 'enabled_all_open_redirect';
    const DEFAULT_FROM = '01/01/2020';
    const DEFAULT_TO = '01/01/2100';
    const SCRIPT_NAME = 'LionWheel Combined';
    const SESSION_KEY = 'lionwheel_redirect_session';
    const DELAY_OPTION_KEY = 'redirect_delay_ms';
    const DEFAULT_DELAY = 100;
    const SLOW_REDIRECT_THRESHOLD = 2000;

    // Debug mode detection from URL parameter
    const debugMode = new URL(location.href).searchParams.get('debug') === 'true';
    const forceVerbose = GM_getValue('force_verbose_logs', true);

    // Initialize global script logging
    if (!window._tmScriptsRunLog) {
        window._tmScriptsRunLog = [];
    }

    // Global references for refresh button and loading monitoring
    let refreshButton = null;
    let isRedirecting = false;
    let loadingMonitorInterval = null;
    let buttonObserver = null;

    // ===== LOGGING SYSTEM =====
    function log(message, level = 'info') {
        const levelsToShowAlways = ['warn', 'error'];
        if (!debugMode && !forceVerbose && !levelsToShowAlways.includes(level)) return;
        
        const timestamp = new Date().toISOString();
        const logMessage = `[${SCRIPT_NAME}] [${timestamp}] [${level.toUpperCase()}]: ${message}`;
        
        window._tmScriptsRunLog.push({
            script: SCRIPT_NAME,
            timestamp: timestamp,
            level: level,
            message: message
        });
        
        if (window._tmScriptsRunLog.length > 1000) {
            window._tmScriptsRunLog.splice(0, window._tmScriptsRunLog.length - 1000);
        }
        
        let consoleMethod = 'log';
        if (level === 'warn') consoleMethod = 'warn';
        else if (level === 'error') consoleMethod = 'error';
        else if (level === 'info') consoleMethod = 'info';
        else if (level === 'debug') consoleMethod = 'debug';
        
        if (console[consoleMethod]) {
            console[consoleMethod](logMessage);
        } else {
            console.log(logMessage);
        }
        
        if (typeof GM_log !== 'undefined') {
            GM_log(logMessage);
        }
    }

    // ===== LIONWHEEL LOADING MONITOR =====
    function isLionWheelLoading() {
        const preloader = document.querySelector('.data-preloader');
        if (!preloader) return false;
        
        // Check if preloader is visible (not d-none)
        return !preloader.classList.contains('d-none');
    }

    // Watch the .data-preloader class changes in any doc (main + iframes)
    function watchPreloaderInDoc(doc) {
        const attach = () => {
            const pre = doc.querySelector('.data-preloader');
            if (!pre) return;

            const update = () => {
                const visible = !pre.classList.contains('d-none');
                setRefreshButtonLoadingState(visible);
            };

            update(); // initial snapshot

            const mo = new MutationObserver((muts) => {
                if (muts.some(m => m.type === 'attributes' && m.attributeName === 'class')) update();
            });
            mo.observe(pre, { attributes: true, attributeFilter: ['class'] });
        };

        if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', attach);
        else attach();
    }

    function watchAllDocsPreloader() {
        watchPreloaderInDoc(document);
        document.querySelectorAll('iframe').forEach(ifr => {
            try {
                const d = ifr.contentDocument || ifr.contentWindow?.document;
                if (d) watchPreloaderInDoc(d);
                ifr.addEventListener('load', () => {
                    try { watchPreloaderInDoc(ifr.contentDocument || ifr.contentWindow?.document); } catch {}
                });
            } catch {}
        });
    }

    // Turn on loading indicator whenever the user triggers a page refresh/navigation
    function hookManualRefreshIndicators() {
        // Keyboard (F5 / Cmd+R / Ctrl+R) detection isn't reliable everywhere; rely on lifecycle:
        window.addEventListener('beforeunload', () => { setRefreshButtonLoadingState(true); });
        window.addEventListener('pagehide', () => { setRefreshButtonLoadingState(true); });
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') setRefreshButtonLoadingState(true);
        }, { passive: true });
    }

    function startLoadingMonitor() {
        if (loadingMonitorInterval) {
            clearInterval(loadingMonitorInterval);
        }
        
        log('Starting LionWheel loading monitor', 'debug');
        
        loadingMonitorInterval = setInterval(() => {
            if (!isLionWheelLoading()) {
                log('LionWheel loading completed, stopping animation', 'debug');
                setRefreshButtonLoadingState(false);
                clearInterval(loadingMonitorInterval);
                loadingMonitorInterval = null;
            }
        }, 100); // Check every 100ms
        
        // Safety timeout - stop after 30 seconds maximum
        setTimeout(() => {
            if (loadingMonitorInterval) {
                log('Loading monitor timeout - stopping animation', 'warn');
                setRefreshButtonLoadingState(false);
                clearInterval(loadingMonitorInterval);
                loadingMonitorInterval = null;
            }
        }, 30000);
    }

    // ===== ALWAYS SPIN DURING MANUAL PAGE REFRESH AND WHILE .DATA-PRELOADER IS VISIBLE =====
    // Flip the button to loading/non-loading by class
    function setRefreshButtonLoadingState(isLoading) {
        if (!refreshButton) return;
        refreshButton.classList.toggle('is-loading', !!isLoading);
        refreshButton.disabled = !!isLoading;
        
        if (isLoading) {
            log('Refresh button set to loading state', 'debug');
            
            // Start monitoring LionWheel's internal loading
            startLoadingMonitor();
        } else {
            log('Refresh button loading state cleared', 'debug');
            
            // Stop monitoring
            if (loadingMonitorInterval) {
                clearInterval(loadingMonitorInterval);
                loadingMonitorInterval = null;
            }
        }
    }

    // ===== IMPROVED UTILITIES: QUERY ACROSS DOCUMENT AND SAME-ORIGIN IFRAMES =====
    // Search in main document + all same-origin iframes
    function queryAllDocs(selector) {
        const out = [];
        try { out.push(...document.querySelectorAll(selector)); } catch {}
        document.querySelectorAll('iframe').forEach(ifr => {
            try {
                const d = ifr.contentDocument || ifr.contentWindow?.document;
                if (d) out.push(...d.querySelectorAll(selector));
            } catch {}
        });
        return out;
    }

    // ===== FIND THE EXACT HEADER AND INSERTION POINT =====
    // Finds the header wrapper you pasted: <div class="d-flex justify-content-between position-relative"> ... />
    function getStoreVisitsHeader() {
        const candidates = queryAllDocs('div.d-flex.justify-content-between.position-relative');
        return candidates.find(el =>
            el.querySelector('input.form-control.table-search') &&
            (el.querySelector('#filters-dropdown-box') || el.querySelector('.colvis-custom-dropdown'))
        ) || null;
    }

    // We want to insert right AFTER the .daterangepicker-init. Fallback: end of the first row.
    function getReloadInsertPoint(headerEl) {
        const leftWrap = headerEl.querySelector(':scope > .d-flex.flex-wrap');
        const firstRow = leftWrap?.querySelector(':scope > .d-flex');
        if (!firstRow) return { container: leftWrap || headerEl, reference: null };

        const daterange = firstRow.querySelector('.daterangepicker-init');
        if (daterange && daterange.parentNode === firstRow) {
            return { container: firstRow, reference: daterange };
        }
        return { container: firstRow, reference: null };
    }



    // ===== CREATE AND INSERT THE BUTTON (AFTER THE DATE-RANGE) =====
    function createReloadButton() {
        const btn = document.createElement('button');
        btn.className = 'btn btn-light border text-dark refresh-btn mr-2 mb-2';
        btn.type = 'button';
        btn.style.display = 'inline-flex';
        btn.style.alignItems = 'center';
        btn.style.gap = '6px';
        btn.style.lineHeight = '1';
        // Detailed centered refresh SVG with perfect rotation
        btn.innerHTML = `
            <svg class="lw-svg" xmlns="http://www.w3.org/2000/svg"
                 viewBox="-0.135 0 122.88 122.88" aria-hidden="true" focusable="false">
                <path fill="currentColor"
                      d="M111.9,61.57a5.36,5.36,0,0,1,10.71,0A61.3,61.3,0,0,1,17.54,104.48v12.35a5.36,5.36,0,0,1-10.72,0V89.31A5.36,5.36,0,0,1,12.18,84H40a5.36,5.36,0,1,1,0,10.71H23a50.6,50.6,0,0,0,88.87-33.1ZM106.6,5.36a5.36,5.36,0,1,1,10.71,0V33.14A5.36,5.36,0,0,1,112,38.49H84.44a5.36,5.36,0,1,1,0-10.71H99A50.6,50.6,0,0,0,10.71,61.57,5.36,5.36,0,1,1,0,61.57,61.31,61.31,0,0,1,91.07,8,61.83,61.83,0,0,1,106.6,20.27V5.36Z"/>
            </svg>
            <span>רענן</span>
        `;

        btn.addEventListener('click', () => {
            // Turn on the unified "loading" class (no inline styles)
            btn.classList.add('is-loading');
            // Your refresh action; keep it if you truly want a hard reload:
            location.reload();
            // If you switch to AJAX refresh, remove the class when done:
            // btn.classList.remove('is-loading');
        });

        return btn;
    }

    function addRefreshButtonExactlyThere() {
        ensureSpinCSS();

        const header = getStoreVisitsHeader();
        if (!header) return false;

        const { container, reference } = getReloadInsertPoint(header);
        if (!container) return false;

        // Clean only "out-of-place" duplicates, never the in-place one
        document.querySelectorAll('.refresh-btn').forEach(b => { if (!container.contains(b)) b.remove(); });

        // If we already have one in the right container, keep it
        const existing = container.querySelector(':scope > .refresh-btn');
        if (existing) {
            refreshButton = existing;
            return true;
        }

        const btn = createReloadButton();
        refreshButton = btn;

        if (reference) reference.insertAdjacentElement('afterend', btn);
        else container.appendChild(btn);

        return true;
    }



    // ===== BOOTSTRAP + ROBUST DOM WATCHING (SPA + IFRAMES) =====
    function observeDoc(doc) {
        if (!doc?.body) return;
        const mo = new MutationObserver(() => { addRefreshButtonExactlyThere(); });
        mo.observe(doc.body, { childList: true, subtree: true });
    }

    function bootstrapReloadButton() {
        // First attempt immediately
        addRefreshButtonExactlyThere();

        // Watch main doc
        observeDoc(document);

        // Watch same-origin iframes now and on load
        document.querySelectorAll('iframe').forEach(ifr => {
            try {
                const d = ifr.contentDocument || ifr.contentWindow?.document;
                if (d) observeDoc(d);
                ifr.addEventListener('load', () => {
                    try { observeDoc(ifr.contentDocument || ifr.contentWindow?.document); addRefreshButtonExactlyThere(); } catch {}
                });
            } catch {}
        });
    }





    // ===== ONE CSS SOURCE OF TRUTH (PERFECTLY CENTERED SPIN) =====
    // Inject once; unify spin to `lw-spin`, square the icon's box, and center
    function ensureSpinCSS() {
        if (document.getElementById('lw-reload-spin-css')) return;
        const style = document.createElement('style');
        style.id = 'lw-reload-spin-css';
        style.textContent = `
            @keyframes lw-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

            .refresh-btn {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                line-height: 1;
            }

            .refresh-btn .lw-svg {
                display: block;
                width: 1em;
                height: 1em;
                transform-origin: 50% 50%;
                transform-box: fill-box;
            }

            .refresh-btn.is-loading .lw-svg {
                animation: lw-spin 0.8s linear infinite;
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    // Legacy function kept for compatibility - redirects to ensureSpinCSS
    function addSpinAnimation() {
        ensureSpinCSS();
        log('Spin animation CSS injected', 'debug');
    }

    // ===== SESSION TRACKING =====
    function getSessionId() {
        let sessionId = sessionStorage.getItem(SESSION_KEY);
        if (!sessionId) {
            sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            sessionStorage.setItem(SESSION_KEY, sessionId);
        }
        return sessionId;
    }

    function hashParams(url) {
        try {
            const params = new URL(url).searchParams;
            return [...params.entries()]
                .sort()
                .map(([k, v]) => `${k}=${v}`)
                .join('&');
        } catch (error) {
            log(`Error creating hash for URL: ${error.message}`, 'error');
            return '';
        }
    }

    function isRedirectLoop() {
        const currentUrl = location.href;
        const currentHash = hashParams(currentUrl);
        const lastHash = sessionStorage.getItem(SESSION_KEY + '_last_hash');
        const redirectCount = parseInt(sessionStorage.getItem(SESSION_KEY + '_count') || '0');
        
        if (currentHash && currentHash === lastHash && redirectCount > 0) {
            log(`Potential redirect loop detected (hash match). Count: ${redirectCount}`, 'warn');
            return true;
        }
        
        sessionStorage.setItem(SESSION_KEY + '_last_hash', currentHash);
        sessionStorage.setItem(SESSION_KEY + '_count', (redirectCount + 1).toString());
        
        const localCountKey = SESSION_KEY + '_total_count';
        const localCount = parseInt(localStorage.getItem(localCountKey) || '0');
        localStorage.setItem(localCountKey, (localCount + 1).toString());
        
        log(`Redirect count - Session: ${redirectCount + 1}, Total: ${localCount + 1}`, 'debug');
        return false;
    }

    // ===== NOTIFICATION SYSTEM =====
    function showNotification(message, type = 'info', duration = 3000) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: ${type === 'error' ? '#ff6b6b' : type === 'warn' ? '#ffd93d' : '#6bcf7f'};
            color: white;
            padding: 12px 20px;
            border-radius: 6px;
            font-family: Arial, sans-serif;
            font-size: 14px;
            z-index: 10000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            opacity: 0;
            transition: opacity 0.3s ease;
        `;
        
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => notification.style.opacity = '1', 10);
        
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => document.body.removeChild(notification), 300);
        }, duration);
    }

    // ===== REDIRECT FUNCTIONALITY =====
    function performRedirect() {
        console.time(`${SCRIPT_NAME} - Redirect Operation`);
        
        try {
            const url = new URL(location.href);
            const params = url.searchParams;
            
            const isDateRange = params.get('date') === 'range';
            const isFromDefault = params.get('from') === DEFAULT_FROM;
            const isToDefault = params.get('to') === DEFAULT_TO;
            const isAllOpen = isDateRange && isFromDefault && isToDefault;

            if (params.size === 0 || !isAllOpen) {
                log('Redirecting to all open range...');
                
                // Set loading state for refresh button IMMEDIATELY if it exists
                isRedirecting = true;
                setRefreshButtonLoadingState(true);
                
                params.set('date', 'range');
                params.set('from', DEFAULT_FROM);
                params.set('to', DEFAULT_TO);
                
                url.search = params.toString();
                const newUrl = url.toString();
                
                log(`Redirecting to: ${newUrl}`);
                
                // Shorter delay since we now monitor LionWheel loading
                setTimeout(() => {
                    location.replace(newUrl);
                }, 300);
            } else {
                log('Already in all open range, no redirect needed');
                // Check if LionWheel is currently loading
                if (isLionWheelLoading()) {
                    log('LionWheel is loading, starting animation');
                    setRefreshButtonLoadingState(true);
                } else {
                    // Clear loading state if we're not redirecting
                    setTimeout(() => {
                        setRefreshButtonLoadingState(false);
                    }, 500);
                }
            }

        } catch (error) {
            log(`Error processing URL: ${error.message}`, 'error');
            setRefreshButtonLoadingState(false);
        } finally {
            console.timeEnd(`${SCRIPT_NAME} - Redirect Operation`);
        }
    }

    // ===== SAFE MUTATION OBSERVER WRAPPER =====
    function createSafeMutationObserver(callback) {
        return new MutationObserver((mutations, observer) => {
            try {
                callback(mutations, observer);
            } catch (e) {
                console.warn('[LionWheel] MutationObserver callback error:', e);
            }
        });
    }

    function safeObserve(observer, target, options) {
        if (!target || !target.nodeType || target.nodeType !== Node.ELEMENT_NODE) {
            console.warn('[LionWheel] Invalid target for MutationObserver:', target);
            return false;
        }
        try {
            observer.observe(target, options);
            return true;
        } catch (e) {
            console.warn('[LionWheel] Failed to observe target:', e);
            return false;
        }
    }

    // ===== INITIALIZATION =====
    const startTime = performance.now();
    const sessionId = getSessionId();
    log(`Script started - Session: ${sessionId}`, debugMode ? 'debug' : 'info');

    const enabled = GM_getValue(SETTING_KEY, true);
    const redirectDelay = GM_getValue(DELAY_OPTION_KEY, DEFAULT_DELAY);
    log(`Script enabled: ${enabled}, Redirect delay: ${redirectDelay}ms`);

    // Prevent duplicate execution
    if (window._lionwheelCombinedRunning) {
        return;
    }
    window._lionwheelCombinedRunning = true;

    // Add CSS animations
    addSpinAnimation();
    
    // Call once on script init:
    bootstrapReloadButton();
    watchAllDocsPreloader();
    hookManualRefreshIndicators();

    // ===== MENU COMMANDS =====
    GM_registerMenuCommand(
        enabled ? '🔴 השבת מעבר אוטומטי ל"כל הפתוחים"' : '🟢 הפעל מעבר אוטומטי ל"כל הפתוחים"',
        () => {
            const newState = !enabled;
            GM_setValue(SETTING_KEY, newState);
            log(`Setting changed to: ${newState}`);
            
            const message = newState ? 
                '✅ מעבר אוטומטי ל"כל הפתוחים" הופעל. רענן את העמוד כדי להחיל את השינוי.' :
                '❌ מעבר אוטומטי ל"כל הפתוחים" הושבת. רענן את העמוד כדי להחיל את השינוי.';
            
            showNotification(message, 'info', 4000);
        }
    );

    GM_registerMenuCommand(
        `⚙️ הגדר עיכוב הפניה (נוכחי: ${redirectDelay}ms)`,
        () => {
            const newDelay = prompt(
                `הזן עיכוב הפניה במילישניות (0-5000):\nנוכחי: ${redirectDelay}ms`,
                redirectDelay.toString()
            );
            
            if (newDelay !== null) {
                const delay = Math.max(0, Math.min(5000, parseInt(newDelay) || 0));
                GM_setValue(DELAY_OPTION_KEY, delay);
                log(`Redirect delay changed to: ${delay}ms`);
                showNotification(`עיכוב הפניה שונה ל-${delay}ms. רענן את העמוד כדי להחיל את השינוי.`, 'info', 4000);
            }
        }
    );

    GM_registerMenuCommand(
        '🔄 אפס מונה הפניות',
        () => {
            sessionStorage.removeItem(SESSION_KEY + '_last_hash');
            sessionStorage.removeItem(SESSION_KEY + '_count');
            localStorage.removeItem(SESSION_KEY + '_total_count');
            log('Redirect counter reset via menu');
            showNotification('מונה ההפניות אופס. רענן את הדף.', 'info', 4000);
        }
    );

    GM_registerMenuCommand(
        '🔄 בדוק אנימציית טעינה',
        () => {
            if (refreshButton) {
                log('Testing loading animation manually');
                setRefreshButtonLoadingState(true);
                showNotification('בודק אנימציית טעינה...', 'info', 3000);
                
                setTimeout(() => {
                    setRefreshButtonLoadingState(false);
                    showNotification('בדיקת אנימציה הושלמה!', 'info', 2000);
                }, 3000);
            } else {
                showNotification('כפתור הרענון לא נמצא עדיין', 'warn', 3000);
            }
        }
    );

    GM_registerMenuCommand(
        '📤 ייצא לוגים ל-JSON',
        () => {
            const logs = window._tmScriptsRunLog || [];
            const exportData = {
                script: SCRIPT_NAME,
                exportTime: new Date().toISOString(),
                sessionId: sessionId,
                redirectCount: sessionStorage.getItem(SESSION_KEY + '_count') || '0',
                totalRedirects: localStorage.getItem(SESSION_KEY + '_total_count') || '0',
                logs: logs
            };
            
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `lionwheel-combined-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            log('Logs exported to JSON file');
        }
    );

    GM_registerMenuCommand(
        '🔊 Toggle verbose logs',
        () => {
            const cur = GM_getValue('force_verbose_logs', true);
            GM_setValue('force_verbose_logs', !cur);
            showNotification(`Verbose logs: ${!cur ? 'ON' : 'OFF'}`, 'info', 2000);
        }
    );

    // ===== MAIN EXECUTION =====
    if (!enabled) {
        log('Auto-redirect disabled, but refresh button will still be added');
        
        // Add refresh button even if redirect is disabled
        const disabledModeObserver = createSafeMutationObserver((mutationsList, observer) => {
            if (addRefreshButtonExactlyThere()) {
                // Continuous monitoring handled by bootstrapReloadButton
                observer.disconnect();
                log('Refresh button observer disconnected (redirect disabled mode), continuous monitoring active.');
            }
        });
        if (!safeObserve(disabledModeObserver, document.body, { childList: true, subtree: true })) {
            log('Document body not ready for disabled mode observer', 'warn');
        }
        
        // Note: Font Awesome no longer needed - using inline SVG spinner
        
        return;
    }

    // Check for redirect loop
    if (isRedirectLoop()) {
        log('Redirect loop detected, skipping redirect', 'warn');
        return;
    }

    // ===== COMBINED EXECUTION =====
    // First, set up the refresh button observer
    const initialObserver = createSafeMutationObserver((mutationsList, observer) => {
        if (addRefreshButtonExactlyThere()) {
            log('Refresh button added, starting continuous monitoring.');
            
            // Continuous monitoring handled by bootstrapReloadButton
            
            // Perform redirect check after button is ready with a small delay
            if (enabled && !isRedirecting) {
                setTimeout(() => {
                    log('Starting redirect check with animation...');
                    performRedirect();
                }, Math.max(redirectDelay, 200)); // Ensure minimum 200ms delay
            }
            
            observer.disconnect();
            log('Initial button observer disconnected, continuous monitoring active.');
        }
    });

    if (safeObserve(initialObserver, document.body, { childList: true, subtree: true })) {
        log('Initial observer started successfully');
    } else {
        log('Document body not ready for initial observer, waiting for DOM ready', 'warn');
        // אם ה-body לא קיים, נחכה ל-DOM ready
        const waitForBody = () => {
            if (safeObserve(initialObserver, document.body, { childList: true, subtree: true })) {
                log('Initial observer started after waiting');
            } else {
                setTimeout(waitForBody, 100); // נבדוק שוב אחרי 100ms
            }
        };
        waitForBody();
    }

    // Immediate injection attempt
    setTimeout(() => {
        if (!addRefreshButtonExactlyThere()) {
            log('Immediate attempt failed, relying on observers...', 'warn');
        }
    }, 0);

    // iframe monitoring handled by bootstrapReloadButton

    // Note: Font Awesome no longer needed - using inline SVG spinner

    // Performance monitoring
    const endTime = performance.now();
    const executionTime = endTime - startTime;
    log(`Script execution completed in ${executionTime.toFixed(2)}ms`);

    // Legacy cleanup handler - now handled by hookManualRefreshIndicators
    window.addEventListener('beforeunload', (event) => {
        // Don't clean up immediately - let the animation show for a brief moment
        setTimeout(() => {
            window._lionwheelCombinedRunning = false;
            
            // Clean up observers and intervals
            if (buttonObserver) {
                buttonObserver.disconnect();
                buttonObserver = null;
            }
            if (loadingMonitorInterval) {
                clearInterval(loadingMonitorInterval);
                loadingMonitorInterval = null;
            }
        }, 100);
    });

    // Clear loading state when page finishes loading
    window.addEventListener('load', () => {
        setTimeout(() => {
            setRefreshButtonLoadingState(false);
            isRedirecting = false;
        }, 1000);
    });

})();

