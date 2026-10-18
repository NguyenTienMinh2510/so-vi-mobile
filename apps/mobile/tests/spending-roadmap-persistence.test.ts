import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import * as domain from '../src/domain.ts';
import { planSpending } from '../src/spending.ts';

const now = '2026-10-13T04:00:00.000Z', day = '2026-10-13';
const values = (value: unknown) => JSON.parse(JSON.stringify(value));
test('real SQLite online roadmap save preserves existing finances/catalogue and rolls back catalogue+plan+revision together', async () => {
  const require = createRequire(import.meta.url), ts = require('typescript'), exports: any = {};
  class Clock extends Date { constructor(value?: string) { super(value ?? now); } static now() { return Date.parse(now); } }
  runInNewContext(ts.transpileModule(readFileSync(new URL('../src/database.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports, JSON, Date: Clock, require: (name: string) => name === './domain' ? domain : {} });
  const db = new DatabaseSync(':memory:'), params = (v: any[]) => v.length === 1 && Array.isArray(v[0]) ? v[0] : v;
  const repo = new exports.LedgerRepository({ execAsync: async (sql: string) => db.exec(sql), runAsync: async (sql: string, ...v: any[]) => db.prepare(sql).run(...params(v)), getFirstAsync: async (sql: string, ...v: any[]) => db.prepare(sql).get(...params(v)), getAllAsync: async (sql: string, ...v: any[]) => db.prepare(sql).all(...params(v)), withTransactionAsync: async (f: () => Promise<void>) => { db.exec('BEGIN'); try { await f(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } }, closeAsync: async () => db.close() });
  const existing = { id: 'old-user-meal', name: 'Món đã lưu', price: '12000', portion: '1 phần', mode: 'out' as const, address: 'Địa chỉ cũ', priceSource: 'Nguồn cũ', pricedAt: day, estimated: true, allergens: [] };
  const catalog = [{ ...existing, id: 'online-test', name: 'Món từ nguồn', price: '40000', priceSource: 'https://food.be.com.vn/ho-chi-minh/dieu-lan-quan-chay-hoa-hung-26064' }];
  try {
    await repo.initialize(); let loaded = await repo.load();
    for (const command of [
      { type: 'wallet.create', mutationId: 'cash-create', payload: { id: 'cash', name: 'Ví', icon: 'wallet', openingBalance: '9007199254740993', openingAt: now, archived: false } },
      { type: 'category.create', mutationId: 'food-create', payload: { id: 'food', name: 'Ăn uống', icon: 'restaurant', kind: 'expense', archived: false } },
      { type: 'transaction.create', mutationId: 'expense-create', payload: { id: 'expense', walletId: 'cash', categoryId: 'food', kind: 'expense', amount: '50000', occurredAt: now, note: 'Chi thực đã có', tagIds: [] } },
      { type: 'spending.meal.upsert', mutationId: 'old-meal', payload: { meal: existing } },
    ]) loaded = await repo.mutate(command, loaded.revision);
    const before = loaded, config = { id: 'online-roadmap', name: 'Quận 10', startDay: day, endDay: day, timezone: 'Asia/Ho_Chi_Minh', budget: '200000', reserve: '10000', walletIds: ['cash'], categoryIds: ['food'], mealsPerDay: 1, allowCooking: false, fixed: [] };
    const plan = planSpending(before.ledger, config, catalog, before.ledger.spending.preferences, now);
    const command = { type: 'spending.roadmap.upsert', mutationId: 'online-save', payload: { catalog, plan, expectedVersion: null } };
    db.exec("CREATE TRIGGER reject_roadmap BEFORE UPDATE ON spending_data BEGIN SELECT RAISE(ABORT, 'forced rollback'); END");
    await assert.rejects(repo.mutate(command, before.revision)); assert.deepEqual(values(await repo.load()), values(before));
    db.exec('DROP TRIGGER reject_roadmap'); const saved = await repo.mutate(command, before.revision);
    assert.equal(saved.ledger.spending.plans[0].version, 1); assert.deepEqual(saved.ledger.spending.catalog.find((x: any) => x.id === existing.id), existing);
    for (const key of ['wallets', 'categories', 'transactions', 'transfers', 'adjustments', 'budgets', 'importedEvents'] as const) assert.deepEqual(saved.ledger[key], before.ledger[key], key);
    assert.equal(domain.balances(saved.ledger).total, '9007199254690993');
    assert.equal((await repo.mutate(command, saved.revision)).revision, saved.revision);
    await assert.rejects(repo.mutate({ ...command, mutationId: 'stale-repeat' }, before.revision)); assert.deepEqual(values(await repo.load()), values(saved));
  } finally { await repo.close(); }
});
