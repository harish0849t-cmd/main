// db.js — data layer. Two interchangeable backends:
//   demo  : saved in this phone's browser storage (no account, no internet)
//   cloud : Google Sheets through a small Google Apps Script (see apps-script/Code.gs).
//           Every change is applied on the phone at once, queued, and sent to the
//           Sheet as soon as there is signal. Phones refresh every ~15 seconds.
// The screens never see the difference: both backends expose the same S / set / add / del API.
import { sheetsConfig } from './sheets-config.js';

export const mode = sheetsConfig && sheetsConfig.url ? 'cloud' : 'demo';

// Feeding logs and stock movements pile up daily, so phones only download the last
// WINDOW_DAYS of them. Totals that need the full history (stock in hand, feed used per
// cycle, average rate) are kept as running counters on the item / cycle — see ops.js.
export const WINDOW_DAYS = 14;
export const inc = (n) => ({ __inc: Number.isFinite(n) ? n : 0 });
const isInc = (v) => v && typeof v === 'object' && '__inc' in v;
const applyInc = (old, data) => { const o = { ...old }; for (const k in data) o[k] = isInc(data[k]) ? (Number(o[k]) || 0) + data[k].__inc : data[k]; return o; };
export const COLS = ['tanks', 'cycles', 'items', 'txns', 'feedlogs', 'employees', 'advances', 'partners', 'ledger', 'settings', 'users'];
export const S = {};
COLS.forEach((c) => (S[c] = []));
export const session = { user: null, ready: false, error: '' };

const subs = new Set();
let queued = false;
export const onChange = (f) => subs.add(f);
function emit() {
  if (queued) return;
  queued = true;
  queueMicrotask(() => { queued = false; subs.forEach((f) => f()); });
}
export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const clean = (o) => JSON.parse(JSON.stringify(o));
export let onError = (m) => console.warn(m);
export const setErrorHandler = (f) => (onError = f);

const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage blocked: stays in memory */ } };
const lsDel = (k) => { try { localStorage.removeItem(k); } catch {} };

// ───────────── demo backend ─────────────
const LS = 'aquafarm_v1_';
function lsLoad() {
  COLS.forEach((c) => { try { S[c] = JSON.parse(localStorage.getItem(LS + c) || '[]'); } catch { S[c] = []; } });
}
function lsSave(c) { lsSet(LS + c, JSON.stringify(S[c])); }
export function demoRole(role) { if (session.user) { session.user.role = role; lsSet(LS + 'role', role); emit(); } }
export function demoWipe() { COLS.forEach((c) => { S[c] = []; lsSave(c); }); emit(); }

// ───────────── cloud backend (Google Sheets) ─────────────
const K_TOKEN = 'aquafarm_token', K_OUT = 'aquafarm_outbox', K_CACHE = 'aquafarm_cache';
const POLL_MS = 15000;
let token = '', outbox = [], renderCb = () => {}, lastVer = -1, flushing = false, pulling = false, timer = null;

const saveOutbox = () => lsSet(K_OUT, JSON.stringify(outbox));

function netError() { return Object.assign(new Error('No internet connection.'), { code: 'auth/network-request-failed', network: true }); }

async function call(action, body = {}) {
  let res;
  try {
    res = await fetch(sheetsConfig.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // plain text = no CORS pre-flight
      body: JSON.stringify({ action, token, ...body }),
      redirect: 'follow',
    });
  } catch { throw netError(); }
  let j;
  try { j = await res.json(); } catch {
    throw Object.assign(new Error('Cannot reach the farm sheet. Check the link in sheets-config.js and that the script is shared with "Anyone".'), { code: 'bad-response', network: true });
  }
  if (j.error) throw Object.assign(new Error(j.message || j.error), { code: j.error });
  return j;
}

function applyLocal(col, id, data) {
  const i = S[col].findIndex((x) => x.id === id);
  if (i < 0) S[col].push({ ...applyInc({}, data), id }); else S[col][i] = applyInc(S[col][i], data);
}

function takeSnapshot(r) {
  session.user = { uid: r.user.uid, email: r.user.email, name: r.user.name, role: r.user.role };
  COLS.forEach((c) => (S[c] = r.data[c] || []));
  lsSet(K_CACHE, JSON.stringify({ user: session.user, data: S }));
}

function dropSession() {
  token = ''; outbox = []; lastVer = -1;
  lsDel(K_TOKEN); lsDel(K_OUT); lsDel(K_CACHE);
  COLS.forEach((c) => (S[c] = []));
  session.user = null; session.ready = true;
  renderCb();
}

async function flush() {
  if (flushing || !outbox.length || !token || navigator.onLine === false) return;
  flushing = true;
  try {
    const n = outbox.length, r = await call('push', { ops: outbox.slice(0, n) });
    outbox.splice(0, n); saveOutbox(); lastVer = -1;
    if (r.failed) onError(`${r.failed} change(s) were not allowed for your role.`);
  } catch (e) {
    if (e.code === 'auth/session-expired') { flushing = false; return dropSession(); }
    if (!e.network) { outbox = []; saveOutbox(); onError('Could not save: ' + e.message); }   // otherwise keep and retry later
  } finally { flushing = false; }
}

async function sync(force) {
  if (!token || pulling || flushing || outbox.length) return;
  pulling = true;
  try {
    if (!force) {
      const p = await call('ping');
      if (p.ver === lastVer && session.user && p.role === session.user.role) return;
    }
    const r = await call('pull');
    if (outbox.length) return;                    // a change was made meanwhile: send it first, then refresh
    const roleChanged = !session.user || session.user.role !== r.user.role;
    lastVer = r.ver; takeSnapshot(r);
    session.ready = true; session.error = '';
    if (roleChanged) renderCb(); else emit();
  } catch (e) {
    if (e.code === 'auth/session-expired') { pulling = false; return dropSession(); }
  } finally { pulling = false; }
}

async function tick() { if (document.hidden) return; await flush(); await sync(false); }
function startPolling() {
  if (timer) return;
  timer = setInterval(tick, POLL_MS);
  document.addEventListener('visibilitychange', tick);
  window.addEventListener('online', tick);
}

export async function startSession(cb) {
  renderCb = cb;
  if (mode === 'demo') {
    lsLoad();
    const role = lsGet(LS + 'role') || 'partner';
    session.user = { uid: 'demo', name: 'Demo user', email: '', role };
    session.ready = true;
    cb();
    return;
  }
  try { outbox = JSON.parse(lsGet(K_OUT) || '[]'); } catch { outbox = []; }
  token = lsGet(K_TOKEN) || '';
  if (!token) { session.ready = true; cb(); return; }
  let cached = null;
  try { cached = JSON.parse(lsGet(K_CACHE) || 'null'); } catch {}
  if (cached && cached.user) {              // open instantly from the last copy, refresh in the background
    session.user = cached.user;
    COLS.forEach((c) => (S[c] = (cached.data && cached.data[c]) || []));
    session.ready = true; cb();
    startPolling(); tick(); sync(true);
    return;
  }
  try {
    const r = await call('pull');
    lastVer = r.ver; takeSnapshot(r); session.ready = true; startPolling(); cb();
  } catch (e) {
    if (e.code === 'auth/session-expired') return dropSession();
    session.error = 'Could not load the farm data. Check your internet and try again.';
    session.ready = true; cb();
  }
}

async function enter(r) {
  token = r.token; lsSet(K_TOKEN, token);
  session.user = r.user; session.error = '';
  await sync(true);
  startPolling();
  renderCb();
}
export async function login(email, pw) { await enter(await call('login', { id: email, pw })); }
export async function signup(name, email, pw) { await enter(await call('signup', { name, id: email, pw })); }
export async function logout() {
  if (mode !== 'cloud') return;
  try { await flush(); await call('logout'); } catch {}
  dropSession();
}
export async function resetPassword() {
  throw new Error('Reset by email is not available. Ask the owner to delete your row in the "users" tab of the Google Sheet, then create the account again.');
}

// ───────────── generic writes (same API for both backends) ─────────────
export function set(col, id, data) {
  data = clean(data);
  if (mode === 'demo') {
    const i = S[col].findIndex((x) => x.id === id);
    if (i < 0) S[col].push({ ...applyInc({}, data), id }); else S[col][i] = applyInc(S[col][i], data);
    lsSave(col); emit();
  } else {
    applyLocal(col, id, data);
    outbox.push({ op: 'set', col, id, data }); saveOutbox();
    emit(); flush();
  }
  return id;
}
export const add = (col, data) => set(col, newId(), data);
export function del(col, id) {
  if (mode === 'demo') { S[col] = S[col].filter((x) => x.id !== id); lsSave(col); emit(); }
  else {
    S[col] = S[col].filter((x) => x.id !== id);
    outbox.push({ op: 'del', col, id }); saveOutbox();
    emit(); flush();
  }
}
