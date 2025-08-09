// ==UserScript==
// @name         Lionwheel - Anipet Toolbox
// @namespace    anipet-toolbox-merged
// @version      13.7.0
// @description  AIO Script: Image Finder, Barcode Replacer, Previews, Responsive Views & more, all controlled from the Tampermonkey menu.
// @author       Adam Lee
// @source       https://github.com/AdamLee9186/anipet_app
// @match        *://*.lionwheel.com/*
// @updateURL    https://raw.githubusercontent.com/AdamLee9186/anipet/main/toolbox.js
// @downloadURL  https://raw.githubusercontent.com/AdamLee9186/anipet/main/toolbox.js
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @grant        window.close
// @connect      raw.githubusercontent.com
// @require      https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.3.0/papaparse.min.js
// @run-at       document-end
// ==/UserScript==

/* global jQuery */
/* global Papa */ // ENSURING PAPA IS GLOBAL

// DEBUG flag for production logging control
window.DEBUG_TOOLBOX = window.DEBUG_TOOLBOX || false;

// Clean up old debug logs from console
if (!window.DEBUG_TOOLBOX) {
  // Override console.debug to suppress debug logs in production
  const originalDebug = console.debug;
  console.debug = function() {
    // Only show debug logs if DEBUG_TOOLBOX is true
    if (window.DEBUG_TOOLBOX) {
      originalDebug.apply(console, arguments);
    }
  };
}

// Error handling for blocked resources
window.addEventListener('error', function(e) {
  if (e.target && e.target.src && e.target.src.includes('rollbar.min.js')) {
    // Suppress Rollbar errors - they're blocked by ad blockers
    e.preventDefault();
    return false;
  }
  if (e.target && e.target.src && e.target.src.includes('beacon.min.js')) {
    // Suppress Cloudflare analytics errors - they're blocked by ad blockers
    e.preventDefault();
    return false;
  }
  if (e.target && e.target.src && e.target.src.includes('fbevents.js')) {
    // Suppress Facebook pixel errors - they're blocked by ad blockers
    e.preventDefault();
    return false;
  }
  if (e.target && e.target.src && e.target.src.includes('clarity.ms')) {
    // Suppress Microsoft Clarity errors - they're blocked by ad blockers
    e.preventDefault();
    return false;
  }
  if (e.target && e.target.src && e.target.src.includes('google-analytics.com')) {
    // Suppress Google Analytics errors - they're blocked by ad blockers
    e.preventDefault();
    return false;
  }
}, true);

// === Copy feedback + guard ===
window._tmCopying = false;

function tmToast(msg = 'הועתק!', targetElement = null) {
  const el = document.createElement('div');
  el.textContent = msg;
  
  // Base styles
  el.style.cssText = 'position:fixed;' +
    'background:rgba(0,0,0,.85);color:#fff;padding:6px 10px;border-radius:6px;' +
    'font:12px/1.2 sans-serif;z-index:999999;pointer-events:none;opacity:0;transition:opacity .15s';
  
  // Position the toast near the target element if provided
  if (targetElement) {
    try {
      const rect = targetElement.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      // Calculate position - show above the element with some offset
      let left = rect.left + (rect.width / 2);
      let top = rect.top - 35; // Show above the element
      
      // Ensure toast doesn't go outside viewport bounds
      const toastWidth = 80; // Approximate toast width
      if (left - toastWidth/2 < 10) {
        left = toastWidth/2 + 10;
      } else if (left + toastWidth/2 > viewportWidth - 10) {
        left = viewportWidth - toastWidth/2 - 10;
      }
      
      if (top < 10) {
        top = rect.bottom + 10; // Show below if no space above
      }
      
      el.style.left = left + 'px';
      el.style.top = top + 'px';
      el.style.transform = 'translateX(-50%)';
    } catch (error) {
      // Fallback to center bottom if positioning fails
      el.style.left = '50%';
      el.style.bottom = '24px';
      el.style.transform = 'translateX(-50%)';
    }
  } else {
    // Default position at bottom center
    el.style.left = '50%';
    el.style.bottom = '24px';
    el.style.transform = 'translateX(-50%)';
  }
  
  document.body.appendChild(el);
  requestAnimationFrame(()=> el.style.opacity = '1');
  setTimeout(()=>{ el.style.opacity = '0'; setTimeout(()=> el.remove(), 150); }, 900);
}

function withCopying(fn){
  return (...args) => {
    window._tmCopying = true;
    try { return fn(...args); }
    finally { setTimeout(()=>{ window._tmCopying = false; }, 150); }
  };
}

// Throttling mechanism for heavy reflows
let _tmObsTick = 0, _tmObsScheduled = false;
function scheduleHeavy(fn){
  if (_tmObsScheduled) return;
  _tmObsScheduled = true;
  requestAnimationFrame(() => {
    _tmObsScheduled = false;
    fn();
  });
}

// Override fetch to handle blocked requests gracefully
const originalFetch = window.fetch;
window.fetch = function(...args) {
  return originalFetch.apply(this, args).catch(error => {
    // Check if it's a blocked request
    if (error.message && error.message.includes('ERR_BLOCKED_BY_CLIENT')) {
      // Suppress blocked request errors
      console.debug('Request blocked by client (likely ad blocker):', args[0]);
      return Promise.resolve(new Response('', { status: 200, statusText: 'OK' }));
    }
    throw error;
  });
};

// Override XMLHttpRequest to handle blocked requests gracefully
const originalXHROpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function(method, url, ...args) {
  this._url = url;
  return originalXHROpen.apply(this, [method, url, ...args]);
};

const originalXHRSend = XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.send = function(...args) {
  const xhr = this;
  const originalOnError = xhr.onerror;
  
  xhr.onerror = function(event) {
    // Check if it's a blocked request
    if (xhr._url && (
      xhr._url.includes('rollbar.min.js') ||
      xhr._url.includes('beacon.min.js') ||
      xhr._url.includes('fbevents.js') ||
      xhr._url.includes('clarity.ms') ||
      xhr._url.includes('google-analytics.com')
    )) {
      // Suppress blocked request errors
      console.debug('XHR Request blocked by client (likely ad blocker):', xhr._url);
      return;
    }
    
    // Call original error handler if it exists
    if (originalOnError) {
      originalOnError.call(xhr, event);
    }
  };
  
  return originalXHRSend.apply(this, args);
};

// Override script loading to handle blocked scripts gracefully
const originalCreateElement = document.createElement;
document.createElement = function(tagName) {
  const element = originalCreateElement.call(document, tagName);
  
  if (tagName.toLowerCase() === 'script') {
    const originalSetAttribute = element.setAttribute;
    element.setAttribute = function(name, value) {
      if (name === 'src') {
        // Check if it's a blocked script
        if (value && (
          value.includes('rollbar.min.js') ||
          value.includes('beacon.min.js') ||
          value.includes('fbevents.js') ||
          value.includes('clarity.ms') ||
          value.includes('google-analytics.com')
        )) {
          // Suppress blocked script loading
          console.debug('Script blocked by client (likely ad blocker):', value);
          return element;
        }
      }
      return originalSetAttribute.call(this, name, value);
    };
  }
  
  return element;
};

(function() {
    'use strict';

    // ---< WhatsApp Tab Closer >---
    if (window.location.hostname.includes('api.whatsapp.com')) {
        setTimeout(() => {
            window.close();
        }, 1000);
        return;
    }

    // ---< Merlog Panel View Highlighting >---
    GM_addStyle(`
        /* Offcanvas highlighting disabled - only panel_view will be highlighted */
        
        /* Green highlighting for "מוכן" status */
        .ready-highlight {
            background-color: #f0fff4 !important;
            border: 2px solid #9ae6b4 !important;
        }
        
        .ready-highlight .tab-content,
        .ready-highlight .tab-pane {
            background-color: #f0fff4 !important;
        }
        
        .ready-highlight a.ready-highlight {
            background-color: #dcfce7 !important;
            color: #166534 !important;
            padding: 2px 4px !important;
            border-radius: 3px !important;
            text-decoration: none !important;
        }
        
        .ready-highlight a.ready-highlight:hover {
            background-color: #bbf7d0 !important;
            color: #15803d !important;
        }
        
        .ready-highlight span.ready-highlight,
        .ready-highlight div.ready-highlight,
        .ready-highlight p.ready-highlight {
            background-color: #dcfce7 !important;
            color: #166534 !important;
            padding: 1px 3px !important;
            border-radius: 2px !important;
            font-weight: bold !important;
        }
        
        /* Table row green highlighting */
        tr.ready-row-highlight {
            background-color: #f0fff4 !important;
        }
        
        td.ready-highlight {
            background-color: #dcfce7 !important;
            border-radius: 4px;
            padding: 4px 8px;
            margin: 2px 0;
        }
        
        td.ready-highlight:hover {
            background-color: #bbf7d0 !important;
        }
    `);
    // ---< Main Anipet Toolbox Script >---
    const SCRIPT_NAME = "Lionwheel - Anipet Toolbox";
    const SCRIPT_VERSION = "13.6.0"; // Fixed to match @version
    console.log(`✅ ${SCRIPT_NAME} v${SCRIPT_VERSION} loaded.`);

    // ---< Constants >---
    const IMAGE_FINDER_CSV_URL = "https://raw.githubusercontent.com/AdamLee9186/anipet/main/anipet_master_catalog_v1.csv";
    const BARCODE_REPLACER_CSV_URL = 'https://raw.githubusercontent.com/AdamLee9186/anipet/main/backoffice_catalog.csv';
    const PLACEHOLDER_IMG_URL = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="70" viewBox="0 0 80 70"><rect width="80" height="70" fill="#fafafa"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="14px" fill="#d4d4d4">X</text></svg>');

    const SETTINGS_KEY = 'anipet_toolbox_settings';
    const PRODUCT_DATA_CACHE_KEY = 'anipet_product_data_cache';
    const IMAGE_CACHE_TIMESTAMP_KEY = 'anipet_image_cache_timestamp';
    const BARCODE_DATA_CACHE_KEY = 'anipet_barcode_data_cache';
    const BARCODE_CACHE_TIMESTAMP_KEY = 'anipet_barcode_cache_timestamp';
    const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

    // ---< Global State >---
    let settings = {
        showImages: true,
        replaceBarcodes: true,
        enablePreview: true,
        hideColumns: true,
        enableResponsive: true,
        addWhatsApp: true,
        highlightMerlog: true,
    };
    let productDataCache = null; // For Image Finder
    let itemCodeToBarcodeMap = null; // For Barcode Replacer
    let descriptionToBarcodeMap = null; // For Barcode Replacer

    // Initialize loading flags for enhanced search
    window.productDataLoading = false;
    window.barcodeDataLoading = false;

    // ---< Utility Functions >---
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func.apply(this, args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    function safeExecute(func, fallback = null) {
        try {
            return func();
        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Error in ${func.name || 'anonymous'}:`, error);
            return fallback;
        }
    }

    function getElementPath(element) {
        try {
            if (!element) return '';
            const path = [];
            let current = element;
            while (current && current !== document.body) {
                let selector = current.tagName.toLowerCase();
                if (current.id) {
                    selector += `#${current.id}`;
                } else if (current.className) {
                    const classes = current.className.split(' ').filter(c => c).join('.');
                    if (classes) selector += `.${classes}`;
                }
                path.unshift(selector);
                current = current.parentElement;
            }
            return path.join(' > ');
        } catch (error) {
            return 'error getting path';
        }
    }

    // ---< Cache Compression Functions >---
    function compressCache(data) {
        try {
            // Use a more robust encoding method
            const jsonString = JSON.stringify(data);
            // Use encodeURIComponent to handle special characters
            return encodeURIComponent(jsonString);
        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Error compressing cache:`, error);
            return null;
        }
    }

    function decompressCache(compressed) {
        try {
            if (!compressed) return null;
            // Decode the URI component first
            const decoded = decodeURIComponent(compressed);
            return JSON.parse(decoded);
        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Error decompressing cache:`, error);
            return null;
        }
    }

    // ---< Settings Module >---
    const defaultSettings = {
        showImages: true,
        replaceBarcodes: true,
        enablePreview: true,
        hideColumns: true,
        enableResponsive: true,
        addWhatsApp: true,
        highlightMerlog: true,
    };


    async function loadSettings() {
        try {
            const savedSettings = await GM_getValue(SETTINGS_KEY, {});
            settings = { ...defaultSettings, ...savedSettings };
            updateBodyClasses();
        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Error loading settings:`, error);
            // Keep default settings if loading fails
            settings = { ...defaultSettings };
        }
    }

    function updateBodyClasses() {
        if(settings && settings.enableResponsive) {
            document.body.classList.add('tampermonkey-responsive-enabled');
        }
        if(settings && settings.hideColumns) {
            document.body.classList.add('tampermonkey-hide-columns-enabled');
        }
    }

    function registerMenuCommands() {
        try {
            const options = {
                showImages: '🖼️ הצג תמונות וקישורים',
                replaceBarcodes: '📊 החלף מק"ט בברקוד',
                enablePreview: '👁️ אפשר תצוגה מקדימה מהירה',
                hideColumns: '🙈 הסתר עמודות מיותרות',
                enableResponsive: '📱 אפשר תצוגה רספונסיבית למובייל',
                addWhatsApp: '💬 הוסף כפתורי WhatsApp',
                highlightMerlog: '🔴 הדגש שורות מרלוג'
            };

            function createMenuCommandFunc(k) {
                return async () => {
                    try {
                        const newSettings = { ...settings, [k]: !settings[k] };
                        await GM_setValue(SETTINGS_KEY, newSettings);
                        location.reload();
                    } catch (error) {
                        console.error(`[${SCRIPT_NAME}] Error updating setting ${k}:`, error);
                    }
                };
            }

            for (const [key, label] of Object.entries(options)) {
                const statusIcon = (settings && settings[key]) ? '✅' : '❌';
                GM_registerMenuCommand(`${statusIcon} ${label}`, createMenuCommandFunc(key));
            }

                    GM_registerMenuCommand('🔄 רענן קטלוגים', () => {
                try {
                    GM_deleteValue(PRODUCT_DATA_CACHE_KEY);
                    GM_deleteValue(IMAGE_CACHE_TIMESTAMP_KEY);
                    GM_deleteValue(BARCODE_DATA_CACHE_KEY);
                    GM_deleteValue(BARCODE_CACHE_TIMESTAMP_KEY);
                    alert('קטלוגים נמחקו מהזיכרון. רענן את הדף כדי לטעון מחדש.');
                } catch (error) {
                    console.error(`[${SCRIPT_NAME}] Error clearing cache:`, error);
                }
            });

            GM_registerMenuCommand('🔄 רענן הדגשת "מוכן"', () => {
                try {
                    console.log(`[${SCRIPT_NAME}] Manually refreshing ready highlighting...`);
                    debouncedHighlightReadyRows();
                } catch (error) {
                    console.error(`[${SCRIPT_NAME}] Error manually refreshing ready highlighting:`, error);
                }
            });

            GM_registerMenuCommand('🔍 בדוק קובץ ברקודים', async () => {
                try {
                    console.log(`[${SCRIPT_NAME}] Manually checking barcode CSV file...`);
                    const response = await new Promise((resolve, reject) => {
                        GM_xmlhttpRequest({
                            method: "GET",
                            url: BARCODE_REPLACER_CSV_URL,
                            onload: resolve,
                            onerror: reject
                        });
                    });

                    if (response.status >= 200 && response.status < 300) {
                        const csvText = response.responseText;
                        console.log(`[${SCRIPT_NAME}] CSV file loaded successfully. Length: ${csvText.length} characters`);

                        // Search for the specific product
                        const searchTerm = "רויאל קנין פאוץ' לחתול בוגר אינסטינקטיב ברוטב 85 גרם";
                        const lines = csvText.split('\n');
                        console.log(`[${SCRIPT_NAME}] CSV has ${lines.length} lines`);

                        let found = false;
                        lines.forEach((line, index) => {
                            if (line.toLowerCase().includes(searchTerm.toLowerCase())) {
                                console.log(`[${SCRIPT_NAME}] Found product in line ${index + 1}:`, line);
                                found = true;
                            }
                        });

                        if (!found) {
                            console.log(`[${SCRIPT_NAME}] Product not found in CSV. Searching for partial matches...`);
                            const searchWords = searchTerm.toLowerCase().split(' ').filter(word => word.length > 2);
                            lines.forEach((line, index) => {
                                const lineLower = line.toLowerCase();
                                const matchCount = searchWords.filter(word => lineLower.includes(word)).length;
                                if (matchCount >= 3) {
                                    console.log(`[${SCRIPT_NAME}] Partial match (${matchCount} words) in line ${index + 1}:`, line);
                                }
                            });
                        }

                        alert(`בדיקת קובץ ברקודים הושלמה. ראה את הלוג בקונסול לפרטים.`);
                    } else {
                        alert(`שגיאה בטעינת קובץ ברקודים: ${response.status} - ${response.statusText}`);
                    }
                } catch (error) {
                    console.error(`[${SCRIPT_NAME}] Error checking barcode CSV:`, error);
                    alert(`שגיאה בבדיקת קובץ ברקודים: ${error.message}`);
                }
            });

            GM_registerMenuCommand('🔍 חפש ברקודים שצריכים החלפה', () => {
                try {
                    console.log(`[${SCRIPT_NAME}] Searching for barcodes that need replacement...`);

                    if (!itemCodeToBarcodeMap || !descriptionToBarcodeMap) {
                        alert('מפות הברקודים לא נטענו עדיין. נסה שוב אחרי שהדף נטען במלואו.');
                        return;
                    }

                    // Find all elements that might need barcode replacement
                    const allSkuElements = document.querySelectorAll('td.text-nowrap, span.text-muted.font-weight-bold, input.order-item-sku');
                    let replacementsFound = 0;
                    let missingBarcodesFound = 0;
                    let totalChecked = 0;

                    allSkuElements.forEach((el, index) => {
                        if (!el.hasAttribute('data-original-sku')) return;

                        const sku = el.getAttribute('data-original-sku');
                        const nameContainer = el.closest('tr, .nested-fields, .pick-order-item-row');
                        const nameEl = nameContainer?.querySelector('.order-item-name, .text-dark-75, td:nth-child(10), td:nth-child(3)');
                        const name = nameEl?.value || nameEl?.textContent.trim() || '';

                        if (sku && name) {
                            totalChecked++;
                            const barcode = findBarcode(sku, name);

                            if (barcode && barcode !== sku) {
                                replacementsFound++;
                                console.log(`[${SCRIPT_NAME}] Found barcode that needs replacement:`, {
                                    name: name,
                                    originalSku: sku,
                                    newBarcode: barcode,
                                    element: el
                                });
                            } else if (!barcode) {
                                missingBarcodesFound++;
                                console.log(`[${SCRIPT_NAME}] Found product with missing barcode:`, {
                                    name: name,
                                    sku: sku,
                                    element: el
                                });
                            }
                        }
                    });

                    console.log(`[${SCRIPT_NAME}] Barcode search completed:`);
                    console.log(`[${SCRIPT_NAME}] Total elements checked: ${totalChecked}`);
                    console.log(`[${SCRIPT_NAME}] Replacements found: ${replacementsFound}`);
                    console.log(`[${SCRIPT_NAME}] Missing barcodes found: ${missingBarcodesFound}`);

                    let message = `נבדקו ${totalChecked} פריטים:\n`;
                    message += `• ברקודים שצריכים החלפה: ${replacementsFound}\n`;
                    message += `• מוצרים עם ברקוד חסר: ${missingBarcodesFound}\n`;
                    message += `• מוצרים עם ברקוד נכון: ${totalChecked - replacementsFound - missingBarcodesFound}`;

                    alert(message);

                } catch (error) {
                    console.error(`[${SCRIPT_NAME}] Error searching for barcode replacements:`, error);
                    alert(`שגיאה בחיפוש ברקודים: ${error.message}`);
                }
            });

            // מחק את הפקודה הלא רצויה מהתפריט
            // GM_registerMenuCommand('🔧 תקן תצוגת ברקוד רויאל קנין', () => { ... });
        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Error registering menu commands:`, error);
        }
    }


    // ---< Data Loading Module >---

    async function getProductData(callback) {
        // Prevent multiple simultaneous calls
        if (window.productDataLoading) return;
        window.productDataLoading = true;

        try {

            const cachedData = await GM_getValue(PRODUCT_DATA_CACHE_KEY, null);
            const cachedTimestamp = await GM_getValue(IMAGE_CACHE_TIMESTAMP_KEY, 0);
            if (cachedData && (Date.now() - cachedTimestamp < CACHE_DURATION_MS)) {
                // Try to decompress cached data
                const decompressed = decompressCache(cachedData);
                if (decompressed) {
                    productDataCache = decompressed;
                    if (callback) callback();
                    return;
                }
            }

            updateStatus('טוען קטלוג מאסטר...', 'orange');
            const response = await new Promise((resolve, reject) => {
                GM_xmlhttpRequest({ method: "GET", url: IMAGE_FINDER_CSV_URL, onload: resolve, onerror: reject });
            });
            productDataCache = processImageCsvText(response.responseText);

            // Compress data before saving
            const compressed = compressCache(productDataCache);
            if (compressed) {
                await GM_setValue(PRODUCT_DATA_CACHE_KEY, compressed);
            } else {
                // Fallback to uncompressed if compression fails
                await GM_setValue(PRODUCT_DATA_CACHE_KEY, productDataCache);
            }
            await GM_setValue(IMAGE_CACHE_TIMESTAMP_KEY, Date.now());
            updateStatus(`קטלוג מאסטר נטען: ${productDataCache.length} פריטים.`, 'green', true);
        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Error loading image CSV:`, error);
            productDataCache = [];
            updateStatus('שגיאה בטעינת קטלוג מאסטר.', 'red');
        } finally {
            window.productDataLoading = false;
            if (callback) callback();
        }
    }

    function processImageCsvText(text) {
        try {
            if (!text) return [];

            const lines = text.trim().split("\n"); if (lines.length <= 1) return [];

            const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());

            const csvSkuIndex = headers.indexOf("skus");
            const csvImageIndex = headers.indexOf("image url");
            const csvUrlIndex = headers.indexOf("product url");
            const csvProductNameIndex = headers.indexOf("product name");
            const csvPriceIndex = headers.indexOf("price");


            if (csvSkuIndex === -1 || csvImageIndex === -1) {
                return [];
            }

            const processed = lines.slice(1).map(line => {
                const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
                const skusString = (parts[csvSkuIndex] || "").trim().replace(/^"|"$/g, '');
                return {
                    skus: skusString ? skusString.split(',').map(s => normalizeSku(s.trim())).filter(Boolean) : [],
                    image: (parts[csvImageIndex] || "").trim().replace(/^"|"$/g, ''),
                    link: csvUrlIndex !== -1 ? (parts[csvUrlIndex] || "").trim().replace(/^"|"$/g, '') : '',
                    productName: csvProductNameIndex !== -1 ? (parts[csvProductNameIndex] || "").trim().replace(/^"|"$/g, '') : '',
                    price: csvPriceIndex !== -1 ? (parts[csvPriceIndex] || "").trim().replace(/^"|"$/g, '') : null
                };
            }).filter(p => p.skus.length > 0 && p.image);

            return processed;
        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Error processing image CSV text:`, error);
            return [];
        }
    }

    async function loadBarcodeCsv(callback) {
        // Prevent multiple simultaneous calls
        if (window.barcodeDataLoading) return;
        window.barcodeDataLoading = true;

        try {
            const cachedData = await GM_getValue(BARCODE_DATA_CACHE_KEY, null);
            const cachedTimestamp = await GM_getValue(BARCODE_CACHE_TIMESTAMP_KEY, 0);
            if (cachedData && (Date.now() - cachedTimestamp < CACHE_DURATION_MS)) {
                processBarcodeData(cachedData);
                if (callback) callback();
                    return;
            }

            updateStatus('טוען קטלוג ברקודים...', 'orange');
            GM_xmlhttpRequest({
                method: "GET",
                url: BARCODE_REPLACER_CSV_URL,
                onload: async (response) => {
                    try {
                        if (response.status === 200) {
                            const data = parseBarcodeCsv(response.responseText);
                            if (data) {
                                    await GM_setValue(BARCODE_DATA_CACHE_KEY, data);
                                await GM_setValue(BARCODE_CACHE_TIMESTAMP_KEY, Date.now());
                                processBarcodeData(data);
                            } else {
                                console.error(`[${SCRIPT_NAME}] Failed to parse CSV data`);
                            }
                        } else {
                            updateStatus(`שגיאה בטעינת CSV ברקודים: ${response.statusText}`, 'red');
                            console.error(`[${SCRIPT_NAME}] HTTP error: ${response.status} - ${response.statusText}`);
                        }
                    } catch (error) {
                        console.error(`[${SCRIPT_NAME}] Error processing barcode CSV:`, error);
                        updateStatus('שגיאה בעיבוד קובץ הברקודים.', 'red');
                    } finally {
                        window.barcodeDataLoading = false;
                        if (callback) callback();
                    }
                },
                onerror: (error) => {
                    console.error(`[${SCRIPT_NAME}] Network error loading CSV:`, error);
                    window.barcodeDataLoading = false;
                    updateStatus('שגיאת רשת בטעינת CSV ברקודים.', 'red');
                    if (callback) callback();
                }
            });
        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Error loading barcode CSV:`, error);
            window.barcodeDataLoading = false;
            updateStatus('שגיאה בטעינת קובץ הברקודים.', 'red');
            if (callback) callback();
        }
    }

    function processBarcodeData(data) {
        try {
            if (!data) return;
            itemCodeToBarcodeMap = new Map(data.itemCodeToBarcodeMap);
            descriptionToBarcodeMap = new Map(data.descriptionToBarcodeMap);

            updateStatus(`קטלוג ברקודים נטען: ${descriptionToBarcodeMap.size} פריטים.`, 'green', true);
        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Error processing barcode data:`, error);
        }
    }

    function parseBarcodeCsv(csvString) {
        try {
            if (!csvString) return null;

            let localItemCodeToBarcodeMap = new Map();
            let localDescriptionToBarcodeMap = new Map();
            let success = false;

            Papa.parse(csvString, {
                header: true, skipEmptyLines: true, trimHeaders: true,
                complete: (results) => {
                    try {
                        const headers = results.meta.fields || Object.keys(results.data[0]);

                        const itemCodeKey = headers.find(h => h.trim() === 'קוד פריט');
                        const descKey = headers.find(h => h.trim() === 'תאור פריט');
                        const barcodeKey = headers.find(h => h.trim() === 'ברקוד');

                        if (!descKey || !barcodeKey || !itemCodeKey) {
                            updateStatus(`שגיאה: עמודות חסרות בקובץ הברקודים.`, 'red');
                            console.error(`[${SCRIPT_NAME}] Missing required columns in CSV`);
                            return;
                        }

                        let processedCount = 0;
                        results.data.forEach((row, index) => {
                            const itemCode = row[itemCodeKey]?.trim();
                            const desc = row[descKey]?.trim();
                            const barcode = row[barcodeKey]?.trim();

                            if (itemCode) {
                                localItemCodeToBarcodeMap.set(itemCode, barcode || null);
                                processedCount++;
                            }
                            if (desc) {
                                localDescriptionToBarcodeMap.set(desc, barcode || null);
                                processedCount++;
                            }
                        });

                        success = true;
                    } catch (error) {
                        console.error(`[${SCRIPT_NAME}] Error in Papa.parse complete callback:`, error);
                    }
                },
                error: (error) => {
                    updateStatus(`שגיאה בפענוח קובץ הברקודים: ${error.message}`, 'red');
                    console.error(`[${SCRIPT_NAME}] Papa.parse error:`, error);
                }
            });
            return success ? { itemCodeToBarcodeMap: Array.from(localItemCodeToBarcodeMap.entries()), descriptionToBarcodeMap: Array.from(localDescriptionToBarcodeMap.entries()) } : null;
        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Error parsing barcode CSV:`, error);
            return null;
        }
    }

    // ---< Helper Functions >---
    function normalizeSku(sku) {
        try {
            if (typeof sku !== 'string') return '';
            const normalized = sku.replace(/\D/g, '');
            return normalized;
        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Error normalizing SKU:`, error);
            return '';
        }
    }

    function findImageMatch(sku, productName) {
        try {
            if (!productDataCache) {
                return null;
            }

            if (sku && !String(sku).trim().startsWith('0')) {
                const normalizedSku = normalizeSku(sku);
                if (normalizedSku) {
                    const skuMatch = productDataCache.find(p => p.skus.includes(normalizedSku));
                    if (skuMatch) {
                        return skuMatch;
                    }
                }
            }

            if (productName) {
                const pageProductNameNormalized = productName.toLowerCase().trim();
                const nameMatch = productDataCache.find(p => p.productName && p.productName.toLowerCase().trim() === pageProductNameNormalized);
                if (nameMatch) {
                    return nameMatch;
                }
            }
            return null;
        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Error finding image match:`, error);
            return null;
        }
    }

    // Expose functions to window for enhanced search
    window.findImageMatch = findImageMatch;

    function findBarcode(sku, name) {
        try {
            if (!itemCodeToBarcodeMap || !descriptionToBarcodeMap) {
                return null;
            }

            // Try to find by SKU first (only if SKU is not null/empty)
            if (sku && sku.trim() && itemCodeToBarcodeMap.has(sku)) {
                const barcode = itemCodeToBarcodeMap.get(sku);
                if (barcode) {
                    return barcode;
                }
            }

            // Try to find by exact name match
            if (name && name.trim() && descriptionToBarcodeMap.has(name)) {
                const barcode = descriptionToBarcodeMap.get(name);
                if (barcode) {
                    return barcode;
                }
            }

            // Try to find by partial name match (case insensitive)
            if (name && name.trim()) {
                const normalizedName = name.toLowerCase().trim();
                for (const [productName, barcode] of descriptionToBarcodeMap.entries()) {
                    const normalizedProductName = productName.toLowerCase().trim();
                    if (normalizedProductName === normalizedName) {
                        return barcode;
                    }
                }

                // Try partial match (contains)
                for (const [productName, barcode] of descriptionToBarcodeMap.entries()) {
                    const normalizedProductName = productName.toLowerCase().trim();
                    if (normalizedProductName.includes(normalizedName) || normalizedName.includes(normalizedProductName)) {
                        return barcode;
                    }
                }
            }
            return null;
        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Error finding barcode:`, error);
            return null;
        }
    }

    // Expose functions to window for enhanced search
    window.findBarcode = findBarcode;

    function getFullSizeImageUrl(thumbnailUrl) {
        try {
            if (!thumbnailUrl || typeof thumbnailUrl !== 'string') return '';

            if (thumbnailUrl.includes('cdn.modulus.co.il')) { return thumbnailUrl.split('?')[0]; }
            if (thumbnailUrl.includes('www.gag-lachayot.co.il')) { return thumbnailUrl.replace(/-\d+x\d+(\.[a-zA-Z0-9]+(?:[?#].*)?)$/, '$1').replace(/-\d+x\d+$/, ''); }
            if (thumbnailUrl.includes('www.all4pet.co.il')) { return thumbnailUrl.replace(/_small(\.[a-zA-Z0-9]+(?:[?#].*)?)$/, '$1').replace(/_small$/, ''); }
            if (thumbnailUrl.includes('d3m9l0v76dty0.cloudfront.net')) { return thumbnailUrl.replace('/show/', '/extra_large/').replace('/index/', '/extra_large/').replace('/large/', '/extra_large/'); }
            if (thumbnailUrl.includes('just4pet.co.il')) {
                const parts = thumbnailUrl.split('/'); const filenameWithQuery = parts.pop(); const filenameParts = filenameWithQuery.split('?');
                const filename = filenameParts[0]; const query = filenameParts.length > 1 ? `?${filenameParts[1]}` : '';
                if (filename.startsWith('tn_')) { const newFilename = filename.substring(3); return parts.join('/') + '/' + newFilename + query; }
            }
            return thumbnailUrl;
        } catch (e) {
            console.warn(`[${SCRIPT_NAME}] ⚠️ Error processing thumbnail URL, returning original:`, thumbnailUrl, e);
            return thumbnailUrl;
        }
    }

    // New function for optimized image URLs based on screen size
    function getOptimizedImageUrl(originalUrl, targetWidth = null) {
        try {
            if (!originalUrl || typeof originalUrl !== 'string') return originalUrl;

            // If no target width specified, use screen width
            if (!targetWidth) {
                targetWidth = Math.min(window.innerWidth, 1200); // Max 1200px for performance
            }

            // For different image providers, add size parameters
            if (originalUrl.includes('cdn.modulus.co.il')) {
                return `${originalUrl.split('?')[0]}?w=${targetWidth}&h=${Math.round(targetWidth * 0.75)}&fit=crop`;
            }

            if (originalUrl.includes('www.gag-lachayot.co.il')) {
                // Try to get a larger version if available
                const baseUrl = originalUrl.replace(/-\d+x\d+(\.[a-zA-Z0-9]+(?:[?#].*)?)$/, '$1').replace(/-\d+x\d+$/, '');
                return `${baseUrl}?w=${targetWidth}`;
            }

            if (originalUrl.includes('www.all4pet.co.il')) {
                const baseUrl = originalUrl.replace(/_small(\.[a-zA-Z0-9]+(?:[?#].*)?)$/, '$1').replace(/_small$/, '');
                return `${baseUrl}?w=${targetWidth}`;
            }

            if (originalUrl.includes('d3m9l0v76dty0.cloudfront.net')) {
                // This provider already has size variants
                return originalUrl;
            }

            if (originalUrl.includes('just4pet.co.il')) {
                const parts = originalUrl.split('/');
                const filenameWithQuery = parts.pop();
                const filenameParts = filenameWithQuery.split('?');
                const filename = filenameParts[0];
                const query = filenameParts.length > 1 ? `&${filenameParts[1]}` : '';

                if (filename.startsWith('tn_')) {
                    const newFilename = filename.substring(3);
                    return `${parts.join('/')}/${newFilename}?w=${targetWidth}${query}`;
                }
            }

            // For other URLs, try to add width parameter
            const separator = originalUrl.includes('?') ? '&' : '?';
            return `${originalUrl}${separator}w=${targetWidth}`;

        } catch (e) {
            console.warn(`[${SCRIPT_NAME}] ⚠️ Error optimizing image URL, returning original:`, originalUrl, e);
            return originalUrl;
        }
    }

    function findProductTableInScope(scope) {
        try {
            if (!scope) return null;

            const allTables = scope.querySelectorAll('table');

            for (const table of allTables) {
                const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim());

                // שיפור: זיהוי גמיש יותר של כותרות - מזהה גם "שם מוצר", "מקט", "מספר קטלוגי" וכו'
                const hasSku = headers.some(h => h.includes('מק'));
                const hasName = headers.some(h => h.includes('שם'));

                // Check if this is an orders/deliveries table (should be excluded)
                const isOrdersTable = headers.some(h => 
                    h.includes('משלוח') || // delivery
                    h.includes('הזמנה') || // order  
                    h.includes('סטטוס') || // status
                    h.includes('ליקוט') || // picking
                    h.includes('נהג') || // driver
                    h.includes('כתובת') || // address
                    h.includes('עיר') || // city
                    h.includes('טלפון') // phone
                );

                // Also check if the table has the main orders table classes
                const isMainOrdersTable = table.closest('.dataTables_wrapper') && 
                                         table.closest('.dt-bootstrap4');

                if (hasSku && hasName && !isOrdersTable && !isMainOrdersTable) {
                    return table;
                }
            }
            return null;
        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Error finding product table:`, error);
            return null;
        }
    }

    // ---< UI & DOM Manipulation >---

    let scriptStatusElement = null;
    function createStatusNotifier() {
        try {
            if (document.getElementById('scriptStatusNotifier')) return;
            scriptStatusElement = document.createElement('div');
            scriptStatusElement.id = 'scriptStatusNotifier';
            document.body.appendChild(scriptStatusElement);
            // Ensure it's hidden initially unless a message is set
            scriptStatusElement.style.opacity = '0';
            scriptStatusElement.style.transition = 'opacity 0.5s ease-in-out';
        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Error creating status notifier:`, error);
        }
    }
  function updateStatus(message, color = '#333', temporary = false) {
  try {
    // רק הודעות אדומות (שגיאה) יעברו
    if (color !== 'red') return;

    // שאר הקוד שלך נשאר כמו שהוא:
    if (!scriptStatusElement) createStatusNotifier();
    if (!scriptStatusElement) return; // Double check

    scriptStatusElement.textContent = message;
    scriptStatusElement.style.color = color;
    scriptStatusElement.style.borderColor = color;
    scriptStatusElement.style.opacity = '0.9';
    if (temporary) setTimeout(() => { scriptStatusElement.style.opacity = '0' }, 4000);
    console.log(`[${SCRIPT_NAME}] ${message}`);
  } catch (error) {
    console.error(`[${SCRIPT_NAME}] Error updating status:`, error);
  }
}

function showGalleryOverlay(galleryItems, startIndex) {
    try {
        // Prevent multiple galleries from being opened simultaneously
        if (document.getElementById('tampermonkey-gallery-overlay')) {
            console.warn('Gallery already open, ignoring new request');
            return;
        }
        
        // Image cache for performance with memory management
        const imageCache = new Map();
        let preloadedImages = new Set();
        
        // Memory management: limit cache size to prevent memory leaks
        const MAX_CACHE_SIZE = 10;
        const cleanupImageCache = () => {
            if (imageCache.size > MAX_CACHE_SIZE) {
                const entries = Array.from(imageCache.entries());
                // Remove oldest entries
                for (let i = 0; i < entries.length - MAX_CACHE_SIZE; i++) {
                    const [key] = entries[i];
                    imageCache.delete(key);
                    preloadedImages.delete(key);
                }
            }
        };

        function handleSwipe() {
            try {
                const diff = startX - endX;
                const threshold = 50; // swipe sensitivity in px

                if (Math.abs(diff) > threshold) {
                    if (diff > 0) {
                        navigate(-1); // swipe left → next
                    } else {
                        navigate(1); // swipe right → prev
                    }
                }
            } catch (error) {
                console.warn('Gallery swipe error:', error);
            }
        }

        if (!galleryItems || galleryItems.length === 0) return;
        
        // Remove any existing gallery overlay to prevent conflicts
        const existingOverlay = document.getElementById('tampermonkey-gallery-overlay');
        if (existingOverlay) {
            existingOverlay.remove();
        }

    let currentIndex = startIndex;
    let startX = 0;
    let endX = 0;
    let isZoomed = false;
    let zoomLevel = 1;
    
    // Zoom-to-point variables
    let zoomOriginX = 0;
    let zoomOriginY = 0;
    
    // Drag/pan variables
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragOffsetX = 0;
    let dragOffsetY = 0;
    
    // Image wrapper for proper clipping during zoom/pan
    let imageWrapper = null;
    
    // Pinch-to-zoom variables
    let initialDistance = 0;
    let initialZoom = 1;
    let isPinching = false;
    let wasPinching = false; // Track if we were pinching to prevent swipe interference
    
    // Timeout management to prevent memory leaks
    let navigationTimeout = null;
    
    const overlay = document.createElement('div');
    overlay.id = 'tampermonkey-gallery-overlay';
    overlay.style.width = '100%';
    overlay.style.height = '100vh';
    overlay.style.maxHeight = '100vh';
    overlay.style.boxSizing = 'border-box';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.alignItems = 'stretch';
    overlay.style.justifyContent = 'flex-start';
    overlay.style.background = 'rgba(0,0,0,0.88)';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.zIndex = '20000';
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.3s ease';
    overlay.style.overflow = 'hidden';
    // Don't make it focusable by default - only when needed

    const imgElement = document.createElement('img');
    // עיצוב תמונה - ללא borderRadius כי זה יהיה על ה-wrapper
    imgElement.style.maxWidth = '100%';
    imgElement.style.maxHeight = '100%';
    imgElement.style.objectFit = 'contain';
    imgElement.style.display = 'block';
    imgElement.style.transition = 'transform 0.3s ease';
    imgElement.style.pointerEvents = 'none'; // כדי למנוע בעיות תפעול
    imgElement.style.userSelect = 'none';
    
    // Loading indicator
    const loadingIndicator = document.createElement('div');
    loadingIndicator.className = 'gallery-loading';
    loadingIndicator.innerHTML = '<div class="spinner"></div>';

    const productNameElement = document.createElement('h3');
    productNameElement.className = 'gallery-product-name';
    // עיצוב שם מוצר
    productNameElement.style.zIndex = '10';
    productNameElement.style.position = 'relative';
    productNameElement.style.background = 'transparent';
    productNameElement.style.color = 'white';
    productNameElement.style.padding = '6px 12px';
    productNameElement.style.borderTopLeftRadius = '8px';
    productNameElement.style.borderTopRightRadius = '8px';
    
    const productInfoElement = document.createElement('div');
    productInfoElement.className = 'gallery-product-info';
    // עיצוב מק"ט ומחיר
    productInfoElement.style.zIndex = '10';
    productInfoElement.style.position = 'relative';
    productInfoElement.style.background = 'transparent';
    productInfoElement.style.color = 'white';
    productInfoElement.style.padding = '4px 8px';
    productInfoElement.style.marginBottom = '8px';
    const skuElement = document.createElement('span');
    skuElement.className = 'gallery-sku';
    const priceElement = document.createElement('span');
    priceElement.className = 'gallery-price';
    
    const captionElement = document.createElement('div');
    captionElement.className = 'gallery-caption';
    const counterElement = document.createElement('div');
    counterElement.className = 'gallery-counter';

    // Thumbnails container instead of dots
    const thumbnailsContainer = document.createElement('div');
    thumbnailsContainer.className = 'gallery-thumbnails';

    const prevButton = document.createElement('button');
    prevButton.className = 'gallery-nav prev';
    prevButton.innerHTML = '&#10094;';
    const nextButton = document.createElement('button');
    nextButton.className = 'gallery-nav next';
    nextButton.innerHTML = '&#10095;';
    const closeButton = document.createElement('button');
    closeButton.className = 'gallery-close';
    closeButton.innerHTML = '&times;';

    // Zoom controls - removed as requested

    // Create top info container
    const topInfoContainer = document.createElement('div');
    topInfoContainer.className = 'gallery-top-info';
    topInfoContainer.style.padding = '12px';
    topInfoContainer.style.background = 'transparent';
    topInfoContainer.style.color = '#fff';
    topInfoContainer.style.borderBottom = 'none';
    topInfoContainer.style.flexShrink = '0';
    topInfoContainer.style.boxSizing = 'border-box';

    // Add product name and info to top container
    productInfoElement.append(skuElement, priceElement);
    topInfoContainer.appendChild(productNameElement);
    topInfoContainer.appendChild(productInfoElement);

    // Create image container with proper structure
    const galleryImageContainer = document.createElement('div');
    galleryImageContainer.className = 'gallery-image-container';
    galleryImageContainer.style.position = 'relative';
    galleryImageContainer.style.flex = '1';
    galleryImageContainer.style.display = 'flex';
    galleryImageContainer.style.alignItems = 'center';
    galleryImageContainer.style.justifyContent = 'center';
    galleryImageContainer.style.padding = '16px';
    galleryImageContainer.style.width = '100%';
    galleryImageContainer.style.minHeight = '0'; // Important for flex child
    galleryImageContainer.style.borderRadius = '12px';
    galleryImageContainer.style.overflow = 'hidden';

    // Create image wrapper for proper clipping during zoom/pan
    imageWrapper = document.createElement('div');
    imageWrapper.style.position = 'relative';
    imageWrapper.style.width = '100%';
    imageWrapper.style.height = '100%';
    imageWrapper.style.borderRadius = '12px';
    imageWrapper.style.overflow = 'hidden';
    imageWrapper.style.display = 'flex';
    imageWrapper.style.alignItems = 'center';
    imageWrapper.style.justifyContent = 'center';
    imageWrapper.style.cursor = 'grab'; // Add cursor for drag indication
    imageWrapper.style.boxSizing = 'border-box'; // Ensure proper sizing

    // Update image styling - maintain aspect ratio while fitting in wrapper
    imgElement.style.width = 'auto';
    imgElement.style.height = '100%';
    imgElement.style.maxWidth = '100%';
    imgElement.style.maxHeight = '100%';
    imgElement.style.objectFit = 'contain'; // Use contain to maintain aspect ratio
    imgElement.style.borderRadius = '12px'; // Add borderRadius to img for better clipping
    // No position: relative on imgElement - let the wrapper handle positioning

    // Add image to wrapper, then wrapper to container
    imageWrapper.appendChild(imgElement);
    galleryImageContainer.appendChild(imageWrapper);
    
    // Image load event handler (link positioning removed)

    // Add loading indicator to image wrapper (not container)
    imageWrapper.appendChild(loadingIndicator);

    // Create footer container for caption and thumbnails
    const footerContainer = document.createElement('div');
    footerContainer.className = 'gallery-footer';
    footerContainer.style.display = 'flex';
    footerContainer.style.flexDirection = 'column';
    footerContainer.style.alignItems = 'center';
    footerContainer.style.gap = '10px';
    footerContainer.style.padding = '10px';
    footerContainer.style.flexShrink = '0';
    footerContainer.style.background = 'transparent';
    footerContainer.style.minHeight = '0'; // Important for flex child
    footerContainer.style.boxSizing = 'border-box';
    
    // Append caption and thumbnails to footer
    captionElement.append(counterElement);
    footerContainer.appendChild(captionElement);
    footerContainer.appendChild(thumbnailsContainer);
    
    // Append elements in proper order - now with footer at bottom
    overlay.append(topInfoContainer, galleryImageContainer, footerContainer, prevButton, nextButton, closeButton);

    // Dynamic image height adjustment function
    function adjustImageMaxHeight() {
        // With the new flexbox layout, the image container will automatically
        // take up the available space between top info and footer
        // We just need to ensure the image fits properly within its container
        
        // Remove fixed height constraints and let flexbox handle the layout
        imgElement.style.maxHeight = '100%';
        imageWrapper.style.maxHeight = '100%';
        imageWrapper.style.height = '100%';
        galleryImageContainer.style.maxHeight = 'none';
        galleryImageContainer.style.height = 'auto';
    }

    // Preload images function
    function preloadImage(index) {
        try {
            if (preloadedImages.has(index)) return;

            const item = galleryItems[index];
            if (!item || !item.fullSizeUrl) return;

            const img = new Image();
            img.onload = () => {
                try {
                    imageCache.set(index, img);
                    preloadedImages.add(index);
                    cleanupImageCache(); // Clean up cache after adding new image
                } catch (error) {
                    console.warn('Error in image onload:', error);
                }
            };
            img.onerror = () => {
                console.warn(`Failed to preload image ${index}: ${item.fullSizeUrl}`);
                // Remove from preloaded set to allow retry
                preloadedImages.delete(index);
            };
            img.src = item.fullSizeUrl;
        } catch (error) {
            console.warn('Error in preloadImage:', error);
        }
    }

    // Preload current, next, and previous images
    function preloadAdjacentImages() {
        const prevIndex = (currentIndex - 1 + galleryItems.length) % galleryItems.length;
        const nextIndex = (currentIndex + 1) % galleryItems.length;

        preloadImage(currentIndex);
        preloadImage(prevIndex);
        preloadImage(nextIndex);
    }

    // Zoom functionality with performance optimization
    let zoomTimeout;
    function setZoom(level, originX = null, originY = null) {
        // Clear any pending zoom operation
        if (zoomTimeout) {
            clearTimeout(zoomTimeout);
        }
        
        // Debounce zoom operations to prevent excessive DOM manipulation
        zoomTimeout = setTimeout(() => {
            const oldZoom = zoomLevel;
            zoomLevel = Math.max(0.5, Math.min(3, level));
            
            // If zoom origin is provided, calculate the transform origin
            if (originX !== null && originY !== null && zoomLevel !== 1) {
                // Cache getBoundingClientRect to avoid multiple calls
                const rect = imgElement.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    const x = ((originX - rect.left) / rect.width) * 100;
                    const y = ((originY - rect.top) / rect.height) * 100;
                    
                    imgElement.style.transformOrigin = `${x}% ${y}%`;
                }
            } else if (zoomLevel === 1) {
                // Reset transform origin when zooming out
                imgElement.style.transformOrigin = 'center center';
                // Reset drag offsets when zooming out
                dragOffsetX = 0;
                dragOffsetY = 0;
            }
            
            // Apply both zoom and pan transforms
            imgElement.style.transform = `scale(${zoomLevel}) translate(${dragOffsetX}px, ${dragOffsetY}px)`;
            isZoomed = zoomLevel !== 1;
            
            // Update container class for visual feedback
            if (isZoomed) {
                galleryImageContainer.classList.add('zoomed');
            } else {
                galleryImageContainer.classList.remove('zoomed');
            }
            
            // Adjust image height after zoom change
            adjustImageMaxHeight();
        }, 10); // Small debounce for zoom operations
    }

    function resetZoom() {
        setZoom(1);
        // Adjust image height after reset
        adjustImageMaxHeight();
    }
    
    // Drag/pan functionality
    function startDrag(e) {
        if (!isZoomed) return;
        
        isDragging = true;
        dragStartX = e.clientX - dragOffsetX;
        dragStartY = e.clientY - dragOffsetY;
        imageWrapper.style.cursor = 'grabbing';
    }
    
    // Drag/pan functionality with performance optimization
    let dragTimeout;
    function doDrag(e) {
        if (!isDragging || !isZoomed) return;
        
        // Clear any pending drag operation
        if (dragTimeout) {
            clearTimeout(dragTimeout);
        }
        
        // Debounce drag operations to prevent excessive DOM manipulation
        dragTimeout = setTimeout(() => {
            dragOffsetX = e.clientX - dragStartX;
            dragOffsetY = e.clientY - dragStartY;
            
            // Apply the drag transform
            imgElement.style.transform = `scale(${zoomLevel}) translate(${dragOffsetX}px, ${dragOffsetY}px)`;
        }, 16); // ~60fps for smooth dragging
    }
    
    function endDrag() {
        if (!isDragging) return;
        
        isDragging = false;
        imageWrapper.style.cursor = 'grab';
    }

    // Create thumbnails
    function createThumbnails() {
        thumbnailsContainer.innerHTML = '';
        galleryItems.forEach((item, index) => {
            const thumb = document.createElement('div');
            thumb.className = `gallery-thumbnail ${index === currentIndex ? 'active' : ''}`;

            const thumbImg = document.createElement('img');
            thumbImg.src = item.thumbnailUrl || item.fullSizeUrl;
            thumbImg.alt = item.productName;
            thumbImg.style.borderRadius = '8px';
            thumbImg.onerror = () => {
                thumbImg.src = PLACEHOLDER_IMG_URL;
            };

            thumb.appendChild(thumbImg);
            thumb.onclick = () => {
                currentIndex = index;
                updateGalleryView();
            };

            thumbnailsContainer.appendChild(thumb);
        });
    }

    function navigate(delta) {
        try {
            // Clear any pending navigation timeout
            if (navigationTimeout) {
                clearTimeout(navigationTimeout);
            }
            
            const oldIndex = currentIndex;
            currentIndex = (currentIndex + delta + galleryItems.length) % galleryItems.length;

            // Validate current index
            if (currentIndex < 0 || currentIndex >= galleryItems.length) {
                console.warn('Invalid navigation index:', currentIndex);
                currentIndex = Math.max(0, Math.min(galleryItems.length - 1, currentIndex));
            }

            // Add transition animation
            galleryImageContainer.style.opacity = '0';
            navigationTimeout = setTimeout(() => {
                try {
                    updateGalleryView();
                    galleryImageContainer.style.opacity = '1';
                } catch (error) {
                    console.warn('Error in navigation update:', error);
                    galleryImageContainer.style.opacity = '1';
                }
            }, 150);

            // Preload images for smooth navigation (only once)
            preloadAdjacentImages();
        } catch (error) {
            console.warn('Error in navigation:', error);
            // Fallback: try to show current image without transition
            try {
                updateGalleryView();
                adjustImageMaxHeight();
                
                // Product link positioning removed
            } catch (fallbackError) {
                console.error('Critical navigation error:', fallbackError);
            }
        }
    }

    const updateGalleryView = () => {
        try {
            const item = galleryItems[currentIndex];
            
            // Validate item exists
            if (!item) {
                console.warn('Invalid gallery item at index:', currentIndex);
                return;
            }

            // Show loading indicator
            loadingIndicator.style.display = 'block';
            imgElement.style.opacity = '0';

            // Reset zoom
            resetZoom();

            // Update image with transition
            imgElement.onload = () => {
                try {
                    loadingIndicator.style.display = 'none';
                    imgElement.style.opacity = '1';
                    
                    // Adjust image height after image loads
                    adjustImageMaxHeight();
                    
                    // Product link positioning removed
                } catch (error) {
                    console.warn('Error in image onload:', error);
                }
            };
            imgElement.onerror = () => {
                try {
                    loadingIndicator.style.display = 'none';
                    imgElement.src = PLACEHOLDER_IMG_URL;
                    imgElement.style.opacity = '1';
                    
                    // Adjust image height after error image loads
                    adjustImageMaxHeight();
                    
                    // Product link positioning removed
                } catch (error) {
                    console.warn('Error in image onerror:', error);
                }
            };

            // Validate URL before setting
            if (item.fullSizeUrl && typeof item.fullSizeUrl === 'string') {
                imgElement.src = item.fullSizeUrl;
            } else {
                console.warn('Invalid image URL:', item.fullSizeUrl);
                imgElement.src = PLACEHOLDER_IMG_URL;
            }

        // Update product info
        // Clear existing content and rebuild with wrap+BDI
        productNameElement.innerHTML = '';
        const nameWrap = document.createElement('span');
        nameWrap.className = 'tampermonkey-copy-wrap';
        const nameBdi = document.createElement('bdi');
        nameBdi.className = 'gallery-name-bdi';
        nameBdi.dir = 'auto';
        if (item.link) {
          const nameLink = document.createElement('a');
          nameLink.href = item.link;
          nameLink.target = '_blank';
          nameLink.rel = 'noopener';
          nameLink.textContent = item.productName;
          nameBdi.appendChild(nameLink);
        } else {
          nameBdi.textContent = item.productName || '';
        }
        nameWrap.appendChild(nameBdi);
        nameWrap.appendChild(createCopyIcon(item.productName || ''));
        productNameElement.appendChild(nameWrap);
        const originalSku = item.sku;
        const barcode = settings.replaceBarcodes ? findBarcode(originalSku, item.productName) : null;
        // Build: "מק\"ט: " + [wrap(bdi+icon)]
        skuElement.innerHTML = 'מק&quot;ט: ';
        const skuWrap = document.createElement('span');
        skuWrap.className = 'tampermonkey-copy-wrap';
        const skuBdi = document.createElement('bdi');
        skuBdi.className = 'gallery-barcode-bdi';
        skuBdi.dir = 'ltr';
        skuBdi.textContent = (barcode || originalSku || '').toString();
        skuWrap.appendChild(skuBdi);
        skuWrap.appendChild(createCopyIcon(skuBdi.textContent));
        skuElement.appendChild(skuWrap);

        // Add price if available (you can extend this based on your data structure)
        if (item.price) {
            priceElement.innerHTML = `מחיר: <strong class="barcode-highlight-gallery">₪${item.price}</strong>`;
            priceElement.style.display = 'block';
        } else {
            priceElement.style.display = 'none';
        }

        // Bottom-left gallery link removed — we already provide the product link in the title

        const quantity = item.quantity ? item.quantity.trim() : '';
        counterElement.textContent = '';

        // Always show "לוקט" even if quantity is empty or doesn't contain "/"
        const span = document.createElement('span');
        
        if (quantity && quantity.includes('/')) {
            // If quantity has "/" format, parse it and apply styling
            const [pickedStr, totalStr] = quantity.split('/').map(s => parseInt(s.trim(), 10));
            span.textContent = `לוקט ${quantity}`;
            span.style.direction = 'rtl';

            if (pickedStr === totalStr) {
                span.className = 'tampermonkey-picked-full';
            } else if (pickedStr === 0 && totalStr > 1) {
                span.className = 'tampermonkey-picked-none';
            } else {
                span.className = 'tampermonkey-picked-partial';
            }
        } else if (quantity) {
            // If quantity exists but doesn't have "/" format, show it without special styling
            span.textContent = `לוקט ${quantity}`;
            span.style.direction = 'rtl';
            span.className = 'tampermonkey-picked-partial'; // Default styling
        } else {
            // If no quantity, show "לוקט" without value
            span.textContent = 'לוקט';
            span.style.direction = 'rtl';
            span.className = 'tampermonkey-picked-partial'; // Default styling
        }

        counterElement.appendChild(span);

        // Update thumbnails
        createThumbnails();

        // Preload adjacent images
        preloadAdjacentImages();

        // Adjust image height dynamically
        adjustImageMaxHeight();
        
        // Product link positioning removed
        } catch (error) {
            console.warn('Error in updateGalleryView:', error);
            // Fallback: show placeholder
            try {
                loadingIndicator.style.display = 'none';
                imgElement.src = PLACEHOLDER_IMG_URL;
                imgElement.style.opacity = '1';
                
                // Adjust image height in fallback
                adjustImageMaxHeight();
                
                // Product link positioning removed
            } catch (fallbackError) {
                console.error('Critical error in updateGalleryView fallback:', fallbackError);
            }
        }
    };

    let closeOverlay = () => {
        // Remove event listeners to prevent memory leaks
        document.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('mousemove', doDrag);
        document.removeEventListener('mouseup', endDrag);
        window.removeEventListener('resize', resizeHandler);
        
        // Clear any pending timeouts
        if (wheelTimeout) {
            clearTimeout(wheelTimeout);
        }
        if (zoomTimeout) {
            clearTimeout(zoomTimeout);
        }
        if (dragTimeout) {
            clearTimeout(dragTimeout);
        }
        if (navigationTimeout) {
            clearTimeout(navigationTimeout);
        }
        
        overlay.style.opacity = '0';
        setTimeout(() => {
            if (document.body.contains(overlay)) {
                document.body.removeChild(overlay);
            }
        }, 300);
    };

    const handleKeyDown = (e) => {
        // Only handle keys if the gallery overlay is open
        if (!document.getElementById('tampermonkey-gallery-overlay')) {
            return; // Gallery is not open, let all events pass through
        }

        // Only handle specific keys that we want to control
        if (e.key === 'Escape') {
            closeOverlay();
            return;
        }
        if (e.key === 'z' || e.key === 'Z') {
            if (isZoomed) {
                resetZoom();
            } else {
                // Get the center of the image for keyboard zoom
                const rect = imgElement.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                setZoom(zoomLevel + 0.5, centerX, centerY);
            }
            return;
        }
        if (e.key === 'r' || e.key === 'R') {
            resetZoom();
            return;
        }

        // For all other keys (including arrow keys), let them pass through to the website
        // Don't prevent default or stop propagation
    };

    // Event listeners
    prevButton.onclick = () => navigate(-1);
    nextButton.onclick = () => navigate(1);
    closeButton.onclick = closeOverlay;

    // Mouse wheel zoom with debouncing
    let wheelTimeout;
    imageWrapper.addEventListener('wheel', (e) => {
        e.preventDefault();
        
        // Clear existing timeout
        if (wheelTimeout) {
            clearTimeout(wheelTimeout);
        }
        
        // Debounce wheel events to prevent rapid-fire zooming
        wheelTimeout = setTimeout(() => {
            const delta = e.deltaY > 0 ? -0.2 : 0.2;
            setZoom(zoomLevel + delta, e.clientX, e.clientY);
        }, 50); // Increased debounce time for better performance
    }, { passive: false });

    // Double click to reset zoom
    imageWrapper.ondblclick = resetZoom;
    
    // Drag/pan event listeners - use imageWrapper for better interaction
    imageWrapper.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', doDrag);
    document.addEventListener('mouseup', endDrag);
    
    // Double tap to reset zoom on touch devices
    let lastTap = 0;
    imageWrapper.addEventListener('touchend', (e) => {
        const currentTime = new Date().getTime();
        const tapLength = currentTime - lastTap;
        
        if (tapLength < 500 && tapLength > 0) {
            // Double tap detected
            e.preventDefault();
            resetZoom();
        }
        lastTap = currentTime;
        // Only prevent default for double taps, not single taps
    }, { passive: false });

    overlay.onclick = (e) => {
        if (e.target === overlay) closeOverlay();
    };

    document.body.appendChild(overlay);
    
    // Enhanced touch event handlers with pinch-to-zoom support
    overlay.addEventListener('touchstart', (e) => {
        try {
            // Only prevent default if we're handling a specific gesture
            if (e.touches.length === 1) {
                // Single touch - handle drag or swipe navigation
                startX = e.touches[0].clientX;
                isPinching = false;
                wasPinching = false; // Reset pinching flag for new single touch
                
                // If zoomed, start dragging instead of swipe navigation
                if (isZoomed) {
                    e.preventDefault();
                    startDrag({
                        clientX: e.touches[0].clientX,
                        clientY: e.touches[0].clientY
                    });
                }
            } else if (e.touches.length === 2) {
                // Two touches - handle pinch-to-zoom
                e.preventDefault(); // Only prevent default for pinch gestures
                isPinching = true;
                wasPinching = true; // Mark that we were pinching
                const touch1 = e.touches[0];
                const touch2 = e.touches[1];
                initialDistance = Math.sqrt(
                    Math.pow(touch2.clientX - touch1.clientX, 2) + 
                    Math.pow(touch2.clientY - touch1.clientY, 2)
                );
                initialZoom = zoomLevel;
            }
        } catch (error) {
            console.warn('Gallery touchstart error:', error);
        }
    }, { passive: false });

    overlay.addEventListener('touchmove', (e) => {
        try {
            // Only prevent default if we're actively handling a gesture
            if (isPinching && e.touches.length === 2) {
                e.preventDefault(); // Only prevent default for pinch gestures
                // Handle pinch-to-zoom
                const touch1 = e.touches[0];
                const touch2 = e.touches[1];
                const currentDistance = Math.sqrt(
                    Math.pow(touch2.clientX - touch1.clientX, 2) + 
                    Math.pow(touch2.clientY - touch1.clientY, 2)
                );
                
                if (initialDistance > 0 && currentDistance > 0) {
                    const scale = currentDistance / initialDistance;
                    const newZoom = Math.max(0.5, Math.min(3, initialZoom * scale));
                    
                    // Calculate the center point between the two fingers
                    const centerX = (touch1.clientX + touch2.clientX) / 2;
                    const centerY = (touch1.clientY + touch2.clientY) / 2;
                    
                    setZoom(newZoom, centerX, centerY);
                }
            } else if (isDragging && e.touches.length === 1) {
                // Handle dragging on touch devices
                e.preventDefault();
                doDrag({
                    clientX: e.touches[0].clientX,
                    clientY: e.touches[0].clientY
                });
            }
        } catch (error) {
            console.warn('Gallery touchmove error:', error);
        }
    }, { passive: false });

    overlay.addEventListener('touchend', (e) => {
        try {
            // Only prevent default if we're handling a specific gesture
            if (isPinching && e.touches.length === 0) {
                e.preventDefault(); // Only prevent default when ending pinch gesture
            }
            
            if (e.touches.length === 0) {
                // All touches ended
                if (isDragging) {
                    // End dragging
                    endDrag();
                } else if (!isPinching && !wasPinching && startX !== 0 && !isZoomed) {
                    // Single touch ended - handle swipe navigation only if not zoomed and not after pinching
                    endX = e.changedTouches[0] ? e.changedTouches[0].clientX : startX;
                    handleSwipe();
                }
                
                // Reset pinch state
                isPinching = false;
                wasPinching = false; // Reset the pinching flag
                initialDistance = 0;
                startX = 0;
                endX = 0;
            } else if (e.touches.length === 1) {
                // One touch ended, but another remains - switch to single touch mode
                isPinching = false;
                startX = e.touches[0].clientX;
            }
        } catch (error) {
            console.warn('Gallery touchend error:', error);
        }
    }, { passive: false });

    // Add keydown listener to document but only handle when gallery is open
    document.addEventListener('keydown', handleKeyDown);
    
    // Add resize listener to adjust image height when window is resized
    const resizeHandler = () => {
        if (document.getElementById('tampermonkey-gallery-overlay')) {
            adjustImageMaxHeight();
        }
    };
    window.addEventListener('resize', resizeHandler);
    
    // Add global error handler for gallery
    const galleryErrorHandler = (event) => {
        if (event.error && event.error.message && event.error.message.includes('STATUS_BREAKPOINT')) {
            console.warn('Gallery STATUS_BREAKPOINT error detected, attempting recovery...');
            event.preventDefault();
            // Try to close gallery gracefully
            try {
                closeOverlay();
            } catch (closeError) {
                console.error('Error closing gallery after STATUS_BREAKPOINT:', closeError);
            }
            return false;
        }
    };
    
    window.addEventListener('error', galleryErrorHandler);
    
    // Clean up error handler when gallery closes
    const originalCloseOverlay = closeOverlay;
    closeOverlay = () => {
        try {
            // Clean up memory
            imageCache.clear();
            preloadedImages.clear();
            
            // Remove error handler
            window.removeEventListener('error', galleryErrorHandler);
            
            // Remove resize handler
            window.removeEventListener('resize', resizeHandler);
            
            // Call original close function
            originalCloseOverlay();
        } catch (error) {
            console.warn('Error in enhanced closeOverlay:', error);
            // Fallback to original close
            try {
                originalCloseOverlay();
            } catch (fallbackError) {
                console.error('Critical error closing gallery:', fallbackError);
            }
        }
    };
    
    updateGalleryView();
    
    // Adjust image height after initial view is set
    setTimeout(() => {
        adjustImageMaxHeight();
    }, 50);
    
    setTimeout(() => {
        overlay.style.opacity = '1';
    }, 10);
    } catch (error) {
        console.error(`[${SCRIPT_NAME}] Error showing gallery overlay:`, error);
    }
}

    // ---< Injection & Cleanup Logic >---

    function createImageElement(match, nameText, skuText, styleObject) {
        try {

            if (!match) {
                return null;
            }

            if (!match.image) {
                return null;
            }

            const img = document.createElement('img');
            img.src = match.image; img.alt = `תמונה עבור ${nameText || 'מוצר'}`; img.className = 'tampermonkey-sku-image'; img.title = 'לחץ לפתיחת הגלריה';
            Object.assign(img.style, { width: 'auto', objectFit: 'contain', borderRadius: '4px', cursor: 'pointer', ...styleObject });
            img.onerror = function() { this.src = PLACEHOLDER_IMG_URL; this.onclick = null; };
            img.onclick = (e) => {
                e.stopPropagation();

                // Find the most specific container for the current order
                let searchScope = null;

                // First, try to find if we're in a modal
                const modal = e.target.closest('.modal');
                if (modal) {
                    searchScope = modal;
                } else {
                    // If not in a modal, try to find the specific table or container
                    const table = e.target.closest('table');
                    if (table) {
                        searchScope = table;
                    } else {
                        // Fallback to the closest container with order data
                        const orderContainer = e.target.closest('.table-responsive, .modal-body, .nested-fields');
                        if (orderContainer) {
                            searchScope = orderContainer;
                        } else {
                            // Last resort - use the row that contains the image
                            const row = e.target.closest('tr, .order-item-row, .pick-order-item-row');
                            if (row) {
                                searchScope = row.closest('table, .nested-fields') || row;
                            } else {
                                searchScope = document.body;
                            }
                        }
                    }
                }

                const galleryItems = extractDataForGallery(searchScope);
                const clickedIndex = galleryItems.findIndex(item => normalizeSku(item.sku) === normalizeSku(skuText));
                showGalleryOverlay(galleryItems, Math.max(0, clickedIndex));
            };

            return img;
        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Error creating image element:`, error);
            return null;
        }
    }

    // Expose functions to window for enhanced search
    window.createImageElement = createImageElement;

    function extractDataForGallery(searchScope) {
        try {
            if (!searchScope) return [];

            const items = [];
            const uniqueSkus = new Set();

            // Determine the search scope based on the type of container
            let searchSelector = '';

            if (searchScope.matches && searchScope.matches('.modal')) {
                // If we're in a modal, search within the modal
                searchSelector = '.table-responsive > .table tr, .modal-body .table tr, .nested-fields.order-item-row, td.pick-order-item-row';
            } else if (searchScope.matches && searchScope.matches('table')) {
                // If we're in a table, search within that table
                searchSelector = 'tr';
            } else if (searchScope.matches && searchScope.matches('.table-responsive, .modal-body, .nested-fields')) {
                // If we're in a container, search within that container
                searchSelector = '.table-responsive > .table tr, .modal-body .table tr, .nested-fields.order-item-row, td.pick-order-item-row';
            } else if (searchScope.matches && searchScope.matches('tr, .order-item-row, .pick-order-item-row')) {
                // If we're in a row, search within the parent table/container
                const parentTable = searchScope.closest('table, .nested-fields');
                if (parentTable) {
                    return extractDataForGallery(parentTable);
                } else {
                    // If no parent table, just search this row
                    searchSelector = '*';
                }
            } else {
                // Fallback - search for any relevant rows
                searchSelector = '.table-responsive > .table tr, .modal-body .table tr, .nested-fields.order-item-row, td.pick-order-item-row';
            }

            // Search within the determined scope
            searchScope.querySelectorAll(searchSelector).forEach(row => {
                // Skip if this is not a data row
                if (!row.matches || !row.matches('tr, .order-item-row, .pick-order-item-row')) {
                    return;
                }

                let name, sku;

                // Find cells by header content instead of hardcoded positions
                const table = row.closest('table');
                let nameEl = null;
                let quantityEl = null;

                if (table) {
                    const thead = table.querySelector('thead tr');
                    if (thead) {
                        const headers = Array.from(thead.querySelectorAll('th')).map(th => th.textContent.trim());
                        const nameIndex = headers.findIndex(header => header.includes('שם'));
                        const quantityIndex = headers.findIndex(h => h.includes('כמות') || h.includes('לוקט'));
                        
                        if (nameIndex !== -1) {
                            nameEl = row.cells[nameIndex];
                        }
                        if (quantityIndex !== -1) {
                            quantityEl = row.cells[quantityIndex];
                        }
                    }
                }

                // Fallback to original selectors if header method didn't work
                if (!nameEl) {
                    nameEl = row.querySelector('td:nth-child(4), input.order-item-name, span.text-dark-75');
                }
                if (!quantityEl) {
                    // Try multiple fallback strategies for quantity
                    quantityEl = row.querySelector('td:nth-child(5)') || // Original fallback
                               row.querySelector('[data-label*="כמות"], [data-label*="לוקט"]') || // Responsive labels
                               row.querySelector('td[title*="כמות"], td[title*="לוקט"]'); // Title attributes
                }

                const skuEl = row.querySelector('td.text-nowrap, input.order-item-sku, span.text-muted');
                if (!nameEl || !skuEl) return;
                name = (nameEl.value || nameEl.textContent).trim();
                sku = (skuEl.dataset.originalSku || skuEl.value || skuEl.textContent || '').trim();
                if (sku.startsWith('0')) return;
                const normalizedSku = normalizeSku(sku);
                if (!normalizedSku || uniqueSkus.has(normalizedSku)) return;
                const match = findImageMatch(sku, name);
                if (match && match.image) {

                    // Extract price from DOM - look for "מחיר ליחידה" column
                    let price = null;
                    if (table) {
                        const thead = table.querySelector('thead tr');
                        if (thead) {
                            const headers = Array.from(thead.querySelectorAll('th')).map(th => th.textContent.trim());
                            const priceIndex = headers.findIndex(header => header.includes('מחיר ליחידה'));
                            if (priceIndex !== -1 && row.cells[priceIndex]) {
                                const priceText = row.cells[priceIndex].textContent.trim();
                                // Extract numeric value from price text
                                const priceMatch = priceText.match(/[\d,]+\.?\d*/);
                                if (priceMatch) {
                                    price = priceMatch[0].replace(/,/g, '');
                                }
                            }
                        }
                    }

                    // Extract quantity - use the found quantity element or fallback
                    const quantity = quantityEl ? quantityEl.textContent.trim() : '';

                    items.push({
                        fullSizeUrl: getOptimizedImageUrl(getFullSizeImageUrl(match.image), Math.min(window.innerWidth, 1200)),
                        thumbnailUrl: getOptimizedImageUrl(match.image, 300), // Smaller thumbnails for better performance
                        productName: name,
                        sku: sku,
                        quantity: quantity, // Use the found quantity element
                        price: price, // Use price from DOM instead of CSV
                        link: match.link || null // Add product link if available
                    });

                    uniqueSkus.add(normalizedSku);
                } else {
                    // No image → include item with placeholder so gallery always opens
                    
                    // Extract price from DOM - look for "מחיר ליחידה" column
                    let price = null;
                    if (table) {
                        const thead = table.querySelector('thead tr');
                        if (thead) {
                            const headers = Array.from(thead.querySelectorAll('th')).map(th => th.textContent.trim());
                            const priceIndex = headers.findIndex(header => header.includes('מחיר ליחידה'));
                            if (priceIndex !== -1 && row.cells[priceIndex]) {
                                const priceText = row.cells[priceIndex].textContent.trim();
                                // Extract numeric value from price text
                                const priceMatch = priceText.match(/[\d,]+\.?\d*/);
                                if (priceMatch) {
                                    price = priceMatch[0].replace(/,/g, '');
                                }
                            }
                        }
                    }

                    // Extract quantity - use the found quantity element or fallback
                    const quantity = quantityEl ? quantityEl.textContent.trim() : '';

                    items.push({
                        fullSizeUrl: PLACEHOLDER_IMG_URL,
                        thumbnailUrl: PLACEHOLDER_IMG_URL,
                        productName: name,
                        sku: sku,
                        quantity: quantity || '',
                        price: price,
                        link: null
                    });
                    uniqueSkus.add(normalizedSku);
                }
            });
            return items;
        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Error extracting gallery data:`, error);
            return [];
        }
    }

    // DRY helper function to attach gallery opener to placeholder images
    function attachGalleryOpener(imgEl, sku, fallbackScopeEl) {
        imgEl.title = 'Open gallery';
        imgEl.style.cursor = 'pointer';
        imgEl.onclick = (e) => {
            e.stopPropagation();
            const searchScope =
                e.target.closest('.modal') ||
                e.target.closest('table') ||
                e.target.closest('.table-responsive, .modal-body, .nested-fields') ||
                e.target.closest('tr, .order-item-row, .pick-order-item-row')?.closest('table, .nested-fields') ||
                fallbackScopeEl ||
                document.body;

            const galleryItems = extractDataForGallery(searchScope);
            const clickedIndex = galleryItems.findIndex(item => normalizeSku(item.sku) === normalizeSku(sku));
            showGalleryOverlay(galleryItems, Math.max(0, clickedIndex));
        };
    }

    // MODIFICATION START: Updated injectImagesAndLinks to accept a scope parameter
    function injectImagesAndLinks(scope = document) {
        try {
            if (!settings || !settings.showImages) {
                return;
            }


            // Find all rows with data-original-sku that haven't been processed
            const rows = scope.querySelectorAll('tr:not([data-image-processed])');

            rows.forEach((row, index) => {
                // Skip rows from main orders table
                if (row.closest('.dataTables_wrapper.dt-bootstrap4')) {
                    return;
                }

                // Look for SKU data in the row
                const skuTd = row.querySelector('[data-original-sku]');
                if (!skuTd) {
                    return;
                }

                const sku = skuTd.dataset.originalSku || skuTd.textContent.trim();

                // Look for name data - try multiple selectors
                let nameTd = row.querySelector('[data-label="שם"]');
                if (!nameTd) {
                    // Fallback: look for cells that might contain the name
                    const cells = row.querySelectorAll('td');
                    // Usually the name is in the 3rd column (index 2)
                    if (cells.length > 2) {
                        nameTd = cells[2];
                    }
                }

                const name = nameTd?.textContent.trim() || '';

                if (!sku || !name) {
                    return;
                }

                const match = findImageMatch(sku, name);

                if (match && match.image) {
                    const img = createImageElement(match, name, sku, { maxHeight: '80px', maxWidth: '80px' });
                    if (img) {
                        const firstTd = row.querySelector('td');
                        if (firstTd) {
                            // Clear the first cell and add the image
                            firstTd.innerHTML = '';
                            firstTd.appendChild(img);
                        }
                    }
                } else {
                    const firstTd = row.querySelector('td');
                    if (firstTd) {
                        firstTd.innerHTML = '';
                        const ph = document.createElement('img');
                        ph.src = PLACEHOLDER_IMG_URL;
                        ph.alt = 'No image';
                        Object.assign(ph.style, {
                            width: 'auto',
                            maxHeight: '80px',
                            maxWidth: '80px',
                            objectFit: 'contain',
                            borderRadius: '4px'
                        });
                        attachGalleryOpener(ph, sku, scope);
                        firstTd.appendChild(ph);
                    }
                }

                row.setAttribute('data-image-processed', 'true');
            });


            // This part is for the modal rows
            scope.querySelectorAll('td.pick-order-item-row:not([data-image-processed])').forEach(cell => {
                const imageContainer = cell.querySelector('.col-sm-6 > .d-flex.align-items-center');
                if (!imageContainer) return;
                const name = cell.querySelector('span.text-dark-75')?.textContent.trim() || '';
                const sku = cell.querySelector('span.text-muted')?.textContent.trim() || '';
                const match = findImageMatch(sku, name);
                if (match && match.image) {
                    const wrapper = document.createElement('div');
                    wrapper.style.marginRight = '10px';
                    wrapper.append(createImageElement(match, name, sku, { maxHeight: '50px', maxWidth: '50px', padding: '5px' }));
                    imageContainer.prepend(wrapper);
                } else {
                    const wrapper = document.createElement('div');
                    wrapper.style.marginRight = '10px';

                    const ph = document.createElement('img');
                    ph.src = PLACEHOLDER_IMG_URL;
                    ph.alt = 'No image';
                    Object.assign(ph.style, {
                        maxHeight: '50px',
                        maxWidth: '50px',
                        objectFit: 'contain',
                        borderRadius: '4px',
                        padding: '5px'
                    });
                    attachGalleryOpener(ph, sku, imageContainer.closest('.modal') || document.body);

                    wrapper.append(ph);
                    imageContainer.prepend(wrapper);
                }
                cell.setAttribute('data-image-processed', 'true');
            });

            // This part is for the modal form items
            const modalForm = scope.querySelector('form[id^="edit_task_"]');
            if (modalForm) {
                const headerContainer = modalForm.querySelector('.order-item-header > span.d-flex');
                if (headerContainer && !headerContainer.querySelector('.tampermonkey-image-header')) {
                    const newHeader = document.createElement('div');
                    newHeader.textContent = 'תמונה';
                    newHeader.className = 'tampermonkey-image-header';
                    newHeader.style.cssText = 'width: 88px; flex: 0 0 88px;';
                    headerContainer.prepend(newHeader);
                }
                modalForm.querySelectorAll('.nested-fields.order-item-row:not([data-image-processed])').forEach(row => {
                    const flexContainer = row.querySelector('div.d-flex.align-items-center');
                    if (flexContainer && !flexContainer.querySelector('.tampermonkey-image-placeholder')) {
                        const placeholder = document.createElement('div');
                        placeholder.className = 'tampermonkey-image-placeholder';
                        placeholder.style.cssText = 'width: 88px; flex: 0 0 88px; display: flex; align-items: center; justify-content: center; margin-right: 8px;';
                        flexContainer.prepend(placeholder);
                        const name = row.querySelector('input.order-item-name')?.value.trim();
                        const sku = row.querySelector('input.order-item-sku')?.value.trim();
                        const match = findImageMatch(sku, name);
                        if (match && match.image) {
                            placeholder.append(createImageElement(match, name, sku, { maxHeight: '70px', maxWidth: '80px' }));
                        } else {
                            const ph = document.createElement('img');
                            ph.src = PLACEHOLDER_IMG_URL;
                            ph.alt = 'No image';
                            Object.assign(ph.style, {
                                maxHeight: '70px',
                                maxWidth: '80px',
                                objectFit: 'contain',
                                borderRadius: '4px'
                            });
                            attachGalleryOpener(ph, sku, placeholder.closest('.modal') || document.body);
                            placeholder.append(ph);
                        }
                    }
                    row.setAttribute('data-image-processed', 'true');
                });
            }

        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Error injecting images and links:`, error);
        }
    }
    // MODIFICATION END

    // MODIFICATION START: Add new function for regular product tables
    function injectImagesInRegularTables(scope = document) {
        try {
            if (!settings || !settings.showImages) {
                return;
            }


            const productTable = findProductTableInScope(scope);

            if (productTable) {
                const rows = productTable.querySelectorAll('tbody tr:not([data-image-processed])');

                rows.forEach((row, index) => {

                    // Find cells by header content instead of hardcoded positions
                    const thead = productTable.querySelector('thead tr');
                    let nameCell = null;
                    let skuCell = null;

                    if (thead) {
                        const headers = Array.from(thead.querySelectorAll('th')).map(th => th.textContent.trim());
                        const nameIndex = headers.findIndex(header => header.includes('שם'));
                        const skuIndex = headers.findIndex(header => header.includes('מק'));

                        if (nameIndex !== -1) nameCell = row.cells[nameIndex];
                        if (skuIndex !== -1) skuCell = row.cells[skuIndex];

                    }

                    // Fallback to hardcoded positions if header method didn't work
                    if (!nameCell) nameCell = row.querySelector('td:nth-child(4)');
                    if (!skuCell) skuCell = row.querySelector('td:nth-child(2)');


                    if(!nameCell || !skuCell) {
                        return;
                    }

                    const targetCell = row.cells[0]; // Image always goes into the first TD
                    const name = nameCell.textContent.trim(), sku = (skuCell.dataset.originalSku || skuCell.textContent || '').trim();

                    const match = findImageMatch(sku, name);

                    if (match) {
                        if (match.image && !targetCell.querySelector('.tampermonkey-sku-image')) {
                            targetCell.innerHTML = '';
                            targetCell.append(createImageElement(match, name, sku, { maxHeight: '80px', maxWidth: '80px' }));
                        }

                        if (match.link && !nameCell.querySelector('a')) {
                            // Check if there's an Anipet button in this cell or nearby
                            const hasAnipetButton = nameCell.querySelector('.anipet-alternatives-btn') ||
                                                   nameCell.closest('tr').querySelector('.anipet-alternatives-btn');

                            // Only create link if there's no Anipet button
                            if (!hasAnipetButton) {
                                const productName = nameCell.textContent.trim();
                                
                                // Clear the cell content
                                nameCell.innerHTML = '';
                                
                                // Create copy icon with enhanced feedback
                                const copyIcon = createCopyIcon(productName);
                                
                                // Create link
                                const link = document.createElement('a');
                                link.href = match.link;
                                link.target = '_blank';
                                link.rel = 'noopener noreferrer';
                                link.textContent = productName;
                                
                                // Append link first, then copy icon (icon will float left)
                                nameCell.appendChild(link);
                                nameCell.appendChild(copyIcon);
                                
                                // Do not add copy-enabled to this cell since it has its own copy mechanism
                            }
                        }
                    } else {
                        if (targetCell && !targetCell.querySelector('img')) {
                            targetCell.innerHTML = '';
                            const ph = document.createElement('img');
                            ph.src = PLACEHOLDER_IMG_URL;
                            ph.alt = 'No image';
                            Object.assign(ph.style, {
                                width: 'auto',
                                maxHeight: '80px',
                                maxWidth: '80px',
                                objectFit: 'contain',
                                borderRadius: '4px'
                            });
                            attachGalleryOpener(ph, sku, scope);
                            targetCell.appendChild(ph);
                        }
                    }
                    row.setAttribute('data-image-processed', 'true');
                });
            } else {
            }

        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Error injecting images in regular tables:`, error);
        }
    }

    // MODIFICATION START: Add new function for .order-item-row structure support
    function injectImagesInOrderItemRows(scope = document) {
        if (!productDataCache) return;

        const unprocessedRows = scope.querySelectorAll('.order-item-row:not([data-image-processed])');
        const processedRows = scope.querySelectorAll('.order-item-row[data-image-processed]');
        const processedRowsWithoutImages = Array.from(processedRows).filter(row => !row.querySelector('.tampermonkey-sku-image'));
        const rows = [...unprocessedRows, ...processedRowsWithoutImages];

        if (rows.length === 0) return;

        rows.forEach(row => {
            const skuInput = row.querySelector('input.order-item-sku');
            const nameInput = row.querySelector('input.order-item-name');

            if (!skuInput || !nameInput) return;

            const sku = skuInput.value?.trim();
            const name = nameInput.value?.trim();

            if (!sku || !name) return;

            // אם כבר יש תמונה בשורה, נסמן אותה כמעובדת
            const existingImage = row.querySelector('.tampermonkey-sku-image');
            if (existingImage) {
                row.setAttribute('data-image-processed', 'true');
                return;
            }

            if (!productDataCache) return;

            const product = productDataCache.find(p =>
                p.barcode === sku ||
                p.sku === sku ||
                p.name === name ||
                (p.skus && p.skus.includes(sku)) ||
                (p.productName && p.productName.toLowerCase().trim() === name.toLowerCase().trim())
            );

            if (!product) return;
            if (!product.image && !product.imageUrl) {
                // אם אין תמונה למוצר, נסמן כמעובד כדי למנוע לולאה אינסופית
                row.setAttribute('data-image-processed', 'true');
                return;
            }

            let placeholder = row.querySelector('.tampermonkey-image-placeholder');
            if (!placeholder) {
                // צור את ה-placeholder באופן ידני והכנס אותו
                const container = row.querySelector('.d-flex.align-items-center');
                if (container) {
                    placeholder = document.createElement('div');
                    placeholder.className = 'tampermonkey-image-placeholder';
                    placeholder.style.cssText = 'width: 88px; flex: 0 0 88px; display: flex; align-items: center; justify-content: center; margin-right: 8px;';
                    container.insertBefore(placeholder, container.firstChild);
                } else {
                    return; // אין לאן להכניס
                }
            }

            if (placeholder) {
                const img = document.createElement('img');
                img.src = product.image || product.imageUrl;
                img.className = 'tampermonkey-sku-image';
                img.style.maxHeight = '48px';
                img.style.maxWidth = '80px';
                placeholder.innerHTML = '';
                placeholder.appendChild(img);
            }

            row.setAttribute('data-image-processed', 'true');
        });
    }
    // MODIFICATION END

    // MODIFICATION START: Unified barcode replacement function
    // Add WeakSet for tracking processed elements to improve performance
    const processedElements = new WeakSet();

    function isElementProcessed(element) {
        return processedElements.has(element);
    }

    function markElementAsProcessed(element) {
        processedElements.add(element);
    }

    function replaceBarcodesInViews(scope = document) {
        try {
            if (!settings || !settings.replaceBarcodes || !itemCodeToBarcodeMap) return;

            const foundContexts = [
                scope.querySelector('.table.table-hover'),
                scope.querySelector('.modal-body .table'),
                scope.querySelector('.nested-fields'),
                scope.querySelector('.pick-order-item-row'),
                scope.querySelector('.offcanvas .table'),
                scope.querySelector('.panel_view .table'),
                scope.querySelector('#task_offcanvas .table')
            ].filter(Boolean);

            if (foundContexts.length === 0) return;

            // Process elements with data-original-sku first (priority)
            const elementsWithSku = scope.querySelectorAll('[data-original-sku]');
            elementsWithSku.forEach((el) => {
                try {
                    const originalSku = el.getAttribute('data-original-sku')?.trim();
                    if (!originalSku) return;

                    // Skip if already processed
                    if (isElementProcessed(el)) return;

                    // Find the name from the closest row
                    const name = el.closest('tr')?.querySelector('[data-label="שם"], .order-item-name, .text-dark-75, td:nth-child(10), td:nth-child(3), .text-dark-75.font-weight-bold')?.textContent?.trim() || '';

                    const barcode = findBarcode(originalSku, name);
                    if (barcode && barcode !== originalSku) {
                        processBarcodeElement(el, barcode, originalSku);
                    }
                    markElementAsProcessed(el);
                } catch (elementError) {
                    console.warn(`[${SCRIPT_NAME}] Failed to process element with data-original-sku:`, elementError);
                    // Continue with next element
                }
            });

            // Then process other elements (but skip those already processed by data-original-sku)
            foundContexts.forEach((context) => {
                try {
                    const elements = context.querySelectorAll('td.text-nowrap, input[type="text"], span.text-muted, strong');
                    elements.forEach((el) => {
                        try {
                            // Skip if already processed
                            if (isElementProcessed(el)) return;

                            // Skip if this element has data-original-sku (already processed above)
                            if (el.hasAttribute('data-original-sku')) return;

                            const name = el.closest('tr')?.querySelector('[data-label="שם"], .order-item-name, .text-dark-75, td:nth-child(10), td:nth-child(3), .text-dark-75.font-weight-bold')?.textContent?.trim() || '';
                            const sku = el.textContent?.trim() || el.value?.trim() || '';

                            if (!sku || sku.length < 3) return;

                            const barcode = findBarcode(sku, name);
                            if (barcode && barcode !== sku) {
                                processBarcodeElement(el, barcode, sku);
                            }
                            markElementAsProcessed(el);
                        } catch (elementError) {
                            console.warn(`[${SCRIPT_NAME}] Failed to process element:`, elementError);
                            // Continue with next element
                        }
                    });
                } catch (contextError) {
                    console.warn(`[${SCRIPT_NAME}] Failed to process context:`, contextError);
                    // Continue with next context
                }
            });

            // Handle completely empty SKU cells that don't have any elements
            foundContexts.forEach((context) => {
                try {
                    const rows = context.querySelectorAll('tr');
                    rows.forEach((row) => {
                        try {
                            // Find the name cell first
                            let nameEl;
                            if (context.matches('.table.table-hover')) {
                                // Regular tables: Name is at td[data-label="שם"]
                                nameEl = row.querySelector('td[data-label="שם"]');
                            } else if (context.matches('.pick-order-item-row')) {
                                // Picking modal: SKU cell is the span with barcode-highlight class
                                nameEl = row.querySelector('.barcode-highlight[data-original-sku]');
                            } else {
                                // Other tables: Name is at various locations
                                nameEl = row.querySelector('.order-item-name, .text-dark-75, td:nth-child(10), td:nth-child(3), .text-dark-75.font-weight-bold');
                            }
                            if (!nameEl) return;

                            const name = nameEl.value || nameEl.textContent.trim();
                            if (!name) return;

                            // Find the SKU cell (empty or with minimal content)
                            let skuCell;
                            if (context.matches('.table.table-hover')) {
                                // Regular tables: SKU cell is at td[data-label="מק״ט"]
                                skuCell = row.querySelector('td[data-label="מק״ט"]');
                            } else if (context.matches('.pick-order-item-row')) {
                                // Picking modal: SKU cell is the span with barcode-highlight class
                                skuCell = row.querySelector('.barcode-highlight[data-original-sku]');
                            } else {
                                // Other tables (including sidepanel): SKU cell is at td.text-nowrap or td[data-label="מק״ט"]
                                skuCell = row.querySelector('td.text-nowrap, td[data-label="מק״ט"]');
                            }
                            if (!skuCell) return;

                            // Check if SKU cell is empty or has minimal content
                            const skuContent = skuCell.textContent.trim();
                            const hasSkuElement = skuCell.querySelector('input, span, strong');
                            const barcodeElement = skuCell.querySelector('.tampermonkey-barcode-bdi');

                            // Skip if already processed
                            if (isElementProcessed(skuCell)) return;

                            if ((skuContent === '' || skuContent.length < 3) && (!hasSkuElement || barcodeElement)) {
                                // Try to find barcode by name
                                const barcode = findBarcode(null, name);
                                if (barcode) {
                                    // Check if there's a specific barcode element to update (sidepanel case)
                                    if (barcodeElement) {
                                        // Update the existing barcode element in sidepanel
                                        barcodeElement.innerHTML = `<span class="barcode-highlight" title="הוחלף אוטומטית לפי שם. מקורי: לא ידוע" style="color: rgb(0, 100, 0) !important; font-weight: bold !important; cursor: help !important;">${barcode}</span>`;
                                    } else {
                                        // Create a text element to display the barcode
                                        const barcodeSpan = document.createElement('span');
                                        barcodeSpan.textContent = barcode;
                                        barcodeSpan.className = 'barcode-highlight';
                                        barcodeSpan.title = `הוחלף אוטומטית לפי שם. מקורי: לא ידוע`;
                                        barcodeSpan.style.cssText = `
                                            color: #006400 !important;
                                            font-weight: bold !important;
                                            cursor: help !important;
                                        `;

                                        // Clear the cell and add the barcode
                                        skuCell.innerHTML = '';
                                        skuCell.appendChild(barcodeSpan);
                                        
                                        // Add copy icon for newly created barcode
                                        const barcodeCopyIcon = createCopyIcon(barcode);
                                        barcodeCopyIcon.style.marginLeft = '4px';
                                        barcodeCopyIcon.style.marginRight = '0px';
                                        skuCell.appendChild(barcodeCopyIcon);
                                    }
                                    
                                    markElementAsProcessed(skuCell);
                                }
                            }
                        } catch (rowError) {
                            console.warn(`[${SCRIPT_NAME}] Failed to process row:`, rowError);
                            // Continue with next row
                        }
                    });
                } catch (contextError) {
                    console.warn(`[${SCRIPT_NAME}] Failed to process empty SKU cells in context:`, contextError);
                    // Continue with next context
                }
            });
        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Error replacing barcodes in views:`, error);
        }
    }

    // Helper function to process barcode elements consistently
    function processBarcodeElement(el, barcode, originalSku) {
        try {
            if (el.tagName === 'INPUT') {
                el.value = barcode;
                el.classList.add('barcode-input-highlight');
            } else {
                el.textContent = barcode;
                el.classList.add('barcode-highlight');
            }

            el.title = `הוחלף אוטומטית. מקורי: ${originalSku}`;

            // Add barcode-highlight class to the parent td if it exists, but not in picking modal
            const parentTd = el.closest('td');
            if (parentTd) {
                // Check if we're in the picking modal - if so, don't add barcode-highlight to the td
                const isInPickingModal = parentTd.closest('.pick-order-item-table');
                if (!isInPickingModal) {
                    parentTd.classList.add('barcode-highlight');
                }
                // Remove any inline background color to let CSS handle it
                parentTd.style.backgroundColor = '';
            }

            // Remove any inline background color from the element itself to let CSS handle it
            el.style.backgroundColor = '';
            
            // Add copy icon for dynamically replaced barcodes (if not already present)
            if (el.tagName !== 'INPUT' && parentTd && !parentTd.querySelector('i.fa-clone')) {
                const barcodeCopyIcon = createCopyIcon(barcode);
                barcodeCopyIcon.style.marginLeft = '4px';
                barcodeCopyIcon.style.marginRight = '0px';
                
                // Insert the copy icon after the barcode element
                if (el.nextSibling) {
                    parentTd.insertBefore(barcodeCopyIcon, el.nextSibling);
                } else {
                    parentTd.appendChild(barcodeCopyIcon);
                }
            }
        } catch (error) {
            console.warn(`[${SCRIPT_NAME}] Failed to process barcode element:`, error);
            // Continue without failing the entire process
        }
    }

    // Keep the old function name for backward compatibility but make it call the new unified function
    function replaceBarcodesInDOM(scope = document) {
        replaceBarcodesInViews(scope);
    }
    // MODIFICATION END

    // This is the correct and ONLY definition for injectPreviewFunctionality
    function injectPreviewFunctionality(mainTableBody) {
        try {
            if (!settings || !settings.enablePreview || mainTableBody.hasAttribute('data-preview-injected')) {
                return;
            }

        const headerRow = mainTableBody.closest('table').querySelector('thead tr');
        let previewHeaderCell = null;

        // MODIFICATION START: Hide the original empty TH (th.noVis.pt-2) from the header
        // This TH is structurally present at data-column-index="1" but visually empty.
        // We hide it to collapse its space in the header row.
        const emptyHeaderToHide = headerRow.querySelector('th.noVis.pt-2.sorting_disabled[data-column-index="1"]');
        if (emptyHeaderToHide) {
            emptyHeaderToHide.classList.add('tm-hideable-column'); // Use our utility class to hide it
        }
        // MODIFICATION END

        // MODIFICATION START: Insert our "Toggle All" Preview Button TH at the correct position
        // Check if already added by us
        previewHeaderCell = headerRow.querySelector('th.preview-header');

        if (!previewHeaderCell) {
            // Find the original Checkbox header (th:nth-child(1) / data-column-index="0")
            const checkboxHeader = headerRow.querySelector('th[data-column-index="0"]');
            // Insert our new preview header immediately after the checkbox header.
            // This will make our new TH `th:nth-child(2)`.
            // The original `th.noVis.pt-2` (empty) will then be `th:nth-child(3)` (and is hidden by CSS).
            if (checkboxHeader) {
                previewHeaderCell = document.createElement('th');
                previewHeaderCell.classList.add('preview-header');
                headerRow.insertBefore(previewHeaderCell, checkboxHeader.nextSibling); // Insert AFTER checkbox header
            } else {
                // Fallback: If checkbox header not found, insert at the beginning (less ideal for precise alignment)
                previewHeaderCell = document.createElement('th');
                previewHeaderCell.classList.add('preview-header');
                headerRow.insertBefore(previewHeaderCell, headerRow.children[0]); // Fallback to start
            }
        }

if (previewHeaderCell && !previewHeaderCell.querySelector('.preview-toggle-all-button')) {
            const button = document.createElement('button');
            button.className = 'btn btn-sm btn-icon btn-light-primary preview-toggle-all-button';
            button.innerHTML = '<i class="fa-light fa-list-tree" title="פתח/סגור את כל הפריטים"></i>';

            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                // קובע אם צריך לפתוח או לסגור לפי המצב הנוכחי
                const isAnyOpen = mainTableBody.querySelector('.preview-cell button i.fa-chevron-up');
                const targetIconClass = isAnyOpen ? 'fa-chevron-up' : 'fa-chevron-down';

                // מוצא את כל האייקונים הפוטנציאליים
                const iconsToConsider = mainTableBody.querySelectorAll(`.preview-cell button i.${targetIconClass}`);

                // עובר על כל האייקונים ולוחץ רק אם השורה שלהם מוצגת
                iconsToConsider.forEach(icon => {
                    const parentRow = icon.closest('tr[data-task-id]');
                    // התנאי שבודק אם השורה אכן נראית על המסך
                    if (parentRow && parentRow.offsetParent !== null) {
                        const targetButton = icon.closest('button');
                        if (targetButton) {
                            targetButton.click();
                        }
                    }
                });
            }, { passive: false });

            previewHeaderCell.innerHTML = '';
            previewHeaderCell.appendChild(button);

            previewHeaderCell.style.padding = '0.75rem 0.5rem';
            previewHeaderCell.style.textAlign = 'center';
        }

        // MODIFICATION END (for TH insertion)


        // CORRECTED FOR EACH LOOP (TD insertion logic):
        mainTableBody.querySelectorAll('tr[data-task-id]:not([data-preview-processed])').forEach(row => {
            // MODIFICATION START: DO NOT remove/move content from td.noVis.pt-2.
            // That TD (the ✅ icon) is an important visible column and should stay in its original position.
            // We are NOT hiding it here. Its width is controlled by new CSS for '.noVis.pt-2'.
            // MODIFICATION END

            const cell = document.createElement('td'); // This is the cell for the individual preview button
            cell.className = 'preview-cell';
            const button = document.createElement('button');
            button.className = 'btn btn-sm btn-icon btn-light-primary';
            button.innerHTML = '<i class="fa-light fa-chevron-down"></i>'; // Only the chevron icon initially

            button.dataset.taskId = row.dataset.taskId;
            button.title = 'הצג פריטים'; // Base title

            cell.append(button);
            // Insert the button cell at index 1 (the second position after the original checkbox).
            // This is crucial: [Checkbox (0)], [OUR BUTTON (1)], [✅ Icon (2)], [Order ID (3)]
            row.insertBefore(cell, row.children[1]);
            // MODIFICATION END (for TD insertion)

            button.addEventListener('click', async (e) => {
                e.preventDefault(); e.stopPropagation();
                const currentButton = e.currentTarget, icon = currentButton.querySelector('i'), taskId = currentButton.dataset.taskId, parentRow = currentButton.closest('tr'), existingPreview = document.getElementById(`preview-for-${taskId}`);
                if (existingPreview) {
                    // מחק את ה-taskId מה-sessionStorage כאשר PREVIEW נסגר
                    const openPreviews = JSON.parse(sessionStorage.getItem('openPreviewTaskIds') || '[]');
                    const updatedPreviews = openPreviews.filter(id => id !== taskId);
                    sessionStorage.setItem('openPreviewTaskIds', JSON.stringify(updatedPreviews));

                    existingPreview.remove();
                    updateButtonState(currentButton, false);

                    return;
                }
                // שמור את ה-taskId ב-sessionStorage לפני פתיחה
                const openPreviews = JSON.parse(sessionStorage.getItem('openPreviewTaskIds') || '[]');
                if (!openPreviews.includes(taskId)) {
                    openPreviews.push(taskId);
                    sessionStorage.setItem('openPreviewTaskIds', JSON.stringify(openPreviews));
                }

                // בדוק אם זה session חדש - אם כן, אל תפתח PREVIEWs אחרים
                const sessionStartTime = sessionStorage.getItem('sessionStartTime');
                const currentTime = Date.now();
                const sessionAge = currentTime - parseInt(sessionStartTime || '0');

                // אם ה-session צעיר מדי (פחות מ-5 שניות), נקה את כל ה-PREVIEWs האחרים
                if (sessionAge < 5000) {
                    sessionStorage.setItem('openPreviewTaskIds', JSON.stringify([taskId]));
                }


                // נקה את כל ה-classes הקודמים וקבע למצב טעינה
                icon.classList.remove('fa-chevron-down', 'fa-chevron-up', 'fa-refresh', 'fa-spin', 'fa-exclamation-triangle');
                icon.classList.add('fa-refresh', 'fa-spin');
                currentButton.disabled = true;
                try {
                    const response = await fetch(`/tasks/${taskId}`); if (!response.ok) throw new Error(`Fetch error: ${response.status}`);
                    const doc = new DOMParser().parseFromString(await response.text(), 'text/html'); const allItems = [];

                    // Extract notes from the fetched task page
                    let notesText = '';
                    let isReady = false;
                    const notesEl = doc.querySelector('.bg-yellow .hover-copy'); // Assuming this is the selector for notes
                    if (notesEl) {
                        notesText = notesEl.textContent.trim();
                        // Check if notes contain "מוכן" for highlighting
                        if (notesText.includes('מוכן')) {
                            isReady = true;
                        }
                    }

                    const productTable = findProductTableInScope(doc);
                    if (productTable) {
                        const headers = Array.from(productTable.querySelectorAll('thead th')).map(th => th.textContent.trim());
                        // שיפור: זיהוי גמיש יותר של כותרות - מזהה גם וריאציות של הכותרות
                        const skuIndex = headers.findIndex(h => h.includes('מק')),
                              nameIndex = headers.findIndex(h => h.includes('שם')),
                              quantityIndex = headers.findIndex(h => h.includes('כמות') || h.includes('לוקט')),
                              priceIndex = headers.findIndex(h => h.includes('מחיר ליחידה'));
                        if (skuIndex !== -1 && nameIndex !== -1 && quantityIndex !== -1) {
                            productTable.querySelectorAll('tbody tr').forEach(itemRow => {
                                const cells = itemRow.cells;
                                const name = cells[nameIndex].textContent.trim(),
                                      sku = cells[skuIndex].textContent.trim(),
                                      quantity = cells[quantityIndex].textContent.trim();

                                // חלץ מחיר אם קיים
                                let price = null;
                                if (priceIndex !== -1 && cells[priceIndex]) {
                                    const priceText = cells[priceIndex].textContent.trim();
                                    const priceMatch = priceText.match(/[\d,]+\.?\d*/);
                                    if (priceMatch) {
                                        price = priceMatch[0].replace(/,/g, '');
                                    }
                                }

                                // Try to find image match - first with original SKU, then with replaced barcode
                                let imageMatch = findImageMatch(sku, name);
                                const barcodeMatch = findBarcode(sku, name);
                                
                                // If no image found with original SKU, try with the barcode
                                if (!imageMatch && barcodeMatch) {
                                    imageMatch = findImageMatch(barcodeMatch, name);
                                }
                                
                                allItems.push({
                                    name,
                                    sku,
                                    quantity,
                                    price,
                                    image: imageMatch ? imageMatch.image : PLACEHOLDER_IMG_URL,
                                    barcode: barcodeMatch
                                });
                            });
                        }
                    }
                    const newRow = document.createElement('tr'); newRow.id = `preview-for-${taskId}`;
                    if (isReady) {
                        newRow.classList.add('ready-row-highlight');
                    }
                    const newCell = document.createElement('td'); newCell.colSpan = parentRow.cells.length; newCell.style.cssText = 'padding: 15px; background-color: #f9f9f9;';



                    newCell.innerHTML = `<a href="/tasks/${taskId}" target="_blank" class="btn btn-primary btn-sm mb-3"><i class="fa-light fa-arrow-up-right-from-square" style="margin-left: 5px;"></i> פתח הזמנה</a>`;

                    // Create expandable sections (initially hidden)
                    const calculatorSection = document.createElement('div');
                    calculatorSection.className = 'preview-section calculator-section';
                    calculatorSection.style.cssText = 'display: none; margin-bottom: 10px;';

                    // Create sticky note section variable (will be null if no notes)
                    let stickyNoteSection = null;
                    
                    // Only create sticky note section if there are notes
                    if (notesText && notesText.trim()) {
                        stickyNoteSection = document.createElement('div');
                        stickyNoteSection.className = 'preview-section sticky-note-section';
                        stickyNoteSection.style.cssText = 'display: none; margin-bottom: 10px;';

                        // Highlight "מוכן" in bold if present
                        const highlightedNotes = notesText.replace(/מוכן/g, '<strong>מוכן</strong>');
                        stickyNoteSection.innerHTML = `<div class="preview-notes"><i class="fa-light fa-note-sticky"></i> ${highlightedNotes}</div>`;
                    }

                    if (allItems.length > 0) {
                        const container = document.createElement('div'); container.style.cssText = 'display: flex; flex-wrap: wrap; gap: 8px;';
                        allItems.forEach((item, itemIndex) => {
                            if (window.DEBUG_TOOLBOX) {

                            }
                            const itemDiv = document.createElement('div'); itemDiv.className = 'd-flex align-items-center border rounded p-2 m-1 bg-white';
                            const img = document.createElement('img'); img.src = item.image;
                            img.style.cssText = 'width: 50px; height: 50px; object-fit: contain; margin-left: 10px; cursor: pointer;';
                            img.onerror = function() { this.src = PLACEHOLDER_IMG_URL; this.style.cursor = 'default'; };
                            img.onclick = () => {
                                // השתמש במחיר שכבר חולץ
                                const galleryData = allItems.map(i => {
                                    return {
                                        fullSizeUrl: getOptimizedImageUrl(getFullSizeImageUrl(i.image), Math.min(window.innerWidth, 1200)),
                                        thumbnailUrl: getOptimizedImageUrl(i.image, 300),
                                        productName: i.name,
                                        sku: i.sku,
                                        quantity: i.quantity,
                                        price: i.price,
                                        link: null // Preview doesn't have direct product links
                                    };
                                });

                                showGalleryOverlay(galleryData, itemIndex);
                            };
                            itemDiv.appendChild(img);
                            const textDiv = document.createElement('div');
                            let skuDisplay = `מק"ט: ${item.sku}`;
                            if (settings.replaceBarcodes && item.barcode && item.barcode !== item.sku) {
                                skuDisplay = `מק"ט: <strong class="barcode-highlight" title="מקורי: ${item.sku}">${item.barcode}</strong>`;
                            }
                            // הוסף מחיר לתצוגה
                            let priceDisplay = '';
                            let priceClass = '';
                            if (item.price) {
                                const priceNum = parseFloat(item.price);
                                if (!isNaN(priceNum)) {
                                    // הדגש מחירים גבוהים
                                    if (priceNum > 1000) {
                                        priceClass = 'text-danger font-weight-bold';
                                    } else if (priceNum > 500) {
                                        priceClass = 'text-warning font-weight-bold';
                                    }

                                    // חשב מחיר כולל כמות
                                    const quantityParts = item.quantity.split('/').map(part => part.trim());
                                    const totalQuantity = parseInt(quantityParts[0]) || 1;
                                    const pickedQuantity = quantityParts.length > 1 ? parseInt(quantityParts[1]) || 0 : totalQuantity;

                                    // השתמש בכמות השנייה (המלוקטת) לחישוב הסה"כ, או בכמות הראשונה אם אין כמות שנייה
                                    const quantityForCalculation = quantityParts.length > 1 ? pickedQuantity : totalQuantity;
                                    const totalItemPrice = priceNum * quantityForCalculation;

                                    priceDisplay = ` | מחיר: <span class="${priceClass}">₪${priceNum.toLocaleString('he-IL', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>`;

                                    // הוסף מחיר כולל תמיד אם יש מחיר
                                    if (priceNum > 0) {
                                        const isNotPicked = quantityParts.length > 1 && pickedQuantity === 0;
                                        const statusText = isNotPicked ? ' (לא מלוקט)' : '';
                                        priceDisplay += ` <span class="text-muted">(סה"כ: ₪${totalItemPrice.toLocaleString('he-IL', {minimumFractionDigits: 2, maximumFractionDigits: 2})}${statusText})</span>`;
                                    }
                                }
                            }

                            // Highlight pick quantities in preview
                            let highlightedQuantity = item.quantity;
                            const quantityMatch = item.quantity.match(/^(\d+)\s*\/\s*(\d+)$/);
                            if (quantityMatch) {
                                const picked = parseInt(quantityMatch[1]);
                                const total = parseInt(quantityMatch[2]);
                                
                                if (picked !== 0 || total !== 1) { // Skip 0/1
                                    const quantityClass =
                                        picked === total ? 'tampermonkey-picked-full' :
                                        picked === 0 && total > 1 ? 'tampermonkey-picked-none' :
                                        'tampermonkey-picked-partial';
                                    
                                    highlightedQuantity = `<span class="${quantityClass}">${item.quantity}</span>`;
                                }
                            }
                            
                            textDiv.innerHTML = `<div class="font-weight-bold" style="font-size:0.9rem;">${item.name}</div><div class="text-muted" style="font-size:0.8rem;">${skuDisplay} | כמות: ${highlightedQuantity}${priceDisplay}</div>`;
                            itemDiv.appendChild(textDiv); container.appendChild(itemDiv);
                        });
                        newCell.appendChild(container);

                        // Create minimized icons container (after items)
                        const minimizedIconsContainer = document.createElement('div');
                        minimizedIconsContainer.className = 'preview-minimized-icons';
                        minimizedIconsContainer.style.cssText = 'display: flex; gap: 8px; margin-top: 15px;';

                        // Check if there are items with prices first
                        const itemsWithPrice = allItems.filter(item => {
                            const price = parseFloat(item.price);
                            return item.price && !isNaN(price) && price > 0;
                        });

                        // Only create calculator icon button if there are items with prices
                        if (itemsWithPrice.length > 0) {
                            const calculatorButton = document.createElement('button');
                            calculatorButton.className = 'btn btn-sm btn-icon btn-light-primary preview-icon-btn calculator-btn';
                            calculatorButton.innerHTML = '<i class="fa-light fa-calculator"></i>';
                            calculatorButton.title = 'סה"כ הזמנה';
                            calculatorButton.style.cssText = 'width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;';

                            // Add click handler for calculator icon
                            calculatorButton.addEventListener('click', (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                togglePreviewSection(calculatorButton, 'calculator');
                            });

                            minimizedIconsContainer.appendChild(calculatorButton);
                        }
                        
                        // Only create sticky note button if there are notes
                        if (notesText && notesText.trim()) {
                            const stickyNoteButton = document.createElement('button');
                            stickyNoteButton.className = 'btn btn-sm btn-icon btn-light-primary preview-icon-btn sticky-note-btn';
                            stickyNoteButton.innerHTML = '<i class="fa-light fa-note-sticky"></i>';
                            stickyNoteButton.title = 'הערות';
                            stickyNoteButton.style.cssText = 'width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;';

                            stickyNoteButton.addEventListener('click', (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                togglePreviewSection(stickyNoteButton, 'sticky-note');
                            });

                            minimizedIconsContainer.appendChild(stickyNoteButton);
                        }
                        
                        // Only append the icons container if it has any buttons
                        if (minimizedIconsContainer.children.length > 0) {
                            newCell.appendChild(minimizedIconsContainer);
                        }

                        // Append sticky note section after items and icons
                        if (stickyNoteSection) {
                            newCell.appendChild(stickyNoteSection);
                        }

                        // הוסף סיכום מחירים
                        if (itemsWithPrice.length > 0) {
                            // חשב סה"כ הזמנה לפי הכמות השנייה (המלוקטת) או הראשונה אם אין שנייה
                            const totalPrice = itemsWithPrice.reduce((sum, item) => {
                                const price = parseFloat(item.price);
                                const quantityParts = item.quantity.split('/').map(part => part.trim());
                                const quantity = quantityParts.length > 1 ? parseInt(quantityParts[1]) || 0 : parseInt(quantityParts[0]) || 1;
                                return sum + (price * quantity);
                            }, 0);

                            if (totalPrice > 0) {
                                const summaryDiv = document.createElement('div');
                                summaryDiv.style.cssText = 'padding: 10px; background-color: #e8f5e8; border-radius: 5px; border: 1px solid #d4edda;';

                                let summaryHTML = `
                                    <div style="font-weight: bold; color: #155724; font-size: 1.1rem;">
                                        <i class="fa-light fa-calculator" style="margin-left: 5px;"></i>
                                        סה"כ הזמנה: ₪${totalPrice.toLocaleString('he-IL', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                    </div>
                                `;

                                summaryHTML += `
                                    <div style="font-size: 0.9rem; color: #6c757d; margin-top: 5px;">
                                        מחושב לפי ${itemsWithPrice.length} פריטים עם מחיר
                                    </div>
                                `;

                                summaryDiv.innerHTML = summaryHTML;
                                calculatorSection.appendChild(summaryDiv);
                                newCell.appendChild(calculatorSection);
                            }
                        }
                    } else { newCell.innerHTML += '<div class="text-center text-muted p-2">לא נמצאו פריטים.</div>'; }
                    newRow.appendChild(newCell);
                    updateButtonState(currentButton, true);
                    parentRow.after(newRow);
                    currentButton.blur(); // מסיר פוקוס מהכפתור כדי שמקשי חץ יעבדו על ה-side panel

                    // מונע מה-preview לקבל focus כדי לא להפריע לניווט המקורי של lionwheel
                    newRow.setAttribute('tabindex', '-1');
                    newRow.style.outline = 'none';

                    // מונע מה-preview לקבל focus דרך מקשי חץ
                    newRow.addEventListener('keydown', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        return false;
                    }, { passive: false });

                    // מונע מה-preview לקבל focus דרך לחיצה
                    newRow.addEventListener('mousedown', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        return false;
                    }, { passive: false });




                                  } catch (err) {
                    console.error("Failed to fetch task preview:", err);
                    // במקרה של שגיאה, נקה את כל ה-classes וחזור למצב סגור
                    icon.classList.remove('fa-refresh', 'fa-spin');
                    icon.classList.add('fa-exclamation-triangle');
                    updateButtonState(currentButton, false);
                  } finally {
                    icon.classList.remove('fa-spin');
                    currentButton.disabled = false;

                  }
            }, { passive: false });
            row.setAttribute('data-preview-processed', 'true');
        });
        mainTableBody.setAttribute('data-preview-injected', 'true');

        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Error injecting preview functionality:`, error);
        }
    }
    // MODIFICATION END: This is where the correct injectPreviewFunctionality function ends.

    function addResponsiveDataAttributes(table) {
        try {
            if (!settings || !settings.enableResponsive || !table) return;

            // Clear old labels
            table.querySelectorAll('tbody td[data-label]').forEach(td => td.removeAttribute('data-label'));

            // קח את כל הכותרות כולל preview, ריקים ומוסתרים
            const allHeaders = Array.from(table.querySelectorAll('thead th'));

            table.querySelectorAll('tbody tr').forEach((row) => {
                const allCells = Array.from(row.querySelectorAll('td'));
                allCells.forEach((cell, i) => {
                    const header = allHeaders[i];
                    if (header) {
                        const label = header.textContent.trim();
                        if (label) {
                            cell.setAttribute('data-label', label);
                        }
                    }
                });
            });

            table.setAttribute('data-responsive-labels-added', 'true');

            // NEW: Also replace barcodes when adding responsive attributes
            if (settings && settings.replaceBarcodes) {
                replaceBarcodesInViews(table);
            }
            
            // NEW: Also highlight pick quantities after adding responsive attributes
            highlightPickQuantities();
        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Error adding responsive data attributes:`, error);
        }
    }

    // MODIFICATION START: Updated tagColumnsForHiding to accept a scope parameter
    function tagColumnsForHiding(scope = document) { // Default scope is document
    // MODIFICATION END
        try {
            // Process main tables if the scope is the whole document or contains them
            if (scope === document) { // Only process main tables if the overall document is the target
            scope.querySelectorAll('#taskOverview table, #kt_content table').forEach(table => {
                // MODIFICATION START: Ensure empty TH (th.noVis.pt-2) is handled
                // We are NOT hiding it using tm-hideable-column anymore.
                // We are just making it small via its direct class in CSS.
                // This block is no longer needed here, as the CSS targets directly.
                /*
                const emptyHeaderTh = table.querySelector('th.noVis.pt-2.sorting_disabled[data-column-index="1"]');
                if (emptyHeaderTh) {
                    emptyHeaderTh.classList.add('tm-icon-column-header'); // This used to hide it.
                }
                */
                // MODIFICATION END

                if (table.hasAttribute('data-columns-tagged')) return; // Skip if main table already processed

                const headersToHide = ['סוג', 'משקל', 'נפח', 'הערות'];
                Array.from(table.querySelectorAll('thead th')).forEach((th, index) => {
                    if (headersToHide.includes(th.textContent.trim())) {
                        th.classList.add('tm-hideable-column');
                        table.querySelectorAll(`tbody tr td:nth-child(${index + 1})`).forEach(td => td.classList.add('tm-hideable-column'));
                    }
                });
                const historyHeader = table.querySelector('thead th:has(i.fa-history), thead th.w-50px');
                if(historyHeader) historyHeader.classList.add('tm-hideable-column');
                table.querySelectorAll('tbody td:has(i.order-item-history-json)').forEach(cell => cell.classList.add('tm-hideable-column'));
                table.setAttribute('data-columns-tagged', 'true'); // Mark main tables as tagged
            });
        }

        // Process the modal form specifically (or any form within the given scope)
        const modalForm = scope.querySelector('form[id^="edit_task_"]');
        if (modalForm) { // Always process the modal form when called, to catch new rows
            const headersToHide = ['סוג', 'משקל', 'נפח', 'הערות'];
            const headerTitles = Array.from(modalForm.querySelectorAll('.order-item-header .order-item-header-title'));
            headerTitles.forEach((title) => {
                if (headersToHide.includes(title.textContent.trim())) {
                    title.classList.add('tm-hideable-column');
                }
            });
            // This is the crucial part for newly added rows:
            modalForm.querySelectorAll('.nested-fields.order-item-row').forEach(row => {
                // Ensure each row's inputs also get the hiding class
                headersToHide.forEach(headerText => {
                    // Find the corresponding input parent container
                    const targetInputParent = Array.from(row.querySelectorAll('.order-item-input')).find(inputDiv => {
                        const mobileHeader = inputDiv.querySelector('.mobile-size-header');
                        // Use the placeholder attribute to identify the input, as mobile-size-header might not always be there
                        const inputElement = inputDiv.querySelector('input');
                        return (mobileHeader && mobileHeader.textContent.trim() === headerText) ||
                               (inputElement && inputElement.getAttribute('placeholder') === headerText);
                    });
                    if (targetInputParent) {
                        targetInputParent.classList.add('tm-hideable-column');
                    }
                });
            });
            // Do NOT set data-columns-tagged on the modal form itself, as we want this to re-run for new rows.
        }
        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Error tagging columns for hiding:`, error);
        }
    }
    // MODIFICATION END

function injectWhatsAppButtons() {
    try {
        if (!settings || !settings.addWhatsApp) return;

    const createWhatsAppLink = (phone, firstName) => {
        const numberForLink = `972${phone.replace(/\D/g, '').substring(1)}`;
        let href = `https://wa.me/${numberForLink}`;
        if (firstName) {
            const text = `שלום ${firstName}, זה מאניפט חוצות.`;
            href += `?text=${encodeURIComponent(text)}`;
        }
        const whatsappLink = document.createElement('a');
        whatsappLink.href = href;
        whatsappLink.target = 'whatsapp_window';
        whatsappLink.className = 'whatsapp-button';
        whatsappLink.title = 'שלח הודעה ב-WhatsApp';
        whatsappLink.innerHTML = '<i class="fa-brands fa-whatsapp"></i>'; // This icon is from FontAwesome, make sure it's loaded if needed
        whatsappLink.onclick = e => e.stopPropagation();
        return whatsappLink;
    };
    const findFirstName = (container) => {
        if (!container) return null;
        const nameEl = container.querySelector('[data-name="destination_recipient_name"] .hover-copy, a[href*="/crm/"], td[data-label="שם"]');
        if (nameEl && nameEl.textContent.trim()) {
            const fullName = nameEl.textContent.trim();
            const validNameRegex = /^[a-zA-Z\u0590-\u05FF\s]+$/;
            if (!validNameRegex.test(fullName) || fullName.startsWith('PA_') || fullName.startsWith('CU_')) {
                return null;
            }
            return fullName.split(' ')[0];
        }
        return null;
    };
    const prefixes = ['050', '051', '052', '053', '054', '055', '056', '058', '059'];
    const phoneRegex = new RegExp(`(^|[^\\d])(${prefixes.join('|')})[\\s-]?\\d{3}[\\s-]?\\d{4}\\b`, 'g');
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: node => (node.parentElement.closest('a, button, script, style, .whatsapp-injected') || node.nodeValue.trim().length < 9) ? NodeFilter.REJECT : (phoneRegex.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.REJECT) });
    const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(textNode => {
        const parent = textNode.parentNode;
        if (parent.closest('.whatsapp-injected')) return;
        const scope = parent.closest('.card, tr, .panel_view, .px-3');
        const firstName = findFirstName(scope);
        let lastIndex = 0;
        const fragment = document.createDocumentFragment();
        textNode.nodeValue.replace(phoneRegex, (match, p1, p2, offset) => {
            const phoneText = match.substring(p1.length);
            if(offset > lastIndex) fragment.appendChild(document.createTextNode(textNode.nodeValue.substring(lastIndex, offset + p1.length)));
            const phoneSpan = document.createElement('span');
            phoneSpan.className = 'whatsapp-injected';
            phoneSpan.appendChild(createWhatsAppLink(phoneText, firstName));
            phoneSpan.appendChild(document.createTextNode(" " + phoneText));
            fragment.appendChild(phoneSpan);
            lastIndex = offset + match.length;
        });
        if (lastIndex > 0) {
            if (lastIndex < textNode.nodeValue.length) fragment.appendChild(document.createTextNode(textNode.nodeValue.substring(lastIndex)));
            parent.replaceChild(fragment, textNode);
        }
    });
        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Error injecting WhatsApp buttons:`, error);
        }
}


// ---< Global Styles >---

function initializeSidePanelResizeObserver() {
  try {
    (function () {
      // CONFIG
      const PANEL_SELECTOR = '.offcanvas.offcanvas-right.offcanvas-custom.resizable';
      const GAP_BUFFER_PX = 16; // small safety margin for margins/borders/shadows

      const root = document.documentElement;

      function measurePanelWidth() {
        // Try the specific selector first
        let panel = document.querySelector(PANEL_SELECTOR);
        
        // If not found, try finding via desktop-map-container (fallback)
        if (!panel) {
          const container = document.getElementById('desktop-map-container');
          if (container) {
            panel = container.closest('.offcanvas') || container;
          }
        }
        
        if (!panel) return 0;
        
        const rect = panel.getBoundingClientRect();
        
        // Check if panel is actually visible and has dimensions
        if (rect.width <= 0 || rect.height <= 0) return 0;
        
        return Math.max(0, Math.round(rect.width)); // integer px
      }

      function applyGapVars() {
        const gap = measurePanelWidth();
        root.style.setProperty('--map-gap', `${gap}px`);
        root.style.setProperty('--map-gap-buffered', `${gap + GAP_BUFFER_PX}px`);
      }

      // Initial apply
      applyGapVars();

      // Re-apply on window resize
      window.addEventListener('resize', applyGapVars, { passive: true });

      // Re-apply on panel resize (live drag)
      const panel = document.querySelector(PANEL_SELECTOR) || 
                   document.getElementById('desktop-map-container')?.closest('.offcanvas');
      if (panel) {
        const ro = new ResizeObserver(() => applyGapVars());
        ro.observe(panel);
      }

      // Optional: if the preview rows are injected later, re-apply when they appear
      const mo = new MutationObserver(() => applyGapVars());
      mo.observe(document.body, { childList: true, subtree: true });
    })();
  } catch (err) {
    console.error('[Toolbox] Error initializing side panel ResizeObserver:', err);
  }
}

function injectGlobalStyles() {
        try {
        if (document.getElementById('tampermonkey-styles')) return;
    const css = `

    .whatsapp-injected, a.whatsapp-injected { display: inline-flex !important; align-items: center; white-space: nowrap; vertical-align: middle; }
.whatsapp-button i { font-size: 1.6em; height: 30px; line-height: 30px; color: #3699ff !important; transition: color 0.2s ease-in-out; margin-left: 5px; }
.whatsapp-button:hover i { color: #0073e9 !important; }

    .lwh-whatsapp-button {
    display: inline-block;
    margin-left: 6px;
    background-color: #25D366;
    color: white;
    border-radius: 4px;
    padding: 2px 5px;
    font-size: 12px;
    text-decoration: none;
}
.lwh-whatsapp-button:hover {
    background-color: #1ebe5d;
}

tr[id^="preview-for-"] td div.font-weight-bold.copy-enabled {
    color: #505050;
}

/* Enhanced Gallery Styles */
.gallery-sku {
    font-size: 1em;
    color: #ccc;
    margin: 0;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.4); /* Subtle raised effect */
}

.gallery-price {
    font-size: 1.1em;
    color: #ccc;
    font-weight: bold;
    margin: 0;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.4); /* Subtle raised effect */
}

.gallery-product-link {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: #3699ff;
    text-decoration: none;
    font-size: 0.9em;
    margin-top: 5px;
    padding: 5px 10px;
    border: 1px solid #3699ff;
    border-radius: 4px;
    transition: all 0.3s ease;
}

.gallery-product-link:hover {
    background-color: #3699ff;
    color: white;
    text-decoration: none;
}

.gallery-counter {
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 1.05em;
    text-align: center;
    color: inherit;
    margin: 0;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.4); /* Subtle raised effect */
}

/* Gallery-specific picked status indicators with raised effect */
.gallery-counter .tampermonkey-picked-none,
.gallery-counter .tampermonkey-picked-partial,
.gallery-counter .tampermonkey-picked-full {
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.4); /* Subtle raised effect */
}

/* Loading Indicator */
.gallery-loading {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 5;
}

.gallery-loading .spinner {
    width: 40px;
    height: 40px;
    border: 4px solid rgba(255, 255, 255, 0.3);
    border-top: 4px solid #3699ff;
    border-radius: 50%;
    animation: spin 1s linear infinite;
}

@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}

/* Image Container with Zoom Support */
.gallery-image-container {
    position: relative;
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100vh; /* Full viewport height for maximum image display */
    max-height: 100vh;
    overflow: hidden;
    cursor: zoom-in;
    touch-action: pan-x pan-y pinch-zoom; /* Allow pan and pinch-zoom, but prevent other gestures */
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
    user-select: none;
}

.gallery-image-container img {
    transition: opacity 0.3s ease, transform 0.3s ease;
    cursor: zoom-in;
    touch-action: pan-x pan-y pinch-zoom; /* Allow pan and pinch-zoom, but prevent other gestures */
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
    user-select: none;
    width: 100%;
    height: 100%;
    object-fit: contain;
    object-position: center;
}

.gallery-image-container.zoomed img {
    cursor: move;
}

/* Touch feedback for pinch-to-zoom */
.gallery-image-container.zoomed::after {
    content: "\f002";
    font-family: "Font Awesome 6 Pro", "Font Awesome 6 Free", "FontAwesome";
    font-weight: 300;
    position: absolute;
    top: 10px;
    right: 10px;
    background: rgba(0, 0, 0, 0.7);
    color: white;
    padding: 5px 8px;
    border-radius: 4px;
    font-size: 12px;
    z-index: 10;
    pointer-events: none;
}

/* Prevent text selection during touch interactions */
.gallery-image-container * {
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    -khtml-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
    user-select: none;
}

/* Zoom Controls */
.gallery-zoom {
    position: absolute;
    top: 60px;
    background: rgba(0, 0, 0, 0.7);
    color: white;
    border: none;
    border-radius: 4px;
    padding: 8px 12px;
    font-size: 16px;
    cursor: pointer;
    transition: background 0.3s ease;
    z-index: 20;
}

.gallery-zoom:hover {
    background: rgba(0, 0, 0, 0.9);
}

.gallery-zoom:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.gallery-zoom.zoom-in {
    right: 80px;
}

.gallery-zoom.zoom-out {
    right: 120px;
}

.gallery-zoom.reset-zoom {
    right: 160px;
}

/* Thumbnails instead of dots */
.gallery-thumbnails {
    position: relative;
    display: flex;
    gap: 8px;
    max-width: 80vw;
    overflow-x: auto;
    padding: 10px;
    background: rgba(0, 0, 0, 0.7);
    border-radius: 12px;
    margin: 0 auto;
    justify-content: center;
    box-sizing: border-box;
}

.gallery-thumbnail {
    width: 60px;
    height: 60px;
    border: 2px solid transparent;
    border-radius: 8px;
    overflow: hidden;
    cursor: pointer;
    transition: all 0.3s ease;
    flex-shrink: 0;
    touch-action: manipulation; /* Ensure thumbnails work properly on touch devices */
}

.gallery-thumbnail:hover {
    border-color: #3699ff;
    transform: scale(1.05);
}

.gallery-thumbnail.active {
    border-color: #3699ff;
    box-shadow: 0 0 10px rgba(54, 153, 255, 0.5);
}

.gallery-thumbnail img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.3s ease;
    border-radius: 8px;
}

.gallery-thumbnail:hover img {
    transform: scale(1.1);
}

/* Enhanced Caption */
.gallery-caption {
    position: relative;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    text-align: center;
    color: #fff;
    background: transparent;
    padding: 15px 20px;
    border-radius: 0;
    box-sizing: border-box;
    min-height: 40px; /* Reduced height to minimize dead space */
    flex-shrink: 0;
}

/* Footer container for caption and thumbnails */
.gallery-footer {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 10px;
    flex-shrink: 0;
    background: transparent;
    min-height: 0;
    box-sizing: border-box;
}

/* Top info container */
.gallery-top-info {
    padding: 12px;
    background: transparent;
    color: #fff;
    border-bottom: none;
    flex-shrink: 0;
    box-sizing: border-box;
}



/* Enhanced Navigation Buttons */
.gallery-nav {
    transition: all 0.3s ease;
}

.gallery-nav:hover {
    background: rgba(0, 0, 0, 0.8) !important;
}

/* Smooth Transitions */
#tampermonkey-gallery-overlay {
    transition: opacity 0.3s ease;
}

/* Responsive Design for Thumbnails */
@media (max-width: 768px) {
    .gallery-thumbnails {
        max-width: 90vw;
        gap: 4px;
        padding: 8px;
    }

    .gallery-thumbnail {
        width: 50px;
        height: 50px;
    }

    .gallery-caption {
        padding: 10px 15px;
        font-size: 14px;
    }
    
    .gallery-footer {
        padding: 8px;
        gap: 8px;
    }
    
    .gallery-top-info {
        padding: 8px;
    }
    
    .gallery-image-container {
        padding: 12px;
    }
    

}

.tampermonkey-picked-none {
    color: #ff0000 !important;
    font-weight: bold;
}

.tampermonkey-picked-partial {
    color: #FFA500 !important;
    font-weight: bold;
}

.tampermonkey-picked-full {
    color: #008000 !important;
    font-weight: bold;
}



                /* Stronger selector for hover */
            td.copy-enabled:hover,
            div.copy-enabled:hover,
            span.copy-enabled:hover,
            strong.copy-enabled:hover {
            background-color: #F5FAFF !important;
}


table td.sorting_1.copy-enabled.cell-copied {
    background-color: #CDE5FF !important;

}


    td.copy-enabled.cell-copied {
    background-color: #CDE5FF !important;
}

td.copy-enabled {
    cursor: copy;
    transition: background-color 0.3s ease;
}

td.copy-enabled:hover {
    background-color: #F5FAFF !important;
}

/* Prevent blue hover on quantity/לוקט cells even if copy-enabled is accidentally added */
td.copy-enabled[data-label="כמות / לוקט"]:hover,
td.copy-enabled[data-label="כמות / לוקט"]:active {
    background-color: transparent !important;
}

td.copy-enabled.cell-copied {
    background-color: #CDE5FF !important;
}


        .copy-enabled {
            cursor: copy;
            transition: background-color 0.3s ease;
        }
            tr[id^="visit-row-"] td.copy-enabled:hover {
            background-color: rgba(225, 240, 255, 0.5) !important;
            transition: background-color 0.2s ease;
}

        /* MODIFICATION START: Explicitly set width/padding for th.noVis.pt-2 and td.noVis.pt-2 */
        th.noVis.pt-2.sorting_disabled[data-column-index="1"],
        td.noVis.pt-2 {
            width: 25px !important;
            min-width: 25px !important;
            max-width: 25px !important;
            padding: 0 !important;
            text-align: center !important;
            box-sizing: border-box !important;
            overflow: visible !important;
        }
        th.noVis.pt-2.sorting_disabled[data-column-index="1"] {
            display: table-cell !important;
        }

        #scriptStatusNotifier {
            position: fixed; top: 10px; right: 10px; z-index: 10000;
            background-color: #fff; padding: 8px 12px; border: 1px solid #ccc;
            border-radius: 5px; font-size: 12px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);
            opacity: 0; transition: opacity 0.5s ease-in-out;
        }

        .barcode-highlight {
            color: #006400 !important;
            font-weight: bold;
            cursor: help;
            transition: all 0.3s ease;
            animation: barcodeReplacement 0.5s ease-in-out;
        }
        .barcode-highlight-gallery {
            color: #90ee90 !important;
            font-weight: bold;
            cursor: help;
            transition: all 0.3s ease;
            animation: barcodeReplacement 0.5s ease-in-out;
        }
        td.barcode-highlight, tr[id^="preview-for-"] .barcode-highlight {
            background-color: #e6ffed;
            padding: 2px 4px;
            border-radius: 3px;
            transition: all 0.3s ease;
            animation: barcodeReplacement 0.5s ease-in-out;
        }

        /* ביטול הבהוב ב-PREVIEW */
        tr[id^="preview-for-"] .barcode-highlight {
            animation: none !important;
        }
        .pick-order-item-row .barcode-highlight { background-color: transparent !important; }
        /* Special handling for picking modal - prevent background color on the entire row */
        .pick-order-item-table .pick-order-item-row.barcode-highlight {
            background-color: transparent !important;
        }
        .pick-order-item-table .pick-order-item-row.barcode-highlight .barcode-highlight {
            background-color: #e6ffed !important;
            padding: 2px 4px !important;
            border-radius: 3px !important;
            transition: all 0.3s ease;
            animation: barcodeReplacement 0.5s ease-in-out;
        }
        /* Ensure barcode text in picking modal has proper styling */
        .pick-order-item-table .barcode-highlight {
            color: #006400 !important;
            font-weight: bold !important;
            cursor: help !important;
            transition: all 0.3s ease;
            animation: barcodeReplacement 0.5s ease-in-out;
        }
        .barcode-input-highlight {
            background-color: #e6ffed !important;
            color: #006400 !important;
            font-weight: bold;
            transition: all 0.3s ease;
            animation: barcodeReplacement 0.5s ease-in-out;
        }

        /* Barcode replacement animation */
        @keyframes barcodeReplacement {
            0% {
                opacity: 0.5;
                transform: scale(0.95);
            }
            100% {
                opacity: 1;
                transform: scale(1);
            }
        }

        /* Hover effects for barcode elements */
        .barcode-highlight:hover,
        .barcode-highlight-gallery:hover,
        .barcode-input-highlight:hover {
            background-color: #d4edda !important;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        #tampermonkey-gallery-overlay {
            position:fixed;top:0;left:0;width:100%;height:100%;
            background:rgba(0,0,0,.88);display:flex;flex-direction:column;justify-content:flex-start;align-items:stretch;padding:0;
            z-index:20000;opacity:0;transition:opacity .3s ease;box-sizing:border-box;overflow:hidden
        }
.gallery-image-container {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    position: relative;
    overflow: hidden;
    z-index: 1;
    flex: 1;
    padding: 16px;
    border-radius: 12px;
    min-height: 0; /* Important for flex child */
    box-sizing: border-box;
}

#tampermonkey-gallery-overlay img {
    display: block;
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    object-position: center;
    border-radius: 12px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
    transition: transform 0.1s ease-out;
    overflow: hidden;
}

.gallery-image-container.zoomed {
    cursor: grab;
    user-select: none;
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
}

.gallery-image-container.zoomed:active {
    cursor: grabbing;
}




.gallery-product-name {
    position: relative;
    font-size: 1.5em;
    font-weight: bold;
    color: white;
    text-align: center;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
    z-index: 10;
    padding: 6px 12px;
    background: transparent;
    border-top-left-radius: 8px;
    border-top-right-radius: 8px;
    box-sizing: border-box;
    margin: 0;
    width: 100%;
    flex-shrink: 0;
}

/* Product name link styles for tables and gallery */
td[data-label="שם"] a,
.gallery-product-name a {
    text-decoration: none;
}

td[data-label="שם"] a:hover,
.gallery-product-name a:hover {
    text-decoration: underline;
}

.fa-light.fa-clone,
.fa-light.fa-check {
    font-size: 0.9em;
    vertical-align: middle;
    transition: color 0.2s ease;
}

/* Ensure copy icons are positioned correctly for tooltips */
.fa-light.fa-clone,
.fa-light.fa-check {
    position: relative;
}

/* Copy icons positioning - inline with text */
.copy-icon-left {
    display: inline !important;
    vertical-align: middle !important;
}

/* Simple positioning for barcode cells - keep natural table flow */
td[data-label="מק״ט"] {
    white-space: nowrap !important;
}

td[data-label="מק״ט"] .fa-light.fa-clone,
td[data-label="מק״ט"] .fa-light.fa-check {
    margin-left: 4px !important;
    margin-right: 0px !important;
    font-size: 0.85em;
}

/* Simple positioning for product name cells - keep natural table flow */
td[data-label="שם"] {
    text-align: right !important;
}

td[data-label="שם"] .fa-light.fa-clone,
td[data-label="שם"] .fa-light.fa-check {
    float: left !important; /* Float to the left (end of RTL text) */
    margin-left: 0px !important;
    margin-right: 4px !important;
    font-size: 0.85em;
}

/* עטיפה אחידה לטקסט+אייקון, כמו בטבלה */
.tampermonkey-copy-wrap{display:inline-flex;align-items:center;gap:4px;white-space:nowrap;unicode-bidi:plaintext}
.gallery-barcode-bdi{direction:ltr;unicode-bidi:plaintext}
.gallery-name-bdi{direction:auto;unicode-bidi:plaintext}
.gallery-product-name .fa-light.fa-clone{font-size:.85em;cursor:pointer;color:#3699ff}
.gallery-product-info .fa-light.fa-clone{margin-left:4px;margin-right:0;cursor:pointer;color:#3699ff}
.gallery-product-name .fa-light.fa-clone:hover{color:#0073e9}
.gallery-product-info .fa-light.fa-clone:hover{color:#0073e9}

/* Gallery SKU line: תן לכיווניות להיגזר מהתוכן; נבודד את הספרות עם BDI */
.gallery-product-info {
    text-align: center;
    position: relative !important;
    margin: 10px 0;
    padding: 4px 8px;
    background: transparent;
    color: white;
}

.gallery-product-info .fa-light.fa-clone,
.gallery-product-info .fa-light.fa-check {
    margin-left: 4px !important;
    margin-right: 0px !important;
}

.gallery-sku, .gallery-price {
    font-size: 1.1em;
    font-weight: normal;
    margin: 0;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.9);
}

.gallery-product-link {
    position: absolute;
    top: 8px;
    right: 8px;
    background: rgba(0,0,0,0.6);
    color: #fff;
    padding: 6px;
    border-radius: 50%;
    text-decoration: none;
    z-index: 20;
    transition: all 0.3s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    box-sizing: border-box;
    font-size: 14px;
    font-weight: bold;
}

.gallery-product-link:hover {
    background: rgba(0, 0, 0, 0.9);
    transform: scale(1.1);
}

/* Gallery product link removed - using link in title instead */

.gallery-product-link i {
    font-size: 16px;
}



        .gallery-close, .gallery-nav {
            position:absolute;background:rgba(0,0,0,.3);color:#fff;border:none;
            cursor:pointer;font-weight:700;transition:background .2s ease;
            user-select:none;border-radius:8px;z-index:5;
            touch-action: manipulation; /* Ensure buttons work properly on touch devices */
        }
        .gallery-close:hover, .gallery-nav:hover { background:rgba(0,0,0,.6) }
        .gallery-close {
            top:10px;right:15px;font-size:48px;padding:0 15px;line-height:1;z-index:10
        }
        .gallery-nav {
            top:50%;transform:translateY(-50%);font-size:40px;padding:5px 20px
        }
        .gallery-nav.prev { right:15px }
        .gallery-nav.next { left:15px }


        .preview-cell {
            background-color: inherit !important;
            text-align: center !important;
        }
        .preview-cell button i { transition:transform .2s ease-in-out }
        .preview-cell i.fa-chevron-up { transform:rotate(180deg) }

        .preview-toggle-all-button {
            transition: background-color 0.15s ease, color 0.15s ease;
        }
        .preview-toggle-all-button:hover {
            background-color: #3699ff !important;
            color: #ffffff !important;
        }
        .preview-toggle-all-button i { margin: 0 !important; }

        .preview-notes {
            background-color: #fff3cd !important; color: #8f6304;
            padding: 10px; margin-bottom: 10px; border-radius: 4px;
            border: 1px solid #ffeb3b;
        }
        .preview-notes i {
            margin-left: 5px;
            margin-right: 8px;
            color: #dd9803;
        }

        /* Minimized preview icons styles */
        .preview-minimized-icons {
            display: flex;
            gap: 8px;
            margin-bottom: 10px;
        }

        .preview-icon-btn {
            width: 32px !important;
            height: 32px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            border-radius: 6px !important;
            transition: all 0.2s ease-in-out !important;
            background-color: #f8f9fa !important;
            border: 1px solid #dee2e6 !important;
            color: #6c757d !important;
        }

        .preview-icon-btn:hover {
            background-color: #e9ecef !important;
            border-color: #adb5bd !important;
            color: #495057 !important;
            transform: scale(1.05);
        }

        .preview-icon-btn.active {
            background-color: #007bff !important;
            border-color: #007bff !important;
            color: #ffffff !important;
        }

        .preview-icon-btn.active:hover {
            background-color: #0056b3 !important;
            border-color: #0056b3 !important;
        }

        .preview-section {
            margin-bottom: 10px;
            animation: slideDown 0.3s ease-out;
        }

        @keyframes slideDown {
            from {
                opacity: 0;
                transform: translateY(-10px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .btn-group.btn-group-sm.m-1:has(#expand-all-btn),
        a#expand-all-btn {
            display: none !important;
        }

        body.tampermonkey-hide-columns-enabled .tm-hideable-column {
            display: none !important;
        }

        @media (min-width:768px){
            body.tampermonkey-hide-columns-enabled #order-items-edit-modal .modal-dialog {
                max-width: 850px !important;
            }
            body.tampermonkey-hide-columns-enabled #order-items-edit-modal .order-item-input.order-item-big,
            body.tampermonkey-hide-columns-enabled #order-items-edit-modal .order-item-header-title.order-item-big {
                width: calc(55% - 1rem) !important;
            }
            body.tampermonkey-hide-columns-enabled #order-items-edit-modal .order-item-input:has(input.order-item-sku),
            body.tampermonkey-hide-columns-enabled #order-items-edit-modal .order-item-header-title:not(.order-item-big):not(.order-item-small):not(.tampermonkey-image-header) {
                width: calc(25% - 1rem) !important;
            }
            body.tampermonkey-hide-columns-enabled #order-items-edit-modal .order-item-input.order-item-small,
            body.tampermonkey-hide-columns-enabled #order-items-edit-modal .order-item-header-title.order-item-small {
                width: calc(10% - 1rem) !important;
            }
        }

@media (max-width: 767px) {
  body.tampermonkey-responsive-enabled .table-responsive { overflow-x:hidden!important; }
  body.tampermonkey-responsive-enabled .table-responsive>.table { border:0 }
  body.tampermonkey-responsive-enabled .table-responsive thead { display:none }
  body.tampermonkey-responsive-enabled .table-responsive tr {
      display:block; border:1px solid #dee2e6;
      border-radius:.35rem; margin-bottom:1rem; background-color:#fff
  }
  body.tampermonkey-responsive-enabled .table-responsive td {
      display:block; text-align:right; padding:.75rem 1rem!important;
      border-bottom:1px solid #eee
  }
  body.tampermonkey-responsive-enabled .table-responsive td:last-child {
    border-bottom: 0;
  }
  body.tampermonkey-responsive-enabled .table-responsive td[data-label]::before {
      content: attr(data-label);
      display: block;
      font-weight: 700;
      color: #5e6278;
      font-size: .9em;
      margin-bottom: .3rem;
  }
  body.tampermonkey-responsive-enabled .table-responsive td[data-label="סוג"],
  body.tampermonkey-responsive-enabled .table-responsive td[data-label="משקל"],
  body.tampermonkey-responsive-enabled .table-responsive td[data-label="נפח"],
  body.tampermonkey-responsive-enabled .table-responsive td[data-label="הערות"] {
      display: none !important;
  }
} /* ← פה סוגרים את ה־@media */

/* עכשיו מחוץ ל־@media הקוד להצר את העמודה */
#operator-store-visits-table {
  table-layout: fixed !important;
}

/* תופסים את התא ה־2 להבטיח רוחב של 25px */
#operator-store-visits-table thead tr th:nth-child(2),
#operator-store-visits-table tbody tr td:nth-child(2) {
  width: 25px !important;
  min-width: 25px !important;
  max-width: 25px !important;
  overflow: hidden !important;
  white-space: nowrap !important;
}

/* במידה ויש <colgroup> */
#operator-store-visits-table col:nth-child(2) {
  width: 25px !important;
  max-width: 25px !important;
}

#operator-store-visits-table {
  width: 100% !important;        /* תמיד למלא את רוחב הקונטיינר */
  table-layout: auto !important; /* תפרוס לפי תוכן, לא לפי עמודות קבועות */
}

/* שמור על העמודה השנייה (כפתור PREVIEW) צרה */
#operator-store-visits-table thead tr th:nth-child(2),
#operator-store-visits-table tbody tr td:nth-child(2) {
  width: 25px !important;
  min-width: 25px !important;
  max-width: 25px !important;
  overflow: hidden !important;
  white-space: nowrap !important;
}

/* אם תרצה לדאוג שתא ה-PREVIEW יתפרס לגמרי – אך לרוב לא צריך */
#operator-store-visits-table tr[id^="preview-for-"] > td {
  width: 100% !important;
}

/* Merlog Row Highlighting */
.merlog-highlight {
    background-color: #fef2f2 !important;
    transition: background-color 0.3s ease;
}

.merlog-highlight:hover {
    background-color: #fee2e2 !important;
}

/* Override for table cells specifically */
td.merlog-highlight {
    background-color: #fef2f2 !important;
    border-radius: 4px;
    padding: 4px 8px;
    margin: 2px 0;
}

td.merlog-highlight:hover {
    background-color: #fee2e2 !important;
}

/* Exclude preview cells from merlog highlighting */
td.preview-cell.merlog-highlight,
.preview-cell.merlog-highlight {
    background-color: inherit !important;
    border-radius: inherit !important;
    padding: inherit !important;
    margin: inherit !important;
}

td.preview-cell.merlog-highlight:hover,
.preview-cell.merlog-highlight:hover {
    background-color: inherit !important;
}

/* Force preview cells to keep their original styling */
.preview-cell {
    background-color: inherit !important;
    text-align: center !important;
}

/* Override any merlog highlighting on preview cells */
tr.merlog-highlight .preview-cell,
tr.merlog-highlight td.preview-cell,
.preview-cell.merlog-highlight,
td.preview-cell.merlog-highlight {
    background-color: inherit !important;
    border-radius: inherit !important;
    padding: inherit !important;
    margin: inherit !important;
    box-shadow: none !important;
}

/* Force preview cells to always keep their original styling */
.preview-cell,
td.preview-cell {
    background-color: transparent !important;
    background: transparent !important;
    text-align: center !important;
}

/* Override any hover effects on preview cells */
.preview-cell:hover,
td.preview-cell:hover {
    background-color: transparent !important;
    background: transparent !important;
}

/* Force preview cell buttons to keep their original styling */
.preview-cell button,
td.preview-cell button {
    background-color: #f3f6f9 !important;
    border-color: #e1e3ea !important;
}

.preview-cell button:hover,
td.preview-cell button:hover {
    background-color: #e1e3ea !important;
    border-color: #b5b5c3 !important;
}

/* Merlog Table Cell Highlighting - Darker red for specific cells */
#operator-store-visits-table td.merlog-highlight:not(.preview-cell),
#tasks-table td.merlog-highlight:not(.preview-cell),
table td.merlog-highlight:not(.preview-cell) {
    background-color: #fef2f2 !important;
    border-radius: 4px;
    padding: 4px 8px;
    margin: 2px 0;
}

#operator-store-visits-table td.merlog-highlight:hover:not(.preview-cell),
#tasks-table td.merlog-highlight:hover:not(.preview-cell),
table td.merlog-highlight:hover:not(.preview-cell) {
    background-color: #fee2e2 !important;
}

/* Merlog Panel View Highlighting - Solid background */
.panel_view.merlog-highlight {
    background-color: #fff5f5 !important;
    border: 2px solid #fecaca !important;
}

/* Merlog Panel View Row Highlighting - Darker red for specific rows */
.panel_view .select2-selection--single.merlog-highlight,
.panel_view .col-xxl-5.col-6.merlog-highlight,
.panel_view .col-xxl-7.col-6.merlog-highlight {
    background-color: #fef2f2 !important;
    border-radius: 4px;
    padding: 4px 8px;
    margin: 2px 0;
    border: 1px solid #fecaca !important;
}

.panel_view .select2-selection--single.merlog-highlight:hover,
.panel_view .col-xxl-5.col-6.merlog-highlight:hover,
.panel_view .col-xxl-7.col-6.merlog-highlight:hover {
    background-color: #fee2e2 !important;
    border-color: #fca5a5 !important;
}

/* Merlog Table Row Highlighting - Red background for entire row */
tr.merlog-row-highlight {
    background-color: #fff5f5 !important;
}

/* Merlog Panel View Row Highlighting - Red background for entire row */
.panel_view.merlog-row-highlight {
    background-color: #fff5f5 !important;
}

/* Merlog Panel View Content Highlighting */
.panel_view.merlog-highlight .tab-content {
    background-color: #fff5f5 !important;
}

.panel_view.merlog-highlight .tab-pane {
    background-color: #fff5f5 !important;
}

/* Merlog Panel View Link Highlighting */
.panel_view.merlog-highlight a.merlog-highlight {
    background-color: #fef2f2 !important;
    color: #dc2626 !important;
    padding: 2px 4px !important;
    border-radius: 3px !important;
    text-decoration: none !important;
}

.panel_view.merlog-highlight a.merlog-highlight:hover {
    background-color: #fee2e2 !important;
    color: #b91c1c !important;
}

/* Merlog Panel View Text Element Highlighting */
.panel_view.merlog-highlight span.merlog-highlight,
.panel_view.merlog-highlight div.merlog-highlight,
.panel_view.merlog-highlight p.merlog-highlight {
    background-color: #fef2f2 !important;
    color: #dc2626 !important;
    padding: 1px 3px !important;
    border-radius: 2px !important;
    font-weight: bold !important;
}

/* Merlog Panel View Select Element Highlighting */
.panel_view.merlog-highlight select.merlog-highlight {
    background-color: #fef2f2 !important;
    border-color: #fca5a5 !important;
    color: #dc2626 !important;
}

/* Prevent preview rows from receiving focus to avoid interfering with LionWheel navigation */
tr[id^="preview-for-"] {
    outline: none !important;
    user-select: none !important;
}

tr[id^="preview-for-"]:focus {
    outline: none !important;
    box-shadow: none !important;
}

tr[id^="preview-for-"] * {
    outline: none !important;
}

tr[id^="preview-for-"] *:focus {
    outline: none !important;
    box-shadow: none !important;
}

/* Responsive Preview Grid Layout - Targeted padding approach */
:root { 
    --map-gap: 0px; 
}

/* Preview flex-wrap container (the div with display:flex inside the preview row) */
tr[id^="preview-for-"] > td > div[style*="display: flex"] {
  /* Constrain container width by the live panel width */
  max-width: calc(100% - var(--map-gap, 0px)) !important;

  /* Push content away from the map edge (left) with a small buffer */
  padding-left: var(--map-gap-buffered, 0px) !important;

  /* Ensure padding is part of the width calc */
  box-sizing: border-box !important;

  /* Ensure natural multi-row wrapping */
  flex-wrap: wrap !important;
  align-content: flex-start !important;
  gap: 8px !important; /* use container gap instead of external margins when possible */
}

/* Individual item cards inside the preview (keeps predictable wrapping) */
tr[id^="preview-for-"] > td > div[style*="display: flex"] > .d-flex {
  /* Adjust 340px if you're using a different card width */
  flex: 0 1 340px !important;
  max-width: 340px !important;
}

/* 2-line text clamp for product titles in preview cards */
tr[id^="preview-for-"] .font-weight-bold{
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: normal;
    line-height: 1.2em;
    max-height: calc(1.2em * 2);
}
  `;

  GM_addStyle(css);
        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Error injecting global styles:`, error);
        }
}
// ✅ OUTSIDE the previous function block — correctly placed
function enableCopyStyling(el) {
    if (!el || !el.classList || !el.hasAttribute) {
        console.warn('⚠️ [Toolbox] enableCopyStyling: Invalid element');
        return;
    }

    if (!el.classList.contains('copy-enabled')) {
        el.classList.add('copy-enabled');
    }
    if (!el.hasAttribute('title')) {
        el.setAttribute('title', 'לחץ להעתקה');
    }
}

function prepareCopyElements() {
    try {
        document.querySelectorAll(`
            tr[id^="visit-row-"] td.text-nowrap,
            tr[id^="visit-row-"] td,
            strong.barcode-highlight,
            strong.barcode-highlight-gallery,
            .font-weight-bold,
            .gallery-product-name
        `).forEach(el => {
            // Skip adding copy-enabled to quantity/לוקט cells to prevent flicker
            if (el.getAttribute('data-label') === 'כמות / לוקט') {
                return;
            }
            // Skip adding copy-enabled to name cells in store visits table
            if (el.getAttribute('data-label') === 'שם') {
                const table = el.closest('table');
                if (table && (table.id === 'operator-store-visits-table' || 
                              table.closest('#operator-store-visits-table_wrapper'))) {
                    return; // Skip name cells in store visits table
                }
                // Skip adding copy-enabled to name cells that already have links with copy icons
                if (el.querySelector('a') || el.querySelector('i.fa-clone')) {
                    return;
                }
            }
            // Skip adding copy-enabled to gallery product names that have links with copy icons
            if (el.classList.contains('gallery-product-name') && (el.querySelector('a') || el.querySelector('i.fa-clone'))) {
                return;
            }
            // Skip adding copy-enabled to barcode cells that already have copy icons
            if (el.getAttribute('data-label') === 'מק״ט' && el.querySelector('i.fa-clone')) {
                return;
            }
            // Skip adding copy-enabled to barcode elements that already have copy icons nearby
            if (el.classList.contains('barcode-highlight') || el.classList.contains('barcode-highlight-gallery')) {
                const parentCell = el.closest('td');
                if (parentCell && parentCell.querySelector('i.fa-clone')) {
                    return;
                }
            }
            enableCopyStyling(el);
        });
    } catch (error) {
        console.error(`[${SCRIPT_NAME}] Error preparing copy elements:`, error);
    }
}




    // ---< Merlog Row Highlighting >---
    function highlightMerlogRows() {
        try {
            if (!settings || !settings.highlightMerlog) return;

            // Try to find the correct table
            let table = document.querySelector('#operator-store-visits-table');
            if (!table) {
                table = document.querySelector('#tasks-table');
            }
            if (!table) {
                // Try to find any table that might contain the data
                table = document.querySelector('table');
            }
            if (!table) return;

            const thead = table.querySelector('thead tr');
            if (!thead) return;

            let highlightedCount = 0;
            let totalRows = 0;

            // Process each row
            table.querySelectorAll('tbody tr').forEach((row, rowIndex) => {
                totalRows++;
                let shouldHighlight = false;

                // Clear previous highlighting from this row
                row.classList.remove('merlog-row-highlight');
                Array.from(row.cells).forEach(cell => {
                    if (!cell.classList.contains('preview-cell')) {
                        cell.classList.remove('merlog-highlight');
                        // Remove any inline styles
                        cell.style.backgroundColor = '';
                        cell.style.borderRadius = '';
                        cell.style.padding = '';
                    }
                });

                // Check driver column - look for "שיגור למרלוג"
                Array.from(row.cells).forEach(cell => {
                    // Skip preview cells
                    if (cell.classList.contains('preview-cell')) return;

                    const dataLabel = cell.getAttribute('data-label');
                    if (dataLabel === 'נהג') {
                        // Look for the actual displayed text in the select2 element
                        const select2Rendered = cell.querySelector('.select2-selection__rendered');
                        if (select2Rendered) {
                            const driverText = select2Rendered.textContent.trim();
                            // Look for specific patterns that indicate Merlog delivery
                            if (driverText.includes('שיגור למרלוג')) {
                                shouldHighlight = true;
                                cell.classList.add('merlog-highlight');
                            }
                        }
                    }
                });

                // Check area column - look for specific Merlog area patterns
                Array.from(row.cells).forEach(cell => {
                    // Skip preview cells
                    if (cell.classList.contains('preview-cell')) return;

                    const dataLabel = cell.getAttribute('data-label');
                    if (dataLabel === 'איזור חלוקה') {
                        const cellText = cell.textContent.trim();
                        // Look for specific Merlog area patterns
                        if (cellText.includes('מרלוג') &&
                            (cellText.includes('צור יגאל') ||
                             cellText.includes('צ\'יטה'))) {
                            shouldHighlight = true;
                            cell.classList.add('merlog-highlight');
                        }
                    }
                });

                // Check client column - look for "אניפט מרלוג"
                Array.from(row.cells).forEach(cell => {
                    // Skip preview cells
                    if (cell.classList.contains('preview-cell')) return;

                    const dataLabel = cell.getAttribute('data-label');
                    const cellText = cell.textContent.trim();

                    // Look for "אניפט מרלוג" in client column
                    if (dataLabel === 'לקוח' && cellText.includes('אניפט מרלוג')) {
                        shouldHighlight = true;
                        cell.classList.add('merlog-highlight');
                    }
                });

                // Highlight the entire row if any cell should be highlighted
                if (shouldHighlight) {
                    row.classList.add('merlog-row-highlight');
                    highlightedCount++;
                }
            });
        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Error highlighting Merlog rows:`, error);
        }
    }

    // ---< Ready Row Highlighting >---
    let readyHighlightRunning = false;
    let readyHighlightTimeout = null;
    
    // Debounced version that always runs but with smart timing
    const debouncedHighlightReadyRows = debounce(async () => {
        if (readyHighlightRunning) {
            // Removed excessive logging to reduce console noise
            // Schedule another attempt in 1 second
            setTimeout(() => debouncedHighlightReadyRows(), 1000);
            return;
        }
        
        await highlightReadyRows();
    }, 500); // Wait 500ms after last call
    
    async function highlightReadyRows() {
        try {
            if (!settings || !settings.highlightMerlog) return;
            
            readyHighlightRunning = true;

            // Try to find the correct table
            let table = document.querySelector('#operator-store-visits-table');
            if (!table) {
                table = document.querySelector('#tasks-table');
            }
            if (!table) {
                // Try to find any table that might contain the data
                table = document.querySelector('table');
            }
            if (!table) return;

            const thead = table.querySelector('thead tr');
            if (!thead) return;

            let highlightedCount = 0;
            let totalRows = 0;

            // Process each row
            const rows = table.querySelectorAll('tbody tr');
            const rowArray = Array.from(rows);
            
            // Create alternating order: first, last, second, second-to-last, etc.
            const alternatingRows = [];
            let start = 0;
            let end = rowArray.length - 1;
            
            while (start <= end) {
                if (start === end) {
                    alternatingRows.push(rowArray[start]);
                } else {
                    alternatingRows.push(rowArray[start]);
                    alternatingRows.push(rowArray[end]);
                }
                start++;
                end--;
            }

            // Removed excessive logging to reduce console noise

            for (let i = 0; i < alternatingRows.length; i++) {
                const row = alternatingRows[i];
                const originalIndex = rowArray.indexOf(row);
                totalRows++;

                // Clear previous highlighting from this row
                row.classList.remove('ready-row-highlight');
                Array.from(row.cells).forEach(cell => {
                    if (!cell.classList.contains('preview-cell')) {
                        cell.classList.remove('ready-highlight');
                        // Remove any inline styles
                        cell.style.backgroundColor = '';
                        cell.style.borderRadius = '';
                        cell.style.padding = '';
                    }
                });

                // Skip preview rows - we only want to highlight the original table rows
                if (row.id && row.id.startsWith('preview-for-')) {
                    continue;
                }

                // Get task ID from the row
                const taskId = row.getAttribute('data-task-id');
                if (!taskId) continue;

                // Check if we already know this task's status (caching)
                if (window.readyTaskCache && window.readyTaskCache[taskId] !== undefined) {
                    if (window.readyTaskCache[taskId]) {
                        // Highlight immediately if cached as ready
                        row.classList.add('ready-row-highlight');
                        highlightedCount++;
                        // Removed excessive logging to reduce console noise
                    }
                    continue; // Skip to next row since we already know the result
                }

                // Removed excessive logging to reduce console noise

                // First, check for tooltips with "הערות משלוח" and "מוכן"
                let foundInTooltip = false;
                const tooltipCells = row.querySelectorAll('[title*="הערות משלוח"], [data-original-title*="הערות משלוח"]');
                
                for (const cell of tooltipCells) {
                    const title = cell.getAttribute('title') || cell.getAttribute('data-original-title') || '';
                    if (title.includes('הערות משלוח') && title.includes('מוכן')) {
                        // Removed excessive logging to reduce console noise
                        
                        // Highlight immediately when found
                        row.classList.add('ready-row-highlight');
                        highlightedCount++;
                        foundInTooltip = true;
                        
                        // Cache the result
                        if (!window.readyTaskCache) window.readyTaskCache = {};
                        window.readyTaskCache[taskId] = true;
                        // Removed excessive logging to reduce console noise
                        break; // Stop searching once found
                    }
                }

                // If found in tooltip, skip the fetch and continue to next row
                if (foundInTooltip) {
                    continue; // Skip to next row since we already highlighted it
                }

                // If not found in tooltip, fetch the panel view
                try {
                    // Fetch the panel view like the example shows
                    const response = await fetch(`/tasks/${taskId}/panel_view`, {
                        method: 'POST',
                        headers: {
                            'accept': '*/*',
                            'content-type': 'application/json'
                        }
                    });
                    
                    if (!response.ok) {
                        // Removed excessive logging to reduce console noise
                        continue;
                    }

                    const panelViewHtml = await response.text();
                    const doc = new DOMParser().parseFromString(panelViewHtml, 'text/html');
                    
                    // Look for "מוכן" in the panel view - same logic as panel highlighting
                    const notesElements = doc.querySelectorAll('.bg-yellow .hover-copy, .notes, [class*="note"], [class*="comment"]');
                    let foundInPanel = false;
                    for (const notesEl of notesElements) {
                        if (notesEl && notesEl.textContent.includes('מוכן')) {
                            // Removed excessive logging to reduce console noise
                            
                            // Highlight immediately when found
                            row.classList.add('ready-row-highlight');
                            highlightedCount++;
                            foundInPanel = true;
                            // Removed excessive logging to reduce console noise
                            break; // Stop searching once found
                        }
                    }

                    // Cache the result
                    if (!window.readyTaskCache) window.readyTaskCache = {};
                    window.readyTaskCache[taskId] = foundInPanel;
                } catch (fetchError) {
                    console.error(`[Ready Highlight] Error fetching panel view for task ${taskId}:`, fetchError);
                    
                    // Cache as false on error
                    if (!window.readyTaskCache) window.readyTaskCache = {};
                    window.readyTaskCache[taskId] = false;
                }
            }

            // Removed excessive logging to reduce console noise
        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Error highlighting ready rows:`, error);
        } finally {
            readyHighlightRunning = false;
        }
    }

    // ---< Merlog Panel View Highlighting >---
    function highlightMerlogPanelView() {
        try {
            if (!settings || !settings.highlightMerlog) return;

            // Always prefer the specific task panel by id
            let panelView = document.querySelector('#task_offcanvas');
            if (!panelView) {
                panelView = document.querySelector('.panel_view');
            }
            if (!panelView) {
                panelView = document.querySelector('.offcanvas');
            }
            if (!panelView) return;

            // Clear all previous highlighting from this panel
            panelView.classList.remove('merlog-highlight', 'merlog-row-highlight', 'ready-highlight');

            // Remove highlighting from all child elements
            panelView.querySelectorAll('.merlog-highlight, .ready-highlight').forEach(el => {
                el.classList.remove('merlog-highlight', 'ready-highlight');
            });

            // Check for specific Merlog indicators
            const panelText = panelView.textContent || panelView.innerText || '';

            // ONLY highlight if we have SPECIFIC Merlog indicators
            const merlogPatterns = [
              'שיגור למרלוג',
              "מרלוג צור יגאל",
              "מרלוג צ'יטה",
              'אניפט מרלוג'
            ];
            let shouldHighlight = false;

            // בדיקת נהג בפועל
            const driverSelect = panelView.querySelector('.select2-selection__rendered');
            if (driverSelect && merlogPatterns.some(pattern => driverSelect.textContent.trim().includes(pattern))) {
              shouldHighlight = true;
            }

            // בדיקת select אמיתי (אם יש)
            const selectElement = panelView.querySelector('select.visit-drivers-select2');
            if (selectElement) {
              const selectedOption = selectElement.options[selectElement.selectedIndex];
              if (selectedOption && merlogPatterns.some(pattern => selectedOption.textContent.includes(pattern))) {
                shouldHighlight = true;
              }
            }

            // בדיקת איזור חלוקה בפועל
            const areaSections = panelView.querySelectorAll('.col-xxl-5.col-6');
            areaSections.forEach(section => {
              const labelSpan = section.querySelector('span');
              if (labelSpan && labelSpan.textContent.trim() === 'איזור חלוקה') {
                const valueSection = section.nextElementSibling;
                if (valueSection && merlogPatterns.some(pattern => valueSection.textContent.trim().includes(pattern))) {
                  shouldHighlight = true;
                }
              }
            });

            // בדיקת לקוח בפועל
            areaSections.forEach(section => {
              const labelSpan = section.querySelector('span');
              if (labelSpan && labelSpan.textContent.trim() === 'לקוח') {
                const valueSection = section.nextElementSibling;
                if (valueSection && merlogPatterns.some(pattern => valueSection.textContent.trim().includes(pattern))) {
                  shouldHighlight = true;
                }
              }
            });

            // Check for "מוכן" in הערות (notes)
            let shouldHighlightReady = false;
            const notesElements = panelView.querySelectorAll('.bg-yellow .hover-copy, .notes, [class*="note"], [class*="comment"]');
            notesElements.forEach(notesEl => {
                if (notesEl && notesEl.textContent.includes('מוכן')) {
                    shouldHighlightReady = true;
                }
            });

            // Debug logging and apply highlighting
            if (shouldHighlight) {
                // Removed excessive logging to reduce console noise
                panelView.classList.add('merlog-highlight');
                panelView.classList.add('merlog-row-highlight');
            } else if (shouldHighlightReady) {
                // Removed excessive logging to reduce console noise
                panelView.classList.add('ready-highlight');
            } else {
                // Removed excessive logging to reduce console noise
            }

        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Error highlighting Merlog panel view:`, error);
        }
    }

    // ---< Main Execution & Control Flow >---
    async function runMainLogic() {
        // Prevent multiple simultaneous executions
        if (window.runMainLogicExecuting) return;
        window.runMainLogicExecuting = true;

        safeExecute(async () => {

            // MODIFICATION: Call tagColumnsForHiding initially with default scope (document)
            tagColumnsForHiding();
            document.querySelectorAll('.table-responsive > .table, #operator-store-visits-table').forEach(addResponsiveDataAttributes);
            document.querySelectorAll('td.text-nowrap, span.text-muted.font-weight-bold, input.order-item-sku').forEach(el => {
                if (!el.hasAttribute('data-original-sku')) el.setAttribute('data-original-sku', el.tagName === 'INPUT' ? el.value.trim() : el.textContent.trim());
            });
            // MODIFICATION: Call these with default scope (document)
            replaceBarcodesInViews(); // Unified barcode replacement function
            injectImagesAndLinks(document);
            injectImagesInRegularTables(document);
            injectImagesInOrderItemRows(document);
            injectWhatsAppButtons();
            highlightMerlogRows(); // Add Merlog row highlighting
            highlightMerlogPanelView(); // Add Merlog panel view highlighting
            highlightPickQuantities(); // Add pick quantities highlighting
            
            // Run ready highlighting in background to avoid blocking the UI
            setTimeout(() => {
                debouncedHighlightReadyRows();
            }, 1000);
            
            // Also run when the page is fully loaded, but only once
            let pageLoadHighlightDone = false;
            if (document.readyState === 'complete') {
                if (!pageLoadHighlightDone) {
                    pageLoadHighlightDone = true;
                    setTimeout(() => {
                        debouncedHighlightReadyRows();
                    }, 2000);
                }
            } else {
                window.addEventListener('load', async () => {
                    if (!pageLoadHighlightDone) {
                        pageLoadHighlightDone = true;
                        setTimeout(() => {
                            debouncedHighlightReadyRows();
                        }, 2000);
                    }
                }, { passive: true });
            }

            // MODIFICATION START: Add MutationObserver for the "עריכת פריטים" modal
            let editTaskModal = null;
            // First try to find by ID
            editTaskModal = document.querySelector('#order-items-edit-modal');

            // If not found by ID, iterate through all modal-content elements to find the correct one
            if (!editTaskModal) {
                document.querySelectorAll('.modal-content').forEach(modal => {
                    const modalTitle = modal.querySelector('h4.modal-title');
                    if (modalTitle && modalTitle.textContent.trim() === 'עריכת פריטים') {
                        editTaskModal = modal;
                    }
                });
            }

            if (editTaskModal && !editTaskModal.hasAttribute('data-columns-hidden-observer-active')) {
                const observerConfig = { childList: true, subtree: true };
                const modalObserver = new MutationObserver((mutationsList, observer) => {
                    // 1) skip while copy feedback is active
                    if (window._tmCopying) return;

                    // 2) ignore mutations coming from the copy icon area
                    if (mutationsList.some(m => {
                      const el = (m.target?.nodeType === 1 ? m.target : m.target?.parentElement) || null;
                      return el && el.closest && el.closest('.tampermonkey-copy-wrap, .copy-icon');
                    })) {
                      return;
                    }

                    clearTimeout(modalObserver.debounceTimer);
                    modalObserver.debounceTimer = setTimeout(() => {
                        const modalForm = editTaskModal.querySelector('form[id^="edit_task_"]');
                        if (modalForm) {
                            // Pass the specific modalForm as scope to the functions
                            safeExecute(() => tagColumnsForHiding(modalForm)); // Re-apply column hiding
                            safeExecute(() => injectImagesAndLinks(modalForm)); // Re-process images/links
                            safeExecute(() => injectImagesInRegularTables(modalForm)); // Re-process regular table images
                            safeExecute(() => injectImagesInOrderItemRows(modalForm)); // Re-process .order-item-row images
                            safeExecute(() => replaceBarcodesInViews(modalForm)); // Re-process barcodes (unified function)
                        }
                    }, 50); // Small debounce delay
                });
                modalObserver.observe(editTaskModal, observerConfig);
                editTaskModal.setAttribute('data-columns-hidden-observer-active', 'true'); // Mark observer as active
            }
            // MODIFICATION END

            const firstOrderRow = document.querySelector('tr[id^="visit-row-"]');
            if (firstOrderRow) {
                const mainTableBody = firstOrderRow.closest('tbody');
                if (mainTableBody) safeExecute(() => injectPreviewFunctionality(mainTableBody));
            }

            // Add MutationObserver for panel view highlighting
            const panelView = document.querySelector('.offcanvas.offcanvas-custom-right');
            if (panelView && !panelView.hasAttribute('data-merlog-observer-active')) {
                // Call highlighting functions immediately
                setTimeout(() => {
                    highlightMerlogPanelView();
                    debouncedHighlightReadyRows();
                }, 100);
                const panelObserver = new MutationObserver((mutations) => {
                    // 1) skip while copy feedback is active
                    if (window._tmCopying) return;

                    // 2) ignore mutations coming from the copy icon area
                    if (mutations.some(m => {
                      const el = (m.target?.nodeType === 1 ? m.target : m.target?.parentElement) || null;
                      return el && el.closest && el.closest('.tampermonkey-copy-wrap, .copy-icon');
                    })) {
                      return;
                    }

                    clearTimeout(panelObserver.debounceTimer);
                    panelObserver.debounceTimer = setTimeout(() => {
                        highlightMerlogPanelView();
                        debouncedHighlightReadyRows();
                        // NEW: Also replace barcodes in panel view
                        if (settings && settings.replaceBarcodes) {
                            replaceBarcodesInViews(panelView);
                        }
                    }, 200);
                });
                panelObserver.observe(panelView, { childList: true, subtree: true });
                panelView.setAttribute('data-merlog-observer-active', 'true');
            }

            // Also add event listener for when panel view is shown
            document.addEventListener('shown.bs.offcanvas', function(event) {
                if (event.target.classList.contains('offcanvas-custom-right')) {
                    setTimeout(() => {
                        highlightMerlogPanelView();
                        debouncedHighlightReadyRows();
                    }, 500);
                }
            }, { passive: true });

            // Add event listener for when table data is loaded/updated
            let readyHighlightTimeout = null;
            let tableObserverActive = false;
            const tableObserver = new MutationObserver((mutations) => {
                // 1) skip while copy feedback is active
                if (window._tmCopying) return;

                // 2) ignore mutations coming from the copy icon area
                if (mutations.some(m => {
                  const el = (m.target?.nodeType === 1 ? m.target : m.target?.parentElement) || null;
                  return el && el.closest && el.closest('.tampermonkey-copy-wrap, .copy-icon');
                })) {
                  return;
                }

                if (tableObserverActive) return; // Prevent multiple simultaneous calls
                
                let shouldCheckReady = false;
                let newTaskRows = 0;
                
                mutations.forEach(mutation => {
                    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                        mutation.addedNodes.forEach(node => {
                            if (node.nodeType === 1 && node.matches && 
                                (node.matches('tr[data-task-id]') || node.querySelector('tr[data-task-id]'))) {
                                shouldCheckReady = true;
                                newTaskRows++;
                            }
                        });
                    }
                });
                
                if (shouldCheckReady && newTaskRows > 0) {
                    tableObserverActive = true;
                    
                    // Clear previous timeout to avoid multiple calls
                    if (readyHighlightTimeout) {
                        clearTimeout(readyHighlightTimeout);
                    }
                    readyHighlightTimeout = setTimeout(() => {
                        debouncedHighlightReadyRows();
                        tableObserverActive = false;
                    }, 2000);
                }
            });
            
            // Observe the table for new rows
            const tableToObserve = document.querySelector('#operator-store-visits-table') || 
                                  document.querySelector('#tasks-table') || 
                                  document.querySelector('table');
            if (tableToObserve) {
                tableObserver.observe(tableToObserve, { childList: true, subtree: true });
            }

        }, () => {
            // Fallback function
            console.error(`[${SCRIPT_NAME}] Error in runMainLogic`);
        });

        // Reset the execution flag
        window.runMainLogicExecuting = false;
    }

    // Create debounced version of runMainLogic
    const debouncedRunMainLogic = debounce(async () => {
        if (!window.runMainLogicExecuting) {
            await runMainLogic();
        }
    }, 100);

function highlightPickQuantities() {
    try {
        // Target all tables with the "כמות / לוקט" column, not just the first one
        const targetTables = document.querySelectorAll('table.table.table-hover[data-columns-tagged="true"]');
        if (!targetTables || targetTables.length === 0) return;

        targetTables.forEach(table => {
            // Find cells with the specific data-label for pick quantities
            const pickQuantityCells = table.querySelectorAll('td[data-label="כמות / לוקט"]');
            
            pickQuantityCells.forEach(el => {
                if (!el || !el.innerHTML) return;

                // Skip if already processed (has tampermonkey classes)
                if (el.querySelector('.tampermonkey-picked-full, .tampermonkey-picked-none, .tampermonkey-picked-partial')) {
                    return;
                }

                let html = el.innerHTML.trim();
                
                // More specific pattern for pick quantities: exactly 2 numbers separated by "/"
                const match = html.match(/^(\d+)\s*\/\s*(\d+)$/);
                if (!match) return;

                const picked = parseInt(match[1]);
                const total = parseInt(match[2]);

                // Skip 0 / 1
                if (picked === 0 && total === 1) return;

                // Additional validation - make sure these are reasonable pick quantities
                if (picked > total || total > 1000) return;

                const replacementClass =
                    picked === total ? 'tampermonkey-picked-full' :
                    picked === 0 && total > 1 ? 'tampermonkey-picked-none' :
                    'tampermonkey-picked-partial';

                // Replace the entire content with the highlighted version
                el.innerHTML = `<span class="${replacementClass}">${html}</span>`;
            });
        });
    } catch (error) {
        console.error(`[${SCRIPT_NAME}] Error highlighting pick quantities:`, error);
    }
}




async function initialize() {
  try {

    if (window.anipetToolboxInitialized) {
      return;
    }
    window.anipetToolboxInitialized = true;

    // Reset logging flags for new page load
    window.targetProductLogged = false;
    window.targetProductFound = false;
    window.targetProductNotFound = false;
    window.targetProductApplied = false;
    window.targetProductInCSVLogged = false;

    createStatusNotifier();

    await loadSettings();

    registerMenuCommands();

    injectGlobalStyles();

    // Initialize ResizeObserver for side panel width tracking
    initializeSidePanelResizeObserver();

    await Promise.all([ getProductData(), loadBarcodeCsv() ]);

    runMainLogic(); // ← הרצת ההזרקות הראשוניות

  prepareCopyElements();

  highlightPickQuantities();
  
  // Add clickable links to all tables (including non-visit-row tables)
  addClickableLinksToAllTables();

  // === Apply Copy Icon RTL/LTR Fix ===
  requestAnimationFrame(() => applyCopyIconFix());

  // Set up MutationObserver to keep copy icons fixed on dynamic updates
  (function observeTableForCopyIconFix(){
    const tables = document.querySelectorAll('table[data-columns-tagged="true"]');
    if (tables.length === 0) {
      // If no tagged tables found yet, wait and try again
      setTimeout(() => {
        const retryTables = document.querySelectorAll('table[data-columns-tagged="true"]');
        retryTables.forEach(table => {
          if (table && table.nodeType === Node.ELEMENT_NODE) {
            const mo = new MutationObserver((muts) => {
              // 1) skip while copy feedback is active
              if (window._tmCopying) return;

              // 2) ignore mutations coming from the copy icon area
              if (muts.some(m => {
                const el = (m.target?.nodeType === 1 ? m.target : m.target?.parentElement) || null;
                return el && el.closest && el.closest('.tampermonkey-copy-wrap, .copy-icon');
              })) {
                return;
              }

              // Any row/cell/text change -> re-apply (idempotent)
              scheduleHeavy(() => applyCopyIconFix());
            });
            mo.observe(table, {childList:true, subtree:true});
          }
        });
      }, 1000);
      return;
    }
    
    tables.forEach(table => {
      if (table && table.nodeType === Node.ELEMENT_NODE) {
        const mo = new MutationObserver((muts) => {
          // 1) skip while copy feedback is active
          if (window._tmCopying) return;

          // 2) ignore mutations coming from the copy icon area
          if (muts.some(m => {
            const el = (m.target?.nodeType === 1 ? m.target : m.target?.parentElement) || null;
            return el && el.closest && el.closest('.tampermonkey-copy-wrap, .copy-icon');
          })) {
            return;
          }

          // Any row/cell/text change -> re-apply (idempotent)
          scheduleHeavy(() => applyCopyIconFix());
        });
        mo.observe(table, {childList:true, subtree:true});
      }
    });
  })();

  // ◂ הגנה פשוטה - מונע הסרת PREVIEW לחלוטין
  const table = document.querySelector('#operator-store-visits-table');
  if (table) {
    let tableObserverTimeout = null;
    const tableObserver = new MutationObserver((mutations) => {
      // 1) skip while copy feedback is active
      if (window._tmCopying) return;

      // 2) ignore mutations coming from the copy icon area
      if (mutations.some(m => {
        const el = (m.target?.nodeType === 1 ? m.target : m.target?.parentElement) || null;
        return el && el.closest && el.closest('.tampermonkey-copy-wrap, .copy-icon');
      })) {
        return;
      }

      // השתמש ב-debounce כדי למנוע לולאה אינסופית
      clearTimeout(tableObserverTimeout);
      tableObserverTimeout = setTimeout(() => {
        // בכל שינוי בתת-עץ של הטבלה, ננסה להזריק Preview מחדש
        const tb = table.querySelector('tbody');
        if (!tb) return;

        // בדוק אם יש PREVIEW פתוחים
        const hasOpenPreviews = tb.querySelectorAll('tr[id^="preview-for-"]').length > 0;

        // אם יש PREVIEW פתוחים, אל תסיר את הפונקציונליות
        if (hasOpenPreviews) {
          // Removed excessive logging to reduce console noise
          return;
        }

        // רק הזרק פונקציונליות חדשה אם היא לא קיימת
        if (!tb.hasAttribute('data-preview-injected') && settings && settings.enablePreview) {
          injectPreviewFunctionality(tb);
        }

        // NEW: Also replace barcodes when table changes
        if (settings && settings.replaceBarcodes) {
          replaceBarcodesInViews(table);
        }
      }, 200); // הגדל את ה-debounce ל-200ms
    });
    tableObserver.observe(table, {
      childList: true,
      subtree: true
    });



    // ◂ פונקציה לבניית שורת PREVIEW







  }

  prepareCopyElements();

  highlightPickQuantities();

  // ◂ המשך הקוד שלך – MutationObserver וכו׳
  const observer = new MutationObserver((mutationsList) => {
    // 1) skip while copy feedback is active
    if (window._tmCopying) return;

    // 2) ignore mutations coming from the copy icon area
    if (mutationsList.some(m => {
      const el = (m.target?.nodeType === 1 ? m.target : m.target?.parentElement) || null;
      return el && el.closest && el.closest('.tampermonkey-copy-wrap, .copy-icon');
    })) {
      return;
    }

    clearTimeout(observer.debounceTimer);
    observer.debounceTimer = setTimeout(() => {
      if (!window.runMainLogicExecuting) {
        runMainLogic();
      }
      prepareCopyElements();
      
      // Add clickable links to all tables (including non-visit-row tables)
      addClickableLinksToAllTables();

      // Apply Copy Icon RTL/LTR Fix on DOM changes
      applyCopyIconFix();
      
      // Only trigger highlightPickQuantities if relevant nodes changed
      const hasQuantityChanges = mutationsList.some(mutation => {
        if (mutation.type === 'childList') {
          // Check added nodes
          for (let node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.querySelector && node.querySelector('td[data-label="כמות / לוקט"]')) {
                return true;
              }
              if (node.matches && node.matches('td[data-label="כמות / לוקט"]')) {
                return true;
              }
            }
          }
        }
        // Check if the changed node itself is a quantity cell
        if (mutation.target && mutation.target.getAttribute && 
            mutation.target.getAttribute('data-label') === 'כמות / לוקט') {
          return true;
        }
        return false;
      });
      
      if (hasQuantityChanges) {
        highlightPickQuantities();
      }
      
      // NEW: Also replace barcodes for any DOM changes
      if (settings && settings.replaceBarcodes) {
        replaceBarcodesInViews();
      }
    }, 100);
  });
  observer.observe(document.body, { childList: true, subtree: true });


  } catch (error) {
    console.error(`[${SCRIPT_NAME}] Error in initialize:`, error);
  }
}

document.body.addEventListener('click', function (e) {
    // Ignore clicks on buttons, links, inputs, or media
    if (e.target.closest('button, a, input, textarea, svg, img')) return;

    let target = e.target;

    // --- Handle barcode in preview or gallery ---
    if (target.matches('strong.barcode-highlight, strong.barcode-highlight-gallery')) {
        enableCopyStyling(target)
        copyWithFeedback(target, target.textContent.trim());
        return;
    }

    // --- Handle preview name ---
    if (target.classList.contains('font-weight-bold')) {
        enableCopyStyling(target)
        copyWithFeedback(target, target.textContent.trim());
        return;
    }

    // --- Handle gallery product name ---
    if (target.classList.contains('gallery-product-name')) {
        enableCopyStyling(target)
        copyWithFeedback(target, target.textContent.trim());
        return;
    }

    // --- Handle gallery barcode (clicking anywhere in .gallery-sku) ---
    if (target.closest('.gallery-sku')) {
        const strong = target.closest('.gallery-sku').querySelector('strong');
        if (strong) {
            enableCopyStyling(strong); // ✅ apply to correct element
            copyWithFeedback(strong, strong.textContent.trim());
            return;
        }
    }

    // --- Fallback: handle <td> with text ---
    if (target.tagName === 'TD' && target.textContent.trim()) {
        enableCopyStyling(target)
        copyWithFeedback(target, target.textContent.trim());
    }
}, { passive: true });

// Inject minimal CSS once (if your project has a CSS pipeline, העבר לשם)
(function injectCopyCSS(){
  if (document.getElementById('tm-copy-css')) return;
  const style = document.createElement('style');
  style.id = 'tm-copy-css';
  style.textContent = `
    .tampermonkey-copy-wrap{display:inline-flex;align-items:center;gap:4px;white-space:nowrap;unicode-bidi:plaintext}
    .tampermonkey-barcode-bdi{direction:ltr;unicode-bidi:plaintext}
    .tampermonkey-name-bdi{direction:auto;unicode-bidi:plaintext}
    .copy-icon{color:#3699ff;cursor:pointer;line-height:1;flex:0 0 auto}
  `;
  document.head.appendChild(style);
})();

// === Core Copy Icon Fix Function ===
function applyCopyIconFix(root = document){
  const rows = root.querySelectorAll('table[data-columns-tagged="true"] tbody tr');
  rows.forEach(tr => {
    fixBarcodeCell(tr);
    fixNameCell(tr);
  });

  function ensureWrap(td){
    let wrap = td.querySelector(':scope > .tampermonkey-copy-wrap');
    if (!wrap){
      wrap = document.createElement('span');
      wrap.className = 'tampermonkey-copy-wrap';
      while (td.firstChild) wrap.appendChild(td.firstChild);
      td.appendChild(wrap);
    }
    return wrap;
  }

  function ensureCopyIcon(wrap, getText){
    let icon = wrap.querySelector(':scope > i.fa-clone');
    const text = (getText?.() || '').trim();
    
    // If no text content, hide or remove the icon
    if (!text) {
      if (icon) {
        icon.style.display = 'none';
      }
      return null;
    }
    
    if (!icon){
      icon = document.createElement('i');
      icon.className = 'fa-light fa-clone copy-icon';
      icon.title = 'העתק';
      icon.addEventListener('click', withCopying((e) => {
        e.preventDefault(); e.stopPropagation();
        const t = (getText?.() || '').trim();
        if (!t) return;
        navigator.clipboard.writeText(t).then(()=> tmToast('הועתק!', icon)).catch(console.warn);
      }));
    }else{
      icon.classList.add('copy-icon');
      icon.style.display = ''; // Show the icon if it was hidden
    }
    // וידוא שהאיקון בסוף הוויזואלי (מיד אחרי הטקסט/BDI)
    if (wrap.lastChild !== icon) wrap.appendChild(icon);
    return icon;
  }

  function fixBarcodeCell(tr){
    const td = tr.querySelector('td[data-label="מק״ט"]');
    if (!td) return;
    const wrap = ensureWrap(td);

    // Find current value element
    let valEl = wrap.querySelector('.barcode-highlight') ||
                wrap.querySelector('span, b, strong') ||
                Array.from(wrap.childNodes).find(n => n.nodeType === Node.TEXT_NODE);

    if (!valEl) return;

    // Ensure BDI LTR around the barcode
    let bdi = wrap.querySelector(':scope > .tampermonkey-barcode-bdi');
    if (!bdi){
      bdi = document.createElement('bdi');
      bdi.className = 'tampermonkey-barcode-bdi';
      // Move the value node inside the BDI
      bdi.appendChild(valEl.parentNode ? valEl.parentNode.removeChild(valEl) : valEl);
      // Insert BDI as first child
      if (wrap.firstChild) wrap.insertBefore(bdi, wrap.firstChild); else wrap.appendChild(bdi);
    }

    // Check if barcode has content before showing icon
    const barcodeText = bdi.textContent.trim();
    if (barcodeText) {
      // Ensure icon comes immediately after the BDI (visually at the end)
      ensureCopyIcon(wrap, () => bdi.textContent);
    } else {
      // Hide icon if no barcode content
      ensureCopyIcon(wrap, () => '');
    }
  }

  function fixNameCell(tr){
    const td = tr.querySelector('td[data-label="שם"]');
    if (!td) return;
    
    // Check if this is the store visits table - if so, don't add copy icon for name cells
    const table = tr.closest('table');
    if (table && (table.id === 'operator-store-visits-table' || 
                  table.closest('#operator-store-visits-table_wrapper'))) {
      return; // Skip adding copy icon for name cells in store visits table
    }
    
    const wrap = ensureWrap(td);

    // Prefer <a>, else first child/text
    let nameNode = wrap.querySelector(':scope > a') || wrap.firstChild;
    if (!nameNode) return;

    // Ensure BDI AUTO around the name/link for mixed RTL/LTR
    let bdi = wrap.querySelector(':scope > .tampermonkey-name-bdi');
    if (!bdi){
      bdi = document.createElement('bdi');
      bdi.className = 'tampermonkey-name-bdi';
      bdi.dir = 'auto';
      bdi.appendChild(nameNode.parentNode ? nameNode.parentNode.removeChild(nameNode) : nameNode);
      if (wrap.firstChild) wrap.insertBefore(bdi, wrap.firstChild); else wrap.appendChild(bdi);
    }

    // Check if name has content before showing icon
    const nameText = (bdi.innerText || bdi.textContent || '').trim();
    if (nameText) {
      // Ensure icon right after the BDI (i.e., at the visual end of the name)
      ensureCopyIcon(wrap, () => bdi.innerText || bdi.textContent);
    } else {
      // Hide icon if no name content
      ensureCopyIcon(wrap, () => '');
    }
  }
}

function createCopyIcon(textToCopy, { title='העתק' } = {}){
  const text = (textToCopy || '').trim();
  
  // Don't create icon if no text content
  if (!text) {
    const hiddenIcon = document.createElement('i');
    hiddenIcon.className = 'fa-light fa-clone';
    hiddenIcon.style.display = 'none';
    return hiddenIcon;
  }
  
  const i = document.createElement('i');
  i.className = 'fa-light fa-clone';
  i.title = title;
  i.addEventListener('click', withCopying((e) => {
    e.preventDefault(); e.stopPropagation();
    const text = (textToCopy || '').trim();
    if (!text) return;
    navigator.clipboard.writeText(text).then(()=> tmToast('הועתק!', i)).catch(console.warn);
  }));
  return i;
}

function addClickableLinksToAllTables() {
    try {
        // Find all tables with data-label="שם" cells (not just visit-row tables)
        const allTables = document.querySelectorAll('table.table.table-hover[data-columns-tagged="true"]');
        
        allTables.forEach(table => {
            // Skip store visits table - don't add copy icons for names there
            if (table.id === 'operator-store-visits-table' || 
                table.closest('#operator-store-visits-table_wrapper')) {
                return;
            }
            
            const rows = table.querySelectorAll('tbody tr:not([data-links-processed])');
            
            rows.forEach(row => {
                // Find name cell by data-label
                const nameCell = row.querySelector('td[data-label="שם"]');
                if (!nameCell || nameCell.querySelector('a') || nameCell.querySelector('i.fa-clone')) return; // Skip if already processed
                
                // Find SKU cell to get product info
                const skuCell = row.querySelector('td[data-label="מק״ט"]');
                if (!skuCell) return;
                
                const productName = nameCell.textContent.trim();
                const sku = (skuCell.dataset.originalSku || skuCell.textContent || '').trim();
                
                if (!productName || !sku) return;
                
                // Check if there's an Anipet button in this cell or nearby
                const hasAnipetButton = nameCell.querySelector('.anipet-alternatives-btn') ||
                                       nameCell.closest('tr').querySelector('.anipet-alternatives-btn');
                
                // Only process if there's no Anipet button
                if (!hasAnipetButton) {
                    // Try to find a match for this product
                    const match = findImageMatch(sku, productName);
                    
                    if (match && match.link) {
                        // Clear the cell content
                        nameCell.innerHTML = '';
                        
                        // Create copy icon with enhanced feedback
                        const copyIcon = createCopyIcon(productName);
                        
                        // Create link
                        const link = document.createElement('a');
                        link.href = match.link;
                        link.target = '_blank';
                        link.rel = 'noopener noreferrer';
                        link.textContent = productName;
                        
                        // Append link first, then copy icon (icon will float left)
                        nameCell.appendChild(link);
                        nameCell.appendChild(copyIcon);
                    } else {
                        // Even if no link, add copy icon for the product name
                        const originalContent = nameCell.innerHTML;
                        nameCell.innerHTML = '';
                        
                        // Create copy icon with enhanced feedback
                        const copyIcon = createCopyIcon(productName);
                        
                        // Append text first, then copy icon (icon will float left)
                        nameCell.appendChild(document.createTextNode(productName));
                        nameCell.appendChild(copyIcon);
                    }
                }
                
                // Add copy icon to barcode cell if it has barcode-highlight
                const skuCellBarcode = skuCell.querySelector('.barcode-highlight, span.barcode-highlight');
                if (skuCellBarcode && !skuCell.querySelector('i.fa-clone')) {
                    const barcodeText = skuCellBarcode.textContent.trim();
                    if (barcodeText) {
                        // Create copy icon for barcode
                        const barcodeCopyIcon = createCopyIcon(barcodeText);
                        barcodeCopyIcon.style.marginLeft = '4px';
                        barcodeCopyIcon.style.marginRight = '0px';
                        
                        // Insert the copy icon after the barcode
                        skuCellBarcode.parentNode.insertBefore(barcodeCopyIcon, skuCellBarcode.nextSibling);
                    }
                }
                
                // Mark row as processed
                row.setAttribute('data-links-processed', 'true');
            });
        });
    } catch (error) {
        console.error(`[${SCRIPT_NAME}] Error in addClickableLinksToAllTables:`, error);
    }
}

function copyWithFeedback(element, text) {
    try {
        if (!element || !text) return;

        navigator.clipboard.writeText(text).then(() => {
            element.classList.add('cell-copied');
            // ✅ Clean up inline style to avoid interference
            element.style.removeProperty('background-color');

            setTimeout(() => {
                element.classList.remove('cell-copied');
                // ✅ Clean up inline style to avoid interference
                element.style.removeProperty('background-color');
            }, 400);
        }).catch(err => {
            console.warn('Copy failed:', err);
        });
    } catch (error) {
        console.error(`[${SCRIPT_NAME}] Error in copyWithFeedback:`, error);
    }
}






      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize, { passive: true });
    } else {
        initialize();
    }

// Expose toolbox functions globally for enhanced search to use
window.injectImagesAndLinks = injectImagesAndLinks;
window.injectImagesInRegularTables = injectImagesInRegularTables;
window.injectImagesInOrderItemRows = injectImagesInOrderItemRows;
window.replaceBarcodesInViews = replaceBarcodesInViews;
window.replaceBarcodesInDOM = replaceBarcodesInDOM; // Backward compatibility - calls unified function
window.tagColumnsForHiding = tagColumnsForHiding;
window.findImageMatch = findImageMatch;
window.findBarcode = findBarcode;
window.createImageElement = createImageElement;
// Expose new performance and error handling functions
window.isElementProcessed = isElementProcessed;
window.markElementAsProcessed = markElementAsProcessed;
window.processBarcodeElement = processBarcodeElement;
// Expose ready highlighting functions for manual use
window.highlightReadyRows = highlightReadyRows;
window.debouncedHighlightReadyRows = debouncedHighlightReadyRows;

// פתרון: מאזין לפתיחה של modal ואז מוסיף תמונות לאחר שה-Enhanced סיים
const enhancedSafeObserver = new MutationObserver((mutations) => {
    // 1) skip while copy feedback is active
    if (window._tmCopying) return;

    // 2) ignore mutations coming from the copy icon area
    if (mutations.some(m => {
      const el = (m.target?.nodeType === 1 ? m.target : m.target?.parentElement) || null;
      return el && el.closest && el.closest('.tampermonkey-copy-wrap, .copy-icon');
    })) {
      return;
    }

    const modal = document.querySelector('#order-items-edit-modal.show');
    if (!modal) return;

    const interval = setInterval(() => {
        const table = modal.querySelector('table');
        const tbody = modal.querySelector('tbody');
        if (table && tbody && table.querySelectorAll('tr').length > 0) {
            injectImagesAndLinks(modal);
            injectImagesInRegularTables(modal);
            injectImagesInOrderItemRows(modal);
            replaceBarcodesInViews(modal); // Unified barcode replacement
            clearInterval(interval);

            // ✅ Start observing tbody for changes — to reinject if rows are replaced
            const observer = new MutationObserver((mutations) => {
                // 1) skip while copy feedback is active
                if (window._tmCopying) return;

                // 2) ignore mutations coming from the copy icon area
                if (mutations.some(m => {
                  const el = (m.target?.nodeType === 1 ? m.target : m.target?.parentElement) || null;
                  return el && el.closest && el.closest('.tampermonkey-copy-wrap, .copy-icon');
                })) {
                  return;
                }

                injectImagesAndLinks(modal);
                injectImagesInRegularTables(modal);
                injectImagesInOrderItemRows(modal);
                replaceBarcodesInViews(modal); // Unified barcode replacement
            });
            observer.observe(tbody, { childList: true, subtree: true });
        }
    }, 300); // בדיקה כל 300ms
});

enhancedSafeObserver.observe(document.body, {
    childList: true,
    subtree: true
});

// פתרון נוסף: מאזין לאירוע מותאם אישית מ-Enhanced
window.addEventListener('enhanced-modal-ready', () => {
    const modal = document.querySelector('#order-items-edit-modal');
    if (!modal) return;

    const interval = setInterval(() => {
        const table = modal.querySelector('table');
        const tbody = modal.querySelector('tbody');
        if (table && tbody && table.querySelectorAll('tr').length > 0) {
            injectImagesAndLinks(modal);
            injectImagesInRegularTables(modal);
            injectImagesInOrderItemRows(modal);
            clearInterval(interval);

            // ✅ Start observing tbody for changes — to reinject if rows are replaced
            const observer = new MutationObserver((mutations) => {
                // 1) skip while copy feedback is active
                if (window._tmCopying) return;

                // 2) ignore mutations coming from the copy icon area
                if (mutations.some(m => {
                  const el = (m.target?.nodeType === 1 ? m.target : m.target?.parentElement) || null;
                  return el && el.closest && el.closest('.tampermonkey-copy-wrap, .copy-icon');
                })) {
                  return;
                }

                injectImagesAndLinks(modal);
                injectImagesInRegularTables(modal);
                injectImagesInOrderItemRows(modal);
                replaceBarcodesInViews(modal); // Unified barcode replacement
            });
            observer.observe(tbody, { childList: true, subtree: true });
        }
    }, 300); // בדיקה כל 300ms
}, { passive: true });

// --- חשיפה גלובלית ל-Enhanced ---
window.injectImagesAndLinks = window.injectImagesAndLinks || injectImagesAndLinks;
window.__TOOLBOX_READY__ = true;
window.dispatchEvent(new CustomEvent('toolbox-ready'));

// חילוץ לוגיקת פתיחת preview לפונקציה נפרדת
async function openPreviewForTask(taskId) {
    const row = document.querySelector(`tr[data-task-id="${taskId}"]`);
    if (!row) {
        console.log(`[${SCRIPT_NAME}] ❌ Row not found for task: ${taskId}`);
        return;
    }

    const currentButton = row.querySelector('.preview-button');
    if (!currentButton) {
        return;
    }

    const existingPreview = document.getElementById(`preview-for-${taskId}`);
    if (existingPreview) {
        // אם ה-preview כבר קיים, סגור אותו
        const updatedPreviews = openPreviews.filter(id => id !== taskId);
        sessionStorage.setItem('openPreviewTaskIds', JSON.stringify(updatedPreviews));

        existingPreview.remove();
        updateButtonState(currentButton, false);

        return;
    }
    // שמור את ה-taskId ב-sessionStorage לפני פתיחה
    const openPreviews = JSON.parse(sessionStorage.getItem('openPreviewTaskIds') || '[]');
    if (!openPreviews.includes(taskId)) {
        openPreviews.push(taskId);
        sessionStorage.setItem('openPreviewTaskIds', JSON.stringify(openPreviews));
    }

    // בדוק אם זה session חדש - אם כן, אל תפתח PREVIEWs אחרים
    const sessionStartTime = sessionStorage.getItem('sessionStartTime');
    const currentTime = Date.now();
    const sessionAge = currentTime - parseInt(sessionStartTime || '0');

    // אם ה-session צעיר מדי (פחות מ-5 שניות), נקה את כל ה-PREVIEWs האחרים
    if (sessionAge < 5000) {
        sessionStorage.setItem('openPreviewTaskIds', JSON.stringify([taskId]));
    }


    // נקה את כל ה-classes הקודמים וקבע למצב טעינה
    icon.classList.remove('fa-chevron-down', 'fa-chevron-up', 'fa-refresh', 'fa-spin', 'fa-exclamation-triangle');
    icon.classList.add('fa-refresh', 'fa-spin');
    currentButton.disabled = true;
    try {
        const response = await fetch(`/tasks/${taskId}`); if (!response.ok) throw new Error(`Fetch error: ${response.status}`);
        const doc = new DOMParser().parseFromString(await response.text(), 'text/html'); const allItems = [];

        // Extract notes from the fetched task page
        let notesText = '';
        let isReady = false;
        const notesEl = doc.querySelector('.bg-yellow .hover-copy'); // Assuming this is the selector for notes
        if (notesEl) {
            notesText = notesEl.textContent.trim();
            // Check if notes contain "מוכן" for highlighting
            if (notesText.includes('מוכן')) {
                isReady = true;
            }
        }

        const productTable = findProductTableInScope(doc);

        if (productTable) {
            const headers = Array.from(productTable.querySelectorAll('thead th')).map(th => th.textContent.trim());

            // שיפור: זיהוי גמיש יותר של כותרות - מזהה גם וריאציות של הכותרות
            const skuIndex = headers.findIndex(h => h.includes('מק')),
                  nameIndex = headers.findIndex(h => h.includes('שם')),
                  quantityIndex = headers.findIndex(h => h.includes('כמות') || h.includes('לוקט')),
                  priceIndex = headers.findIndex(h => h.includes('מחיר ליחידה'));

            if (skuIndex !== -1 && nameIndex !== -1 && quantityIndex !== -1) {
                const rows = productTable.querySelectorAll('tbody tr');

                rows.forEach((itemRow, index) => {
                    const cells = itemRow.cells;
                    const name = cells[nameIndex].textContent.trim(),
                          sku = cells[skuIndex].textContent.trim(),
                          quantity = cells[quantityIndex].textContent.trim();

                    // חלץ מחיר אם קיים
                    let price = null;
                    if (priceIndex !== -1 && cells[priceIndex]) {
                        const priceText = cells[priceIndex].textContent.trim();
                        const priceMatch = priceText.match(/[\d,]+\.?\d*/);
                        if (priceMatch) {
                            price = priceMatch[0].replace(/,/g, '');
                        }
                    }

                    // Try to find image match - first with original SKU, then with replaced barcode
                    let imageMatch = findImageMatch(sku, name);
                    
                    // If no image found with original SKU, try with replaced barcode
                    if (!imageMatch) {
                        const replacedBarcode = findBarcode(sku, name);
                        if (replacedBarcode && replacedBarcode !== sku) {
                            imageMatch = findImageMatch(replacedBarcode, name);
                        }
                    }
                    
                    const barcodeMatch = findBarcode(sku, name);
                    allItems.push({
                        name,
                        sku,
                        quantity,
                        price,
                        image: imageMatch ? imageMatch.image : PLACEHOLDER_IMG_URL,
                        barcode: barcodeMatch
                    });
                });
            }
        }
        
        const newRow = document.createElement('tr'); newRow.id = `preview-for-${taskId}`;
        if (isReady) {
            newRow.classList.add('ready-row-highlight');
        }
        const newCell = document.createElement('td'); newCell.colSpan = parentRow.cells.length; newCell.style.cssText = 'padding: 15px; background-color: #f9f9f9;';


        newCell.innerHTML = `<a href="/tasks/${taskId}" target="_blank" class="btn btn-primary btn-sm mb-3"><i class="fa-light fa-arrow-up-right-from-square" style="margin-left: 5px;"></i> פתח הזמנה</a>`;

        // Add notes to the preview if found
        if (notesText) {
            // Highlight "מוכן" in bold if present
            const highlightedNotes = notesText.replace(/מוכן/g, '<strong>מוכן</strong>');
            newCell.innerHTML += `<div class="preview-notes"><i class="fa-light fa-note-sticky"></i> ${highlightedNotes}</div>`;
        }

        if (allItems.length > 0) {
            const container = document.createElement('div'); container.style.cssText = 'display: flex; flex-wrap: wrap; gap: 8px;';

            allItems.forEach((item, itemIndex) => {
                if (window.DEBUG_TOOLBOX) {

                }
                const itemDiv = document.createElement('div'); itemDiv.className = 'd-flex align-items-center border rounded p-2 m-1 bg-white';
                itemDiv.style.cssText = 'min-width: 200px; max-width: 300px;';

                const imageContainer = document.createElement('div'); imageContainer.style.cssText = 'width: 50px; height: 50px; margin-left: 8px; flex-shrink: 0;';
                const img = document.createElement('img'); img.src = item.image; img.style.cssText = 'width: 100%; height: 100%; object-fit: cover; border-radius: 4px;';
                imageContainer.appendChild(img);

                const textContainer = document.createElement('div'); textContainer.style.cssText = 'flex: 1; min-width: 0;';
                const nameDiv = document.createElement('div'); nameDiv.textContent = item.name; nameDiv.style.cssText = 'font-weight: bold; font-size: 0.9em; margin-bottom: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
                const skuDiv = document.createElement('div'); skuDiv.textContent = `מק"ט: ${item.sku}`; skuDiv.style.cssText = 'font-size: 0.8em; color: #666; margin-bottom: 2px;';
                const quantityDiv = document.createElement('div'); quantityDiv.textContent = `כמות: ${item.quantity}`; quantityDiv.style.cssText = 'font-size: 0.8em; color: #666;';

                if (item.price) {
                    const priceDiv = document.createElement('div'); priceDiv.textContent = `מחיר: ₪${item.price}`; priceDiv.style.cssText = 'font-size: 0.8em; color: #666; margin-top: 2px;';
                    textContainer.appendChild(priceDiv);
                }

                textContainer.appendChild(nameDiv); textContainer.appendChild(skuDiv); textContainer.appendChild(quantityDiv);
                itemDiv.appendChild(imageContainer); itemDiv.appendChild(textContainer);

                if (item.barcode) {
                    const barcodeDiv = document.createElement('div'); barcodeDiv.style.cssText = 'margin-top: 4px; text-align: center;';
                    const barcodeImg = document.createElement('img'); barcodeImg.src = item.barcode; barcodeImg.style.cssText = 'max-width: 100%; height: 30px;';
                    barcodeDiv.appendChild(barcodeImg); itemDiv.appendChild(barcodeDiv);
                }

                container.appendChild(itemDiv);
            });

            newCell.appendChild(container);
        }

        newRow.appendChild(newCell); parentRow.parentNode.insertBefore(newRow, parentRow.nextSibling);
        updateButtonState(currentButton, true);
        currentButton.blur(); // מסיר פוקוס מהכפתור כדי שמקשי חץ יעבדו על ה-side panel


    } catch (err) {
        console.error("Failed to fetch task preview:", err);
        icon.classList.remove('fa-refresh', 'fa-spin');
        icon.classList.add('fa-exclamation-triangle');
        currentButton.disabled = false;
    }
}

// Helper function to update button state (chevron and title)
function updateButtonState(button, isOpen) {
  const icon = button.querySelector('i');
  if (icon) {
    // נקה את כל ה-classes הקשורים לאייקונים
    icon.classList.remove('fa-chevron-down', 'fa-chevron-up', 'fa-refresh', 'fa-spin', 'fa-exclamation-triangle');

    if (isOpen) {
      icon.classList.add('fa-chevron-up');
      button.title = 'הסתר פריטים';
    } else {
      icon.classList.add('fa-chevron-down');
      button.title = 'הצג פריטים';
    }
  }
}

// Helper function to toggle preview sections (calculator/notes)
function togglePreviewSection(button, sectionType) {
  const previewRow = button.closest('tr[id^="preview-for-"]');
  if (!previewRow) return;

  const section = previewRow.querySelector(`.${sectionType}-section`);
  if (!section) return;

  const isVisible = section.style.display !== 'none';
  
  if (isVisible) {
    // Hide section
    section.style.display = 'none';
    button.classList.remove('active');
  } else {
    // Show section
    section.style.display = 'block';
    button.classList.add('active');
  }
}

// MutationObserver שמזהה הכנסת שורה חדשה עם אותו taskId ופותח preview מחדש
(function setupPreviewAutoRestore() {
  // בדוק אם זה session חדש (אחרי REFRESH)
  const sessionStartTime = sessionStorage.getItem('sessionStartTime');
  const currentTime = Date.now();

  if (!sessionStartTime) {
    // זה session חדש - נקה את ה-PREVIEWs הפתוחים ושמור את זמן התחלה
    sessionStorage.removeItem('openPreviewTaskIds');
    sessionStorage.setItem('sessionStartTime', currentTime.toString());
  } else {
    // בדוק אם יש PREVIEWs ישנים ב-sessionStorage
    const openPreviews = JSON.parse(sessionStorage.getItem('openPreviewTaskIds') || '[]');
    if (openPreviews.length > 0) {
      // נקה את ה-PREVIEWs הישנים רק אם זה session חדש (אחרי REFRESH)
      // אבל אל תמחק אם זה session ישן (אחרי שינוי סטטוס)
      const sessionAge = currentTime - parseInt(sessionStartTime);
      if (sessionAge < 5000) {
        sessionStorage.removeItem('openPreviewTaskIds');
      }
    }
  }

  function setupObserver() {
    const table = document.querySelector('#operator-store-visits-table');
    if (!table) {
      setTimeout(setupObserver, 500);
      return;
    }
    const tbody = table.querySelector('tbody');
    if (!tbody) {
      setTimeout(setupObserver, 500);
      return;
    }

    const observer = new MutationObserver((mutations) => {
    // 1) skip while copy feedback is active
    if (window._tmCopying) return;

    // 2) ignore mutations coming from the copy icon area
    if (mutations.some(m => {
      const el = (m.target?.nodeType === 1 ? m.target : m.target?.parentElement) || null;
      return el && el.closest && el.closest('.tampermonkey-copy-wrap, .copy-icon');
    })) {
      return;
    }

    // בדוק אם יש previews פתוחים ב-sessionStorage
    const openPreviews = JSON.parse(sessionStorage.getItem('openPreviewTaskIds') || '[]');
    if (openPreviews.length === 0) {
      return;
    }

    // בדוק אם זה session חדש (אחרי REFRESH) - אם כן, אל תפתח PREVIEWs
    const sessionStartTime = sessionStorage.getItem('sessionStartTime');
    const currentTime = Date.now();
    const sessionAge = currentTime - parseInt(sessionStartTime || '0');

    // אם ה-session צעיר מדי (פחות מ-5 שניות), אל תפתח PREVIEWs אוטומטית
    if (sessionAge < 5000) {
      return;
    }

    // אם יש PREVIEWs ישנים ב-sessionStorage, בדוק אם זה session חדש או ישן
    if (openPreviews.length > 0) {
      const sessionAge = currentTime - parseInt(sessionStartTime || '0');
      if (sessionAge < 5000) {
        // אם זה session חדש (אחרי REFRESH), נקה את ה-PREVIEWs ולא תפתח אותם
        sessionStorage.removeItem('openPreviewTaskIds');
        return;
      }
    }

    const openTaskIds = openPreviews;

    // בדוק כל preview פתוח
    openTaskIds.forEach(taskId => {
      const row = tbody.querySelector('tr[data-task-id="' + taskId + '"]');
      const existingPreview = document.getElementById(`preview-for-${taskId}`);

      if (row && !existingPreview) {
        openPreviewForTask(taskId);
      } else if (!row) {
        // אם השורה לא נמצאה, נסה שוב אחרי קצת זמן
        setTimeout(() => {
          const retryRow = tbody.querySelector('tr[data-task-id="' + taskId + '"]');
          const retryPreview = document.getElementById(`preview-for-${taskId}`);
          if (retryRow && !retryPreview) {
            openPreviewForTask(taskId);
          } else if (!retryRow) {
            // נסה שוב אחרי זמן נוסף
            setTimeout(() => {
              const secondRetryRow = tbody.querySelector('tr[data-task-id="' + taskId + '"]');
              const secondRetryPreview = document.getElementById(`preview-for-${taskId}`);
              if (secondRetryRow && !secondRetryPreview) {
                openPreviewForTask(taskId);
              }
            }, 500);
          }
        }, 100);
      }
    });
    });

    observer.observe(tbody, { childList: true, subtree: true });
  }

  setupObserver();
})();

})(); //

// Performance monitoring to reduce setTimeout violations
const originalSetTimeout = window.setTimeout;
window.setTimeout = function(callback, delay, ...args) {
  const wrappedCallback = function() {
    const startTime = performance.now();
    try {
      callback.apply(this, args);
    } finally {
      const endTime = performance.now();
      const duration = endTime - startTime;
      if (duration > 50) { // Log slow callbacks
        // Removed excessive logging to reduce console noise
      }
    }
  };
  return originalSetTimeout.call(this, wrappedCallback, delay);
};

// Performance monitoring for requestAnimationFrame
const originalRequestAnimationFrame = window.requestAnimationFrame;
window.requestAnimationFrame = function(callback) {
  const wrappedCallback = function(timestamp) {
    const startTime = performance.now();
    try {
      callback(timestamp);
    } finally {
      const endTime = performance.now();
      const duration = endTime - startTime;
      if (duration > 16) { // Log slow animation frames (should be < 16ms for 60fps)
        // Removed excessive logging to reduce console noise
      }
    }
  };
  return originalRequestAnimationFrame.call(this, wrappedCallback);
};