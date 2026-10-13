import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as domain from '../src/domain.ts';
import * as spending from '../src/spending.ts';

const now = '2026-10-13T04:00:00.000Z';
function harness(native = false) {
  const require = createRequire(import.meta.url), ts = require('typescript');
  let ledger = domain.emptyLedger(), revision = 0, locked = false, cursor = 0; const slots: any[] = [], effects: (() => void)[] = [], commands: any[] = []; let id = 0, cancellation = 0, finishAi: ((v: any) => void) | null = null, pauseSave = false, finishSave: (() => void) | null = null;
  const meal = { id: 'rice', name: 'Cơm', price: '12000', portion: '1 bữa', mode: 'out' as const, address: '', priceSource: 'Giá giả', pricedAt: '2026-10-13', estimated: false, allergens: [] };
  ledger.spending.catalog = [meal, { ...meal, id: 'pho', name: 'Phở', price: '30000' }];
  const react = { Fragment: 'Fragment', createElement: (type: any, props: any, ...children: any[]) => ({ type, props: { ...props, children } }), useState: (initial: any) => { const at = cursor++; if (!(at in slots)) slots[at] = typeof initial === 'function' ? initial() : initial; return [slots[at], (v: any) => { slots[at] = typeof v === 'function' ? v(slots[at]) : v; }]; }, useRef: (v: any) => { const at = cursor++; if (!(at in slots)) slots[at] = { current: v }; return slots[at]; }, useEffect: (fn: any, deps: any[]) => { const at = cursor++; const old = slots[at]; if (!old || deps.some((x, i) => !Object.is(x, old[i]))) { slots[at] = deps; effects.push(fn); } } };
  class Clock extends Date { constructor(v?: string) { super(v ?? now); } }
  const exports: any = {};
  runInNewContext(ts.transpileModule(readFileSync(new URL('../src/spending-screen.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText, { exports, Date: Clock, Error, setTimeout, clearTimeout, require: (name: string) => {
    if (name === 'react') return react;
    if (name === 'react-native') return { Text: 'Text', View: 'View', Alert: { alert() {} }, AppState: { addEventListener: () => ({ remove() {} }) } };
    if (name === 'expo-router') return { useNavigation: () => ({ dispatch() {} }) };
    if (name === 'expo-router/react-navigation') return { usePreventRemove() {} };
    if (name === './domain') return domain;
    if (name === './spending') return spending;
    if (name === './app-lock') return { useAppLock: () => ({ locked, assertUnlocked: () => { if (locked) throw new Error('locked'); } }) };
    if (name === './store') return { newId: () => `new-${++id}`, errorMessage: (e: any) => e.message, useLedger: () => ({ ledger, revision, execute: async (command: any, expected: number) => { if (pauseSave) await new Promise<void>(resolve => { finishSave = resolve; }); if (locked || expected !== revision) throw new Error('stale/locked'); commands.push(command); ledger = domain.applyCommand(ledger, command, { now }); revision++; return { ledger, revision }; } }) };
    if (name === './ui') return { Button: 'Button', Card: 'Card', Choice: 'Choice', Empty: 'Empty', Field: 'Field', Page: 'Page', styles: {}, toggle: (a: string[], v: string) => a.includes(v) ? a.filter(x => x !== v) : [...a, v] };
    if (name === './spending-ai') return { SPENDING_MODEL: { name: 'Qwen3.5-2B', license: 'Apache2', runtime: 'local' }, spendingAiAvailable: native, spendingAi: { state: { phase: 'missing' }, subscribe: () => () => {}, cancel: async () => { cancellation++; }, infer: () => new Promise(resolve => { finishAi = resolve; }) } };
    throw new Error(name);
  } });
  const flatten = (v: any): any[] => Array.isArray(v) ? v.flatMap(flatten) : v && typeof v === 'object' ? [v, ...flatten(v.props?.children)] : [];
  const render = () => { cursor = 0; const tree = exports.SpendingScreen(); while (effects.length) effects.shift()!(); return flatten(tree); };
  const node = (type: string, label: string) => { const found = render().find(v => v.type === type && (v.props.title === label || v.props.label === label)); assert.ok(found, `${type} ${label}`); return found; };
  return { render, node, commands, ledger: () => ledger, advance: () => { revision++; }, lock: () => { locked = true; }, cancellation: () => cancellation, pauseSave: () => { pauseSave = true; }, finishSave: () => { assert.ok(finishSave); finishSave(); }, finishAi: () => { assert.ok(finishAi); finishAi({ likedIds: ['rice'], excludedIds: [], excludedAllergens: [], frequency: [] }); } };
}
const settle = async () => { for (let n = 0; n < 20; n++) await Promise.resolve(); };
test('screen creates reviewed plan, saves/reopens and previews swap without writing a financial entry', async () => {
  const h = harness(); h.node('Field', 'Ngân sách VND').props.onChangeText('200000'); h.node('Choice', 'Số bữa mỗi ngày').props.onSelect('1');
  const create = h.render().find(v => v.type === 'Button' && /Tạo.*kế hoạch|Tạo đề xuất|Xem.*kế hoạch/.test(v.props.title)); assert.ok(create); create.props.onPress();
  h.node('Button', 'Chấp nhận & lưu kế hoạch').props.onPress(); await settle(); h.render();
  assert.equal(h.ledger().spending.plans.length, 1); assert.ok(h.commands.every(x => x.type.startsWith('spending.')));
  h.node('Choice', 'Đổi món 2026-10-13 bữa 1').props.onSelect('pho');
  const text = h.render().filter(v => v.type === 'Text').map(v => JSON.stringify(v.props.children)).join(' '); assert.ok(text.includes('18.000') || text.includes('-18.000'));
  assert.equal(h.commands.length, 1); assert.equal(h.ledger().transactions.length, 0);
});
test('stale preview is disabled and captured save handler rejects after live data changes', async () => {
  const h = harness(); h.node('Field', 'Ngân sách VND').props.onChangeText('200000');
  const create = h.render().find(v => v.type === 'Button' && /Tạo.*kế hoạch|Tạo đề xuất|Xem.*kế hoạch/.test(v.props.title)); assert.ok(create); create.props.onPress();
  const captured = h.node('Button', 'Chấp nhận & lưu kế hoạch').props.onPress; h.advance(); h.render();
  assert.equal(h.node('Button', 'Chấp nhận & lưu kế hoạch').props.disabled, true); captured(); await settle(); assert.equal(h.commands.length, 0);
});
test('live lock cancels AI and blocks captured plan actions while draft values remain', async () => {
  const h = harness(); h.node('Field', 'Ngân sách VND').props.onChangeText('200000');
  const create = h.render().find(v => v.type === 'Button' && /Tạo.*kế hoạch|Tạo đề xuất|Xem.*kế hoạch/.test(v.props.title)); assert.ok(create); const captured = create.props.onPress;
  h.lock(); h.render(); captured(); await settle(); assert.equal(h.commands.length, 0); assert.ok(h.cancellation() > 0);
  assert.equal(h.node('Field', 'Ngân sách VND').props.value, '200000');
});

test('late AI output cannot replace newer text or direct preferences', async () => {
  for (const edit of ['text', 'direct']) {
    const h = harness(true); h.node('Field', 'Mô tả sở thích cho AI local').props.onChangeText('Thích cơm');
    h.node('Button', 'AI hiểu sở thích').props.onPress(); await settle();
    if (edit === 'text') h.node('Field', 'Mô tả sở thích cho AI local').props.onChangeText('Không ăn cơm');
    else h.node('Choice', 'Món không ăn (bắt buộc)').props.onSelect('rice');
    h.finishAi(); await settle();
    assert.ok(!h.render().some(v => v.type === 'Button' && v.props.title === 'Dùng và sửa điều kiện AI hiểu'));
    if (edit === 'text') assert.equal(h.node('Field', 'Mô tả sở thích cho AI local').props.value, 'Không ăn cơm');
    else assert.ok(h.node('Choice', 'Món không ăn (bắt buộc)').props.selected.includes('rice'));
  }
});

test('pending plan save does not wipe a budget edit made before SQLite completion', async () => {
  const h = harness(); h.node('Field', 'Ngân sách VND').props.onChangeText('200000'); h.node('Button', 'Tạo đề xuất kế hoạch').props.onPress();
  h.pauseSave(); h.node('Button', 'Chấp nhận & lưu kế hoạch').props.onPress(); await settle();
  h.node('Choice', 'Phần đang xem').props.onSelect('config'); h.node('Field', 'Ngân sách VND').props.onChangeText('250000'); h.finishSave(); await settle();
  assert.equal(h.ledger().spending.plans[0].config.budget, '200000'); assert.equal(h.node('Field', 'Ngân sách VND').props.value, '250000');
});

test('pending plan save retains a newer swap preview and marks it stale for review', async () => {
  const h = harness(); h.node('Field', 'Ngân sách VND').props.onChangeText('200000'); h.node('Choice', 'Số bữa mỗi ngày').props.onSelect('1'); h.node('Button', 'Tạo đề xuất kế hoạch').props.onPress();
  h.pauseSave(); h.node('Button', 'Chấp nhận & lưu kế hoạch').props.onPress(); await settle();
  const oldMeal = h.node('Choice', 'Đổi món 2026-10-13 bữa 1').props.selected[0]; const nextMeal = oldMeal === 'rice' ? 'pho' : 'rice';
  h.node('Choice', 'Đổi món 2026-10-13 bữa 1').props.onSelect(nextMeal); h.finishSave(); await settle();
  assert.equal(h.ledger().spending.plans[0].meals[0].meal.id, oldMeal); assert.equal(h.node('Choice', 'Đổi món 2026-10-13 bữa 1').props.selected[0], nextMeal);
  assert.equal(h.node('Button', 'Chấp nhận & lưu kế hoạch').props.disabled, true);
});
