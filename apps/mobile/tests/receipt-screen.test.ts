import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import * as domain from '../src/domain.ts';
import * as parser from '../src/import.ts';

const bill = 'HÓA ĐƠN\nTạm tính: 150.000\nVAT: 12.000\nGiảm giá: 10.000\nTổng thanh toán: 152.000\nKhách đưa: 200.000\nTiền thừa: 48.000';
function nodes(tree: any): any[] { if (!tree || typeof tree !== 'object') return []; if (Array.isArray(tree)) return tree.flatMap(nodes); return [tree, ...nodes(tree.props?.children)]; }
// Actual route and actual useDraft; only native/UI primitives, navigation and repository boundary are stubbed.
function harness() {
  const require = createRequire(import.meta.url); const ts = require('typescript');
  let ledger = domain.emptyLedger(); let revision = 0; let sequence = 0; let cursor = 0; let dirty = true; let locked = false; let focused = true;
  let slots: any[] = []; let effects: any[] = []; let tree: any; let route: 'text' | 'review' = 'text'; let recordId: string | undefined; let mounted = true; let childKey: any = Symbol('unmounted');
  let resolveOcr: (value: any) => void = () => {}; let rejectOcr: (error: any) => void = () => {}; let ocrCalls = 0; let failReparse = false;
  const routes: any[] = []; const commands: any[] = []; const alerts: any[] = []; const guards: any[] = []; const listeners = new Set<(state: string) => void>();
  const now = new Date().toISOString();
  ledger.wallets = [{ id: 'cash', version: 1, name: 'Tiền mặt', icon: 'wallet', openingBalance: '1000000', openingAt: now, archived: false }];
  ledger.categories = [{ id: 'food', version: 1, name: 'Ăn uống', icon: 'restaurant', kind: 'expense', archived: false }];
  const appState = { currentState: 'active', addEventListener: (_: string, callback: (state: string) => void) => { listeners.add(callback); return { remove: () => listeners.delete(callback) }; } };
  const react = {
    Fragment: 'Fragment', createElement: (type: any, props: any, ...children: any[]) => ({ type, props: { ...props, children } }),
    useState: (initial: any) => { const at = cursor++; if (!(at in slots)) slots[at] = typeof initial === 'function' ? initial() : initial; return [slots[at], (next: any) => { slots[at] = typeof next === 'function' ? next(slots[at]) : next; dirty = true; }]; },
    useRef: (initial: any) => { const at = cursor++; if (!(at in slots)) slots[at] = { current: initial }; return slots[at]; },
    useEffect: (callback: any, deps?: any[]) => { const at = cursor++; const previous = slots[at]; if (!previous || !deps || deps.some((value, index) => !Object.is(value, previous.deps?.[index]))) { slots[at] = { deps, cleanup: previous?.cleanup }; effects.push(() => { previous?.cleanup?.(); slots[at].cleanup = callback(); }); } },
    useCallback: (callback: any) => callback
  };
  const router = { replace: (value: any) => {
    if (value?.pathname === '/import-review') assert.equal(guards.at(-1)?.enabled, false, 'automatic review navigation must wait for the draft navigation guard to complete');
    routes.push({ method: 'replace', value });
  }, push: (value: any) => routes.push({ method: 'push', value }), back: () => routes.push({ method: 'back' }), canGoBack: () => true };
  const assertUnlocked = () => { if (locked) throw new Error('App locked'); };
  const store = () => ({ ledger, revision, nativeImportError: '', refresh: async () => ({ ledger, revision }), execute: async (command: any, expectedRevision?: number) => {
    assertUnlocked(); if (expectedRevision !== undefined && expectedRevision !== revision) throw new Error('Stale repository revision');
    if (failReparse && command.type === 'import.reparse') { failReparse = false; throw new Error('Synthetic parse write failed'); }
    commands.push(command); ledger = domain.applyCommand(ledger, command, { now: new Date().toISOString() }); revision++; dirty = true; return { ledger, revision };
  } });
  let ui: any;
  const dependencies = (name: string): any => {
    if (name === 'react') return react;
    if (name === 'react-native') return { AppState: appState, Text: 'Text', View: 'View', Pressable: 'Pressable', FlatList: 'FlatList', StyleSheet: { create: (styles: any) => styles }, Platform: { OS: 'ios' }, Alert: { alert: (...args: any[]) => alerts.push(args) } };
    if (name === 'expo-router') return { router, useNavigation: () => ({ dispatch: (value: any) => routes.push({ method: 'dispatch', value }) }), useLocalSearchParams: () => ({}), useIsFocused: () => focused };
    if (name === 'expo-router/react-navigation') return { usePreventRemove: (enabled: boolean, callback: any) => guards.push({ enabled, callback }), useIsFocused: () => focused };
    if (name === './domain') return domain;
    if (name === './import') return parser;
    if (name === './store') return { useLedger: store, newId: () => `synthetic-${++sequence}`, errorMessage: (error: Error) => error.message };
    if (name === './forms') return { useRecordId: () => ({ id: recordId, invalid: false }) };
    if (name === './app-lock') return { useAppLock: () => ({ covered: locked, locked, busy: false, assertUnlocked }) };
    if (name === './ui') return ui;
    if (name === './native') return { isNativeImportAvailable: () => true, recognizeImportImage: () => { ocrCalls++; return new Promise((resolve, reject) => { resolveOcr = resolve; rejectOcr = reject; }); } };
    return {};
  };
  function load(file: string) {
    const exports: any = {}; const code = ts.transpileModule(readFileSync(new URL(`../src/${file}.tsx`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
    runInNewContext(code, { exports, Date, Error, setTimeout, clearTimeout, require: dependencies }); return exports;
  }
  const realUi = load('ui');
  ui = { ...realUi, Page: 'Page', Card: 'Card', Choice: 'Choice', Button: 'Button', Empty: 'Empty', Field: 'Field', FormFooter: 'FormFooter', styles: {}, localInput: (value: string) => value, parseLocalInput: (value: string) => value };
  const screens = load('import-screen');
  const render = () => {
    cursor = 0; dirty = false; guards.length = 0; tree = route === 'text' ? screens.ImportTextScreen() : screens.ImportReviewScreen();
    if (typeof tree.type === 'function') {
      if (!Object.is(childKey, tree.props?.key)) { for (const slot of slots.slice(cursor)) slot?.cleanup?.(); slots.length = cursor; childKey = tree.props?.key; }
      tree = tree.type(tree.props);
    }
    return tree;
  };
  const flush = async () => { for (let index = 0; index < 40; index++) { if (mounted && (dirty || !tree)) render(); effects.splice(0).forEach(callback => callback()); await Promise.resolve(); } };
  const button = (title: string) => { const node = nodes(render()).find(node => node.type === 'Button' && node.props.title === title); assert.ok(node, `missing button ${title}`); return node; };
  const unmount = () => { mounted = false; for (const slot of slots) slot?.cleanup?.(); effects = []; };
  return { render, flush, button, routes, commands, alerts, ledger: () => ledger, calls: () => ocrCalls,
    resolve: (text: string | null = bill, warnings = ['Kiểm tra tiếng Việt']) => resolveOcr(text === null ? null : { text, languages: ['vi-VT'], warnings }), reject: () => rejectOcr(new Error('Synthetic OCR failure')),
    lock: (value: boolean) => { locked = value; dirty = true; }, focus: (value: boolean) => { focused = value; dirty = true; },
    appState: async (value: string) => { appState.currentState = value; listeners.forEach(callback => callback(value)); dirty = true; await flush(); },
    unmount, failNextReparse: () => { failReparse = true; },
    review: async () => { unmount(); slots = []; childKey = Symbol('unmounted'); route = 'review'; recordId = ledger.importedEvents[0]?.id; mounted = true; tree = undefined; dirty = true; await flush(); }
  };
}

test('actual known receipt OCR goes directly to review once after picker inactive cleanup and never posts money', async () => {
  const app = harness(); const start = app.button('Chọn ảnh để nhận diện'); start.props.onPress(); start.props.onPress(); await app.flush();
  assert.equal(app.calls(), 1); await app.appState('inactive'); await app.appState('active'); app.resolve(); await app.flush();
  assert.deepEqual(app.commands.map(command => command.type), ['import.receive', 'import.reparse']);
  assert.equal(app.ledger().importedEvents.length, 1); assert.equal(app.ledger().importedEvents[0].amount, '152000');
  assert.equal(app.ledger().importedEvents[0].state, 'needs_review'); assert.equal(app.ledger().transactions.length, 0);
  assert.equal(app.routes.length, 1); assert.equal(app.routes[0].value.pathname, '/import-review');
  assert.equal(app.routes[0].value.params.id, app.ledger().importedEvents[0].id);
  assert.ok(app.ledger().importedEvents[0].warnings.some(warning => warning.includes('Kiểm tra tiếng Việt')));
  await app.review();
  const firstStep = nodes(app.render());
  assert.ok(firstStep.some(node => node.type === 'Field' && node.props.label === 'Văn bản gốc — kiểm tra và sửa'));
  assert.ok(firstStep.some(node => node.type === 'Field' && node.props.label === 'Số tiền VND'));
  assert.ok(!firstStep.some(node => node.type === 'Field' && node.props.label === 'Ghi chú'));
  assert.ok(!firstStep.some(node => node.type === 'Button' && node.props.title === 'Xác nhận ghi sổ'));
  app.button('Tiếp tục: thông tin giao dịch').props.onPress(); await app.flush();
  assert.ok(nodes(app.render()).some(node => node.type === 'Button' && node.props.title === 'Xác nhận ghi sổ'));
  assert.ok(!nodes(app.render()).some(node => node.type === 'Field' && node.props.label === 'Số tiền VND'));
  assert.equal(domain.balances(app.ledger()).total, '1000000');
});

test('actual OCR cancellation, failure and unknown content keep editable drafts without receiving money', async () => {
  for (const result of ['cancel', 'error', 'unknown']) {
    const app = harness(); app.button('Chọn ảnh để nhận diện').props.onPress(); await app.flush();
    if (result === 'error') app.reject(); else app.resolve(result === 'cancel' ? null : 'Nội dung nhận diện'); await app.flush();
    assert.equal(app.commands.length, 0, result); assert.equal(app.routes.length, 0, result); assert.equal(app.ledger().transactions.length, 0, result);
    if (result === 'unknown') assert.ok(nodes(app.render()).some(node => node.type === 'Field' && node.props.value === 'Nội dung nhận diện'));
  }
});

test('stale OCR completion after background, focus loss, lock or unmount cannot save or navigate', async () => {
  for (const transition of ['background', 'focus', 'lock', 'unmount']) {
    const app = harness(); app.button('Chọn ảnh để nhận diện').props.onPress(); await app.flush();
    if (transition === 'background') await app.appState('background');
    if (transition === 'focus') { app.focus(false); await app.flush(); }
    if (transition === 'lock') { app.lock(true); await app.flush(); }
    if (transition === 'unmount') app.unmount();
    app.resolve(); await app.flush(); assert.equal(app.routes.length, 0, transition); assert.equal(app.commands.length, 0, transition);
    assert.equal(app.ledger().transactions.length, 0, transition);
  }
});

test('actual review reparses edited original, offers candidates and posts only one explicit chosen amount', async () => {
  const app = harness(); app.button('Chọn ảnh để nhận diện').props.onPress(); await app.flush(); app.resolve(); await app.flush(); await app.review();
  const original = nodes(app.render()).find(node => node.type === 'Field' && node.props.label === 'Văn bản gốc — kiểm tra và sửa'); assert.ok(original);
  original.props.onChangeText('HÓA ĐƠN\nTổng cộng: 152.000\nTổng thanh toán: 162.000'); await app.flush();
  app.button('Phân tích lại văn bản').props.onPress(); await app.flush();
  assert.equal(app.ledger().importedEvents.length, 1); assert.equal(app.ledger().importedEvents[0].amount, null); assert.equal(app.ledger().transactions.length, 0);
  const candidates = nodes(app.render()).find(node => node.type === 'Choice' && node.props.label === 'Số tiền trên hóa đơn'); assert.ok(candidates);
  const choice = candidates.props.items.find((item: any) => item.name.includes('162.000') || item.name.includes('162000')); assert.ok(choice);
  candidates.props.onSelect(choice.id); await app.flush();
  const amount = nodes(app.render()).find(node => node.type === 'Field' && node.props.label === 'Số tiền VND'); assert.ok(amount); assert.equal(domain.parseMoneyInput(amount.props.value), '162000');
  assert.ok(!nodes(app.render()).some(node => node.type === 'Button' && node.props.title === 'Xác nhận ghi sổ'));
  app.button('Tiếp tục: thông tin giao dịch').props.onPress(); await app.flush();
  const confirm = app.button('Xác nhận ghi sổ'); confirm.props.onPress(); confirm.props.onPress(); await app.flush();
  assert.equal(app.ledger().transactions.length, 1); assert.equal(domain.balances(app.ledger()).total, '838000');
  assert.equal(app.commands.filter(command => command.type === 'import.confirm').length, 1);
  assert.ok(app.ledger().importedEvents[0].warnings.some(warning => warning.includes('Kiểm tra tiếng Việt')));
});

test('receipt review steps retain the same draft and reject stale next callbacks until valid amount and fresh analysis', async () => {
  const app = harness(); app.button('Chọn ảnh để nhận diện').props.onPress(); await app.flush();
  const originalText = 'HÓA ĐƠN\nTổng cộng: 152.000\nTổng thanh toán: 162.000';
  app.resolve(originalText); await app.flush(); await app.review();
  const candidates = nodes(app.render()).find(node => node.type === 'Choice' && node.props.label === 'Số tiền trên hóa đơn'); assert.ok(candidates);
  candidates.props.onSelect('162000'); await app.flush();
  const amount = nodes(app.render()).find(node => node.type === 'Field' && node.props.label === 'Số tiền VND'); assert.ok(amount); assert.equal(domain.parseMoneyInput(amount.props.value), '162000');
  const noConfirmation = () => assert.ok(!nodes(app.render()).some(node => node.type === 'Button' && node.props.title === 'Xác nhận ghi sổ'));
  const transition = async (title: string) => {
    const commandCount = app.commands.length; const routeCount = app.routes.length;
    const button = app.button(title); assert.equal(button.props.disabled, false); button.props.onPress(); await app.flush();
    assert.equal(app.commands.length, commandCount, 'step changes cannot commit commands'); assert.equal(app.routes.length, routeCount, 'step changes stay in the same mounted review');
    assert.equal(app.ledger().transactions.length, 0); assert.equal(domain.balances(app.ledger()).total, '1000000');
  };
  const capturedValidNext = app.button('Tiếp tục: thông tin giao dịch').props.onPress;
  amount.props.onChangeText('0'); await app.flush(); assert.equal(app.button('Tiếp tục: thông tin giao dịch').props.disabled, true);
  try { capturedValidNext(); } catch { } await app.flush(); noConfirmation();
  const currentAmount = nodes(app.render()).find(node => node.type === 'Field' && node.props.label === 'Số tiền VND'); assert.ok(currentAmount);
  currentAmount.props.onChangeText('162000'); await app.flush();
  await transition('Tiếp tục: thông tin giao dịch');
  assert.ok(!nodes(app.render()).some(node => node.type === 'Field' && ['Số tiền VND', 'Văn bản gốc — kiểm tra và sửa'].includes(node.props.label)));
  const note = nodes(app.render()).find(node => node.type === 'Field' && node.props.label === 'Ghi chú'); assert.ok(note); note.props.onChangeText('Giữ ghi chú khi quay lại'); await app.flush();
  await transition('Quay lại: kiểm tra hóa đơn'); noConfirmation();
  const backAmount = nodes(app.render()).find(node => node.type === 'Field' && node.props.label === 'Số tiền VND'); assert.ok(backAmount); assert.equal(domain.parseMoneyInput(backAmount.props.value), '162000');
  const original = nodes(app.render()).find(node => node.type === 'Field' && node.props.label === 'Văn bản gốc — kiểm tra và sửa'); assert.ok(original); assert.equal(original.props.value, originalText);
  await transition('Tiếp tục: thông tin giao dịch');
  assert.equal(nodes(app.render()).find(node => node.type === 'Field' && node.props.label === 'Ghi chú')?.props.value, 'Giữ ghi chú khi quay lại');
  await transition('Quay lại: kiểm tra hóa đơn');
  const capturedFreshNext = app.button('Tiếp tục: thông tin giao dịch').props.onPress;
  nodes(app.render()).find(node => node.type === 'Field' && node.props.label === 'Văn bản gốc — kiểm tra và sửa')!.props.onChangeText('HÓA ĐƠN\nTổng cộng: 172.000'); await app.flush();
  assert.equal(app.button('Tiếp tục: thông tin giao dịch').props.disabled, true);
  try { capturedFreshNext(); } catch { } await app.flush(); noConfirmation();
  app.button('Phân tích lại văn bản').props.onPress(); await app.flush(); noConfirmation();
  const freshAmount = nodes(app.render()).find(node => node.type === 'Field' && node.props.label === 'Số tiền VND'); assert.ok(freshAmount); assert.equal(domain.parseMoneyInput(freshAmount.props.value), '172000');
  assert.equal(app.ledger().importedEvents[0].text, 'HÓA ĐƠN\nTổng cộng: 172.000');
  await transition('Tiếp tục: thông tin giao dịch');
  assert.equal(nodes(app.render()).find(node => node.type === 'Field' && node.props.label === 'Ghi chú')?.props.value, 'Giữ ghi chú khi quay lại');
  assert.equal(app.ledger().importedEvents.length, 1); assert.equal(app.ledger().transactions.length, 0);
});

test('an OCR source committed before parse-write failure can retry without receiving another source', async () => {
  const app = harness(); app.failNextReparse(); app.button('Chọn ảnh để nhận diện').props.onPress(); await app.flush(); app.resolve(); await app.flush();
  assert.equal(app.ledger().importedEvents.length, 1); assert.equal(app.ledger().transactions.length, 0); assert.equal(app.routes.length, 0);
  const id = app.ledger().importedEvents[0].id;
  const retry = nodes(app.render()).find(node => node.type === 'Button' && !node.props.disabled && /phân tích.*duyệt|duyệt.*hóa đơn|thử lại/i.test(node.props.title)); assert.ok(retry, 'saved source needs a visible parse retry');
  retry.props.onPress(); await app.flush(); assert.equal(app.ledger().importedEvents.length, 1); assert.equal(app.ledger().importedEvents[0].id, id);
  assert.equal(app.commands.filter(command => command.type === 'import.receive').length, 1); assert.equal(app.ledger().importedEvents[0].state, 'needs_review');
  assert.equal(app.routes.length, 1); assert.equal(app.ledger().transactions.length, 0);
});
