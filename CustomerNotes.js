// ==UserScript==
// @name         Lionwheel - Customer Notes (Supabase Cloud)
// @namespace    https://anipet.app/lionwheel
// @version      1.0.2
// @description  Global customer notes for Lionwheel stored in Supabase. Adds note icon in the main orders table and in task pages, with the same bubble editor.
// @match        https://members.lionwheel.com/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @require      https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js
// @downloadURL  https://raw.githubusercontent.com/AdamLee9186/anipet/main/CustomerNotes.js
// @updateURL    https://raw.githubusercontent.com/AdamLee9186/anipet/main/CustomerNotes.js
// ==/UserScript==

(function() {
  'use strict';
  
  const LWCN_CSS = '/* ---------- Button (inline near phone) ---------- */\n.lwcn-btn {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  margin-inline-start: 8px;\n  width: 28px;\n  height: 28px;\n  border-radius: 10px;\n  border: 1px solid rgba(17,24,39,0.15);\n  background: linear-gradient(180deg, #ffffff, #f7f7f9);\n  cursor: pointer;\n  user-select: none;\n  font-size: 14px;\n  box-shadow: 0 6px 14px rgba(0,0,0,0.08);\n  transition: transform .12s ease, box-shadow .12s ease, border-color .12s ease;\n}\n.lwcn-btn:hover {\n  transform: translateY(-1px);\n  box-shadow: 0 10px 18px rgba(0,0,0,0.12);\n  border-color: rgba(17,24,39,0.28);\n}\n.lwcn-btn i {\n  font-size: 14px;\n  color: rgba(17,24,39,0.88);\n}\n.lwcn-btn.lwcn-has-note {\n  /* Stronger "has note" signal */\n  border-color: rgba(249,115,22,0.55);\n  background: rgba(255,189,46,0.22); /* light orange fill */\n  box-shadow: 0 0 0 2px rgba(249,115,22,0.16);\n}\n\n.lwcn-btn.lwcn-has-note i {\n  color: #F97316; /* darker orange icon */\n}\n\n@keyframes lwcnPulse {\n  0%   { transform: scale(1);     box-shadow: 0 0 0 0 rgba(245,158,11,0.38); }\n  50%  { transform: scale(1.035); box-shadow: 0 0 0 7px rgba(245,158,11,0.10); }\n  100% { transform: scale(1);     box-shadow: 0 0 0 0 rgba(245,158,11,0.00); }\n}\n.lwcn-blink {\n  animation: lwcnPulse 1.8s ease-in-out infinite;\n  border-color: rgba(245,158,11,0.75) !important;\n}\n\n/* ---------- Bubble (single window: view + edit) ---------- */\n.lwcn-bubble {\n  position: fixed !important; /* Fixed positioning for real-time tracking - position set dynamically by JS */\n  z-index: 2147483647;\n  width: 360px;\n  max-width: min(360px, calc(100vw - 24px));\n  background: rgba(255,255,255,0.98);\n  border: 1px solid rgba(17,24,39,0.14);\n  border-radius: 14px;\n  box-shadow: 0 14px 34px rgba(0,0,0,0.14);\n  backdrop-filter: blur(6px);\n  padding: 0;\n  direction: rtl;\n  /* Match Lionwheel typography (fallback if CSS vars not present) */\n  font-family: "Noto Sans Hebrew", "Poppins", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, Helvetica, sans-serif;\n  text-align: right;\n  --lwcn-caret-top: 22px; /* will be set dynamically by JS */\n  overflow: visible; /* ensure caret outside is visible */\n\n  /* actual fade-in */\n  transition: opacity 160ms ease, transform 160ms ease;\n  will-change: opacity, transform;\n}\n\n/* Ensure all children inherit the same font (avoid serif surprises) */\n.lwcn-bubble * {\n  font-family: inherit;\n}\n\n/* Smooth enter (no layout shift / no "jump") */\n.lwcn-bubble.lwcn-enter {\n  opacity: 0;\n  /* start slightly below + tiny scale (no horizontal shift = no "left jump") */\n  transform: translate3d(0, 6px, 0) scale(0.985);\n}\n\n.lwcn-bubble.lwcn-enter.lwcn-enter--show {\n  opacity: 1;\n  transform: translate3d(0, 0, 0);\n}\n\n/* Caret arrow pointing to the button (right side, RTL) */\n.lwcn-bubble::before {\n  content: "";\n  position: absolute;\n  right: -10px;\n  top: calc(var(--lwcn-caret-top) - 10px);\n  border-width: 10px;\n  border-style: solid;\n  border-color: transparent transparent transparent rgba(0,0,0,0.12);\n  z-index: 2;\n  filter: drop-shadow(0 6px 10px rgba(0,0,0,0.10));\n}\n.lwcn-bubble::after {\n  content: "";\n  position: absolute;\n  right: -9px;\n  top: calc(var(--lwcn-caret-top) - 9px);\n  border-width: 9px;\n  border-style: solid;\n  border-color: transparent transparent transparent #ffffff;\n  z-index: 3;\n}\n\n.lwcn-bubble[data-side="right"]::before,\n.lwcn-bubble[data-side="right"]::after {\n  right: auto;\n  left: -10px;\n  transform: rotate(180deg);\n}\n\n.lwcn-bubble .top {\n  position: relative;\n  padding: 12px 12px 10px 12px;\n  padding-left: 36px; /* room for X on the far top-left */\n  border-bottom: 1px solid rgba(17,24,39,0.08);\n  display: flex;\n  align-items: flex-start;\n  justify-content: space-between;\n  gap: 10px;\n}\n\n.lwcn-bubble .lh { min-width: 0; }\n\n.lwcn-bubble .title {\n  display: inline-flex;\n  align-items: center;\n  gap: 8px;\n  font-weight: 800;\n  font-size: 14px;\n  color: #111827;\n  letter-spacing: 0.1px;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n\n.lwcn-titleicon {\n  width: 14px;\n  height: 14px;\n  flex-shrink: 0;\n  opacity: 0.92;\n  vertical-align: middle;\n}\n\n/* Title icon orange only when there\'s a note */\n.lwcn-bubble.lwcn-has-note .lwcn-titleicon {\n  color: #F97316;\n}\n.lwcn-bubble:not(.lwcn-has-note) .lwcn-titleicon {\n  color: #9ca3af;\n}\n\n/* SVG icons in close button */\n.lwcn-closebtn svg {\n  width: 14px;\n  height: 14px;\n}\n\n/* SVG icons in updated line */\n.lwcn-updated svg {\n  width: 10px;\n  height: 10px;\n  opacity: 0.75;\n  margin-left: 6px;\n  vertical-align: middle;\n}\n\n.lwcn-bubble .mini {\n  margin-top: 3px;\n  font-size: 12px;\n  color: #6b7280;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n\n.lwcn-bubble .actions {\n  display: inline-flex;\n  align-items: center;\n  gap: 8px;\n  flex: 0 0 auto;\n}\n\n/* (Removed) lwcn-linkbtn was for an old "edit" button UX */\n\n/* Close button: true top-left corner */\n.lwcn-closebtn {\n  position: absolute;\n  top: 6px;\n  left: 6px;\n  width: 28px;\n  height: 28px;\n  border-radius: 10px;\n  border: 1px solid rgba(17,24,39,0.14);\n  background: #fff;\n  color: #111827;\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  cursor: pointer;\n  transition: background .12s ease, transform .12s ease;\n}\n.lwcn-closebtn:hover { background: #f3f4f6; }\n.lwcn-closebtn:active { transform: translateY(1px); }\n.lwcn-closebtn i { font-size: 14px; }\n\n.lwcn-bubble .body {\n  padding: 12px;\n}\n\n.lwcn-bubble .noteview {\n  border: 1px solid rgba(17,24,39,0.10);\n  border-radius: 12px;\n  background: #fff;\n  padding: 10px 10px;\n  min-height: 72px;\n  line-height: 1.45;\n  font-size: 13px;\n  color: #111827;\n  cursor: text;\n  box-shadow: 0 6px 14px rgba(0,0,0,0.06);\n  white-space: pre-wrap;\n}\n\n.lwcn-bubble .noteview.is-empty {\n  background: linear-gradient(180deg, #ffffff, #fbfbfc);\n  border-style: dashed;\n  box-shadow: none;\n}\n\n.lwcn-empty {\n  color: #6b7280;\n  font-weight: 600;\n}\n\n.lwcn-footnote {\n  margin-top: 8px;\n  font-size: 11px;\n  color: #6b7280;\n  user-select: none;\n}\n\n.lwcn-textarea {\n  width: 100%;\n  min-height: 120px;\n  max-height: 360px;\n  resize: none;\n  border: none;\n  outline: none;\n  padding: 10px;\n  font-size: 13px;\n  line-height: 1.42;\n  text-align: right;\n  direction: rtl;\n  display: none; /* Hidden by default (Gemini-style) */\n  box-sizing: border-box;\n  background: #fff;\n  color: #333;\n  font-family: inherit;\n  overflow-y: auto;\n  appearance: none;\n  -webkit-appearance: none;\n  box-shadow: none;\n}\n\n.lwcn-textarea.is-editing {\n  display: block;\n}\n\n.lwcn-textarea[readonly] {\n  background: #fff;\n  cursor: text;\n}\n\n.lwcn-textarea.is-empty {\n  background: linear-gradient(180deg, #ffffff, #fbfbfc);\n}\n\n.lwcn-textarea:focus,\n.lwcn-textarea:focus-visible {\n  outline: none;\n  border: none;\n  box-shadow: none;\n}\n\n.lwcn-autosave-hint {\n  margin-top: 8px;\n  font-size: 11px;\n  color: #6b7280;\n  user-select: none;\n  display: flex;\n  align-items: center;\n  gap: 8px;\n}\n\n.lwcn-updated {\n  margin-top: 4px;\n  font-size: 11px;\n  color: #6b7280;\n  user-select: none;\n  display: flex;\n  align-items: center;\n  gap: 6px;\n}\n\n.lwcn-updated i {\n  font-size: 10px;\n  opacity: 0.75;\n}\n\n/* Mac-like status dots */\n.lwcn-dot {\n  width: 10px;\n  height: 10px;\n  border-radius: 999px;\n  box-shadow: inset 0 0 0 1px rgba(0,0,0,0.18);\n  display: inline-block;\n}\n.lwcn-dot.ok { background: #28CA40; }     /* saved */\n.lwcn-dot.saving { background: #FFBD2E; } /* saving */\n.lwcn-dot.err { background: #FF605C; }    /* error */\n.lwcn-statusline {\n  margin-top: 6px;\n  font-size: 12px;\n  color: #6b7280;\n  min-height: 16px;\n}\n\n/* Editor wrapper (contains both view and edit) */\n.lwcn-editor-wrapper {\n  position: relative;\n  width: 100%;\n  min-height: 120px;\n  border-radius: 10px;\n  border: 1px solid #d1d5db;\n  background: #fff;\n  overflow: hidden;\n  box-sizing: border-box;\n  transition: border-color .12s ease, box-shadow .12s ease, background-color .12s ease;\n}\n\n.lwcn-editor-wrapper:focus-within {\n  border-color: rgba(249,115,22,0.5);\n  box-shadow: 0 0 0 3px rgba(249,115,22,0.10);\n}\n\n/* Preview div for formatted markdown display */\n.lwcn-preview {\n  width: 100%;\n  min-height: 120px;\n  padding: 10px;\n  font-size: 13px;\n  line-height: 1.42;\n  text-align: right;\n  direction: rtl;\n  display: none;\n  box-sizing: border-box;\n  background: #fff;\n  cursor: text;\n  white-space: pre-wrap;\n  word-wrap: break-word;\n  max-height: 360px;\n  overflow-y: auto;\n}\n\n.lwcn-preview.is-visible {\n  display: block;\n}\n\n.lwcn-preview.is-empty {\n  background: linear-gradient(180deg, #ffffff, #fbfbfc);\n  color: #6b7280;\n  font-weight: 600;\n}\n\n/* Markdown formatting in preview */\n.lwcn-preview strong,\n.lwcn-preview b {\n  font-weight: 700;\n  color: #111827;\n}\n\n.lwcn-preview em,\n.lwcn-preview i {\n  font-style: italic;\n  color: #111827;\n}\n\n.lwcn-preview u {\n  text-decoration: underline;\n  text-decoration-color: rgba(17,24,39,0.4);\n}\n\n.lwcn-preview s,\n.lwcn-preview del {\n  text-decoration: line-through;\n  text-decoration-color: rgba(17,24,39,0.5);\n  opacity: 0.7;\n}\n\n.lwcn-preview ul,\n.lwcn-preview ol {\n  margin: 0;\n  padding-right: 20px;\n  margin-top: 4px;\n  margin-bottom: 4px;\n}\n\n.lwcn-preview li {\n  margin-top: 2px;\n  margin-bottom: 2px;\n}\n\n/* When textarea is editing, hide preview (Gemini-style) */\n.lwcn-textarea.is-editing ~ .lwcn-preview {\n  display: none !important;\n}\n';
  
  function injectGlobalCss(cssText) {
    try {
      if (typeof GM_addStyle === "function") {
        GM_addStyle(cssText);
        return;
      }
    } catch (_) {}
    const style = document.createElement("style");
    style.textContent = cssText;
    (document.head || document.documentElement || document.body).appendChild(style);
  }
  
  // Ensure base styles exist for the inline buttons (table + task page)
  try {
    injectGlobalCss(LWCN_CSS);
    injectGlobalCss(`
      @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Hebrew:wght@400;600;700;800&display=swap');
      .lwcn-bubble,
      .lwcn-bubble * {
        font-family: "Noto Sans Hebrew", "Segoe UI", Arial, system-ui, -apple-system, BlinkMacSystemFont, sans-serif !important;
      }
    `);
  
    // Main table cells often use ellipsis/overflow hidden. For long names, the note icon
    // can be clipped. We'll wrap the name cell content in a flex container and keep
    // ellipsis only on the text span.
    injectGlobalCss(`
      /* ---------- Table: keep icon visible even when column is narrow ---------- */
      td.lwcn-note-cell { overflow: visible !important; }
      td.lwcn-note-cell .lwcn-cellwrap {
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
      }
      td.lwcn-note-cell .lwcn-celltext {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        display: block;
      }
      /* Table icon is slightly smaller and never pulses */
      td.lwcn-note-cell .lwcn-btn {
        width: 24px;
        height: 24px;
        border-radius: 8px;
        box-shadow: none;
        margin-inline-start: 6px;
      }
      td.lwcn-note-cell .lwcn-btn:hover {
        transform: none;
        box-shadow: none;
      }

      /* ---------- Bubble title font override ---------- */
      .lwcn-bubble .top .title,
      .lwcn-bubble .top .title span {
        font-family: "Noto Sans Hebrew", "Segoe UI", Arial, system-ui, -apple-system, BlinkMacSystemFont, sans-serif !important;
      }
    `);
  } catch (_) {}
  
  // Tampermonkey menu (Auth)
  async function lwcnMenuStatus() {
    try {
      const { sbSession } = await getStore();
      // Attempt refresh if near expiry
      let status = "לא מחובר";
      let details = "";
      if (sbSession?.access_token) {
        if ((sbSession.expires_at || 0) <= nowSec() + 10 && sbSession.refresh_token) {
          try {
            const refreshed = await supabaseRefreshToken(SB_URL, SB_ANON, sbSession.refresh_token);
            const merged = { ...sbSession, ...refreshed };
            await setStore({ sbSession: merged });
          } catch (_) {}
        }
      }
  
      const { sbSession: latest } = await getStore();
      if (latest?.access_token && (latest.expires_at || 0) > nowSec() + 10) {
        status = "מחובר";
        details = latest.email ? `\nאימייל: ${latest.email}` : "";
      }
  
      alert(`LW Customer Notes\nסטטוס: ${status}${details}`);
    } catch (e) {
      alert(String(e?.message || e));
    }
  }
  
  async function lwcnMenuLoginOtp() {
    try {
      const store = await getStore();
      const prevEmail = store?.lastLoginEmail || store?.sbSession?.email || DEFAULT_LOGIN_EMAIL;
      const email = prompt("אימייל להתחברות (OTP / Magic Link):", prevEmail || DEFAULT_LOGIN_EMAIL);
      if (!email) return;
  
      const sb = getSupabaseClient();
      const { error } = await sb.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true }
      });
      if (error) throw error;
  
      await setStore({ lastLoginEmail: email });
  
      alert(
        "נשלח אימייל התחברות.\n\n" +
        "אם קיבלת קוד (OTP) – העתק אותו והפעל: Tampermonkey → 'Verify OTP / TokenHash'.\n" +
        "אם קיבלת Magic Link – פתח את הלינק באותו דפדפן. אם ההפניה חוזרת ל-Lionwheel עם token_hash, הסקריפט ינסה להתחבר אוטומטית."
      );
    } catch (e) {
      alert(String(e?.message || e));
    }
  }
  
  async function lwcnMenuVerifyOtp() {
    try {
      const store = await getStore();
      const email = store?.lastLoginEmail || store?.sbSession?.email || DEFAULT_LOGIN_EMAIL;
  
      const raw = prompt(
        "הדבק כאן קוד OTP (לרוב 6 ספרות), או token_hash (או URL מלא שמכיל token_hash=...):",
        ""
      );
      if (!raw) return;
  
      let token = String(raw).trim();
      let token_hash = null;
  
      // If user pasted a URL, try extract token_hash
      try {
        if (/^https?:\/\//i.test(token)) {
          const u = new URL(token);
          token_hash = u.searchParams.get("token_hash") || null;
          if (!token_hash) {
            const hash = u.hash || "";
            const hm = /token_hash=([^&]+)/.exec(hash);
            token_hash = hm ? decodeURIComponent(hm[1]) : null;
          }
        } else if (/token_hash=/.test(token)) {
          const u = new URL(token);
          token_hash = u.searchParams.get("token_hash");
        }
      } catch (_) {}
  
      const sb = getSupabaseClient();
  
      let data, error;
      if (token_hash) {
        ({ data, error } = await sb.auth.verifyOtp({ token_hash, type: "email" }));
      } else {
        ({ data, error } = await sb.auth.verifyOtp({ email, token, type: "email" }));
      }
      if (error) throw error;
  
      if (!data?.session?.access_token) throw new Error("האימות הצליח אבל לא התקבלה session.");
  
      const session = {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: nowSec() + (data.session.expires_in || 3600) - 30,
        user_id: data.session.user?.id || null,
        email: data.session.user?.email || email || null
      };
      await setStore({ sbSession: session, lastLoginEmail: email });
  
      alert("התחברת בהצלחה.");
    } catch (e) {
      alert(String(e?.message || e));
    }
  }
  
  async function lwcnMenuLoginPassword() {
    try {
      const existingCreds = (typeof GM_getValue === "function") ? GM_getValue("lwcnCreds", null) : null;
      const defEmail = (existingCreds && existingCreds.email) ? existingCreds.email : "adam.lee.9186@gmail.com";
      const email = prompt("LW Customer Notes – Supabase Login\nהזן אימייל:", defEmail);
      if (!email) return;
      const password = prompt("LW Customer Notes – Supabase Login\nהזן סיסמה (תישמר מקומית רק אם תאשר בהמשך):", "");
      if (!password) return;
  
      // We call the real login function later (defined in the main code).
      if (typeof supabasePasswordLogin !== "function") {
        alert("Login לא זמין עדיין (הקוד לא נטען). נסה שוב בעוד רגע.");
        return;
      }
      const session = await supabasePasswordLogin(SB_URL, SB_ANON, email, password);
      await setStore({ sbSession: session });
  
      const remember = confirm("לשמור אימייל+סיסמה ל-Auto-Login (נשמר מקומית בדפדפן)?\nאם אתה במחשב עבודה משותף – בחר ביטול.");
      if (remember) {
        await setStore({ creds: { email, password } });
      }
  
      alert("מחובר בהצלחה.");
    } catch (e) {
      console.error("[LWCN] Login failed:", e);
      alert("התחברות נכשלה: " + (e?.message || e));
    }
  }
  
  async function lwcnMenuLogout() {
    try {
      await setStore({ sbSession: null });
      alert("בוצעה התנתקות (ה-session נמחק).");
    } catch (e) {
      console.error("[LWCN] Logout failed:", e);
    }
  }
  
  async function lwcnMenuClearSavedPassword() {
    try {
      const s = await (typeof gmGet === "function" ? gmGet("lwcnCreds", null) : Promise.resolve(null));
      if (!s) {
        alert("אין סיסמה שמורה.");
        return;
      }
      const ok = confirm("למחוק את האימייל+סיסמה השמורים ל-Auto-Login?");
      if (!ok) return;
      await setStore({ creds: null });
      alert("הסיסמה השמורה נמחקה.");
    } catch (e) {
      console.error("[LWCN] Clear saved password failed:", e);
    }
  }
  
  async function registerMenus() {
    try {
      if (typeof GM_registerMenuCommand !== "function") return;
      GM_registerMenuCommand("LW Customer Notes – Status (מחובר/לא מחובר)", () => lwcnMenuStatus());
      GM_registerMenuCommand("LW Customer Notes – Login (Email OTP / Magic Link)", () => lwcnMenuLoginOtp());
      GM_registerMenuCommand("LW Customer Notes – Verify OTP / TokenHash", () => lwcnMenuVerifyOtp());
      GM_registerMenuCommand("LW Customer Notes – Login (email+password)", () => lwcnMenuLoginPassword());
      GM_registerMenuCommand("LW Customer Notes – Logout", () => lwcnMenuLogout());
      GM_registerMenuCommand("LW Customer Notes – Clear saved Auto-Login password", () => lwcnMenuClearSavedPassword());
    } catch (_) {}
  }
  registerMenus();
  
  // Try consume Magic Link token_hash if present
  tryConsumeTokenHashFromUrl().catch(() => {});
  
  
  // Lionwheel Customer Notes (Supabase REST) - Content Script
  // Stores notes per customer_key where customer_key = normalized phone (local format, e.g. 052...).
  
  // Cross-browser API (Chrome + Firefox)
  // EXT API not available in userscript; using GM_* storage and direct Supabase REST.
  
  // Hardcoded Supabase config (team deployment)
  const SB_URL = "https://xfwxplrtetxlyvppfhaf.supabase.co";
  const SB_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhmd3hwbHJ0ZXR4bHl2cHBmaGFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5NjQyMjMsImV4cCI6MjA4MzU0MDIyM30.7rg-gAEUM0kCSD2QKLXjz9ZUkwAjzpeYnTPU8tDrHvA";
  
  // Default operator email (can be changed via the Tampermonkey login prompt)
  const DEFAULT_LOGIN_EMAIL = "adam.lee.9186@gmail.com";
  
  // Team tenant (shared notes)
  const TENANT_ID = "anipet_team";
  
  const CFG_KEYS = ["sbSession"];
  
  // ---- Supabase JS SDK (for OTP / verify flows) ----
  // Loaded via @require (UMD). Global is usually `supabase`.
  function getSupabaseSdk() {
    const sdk = (typeof supabase !== "undefined" ? supabase : (typeof window !== "undefined" ? window.supabase : null));
    if (!sdk || typeof sdk.createClient !== "function") {
      throw new Error("Supabase SDK לא נטען. ודא שה-@require של supabase-js קיים בכותרת ה-userscript.");
    }
    return sdk;
  }
  
  let __sbClient = null;
  function getSupabaseClient() {
    if (__sbClient) return __sbClient;
    const sdk = getSupabaseSdk();
    __sbClient = sdk.createClient(SB_URL, SB_ANON, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });
    return __sbClient;
  }
  
  // Attempt to consume token_hash from URL (if Magic Link redirected back to Lionwheel)
  async function tryConsumeTokenHashFromUrl() {
    try {
      const u = new URL(location.href);
      const tokenHash = u.searchParams.get("token_hash");
      const type = u.searchParams.get("type");
      if (!tokenHash || (type && type !== "email")) return false;
  
      const sb = getSupabaseClient();
      const { data, error } = await sb.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
      if (error) throw error;
  
      if (data?.session?.access_token) {
        const session = {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_at: nowSec() + (data.session.expires_in || 3600) - 30,
          user_id: data.session.user?.id || null,
          email: data.session.user?.email || null
        };
        await setStore({ sbSession: session });
      }
  
      // Clean URL (remove token_hash)
      u.searchParams.delete("token_hash");
      u.searchParams.delete("type");
      history.replaceState({}, document.title, u.toString());
      return true;
    } catch (e) {
      console.warn("[LWCN] Failed to consume token_hash from URL:", e);
      return false;
    }
  }
  
  function nowSec() {
    return Math.floor(Date.now() / 1000);
  }
  
  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
  
  // Cross-browser storage wrapper (Firefox returns Promise, Chrome uses callbacks)
  // Userscript storage helpers (Tampermonkey/Violentmonkey compatible)
  async function gmGet(key, defVal = null) {
    try {
      if (typeof GM_getValue === "function") return GM_getValue(key, defVal);
    } catch (_) {}
    try {
      if (typeof GM !== "undefined" && typeof GM.getValue === "function") return await GM.getValue(key, defVal);
    } catch (_) {}
    return defVal;
  }
  async function gmSet(key, val) {
    try {
      if (typeof GM_setValue === "function") return GM_setValue(key, val);
    } catch (_) {}
    try {
      if (typeof GM !== "undefined" && typeof GM.setValue === "function") return await GM.setValue(key, val);
    } catch (_) {}
  }
  async function gmDel(key) {
    try {
      if (typeof GM_deleteValue === "function") return GM_deleteValue(key);
    } catch (_) {}
    try {
      if (typeof GM !== "undefined" && typeof GM.deleteValue === "function") return await GM.deleteValue(key);
    } catch (_) {}
  }
  
  // Extension used chrome.storage.local; userscript uses GM storage
  async function getStore() {
    return {
      sbSession: await gmGet("sbSession", null),
      creds: await gmGet("lwcnCreds", null),
      lastLoginEmail: await gmGet("lastLoginEmail", null)
    };
  }
  async function setStore(obj) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, "sbSession")) await gmSet("sbSession", obj.sbSession);
    if (obj && Object.prototype.hasOwnProperty.call(obj, "creds")) await gmSet("lwcnCreds", obj.creds);
    if (obj && Object.prototype.hasOwnProperty.call(obj, "lastLoginEmail")) await gmSet("lastLoginEmail", obj.lastLoginEmail);
  }
  
  function parseHashTokens() {
    const h = String(location.hash || "");
    if (!h.includes("access_token=") || !h.includes("refresh_token=")) return null;
  
    const params = new URLSearchParams(h.replace(/^#/, ""));
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    const expires_in = Number(params.get("expires_in") || "3600");
    if (!access_token || !refresh_token) return null;
  
    return {
      access_token,
      refresh_token,
      expires_at: nowSec() + expires_in - 30
    };
  }
  
  async function captureMagicLinkSessionIfPresent() {
    const tok = parseHashTokens();
    if (!tok) return;
  
    await setStore({ sbSession: tok });
  
    // Clean URL hash immediately (remove tokens from address bar)
    history.replaceState(null, document.title, location.pathname + location.search);
  }
  
  function normalizeIsraeliPhoneToE164(raw) {
    // We intentionally DO NOT use +972/E164 because Lionwheel uses local phone.
    // Normalize to digits only, and to a consistent LOCAL format (leading 0).
    let s = String(raw || "").trim().replace(/[^\d]/g, "");
    if (!s) return null;
  
    // International prefix sometimes comes as 00
    if (s.startsWith("00")) s = s.slice(2);

    // Israel country code handling
    if (s.startsWith("972")) {
      s = s.slice(3);
      // Fix double zero error: if source was "972050..." -> we now have "050..."
      // If source was "97250..." -> we have "50..." so we need to add 0 later.
    }

    // If it starts with 0 now, it's likely fine (050..., 03...)
    if (s.startsWith("0")) return s;

    // If local number was provided without the leading 0 (common in some exports/views)
    // - mobile: 5XXXXXXXX (9 digits total) -> 05XXXXXXXX
    // - landline: 2/3/4/8/9XXXXXXX (8 digits total) -> 0X...
    if (s.length === 9 || s.length === 8) {
      return "0" + s;
    }
  
    return s;
  }
  
  function lwcnNormalizeHeaderText(s) {
    return String(s || "").replace(/\s+/g, " ").trim();
  }
  
  // Robust cell lookup for responsive/mobile DataTables where some columns are hidden
  // and "index-based" access becomes unreliable.
  function lwcnGetRowCellByLabel(row, headers, labelExact) {
    if (!row) return null;
    const label = lwcnNormalizeHeaderText(labelExact);
    if (!label) return null;

    // 1) DataTables responsive often stores the column header name in data-title / data-label
    // Optimization: Use row.cells collection instead of querySelectorAll to allow faster access
    // and strictly target direct children.
    const cells = Array.from(row.cells || []);
    for (const td of cells) {
      const dtTitle = lwcnNormalizeHeaderText(td.getAttribute("data-title") || td.getAttribute("data-label"));
      if (dtTitle && dtTitle === label) return td;

      const aria = lwcnNormalizeHeaderText(td.getAttribute("aria-label"));
      if (aria && (aria === label || aria.startsWith(label + ":"))) return td;
    }

    // 2) Fallback: header index (works when all columns are visible)
    const colIdx = lwcnFindTableColIndexByHeader(headers, labelExact);
    if (colIdx >= 0 && cells[colIdx]) return cells[colIdx];

    return null;
  }
  
  function lwcnFindTableColIndexByHeader(table, headerText) {
    // Compatible with passing a real table or array of header elements
    if (!table) return -1;
    
    const target = lwcnNormalizeHeaderText(headerText);
    const ths = Array.isArray(table) ? table : Array.from(table.querySelectorAll("thead th"));
    
    // Pass 1: Exact match (prevents "User Name" matching "Name")
    for (let i = 0; i < ths.length; i++) {
      const t = lwcnNormalizeHeaderText(ths[i]?.textContent);
      if (t === target) return i;
    }
    
    // Pass 2: Partial match (fallback)
    for (let i = 0; i < ths.length; i++) {
      const t = lwcnNormalizeHeaderText(ths[i]?.textContent);
      // Lionwheel sometimes injects sorting hints into aria-label; prefer visible text.
      if (!t) continue;
      if (t.includes(target)) return i;
    }
    
    return -1;
  }
  
  function lwcnEnsureTableCellWrap(td) {
    if (!td) return null;
    td.classList.add("lwcn-note-cell");
    
    // Safety: Do not wrap cells that contain form inputs (inline editing) to avoid breaking LW logic
    if (td.querySelector("input, select, textarea")) return null;

    let wrap = td.querySelector(":scope > .lwcn-cellwrap");
    if (wrap) return wrap;
  
    wrap = document.createElement("span");
    wrap.className = "lwcn-cellwrap";
  
    const text = document.createElement("span");
    text.className = "lwcn-celltext";
  
    // Move existing content into text holder (keeps tooltips/spans intact)
    while (td.firstChild) text.appendChild(td.firstChild);
  
    wrap.appendChild(text);
    td.appendChild(wrap);
    return wrap;
  }
  
  function lwcnIsTableBtn(btn) {
    try { return String(btn?.getAttribute("data-lwcn-table")) === "1"; }
    catch { return false; }
  }
  
  function lwcnSetButtonState(btn, hasNote) {
    if (!btn || !btn.classList) return;
    const has = !!hasNote;
    btn.classList.toggle("lwcn-has-note", has);
  
    // Table buttons should NEVER blink/glow.
    if (lwcnIsTableBtn(btn)) {
      btn.classList.remove("lwcn-blink");
      return;
    }
  
    // Order page button: blink when there's a note.
    btn.classList.toggle("lwcn-blink", has);
  }
  
  function findDestinationPhoneText() {
    // Based on your HTML:
    // <div data-name="destination_phone"> ... <span class="hover-copy">0527...</span>
    const phoneRow = document.querySelector('div.row[data-name="destination_phone"]');
    if (!phoneRow) return null;
    const span = phoneRow.querySelector(".col-xxl-7 .hover-copy");
    const txt = span?.textContent?.trim() || "";
    return txt || null;
  }
  
  function findDestinationNameText() {
    // <div class="row ..." data-name="destination_recipient_name"> ... <span class="hover-copy">אדם לי</span>
    const row = document.querySelector('div.row[data-name="destination_recipient_name"]');
    if (!row) return null;
    // Sometimes Lionwheel renders name as a link inside .editable-text (no .hover-copy)
    // Examples:
    // 1) <span class="hover-copy editable-text">...</span>
    // 2) <span class="editable-text"><a ...>...</a></span>
    const span =
      row.querySelector(".col-xxl-7 .hover-copy") ||
      row.querySelector(".col-xxl-7 span.editable-text") ||
      row.querySelector(".col-xxl-7 .editable-text a");
    const txt = span?.textContent?.trim() || "";
    return txt || null;
  }
  
  function getAnchorSpanForName() {
    const row = document.querySelector('div.row[data-name="destination_recipient_name"]');
    if (!row) return null;
    // Prefer the actual name span/link, but we will append the button to its container (col-xxl-7).
    return (
      row.querySelector(".col-xxl-7 .hover-copy") ||
      row.querySelector(".col-xxl-7 span.editable-text") ||
      row.querySelector(".col-xxl-7 .editable-text a")
    );
  }
  
  function getNameHostEl() {
    const row = document.querySelector('div.row[data-name="destination_recipient_name"]');
    if (!row) return null;
    return row.querySelector(".col-xxl-7");
  }
  
  function getAnchorSpanForPhone() {
    const phoneRow = document.querySelector('div.row[data-name="destination_phone"]');
    if (!phoneRow) return null;
    return phoneRow.querySelector(".col-xxl-7 .hover-copy");
  }
  
  async function supabaseRefreshToken(sbUrl, sbAnon, refresh_token) {
    const url = `${sbUrl.replace(/\/$/, "")}/auth/v1/token?grant_type=refresh_token`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "apikey": sbAnon,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ refresh_token })
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`Refresh failed (${res.status}): ${t}`);
    }
    const data = await res.json();
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: nowSec() + (data.expires_in || 3600) - 30,
      user_id: data.user?.id || null,
      email: data.user?.email || null
    };
  }
  
  async function supabasePasswordLogin(sbUrl, sbAnon, email, password) {
    const base = sbUrl.replace(/\/$/, "");
    const url = `${base}/auth/v1/token?grant_type=password`;
    const body = new URLSearchParams({ email: String(email || ""), password: String(password || "") });
  
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "apikey": sbAnon,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    });
  
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      if (res.status === 400) throw new Error("התחברות נכשלה: בדוק אימייל/סיסמה.");
      throw new Error(`שגיאת התחברות (${res.status}): ${t}`);
    }
  
    const data = await res.json();
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: nowSec() + (data.expires_in || 3600) - 30,
      user_id: data.user?.id || null,
      email: data.user?.email || null
    };
  }
  
  async function ensureSession() {
    const { sbSession, creds } = await getStore();
    if (!SB_URL || !SB_ANON) throw new Error("חסר Supabase config בקוד");
  
    // 1) Already have a valid access token?
    if (sbSession?.access_token && (sbSession.expires_at || 0) > nowSec() + 10) {
      return { sbUrl: SB_URL, sbAnon: SB_ANON, session: sbSession };
    }
  
    // 2) Refresh token if possible
    if (sbSession?.refresh_token) {
      const refreshed = await supabaseRefreshToken(SB_URL, SB_ANON, sbSession.refresh_token);
      const merged = { ...sbSession, ...refreshed };
      await setStore({ sbSession: merged });
      return { sbUrl: SB_URL, sbAnon: SB_ANON, session: merged };
    }
  
    // 3) Optional auto-login via stored credentials (if user enabled it)
    if (creds?.email && creds?.password) {
      const session = await supabasePasswordLogin(SB_URL, SB_ANON, creds.email, creds.password);
      await setStore({ sbSession: session });
      return { sbUrl: SB_URL, sbAnon: SB_ANON, session };
    }
  
    throw new Error("לא מחובר. פתח Tampermonkey → תפריט הסקריפט → Login (Email OTP / Magic Link) או Login (email+password).");
  }
  
  // --- customer_notes (single note per customer) (single note per customer) ---
  async function dbCreateCustomerNote({ sbUrl, sbAnon, access_token, user_id, customer_key, note }) {
    const base = sbUrl.replace(/\/$/, "");
    const url = `${base}/rest/v1/customer_notes`;
  
    const payload = {
      user_id, // IMPORTANT if column is NOT NULL
      customer_key,
      note: String(note || ""),
      updated_at: new Date().toISOString()
    };
  
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "apikey": sbAnon,
        "Authorization": `Bearer ${access_token}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation"
      },
      body: JSON.stringify(payload)
    });
  
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`DB create failed (${res.status}): ${t}`);
    }
    const rows = await res.json();
    return rows?.[0];
  }
  
  async function dbUpdateCustomerNote({ sbUrl, sbAnon, access_token, id, note }) {
    const base = sbUrl.replace(/\/$/, "");
    const url =
      `${base}/rest/v1/customer_notes` +
      `?id=eq.${encodeURIComponent(id)}`;
  
    const payload = {
      note: String(note || ""),
      updated_at: new Date().toISOString()
    };
  
    const res = await fetch(url, {
      method: "PATCH",
      headers: {
        "apikey": sbAnon,
        "Authorization": `Bearer ${access_token}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      },
      body: JSON.stringify(payload)
    });
  
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`DB update failed (${res.status}): ${t}`);
    }
  }
  
  async function dbDeleteCustomerNote({ sbUrl, sbAnon, access_token, id }) {
    const base = sbUrl.replace(/\/$/, "");
    const url =
      `${base}/rest/v1/customer_notes` +
      `?id=eq.${encodeURIComponent(id)}`;
  
    const res = await fetch(url, {
      method: "DELETE",
      headers: {
        "apikey": sbAnon,
        "Authorization": `Bearer ${access_token}`
      }
    });
  
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`DB delete failed (${res.status}): ${t}`);
    }
  }
  
  // Background service worker API wrappers (production-ready, cross-browser)
  
  
  async function dbGetSingleNote({ sbUrl, sbAnon, access_token, customer_key }) {
    if (!sbUrl || !sbAnon || !access_token) throw new Error("Missing required parameters for DB call");
    const base = sbUrl.replace(/\/$/, "");
    const url =
      `${base}/rest/v1/customer_notes` +
      `?select=id,note,updated_at` +
      `&customer_key=eq.${encodeURIComponent(customer_key)}` +
      `&order=updated_at.desc` +
      `&limit=1`;
  
    const res = await fetch(url, {
      headers: {
        "apikey": sbAnon,
        "Authorization": `Bearer ${access_token}`
      }
    });
  
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      if (res.status === 401) throw new Error(`Invalid API key or expired token (401). Check your Supabase anon key. Response: ${t}`);
      throw new Error(`DB read failed (${res.status}): ${t}`);
    }
  
    const rows = await res.json();
    return rows?.[0] || null;
  }
  
  // Lightweight notes index for the main table:
  // - Avoids N network requests (one per row) by fetching all customer_key values once.
  // - Cache is short-lived and gets updated/invalidated on save/delete.
  const lwcnNotesIndexCache = {
    at: 0,
    map: null, // Set<string>
    sbUrl: null,
    sbAnon: null,
    access_token: null
  };
  const LWCN_NOTES_INDEX_TTL_MS = 2 * 60 * 1000;
  
  function invalidateNotesIndex() {
    lwcnNotesIndexCache.at = 0;
    lwcnNotesIndexCache.map = null;
  }
  
  function lwcnUpdateNotesIndexCache(customerKey, hasNote) {
    try {
      if (!lwcnNotesIndexCache.map) return;
      const k = normalizeIsraeliPhoneToE164(customerKey);
      if (!k) return;
      if (hasNote) lwcnNotesIndexCache.map.add(k);
      else lwcnNotesIndexCache.map.delete(k);
    } catch (_) {}
  }
  
  // Unified Scan Scheduler (Debounced)
  let lwcnScanTimer = null;
  function lwcnScheduleScan(reason) {
    if (lwcnScanTimer) return;
    lwcnScanTimer = setTimeout(() => {
      lwcnScanTimer = null;
      attachToMainTable().catch(() => {});
      attachOncePerCustomer().catch(() => {});
    }, 200);
  }
  
  async function dbGetNotesIndex({ sbUrl, sbAnon, access_token }) {
    if (!sbUrl || !sbAnon || !access_token) throw new Error("Missing required parameters for DB call");
    const base = sbUrl.replace(/\/$/, "");
    const limit = 1000;
    let offset = 0;
    const out = new Set();
  
    while (true) {
      const url =
        `${base}/rest/v1/customer_notes` +
        `?select=customer_key,note` +
        `&order=updated_at.desc` +
        `&limit=${limit}` +
        `&offset=${offset}`;
  
      const res = await fetch(url, {
        headers: {
          "apikey": sbAnon,
          "Authorization": `Bearer ${access_token}`
        }
      });
  
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`Failed to load notes index (${res.status}): ${t || res.statusText}`);
      }
  
      const rows = await res.json().catch(() => []);
      for (const r of rows || []) {
        const key = normalizeIsraeliPhoneToE164(r?.customer_key);
        const note = String(r?.note || "").trim();
        if (key && note) out.add(key);
      }
  
      if (!rows || rows.length < limit) break;
      offset += limit;
    }
  
    return out;
  }
  
  async function getNotesIndexCached({ sbUrl, sbAnon, access_token }) {
    const now = Date.now();
    const sameSession =
      lwcnNotesIndexCache.sbUrl === sbUrl &&
      lwcnNotesIndexCache.sbAnon === sbAnon &&
      lwcnNotesIndexCache.access_token === access_token;
  
    if (sameSession && lwcnNotesIndexCache.map && (now - lwcnNotesIndexCache.at) < LWCN_NOTES_INDEX_TTL_MS) {
      return lwcnNotesIndexCache.map;
    }
  
    const set = await dbGetNotesIndex({ sbUrl, sbAnon, access_token });
    lwcnNotesIndexCache.at = now;
    lwcnNotesIndexCache.map = set;
    lwcnNotesIndexCache.sbUrl = sbUrl;
    lwcnNotesIndexCache.sbAnon = sbAnon;
    lwcnNotesIndexCache.access_token = access_token;
    return set;
  }
  
  // Fallback: Direct API calls (for backward compatibility or if background fails)
  async function dbDeleteByCustomerKey({ sbUrl, sbAnon, access_token, customer_key }) {
    const base = sbUrl.replace(/\/$/, "");
    const url =
      `${base}/rest/v1/customer_notes` +
      `?customer_key=eq.${encodeURIComponent(customer_key)}`;
  
    const res = await fetch(url, {
      method: "DELETE",
      headers: {
        "apikey": sbAnon,
        "Authorization": `Bearer ${access_token}`
      }
    });
  
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`DB delete failed (${res.status}): ${t}`);
    }
    // Update cache immediately instead of invalidating everything
    lwcnUpdateNotesIndexCache(customer_key, false);
    lwcnScheduleScan("delete-note");
  }
  
  async function dbSaveSingleNote({ sbUrl, sbAnon, access_token, user_id, customer_key, note }) {
    const cleanNote = String(note || "");
  
    // empty => delete
    if (!cleanNote.trim()) {
      await dbDeleteByCustomerKey({ sbUrl, sbAnon, access_token, customer_key });
      return null;
    }
  
    const base = sbUrl.replace(/\/$/, "");
    // UPSERT by customer_key (requires UNIQUE on customer_key)
    const url = `${base}/rest/v1/customer_notes?on_conflict=customer_key`;
  
    const payload = {
      user_id, // IMPORTANT if column is NOT NULL
      customer_key,
      note: cleanNote,
      updated_at: new Date().toISOString()
    };
  
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "apikey": sbAnon,
        "Authorization": `Bearer ${access_token}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation,resolution=merge-duplicates"
      },
      body: JSON.stringify(payload)
    });
  
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      if (res.status === 401) throw new Error(`Invalid API key or expired token (401). Check your Supabase anon key. Response: ${t}`);
      if (res.status === 403) throw new Error("אין הרשאות — בדוק RLS/Policies.");
      if (res.status === 409) throw new Error("קונפליקט DB — בדוק UNIQUE/UPSERT.");
      throw new Error(`שגיאת שמירה (${res.status}): ${t}`);
    }

    // Update cache immediately
    lwcnUpdateNotesIndexCache(customer_key, true);
    lwcnScheduleScan("save-note");

    const rows = await res.json();
    return rows?.[0] || null;
  }
  
  async function dbDeleteSingleNote({ sbUrl, sbAnon, access_token, customer_key }) {
    await dbDeleteByCustomerKey({ sbUrl, sbAnon, access_token, customer_key });
  }
  
  // Global position tracking state
  let activePositionInterval = null;
  let activeScrollHandler = null;
  let activeUpdatePos = null;
  
  function closeBubble() {
    // Clean up position tracking
    if (activePositionInterval) {
      clearInterval(activePositionInterval);
      activePositionInterval = null;
    }
    if (activeScrollHandler) {
      window.removeEventListener("scroll", activeScrollHandler, { capture: true });
      activeScrollHandler = null;
    }
    activeUpdatePos = null;
  
    // Close both shadow host and regular bubble (for backward compatibility)
    const shadowHost = document.querySelector("#lwcn-shadow-host");
    if (shadowHost) {
      shadowHost.remove();
      return;
    }
    const regularBubble = document.querySelector(".lwcn-bubble");
    if (regularBubble) {
      regularBubble.remove();
    }
  }
  
  function placeBubbleNearFixed(btn, bubble) {
    // Get button position relative to viewport (works with fixed positioning)
    const r = btn.getBoundingClientRect();
  
    // Check if button disappeared (e.g., sidepanel closed)
    if ((r.width === 0 && r.height === 0) || r.top === 0 && r.left === 0 && r.bottom === 0 && r.right === 0) {
      closeBubble();
      return;
    }
  
    // Wait for bubble to be measured (in case it's not yet rendered)
    if (!bubble || bubble.offsetWidth === 0) {
      requestAnimationFrame(() => placeBubbleNearFixed(btn, bubble));
      return;
    }
  
    const bubbleRect = bubble.getBoundingClientRect();
    const bubbleW = bubbleRect.width || 360;
    const bubbleH = bubbleRect.height || 160;
  
    // Calculate viewport position (fixed positioning uses viewport coordinates)
    let viewportLeft = r.left - bubbleW - 12;
    let side = "left";
  
    // If not enough space on left, place on right
    if (viewportLeft < 8) {
      viewportLeft = r.right + 12;
      side = "right";
    }
  
    // Clamp to viewport boundaries
    viewportLeft = Math.max(8, Math.min(window.innerWidth - bubbleW - 8, viewportLeft));
  
    // Center vertically relative to button
    let viewportTop = r.top + (r.height / 2) - (bubbleH / 2);
  
    // Clamp to viewport bounds
    viewportTop = Math.max(8, Math.min(window.innerHeight - bubbleH - 8, viewportTop));
  
    // Position the bubble with fixed positioning (relative to viewport)
    bubble.style.position = "fixed";
    bubble.style.left = `${viewportLeft}px`;
    bubble.style.top = `${viewportTop}px`;
    bubble.style.zIndex = "2147483647";
  
    if (bubble.dataset) bubble.dataset.side = side;
  
    // Calculate caret position (arrow pointing to button center)
    const caretTop = r.top + (r.height / 2) - viewportTop;
    if (bubble.style) bubble.style.setProperty("--lwcn-caret-top", `${Math.max(18, Math.min(bubbleH - 18, caretTop))}px`);
  }
  
  function fmtUpdatedAt(iso) {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "";
      return new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short" }).format(d);
    } catch {
      return "";
    }
  }
  
  function formatILDateTime(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleString("he-IL", {
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch {
      return "";
    }
  }
  
  function lwcnNextFrame() {
    return new Promise((r) => requestAnimationFrame(() => r()));
  }
  
  async function lwcnWaitForStyledBubble(bubble, maxFrames = 12) {
    // Wait until computed styles look like the real bubble (not raw div)
    for (let i = 0; i < maxFrames; i++) {
      const cs = getComputedStyle(bubble);
      // Heuristic: border-radius and box-shadow become non-trivial when CSS is applied
      if (cs.borderTopLeftRadius !== "0px" && cs.boxShadow && cs.boxShadow !== "none") return true;
      await lwcnNextFrame();
    }
    return false;
  }
  
  // Convert Markdown-style formatting to HTML (Gemini-style simple approach)
  function markdownToHtml(text) {
    if (!text) return '<span style="color:#6b7280; font-style:italic;">לחץ כדי להוסיף הערה...</span>';
    
    // Escape HTML to prevent injection
    let html = escapeHtml(text);
    
    // Split lines to handle bullets and formatting
    const lines = html.split('\n');
    const processedLines = lines.map(line => {
      let processed = line;
      
      // 1. Bold (*text*) - handle single asterisk
      processed = processed.replace(/\*([^*\n]+)\*/g, '<b>$1</b>');
      
      // 2. Italic (_text_) - handle single underscore
      processed = processed.replace(/_([^_\n]+)_/g, '<i>$1</i>');
      
      // 3. Underline (__text__) - handle double underscore (check before single)
      processed = processed.replace(/__([^_\n]+)__/g, '<u style="text-decoration: underline;">$1</u>');
      
      // 4. Strikethrough (~text~)
      processed = processed.replace(/~([^~\n]+)~/g, '<s style="color:#777;">$1</s>');
      
      // 5. Bullets (* at start of line) - Gemini style with visual bullet
      if (processed.trim().startsWith('* ')) {
        // Remove the asterisk and wrap in a styled bullet div
        const content = processed.replace(/^\s*\*\s/, '');
        return `<div style="display:flex; align-items:flex-start; margin-bottom:4px;"><span style="margin-left:8px; color:#555; font-size:16px;">•</span><span>${content}</span></div>`;
      }
      
      // Regular line
      return `<div style="margin-bottom:4px;">${processed || '<br>'}</div>`;
    });
    
    return processedLines.join('');
  }
  
  function lwcnPositionBubbleOnce(bubble, btn) {
    // Position relative to the button, with left/right fallback
    const r = btn.getBoundingClientRect();
  
    // Check if button disappeared
    if ((r.width === 0 && r.height === 0) || r.top === 0 && r.left === 0 && r.bottom === 0 && r.right === 0) {
      return;
    }
  
    // Wait for bubble to be measured
    if (!bubble || bubble.offsetWidth === 0) {
      return;
    }
  
    const br = bubble.getBoundingClientRect();
    const bubbleW = br.width || 360;
    const bubbleH = br.height || 160;
  
    // Calculate viewport position (fixed positioning uses viewport coordinates)
    let viewportLeft = Math.round(r.left - bubbleW - 12);
    let side = "left";
  
    // If not enough space on left, place on right
    if (viewportLeft < 8) {
      viewportLeft = Math.round(r.right + 12);
      side = "right";
    }
  
    // Clamp to viewport boundaries
    viewportLeft = Math.max(8, Math.min(window.innerWidth - bubbleW - 8, viewportLeft));
  
    // Center vertically relative to button
    let viewportTop = Math.round(r.top + (r.height / 2) - (bubbleH / 2));
  
    // Clamp to viewport bounds
    viewportTop = Math.max(8, Math.min(window.innerHeight - bubbleH - 8, viewportTop));
  
    bubble.style.position = "fixed";
    bubble.style.left = `${viewportLeft}px`;
    bubble.style.top = `${viewportTop}px`;
    bubble.style.zIndex = "2147483647";
  
    if (bubble.dataset) bubble.dataset.side = side;
  
    // Calculate caret position (arrow pointing to button center)
    const caretTop = r.top + (r.height / 2) - viewportTop;
    if (bubble.style) {
      bubble.style.setProperty("--lwcn-caret-top", `${Math.max(18, Math.min(bubbleH - 18, caretTop))}px`);
    }
  }
  
  function renderBubble({ btn, phone_raw, customer_name, noteText, updatedAtText, onChangeText }) {
    closeBubble();
  
    // יצירת Shadow Host כדי לבודד את העיצוב
    const host = document.createElement("div");
    host.id = "lwcn-shadow-host";
    // Host הגדרות בסיס - full viewport coverage with pointer-events none
    Object.assign(host.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none", // מאפשר קליקים דרך ה-host, רק הבועה תתפוס אותם
      zIndex: "2147483647"
    });
  
    const shadow = host.attachShadow({ mode: "open" });
  
    // הזרקת ה-CSS לתוך ה-Shadow DOM (userscript: אין extension getURL)
    const style = document.createElement("style");
    style.textContent = LWCN_CSS;
    shadow.appendChild(style);
  
    // Styles are available synchronously when injected as <style>
    const waitForCss = async () => {};
  
    const bubble = document.createElement("div");
    // Start hidden (NOT just opacity=0) so the user never sees a "wrong" position frame.
    bubble.className = "lwcn-bubble lwcn-enter";
    Object.assign(bubble.style, {
      position: "fixed",
      pointerEvents: "auto",
      visibility: "hidden"
    });
    const safeName = escapeHtml(customer_name || "לקוח");
    const noteTextClean = String(noteText || "").trim();
    const hasNote = !!noteTextClean;
    if (hasNote) bubble.classList.add("lwcn-has-note");
  
    // SVG icons for Shadow DOM (no external dependencies)
    const noteIconSVG = `<svg class="lwcn-titleicon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`;
    const closeIconSVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    // Pencil icon for "updated" line (reused in multiple places)
    const pencilIconSVG = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="opacity:0.75;margin-left:6px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
  
    bubble.innerHTML = `
      <div class="top" dir="rtl">
        <div>
          <div class="title">
            ${noteIconSVG}
            <span>הערות עבור ${safeName}</span>
          </div>
        </div>
        <button class="lwcn-closebtn" data-act="close" title="סגור" aria-label="סגור">
          ${closeIconSVG}
        </button>
      </div>
      <div class="body" dir="rtl">
        <div class="lwcn-editor-wrapper">
          <div class="lwcn-preview ${hasNote ? "" : "is-empty"} is-visible" data-role="preview"></div>
          <textarea class="lwcn-textarea ${hasNote ? "" : "is-empty"}" readonly
            placeholder="לחץ כדי להוסיף הערה..."></textarea>
        </div>
        <div class="lwcn-autosave-hint">
          <span class="lwcn-dot ok" data-role="dot"></span>
          <span data-role="hint">שמירה אוטומטית</span>
        </div>
        <div class="lwcn-updated" data-role="updated"></div>
      </div>
    `;
  
    // Make bubble respond to pointer events (re-enable after host's pointerEvents: none)
    bubble.style.pointerEvents = "auto";
  
    const ta = bubble.querySelector(".lwcn-textarea");
    const preview = bubble.querySelector('[data-role="preview"]');
    const dot = bubble.querySelector('[data-role="dot"]');
    const updatedEl = bubble.querySelector('[data-role="updated"]');
    const hintEl = bubble.querySelector('[data-role="hint"]');
  
    // Function to update preview with formatted HTML (Gemini-style)
    function updatePreview() {
      const text = ta.value || "";
      preview.innerHTML = markdownToHtml(text);
      if (!text.trim()) {
        preview.classList.add("is-empty");
      } else {
        preview.classList.remove("is-empty");
      }
    }
    
    // Toggle Logic (Gemini-style)
    function showEdit() {
      preview.classList.remove("is-visible");
      ta.classList.add("is-editing");
      ta.removeAttribute("readonly");
      autosize();
      ta.focus();
      // Place cursor at end
      const len = ta.value.length;
      ta.setSelectionRange(len, len);
    }
    
    function showView() {
      ta.classList.remove("is-editing");
      ta.setAttribute("readonly", "");
      updatePreview();
      preview.classList.add("is-visible");
    }
  
    // IMPORTANT: set textarea value via .value (prevents leading whitespace/indent bugs)
    ta.value = noteTextClean;
    updatePreview();
  
    // updated line (if exists) - pencilIconSVG already defined above
    if (updatedAtText) {
      updatedEl.innerHTML = `${pencilIconSVG} עודכן: ${escapeHtml(updatedAtText)}`;
    } else if (noteText) {
      // Fallback: use current time if we have text but no updated_at
      updatedEl.innerHTML = `${pencilIconSVG} עודכן: ${escapeHtml(formatILDateTime(new Date().toISOString()))}`;
    }
  
    // auto height - responsive to content
    const MIN_TA_H = 120; // Min height when empty or minimal text
    // Dynamic max height: 55% of viewport or 360px, whichever is smaller
    // This ensures it works well on different screen sizes
    const MAX_TA_H = Math.min(360, Math.floor(window.innerHeight * 0.55));
  
    function autosize() {
      // Reset to auto to get accurate scrollHeight
      ta.style.height = "auto";
      ta.style.overflowY = "hidden"; // Reset overflow
  
      const scrollHeight = ta.scrollHeight;
      const desiredHeight = scrollHeight + 2; // Add small padding for safety
  
      if (desiredHeight <= MIN_TA_H) {
        // Minimal text or empty - use min height
        ta.style.height = MIN_TA_H + "px";
        ta.style.overflowY = "hidden";
      } else if (desiredHeight >= MAX_TA_H) {
        // Long text - use max height with scrollbar
        ta.style.height = MAX_TA_H + "px";
        ta.style.overflowY = "auto";
      } else {
        // Normal text - auto height
        ta.style.height = desiredHeight + "px";
        ta.style.overflowY = "hidden";
      }
    }
  
    // Attach bubble to shadow root first
    shadow.appendChild(bubble);
  
    // Attach shadow host to document (so measurements are reliable)
    document.body.appendChild(host);
  
    // Wait for CSS to apply, then position once, then fade-in
    (async () => {
      // 1) Ensure Shadow CSS is ready (prevents "raw bubble" flash)
      await waitForCss();
      // 2) Allow DOM attach
      await lwcnNextFrame();
      // 3) Ensure the bubble is measured in its styled state
      await lwcnWaitForStyledBubble(bubble);
      // 4) Position twice BEFORE showing (prevents first-frame jump)
      lwcnPositionBubbleOnce(bubble, btn);
      await lwcnNextFrame();
      lwcnPositionBubbleOnce(bubble, btn);
      // 5) Now show + animate
      bubble.style.visibility = "visible";
      await lwcnNextFrame();
      bubble.classList.add("lwcn-enter--show");
    })();
  
    // פונקציה לעדכון מיקום בזמן אמת
    // This function tracks the button and updates bubble position continuously
    // משתנים לשמירת המיקום האחרון למניעת רעידות (stabilization)
    let lastTop = null;
    let lastLeft = null;
    let lastSide = null;
  
    function updatePos() {
      const rect = btn.getBoundingClientRect();
      // אם הכפתור נעלם מה-DOM (למשל סגרו את הפאנל), נסגור את הבועה
      if ((rect.width === 0 && rect.height === 0) ||
          (rect.top === 0 && rect.left === 0 && rect.bottom === 0 && rect.right === 0)) {
        closeBubble();
        return;
      }
  
      // Wait for bubble to be measured
      if (!bubble || bubble.offsetWidth === 0) {
        requestAnimationFrame(updatePos);
        return;
      }
  
      const bubbleRect = bubble.getBoundingClientRect();
      const bubbleW = bubbleRect.width || 360;
      const bubbleH = bubbleRect.height || 160;
  
      // Calculate viewport position (fixed positioning uses viewport coordinates)
      // עיגול הערכים למספרים שלמים כדי להתעלם משינויי תת-פיקסל של אנימציות
      let viewportLeft = Math.round(rect.left - bubbleW - 12);
      let side = "left";
  
      // If not enough space on left, place on right
      if (viewportLeft < 8) {
        viewportLeft = Math.round(rect.right + 12);
        side = "right";
      }
  
      // Clamp to viewport boundaries
      viewportLeft = Math.max(8, Math.min(window.innerWidth - bubbleW - 8, viewportLeft));
  
      // Center vertically relative to button
      // עיגול הערכים למספרים שלמים כדי להתעלם משינויי תת-פיקסל
      let viewportTop = Math.round(rect.top + (rect.height / 2) - (bubbleH / 2));
  
      // Clamp to viewport bounds
      viewportTop = Math.max(8, Math.min(window.innerHeight - bubbleH - 8, viewportTop));
  
      // עדכון ה-DOM רק אם השינוי משמעותי (יותר מ-1 פיקסל) או אם זה המיקום הראשון
      // Threshold: Update only if movement > 1px to prevent jittering from pulse animation
      const shouldUpdate = lastTop === null || lastLeft === null || lastSide !== side ||
        Math.abs(viewportTop - lastTop) > 1 || Math.abs(viewportLeft - lastLeft) > 1;
  
      if (shouldUpdate) {
        // Position the bubble with fixed positioning (relative to viewport)
        bubble.style.position = "fixed";
        bubble.style.left = `${viewportLeft}px`;
        bubble.style.top = `${viewportTop}px`;
        bubble.style.zIndex = "2147483647";
  
        if (bubble.dataset) bubble.dataset.side = side;
  
        // Calculate caret position (arrow pointing to button center)
        const caretTop = rect.top + (rect.height / 2) - viewportTop;
        if (bubble.style) {
          bubble.style.setProperty("--lwcn-caret-top", `${Math.max(18, Math.min(bubbleH - 18, caretTop))}px`);
        }
  
        // עדכון המיקום האחרון
        lastTop = viewportTop;
        lastLeft = viewportLeft;
        lastSide = side;
      }
    }
  
    // Store updatePos globally for cleanup
    activeUpdatePos = updatePos;
  
    // Start continuous positioning after initial fade-in
    setTimeout(() => {
      updatePos();
    }, 200); // Start tracking after fade-in completes
  
    // מאזין לגלילה בכל מקום בדף (כולל בתוך פאנלים)
    // Scroll listener with capture:true to catch scroll events in sidepanels
    activeScrollHandler = () => updatePos();
    window.addEventListener("scroll", activeScrollHandler, { capture: true, passive: true });
  
    // גיבוי למקרה של שינויי DOM מהירים
    // Interval as backup for rapid DOM changes (every 100ms)
    activePositionInterval = setInterval(updatePos, 100);
  
    // Initial sizing - after attach
    requestAnimationFrame(() => {
      autosize();
      // Reposition after sizing (because height might have changed)
      updatePos();
      // Re-check after fonts/rendering settle
      setTimeout(() => {
        autosize();
        updatePos();
      }, 60);
    });
  
    let savePending = false;
    let saveTimer = null;
  
    function setDot(state, msg) {
      dot.classList.remove("ok", "saving", "err");
      if (state === "saving") dot.classList.add("saving");
      else if (state === "err") dot.classList.add("err");
      else dot.classList.add("ok");
      if (msg) hintEl.textContent = msg;
      else hintEl.textContent = "שמירה אוטומטית";
    }
  
    async function saveNow() {
      // If user cleared the text, treat as "delete"
      const v = String(ta.value || "").trim();
      savePending = true;
      setDot("saving", "שומר…");
      try {
        const res = await onChangeText?.(v);
        setDot("ok", "נשמר");
        // pencilIconSVG already defined in outer scope
        if (res?.updated_at) {
          const f = formatILDateTime(res.updated_at);
          updatedEl.innerHTML = f ? (`${pencilIconSVG} עודכן: ${escapeHtml(f)}`) : "";
        } else {
          updatedEl.innerHTML = `${pencilIconSVG} עודכן: ${escapeHtml(formatILDateTime(new Date().toISOString()))}`;
        }
        ta.classList.toggle("is-empty", !v);
        bubble.classList.toggle("lwcn-has-note", !!v);
        // Update preview after save
        updatePreview();
        // Update button state
        lwcnSetButtonState(btn, !!v);
      } catch (e) {
        setDot("err", e?.message || "שגיאת שמירה");
      } finally {
        savePending = false;
        autosize();
        // Reposition after save (content might have changed height)
        requestAnimationFrame(() => {
          if (activeUpdatePos) activeUpdatePos();
        });
      }
    }
  
    function scheduleSave() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => saveNow().catch(() => {}), 450);
    }

    // --- Formatting Logic (WhatsApp Style) ---
    ta.addEventListener("keydown", (e) => {
      // 1. Shortcuts: Ctrl+B (Bold), Ctrl+I (Italic), Ctrl+U (Underline), Ctrl+S (Strikethrough)
      // משתמשים ב-* / _ / __ / ~ בסגנון WhatsApp/Markdown.
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        const key = e.key.toLowerCase();
        const map = {
          "b": "*",   // bold: *טקסט*
          "i": "_",   // italic: _טקסט_
          "u": "__",  // underline: __טקסט__
          "s": "~"    // strikethrough: ~טקסט~
        };

        if (map[key]) {
          e.preventDefault();
          const char = map[key];
          const start = ta.selectionStart;
          const end = ta.selectionEnd;
          const val = ta.value;
          const selected = val.substring(start, end);

          const before = val.substring(0, start);
          const after = val.substring(end);
          ta.value = before + char + selected + char + after;

          // הסמן יישב בתוך הטקסט – בין הסימנים
          ta.selectionStart = start + char.length;
          ta.selectionEnd = end + char.length;

          // מפעיל autosize + autosave כרגיל
          ta.dispatchEvent(new Event("input"));
          return;
        }
      }

      // 2. Smart Bullet List (* + Enter)
      if (e.key === "Enter") {
        const start = ta.selectionStart;
        const val = ta.value;

        // תחילת השורה הנוכחית
        const lastNewLine = val.lastIndexOf("\n", start - 1);
        const lineStart = lastNewLine + 1;
        const currentLineToCursor = val.substring(lineStart, start);

        // שורה שמתחילה ב-* (עם רווחים אפשריים לפני/אחרי)
        const match = currentLineToCursor.match(/^(\s*\*\s)/);

        if (match) {
          const bulletPrefix = match[1]; // למשל "* " או "  * "

          // A. אם השורה ריקה חוץ מהכוכבית → יציאה מהרשימה
          if (currentLineToCursor.trim() === "*") {
            e.preventDefault();
            const beforeLine = val.substring(0, lineStart);
            const afterCursor = val.substring(start);
            ta.value = beforeLine + afterCursor;
            ta.selectionStart = ta.selectionEnd = lineStart;
            ta.dispatchEvent(new Event("input"));
            return;
          }

          // B. פריט רגיל → יצירת שורה חדשה עם "* "
          e.preventDefault();
          const before = val.substring(0, start);
          const after = val.substring(start);
          const insertion = "\n" + bulletPrefix;

          ta.value = before + insertion + after;
          ta.selectionStart = ta.selectionEnd = start + insertion.length;
          ta.dispatchEvent(new Event("input"));
        }
      }
    });

    // Click on preview to edit (Gemini-style)
    preview.addEventListener("click", showEdit);
  
    ta.addEventListener("input", () => {
      autosize();
      // Update preview in real-time (for live preview while editing)
      updatePreview();
      // Reposition as user types (content height changes)
      if (activeUpdatePos) activeUpdatePos();
      scheduleSave();
    });
  
    ta.addEventListener("blur", () => {
      // return to view mode (Gemini-style)
      showView();
      // Recalculate height after returning to view
      requestAnimationFrame(() => {
        autosize();
        if (activeUpdatePos) activeUpdatePos();
      });
    });
  
    // סגירה חכמה
    const onDoc = (e) => {
      const t = e.target;
      // Check if click is outside shadow host and button
      if (!host.contains(t) && !host.shadowRoot?.contains(t) && t !== btn && !btn.contains(t)) {
        smartClose();
      }
    };
    const onKey = (e) => {
      if (e.key === "Escape") smartClose();
    };
  
    function cleanupListeners() {
      document.removeEventListener("pointerdown", onDoc, true);
      document.removeEventListener("keydown", onKey, true);
    }
  
    function smartClose() {
      // if save pending, wait a short moment
      if (savePending) {
        setTimeout(() => { closeBubble(); cleanupListeners(); }, 250);
        return;
      }
      closeBubble();
      cleanupListeners();
    }
  
    bubble.querySelector('[data-act="close"]').addEventListener("click", smartClose);
  
    // attach after the opening click finishes (prevents instant close)
    setTimeout(() => {
      document.addEventListener("pointerdown", onDoc, true);
      document.addEventListener("keydown", onKey, true);
    }, 0);
  
    // Re-position after layout settles (initial render)
    requestAnimationFrame(() => {
      autosize();
      if (activeUpdatePos) activeUpdatePos();
    });
    setTimeout(() => {
      autosize();
      if (activeUpdatePos) activeUpdatePos();
    }, 100);
  }
  
  function lwcnWireMainTableEvents(table) {
    try {
      if (!table || table.getAttribute("data-lwcn-dt-wired") === "1") return;
      // Check for jQuery and DataTables presence
      const $ = window.jQuery;
      if (!$ || !$.fn || !$.fn.dataTable) return;
  
      // Hook into DataTables events to trigger scan immediately on render/sort/page
      $(table).on("draw.dt page.dt order.dt search.dt length.dt responsive-display.dt", () => {
        lwcnScheduleScan("datatable-event");
      });
  
      table.setAttribute("data-lwcn-dt-wired", "1");
    } catch (_) {}
  }
  
  function escapeHtml(s) {
    // minimal escape for textarea innerHTML usage
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }
  
  async function attachToMainTable() {
    const table = document.querySelector("#operator-store-visits-table");
    if (!table) return;
  
    // Wire DataTables events for faster response
    lwcnWireMainTableEvents(table);

    // Headers for fallback lookup
    const headers = Array.from(table.querySelectorAll("thead th"));
  
    // Ensure we have a valid session once (not per row).
    let sessionData;
    try {
      sessionData = await ensureSession();
    } catch {
      // If not logged in to Supabase yet, do not inject anything.
      return;
    }
    const { sbUrl, sbAnon, session } = sessionData || {};
    const access_token = session?.access_token;
    if (!sbUrl || !sbAnon || !access_token) return;
  
    // Fetch notes index (customer_key list) once, then decide which rows get an icon.
    let notesIndex;
    try {
      notesIndex = await getNotesIndexCached({ sbUrl, sbAnon, access_token });
    } catch (e) {
      console.warn("[LWCN] Failed to load notes index:", e);
      return;
    }
  
    const rows = Array.from(table.querySelectorAll("tbody tr"));
    for (const row of rows) {
      // Skip DataTables "child" rows / group rows (they do not contain the real columns)
      if (row.classList?.contains("child") || row.classList?.contains("dtrg-group") || row.querySelector("td[colspan]")) {
        continue;
      }
      // Use smart lookup (by attribute first, then index)
      const phoneCell = lwcnGetRowCellByLabel(row, headers, "טלפון");
      if (!phoneCell) continue;
  
      const phoneRaw = (
        phoneCell.getAttribute("data-original-title") ||
        phoneCell.getAttribute("title") ||
        phoneCell.textContent ||
        ""
      ).trim();
      const customerKey = normalizeIsraeliPhoneToE164(phoneRaw);
      if (!customerKey) continue;
  
      const hasNote = notesIndex.has(customerKey);
  
      // Insert near the NAME cell (preferred), fallback to phone cell if name is missing.
      const nameCell = lwcnGetRowCellByLabel(row, headers, "שם");
      const targetCell = nameCell || phoneCell;
      const wrap = lwcnEnsureTableCellWrap(targetCell);
      if (!wrap) continue;
  
      let btn = wrap.querySelector(`.lwcn-btn[data-lwcn="1"][data-lwcn-table="1"]`);
  
      // If there is NO note, remove the icon if it exists and continue
      if (!hasNote) {
        if (btn) btn.remove();
        continue;
      }
  
      if (!btn) {
        btn = document.createElement("span");
        btn.className = "lwcn-btn";
        btn.setAttribute("data-lwcn", "1");
        btn.setAttribute("data-lwcn-table", "1");
        btn.setAttribute("title", "הערות לקוח");
        btn.innerHTML = `<i class="fa-regular fa-note-sticky" aria-hidden="true"></i>`;
        wrap.appendChild(btn);
  
        btn.addEventListener("click", async (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
  
          let s;
          try {
            s = await ensureSession();
          } catch (e) {
            renderBubble({
              btn,
              phone_raw: phoneRaw,
              customer_name: (targetCell?.textContent || "").trim() || "לקוח",
              noteText: "",
              updatedAtText: "",
              onChangeText: async () => { throw e; }
            });
            return;
          }
  
          const { sbUrl: _sbUrl, sbAnon: _sbAnon, session: _sess } = s || {};
          const token = _sess?.access_token;
  
          try {
            const note = await dbGetSingleNote({
              sbUrl: _sbUrl,
              sbAnon: _sbAnon,
              access_token: token,
              customer_key: customerKey
            });
  
            renderBubble({
              btn,
              phone_raw: phoneRaw,
              customer_name: (targetCell?.textContent || "").trim() || "לקוח",
              noteText: note?.note || "",
              updatedAtText: fmtUpdatedAt(note?.updated_at),
              onChangeText: async (newText) => {
                const v = String(newText || "").trim();
                if (!v) {
                  await dbDeleteSingleNote({
                    sbUrl: _sbUrl,
                    sbAnon: _sbAnon,
                    access_token: token,
                    customer_key: customerKey
                  });
                  lwcnSetButtonState(btn, false);
                  lwcnUpdateNotesIndexCache(customerKey, false);
                  if (lwcnIsTableBtn(btn)) {
                    closeBubble();
                    btn.remove();
                  }
                  return { note: "", updated_at: null };
                }
                await dbSaveSingleNote({
                  sbUrl: _sbUrl,
                  sbAnon: _sbAnon,
                  access_token: token,
                  user_id: _sess?.user_id || _sess?.user?.id,
                  customer_key: customerKey,
                  note: v
                });
                const updated = await dbGetSingleNote({
                  sbUrl: _sbUrl,
                  sbAnon: _sbAnon,
                  access_token: token,
                  customer_key: customerKey
                });
                const has = !!String(updated?.note || "").trim();
                lwcnSetButtonState(btn, has);
                lwcnUpdateNotesIndexCache(customerKey, has);
                if (!has && lwcnIsTableBtn(btn)) {
                  closeBubble();
                  btn.remove();
                }
                return updated || { updated_at: null };
              }
            });
  
            // Self-correction: If cache thought we had a note but DB says empty -> remove button
            const actualHasNote = !!String(note?.note || "").trim();
            lwcnSetButtonState(btn, actualHasNote);
            lwcnUpdateNotesIndexCache(customerKey, actualHasNote);
            if (!actualHasNote && lwcnIsTableBtn(btn)) {
              closeBubble();
              btn.remove();
            }
          } catch (e) {
            renderBubble({
              btn,
              phone_raw: phoneRaw,
              customer_name: (targetCell?.textContent || "").trim() || "לקוח",
              noteText: "",
              updatedAtText: "",
              onChangeText: async () => { throw e; }
            });
            const body = document.querySelector(".lwcn-bubble .body");
            if (body) body.innerHTML = `<div class="mini">${escapeHtml(e?.message || "כדי לעבוד: פתח Options והתחבר.")}</div>`;
          }
        }, { passive: false });
      }
  
      // Ensure correct state (table buttons never blink)
      lwcnSetButtonState(btn, true);
      btn.setAttribute("data-customer-key", customerKey);
    }
  }
  
  async function attachOncePerCustomer() {
    const anchor = getAnchorSpanForName();
    const host = getNameHostEl() || anchor?.parentElement || null;
    const phoneRaw = findDestinationPhoneText();
    const customerName = findDestinationNameText();
    if (!host || !phoneRaw || !customerName) return;
  
    const customerKey = normalizeIsraeliPhoneToE164(phoneRaw);
    if (!customerKey) return;
  
    // Avoid duplicate button injection:
    const existing = host.querySelector(".lwcn-btn[data-lwcn='1']");
    if (existing?.getAttribute("data-customer-key") === customerKey) return;
  
    // Remove old button if key changed
    if (existing) existing.remove();
  
    const btn = document.createElement("span");
    btn.className = "lwcn-btn";
    btn.setAttribute("data-lwcn", "1");
    btn.setAttribute("data-customer-key", customerKey);
    btn.title = "הערות לקוח";
  
    // FontAwesome note icon (matches what looked good before)
    btn.innerHTML = `<i class="fa-regular fa-note-sticky" aria-hidden="true"></i>`;
  
    host.appendChild(btn);
  
    // Load note in background and set badge style
    let cachedNote = null;
    try {
      const { sbUrl, sbAnon, session } = await ensureSession();
      cachedNote = await dbGetSingleNote({
        sbUrl,
        sbAnon,
        access_token: session.access_token,
        customer_key: customerKey
      });
  
      const hasNote = !!(cachedNote && String(cachedNote.note || "").trim());
      lwcnSetButtonState(btn, hasNote);
    } catch {
      // ignore
    }
  
    btn.addEventListener("click", async () => {
      try {
        const { sbUrl, sbAnon, session } = await ensureSession();
  
        let note = await dbGetSingleNote({
          sbUrl, sbAnon,
          access_token: session.access_token,
          customer_key: customerKey
        });
  
        renderBubble({
          btn,
          phone_raw: phoneRaw,
          customer_name: customerName,
          noteText: note?.note || "",
          updatedAtText: fmtUpdatedAt(note?.updated_at),
          onChangeText: async (newText) => {
            await dbSaveSingleNote({
              sbUrl, sbAnon,
              access_token: session.access_token,
              user_id: session.user_id || session.user?.id,
              customer_key: customerKey,
              note: newText
            });
  
            // Refresh note to get server-updated updated_at
            note = await dbGetSingleNote({
              sbUrl, sbAnon,
              access_token: session.access_token,
              customer_key: customerKey
            });
  
            const has = !!(note && String(note.note || "").trim());
            lwcnSetButtonState(btn, has);
            lwcnUpdateNotesIndexCache(customerKey, has);
  
            return note || { updated_at: null };
          }
        });
  
        // עדכון סטייל
        const has = !!(note && String(note.note || "").trim());
        lwcnSetButtonState(btn, has);
        lwcnUpdateNotesIndexCache(customerKey, has);
  
      } catch (e) {
        // אם לא מחובר, תציג bubble עם שגיאה קצרה
        renderBubble({
          btn,
          phone_raw: phoneRaw,
          customer_name: customerName,
          noteText: "",
          updatedAtText: "",
          onChangeText: async () => {}
        });
        const body = document.querySelector(".lwcn-bubble .body");
        if (body) body.innerHTML = `<div class="mini">${escapeHtml(e?.message || "כדי לעבוד: פתח Options והתחבר.")}</div>`;
      }
    });
  }
  
  // מניעת ריצות כפולות ושיפור ביצועים
  const observer = new MutationObserver(() => {
    lwcnScheduleScan("mutation");
  });
  
  function startObserverSafe() {
    const root = document.body || document.documentElement;
    if (root) {
      observer.observe(root, { childList: true, subtree: true });
      return true;
    }
    return false;
  }
  
  // In Firefox (and sometimes in SPA transitions), document.body can be null at script start
  if (!startObserverSafe()) {
    window.addEventListener("DOMContentLoaded", () => {
      const r = document.body || document.documentElement;
      if (r) observer.observe(r, { childList: true, subtree: true });
    }, { once: true });
  
    // Also try with boot observer as fallback
    const boot = new MutationObserver(() => {
      if (document.body) {
        boot.disconnect();
        startObserverSafe();
      }
    });
    if (document.documentElement) {
      boot.observe(document.documentElement, { childList: true, subtree: true });
    }
  }
  
  (async function init() {
    await captureMagicLinkSessionIfPresent().catch(() => {});
    await tryConsumeTokenHashFromUrl().catch(() => {});
    // Allow page to render
    for (let i = 0; i < 10; i++) {
      lwcnScheduleScan("init-loop");
      await sleep(500);
    }
    // MutationObserver is already set up globally
  })();

  // === INTEGRATION WITH PRO DASHBOARD ===
  document.addEventListener('OpenLionwheelNote', async (e) => {
    const { phone, name, buttonElement } = e.detail;
    if (!phone || !buttonElement) return;

    const customerKey = normalizeIsraeliPhoneToE164(phone);
    if (!customerKey) return;

    try {
      const { sbUrl, sbAnon, session } = await ensureSession();
      
      let note = await dbGetSingleNote({
        sbUrl, sbAnon,
        access_token: session.access_token,
        customer_key: customerKey
      });

      renderBubble({
        btn: buttonElement,
        phone_raw: phone,
        customer_name: name || "לקוח",
        noteText: note?.note || "",
        updatedAtText: fmtUpdatedAt(note?.updated_at),
        onChangeText: async (newText) => {
          const v = String(newText || "").trim();
          if (!v) {
            await dbDeleteSingleNote({
              sbUrl, sbAnon,
              access_token: session.access_token,
              customer_key: customerKey
            });
            lwcnSetButtonState(buttonElement, false);
            lwcnUpdateNotesIndexCache(customerKey, false);
            return { note: "", updated_at: null };
          }
          await dbSaveSingleNote({
            sbUrl, sbAnon,
            access_token: session.access_token,
            user_id: session.user_id || session.user?.id,
            customer_key: customerKey,
            note: v
          });
          const updated = await dbGetSingleNote({
            sbUrl, sbAnon,
            access_token: session.access_token,
            customer_key: customerKey
          });
          const has = !!String(updated?.note || "").trim();
          lwcnSetButtonState(buttonElement, has);
          lwcnUpdateNotesIndexCache(customerKey, has);
          return updated || { updated_at: null };
        }
      });
      
      // Update styling immediately on open
      const has = !!(note && String(note.note || "").trim());
      lwcnSetButtonState(buttonElement, has);
      lwcnUpdateNotesIndexCache(customerKey, has);

    } catch (err) {
      renderBubble({
        btn: buttonElement,
        phone_raw: phone,
        customer_name: name || "לקוח",
        noteText: "",
        updatedAtText: "",
        onChangeText: async () => { throw err; }
      });
      const body = document.querySelector(".lwcn-bubble .body");
      if (body) body.innerHTML = `<div class="mini">${escapeHtml(err?.message || "כדי לעבוד: פתח Options והתחבר.")}</div>`;
    }
  });
  
  })();
  