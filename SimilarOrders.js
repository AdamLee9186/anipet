// ==UserScript==
// @name         Lionwheel - חיפוש משלוחים דומים
// @namespace    http://tampermonkey.net/
// @version      2.6
// @description  מוסיף כפתור חיפוש וגם תצוגה מקדימה (previews) של פריטי המשלוח בתוך מודאל החיפוש.
// @author       Adam Lee
// @match        https://members.lionwheel.com/tasks/*
// @match        https://members.lionwheel.com/operator/store_visits*
// @updateURL    https://raw.githubusercontent.com/AdamLee9186/anipet/main/SimilarOrders.js
// @downloadURL  https://raw.githubusercontent.com/AdamLee9186/anipet/main/SimilarOrders.js
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @connect      members.lionwheel.com
// @connect      raw.githubusercontent.com
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // -------------------------------------------------------------------------
    // 1. הגדרות וקבועים
    // -------------------------------------------------------------------------

    const STATUS_MAP = {
        'UNASSIGNED':    { text: 'טרם אושר', color: '#F29098' },
        'ASSIGNED':      { text: 'אושר', color: '#F5D34B' },
        'ACTIVE':        { text: 'נאסף', color: '#68D4DE' },
        'COMPLETED':     { text: 'בוצע', color: '#337AB7' },
        'CANCELED':      { text: 'בוטל', color: '#CBD2DC' },
        'IN_INVENTORY':  { text: 'במחסן', color: '#CF8346' },
        'OUT_INVENTORY': { text: 'יצא ממחסן', color: '#FFA800' },
        'FAILED':        { text: 'נכשל', color: '#AC7274' },
        'IN_TRANSFER':   { text: 'בהעברה', color: '#F70268' },
        'DEFAULT':       { text: 'לא ידוע', color: '#888' }
    };

    // --- קבועים לטעינת תמונות ---
    const IMAGE_FINDER_CSV_URL = "https://raw.githubusercontent.com/AdamLee9186/anipet/main/anipet_master_catalog_v1.csv";
    const PRODUCT_DATA_CACHE_KEY = 'anipet_product_data_cache_search';
    const IMAGE_CACHE_TIMESTAMP_KEY = 'anipet_image_cache_timestamp_search';
    const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
    let productDataCache = null;

    const previewCache = new Map();
    const PLACEHOLDER_IMG_URL = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="70" viewBox="0 0 80 70"><rect width="80" height="70" fill="#fafafa"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="12px" fill="#d4d4d4">אין תמונה</text></svg>');


    // -------------------------------------------------------------------------
    // 2. הוספת עיצוב (CSS) ל-Popup ול-Previews
    // -------------------------------------------------------------------------
    GM_addStyle(`
        /* שכבת רקע למודאל */
        .lw-search-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            z-index: 9998;
            display: none;
            direction: rtl;
        }

        /* --- תיבת המודאל הורחבה --- */
        .lw-search-modal {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #fff;
            border-radius: 8px;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
            z-index: 9999;
            width: 90%;
            max-width: 850px;
            max-height: 80vh;
            display: none;
            flex-direction: column;
            overflow: hidden;
        }

        /* --- כותרת המודאל (Tree הכי ימין, X הכי שמאל) --- */
        .lw-search-header {
            display: flex;
            align-items: center; /* יישור אנכי */
            padding: 12px 16px;
            border-bottom: 1px solid #eee;
            background: #f7f7f7;
            flex-shrink: 0;
        }

        .lw-search-header h3 {
            margin: 0;
            font-size: 1.1rem;
            font-weight: 600;
            color: #333;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            text-align: right;
            flex-grow: 1;
        }

        /* --- קונטיינר כפתורי כותרת (כפתור X) --- */
        .lw-search-header-controls {
            display: flex;
            align-items: center;
            flex-shrink: 0;
        }

        /* --- עיצוב כפתור סגירה (X) - חזרה לאפור פשוט --- */
        .lw-search-close {
            font-size: 1.5rem; /* גודל X גדול יותר */
            line-height: 1;
            cursor: pointer;
            color: #888; /* צבע אפור כהה */
            transition: color 0.2s;
            font-weight: lighter; /* דק יותר */
            padding: 0 5px;
            margin-left: 15px; /* מרווח מהצד */
        }
        .lw-search-close:hover {
            color: #333; /* אפור שחור בריחוף */
        }


        /* --- [שונה] עיצוב כפתורי כותרת ו-Preview (צבעי רקע ופונט) --- */
        .lw-header-btn, .lw-preview-toggle {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 30px;
            height: 30px;
            background-color: #E1F0FF; /* צבע רקע נכון */
            border: 1px solid #c9dff7;
            color: #44A0FF;            /* <--- צבע אייקון נכון: #44A0FF */
            border-radius: 6px;
            cursor: pointer;
            font-size: 1.1rem;
            transition: background-color 0.2s, color 0.2s, border-color 0.2s;
        }

        /* ודוא שצבע האייקון נשאר כחול ולא נהיה אפור מ-Font Awesome */
        .lw-header-btn i, .lw-preview-toggle i {
            color: #44A0FF !important;
        }

        .lw-header-btn:hover, .lw-preview-toggle:hover {
            background-color: #d1e4ff;
            color: #216dbe; /* צבע טקסט ב-hover לא כ"כ משנה, אבל משאיר כהה */
            border-color: #a4c8f3;
        }
        .lw-header-btn:hover i, .lw-preview-toggle:hover i {
            color: #216dbe !important;
        }


        /* תוכן המודאל */
        .lw-search-content {
            padding: 8px;
            overflow-y: auto;
            min-height: 100px;
            text-align: right;
            background: #fff;
        }

        /* אנימציית טעינה */
        .lw-search-loader, .lw-preview-loader {
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100px;
            font-size: 1.1rem;
            color: #555;
        }
        .lw-search-loader::after, .lw-preview-loader::after {
            content: "";
            display: inline-block;
            width: 20px;
            height: 20px;
            margin-right: 10px;
            border: 3px solid #f3f3f3;
            border-top: 3px solid #007bff;
            border-radius: 50%;
            animation: lw-spin 1s linear infinite;
        }
        @keyframes lw-spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        /* עיצוב תוצאות */
        .lw-search-results-list {
            padding: 0;
            margin: 0;
            display: flex;
            flex-direction: column;
        }

        .lw-search-result-item {
            display: block;
            text-decoration: none !important;
            color: inherit;
            border-bottom: 1px solid #eee;
            transition: background-color 0.2s;
        }
        .lw-search-result-item:hover {
            background-color: #f9f9f9;
            text-decoration: none !important;
        }
        .lw-search-result-item:last-child {
            border-bottom: none;
        }

        .lw-result-status {
            padding: 4px 10px;
            border-radius: 0.25rem;
            font-size: 0.8rem;
            font-weight: bold;
            color: #fff;
            flex-shrink: 0;
            text-shadow: 1px 1px 1px rgba(0,0,0,0.1);
            min-width: 85px;
            text-align: center;
            display: inline-block;
        }

        /* מחלקות עזר של Bootstrap (כדי למנוע התנגשויות) */
        .lw-search-modal .d-flex { display: flex !important; }
        .lw-search-modal .align-items: center { align-items: center !important; }
        .lw-search-modal .align-self-center { align-self: center !important; }
        .lw-search-modal .justify-content-between { justify-content: space-between !important; }
        .lw-search-modal .flex-grow-1 { flex-grow: 1 !important; }
        .lw-search-modal .flex-shrink-0 { flex-shrink-0 !important; }
        .lw-search-modal .flex-column { flex-direction: column !important; }
        .lw-search-modal .text-dark { color: #333 !important; }
        .lw-search-modal .font-weight-bold { font-weight: 600 !important; }
        .lw-search-modal .mb-1 { margin-bottom: 0.25rem !important; }
        .lw-search-modal .font-size-xs { font-size: 0.8rem !important; }
        .lw-search-modal .text-dark-50 { color: #6c757d !important; }
        .lw-search-modal .ml-2 { margin-left: 0.5rem !important; }
        .lw-search-modal .ml-3 { margin-left: 1rem !important; }
        .lw-search-modal .p-2 { padding: 0.75rem !important; }
        .lw-search-modal .font-size-12 { font-size: 12px !important; }
        .lw-search-modal .my-1 { margin-top: 0.25rem !important; margin-bottom: 0.25rem !important; }
        .lw-search-modal .symbol { display: inline-block; flex-shrink: 0; }
        .lw-search-modal .symbol-30 { width: 30px; height: 30px; }
        .lw-search-modal .symbol-label {
            width: 100%;
            height: 100%;
            background-color: #f3f6f9;
            border-radius: 0.25rem;
        }

        /* עיצוב אייקון חיפוש */
        .lw-search-icon {
            cursor: pointer;
            margin-left: 8px;
            color: #007bff;
            font-weight: normal;
            transition: color 0.2s;
            display: inline-block;
        }
        .lw-search-icon:hover {
            color: #0056b3;
        }

        /* --- עיצוב כפתור ה-Preview בתוך הרשימה (יישור אייקון) --- */
        .lw-preview-toggle {
            padding: 0;
            margin: 0;
            line-height: 1;
        }
        .lw-preview-toggle i {
            line-height: 1;
            margin: 0;
            padding: 0;
            vertical-align: middle;
            text-decoration: none;
        }

        /* --- עיצוב קומפקטי לקונטיינר ה-Preview --- */
        .lw-preview-container {
            display: none;
            padding: 6px;
            background-color: #f9f9f9;
            border-bottom: 1px solid #eee;
        }
        .lw-preview-content {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
            justify-content: flex-start;
        }

        /* --- עיצוב קומפקטי לכרטיסיית Preview --- */
        .tmc-preview-card {
            display: flex !important;
            align-items: flex-start !important;
            gap: 8px !important;
            flex: 1 1 auto !important;
            width: auto !important;
            min-width: 200px;
            max-width: 100%;
            white-space: normal !important;
            border: 1px solid #dee2e6;
            border-radius: 0.25rem;
            padding: 4px;
            margin: 2px;
            background-color: #fff;
        }
        .tmc-preview-img {
            width: 60px !important;
            height: 60px !important;
            object-fit: contain !important;
            flex: 0 0 auto;
            margin-inline-start: 4px;
        }
        .tmc-preview-card .font-weight-bold {
            font-size: 0.9rem;
            font-weight: 600;
            line-height: 1.2;
        }
        .tmc-preview-meta {
            font-size: 0.8rem;
            line-height: 1.2;
            color: #6c757d;
            white-space: normal !important;
        }
        .tmc-preview-meta > div {
            display: block;
        }

        /* עיצוב צבעי כמויות (מ-Toolbox) */
        .tampermonkey-picked-full { color: #0c7b0c !important; font-weight: 600 !important; }
        .tampermonkey-picked-partial { color: #b26a00 !important; font-weight: 600 !important; }
        .tampermonkey-picked-none { color: #842029 !important; font-weight: 600 !important; }

        /* עיצוב הדגשת ברקוד (מ-Toolbox) */
        .tmc-preview-meta .barcode-highlight {
            background: transparent !important;
            color: inherit !important;
        }
        .tmc-preview-meta .barcode-highlight b {
            color: #000 !important;
            font-weight: 700 !important;
        }
    `);

    // -------------------------------------------------------------------------
    // 3. יצירת אלמנטי המודאל (Popup)
    // -------------------------------------------------------------------------
    let modal, overlay, modalTitle, modalContent, toggleAllButton;

    function createModal() {
        if (document.getElementById('lwSearchOverlay')) return;

        overlay = document.createElement('div');
        overlay.id = 'lwSearchOverlay';
        overlay.className = 'lw-search-overlay';
        overlay.onclick = hideModal;
        document.body.appendChild(overlay);

        modal = document.createElement('div');
        modal.id = 'lwSearchModal';
        modal.className = 'lw-search-modal';
        document.body.appendChild(modal);

        // --- מבנה ה-HTML בכותרת למיקום הנכון (Tree הכי ימין) ---
        modal.innerHTML = `
            <div class="lw-search-header">
                <button id="lwToggleAllPreviewsBtn" class="lw-header-btn" title="פתח/סגור את כל הפריטים" style="display: none; margin-left: 10px;">
                    <i id="lwToggleAllPreviews" class="fa-light fa-list-tree"></i>
                </button>

                <h3 id="lwSearchTitle" style="text-align: right; flex-grow: 1;"></h3>

                <div class="lw-search-header-controls">
                    <span class="lw-search-close" title="סגירה">&times;</span>
                </div>
            </div>
            <div id="lwSearchContent" class="lw-search-content"></div>
        `;

        modalTitle = modal.querySelector('#lwSearchTitle');
        modalContent = modal.querySelector('#lwSearchContent');
        toggleAllButton = modal.querySelector('#lwToggleAllPreviewsBtn');

        modal.querySelector('.lw-search-close').onclick = hideModal;

        // --- לוגיקת קליקים ---
        modalContent.addEventListener('click', (e) => {
            const previewToggle = e.target.closest('.lw-preview-toggle');
            const itemLink = e.target.closest('.lw-search-result-item');

            if (previewToggle) {
                // לחיצה על כפתור Preview
                e.preventDefault();
                e.stopPropagation(); // <-- מונע פתיחת הקישור של השורה
                handlePreviewToggle(previewToggle);
            } else if (itemLink) {
                // לחיצה על שורת התוצאה (בכל מקום אחר)
                e.preventDefault();
                window.open(itemLink.dataset.href, '_blank');
            }
        });

        toggleAllButton.addEventListener('click', (e) => {
            e.stopPropagation();

            const allToggles = modalContent.querySelectorAll('.lw-preview-toggle');
            if (allToggles.length === 0) return;

            const isAnyOpen = Array.from(allToggles).some(toggle =>
                toggle.querySelector('i')?.classList.contains('fa-chevron-left')
            );

            if (isAnyOpen) {
                allToggles.forEach(toggle => {
                    if (toggle.querySelector('i')?.classList.contains('fa-chevron-left')) {
                        handlePreviewToggle(toggle, false); // false = כפה סגירה
                    }
                });
            } else {
                allToggles.forEach(toggle => {
                    if (toggle.querySelector('i')?.classList.contains('fa-chevron-down')) {
                        handlePreviewToggle(toggle, true); // true = כפה פתיחה
                    }
                });
            }
        });
    }

    function showModal(title, contentHTML) {
        if (!modal) createModal();
        modalTitle.textContent = title;
        modalContent.innerHTML = contentHTML;
        overlay.style.display = 'block';
        modal.style.display = 'flex';

        const hasResults = modalContent.querySelector('.lw-search-result-item');
        toggleAllButton.style.display = hasResults ? 'flex' : 'none';
    }

    function hideModal() {
        if (!modal) return;
        overlay.style.display = 'none';
        modal.style.display = 'none';
        modalTitle.textContent = '';
        modalContent.innerHTML = '';
        toggleAllButton.style.display = 'none';
    }

    // -------------------------------------------------------------------------
    // 4. לוגיקת החיפוש
    // -------------------------------------------------------------------------

    function getCSRFToken() {
        const tokenElement = document.querySelector('meta[name="csrf-token"]');
        if (tokenElement) {
            return tokenElement.getAttribute('content');
        }
        console.error('Lionwheel Search: Could not find CSRF token');
        alert('שגיאה: לא ניתן היה למצוא טוקן אבטחה (CSRF) בעמוד. החיפוש נכשל.');
        return null;
    }

    async function performSearch(searchTerm) {
        if (!searchTerm) return;

        showModal(`מחפש משלוחים עבור "${searchTerm}"...`,
                  '<div class="lw-search-loader">טוען תוצאות...</div>');

        const token = getCSRFToken();
        if (!token) {
            hideModal();
            return;
        }

        const url = `https://members.lionwheel.com/tasks/quick_search?search=${encodeURIComponent(searchTerm)}`;

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'accept': 'application/json',
                    'x-csrf-token': token,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`שגיאת רשת: ${response.statusText}`);
            }

            const data = await response.json();
            displayResults(data, searchTerm);

        } catch (error) {
            console.error('Lionwheel Search Error:', error);
            showModal('שגיאה בחיפוש', `<p>אירעה שגיאה בעת ביצוע החיפוש: ${error.message}</p><p>נסה שוב מאוחר יותר.</p>`);
        }
    }

    // פונקציה להצגת התוצאות
    function displayResults(data, searchTerm) {
        const nameResults = data.data_by_name?.res || [];
        const phoneResults = data.data_by_phone?.res || [];
        let allResults = [...nameResults, ...phoneResults];

        const uniqueResults = Array.from(new Map(allResults.map(task => [task.id, task])).values());
        uniqueResults.sort((a, b) => b.id - a.id);

        if (uniqueResults.length === 0) {
            showModal(`אין תוצאות עבור "${searchTerm}"`,
                      '<p style="text-align: center; padding: 20px 0;">לא נמצאו משלוחים תואמים.</p>');
            return;
        }

        let html = '<div class="lw-search-results-list">';

        uniqueResults.forEach(task => {
            const statusInfo = STATUS_MAP[task.status] || STATUS_MAP['DEFAULT'];
            const taskUrl = `https://members.lionwheel.com/tasks/${task.id}`;
            const previewContainerId = `preview-for-task-${task.id}`;

            html += `
                <a href="#" data-href="${taskUrl}" class="lw-search-result-item task-row d-block" title="פתח משלוח ${task.id}">
                    <div class="d-flex align-items-center flex-grow-1 justify-content-between p-2">

                        <div class="flex-shrink-0 align-self-center ml-2">
                            <button class="lw-preview-toggle" data-task-id="${task.id}" title="הצג פריטים">
                                <i class="fa-light fa-chevron-down"></i>
                            </button>
                        </div>

                        <div class="d-flex flex-column ml-3 flex-grow-1">
                            <span class="text-dark font-weight-bold mb-1">${task.name || 'לא צוין שם'}</span>
                            <span class="font-size-xs font-weight-bold text-dark-50">${task.address || 'לא צוינה כתובת'}</span>
                        </div>

                        <div class="ml-2 flex-shrink-0" style="text-align: left;">
                             <div class="text-dark font-weight-bold font-size-12" style="margin-bottom: 0.25rem;">
                                ${task.id}
                                <i class="fa-solid fa-arrow-up-right-from-square ml-2" style="font-size: 0.9em; color: #888;"></i>
                            </div>
                             <div class="text-dark font-weight-bold font-size-12" style="margin-bottom: 0.25rem;">
                                ${task.pickup_at || 'אין תאריך'}
                            </div>
                             <div>
                                <span class="lw-result-status" style="background-color: ${statusInfo.color};">
                                    ${statusInfo.text}
                                </span>
                            </div>
                        </div>

                    </div>
                </a>
                <div class="lw-preview-container" id="${previewContainerId}" style="display: none;"></div>
            `;
        });

        html += '</div>';

        const title = `נמצאו ${uniqueResults.length} תוצאות עבור "${searchTerm}"`;
        showModal(title, html);
    }

    // -------------------------------------------------------------------------
    // 5. הוספת האייקונים לעמוד
    // -------------------------------------------------------------------------

    function createIconElement(searchTerm) {
        const icon = document.createElement('i');
        icon.className = 'fa-light fa-magnifying-glass lw-search-icon';
        icon.title = `חפש משלוחים דומים עבור "${searchTerm}"`;
        icon.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            performSearch(searchTerm);
        };
        return icon;
    }

    function addSearchIcons() {
        const nameWrapper = document.querySelector('div[data-name="destination_recipient_name"]');
        if (nameWrapper && !nameWrapper.querySelector('.lw-search-icon')) {
            const nameSpan = nameWrapper.querySelector('.editable-text, .hover-copy');
            if (nameSpan) {
                const name = nameSpan.textContent.trim();
                if (name) {
                    const icon = createIconElement(name);
                    nameSpan.prepend(icon);
                }
            }
        }

        const phoneWrapper = document.querySelector('div[data-name="destination_phone"]');
        if (phoneWrapper && !phoneWrapper.querySelector('.lw-search-icon')) {
            const phoneSpan = phoneWrapper.querySelector('.editable-text, .hover-copy');
            if (phoneSpan) {
                let phone = '';
                const waInjected = phoneSpan.querySelector('.whatsapp-injected');
                if (waInjected) {
                    Array.from(waInjected.childNodes).forEach(node => {
                        if (node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0) {
                            phone = node.textContent.trim();
                        }
                    });
                } else {
                    phone = phoneSpan.textContent.trim();
                }

                if (phone) {
                    const icon = createIconElement(phone);
                    phoneSpan.prepend(icon);
                }
            }
        }
    }

    // -------------------------------------------------------------------------
    // 6. לוגיקה של שליפת ורנדור ה-Preview
    // -------------------------------------------------------------------------

    async function handlePreviewToggle(toggleButton, forceState = null) {
        const taskId = toggleButton.dataset.taskId;
        const icon = toggleButton.querySelector('i');
        const container = document.getElementById(`preview-for-task-${taskId}`);
        if (!taskId || !icon || !container) return;

        const isOpen = icon.classList.contains('fa-chevron-left');

        if (forceState === true && isOpen) return;
        if (forceState === false && !isOpen) return;

        if (isOpen && forceState !== true) {
            // סגור
            container.style.display = 'none';
            container.innerHTML = '';
            icon.classList.remove('fa-chevron-left');
            icon.classList.add('fa-chevron-down');
        } else {
            // פתח
            icon.classList.remove('fa-chevron-down');
            icon.classList.add('fa-spinner', 'fa-spin');
            container.innerHTML = '<div class="lw-preview-loader">טוען פריטים...</div>';
            container.style.display = 'block';

            try {
                let items = previewCache.get(taskId);
                if (!items) {
                    const html = await fetchTaskPreview(taskId);
                    items = parsePreviewHTML(html);
                    if (items.length > 0) {
                        previewCache.set(taskId, items);
                    }
                }

                const cardsHtml = buildPreviewCards(items);
                container.innerHTML = `<div class="lw-preview-content">${cardsHtml}</div>`;
                icon.classList.remove('fa-spinner', 'fa-spin');
                icon.classList.add('fa-chevron-left');

            } catch (error) {
                console.error(`[Preview Error] Task ${taskId}:`, error);
                container.innerHTML = `<div style="color: red; padding: 10px;">שגיאה בטעינת הפריטים.</div>`;
                icon.classList.remove('fa-spinner', 'fa-spin');
                icon.classList.add('fa-exclamation-triangle');
            }
        }
    }

    function fetchTaskPreview(taskId) {
        return new Promise((resolve, reject) => {
            const token = getCSRFToken();
            if (!token) {
                return reject(new Error('CSRF token not found'));
            }

            GM_xmlhttpRequest({
                method: "POST",
                url: `https://members.lionwheel.com/tasks/${taskId}/panel_view`,
                headers: {
                    'accept': '*/*',
                    'content-type': 'application/json',
                    'x-csrf-token': token
                },
                data: JSON.stringify({}),
                onload: function(response) {
                    if (response.status >= 200 && response.status < 300) {
                        resolve(response.responseText);
                    } else {
                        reject(new Error(`Fetch failed with status: ${response.status}`));
                    }
                },
                onerror: function(error) {
                    reject(new Error(`Network error: ${error.statusText}`));
                }
            });
        });
    }

    function parsePreviewHTML(htmlString) {
        const doc = new DOMParser().parseFromString(htmlString, 'text/html');
        const table = doc.querySelector('.table-responsive .table');
        if (!table) return [];

        const items = [];
        const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim());

        const findIndex = (terms) => headers.findIndex(h => terms.some(term => h.includes(term)));

        const nameIndex = findIndex(['שם']);
        const skuIndex = findIndex(['ברקוד', 'מק״ט']);
        const quantityIndex = findIndex(['כמות / לוקט']);
        const priceIndex = findIndex(['מחיר ליחידה']);

        const rows = table.querySelectorAll('tbody tr');
        rows.forEach(row => {
            try {
                const cells = row.cells;
                if (!cells || cells.length < Math.max(nameIndex, skuIndex, quantityIndex, priceIndex)) return;

                const name = cells[nameIndex]?.textContent.trim() || 'לא ידוע';
                const skuCell = cells[skuIndex];
                const sku = skuCell?.dataset.originalSku || skuCell?.textContent.trim() || '';

                const quantity = cells[quantityIndex]?.textContent.trim() || '0 / 0';
                const priceText = cells[priceIndex]?.textContent.trim().replace(/[^0-9.,]/g, '') || '0';
                const price = parseFloat(priceText.replace(',', '.')) || 0;

                const match = findImageMatch(sku, name);
                const imageSrc = (match && match.image) ? getOptimizedImageUrl(match.image, 100) : PLACEHOLDER_IMG_URL;

                items.push({
                    name,
                    sku,
                    quantity,
                    price: price.toFixed(2),
                    imageSrc
                });
            } catch(e) {
                console.warn("Failed to parse preview row", e, row);
            }
        });

        return items;
    }

    function buildPreviewCards(items) {
        if (!items || items.length === 0) {
            return '<div style="padding: 10px; text-align: center; color: #6c757d;">לא נמצאו פריטים בהזמנה זו.</div>';
        }

        return items.map(item => {
            const coloredQuantity = lwColorQtySpan(item.quantity);
            const barcodeHtml = lwBoldLast3Digits(item.sku);
            const imgSrc = item.imageSrc;

            return `
                <div class="d-flex align-items-center border rounded p-2 m-1 bg-white tmc-preview-card">
                    <img src="${imgSrc}" style="width: 60px !important; height: 60px !important; object-fit: contain !important; margin-left: 10px;" class="tmc-preview-img" onerror="this.src='${PLACEHOLDER_IMG_URL}'">
                    <div>
                        <div class="font-weight-bold copy-enabled" style="font-size:0.9rem;">${item.name}</div>
                        <div class="text-muted tmc-preview-meta" style="font-size: 0.8rem; white-space: normal !important;">
                            <div><b>ברקוד:</b> <span class="barcode-highlight">${barcodeHtml}</span></div>
                            <div><b>מחיר:</b> ₪${item.price}</div>
                            <div><b>כמות:</b> ${coloredQuantity}</div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // -------------------------------------------------------------------------
    // 7. פונקציות עזר (כולל טעינת קטלוג תמונות)
    // -------------------------------------------------------------------------

    // --- פונקציות לטעינת קטלוג התמונות (עם תיקון ל-Cache) ---
    async function getProductData() {
        if (productDataCache) return;

        try {
            const cachedData = await GM_getValue(PRODUCT_DATA_CACHE_KEY, null);
            const cachedTimestamp = await GM_getValue(IMAGE_CACHE_TIMESTAMP_KEY, 0);

            // בנה מחדש את ה-Map מהמערך השמור
            if (cachedData && Array.isArray(cachedData) && (Date.now() - cachedTimestamp < CACHE_DURATION_MS)) {
                productDataCache = new Map(cachedData);
                console.log(`LW Search: Product catalog loaded from cache: ${productDataCache.size} items.`);
                return;
            }

            console.log("LW Search: Fetching product catalog CSV...");
            GM_xmlhttpRequest({
                method: "GET",
                url: IMAGE_FINDER_CSV_URL,
                onload: async (response) => {
                    productDataCache = processImageCsvText(response.responseText);
                    // שמור כמערך של [key, value]
                    await GM_setValue(PRODUCT_DATA_CACHE_KEY, Array.from(productDataCache.entries()));
                    await GM_setValue(IMAGE_CACHE_TIMESTAMP_KEY, Date.now());
                    console.log(`LW Search: Product catalog loaded from CSV: ${productDataCache.size} items.`);
                },
                onerror: (err) => {
                     console.error("LW Search: Error loading image CSV:", err);
                     productDataCache = new Map();
                }
            });

        } catch (error) {
            console.error("LW Search: Error in getProductData:", error);
            productDataCache = new Map();
        }
    }

    function processImageCsvText(text) {
        const map = new Map();
        try {
            if (!text) return map;

            const lines = text.trim().split("\n");
            if (lines.length <= 1) return map;

            const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
            const skuIndex = headers.indexOf("skus");
            const imageIndex = headers.indexOf("image url");
            const urlIndex = headers.indexOf("product url");
            const nameIndex = headers.indexOf("product name");

            if (skuIndex === -1 || imageIndex === -1) return map;

            for (let i = 1; i < lines.length; i++) {
                const parts = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
                if (parts.length < headers.length) continue;

                const skusString = (parts[skuIndex] || "").trim().replace(/^"|"$/g, '');
                // --- [תוקן] סוגריים חסרים תוקנו בגרסה הקודמת ---
                const image = (parts[imageIndex] || "").trim().replace(/^"|"$/g, '');
                const link = (parts[urlIndex] || "").trim().replace(/^"|"$/g, '');
                const name = (parts[nameIndex] || "").trim().replace(/^"|"$/g, '');

                if (!image) continue;

                const productInfo = { image, link, name };

                if (skusString) {
                    skusString.split(',').forEach(s => {
                        const normSku = normalizeSku(s.trim());
                        if (normSku && !map.has(normSku)) {
                            map.set(normSku, productInfo);
                        }
                    });
                }
                if (name && !map.has(name.toLowerCase().trim())) {
                     map.set(name.toLowerCase().trim(), productInfo);
                }
            }
            return map;
        } catch (error) {
            console.error("LW Search: Error processing image CSV text:", error);
            return map;
        }
    }

    // פונקציית חיפוש התמונות (בודקת ש-productDataCache הוא אכן Map)
    function findImageMatch(sku, productName) {
        if (!productDataCache || typeof productDataCache.has !== 'function') {
            if (!productDataCache) {
                 console.warn("LW Search: findImageMatch called before productDataCache was loaded.");
            } else {
                 console.error("LW Search: productDataCache is not a Map!", productDataCache);
            }
            return null;
        }

        // 1. נסה לפי SKU מנורמל
        if (sku) {
            const normSku = normalizeSku(sku);
            if (productDataCache.has(normSku)) {
                return productDataCache.get(normSku);
            }
        }
        // 2. נסה לפי שם מוצר מדויק (כגיבוי)
        if (productName) {
            const normName = productName.toLowerCase().trim();
            if (productDataCache.has(normName)) {
                return productDataCache.get(normName);
            }
        }
        return null;
    }

    function normalizeSku(sku) {
        if (typeof sku !== 'string') return '';
        return sku.replace(/\D/g, '');
    }

    function getFullSizeImageUrl(thumbnailUrl) {
         if (!thumbnailUrl || typeof thumbnailUrl !== 'string') return '';
         return thumbnailUrl.split('?')[0];
    }

    function getOptimizedImageUrl(originalUrl, targetWidth = 100) {
        if (!originalUrl || originalUrl === PLACEHOLDER_IMG_URL) return PLACEHOLDER_IMG_URL;
        try {
            const baseUrl = getFullSizeImageUrl(originalUrl);
            return `${baseUrl}?width=${targetWidth}&height=${targetWidth}&mode=pad&format=png&v=5&output=webp`;
        } catch(e) {
            return originalUrl;
        }
    }

    function lwColorQtySpan(qtyText) {
        try {
            if (!qtyText) return qtyText;
            const m = String(qtyText).trim().match(/^(\d+)\s*\/\s*(\d+)$/);
            if (!m) return qtyText;
            const picked = parseInt(m[1], 10), total = parseInt(m[2], 10);
            if (picked === total && total === 0) return qtyText;
            if (picked > total || total > 1000) return qtyText;
            const cls = picked === total ? 'tampermonkey-picked-full'
                : picked === 0 && total > 0 ? 'tampermonkey-picked-none'
                : 'tampermonkey-picked-partial';
            return `<span class="${cls}">${picked} / ${total}</span>`;
        } catch (e) { return qtyText; }
    }

    function lwBoldLast3Digits(raw) {
        try {
            if (!raw) return '';
            const digits = String(raw).trim();
            if (!/^\d{10,}$/.test(digits)) return digits;
            const head = digits.slice(0, -3), tail = digits.slice(-3);
            return `${head}<b>${tail}</b>`;
        } catch (_) {
            return raw;
        }
    }

    // -------------------------------------------------------------------------
    // 8. הפעלה ומעקב אחר שינויים (MutationObserver)
    // -------------------------------------------------------------------------

    // טען את קטלוג התמונות ברקע
    getProductData();

    setTimeout(addSearchIcons, 1000);

    let observerDebounceTimer;
    const observer = new MutationObserver((mutations) => {
        const needsScan = mutations.some(m => m.addedNodes.length > 0 &&
            (m.target.matches('.px-3') || m.target.querySelector('div[data-name="destination_recipient_name"]'))
        );

        if (needsScan) {
            clearTimeout(observerDebounceTimer);
            observerDebounceTimer = setTimeout(addSearchIcons, 300);
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    createModal();

})();