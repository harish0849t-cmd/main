// app.js — shell: login, tabs, profile/settings, sample data, event wiring
import { S, mode, session, startSession, onChange, add, set, del, login, signup, logout, resetPassword, demoRole, demoWipe, setErrorHandler, newId } from './db.js';
import { $, $$, esc, fmt, today, ymd, toast, openSheet, closeSheet, sheetHead, parseYmd, num } from './util.js';
import * as C from './calc.js';
import * as O from './ops.js';
import { ui, hooks, role, isManager, isPartner, TAB_ACCESS, TAB_NAMES } from './ctx.js';
import * as F from './views-farm.js';
import * as M from './views-money.js';
import { LOCATIONS } from './panchang.js';

setErrorHandler((m) => toast(m));
let installEvt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; });
window.addEventListener('online', () => hooks.render());
window.addEventListener('offline', () => hooks.render());

const ROLE_LABEL = { partner: 'Partner', manager: 'Manager', employee: 'Employee', pending: 'Pending' };
const LOGO = `<svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#27a58c"/><stop offset="1" stop-color="#1d5f8a"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#lg)"/><path d="M32 10c8 10 14 17 14 25a14 14 0 0 1-28 0c0-8 6-15 14-25z" fill="#fff" opacity=".95"/><path d="M12 46c5-4 8-4 13 0s8 4 13 0 8-4 14 0" fill="none" stroke="#f0cd7a" stroke-width="3.5" stroke-linecap="round"/></svg>`;

// ───────────── rendering ─────────────
function render() {
  const app = $('#app');
  if (!session.ready) { app.innerHTML = `<div class="login"><div class="logo" style="width:84px;height:84px;margin:60px auto 12px">${LOGO}</div><p class="sub" style="text-align:center">Loading…</p></div>`; return; }
  if (mode === 'cloud' && session.error) { app.innerHTML = `<div class="login"><h1>Aqua Farm</h1><div class="card mt"><p>${esc(session.error)}</p><button class="btn block mt" onclick="location.reload()">Try again</button></div></div>`; return; }
  if (mode === 'cloud' && !session.user) return loginScreen(app);
  if (role() === 'pending') {
    app.innerHTML = `<div class="login"><div class="logo" style="width:84px;height:84px;margin:30px auto 12px">${LOGO}</div><h1>Waiting for approval</h1><p class="sub">Hi ${esc(session.user.name)} — a partner needs to approve your account and choose your role.<br>Ask them to open <b>Profile → Team</b>.</p><button class="btn ghost block" id="logoutBtn">Sign out</button></div>`;
    $('#logoutBtn').onclick = logout; return;
  }
  const allowed = TAB_ACCESS[role()] || TAB_ACCESS.employee;
  if (!allowed.includes(ui.tab)) ui.tab = allowed[0];
  const st = C.settings(), name = session.user.name || '';
  const view = { tanks: F.tanksView, inventory: F.inventoryView, feeding: F.feedingView, calendar: F.calendarView, employees: M.employeesView, partners: M.partnersView }[ui.tab];
  const online = navigator.onLine !== false;
  const y = window.scrollY;
  app.innerHTML = `<header class="topbar"><div class="brand"><span style="width:34px;height:34px;display:block">${LOGO}</span><h1>${esc(st.farmName)} <span class="muted" style="font-weight:500;font-size:14px">· ${ROLE_LABEL[role()]} view</span></h1>
    <button class="avatar" data-act="profile" aria-label="Profile and settings">${esc((name[0] || '?').toUpperCase())}</button></div>
    <nav class="tabs" role="tablist">${allowed.map((t) => `<button class="tab ${t === ui.tab ? 'on' : ''}" role="tab" data-act="tab" data-id="${t}">${TAB_NAMES[t]}</button>`).join('')}</nav></header>
    <main class="page">${view()}<div class="status"><span><i class="dot ${online ? '' : 'off'}"></i>${online ? (mode === 'cloud' ? 'Online · synced' : 'Demo mode · saved on this phone') : 'Offline mode active — changes sync when back online'}</span></div></main>`;
  window.scrollTo(0, y);
}
hooks.render = render;

function loginScreen(app) {
  const signupMode = ui.signup;
  app.innerHTML = `<div class="login"><div class="logo">${LOGO}</div><h1>Aqua Farm</h1><p class="sub">Tanks · Feed · Check trays · Accounts</p>
  <form class="card light" id="loginForm"><h2>${signupMode ? 'Create account' : 'Sign in'}</h2>
    ${signupMode ? '<label class="f">Your name<input class="in" name="name" required autocomplete="name"></label>' : ''}
    <label class="f">Phone number or email<input class="in" name="id" required autocomplete="username" inputmode="email" autocapitalize="none"></label>
    <label class="f">Password<input class="in" name="pw" type="password" required minlength="6" autocomplete="${signupMode ? 'new-password' : 'current-password'}"></label>
    <div id="lerr" class="neg small mt-s" role="alert"></div>
    <button class="btn block mt" type="submit">${signupMode ? 'Create account' : 'Sign in'}</button>
    <button class="btn ghost block mt-s" type="button" id="swap">${signupMode ? 'I already have an account' : 'New here? Create account'}</button>
    ${signupMode ? '<p class="muted tiny mt-s">The first account created becomes the owner (Partner). Everyone else waits for a partner to approve them.</p>' : '<button class="btn ghost block mt-s small" type="button" id="forgot">Forgot password (email accounts)</button>'}</form></div>`;
  const toEmail = (v) => { v = v.trim(); return v.includes('@') ? v : v.replace(/\D/g, '') + '@aquafarm.app'; };
  const err = (e) => ({ 'auth/invalid-credential': 'Wrong phone/email or password.', 'auth/user-not-found': 'No account found.', 'auth/wrong-password': 'Wrong password.', 'auth/email-already-in-use': 'This number/email already has an account — sign in instead.', 'auth/weak-password': 'Password must be at least 6 characters.', 'auth/network-request-failed': 'No internet connection.', 'auth/invalid-email': 'Enter a valid phone number or email.', 'auth/too-many-requests': 'Too many attempts. Try again later.' }[e.code] || e.message);
  $('#swap').onclick = () => { ui.signup = !ui.signup; render(); };
  const forgot = $('#forgot'); if (forgot) forgot.onclick = async () => { const v = $('[name=id]').value; if (!v.includes('@')) return ($('#lerr').textContent = 'Type your email above first.'); try { await resetPassword(v.trim()); toast('Password reset email sent'); } catch (e) { $('#lerr').textContent = err(e); } };
  $('#loginForm').onsubmit = async (ev) => {
    ev.preventDefault(); const f = new FormData(ev.target), btn = ev.target.querySelector('[type=submit]'); btn.disabled = true; $('#lerr').textContent = '';
    try { if (signupMode) await signup(f.get('name').trim(), toEmail(f.get('id')), f.get('pw')); else await login(toEmail(f.get('id')), f.get('pw')); }
    catch (e) { $('#lerr').textContent = err(e); btn.disabled = false; }
  };
}

// ───────────── actions (buttons with data-act) ─────────────
const goTab = (t) => { ui.tab = t; window.scrollTo(0, 0); render(); };
const actions = {
  tab: (el) => goTab(el.dataset.id),
  goFeed: () => goTab('feeding'), goInv: () => goTab('inventory'), goCal: () => goTab('calendar'),
  profile: () => profileSheet(),
  tank: (el) => F.tankSheet(el.dataset.id), addTank: () => F.tankFormSheet(), quickTanks: () => F.quickTanksSheet(),
  invCat: (el) => { ui.invCat = el.dataset.id; render(); },
  item: (el) => F.itemSheet(el.dataset.id), newItem: () => F.itemFormSheet(), stockIn: () => F.stockSheet('in'), stockOut: () => F.stockSheet('out'),
  trayAll: (el) => { const v = el.dataset.id; ui.feed.trays = [0, 1, 2, 3].map(() => (v === 'clear' ? null : +v)); render(); },
  submitFeed: () => F.submitFeed(),
  feedDay: (el) => { const d = parseYmd(ui.feedDate); d.setDate(d.getDate() + +el.dataset.id); if (ymd(d) > today()) return; ui.feedDate = ymd(d); render(); },
  trays: (el) => F.traysSheet(el.dataset.id),
  delLog: (el) => { const l = S.feedlogs.find((x) => x.id === el.dataset.id); if (l && confirm('Delete this feeding log? Stock will be returned.')) O.removeFeeding(l); },
  calNav: (el) => { const c = ui.cal; c.m += +el.dataset.id; if (c.m < 0) { c.m = 11; c.y--; } if (c.m > 11) { c.m = 0; c.y++; } render(); },
  calDay: (el) => { ui.cal.sel = el.dataset.id; render(); },
  addEmp: () => M.empFormSheet(), emp: (el) => M.empSheet(el.dataset.id),
  setupPartners: () => M.partnerSetupSheet(true), editPartners: () => M.partnerSetupSheet(false),
  addLedger: (el) => M.ledgerSheet(el.dataset.id), ledger: (el) => M.ledgerSheet(null, el.dataset.id), settle: () => M.ledgerSheet('settle'),
  ledgerAll: () => { ui.ledgerAll = !ui.ledgerAll; render(); },
  reportPdf: () => M.printReport(), reportCsv: () => M.accountsCsv(), whatsapp: () => M.whatsapp(),
};
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]'); if (!el || !el.closest('#app')) return;
  const f = actions[el.dataset.act]; if (f) f(el);
});
F.bindFeedInputs($('#app'));

// ───────────── profile / settings ─────────────
function profileSheet() {
  const st = C.settings(), u = session.user;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent), standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  let html = `${sheetHead(u.name || 'Profile', `${ROLE_LABEL[role()]}${u.email && !u.email.endsWith('@aquafarm.app') ? ' · ' + u.email : ''}`)}`;
  if (mode === 'demo') html += `<div class="advice mt">Demo mode — data is saved only on this phone. Follow SETUP_GUIDE to go live so all partners and staff share one farm.</div>
    <div class="f" style="margin-top:12px">View the app as</div><div class="chips mt-s">${['partner', 'manager', 'employee'].map((r) => `<button class="chip ${role() === r ? 'on' : ''}" style="${role() === r ? '' : 'color:#10303d;background:#e8f1f4'}" data-do="role" data-r="${r}">${ROLE_LABEL[r]}</button>`).join('')}</div>
    <div class="row mt"><button class="btn green grow" data-do="seed">Load sample data</button><button class="btn red grow" data-do="wipe">Erase all</button></div>`;
  if (isManager()) html += `<form class="mt"><h3 class="mt" style="margin-top:16px">Farm settings</h3>
    <label class="f">Farm name<input class="in" name="farmName" value="${esc(st.farmName)}"></label>
    <label class="f">Farm location (for sunrise &amp; tithi)<select class="in" name="loc">${Object.entries(LOCATIONS).map(([k, l]) => `<option value="${k}" ${k === st.loc ? 'selected' : ''}>${l.name}</option>`).join('')}</select></label>
    <label class="f">Panchangam names<select class="in" name="names"><option value="both" ${st.names === 'both' ? 'selected' : ''}>English + తెలుగు</option><option value="te" ${st.names === 'te' ? 'selected' : ''}>తెలుగు only</option><option value="en" ${st.names === 'en' ? 'selected' : ''}>English only</option></select></label>
    <button class="btn block mt" type="submit">Save settings</button></form>`;
  if (mode === 'cloud' && isPartner()) html += `<button class="btn ghost block mt" data-do="team">👥 Team &amp; roles (${S.users.length})</button>`;
  if (!standalone) html += installEvt ? `<button class="btn ghost block mt" data-do="install">📲 Install app on this phone</button>` : `<div class="advice mt"><b>Install on your phone:</b> ${ios ? 'tap the Share button in Safari, then “Add to Home Screen”.' : 'open the browser menu (⋮) and tap “Install app” / “Add to Home screen”.'}</div>`;
  if (mode === 'cloud') html += `<button class="btn ghost block mt" data-do="logout">Sign out</button>`;
  openSheet(html, {
    submit: (v) => { set('settings', 'farm', { farmName: v.farmName.trim() || 'Aqua Farm', loc: v.loc, names: v.names }); toast('Settings saved'); },
    acts: {
      role: (el) => { demoRole(el.dataset.r); closeSheet(); }, seed: () => { closeSheet(); seedSample(); },
      wipe: () => { if (confirm('Erase ALL demo data on this phone?')) { demoWipe(); closeSheet(); } },
      team: () => teamSheet(), logout: () => { closeSheet(); logout(); },
      install: async () => { installEvt.prompt(); await installEvt.userChoice; installEvt = null; closeSheet(); },
    },
  });
}

function teamSheet() {
  const me = session.user.uid, users = [...S.users].sort((a, b) => (a.role === 'pending' ? -1 : 0) - (b.role === 'pending' ? -1 : 0));
  openSheet(`${sheetHead('Team & roles', 'Approve new sign-ups and choose what each person can do')}
    ${users.map((u) => `<div class="li"><div class="grow"><div class="b">${esc(u.name || u.email)}</div><div class="muted tiny">${esc((u.email || '').replace('@aquafarm.app', ''))}</div></div>
      <select class="in" style="width:auto;margin:0" data-uid="${u.id}" ${u.id === me ? 'disabled' : ''}>${['pending', 'employee', 'manager', 'partner'].map((r) => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${r === 'pending' ? '⏳ Pending' : ROLE_LABEL[r]}</option>`).join('')}</select></div>`).join('') || '<p class="muted">No one yet.</p>'}
    <p class="muted tiny mt"><b>Partner</b>: everything incl. money. <b>Manager</b>: tanks, inventory, feeding, staff advances. <b>Employee</b>: view tanks, log feeding &amp; trays.</p>`, {
    mount: (el) => el.addEventListener('change', (e) => { const s = e.target.closest('select[data-uid]'); if (s) { set('users', s.dataset.uid, { role: s.value }); toast('Role updated'); } }),
  });
}

// ───────────── sample data (demo) ─────────────
function seedSample() {
  if ((S.tanks.length || S.items.length) && !confirm('Add sample data on top of what is already here?')) return;
  const dAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d); };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const P = ['Ravi', 'Suresh', 'Kiran', 'Kumar'].map((name) => add('partners', { name, share: 25 }));
  const feed = {}; const sizes = [['Size 1', 150, 84], ['Size 2', 900, 78], ['Size 3', 1500, 72], ['Size 4', 2500, 66]];
  sizes.forEach(([sz, q, rate]) => { const id = newId(); set('items', id, { cat: 'feed', name: 'Vannamei Feed', size: sz, unit: 'kg', min: 100 }); feed[sz] = id; O.addTxn({ type: 'in', itemId: id, qty: q, rate, supplier: 'Godavari Feeds', date: dAgo(8), ts: Date.now() - 8 * 864e5, by: 'Demo' }); });
  [['minerals', 'Calcium', 'kg', 50, 120], ['minerals', 'Magnesium', 'kg', 50, 90], ['medicines', 'Probiotic', 'L', 10, 40], ['medicines', 'Vitamin C', 'kg', 5, 18], ['others', 'Diesel', 'L', 50, 180], ['others', 'Lime', 'kg', 100, 400]].forEach(([cat, name, unit, min, q]) => { const id = newId(); set('items', id, { cat, name, unit, min, size: '' }); O.addTxn({ type: 'in', itemId: id, qty: q, rate: 60, supplier: 'Local supplier', date: dAgo(10), ts: Date.now() - 10 * 864e5 }); });
  const docs = [45, 45, 42, 30, 18, null, null], tanks = [];
  docs.forEach((doc, i) => {
    const tid = newId(); tanks.push(tid); set('tanks', tid, { name: `Tank ${i + 1}`, areaInput: 1, areaUnit: 'acre', areaM2: 4046.8564 });
    if (doc != null) set('cycles', newId(), { tankId: tid, start: dAgo(doc), seeds: [180000, 170000, 150000, 130000, 100000][i], source: 'Coastal Hatchery', batch: 'B-' + (210 + i) });
  });
  const now = new Date();
  docs.forEach((doc, i) => {
    if (doc == null) return;
    const sz = doc >= 40 ? 'Size 4' : doc >= 30 ? 'Size 3' : doc >= 20 ? 'Size 2' : 'Size 1', base = doc >= 40 ? 22 : doc >= 30 ? 14 : 6;
    for (let d = 4; d >= 0; d--) [6, 12, 18].forEach((h, r) => {
      const t = new Date(); t.setDate(t.getDate() - d); t.setHours(h, 5, 0, 0); if (t > now) return;
      const qty = Math.round(base * rnd(0.9, 1.1) * 10) / 10, last = d === 0 && t.getHours() === Math.max(...[6, 12, 18].filter((x) => { const z = new Date(); z.setHours(x, 5, 0, 0); return z <= now; }));
      const trays = last ? [null, null, null, null] : [0, 1, 2, 3].map(() => Math.min(100, Math.round(rnd(65, 100) / 5) * 5));
      O.addFeeding({ tankId: tanks[i], itemId: feed[sz], qty, date: ymd(t), ts: t.getTime(), round: r + 1, trays, by: 'Demo' });
    });
  });
  const emps = [['Raju', 'Feeder', 9000], ['Mahesh', 'Watchman', 8000], ['Venkat', 'Helper', 7500]].map(([name, r, salary]) => add('employees', { name, role: r, salary, phone: '' }));
  [[0, 'given', 2000, 'Festival', 20], [0, 'given', 1500, 'Medical', 6], [0, 'recover', 1000, 'Salary deduction', 3], [1, 'given', 3000, 'Family need', 12], [2, 'given', 1000, 'Personal', 2]].forEach(([e, kind, amount, reason, ago]) => add('advances', { empId: emps[e], kind, amount, reason, mode: 'Cash', date: dAgo(ago), ts: Date.now() - ago * 864e5 }));
  [['expense', 120000, 'Feed', 0, 'Feed purchase — Godavari Feeds', 8], ['expense', 90000, 'Seed', 1, 'Seed — Coastal Hatchery', 45], ['expense', 45000, 'Labour', 2, 'Monthly labour', 6], ['expense', 30000, 'Electricity / diesel', 3, 'Aerators power bill', 4], ['expense', 18000, 'Medicines & minerals', 0, 'Probiotic + minerals', 3], ['credit', 400000, 'Harvest sale', 2, 'Partial harvest — Tank 6', 15], ['expense', 25000, 'Repairs', 1, 'Aerator repair — only Ravi & Suresh', 2, [P[0], P[1]]]].forEach(([type, amount, category, p, note, ago, sharedBy]) => add('ledger', { type, amount, category, partner: P[p], note, date: dAgo(ago), sharedBy: sharedBy || [], ts: Date.now() - ago * 864e5 }));
  toast('Sample farm loaded');
}

// ───────────── start ─────────────
// A live update from another phone must not wipe what someone is typing:
// if a text box is focused, wait until they leave it, then redraw.
let deferred = false;
onChange(() => {
  const a = document.activeElement;
  if (a && a.matches && a.matches('#app input, #app textarea, #app select')) { deferred = true; return; }
  render();
});
document.addEventListener('focusout', () => {
  if (!deferred) return;
  setTimeout(() => {
    const a = document.activeElement;
    if (a && a.matches && a.matches('#app input, #app textarea, #app select')) return; // moved to another field
    deferred = false; render();
  }, 150);
});
render();
startSession(render);
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
