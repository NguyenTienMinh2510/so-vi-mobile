import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import * as domain from '../src/domain.ts';

// Exercise actual screen render and filter callbacks; native layout still requires iPhone.
test('report overflow leaves a readable error and usable wallet filters, then recovers', () => {
  const require = createRequire(import.meta.url);
  const ts = require('typescript');
  const source = readFileSync(new URL('../src/screens.tsx', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const ledger = domain.emptyLedger();
  ledger.wallets = ['a', 'b', 'c'].map((id, i) => ({ id, version: 1, name: id, icon: 'wallet', openingAt: '2026-10-01T00:00:00.000Z', openingBalance: i === 2 ? '-9223372036854775807' : '9223372036854775807', archived: false }));
  const states: any[] = []; let cursor = 0;
  const react = {
    createElement: (type: any, props: any, ...children: any[]) => ({ type, props: { ...props, children } }),
    useState: (initial: any) => { const index = cursor++; if (!(index in states)) states[index] = Array.isArray(initial) ? ['a', 'b'] : typeof initial === 'function' ? initial() : initial; return [states[index], (value: any) => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; },
  };
  const exports: any = {};
  const ui = { Page: 'Page', Card: 'Card', Field: 'Field', Choice: 'Choice', Button: 'Button', Empty: 'Empty', colors: {}, styles: {}, toggle: (values: string[], id: string) => values.includes(id) ? values.filter(x => x !== id) : [...values, id] };
  runInNewContext(code, { exports, require: (name: string) => {
    if (name === 'react') return react;
    if (name === 'react-native') return { Text: 'Text', View: 'View' };
    if (name === './domain') return domain;
    if (name === './store') return { useLedger: () => ({ ledger }), errorMessage: (e: Error) => e.message };
    if (name === './ui') return ui;
    return {};
  }, Date });
  function render() { cursor = 0; return exports.ReportsScreen(); }
  function nodes(tree: any): any[] { if (!tree || typeof tree !== 'object') return []; if (Array.isArray(tree)) return tree.flatMap(nodes); return [tree, ...nodes(tree.props?.children)]; }
  const first = render(); const elements = nodes(first);
  const alert = elements.find(n => n.type === 'Text' && n.props.accessibilityRole === 'alert');
  assert.ok(alert, 'overflow must be a visible alert instead of a render exception');
  assert.match(JSON.stringify(alert.props.children), /64-bit|giới hạn/);
  const filter = elements.find(n => n.type === 'Choice');
  assert.equal(typeof filter.props.onSelect, 'function');
  assert.ok(elements.some(n => n.type === 'Button' && typeof n.props.onPress === 'function'));
  assert.doesNotMatch(JSON.stringify(first), /Số dư cuối kỳ:/, 'no fabricated report value on error');
  filter.props.onSelect('b');
  const recovered = render();
  assert.doesNotMatch(JSON.stringify(recovered), /64-bit/);
  assert.match(JSON.stringify(recovered), /9\.223\.372\.036\.854\.775\.807/);
});
