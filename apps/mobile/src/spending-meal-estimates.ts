import type { MealOption } from './spending.ts';

// Planning allowances authored for this feature, not prices observed at any venue.
const meals = [
  ['banh-mi', 'Bánh mì', '25000', 'banh', true], ['pho', 'Phở', '45000', 'nuoc', true],
  ['bun-bo', 'Bún bò', '45000', 'nuoc', true], ['hu-tieu', 'Hủ tiếu', '35000', 'nuoc', true],
  ['xoi', 'Xôi', '25000', 'nep', true], ['banh-cuon', 'Bánh cuốn', '35000', 'banh', true],
  ['chao', 'Cháo', '30000', 'chao', true], ['bun-rieu', 'Bún riêu', '35000', 'nuoc', true],
  ['com-tam', 'Cơm tấm', '40000', 'com', false], ['com-ga', 'Cơm gà', '45000', 'com', false],
  ['bun-thit-nuong', 'Bún thịt nướng', '40000', 'kho', false], ['mi-quang', 'Mì Quảng', '45000', 'kho', false],
  ['banh-canh', 'Bánh canh', '35000', 'nuoc', false], ['com-ca', 'Cơm cá', '40000', 'com', false],
  ['bun-cha', 'Bún chả', '45000', 'kho', false], ['mi-xao', 'Mì xào', '40000', 'kho', false],
  // Added 2026-10-17: frequent dish names in the Overture venue snapshot. Prices remain editorial estimates.
  ['banh-xeo', 'Bánh xèo', '50000', 'banh', false], ['bun-dau', 'Bún đậu mắm tôm', '55000', 'kho', false],
  ['bo-ne', 'Bò né', '50000', 'bo', true], ['bun-ca', 'Bún cá', '40000', 'nuoc', false],
  ['bun-mam', 'Bún mắm', '50000', 'nuoc', false], ['banh-uot', 'Bánh ướt', '30000', 'banh', true],
] as const;
// Home-cooked allowances per serving (ingredients at market, editorial estimate). Used only when cooking is allowed.
const cooked = [
  ['cook-mi-trung', 'Mì gói trứng rau (tự nấu)', '10000', 'nuoc', true, 'Mì gói, 1 trứng, rau cải'],
  ['cook-chao-trung', 'Cháo trắng trứng muối (tự nấu)', '10000', 'chao', true, 'Gạo, 1 trứng vịt muối, hành'],
  ['cook-banh-mi-op-la', 'Bánh mì ốp la (tự làm)', '12000', 'banh', true, 'Bánh mì, 2 trứng, dưa leo'],
  ['cook-com-trung', 'Cơm trứng chiên (tự nấu)', '12000', 'com', false, 'Gạo, 2 trứng, hành, nước mắm'],
  ['cook-com-rau-xao', 'Cơm rau muống xào tỏi (tự nấu)', '12000', 'com', false, 'Gạo, 1 bó rau muống, tỏi'],
  ['cook-com-canh-dau', 'Cơm canh rau, đậu hũ sốt (tự nấu)', '15000', 'com', false, 'Gạo, rau nấu canh, 2 miếng đậu hũ, cà chua'],
  ['cook-com-thit-kho', 'Cơm thịt kho trứng (tự nấu)', '18000', 'com', false, 'Gạo, ~100 g thịt ba chỉ, 1 trứng; nấu nồi lớn ăn nhiều bữa'],
  ['cook-com-ca-kho', 'Cơm cá kho (tự nấu)', '20000', 'com', false, 'Gạo, 1 khúc cá (nục/basa), nước mắm, tiêu'],
] as const;
export const COOKED_MEAL_IDS = cooked.map(([id]) => `roadmap-estimate-${id}`);
export const isCookedEstimate = (meal: MealOption) => COOKED_MEAL_IDS.includes(meal.id);
export function cookedIngredients(meal: MealOption) { return cooked.find(([id]) => meal.id === `roadmap-estimate-${id}`)?.[5] ?? null; }
export const isPlanningEstimate = (meal: MealOption) => meal.id.startsWith('roadmap-estimate-');
export function estimatedRoadmapMeals(day: string): MealOption[] {
  const out: MealOption[] = meals.map(([id, name, price]) => ({ id: `roadmap-estimate-${id}`, name, price, portion: '1 phần · dự trù món', mode: 'out', address: '', priceSource: 'Dự trù Sổ Ví · chưa xác minh giá tại quán', pricedAt: day, estimated: true, allergens: [] }));
  // Cooked dishes are always listed; planSpending keeps them out unless the plan allows cooking.
  return [...out, ...cooked.map(([id, name, price]): MealOption => ({ id: `roadmap-estimate-${id}`, name, price, portion: '1 phần · tự nấu', mode: 'cook', address: '', priceSource: 'Dự trù Sổ Ví · nguyên liệu chợ, chưa xác minh giá', pricedAt: day, estimated: true, allergens: [] }))];
}
export function mealFitsSlot(meal: MealOption, index: number, mealsPerDay: number) {
  if (!isPlanningEstimate(meal)) return true;
  const item = [...meals, ...cooked].find(([id]) => meal.id === `roadmap-estimate-${id}`);
  return !!item && (mealsPerDay === 3 && index === 0 ? item[4] : !['xoi', 'banh-cuon', 'cook-banh-mi-op-la'].includes(item[0]));
}
export function mealGroup(meal: MealOption) { return [...meals, ...cooked].find(([id]) => meal.id === `roadmap-estimate-${id}`)?.[3] ?? meal.name.toLowerCase(); }
