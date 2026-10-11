import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { emptyLedger, applyCommand } from '../src/domain.ts';
import { drainNativeImports } from '../src/native-import.ts';

function harness(available = true) {
  const require = createRequire(import.meta.url); const ts = require('typescript');
  const code = ts.transpileModule(readFileSync(new URL('../src/store.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const slots: any[] = []; const effects: any[] = []; let cursor = 0; let first = true;
  let ledger = emptyLedger(); let revision = 0; let observer: (() => void) | undefined; let foreground: ((state: string) => void) | undefined;
  let pending: unknown[] = []; let reads = 0; let rejectRead = false; let release: ((value: unknown[]) => void) | undefined; let pauseRead = false;
  const commands: string[] = []; const order: string[] = []; let locked = false; let restores = 0;
  const bridge = { pendingImportsAsync: async () => { reads++; order.push('read'); if (rejectRead) throw new Error('native-corrupt'); if (pauseRead) { pauseRead = false; return await new Promise<unknown[]>(resolve => { release = resolve; }); } return [...pending]; }, acknowledgeImportAsync: async (id: string) => { pending = pending.filter((item: any) => item.id !== id); } };
  const repo = { load: async () => ({ ledger, revision }), close: async () => {}, restore: async () => { restores++; return { ledger, revision }; }, mutate: async (command: any, expected: number) => { assert.equal(expected, revision); commands.push(command.type); ledger = applyCommand(ledger, command, { now: new Date().toISOString() }); revision++; return { ledger, revision }; } };
  const react = { createContext: () => ({ Provider: 'Provider' }), createElement: (type: any, props: any, ...children: any[]) => ({ type, props: { ...props, children } }),
    useState: (initial: any) => { const at = cursor++; if (first) slots[at] = initial; return [slots[at], (value: any) => { slots[at] = typeof value === 'function' ? value(slots[at]) : value; }]; },
    useRef: (initial: any) => { const at = cursor++; if (first) slots[at] = { current: initial }; return slots[at]; },
    useEffect: (effect: any) => { if (first) effects.push(effect); } };
  const exports: any = {};
  runInNewContext(code, { exports, Date, Math, setTimeout, clearTimeout, require: (name: string) => {
    if (name === 'react') return react;
    if (name === 'react-native') return { AppState: { addEventListener: (_: string, listener: any) => { foreground = listener; return { remove() {} }; } } };
    if (name === './database') return { openRepository: async () => repo };
    if (name === './native-import') return { drainNativeImports };
    if (name === './app-lock') return { useAppLock: () => ({ assertUnlocked: () => { if (locked) throw new Error('App locked'); } }) };
    if (name === './native') return { nativeImportBridge: available ? bridge : null, observeNativeImports: (listener: any) => { order.push('subscribe'); observer = listener; return () => {}; } };
    return {};
  } });
  const render = () => { cursor = 0; const tree = exports.StoreProvider({ children: null }); first = false; return tree.props.value; };
  render();
  return { start: () => effects.forEach(effect => effect()), render, order, commands, reads: () => reads, loaded: () => ledger,
    lock: () => { locked = true; }, restores: () => restores,
    pause: () => { pauseRead = true; }, release: () => { assert.ok(release); release([]); }, emit: () => observer?.(), foreground: () => foreground?.('active'), setPending: (value: unknown[]) => { pending = value; }, reject: () => { rejectRead = true; } };
}
const settle = async () => { for (let count = 0; count < 8; count++) await new Promise(resolve => setTimeout(resolve, 0)); };

test('actual StoreProvider subscribes before drain and reruns when a native arrival overlaps startup', async () => {
  const app = harness(); app.pause(); app.start(); await settle();
  assert.deepEqual(app.order.slice(0, 2), ['subscribe', 'read']);
  app.setPending([{ id: '11111111-2222-4333-8444-555555555555', source: 'sms', provider: 'Ngân hàng', sourceId: null, text: 'Thanh toán thành công 58.000 VND', receivedAt: '2026-10-10T12:00:00.000Z' }]);
  app.emit(); app.foreground(); app.release(); await settle();
  assert.equal(app.loaded().importedEvents.length, 1); assert.equal(app.loaded().transactions.length, 0);
  assert.equal(app.commands.filter(command => command === 'import.receive').length, 1); assert.ok(app.reads() >= 2);
  assert.equal(app.render().nativeImportError, '');
});

test('native ingress failure keeps the actual core store available with a separate retry error', async () => {
  const app = harness(); app.reject(); app.start(); await settle(); const store = app.render();
  assert.ok(store.loaded); assert.equal(store.error, null); assert.ok(store.nativeImportError.length > 0);
  assert.equal(typeof store.retryNativeImports, 'function'); assert.equal(app.loaded().transactions.length, 0);
});

test('Expo Go without optional native module still loads the actual local store', async () => {
  const app = harness(false); app.start(); await settle(); const store = app.render();
  assert.ok(store.loaded); assert.equal(store.error, null); assert.equal(store.nativeImportError, ''); assert.equal(app.reads(), 0);
});

test('captured StoreProvider execute and restore consult the live app lock before touching the repository', async () => {
  const app = harness(false); app.start(); await settle(); const captured = app.render(); app.lock();
  const command = { type: 'wallet.create' as const, mutationId: 'blocked', payload: { id: 'blocked', name: 'Ví', icon: 'wallet', openingBalance: '0', openingAt: '2026-10-10T12:00:00.000Z', archived: false } };
  assert.doesNotThrow(() => applyCommand(emptyLedger(), command, { now: '2026-10-11T04:00:00.000Z' }), 'the blocked command must otherwise be valid');
  const outcomes = await Promise.allSettled([
    captured.execute(command, 0),
    captured.restore({ schemaVersion: 2, exportedAt: '2026-10-11T04:00:00.000Z', ledger: emptyLedger() }, 0),
  ]);
  assert.equal(outcomes[0].status, 'rejected'); assert.equal(outcomes[1].status, 'rejected');
  assert.deepEqual(app.commands, []); assert.equal(app.restores(), 0); assert.equal(app.loaded().wallets.length, 0);
});
