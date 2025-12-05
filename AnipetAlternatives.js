// ==UserScript==
// @name         LionWheel to Anipet Alternatives
// @namespace    http://tampermonkey.net/
// @version      4.5
// @description  Add Anipet popup with alternative products search results in LionWheel
// @author       Adam Lee
// @icon         https://anipetapp.netlify.app/pixel.svg
// @match        https://members.lionwheel.com/*
// @updateURL    https://raw.githubusercontent.com/AdamLee9186/anipet/main/AnipetAlternatives.js
// @downloadURL  https://raw.githubusercontent.com/AdamLee9186/anipet/main/AnipetAlternatives.js
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(function() {
    'use strict';

    const ANIPET_APP_URL = 'https://anipetapp.netlify.app';
    const ANIPET_API_URL = 'https://anipetapp.netlify.app'; // Will try /search endpoint
    const BUTTON_CLASS = 'anipet-alternatives-btn';
    const ICON_URL = 'https://anipetapp.netlify.app/pixel.svg';
    const DEBOUNCE_DELAY = 100;
    const RETRY_INTERVAL = 1000;
    const RECHECK_INTERVAL = 5000;
    const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

    // Get settings from GM_getValue or use defaults
    let MAX_RESULTS = typeof GM_getValue !== 'undefined' ? GM_getValue('max_results', 10) : 10;
    let DEBUG = typeof GM_getValue !== 'undefined' ? GM_getValue('debug_mode', false) : false;

    // Register menu commands
    if (typeof GM_registerMenuCommand !== 'undefined') {
        GM_registerMenuCommand(`הגדר מספר תוצאות (נוכחי: ${MAX_RESULTS})`, () => {
            const input = prompt('הכנס את מספר התוצאות המקסימלי להצגה (ברירת מחדל: 10):', MAX_RESULTS);
            if (input !== null) {
                const num = parseInt(input, 10);
                if (!isNaN(num) && num > 0) {
                    MAX_RESULTS = num;
                    GM_setValue('max_results', num);
                    alert(`מספר התוצאות הוגדר ל-${num}. רענן את הדף כדי שהשינוי ייכנס לתוקף.`);
                } else {
                    alert('אנא הכנס מספר חיובי תקין.');
                }
            }
        });

        GM_registerMenuCommand(`מצב DEBUG (נוכחי: ${DEBUG ? 'פעיל' : 'כבוי'})`, () => {
            DEBUG = !DEBUG;
            GM_setValue('debug_mode', DEBUG);
            alert(`מצב DEBUG ${DEBUG ? 'הופעל' : 'כובה'}. רענן את הדף כדי שהשינוי ייכנס לתוקף.`);
        });

        GM_registerMenuCommand('🗑️ נקה מטמון חיפושים', () => {
            try {
                const cacheSize = searchCache.size;
                searchCache.clear();
                alert(`מטמון החיפושים נוקה (${cacheSize} תוצאות). החיפושים הבאים יטענו מחדש מהשרת.`);
            } catch (error) {
                console.error('Error clearing search cache:', error);
                alert('שגיאה בניקוי מטמון החיפושים.');
            }
        });
    }

    // Performance tracking
    let isInitialized = false;
    let processedTables = new Set();
    let errorCount = 0;
    const MAX_ERRORS = 5;

    // Cache for search results
    const searchCache = new Map();

    // Products data cache (for client-side search fallback)
    let productsData = null;
    let productsDataLoaded = false;

    function debounce(func, wait) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    function getFullSizeImageUrl(thumbnailUrl) {
        try {
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
                // Remove size parameters like -100x100 from the end of the filename
                return thumbnailUrl.replace(/-\d+x\d+(\.[a-zA-Z0-9]+(?:[?#].*)?)$/, '$1').replace(/-\d+x\d+$/, '');
            }
            return thumbnailUrl;
        } catch (e) {
            console.warn(`[AnipetAlternatives] ⚠️ Error processing thumbnail URL, returning original:`, thumbnailUrl, e);
            return thumbnailUrl;
        }
    }

    // New function for optimized image URLs based on screen size (provided by user)
    function getOptimizedImageUrl(originalUrl, targetWidth = null) {
        try {
            if (!originalUrl || typeof originalUrl !== 'string') return originalUrl;

            if (!targetWidth) { targetWidth = Math.min(window.innerWidth, 1200); }
            const __BUCKETS = [320, 480, 640, 960, 1200];
            for (let i = 0; i < __BUCKETS.length; i++) {
                if (targetWidth <= __BUCKETS[i]) { targetWidth = __BUCKETS[i]; break; }
                if (i === __BUCKETS.length - 1) targetWidth = __BUCKETS[i];
            }

            if (originalUrl.includes('cdn.modulus.co.il')) { return `${originalUrl.split('?')[0]}?w=${targetWidth}&h=${Math.round(targetWidth * 0.75)}&fit=crop`; }
            if (originalUrl.includes('www.gag-lachayot.co.il')) { const baseUrl = originalUrl.replace(/-\d+x\d+(\.[a-zA-Z0-9]+(?:[?#].*)?)$/, '$1').replace(/-\d+x\d+$/, ''); return `${baseUrl}?w=${targetWidth}`; }
            if (originalUrl.includes('www.all4pet.co.il')) { const baseUrl = originalUrl.replace(/_small(\.[a-zA-Z0-9]+(?:[?#].*)?)$/, '$1').replace(/_small$/, ''); return `${baseUrl}?w=${targetWidth}`; }
            if (originalUrl.includes('d3m9l0v76dty0.cloudfront.net')) { return originalUrl; }
            if (originalUrl.includes('just4pet.co.il')) { const parts = originalUrl.split('/'); const filenameWithQuery = parts.pop(); const filenameParts = filenameWithQuery.split('?'); const filename = filenameParts[0]; const query = filenameParts.length > 1 ? `&${filenameParts[1]}` : ''; if (filename.startsWith('tn_')) { const newFilename = filename.substring(3); return `${parts.join('/')}/${newFilename}?w=${targetWidth}${query}`; } }
            if (originalUrl.includes('speedog.co.il')) { const baseUrl = originalUrl.replace(/-\d+x\d+(\.[a-zA-Z0-9]+(?:[?#].*)?)$/, '$1').replace(/-\d+x\d+$/, ''); const separator = baseUrl.includes('?') ? '&' : '?'; return `${baseUrl}${separator}w=${targetWidth}`; }

            const separator = originalUrl.includes('?') ? '&' : '?';
            return `${originalUrl}${separator}w=${targetWidth}`;

        } catch (e) {
            console.warn(`[AnipetAlternatives] ⚠️ Error optimizing image URL, returning original:`, originalUrl, e);
            return originalUrl;
        }
    }

    function createAlternativesButton(productName, searchTerm, barcode = null) {
        try {
            if (!searchTerm || searchTerm.trim() === '') {
                return null;
            }

            // Store barcode in button data attribute for later use
            const buttonBarcode = barcode || (searchTerm && /^\d+$/.test(searchTerm.trim()) ? searchTerm.trim() : null);

        const button = document.createElement('button');
            button.className = BUTTON_CLASS;
            button.type = 'button';
            button.title = 'חפש תחליפים';
            button.setAttribute('aria-label', `חפש תחליפים ב-Anipet עבור ${productName}`);
            button.style.cssText = `
                background: none;
                border: none;
                padding: 0;
                margin: 0;
                cursor: pointer;
                vertical-align: middle;
                line-height: 1;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 28px;
                height: 28px;
                transition: all 0.2s ease-in-out;
                transform: scale(1);
            `;

            // Use inline SVG instead of external image
            const svgIcon = `
                <svg width="28" height="28" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg" style="display: block !important; visibility: visible !important; opacity: 1 !important; width: 28px !important; height: 28px !important; vertical-align: middle; transition: all 0.2s ease-in-out;">
                    <defs>
                        <style>.c{fill:#fbf0dc;}.d{fill:#f47b44;}.e{fill:#231f20;}.f{fill:#f79027;}</style>
                    </defs>
                    <polygon class="f" points="474 704.7 474 754.6 395.9 754.6 395.9 732 368.4 732 368.4 755.8 342.5 755.8 342.5 704.7 369.2 704.7 369.2 626.4 395.9 626.4 420.5 626.4 420.5 654.2 446.2 654.2 446.2 680 474 680 474 704.7"/>
                    <polygon class="f" points="683.1 704.7 683.1 755.8 657.2 755.8 657.2 732 631.1 732 631.1 809.3 630.9 809.3 630.9 754.6 552.6 754.6 552.6 704.7 552.6 680 578.8 680 578.8 654.2 604.4 654.2 604.4 626.4 629.7 626.4 656.4 626.4 656.4 704.7 683.1 704.7"/>
                    <polygon class="f" points="711.7 466.3 711.7 546.7 683.1 546.7 683.1 573.5 657.7 573.5 657.7 546.6 631.1 546.6 631.1 520.8 604.3 520.8 578.8 520.8 578.8 494 604.9 494 604.9 439.4 578.8 439.4 578.8 494 553.5 494 551.9 494 473.7 494 472.1 494 446.2 494 446.2 439.4 420.7 439.4 420.7 494 446.2 494 446.2 520.8 420.6 520.8 395.9 520.8 395.9 546.6 367.3 546.6 367.3 573.3 342.5 573.3 342.5 546.7 313.9 546.7 313.9 466.3 342.5 466.3 342.5 393 313.9 393 313.9 235.5 367.3 235.5 367.3 262.3 395.9 262.3 395.9 289 421.6 289 421.6 342.8 422.4 342.8 448.3 342.8 512.8 342.8 577.3 342.8 603.2 342.8 604 342.8 604 289 630.8 289 630.8 262.3 657.5 262.3 657.5 235.5 711.7 235.5 711.7 393 683.1 393 683.1 466.3 711.7 466.3"/>
                    <rect class="e" x="711.7" y="466.3" width="26.7" height="80.4"/>
                    <rect class="e" x="711.7" y="235.5" width="26.7" height="157.4"/>
                    <polygon class="e" points="711.7 677.1 711.7 782.6 683.8 782.6 683.8 809.3 657.2 809.3 656.4 809.3 631.4 809.3 631.1 809.3 631.1 732 657.2 732 657.2 755.8 683.1 755.8 683.1 704.7 656.4 704.7 656.4 626.4 629.7 626.4 629.7 600.4 657.7 600.4 657.7 573.5 683.1 573.5 683.1 677.1 711.7 677.1"/>
                    <rect class="e" x="683.1" y="546.7" width="28.6" height="26.7"/>
                    <rect class="e" x="683.1" y="393" width="28.6" height="73.3"/>
                    <polygon class="e" points="711.7 208.8 711.7 235.5 657.5 235.5 657.2 235.5 657.2 208.8 711.7 208.8"/>
                    <polygon class="c" points="657.7 573.5 657.7 600.4 629.7 600.4 629.7 626.4 604.4 626.4 604.4 654.2 578.8 654.2 578.8 680 552.6 680 552.6 704.7 525.4 704.7 525.2 704.7 525.2 782.4 498.5 782.4 498.5 704.7 474 704.7 474 680 446.2 680 446.2 654.2 420.5 654.2 420.5 626.4 395.9 626.4 395.9 600.4 367.3 600.4 367.3 573.3 367.3 546.6 395.9 546.6 395.9 520.8 420.6 520.8 446.2 520.8 446.2 494 472.1 494 472.1 520.7 473.7 520.7 498.5 520.7 498.5 546.7 447.5 546.7 447.5 573.5 472.4 573.5 472.4 600.4 473.7 600.4 498.5 600.4 498.5 626.4 525.2 626.4 525.2 600.4 551.9 600.4 553.2 600.4 553.2 573.5 578.1 573.5 578.1 546.7 526.5 546.7 526.5 520.7 551.9 520.7 553.5 520.7 553.5 494 578.8 494 578.8 520.8 604.3 520.8 631.1 520.8 631.1 546.6 657.7 546.6 657.7 573.5"/>
                    <polygon class="e" points="657.5 235.5 657.5 262.3 630.8 262.3 630.8 235.5 657.2 235.5 657.5 235.5"/>
                    <polygon class="e" points="631.4 809.3 631.4 835.6 552.6 835.6 552.6 809.3 630.9 809.3 631.1 809.3 631.4 809.3"/>
                    <rect class="c" x="552.6" y="754.6" width="78.4" height="54.6"/>
                    <rect class="e" x="604" y="262.3" width="26.7" height="26.7"/>
                    <rect class="e" x="578.8" y="439.4" width="26.1" height="54.6"/>
                    <polygon class="e" points="604 289 604 342.8 603.2 342.8 577.3 342.8 512.8 342.8 448.3 342.8 422.4 342.8 421.6 342.8 421.6 289 448.3 289 448.3 316.1 512.8 316.1 577.3 316.1 577.3 289 604 289"/>
                    <polygon class="e" points="578.1 546.7 578.1 573.5 553.2 573.5 553.2 600.4 551.9 600.4 525.2 600.4 525.2 573.5 525.2 573.2 498.5 573.2 498.5 573.5 498.5 600.4 473.7 600.4 472.4 600.4 472.4 573.5 447.5 573.5 447.5 546.7 498.5 546.7 498.5 520.7 473.7 520.7 472.1 520.7 472.1 494 473.7 494 551.9 494 553.5 494 553.5 520.7 551.9 520.7 526.5 520.7 526.5 546.7 578.1 546.7"/>
                    <polygon class="e" points="552.6 754.6 552.6 809.3 527.1 809.3 525.2 809.3 498.5 809.3 474 809.3 474 754.6 474 704.7 498.5 704.7 498.5 782.4 498.5 782.6 525.2 782.6 525.2 782.4 525.4 782.4 525.4 704.7 552.6 704.7 552.6 754.6"/>
                    <rect class="e" x="525.2" y="704.7" width=".2" height="77.7"/>
                    <rect class="e" x="498.5" y="600.4" width="26.7" height="26"/>
                    <rect class="d" x="498.5" y="573.5" width="26.7" height="26.9"/>
                    <rect class="e" x="498.5" y="573.2" width="26.7" height=".2"/>
                    <rect class="e" x="395.9" y="809.3" width="78.1" height="26.4"/>
                    <rect class="c" x="395.9" y="754.6" width="78.1" height="54.6"/>
                    <rect class="e" x="420.7" y="439.4" width="25.5" height="54.6"/>
                    <rect class="e" x="395.9" y="262.3" width="25.6" height="26.7"/>
                    <polygon class="e" points="395.9 754.6 395.9 809.3 369.2 809.3 368.4 809.3 341.8 809.3 341.8 782.6 313.9 782.6 313.9 677.1 342.5 677.1 342.5 573.5 342.5 573.3 367.3 573.3 367.3 600.4 395.9 600.4 395.9 626.4 369.2 626.4 369.2 704.7 342.5 704.7 342.5 755.8 368.4 755.8 368.4 732 395.9 732 395.9 754.6"/>
                    <rect class="e" x="367.3" y="235.5" width="28.6" height="26.7"/>
                    <rect class="e" x="313.9" y="208.8" width="53.4" height="26.7"/>
                    <polygon class="e" points="342.5 573.3 342.5 573.5 313.9 573.5 313.9 546.7 342.5 546.7 342.5 573.3"/>
                    <rect class="e" x="313.9" y="393" width="28.6" height="73.3"/>
                    <rect class="e" x="287.1" y="466.3" width="26.7" height="80.4"/>
                    <rect class="e" x="287.1" y="235.5" width="26.7" height="157.4"/>
                </svg>
            `;

            button.innerHTML = svgIcon;

            // Store barcode in data attribute
            if (buttonBarcode) {
                button.setAttribute('data-barcode', buttonBarcode);
            }

            // Enhanced hover animations
        button.onmouseover = function() {
                button.style.transform = 'scale(1.1)';
                button.style.filter = 'drop-shadow(0 0 4px #3182ce) brightness(1.2)';
                const svg = button.querySelector('svg');
                if (svg) {
                    svg.style.filter = 'brightness(1.3)';
                }
        };

        button.onmouseout = function() {
                button.style.transform = 'scale(1)';
                button.style.filter = '';
                const svg = button.querySelector('svg');
                if (svg) {
                    svg.style.filter = '';
                }
            };

            // Create button with enhanced event handling
            button.addEventListener('mousedown', function(event) {
                // Stop all event propagation immediately
                event.stopImmediatePropagation();
                event.stopPropagation();
                event.preventDefault();

                // Show popup with search results instead of opening new tab
                // Pass productName, searchTerm, barcode, and LionWheel price (if available)
                const buttonBarcode = button.getAttribute('data-barcode');
                const lionwheelPriceAttr = button.getAttribute('data-lionwheel-price');
                const lionwheelPrice = lionwheelPriceAttr ? parseFloat(lionwheelPriceAttr) : null;
                
                showSearchPopup(productName, searchTerm, buttonBarcode, lionwheelPrice);

                return false;
            }, true); // Use capture phase to intercept early

            // Also prevent click events
            button.addEventListener('click', function(event) {
                event.stopImmediatePropagation();
                event.stopPropagation();
                event.preventDefault();
                return false;
            }, true);

            // Prevent any default button behavior
            button.addEventListener('mouseup', function(event) {
                event.stopImmediatePropagation();
                event.stopPropagation();
                event.preventDefault();
                return false;
            }, true);

            return button;
        } catch (error) {
            console.error('Error creating button:', error);
            errorCount++;
            return null;
        }
    }

    function isProductTable(table) {
        // Check if this is a product table by looking for product-specific headers
        const thead = table.querySelector('thead tr');
        if (!thead) return false;

        const headers = Array.from(thead.querySelectorAll('th')).map(th => th.textContent.trim());

        // Product tables should have a barcode column ("מק״ט" or "ברקוד") and a "שם" column
        // Note: toolbox.js may rename "מק״ט" to "ברקוד", so we need to check for both
        const hasBarcodeHeader = headers.some(h => h === 'מק״ט' || h === 'ברקוד' || h.trim() === 'ברקוד' || h.trim() === 'מק״ט');
        const hasNameHeader = headers.includes('שם');

        // Message tables have different headers like "תאריך", "תוכן", "טלפון"
        const hasMessageHeaders = headers.includes('תאריך') || headers.includes('תוכן') || headers.includes('טלפון');

        return hasBarcodeHeader && hasNameHeader && !hasMessageHeaders;
    }

    function findCellsByHeader(row) {
        try {
            const table = row.closest('table');
            const thead = table.querySelector('thead tr');
            let barcodeCell, nameCell, priceCell;

            // 1. Try to find cells by data-label (most reliable)
            barcodeCell = row.querySelector('td[data-label="ברקוד"], td[data-label="מק״ט"]');
            nameCell = row.querySelector('td[data-label="שם"]');
            priceCell = row.querySelector('td[data-label="מחיר ליחידה"], td[data-label="מחיר"]');

            // 2. If not found, try to find by header content (if header exists)
            if (thead && (!barcodeCell || !nameCell || !priceCell)) {
                const headers = Array.from(thead.querySelectorAll('th')).map(th => th.textContent.trim());
                
                if (!barcodeCell) {
                    const barcodeIndex = headers.findIndex(header => header === 'מק״ט' || header === 'ברקוד');
                    if (barcodeIndex !== -1) barcodeCell = row.cells[barcodeIndex];
                }
                if (!nameCell) {
                    const nameIndex = headers.findIndex(header => header === 'שם');
                    if (nameIndex !== -1) nameCell = row.cells[nameIndex];
                }
                if (!priceCell) {
                    const priceIndex = headers.findIndex(header => header.includes('מחיר'));
                    if (priceIndex !== -1) priceCell = row.cells[priceIndex];
                }
            }

            // 3. Fallback: Try to find based on cell content or specific attributes
            if (!barcodeCell) {
                // Barcode often has 'data-original-sku' attribute or 'text-nowrap' class
                barcodeCell = row.querySelector('td[data-original-sku]') || 
                              row.querySelector('td.text-nowrap:not([data-label])');
            }

            if (!nameCell) {
                // Name often contains a link to the product
                nameCell = row.querySelector('td:has(a[href*="/product/"])') ||
                           row.querySelector('td:has(.order-item-name)');
            }
            
            if (!priceCell) {
                // Price usually looks like a number, possibly with 2 decimal places
                const potentialPriceCells = Array.from(row.cells).filter(cell => {
                    const text = cell.textContent.trim();
                    // Regex for a number, optionally with 2 decimal places (e.g., "315.00" or "45")
                    return /^\d+(\.\d{2})?$/.test(text) && !cell.hasAttribute('data-original-sku');
                });
                // If multiple columns match, the price is usually further to the right than barcode/name
                if (potentialPriceCells.length > 0) {
                    priceCell = potentialPriceCells[potentialPriceCells.length - 1];
                }
            }

            // 4. Ultimate Fallback: Positional (least reliable, used as last resort)
            if (!barcodeCell) barcodeCell = row.querySelector('td:nth-child(2)');
            if (!nameCell) nameCell = row.querySelector('td:nth-child(4)') || row.querySelector('td:nth-child(3)');
            // Price is typically around the 6th or 7th column
            if (!priceCell) priceCell = row.querySelector('td:nth-child(6)') || row.querySelector('td:nth-child(7)');

            return { nameCell, barcodeCell, priceCell };
        } catch (error) {
            if (DEBUG) console.error('Error finding cells by header:', error);
            // Return whatever we found, or fallback to positional assumptions
            return {
                nameCell: row.querySelector('td:nth-child(4)'),
                barcodeCell: row.querySelector('td:nth-child(2)'),
                priceCell: row.querySelector('td:nth-child(6)')
            };
        }
    }

    function addAniPetIconToRows() {
        try {
            // Check error limit
            if (errorCount >= MAX_ERRORS) {
                console.warn('Too many errors, stopping script execution');
                return;
            }

            // Find all tables and filter for product tables only
            const allTables = document.querySelectorAll('table.table-hover');
            if (!allTables || allTables.length === 0) {
                return;
            }

            const productTables = Array.from(allTables).filter(table => {
                // Skip already processed tables
                if (processedTables.has(table)) {
                    return false;
                }
                return isProductTable(table);
            });

            if (productTables.length === 0) {
                return;
            }

            // Helper: after we inject the Anipet column, make sure toolbox.js hideable columns
            // (for example the "משקל" / weight column) still have the tm-hideable-column class
            // on all data cells, not only on the header. Otherwise toolbox.js hides only the
            // <th> but leaves the <td> content visible.
            function reapplyHideableColumns(table) {
                try {
                    const thead = table.querySelector('thead tr');
                    if (!thead) {
                        return;
                    }

                    const headerCells = Array.from(thead.querySelectorAll('th'));
                    if (!headerCells.length) {
                        return;
                    }

                    headerCells.forEach((th, index) => {
                        // toolbox.js marks hideable columns on the header using this class
                        if (!th.classList.contains('tm-hideable-column')) {
                            return;
                        }

                        // Get the header text to find matching data cells
                        const headerText = th.textContent.trim();

                        // Find all rows in tbody
                        const rows = table.querySelectorAll('tbody tr');
                        rows.forEach(row => {
                            // Try to find cell by data-label first (most reliable)
                            let cell = row.querySelector(`td[data-label="${headerText}"]`);

                            // If not found by data-label, try by column index
                            // Note: index is 0-based, but nth-child is 1-based
                            if (!cell) {
                                const columnIndex = index + 1;
                                cell = row.querySelector(`td:nth-child(${columnIndex})`);
                            }

                            // If found and doesn't have the class, add it
                            if (cell && !cell.classList.contains('tm-hideable-column')) {
                                cell.classList.add('tm-hideable-column');
                            }
                        });
                    });
                } catch (e) {
                    console.warn('Anipet: failed to reapply hideable column classes', e);
                }
            }

            productTables.forEach(table => {
                try {
                    const productRows = table.querySelectorAll('tbody tr');

                    if (productRows.length === 0) return;

                    // Add header to the third column (after barcode column) if it doesn't exist
                    const thead = table.querySelector('thead tr');
                    if (thead) {
                        // Check if Anipet header already exists
                        const existingAnipetHeader = thead.querySelector('.anipet-header');
                        if (!existingAnipetHeader) {
                            // Find the barcode header (second column)
                            const barcodeHeader = thead.querySelector('th:nth-child(2)');
                            if (barcodeHeader) {
                                // Create new Anipet header (empty, no text)
                                const anipetHeader = document.createElement('th');
                                anipetHeader.className = 'anipet-header';
                                anipetHeader.style.cssText = `
                                    width: 30px;
                                    min-width: 30px;
                                    max-width: 30px;
                                    text-align: center;
                                    padding: 8px 4px;
                                    background-color: #ebedf3 !important;
                                `;

                                // Insert after barcode header
                                barcodeHeader.parentNode.insertBefore(anipetHeader, barcodeHeader.nextSibling);
                            }
                        }
                    }

                    let added = 0;

                    // Helper function to add icon to a single row
                    function addIconToRow(row) {
                        try {
                            const { nameCell, barcodeCell, priceCell } = findCellsByHeader(row);

                            // ננסה למצוא שם מוצר בעמודה עם header "שם"
                            let productName = '';
                            if (nameCell) {
                                productName = nameCell.textContent.trim();
                            }

                            // ננסה למצוא את המחיר בעמודת המחיר
                            let lionwheelPrice = null;
                            if (priceCell) {
                                const priceText = priceCell.textContent.trim();
                                // נסה לחלץ מספר מהטקסט (למשל "315.00")
                                const priceMatch = priceText.match(/(\d+(\.\d{2})?)/);
                                if (priceMatch) {
                                    lionwheelPrice = parseFloat(priceMatch[1]);
                                }
                            }

                            // אם לא מצאנו בעמודה עם header "שם", ננסה בעמודה השלישית
                            if (!productName) {
                                const thirdColumnCell = row.querySelector('td:nth-child(3)');
                                if (thirdColumnCell) {
                                    productName = thirdColumnCell.textContent.trim();
                                }
                            }

                            let barcode = '';
                            if (barcodeCell) {
                                barcode = barcodeCell.textContent.trim();
                            }

                            // Check if Anipet cell already exists
                            const existingAnipetCell = row.querySelector('.anipet-cell[data-anipet-icon="true"]');
                            if (!existingAnipetCell) {
                                // Create new Anipet cell
                                const anipetCell = document.createElement('td');
                                anipetCell.className = 'anipet-cell';
                                anipetCell.setAttribute('data-anipet-icon', 'true');
                                anipetCell.style.cssText = `
                                    width: 30px !important;
                                    min-width: 30px !important;
                                    max-width: 30px !important;
                                    text-align: center !important;
                                    vertical-align: middle !important;
                                    padding: 4px !important;
                                    border-top: 1px solid #dee2e6 !important;
                                    display: table-cell !important;
                                    visibility: visible !important;
                                    opacity: 1 !important;
                                `;

                                // אם יש ברקוד, צור כפתור עם ברקוד. אם אין ברקוד אבל יש שם מוצר, צור כפתור עם שם המוצר
                                if (barcode) {
                                    const button = createAlternativesButton(productName, barcode, barcode);
                                    if (button) {
                                        button.setAttribute('data-anipet-icon', 'true');
                                        // שמור את מחיר ה-LionWheel על הכפתור לשימוש עתידי בפופאפ
                                        if (lionwheelPrice !== null) {
                                            button.setAttribute('data-lionwheel-price', lionwheelPrice);
                                        }
                                        anipetCell.appendChild(button);
                                    }
                                } else if (productName) {
                                    const button = createAlternativesButton(productName, productName, null);
                                    if (button) {
                                        button.setAttribute('data-anipet-icon', 'true');
                                        // שמור את מחיר ה-LionWheel על הכפתור לשימוש עתידי בפופאפ
                                        if (lionwheelPrice !== null) {
                                            button.setAttribute('data-lionwheel-price', lionwheelPrice);
                                        }
                                        anipetCell.appendChild(button);
                                    }
                                }

                                // Insert after barcode cell
                                if (barcodeCell && barcodeCell.parentNode) {
                                    barcodeCell.parentNode.insertBefore(anipetCell, barcodeCell.nextSibling);
                                } else {
                                    // fallback: הוסף לסוף השורה
                                    row.appendChild(anipetCell);
                                }
                            }

                            // Mark the row as processed
                            row.setAttribute('data-anipet-processed', 'true');
                        } catch (error) {
                            console.error('Error adding icon to row:', error);
                        }
                    }

                    // Helper function to restore icon for a single row
                    function restoreIconForRow(row) {
                        try {
                            // Remove the processed flag temporarily to allow re-processing
                            row.removeAttribute('data-anipet-processed');
                            addIconToRow(row);
                        } catch (error) {
                            console.error('Error restoring icon for row:', error);
                        }
                    }

                    productRows.forEach((row, index) => {
                        try {
                            // Skip if already processed
                            if (row.getAttribute('data-anipet-processed') === 'true') {
                                // Check if icon still exists, if not restore it
                                const existingAnipetCell = row.querySelector('.anipet-cell[data-anipet-icon="true"]');
                                if (!existingAnipetCell) {
                                    // Icon was removed, restore it after a delay
                                    setTimeout(() => {
                                        restoreIconForRow(row);
                                    }, 200);
                                }
                                return;
                            }

                            // Check if toolbox.js has processed this row (data-image-processed)
                            // If not, wait a bit for toolbox.js to finish
                            const isToolboxProcessed = row.getAttribute('data-image-processed') === 'true';
                            if (!isToolboxProcessed) {
                                // Wait for toolbox.js to process the row
                                setTimeout(() => {
                                    addIconToRow(row);
                                    added++;
                                }, 300);
                                return;
                            }

                            // Toolbox.js has processed, add icon now
                            addIconToRow(row);
                            added++;

                        } catch (rowError) {
                            console.error('Error processing row:', rowError);
                            errorCount++;
                        }
                    });

                    // Mark table as processed
                    processedTables.add(table);

                    // After we insert the Anipet header/cell, re-sync hideable columns so that
                    // toolbox.js can still hide the weight ("משקל") and other hideable columns
                    // based on its CSS rule: body.tampermonkey-hide-columns-enabled .tm-hideable-column
                    reapplyHideableColumns(table);

                } catch (tableError) {
                    console.error('Error processing table:', tableError);
                    errorCount++;
                }
            });

        } catch (error) {
            console.error('Error in addAniPetIconToRows:', error);
            errorCount++;
        }
    }

    const debouncedAddButtons = debounce(addAniPetIconToRows, DEBOUNCE_DELAY);

    function observeAndAddButtons() {
        try {
            // Try to find the specific container that holds the tables
            // In LionWheel, this is typically a div with class 'card-body' inside a form
            const targetNode = document.querySelector('.card-body') || document.querySelector('form') || document.body;
            
            if (DEBUG) console.log('Starting MutationObserver on target:', targetNode);

            const observer = new MutationObserver(mutations => {
                let shouldAdd = false;
                let shouldRestore = false;

                mutations.forEach(mutation => {
                    if (mutation.type === 'childList') {
                        // Check if new rows were added
                        if (mutation.addedNodes.length > 0) {
                            mutation.addedNodes.forEach(node => {
                                if (node.nodeType === 1 && (node.tagName === 'TR' || node.querySelector && node.querySelector('tr'))) {
                                    shouldAdd = true;
                                }
                            });
                        }

                        // Check if anipet cells were removed
                        if (mutation.removedNodes.length > 0) {
                            mutation.removedNodes.forEach(node => {
                                if (node.nodeType === 1) {
                                    // Check if an anipet cell or button was removed
                                    if (node.classList && (node.classList.contains('anipet-cell') || node.classList.contains('anipet-alternatives-btn'))) {
                                        shouldRestore = true;
                                    }
                                    // Check if removed node contains anipet elements
                                    if (node.querySelector && (node.querySelector('.anipet-cell') || node.querySelector('.anipet-alternatives-btn'))) {
                                        shouldRestore = true;
                                    }
                                }
                            });
                        }
                    }

                    // Check if anipet cells were modified (innerHTML cleared)
                    if (mutation.type === 'childList' && mutation.target) {
                        const target = mutation.target;
                        if (target.classList && target.classList.contains('anipet-cell')) {
                            // If anipet cell was cleared, restore it
                            if (!target.querySelector('.anipet-alternatives-btn')) {
                                shouldRestore = true;
                            }
                        }
                    }
                });

                if (shouldAdd) {
                    debouncedAddButtons();
                }

                if (shouldRestore) {
                    // Use a small delay to avoid conflicts with toolbox.js
                    setTimeout(() => {
                        restoreMissingIcons();
                    }, 100);
                }
            });
            
            // Observe only the targeted container
            observer.observe(targetNode, { childList: true, subtree: true, attributes: false });
        } catch (error) {
            if (DEBUG) console.error('Error setting up observer:', error);
            errorCount++;
        }
    }

    // Function to restore missing anipet icons
    function restoreMissingIcons() {
        try {
            // Find all rows that should have anipet icons but don't
            const allTables = document.querySelectorAll('table.table-hover');
            allTables.forEach(table => {
                if (!isProductTable(table)) return;

                const rows = table.querySelectorAll('tbody tr');
                rows.forEach(row => {
                    // Skip if row is marked as processed but doesn't have anipet cell
                    const hasAnipetCell = row.querySelector('.anipet-cell[data-anipet-icon="true"]');
                    const isProcessed = row.getAttribute('data-anipet-processed') === 'true';

                    if (isProcessed && !hasAnipetCell) {
                        // Restore the icon for this row
                        const { nameCell, barcodeCell, priceCell } = findCellsByHeader(row);
                        let productName = '';
                        if (nameCell) {
                            productName = nameCell.textContent.trim();
                        }

                        let barcode = '';
                        if (barcodeCell) {
                            barcode = barcodeCell.textContent.trim();
                        }

                        let lionwheelPrice = null;
                        if (priceCell) {
                            const priceText = priceCell.textContent.trim();
                            const priceMatch = priceText.match(/(\d+(\.\d{2})?)/);
                            if (priceMatch) {
                                lionwheelPrice = parseFloat(priceMatch[1]);
                            }
                        }

                        if (barcode || productName) {
                            // Create new anipet cell
                            const anipetCell = document.createElement('td');
                            anipetCell.className = 'anipet-cell';
                            anipetCell.setAttribute('data-anipet-icon', 'true');
                            anipetCell.style.cssText = `
                                width: 30px !important;
                                min-width: 30px !important;
                                max-width: 30px !important;
                                text-align: center !important;
                                vertical-align: middle !important;
                                padding: 4px !important;
                                border-top: 1px solid #dee2e6 !important;
                                display: table-cell !important;
                                visibility: visible !important;
                                opacity: 1 !important;
                            `;

                            if (barcode) {
                                const button = createAlternativesButton(productName, barcode, barcode);
                                if (button) {
                                    button.setAttribute('data-anipet-icon', 'true');
                                    if (lionwheelPrice !== null) {
                                        button.setAttribute('data-lionwheel-price', lionwheelPrice);
                                    }
                                    anipetCell.appendChild(button);
                                }
                            } else if (productName) {
                                const button = createAlternativesButton(productName, productName, null);
                                if (button) {
                                    button.setAttribute('data-anipet-icon', 'true');
                                    if (lionwheelPrice !== null) {
                                        button.setAttribute('data-lionwheel-price', lionwheelPrice);
                                    }
                                    anipetCell.appendChild(button);
                                }
                            }

                            // Insert after barcode cell
                            if (barcodeCell && barcodeCell.parentNode) {
                                barcodeCell.parentNode.insertBefore(anipetCell, barcodeCell.nextSibling);
                            } else {
                                row.appendChild(anipetCell);
                            }
                        }
                    }
                });
            });
        } catch (error) {
            console.error('Error restoring missing icons:', error);
        }
    }

    function isProductPage() {
        try {
            const hasTable = document.querySelector('table.table-hover') !== null;
            return hasTable;
        } catch (error) {
            console.error('Error checking if product page:', error);
            return false;
        }
    }

    function init() {
        try {

            if (isInitialized) {
                return;
            }

            if (!isProductPage()) {
                setTimeout(init, RETRY_INTERVAL);
                return;
            }

            isInitialized = true;

            // Inject styles to prevent conflicts with other userscripts
            injectGlobalStyles();

            setTimeout(addAniPetIconToRows, 100);
        observeAndAddButtons();

            // Reduced frequency of re-checks
            setInterval(() => {
                if (errorCount < MAX_ERRORS) {
                    addAniPetIconToRows();
                }
            }, RECHECK_INTERVAL);

        } catch (error) {
            console.error('Error in init:', error);
            errorCount++;
        }
    }

    // Search for products using API or fallback to client-side search
    async function searchProducts(query, limit = MAX_RESULTS, excludeBarcode = null, excludeProductName = null) {
        try {
            if (!query || typeof query !== 'string' || query.trim().length === 0) {
                return [];
            }

            // Check cache first (include exclusion params in cache key)
            const cacheKey = `search_${query.toLowerCase().trim()}_${limit}_${excludeBarcode || ''}_${excludeProductName || ''}`;
            const cached = searchCache.get(cacheKey);
            if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
                return cached.results;
            }

            // Try API endpoint first using GM_xmlhttpRequest to bypass CORS
            // Note: This endpoint may not exist on Netlify, so we'll fall back to client-side search
            try {
                const apiUrl = `${ANIPET_API_URL}/search?q=${encodeURIComponent(query)}&limit=${limit}`;

                const apiResults = await new Promise((resolve, reject) => {
                    const timeoutId = setTimeout(() => {
                        reject(new Error('Request timeout'));
                    }, 8000); // Reduced timeout for faster fallback

                    if (typeof GM_xmlhttpRequest !== 'undefined') {
                        GM_xmlhttpRequest({
                            method: 'GET',
                            url: apiUrl,
                            headers: {
                                'Accept': 'application/json',
                            },
                            onload: function(response) {
                                clearTimeout(timeoutId);
                                try {
                                    if (response.status === 200) {
                                        // Check if response is HTML (error page) instead of JSON
                                        const responseText = response.responseText.trim();
                                        if (responseText.startsWith('<!') || responseText.startsWith('<html')) {
                                            reject(new Error('API returned HTML instead of JSON'));
                                            return;
                                        }

                                        const data = JSON.parse(responseText);
                                        const results = Array.isArray(data.products) ? data.products : (Array.isArray(data) ? data : []);

                                        // Filter out the current product
                                        let validResults = results.filter(p => {
                                            if (!p || (!p.productName && !p.barcode)) return false;

                                            // Exclude if barcode matches
                                            if (excludeBarcode && p.barcode && p.barcode.trim() === excludeBarcode.trim()) {
                                                return false;
                                            }

                                            // Exclude if product name is very similar (exact match)
                                            if (excludeProductName) {
                                                const currentName = (excludeProductName || '').toLowerCase().trim();
                                                const resultName = (p.productName || '').toLowerCase().trim();
                                                if (currentName === resultName) {
                                                    return false;
                                                }
                                            }

                                            return true;
                                        });

                                        if (validResults.length > 0) {
                                            resolve(validResults);
                                        } else {
                                            reject(new Error('No results from API'));
                                        }
                                    } else if (response.status === 404) {
                                        // API endpoint doesn't exist, skip to client-side search
                                        reject(new Error('API endpoint not found'));
                                    } else {
                                        reject(new Error(`API returned status ${response.status}`));
                                    }
                                } catch (parseError) {
                                    reject(parseError);
                                }
                            },
                            onerror: function(error) {
                                clearTimeout(timeoutId);
                                reject(error);
                            },
                            ontimeout: function() {
                                clearTimeout(timeoutId);
                                reject(new Error('Request timeout'));
                            },
                            timeout: 8000
                        });
                    } else {
                        // Fallback to regular fetch if GM_xmlhttpRequest not available
                        clearTimeout(timeoutId);
                        fetch(apiUrl, {
                            method: 'GET',
                            headers: {
                                'Accept': 'application/json',
                            }
                        })
                        .then(response => {
                            if (response.ok) {
                                return response.json();
                            }
                            throw new Error(`API returned status ${response.status}`);
                        })
                        .then(data => {
                            const results = Array.isArray(data.products) ? data.products : (Array.isArray(data) ? data : []);
                            const validResults = results.filter(p => p && (p.productName || p.barcode));
                            if (validResults.length > 0) {
                                resolve(validResults);
                            } else {
                                reject(new Error('No results from API'));
                            }
                        })
                        .catch(reject);
                    }
                });

                // Cache the results
                searchCache.set(cacheKey, {
                    results: apiResults,
                    timestamp: Date.now()
                });

                return apiResults;
            } catch (apiError) {
                // Silently fail and try client-side search
                // Only log if it's not a 404 (expected if API doesn't exist)
                if (!apiError.message || !apiError.message.includes('404') && !apiError.message.includes('not found')) {
                    console.log('API search failed, trying client-side search:', apiError.message || apiError);
                }
            }

            // Fallback: Try to load products data and search client-side
            if (!productsDataLoaded) {
                await loadProductsData();
            }

            if (productsData && productsData.length > 0) {
                const results = performClientSideSearch(productsData, query, limit, excludeBarcode, excludeProductName);

                // Cache the results
                searchCache.set(cacheKey, {
                    results: results,
                    timestamp: Date.now()
                });

                return results;
            }

            return [];
        } catch (error) {
            console.error('Error searching products:', error);
            return [];
        }
    }

    // Load products data from JSON file for client-side search fallback
    async function loadProductsData() {
        if (productsDataLoaded) return;

        try {
            // Try multiple possible paths for the JSON file
            const possiblePaths = [
                '/data/anipet_products_optimized.min.json',
                '/data/anipet_products_optimized.json',
                '/anipet_products_optimized.min.json'
            ];

            let jsonData = null;

            for (const path of possiblePaths) {
                try {
                    const dataUrl = `${ANIPET_APP_URL}${path}`;

                    const responseData = await new Promise((resolve, reject) => {
                        const timeoutId = setTimeout(() => {
                            reject(new Error('Request timeout'));
                        }, 15000);

                        if (typeof GM_xmlhttpRequest !== 'undefined') {
                            GM_xmlhttpRequest({
                                method: 'GET',
                                url: dataUrl,
                                headers: {
                                    'Accept': 'application/json',
                                },
                                onload: function(response) {
                                    clearTimeout(timeoutId);
                                    try {
                                        if (response.status === 200) {
                                            // Check if response is HTML (error page) instead of JSON
                                            const responseText = response.responseText.trim();
                                            if (responseText.startsWith('<!') || responseText.startsWith('<html')) {
                                                reject(new Error('Server returned HTML instead of JSON'));
                                                return;
                                            }

                                            const data = JSON.parse(responseText);
                                            resolve(data);
                                        } else {
                                            reject(new Error(`Failed to load: ${response.status}`));
                                        }
                                    } catch (parseError) {
                                        reject(parseError);
                                    }
                                },
                                onerror: function(error) {
                                    clearTimeout(timeoutId);
                                    reject(error);
                                },
                                ontimeout: function() {
                                    clearTimeout(timeoutId);
                                    reject(new Error('Request timeout'));
                                },
                                timeout: 15000
                            });
                        } else {
                            // Fallback to regular fetch
                            clearTimeout(timeoutId);
                            fetch(dataUrl)
                            .then(response => {
                                if (response.ok) {
                                    return response.json();
                                }
                                throw new Error(`Failed to load: ${response.status}`);
                            })
                            .then(resolve)
                            .catch(reject);
                        }
                    });

                    jsonData = responseData;
                    break;
                } catch (pathError) {
                    // Try next path
                    continue;
                }
            }

            if (jsonData && Array.isArray(jsonData)) {
                // Helper function to parse weight (defined before use)
                const parseWeightForData = (weightText, productName = '') => {
                    if (!weightText) {
                        if (productName) {
                            const nameKgMatch = productName.match(/(\d+(?:\.\d+)?)\s*(?:ק"?ג|קילו)/);
                            const nameGramMatch = productName.match(/(\d+(?:\.\d+)?)\s*גרם/);
                            const nameLiterMatch = productName.match(/(\d+(?:\.\d+)?)\s*ליטר/);
                            if (nameKgMatch) {
                                return parseFloat(nameKgMatch[1]);
                            } else if (nameGramMatch) {
                                return parseFloat(nameGramMatch[1]) / 1000; // Convert grams to kg
                            } else if (nameLiterMatch) {
                                // Treat liter like kg for package size comparison
                                return parseFloat(nameLiterMatch[1]);
                            }
                        }
                        return 0;
                    }

                    const kgMatch = weightText.match(/(\d+(?:\.\d+)?)\s*ק"?ג/);
                    const gramMatch = weightText.match(/(\d+(?:\.\d+)?)\s*גרם/);
                    const literMatch = weightText.match(/(\d+(?:\.\d+)?)\s*ליטר/);

                    if (kgMatch) {
                        return parseFloat(kgMatch[1]);
                    } else if (gramMatch) {
                        return parseFloat(gramMatch[1]) / 1000; // Convert grams to kg
                    } else if (literMatch) {
                        // Treat liter like kg for package size comparison
                        return parseFloat(literMatch[1]);
                    }

                    const numberMatch = weightText.match(/^([0-9]+\.?[0-9]*)/);
                    if (numberMatch) {
                        const value = parseFloat(numberMatch[1]);
                        return value < 100 ? value / 1000 : value;
                    }

                    return 0;
                };

                // Helper to parse quality level to a score
                const getQualityScore = (text) => {
                    if (!text) return 0;
                    text = text.toString().trim();
                    if (text === 'הכי טוב') return 3;
                    if (text === 'יותר טוב') return 2;
                    if (text === 'טוב') return 1;
                    return 0;
                };

                // Transform the data to match our expected format
                productsData = jsonData.map((row, index) => {
                    const productName = row['תאור פריט'] || '';
                    const weightText = row['משקל'] || '';
                    const weight = parseWeightForData(weightText, productName);
                    const qualityText = row['רמה / איכות'] || row['איכות'] || '';
                    const participatesInVariety = row['משתתף במגוון'] === 'כן';

                    return {
                        id: index,
                        sku: row['מק"ט'] || row['מק""ט'] || row['קוד פריט'] || '',
                        barcode: row['ברקוד'] || '',
                        productName: productName,
                        salePrice: parseFloat(row['מחיר מכירה'] || row['מחיר']) || 0,
                        brand: row['שם מותג'] || row['מותג'] || '',
                        animalType: row['קבוצת על'] || row['קבוצה'] || '',
                        lifeStage: row['גיל (גור בוגר וכו\')'] || row['גיל'] || '',
                        internalCategory: row['קטגוריה פנימית'] || row['קטגוריה'] || '',
                        mainIngredient: row['ממרכיב עיקרי'] || row['מרכיב'] || '',
                        medicalIssue: row['בעיה רפואית'] || '',
                        qualityLevel: qualityText, // Keep original string for display
                        qualityScore: getQualityScore(qualityText), // Numeric score for comparison
                        supplierName: row['שם ספק ראשי'] || row['ספק'] || '',
                        participatesInVariety: participatesInVariety,
                        weight: weight,
                        'משקל': weightText, // Keep original for reference
                        imageUrl: row['Image URL'] || '',
                        productUrl: row['Product URL'] || ''
                    };
                }).filter(p => p.productName && p.salePrice > 0);

                productsDataLoaded = true;
                if (DEBUG) console.log(`Loaded ${productsData.length} products for client-side search`);
            } else {
                productsData = [];
                productsDataLoaded = true;
                console.warn('Could not load products data for client-side search');
            }
        } catch (error) {
            console.error('Error loading products data:', error);
            productsData = [];
            productsDataLoaded = true;
        }
    }

    // Similarity fields for calculating product similarity
    const SIMILARITY_FIELDS = [
        'animalType',
        'internalCategory',
        'brand',
        'lifeStage',
        'mainIngredient',
        'price',
        'weight',
        'supplier',
        'supplierName',
        'healthIssue',
        'medicalIssue',
        'quality',
        'qualityLevel',
        'participatesInVariety', // Added field
    ];

    // Normalize SKU and barcode for comparison
    function normalizeId(val) {
        if (!val) return '';
        return val.toString().replace(/\.0$/, '').trim();
    }

    // Calculate similarity between two products (based on App.js logic)
    function calculateSimilarity(product1, product2, activeFields = null) {
        if (!product1 || !product2) return 0;

        const sku1 = normalizeId(product1.sku);
        const sku2 = normalizeId(product2.sku);
        const barcode1 = normalizeId(product1.barcode);
        const barcode2 = normalizeId(product2.barcode);

        const isSameProduct = (sku1 && sku2 && sku1 === sku2) || (barcode1 && barcode2 && barcode1 === barcode2);

        // Use all similarity fields if none specified
        const fieldsToCheck = activeFields || SIMILARITY_FIELDS;

        let score = 0;
        let maxScore = 0;
        const fieldPoints = {
            animalType: 30,
            internalCategory: 25,
            brand: 20,
            lifeStage: 15,
            mainIngredient: 10,
            price: 20,
            weight: 25,
            supplier: 10,
            healthIssue: 10,
            quality: 10,
            participatesInVariety: 15, // New bonus points
        };

        fieldsToCheck.forEach(field => {
            switch (field) {
                case 'animalType':
                    maxScore += fieldPoints.animalType;
                    if (product1.animalType && product2.animalType && product1.animalType === product2.animalType) {
                        score += fieldPoints.animalType;
                    }
                    break;
                case 'internalCategory':
                    maxScore += fieldPoints.internalCategory;
                    if (product1.internalCategory && product2.internalCategory && product1.internalCategory === product2.internalCategory) {
                        score += fieldPoints.internalCategory;
                    }
                    break;
                case 'brand':
                    maxScore += fieldPoints.brand;
                    if (product1.brand && product2.brand && product1.brand === product2.brand) {
                        score += fieldPoints.brand;
                    }
                    break;
                case 'lifeStage':
                    maxScore += fieldPoints.lifeStage;
                    if (product1.lifeStage && product2.lifeStage && product1.lifeStage === product2.lifeStage) {
                        score += fieldPoints.lifeStage;
                    }
                    break;
                case 'mainIngredient':
                    maxScore += fieldPoints.mainIngredient;
                    if (product1.mainIngredient && product2.mainIngredient && product1.mainIngredient === product2.mainIngredient) {
                        score += fieldPoints.mainIngredient;
                    }
                    break;
                case 'price':
                    maxScore += fieldPoints.price;
                    if (Number.isFinite(product1.salePrice) && Number.isFinite(product2.salePrice)) {
                        const priceDiff = Math.abs(product1.salePrice - product2.salePrice);
                        const priceRatio = priceDiff / Math.max(product1.salePrice, 1); // Avoid division by zero
                        if (priceDiff === 0) score += 20;
                        else if (priceRatio <= 0.05) score += 15;
                        else if (priceRatio <= 0.10) score += 10;
                        else if (priceRatio <= 0.20) score += 5;
                    }
                    break;
                case 'weight':
                    maxScore += fieldPoints.weight;
                    if (Number.isFinite(product1.weight) && Number.isFinite(product2.weight) && product1.weight > 0) {
                        const weightDiff = Math.abs(product1.weight - product2.weight);
                        const weightRatio = weightDiff / product1.weight;
                        if (weightDiff === 0) score += 25; // Exact match
                        else if (weightRatio <= 0.05) score += 20; // Very close (within 5%)
                        else if (weightRatio <= 0.10) score += 15; // Close (within 10%)
                        else if (weightRatio <= 0.20) score += 10; // Somewhat close (within 20%)
                        else if (weightRatio <= 0.50) score += 5; // Moderately close (within 50%)
                    }
                    break;
                case 'supplier':
                case 'supplierName':
                    maxScore += fieldPoints.supplier;
                    if (product1.supplierName && product2.supplierName && product1.supplierName === product2.supplierName) {
                        score += fieldPoints.supplier;
                    }
                    break;
                case 'healthIssue':
                case 'medicalIssue':
                    maxScore += fieldPoints.healthIssue;
                    if (product1.medicalIssue && product2.medicalIssue && product1.medicalIssue === product2.medicalIssue) {
                        score += fieldPoints.healthIssue;
                    }
                    break;
                case 'quality':
                case 'qualityLevel':
                    maxScore += fieldPoints.quality;
                    const q1 = product1.qualityScore || 0;
                    const q2 = product2.qualityScore || 0;

                    // If original has no specified quality, don't penalize matches
                    if (q1 === 0) {
                        score += fieldPoints.quality;
                    }
                    // Reward same or better quality
                    else if (q2 >= q1) {
                        score += fieldPoints.quality;
                    }
                    // Give partial points if compare product has some quality defined but lower
                    else if (q2 > 0) {
                        score += fieldPoints.quality / 2;
                    }
                    break;

                case 'participatesInVariety':
                    maxScore += fieldPoints.participatesInVariety;
                    // Give bonus if both products participate in variety
                    if (product1.participatesInVariety && product2.participatesInVariety) {
                        score += fieldPoints.participatesInVariety;
                    }
                    // Give partial bonus if just the alternative participates
                    else if (product2.participatesInVariety) {
                        score += fieldPoints.participatesInVariety / 2;
                    }
                    break;

                default:
                    break;
            }
        });

        if (maxScore === 0) return 0;
        const percent = Math.floor((score / maxScore) * 100);
        if (isSameProduct) return 100;
        return Math.min(percent, 100);
    }

    // Parse weight from text (similar to App.js)
    function parseWeight(weightText, productName = '') {
        if (!weightText) {
            // Try to extract from product name
            if (productName) {
                const nameKgMatch = productName.match(/(\d+(?:\.\d+)?)\s*(?:ק"?ג|קילו)/);
                const nameGramMatch = productName.match(/(\d+(?:\.\d+)?)\s*גרם/);
                const nameLiterMatch = productName.match(/(\d+(?:\.\d+)?)\s*ליטר/);
                if (nameKgMatch) {
                    return parseFloat(nameKgMatch[1]);
                } else if (nameGramMatch) {
                    return parseFloat(nameGramMatch[1]) / 1000; // Convert grams to kg
                } else if (nameLiterMatch) {
                    // Treat liter like kg for package size comparison
                    return parseFloat(nameLiterMatch[1]);
                }
            }
            return 0;
        }

        // Try to extract weight from weightText
        const kgMatch = weightText.match(/(\d+(?:\.\d+)?)\s*ק"?ג/);
        const gramMatch = weightText.match(/(\d+(?:\.\d+)?)\s*גרם/);
        const literMatch = weightText.match(/(\d+(?:\.\d+)?)\s*ליטר/);

        if (kgMatch) {
            return parseFloat(kgMatch[1]);
        } else if (gramMatch) {
            return parseFloat(gramMatch[1]) / 1000; // Convert grams to kg
        } else if (literMatch) {
            // Treat liter like kg for package size comparison
            return parseFloat(literMatch[1]);
        }

        // Try to extract just a number
        const numberMatch = weightText.match(/^([0-9]+\.?[0-9]*)/);
        if (numberMatch) {
            const value = parseFloat(numberMatch[1]);
            // Assume grams if it's a small number, kg if it's larger
            return value < 100 ? value / 1000 : value;
        }

        return 0;
    }

    // Format weight for display (similar to App.js)
    function formatWeight(weight, unit, originalWeight = null, originalUnit = null) {
        if (!Number.isFinite(weight)) return '0';

        // If we have original weight and unit, use those for display
        if (originalWeight !== null && originalUnit !== null) {
            if (originalUnit === 'גרם') {
                return `${Math.round(originalWeight)} ${originalUnit}`;
            } else if (originalUnit === 'ק"ג' || originalUnit === 'ליטר') {
                return `${originalWeight.toFixed(1)} ${originalUnit}`;
            } else {
                return `${Math.round(originalWeight)} ${originalUnit}`;
            }
        }

        // Fallback to the old logic
        let displayUnit = unit || 'ק"ג';
        if (unit && (unit.replace(/["'׳״]/g, '').replace(/\s/g, '') === 'קג' || unit === 'קג')) {
            displayUnit = 'ק"ג';
        }
        if (displayUnit === 'ק"ג' || displayUnit === 'ליטר') {
            return `${weight.toFixed(1)} ${displayUnit}`;
        }
        return `${Math.round(weight)} ${displayUnit}`;
    }

    // SVG icons for tags (simple inline SVG)
    const tagIcons = {
        internalCategory: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>',
        animalType: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>',
        brand: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>',
        lifeStage: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path></svg>',
        supplierName: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"></line><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>',
        mainIngredient: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"></path><path d="M7 2v20"></path><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3z"></path><path d="M21 15v7"></path></svg>',
        medicalIssue: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>',
        qualityLevel: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>',
        price: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>',
        participatesInVariety: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>',
        weight: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="8" width="18" height="4" rx="1"></rect><path d="M12 8v13"></path><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"></path><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"></path></svg>'
    };

    // Color mapping and icon mapping for tags (matching App.js)
    const tagMeta = {
        internalCategory: { color: '#FEEBC8', textColor: '#744210', icon: tagIcons.internalCategory, label: 'קטגוריה' },
        animalType: { color: '#C6F6D5', textColor: '#22543D', icon: tagIcons.animalType, label: 'קבוצה' },
        brand: { color: '#BEE3F8', textColor: '#2A4365', icon: tagIcons.brand, label: 'מותג' },
        lifeStage: { color: '#E9D8FD', textColor: '#553C9A', icon: tagIcons.lifeStage, label: 'גיל' },
        supplierName: { color: '#B2F5EA', textColor: '#234E52', icon: tagIcons.supplierName, label: 'ספק' },
        mainIngredient: { color: '#FED7D7', textColor: '#742A2A', icon: tagIcons.mainIngredient, label: 'טעם' },
        medicalIssue: { color: '#D6BCFA', textColor: '#322659', icon: tagIcons.medicalIssue, label: 'בעיה רפואית' },
        qualityLevel: { color: '#FEFCBF', textColor: '#744210', icon: tagIcons.qualityLevel, label: 'איכות' },
        price: { color: '#B2F5EA', textColor: '#234E52', icon: tagIcons.price, label: 'מחיר' },
        participatesInVariety: { color: '#E2E8F0', textColor: '#4A5568', icon: tagIcons.participatesInVariety, label: 'במגוון' },
        weight: { color: '#E2E8F0', textColor: '#4A5568', icon: tagIcons.weight, label: 'משקל' }
    };

    // Perform client-side search on products data with similarity calculation
    // This follows the same logic as the website: calculate similarity for ALL products, not just text matches
    function performClientSideSearch(products, query, limit, excludeBarcode = null, excludeProductName = null) {
        if (!products || products.length === 0 || !query) {
            if (DEBUG) console.log('performClientSideSearch: No products or query');
            return [];
        }

        const searchTerm = query.toLowerCase().trim();
        const excludeBarcodeLower = excludeBarcode ? excludeBarcode.toLowerCase().trim() : null;
        const excludeProductNameLower = excludeProductName ? excludeProductName.toLowerCase().trim() : null;

        if (DEBUG) console.log('performClientSideSearch:', { query, excludeBarcode, excludeProductName, productsCount: products.length });

        // Step 1: Find the original product in the data
        let originalProduct = null;
        if (excludeBarcodeLower) {
            originalProduct = products.find(p => {
                const barcode = (p.barcode || '').toLowerCase().trim();
                return barcode === excludeBarcodeLower;
            });
        }

        // If not found by barcode, try to find by product name
        if (!originalProduct && excludeProductNameLower) {
            originalProduct = products.find(p => {
                const name = (p.productName || '').toLowerCase().trim();
                return name === excludeProductNameLower;
            });
        }

        // If still not found, try partial match on product name
        if (!originalProduct && excludeProductNameLower) {
            originalProduct = products.find(p => {
                const name = (p.productName || '').toLowerCase().trim();
                return name.includes(excludeProductNameLower) || excludeProductNameLower.includes(name);
            });
        }

        if (!originalProduct) {
            console.log('Original product not found - cannot calculate similarity');
            return [];
        }

        console.log('Found original product:', originalProduct.productName);
        // Ensure weight is parsed if not already
        if (!originalProduct.weight && (originalProduct['משקל'] || originalProduct.productName)) {
            originalProduct.weight = parseWeight(originalProduct['משקל'] || '', originalProduct.productName || '');
        }

        // Step 2: Start with ALL products (like the website does)
        // Filter out only the exact same product
        let filtered = products.filter(product => {
            const productBarcode = (product.barcode || '').toLowerCase().trim();
            const productName = (product.productName || '').toLowerCase().trim();

            // Exclude if barcode matches exactly
            if (excludeBarcodeLower && productBarcode === excludeBarcodeLower) {
                return false;
            }

            // Exclude if product name is exactly the same
            if (excludeProductNameLower && productName === excludeProductNameLower) {
                return false;
            }

            return true;
        });

        console.log(`After excluding original product: ${filtered.length} products`);

        // Step 3: Apply filters based on original product (like the website does)
        // Filter by same animalType, internalCategory, and lifeStage if available
        if (originalProduct.animalType) {
            const beforeFilter = filtered.length;
            filtered = filtered.filter(p => p.animalType === originalProduct.animalType);
            console.log(`After animalType filter (${originalProduct.animalType}): ${filtered.length} products (was ${beforeFilter})`);
        }

        if (originalProduct.internalCategory) {
            const beforeFilter = filtered.length;
            filtered = filtered.filter(p => p.internalCategory === originalProduct.internalCategory);
            console.log(`After internalCategory filter (${originalProduct.internalCategory}): ${filtered.length} products (was ${beforeFilter})`);
        }

        if (originalProduct.lifeStage) {
            const beforeFilter = filtered.length;
            filtered = filtered.filter(p => p.lifeStage === originalProduct.lifeStage);
            console.log(`After lifeStage filter (${originalProduct.lifeStage}): ${filtered.length} products (was ${beforeFilter})`);
        }

        // Filter by medicalIssue if original product has one - prioritize medical products
        const hasMedicalIssue = !!(originalProduct.medicalIssue && originalProduct.medicalIssue.trim());
        if (hasMedicalIssue) {
            const beforeFilter = filtered.length;
            // Prefer products with the same medicalIssue, but don't exclude others completely
            // We'll use scoring bonus instead of strict filtering
            const matchingMedical = filtered.filter(p => p.medicalIssue && 
                p.medicalIssue.trim().toLowerCase() === originalProduct.medicalIssue.trim().toLowerCase());
            const nonMatchingMedical = filtered.filter(p => !p.medicalIssue || 
                p.medicalIssue.trim().toLowerCase() !== originalProduct.medicalIssue.trim().toLowerCase());
            
            // Sort: matching medical products first, then others
            filtered = [...matchingMedical, ...nonMatchingMedical];
            console.log(`Medical products with matching issue: ${matchingMedical.length}, others: ${nonMatchingMedical.length}`);
        }

        // Step 4: Check if original product is medical food
        const isOriginalMedical = !!(originalProduct.medicalIssue && originalProduct.medicalIssue.trim());
        const isOriginalMedicalCategory = !!(originalProduct.internalCategory && 
            (originalProduct.internalCategory.toLowerCase().includes('רפואי') || 
             originalProduct.internalCategory.toLowerCase().includes('medical')));

        // Step 5: Calculate similarity scores for ALL filtered products (like the website)
        // Include medicalIssue in similarity calculation if original product is medical
        // Added participatesInVariety and qualityLevel to active fields
        const activeSimilarityFields = ['weight', 'price', 'brand', 'animalType', 'internalCategory', 'lifeStage', 'participatesInVariety', 'qualityLevel'];

        if (isOriginalMedical || isOriginalMedicalCategory) {
            activeSimilarityFields.push('medicalIssue');
            if (DEBUG) console.log('Original product is medical food, including medicalIssue in similarity calculation');
        }

        const productsWithScores = filtered.map(product => {
            // Ensure weight is parsed if not already
            if (!product.weight && (product['משקל'] || product.productName)) {
                product.weight = parseWeight(product['משקל'] || '', product.productName || '');
            }
            let similarityScore = calculateSimilarity(originalProduct, product, activeSimilarityFields);
            
            // Bonus for medical products with matching medicalIssue
            if (isOriginalMedical && originalProduct.medicalIssue && product.medicalIssue) {
                const originalMedical = originalProduct.medicalIssue.trim().toLowerCase();
                const productMedical = product.medicalIssue.trim().toLowerCase();
                if (originalMedical === productMedical) {
                    // Add significant bonus points (20%) for matching medical issue
                    similarityScore = Math.min(100, similarityScore + 20);
                    if (DEBUG) console.log(`Medical match bonus: ${product.productName} matches ${originalProduct.medicalIssue}`);
                }
            }
            
            // Bonus for products in medical category if original is medical
            const productIsMedicalCategory = product.internalCategory && 
                (product.internalCategory.toLowerCase().includes('רפואי') || 
                 product.internalCategory.toLowerCase().includes('medical'));
            
            if (isOriginalMedicalCategory || isOriginalMedical) {
                if (productIsMedicalCategory) {
                    // Add bonus (10%) for being in medical category when original is medical
                    similarityScore = Math.min(100, similarityScore + 10);
                }
            }
            
            // Additional bonus if product has any medicalIssue when original is medical
            if ((isOriginalMedical || isOriginalMedicalCategory) && product.medicalIssue && product.medicalIssue.trim()) {
                // Add smaller bonus (5%) for having any medical issue
                similarityScore = Math.min(100, similarityScore + 5);
            }
            
            return { product, similarityScore };
        });

        if (DEBUG) {
            console.log('Similarity scores calculated for all filtered products:', productsWithScores.length);
            console.log('Top 5 similarity scores:', productsWithScores.slice(0, 5).map(p => ({
                name: p.product.productName,
                similarity: p.similarityScore
            })));
        }

        // Step 5: Sort by similarity score (highest first) - like the website
        productsWithScores.sort((a, b) => (b.similarityScore || 0) - (a.similarityScore || 0));

        // Step 6: Take top results and return products
        const results = productsWithScores
            .slice(0, limit)
            .map(item => {
                // Add similarity score to product for display
                if (item.similarityScore > 0) {
                    item.product._similarityScore = item.similarityScore;
                }
                return item.product;
            });

        if (DEBUG) console.log(`Returning ${results.length} results (sorted by similarity)`);

        return results;
    }

    // Global loader functions
    function showGlobalLoader() {
        // Remove existing loader if any
        const existingLoader = document.getElementById('anipet-global-loader');
        if (existingLoader) {
            existingLoader.remove();
        }

        // Create global loader overlay
        const loaderOverlay = document.createElement('div');
        loaderOverlay.id = 'anipet-global-loader';
        loaderOverlay.className = 'anipet-global-loader-overlay';
        loaderOverlay.innerHTML = `
            <div class="anipet-global-loader-spinner">
                <div class="anipet-spinner-border anipet-text-primary" role="status">
                    <span class="anipet-sr-only">טוען...</span>
                </div>
                <p>מחפש תחליפים...</p>
            </div>
        `;
        document.body.appendChild(loaderOverlay);
    }

    function hideGlobalLoader() {
        const loader = document.getElementById('anipet-global-loader');
        if (loader) {
            loader.remove();
        }
    }

    // Show popup with search results
    async function showSearchPopup(productName, searchTerm, barcode = null, lionwheelPrice = null) {
        // Show global loader immediately
        showGlobalLoader();
        // Load Font Awesome if not already loaded
        loadFontAwesome();
        
        // Remove existing popup if any
        const existingPopup = document.getElementById('anipet-popup');
        if (existingPopup) {
            existingPopup.remove();
        }

        // Determine what to exclude from results
        let excludeBarcode = barcode || null;
        let excludeProductName = productName || null;

        // If searchTerm is numeric and we don't have barcode, use searchTerm as barcode
        if (!excludeBarcode && /^\d+$/.test(searchTerm.trim())) {
            excludeBarcode = searchTerm.trim();
        }

        // Try to find original product data for comparison features
        let originalProductData = null;
        try {
            if (!productsDataLoaded) {
                await loadProductsData();
            }
            if (productsData && productsData.length > 0) {
                if (excludeBarcode) {
                    originalProductData = productsData.find(p => (p.barcode || '').trim() === excludeBarcode.trim());
                }
                if (!originalProductData && excludeProductName) {
                    originalProductData = productsData.find(p => (p.productName || '').trim() === excludeProductName.trim());
                }

                // If we found the product AND we have a price from LionWheel, use the LionWheel price
                // as it's the most accurate for comparison
                if (originalProductData && lionwheelPrice !== null) {
                    if (DEBUG) console.log(`Overriding JSON price (${originalProductData.salePrice}) with LionWheel price (${lionwheelPrice})`);
                    // Create a copy of the data to avoid modifying the global productsData cache
                    originalProductData = { ...originalProductData, salePrice: lionwheelPrice };
                }
            }
        } catch (e) {
            if (DEBUG) console.warn('Failed to find original product data:', e);
        }

        // Create popup overlay
        const overlay = document.createElement('div');
        overlay.id = 'anipet-popup-overlay';
        overlay.className = 'anipet-popup-overlay';

        // Create popup container
        const popup = document.createElement('div');
        popup.id = 'anipet-popup';
        popup.className = 'anipet-popup';

        // Create header
        const header = document.createElement('div');
        header.className = 'anipet-popup-header';
        header.innerHTML = `
            <h3>תחליפים למוצר: ${escapeHtml(productName || searchTerm)}</h3>
            <button class="anipet-popup-close" aria-label="סגור">×</button>
        `;

        // Create content area
        const content = document.createElement('div');
        content.className = 'anipet-popup-content';

        // Show loading state
        content.innerHTML = `
            <div class="anipet-popup-loading">
                <div class="anipet-spinner-border anipet-text-primary" role="status">
                    <span class="anipet-sr-only">טוען...</span>
                </div>
                <p>מחפש תחליפים...</p>
            </div>
        `;

        popup.appendChild(header);
        popup.appendChild(content);
        overlay.appendChild(popup);
        document.body.appendChild(overlay);

        // Hide global loader now that popup is visible
        hideGlobalLoader();

        // Close button handler
        const closeBtn = header.querySelector('.anipet-popup-close');
        const closePopup = () => {
            overlay.remove();
            document.body.style.overflow = '';
        };

        closeBtn.addEventListener('click', closePopup);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closePopup();
            }
        });

        // Prevent body scroll when popup is open
        document.body.style.overflow = 'hidden';

        // Escape key handler
        const escapeHandler = (e) => {
            if (e.key === 'Escape') {
                closePopup();
                document.removeEventListener('keydown', escapeHandler);
            }
        };
        document.addEventListener('keydown', escapeHandler);

        // Perform search (exclude current product)
        try {
            const results = await searchProducts(searchTerm, MAX_RESULTS, excludeBarcode, excludeProductName);

            if (results.length === 0) {
                content.innerHTML = `
                    <div class="anipet-popup-empty">
                        <p>לא נמצאו תחליפים למוצר זה.</p>
                        <a href="${ANIPET_APP_URL}?search=${encodeURIComponent(searchTerm)}" target="_blank" rel="noopener noreferrer" class="anipet-btn anipet-btn-primary">
                            פתח באניפט לחיפוש מתקדם
                        </a>
                    </div>
                `;
            } else {
                content.innerHTML = renderProductResults(results, searchTerm, productName, originalProductData);
                
                // Add click handlers for product links after rendering
                const productLinks = content.querySelectorAll('.anipet-product-link');
                productLinks.forEach(link => {
                    link.addEventListener('click', (e) => {
                        // Allow the link to open normally
                        // Optionally track clicks here
                    });
                });
                
                // Add click handlers for copyable elements (product name, barcode, SKU)
                const copyableElements = content.querySelectorAll('.anipet-copyable');
                copyableElements.forEach(element => {
                    element.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const textToCopy = element.getAttribute('data-copy-value');
                        if (textToCopy) {
                            await copyToClipboard(textToCopy, element);
                        }
                    });
                });
            }
        } catch (error) {
            console.error('Error in search:', error);
            // Hide global loader in case of error
            hideGlobalLoader();
            content.innerHTML = `
                <div class="anipet-popup-error">
                    <p>אירעה שגיאה בחיפוש. נסה שוב מאוחר יותר.</p>
                    <p style="font-size: 0.875rem; color: #666; margin-top: 10px;">${escapeHtml(error.message || 'שגיאה לא ידועה')}</p>
                    <a href="${ANIPET_APP_URL}?search=${encodeURIComponent(searchTerm)}" target="_blank" rel="noopener noreferrer" class="anipet-btn anipet-btn-primary" style="margin-top: 15px;">
                        פתח באניפט לחיפוש מתקדם
                    </a>
                </div>
            `;
        }
    }

    // Render product results
    function renderProductResults(products, searchTerm, productName = null, originalProduct = null) {
        if (!products || products.length === 0) {
            return '<div class="anipet-popup-empty"><p>לא נמצאו תוצאות</p></div>';
        }

        // Helper function to get similarity score color
        const getSimilarityColor = (score) => {
            if (score >= 66) return '#78B935'; // Green
            if (score >= 33) return '#F3CF26'; // Yellow
            return '#D32401'; // Red
        };

        // Helper function to get match score color (for badge background)
        const getMatchScoreColor = (score) => {
            if (score >= 66) return '#C6F6D5'; // Light green
            if (score >= 33) return '#FEFCBF'; // Light yellow
            return '#FED7D7'; // Light red
        };

        // Helper function to generate tags HTML
        const generateTagsHtml = (product) => {
            const tags = [];

            // Add tags for each field in tagMeta
            Object.entries(tagMeta).forEach(([field, meta]) => {
                let displayValue = null;

                if (field === 'weight') {
                    if (product.weight && product.weight > 0) {
                        displayValue = formatWeight(product.weight, 'ק"ג');
                    }
                } else if (field === 'price') {
                    if (product.salePrice && !isNaN(product.salePrice)) {
                        displayValue = `${product.salePrice.toFixed(2)} ₪`;
                    }
                } else if (field === 'participatesInVariety') {
                    if (product[field] === 'כן' || product[field] === true) {
                        displayValue = meta.label;
                    }
                } else {
                    displayValue = product[field] || product[field + 'Name'] || null;
                }

                if (displayValue) {
                    tags.push(`
                        <span class="anipet-tag" style="background-color: ${meta.color}; color: ${meta.textColor};">
                            ${meta.icon ? `<span class="anipet-tag-icon">${meta.icon}</span>` : ''}
                            <span class="anipet-tag-text">${escapeHtml(String(displayValue))}</span>
                        </span>
                    `);
                }
            });

            return tags.join('');
        };

        const productsHtml = products.slice(0, MAX_RESULTS).map(product => {
            if (!product) return '';

            const imageUrl = product.imageUrl || ICON_URL;
            const productNameStr = product.productName || '';
            const productUrl = product.productUrl || `${ANIPET_APP_URL}?barcode=${encodeURIComponent(product.barcode || product.productName)}`;

            // Price calculations
            const hasPrice = product.salePrice && !isNaN(product.salePrice);
            const price = hasPrice ? product.salePrice.toFixed(2) : 'לא זמין';

            // Price per Kg calculation
            let pricePerKgHtml = '';
            if (hasPrice && product.weight && product.weight > 0) {
                const ppkg = (product.salePrice / product.weight).toFixed(2);
                pricePerKgHtml = `<p class="anipet-price-per-kg">${ppkg} ₪ לק"ג</p>`;
            }

            // Price difference calculation
            let priceDiffHtml = '';
            let priceDiffTitle = '';
            if (hasPrice && originalProduct && originalProduct.salePrice && !isNaN(originalProduct.salePrice)) {
                const diff = product.salePrice - originalProduct.salePrice;
                if (diff !== 0) {
                    const color = diff > 0 ? '#dc3545' : '#28a745'; // red for more expensive, green for cheaper
                    const absDiff = Math.abs(diff).toFixed(2);
                    // Calculate percentage difference
                    const percentDiff = ((diff / originalProduct.salePrice) * 100).toFixed(1);
                    priceDiffTitle = `הפרש של ${Math.abs(percentDiff)}% מהמוצר המקורי`;
                    // Note: escapeHtml will be called after this function, but for title attribute we need to escape manually
                    const escapedTitle = priceDiffTitle.replace(/"/g, '&quot;');
                    // Display as "זול ב־X₪ מהמוצר המקורי" or "יקר ב־X₪ מהמוצר המקורי"
                    const priceDiffText = diff > 0 
                        ? `יקר ב־${absDiff}₪ מהמוצר המקורי`
                        : `זול ב־${absDiff}₪ מהמוצר המקורי`;
                    priceDiffHtml = `<p class="anipet-price-diff" style="color: ${color}; direction: rtl; margin: 0; font-size: 0.9em;" title="${escapedTitle}">${priceDiffText}</p>`;
                } else {
                    // Price is the same as original product
                    priceDiffHtml = `<p class="anipet-price-diff" style="color: #28a745; direction: rtl; margin: 0; font-size: 0.9em;">המחיר זהה למוצר המקורי</p>`;
                }
            }

            const brand = product.brand || '';
            const name = productNameStr || 'מוצר ללא שם';
            const similarityScore = product._similarityScore !== undefined ? product._similarityScore : null;
            const barcode = product.barcode || 'לא זמין';
            const sku = product.sku || 'לא זמין';
            const weight = product.weight && product.weight > 0 ? formatWeight(product.weight, 'ק"ג') : 'לא זמין';
            const tagsHtml = generateTagsHtml(product);
            const scoreColor = similarityScore !== null ? getMatchScoreColor(similarityScore) : '#E2E8F0';
            const scoreTextColor = similarityScore !== null ? getSimilarityColor(similarityScore) : '#666';

            // Truncate long product names
            const displayName = name.length > 60 ? name.substring(0, 57) + '...' : name;
            
            // Google Images search URL
            const googleImagesUrl = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(name)}`;
            
            // Get full size image URL for click
            const fullSizeUrl = getFullSizeImageUrl(imageUrl);
            
            // Determine the final HTML for the image, wrapping in an <a> tag only if it's not the placeholder
            const imageHtml = imageUrl === ICON_URL
                ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(name)}" loading="lazy" onerror="this.src='${ICON_URL}';">`
                : `<a href="${escapeHtml(fullSizeUrl || imageUrl)}" target="_blank" rel="noopener noreferrer" title="לחץ לפתיחת תמונה בגודל מלא">
                        <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(name)}" loading="lazy" onerror="this.src='${ICON_URL}';">
                    </a>`;
            
            // Google icon SVG
            const googleIconSvg = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="display: inline-block; vertical-align: middle;">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
            `;

            return `
                <div class="anipet-product-card" data-product-url="${escapeHtml(productUrl)}">
                    <div class="anipet-product-image">
                        ${imageHtml}
                    </div>
                    <div class="anipet-product-info">
                        <div class="anipet-product-name-wrapper">
                            <h4 class="anipet-product-name anipet-copyable" data-copy-value="${escapeHtml(name)}" title="${escapeHtml(name)} (לחץ להעתקה)">${escapeHtml(displayName)}<i class="fa-light fa-clone anipet-copy-icon"></i></h4>
                            <a href="${escapeHtml(googleImagesUrl)}" target="_blank" rel="noopener noreferrer" class="anipet-google-images-link" title="חפש תמונות בגוגל">
                                ${googleIconSvg}
                            </a>
                        </div>
                        ${brand ? `<p class="anipet-product-brand">${escapeHtml(brand)}</p>` : ''}
                        <div class="anipet-price-container">
                            <p class="anipet-product-price">${price !== 'לא זמין' ? '₪' + price : price}</p>
                            ${priceDiffHtml}
                        </div>
                        ${pricePerKgHtml}
                        <div class="anipet-product-details">
                            <p class="anipet-product-barcode anipet-copyable" data-copy-value="${escapeHtml(String(barcode))}" title="לחץ להעתקה">ברקוד: ${escapeHtml(String(barcode))}<i class="fa-light fa-clone anipet-copy-icon"></i></p>
                            ${sku !== barcode && sku !== 'לא זמין' ? `<p class="anipet-product-sku anipet-copyable" data-copy-value="${escapeHtml(String(sku))}" title="לחץ להעתקה">מק"ט: ${escapeHtml(String(sku))}<i class="fa-light fa-clone anipet-copy-icon"></i></p>` : ''}
                            <p class="anipet-product-weight">משקל: ${escapeHtml(String(weight))}</p>
                        </div>
                        ${tagsHtml ? `<div class="anipet-product-tags">${tagsHtml}</div>` : ''}
                        ${similarityScore !== null ? `
                            <div class="anipet-similarity-score" style="background-color: ${scoreColor}; color: ${scoreTextColor};">
                                ${similarityScore}% התאמה
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }).filter(html => html.length > 0).join('');

        // Build search URL using productName or searchTerm
        const searchQuery = productName || searchTerm || '';
        const searchUrl = `${ANIPET_APP_URL}?search=${encodeURIComponent(searchQuery)}`;

        return `
            <div class="anipet-popup-results">
                <p class="anipet-results-count">מוצגים ${products.length} תחליפים:</p>
                <div class="anipet-products-list">
                    ${productsHtml}
                </div>
                <div class="anipet-more-results">
                    <a href="${escapeHtml(searchUrl)}" target="_blank" rel="noopener noreferrer" class="anipet-more-results-btn">
                        עוד תוצאות
                    </a>
                </div>
            </div>
        `;
    }

    // Escape HTML to prevent XSS
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Copy text to clipboard
    async function copyToClipboard(text, element) {
        try {
            if (!text || text === 'לא זמין') return;
            
            // Use modern clipboard API if available
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
            } else {
                // Fallback for older browsers
                const textArea = document.createElement('textarea');
                textArea.value = text;
                textArea.style.position = 'fixed';
                textArea.style.opacity = '0';
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
            }
            
            // Show visual feedback
            if (element) {
                const originalBg = element.style.backgroundColor;
                const originalColor = element.style.color;
                
                element.style.backgroundColor = '#d4edda';
                element.style.color = '#155724';
                element.style.transition = 'all 0.3s ease';
                
                setTimeout(() => {
                    element.style.backgroundColor = originalBg;
                    element.style.color = originalColor;
                }, 500);
            }
        } catch (error) {
            console.error('Error copying to clipboard:', error);
        }
    }

    function loadFontAwesome() {
        // Check if Font Awesome is already loaded
        if (document.querySelector('link[href*="font-awesome"]') || 
            document.querySelector('link[href*="fontawesome"]') ||
            document.querySelector('link[href*="cdnjs.cloudflare.com"]') ||
            window.FontAwesome) {
            return;
        }
        
        // Load Font Awesome from CDN (includes Light, Regular, Solid, etc.)
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
        link.integrity = 'sha512-iecdLmaskl7CVkqkXNQ/ZH/XLlvWZOJyj7Yy7tcenmpD1ypASozpmT/E0iPtmFIB46ZmdtAc9eNBvH0H/ZpiBw==';
        link.crossOrigin = 'anonymous';
        document.head.appendChild(link);
    }

    function injectGlobalStyles() {
        if (document.getElementById('anipet-popup-styles')) return;
        
        // Load Font Awesome
        loadFontAwesome();
        const css = `
        /* Disable pointer events on parent anchor tags containing our button */
        a:has(.anipet-alternatives-btn) {
            pointer-events: none !important;
        }

        /* Re-enable pointer events specifically for our button */
        a:has(.anipet-alternatives-btn) .anipet-alternatives-btn {
            pointer-events: auto !important;
        }

        /* Alternative approach for browsers that don't support :has() */
        .anipet-alternatives-btn {
            position: relative;
            z-index: 1000 !important;
            display: inline-flex !important;
            visibility: visible !important;
            opacity: 1 !important;
        }

        /* Ensure our button is clickable even when wrapped in anchor */
        .anipet-alternatives-btn,
        .anipet-alternatives-btn * {
            pointer-events: auto !important;
        }

        /* Disable any parent anchor's click behavior around our button */
        .anipet-alternatives-btn {
            isolation: isolate;
        }

        /* Ensure SVG icon is visible */
        .anipet-alternatives-btn svg {
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
            width: 28px !important;
            height: 28px !important;
            max-width: 28px !important;
            max-height: 28px !important;
        }

        /* Ensure anipet-cell is visible */
        .anipet-cell {
            display: table-cell !important;
            visibility: visible !important;
            opacity: 1 !important;
            width: 30px !important;
            min-width: 30px !important;
            max-width: 30px !important;
        }

        /* Ensure anipet-header is visible */
        .anipet-header {
            display: table-cell !important;
            visibility: visible !important;
            opacity: 1 !important;
            width: 30px !important;
            min-width: 30px !important;
            max-width: 30px !important;
        }

        /* Protect anipet icon cells from being removed or hidden */
        td[data-anipet-icon="true"],
        .anipet-cell[data-anipet-icon="true"] {
            display: table-cell !important;
            visibility: visible !important;
            opacity: 1 !important;
            width: 30px !important;
            min-width: 30px !important;
            max-width: 30px !important;
        }

        /* Protect anipet button from being removed */
        button[data-anipet-icon="true"],
        .anipet-alternatives-btn[data-anipet-icon="true"] {
            display: inline-flex !important;
            visibility: visible !important;
            opacity: 1 !important;
        }

        /* Popup Overlay */
        .anipet-popup-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgba(0, 0, 0, 0.6);
            z-index: 99999;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            direction: rtl;
            animation: anipet-fadeIn 0.2s ease-in;
        }

        @keyframes anipet-fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        /* Global Loader Overlay */
        .anipet-global-loader-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgba(0, 0, 0, 0.5);
            z-index: 99998;
            display: flex;
            align-items: center;
            justify-content: center;
            direction: rtl;
            animation: anipet-fadeIn 0.2s ease-in;
        }

        .anipet-global-loader-spinner {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 1rem;
        }

        .anipet-global-loader-spinner p {
            margin: 0;
            color: #fff;
            font-size: 1rem;
            font-weight: 500;
        }

        .anipet-global-loader-spinner .anipet-spinner-border {
            border-color: rgba(255, 255, 255, 0.3);
            border-right-color: #fff;
        }

        /* Popup Container */
        .anipet-popup {
            background: white;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            max-width: 800px;
            width: 100%;
            max-height: 90vh;
            display: flex;
            flex-direction: column;
            animation: anipet-slideUp 0.3s ease-out;
        }

        @keyframes anipet-slideUp {
            from {
                transform: translateY(20px);
                opacity: 0;
            }
            to {
                transform: translateY(0);
                opacity: 1;
            }
        }

        /* Popup Header */
        .anipet-popup-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 20px;
            border-bottom: 1px solid #dee2e6;
        }

        .anipet-popup-header h3 {
            margin: 0;
            font-size: 1.25rem;
            font-weight: 600;
            color: #333;
        }

        .anipet-popup-close {
            background: none;
            border: none;
            font-size: 2rem;
            line-height: 1;
            color: #666;
            cursor: pointer;
            padding: 0;
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 4px;
            transition: all 0.2s;
        }

        .anipet-popup-close:hover {
            background-color: #f0f0f0;
            color: #000;
        }

        /* Popup Content */
        .anipet-popup-content {
            padding: 20px;
            overflow-y: auto;
            flex: 1;
        }

        /* Loading State */
        .anipet-popup-loading {
            text-align: center;
            padding: 40px 20px;
        }

        .anipet-popup-loading .anipet-spinner-border {
            width: 3rem;
            height: 3rem;
            border-width: 0.3em;
            margin-bottom: 1rem;
        }

        .anipet-popup-loading p {
            margin: 0;
            color: #666;
        }

        /* Empty/Error States */
        .anipet-popup-empty,
        .anipet-popup-error {
            text-align: center;
            padding: 40px 20px;
        }

        .anipet-popup-empty p,
        .anipet-popup-error p {
            margin-bottom: 20px;
            color: #666;
        }

        /* Results */
        .anipet-popup-results {
            direction: rtl;
        }

        .anipet-results-count {
            margin-bottom: 15px;
            font-weight: 600;
            color: #333;
        }

        .anipet-products-list {
            display: grid;
            gap: 15px;
        }

        /* More Results Button */
        .anipet-more-results {
            display: flex;
            justify-content: center;
            align-items: center;
            margin-top: 20px;
            padding-top: 20px;
            border-top: 1px solid #dee2e6;
        }

        .anipet-more-results-btn {
            display: inline-block;
            padding: 0.75rem 2rem;
            font-size: 1rem;
            font-weight: 600;
            line-height: 1.5;
            text-align: center;
            text-decoration: none;
            cursor: pointer;
            border: 2px solid #007bff;
            border-radius: 0.5rem;
            background-color: #007bff;
            color: #fff;
            transition: all 0.2s ease-in-out;
        }

        .anipet-more-results-btn:hover {
            background-color: #0056b3;
            border-color: #0056b3;
            color: #fff;
            text-decoration: none;
            transform: translateY(-1px);
            box-shadow: 0 2px 8px rgba(0, 123, 255, 0.3);
        }

        /* Product Card */
        .anipet-product-card {
            display: flex;
            gap: 15px;
            padding: 15px;
            border: 1px solid #dee2e6;
            border-radius: 6px;
            transition: box-shadow 0.2s;
            background: white;
        }

        .anipet-product-card:hover {
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .anipet-product-image {
            flex-shrink: 0;
            width: 80px;
            height: 80px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #f8f9fa;
            border-radius: 4px;
            overflow: hidden;
        }

        .anipet-product-image img {
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
        }

        .anipet-product-info {
            flex: 1;
            min-width: 0;
        }

        .anipet-product-name-wrapper {
            display: flex;
            align-items: center;
            gap: 0;
            margin: 0 0 8px 0;
            flex-wrap: wrap;
        }
        
        .anipet-product-name {
            margin-right: 4px;
        }

        .anipet-product-name {
            margin: 0;
            font-size: 1rem;
            font-weight: 600;
            color: #333;
            line-height: 1.4;
            display: inline;
        }
        
        .anipet-google-images-link {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
            padding: 4px;
            border-radius: 4px;
            transition: all 0.2s ease;
            flex-shrink: 0;
            opacity: 0.7;
        }
        
        .anipet-google-images-link:hover {
            opacity: 1;
            background-color: #f0f0f0;
            transform: scale(1.1);
        }
        
        .anipet-google-images-link svg {
            width: 16px;
            height: 16px;
        }
        
        .anipet-copyable {
            cursor: pointer;
            transition: all 0.2s ease;
            user-select: none;
        }
        
        .anipet-copyable:hover {
            opacity: 0.8;
            text-decoration: underline;
        }
        
        .anipet-product-name.anipet-copyable:hover {
            color: #007bff;
        }

        .anipet-product-brand {
            margin: 0 0 6px 0;
            font-size: 0.875rem;
            color: #666;
        }

        .anipet-price-container {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            gap: 4px;
            margin: 0 0 6px 0;
        }

        .anipet-product-price {
            margin: 0;
            font-size: 1.1rem;
            font-weight: 700;
            color: #28a745;
        }

        .anipet-price-per-kg {
            margin: 0 0 10px 0;
            font-size: 0.85rem;
            color: #6c757d;
        }

        .anipet-price-diff {
            font-size: 0.9rem;
            font-weight: 600;
            padding: 2px 6px;
            border-radius: 4px;
            background-color: #f8f9fa;
            cursor: help;
        }

        .anipet-product-link {
            display: inline-block;
            margin-top: 8px;
        }

        /* Product Details */
        .anipet-product-details {
            margin: 8px 0;
            font-size: 0.875rem;
            color: #666;
        }

        .anipet-product-details p {
            margin: 4px 0;
            line-height: 1.4;
        }

        .anipet-product-barcode,
        .anipet-product-sku,
        .anipet-product-weight {
            margin: 4px 0;
            font-size: 0.875rem;
            color: #666;
        }
        
        .anipet-product-barcode.anipet-copyable:hover,
        .anipet-product-sku.anipet-copyable:hover {
            color: #007bff;
            background-color: #f0f8ff;
            border-radius: 3px;
            padding: 2px 4px;
            margin: 2px 0;
        }
        
        .anipet-copy-icon {
            font-size: 0.75em;
            opacity: 1;
            color: #3699ff;
            transition: all 0.2s ease;
            margin-right: 4px;
            margin-left: 4px;
        }
        
        .anipet-copyable:hover .anipet-copy-icon {
            opacity: 1;
            color: #3699ff;
        }

        /* Product Tags */
        .anipet-product-tags {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin: 10px 0;
        }

        .anipet-tag {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 0.75rem;
            font-weight: 500;
            line-height: 1.2;
            white-space: nowrap;
        }

        .anipet-tag-icon {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 12px;
            height: 12px;
            flex-shrink: 0;
        }

        .anipet-tag-icon svg {
            width: 100%;
            height: 100%;
        }

        .anipet-tag-text {
            display: inline-block;
        }

        /* Similarity Score Badge */
        .anipet-similarity-score {
            display: inline-block;
            padding: 6px 12px;
            border-radius: 16px;
            font-size: 0.875rem;
            font-weight: 600;
            margin: 10px 0;
            text-align: center;
            min-width: 80px;
        }

        /* Button Styles */
        .anipet-btn {
            display: inline-block;
            padding: 0.375rem 0.75rem;
            font-size: 0.875rem;
            font-weight: 400;
            line-height: 1.5;
            text-align: center;
            text-decoration: none;
            vertical-align: middle;
            cursor: pointer;
            border: 1px solid transparent;
            border-radius: 0.25rem;
            transition: all 0.15s ease-in-out;
        }

        .anipet-btn-primary {
            color: #fff;
            background-color: #007bff;
            border-color: #007bff;
        }

        .anipet-btn-primary:hover {
            background-color: #0056b3;
            border-color: #0056b3;
            color: #fff;
            text-decoration: none;
        }

        .anipet-btn-sm {
            padding: 0.25rem 0.5rem;
            font-size: 0.875rem;
        }

        /* Spinner */
        .anipet-spinner-border {
            display: inline-block;
            width: 2rem;
            height: 2rem;
            vertical-align: text-bottom;
            border: 0.25em solid currentColor;
            border-right-color: transparent;
            border-radius: 50%;
            animation: anipet-spinner-border 0.75s linear infinite;
        }

        @keyframes anipet-spinner-border {
            to { transform: rotate(360deg); }
        }

        .anipet-text-primary {
            color: #007bff !important;
        }

        .anipet-sr-only {
            position: absolute;
            width: 1px;
            height: 1px;
            padding: 0;
            margin: -1px;
            overflow: hidden;
            clip: rect(0, 0, 0, 0);
            white-space: nowrap;
            border-width: 0;
        }
        `;

        const style = document.createElement('style');
        style.id = 'anipet-popup-styles';
        style.textContent = css;
        document.head.appendChild(style);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();