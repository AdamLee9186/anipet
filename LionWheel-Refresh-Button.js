// ==UserScript==
// @name         LionWheel Refresh Button
// @namespace    http://tampermonkey.net/
// @version      6.7
// @description  Combined script: Auto-redirect to full open range in LionWheel with refresh button and loading animation
// @match        https://members.lionwheel.com/operator/store_visits*
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_log
// @homepageURL  https://github.com/AdamLee9186/anipet
// @supportURL   https://github.com/AdamLee9186/anipet
// @downloadURL  https://raw.githubusercontent.com/AdamLee9186/anipet/main/LionWheel-Refresh-Button.js
// @updateURL    https://raw.githubusercontent.com/AdamLee9186/anipet/main/LionWheel-Refresh-Button.js
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
    const ALL_OPEN_URL = `${location.origin}/operator/store_visits?date=range&from=${DEFAULT_FROM}&to=${DEFAULT_TO}`;
    const SCRIPT_NAME = 'LionWheel Combined';
    const SESSION_KEY = 'lionwheel_redirect_session';
    const DELAY_OPTION_KEY = 'redirect_delay_ms';
    const DEFAULT_DELAY = 100;
    const NO_REDIRECT_PARAM = 'lw_no_redirect';
    const NO_REDIRECT_SESSION_KEY = 'lw_no_redirect_session';
    const NO_REDIRECT_TTL_MS = 30 * 60 * 1000; // 30 minutes TTL for override session

    // Debug mode detection from URL parameter
    const debugMode = new URL(location.href).searchParams.get('debug') === 'true';
    const forceVerbose = GM_getValue('force_verbose_logs', false);

    // Initialize global script logging
    if (!window._tmScriptsRunLog) {
        window._tmScriptsRunLog = [];
    }

    // Global references for refresh button and loading monitoring
    let refreshButton = null;
    let isRedirecting = false;
    let loadingMonitorInterval = null;
    // Track observers for cleanup (prevent memory leaks)
    const preloaderObservers = new WeakMap();
    const docObservers = new WeakMap();

    // ===== PAGE GUARD: Only run on store_visits =====
    function shouldRunOnThisPage() {
        const { pathname } = new URL(location.href);
        return pathname === '/operator/store_visits';
    }

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
        // Clean up existing observer if any
        if (preloaderObservers.has(doc)) {
            preloaderObservers.get(doc).disconnect();
            preloaderObservers.delete(doc);
        }

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
            preloaderObservers.set(doc, mo);
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
        // Prevent multiple instances - if already running, just return
        if (loadingMonitorInterval) {
            return;
        }
        
        log('Starting LionWheel loading monitor', 'debug');
        
        loadingMonitorInterval = setInterval(() => {
            if (!isLionWheelLoading()) {
                log('LionWheel loading completed, stopping animation', 'debug');
                setRefreshButtonLoadingState(false);
                clearInterval(loadingMonitorInterval);
                loadingMonitorInterval = null;
            }
        }, 250); // Check every 250ms (reduced frequency, MutationObserver is primary)
        
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
    function setRefreshButtonLoadingState(isLoading, retryCount = 0) {
        // Retry mechanism: if button doesn't exist yet, try again (max 5 retries, 200ms apart)
        if (!refreshButton) {
            if (retryCount < 5) {
                setTimeout(() => {
                    setRefreshButtonLoadingState(isLoading, retryCount + 1);
                }, 200);
                return;
            }
            // After max retries, give up silently
            return;
        }
        
        // מונע spam גם במצב verbose - לא לעדכן אם המצב כבר זהה
        const next = !!isLoading;
        const cur = refreshButton.classList.contains('is-loading');
        if (cur === next) return;
        
        refreshButton.classList.toggle('is-loading', next);
        refreshButton.disabled = next;
        
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

    // ===== NO-REDIRECT OVERRIDE UTILITIES =====
    function isModifierClick(ev) {
        // Ctrl/Cmd/Shift/Alt או לחצן אמצעי
        return !!(ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey || ev.button === 1);
    }

    function setNoRedirectSession(reason = '') {
        try {
            sessionStorage.setItem(NO_REDIRECT_SESSION_KEY, JSON.stringify({
                v: 1,
                ts: Date.now(),
                reason
            }));
        } catch {}
    }

    function clearNoRedirectSession(reason = '') {
        try {
            sessionStorage.removeItem(NO_REDIRECT_SESSION_KEY);
            if (reason) log(`No-redirect override cleared (${reason})`, 'debug');
        } catch {}
    }

    function hasNoRedirectSession() {
        try {
            const raw = sessionStorage.getItem(NO_REDIRECT_SESSION_KEY);
            if (!raw) return false;
            const obj = JSON.parse(raw);
            if (!obj || obj.v !== 1) return false;
            
            // Check TTL: if expired, remove and return false
            const age = Date.now() - (obj.ts || 0);
            if (age > NO_REDIRECT_TTL_MS) {
                clearNoRedirectSession('ttl_expired');
                return false;
            }
            
            return true;
        } catch {
            return false;
        }
    }

    function consumeNoRedirectParam() {
        // אם נכנסו עם ?lw_no_redirect=1, נפעיל session override וננקה את הפרמטר מה־URL
        try {
            const url = new URL(location.href);
            if (url.searchParams.get(NO_REDIRECT_PARAM) !== '1') return false;
            setNoRedirectSession('url_param');
            url.searchParams.delete(NO_REDIRECT_PARAM);
            history.replaceState(null, '', url.toString());
            return true;
        } catch {
            return false;
        }
    }

    function isNoRedirectActive() {
        // Note: param gets consumed (removed) early; session is the ongoing source of truth.
        return hasNoRedirectSession();
    }

    function wireNoRedirectOverrideOnStatusButtons() {
        const anchors = queryAllDocs('.btn-group.btn-group-sm a.btn[href^="/operator/store_visits"]');
        for (const a of anchors) {
            if (a.dataset.lwNoRedirectWired === '1') continue;

            a.addEventListener('click', (ev) => {
                // Normal click = user intent; clear no-redirect to restore normal automation.
                if (!isModifierClick(ev)) {
                    clearNoRedirectSession('normal_status_click');
                    return;
                }

                // Modifier click: suppress redirects in current tab, and open a no-redirect tab.
                setNoRedirectSession('modifier_click');

                try {
                    const abs = new URL(a.getAttribute('href'), location.origin);
                    abs.searchParams.set(NO_REDIRECT_PARAM, '1');

                    ev.preventDefault();
                    ev.stopPropagation();
                    window.open(abs.toString(), '_blank', 'noopener');
                } catch (e) {
                    log(`Failed to open modifier-click tab: ${e?.message || e}`, 'warn');
                }
            }, { capture: true });

            a.dataset.lwNoRedirectWired = '1';
        }
    }

    // ===== MAKE THE 'משלוחים' MENU GO STRAIGHT TO "כל הפתוחים" =====
    function ensureAllOpenOnMenu() {
        // Any anchor to /operator/store_visits (main doc + same-origin iframes)
        const anchors = queryAllDocs('a[href="/operator/store_visits"]');
        for (const a of anchors) {
            // Skip if already rewritten
            if (a.dataset.lwAllOpen === '1') continue;

            // 1) Update href so Ctrl/Cmd-click & middle-click open the right URL
            a.setAttribute('href', ALL_OPEN_URL);

            // 2) Click guard for sites that intercept and force plain route
            a.addEventListener('click', (ev) => {
                // Respect modifier clicks that open new tabs/windows
                if (ev.defaultPrevented) return;
                if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button === 1) return;
                ev.preventDefault();
                // Use assign to preserve history; replace() if you prefer not to.
                location.assign(ALL_OPEN_URL);
            }, { capture: true });

            a.dataset.lwAllOpen = '1';
        }
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
        
        // Clean up existing observer if any
        if (docObservers.has(doc)) {
            docObservers.get(doc).disconnect();
            docObservers.delete(doc);
        }
        
        let scheduled = false;
        let lastRun = 0;
        const COOLDOWN_MS = 200; // Throttle: minimum 200ms between runs
        
        const mo = new MutationObserver(() => {
            if (scheduled) return;
            scheduled = true;
            
            const now = Date.now();
            const timeSinceLastRun = now - lastRun;
            
            requestAnimationFrame(() => {
                scheduled = false;
                
                // Additional throttle: don't run more than once per COOLDOWN_MS
                if (timeSinceLastRun < COOLDOWN_MS) {
                    // Reschedule for later
                    setTimeout(() => {
                        const now2 = Date.now();
                        if (now2 - lastRun >= COOLDOWN_MS) {
                            lastRun = now2;
                            addRefreshButtonExactlyThere();
                            ensureAllOpenOnMenu();
                            wireNoRedirectOverrideOnStatusButtons();
                        }
                    }, COOLDOWN_MS - timeSinceLastRun);
                } else {
                    lastRun = now;
                    addRefreshButtonExactlyThere();
                    ensureAllOpenOnMenu();
                    wireNoRedirectOverrideOnStatusButtons();
                }
            });
        });
        mo.observe(doc.body, { childList: true, subtree: true });
        docObservers.set(doc, mo);
    }

    function bootstrapReloadButton() {
        // First attempt immediately
        addRefreshButtonExactlyThere();
        ensureAllOpenOnMenu();
        wireNoRedirectOverrideOnStatusButtons();

        // Watch main doc
        observeDoc(document);

        // Watch same-origin iframes now and on load
        document.querySelectorAll('iframe').forEach(ifr => {
            try {
                const d = ifr.contentDocument || ifr.contentWindow?.document;
                if (d) { observeDoc(d); ensureAllOpenOnMenu(); wireNoRedirectOverrideOnStatusButtons(); }
                ifr.addEventListener('load', () => {
                    try {
                        const idoc = ifr.contentDocument || ifr.contentWindow?.document;
                        observeDoc(idoc);
                        addRefreshButtonExactlyThere();
                        ensureAllOpenOnMenu();
                        wireNoRedirectOverrideOnStatusButtons();
                    } catch {}
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
        const shouldProfile = debugMode || forceVerbose;
        if (shouldProfile) console.time(`${SCRIPT_NAME} - Redirect Operation`);
        
        try {
            const pageUrl = new URL(location.href);
            if (pageUrl.pathname !== '/operator/store_visits') {
                log(`Not on /operator/store_visits (pathname=${pageUrl.pathname}), skipping redirect`, 'debug');
                return;
            }

            if (isNoRedirectActive()) {
                log('No-redirect override active; skipping auto-redirect', 'info');
                setTimeout(() => setRefreshButtonLoadingState(false), 0);
                return;
            }

            const url = new URL(location.href);
            const params = url.searchParams;

            const type = (params.get('type') || '').toLowerCase();
            const isCompleted = type === 'completed';
            const isCanceled = type === 'canceled';

            let targetUrl = null;
            if (isCompleted || isCanceled) {
                const { from, to } = getWeekRangeSundayToSaturday(new Date());
                targetUrl = buildStoreVisitsUrl({ from, to, type });
            } else {
                targetUrl = buildStoreVisitsUrl({ from: DEFAULT_FROM, to: DEFAULT_TO, type: '' });
            }

            const curHash = hashParams(new URL(location.href).toString());
            const tgtHash = hashParams(targetUrl);
            if (curHash && tgtHash && curHash === tgtHash) {
                log('Already at desired range; no redirect needed', 'debug');
                if (isLionWheelLoading()) {
                    setRefreshButtonLoadingState(true);
                } else {
                    setTimeout(() => setRefreshButtonLoadingState(false), 500);
                }
                return;
            }

            log(`Redirecting to: ${targetUrl}`);
            isRedirecting = true;
            setRefreshButtonLoadingState(true);
            
            // Use redirectDelay from settings (read fresh value)
            const currentDelay = GM_getValue(DELAY_OPTION_KEY, DEFAULT_DELAY);
            setTimeout(() => {
                location.replace(targetUrl);
            }, currentDelay);

        } catch (error) {
            log(`Error processing URL: ${error.message}`, 'error');
            setRefreshButtonLoadingState(false);
        } finally {
            if (shouldProfile) console.timeEnd(`${SCRIPT_NAME} - Redirect Operation`);
        }
    }

    // ===== DATE UTILITIES ("השבוע") =====
    function pad2(n) {
        return String(n).padStart(2, '0');
    }

    function formatDDMMYYYY(d) {
        return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
    }

    function getWeekRangeSundayToSaturday(now = new Date()) {
        // Israel UI shows weeks as Sun->Sat (example: 18/01/2026 to 24/01/2026)
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const day = d.getDay(); // 0=Sun
        const start = new Date(d);
        start.setDate(d.getDate() - day);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        return { from: formatDDMMYYYY(start), to: formatDDMMYYYY(end) };
    }

    function buildStoreVisitsUrl({ from, to, type }) {
        const url = new URL(`${location.origin}/operator/store_visits`);
        url.searchParams.set('date', 'range');
        url.searchParams.set('from', from);
        url.searchParams.set('to', to);
        if (type) url.searchParams.set('type', type);
        return url.toString();
    }


    // ===== INITIALIZATION =====
    // Guard: Exit early if not on the correct page
    if (!shouldRunOnThisPage()) {
        // חשוב: לא redirect, לא כפתור, לא שינוי תפריט
        return;
    }

    // בדיקת override - אם נכנסו עם Ctrl+Click או פרמטר URL
    consumeNoRedirectParam();
    
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
    ensureSpinCSS();

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
        '🧹 בטל Override (הפעל שוב redirect אוטומטי)',
        () => {
            clearNoRedirectSession('menu_command');
            showNotification('Override בוטל. רענן דף כדי לאפשר redirect אוטומטי.', 'info', 3000);
        }
    );

    GM_registerMenuCommand(
        forceVerbose ? '🧹 כבה לוגים מפורטים (Verbose)' : '🧪 הפעל לוגים מפורטים (Verbose)',
        () => {
            const newState = !GM_getValue('force_verbose_logs', false);
            GM_setValue('force_verbose_logs', newState);
            showNotification(
                newState ? '✅ לוגים מפורטים הופעלו. רענן את הדף.' : '🧹 לוגים מפורטים כובו. רענן את הדף.',
                'info',
                3500
            );
        }
    );

    // ===== MAIN EXECUTION =====
    // Bootstrap handles all DOM watching (main doc + iframes) with throttle
    bootstrapReloadButton();
    watchAllDocsPreloader();
    hookManualRefreshIndicators();
    
    consumeNoRedirectParam();
    wireNoRedirectOverrideOnStatusButtons();
    
    if (!enabled) {
        log('Auto-redirect disabled, but refresh button will still be added');
        // bootstrapReloadButton already handles button injection and menu updates
        return;
    }

    if (isNoRedirectActive()) {
        log('No-redirect override is ON for this tab/session; skipping auto-redirect', 'info');
        return; // עדיין נשארים עם כפתור רענן + watchers, אבל בלי performRedirect
    }

    // Check for redirect loop
    if (isRedirectLoop()) {
        log('Redirect loop detected, skipping redirect', 'warn');
        return;
    }

    // Perform redirect once after bootstrap setup, using configured delay
    setTimeout(() => {
        if (!isRedirecting) {
            log('Starting redirect check with animation...');
            performRedirect();
        }
    }, Math.max(redirectDelay, 200)); // Ensure minimum 200ms delay

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
            
            // Clean up intervals
            if (loadingMonitorInterval) {
                clearInterval(loadingMonitorInterval);
                loadingMonitorInterval = null;
            }
            
            // Clean up all observers
            preloaderObservers.forEach(obs => obs.disconnect());
            preloaderObservers.clear();
            docObservers.forEach(obs => obs.disconnect());
            docObservers.clear();
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

