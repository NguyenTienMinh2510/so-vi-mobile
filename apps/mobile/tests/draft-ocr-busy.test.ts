import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';

test('actual draft guard combines OCR busy and dirty state without offering a navigation bypass', () => {
  const require = createRequire(import.meta.url); const ts = require('typescript');
  const code = ts.transpileModule(readFileSync(new URL('../src/ui.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
  const states: any[] = []; const refs: any[] = []; let stateIndex = 0; let refIndex = 0; let first = true;
  const guards: any[] = []; const alerts: any[] = []; const actions: any[] = [];
  const react = { useState: (value: any) => { const index = stateIndex++; if (first) states[index] = value; return [states[index], (next: any) => { states[index] = next; }]; }, useRef: (value: any) => { const index = refIndex++; if (first) refs[index] = { current: value }; return refs[index]; }, useEffect() {} };
  const exports: any = {};
  runInNewContext(code, { exports, require: (name: string) => {
    if (name === 'react') return react;
    if (name === 'react-native') return { StyleSheet: { create: (styles: any) => styles }, Alert: { alert: (...args: any[]) => alerts.push(args) } };
    if (name === 'expo-router') return { useNavigation: () => ({ dispatch: (action: any) => actions.push(action) }) };
    if (name === 'expo-router/react-navigation') return { usePreventRemove: (enabled: boolean, callback: any) => guards.push({ enabled, callback }) };
    if (name === './store') return { newId: () => 'draft-id', useLedger: () => ({ revision: 1 }) };
    if (name === './app-lock') return { useAppLock: () => ({ assertUnlocked: () => {} }) };
    return {};
  } });
  exports.useDraft({ text: 'Gốc' }, undefined, false); first = false;
  states[0] = { text: 'Đã sửa' }; stateIndex = 0; refIndex = 0; guards.length = 0;
  exports.useDraft({ text: 'Gốc' }, undefined, true);
  assert.equal(guards.length, 1); assert.equal(guards[0].enabled, true);
  guards[0].callback({ data: { action: { type: 'GO_BACK' } } });
  assert.equal(actions.length, 0); assert.ok(!alerts.at(-1)[2]?.some((button: any) => button.onPress), 'busy guard must not expose discard that bypasses another hook');
  stateIndex = 0; refIndex = 0; guards.length = 0;
  exports.useDraft({ text: 'Gốc' }, undefined, false); guards[0].callback({ data: { action: { type: 'GO_BACK' } } });
  assert.ok(alerts.at(-1)[2]?.some((button: any) => button.onPress), 'normal dirty draft still supports explicit discard');
});

test('an already displayed native discard alert consults the live app lock before discarding a dirty draft', () => {
  const require = createRequire(import.meta.url); const ts = require('typescript');
  const code = ts.transpileModule(readFileSync(new URL('../src/ui.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
  const states: any[] = []; const refs: any[] = []; let stateIndex = 0; let refIndex = 0; let first = true; let locked = false;
  const guards: any[] = []; const alerts: any[] = []; const actions: any[] = [];
  const react = { useState: (value: any) => { const index = stateIndex++; if (first) states[index] = value; return [states[index], (next: any) => { states[index] = typeof next === 'function' ? next(states[index]) : next; }]; }, useRef: (value: any) => { const index = refIndex++; if (first) refs[index] = { current: value }; return refs[index]; }, useEffect() {} };
  const exports: any = {};
  runInNewContext(code, { exports, Error, require: (name: string) => {
    if (name === 'react') return react;
    if (name === 'react-native') return { StyleSheet: { create: (styles: any) => styles }, Alert: { alert: (...args: any[]) => alerts.push(args) } };
    if (name === 'expo-router') return { useNavigation: () => ({ dispatch: (action: any) => actions.push(action) }) };
    if (name === 'expo-router/react-navigation') return { usePreventRemove: (enabled: boolean, callback: any) => guards.push({ enabled, callback }) };
    if (name === './store') return { newId: () => 'draft-id', errorMessage: (error: Error) => error.message, useLedger: () => ({ revision: 1 }) };
    if (name === './app-lock') return { useAppLock: () => ({ assertUnlocked: () => { if (locked) throw new Error('App locked'); } }) };
    return {};
  } });
  const render = () => { stateIndex = 0; refIndex = 0; guards.length = 0; const draft = exports.useDraft({ text: 'Gốc' }); first = false; return draft; };
  render().set('text', 'Bản nháp riêng tư'); const draft = render(); assert.equal(guards[0].enabled, true);
  guards[0].callback({ data: { action: { type: 'GO_BACK' } } }); const capturedDiscard = alerts.at(-1)[2].find((button: any) => button.onPress)?.onPress; assert.equal(typeof capturedDiscard, 'function');
  locked = true; try { capturedDiscard(); } catch { /* A guarded callback may reject rather than update its local error. */ }
  assert.equal(actions.length, 0, 'a callback captured while unlocked cannot discard after locking'); assert.equal(render().values.text, draft.values.text);
  locked = false; render(); guards[0].callback({ data: { action: { type: 'GO_BACK' } } }); alerts.at(-1)[2].find((button: any) => button.onPress).onPress();
  assert.equal(actions.length, 1, 'fresh explicit discard still works while unlocked');
});
