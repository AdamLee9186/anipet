// ==UserScript==
// @name         Lionwheel - WhatsApp Manager Pro V3.2
// @namespace    lionwheel-whatsapp-pro-v3-2
// @version      3.2
// @description  מערכת ניהול ושליחת הודעות וואטסאפ
// @author       Adam Lee
// @match        *://*.lionwheel.com/*
// @updateURL    https://raw.githubusercontent.com/AdamLee9186/anipet/main/whatsappmanager.js
// @downloadURL  https://raw.githubusercontent.com/AdamLee9186/anipet/main/whatsappmanager.js
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // ==========================================
    // 1. הגדרות ברירת מחדל
    // ==========================================
    const DEFAULT_PRESETS = [
        {
            title: "רבים, חלק חסר, בוא נחליף",
            color: "#D9EAD3",
            text: "שלום {name}, זה מאניפט חוצות לגבי המשלוח שלך.\nקיבלנו את ההזמנה, וכרגע חסרים במלאי חלק מהמוצרים וישנו עיכוב במשלוח. מצטערים מראש על העיכוב, ואנו דואגים להביא את המוצרים שהזמנת בהקדם האפשרי מהיבואן ומהסניפים הקרובים כך שהמשלוח יתעכב כמה שפחות. בכדי לא לעכב את המשלוח, האם נוכל להחליף חלק מהמוצרים בהזמנה? כך שתקבל במקום:"
        },
        {
            title: "רבים, חלק חסר",
            color: "#93C47D",
            text: "שלום {name}, זה מאניפט חוצות לגבי המשלוח שלך.\nקיבלנו את ההזמנה במערכת ורצינו לעדכן כי כרגע חסרים במלאי חלק מהמוצרים שהזמנת. אנו מנסים להשיג אותם בהקדם האפשרי מהסניפים הקרובים ומהיבואן כדי שהמשלוח יתעכב כמה שפחות.\nמצטערים מראש על העיכוב ומודים על סבלנותך."
        },
        {
            title: "פיצול משלוח",
            color: "#F4CCCC",
            text: "אנחנו מבינים את הדחיפות ורוצים לתת לך את השירות הטוב ביותר.\nלכן, האם לשלוח אליך את חלק מהמשלוח שכן יש במלאי ביומיים הקרובים, ואת היתרה נספק ברגע שתגיע למלאי הזמין?"
        },
        {
            title: "יחיד, חסר במלאי, בוא נחליף",
            color: "#FCE5CD",
            text: "שלום {name}, זה מאניפט חוצות לגבי המשלוח שלך. קיבלנו את ההזמנה\nוכרגע חסר לנו במלאי המוצר שהזמנת וישנו עיכוב במשלוח. מצטערים מראש על העיכוב ודואגים להביא את המוצר שהוזמן בהקדם האפשרי מהיבואן ומהסניפים הקרובים כך שהמשלוח יתעכב כמה שפחות. בכדי לא לעכב את המשלוח, נוכל להחליף המוצר בהזמנה? כך שתקבל במקום:"
        },
        {
            title: "יחיד, חסר במלאי",
            color: "#93C47D",
            text: "שלום {name}, זה מאניפט חוצות לגבי המשלוח שהזמנת.\nרצינו לעדכן כי כרגע חסר לנו במלאי המוצר שהזמנת ואנו מנסים להשיג אותו בהקדם האפשרי מהסניפים הקרובים ומהיבואן כדי שהמשלוח יתעכב כמה שפחות.\nמצטערים מראש על העיכוב ומודים לך על סבלנותך."
        },
        {
            title: "הכל חסר",
            color: "#F4CCCC",
            text: "שלום {name}, זה מאניפט חוצות.\nכרגע קיבלנו את ההזמנה שלך וחסרים לנו המוצרים שהזמנת ואנחנו עושים מאמצים להשיג אותם מהסניפים הקרובים ומהיבואן בהקדם האפשרי כך שהמשלוח יתעכב כמה שפחות.\nאנו מצטערים מראש על העיכוב שנוצר ומודים על ההבנה."
        },
        {
            title: "פיצול + זיכוי 1",
            color: "#6FA8DC",
            text: "לגבי הפיצול + זיכוי, פותחים לך עכשיו בקשה לזיכוי עבור המוצרים החסרים, ואת שאר ההזמנה אנחנו מוציאים אליך בהקדם האפשרי.\nהאם לזכות את חבר המועדון או את אמצעי התשלום בו בוצעה העסקה?"
        },
        {
            title: "פיצול + זיכוי 2",
            color: "#6FA8DC",
            text: "מעולה, לכל בירור נוסף ניתן להתקשר למס' 1-700-5555-03 עבור כל בירור בנוגע לזיכוי עצמו."
        },
        {
            title: "תזכו אותי",
            color: "#C9DAF8",
            text: "מבינים את הבקשה ומצטערים על העיכוב שנוצר.\nפותחים לך עכשיו בקשה לזיכוי מול מוקד שירות לקוחות.\nהאם לזכות את חבר המועדון או את אמצעי התשלום בו בוצעה העסקה?\nלכל בירור נוסף ניתן להתקשר למס' 1-700-5555-03."
        },
        {
            title: "איפה הזיכוי?",
            color: "#3C78D8",
            text: "שלום {name}, לגבי הזיכוי שלך, אני רוצה לעזור לך, אבל אין לי מערכת לזיכויים, אני אחראי לוגיסטי בלבד.\nאני מקפיץ לאחמ\"שית שאחראית על הזיכויים. בשביל מידע נוסף או שירות אנושי עדיף לפנות למוקד שירות לקוחות ב־1-700-5555-03.\nשיהיה המשך יום מבורך."
        },
        {
            title: "הזמנות בחנות",
            color: "#B4A7D6",
            text: "שלום {name}. המספר הזה לא פעיל יותר עבור הזמנות וניתן ליצור קשר עם נציגנו במספר טלפון 054-5458214 או למספר טלפון של החנות 04-6568229 בין שעות הפעילות 9:30-20:30"
        },
        {
            title: "אין להוסיף, אין קופה",
            color: "#8E7CC3",
            text: "לצערי אין לי כאן מערכת קופות המאפשרת גביית תשלום עבור מוצרים נוספים.\nלביצוע תוספות להזמנה ניתן להתקשר למוקד 1-700-5555-03 או לסניף חוצות 04-6568229.\nתודה על ההבנה ושיהיה המשך יום מבורך."
        }
    ];

    // ==========================================
    // 2. ניהול נתונים (Load/Save/Import/Export)
    // ==========================================

    let isLocked = true; // ברירת מחדל: נעול
    let hasUnsavedChanges = false;
    let savedStateString = "";

    function loadPresets() {
        const stored = GM_getValue('whatsapp_presets_v3');
        if (!stored) return JSON.parse(JSON.stringify(DEFAULT_PRESETS));
        return JSON.parse(stored);
    }

    function savePresets(presets) {
        // שימוש ב-null, 4 יוצר JSON קריא עם הזחות גם בזיכרון (ובייצוא)
        const jsonStr = JSON.stringify(presets, null, 4);
        GM_setValue('whatsapp_presets_v3', jsonStr);
        currentPresets = presets;
        savedStateString = JSON.stringify(presets);
        hasUnsavedChanges = false;
        updateSaveButtonState();
    }

    let currentPresets = loadPresets();
    savedStateString = JSON.stringify(currentPresets);

    function checkForChanges() {
        const currentStateStr = JSON.stringify(currentPresets);
        hasUnsavedChanges = (currentStateStr !== savedStateString);
        updateSaveButtonState();
    }

    // --- תפריטי Tampermonkey ---

    // 1. ייצוא (JSON קריא)
    GM_registerMenuCommand("📤 ייצוא הגדרות לקובץ (גיבוי)", () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(currentPresets, null, 4));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "lionwheel_whatsapp_presets.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    });

    // 2. ייבוא
    GM_registerMenuCommand("📥 ייבוא הגדרות מקובץ", () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = e => {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = event => {
                try {
                    const importedPresets = JSON.parse(event.target.result);
                    if (Array.isArray(importedPresets)) {
                        if(confirm(`האם לדרוס את ההגדרות הנוכחיות ב-${importedPresets.length} הודעות מהקובץ?`)) {
                            savePresets(importedPresets);
                            alert("ההגדרות נטענו בהצלחה! הדף ירוענן.");
                            location.reload();
                        }
                    } else {
                        alert("קובץ לא תקין.");
                    }
                } catch(err) {
                    alert("שגיאה בקריאת הקובץ: " + err);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    });

    // 3. איפוס
    GM_registerMenuCommand("🔄 שחזר לברירת מחדל (Revert)", () => {
        if(confirm("האם אתה בטוח שברצונך למחוק את כל השינויים ולחזור להודעות המקוריות?")) {
            GM_deleteValue('whatsapp_presets_v3');
            alert("ההודעות שוחזרו בהצלחה! אנא רענן את הדף.");
            location.reload();
        }
    });

    // ==========================================
    // 3. CSS Style
    // ==========================================
    const css = `
        .tm-wa-btn {
            cursor: pointer; color: #ff9800; font-size: 1.2em; margin-inline-end: 8px; transition: 0.2s;
        }
        .tm-wa-btn:hover { transform: scale(1.15); color: #e65100; }

        .tm-modal-overlay {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.6); z-index: 10000;
            display: flex; justify-content: center; align-items: center;
            backdrop-filter: blur(2px);
        }

        .tm-modal-content {
            background: white; width: 750px; max-width: 95%; max-height: 90vh;
            border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.2);
            display: flex; flex-direction: column; overflow: hidden;
            font-family: system-ui, -apple-system, sans-serif; direction: rtl;
        }

        .tm-modal-header {
            padding: 12px 20px; background: #f8f9fa; border-bottom: 1px solid #eee;
            display: flex; justify-content: space-between; align-items: center;
        }
        .tm-header-left, .tm-header-right { display: flex; gap: 10px; align-items: center; }
        .tm-modal-title { font-weight: bold; font-size: 1.1rem; color: #333; }

        .tm-icon-btn { cursor: pointer; border: none; background: none; font-size: 1.1rem; padding: 5px; color: #555; transition: 0.2s; }
        .tm-icon-btn:hover { color: #000; transform: scale(1.1); }
        .tm-lock-btn.locked { color: #e74c3c; }
        .tm-lock-btn.unlocked { color: #2ecc71; }

        .tm-modal-body { padding: 15px; overflow-y: auto; flex-grow: 1; background: #f9f9f9; }

        /* הסתרת הפוטר כשהוא נעול */
        .tm-modal-footer {
            padding: 10px 20px; background: #fff; border-top: 1px solid #eee;
            display: flex; justify-content: center;
            transition: all 0.3s;
        }
        .tm-modal-footer.tm-hidden { display: none !important; }

        .tm-main-save-btn {
            background: #4CAF50; color: white; border: none; padding: 8px 30px;
            border-radius: 20px; font-weight: bold; font-size: 14px; cursor: pointer;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1); transition: 0.2s;
        }
        .tm-main-save-btn:hover { background: #43a047; box-shadow: 0 4px 8px rgba(0,0,0,0.15); }
        .tm-main-save-btn:disabled {
            background: #ccc; cursor: not-allowed; box-shadow: none; color: #666;
        }

        /* Grid Layout - Fixed & Spacious Column Widths */
        .tm-preset-row {
            display: grid;
            /* Grip | Num | Color | Content | Actions (120px) */
            grid-template-columns: 30px 25px 8px 1fr 120px;
            gap: 10px;
            background: white; margin-bottom: 8px; border-radius: 8px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.05);
            transition: transform 0.1s;
            overflow: hidden;
            border: 1px solid #eee;
            align-items: stretch;
        }
        .tm-preset-row:hover { box-shadow: 0 4px 8px rgba(0,0,0,0.1); }
        .tm-preset-row.dragging { opacity: 0.5; border: 2px dashed #999; }

        /* Locked State Visuals */
        .tm-is-locked .tm-drag-handle { cursor: not-allowed; opacity: 0.3; }
        .tm-is-locked .tm-btn-edit, .tm-is-locked .tm-btn-delete { display: none; }
        /* במצב נעול, מקטינים עמודת פעולות */
        .tm-is-locked .tm-preset-row { grid-template-columns: 30px 25px 8px 1fr 50px; }

        /* Edit Mode */
        .tm-preset-row.tm-edit-mode { display: block; background: #fff8e1; border: 1px solid #ffe0b2; padding: 15px; }

        .tm-drag-handle {
            display: flex; align-items: center; justify-content: center;
            cursor: grab; color: #bbb; background: #fafafa; border-left: 1px solid #eee;
        }
        .tm-drag-handle:hover { color: #555; background: #f0f0f0; }

        .tm-row-number {
            display: flex; align-items: center; justify-content: center;
            font-size: 12px; color: #888; font-weight: bold; background: #fff;
        }

        .tm-color-strip { width: 100%; height: 100%; }

        .tm-preset-content { padding: 10px 0; cursor: pointer; }
        .tm-preset-title-text { font-weight: bold; font-size: 0.95rem; margin-bottom: 4px; color: #222; }
        .tm-preset-body-text { font-size: 0.85rem; color: #555; line-height: 1.3; white-space: pre-wrap; }

        /* Actions Container - רווח אחיד לאייקונים */
        .tm-preset-actions {
            display: flex; align-items: center; justify-content: center;
            border-right: 1px solid #eee; gap: 8px; background: #fafafa;
            padding: 0 5px;
        }
        .tm-action-btn {
            border: none; background: white; cursor: pointer; font-size: 0.9rem;
            width: 30px; height: 30px; border-radius: 50%; transition: all 0.2s;
            display: flex; align-items: center; justify-content: center;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1); border: 1px solid #eee;
            flex-shrink: 0; /* מונע כיווץ */
        }
        .tm-btn-edit:hover { background: #333; color: white; }
        .tm-btn-delete { color: #e74c3c; }
        .tm-btn-delete:hover { background: #e74c3c; color: white; }
        .tm-btn-send { color: #25D366; font-size: 1.2rem; width: 36px; height: 36px; }
        .tm-btn-send:hover { background: #25D366; color: white; }

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
    // 4. לוגיקה ראשית
    // ==========================================

    function injectButton() {
        const phoneRows = document.querySelectorAll('[data-name="destination_phone"]:not(.tm-presets-injected)');
        phoneRows.forEach(row => {
            row.classList.add('tm-presets-injected');
            const targetCol = row.querySelector('.col-xxl-7, .col-6:last-child');
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
        });
    }

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
        return { phone, name: firstName };
    }

    // ==========================================
    // 5. בניית המודל (Popup)
    // ==========================================

    let saveButtonEl = null;

    function updateSaveButtonState() {
        const footer = document.querySelector('.tm-modal-footer');

        // 1. ניהול נראות הפוטר לפי מצב נעילה
        if (footer) {
            if (isLocked) {
                footer.classList.add('tm-hidden');
            } else {
                footer.classList.remove('tm-hidden');
            }
        }

        // 2. ניהול מצב הכפתור (פעיל/אפור)
        if (saveButtonEl) {
            if (hasUnsavedChanges) {
                saveButtonEl.disabled = false;
                saveButtonEl.title = "שמור שינויים";
            } else {
                saveButtonEl.disabled = true;
                saveButtonEl.title = "אין שינויים לשמירה";
            }
        }
    }

    function openModal(clientData) {
        const existing = document.querySelector('.tm-modal-overlay');
        if (existing) existing.remove();

        hasUnsavedChanges = false;
        isLocked = true; // איפוס לנעול תמיד בפתיחה

        const overlay = document.createElement('div');
        overlay.className = 'tm-modal-overlay';
        overlay.onclick = (e) => { if(e.target === overlay) overlay.remove(); };

        const content = document.createElement('div');
        content.className = 'tm-modal-content';

        // Header
        const header = document.createElement('div');
        header.className = 'tm-modal-header';
        header.innerHTML = `
            <div class="tm-header-right">
                <div class="tm-modal-title"><i class="fa-brands fa-whatsapp" style="color:#25D366"></i> הודעות עבור: ${clientData.name}</div>
            </div>
            <div class="tm-header-left">
                <button class="tm-icon-btn tm-add-btn" title="הוסף הודעה חדשה"><i class="fa-solid fa-plus"></i></button>
                <button class="tm-icon-btn tm-lock-btn ${isLocked ? 'locked' : 'unlocked'}" title="${isLocked ? 'לחץ לביטול נעילה' : 'לחץ לנעילה'}">
                    <i class="fa-solid ${isLocked ? 'fa-lock' : 'fa-lock-open'}"></i>
                </button>
                <button class="tm-icon-btn tm-close-btn" title="סגור">&times;</button>
            </div>
        `;

        // Footer (מוסתר בהתחלה ע"י class)
        const footer = document.createElement('div');
        footer.className = `tm-modal-footer ${isLocked ? 'tm-hidden' : ''}`;
        footer.innerHTML = `<button class="tm-main-save-btn" disabled>שמור שינויים</button>`;
        saveButtonEl = footer.querySelector('.tm-main-save-btn');

        // Body
        const body = document.createElement('div');
        body.className = 'tm-modal-body';

        header.querySelector('.tm-close-btn').onclick = () => overlay.remove();

        const lockBtn = header.querySelector('.tm-lock-btn');
        lockBtn.onclick = () => {
            isLocked = !isLocked;
            lockBtn.className = `tm-icon-btn tm-lock-btn ${isLocked ? 'locked' : 'unlocked'}`;
            lockBtn.title = isLocked ? 'לחץ לביטול נעילה' : 'לחץ לנעילה';
            lockBtn.innerHTML = `<i class="fa-solid ${isLocked ? 'fa-lock' : 'fa-lock-open'}"></i>`;

            updateSaveButtonState();
            renderList(body, clientData);
        };

        header.querySelector('.tm-add-btn').onclick = () => {
            if(isLocked) {
                alert("אנא בטל נעילה כדי להוסיף הודעות.");
                return;
            }
            currentPresets.push({
                title: "הודעה חדשה",
                color: "#eeeeee",
                text: "תוכן ההודעה כאן..."
            });
            checkForChanges();
            renderList(body, clientData);
            setTimeout(() => body.scrollTop = body.scrollHeight, 100);
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

        renderList(body, clientData);

        content.appendChild(header);
        content.appendChild(body);
        content.appendChild(footer);
        overlay.appendChild(content);
        document.body.appendChild(overlay);

        // וידוא מצב כפתור שמירה אחרי הוספה ל-DOM
        updateSaveButtonState();
    }

    function renderList(container, clientData) {
        container.innerHTML = '';
        container.className = `tm-modal-body ${isLocked ? 'tm-is-locked' : ''}`;

        currentPresets.forEach((preset, index) => {
            const row = document.createElement('div');
            row.className = 'tm-preset-row';
            if (!isLocked) row.draggable = true;
            row.dataset.index = index;

            const previewText = preset.text.replace(/{name}/g, clientData.name);

            row.innerHTML = `
                <div class="tm-drag-handle" title="${isLocked ? 'נעול' : 'גרור לשינוי סדר'}"><i class="fa-solid fa-grip-vertical"></i></div>
                <div class="tm-row-number">${index + 1}</div>
                <div class="tm-color-strip" style="background-color: ${preset.color};"></div>
                <div class="tm-preset-content" title="לחץ לשליחה">
                    <div class="tm-preset-title-text">${preset.title}</div>
                    <div class="tm-preset-body-text">${previewText}</div>
                </div>
                <div class="tm-preset-actions">
                    <button class="tm-action-btn tm-btn-send" title="שלח בוואטסאפ"><i class="fa-brands fa-whatsapp"></i></button>
                    <button class="tm-action-btn tm-btn-edit" title="ערוך"><i class="fa-solid fa-pencil"></i></button>
                    <button class="tm-action-btn tm-btn-delete" title="מחק"><i class="fa-solid fa-trash-can"></i></button>
                </div>
            `;

            row.querySelector('.tm-preset-content').onclick = () => sendWhatsapp(preset.text, clientData);
            row.querySelector('.tm-btn-send').onclick = (e) => {
                e.stopPropagation();
                sendWhatsapp(preset.text, clientData);
            };

            row.querySelector('.tm-btn-edit').onclick = (e) => {
                e.stopPropagation();
                if(isLocked) return;
                enableEditMode(row, index, clientData, container);
            };

            row.querySelector('.tm-btn-delete').onclick = (e) => {
                e.stopPropagation();
                if(isLocked) return;
                if(confirm("האם למחוק את ההודעה: " + preset.title + "?")) {
                    currentPresets.splice(index, 1);
                    checkForChanges();
                    renderList(container, clientData);
                }
            };

            if (!isLocked) {
                addDragEvents(row, container, clientData);
            }
            container.appendChild(row);
        });
    }

    // ==========================================
    // 6. פונקציונליות עריכה
    // ==========================================

    function enableEditMode(rowElement, index, clientData, container) {
        const preset = currentPresets[index];
        const editDiv = document.createElement('div');
        editDiv.className = 'tm-preset-row tm-edit-mode';

        editDiv.innerHTML = `
            <div>
                <label class="tm-edit-label">כותרת:</label>
                <input type="text" class="tm-input" id="edit-title" value="${preset.title}">

                <label class="tm-edit-label">צבע רקע:</label>
                <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
                    <input type="color" id="edit-color-picker" value="${preset.color}" style="height:35px; width:50px; cursor:pointer;">
                    <input type="text" class="tm-input" id="edit-color-text" value="${preset.color}" style="margin:0; width:120px;">
                </div>

                <label class="tm-edit-label">תוכן ההודעה (השתמש ב-{name} עבור שם הלקוח):</label>
                <textarea class="tm-textarea" id="edit-text">${preset.text}</textarea>

                <div class="tm-edit-controls">
                    <button class="tm-cancel-btn">ביטול</button>
                    <button class="tm-save-btn">אשר זמנית</button>
                </div>
            </div>
        `;

        const colorPicker = editDiv.querySelector('#edit-color-picker');
        const colorText = editDiv.querySelector('#edit-color-text');
        colorPicker.oninput = () => colorText.value = colorPicker.value;
        colorText.oninput = () => colorPicker.value = colorText.value;

        // אישור זמני (לזיכרון, לא לקובץ)
        editDiv.querySelector('.tm-save-btn').onclick = () => {
            currentPresets[index] = {
                title: editDiv.querySelector('#edit-title').value,
                color: editDiv.querySelector('#edit-color-text').value,
                text: editDiv.querySelector('#edit-text').value
            };
            checkForChanges();
            renderList(container, clientData);
        };

        editDiv.querySelector('.tm-cancel-btn').onclick = () => {
            renderList(container, clientData);
        };

        rowElement.replaceWith(editDiv);
    }

    // ==========================================
    // 7. פונקציונליות גרירה (Drag & Drop)
    // ==========================================

    function addDragEvents(row, container, clientData) {
        row.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', row.dataset.index);
            row.classList.add('dragging');
        });

        row.addEventListener('dragend', () => {
            row.classList.remove('dragging');
        });

        row.addEventListener('dragover', (e) => {
            e.preventDefault();
            const draggingRow = container.querySelector('.dragging');
            if (draggingRow && draggingRow !== row) {
                const bounding = row.getBoundingClientRect();
                const offset = e.clientY - bounding.top + bounding.height / 2;
                if (offset > bounding.height) {
                    row.after(draggingRow);
                } else {
                    row.before(draggingRow);
                }
            }
        });

        row.addEventListener('drop', (e) => {
            e.preventDefault();
            const newOrder = [];
            container.querySelectorAll('.tm-preset-row').forEach(r => {
                if (r.dataset.index !== undefined) {
                    newOrder.push(currentPresets[r.dataset.index]);
                }
            });
            currentPresets = newOrder;
            checkForChanges();
            renderList(container, clientData);
        });
    }

    // ==========================================
    // 8. שיגור
    // ==========================================

    function sendWhatsapp(textTemplate, clientData) {
        const finalText = textTemplate.replace(/{name}/g, clientData.name);
        const url = `https://wa.me/${clientData.phone}?text=${encodeURIComponent(finalText)}`;
        window.open(url, 'whatsapp_window');
    }

    setInterval(injectButton, 1000);

})();