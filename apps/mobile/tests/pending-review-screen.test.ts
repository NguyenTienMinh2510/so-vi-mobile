import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import * as domain from '../src/domain.ts';
import * as parser from '../src/import.ts';
import { drainNativeImports } from '../src/native-import.ts';

const now = '2026-10-12T00:00:00.000Z';
const event = (id: string, state: domain.ImportedEvent['state'], receivedAt: string, ignored = false): domain.ImportedEvent => ({ id, version: 1, source: 'email', provider: `Nguồn thử ${id}`, sourceId: null, text: `Thanh toán 58.000 VND. Mã GD: TEST${id}`, receivedAt, state, classification: state === 'received' ? null : 'payment_success', amount: state === 'received' ? null : '58000', reference: state === 'received' ? null : `TEST${id}`, warnings: [], kind: state === 'received' ? null : 'expense', transactionId: null, transferId: null, duplicateOf: null, error: state === 'failed' ? 'Lỗi phân tích thử' : null, ignored });
function fixture() {
  const ledger = domain.emptyLedger();
  ledger.wallets = [{ id: 'cash', version: 1, name: 'Tiền mặt', icon: 'wallet', openingBalance: '1000000', openingAt: now, archived: false }];
  return ledger;
}
function harness(screen: 'home' | 'more' | 'legacy', initial = fixture(), ingressError = '') {
  const require = createRequire(import.meta.url); const ts = require('typescript'); let ledger = initial; let revision = 0; let dirty = true; let cursor = 0; let tree: any; let retryCalls = 0; let refreshCalls = 0; let nativeImportError = ingressError;
  let failRetry = false; let delayRetry = false; let releaseRetry: (() => void) | undefined; const pending: any[] = []; const commands: any[] = []; const routes: any[] = []; const order: string[] = []; const slots: any[] = []; const effects: any[] = [];
  const repository = { load: async () => ({ ledger, revision }), mutate: async (command: any, expected: number) => {
    assert.equal(expected, revision); commands.push(command); ledger = domain.applyCommand(ledger, command, { now }); revision++; dirty = true; return { ledger, revision };
  } };
  const bridge = { pendingImportsAsync: async () => [...pending], acknowledgeImportAsync: async (id: string) => { assert.ok(ledger.importedEvents.some(event => event.id === id)); const at = pending.findIndex(event => event.id === id); pending.splice(at, 1); } };
  const store = () => ({ ledger, revision, nativeImportError, retryNativeImports: async () => {
    retryCalls++; order.push('retry'); if (delayRetry) await new Promise<void>(resolve => { releaseRetry = resolve; }); if (failRetry) throw new Error('Lỗi nhận lại tổng hợp');
    await drainNativeImports(bridge, repository); nativeImportError = ''; dirty = true;
  }, refresh: async () => { refreshCalls++; order.push('refresh'); dirty = true; return { ledger, revision }; }, execute: async () => { throw new Error('Home browsing cannot post a financial command'); } });
  const react = { Fragment: 'Fragment', createElement: (type: any, props: any, ...children: any[]) => ({ type, props: { ...props, children } }),
    useState: (initial: any) => { const at = cursor++; if (!(at in slots)) slots[at] = typeof initial === 'function' ? initial() : initial; return [slots[at], (next: any) => { slots[at] = typeof next === 'function' ? next(slots[at]) : next; dirty = true; }]; },
    useRef: (initial: any) => { const at = cursor++; if (!(at in slots)) slots[at] = { current: initial }; return slots[at]; },
    useEffect: (callback: any, deps?: any[]) => { const at = cursor++; const previous = slots[at]; if (!previous || !deps || deps.some((value, index) => !Object.is(value, previous.deps?.[index]))) { slots[at] = { deps }; effects.push(callback); } }
  };
  const exports: any = {}; const source = ts.transpileModule(readFileSync(new URL(`../src/${screen === 'legacy' ? 'import-screen' : 'screens'}.tsx`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  runInNewContext(source, { exports, Date, Error, setTimeout, clearTimeout, require: (name: string) => {
    if (name === 'react') return react;
    if (name === 'react-native') return { Text: 'Text', View: 'View', Pressable: 'Pressable', SectionList: 'SectionList', FlatList: 'FlatList', ActivityIndicator: 'ActivityIndicator', Platform: { OS: 'ios' }, AppState: { addEventListener: () => ({ remove() {} }) } };
    if (name === 'expo-router') return { router: { push: (value: any) => routes.push(value), replace: (value: any) => routes.push(value) }, useLocalSearchParams: () => ({}) };
    if (name === './domain') return domain;
    if (name === './import') return parser;
    if (name === './store') return { useLedger: store, newId: () => 'synthetic', errorMessage: (error: Error) => error.message };
    if (name === './app-lock') return { useAppLock: () => ({ enabled: true, assertUnlocked() {} }) };
    if (name === './native') return { isNativeImportAvailable: () => true, sharedInboxStatus: async () => ({ available: true, error: '' }) };
    if (name === './ui') return { Page: 'Page', Card: 'Card', Button: 'Button', Field: 'Field', Choice: 'Choice', Empty: 'Empty', Icon: 'Icon', styles: {}, colors: {}, localInput: (value: string) => value };
    return {};
  } });
  function nodes(node: any): any[] {
    if (!node || typeof node !== 'object') return []; if (Array.isArray(node)) return node.flatMap(nodes);
    if (typeof node.type === 'function') return nodes(node.type(node.props));
    const rows = node.props?.data ?? node.props?.sections?.flatMap((section: any) => section.data) ?? [];
    return [node, ...nodes(node.props?.children), ...nodes(node.props?.ListHeaderComponent), ...nodes(node.props?.ListEmptyComponent), ...rows.flatMap((item: any, index: number) => nodes(node.props.renderItem?.({ item, index })))];
  }
  const render = () => { cursor = 0; dirty = false; tree = screen === 'home' ? exports.TransactionsScreen() : screen === 'more' ? exports.MoreScreen() : exports.InboxScreen(); return nodes(tree); };
  const flush = async () => { for (let index = 0; index < 35; index++) { if (dirty || !tree) render(); effects.splice(0).forEach(callback => callback()); await Promise.resolve(); } };
  const retry = () => { const button = render().find(node => node.type === 'Button' && node.props.title === 'Thử nhận lại Shortcuts / chia sẻ'); assert.ok(button, 'home must retain native queue recovery without requiring a waiting event'); return button; };
  return { render, flush, retry, routes, commands, order, ledger: () => ledger, tree: () => tree, calls: () => ({ retry: retryCalls, refresh: refreshCalls }), fail: (value: boolean) => { failRetry = value; }, pause: () => { delayRetry = true; }, release: () => { delayRetry = false; assert.ok(releaseRetry); releaseRetry(); },
    enqueue: () => pending.push({ id: '11111111-2222-4333-8444-555555555555', source: 'email', provider: 'Ngân hàng thử', sourceId: 'SYNTHETIC-MAIL', text: 'Thanh toán thành công 58.000 VND. Mã GD: TESTRECOVER', receivedAt: now }), pending: () => pending.length };
}
function openReviewRows(app: ReturnType<typeof harness>) {
  const ids: string[] = [];
  for (const node of app.render().filter(node => node.type === 'Pressable' && typeof node.props.onPress === 'function')) {
    const before = app.routes.length; node.props.onPress(); const route = app.routes.at(-1);
    if (app.routes.length > before && route?.pathname === '/import-review') ids.push(route.params.id);
  }
  return ids;
}

test('Transactions shows waiting source states in stable recent order and opening them changes no money or audit data', async () => {
  const ledger = fixture(); ledger.importedEvents = [event('old', 'received', '2026-10-10T00:00:00.000Z'), event('same-a', 'processing', now), event('same-z', 'needs_review', now), event('failed', 'failed', '2026-10-11T00:00:00.000Z'), event('more-two', 'received', '2026-10-11T22:00:00.000Z'), event('more-one', 'failed', '2026-10-11T20:00:00.000Z'), event('ignored', 'needs_review', now, true), event('posted', 'imported', now), event('copy', 'duplicate', now)];
  const app = harness('home', ledger); await app.flush(); const before = JSON.stringify(app.ledger());
  assert.ok(app.render().some(node => node.type === 'Text' && JSON.stringify(node.props.children).includes('Chờ duyệt')));
  assert.deepEqual(openReviewRows(app), ['same-z', 'same-a', 'more-two', 'more-one', 'failed']);
  const viewAll = app.render().find(node => node.type === 'Button' && /xem.*(?:tất cả|lịch sử)/i.test(node.props.title)); assert.ok(viewAll, 'waiting items beyond the first five must remain accessible');
  viewAll.props.onPress(); const destination = app.routes.at(-1); assert.equal(typeof destination === 'string' ? destination : destination?.pathname, '/inbox');
  const history = harness('legacy', app.ledger()); await history.flush(); assert.deepEqual(openReviewRows(history).sort(), ledger.importedEvents.map(event => event.id).sort());
  assert.equal(JSON.stringify(app.ledger()), before); assert.equal(app.commands.length, 0); assert.equal(app.ledger().transactions.length, 0);
});

test('home and More expose no Inbox action while the legacy waiting route retains every source audit record', async () => {
  for (const screen of ['home', 'more'] as const) { const app = harness(screen); await app.flush(); assert.ok(!app.render().some(node => node.type === 'Button' && /Inbox/i.test(node.props.title))); }
  const ledger = fixture(); ledger.importedEvents = [event('received', 'received', now), event('processing', 'processing', now), event('review', 'needs_review', now), event('failed', 'failed', now), event('ignored', 'needs_review', now, true), event('posted', 'imported', now), event('copy', 'duplicate', now)];
  const app = harness('legacy', ledger); await app.flush(); assert.match(app.tree().props.title, /^Chờ duyệt/);
  const before = JSON.stringify(app.ledger()); assert.deepEqual(openReviewRows(app).sort(), ledger.importedEvents.map(event => event.id).sort());
  assert.equal(JSON.stringify(app.ledger()), before); assert.equal(app.commands.length, 0);
});

test('zero-pending home retains native queue errors and a guarded durable retry before refresh', async () => {
  const app = harness('home', fixture(), 'Hàng chờ Shortcuts còn nguồn chưa nhận'); await app.flush();
  assert.ok(app.render().some(node => node.type === 'Text' && node.props.accessibilityRole === 'alert' && JSON.stringify(node.props.children).includes('nguồn chưa nhận')));
  app.enqueue(); app.pause(); const retry = app.retry(); retry.props.onPress(); retry.props.onPress(); await app.flush();
  assert.equal(app.calls().retry, 1); assert.equal(app.retry().props.disabled, true); assert.equal(app.pending(), 1);
  app.release(); await app.flush(); assert.deepEqual(app.order, ['retry', 'refresh']); assert.equal(app.pending(), 0);
  assert.deepEqual(app.commands.map(command => command.type), ['import.receive', 'import.process']);
  assert.equal(app.ledger().importedEvents[0].state, 'needs_review'); assert.equal(app.ledger().transactions.length, 0); assert.equal(domain.balances(app.ledger()).total, '1000000');
  assert.ok(!app.render().some(node => node.type === 'Text' && JSON.stringify(node.props.children).includes('nguồn chưa nhận')));
});

test('retry failure stays visible on empty home and permits a later successful recovery', async () => {
  const app = harness('home'); await app.flush(); app.fail(true); app.retry().props.onPress(); await app.flush();
  assert.ok(app.render().some(node => node.type === 'Text' && node.props.accessibilityRole === 'alert' && JSON.stringify(node.props.children).includes('Lỗi nhận lại tổng hợp')));
  assert.equal(app.retry().props.disabled, false); assert.equal(app.calls().refresh, 0); assert.equal(app.ledger().transactions.length, 0);
  app.fail(false); app.enqueue(); app.retry().props.onPress(); await app.flush(); assert.equal(app.calls().retry, 2); assert.equal(app.calls().refresh, 1);
  assert.equal(app.ledger().importedEvents.length, 1); assert.equal(app.ledger().transactions.length, 0);
});
