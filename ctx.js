// ctx.js — screen state + who-can-do-what, shared by all views
import { session } from './db.js';
import { today } from './util.js';

const d = new Date();
export const ui = {
  tab: 'tanks',
  invCat: 'feed',
  cal: { y: d.getFullYear(), m: d.getMonth(), sel: today() },
  feed: { tankId: '', itemId: '', qty: '', note: '', trays: [null, null, null, null] },
  feedDate: today(),
  partnerFilter: 'all',
  ledgerAll: false,
};
export const hooks = { render: () => {} };
export const role = () => (session.user && session.user.role) || 'employee';
export const isPartner = () => role() === 'partner';
export const isManager = () => role() === 'partner' || role() === 'manager';
export const TAB_ACCESS = {
  partner: ['tanks', 'inventory', 'feeding', 'calendar', 'employees', 'partners'],
  manager: ['tanks', 'inventory', 'feeding', 'calendar', 'employees'],
  employee: ['tanks', 'feeding', 'calendar'],
};
export const TAB_NAMES = { tanks: 'Tanks', inventory: 'Inventory', feeding: 'Feeding', calendar: 'Calendar', employees: 'Employees', partners: 'Partners' };
export const who = () => (session.user ? session.user.name : '');
