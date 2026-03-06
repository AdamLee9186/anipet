// ==UserScript==
// @name         AniPet Buyer Shortages (PRO Dashboard UI v2.12.7)
// @namespace    anipet.buyer
// @version      2.12.7
// @description  Fixed Action Icons color to requested #007bff.
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
    .ani-label.has-tooltip { border-bottom: 1px dotted #cbd5e1; cursor: help; width: fit-content; }
    .ani-input, .ani-select { border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 12px; font-size: 13px; color: #334155; background: #f8fafc; outline: none; font-weight: 500; }

    .ani-multi-select-wrapper { position: relative; width: 100%; }
    .ani-multi-select-btn { width: 100%; text-align: right; background: #f8fafc; cursor: pointer; user-select: none; display: flex; justify-content: space-between; align-items: center; }
    .ani-multi-select-dropdown { position: absolute; top: 100%; left: 0; right: 0; background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; margin-top: 4px; z-index: 100; max-height: 250px; overflow-y: auto; box-shadow: 0 4px 15px rgba(0,0,0,0.1); padding: 4px; display: none; }
    .ani-multi-select-item { display: flex; align-items: center; gap: 8px; padding: 6px 8px; cursor: pointer; border-radius: 4px; font-size: 13px; color: #334155; margin-bottom: 2px;}
    .ani-multi-select-item:hover { background: #f1f5f9; }
    .ani-multi-select-item input { cursor: pointer; }

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

    .ani-tooltip-box { position: fixed; background: rgba(15, 23, 42, 0.98); color: #fff; padding: 12px 16px; border-radius: 8px; font-size: 13px; font-weight: 500; pointer-events: none; z-index: 999999999; opacity: 0; transition: opacity 0.2s; box-shadow: 0 10px 25px rgba(0,0,0,0.3); max-width: 320px; text-align: right; direction: rtl; line-height: 1.6; border: 1px solid #334155; }
    .ani-tooltip-box b { color: #38bdf8; }

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
    .sync-refresh-btn { cursor: pointer; padding: 4px 10px; border-radius: 6px; background: #eff6ff; color: #3b82f6; border: 1px solid #bfdbfe; transition: 0.2s; display: inline-flex; align-items: center; gap: 6px; font-weight: bold; margin-right: 12px; }
    .sync-refresh-btn:hover { background: #dbeafe; }

    .ani-actions-container {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        direction: ltr;
    }

    /* התיקון שהתבקש לצבע האייקונים: #007bff */
    .ani-action-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: #007bff !important; /* תכלת המדויק שביקשת */
        font-size: 15px !important;
        text-decoration: none;
        transition: color 0.2s ease-in-out;
        cursor: pointer;
        padding: 0 2px;
    }

    .ani-action-btn:hover {
        color: #0056b3 !important; /* צבע טיפה כהה יותר בריחוף */
    }

    .ani-action-btn i {
        font-size: 15px !important;
        line-height: 1 !important;
    }
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
    'rodent_food': '🐹🌾 מזון למכרסמים',
    'bird_food': '🦜🌾 מזון לבעלי כנף',
    'small_pet_food': '🐾🌾 מזון לחיות קטנות',
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

  function getDateRangeStr(dateStr, cvPercentage) {
      if (!dateStr) return "";
      const baseDate = new Date(dateStr);
      let bufferDays = 0;
      if (cvPercentage <= 20) bufferDays = 2;
      else if (cvPercentage <= 45) bufferDays = 4;
      else bufferDays = 7;

      const start = new Date(baseDate); start.setDate(start.getDate() - bufferDays);
      const end = new Date(baseDate); end.setDate(end.getDate() + bufferDays);

      const startStr = `${String(start.getDate()).padStart(2,'0')}/${String(start.getMonth()+1).padStart(2,'0')}`;
      const endStr = `${String(end.getDate()).padStart(2,'0')}/${String(end.getMonth()+1).padStart(2,'0')}`;
      return `${startStr} - ${endStr}`;
  }

  function getReliabilityCategory(cv) {
      if (cv === null || cv === undefined || cv === 0) return 'sparse';
      if (cv <= 20) return 'swiss';
      if (cv <= 45) return 'regular';
      return 'erratic';
  }

  function getReliabilityBadge(cv) {
      if (cv === null || cv === undefined || cv === 0) return badge("❓ מעט נתונים", "gray");
      if (cv <= 20) return badge("⏱️ שעון שוויצרי", "green", `סטיית קניות: ${cv}% (צפוי מאוד)`);
      if (cv <= 45) return badge("✓ סדיר", "gray", `סטיית קניות: ${cv}%`);
      return badge("🎲 כאוטי", "orange", `סטיית קניות: ${cv}% (קונה מתי שבא לו)`);
  }

  function parseCategoryInfo(catKey) {
      const key = String(catKey).toLowerCase();
      let animal = 'other'; let type = 'other';
      if (key.includes('dog')) animal = 'dog'; else if (key.includes('cat')) animal = 'cat'; else if (key.includes('bird')) animal = 'bird'; else if (key.includes('rodent')) animal = 'rodent';
      if (key.includes('litter') || key.includes('sandy')) type = 'litter'; else if (key.includes('treats')) type = 'treats'; else if (key.includes('wet')) type = 'wet'; else if (key.includes('food')) type = 'dry';
      return { animal, type };
  }

  const PRESETS_HARDCODED = [
    { id: 'buyer_action', label: '🛒 רכש SOS', grace: 0, window: 14, sort: 'smart', filterStatus: ['all'], filterAnimal: ['all'], filterType: ['all'], filterRel: ['all'], filterSupplier: ['all'], tooltip: "מוצרים קריטיים וחשובים" },
    { id: 'today', label: '📅 תחזית להיום', grace: 0, window: 0, sort: 'smart', filterStatus: ['all'], filterAnimal: ['all'], filterType: ['all'], filterRel: ['all'], filterSupplier: ['all'], tooltip: "מי אמור להזמין בדיוק היום" },
    { id: 'upcoming', label: '🔭 תחזית (חודש)', grace: 0, window: 30, sort: 'upcoming', filterStatus: ['all'], filterAnimal: ['all'], filterType: ['all'], filterRel: ['all'], filterSupplier: ['all'], tooltip: "מבט רחוק: כל המוצרים שיידרשו בחודש הקרוב." },
    { id: 'vip', label: '💎 לקוחות ברזל', grace: 7, window: 14, sort: 'smart', filterStatus: ['all'], filterAnimal: ['all'], filterType: ['all'], filterRel: ['swiss'], filterSupplier: ['all'], tooltip: "הזמנה בטוחה: מציג אך ורק לקוחות מסוג 'שעון שוויצרי'." },
    { id: 'churn', label: '🔥 באיחור / נטישה', grace: 30, window: 0, sort: 'churn', filterStatus: ['DANGER'], filterAnimal: ['all'], filterType: ['all'], filterRel: ['all'], filterSupplier: ['all'], tooltip: "לקוחות שעברו את תאריך היעד שלהם ועדיין לא קנו." }
  ];

  const state = {
      viewMode: 'products',
      limit: 3000, sortBy: 'smart', graceDays: 0, windowDays: 14,
      filterAnimal: ['all'], filterType: ['all'], filterCustomerStatus: ['all'], filterCustomerRel: ['all'], filterSupplier: ['all'],
      allRawData: [], currentDisplayedSkus: [], currentDisplayedCustomers: [], imagesMap: {}, supplierMap: {}, activePreset: 'buyer_action', customPresets: [],
      feedbackDaysBack: 0
  };

  function loadCustomPresets() {
      try {
          let loaded = JSON.parse(localStorage.getItem('ani_custom_presets') || '[]');
          state.customPresets = loaded.map(p => {
              if (typeof p.filterStatus === 'string') p.filterStatus = [p.filterStatus];
              if (typeof p.filterAnimal === 'string') p.filterAnimal = [p.filterAnimal];
              if (typeof p.filterType === 'string') p.filterType = [p.filterType];
              if (typeof p.filterRel === 'string') p.filterRel = [p.filterRel];
              if (typeof p.filterSupplier === 'string') p.filterSupplier = [p.filterSupplier];
              return p;
          });
      } catch(e) { state.customPresets = []; }
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

  async function triggerManualRefresh() {
      const btn = document.getElementById('ani-refresh-btn');
      if (!btn) return;
      const originalHtml = btn.innerHTML;
      btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> מרענן נתונים בשרת...`;
      btn.style.pointerEvents = 'none';
      try {
          const res = await gmFetch(`${SUPABASE_URL}/rest/v1/rpc/trigger_nightly_refresh`, { method: "POST", headers: sbHeaders() });
          if(res.ok) {
              btn.innerHTML = `<i class="fa-solid fa-check" style="color:#10b981;"></i> רענון הצליח! מושך נתונים...`;
              setTimeout(() => { fetchLastSyncTime(); fetchAllDataAndRender(); }, 1500);
          } else {
              btn.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color:#ef4444;"></i> שגיאה ברענון`;
              setTimeout(() => { btn.innerHTML = originalHtml; btn.style.pointerEvents = 'auto'; }, 3000);
          }
      } catch(e) {
          btn.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color:#ef4444;"></i> שגיאה בתקשורת`;
          setTimeout(() => { btn.innerHTML = originalHtml; btn.style.pointerEvents = 'auto'; }, 3000);
      }
  }

  async function fetchMetaForSkus(skus) {
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
          const syncDiv = document.getElementById('ani-sync-time');
          if(res.ok) {
              const data = tryParse(res.responseText);
              if(data && data.length && data[0].created_at) {
                  const dt = new Date(data[0].created_at);
                  const dStr = `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear()} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
                  syncDiv.innerHTML = `הזמנה אחרונה בשרת: <b>${dStr}</b> <div id="ani-refresh-btn" class="sync-refresh-btn" title="רענן מנוע תחזיות עכשיו"><i class="fa-solid fa-arrows-rotate"></i> רענן ידנית</div>`;
                  document.getElementById('ani-refresh-btn').onclick = triggerManualRefresh;
                  return;
              }
          }
          syncDiv.innerHTML = `לא נמצאו נתוני סנכרון`;
      } catch(e){
          document.getElementById('ani-sync-time').innerHTML = `שגיאה בשליפת זמן`;
      }
  }

  function exportToCsv() {
      let csv = '\uFEFF';
      if (state.viewMode === 'products') {
          csv += 'מוצר,מק"ט/ברקוד,קטגוריה,ספק,תאריך קרוב,לקוחות בחלון הזמן,יח להזמנה,משקל להזמנה\n';
          (state.currentDisplayedSkus || []).forEach(s => {
              const name = (s.product_name || "").replace(/,/g, ' ');
              const sku = s.recommend_sku || "";
              const cat = t(s.category_key) || "";
              const supplier = state.supplierMap[sku] || "";
              const dateTxt = fmtDate(s.nearest_due_date);
              const usersTxt = s.total_customers || 0;
              const unitsTxt = s.total_expected_qty ? Number(s.total_expected_qty).toFixed(0) : 0;
              const kgTxt = s.total_expected_weight ? Number(s.total_expected_weight).toFixed(2) : 0;
              csv += `${name},${sku},${cat},${supplier},${dateTxt},${usersTxt},${unitsTxt},${kgTxt}\n`;
          });
      } else {
          csv += 'שם לקוח,טלפון,כתובת,קטגוריה,סטטוס,תאריך יעד,כמות משוערת\n';
          (state.currentDisplayedCustomers || []).forEach(c => {
              const name = (c.name || "").replace(/,/g, ' ');
              const phone = c.phone || "";
              const addr = (c.addr || "").replace(/,/g, ' ');
              c.categories.forEach(cat => {
                  const catName = t(cat.category_key);
                  const status = DOS_MAP[cat.dos_bucket]?.label || cat.dos_bucket;
                  const dateTxt = fmtDate(cat.next_expected_date);
                  const qty = Math.round(Number(cat.expected_qty || 1));
                  csv += `${name},${phone},${addr},${catName},${status},${dateTxt},${qty}\n`;
              });
          });
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

  function getPhoneNode(phone, name) {
      if (!phone) return document.createTextNode("");
      const dispPhone = phone.startsWith('0') ? phone : '0' + phone;
      let digits = dispPhone.replace(/\D/g, '');
      let waDigits = digits.startsWith('0') ? '972' + digits.substring(1) : digits;

      let firstName = name ? name.trim().split(' ')[0] : '';
      let waTooltip = firstName ? `וואטסאפ ל${firstName}` : "וואטסאפ";
      let telTooltip = firstName ? `חייג ל${firstName}` : "חייג";
      let histTooltip = "חיפוש היסטוריית משלוחים (נפתח במערכת Similar Orders)";

      const waBtn = el("a", { href: `https://wa.me/${waDigits}`, target: "whatsapp_window", className: "ani-action-btn has-tooltip", 'data-tooltip': waTooltip });
      waBtn.innerHTML = '<i class="fa-brands fa-whatsapp"></i>';
      waBtn.onclick = (e) => e.stopPropagation();

      const telBtn = el("a", { href: `tel:${digits}`, className: "ani-action-btn has-tooltip", 'data-tooltip': telTooltip });
      telBtn.innerHTML = '<i class="fa-light fa-mobile"></i>';
      telBtn.onclick = (e) => e.stopPropagation();

      const histBtn = el("a", { className: "ani-action-btn has-tooltip", 'data-tooltip': histTooltip });
      histBtn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i>';
      histBtn.onclick = (e) => {
          e.stopPropagation();
          document.dispatchEvent(new CustomEvent('OpenSimilarOrdersByPhone', { detail: { phone: dispPhone } }));
      };

      return el("span", { className: "ani-actions-container" }, [
          el("span", { textContent: dispPhone, style: { fontWeight: "600", color: "#0f172a", marginRight: "4px" } }),
          waBtn,
          telBtn,
          histBtn
      ]);
  }

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
              let valA = a.children[colIndex].dataset.sortVal || a.children[colIndex].textContent.trim();
              let valB = b.children[colIndex].dataset.sortVal || b.children[colIndex].textContent.trim();

              const scoreMap = {"🎯 פגיעה מושלמת": 4, "✅ תאריך מושלם": 3, "👍 קרוב לתחזית": 2, "⚠️ סטייה סבירה": 1};
              if (scoreMap[valA] && scoreMap[valB]) return isAsc ? scoreMap[valA] - scoreMap[valB] : scoreMap[valB] - scoreMap[valA];

              let numA = parseFloat(valA.replace(/\D.-/g, '')); let numB = parseFloat(valB.replace(/\D.-/g, ''));
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
      if (cell && cell.sortVal) td.dataset.sortVal = cell.sortVal;
      if (headerTexts[index]) td.setAttribute('data-label', headerTexts[index]); return td;
    }))));
    return el("table", { className: "ani-table" }, [thead, tbody]);
  }

  const rootDiv = el("div", { id: "anipet-pro-root", style: { display: "none" } });
  const headerDiv = el("div", { id: "anipet-pro-header" }, [
    el("div", { style: { display: "flex", alignItems: "center", gap: "12px" } }, [
      el("div", { textContent: "📦", style: { fontSize: "24px" } }),
      el("div", {}, [
        el("div", { textContent: "AniPet PRO · מערכת רכש", style: { fontSize: "16px", fontWeight: "700" } }),
        el("div", { textContent: "V2.12.7 - Action Icons CSS Fix (#007bff)", style: { fontSize: "12px", color: "#94a3b8" } })
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
  const toolbar = el("div", { className: "ani-toolbar", id: "main-toolbar" });

  const fbToolbar = el("div", { className: "ani-toolbar", id: "fb-toolbar", style: { display: "none", flexDirection: "row", alignItems: "center", gap: "16px" } });
  const fbDaysSel = el("select", { className: "ani-select", style: { width: "160px" } });
  [{v:0, l:'היום'}, {v:1, l:'מאתמול'}, {v:3, l:'3 ימים אחרונים'}, {v:7, l:'שבוע אחרון'}].forEach(o => fbDaysSel.appendChild(el("option", { value: o.v, textContent: o.l, selected: state.feedbackDaysBack === o.v })));
  fbDaysSel.onchange = () => { state.feedbackDaysBack = parseInt(fbDaysSel.value); loadFeedbackDataAndRender(); };
  fbToolbar.appendChild(el("div", { style: { display: "flex", alignItems: "center", gap: "8px" } }, [el("label", { className: "ani-label", textContent: "הצג הצלחות מתאריך:" }), fbDaysSel]));


  function switchView(mode, preventLoad = false) {
      state.viewMode = mode;
      document.getElementById('view-btn-products').classList.toggle('active', mode === 'products');
      document.getElementById('view-btn-customers').classList.toggle('active', mode === 'customers');
      document.getElementById('view-btn-feedback').classList.toggle('active', mode === 'feedback');

      if (mode === 'feedback') {
          toolbar.style.display = 'none';
          fbToolbar.style.display = 'flex';
          if (!preventLoad) loadFeedbackDataAndRender();
      } else {
          toolbar.style.display = 'flex';
          fbToolbar.style.display = 'none';
          document.getElementById('ms-supplier-wrap').style.display = mode === 'customers' ? 'none' : 'flex';
          if (!preventLoad) {
              fetchAllDataAndRender();
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
  document.addEventListener('click', (e) => {
      if (!e.target.closest('.ani-multi-select-wrapper')) {
          document.querySelectorAll('.ani-multi-select-dropdown').forEach(d => d.style.display = 'none');
      }
      if (!omniWrapper.contains(e.target)) omniList.style.display = "none";
  });

  function buildMultiSelect(options, stateKey, onChange) {
      const wrap = el("div", { className: "ani-multi-select-wrapper" });
      const btn = el("button", { className: "ani-select ani-multi-select-btn" });
      const drop = el("div", { className: "ani-multi-select-dropdown" });

      wrap.updateUI = (newOpts) => {
          if (newOpts) options = newOpts;
          drop.innerHTML = "";
          options.forEach(o => {
              const lbl = el("label", { className: "ani-multi-select-item" });
              const cb = el("input", { type: "checkbox", value: o.v, checked: state[stateKey].includes(o.v) });
              cb.onchange = (e) => {
                  if (o.v === 'all') { state[stateKey] = ['all']; }
                  else {
                      state[stateKey] = state[stateKey].filter(x => x !== 'all');
                      if (e.target.checked) state[stateKey].push(o.v);
                      else state[stateKey] = state[stateKey].filter(x => x !== o.v);
                      if (state[stateKey].length === 0) state[stateKey] = ['all'];
                  }
                  wrap.updateUI(); onChange();
              };
              lbl.appendChild(cb); lbl.appendChild(document.createTextNode(" " + o.l)); drop.appendChild(lbl);
          });
          if (state[stateKey].includes('all') || state[stateKey].length === 0) {
              btn.innerHTML = `<span>${options.find(o=>o.v==='all')?.l}</span> <i class="fa-solid fa-chevron-down" style="font-size:10px; color:#94a3b8;"></i>`;
          } else {
              btn.innerHTML = `<span style="color:#3b82f6; font-weight:bold;">${state[stateKey].length} נבחרו</span> <i class="fa-solid fa-chevron-down" style="font-size:10px; color:#94a3b8;"></i>`;
          }
      };
      wrap.updateUI();
      btn.onclick = (e) => {
          e.stopPropagation();
          const isOp = drop.style.display === 'block';
          document.querySelectorAll('.ani-multi-select-dropdown').forEach(d=>d.style.display='none');
          drop.style.display = isOp ? 'none' : 'block';
      };
      wrap.appendChild(btn); wrap.appendChild(drop);
      return wrap;
  }

  const presetsRow = el("div", { className: "ani-presets-container" });
  const controlsRow1 = el("div", { className: "ani-controls-row", style: { paddingBottom: "12px", borderBottom: "1px solid #f1f5f9" } });
  const controlsRow2 = el("div", { className: "ani-controls-row" });

  const inGrace = el("input", { type: "number", className: "ani-input", style: { width: "70px" }, value: state.graceDays });
  const inWindow = el("input", { type: "number", className: "ani-input", style: { width: "70px" }, value: state.windowDays });

  const msAnimal = buildMultiSelect([{v:'all', l:'🐾 כל החיות'}, {v:'dog', l:'🐶 כלבים'}, {v:'cat', l:'🐱 חתולים'}, {v:'rodent', l:'🐹 מכרסמים'}, {v:'bird', l:'🦜 ציפורים'}, {v:'other', l:'אחר'}], 'filterAnimal', () => { clearActivePreset(); renderCurrentView(); });
  const msType = buildMultiSelect([{v:'all', l:'🛍️ כל סוגי המוצרים'}, {v:'dry', l:'🥩 מזון יבש'}, {v:'wet', l:'🥫 מזון לח'}, {v:'treats', l:'🦴 חטיפים'}, {v:'litter', l:'✨ מצעים / חול'}, {v:'other', l:'אחר'}], 'filterType', () => { clearActivePreset(); renderCurrentView(); });
  const msStatus = buildMultiSelect([{v:'all', l:'📊 כל הסטטוסים'}, {v:'DANGER', l:'🚨 נטישה אפשרית'}, {v:'CRIT', l:'🔴 אזל (באיחור)'}, {v:'OUT', l:'⭕ אזל עכשיו'}, {v:'LOW', l:'🟠 לקראת סיום'}, {v:'WARNING', l:'🟡 תכף נגמר'}, {v:'OK', l:'🟢 תקין'}, {v:'HIGH', l:'🔵 עודף'}], 'filterCustomerStatus', () => { clearActivePreset(); renderCurrentView(); });
  const msRel = buildMultiSelect([{v:'all', l:'🎯 כל האמינויות'}, {v:'swiss', l:'⏱️ שעון שוויצרי'}, {v:'regular', l:'✓ סדיר'}, {v:'erratic', l:'🎲 כאוטי'}, {v:'sparse', l:'❓ מעט נתונים'}], 'filterCustomerRel', () => { clearActivePreset(); renderCurrentView(); });
  const msSupplier = buildMultiSelect([{v:'all', l:'🚚 כל הספקים'}], 'filterSupplier', () => { clearActivePreset(); renderCurrentView(); });

  function populateSuppliersDropdown() {
      const uniqueSups = [...new Set(Object.values(state.supplierMap))].filter(Boolean).sort();
      msSupplier.updateUI([{v:'all', l:'🚚 כל הספקים'}, ...uniqueSups.map(s => ({v:s, l:s}))]);
  }

  const selSort = el("select", { className: "ani-select", style: { width: "180px" } });
  [ {v:'smart', l:'מיון: דחוף וחשוב (SOS)'}, {v:'churn', l:'מיון: סכנת נטישה'}, {v:'upcoming', l:'מיון: קרוב להיום'}, {v:'volume_qty', l:'מיון: כמות מוצרים (יח)'}, {v:'volume', l:'מיון: כמות לקוחות'} ].forEach(o => selSort.appendChild(el("option", { value: o.v, textContent: o.l, selected: state.sortBy === o.v })));

  inGrace.onchange = () => { state.graceDays = parseInt(inGrace.value)||0; clearActivePreset(); fetchAllDataAndRender(); };
  inWindow.onchange = () => { state.windowDays = parseInt(inWindow.value)||0; clearActivePreset(); fetchAllDataAndRender(); };
  selSort.onchange = () => { state.sortBy = selSort.value; clearActivePreset(); renderCurrentView(); };

  function fetchAllDataAndRender() { fetchAllData(); }
  function renderCurrentView() { if(state.viewMode === 'products') renderMainList(); else renderCustomerList(); }

  function clearActivePreset() { state.activePreset = null; renderPresetsUI(); }
  function applyPreset(p) {
      state.activePreset = p.id;
      state.graceDays = p.grace; state.windowDays = p.window; state.sortBy = p.sort;
      state.filterCustomerStatus = [...(p.filterStatus || ['all'])];
      state.filterAnimal = [...(p.filterAnimal || ['all'])];
      state.filterType = [...(p.filterType || ['all'])];
      state.filterCustomerRel = [...(p.filterRel || ['all'])];
      state.filterSupplier = [...(p.filterSupplier || ['all'])];

      inGrace.value = p.grace; inWindow.value = p.window; selSort.value = p.sort;

      msAnimal.updateUI(); msType.updateUI(); msStatus.updateUI(); msRel.updateUI(); msSupplier.updateUI();
      renderPresetsUI(); fetchAllDataAndRender();
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
          const newPreset = { id: 'custom_' + Date.now(), label: name, grace: state.graceDays, window: state.windowDays, sort: state.sortBy, filterStatus: [...state.filterCustomerStatus], filterAnimal: [...state.filterAnimal], filterType: [...state.filterType], filterRel: [...state.filterCustomerRel], filterSupplier: [...state.filterSupplier] };
          state.customPresets.push(newPreset); saveCustomPresets(); state.activePreset = newPreset.id; renderPresetsUI();
      }});
      presetsRow.appendChild(saveBtn);
  }
  renderPresetsUI();

  toolbar.appendChild(omniWrapper);

  controlsRow1.appendChild(el("div", { className: "ani-input-group", style: { width: "130px" } }, [ el("label", { className: "ani-label has-tooltip", textContent: "סוג חיה", 'data-tooltip': "סנן לפי חיית המחמד של הלקוח" }), msAnimal ]));
  controlsRow1.appendChild(el("div", { className: "ani-input-group", style: { width: "140px" } }, [ el("label", { className: "ani-label has-tooltip", textContent: "סוג מוצר", 'data-tooltip': "סנן לפי קטגוריית המוצר (מזון, חול, שימורים)" }), msType ]));
  controlsRow1.appendChild(el("div", { className: "ani-input-group", style: { width: "150px" } }, [ el("label", { className: "ani-label has-tooltip", textContent: "סטטוס לקוח", 'data-tooltip': "מצב המלאי המשוער אצל הלקוח ברגע זה" }), msStatus ]));
  controlsRow1.appendChild(el("div", { className: "ani-input-group", style: { width: "150px" } }, [ el("label", { className: "ani-label has-tooltip", textContent: "רמת אמינות", 'data-tooltip': "עד כמה הלקוח צפוי וקבוע בקניות שלו? (סטיית תקן)" }), msRel ]));
  controlsRow1.appendChild(el("div", { className: "ani-input-group", style: { width: "150px" }, id: "ms-supplier-wrap" }, [ el("label", { className: "ani-label has-tooltip", textContent: "ספק מוצר", 'data-tooltip': "סינון מוצרים לפי הספק שלהם בקטלוג" }), msSupplier ]));
  controlsRow2.appendChild(el("div", { className: "ani-input-group" }, [ el("label", { className: "ani-label has-tooltip", textContent: "אחורה (איחור)", 'data-tooltip': "כמה ימים אחורה לחפש? (טריק: אם תכניס מספר שלילי כמו -7, התחזית תקפוץ ותתחיל רק מהשבוע הבא!)" }), inGrace ]));
  controlsRow2.appendChild(el("div", { className: "ani-input-group" }, [ el("label", { className: "ani-label has-tooltip", textContent: "קדימה (תחזית)", 'data-tooltip': "כמה ימים קדימה מהיום לחפש תחזיות עתידיות?" }), inWindow ]));

  const sortTooltipText = "<b>איך עובד המיון?</b><br>• <b>SOS:</b> שקלול של תאריך קרוב, אמינות הלקוח וכמות המוצר.<br>• <b>סכנת נטישה:</b> מיון לפי מי שנמצא באיחור הגדול ביותר.<br>• <b>קרוב להיום:</b> מיון פשוט לפי תאריך היעד הקרוב ביותר.<br>• <b>כמות יחידות/לקוחות:</b> מיון לפי נפח כדי לאתר מוצרים חמים.";
  controlsRow2.appendChild(el("div", { className: "ani-input-group" }, [ el("label", { className: "ani-label has-tooltip", textContent: "סדר תצוגה", 'data-tooltip': sortTooltipText }), selSort ]));

  toolbar.appendChild(presetsRow); toolbar.appendChild(controlsRow1); toolbar.appendChild(controlsRow2);
  const statusLine = el("div", { style: { display: "flex", alignItems: "center", gap: "10px", padding: "0 4px 16px 4px", fontSize: "13px", color: "#64748b", fontWeight: "500", justifyContent: "space-between" } });
  const statusLeft = el("div", { style: { display: "flex", alignItems: "center", gap: "10px" } });
  const statusRight = el("div", { id: "ani-sync-time", innerHTML: `שולף זמן סנכרון אחרון...` });
  statusLine.appendChild(statusLeft); statusLine.appendChild(statusRight);
  fetchLastSyncTime();
  const mainList = el("div", { style: { display: "flex", flexDirection: "column" } });

  bodyContent.appendChild(toolbar);
  bodyContent.appendChild(fbToolbar);
  bodyContent.appendChild(statusLine);
  bodyContent.appendChild(mainList);
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
      '<span class="has-tooltip" data-tooltip="רמת העקביות של הלקוח מחושבת על פי סטיית התקן של פערי הקניות (CV)">אמינות ❓</span>',
      '<span class="has-tooltip" data-tooltip="הסטטוס הנוכחי של המלאי אצל הלקוח בהתבסס על צפי הסיום">מלאי בבית</span>',
      '<span class="has-tooltip" data-tooltip="התאריך המשוער בו המוצר יסתיים לחלוטין וידרש חידוש (רחף לקבלת הסבר חישוב)">צפי סיום 🧮</span>',
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

  async function fetchAllData() {
      showMainSkeleton();
      setStatus(`טוען נתונים למערכת... (חלון זמן: ${state.graceDays} אחורה עד ${state.windowDays} קדימה)`);
      try {
          let graceDate = new Date(); graceDate.setDate(graceDate.getDate() - state.graceDays);
          let winDate = new Date(); winDate.setDate(winDate.getDate() + state.windowDays);
          const gStr = graceDate.toISOString().split('T')[0];
          const wStr = winDate.toISOString().split('T')[0];

          const url = `${SUPABASE_URL}/rest/v1/mv_forecast_engine_v3?next_expected_date=gte.${gStr}&next_expected_date=lte.${wStr}&limit=3000`;
          const res = await gmFetch(url, { headers: sbHeaders() });
          if(!res.ok) throw new Error("API responded with " + res.status);
          let rawData = tryParse(res.responseText) || [];

          const phonesArr = [...new Set(rawData.map(c => c.customer_phone))];
          let namesMap = {};
          if (phonesArr.length > 0) {
              for(let i=0; i<phonesArr.length; i+=200) {
                  const chunk = phonesArr.slice(i, i+200);
                  const namesRes = await gmFetch(`${SUPABASE_URL}/rest/v1/rpc/buyer_sku_shortages_raw_names`, { method: "POST", headers: sbHeaders(), body: JSON.stringify({ p_phones: chunk }) });
                  if(namesRes.ok) {
                      const nd = tryParse(namesRes.responseText) || [];
                      nd.forEach(n => namesMap[n.p9] = n);
                  }
              }
          }

          state.allRawData = rawData.map(r => {
             const n = namesMap[r.customer_phone];
             return {
                 ...r,
                 customer_name: n ? n.c_name : 'לקוח לא ידוע',
                 customer_addr: n ? [n.c_city, n.c_address].filter(Boolean).join(" - ") : ''
             };
          });

          const allSkus = [...new Set(state.allRawData.map(s => s.recommend_sku).filter(Boolean))];
          await fetchMetaForSkus(allSkus);
          renderCurrentView();

      } catch(e) {
          console.error("AniPet Data Fetch Error: ", e);
          setStatus(`שגיאה בטעינת הנתונים: ${e.message}`, true);
      }
  }

  function renderMainList() {
    mainList.innerHTML = "";
    if (!state.allRawData || !state.allRawData.length) { mainList.appendChild(el("div", { textContent: "אין נתונים מהשרת לחלון הזמן הנוכחי.", style: { color: "#94a3b8", textAlign: "center", padding: "40px", fontSize: "16px" } })); return; }

    let filteredRows = state.allRawData.filter(r => {
        const info = parseCategoryInfo(r.category_key);
        const sSup = state.supplierMap[r.recommend_sku] || state.supplierMap[r.item_name];
        const relStatus = getReliabilityCategory(r.cv_percentage);

        if (r.avg_gap_days > 100) return false;

        if (!state.filterAnimal.includes('all') && !state.filterAnimal.includes(info.animal)) return false;
        if (!state.filterType.includes('all') && !state.filterType.includes(info.type)) return false;
        if (!state.filterSupplier.includes('all') && !state.filterSupplier.includes(sSup)) return false;
        if (!state.filterCustomerStatus.includes('all') && !state.filterCustomerStatus.includes(r.dos_bucket)) return false;
        if (!state.filterCustomerRel.includes('all') && !state.filterCustomerRel.includes(relStatus)) return false;

        return true;
    });

    if (filteredRows.length === 0) { mainList.appendChild(el("div", { textContent: "אין מוצרים העונים לתנאי הסינון.", style: { color: "#94a3b8", textAlign: "center", padding: "40px", fontSize: "16px" } })); return; }

    const skuMap = {};
    const todayStr = new Date().toISOString().split('T')[0];

    filteredRows.forEach(r => {
        if (!skuMap[r.recommend_sku]) {
            skuMap[r.recommend_sku] = {
                recommend_sku: r.recommend_sku,
                product_name: r.item_name,
                category_key: r.category_key,
                total_customers: 0,
                late_customers: 0,
                future_customers: 0,
                nearest_due_date: '2099-01-01',
                total_expected_qty: 0,
                total_expected_weight: 0,
                reliable_customers: 0,
                customers: []
            };
        }
        const s = skuMap[r.recommend_sku];
        s.total_customers++;

        if (r.next_expected_date < todayStr) s.late_customers++;
        else s.future_customers++;

        if (r.next_expected_date < s.nearest_due_date) s.nearest_due_date = r.next_expected_date;

        s.total_expected_qty += Number(r.expected_qty || 0);
        s.total_expected_weight += (Number(r.expected_qty || 0) * Number(r.pack_weight || 1));

        if (getReliabilityCategory(r.cv_percentage) !== 'erratic' && getReliabilityCategory(r.cv_percentage) !== 'sparse') {
             s.reliable_customers++;
        }

        s.customers.push(r);
    });

    let aggregatedSkus = Object.values(skuMap);

    aggregatedSkus = aggregatedSkus.filter(s => {
        let isImportant = true;
        if ((state.activePreset === 'buyer_action' || state.sortBy === 'smart') && !state.filterCustomerRel.includes('swiss')) {
             if (s.total_expected_weight < 3 && s.reliable_customers === 0) isImportant = false;
        }
        return isImportant;
    });

    if (aggregatedSkus.length === 0) { mainList.appendChild(el("div", { textContent: "המוצרים סוננו על ידי מנגנון ה-SOS (רעשי רקע ללא לקוחות אמינים).", style: { color: "#94a3b8", textAlign: "center", padding: "40px", fontSize: "16px" } })); return; }

    const sortedSkus = aggregatedSkus.sort((a, b) => {
      const dA = new Date(a.nearest_due_date).setHours(0,0,0,0), dB = new Date(b.nearest_due_date).setHours(0,0,0,0), today = new Date().setHours(0,0,0,0);

      if (state.sortBy === 'smart') {
          const aRel = a.reliable_customers > 0 ? 1 : 0;
          const bRel = b.reliable_customers > 0 ? 1 : 0;
          if (aRel !== bRel) return bRel - aRel;

          if (Math.abs(a.total_expected_weight - b.total_expected_weight) > 2) return b.total_expected_weight - a.total_expected_weight;
          return dA - dB;
      } else if (state.sortBy === 'churn') return dA - dB;
      else if (state.sortBy === 'upcoming') return Math.abs(dA - today) - Math.abs(dB - today);
      else if (state.sortBy === 'volume_qty') return b.total_expected_qty - a.total_expected_qty;
      else return b.total_customers - a.total_customers;
    });

    state.currentDisplayedSkus = sortedSkus;

    setStatus(`מציג ${sortedSkus.length} מוצרים בהתאם לסינון הדינמי.`);
    for (const s of sortedSkus) mainList.appendChild(buildSkuCard(s));
  }

  function buildSkuCard(s, isSearchMode = false) {
      const card = el("div", { className: "ani-card" });
      const badgeList = [];
      const totalQty = s.total_expected_qty ? Number(s.total_expected_qty).toFixed(0) : (s.total_customers||0);

      let customerCountText = s.total_customers||0;
      let inWindowText = s.future_customers||0;
      let lateText = s.late_customers||0;

      if (!isSearchMode) {
          badgeList.push(el("span", { className: "ani-badge badge-green has-tooltip", 'data-tooltip': "מספר הלקוחות הצפויים לסיים את המלאי בחלון הזמן (לא כולל איחורים)", innerHTML: `<i class="fa-regular fa-calendar-check" style="margin-left:4px;"></i>צפי עתידי: <b>${inWindowText}</b>` }));
          if (lateText > 0) badgeList.push(el("span", { className: "ani-badge badge-red has-tooltip", 'data-tooltip': "מתוך הלקוחות שמוצגים, כמה מהם כבר עברו את תאריך היעד המשוער שלהם", innerHTML: `<i class="fa-solid fa-clock-rotate-left" style="margin-left:4px;"></i>איחורים: <b>${lateText}</b>` }));

          badgeList.push(el("span", { textContent: "|", style: { color: "#cbd5e1" } }));
          badgeList.push(el("span", { className: "ani-badge badge-purple has-tooltip", 'data-tooltip': "צפי יחידות כולל בטווח הזמן", innerHTML: `<i class="fa-solid fa-box" style="margin-left:5px;"></i> ${totalQty} יח'` }));
          if (s.total_expected_weight > 0) {
              let displayWeight = s.total_expected_weight < 1 ? `${Math.round(s.total_expected_weight * 1000)} גרם` : `${Number(s.total_expected_weight).toFixed(2).replace(/\.?0+$/, '')} ק"ג/ל'`;
              badgeList.push(el("span", { className: "ani-badge badge-blue has-tooltip", 'data-tooltip': "צפי משקל או נפח כולל", innerHTML: `<i class="fa-solid fa-scale-balanced" style="margin-left:5px;"></i> ${displayWeight}` }));
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
          src: getThumbnailUrl(rawImgUrl), loading: "lazy",
          style: { width: "50px", height: "50px", objectFit: "contain", borderRadius: "6px", border: "1px solid #e2e8f0", background: "#fff" },
          onerror: function() { if(!this.dataset.fallbackTriggered && rawImgUrl) { this.dataset.fallbackTriggered = 'true'; this.src = rawImgUrl; } }
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
            if (!isLoaded) { cBody.innerHTML = ""; cBody.appendChild(createSkeletonTable()); await renderCustomersForSku(s.customers, cBody); isLoaded = true; }
        }
      };
      card.appendChild(el("div", { className: "ani-card-header" }, [titleAreaWithImage, btnToggle]));
      card.appendChild(cBody);
      return card;
  }

  async function renderCustomersForSku(users, containerElement) {
      try {
          let ordersMap = {};

          // ✨ חילוץ היסטוריה נפרד ומדויק לכל קטגוריה ולקוח!
          let fetchKeys = [];
          let uniquePairs = new Set();
          users.forEach(u => {
              let k = u.customer_phone + '|' + u.category_key;
              if(!uniquePairs.has(k)) {
                  uniquePairs.add(k);
                  fetchKeys.push({phone: u.customer_phone, cat: u.category_key});
              }
          });

          try {
              const orderPromises = fetchKeys.map(fk => gmFetch(`${SUPABASE_URL}/rest/v1/rpc/buyer_sku_shortages_raw_orders_single`, { method: "POST", headers: sbHeaders(), body: JSON.stringify({ p_phone: fk.phone, p_category: fk.cat }) }).then(r => {
                  let parsed = tryParse(r.responseText);
                  if (!Array.isArray(parsed)) return [];
                  return parsed.map(x => ({ p9: fk.phone, cat: fk.cat, o_date: x.o_date, qty: x.qty }));
              }).catch(()=>[]));

              const ordersRaw = (await Promise.all(orderPromises)).flat();
              for (const o of ordersRaw) {
                  let k = o.p9 + '|' + o.cat;
                  if (!ordersMap[k]) ordersMap[k] = [];
                  ordersMap[k].push({ date: new Date(o.o_date), qty: Number(o.qty) });
              }
          } catch(e) {}

          users.sort((a,b) => new Date(a.next_expected_date) - new Date(b.next_expected_date));

          let custRows = [];
          for (const u of users) {
              const p9 = u.customer_phone;
              const displayPhone = (p9 && p9.length === 9 && !p9.startsWith('0')) ? '0' + p9 : p9;

              let k = p9 + '|' + u.category_key;
              let rawUOrders = ordersMap[k] || [];
              let dMap = {};
              rawUOrders.forEach(o => { let dStr = o.date.getTime(); if(!dMap[dStr]) dMap[dStr] = { date: o.date, qty: 0 }; dMap[dStr].qty += o.qty; });
              let uOrders = Object.values(dMap).sort((a,b)=>b.date-a.date);

              let anomalyBadge = badge("יציב", "gray", "ממוצע תואם להזמנה");
              let relBadge = getReliabilityBadge(u.cv_percentage);
              let lastDate = null; let lastQtyUnits;
              let avgGapStr = u.avg_gap_days ? `~ כל ${u.avg_gap_days} ימים` : "לא ידוע";

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
                      let diffUnitsAbs = Math.abs(diffUnits);

                      if (diffUnitsAbs >= 1) {
                          let diffStr = `${diffUnitsAbs} יח'`;
                          if (weightMultiplier && weightMultiplier !== 1) {
                              let w = diffUnitsAbs * weightMultiplier;
                              let wStr = w < 1 ? `${Math.round(w * 1000)} גרם` : `${Number(w).toFixed(2).replace(/\.?0+$/, '')} ק"ג`;
                              diffStr += ` (${wStr})`;
                          }
                          if (lastQtyUnits < avgQtyUnitsRaw) {
                               anomalyBadge = badge(`▼ חסר ${diffStr}`, "red", `הזמנה אחרונה: ${lastQtyUnits} יח' | ממוצע: ${avgQtyUnits} יח'`);
                          } else if (lastQtyUnits > avgQtyUnitsRaw) {
                              anomalyBadge = badge(`▲ עודף ${diffStr}`, "green", `הזמנה אחרונה: ${lastQtyUnits} יח' | ממוצע: ${avgQtyUnits} יח'`);
                          }
                      }
                  }
              }

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

              let isFood = ['dog_food', 'cat_food', 'cat_wet_food', 'dog_wet_food'].includes(u.category_key);
              let logicTxt = isFood ? "חישוב מואץ (הנחת 90% סיום שק)" : "חישוב משקל קטגוריאלי מלא (100%)";

              let lastDateObj = new Date(lastDate);
              let nextDateObj = new Date(u.next_expected_date);
              let daysTotal = (nextDateObj - lastDateObj) / (1000*60*60*24);
              let offsetDays = Math.max(0, Math.round(daysTotal - u.dos_days));

              let totalWeightDisplay = u.total_category_weight < 1 ? `${Math.round(u.total_category_weight * 1000)} גרם` : `${Number(u.total_category_weight).toFixed(2).replace(/\.?0+$/, '')} ק"ג/ל'`;

              let explainText = `<div style="font-size:14px; font-weight:bold; margin-bottom:8px; border-bottom:1px solid #475569; padding-bottom:4px;">מנוע V7 - איך חושב?</div>`;
              explainText += `<div style="margin-bottom:4px;">📦 <b>הזמנה אחרונה:</b> סך הכל ${totalWeightDisplay} בקטגוריה</div>`;
              explainText += `<div style="margin-bottom:4px;">⚙️ <b>שיטה:</b> ${logicTxt}</div>`;
              explainText += `<div style="margin-bottom:4px;">⏱️ <b>זמן למלאי נטו:</b> ${u.dos_days} ימים</div>`;
              explainText += `<div style="margin-bottom:8px;">🛡️ <b>מקדם ביטחון:</b> הוספו כ-${offsetDays} ימים</div>`;
              explainText += `<div style="background:rgba(255,255,255,0.1); padding:4px; border-radius:4px; font-weight:bold; color:#fde047;">תאריך היעד: ${fmtDate(u.next_expected_date)}</div>`;

              const exactDateStr = fmtDate(u.next_expected_date);
              const rangeStr = getDateRangeStr(u.next_expected_date, u.cv_percentage);
              const dateNodeInner = el("div", {style:{display:"flex", flexDirection:"column", alignItems:"center", whiteSpace:"nowrap", lineHeight:"1.3"}});
              dateNodeInner.appendChild(el("span", {className:"has-tooltip", "data-tooltip": explainText, style: { color: "#0f172a", fontWeight: "600" }, textContent: exactDateStr}));
              dateNodeInner.appendChild(el("span", {style: {fontSize:"11px", color:"#64748b"}, textContent: `(${rangeStr})`}));

              let dateNode = asNode(dateNodeInner);
              dateNode.sortVal = u.next_expected_date;

              const infoBtn = el("button", { className: "ani-btn has-tooltip", 'data-tooltip': 'היסטוריית פריטים', innerHTML: '👁️', style: { padding: "4px 8px", fontSize: "14px", border: "none", background: "#f1f5f9" } });
              const cName = u.customer_name;

              infoBtn.onclick = () => fetchHistoryDirect(p9, u.category_key, cName, infoBtn);
              const dateCell = el("div", { style: { display: "flex", alignItems: "center", gap: "8px" } }, [ el("span", { textContent: fmtDate(lastDate) }), infoBtn ]);
              let recentOrdersCount = 0;
              const halfYearAgo = new Date(); halfYearAgo.setMonth(halfYearAgo.getMonth() - 6);
              uOrders.forEach(o => { if (o.date >= halfYearAgo) recentOrdersCount++; });

              let pNode = asNode(getPhoneNode(displayPhone, cName));
              pNode.sortVal = displayPhone;

              custRows.push([
                pNode, cName, u.customer_addr || "",
                asNode(badge(t(u.category_key), "gray")), asNode(dateCell),
                asNode(el("span", { className: "has-tooltip", 'data-tooltip': 'קצב רכישה ממוצע' }, [avgGapStr])),
                asNode(anomalyBadge), asNode(relBadge), asNode(statusBadgeNode), asNode(dateNode), asNode(expectedQtyNode),
                asNode(el("span", { className: "has-tooltip", 'data-tooltip': `סה״כ ${uOrders.length} הזמנות אי פעם`}, [`${recentOrdersCount} (בחצי שנה)`]))
              ]);
          }

          const tblContainer = el("div", { className: "table-responsive" });
          tblContainer.appendChild(table(custTableHeaders, custRows));
          const skel = containerElement.querySelector('.ani-skeleton-wrapper');
          if (skel) skel.remove();
          containerElement.appendChild(tblContainer);
      } catch(e) { containerElement.innerHTML = "<div style='padding:16px; color:red;'>שגיאה בשליפת היסטוריית לקוחות</div>"; }
  }


  function renderCustomerList() {
      mainList.innerHTML = "";
      if(!state.allRawData || !state.allRawData.length) { mainList.appendChild(el("div", { textContent: "אין לקוחות בחלון הזמן הזה.", style: { textAlign: "center", padding: "40px" } })); return; }

      const cMap = {};
      state.allRawData.forEach(r => {
          if(!cMap[r.customer_phone]) cMap[r.customer_phone] = { phone: r.customer_phone, name: r.customer_name, addr: r.customer_addr, categories: [] };
          cMap[r.customer_phone].categories.push(r);
      });
      let allCustomers = Object.values(cMap);

      let filtered = allCustomers.filter(c => {
          let keep = false;
          for(const cat of c.categories) {
              const info = parseCategoryInfo(cat.category_key);
              const relStatus = getReliabilityCategory(cat.cv_percentage);

              if (cat.avg_gap_days > 100) continue;

              const mAnimal = state.filterAnimal.includes('all') || state.filterAnimal.includes(info.animal);
              const mType = state.filterType.includes('all') || state.filterType.includes(info.type);
              const mStat = state.filterCustomerStatus.includes('all') || state.filterCustomerStatus.includes(cat.dos_bucket);
              const mRel = state.filterCustomerRel.includes('all') || state.filterCustomerRel.includes(relStatus);

              if (mAnimal && mType && mStat && mRel) keep = true;
          }
          return keep;
      });

      filtered.forEach(c => {
          let nearest = new Date('2099-01-01');
          c.categories.forEach(cat => { let d = new Date(cat.next_expected_date); if(d < nearest) nearest = d; });
          c.nearest = nearest;
      });
      filtered.sort((a,b) => a.nearest - b.nearest);
      state.currentDisplayedCustomers = filtered;

      setStatus(`מציג ${filtered.length} לקוחות שצריכים הזמנה.`);
      filtered.forEach(c => { mainList.appendChild(buildCustomerCard(c.phone, c.name, c.addr, c.categories, false)); });
  }

  function buildCustomerCard(phone, name, addr, categories, autoOpen = false) {
      const card = el("div", { className: "ani-card" });
      const dispPhone = phone.startsWith('0') ? phone : '0'+phone;

      let worstStat = 'OK';
      const statRank = {'DANGER':1, 'CRIT':2, 'OUT':3, 'LOW':4, 'WARNING':5, 'OK':6, 'HIGH':7};

      let validCategories = categories.filter(c => getReliabilityCategory(c.cv_percentage) !== 'sparse' && c.avg_gap_days <= 100);
      if (validCategories.length === 0) {
          validCategories = categories;
      }
      validCategories.forEach(c => {
          if(statRank[c.dos_bucket] < statRank[worstStat]) worstStat = c.dos_bucket;
      });

      const dosInfo = DOS_MAP[worstStat] || { label: worstStat, type: 'gray' };
      const titleArea = el("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } }, [
        el("div", { style: { display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" } }, [
          el("span", { textContent: `👤 ${name}`, style: { fontSize: "16px", fontWeight: "700", color: "#0f172a" } }),
          getPhoneNode(dispPhone, name),
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
            if (!isLoaded) { cBody.innerHTML = ""; cBody.appendChild(createSkeletonTable()); await renderCustomersForSku(categories, cBody); isLoaded = true; }
        }
      };

      if(autoOpen) { cBody.appendChild(createSkeletonTable()); renderCustomersForSku(categories, cBody); isLoaded = true; }
      card.appendChild(el("div", { className: "ani-card-header" }, [titleArea, btnToggle]));
      card.appendChild(cBody);
      return card;
  }

  // ============== FEEDBACK LOOP VIEW ==============
  async function loadFeedbackDataAndRender() {
      showMainSkeleton();
      setStatus(`שואב נתוני בקרה - בודק את הדיוק של התחזיות עבור הזמנות שסופקו...`);
      try {
          const url = `${SUPABASE_URL}/rest/v1/rpc/buyer_predictions_feedback_loop`;
          const res = await gmFetch(url, { method: "POST", headers: sbHeaders(), body: JSON.stringify({ p_days_back: state.feedbackDaysBack }) });
          if(!res.ok) throw new Error("Error fetching feedback: " + res.responseText);
          const feedbackData = tryParse(res.responseText) || [];

          if(feedbackData.length === 0) {
              mainList.innerHTML = "";
              mainList.appendChild(el("div", { textContent: "לא נמצאו תחזיות שהתגשמו בחלון הזמן הנבחר.", style: { textAlign: "center", padding: "40px", color: "#94a3b8" } }));
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
      } catch(e) {
          setStatus("שגיאה בשליפת נתוני בקרה.", true);
          console.error(e);
      }
  }

  function renderFeedbackList(data, namesMap) {
      mainList.innerHTML = "";

      data.sort((a,b) => {
          let dateA = new Date(a.actual_order_date);
          let dateB = new Date(b.actual_order_date);
          if (dateA > dateB) return -1;
          if (dateA < dateB) return 1;
          return Math.abs(a.days_off) - Math.abs(b.days_off);
      });

      setStatus(`מציג ${data.length} לקוחות שחזרו לרכוש ונמצאו במודל. (ניתן למיין על ידי לחיצה על כותרות הטבלה)`);

      const headers = [
          "לקוח", "מוצר (מייצג סל)", "קטגוריה", "תאריך בפועל", "תאריך חזוי", "סטיית ימים", "כמות בפועל", "כמות חזויה", "דיוק 🎯"
      ];

      const rows = data.map(row => {
          let dispPhone = row.customer_phone.startsWith('0') ? row.customer_phone : '0' + row.customer_phone;
          let name = namesMap[row.customer_phone] || dispPhone;
          let diffColor = row.days_off > 0 ? "red" : "green";
          let diffText = row.days_off === 0 ? "ביום המדויק!" : (row.days_off > 0 ? `איחר ב-${row.days_off} ימים` : `הקדים ב-${Math.abs(row.days_off)} ימים`);

          let scoreNode;
          if (row.accuracy_score === 'BULLSEYE') scoreNode = el("span", { className: "score-bullseye has-tooltip", "data-tooltip": "פגענו בדיוק בתאריך (עד 3 ימים) ובכמות!"}, ["🎯 פגיעה מושלמת"]);
          else if (row.accuracy_score === 'DATE_PERFECT') scoreNode = el("span", { className: "score-perfect has-tooltip", "data-tooltip": "הזמין בדיוק מתי שחשבנו (עד 3 ימים)"}, ["✅ תאריך מושלם"]);
          else if (row.accuracy_score === 'GOOD') scoreNode = el("span", { className: "score-good has-tooltip", "data-tooltip": "סטייה קלה (עד שבוע)"}, ["👍 קרוב לתחזית"]);
          else scoreNode = el("span", { className: "score-acceptable has-tooltip", "data-tooltip": "סטייה בינונית (8-14 ימים - ייתכן מלאי חיצוני)"}, ["⚠️ סטייה סבירה"]);

          let nameCell = el("div", {style:{display:"flex", alignItems:"center", gap:"8px"}});
          nameCell.appendChild(el("span", {textContent: name, style: {fontWeight:"600", color: "#0f172a"}}));
          if(namesMap[row.customer_phone]) {
               nameCell.appendChild(getPhoneNode(dispPhone, name));
          }
          let nameNode = asNode(nameCell);
          nameNode.sortVal = name;

          return [
              nameNode,
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

  async function searchProductBySku(sku, name, catName) {
      switchView('products', true);
      showMainSkeleton();
      setStatus(`מציג תוצאות חיפוש-על עבור מוצר: ${name || 'מוצר ללא שם'}`);

      try {
          const url = `${SUPABASE_URL}/rest/v1/mv_forecast_engine_v3?recommend_sku=eq.${sku}&limit=1000`;
          const res = await gmFetch(url, { headers: sbHeaders() });
          let users = tryParse(res.responseText) || [];

          if(users.length === 0) {
              mainList.innerHTML = `<div style="padding:40px; text-align:center; color:#94a3b8;">לא נמצאה תחזית עתידית פעילה ללקוחות במוצר זה.</div>`;
              return;
          }

          const phonesArr = [...new Set(users.map(c => c.customer_phone))];
          let namesMap = {};
          if (phonesArr.length > 0) {
              const namesRes = await gmFetch(`${SUPABASE_URL}/rest/v1/rpc/buyer_sku_shortages_raw_names`, { method: "POST", headers: sbHeaders(), body: JSON.stringify({ p_phones: phonesArr }) });
              if(namesRes.ok) tryParse(namesRes.responseText).forEach(n => namesMap[n.p9] = n);
          }
          users = users.map(u => ({...u, customer_name: namesMap[u.customer_phone]?.c_name, customer_addr: [namesMap[u.customer_phone]?.c_city, namesMap[u.customer_phone]?.c_address].filter(Boolean).join(" - ")}));

          const card = buildSkuCard({ recommend_sku: sku, product_name: name, category_key: users[0].category_key, total_customers: users.length, total_expected_qty: users.reduce((acc,u)=>acc+Number(u.expected_qty),0), customers: users }, true);
          mainList.innerHTML = ""; mainList.appendChild(card);
          const cBody = card.querySelector('.ani-card-body');
          const btnToggle = card.querySelector('.ani-btn');
          cBody.classList.add('open'); btnToggle.textContent = "סגור רשימה";
          cBody.appendChild(createSkeletonTable());
          await renderCustomersForSku(users, cBody);
      } catch(e) {}
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

          const enrichedData = data.map(d => ({...d, customer_name: cName, customer_addr: cAddr}));
          setStatus(`מציג פרופיל מלא עבור: ${cName}`);
          mainList.appendChild(buildCustomerCard(p9, cName, cAddr, enrichedData, true));
      });
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