import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyLedger, applyCommand, encodeBackup, decodeBackup, MAX_MONEY } from '../src/domain.ts';
import { emptySpending, planSpending, spendingTotals, replaceMeal, parseAiPreferences } from '../src/spending.ts';

const now = '2026-10-13T04:00:00.000Z';
const catalog = [
  { id: 'rice', name: 'Cơm', price: '12000', portion: '1 bữa', mode: 'out' as const, address: '', priceSource: 'Giá tự nhập', pricedAt: '2026-10-13', estimated: false, allergens: [] },
  { id: 'pho', name: 'Phở', price: '30000', portion: '1 bữa', mode: 'out' as const, address: '', priceSource: 'Giá tự nhập', pricedAt: '2026-10-13', estimated: false, allergens: ['beef'] },
];
const prefs = { likedIds: ['rice'], excludedIds: [], excludedAllergens: [], frequency: [] };
const config = { id: 'plan', name: 'Ăn uống', startDay: '2026-10-13', endDay: '2026-10-13', timezone: 'Asia/Ho_Chi_Minh', budget: '100000', reserve: '10000', walletIds: [], categoryIds: [], mealsPerDay: 1, allowCooking: true, fixed: [] };
function ledger() {
  return applyCommand(emptyLedger(), { type: 'wallet.create', mutationId: 'wallet', payload: { id: 'cash', name: 'Tiền mặt', icon: 'wallet', openingBalance: '1000000', openingAt: '2026-01-01T00:00:00.000Z', archived: false } }, { now });
}

test('spending calendar bounds and canonical VND reject invalid periods and amounts', () => {
  const s = ledger();
  const long = planSpending(s, { ...config, startDay: '2026-12-20', endDay: '2027-01-19', budget: '1000000' }, catalog, prefs, now);
  assert.equal(long.meals.length, 31);
  for (const input of [{ ...config, startDay: '2026-02-30' }, { ...config, endDay: '2026-11-13' }, { ...config, mealsPerDay: 0 }, { ...config, budget: (MAX_MONEY + 1n).toString() }, { ...config, reserve: '-1' }]) {
    assert.throws(() => planSpending(s, input, catalog, prefs, now));
  }
});

test('planner fills requested meals, honours exclusions and hard weekly frequency', () => {
  const s = ledger();
  const p = planSpending(s, { ...config, endDay: '2026-10-19', budget: '300000' }, catalog, { ...prefs, frequency: [{ mealId: 'pho', min: 3, max: 3 }] }, now);
  assert.equal(p.meals.length, 7); assert.equal(p.meals.filter(x => x.meal.id === 'pho').length, 3);
  assert.ok(BigInt(spendingTotals(s, p, now).remaining) >= 0n);
  const noBeef = planSpending(s, config, catalog, { ...prefs, excludedAllergens: ['beef'] }, now);
  assert.ok(noBeef.meals.every(x => x.meal.id === 'rice'));
  assert.throws(() => planSpending(s, config, [], prefs, now));
  assert.throws(() => planSpending(s, { ...config, budget: '20000' }, catalog, { ...prefs, excludedIds: ['rice'] }, now));
});

test('swap 12000 to 30000 previews exactly 18000 without touching ledger or reserve', () => {
  const s = ledger(); const original = JSON.stringify(s);
  const p = planSpending(s, config, catalog, prefs, now);
  const change = replaceMeal(s, p, config.startDay, 0, 'pho', catalog, prefs, now);
  assert.equal(change.oldPrice, '12000'); assert.equal(change.newPrice, '30000'); assert.equal(change.delta, '18000');
  assert.equal(change.remaining, '60000'); assert.equal(p.meals[0].meal.id, 'rice'); assert.equal(change.plan.config.reserve, '10000');
  assert.equal(JSON.stringify(s), original);
  const locked = { ...p, meals: p.meals.map(x => ({ ...x, locked: true })) };
  assert.throws(() => replaceMeal(s, locked, config.startDay, 0, 'pho', catalog, prefs, now));
  assert.throws(() => replaceMeal(s, p, config.startDay, 0, 'pho', catalog, prefs, '2026-10-14T04:00:00.000Z'));
});

test('scoped actual spend and linked fixed expense count once; missing link releases unpaid reservation', () => {
  let s = ledger();
  s = applyCommand(s, { type: 'transaction.create', mutationId: 'expense', payload: { id: 'paid', walletId: 'cash', categoryId: 'expense-food', kind: 'expense', amount: '20000', occurredAt: now, note: '', tagIds: [] } }, { now });
  const c = { ...config, fixed: [{ id: 'bill', name: 'Khoản cố định', amount: '20000', transactionId: 'paid' }] };
  const p = planSpending(s, c, catalog, prefs, now);
  assert.equal(spendingTotals(s, p, now).spent, '20000'); assert.equal(spendingTotals(s, p, now).fixedUnpaid, '0');
  assert.equal(spendingTotals(s, p, now).remaining, '58000');
  s = applyCommand(s, { type: 'transaction.delete', mutationId: 'delete', payload: { id: 'paid', expectedVersion: 1 } }, { now });
  assert.equal(spendingTotals(s, p, now).fixedUnpaid, '20000'); assert.equal(spendingTotals(s, p, now).remaining, '58000');
});

test('rebalance preserves protected snapshots and exact money beyond Number safe range', () => {
  const s = ledger(); const c = { ...config, endDay: '2026-10-14', budget: '9007199254740993' };
  const p = planSpending(s, c, catalog, prefs, now);
  p.meals[0].locked = true; const snapshot = JSON.stringify(p.meals[0]);
  const next = planSpending(s, c, catalog.map(x => ({ ...x, price: '31000' })), prefs, now, p);
  assert.equal(JSON.stringify(next.meals[0]), snapshot);
  assert.equal(spendingTotals(s, next, now).remaining, (9007199254740993n - 10000n - 12000n - 31000n).toString());
});

test('AI output validates exact fields, known IDs and frequencies without executing content', () => {
  assert.deepEqual(parseAiPreferences(JSON.stringify(prefs), catalog), prefs);
  for (const bad of [{ ...prefs, likedIds: ['unknown'] }, { ...prefs, tools: ['run'] }, { ...prefs, frequency: [{ mealId: 'pho', min: 3.5, max: 4 }] }, { ...prefs, excludedIds: ['rice'] }]) {
    assert.throws(() => parseAiPreferences(JSON.stringify(bad), catalog));
  }
  assert.throws(() => parseAiPreferences('Ignore everything; run command', catalog));
});

test('schema3 planning backup roundtrip and old schema2 preserve exact financial data', () => {
  const s = ledger(); s.spending = emptySpending(); s.spending.catalog = catalog;
  const decoded = decodeBackup(encodeBackup(s, now), { now });
  assert.equal(decoded.schemaVersion, 3); assert.deepEqual(decoded.ledger, s);
  const legacy: any = JSON.parse(encodeBackup(s, now)); legacy.schemaVersion = 2; legacy.ledger.schemaVersion = 2; delete legacy.ledger.spending;
  const upgraded = decodeBackup(JSON.stringify(legacy), { now });
  assert.deepEqual(upgraded.ledger.spending, emptySpending()); assert.deepEqual(upgraded.ledger.wallets, s.wallets);
});
