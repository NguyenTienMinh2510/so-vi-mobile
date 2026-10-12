import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import * as domain from '../src/domain.ts';
import * as parser from '../src/import.ts';

function nodes(tree: any): any[] { if (!tree || typeof tree !== 'object') return []; if (Array.isArray(tree)) return tree.flatMap(nodes); return [tree, ...nodes(tree.props?.children)]; }
function harness(file: 'screens' | 'import-screen', input?: unknown, native = true) {
  const require = createRequire(import.meta.url); const ts = require('typescript'); const exports: any = {};
  const code = ts.transpileModule(readFileSync(new URL(`../src/${file}.tsx`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const slots: any[] = []; const effects: (() => void)[] = []; const listeners = new Set<(state: string) => void>(); let cursor = 0; let focused = true; let locked = false; let dirty = true; let tree: any;
  const routes: any[] = []; const ocr: boolean[] = []; const ledger = domain.emptyLedger(); const appState = { currentState: 'active', addEventListener: (_: string, callback: (state: string) => void) => { listeners.add(callback); return { remove: () => listeners.delete(callback) }; } };
  const draft = { values: { source: 'text', provider: 'Dán thủ công', sourceId: '', text: '', ocrText: '' }, errors: {}, busy: false, set: (key: string, value: any) => { (draft.values as any)[key] = value; dirty = true; }, save: () => { throw new Error('entry shortcut cannot automatically save'); } };
  const effect = (callback: () => any, deps?: unknown[]) => { const at = cursor++; const previous = slots[at]; if (!previous || !deps || deps.length !== previous.deps?.length || deps.some((item, i) => !Object.is(item, previous.deps?.[i]))) { slots[at] = { deps }; effects.push(callback); } };
  const react = { createElement: (type: any, props: any, ...children: any[]) => ({ type, props: { ...props, children } }), Fragment: 'Fragment', useState: (initial: any) => { const at = cursor++; if (!(at in slots)) slots[at] = typeof initial === 'function' ? initial() : initial; return [slots[at], (next: any) => { slots[at] = typeof next === 'function' ? next(slots[at]) : next; dirty = true; }]; }, useRef: (value: any) => { const at = cursor++; if (!(at in slots)) slots[at] = { current: value }; return slots[at]; }, useEffect: effect, useCallback: (callback: any) => callback };
  const focusEffect = (callback: () => any) => effect(() => { if (focused) return callback(); }, [focused]);
  const router = { push: (route: any) => routes.push(route), replace: (route: any) => routes.push(route), setParams() {} };
  runInNewContext(code, { exports, Date, Error, setTimeout, clearTimeout, require: (name: string) => {
    if (name === 'react') return react;
    if (name === 'react-native') return { AppState: appState, Text: 'Text', View: 'View', Pressable: 'Pressable', SectionList: 'SectionList', FlatList: 'FlatList', ActivityIndicator: 'ActivityIndicator', Platform: { OS: 'ios' }, Keyboard: { dismiss() {} } };
    if (name === 'expo-router') return { router, useLocalSearchParams: () => ({ input }), useFocusEffect: focusEffect, useIsFocused: () => focused };
    if (name === 'expo-router/react-navigation') return { usePreventRemove() {}, useIsFocused: () => focused, useFocusEffect: focusEffect };
    if (name === './domain') return domain;
    if (name === './import') return parser;
    if (name === './native') return { isNativeImportAvailable: () => native, recognizeImportImage: async (camera: boolean) => { ocr.push(camera); return { text: 'Nội dung nhận diện', languages: ['vi-VN'], warnings: [] }; } };
    if (name === './store') return { newId: () => 'entry-test', errorMessage: (error: Error) => error.message, useLedger: () => ({ ledger, revision: 0, nativeImportError: '' }) };
    if (name === './app-lock') return { LockSettingsCard: 'LockSettingsCard', useAppLock: () => ({ covered: locked, locked, busy: false, assertUnlocked: () => { if (locked) throw new Error('locked'); } }) };
    if (name === './ui') return { Page: 'Page', Card: 'Card', Choice: 'Choice', Button: 'Button', Empty: 'Empty', Field: 'Field', FormFooter: 'FormFooter', Icon: 'Icon', styles: {}, colors: {}, useDraft: () => draft, localInput: (value: string) => value, parseLocalInput: (value: string) => value, toggle: (values: string[], id: string) => values.includes(id) ? values.filter(item => item !== id) : [...values, id] };
    return {};
  } });
  const render = () => { cursor = 0; dirty = false; tree = file === 'screens' ? exports.TransactionsScreen() : exports.ImportTextScreen(); return tree; };
  const flush = async () => { for (let index = 0; index < 32; index++) { if (dirty || !tree) render(); effects.splice(0).forEach(callback => callback()); await Promise.resolve(); } };
  return { render, flush, routes, ocr, draft, focus: (value: boolean) => { focused = value; dirty = true; }, lock: (value: boolean) => { locked = value; dirty = true; }, change: async (value: string) => { appState.currentState = value; listeners.forEach(callback => callback(value)); dirty = true; await flush(); } };
}

test('actual Transactions screen exposes text, camera and photo shortcuts before search and filters without a separate Inbox action', async () => {
  const app = harness('screens'); const tree = app.render(); const list = nodes(tree).find(node => node.type === 'SectionList'); assert.ok(list);
  const header = nodes(list.props.ListHeaderComponent); const filter = header.findIndex(node => node.type === 'Button' && /Bộ lọc/.test(node.props.title)); const search = header.findIndex(node => node.type === 'Field'); assert.ok(filter >= 0 && search >= 0);
  assert.ok(!header.some(node => node.type === 'Button' && /Inbox/i.test(node.props.title)), 'pending review belongs on the Transactions screen');
  const buttons = header.filter(node => node.type === 'Button' && ['Dán văn bản', 'Chụp ảnh', 'Chọn ảnh'].includes(node.props.title) && typeof node.props.onPress === 'function'); const destinations = new Map<any, any>();
  for (const button of buttons) { const before = app.routes.length; button.props.onPress(); if (app.routes.length > before) destinations.set(button, app.routes.at(-1)); }
  const normalized = (route: any) => typeof route === 'string' ? { pathname: route, input: undefined } : { pathname: route.pathname, input: route.params?.input };
  const expected = [{ pathname: '/import-text', input: undefined }, { pathname: '/import-text', input: 'camera' }, { pathname: '/import-text', input: 'photo' }];
  for (const target of expected) {
    const button = buttons.find(node => destinations.has(node) && JSON.stringify(normalized(destinations.get(node))) === JSON.stringify(target)); assert.ok(button, `missing quick action ${JSON.stringify(target)}`);
    assert.ok(header.indexOf(button) < search && header.indexOf(button) < filter, 'import actions are prominent before search and filters'); assert.ok(button.props.title.trim().length > 0);
  }
});

test('camera and photo route inputs each launch once while active without overwriting the draft or posting money', async () => {
  for (const input of ['camera', 'photo']) { const app = harness('import-screen', input); await app.flush(); assert.deepEqual(app.ocr, [input === 'camera']); app.render(); await app.flush(); assert.equal(app.ocr.length, 1); assert.equal(app.draft.values.text, ''); assert.equal(app.draft.values.ocrText, 'Nội dung nhận diện'); }
});

test('invalid, absent, array and Expo Go image inputs never automatically launch native capture', async () => {
  for (const input of [undefined, '', 'text', 'Camera', 'photo ', ['camera'], ['camera', 'photo'], '../camera']) { const app = harness('import-screen', input); await app.flush(); assert.deepEqual(app.ocr, []); }
  const unavailable = harness('import-screen', 'camera', false); await unavailable.flush(); assert.deepEqual(unavailable.ocr, []);
});

test('automatic image entry waits for focus, foreground and unlock and starts once after admission', async () => {
  const app = harness('import-screen', 'camera'); app.focus(false); app.lock(true); await app.change('background'); assert.deepEqual(app.ocr, []);
  app.focus(true); await app.change('active'); assert.deepEqual(app.ocr, []); app.lock(false); await app.flush(); assert.deepEqual(app.ocr, [true]);
  app.focus(false); await app.flush(); app.focus(true); await app.flush(); assert.deepEqual(app.ocr, [true]);
});

test('dirty and busy draft entry cannot be bypassed by automatic or captured image launch callbacks', async () => {
  const dirty = harness('import-screen', 'photo'); dirty.draft.set('text', 'Bản nháp đang viết'); await dirty.flush(); assert.deepEqual(dirty.ocr, []); assert.equal(dirty.draft.values.text, 'Bản nháp đang viết');
  const busy = harness('import-screen', 'camera'); busy.draft.busy = true; await busy.flush(); assert.deepEqual(busy.ocr, []);
  const manual = harness('import-screen', 'photo'); const button = nodes(manual.render()).find(node => node.type === 'Button' && node.props.title === 'Chọn ảnh để nhận diện'); assert.ok(button);
  manual.lock(true); try { await button.props.onPress(); } catch { } await manual.flush(); assert.deepEqual(manual.ocr, [], 'captured action consults the live app lock');
});

test('paste and image entry each show only the controls needed for their selected source', () => {
  const paste = nodes(harness('import-screen').render());
  assert.equal(paste.filter(node => node.type === 'Field' && node.props.multiline).length, 1);
  assert.ok(!paste.some(node => node.type === 'Button' && /ảnh.*nhận diện/.test(node.props.title)));
  assert.ok(!paste.some(node => node.type === 'Field' && /Ngân hàng|nhà cung cấp|ID nguồn/.test(node.props.label)));
  assert.ok(!paste.some(node => node.type === 'Choice' && node.props.label === 'Nguồn'));
  for (const input of ['camera', 'photo']) {
    const image = nodes(harness('import-screen', input).render());
    assert.equal(image.filter(node => node.type === 'Field' && node.props.multiline).length, 0, input);
    assert.ok(image.some(node => node.type === 'Button' && /ảnh.*nhận diện/.test(node.props.title)), input);
    assert.ok(!image.some(node => node.type === 'Field' && /Ngân hàng|nhà cung cấp|ID nguồn/.test(node.props.label)), input);
    assert.ok(!image.some(node => node.type === 'Choice' && node.props.label === 'Nguồn'), input);
  }
});
