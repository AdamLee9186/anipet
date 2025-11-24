// ==UserScript==
// @name         Lionwheel - חיפוש גוגל
// @namespace    http://tampermonkey.net/
// @version      1.6
// @description  מוסיף אייקון של חיפוש בגוגל תמונות ליד שמות מוצרים בלבד
// @match        https://members.lionwheel.com/*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/AdamLee9186/anipet/main/googlesearch.js
// @downloadURL  https://raw.githubusercontent.com/AdamLee9186/anipet/main/googlesearch.js
// ==/UserScript==

(function () {
    'use strict';

    function isProductTable(table) {
        const headers = Array.from(table.querySelectorAll('thead th'))
            .map(th => th.textContent.trim());

        // "שם" should always exist
        const hasNameHeader = headers.includes('שם');

        // Barcode header can be either the original "מק״ט"
        // or the renamed "ברקוד" from toolbox.js
        const hasBarcodeHeader = headers.some(h => h === 'מק״ט' || h === 'ברקוד');

        const hasUnitPriceHeader = headers.includes('מחיר ליחידה');
        const hasQuantityHeader = headers.includes('כמות / לוקט');

        return (
            hasNameHeader &&
            hasBarcodeHeader &&
            hasUnitPriceHeader &&
            hasQuantityHeader
        );
    }

    function addGoogleIconsToProductNames() {
        const tables = document.querySelectorAll('table.table');

        tables.forEach(table => {
            if (!isProductTable(table)) return;

            const headers = table.querySelectorAll('thead th');
            let productNameColIndex = -1;

            headers.forEach((th, index) => {
                if (th.textContent.trim() === 'שם') {
                    productNameColIndex = index;
                }
            });

            if (productNameColIndex === -1) return;

            table.querySelectorAll('tbody tr').forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length <= productNameColIndex) return;

                const nameCell = cells[productNameColIndex];
                if (!nameCell || nameCell.querySelector('.google-image-icon')) return;

                const productName = nameCell.textContent.trim();
                if (!productName) return;

                const link = document.createElement('a');
                link.href = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(productName)}`;
                link.target = '_blank';
                link.title = 'חפש תמונות בגוגל';
                link.className = 'google-image-icon';
                link.style.marginRight = '6px';

                const icon = document.createElement('img');
                icon.src = 'https://www.google.com/favicon.ico';
                icon.style.width = '14px';
                icon.style.height = '14px';
                icon.style.verticalAlign = 'middle';

                link.appendChild(icon);
                nameCell.prepend(link);
            });
        });
    }

    const observer = new MutationObserver(() => addGoogleIconsToProductNames());
    observer.observe(document.body, { childList: true, subtree: true });

    addGoogleIconsToProductNames();
})();


