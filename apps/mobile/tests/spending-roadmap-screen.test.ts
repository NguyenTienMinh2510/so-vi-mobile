import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as domain from '../src/domain.ts';
import * as spending from '../src/spending.ts';
import * as roadmap from '../src/spending-roadmap.ts';

const now = '2026-10-13T04:00:00.000Z';
function harness() {
  const require = createRequire(import.meta.url), ts = require('typescript');
  let ledger = domain.emptyLedger(), revision = 0, locked = false, cursor = 0, pausedFetch = false, pausedSave = false;
  const slots: any[] = [], effects: (() => void)[] = [], commands: any[] = []; let identifier = 0, cancelCount = 0;
  let resolveFetch: ((v: any) => void) | undefined, resolveAi: ((v: any) => void) | undefined, resolveSave: (() => void) | undefined;
  const catalog = ['Cơm', 'Phở', 'Bún'].map((name, i) => ({ id: ['rice', 'pho', 'bun'][i], name, price: String(30000 + i * 10000), portion: '1 phần · Quán test', mode: 'out' as const, address: 'Quận 10, TP.HCM', priceSource: 'https://food.be.com.vn/ho-chi-minh/dieu-lan-quan-chay-hoa-hung-26064', pricedAt: '2026-10-13', estimated: true, allergens: [] }));
  const react = { Fragment: 'Fragment', createElement: (type: any, props: any, ...children: any[]) => ({ type, props: { ...props, children } }), useState: (initial: any) => { const at = cursor++; if (!(at in slots)) slots[at] = typeof initial === 'function' ? initial() : initial; return [slots[at], (v: any) => { slots[at] = typeof v === 'function' ? v(slots[at]) : v; }]; }, useRef: (v: any) => { const at = cursor++; if (!(at in slots)) slots[at] = { current: v }; return slots[at]; }, useEffect: (fn: any, deps: any[]) => { const at = cursor++; const old = slots[at]; if (!old || deps.some((x, i) => !Object.is(x, old[i]))) { slots[at] = deps; effects.push(fn); } } };
  class Clock extends Date { constructor(v?: string) { super(v ?? now); } }
  const exports: any = {};
  runInNewContext(ts.transpileModule(readFileSync(new URL('../src/spending-roadmap-screen.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText, { exports, Date: Clock, Error, AbortController, setTimeout, clearTimeout, require: (name: string) => {
    if (name === 'react') return react;
    if (name === 'react-native') return { Text: 'Text', View: 'View', Pressable: 'Pressable', ScrollView: 'ScrollView', Linking: { openURL: async () => {} }, Alert: { alert() {} }, AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } };
    if (name === 'expo-router') return { useNavigation: () => ({ dispatch() {} }) };
    if (name === 'expo-router/react-navigation') return { usePreventRemove() {} };
    if (name === './domain') return domain;
    if (name === './spending') return spending;
    if (name === './spending-roadmap') return roadmap;
    if (name === './spending-sources') return { loadOnlineMeals: async () => pausedFetch ? new Promise(resolve => { resolveFetch = resolve; }) : { meals: catalog, warnings: [] } };
    if (name === './app-lock') return { useAppLock: () => ({ locked, covered: false, assertUnlocked: () => { if (locked) throw new Error('locked'); } }) };
    if (name === './store') return { newId: () => `roadmap-${++identifier}`, errorMessage: (e: any) => e.message, useLedger: () => ({ ledger, revision, execute: async (command: any, expected: number) => { if (pausedSave) await new Promise<void>(resolve => { resolveSave = resolve; }); if (locked || expected !== revision) throw new Error('stale/locked'); commands.push(command); ledger = domain.applyCommand(ledger, command, { now }); revision++; return { ledger, revision }; } }) };
    if (name === './ui') return { Button: 'Button', Card: 'Card', Choice: 'Choice', Icon: 'Icon', Field: 'Field', Page: 'Page', styles: {}, colors: {}, toggle: (a: string[], v: string) => a.includes(v) ? a.filter(x => x !== v) : [...a, v] };
    if (name === './spending-ai') return { SPENDING_MODEL: { name: 'Qwen3.5-2B', bytes: 1568476256 }, spendingAiAvailable: true, spendingAi: { state: { phase: 'ready', error: '' }, subscribe: () => () => {}, cancel: async () => { cancelCount++; }, infer: () => new Promise(resolve => { resolveAi = resolve; }) } };
    throw Error(name);
  } });
  const flatten = (v: any): any[] => Array.isArray(v) ? v.flatMap(flatten) : v && typeof v === 'object' ? [v, ...flatten(v.props?.children)] : [];
  const render = () => { cursor = 0; const tree = exports.RoadmapScreen(); while (effects.length) effects.shift()!(); return flatten(tree); };
  const node = (type: string, label: string) => { const value = render().find(v => v.type === type && (v.props.title === label || v.props.label === label || v.props.accessibilityLabel === label)); assert.ok(value, `${type}: ${label}`); return value; };
  const text = () => render().filter(v => v.type === 'Text').map(v => v.props.children.flat(Infinity).filter((x: any) => typeof x === 'string' || typeof x === 'number').join('')).join(' ');
  return { render, node, text, commands, ledger: () => ledger, advance: () => { revision++; }, lock: () => { locked = true; }, pauseFetch: () => { pausedFetch = true; }, finishFetch: () => { assert.ok(resolveFetch); resolveFetch({ meals: catalog, warnings: [] }); }, finishAi: () => { assert.ok(resolveAi); resolveAi({ likedIds: [], excludedIds: [], excludedAllergens: [], frequency: [] }); }, pauseSave: () => { pausedSave = true; }, finishSave: () => { assert.ok(resolveSave); pausedSave = false; resolveSave(); }, cancellation: () => cancelCount };
}
const settle = async () => { for (let n = 0; n < 32; n++) await Promise.resolve(); };
async function create(h: ReturnType<typeof harness>) { h.node('Field', 'Mô tả roadmap').props.onChangeText('Quận 10, 2 ngày, 300k, 3 bữa/ngày'); h.node('Button', 'Tạo roadmap').props.onPress(); await settle(); h.finishAi(); await settle(); h.render(); }
test('roadmap imports only on reviewed save, displays one day and week, never creates an expense', async () => {
  const h = harness(); await create(h); assert.equal(h.commands.length, 0);
  assert.equal(h.render().filter(v => v.type === 'Button' && /^Đổi bữa/.test(v.props.title)).length, 3);
  h.node('Choice', 'Xem roadmap').props.onSelect('week'); assert.ok(h.text().includes('13/10') && h.text().includes('14/10'));
  h.node('Button', 'Lưu roadmap').props.onPress(); await settle(); assert.equal(h.commands.length, 1); assert.equal(h.commands[0].type, 'spending.roadmap.upsert'); assert.equal(h.ledger().transactions.length, 0);
});
test('late source and AI replies cannot replace a newer prompt or bypass live lock', async () => {
  for (const stage of ['source', 'ai', 'lock']) {
    const h = harness(); if (stage === 'source') h.pauseFetch();
    h.node('Field', 'Mô tả roadmap').props.onChangeText('Quận 10, 2 ngày, 300k'); h.node('Button', 'Tạo roadmap').props.onPress(); await settle();
    if (stage === 'lock') { h.lock(); h.render(); } else h.node('Field', 'Mô tả roadmap').props.onChangeText('Quận 10, 7 ngày, 900k');
    if (stage === 'source') h.finishFetch(); else h.finishAi(); await settle();
    assert.ok(!h.render().some(v => v.type === 'Button' && v.props.title === 'Lưu roadmap')); assert.equal(h.commands.length, 0); assert.ok(h.cancellation() > 0);
  }
});
test('captured save rejects after the live ledger revision advances', async () => {
  const h = harness(); await create(h); const save = h.node('Button', 'Lưu roadmap').props.onPress; h.advance(); h.render(); save(); await settle(); assert.equal(h.commands.length, 0);
});
test('an ordinary swap cannot refresh a stale proposal without explicit recomputation', async () => {
  const h = harness(); await create(h); h.node('Button', 'Đổi bữa 1').props.onPress(); const choose = h.node('Button', 'Chọn Phở').props.onPress;
  h.advance(); h.render(); choose(); await settle(); assert.equal(h.node('Button', 'Lưu roadmap').props.disabled, true); assert.equal(h.commands.length, 0);
});
test('pending save preserves a later prompt without losing the saved revision of the roadmap', async () => {
  const h = harness(); await create(h); h.pauseSave(); h.node('Button', 'Lưu roadmap').props.onPress(); await settle();
  h.node('Button', 'Sửa mô tả').props.onPress(); h.node('Field', 'Mô tả roadmap').props.onChangeText('Quận 10, 7 ngày, 900k'); h.finishSave(); await settle(); h.render();
  assert.equal(h.ledger().spending.plans[0].config.budget, '300000'); assert.equal(h.node('Field', 'Mô tả roadmap').props.value, 'Quận 10, 7 ngày, 900k');
  h.node('Button', 'Tạo roadmap').props.onPress(); await settle(); h.finishAi(); await settle();
  assert.equal(h.node('Button', 'Lưu roadmap').props.disabled, false); h.node('Button', 'Lưu roadmap').props.onPress(); await settle(); assert.equal(h.ledger().spending.plans[0].version, 2);
});
