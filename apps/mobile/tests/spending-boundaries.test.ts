import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, emptyLedger, localDateKey } from '../src/domain.ts';
import { planSpending, spendingTotals, replaceMeal } from '../src/spending.ts';

const now = '2026-10-13T04:00:00.000Z';
const meal = { id: 'rice', name: 'Cơm', price: '12000', portion: '1 bữa', mode: 'out' as const, address: '', priceSource: 'Giá kiểm thử', pricedAt: '2026-10-13', estimated: false, allergens: [] };
const pho = { ...meal, id: 'pho', name: 'Phở', price: '30000' };
const prefs = { likedIds: [], excludedIds: [], excludedAllergens: [], frequency: [] };
const config = { id: 'p', name: 'Kế hoạch', startDay: '2026-10-13', endDay: '2026-10-13', timezone: 'Asia/Ho_Chi_Minh', budget: '300000', reserve: '10000', walletIds: ['cash'], categoryIds: ['expense-food'], mealsPerDay: 1, allowCooking: true, fixed: [] };
function fixture() {
  let s = emptyLedger();
  for (const id of ['cash', 'bank']) s = applyCommand(s, { type: 'wallet.create', mutationId: id, payload: { id, name: id, icon: 'wallet', openingBalance: '1000000', openingAt: '2026-01-01T00:00:00.000Z', archived: false } }, { now });
  for (const m of [meal, pho]) s = applyCommand(s, { type: 'spending.meal.upsert', mutationId: m.id, payload: { meal: m } }, { now });
  return s;
}
test('expense scope excludes other wallets/categories, income, transfers and adjustments', () => {
  let s = fixture();
  for (const [id, walletId, categoryId, kind, amount, occurredAt] of [
    ['included', 'cash', 'expense-food', 'expense', '10000', now], ['wallet', 'bank', 'expense-food', 'expense', '50000', now], ['category', 'cash', 'expense-other', 'expense', '50000', now], ['income', 'cash', 'income-other', 'income', '50000', now], ['before', 'cash', 'expense-food', 'expense', '50000', '2026-10-12T16:59:59.999Z'],
  ] as const) s = applyCommand(s, { type: 'transaction.create', mutationId: `tx-${id}`, payload: { id, walletId, categoryId, kind, amount, occurredAt, note: '', tagIds: [] } }, { now });
  s = applyCommand(s, { type: 'transfer.create', mutationId: 'transfer', payload: { id: 'transfer', fromWalletId: 'cash', toWalletId: 'bank', amount: '50000', occurredAt: now, note: '' } }, { now });
  s = applyCommand(s, { type: 'adjustment.create', mutationId: 'adjustment', payload: { id: 'adjustment', walletId: 'cash', amount: '50000', occurredAt: now, note: '' } }, { now });
  const p = planSpending(s, config, s.spending.catalog, prefs, now); const total = spendingTotals(s, p, now);
  assert.equal(total.spent, '10000'); assert.equal(total.remaining, '268000');
  p.meals[0].transactionId = 'included'; assert.equal(spendingTotals(s, p, now).planned, '0');
  p.config.fixed = [{ id: 'same', name: 'Trùng liên kết', amount: '10000', transactionId: 'included' }]; assert.throws(() => spendingTotals(s, p, now));
});
test('today completed unlinked reserves while past slots stay historical and immutable', () => {
  const s = fixture(); const p = planSpending(s, { ...config, startDay: '2026-10-12', endDay: '2026-10-14' }, s.spending.catalog, prefs, now);
  p.meals[1].meal = { ...meal }; p.meals[2].meal = { ...meal }; p.meals[1].completed = true; const past = JSON.stringify(p.meals[0]), completed = JSON.stringify(p.meals[1]);
  assert.equal(spendingTotals(s, p, now).planned, '24000');
  const next = planSpending(s, p.config, s.spending.catalog, prefs, now, p);
  assert.equal(JSON.stringify(next.meals[0]), past); assert.equal(JSON.stringify(next.meals[1]), completed);
  assert.throws(() => replaceMeal(s, p, '2026-10-13', 0, 'pho', s.spending.catalog, prefs, now));
});
test('partial weekly minimum scales without converting soft likes into a frequency', () => {
  const s = fixture(); const p = planSpending(s, { ...config, endDay: '2026-10-20', budget: '600000' }, s.spending.catalog, { ...prefs, frequency: [{ mealId: 'pho', min: 3, max: 7 }] }, now);
  assert.equal(p.meals.length, 8); assert.ok(p.meals.slice(0, 7).filter(x => x.meal.id === 'pho').length >= 3); assert.equal(p.meals[7].meal.id, 'pho');
  assert.equal(localDateKey(now, config.timezone), '2026-10-13');
});
test('new exclusions reject even an unchanged editable meal during save', () => {
  let s = fixture(); const p = planSpending(s, config, s.spending.catalog, prefs, now);
  s = applyCommand(s, { type: 'spending.plan.upsert', mutationId: 'save', payload: { plan: p, expectedVersion: null } }, { now });
  const changed = { ...s.spending.plans[0], preferences: { ...prefs, excludedIds: [p.meals[0].meal.id] } };
  assert.throws(() => applyCommand(s, { type: 'spending.plan.upsert', mutationId: 'exclude', payload: { plan: changed, expectedVersion: 1 } }, { now }));
});

test('plan save rejects forged prices and protected changes while menu defaults preserve snapshots', () => {
  let s = fixture(); const p = planSpending(s, config, s.spending.catalog, prefs, now);
  p.meals[0].locked = true;
  s = applyCommand(s, { type: 'spending.plan.upsert', mutationId: 'save', payload: { plan: p, expectedVersion: null } }, { now });
  const original = JSON.stringify(s.spending.plans[0]);
  const altered = JSON.parse(original); altered.meals[0].meal.price = '1';
  assert.throws(() => applyCommand(s, { type: 'spending.plan.upsert', mutationId: 'forge', payload: { plan: altered, expectedVersion: 1 } }, { now }));
  const remove = JSON.parse(original); remove.meals = [];
  assert.throws(() => applyCommand(s, { type: 'spending.plan.upsert', mutationId: 'remove', payload: { plan: remove, expectedVersion: 1 } }, { now }));
  s = applyCommand(s, { type: 'spending.meal.upsert', mutationId: 'price', payload: { meal: { ...meal, price: '40000' } } }, { now });
  s = applyCommand(s, { type: 'spending.preferences.set', mutationId: 'defaults', payload: { preferences: { ...prefs, likedIds: ['pho'] } } }, { now });
  assert.equal(JSON.stringify(s.spending.plans[0]), original);
  const fresh = planSpending(s, { ...config, id: 'fresh' }, s.spending.catalog, prefs, now); fresh.meals[0].meal.price = '1';
  assert.throws(() => applyCommand(s, { type: 'spending.plan.upsert', mutationId: 'fake-new', payload: { plan: fresh, expectedVersion: null } }, { now }));
});
