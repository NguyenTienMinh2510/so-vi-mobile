import { localDateKey } from './domain.ts';
import { estimatedRoadmapMeals } from './spending-meal-estimates.ts';
import { loadFoodVenues } from './spending-venues-native.ts';
import { FOOD_NOTICE } from './spending-venues.ts';
import { rankMealsForArea } from './spending-roadmap.ts';

export async function loadRoadmapMeals(area: string, signal: AbortSignal) {
  let venues: Awaited<ReturnType<typeof loadFoodVenues>> = [];
  const warnings = [FOOD_NOTICE, 'Giá bữa ăn là khoản dự trù Sổ Ví, không phải giá được xác minh tại quán.'];
  try { venues = await loadFoodVenues({ area, limit: 12 }, signal); }
  catch (e) { if (signal.aborted) throw e; warnings.push(e instanceof Error ? e.message : 'Kho quán chưa khả dụng.'); }
  if (signal.aborted) throw new Error('Đã hủy tạo roadmap.');
  if (!venues.length) warnings.push('Chưa có quán khớp khu vực trong kho. Có thể tìm món trên Google Maps ở chi tiết bữa.');
  // Dishes with more venues named after them in this area are tried first by the planner and the AI shortlist.
  return { meals: rankMealsForArea(area, estimatedRoadmapMeals(localDateKey(new Date().toISOString(), 'Asia/Ho_Chi_Minh'))), venues, warnings };
}
