// ==UserScript==
// @name         Lionwheel - Anipet Image Finder
// @namespace    anipet-lionwheel
// @version      3.0.13
// @description  Finds Images. Prioritizes current SKU, then data-original-sku, then exact product name match. No partial name matching to avoid errors.
// @match        *://*.lionwheel.com/*
// @exclude      *://*lionwheel.com/drivers/*
// @exclude      *://*lionwheel.com/drivers/*
// @exclude      *://*lionwheel.com/organization/*
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    const SCRIPT_NAME = "Lionwheel - Anipet Image Finder";
    const SCRIPT_VERSION = "3.0.13";
    console.log(`🟡 ${SCRIPT_NAME} v${SCRIPT_VERSION} script loaded`);

    const CSV_URL = "https://raw.githubusercontent.com/AdamLee9186/anipet/main/anipet_master_catalog_v1.csv";

    let productDataCache = null;
    let isCsvLoading = false;
    let pendingInjectionCalls = [];

    let csvSkuIndex = -1;
    let csvImageIndex = -1;
    let csvUrlIndex = -1;
    let csvProductNameIndex = -1;

    function normalizeSku(sku) {
        if (typeof sku !== 'string') return '';
        return sku.replace(/\D/g, '');
    }

    function loadCSV(callback) {
        if (productDataCache) {
            callback(productDataCache);
            return;
        }
        if (isCsvLoading) {
            pendingInjectionCalls.push(callback);
            return;
        }
        isCsvLoading = true;
        // console.log(`[${SCRIPT_NAME}] 📥 Loading CSV from: ${CSV_URL}`); // אפשר להסיר אם רוצים פחות לוגים

        if (typeof GM_xmlhttpRequest !== "undefined") {
            GM_xmlhttpRequest({
                method: "GET",
                url: CSV_URL,
                onload: function(response) {
                    if (response.status >= 200 && response.status < 300) {
                        processCsvText(response.responseText, callback);
                    } else {
                        handleCsvError(new Error(`❌ CSV fetch failed (GM_xmlhttpRequest): ${response.status} ${response.statusText} for URL ${CSV_URL}`), callback);
                    }
                },
                onerror: function(responseDetails) {
                    handleCsvError(new Error(`❌ CSV fetch error (GM_xmlhttpRequest): ${responseDetails.statusText || 'Network error'} for URL ${CSV_URL}. Final URL: ${responseDetails.finalUrl}`), callback);
                }
            });
        } else {
            fetch(CSV_URL)
                .then(res => {
                    if (!res.ok) throw new Error(`❌ CSV fetch failed (fetch): ${res.status} ${res.statusText} for URL ${CSV_URL}`);
                    return res.text();
                })
                .then(text => processCsvText(text, callback))
                .catch(err => handleCsvError(err, callback));
        }
    }

    function processCsvText(text, callback) {
        // console.log(`[${SCRIPT_NAME}] ✅ CSV loaded successfully.`); // אפשר להסיר אם רוצים פחות לוגים
        const lines = text.trim().split("\n");
        if (lines.length <= 1) {
            console.warn(`[${SCRIPT_NAME}] ❗ CSV is empty or has only headers.`);
            productDataCache = [];
            finishCsvLoading([], callback);
            return;
        }

        const rawHeaders = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ''));
        const headers = rawHeaders.map(h => h.toLowerCase());

        const findHeaderIndex = (name) => {
            const lowerName = name.toLowerCase();
            let foundIdx = headers.indexOf(lowerName);
            if (foundIdx === -1) {
                for (let i = 0; i < headers.length; i++) {
                    if (headers[i].replace(/^"|"$/g, '') === lowerName) {
                        foundIdx = i;
                        break;
                    }
                }
            }
            return foundIdx;
        };

        csvSkuIndex = findHeaderIndex("SKUs");
        csvImageIndex = findHeaderIndex("Image URL");
        csvUrlIndex = findHeaderIndex("Product URL");
        csvProductNameIndex = findHeaderIndex("Product Name");

        // console.log(`[${SCRIPT_NAME}] [CSV Headers] Indices:`, {sku: csvSkuIndex, image: csvImageIndex, url: csvUrlIndex, name: csvProductNameIndex});

        if (csvSkuIndex === -1) console.error(`[${SCRIPT_NAME}] ❗ CSV Error: 'SKUs' header missing.`);
        if (csvImageIndex === -1) console.error(`[${SCRIPT_NAME}] ❗ CSV Error: 'Image URL' header missing.`);

        if (csvSkuIndex === -1 || csvImageIndex === -1) {
            productDataCache = [];
            finishCsvLoading([], callback);
            console.error(`[${SCRIPT_NAME}] ❗ Critical CSV headers missing. No images/links.`);
            return;
        }

        const data = lines.slice(1).map((line, rowIndex) => {
            const parts = [];
            let currentSegment = '';
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') {
                    if (inQuotes && i + 1 < line.length && line[i+1] === '"') {
                        currentSegment += '"'; i++; continue;
                    }
                    inQuotes = !inQuotes;
                } else if (char === ',' && !inQuotes) {
                    parts.push(currentSegment.trim()); currentSegment = '';
                } else {
                    currentSegment += char;
                }
            }
            parts.push(currentSegment.trim());

            const requiredColsIndices = [csvSkuIndex, csvImageIndex];
            if (csvUrlIndex !== -1) requiredColsIndices.push(csvUrlIndex);
            if (csvProductNameIndex !== -1) requiredColsIndices.push(csvProductNameIndex);
            const validIndices = requiredColsIndices.filter(idx => idx !== -1);
            if (validIndices.length === 0) return null;
            const maxIndex = Math.max(...validIndices);
            if (parts.length <= maxIndex) return null;

            let skusString = (parts[csvSkuIndex] || "").trim().replace(/^"|"$/g, '');
            const parsedSkus = skusString ? skusString.split(',').map(s => s.trim()).filter(s => s) : [];

            return {
                skus: parsedSkus.map(s => normalizeSku(s)).filter(s => s),
                image: (parts[csvImageIndex] || "").trim().replace(/^"|"$/g, ''),
                link: csvUrlIndex !== -1 ? ((parts[csvUrlIndex] || "").trim().replace(/^"|"$/g, '')) : '',
                productName: csvProductNameIndex !== -1 ? ((parts[csvProductNameIndex] || "").trim().replace(/^"|"$/g, '')) : ''
            };
        }).filter(Boolean);

        productDataCache = data;
        console.log(`[${SCRIPT_NAME}] 🧾 Parsed ${productDataCache.length} valid rows from CSV.`);
        finishCsvLoading(productDataCache, callback);
    }

    function handleCsvError(err, callback) {
        console.error(`[${SCRIPT_NAME}] ❗ Error loading or parsing CSV:`, err);
        productDataCache = [];
        finishCsvLoading([], callback);
    }

    function finishCsvLoading(data, mainCallback) {
        isCsvLoading = false;
        mainCallback(data);
        pendingInjectionCalls.forEach(cb => cb(data));
        pendingInjectionCalls = [];
    }

    function getFullSizeImageUrl(thumbnailUrl) {
        if (!thumbnailUrl || typeof thumbnailUrl !== 'string') return '';
        try {
            if (thumbnailUrl.includes('cdn.modulus.co.il')) {
                return thumbnailUrl.split('?')[0];
            } else if (thumbnailUrl.includes('www.gag-lachayot.co.il')) {
                return thumbnailUrl.replace(/-\d+x\d+(\.[a-zA-Z0-9]+(?:[?#].*)?)$/, '$1').replace(/-\d+x\d+$/, '');
            } else if (thumbnailUrl.includes('www.all4pet.co.il')) {
                return thumbnailUrl.replace(/_small(\.[a-zA-Z0-9]+(?:[?#].*)?)$/, '$1').replace(/_small$/, '');
            } else if (thumbnailUrl.includes('d3m9l0v76dty0.cloudfront.net')) {
                if (thumbnailUrl.includes('/show/')) {
                    return thumbnailUrl.replace('/show/', '/extra_large/');
                } else if (thumbnailUrl.includes('/index/')) {
                    return thumbnailUrl.replace('/index/', '/extra_large/');
                } else if (thumbnailUrl.includes('/large/')) {
                    return thumbnailUrl.replace('/large/', '/extra_large/');
                }
                return thumbnailUrl;
            } else if (thumbnailUrl.includes('just4pet.co.il')) {
                const parts = thumbnailUrl.split('/');
                const filenameWithQuery = parts.pop();
                const filenameParts = filenameWithQuery.split('?');
                const filename = filenameParts[0];
                const query = filenameParts.length > 1 ? `?${filenameParts[1]}` : '';

                if (filename.startsWith('tn_')) {
                    const newFilename = filename.substring(3);
                    return parts.join('/') + '/' + newFilename + query;
                }
                return thumbnailUrl;
            }
            else {
                return thumbnailUrl;
            }
        } catch (e) {
            console.warn(`[${SCRIPT_NAME}] ⚠️ Error processing thumbnail URL, returning original:`, thumbnailUrl, e);
            return thumbnailUrl;
        }
    }

    function showImageOverlay(fullSizeUrl, originalThumbnailUrl) {
        const existingOverlay = document.getElementById('tampermonkey-sku-image-overlay');
        if (existingOverlay) existingOverlay.remove();

        const overlay = document.createElement('div');
        overlay.id = 'tampermonkey-sku-image-overlay';
        overlay.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.85); display: flex; justify-content: center; align-items: center; z-index: 10000; padding: 20px; box-sizing: border-box; opacity: 0; transition: opacity 0.3s ease;`;

        const imgElement = document.createElement('img');
        imgElement.alt = "תמונה מוגדלת";
        imgElement.style.cssText = `max-width: 90%; max-height: 90%; object-fit: contain; border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.3); transform: scale(0.95); transition: transform 0.3s ease;`;

        imgElement.onload = () => {};
        imgElement.onerror = () => {
            console.warn(`[${SCRIPT_NAME}] ❗ Failed to load: ${fullSizeUrl}. Loading thumbnail: ${originalThumbnailUrl}`);
            if (imgElement.src !== originalThumbnailUrl) {
                imgElement.src = originalThumbnailUrl;
                imgElement.alt = "תמונה ממוזערת (מקורית)";
            } else {
                console.error(`[${SCRIPT_NAME}] ❌ Failed to load both images: ${originalThumbnailUrl}`);
                overlay.innerHTML = `<p style="color:white;text-align:center;">לא ניתן לטעון את התמונה.</p>`;
                if (!overlay.contains(closeButton)) overlay.appendChild(closeButton);
            }
        };
        imgElement.src = fullSizeUrl;

        const closeButton = document.createElement('button');
        closeButton.textContent = '×';
        closeButton.title = 'סגור (Esc)';
        closeButton.style.cssText = `position: absolute; top: 15px; right: 25px; font-size: 36px; color: white; font-weight: bold; background-color: transparent; border: none; cursor: pointer; line-height: 1; padding: 5px; text-shadow: 0 0 5px rgba(0,0,0,0.5);`;

        const closeOverlay = () => {
            overlay.style.opacity = '0';
            setTimeout(() => {
                if (document.getElementById('tampermonkey-sku-image-overlay')) {
                    document.getElementById('tampermonkey-sku-image-overlay').remove();
                }
                document.removeEventListener('keydown', handleEscKey);
            }, 300);
        };

        closeButton.onclick = closeOverlay;
        overlay.onclick = (event) => { if (event.target === overlay) closeOverlay(); };
        const handleEscKey = (event) => { if (event.key === 'Escape') closeOverlay(); };
        document.addEventListener('keydown', handleEscKey);

        if (!overlay.innerHTML.includes('<p')) overlay.appendChild(imgElement);
        overlay.appendChild(closeButton);
        document.body.appendChild(overlay);

        setTimeout(() => {
            overlay.style.opacity = '1';
            if (overlay.contains(imgElement)) imgElement.style.transform = 'scale(1)';
        }, 10);
    }

    function hideTableColumns(tableElement, columnIndices) {
        if (!tableElement || !columnIndices || columnIndices.length === 0) return;
        columnIndices.forEach(index => {
            const headerCell = tableElement.querySelector(`thead > tr > th:nth-child(${index})`);
            if (headerCell && headerCell.style.display !== 'none') headerCell.style.display = 'none';
            const dataCells = tableElement.querySelectorAll(`tbody > tr > td:nth-child(${index})`);
            dataCells.forEach(cell => { if (cell.style.display !== 'none') cell.style.display = 'none'; });
        });
    }

    function applyToCells(cellsSelector, skuCellSelectorInRow, imageTargetCellSelectorInRow) {
        const nameCells = document.querySelectorAll(cellsSelector);
        nameCells.forEach((nameCell) => {
            const row = nameCell.closest('tr');
            if (!row) return;

            // const uniqueRowIdForLog = nameCell.closest('tr')?.rowIndex ?? Math.random().toString(36).substring(2, 8);
            // let runCountDataAttr = `data-${SCRIPT_NAME.toLowerCase().replace(/\s+/g, '-')}-runcount`;
            // let currentRunCount = parseInt(row.getAttribute(runCountDataAttr) || '0') + 1;
            // row.setAttribute(runCountDataAttr, currentRunCount.toString());
            // const logPrefix = `[${SCRIPT_NAME} DEBUG #${uniqueRowIdForLog}-${currentRunCount}]`;
            // console.log(`${logPrefix} --- applyToCells START for Name: "${nameCell.textContent?.trim()}" ---`);


            let imageDisplayTargetCell = imageTargetCellSelectorInRow ? row.querySelector(imageTargetCellSelectorInRow) : row.querySelector('td:first-child');
            if (!imageDisplayTargetCell) return;

            const existingScriptImg = imageDisplayTargetCell.querySelector('img.tampermonkey-sku-image');
            if (existingScriptImg) existingScriptImg.remove();

            const existingScriptLink = nameCell.querySelector('a.tampermonkey-product-link');
            if (existingScriptLink) {
                while (existingScriptLink.firstChild) nameCell.insertBefore(existingScriptLink.firstChild, existingScriptLink);
                existingScriptLink.remove();
            }

            const nameText = nameCell.textContent ? nameCell.textContent.trim() : '';
            const skuCellFromRow = skuCellSelectorInRow ? row.querySelector(skuCellSelectorInRow) : null;
            let match = null;
            // let matchQuality = 'none';

            if (productDataCache && productDataCache.length > 0 && skuCellFromRow) {
                let skuFromCurrentText = '';
                let skuFromDataAttribute = '';
                let finalSkuToSearch = '';
                let fallbackSkuToSearch = '';

                if (skuCellFromRow.textContent) {
                    skuFromCurrentText = skuCellFromRow.textContent.trim();
                }
                if (skuCellFromRow.hasAttribute('data-original-sku')) {
                    skuFromDataAttribute = skuCellFromRow.getAttribute('data-original-sku').trim();
                }
                // console.log(`${logPrefix} SKU current: "${skuFromCurrentText}", data-attr: "${skuFromDataAttribute}"`);

                if (skuFromCurrentText) {
                    finalSkuToSearch = skuFromCurrentText;
                    if (skuFromDataAttribute && normalizeSku(skuFromDataAttribute) !== normalizeSku(skuFromCurrentText)) {
                        fallbackSkuToSearch = skuFromDataAttribute;
                    }
                } else if (skuFromDataAttribute) {
                    finalSkuToSearch = skuFromDataAttribute;
                }

                if (finalSkuToSearch) {
                    const normalizedSku = normalizeSku(finalSkuToSearch);
                    if (normalizedSku) {
                        match = productDataCache.find(product => product.skus.includes(normalizedSku));
                        // if (match) matchQuality = 'sku_priority1';
                    }
                }

                if (!match && fallbackSkuToSearch) {
                    const normalizedSku = normalizeSku(fallbackSkuToSearch);
                    if (normalizedSku) {
                        match = productDataCache.find(product => product.skus.includes(normalizedSku));
                        // if (match) matchQuality = 'sku_priority2_fallback';
                    }
                }
            }

            // חיפוש לפי שם מוצר מדויק - רק אם לא נמצאה התאמה לפי SKU
            if (!match && csvProductNameIndex !== -1 && nameText && productDataCache) {
                const pageProductNameNormalized = nameText.toLowerCase().trim();
                // console.log(`${logPrefix} No SKU match. Trying EXACT Product Name: "${pageProductNameNormalized}"`);

                match = productDataCache.find(product =>
                    product.productName && product.productName.toLowerCase().trim() === pageProductNameNormalized
                );

                // if (match) {
                //     matchQuality = 'name_exact';
                //     console.log(`${logPrefix} Product Name ("${nameText}") EXACTLY MATCHED: "${match.productName}"`);
                // } else {
                //     // אם אתה רוצה להסיר לחלוטין התאמה חלקית, פשוט מחק את ה-else הזה.
                //     // console.log(`${logPrefix} Product Name ("${nameText}") NO EXACT MATCH.`);
                // }
            }

            if (match) {
                // console.log(`${logPrefix} FINAL MATCH (Quality: ${matchQuality}) for "${nameText}"`);
                if (match.image && !imageDisplayTargetCell.querySelector('img.tampermonkey-sku-image')) {
                    const originalThumbnailUrl = match.image;
                    const img = document.createElement('img');
                    img.src = originalThumbnailUrl;
                    img.alt = `תמונה עבור ${nameText || 'מוצר'}`;
                    img.style.cssText = 'width: auto; height: 110px; max-height: 110px; max-width: 110px; object-fit: contain; border-radius: 4px; vertical-align: middle; cursor: pointer; display: block; margin: 0;';
                    img.className = 'tampermonkey-sku-image';
                    img.title = 'לחץ להגדלת התמונה';
                    img.onclick = (e) => {
                        e.stopPropagation();
                        const fullSizeImageUrlAttempt = getFullSizeImageUrl(originalThumbnailUrl);
                        showImageOverlay(fullSizeImageUrlAttempt, originalThumbnailUrl);
                    };

                    imageDisplayTargetCell.style.display = 'flex';
                    imageDisplayTargetCell.style.justifyContent = 'center';
                    imageDisplayTargetCell.style.alignItems = 'center';
                    imageDisplayTargetCell.style.padding = '2px';

                    imageDisplayTargetCell.prepend(img);
                }

                if (match.link && csvUrlIndex !== -1 && !nameCell.querySelector('a.tampermonkey-product-link')) {
                    const originalContentNodes = Array.from(nameCell.childNodes);
                    const linkElement = document.createElement('a');
                    linkElement.href = match.link;
                    linkElement.target = '_blank';
                    linkElement.rel = 'noopener noreferrer';
                    linkElement.className = 'tampermonkey-product-link';

                    if (match.link.includes('anipet.co.il')) {
                        linkElement.style.color = '#3d9cfe';
                    } else {
                        linkElement.style.color = '#809fba';
                    }

                    linkElement.style.textDecoration = 'none';
                    linkElement.style.cursor = 'pointer';
                    linkElement.title = `פתח דף מוצר עבור ${nameText || 'מוצר'}`;

                    nameCell.innerHTML = '';
                    originalContentNodes.forEach(node => linkElement.appendChild(node.cloneNode(true)));
                    nameCell.appendChild(linkElement);
                }
            }
        });
    }

    // ... (שאר הפונקציות injectImagesAndLinks, processPageContent, MutationObserver, history API וכו' - נשארות זהות)

    function injectImagesAndLinks(currentProductData) {
        if (!currentProductData || currentProductData.length === 0) return;
        applyToCells(
            '#taskOverview > div > div:nth-child(2) > div.row > div > div > table > tbody > tr > td:nth-child(3)',
            'td.text-nowrap', 'td:first-child'
        );
        applyToCells(
            '#kt_content > div.d-flex.flex-column-fluid > div > div > div > div > div > div > div > div > div:nth-child(8) > div > div > table > tbody > tr > td:nth-child(3)',
            'td:nth-child(2)', 'td:first-child'
        );
    }

    function processPageContent() {
        const mainTaskOverviewTable = document.querySelector('#taskOverview table.table-hover');
        if (mainTaskOverviewTable) hideTableColumns(mainTaskOverviewTable, [4, 7, 8, 9, 10]);

        const mainKtContentTable = document.querySelector('#kt_content table.table-hover');
        if (mainKtContentTable) hideTableColumns(mainKtContentTable, [4, 7, 8, 9, 10]);

        const alternativeTables = document.querySelectorAll('table.table.table-hover:not(#taskOverview table.table-hover):not(#kt_content table.table-hover)');
        alternativeTables.forEach(altTable => {
            const headerCells = altTable.querySelectorAll('thead th');
            let skuColumnIndex = -1;
            headerCells.forEach((th, idx) => {
                if (th.textContent && (th.textContent.includes('מק״ט') || th.textContent.toLowerCase().includes('sku'))) {
                    skuColumnIndex = idx + 1;
                }
            });
            if (skuColumnIndex === 2 || skuColumnIndex === 3) {
                const columnsToHideForAlt = [4, 7, 8, 9, 10];
                if (altTable.querySelectorAll('thead th').length >= Math.max(...columnsToHideForAlt)) {
                     hideTableColumns(altTable, columnsToHideForAlt);
                }
            }
        });

        if (productDataCache) {
            injectImagesAndLinks(productDataCache);
        } else {
            loadCSV(data => {
                if (data && data.length > 0) {
                    injectImagesAndLinks(data);
                } else {
                    console.log(`[${SCRIPT_NAME}] No data from CSV to inject after loading, or CSV not loaded yet.`);
                }
            });
        }
    }

    setTimeout(processPageContent, 1000);

    let debounceTimer;
    const observer = new MutationObserver((mutationsList) => {
        let relevantChangeDetected = false;
        for (const mutation of mutationsList) {
            if (mutation.type === 'childList' || mutation.type === 'subtree') {
                if (mutation.target.closest('#taskOverview, #kt_content, table.table-hover') ||
                    (mutation.target.id && ['taskOverview', 'kt_content'].includes(mutation.target.id)) ||
                    (mutation.target.classList && mutation.target.classList.contains('table-hover'))) {
                    relevantChangeDetected = true; break;
                }
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        if ((node.matches && node.matches('#taskOverview table, #taskOverview tr, #kt_content table, #kt_content tr, table.table-hover, table.table-hover tr')) ||
                            (node.querySelector && node.querySelector('#taskOverview table, #kt_content table, table.table-hover'))) {
                            relevantChangeDetected = true; break;
                        }
                    }
                }
            } else if (mutation.type === 'attributes') {
                 if (mutation.target.closest('#taskOverview table, #kt_content table, table.table-hover') ||
                     (mutation.target.classList && mutation.target.classList.contains('barcode-highlight')) ||
                     (mutation.attributeName === 'title' && mutation.target.title && mutation.target.title.includes('ברקוד הוחלף')) ||
                     (mutation.attributeName === 'data-original-sku')) {
                    // let runCountDataAttrPrefix = `data-${SCRIPT_NAME.toLowerCase().replace(/\s+/g, '-')}-runcount`;
                    // if (mutation.attributeName !== runCountDataAttrPrefix && mutation.attributeName !== `data-image-finder-last-match-quality`) {
                         relevantChangeDetected = true;
                    // }
                }
            }
            if (relevantChangeDetected) break;
        }
        if (relevantChangeDetected) {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(processPageContent, 450);
        }
    });

    let attempts = 0;
    function observeTaskOverview() {
        const observerTarget = document.getElementById('app') || document.querySelector('.page-content') || document.body;
        const taskOverviewElement = document.getElementById('taskOverview');
        const ktContentElement = document.getElementById('kt_content');

        if (observerTarget) {
            observer.observe(observerTarget, { childList: true, subtree: true, attributes: true });
        }
        if ((!taskOverviewElement && !ktContentElement) && attempts < 20) {
            attempts++;
            setTimeout(observeTaskOverview, 700);
        } else if ((!taskOverviewElement && !ktContentElement) && attempts >= 20) {
            console.warn(`[${SCRIPT_NAME}] Neither #taskOverview nor #kt_content found after multiple attempts.`);
        }
    }
    observeTaskOverview();

    window.addEventListener('hashchange', () => {
        console.log(`[${SCRIPT_NAME}] #️⃣ Hash changed. Re-processing.`);
        setTimeout(processPageContent, 700);
    });

    (function(history){
        const originalPushState = history.pushState;
        history.pushState = function() {
            const result = originalPushState.apply(this, arguments);
            window.dispatchEvent(new Event('pushstate'));
            setTimeout(processPageContent, 700);
            return result;
        };
        const originalReplaceState = history.replaceState;
        history.replaceState = function() {
            const result = originalReplaceState.apply(this, arguments);
            window.dispatchEvent(new Event('replacestate'));
            setTimeout(processPageContent, 700);
            return result;
        };
        window.addEventListener('popstate', () => {
            setTimeout(processPageContent, 700);
        });
    })(window.history);

    console.log(`✅ ${SCRIPT_NAME} v${SCRIPT_VERSION} setup complete.`);

})();