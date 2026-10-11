import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdtempSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import * as domain from '../src/domain.ts';

// Run the actual diagnostic and SQL repository in disposable files; never open the user's ledger.
test('actual native diagnostics pass all twelve checks using authoritative persisted rollback snapshots', async () => {
  const require = createRequire(import.meta.url); const ts = require('typescript');
  const root = mkdtempSync(join(tmpdir(), 'sovi-native-diagnostic-')); const opened: string[] = []; const deleted: string[] = []; const connections = new Set<DatabaseSync>();
  let database: any;
  const safe = (name: string) => { assert.notEqual(name, database.USER_DATABASE); assert.match(name, /^sovi-test-\d+\.sqlite$/); return join(root, name); };
  const sqlite = { openDatabaseAsync: async (name: string, options: any) => {
    const path = safe(name); assert.equal(options.useNewConnection, true); opened.push(name); const db = new DatabaseSync(path); connections.add(db);
    const bind = (params: any[]) => params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
    const transaction = async (fn: (adapter: any) => Promise<any>) => { db.exec('BEGIN'); try { const result = await fn(adapter); db.exec('COMMIT'); return result; } catch (error) { db.exec('ROLLBACK'); throw error; } };
    const adapter: any = { execAsync: async (sql: string) => db.exec(sql), runAsync: async (sql: string, ...params: any[]) => db.prepare(sql).run(...bind(params)), getFirstAsync: async (sql: string, ...params: any[]) => db.prepare(sql).get(...bind(params)), getAllAsync: async (sql: string, ...params: any[]) => db.prepare(sql).all(...bind(params)), withTransactionAsync: transaction, withExclusiveTransactionAsync: transaction, closeAsync: async () => { if (connections.delete(db)) db.close(); } };
    return adapter;
  }, deleteDatabaseAsync: async (name: string) => { unlinkSync(safe(name)); deleted.push(name); } };
  const load = (file: string, imports: Record<string, any>) => { const exports: any = {}; const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText; runInNewContext(code, { exports, Date, Error, require: (name: string) => { assert.ok(name in imports, `unexpected diagnostic dependency ${name}`); return imports[name]; } }); return exports; };
  try {
    database = load('../src/database.ts', { './domain': domain, 'expo-sqlite': sqlite });
    const diagnostic = load('../src/native-check.ts', { './domain': domain, './database': database, 'expo-sqlite': sqlite });
    const evidence = await diagnostic.runNativeChecks(); assert.equal(evidence.length, 12); assert.ok(evidence.every((line: string) => line.startsWith('PASS:')));
  } finally {
    for (const db of connections) db.close(); rmSync(root, { recursive: true, force: true });
    assert.ok(opened.length >= 2, 'diagnostic exercises close and reopen'); assert.ok(opened.every(name => name !== database.USER_DATABASE)); assert.deepEqual(deleted, [opened[0]], 'isolated diagnostic file is removed even on failure');
  }
});
