import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import * as domain from '../src/domain.ts';
import { planSpending, spendingTotals, emptySpending } from '../src/spending.ts';

const now = new Date().toISOString();
const today = domain.localDateKey(now, 'Asia/Ho_Chi_Minh');
const meal = { id: 'rice', name: 'Cơm', price: '12000', portion: '1 bữa', mode: 'out' as const, address: 'Tự nhập', priceSource: 'Người dùng xác nhận', pricedAt: today, estimated: false, allergens: [] };
const config = { id: 'p', name: 'Kế hoạch', startDay: today, endDay: today, timezone: 'Asia/Ho_Chi_Minh', budget: '50000', reserve: '10000', walletIds: [], categoryIds: [], mealsPerDay: 1, allowCooking: true, fixed: [] };
function harness() {
  const require = createRequire(import.meta.url); const ts = require('typescript');
  const code = ts.transpileModule(readFileSync(new URL('../src/database.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  class Clock extends Date { constructor(value?: string) { super(value ?? now); } static now() { return Date.parse(now); } }
  const exports: any = {}; runInNewContext(code, { exports, JSON, Date: Clock, require: (name: string) => name === './domain' ? domain : {} });
  const db = new DatabaseSync(':memory:');
  const params = (v: any[]) => v.length === 1 && Array.isArray(v[0]) ? v[0] : v;
  const adapter = { execAsync: async (sql: string) => db.exec(sql), runAsync: async (sql: string, ...v: any[]) => db.prepare(sql).run(...params(v)), getFirstAsync: async (sql: string, ...v: any[]) => db.prepare(sql).get(...params(v)), getAllAsync: async (sql: string, ...v: any[]) => db.prepare(sql).all(...params(v)), withTransactionAsync: async (f: () => Promise<void>) => { db.exec('BEGIN'); try { await f(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } }, closeAsync: async () => db.close() };
  return { db, repo: new exports.LedgerRepository(adapter), migrations: exports.migrations };
}
async function seed(repo: any) {
  await repo.initialize(); let saved = await repo.load();
  saved = await repo.mutate({ type: 'wallet.create', mutationId: 'wallet', payload: { id: 'cash', name: 'Ví', icon: 'wallet', openingBalance: '9007199254740993', openingAt: '2026-01-01T00:00:00.000Z', archived: false } }, saved.revision);
  saved = await repo.mutate({ type: 'spending.meal.upsert', mutationId: 'meal', payload: { meal } }, saved.revision);
  const plan = planSpending(saved.ledger, config, saved.ledger.spending.catalog, saved.ledger.spending.preferences, now);
  return repo.mutate({ type: 'spending.plan.upsert', mutationId: 'plan', payload: { plan, expectedVersion: null } }, saved.revision);
}

test('v3 SQLite upgrade preserves exact money, adds empty planning and rejects future DB', async () => {
  const { db, repo, migrations } = harness();
  try {
    db.exec('PRAGMA foreign_keys=ON'); for (const m of migrations.filter((x: any) => x.version <= 3)) db.exec(m.sql);
    db.exec('PRAGMA user_version=3');
    for (const [key, value] of [['initialized', '1'], ['revision', '0'], ['timezone', 'Asia/Ho_Chi_Minh'], ['onboarded', 'true']]) db.prepare('INSERT INTO settings VALUES(?,?)').run(key, value);
    db.prepare('INSERT INTO wallets VALUES(?,?,?,?,?,?,?)').run('cash', 1, 'Ví', 'wallet', '9007199254740993', '2026-01-01T00:00:00.000Z', 0);
    await repo.initialize(); const loaded = await repo.load();
    assert.equal(db.prepare('PRAGMA user_version').get()!.user_version, 4); assert.equal(domain.balances(loaded.ledger).total, '9007199254740993');
    assert.deepEqual(loaded.ledger.spending, emptySpending()); db.exec('PRAGMA user_version=5'); await assert.rejects(() => repo.initialize());
    assert.equal(db.prepare('SELECT openingBalance FROM wallets').get()!.openingBalance, '9007199254740993');
  } finally { await repo.close(); }
});

test('saved plan reload/backup roundtrip, stale preview and idempotency survive repository writes', async () => {
  const { repo } = harness();
  try {
    const saved = await seed(repo); const p = saved.ledger.spending.plans[0]; assert.equal(p.version, 1);
    const backup = domain.decodeBackup(domain.encodeBackup(saved.ledger, now), { now }); assert.deepEqual(backup.ledger.spending.plans[0], p);
    assert.equal((await repo.load()).ledger.spending.plans[0].meals[0].meal.price, '12000');
    const command = { type: 'spending.plan.upsert', mutationId: 'update', payload: { plan: p, expectedVersion: 1 } };
    const advanced = await repo.mutate({ type: 'spending.meal.upsert', mutationId: 'reprice', payload: { meal: { ...meal, price: '20000' } } }, saved.revision);
    await assert.rejects(() => repo.mutate(command, saved.revision));
    const updated = await repo.mutate(command, advanced.revision); assert.equal(updated.ledger.spending.plans[0].version, 2);
    assert.equal((await repo.mutate(command, updated.revision)).revision, updated.revision);
    await assert.rejects(() => repo.mutate({ ...command, payload: { ...command.payload, expectedVersion: 2 } }, updated.revision));
    await assert.rejects(() => repo.restore(backup, saved.revision));
  } finally { await repo.close(); }
});

test('planning row failures roll back plan, receipt, financial rows and revision; restore is atomic', async () => {
  const { db, repo } = harness();
  try {
    const saved = await seed(repo); const before = JSON.stringify(await repo.load());
    const backup = domain.decodeBackup(domain.encodeBackup(saved.ledger, now), { now });
    db.exec("CREATE TEMP TRIGGER block_plan BEFORE UPDATE ON spending_data BEGIN SELECT RAISE(ABORT,'forced plan failure'); END;");
    await assert.rejects(() => repo.mutate({ type: 'spending.meal.upsert', mutationId: 'fail', payload: { meal: { ...meal, price: '20000' } } }, saved.revision));
    assert.equal(JSON.stringify(await repo.load()), before);
    await assert.rejects(() => repo.restore(backup, saved.revision)); assert.equal(JSON.stringify(await repo.load()), before);
    db.exec('DROP TRIGGER block_plan'); await repo.restore(backup, saved.revision); assert.equal(domain.balances((await repo.load()).ledger).total, '9007199254740993');
  } finally { await repo.close(); }
});

test('actual overspend remains recordable; plan deficit never blocks ledger or backup', async () => {
  const { repo } = harness();
  try {
    let saved = await seed(repo);
    saved = await repo.mutate({ type: 'transaction.create', mutationId: 'spent', payload: { id: 'tx', walletId: 'cash', categoryId: 'expense-food', kind: 'expense', amount: '45000', occurredAt: now, note: '', tagIds: [] } }, saved.revision);
    assert.equal(spendingTotals(saved.ledger, saved.ledger.spending.plans[0], now).remaining, '-17000');
    assert.equal(domain.decodeBackup(domain.encodeBackup(saved.ledger, now), { now }).ledger.transactions.length, 1);
    await assert.rejects(() => repo.mutate({ type: 'spending.plan.upsert', mutationId: 'cannot-fit', payload: { plan: saved.ledger.spending.plans[0], expectedVersion: 1 } }, saved.revision));
    assert.equal((await repo.load()).ledger.transactions[0].amount, '45000');
  } finally { await repo.close(); }
});

test('malformed or mismatched backup never replaces data and explicit clear resets plans', async () => {
  const { repo } = harness();
  try {
    const saved = await seed(repo); const before = JSON.stringify(await repo.load());
    for (const corrupt of [(b: any) => { b.ledger.schemaVersion = 2; }, (b: any) => { b.ledger.spending.plans[0].meals[0].meal.price = 1; }, (b: any) => { b.ledger.spending.modelPath = '/private/path'; }]) {
      const backup: any = JSON.parse(domain.encodeBackup(saved.ledger, now)); corrupt(backup); await assert.rejects(async () => repo.restore(backup, saved.revision));
      assert.equal(JSON.stringify(await repo.load()), before);
    }
    const cleared = await repo.mutate({ type: 'data.clear', mutationId: 'clear', payload: { confirmation: 'XÓA' } }, saved.revision);
    assert.deepEqual(cleared.ledger.spending, emptySpending()); assert.equal(cleared.ledger.wallets.length, 0);
  } finally { await repo.close(); }
});
