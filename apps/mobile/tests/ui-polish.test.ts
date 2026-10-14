import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const app = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(resolve(app, 'package.json'));
const ts = require('typescript');
const domain = require(resolve(app, 'src/domain.ts'));
const flatten = (tree: any): any[] => Array.isArray(tree) ? tree.flatMap(flatten) : tree && typeof tree === 'object' ? [tree, ...flatten(tree.props?.children), ...flatten(tree.props?.ListHeaderComponent), ...flatten(tree.props?.ListEmptyComponent), ...flatten(tree.props?.ListFooterComponent)] : [];
function harness(file: string) {
  let cursor = 0, values: Record<string, any> | undefined; const states: any[] = [], navigations: any[] = [], commands: any[] = [];
  const ledger = domain.emptyLedger(); ledger.wallets = [{ id: 'cash', name: 'Tiền mặt', icon: 'cash', version: 1, openingBalance: '1000000', openingAt: '2026-10-13T00:00:00.000Z', archived: false }];
  const react = { Fragment: 'Fragment', createElement: (type: any, props: any, ...children: any[]) => ({ type, props: { ...props, children } }), useState: (initial: any) => { const index = cursor++; if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial; return [states[index], (value: any) => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; }, useRef: (value: any) => ({ current: value }), useEffect() {} };
  const actualUi: any = {}, exports: any = {};
  const load = (name: string, output: any) => runInNewContext(ts.transpileModule(readFileSync(resolve(app, 'src', name + '.tsx'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText, { exports: output, Date, require: (id: string) => {
    if (id === 'react') return react;
    if (id === 'react-native') return { Text: 'Text', View: 'View', Pressable: 'Pressable', ScrollView: 'ScrollView', StyleSheet: { create: (v: any) => v }, Platform: { OS: 'ios' } };
    if (id === 'expo-router') return { router: { push: (value: any) => navigations.push(value) }, useLocalSearchParams: () => ({}) };
    if (id === './domain') return domain;
    if (id === './store') return { newId: () => 'new', useLedger: () => ({ ledger }), errorMessage: (e: any) => e.message };
    if (id === './native') return { isNativeImportAvailable: () => false };
    if (id === './app-lock') return { useAppLock: () => ({ assertUnlocked() {} }) };
    if (id === './ui') return { ...actualUi, Page: 'Page', Card: 'Card', Button: 'Button', Field: 'Field', Choice: 'Choice', MenuRow: 'MenuRow', FormFooter: 'FormFooter', useDraft: (initial: any) => { values ??= initial; return { values, errors: {}, busy: false, set: (key: string, value: any) => { values![key] = value; }, save: (build: any) => { commands.push(build('mutation')); } }; } };
    return {};
  } });
  load('ui', actualUi); load(file, exports);
  return { ui: actualUi, ledger, navigations, commands, render: (name: string, props?: any) => { cursor = 0; return flatten((name === 'Disclosure' ? actualUi : exports)[name](props)); } };
}

test('shared disclosure keeps secondary actions available with accessible open and close state', () => {
  const h = harness('screens'); const child = { type: 'Button', props: { title: 'Hành động phụ', onPress: () => h.navigations.push('secondary') } };
  const render = () => h.render('Disclosure', { title: 'Thao tác khác', children: child });
  let tree = render(); const trigger = () => render().find(n => n.type === 'Pressable');
  assert.equal(trigger().props.accessibilityState.expanded, false); assert.ok(!tree.includes(child));
  assert.equal(trigger().props.accessibilityLabel, 'Thao tác khác');
  const styles = [trigger().props.style].flat(Infinity).filter(Boolean); assert.ok(styles.some(s => s.minHeight >= 44));
  trigger().props.onPress(); tree = render(); assert.equal(trigger().props.accessibilityState.expanded, true); assert.ok(tree.includes(child));
  child.props.onPress(); assert.deepEqual(h.navigations, ['secondary']); trigger().props.onPress(); assert.ok(!render().includes(child));
  assert.equal(h.ledger.transactions.length, 0);
});

test('More exposes the existing backup route without exporting or replacing data automatically', () => {
  const h = harness('screens'), tree = h.render('MoreScreen'); const before = JSON.stringify(h.ledger);
  const backup = tree.find(n => /Sao lưu|Backup/.test(n.props.title ?? n.props.accessibilityLabel ?? ''));
  assert.ok(backup, 'backup needs a visible navigation entry'); assert.ok(!tree.some(n => n.type === h.ui.Disclosure && flatten(n.props.children).includes(backup)), 'backup must be a direct menu entry'); backup.props.onPress(); assert.deepEqual(h.navigations, ['/backup']); assert.equal(JSON.stringify(h.ledger), before); assert.equal(h.commands.length, 0);
});

test('Transactions gives AI Spending a visible direct entry without writing to the ledger', () => {
  const h = harness('screens'), tree = h.render('TransactionsScreen'); const before = JSON.stringify(h.ledger);
  const ai = tree.find(n => n.props.title === 'AI chi tiêu' || n.props.accessibilityLabel === 'AI chi tiêu');
  assert.ok(ai, 'AI Spending needs its own default entry'); assert.ok(!tree.some(n => n.type === h.ui.Disclosure && flatten(n.props.children).includes(ai)), 'AI entry must not be hidden inside a collapsed secondary disclosure'); ai.props.onPress(); assert.deepEqual(h.navigations, ['/ai-spending']); assert.equal(JSON.stringify(h.ledger), before); assert.equal(h.commands.length, 0);
});

test('manual transaction entry keeps compact wallet/category choices and exposes the time actually saved', () => {
  const h = harness('forms'); let tree = h.render('TransactionForm');
  for (const label of ['Ví', 'Danh mục']) assert.equal(tree.find(n => n.type === 'Choice' && n.props.label === label)?.props.dropdown, true);
  const date = tree.find(n => n.type === 'Field' && /Ngày.*giờ|Thời gian|occurredAt/i.test(n.props.label)); assert.ok(date, 'the transaction time must be visible and editable');
  date.props.onChangeText('2026-10-14 02:00'); tree.find(n => n.type === 'Field' && n.props.label === 'Số tiền VND').props.onChangeText('58000'); tree = h.render('TransactionForm');
  assert.equal(tree.find(n => n.type === 'Field' && n.props.label === date.props.label).props.value, '2026-10-14 02:00');
  tree.find(n => n.type === 'Button' && n.props.title === 'Lưu giao dịch').props.onPress();
  assert.equal(h.commands.length, 1); assert.equal(h.commands[0].type, 'transaction.create'); assert.equal(h.commands[0].payload.amount, '58000'); assert.equal(h.commands[0].payload.occurredAt, '2026-10-13T19:00:00.000Z'); assert.equal(h.ledger.transactions.length, 0);
});
