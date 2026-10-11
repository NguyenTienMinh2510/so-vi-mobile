import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import * as domain from '../src/domain.ts';
import * as parser from '../src/import.ts';

// Actual route components with native hooks/tree stubbed; layout and VoiceOver need iPhone.
function screenHarness(nativeOptions?: { result: any }) {
  const require = createRequire(import.meta.url); const ts = require('typescript');
  const code = ts.transpileModule(readFileSync(new URL('../src/import-screen.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const now = new Date().toISOString(); let ledger = domain.emptyLedger(); let sequence = 0;
  ledger.wallets = [{ id: 'cash', version: 1, name: 'Tiền mặt', icon: 'wallet', openingBalance: '1000000', openingAt: now, archived: false }];
  ledger.categories = [{ id: 'food', version: 1, name: 'Ăn uống', icon: 'restaurant', kind: 'expense', archived: false }];
  const commands: any[] = []; const exports: any = {}; const pending: Promise<void>[] = []; const drafts: any[] = []; let ocrCalls = 0;
  const react = { createElement: (type: any, props: any, ...children: any[]) => ({ type, props: { ...props, children } }), useRef: (value: any) => ({ current: value }), useState: (value: any) => [value, () => {}], useEffect: () => {} };
  const ui = { Page: 'Page', Card: 'Card', Choice: 'Choice', Button: 'Button', Empty: 'Empty', Field: 'Field', FormFooter: 'FormFooter', styles: {}, localInput: (value: string) => value, parseLocalInput: (value: string) => value,
    useDraft: (initial: any) => {
      const values = { ...initial }; const errors: any = {}; const draft = { values, errors, busy: false, set: (key: string, value: any) => { values[key] = value; }, save: (build: any, after?: any) => {
        const work = (async () => {
        assert.equal(after, undefined, 'paste must not partially commit a second command');
        const command = build(`mutation-${++sequence}`); commands.push(command); ledger = domain.applyCommand(ledger, command, { now: new Date().toISOString() });
        })().catch(e => { errors.form = e.message; }); pending.push(work); return work;
      } }; drafts.push(draft); return draft;
    } };
  runInNewContext(code, { exports, Date, require: (name: string) => {
    if (name === 'react') return react;
    if (name === 'react-native') return { Text: 'Text', Pressable: 'Pressable', FlatList: 'FlatList', AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } };
    if (name === 'expo-router') return { router: { push() {} }, useLocalSearchParams: () => ({ input: undefined }), useIsFocused: () => true };
    if (name === './domain') return domain;
    if (name === './import') return parser;
    if (name === './native') return { isNativeImportAvailable: () => !!nativeOptions, recognizeImportImage: async () => { ocrCalls++; return nativeOptions?.result ?? null; } };
    if (name === 'expo-router/react-navigation') return { usePreventRemove: () => {}, useIsFocused: () => true };
    if (name === './app-lock') return { useAppLock: () => ({ covered: false, locked: false, busy: false, assertUnlocked: () => {} }) };
    if (name === './ui') return ui;
    if (name === './store') return { newId: () => `id-${++sequence}`, useLedger: () => ({ ledger }), errorMessage: (e: Error) => e.message };
    if (name === './forms') return { useRecordId: () => ({ id: ledger.importedEvents[0]?.id, invalid: false }) };
    return {};
  } });
  function nodes(tree: any): any[] { if (!tree || typeof tree !== 'object') return []; if (Array.isArray(tree)) return tree.flatMap(nodes); return [tree, ...nodes(tree.props?.children)]; }
  return { exports, nodes, commands, drafts, ocrCalls: () => ocrCalls, finish: () => Promise.all(pending), ledger: () => ledger, process: () => { const event = ledger.importedEvents[0]; ledger = domain.applyCommand(ledger, { type: 'import.process', mutationId: `process-${++sequence}`, payload: { id: event.id, expectedVersion: event.version } }, { now: new Date().toISOString() }); }, review: () => { const tree = exports.ImportReviewScreen(); return typeof tree.type === 'function' ? tree.type(tree.props) : tree; } };
}

test('actual OCR screen retains a full extracted draft without overwriting typed content or posting money', async () => {
  const text = 'x'.repeat(4001); const app = screenHarness({ result: { text, languages: ['en-US'], warnings: ['Kiểm tra tiếng Việt'] } });
  const tree = app.nodes(app.exports.ImportTextScreen()); const draft = app.drafts[0]; draft.set('text', 'Bản đang nhập');
  const pick = tree.find(node => node.type === 'Button' && node.props.title === 'Chọn ảnh để nhận diện'); assert.ok(pick);
  pick.props.onPress(); pick.props.onPress(); await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(app.ocrCalls(), 1); assert.equal(draft.values.ocrText, text); assert.equal(draft.values.text, 'Bản đang nhập');
  assert.equal(app.commands.length, 0); assert.equal(app.ledger().transactions.length, 0);
});

test('actual OCR screen cancellation preserves the typed draft and creates no Inbox event', async () => {
  const app = screenHarness({ result: null }); const tree = app.nodes(app.exports.ImportTextScreen()); const draft = app.drafts[0]; draft.set('text', 'Bản đang nhập');
  tree.find(node => node.type === 'Button' && node.props.title === 'Chọn ảnh để nhận diện').props.onPress(); await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(draft.values.text, 'Bản đang nhập'); assert.equal(draft.values.ocrText, ''); assert.equal(app.commands.length, 0);
});
test('paste saves only an Inbox event and financial posting requires an explicit review click', async () => {
  const app = screenHarness(); const fields = app.nodes(app.exports.ImportTextScreen());
  fields.find(n => n.type === 'Field' && n.props.multiline).props.onChangeText('Thanh toán thành công số tiền 58.000 VND');
  fields.find(n => n.type === 'Button' && n.props.title === 'Lưu vào Inbox').props.onPress();
  await app.finish();
  assert.equal(Object.keys(app.drafts[0].errors).length, 0);
  assert.equal(app.commands.length, 1); assert.equal(app.commands[0].type, 'import.receive');
  assert.equal(app.ledger().importedEvents[0].state, 'received'); assert.equal(app.ledger().transactions.length, 0);
  app.process(); const review = app.nodes(app.review());
  assert.equal(app.ledger().transactions.length, 0, 'opening review cannot post money');
  const confirm = review.find(n => n.type === 'Button' && n.props.title === 'Xác nhận ghi sổ'); assert.ok(confirm);
  confirm.props.onPress();
  await app.finish();
  assert.equal(Object.keys(app.drafts[1].errors).length, 0);
  assert.equal(app.commands[1].type, 'import.confirm'); assert.equal(app.ledger().transactions.length, 1);
  assert.equal(domain.balances(app.ledger()).total, '942000');
});
test('informational and pending Inbox review never offers financial confirmation', async () => {
  for (const text of ['Đơn hàng 58.000 VND đang chờ thanh toán', 'Số dư tài khoản 942.000 VND', 'Ưu đãi cuối tuần']) {
    const app = screenHarness(); const fields = app.nodes(app.exports.ImportTextScreen());
    fields.find(n => n.type === 'Field' && n.props.multiline).props.onChangeText(text);
    fields.find(n => n.type === 'Button' && n.props.title === 'Lưu vào Inbox').props.onPress(); await app.finish(); app.process();
    const review = app.nodes(app.review());
    assert.ok(!review.some(n => n.type === 'Button' && n.props.title === 'Xác nhận ghi sổ'));
    assert.ok(review.some(n => n.type === 'Button' && n.props.title === 'Bỏ qua, giữ lịch sử'));
    assert.equal(app.ledger().transactions.length, 0);
  }
});
test('overlong pasted content is retained and rejected without silently creating a truncated event', async () => {
  const app = screenHarness(); const fields = app.nodes(app.exports.ImportTextScreen());
  const input = fields.find(n => n.type === 'Field' && n.props.multiline);
  assert.equal(input.props.maxLength, undefined, 'native input must not silently truncate original content');
  const original = 'a'.repeat(4001); input.props.onChangeText(original);
  fields.find(n => n.type === 'Button' && n.props.title === 'Lưu vào Inbox').props.onPress(); await app.finish();
  assert.equal(app.ledger().importedEvents.length, 0);
  assert.equal(app.drafts[0].values.text, original); assert.ok(app.drafts[0].errors.form);
});
