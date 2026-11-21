/**
 * Aqua Farm backend — Google Apps Script bound to a Google Sheet.
 *
 * Every kind of record (tanks, items, feed logs, ledger...) lives in its own
 * tab of this spreadsheet:   id | data (JSON) | updated
 * The phone app talks to this script; people never touch the Sheet directly.
 *
 * Roles (same as the old Firebase rules):
 *   partner  : everything, incl. partner money
 *   manager  : tanks, inventory, feeding, employees/advances (no partner money)
 *   employee : view tanks, log feeding + tray checks
 *   pending  : just signed up, sees nothing until a partner approves
 * The FIRST account created becomes the partner (owner).
 */

var COLS = ['tanks', 'cycles', 'items', 'txns', 'feedlogs', 'employees', 'advances', 'partners', 'ledger', 'settings', 'users'];
var WINDOW_DAYS = 14;          // feed logs + stock movements sent to phones
var TZ = 'Asia/Kolkata';
var MAX_TOKENS = 8;            // phones signed in at once, per person

// ───────────── entry points ─────────────
function doGet() {
  return ContentService.createTextOutput('Aqua Farm backend is running.');
}

function doPost(e) {
  var out;
  try {
    var req = JSON.parse(e.postData.contents);
    out = route(req);
  } catch (err) {
    out = { error: err.code || 'server-error', message: String(err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function route(req) {
  switch (req.action) {
    case 'signup': return withLock(function () { return signup(req); });
    case 'login': return withLock(function () { return login(req); });
    case 'logout': return withLock(function () { return logout(req); });
    case 'ping': return ping(req);
    case 'pull': return pull(req);
    case 'push': return withLock(function () { return push(req); });
    default: fail('bad-action');
  }
}

// ───────────── helpers ─────────────
function fail(code) { var e = new Error(code); e.code = code; throw e; }

function withLock(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function sheet(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, 3).setValues([['id', 'data', 'updated']]).setFontWeight('bold');
    sh.getRange('A:B').setNumberFormat('@');   // keep ids and JSON as plain text
    sh.setFrozenRows(1);
    sh.setColumnWidth(2, 600);
  }
  return sh;
}

function readRows(name) {
  var sh = sheet(name), n = sh.getLastRow();
  if (n < 2) return [];
  var vals = sh.getRange(2, 1, n - 1, 2).getValues(), out = [];
  for (var i = 0; i < vals.length; i++) {
    var o = {};
    try { o = JSON.parse(vals[i][1]); } catch (e) { continue; }
    o.id = String(vals[i][0]);
    out.push(o);
  }
  return out;
}

function findRow(sh, id) {
  var n = sh.getLastRow();
  if (n < 2) return 0;
  var ids = sh.getRange(2, 1, n - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === id) return i + 2;
  return 0;
}

function getDoc(name, id) {
  var sh = sheet(name), row = findRow(sh, id);
  if (!row) return null;
  var o = {};
  try { o = JSON.parse(sh.getRange(row, 2).getValue()); } catch (e) {}
  o.id = id;
  return o;
}

function writeDoc(name, id, obj) {
  var sh = sheet(name), row = findRow(sh, id), copy = {};
  for (var k in obj) if (k !== 'id') copy[k] = obj[k];
  var json = JSON.stringify(copy), now = new Date().toISOString();
  if (row) sh.getRange(row, 2, 1, 2).setValues([[json, now]]);
  else sh.appendRow([id, json, now]);
}

function deleteDoc(name, id) {
  var sh = sheet(name), row = findRow(sh, id);
  if (row) sh.deleteRow(row);
}

function bump() {
  var p = PropertiesService.getScriptProperties();
  var v = (Number(p.getProperty('ver')) || 0) + 1;
  p.setProperty('ver', String(v));
  return v;
}
function getVer() { return Number(PropertiesService.getScriptProperties().getProperty('ver')) || 0; }

function hash(pw, salt) {
  var d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + pw, Utilities.Charset.UTF_8);
  return d.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function normId(v) { return String(v || '').trim().toLowerCase(); }

function pubUser(u) {
  return { uid: u.id, email: u.email, name: u.name, role: u.role };
}
function stripUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role };
}

// ───────────── accounts ─────────────
function newToken(u) {
  var t = Utilities.getUuid() + Utilities.getUuid();
  var list = (u.tokens || []).concat([t]);
  if (list.length > MAX_TOKENS) list = list.slice(list.length - MAX_TOKENS);
  u.tokens = list;
  return t;
}

function signup(req) {
  var email = normId(req.id), name = String(req.name || '').trim(), pw = String(req.pw || '');
  if (email.indexOf('@') < 1) fail('auth/invalid-email');
  if (pw.length < 6) fail('auth/weak-password');
  var users = readRows('users');
  for (var i = 0; i < users.length; i++) if (users[i].email === email) fail('auth/email-already-in-use');
  var u = {
    id: Utilities.getUuid(), name: name || email, email: email,
    role: users.length === 0 ? 'partner' : 'pending',
    salt: Utilities.getUuid(), tokens: []
  };
  u.pw = hash(pw, u.salt);
  var token = newToken(u);
  writeDoc('users', u.id, u);
  bump();
  return { token: token, user: pubUser(u) };
}

function login(req) {
  var email = normId(req.id), pw = String(req.pw || '');
  var users = readRows('users');
  for (var i = 0; i < users.length; i++) {
    var u = users[i];
    if (u.email === email) {
      if (hash(pw, u.salt) !== u.pw) fail('auth/invalid-credential');
      var token = newToken(u);
      writeDoc('users', u.id, u);
      return { token: token, user: pubUser(u) };
    }
  }
  fail('auth/invalid-credential');
}

function logout(req) {
  var u = auth(req.token, true);
  if (u) {
    u.tokens = (u.tokens || []).filter(function (t) { return t !== req.token; });
    writeDoc('users', u.id, u);
  }
  return { ok: true };
}

function auth(token, soft) {
  token = String(token || '');
  if (token.length > 20) {
    var users = readRows('users');
    for (var i = 0; i < users.length; i++) {
      if ((users[i].tokens || []).indexOf(token) >= 0) return users[i];
    }
  }
  if (soft) return null;
  fail('auth/session-expired');
}

// ───────────── permissions ─────────────
function isApproved(u) { return u.role && u.role !== 'pending'; }
function isManager(u) { return u.role === 'partner' || u.role === 'manager'; }
function isPartner(u) { return u.role === 'partner'; }

function canRead(u, col) {
  if (!isApproved(u)) return false;
  switch (col) {
    case 'employees': case 'advances': return isManager(u);
    case 'partners': case 'ledger': case 'users': return isPartner(u);
    default: return true;
  }
}

function onlyKeys(data, keys) {
  for (var k in data) if (keys.indexOf(k) < 0) return false;
  return true;
}

// can this user create / update / delete here?
function canWrite(u, col, exists, data, isDelete) {
  if (!isApproved(u)) return false;
  switch (col) {
    case 'tanks': case 'settings': return isManager(u);
    case 'items': return isDelete || !exists ? isManager(u) : (isManager(u) || onlyKeys(data, ['stock']));
    case 'cycles': return isDelete || !exists ? isManager(u) : (isManager(u) || onlyKeys(data, ['feedQty', 'feedCost']));
    case 'feedlogs':
      if (isDelete) return isManager(u);
      return !exists ? true : (isManager(u) || onlyKeys(data, ['trays', 'avg']));
    case 'txns': return !exists ? true : isManager(u);
    case 'employees': case 'advances': return isManager(u);
    case 'partners': case 'ledger': return isPartner(u);
    case 'users': return isPartner(u);
    default: return false;
  }
}

// ───────────── sync ─────────────
function ping(req) {
  var u = auth(req.token);
  return { ver: getVer(), role: u.role };
}

function pull(req) {
  var u = auth(req.token);
  var cutoff = Utilities.formatDate(new Date(Date.now() - WINDOW_DAYS * 864e5), TZ, 'yyyy-MM-dd');
  var ver = getVer(), data = {};
  COLS.forEach(function (c) {
    if (!canRead(u, c)) return;
    var rows = readRows(c);
    if (c === 'txns' || c === 'feedlogs') rows = rows.filter(function (r) { return String(r.date || '') >= cutoff; });
    if (c === 'users') rows = rows.map(stripUser);
    data[c] = rows;
  });
  return { user: pubUser(u), data: data, ver: ver };
}

function applyOp(u, op) {
  var col = op.col, id = String(op.id || '');
  if (COLS.indexOf(col) < 0 || !id) return false;

  if (op.op === 'del') {
    if (!canWrite(u, col, true, {}, true)) return false;
    if (col === 'users') return false;
    deleteDoc(col, id);
    return true;
  }

  var data = op.data || {}, cur = getDoc(col, id);
  if (!canWrite(u, col, !!cur, data, false)) return false;

  if (col === 'users') {                         // partner may only change role / name of someone else
    if (!cur || id === u.id || !onlyKeys(data, ['role', 'name'])) return false;
    if (data.role && ['pending', 'employee', 'manager', 'partner'].indexOf(data.role) < 0) return false;
  }

  var merged = cur || {};
  for (var k in data) {
    var v = data[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && '__inc' in v) merged[k] = (Number(merged[k]) || 0) + (Number(v.__inc) || 0);
    else merged[k] = v;
  }
  writeDoc(col, id, merged);
  return true;
}

function push(req) {
  var u = auth(req.token), ops = req.ops || [], failed = 0;
  for (var i = 0; i < ops.length; i++) {
    try { if (!applyOp(u, ops[i])) failed++; } catch (e) { failed++; }
  }
  var ver = bump();
  return { ok: true, failed: failed, ver: ver };
}
