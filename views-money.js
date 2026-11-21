// views-money.js — Employees (advances), Partners (expenses / credits / split) and Reports
import { S, add, set, del, newId } from './db.js';
import { esc, num, fmt, money, today, showDate, MONTHS, toast, openSheet, closeSheet, sheetHead, download, csvCell, $, uniq, isNative } from './util.js';
import * as C from './calc.js';
import { ui, isPartner, isManager } from './ctx.js';
import { panchang } from './panchang.js';

const options = (list, sel) => list.map(([v, l]) => `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(l)}</option>`).join('');
const sign = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');

// ══════════════════════ EMPLOYEES ══════════════════════
export function employeesView() {
  const emps = [...S.employees].sort((a, b) => a.name.localeCompare(b.name));
  const totalOut = emps.reduce((a, e) => a + C.empBalance(e.id).bal, 0);
  let html = `<div class="card light"><div class="row between"><div><div class="muted small">Advances outstanding</div><div class="amt gold" style="font-size:26px">${money(totalOut)}</div></div><button class="btn" data-act="addEmp">＋ Employee</button></div></div>`;
  html += emps.length ? `<div class="card">${emps.map((e) => {
    const b = C.empBalance(e.id);
    return `<div class="li"><button class="row" data-act="emp" data-id="${e.id}"><div class="tank-ic" style="width:40px;height:40px">👤</div><div class="grow"><div class="b">${esc(e.name)}</div><div class="small muted">${esc(e.role || 'Employee')}${e.salary ? ' · salary ' + money(e.salary) + '/mo' : ''}</div></div><div style="text-align:right"><div class="amt ${b.bal > 0 ? 'neg' : ''}">${money(b.bal)}</div><div class="tiny muted">balance</div></div></button></div>`;
  }).join('')}</div>` : `<div class="card empty-state"><div class="big">👷</div><h2>No employees yet</h2><p class="muted">Add your workers to track advances you give them.</p></div>`;
  return html;
}

export function empFormSheet(id) {
  const e = id ? C.empById(id) : null;
  openSheet(`${sheetHead(e ? 'Edit employee' : 'Add employee')}<form>
    <label class="f">Name<input class="in" name="name" required value="${esc(e?.name || '')}"></label>
    <div class="grid2"><label class="f">Role<input class="in" name="role" value="${esc(e?.role || '')}" placeholder="Feeder, watchman…"></label><label class="f">Phone<input class="in" name="phone" type="tel" value="${esc(e?.phone || '')}"></label></div>
    <label class="f">Monthly salary (₹, optional)<input class="in" name="salary" type="number" inputmode="decimal" value="${e?.salary ?? ''}"></label>
    <div class="row mt"><button class="btn grow" type="submit">Save</button>${e ? '<button class="btn red" type="button" data-do="del">Delete</button>' : ''}</div></form>`, {
    submit: (v) => { set('employees', e?.id || newId(), { name: v.name.trim(), role: v.role, phone: v.phone, salary: num(v.salary) }); toast('Saved'); },
    acts: { del: () => { if (confirm('Delete this employee and all their advance records?')) { S.advances.filter((a) => a.empId === e.id).forEach((a) => del('advances', a.id)); del('employees', e.id); closeSheet(); } } },
  });
}

export function empSheet(id) {
  const e = C.empById(id); if (!e) return;
  const b = C.empBalance(id), list = S.advances.filter((a) => a.empId === id).sort((x, y) => (y.date + y.ts).localeCompare(x.date + x.ts));
  const ym = today().slice(0, 7), thisMonth = list.filter((a) => a.kind !== 'recover' && a.date.startsWith(ym)).reduce((s, a) => s + num(a.amount), 0);
  openSheet(`${sheetHead(e.name, (e.role || 'Employee') + (e.phone ? ' · ' + e.phone : ''))}
    <div class="grid2 mt"><div class="card light" style="margin:0"><div class="muted tiny">Given in total</div><div class="amt">${money(b.given)}</div></div><div class="card light" style="margin:0"><div class="muted tiny">Outstanding</div><div class="amt ${b.bal > 0 ? 'neg' : ''}" style="font-size:20px">${money(b.bal)}</div></div></div>
    ${e.salary ? `<p class="small muted mt-s">This month: advances ${money(thisMonth)} · salary ${money(e.salary)} → balance payable after deducting this month's advances: <b>${money(e.salary - thisMonth)}</b></p>` : ''}
    <div class="row mt"><button class="btn grow" data-do="give">Give advance</button><button class="btn ghost grow" data-do="back">Recovered / deducted</button></div>
    <div class="sec-title" style="color:#4d6f7c">Statement</div>
    ${list.map((a) => `<div class="li"><span class="pill ${a.kind === 'recover' ? 'good' : 'warn'}">${a.kind === 'recover' ? 'BACK' : 'GIVEN'}</span><div class="grow small"><div class="b">${showDate(a.date)}${a.mode ? ' · ' + esc(a.mode) : ''}</div><div class="muted tiny">${esc(a.reason || '')}</div></div><div class="amt">${a.kind === 'recover' ? '−' : '+'}${money(a.amount)}</div><button class="icon-btn" data-do="delAdv" data-id="${a.id}" aria-label="Delete">🗑</button></div>`).join('') || '<p class="muted small">No entries yet.</p>'}
    <button class="btn ghost block mt" data-do="edit">Edit employee</button>`, {
    acts: { give: () => advanceSheet(id, 'give'), back: () => advanceSheet(id, 'recover'), edit: () => empFormSheet(id),
      delAdv: (el) => { if (confirm('Delete this entry?')) { S.ledger.filter((l) => l.refId === el.dataset.id).forEach((l) => del('ledger', l.id)); del('advances', el.dataset.id); empSheet(id); } } },
  });
}

function advanceSheet(empId, kind) {
  const e = C.empById(empId), give = kind === 'give';
  const paidBy = give && isPartner() && S.partners.length ? `<label class="f">Paid by partner (adds to partner expenses)<select class="in" name="partner"><option value="">Not recorded</option>${S.partners.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label>` : '';
  openSheet(`${sheetHead(give ? 'Give advance' : 'Recovered / salary deduction', e.name)}<form>
    <div class="grid2"><label class="f">Amount (₹)<input class="in" name="amount" type="number" step="any" min="0" inputmode="decimal" required></label><label class="f">Date<input class="in" type="date" name="date" value="${today()}" required></label></div>
    ${give ? `<label class="f">Paid via<select class="in" name="mode">${options(['Cash', 'UPI', 'Bank transfer'].map((x) => [x, x]), 'Cash')}</select></label>` : ''}
    <label class="f">${give ? 'Reason' : 'Note'}<input class="in" name="reason" placeholder="${give ? 'Medical, festival, personal…' : 'Deducted from salary'}"></label>${paidBy}
    <button class="btn ${give ? '' : 'green'} block mt" type="submit">Save</button></form>`, {
    submit: (v) => {
      const amt = num(v.amount); if (amt <= 0) { toast('Enter an amount'); return false; }
      const id = add('advances', { empId, kind: give ? 'given' : 'recover', amount: amt, date: v.date, mode: v.mode || '', reason: v.reason, ts: Date.now() });
      if (give && v.partner) add('ledger', { type: 'expense', amount: amt, date: v.date, category: 'Employee advance', note: `Advance to ${e.name}`, partner: v.partner, sharedBy: [], refId: id });
      toast('Saved'); setTimeout(() => empSheet(empId), 0); return false;
    },
  });
}

// ══════════════════════ PARTNERS ══════════════════════
export function partnersView() {
  if (!S.partners.length) return `<div class="card empty-state"><div class="big">🤝</div><h2>Set up your partners</h2><p class="muted mb">Add all four partners and their share of the farm.</p><button class="btn block" data-act="setupPartners">Add partners</button></div>`;
  const { b, totalExp, totalCred } = C.partnerBalances(), sets = C.settlements(b);
  const pn = (id) => esc(C.partnerById(id)?.name || '?');
  let html = `<div class="row mb"><button class="btn grow" data-act="addLedger" data-id="expense">− Expense</button><button class="btn green grow" data-act="addLedger" data-id="credit">＋ Credit</button></div>`;
  html += `<div class="card"><div class="row between"><h2>Partner accounts</h2><button class="btn small ghost" data-act="editPartners">Edit</button></div>
  <table class="t"><thead><tr><th>Partner</th><th class="r">Paid</th><th class="r">Credit rec'd</th><th class="r">Net</th></tr></thead><tbody>
  ${S.partners.map((p) => { const x = b[p.id]; return `<tr><td><b>${esc(p.name)}</b><div class="tiny muted">${fmt(p.share, 1)}% share</div></td><td class="r">${money(x.paid)}</td><td class="r">${money(x.received)}</td><td class="r amt ${sign(Math.round(x.net))}">${x.net >= 0.5 ? '+' : ''}${money(x.net)}<div class="tiny muted" style="font-weight:500">${x.net >= 0.5 ? 'to receive' : x.net <= -0.5 ? 'to pay' : 'settled'}</div></td></tr>`; }).join('')}
  <tr><td><b>Total</b></td><td class="r"><b>${money(totalExp)}</b></td><td class="r"><b>${money(totalCred)}</b></td><td class="r amt ${sign(totalCred - totalExp)}">${money(totalCred - totalExp)}<div class="tiny muted" style="font-weight:500">farm balance</div></td></tr></tbody></table>
  <p class="tiny muted mt-s">Net = what a partner paid minus their share of expenses, minus the credit they hold above their share. Totals of Net always add to zero.</p></div>`;
  html += `<div class="card"><h2>Who pays whom</h2>${sets.length ? sets.map((s) => `<div class="li"><div class="grow"><b>${pn(s.from)}</b> → <b>${pn(s.to)}</b></div><div class="amt">${money(s.amount)}</div></div>`).join('') + `<button class="btn ghost block mt-s" data-act="settle">Record a settlement payment</button>` : '<p class="muted small">Everyone is settled up. 🎉</p>'}</div>`;

  const list = [...S.ledger].sort((a, c) => (c.date + (c.ts || 0)).localeCompare(a.date + (a.ts || 0)));
  const shown = ui.ledgerAll ? list : list.slice(0, 12);
  html += `<div class="sec-title">Transactions</div><div class="card">${shown.length ? shown.map((e) => {
    const isS = e.type === 'settle', sh = !isS && e.sharedBy && e.sharedBy.length && e.sharedBy.length < S.partners.length;
    return `<div class="li"><button class="row" data-act="ledger" data-id="${e.id}"><span class="pill ${e.type === 'expense' ? 'bad' : e.type === 'credit' ? 'good' : ''}">${e.type === 'expense' ? 'EXP' : e.type === 'credit' ? 'CR' : 'PAY'}</span>
      <div class="grow small"><div class="b">${esc(isS ? `${pn(e.from)} paid ${pn(e.to)}` : e.category || 'Entry')}${e.tankId && C.tankById(e.tankId) ? ' · ' + esc(C.tankById(e.tankId).name) : ''}</div><div class="muted tiny">${showDate(e.date)}${isS ? '' : ' · ' + (e.type === 'expense' ? 'paid by ' : 'received by ') + pn(e.partner)}${sh ? ' · shared by ' + e.sharedBy.length : ''}${e.note ? ' · ' + esc(e.note) : ''}</div></div>
      <div class="amt ${e.type === 'credit' ? 'pos' : ''}">${e.type === 'credit' ? '+' : ''}${money(e.amount)}</div></button></div>`;
  }).join('') + (list.length > 12 ? `<button class="btn ghost block mt-s small" data-act="ledgerAll">${ui.ledgerAll ? 'Show fewer' : `Show all ${list.length}`}</button>` : '') : '<p class="muted small">No entries yet. Add your first expense or credit.</p>'}</div>`;

  html += `<div class="sec-title">Reports &amp; export</div><div class="card"><div class="grid2">
    <button class="btn ghost" data-act="reportPdf">📄 Farm report (PDF)</button><button class="btn ghost" data-act="reportCsv">📊 Accounts (Excel)</button></div>
    <button class="btn green block mt-s" data-act="whatsapp">Share summary via WhatsApp</button></div>`;
  return html;
}

export function partnerSetupSheet(firstTime) {
  const rows = S.partners.length ? S.partners : [1, 2, 3, 4].map((i) => ({ id: '', name: '', share: 25 }));
  openSheet(`${sheetHead(firstTime ? 'Add partners' : 'Partners & shares', 'Shares are used to split every expense and credit')}<form>
    ${rows.map((p, i) => `<div class="grid2" style="grid-template-columns:2fr 1fr"><label class="f">Partner ${i + 1}<input class="in" name="n${i}" value="${esc(p.name)}" ${i < 2 ? 'required' : ''} placeholder="Name"></label><label class="f">Share %<input class="in" name="s${i}" type="number" step="any" inputmode="decimal" value="${p.share ?? 25}"></label><input type="hidden" name="i${i}" value="${p.id}"></div>`).join('')}
    <div class="row mt"><button class="btn grow" type="submit">Save</button><button class="btn ghost" type="button" data-do="more">＋ Another</button></div></form>`, {
    submit: (v, form) => {
      const n = form.querySelectorAll('[name^="n"]').length; let total = 0, saved = 0;
      for (let i = 0; i < n; i++) { const name = (v['n' + i] || '').trim(); if (!name) continue; total += num(v['s' + i]); saved++; }
      if (Math.abs(total - 100) > 0.5 && !confirm(`Shares add up to ${fmt(total, 1)}%, not 100%. Splits will be scaled proportionally. Save anyway?`)) return false;
      for (let i = 0; i < n; i++) { const name = (v['n' + i] || '').trim(); if (!name) continue; set('partners', v['i' + i] || newId(), { name, share: num(v['s' + i]) }); }
      toast('Partners saved');
    },
    acts: { more: (el, e, sheet) => { sheet.querySelector('form').insertAdjacentHTML('afterbegin', ''); const f = sheet.querySelector('form'); const i = f.querySelectorAll('[name^="n"]').length; f.querySelector('.row.mt').insertAdjacentHTML('beforebegin', `<div class="grid2" style="grid-template-columns:2fr 1fr"><label class="f">Partner ${i + 1}<input class="in" name="n${i}" placeholder="Name"></label><label class="f">Share %<input class="in" name="s${i}" type="number" step="any" value="0"></label><input type="hidden" name="i${i}" value=""></div>`); } },
  });
}

export function ledgerSheet(type, id) {
  const e = id ? S.ledger.find((x) => x.id === id) : null; type = e ? e.type : type;
  if (type === 'settle') return settleSheet(e);
  const ex = type === 'expense', cats = ex ? C.EXPENSE_CATS : C.CREDIT_CATS, sel = e?.sharedBy?.length ? e.sharedBy : S.partners.map((p) => p.id);
  openSheet(`${sheetHead(e ? 'Edit entry' : ex ? 'Add expense' : 'Add credit (income)')}<form>
    <div class="grid2"><label class="f">Amount (₹)<input class="in" name="amount" type="number" step="any" min="0" required inputmode="decimal" value="${e?.amount ?? ''}"></label><label class="f">Date<input class="in" type="date" name="date" required value="${e?.date || today()}"></label></div>
    <label class="f">Category<select class="in" name="category">${options(cats.map((c) => [c, c]), e?.category || cats[0])}</select></label>
    <label class="f">${ex ? 'Paid by' : 'Received by'}<select class="in" name="partner" required>${options(S.partners.map((p) => [p.id, p.name]), e?.partner)}</select></label>
    <label class="f">For tank (optional)<select class="in" name="tankId"><option value="">— whole farm —</option>${C.sortedTanks().map((t) => `<option value="${t.id}" ${t.id === e?.tankId ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
    <label class="f">Note<input class="in" name="note" value="${esc(e?.note || '')}" placeholder="Bill no., buyer, details…"></label>
    <div class="f" style="margin-top:12px">${ex ? 'Cost is shared by' : 'Credit is shared by'} <span class="muted tiny">(split by each partner's share %)</span></div>
    ${S.partners.map((p) => `<label class="check"><input type="checkbox" name="sharedBy[]" value="${p.id}" ${sel.includes(p.id) ? 'checked' : ''}> ${esc(p.name)} <span class="muted tiny">${fmt(p.share, 1)}%</span></label>`).join('')}
    <div class="row mt"><button class="btn ${ex ? '' : 'green'} grow" type="submit">Save</button>${e ? '<button class="btn red" type="button" data-do="del">Delete</button>' : ''}</div></form>`, {
    submit: (v) => {
      const amt = num(v.amount); if (amt <= 0) { toast('Enter an amount'); return false; }
      if (!v.sharedBy || !v.sharedBy.length) { toast('Select at least one partner to share with'); return false; }
      set('ledger', e?.id || newId(), { type, amount: amt, date: v.date, category: v.category, partner: v.partner, tankId: v.tankId || '', note: v.note, sharedBy: v.sharedBy.length === S.partners.length ? [] : v.sharedBy, ts: e?.ts || Date.now() });
      toast('Saved');
    },
    acts: { del: () => { if (confirm('Delete this entry?')) { del('ledger', e.id); closeSheet(); } } },
  });
}

function settleSheet(e) {
  const { b } = C.partnerBalances(), s = C.settlements(b)[0], ps = S.partners.map((p) => [p.id, p.name]);
  openSheet(`${sheetHead(e ? 'Settlement payment' : 'Record settlement', 'One partner paid another to clear dues')}<form>
    <label class="f">Paid by<select class="in" name="from">${options(ps, e?.from || s?.from)}</select></label>
    <label class="f">Paid to<select class="in" name="to">${options(ps, e?.to || s?.to)}</select></label>
    <div class="grid2"><label class="f">Amount (₹)<input class="in" name="amount" type="number" step="any" required inputmode="decimal" value="${e?.amount ?? s?.amount ?? ''}"></label><label class="f">Date<input class="in" type="date" name="date" value="${e?.date || today()}" required></label></div>
    <div class="row mt"><button class="btn green grow" type="submit">Save</button>${e ? '<button class="btn red" type="button" data-do="del">Delete</button>' : ''}</div></form>`, {
    submit: (v) => { if (v.from === v.to) { toast('Choose two different partners'); return false; } set('ledger', e?.id || newId(), { type: 'settle', from: v.from, to: v.to, amount: num(v.amount), date: v.date, ts: e?.ts || Date.now() }); toast('Settlement recorded'); },
    acts: { del: () => { if (confirm('Delete?')) { del('ledger', e.id); closeSheet(); } } },
  });
}

// ══════════════════════ REPORTS ══════════════════════
const pname = (id) => C.partnerById(id)?.name || '?';

export function summaryText() {
  const { b, totalExp, totalCred } = C.partnerBalances(), sets = C.settlements(b), st = C.settings();
  const lines = [`*${st.farmName} — account summary*`, new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }), '', `Total expenses: ${money(totalExp)}`, `Total credits: ${money(totalCred)}`, `Farm balance: ${money(totalCred - totalExp)}`, ''];
  S.partners.forEach((p) => { const x = b[p.id]; lines.push(`• ${p.name} (${fmt(p.share, 1)}%): paid ${money(x.paid)}, credit ${money(x.received)} → ${x.net >= 0.5 ? 'to receive ' + money(x.net) : x.net <= -0.5 ? 'to pay ' + money(-x.net) : 'settled'}`); });
  if (sets.length) { lines.push('', '*Settlement*'); sets.forEach((s) => lines.push(`${pname(s.from)} → ${pname(s.to)}: ${money(s.amount)}`)); }
  return lines.join('\n');
}
export const whatsapp = () => {
  if (isNative()) return window.Capacitor.Plugins.Share.share({ text: summaryText(), dialogTitle: 'Share summary' }).catch(() => {});
  window.open('https://wa.me/?text=' + encodeURIComponent(summaryText()), '_blank');
};

export function accountsCsv() {
  const { b, totalExp, totalCred } = C.partnerBalances(), rows = [];
  rows.push(['PARTNER SUMMARY'], ['Partner', 'Share %', 'Paid (expenses)', 'Credit received', 'Net (+ to receive / - to pay)']);
  S.partners.forEach((p) => rows.push([p.name, p.share, Math.round(b[p.id].paid), Math.round(b[p.id].received), Math.round(b[p.id].net)]));
  rows.push(['Total', '', Math.round(totalExp), Math.round(totalCred), ''], [], ['SETTLEMENT']);
  C.settlements(b).forEach((s) => rows.push([`${pname(s.from)} pays ${pname(s.to)}`, Math.round(s.amount)]));
  rows.push([], ['LEDGER'], ['Date', 'Type', 'Category', 'Amount', 'Partner / From', 'To / Shared by', 'Tank', 'Note']);
  [...S.ledger].sort((a, c) => a.date.localeCompare(c.date)).forEach((e) => rows.push([e.date, e.type, e.category || '', e.amount, e.type === 'settle' ? pname(e.from) : pname(e.partner), e.type === 'settle' ? pname(e.to) : (e.sharedBy?.length ? e.sharedBy.map(pname).join(' + ') : 'All partners'), C.tankById(e.tankId)?.name || '', e.note || '']));
  rows.push([], ['EMPLOYEE ADVANCES'], ['Employee', 'Given', 'Recovered', 'Outstanding']);
  S.employees.forEach((e) => { const x = C.empBalance(e.id); rows.push([e.name, x.given, x.back, x.bal]); });
  download(`aqua-accounts-${today()}.csv`, rows.map((r) => r.map(csvCell).join(',')).join('\n'));
}

export function printReport() {
  const st = C.settings(), { b, totalExp, totalCred } = C.partnerBalances(), sets = C.settlements(b);
  const t0 = new Date(), pc = panchang(t0.getFullYear(), t0.getMonth() + 1, t0.getDate(), C.location());
  const tanks = C.sortedTanks().map((t) => {
    const c = C.activeCycle(t.id); if (!c) return `<tr><td>${esc(t.name)}</td><td>Empty</td><td colspan="6"></td></tr>`;
    const f = C.cycleFeed(c), d = C.density(c, t);
    return `<tr><td>${esc(t.name)}</td><td>Culturing</td><td class="r">${C.docOf(c)}</td><td class="r">${fmt(c.seeds, 0)}</td><td class="r">${d != null ? fmt(d, 1) : '–'}</td><td class="r">${fmt(f.qty, 0)}</td><td class="r">${money(f.cost)}</td><td class="r">${C.tankTodayAvg(t.id) ?? '–'}${C.tankTodayAvg(t.id) != null ? '%' : ''}</td></tr>`;
  }).join('');
  const html = `<h1>${esc(st.farmName)} — Farm report</h1><p>${t0.toLocaleDateString('en-IN', { dateStyle: 'full' })} · ${pc.paksha} ${pc.tithiEn} · ${pc.monthEn}</p>
  <h2>Tanks</h2><table><tr><th>Tank</th><th>Status</th><th class="r">DOC</th><th class="r">Seed</th><th class="r">Density /m²</th><th class="r">Feed used (kg)</th><th class="r">Feed cost</th><th class="r">Today tray</th></tr>${tanks}</table>
  <h2>Inventory</h2><table><tr><th>Category</th><th>Item</th><th class="r">Stock</th><th class="r">Avg rate</th></tr>${S.items.map((i) => `<tr><td>${i.cat}</td><td>${esc(C.itemLabel(i))}</td><td class="r">${fmt(C.stockOf(i.id))} ${i.unit}</td><td class="r">${C.avgRate(i.id) ? money(C.avgRate(i.id)) : '–'}</td></tr>`).join('')}</table>
  ${isPartner() ? `<h2>Partner accounts</h2><table><tr><th>Partner</th><th class="r">Share</th><th class="r">Paid</th><th class="r">Credit received</th><th class="r">Net</th></tr>${S.partners.map((p) => `<tr><td>${esc(p.name)}</td><td class="r">${fmt(p.share, 1)}%</td><td class="r">${money(b[p.id].paid)}</td><td class="r">${money(b[p.id].received)}</td><td class="r">${money(b[p.id].net)}</td></tr>`).join('')}<tr><th>Total</th><th></th><th class="r">${money(totalExp)}</th><th class="r">${money(totalCred)}</th><th></th></tr></table>
  ${sets.length ? '<p><b>Settlement:</b> ' + sets.map((s) => `${esc(pname(s.from))} → ${esc(pname(s.to))} ${money(s.amount)}`).join('; ') + '</p>' : ''}
  <h2>Employee advances</h2><table><tr><th>Employee</th><th class="r">Given</th><th class="r">Recovered</th><th class="r">Outstanding</th></tr>${S.employees.map((e) => { const x = C.empBalance(e.id); return `<tr><td>${esc(e.name)}</td><td class="r">${money(x.given)}</td><td class="r">${money(x.back)}</td><td class="r">${money(x.bal)}</td></tr>`; }).join('')}</table>` : ''}`;
  if (isNative()) {   // phones cannot print from inside the app: share the report as a page that opens in any browser (Print → Save as PDF there)
    const page = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(st.farmName)} report</title><style>body{font:14px system-ui,sans-serif;padding:12px}table{width:100%;border-collapse:collapse;margin-bottom:12px}th,td{border:1px solid #bbb;padding:4px 6px;text-align:left}.r{text-align:right}h2{border-bottom:1px solid #999}</style></head><body>${html}</body></html>`;
    return download(`farm-report-${today()}.html`, page, 'text/html');
  }
  $('#printArea').innerHTML = html;
  setTimeout(() => window.print(), 50);
}
