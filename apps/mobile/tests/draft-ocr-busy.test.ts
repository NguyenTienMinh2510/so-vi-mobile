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
