// ==UserScript==
// @name         Lionwheel - WhatsApp Manager Pro V5.9
// @namespace    lionwheel-whatsapp-pro-v5-9
// @version      5.9
// @description  תיקון כתובת API לסגירה אוטומטית, בדיקת תקינות טלפון ושיפורי יציבות
// @author       Adam Lee
// @match        *://*.lionwheel.com/*
// @match        *://api.whatsapp.com/*
// @updateURL    https://raw.githubusercontent.com/AdamLee9186/anipet/main/whatsappmanager.js
// @downloadURL  https://raw.githubusercontent.com/AdamLee9186/anipet/main/whatsappmanager.js
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @grant        window.close
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // ==========================================
    // 0. Auto-Close WhatsApp API Tab
    // ==========================================
    // This logic relies on the open command using 'api.whatsapp.com'
    if (window.location.hostname === 'api.whatsapp.com') {
        // נותן קצת יותר זמן לטעינה/פתיחה לפני סגירה אוטומטית
        setTimeout(() => window.close(), 5000);
        return;
    }

    // ==========================================
    // 1. Constants & Defaults
    // ==========================================
    const EXCLUDED_BARCODES = ['10000', '491', '1948', '1949', '555503', '2543'];
    const EXCLUDED_KEYWORDS = ['משלוח', 'מתנה', 'מנוי', 'במנוי'];

    // Utility: Generate unique ID
    const generateId = () => '_' + Math.random().toString(36).substr(2, 9);

    const DEFAULT_PRESETS = [
        {
            id: 'p_multi_missing_swap',
            title: "רבים, חלק חסר, בוא נחליף",
            color: "#D9EAD3",
            text: "שלום {name}, זה מאניפט חוצות לגבי המשלוח שלך.\nקיבלנו את ההזמנה, וכרגע חסרים במלאי חלק מהמוצרים: {products} וישנו עיכוב במשלוח. מצטערים מראש על העיכוב, ואנו דואגים להביא את המוצרים שהזמת בהקדם האפשרי מהיבואן ומהסניפים הקרובים כך שהמשלוח יתעכב כמה שפחות. בכדי לא לעכב את המשלוח, האם נוכל להחליף חלק מהמוצרים בהזמנה? כך שתקבל במקום:"
        },
        {
            id: 'p_multi_missing',
            title: "רבים, חלק חסר",
            color: "#93C47D",
            text: "שלום {name}, זה מאניפט חוצות לגבי המשלוח שלך.\nקיבלנו את ההזמנה במערכת ורצינו לעדכן כי כרגע חסרים במלאי חלק מהמוצרים שהזמנת: {products} אנו מנסים להשיג אותם בהקדם האפשרי מהסניפים הקרובים ומהיבואן כדי שהמשלוח יתעכב כמה שפחות.\nמצטערים מראש על העיכוב ומודים על סבלנותך."
        },
        {
            id: 'p_split',
            title: "פיצול משלוח",
            color: "#F4CCCC",
            text: "אנחנו מבינים את הדחיפות ורוצים לתת לך את השירות הטוב ביותר.\nלכן, האם לשלוח אליך את חלק מהמשלוח שכן יש במלאי ביומיים הקרובים, ואת היתרה ({products}) נספק ברגע שתגיע למלאי הזמין?"
        },
        {
            id: 'p_single_missing_swap',
            title: "יחיד, חסר במלאי, בוא נחליף",
            color: "#FCE5CD",
            text: "שלום {name}, זה מאניפט חוצות לגבי המשלוח שלך. קיבלנו את ההזמנה\nוכרגע חסר לנו במלאי {products} שהזמנת, וישנו עיכוב במשלוח. מצטערים מראש על העיכוב ודואגים להביא את המוצר שהוזמן בהקדם האפשרי מהיבואן ומהסניפים הקרובים כך שהמשלוח יתעכב כמה שפחות. בכדי לא לעכב את המשלוח, נוכל להחליף המוצר בהזמנה? כך שתקבל במקום:"
        },
        {
            id: 'p_single_missing',
            title: "יחיד, חסר במלאי",
            color: "#93C47D",
            text: "שלום {name}, זה מאניפט חוצות לגבי המשלוח שהזמנת.\nרצינו לעדכן כי כרגע חסר לנו במלאי {products} שהזמנת ואנו מנסים להשיג אותו בהקדם האפשרי מהסניפים הקרובים ומהיבואן כדי שהמשלוח יתעכב כמה שפחות.\nמצטערים מראש על העיכוב ומודים לך על סבלנותך."
        },
        {
            id: 'p_all_missing',
            title: "הכל חסר",
            color: "#F4CCCC",
            text: "שלום {name}, זה מאניפט חוצות.\nכרגע קיבלנו את ההזמנה שלך וחסרים לנו המוצרים שהזמנת: {products} ואנחנו עושים מאמצים להשיג אותם מהסניפים הקרובים ומהיבואן בהקדם האפשרי כך שהמשלוח יתעכב כמה שפחות.\nאנו מצטערים מראש על העיכוב שנוצר ומודים על ההבנה."
        },
        {
            id: 'p_refund_1',
            title: "פיצול + זיכוי 1",
            color: "#6FA8DC",
            text: "לגבי הפיצול + זיכוי, פותחים לך עכשיו בקשה לזיכוי עבור המוצרים החסרים ({products}), ואת שאר ההזמנה אנחנו מוציאים אליך בהקדם האפשרי.\nהאם לזכות את חבר המועדון או את אמצעי התשלום בו בוצעה העסקה?"
        },
        {
            id: 'p_refund_2',
            title: "פיצול + זיכוי 2",
            color: "#6FA8DC",
            text: "מעולה, לכל בירור נוסף ניתן להתקשר למס' 1-700-5555-03 עבור כל בירור בנוגע לזיכוי עצמו."
        },
        {
            id: 'p_do_refund',
            title: "תזכו אותי",
            color: "#C9DAF8",
            text: "מבינים את הבקשה ומצטערים על העיכוב שנוצר.\nפותחים לך עכשיו בקשה לזיכוי עבור {products} מול מוקד שירות לקוחות.\nהאם לזכות את חבר המועדון או את אמצעי התשלום בו בוצעה העסקה?\nלכל בירור נוסף ניתן להתקשר למס' 1-700-5555-03."
        },
        {
            id: 'p_where_refund',
            title: "איפה הזיכוי?",
            color: "#3C78D8",
            text: "שלום {name}, לגבי הזיכוי שלך, אני רוצה לעזור לך, אבל אין לי מערכת לזיכויים, אני אחראי לוגיסטי בלבד.\nאני מקפיץ לאחמ\"שית שאחראית על הזיכויים. בשביל מידע נוסף או שירות אנושי עדיף לפנות למוקד שירות לקוחות ב־1-700-5555-03.\nשיהיה המשך יום מבורך."
        },
        {
            id: 'p_where_orders',
            title: "הזמנות בחנות",
            color: "#B4A7D6",
            text: "שלום {name}. המספר הזה לא פעיל יותר עבור הזמנות וניתן ליצור קשר עם נציגנו במספר טלפון 054-5458214 או למספר טלפון של החנות 04-6568229 בין שעות הפעילות 9:30-20:30"
        },
        {
            id: 'p_no_add',
            title: "אין להוסיף, אין קופה",
            color: "#8E7CC3",
            text: "לצערי אין לי כאן מערכת קופות המאפשרת גביית תשלום עבור מוצרים נוספים.\nלביצוע תוספות להזמנה ניתן להתקשר למוקד 1-700-5555-03 או לסניף חוצות 04-6568229.\nתודה על ההבנה ושיהיה המשך יום מבורך."
        }
    ];

    // ==========================================
    // 2. Data Management (Variables Hoisted)
    // ==========================================
    let saveButtonEl = null;
    let modalBodyEl = null;
    let rowsContainerEl = null;
    let isLocked = true;
    let hasUnsavedChanges = false;
    let isModalOpen = false;
    let savedStateString = "";
    let detectedMissingProducts = [];
    let selectedProducts = [];
    let currentPresets = [];

    function updateSaveButtonState() {
        if (!saveButtonEl) return;
        const footer = document.querySelector('.tm-modal-footer');
        if (footer) {
            if (isLocked) footer.classList.add('tm-hidden');
            else footer.classList.remove('tm-hidden');
        }
        if (saveButtonEl) {
            saveButtonEl.disabled = !hasUnsavedChanges;
            saveButtonEl.title = hasUnsavedChanges ? "שמור שינויים" : "אין שינויים לשמירה";
        }
    }

    function loadPresets() {
        const stored = GM_getValue('whatsapp_presets_v3');
        let loaded = stored ? JSON.parse(stored) : JSON.parse(JSON.stringify(DEFAULT_PRESETS));
        let modified = false;
        loaded.forEach(p => {
            if (!p.id) {
                p.id = generateId();
                modified = true;
            }
        });
        if (modified) savePresets(loaded);
        return loaded;
    }

    function savePresets(presets) {
        const jsonStr = JSON.stringify(presets, null, 4);
        GM_setValue('whatsapp_presets_v3', jsonStr);
        currentPresets = presets;
        savedStateString = jsonStr;
        hasUnsavedChanges = false;
        updateSaveButtonState();
    }

    function checkForChanges() {
        const currentStateStr = JSON.stringify(currentPresets);
        hasUnsavedChanges = (currentStateStr !== savedStateString);
        updateSaveButtonState();
    }

    currentPresets = loadPresets();
    savedStateString = JSON.stringify(currentPresets);

    // ==========================================
    // 3. CSS Style
    // ==========================================
    const css = `
        .tm-wa-btn { cursor: pointer; color: #ff9800; font-size: 1.2em; margin-inline-end: 8px; transition: 0.2s; }
        .tm-wa-btn:hover { transform: scale(1.15); color: #e65100; }
        .tm-modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); z-index: 10000; display: flex; justify-content: center; align-items: center; backdrop-filter: blur(2px); }
        .tm-modal-content { background: white; width: 750px; max-width: 95%; max-height: 90vh; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.2); display: flex; flex-direction: column; overflow: hidden; font-family: system-ui, -apple-system, sans-serif; direction: rtl; }
        .tm-modal-header { padding: 12px 20px; background: #f8f9fa; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; }
        .tm-header-right, .tm-header-left { display: flex; gap: 10px; align-items: center; }
        .tm-modal-title { font-weight: bold; font-size: 1.1rem; color: #333; }
        .tm-icon-btn { cursor: pointer; border: none; background: none; font-size: 1.1rem; padding: 5px; color: #555; transition: 0.2s; }
        .tm-icon-btn:hover { color: #000; transform: scale(1.1); }
        .tm-lock-btn.locked { color: #e74c3c; } .tm-lock-btn.unlocked { color: #2ecc71; }
        .tm-modal-body { padding: 15px; overflow-y: auto; flex-grow: 1; background: #f9f9f9; }
        .tm-products-selection-area { background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 12px; margin-bottom: 15px; }
        .tm-products-title { font-size: 13px; font-weight: bold; color: #555; margin-bottom: 8px; }
        .tm-products-list { display: flex; flex-direction: column; gap: 5px; max-height: 120px; overflow-y: auto; }
        .tm-product-checkbox-row { display: flex; align-items: center; gap: 8px; font-size: 13px; }
        .tm-product-checkbox-row input { cursor: pointer; }
        .tm-no-products-msg { font-size: 12px; color: #999; font-style: italic; }
        .tm-modal-footer { padding: 10px 20px; background: #fff; border-top: 1px solid #eee; display: flex; justify-content: center; transition: all 0.3s; }
        .tm-modal-footer.tm-hidden { display: none !important; }
        .tm-main-save-btn { background: #4CAF50; color: white; border: none; padding: 8px 30px; border-radius: 20px; font-weight: bold; font-size: 14px; cursor: pointer; box-shadow: 0 2px 5px rgba(0,0,0,0.1); transition: 0.2s; }
        .tm-main-save-btn:hover { background: #43a047; box-shadow: 0 4px 8px rgba(0,0,0,0.15); }
        .tm-main-save-btn:disabled { background: #ccc; cursor: not-allowed; box-shadow: none; color: #666; }

        .tm-preset-row {
            display: grid;
            grid-template-columns: 30px 25px 8px 1fr 50px;
            gap: 10px;
            background: white;
            margin-bottom: 8px;
            border-radius: 8px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.05);
            transition: transform 0.1s;
            overflow: hidden;
            border: 1px solid #eee;
            align-items: stretch;
            position: relative;
        }
        .tm-preset-row:hover { box-shadow: 0 4px 8px rgba(0,0,0,0.1); }
        .tm-preset-row.dragging { opacity: 0.5; border: 2px dashed #999; }
        .tm-is-locked .tm-drag-handle { cursor: not-allowed; opacity: 0.3; }
        .tm-is-locked .tm-btn-edit, .tm-is-locked .tm-btn-delete { display: none; }
        .tm-is-locked .tm-preset-row { grid-template-columns: 30px 25px 8px 1fr 50px; }
        .tm-preset-row.tm-edit-mode { display: block; background: #fff8e1; border: 1px solid #ffe0b2; padding: 15px; }

        .tm-drag-handle { display: flex; align-items: center; justify-content: center; cursor: grab; color: #bbb; background: #fafafa; border-left: 1px solid #eee; }
        .tm-drag-handle:hover { color: #555; background: #f0f0f0; }
        .tm-row-number { display: flex; align-items: center; justify-content: center; font-size: 12px; color: #888; font-weight: bold; background: #fff; }
        .tm-color-strip { width: 100%; height: 100%; }
        .tm-preset-content { padding: 10px 0; cursor: pointer; }
        .tm-preset-title-text { font-weight: bold; font-size: 0.95rem; margin-bottom: 4px; color: #222; }
        .tm-preset-body-text { font-size: 0.85rem; color: #555; line-height: 1.3; white-space: pre-wrap; }

        .tm-preset-actions {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            border-right: 1px solid #eee;
            gap: 5px;
            background: #fafafa;
            padding: 8px 0;
            position: relative;
        }
        .tm-action-btn {
            border: none;
            background: white;
            cursor: pointer;
            font-size: 0.9rem;
            width: 35px;
            height: 35px;
            border-radius: 50%;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            border: 1px solid #eee;
            flex-shrink: 0;
            position: relative;
        }
        .tm-btn-send { color: #25D366; font-size: 1.2rem; }
        .tm-btn-send:hover { background: #25D366; color: white; }
        .tm-btn-copy { color: #2196F3; }
        .tm-btn-copy:hover { background: #2196F3; color: white; }
        .tm-btn-edit:hover { background: #333; color: white; }
        .tm-btn-delete { color: #e74c3c; }
        .tm-btn-delete:hover { background: #e74c3c; color: white; }

        /* Tooltip Style - Applies to Copy & Send buttons */
        .tm-action-btn .tm-copied-tooltip {
            position: absolute;
            top: -5px;
            right: 50%;
            background-color: #333;
            color: white;
            padding: 5px 10px;
            border-radius: 4px;
            font-size: 12px;
            white-space: nowrap;
            opacity: 0;
            transition: opacity 0.3s, transform 0.3s;
            transform: translate(50%, 5px);
            pointer-events: none;
            z-index: 10001;
        }
        .tm-action-btn .tm-copied-tooltip.visible {
            opacity: 1;
            transform: translate(50%, -100%);
        }

        .tm-edit-label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px; color: #333; }
        .tm-input { width: 100%; padding: 8px; margin-bottom: 12px; border: 1px solid #ddd; border-radius: 6px; box-sizing: border-box; }
        .tm-textarea { width: 100%; height: 100px; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-family: inherit; resize: vertical; box-sizing: border-box; font-size: 14px; line-height: 1.4; }
        .tm-edit-controls { display: flex; gap: 10px; justify-content: flex-end; margin-top: 10px; }
        .tm-save-btn { background: #4CAF50; color: white; border: none; padding: 6px 14px; border-radius: 4px; cursor: pointer; }
        .tm-cancel-btn { background: #757575; color: white; border: none; padding: 6px 14px; border-radius: 4px; cursor: pointer; }
    `;
    const styleEl = document.createElement('style');
    styleEl.textContent = css;
    document.head.appendChild(styleEl);

    // ==========================================
    // 4. Logic & Logic (MutationObserver)
    // ==========================================

    function getTimeGreeting() {
        const h = new Date().getHours();
        if (h >= 5 && h < 12) return "בוקר טוב";
        if (h >= 12 && h < 17) return "צהריים טובים";
        if (h >= 17 && h < 21) return "ערב טוב";
        return "שלום";
    }

    function debounce(func, wait) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    function injectButton() {
        const phoneRows = document.querySelectorAll('[data-name="destination_phone"]:not(.tm-presets-injected)');
        phoneRows.forEach(row => {
            const targetCol = row.querySelector('.col-xxl-7, .col-6:last-child') || row.children[1];
            if (!targetCol) return;

            const icon = document.createElement('i');
            icon.className = 'fa-solid fa-comment-dots tm-wa-btn';
            icon.title = 'ניהול הודעות וואטסאפ';
            icon.onclick = (e) => {
                e.stopPropagation();
                const clientData = extractClientData(row);
                openModal(clientData);
            };
            const innerSpan = targetCol.querySelector('.hover-copy');
            if (innerSpan) innerSpan.insertBefore(icon, innerSpan.firstChild);
            else targetCol.prepend(icon);

            row.classList.add('tm-presets-injected');
        });
    }

    function injectButtonGuarded() {
        if (isModalOpen) return;
        if (!document.querySelector('[data-name="destination_phone"]')) return;
        injectButton();
    }

    const observer = new MutationObserver(debounce(() => injectButtonGuarded(), 300));
    observer.observe(document.body, { childList: true, subtree: true });
    injectButtonGuarded();

    function extractClientData(row) {
        let phone = '';
        const phoneEl = row.querySelector('.whatsapp-injected') || row.querySelector('.hover-copy');
        if (phoneEl) phone = phoneEl.textContent.replace(/\D/g, '');
        if (phone.startsWith('0')) phone = '972' + phone.substring(1);

        let firstName = "לקוח יקר";
        const parentContainer = row.closest('.px-3');
        if (parentContainer) {
            const nameRow = parentContainer.querySelector('[data-name="destination_recipient_name"]');
            if (nameRow) {
                const fullName = nameRow.textContent.trim().replace('שם', '').trim();
                firstName = fullName.split(/\s+/)[0] || "לקוח יקר";
            }
        }

        let missingProducts = [];
        const rootContainer = row.closest('.offcanvas, .card, .modal-content') || document;

        const checkItem = (name, ordered, picked, barcode) => {
            if (!name) return;
            if (EXCLUDED_KEYWORDS.some(k => name.includes(k))) return;
            if (barcode && EXCLUDED_BARCODES.includes(barcode)) return;
            const missing = (ordered - picked);
            if (missing > 0) missingProducts.push({ name: name.trim(), missing: missing });
        };

        const inputRows = rootContainer.querySelectorAll('.order-item-row');
        if (inputRows.length > 0) {
            inputRows.forEach(item => {
                const nameEl = item.querySelector('.order-item-name input') || item.querySelector('input.order-item-name');
                const qtyEl = item.querySelector('.order-item-quantity input') || item.querySelector('input.order-item-quantity');
                const pickedEl = item.querySelector('input[name*="picked_quantity"]') || item.querySelector('input[name*="collected_quantity"]') || item.querySelector('.order-item-picked-quantity input');
                const skuEl = item.querySelector('.order-item-sku input') || item.querySelector('input.order-item-sku');
                if (nameEl && qtyEl && pickedEl) {
                    checkItem(nameEl.value, parseFloat(qtyEl.value) || 0, parseFloat(pickedEl.value) || 0, skuEl ? skuEl.value : null);
                }
            });
        }

        function findProductsTable(container) {
            const tables = Array.from(container.querySelectorAll('table'));
            for (const t of tables) {
                const headers = Array.from(t.querySelectorAll('thead th'))
                    .map(th => (th.textContent || '').replace(/\s+/g, ' ').trim())
                    .filter(Boolean);
                const hasName = headers.some(h => h.includes('שם'));
                const hasQtyPicked = headers.some(h => h.includes('כמות') && h.includes('לוקט'));
                if (hasName && hasQtyPicked) return t;
            }
            return null;
        }

        function getHeaderIndex(table, headerIncludes) {
            const ths = Array.from(table.querySelectorAll('thead th'));
            for (let i = 0; i < ths.length; i++) {
                const txt = (ths[i].textContent || '').replace(/\s+/g, ' ').trim();
                if (!txt) continue;
                if (headerIncludes.every(part => txt.includes(part))) return i;
            }
            return -1;
        }

        // Strategy 2: Products Table Only
        if (missingProducts.length === 0) {
            const productsTable = findProductsTable(document) || findProductsTable(rootContainer);
            if (productsTable) {
                const idxName = getHeaderIndex(productsTable, ['שם']);
                const idxQty = getHeaderIndex(productsTable, ['כמות', 'לוקט']);
                const idxSku = getHeaderIndex(productsTable, ['מק״ט']);
                const idxBarcode = getHeaderIndex(productsTable, ['ברקוד']);

                const tableRows = Array.from(productsTable.querySelectorAll('tbody tr'));
                tableRows.forEach(tr => {
                    const cells = Array.from(tr.cells || []);
                    const qtyCell =
                        tr.querySelector('td[data-label="כמות / לוקט"]') ||
                        (idxQty >= 0 ? cells[idxQty] : null) ||
                        cells.find(cell => (cell.textContent || '').match(/(\d+)\s*\/\s*(\d+)/));

                    if (!qtyCell) return;
                    const text = qtyCell.textContent || '';
                    const qtyMatch = text.match(/(\d+)\s*\/\s*(\d+)/);
                    if (!qtyMatch) return;

                    const picked = parseInt(qtyMatch[1], 10);
                    const ordered = parseInt(qtyMatch[2], 10);

                    const nameCell =
                        tr.querySelector('td[data-label="שם"]') ||
                        (idxName >= 0 ? cells[idxName] : null);

                    const skuCell =
                        tr.querySelector('td[data-label="מק״ט"]') ||
                        tr.querySelector('td[data-label="ברקוד"]') ||
                        (idxSku >= 0 ? cells[idxSku] : null) ||
                        (idxBarcode >= 0 ? cells[idxBarcode] : null);

                    if (!nameCell) return;
                    checkItem(
                        nameCell.innerText,
                        ordered,
                        picked,
                        skuCell ? skuCell.innerText.trim() : null
                    );
                });
            } else {
                // Fallback: old behavior (only if no products table found)
                const tableRows = rootContainer.querySelectorAll('table tbody tr');
                tableRows.forEach(tr => {
                    const qtyCell = tr.querySelector('td[data-label="כמות / לוקט"]') || Array.from(tr.cells).find(cell => cell.textContent.match(/(\d+)\s*\/\s*(\d+)/));
                    if (!qtyCell) return;
                    const text = qtyCell.textContent;
                    const qtyMatch = text.match(/(\d+)\s*\/\s*(\d+)/);
                    if (!qtyMatch) return;
                    const nameEl = tr.querySelector('td[data-label="שם"]') || tr.querySelector('.order-item-name');
                    const skuEl = tr.querySelector('td[data-label="מק״ט"]') || tr.querySelector('td[data-label="ברקוד"]');
                    if (!nameEl) return;
                    checkItem(nameEl.innerText, parseInt(qtyMatch[2], 10), parseInt(qtyMatch[1], 10), skuEl ? skuEl.innerText.trim() : null);
                });
            }
        }
        return { phone, name: firstName, productsList: missingProducts };
    }

    function formatProductsList(products) {
        const formattedNames = products.map(p => {
            let name = p.name;
            if (p.missing > 1) name += ` (${p.missing} יחידות)`;
            return name;
        });
        const isEmpty = (formattedNames.length === 0);
        let productsString = "";
        if (!isEmpty) {
            if (formattedNames.length === 1) productsString = formattedNames[0];
            else productsString = "\n" + formattedNames.map(p => `• ${p}`).join("\n") + "\n";
        }
        return { productsString, isEmpty };
    }

    function formatFinalText(template, clientData, productsString, isEmptySelection) {
        const greetingTime = getTimeGreeting();
        let finalText = template.replace(/{name}/g, clientData.name).replace(/{greeting}/g, greetingTime);
        if (isEmptySelection) {
            if (finalText.includes('{products}')) {
                finalText = finalText.replace(/:\s*\{products\}/, '.');
                finalText = finalText.replace(/\{products\}/, '');
            }
        } else {
            finalText = finalText.replace(/{products}/g, productsString);
        }
        return finalText;
    }

    // ==========================================
    // 5. Build & Manage Modal
    // ==========================================

    function openNewPresetEditor(clientData) {
        const newPreset = { id: generateId(), title: "הודעה חדשה", color: "#eeeeee", text: "תוכן ההודעה כאן..." };
        currentPresets.push(newPreset);
        checkForChanges();
        renderContent(clientData);
        setTimeout(() => {
            modalBodyEl.scrollTop = modalBodyEl.scrollHeight;
            const newRow = rowsContainerEl.querySelector(`[data-id="${newPreset.id}"]`);
            if (newRow) {
                const editBtn = newRow.querySelector('.tm-btn-edit');
                if (editBtn) editBtn.click();
            }
        }, 100);
    }

    function openModal(clientData) {
        const existing = document.querySelector('.tm-modal-overlay');
        if (existing) existing.remove();

        isModalOpen = true;
        hasUnsavedChanges = false;
        isLocked = true;
        detectedMissingProducts = clientData.productsList;
        selectedProducts = [...detectedMissingProducts];

        const overlay = document.createElement('div');
        overlay.className = 'tm-modal-overlay';
        overlay.onclick = (e) => {
            if (e.target !== overlay) return;
            if (hasUnsavedChanges) {
                const ok = confirm("יש שינויים שלא נשמרו. לצאת בכל זאת?");
                if (!ok) return;
            }
            isModalOpen = false;
            overlay.remove();
        };

        const content = document.createElement('div');
        content.className = 'tm-modal-content';

        const header = document.createElement('div');
        header.className = 'tm-modal-header';

        const headerRight = document.createElement('div');
        headerRight.className = 'tm-header-right';

        const titleWrap = document.createElement('div');
        titleWrap.className = 'tm-modal-title';

        const waIcon = document.createElement('i');
        waIcon.className = 'fa-brands fa-whatsapp';
        waIcon.style.color = '#25D366';

        const titleText = document.createElement('span');
        titleText.textContent = ` הודעות עבור: ${clientData.name || ""}`;

        titleWrap.appendChild(waIcon);
        titleWrap.appendChild(titleText);
        headerRight.appendChild(titleWrap);

        const headerLeft = document.createElement('div');
        headerLeft.className = 'tm-header-left';

        const addBtn = document.createElement('button');
        addBtn.className = 'tm-icon-btn tm-add-btn';
        addBtn.title = 'הוסף הודעה חדשה';
        addBtn.innerHTML = '<i class="fa-solid fa-plus"></i>';

        const lockBtnEl = document.createElement('button');
        lockBtnEl.className = `tm-icon-btn tm-lock-btn ${isLocked ? 'tm-locked' : 'tm-unlocked'}`;
        lockBtnEl.title = isLocked ? 'לחץ לביטול נעילה' : 'לחץ לנעילה';
        lockBtnEl.innerHTML = `<i class="fa-solid ${isLocked ? 'fa-lock' : 'fa-lock-open'}"></i>`;

        const closeBtn = document.createElement('button');
        closeBtn.className = 'tm-icon-btn tm-close-btn';
        closeBtn.title = 'סגור';
        closeBtn.textContent = '×';

        headerLeft.appendChild(addBtn);
        headerLeft.appendChild(lockBtnEl);
        headerLeft.appendChild(closeBtn);

        header.appendChild(headerRight);
        header.appendChild(headerLeft);

        const footer = document.createElement('div');
        footer.className = `tm-modal-footer ${isLocked ? 'tm-hidden' : ''}`;
        footer.innerHTML = `<button class="tm-main-save-btn" disabled>שמור שינויים</button>`;
        saveButtonEl = footer.querySelector('.tm-main-save-btn');

        modalBodyEl = document.createElement('div');
        modalBodyEl.className = 'tm-modal-body';

        closeBtn.onclick = () => {
            if (hasUnsavedChanges) {
                const ok = confirm("יש שינויים שלא נשמרו. לצאת בכל זאת?");
                if (!ok) return;
            }
            isModalOpen = false;
            overlay.remove();
        };
        lockBtnEl.onclick = () => {
            isLocked = !isLocked;
            hasUnsavedChanges = true;
            lockBtnEl.className = `tm-icon-btn tm-lock-btn ${isLocked ? 'tm-locked' : 'tm-unlocked'}`;
            lockBtnEl.title = isLocked ? 'לחץ לביטול נעילה' : 'לחץ לנעילה';
            lockBtnEl.innerHTML = `<i class="fa-solid ${isLocked ? 'fa-lock' : 'fa-lock-open'}"></i>`;
            updateSaveButtonState();
            renderContent(clientData);
        };

        addBtn.onclick = () => {
            if (isLocked) {
                alert("כדי להוסיף הודעה יש לבטל נעילה");
                return;
            }
            openNewPresetEditor(clientData);
        };

        saveButtonEl.onclick = () => {
            savePresets(currentPresets);
            const btn = saveButtonEl;
            const originalText = btn.textContent;
            btn.textContent = "נשמר! ✓";
            btn.style.background = "#2ecc71";
            setTimeout(() => {
                btn.textContent = originalText;
                btn.style.background = "#4CAF50";
            }, 1500);
        };

        renderContent(clientData);
        content.appendChild(header);
        content.appendChild(modalBodyEl);
        content.appendChild(footer);
        overlay.appendChild(content);
        document.body.appendChild(overlay);
        updateSaveButtonState();
    }

    function renderContent(clientData) {
        if (!modalBodyEl) return;
        modalBodyEl.innerHTML = '';
        modalBodyEl.className = `tm-modal-body ${isLocked ? 'tm-is-locked' : ''}`;

        if (detectedMissingProducts.length > 0) {
            const selectorDiv = document.createElement('div');
            selectorDiv.className = 'tm-products-selection-area';
            let checkboxesHTML = '';
            detectedMissingProducts.forEach((prod) => {
                const isChecked = selectedProducts.some(p => p.name === prod.name) ? 'checked' : '';
                let label = prod.name;
                if (prod.missing > 1) label += ` (${prod.missing} יחידות)`;
                else if (prod.missing === 1) label += ` (יחידה 1 חסרה)`;
                checkboxesHTML += `<label class="tm-product-checkbox-row"><input type="checkbox" class="tm-prod-cb" data-prod-name="${prod.name.replace(/"/g, '&quot;')}" ${isChecked}>${label}</label>`;
            });
            selectorDiv.innerHTML = `<div class="tm-products-title">מוצרים חסרים שזוהו (בחר מה לכלול בהודעה):</div><div class="tm-products-list">${checkboxesHTML}</div>`;
            selectorDiv.querySelectorAll('.tm-prod-cb').forEach(cb => {
                cb.onchange = (e) => {
                    const prodName = e.target.getAttribute('data-prod-name');
                    const originalProd = detectedMissingProducts.find(p => p.name === prodName);
                    if (e.target.checked) {
                        if (originalProd && !selectedProducts.some(p => p.name === prodName)) selectedProducts.push(originalProd);
                    } else {
                        selectedProducts = selectedProducts.filter(p => p.name !== prodName);
                    }
                    renderPresetsRows(clientData);
                };
            });
            modalBodyEl.appendChild(selectorDiv);
        } else {
            const msgDiv = document.createElement('div');
            msgDiv.className = 'tm-products-selection-area';
            msgDiv.innerHTML = `<div class="tm-no-products-msg">לא זוהו מוצרים חסרים אוטומטית.</div>`;
            modalBodyEl.appendChild(msgDiv);
        }

        rowsContainerEl = document.createElement('div');
        modalBodyEl.appendChild(rowsContainerEl);
        renderPresetsRows(clientData);
    }

    function renderPresetsRows(clientData) {
        if (!rowsContainerEl) return;
        rowsContainerEl.innerHTML = '';
        const { productsString, isEmpty } = formatProductsList(selectedProducts);

        currentPresets.forEach((preset, index) => {
            const row = document.createElement('div');
            row.className = 'tm-preset-row';
            row.dataset.id = preset.id;
            if (!isLocked) row.draggable = true;

            const previewText = formatFinalText(preset.text, clientData, productsString, isEmpty);

            const grip = document.createElement('div');
            grip.className = 'tm-drag-handle';
            grip.title = isLocked ? 'נעול' : 'גרור לשינוי סדר';
            grip.innerHTML = `<i class="fa-solid fa-grip-vertical"></i>`;
            row.appendChild(grip);

            const num = document.createElement('div');
            num.className = 'tm-row-number';
            num.textContent = index + 1;
            row.appendChild(num);

            const colorStrip = document.createElement('div');
            colorStrip.className = 'tm-color-strip';
            colorStrip.style.backgroundColor = preset.color;
            row.appendChild(colorStrip);

            const content = document.createElement('div');
            content.className = 'tm-preset-content';
            content.title = 'לחץ לשליחה';
            content.onclick = () => sendWhatsapp(previewText, clientData, row.querySelector('.tm-btn-send'));

            const titleEl = document.createElement('div');
            titleEl.className = 'tm-preset-title-text';
            titleEl.textContent = preset.title;
            const bodyEl = document.createElement('div');
            bodyEl.className = 'tm-preset-body-text';
            bodyEl.textContent = previewText;
            content.appendChild(titleEl);
            content.appendChild(bodyEl);
            row.appendChild(content);

            const actions = document.createElement('div');
            actions.className = 'tm-preset-actions';

            // Send Button with Tooltip capability
            const btnSend = document.createElement('button');
            btnSend.className = 'tm-action-btn tm-btn-send';
            btnSend.title = 'שלח בוואטסאפ';
            btnSend.innerHTML = `<i class="fa-brands fa-whatsapp"></i>`;

            const tooltipSend = document.createElement('div');
            tooltipSend.className = 'tm-copied-tooltip';
            tooltipSend.textContent = 'מועתק ושולח...';
            btnSend.appendChild(tooltipSend);

            btnSend.onclick = (e) => {
                e.stopPropagation();
                sendWhatsapp(previewText, clientData, btnSend);
            };
            actions.appendChild(btnSend);

            // Copy Button
            const btnCopy = document.createElement('button');
            btnCopy.className = 'tm-action-btn tm-btn-copy';
            btnCopy.title = 'העתק ללוח';
            btnCopy.innerHTML = `<i class="fa-solid fa-copy"></i>`;

            const tooltipCopy = document.createElement('div');
            tooltipCopy.className = 'tm-copied-tooltip';
            tooltipCopy.textContent = 'הועתק!';
            btnCopy.appendChild(tooltipCopy);

            btnCopy.onclick = (e) => {
                e.stopPropagation();
                GM_setClipboard(previewText);
                tooltipCopy.classList.add('visible');
                const originalIcon = btnCopy.querySelector('.fa-copy') ? btnCopy.innerHTML : '';
                btnCopy.innerHTML = `<i class="fa-solid fa-check"></i>`;
                btnCopy.style.color = '#4CAF50';
                btnCopy.appendChild(tooltipCopy);
                setTimeout(() => tooltipCopy.classList.remove('visible'), 1000);
                setTimeout(() => {
                    if (originalIcon) btnCopy.innerHTML = originalIcon;
                    else btnCopy.innerHTML = `<i class="fa-solid fa-copy"></i>`;
                    btnCopy.style.color = '';
                    btnCopy.appendChild(tooltipCopy);
                }, 1200);
            };
            actions.appendChild(btnCopy);

            const btnEdit = document.createElement('button');
            btnEdit.className = 'tm-action-btn tm-btn-edit';
            btnEdit.title = 'ערוך';
            btnEdit.innerHTML = `<i class="fa-solid fa-pencil"></i>`;
            btnEdit.onclick = (e) => { e.stopPropagation(); if(isLocked) return; enableEditMode(row, preset, clientData); };
            actions.appendChild(btnEdit);

            const btnDelete = document.createElement('button');
            btnDelete.className = 'tm-action-btn tm-btn-delete';
            btnDelete.title = 'מחק';
            btnDelete.innerHTML = `<i class="fa-solid fa-trash-can"></i>`;
            btnDelete.onclick = (e) => {
                e.stopPropagation();
                if(isLocked) return;
                if(confirm("האם למחוק את ההודעה?")) {
                    currentPresets = currentPresets.filter(p => p.id !== preset.id);
                    checkForChanges();
                    renderPresetsRows(clientData);
                }
            };
            actions.appendChild(btnDelete);
            row.appendChild(actions);

            if (!isLocked) addDragEvents(row, rowsContainerEl, clientData);
            rowsContainerEl.appendChild(row);
        });
    }

    function enableEditMode(rowElement, preset, clientData) {
        const editDiv = document.createElement('div');
        editDiv.className = 'tm-preset-row tm-edit-mode';
        editDiv.innerHTML = `
            <div>
                <label class="tm-edit-label">כותרת:</label>
                <input type="text" class="tm-input" id="edit-title">
                <label class="tm-edit-label">צבע רקע:</label>
                <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
                    <input type="color" id="edit-color-picker" style="height:35px; width:50px; cursor:pointer;">
                    <input type="text" class="tm-input" id="edit-color-text" style="margin:0; width:120px;">
                </div>
                <label class="tm-edit-label">תוכן ההודעה (משתנים: {name}, {products}, {greeting}):</label>
                <textarea class="tm-textarea" id="edit-text"></textarea>
                <div class="tm-edit-controls">
                    <button class="tm-cancel-btn">ביטול</button>
                    <button class="tm-save-btn">אשר זמנית</button>
                </div>
            </div>
        `;
        editDiv.querySelector('#edit-title').value = preset.title;
        editDiv.querySelector('#edit-text').value = preset.text;
        editDiv.querySelector('#edit-color-picker').value = preset.color;
        editDiv.querySelector('#edit-color-text').value = preset.color;
        const colorPicker = editDiv.querySelector('#edit-color-picker');
        const colorText = editDiv.querySelector('#edit-color-text');
        colorPicker.oninput = () => colorText.value = colorPicker.value;
        colorText.oninput = () => colorPicker.value = colorText.value;
        editDiv.querySelector('.tm-save-btn').onclick = () => {
            const idx = currentPresets.findIndex(p => p.id === preset.id);
            if (idx !== -1) {
                currentPresets[idx] = {
                    ...preset,
                    title: editDiv.querySelector('#edit-title').value,
                    color: editDiv.querySelector('#edit-color-text').value,
                    text: editDiv.querySelector('#edit-text').value
                };
                checkForChanges();
                renderPresetsRows(clientData);
            }
        };
        editDiv.querySelector('.tm-cancel-btn').onclick = () => renderPresetsRows(clientData);
        rowElement.replaceWith(editDiv);
    }

    function addDragEvents(row, container, clientData) {
        row.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', row.dataset.id);
            row.classList.add('dragging');
        });
        row.addEventListener('dragend', () => {
            row.classList.remove('dragging');
            document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
        });
        row.addEventListener('dragover', (e) => {
            e.preventDefault();
            const draggingRow = container.querySelector('.dragging');
            if (draggingRow && draggingRow !== row) {
                const bounding = row.getBoundingClientRect();
                if ((e.clientY - bounding.top + bounding.height / 2) > bounding.height) row.after(draggingRow);
                else row.before(draggingRow);
            }
        });
        row.addEventListener('drop', (e) => {
            e.preventDefault();
            const newOrder = [];
            const rows = container.querySelectorAll('.tm-preset-row');
            rows.forEach(domRow => {
                const id = domRow.dataset.id;
                const presetObj = currentPresets.find(p => p.id === id);
                if (presetObj) newOrder.push(presetObj);
            });
            currentPresets = newOrder;
            checkForChanges();
            renderPresetsRows(clientData);
        });
    }

    // ==========================================
    // 8. Actions (FIXED SEND FUNCTION)
    // ==========================================

    function sendWhatsapp(finalText, clientData, btnElement) {
        const phoneRaw = (clientData && clientData.phone) ? String(clientData.phone).trim() : "";

        const showButtonTooltip = (message) => {
            if (!btnElement) return false;
            const tooltip = btnElement.querySelector('.tm-copied-tooltip');
            if (!tooltip) return false;

            const originalText = tooltip.textContent;
            tooltip.textContent = message;
            tooltip.classList.add('visible');

            setTimeout(() => {
                tooltip.classList.remove('visible');
                tooltip.textContent = originalText;
            }, 1800);

            return true;
        };

        // נרמול מספר: שומר רק ספרות
        let digits = phoneRaw.replace(/\D/g, '');

        // המרה לפורמט בינלאומי ישראלי בשכבת השליחה
        if (digits.startsWith('0')) {
            // 0XXXXXXXXX -> 972XXXXXXXXX
            digits = '972' + digits.substring(1);
        } else if (!digits.startsWith('972')) {
            // לא מתחיל ב-0 ולא ב-972 => נחשב שגוי
            digits = '';
        }

        // ולידציה רכה + טוסט במקום alert
        // אחרי נרמול, מצפים לפורמט ישראלי מלא:
        //  - קווי: 972 + 8 ספרות  => 11 ספרות
        //  - נייד: 972 + 9 ספרות  => 12 ספרות
        if (
            !digits ||
            !digits.startsWith('972') ||
            (digits.length !== 11 && digits.length !== 12)
        ) {
            const shown = showButtonTooltip("שגיאה, אין מספר תקין");
            if (!shown) {
                console.warn("WhatsApp Manager: invalid phone, aborting send");
            }
            return;
        }

        const phone = digits;

        // 1. Auto-Copy Text
        GM_setClipboard(finalText);

        // Visual Feedback על הצלחה (reuse אותו מנגנון tooltip גם להצלחה)
        const shownSuccess = showButtonTooltip("מועתק ושולח...");
        if (!shownSuccess) {
            console.info("WhatsApp Manager: text copied to clipboard, opening WhatsApp (no tooltip element found).");
        }

        // 2. Open WhatsApp in a new tab ישירות מתוך ה-click
        // בלי delay כדי להימנע מחסימות popup בסביבות ארגוניות
        // שימוש ב-noopener,noreferrer להפחתת תלות ב-window.opener
        const url = `https://api.whatsapp.com/send?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(finalText)}`;
        const win = window.open(url, '_blank', 'noopener,noreferrer');

        // fallback: אם החלון נחסם, להסביר למשתמש שההודעה כבר הועתקה
        if (!win) {
            const shownBlocked = showButtonTooltip("נחסם חלון, ההודעה הועתקה – הדבק ידנית בוואטסאפ");
            if (!shownBlocked) {
                console.warn("WhatsApp Manager: popup blocked, text copied to clipboard. Paste manually in WhatsApp.");
            }
        }
    }

})();