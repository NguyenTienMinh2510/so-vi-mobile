import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseThinkingResult, THINKING_LIMITS } from '../src/spending-thinking.ts';
import { estimatedRoadmapMeals, mealFitsSlot, isCookedEstimate, cookedIngredients } from '../src/spending-meal-estimates.ts';
import { parseRoadmapPrompt, reviewRoadmapPreferences, thinkingAliases, thinkingMenu, restoreThinkingPreferences, minimumEatOutCost } from '../src/spending-roadmap.ts';
import { planSpending } from '../src/spending.ts';
import { emptyLedger } from '../src/domain.ts';

const catalog = estimatedRoadmapMeals('2026-10-17'), aliases = thinkingAliases(catalog);
const json = (value: object) => JSON.stringify({ likedIds: [], excludedIds: [], frequency: [], allowCooking: false, tips: [], ...value });
const config = (budget: string, allowCooking: boolean) => ({ id: 'p', name: 'Quận 10, TP.HCM', startDay: '2026-10-17', endDay: '2026-10-23', timezone: 'Asia/Ho_Chi_Minh', budget, reserve: '0', walletIds: [], categoryIds: [], mealsPerDay: 3, allowCooking, fixed: [] });
const none = { likedIds: [], excludedIds: [], excludedAllergens: [], frequency: [] };

test('prompt separates cooking permission from area and food preferences', () => {
  const allow = parseRoadmapPrompt('Quận 10, 7 ngày, 400k, 3 bữa/ngày, tự nấu được, thích phở', '2026-10-17');
  assert.equal(allow.cooking, 'allow'); assert.equal(allow.area, 'Quận 10, TP.HCM'); assert.equal(allow.preferenceText, 'thích phở');
  assert.equal(parseRoadmapPrompt('Quận 10, 7 ngày, 400k, nấu ăn ở nhà', '2026-10-17').cooking, 'allow');
  assert.equal(parseRoadmapPrompt('Quận 10, 7 ngày, 400k, không nấu', '2026-10-17').cooking, 'deny');
  assert.equal(parseRoadmapPrompt('Quận 10, 7 ngày, 900k', '2026-10-17').cooking, 'unspecified');
  assert.throws(() => parseRoadmapPrompt('Quận 10, 7 ngày, 400k, tự nấu được, không nấu', '2026-10-17'), /vừa cho phép/);
});
test('cooked estimates are cheap, labelled, breakfast-aware and used only when the plan allows cooking', () => {
  const cooked = catalog.filter(isCookedEstimate); assert.equal(cooked.length, 8);
  assert.ok(cooked.every(m => m.mode === 'cook' && m.estimated && /tự (?:nấu|làm)/.test(m.name) && cookedIngredients(m) && BigInt(m.price) <= 20000n));
  assert.equal(cookedIngredients(catalog[0]), null); assert.ok(mealFitsSlot(cooked.find(m => /Mì gói/.test(m.name))!, 0, 3)); assert.ok(!mealFitsSlot(cooked.find(m => /Bánh mì ốp la/.test(m.name))!, 2, 3));
  assert.throws(() => planSpending(emptyLedger(), config('400000', false), catalog, none, '2026-10-17T01:00:00.000Z'));
  const plan = planSpending(emptyLedger(), config('400000', true), catalog, none, '2026-10-17T01:00:00.000Z');
  assert.ok(plan.meals.some(s => s.meal.mode === 'cook')); assert.ok(plan.meals.reduce((n, s) => n + BigInt(s.meal.price), 0n) <= 400000n);
  const outOnly = catalog.filter(m => m.mode === 'out');
  assert.equal(minimumEatOutCost(outOnly, 7, 3, (m, i) => mealFitsSlot(m, i, 3)), 525000n); assert.equal(minimumEatOutCost([], 7, 3, () => true), null);
});
test('thinking output boundary accepts one closed JSON object after reasoning and rejects everything else', () => {
  const r = parseThinkingResult('<think>bỏ qua</think>```json\n' + json({ likedIds: ['m23'], allowCooking: true, tips: ['  Nấu\n nồi lớn  '] }) + '\n```', aliases, 'allow', 'nghĩ   rất\n kỹ');
  assert.deepEqual(r.preferences.likedIds, ['m23']); assert.equal(r.allowCooking, true); assert.deepEqual(r.tips, ['Nấu nồi lớn']); assert.equal(r.reasoning, 'nghĩ rất kỹ');
  for (const bad of ['không có json', json({ extra: 1 }), json({ likedIds: ['m99'] }), json({ allowCooking: 'yes' }), json({ tips: Array(5).fill('a') }), json({ frequency: [{ mealId: 'm1', min: 3, max: 2 }] }), 'x'.repeat(12001)]) assert.throws(() => parseThinkingResult(bad, aliases, 'unspecified'), bad.slice(0, 40));
  assert.throws(() => parseThinkingResult(json({ allowCooking: true }), aliases, 'deny'), /không nấu/);
  assert.ok(parseThinkingResult(json({}), aliases, 'deny', 'x'.repeat(9000)).reasoning.length === THINKING_LIMITS.reasoning);
});
test('thinking menu exposes breakfast fit and local signal; restore maps aliases back to stable IDs', () => {
  const menu = thinkingMenu('Quận 10, TP.HCM', catalog, m => mealFitsSlot(m, 0, 3));
  assert.equal(menu.length, 30); assert.equal(menu.find(m => m.name === 'Bánh mì')!.breakfast, true); assert.equal(menu.find(m => m.name === 'Cơm tấm')!.breakfast, false);
  assert.ok(menu.filter(m => m.cook).every(m => m.localVenues === null)); assert.ok(typeof menu.find(m => m.name === 'Phở')!.localVenues === 'number');
  const restored = restoreThinkingPreferences({ ...none, likedIds: ['m2'], frequency: [{ mealId: 'm1', min: 1, max: 3 }] }, catalog);
  assert.deepEqual(restored.likedIds, [catalog[1].id]); assert.equal(restored.frequency[0].mealId, catalog[0].id);
  assert.throws(() => thinkingAliases([...catalog, ...catalog.slice(0, 3).map(m => ({ ...m, id: m.id + '-x' }))]), /1–32/);
});
test('suggestion review lets AI add soft ideas but keeps user exclusions, likes and counts exact', () => {
  const id = (name: string) => catalog.find(m => m.name === name)!.id;
  reviewRoadmapPreferences('không ăn phở, ăn healthy', { ...none, excludedIds: [id('Phở')], likedIds: [id('Bánh mì')], frequency: [{ mealId: id('Xôi'), min: 1, max: 3 }] }, catalog, { suggestions: true });
  reviewRoadmapPreferences('', { ...none, likedIds: [id('Cơm tấm')] }, catalog, { suggestions: true });
  assert.throws(() => reviewRoadmapPreferences('không ăn phở', { ...none }, catalog, { suggestions: true }), /không ăn/);
  assert.throws(() => reviewRoadmapPreferences('', { ...none, excludedIds: [id('Phở')] }, catalog, { suggestions: true }), /tự loại/);
  assert.throws(() => reviewRoadmapPreferences('phở đúng 2 lần mỗi tuần', { ...none, frequency: [{ mealId: id('Phở'), min: 1, max: 4 }] }, catalog, { suggestions: true }), /tần suất/);
  assert.throws(() => reviewRoadmapPreferences('thích phở', { ...none }, catalog, { suggestions: true }), /giữ món/);
  assert.throws(() => reviewRoadmapPreferences('ăn healthy', { ...none }, catalog), /chưa hiểu/);
  assert.throws(() => reviewRoadmapPreferences('dị ứng đậu phộng', { ...none }, catalog, { suggestions: true }), /dị ứng/);
});
