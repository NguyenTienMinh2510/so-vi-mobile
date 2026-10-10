import * as SQLite from 'expo-sqlite';
import { applyCommand, emptyLedger, validateLedger, validateBackup, DomainError, type Ledger, type Command, type Backup } from './domain';

export const USER_DATABASE = 'sovi.sqlite';
export const migrations = [
  { version: 1, sql: `
CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, appliedAt TEXT NOT NULL);
CREATE TABLE wallets(id TEXT PRIMARY KEY, version INTEGER NOT NULL CHECK(version>0), name TEXT NOT NULL, icon TEXT NOT NULL, openingBalance TEXT NOT NULL, openingAt TEXT NOT NULL, archived INTEGER NOT NULL CHECK(archived IN(0,1)));
CREATE TABLE categories(id TEXT PRIMARY KEY, version INTEGER NOT NULL CHECK(version>0), name TEXT NOT NULL, icon TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN('income','expense')), archived INTEGER NOT NULL CHECK(archived IN(0,1)));
CREATE TABLE tags(id TEXT PRIMARY KEY, version INTEGER NOT NULL CHECK(version>0), name TEXT NOT NULL, archived INTEGER NOT NULL CHECK(archived IN(0,1)));
CREATE TABLE transactions(id TEXT PRIMARY KEY, version INTEGER NOT NULL CHECK(version>0), walletId TEXT NOT NULL REFERENCES wallets(id), categoryId TEXT NOT NULL REFERENCES categories(id), kind TEXT NOT NULL CHECK(kind IN('income','expense')), amount TEXT NOT NULL, occurredAt TEXT NOT NULL, note TEXT NOT NULL);
CREATE TABLE transaction_tags(transactionId TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE, tagId TEXT NOT NULL REFERENCES tags(id), PRIMARY KEY(transactionId,tagId));
CREATE TABLE transfers(id TEXT PRIMARY KEY, version INTEGER NOT NULL CHECK(version>0), fromWalletId TEXT NOT NULL REFERENCES wallets(id), toWalletId TEXT NOT NULL REFERENCES wallets(id), amount TEXT NOT NULL, occurredAt TEXT NOT NULL, note TEXT NOT NULL, CHECK(fromWalletId<>toWalletId));
CREATE TABLE balance_adjustments(id TEXT PRIMARY KEY, version INTEGER NOT NULL CHECK(version>0), walletId TEXT NOT NULL REFERENCES wallets(id), amount TEXT NOT NULL, occurredAt TEXT NOT NULL, note TEXT NOT NULL);
CREATE TABLE budgets(id TEXT PRIMARY KEY, version INTEGER NOT NULL CHECK(version>0), name TEXT NOT NULL, "limit" TEXT NOT NULL, start TEXT NOT NULL, endExclusive TEXT NOT NULL, CHECK(start<endExclusive));
CREATE TABLE budget_wallets(budgetId TEXT NOT NULL REFERENCES budgets(id) ON DELETE CASCADE, walletId TEXT NOT NULL REFERENCES wallets(id), PRIMARY KEY(budgetId,walletId));
CREATE TABLE budget_categories(budgetId TEXT NOT NULL REFERENCES budgets(id) ON DELETE CASCADE, categoryId TEXT NOT NULL REFERENCES categories(id), PRIMARY KEY(budgetId,categoryId));
CREATE TABLE activities(id TEXT PRIMARY KEY, kind TEXT NOT NULL, entityId TEXT NOT NULL, message TEXT NOT NULL, createdAt TEXT NOT NULL, read INTEGER NOT NULL CHECK(read IN(0,1)));
CREATE TABLE settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE INDEX transactions_wallet_time ON transactions(walletId,occurredAt DESC,id DESC);
CREATE INDEX transactions_category_time ON transactions(categoryId,occurredAt);
CREATE INDEX transaction_tags_tag ON transaction_tags(tagId,transactionId);
CREATE INDEX transfers_time ON transfers(occurredAt DESC,id DESC);
CREATE INDEX adjustments_wallet_time ON balance_adjustments(walletId,occurredAt);
CREATE INDEX activities_time ON activities(createdAt DESC,id DESC);
` },
  { version: 2, sql: `CREATE TABLE mutation_receipts(id TEXT PRIMARY KEY, signature TEXT NOT NULL); CREATE INDEX budgets_period ON budgets(start,endExclusive);` },
  { version: 3, sql: `
CREATE TABLE imported_events(id TEXT PRIMARY KEY, version INTEGER NOT NULL CHECK(version>0), source TEXT NOT NULL CHECK(source IN('sms','email','text')), provider TEXT NOT NULL, sourceId TEXT, text TEXT NOT NULL, receivedAt TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN('received','processing','needs_review','imported','duplicate','failed')), classification TEXT CHECK(classification IN('payment_success','pending_order','internal_transfer','refund','balance_update','ignored')), amount TEXT, reference TEXT, warnings TEXT NOT NULL, kind TEXT CHECK(kind IN('income','expense')), transactionId TEXT REFERENCES transactions(id) ON DELETE SET NULL, transferId TEXT REFERENCES transfers(id) ON DELETE SET NULL, duplicateOf TEXT REFERENCES imported_events(id) DEFERRABLE INITIALLY DEFERRED, error TEXT, ignored INTEGER NOT NULL CHECK(ignored IN(0,1)), CHECK(transactionId IS NULL OR transferId IS NULL));
CREATE INDEX imported_events_time ON imported_events(receivedAt DESC,id DESC);
CREATE INDEX imported_events_source ON imported_events(source,provider,sourceId);
CREATE INDEX imported_events_reference ON imported_events(provider,reference);
` }
];
const tables = [
  { key: 'wallets', table: 'wallets', columns: ['id', 'version', 'name', 'icon', 'openingBalance', 'openingAt', 'archived'] },
  { key: 'categories', table: 'categories', columns: ['id', 'version', 'name', 'icon', 'kind', 'archived'] },
  { key: 'tags', table: 'tags', columns: ['id', 'version', 'name', 'archived'] },
  { key: 'transactions', table: 'transactions', columns: ['id', 'version', 'walletId', 'categoryId', 'kind', 'amount', 'occurredAt', 'note'] },
  { key: 'transfers', table: 'transfers', columns: ['id', 'version', 'fromWalletId', 'toWalletId', 'amount', 'occurredAt', 'note'] },
  { key: 'adjustments', table: 'balance_adjustments', columns: ['id', 'version', 'walletId', 'amount', 'occurredAt', 'note'] },
  { key: 'budgets', table: 'budgets', columns: ['id', 'version', 'name', 'limit', 'start', 'endExclusive'] },
  { key: 'activities', table: 'activities', columns: ['id', 'kind', 'entityId', 'message', 'createdAt', 'read'] },
  { key: 'receipts', table: 'mutation_receipts', columns: ['id', 'signature'] },
  { key: 'importedEvents', table: 'imported_events', columns: ['id', 'version', 'source', 'provider', 'sourceId', 'text', 'receivedAt', 'state', 'classification', 'amount', 'reference', 'warnings', 'kind', 'transactionId', 'transferId', 'duplicateOf', 'error', 'ignored'] }
] as const;
type Row = Record<string, string | number | boolean | string[] | null>;
export type LoadedLedger = { ledger: Ledger; revision: number };

export class LedgerRepository {
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private db: SQLite.SQLiteDatabase) {}
  // All access to this private connection is serialized; no ambient queries can join a mutation.
  private serialized<T>(fn: () => Promise<T>): Promise<T> { const run = this.tail.then(fn); this.tail = run.catch(() => undefined); return run; }
  private transaction<T>(fn: () => Promise<T>): Promise<T> {
    return this.serialized(async () => { let result!: T; await this.db.withTransactionAsync(async () => { result = await fn(); }); return result; });
  }
  async initialize(): Promise<void> {
    await this.serialized(async () => {
      await this.db.execAsync('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;');
      const fk = await this.db.getFirstAsync<{ foreign_keys: number }>('PRAGMA foreign_keys'); if (fk?.foreign_keys !== 1) throw new Error('SQLite không bật được khóa ngoại.');
      await this.db.withTransactionAsync(async () => {
        const version = (await this.db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version ?? 0;
        if (version > migrations.length) throw new Error('Database thuộc phiên bản mới hơn. Giữ nguyên dữ liệu và mở bằng bản app phù hợp.');
        for (const m of migrations) if (m.version > version) { await this.db.execAsync(m.sql); await this.db.runAsync('INSERT INTO schema_migrations(version,appliedAt) VALUES(?,?)', m.version, new Date().toISOString()); await this.db.execAsync(`PRAGMA user_version=${m.version}`); }
        const initialized = await this.db.getFirstAsync('SELECT value FROM settings WHERE key=?', 'initialized');
        if (!initialized) {
          if (version !== 0) throw new Error('Database thiếu cài đặt khởi tạo; giữ nguyên dữ liệu để khôi phục tường minh.');
          for (const def of tables) if ((await this.db.getFirstAsync<{ count: number }>(`SELECT COUNT(*) AS count FROM ${def.table}`))?.count) throw new Error('Database có dữ liệu chưa khởi tạo; không ghi đè.');
          await this.persist(emptyLedger(), null); await this.setting('revision', '0'); await this.setting('initialized', '1');
        }
      });
    });
  }
  private async setting(key: string, value: string) { await this.db.runAsync('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, value); }
  private async loadInside(): Promise<LoadedLedger> {
    const s = emptyLedger();
    for (const def of tables) {
      const rows = await this.db.getAllAsync<Row>(`SELECT * FROM ${def.table} ORDER BY id`);
      for (const row of rows) { for (const key of ['archived', 'read', 'ignored']) if (key in row) row[key] = row[key] === 1; if (def.key === 'importedEvents') row.warnings = JSON.parse(row.warnings as string); }
      (s[def.key] as unknown) = rows;
    }
    const links = await this.db.getAllAsync<{ transactionId: string; tagId: string }>('SELECT * FROM transaction_tags ORDER BY tagId');
    for (const t of s.transactions) t.tagIds = links.filter(x => x.transactionId === t.id).map(x => x.tagId);
    const wallets = await this.db.getAllAsync<{ budgetId: string; walletId: string }>('SELECT * FROM budget_wallets ORDER BY walletId');
    const categories = await this.db.getAllAsync<{ budgetId: string; categoryId: string }>('SELECT * FROM budget_categories ORDER BY categoryId');
    for (const b of s.budgets) { b.walletIds = wallets.filter(x => x.budgetId === b.id).map(x => x.walletId); b.categoryIds = categories.filter(x => x.budgetId === b.id).map(x => x.categoryId); }
    const settings = Object.fromEntries((await this.db.getAllAsync<{ key: string; value: string }>('SELECT key,value FROM settings')).map(x => [x.key, x.value]));
    s.settings = { timezone: settings.timezone, onboarded: settings.onboarded === 'true' };
    const revision = Number(settings.revision); if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('Phiên bản database không hợp lệ.');
    validateLedger(s, new Date().toISOString()); return { ledger: s, revision };
  }
  load(): Promise<LoadedLedger> { return this.transaction(() => this.loadInside()); }
  private async persist(s: Ledger, before: Ledger | null) {
    if (!before) { for (const name of ['imported_events', 'transaction_tags', 'budget_wallets', 'budget_categories', 'transactions', 'transfers', 'balance_adjustments', 'budgets', 'activities', 'mutation_receipts', 'wallets', 'categories', 'tags']) await this.db.runAsync(`DELETE FROM ${name}`); }
    for (const def of [...tables].reverse()) if (before) {
      const nextIds = new Set((s[def.key] as { id: string }[]).map(x => x.id));
      for (const old of before[def.key] as { id: string }[]) if (!nextIds.has(old.id)) await this.db.runAsync(`DELETE FROM ${def.table} WHERE id=?`, old.id);
    }
    for (const def of tables) {
      const old = new Map((before ? before[def.key] as { id: string }[] : []).map(x => [x.id, JSON.stringify(x)]));
      for (const row of s[def.key] as unknown as Row[]) {
        if (old.get(row.id as string) === JSON.stringify(row)) continue;
        const columns = def.columns.map(c => `"${c}"`); const values = def.columns.map(c => c === 'warnings' ? JSON.stringify(row[c]) : typeof row[c] === 'boolean' ? row[c] ? 1 : 0 : row[c]) as (string | number | null)[];
        await this.db.runAsync(`INSERT INTO ${def.table}(${columns.join(',')}) VALUES(${columns.map(() => '?').join(',')}) ON CONFLICT(id) DO UPDATE SET ${columns.slice(1).map(c => `${c}=excluded.${c}`).join(',')}`, values);
        if (def.key === 'transactions') { await this.db.runAsync('DELETE FROM transaction_tags WHERE transactionId=?', row.id as string); for (const tagId of row.tagIds as string[]) await this.db.runAsync('INSERT INTO transaction_tags(transactionId,tagId) VALUES(?,?)', row.id as string, tagId); }
        if (def.key === 'budgets') {
          await this.db.runAsync('DELETE FROM budget_wallets WHERE budgetId=?', row.id as string); await this.db.runAsync('DELETE FROM budget_categories WHERE budgetId=?', row.id as string);
          for (const key of row.walletIds as string[]) await this.db.runAsync('INSERT INTO budget_wallets(budgetId,walletId) VALUES(?,?)', row.id as string, key);
          for (const key of row.categoryIds as string[]) await this.db.runAsync('INSERT INTO budget_categories(budgetId,categoryId) VALUES(?,?)', row.id as string, key);
        }
      }
    }
    await this.setting('timezone', s.settings.timezone); await this.setting('onboarded', String(s.settings.onboarded));
  }
  mutate(command: Command, expectedRevision: number): Promise<LoadedLedger> {
    return this.transaction(async () => {
      const current = await this.loadInside(); const next = applyCommand(current.ledger, command, { now: new Date().toISOString() });
      if (next === current.ledger) return current;
      if (current.revision !== expectedRevision) throw new DomainError('STALE', 'Dữ liệu đã thay đổi. Tải lại; bản nháp vẫn được giữ.');
      if (current.revision >= Number.MAX_SAFE_INTEGER) throw new Error('Phiên bản ghi đạt giới hạn; xuất backup trước khi tiếp tục.');
      await this.persist(next, current.ledger); await this.setting('revision', String(current.revision + 1)); return { ledger: next, revision: current.revision + 1 };
    });
  }
  restore(backup: Backup, expectedRevision: number): Promise<LoadedLedger> {
    const validated = validateBackup(backup, { now: new Date().toISOString() });
    return this.transaction(async () => {
      const current = await this.loadInside(); if (current.revision !== expectedRevision) throw new DomainError('STALE', 'Dữ liệu thay đổi sau khi xem trước. Chọn lại file backup.');
      if (current.revision >= Number.MAX_SAFE_INTEGER) throw new Error('Phiên bản ghi đạt giới hạn; xuất backup trước khi tiếp tục.');
      await this.persist(validated.ledger, null); await this.setting('revision', String(current.revision + 1)); return { ledger: validated.ledger, revision: current.revision + 1 };
    });
  }
  close(): Promise<void> { return this.serialized(() => this.db.closeAsync()); }
}
export async function openRepository(name = USER_DATABASE): Promise<LedgerRepository> {
  const db = await SQLite.openDatabaseAsync(name, { useNewConnection: true }); const repo = new LedgerRepository(db);
  try { await repo.initialize(); return repo; } catch (error) { await db.closeAsync(); throw error; }
}
