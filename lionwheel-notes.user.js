// ==UserScript==
// @name         Lionwheel Customer Notes (Cloud)
// @namespace    https://anipet.local/lwcn
// @version      0.1.0
// @description  Persistent customer notes for Lionwheel, stored in Supabase (cloud) and shown next to customer name.
// @match        https://members.lionwheel.com/*
// @match        https://lionwheel.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(() => {
  'use strict';

  /** =====================
   *  Configuration (set via menu)
   *  ===================== */
  const K = {
    SB_URL: 'lwcn_sb_url',
    SB_ANON: 'lwcn_sb_anon',
    EMAIL: 'lwcn_email',
    SESSION: 'lwcn_session', // JSON
    LAST_EDIT_ACK: 'lwcn_last_edit_ack', // per customer_key optional
  };

  const DEFAULTS = {
    // Example: https://xxxx.supabase.co
    sbUrl: '',
    // Your Supabase anon/public key (NOT the service_role / secret key)
    sbAnon: '',
  };

  function getCfg() {
    return {
      sbUrl: (GM_getValue(K.SB_URL, DEFAULTS.sbUrl) || '').trim().replace(/\/$/, ''),
      sbAnon: (GM_getValue(K.SB_ANON, DEFAULTS.sbAnon) || '').trim(),
      email: (GM_getValue(K.EMAIL, '') || '').trim(),
    };
  }

  function setCfg({ sbUrl, sbAnon, email }) {
    if (typeof sbUrl === 'string') GM_setValue(K.SB_URL, sbUrl.trim().replace(/\/$/, ''));
    if (typeof sbAnon === 'string') GM_setValue(K.SB_ANON, sbAnon.trim());
    if (typeof email === 'string') GM_setValue(K.EMAIL, email.trim());
  }

  function getSession() {
    const raw = GM_getValue(K.SESSION, '');
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }
  function setSession(s) { GM_setValue(K.SESSION, JSON.stringify(s || {})); }
  function clearSession() { GM_deleteValue(K.SESSION); }

  /** =====================
   *  Helpers
   *  ===================== */
  function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

  function parseHashParams() {
    const h = (location.hash || '').replace(/^#/, '');
    if (!h) return {};
    const p = new URLSearchParams(h);
    const out = {};
    for (const [k,v] of p.entries()) out[k]=v;
    return out;
  }

  function decodeJwtPayload(token) {
    try {
      const part = token.split('.')[1];
      const json = atob(part.replace(/-/g,'+').replace(/_/g,'/'));
      return JSON.parse(decodeURIComponent(Array.from(json).map(c => '%' + c.charCodeAt(0).toString(16).padStart(2,'0')).join('')));
    } catch { return null; }
  }

  function normalizePhone(raw) {
    // Lionwheel uses local format without +972. We keep digits only and keep leading 0 if present.
    const d = String(raw || '').replace(/\D+/g,'');
    return d;
  }

  /** =====================
   *  Supabase Auth
   *  ===================== */
  async function supabaseFetch(path, { method='GET', headers={}, body=null, auth=true } = {}) {
    const { sbUrl, sbAnon } = getCfg();
    if (!sbUrl || !sbAnon) throw new Error('Supabase not configured (set URL + anon key).');
    const url = sbUrl + path;

    const h = {
      'apikey': sbAnon,
      ...headers,
    };

    if (auth) {
      const s = await ensureSession();
      if (s?.access_token) h['Authorization'] = `Bearer ${s.access_token}`;
    }

    const init = { method, headers: h };
    if (body !== null) {
      init.body = typeof body === 'string' ? body : JSON.stringify(body);
      if (!h['Content-Type']) init.headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(url, init);
    let text = '';
    try { text = await res.text(); } catch {}
    let data = null;
    if (text) {
      try { data = JSON.parse(text); } catch { data = text; }
    }

    if (!res.ok) {
      const msg = (data && data.message) ? data.message : (typeof data === 'string' ? data : res.statusText);
      const err = new Error(`${res.status} ${msg}`.trim());
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  async function ensureSession() {
    const cfg = getCfg();
    const s = getSession();
    if (!cfg.sbUrl || !cfg.sbAnon) return s;

    // Capture magic-link session from URL hash when user clicks email link.
    const hp = parseHashParams();
    if (hp.access_token && hp.refresh_token) {
      const expiresAt = hp.expires_at ? Number(hp.expires_at) : (Math.floor(Date.now()/1000) + Number(hp.expires_in||3600));
      const payload = decodeJwtPayload(hp.access_token);
      setSession({
        access_token: hp.access_token,
        refresh_token: hp.refresh_token,
        expires_at: expiresAt,
        token_type: hp.token_type || 'bearer',
        user_id: payload?.sub || null,
        email: payload?.email || null,
      });
      // Clean URL
      history.replaceState(null, '', location.pathname + location.search);
      return getSession();
    }

    if (!s?.access_token || !s?.refresh_token || !s?.expires_at) return s;

    // Refresh when < 2 minutes to expiry
    const now = Math.floor(Date.now()/1000);
    if (s.expires_at - now > 120) return s;

    try {
      const data = await supabaseFetch('/auth/v1/token?grant_type=refresh_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { refresh_token: s.refresh_token },
        auth: false,
      });

      // Supabase returns {access_token, refresh_token, expires_in, token_type, user}
      const expiresAt = Math.floor(Date.now()/1000) + Number(data.expires_in || 3600);
      const payload = decodeJwtPayload(data.access_token);
      setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token || s.refresh_token,
        expires_at: expiresAt,
        token_type: data.token_type || 'bearer',
        user_id: data.user?.id || payload?.sub || s.user_id || null,
        email: data.user?.email || payload?.email || s.email || null,
      });
      return getSession();
    } catch (e) {
      // Session stale: keep but mark to UI
      return s;
    }
  }

  async function sendMagicLink(email) {
    const { sbUrl, sbAnon } = getCfg();
    if (!sbUrl || !sbAnon) throw new Error('Supabase not configured.');
    if (!email) throw new Error('Email is required.');

    // IMPORTANT: in Supabase Auth settings, add these to Redirect URLs:
    // https://members.lionwheel.com/
    // https://members.lionwheel.com/*
    const emailRedirectTo = 'https://members.lionwheel.com/';

    await supabaseFetch('/auth/v1/otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        email,
        create_user: false,
        email_redirect_to: emailRedirectTo,
      },
      auth: false,
    });
  }

  /** =====================
   *  Notes API (table: public.customer_notes)
   *  Columns assumed: customer_key (text, unique), note (text), user_id (uuid), updated_at (timestamptz)
   *  ===================== */
  async function getNote(customerKey) {
    // /rest/v1/customer_notes?select=note,updated_at&customer_key=eq.052...&limit=1
    const ck = customerKey;
    const q = `/rest/v1/customer_notes?select=note,updated_at&customer_key=eq.${encodeURIComponent(ck)}&limit=1`;
    const rows = await supabaseFetch(q, { method: 'GET' });
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  }

  async function deleteNote(customerKey) {
    const ck = customerKey;
    // DELETE /rest/v1/customer_notes?customer_key=eq.052...
    const q = `/rest/v1/customer_notes?customer_key=eq.${encodeURIComponent(ck)}`;
    await supabaseFetch(q, {
      method: 'DELETE',
      headers: { 'Prefer': 'return=minimal' },
    });
    return true;
  }

  async function upsertNote(customerKey, noteText) {
    const cleaned = (noteText ?? '').trim();
    // If empty, delete the row (do NOT store placeholders like "EMPTY")
    if (!cleaned) {
      await deleteNote(customerKey);
      return null;
    }

    const ck = customerKey;
    const s = await ensureSession();
    const userId = s?.user_id || decodeJwtPayload(s?.access_token || '')?.sub || null;
    if (!userId) throw new Error('Not logged in (missing user_id). Open menu → Send magic link and complete login.');

    const payload = {
      customer_key: ck,
      user_id: userId,
      note: cleaned,
    };

    // Upsert on unique customer_key
    const q = `/rest/v1/customer_notes?on_conflict=customer_key`;
    const rows = await supabaseFetch(q, {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
      body: payload,
    });
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  }

  /** =====================
   *  UI
   *  ===================== */
  const CSS = `
  .lwcn-btn{
    display:inline-flex; align-items:center; justify-content:center;
    width:22px; height:22px; margin-inline-start:8px;
    border-radius:6px; cursor:pointer; user-select:none;
    border:1px solid rgba(17,24,39,.12);
    background:#fff;
    box-shadow: 0 1px 2px rgba(0,0,0,.06);
    transition: transform .12s ease, box-shadow .12s ease, background .12s ease;
  }
  .lwcn-btn:hover{ transform: translateY(-1px); box-shadow: 0 6px 14px rgba(0,0,0,.10); }
  .lwcn-btn svg{ width:14px; height:14px; opacity:.78; }
  .lwcn-btn.lwcn-has-note{
    background:#FFE9D6;
    border-color: rgba(255,126,0,.35);
  }
  .lwcn-btn.lwcn-has-note svg{ opacity:1; }
  .lwcn-btn.lwcn-blink{
    animation: lwcnBlink 1.8s ease-in-out infinite;
  }
  @keyframes lwcnBlink{
    0%,100%{ box-shadow: 0 0 0 rgba(255,126,0,0); }
    50%{ box-shadow: 0 0 0 4px rgba(255,126,0,.16); }
  }

  .lwcn-bubble{
    position: fixed;
    z-index: 2147483647;
    width: 380px;
    max-width: calc(100vw - 24px);
    background:#fff;
    border:1px solid rgba(17,24,39,.12);
    border-radius:14px;
    box-shadow: 0 14px 40px rgba(0,0,0,.16);
    font-family: var(--font-family-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", "Liberation Sans", sans-serif);
    opacity: 0;
    transform: translateY(6px);
    transition: opacity .14s ease, transform .14s ease;
    direction: rtl;
  }
  .lwcn-bubble.lwcn-open{ opacity:1; transform: translateY(0); }

  .lwcn-caret{
    position:absolute;
    width: 12px; height: 12px;
    background:#fff;
    border-left:1px solid rgba(17,24,39,.12);
    border-top:1px solid rgba(17,24,39,.12);
    transform: rotate(45deg);
    top: var(--lwcn-caret-top, 18px);
  }
  .lwcn-caret.left{ right:-6px; }
  .lwcn-caret.right{ left:-6px; transform: rotate(225deg); }

  .lwcn-top{
    display:flex; align-items:flex-start; justify-content:space-between;
    padding:12px 12px 8px 12px;
    gap: 10px;
  }
  .lwcn-title{
    display:flex; align-items:center; gap:8px;
    font-size:14px; font-weight:700; color:#111827;
    line-height:1.2;
  }
  .lwcn-mini{ font-size:12px; color:#6B7280; margin-top:2px; }
  .lwcn-close{
    border:none; background:transparent; cursor:pointer;
    width:28px; height:28px; border-radius:8px;
    display:flex; align-items:center; justify-content:center;
    color:#6B7280;
  }
  .lwcn-close:hover{ background: rgba(17,24,39,.06); color:#111827; }

  .lwcn-body{ padding:0 12px 12px 12px; }
  .lwcn-noteview{
    border:1px solid rgba(17,24,39,.10);
    border-radius:12px;
    padding:10px;
    min-height: 92px;
    white-space: pre-wrap;
    word-break: break-word;
    text-align: right;
    font-size:13px;
    line-height:1.45;
    cursor: text;
  }
  .lwcn-noteview.lwcn-empty{
    color:#9CA3AF;
  }
  .lwcn-noteview:focus{
    outline: none;
    border-color: rgba(255,126,0,.55);
    box-shadow: 0 0 0 3px rgba(255,126,0,.18);
  }

  .lwcn-foot{
    margin-top:10px;
    display:flex; align-items:center; justify-content:space-between;
    gap:10px;
    font-size:12px; color:#6B7280;
  }
  .lwcn-status{
    display:flex; align-items:center; gap:8px;
  }
  .lwcn-dot{
    width:10px; height:10px; border-radius:99px;
    background:#FFBD2E; /* saving default */
    box-shadow: 0 0 0 2px rgba(0,0,0,.04) inset;
  }
  .lwcn-dot.ok{ background:#28CA40; }
  .lwcn-dot.err{ background:#FF5F57; }
  .lwcn-updated i{ margin-inline-start:6px; opacity:.75; }
  `;

  const NOTE_SVG = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M6 3h9l3 3v15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm8 1v3h3" />
      <path fill="currentColor" d="M7 10h10v2H7zm0 4h10v2H7zm0 4h7v2H7z"/>
    </svg>`;

  let styleInjected = false;
  function ensureStyle() {
    if (styleInjected) return;
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    styleInjected = true;
  }

  let bubbleEl = null;
  let bubbleFor = null; // {btn, customerKey, customerName}
  let saveTimer = null;
  let posTimer = null;

  function formatUpdated(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const dd = String(d.getDate()).padStart(2,'0');
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const yy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2,'0');
    const mi = String(d.getMinutes()).padStart(2,'0');
    return `${dd}.${mm}.${yy}, ${hh}:${mi}`;
  }

  function closeBubble() {
    if (!bubbleEl) return;
    bubbleEl.remove();
    bubbleEl = null;
    bubbleFor = null;
    if (posTimer) { clearInterval(posTimer); posTimer = null; }
    document.removeEventListener('mousedown', onDocDown, true);
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('scroll', onAnyScroll, true);
  }

  function onDocDown(e) {
    if (!bubbleEl) return;
    if (bubbleEl.contains(e.target)) return;
    if (bubbleFor?.btn && bubbleFor.btn.contains(e.target)) return;
    closeBubble();
  }
  function onKeyDown(e) {
    if (e.key === 'Escape') closeBubble();
  }
  function onAnyScroll() {
    if (!bubbleEl) return;
    updatePos();
  }

  function computePos(btnRect) {
    const pad = 10;
    const bubbleW = bubbleEl ? bubbleEl.getBoundingClientRect().width : 380;
    const bubbleH = bubbleEl ? bubbleEl.getBoundingClientRect().height : 220;

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // prefer left of button (RTL UI), else right
    const spaceLeft = btnRect.left;
    const spaceRight = vw - btnRect.right;

    let side = 'left'; // caret on left means bubble on left? We'll define caret class based on side of bubble relative to icon.
    let left;
    if (spaceLeft >= bubbleW + pad) {
      // bubble to the left of icon
      left = Math.max(pad, btnRect.left - bubbleW - pad);
      side = 'left';
    } else if (spaceRight >= bubbleW + pad) {
      left = Math.min(vw - bubbleW - pad, btnRect.right + pad);
      side = 'right';
    } else {
      // center fallback, no caret
      left = Math.min(vw - bubbleW - pad, Math.max(pad, btnRect.left + (btnRect.width/2) - bubbleW/2));
      side = 'none';
    }

    // vertical: align near icon, clamp into viewport
    let top = btnRect.top - 12;
    top = Math.min(vh - bubbleH - pad, Math.max(pad, top));

    // caret top relative to bubble
    let caretTop = (btnRect.top + btnRect.height/2) - top - 6;
    caretTop = Math.max(14, Math.min(bubbleH - 18, caretTop));

    return { top, left, side, caretTop };
  }

  function updatePos() {
    if (!bubbleEl || !bubbleFor?.btn) return;
    const btn = bubbleFor.btn;
    if (!document.contains(btn)) return closeBubble();
    const r = btn.getBoundingClientRect();
    const { top, left, side, caretTop } = computePos(r);
    bubbleEl.style.top = `${top}px`;
    bubbleEl.style.left = `${left}px`;
    bubbleEl.style.setProperty('--lwcn-caret-top', `${caretTop}px`);

    const caret = bubbleEl.querySelector('.lwcn-caret');
    if (caret) {
      caret.classList.remove('left','right');
      if (side === 'left') caret.classList.add('left');
      else if (side === 'right') caret.classList.add('right');
      else caret.style.display = 'none';
      if (side !== 'none') caret.style.display = '';
    }
  }

  function setStatus({ state, msg, updatedAt }) {
    if (!bubbleEl) return;
    const dot = bubbleEl.querySelector('.lwcn-dot');
    const status = bubbleEl.querySelector('.lwcn-statusmsg');
    const updated = bubbleEl.querySelector('.lwcn-updated');
    if (dot) {
      dot.classList.remove('ok','err');
      if (state === 'ok') dot.classList.add('ok');
      else if (state === 'err') dot.classList.add('err');
    }
    if (status) status.textContent = msg || '';
    if (updated) {
      updated.innerHTML = updatedAt ? `<span>עודכן: ${formatUpdated(updatedAt)} <i class="fa-regular fa-pen-to-square"></i></span>` : '';
    }
  }

  function ensureFontAwesome() {
    // Optional: only for the pen icon in the footer. If Lionwheel already has FA loaded, nothing happens.
    if (document.querySelector('link[data-lwcn-fa]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://site-assets.fontawesome.com/releases/v6.5.2/css/all.css';
    link.setAttribute('data-lwcn-fa','1');
    document.head.appendChild(link);
  }

  async function openBubble({ btn, customerKey, customerName }) {
    ensureStyle();
    ensureFontAwesome();

    closeBubble();
    bubbleFor = { btn, customerKey, customerName };

    const el = document.createElement('div');
    el.className = 'lwcn-bubble';
    el.innerHTML = `
      <div class="lwcn-caret left"></div>
      <div class="lwcn-top">
        <div>
          <div class="lwcn-title">
            ${NOTE_SVG}
            <span>הערות עבור ${escapeHtml(customerName || 'לקוח')}</span>
          </div>
          <div class="lwcn-mini"></div>
        </div>
        <button class="lwcn-close" title="סגור" aria-label="סגור">×</button>
      </div>
      <div class="lwcn-body">
        <div class="lwcn-noteview lwcn-empty" contenteditable="true" spellcheck="false"></div>
        <div class="lwcn-foot">
          <div class="lwcn-status">
            <span class="lwcn-dot"></span>
            <span class="lwcn-statusmsg">שמירה אוטומטית</span>
          </div>
          <div class="lwcn-updated"></div>
        </div>
      </div>
    `;
    document.body.appendChild(el);
    bubbleEl = el;

    // Wire close
    el.querySelector('.lwcn-close')?.addEventListener('click', closeBubble);

    // Close on outside click & ESC
    document.addEventListener('mousedown', onDocDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('scroll', onAnyScroll, true);

    // Position immediately (before showing), then animate in
    updatePos();
    // Force layout, then add open class for fade-in
    void el.offsetWidth;
    el.classList.add('lwcn-open');

    // Load note
    const noteview = el.querySelector('.lwcn-noteview');
    const mini = el.querySelector('.lwcn-mini');

    mini.textContent = ''; // no phone in popup, per request

    setStatus({ state: 'ok', msg: 'טוען…' });

    let row = null;
    try {
      row = await getNote(customerKey);
      const text = (row?.note || '').replace(/\s+$/,'');
      setNoteviewText(noteview, text);
      setStatus({ state: 'ok', msg: 'שמירה אוטומטית', updatedAt: row?.updated_at || null });
      applyHasNote(btn, !!text, { customerName });
    } catch (e) {
      setNoteviewText(noteview, '');
      setStatus({ state: 'err', msg: authHintFromError(e) });
    }

    // Autosave on input (debounced)
    noteview.addEventListener('input', () => {
      scheduleSave(customerKey, noteview, btn, customerName);
    });

    // UX: placeholder behaves like a prompt, not saved content
    const clearPlaceholderIfNeeded = () => {
      if (!noteview.classList.contains('lwcn-empty')) return;
      noteview.textContent = '';
      noteview.classList.remove('lwcn-empty');
      // place caret inside the contenteditable
      requestAnimationFrame(() => {
        try {
          const sel = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(noteview);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        } catch (_) {}
      });
    };

    noteview.addEventListener('focus', clearPlaceholderIfNeeded);
    noteview.addEventListener('pointerdown', clearPlaceholderIfNeeded);
    noteview.addEventListener('blur', () => {
      // If user left it empty, show placeholder again (and keep DB deletion behavior)
      if (!getNoteviewUserText(noteview)) setNoteviewText(noteview, '');
    });

    // Keep position updated while open
    posTimer = setInterval(updatePos, 250);
  }

  function escapeHtml(str){
    return String(str||'').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  }

  function setNoteviewText(el, text) {
    // Avoid leading whitespace / centering oddities
    const t = (text || '').replace(/^\s+/, '').replace(/\r\n/g,'\n');
    if (!t) {
      el.textContent = 'לחץ כדי להוסיף הערה…';
      el.classList.add('lwcn-empty');
    } else {
      el.textContent = t;
      el.classList.remove('lwcn-empty');
    }
  }

  function getNoteviewUserText(el) {
    const t = (el.textContent || '').replace(/\r\n/g,'\n');
    // If it's our placeholder, treat as empty
    if (t.trim() === 'לחץ כדי להוסיף הערה…') return '';
    return t.replace(/\s+$/,''); // keep leading spaces user might want? we already trim on save by not removing leading.
  }

  function scheduleSave(customerKey, noteview, btn, customerName) {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const text = getNoteviewUserText(noteview);
      setStatus({ state: 'saving', msg: 'שומר…' });
      try {
        const row = await upsertNote(customerKey, text);
        setStatus({ state: 'ok', msg: 'נשמר', updatedAt: row?.updated_at || new Date().toISOString() });
        applyHasNote(btn, !!text, { customerName });
      } catch (e) {
        setStatus({ state: 'err', msg: authHintFromError(e) });
      }
    }, 900);
  }

  function authHintFromError(e) {
    const msg = String(e?.message || '');
    if (msg.includes('401')) return 'אין הרשאות / צריך להתחבר מחדש';
    if (msg.includes('403')) return 'אין הרשאות (RLS) / צריך להתחבר';
    if (msg.includes('Supabase not configured')) return 'צריך להגדיר Supabase בתפריט';
    return 'אין חיבור / שגיאה בשמירה';
  }

  function applyHasNote(btn, hasNote, { customerName }) {
    if (!btn) return;
    btn.classList.toggle('lwcn-has-note', !!hasNote);
    btn.classList.toggle('lwcn-blink', !!hasNote);
    // title icon in bubble orange: handled via CSS when has note? we keep simple.
  }

  function createBtn(customerKey, customerName) {
    const btn = document.createElement('span');
    btn.className = 'lwcn-btn';
    btn.setAttribute('data-lwcn', '1');
    btn.setAttribute('data-customer-key', customerKey);
    btn.title = 'הערות לקוח';
    btn.innerHTML = NOTE_SVG;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openBubble({ btn, customerKey, customerName });
    });
    return btn;
  }

  function findCustomerContext() {
    // We only inject when the "איש קשר" section exists.
    const nameRow = document.querySelector('.row[data-name="destination_recipient_name"]');
    const phoneRow = document.querySelector('.row[data-name="destination_phone"]');
    if (!nameRow || !phoneRow) return null;

    const nameCol = nameRow.querySelector('.col-xxl-7');
    const phoneCol = phoneRow.querySelector('.col-xxl-7');

    if (!nameCol || !phoneCol) return null;

    const nameTextEl = nameCol.querySelector('.editable-text') || nameCol.querySelector('span');
    const phoneTextEl = phoneCol.querySelector('.editable-text') || phoneCol.querySelector('span');

    const rawName = (nameTextEl?.innerText || '').trim();
    const rawPhone = (phoneTextEl?.innerText || '').trim();
    const customerKey = normalizePhone(rawPhone);

    if (!rawName || !customerKey) return null;

    return { nameRow, nameCol, customerName: rawName, customerKey };
  }

  async function injectOnce() {
    const ctx = findCustomerContext();
    if (!ctx) return;

    // handle cases where name is a link inside span (a tag). We add button to the col container.
    if (ctx.nameCol.querySelector('.lwcn-btn[data-lwcn="1"]')) return;

    ensureStyle();

    const btn = createBtn(ctx.customerKey, ctx.customerName);

    // Insert after the editable-text span if present, else at end of col
    const anchor = ctx.nameCol.querySelector('.editable-text') || ctx.nameCol.querySelector('span');
    if (anchor && anchor.parentElement === ctx.nameCol) {
      ctx.nameCol.appendChild(btn);
    } else if (anchor) {
      // anchor may be a span that contains <a>. Append inside the span after the link.
      anchor.appendChild(btn);
    } else {
      ctx.nameCol.appendChild(btn);
    }

    // Mark if note exists (async, do not block)
    try {
      const row = await getNote(ctx.customerKey);
      const hasNote = !!(row?.note || '').trim();
      applyHasNote(btn, hasNote, { customerName: ctx.customerName });
    } catch {
      // ignore
    }
  }

  /** =====================
   *  Boot
   *  ===================== */
  function bootObserver() {
    const tryStart = () => {
      if (!document.body) return false;
      const mo = new MutationObserver(() => {
        // throttle-ish by microtask
        if (tryStart._t) return;
        tryStart._t = setTimeout(() => { tryStart._t = null; injectOnce(); }, 250);
      });
      mo.observe(document.body, { childList: true, subtree: true });
      // run once now
      injectOnce();
      return true;
    };

    if (!tryStart()) {
      const it = setInterval(() => { if (tryStart()) clearInterval(it); }, 200);
    }
  }

  /** =====================
   *  Menu
   *  ===================== */
  function menu() {
    GM_registerMenuCommand('LW Notes: Set Supabase URL', () => {
      const v = prompt('Supabase URL (e.g. https://xxxx.supabase.co):', getCfg().sbUrl || '');
      if (v != null) setCfg({ sbUrl: v });
      alert('Saved. Reload Lionwheel tab.');
    });

    GM_registerMenuCommand('LW Notes: Set Supabase anon key', () => {
      const v = prompt('Supabase anon/public key (NOT secret/service role):', getCfg().sbAnon || '');
      if (v != null) setCfg({ sbAnon: v });
      alert('Saved. Reload Lionwheel tab.');
    });

    GM_registerMenuCommand('LW Notes: Send magic link', async () => {
      const cur = getCfg().email || '';
      const email = prompt('Email to send magic link to:', cur);
      if (!email) return;
      setCfg({ email });
      try {
        await sendMagicLink(email);
        alert('Magic link sent. Open your email on this phone, click the link, and you will be logged in.');
      } catch (e) {
        alert('Failed: ' + (e?.message || e));
      }
    });

    GM_registerMenuCommand('LW Notes: Log out (clear session)', () => {
      clearSession();
      alert('Session cleared.');
    });
  }

  // Start
  menu();
  ensureSession().catch(()=>{});
  bootObserver();

})();
