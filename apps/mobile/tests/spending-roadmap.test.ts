import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoadmapPrompt, parseRoadmapPreferencesOffline, normalizeRoadmapText, roadmapAiCatalog, matchCatalogDishes, reviewRoadmapPreferences, roadmapAiAliases, restoreRoadmapAiPreferences, roadmapAreaMatches } from '../src/spending-roadmap.ts';
import { parseOnlineMenu, loadPublishedMeals } from '../src/spending-sources.ts';
import { applyCommand, emptyLedger } from '../src/domain.ts';
import { planSpending } from '../src/spending.ts';

const day = '2026-10-13', now = `${day}T04:00:00.000Z`;
const source = 'https://food.be.com.vn/ho-chi-minh/dieu-lan-quan-chay-hoa-hung-26064';
const html = (address = '133 Hòa Hưng, Quận 10, Hồ Chí Minh', currency = 'VND') => `<script type="application/ld+json">${JSON.stringify({ '@type': 'Restaurant', name: 'Quán kiểm thử', url: source, address: { streetAddress: address }, menu: { '@type': 'Menu', hasMenuSection: [{ '@type': 'MenuSection', hasMenuItem: [{ '@type': 'MenuItem', name: 'Phở chay', offers: { '@type': 'Offer', price: '40000', priceCurrency: currency } }] }] } })}</script><article><h4>Phở chay</h4><data value="40000">40.000 ₫</data></article><article><h4>Phở chay</h4><data value="40000">40.000 ₫</data></article><article><h4>Cơm &amp; rau</h4><data value="45000">45.000 ₫</data></article><article><h4>Giá thiếu</h4></article><article><h4>Giá sai</h4><data value="-1">-1 ₫</data></article><article><h4>Giá miễn phí</h4><data value="0">0 ₫</data></article>`;

test('roadmap prompt converts VND units exactly and keeps preferences for local AI', () => {
  const p = parseRoadmapPrompt('Quận 10, 7 ngày, ngân sách 1,2 triệu, dự phòng 100k, 2 bữa/ngày, thích cơm, không ăn phở', day);
  assert.equal(p.budget, '1200000'); assert.equal(p.reserve, '100000'); assert.equal(p.days, 7); assert.equal(p.mealsPerDay, 2);
  assert.equal(p.startDay, day); assert.equal(p.endDay, '2026-10-19'); assert.match(p.preferenceText, /không ăn phở/);
  assert.equal(parseRoadmapPrompt('Quận 10, 31 ngày, 900.000 VND, bắt đầu 2026-12-20', day).endDay, '2027-01-19');
  assert.equal(parseRoadmapPrompt('Quận 10, 7 ngày, 900k, 3 bữa/ngày', day).budget, '900000');
});
test('roadmap prompt rejects unsupported area, malformed/ambiguous finance or calendar instead of inventing it', () => {
  for (const value of ['Quận 10, 1.5 ngày, 900k', 'Quận 10, 7 ngày, 1.5 bữa/ngày, 900k', 'Quận 10, 32 ngày, 900k', 'Quận 10, 7 ngày', 'Quận 10, 7 ngày, 900k hoặc 1 triệu', 'Quận 10, 7 ngày, -900k', 'Quận 10, 7 ngày, 900k, 4 bữa/ngày', 'Quận 10, 7 ngày, 900k, bắt đầu 2026-02-30']) assert.throws(() => parseRoadmapPrompt(value, day), value);
});
test('source menu reads actual public fields, deduplicates and preserves provenance without executing markup', () => {
  const meals = parseOnlineMenu(html(), source, day);
  assert.equal(meals.length, 2); assert.equal(meals[0].price, '40000'); assert.equal(meals[1].name, 'Cơm & rau');
  assert.ok(meals.every(m => m.priceSource === source && m.pricedAt === day && m.estimated && m.address.includes('Quận 10')));
  assert.deepEqual(parseOnlineMenu(html(), source, day).map(m => m.id), meals.map(m => m.id));
  assert.ok(meals.every(m => m.allergens.length === 0));
});
test('source boundary rejects foreign endpoints, wrong area/currency, malformed structured data and oversize content', () => {
  for (const [body, url] of [[html(), 'https://evil.test/menu'], [html('Quận 1, Hồ Chí Minh'), source], [html(undefined, 'USD'), source], ['<script type="application/ld+json">{not JSON}</script>', source], ['x'.repeat(2 * 1024 * 1024 + 1), source]]) assert.throws(() => parseOnlineMenu(body!, url!, day, 'Quận 10, TP.HCM'));
});
test('public source loading returns partial success and never sends the prompt or ledger', async () => {
  const original = globalThis.fetch, requests: string[] = [];
  try {
    globalThis.fetch = async (url: any) => { requests.push(String(url)); if (requests.length > 1) throw new Error('offline'); return { ok: true, status: 200, url: String(url), text: async () => html() } as any; };
    const result = await loadPublishedMeals('Quận 10, TP.HCM', new AbortController().signal);
    assert.equal(result.meals.length, 2); assert.ok(result.warnings.length); assert.ok(requests.length <= 3);
    assert.ok(requests.every(x => x.startsWith('https://food.be.com.vn/ho-chi-minh/') && !x.includes('?')));
  } finally { globalThis.fetch = original; }
});
test('source cancellation is propagated; no subsequent requests, no invented fallback price', async () => {
  const controller = new AbortController(); controller.abort(); const original = globalThis.fetch; let calls = 0;
  try { globalThis.fetch = async () => { calls++; throw Error('should not fetch'); }; await assert.rejects(loadPublishedMeals('Quận 10, TP.HCM', controller.signal)); assert.equal(calls, 0); }
  finally { globalThis.fetch = original; }
});
test('online roadmap save atomically merges catalogue+plan with idempotency, preserves financial data and rejects stale/deficit', () => {
  const s = emptyLedger(), catalog = parseOnlineMenu(html(), source, day);
  const config = { id: 'roadmap-test', name: 'Quận 10', startDay: day, endDay: day, timezone: s.settings.timezone, budget: '200000', reserve: '10000', walletIds: [], categoryIds: [], mealsPerDay: 2, allowCooking: false, fixed: [] };
  const plan = planSpending(s, config, catalog, s.spending.preferences, now);
  const command = { type: 'spending.roadmap.upsert', mutationId: 'roadmap-save', payload: { catalog, plan, expectedVersion: null } } as const;
  const saved = applyCommand(s, command, { now }); assert.equal(saved.spending.plans.length, 1); assert.equal(saved.spending.catalog.length, 2); assert.deepEqual(saved.transactions, s.transactions);
  assert.equal(s.spending.catalog.length, 0); assert.equal(applyCommand(saved, command, { now }), saved);
  assert.throws(() => applyCommand(saved, { ...command, mutationId: 'stale-save' }, { now }));
  assert.throws(() => applyCommand(s, { ...command, payload: { ...command.payload, plan: { ...plan, config: { ...config, budget: '1' } } } }, { now }));
  assert.throws(() => applyCommand(s, { ...command, payload: { ...command.payload, catalog: [catalog[0], catalog[0]] } }, { now })); assert.equal(s.spending.plans.length, 0);
});
test('unknown ingredients cannot satisfy allergen exclusions in an online roadmap save', () => {
  const s = emptyLedger(), catalog = parseOnlineMenu(html(), source, day);
  const config = { id: 'allergy-roadmap', name: 'Quận 10', startDay: day, endDay: day, timezone: s.settings.timezone, budget: '200000', reserve: '0', walletIds: [], categoryIds: [], mealsPerDay: 1, allowCooking: false, fixed: [] };
  const plan = planSpending(s, config, catalog, s.spending.preferences, now); plan.preferences.excludedAllergens = ['lạc'];
  assert.throws(() => applyCommand(s, { type: 'spending.roadmap.upsert', mutationId: 'allergy-save', payload: { catalog, plan, expectedVersion: null } }, { now })); assert.equal(s.spending.plans.length, 0);
});
test('local AI must not reinterpret a daily/monthly food frequency as weekly', () => {
  const catalog = parseOnlineMenu(html(), source, day).map((meal, i) => i === 0 ? { ...meal, name: 'Phở' } : meal), preferences = { likedIds: [], excludedIds: [], excludedAllergens: [], frequency: [{ mealId: catalog[0].id, min: 2, max: 2 }] };
  assert.equal(reviewRoadmapPreferences('Phở đúng 2 lần mỗi 7 ngày', preferences, catalog), preferences);
  for (const period of ['mỗi ngày', 'mỗi tháng', '/ngày', 'mỗi năm']) assert.throws(() => reviewRoadmapPreferences(`Phở đúng 2 lần ${period}`, preferences, catalog));
});
test('short inference aliases restore exact stable source identities and reject invented or conflicting selections', () => {
  const catalog = parseOnlineMenu(html(), source, day), aliases = roadmapAiAliases(catalog);
  assert.deepEqual(aliases.map(m => m.id), ['m1', 'm2']); assert.deepEqual(aliases.map(m => m.name), catalog.map(m => m.name));
  const restored = restoreRoadmapAiPreferences({ likedIds: ['m2'], excludedIds: ['m1'], excludedAllergens: [], frequency: [] }, catalog);
  assert.deepEqual(restored.likedIds, [catalog[1].id]); assert.deepEqual(restored.excludedIds, [catalog[0].id]);
  assert.throws(() => restoreRoadmapAiPreferences({ likedIds: ['m7'], excludedIds: [], excludedAllergens: [], frequency: [] }, catalog));
  assert.throws(() => restoreRoadmapAiPreferences({ likedIds: ['m1'], excludedIds: ['m1'], excludedAllergens: [], frequency: [] }, catalog));
  assert.equal(catalog[0].priceSource, source);
});

test('Vietnam roadmap areas are preserved instead of silently selecting district ten', () => {
 for(const area of ['Quận 1, TP.HCM','Hà Nội','Cần Thơ','Vinh','Huế','Đà Nẵng','Ninh Kiều, Cần Thơ']) {const p=parseRoadmapPrompt(`${area}, 7 ngày, 900k`,day);assert.ok(!p.area.includes('Quận 10'));assert.equal(p.preferenceText,'');assert.equal(p.budget,'900000');}
 assert.match(parseRoadmapPrompt('quận 10, 900k, 7 ngày',day).area,/Quận 10/);
 assert.throws(()=>parseRoadmapPrompt('900k, 7 ngày',day));
});
test('public menu supports another requested Vietnamese area but retains endpoint, location and price boundaries',()=>{
 const q1='https://food.be.com.vn/ho-chi-minh/quan-an-co-nam-nguyen-trai-8197';const menu=parseOnlineMenu(html('212B Nguyễn Trãi, Quận 1, Hồ Chí Minh'),q1,day,'Quận 1, TP.HCM'); assert.equal(menu[0].price,'40000');assert.equal(menu[0].priceSource,q1);
 assert.throws(()=>parseOnlineMenu(html('Quận 10, Hồ Chí Minh'),q1,day,'Quận 1, TP.HCM'));
 for(const url of ['http://food.be.com.vn/ho-chi-minh/test-1','https://food.be.com.vn.evil.test/ho-chi-minh/test-1','https://user@food.be.com.vn/ho-chi-minh/test-1','https://food.be.com.vn/api/test-1','https://food.be.com.vn/ho-chi-minh/test-1?dish=x'])assert.throws(()=>parseOnlineMenu(html(),url,day,'Quận 10, TP.HCM'));
});
test('source discovers address-matched restaurants from public directory links, not a district-ten fallback',async()=>{
 const original=globalThis.fetch,requests:string[]=[];const q1='https://food.be.com.vn/ho-chi-minh/quan-an-co-nam-nguyen-trai-8197';
 try{globalThis.fetch=async(url:any)=>{requests.push(String(url));const body=String(url)===q1?html('212B Nguyễn Trãi, Quận 1, Hồ Chí Minh'):`<a href="${q1}">Quán Cô Năm</a><a href="${q1}">212B Nguyễn Trãi, Quận 1, Hồ Chí Minh</a><a href="https://evil.test/menu">Quận 1</a>`;return{ok:true,status:200,url:String(url),text:async()=>body}as any};
 const r=await loadPublishedMeals('Quận 1, TP.HCM',new AbortController().signal);assert.ok(r.meals.length);assert.ok(r.meals.every(m=>m.priceSource===q1));assert.ok(requests.length<=7);assert.ok(!requests.includes(source));assert.ok(r.warnings.some(w=>/một phần|không.*tất cả|chưa.*toàn/i.test(w)));
 }finally{globalThis.fetch=original;}
});
test('an area without verified dish prices reports missing data without synthesizing or mixing another area',async()=>{
 const original=globalThis.fetch;try{globalThis.fetch=async(url:any)=>({ok:true,status:200,url:String(url),text:async()=>'<a href="/ha-noi">Hà Nội</a><a href="/ho-chi-minh">Hồ Chí Minh</a>'}as any);await assert.rejects(loadPublishedMeals('Ninh Kiều, Cần Thơ',new AbortController().signal),/chưa|Chưa|giá/);}finally{globalThis.fetch=original;}
});

test('numeric street addresses cannot satisfy a different requested district',()=>{
 const address='1 Hòa Hưng, Quận 10, Hồ Chí Minh';assert.equal(roadmapAreaMatches('Quận 1, TP.HCM',address),false);
 assert.throws(()=>parseOnlineMenu(html(address),'https://food.be.com.vn/ho-chi-minh/test-1',day,'Quận 1, TP.HCM'));
 assert.equal(roadmapAreaMatches('Quận 10, TP.HCM',address),true);assert.equal(roadmapAreaMatches('Huế','123 Phố Huế, Hà Nội'),false);assert.equal(roadmapAreaMatches('Hà Nội','8 Đường Hà Nội, Quận 1, TP.HCM'),false);
 assert.equal(roadmapAreaMatches('Ninh Kiều, Cần Thơ','Ninh, Kiều xóm, Cần Thơ'),false);
});
test('unaccented and compact basic prompts separate area and numeric settings without optional preference residue',()=>{
 for(const prompt of ['Quận 10,900k,7 ngày','Quan 10,900k,7 ngay','Hà Nội,7 ngay,900k','Quận 10, 1,2 trieu, 7 ngay','Quận 10, 7 ngay, ngan sach 900k, 3 bua/ngay']){const p=parseRoadmapPrompt(prompt,day);assert.equal(p.days,7);assert.equal(p.preferenceText,'');assert.ok(!/ngay|bua|trieu|900k/i.test(p.area));}
});

test('existing exclusions and hard food clauses remain preferences instead of becoming geography',()=>{
 for(const cue of ['bỏ món phở','loại trừ phở','bo mon pho','loai tru pho','chỉ ăn cơm','chi an com']){const p=parseRoadmapPrompt(`Quận 10,900k,7 ngày,${cue}`,day);assert.equal(p.area,'Quận 10, TP.HCM');assert.equal(p.preferenceText,cue);}
 const catalogue=parseOnlineMenu(html(),source,day);assert.throws(()=>reviewRoadmapPreferences('chỉ ăn cơm',{likedIds:[],excludedIds:[],excludedAllergens:[],frequency:[]},catalogue));
});

test('pronouns share normalization for shortlist, review and calculator without changing ordinary names', () => {
  const template = parseOnlineMenu(html(), source, day)[0];
  const catalog = Array.from({ length: 10 }, (_, i) => ({ ...template, id: `dish-${i}`, name: i === 8 ? 'Phở' : i === 9 ? 'Bún bò' : `Món ${i}` }));
  const text = 'mình thích phở, em không ăn bún bò', proposed = { likedIds: ['dish-8'], excludedIds: ['dish-9'], excludedAllergens: [], frequency: [] };
  const shortlist = roadmapAiCatalog(text, catalog); assert.equal(shortlist.length, 8); assert.ok(shortlist.some(m => m.id === 'dish-8')); assert.ok(shortlist.some(m => m.id === 'dish-9'));
  assert.equal(reviewRoadmapPreferences(text, proposed, catalog), proposed);
  for (const subject of ['mình', 'em', 'tôi', 'tui', 'anh', 'chị']) {
    const preference = `${subject} thích phở`;
    assert.equal(normalizeRoadmapText(preference, true), 'thich pho');
    assert.ok(roadmapAiCatalog(preference, catalog).some(m => m.id === 'dish-8'));
    reviewRoadmapPreferences(preference, { ...proposed, excludedIds: [] }, catalog);
    reviewRoadmapPreferences(`${subject} không ăn bún bò`, { ...proposed, likedIds: [] }, catalog);
    assert.throws(() => reviewRoadmapPreferences(preference, { ...proposed, likedIds: [], excludedIds: [] }, catalog), /giữ món/);
  }
  assert.equal(normalizeRoadmapText('Mình thích phở'), 'minh thich pho'); assert.equal(normalizeRoadmapText('Chị Hồng', true), 'chi hong');
  const full = catalog.slice(0, 8).map(m => `tui thích ${m.name}`).join(', ');
  assert.equal(roadmapAiCatalog(full, catalog).length, 8);
  assert.throws(() => roadmapAiCatalog(`${full}, anh thích phở`, catalog), /hơn 8 món/);
  const manyPho = catalog.map((m, i) => ({ ...m, name: `Phở loại ${i}` }));
  assert.equal(roadmapAiCatalog('chị thích phở', manyPho).length, 8);
});

test('offline calculator accepts each supported subject through the shared helper', () => {
  const catalog = [{ ...parseOnlineMenu(html(), source, day)[0], name: 'Phở' }];
  for (const subject of ['mình', 'em', 'tôi', 'tui', 'anh', 'chị']) {
    assert.deepEqual(parseRoadmapPreferencesOffline(`${subject} thích phở`, catalog)?.likedIds, [catalog[0].id]);
  }
});

test('broad likes truncate to eight and review accepts any retained liked dish', () => {
  const template = parseOnlineMenu(html(), source, day)[0];
  const catalog = Array.from({ length: 12 }, (_, i) => ({ ...template, id: `bun-${i}`, name: `Bún loại ${i}` }));
  const shortlist = roadmapAiCatalog('mình thích bún', catalog);
  assert.equal(shortlist.length, 8); assert.ok(shortlist.every(m => m.name.startsWith('Bún')));
  for (const meal of shortlist) {
    const proposed = { likedIds: [meal.id], excludedIds: [], excludedAllergens: [], frequency: [] };
    assert.equal(reviewRoadmapPreferences('mình thích bún', proposed, catalog), proposed);
  }
});

test('mandatory dishes precede likes while each liked clause keeps a representative', () => {
  const template = parseOnlineMenu(html(), source, day)[0];
  const catalog = Array.from({ length: 12 }, (_, i) => ({ ...template, id: `dish-${i}`, name: i < 9 ? `Bún loại ${i}` : i === 9 ? 'Phở' : i === 10 ? 'Xôi' : 'Cơm' }));
  const text = 'thích bún, thích phở, không ăn xôi, cơm đúng 2 lần mỗi tuần';
  const shortlist = roadmapAiCatalog(text, catalog);
  assert.equal(shortlist.length, 8); assert.deepEqual(shortlist.slice(0, 2).map(m => m.id), ['dish-10', 'dish-11']);
  assert.ok(shortlist.some(m => m.name.startsWith('Bún'))); assert.ok(shortlist.some(m => m.name === 'Phở'));
  const proposed = { likedIds: [shortlist.find(m => m.name.startsWith('Bún'))!.id, 'dish-9'], excludedIds: ['dish-10'], excludedAllergens: [], frequency: [{ mealId: 'dish-11', min: 2, max: 2 }] };
  assert.equal(reviewRoadmapPreferences(text, proposed, catalog), proposed);
});

test('exclusion or frequency matching more than eight dishes still rejects', () => {
  const template = parseOnlineMenu(html(), source, day)[0];
  const catalog = Array.from({ length: 9 }, (_, i) => ({ ...template, id: `bun-${i}`, name: `Bún loại ${i}` }));
  for (const text of ['không ăn bún', 'bún đúng 2 lần mỗi tuần']) assert.throws(() => roadmapAiCatalog(text, catalog), /hơn 8 món/);
});
