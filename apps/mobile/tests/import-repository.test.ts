import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import * as domain from '../src/domain.ts';

// Node SQLite exercises real repository SQL; iPhone must separately validate expo-sqlite.
test('schema2 migration retains exact money; import/restore failures roll back entry, audit and revision', async () => {
  const require = createRequire(import.meta.url); const ts = require('typescript');
  const code = ts.transpileModule(readFileSync(new URL('../src/database.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const exports: any = {};
  runInNewContext(code, { exports, require: (name: string) => name === './domain' ? domain : {}, Date });
  const db = new DatabaseSync(':memory:');
  const bind = (params: any[]) => params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
  const adapter = {
    execAsync: async (sql: string) => { db.exec(sql); },
    runAsync: async (sql: string, ...params: any[]) => db.prepare(sql).run(...bind(params)),
    getFirstAsync: async (sql: string, ...params: any[]) => db.prepare(sql).get(...bind(params)),
    getAllAsync: async (sql: string, ...params: any[]) => db.prepare(sql).all(...bind(params)),
    withTransactionAsync: async (fn: () => Promise<void>) => { db.exec('BEGIN'); try { await fn(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } },
    closeAsync: async () => db.close(),
  };
  db.exec('PRAGMA foreign_keys=ON');
  for (const migration of exports.migrations.filter((m: any) => m.version <= 2)) { db.exec(migration.sql); db.prepare('INSERT INTO schema_migrations(version,appliedAt) VALUES(?,?)').run(migration.version, '2026-01-01T00:00:00.000Z'); }
  db.exec('PRAGMA user_version=2');
  db.prepare('INSERT INTO wallets(id,version,name,icon,openingBalance,openingAt,archived) VALUES(?,?,?,?,?,?,?)').run('cash', 1, 'Cash', 'wallet', '9007199254740993', '2026-01-01T00:00:00.000Z', 0);
  db.prepare('INSERT INTO categories(id,version,name,icon,kind,archived) VALUES(?,?,?,?,?,?)').run('food', 1, 'Food', 'wallet', 'expense', 0);
  for (const [key, value] of [['initialized', '1'], ['revision', '0'], ['timezone', 'Asia/Ho_Chi_Minh'], ['onboarded', 'true']]) db.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run(key, value);
  const repo = new exports.LedgerRepository(adapter);
  try {
    await repo.initialize(); let loaded = await repo.load();
    assert.equal(db.prepare('PRAGMA user_version').get()!.user_version, 4);
    assert.equal(domain.balances(loaded.ledger).total, '9007199254740993'); assert.equal(loaded.ledger.importedEvents.length, 0);
    const receive = { type: 'import.receive', mutationId: 'receive', payload: { id: 'event', source: 'sms', provider: 'Test', sourceId: 'MSG1', text: 'Thanh toán thành công số tiền 58.000 VND. Mã giao dịch: R1', receivedAt: '2026-10-10T01:00:00.000Z' } };
    loaded = await repo.mutate(receive, loaded.revision);
    loaded = await repo.mutate({ type: 'import.process', mutationId: 'process', payload: { id: 'event', expectedVersion: 1 } }, loaded.revision);
    const before = await repo.load();
    const confirm = { type: 'import.confirm', mutationId: 'confirm', payload: { id: 'event', expectedVersion: 2, entry: { type: 'transaction', payload: { id: 'tx', walletId: 'cash', categoryId: 'food', kind: 'expense', amount: '58000', occurredAt: '2026-10-10T01:00:00.000Z', note: 'Approved', tagIds: [] } } } };
    db.exec("CREATE TEMP TRIGGER fail_import_insert BEFORE INSERT ON imported_events WHEN NEW.state='imported' BEGIN SELECT RAISE(ABORT,'forced import rollback'); END;");
    db.exec("CREATE TEMP TRIGGER fail_import_update BEFORE UPDATE ON imported_events WHEN NEW.state='imported' BEGIN SELECT RAISE(ABORT,'forced import rollback'); END;");
    await assert.rejects(() => repo.mutate(confirm, before.revision));
    assert.equal(JSON.stringify(await repo.load()), JSON.stringify(before));
    db.exec('DROP TRIGGER fail_import_insert; DROP TRIGGER fail_import_update;');
    loaded = await repo.mutate(confirm, before.revision);
    const saved = await repo.load();
    assert.equal(saved.ledger.transactions.length, 1); assert.equal(saved.ledger.importedEvents[0].state, 'imported');
    assert.equal(domain.balances(saved.ledger).total, '9007199254682993');
    const retry = await repo.mutate(confirm, before.revision); assert.equal(retry.revision, saved.revision);
    const backup = domain.decodeBackup(domain.encodeBackup(saved.ledger, new Date().toISOString()), { now: new Date().toISOString() });
    db.exec("CREATE TEMP TRIGGER fail_restore BEFORE INSERT ON imported_events BEGIN SELECT RAISE(ABORT,'forced restore rollback'); END;");
    await assert.rejects(() => repo.restore(backup, saved.revision));
    assert.equal(JSON.stringify(await repo.load()), JSON.stringify(saved)); db.exec('DROP TRIGGER fail_restore');
    const restored = await repo.restore(backup, saved.revision);
    assert.equal(restored.ledger.importedEvents[0].transactionId, 'tx'); assert.equal(restored.ledger.transactions.length, 1);
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
    await assert.rejects(() => repo.restore(backup, saved.revision));
  } finally { await repo.close(); }
});
