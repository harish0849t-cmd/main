// util.js — small helpers shared by all screens
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const num = (v) => { const n = parseFloat(String(v).replace(/,/g, '')); return Number.isFinite(n) ? n : 0; };
export const fmt = (n, d = 2) => (+n || 0).toLocaleString('en-IN', { maximumFractionDigits: d });
export const money = (n) => (n < 0 ? '-₹' : '₹') + fmt(Math.abs(n), 0);
export const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => ymd(new Date());
export const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const daysBetween = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 864e5);
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const showDate = (s) => { if (!s) return ''; const d = parseYmd(s); return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`; };
export const nowTime = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const showTime = (ts) => { const d = new Date(ts); let h = d.getHours(); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${h}:${pad(d.getMinutes())} ${ap}`; };
export const uniq = (a) => [...new Set(a)];

let toastTimer;
export function toast(msg) {
  const t = $('#toast'); if (!t) return;
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 2600);
}

/** Circular % gauge (SVG) */
export function ring(p, size = 56) {
  const r = size / 2 - 5, c = 2 * Math.PI * r, v = p == null ? 0 : Math.max(0, Math.min(100, p));
  const col = p == null ? '#9db4bd' : p >= 90 ? '#2fbf8a' : p >= 60 ? '#e8b34a' : '#e0645c';
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-label="${p == null ? 'not recorded' : p + ' percent'}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="rgba(16,48,61,.15)" stroke-width="5"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${col}" stroke-width="5" stroke-linecap="round"
      stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - v / 100)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" font-size="${size * 0.24}" font-weight="700" fill="#10303d">${p == null ? '–' : p + '%'}</text></svg>`;
}

// ───────────── bottom-sheet dialogs ─────────────
let sheetClose = null;
export function closeSheet() { const r = $('#sheet-root'); if (r) r.innerHTML = ''; sheetClose = null; }

export function formVals(form) {
  const out = {};
  $$('[name]', form).forEach((el) => {
    const n = el.name;
    if (el.type === 'checkbox') {
      if (n.endsWith('[]')) { const k = n.slice(0, -2); (out[k] ||= []); if (el.checked) out[k].push(el.value); }
      else out[n] = el.checked;
    } else if (el.type === 'radio') { if (el.checked) out[n] = el.value; }
    else out[n] = el.value;
  });
  return out;
}

/** openSheet(html, { submit(vals, form)→false to stay open, acts:{name(el,ev)}, mount(root) }) */
export function openSheet(html, opts = {}) {
  const root = $('#sheet-root');
  root.innerHTML = `<div class="scrim"><div class="sheet" role="dialog" aria-modal="true">${html}</div></div>`;
  const scrim = root.firstElementChild, sheet = scrim.firstElementChild;
  scrim.addEventListener('mousedown', (e) => { if (e.target === scrim) closeSheet(); });
  sheet.addEventListener('click', (e) => {
    const el = e.target.closest('[data-do]'); if (!el) return;
    const name = el.dataset.do;
    if (name === 'close') return closeSheet();
    const f = opts.acts && opts.acts[name]; if (f) f(el, e, sheet);
  });
  const form = $('form', sheet);
  if (form && opts.submit) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const r = opts.submit(formVals(form), form);
      if (r !== false) closeSheet();
    });
  }
  if (opts.mount) opts.mount(sheet);
  sheetClose = closeSheet;
  return sheet;
}
export const sheetHead = (title, sub = '') => `<div class="row between"><div><h2>${esc(title)}</h2>${sub ? `<div class="muted small">${esc(sub)}</div>` : ''}</div><button type="button" class="icon-btn" data-do="close" aria-label="Close">✕</button></div>`;

export const isNative = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

/** Inside the Android app a browser-style download does nothing, so save to cache and open the share sheet. */
export async function shareFile(name, text) {
  const P = window.Capacitor.Plugins;
  const w = await P.Filesystem.writeFile({ path: name, data: '﻿' + text, directory: 'CACHE', encoding: 'utf8' });
  await P.Share.share({ title: name, url: w.uri, dialogTitle: 'Save or send ' + name });
}

export function download(name, text, type = 'text/csv') {
  if (isNative()) { shareFile(name, text).catch((e) => toast('Could not export: ' + (e.message || e))); return; }
  const blob = new Blob(['﻿' + text], { type: type + ';charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
export const csvCell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
