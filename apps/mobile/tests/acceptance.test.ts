import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as domain from '../src/domain.ts';
import { emptyLedger, applyCommand, balances, report, budgetStatus, money, parseMoneyInput, formatMoney, localDateKey, dateRange, encodeBackup, decodeBackup, timeline } from '../src/domain.ts';

const now = '2026-10-10T12:00:00.000Z';
const occurredAt = '2026-10-10T01:00:00.000Z';
const period = { start: '2026-09-30T17:00:00.000Z', endExclusive: '2026-10-31T17:00:00.000Z' };
function fixture() {
  let s = emptyLedger();
  const commands = [
    { type: 'wallet.create', id: 'cash', name: 'Tiền mặt', icon: 'wallet', openingBalance: '1000000', openingAt: '2026-09-30T17:00:00.000Z' },
    { type: 'wallet.create', id: 'bank', name: 'Ngân hàng', icon: 'card', openingBalance: '0', openingAt: '2026-09-30T17:00:00.000Z' },
    { type: 'category.create', id: 'food', name: 'Ăn uống', icon: 'restaurant', kind: 'expense' },
    { type: 'budget.create', id: 'food-budget', name: 'Ăn uống tháng 10', limit: '5500', ...period, walletIds: ['cash'], categoryIds: ['food'] },
  ];
  for (const c of commands) s = run(s, { ...c, mutationId: `init-${c.id}` });
  return s;
}
const expense = { type: 'transaction.create', id: 'e1', mutationId: 'create-e1', walletId: 'cash', categoryId: 'food', kind: 'expense', amount: '58000', occurredAt, note: 'Bữa sáng', tagIds: [] } as const;
const transfer = { type: 'transfer.create', id: 't1', mutationId: 'create-t1', fromWalletId: 'cash', toWalletId: 'bank', amount: '100000', occurredAt, note: '' } as const;
const run = (s: ReturnType<typeof emptyLedger>, c: any) => {
  const { type, mutationId, ...fields } = c;
  if (['wallet.create', 'category.create', 'tag.create'].includes(type)) fields.archived ??= false;
  return applyCommand(s, { type, mutationId, payload: fields } as any, { now });
};

test('Prompt acceptance 1–8: exact ledger, budgets, edits and deletes', () => {
  let s = run(run(fixture(), expense), transfer);
  assert.deepEqual(balances(s).byWallet, { cash: '842000', bank: '100000' });
  assert.equal(balances(s).total, '942000');
  const r = report(s, period);
  assert.equal(r.income, '0'); assert.equal(r.expense, '58000'); assert.equal(r.cashFlow, '-58000');
  const b = budgetStatus(s, 'food-budget');
  assert.equal(b.spent, '58000'); assert.equal(b.overspent, '52500'); assert.equal(b.remaining, '-52500');
  assert.match(b.percentage, /1054[.,]5/); assert.equal(b.progress, 1);
  s = run(s, { ...expense, type: 'transaction.update', mutationId: 'edit-e1', expectedVersion: 1, amount: '50000' });
  assert.equal(balances(s).byWallet.cash, '850000'); assert.equal(balances(s).total, '950000');
  s = run(s, { type: 'transaction.delete', id: 'e1', mutationId: 'del-e1', expectedVersion: 2 });
  assert.equal(balances(s).byWallet.cash, '900000'); assert.equal(balances(s).total, '1000000');
  s = run(s, { type: 'transfer.delete', id: 't1', mutationId: 'del-t1', expectedVersion: 1 });
  assert.deepEqual(balances(s).byWallet, { cash: '1000000', bank: '0' });
});
test('retry idempotency binds payload, stale writes rejected and events not repeated', () => {
  const initial = fixture(); const s = run(initial, expense); const retry = run(s, expense);
  assert.deepEqual(retry, s); assert.equal(s.activities.filter(a => a.kind === 'budget_exceeded').length, 1);
  assert.throws(() => run(s, { ...expense, amount: '1' }));
  assert.throws(() => run(s, { ...expense, type: 'transaction.update', mutationId: 'stale', expectedVersion: 0 }));
  report(s, period); budgetStatus(s, 'food-budget'); assert.deepEqual(s, retry);
  assert.equal(initial.transactions.length, 0);
});
test('invalid transfer never mutates state, future and missing references rejected', () => {
  const s = fixture(); const before = JSON.stringify(s);
  for (const c of [ { ...transfer, toWalletId: 'cash' }, { ...transfer, toWalletId: 'missing' }, { ...expense, occurredAt: '2026-10-11T00:00:00.000Z' }, { ...expense, amount: '0' }, { ...expense, categoryId: 'missing' } ]) assert.throws(() => run(s, c));
  assert.equal(JSON.stringify(s), before);
});
test('money beyond JS safe integer, signed64 boundaries and aggregate overflow', () => {
  assert.equal(money('9007199254740993'), 9007199254740993n);
  assert.equal(money('-9223372036854775808'), -9223372036854775808n);
  assert.throws(() => money('9223372036854775808')); assert.throws(() => money('-9223372036854775809'));
  for (const value of ['1e6', '1.5', 'NaN', ' 1', '01', '-0']) assert.throws(() => money(value));
  assert.equal(parseMoneyInput('9.007.199.254.740.993'), '9007199254740993');
  assert.match(formatMoney('9007199254740993'), /9.007.199.254.740.993/);
  const s = run(emptyLedger(), { type: 'wallet.create', id: 'large', mutationId: 'large', name: 'Lớn', icon: 'wallet', openingBalance: '9223372036854775807', openingAt: occurredAt });
  assert.throws(() => run(s, { type: 'wallet.create', id: 'extra', mutationId: 'extra', name: 'Thêm', icon: 'wallet', openingBalance: '1', openingAt: occurredAt }));
});
test('negative balances and adjustment not cash flow; historical opening effective time', () => {
  let s = run(fixture(), { ...expense, amount: '1000001' });
  assert.equal(balances(s).byWallet.cash, '-1');
  s = run(s, { type: 'adjustment.create', id: 'a1', mutationId: 'a1', walletId: 'cash', amount: '-100', occurredAt, note: 'Đối chiếu' });
  assert.equal(balances(s).byWallet.cash, '-101'); assert.equal(report(s, period).cashFlow, '-1000001');
  assert.equal(balances(s, { at: '2026-09-01T00:00:00.000Z' }).total, '0');
});
test('archived wallets retain totals/history but reject new entries', () => {
  let s = run(fixture(), expense);
  s = run(s, { type: 'wallet.archive', id: 'cash', mutationId: 'archive', expectedVersion: 1, archived: true });
  assert.equal(balances(s).total, '942000'); assert.equal(report(s, period).expense, '58000');
  assert.throws(() => run(s, { ...expense, id: 'e2', mutationId: 'e2' }));
});
test('many tags count transaction once', () => {
  let s = fixture();
  for (const id of ['tag1', 'tag2']) s = run(s, { type: 'tag.create', id, mutationId: id, name: id });
  s = run(s, { ...expense, tagIds: ['tag1', 'tag2'] });
  assert.equal(report(s, period).expense, '58000'); assert.equal(budgetStatus(s, 'food-budget').spent, '58000');
});
test('timezone midnight and inclusive end date range', () => {
  assert.equal(localDateKey('2026-10-09T17:30:00.000Z', 'Asia/Ho_Chi_Minh'), '2026-10-10');
  const range = dateRange('2026-10-10', '2026-10-10', 'Asia/Ho_Chi_Minh');
  assert.equal(range.start, '2026-10-09T17:00:00.000Z'); assert.equal(range.endExclusive, '2026-10-10T17:00:00.000Z');
  assert.throws(() => dateRange('2026-02-30', '2026-03-01', 'Asia/Ho_Chi_Minh'));
  assert.throws(() => dateRange('2026-10-11', '2026-10-10', 'Asia/Ho_Chi_Minh'));
});
test('backup exact round-trip and structural/relational/date/money validation', () => {
  const s = run(run(fixture(), expense), transfer); const json = encodeBackup(s, now);
  assert.deepEqual(decodeBackup(json, { now }).ledger, s);
  for (const corrupt of [
    (b: any) => b.schemaVersion = 999,
    (b: any) => b.ledger.transactions[0].walletId = 'missing',
    (b: any) => b.ledger.transactions[0].amount = 58000,
    (b: any) => b.ledger.transactions[0].occurredAt = 'bad',
    (b: any) => b.ledger.wallets.push(b.ledger.wallets[0]),
    (b: any) => b.ledger.transactions[0].tagIds = ['missing'],
  ]) { const b = JSON.parse(json); corrupt(b); assert.throws(() => decodeBackup(JSON.stringify(b), { now })); }
  assert.throws(() => decodeBackup('{', { now }));
});
test('large money backup does not round', () => {
  const s = run(emptyLedger(), { type: 'wallet.create', id: 'large', mutationId: 'large', name: 'Lớn', icon: 'wallet', openingBalance: '9007199254740993', openingAt: occurredAt });
  assert.equal(balances(decodeBackup(encodeBackup(s, now), { now }).ledger).total, '9007199254740993');
});
test('stable timeline pagination uses id tie-breaker', () => {
  let s = fixture();
  for (let i = 0; i < 5; i++) s = run(s, { ...expense, id: `e${i}`, mutationId: `e${i}` });
  const first = timeline(s, {}, { limit: 2 });
  const second = timeline(s, {}, { limit: 2, cursor: first.nextCursor! });
  const third = timeline(s, {}, { limit: 2, cursor: second.nextCursor! });
  assert.equal(new Set([...first.items, ...second.items, ...third.items].map(i => i.id)).size, 5);
  assert.equal(third.nextCursor, null);
});

test('pagination uses identical ordering for mixed-case IDs and punctuation', () => {
  let s = fixture();
  for (const id of ['a', 'A', 'b', 'B', 'a_1', 'a-1']) s = run(s, { ...expense, id, mutationId: `m-${id}` });
  const seen: string[] = []; let cursor: string | undefined;
  for (let page = 0; page < 6; page++) {
    const result = timeline(s, {}, { limit: 2, cursor });
    seen.push(...result.items.map(item => item.id));
    if (!result.nextCursor) break;
    cursor = result.nextCursor;
  }
  assert.deepEqual(seen, timeline(s).items.map(item => item.id));
  assert.equal(new Set(seen).size, 6);
});

test('valid IDs matching prototype names cannot corrupt filtered balances or reports', () => {
  let s = fixture();
  s = run(s, { type: 'wallet.create', id: 'toString', mutationId: 'prototype-wallet', name: 'Ví phụ', icon: 'wallet', openingBalance: '5', openingAt: occurredAt });
  s = run(s, { type: 'category.create', id: 'hasOwnProperty', mutationId: 'prototype-category', name: 'Khác', kind: 'expense', icon: 'wallet' });
  s = run(s, { ...expense, categoryId: 'hasOwnProperty', amount: '1' });
  assert.equal(balances(s, { walletIds: ['cash'] }).total, '999999');
  assert.deepEqual(Object.keys(balances(s, { walletIds: ['cash'] }).byWallet), ['cash']);
  assert.equal(report(s, period).byCategory.hasOwnProperty, '1');
});

test('wallet rename cannot rewrite opening history through extra fields', () => {
  const s = fixture();
  assert.throws(() => run(s, { type: 'wallet.update', id: 'cash', mutationId: 'bad-rename', expectedVersion: 1, name: 'Đổi tên', icon: 'wallet', openingBalance: '0' }));
  assert.equal(balances(s).total, '1000000');
});

test('date boundaries preserve DST day lengths and skipped next day', () => {
  const spring = dateRange('2026-03-08', '2026-03-08', 'America/New_York');
  const fall = dateRange('2026-11-01', '2026-11-01', 'America/New_York');
  assert.equal(Date.parse(spring.endExclusive) - Date.parse(spring.start), 23 * 3600000);
  assert.equal(Date.parse(fall.endExclusive) - Date.parse(fall.start), 25 * 3600000);
  const apia = dateRange('2011-12-29', '2011-12-29', 'Pacific/Apia');
  assert.equal(Date.parse(apia.endExclusive) - Date.parse(apia.start), 24 * 3600000);
  assert.throws(() => dateRange('2011-12-30', '2011-12-30', 'Pacific/Apia'));
});

test('full filtered daily totals are independent of timeline pagination and exclude transfers', () => {
  let s = fixture();
  s = run(s, { type: 'tag.create', id: 'meal', mutationId: 'meal', name: 'Bữa ăn' });
  for (let i = 0; i < 55; i++) s = run(s, { ...expense, id: `daily-${i}`, mutationId: `daily-${i}`, amount: '1', note: 'Bữa sáng', tagIds: ['meal'] });
  s = run(s, { ...expense, id: 'other-note', mutationId: 'other-note', amount: '100', note: 'Khác', tagIds: ['meal'] });
  s = run(s, { ...expense, id: 'other-day', mutationId: 'other-day', amount: '7', occurredAt: '2026-10-09T16:59:59.000Z', tagIds: ['meal'] });
  s = run(s, transfer);
  const filter = { search: 'bữa', walletIds: ['cash'], categoryIds: ['food'], tagIds: ['meal'], kind: 'expense' as const, ...dateRange('2026-10-10', '2026-10-10', s.settings.timezone) };
  assert.equal(timeline(s, filter).items.length, 50);
  assert.ok(timeline(s, filter).nextCursor);
  const totals = domain.timelineDailyTotals(s, filter);
  assert.equal(totals['2026-10-10'], '-55');
  assert.deepEqual(Object.keys(totals), ['2026-10-10']);
  const all = domain.timelineDailyTotals(s);
  assert.equal(all['2026-10-10'], '-155'); assert.equal(all['2026-10-09'], '-7');
  assert.deepEqual(Object.keys(domain.timelineDailyTotals(s, { kind: 'transfer' })), []);
  assert.equal(domain.timelineDailyTotals(s, { tagIds: ['missing'] })['2026-10-10'], undefined);
});

test('valid complete ledger can overflow a selected wallet report and recover with all wallets', () => {
  const s = emptyLedger();
  s.wallets = ['a', 'b', 'c'].map((id, i) => ({ id, version: 1, name: id, icon: 'wallet', openingAt: occurredAt, openingBalance: i === 2 ? '-9223372036854775807' : '9223372036854775807', archived: false }));
  domain.validateLedger(s, now);
  assert.equal(report(s, period).totalBalance, '9223372036854775807');
  assert.throws(() => report(s, { ...period, walletIds: ['a', 'b'] }), { code: 'OVERFLOW' });
  assert.equal(report(s, { ...period, walletIds: ['c'] }).totalBalance, '-9223372036854775807');
});

