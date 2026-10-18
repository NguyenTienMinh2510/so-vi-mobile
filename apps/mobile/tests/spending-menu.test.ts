import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { emptyLedger } from '../src/domain.ts';
import { estimatedRoadmapMeals, mealFitsSlot, mealGroup } from '../src/spending-meal-estimates.ts';
import { retrieveRoadmapMeals, matchCatalogDishes, parseRoadmapPreferencesOffline, localDishSignal } from '../src/spending-roadmap.ts';
import { planSpending, planHasMealRepetition, replaceMeal, validatePlan, validatePlanSave } from '../src/spending.ts';
import { FOOD_KNOWLEDGE } from '../src/food-knowledge.generated.ts';

const catalog = estimatedRoadmapMeals('2026-10-18');
const now = '2026-10-18T01:00:00.000Z';
const none = { likedIds: [], excludedIds: [], excludedAllergens: [], frequency: [] };
const config = { id: 'menu-test', name: 'Quận 10', startDay: '2026-10-18', endDay: '2026-10-24', timezone: 'Asia/Ho_Chi_Minh', budget: '1000000', reserve: '0', walletIds: [], categoryIds: [], mealsPerDay: 3, allowCooking: false, fixed: [] };
const dish = (id: string) => catalog.find(m => m.id === `roadmap-estimate-${id}`)!;
const uniqueDays = (plan: ReturnType<typeof planSpending>) => {
  for (const day of new Set(plan.meals.map(s => s.day))) {
    const rows = plan.meals.filter(s => s.day === day);
    assert.equal(new Set(rows.map(s => s.meal.id)).size, rows.length, day);
  }
};

test('80 editorial out dishes and 8 cooked dishes have explicit slots and new dishes have >=10 venue signals', () => {
  assert.equal(catalog.filter(m => m.mode === 'out').length, 80);
  assert.equal(catalog.filter(m => m.mode === 'cook').length, 8);
  for (const meal of catalog) {
    assert.match(meal.priceSource, /chưa xác minh giá tại quán/);
    assert.ok([0, 1, 2].some(i => mealFitsSlot(meal, i, 3)), meal.id);
    if (meal.mode === 'out' && meal !== dish('com-ca')) assert.ok((FOOD_KNOWLEDGE.dishes as any)[meal.id.slice(17)].total >= 10, meal.id);
  }
  assert.ok(!catalog.some(m => ['Lẩu', 'Ốc', 'Nướng', 'Chay', 'BBQ', 'Chè', 'Bánh flan'].includes(m.name)));
});

test('explicit slots apply to 1/2/3 meals, and user-priced meals retain all slots', () => {
  for (const id of ['banh-mi', 'xoi', 'banh-cuon', 'banh-uot', 'chao']) {
    assert.ok(mealFitsSlot(dish(id), 0, 3));
    for (const [index, count] of [[1, 3], [2, 3], [0, 2], [1, 2], [0, 1]]) assert.equal(mealFitsSlot(dish(id), index, count), false, id);
  }
  for (const id of ['pho', 'hu-tieu', 'bun-bo', 'bun-rieu', 'banh-canh', 'bo-ne']) {
    assert.ok(mealFitsSlot(dish(id), 0, 3) && mealFitsSlot(dish(id), 1, 3));
    assert.equal(mealFitsSlot(dish(id), 2, 3), false);
    assert.ok(mealFitsSlot(dish(id), 0, 2) && mealFitsSlot(dish(id), 0, 1));
    assert.equal(mealFitsSlot(dish(id), 1, 2), false);
  }
  for (const id of ['lau-thai', 'bo-nuong', 'oc-huong']) {
    assert.equal(mealFitsSlot(dish(id), 0, 3), false);
    assert.equal(mealFitsSlot(dish(id), 1, 3), false);
    assert.ok(mealFitsSlot(dish(id), 2, 3));
  }
  const own = { ...dish('banh-mi'), id: 'my-priced-meal' };
  assert.ok([0, 1, 2].every(i => mealFitsSlot(own, i, 3)));
});

test('retrieval is area-sensitive, keeps every mentioned match, covers meals, and bounds cooking', () => {
  const text = 'thích hủ tíu, không ăn bánh mì que, lẩu nấm đúng 1 lần mỗi tuần';
  for (const allowCooking of [false, true]) {
    const menu = retrieveRoadmapMeals('Quận 10', text, catalog, allowCooking);
    assert.ok(menu.length <= 32);
    for (const phrase of ['hủ tíu', 'bánh mì que', 'lẩu nấm']) for (const meal of matchCatalogDishes(phrase, catalog)) assert.ok(menu.some(m => m.id === meal.id), meal.id);
    for (let slot = 0; slot < 3; slot++) assert.ok(menu.filter(m => mealFitsSlot(m, slot, 3)).length >= 4);
    assert.equal(menu.filter(m => m.mode === 'cook').length, allowCooking ? 8 : 0);
    assert.ok(parseRoadmapPreferencesOffline(text, menu));
    assert.deepEqual(menu, retrieveRoadmapMeals('Quận 10', text, catalog, allowCooking));
  }
  const q10 = retrieveRoadmapMeals('Quận 10', '', catalog, false), q1 = retrieveRoadmapMeals('Quận 1', '', catalog, false);
  assert.notDeepEqual(q10.map(m => m.id), q1.map(m => m.id));
  assert.ok(q10.some(m => localDishSignal('Quận 10', m)?.venues !== localDishSignal('Quận 1', m)?.venues));
  assert.throws(() => retrieveRoadmapMeals('Quận 10', 'thích cơm và bún và bánh và mì và cháo', catalog, true), /32 món/);
});

test('a sufficient seven-day budget produces unique days and respects every slot', () => {
  const menu = retrieveRoadmapMeals('Quận 10', '', catalog, false);
  const plan = planSpending(emptyLedger(), config, menu, none, now);
  assert.equal(plan.meals.length, 21); uniqueDays(plan);
  assert.ok(plan.meals.every(s => mealFitsSlot(s.meal, s.index, 3)));
  assert.ok(plan.meals.filter(s => s.meal.id === dish('banh-mi').id).every(s => s.index === 0));
});

test('a 700k real estimate menu still fits 21 distinct daily meals', () => {
  const menu = retrieveRoadmapMeals('Quận 10', '', catalog, false);
  const plan = planSpending(emptyLedger(), { ...config, budget: '700000' }, menu, none, now);
  uniqueDays(plan);
  assert.ok(plan.meals.reduce((n, s) => n + BigInt(s.meal.price), 0n) <= 700000n);
});

test('near-minimum budget relaxes soft repetition, keeps daily uniqueness, and exposes the warning', () => {
  // Three fake-priced snapshot dishes force yesterday repeats, while remaining distinct within each day.
  const meals = ['banh-mi', 'bun-rieu', 'com-tam'].map(id => ({ ...dish(id), price: '10000' }));
  const plan = planSpending(emptyLedger(), { ...config, budget: '210000' }, meals, none, now);
  uniqueDays(plan); assert.ok(planHasMealRepetition(plan));
  assert.equal(plan.meals.reduce((n, s) => n + BigInt(s.meal.price), 0n), 210000n);
  assert.match(readFileSync(new URL('../src/spending-roadmap-screen.tsx', import.meta.url), 'utf8'), /planHasMealRepetition\(next.plan\)[\s\S]*?\[warning\]/);
  assert.match(readFileSync(new URL('../src/spending-roadmap-screen.tsx', import.meta.url), 'utf8'), /Một số món hoặc nhóm món bị lặp \(ngân sách thấp hoặc ít món phù hợp\)\./);
  assert.throws(() => planSpending(emptyLedger(), { ...config, budget: '209999' }, meals, none, now));
});

test('soft sorting prefers distinct groups today and avoids yesterday even across a week boundary', () => {
  const fake = ['rice-a', 'rice-b', 'soup-a', 'soup-b', 'bread-a', 'bread-b'].map((id, i) => ({ ...dish('pho'), id, name: ['rice', 'rice', 'soup', 'soup', 'bread', 'bread'][i], price: '10000' }));
  const plan = planSpending(emptyLedger(), { ...config, endDay: '2026-10-25' }, fake, none, now);
  for (const day of new Set(plan.meals.map(s => s.day))) {
    const rows = plan.meals.filter(s => s.day === day);
    assert.equal(new Set(rows.map(s => mealGroup(s.meal))).size, 3);
  }
  assert.equal(planHasMealRepetition(plan), false);
});

test('hard constraints reject impossible menus and replacements, preserve protected slots and frequencies', () => {
  const menu = retrieveRoadmapMeals('Quận 10', '', catalog, false);
  const initial = planSpending(emptyLedger(), config, menu, none, now);
  const dinner = initial.meals.find(s => s.index === 2)!;
  assert.throws(() => replaceMeal(emptyLedger(), initial, dinner.day, dinner.index, dish('banh-mi').id, catalog, none, now), /khung bữa/);
  const lunch = initial.meals.find(s => s.index === 1)!;
  const duplicate = { ...dish('com-tam'), id: 'fake-lunch' };
  const ownMenu = [duplicate, { ...duplicate, id: 'fake-dinner' }, { ...duplicate, id: 'fake-breakfast' }];
  const ownPlan = planSpending(emptyLedger(), config, ownMenu, none, now);
  assert.throws(() => replaceMeal(emptyLedger(), ownPlan, lunch.day, 1, ownPlan.meals[2].meal.id, ownMenu, none, now), /trùng món/);
  assert.throws(() => planSpending(emptyLedger(), config, ownMenu.slice(0, 2), none, now));
  const prefs = { ...none, excludedIds: [dish('pho').id], frequency: [{ mealId: dish('bun-rieu').id, min: 3, max: 3 }] };
  initial.meals.find(s => s.index === 2)!.locked = true;
  initial.meals.find(s => s.index === 0)!.completed = true;
  const protectedRows = initial.meals.filter(s => s.locked || s.completed);
  const next = planSpending(emptyLedger(), config, menu, prefs, now, initial);
  uniqueDays(next);
  for (const old of protectedRows) assert.deepEqual(next.meals.find(s => s.day === old.day && s.index === old.index), old);
  assert.equal(next.meals.filter(s => s.meal.id === dish('bun-rieu').id).length, 3);
  assert.ok(next.meals.every(s => s.meal.id !== dish('pho').id || s.completed));
  validatePlanSave({ ...emptyLedger(), spending: { catalog: menu, preferences: none, plans: [] } }, next, now, initial);
});

test('legacy snapshots remain readable and unchanged slots can be saved while new violations are rejected', () => {
  const oneDay = { ...config, endDay: config.startDay };
  const plan = planSpending(emptyLedger(), oneDay, catalog, none, now);
  plan.meals[0].meal = dish('banh-mi');
  plan.meals[2].meal = dish('banh-mi'); // Historical duplicate at dinner, predating the new rules.
  const state = { ...emptyLedger(), spending: { catalog, preferences: none, plans: [] } };
  validatePlan(state, plan);
  const edited = structuredClone(plan);
  edited.meals[1].meal = dish('com-ga');
  validatePlanSave(state, edited, now, plan);
  const invalidDinner = structuredClone(edited);
  invalidDinner.meals[2].meal = dish('chao');
  assert.throws(() => validatePlanSave(state, invalidDinner, now, plan), /khung bữa/);
  const duplicate = { ...dish('com-tam'), id: 'user-meal' };
  const duplicatePlan = structuredClone(edited);
  duplicatePlan.meals[1].meal = duplicate;
  duplicatePlan.meals[2].meal = duplicate;
  assert.throws(() => validatePlanSave({ ...state, spending: { ...state.spending, catalog: [...catalog, duplicate] } }, duplicatePlan, now, plan), /trùng món/);
  assert.throws(() => validatePlanSave(state, plan, now), /trùng món|khung bữa/);
});

for (const protection of ['past', 'locked', 'completed'] as const) {
  test(`replanning preserves ${protection} legacy breakfast and dinner duplicates`, () => {
    const menu = retrieveRoadmapMeals('Quận 10', '', catalog, false);
    const initial = planSpending(emptyLedger(), config, menu, none, now);
    const oldDay = initial.meals.filter(s => s.day === config.startDay);
    oldDay[0].meal = dish('banh-mi');
    oldDay[2].meal = dish('banh-mi');
    if (protection !== 'past') for (const slot of [oldDay[0], oldDay[2]]) slot[protection] = true;
    const replanNow = protection === 'past' ? '2026-10-19T01:00:00.000Z' : now;
    const next = planSpending(emptyLedger(), config, menu, none, replanNow, initial);
    for (const old of protection === 'past' ? oldDay : [oldDay[0], oldDay[2]]) {
      assert.deepEqual(next.meals.find(s => s.day === old.day && s.index === old.index), old);
    }
    uniqueDays({ ...next, meals: next.meals.filter(s => s.day > config.startDay) });
    if (protection !== 'past') assert.notEqual(next.meals[1].meal.id, dish('banh-mi').id);
  });
}

test('mutable slots cannot repeat protected same-day meals', () => {
  const menu = ['a', 'b', 'c'].map(id => ({ ...dish('com-tam'), id, price: '10000' }));
  const oneDay = { ...config, endDay: config.startDay };
  for (const protectedIndex of [0, 2]) {
    const initial = planSpending(emptyLedger(), oneDay, menu, none, now);
    initial.meals[protectedIndex].locked = true;
    const next = planSpending(emptyLedger(), oneDay, menu, none, now, initial);
    uniqueDays(next);
    assert.deepEqual(next.meals[protectedIndex], initial.meals[protectedIndex]);
    assert.throws(() => planSpending(emptyLedger(), oneDay, menu.filter(m => m.id !== initial.meals[(protectedIndex + 1) % 3].meal.id), none, now, initial));
  }
});
