import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoadmapPrompt, reviewRoadmapPreferences, roadmapAiAliases, restoreRoadmapAiPreferences } from '../src/spending-roadmap.ts';
import { parseOnlineMenu, loadOnlineMeals } from '../src/spending-sources.ts';
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
  for (const value of ['Quận 1, 7 ngày, 900k', 'Hà Nội, 7 ngày, 900k', 'Vinh, 7 ngày, 900k', 'Quận 10, 1.5 ngày, 900k', 'Quận 10, 7 ngày, 1.5 bữa/ngày, 900k', 'Quận 10, 32 ngày, 900k', 'Quận 10, 7 ngày', 'Quận 10, 7 ngày, 900k hoặc 1 triệu', 'Quận 10, 7 ngày, -900k', 'Quận 10, 7 ngày, 900k, 4 bữa/ngày', 'Quận 10, 7 ngày, 900k, bắt đầu 2026-02-30']) assert.throws(() => parseRoadmapPrompt(value, day), value);
});
test('source menu reads actual public fields, deduplicates and preserves provenance without executing markup', () => {
  const meals = parseOnlineMenu(html(), source, day);
  assert.equal(meals.length, 2); assert.equal(meals[0].price, '40000'); assert.equal(meals[1].name, 'Cơm & rau');
  assert.ok(meals.every(m => m.priceSource === source && m.pricedAt === day && m.estimated && m.address.includes('Quận 10')));
  assert.deepEqual(parseOnlineMenu(html(), source, day).map(m => m.id), meals.map(m => m.id));
  assert.ok(meals.every(m => m.allergens.length === 0));
});
test('source boundary rejects foreign endpoints, wrong area/currency, malformed structured data and oversize content', () => {
  for (const [body, url] of [[html(), 'https://evil.test/menu'], [html('Quận 1, Hồ Chí Minh'), source], [html(undefined, 'USD'), source], ['<script type="application/ld+json">{not JSON}</script>', source], ['x'.repeat(2 * 1024 * 1024 + 1), source]]) assert.throws(() => parseOnlineMenu(body!, url!, day));
});
test('public source loading returns partial success and never sends the prompt or ledger', async () => {
  const original = globalThis.fetch, requests: string[] = [];
  try {
    globalThis.fetch = async (url: any) => { requests.push(String(url)); if (requests.length > 1) throw new Error('offline'); return { ok: true, status: 200, url: String(url), text: async () => html() } as any; };
    const result = await loadOnlineMeals('Quận 10, TP.HCM', new AbortController().signal);
    assert.equal(result.meals.length, 2); assert.ok(result.warnings.length); assert.ok(requests.length <= 3);
    assert.ok(requests.every(x => x.startsWith('https://food.be.com.vn/ho-chi-minh/') && !x.includes('?')));
  } finally { globalThis.fetch = original; }
});
test('source cancellation is propagated; no subsequent requests, no invented fallback price', async () => {
  const controller = new AbortController(); controller.abort(); const original = globalThis.fetch; let calls = 0;
  try { globalThis.fetch = async () => { calls++; throw Error('should not fetch'); }; await assert.rejects(loadOnlineMeals('Quận 10, TP.HCM', controller.signal)); assert.equal(calls, 0); }
  finally { globalThis.fetch = original; }
});
test('online roadmap save atomically merges catalogue+plan with idempotency, preserves financial data and rejects stale/deficit', () => {
  const s = emptyLedger(), catalog = parseOnlineMenu(html(), source, day);
  const config = { id: 'roadmap-test', name: 'Quận 10', startDay: day, endDay: day, timezone: s.settings.timezone, budget: '200000', reserve: '10000', walletIds: [], categoryIds: [], mealsPerDay: 3, allowCooking: false, fixed: [] };
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
