// calc.js — all the farm arithmetic in one place (stock, DOC, density, partner split)
import { S } from './db.js';
import { today, daysBetween, num } from './util.js';
import { LOCATIONS } from './panchang.js';

export const CATS = [['feed', 'Feed'], ['minerals', 'Minerals'], ['medicines', 'Medicines'], ['others', 'Others']];
export const UNITS = ['kg', 'g', 'L', 'ml', 'bag', 'pcs'];
export const AREA_UNITS = { 'm²': 1, 'acre': 4046.8564, 'cent': 40.4686, 'hectare': 10000, 'sq ft': 0.092903 };
export const EXPENSE_CATS = ['Feed', 'Seed', 'Medicines & minerals', 'Labour', 'Electricity / diesel', 'Repairs', 'Employee advance', 'Inventory purchase', 'Lease / rent', 'Other'];
export const CREDIT_CATS = ['Harvest sale', 'Partner contribution', 'Subsidy / refund', 'Other'];

export const settings = () => ({ farmName: 'Aqua Farm', loc: 'hyderabad', names: 'both', ...(S.settings.find((s) => s.id === 'farm') || {}) });
export const location = () => { const s = settings(); return LOCATIONS[s.loc] || LOCATIONS.hyderabad; };

export const tankById = (id) => S.tanks.find((t) => t.id === id);
export const itemById = (id) => S.items.find((i) => i.id === id);
export const partnerById = (id) => S.partners.find((p) => p.id === id);
export const empById = (id) => S.employees.find((e) => e.id === id);
export const sortedTanks = () => [...S.tanks].sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true }));

// ── inventory ──
// Stock and average rate are running counters kept on the item (see ops.js), so they
// stay correct no matter how much history the phone has downloaded.
export function stockOf(itemId) {
  const it = itemById(itemId);
  return it ? Math.round(num(it.stock) * 1000) / 1000 : 0;
}
export function avgRate(itemId) {
  const it = itemById(itemId);
  return it && num(it.qtyIn) > 0 ? num(it.valueIn) / num(it.qtyIn) : 0;
}
export const isLow = (it) => num(it.min) > 0 && stockOf(it.id) <= num(it.min);
export const itemLabel = (it) => (it.cat === 'feed' && it.size ? `${it.name} (${it.size})` : it.name);

// ── tanks & cycles ──
export const activeCycle = (tankId) => S.cycles.find((c) => c.tankId === tankId && !c.end);
export const cyclesOf = (tankId) => S.cycles.filter((c) => c.tankId === tankId).sort((a, b) => (b.start || '').localeCompare(a.start || ''));
export const docOf = (c, on = today()) => Math.max(0, daysBetween(c.start, on));
export function density(c, t) { const a = num(t.areaM2); return a > 0 && num(c.seeds) > 0 ? num(c.seeds) / a : null; }

// Feed used in a cycle: running counters on the cycle (feedQty / feedCost)
export const cycleFeed = (c) => ({ qty: Math.round(num(c.feedQty) * 10) / 10, cost: Math.round(num(c.feedCost)) });
export const logsOn = (date) => S.feedlogs.filter((l) => l.date === date);
export function tankTodayAvg(tankId, date = today()) {
  const v = S.feedlogs.filter((l) => l.tankId === tankId && l.date === date && l.avg != null).sort((a, b) => b.ts - a.ts);
  return v.length ? v[0].avg : null;
}
export const traysAvg = (t) => { const v = (t || []).filter((x) => x != null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; };

// ── partners: split of expenses and credits ──
export function shareMap(e) {
  const chosen = (e.sharedBy && e.sharedBy.length ? e.sharedBy : S.partners.map((p) => p.id)).filter((id) => partnerById(id));
  const total = chosen.reduce((a, id) => a + (num(partnerById(id).share) || 0), 0);
  const m = {};
  chosen.forEach((id) => (m[id] = total > 0 ? num(partnerById(id).share) / total : 1 / chosen.length));
  return m;
}
export function partnerBalances() {
  const b = {};
  S.partners.forEach((p) => (b[p.id] = { paid: 0, received: 0, owedExp: 0, owedCred: 0, sOut: 0, sIn: 0 }));
  let totalExp = 0, totalCred = 0;
  for (const e of S.ledger) {
    const amt = num(e.amount);
    if (e.type === 'settle') { if (b[e.from]) b[e.from].sOut += amt; if (b[e.to]) b[e.to].sIn += amt; continue; }
    if (!b[e.partner]) continue;
    const sh = shareMap(e);
    if (e.type === 'expense') { totalExp += amt; b[e.partner].paid += amt; for (const id in sh) b[id].owedExp += amt * sh[id]; }
    else if (e.type === 'credit') { totalCred += amt; b[e.partner].received += amt; for (const id in sh) b[id].owedCred += amt * sh[id]; }
  }
  // net > 0 : partner is owed money by the others; net < 0 : partner owes money
  for (const id in b) { const x = b[id]; x.net = x.paid - x.owedExp - (x.received - x.owedCred) + x.sOut - x.sIn; }
  return { b, totalExp, totalCred };
}
/** Fewest payments that settle everyone */
export function settlements(b) {
  const cr = [], db = [];
  for (const id in b) { const n = Math.round(b[id].net); if (n > 0) cr.push({ id, n }); else if (n < 0) db.push({ id, n: -n }); }
  cr.sort((x, y) => y.n - x.n); db.sort((x, y) => y.n - x.n);
  const out = []; let i = 0, j = 0;
  while (i < db.length && j < cr.length) {
    const a = Math.min(db[i].n, cr[j].n);
    out.push({ from: db[i].id, to: cr[j].id, amount: a });
    db[i].n -= a; cr[j].n -= a;
    if (!db[i].n) i++; if (!cr[j].n) j++;
  }
  return out;
}

// ── employees ──
export function empBalance(id) {
  let given = 0, back = 0;
  for (const a of S.advances) if (a.empId === id) { if (a.kind === 'recover') back += num(a.amount); else given += num(a.amount); }
  return { given, back, bal: given - back };
}
