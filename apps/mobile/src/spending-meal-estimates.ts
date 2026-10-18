import type { MealOption } from './spending.ts';

// Planning allowances authored for this feature, not prices observed at any venue.
const breakfast = ['sang'] as const, morningLunch = ['sang', 'trua'] as const, lunchDinner = ['trua', 'toi'] as const, dinner = ['toi'] as const, allDay = ['sang', 'trua', 'toi'] as const;
const meals = [
  ['banh-mi', 'Bánh mì', '25000', 'banh', breakfast], ['pho', 'Phở', '45000', 'nuoc', morningLunch],
  ['bun-bo', 'Bún bò', '45000', 'nuoc', morningLunch], ['hu-tieu', 'Hủ tiếu', '35000', 'nuoc', morningLunch],
  ['xoi', 'Xôi', '25000', 'nep', breakfast], ['banh-cuon', 'Bánh cuốn', '35000', 'banh', breakfast],
  ['chao', 'Cháo', '30000', 'chao', breakfast], ['bun-rieu', 'Bún riêu', '35000', 'nuoc', morningLunch],
  ['com-tam', 'Cơm tấm', '40000', 'com', lunchDinner], ['com-ga', 'Cơm gà', '45000', 'com', lunchDinner],
  ['bun-thit-nuong', 'Bún thịt nướng', '40000', 'kho', lunchDinner], ['mi-quang', 'Mì Quảng', '45000', 'kho', lunchDinner],
  ['banh-canh', 'Bánh canh', '35000', 'nuoc', morningLunch], ['com-ca', 'Cơm cá', '40000', 'com', lunchDinner],
  ['bun-cha', 'Bún chả', '45000', 'kho', lunchDinner], ['mi-xao', 'Mì xào', '40000', 'kho', lunchDinner],
  // Added 2026-10-17: frequent dish names in the Overture venue snapshot. Prices remain editorial estimates.
  ['banh-xeo', 'Bánh xèo', '50000', 'banh', lunchDinner], ['bun-dau', 'Bún đậu mắm tôm', '55000', 'kho', lunchDinner],
  ['bo-ne', 'Bò né', '50000', 'bo', morningLunch], ['bun-ca', 'Bún cá', '40000', 'nuoc', lunchDinner],
  ['bun-mam', 'Bún mắm', '50000', 'nuoc', lunchDinner], ['banh-uot', 'Bánh ướt', '30000', 'banh', breakfast],
  ['com-chay', 'Cơm chay', '30000', 'com', lunchDinner],
  ['com-nieu', 'Cơm niêu', '50000', 'com', lunchDinner],
  ['com-van-phong', 'Cơm văn phòng', '35000', 'com', lunchDinner],
  ['com-chien', 'Cơm chiên', '35000', 'com', lunchDinner],
  ['com-ga-xoi-mo', 'Cơm gà xối mỡ', '40000', 'com', lunchDinner],
  ['com-ga-hai-nam', 'Cơm gà Hải Nam', '50000', 'com', lunchDinner],
  ['com-tho', 'Cơm thố', '40000', 'com', lunchDinner],
  ['com-bac', 'Cơm Bắc', '40000', 'com', lunchDinner],
  ['com-que', 'Cơm quê', '35000', 'com', lunchDinner],
  ['bun-moc', 'Bún mọc', '40000', 'nuoc', morningLunch],
  ['bun-oc', 'Bún ốc', '45000', 'nuoc', morningLunch],
  ['bun-thai', 'Bún Thái', '45000', 'nuoc', lunchDinner],
  ['bun-nuoc-leo', 'Bún nước lèo', '40000', 'nuoc', morningLunch],
  ['bun-quay', 'Bún quậy', '50000', 'nuoc', lunchDinner],
  ['mi-vit-tiem', 'Mì vịt tiềm', '60000', 'nuoc', lunchDinner],
  ['mi-sui-cao', 'Mì sủi cảo', '45000', 'nuoc', morningLunch],
  ['mi-ga', 'Mì gà', '40000', 'nuoc', morningLunch],
  ['mi-bo', 'Mì bò', '45000', 'nuoc', morningLunch],
  ['mi-cay', 'Mì cay', '50000', 'nuoc', lunchDinner],
  ['mi-y', 'Mì Ý', '50000', 'kho', lunchDinner],
  ['mi-tron', 'Mì trộn', '35000', 'kho', lunchDinner],
  ['mien-ga', 'Miến gà', '40000', 'nuoc', morningLunch],
  ['banh-hoi', 'Bánh hỏi', '40000', 'banh', lunchDinner],
  ['banh-can', 'Bánh căn', '35000', 'banh', breakfast],
  ['banh-khot', 'Bánh khọt', '45000', 'banh', lunchDinner],
  ['banh-beo', 'Bánh bèo', '35000', 'banh', breakfast],
  ['banh-bot-loc', 'Bánh bột lọc', '35000', 'banh', lunchDinner],
  ['banh-trang-cuon', 'Bánh tráng cuốn', '40000', 'cuon', lunchDinner],
  ['nem-nuong', 'Nem nướng', '45000', 'cuon', dinner],
  ['goi-cuon', 'Gỏi cuốn', '35000', 'cuon', lunchDinner],
  ['bo-kho', 'Bò kho', '45000', 'bo', morningLunch],
  ['bo-bit-tet', 'Bò bít tết', '65000', 'bo', lunchDinner],
  ['bo-la-lot', 'Bò lá lốt', '45000', 'nuong', dinner],
  ['bo-nuong', 'Bò nướng', '60000', 'nuong', dinner],
  ['ga-nuong', 'Gà nướng', '55000', 'nuong', dinner],
  ['vit-quay', 'Vịt quay', '55000', 'vit', lunchDinner],
  ['vit-nuong', 'Vịt nướng', '55000', 'nuong', dinner],
  ['lau-thai', 'Lẩu Thái', '80000', 'lau', dinner],
  ['lau-bo', 'Lẩu bò', '90000', 'lau', dinner],
  ['lau-ga', 'Lẩu gà', '80000', 'lau', dinner],
  ['lau-de', 'Lẩu dê', '100000', 'lau', dinner],
  ['lau-ca', 'Lẩu cá', '80000', 'lau', dinner],
  ['lau-mam', 'Lẩu mắm', '80000', 'lau', dinner],
  ['lau-nam', 'Lẩu nấm', '70000', 'lau', dinner],
  ['oc-huong', 'Ốc hương', '70000', 'oc', dinner],
  ['chao-suon', 'Cháo sườn', '30000', 'chao', breakfast],
  ['chao-long', 'Cháo lòng', '30000', 'chao', breakfast],
  ['chao-vit', 'Cháo vịt', '35000', 'chao', breakfast],
  ['chao-ech', 'Cháo ếch', '45000', 'chao', breakfast],
  ['chao-ca', 'Cháo cá', '35000', 'chao', breakfast],
  ['banh-mi-chao', 'Bánh mì chảo', '40000', 'banh', breakfast],
  ['banh-mi-que', 'Bánh mì que', '25000', 'banh', breakfast],
  ['banh-mi-xiu-mai', 'Bánh mì xíu mại', '30000', 'banh', breakfast],
  ['xoi-ga', 'Xôi gà', '30000', 'nep', breakfast],
  ['xoi-man', 'Xôi mặn', '25000', 'nep', breakfast],
  ['pho-ga', 'Phở gà', '45000', 'nuoc', morningLunch],
  ['pho-bo', 'Phở bò', '45000', 'nuoc', morningLunch],
  ['hu-tieu-muc', 'Hủ tiếu mực', '50000', 'nuoc', morningLunch],
] as const;
// Home-cooked allowances per serving (ingredients at market, editorial estimate). Used only when cooking is allowed.
const cooked = [
  ['cook-mi-trung', 'Mì gói trứng rau (tự nấu)', '10000', 'nuoc', allDay, 'Mì gói, 1 trứng, rau cải'],
  ['cook-chao-trung', 'Cháo trắng trứng muối (tự nấu)', '10000', 'chao', breakfast, 'Gạo, 1 trứng vịt muối, hành'],
  ['cook-banh-mi-op-la', 'Bánh mì ốp la (tự làm)', '12000', 'banh', breakfast, 'Bánh mì, 2 trứng, dưa leo'],
  ['cook-com-trung', 'Cơm trứng chiên (tự nấu)', '12000', 'com', lunchDinner, 'Gạo, 2 trứng, hành, nước mắm'],
  ['cook-com-rau-xao', 'Cơm rau muống xào tỏi (tự nấu)', '12000', 'com', lunchDinner, 'Gạo, 1 bó rau muống, tỏi'],
  ['cook-com-canh-dau', 'Cơm canh rau, đậu hũ sốt (tự nấu)', '15000', 'com', lunchDinner, 'Gạo, rau nấu canh, 2 miếng đậu hũ, cà chua'],
  ['cook-com-thit-kho', 'Cơm thịt kho trứng (tự nấu)', '18000', 'com', lunchDinner, 'Gạo, ~100 g thịt ba chỉ, 1 trứng; nấu nồi lớn ăn nhiều bữa'],
  ['cook-com-ca-kho', 'Cơm cá kho (tự nấu)', '20000', 'com', lunchDinner, 'Gạo, 1 khúc cá (nục/basa), nước mắm, tiêu'],
] as const;
export const COOKED_MEAL_IDS = cooked.map(([id]) => `roadmap-estimate-${id}`);
export const isCookedEstimate = (meal: MealOption) => COOKED_MEAL_IDS.includes(meal.id);
export function cookedIngredients(meal: MealOption) { return cooked.find(([id]) => meal.id === `roadmap-estimate-${id}`)?.[5] ?? null; }
export const isPlanningEstimate = (meal: MealOption) => meal.id.startsWith('roadmap-estimate-');
export function estimatedRoadmapMeals(day: string): MealOption[] {
  const out: MealOption[] = meals.map(([id, name, price]) => ({ id: `roadmap-estimate-${id}`, name, price, portion: '1 phần · dự trù món', mode: 'out', address: '', priceSource: 'Dự trù Sổ Ví · chưa xác minh giá tại quán', pricedAt: day, estimated: true, allergens: [] }));
  // Cooked dishes are always listed; planSpending keeps them out unless the plan allows cooking.
  return [...out, ...cooked.map(([id, name, price]): MealOption => ({ id: `roadmap-estimate-${id}`, name, price, portion: '1 phần · tự nấu', mode: 'cook', address: '', priceSource: 'Dự trù Sổ Ví · nguyên liệu chợ, chưa xác minh giá tại quán', pricedAt: day, estimated: true, allergens: [] }))];
}
export function mealFitsSlot(meal: MealOption, index: number, mealsPerDay: number) {
  if (!isPlanningEstimate(meal)) return true;
  const item = [...meals, ...cooked].find(([id]) => meal.id === `roadmap-estimate-${id}`);
  const slot = mealsPerDay === 3 ? ['sang', 'trua', 'toi'][index] : mealsPerDay === 2 ? ['trua', 'toi'][index] : index === 0 ? 'trua' : undefined;
  return !!item && (item[4] as readonly string[]).includes(slot ?? '');
}
export function mealGroup(meal: MealOption) { return [...meals, ...cooked].find(([id]) => meal.id === `roadmap-estimate-${id}`)?.[3] ?? meal.name.toLowerCase(); }
