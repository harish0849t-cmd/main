// views-farm.js — Tanks, Inventory, Feeding (check trays) and Calendar screens
import { S, add, set, del, newId } from './db.js';
import {
  esc, num, fmt, money, today, parseYmd, ymd, showDate, showTime, nowTime, daysBetween, MONTHS, toast, ring,
  openSheet, closeSheet, sheetHead,
} from './util.js';
import * as C from './calc.js';
import * as O from './ops.js';
import { ui, hooks, isManager, isPartner, who } from './ctx.js';
import { panchang } from './panchang.js';

const options = (list, sel) => list.map(([v, l]) => `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(l)}</option>`).join('');
const rerender = () => hooks.render();

// ══════════════════════ TANKS ══════════════════════
export function tanksView() {
  const tanks = C.sortedTanks();
  const active = tanks.filter((t) => C.activeCycle(t.id));
  const docs = active.map((t) => C.docOf(C.activeCycle(t.id)));
  const avgDoc = docs.length ? Math.round(docs.reduce((a, b) => a + b, 0) / docs.length) : 0;
  const feedStock = S.items.filter((i) => i.cat === 'feed' && i.unit === 'kg').reduce((a, i) => a + Math.max(0, C.stockOf(i.id)), 0);
  const todayFeed = C.logsOn(today()).reduce((a, l) => a + num(l.qty), 0);
  const t0 = new Date(), loc = C.location(), pc = panchang(t0.getFullYear(), t0.getMonth() + 1, t0.getDate(), loc);
  const nm = panchNames();

  let html = `<div class="card light">
    <div class="row between"><h2>Current Cycle ${active.length ? `(Avg DOC ${avgDoc})` : ''}</h2></div>
    <div class="stats">
      <div class="stat"><b>${tanks.length}</b><span>Total Tanks</span></div>
      <div class="stat"><b>${active.length}</b><span>Active Culture</span></div>
      <div class="stat"><b>${fmt(feedStock, 0)}kg</b><span>Feed Stock</span></div>
      <div class="stat"><b>${fmt(todayFeed, 0)}kg</b><span>Today's Feeding</span></div>
    </div>
    <button class="btn block" data-act="goFeed">＋ Log New Feeding</button>
  </div>`;

  const low = S.items.filter(C.isLow);
  if (low.length) html += `<div class="card" style="border-color:rgba(224,100,92,.6)"><div class="row"><span style="font-size:22px">⚠️</span><div class="grow"><div class="b">Low stock</div><div class="small muted">${low.map((i) => esc(C.itemLabel(i))).join(', ')}</div></div><button class="btn small ghost" data-act="goInv">View</button></div></div>`;

  if (!tanks.length) {
    html += `<div class="card empty-state"><div class="big">🦐</div><h2>Add your tanks</h2><p class="muted mb">Create all your tanks in one go, or add them one by one.</p>
      ${isManager() ? `<button class="btn block" data-act="quickTanks">Quick setup (add several tanks)</button><button class="btn block ghost mt-s" data-act="addTank">Add a single tank</button>` : `<p class="muted">Ask a partner or manager to add the tanks.</p>`}</div>`;
  }
  html += tanks.map((t) => {
    const c = C.activeCycle(t.id), avg = C.tankTodayAvg(t.id);
    if (!c) return `<button class="tank empty" data-act="tank" data-id="${t.id}"><div class="row"><div class="tank-ic">🛢️</div><div class="grow"><div class="t1">${esc(t.name)}</div><div class="small" style="opacity:.85">Empty — ready to stock</div></div><span class="pill">${C.cyclesOf(t.id).length} past</span></div></button>`;
    const d = C.density(c, t);
    return `<button class="tank" data-act="tank" data-id="${t.id}"><div class="row"><div class="tank-ic">🦐</div><div class="grow"><div class="t1">${esc(t.name)}: Culturing (DOC ${C.docOf(c)}${avg != null ? `, ${avg}%` : ''})</div>
      <div class="small" style="opacity:.9">${d != null ? fmt(d, 1) + ' /m² · ' : ''}${fmt(c.seeds, 0)} seed${c.source ? ' · ' + esc(c.source) : ''}</div></div><span style="font-size:20px">›</span></div>
      <div class="bar"><i style="width:${avg ?? 0}%"></i></div></button>`;
  }).join('');

  html += `<div class="sec-title">Panchangam today</div><div class="card light" data-act="goCal" style="cursor:pointer">
    <div class="row between"><div><div class="b">${esc(nm(pc.tithiEn, pc.tithiTe))}</div><div class="small muted">${pc.paksha} Paksha · ${esc(nm(pc.monthEn, pc.monthTe))}${pc.adhika ? ' (Adhika)' : ''}</div></div><div style="font-size:30px">${pc.isPournami ? '🌕' : pc.isAmavasya ? '🌑' : pc.paksha === 'Shukla' ? '🌙' : '🌘'}</div></div>
    ${pc.tide === 'spring' ? '<div class="advice">Spring tide period — good for water exchange.</div>' : ''}</div>`;
  if (isManager() && tanks.length) html += `<button class="fab" data-act="addTank" aria-label="Add tank">＋</button>`;
  return html;
}

export function panchNames() {
  const mode = C.settings().names;
  return (en, te) => (mode === 'en' ? en : mode === 'te' ? te : `${en} (${te})`);
}

function areaLabel(t) { return t.areaInput ? `${fmt(t.areaInput)} ${t.areaUnit}` : `${fmt(t.areaM2, 0)} m²`; }

export function tankFormSheet(id) {
  const t = id ? C.tankById(id) : null;
  openSheet(`${sheetHead(t ? 'Edit tank' : 'Add tank')}<form>
    <label class="f">Tank name<input class="in" name="name" required value="${esc(t?.name || 'Tank ' + (S.tanks.length + 1))}"></label>
    <div class="grid2"><label class="f">Area<input class="in" name="area" type="number" step="any" min="0" inputmode="decimal" required value="${t?.areaInput ?? ''}"></label>
    <label class="f">Unit<select class="in" name="unit">${options(Object.keys(C.AREA_UNITS).map((u) => [u, u]), t?.areaUnit || 'm²')}</select></label></div>
    <label class="f">Notes<input class="in" name="note" value="${esc(t?.note || '')}" placeholder="Optional (liner, aerators, depth…)"></label>
    <div class="row mt"><button class="btn grow" type="submit">Save</button>${t ? '<button class="btn red" type="button" data-do="del">Delete</button>' : ''}</div></form>`, {
    submit: (v) => {
      const a = num(v.area);
      set('tanks', t?.id || newId(), { name: v.name.trim(), areaInput: a, areaUnit: v.unit, areaM2: a * C.AREA_UNITS[v.unit], note: v.note });
      toast('Tank saved');
    },
    acts: {
      del: () => {
        if (C.cyclesOf(t.id).length && !confirm('This tank has culture history. Delete anyway? (History is kept in reports of past cycles only if you do not delete.)')) return;
        if (!C.cyclesOf(t.id).length && !confirm('Delete this tank?')) return;
        C.cyclesOf(t.id).forEach((c) => del('cycles', c.id)); del('tanks', t.id); closeSheet();
      },
    },
  });
}

export function quickTanksSheet() {
  openSheet(`${sheetHead('Quick setup', 'Create several tanks at once')}<form>
    <div class="grid2"><label class="f">How many tanks?<input class="in" name="n" type="number" min="1" max="60" value="7" required inputmode="numeric"></label>
    <label class="f">Name prefix<input class="in" name="prefix" value="Tank "></label></div>
    <div class="grid2"><label class="f">Area of each<input class="in" name="area" type="number" step="any" min="0" value="1" required inputmode="decimal"></label>
    <label class="f">Unit<select class="in" name="unit">${options(Object.keys(C.AREA_UNITS).map((u) => [u, u]), 'acre')}</select></label></div>
    <p class="muted small mt-s">You can edit each tank's area later.</p><button class="btn block mt" type="submit">Create tanks</button></form>`, {
    submit: (v) => {
      const n = Math.min(60, Math.max(1, Math.round(num(v.n)))), a = num(v.area), start = S.tanks.length;
      for (let i = 1; i <= n; i++) add('tanks', { name: `${v.prefix}${start + i}`, areaInput: a, areaUnit: v.unit, areaM2: a * C.AREA_UNITS[v.unit] });
      toast(`${n} tanks created`);
    },
  });
}

export function tankSheet(id) {
  const t = C.tankById(id); if (!t) return;
  const c = C.activeCycle(id), hist = C.cyclesOf(id).filter((x) => x.end);
  let body = `${sheetHead(t.name, 'Area: ' + areaLabel(t))}`;
  if (c) {
    const d = C.density(c, t), f = C.cycleFeed(c), avg = C.tankTodayAvg(id);
    body += `<dl class="kv mt"><dt>Status</dt><dd><span class="pill good">Culturing</span></dd><dt>DOC</dt><dd>${C.docOf(c)} days</dd>
      <dt>Stocked on</dt><dd>${showDate(c.start)}</dd><dt>Seed stocked</dt><dd>${fmt(c.seeds, 0)}${c.source ? ' · ' + esc(c.source) : ''}${c.batch ? ' · batch ' + esc(c.batch) : ''}</dd>
      <dt>Stocking density</dt><dd class="gold">${d != null ? fmt(d, 1) + ' per m²' : 'add tank area'}${d != null ? ` <span class="muted small">(${fmt(d * 4046.86, 0)} /acre)</span>` : ''}</dd>
      <dt>Feed so far</dt><dd>${fmt(f.qty, 1)} kg${f.cost ? ' · ' + money(f.cost) : ''}</dd>
      <dt>Today's tray</dt><dd>${avg != null ? avg + '% consumed' : 'not recorded'}</dd></dl>`;
    body += `<div class="row mt"><button class="btn grow" data-do="feed">Log feeding</button>${isManager() ? '<button class="btn red grow" data-do="end">End cycle (harvest)</button>' : ''}</div>`;
  } else {
    body += `<dl class="kv mt"><dt>Status</dt><dd><span class="pill">Empty</span></dd></dl>`;
    if (isManager()) body += `<button class="btn green block mt" data-do="start">Start new cycle (stock seed)</button>`;
  }
  if (hist.length) {
    body += `<div class="sec-title" style="color:#4d6f7c">Cycle history</div>` + hist.map((h) => {
      const f = C.cycleFeed(h), fcr = num(h.harvestKg) > 0 ? f.qty / num(h.harvestKg) : null;
      return `<div class="li"><div class="grow"><div class="b">${showDate(h.start)} → ${showDate(h.end)} <span class="muted small">(${daysBetween(h.start, h.end)} days)</span></div>
        <div class="small muted">${fmt(h.seeds, 0)} seed · Harvest ${h.harvestKg ? fmt(h.harvestKg) + ' kg' : '–'} · Feed ${fmt(f.qty, 0)} kg${fcr ? ' · FCR ' + fmt(fcr, 2) : ''}${f.cost ? ' · ' + money(f.cost) : ''}</div></div></div>`;
    }).join('');
  }
  if (isManager()) body += `<button class="btn ghost block mt" data-do="edit">Edit tank details</button>`;
  openSheet(body, {
    acts: {
      feed: () => { ui.feed.tankId = id; ui.tab = 'feeding'; closeSheet(); rerender(); },
      start: () => startCycleSheet(id),
      end: () => endCycleSheet(id),
      edit: () => tankFormSheet(id),
    },
  });
}

function startCycleSheet(tankId) {
  const t = C.tankById(tankId);
  openSheet(`${sheetHead('Start new cycle', t.name)}<form>
    <label class="f">Stocking date<input class="in" type="date" name="start" value="${today()}" required></label>
    <label class="f">Number of seed (PL) stocked<input class="in" name="seeds" type="number" min="1" inputmode="numeric" required placeholder="e.g. 1000000"></label>
    <div id="dens" class="advice">Stocking density: enter seed count</div>
    <div class="grid2"><label class="f">Hatchery / source<input class="in" name="source"></label><label class="f">Batch no.<input class="in" name="batch"></label></div>
    <button class="btn green block mt" type="submit">Start cycle</button></form>`, {
    mount: (el) => {
      const inp = el.querySelector('[name=seeds]');
      inp.addEventListener('input', () => { const a = num(t.areaM2); el.querySelector('#dens').textContent = a > 0 ? `Stocking density: ${fmt(num(inp.value) / a, 1)} per m²` : 'Add the tank area to see density'; });
    },
    submit: (v) => { add('cycles', { tankId, start: v.start, seeds: num(v.seeds), source: v.source, batch: v.batch }); toast('Cycle started'); },
  });
}
function endCycleSheet(tankId) {
  const c = C.activeCycle(tankId);
  openSheet(`${sheetHead('End cycle / harvest', C.tankById(tankId).name)}<form>
    <label class="f">Harvest date<input class="in" type="date" name="end" value="${today()}" required></label>
    <label class="f">Total harvest (kg)<input class="in" name="kg" type="number" step="any" inputmode="decimal" placeholder="Optional"></label>
    <label class="f">Average count / size (optional)<input class="in" name="count" placeholder="e.g. 40 count"></label>
    <p class="muted small mt-s">Record the sale money in Partners → Credit.</p>
    <button class="btn red block mt" type="submit">Close cycle</button></form>`, {
    submit: (v) => { set('cycles', c.id, { end: v.end, harvestKg: num(v.kg), count: v.count }); toast('Cycle closed'); },
  });
}

// ══════════════════════ INVENTORY ══════════════════════
export function inventoryView() {
  const cat = ui.invCat, items = S.items.filter((i) => i.cat === cat).sort((a, b) => itemSort(a, b));
  const low = items.filter(C.isLow).length;
  let html = `<div class="chips mb">${C.CATS.map(([k, l]) => `<button class="chip ${k === cat ? 'on' : ''}" data-act="invCat" data-id="${k}">${l}</button>`).join('')}</div>
  <div class="card"><div class="row between"><h2>${C.CATS.find((c) => c[0] === cat)[1]} stock</h2>${low ? `<span class="pill bad">⚠ ${low} low</span>` : ''}</div>`;
  html += items.length ? items.map((i) => {
    const q = C.stockOf(i.id), lowI = C.isLow(i);
    return `<div class="li"><button class="row" data-act="item" data-id="${i.id}"><span class="sq ${lowI ? 'low' : 'ok'}"></span><span class="grow">${esc(C.itemLabel(i))}${lowI ? ' <span class="tiny" style="color:#ffb3ad">Low stock</span>' : ''}</span><span class="amt">${fmt(q)} ${esc(i.unit)}</span></button></div>`;
  }).join('') : `<p class="muted" style="padding:10px 0">No items yet. Add your first ${cat === 'feed' ? 'feed size' : 'item'}.</p>`;
  html += `</div><div class="row"><button class="btn grow" data-act="stockIn">Stock In</button><button class="btn ghost grow" data-act="stockOut">Stock Out</button></div>
  <button class="btn ghost block mt-s" data-act="newItem">＋ New item</button>`;
  html += `<div class="sec-title">Consumption (last 14 days)</div><div class="card">${consumptionChart(items)}</div>`;
  const ids = new Set(items.map((i) => i.id)), recent = S.txns.filter((t) => ids.has(t.itemId)).sort((a, b) => b.ts - a.ts).slice(0, 8);
  if (recent.length) html += `<div class="sec-title">Recent movements</div><div class="card">${recent.map(txnRow).join('')}</div>`;
  return html;
}
const itemSort = (a, b) => String(a.size || a.name).localeCompare(String(b.size || b.name), undefined, { numeric: true });

function txnRow(t) {
  const it = C.itemById(t.itemId), tank = t.tankId ? C.tankById(t.tankId) : null;
  return `<div class="li"><span class="pill ${t.type === 'in' ? 'good' : 'warn'}">${t.type === 'in' ? 'IN' : 'OUT'}</span><div class="grow small"><div class="b">${esc(it ? C.itemLabel(it) : 'deleted item')}</div><div class="muted tiny">${showDate(t.date)}${tank ? ' · ' + esc(tank.name) : ''}${t.supplier ? ' · ' + esc(t.supplier) : ''}${t.reason && t.reason !== 'Feeding' ? ' · ' + esc(t.reason) : ''}</div></div><div class="amt">${t.type === 'in' ? '+' : '−'}${fmt(t.qty)} ${esc(it?.unit || '')}</div></div>`;
}

function consumptionChart(items) {
  const ids = new Set(items.map((i) => i.id)), days = [];
  for (let k = 13; k >= 0; k--) { const d = new Date(); d.setDate(d.getDate() - k); days.push(ymd(d)); }
  const vals = days.map((d) => S.txns.filter((t) => t.type === 'out' && t.date === d && ids.has(t.itemId)).reduce((a, t) => a + num(t.qty), 0));
  const max = Math.max(1, ...vals), W = 320, H = 110, px = 8, step = (W - px * 2) / 13;
  const pts = vals.map((v, i) => [px + i * step, H - 18 - (v / max) * (H - 34)]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  if (!vals.some((v) => v > 0)) return `<p class="muted small" style="padding:8px 0">No consumption recorded yet.</p>`;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Daily consumption">
    <defs><linearGradient id="cg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#f0cd7a" stop-opacity=".55"/><stop offset="1" stop-color="#f0cd7a" stop-opacity="0"/></linearGradient></defs>
    <path d="${line} L${pts[13][0]} ${H - 18} L${pts[0][0]} ${H - 18} Z" fill="url(#cg)"/><path d="${line}" fill="none" stroke="#f0cd7a" stroke-width="2.5" stroke-linejoin="round"/>
    ${pts.map((p, i) => (i % 3 === 0 || i === 13 ? `<text x="${p[0]}" y="${H - 4}" font-size="9" text-anchor="middle" fill="#a9cad6">${parseYmd(days[i]).getDate()}</text>` : '')).join('')}
    <text x="${W - 4}" y="10" font-size="10" text-anchor="end" fill="#a9cad6">peak ${fmt(max, 0)}/day</text></svg>`;
}

export function itemFormSheet(id) {
  const it = id ? C.itemById(id) : null;
  openSheet(`${sheetHead(it ? 'Edit item' : 'New item')}<form>
    <label class="f">Category<select class="in" name="cat">${options(C.CATS, it?.cat || ui.invCat)}</select></label>
    <label class="f">Name<input class="in" name="name" required value="${esc(it?.name || '')}" placeholder="e.g. CP Feed, Calcium, Probiotic"></label>
    <label class="f">Feed size (only for feeds)<input class="in" name="size" value="${esc(it?.size || '')}" placeholder="e.g. Size 3 / 1.2 mm"></label>
    <div class="grid2"><label class="f">Unit<select class="in" name="unit">${options(C.UNITS.map((u) => [u, u]), it?.unit || 'kg')}</select></label>
    <label class="f">Low-stock alert at<input class="in" name="min" type="number" step="any" inputmode="decimal" value="${it?.min ?? ''}" placeholder="e.g. 100"></label></div>
    <div class="row mt"><button class="btn grow" type="submit">Save</button>${it ? '<button class="btn red" type="button" data-do="del">Delete</button>' : ''}</div></form>`, {
    submit: (v) => { set('items', it?.id || newId(), { cat: v.cat, name: v.name.trim(), size: v.cat === 'feed' ? v.size.trim() : '', unit: v.unit, min: num(v.min) }); ui.invCat = v.cat; toast('Item saved'); },
    acts: { del: () => { if (confirm('Delete this item and its stock history?')) { S.txns.filter((t) => t.itemId === it.id).forEach((t) => del('txns', t.id)); del('items', it.id); closeSheet(); } } },
  });
}

export function itemSheet(id) {
  const it = C.itemById(id); if (!it) return;
  const tx = S.txns.filter((t) => t.itemId === id).sort((a, b) => b.ts - a.ts);
  openSheet(`${sheetHead(C.itemLabel(it), 'In stock: ' + fmt(C.stockOf(id)) + ' ' + it.unit + (C.avgRate(id) ? ' · avg rate ' + money(C.avgRate(id)) + '/' + it.unit : ''))}
    <div class="row mt"><button class="btn grow" data-do="in">Stock In</button><button class="btn ghost grow" data-do="out">Stock Out</button></div>
    <div class="sec-title" style="color:#4d6f7c">History (last 14 days)</div>${tx.slice(0, 25).map((t) => `<div class="row">${txnRow(t).replace('class="li"', 'class="li" style="flex:1"')}${isManager() ? `<button class="icon-btn" data-do="deltx" data-id="${t.id}" aria-label="Delete">🗑</button>` : ''}</div>`).join('') || '<p class="muted">No movements yet.</p>'}
    ${isManager() ? '<button class="btn ghost block mt" data-do="edit">Edit item</button>' : ''}`, {
    acts: {
      in: () => stockSheet('in', id), out: () => stockSheet('out', id), edit: () => itemFormSheet(id),
      deltx: (el) => {
        if (!confirm('Delete this movement? Stock will be corrected.')) return;
        const t = S.txns.find((x) => x.id === el.dataset.id); if (!t) return;
        const log = t.feedLogId && S.feedlogs.find((l) => l.id === t.feedLogId);
        if (log) O.removeFeeding(log); else O.removeTxn(t);
        S.ledger.filter((l) => l.refId === t.id).forEach((l) => del('ledger', l.id));
        setTimeout(() => itemSheet(id), 250);
      },
    },
  });
}

export function stockSheet(type, presetId) {
  if (!S.items.length) { toast('Add an item first'); return itemFormSheet(); }
  const sel = presetId || S.items.find((i) => i.cat === ui.invCat)?.id || S.items[0].id;
  const grouped = C.CATS.map(([k, l]) => { const its = S.items.filter((i) => i.cat === k); return its.length ? `<optgroup label="${l}">${its.map((i) => `<option value="${i.id}" ${i.id === sel ? 'selected' : ''}>${esc(C.itemLabel(i))} — ${fmt(C.stockOf(i.id))} ${esc(i.unit)}</option>`).join('')}</optgroup>` : ''; }).join('');
  const partners = isPartner() ? `<label class="f">Paid by (adds to partner expenses)<select class="in" name="paidBy"><option value="">Not recorded</option>${S.partners.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label>` : '';
  const isIn = type === 'in';
  openSheet(`${sheetHead(isIn ? 'Stock In' : 'Stock Out')}<form>
    <label class="f">Item<select class="in" name="itemId">${grouped}</select></label>
    <div class="grid2"><label class="f">Quantity<input class="in" name="qty" type="number" step="any" min="0" required inputmode="decimal"></label>
    <label class="f">Date<input class="in" type="date" name="date" value="${today()}" required></label></div>
    ${isIn ? `<div class="grid2"><label class="f">Rate (₹ per unit)<input class="in" name="rate" type="number" step="any" inputmode="decimal"></label><label class="f">Supplier<input class="in" name="supplier"></label></div><div id="tot" class="muted small mt-s"></div>${partners}`
      : `<label class="f">Used for tank<select class="in" name="tankId"><option value="">— not tank specific —</option>${C.sortedTanks().map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></label>
         <label class="f">Reason<select class="in" name="reason">${options(['Used in tank', 'Wastage / damaged', 'Sold', 'Returned', 'Other'].map((x) => [x, x]), 'Used in tank')}</select></label>`}
    <label class="f">Note<input class="in" name="note" placeholder="Bill no., remarks…"></label>
    <button class="btn ${isIn ? 'green' : ''} block mt" type="submit">${isIn ? 'Add to stock' : 'Remove from stock'}</button></form>`, {
    mount: (el) => {
      if (!isIn) return;
      const q = el.querySelector('[name=qty]'), r = el.querySelector('[name=rate]'), tot = el.querySelector('#tot');
      const f = () => (tot.textContent = num(q.value) && num(r.value) ? `Bill value: ${money(num(q.value) * num(r.value))}` : '');
      q.addEventListener('input', f); r.addEventListener('input', f);
    },
    submit: (v) => {
      const qty = num(v.qty), it = C.itemById(v.itemId);
      if (qty <= 0) { toast('Enter a quantity'); return false; }
      if (!isIn && qty > C.stockOf(v.itemId) && !confirm(`Only ${fmt(C.stockOf(v.itemId))} ${it.unit} in stock. Remove ${fmt(qty)} anyway?`)) return false;
      const id = O.addTxn({ type, itemId: v.itemId, qty, rate: num(v.rate), supplier: v.supplier || '', tankId: v.tankId || '', reason: v.reason || '', note: v.note || '', date: v.date, by: who() });
      if (isIn && v.paidBy && num(v.rate) > 0) add('ledger', { type: 'expense', amount: qty * num(v.rate), date: v.date, category: 'Inventory purchase', note: `${C.itemLabel(it)} ${fmt(qty)} ${it.unit}`, partner: v.paidBy, sharedBy: [], refId: id });
      toast(isIn ? 'Stock added' : 'Stock removed');
    },
  });
}

// ══════════════════════ FEEDING + CHECK TRAYS ══════════════════════
const adviceFor = (avg) => avg == null ? '' : avg >= 95 ? 'Trays are clean — consider increasing the next feed by 5–10%.' : avg >= 80 ? 'Good consumption — keep the next feed the same.' : avg >= 50 ? 'Some feed left — reduce the next feed by 5–10%.' : 'A lot of feed left — cut the next feed by 15–20% and check water quality and shrimp health.';

function trayRows(vals, idPrefix) {
  return [0, 1, 2, 3].map((i) => `<div class="tray"><span class="lab">Tray ${i + 1}</span><input type="range" min="0" max="100" step="5" value="${vals[i] ?? 100}" data-tray="${i}" data-pre="${idPrefix}" aria-label="Tray ${i + 1} consumed percent"><span id="${idPrefix}v${i}">${ring(vals[i], 48)}</span></div>`).join('');
}

export function feedingView() {
  const f = ui.feed, tanks = C.sortedTanks().filter((t) => C.activeCycle(t.id)), feeds = S.items.filter((i) => i.cat === 'feed').sort(itemSort);
  if (!f.tankId || !tanks.find((t) => t.id === f.tankId)) f.tankId = tanks[0]?.id || '';
  if (!f.itemId || !feeds.find((i) => i.id === f.itemId)) f.itemId = (feeds.find((i) => C.stockOf(i.id) > 0) || feeds[0])?.id || '';
  if (!tanks.length || !feeds.length) return `<div class="card empty-state"><div class="big">🍤</div><h2>Almost ready</h2><p class="muted">${!tanks.length ? 'Start a culture cycle in a tank first (Tanks tab).' : 'Add your feed sizes in Inventory first.'}</p></div>`;
  const avg = C.traysAvg(f.trays), round = S.feedlogs.filter((l) => l.tankId === f.tankId && l.date === today()).length + 1;
  const it = C.itemById(f.itemId);
  let html = `<div class="card light"><h2>${esc(C.tankById(f.tankId)?.name || '')} <span class="muted small" style="font-weight:500">· ${showTime(Date.now())} · Feed #${round}</span></h2>
    <label class="f">Tank<select class="in" data-bind="tankId">${options(tanks.map((t) => [t.id, `${t.name} (DOC ${C.docOf(C.activeCycle(t.id))})`]), f.tankId)}</select></label>
    <label class="f">Feed type<select class="in" data-bind="itemId">${options(feeds.map((i) => [i.id, `${C.itemLabel(i)} — ${fmt(C.stockOf(i.id))} ${i.unit} left`]), f.itemId)}</select></label>
    <label class="f">Quantity given (${esc(it?.unit || 'kg')})<input class="in" type="number" step="any" min="0" inputmode="decimal" data-bind="qty" value="${esc(f.qty)}" placeholder="e.g. 25"></label>
    <h3 class="mt">Check tray records (4 trays) <span class="muted small" style="font-weight:500">— % of feed consumed</span></h3>
    <div class="chips mb"><button class="chip" data-act="trayAll" data-id="100" style="color:#10303d;background:#e8f1f4">All 100%</button><button class="chip" data-act="trayAll" data-id="75" style="color:#10303d;background:#e8f1f4">All 75%</button><button class="chip" data-act="trayAll" data-id="50" style="color:#10303d;background:#e8f1f4">All 50%</button><button class="chip" data-act="trayAll" data-id="clear" style="color:#10303d;background:#e8f1f4">Clear</button></div>
    ${trayRows(f.trays, 'f')}
    <div class="row between" style="border-top:1px solid var(--light-line);padding-top:8px;margin-top:6px"><b>Average consumption</b><b id="favg" style="font-size:18px">${avg != null ? avg + '%' : '–'}</b></div>
    <div id="fadv">${avg != null ? `<div class="advice">${adviceFor(avg)}</div>` : '<p class="muted small mt-s">Trays are checked 1–2 hours after feeding. Leave them blank now and record them later from the list below.</p>'}</div>
    <label class="f">Note<input class="in" data-bind="note" value="${esc(f.note)}" placeholder="Optional"></label>
    <button class="btn block mt" data-act="submitFeed">Submit Feeding Log</button></div>`;

  // recorded logs for the chosen day
  const d = ui.feedDate, logs = C.logsOn(d).sort((a, b) => b.ts - a.ts);
  html += `<div class="row between mt"><div class="sec-title" style="margin:0">Recorded feedings</div><div class="row"><button class="icon-btn" data-act="feedDay" data-id="-1" aria-label="Previous day">‹</button><span class="small b" style="min-width:84px;text-align:center">${d === today() ? 'Today' : showDate(d)}</span><button class="icon-btn" data-act="feedDay" data-id="1" aria-label="Next day">›</button></div></div><div class="mt-s"></div>`;
  html += logs.length ? logs.map((l) => {
    const t = C.tankById(l.tankId), i = C.itemById(l.itemId), has = (l.trays || []).some((x) => x != null);
    return `<div class="card light" style="padding:12px"><div class="row between"><div><div class="b">${esc(t?.name || 'Tank')} · Feed #${l.round || ''}</div><div class="small muted">${showTime(l.ts)} · ${i ? esc(C.itemLabel(i)) : ''} · <b>${fmt(l.qty)} ${esc(i?.unit || 'kg')}</b></div></div>
      <div style="text-align:right">${has ? ring(l.avg, 52) : '<span class="pill warn">tray pending</span>'}</div></div>
      ${has ? `<div class="rings mt-s">${l.trays.map((p, k) => `<div>${ring(p, 46)}<small>Tray ${k + 1}</small></div>`).join('')}</div><div class="advice">${adviceFor(l.avg)}</div>` : ''}
      ${l.note ? `<div class="small muted mt-s">📝 ${esc(l.note)}</div>` : ''}
      <div class="row mt-s"><button class="btn small ghost grow" data-act="trays" data-id="${l.id}">${has ? 'Edit' : 'Record'} trays</button>${isManager() ? `<button class="btn small ghost" data-act="delLog" data-id="${l.id}" aria-label="Delete log">🗑</button>` : ''}</div></div>`;
  }).join('') : `<div class="card"><p class="muted small">No feedings recorded for this day.</p></div>`;
  return html;
}

export function bindFeedInputs(root) {
  // select / text inputs → state. Tray sliders update the screen without a full redraw.
  root.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.tray != null) {
      const i = +el.dataset.tray, pre = el.dataset.pre, v = +el.value;
      if (pre === 'f') {
        ui.feed.trays[i] = v; document.getElementById('fv' + i).innerHTML = ring(v, 48);
        const a = C.traysAvg(ui.feed.trays); document.getElementById('favg').textContent = a != null ? a + '%' : '–';
        document.getElementById('fadv').innerHTML = a != null ? `<div class="advice">${adviceFor(a)}</div>` : '';
      }
    } else if (el.dataset.bind) {
      ui.feed[el.dataset.bind] = el.value;
      if (el.tagName === 'SELECT') rerender();
    }
  });
}

export function submitFeed() {
  const f = ui.feed, qty = num(f.qty);
  if (!f.tankId || !f.itemId) return toast('Choose tank and feed');
  if (qty <= 0) return toast('Enter the quantity of feed given');
  const it = C.itemById(f.itemId);
  if (qty > C.stockOf(f.itemId) && !confirm(`Stock shows only ${fmt(C.stockOf(f.itemId))} ${it.unit}. Log anyway?`)) return;
  const date = today();
  O.addFeeding({ tankId: f.tankId, itemId: f.itemId, qty, date, trays: f.trays.map((x) => (x == null ? null : x)), note: f.note, by: who() });
  ui.feed.qty = ''; ui.feed.note = ''; ui.feed.trays = [null, null, null, null]; ui.feedDate = date;
  toast('Feeding logged · stock updated'); rerender();
}

export function traysSheet(logId) {
  const l = S.feedlogs.find((x) => x.id === logId); if (!l) return;
  const vals = [...(l.trays || [null, null, null, null])];
  openSheet(`${sheetHead('Check tray records', `${C.tankById(l.tankId)?.name || ''} · Feed #${l.round || ''} · ${showTime(l.ts)}`)}
    <p class="muted small mt-s">Move each slider to the % of feed the shrimp consumed in that tray.</p>
    <div class="chips mb mt-s">${[100, 75, 50].map((n) => `<button class="chip" data-do="all" data-n="${n}" style="color:#10303d;background:#e8f1f4">All ${n}%</button>`).join('')}</div>
    ${trayRows(vals, 's')}
    <div class="row between"><b>Average consumption</b><b id="savg" style="font-size:18px">–</b></div><div id="sadv"></div>
    <button class="btn block mt" data-do="save">Save tray check</button>`, {
    mount: (el) => {
      const upd = () => { const a = C.traysAvg(vals); el.querySelector('#savg').textContent = a != null ? a + '%' : '–'; el.querySelector('#sadv').innerHTML = a != null ? `<div class="advice">${adviceFor(a)}</div>` : ''; };
      el.addEventListener('input', (e) => { const r = e.target; if (r.dataset.tray != null) { const i = +r.dataset.tray; vals[i] = +r.value; el.querySelector('#sv' + i).innerHTML = ring(vals[i], 48); upd(); } });
      el.addEventListener('click', (e) => { const b = e.target.closest('[data-do=all]'); if (!b) return; for (let i = 0; i < 4; i++) { vals[i] = +b.dataset.n; el.querySelector(`[data-tray="${i}"]`).value = vals[i]; el.querySelector('#sv' + i).innerHTML = ring(vals[i], 48); } upd(); });
      upd();
    },
    acts: { save: () => { if (vals.every((v) => v == null)) return toast('Move at least one slider'); set('feedlogs', l.id, { trays: vals, avg: C.traysAvg(vals) }); closeSheet(); toast('Tray check saved'); } },
  });
}

// ══════════════════════ CALENDAR ══════════════════════
export function calendarView() {
  const { y, m } = ui.cal, loc = C.location(), nm = panchNames();
  const first = new Date(y, m, 1), dim = new Date(y, m + 1, 0).getDate(), lead = first.getDay(), tdy = today();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);
  let html = `<div class="card light"><div class="cal-head"><button class="icon-btn" data-act="calNav" data-id="-1" aria-label="Previous month">‹</button><div class="b" style="font-size:17px">${MONTHS[m]} ${y}</div><button class="icon-btn" data-act="calNav" data-id="1" aria-label="Next month">›</button></div>
  <div class="cal-grid">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => `<div class="dow">${d}</div>`).join('')}
  ${cells.map((d) => {
    if (!d) return '<div></div>';
    const key = ymd(new Date(y, m, d)), p = panchang(y, m + 1, d, loc);
    const cls = ['day', key === tdy ? 'today' : '', key === ui.cal.sel ? 'sel' : '', p.isPournami ? 'pour' : '', p.isAmavasya ? 'amav' : ''].join(' ');
    const mk = p.isPournami ? '🌕' : p.isAmavasya ? '🌑' : p.isEkadasi ? '✦' : '';
    return `<button class="${cls}" data-act="calDay" data-id="${key}" ${p.tide === 'spring' ? 'style="box-shadow:inset 0 -3px 0 #2c83b5"' : ''} aria-label="${d} ${MONTHS[m]}, ${p.tithiEn}">${d}<span class="mk">${mk}</span></button>`;
  }).join('')}</div>
  <div class="legend"><span>🌕 Pournami</span><span>🌑 Amavasya</span><span>✦ Ekadasi</span><span style="border-bottom:3px solid #2c83b5">Spring tide</span></div></div>`;

  const sel = parseYmd(ui.cal.sel), p = panchang(sel.getFullYear(), sel.getMonth() + 1, sel.getDate(), loc);
  const docs = C.sortedTanks().map((t) => { const c = C.activeCycle(t.id); return c && ui.cal.sel >= c.start ? { t, doc: daysBetween(c.start, ui.cal.sel) } : null; }).filter(Boolean);
  html += `<div class="card light"><div class="row between"><h2>${sel.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h2></div>
  ${docs.length ? `<div class="row wrap mb">${docs.map((x) => `<span class="pill good">${esc(x.t.name)} · DOC ${x.doc}</span>`).join('')}</div>` : ''}
  <dl class="kv"><dt>Tithi</dt><dd class="te">${esc(nm(p.tithiEn, p.tithiTe))}<div class="muted small" style="font-weight:500">until ${p.tithiEndLabel}</div></dd>
  <dt>Paksha</dt><dd class="te">${p.paksha} (${p.pakshaTe})</dd>
  <dt>Telugu month</dt><dd class="te">${esc(nm(p.monthEn, p.monthTe))}${p.adhika ? ' — Adhika' : ''}</dd>
  <dt>Nakshatra</dt><dd class="te">${esc(nm(p.nakEn, p.nakTe))}</dd><dt>Sunrise</dt><dd>${p.sunriseLabel} · ${esc(loc.name)}</dd></dl>
  ${p.tide === 'spring' ? '<div class="advice"><b>Spring tide period</b> — highest tides; recommended for water exchange.</div>' : p.tide === 'neap' ? '<div class="advice" style="border-color:#8aa"><b>Neap tide period</b> — small tidal range; plan water exchange carefully.</div>' : ''}
  <p class="muted tiny mt-s">Calculated on the phone (works offline) for sunrise at ${esc(loc.name)}. For festivals and rituals, also check your printed panchangam.</p></div>`;
  return html;
}
