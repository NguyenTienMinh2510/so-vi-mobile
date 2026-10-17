import * as thinkingModule from '../src/spending-thinking.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as domain from '../src/domain.ts';
import * as spending from '../src/spending.ts';
import * as roadmap from '../src/spending-roadmap.ts';
import * as venueTools from '../src/spending-venues.ts';
import * as estimates from '../src/spending-meal-estimates.ts';

const now = '2026-10-13T04:00:00.000Z';
function harness(available = true, actualDiscovery = false) {
  const require = createRequire(import.meta.url), ts = require('typescript');
  let ledger = domain.emptyLedger(), revision = 0, locked = false, cursor = 0, pausedFetch = false, pausedSave = false;
  let venueFailure = false, noVenues = false, pausedVenues = false; let resolveVenues: ((v: any) => void) | undefined; const maps: string[] = [];
  const venue = {key:'overture:test-1',id:'test-1',source:'overture',name:'Phở Bình',address:'Quận 10, TP.HCM',lat:10.77,lon:106.67,taxonomy:'{}',status:null,release:'2026-09-23.1',sources:'[]',licenses:'["CDLA-Permissive-2.0"]'};
  const loadVenues = async () => { if(venueFailure) throw Error('Thiếu database quán'); if(pausedVenues) return new Promise(resolve=>{resolveVenues=resolve;}); return noVenues ? [] : [venue]; };
  const discovered: any = {};
  runInNewContext(ts.transpileModule(readFileSync(new URL('../src/spending-discovery.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:discovered,Date,Error,require:(name:string)=> name.includes('domain')?domain:name.includes('spending-roadmap')?roadmap:name.includes('meal-estimates')?estimates:name.includes('venues-native')?{loadFoodVenues:loadVenues}:venueTools});
  const thinkCalls: any[] = [], thinkReplies: any[] = [];
  const slots: any[] = [], effects: (() => void)[] = [], commands: any[] = []; const intervals = new Map<number,()=>void>(); let clockMillis = Date.parse(now), timerId = 0; let identifier = 0, cancelCount = 0;
  let resolveFetch: ((v: any) => void) | undefined, resolveAi: ((v: any) => void) | undefined, resolveSave: (() => void) | undefined;
  const catalog = ['Cơm', 'Phở', 'Bún'].map((name, i) => ({ id: ['rice', 'pho', 'bun'][i], name, price: String(30000 + i * 10000), portion: '1 phần · Quán test', mode: 'out' as const, address: 'Quận 10, TP.HCM', priceSource: 'https://food.be.com.vn/ho-chi-minh/dieu-lan-quan-chay-hoa-hung-26064', pricedAt: '2026-10-13', estimated: true, allergens: [] }));
  const react = { Fragment: 'Fragment', createElement: (type: any, props: any, ...children: any[]) => ({ type, props: { ...props, children } }), useState: (initial: any) => { const at = cursor++; if (!(at in slots)) slots[at] = typeof initial === 'function' ? initial() : initial; return [slots[at], (v: any) => { slots[at] = typeof v === 'function' ? v(slots[at]) : v; }]; }, useRef: (v: any) => { const at = cursor++; if (!(at in slots)) slots[at] = { current: v }; return slots[at]; }, useEffect: (fn: any, deps: any[]) => { const at = cursor++; const old = slots[at]; if (!old || deps.some((x, i) => !Object.is(x, old[i]))) { slots[at] = deps; effects.push(fn); } } };
  class Clock extends Date { constructor(v?: string) { super(v ?? now); } static now(){return clockMillis;} }
  const exports: any = {};
  runInNewContext(ts.transpileModule(readFileSync(new URL('../src/spending-roadmap-screen.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText, { exports, Date: Clock, Error, AbortController, setTimeout, clearTimeout, setInterval: (fn:()=>void) => {intervals.set(++timerId,fn);return timerId;}, clearInterval: (id:number) => {intervals.delete(id);}, require: (name: string) => {
    if (name === 'react') return react;
    if (name === './dish-images') return { dishImage: (meal: any) => ({ dish: meal.id }) };
    if (name === 'react-native') return { Image: 'Image', Text: 'Text', View: 'View', Pressable: 'Pressable', ScrollView: 'ScrollView', Linking: { openURL: async (url: string) => { maps.push(url); } }, Alert: { alert() {} }, AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } };
    if (name === 'expo-router') return { useNavigation: () => ({ dispatch() {} }) };
    if (name === 'expo-router/react-navigation') return { usePreventRemove() {} };
    if (name === './domain') return domain;
    if (name === './spending') return spending;
    if (name === './spending-roadmap') return roadmap;
    if (name === './spending-thinking') return thinkingModule;
    if (name === './spending-venues') return venueTools;
    if (name === './spending-meal-estimates') return estimates;
    if (name === './spending-venues-native') return {loadFoodVenues:loadVenues};
    if (name === './spending-discovery') return { loadRoadmapMeals: async () => actualDiscovery ? discovered.loadRoadmapMeals('Quận 10, TP.HCM',new AbortController().signal) : pausedFetch ? new Promise(resolve => { resolveFetch = resolve; }) : { meals: catalog, warnings: [], venues: [] } };
    if (name === './app-lock') return { useAppLock: () => ({ locked, covered: false, assertUnlocked: () => { if (locked) throw new Error('locked'); } }) };
    if (name === './store') return { newId: () => `roadmap-${++identifier}`, errorMessage: (e: any) => e.message, useLedger: () => ({ ledger, revision, execute: async (command: any, expected: number) => { if (pausedSave) await new Promise<void>(resolve => { resolveSave = resolve; }); if (locked || expected !== revision) throw new Error('stale/locked'); commands.push(command); ledger = domain.applyCommand(ledger, command, { now }); revision++; return { ledger, revision }; } }) };
    if (name === './ui') return { Button: 'Button', Card: 'Card', Choice: 'Choice', Icon: 'Icon', Field: 'Field', Page: 'Page', styles: {}, colors: {}, toggle: (a: string[], v: string) => a.includes(v) ? a.filter(x => x !== v) : [...a, v] };
    if (name === './spending-ai') return { SPENDING_MODEL: { name: 'Qwen3.5-2B', bytes: 1568476256 }, spendingAiAvailable: available, spendingAi: { state: { phase: 'ready', error: '' }, subscribe: () => () => {}, cancel: async () => { cancelCount++; }, infer: () => new Promise(resolve => { resolveAi = resolve; }), think: async (request: any, aliases: any) => { thinkCalls.push({ request, aliases }); const reply = thinkReplies.shift(); if (!reply) throw new Error('no think reply'); return typeof reply === 'function' ? reply(request) : reply; } } };
    throw Error(name);
  } });
  const flatten = (v: any): any[] => Array.isArray(v) ? v.flatMap(flatten) : v && typeof v === 'object' ? [v, ...flatten(v.props?.children)] : [];
  const render = () => { cursor = 0; const tree = exports.RoadmapScreen(); while (effects.length) effects.shift()!(); return flatten(tree); };
  const node = (type: string, label: string) => { const value = render().find(v => v.type === type && (v.props.title === label || v.props.label === label || v.props.accessibilityLabel === label)); assert.ok(value, `${type}: ${label}`); return value; };
  const text = () => render().filter(v => v.type === 'Text').map(v => v.props.children.flat(Infinity).filter((x: any) => typeof x === 'string' || typeof x === 'number').join('')).join(' ');
  return { thinkCalls, queueThink: (...replies: any[]) => { thinkReplies.push(...replies); }, render, node, text, commands, maps, failVenues:()=>{venueFailure=true;}, recoverVenues:()=>{venueFailure=false;}, emptyVenues:()=>{noVenues=true;}, pauseVenues:()=>{pausedVenues=true;}, finishVenues:()=>{assert.ok(resolveVenues);pausedVenues=false;resolveVenues([venue]);}, timers:()=>intervals.size, tick:(seconds:number)=>{clockMillis+=seconds*1000; for(const fn of [...intervals.values()])fn();}, ledger: () => ledger, advance: () => { revision++; }, lock: () => { locked = true; }, pauseFetch: () => { pausedFetch = true; }, finishFetch: () => { assert.ok(resolveFetch); resolveFetch({ meals: catalog, warnings: [] }); }, finishAi: () => { assert.ok(resolveAi); resolveAi({ likedIds: ['m1'], excludedIds: [], excludedAllergens: [], frequency: [] }); }, pauseSave: () => { pausedSave = true; }, finishSave: () => { assert.ok(resolveSave); pausedSave = false; resolveSave(); }, cancellation: () => cancelCount };
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
  assert.match(h.text(),/Tìm quán và món dự trù/); assert.match(h.text(),/Lên lịch/); assert.match(h.text(),/Kiểm tra ngân sách/); assert.match(h.text(),/Đã chờ/);const nodes=h.render();assert.ok(nodes.findIndex(v=>v.props.accessibilityLabel?.startsWith('Tìm quán và món dự trù:'))<nodes.findIndex(v=>v.type==='Field'),'waiting and cancellation precede the editable prompt while generating'); assert.ok(!h.text().includes('%')); assert.equal(h.timers(),1);h.tick(12);assert.match(h.text(),/12/);
  h.finishFetch(); await settle(); assert.match(h.text(),/AI local/); h.node('Button','Hủy thao tác').props.onPress(); h.finishAi(); await settle();h.render();assert.equal(h.timers(),0);
  assert.equal(h.node('Field','Mô tả roadmap').props.value,input); assert.ok(!h.render().some(v=>v.type==='Button'&&v.props.title==='Lưu roadmap')); assert.equal(h.commands.length,0);
});

test('daily journey shows proposed meal times and real places without changing money or stored schema',async()=>{
 for(const [count,times] of [[1,['12:00']],[2,['12:00','18:30']],[3,['07:30','12:00','18:30']]] as const){
  const h=harness(false);h.node('Field','Mô tả roadmap').props.onChangeText(`Quận 10,900k,7 ngày,${count} bữa/ngày`);h.node('Button','Tạo roadmap').props.onPress();await settle();
  const text=h.text();assert.match(text,/Giờ dự kiến/);for(const time of times)assert.ok(text.includes(time),`missing proposed time ${time}`);assert.match(text,/Quận 10, TP.HCM/);assert.equal(h.commands.length,0);
  h.node('Button','Chi tiết bữa 1').props.onPress();await settle();assert.match(h.text(),/giờ mở cửa/i);assert.ok(h.render().some(v=>v.type==='Button'&&v.props.title==='Mở nguồn giá'));
  h.node('Choice','Xem roadmap').props.onSelect('week');for(const time of times.length===1?times:[times[0],times[times.length-1]])assert.ok(h.text().includes(time));
  h.node('Button','Lưu roadmap').props.onPress();await settle();const plan=h.ledger().spending.plans[0];assert.equal(plan.meals.length,7*count);assert.equal(h.ledger().transactions.length,0);assert.ok(plan.meals.every(slot=>!Object.hasOwn(slot,'time')),'suggested times are display only');
 }
});

test('real discovery generates estimates without menu evidence and meal detail retrieves venues then opens Maps',async()=>{
 const h=harness(false,true);h.node('Field','Mô tả roadmap').props.onChangeText('Quận 10,900k,7 ngày');h.node('Button','Tạo roadmap').props.onPress();await settle();
 assert.ok(h.node('Button','Lưu roadmap'));assert.equal(h.commands.length,0);
 h.node('Button','Chi tiết bữa 1').props.onPress();await settle();assert.match(h.text(),/Phở Bình/);assert.match(h.text(),/Gợi ý cần xác minh/);assert.match(h.text(),/chưa xác minh giá tại quán/);assert.ok(!h.text().includes('đang mở cửa'));
 h.node('Button','Mở Google Maps').props.onPress();await settle();assert.equal(h.maps.length,1);assert.equal(new URL(h.maps[0]).origin,'https://www.google.com');assert.ok(!h.maps[0].includes('place_id'));
 h.node('Button','Lưu roadmap').props.onPress();await settle();assert.equal(h.ledger().transactions.length,0);
 h.node('Pressable','Kế hoạch đã lưu & phạm vi chi').props.onPress();h.node('Choice','Mở roadmap đã lưu').props.onSelect(h.ledger().spending.plans[0].config.id);await settle();assert.match(h.text(),/Đã lưu/);assert.equal(h.ledger().transactions.length,0);
});
test('meal candidates show loading, empty search, database error and retry without losing a plan',async()=>{
 const h=harness(false,true);h.node('Field','Mô tả roadmap').props.onChangeText('Quận 10,900k,7 ngày');h.node('Button','Tạo roadmap').props.onPress();await settle();
 h.pauseVenues();h.node('Button','Chi tiết bữa 1').props.onPress();assert.match(h.text(),/Đang tìm quán trong kho/);h.finishVenues();await settle();
 h.node('Button','Chi tiết bữa 1').props.onPress();h.failVenues();h.node('Button','Chi tiết bữa 1').props.onPress();await settle();assert.match(h.text(),/Thiếu database/);
 h.recoverVenues();h.emptyVenues();h.node('Button','Thử tìm quán lại').props.onPress();await settle();assert.match(h.text(),/Chưa có quán khớp/);assert.ok(h.render().some(v=>v.type==='Button'&&v.props.title.startsWith('Tìm ')&&v.props.title.endsWith('trên Google Maps')));assert.equal(h.commands.length,0);
});
test('missing food database still permits an honest estimate-only plan and no expense',async()=>{
 const h=harness(false,true);h.failVenues();h.node('Field','Mô tả roadmap').props.onChangeText('Quận 10,900k,7 ngày');h.node('Button','Tạo roadmap').props.onPress();await settle();assert.match(h.text(),/Thiếu database/);assert.ok(h.node('Button','Lưu roadmap'));assert.equal(h.ledger().transactions.length,0);
});
test('cancelled meal lookup cannot append late venues and exposes retry',async()=>{
 const h=harness(false,true);h.node('Field','Mô tả roadmap').props.onChangeText('Quận 10,900k,7 ngày');h.node('Button','Tạo roadmap').props.onPress();await settle();h.pauseVenues();h.node('Button','Chi tiết bữa 1').props.onPress();h.node('Button','Hủy thao tác').props.onPress();h.finishVenues();await settle();assert.ok(!h.text().includes('Phở Bình'));assert.ok(h.node('Button','Tìm quán cho món này'));assert.equal(h.commands.length,0);
});

const thinkPrompt = async (h: ReturnType<typeof harness>, prompt: string) => { h.node('Field', 'Mô tả roadmap').props.onChangeText(prompt); h.node('Choice', 'Cách AI làm việc').props.onSelect('think'); h.render(); h.node('Button', 'Tạo roadmap').props.onPress(); await settle(); await settle(); h.render(); };
const cookAlias = (request: any) => request.menu.find((m: any) => m.cook && !m.breakfast).id;
test('thinking mode lets AI choose home cooking for a low budget, exact planner verifies and shows its tips', async () => {
  const h = harness(true, true);
  h.queueThink((request: any) => ({ preferences: { likedIds: [cookAlias(request)], excludedIds: [], excludedAllergens: [], frequency: [] }, allowCooking: true, tips: ['Nấu nồi thịt kho ăn 3 bữa tối.'], reasoning: '19k mỗi bữa thì ăn ngoài không đủ.' }));
  await thinkPrompt(h, 'Quận 10, 7 ngày, 400k, 3 bữa/ngày, tự nấu được');
  const call = h.thinkCalls[0].request; assert.equal(call.cooking, 'allow'); assert.equal(call.menu.length, 30); assert.equal(call.days, 7); assert.equal(call.budget, '400000');
  assert.ok(call.menu.some((m: any) => m.cook) && call.menu.every((m: any, i: number) => m.id === `m${i + 1}`));
  const text = h.text(); assert.match(text, /AI đã suy nghĩ/); assert.match(text, /Nấu nồi thịt kho/); assert.match(text, /Có dùng món tự nấu/);
  h.node('Pressable', 'Quá trình suy nghĩ của AI').props.onPress(); assert.match(h.text(), /19k mỗi bữa/);
  assert.ok(h.render().some(v => v.type === 'Text' && /tự nấu/.test(String(v.props.children))));
  assert.equal(h.commands.length, 0); assert.equal(h.ledger().transactions.length, 0);
});
test('thinking mode retries once with planner feedback and never keeps an infeasible proposal', async () => {
  const h = harness(true, true);
  const greedy = (request: any) => ({ preferences: { likedIds: [], excludedIds: [], excludedAllergens: [], frequency: [{ mealId: request.menu.find((m: any) => m.name === 'Bún đậu mắm tôm').id, min: 14, max: 21 }] }, allowCooking: false, tips: [], reasoning: '' });
  h.queueThink(greedy, (request: any) => ({ preferences: { likedIds: [], excludedIds: [], excludedAllergens: [], frequency: [] }, allowCooking: true, tips: ['Giảm món đắt.'], reasoning: '' }));
  await thinkPrompt(h, 'Quận 10, 7 ngày, 400k, 3 bữa/ngày');
  assert.equal(h.thinkCalls.length, 2); assert.equal(h.thinkCalls[0].request.cooking, 'unspecified'); assert.match(h.thinkCalls[1].request.feedback, /Bộ tính/);
  assert.match(h.text(), /sửa một lần/);
  const fail = harness(true, true); fail.queueThink(greedy, greedy); await thinkPrompt(fail, 'Quận 10, 7 ngày, 400k, 3 bữa/ngày');
  assert.equal(fail.thinkCalls.length, 2); assert.match(fail.text(), /Chưa tìm được phương án/); assert.doesNotMatch(fail.text(), /AI đã suy nghĩ/);
});
test('“không nấu” removes cooked dishes from thinking and fast mode explains a too-small eat-out budget', async () => {
  const h = harness(true, true);
  h.queueThink({ preferences: { likedIds: [], excludedIds: [], excludedAllergens: [], frequency: [] }, allowCooking: false, tips: [], reasoning: '' });
  await thinkPrompt(h, 'Quận 10, 2 ngày, 300k, 3 bữa/ngày, không nấu');
  assert.equal(h.thinkCalls[0].request.cooking, 'deny'); assert.ok(h.thinkCalls[0].request.menu.every((m: any) => !m.cook));
  const fast = harness(true, true); fast.node('Field', 'Mô tả roadmap').props.onChangeText('Quận 10, 7 ngày, 300k, 3 bữa/ngày'); fast.node('Button', 'Tạo roadmap').props.onPress(); await settle(); await settle();
  assert.match(fast.text(), /chưa đủ cho 21 bữa ăn ngoài/); assert.match(fast.text(), /tự nấu được/);
  const cook = harness(true, true); cook.node('Field', 'Mô tả roadmap').props.onChangeText('Quận 10, 7 ngày, 300k, 3 bữa/ngày, tự nấu được'); cook.node('Button', 'Tạo roadmap').props.onPress(); await settle(); await settle();
  assert.doesNotMatch(cook.text(), /chưa đủ/); assert.ok(cook.render().some(v => v.type === 'Text' && /\(tự nấu\)/.test(String(v.props.children))));
});
test('thinking that runs out of phone time falls back to the fast planner and says so', async () => {
  const h = harness(true, true); h.queueThink(() => { throw new Error(`${thinkingModule.THINKING_INCOMPLETE} Bản nháp được giữ.`); });
  await thinkPrompt(h, 'Quận 10, 2 ngày, 300k, 3 bữa/ngày');
  assert.equal(h.thinkCalls.length, 1); const text = h.text();
  assert.match(text, /dùng chế độ nhanh/); assert.doesNotMatch(text, /AI đã suy nghĩ/); assert.ok(h.render().some(v => v.type === 'Button' && /^Đổi bữa/.test(v.props.title)));
  const other = harness(true, true); other.queueThink(() => { throw new Error('Đã hủy AI. Bản nháp được giữ.'); });
  await thinkPrompt(other, 'Quận 10, 2 ngày, 300k, 3 bữa/ngày'); assert.match(other.text(), /Đã hủy AI/); assert.doesNotMatch(other.text(), /lịch này dùng chế độ nhanh/);
});
test('every meal card shows its own dish picture instead of a generic emoji', async () => {
  const h = harness(true, true); h.node('Field', 'Mô tả roadmap').props.onChangeText('Quận 10, 2 ngày, 300k, 3 bữa/ngày'); h.node('Button', 'Tạo roadmap').props.onPress(); await settle(); await settle();
  const pictures = h.render().filter(v => v.type === 'Image'); assert.equal(pictures.length, 3); assert.ok(pictures.every(v => /^roadmap-estimate-/.test(v.props.source.dish) && v.props.accessible === false));
  assert.doesNotMatch(h.text(), /[🥖🍚🍗🍜🍽]/u);
});
