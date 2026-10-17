import { parseAiPreferences, type MealOption, type Preferences } from './spending.ts';

/** Facts the thinking planner may reason over. Prices are Sổ Ví estimates; the app recomputes every đồng. */
export type ThinkingRequest = { text: string; days: number; mealsPerDay: number; budget: string; reserve: string; cooking: 'allow' | 'deny' | 'unspecified'; menu: { id: string; name: string; price: string; cook: boolean; breakfast: boolean; localVenues: number | null }[]; feedback?: string };
export type ThinkingResult = { preferences: Preferences; allowCooking: boolean; tips: string[]; reasoning: string };
// Tuned for iPhone 12 Pro Max (A14, 6 GB, no increased-memory entitlement): 3072 context keeps the KV cache small;
// ~1300 generated tokens is a few minutes at A14 speed. Raise only after on-device timing/RAM measurements.
export const THINKING_LIMITS = { context: 3072, prompt: 1600, predict: 1280, timeoutMs: 360000, menu: 32, tips: 4, tipLength: 200, reasoning: 4000 } as const;
export const THINKING_INCOMPLETE = 'AI suy nghĩ chưa xong trong giới hạn của máy.';
export const isThinkingIncomplete = (error: unknown) => error instanceof Error && error.message.startsWith(THINKING_INCOMPLETE);
/** One compact line per dish ("m1|Bánh mì|25000|sáng|quán 46") costs far fewer prompt tokens than JSON objects. */
export function compactThinkingMenu(menu: ThinkingRequest['menu']) {
  return menu.map(m => [m.id, m.name.replace(/[|\n]/g, ' '), m.price, m.cook ? 'tự nấu' : 'ăn ngoài', m.breakfast ? 'sáng được' : 'không sáng', m.localVenues === null ? '' : `quán ${m.localVenues}`].join('|')).join('\n');
}
const cleanText = (value: string, max: number) => value.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
/** Strict boundary for thinking output: exactly one JSON object with the closed keys, IDs only from the menu. */
export function parseThinkingResult(content: string, catalog: MealOption[], cooking: ThinkingRequest['cooking'], reasoning = ''): ThinkingResult {
  if (typeof content !== 'string' || content.length > 12000) throw new Error('AI suy nghĩ chưa trả về kết quả hợp lệ.');
  const body = content.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```(?:json)?/g, '');
  const start = body.indexOf('{'), end = body.lastIndexOf('}');
  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(body.slice(start, end + 1)); } catch { throw new Error('AI suy nghĩ chưa trả về JSON hợp lệ. Thử lại hoặc dùng chế độ nhanh.'); }
  if (start < 0 || !parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('AI suy nghĩ chưa trả về JSON hợp lệ.');
  const keys = Object.keys(parsed).sort().join(',');
  if (keys !== 'allowCooking,excludedIds,frequency,likedIds,tips' || typeof parsed.allowCooking !== 'boolean' || !Array.isArray(parsed.tips) || parsed.tips.length > THINKING_LIMITS.tips || parsed.tips.some(t => typeof t !== 'string' || t.length > 400)) throw new Error('AI suy nghĩ trả về trường lạ hoặc sai kiểu.');
  if (cooking === 'deny' && parsed.allowCooking) throw new Error('AI đề xuất tự nấu dù mô tả ghi không nấu.');
  const preferences = parseAiPreferences(JSON.stringify({ likedIds: parsed.likedIds, excludedIds: parsed.excludedIds, excludedAllergens: [], frequency: parsed.frequency }), catalog);
  return { preferences, allowCooking: parsed.allowCooking, tips: (parsed.tips as string[]).map(t => cleanText(t, THINKING_LIMITS.tipLength)).filter(Boolean), reasoning: cleanText(reasoning, THINKING_LIMITS.reasoning) };
}
