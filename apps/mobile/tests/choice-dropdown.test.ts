import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';

function nodes(tree: any): any[] { if (!tree || typeof tree !== 'object') return []; if (Array.isArray(tree)) return tree.flatMap(nodes); return [tree, ...nodes(tree.props?.children)]; }
function harness(multiple = false, items = [{ id: 'cash', name: 'Tiền mặt' }, { id: 'bank', name: 'Ví ngân hàng với tên dài để kiểm tra xuống dòng trên điện thoại' }], dropdown = true) {
  const require = createRequire(import.meta.url); const ts = require('typescript'); const exports: any = {}; const slots: any[] = []; let cursor = 0; let selected = ['cash']; const selections: string[] = [];
  const react = { Fragment: 'Fragment', createElement: (type: any, props: any, ...children: any[]) => ({ type, props: { ...props, children } }), useState: (initial: any) => { const at = cursor++; if (!(at in slots)) slots[at] = initial; return [slots[at], (next: any) => { slots[at] = typeof next === 'function' ? next(slots[at]) : next; }]; }, useRef: (initial: any) => { const at = cursor++; if (!(at in slots)) slots[at] = { current: initial }; return slots[at]; }, useEffect() {} };
  const source = ts.transpileModule(readFileSync(new URL('../src/ui.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  runInNewContext(source, { exports, require: (name: string) => {
    if (name === 'react') return react;
    if (name === 'react-native') return { View: 'View', Text: 'Text', Pressable: 'Pressable', StyleSheet: { create: (value: any) => value } };
    return {};
  } });
  const render = () => { cursor = 0; return exports.Choice({ label: 'Ví', items, selected, dropdown, multiple, onSelect: (id: string) => { selections.push(id); selected = multiple ? selected.includes(id) ? selected.filter(value => value !== id) : [...selected, id] : [id]; } }); };
  const trigger = () => { const found = nodes(render()).find(node => node.type === 'Pressable' && node.props.accessibilityRole === 'button' && typeof node.props.accessibilityState?.expanded === 'boolean'); assert.ok(found, 'collapsed choice must expose an accessible expand button'); return found; };
  return { render, trigger, selections };
}
const minimumHeight = (node: any) => Math.max(...(Array.isArray(node.props.style) ? node.props.style.flat() : [node.props.style]).filter(Boolean).map((style: any) => style.minHeight ?? 0));

test('actual dropdown Choice exposes selected value and single selection closes the accessible list', () => {
  const app = harness(); const trigger = app.trigger(); assert.equal(trigger.props.accessibilityState.expanded, false); assert.ok(minimumHeight(trigger) >= 44);
  assert.ok(JSON.stringify(trigger.props.children).includes('Tiền mặt')); assert.equal(nodes(app.render()).filter(node => node.props.accessibilityRole === 'radio').length, 0);
  trigger.props.onPress(); assert.equal(app.trigger().props.accessibilityState.expanded, true);
  const options = nodes(app.render()).filter(node => node.props.accessibilityRole === 'radio'); assert.equal(options.length, 2); assert.equal(options[0].props.accessibilityState.checked, true);
  assert.ok(options.every(option => minimumHeight(option) >= 44)); assert.ok(JSON.stringify(options[1].props.children).includes('tên dài'));
  options[1].props.onPress(); assert.deepEqual(app.selections, ['bank']); assert.equal(app.trigger().props.accessibilityState.expanded, false);
  assert.equal(nodes(app.render()).filter(node => node.props.accessibilityRole === 'radio').length, 0);
});

test('actual multiple dropdown retains checkbox selections until the explicit close action', () => {
  const app = harness(true); app.trigger().props.onPress();
  const options = nodes(app.render()).filter(node => node.props.accessibilityRole === 'checkbox'); assert.equal(options.length, 2); assert.equal(options[0].props.accessibilityState.checked, true);
  options[1].props.onPress(); assert.deepEqual(app.selections, ['bank']); assert.equal(app.trigger().props.accessibilityState.expanded, true);
  assert.ok(nodes(app.render()).filter(node => node.props.accessibilityRole === 'checkbox').every(node => node.props.accessibilityState.checked));
  const close = nodes(app.render()).find(node => node.props.title === 'Xong' || (node.props.accessibilityRole === 'button' && (node.props.accessibilityLabel === 'Xong' || JSON.stringify(node.props.children).includes('Xong')))); assert.ok(close, 'multiple choice requires an explicit completion action');
  close.props.onPress(); assert.equal(app.trigger().props.accessibilityState.expanded, false);
});

test('empty dropdown communicates its state and default Choice keeps the existing visible options', () => {
  const empty = harness(false, []); assert.equal(nodes(empty.render()).filter(node => ['radio', 'checkbox'].includes(node.props.accessibilityRole)).length, 0);
  assert.ok(JSON.stringify(empty.render()).includes('Chưa có mục phù hợp'));
  const emptyTrigger = empty.trigger(); assert.equal(emptyTrigger.props.disabled, true); assert.equal(emptyTrigger.props.accessibilityState.expanded, false);
  assert.equal(emptyTrigger.props.accessibilityState.disabled, true); assert.ok(minimumHeight(emptyTrigger) >= 44);
  assert.ok(emptyTrigger.props.accessibilityLabel.includes('Ví'));
  const legacy = harness(false, undefined, false); const tree = nodes(legacy.render()); assert.equal(tree.filter(node => node.props.accessibilityRole === 'radio').length, 2);
  assert.ok(!tree.some(node => node.props.accessibilityRole === 'button' && typeof node.props.accessibilityState?.expanded === 'boolean'));
});
