// ==UserScript==
// @name         Lionwheel - Print Labels - Region Mark PDF
// @namespace    adam.lionwheel.labelsmark
// @version      1.2.0
// @description  Adds a thin vertical region mark (left/center/right) into the label PDF on /print_labels
// @match        https://members.lionwheel.com/tasks/*/print_labels
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const LOG_PREFIX = '[LabelsMark]';

  // ----------------------------
  // CONFIG
  // ----------------------------
  const PDFLIB_URL = 'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js';

  // פס אנכי דק (נקודות PDF). 1pt ~ 0.3528mm. "1-2px" מודפס לרוב נראה טוב סביב 1.0–1.6pt
  const BAR = {
    widthPt: 1.4,         // נסה 1.2 / 1.4 / 1.6 לפי מה שנראה טוב במדפסת שלך
    opacity: 0.35,        // חצי-שקוף כדי שלא יסתיר פרטים (0..1). אם לא עובד לך, שים 1
    topInsetPt: 6.0,      // רווח מהחלק העליון של העמוד
    bottomInsetPt: 6.0,   // רווח מהחלק התחתון של העמוד

    // כמה להרחיק מהשוליים:
    leftInsetPt: 12.0,    // שמאל: רחוק יותר מהשוליים
    rightInsetPt: 12.0,   // ימין: רחוק יותר מהשוליים
  };

  // מיפוי אזורים -> מיקום פס
  // שים לב: השמות חייבים להיות מדויקים (כולל סוגריים)
  const REGION_TO_POS = new Map([
    ['סולו חיפה + טירה', 'right'],
    ['סולו קריות', 'right'],
    ['איזור 2 (א+ג+ה)', 'center'],
    ['איזור 1 (ב+ד+ו)', 'left'],
  ]);

  // לא להתייחס אליו
  const IGNORE_REGION = 'מרלוג צור יגאל (צ\'יטה)';

  // ----------------------------
  // UTILS
  // ----------------------------
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  function log(...args) { console.log(LOG_PREFIX, ...args); }
  function warn(...args) { console.warn(LOG_PREFIX, ...args); }
  function err(...args) { console.error(LOG_PREFIX, ...args); }

  function getTaskIdFromUrl() {
    const m = location.pathname.match(/\/tasks\/(\d+)\/print_labels/);
    return m ? m[1] : null;
  }

  function getCsrfToken() {
    // בריילס/ליוןוויל לרוב יש meta עם CSRF
    const el = document.querySelector('meta[name="csrf-token"]');
    return el?.content || null;
  }

  async function waitForIframe(timeoutMs = 15000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const iframe = document.querySelector('#label iframe');
      const src = iframe?.src || '';
      if (iframe && src.startsWith('blob:')) return iframe;
      await sleep(100);
    }
    return null;
  }

  async function loadPdfLib() {
    if (window.PDFLib?.PDFDocument) return;
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = PDFLIB_URL;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = (e) => reject(e);
      document.head.appendChild(s);
    });
    if (!window.PDFLib?.PDFDocument) {
      throw new Error('PDFLib failed to load (window.PDFLib is undefined)');
    }
    log('PDFLib loaded from', PDFLIB_URL);
  }

  async function fetchPdfBytesFromBlobUrl(blobUrl) {
    const res = await fetch(blobUrl, { credentials: 'include' });
    if (!res.ok) throw new Error(`Failed fetching blob PDF: ${res.status}`);
    return await res.arrayBuffer();
  }

  async function fetchLabelsData(taskId) {
    // חשוב: endpoint הזה אצלך מחזיר 404 HTML אם לא עושים POST + CSRF + body נכון
    const url = 'https://members.lionwheel.com/api/web/tasks/labels_data';
    const csrf = getCsrfToken();

    const body = {
      ids: String(taskId),
      order_by_route: null,
      return_only: null,
      labels_on_page: null,
      print_indexes: null,
      start_position: 0,
      force_return_label: null,
    };

    const headers = {
      'accept': '*/*',
      'content-type': 'application/json',
    };
    if (csrf) headers['x-csrf-token'] = csrf;

    const res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify(body),
    });

    const contentType = res.headers.get('content-type') || '';
    const text = await res.text();

    // אם קיבלנו HTML (למשל 404 page), זה בדיוק השגיאה "Unexpected token '<'"
    if (!contentType.includes('application/json')) {
      throw new Error(`labels_data did not return JSON. status=${res.status}, url=${res.url}, content-type=${contentType}, first200=${text.slice(0, 200)}`);
    }

    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error(`Failed parsing labels_data JSON. first200=${text.slice(0, 200)}`);
    }
  }

  function computeBarX(pageWidthPt, pos) {
    if (pos === 'left') return BAR.leftInsetPt;
    if (pos === 'center') return (pageWidthPt - BAR.widthPt) / 2;
    // right
    return pageWidthPt - BAR.rightInsetPt - BAR.widthPt;
  }

  async function addRegionBarToPdf(pdfBytes, pos) {
    const { PDFDocument, rgb } = window.PDFLib;

    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();

    for (const page of pages) {
      const { width, height } = page.getSize();

      const x = computeBarX(width, pos);
      const y = BAR.bottomInsetPt;
      const h = Math.max(0, height - BAR.topInsetPt - BAR.bottomInsetPt);

      // שחור, אבל שקוף חלקית (אם המדפסת/רנדר לא מכבד opacity, תראה עדיין שחור מלא)
      page.drawRectangle({
        x,
        y,
        width: BAR.widthPt,
        height: h,
        color: rgb(0, 0, 0),
        opacity: BAR.opacity,
        borderWidth: 0,
      });
    }

    return await pdfDoc.save();
  }

  function replaceIframeWithNewPdf(iframe, newPdfBytes) {
    const blob = new Blob([newPdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);

    // מניעת לופים: נסמן שהחלפנו כבר
    iframe.dataset.labelsMarkInjected = '1';

    // החלפה + toolbar
    iframe.src = `${url}#toolbar=1`;

    log('Injected vertical bar into PDF and replaced iframe src.');
  }

  // ----------------------------
  // MAIN
  // ----------------------------
  async function main() {
    const taskId = getTaskIdFromUrl();
    if (!taskId) return;

    const iframe = await waitForIframe();
    if (!iframe) {
      warn('PDF iframe not found or not ready.');
      return;
    }

    // אם כבר הוזרק — לא לעשות שוב
    if (iframe.dataset.labelsMarkInjected === '1') {
      log('Already injected on this iframe. Skipping.');
      return;
    }

    // 1) להביא region מה-API (לא מה-DOM, כי ה-PDF הוא blob ואין לו טקסט ב-body)
    const data = await fetchLabelsData(taskId);
    const task = data?.tasks?.find(t => String(t.task_id) === String(taskId)) || data?.tasks?.[0];
    const destRegion = (task?.dest_region || '').trim();

    log('taskId=', taskId, 'dest_region=', destRegion);

    if (!destRegion || destRegion === IGNORE_REGION) return;

    const pos = REGION_TO_POS.get(destRegion);
    if (!pos) {
      // אזור לא מוכר – לא מסמנים
      log('No mapping for region. Skipping mark.');
      return;
    }

    // 2) לקרוא PDF bytes מה-blob של iframe
    const blobUrl = iframe.src;
    const pdfBytes = await fetchPdfBytesFromBlobUrl(blobUrl);

    // 3) PDFLib + הזרקת הפס
    await loadPdfLib();
    const newPdfBytes = await addRegionBarToPdf(pdfBytes, pos);

    // 4) להחליף את ה-iframe ל-PDF החדש
    replaceIframeWithNewPdf(iframe, newPdfBytes);
  }

  main().catch(e => err('Fatal error:', e));
})();
