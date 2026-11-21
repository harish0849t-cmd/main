// ops.js — every write that changes stock or feed totals goes through here, so the
// running counters (item.stock, item.qtyIn/valueIn, cycle.feedQty/feedCost) never drift.
import { S, set, del, newId, inc } from './db.js';
import * as C from './calc.js';
import { num, today } from './util.js';

/** Record a stock movement (type 'in' | 'out') and update the item's running totals. */
export function addTxn(t) {
  const id = newId(), qty = num(t.qty);
  set('txns', id, { ...t, qty, ts: t.ts || Date.now() });
  const patch = { stock: inc(t.type === 'in' ? qty : -qty) };
  if (t.type === 'in' && num(t.rate) > 0) { patch.qtyIn = inc(qty); patch.valueIn = inc(qty * num(t.rate)); }
  if (C.itemById(t.itemId)) set('items', t.itemId, patch);
  return id;
}

/** Delete a stock movement and reverse its effect on the item. */
export function removeTxn(t) {
  del('txns', t.id);
  if (!C.itemById(t.itemId)) return;
  const qty = num(t.qty), patch = { stock: inc(t.type === 'in' ? -qty : qty) };
  if (t.type === 'in' && num(t.rate) > 0) { patch.qtyIn = inc(-qty); patch.valueIn = inc(-qty * num(t.rate)); }
  set('items', t.itemId, patch);
}

/** Log a feeding: the log itself, the stock-out, and the cycle's feed totals. */
export function addFeeding(p) {
  const qty = num(p.qty), ts = p.ts || Date.now(), date = p.date || today();
  const round = p.round || S.feedlogs.filter((l) => l.tankId === p.tankId && l.date === date).length + 1;
  const trays = p.trays || [null, null, null, null];
  const cycle = C.activeCycle(p.tankId);
  const cost = Math.round(qty * C.avgRate(p.itemId) * 100) / 100;
  const id = newId();
  set('feedlogs', id, { tankId: p.tankId, itemId: p.itemId, qty, cost, cycleId: cycle ? cycle.id : '', date, ts, round, trays, avg: C.traysAvg(trays), note: p.note || '', by: p.by || '' });
  addTxn({ type: 'out', itemId: p.itemId, qty, tankId: p.tankId, reason: 'Feeding', date, ts, by: p.by || '', feedLogId: id });
  if (cycle) set('cycles', cycle.id, { feedQty: inc(qty), feedCost: inc(cost) });
  return id;
}

/** Delete a feeding log: stock goes back, cycle totals go down. */
export function removeFeeding(log) {
  S.txns.filter((t) => t.feedLogId === log.id).forEach(removeTxn);
  if (log.cycleId && S.cycles.some((c) => c.id === log.cycleId)) set('cycles', log.cycleId, { feedQty: inc(-num(log.qty)), feedCost: inc(-num(log.cost)) });
  del('feedlogs', log.id);
}
