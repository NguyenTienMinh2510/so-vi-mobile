import { DomainError, dateRange, localDateKey, money, timestamp, validTimezone, type Ledger } from './domain.ts';
import { mealFitsSlot, mealGroup } from './spending-meal-estimates.ts';

export type MealOption = { id: string; name: string; price: string; portion: string; mode: 'cook' | 'out'; address: string; priceSource: string; pricedAt: string; estimated: boolean; allergens: string[] };
export type Preferences = { likedIds: string[]; excludedIds: string[]; excludedAllergens: string[]; frequency: { mealId: string; min: number; max: number }[] };
export type PlanConfig = { id: string; name: string; startDay: string; endDay: string; timezone: string; budget: string; reserve: string; walletIds: string[]; categoryIds: string[]; mealsPerDay: number; allowCooking: boolean; fixed: { id: string; name: string; amount: string; transactionId: string | null }[] };
export type MealSlot = { day: string; index: number; meal: MealOption; locked: boolean; completed: boolean; transactionId: string | null };
export type SpendingPlan = { config: PlanConfig; meals: MealSlot[]; preferences: Preferences; version?: number };
export type SpendingData = { catalog: MealOption[]; preferences: Preferences; plans: SpendingPlan[] };
function fail(message: string): never { throw new DomainError('INVALID_SPENDING', message); }
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
function fields(value: unknown, keys: string[]) { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join('|') !== [...keys].sort().join('|')) fail('Dữ liệu kế hoạch thiếu trường hoặc có trường lạ.'); }
function text(value: unknown, max = 200, empty = false): asserts value is string { if (typeof value !== 'string' || value.length > max || (!empty && !value.trim())) fail('Nội dung kế hoạch không hợp lệ.'); }
function id(value: unknown): asserts value is string { if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(value) || ['constructor', 'prototype', '__proto__'].includes(value)) fail('Mã kế hoạch không hợp lệ.'); }
function strings(value: unknown, ids = true): asserts value is string[] { if (!Array.isArray(value) || value.length > 100 || new Set(value).size !== value.length) fail('Danh sách lựa chọn không hợp lệ.'); for (const item of value) ids ? id(item) : text(item, 100); }
function bool(value: unknown) { if (typeof value !== 'boolean') fail('Trạng thái kế hoạch không hợp lệ.'); }
function nonnegative(value: string) { const n = money(value); if (n < 0n) fail('Số tiền không được âm.'); return n; }
function day(value: string) { text(value, 10); timestamp(`${value}T00:00:00.000Z`); return Date.parse(`${value}T00:00:00.000Z`); }
export function emptySpending(): SpendingData { return { catalog: [], preferences: { likedIds: [], excludedIds: [], excludedAllergens: [], frequency: [] }, plans: [] }; }
export function validateMeal(meal: MealOption) {
  fields(meal, ['id', 'name', 'price', 'portion', 'mode', 'address', 'priceSource', 'pricedAt', 'estimated', 'allergens']); id(meal.id); text(meal.name); money(meal.price, { positive: true }); text(meal.portion); text(meal.address, 500, true); text(meal.priceSource, 500); day(meal.pricedAt); bool(meal.estimated); strings(meal.allergens, false); if (!['cook', 'out'].includes(meal.mode)) fail('Chọn tự nấu hoặc ăn quán.');
}
export function validatePreferences(p: Preferences, catalog: MealOption[]) {
  fields(p, ['likedIds', 'excludedIds', 'excludedAllergens', 'frequency']); strings(p.likedIds); strings(p.excludedIds); strings(p.excludedAllergens, false);
  const known = new Map(catalog.map(m => [m.id, m]));
  for (const key of [...p.likedIds, ...p.excludedIds]) if (!known.has(key)) fail('Sở thích tham chiếu món không còn trong thực đơn.');
  if (p.likedIds.some(key => p.excludedIds.includes(key) || known.get(key)!.allergens.some(a => p.excludedAllergens.includes(a)))) fail('Món thích xung đột với món kiêng hoặc dị ứng.');
  if (!Array.isArray(p.frequency) || p.frequency.length > 100 || new Set(p.frequency.map(f => f.mealId)).size !== p.frequency.length) fail('Tần suất món không hợp lệ.');
  for (const f of p.frequency) { fields(f, ['mealId', 'min', 'max']); id(f.mealId); if (!known.has(f.mealId) || !Number.isInteger(f.min) || !Number.isInteger(f.max) || f.min < 0 || f.max > 21 || f.min > f.max) fail('Tần suất phải từ 0 đến 21 lần mỗi 7 ngày.'); if (f.min > 0 && (p.excludedIds.includes(f.mealId) || known.get(f.mealId)!.allergens.some(a => p.excludedAllergens.includes(a)))) fail('Tần suất bắt buộc xung đột với món kiêng.'); }
  return p;
}
export function validateConfig(s: Ledger, c: PlanConfig) {
  fields(c, ['id', 'name', 'startDay', 'endDay', 'timezone', 'budget', 'reserve', 'walletIds', 'categoryIds', 'mealsPerDay', 'allowCooking', 'fixed']); id(c.id); text(c.name); validTimezone(c.timezone);
  const count = (day(c.endDay) - day(c.startDay)) / 86400000 + 1; if (!Number.isInteger(count) || count < 1 || count > 31) fail('Kỳ kế hoạch phải từ 1 đến 31 ngày.'); dateRange(c.startDay, c.endDay, c.timezone);
  money(c.budget, { positive: true }); nonnegative(c.reserve); if (!Number.isInteger(c.mealsPerDay) || c.mealsPerDay < 1 || c.mealsPerDay > 3) fail('Chọn 1 đến 3 bữa mỗi ngày.'); bool(c.allowCooking); strings(c.walletIds); strings(c.categoryIds);
  for (const key of c.walletIds) if (!s.wallets.some(w => w.id === key)) fail('Ví trong phạm vi không tồn tại.');
  for (const key of c.categoryIds) if (!s.categories.some(x => x.id === key && x.kind === 'expense')) fail('Danh mục chi trong phạm vi không tồn tại.');
  if (!Array.isArray(c.fixed) || c.fixed.length > 100 || new Set(c.fixed.map(f => f.id)).size !== c.fixed.length) fail('Khoản cố định không hợp lệ.');
  for (const f of c.fixed) { fields(f, ['id', 'name', 'amount', 'transactionId']); id(f.id); text(f.name); nonnegative(f.amount); if (f.transactionId !== null) id(f.transactionId); }
  return Array.from({ length: count }, (_, i) => new Date(day(c.startDay) + i * 86400000).toISOString().slice(0, 10));
}
function scoped(s: Ledger, c: PlanConfig) { const range = dateRange(c.startDay, c.endDay, c.timezone); return s.transactions.filter(t => t.kind === 'expense' && t.occurredAt >= range.start && t.occurredAt < range.endExclusive && (!c.walletIds.length || c.walletIds.includes(t.walletId)) && (!c.categoryIds.length || c.categoryIds.includes(t.categoryId))); }
export function spendingTotals(s: Ledger, p: SpendingPlan, now: string) {
  timestamp(now); const today = localDateKey(now, p.config.timezone); const rows = scoped(s, p.config); const paid = new Set(rows.map(t => t.id));
  const links = [...p.config.fixed.map(f => f.transactionId), ...p.meals.map(m => m.transactionId)].filter((x): x is string => x !== null); if (new Set(links).size !== links.length) fail('Một giao dịch chỉ được liên kết một lần trong kế hoạch.');
  const spent = rows.reduce((n, t) => n + money(t.amount), 0n); const fixedUnpaid = p.config.fixed.reduce((n, f) => n + (f.transactionId && paid.has(f.transactionId) ? 0n : money(f.amount)), 0n);
  const planned = p.meals.reduce((n, m) => n + (m.day < today || (m.transactionId && paid.has(m.transactionId)) ? 0n : money(m.meal.price)), 0n); const remaining = money(p.config.budget) - money(p.config.reserve) - spent - fixedUnpaid - planned;
  return { spent: money(spent.toString()).toString(), fixedUnpaid: money(fixedUnpaid.toString()).toString(), planned: money(planned.toString()).toString(), remaining: money(remaining.toString()).toString() };
}
const allowed = (m: MealOption, c: PlanConfig, p: Preferences) => (c.allowCooking || m.mode !== 'cook') && !p.excludedIds.includes(m.id) && !m.allergens.some(a => p.excludedAllergens.includes(a));
export function protectedSlot(m: MealSlot, today: string) { return m.day < today || m.locked || m.completed; }
export function validatePlan(s: Ledger, p: SpendingPlan) {
  fields(p, p.version === undefined ? ['config', 'meals', 'preferences'] : ['config', 'meals', 'preferences', 'version']); if (p.version !== undefined && (!Number.isSafeInteger(p.version) || p.version < 1)) fail('Phiên bản kế hoạch không hợp lệ.');
  const days = validateConfig(s, p.config); if (!Array.isArray(p.meals) || p.meals.length !== days.length * p.config.mealsPerDay) fail('Kế hoạch chưa đủ bữa.');
  const keys = new Set<string>(); for (const m of p.meals) { fields(m, ['day', 'index', 'meal', 'locked', 'completed', 'transactionId']); if (!days.includes(m.day) || !Number.isInteger(m.index) || m.index < 0 || m.index >= p.config.mealsPerDay || keys.has(`${m.day}/${m.index}`)) fail('Ngày hoặc số bữa không hợp lệ.'); keys.add(`${m.day}/${m.index}`); validateMeal(m.meal); if (!mealFitsSlot(m.meal, m.index, p.config.mealsPerDay)) fail('Món chưa phù hợp với khung bữa sáng.'); bool(m.locked); bool(m.completed); if (m.transactionId !== null) id(m.transactionId); }
  validatePreferences(p.preferences, [...s.spending.catalog, ...p.meals.map(m => m.meal)]);
  const links = [...p.config.fixed.map(f => f.transactionId), ...p.meals.map(m => m.transactionId)].filter(x => x !== null); if (new Set(links).size !== links.length) fail('Liên kết giao dịch bị trùng.');
}
function frequencyValid(meals: MealSlot[], days: string[], prefs: Preferences) { for (let i = 0; i < days.length; i += 7) { const week = days.slice(i, i + 7); for (const f of prefs.frequency) { const count = meals.filter(m => week.includes(m.day) && m.meal.id === f.mealId).length; if (count < Math.ceil(f.min * week.length / 7) || count > Math.floor(f.max * week.length / 7)) return false; } } return true; }
export function validatePlanSave(s: Ledger, p: SpendingPlan, now: string, previous?: SpendingPlan) {
  validatePlan(s, p); const days = validateConfig(s, p.config); const today = localDateKey(now, p.config.timezone);
  if (previous) for (const old of previous.meals) if (protectedSlot(old, today) && !same(old, p.meals.find(m => m.day === old.day && m.index === old.index))) fail('Bữa đã qua, khóa hoặc xác nhận phải giữ nguyên.');
  for (const slot of p.meals) { const old = previous?.meals.find(m => m.day === slot.day && m.index === slot.index); if (!(old && protectedSlot(old, today)) && !allowed(slot.meal, p.config, p.preferences)) fail('Món không đáp ứng điều kiện đã duyệt.'); if (old && same(old.meal, slot.meal)) continue; const current = s.spending.catalog.find(m => m.id === slot.meal.id); if (!current || !same(current, slot.meal) || !allowed(slot.meal, p.config, p.preferences)) fail('Thực đơn hoặc điều kiện đã thay đổi. Tạo lại đề xuất trước khi lưu.'); }
  if (!frequencyValid(p.meals, days, p.preferences)) fail('Kế hoạch chưa đáp ứng tần suất đã duyệt.'); if (money(spendingTotals(s, p, now).remaining) < 0n) fail('Kế hoạch vượt ngân sách. Giữ dự phòng và xem phương án cân lại.');
}
export function validateSpending(s: Ledger) {
  const data = s.spending; fields(data, ['catalog', 'preferences', 'plans']); if (!Array.isArray(data.catalog) || data.catalog.length > 100 || !Array.isArray(data.plans) || data.plans.length > 100) fail('Danh mục hoặc kế hoạch quá lớn.');
  if (new Set(data.catalog.map(m => m.id)).size !== data.catalog.length || new Set(data.plans.map(p => p.config.id)).size !== data.plans.length) fail('Mã món hoặc kế hoạch bị trùng.'); for (const m of data.catalog) validateMeal(m); validatePreferences(data.preferences, data.catalog); for (const p of data.plans) { if (p.version === undefined) fail('Kế hoạch đã lưu thiếu phiên bản.'); validatePlan(s, p); }
}
export function planSpending(s: Ledger, config: PlanConfig, catalog: MealOption[], preferences: Preferences, now: string, previous?: SpendingPlan): SpendingPlan {
  timestamp(now); const days = validateConfig(s, config); if (!Array.isArray(catalog) || catalog.length > 100) fail('Thực đơn phải có tối đa 100 món.'); catalog.forEach(validateMeal); validatePreferences(preferences, catalog); if (new Set(catalog.map(m => m.id)).size !== catalog.length) fail('Mã món trùng.');
  const today = localDateKey(now, config.timezone); const choices = catalog.filter(m => allowed(m, config, preferences)); if (!choices.length) fail('Chưa có món có giá phù hợp với điều kiện.');
  const meals: MealSlot[] = []; for (const d of days) for (let i = 0; i < config.mealsPerDay; i++) { const old = previous?.meals.find(m => m.day === d && m.index === i); meals.push(old && protectedSlot(old, today) ? clone(old) : { day: d, index: i, meal: clone(choices[0]), locked: false, completed: false, transactionId: old?.transactionId ?? null }); }
  if (previous) for (const old of previous.meals) if (protectedSlot(old, today) && !meals.some(m => same(m, old))) fail('Không thể bỏ bữa đã được bảo vệ khi đổi kỳ.');
  const result: SpendingPlan = { config: clone(config), preferences: clone(preferences), meals }; const paid = new Set(scoped(s, config).map(t => t.id)); const cost = (m: MealSlot) => m.day < today || (m.transactionId && paid.has(m.transactionId)) ? 0n : money(m.meal.price);
  let funds = money(spendingTotals(s, { ...result, meals: [] }, now).remaining); let nodes = 0;
  const futureMinimum = (offset: number) => {
    let total = 0n;
    for (let i = offset; i < days.length; i += 7) {
      const weekDays = days.slice(i, i + 7); const week = meals.filter(m => weekDays.includes(m.day)); const protectedMeals = week.filter(m => protectedSlot(m, today)); const mutable = week.filter(m => !protectedSlot(m, today)); const unpaid = mutable.filter(m => !m.transactionId || !paid.has(m.transactionId));
      total += protectedMeals.reduce((n, m) => n + cost(m), 0n);
      if (!unpaid.length) continue;
      const possible = choices.filter(m => { const f = preferences.frequency.find(f => f.mealId === m.id); return !f || protectedMeals.filter(x => x.meal.id === m.id).length < Math.floor(f.max * weekDays.length / 7); });
      if (!possible.length) return money(config.budget) + 1n;
      const cheapest = possible.reduce((n, m) => money(m.price) < n ? money(m.price) : n, money(possible[0].price)); total += cheapest * BigInt(unpaid.length);
      for (const f of preferences.frequency) { const need = Math.max(0, Math.ceil(f.min * weekDays.length / 7) - protectedMeals.filter(m => m.meal.id === f.mealId).length - (mutable.length - unpaid.length)); const meal = choices.find(m => m.id === f.mealId); if (need && meal && money(meal.price) > cheapest) total += BigInt(need) * (money(meal.price) - cheapest); }
    }
    return total;
  };
  for (let offset = 0; offset < days.length; offset += 7) {
    const weekDays = days.slice(offset, offset + 7); const week = meals.filter(m => weekDays.includes(m.day)); const mutable = week.filter(m => !protectedSlot(m, today)); const counts = new Map<string, number>(); for (const m of week.filter(m => !mutable.includes(m))) { counts.set(m.meal.id, (counts.get(m.meal.id) ?? 0) + 1); funds -= cost(m); }
    const limits = preferences.frequency.map(f => ({ ...f, min: Math.ceil(f.min * weekDays.length / 7), max: Math.floor(f.max * weekDays.length / 7) }));
    const cheapest = choices.reduce((n, m) => money(m.price) < n ? money(m.price) : n, money(choices[0].price)); const minimum = Array<bigint>(mutable.length + 1).fill(0n); for (let i = mutable.length - 1; i >= 0; i--) minimum[i] = minimum[i + 1] + (mutable[i].transactionId && paid.has(mutable[i].transactionId!) ? 0n : cheapest);
    const search = (index: number, left: bigint): bigint | null => {
      if (++nodes > 50000 || left < minimum[index] || limits.some(f => (counts.get(f.mealId) ?? 0) > f.max || (counts.get(f.mealId) ?? 0) + mutable.length - index < f.min)) return null;
      if (index === mutable.length) return limits.every(f => (counts.get(f.mealId) ?? 0) >= f.min) ? left : null;
      const ordered = choices.filter(m => mealFitsSlot(m, mutable[index].index, config.mealsPerDay)).sort((a, b) => { const need = (m: MealOption) => limits.some(f => f.mealId === m.id && (counts.get(m.id) ?? 0) < f.min); if (need(a) !== need(b)) return need(a) ? -1 : 1; const ca = counts.get(a.id) ?? 0, cb = counts.get(b.id) ?? 0; if (ca !== cb) return ca - cb; const groupCount = (m: MealOption) => week.filter(slot => (protectedSlot(slot, today) || mutable.indexOf(slot) < index) && mealGroup(slot.meal) === mealGroup(m)).length; const ga = groupCount(a), gb = groupCount(b); if (ga !== gb) return ga - gb; if (preferences.likedIds.includes(a.id) !== preferences.likedIds.includes(b.id)) return preferences.likedIds.includes(a.id) ? -1 : 1; return money(a.price) < money(b.price) ? -1 : money(a.price) > money(b.price) ? 1 : a.id.localeCompare(b.id); });
      for (const meal of ordered) { const slot = mutable[index]; slot.meal = clone(meal); counts.set(meal.id, (counts.get(meal.id) ?? 0) + 1); const answer = search(index + 1, left - cost(slot)); if (answer !== null) return answer; counts.set(meal.id, counts.get(meal.id)! - 1); } return null;
    };
    const reserved = futureMinimum(offset + 7); const answer = search(0, funds - reserved); if (answer === null) fail('Chưa tìm được phương án trong ngân sách và điều kiện đã chọn.'); funds = answer + reserved;
  }
  if (!frequencyValid(meals, days, preferences) || money(spendingTotals(s, result, now).remaining) < 0n) fail('Chưa tìm được phương án trong ngân sách.'); return result;
}
export function replaceMeal(s: Ledger, p: SpendingPlan, dayKey: string, index: number, newMealId: string, catalog: MealOption[], preferences: Preferences, now: string) {
  const candidate = catalog.find(m => m.id === newMealId); if (candidate && !mealFitsSlot(candidate, index, p.config.mealsPerDay)) fail('Món chưa phù hợp với khung bữa sáng.');
  validatePreferences(preferences, catalog); const next = clone(p); const slot = next.meals.find(m => m.day === dayKey && m.index === index); if (!slot || protectedSlot(slot, localDateKey(now, p.config.timezone))) fail('Không đổi bữa đã qua, khóa hoặc xác nhận.'); const meal = catalog.find(m => m.id === newMealId); if (!meal || !allowed(meal, p.config, preferences)) fail('Món không phù hợp với điều kiện.'); validateMeal(meal); const oldPrice = slot.meal.price; slot.meal = clone(meal); next.preferences = clone(preferences); return { plan: next, oldPrice, newPrice: meal.price, delta: (money(meal.price) - money(oldPrice)).toString(), remaining: spendingTotals(s, next, now).remaining };
}
export function parseAiPreferences(jsonText: string, catalog: MealOption[]): Preferences { if (typeof jsonText !== 'string' || jsonText.length > 12000) fail('Đầu ra AI quá dài.'); let parsed: Preferences; try { parsed = JSON.parse(jsonText); } catch { return fail('AI chưa trả về sở thích hợp lệ. Chọn trực tiếp hoặc thử lại.'); } return clone(validatePreferences(parsed, catalog)); }
