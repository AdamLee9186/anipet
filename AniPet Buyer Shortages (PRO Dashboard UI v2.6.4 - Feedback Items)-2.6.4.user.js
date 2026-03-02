// ==UserScript==
// @name         AniPet Buyer Shortages (PRO Dashboard UI v2.6.4 - Feedback Items)
// @namespace    anipet.buyer
// @version      2.6.4
// @description  Added Item Name to Feedback Loop and removed deodorizers from forecast
// @match        https://members.lionwheel.com/operator/store_visits*
// @grant        GM_xmlhttpRequest
// @connect      qgqpjlubdvxfzxjtocrh.supabase.co
// @connect      wsrv.nl
// ==/UserScript==

(() => {
  "use strict";

  const css = `
    #anipet-pro-root *, .ani-modal-overlay * { box-sizing: border-box; }
    #anipet-pro-root { position: fixed; top: 16px; left: 0; right: 0; margin: 0 auto; z-index: 999999; background: #f8fafc; border-radius: 16px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04); width: min(1500px, calc(100vw - 32px)); max-height: calc(100vh - 32px); display: flex; flex-direction: column; font-family: system-ui, -apple-system, sans-serif; overflow: hidden; direction: rtl; border: 1px solid #e2e8f0; }
    #anipet-pro-header { background: linear-gradient(135deg, #0f172a, #1e293b); color: #fff; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; }
    #anipet-pro-body { padding: 16px 20px; overflow-y: auto; flex-grow: 1; position: relative; }
    .ani-view-toggle { display: flex; background: #334155; border-radius: 8px; overflow: hidden; padding: 4px; gap: 4px; }
    .ani-view-btn { background: transparent; border: none; color: #cbd5e1; padding: 6px 12px; font-size: 13px; font-weight: 600; cursor: pointer; border-radius: 6px; transition: 0.2s; }
    .ani-view-btn.active { background: #fff; color: #0f172a; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .ani-view-btn-special { color: #fde047; }
    .ani-view-btn-special.active { background: #fef08a; color: #854d0e; }
    .ani-excel-btn { background: #10b981; color: #fff; border: none; padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: bold; cursor: pointer; transition: 0.2s; display: flex; align-items: center; gap: 8px; }
    .ani-excel-btn:hover { background: #059669; }
    .ani-omni-search-wrapper { position: relative; width: 100%; margin-bottom: 20px; display: flex; align-items: center; }
    .ani-omni-input { width: 100%; padding: 14px 70px 14px 20px; font-size: 16px; border: 2px solid #3b82f6; border-radius: 12px; outline: none; background: #fff; box-shadow: 0 4px 6px rgba(59,130,246,0.1); transition: all 0.2s; color: #0f172a; font-weight: 500; }
    .ani-omni-input:focus { box-shadow: 0 0 0 4px rgba(59,130,246,0.2); }
    .ani-omni-input::placeholder { color: #94a3b8; font-weight: normal; font-size: 14px;}
    .ani-omni-clear-btn { position: absolute; left: 16px; background: none; border: none; font-size: 18px; color: #94a3b8; cursor: pointer; display: none; padding: 4px; border-radius: 50%; transition: 0.2s; }
    .ani-omni-clear-btn:hover { color: #0f172a; background: #f1f5f9; }
    .ani-search-spinner { position: absolute; right: 20px; color: #3b82f6; font-size: 18px; display: none; animation: spin 1s linear infinite; }
    .ani-autocomplete-list { position: absolute; top: 100%; left: 0; right: 0; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; margin-top: 8px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1); z-index: 100; max-height: 400px; overflow-y: auto; list-style: none; padding: 0; display: none; }
    .ani-autocomplete-list li { padding: 12px 16px; border-bottom: 1px solid #f1f5f9; cursor: pointer; font-size: 14px; color: #334155; display: flex; flex-direction: column; gap: 4px; transition: background 0.1s; }
    .ani-autocomplete-list li:hover { background: #eff6ff; color: #0f172a; }
    .ani-autocomplete-section { padding: 8px 16px; font-size: 12px; font-weight: bold; color: #64748b; background: #f8fafc; border-bottom: 1px solid #e2e8f0; user-select: none; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
    .ani-toolbar { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 16px; display: flex; flex-direction: column; gap: 16px; }
    .ani-presets-container { display: flex; flex-wrap: wrap; gap: 8px; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px; align-items: center; }
    .ani-preset-badge { align-items: center; border: 1px solid #3b82f6 !important; border-radius: 6px !important; color: #3b82f6; background: transparent; display: flex; padding: 6px 12px; font-size: 13px; font-weight: 600; cursor: pointer; transition: .15s ease; user-select: none; gap: 6px; box-sizing: border-box; margin-bottom: 2px;}
    .ani-preset-badge.active { background: #3b82f6; color: #fff; box-shadow: 0 2px 4px rgba(59,130,246,0.3); }
    .ani-preset-custom { border-color: #8b5cf6 !important; color: #8b5cf6; }
    .ani-preset-custom.active { background: #8b5cf6; color: #fff; box-shadow: 0 2px 4px rgba(139,92,246,0.3); }
    .ani-preset-save-btn { border: 1px dashed #10b981 !important; color: #10b981; background: #ecfdf5; padding: 6px 12px; border-radius: 6px !important; font-size: 13px; font-weight: 600; cursor: pointer; box-sizing: border-box; margin-bottom: 2px;}
    .ani-preset-save-btn:hover { background: #d1fae5; }
    .ani-controls-row { display: flex; gap: 16px; flex-wrap: wrap; align-items: flex-end; }
    .ani-input-group { display: flex; flex-direction: column; gap: 6px; }
    .ani-label { font-size: 12px; font-weight: 600; color: #64748b; }
    .ani-input, .ani-select { border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 12px; font-size: 13px; color: #334155; background: #f8fafc; outline: none; font-weight: 500; }
    .ani-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 12px; box-shadow: 0 1px 3px 0 rgba(0,0,0,0.05); overflow: hidden; transition: 0.2s; }
    .ani-card-header { padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; }
    .ani-card-body { padding: 0; background: #fafaf9; border-top: 1px solid #f1f5f9; display: none; }
    .ani-card-body.open { display: block; animation: slideDown 0.3s ease-out forwards; }
    .ani-btn { background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 6px 14px; font-size: 13px; font-weight: 600; color: #475569; cursor: pointer; transition: all 0.2s; white-space: nowrap; }
    .ani-btn:hover { background: #f8fafc; border-color: #94a3b8; color: #0f172a; }
    .ani-badge { padding: 4px 10px; border-radius: 6px; font-size: 13px; font-weight: 600; display: inline-flex; align-items: center; border: 1px solid transparent; white-space: nowrap; }
    .badge-gray { background: #f1f5f9; color: #475569; border-color: #e2e8f0; }
    .badge-red { background: #fef2f2; color: #b91c1c; border-color: #fecaca; }
    .badge-darkred { background: #7f1d1d; color: #fecaca; border-color: #450a0a; }
    .badge-orange { background: #fff7ed; color: #c2410c; border-color: #fed7aa; }
    .badge-green { background: #f0fdf4; color: #15803d; border-color: #bbf7d0; }
    .badge-blue { background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; }
    .badge-purple { background: #f3e8ff; color: #7e22ce; border-color: #d8b4fe; }
    .lw-thumb-badge { position: absolute; top: -6px; left: -6px; z-index: 3; min-width: 24px; height: 24px; padding: 0 6px; border-radius: 999px; border: 2px solid #fff; background: #000000a6; color: #fff; display: flex; align-items: center; justify-content: center; font-family: "Noto Sans Hebrew", Arial, sans-serif; font-weight: 700; font-size: 11px; line-height: 1; pointer-events: none; backdrop-filter: saturate(120%) blur(2px); }
    .ani-tooltip-box { position: fixed; background: rgba(15, 23, 42, 0.95); color: #fff; padding: 8px 12px; border-radius: 8px; font-size: 13px; font-weight: 500; pointer-events: none; z-index: 999999999; opacity: 0; transition: opacity 0.2s; box-shadow: 0 4px 6px rgba(0,0,0,0.1); max-width: 250px; text-align: center; direction: rtl; line-height: 1.4; }
    .has-tooltip { cursor: help; display: inline-block; position: relative; border-bottom: 1px dotted rgba(0,0,0,0.2); }
    .ani-modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(15,23,42,0.5); z-index: 9999999; display: flex; align-items: center; justify-content: center; opacity: 0; pointer-events: none; transition: opacity 0.2s; padding: 16px; backdrop-filter: blur(2px); }
    .ani-modal-overlay.open { opacity: 1; pointer-events: auto; }
    .ani-modal { background: #fff; border-radius: 16px; width: 100%; max-width: 1200px; max-height: 85vh; display: flex; flex-direction: column; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); transform: scale(0.95); transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1); margin: auto; }
    .ani-modal-overlay.open .ani-modal { transform: scale(1); }
    .ani-modal-header { padding: 16px 20px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; }
    .ani-modal-body { padding: 16px 20px; overflow-y: auto; overflow-x: hidden; }
    .skeleton { animation: shimmer 1.5s infinite linear; background: linear-gradient(to right, #f1f5f9 4%, #e2e8f0 25%, #f1f5f9 36%); background-size: 800px 100%; height: 16px; border-radius: 4px; width: 100%; }
    .skeleton-card { height: 80px; margin-bottom: 12px; border-radius: 12px; animation: shimmer 1.5s infinite linear; background: linear-gradient(to right, #f8fafc 4%, #f1f5f9 25%, #f8fafc 36%); background-size: 800px 100%; border: 1px solid #e2e8f0;}
    .table-responsive { width: 100%; padding: 0 16px 16px 16px; overflow-x: auto; }
    .ani-table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; border: 1px solid #e2e8f0; margin-top: 16px; min-width: 900px; }
    .ani-table th { background: #f8fafc; padding: 12px 14px; font-size: 12px; color: #64748b; font-weight: 600; text-align: right; border-bottom: 1px solid #e2e8f0; white-space: nowrap; user-select: none; transition: background 0.1s; }
    .ani-table th.sortable:hover { background: #e2e8f0; cursor: pointer; color: #0f172a; }
    .ani-table td { padding: 12px 14px; font-size: 13px; color: #334155; vertical-align: middle; }
    .ani-table tbody tr:nth-child(even) { background-color: #f8fafc; }
    .ani-table tbody tr:hover { background-color: #f1f5f9; }
    .ani-table td { border-bottom: 1px solid #e2e8f0; }
    .score-bullseye { background: #fce7f3; color: #a16207; font-weight: bold; padding: 4px 8px; border-radius: 6px; }
    .score-perfect { background: #dcfce7; color: #15803d; font-weight: bold; padding: 4px 8px; border-radius: 6px; }
    .score-good { background: #eff6ff; color: #1d4ed8; padding: 4px 8px; border-radius: 6px; }
    .score-acceptable { background: #f1f5f9; color: #64748b; padding: 4px 8px; border-radius: 6px; border: 1px solid #e2e8f0; }
  `;
  const styleSheet = document.createElement("style"); styleSheet.innerText = css; document.head.appendChild(styleSheet);

  const SUPABASE_URL = "https://qgqpjlubdvxfzxjtocrh.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFncXBqbHViZHZ4Znp4anRvY3JoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMjc1MTcsImV4cCI6MjA4NDcwMzUxN30.UBsJrTtys9Sf8u2q3Jm3Y2uLrq64NsnHP-D8irDgCLs";

  const I18N = {
    'cat_litter': '✨ מצעים / חול',
    'cat_food': '🐱🥩 מזון יבש לחתול',
    'dog_food': '🐶🥩 מזון יבש לכלב',
    'cat_wet_food': '🐱🥫 מזון לח לחתול',
    'dog_wet_food': '🐶🥫 מזון לח לכלב',
    'wet_cat_food': '🐱🥫 מזון לח לחתול',
    'wet_dog_food': '🐶🥫 מזון לח לכלב',
    'dog_treats': '🐶🦴 חטיפים לכלב',
    'cat_treats': '🐱🦴 חטיפים לחתול',
    'dog_treats_or_wet': '🐶🦴 חטיפים/מעדנים לכלב',
    'cat_treats_or_wet': '🐱🦴 חטיפים/מעדנים לחתול',
    'other': '📦 אחר',
    'כללי': 'כללי'
  };
  function t(key) { return I18N[key] || key; }

  const DOS_MAP = {
      'DANGER': { label: 'נטישה אפשרית 🚨', type: 'darkred', desc: 'המלאי הסתיים מזמן (עבר מעל שבוע), ייתכן שהלקוח קנה במקום אחר' },
      'CRIT': { label: 'באיחור (אזל)', type: 'red', desc: 'המלאי אזל לחלוטין ויש חריגה מתאריך ההזמנה הצפוי' },
      'OUT': { label: 'אזל עכשיו', type: 'red', desc: 'המלאי המשוער הסתיים היום' },
      'LOW': { label: 'לקראת סיום', type: 'orange', desc: 'המלאי צפוי להסתיים ביומיים הקרובים' },
      'WARNING': { label: 'תכף נגמר', type: 'orange', desc: 'המלאי צפוי להסתיים בשבועיים הקרובים, צפי הזמנה מתקרב' },
      'OK': { label: 'תקין (בתחזית)', type: 'green', desc: 'יש מלאי מספיק, אך הלקוח נכנס לטווח התחזית הקרובה' },
      'HIGH': { label: 'עודף מלאי', type: 'blue', desc: 'יש מלאי רב אצל הלקוח כרגע' }
  };
  function fmtDate(d) {
    if (!d) return "";
    const parts = String(d).split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    if (d.includes('T')) return d.split('T')[0].split('-').reverse().join('/');
    return String(d);
  }

  function parseCategoryInfo(catKey) {
      const key = String(catKey).toLowerCase();
      let animal = 'other'; let type = 'other';
      if (key.includes('dog')) animal = 'dog'; else if (key.includes('cat')) animal = 'cat'; else if (key.includes('bird')) animal = 'bird'; else if (key.includes('rodent')) animal = 'rodent';
      if (key.includes('litter') || key.includes('sandy')) type = 'litter'; else if (key.includes('treats')) type = 'treats'; else if (key.includes('wet')) type = 'wet'; else if (key.includes('food')) type = 'dry';
      return { animal, type };
  }

  const PRESETS_HARDCODED = [
    { id: 'buyer_action', label: '🛒 רכש שוטף למלאי (שבועיים קדימה)', grace: 0, window: 14, sort: 'smart', filterStatus: 'all', filterAnimal: 'all', filterType: 'all', filterRel: 'all', filterSupplier: 'all', tooltip: "ברירת המחדל החדשה לקניין: מציג רק מה שצריך להזמין להיום ולשבועיים הקרובים, מסודר לפי מה שהכי דחוף קודם." },
    { id: 'upcoming', label: '🔭 תחזית עתידית (חודש קדימה)', grace: 0, window: 30, sort: 'smart', filterStatus: 'all', filterAnimal: 'all', filterType: 'all', filterRel: 'all', filterSupplier: 'all', tooltip: "מבט רחוק: כל המוצרים שיידרשו בחודש הקרוב." },
    { id: 'vip', label: '💎 לקוחות ברזל', grace: 7, window: 14, sort: 'smart', filterStatus: 'all', filterAnimal: 'all', filterType: 'all', filterRel: 'high', filterSupplier: 'all', tooltip: "הזמנה בטוחה: מציג אך ורק לקוחות בעלי אמינות 'גבוהה' (סטיית צריכה מינימלית)." },
    { id: 'churn', label: '🔥 באיחור / נטישה', grace: 30, window: 0, sort: 'churn', filterStatus: 'DANGER', filterAnimal: 'all', filterType: 'all', filterRel: 'all', filterSupplier: 'all', tooltip: "לקוחות שעברו את תאריך היעד שלהם ועדיין לא קנו." }
  ];

  const state = {
      viewMode: 'products',
      limit: 300, sortBy: 'smart', graceDays: 0, windowDays: 14,
      filterAnimal: 'all', filterType: 'all', filterCustomerStatus: 'all', filterCustomerRel: 'all', filterSupplier: 'all',
      skusData: [], customersData: [], imagesMap: {}, supplierMap: {}, activePreset: 'buyer_action', customPresets: []
  };

  function loadCustomPresets() {
      try { state.customPresets = JSON.parse(localStorage.getItem('ani_custom_presets') || '[]'); } catch(e) { state.customPresets = []; }
  }
  function saveCustomPresets() { localStorage.setItem('ani_custom_presets', JSON.stringify(state.customPresets)); }
  loadCustomPresets();

  function gmFetch(url, { method = "GET", headers = {}, body = null } = {}) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({ method, url, headers, data: body, responseType: "text", onload: (res) => resolve({ ok: res.status >= 200 && res.status < 300, status: res.status, responseText: res.responseText }), onerror: (err) => reject(err) });
    });
  }
  function sbHeaders() { return { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, Accept: "application/json", "Content-Type": "application/json" }; }
  function tryParse(txt) { try { return JSON.parse(txt); } catch { return null; } }

  function getThumbnailUrl(rawUrl) {
      if (!rawUrl) return "https://placehold.co/100x100/f8fafc/cbd5e1?text=📦";
      return `https://wsrv.nl/?url=${encodeURIComponent(rawUrl)}&w=100&h=100&fit=contain&we&output=webp`;
  }

  async function fetchMetaForSkus(skus) {
      state.imagesMap = {}; state.supplierMap = {};
      if (!skus || !skus.length) return;
      const chunkSize = 100;
      for (let i = 0; i < skus.length; i += chunkSize) {
          const chunk = skus.slice(i, i + chunkSize);
          const encodedChunk = encodeURIComponent(chunk.join(','));
          try {
              const [imgRes, supRes] = await Promise.all([
                  gmFetch(`${SUPABASE_URL}/rest/v1/anipet_sku_images_public?sku=in.(${encodedChunk})&select=sku,image_url`, { headers: sbHeaders() }),
                  gmFetch(`${SUPABASE_URL}/rest/v1/anipet_products_catalog_stage?or=(barcode.in.(${encodedChunk}),sku.in.(${encodedChunk}))&select=sku,barcode,supplier`, { headers: sbHeaders() })
              ]);
              if (imgRes.ok) { const data = tryParse(imgRes.responseText); if (data) data.forEach(item => { if (item.image_url) state.imagesMap[item.sku] = item.image_url; }); }
              if (supRes.ok) {
                  const data = tryParse(supRes.responseText);
                  if (data) data.forEach(item => {
                      if (item.supplier) {
                          if (item.sku) state.supplierMap[item.sku] = item.supplier;
                          if (item.barcode) state.supplierMap[item.barcode] = item.supplier;
                      }
                  });
              }
          } catch(e) {}
      }
      populateSuppliersDropdown();
  }

  async function fetchLastSyncTime() {
      try {
          const res = await gmFetch(`${SUPABASE_URL}/rest/v1/lionwheel_export_tasks_raw?select=created_at&order=created_at.desc&limit=1`, { headers: sbHeaders() });
          if(res.ok) {
              const data = tryParse(res.responseText);
              if(data && data.length) {
                  const dtRaw = data[0].created_at;
                  if(dtRaw) {
                      const dt = new Date(dtRaw);
                      const dStr = `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear()} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
                      document.getElementById('ani-sync-time').innerHTML = `הזמנה אחרונה נכנסה ב: <b>${dStr}</b> <i class="fa-solid fa-clock-rotate-left" style="margin-right:4px;"></i>`;
                      return;
                  }
              }
          }
          document.getElementById('ani-sync-time').innerHTML = `לא נמצאו נתוני סנכרון`;
      } catch(e){
          document.getElementById('ani-sync-time').innerHTML = `שגיאה בשליפת זמן`;
      }
  }

  function exportToCsv() {
      let csv = '\uFEFF';
      if (state.viewMode === 'products') {
          csv += 'מוצר,מק"ט/ברקוד,קטגוריה,ספק,תאריך קרוב,רוכשים קבועים,יח להזמנה,משקל להזמנה\n';
          const rows = document.querySelectorAll('.ani-card-header');
          rows.forEach(r => {
              if (r.querySelector('button') && r.querySelector('button').textContent.includes('לקוחות')) {
                  const nameEl = r.querySelector('span[style*="15px"]');
                  if (!nameEl) return;
                  const name = nameEl.textContent.replace(/,/g, '');

                  let sku = ''; let cat = ''; let supplier = ''; let dateTxt = '';
                  let usersTxt = '0'; let unitsTxt = '0'; let kgTxt = '0';

                  const badges = r.querySelectorAll('.ani-badge');
                  badges.forEach(b => {
                      const txt = b.textContent.trim();
                      const html = b.innerHTML;

                      if (b.getAttribute('data-tooltip') === 'מק"ט / ברקוד') sku = txt;
                      else if (html.includes('fa-truck')) supplier = txt;
                      else if (html.includes('fa-users')) usersTxt = txt.replace(/\D/g, '');
                      else if (html.includes('fa-box')) unitsTxt = txt.replace(/[^\d.]/g, '');
                      else if (html.includes('fa-scale-balanced')) kgTxt = txt.replace(/[^\d.]/g, '');
                      else if (!html.includes('<i') && !b.getAttribute('data-tooltip')) {
                          cat = txt.replace(/[^\u0590-\u05FFa-zA-Z0-9\s/]/g, '').trim();
                      }
                  });
                  const dateSpan = Array.from(r.querySelectorAll('span')).find(s => s.textContent.includes('תאריך קרוב:'));
                  if (dateSpan) dateTxt = dateSpan.textContent.replace('• תאריך קרוב:', '').trim();

                  csv += `${name},${sku},${cat},${supplier},${dateTxt},${usersTxt},${unitsTxt},${kgTxt}\n`;
              }
          });
      } else {
          csv += 'שם לקוח,טלפון,עיר,קטגוריה,סטטוס,תאריך יעד,הזמנה משוערת\n';
          alert("ייצוא לקוחות יתווסף בהמשך. כרגע מייצא רק תצוגת מוצרים.");
          return;
      }

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `AniPet_Forecast_${fmtDate(new Date().toISOString().split('T')[0])}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
  }

  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, val] of Object.entries(props)) {
      if (key === 'style' && typeof val === 'object') Object.assign(node.style, val);
      else if (key === 'className') node.className = val;
      else if (key.startsWith('data-')) node.setAttribute(key, val);
      else if (key === 'innerHTML') node.innerHTML = val;
      else node[key] = val;
    }
    for (const c of children) { if (c) node.appendChild(typeof c === "string" ? document.createTextNode(c) : c); }
    return node;
  }
  function badge(text, type = "gray", tooltipTxt = null) {
    const props = { className: `ani-badge badge-${type}` };
    if (tooltipTxt) { props.className += " has-tooltip"; props['data-tooltip'] = tooltipTxt; }
    return el("span", props, [text]);
  }
  function asNode(n) { if (n) n.__isNode = true; return n; }

  const tooltipBox = el("div", { className: "ani-tooltip-box" }); document.body.appendChild(tooltipBox);
  document.addEventListener('mouseover', handleTooltip); document.addEventListener('touchstart', handleTooltip, { passive: true });
  function handleTooltip(e) {
    const target = e.target.closest('[data-tooltip]');
    if (target) {
      tooltipBox.innerHTML = target.getAttribute('data-tooltip');
      const rect = target.getBoundingClientRect(); tooltipBox.style.opacity = "1";
      let top = rect.bottom + 8; let left = rect.left + (rect.width / 2) - (tooltipBox.offsetWidth / 2);
      if (left < 10) left = 10; tooltipBox.style.top = `${top}px`; tooltipBox.style.left = `${left}px`;
    } else { tooltipBox.style.opacity = "0"; tooltipBox.style.top = "-9999px"; }
  }

  const modalOverlay = el("div", { className: "ani-modal-overlay" });
  const modalBox = el("div", { className: "ani-modal" });
  const modalHeader = el("div", { className: "ani-modal-header" });
  const modalTitle = el("div", { style: { fontWeight: "700", fontSize: "16px", color: "#0f172a" } });
  const modalClose = el("button", { textContent: "✕", style: { background: "transparent", border: "none", fontSize: "20px", color: "#64748b", cursor: "pointer" }, onclick: closeModal });
  const modalBody = el("div", { className: "ani-modal-body" });
  modalHeader.appendChild(modalTitle); modalHeader.appendChild(modalClose); modalBox.appendChild(modalHeader); modalBox.appendChild(modalBody);
  modalOverlay.appendChild(modalBox); document.body.appendChild(modalOverlay);
  modalOverlay.addEventListener('click', (e) => { if(e.target === modalOverlay) closeModal(); });
  function openModal(title, contentNode) { modalTitle.textContent = title; modalBody.innerHTML = ""; modalBody.appendChild(contentNode); modalOverlay.classList.add('open'); }
  function closeModal() { modalOverlay.classList.remove('open'); }

  function table(headers, rows) {
    const headerTexts = headers.map(h => {
      let str = typeof h === "string" ? h : (h.textContent || "");
      let tmp = document.createElement("DIV"); tmp.innerHTML = str;
      return tmp.textContent.replace('❓', '').replace('⏱️', '').replace('↕️', '').trim();
    });
    const thead = el("thead", {}, [ el("tr", {}, headers.map((h, colIndex) => {
      const thInner = el("span", { innerHTML: (typeof h === 'string' ? h : h.innerHTML || h.textContent) + ' <i style="font-size:10px; color:#cbd5e1;" class="fa-solid fa-sort"></i>' });
      const th = el("th", { className: "sortable" }, [thInner]); th.dataset.sort = 'asc';
      th.onclick = () => {
          const tbody = th.closest('table').querySelector('tbody'); const trs = Array.from(tbody.querySelectorAll('tr'));
          const isAsc = th.dataset.sort === 'asc';
          th.dataset.sort = isAsc ? 'desc' : 'asc';
          trs.sort((a, b) => {
              let valA = a.children[colIndex].textContent.trim(); let valB = b.children[colIndex].textContent.trim();
              let numA = parseFloat(valA.replace(/[^\d.-]/g, '')); let numB = parseFloat(valB.replace(/[^\d.-]/g, ''));
              if (valA.includes('/')) {
                  const pA = valA.split('/'); const pB = valB.split('/');
                  if(pA.length===3 && pB.length===3) { numA = new Date(`${pA[2]}-${pA[1]}-${pA[0]}`).getTime(); numB = new Date(`${pB[2]}-${pB[1]}-${pB[0]}`).getTime(); }
              }
              if (!isNaN(numA) && !isNaN(numB)) return isAsc ? numA - numB : numB - numA;
              return isAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
          });
          trs.forEach(tr => tbody.appendChild(tr));
      };
      return th;
    })) ]);
    const tbody = el("tbody", {}, rows.map(r => el("tr", {}, r.map((cell, index) => {
      const valNode = (cell && cell.__isNode) ? cell : el("span", { className: "ani-val" }, [String(cell ?? "")]);
      const td = el("td", {}, [valNode]);
      if (headerTexts[index]) td.setAttribute('data-label', headerTexts[index]); return td;
    }))));
    return el("table", { className: "ani-table" }, [thead, tbody]);
  }

  const rootDiv = el("div", { id: "anipet-pro-root", style: { display: "none" } });
  const headerDiv = el("div", { id: "anipet-pro-header" }, [
    el("div", { style: { display: "flex", alignItems: "center", gap: "12px" } }, [
      el("div", { textContent: "📦", style: { fontSize: "24px" } }),
      el("div", {}, [
        el("div", { textContent: "AniPet PRO · ניהול רכש ותחזיות", style: { fontSize: "16px", fontWeight: "700" } }),
        el("div", { textContent: "מערכת חכמה כולל חיפוש מתקדם, סינונים ותדירויות", style: { fontSize: "12px", color: "#94a3b8" } })
      ])
    ]),
    el("div", { style: { display: "flex", alignItems: "center", gap: "16px" } }, [
      el("div", { className: "ani-view-toggle" }, [
          el("button", { className: "ani-view-btn active", id: "view-btn-products", innerHTML: '<i class="fa-solid fa-box"></i> תצוגת מוצרים', onclick: () => switchView('products') }),
          el("button", { className: "ani-view-btn", id: "view-btn-customers", innerHTML: '<i class="fa-solid fa-users"></i> תצוגת לקוחות', onclick: () => switchView('customers') }),
          el("button", { className: "ani-view-btn ani-view-btn-special has-tooltip", 'data-tooltip': 'ראה תחזיות עבר שהתגשמו בפועל', id: "view-btn-feedback", innerHTML: '<i class="fa-solid fa-bullseye"></i> לוח הצלחות', onclick: () => switchView('feedback') })
      ]),
      el("button", { className: "ani-excel-btn", innerHTML: '<i class="fa-solid fa-file-excel" style="color: #fff;"></i> ייצוא ל-Excel', onclick: exportToCsv }),
      el("button", { textContent: "✕", style: { background: "transparent", border: "none", color: "#94a3b8", fontSize: "20px", cursor: "pointer", marginLeft:"10px" }, onclick: () => rootDiv.style.display = "none" })
    ])
  ]);
  const bodyContent = el("div", { id: "anipet-pro-body" });
  const toolbar = el("div", { className: "ani-toolbar" });
  function switchView(mode, preventLoad = false) {
      state.viewMode = mode;
      document.getElementById('view-btn-products').classList.toggle('active', mode === 'products');
      document.getElementById('view-btn-customers').classList.toggle('active', mode === 'customers');
      document.getElementById('view-btn-feedback').classList.toggle('active', mode === 'feedback');

      if (mode === 'feedback') {
          toolbar.style.display = 'none';
          if (!preventLoad) loadFeedbackDataAndRender();
      } else {
          toolbar.style.display = 'flex';
          selSupplier.parentElement.style.display = mode === 'customers' ? 'none' : 'flex';
          if (!preventLoad) {
              if (mode === 'products') loadDataAndRender();
              else loadCustomerDataAndRender();
          }
      }
  }

  const omniWrapper = el("div", { className: "ani-omni-search-wrapper" });
  const omniInput = el("input", { className: "ani-omni-input", placeholder: "🔍 חיפוש-על: שם פריט, ברקוד, טלפון, שם לקוח, כתובת" });
  const omniSpinner = el("i", { className: "fa-solid fa-circle-notch ani-search-spinner" });
  const omniClearBtn = el("button", { className: "ani-omni-clear-btn", innerHTML: '<i class="fa-solid fa-xmark"></i>', title: "נקה חיפוש" });
  const omniList = el("ul", { className: "ani-autocomplete-list" });

  omniWrapper.appendChild(omniInput); omniWrapper.appendChild(omniSpinner); omniWrapper.appendChild(omniClearBtn); omniWrapper.appendChild(omniList);

  omniClearBtn.onclick = () => { omniInput.value = "";
      omniClearBtn.style.display = "none"; omniList.style.display = "none"; switchView(state.viewMode); };

  let searchTimeout;
  omniInput.oninput = (e) => {
      clearTimeout(searchTimeout);
      const val = e.target.value.trim();
      omniClearBtn.style.display = val.length > 0 ? "block" : "none";
      if (val.length < 3) { omniList.style.display = "none"; return; }

      omniList.innerHTML = '<li style="text-align:center; padding:16px; color:#3b82f6;"><i class="fa-solid fa-circle-notch fa-spin"></i> מחפש נתונים...</li>';
      omniList.style.display = "block";
      searchTimeout = setTimeout(() => {
          let terms = val.split(' ').filter(x => x);
          let nameAndQuery = terms.map(t => `name.ilike.*${t}*`).join(',');

          const catalogUrl = `${SUPABASE_URL}/rest/v1/product_catalog_enriched?select=sku,barcode,name,category_name&or=(sku.eq.${terms[0]},barcode.eq.${terms[0]},and(${nameAndQuery}))&limit=10`;
          const customerUrl = `${SUPABASE_URL}/rest/v1/rpc/search_customers_omni`;

          Promise.all([
              gmFetch(catalogUrl, { headers: sbHeaders() }).catch(()=>null),
              gmFetch(customerUrl, { method: "POST", headers: sbHeaders(), body: JSON.stringify({ p_query: val }) }).catch(()=>null)
          ]).then(async responses => {
              omniList.innerHTML = "";
              const [catRes, custRes] = responses;
              let catData = catRes && catRes.ok ? tryParse(catRes.responseText) || [] : [];
              let custPhonesRaw = custRes && custRes.ok ? tryParse(custRes.responseText) || [] : [];

              let uniquePhones = new Set();
              let dedupedCusts = custPhonesRaw.filter(c => {
                  if(uniquePhones.has(c.phone)) return false;
                  uniquePhones.add(c.phone);
                  return true;
              });

              let hasResults = false;

              if (catData.length > 0) {
                  hasResults = true;
                  omniList.appendChild(el("div", { className: "ani-autocomplete-section", textContent: "📦 מוצרים (היסטוריית לקוחות מלאה)" }));
                  catData.forEach(item => {
                      let li = el("li", { innerHTML: `<div style="font-size:14px; font-weight:bold; color:#0f172a;">${item.name || 'מוצר ללא שם'}</div><div style="font-size:12px; color:#64748b;">מק"ט/ברקוד: ${item.barcode || item.sku}</div>` });
                      li.onclick = () => { omniInput.value = item.name || item.sku; omniList.style.display = "none"; searchProductBySku(item.sku, item.name, item.category_name); };
                      omniList.appendChild(li);
                  });
              }

              if (dedupedCusts.length > 0) {
                  hasResults = true;
                  omniList.appendChild(el("div", { className: "ani-autocomplete-section", textContent: "👤 לקוחות (פרופיל אישי וצריכה)" }));
                  const phonesArr = dedupedCusts.map(c => c.phone);
                  const namesRes = await gmFetch(`${SUPABASE_URL}/rest/v1/rpc/buyer_sku_shortages_raw_names`, { method: "POST", headers: sbHeaders(), body: JSON.stringify({ p_phones: phonesArr }) });
                  let namesMap = {};
                  if (namesRes.ok) {
                      const nd = tryParse(namesRes.responseText) || [];
                      nd.forEach(n => namesMap[n.p9] = [n.c_city, n.c_address].filter(Boolean).join(" - "));
                  }
                  dedupedCusts.forEach(c => {
                      let dispPhone = c.phone.startsWith('0') ? c.phone : '0' + c.phone;
                      let addr = namesMap[c.phone] || '';
                      let li = el("li", { innerHTML: `<div style="font-size:14px; font-weight:bold; color:#0f172a;">${c.name} <span style="color:#64748b; font-weight:normal;">(${dispPhone})</span></div>${addr ? `<div style="font-size:12px; color:#64748b;">📍 ${addr}</div>` : ''}` });
                      li.onclick = () => { omniInput.value = c.name; omniList.style.display = "none"; searchCustomerByPhone(c.phone); };
                      omniList.appendChild(li);
                  });
              }

              if (!hasResults) omniList.appendChild(el("li", { textContent: "לא נמצאו תוצאות.", style: { color: "#94a3b8", cursor: "default", textAlign:"center" } }));
          });
      }, 500);
  };
  document.addEventListener('click', (e) => { if (!omniWrapper.contains(e.target)) omniList.style.display = "none"; });
  const presetsRow = el("div", { className: "ani-presets-container" });
  const controlsRow1 = el("div", { className: "ani-controls-row", style: { paddingBottom: "12px", borderBottom: "1px solid #f1f5f9" } });
  const controlsRow2 = el("div", { className: "ani-controls-row" });

  const inGrace = el("input", { type: "number", className: "ani-input", style: { width: "70px" }, value: state.graceDays, min: 0 });
  const inWindow = el("input", { type: "number", className: "ani-input", style: { width: "70px" }, value: state.windowDays, min: 0 });
  const selAnimal = el("select", { className: "ani-select", style: { width: "120px" } });
  [{v:'all', l:'🐾 כל החיות'}, {v:'dog', l:'🐶 כלבים'}, {v:'cat', l:'🐱 חתולים'}, {v:'rodent', l:'🐹 מכרסמים'}, {v:'bird', l:'🦜 ציפורים'}, {v:'other', l:'אחר'}].forEach(o => selAnimal.appendChild(el("option", { value: o.v, textContent: o.l, selected: state.filterAnimal === o.v })));
  const selType = el("select", { className: "ani-select", style: { width: "130px" } });
  [{v:'all', l:'🛍️ כל סוגי המוצרים'}, {v:'dry', l:'🥩 מזון יבש'}, {v:'wet', l:'🥫 מזון לח'}, {v:'treats', l:'🦴 חטיפים'}, {v:'litter', l:'✨ מצעים / חול'}, {v:'other', l:'אחר'}].forEach(o => selType.appendChild(el("option", { value: o.v, textContent: o.l, selected: state.filterType === o.v })));
  const selStatus = el("select", { className: "ani-select", style: { width: "140px" } });
  [{v:'all', l:'📊 כל הסטטוסים'}, {v:'DANGER', l:'🚨 נטישה אפשרית'}, {v:'CRIT', l:'🔴 אזל (באיחור)'}, {v:'OUT', l:'⭕ אזל עכשיו'}, {v:'LOW', l:'🟠 לקראת סיום'}, {v:'WARNING', l:'🟡 תכף נגמר'}, {v:'OK', l:'🟢 תקין'}, {v:'HIGH', l:'🔵 עודף'}].forEach(o => selStatus.appendChild(el("option", { value: o.v, textContent: o.l, selected: state.filterCustomerStatus === o.v })));
  const selRel = el("select", { className: "ani-select", style: { width: "130px" } });
  [{v:'all', l:'🎯 כל האמינויות'}, {v:'high', l:'🎯 אמינות גבוהה'}, {v:'medium', l:'🟡 בינונית'}, {v:'low', l:'🎲 נמוכה'}].forEach(o => selRel.appendChild(el("option", { value: o.v, textContent: o.l, selected: state.filterCustomerRel === o.v })));
  const selSupplier = el("select", { className: "ani-select", style: { width: "140px" } });
  function populateSuppliersDropdown() {
      selSupplier.innerHTML = "";
      selSupplier.appendChild(el("option", { value: 'all', textContent: '🚚 כל הספקים' }));
      const uniqueSups = [...new Set(Object.values(state.supplierMap))].filter(Boolean).sort();
      uniqueSups.forEach(sup => selSupplier.appendChild(el("option", { value: sup, textContent: sup, selected: state.filterSupplier === sup })));
  }
  populateSuppliersDropdown();

  const selSort = el("select", { className: "ani-select", style: { width: "180px" } });
  [ {v:'smart', l:'מיון: דחוף ביותר למעלה'}, {v:'churn', l:'מיון: סכנת נטישה'}, {v:'upcoming', l:'מיון: קרוב להיום'}, {v:'volume_qty', l:'מיון: כמות מוצרים (יח)'}, {v:'volume', l:'מיון: כמות לקוחות'} ].forEach(o => selSort.appendChild(el("option", { value: o.v, textContent: o.l, selected: state.sortBy === o.v })));

  inGrace.onchange = () => { state.graceDays = parseInt(inGrace.value)||0; clearActivePreset(); triggerRender(); };
  inWindow.onchange = () => { state.windowDays = parseInt(inWindow.value)||0; clearActivePreset(); triggerRender(); };
  selAnimal.onchange = () => { state.filterAnimal = selAnimal.value; clearActivePreset(); renderCurrentView(); };
  selType.onchange = () => { state.filterType = selType.value; clearActivePreset(); renderCurrentView(); };
  selStatus.onchange = () => { state.filterCustomerStatus = selStatus.value; clearActivePreset(); renderCurrentView(); };
  selRel.onchange = () => { state.filterCustomerRel = selRel.value; clearActivePreset(); renderCurrentView(); };
  selSupplier.onchange = () => { state.filterSupplier = selSupplier.value; clearActivePreset(); renderCurrentView(); };
  selSort.onchange = () => { state.sortBy = selSort.value; clearActivePreset(); renderCurrentView(); };

  function triggerRender() {
      if(state.viewMode === 'products') loadDataAndRender();
      else loadCustomerDataAndRender();
  }
  function renderCurrentView() {
      if(state.viewMode === 'products') renderMainList();
      else renderCustomerList();
  }

  function clearActivePreset() { state.activePreset = null; renderPresetsUI(); }
  function applyPreset(p) {
      state.activePreset = p.id;
      state.graceDays = p.grace; state.windowDays = p.window; state.sortBy = p.sort;
      state.filterStatus = p.filterStatus || 'all'; state.filterAnimal = p.filterAnimal || 'all';
      state.filterType = p.filterType || 'all'; state.filterRel = p.filterRel || 'all'; state.filterSupplier = p.filterSupplier || 'all';

      inGrace.value = p.grace;
      inWindow.value = p.window; selSort.value = p.sort;
      selStatus.value = state.filterStatus; selAnimal.value = state.filterAnimal;
      selType.value = state.filterType; selRel.value = state.filterRel;
      selSupplier.value = state.filterSupplier;

      renderPresetsUI(); triggerRender();
  }

  function renderPresetsUI() {
      presetsRow.innerHTML = "";
      PRESETS_HARDCODED.forEach(p => {
          const btn = el("div", { className: `ani-preset-badge ${state.activePreset === p.id ? 'active' : ''} has-tooltip`, 'data-tooltip': p.tooltip, innerHTML: p.label, onclick: () => applyPreset(p) });
          presetsRow.appendChild(btn);
      });
      state.customPresets.forEach(p => {
          const btn = el("div", { className: `ani-preset-badge ani-preset-custom ${state.activePreset === p.id ? 'active' : ''}` });
          const textSpan = el("span", { textContent: p.label, onclick: () => applyPreset(p) });
          const delBtn = el("i", { className: "fa-light fa-trash-can", style: { color: "#ef4444", marginLeft: "4px" }, onclick: (e) => { e.stopPropagation(); state.customPresets = state.customPresets.filter(x => x.id !== p.id); saveCustomPresets(); renderPresetsUI(); } });
          btn.appendChild(textSpan); btn.appendChild(delBtn);
          presetsRow.appendChild(btn);
      });
      const saveBtn = el("div", { className: "ani-preset-save-btn", innerHTML: '<i class="fa-solid fa-plus"></i> שמור סינון נוכחי', onclick: () => {
          const name = prompt("הכנס שם לסינון השמור:");
          if (!name) return;
          const newPreset = { id: 'custom_' + Date.now(), label: name, grace: state.graceDays, window: state.windowDays, sort: state.sortBy, filterStatus: state.filterCustomerStatus, filterAnimal: state.filterAnimal, filterType: state.filterType, filterRel: state.filterCustomerRel, filterSupplier: state.filterSupplier };
          state.customPresets.push(newPreset); saveCustomPresets(); state.activePreset = newPreset.id; renderPresetsUI();
      }});
      presetsRow.appendChild(saveBtn);
  }
  renderPresetsUI();

  toolbar.appendChild(omniWrapper);
  controlsRow1.appendChild(el("div", { className: "ani-input-group" }, [ el("label", { className: "ani-label", textContent: "סוג חיה" }), selAnimal ]));
  controlsRow1.appendChild(el("div", { className: "ani-input-group" }, [ el("label", { className: "ani-label", textContent: "סוג מוצר" }), selType ]));
  controlsRow1.appendChild(el("div", { className: "ani-input-group" }, [ el("label", { className: "ani-label", textContent: "סטטוס לקוח" }), selStatus ]));
  controlsRow1.appendChild(el("div", { className: "ani-input-group" }, [ el("label", { className: "ani-label", textContent: "רמת אמינות" }), selRel ]));
  controlsRow1.appendChild(el("div", { className: "ani-input-group" }, [ el("label", { className: "ani-label", textContent: "ספק מוצר" }), selSupplier ]));
  controlsRow2.appendChild(el("div", { className: "ani-input-group" }, [ el("label", { className: "ani-label", textContent: "אחורה (איחור)" }), inGrace ]));
  controlsRow2.appendChild(el("div", { className: "ani-input-group" }, [ el("label", { className: "ani-label", textContent: "קדימה (תחזית)" }), inWindow ]));
  controlsRow2.appendChild(el("div", { className: "ani-input-group" }, [ el("label", { className: "ani-label", textContent: "סדר תצוגה" }), selSort ]));

  toolbar.appendChild(presetsRow); toolbar.appendChild(controlsRow1); toolbar.appendChild(controlsRow2);
  const statusLine = el("div", { style: { display: "flex", alignItems: "center", gap: "10px", padding: "0 4px 16px 4px", fontSize: "13px", color: "#64748b", fontWeight: "500", justifyContent: "space-between" } });
  const statusLeft = el("div", { style: { display: "flex", alignItems: "center", gap: "10px" } });
  const statusRight = el("div", { id: "ani-sync-time", innerHTML: `שולף זמן סנכרון אחרון...` });
  statusLine.appendChild(statusLeft); statusLine.appendChild(statusRight);
  fetchLastSyncTime();
  const mainList = el("div", { style: { display: "flex", flexDirection: "column" } });
  bodyContent.appendChild(toolbar); bodyContent.appendChild(statusLine); bodyContent.appendChild(mainList);
  rootDiv.appendChild(headerDiv); rootDiv.appendChild(bodyContent);
  document.documentElement.appendChild(rootDiv);

  function setStatus(text, isError = false) {
    statusLeft.innerHTML = "";
    statusLeft.appendChild(badge(isError ? "שגיאה" : "סטטוס", isError ? "red" : "blue"));
    statusLeft.appendChild(el("span", { textContent: text }));
  }

  function createSkeletonTable() {
    const wrapper = el("div", { className: "table-responsive ani-skeleton-wrapper" });
    const tbl = el("table", { className: "ani-table" });
    const tbody = el("tbody");
    for(let i=0; i<3; i++) {
        const tr = el("tr");
        for(let j=0; j<6; j++) tr.appendChild(el("td", { 'data-label': 'טוען...' }, [el("div", { className: "skeleton" })]));
        tbody.appendChild(tr);
    }
    tbl.appendChild(tbody);
    wrapper.appendChild(tbl);
    return wrapper;
  }

  function showMainSkeleton() {
      mainList.innerHTML = "";
      for(let i=0; i<4; i++) mainList.appendChild(el("div", { className: "skeleton-card" }));
  }

  const custTableHeaders = [
      '<span class="has-tooltip" data-tooltip="מספר הטלפון של הלקוח">טלפון</span>',
      '<span class="has-tooltip" data-tooltip="שם הלקוח המלא">שם לקוח</span>',
      '<span class="has-tooltip" data-tooltip="הכתובת המעודכנת למשלוח">כתובת למשלוח</span>',
      '<span class="has-tooltip" data-tooltip="שיוך קטגוריאלי לחישוב קצב הצריכה">קטגוריה</span>',
      '<span class="has-tooltip" data-tooltip="תאריך הרכישה האחרונה של מוצר מהקטגוריה">הזמנה אחרונה</span>',
      '<span class="has-tooltip" data-tooltip="ממוצע ימים בין קניות ברמת הלקוח (מחושב מ-2 רכישות ומעלה)">תדירות ⏱️</span>',
      '<span class="has-tooltip" data-tooltip="השוואת כמות הרכישה האחרונה לממוצע ההיסטורי של הלקוח">מגמת כמות</span>',
      '<span class="has-tooltip" data-tooltip="רמת העקביות של הלקוח (דורש לפחות 3 רכישות לקביעת סטייה)">אמינות ❓</span>',
      '<span class="has-tooltip" data-tooltip="הסטטוס הנוכחי של המלאי אצל הלקוח בהתבסס על צפי הסיום">מלאי בבית</span>',
      '<span class="has-tooltip" data-tooltip="התאריך המשוער בו המוצר יסתיים לחלוטין וידרש חידוש">צפי סיום</span>',
      '<span class="has-tooltip" data-tooltip="הכמות (יח׳ ומשקל) שהלקוח צפוי להזמין במועד הקרוב">צפי כמות</span>',
      '<span class="has-tooltip" data-tooltip="כמות הפעמים שהלקוח רכש פריטים מהקטגוריה בחצי שנה האחרונה">הזמנות</span>'
  ];
  const histTableHeaders = [
      '<span class="has-tooltip" data-tooltip="תאריך ביצוע ההזמנה">תאריך</span>',
      '<span class="has-tooltip" data-tooltip="שם הפריט שנרכש כפי שמופיע בקטלוג">פריט</span>',
      '<span class="has-tooltip" data-tooltip="הקטגוריה אליה הפריט שויך במערכת הנרמול">קטגוריה</span>',
      '<span class="has-tooltip" data-tooltip="כמות היחידות שנרכשה בפועל מהפריט">יחידות</span>',
      '<span class="has-tooltip" data-tooltip="משקל היחידה הבודדת לפיו מחושבת הצריכה בגרמים או ק״ג">משקל פריט</span>'
  ];
  async function fetchHistoryDirect(p9, categoryKey, cName, infoBtn) {
      if (infoBtn.innerHTML.includes('fa-spinner')) return;
      infoBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="color:#64748b"></i>';
      try {
          const url = `${SUPABASE_URL}/rest/v1/mv_orders_items_norm?customer_key=ilike.*${p9}*&consumption_category=eq.${categoryKey}&order=order_date.desc&limit=15`;
          const dataRes = await gmFetch(url, { headers: sbHeaders() });
          if (!dataRes.ok) { alert("שגיאת שרת (קוד " + dataRes.status + "): " + dataRes.responseText); return; }
          const histData = tryParse(dataRes.responseText);
          if (!histData || !histData.length) { alert("לא נמצאו פריטים קודמים בקטגוריה זו. (ייתכן שההיסטוריה טרם התרעננה בשרת)"); return; }

          const histRows = histData.map(d => {
              let qty = d.qty || d.qty_raw || 1;
              let weightStr = '-';
              if (d.pack_value) {
                  let pv = parseFloat(d.pack_value);
                  if (pv < 1 && pv > 0) { weightStr = Math.round(pv * 1000) + ' גרם'; }
                  else { weightStr = Number(pv).toFixed(2).replace(/\.?0+$/, '') + ' ק"ג'; }
              }
              let catNameStr = d.consumption_category ? t(d.consumption_category) : (d.category_name || 'כללי');
              return [fmtDate(d.order_date || d.o_date), d.item_name || 'מוצר ללא שם', catNameStr, qty, weightStr];
          });
          openModal(`👁️ היסטוריית רכישות פריטים - ${cName || t(categoryKey)}`, el("div", {className: "table-responsive", style:{padding:0}}, [table(histTableHeaders, histRows)]));
      } catch(err) {
          alert("שגיאה בתקשורת מול השרת: " + err);
      } finally {
          infoBtn.innerHTML = '👁️';
      }
  }

  // ============== FEEDBACK LOOP VIEW ==============
  async function loadFeedbackDataAndRender() {
      showMainSkeleton();
      setStatus(`בודק את הדיוק של התחזיות שלנו מול ההזמנות שנכנסו לאחרונה...`);
      try {
          const url = `${SUPABASE_URL}/rest/v1/rpc/buyer_predictions_feedback_loop`;
          const res = await gmFetch(url, { method: "POST", headers: sbHeaders(), body: JSON.stringify({ p_days_back: 3 }) });
          if(!res.ok) throw new Error();
          const feedbackData = tryParse(res.responseText) || [];

          if(feedbackData.length === 0) {
              mainList.innerHTML = "";
              mainList.appendChild(el("div", { textContent: "לא נמצאו תחזיות שהתגשמו ב-3 ימים האחרונים. חזור מחר!", style: { textAlign: "center", padding: "40px", color: "#94a3b8" } }));
              return;
          }

          const phonesArr = [...new Set(feedbackData.map(c => c.customer_phone))];
          let namesMap = {};
          if (phonesArr.length > 0) {
              const namesRes = await gmFetch(`${SUPABASE_URL}/rest/v1/rpc/buyer_sku_shortages_raw_names`, { method: "POST", headers: sbHeaders(), body: JSON.stringify({ p_phones: phonesArr }) });
              if(namesRes.ok) {
                  const nd = tryParse(namesRes.responseText) || [];
                  nd.forEach(n => namesMap[n.p9] = n.c_name);
              }
          }

          renderFeedbackList(feedbackData, namesMap);
      } catch(e) { setStatus("שגיאה בשליפת נתוני בקרה.", true); }
  }

  function renderFeedbackList(data, namesMap) {
      mainList.innerHTML = "";
      setStatus(`מציג ${data.length} לקוחות שהתנהגו בדיוק לפי המודל שלנו! 🎯`);

      // הוספנו כאן את עמודת "מוצר" בלוח ההצלחות!
      const headers = [
          "לקוח", "מוצר", "קטגוריה", "תאריך בפועל", "תאריך חזוי", "סטיית ימים", "כמות בפועל", "כמות חזויה", "דיוק 🎯"
      ];

      const rows = data.map(row => {
          let name = namesMap[row.customer_phone] || row.customer_phone;
          let diffColor = row.days_off > 0 ? "red" : "green";
          let diffText = row.days_off === 0 ? "ביום המדויק!" : (row.days_off > 0 ? `איחר ב-${row.days_off} ימים` : `הקדים ב-${Math.abs(row.days_off)} ימים`);

          let scoreNode;
          if (row.accuracy_score === 'BULLSEYE') scoreNode = el("span", { className: "score-bullseye has-tooltip", "data-tooltip": "פגענו בדיוק בתאריך (עד 3 ימים) ובכמות!"}, ["🎯 פגיעה מושלמת"]);
          else if (row.accuracy_score === 'DATE_PERFECT') scoreNode = el("span", { className: "score-perfect has-tooltip", "data-tooltip": "הזמין בדיוק מתי שחשבנו (עד 3 ימים)"}, ["✅ תאריך מושלם"]);
          else if (row.accuracy_score === 'GOOD') scoreNode = el("span", { className: "score-good has-tooltip", "data-tooltip": "סטייה קלה (עד שבוע)"}, ["👍 טווח ביטחון"]);
          else scoreNode = el("span", { className: "score-acceptable has-tooltip", "data-tooltip": "סטייה בינונית (8-14 ימים - ייתכן מלאי חיצוני)"}, ["⚠️ רחוק מהתחזית"]);

          return [
              name,
              asNode(el("span", { style: { fontWeight: "600", color: "#1e293b", fontSize: "12px" } }, [row.item_name || 'מוצר לא ידוע'])),
              asNode(badge(t(row.category_key), "gray")),
              fmtDate(row.actual_order_date),
              fmtDate(row.predicted_date),
              asNode(el("span", { style: { color: diffColor, fontWeight: "500" } }, [diffText])),
              `${row.actual_qty} יח'`,
              `${row.predicted_qty} יח'`,
              asNode(scoreNode)
          ];
      });
      const wrapper = el("div", { className: "ani-card", style: { padding: "16px" } });
      const tblContainer = el("div", { className: "table-responsive", style: { padding: 0 } });
      tblContainer.appendChild(table(headers, rows));
      wrapper.appendChild(tblContainer);
      mainList.appendChild(wrapper);
  }

  // ================================================

  async function searchProductBySku(sku, name, catName) {
      switchView('products', true);
      showMainSkeleton();
      setStatus(`מציג תוצאות חיפוש-על עבור מוצר: ${name || 'מוצר ללא שם'}`);
      const card = buildSkuCard({ recommend_sku: sku, product_name: name, category_key: catName || 'כללי', total_customers: '?', total_expected_qty: '?' }, true);
      mainList.innerHTML = ""; mainList.appendChild(card);
      const cBody = card.querySelector('.ani-card-body');
      const btnToggle = card.querySelector('.ani-btn');
      cBody.classList.add('open'); btnToggle.textContent = "סגור רשימה";
      cBody.appendChild(createSkeletonTable());
      await fetchAndRenderCustomers(sku, cBody, 365, 365);
  }

  async function searchCustomerByPhone(p9) {
      switchView('customers', true);
      showMainSkeleton();
      setStatus(`שולף פרופיל אישי מלא עבור 0${p9}...`);

      const namesRes = await gmFetch(`${SUPABASE_URL}/rest/v1/rpc/buyer_sku_shortages_raw_names`, { method: "POST", headers: sbHeaders(), body: JSON.stringify({ p_phones: [p9] }) });
      let cName = "לקוח לא ידוע", cAddr = "";
      if (namesRes.ok) {
          const nd = tryParse(namesRes.responseText);
          if (nd && nd.length) { cName = nd[0].c_name; cAddr = [nd[0].c_city, nd[0].c_address].filter(Boolean).join(" - "); }
      }

      const url = `${SUPABASE_URL}/rest/v1/mv_forecast_engine_v3?customer_phone=eq.${p9}`;
      gmFetch(url, { headers: sbHeaders() }).then(async res => {
          if(!res.ok) { setStatus("שגיאה בשליפת לקוח", true); return; }
          const data = tryParse(res.responseText);
          mainList.innerHTML = "";
          if(!data || !data.length) { mainList.appendChild(el("div", { textContent: "לא נמצאו נתוני תחזית אקטיביים עבור לקוח זה.", style: { padding: "40px", textAlign: "center", color: "#94a3b8" } })); return; }

          setStatus(`מציג פרופיל מלא עבור: ${cName}`);
          mainList.appendChild(buildCustomerCard(p9, cName, cAddr, data, true));
      });
  }

  async function loadCustomerDataAndRender() {
      showMainSkeleton();
      setStatus(`טוען נתוני לקוחות... חלון זמן ${state.graceDays} אחורה עד ${state.windowDays} קדימה`);
      try {
          let graceDate = new Date(); graceDate.setDate(graceDate.getDate() - state.graceDays);
          let winDate = new Date(); winDate.setDate(winDate.getDate() + state.windowDays);
          const gStr = graceDate.toISOString().split('T')[0];
          const wStr = winDate.toISOString().split('T')[0];

          const url = `${SUPABASE_URL}/rest/v1/mv_forecast_engine_v3?next_expected_date=gte.${gStr}&next_expected_date=lte.${wStr}&limit=1000`;
          const res = await gmFetch(url, { headers: sbHeaders() });
          if(!res.ok) throw new Error();
          const rawData = tryParse(res.responseText) || [];
          const cMap = {};
          rawData.forEach(r => {
              if(!cMap[r.customer_phone]) cMap[r.customer_phone] = { phone: r.customer_phone, name: "לקוח בטעינה...", addr: "", categories: [] };
              cMap[r.customer_phone].categories.push(r);
          });
          state.customersData = Object.values(cMap);

          const phonesArr = state.customersData.map(c => c.phone);
          if (phonesArr.length > 0) {
              const namesRes = await gmFetch(`${SUPABASE_URL}/rest/v1/rpc/buyer_sku_shortages_raw_names`, { method: "POST", headers: sbHeaders(), body: JSON.stringify({ p_phones: phonesArr }) });
              if(namesRes.ok) {
                  const nd = tryParse(namesRes.responseText) || [];
                  const nMap = {}; nd.forEach(n => nMap[n.p9] = { name: n.c_name, addr: [n.c_city, n.c_address].filter(Boolean).join(" - ") });
                  state.customersData.forEach(c => {
                      if(nMap[c.phone]) { c.name = nMap[c.phone].name; c.addr = nMap[c.phone].addr; }
                  });
              }
          }
          renderCustomerList();
      } catch(e) { setStatus("שגיאה בטעינת לקוחות", true); }
  }

  function renderCustomerList() {
      mainList.innerHTML = "";
      if(!state.customersData || !state.customersData.length) { mainList.appendChild(el("div", { textContent: "אין לקוחות בחלון הזמן הזה.", style: { textAlign: "center", padding: "40px" } })); return; }

      let filtered = state.customersData.filter(c => {
          let keep = false;
          for(const cat of c.categories) {
              const info = parseCategoryInfo(cat.category_key);
              const mAnimal = state.filterAnimal === 'all' || info.animal === state.filterAnimal;
              const mType = state.filterType === 'all' || info.type === state.filterType;
              const mStat = state.filterCustomerStatus === 'all' || cat.dos_bucket === state.filterCustomerStatus;
              if (mAnimal && mType && mStat) keep = true;
          }
          return keep;
      });
      filtered.forEach(c => {
          let nearest = new Date('2099-01-01');
          c.categories.forEach(cat => { let d = new Date(cat.next_expected_date); if(d < nearest) nearest = d; });
          c.nearest = nearest;
      });
      filtered.sort((a,b) => a.nearest - b.nearest);

      setStatus(`מציג ${filtered.length} לקוחות שצריכים הזמנה.`);
      filtered.forEach(c => { mainList.appendChild(buildCustomerCard(c.phone, c.name, c.addr, c.categories, false)); });
  }

  function buildCustomerCard(phone, name, addr, categories, autoOpen = false) {
      const card = el("div", { className: "ani-card" });
      const dispPhone = phone.startsWith('0') ? phone : '0'+phone;

      let worstStat = 'OK';
      const statRank = {'DANGER':1, 'CRIT':2, 'OUT':3, 'LOW':4, 'WARNING':5, 'OK':6, 'HIGH':7};
      categories.forEach(c => { if(statRank[c.dos_bucket] < statRank[worstStat]) worstStat = c.dos_bucket; });
      const dosInfo = DOS_MAP[worstStat] || { label: worstStat, type: 'gray' };
      const titleArea = el("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } }, [
        el("div", { style: { display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" } }, [
          el("span", { textContent: `👤 ${name}`, style: { fontSize: "16px", fontWeight: "700", color: "#0f172a" } }),
          el("span", { textContent: dispPhone, style: { fontSize: "14px", color: "#64748b" } }),
          badge(`סטטוס לקוח: ${dosInfo.label}`, dosInfo.type)
        ]),
        el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", fontSize: "13px", color: "#64748b" } }, [
            el("span", { textContent: `📍 ${addr || 'כתובת לא ידועה'}` }),
            el("span", { textContent: `| ${categories.length} קטגוריות בתחזית` })
        ])
      ]);
      const btnToggle = el("button", { className: "ani-btn", textContent: autoOpen ? "סגור פירוט" : "פתח פירוט" });
      const cBody = el("div", { className: "ani-card-body" });
      if(autoOpen) cBody.classList.add('open');
      let isLoaded = false;
      btnToggle.onclick = async () => {
        if (cBody.classList.contains('open')) { cBody.classList.remove('open'); btnToggle.textContent = "פתח פירוט"; }
        else {
            cBody.classList.add('open'); btnToggle.textContent = "סגור פירוט";
            if (!isLoaded) { cBody.innerHTML = ""; cBody.appendChild(createSkeletonTable()); await populateCustomerDetails(phone, categories, cBody, name); isLoaded = true; }
        }
      };

      if(autoOpen) { cBody.appendChild(createSkeletonTable()); populateCustomerDetails(phone, categories, cBody, name); isLoaded = true; }
      card.appendChild(el("div", { className: "ani-card-header" }, [titleArea, btnToggle]));
      card.appendChild(cBody);
      return card;
  }

  async function populateCustomerDetails(p9, categories, container, cName) {
      let custRows = [];
      for (const cat of categories) {
          const ordRes = await gmFetch(`${SUPABASE_URL}/rest/v1/rpc/buyer_sku_shortages_raw_orders_single`, { method: "POST", headers: sbHeaders(), body: JSON.stringify({ p_phone: p9, p_category: cat.category_key }) });
          let parsedData = tryParse(ordRes.responseText);
          let rawOrd = Array.isArray(parsedData) ? parsedData : [];
          let dMap = {};
          rawOrd.forEach(x => { let dt = new Date(x.o_date); let dStr = dt.getTime(); if(!dMap[dStr]) dMap[dStr] = { date: dt, qty: 0 }; dMap[dStr].qty += Number(x.qty); });
          let uOrders = Object.values(dMap).sort((a,b)=>b.date-a.date);

          let anomalyBadge = badge("יציב", "gray", "ממוצע תואם להזמנה");
          let relBadge = badge("מעט נתונים", "gray");
          let lastDate = null; let lastQtyUnits;
          let avgGapStr = cat.dos_days ? `~ כל ${cat.dos_days} ימים` : "לא ידוע";

          if (cat.rel_level === 'high') relBadge = badge("🎯 גבוהה", "green", `סטיית צריכה: ${cat.cv_percentage}%`);
          else if (cat.rel_level === 'medium') relBadge = badge("🟡 בינונית", "orange", `סטיית צריכה: ${cat.cv_percentage}%`);
          else if (cat.rel_level === 'low' && cat.cv_percentage) relBadge = badge("🎲 נמוכה", "red", `סטיית צריכה: ${cat.cv_percentage}%`);

          if (uOrders.length > 0) {
              lastDate = uOrders[0].date.toISOString().split('T')[0];
              let weightMultiplier = cat.pack_weight || 1;
              lastQtyUnits = Math.round(uOrders[0].qty / weightMultiplier);
              let past = uOrders.slice(1,4);
              if (past.length > 0) {
                  let pastUnits = past.map(o => o.qty / weightMultiplier);
                  let avgQtyUnitsRaw = pastUnits.reduce((a,b)=>a+b,0) / past.length;
                  let avgQtyUnits = Math.round(avgQtyUnitsRaw);
                  if (avgQtyUnits === 0 && avgQtyUnitsRaw > 0) avgQtyUnits = 1;
                  let diffUnits = lastQtyUnits - avgQtyUnits;
                  if (diffUnits !== 0) {
                      let diffUnitsAbs = Math.abs(diffUnits);
                      let diffStr = `${diffUnitsAbs} יח'`;
                      if (weightMultiplier && weightMultiplier !== 1) {
                          let w = diffUnitsAbs * weightMultiplier;
                          let wStr = w < 1 ? `${Math.round(w * 1000)} גרם` : `${Number(w).toFixed(2).replace(/\.?0+$/, '')} ק"ג`;
                          diffStr += ` (${wStr})`;
                      }
                      if (lastQtyUnits <= avgQtyUnitsRaw * 0.85) {
                           anomalyBadge = badge(`▼ חסר ${diffStr}`, "red", `הזמנה אחרונה: ${lastQtyUnits} יח' | ממוצע: ${avgQtyUnits} יח'`);
                      } else if (lastQtyUnits >= avgQtyUnitsRaw * 1.15) {
                          anomalyBadge = badge(`▲ עודף ${diffStr}`, "green", `הזמנה אחרונה: ${lastQtyUnits} יח' | ממוצע: ${avgQtyUnits} יח'`);
                      }
                  }
              }
          }

          let expQtyUnits = Math.round(Number(cat.expected_qty || 1));
          let expectedQtyHtml = `<b>${expQtyUnits} יח'</b>`;
          if (cat.pack_weight && cat.pack_weight != 1) {
              let weightVal = expQtyUnits * cat.pack_weight;
              let weightStr = weightVal < 1 ? `${Math.round(weightVal * 1000)} גרם` : `${Number(weightVal).toFixed(2).replace(/\.?0+$/, '')} ק"ג`;
              expectedQtyHtml += ` <span style="color:#64748b; font-size:12px;">(${weightStr})</span>`;
          }
          let expectedQtyNode = el("div", { className: "has-tooltip", 'data-tooltip': 'צפי הזמנה עתידית (מבוסס על הזמנה אחרונה)', innerHTML: expectedQtyHtml });

          const dosInfo = DOS_MAP[cat.dos_bucket] || { label: cat.dos_bucket, type: 'gray', desc: 'סטטוס לא ידוע' };
          let dynamicDesc = dosInfo.desc;
          if (['OUT', 'CRIT', 'DANGER'].includes(cat.dos_bucket)) dynamicDesc = `המלאי הסתיים בתאריך ${fmtDate(cat.next_expected_date)}`;
           else if (['LOW', 'WARNING'].includes(cat.dos_bucket)) dynamicDesc = `המלאי צפוי להסתיים בתאריך ${fmtDate(cat.next_expected_date)}`;

          const statusBadgeNode = badge(dosInfo.label, dosInfo.type, dynamicDesc);
          const infoBtn = el("button", { className: "ani-btn has-tooltip", 'data-tooltip': 'צפה בהיסטוריית הפריטים', innerHTML: '👁️', style: { padding: "4px 8px", fontSize: "14px", border: "none", background: "#f1f5f9" } });

          infoBtn.onclick = () => fetchHistoryDirect(p9, cat.category_key, cName, infoBtn);
          const dateCell = el("div", { style: { display: "flex", alignItems: "center", gap: "8px" } }, [ el("span", { textContent: fmtDate(lastDate) }), infoBtn ]);
          let recentOrdersCount = 0; const halfYearAgo = new Date(); halfYearAgo.setMonth(halfYearAgo.getMonth() - 6);
          uOrders.forEach(o => { if (o.date >= halfYearAgo) recentOrdersCount++; });

          if (!ordRes.ok || !Array.isArray(parsedData)) anomalyBadge = badge("שגיאת רשת", "red", "לא ניתן היה לשלוף היסטוריית הזמנות");
          custRows.push([
              asNode(badge(t(cat.category_key), "gray")),
              asNode(dateCell), asNode(el("span", { className: "has-tooltip", 'data-tooltip': 'מרווח זמן ממוצע בין הזמנות' }, [avgGapStr])),
              asNode(anomalyBadge), asNode(relBadge), asNode(statusBadgeNode), fmtDate(cat.next_expected_date), asNode(expectedQtyNode),
              asNode(el("span", { className: "has-tooltip", 'data-tooltip': `סה״כ ${uOrders.length} הזמנות אי פעם`}, [`${recentOrdersCount} (בחצי שנה)`]))
          ]);
      }

      const tblContainer = el("div", { className: "table-responsive" });
      tblContainer.appendChild(table(custTableHeaders.slice(3), custRows));
      const skel = container.querySelector('.ani-skeleton-wrapper');
      if (skel) skel.remove();
      container.appendChild(tblContainer);
  }

  async function loadDataAndRender() {
    showMainSkeleton();
    state.lastDiagnostic = null;
    setStatus(`טוען נתונים... מ-${state.graceDays} ימים אחורה עד ${state.windowDays} קדימה.`);
    try {
      const url = `${SUPABASE_URL}/rest/v1/rpc/buyer_sku_shortages_based_on_category`;
      const res = await gmFetch(url, { method: "POST", headers: sbHeaders(), body: JSON.stringify({ p_category_key: null, p_limit: state.limit, p_grace_past_days: state.graceDays, p_window_days: state.windowDays }) });
      if (!res.ok) throw new Error("RPC Failed");
      state.skusData = tryParse(res.responseText) || [];
      const allSkus = [...new Set(state.skusData.map(s => s.recommend_sku).filter(Boolean))];
      await fetchMetaForSkus(allSkus);
      renderMainList();
    } catch (e) { setStatus(`שגיאה בטעינת הנתונים`, true); }
  }

  function renderMainList() {
    mainList.innerHTML = "";
    if (!state.skusData || !state.skusData.length) { mainList.appendChild(el("div", { textContent: "אין נתונים מהשרת לחיתוך הנוכחי.", style: { color: "#94a3b8", textAlign: "center", padding: "40px", fontSize: "16px" } }));
    return; }
    let filteredSkus = state.skusData.filter(s => {
        const info = parseCategoryInfo(s.category_key);
        const sSup = state.supplierMap[s.recommend_sku] || state.supplierMap[s.product_name];
        const matchAnimal = state.filterAnimal === 'all' || info.animal === state.filterAnimal;
        const matchType = state.filterType === 'all' || info.type === state.filterType;
        const matchSupplier = state.filterSupplier === 'all' || sSup === state.filterSupplier;
        return matchAnimal && matchType && matchSupplier;
    });
    if (filteredSkus.length === 0) { mainList.appendChild(el("div", { textContent: "אין מוצרים העונים לתנאי הסינון.", style: { color: "#94a3b8", textAlign: "center", padding: "40px", fontSize: "16px" } }));
    return; }

    const sortedSkus = filteredSkus.sort((a, b) => {
      const dA = new Date(a.nearest_due_date).setHours(0,0,0,0), dB = new Date(b.nearest_due_date).setHours(0,0,0,0), today = new Date().setHours(0,0,0,0);
      if (state.sortBy === 'smart') {
          return dA !== dB ? dA - dB : b.total_customers - a.total_customers;
      } else if (state.sortBy === 'churn') return dA - dB;
      else if (state.sortBy === 'upcoming') return Math.abs(dA - today) - Math.abs(dB - today);
      else if (state.sortBy === 'volume_qty') return b.total_expected_qty - a.total_expected_qty;
      else return b.total_customers - a.total_customers;
    });
    let activeCustomerFiltersText = (state.filterCustomerStatus !== 'all' || state.filterCustomerRel !== 'all') ?
    " ⚠️ (מציג נתוני מאקרו. להצגת הלקוחות בפועל - פתח רשימה)" : "";
    setStatus(`מציג ${sortedSkus.length} מוצרים בהתאם להגדרות.${activeCustomerFiltersText}`);
    for (const s of sortedSkus) mainList.appendChild(buildSkuCard(s));
  }

  function buildSkuCard(s, isSearchMode = false) {
      const card = el("div", { className: "ani-card" });
      const badgeList = [];
      const totalQty = s.total_expected_qty ? Number(s.total_expected_qty).toFixed(0) : (s.total_customers||0);
      if (!isSearchMode) {
          if (s.late_customers > 0) badgeList.push(el("span", { className: "has-tooltip", 'data-tooltip': "לקוחות שעבר התאריך המשוער להזמנה שלהם", innerHTML: `⏳ באיחור: <b style="color:#b45309">${s.late_customers}</b>`, style: { fontSize: "13px", color: "#64748b" } }));
          if (s.future_customers > 0) badgeList.push(el("span", { className: "has-tooltip", 'data-tooltip': "לקוחות בתחזית מהיום והלאה", innerHTML: `📅 בתחזית: <b style="color:#059669">${s.future_customers}</b>`, style: { fontSize: "13px", color: "#64748b" } }));
          badgeList.push(el("span", { textContent: "|", style: { color: "#cbd5e1" } }));
          badgeList.push(el("span", { className: "ani-badge badge-gray has-tooltip", 'data-tooltip': "מספר האנשים הכולל בבסיס הנתונים שרוכשים פריט זה בקביעות", innerHTML: `<i class="fa-solid fa-users" style="margin-left:5px; color:#64748b"></i> רוכשים קבועים: ${s.total_customers||0}` }));
          badgeList.push(el("span", { className: "ani-badge badge-purple has-tooltip", 'data-tooltip': "צפי יחידות כולל בטווח הזמן", innerHTML: `<i class="fa-solid fa-box" style="margin-left:5px;"></i> ${totalQty} יח'` }));
          if (s.total_expected_weight > 0) {
              let w = s.total_expected_weight;
              let displayWeight = w < 1 ? `${Math.round(w * 1000)} גרם` : `${Number(w).toFixed(2).replace(/\.?0+$/, '')} ק"ג`;
              badgeList.push(el("span", { className: "ani-badge badge-blue has-tooltip", 'data-tooltip': "צפי משקל כולל", innerHTML: `<i class="fa-solid fa-scale-balanced" style="margin-left:5px;"></i> ${displayWeight}` }));
          }
          badgeList.push(el("span", { className: "has-tooltip", 'data-tooltip': 'תאריך ההזמנה המשוער המוקדם ביותר מבין הלקוחות ברשימה זו', textContent: `• תאריך קרוב: ${fmtDate(s.nearest_due_date)}`, style: { fontSize: "13px", color: "#64748b" } }));
      } else {
          badgeList.push(el("span", { className: "has-tooltip", 'data-tooltip': 'חיפוש ספציפי עוקף את חיתוכי התאריכים', textContent: "תוצאת חיפוש-על - מציג היסטוריית לקוחות מלאה", style: { fontSize: "13px", color: "#3b82f6", fontWeight: "600" } }));
      }

      const sSupplier = state.supplierMap[s.recommend_sku] || '';
      const skuBadgeNode = el("span", { className: "ani-badge badge-gray has-tooltip", 'data-tooltip': 'מק"ט / ברקוד', innerHTML: `<i class="fa-light fa-barcode" style="margin-left:4px;"></i>${s.recommend_sku}` });
      const textArea = el("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } }, [
        el("div", { style: { display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" } }, [
          el("span", { textContent: s.product_name || "מוצר ללא שם", style: { fontSize: "15px", fontWeight: "700", color: "#0f172a" } }),
          asNode(skuBadgeNode),
          badge(t(s.category_key), "gray")
        ]),
        el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" } }, [
            sSupplier ? el("span", { className: "ani-badge badge-gray", innerHTML: `<i class="fa-light fa-truck" style="margin-left:4px;"></i> ${sSupplier}` }) : null,
            ...badgeList
        ].filter(Boolean))
      ]);
      const rawImgUrl = state.imagesMap[s.recommend_sku];

      const thumbnailEl = el("img", {
          src: getThumbnailUrl(rawImgUrl),
          loading: "lazy",
          style: { width: "50px", height: "50px", objectFit: "contain", borderRadius: "6px", border: "1px solid #e2e8f0", background: "#fff" },
          onerror: function() {
              if(!this.dataset.fallbackTriggered && rawImgUrl) {
                  this.dataset.fallbackTriggered = 'true';
                  this.src = rawImgUrl;
              }
          }
      });
      const imgWrapper = el("div", { style: { position: "relative", flexShrink: "0" } });
      if (!isSearchMode) imgWrapper.appendChild(el("span", { className: "lw-thumb-badge" }, [`X${totalQty}`]));
      imgWrapper.appendChild(thumbnailEl);

      const titleAreaWithImage = el("div", { style: { display: "flex", alignItems: "center", gap: "12px" } }, [imgWrapper, textArea]);
      const btnToggle = el("button", { className: "ani-btn", textContent: "פתח לקוחות" });
      const cBody = el("div", { className: "ani-card-body" });
      let isLoaded = false;

      btnToggle.onclick = async () => {
        if (cBody.classList.contains('open')) { cBody.classList.remove('open'); btnToggle.textContent = "פתח לקוחות"; }
        else {
            cBody.classList.add('open'); btnToggle.textContent = "סגור רשימה";
            if (!isLoaded) { cBody.innerHTML = ""; cBody.appendChild(createSkeletonTable()); await fetchAndRenderCustomers(s.recommend_sku, cBody, state.graceDays, state.windowDays); isLoaded = true; }
        }
      };
      card.appendChild(el("div", { className: "ani-card-header" }, [titleAreaWithImage, btnToggle]));
      card.appendChild(cBody);
      return card;
  }

  async function fetchAndRenderCustomers(sku, containerElement, grace, window) {
    try {
      const url = `${SUPABASE_URL}/rest/v1/rpc/buyer_sku_shortages_drilldown_step1_base`;
      const res = await gmFetch(url, { method: "POST", headers: sbHeaders(), body: JSON.stringify({ p_recommend_sku: sku, p_category_key: null, p_limit: 1000, p_grace_past_days: grace, p_window_days: window }) });
      if(!res.ok) throw new Error("API call failed");
      const users = tryParse(res.responseText) || [];
      if (!users.length) {
          containerElement.innerHTML = "";
          containerElement.appendChild(el("div", { textContent: "לא נמצאו לקוחות מתאימים לחיתוך זה.", style: { padding: "16px", textAlign: "center", color: "#94a3b8" } })); return;
      }

      const phones = users.map(u => u.p9);
      const cat = users[0].category_key;
      let nameMap = {}, ordersMap = {};

      try {
          const namesRes = await gmFetch(`${SUPABASE_URL}/rest/v1/rpc/buyer_sku_shortages_raw_names`, { method: "POST", headers: sbHeaders(), body: JSON.stringify({ p_phones: phones }) });
          if(namesRes.ok) tryParse(namesRes.responseText).forEach(n => nameMap[n.p9] = { name: n.c_name, addr: [n.c_city, n.c_address].filter(Boolean).join(" - ") });
      } catch(e) {}

      try {
          const orderPromises = phones.map(phone => gmFetch(`${SUPABASE_URL}/rest/v1/rpc/buyer_sku_shortages_raw_orders_single`, { method: "POST", headers: sbHeaders(), body: JSON.stringify({ p_phone: phone, p_category: cat }) }).then(r => {
              let parsed = tryParse(r.responseText);
              if (!Array.isArray(parsed)) return [];
              return parsed.map(x => ({ p9: phone, o_date: x.o_date, qty: x.qty }));
          }).catch(()=>[]));
          const ordersRaw = (await Promise.all(orderPromises)).flat();
          for (const o of ordersRaw) { if (!ordersMap[o.p9]) ordersMap[o.p9] = []; ordersMap[o.p9].push({ date: new Date(o.o_date), qty: Number(o.qty) }); }
      } catch(e) {}

      let custRows = [];
      for (const u of users) {
        const p9 = u.p9;
        const displayPhone = (p9 && p9.length === 9 && !p9.startsWith('0')) ? '0' + p9 : p9;
        let rawUOrders = ordersMap[p9] || [];
        let dMap = {};
        rawUOrders.forEach(o => { let dStr = o.date.getTime(); if(!dMap[dStr]) dMap[dStr] = { date: o.date, qty: 0 }; dMap[dStr].qty += o.qty; });
        let uOrders = Object.values(dMap).sort((a,b)=>b.date-a.date);

        let anomalyBadge = badge("יציב", "gray", "ממוצע תואם להזמנה");
        let relBadge = badge("מעט נתונים", "gray");
        let lastDate = null; let lastQtyUnits;
        let avgGapStr = u.dos_days ? `~ כל ${u.dos_days} ימים` : "לא ידוע";

        if (u.rel_level === 'high') relBadge = badge("🎯 גבוהה", "green", `סטיית צריכה: ${u.cv_percentage}%`);
        else if (u.rel_level === 'medium') relBadge = badge("🟡 בינונית", "orange", `סטיית צריכה: ${u.cv_percentage}%`);
        else if (u.rel_level === 'low' && u.cv_percentage) relBadge = badge("🎲 נמוכה", "red", `סטיית צריכה: ${u.cv_percentage}%`);

        if (uOrders.length > 0) {
            lastDate = uOrders[0].date.toISOString().split('T')[0];
            let weightMultiplier = u.pack_weight || 1;
            lastQtyUnits = Math.round(uOrders[0].qty / weightMultiplier);
            let past = uOrders.slice(1,4);
            if (past.length > 0) {
                let pastUnits = past.map(o => o.qty / weightMultiplier);
                let avgQtyUnitsRaw = pastUnits.reduce((a,b)=>a+b,0) / past.length;
                let avgQtyUnits = Math.round(avgQtyUnitsRaw);
                if (avgQtyUnits === 0 && avgQtyUnitsRaw > 0) avgQtyUnits = 1;
                let diffUnits = lastQtyUnits - avgQtyUnits;
                if (diffUnits !== 0) {
                    let diffUnitsAbs = Math.abs(diffUnits);
                    let diffStr = `${diffUnitsAbs} יח'`;
                    if (weightMultiplier && weightMultiplier !== 1) {
                        let w = diffUnitsAbs * weightMultiplier;
                        let wStr = w < 1 ? `${Math.round(w * 1000)} גרם` : `${Number(w).toFixed(2).replace(/\.?0+$/, '')} ק"ג`;
                        diffStr += ` (${wStr})`;
                    }
                    if (lastQtyUnits <= avgQtyUnitsRaw * 0.85) {
                        anomalyBadge = badge(`▼ חסר ${diffStr}`, "red", `הזמנה אחרונה: ${lastQtyUnits} יח' | ממוצע: ${avgQtyUnits} יח'`);
                    } else if (lastQtyUnits >= avgQtyUnitsRaw * 1.15) {
                        anomalyBadge = badge(`▲ עודף ${diffStr}`, "green", `הזמנה אחרונה: ${lastQtyUnits} יח' | ממוצע: ${avgQtyUnits} יח'`);
                    }
                }
            }
        }

        if (state.filterCustomerStatus !== 'all' && u.dos_bucket !== state.filterCustomerStatus) continue;
        if (state.filterCustomerRel !== 'all' && u.rel_level !== state.filterCustomerRel) continue;

        let expQtyUnits = Math.round(Number(u.expected_qty || 1));
        let expectedQtyHtml = `<b>${expQtyUnits} יח'</b>`;
        if (u.pack_weight && u.pack_weight != 1) {
            let weightVal = expQtyUnits * u.pack_weight;
            let weightStr = weightVal < 1 ? `${Math.round(weightVal * 1000)} גרם` : `${Number(weightVal).toFixed(2).replace(/\.?0+$/, '')} ק"ג`;
            expectedQtyHtml += ` <span style="color:#64748b; font-size:12px;">(${weightStr})</span>`;
        }
        let expectedQtyNode = el("div", { className: "has-tooltip", 'data-tooltip': 'צפי הזמנה עתידית (מבוסס על הזמנה אחרונה)', innerHTML: expectedQtyHtml });

        const dosInfo = DOS_MAP[u.dos_bucket] || { label: u.dos_bucket, type: 'gray', desc: 'סטטוס לא ידוע' };
        let dynamicDesc = dosInfo.desc;
        if (['OUT', 'CRIT', 'DANGER'].includes(u.dos_bucket)) dynamicDesc = `המלאי הסתיים בתאריך ${fmtDate(u.next_expected_date)}`;
        else if (['LOW', 'WARNING'].includes(u.dos_bucket)) dynamicDesc = `המלאי צפוי להסתיים בתאריך ${fmtDate(u.next_expected_date)}`;

        const statusBadgeNode = badge(dosInfo.label, dosInfo.type, dynamicDesc);
        const infoBtn = el("button", { className: "ani-btn has-tooltip", 'data-tooltip': 'היסטוריית פריטים', innerHTML: '👁️', style: { padding: "4px 8px", fontSize: "14px", border: "none", background: "#f1f5f9" } });
        const cName = nameMap[p9]?.name || "לקוח לא ידוע";

        infoBtn.onclick = () => fetchHistoryDirect(p9, cat, cName, infoBtn);
        const dateCell = el("div", { style: { display: "flex", alignItems: "center", gap: "8px" } }, [ el("span", { textContent: fmtDate(lastDate) }), infoBtn ]);
        let recentOrdersCount = 0;
        const halfYearAgo = new Date(); halfYearAgo.setMonth(halfYearAgo.getMonth() - 6);
        uOrders.forEach(o => { if (o.date >= halfYearAgo) recentOrdersCount++; });

        custRows.push([
          displayPhone, cName, nameMap[p9]?.addr || "",
          asNode(badge(t(u.category_key), "gray")), asNode(dateCell),
          asNode(el("span", { className: "has-tooltip", 'data-tooltip': 'קצב רכישה ממוצע' }, [avgGapStr])),
          asNode(anomalyBadge), asNode(relBadge), asNode(statusBadgeNode), fmtDate(u.next_expected_date), asNode(expectedQtyNode),
          asNode(el("span", { className: "has-tooltip", 'data-tooltip': `סה״כ ${uOrders.length} הזמנות אי פעם`}, [`${recentOrdersCount} (בחצי שנה)`]))
        ]);
      }

      const tblContainer = el("div", { className: "table-responsive" });
      if (custRows.length === 0) {
          tblContainer.appendChild(el("div", { textContent: "ישנם לקוחות בפריט זה, אך הם סוננו החוצה על ידי מסנני הסטטוס/אמינות שבחרת למעלה.", style: { padding: "16px", textAlign: "center", color: "#b45309", background: "#fffbeb", borderRadius: "8px", margin: "16px" } }));
      } else {
          tblContainer.appendChild(table(custTableHeaders, custRows));
      }

      const skel = containerElement.querySelector('.ani-skeleton-wrapper');
      if (skel) skel.remove();
      containerElement.appendChild(tblContainer);

    } catch(e) { console.error(e);
      containerElement.innerHTML = "<div style='padding:16px; color:red;'>שגיאה בשליפת לקוחות מהשרת</div>"; }
  }

  function injectTriggerButton() {
      if (document.getElementById('anipet-pro-trigger-btn')) return;
      const itemsBtn = document.querySelector('.order-items-btn'); if (!itemsBtn) return;
      const btnContainer = itemsBtn.parentNode;
      const triggerBtn = document.createElement('button'); triggerBtn.id = 'anipet-pro-trigger-btn';
      triggerBtn.className = 'btn btn-sm btn-light-primary m-0 mx-1 mx-md-0 m-md-1 d-flex align-items-center';
      triggerBtn.innerHTML = '⚡ תחזית PRO'; triggerBtn.style.backgroundColor = '#e4d6ff';
      triggerBtn.style.color = '#8950fc'; triggerBtn.style.fontWeight = 'bold'; triggerBtn.style.border = 'none';
      triggerBtn.onclick = (e) => { e.preventDefault(); rootDiv.style.display = 'flex'; applyPreset(PRESETS_HARDCODED[0]); };
      btnContainer.appendChild(triggerBtn);
  }

  const checkExist = setInterval(() => { if (document.querySelector('.order-items-btn')) { injectTriggerButton(); clearInterval(checkExist); } }, 500);

})();