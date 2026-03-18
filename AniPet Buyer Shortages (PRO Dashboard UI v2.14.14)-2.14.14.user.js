// ==UserScript==
// @name         AniPet Buyer Shortages (PRO Dashboard UI v2.14.14)
// @namespace    anipet.buyer
// @version      2.14.14
// @description  Hybrid V6-safe dashboard with fallback-aware reliability and hardened async/UI handling.
// @match        https://members.lionwheel.com/operator/store_visits*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      qgqpjlubdvxfzxjtocrh.supabase.co
// @connect      xfwxplrtetxlyvppfhaf.supabase.co
// @connect      wsrv.nl
// ==/UserScript==

(() => {
  "use strict";

  const css = `
    #anipet-pro-root *, .ani-modal-overlay * { box-sizing: border-box; }

    /* מגן על כל האייקונים שלנו מפני הדריסה של ליוןוויל שמכהה אותם לאפור */
    #anipet-pro-root i.fa-solid,
    #anipet-pro-root i.fa-light,
    #anipet-pro-root i.fa-regular,
    #anipet-pro-root i.fa-brands { color: inherit; font-size: inherit; }

    #anipet-pro-root { position: fixed; top: 16px; left: 0; right: 0; margin: 0 auto; z-index: 999999; background: #f8fafc; border-radius: 16px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04); width: min(1500px, calc(100vw - 32px)); max-height: calc(100vh - 32px); display: flex; flex-direction: column; font-family: system-ui, -apple-system, sans-serif; overflow: hidden; direction: rtl; border: 1px solid #e2e8f0; }
    #anipet-pro-header { background: linear-gradient(135deg, #0f172a, #1e293b); color: #fff; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; }
    #anipet-pro-body { padding: 16px 20px; overflow-y: auto; flex-grow: 1; position: relative; }
    .ani-view-toggle { display: flex; background: #334155; border-radius: 8px; overflow: hidden; padding: 4px; gap: 4px; }
    .ani-view-btn { background: transparent; border: none; color: #cbd5e1; padding: 6px 12px; font-size: 13px; font-weight: 600; cursor: pointer; border-radius: 6px; transition: 0.2s; }
    .ani-view-btn.active { background: #fff; color: #0f172a; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .ani-view-btn-special { color: #fde047; }
    .ani-view-btn-special.active { background: #fef08a; color: #854d0e; }
    .ani-excel-btn { background: #10b981; color: #fff; border: none; padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: bold; cursor: pointer; transition: 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px; }
    .ani-excel-btn:hover { background: #059669; }
    .ani-excel-btn-danger { background: #ef4444; }
    .ani-excel-btn-danger:hover { background: #dc2626; }
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

    /* כפתור ה-Chevron המעוצב */
    .ani-chevron-btn {
        background-color: #f3f6f9 !important;
        border-color: #e1e3ea !important;
        color: #3699ff !important;
        border-width: 1px !important;
        border-style: solid !important;
        border-radius: 8px;
        width: 36px;
        height: 36px;
        display: flex;
        justify-content: center;
        align-items: center;
        cursor: pointer;
        transition: all 0.2s ease;
        flex-shrink: 0;
        outline: none;
    }
    .ani-chevron-btn i { color: #3699ff !important; font-size: 16px !important; }
    .ani-chevron-btn:hover { background-color: #e1f0ff !important; }

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
    .ani-copyable { cursor: pointer !important; user-select: none; transition: color 0.15s ease, background-color 0.15s ease, border-color 0.15s ease, transform 0.1s ease; }
    .ani-copyable:hover { transform: translateY(-1px); }
    .ani-copy-text:hover { color: #0f172a !important; text-decoration: underline dotted; text-underline-offset: 3px; }
    .ani-inline-link { cursor: pointer !important; border-bottom: 1px dotted #94a3b8; width: fit-content; transition: color 0.15s ease, border-color 0.15s ease; }
    .ani-inline-link:hover { color: #0f172a !important; border-bottom-color: #0f172a; }
    .ani-copy-success, .ani-copy-success i { color: #15803d !important; border-color: #86efac !important; background: #ecfdf5 !important; }
    .ani-copy-error, .ani-copy-error i { color: #b91c1c !important; border-color: #fecaca !important; background: #fef2f2 !important; }
    .lw-thumb-badge { position: absolute; top: -6px; left: -6px; z-index: 3; min-width: 24px; height: 24px; padding: 0 6px; border-radius: 999px; border: 2px solid #fff; background: #000000a6; color: #fff; display: flex; align-items: center; justify-content: center; font-family: "Noto Sans Hebrew", Arial, sans-serif; font-weight: 700; font-size: 11px; line-height: 1; pointer-events: none; backdrop-filter: saturate(120%) blur(2px); }

    /* ====== CRM DROPDOWN STYLES ====== */
    .crm-dropdown-wrapper { position: relative; display: inline-block; z-index: 1; }
    .crm-dropdown-wrapper.open { z-index: 1000001; }
    .crm-dropdown-btn { display: flex; align-items: center; justify-content: space-between; gap: 6px; width: 130px; height: 38px; padding: 0 12px; border-radius: 5.46px; border: 1px solid rgba(0,0,0,0.1); cursor: pointer; font-size: 13px; font-family: "Noto Sans Hebrew", Poppins, Helvetica, sans-serif; font-weight: 400; transition: filter 0.15s ease-in-out; user-select: none; outline: none; }
    .crm-dropdown-btn:hover { filter: brightness(0.95); box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .crm-dropdown-btn i { color: inherit !important; font-size: 14px !important; margin: 0 !important; padding: 0 !important;}
    .crm-dropdown-menu { position: absolute; top: 100%; right: 0; margin-top: 4px; background: #fff; border: 1px solid #e2e8f0; border-radius: 6px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); z-index: 1000002; min-width: 140px; overflow: hidden; display: none; padding: 0; list-style: none; }
    .crm-dropdown-menu.portal-open { position: fixed; margin-top: 0; z-index: 2147483647; overflow-y: auto; }
    .crm-dropdown-menu.show { display: block; animation: fadeIn 0.1s ease-out; }
    .crm-dropdown-item { padding: 10px 12px; font-size: 13px; font-weight: 600; cursor: pointer; text-align: center; border-bottom: 1px solid rgba(0,0,0,0.05); transition: opacity 0.2s; }
    .crm-dropdown-item:last-child { border-bottom: none; }
    .crm-dropdown-item:hover { filter: brightness(0.92); }
    .ani-card.crm-dropdown-open { overflow: visible; }

    /* ====== ACTION BUTTON STYLES (FontAwesome) ====== */
    .ani-actions-container { display: inline-flex !important; align-items: center !important; gap: 6px !important; direction: rtl !important; }
    .ani-action-btn { display: inline-flex !important; align-items: center !important; justify-content: center !important; color: #3699ff !important; text-decoration: none !important; transition: color 0.2s ease-in-out !important; cursor: pointer !important; padding: 0 !important; margin: 0 !important; width: 22px !important; height: 22px !important; background: transparent !important; border: none !important; }
    .ani-action-btn i { color: #3699ff !important; font-size: 16px !important; line-height: 1 !important; display: block !important; margin: 0 !important; padding: 0 !important; }
    .ani-action-btn:hover, .ani-action-btn:hover i { color: #0056b3 !important; }
    .ani-action-btn.lwcn-btn { border: 1px solid rgba(17,24,39,0.15) !important; background: linear-gradient(180deg, #ffffff, #f7f7f9) !important; border-radius: 8px !important; width: 24px !important; height: 24px !important; }
    .ani-action-btn.lwcn-btn i { color: rgba(17,24,39,0.88) !important; font-size: 13px !important;}
    .ani-action-btn.lwcn-btn:hover { border-color: rgba(17,24,39,0.28) !important; box-shadow: 0 4px 8px rgba(0,0,0,0.1) !important;}

    /* הסגנון של הכפתור כשמזהים שיש הערה! */
    .ani-action-btn.lwcn-btn.lwcn-has-note { border-color: rgba(249,115,22,0.55) !important; background: rgba(255,189,46,0.22) !important; box-shadow: 0 0 0 2px rgba(249,115,22,0.16) !important; }
    .ani-action-btn.lwcn-btn.lwcn-has-note i { color: #F97316 !important; }
    @keyframes lwcnPulsePro { 0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(245,158,11,0.38); } 50% { transform: scale(1.035); box-shadow: 0 0 0 5px rgba(245,158,11,0.10); } 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(245,158,11,0.00); } }
    .ani-action-btn.lwcn-btn.lwcn-blink { animation: lwcnPulsePro 1.8s ease-in-out infinite !important; border-color: rgba(245,158,11,0.75) !important; }

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
    .ani-thumb-img { transition: opacity 0.2s ease, transform 0.1s ease; cursor: pointer; }
    .ani-thumb-img:hover { transform: scale(1.05); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
  `;
  const styleSheet = document.createElement("style");
  styleSheet.innerText = css;
  document.head.appendChild(styleSheet);

  const SCRIPT_NAME = "AniPet Buyer PRO";
  // שרת התחזיות
  const SUPABASE_URL = "https://qgqpjlubdvxfzxjtocrh.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFncXBqbHViZHZ4Znp4anRvY3JoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMjc1MTcsImV4cCI6MjA4NDcwMzUxN30.UBsJrTtys9Sf8u2q3Jm3Y2uLrq64NsnHP-D8irDgCLs";

  // שרת ההערות (ממנו נשאב עכשיו את האינדקס בעזרת הפונקציה הציבורית החדשה שיצרנו!)
  const NOTES_SB_URL = "https://xfwxplrtetxlyvppfhaf.supabase.co";
  const NOTES_SB_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhmd3hwbHJ0ZXR4bHl2cHBmaGFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5NjQyMjMsImV4cCI6MjA4MzU0MDIyM30.7rg-gAEUM0kCSD2QKLXjz9ZUkwAjzpeYnTPU8tDrHvA";

  const DOS_MAP = {
      'DANGER': { label: 'נטישה אפשרית 🚨', type: 'darkred', desc: 'המלאי הסתיים מזמן (עבר מעל שבוע), ייתכן שהלקוח קנה במקום אחר' },
      'CRIT': { label: 'באיחור (אזל)', type: 'red', desc: 'המלאי אזל לחלוטין ויש חריגה מתאריך ההזמנה הצפוי' },
      'OUT': { label: 'אזל עכשיו', type: 'red', desc: 'המלאי המשוער הסתיים היום' },
      'LOW': { label: 'לקראת סיום', type: 'orange', desc: 'המלאי צפוי להסתיים ביומיים הקרובים' },
      'WARNING': { label: 'תכף נגמר', type: 'orange', desc: 'המלאי צפוי להסתיים בשבועיים הקרובים, צפי הזמנה מתקרב' },
      'OK': { label: 'תקין (בתחזית)', type: 'green', desc: 'יש מלאי מספיק, אך הלקוח נכנס לטווח התחזית הקרובה' },
      'HIGH': { label: 'עודף מלאי', type: 'blue', desc: 'יש מלאי רב אצל הלקוח כרגע' }
  };

  const CRM_MAP = {
      'NONE': { label: 'טרם טופל', bg: '#EF8E96', text: '#000000' },
      'SENT': { label: 'נשלחה הודעה', bg: '#F5D34B', text: '#000000' },
      'SUCCESS': { label: 'הוזמן בהצלחה', bg: '#008000', text: '#FFFFFF' },
      'LATER': { label: 'יזמין בהמשך', bg: '#FFA500', text: '#000000' },
      'REJECT': { label: 'לא מעוניין', bg: '#AC7274', text: '#FFFFFF' },
      'BLOCKED': { label: 'חסום / נפטרה', bg: '#CBD2DC', text: '#000000' }
  };

  const I18N = {
    'cat_litter': '✨ מצעים / חול', 'cat_food': '🐱🥩 מזון יבש לחתול', 'dog_food': '🐶🥩 מזון יבש לכלב',
    'cat_wet_food': '🐱🥫 מזון לח לחתול', 'dog_wet_food': '🐶🥫 מזון לח לכלב', 'wet_cat_food': '🐱🥫 מזון לח לחתול',
    'wet_dog_food': '🐶🥫 מזון לח לכלב', 'dog_treats': '🐶🦴 חטיפים לכלב', 'cat_treats': '🐱🦴 חטיפים לחתול',
    'dog_treats_or_wet': '🐶🦴 חטיפים/מעדנים לכלב', 'cat_treats_or_wet': '🐱🦴 חטיפים/מעדנים לחתול',
    'rodent_food': '🐹🌾 מזון למכרסמים', 'bird_food': '🦜🌾 מזון לבעלי כנף', 'small_pet_food': '🐾🌾 מזון לחיות קטנות',
    'other': '📦 אחר', 'כללי': 'כללי'
  };
  function t(key) { return I18N[key] || key; }
  const DAY_MS = 24 * 60 * 60 * 1000;

  function startOfDayMs(dateInput = new Date()) {
    const d = new Date(dateInput);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function fmtDate(d) {
    if (!d) return "";
    const parts = String(d).split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    if (d.includes('T')) return d.split('T')[0].split('-').reverse().join('/');
    return String(d);
  }

  function getDateRangeStr(dateStr, cvPercentage, isFallback = false) {
      if (!dateStr) return "";
      if (isFallback) return "טווח משוער: ±7 ימים";
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

  function getReliabilityCategory(cv, isFallback = false) {
      if (isFallback) return 'fallback';
      if (cv === null || cv === undefined || cv === 0) return 'sparse';
      if (cv <= 20) return 'swiss';
      if (cv <= 45) return 'regular';
      return 'erratic';
  }

  function getReliabilityBadge(cv, isFallback = false) {
      if (isFallback) return badge("🛡️ רשת ביטחון", "blue", "ידוע קצב קנייה משוער, אך בגלל מיעוט הזמנות (3-5) המערכת הוסיפה 15 ימי ביטחון לתאריך כדי למנוע התראות שווא.");
      if (cv === null || cv === undefined || cv === 0) return badge("❓ מעט נתונים", "gray");
      if (cv <= 20) return badge("⏱️ שעון שוויצרי", "green", `סטיית קניות: ${cv}% (צפוי מאוד)`);
      if (cv <= 45) return badge("✓ סדיר", "gray", `סטיית קניות: ${cv}%`);
      return badge("🎲 כאוטי", "orange", `סטיית קניות: ${cv}% (קונה מתי שבא לו)`);
  }

  function parseCategoryInfo(catKey) {
      const key = String(catKey).toLowerCase();
      let animal = 'other'; let type = 'other';
      if (key.includes('dog')) animal = 'dog';
      else if (key.includes('cat')) animal = 'cat';
      else if (key.includes('bird')) animal = 'bird';
      else if (key.includes('rodent')) animal = 'rodent';

      if (key.includes('litter') || key.includes('sandy')) type = 'litter';
      else if (key.includes('treats')) type = 'treats';
      else if (key.includes('wet')) type = 'wet';
      else if (key.includes('food')) type = 'dry';

      return { animal, type };
  }

  const PRESETS_HARDCODED = [
    { id: 'buyer_action', label: '🛒 רכש SOS', grace: 7, window: 7, sort: 'smart', filterStatus: ['OUT', 'CRIT', 'LOW', 'WARNING'], filterAnimal: ['all'], filterType: ['all'], filterRel: ['swiss', 'regular', 'fallback'], filterSupplier: ['all'], tooltip: "SOS אגרסיבי: 7 ימים אחורה/קדימה, רק לקוחות בסיכון ותחזיות אמינות." },
    { id: 'today', label: '📅 תחזית להיום', grace: 0, window: 0, sort: 'smart', filterStatus: ['all'], filterAnimal: ['all'], filterType: ['all'], filterRel: ['all'], filterSupplier: ['all'], tooltip: "מי אמור להזמין בדיוק היום" },
    { id: 'upcoming', label: '🔭 תחזית (חודש)', grace: 0, window: 30, sort: 'upcoming', filterStatus: ['all'], filterAnimal: ['all'], filterType: ['all'], filterRel: ['all'], filterSupplier: ['all'], tooltip: "מבט רחוק: כל המוצרים שיידרשו בחודש הקרוב." },
    { id: 'vip', label: '💎 לקוחות ברזל', grace: 7, window: 14, sort: 'smart', filterStatus: ['all'], filterAnimal: ['all'], filterType: ['all'], filterRel: ['swiss'], filterSupplier: ['all'], tooltip: "הזמנה בטוחה: מציג אך ורק לקוחות מסוג 'שעון שוויצרי'." },
    { id: 'churn', label: '🔥 באיחור / נטישה', grace: 30, window: 0, sort: 'churn', filterStatus: ['DANGER'], filterAnimal: ['all'], filterType: ['all'], filterRel: ['all'], filterSupplier: ['all'], tooltip: "לקוחות שעברו את תאריך היעד שלהם ועדיין לא קנו." }
  ];

  const state = {
      viewMode: 'products', limit: 3000, sortBy: 'smart', graceDays: 7, windowDays: 7,
      filterAnimal: ['all'], filterType: ['all'], filterCustomerStatus: ['all'], filterCustomerRel: ['all'], filterSupplier: ['all'],
      allRawData: [], currentDisplayedSkus: [], currentDisplayedCustomers: [], imagesMap: {}, supplierMap: {}, crmMap: {}, activePreset: 'buyer_action', customPresets: [],
      feedbackDaysBack: 0, notesIndex: new Set(), requestTokens: { data: 0, omni: 0, customerSearch: 0, productSearch: 0 }
  };

  function loadCustomPresets() {
      try {
          let loaded = JSON.parse(GM_getValue('ani_custom_presets', '[]'));
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

  function saveCustomPresets() { GM_setValue('ani_custom_presets', JSON.stringify(state.customPresets)); }
  loadCustomPresets();

  function gmFetch(url, { method = "GET", headers = {}, body = null, timeout = 30000 } = {}) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
          method, url, headers, data: body, responseType: "text",
          onload: (res) => resolve({ ok: res.status >= 200 && res.status < 300, status: res.status, responseText: res.responseText }),
          onerror: (err) => reject(new Error(err?.error || err?.message || "Network request failed")),
          onabort: () => reject(new Error("Request aborted")),
          ontimeout: () => reject(new Error("Request timed out")),
          timeout
      });
    });
  }

  function sbHeaders() {
      return { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, Accept: "application/json", "Content-Type": "application/json" };
  }

  function tryParse(txt) { try { return JSON.parse(txt); } catch { return null; } }

  function beginRequest(channel) {
      state.requestTokens[channel] = (state.requestTokens[channel] || 0) + 1;
      return state.requestTokens[channel];
  }

  function isActiveRequest(channel, requestId) {
      return state.requestTokens[channel] === requestId;
  }

  function invalidateRequest(channel) {
      state.requestTokens[channel] = (state.requestTokens[channel] || 0) + 1;
  }

  function createIconText(iconClass, text, iconStyle = {}) {
      return el("span", { style: { display: "inline-flex", alignItems: "center", gap: "5px" } }, [
          el("i", { className: iconClass, style: iconStyle }),
          el("span", { textContent: text })
      ]);
  }

  function createCityAddressNode(city, addr, prefix = "") {
      const wrap = el("span");
      if (prefix) wrap.appendChild(document.createTextNode(prefix));
      if (city) {
          wrap.appendChild(el("b", { textContent: city }));
          if (addr) wrap.appendChild(document.createTextNode(` - ${addr}`));
      } else {
          wrap.appendChild(document.createTextNode(addr || "לא הוזנה כתובת"));
      }
      return wrap;
  }

  async function copyTextToClipboard(text) {
      const cleanText = String(text || "").trim();
      if (!cleanText) return false;
      try {
          if (navigator.clipboard?.writeText) {
              await navigator.clipboard.writeText(cleanText);
              return true;
          }
      } catch (e) {}
      try {
          const ta = el("textarea", { value: cleanText, style: { position: "fixed", opacity: "0", inset: "0", pointerEvents: "none" } });
          document.body.appendChild(ta);
          ta.focus();
          ta.select();
          const ok = document.execCommand('copy');
          ta.remove();
          return ok;
      } catch (e) {
          return false;
      }
  }

  function flashElementFeedback(node, html, variant = 'success', duration = 1500) {
      if (!node) return;
      if (!node.dataset.defaultHtml) node.dataset.defaultHtml = node.innerHTML;
      if (node.__feedbackTimer) clearTimeout(node.__feedbackTimer);
      node.innerHTML = html;
      node.classList.remove('ani-copy-success', 'ani-copy-error');
      node.classList.add(variant === 'error' ? 'ani-copy-error' : 'ani-copy-success');
      node.__feedbackTimer = setTimeout(() => {
          node.innerHTML = node.dataset.defaultHtml || "";
          node.classList.remove('ani-copy-success', 'ani-copy-error');
      }, duration);
  }

  function bindCopyable(node, getText, options = {}) {
      if (!node) return node;
      node.classList.add('ani-copyable');
      if (options.textMode) node.classList.add('ani-copy-text');
      if (options.tooltip) {
          node.classList.add('has-tooltip');
          node.setAttribute('data-tooltip', options.tooltip);
      }
      if (!node.dataset.defaultHtml) node.dataset.defaultHtml = node.innerHTML;
      node.onclick = async (e) => {
          e.stopPropagation();
          const text = typeof getText === 'function' ? getText() : getText;
          const ok = await copyTextToClipboard(text);
          flashElementFeedback(
              node,
              ok ? '<i class="fa-solid fa-check" style="margin-left:4px;"></i>הועתק!' : '<i class="fa-solid fa-triangle-exclamation" style="margin-left:4px;"></i>שגיאה',
              ok ? 'success' : 'error'
          );
      };
      return node;
  }

  function formatWeightKg(value) {
      const num = Number(value);
      if (!isFinite(num) || num <= 0) return '-';
      return `${Number(num).toFixed(2).replace(/\.?0+$/, '')} ק"ג`;
  }

  function buildHistoryWhatsappText(histData) {
      return histData.map(d => {
          const qty = d.qty || d.qty_raw || 1;
          const category = d.consumption_category ? t(d.consumption_category) : (d.category_name ? t(d.category_name) : "כללי");
          const weight = formatWeightKg(d.pack_value);
          return `${fmtDate(d.order_date || d.o_date)} - ${d.item_name || 'מוצר ללא שם'} - ${category} - ${qty} יחידה - ${weight}`;
      }).join('\n');
  }

  function isReliableForSmartSort(reliabilityCategory) {
      return reliabilityCategory === 'swiss' || reliabilityCategory === 'regular' || reliabilityCategory === 'fallback';
  }

  function computeSkuUrgencyScore(s, todayMs) {
      const focusDueMs = Number.isFinite(s.avg_reliable_due_ms) ? s.avg_reliable_due_ms : startOfDayMs(s.nearest_due_date);
      const daysDiff = Math.round((focusDueMs - todayMs) / DAY_MS);
      const volumeScore = s.reliable_customers * 10000;
      let bucketScore = 0;

      if (daysDiff === 0 || daysDiff === 1) bucketScore = 5000;
      else if (daysDiff >= 2 && daysDiff <= 4) bucketScore = 2200;
      else if (daysDiff === -1 || daysDiff === -2) bucketScore = 700;
      else if (daysDiff < -2) bucketScore = -7000;
      else if (daysDiff >= 5 && daysDiff <= 7) bucketScore = 400;
      else bucketScore = 0;

      const reliabilityTierBonus = (s.swiss_customers * 2000) + (s.regular_customers * 1000);
      const loyaltyBonus = (Number(s.total_loyalty_score) || 0) * 5;
      const weightTieBreaker = Math.min(Math.round(Number(s.total_expected_weight) || 0), 100);
      return volumeScore + bucketScore + reliabilityTierBonus + loyaltyBonus + weightTieBreaker;
  }

  function getThumbnailUrl(rawUrl) {
      if (!rawUrl) return "https://placehold.co/100x100/f8fafc/cbd5e1?text=📦";
      return `https://wsrv.nl/?url=${encodeURIComponent(rawUrl)}&w=100&h=100&fit=contain&we&output=webp`;
  }

  function getFullSizeImageUrl(thumbnailUrl) {
      try {
          if (!thumbnailUrl || typeof thumbnailUrl !== 'string') return '';
          if (thumbnailUrl.includes('cdn.modulus.co.il')) { return thumbnailUrl.split('?')[0]; }
          if (thumbnailUrl.includes('www.gag-lachayot.co.il')) { return thumbnailUrl.replace(/-\d+x\d+(\.[a-zA-Z0-9]+(?:[?#].*)?)$/, '$1').replace(/-\d+x\d+$/, ''); }
          if (thumbnailUrl.includes('www.all4pet.co.il')) { return thumbnailUrl.replace(/_small(\.[a-zA-Z0-9]+(?:[?#].*)?)$/, '$1').replace(/_small$/, ''); }
          if (thumbnailUrl.includes('d3m9l0v76dty0.cloudfront.net')) { return thumbnailUrl.replace('/show/', '/original/').replace('/index/', '/original/').replace('/large/', '/original/'); }
          if (thumbnailUrl.includes('d1ap4nwu2qb60l.cloudfront.net')) { return thumbnailUrl.split('?')[0]; }
          if (thumbnailUrl.includes('just4pet.co.il')) {
              const parts = thumbnailUrl.split('/'); const filenameWithQuery = parts.pop(); const filenameParts = filenameWithQuery.split('?');
              const filename = filenameParts[0]; const query = filenameParts.length > 1 ? `?${filenameParts[1]}` : '';
              if (filename.startsWith('tn_')) { return parts.join('/') + '/' + filename.substring(3) + query; }
          }
          if (thumbnailUrl.includes('speedog.co.il')) { return thumbnailUrl.replace(/-\d+x\d+(\.[a-zA-Z0-9]+(?:[?#].*)?)$/, '$1').replace(/-\d+x\d+$/, ''); }
          return thumbnailUrl;
      } catch (e) { return thumbnailUrl; }
  }

  function extractAndCleanImageUrl(thumbUrl) {
      let originalUrl = thumbUrl;
      try {
          if (thumbUrl.includes('wsrv.nl')) {
              const urlParam = new URL(thumbUrl).searchParams.get('url');
              if (urlParam) originalUrl = decodeURIComponent(urlParam);
          }
      } catch(e) {}
      return getFullSizeImageUrl(originalUrl);
  }

  async function copyImageToClipboard(imgElement, rawUrl) {
      const fullUrl = getFullSizeImageUrl(rawUrl || extractAndCleanImageUrl(imgElement.src));
      if (!fullUrl || fullUrl.includes('placehold.co')) return;
      const originalOpacity = imgElement.style.opacity; imgElement.style.opacity = '0.4'; setStatus("מוריד תמונה מלאה ללוח...");
      try {
          const proxyUrl = `https://wsrv.nl/?url=${encodeURIComponent(fullUrl)}&output=png&cors=1`;
          const response = await fetch(proxyUrl);
          if (!response.ok) throw new Error('Network response failed');
          const blob = await response.blob();
          await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
          setStatus("התמונה הועתקה ללוח בהצלחה! ✅"); setTimeout(() => setStatus("מוכן"), 3000);
      } catch (err) {
          setStatus("לא ניתן להעתיק תמונה ישירות. פותח בחלון חדש..."); window.open(fullUrl, '_blank'); setTimeout(() => setStatus("מוכן"), 3000);
      } finally { imgElement.style.opacity = originalOpacity; }
  }

  async function triggerManualRefresh() {
      const btn = document.getElementById('ani-refresh-btn'); if (!btn) return;
      const originalHtml = btn.innerHTML; btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> מרענן נתונים בשרת...`; btn.style.pointerEvents = 'none';
      try {
          const res = await gmFetch(`${SUPABASE_URL}/rest/v1/rpc/trigger_nightly_refresh`, {
              method: "POST",
              headers: sbHeaders(),
              body: "{}",
              timeout: 120000
          });
          if(res.ok) {
              btn.innerHTML = `<i class="fa-solid fa-check" style="color:#10b981;"></i> רענון הצליח! מושך נתונים...`;
              setTimeout(() => { fetchLastSyncTime(); fetchAllDataAndRender(); }, 1500);
          } else {
              btn.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color:#ef4444;"></i> שגיאה ברענון`;
              setTimeout(() => { btn.innerHTML = originalHtml; btn.style.pointerEvents = 'auto'; }, 3000);
          }
      } catch(e) {
          const msg = /timed out/i.test(String(e?.message || "")) ? 'הרענון לוקח יותר מהרגיל' : 'שגיאה בתקשורת';
          btn.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color:#ef4444;"></i> ${msg}`;
          setTimeout(() => { btn.innerHTML = originalHtml; btn.style.pointerEvents = 'auto'; }, 4000);
      }
  }

  async function fetchMetaForSkus(skus) {
      if (!skus || !skus.length) return;
      for (let i = 0; i < skus.length; i += 100) {
          const chunk = skus.slice(i, i + 100); const encodedChunk = encodeURIComponent(chunk.join(','));
          try {
              const [imgRes, supRes] = await Promise.all([
                  gmFetch(`${SUPABASE_URL}/rest/v1/anipet_sku_images_public?sku=in.(${encodedChunk})&select=sku,image_url`, { headers: sbHeaders() }),
                  gmFetch(`${SUPABASE_URL}/rest/v1/anipet_products_catalog_stage?or=(barcode.in.(${encodedChunk}),sku.in.(${encodedChunk}))&select=sku,barcode,supplier`, { headers: sbHeaders() })
              ]);
              if (imgRes.ok) { const data = tryParse(imgRes.responseText); if (data) data.forEach(item => { if (item.image_url) state.imagesMap[item.sku] = item.image_url; }); }
              if (supRes.ok) {
                  const data = tryParse(supRes.responseText);
                  if (data) data.forEach(item => { if (item.supplier) { if (item.sku) state.supplierMap[item.sku] = item.supplier; if (item.barcode) state.supplierMap[item.barcode] = item.supplier; } });
              }
          } catch(e) {}
      }
      populateSuppliersDropdown();
  }

  async function fetchLastSyncTime() {
      try {
          const res = await gmFetch(`${SUPABASE_URL}/rest/v1/v4_sync_status?select=last_refresh&id=eq.1`, { headers: sbHeaders() });
          const syncDiv = document.getElementById('ani-sync-time');
          if(res.ok) {
              const data = tryParse(res.responseText);
              if(data && data.length && data[0].last_refresh) {
                  const dt = new Date(data[0].last_refresh);
                  const dStr = `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear()} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
                  syncDiv.replaceChildren(
                      document.createTextNode("מנוע Hybrid V6 חושב לאחרונה: "),
                      el("b", { textContent: dStr }),
                      document.createTextNode(" "),
                      el("div", { id: "ani-refresh-btn", className: "sync-refresh-btn", title: "רענן מנוע תחזיות עכשיו", innerHTML: '<i class="fa-solid fa-arrows-rotate"></i> רענן ידנית' })
                  );
                  document.getElementById('ani-refresh-btn').onclick = triggerManualRefresh;
                  return;
              }
          }
          syncDiv.textContent = `לא נמצאו נתוני סנכרון למנוע Hybrid V6`;
      } catch(e){ document.getElementById('ani-sync-time').textContent = `שגיאה בשליפת זמן`; }
  }

  function exportToCsv() {
      let csv = '\uFEFF';
      if (state.viewMode === 'products') {
          csv += 'מוצר,מק"ט/ברקוד,קטגוריה,ספק,תאריך קרוב,לקוחות בחלון הזמן,יח להזמנה,משקל להזמנה\n';
          (state.currentDisplayedSkus || []).forEach(s => {
              csv += `${(s.product_name || "").replace(/,/g, ' ')},${s.recommend_sku || ""},${t(s.category_key) || ""},${state.supplierMap[s.recommend_sku] || ""},${fmtDate(s.nearest_due_date)},${s.total_customers || 0},${s.total_expected_qty ? Number(s.total_expected_qty).toFixed(0) : 0},${s.total_expected_weight ? Number(s.total_expected_weight).toFixed(2) : 0}\n`;
          });
      } else {
          csv += 'שם לקוח,טלפון,כתובת,קטגוריה,סטטוס,תאריך יעד,כמות משוערת\n';
          (state.currentDisplayedCustomers || []).forEach(c => {
              c.categories.forEach(cat => {
                  csv += `${(c.name || "").replace(/,/g, ' ')},${c.phone || ""},${(c.addr || "").replace(/,/g, ' ')},${t(cat.category_key)},${DOS_MAP[cat.dos_bucket]?.label || cat.dos_bucket},${fmtDate(cat.next_expected_date)},${Math.round(Number(cat.expected_qty || 1))}\n`;
              });
          });
      }
      const link = document.createElement("a");
      const blobUrl = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
      link.setAttribute("href", blobUrl);
      link.setAttribute("download", `AniPet_Forecast_${fmtDate(new Date().toISOString().split('T')[0])}.csv`);
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
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

  let activeCrmDropdown = null;

  function resetCrmDropdownMenu(menu) {
    if (!menu) return;
    menu.classList.remove('show', 'portal-open');
    menu.style.top = '';
    menu.style.left = '';
    menu.style.right = '';
    menu.style.minWidth = '';
    menu.style.maxHeight = '';
    if (menu.__crmHomeParent && menu.parentNode !== menu.__crmHomeParent) menu.__crmHomeParent.appendChild(menu);
  }

  function positionCrmDropdown(btn, menu) {
    if (!btn || !menu) return;
    const rect = btn.getBoundingClientRect();
    const gutter = 8;

    if (!menu.__crmHomeParent) menu.__crmHomeParent = menu.parentNode;
    if (menu.parentNode !== document.body) document.body.appendChild(menu);

    menu.classList.add('show', 'portal-open');
    menu.style.top = '0px';
    menu.style.left = '0px';
    menu.style.right = 'auto';
    menu.style.minWidth = `${Math.ceil(rect.width)}px`;

    const menuRect = menu.getBoundingClientRect();
    const openUp = rect.bottom + 4 + menuRect.height > window.innerHeight - gutter && rect.top - 4 - menuRect.height >= gutter;
    const availableHeight = openUp ? rect.top - gutter - 4 : window.innerHeight - rect.bottom - gutter - 4;
    const top = openUp
      ? Math.max(gutter, rect.top - Math.min(menuRect.height, Math.max(140, availableHeight)) - 4)
      : Math.min(window.innerHeight - gutter - menuRect.height, rect.bottom + 4);
    const left = Math.max(gutter, Math.min(rect.right - menuRect.width, window.innerWidth - gutter - menuRect.width));

    menu.style.top = `${Math.round(top)}px`;
    menu.style.left = `${Math.round(left)}px`;
    menu.style.maxHeight = `${Math.max(140, Math.floor(availableHeight))}px`;
  }

  function repositionActiveCrmDropdown() {
    if (!activeCrmDropdown) return;
    positionCrmDropdown(activeCrmDropdown.button, activeCrmDropdown.menu);
  }

  function closeAllCrmDropdowns() {
    document.querySelectorAll('.crm-dropdown-menu').forEach(m => m.classList.remove('show'));
    document.querySelectorAll('.crm-dropdown-wrapper.open').forEach(w => w.classList.remove('open'));
    document.querySelectorAll('.ani-card.crm-dropdown-open').forEach(card => card.classList.remove('crm-dropdown-open'));
    document.querySelectorAll('.crm-dropdown-menu.portal-open').forEach(resetCrmDropdownMenu);
    activeCrmDropdown = null;
  }

  document.addEventListener('click', closeAllCrmDropdowns);
  window.addEventListener('resize', repositionActiveCrmDropdown);
  window.addEventListener('scroll', repositionActiveCrmDropdown, true);

  // כפתורי הפעולה
  function getCommunicationActions(phone, name) {
      if (!phone) return document.createTextNode("");
      const dispPhone = phone.startsWith('0') ? phone : '0' + phone;
      let digits = dispPhone.replace(/\D/g, '');
      let waDigits = digits.startsWith('0') ? '972' + digits.substring(1) : digits;
      let firstName = name ? name.trim().split(' ')[0] : '';

      const waBtn = el("a", {
          href: `https://wa.me/${waDigits}`, target: "whatsapp_window", className: "ani-action-btn has-tooltip",
          'data-tooltip': firstName ? `וואטסאפ ל${firstName}` : "וואטסאפ", innerHTML: '<i class="fa-brands fa-whatsapp"></i>'
      });
      waBtn.onclick = (e) => e.stopPropagation();

      const telBtn = el("a", {
          href: `tel:${digits}`, className: "ani-action-btn has-tooltip",
          'data-tooltip': firstName ? `חייג ל${firstName}` : "חייג", innerHTML: '<i class="fa-light fa-mobile"></i>'
      });
      telBtn.onclick = (e) => e.stopPropagation();

      return el("div", { style: { display: "flex", gap: "10px", alignItems: "center", marginTop: "2px" } }, [
          telBtn, waBtn, el("span", { textContent: dispPhone, style: { fontWeight: "600", color: "#0f172a", fontSize: "13px", paddingRight: "4px" } })
      ]);
  }

  function getSystemActions(phone, name) {
      if (!phone) return null;
      let digits = phone.replace(/\D/g, '');
      let normPhone = digits.length === 9 || digits.length === 8 ? "0" + digits : digits;

      const histBtn = el("span", {
          className: "ani-action-btn has-tooltip", 'data-tooltip': "חיפוש היסטוריית משלוחים ב-Similar Orders",
          innerHTML: '<i class="fa-solid fa-magnifying-glass"></i>'
      });
      histBtn.onclick = (e) => { e.stopPropagation(); document.dispatchEvent(new CustomEvent('OpenSimilarOrdersByPhone', { detail: { phone: normPhone } })); };

      // כאן הקסם: אם הטלפון נמצא באינדקס המיוחד ששלפנו מהשרת, הכפתור יקבל מיד את ה-Class הכתום והמהבהב!
      const hasNote = state.notesIndex && state.notesIndex.has(normPhone);
      const noteBtn = el("span", {
          className: hasNote ? "ani-action-btn lwcn-btn lwcn-has-note lwcn-blink has-tooltip" : "ani-action-btn lwcn-btn has-tooltip",
          'data-tooltip': "הערות לקוח במערכת Customer Notes",
          'data-phone': normPhone,
          'data-customer-name': name || ""
      });
      noteBtn.innerHTML = '<i class="fa-regular fa-note-sticky"></i>';
      noteBtn.onclick = (e) => { e.stopPropagation(); document.dispatchEvent(new CustomEvent('OpenLionwheelNote', { detail: { phone: normPhone, name: name, buttonElement: noteBtn } })); };

      return el("div", { style: { display: "flex", gap: "12px", alignItems: "center" } }, [ noteBtn, histBtn ]);
  }

  const tooltipBox = el("div", { className: "ani-tooltip-box" }); document.body.appendChild(tooltipBox);
  document.addEventListener('mouseover', handleTooltip); document.addEventListener('touchstart', handleTooltip, { passive: true });
  function handleTooltip(e) {
    const target = e.target.closest('[data-tooltip]');
    if (target) {
      if (target.getAttribute('data-tooltip-html') === 'true') tooltipBox.innerHTML = target.getAttribute('data-tooltip');
      else tooltipBox.textContent = target.getAttribute('data-tooltip');
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

  function openModal(title, contentNode, maxWidth = "1200px") {
      modalBox.style.maxWidth = maxWidth; modalTitle.textContent = title; modalBody.innerHTML = ""; modalBody.appendChild(contentNode); modalOverlay.classList.add('open');
  }
  function closeModal() { modalOverlay.classList.remove('open'); }

  function table(headers, rows) {
    const headerTexts = headers.map(h => { let tmp = document.createElement("DIV"); tmp.innerHTML = typeof h === "string" ? h : (h.textContent || ""); return tmp.textContent.replace('❓', '').replace('⏱️', '').replace('↕️', '').trim(); });
    const thead = el("thead", {}, [ el("tr", {}, headers.map((h, colIndex) => {
      const th = el("th", { className: "sortable" }, [el("span", { innerHTML: (typeof h === 'string' ? h : h.innerHTML || h.textContent) + ' <i style="font-size:10px; color:#cbd5e1;" class="fa-solid fa-sort"></i>' })]); th.dataset.sort = 'asc';
      th.onclick = () => {
          const tbody = th.closest('table').querySelector('tbody'); const trs = Array.from(tbody.querySelectorAll('tr'));
          const isAsc = th.dataset.sort === 'asc'; th.dataset.sort = isAsc ? 'desc' : 'asc';
          trs.sort((a, b) => {
              let valA = a.children[colIndex].dataset.sortVal || a.children[colIndex].textContent.trim(); let valB = b.children[colIndex].dataset.sortVal || b.children[colIndex].textContent.trim();
              const scoreMap = {"🎯 פגיעה מושלמת": 4, "✅ תאריך מושלם": 3, "👍 קרוב לתחזית": 2, "⚠️ סטייה סבירה": 1};
              if (scoreMap[valA] && scoreMap[valB]) return isAsc ? scoreMap[valA] - scoreMap[valB] : scoreMap[valB] - scoreMap[valA];
              let numA = parseFloat(valA.replace(/\D.-/g, '')); let numB = parseFloat(valB.replace(/\D.-/g, ''));
              if (valA.includes('/')) { const pA = valA.split('/'); const pB = valB.split('/'); if(pA.length===3 && pB.length===3) { numA = new Date(`${pA[2]}-${pA[1]}-${pA[0]}`).getTime(); numB = new Date(`${pB[2]}-${pB[1]}-${pB[0]}`).getTime(); } }
              if (!isNaN(numA) && !isNaN(numB)) return isAsc ? numA - numB : numB - numA;
              return isAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
          });
          trs.forEach(tr => tbody.appendChild(tr));
      };
      return th;
    })) ]);
    const tbody = el("tbody", {}, rows.map(r => el("tr", {}, r.map((cell, index) => {
      const td = el("td", {}, [(cell && cell.__isNode) ? cell : el("span", { className: "ani-val" }, [String(cell ?? "")])]);
      if (cell && cell.sortVal) td.dataset.sortVal = cell.sortVal;
      if (headerTexts[index]) td.setAttribute('data-label', headerTexts[index]); return td;
    }))));
    return el("table", { className: "ani-table" }, [thead, tbody]);
  }

  const rootDiv = el("div", { id: "anipet-pro-root", style: { display: "none" } });
  const headerDiv = el("div", { id: "anipet-pro-header" }, [
    el("div", { style: { display: "flex", alignItems: "center", gap: "12px" } }, [
      el("div", { textContent: "📦", style: { fontSize: "24px" } }),
      el("div", {}, [ el("div", { textContent: "AniPet PRO · מערכת רכש", style: { fontSize: "16px", fontWeight: "700" } }), el("div", { textContent: "V2.14.14 - V6 Hybrid Engine (Fallback Aware)", style: { fontSize: "12px", color: "#94a3b8" } }) ])
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
  const fbDaysSel = el("select", { className: "ani-select", style: { width: "180px" } });
  [
      { v: 0, l: "היום" },
      { v: 1, l: "אתמול" },
      { v: 3, l: "3 ימים אחרונים" },
      { v: 7, l: "שבוע אחרון" }
  ].forEach((o) => fbDaysSel.appendChild(el("option", { value: o.v, textContent: o.l, selected: state.feedbackDaysBack === o.v })));
  fbDaysSel.onchange = () => { state.feedbackDaysBack = parseInt(fbDaysSel.value, 10) || 0; loadFeedbackDataAndRender(); };
  fbToolbar.appendChild(el("div", { style: { display: "flex", alignItems: "center", gap: "8px" } }, [ el("label", { className: "ani-label", textContent: "חלון הצלחות:" }), fbDaysSel ]));

  function switchView(mode, preventLoad = false) {
      state.viewMode = mode;
      document.getElementById('view-btn-products').classList.toggle('active', mode === 'products');
      document.getElementById('view-btn-customers').classList.toggle('active', mode === 'customers');
      document.getElementById('view-btn-feedback').classList.toggle('active', mode === 'feedback');

      if (mode === 'feedback') {
          toolbar.style.display = 'none'; fbToolbar.style.display = 'flex'; if (!preventLoad) loadFeedbackDataAndRender();
      } else {
          toolbar.style.display = 'flex'; fbToolbar.style.display = 'none'; document.getElementById('ms-supplier-wrap').style.display = mode === 'customers' ? 'none' : 'flex';
          if (!preventLoad) fetchAllDataAndRender();
      }
  }

  const omniWrapper = el("div", { className: "ani-omni-search-wrapper" });
  const omniInput = el("input", { className: "ani-omni-input", placeholder: "🔍 חיפוש-על: שם פריט, ברקוד, טלפון, שם לקוח, כתובת" });
  const omniSpinner = el("i", { className: "fa-solid fa-circle-notch ani-search-spinner" });
  const omniClearBtn = el("button", { className: "ani-omni-clear-btn", innerHTML: '<i class="fa-solid fa-xmark"></i>', title: "נקה חיפוש" });
  const omniList = el("ul", { className: "ani-autocomplete-list" });

  omniWrapper.appendChild(omniInput); omniWrapper.appendChild(omniSpinner); omniWrapper.appendChild(omniClearBtn); omniWrapper.appendChild(omniList);

  omniClearBtn.onclick = () => { omniInput.value = ""; omniClearBtn.style.display = "none"; omniList.style.display = "none"; switchView(state.viewMode); };

  let searchTimeout;
  omniInput.oninput = (e) => {
      clearTimeout(searchTimeout); const val = e.target.value.trim();
      omniClearBtn.style.display = val.length > 0 ? "block" : "none";
      if (val.length < 3) { invalidateRequest('omni'); omniList.style.display = "none"; return; }

      omniList.innerHTML = '<li style="text-align:center; padding:16px; color:#3b82f6;"><i class="fa-solid fa-circle-notch fa-spin"></i> מחפש נתונים...</li>';
      omniList.style.display = "block";

      searchTimeout = setTimeout(() => {
          const requestId = beginRequest('omni');
          let terms = val.split(' ').filter(x => x); let nameAndQuery = terms.map(t => `name.ilike.*${t}*`).join(',');
          Promise.all([
              gmFetch(`${SUPABASE_URL}/rest/v1/product_catalog_enriched?select=sku,barcode,name,category_name&or=(sku.eq.${terms[0]},barcode.eq.${terms[0]},and(${nameAndQuery}))&limit=10`, { headers: sbHeaders() }).catch(()=>null),
              gmFetch(`${SUPABASE_URL}/rest/v1/rpc/search_customers_omni`, { method: "POST", headers: sbHeaders(), body: JSON.stringify({ p_query: val }) }).catch(()=>null)
          ]).then(async responses => {
              if (!isActiveRequest('omni', requestId)) return;
              omniList.innerHTML = ""; const [catRes, custRes] = responses;
              let catData = catRes && catRes.ok ? tryParse(catRes.responseText) || [] : [];
              let custPhonesRaw = custRes && custRes.ok ? tryParse(custRes.responseText) || [] : [];
              let uniquePhones = new Set(); let dedupedCusts = custPhonesRaw.filter(c => { if(uniquePhones.has(c.phone)) return false; uniquePhones.add(c.phone); return true; });
              let hasResults = false;

              if (catData.length > 0) {
                  hasResults = true; omniList.appendChild(el("div", { className: "ani-autocomplete-section", textContent: "📦 מוצרים (היסטוריית לקוחות מלאה)" }));
                  catData.forEach(item => {
                      let li = el("li");
                      li.appendChild(el("div", { textContent: item.name || 'מוצר ללא שם', style: { fontSize: "14px", fontWeight: "bold", color: "#0f172a" } }));
                      li.appendChild(el("div", { textContent: `מק"ט/ברקוד: ${item.barcode || item.sku}`, style: { fontSize: "12px", color: "#64748b" } }));
                      li.onclick = () => { omniInput.value = item.name || item.sku; omniList.style.display = "none"; searchProductBySku(item.sku, item.name, item.category_name); };
                      omniList.appendChild(li);
                  });
              }

              if (dedupedCusts.length > 0) {
                  hasResults = true; omniList.appendChild(el("div", { className: "ani-autocomplete-section", textContent: "👤 לקוחות (פרופיל אישי וצריכה)" }));
                  const phonesArr = [...new Set(dedupedCusts.map(c => c.phone).flatMap(p => [p, (!p.startsWith('0') && (p.length === 8 || p.length === 9)) ? '0' + p : p]))];
                  const namesRes = await gmFetch(`${SUPABASE_URL}/rest/v1/rpc/buyer_sku_shortages_raw_names`, { method: "POST", headers: sbHeaders(), body: JSON.stringify({ p_phones: phonesArr }) });
                  if (!isActiveRequest('omni', requestId)) return;
                  let namesMap = {}; if (namesRes.ok) (tryParse(namesRes.responseText) || []).forEach(n => namesMap[n.p9] = n);

                  dedupedCusts.forEach(c => {
                      let dispPhone = c.phone.startsWith('0') ? c.phone : '0' + c.phone;
                      let addrObj = namesMap[dispPhone] || namesMap[c.phone] || null;
                      let li = el("li");
                      const title = el("div", { style: { fontSize: "14px", fontWeight: "bold", color: "#0f172a" } }, [
                          document.createTextNode(c.name || "לקוח"),
                          el("span", { textContent: ` (${dispPhone})`, style: { color: "#64748b", fontWeight: "normal" } })
                      ]);
                      li.appendChild(title);
                      if (addrObj) {
                          const addrLine = el("div", { style: { fontSize: "12px", color: "#64748b" } });
                          addrLine.appendChild(createCityAddressNode(addrObj.c_city, addrObj.c_address, "📍 "));
                          li.appendChild(addrLine);
                      }
                      li.onclick = () => { omniInput.value = c.name; omniList.style.display = "none"; searchCustomerByPhone(c.phone); };
                      omniList.appendChild(li);
                  });
              }
              if (!hasResults) omniList.appendChild(el("li", { textContent: "לא נמצאו תוצאות.", style: { color: "#94a3b8", cursor: "default", textAlign:"center" } }));
          }).catch(() => {
              if (!isActiveRequest('omni', requestId)) return;
              omniList.innerHTML = "";
              omniList.appendChild(el("li", { textContent: "שגיאה בשליפת תוצאות חיפוש.", style: { color: "#ef4444", cursor: "default", textAlign:"center" } }));
          });
      }, 500);
  };

  document.addEventListener('click', (e) => {
      if (!e.target.closest('.ani-multi-select-wrapper')) document.querySelectorAll('.ani-multi-select-dropdown').forEach(d => d.style.display = 'none');
      if (!omniWrapper.contains(e.target)) omniList.style.display = "none";
  });

  function buildMultiSelect(options, stateKey, onChange) {
      const wrap = el("div", { className: "ani-multi-select-wrapper" }); const btn = el("button", { className: "ani-select ani-multi-select-btn" }); const drop = el("div", { className: "ani-multi-select-dropdown" });
      wrap.updateUI = (newOpts) => {
          if (newOpts) options = newOpts; drop.innerHTML = "";
          options.forEach(o => {
              const lbl = el("label", { className: "ani-multi-select-item" }); const cb = el("input", { type: "checkbox", value: o.v, checked: state[stateKey].includes(o.v) });
              cb.onchange = (e) => {
                  if (o.v === 'all') state[stateKey] = ['all'];
                  else {
                      state[stateKey] = state[stateKey].filter(x => x !== 'all');
                      if (e.target.checked) state[stateKey].push(o.v); else state[stateKey] = state[stateKey].filter(x => x !== o.v);
                      if (state[stateKey].length === 0) state[stateKey] = ['all'];
                  }
                  wrap.updateUI(); onChange();
              };
              lbl.appendChild(cb); lbl.appendChild(document.createTextNode(" " + o.l)); drop.appendChild(lbl);
          });
          btn.innerHTML = state[stateKey].includes('all') || state[stateKey].length === 0 ? `<span>${options.find(o=>o.v==='all')?.l}</span> <i class="fa-solid fa-chevron-down" style="font-size:10px; color:#94a3b8;"></i>` : `<span style="color:#3b82f6; font-weight:bold;">${state[stateKey].length} נבחרו</span> <i class="fa-solid fa-chevron-down" style="font-size:10px; color:#94a3b8;"></i>`;
      };
      wrap.updateUI();
      btn.onclick = (e) => { e.stopPropagation(); const isOp = drop.style.display === 'block'; document.querySelectorAll('.ani-multi-select-dropdown').forEach(d=>d.style.display='none'); drop.style.display = isOp ? 'none' : 'block'; };
      wrap.appendChild(btn); wrap.appendChild(drop); return wrap;
  }

  const presetsRow = el("div", { className: "ani-presets-container" });
  const controlsRow1 = el("div", { className: "ani-controls-row", style: { paddingBottom: "12px", borderBottom: "1px solid #f1f5f9" } });
  const controlsRow2 = el("div", { className: "ani-controls-row" });

  const inGrace = el("input", { type: "number", className: "ani-input", style: { width: "70px" }, value: state.graceDays });
  const inWindow = el("input", { type: "number", className: "ani-input", style: { width: "70px" }, value: state.windowDays });

  const msAnimal = buildMultiSelect([{v:'all', l:'🐾 כל החיות'}, {v:'dog', l:'🐶 כלבים'}, {v:'cat', l:'🐱 חתולים'}, {v:'rodent', l:'🐹 מכרסמים'}, {v:'bird', l:'🦜 ציפורים'}, {v:'other', l:'אחר'}], 'filterAnimal', () => { clearActivePreset(); renderCurrentView(); });
  const msType = buildMultiSelect([{v:'all', l:'🛍️ כל סוגי המוצרים'}, {v:'dry', l:'🥩 מזון יבש'}, {v:'wet', l:'🥫 מזון לח'}, {v:'treats', l:'🦴 חטיפים'}, {v:'litter', l:'✨ מצעים / חול'}, {v:'other', l:'אחר'}], 'filterType', () => { clearActivePreset(); renderCurrentView(); });
  const msStatus = buildMultiSelect([{v:'all', l:'📊 כל הסטטוסים'}, {v:'DANGER', l:'🚨 נטישה אפשרית'}, {v:'CRIT', l:'🔴 אזל (באיחור)'}, {v:'OUT', l:'⭕ אזל עכשיו'}, {v:'LOW', l:'🟠 לקראת סיום'}, {v:'WARNING', l:'🟡 תכף נגמר'}, {v:'OK', l:'🟢 תקין'}, {v:'HIGH', l:'🔵 עודף'}], 'filterCustomerStatus', () => { clearActivePreset(); renderCurrentView(); });
  const msRel = buildMultiSelect([{v:'all', l:'🎯 כל האמינויות'}, {v:'swiss', l:'⏱️ שעון שוויצרי'}, {v:'regular', l:'✓ סדיר'}, {v:'erratic', l:'🎲 כאוטי'}, {v:'fallback', l:'🛡️ רשת ביטחון'}, {v:'sparse', l:'❓ מעט נתונים'}], 'filterCustomerRel', () => { clearActivePreset(); renderCurrentView(); });
  const msSupplier = buildMultiSelect([{v:'all', l:'🚚 כל הספקים'}], 'filterSupplier', () => { clearActivePreset(); renderCurrentView(); });

  function populateSuppliersDropdown() { msSupplier.updateUI([{v:'all', l:'🚚 כל הספקים'}, ...[...new Set(Object.values(state.supplierMap))].filter(Boolean).sort().map(s => ({v:s, l:s}))]); }

  const selSort = el("select", { className: "ani-select", style: { width: "180px" } });
  [ {v:'smart', l:'מיון: דחוף וחשוב (SOS)'}, {v:'churn', l:'מיון: סכנת נטישה'}, {v:'upcoming', l:'מיון: קרוב להיום'}, {v:'volume_qty', l:'מיון: כמות מוצרים (יח)'}, {v:'volume', l:'מיון: כמות לקוחות'} ].forEach(o => selSort.appendChild(el("option", { value: o.v, textContent: o.l, selected: state.sortBy === o.v })));

  inGrace.onchange = () => { state.graceDays = parseInt(inGrace.value)||0; clearActivePreset(); fetchAllDataAndRender(); };
  inWindow.onchange = () => { state.windowDays = parseInt(inWindow.value)||0; clearActivePreset(); fetchAllDataAndRender(); };
  selSort.onchange = () => { state.sortBy = selSort.value; clearActivePreset(); renderCurrentView(); };

  function fetchAllDataAndRender() { fetchAllData(); }
  function renderCurrentView() { if(state.viewMode === 'products') renderMainList(); else renderCustomerList(); }

  function clearActivePreset() { state.activePreset = null; renderPresetsUI(); }
  function syncControlsFromState() {
      inGrace.value = state.graceDays;
      inWindow.value = state.windowDays;
      selSort.value = state.sortBy;
      msAnimal.updateUI();
      msType.updateUI();
      msStatus.updateUI();
      msRel.updateUI();
      msSupplier.updateUI();
      renderPresetsUI();
  }
  function applyPreset(p) {
      state.activePreset = p.id; state.graceDays = p.grace; state.windowDays = p.window; state.sortBy = p.sort;
      state.filterCustomerStatus = [...(p.filterStatus || ['all'])]; state.filterAnimal = [...(p.filterAnimal || ['all'])]; state.filterType = [...(p.filterType || ['all'])]; state.filterCustomerRel = [...(p.filterRel || ['all'])]; state.filterSupplier = [...(p.filterSupplier || ['all'])];
      syncControlsFromState(); fetchAllDataAndRender();
  }

  function renderPresetsUI() {
      presetsRow.innerHTML = "";
      PRESETS_HARDCODED.forEach(p => presetsRow.appendChild(el("div", { className: `ani-preset-badge ${state.activePreset === p.id ? 'active' : ''} has-tooltip`, 'data-tooltip': p.tooltip, innerHTML: p.label, onclick: () => applyPreset(p) })));
      state.customPresets.forEach(p => {
          const btn = el("div", { className: `ani-preset-badge ani-preset-custom ${state.activePreset === p.id ? 'active' : ''}` });
          btn.appendChild(el("span", { textContent: p.label, onclick: () => applyPreset(p) }));
          btn.appendChild(el("i", {
              className: "fa-light fa-trash-can", style: { color: "#ef4444", marginLeft: "4px" },
              onclick: (e) => {
                  e.stopPropagation();
                  const wrap = el("div", { style: { padding: "10px", textAlign: "center" } });
                  wrap.appendChild(el("h3", { textContent: `האם למחוק את הסינון "${p.label}"?`, style: { color: "#0f172a", marginBottom: "20px" } }));
                  const btnRow = el("div", { style: { display: "flex", gap: "10px", justifyContent: "center" } });
                  btnRow.appendChild(el("button", { className: "ani-btn", textContent: "ביטול", onclick: closeModal }));
                  btnRow.appendChild(el("button", { className: "ani-excel-btn ani-excel-btn-danger", textContent: "כן, מחק", onclick: () => { state.customPresets = state.customPresets.filter(x => x.id !== p.id); saveCustomPresets(); renderPresetsUI(); closeModal(); }}));
                  wrap.appendChild(btnRow); openModal("⚠️ אישור מחיקה", wrap, "400px");
              }
          }));
          presetsRow.appendChild(btn);
      });
      presetsRow.appendChild(el("div", {
          className: "ani-preset-save-btn", innerHTML: '<i class="fa-solid fa-plus"></i> שמור סינון נוכחי',
          onclick: () => {
              const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "12px", padding: "10px" } });
              const nameInp = el("input", { className: "ani-omni-input", placeholder: "הכנס שם לסינון השמור..." });
              wrap.appendChild(nameInp);
              wrap.appendChild(el("button", {
                  className: "ani-excel-btn", style: { justifyContent: "center" }, innerHTML: 'שמור',
                  onclick: () => {
                      const name = nameInp.value.trim(); if (!name) return;
                      const newPreset = { id: 'custom_' + Date.now(), label: name, grace: state.graceDays, window: state.windowDays, sort: state.sortBy, filterStatus: [...state.filterCustomerStatus], filterAnimal: [...state.filterAnimal], filterType: [...state.filterType], filterRel: [...state.filterCustomerRel], filterSupplier: [...state.filterSupplier] };
                      state.customPresets.push(newPreset); saveCustomPresets(); state.activePreset = newPreset.id; renderPresetsUI(); closeModal();
                  }
              }));
              openModal("💾 שמירת סינון מותאם אישית", wrap, "400px"); setTimeout(() => nameInp.focus(), 100);
          }
      }));
  }
  renderPresetsUI();
  const initialHardcodedPreset = PRESETS_HARDCODED.find(p => p.id === state.activePreset);
  if (initialHardcodedPreset) {
      state.graceDays = initialHardcodedPreset.grace;
      state.windowDays = initialHardcodedPreset.window;
      state.sortBy = initialHardcodedPreset.sort;
      state.filterCustomerStatus = [...(initialHardcodedPreset.filterStatus || ['all'])];
      state.filterAnimal = [...(initialHardcodedPreset.filterAnimal || ['all'])];
      state.filterType = [...(initialHardcodedPreset.filterType || ['all'])];
      state.filterCustomerRel = [...(initialHardcodedPreset.filterRel || ['all'])];
      state.filterSupplier = [...(initialHardcodedPreset.filterSupplier || ['all'])];
      syncControlsFromState();
  }

  toolbar.appendChild(omniWrapper);
  controlsRow1.appendChild(el("div", { className: "ani-input-group", style: { width: "130px" } }, [ el("label", { className: "ani-label has-tooltip", textContent: "סוג חיה", 'data-tooltip': "סנן לפי חיית המחמד של הלקוח" }), msAnimal ]));
  controlsRow1.appendChild(el("div", { className: "ani-input-group", style: { width: "140px" } }, [ el("label", { className: "ani-label has-tooltip", textContent: "סוג מוצר", 'data-tooltip': "סנן לפי קטגוריית המוצר (מזון, חול, שימורים)" }), msType ]));
  controlsRow1.appendChild(el("div", { className: "ani-input-group", style: { width: "150px" } }, [ el("label", { className: "ani-label has-tooltip", textContent: "סטטוס לקוח", 'data-tooltip': "מצב המלאי המשוער אצל הלקוח ברגע זה" }), msStatus ]));
  controlsRow1.appendChild(el("div", { className: "ani-input-group", style: { width: "150px" } }, [ el("label", { className: "ani-label has-tooltip", textContent: "רמת אמינות", 'data-tooltip': "עד כמה הלקוח צפוי וקבוע בקניות שלו? (סטיית תקן)" }), msRel ]));
  controlsRow1.appendChild(el("div", { className: "ani-input-group", style: { width: "150px" }, id: "ms-supplier-wrap" }, [ el("label", { className: "ani-label has-tooltip", textContent: "ספק מוצר", 'data-tooltip': "סינון מוצרים לפי הספק שלהם בקטלוג" }), msSupplier ]));

  controlsRow2.appendChild(el("div", { className: "ani-input-group" }, [ el("label", { className: "ani-label has-tooltip", textContent: "אחורה (איחור)", 'data-tooltip': "כמה ימים אחורה לחפש? (טריק: אם תכניס מספר שלילי כמו -7, התחזית תקפוץ ותתחיל רק מהשבוע הבא!)" }), inGrace ]));
  controlsRow2.appendChild(el("div", { className: "ani-input-group" }, [ el("label", { className: "ani-label has-tooltip", textContent: "קדימה (תחזית)", 'data-tooltip': "כמה ימים קדימה מהיום לחפש תחזיות עתידיות?" }), inWindow ]));
  controlsRow2.appendChild(el("div", { className: "ani-input-group" }, [ el("label", { className: "ani-label has-tooltip", textContent: "סדר תצוגה", 'data-tooltip': "<b>איך עובד המיון?</b><br>• <b>SOS:</b> ציון דחיפות שמשקלל קודם כל כמה לקוחות אמינים צפויים לקנות, ואז כמה קרוב תאריך היעד שלהם.<br>• <b>סכנת נטישה:</b> מיון לפי מי שנמצא באיחור הגדול ביותר.<br>• <b>קרוב להיום:</b> מיון פשוט לפי תאריך היעד הקרוב ביותר.<br>• <b>כמות יחידות/לקוחות:</b> מיון לפי נפח כדי לאתר מוצרים חמים.", 'data-tooltip-html': 'true' }), selSort ]));

  toolbar.appendChild(presetsRow); toolbar.appendChild(controlsRow1); toolbar.appendChild(controlsRow2);

  const statusLine = el("div", { style: { display: "flex", alignItems: "center", gap: "10px", padding: "0 4px 16px 4px", fontSize: "13px", color: "#64748b", fontWeight: "500", justifyContent: "space-between" } });
  const statusLeft = el("div", { style: { display: "flex", alignItems: "center", gap: "10px" } });
  const statusRight = el("div", { id: "ani-sync-time", textContent: `שולף זמן סנכרון אחרון...` });
  statusLine.appendChild(statusLeft); statusLine.appendChild(statusRight); fetchLastSyncTime();

  const mainList = el("div", { style: { display: "flex", flexDirection: "column" } });
  bodyContent.appendChild(toolbar); bodyContent.appendChild(fbToolbar); bodyContent.appendChild(statusLine); bodyContent.appendChild(mainList);
  rootDiv.appendChild(headerDiv); rootDiv.appendChild(bodyContent); document.documentElement.appendChild(rootDiv);

  function setStatus(text, isError = false) { statusLeft.innerHTML = ""; statusLeft.appendChild(badge(isError ? "שגיאה" : "סטטוס", isError ? "red" : "blue")); statusLeft.appendChild(el("span", { textContent: text })); }
  function createSkeletonTable() { const w = el("div", { className: "table-responsive ani-skeleton-wrapper" }); const t = el("table", { className: "ani-table" }); const tb = el("tbody"); for(let i=0; i<3; i++) { const tr = el("tr"); for(let j=0; j<6; j++) tr.appendChild(el("td", { 'data-label': 'טוען...' }, [el("div", { className: "skeleton" })])); tb.appendChild(tr); } t.appendChild(tb); w.appendChild(t); return w; }
  function showMainSkeleton() { mainList.innerHTML = ""; for(let i=0; i<4; i++) mainList.appendChild(el("div", { className: "skeleton-card" })); }

  const custTableHeaders = [
      '<span class="has-tooltip" data-tooltip="שם, טלפון וכתובת הלקוח">פרטי לקוח</span>', '<span class="has-tooltip" data-tooltip="מצב הטיפול מול הלקוח">סטטוס טיפול</span>', '<span class="has-tooltip" data-tooltip="סוג מוצר ואמינות הלקוח">קטגוריה ואמינות</span>',
      '<span class="has-tooltip" data-tooltip="מתי הזמין לאחרונה וכל כמה זמן">היסטוריית רכישות</span>', '<span class="has-tooltip" data-tooltip="מצב המלאי ותאריך סיום משוער">מלאי וצפי סיום</span>', '<span class="has-tooltip" data-tooltip="כמה צפוי להזמין">כמות ומגמה</span>', 'פעולות'
  ];

  const histTableHeaders = [
      '<span class="has-tooltip" data-tooltip="תאריך ביצוע ההזמנה">תאריך</span>', '<span class="has-tooltip" data-tooltip="שם הפריט שנרכש כפי שמופיע בקטלוג">פריט</span>', '<span class="has-tooltip" data-tooltip="הקטגוריה אליה הפריט שויך במערכת הנרמול">קטגוריה</span>',
      '<span class="has-tooltip" data-tooltip="כמות היחידות שנרכשה בפועל מהפריט">יחידות</span>', '<span class="has-tooltip" data-tooltip="משקל היחידה הבודדת לפיו מחושבת הצריכה בגרמים או ק״ג">משקל פריט</span>'
  ];

  async function fetchHistoryDirect(p9, categoryKey, cName, triggerNode = null) {
      if (triggerNode?.dataset.loading === '1') return;
      let restoreTrigger = () => {};
      if (triggerNode) {
          const originalInner = triggerNode.innerHTML;
          const originalMinWidth = triggerNode.style.minWidth;
          triggerNode.dataset.loading = '1';
          if (triggerNode.offsetWidth) triggerNode.style.minWidth = `${triggerNode.offsetWidth}px`;
          triggerNode.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="color:#64748b"></i>';
          restoreTrigger = () => {
              delete triggerNode.dataset.loading;
              triggerNode.innerHTML = originalInner;
              triggerNode.style.minWidth = originalMinWidth;
          };
      }
      try {
          const url = `${SUPABASE_URL}/rest/v1/mv_orders_items_norm?customer_key=ilike.*${p9}*&consumption_category=eq.${categoryKey}&order=order_date.desc&limit=15`;
          const dataRes = await gmFetch(url, { headers: sbHeaders() });
          if (!dataRes.ok) { alert("שגיאת שרת: " + dataRes.responseText); return; }
          const histData = tryParse(dataRes.responseText);
          if (!histData || !histData.length) { alert("לא נמצאו פריטים קודמים בקטגוריה זו."); return; }

          const histRows = histData.map(d => {
              let qty = d.qty || d.qty_raw || 1; let weightStr = '-';
              if (d.pack_value) { let pv = parseFloat(d.pack_value); if (pv < 1 && pv > 0) weightStr = Math.round(pv * 1000) + ' גרם'; else weightStr = Number(pv).toFixed(2).replace(/\.?0+$/, '') + ' ק"ג'; }
              return [ fmtDate(d.order_date || d.o_date), d.item_name || 'מוצר ללא שם', asNode(badge(d.consumption_category ? t(d.consumption_category) : (d.category_name ? t(d.category_name) : "כללי"), "gray")), qty, weightStr ];
          });
          const historyText = buildHistoryWhatsappText(histData);
          const copyHistoryBtn = el("button", { className: "ani-btn", innerHTML: '<i class="fa-regular fa-copy" style="margin-left:6px;"></i>📄 העתק היסטוריה כטקסט' });
          copyHistoryBtn.dataset.defaultHtml = copyHistoryBtn.innerHTML;
          copyHistoryBtn.onclick = async (e) => {
              e.stopPropagation();
              const ok = await copyTextToClipboard(historyText);
              flashElementFeedback(
                  copyHistoryBtn,
                  ok ? '<i class="fa-solid fa-check" style="margin-left:6px;"></i>הועתק!' : '<i class="fa-solid fa-triangle-exclamation" style="margin-left:6px;"></i>שגיאה בהעתקה',
                  ok ? 'success' : 'error'
              );
          };
          const modalWrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "12px" } }, [
              el("div", { style: { display: "flex", justifyContent: "flex-start" } }, [copyHistoryBtn]),
              el("div", {className: "table-responsive", style:{padding:0}}, [table(histTableHeaders, histRows)])
          ]);
          openModal(`👁️ היסטוריית רכישות פריטים - ${cName || t(categoryKey)}`, modalWrap);
      } catch(err) { alert("שגיאה בתקשורת מול השרת: " + err); } finally { restoreTrigger(); }
  }

  // ✨ החלק שהיה חסר: סורק כל פינה בזיכרון המקומי כדי לדלות את אינדקס ההערות שהסקריפט השני יצר
  function buildNotesIndexFromLocalStorage() {
      let index = new Set();
      try {
          for(let i=0; i<localStorage.length; i++) {
              let key = localStorage.key(i);
              let valStr = localStorage.getItem(key);
              if (valStr && valStr.startsWith('{')) {
                  let val = JSON.parse(valStr);
                  if (val && typeof val === 'object' && !Array.isArray(val)) {
                      let keys = Object.keys(val);
                      // אם רוב המפתחות באובייקט הם מספרי טלפון, זה כנראה האינדקס שלנו!
                      let phoneKeys = keys.filter(k => k.length >= 9 && !isNaN(k));
                      if (phoneKeys.length > 0 && phoneKeys.length > keys.length * 0.5) {
                          keys.forEach(k => {
                              if (val[k] === true) {
                                  let cleanK = k.replace(/\D/g, '');
                                  index.add(cleanK);
                                  if(cleanK.startsWith('0')) index.add(cleanK.substring(1));
                                  else index.add('0'+cleanK);
                              }
                          });
                      }
                  }
              }
          }
      } catch(e) {}
      return index;
  }

  async function fetchAllData() {
      const requestId = beginRequest('data');
      showMainSkeleton();
      setStatus(`טוען נתונים למערכת... (חלון זמן: ${state.graceDays} אחורה עד ${state.windowDays} קדימה)`);
      try {
          let graceDate = new Date(); graceDate.setDate(graceDate.getDate() - state.graceDays);
          let winDate = new Date(); winDate.setDate(winDate.getDate() + state.windowDays);
          const gStr = graceDate.toISOString().split('T')[0]; const wStr = winDate.toISOString().split('T')[0];

          const res = await gmFetch(`${SUPABASE_URL}/rest/v1/mv_forecast_engine_v4?next_expected_date=gte.${gStr}&next_expected_date=lte.${wStr}&limit=3000`, { headers: sbHeaders() });
          if(!res.ok) throw new Error("API responded with " + res.status);
          let rawData = tryParse(res.responseText) || [];
          if (!isActiveRequest('data', requestId)) return;

          try {
              // 1. קודם כל דולים כל מה שאפשר מזיכרון הדפדפן בתור גיבוי
              state.notesIndex = buildNotesIndexFromLocalStorage();

              // 2. מנסים לפנות לפונקציה הציבורית שיצרנו בשרת ההערות
              const [nRes, crmRes] = await Promise.all([
                  gmFetch(`${NOTES_SB_URL}/rest/v1/rpc/get_notes_index_public`, {
                      method: "POST",
                      headers: { "apikey": NOTES_SB_ANON, "Authorization": `Bearer ${NOTES_SB_ANON}`, "Content-Type": "application/json" }
                  }),
                  gmFetch(`${SUPABASE_URL}/rest/v1/anipet_crm_status`, { headers: sbHeaders() })
              ]);

              if (nRes.ok) {
                  (tryParse(nRes.responseText) || []).forEach(item => {
                      if (item.phone) {
                          let k = String(item.phone).replace(/\D/g, '');
                          state.notesIndex.add(k);
                          if(k.startsWith('0')) state.notesIndex.add(k.substring(1));
                          else state.notesIndex.add('0' + k);
                      }
                  });
              }
              if (crmRes.ok) {
                  state.crmMap = {};
                  (tryParse(crmRes.responseText) || []).forEach(r => state.crmMap[`${r.customer_phone}|${r.category_key}`] = r);
              }
          } catch(e) {}
          if (!isActiveRequest('data', requestId)) return;

          const rawPhones = rawData.map(c => c.customer_phone).filter(Boolean);
          let fetchPhones = []; rawPhones.forEach(p => { fetchPhones.push(p); if (!p.startsWith('0') && (p.length === 8 || p.length === 9)) fetchPhones.push('0' + p); });
          const phonesArr = [...new Set(fetchPhones)];

          let namesMap = {};
          if (phonesArr.length > 0) {
              for(let i=0; i<phonesArr.length; i+=200) {
                  const chunk = phonesArr.slice(i, i+200);
                  const namesRes = await gmFetch(`${SUPABASE_URL}/rest/v1/rpc/buyer_sku_shortages_raw_names`, { method: "POST", headers: sbHeaders(), body: JSON.stringify({ p_phones: chunk }) });
                  if (!isActiveRequest('data', requestId)) return;
                  if(namesRes.ok) (tryParse(namesRes.responseText) || []).forEach(n => namesMap[n.p9] = n);
              }
          }

          state.allRawData = rawData.map(r => {
             let p = r.customer_phone; let paddedP = (!p.startsWith('0') && (p.length === 8 || p.length === 9)) ? '0' + p : p;
             const n = namesMap[paddedP] || namesMap[p];
             return { ...r, is_fallback: Boolean(r.is_fallback), customer_name: n ? n.c_name : 'לקוח לא ידוע', customer_city: n ? n.c_city : '', customer_addr: n ? n.c_address : '' };
          });

          const allSkus = [...new Set(state.allRawData.map(s => s.recommend_sku).filter(Boolean))];
          await fetchMetaForSkus(allSkus);
          if (!isActiveRequest('data', requestId)) return;
          renderCurrentView();
      } catch(e) { setStatus(`שגיאה בטעינת הנתונים: ${e.message}`, true); }
  }

  function renderMainList() {
    mainList.innerHTML = "";
    if (!state.allRawData || !state.allRawData.length) { mainList.appendChild(el("div", { textContent: "אין נתונים מהשרת לחלון הזמן הנוכחי.", style: { color: "#94a3b8", textAlign: "center", padding: "40px", fontSize: "16px" } })); return; }

    let filteredRows = state.allRawData.filter(r => {
        const info = parseCategoryInfo(r.category_key); const sSup = state.supplierMap[r.recommend_sku] || state.supplierMap[r.item_name]; const relStatus = getReliabilityCategory(r.cv_percentage, r.is_fallback);
        if (!state.filterAnimal.includes('all') && !state.filterAnimal.includes(info.animal)) return false;
        if (!state.filterType.includes('all') && !state.filterType.includes(info.type)) return false;
        if (!state.filterSupplier.includes('all') && !state.filterSupplier.includes(sSup)) return false;
        if (!state.filterCustomerStatus.includes('all') && !state.filterCustomerStatus.includes(r.dos_bucket)) return false;
        if (!state.filterCustomerRel.includes('all') && !state.filterCustomerRel.includes(relStatus)) return false;
        return true;
    });

    if (filteredRows.length === 0) { mainList.appendChild(el("div", { textContent: "אין מוצרים העונים לתנאי הסינון.", style: { color: "#94a3b8", textAlign: "center", padding: "40px", fontSize: "16px" } })); return; }

    const skuMap = {}; const todayStr = new Date().toISOString().split('T')[0];
    filteredRows.forEach(r => {
        if (!skuMap[r.recommend_sku]) skuMap[r.recommend_sku] = { recommend_sku: r.recommend_sku, product_name: r.item_name, category_key: r.category_key, total_customers: 0, late_customers: 0, future_customers: 0, nearest_due_date: '2099-01-01', total_expected_qty: 0, total_expected_weight: 0, reliable_customers: 0, swiss_customers: 0, regular_customers: 0, fallback_customers: 0, total_loyalty_score: 0, reliable_due_sum_ms: 0, reliable_due_count: 0, avg_reliable_due_ms: NaN, urgency_score: 0, customers: [] };
        const s = skuMap[r.recommend_sku]; s.total_customers++;
        if (r.next_expected_date < todayStr) s.late_customers++; else s.future_customers++;
        if (r.next_expected_date < s.nearest_due_date) s.nearest_due_date = r.next_expected_date;
        s.total_expected_qty += Number(r.expected_qty || 0); s.total_expected_weight += (Number(r.expected_qty || 0) * Number(r.pack_weight || 1));
        const reliabilityCategory = getReliabilityCategory(r.cv_percentage, r.is_fallback);
        if (isReliableForSmartSort(reliabilityCategory)) {
            s.reliable_customers++;
            if (reliabilityCategory === 'swiss') s.swiss_customers++;
            else if (reliabilityCategory === 'regular') s.regular_customers++;
            else if (reliabilityCategory === 'fallback') s.fallback_customers++;
            s.total_loyalty_score += (Number(r.loyalty_score) || 0);
            s.reliable_due_sum_ms += startOfDayMs(r.next_expected_date);
            s.reliable_due_count++;
        }
        s.customers.push(r);
    });

    let aggregatedSkus = Object.values(skuMap);
    const todayMs = startOfDayMs();
    aggregatedSkus.forEach(s => {
        s.avg_reliable_due_ms = s.reliable_due_count ? Math.round(s.reliable_due_sum_ms / s.reliable_due_count) : NaN;
        s.urgency_score = computeSkuUrgencyScore(s, todayMs);
    });

    if (aggregatedSkus.length === 0) { mainList.appendChild(el("div", { textContent: "המוצרים סוננו על ידי מנגנון ה-SOS.", style: { color: "#94a3b8", textAlign: "center", padding: "40px", fontSize: "16px" } })); return; }

    // Tiered SOS score: reliable customer volume dominates first (10,000 points each),
    // then the average reliable due date is bucketed so Today/Tomorrow are hottest,
    // then strict reliability tiering favors swiss/regular over fallback,
    // then a small category-level loyalty bonus, and only then a tiny weight tie-breaker (max 100).
    const sortedSkus = aggregatedSkus.sort((a, b) => {
      const dA = new Date(a.nearest_due_date).setHours(0,0,0,0); const dB = new Date(b.nearest_due_date).setHours(0,0,0,0); const today = todayMs;
      if (state.sortBy === 'smart') {
          const aPenalty = ((state.activePreset === 'buyer_action' || state.sortBy === 'smart') && !state.filterCustomerRel.includes('swiss') && a.total_expected_weight < 3 && a.reliable_customers === 0) ? 1 : 0;
          const bPenalty = ((state.activePreset === 'buyer_action' || state.sortBy === 'smart') && !state.filterCustomerRel.includes('swiss') && b.total_expected_weight < 3 && b.reliable_customers === 0) ? 1 : 0;
          if (aPenalty !== bPenalty) return aPenalty - bPenalty;
          if (a.urgency_score !== b.urgency_score) return b.urgency_score - a.urgency_score;
          if (a.total_expected_weight !== b.total_expected_weight) return b.total_expected_weight - a.total_expected_weight;
          if (a.reliable_customers !== b.reliable_customers) return b.reliable_customers - a.reliable_customers;
          if (dA !== dB) return dA - dB;
          return b.total_customers - a.total_customers;
      }
      else if (state.sortBy === 'churn') return dA - dB;
      else if (state.sortBy === 'upcoming') return Math.abs(dA - today) - Math.abs(dB - today);
      else if (state.sortBy === 'volume_qty') return b.total_expected_qty - a.total_expected_qty;
      else return b.total_customers - a.total_customers;
    });

    state.currentDisplayedSkus = sortedSkus; setStatus(`מציג ${sortedSkus.length} מוצרים.`);
    const fragment = document.createDocumentFragment();
    for (const s of sortedSkus) fragment.appendChild(buildSkuCard(s));
    mainList.appendChild(fragment);
  }

  function buildSkuCard(s, isSearchMode = false) {
      const card = el("div", { className: "ani-card" }); const badgeList = [];
      const totalQty = s.total_expected_qty ? Number(s.total_expected_qty).toFixed(0) : (s.total_customers||0);
      let lateText = s.late_customers||0;

      if (!isSearchMode) {
          badgeList.push(el("span", { className: "ani-badge badge-green has-tooltip", 'data-tooltip': "מספר הלקוחות הכולל למוצר זה בחלון הסינון", innerHTML: `<i class="fa-solid fa-users" style="margin-left:4px;"></i>לקוחות: <b>${s.total_customers || 0}</b>` }));
          if (lateText > 0) badgeList.push(el("span", { className: "ani-badge badge-red has-tooltip", 'data-tooltip': "איחורים", innerHTML: `<i class="fa-solid fa-clock-rotate-left" style="margin-left:4px;"></i>איחורים: <b>${lateText}</b>` }));
          badgeList.push(el("span", { textContent: "|", style: { color: "#cbd5e1" } }));
          badgeList.push(el("span", { className: "ani-badge badge-purple has-tooltip", 'data-tooltip': "צפי יחידות", innerHTML: `<i class="fa-solid fa-box" style="margin-left:5px;"></i> ${totalQty} יח'` }));
          if (s.total_expected_weight > 0) {
              let displayWeight = s.total_expected_weight < 1 ? `${Math.round(s.total_expected_weight * 1000)} גרם` : `${Number(s.total_expected_weight).toFixed(2).replace(/\.?0+$/, '')} ק"ג/ל'`;
              badgeList.push(el("span", { className: "ani-badge badge-blue has-tooltip", 'data-tooltip': "צפי משקל", innerHTML: `<i class="fa-solid fa-scale-balanced" style="margin-left:5px;"></i> ${displayWeight}` }));
          }
          badgeList.push(el("span", { className: "has-tooltip", 'data-tooltip': 'תאריך קרוב', textContent: `• תאריך קרוב: ${fmtDate(s.nearest_due_date)}`, style: { fontSize: "13px", color: "#64748b" } }));
      }

      const sSupplier = state.supplierMap[s.recommend_sku] || '';
      const productNameNode = bindCopyable(
          el("span", { textContent: s.product_name || "מוצר ללא שם", style: { fontSize: "15px", fontWeight: "700", color: "#0f172a" } }),
          () => s.product_name || "מוצר ללא שם",
          { textMode: true, tooltip: "לחץ להעתקת שם המוצר" }
      );
      const barcodeNode = bindCopyable(
          el("span", { className: "ani-badge badge-gray has-tooltip", 'data-tooltip': 'לחץ להעתקת הברקוד' }, [createIconText("fa-light fa-barcode", s.recommend_sku || "", { marginLeft: "4px" })]),
          () => s.recommend_sku || "",
          { tooltip: "לחץ להעתקת הברקוד" }
      );
      const textArea = el("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } }, [
        el("div", { style: { display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" } }, [
          productNameNode,
          asNode(barcodeNode),
          badge(t(s.category_key), "gray")
        ]),
        el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" } }, [
            sSupplier ? el("span", { className: "ani-badge badge-gray" }, [createIconText("fa-light fa-truck", sSupplier, { marginLeft: "4px" })]) : null,
            ...badgeList
        ].filter(Boolean))
      ]);

      const rawImgUrl = state.imagesMap[s.recommend_sku];
      const thumbnailEl = el("img", {
          src: getThumbnailUrl(rawImgUrl), loading: "lazy", className: "ani-thumb-img", title: "לחץ להעתקת תמונה",
          style: { width: "50px", height: "50px", objectFit: "contain", borderRadius: "6px", border: "1px solid #e2e8f0", background: "#fff" },
          onerror: function() { if(!this.dataset.fallbackTriggered && rawImgUrl) { this.dataset.fallbackTriggered = 'true'; this.src = rawImgUrl; } }
      });
      thumbnailEl.onclick = (e) => { e.stopPropagation(); copyImageToClipboard(thumbnailEl, rawImgUrl); };

      const imgWrapper = el("div", { style: { position: "relative", flexShrink: "0" } });
      if (!isSearchMode) imgWrapper.appendChild(el("span", { className: "lw-thumb-badge" }, [`X${totalQty}`]));
      imgWrapper.appendChild(thumbnailEl);

      const btnToggle = el("button", { className: "ani-chevron-btn", innerHTML: '<i class="fa-light fa-chevron-down"></i>' });
      const titleAreaWithImage = el("div", { style: { display: "flex", alignItems: "center", gap: "16px" } }, [btnToggle, imgWrapper, textArea]);
      const cBody = el("div", { className: "ani-card-body" });
      let isLoaded = false;

      btnToggle.onclick = async () => {
        if (cBody.classList.contains('open')) {
            cBody.classList.remove('open'); btnToggle.innerHTML = '<i class="fa-light fa-chevron-down"></i>';
        } else {
            cBody.classList.add('open'); btnToggle.innerHTML = '<i class="fa-light fa-chevron-left"></i>';
            if (!isLoaded) { cBody.innerHTML = ""; cBody.appendChild(createSkeletonTable()); await renderCustomersForSku(s.customers, cBody); isLoaded = true; }
        }
      };

      card.appendChild(el("div", { className: "ani-card-header", style: {justifyContent: "flex-start"} }, [titleAreaWithImage]));
      card.appendChild(cBody); return card;
  }

  async function renderCustomersForSku(users, containerElement) {
      try {
          let ordersMap = {}; let fetchKeys = []; let uniquePairs = new Set();
          users.forEach(u => {
              let k = u.customer_phone + '|' + u.category_key;
              if(!uniquePairs.has(k)) { uniquePairs.add(k); fetchKeys.push({phone: u.customer_phone, cat: u.category_key}); }
          });

          try {
              const orderPromises = fetchKeys.map(fk => gmFetch(`${SUPABASE_URL}/rest/v1/rpc/buyer_sku_shortages_raw_orders_single`, { method: "POST", headers: sbHeaders(), body: JSON.stringify({ p_phone: fk.phone, p_category: fk.cat }) }).then(r => {
                  let parsed = tryParse(r.responseText); if (!Array.isArray(parsed)) return [];
                  return parsed.map(x => ({ p9: fk.phone, cat: fk.cat, o_date: x.o_date, qty: x.qty }));
              }).catch(()=>[]));
              const ordersRaw = (await Promise.all(orderPromises)).flat();
              for (const o of ordersRaw) { let k = o.p9 + '|' + o.cat; if (!ordersMap[k]) ordersMap[k] = []; ordersMap[k].push({ date: new Date(o.o_date), qty: Number(o.qty) }); }
          } catch(e) {}

          users.sort((a,b) => new Date(a.next_expected_date) - new Date(b.next_expected_date));

          let custRows = [];
          for (const u of users) {
              const p9 = u.customer_phone; const displayPhone = (p9 && p9.length === 9 && !p9.startsWith('0')) ? '0' + p9 : p9;
              let k = p9 + '|' + u.category_key; let rawUOrders = ordersMap[k] || []; let dMap = {};
              rawUOrders.forEach(o => { let dStr = o.date.toISOString().split('T')[0]; if(!dMap[dStr]) dMap[dStr] = { date: new Date(dStr), qty: 0 }; dMap[dStr].qty += o.qty; });
              let uOrders = Object.values(dMap).sort((a,b)=>b.date-a.date);

              let anomalyBadge = badge("יציב", "gray", "ממוצע תואם להזמנה"); let relBadge = getReliabilityBadge(u.cv_percentage, u.is_fallback);
              let lastDate = null; let lastQtyUnits; let avgGapStr = u.avg_gap_days ? `~ כל ${u.avg_gap_days} ימים` : "מחזור רכישה לא ידוע";

              if (uOrders.length > 0) {
                  lastDate = uOrders[0].date.toISOString().split('T')[0]; let weightMultiplier = u.pack_weight || 1;
                  lastQtyUnits = Math.round(uOrders[0].qty / weightMultiplier); let past = uOrders.slice(1,4);
                  if (past.length > 0) {
                      let pastUnits = past.map(o => o.qty / weightMultiplier); let avgQtyUnitsRaw = pastUnits.reduce((a,b)=>a+b,0) / past.length;
                      let avgQtyUnits = Math.round(avgQtyUnitsRaw); if (avgQtyUnits === 0 && avgQtyUnitsRaw > 0) avgQtyUnits = 1;
                      let diffUnitsAbs = Math.abs(lastQtyUnits - avgQtyUnits);
                      if (diffUnitsAbs >= 1) {
                          let diffStr = `${diffUnitsAbs} יח'`;
                          if (weightMultiplier && weightMultiplier !== 1) { let w = diffUnitsAbs * weightMultiplier; let wStr = w < 1 ? `${Math.round(w * 1000)} גרם` : `${Number(w).toFixed(2).replace(/\.?0+$/, '')} ק"ג`; diffStr += ` (${wStr})`; }
                          if (lastQtyUnits < avgQtyUnitsRaw) anomalyBadge = badge(`▼ ירד בכמות`, "red", `הזמין פחות מהממוצע שלו (-${diffStr})`);
                          else if (lastQtyUnits > avgQtyUnitsRaw) anomalyBadge = badge(`▲ עלה בכמות`, "green", `הזמין יותר מהממוצע שלו (+${diffStr})`);
                      }
                  }
              }

              let expQtyUnits = Math.round(Number(u.expected_qty || 1)); let expectedQtyHtml = `<b>${expQtyUnits} יח'</b>`;
              if (u.pack_weight && u.pack_weight != 1) {
                  let weightVal = expQtyUnits * u.pack_weight; let weightStr = weightVal < 1 ? `${Math.round(weightVal * 1000)} גרם` : `${Number(weightVal).toFixed(2).replace(/\.?0+$/, '')} ק"ג`;
                  expectedQtyHtml += ` <span style="color:#64748b; font-size:12px;">(${weightStr})</span>`;
              }
              let expectedQtyNode = el("div", { className: "has-tooltip", 'data-tooltip': 'צפי הזמנה עתידית', innerHTML: expectedQtyHtml });

              const dosInfo = DOS_MAP[u.dos_bucket] || { label: u.dos_bucket, type: 'gray', desc: 'סטטוס לא ידוע' };
              let dynamicDesc = dosInfo.desc;
              if (['OUT', 'CRIT', 'DANGER'].includes(u.dos_bucket)) dynamicDesc = `המלאי הסתיים ב-${fmtDate(u.next_expected_date)}`;
              else if (['LOW', 'WARNING'].includes(u.dos_bucket)) dynamicDesc = `המלאי יסתיים ב-${fmtDate(u.next_expected_date)}`;
              const statusBadgeNode = badge(dosInfo.label, dosInfo.type, dynamicDesc);

              const exactDateStr = fmtDate(u.next_expected_date); const rangeStr = getDateRangeStr(u.next_expected_date, u.cv_percentage, u.is_fallback);
              const dateNodeInner = el("div", {style:{display:"flex", flexDirection:"column", alignItems:"center", whiteSpace:"nowrap", lineHeight:"1.3"}});
              dateNodeInner.appendChild(el("span", {className:"has-tooltip", "data-tooltip": "תאריך סיום מלאי (מנוע V6 Hybrid)", style: { color: "#0f172a", fontWeight: "600" }, textContent: exactDateStr}));
              dateNodeInner.appendChild(el("span", {style: {fontSize:"11px", color:"#64748b"}, textContent: `(${rangeStr})`}));
              let dateNode = asNode(dateNodeInner); dateNode.sortVal = u.next_expected_date;

              const cName = u.customer_name;

              let custDetails = el("div", {style:{display:"flex", flexDirection:"column", gap:"6px"}});
              custDetails.appendChild(el("div", {style:{fontWeight:"bold", color:"#0f172a"}}, [cName]));
              custDetails.appendChild(getCommunicationActions(displayPhone, cName));

              const addrLine = el("div", {style:{fontSize:"11px", color:"#64748b"}});
              addrLine.appendChild(createCityAddressNode(u.customer_city, u.customer_addr));
              custDetails.appendChild(addrLine);
              let custDetailsNode = asNode(custDetails); custDetailsNode.sortVal = cName;

              let crmData = state.crmMap[`${p9}|${u.category_key}`];
              let currentStatus = 'NONE';
              if (crmData) {
                  const updatedDate = new Date(crmData.updated_at); const daysSinceUpdate = (new Date() - updatedDate) / (1000*60*60*24);
                  if (crmData.status === 'BLOCKED') currentStatus = 'BLOCKED';
                  else if (lastDate && new Date(lastDate) > updatedDate) currentStatus = 'NONE';
                  else if (daysSinceUpdate > 45) currentStatus = 'NONE';
                  else currentStatus = crmData.status;
              }
              const crmWrap = el("div", { className: "crm-dropdown-wrapper" });
              const currCrm = CRM_MAP[currentStatus];
              const crmBtn = el("button", {
                  type: "button",
                  className: "crm-dropdown-btn", style: { backgroundColor: currCrm.bg, color: currCrm.text },
                  innerHTML: `<span style="flex-grow:1; text-align:center;">${currCrm.label}</span> <i class="fa-light fa-angle-down"></i>`
              });
              const crmMenu = el("ul", { className: "crm-dropdown-menu" });

              Object.keys(CRM_MAP).forEach(k => {
                  const info = CRM_MAP[k];
                  const li = el("li", { className: "crm-dropdown-item", style: { backgroundColor: info.bg, color: info.text }, textContent: info.label });
                  li.onclick = async (e) => {
                      e.stopPropagation(); closeAllCrmDropdowns();
                      const origHtml = crmBtn.innerHTML; crmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
                      try {
                          const res = await gmFetch(`${SUPABASE_URL}/rest/v1/rpc/upsert_crm_status`, { method: "POST", headers: sbHeaders(), body: JSON.stringify({ p_phone: p9, p_category: u.category_key, p_status: k }) });
                          if(!res.ok) throw new Error();
                          state.crmMap[`${p9}|${u.category_key}`] = { status: k, updated_at: new Date().toISOString() };
                          crmBtn.style.backgroundColor = info.bg; crmBtn.style.color = info.text;
                          crmBtn.innerHTML = `<span style="flex-grow:1; text-align:center;">${info.label}</span> <i class="fa-light fa-angle-down"></i>`;
                      } catch(err) { crmBtn.innerHTML = 'שגיאה!'; setTimeout(() => crmBtn.innerHTML = origHtml, 2000); }
                  };
                  crmMenu.appendChild(li);
              });
              crmBtn.onclick = (e) => {
                  e.stopPropagation();
                  const willOpen = !crmMenu.classList.contains('show');
                  closeAllCrmDropdowns();
                  if (willOpen) {
                      crmWrap.classList.add('open');
                      crmWrap.closest('.ani-card')?.classList.add('crm-dropdown-open');
                      activeCrmDropdown = { button: crmBtn, menu: crmMenu };
                      positionCrmDropdown(crmBtn, crmMenu);
                  }
              };
              crmWrap.appendChild(crmBtn); crmWrap.appendChild(crmMenu);

              let catDetails = el("div", {style:{display:"flex", flexDirection:"column", gap:"6px", alignItems:"flex-start"}});
              catDetails.appendChild(badge(t(u.category_key), "gray")); catDetails.appendChild(relBadge);

              let histDetails = el("div", {style:{display:"flex", flexDirection:"column", gap:"4px"}});
              histDetails.appendChild(el("div", {style:{fontWeight:"bold", color:"#1e293b"}}, [fmtDate(lastDate)]));
              histDetails.appendChild(el("div", {style:{fontSize:"12px"}}, [avgGapStr]));
              const totalOrdersNode = el("div", {style:{fontSize:"11px", color:"#64748b"}, className: "has-tooltip ani-inline-link", "data-tooltip": "לחץ לפתיחת היסטוריית הקניות הפרטית של הלקוח בקטגוריה זו"}, [`סה"כ ${uOrders.length} הזמנות`]);
              histDetails.appendChild(totalOrdersNode);

              let invDetails = el("div", {style:{display:"flex", flexDirection:"column", gap:"6px", alignItems:"flex-start"}});
              invDetails.appendChild(statusBadgeNode); invDetails.appendChild(dateNodeInner);

              let qtyDetails = el("div", {style:{display:"flex", flexDirection:"column", gap:"6px", alignItems:"flex-start"}});
              qtyDetails.appendChild(expectedQtyNode); qtyDetails.appendChild(anomalyBadge);

              const infoBtn = el("span", { className: "ani-action-btn has-tooltip", 'data-tooltip': 'היסטוריית פריטים מלאה', innerHTML: '<i class="fa-solid fa-list-ul"></i>' });
              const openHistoryModal = (e, triggerNode) => { e.stopPropagation(); fetchHistoryDirect(p9, u.category_key, cName, triggerNode); };
              infoBtn.onclick = (e) => openHistoryModal(e, infoBtn);
              totalOrdersNode.onclick = (e) => openHistoryModal(e, totalOrdersNode);

              let actionSystemDetails = el("div", {style:{display:"flex", gap:"16px", alignItems:"center", height: "100%", justifyContent: "center"}});
              actionSystemDetails.appendChild(getSystemActions(displayPhone, cName));
              actionSystemDetails.appendChild(infoBtn);

              custRows.push([ custDetailsNode, asNode(crmWrap), asNode(catDetails), asNode(histDetails), asNode(invDetails), asNode(qtyDetails), asNode(actionSystemDetails) ]);
          }

          const tblContainer = el("div", { className: "table-responsive" });
          tblContainer.appendChild(table(custTableHeaders, custRows));
          const skel = containerElement.querySelector('.ani-skeleton-wrapper'); if (skel) skel.remove();
          containerElement.appendChild(tblContainer);
      } catch(e) { containerElement.innerHTML = "<div style='padding:16px; color:red;'>שגיאה בשליפת היסטוריית לקוחות</div>"; }
  }

  function renderCustomerList() {
      mainList.innerHTML = "";
      if(!state.allRawData || !state.allRawData.length) { mainList.appendChild(el("div", { textContent: "אין לקוחות בחלון הזמן הזה.", style: { textAlign: "center", padding: "40px" } })); return; }

      const cMap = {};
      state.allRawData.forEach(r => {
          if(!cMap[r.customer_phone]) cMap[r.customer_phone] = { phone: r.customer_phone, name: r.customer_name, city: r.customer_city, addr: r.customer_addr, categories: [] };
          cMap[r.customer_phone].categories.push(r);
      });

      let filtered = Object.values(cMap).filter(c => {
          let keep = false;
          for(const cat of c.categories) {
              const info = parseCategoryInfo(cat.category_key); const relStatus = getReliabilityCategory(cat.cv_percentage, cat.is_fallback);
              if ((state.filterAnimal.includes('all') || state.filterAnimal.includes(info.animal)) && (state.filterType.includes('all') || state.filterType.includes(info.type)) && (state.filterCustomerStatus.includes('all') || state.filterCustomerStatus.includes(cat.dos_bucket)) && (state.filterCustomerRel.includes('all') || state.filterCustomerRel.includes(relStatus))) keep = true;
          }
          return keep;
      });

      filtered.forEach(c => { let nearest = new Date('2099-01-01'); c.categories.forEach(cat => { let d = new Date(cat.next_expected_date); if(d < nearest) nearest = d; }); c.nearest = nearest; });
      filtered.sort((a,b) => a.nearest - b.nearest); state.currentDisplayedCustomers = filtered;

      setStatus(`מציג ${filtered.length} לקוחות שצריכים הזמנה.`);
      const fragment = document.createDocumentFragment();
      filtered.forEach(c => { fragment.appendChild(buildCustomerCard(c.phone, c.name, c.city, c.addr, c.categories, false)); });
      mainList.appendChild(fragment);
  }

  function buildCustomerCard(phone, name, city, addr, categories, autoOpen = false) {
      const card = el("div", { className: "ani-card" }); const dispPhone = phone.startsWith('0') ? phone : '0'+phone;

      const btnToggle = el("button", { className: "ani-chevron-btn", innerHTML: '<i class="fa-light fa-chevron-down"></i>' });
      const titleArea = el("div", { style: { display: "flex", alignItems: "center", gap: "16px" } }, [
        btnToggle,
        el("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } }, [
            el("div", { style: { display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" } }, [
                el("span", { textContent: `👤 ${name}`, style: { fontSize: "16px", fontWeight: "700", color: "#0f172a" } }),
                getCommunicationActions(dispPhone, name)
            ]),
            el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", fontSize: "13px", color: "#64748b" } }, [
                createCityAddressNode(city, addr, "📍 "),
                el("span", { textContent: `| ${categories.length} קטגוריות בתחזית` })
            ])
        ])
      ]);

      const cBody = el("div", { className: "ani-card-body" });
      if(autoOpen) { cBody.classList.add('open'); btnToggle.innerHTML = '<i class="fa-light fa-chevron-left"></i>'; }

      let isLoaded = false;
      btnToggle.onclick = async () => {
        if (cBody.classList.contains('open')) {
            cBody.classList.remove('open'); btnToggle.innerHTML = '<i class="fa-light fa-chevron-down"></i>';
        } else {
            cBody.classList.add('open'); btnToggle.innerHTML = '<i class="fa-light fa-chevron-left"></i>';
            if (!isLoaded) {
                cBody.innerHTML = ""; cBody.appendChild(createSkeletonTable()); await renderCustomersForSku(categories, cBody); isLoaded = true;
            }
        }
      };
      if(autoOpen) { cBody.appendChild(createSkeletonTable()); renderCustomersForSku(categories, cBody); isLoaded = true; }

      card.appendChild(el("div", { className: "ani-card-header", style: {justifyContent: "flex-start"} }, [titleArea]));
      card.appendChild(cBody); return card;
  }

  function getFeedbackWindow(daysBack) {
      const now = new Date();
      const startOfToday = new Date(now);
      startOfToday.setHours(0, 0, 0, 0);

      if (daysBack === 0) {
          return { startAt: startOfToday.toISOString(), endAt: now.toISOString() };
      }

      if (daysBack === 1) {
          const start = new Date(startOfToday);
          start.setDate(start.getDate() - 1);
          return { startAt: start.toISOString(), endAt: startOfToday.toISOString() };
      }

      const start = new Date(startOfToday);
      start.setDate(start.getDate() - (daysBack - 1));
      return { startAt: start.toISOString(), endAt: now.toISOString() };
  }

  async function loadFeedbackDataAndRender() {
      showMainSkeleton(); setStatus(`שואב נתוני בקרה - בודק את הדיוק של התחזיות עבור הזמנות שסופקו...`);
      try {
          const { startAt, endAt } = getFeedbackWindow(state.feedbackDaysBack);
          const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Jerusalem";
          const res = await gmFetch(`${SUPABASE_URL}/rest/v1/rpc/buyer_predictions_feedback_window`, {
              method: "POST",
              headers: sbHeaders(),
              body: JSON.stringify({ p_start_at: startAt, p_end_at: endAt, p_tz: browserTz })
          });
          if(!res.ok) throw new Error("Error fetching feedback: " + res.responseText);
          const feedbackData = tryParse(res.responseText) || [];
          if(feedbackData.length === 0) { mainList.innerHTML = `<div style="text-align:center; padding:40px; color:#94a3b8;">לא נמצאו תחזיות שהתגשמו בחלון הזמן הנבחר.</div>`; return; }

          const rawPhones = feedbackData.map(c => c.customer_phone).filter(Boolean);
          let fetchPhones = []; rawPhones.forEach(p => { fetchPhones.push(p); if (!p.startsWith('0') && (p.length === 8 || p.length === 9)) fetchPhones.push('0' + p); });
          let namesMap = {};
          if (fetchPhones.length > 0) {
              const namesRes = await gmFetch(`${SUPABASE_URL}/rest/v1/rpc/buyer_sku_shortages_raw_names`, { method: "POST", headers: sbHeaders(), body: JSON.stringify({ p_phones: [...new Set(fetchPhones)] }) });
              if(namesRes.ok) (tryParse(namesRes.responseText) || []).forEach(n => namesMap[n.p9] = n.c_name);
          }
          renderFeedbackList(feedbackData, namesMap);
      } catch(e) { setStatus("שגיאה בשליפת נתוני בקרה.", true); console.error(e); }
  }

  function renderFeedbackList(data, namesMap) {
      mainList.innerHTML = "";
      data.sort((a,b) => { let dA = new Date(a.actual_order_date), dB = new Date(b.actual_order_date); if (dA > dB) return -1; if (dA < dB) return 1; return Math.abs(a.days_off) - Math.abs(b.days_off); });
      setStatus(`מציג ${data.length} לקוחות שחזרו לרכוש ונמצאו במודל. (ניתן למיין על ידי לחיצה על כותרות הטבלה)`);
      const headers = [ "לקוח", "מוצר (מייצג סל)", "קטגוריה", "תאריך בפועל", "תאריך חזוי", "סטיית ימים", "כמות בפועל", "כמות חזויה", "דיוק 🎯" ];
      const rows = data.map(row => {
          let dispPhone = row.customer_phone.startsWith('0') ? row.customer_phone : '0' + row.customer_phone;
          let paddedP = (!row.customer_phone.startsWith('0') && (row.customer_phone.length === 8 || row.customer_phone.length === 9)) ? '0' + row.customer_phone : row.customer_phone;
          let name = namesMap[paddedP] || namesMap[row.customer_phone] || dispPhone;
          let diffColor = row.days_off > 0 ? "red" : "green"; let diffText = row.days_off === 0 ? "ביום המדויק!" : (row.days_off > 0 ? `איחר ב-${row.days_off} ימים` : `הקדים ב-${Math.abs(row.days_off)} ימים`);

          let scoreNode;
          if (row.accuracy_score === 'BULLSEYE') scoreNode = el("span", { className: "score-bullseye has-tooltip", "data-tooltip": "פגענו בדיוק בתאריך ובכמות!"}, ["🎯 פגיעה מושלמת"]);
          else if (row.accuracy_score === 'DATE_PERFECT') scoreNode = el("span", { className: "score-perfect has-tooltip", "data-tooltip": "הזמין בדיוק מתי שחשבנו"}, ["✅ תאריך מושלם"]);
          else if (row.accuracy_score === 'GOOD') scoreNode = el("span", { className: "score-good has-tooltip", "data-tooltip": "סטייה קלה (עד שבוע)"}, ["👍 קרוב לתחזית"]);
          else scoreNode = el("span", { className: "score-acceptable has-tooltip", "data-tooltip": "סטייה בינונית (8-14 ימים)"}, ["⚠️ סטייה סבירה"]);

          let nameCell = el("div", {style:{display:"flex", alignItems:"center", gap:"8px"}}); nameCell.appendChild(el("span", {textContent: name, style: {fontWeight:"600", color: "#0f172a"}}));
          if(name !== dispPhone) nameCell.appendChild(getCommunicationActions(dispPhone, name));
          let nameNode = asNode(nameCell); nameNode.sortVal = name;

          return [ nameNode, asNode(el("span", { style: { fontWeight: "600", color: "#1e293b", fontSize: "12px" } }, [row.item_name || 'מוצר לא ידוע'])), asNode(badge(t(row.category_key), "gray")), fmtDate(row.actual_order_date), fmtDate(row.predicted_date), asNode(el("span", { style: { color: diffColor, fontWeight: "500" } }, [diffText])), `${row.actual_qty} יח'`, `${row.predicted_qty} יח'`, asNode(scoreNode) ];
      });
      const wrapper = el("div", { className: "ani-card", style: { padding: "16px" } });
      const tblContainer = el("div", { className: "table-responsive", style: { padding: 0 } }); tblContainer.appendChild(table(headers, rows)); wrapper.appendChild(tblContainer); mainList.appendChild(wrapper);
  }

  async function searchProductBySku(sku, name, catName) {
      const requestId = beginRequest('productSearch');
      switchView('products', true); showMainSkeleton(); setStatus(`מציג תוצאות חיפוש-על עבור מוצר: ${name || 'מוצר ללא שם'}`);
      try {
          const res = await gmFetch(`${SUPABASE_URL}/rest/v1/mv_forecast_engine_v4?recommend_sku=eq.${sku}&limit=1000`, { headers: sbHeaders() });
          if (!isActiveRequest('productSearch', requestId)) return;
          if (!res.ok) throw new Error(`API responded with ${res.status}`);
          let users = tryParse(res.responseText) || [];
          if(users.length === 0) { mainList.innerHTML = `<div style="padding:40px; text-align:center; color:#94a3b8;">לא נמצאה תחזית עתידית פעילה ללקוחות במוצר זה.</div>`; return; }

          let fetchPhones = []; users.forEach(u => { fetchPhones.push(u.customer_phone); if (!u.customer_phone.startsWith('0') && (u.customer_phone.length === 8 || u.customer_phone.length === 9)) fetchPhones.push('0' + u.customer_phone); });
          let namesMap = {};
          if (fetchPhones.length > 0) {
              const namesRes = await gmFetch(`${SUPABASE_URL}/rest/v1/rpc/buyer_sku_shortages_raw_names`, { method: "POST", headers: sbHeaders(), body: JSON.stringify({ p_phones: [...new Set(fetchPhones)] }) });
              if (!isActiveRequest('productSearch', requestId)) return;
              if(namesRes.ok) (tryParse(namesRes.responseText) || []).forEach(n => namesMap[n.p9] = n);
          }
          users = users.map(u => {
              let paddedP = (!u.customer_phone.startsWith('0') && (u.customer_phone.length === 8 || u.customer_phone.length === 9)) ? '0' + u.customer_phone : u.customer_phone; let n = namesMap[paddedP] || namesMap[u.customer_phone]; return {...u, is_fallback: Boolean(u.is_fallback), customer_name: n?.c_name, customer_city: n?.c_city, customer_addr: n?.c_address};
          });

          const card = buildSkuCard({ recommend_sku: sku, product_name: name, category_key: users[0].category_key, total_customers: users.length, total_expected_qty: users.reduce((acc,u)=>acc+Number(u.expected_qty),0), customers: users }, true);
          mainList.innerHTML = ""; mainList.appendChild(card);
          const cBody = card.querySelector('.ani-card-body'); const btnToggle = card.querySelector('.ani-chevron-btn');
          cBody.classList.add('open'); btnToggle.innerHTML = '<i class="fa-light fa-chevron-left"></i>'; cBody.appendChild(createSkeletonTable()); await renderCustomersForSku(users, cBody);
      } catch(e) { if (isActiveRequest('productSearch', requestId)) setStatus(`שגיאה בחיפוש מוצר: ${e.message}`, true); }
  }

  async function searchCustomerByPhone(p9) {
      const requestId = beginRequest('customerSearch');
      switchView('customers', true); showMainSkeleton(); setStatus(`שולף פרופיל אישי מלא עבור 0${p9}...`);
      try {
          let paddedP = (!p9.startsWith('0') && (p9.length === 8 || p9.length === 9)) ? '0' + p9 : p9;
          const [namesRes, dataRes] = await Promise.all([
              gmFetch(`${SUPABASE_URL}/rest/v1/rpc/buyer_sku_shortages_raw_names`, { method: "POST", headers: sbHeaders(), body: JSON.stringify({ p_phones: [p9, paddedP] }) }),
              gmFetch(`${SUPABASE_URL}/rest/v1/mv_forecast_engine_v4?or=(customer_phone.eq.${p9},customer_phone.eq.${paddedP})`, { headers: sbHeaders() })
          ]);
          if (!isActiveRequest('customerSearch', requestId)) return;
          if(!dataRes.ok) throw new Error(`API responded with ${dataRes.status}`);

          let cName = "לקוח לא ידוע", cCity = "", cAddr = "";
          if (namesRes.ok) {
              const nd = tryParse(namesRes.responseText);
              if (nd && nd.length) { cName = nd[0].c_name; cCity = nd[0].c_city; cAddr = nd[0].c_address; }
          }

          const data = (tryParse(dataRes.responseText) || []).map(d => ({ ...d, is_fallback: Boolean(d.is_fallback), customer_name: cName, customer_city: cCity, customer_addr: cAddr }));
          mainList.innerHTML = "";
          if(!data.length) {
              mainList.appendChild(el("div", { textContent: "לא נמצאו נתוני תחזית אקטיביים עבור לקוח זה.", style: { padding: "40px", textAlign: "center", color: "#94a3b8" } }));
              return;
          }
          setStatus(`מציג פרופיל מלא עבור: ${cName}`);
          mainList.appendChild(buildCustomerCard(p9, cName, cCity, cAddr, data, true));
      } catch (e) {
          if (!isActiveRequest('customerSearch', requestId)) return;
          mainList.innerHTML = "";
          mainList.appendChild(el("div", { textContent: `שגיאה בשליפת לקוח: ${e.message}`, style: { padding: "40px", textAlign: "center", color: "#ef4444" } }));
          setStatus("שגיאה בשליפת לקוח", true);
      }
  }

  function injectTriggerButton() {
      if (document.getElementById('anipet-pro-trigger-btn')) return;
      const itemsBtn = document.querySelector('.order-items-btn'); if (!itemsBtn) return;
      const triggerBtn = document.createElement('button'); triggerBtn.id = 'anipet-pro-trigger-btn'; triggerBtn.className = 'btn btn-sm btn-light-primary m-0 mx-1 mx-md-0 m-md-1 d-flex align-items-center'; triggerBtn.innerHTML = '⚡ תחזית PRO'; triggerBtn.style.backgroundColor = '#e4d6ff'; triggerBtn.style.color = '#8950fc'; triggerBtn.style.fontWeight = 'bold'; triggerBtn.style.border = 'none';
      triggerBtn.onclick = (e) => { e.preventDefault(); rootDiv.style.display = 'flex'; applyPreset(PRESETS_HARDCODED[0]); };
      itemsBtn.parentNode.appendChild(triggerBtn);
  }

  const observer = new MutationObserver(() => {
      if (document.querySelector('.order-items-btn')) {
          injectTriggerButton();
          if (document.getElementById('anipet-pro-trigger-btn')) observer.disconnect();
      }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  injectTriggerButton();

})();