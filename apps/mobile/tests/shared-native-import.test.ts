import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { emptyLedger, applyCommand } from '../src/domain.ts';
import { drainNativeImports } from '../src/native-import.ts';

const id = (index: number) => `11111111-2222-4333-8444-${String(index).padStart(12, '0')}`;
const envelope = (index: number) => ({ id: id(index), source: 'text', provider: 'Chia sẻ', sourceId: null, text: `Thanh toán thành công 58.000 VND. Mã GD: REF${index}`, receivedAt: '2026-10-11T05:00:00.000Z' });
function harness(sharedAvailable = true) {
  const require = createRequire(import.meta.url); const ts = require('typescript'); const exports: any = {};
  const source = ts.transpileModule(readFileSync(new URL('../src/store.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const slots: any[] = []; const effects: any[] = []; let cursor = 0; let first = true; let ledger = emptyLedger(); let revision = 0; const commands: any[] = [];
  let privatePending: any[] = []; let sharedPending: any[] = []; let failSharedAck = false; let failSharedRead = false; const privateAck: string[] = []; const sharedAck: string[] = []; const reads: string[] = [];
  const bridge = (shared: boolean) => ({ pendingImportsAsync: async () => { reads.push(shared ? 'shared' : 'private'); if (shared && failSharedRead) throw new Error('shared AppGroup denied'); return [...(shared ? sharedPending : privatePending)]; }, acknowledgeImportAsync: async (id: string) => { assert.ok(ledger.importedEvents.some(item => item.id === id), 'durable Inbox receive precedes origin ACK'); if (shared && failSharedAck) throw new Error('shared ACK interrupted'); if (shared) { sharedAck.push(id); sharedPending = sharedPending.filter(item => item.id !== id); } else { privateAck.push(id); privatePending = privatePending.filter(item => item.id !== id); } } });
  const repository = { load: async () => ({ ledger, revision }), close: async () => {}, mutate: async (command: any, expected: number) => { assert.equal(expected, revision); const next = applyCommand(ledger, command, { now: new Date().toISOString() }); commands.push(command); if (next !== ledger) { ledger = next; revision++; } return { ledger, revision }; } };
  const react = { createContext: () => ({ Provider: 'Provider' }), createElement: (type: any, props: any, ...children: any[]) => ({ type, props: { ...props, children } }), useState: (initial: any) => { const at = cursor++; if (first) slots[at] = typeof initial === 'function' ? initial() : initial; return [slots[at], (next: any) => { slots[at] = typeof next === 'function' ? next(slots[at]) : next; }]; }, useRef: (initial: any) => { const at = cursor++; if (first) slots[at] = { current: initial }; return slots[at]; }, useEffect: (effect: any) => { if (first) effects.push(effect); } };
  runInNewContext(source, { exports, Date, Math, Error, setTimeout, clearTimeout, require: (name: string) => {
    if (name === 'react') return react;
    if (name === 'react-native') return { AppState: { addEventListener: () => ({ remove() {} }) } };
    if (name === './database') return { openRepository: async () => repository };
    if (name === './native-import') return { drainNativeImports };
    if (name === './app-lock') return { useAppLock: () => ({ assertUnlocked() {} }) };
    if (name === './native') return { nativeImportBridge: bridge(false), sharedNativeImportBridge: sharedAvailable ? bridge(true) : null, observeNativeImports: () => () => {}, sharedInboxStatus: async () => ({ available: sharedAvailable, error: sharedAvailable ? '' : 'AppGroup unavailable' }) };
    return {};
  } });
  const render = () => { cursor = 0; const tree = exports.StoreProvider({ children: null }); first = false; return tree.props.value; }; render();
  const settle = async () => { for (let count = 0; count < 12; count++) await new Promise(resolve => setTimeout(resolve, 0)); };
  return { render, start: async () => { effects.forEach(effect => effect()); await settle(); }, settle, commands, privateAck, sharedAck, reads, loaded: () => ({ ledger, revision }), pending: () => ({ private: privatePending, shared: sharedPending }), setPrivate: (items: any[]) => { privatePending = items; }, setShared: (items: any[]) => { sharedPending = items; }, failSharedAck: (value: boolean) => { failSharedAck = value; }, failSharedRead: (value: boolean) => { failSharedRead = value; } };
}

test('actual StoreProvider drains fifty private and fifty shared items independently without posting money', async () => {
  const app = harness(); app.setPrivate(Array.from({ length: 50 }, (_, index) => envelope(index))); app.setShared(Array.from({ length: 50 }, (_, index) => envelope(index + 50))); await app.start();
  assert.equal(app.loaded().ledger.importedEvents.length, 100); assert.equal(app.privateAck.length, 50); assert.equal(app.sharedAck.length, 50); assert.equal(app.loaded().ledger.transactions.length, 0); assert.equal(app.loaded().ledger.transfers.length, 0);
  assert.ok(!app.commands.some(command => command.type === 'import.confirm')); assert.equal(app.render().nativeImportError, '');
});

test('shared AppGroup unavailability cannot block the existing private Inbox', async () => {
  const app = harness(false); app.setPrivate([envelope(1)]); await app.start(); assert.equal(app.loaded().ledger.importedEvents.length, 1); assert.deepEqual(app.privateAck, [id(1)]); assert.deepEqual(app.sharedAck, []); assert.ok(app.render().loaded); assert.equal(app.render().error, null);
});

test('runtime shared-container denial preserves its queue and reports a retry error while private ingress completes', async () => {
  const app = harness(); app.setShared([envelope(2)]); app.setPrivate([envelope(1)]); app.failSharedRead(true); await app.start();
  assert.equal(app.loaded().ledger.importedEvents.length, 1); assert.deepEqual(app.privateAck, [id(1)]); assert.deepEqual(app.sharedAck, []); assert.equal(app.pending().shared.length, 1); assert.ok(app.render().nativeImportError); assert.equal(app.render().error, null);
});

test('shared receive persisted before failed ACK survives retry and ACK only removes its origin', async () => {
  const app = harness(); const shared = envelope(20); app.setShared([shared]); app.failSharedAck(true); await app.start(); assert.equal(app.loaded().ledger.importedEvents.length, 1); assert.equal(app.pending().shared.length, 1); assert.deepEqual(app.sharedAck, []);
  app.setPrivate([envelope(21)]); app.failSharedAck(false); await app.render().retryNativeImports(); await app.settle(); assert.equal(app.loaded().ledger.importedEvents.length, 2); assert.deepEqual(app.privateAck, [id(21)]); assert.deepEqual(app.sharedAck, [id(20)]); assert.equal(app.loaded().ledger.receipts.filter(item => item.id === `native-receive-${id(20)}`).length, 1); assert.equal(app.loaded().ledger.transactions.length, 0);
});

test('changed shared payload colliding with a private receipt remains pending without acknowledging either origin again', async () => {
  const app = harness(); const privateItem = envelope(30); app.setPrivate([privateItem]); await app.start(); const before = JSON.stringify(app.loaded());
  app.setShared([{ ...privateItem, text: 'Different source text' }]); await app.render().retryNativeImports(); await app.settle(); assert.equal(JSON.stringify(app.loaded()), before); assert.equal(app.pending().shared.length, 1); assert.deepEqual(app.sharedAck, []); assert.deepEqual(app.privateAck, [id(30)]); assert.ok(app.render().nativeImportError);
});
