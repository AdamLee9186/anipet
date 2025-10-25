    // ==UserScript==
    // @name        טבלת חוסרים 18/10/2025
    // @namespace   http://tampermonkey.net/
    // @version     8.0
    // @description הצגת טבלת חוסרים בלחיצה, כולל קיבוץ לפי שם מוצר, תצוגות מתחלפות, מיון, חיפוש, ייצוא, והדפסה
    // @author      Adam Lee
    // @match       https://members.lionwheel.com/operator/store_visits*
    // @match       https://test.lionwheel.com/operator/store_visits*
    // @match       https://docs.google.com/spreadsheets/*
    // @icon        https://www.google.com/s2/favicons?sz=64&domain=lionwheel.com
    // @grant       GM_addStyle
    // @grant       GM_xmlhttpRequest
    // @updateURL   https://raw.githubusercontent.com/AdamLee9186/anipet/main/MissingTable.js
    // @downloadURL https://raw.githubusercontent.com/AdamLee9186/anipet/main/MissingTable.js
    // ==/UserScript==

    /* Fix Region Fallback in Userscript:
       1. Passive listeners
       2. Filter region
    */

    (function () {
        'use strict';

        // ===== Performance/UX Boosts — MissingTable fast-path =====
        // Toggle verbose logs without touching callsites
        const CONFIG = Object.assign({
            DEBUG: false,
            FETCH_CONCURRENCY: 12,      // 8–12 recommended
            YIELD_EVERY: 50,            // yield to main thread every N heavy iterations
            VIRTUAL_THRESHOLD: 500,     // switch to virtualized rendering beyond this many rows
            CATALOG_URL: "https://raw.githubusercontent.com/AdamLee9186/anipet/main/backoffice_catalog.csv",
            CACHE_NS: "catalog_csv_v1"
        }, window.MISSINGTABLE_CONFIG || {});
        const log = {
            debug: (...a) => CONFIG.DEBUG && console.log("[MT]", ...a),
            info:  (...a) => console.log("[MT]", ...a),
            warn:  (...a) => console.warn("[MT]", ...a),
            error: (...a) => console.error("[MT]", ...a),
        };

        // Small helper to keep the UI responsive in long loops
        const yieldToMain = () => new Promise(r => setTimeout(r, 0));
        async function maybeYield(i, every = CONFIG.YIELD_EVERY) {
            if (i % every === 0) await yieldToMain();
        }

        // Lightweight p-limit implementation (no deps)
        function pLimit(concurrency) {
            let active = 0;
            const queue = [];
            const next = () => {
                if (active >= concurrency || queue.length === 0) return;
                active++;
                const { fn, resolve, reject } = queue.shift();
                Promise.resolve()
                    .then(fn)
                    .then((v) => { active--; resolve(v); next(); })
                    .catch((e) => { active--; reject(e); next(); });
            };
            return (fn) => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); next(); });
        }
        const limitFetch = pLimit(CONFIG.FETCH_CONCURRENCY);

        // ETag/Last-Modified aware fetch for the catalog CSV
        async function fetchWithValidators(url) {
            const key = (s) => `${CONFIG.CACHE_NS}:${s}:${url}`;
            const cachedBody = localStorage.getItem(key("body"));
            const cachedETag = localStorage.getItem(key("etag"));
            const cachedLM   = localStorage.getItem(key("lm"));

            // Try conditional GET first (works when server supports 304)
            const headers = new Headers();
            if (cachedETag) headers.set("If-None-Match", cachedETag);
            if (cachedLM)   headers.set("If-Modified-Since", cachedLM);

            const resp = await fetch(url, { headers });
            if (resp.status === 304 && cachedBody) {
                log.debug("Catalog: 304 Not Modified — serving from cache");
                return new Response(new Blob([cachedBody]), { status: 200 });
            }
            if (!resp.ok) return resp;
            const e = resp.headers.get("ETag");
            const lm = resp.headers.get("Last-Modified");
            const text = await resp.text();
            try {
                localStorage.setItem(key("body"), text);
                if (e)  localStorage.setItem(key("etag"), e);
                if (lm) localStorage.setItem(key("lm"), lm);
            } catch (err) {
                // best-effort cache
                log.warn("Catalog cache write failed (quota?)", err);
            }
            return new Response(new Blob([text]), { status: 200 });
        }

        // CSV parsing (off-main-thread when PapaParse is available)
        async function parseCsvSmart(csvText) {
            if (typeof Papa !== "undefined") {
                return new Promise((resolve, reject) => {
                    Papa.parse(csvText, {
                        header: true,
                        dynamicTyping: false,
                        skipEmptyLines: true,
                        worker: true,
                        complete: (r) => resolve(r.data),
                        error: reject,
                    });
                });
            }
            // Minimal fallback parser (sync)
            const [headerLine, ...lines] = csvText.split(/\r?\n/).filter(Boolean);
            const headers = headerLine.split(",");
            return lines.map(l => {
                const cols = l.split(",");
                const obj = {};
                headers.forEach((h, i) => obj[h] = cols[i]);
                return obj;
            });
        }

        // Create fast lookup Map for sku -> barcode
        function buildSkuBarcodeMap(rows, skuKey = "sku", barcodeKey = "barcode") {
            const map = new Map();
            for (let i = 0; i < rows.length; i++) {
                const r = rows[i];
                if (r && r[skuKey]) map.set(String(r[skuKey]).trim(), String(r[barcodeKey] || "").trim());
            }
            log.info(`🔗 מיפוי מק"ט לברקוד (Map): ${map.size} ערכים`);
            return map;
        }

        // Virtualized renderer for large tables (> threshold)
        function mountVirtualTable(tbody, rows, rowFactory) {
            const ROW_H = 36; // px; keep in sync with row CSS
            const total = rows.length;
            const container = tbody.parentElement; // assuming tbody is inside a scrollable table container
            container.style.position = "relative";
            container.style.overflowY = "auto";
            const spacer = document.createElement("div");
            spacer.style.height = (total * ROW_H) + "px";
            spacer.style.position = "relative";
            tbody.replaceChildren(); // clear
            tbody.appendChild(spacer);

            function renderSlice() {
                const start = Math.max(0, Math.floor(container.scrollTop / ROW_H) - 20);
                const visible = Math.ceil(container.clientHeight / ROW_H) + 40;
                const end = Math.min(total, start + visible);
                const frag = document.createDocumentFragment();
                const baseTop = start * ROW_H;
                for (let i = start; i < end; i++) {
                    const tr = rowFactory(rows[i], i);
                    tr.style.position = "absolute";
                    tr.style.top = (baseTop + (i - start) * ROW_H) + "px";
                    tr.style.height = ROW_H + "px";
                    frag.appendChild(tr);
                }
                spacer.replaceChildren(frag);
            }
            container.addEventListener("scroll", renderSlice, { passive: true });
            renderSlice();
        }

        // Batch DOM writes with DocumentFragment
        function appendRowsBatch(tbody, rows, rowFactory) {
            const frag = document.createDocumentFragment();
            for (let i = 0; i < rows.length; i++) {
                const tr = rowFactory(rows[i], i);
                frag.appendChild(tr);
            }
            tbody.replaceChildren(frag);
        }

        // 1. הגדרה גלובלית של ה-Web App URL
        const GAS_URL = 'https://script.google.com/macros/s/AKfycbxhld1BsKOEnDTpjM54X-aVwjdvZAbdL6T78jQ9nyHeJyyaasTgNB2SDFPVoRNhhCBpRg/exec';

        // פונקציה לבדיקת חיבור לשרת
        async function testServerConnection() {
            console.log('בודק חיבור לשרת Google Apps Script...');

            // בדיקת תקינות ה-URL
            if (!GAS_URL || !GAS_URL.includes('script.google.com/macros/s/')) {
                throw new Error('URL של הסקריפט Google Apps Script לא תקין');
            }

            return new Promise((resolve, reject) => {
                // בקשה למידע על הקובץ והגיליון
                const infoUrl = GAS_URL + '?info=true';

                GM_xmlhttpRequest({
                    method: 'GET',
                    url: infoUrl,
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    onload: function(response) {
                        console.log('📡 תשובת בדיקת חיבור:', response.responseText.substring(0, 200));
                        console.log('📊 סטטוס:', response.status);

                        // בדוק אם התשובה היא HTML (שגיאה)
                        if (response.responseText.trim().startsWith('<!DOCTYPE') || response.responseText.trim().startsWith('<html')) {
                            reject(new Error('השרת מחזיר דף HTML במקום JSON - ייתכן שהסקריפט לא פורסם או לא מורשה'));
                            return;
                        }

                        if (response.status === 200) {
                            try {
                                const data = JSON.parse(response.responseText);
                                console.log('✅ תשובה תקינה מהשרת:', data);

                                // בדוק אם יש מידע מפורט על הקובץ
                                if (data.sheetInfo) {
                                    console.log('📋 מידע מפורט על הקובץ זמין');
                                    resolve(data.sheetInfo);
                                } else if (data.version) {
                                    console.log(`✅ גרסת השרת: ${data.version}`);
                                    console.log(`📝 הודעה: ${data.message || 'אין הודעה'}`);
                                    resolve({
                                        success: true,
                                        version: data.version,
                                        message: data.message,
                                        basicConnection: true
                                    });
                                } else {
                                    console.log('✅ חיבור בסיסי תקין');
                                    resolve({
                                        success: true,
                                        basicConnection: true
                                    });
                                }
                            } catch (e) {
                                console.error('❌ שגיאה בניתוח התשובה:', e);
                                reject(new Error('תשובה לא תקינה מהשרת'));
                            }
                        } else {
                            reject(new Error(`סטטוס שגיאה: ${response.status}`));
                        }
                    },
                    onerror: function(error) {
                        console.error('שגיאה בבדיקת חיבור:', error);
                        reject(error);
                    }
                });
            });
        }

        console.log('🚀 טבלת חוסרים - סקריפט Tampermonkey טוען...');
        console.log('📍 URL של הסקריפט Google Apps Script:', GAS_URL);
        console.log('📋 Sheet ID: 1ufzGaLz_dRzHqI6cclTLEzpwAiSHLytIKpVh-JLYVe8');
        console.log('💡 אם נתקלת בבעיות QuotaExceededError, הרץ: clearOldCache()');
        console.log('🔧 גרסה 1.5 - עם שיפורי ביצועים וולידציה מתקדמת');
        console.log('⚠️  חשוב: אם אתה רואה "0 פריטים" אחרי ייצוא, זה אומר שה-URL מצביע על גרסה ישנה');
        console.log('🔧 כדי לתקן:');
        console.log('   1. פרוס מחדש את הסקריפט Google Apps Script');
        console.log('   2. עדכן את GAS_URL בקובץ lionwheel_table.js');
        console.log('   3. וודא שהסקריפט מורשה לגישה');
        console.log('   4. בדוק חיבור עם כפתור "בדוק חיבור"');

        // ===== GOOGLE SHEETS SIDEBAR AUTO-OPENING FUNCTIONALITY =====
        // This section handles automatic sidebar opening for Google Sheets
        if (window.location.hostname === 'docs.google.com' && window.location.pathname.includes('/spreadsheets/')) {
            console.log('📊 Google Sheets זוהה - מאתחל פתיחה אוטומטית של סיידבר...');

            let retryCount = 0;
            const MAX_RETRIES = 30; // Maximum 30 retries (30 seconds)

            /**
             * Attempts to open the Google Sheets sidebar by calling the Apps Script function.
             * Retries if the google.script.run object is not yet available.
             */
            function tryOpenSidebar() {
                retryCount++;

                // Check if we've exceeded maximum retries
                if (retryCount > MAX_RETRIES) {
                    console.error(`❌ נכשל בפתיחת סיידבר לאחר ${MAX_RETRIES} ניסיונות.`);
                    console.error('🔧 אנא וודא שיש לך:');
                    console.error('   1. הוספת את הפונקציה openSidebar() לפרויקט Google Apps Script');
                    console.error('   2. יצרת קובץ Sidebar.html בפרויקט Apps Script');
                    console.error('   3. אישרת את הפרויקט Apps Script');
                    console.error('   4. שם הפונקציה הוא בדיוק "openSidebar"');
                    return;
                }

                // Debug: Log what we can see
                if (retryCount === 1) {
                    console.log('🔍 מידע דיבוג:');
                    console.log('   - אובייקט google קיים:', typeof google !== 'undefined');
                    if (typeof google !== 'undefined') {
                        console.log('   - google.script קיים:', !!google.script);
                        if (google.script) {
                            console.log('   - google.script.run קיים:', !!google.script.run);
                            if (google.script.run) {
                                console.log('   - פונקציות זמינות:', Object.keys(google.script.run));
                            }
                        }
                    }
                }

                if (typeof google !== 'undefined' &&
                    google.script &&
                    google.script.run &&
                    typeof google.script.run.openSidebar === 'function') {

                    console.log('✅ פותח סיידבר Google Sheets...');
                    google.script.run.openSidebar();
                } else {
                    console.warn(`⏳ google.script.run.openSidebar לא מוכן (ניסיון ${retryCount}/${MAX_RETRIES}), מנסה שוב בעוד שנייה...`);
                    setTimeout(tryOpenSidebar, 1000);
                }
            }

            // Wait for the page to fully load before attempting to open sidebar
            window.addEventListener('load', () => {
                console.log('📄 דף Google Sheets נטען, ממתין 2 שניות לפני ניסיון פתיחת סיידבר...');
                setTimeout(tryOpenSidebar, 2000); // Allow time for Sheets to fully initialize
            });
        }

        // ===== LIONWHEEL FUNCTIONALITY =====
        // The rest of the script handles Lionwheel store visits functionality
        if ((window.location.hostname === 'members.lionwheel.com' || window.location.hostname === 'test.lionwheel.com') && window.location.pathname.includes('/operator/store_visits')) {
            console.log('🦁 Lionwheel store visits זוהה - מאתחל פונקציונליות חוסרים...');

            // === Helpers for auto-applying the "בטיפול" filter ===
            function normalizeHebrewText(s){
                return (s || '').toString().replace(/[\s\u200F\u200E\u202A-\u202E\u2066-\u2069]/g,'').trim();
            }
            function snapshotTaskIds(){
                return Array.from(document.querySelectorAll('[data-task-id]'))
                    .map(e => e.getAttribute('data-task-id') || '')
                    .filter(Boolean)
                    .join(',');
            }
            function waitForTasksChanged(prevSnap, timeoutMs = 6000){
                return new Promise(resolve => {
                    const target = document.querySelector('#operator-store-visits-table') || document.body;
                    let done = false;
                    const cleanup = (val) => { if (done) return; done = true; try{ obs.disconnect(); }catch(_){} clearInterval(poller); resolve(val); };
                    const check = () => {
                        const now = snapshotTaskIds();
                        if (now !== prevSnap){ cleanup(true); }
                    };
                    const obs = new MutationObserver(check);
                    try{ obs.observe(target, {childList:true, subtree:true}); }catch(_){}
                    const start = Date.now();
                    const poller = setInterval(() => {
                        if (Date.now() - start >= timeoutMs) cleanup(false);
                        else check();
                    }, 200);
                    // initial fast check
                    check();
                });
            }
            async function applyTreatmentFilterIfExists(){
                try{
                    const spans = Array.from(document.querySelectorAll('.filter-badge.filter-badge-hover-btn span'));
                    const span = spans.find(s => normalizeHebrewText(s.textContent) === normalizeHebrewText('בטיפול'));
                    if (!span){
                        console.log('[MissingTable] "בטיפול" filter not found – proceeding without it.');
                        return false;
                    }
                    const badge = span.closest('.filter-badge') || span;
                    const beforeSnap = snapshotTaskIds();
                    try { badge.scrollIntoView({block:'nearest'}); } catch(_){}
                    // Tampermonkey-safe click simulation (no { view: window })
                    try { badge.click(); } catch(_) {}
                    const evtInit = { bubbles: true, cancelable: true };
                    ['pointerdown','pointerup','mousedown','mouseup','click'].forEach(type => {
                        try {
                            const Ctor = (type.startsWith('pointer') && typeof PointerEvent !== 'undefined') ? PointerEvent : MouseEvent;
                            badge.dispatchEvent(new Ctor(type, evtInit));
                        } catch(__) {
                            try { badge.dispatchEvent(new MouseEvent(type, evtInit)); } catch(___) {}
                        }
                    });
                    const changed = await waitForTasksChanged(beforeSnap, 6000);
                    console.log(changed
                        ? '[MissingTable] Applied "בטיפול" filter (task list changed).'
                        : '[MissingTable] Clicked "בטיפול" but task list did not change (perhaps already active).');
                    return changed;
                }catch(err){
                    console.warn('[MissingTable] Failed applying "בטיפול" filter:', err);
                    return false;
                }
            }

        // 1. פונקציית ה־addPassiveEventListener
        function addPassiveEventListener(el, event, handler, options = {}) {
            const opts = Object.assign({ passive: true }, options);
            el.addEventListener(event, handler, opts);
        }

        // 2. שדרוג ההאזנות הגלובליות
        addPassiveEventListener(window, 'scroll', handleGlobalScroll);
        addPassiveEventListener(document, 'touchstart', handleGlobalTouchStart);
        addPassiveEventListener(document, 'touchmove', handleGlobalTouchMove);
        addPassiveEventListener(document, 'wheel', handleGlobalWheel);

        // 3. המימוש של ה־handleGlobal*
        function handleGlobalScroll(e) {
            // Global scroll handling logic
        }

        function handleGlobalTouchStart(e) {
            // Global touch start handling logic
        }

        function handleGlobalTouchMove(e) {
            // Global touch move handling logic
        }

        function handleGlobalWheel(e) {
            // Global wheel handling logic
        }

        // 4. פונקציה לניקוי וסינון האיזור
        const EXCLUDED_REGION = "מרלוג צור יגאל (צ'יטה)";

        // פונקציה לסינון מראש מתוך הטבלה הראשית
        function getRegionFromMainTable(taskId){
            const row = document.querySelector(`tr[data-task-id="${taskId}"]`);
            const cells = row?.querySelectorAll('td') || [];
            const region = cells[7]?.textContent.trim() || '';
            if (!region) return '';                 // לא ידוע – נמשיך לפולבק בדף המשימה
            if (region === EXCLUDED_REGION) return null; // לדלג מראש
            return region;
        }

        // מערכת קאש למשימות - גרסה בטוחה
        const TASK_CACHE_KEY = 'missing_table_task_cache_v1';
        const MAX_TASKS_TO_KEEP = 60;   // כמה רשומות להחזיק בשגרה
        const PRUNE_TO = 30;            // לדלל עד לכמות זו אם חוטפים QuotaExceeded
        let disableTaskCache = false;

        const taskCache = (() => {
            try { return JSON.parse(sessionStorage.getItem(TASK_CACHE_KEY) || '{}'); }
            catch { return {}; }
        })();

        function prune(cache, keep = MAX_TASKS_TO_KEEP) {
            const entries = Object.entries(cache)
                .map(([id, v]) => [id, v && v.ts ? v.ts : 0])
                .sort((a, b) => b[1] - a[1]); // חדש→ישן
            for (let i = keep; i < entries.length; i++) {
                delete cache[entries[i][0]];
            }
        }

        function safeSaveTaskCache() {
            if (disableTaskCache) return;
            try {
                prune(taskCache, MAX_TASKS_TO_KEEP);
                sessionStorage.setItem(TASK_CACHE_KEY, JSON.stringify(taskCache));
            } catch (err) {
                if (err?.name === 'QuotaExceededError' || err?.code === 22 || err?.code === 1014) {
                    console.warn('[MissingTable] Storage full. Pruning & retrying…');
                    // נקה מפתחות כבדים מוכרים כדי לפנות מקום (אם קיימים)
                    ['catalog_csv_v1', 'catalog_csv'].forEach(k => {
                        try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch {}
                    });
                    prune(taskCache, PRUNE_TO);
                    try {
                        sessionStorage.setItem(TASK_CACHE_KEY, JSON.stringify(taskCache));
                    } catch {
                        console.warn('[MissingTable] Disabling task cache for this session.');
                        disableTaskCache = true;
                    }
                } else {
                    console.error(err);
                }
            }
        }

        // תאימות לאזכורים קיימים של saveTaskCache():
        const saveTaskCache = safeSaveTaskCache;

        function getUpdatedAtFromRow(taskId){
            const row = document.querySelector(`tr[data-task-id="${taskId}"]`);
            // דוגמה: תא 4 מכיל תאריך/שעה – להתאים לשדה האמיתי אצלך
            const t = row?.querySelectorAll('td')[4]?.textContent.trim() || '';
            return t; // משתמש כמזהה גרסה
        }

        function readTaskFromCache(id, ver) {
            const c = taskCache[id];
            return (c && c.ver === ver) ? c.data : null;
        }

        function writeTaskToCache(id, ver, data) {
            if (disableTaskCache) return;
            taskCache[id] = { ver, data, ts: Date.now() }; // ts לצורך LRU
            saveTaskCache();
        }

        function getDestinationRegion(taskId, doc) {
            let destinationRegion = '';

            // 1) Primary: read raw text from panel_view element
            const destinationRegionDiv = doc.querySelector('div[data-name="destination_region_str"]');
            if (destinationRegionDiv) {
                const rawText = destinationRegionDiv.textContent.trim();
                // Split lines and clean
                const lines = rawText
                    .split(/\r?\n/)
                    .map(l => l.trim())
                    .filter(Boolean);

                // Exclude specific region entirely
                if (lines.includes(EXCLUDED_REGION)) {
                    console.warn(`Task ID: ${taskId} | Excluding task because region includes '${EXCLUDED_REGION}'`);
                    return null; // stop processing this task
                }

                // First line is primary region
                if (lines.length) {
                    destinationRegion = lines[0];
                    console.log(`Task ID: ${taskId} | Read clean destinationRegion: '${destinationRegion}'`);
                }
            }

            // 2) Strict fallback: read only the 8th <td> (index 7) of the main table row if primary missing
            if (!destinationRegion) {
                const mainTableRow = document.querySelector(`tr[data-task-id="${taskId}"]`);
                const cells = mainTableRow?.querySelectorAll('td') || [];
                const fallback = cells[7]?.textContent.trim();

                if (fallback && fallback !== EXCLUDED_REGION) {
                    destinationRegion = fallback;
                    console.log(`Task ID: ${taskId} | Fallback cell[7] Destination Region: '${destinationRegion}'`);
                } else if (fallback === EXCLUDED_REGION) {
                    console.warn(`Task ID: ${taskId} | Excluding task due to fallback region '${fallback}'`);
                    return null;
                }
            }

            console.log(`Task ID: ${taskId} | Final Destination Region: '${destinationRegion}'`);
            return destinationRegion;
        }

        // 5. פונקציית העיבוד שמסננת ומשייכת איזור
        function processTasks(tasks, doc) {
            return tasks.reduce((out, task) => {
                const region = getDestinationRegion(task.id, doc);
                if (region === null) return out;
                task.destinationRegion = region;
                out.push(task);
                return out;
            }, []);
        }

        const CSV_URL = 'https://raw.githubusercontent.com/AdamLee9186/anipet/main/backoffice_catalog.csv';
        const MASTER_CSV_URL = 'https://raw.githubusercontent.com/AdamLee9186/anipet/main/anipet_master_catalog_v1.csv';
        console.log('📁 URL של קובץ הקטלוג CSV:', CSV_URL);
        console.log('🖼️ URL של מאסטר התמונות CSV:', MASTER_CSV_URL);

        // מערכת קאש ל-CSV עם ETag
        function parseHeader(headersStr){
            const out={};
            headersStr.split(/\r?\n/).forEach(l=>{
                const i=l.indexOf(':');
                if(i>0){
                    out[l.slice(0,i).trim().toLowerCase()] = l.slice(i+1).trim();
                }
            });
            return out;
        }

        async function gmGetWithETag(url, cacheKey){
            const metaKey = cacheKey + ':meta';
            const meta = JSON.parse(localStorage.getItem(metaKey) || '{}');

            return new Promise((resolve, reject)=>{
                GM_xmlhttpRequest({
                    method: 'GET',
                    url,
                    headers: meta.etag ? { 'If-None-Match': meta.etag } : {},
                    onload: res => {
                        const hs = parseHeader(res.responseHeaders||'');
                        if (res.status === 304 && meta.text) {
                            console.log(`📦 משתמש בקאש עבור ${cacheKey}`);
                            resolve(meta.text);
                            return;
                        }
                        if (res.status >= 200 && res.status < 300) {
                            try {
                                localStorage.setItem(metaKey, JSON.stringify({ etag: hs['etag']||'', text: res.responseText }));
                                console.log(`💾 שמירה בקאש עבור ${cacheKey}`);
                            } catch (err) {
                                if (err?.name === 'QuotaExceededError' || err?.code === 22 || err?.code === 1014) {
                                    console.warn(`[MissingTable] Storage full for ${cacheKey}. Skipping cache save.`);
                                    // ממשיכים בלי קאש במקום להפיל
                                } else {
                                    console.error('Error saving cache:', err);
                                }
                            }
                            resolve(res.responseText);
                        } else reject(new Error(`HTTP ${res.status}`));
                    },
                    onerror: reject,
                    timeout: 30000
                });
            });
        }
        let catalogData = null;
        let allResults = []; // Store all fetched results
        let filteredAndSortedResults = []; // Store currently filtered and sorted results
        let selectedItemUniqueIds = new Set(); // Stores uniqueId of selected items for export

        // AbortController להרצה נקייה
        let currentRun = null;

        function startRun(){
            if (currentRun?.abort){ currentRun.abort(); }
            const controller = new AbortController();
            currentRun = controller;
            return controller;
        }

        // ניקוי חד-פעמי של קאש ישן (להפעלה ידנית אם נדרש)
        function clearOldCache() {
            const keysToRemove = ['missing_table_task_cache_v1', 'catalog_csv_v1', 'catalog_csv'];
            keysToRemove.forEach(k => {
                try {
                    localStorage.removeItem(k);
                    sessionStorage.removeItem(k);
                    console.log(`🧹 נוקה ${k}`);
                } catch(e) {
                    console.warn(`לא ניתן לנקות ${k}:`, e);
                }
            });
        }

        // ------------------ Master catalog (images) ------------------
        let masterCatalogReady = false;
        const masterSkuToImage = new Map();
        const masterBarcodeToImage = new Map();
        // NEW: URL maps from master CSV
        const masterSkuToUrl = new Map();
        const masterBarcodeToUrl = new Map();
        let barcodeToMaktMap = {}; // גלובלי לתרגום ברקוד→מק״ט

        // Moved these variable declarations to a higher scope
        let viewMode = 'grouped'; // Fixed to grouped view only
        let expandedGroups = new Set();
        let currentMainSortType = 'default';
        let currentGroupHeaderSortColumn = 'name'; // Default sort by product name
        let currentGroupHeaderSortDirection = 'asc'; // Default ascending order (A-Z)
        let filterFromDate = null;
        let filterToDate = null;

        let exportToSheetsButton = null; // Will be assigned when modal is created
        let originalExportButtonText = '';
        let expandAllBtn = null; // Declare expandAllBtn at a higher scope
        let currentMode = 'missing'; // 'missing' or 'negative'
        // מצב גלריה (ON/OFF)
        let isGalleryView = false;

        // קריאת כמות לפריט – מתחשבת במצב הטבלה (חוסרים/נגטיב) ומגוון שמות עמודות
        function getItemQuantity(row){
          const getValue = (r,k)=> (r && r[k] != null ? String(r[k]).trim() : '');
          const parseNumber = (v)=>{
            if (!v) return 0;
            const m = String(v).match(/-?\d+(?:[.,]\d+)?/);
            return m ? parseFloat(m[0].replace(',', '.')) : 0;
          };

          // מפתחות רלוונטיים
          // מצב חוסרים: לוקחים *רק* עמודות חסרים – לא "נגטיב" ולא total.
          const MISSING_KEYS  = [
            'סה"כ חסרים','סה״כ חסרים','סה"כ חסרים','סהכ חסרים',
            'סה"כ חוסרים','סה״כ חוסרים','סה"כ חוסרים','סהכ חוסרים',
            'totalMissing','missing','missingTotal','חסרים'
          ];
          const NEGATIVE_KEYS = ['סה"כ לוקטו','סה״כ לוקטו','סה"כ לוקטו','סהכ לוקטו','לוקטו סה״כ','לוקטו סה"כ','לוקטו סהכ',
                           'לוקטו','נגטיב','picked','pickedTotal'];
          // fallback עדין: במצב חוסרים לא ניפול ל-total/סה"כ כדי שלא נתבלבל בכמויות הכלליות.
          const COMMON_FALLBACK_ALL = ['סה"כ','סהכ','quantity','qty','count','amount','total'];
          const COMMON_FALLBACK = (window.__missingTableMode === 'negative')
            ? COMMON_FALLBACK_ALL
            : ['quantity','qty','count']; // חוסרים – בלי total/סה"כ

          const currentMode = window.__missingTableMode === 'negative' ? 'negative' : 'missing';
          const ORDER = currentMode === 'negative'
            ? [...NEGATIVE_KEYS, ...MISSING_KEYS, ...COMMON_FALLBACK]
            : [...MISSING_KEYS, ...NEGATIVE_KEYS, ...COMMON_FALLBACK];

          for (const key of ORDER){
            const val = getValue(row, key);
            const n = parseNumber(val);
            if (n > 0) return n;
          }
          return 0;
        }

        /**
         * Replaces problematic characters in a string to make it safe for HTML attributes and CSS selectors.
         * @param {string} str The input string.
         * @returns {string} The sanitized string.
         */
        function sanitizeForHtmlAttribute(str) {
            if (typeof str !== 'string') return '';
            // Replace problematic characters that cause issues even after URI encoding + CSS.escape()
            // Specifically targeting double quotes and backslashes that might appear in item names/dates.
            return str.replace(/"/g, '_DQ_').replace(/\\/g, '_BS_');
        }

        /**
         * Reverts sanitization for HTML attributes.
         * @param {string} str The sanitized string.
         * @returns {string} The original string.
         */
        function unsanitizeFromHtmlAttribute(str) {
            if (typeof str !== 'string') return '';
            return str.replace(/_DQ_/g, '"').replace(/_BS_/g, '\\');
        }


        /**
         * Shows a custom modal message instead of a native alert.
         * @param {string} title - The title of the modal.
         * @param {string} message - The message to display.
         * @param {boolean} isError - True if it's an error message (for styling).
         */
        function showMessageModal(title, message, isError = false, customColors = null) {
            const existingModal = document.getElementById('custom-message-modal');
            if (existingModal) existingModal.remove();

            const modalBackdrop = document.createElement('div');
            modalBackdrop.className = 'modal-backdrop fade show';
            modalBackdrop.style.zIndex = 1050;
            document.body.appendChild(modalBackdrop);

            // Determine colors based on parameters
            let headerBgColor, headerTextColor, borderColor, closeIconColor;
            if (customColors) {
                headerBgColor = customColors.headerBg || '#d1ecf1';
                headerTextColor = customColors.headerText || '#0c5460';
                borderColor = customColors.border || '#bee5eb';
                closeIconColor = customColors.closeIcon || '#0c5460';
            } else {
                headerBgColor = isError ? '#f8d7da' : '#d1ecf1';
                headerTextColor = isError ? '#721c24' : '#0c5460';
                borderColor = isError ? '#f5c6cb' : '#bee5eb';
                closeIconColor = isError ? '#721c24' : '#0c5460';
            }

            const modal = document.createElement('div');
            modal.id = 'custom-message-modal';
            modal.className = 'modal fade show';
            modal.style.display = 'block';
            modal.style.position = 'fixed';
            modal.style.top = '0';
            modal.style.left = '0';
            modal.style.width = '100vw';
            modal.style.height = '100vh';
            modal.style.zIndex = 1051;
            modal.style.backgroundColor = 'rgba(0,0,0,0.5)';
            // בדוק אם ההודעה ארוכה (יותר מ-500 תווים או יותר מ-10 שורות)
            const isLongMessage = message.length > 500 || (message.match(/\n/g) || []).length > 10;

            modal.innerHTML = `
                <div class="modal-dialog modal-dialog-centered" style="max-width: ${isLongMessage ? '500px' : '400px'}; width: auto; max-height: ${isLongMessage ? '80vh' : 'none'}; border-radius: 8px; overflow: hidden;">
                    <div class="modal-content" style="border-radius: 8px; height: auto; display: flex; flex-direction: column;">
                        <div class="modal-header d-flex justify-content-between align-items-center" style="background-color: ${headerBgColor} !important; color: ${headerTextColor} !important; border-bottom: 1px solid ${borderColor} !important; flex-shrink: 0;">
                            <h5 class="modal-title" style="font-weight: bold; color: ${headerTextColor} !important;">${title}</h5>
                            <button type="button" class="close" data-dismiss="modal" aria-label="Close" id="close-message-modal" style="border: none; background: transparent; font-size: 1.5rem; cursor: pointer;">
                                <i class="ki ki-close" style="color: ${closeIconColor} !important;"></i>
                            </button>
                        </div>
                        <div class="modal-body py-4 px-3" style="flex-grow: 0; overflow-y: visible; max-height: none;">
                            <div style="margin-bottom: 0; text-align: center; font-size: 1.1em; color: #343a40; white-space: pre-wrap; word-wrap: break-word; line-height: 1.5; max-width: 100%;">${message}</div>
                        </div>
                        <div class="modal-footer" style="border-top: 1px solid #e9ecef; justify-content: center; flex-shrink: 0;">
                            <button type="button" class="btn btn-primary" id="ok-message-modal" style="padding: 8px 20px; border-radius: 5px; background-color: ${customColors ? '#21a366' : '#007bff'}; border-color: ${customColors ? '#0f733c' : '#007bff'}; color: white; cursor: pointer;">אישור</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            const closeModal = () => {
                modal.remove();
                modalBackdrop.remove();
            };

            document.getElementById('close-message-modal').onclick = closeModal;
            document.getElementById('ok-message-modal').onclick = closeModal;

            // Add event listeners for expand/collapse buttons
            setTimeout(() => {
                // Add CSS for better text wrapping
                const style = document.createElement('style');
                style.textContent = `
                    #custom-message-modal .modal-dialog {
                        width: auto !important;
                        min-width: 300px !important;
                        max-width: 500px !important;
                        height: auto !important;
                    }
                    #custom-message-modal .modal-content {
                        height: auto !important;
                        min-height: auto !important;
                    }
                    #custom-message-modal .modal-body {
                        word-wrap: break-word !important;
                        overflow-wrap: break-word !important;
                        height: auto !important;
                        flex-grow: 0 !important;
                    }
                    #custom-message-modal .modal-body div {
                        word-break: break-word !important;
                        overflow-wrap: break-word !important;
                        hyphens: auto !important;
                    }
                `;
                document.head.appendChild(style);
                // Show all added items
                const showAllAdded = document.getElementById('show-all-added');
                if (showAllAdded) {
                    showAllAdded.onclick = () => {
                        const shortAddedList = document.getElementById('short-added-list');
                        const fullAddedList = document.getElementById('full-added-list');
                        const hideAdded = document.getElementById('hide-added');
                        if (shortAddedList && fullAddedList && hideAdded) {
                            shortAddedList.style.display = 'none';
                            fullAddedList.style.display = 'block';
                            showAllAdded.style.display = 'none';
                            hideAdded.style.display = 'inline-block';
                        }
                    };
                }

                // Hide added items
                const hideAdded = document.getElementById('hide-added');
                if (hideAdded) {
                    hideAdded.onclick = () => {
                        const shortAddedList = document.getElementById('short-added-list');
                        const fullAddedList = document.getElementById('full-added-list');
                        const showAllAdded = document.getElementById('show-all-added');
                        if (shortAddedList && fullAddedList && showAllAdded) {
                            shortAddedList.style.display = 'block';
                            fullAddedList.style.display = 'none';
                            showAllAdded.style.display = 'inline-block';
                            hideAdded.style.display = 'none';
                        }
                    };
                }

                // Show all updated items
                const showAllUpdated = document.getElementById('show-all-updated');
                if (showAllUpdated) {
                    showAllUpdated.onclick = () => {
                        const shortUpdatedList = document.getElementById('short-updated-list');
                        const fullUpdatedList = document.getElementById('full-updated-list');
                        const hideUpdated = document.getElementById('hide-updated');
                        if (shortUpdatedList && fullUpdatedList && hideUpdated) {
                            shortUpdatedList.style.display = 'none';
                            fullUpdatedList.style.display = 'block';
                            showAllUpdated.style.display = 'none';
                            hideUpdated.style.display = 'inline-block';
                        }
                    };
                }

                // Hide updated items
                const hideUpdated = document.getElementById('hide-updated');
                if (hideUpdated) {
                    hideUpdated.onclick = () => {
                        const shortUpdatedList = document.getElementById('short-updated-list');
                        const fullUpdatedList = document.getElementById('full-updated-list');
                        const showAllUpdated = document.getElementById('show-all-updated');
                        if (shortUpdatedList && fullUpdatedList && showAllUpdated) {
                            shortUpdatedList.style.display = 'block';
                            fullUpdatedList.style.display = 'none';
                            showAllUpdated.style.display = 'inline-block';
                            hideUpdated.style.display = 'none';
                        }
                    };
                }

                // Show all not found items
                const showAllNotFound = document.getElementById('show-all-notfound');
                if (showAllNotFound) {
                    showAllNotFound.onclick = () => {
                        const shortNotFoundList = document.getElementById('short-notfound-list');
                        const fullNotFoundList = document.getElementById('full-notfound-list');
                        const hideNotFound = document.getElementById('hide-notfound');
                        if (shortNotFoundList && fullNotFoundList && hideNotFound) {
                            shortNotFoundList.style.display = 'none';
                            fullNotFoundList.style.display = 'block';
                            showAllNotFound.style.display = 'none';
                            hideNotFound.style.display = 'inline-block';
                        }
                    };
                }

                // Hide not found items
                const hideNotFound = document.getElementById('hide-notfound');
                if (hideNotFound) {
                    hideNotFound.onclick = () => {
                        const shortNotFoundList = document.getElementById('short-notfound-list');
                        const fullNotFoundList = document.getElementById('full-notfound-list');
                        const showAllNotFound = document.getElementById('show-all-notfound');
                        if (shortNotFoundList && fullNotFoundList && showAllNotFound) {
                            shortNotFoundList.style.display = 'block';
                            fullNotFoundList.style.display = 'none';
                            showAllNotFound.style.display = 'inline-block';
                            hideNotFound.style.display = 'none';
                        }
                    };
                }
            }, 100);
        }

        // --- Styles for Gallery (once) ---
        (function ensureGalleryStyles(){
            const id = 'missing-gallery-styles';
            if (document.getElementById(id)) return;
            const css = `
              /* container + immediate loader */
              #missing-gallery-container{display:none; position:relative; flex:1 1 auto; min-height:0; width:100%; height:100%; overflow:auto; padding:0;}
              .missing-gallery-loader{position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,.65); z-index:2}
              .missing-gallery-spinner{width:44px; height:44px; border-radius:50%; border:3px solid #d6dae0; border-top-color:#6c757d; animation:tm-spin .8s linear infinite}
              
              /* Gallery close button */
              .gallery-close-button{
                position:absolute; top:12px; right:12px; z-index:20;
                width:32px; height:32px; border-radius:50%;
                background:rgba(0,0,0,0.6); border:none; cursor:pointer;
                display:none; align-items:center; justify-content:center;
                color:white; font-size:14px; transition:all 0.2s ease;
              }
              .gallery-close-button:hover{
                background:rgba(0,0,0,0.8); transform:scale(1.1);
              }
              .gallery-close-button:active{
                transform:scale(0.95);
              }

              /* Grid קבוע 100×100, צמוד ללא רווחים, גבול לבן 1px */
              .missing-gallery-grid{display:grid; grid-template-columns:repeat(auto-fill,100px); grid-auto-rows:100px; gap:0; background:#fff; padding-top:50px;}
              .missing-gallery-card{position:relative; width:100px; height:100px; background:#fff; border:1px solid #fff; border-radius:8px; overflow:hidden;}
              .missing-gallery-card img{width:100%; height:100%; object-fit:contain; display:block;}

              /* === Quantity badge on thumbnails === */
              .lw-thumb-badge{
                position:absolute;
                top:6px;
                left:6px;
                z-index:3;
                min-width:28px;
                height:28px;
                padding:0 8px;
                border-radius:999px;
                border:2px solid #fff;
                background:#000000a6; /* שחור עם שקיפות קלה */
                color:#fff;
                display:flex;
                align-items:center;
                justify-content:center;
                font-family:"Noto Sans Hebrew", Arial, sans-serif;
                font-weight:700;
                font-size:12px;
                line-height:1;
                pointer-events:none;
                backdrop-filter:saturate(120%) blur(2px);
              }

              /* overlay: hidden by default, slide-up on hover */
              .missing-gallery-overlay{position:absolute; left:0; right:0; bottom:0; padding:6px 8px; background:rgba(0,0,0,.55); color:#fff; font-size:12px; line-height:1.25; direction:rtl; text-align:right; transform:translateY(100%); transition:transform .18s ease;}
              .missing-gallery-card:hover .missing-gallery-overlay{transform:translateY(0);}
              .missing-gallery-name{display:block; white-space:normal; word-break:break-word;}
              .missing-gallery-code{display:block; opacity:.9; font-family:monospace; direction:ltr;}
              
              /* === Checkmark Overlay === */
              .checkmark-overlay{
                position:absolute; top:0; left:0; right:0; bottom:0; 
                background:rgba(16, 185, 129, 0.3); 
                display:flex; align-items:center; justify-content:center;
                z-index:10; border-radius:8px;
                animation: checkmarkFadeIn 0.3s ease-out;
              }
              .checkmark-icon{
                background:white; border-radius:50%; padding:8px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                animation: checkmarkBounce 0.4s ease-out;
              }
              .missing-gallery-card.checked{
                border: 2px solid #10B981;
                box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
              }
              @keyframes checkmarkFadeIn{
                from{opacity:0; transform:scale(0.8);}
                to{opacity:1; transform:scale(1);}
              }
              @keyframes checkmarkBounce{
                0%{transform:scale(0.3);}
                50%{transform:scale(1.1);}
                100%{transform:scale(1);}
              }
              
              #toggle-gallery-btn.btn-primary{background-color:#D7DAE7; border-color:#D7DAE7; color:#000;}
              #toggle-gallery-btn.btn-primary:hover{background-color:#C5C9D6; border-color:#C5C9D6; color:#000;}

              /* skeleton: vertical shimmer (top→bottom) with soft grays */
              .missing-skel{position:relative; width:100px; height:100px; background:#f3f4f6; overflow:hidden; border:1px solid #fff; border-radius:8px;}
              .missing-skel::after{content:""; position:absolute; inset:0; background:linear-gradient(180deg, rgba(247,248,250,0) 0%, rgba(233,236,239,.7) 50%, rgba(247,248,250,0) 100%); transform:translateY(-100%); animation:tm-shimmer-y 1.1s ease-in-out infinite;}

              @keyframes tm-spin { to{ transform:rotate(360deg) } }
              @keyframes tm-shimmer-y { 0%{ transform:translateY(-100%)} 100%{ transform:translateY(100%)} }

              /* === Overlay בסגנון toolbox: טיפוגרפיה/כותרת/חיצים/שורת Thumbs === */
              #lw-overlay{position:fixed; inset:0; background:rgba(0,0,0,.82); display:none; z-index:2147483000; direction:rtl;
                font-family:"Noto Sans Hebrew","Heebo","Assistant","Rubik","Segoe UI",Arial,sans-serif;}
              #lw-overlay.active{display:flex; flex-direction:column;}
              /* Topbar ממורכז כמו ב-toolbox */
              #lw-ov-topbar{display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px;
                padding:12px 16px 4px; color:#fff; text-align:center}
              #lw-ov-topbar .lw-title a{font-size:20px; font-weight:700; color:#fff; text-decoration:none}
              #lw-ov-topbar .lw-title a.has-link{color:#0073e9}
              #lw-ov-topbar .lw-title a.has-link:hover{color:#0b84ff; text-decoration:underline}
              #lw-ov-topbar .lw-row{font-size:14px; opacity:.95}
              #lw-ov-topbar .copy-ico{margin-inline-start:6px; cursor:pointer; color:#0073e9}
              #lw-ov-topbar .copy-ico:hover{color:#0b84ff}
              /* בימת התמונה */
              #lw-ov-stage{flex:1 1 auto; display:flex; align-items:center; justify-content:center; padding:10px}
              #lw-ov-box{position:relative; background:#fff; border-radius:14px; padding:18px; box-shadow:0 10px 40px rgba(0,0,0,.35)}
              #lw-ov-img{max-width:min(78vw,1100px); max-height:70vh; object-fit:contain; display:block; border-radius:8px}
              #lw-ov-ph{
                width:min(78vw,1100px); height:70vh;
                display:flex; align-items:center; justify-content:center;
                background:#f7f7f7; color:#374151; border-radius:8px;
                font-weight:700; padding:20px; text-align:center;
                /* טקסט גדול וברור */
                font-size:clamp(22px, 3.2vh, 36px); line-height:1.3; white-space:pre-wrap;
              }
              /* חיצים בקצוות המסך (ולא בקופסת התמונה) + מצב RTL הפוך */
              .lw-ov-arrow{position:fixed; top:50%; transform:translateY(-50%); width:46px; height:46px; border-radius:12px;
                background:rgba(0,0,0,.35); color:#fff; display:flex; align-items:center; justify-content:center; font-size:28px;
                cursor:pointer; user-select:none}
              /* RTL: הבא נמצא בצד שמאל, הקודם בצד ימין */
              #lw-ov-next{left:16px}  #lw-ov-prev{right:16px}
              #lw-ov-close{position:fixed; top:12px; right:16px; font-size:28px; color:#fff; cursor:pointer}
              /* שורת thumbnails נגללת בתחתית – כמו ב-toolbox */
              #lw-ov-thumbs{display:flex; gap:10px; padding:12px 66px 18px; overflow-x:auto; overflow-y:hidden; justify-content:flex-start;
                -webkit-overflow-scrolling:touch; scroll-behavior:smooth; user-select:none; cursor:grab}
              #lw-ov-thumbs.dragging{cursor:grabbing}
              #lw-ov-thumbs img{width:66px; height:66px; object-fit:contain; border-radius:10px; background:#fff; padding:6px;
                border:2px solid transparent; cursor:pointer}
              #lw-ov-thumbs img.active{border-color:#ffd451}
              /* חיצי גלילה לשורת ה-thumbs בדסקטופ */
              .lw-ov-thumbs-arrow{position:fixed; bottom:12px; width:42px; height:42px; border-radius:12px;
                background:rgba(0,0,0,.35); color:#fff; display:flex; align-items:center; justify-content:center; font-size:22px; cursor:pointer; user-select:none}
              #lw-ov-thumbs-prev{right:16px} /* RTL: prev מימין בשורת ה-thumbs */
              #lw-ov-thumbs-next{left:16px}
              /* Scope to MissingTable overlay only – prevents clobbering toolbox.js gallery */
              #lw-overlay .gallery-caption{position:absolute; bottom:12px; left:12px; right:12px; text-align:center; color:#fff}
              #lw-overlay .gallery-zoom-controls{position:absolute; bottom:12px; left:12px; display:flex; gap:8px}
              .lw-hidden{display:none!important;}
            `;
            try{
              if (typeof GM_addStyle === 'function') { GM_addStyle(css); return; }
            }catch(e){}
            const style = document.createElement('style'); style.id=id; style.textContent=css; document.head.appendChild(style);
        })();

// === Fullsize conversion (standalone) ===
function getFullSizeImageUrl(thumbnailUrl){
  try{
    if (!thumbnailUrl || typeof thumbnailUrl !== 'string') return '';
    if (thumbnailUrl.includes('cdn.modulus.co.il')) { return thumbnailUrl.split('?')[0]; }
    if (thumbnailUrl.includes('www.gag-lachayot.co.il')) { return thumbnailUrl.replace(/-\d+x\d+(\.[a-zA-Z0-9]+(?:[?#].*)?)$/, '$1').replace(/-\d+x\d+$/, ''); }
    if (thumbnailUrl.includes('www.all4pet.co.il')) { return thumbnailUrl.replace(/_small(\.[a-zA-Z0-9]+(?:[?#].*)?)$/, '$1').replace(/_small$/, ''); }
    if (thumbnailUrl.includes('d3m9l0v76dty0.cloudfront.net')) { return thumbnailUrl.replace('/show/', '/original/').replace('/index/', '/original/').replace('/large/', '/original/'); }
    if (thumbnailUrl.includes('just4pet.co.il')) {
      const parts = thumbnailUrl.split('/'); const filenameWithQuery = parts.pop(); const filenameParts = filenameWithQuery.split('?');
      const filename = filenameParts[0]; const query = filenameParts.length > 1 ? `?${filenameParts[1]}` : '';
      if (filename.startsWith('tn_')) { const newFilename = filename.substring(3); return parts.join('/') + '/' + newFilename + query; }
    }
    if (thumbnailUrl.includes('speedog.co.il')) {
      return thumbnailUrl.replace(/-\d+x\d+(\.[a-zA-Z0-9]+(?:[?#].*)?)$/, '$1').replace(/-\d+x\d+$/, '');
    }
    return thumbnailUrl;
  } catch (e) {
    console.warn('[MissingTable] Error processing thumbnail URL, returning original:', thumbnailUrl, e);
    return thumbnailUrl;
  }
}

// (שומרים כאן, גלריית ה-overlay משתמשת בזה ישירות)

// === Overlay מקומי דמוי toolbox (כותרת, Thumbs, חיצים, העתקות) ===
function ensureLocalOverlay(){
  if (document.getElementById('lw-overlay')) return;
  const root = document.createElement('div'); root.id='lw-overlay';
  root.innerHTML = `
    <div id="lw-ov-topbar">
      <div class="lw-title">
        <a id="lw-name-link" href="#" target="_blank" rel="noopener"></a>
        <i class="fa-light fa-clone copy-ico" id="lw-copy-name" title="העתק שם"></i>
      </div>
      <div class="lw-row">
        <span id="lw-sku"></span>
        <i class="fa-light fa-clone copy-ico" id="lw-copy-sku" title="העתק מק״ט"></i>
      </div>
      <div class="lw-row">
        <span id="lw-price"></span>
      </div>
    </div>
    <div id="lw-ov-stage">
      <div id="lw-ov-box">
        <div id="lw-ov-prev" class="lw-ov-arrow" aria-label="קודם">❮</div>
        <img id="lw-ov-img" alt="">
        <div id="lw-ov-next" class="lw-ov-arrow" aria-label="הבא">❯</div>
      </div>
    </div>
    <div id="lw-ov-thumbs"></div>
    <div id="lw-ov-close" aria-label="סגור">✕</div>
    <div id="lw-ov-thumbs-prev" class="lw-ov-thumbs-arrow">❮</div>
    <div id="lw-ov-thumbs-next" class="lw-ov-thumbs-arrow">❯</div>
  `;
  document.body.appendChild(root);
  const S = { items:[], idx:0 };
  const $img   = root.querySelector('#lw-ov-img');
  const $nameA = root.querySelector('#lw-name-link');
  const $skuEl = root.querySelector('#lw-sku');
  const $price = root.querySelector('#lw-price');
  const $thumbs = root.querySelector('#lw-ov-thumbs');
  const $thumbPrev = root.querySelector('#lw-ov-thumbs-prev');
  const $thumbNext = root.querySelector('#lw-ov-thumbs-next');

  // === Placeholder generator for thumbnails (small text) ===
  function buildThumbPlaceholder(name=''){
    const w=66, h=66, fs=11, color='#6b7280';
    const clean=(name||'').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const words=clean.split(/\s+/);
    const lines=[]; let line='';
    const maxChars=8; // שורות קצרות כדי להיכנס ל־66px
    for(const wd of words){
      if((line+wd).length<=maxChars){ line += (line?' ':'')+wd; }
      else{ lines.push(line); line = wd; }
    }
    if(line) lines.push(line);
    const n=Math.max(1,Math.min(3,lines.length));
    const yStart = h/2 - ((n-1)*fs*1.0)/2;
    const rows = lines.slice(0,3).map((t,i)=>`<text x="50%" y="${yStart + i*fs*1.1}" text-anchor="middle" dominant-baseline="middle" font-family="Noto Sans Hebrew, Arial" font-weight="700" font-size="${fs}" fill="${color}">${t}</text>`).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <rect width="100%" height="100%" rx="10" ry="10" fill="#f4f5f7"/>${rows}</svg>`;
    return 'data:image/svg+xml;utf8,'+encodeURIComponent(svg);
  }

  // Resolve Product URL for overlay title:
  // 1) direct fields on item, 2) master CSV (SKU/Barcode → Product URL), 3) fallback to Image URL
  function resolveProductUrl(it){
    const direct = it.productUrl || it.productURL || it.link || it.url;
    if (direct) return direct;
    // normalize helpers (local, to avoid scope issues)
    const Nsku = x => (x||'').toString().trim().toUpperCase();
    const Nbc  = x => (x||'').toString().replace(/\D+/g,'');
    const sku  = Nsku(it.makt || it.sku);
    const bc   = Nbc(it.barcode);
    // from master CSV maps
    if (sku && masterSkuToUrl.has(sku)) return masterSkuToUrl.get(sku);
    if (bc  && masterBarcodeToUrl.has(bc)) return masterBarcodeToUrl.get(bc);
    // graceful fallback: point to image if no product URL
    if (sku && masterSkuToImage.has(sku)) return masterSkuToImage.get(sku);
    if (bc  && masterBarcodeToImage.has(bc)) return masterBarcodeToImage.get(bc);
    return '';
  }

  function setTopbar(it){
    $nameA.textContent = it.productName || '';
    const url = resolveProductUrl(it);
    $nameA.href = url || '#';
    $nameA.style.pointerEvents = url ? 'auto' : 'none';
    $nameA.classList.toggle('has-link', !!url);
    $skuEl.textContent = it.sku ? String(it.sku) : '';
    $price.textContent = (it.price!=null && it.price!=='') ? `₪${it.price}` : '';
  }
  function load(idx){
    S.idx = idx;
    const it = S.items[idx]; if (!it) return;
    const url = it.fullSizeUrl || getFullSizeImageUrl(it.thumbnailUrl||'');
    setTopbar(it);
    // נקה placeholder קודם
    const oldPh = root.querySelector('#lw-ov-ph'); if (oldPh) oldPh.remove();
    $img.style.display = 'block'; $img.removeAttribute('srcset');
    // placeholder כשאין תמונה או שיש שגיאת טעינה
    function showPh(){
      let ph = root.querySelector('#lw-ov-ph');
      if (!ph){
        ph = document.createElement('div'); ph.id='lw-ov-ph';
        ph.textContent = it.productName || 'אין תמונה';
        root.querySelector('#lw-ov-box').appendChild(ph);
      }
      $img.style.display = 'none';
    }
    $img.onload = ()=>{ const ph=root.querySelector('#lw-ov-ph'); if (ph) ph.remove(); $img.style.display='block'; };
    $img.onerror = showPh;
    if (!url) { showPh(); } else { $img.src = url; }
    Array.from($thumbs.querySelectorAll('img')).forEach((im,i)=>im.classList.toggle('active', i===idx));
    // preload neighbors
    [ (idx+1)%S.items.length, (idx-1+S.items.length)%S.items.length ].forEach(i=>{
      const u = S.items[i]?.fullSizeUrl || getFullSizeImageUrl(S.items[i]?.thumbnailUrl||''); if(u){ const im=new Image(); im.src=u; }
    });
  }
  function open(items, startIndex){
    S.items = items||[]; S.idx = Math.max(0, Math.min(startIndex||0, S.items.length-1));
    // thumbs
    $thumbs.innerHTML = '';
    S.items.forEach((it,i)=>{
      const container = document.createElement('div');
      container.style.position = 'relative';

      const im = document.createElement('img');
      const src0 = it.thumbnailUrl || it.fullSizeUrl || '';
      if (src0){
        im.src = src0;
        // שבירה → הצג placeholder טקסט קטן
        im.onerror = ()=>{ im.onerror=null; im.src = buildThumbPlaceholder(it.productName||''); };
      } else {
        im.src = buildThumbPlaceholder(it.productName||'');
      }
      im.alt = it.productName || '';
      im.title = it.productName || '';
      im.onclick = ()=>load(i);

      container.appendChild(im);

      // === Quantity badge (overlay thumbnails) ===
      // השתמש בכמות שכבר חושבה ונשמרה ב-overlay item
      const qty = (it.quantity && Number.isFinite(+it.quantity) && +it.quantity > 0) ? +it.quantity : 0;
      if (qty > 1){
        const badge = document.createElement('span');
        badge.className = 'lw-thumb-badge';
        badge.style.transform = 'scale(0.9)'; /* מעט קטן יותר בשורת התחתית */
        badge.textContent = 'X' + qty;
        container.appendChild(badge);
      }

      $thumbs.appendChild(container);
    });
    root.classList.add('active'); load(S.idx);
  }
  // סגירה בלחיצה מחוץ לקופסה
  root.addEventListener('click', (e)=>{ if(e.target.id==='lw-overlay') root.classList.remove('active'); });
  // RTL: הבא בצד שמאל, הקודם בצד ימין
  root.querySelector('#lw-ov-next').onclick = ()=>load((S.idx+1)%S.items.length);
  root.querySelector('#lw-ov-prev').onclick = ()=>load((S.idx-1+S.items.length)%S.items.length);
  root.querySelector('#lw-ov-close').onclick = ()=>root.classList.remove('active');
  document.addEventListener('keydown', (ev)=>{ if(!root.classList.contains('active')) return; if(ev.key==='Escape') root.classList.remove('active'); if(ev.key==='ArrowLeft') root.querySelector('#lw-ov-prev').click(); if(ev.key==='ArrowRight') root.querySelector('#lw-ov-next').click(); });
  // העתקות עם fa-clone (כמו toolbox)
  function copy(txt){ try{ navigator.clipboard.writeText(String(txt||'')); }catch(_){ } }
  root.querySelector('#lw-copy-name').onclick = ()=>copy(S.items[S.idx]?.productName||'');
  root.querySelector('#lw-copy-sku').onclick  = ()=>copy(S.items[S.idx]?.sku||'');
  window.__LW_OV = { show: open };

  // גלילת thumbnails בדסקטופ: גלגלת, גרירה, חיצים
  $thumbs.addEventListener('wheel', (e)=>{
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.preventDefault(); $thumbs.scrollLeft += e.deltaY; }
  }, {passive:false});
  let isDrag=false, moved=false, startX=0, startLeft=0;
  $thumbs.addEventListener('pointerdown', (e)=>{
    if (e.button !== 0 && e.pointerType !== 'touch') return; // רק כפתור שמאלי/מגע
    isDrag = true; moved = false;
    startX = e.clientX; startLeft = $thumbs.scrollLeft;
    $thumbs.classList.add('dragging');
  });
  $thumbs.addEventListener('pointermove', (e)=>{
    if(!isDrag) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 3) moved = true;
    $thumbs.scrollLeft = startLeft - dx;
    e.preventDefault(); // מניעת בחירת טקסט
  });
  const endDrag = ()=>{ isDrag=false; $thumbs.classList.remove('dragging'); };
  $thumbs.addEventListener('pointerup', endDrag);
  $thumbs.addEventListener('pointercancel', endDrag);
  $thumbs.addEventListener('mouseleave', endDrag);
  $thumbPrev.onclick = ()=> $thumbs.scrollBy({left:  320, behavior:'smooth'}); // RTL: prev מימין => גלילה ימינה
  $thumbNext.onclick = ()=> $thumbs.scrollBy({left: -320, behavior:'smooth'});
}

function showGalleryOverlay(items, startIndex){
  try{
    ensureLocalOverlay();
    if (window.__LW_OV){ window.__LW_OV.show(items, startIndex||0); return; }
  }catch(e){ console.warn('Local overlay fallback failed', e); }
  const fallback = items?.[startIndex||0];
  const url = fallback?.fullSizeUrl || getFullSizeImageUrl(fallback?.thumbnailUrl || '');
  if (url) window.open(url, '_blank', 'noopener');
}

        // --- Helper: full image url (מימוש יחיד) ---
        function toFullImageUrl(url){
          // קודם המימוש המקומי, ואם אינו קיים – גלובלי (toolbox), ולבסוף מקורי
          if (typeof getFullSizeImageUrl === 'function') return getFullSizeImageUrl(url);
          const f = (window.getFullSizeImageUrl || window.TOOLBOX_getFullSizeImageUrl);
          if (f) return f(url);
          // fallback עדין: הסרת פרמטרי רסייז נפוצים
          try{
            const u = new URL(url, location.href);
            ['w','h','fit','crop'].forEach(k=>u.searchParams.delete(k));
            return u.toString();
          }catch(_){ return url || ''; }
        }

        function safeFindImageMatch(barcode, name){
          const fim = (window.findImageMatch || window.TOOLBOX_findImageMatch);
          try{ return fim ? fim(barcode, name) : null; }catch(_){ return null; }
        }

        function safeFindBarcode(skuOrBarcode, name){
          const fb = (window.findBarcode || window.TOOLBOX_findBarcode);
          try{ return fb ? fb(skuOrBarcode, name) : skuOrBarcode; }catch(_){ return skuOrBarcode; }
        }

        // ------------------ Master catalog functions ------------------
        function csvParseSmart(text){
          // Parser קטן שתומך במרכאות
          const rows = [];
          let row = [], val = '', inQ = false;
          for (let i=0;i<text.length;i++){
            const c = text[i], n = text[i+1];
            if (inQ){
              if (c === '"' && n === '"'){ val += '"'; i++; continue; }
              if (c === '"'){ inQ = false; continue; }
              val += c; continue;
            }
            if (c === '"'){ inQ = true; continue; }
            if (c === ','){ row.push(val); val=''; continue; }
            if (c === '\n'){ row.push(val); rows.push(row); row=[]; val=''; continue; }
            if (c === '\r'){ continue; }
            val += c;
          }
          if (val.length || row.length) { row.push(val); rows.push(row); }
          return rows;
        }

        function normalizeSku(x){ return (x||'').toString().trim().toUpperCase(); }
        function normalizeBarcode(x){ return (x||'').toString().replace(/\D+/g,''); }

        function pickHeaderIdx(headers, candidates){
          const h = headers.map(s => s.trim().toLowerCase());
          for (const cand of candidates){
            const idx = h.indexOf(cand);
            if (idx !== -1) return idx;
          }
          return -1;
        }

        async function loadMasterCatalog(){
          return new Promise(async resolve => {
            if (masterCatalogReady) return resolve(true);
            try {
              const csvText = await gmGetWithETag(MASTER_CSV_URL, 'master_csv_v1');
              const res = { responseText: csvText };
                try{
                  const rows = csvParseSmart(res.responseText || '');
                  if (!rows.length) { console.warn('[MissingTable] master: empty'); return resolve(false); }
                  const headers = rows.shift();
                  // master CSV expected columns (flexible headers)
                  // Product URL | Image URL | SKUs | Product Name
                  const iImg = pickHeaderIdx(headers, ['image url','image_url','image','img','thumbnail','thumb']);
                  const iSku = pickHeaderIdx(headers, ['skus','sku','makt','מק"ט','מק״ט','productcode','code']);
                  const iUrl = pickHeaderIdx(headers, ['product url','product_url','product link','product','url']);
                  if (iSku === -1) {
                    console.warn('[MissingTable] master: required column SKUs not found');
                    return resolve(false);
                  }
                  let added = 0;
                  for (const r of rows) {
                    const img = iImg !== -1 ? (r[iImg] || '').toString().trim() : '';
                    const purl = iUrl !== -1 ? (r[iUrl] || '').toString().trim() : '';
                    if (!img && !purl) continue;
                    const skusRaw = (r[iSku] || '').toString();
                    // דוגמה: "2451, 7290117440575" → פיצול לפסיקים/רווחים
                    const tokens = skusRaw.split(/[,\s]+/).map(t => t.trim()).filter(Boolean);
                    for (const tok of tokens) {
                      const skuKey = normalizeSku(tok);
                      const bcKey  = normalizeBarcode(tok);
                      if (img) {
                        if (skuKey) { masterSkuToImage.set(skuKey, img); added++; }
                        if (bcKey)  { masterBarcodeToImage.set(bcKey, img); added++; }
                      }
                      if (purl) {
                        if (skuKey) masterSkuToUrl.set(skuKey, purl);
                        if (bcKey)  masterBarcodeToUrl.set(bcKey, purl);
                      }
                    }
                  }
                  masterCatalogReady = true;
                  console.log(`[MissingTable] master loaded ✓  sku→image: ${masterSkuToImage.size}, bc→image: ${masterBarcodeToImage.size}, sku→url: ${masterSkuToUrl.size}, bc→url: ${masterBarcodeToUrl.size}, added=${added}`);
                  resolve(true);
                }catch(e){ console.error('[MissingTable] master load error', e); resolve(false); }
            } catch(e) {
              console.error('[MissingTable] master load error', e);
              resolve(false);
            }
          });
        }

        async function ensureImagesReady(){
          // נשתמש אך ורק במאסטר (לא ב-toolbox)
          if (!masterCatalogReady) await loadMasterCatalog();
          return true;
        }

        function findImageForItemViaMaster(item){
          // חפש קודם לפי מק"ט; אם אין — תרגם ברקוד→מק"ט; וגם בדוק ישירות לפי ברקוד
          const bcRaw = item?.barcode;
          const bc    = normalizeBarcode(bcRaw);
          let   sku   = normalizeSku(item?.makt || item?.sku);
          // Fast lookup with Map (fallback to object if Map not present)
          if (!sku && bc) {
            sku = (window.__skuBarcodeMap instanceof Map
                ? window.__skuBarcodeMap.get(String(bc).trim())
                : (barcodeToMaktMap && barcodeToMaktMap[bc])) || '';
            if (sku) sku = normalizeSku(sku);
          }
          if (sku && masterSkuToImage.has(sku)) {
            return { url: masterSkuToImage.get(sku), by: 'SKU', key: sku };
          }
          if (bc  && masterBarcodeToImage.has(bc)) {
            return { url: masterBarcodeToImage.get(bc), by: 'BARCODE', key: bc };
          }
          return null;
        }

        function findImageForItem(item){
          // מסלול יחיד: מאסטר CSV
          const hit = findImageForItemViaMaster(item);
          if (hit) {
            console.debug('[MissingTable] image match', {by: hit.by, key: hit.key, url: hit.url, name: item?.name});
            return hit.url;
          }
          console.debug('[MissingTable] image NOT found', {barcode: item?.barcode, makt: item?.makt || item?.sku, name: item?.name});
          return null;
        }

        /**
         * Loads catalog data from a CSV file.
         * @returns {Promise<void>} A promise that resolves when data is loaded, or rejects on error.
         */
        async function loadCatalogData() {
            console.log('📁 טוען נתוני קטלוג מ-CSV...');
            console.log('🔗 URL:', CSV_URL);

            try {
                // Use new validator-aware fetch if URL matches
                if (CSV_URL === CONFIG.CATALOG_URL) {
                    const resp = await fetchWithValidators(CONFIG.CATALOG_URL);
                    if (resp.ok) {
                        const csvText = await resp.text();
                        const catalogRows = await parseCsvSmart(csvText);
                        // prefer Map for lookups
                        window.__skuBarcodeMap = buildSkuBarcodeMap(catalogRows, "קוד פריט", "ברקוד");
                        // Keep backward compatibility
                        catalogData = {};
                        barcodeToMaktMap = {};
                        for (const row of catalogRows) {
                            if (row['תאור פריט']) {
                                catalogData[row['תאור פריט']] = {
                                    barcode: row['ברקוד'] || '',
                                    makt: row['קוד פריט'] || ''
                                };
                            }
                            if (row['קוד פריט'] && row['ברקוד']) {
                                barcodeToMaktMap[row['ברקוד']] = row['קוד פריט'];
                            }
                        }
                        console.log('✅ נתוני קטלוג נטענו בהצלחה (חדש):', Object.keys(catalogData).length, 'פריטים');
                        return;
                    }
                }

                // Fallback to old method
                const csvText = await gmGetWithETag(CSV_URL, 'catalog_csv_v1');
                return new Promise((resolve, reject) => {
                    try {
                        const newCatalogData = {};
                        const maktToBarcodeMap = {}; // מיפוי חדש: מק"ט -> ברקוד
                        barcodeToMaktMap = {}; // מיפוי הפוך: ברקוד -> מק"ט (גלובלי)
                        const lines = csvText.split('\n');
                        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
                        const barcodeIndex = headers.indexOf('ברקוד');
                        const descriptionIndex = headers.indexOf('תאור פריט');
                        const maktIndex = headers.indexOf('קוד פריט');

                        if (barcodeIndex === -1 || descriptionIndex === -1 || maktIndex === -1) {
                            throw new Error('חסרות עמודות נדרשות (ברקוד, תאור פריט, קוד פריט) בקובץ ה-CSV.');
                        }

                        for (let i = 1; i < lines.length; i++) {
                            const line = lines[i].trim();
                            if (!line) continue;

                            const cells = [];
                            let inQuote = false;
                            let currentCell = '';
                            for (let char of line) {
                                if (char === '"') {
                                    inQuote = !inQuote;
                                } else if (char === ',' && !inQuote) {
                                    cells.push(currentCell.trim());
                                    currentCell = '';
                                } else {
                                    currentCell += char;
                                }
                            }
                            cells.push(currentCell.trim());

                            const description = cells[descriptionIndex] ? cells[descriptionIndex].replace(/"/g, '') : '';
                            const barcode = cells[barcodeIndex] ? cells[barcodeIndex].replace(/"/g, '') : '';
                            const makt = cells[maktIndex] ? cells[maktIndex].replace(/"/g, '') : '';

                            if (description) {
                                newCatalogData[description] = { barcode: barcode, makt: makt };
                            }

                            // הוסף למיפוי מק"ט -> ברקוד
                            if (makt && barcode) {
                                maktToBarcodeMap[makt] = barcode;
                                barcodeToMaktMap[barcode] = makt; // חדש: תרגום ברקוד→מק"ט
                            }
                        }
                        catalogData = newCatalogData;
                        catalogData.maktToBarcodeMap = maktToBarcodeMap; // שמור את המיפוי החדש
                        catalogData.barcodeToMaktMap = barcodeToMaktMap; // חדש
                        console.log('✅ נתוני קטלוג נטענו בהצלחה:', Object.keys(catalogData).length, 'פריטים');
                        console.log('🔗 מיפוי מק"ט לברקוד:', Object.keys(maktToBarcodeMap).length, 'ערכים');
                        resolve();
                    } catch (e) {
                        console.error('שגיאה בניתוח קובץ CSV:', e);
                        reject(new Error('שגיאה בניתוח קובץ קטלוג: ' + e.message));
                    }
                });
            } catch (e) {
                console.error('שגיאה בטעינת קובץ CSV:', e);
                reject(new Error('שגיאה בטעינת קובץ קטלוג.'));
            }
        }

        // Check if the button already exists to prevent duplication
        if (document.getElementById('extract-missing-button')) {
            console.log('⚠️ כפתור "הצג חוסרים" כבר קיים, עוצר.');
            return;
        }

        console.log('✅ סקריפט טבלת חוסרים נטען בהצלחה!');
        console.log('🎯 כפתורי "חוסרים" ו"נגטיב" נוספו לדף');

        // Find the toolbar to append the new button
        const toolbar = document.querySelector('.d-flex.justify-content-sm-end');
        const targetButton = document.querySelector('.order-items-btn.order-items-summary-btn');
        const rightmostButton = document.querySelector('#kt_subheader > div > div.d-flex.justify-content-sm-end.justify-content-start.align-items-stretch.flex-wrap > a:nth-child(4)');

        if (!toolbar) {
            console.warn('⚠️ לא נמצא סרגל הכלים להוספת הכפתור.');
            return;
        }

        // Create the segmented control button
        const btn = document.createElement('div');
        btn.id = 'extract-missing-button';
        btn.className = 'btn-group btn-group-sm m-1';

        // Left part - "נגטיב"
        const leftBtn = document.createElement('button');
        leftBtn.className = 'btn btn-light-primary';
        leftBtn.textContent = 'נגטיב';
        leftBtn.id = 'negative-btn';

        // Right part - "חוסרים"
        const rightBtn = document.createElement('button');
        rightBtn.className = 'btn btn-light-primary';
        rightBtn.textContent = 'חוסרים';
        rightBtn.id = 'missing-btn';

        btn.appendChild(rightBtn);
        btn.appendChild(leftBtn);

        console.log('🔘 כפתורי "חוסרים" ו"נגטיב" נוצרו');

        // Function to update button styles based on current mode
        const updateButtonStyles = () => {
            if (currentMode === 'negative') {
                leftBtn.classList.add('active');
                rightBtn.classList.remove('active');
            } else {
                leftBtn.classList.remove('active');
                rightBtn.classList.add('active');
            }
        };

        // Set initial state - "חוסרים" is default but both buttons start light blue
        currentMode = 'missing';
        // Don't call updateButtonStyles() initially - let both buttons stay light blue

        // Event listeners for both buttons
        leftBtn.addEventListener('click', () => {
            currentMode = 'negative';
            updateButtonStyles();
            handleButtonClick();
        });

        rightBtn.addEventListener('click', () => {
            currentMode = 'missing';
            updateButtonStyles();
            handleButtonClick();
        });

        // Insert the button into the toolbar
        if (targetButton && targetButton.parentNode) {
            console.log('📍 ממקם את הכפתור אחרי הכפתור order-items-summary-btn');
            targetButton.parentNode.insertBefore(btn, targetButton.nextSibling);
        } else if (rightmostButton && rightmostButton.parentNode) {
            console.log('📍 ממקם את הכפתור לפני הכפתור הימני ביותר');
            rightmostButton.parentNode.insertBefore(btn, rightmostButton);
        } else {
            console.log('📍 ממקם את הכפתור בסוף סרגל הכלים');
            toolbar.appendChild(btn);
        }

        console.log('✅ כפתורי "חוסרים" ו"נגטיב" נוספו לסרגל הכלים בהצלחה');

        /**
         * Handles the click event for the "Show Missing Items" button.
         */
        const handleButtonClick = async () => {
            console.log('🔘 כפתור "הצג חוסרים" נלחץ!');
            console.log('🎯 מצב נוכחי:', currentMode === 'negative' ? 'נגטיב' : 'חוסרים');

            // ============ התיקון כאן ============
            // הגדר את המשתנה הגלובלי שהפונקציה getItemQuantity
            // קוראת כדי לדעת באיזה מצב אנחנו
            window.__missingTableMode = currentMode;
            // ===================================

            btn.removeEventListener('click', handleButtonClick); // Prevent multiple clicks
            btn.disabled = true;

            // Show loading indicator immediately
            const backdrop = document.createElement('div');
            backdrop.className = 'modal-backdrop fade show';
            document.body.appendChild(backdrop);
            console.log('🎭 Backdrop של הלודר נוצר');

            const loader = document.createElement('div');
            loader.id = 'loading-msg';
            loader.innerHTML = `
                <div class="position-fixed w-100 h-100 d-flex justify-content-center align-items-center" style="z-index: 9999; top: 0; left: 0;">
                    <div class="spinner-border text-primary" role="status" style="width: 3rem; height: 3rem;">
                        <span class="sr-only">טוען...</span>
                    </div>
                </div>
            `;
            document.body.appendChild(loader);

            // NEW: best-effort – apply "בטיפול" filter before building the table
            await applyTreatmentFilterIfExists();

            if (catalogData === null) {
                try {
                    await loadCatalogData();
                } catch (e) {
                    showMessageModal('שגיאה', e.message, true);
                    console.error(e);
                    // Clean up loading indicator
                    const existingLoader = document.getElementById('loading-msg');
                    const existingBackdrop = document.querySelector('.modal-backdrop.fade.show');
                    if (existingLoader && existingLoader.parentNode) existingLoader.remove();
                    if (existingBackdrop && existingBackdrop.parentNode) existingBackdrop.remove();
                    btn.addEventListener('click', handleButtonClick);
                    btn.disabled = false;
                    return;
                }
            }
            await startMissingTable();
            btn.addEventListener('click', handleButtonClick); // Re-enable listener after operation
            btn.disabled = false;
        };

        btn.addEventListener('click', handleButtonClick);
        console.log('🎯 מאזין לחיצה נוסף לכפתור');

        /**
         * Starts the process of fetching and displaying the missing items table.
         */
        // Helper functions for rate limiting and retry logic
        function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

        function parseRetryAfter(res) {
            const ra = res.headers.get('retry-after');
            if (!ra) return null;
            const s = Number(ra);
            if (!Number.isNaN(s)) return s * 1000;
            const when = Date.parse(ra);
            return Number.isNaN(when) ? null : Math.max(0, when - Date.now());
        }

        // מערכת תור משופרת עם jitter ו-backoff חכם
        function createQueue({maxConcurrent=5, minDelayMs=120, maxDelayMs=240}={}){
            let active = 0;
            const q = [];
            const nap = ms => new Promise(r => setTimeout(r, ms));
            const jitter = () => minDelayMs + Math.random()*(maxDelayMs-minDelayMs);

            const runNext = async () => {
                if (active >= maxConcurrent || !q.length) return;
                const job = q.shift();
                active++;
                try {
                    await job.fn();
                } finally {
                    active--;
                    if (maxDelayMs) await nap(jitter());
                    runNext();
                }
            };

            return fn => new Promise((resolve, reject)=>{
                q.push({ fn: () => fn().then(resolve, reject) });
                runNext();
            });
        }

        async function fetchDocWithBackoff(url, opts={}, {maxRetries=4}={}){
            let attempt=0, wait=600;
            while (true){
                try{
                    const res = await fetch(url, { credentials: "include", ...opts });
                    if (res.status === 429) {
                        const ra = res.headers.get('Retry-After');
                        throw { retry:true, delay: ra ? (+ra*1000||wait) : wait };
                    }
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const text = await res.text();
                    return new DOMParser().parseFromString(text, 'text/html');
                }catch(e){
                    if (attempt++ >= maxRetries) throw e;
                    const delay = (e.delay || wait) + Math.random()*250;
                    await new Promise(r=>setTimeout(r, delay));
                    wait = Math.min(8000, wait*2);
                }
            }
        }

        async function fetchTaskPanelView(id, csrfToken, attempt = 0) {
            const res = await fetch(`/tasks/${id}/panel_view`, {
                method: 'POST',
                headers: {
                    'accept': '*/*',
                    'content-type': 'application/json',
                    'x-csrf-token': csrfToken
                },
                credentials: 'include'
            });
            if (res.status === 429) {
                const retryMsFromHeader = parseRetryAfter(res);
                const base = retryMsFromHeader ?? Math.min(60000 * Math.pow(2, attempt), 300000);
                const jitter = Math.floor(Math.random() * 1000);
                const wait = base + jitter;
                console.warn(`429 עבור ${id}, המתנה ${wait}ms ואז מנסים שוב`);
                await sleep(wait);
                return fetchTaskPanelView(id, csrfToken, attempt + 1);
            }
            if (!res.ok) {
                const msg = await res.text();
                throw new Error(`HTTP ${res.status} עבור ${id}, ${msg.substring(0, 200)}`);
            }
            const html = await res.text();
            return { html, id };
        }

        async function startMissingTable() {
            console.log('🚀 פונקציית startMissingTable החלה');
            console.log('📊 מצב:', currentMode === 'negative' ? 'נגטיב' : 'חוסרים');

            // התחל ריצה חדשה עם AbortController
            const ctrl = startRun();

            if (document.getElementById('missing-items-modal')) {
                console.log('⚠️ מודל חוסרים כבר פתוח, עוצר.');
                return;
            }

            // Loading indicator already shown in handleButtonClick

            const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
            if (!csrfToken) {
                console.error('שגיאה: CSRF Token לא נמצא.');
                showMessageModal('שגיאה', 'שגיאה: לא ניתן לטעון נתונים. חסר אסימון אבטחה (CSRF Token).', true);
                // Clean up loading indicator
                const existingLoader = document.getElementById('loading-msg');
                const existingBackdrop = document.querySelector('.modal-backdrop.fade.show');
                if (existingLoader && existingLoader.parentNode) existingLoader.remove();
                if (existingBackdrop && existingBackdrop.parentNode) existingBackdrop.remove();
                return;
            }
            console.log('🔐 CSRF Token נמצא');

            const allTaskIds = [...new Set(
                [...document.querySelectorAll('[data-task-id]')].map(e => e.getAttribute('data-task-id'))
            )];

            console.log('📋 מזהי משימות (Task IDs) שנמצאו בדף:', allTaskIds);
            if (allTaskIds.length === 0) {
                console.warn('⚠️ לא נמצאו מזהי משימות (Task IDs) בדף הנוכחי. ייתכן שאין הזמנות או שהמבנה השתנה.');
                showMessageModal('שים לב', 'לא נמצאו הזמנות לטיפול בדף זה. וודא שאתה נמצא בדף המתאים.');
                // Clean up loading indicator
                const existingLoader = document.getElementById('loading-msg');
                const existingBackdrop = document.querySelector('.modal-backdrop.fade.show');
                if (existingLoader && existingLoader.parentNode) existingLoader.remove();
                if (existingBackdrop && existingBackdrop.parentNode) existingBackdrop.remove();
                return;
            }

            // סינון מראש של משימות מיותרות
            const tasksToFetch = allTaskIds
                .map(id => ({ id, region: getRegionFromMainTable(id) }))
                .filter(t => t.region !== null); // דילוג על פסולים

            const taskIds = tasksToFetch.map(t => t.id);
            const excludedCount = allTaskIds.length - taskIds.length;

            if (excludedCount > 0) {
                console.log(`🚫 דילגנו על ${excludedCount} משימות עם איזור חריג`);
            }

            console.log(`📋 נמשיך עם ${taskIds.length} משימות (מתוך ${allTaskIds.length})`);

            const excludedBarcodes = ['10000', '491', '1948', '1949', '555503', '2543'];
            const fetchedRawItems = []; // Temporary array to hold raw fetched item data with their task statuses

            try {
                // מערכת תור משופרת עם jitter ו-backoff חכם
                const schedule = createQueue({maxConcurrent: 5, minDelayMs: 120, maxDelayMs: 240});

                // בדיקת קאש לפני fetch
                const tasksToProcess = [];
                for (const id of taskIds) {
                    const ver = getUpdatedAtFromRow(id);
                    const cached = readTaskFromCache(id, ver);
                    if (cached) {
                        console.log(`📦 משתמש בקאש עבור Task ${id}`);
                        fetchedRawItems.push(cached);
                    } else {
                        tasksToProcess.push(id);
                    }
                }

                console.log(`📦 ${fetchedRawItems.length} משימות מהקאש, ${tasksToProcess.length} משימות חדשות`);

                // תזמון רק המשימות החדשות דרך התור החדש
                const taskScheduler = pLimit(CONFIG.FETCH_CONCURRENCY);
                const jobs = [];
                for (let i = 0; i < tasksToProcess.length; i++) {
                    const id = tasksToProcess[i];
                    jobs.push(taskScheduler(async () => {
                        if (ctrl.signal.aborted) return; // אל תמשיך לעבד תוצאה של ריצה קודמת
                        try {
                            const { html, id: taskId } = await fetchTaskPanelView(id, csrfToken);
                            if (ctrl.signal.aborted) return;
                            const ver = getUpdatedAtFromRow(id);
                            const data = { html, id: taskId };
                            writeTaskToCache(id, ver, data);
                            fetchedRawItems.push(data);
                        } catch (err) {
                            console.error(`כשל ב-Task ${id}, ממשיכים`, err);
                        }
                        // Keep the UI responsive
                        await maybeYield(i);
                    }));
                }
                await Promise.allSettled(jobs);

                // מכאן והלאה תשאיר את הלוגיקה הקיימת שמפרקת HTML וממפה סטטוסים, בדיוק כמו היום
                const responses = fetchedRawItems;
                console.log('✅ כל בקשות ה-fetch הושלמו');

                if (ctrl.signal.aborted) return; // בדיקה נוספת לפני עיבוד

                responses.forEach(({ html, id: taskId }) => {
                    const doc = new DOMParser().parseFromString(html, 'text/html');

                    if (!doc || !doc.body) {
                        console.warn(`Warning: Could not parse HTML for Task ID: ${taskId}. Raw HTML (first 500 chars): ${html.substring(0, 500)}...`);
                        return;
                    }

                    const dateSpans = doc.querySelectorAll('div.col-xxl-7.col-6 > span');
                    let dateTime = '';
                    for (const span of dateSpans) {
                        const txt = span.textContent.trim();
                        if (/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/.test(txt)) {
                            dateTime = txt;
                            break;
                        } else if (/^\d{2}\/\d{2}\/\d{4}/.test(txt)) {
                            dateTime = `${txt} 00:00`;
                            break;
                        }
                    }
                    console.log(`Task ID: ${taskId}, Date/Time found: ${dateTime || 'N/A'}`);

                    // --- Extract overall task status ---
                    let taskOverallStatus = 'UNKNOWN'; // Default to unknown
                    let rawTaskStatusText = '';

                    // Define a comprehensive mapping from display text / data-new-status to internal English constants
                    const statusMapping = {
                        "NEW": "NEW", "PENDING": "PENDING", "PARTIALLY_PICKED": "PARTIALLY_PICKED",
                        "PICKED": "PICKED", "COMPLETED": "COMPLETED", "CANCELED": "CANCELED",
                        "FAILED": "FAILED", "MISSING": "MISSING", // For items where 'חסר' is the direct status
                        "ASSIGNED": "ASSIGNED", "UNASSIGNED": "UNASSIGNED", "ACTIVE": "ACTIVE",
                        "IN_INVENTORY": "IN_INVENTORY", "OUT_INVENTORY": "OUT_INVENTORY", "IN_TRANSFER": "IN_TRANSFER",
                        // Hebrew mappings
                        "חדש": "NEW", "המתנה": "PENDING", "לוקט חלקית": "PARTIALLY_PICKED",
                        "לוקט": "PICKED", "חסר": "MISSING", "אושר": "ASSIGNED", "טרם אושר": "UNASSIGNED",
                        "נאסף": "ACTIVE", "בוצע": "COMPLETED", "בוטל": "CANCELED", "נכשל": "FAILED",
                        "במחסן": "IN_INVENTORY", "יצא ממחסן": "OUT_INVENTORY", "בהעברה": "IN_TRANSFER",
                    };

                    // --- NEW AND IMPROVED STATUS EXTRACTION LOGIC ---
                    // Attempt 1: Get status from the main button's pick-status-text span in panel_view
                    const mainPanelStatusTextElement = doc.querySelector(`.task-pick-status-dropdown-${taskId} > button.pick-status > span.pick-status-text`);
                    if (mainPanelStatusTextElement && mainPanelStatusTextElement.textContent.trim()) {
                        rawTaskStatusText = mainPanelStatusTextElement.textContent.trim();
                        taskOverallStatus = statusMapping[rawTaskStatusText] || rawTaskStatusText;
                        console.log(`Task ID: ${taskId} | Found main panel status text: '${rawTaskStatusText}' -> mapped to '${taskOverallStatus}'`);
                    } else {
                        // Attempt 2: Get status from the main button's data-new-status attribute in panel_view
                        const mainPanelStatusButton = doc.querySelector(`.task-pick-status-dropdown-${taskId} > button.pick-status`);
                        if (mainPanelStatusButton && mainPanelStatusButton.dataset.newStatus) {
                            rawTaskStatusText = mainPanelStatusButton.dataset.newStatus;
                            taskOverallStatus = statusMapping[rawTaskStatusText] || rawTaskStatusText;
                            console.log(`Task ID: ${taskId} | Found main panel status data-new-status: '${rawTaskStatusText}' -> mapped to '${taskOverallStatus}'`);
                        } else {
                            // Attempt 3: Get status from the badge's pick-status-text span (from order list page structure, if somehow loaded in panel_view)
                            const mainListStatusTextElement = doc.querySelector(`.task-pick-status-dropdown-${taskId} > span.pick-status.badge > span.pick-status-text`);
                            if (mainListStatusTextElement && mainListStatusTextElement.textContent.trim()) {
                                rawTaskStatusText = mainListStatusTextElement.textContent.trim();
                                taskOverallStatus = statusMapping[rawTaskStatusText] || rawTaskStatusText;
                                console.log(`Task ID: ${taskId} | Found list-style status text: '${rawTaskStatusText}' -> mapped to '${taskOverallStatus}'`);
                            } else {
                                // Attempt 4: Get status from any dropdown LI's data-new-status if it's explicitly marked as selected/active
                                const selectedDropdownLi = doc.querySelector(`.task-pick-status-dropdown-${taskId} ul.dropdown-menu li.pick-status-selected, .task-pick-status-dropdown-${taskId} ul.dropdown-menu li.active`); // Or look for `pick-status-pending` or similar dynamic classes.
                                if (selectedDropdownLi && selectedDropdownLi.dataset.newStatus) {
                                    rawTaskStatusText = selectedDropdownLi.dataset.newStatus;
                                    taskOverallStatus = statusMapping[rawTaskStatusText] || rawTaskStatusText;
                                    console.log(`Task ID: ${taskId} | Found selected dropdown LI status data-new-status: '${rawTaskStatusText}' -> mapped to '${taskOverallStatus}'`);
                                } else {
                                    // Last resort: Try to find a data-new-status that is NOT 'UNASSIGNED' from the dropdown list.
                                    // This assumes that if it's not UNASSIGNED, it's the current state.
                                    const specificStatusLi = doc.querySelector(`.task-pick-status-dropdown-${taskId} ul.dropdown-menu li[data-new-status]:not([data-new-status="UNASSIGNED"])`);
                                    if (specificStatusLi && specificStatusLi.dataset.newStatus) {
                                        rawTaskStatusText = specificStatusLi.dataset.newStatus;
                                        taskOverallStatus = statusMapping[rawTaskStatusText] || rawTaskStatusText;
                                        console.log(`Task ID: ${taskId} | Found non-UNASSIGNED status from dropdown LI: '${rawTaskStatusText}' -> mapped to '${taskOverallStatus}'`);
                                    }
                                }
                            }
                        }
                    }
                    console.log(`Task ID: ${taskId} | Final Internal Task Status (after all attempts): '${taskOverallStatus}'`);

                    // Get destination region using the new function
                    const destinationRegion = getDestinationRegion(taskId, doc);
                    if (destinationRegion === null) {
                        console.log(`Task ID: ${taskId} | Skipping task due to excluded region`);
                        return; // Skip this task entirely
                    }

                    const rows = doc.querySelectorAll('table tbody tr');
                    if (rows.length === 0) {
                        console.log(`Task ID: ${taskId}, No item rows found in table tbody.`);
                    }
                    rows.forEach((row, index) => {
                        const cells = row.querySelectorAll('td');
                        if (cells.length < 5) return;

                        let name = (cells[2]?.innerText || '').trim();
                        let barcode = (cells[1]?.innerText || '').replace(/\s/g, '');
                        const statusText = cells[4]?.innerText.trim();

                        // Extract price from the 6th column (index 5)
                        let price = '';
                        if (cells[5]) {
                            price = (cells[5]?.innerText || '').trim();
                        }

                        // Strict filtering rules - keep existing checks
                        if (!name || !statusText || !statusText.includes('/')) {
                            console.log(`Filtering out item (invalid data format): ${name} | Status Text: '${statusText}'`);
                            return;
                        }

                        const [picked, total] = statusText.split('/').map(s => parseInt(s.trim()));

                        // Additional check that total is a positive number and picked is less than total
                        if (isNaN(picked) || isNaN(total) || total <= 0) {
                            console.log(`Filtering out item (invalid quantities): ${name} | Picked: ${picked} | Total: ${total}`);
                            return;
                        }

                        // Original "מתנה" filter, now less critical due to overall status filter but kept for specific item handling if needed
                        if (name.includes('מתנה')) {
                            console.log(`Filtering out item (name contains 'מתנה'): ${name}`);
                            return;
                        }
                        if (name.includes('משלוח')) {
                            console.log(`Filtering out item (name contains 'משלוח'): ${name}`);
                            return;
                        }
                        if (excludedBarcodes.includes(barcode)) {
                            console.log(`Filtering out item (excluded barcode): ${name} | Barcode: ${barcode}`);
                            return;
                        }

                        let makt = '';
                        const originalBarcode = barcode; // שמור את המק"ט המקורי

                        // קודם ננסה למצוא לפי המק"ט הקיים (Map או Object)
                        let catalogBarcode = '';
                        if (window.__skuBarcodeMap instanceof Map) {
                            catalogBarcode = window.__skuBarcodeMap.get(String(originalBarcode).trim()) || '';
                        } else if (catalogData && catalogData.maktToBarcodeMap) {
                            catalogBarcode = catalogData.maktToBarcodeMap[originalBarcode] || '';
                        }

                        if (catalogBarcode && catalogBarcode.trim() !== '') {
                            barcode = catalogBarcode;
                            console.log(`עודכן ברקוד לפי מק"ט "${originalBarcode}": ${barcode}`);
                        }
                        // אם לא נמצא לפי מק"ט, ננסה לפי שם המוצר
                        else if (catalogData && catalogData[name]) {
                            const catalogBarcode = catalogData[name].barcode;
                            if (catalogBarcode && catalogBarcode.trim() !== '') {
                                barcode = catalogBarcode;
                                console.log(`עודכן ברקוד לפי שם "${name}": ${barcode}`);
                            }
                            makt = catalogData[name].makt;
                        }

                        // Determine the actual item status from the page structure
                        // This is the individual item's *display* status, not the overall task status.
                        let itemStatus = '';
                        const itemStatusSpan = cells[4]?.querySelector('.pick-status-text');
                        if (itemStatusSpan) {
                            itemStatus = itemStatusSpan.textContent.trim();
                        } else {
                            // Fallback to old status logic if span not found
                            itemStatus = (total - picked) === total ? 'חסר' : 'לוקט חלקית';
                        }

                        // Add item to fetched raw results, including task's overall status
                        fetchedRawItems.push({
                            taskId,
                            date: dateTime.split(' ')[0],
                            time: dateTime.split(' ')[1],
                            fullDateTime: dateTime,
                            barcode,
                            name,
                            picked,
                            total,
                            missing: total - picked,
                            status: itemStatus, // This is the individual item's display status (Hebrew)
                            taskOverallStatus: taskOverallStatus, // This is the overall order status (English mapping from above)
                            destinationRegion: destinationRegion, // Add destination region
                            makt,
                            price: price // Add price field
                        });
                    });
                });
                console.log(`סך הכל פריטים גולמיים שנותחו: ${fetchedRawItems.length}`);

                // Log fetched raw items with their statuses and task statuses for debugging (reduced noise)
                if (Array.isArray(fetchedRawItems) && fetchedRawItems.length){
                    console.debug(`Fetched ${fetchedRawItems.length} raw items. Sample:`,
                        fetchedRawItems.slice(0, 5).map(i => i?.name || i?.productName || '(no name)'));
                }

                // 6. בשלב זה אתה קורא ל־processTasks ולהמשך הלוגיקה שלך:
                // Process data based on current mode
                let processedItems;
                if (currentMode === 'negative') {
                    processedItems = processNegativeItems(fetchedRawItems);
                } else {
                    // Original missing items logic - now using the new filtering approach
                    processedItems = fetchedRawItems.filter(item => {
                        const isValidMissingItem = item.missing > 0; // Item quantity missing (not fully picked)

                        // Additional check: filter out items from orders that haven't started picking yet
                        // But include PENDING orders (approved and waiting for picking)
                        const hasStartedPicking = item.taskOverallStatus !== 'NEW' && item.taskOverallStatus !== 'UNASSIGNED';

                        // Additional check: filter out items from orders that are fully picked (לוקט)
                        const isNotFullyPicked = item.taskOverallStatus !== 'PICKED';

                        // Additional safety check for excluded regions
                        const isNotExcludedRegion = !item.destinationRegion || !item.destinationRegion.includes(EXCLUDED_REGION);

                        if (!hasStartedPicking) {
                            console.log(`Filtering out item from order that hasn't started picking: ${item.name} | Task Status: ${item.taskOverallStatus} | Task ID: ${item.taskId}`);
                        }
                        if (!isNotFullyPicked) {
                            console.log(`🚫 מסנן החוצה פריט מהזמנה שכבר לוקטה במלואה: ${item.name} | סטטוס הזמנה: ${item.taskOverallStatus} | מזהה הזמנה: ${item.taskId}`);
                        }
                        if (!isNotExcludedRegion) {
                            console.log(`Filtering out item from excluded region: ${item.name} | Region: ${item.destinationRegion}`);
                        }

                        return isValidMissingItem && hasStartedPicking && isNotFullyPicked && isNotExcludedRegion;
                    });
                }

                // Additional safety check - filter out any remaining items from excluded regions
                processedItems = processedItems.filter(item => {
                    const isNotExcludedRegion = !item.destinationRegion || !item.destinationRegion.includes(EXCLUDED_REGION);
                    if (!isNotExcludedRegion) {
                        console.log(`Final safety check - filtering out item from excluded region: ${item.name} | Region: ${item.destinationRegion}`);
                    }
                    return isNotExcludedRegion;
                });

                // Count how many items were filtered out due to fully picked orders
                const fullyPickedItems = fetchedRawItems.filter(item => item.taskOverallStatus === 'PICKED');
                if (fullyPickedItems.length > 0) {
                    console.log(`🚫 סוננו החוצה ${fullyPickedItems.length} פריטים מהזמנות שכבר לוקטו במלואה`);
                }

                console.log(`פריטים אחרי סינון אזור: ${processedItems.length} מתוך ${fetchedRawItems.length} מקוריים`);
                console.log('רשימת אזורים שנמצאו:', [...new Set(processedItems.map(item => item.destinationRegion))]);

                // Apply final filtering and add uniqueId
                allResults = processedItems.map((item, index) => ({
                    ...item,
                    // Apply sanitizeForHtmlAttribute before encodeURIComponent for robust uniqueId
                    uniqueId: `${item.taskId}_${item.barcode}_${encodeURIComponent(sanitizeForHtmlAttribute(item.name))}_${encodeURIComponent(sanitizeForHtmlAttribute(item.fullDateTime))}_${index}`
                }));

                console.log(`פריטים שנשארו אחרי סינון סופי (מצב ${currentMode}): ${allResults.length}`);

                // Set default sorting before opening modal
                currentGroupHeaderSortColumn = 'name';
                currentGroupHeaderSortDirection = 'asc';

                showMissingModal(); // Call showMissingModal without arguments, it will use allResults

            } catch (error) {
                console.error('שגיאה קריטית בתהליך טעינה או ניתוח נתונים:', error.message || error);
                showMessageModal('שגיאה', 'אירעה שגיאה בטעינת הנתונים. אנא נסה שוב מאוחר יותר.', true);
            } finally {
                // Clean up loading indicator
                const existingLoader = document.getElementById('loading-msg');
                const existingBackdrop = document.querySelector('.modal-backdrop.fade.show');
                if (existingLoader && existingLoader.parentNode) {
                    existingLoader.remove();
                    console.log('לודר הוסר.');
                }
                if (existingBackdrop && existingBackdrop.parentNode) {
                    existingBackdrop.remove();
                    console.log('Backdrop של הלודר הוסר.');
                }
            }
        }

        /**
         * Updates the global selectedItemUniqueIds set based on a checkbox's state.
         * @param {HTMLInputElement} checkbox - The checkbox element.
         * @param {string} itemUniqueId - The unique ID of the item associated with the checkbox.
         */
        function updateSelectedItemsFromCheckbox(checkbox, itemUniqueId) {
            if (checkbox.checked) {
                selectedItemUniqueIds.add(itemUniqueId);
            } else {
                selectedItemUniqueIds.delete(itemUniqueId);
            }
            updateExportButtonText(); // Update button text immediately after selection changes
            updateRebuildCheckboxState(); // Update rebuild checkbox state based on selection
        }

        /**
         * Sets the checked state of a checkbox based on the selectedItemUniqueIds set.
         * @param {HTMLInputElement} checkbox - The checkbox element.
         * @param {string} itemUniqueId - The unique ID of the item associated with the checkbox.
         */
        function setCheckboxState(checkbox, itemUniqueId) {
            checkbox.checked = selectedItemUniqueIds.has(itemUniqueId);
        }

        /**
         * Updates the checked/indeterminate state of a group checkbox based on its child items.
         * This function now relies on `allResults` and `selectedItemUniqueIds` to determine the state,
         * ensuring it works even when group items are not rendered (collapsed).
         * @param {string} groupKey - The key identifying the group (e.g., product name|||barcode or taskId). This groupKey is already encoded and sanitized.
         */
        function updateGroupCheckboxState(groupKey) {
            // Use CSS.escape() to make the groupKey safe for use in querySelector
            const groupCheckbox = document.querySelector(`.group-checkbox[data-group-key="${CSS.escape(groupKey)}"]`);
            if (!groupCheckbox) return;

            let itemsInThisGroup;
            // Only 'grouped' view is active
                const [encodedName, encodedBarcode] = groupKey.split('|||');
                const name = unsanitizeFromHtmlAttribute(decodeURIComponent(encodedName));
                const barcode = unsanitizeFromHtmlAttribute(decodeURIComponent(encodedBarcode));
                itemsInThisGroup = allResults.filter(item => item.name === name && item.barcode === barcode);

            if (itemsInThisGroup.length === 0) {
                groupCheckbox.checked = false;
                groupCheckbox.indeterminate = false;
                return;
            }

            const allItemsCheckedInGroup = itemsInThisGroup.every(item => selectedItemUniqueIds.has(item.uniqueId));
            const anyItemCheckedInGroup = itemsInThisGroup.some(item => selectedItemUniqueIds.has(item.uniqueId));

            if (allItemsCheckedInGroup) {
                groupCheckbox.checked = true;
                groupCheckbox.indeterminate = false;
            } else if (anyItemCheckedInGroup) {
                groupCheckbox.checked = false;
                groupCheckbox.indeterminate = true;
            } else {
                groupCheckbox.checked = false;
                groupCheckbox.indeterminate = false;
            }
            updateSelectAllCheckboxState(); // Update select all when group changes
        }

        /**
         * Updates the checked/indeterminate state of the select-all checkbox.
         * This function now relies on `allResults` and `selectedItemUniqueIds` to determine the state.
         */
        function updateSelectAllCheckboxState() {
            const selectAllCheckbox = document.getElementById('select-all-checkbox');
            if (!selectAllCheckbox) return;

            // Consider only items that are part of the currently filtered and sorted results
            const itemsCurrentlyDisplayedUniqueIds = new Set(filteredAndSortedResults.map(item => item.uniqueId));

            if (itemsCurrentlyDisplayedUniqueIds.size === 0) {
                selectAllCheckbox.checked = false;
                selectAllCheckbox.indeterminate = false;
                return;
            }

            const allDisplayedChecked = filteredAndSortedResults.every(item => selectedItemUniqueIds.has(item.uniqueId));
            const anyDisplayedChecked = filteredAndSortedResults.some(item => selectedItemUniqueIds.has(item.uniqueId));

            if (allDisplayedChecked) {
                selectAllCheckbox.checked = true;
                selectAllCheckbox.indeterminate = false;
            } else if (anyDisplayedChecked) {
                selectAllCheckbox.checked = false;
                selectAllCheckbox.indeterminate = true;
            } else {
                selectAllCheckbox.checked = false;
                selectAllCheckbox.indeterminate = false;
            }
            updateExportButtonText(); // Update button text when select all state changes
            updateRebuildCheckboxState(); // Update rebuild checkbox state when select all changes
        }

        /**
         * Sets up event listeners for all checkboxes and updates their initial states.
         */
        function setupCheckboxListeners() {
            const selectAllCheckbox = document.getElementById('select-all-checkbox');
            const groupCheckboxes = document.querySelectorAll('.group-checkbox');
            const itemCheckboxes = document.querySelectorAll('.item-checkbox');

            // Apply initial states for individual item checkboxes (only visible ones)
            itemCheckboxes.forEach(itemCheckbox => {
                setCheckboxState(itemCheckbox, itemCheckbox.dataset.itemId);
            });

            // Apply initial states for group checkboxes (relying on allResults)
            const uniqueGroupKeysInDisplay = new Set();
            // Only 'grouped' view is active
                filteredAndSortedResults.forEach(item => uniqueGroupKeysInDisplay.add(`${encodeURIComponent(sanitizeForHtmlAttribute(item.name))}|||${encodeURIComponent(sanitizeForHtmlAttribute(item.barcode))}`));

            uniqueGroupKeysInDisplay.forEach(key => updateGroupCheckboxState(key));

            // Finally, update the select-all checkbox state
            updateSelectAllCheckboxState();


            // Listener for select-all checkbox
            if (selectAllCheckbox) {
                selectAllCheckbox.onchange = (e) => {
                    const isChecked = e.target.checked;
                    // Determine which items are currently displayed and should be affected
                    const itemsToToggle = filteredAndSortedResults; // Only affect currently displayed items

                    itemsToToggle.forEach(item => {
                        // Update selectedItemUniqueIds based on isChecked
                        if (isChecked) {
                            selectedItemUniqueIds.add(item.uniqueId);
                        } else {
                            selectedItemUniqueIds.delete(item.uniqueId);
                        }
                        // Find and update visual state of checkbox if it's currently rendered
                        const itemCheckbox = document.querySelector(`.item-checkbox[data-item-id="${CSS.escape(item.uniqueId)}"]`);
                        if (itemCheckbox) {
                            itemCheckbox.checked = isChecked;
                        }
                    });

                    // Update all *currently displayed* group checkboxes visually
                    groupCheckboxes.forEach(groupCb => {
                        groupCb.checked = isChecked;
                        groupCb.indeterminate = false;
                    });

                    updateSelectAllCheckboxState(); // Ensure select-all reflects overall state (will also call updateExportButtonText and updateRebuildCheckboxState)
                };
            }

            // Listener for group checkboxes
            groupCheckboxes.forEach(groupCheckbox => {
                groupCheckbox.onchange = (e) => {
                    const isChecked = e.target.checked;
                    const groupKey = groupCheckbox.dataset.groupKey; // This groupKey is already encoded and sanitized if applicable

                    let itemsInAffectedGroup;
                    // Only 'grouped' view is active
                        const [encodedName, encodedBarcode] = groupKey.split('|||');
                        const name = unsanitizeFromHtmlAttribute(decodeURIComponent(encodedName));
                        const barcode = unsanitizeFromHtmlAttribute(decodeURIComponent(encodedBarcode));
                        itemsInAffectedGroup = allResults.filter(item => item.name === name && item.barcode === barcode);

                    itemsInAffectedGroup.forEach(item => {
                        // Update selectedItemUniqueIds
                        if (isChecked) {
                            selectedItemUniqueIds.add(item.uniqueId);
                        } else {
                            selectedItemUniqueIds.delete(item.uniqueId);
                        }
                        // Find and update visual state of checkbox if it's currently rendered
                        const itemCheckbox = document.querySelector(`.item-checkbox[data-item-id="${CSS.escape(item.uniqueId)}"]`);
                        if (itemCheckbox) {
                            itemCheckbox.checked = isChecked;
                        }
                    });
                    updateGroupCheckboxState(groupKey); // This will call updateSelectAllCheckboxState internally (which calls updateRebuildCheckboxState)
                };
            });

            // Listener for individual item checkboxes
            itemCheckboxes.forEach(itemCheckbox => {
                itemCheckbox.onchange = (e) => {
                    const groupKey = itemCheckbox.dataset.groupKey;
                    updateSelectedItemsFromCheckbox(itemCheckbox, itemCheckbox.dataset.itemId);
                    updateGroupCheckboxState(groupKey); // This will call updateSelectAllCheckboxState internally (which calls updateRebuildCheckboxState)
                };
            });
        }

        /**
         * Updates the text of the "Export to Google Sheets" button based on selection.
         */
        function updateExportButtonText() {
            if (!exportToSheetsButton) return; // Ensure button exists

            if (selectedItemUniqueIds.size > 0) {
                exportToSheetsButton.innerHTML = `<i class="fa-light fa-file-spreadsheet mr-1"></i>ייצוא מסומנים ל-Google Sheets`;
            } else {
                // Restore original text if no items are selected
                exportToSheetsButton.innerHTML = originalExportButtonText || `<i class="fa-light fa-file-spreadsheet mr-1"></i>ייצוא ל-Google Sheets`;
            }
        }

        /**
         * Updates the state of the rebuild checkbox based on item selection.
         * Disables rebuild checkbox when specific items are selected for export.
         */
        function updateRebuildCheckboxState() {
            const rebuildCheckbox = document.getElementById('rebuild-table-checkbox');
            if (!rebuildCheckbox) return;

            const hasSelectedItems = selectedItemUniqueIds.size > 0;

            if (hasSelectedItems) {
                // Disable rebuild checkbox when items are selected
                rebuildCheckbox.disabled = true;
                rebuildCheckbox.checked = false; // Uncheck it to prevent confusion

                // Add visual styling to show it's disabled
                const label = rebuildCheckbox.nextElementSibling;
                if (label && label.tagName === 'LABEL') {
                    label.style.opacity = '0.5';
                    label.style.cursor = 'not-allowed';
                }

                console.log('🔒 Rebuild checkbox disabled - items are selected for export');
            } else {
                // Enable rebuild checkbox when no items are selected
                rebuildCheckbox.disabled = false;

                // Remove visual styling
                const label = rebuildCheckbox.nextElementSibling;
                if (label && label.tagName === 'LABEL') {
                    label.style.opacity = '1';
                    label.style.cursor = 'pointer';
                }

                console.log('🔓 Rebuild checkbox enabled - no items selected');
            }
        }

        /**
         * Helper function to get currently grouped keys based on view mode.
         * @returns {Array<string>} An array of unique group keys.
         */
        function getCurrentlyGroupedKeys() {
            const currentlyGroupedKeys = new Set(filteredAndSortedResults.map(r => {
                // Only 'grouped' view is active
                    return `${encodeURIComponent(sanitizeForHtmlAttribute(r.name))}|||${encodeURIComponent(sanitizeForHtmlAttribute(r.barcode))}`;
            }));
            return Array.from(currentlyGroupedKeys).filter(key => key !== 'undefined');
        }

        /**
         * Updates the visual state of the expand header icon (chevron-left or chevron-down).
         */
        const updateHeaderExpandIcon = () => {
            const expandHeaderIcon = document.querySelector('.expand-all-header-icon');
            if (!expandHeaderIcon) return; // viewMode check removed as it's always grouped

            const allCurrentlyGroupKeys = getCurrentlyGroupedKeys();
            const isAllExpanded = allCurrentlyGroupKeys.length > 0 && allCurrentlyGroupKeys.every(key => expandedGroups.has(key));

            if (isAllExpanded) {
                expandHeaderIcon.className = 'fa-light fa-chevron-down expand-all-header-icon';
            } else {
                expandHeaderIcon.className = 'fa-light fa-chevron-left expand-all-header-icon';
            }
        };

        /**
         * Updates the text of the "Expand All" / "Collapse All" button.
         */
        const updateExpandAllButtonText = () => {
            // No need for viewMode check here, as it's always grouped
            if (expandAllBtn) expandAllBtn.style.display = 'inline-block';

            const allCurrentlyGroupKeys = getCurrentlyGroupedKeys();
            const isAllExpanded = allCurrentlyGroupKeys.length > 0 && allCurrentlyGroupKeys.every(key => expandedGroups.has(key));
            if (expandAllBtn) { // Check again before setting innerHTML
                if (isAllExpanded) {
                    expandAllBtn.innerHTML = `<i class="fa-light fa-folder-closed mr-1"></i>סגור את כל הקבוצות`;
                } else {
                    expandAllBtn.innerHTML = `<i class="fa-light fa-folder-open mr-1"></i>פתח את כל הקבוצות`;
                }
            }
            updateHeaderExpandIcon(); // Also update the header icon whenever the button text is updated
        };


        /**
         * Displays the missing items data in a modal table.
         */
        function showMissingModal() {
            console.log('פונקציית showMissingModal החלה. כמות תוצאות: ', allResults.length);

            const existingBackdrop = document.querySelector('.modal-backdrop.fade.show');
            if (existingBackdrop) {
                existingBackdrop.remove();
                console.log('Backdrop קיים הוסר לפני הצגת מודל חדש.');
            }

            const modal = document.createElement('div');
            modal.id = 'missing-items-modal';
            modal.className = 'modal fade show';
            modal.style.display = 'block';
            modal.style.position = 'fixed';
            modal.style.top = '0';
            modal.style.left = '0';
            modal.style.width = '100vw';
            modal.style.height = '100vh';
            modal.style.zIndex = 1050;
            modal.style.overflow = 'hidden';

            const modalBackdrop = document.createElement('div');
            modalBackdrop.className = 'modal-backdrop fade show';
            modalBackdrop.style.zIndex = 1049;
            document.body.appendChild(modalBackdrop);
            console.log('Backdrop של המודל נוצר.');

            modal.innerHTML = `
                <div class="modal-dialog modal-dialog-centered modal-xl" style="max-width: 60vw; height: 98vh; margin: 1vh auto;">
                    <div class="modal-content" style="height: 100%; display: flex; flex-direction: column; border-radius: 8px;">
                        <div class="modal-header d-flex justify-content-between align-items-center py-2 px-3" style="border-bottom: 1px solid #e9ecef; background-color: ${currentMode === 'negative' ? '#939393' : '#f8f9fa'}; border-top-left-radius: 8px; border-top-right-radius: 8px;">
                            <h4 class="modal-title m-0" style="color: ${currentMode === 'negative' ? '#ffffff' : '#000000'};">${currentMode === 'negative' ? 'טבלת נגטיב' : 'טבלת חוסרים'}</h4>
                            <div class="d-flex align-items-center gap-2">
                                <button type="button" id="expand-all-btn" class="btn btn-sm btn-secondary mx-1" style="padding: 6px 10px; border-radius: 5px; cursor: pointer;">פתח את כל הקבוצות</button>
                                <button name="button" type="submit" class="btn btn-sm btn-secondary d-flex align-items-center" formtarget="_blank" id="excel-export-btn">
                                    <i class="fa-light fa-file-excel mr-1"></i>אקסל
                                </button>
                                <button type="button" id="print-btn" class="btn btn-sm btn-secondary mx-1" style="padding: 6px 10px; border-radius: 5px; cursor: pointer;"><i class="fa-light fa-print mr-1"></i>הדפסה</button>
                                <button id="toggle-gallery-btn" class="btn btn-sm btn-secondary ml-2" title="הצג/הסתר גלריה"><i class="fa-light fa-images mr-1"></i> גלריה</button>
                                ${currentMode !== 'negative' ? `
                                    <div id="export-sheets-wrapper" style="position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; height: auto; margin: 0 5px;">
                                        <button type="button" id="export-to-sheets-btn" class="btn btn-sm btn-success" style="padding: 6px 10px; border-radius: 5px; background-color: #28a745; border-color: #28a745; color: white; cursor: pointer;">
                                            <i class="fa-light fa-file-spreadsheet mr-1"></i>ייצוא ל-Google Sheets
                                        </button>
                                        <button type="button" id="test-connection-btn" class="btn btn-sm btn-info" style="padding: 4px 8px; border-radius: 5px; background-color: #17a2b8; border-color: #17a2b8; color: white; cursor: pointer; font-size: 11px; margin-top: 2px;">
                                            <i class="fa-light fa-wifi mr-1"></i>בדוק חיבור
                                        </button>
                                    </div>
                                ` : ''}
                                <button type="button" class="close" data-dismiss="modal" aria-label="Close" id="close_missing_modal" style="border: none; background: transparent; font-size: 1.5rem; cursor: pointer;">
                                    <i class="ki ki-close" style="color: ${currentMode === 'negative' ? '#ffffff' : '#6c757d'};"></i>
                                </button>
                            </div>
                        </div>
                        <div class="modal-body px-4 py-3" style="flex-grow: 1; display: flex; flex-direction: column; overflow: hidden;">
                            <div id="missing-table-container" style="flex-grow: 1; overflow-y: auto; border: 1px solid #e9ecef; border-radius: 8px; background-color: #fff; box-shadow: inset 0 1px 3px rgba(0,0,0,0.06);"></div>
                            <div id="missing-gallery-container">
                                <button id="gallery-close-btn" class="gallery-close-button" title="סגור גלריה">
                                    <i class="ki ki-close"></i>
                                </button>
                                <div class="missing-gallery-grid" id="missing-gallery-grid"></div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            console.log('🖼️ מודל חוסרים נוצר ונוסף ל-DOM');

            // Declaratively tell toolbox.js to skip ripple/toast inside this area
            const container = document.getElementById('missing-table-container');
            if (container) {
                container.setAttribute('data-tm-no-copy-ui', '1');
                console.log('✅ הוסף data-tm-no-copy-ui לקונטיינר הטבלה');
            }

            // בדיקת חיבור אוטומטית כשהמודל נפתח (רק במצב חוסרים)
            if (currentMode !== 'negative') {
                console.log('🔍 מתבצעת בדיקת חיבור אוטומטית לשרת...');
                setTimeout(async () => {
                    try {
                        const sheetInfo = await testServerConnection();
                        if (typeof sheetInfo === 'object' && sheetInfo.success) {
                            console.log('✅ חיבור לשרת תקין');
                            console.log(`📄 מחובר לקובץ: ${sheetInfo.spreadsheet.name}`);
                            console.log(`📊 גיליון: ${sheetInfo.sheetName}`);
                            if (sheetInfo.spreadsheet.ownerEmail) {
                                console.log(`👤 בעלים: ${sheetInfo.spreadsheet.ownerEmail}`);
                            }
                        } else {
                            console.log('✅ חיבור לשרת תקין');
                        }
                    } catch (error) {
                        console.warn('⚠️ בעיה בחיבור לשרת:', error.message);
                        // לא מציגים הודעת שגיאה אוטומטית כדי לא להפריע למשתמש
                    }
                }, 1000);
            }


            // סגירת מודל חוסרים
            document.getElementById('close_missing_modal').onclick = () => {
                console.log('🔒 סוגר מודל חוסרים...');
                console.log('📊 מצב נוכחי:', currentMode === 'negative' ? 'נגטיב' : 'חוסרים');
                console.log('🔄 מתחיל תהליך סגירה...');
                modal.remove();
                modalBackdrop.remove();
                console.log('✅ מודל ו-backdrop נסגרו והוסרו');
                console.log('🔄 איפוס מצב כפתורים');
                // איפוס כפתורי מצב
                if (typeof updateButtonStyles === 'function') {
                    leftBtn.classList.remove('active');
                    rightBtn.classList.remove('active');
                    console.log('✅ כפתורי מצב אופסו');
                    console.log('🔄 מוכן לשימוש חוזר');
                    console.log('🎯 סקריפט מוכן לשימוש חוזר');
                console.log('📋 תהליך סגירה הושלם בהצלחה');
                console.log('🎉 מודל חוסרים נסגר בהצלחה');
                console.log('🔄 מערכת מוכנה לשימוש חוזר');
                console.log('📊 מצב סופי:', currentMode === 'negative' ? 'נגטיב' : 'חוסרים');
                console.log('🎯 סקריפט מוכן לשימוש חוזר');
                console.log('✅ תהליך סגירה הושלם בהצלחה');
                }
            };

            // Add click outside modal to close
            modal.addEventListener('click', (event) => {
                if (event.target === modal) {
                    modal.remove();
                    modalBackdrop.remove();
                    console.log('מודל ו-backdrop נסגרו בלחיצה מחוץ לחלונית.');
                    // איפוס כפתורי מצב
                    if (typeof updateButtonStyles === 'function') {
                        leftBtn.classList.remove('active');
                        rightBtn.classList.remove('active');
                    }
                }
            });

            // Assign expandAllBtn here, where the modal structure is already in the DOM
            expandAllBtn = document.getElementById('expand-all-btn'); // Now assigned here

            exportToSheetsButton = document.getElementById('export-to-sheets-btn');
            // Capture original text once the button is in the DOM (only if button exists)
            if (exportToSheetsButton) {
            originalExportButtonText = exportToSheetsButton.innerHTML;
            }

            // הוסף את ה-checkbox "בנה מחדש" אחרי שהכפתור קיים ב-DOM
            addRebuildCheckboxBelowExport();

            /**
             * Copies text to clipboard and provides visual feedback.
             * @param {string} text - The text to copy.
             * @param {HTMLElement} element - The element to apply feedback to.
             */
            const copyToClipboard = (text, element) => {
                // נסה להשתמש ב-Clipboard API המודרני
                if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(text).then(() => {
                        // הצג אפקט ויזואלי של הצלחה
                    const originalBg = element.style.backgroundColor;
                    const originalColor = element.style.color;
                    element.style.backgroundColor = '#d0f0d0'; // Light green for success
                    element.style.color = 'black';
                    setTimeout(() => {
                        element.style.backgroundColor = originalBg;
                        element.style.color = originalColor;
                    }, 300);
                }).catch(err => {
                        console.error('שגיאה בהעתקה ל-clipboard:', err);
                        // נסה שיטה ישנה יותר
                        fallbackCopyToClipboard(text, element);
                    });
                } else {
                    // שיטה ישנה יותר עבור context לא מאובטח
                    fallbackCopyToClipboard(text, element);
                }
            };

            const fallbackCopyToClipboard = (text, element) => {
                // יצירת אלמנט זמני להעתקה
                const textArea = document.createElement('textarea');
                textArea.value = text;
                textArea.style.position = 'fixed';
                textArea.style.left = '-999999px';
                textArea.style.top = '-999999px';
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();

                try {
                    const successful = document.execCommand('copy');
                    if (successful) {
                        // הצג אפקט ויזואלי של הצלחה
                        const originalBg = element.style.backgroundColor;
                        const originalColor = element.style.color;
                        element.style.backgroundColor = '#d0f0d0'; // Light green for success
                        element.style.color = 'black';
                        setTimeout(() => {
                            element.style.backgroundColor = originalBg;
                            element.style.color = originalColor;
                        }, 300);
                    } else {
                        console.error('העתקה נכשלה');
                    }
                } catch (err) {
                    console.error('שגיאה בהעתקה:', err);
                }

                document.body.removeChild(textArea);
            };

            /**
             * Applies filters and sorting to the results and re-renders the table.
             */
            const applyFiltersAndSort = () => {
                console.log('מחיל סינון ומיון...');
                let currentResults = [...allResults]; // Start with all original results

                // Apply sorting if a column is selected
                if (currentGroupHeaderSortColumn && currentGroupHeaderSortColumn !== 'select' && currentGroupHeaderSortColumn !== 'expand') {
                    console.log(`ממיין לפי עמודה: ${currentGroupHeaderSortColumn}, כיוון: ${currentGroupHeaderSortDirection}`);

                    // Group the results first
                    const grouped = {};
                    currentResults.forEach(r => {
                        const key = `${encodeURIComponent(sanitizeForHtmlAttribute(r.name))}|||${encodeURIComponent(sanitizeForHtmlAttribute(r.barcode))}`;
                        if (!grouped[key]) grouped[key] = {
                            name: r.name,
                            barcode: r.barcode,
                            encodedKey: key,
                            price: r.price,
                            totalMissing: 0,
                            orderIds: new Set(),
                            items: []
                        };
                        grouped[key].items.push(r);
                        grouped[key].totalMissing += r.missing;
                        grouped[key].orderIds.add(r.taskId);
                    });

                    // Sort the groups
                    const sortedGroups = Object.values(grouped).sort((a, b) => {
                        let aValue, bValue;

                        switch (currentGroupHeaderSortColumn) {
                            case 'totalMissing':
                                aValue = a.totalMissing;
                                bValue = b.totalMissing;
                                break;
                            case 'name':
                                aValue = a.name;
                                bValue = b.name;
                                break;
                            case 'barcode':
                                aValue = a.barcode;
                                bValue = b.barcode;
                                break;
                            case 'price':
                                aValue = parseFloat(a.price) || 0;
                                bValue = parseFloat(b.price) || 0;
                                break;
                            case 'orderCount':
                                aValue = a.orderIds.size;
                                bValue = b.orderIds.size;
                                break;
                            default:
                                return 0;
                        }

                        if (typeof aValue === 'string') {
                            aValue = aValue.toLowerCase();
                            bValue = bValue.toLowerCase();
                        }

                        if (currentGroupHeaderSortDirection === 'asc') {
                            return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
                        } else {
                            return aValue < bValue ? 1 : aValue > bValue ? -1 : 0;
                        }
                    });

                    // Flatten back to individual items
                    currentResults = sortedGroups.flatMap(group => group.items);
                }

                filteredAndSortedResults = currentResults; // Update the global variable
                renderTable();
                // אם מצב גלריה פעיל — נרנדר גלריה לפי הנתונים המעודכנים
                try{
                  if (isGalleryView) {
                    const gal = document.getElementById('missing-gallery-container');
                    if (gal && gal.style.display !== 'none') {
                      renderMissingGallery().catch(e => console.error('Gallery render error:', e));
                    }
                  }
                }catch(_){}
            };

            /**
             * Renders the missing items table based on current view mode, filters, and sort order.
             */
            const renderTable = () => {
                console.log('פונקציית renderTable החל.');
                const container = document.getElementById('missing-table-container');

                // Remove existing table if any
                const oldTable = container.querySelector('table');
                if(oldTable) {
                    oldTable.remove();
                    console.log('טבלה קודמת הוסרה מ-missing-table-container.');
                }

                // Use new rendering system for large datasets
                if (filteredAndSortedResults.length >= CONFIG.VIRTUAL_THRESHOLD) {
                    log.info(`Using virtualized rendering for ${filteredAndSortedResults.length} items`);
                    // Create virtual table structure
                    const table = document.createElement('table');
                    table.className = `table table-bordered table-hover order-item-table view-grouped`;
                    table.style.fontSize = '14px';
                    table.style.width = '100%';
                    table.style.tableLayout = 'fixed';

                    // Add headers
                    const thead = document.createElement('thead');
                    const headerRow = document.createElement('tr');
                    // ... header setup ...
                    thead.appendChild(headerRow);
                    table.appendChild(thead);

                    const tbody = document.createElement('tbody');
                    table.appendChild(tbody);
                    container.appendChild(table);

                    // Use virtual rendering
                    const rowFactory = (row, i) => {
                        // Create row element based on row data
                        const tr = document.createElement('tr');
                        // ... row content setup ...
                        return tr;
                    };

                    mountVirtualTable(tbody, filteredAndSortedResults, rowFactory);
                    return;
                }

                const table = document.createElement('table');
                table.className = `table table-bordered table-hover order-item-table view-grouped`; // Fixed to view-grouped
                table.style.fontSize = '14px';
                table.style.width = '100%';
                table.style.tableLayout = 'fixed';

                const thead = document.createElement('thead');
                const headerRow = document.createElement('tr');
                let headersData;

                // Only grouped view is available
                    headersData = [
                    ...(currentMode !== 'negative' ? [{ name: '<input type="checkbox" id="select-all-checkbox" title="בחר הכל" style="vertical-align: middle;">', key: 'select', sortable: false, width: '60px' }] : []),
                    { name: '<i class="fa-light fa-chevron-left expand-all-header-icon"></i>', key: 'expand', sortable: false, width: '30px' },
                    { name: currentMode === 'negative' ? 'סה"כ לוקטו' : 'סה"כ חסרים', key: currentMode === 'negative' ? 'totalPicked' : 'totalMissing', sortable: true, width: '100px' },
                        { name: 'שם מוצר', key: 'name', sortable: true },
                        { name: 'ברקוד', key: 'barcode', sortable: true },
                    { name: 'מחיר', key: 'price', sortable: true },
                    { name: 'הזמנות', key: 'orderCount', sortable: true, width: '80px' },
                ];

                headersData.forEach(h => {
                    const th = document.createElement('th');
                    th.className = 'bg-gray-200 font-weight-bolder text-center';
                    if (h.key === 'select' || h.key === 'expand') { // Handle select and expand icons
                        th.innerHTML = h.name;
                        // Add click handler to the expand header icon only
                        if (h.key === 'expand') {
                            th.style.cursor = 'pointer';
                            th.addEventListener('click', () => {
                                const allCurrentlyGroupKeys = getCurrentlyGroupedKeys();
                                const isAllExpanded = allCurrentlyGroupKeys.length > 0 && allCurrentlyGroupKeys.every(key => expandedGroups.has(key));

                                if (isAllExpanded) {
                                    expandedGroups.clear();
                                    console.log('כל הקבוצות נסגרו ע"י לחיצה על אייקון כותרת.');
                                } else {
                                    allCurrentlyGroupKeys.forEach(k => expandedGroups.add(k));
                                    console.log('כל הקבוצות נפתחו ע"י לחיצה על אייקון כותרת.');
                                }
                                // Update the button text and re-render the table
                                updateExpandAllButtonText(); // This will call updateHeaderExpandIcon
                                renderTable(); // Re-render to reflect expanded/collapsed state
                            });
                        }
                    } else {
                        th.textContent = h.name;
                        th.style.cursor = 'pointer';
                        // הוסף חיווי כיוון מיון
                            if (currentGroupHeaderSortColumn === h.key) {
                            th.innerHTML = h.name + (currentGroupHeaderSortDirection === 'asc' ?
                                ' <i class="fa-light fa-arrow-up-arrow-down"></i>' :
                                ' <i class="fa-light fa-arrow-down-arrow-up"></i>');
                        }
                        th.onclick = () => {
                            if (currentGroupHeaderSortColumn === h.key) {
                                currentGroupHeaderSortDirection = currentGroupHeaderSortDirection === 'asc' ? 'desc' : 'asc';
                            } else {
                                currentGroupHeaderSortColumn = h.key;
                                currentGroupHeaderSortDirection = 'asc';
                            }
                            applyFiltersAndSort(); // Call applyFiltersAndSort instead of renderTable directly
                        };
                    }
                    if (h.width) th.style.width = h.width;

                    headerRow.appendChild(th);
                });
                thead.appendChild(headerRow);
                table.appendChild(thead);

                const tbody = document.createElement('tbody');

                // Only grouped view is available
                    const grouped = {};
                    filteredAndSortedResults.forEach(r => {
                        // Use encoded and sanitized name and barcode for group key to avoid issues in data- attributes and selectors
                        const key = `${encodeURIComponent(sanitizeForHtmlAttribute(r.name))}|||${encodeURIComponent(sanitizeForHtmlAttribute(r.barcode))}`;
                        if (!grouped[key]) grouped[key] = {
                        name: r.name,
                        barcode: r.barcode,
                        encodedKey: key,
                        price: r.price,
                        totalPicked: 0,
                            totalMissing: 0,
                            earliestDateTime: null,
                        items: [],
                        orderIds: new Set(),
                        };
                        grouped[key].items.push(r);
                    grouped[key].totalPicked += r.picked;
                        grouped[key].totalMissing += r.missing;
                    grouped[key].orderIds.add(r.taskId);

                        // Decode fullDateTime for comparison if it was encoded in the uniqueId
                        const decodedFullDateTime = unsanitizeFromHtmlAttribute(decodeURIComponent(r.fullDateTime));
                        const [day, month, year, hour, minute] = decodedFullDateTime.match(/(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})/)?.slice(1) || [];
                        const itemDateTime = hour && minute ? new Date(`${year}-${month}-${day}T${hour}:${minute}`) : new Date(`${year}-${month}-${day}`);

                        if (!grouped[key].earliestDateTime || itemDateTime < grouped[key].earliestDateTime) {
                            grouped[key].earliestDateTime = itemDateTime;
                        }
                    });
                    console.log(`מצב תצוגה מקובץ (לפי מוצר): נמצאו ${Object.keys(grouped).length} קבוצות מוצרים.`);

                    let sortedGroups = Object.values(grouped);

                    // Sort inner items within groups (default: by date ascending)
                    sortedGroups.forEach(group => {
                        group.items.sort((a, b) => {
                            // Decode fullDateTime for comparison if it was encoded
                            const decodedFullDateTimeA = unsanitizeFromHtmlAttribute(decodeURIComponent(a.fullDateTime));
                            const [dayA, monthA, yearA, hourA, minuteA] = decodedFullDateTimeA.match(/(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})/)?.slice(1) || [];
                            const dateA = hourA && minuteA ? new Date(`${yearA}-${monthA}-${dayA}T${hourA}:${minuteA}`) : new Date(`${yearA}-${monthA}-${dayA}`);

                            const decodedFullDateTimeB = unsanitizeFromHtmlAttribute(decodeURIComponent(b.fullDateTime));
                            const [dayB, monthB, yearB, hourB, minuteB] = decodedFullDateTimeB.match(/(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})/)?.slice(1) || [];
                            const dateB = hourB && minuteB ? new Date(`${yearB}-${monthB}-${dayB}T${hourB}:${minuteB}`) : new Date(`${yearB}-${monthB}-${dayB}`);

                            return dateA - dateB;
                        });
                    });

                    sortedGroups.forEach((group, i) => {
                    // צבע לסירוגין בין קבוצות
                    const groupBg = (i % 2 === 0) ? '#f6f8fa' : '#f0f2f5';

                        const row = document.createElement('tr');
                    row.className = 'font-weight-bold group-row';
                    row.dataset.groupKey = group.encodedKey;
                    row.style.borderTop = '3px solid #b5b5b5';
                    row.style.backgroundColor = groupBg;

                        // Checkbox for the group
                    if (currentMode !== 'negative') {
                        const tdSelectGroup = document.createElement('td');
                        tdSelectGroup.style.textAlign = 'center';
                        tdSelectGroup.innerHTML = `<input type="checkbox" class="group-checkbox" data-group-key="${group.encodedKey}" title="בחר קבוצה זו">`;
                        row.appendChild(tdSelectGroup);
                    }

                        const tdExpand = document.createElement('td');
                        tdExpand.style.width = headersData.find(h => h.key === 'expand').width;
                        const icon = document.createElement('span');
                    if (expandedGroups.has(group.encodedKey)) {
                        icon.innerHTML = '<i class="fa-light fa-chevron-down" style="color:#3699ff"></i>';
                    } else {
                        icon.innerHTML = '<i class="fa-light fa-chevron-left" style="color:#b5b5b5"></i>';
                    }
                        icon.style.cursor = 'pointer';
                        icon.onclick = () => {
                            if (expandedGroups.has(group.encodedKey)) expandedGroups.delete(group.encodedKey);
                            else expandedGroups.add(group.encodedKey);
                            renderTable();
                        };
                        tdExpand.appendChild(icon);

                    // סיכום: לוקטו או חסרים לפי מצב
                    const tdSummary = document.createElement('td');
                    if (currentMode === 'negative') {
                        tdSummary.textContent = group.totalPicked;
                    } else {
                        tdSummary.textContent = group.totalMissing;
                    }
                    tdSummary.style.width = headersData.find(h => h.key === (currentMode === 'negative' ? 'totalPicked' : 'totalMissing')).width;
                    tdSummary.style.cursor = 'copy';
                    tdSummary.onclick = (event) => { event.stopPropagation(); copyToClipboard(tdSummary.textContent, tdSummary); };

                        const tdName = document.createElement('td');
                        tdName.textContent = group.name;
                        tdName.style.textAlign = 'right';
                        tdName.style.cursor = 'copy';
                        tdName.onclick = (event) => { event.stopPropagation(); copyToClipboard(group.name, tdName); };

                        const tdBarcode = document.createElement('td');
                        tdBarcode.textContent = group.barcode;
                        tdBarcode.style.cursor = 'copy';
                        tdBarcode.onclick = (event) => { event.stopPropagation(); copyToClipboard(group.barcode, tdBarcode); };

                    const tdPrice = document.createElement('td');
                    tdPrice.textContent = group.price || '';
                    tdPrice.style.cursor = 'copy';
                    tdPrice.onclick = (event) => { event.stopPropagation(); copyToClipboard(group.price || '', tdPrice); };

                    const tdOrderCount = document.createElement('td');
                    tdOrderCount.textContent = group.orderIds.size;
                    tdOrderCount.style.cursor = 'copy';
                    tdOrderCount.onclick = (event) => { event.stopPropagation(); copyToClipboard(group.orderIds.size.toString(), tdOrderCount); };

                    row.append(tdExpand, tdSummary, tdName, tdBarcode, tdPrice, tdOrderCount);
                        tbody.appendChild(row);

                        if (expandedGroups.has(group.encodedKey)) {
                            // צור טבלה פנימית אמיתית
                            const subTable = document.createElement('table');
                            if (currentMode === 'negative') {
        subTable.style.width = '100%';
        subTable.style.minWidth = '100%';
        subTable.style.maxWidth = '100%';
        subTable.style.tableLayout = 'fixed';
    }
                            subTable.style.width = '100%';
                            subTable.style.tableLayout = 'fixed';
                            subTable.style.backgroundColor = groupBg;
                            subTable.className = 'sub-table-inner';

                            // צור thead
                            const subThead = document.createElement('thead');
                            const subHeaderRow = document.createElement('tr');
                            if (currentMode !== 'negative') {
                                const thSelect = document.createElement('th');
                                thSelect.style.width = '30px';
                                subHeaderRow.appendChild(thSelect);
                            }
                            const thTaskId = document.createElement('th');
                            thTaskId.textContent = 'מספר הזמנה';
                            thTaskId.style.width = '130px';
                            subHeaderRow.appendChild(thTaskId);
                            const thDate = document.createElement('th');
                            thDate.textContent = 'תאריך';
                            thDate.style.width = '90px';
                            subHeaderRow.appendChild(thDate);
                            const thPicked = document.createElement('th');
                            thPicked.textContent = 'לוקט';
                            thPicked.style.width = '60px';
                            subHeaderRow.appendChild(thPicked);
                            const thTotal = document.createElement('th');
                            thTotal.textContent = 'סה\'כ';
                            thTotal.style.width = '60px';
                            subHeaderRow.appendChild(thTotal);
                            const thMissing = document.createElement('th');
                            thMissing.textContent = 'חסרים';
                            thMissing.style.width = '60px';
                            subHeaderRow.appendChild(thMissing);
                            const thStatus = document.createElement('th');
                            thStatus.textContent = 'סטטוס';
                            thStatus.style.width = '90px';
                            subHeaderRow.appendChild(thStatus);
                            subThead.appendChild(subHeaderRow);
                            subTable.appendChild(subThead);

                            // ביטול style מה-th במצב נגטיב
                            if (currentMode === 'negative') {
                                subTable.querySelectorAll('th').forEach(th => th.removeAttribute('style'));
                            }

                            // צור tbody
                            const subTbody = document.createElement('tbody');
                            group.items.forEach(r => {
                                const subRow = document.createElement('tr');
                                subRow.className = 'missing-item-sub-row';
                                subRow.style.backgroundColor = groupBg;
                                subRow.style.color = '#3F4254';
                                subRow.dataset.itemId = r.uniqueId;

                                if (currentMode !== 'negative') {
                                    const tdSelectItem = document.createElement('td');
                                    tdSelectItem.style.textAlign = 'center';
                                    tdSelectItem.innerHTML = `<input type="checkbox" class="item-checkbox" data-item-id="${r.uniqueId}" data-group-key="${group.encodedKey}" title="בחר פריט זה">`;
                                    subRow.appendChild(tdSelectItem);
                                }
                                // מספר הזמנה
                                const tdTaskId = document.createElement('td');
                                const link = document.createElement('a');
                                link.href = `https://members.lionwheel.com/tasks/${r.taskId}`;
                                link.textContent = r.taskId;
                                link.target = '_blank';
                                link.title = r.taskId;
                                link.style.maxWidth = '100%';
                                link.style.overflow = 'hidden';
                                link.style.textOverflow = 'ellipsis';
                                link.style.whiteSpace = 'nowrap';
                                link.style.display = 'inline-block';
                                link.style.verticalAlign = 'middle';
                                tdTaskId.appendChild(link);
                                tdTaskId.style.textAlign = 'center';
                                tdTaskId.style.cursor = 'copy';
                                tdTaskId.onclick = (event) => { event.stopPropagation(); copyToClipboard(r.taskId, tdTaskId); };
                                subRow.appendChild(tdTaskId);
                                // תאריך
                                const tdDate = document.createElement('td');
                                tdDate.textContent = r.date;
                                tdDate.style.textAlign = 'center';
                                tdDate.style.cursor = 'copy';
                                tdDate.onclick = (event) => { event.stopPropagation(); copyToClipboard(r.date, tdDate); };
                                subRow.appendChild(tdDate);
                                // לוקט
                                const tdPicked = document.createElement('td');
                                tdPicked.textContent = r.picked;
                                tdPicked.style.textAlign = 'center';
                                tdPicked.style.cursor = 'copy';
                                tdPicked.onclick = (event) => { event.stopPropagation(); copyToClipboard(r.picked, tdPicked); };
                                subRow.appendChild(tdPicked);
                                // סה"כ
                                const tdTotal = document.createElement('td');
                                tdTotal.textContent = r.total;
                                tdTotal.style.textAlign = 'center';
                                tdTotal.style.cursor = 'copy';
                                tdTotal.onclick = (event) => { event.stopPropagation(); copyToClipboard(r.total, tdTotal); };
                                subRow.appendChild(tdTotal);
                                // חסרים
                                const tdMissing = document.createElement('td');
                                tdMissing.textContent = r.missing;
                                tdMissing.style.textAlign = 'center';
                                tdMissing.style.cursor = 'copy';
                                tdMissing.onclick = (event) => { event.stopPropagation(); copyToClipboard(r.missing, tdMissing); };
                                subRow.appendChild(tdMissing);
                                // סטטוס
                                const tdStatus = document.createElement('td');
                                const displayStatus = r.status;
                                const statusClass = displayStatus.includes('לוקט חלקית') ? 'pick-status-partially_picked' :
                                    (displayStatus.includes('המתנה') || displayStatus.includes('חסר') ? 'pick-status-pending' : '');
                                tdStatus.innerHTML = `<span class="badge ${statusClass} pick-status badge-status">${displayStatus}</span>`;
                                tdStatus.style.textAlign = 'center';
                                tdStatus.style.cursor = 'copy';
                                tdStatus.onclick = (event) => { event.stopPropagation(); copyToClipboard(displayStatus, tdStatus); };
                                subRow.appendChild(tdStatus);

                                subTbody.appendChild(subRow);
                            });
                            subTable.appendChild(subTbody);

                            // הוסף את הטבלה הפנימית לשורה הראשית
                            const subTableRow = document.createElement('tr');
                            subTableRow.classList.add('detail-row');
                            const subTableTd = document.createElement('td');
                            // קבע colspan כך שיכלול את כל העמודות (כולל עמודת החץ)
                            const headerCols = table.querySelectorAll('thead tr th').length;
                            subTableTd.colSpan = headerCols;
                            // הוספת רוחב מלא והסרת padding ל-TD
                            subTableTd.style.width = '100%';
                            subTableTd.style.minWidth = '100%';
                            subTableTd.style.maxWidth = '100%';
                            subTableTd.style.padding = '0';
                            subTableTd.appendChild(subTable);
                            tbody.appendChild(subTableRow);
                            subTableRow.appendChild(subTableTd);
                        }
                    });

                table.appendChild(tbody);
                container.appendChild(table);
                console.log('טבלה חדשה הורנדרה.');

                            // Setup checkbox listeners AFTER the table has been rendered completely
            setupCheckboxListeners();
            updateExportButtonText(); // Ensure button text is correct after render
            updateRebuildCheckboxState(); // Ensure rebuild checkbox state is correct after render
            updateHeaderExpandIcon(); // Call to update the header icon state
            };

            /**
             * Updates the summary text displayed above the table.
             * @param {Array<Object>} results - The current filtered results.
             */
            // const updateSummary = (results) => {
            //     const uniqueProducts = new Set(results.map(r => r.name));
            //     const totalMissing = results.reduce((acc, r) => acc + r.missing, 0);
            //     summaryDiv.innerHTML = `<i class="fa-light fa-receipt text-primary mx-2"></i>${uniqueProducts.size} מוצרים חסרים | <i class="fa-light fa-circle-exclamation text-danger mx-2"></i>${totalMissing} פריטים חסרים בסה"כ`;
            // };

            // Initial render
            // Force alphabetical sort on open
             // Initial render
 // Force alphabetical sort on open
 currentGroupHeaderSortColumn = 'name';
 currentGroupHeaderSortDirection = 'asc';
// לוודא שכל הקבוצות סגורות כברירת מחדל
expandedGroups.clear();
 applyFiltersAndSort();

            // Event listener for view mode selection - REMOVED (fixed to grouped view only)
            // viewModeSelect.onchange = (e) => {
            //     viewMode = e.target.value;
            //     localStorage.setItem('missingViewMode', viewMode);
            //     console.log(`מצב תצוגה שונה ל: ${viewMode}`);
            //     // ... rest of the function removed
            // };

            // Event listener for expand/collapse all button
            expandAllBtn.onclick = () => {
                console.log('כפתור פתח/סגור הכל נלחץ.');
                const allCurrentlyGroupKeys = getCurrentlyGroupedKeys();
                const isAllExpanded = allCurrentlyGroupKeys.length > 0 && allCurrentlyGroupKeys.every(key => expandedGroups.has(key));

                if (isAllExpanded) {
                    expandedGroups.clear();
                    console.log('כל הקבוצות נסגרו.');
                } else {
                    allCurrentlyGroupKeys.forEach(k => expandedGroups.add(k));
                    console.log('כל הקבוצות נפתחו.');
                }
                updateExpandAllButtonText(); // This will also call updateHeaderExpandIcon
                applyFiltersAndSort(); // Use applyFiltersAndSort to re-render and maintain other filters/sorts
            };
            updateExpandAllButtonText(); // Initial call

            // Event listener for search input - REMOVED (search functionality removed)
            // document.getElementById('search-missing').oninput = (e) => {
            //     console.log(`אירוע חיפוש: "${e.target.value}"`);
            //     applyFiltersAndSort();
            // };

            // Event listener for export to CSV button
            document.getElementById('excel-export-btn').onclick = () => {
                loadExcelJS(() => {
                    console.log('מתחיל ייצוא לאקסל...');

                    // בנה את המידע לייצוא - בדיוק כמו בטבלה
                    const data = [];
                    const grouped = {};

                    // השתמש ב-filteredAndSortedResults (הנתונים הממוינים)
                    filteredAndSortedResults.forEach(r => {
                        const key = `${encodeURIComponent(sanitizeForHtmlAttribute(r.name))}|||${encodeURIComponent(sanitizeForHtmlAttribute(r.barcode))}`;
                        if (!grouped[key]) grouped[key] = {
                            name: r.name,
                            barcode: r.barcode,
                            price: r.price,
                            totalPicked: 0,
                            totalMissing: 0,
                            orderIds: new Set()
                        };
                        grouped[key].totalPicked += r.picked;
                        grouped[key].totalMissing += r.missing;
                        grouped[key].orderIds.add(r.taskId);
                    });

                    console.log(`נמצאו ${Object.keys(grouped).length} קבוצות לייצוא`);

                    Object.values(grouped).forEach(group => {
                        data.push([
                            group.name,
                            group.barcode,
                            group.price || '',
                            (currentMode === 'negative' ? group.totalPicked : group.totalMissing),
                            group.orderIds.size
                        ]);
                    });

                    console.log(`נתונים לייצוא:`, data);

                    if (data.length === 0) {
                        showMessageModal('שים לב', 'אין נתונים לייצוא לאקסל. הטבלה ריקה.', false);
                        return;
                    }

                    // יצירת Workbook עם ExcelJS
                    const wb = new ExcelJS.Workbook();
                    const ws = wb.addWorksheet('חוסרים', {
                        views: [{
                            rightToLeft: true,
                            tabSelected: true,
                            workbookViewId: 0,
                            showGridLines: true,
                            showRowColHeaders: true,
                            showRuler: true,
                            showZeros: true
                        }]
                    });

                    // הוספת כותרת עליונה - שם החברה
                    const titleRow = ws.addRow([currentMode === 'negative' ? 'טבלת נגטיב - אניפט' : 'טבלת חוסרים - אניפט']);
                    titleRow.getCell(1).font = { bold: true, size: 14, name: 'Arial' };
                    titleRow.getCell(1).alignment = { horizontal: 'right', vertical: 'center' };

                    // הוספת שורה ריקה
                    ws.addRow([]);

                    // הוספת תאריך ושעה
                    const dateTimeRow = ws.addRow(['תאריך ושעה', '']);
                    dateTimeRow.getCell(1).font = { bold: true, size: 14, name: 'Arial' };
                    dateTimeRow.getCell(1).alignment = { horizontal: 'right', vertical: 'center' };

                    // הוספת התאריך והשעה בפורמט המבוקש
                    const now = new Date();
                    const day = String(now.getDate()).padStart(2, '0');
                    const month = String(now.getMonth() + 1).padStart(2, '0');
                    const year = now.getFullYear();
                    const hours = String(now.getHours()).padStart(2, '0');
                    const minutes = String(now.getMinutes()).padStart(2, '0');
                    const dateTimeString = `${day}/${month}/${year} ${hours}:${minutes}`;

                    dateTimeRow.getCell(2).value = dateTimeString;
                    dateTimeRow.getCell(2).font = { size: 12, name: 'Arial' };
                    dateTimeRow.getCell(2).alignment = { horizontal: 'right', vertical: 'center' };

                    // הוספת שורה ריקה
                    ws.addRow([]);

                    // הוספת כותרות הטבלה
                    const headers = ['שם מוצר', 'ברקוד', 'מחיר', (currentMode === 'negative' ? 'סה"כ לוקטו' : 'סה"כ חסרים'), 'הזמנות'];
                    const headerRow = ws.addRow(headers);
                    headerRow.font = { size: 14, name: 'Arial' }; // לא BOLD, גודל 14
                    headerRow.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFE0E0E0' }
                    };
                    headerRow.alignment = {
                        horizontal: 'right',
                        vertical: 'center'
                    };
                    headerRow.border = {
                        top: { style: 'thin' },
                        left: { style: 'thin' },
                        bottom: { style: 'thin' },
                        right: { style: 'thin' }
                    };

                    // הוספת נתונים
                    data.forEach(rowData => {
                        const row = ws.addRow(rowData);
                        row.alignment = {
                            horizontal: 'right',
                            vertical: 'center'
                        };
                        row.border = {
                            top: { style: 'thin' },
                            left: { style: 'thin' },
                            bottom: { style: 'thin' },
                            right: { style: 'thin' }
                        };
                    });

                    // הגדרת רוחב עמודות
                    ws.getColumn(1).width = 30; // שם מוצר
                    ws.getColumn(2).width = 15; // ברקוד
                    ws.getColumn(3).width = 10; // מחיר
                    ws.getColumn(4).width = 12; // סה"כ לוקטו
                    ws.getColumn(5).width = 10; // הזמנות

                    // התאמה אוטומטית של רוחב עמודות לפי התוכן
                    ws.columns.forEach(column => {
                        let maxLength = 0;
                        column.eachCell({ includeEmpty: true }, (cell) => {
                            const columnLength = cell.value ? cell.value.toString().length : 10;
                            if (columnLength > maxLength) {
                                maxLength = columnLength;
                            }
                        });
                        // הוספת רווח נוסף לקריאות טובה יותר
                        column.width = Math.min(maxLength + 3, 50); // מקסימום 50 תווים
                    });

                    // הגדרת סינון אוטומטי (על הכותרות בלבד)
                    const lastDataRow = 4 + data.length; // 4 שורות כותרת + נתונים
                    ws.autoFilter = {
                        from: 'A4',
                        to: `E${lastDataRow}`
                    };

                    // הגדרות Workbook
                    wb.creator = 'Lionwheel System';
                    wb.lastModifiedBy = 'Lionwheel System';
                    wb.created = new Date();
                    wb.modified = new Date();
                    wb.title = 'טבלת חוסרים';
                    wb.subject = 'רשימת פריטים חסרים';
                    wb.keywords = 'חוסרים, מלאי, Lionwheel';
                    wb.category = 'Business';
                    wb.description = 'טבלת חוסרים מ-Lionwheel';

                    // הגדרות Workbook Views
                    wb.views = [{
                        xWindow: 240,
                        yWindow: 15,
                        windowWidth: 16095,
                        windowHeight: 9660,
                        firstSheet: 0,
                        activeTab: 0,
                        showGridLines: true,
                        showRowColHeaders: true,
                        showRuler: true,
                        showZeros: true
                    }];

                    // ייצוא הקובץ
                    wb.xlsx.writeBuffer().then(buffer => {
                        const blob = new Blob([buffer], {
                            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                        });
                        const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                        a.href = url;
                        a.download = 'missing_items.xlsx';
                a.click();
                        URL.revokeObjectURL(url);

                        console.log('ייצוא לאקסל הושלם בהצלחה');
                        showMessageModal('ייצוא הושלם', '<div style="text-align: center;"><img src="https://upload.wikimedia.org/wikipedia/commons/3/34/Microsoft_Office_Excel_%282019%E2%80%93present%29.svg" alt="Excel" style="width: 64px; height: 64px; margin-bottom: 15px;"><br><strong>קובץ האקסל נשמר בהצלחה.</strong></div>', false, {
                            headerBg: '#33c481',
                            headerText: '#ffffff',
                            border: '#2ba06a',
                            closeIcon: '#ffffff'
                        });
                    }).catch(error => {
                        console.error('שגיאה בייצוא לאקסל:', error);
                        showMessageModal('שגיאה', 'שגיאה בייצוא הקובץ לאקסל. אנא נסה שוב.', true);
                    });
                });
            };

            // Event listener for export to Google Sheets button
            const exportToSheetsBtn = document.getElementById('export-to-sheets-btn');
            if (exportToSheetsBtn) {
                exportToSheetsBtn.onclick = () => {
                console.log('→ Export to Sheets: will POST to', GAS_URL);

                // Check if rebuild checkbox is checked
                const rebuildCheckbox = document.getElementById('rebuild-table-checkbox');
                const shouldRebuild = rebuildCheckbox && rebuildCheckbox.checked;

                console.log('🔄 Export button clicked, rebuild mode:', shouldRebuild);

                const originalBtnHTML = exportToSheetsButton.innerHTML;
                document.body.style.cursor = 'wait';
                exportToSheetsButton.disabled = true;
                exportToSheetsButton.innerHTML = `<i class="fa-light fa-hourglass-clock mr-1"></i> מעדכן, אנא המתן...`; // Changed icon

                const restoreUI = () => {
                    exportToSheetsButton.disabled = false;
                    exportToSheetsButton.innerHTML = originalBtnHTML;
                    document.body.style.cursor = 'default';
                };

                let itemsToExport;
                // If items are specifically selected, export only them. Otherwise, export all filtered and sorted items.
                if (selectedItemUniqueIds.size > 0) {
                    itemsToExport = allResults.filter(item => selectedItemUniqueIds.has(item.uniqueId));
                    console.log(`ייצוא ${itemsToExport.length} פריטים מסומנים.`);
                } else {
                    itemsToExport = filteredAndSortedResults;
                    console.log(`ייצוא כל ${itemsToExport.length} הפריטים המוצגים (לא נבחרו פריטים ספציפיים).`);
                }

                if (itemsToExport.length === 0) {
                    showMessageModal('שים לב', 'אין פריטים לייצוא. הטבלה ריקה או לא נבחרו פריטים.', false); // Changed to non-error as it's a informational message
                    restoreUI();
                    return;
                }

                // Prepare payload for Google Sheets
                console.log('Starting payload preparation...');
                const payloadMap = new Map();

                itemsToExport.forEach((r, index) => {
                    const key = r.barcode;
                    console.log(`Processing item ${index}: barcode=${key}, quantity=${r.missing}`);

                    if (payloadMap.has(key)) {
                        // אם הברקוד כבר קיים, הוסף את הכמות
                        const existing = payloadMap.get(key);
                        const oldQuantity = existing.quantity;
                        existing.quantity += r.missing;
                        console.log(`Merged duplicate: ${key}, old quantity: ${oldQuantity}, new quantity: ${existing.quantity}`);
                    } else {
                        // אם הברקוד חדש, הוסף אותו
                        payloadMap.set(key, {
                            barcode: r.barcode,
                            product: r.name,
                            quantity: r.missing
                        });
                        console.log(`Added new item: ${key}, quantity: ${r.missing}`);
                    }
                });

                let payload = Array.from(payloadMap.values());
                console.log(`Final payload: ${payload.length} unique items (was ${itemsToExport.length} total items)`);

                // Check if this is a selective export (specific items were selected)
                const isSelectiveExport = selectedItemUniqueIds.size > 0;
                console.log(`🎯 SELECTIVE EXPORT: ${isSelectiveExport ? 'Yes' : 'No'} (${selectedItemUniqueIds.size} items selected)`);

                // If rebuild mode is enabled, wrap the payload
                if (shouldRebuild) {
                    console.log('🔄 REBUILD MODE: Wrapping payload with rebuild: true');
                    payload = {
                        rebuild: true,
                        items: payload
                    };
                } else if (isSelectiveExport) {
                    // If selective export is enabled, wrap the payload
                    console.log('🎯 SELECTIVE EXPORT MODE: Wrapping payload with selectiveExport: true');
                    payload = {
                        selectiveExport: true,
                        items: payload
                    };
                }

                console.log('📤 שליחת נתונים לשרת Google Apps Script...');
                console.log('📊 כמות פריטים:', payload.length);
                console.log('🔄 מצב בנייה מחדש:', shouldRebuild ? 'כן' : 'לא');
                console.log('🎯 ייצוא סלקטיבי:', isSelectiveExport ? 'כן' : 'לא');

                GM_xmlhttpRequest({
                    method: 'POST',
                    url: GAS_URL,
                    data: JSON.stringify(payload),
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    onload: function(response) {
                        try {
                            console.log("📥 תשובה התקבלה מהשרת");
                            console.log("📊 סטטוס:", response.status);
                            console.log("📄 תוכן התשובה:", response.responseText.substring(0, 200) + (response.responseText.length > 200 ? '...' : ''));

                            // בדוק אם התשובה מתחילה ב-HTML
                            if (response.responseText.trim().startsWith('<!DOCTYPE') || response.responseText.trim().startsWith('<html')) {
                                console.error('השרת החזיר HTML במקום JSON. זה יכול להיות דף שגיאה או בעיית הרשאות.');

                                // ניסיון לחלץ מידע מהשגיאה
                                let errorDetails = 'השרת החזיר דף HTML במקום JSON.';

                                // בדוק אם יש הודעת שגיאה ספציפית ב-HTML
                                const errorMatch = response.responseText.match(/<title[^>]*>([^<]+)<\/title>/i);
                                if (errorMatch) {
                                    errorDetails += `\nכותרת השגיאה: ${errorMatch[1]}`;
                                }

                                // בדוק אם יש תוכן שגיאה נוסף
                                const bodyMatch = response.responseText.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
                                if (bodyMatch) {
                                    const bodyText = bodyMatch[1].replace(/<[^>]*>/g, ' ').trim();
                                    if (bodyText.length > 0 && bodyText.length < 500) {
                                        errorDetails += `\nפרטי השגיאה: ${bodyText}`;
                                    }
                                }

                                errorDetails += '\n\nאפשרויות לפתרון:';
                                errorDetails += '\n1. וודא שהסקריפט Google Apps Script פורסם כשירות web';
                                errorDetails += '\n2. וודא שהסקריפט מורשה לגישה';
                                errorDetails += '\n3. בדוק שה-URL נכון';
                                errorDetails += '\n4. נסה לרענן את הדף ולנסות שוב';

                                showMessageModal('שגיאה', errorDetails, true);
                                restoreUI();
                                return;
                            }

                            const result = JSON.parse(response.responseText);
                            console.log("✅ תשובת JSON פוענחה בהצלחה");
                            console.log("📊 תוצאות:", result);
                            console.log("🔍 שדה processed:", result.processed);
                            console.log("🔍 שדה added:", result.added);
                            console.log("🔍 שדה updated:", result.updated);
                            console.log("🔍 שדה unchanged:", result.unchanged);
                            console.log("🔍 שדה notFound:", result.notFound);

                            let successMessage = shouldRebuild ? '✅ בנייה מחדש הושלמה בהצלחה!' :
                                                (isSelectiveExport ? '✅ ייצוא סלקטיבי הושלם בהצלחה!' : '✅ עדכון הושלם בהצלחה!');

                            if (result.added > 0 && result.addedNames && result.addedNames.length > 0) {
                                successMessage += `\n\n➕ נוספו ${result.added} פריטים חדשים:`;
                                if (result.addedNames.length > 10) {
                                    // הצג רק 10 פריטים ראשונים + כפתור להרחבה
                                    const displayNames = result.addedNames.slice(0, 10);
                                    successMessage += `<div id="short-added-list">`;
                                    successMessage += '\n - ' + displayNames.join('\n - ');
                                    successMessage += `</div>`;
                                    successMessage += `<div id="full-added-list" style="display: none; max-height: 300px; overflow-y: auto;">`;
                                    successMessage += '\n - ' + result.addedNames.join('\n - ');
                                    successMessage += `</div>`;
                                    successMessage += `\n<span id="show-all-added" style="color: #007bff; cursor: pointer; text-decoration: underline; font-size: 0.9em;">הצג הכל</span>`;
                                    successMessage += `\n<span id="hide-added" style="color: #6c757d; cursor: pointer; text-decoration: underline; font-size: 0.9em; display: none;">הצג פחות</span>`;
                                } else {
                                    // אם יש 10 פריטים או פחות, הצג הכל
                                    successMessage += '\n - ' + result.addedNames.join('\n - ');
                                }
                            }

                            if (result.updated > 0 && result.updatedNames && result.updatedNames.length > 0) {
                                successMessage += `\n\n🔄 עודכנו ${result.updated} פריטים קיימים:`;
                                if (result.updatedNames.length > 10) {
                                    // הצג רק 10 פריטים ראשונים + כפתור להרחבה
                                    const displayNames = result.updatedNames.slice(0, 10);
                                    successMessage += `<div id="short-updated-list">`;
                                    successMessage += '\n - ' + displayNames.join('\n - ');
                                    successMessage += `</div>`;
                                    successMessage += `<div id="full-updated-list" style="display: none; max-height: 300px; overflow-y: auto;">`;
                                    successMessage += '\n - ' + result.updatedNames.join('\n - ');
                                    successMessage += `</div>`;
                                    successMessage += `\n<span id="show-all-updated" style="color: #007bff; cursor: pointer; text-decoration: underline; font-size: 0.9em;">הצג הכל</span>`;
                                    successMessage += `\n<span id="hide-updated" style="color: #6c757d; cursor: pointer; text-decoration: underline; font-size: 0.9em; display: none;">הצג פחות</span>`;
                                } else {
                                    // אם יש 10 פריטים או פחות, הצג הכל
                                    successMessage += '\n - ' + result.updatedNames.join('\n - ');
                                }
                            }

                            if (result.unchanged > 0) {
                                successMessage += `\n\n⏸️ ${result.unchanged} פריטים לא השתנו (כמות זהה).`;
                            }

                            if (result.notFound > 0 && result.notFoundNames && result.notFoundNames.length > 0) {
                                successMessage += `\n\n❌ ${result.notFound} פריטים לא נמצאו ב-Lionwheel:`;
                                if (result.notFoundNames.length > 10) {
                                    // הצג רק 10 פריטים ראשונים + כפתור להרחבה
                                    const displayNames = result.notFoundNames.slice(0, 10);
                                    successMessage += `<div id="short-notfound-list">`;
                                    successMessage += '\n - ' + displayNames.join('\n - ');
                                    successMessage += `</div>`;
                                    successMessage += `<div id="full-notfound-list" style="display: none; max-height: 300px; overflow-y: auto;">`;
                                    successMessage += '\n - ' + result.notFoundNames.join('\n - ');
                                    successMessage += `</div>`;
                                    successMessage += `\n<span id="show-all-notfound" style="color: #007bff; cursor: pointer; text-decoration: underline; font-size: 0.9em;">הצג הכל</span>`;
                                    successMessage += `\n<span id="hide-notfound" style="color: #6c757d; cursor: pointer; text-decoration: underline; font-size: 0.9em; display: none;">הצג פחות</span>`;
                                } else {
                                    // אם יש 10 פריטים או פחות, הצג הכל
                                    successMessage += '\n - ' + result.notFoundNames.join('\n - ');
                                }
                            }

                            const processedFromServer = Number.isFinite(result.processed) ? result.processed : null;

                            if ((processedFromServer !== null && processedFromServer === 0) ||
                                (processedFromServer === null && result.added === 0 && result.updated === 0 && result.notFound === 0)) {
                                successMessage += '\n\nℹ️ לא נמצאו שינויים לעדכון - כל הפריטים כבר מעודכנים.';

                                // הודעה נוספת אם אין שדה processed (גרסה ישנה)
                                if (processedFromServer === null) {
                                    successMessage += '\n\n⚠️  הערה: השרת לא החזיר מידע על מספר הפריטים שעובדו.';
                                    successMessage += '\n💡 ייתכן שה-URL מצביע על גרסה ישנה של הסקריפט.';
                                    successMessage += '\n🔧 מומלץ לפרוס מחדש את הסקריפט ולעדכן את ה-URL.';
                                }
                            }

                            // Add summary at the end
                            const totalProcessed = processedFromServer !== null
                                ? processedFromServer
                                : ((result.added || 0) + (result.updated || 0) + (result.unchanged || 0) + (result.notFound || 0));
                            successMessage += `\n\n📊 סיכום: ${totalProcessed} פריטים עובדו (${result.added || 0} חדשים, ${result.updated || 0} עודכנו, ${result.unchanged || 0} לא השתנו, ${result.notFound || 0} לא נמצאו ב-Lionwheel)`;

                            showMessageModal('סטטוס ייצוא', successMessage);

                        } catch (e) {
                            console.error('❌ שגיאה בניתוח תשובת השרת:', e);
                            console.error('📄 תוכן התשובה המלא:', response.responseText);
                            console.error('🔍 ניסיון לפרסר JSON:', e.message);

                            // בדיקה אם התשובה היא HTML (גרסה ישנה)
                            if (response.responseText.includes('<!DOCTYPE') || response.responseText.includes('<html')) {
                                showMessageModal('שגיאה', '❌ השרת מחזיר דף HTML במקום JSON.\n\n💡 זה אומר שה-URL מצביע על גרסה ישנה של הסקריפט.\n\n🔧 פתרון:\n1. פרוס מחדש את הסקריפט Google Apps Script\n2. עדכן את GAS_URL בקובץ lionwheel_table.js\n3. בדוק חיבור עם כפתור "בדוק חיבור"', true);
                            } else {
                                showMessageModal('שגיאה', '✅ הנתונים נשלחו, אך התקבלה תשובה לא צפויה מהשרת.\n\n📄 תשובת השרת:\n' + response.responseText.substring(0, 200), true);
                            }
                        } finally {
                            restoreUI();
                        }
                    },
                    onerror: function(error) {
                        console.error('❌ שגיאה בשליחה ל-Google Sheets');
                        console.error('🔍 פרטי השגיאה:', error);

                        let errorMessage = '❌ שליחה נכשלה.';

                        // בדוק אם זו שגיאת רשת ספציפית
                        if (error.status === 0) {
                            errorMessage += '\n\n🔍 סיבות אפשריות:';
                            errorMessage += '\n• אין חיבור לאינטרנט';
                            errorMessage += '\n• השרת לא זמין';
                            errorMessage += '\n• בעיית CORS (Cross-Origin Resource Sharing)';
                        } else if (error.status === 403) {
                            errorMessage += '\n\n🔍 סיבות אפשריות:';
                            errorMessage += '\n• הסקריפט Google Apps Script לא מורשה';
                            errorMessage += '\n• יש צורך באישור נוסף';
                        } else if (error.status === 404) {
                            errorMessage += '\n\n🔍 סיבות אפשריות:';
                            errorMessage += '\n• ה-URL של הסקריפט שגוי';
                            errorMessage += '\n• הסקריפט לא פורסם כשירות web';
                        } else if (error.status) {
                            errorMessage += `\n\n🔍 סטטוס שגיאה: ${error.status}`;
                        }

                        errorMessage += '\n\n💡 נסה:';
                        errorMessage += '\n1. לבדוק את החיבור לשרת (כפתור "בדוק חיבור")';
                        errorMessage += '\n2. לרענן את הדף ולנסות שוב';
                        errorMessage += '\n3. לוודא שהסקריפט Google Apps Script פורסם ומורשה';

                        showMessageModal('שגיאה', errorMessage, true);
                        restoreUI();
                    }
                });
            };
            }

            // Event listener for test connection button
            const testConnectionBtn = document.getElementById('test-connection-btn');
            if (testConnectionBtn) {
                testConnectionBtn.onclick = async () => {
                    console.log('בודק חיבור לשרת Google Apps Script...');

                    const originalBtnHTML = testConnectionBtn.innerHTML;
                    testConnectionBtn.disabled = true;
                    testConnectionBtn.innerHTML = `<i class="fa-light fa-spinner fa-spin mr-1"></i>בודק...`;

                    try {
                        const sheetInfo = await testServerConnection();

                        if (typeof sheetInfo === 'object' && sheetInfo.success) {
                            // הצג מידע מפורט על הקובץ והגיליון
                            let message = '✅ החיבור לשרת Google Apps Script תקין!\n\n';

                            if (sheetInfo.version) {
                                message += `🔧 גרסת השרת: ${sheetInfo.version}\n`;
                            }

                            if (sheetInfo.spreadsheet) {
                                message += '📋 מידע על הקובץ:\n';
                                message += `📄 שם הקובץ: ${sheetInfo.spreadsheet.name}\n`;
                                message += `🆔 מזהה קובץ: ${sheetInfo.sheetId}\n`;
                                message += `📊 שם גיליון: ${sheetInfo.sheetName}\n`;
                                if (sheetInfo.spreadsheet.ownerEmail) {
                                    message += `👤 בעלים: ${sheetInfo.spreadsheet.ownerEmail}\n`;
                                } else if (sheetInfo.spreadsheet.owner) {
                                    message += `👤 בעלים: ${sheetInfo.spreadsheet.owner}\n`;
                                }
                                if (sheetInfo.spreadsheet.lastModified) {
                                    message += `📅 שונה לאחרונה: ${new Date(sheetInfo.spreadsheet.lastModified).toLocaleString('he-IL')}\n`;
                                }
                                message += '\n📊 מידע על הגיליון:\n';
                                message += `📈 שורות: ${sheetInfo.sheet.lastRow} מתוך ${sheetInfo.sheet.numRows}\n`;
                                message += `📉 עמודות: ${sheetInfo.sheet.lastColumn} מתוך ${sheetInfo.sheet.numColumns}\n\n`;
                                if (sheetInfo.spreadsheet.url) {
                                    message += `🔗 קישור לקובץ:\n${sheetInfo.spreadsheet.url}`;
                                }
                            } else if (sheetInfo.basicConnection) {
                                message += '📡 חיבור בסיסי תקין\n';
                                if (sheetInfo.message) {
                                    message += `📝 הודעה: ${sheetInfo.message}\n`;
                                }
                                message += '\n💡 הערה: מידע מפורט על הקובץ זמין רק עם הרשאות מתקדמות';
                            }

                            showMessageModal('בדיקת חיבור', message, false, {
                                headerBg: '#28a745',
                                headerText: '#ffffff',
                                border: '#28a745',
                                closeIcon: '#ffffff'
                            });
                        } else if (typeof sheetInfo === 'object' && !sheetInfo.success) {
                            // הצג שגיאה ספציפית
                            showMessageModal('שגיאה בחיבור', `❌ בעיה בגישה לקובץ:\n\n${sheetInfo.error}\n\nמזהה קובץ: ${sheetInfo.sheetId}\nשם גיליון: ${sheetInfo.sheetName}`, true);
                        } else {
                            // חיבור תקין אבל לא קיבלנו מידע מפורט
                            showMessageModal('בדיקת חיבור', '✅ החיבור לשרת Google Apps Script תקין!', false, {
                                headerBg: '#28a745',
                                headerText: '#ffffff',
                                border: '#28a745',
                                closeIcon: '#ffffff'
                            });
                        }
                    } catch (error) {
                        console.error('שגיאה בבדיקת חיבור:', error);
                        showMessageModal('שגיאה בחיבור', `❌ החיבור לשרת נכשל:\n\n${error.message}\n\nאפשרויות לפתרון:\n1. וודא שהסקריפט Google Apps Script פורסם כשירות web\n2. וודא שהסקריפט מורשה לגישה\n3. בדוק שה-URL נכון\n4. נסה לרענן את הדף ולנסות שוב`, true);
                    } finally {
                        testConnectionBtn.disabled = false;
                        testConnectionBtn.innerHTML = originalBtnHTML;
                    }
                };
            }

            // Event listener for print button
            document.getElementById('print-btn').onclick = () => {
                const printWindow = window.open('', '', 'height=600,width=900');
                printWindow.document.write('<html dir="rtl" lang="he"><head><title>רשימת חוסרים</title>');
                printWindow.document.write('<style>body{direction:rtl;text-align:right;font-family:Arial,sans-serif}table{width:100%;border-collapse:collapse;font-size:14px;direction:rtl}td,th{border:1px solid #ccc;padding:6px;text-align:center}thead{background:#eee}h3{text-align:center;direction:rtl}</style>');
                printWindow.document.write('</head><body>');
                printWindow.document.write('<h3>רשימת חוסרים</h3>');
                printWindow.document.write(document.getElementById('missing-table-container').innerHTML);
                printWindow.document.close();
                printWindow.print();
                console.log('🖨️ חלון הדפסה נפתח');
            };

            // --- Gallery toggle ---
            const galleryBtn = document.getElementById('toggle-gallery-btn');
            if (galleryBtn){
              galleryBtn.addEventListener('click', () => {
                isGalleryView = !isGalleryView;
                toggleGallery(isGalleryView);
              }, {passive:true});
            }

            // --- Gallery close button (X) ---
            const galleryCloseBtn = document.getElementById('gallery-close-btn');
            if (galleryCloseBtn){
              galleryCloseBtn.addEventListener('click', () => {
                isGalleryView = false;
                toggleGallery(false);
              }, {passive:true});
            }

            function toggleGallery(show){
              const tableC = document.getElementById('missing-table-container');
              const galC   = document.getElementById('missing-gallery-container');
              const btn    = document.getElementById('toggle-gallery-btn');
              const closeBtn = document.getElementById('gallery-close-btn');
              if (!galC) return;
              if (show){
                tableC.style.display = 'none';
                galC.style.display = 'block';
                if (btn){ btn.classList.remove('btn-outline-secondary'); btn.classList.add('btn-primary'); }
                if (closeBtn){ closeBtn.style.display = 'flex'; }
                // Loader immediately (לפעמים אפילו לשלד לוקח זמן להופיע)
                if (!galC.querySelector('.missing-gallery-loader')){
                  const l = document.createElement('div'); l.className='missing-gallery-loader';
                  l.innerHTML = '<div class="missing-gallery-spinner" aria-label="Loading"></div>';
                  galC.appendChild(l);
                }
                renderMissingGallery().catch(e => console.error('Gallery render error:', e)); // initial render
              } else {
                galC.style.display = 'none';
                tableC.style.display = '';
                if (btn){ btn.classList.add('btn-outline-secondary'); btn.classList.remove('btn-primary'); }
                if (closeBtn){ closeBtn.style.display = 'none'; }
              }
            }

            // --- Toggle Checkmark Overlay ---
            function toggleCheckmarkOverlay(card) {
                // בדוק אם כבר יש checkmark
                const existingCheckmark = card.querySelector('.checkmark-overlay');
                
                if (existingCheckmark) {
                    // הסר את ה-checkmark
                    existingCheckmark.remove();
                    card.classList.remove('checked');
                } else {
                    // הוסף checkmark
                    const checkmarkOverlay = document.createElement('div');
                    checkmarkOverlay.className = 'checkmark-overlay';
                    checkmarkOverlay.innerHTML = `
                        <div class="checkmark-icon">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" fill="#10B981"/>
                            </svg>
                        </div>
                    `;
                    card.appendChild(checkmarkOverlay);
                    card.classList.add('checked');
                }
            }

            // --- Render Gallery from filteredAndSortedResults ---
            async function renderMissingGallery(){
              const grid = document.getElementById('missing-gallery-grid');
              if (!grid) return;
              grid.innerHTML = '';
              // 1) Loader מיידי (אם לא קיים)
              const skelFrag = document.createDocumentFragment();
              const skelCount = 48;
              for (let i=0;i<skelCount;i++){ const s = document.createElement('div'); s.className='missing-skel'; skelFrag.appendChild(s); }
              grid.appendChild(skelFrag);

              // 2) הבאת דאטה + הכנת תמונות
              await ensureImagesReady(); // ודא שמאגר התמונות זמין
              // Aggregate by name+barcode: SUM quantities across all orders for the same item.
              // This fixes the badge showing only a single order's quantity.
              const agg = new Map();
              (filteredAndSortedResults || []).forEach(r => {
                const key = `${r.name}|||${r.barcode}`;
                const q = Number.isFinite(+getItemQuantity(r)) ? +getItemQuantity(r) : 0;
                if (!agg.has(key)) {
                  agg.set(key, { rep: r, qtySum: q });
                } else {
                  const s = agg.get(key);
                  s.qtySum += q;
                }
              });
              // 3) Placeholder טקסט שממלא 100×100
              const buildTextPlaceholder = (txt='') => {
                const clean = (txt||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
                // חיתוך שורות קצרות כדי לאפשר פונט גדול
                const words = clean.split(/\s+/);
                const lines = [];
                let line='';
                const maxChars = 8;
                for (const w of words){
                  if ((line+w).length<=maxChars){ line += (line?' ':'')+w; }
                  else { lines.push(line); line = w; }
                }
                if (line) lines.push(line);
                const n = Math.max(1, Math.min(3, lines.length));
                const font = [26,22,18][n-1];
                const yStart = 50 - ((n-1)*font*0.95)/2;
                const rows = lines.slice(0,3).map((t,i)=>`<text x="50%" y="${yStart + i*font*0.95}" text-anchor="middle" dominant-baseline="middle" font-family="Arial" font-weight="700" font-size="${font}" fill="#4b5563">${t}</text>`).join('');
                return 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100%" height="100%" fill="#f4f5f7"/>${rows}</svg>`);
              };

              // 4) דאטה עבור Overlay
              const overlayItems = [];
              const cards = [];
              const preloadFirst = [];
              // Use aggregated entries (rep = representative row, qtySum = total across rows)
              agg.forEach(({ rep: item, qtySum }) => {
                const name    = item.name || '';
                const imgUrl  = findImageForItem(item);
                const card = document.createElement('div');
                card.className = 'missing-gallery-card';
                const img = document.createElement('img');
                img.loading = 'lazy';
                img.alt = name;
                img.src = imgUrl || buildTextPlaceholder(name);

                // Quantity already aggregated across all rows of the same item
                const resolvedQty = Number.isFinite(+qtySum) ? +qtySum : 0;

                // פריט עבור overlay (לפי המודל של toolbox)
                const idx = overlayItems.length; // שמור אינדקס נכון ללחיצה
                overlayItems.push({
                  fullSizeUrl: toFullImageUrl(imgUrl || ''),
                  thumbnailUrl: imgUrl || '',
                  productName: name,
                  sku: item.makt || item.sku || (item.barcode||'').toString(),
                  // Store aggregated quantity so overlay thumbnails show the same sum
                  quantity: (resolvedQty > 0) ? resolvedQty : '',
                  price: item.price || null,
                  link: item.link || null
                });

                // לחיצה רגילה - toggle checkmark overlay
                card.addEventListener('click', (e) => {
                    // בדוק אם זה לא היה long press
                    if (!isLongPress) {
                        toggleCheckmarkOverlay(card);
                    }
                });
                
                // לחיצה ארוכה - פתיחת גלריה
                let longPressTimer = null;
                let isLongPress = false;
                
                // Mouse events
                card.addEventListener('mousedown', (e) => {
                    isLongPress = false;
                    longPressTimer = setTimeout(() => {
                        isLongPress = true;
                        showGalleryOverlay(overlayItems, idx);
                    }, 800); // 800ms for long press
                });
                
                card.addEventListener('mouseup', () => {
                    clearTimeout(longPressTimer);
                });
                
                card.addEventListener('mouseleave', () => {
                    clearTimeout(longPressTimer);
                });
                
                // Touch events for mobile devices
                card.addEventListener('touchstart', (e) => {
                    isLongPress = false;
                    longPressTimer = setTimeout(() => {
                        isLongPress = true;
                        showGalleryOverlay(overlayItems, idx);
                    }, 800); // 800ms for long press
                });
                
                card.addEventListener('touchend', () => {
                    clearTimeout(longPressTimer);
                });
                
                card.addEventListener('touchcancel', () => {
                    clearTimeout(longPressTimer);
                });
                
                // Prevent context menu on long press
                card.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                });
                // === Quantity badge (grid) ===
                const qty = resolvedQty;
                if (qty > 1){
                  const badge = document.createElement('span');
                  badge.className = 'lw-thumb-badge';
                  badge.textContent = 'X' + qty;
                  card.appendChild(badge);
                }

                // overlay
                const ov = document.createElement('div');
                ov.className = 'missing-gallery-overlay';
                const nm = document.createElement('span'); nm.className='missing-gallery-name'; nm.textContent = name;
                const bc = document.createElement('span'); bc.className='missing-gallery-code'; bc.textContent = (item.barcode||'').toString();
                ov.appendChild(nm); ov.appendChild(bc);
                card.appendChild(img); card.appendChild(ov);
                cards.push(card);
                // נחמם 12 ראשונים כדי לאפשר מעבר Skeleton→תמונות
                if (preloadFirst.length < 12){
                  const p = new Image(); p.src = img.src; preloadFirst.push(new Promise(r=>{ p.onload=p.onerror=()=>r(); }));
                }
              });

              // 5) מחכים למעט תמונות/טיימאאוט, ואז מחליפים את ה-skeleton בכרטיסים
              const loader = document.querySelector('#missing-gallery-container .missing-gallery-loader');
              if (loader) loader.remove(); // הסר Loader – עכשיו נראה skeleton
              try { await Promise.race([ Promise.allSettled(preloadFirst), new Promise(r=>setTimeout(r,900)) ]); } catch(_){}
              grid.innerHTML = '';
              const frag = document.createDocumentFragment(); cards.forEach(c=>frag.appendChild(c)); grid.appendChild(frag);
            }

            // Event listener for main sort dropdown - REMOVED (sorting functionality removed)
            // document.getElementById('main-sort-by').onchange = (e) => {
            //     currentMainSortType = e.target.value;
            //     // Reset header sort when selecting from dropdown
            //     currentGroupHeaderSortColumn = null;
            //     currentGroupHeaderSortDirection = 'asc';
            //     console.log(`מיון קבוצות ראשי שונה ל: ${currentMainSortType}`);
            //     applyFiltersAndSort();
            // };

            // Filter controls - REMOVED (filtering functionality removed)
            // const filterFromDateInput = document.getElementById('filter-from-date');
            // const filterToDateInput = document.getElementById('filter-to-date');
            // const applyFiltersBtn = document.getElementById('apply-filters-btn');

            // Event listener for apply filters button - REMOVED
            // applyFiltersBtn.onclick = () => {
            //     filterFromDate = filterFromDateInput.value ? new Date(filterFromDateInput.value) : null;
            //     filterToDate = filterToDateInput.value ? new Date(filterToDateInput.value) : null;
            //     if (filterFromDate) filterFromDate.setHours(0,0,0,0);
            //     if (filterToDate) filterToDate.setHours(23,59,59,999);
            //     console.log(`הוחל סינון תאריכים: מ-${filterFromDateInput.value || 'התחלה'} עד-${filterToDateInput.value || 'היום'}`);
            //     applyFiltersAndSort();
            // };

            // עדכן את ה-data attribute של body לפי מצב
            document.body.setAttribute('data-negative-mode', currentMode === 'negative' ? 'true' : 'false');
            console.log('🎨 עיצובים דינמיים נוספו');
            console.log('📱 מצב responsive מופעל');

            // Add dynamic styles using GM_addStyle
            GM_addStyle(`
                /* General styling for modal buttons and selects */
                .modal-header .btn, .modal-header select {
                    margin-left: 5px !important;
                    margin-right: 5px !important;
                }

                /* Spacing for filter/search controls */
                .form-group.mb-3.d-flex.gap-2.align-items-center.flex-wrap > * {
                    margin-left: 5px !important;
                    margin-right: 5px !important;
                }
                .form-group.mb-3.d-flex.gap-2.align-items-center.flex-wrap #search-missing {
                    max-width: none !important;
                }

                /* Specific column widths for grouped view (main headers) */
                /* Adjusted for new checkbox column */
                #missing-table-container table.view-grouped thead th:nth-child(1) { /* Checkbox column */
                    width: 60px;
                }
                #missing-table-container table.view-grouped thead th:nth-child(2) { /* Expand column */
                    width: 30px;
                }
                #missing-table-container table.view-grouped thead th:nth-child(3) { /* Total Missing column */
                    width: 100px;
                }
                #missing-table-container table.view-grouped thead th:nth-child(6) { /* מחיר column */
                    width: 80px; /* Adjust as needed */
                }

                /* Styling for sub-headers for inner items */
                #missing-table-container table tbody .bg-gray-100 {
                    background-color: transparent !important;
                    color: #495057 !important;
                    font-size: 0.85em;
                }
                #missing-table-container table tbody .bg-gray-100 td {
                    border-top: 1px solid #dee2e6 !important;
                    border-bottom: 1px solid #dee2e6 !important;
                    padding: 4px 6px !important;
                }

                /* Styling for individual item rows */
                .missing-item-sub-row td {
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    max-width: 150px; /* General max width */
                    box-sizing: border-box;
                }

                /* Checkbox styling */
                input[type="checkbox"] {
                    -webkit-appearance: none;
                    -moz-appearance: none;
                    appearance: none;
                    display: inline-block;
                    position: relative;
                    width: 18px;
                    height: 18px;
                    border: 1.5px solid #ced4da;
                    border-radius: 4px;
                    cursor: pointer;
                    outline: none;
                    transition: all 0.2s ease-in-out;
                    vertical-align: middle;
                }

                input[type="checkbox"]:checked {
                    background-color: #007bff;
                    border-color: #007bff;
                }

                input[type="checkbox"]:checked::after {
                    content: '';
                    position: absolute;
                    left: 5px;
                    top: 1px;
                    width: 5px;
                    height: 10px;
                    border: solid white;
                    border-width: 0 2px 2px 0;
                    transform: rotate(45deg);
                }

                input[type="checkbox"]:focus {
                    box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25);
                }

                /* Indeterminate state for checkboxes */
                input[type="checkbox"]:indeterminate {
                    background-color: #6c757d; /* Grey */
                    border-color: #6c757d;
                }

                input[type="checkbox"]:indeterminate::after {
                    content: '';
                    position: absolute;
                    left: 3px; /* Adjust as needed */
                    top: 7px; /* Adjust as needed */
                    width: 10px; /* Horizontal line width */
                    height: 2px; /* Horizontal line thickness */
                    background-color: white;
                    border-width: 0; /* No border for indeterminate */
                    transform: none; /* No rotation */
                }

                /* Custom styles for status badges */
                .pick-status-partially_picked {
                    background-color: orange !important;
                    color: #fff !important;
                }

                .pick-status-pending {
                    background-color: #ff0 !important; /* Yellow */
                    color: #000 !important; /* Black */
                }

                .badge.pick-status.badge-status {
                    border-radius: .42rem;
                    display: inline-flex !important; /* Use inline-flex for center alignment */
                    align-items: center;
                    justify-content: center;
                    font-size: 85%;
                    font-weight: 500;
                    line-height: 1;
                    padding: .5em .75em;
                    text-align: center;
                    transition: color .3s ease-in-out, background-color .3s ease-in-out, border-color .3s ease-in-out, box-shadow .3s ease-in-out;
                    vertical-align: middle; /* Adjusted from initial to middle */
                    white-space: nowrap;
                    min-width: 70px; /* As per your CSS, ensures consistent width */
                    height: fit-content; /* Ensure height adjusts to content */
                }

                /* Responsive adjustments */
                @media (max-width: 768px) {
                    #missing-items-modal .modal-dialog {
                        max-width: 95% !important;
                        margin: 10px auto;
                    }
                    table {
                        font-size: 12px !important;
                    }
                    th, td {
                        padding: 4px !important;
                    }
                    .form-group.mb-3.d-flex.gap-2.align-items-center.flex-wrap > * {
                        margin-bottom: 5px;
                    }
                    .modal-header .btn, .modal-header select {
                        margin: 2px !important;
                        flex-shrink: 0; /* Prevent shrinking too much */
                    }
                    .modal-title {
                        font-size: 1rem;
                    }
                }

                /* עיצוב ייחודי לטבלת נגטיב */
                body[data-negative-mode="true"] #missing-table-container table.view-grouped th,
                body[data-negative-mode="true"] #missing-table-container table.view-grouped td {
                    padding-top: 6px !important;
                    padding-bottom: 6px !important;
                    font-size: 15px !important;
                }

                /* ביטול כל רוחבי תאים פנימיים */
                body[data-negative-mode="true"] .sub-table-inner th,
                body[data-negative-mode="true"] .sub-table-inner td {
                width: auto !important;
                min-width: 0 !important;
                max-width: none !important;
                }

                /* טבלה פנימית מתפרסת על כל רוחב המכולה */
                body[data-negative-mode="true"] .sub-table-inner {
                width: 100% !important;
                table-layout: fixed !important;
                }

                /* collapse vertical padding on the "detail" row so it doesn't add height */
                body[data-negative-mode="true"]
                #missing-table-container table.view-grouped tr.detail-row td {
                    padding-top: 0 !important;
                    padding-bottom: 0 !important;
                    line-height: 1 !important;
                    border: none !important;
                }

                body[data-negative-mode="true"] .sub-table-inner {
                width: 100% !important;
                table-layout: fixed !important;
                }
                body[data-negative-mode="true"] .sub-table-inner th,
                body[data-negative-mode="true"] .sub-table-inner td {
                width: auto !important;
                min-width: 0 !important;
                max-width: none !important;
                padding: 4px 8px !important;
                text-align: center !important;
                }

            /* General Modal Header Styling */
            .modal-header {
                /* Flex container for horizontal layout of elements in the header */
                display: flex !important;
                justify-content: space-between !important;
                align-items: center !important; /* Vertically center all immediate children */
                padding: 10px 15px !important; /* Standard padding around header content */
                min-height: 50px !important; /* Ensure minimum height for the header itself */
                height: auto !important; /* Allow header height to expand with content */
                box-sizing: border-box !important;
            }

            /* Container for the right-aligned buttons (including our custom button group) */
            .modal-header .d-flex.align-items-center.gap-2 {
                display: flex !important;
                align-items: center !important; /* Crucial: Vertically center all its direct children */
                gap: 5px !important; /* Consistent spacing between buttons */
                height: auto !important; /* Allow this container to adapt its height */
                box-sizing: border-box !important;
            }

            /* Styles for all standard buttons (excluding our custom wrapper) */
            .modal-header .d-flex.align-items-center.gap-2 > .btn:not(#export-to-sheets-btn-wrapper-dummy) { /* Exclude our wrapper if it somehow gets this class */
                height: 32px !important; /* Standard button height */
                min-width: 80px !important; /* Ensure buttons don't get too small */
                padding: 6px 10px !important; /* Standard padding */
                box-sizing: border-box !important;
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                margin: 0 !important; /* Reset any default margins here, controlled by parent gap */
                font-size: 0.9rem !important; /* Adjust font size if needed for consistent look */
            }

            /* The custom wrapper for Google Sheets button and checkbox */
            #export-sheets-wrapper {
                display: flex !important;
                flex-direction: row !important; /* Side by side */
                align-items: center !important;
                justify-content: center !important;
                height: 32px !important; /* Match other buttons */
                min-height: 32px !important;
                padding: 0 5px !important; /* Add horizontal padding inside the border */
                margin: 0 !important;
                box-sizing: border-box !important;
                gap: 6px !important; /* Space between button and checkbox */
                border: 1px solid #d1d5db !important; /* Thin grey border */
                border-radius: 6px !important;         /* Rounded corners */
                background: #fff !important;           /* Ensure background is white */
            }

            /* The actual Google Sheets button inside its wrapper */
            #export-to-sheets-btn {
                padding: 4px 10px !important;   /* Reduce vertical padding */
                height: 28px !important;        /* Slightly shorter button */
                min-height: 28px !important;
                margin: 0 !important;
                box-sizing: border-box !important;
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                font-size: 0.9rem !important;
                white-space: nowrap !important;
            }

            /* The container for the checkbox and label */
            #rebuild-checkbox-container {
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                gap: 3px !important;
                height: 32px !important;
                min-height: 32px !important;
                margin: 0 !important;
                padding: 0 !important;
                box-sizing: border-box !important;
            }

            /* Checkbox input specific styling */
            #rebuild-checkbox-container input[type="checkbox"] {
                width: 16px !important;
                height: 16px !important;
                margin: 0 !important;
                vertical-align: middle !important;
            }

            /* Checkbox label specific styling */
            #rebuild-checkbox-container label {
                cursor: pointer;
                font-weight: normal;
                font-size: 0.8em !important;
                color: #6c757d;
                vertical-align: middle !important;
                margin: 0 !important;
                transition: opacity 0.2s ease-in-out;
            }

            /* Disabled rebuild checkbox styling */
            #rebuild-checkbox-container input[type="checkbox"]:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }

            #rebuild-checkbox-container input[type="checkbox"]:disabled + label {
                opacity: 0.5;
                cursor: not-allowed;
                color: #999;
            }

            /* Close button (X) specific styling */
            .modal-header .d-flex.align-items-center.gap-2 > .close {
                width: 32px !important; /* Make it square */
                height: 32px !important; /* Make it square, matching other button height */
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                padding: 0 !important;
                margin: 0 !important; /* Controlled by parent gap */
                background: transparent !important;
                border: none !important;
                border-radius: 50% !important; /* Make it circular */
                font-size: 1.5rem !important; /* Size of the X icon */
            }
            .modal-header .d-flex.align-items-center.gap-2 > .close i.ki-close {
                color: inherit !important; /* Inherit color from parent */
            }
            `);

            GM_addStyle(`
    #missing-table-container table.view-grouped th,
    #missing-table-container table.view-grouped td {
    padding: 10px 8px !important;
    line-height: 1.2 !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    min-height: 45px !important;
    height: 45px !important;
    }

    #missing-table-container {
    overflow-x: auto !important;
    overflow-y: auto !important;
    }
         body[data-negative-mode="true"] #missing-table-container table.view-grouped th:nth-child(2),
    body[data-negative-mode="true"] #missing-table-container table.view-grouped td:nth-child(2) {
    width: 90px !important;
    min-width: 60px !important;
    max-width: 120px !important;
    }
     body[data-negative-mode="true"] #missing-table-container table.view-grouped th:nth-child(3),
    body[data-negative-mode="true"] #missing-table-container table.view-grouped td:nth-child(3) {
    width: 380px !important;
    min-width: 200px !important;
    max-width: 600px !important;
    }
    /* טבלת נגטיב: שם מוצר רחב, ברקוד ומחיר צרים */
    body[data-negative-mode="true"] #missing-table-container table.view-grouped th:nth-child(4),
    body[data-negative-mode="true"] #missing-table-container table.view-grouped td:nth-child(4) {
    width: 90px !important;
    min-width: 60px !important;
    max-width: 120px !important;
    }
      /* טבלת נגטיב: שם מוצר רחב, ברקוד ומחיר צרים */
    body[data-negative-mode="true"] #missing-table-container table.view-grouped th:nth-child(5),
    body[data-negative-mode="true"] #missing-table-container table.view-grouped td:nth-child(45) {
    width: 90px !important;
    min-width: 60px !important;
    max-width: 120px !important;
    }

    body[data-negative-mode="true"] #missing-table-container table.view-grouped th:nth-child(6),
    body[data-negative-mode="true"] #missing-table-container table.view-grouped td:nth-child(6) {
    width: 60px !important;
    min-width: 40px !important;
    max-width: 80px !important;
    }
    /* טבלת נגטיב - טבלה פנימית: לוקט, סה"כ, חסרים ברוחב זהה; סטטוס רחב יותר */
    body[data-negative-mode="true"] .sub-table-inner th:nth-child(3),
    body[data-negative-mode="true"] .sub-table-inner td:nth-child(3),
    body[data-negative-mode="true"] .sub-table-inner th:nth-child(4),
    body[data-negative-mode="true"] .sub-table-inner td:nth-child(4),
    body[data-negative-mode="true"] .sub-table-inner th:nth-child(5),
    body[data-negative-mode="true"] .sub-table-inner td:nth-child(5) {
    width: 60px !important;
    min-width: 50px !important;
    max-width: 80px !important;
    }
    body[data-negative-mode="true"] .sub-table-inner th:nth-child(6),
    body[data-negative-mode="true"] .sub-table-inner td:nth-child(6) {
    width: 140px !important;
    min-width: 100px !important;
    max-width: 220px !important;
    }
    /* collapse vertical padding on the "detail" row so it doesn't add height */
    body[data-negative-mode="true"]
      #missing-table-container table.view-grouped tr.detail-row td {
        padding-top: 0 !important;
        padding-bottom: 0 !important;
        line-height: 1 !important;
        border: none !important;
    }
    body[data-negative-mode="true"] .sub-table-inner {
    width: 100% !important;
    table-layout: fixed !important;
    }
 body[data-negative-mode="true"] .sub-table-inner th,
  body[data-negative-mode="true"] .sub-table-inner td {
    width: auto !important;
    min-width: 0 !important;
    max-width: none !important;
    padding: 4px 8px !important;
    text-align: center !important;
  }

  /* הוסיפו את הקטע הזה: מסתיר את עמודת ה־Status (שישית) רק בטבלת Negative */
  body[data-negative-mode="true"] .sub-table-inner th:nth-child(6),
  body[data-negative-mode="true"] .sub-table-inner td:nth-child(6) {
    display: none !important;
  }

  /* עיצוב כפתורים בטבלת נגטיב - רק בתוך המודל */
  body[data-negative-mode="true"] #missing-items-modal .btn.btn-secondary {
    background-color: #6f6c74 !important;
    border-color: #42424b !important;
    color: #ffffff !important;
  }

  body[data-negative-mode="true"] #missing-items-modal .btn.btn-secondary:hover {
    background-color: #5a575f !important;
    border-color: #2d2d35 !important;
    color: #ffffff !important;
  }

  body[data-negative-mode="true"] #missing-items-modal .btn.btn-secondary:focus {
    background-color: #6f6c74 !important;
    border-color: #42424b !important;
    color: #ffffff !important;
    box-shadow: 0 0 0 0.2rem rgba(111, 108, 116, 0.25) !important;
  }

  /* עיצוב אייקונים בכפתורים בטבלת נגטיב - רק בתוך המודל */
  body[data-negative-mode="true"] #missing-items-modal .btn.btn-secondary .fa,
  body[data-negative-mode="true"] #missing-items-modal .btn.btn-secondary .fa-light,
  body[data-negative-mode="true"] #missing-items-modal .btn.btn-secondary .fa-solid,
  body[data-negative-mode="true"] #missing-items-modal .btn.btn-secondary .fa-regular {
    color: #ffffff !important;
  }
            `);

            GM_addStyle(`
                /* General styling for modal buttons and selects */
                .modal-header .btn, .modal-header select {
                    margin-left: 5px !important;
                    margin-right: 5px !important;
                }

                /* ... existing CSS ... */


            `);

            // ... existing code ...
        }

        // --- טעינה דינמית של ExcelJS מה-CDN אם לא נטען ---
        function loadExcelJS(callback) {
            if (window.ExcelJS) return callback();
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
            script.onload = callback;
            document.head.appendChild(script);
        }

        /**
         * מחזיר רק את הפריטים שנלקטו (picked>0)
         * מתוך ההזמנות שבהן יש חסרים (picked<total).
         */
        function processNegativeItems(items) {
            console.log('מעבד נתונים למצב נגטיב...');

            // 1. בוחרים את כל מזהי ההזמנות שבהן יש לפחות פריט חסר
            // ורק הזמנות שהתחילו ליקוט (לא NEW, UNASSIGNED) או בסטטוס PENDING
            const ordersWithMissing = new Set(
                items
                    .filter(item =>
                        item.picked < item.total &&
                        item.taskOverallStatus !== 'NEW' &&
                        item.taskOverallStatus !== 'UNASSIGNED'
                    )
                    .map(item => item.taskId)
            );

            console.log(`נמצאו ${ordersWithMissing.size} הזמנות עם חסרים שהתחילו ליקוט או בסטטוס PENDING מתוך ${new Set(items.map(item => item.taskId)).size} הזמנות`);

            // 2. מסננים רק את הפריטים שנלקטו ושייכים להזמנות אלה
            const negativeItems = items.filter(item =>
                item.picked > 0 &&
                ordersWithMissing.has(item.taskId)
            );

            console.log(`נמצאו ${negativeItems.length} פריטים שנלקטו מהזמנות עם חסרים`);

            // Additional safety check for excluded regions
            const finalNegativeItems = negativeItems.filter(item => {
                const isNotExcludedRegion = !item.destinationRegion || !item.destinationRegion.includes(EXCLUDED_REGION);
                if (!isNotExcludedRegion) {
                    console.log(`Negative items - filtering out item from excluded region: ${item.name} | Region: ${item.destinationRegion}`);
                }
                return isNotExcludedRegion;
            });

            console.log(`נמצאו ${finalNegativeItems.length} פריטים למצב נגטיב אחרי סינון אזור`);
            return finalNegativeItems;
        }



        // === Add Rebuild Checkbox Below Export Button ===
        function addRebuildCheckboxBelowExport() {
          const exportBtn = document.getElementById('export-to-sheets-btn');
          if (!exportBtn) return;

          // Find the new wrapper container
          const wrapper = document.getElementById('export-sheets-wrapper');
          if (!wrapper) {
            console.error('Error: #export-sheets-wrapper not found. Cannot add rebuild checkbox.');
            return;
          }

          // Check if already added
          if (document.getElementById('rebuild-checkbox-container')) {
              // Ensure the checkbox is inside the correct wrapper
              const existingContainer = document.getElementById('rebuild-checkbox-container');
              if (existingContainer.parentNode !== wrapper) {
                  wrapper.appendChild(existingContainer);
              }
              return;
          }

          // Create container for checkbox and label
          const container = document.createElement('div');
          container.id = 'rebuild-checkbox-container';
          // Add some top margin to separate it from the button
          container.style.marginTop = '5px'; // Adjust as needed for spacing

          // Create checkbox
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.id = 'rebuild-table-checkbox';

          // Create label
          const label = document.createElement('label');
          label.htmlFor = 'rebuild-table-checkbox';
          label.innerText = 'בנה מחדש';

          container.appendChild(checkbox);
          container.appendChild(label);

          // Append to the new wrapper
          wrapper.appendChild(container);

          // Initialize the rebuild checkbox state
          updateRebuildCheckboxState();

          // Checkbox logic (keep as is)
          checkbox.addEventListener('change', function (e) {
            if (checkbox.checked) {
              // Show warning modal
              showMessageModalWithCancel(
                'אזהרה: בנייה מחדש של הטבלה',
                `<div style=\"text-align:center;font-size:2.5rem;\">⚠️</div><div style=\"margin-top:12px;\">פעולה זו תמחק את כל טבלת החוסרים ותבנה אותה מחדש לפי נתוני החוסרים הנוכחיים.<br><br>האם להמשיך?</div>`,
                false,
                null,
                function onOk() {
                  checkbox.checked = true;
                },
                function onCancel() {
                  checkbox.checked = false;
                }
              );
            }
          });
        }

        // === Enhanced Modal with Cancel ===
        function showMessageModalWithCancel(title, message, isError = false, customColors = null, onOk, onCancel) {
          // Remove existing modal if present
          const existingModal = document.getElementById('custom-message-modal');
          if (existingModal) existingModal.remove();
          const existingBackdrop = document.querySelector('.modal-backdrop.fade.show');
          if (existingBackdrop) existingBackdrop.remove();

          // Modal backdrop
          const modalBackdrop = document.createElement('div');
          modalBackdrop.className = 'modal-backdrop fade show';
          modalBackdrop.style.zIndex = 1050;
          document.body.appendChild(modalBackdrop);

          // Modal
          const modal = document.createElement('div');
          modal.id = 'custom-message-modal';
          modal.className = 'modal fade show';
          modal.style.display = 'block';
          modal.style.position = 'fixed';
          modal.style.top = '0';
          modal.style.left = '0';
          modal.style.width = '100vw';
          modal.style.height = '100vh';
          modal.style.zIndex = 1051;
          modal.style.backgroundColor = 'rgba(0,0,0,0.5)';
          modal.innerHTML = `
            <div class=\"modal-dialog modal-dialog-centered\" style=\"max-width: 400px; border-radius: 8px; overflow: hidden;\">
              <div class=\"modal-content\" style=\"border-radius: 8px;\">
                <div class=\"modal-header d-flex justify-content-between align-items-center\" style=\"background-color: #fffbe6; color: #b45309; border-bottom: 1px solid #ffe066;\">
                  <h5 class=\"modal-title\" style=\"font-weight: bold; color: #b45309;\">${title}</h5>
                  <button type=\"button\" class=\"close\" data-dismiss=\"modal\" aria-label=\"Close\" id=\"close-message-modal\" style=\"border: none; background: transparent; font-size: 1.5rem; cursor: pointer;\">×</button>
                </div>
                <div class=\"modal-body py-4 px-3\" style=\"text-align: center;\">
                  ${message}
                </div>
                <div class=\"modal-footer\" style=\"border-top: 1px solid #e9ecef; justify-content: center; gap: 12px;\">
                  <button type=\"button\" class=\"btn btn-primary\" id=\"ok-message-modal\" style=\"padding: 8px 20px; border-radius: 5px; background-color: #d97706; border-color: #b45309; color: white; cursor: pointer;\">אישור</button>
                  <button type=\"button\" class=\"btn btn-secondary\" id=\"cancel-message-modal\" style=\"padding: 8px 20px; border-radius: 5px; background-color: #e5e7eb; border-color: #d1d5db; color: #374151; cursor: pointer;\">ביטול</button>
                </div>
              </div>
            </div>
          `;
          document.body.appendChild(modal);

          // Close logic
          const closeModal = () => {
            modal.remove();
            modalBackdrop.remove();
          };
          document.getElementById('close-message-modal').onclick = () => {
            closeModal();
            if (onCancel) onCancel();
          };
          document.getElementById('ok-message-modal').onclick = () => {
            closeModal();
            if (onOk) onOk();
          };
          document.getElementById('cancel-message-modal').onclick = () => {
            closeModal();
            if (onCancel) onCancel();
          };
        }



        } // Close the Lionwheel conditional block

        console.log('🎉 סקריפט טבלת חוסרים הושלם בהצלחה!');
        console.log('📋 כל הפונקציות זמינות לשימוש');
    })();
