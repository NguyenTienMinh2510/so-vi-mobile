import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as domain from '../src/domain.ts';
import * as spending from '../src/spending.ts';
import * as roadmap from '../src/spending-roadmap.ts';

const now = '2026-10-13T04:00:00.000Z';
function harness(available = true, unpriced = false, areaHistory = '') {
  const require = createRequire(import.meta.url), ts = require('typescript');
  let ledger = domain.emptyLedger(), revision = 0, locked = false, cursor = 0, pausedFetch = false, pausedSave = false;
  const slots: any[] = [], effects: (() => void)[] = [], commands: any[] = []; const intervals = new Map<number,()=>void>(); let clockMillis = Date.parse(now), timerId = 0; let identifier = 0, cancelCount = 0;
  let resolveFetch: ((v: any) => void) | undefined, resolveAi: ((v: any) => void) | undefined, resolveSave: (() => void) | undefined;
  const catalog = ['Cơm', 'Phở', 'Bún'].map((name, i) => ({ id: ['rice', 'pho', 'bun'][i], name, price: String(30000 + i * 10000), portion: '1 phần · Quán test', mode: 'out' as const, address: 'Quận 10, TP.HCM', priceSource: 'https://food.be.com.vn/ho-chi-minh/dieu-lan-quan-chay-hoa-hung-26064', pricedAt: '2026-10-13', estimated: true, allergens: [] }));
  const react = { Fragment: 'Fragment', createElement: (type: any, props: any, ...children: any[]) => ({ type, props: { ...props, children } }), useState: (initial: any) => { const at = cursor++; if (!(at in slots)) slots[at] = typeof initial === 'function' ? initial() : initial; return [slots[at], (v: any) => { slots[at] = typeof v === 'function' ? v(slots[at]) : v; }]; }, useRef: (v: any) => { const at = cursor++; if (!(at in slots)) slots[at] = { current: v }; return slots[at]; }, useEffect: (fn: any, deps: any[]) => { const at = cursor++; const old = slots[at]; if (!old || deps.some((x, i) => !Object.is(x, old[i]))) { slots[at] = deps; effects.push(fn); } } };
  class Clock extends Date { constructor(v?: string) { super(v ?? now); } static now(){return clockMillis;} }
  const exports: any = {};
  runInNewContext(ts.transpileModule(readFileSync(new URL('../src/spending-roadmap-screen.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText, { exports, Date: Clock, Error, AbortController, setTimeout, clearTimeout, setInterval: (fn:()=>void) => {intervals.set(++timerId,fn);return timerId;}, clearInterval: (id:number) => {intervals.delete(id);}, require: (name: string) => {
    if (name === 'react') return react;
    if (name === 'react-native') return { Text: 'Text', View: 'View', Pressable: 'Pressable', ScrollView: 'ScrollView', Linking: { openURL: async () => {} }, Alert: { alert() {} }, AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } };
    if (name === 'expo-router') return { useNavigation: () => ({ dispatch() {} }) };
    if (name === 'expo-router/react-navigation') return { usePreventRemove() {} };
    if (name === './domain') return domain;
    if (name === './spending') return spending;
    if (name === './spending-roadmap') return roadmap;
    if (name === './spending-sources') return { loadOnlineMeals: async () => pausedFetch ? new Promise(resolve => { resolveFetch = resolve; }) : { meals: unpriced ? [] : catalog, warnings: [], venues: unpriced ? [{id:'osm-node-1',name:'Quán OSM không giá',address:'133 Hòa Hưng, Quận 10, TP.HCM',lat:10.78,lon:106.67,url:'https://www.openstreetmap.org/node/1',menuUrl:'https://restaurant.example/menu',...(areaHistory ? { areaHistory } : {})}] : [] } };
    if (name === './app-lock') return { useAppLock: () => ({ locked, covered: false, assertUnlocked: () => { if (locked) throw new Error('locked'); } }) };
    if (name === './store') return { newId: () => `roadmap-${++identifier}`, errorMessage: (e: any) => e.message, useLedger: () => ({ ledger, revision, execute: async (command: any, expected: number) => { if (pausedSave) await new Promise<void>(resolve => { resolveSave = resolve; }); if (locked || expected !== revision) throw new Error('stale/locked'); commands.push(command); ledger = domain.applyCommand(ledger, command, { now }); revision++; return { ledger, revision }; } }) };
    if (name === './ui') return { Button: 'Button', Card: 'Card', Choice: 'Choice', Icon: 'Icon', Field: 'Field', Page: 'Page', styles: {}, colors: {}, toggle: (a: string[], v: string) => a.includes(v) ? a.filter(x => x !== v) : [...a, v] };
    if (name === './spending-ai') return { SPENDING_MODEL: { name: 'Qwen3.5-2B', bytes: 1568476256 }, spendingAiAvailable: available, spendingAi: { state: { phase: 'ready', error: '' }, subscribe: () => () => {}, cancel: async () => { cancelCount++; }, infer: () => new Promise(resolve => { resolveAi = resolve; }) } };
    throw Error(name);
  } });
  const flatten = (v: any): any[] => Array.isArray(v) ? v.flatMap(flatten) : v && typeof v === 'object' ? [v, ...flatten(v.props?.children)] : [];
  const render = () => { cursor = 0; const tree = exports.RoadmapScreen(); while (effects.length) effects.shift()!(); return flatten(tree); };
  const node = (type: string, label: string) => { const value = render().find(v => v.type === type && (v.props.title === label || v.props.label === label || v.props.accessibilityLabel === label)); assert.ok(value, `${type}: ${label}`); return value; };
  const text = () => render().filter(v => v.type === 'Text').map(v => v.props.children.flat(Infinity).filter((x: any) => typeof x === 'string' || typeof x === 'number').join('')).join(' ');
  return { render, node, text, commands, timers:()=>intervals.size, tick:(seconds:number)=>{clockMillis+=seconds*1000; for(const fn of [...intervals.values()])fn();}, ledger: () => ledger, advance: () => { revision++; }, lock: () => { locked = true; }, pauseFetch: () => { pausedFetch = true; }, finishFetch: () => { assert.ok(resolveFetch); resolveFetch({ meals: catalog, warnings: [] }); }, finishAi: () => { assert.ok(resolveAi); resolveAi({ likedIds: ['m1'], excludedIds: [], excludedAllergens: [], frequency: [] }); }, pauseSave: () => { pausedSave = true; }, finishSave: () => { assert.ok(resolveSave); pausedSave = false; resolveSave(); }, cancellation: () => cancelCount };
}
const settle = async () => { for (let n = 0; n < 32; n++) await Promise.resolve(); };
async function create(h: ReturnType<typeof harness>) { h.node('Field', 'Mô tả roadmap').props.onChangeText('Quận 10, 2 ngày, 300k, 3 bữa/ngày, thích cơm'); h.node('Button', 'Tạo roadmap').props.onPress(); await settle(); h.finishAi(); await settle(); h.render(); }
test('roadmap imports only on reviewed save, displays one day and week, never creates an expense', async () => {
  const h = harness(); await create(h); assert.equal(h.commands.length, 0);
  assert.equal(h.render().filter(v => v.type === 'Button' && /^Đổi bữa/.test(v.props.title)).length, 3);
  h.node('Choice', 'Xem roadmap').props.onSelect('week'); assert.ok(h.text().includes('13/10') && h.text().includes('14/10'));
  h.node('Button', 'Lưu roadmap').props.onPress(); await settle(); assert.equal(h.commands.length, 1); assert.equal(h.commands[0].type, 'spending.roadmap.upsert'); assert.equal(h.ledger().transactions.length, 0);
});
test('late source and AI replies cannot replace a newer prompt or bypass live lock', async () => {
  for (const stage of ['source', 'ai', 'lock']) {
    const h = harness(); if (stage === 'source') h.pauseFetch();
    h.node('Field', 'Mô tả roadmap').props.onChangeText('Quận 10, 2 ngày, 300k, thích cơm'); h.node('Button', 'Tạo roadmap').props.onPress(); await settle();
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
  h.node('Button', 'Tạo roadmap').props.onPress(); await settle(); await settle();
  assert.equal(h.node('Button', 'Lưu roadmap').props.disabled, false); h.node('Button', 'Lưu roadmap').props.onPress(); await settle(); assert.equal(h.ledger().spending.plans[0].version, 2);
});

test('basic user prompt creates seven days without a model or optional preferences', async () => {
  const h = harness(false); h.node('Field','Mô tả roadmap').props.onChangeText('quận 10, 900k, 7 ngày'); h.node('Button','Tạo roadmap').props.onPress(); await settle();
  assert.equal(h.node('Button','Lưu roadmap').props.disabled,false); assert.ok(!h.text().includes('sở thích hợp lệ')); assert.equal(h.commands.length,0);
  h.node('Button','Lưu roadmap').props.onPress(); await settle(); assert.equal(h.ledger().spending.plans[0].meals.length,21); assert.equal(h.ledger().transactions.length,0);
});
test('generation waiting shows real source and AI stages, cancel retains the input and rejects late results', async () => {
  const h=harness(); h.pauseFetch(); const input='Quận 10, 7 ngày, 900k, thích cơm'; h.node('Field','Mô tả roadmap').props.onChangeText(input); h.node('Button','Tạo roadmap').props.onPress(); await settle();
  assert.match(h.text(),/Tìm quán và giá/); assert.match(h.text(),/Lên lịch/); assert.match(h.text(),/Kiểm tra ngân sách/); assert.match(h.text(),/Đã chờ/);const nodes=h.render();assert.ok(nodes.findIndex(v=>v.props.accessibilityLabel?.startsWith('Tìm quán và giá:'))<nodes.findIndex(v=>v.type==='Field'),'waiting and cancellation precede the editable prompt while generating'); assert.ok(!h.text().includes('%')); assert.equal(h.timers(),1);h.tick(12);assert.match(h.text(),/12/);
  h.finishFetch(); await settle(); assert.match(h.text(),/AI local/); h.node('Button','Hủy thao tác').props.onPress(); h.finishAi(); await settle();h.render();assert.equal(h.timers(),0);
  assert.equal(h.node('Field','Mô tả roadmap').props.value,input); assert.ok(!h.render().some(v=>v.type==='Button'&&v.props.title==='Lưu roadmap')); assert.equal(h.commands.length,0);
});

test('OSM venues remain visible when exact dish prices are absent and no fake plan or expense is created',async()=>{
 const h=harness(false,true);h.node('Field','Mô tả roadmap').props.onChangeText('Quận 10,900k,7 ngày');h.node('Button','Tạo roadmap').props.onPress();await settle();assert.match(h.text(),/Quán OSM không giá/);assert.match(h.text(),/Chưa có giá món/);assert.match(h.text(),/OpenStreetMap/);assert.equal(h.commands.length,0);assert.ok(!h.render().some(v=>v.type==='Button'&&v.props.title==='Lưu roadmap'));
 h.node('Field','Mô tả roadmap').props.onChangeText('Hà Nội,900k,7 ngày');assert.ok(!h.text().includes('Quán OSM không giá'),'old area venues cleared after prompt edit');
});

test('daily journey shows proposed meal times and real places without changing money or stored schema',async()=>{
 for(const [count,times] of [[1,['12:00']],[2,['12:00','18:30']],[3,['07:30','12:00','18:30']]] as const){
  const h=harness(false);h.node('Field','Mô tả roadmap').props.onChangeText(`Quận 10,900k,7 ngày,${count} bữa/ngày`);h.node('Button','Tạo roadmap').props.onPress();await settle();
  const text=h.text();assert.match(text,/Giờ dự kiến/);for(const time of times)assert.ok(text.includes(time),`missing proposed time ${time}`);assert.match(text,/Quận 10, TP.HCM/);assert.equal(h.commands.length,0);
  h.node('Button','Chi tiết bữa 1').props.onPress();assert.match(h.text(),/giờ mở cửa/i);assert.ok(h.render().some(v=>v.type==='Button'&&v.props.title==='Mở nguồn giá'));
  h.node('Choice','Xem roadmap').props.onSelect('week');for(const time of times.length===1?times:[times[0],times[times.length-1]])assert.ok(h.text().includes(time));
  h.node('Button','Lưu roadmap').props.onPress();await settle();const plan=h.ledger().spending.plans[0];assert.equal(plan.meals.length,7*count);assert.equal(h.ledger().transactions.length,0);assert.ok(plan.meals.every(slot=>!Object.hasOwn(slot,'time')),'suggested times are display only');
 }
});

test('historic area status remains clear even without prices and disappears after changing the requested area',async()=>{
 const h=harness(false,true,'Quận 10 (đến 2025-06-30)');h.node('Field','Mô tả roadmap').props.onChangeText('Quận 10,900k,7 ngày');h.node('Button','Tạo roadmap').props.onPress();await settle();
 assert.match(h.text(),/Khu vực cũ/);assert.match(h.text(),/Quận 10 \(đến 2025-06-30\)/);assert.match(h.text(),/Chưa có giá món/);assert.equal(h.commands.length,0);
 h.node('Field','Mô tả roadmap').props.onChangeText('Hà Nội,900k,7 ngày');assert.ok(!h.text().includes('Khu vực cũ'));assert.equal(h.ledger().transactions.length,0);
});
