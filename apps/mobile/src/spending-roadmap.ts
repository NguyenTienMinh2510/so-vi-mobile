import { money, parseMoneyInput, timestamp } from './domain.ts';
import { validatePreferences, type MealOption, type Preferences } from './spending.ts';
import { FOOD_KNOWLEDGE } from './food-knowledge.generated.ts';

export function normalizeRoadmapText(value: string, preferences = false): string {
  const normalized = value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();
  return preferences ? normalized.replace(/(^|[,;.]\s*)(?:minh|em|toi|tui|anh|chi)\s+(?=thich\b|uu tien\b|khong an\b|khong thich\b|bo mon\b|loai tru\b|an\b)/g, '$1') : normalized;
}
export function assertRoadmapArea(area: string) {
  if (typeof area !== 'string' || !area.trim() || area.length > 200 || !/[a-z]/.test(normalizeRoadmapText(area)) || /[<>\/\\?=]|https?:|\b(?:api|javascript)\b/i.test(area)) throw new Error('Ghi rõ khu vực ở Việt Nam, ví dụ Quận 1, TP.HCM hoặc Ninh Kiều, Cần Thơ.');
}
export function normalizeRoadmapArea(area: string) { return normalizeRoadmapText(area).replace(/\b(?:tp\.?\s*hcm|tphcm|hcm|sai gon)\b/g, 'ho chi minh').replace(/\bhanoi\b/g, 'ha noi').replace(/\b(?:q\.?|district)\s*(\d+)\b/g, 'quan $1').replace(/\b(?:thanh pho|tp|tinh|viet nam|vietnam|khu vuc|tai|o)\b\.?/g, ' ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim(); }
export function roadmapAreaMatches(area: string, address: string) {
  const actual = address.split(/[,;]/).map(part => ({ phrase: normalizeRoadmapArea(part), administrative: /^(?:quan|q\.?|district|phuong|huyen|thi xa|thanh pho|tp\.?|tinh)\b/.test(normalizeRoadmapText(part)) }));
  const requested = area.split(/[,;]/).map(normalizeRoadmapArea).filter(Boolean);
  return requested.length > 0 && requested.every(phrase => actual.some(part => part.phrase === phrase || (part.administrative && new RegExp(`(?:^| )${phrase}(?: |$)`).test(part.phrase))));
}
type DishKnowledge = { aliases: readonly string[]; total: number; areas: Readonly<Record<string, number>> };
const dishKnowledge = FOOD_KNOWLEDGE.dishes as Readonly<Record<string, DishKnowledge>>;
const areaTotals = FOOD_KNOWLEDGE.areaTotals as Readonly<Record<string, number>>;
const knowledgeOf = (meal: MealOption) => meal.id.startsWith('roadmap-estimate-') && Object.hasOwn(dishKnowledge, meal.id.slice(17)) ? dishKnowledge[meal.id.slice(17)] : null;
// Names people use for the same dish, mined from venue names. Only Sổ Ví estimates get aliases.
export function dishNames(meal: MealOption): string[] { return [...new Set([normalizeRoadmapText(meal.name), ...(knowledgeOf(meal)?.aliases ?? [])])].filter(Boolean); }
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function matchCatalogDishes(phrase: string, catalog: MealOption[]): MealOption[] {
  const value = normalizeRoadmapText(phrase);
  if (value.length < 2) return [];
  // A name containing the phrase ("bun" → every bún) or a dish name inside the phrase ("bun bo hue dac biet" → bún bò); an exact name beats a containing one, then the longest specific name wins.
  const scored = catalog.map(meal => ({ meal, score: Math.max(0, ...dishNames(meal).map(name => name === value ? 3000 : name.includes(value) ? value.length + 1000 : new RegExp(`(?:^| )${escapeRegExp(name)}(?: |$)`).test(value) ? name.length : 0)) })).filter(item => item.score > 0);
  const best = Math.max(0, ...scored.map(item => item.score));
  return scored.filter(item => item.score === best).map(item => item.meal);
}
export function roadmapKnownArea(area: string): string | null {
  const parts = normalizeRoadmapArea(area).length ? area.split(/[,;]/).map(normalizeRoadmapArea).map(p => p.replace(/^(?:quan (?!\d)|huyen |thanh pho )/, '')).filter(p => Object.hasOwn(areaTotals, p)) : [];
  return parts.sort((a, b) => areaTotals[a] - areaTotals[b])[0] ?? null;
}
/** Venue-name signal count for a dish in the most specific known area; not menu evidence. */
export function localDishSignal(area: string, meal: MealOption): { area: string; venues: number } | null {
  const known = knowledgeOf(meal), key = roadmapKnownArea(area);
  return known && key ? { area: key, venues: known.areas[key] ?? 0 } : null;
}
/** Stable order: dishes with more venues named after them in the area first. */
export function rankMealsForArea(area: string, catalog: MealOption[]): MealOption[] {
  return catalog.map((meal, i) => ({ meal, i, n: localDishSignal(area, meal)?.venues ?? -1 })).sort((a, b) => b.n - a.n || a.i - b.i).map(item => item.meal);
}
export type RoadmapCooking = 'allow' | 'deny' | 'unspecified';
const COOKING_CLAUSE = /^(?:(?:co the|duoc|cho phep|muon|khong|chang|ko)\s+)*(?:(?:the|muon|duoc|co)\s+)?(?:tu\s+)?nau(?:\s+(?:an|com|duoc|o nha|tai nha|it|mot so bua|vai bua|buoi toi|bua toi))*(?:\s+(?:duoc|nhe))?$/;
function promptClauses(text: string) {
  const clauses: string[] = []; let start = 0;
  for (let i = 0; i < text.length; i++) if (text[i] === ',' || text[i] === ';') {
    const before = normalizeRoadmapText(text.slice(start, i)), after = normalizeRoadmapText(text.slice(i + 1));
    if (text[i] === ',' && /^(?:(?:ngan sach|du phong)\s*[:=]?\s*)?\d+(?:,\d+)*$/.test(before) && /^\d+(?:,\d+)*\s*(?:trieu|nghin|ngan|vnd|dong|tr|k|d)\b/.test(after)) continue;
    clauses.push(text.slice(start, i).trim()); start = i + 1;
  }
  clauses.push(text.slice(start).trim()); return clauses.filter(Boolean);
}
function amount(value: string, unit: string): string {
  const factor = /^(tr|trieu)$/.test(unit) ? 1000000n : /^(k|nghin|ngan)$/.test(unit) ? 1000n : 1n;
  let result: string;
  if (factor === 1n) result = parseMoneyInput(value);
  else {
    if (!/^\d+(?:[.,]\d+)?$/.test(value)) throw new Error('Số tiền chưa rõ. Dùng 900k, 1,2 triệu hoặc 900.000 VND.');
    const [whole, fraction = ''] = value.split(/[.,]/); const scale = 10n ** BigInt(fraction.length);
    const raw = BigInt(whole + fraction) * factor;
    if (raw % scale !== 0n) throw new Error('Ngân sách phải là số VND nguyên.');
    result = (raw / scale).toString();
  }
  money(result); return result;
}
function assertFrequencyPeriods(text: string) {
  for (const clause of normalizeRoadmapText(text).split(/[,;]/)) {
    const frequency = clause.match(/(?:it nhat|toi da|dung)\s*\d+\s*(?:lan|bua)(.*)$/);
    if (frequency && frequency[1].trim() && !/^\s*(?:(?:moi|mot|trong|hang|\/)\s*)?(?:7\s*ngay|tuan|week)\s*$/.test(frequency[1])) throw new Error('Tần suất chỉ hỗ trợ mỗi tuần hoặc mỗi 7 ngày. Ghi rõ kỳ này; không đổi số lần theo ngày/tháng/năm thành tuần.');
  }
}
export function parseRoadmapPrompt(text: string, today: string) {
  if (typeof text !== 'string' || !text.trim() || text.length > 1000) throw new Error('Mô tả roadmap từ 1 đến 1.000 ký tự.');
  timestamp(`${today}T00:00:00.000Z`);
  const clauses = promptClauses(text), normalized = clauses.map(value => normalizeRoadmapText(value)).join(', ');
  assertFrequencyPeriods(text);
  const areaParts = clauses.filter(part => !/\d+\s*(?:ngay|bua)|\d{4}-\d{2}-\d{2}|ngan sach|du phong|\d\s*(?:k|tr|trieu|nghin|ngan|vnd|dong|d)\b|thich|uu tien|khong|bo mon|loai tru|chi an|di ung|kieng|it nhat|toi da|dung\s*\d|bat buoc|tranh|han che|nguyen lieu|chay|vegan|halal|gluten|lactose|\bnau\b|suy nghi/.test(normalizeRoadmapText(part)));
  let area = areaParts.join(', '); assertRoadmapArea(area);
  if (/^(?:quan|q\.?)\s*10$/i.test(normalizeRoadmapText(area))) area = 'Quận 10, TP.HCM';
  const financeText = normalized.replace(/\d{4}-\d{2}-\d{2}/g, '');
  if (/[+-]\s*\d/.test(financeText) || [...financeText.matchAll(/\d+(?:[.,]\d+)*\s*([a-z]+)/g)].some(m => /^(?:k|tr|vnd|nghin|ngan)/.test(m[1]) && !/^(?:k|tr|trieu|vnd|nghin|ngan)$/.test(m[1]))) throw new Error('Số tiền có dấu hoặc đơn vị không rõ.');
  const dates = [...normalized.matchAll(/\d{4}-\d{2}-\d{2}/g)];
  if (dates.length > 1) throw new Error('Chỉ nhập một ngày bắt đầu YYYY-MM-DD.');
  const startDay = dates[0]?.[0] ?? today; timestamp(`${startDay}T00:00:00.000Z`);
  if (/\d+[.,]\d+\s*(?:ngay|bua)/.test(normalized) || /\d+\s*\/\s*\d+\s*(?:ngay|bua)/.test(normalized)) throw new Error('Số ngày và số bữa phải là số nguyên.');
  const duration = [...normalized.matchAll(/(\d+)\s*ngay\b/g)].filter(m => !/(?:moi|mot|trong|hang|\/)\s*$/.test(normalized.slice(0, m.index))), meals = [...normalized.matchAll(/(\d+)\s*bua\s*(?:\/\s*ngay|moi ngay|mot ngay)/g)];
  if (duration.length > 1 || meals.length > 1) throw new Error('Số ngày hoặc số bữa đang có nhiều lựa chọn.');
  const days = Number(duration[0]?.[1] ?? 7), mealsPerDay = Number(meals[0]?.[1] ?? 3);
  if (days < 1 || days > 31 || mealsPerDay < 1 || mealsPerDay > 3) throw new Error('Chọn 1–31 ngày và 1–3 bữa/ngày.');
  let rest = clauses.filter(part => !areaParts.includes(part)).map(value => normalizeRoadmapText(value)).join(', ').replace(/\d{4}-\d{2}-\d{2}/g, '').replace(/\d+\s*ngay\b/g, (value, offset: number, original: string) => /(?:moi|mot|trong|hang|\/)\s*$/.test(original.slice(0, offset)) ? value : '').replace(/\d+\s*bua\s*(?:\/\s*ngay|moi ngay|mot ngay)/g, '');
  const matches = [...rest.matchAll(/(?:ngan sach\s*[:=]?\s*|du phong\s*[:=]?\s*)?[+-]?\d+(?:[., ]\d+)*\s*(?:trieu|nghin|ngan|vnd|dong|tr|k|đ|d(?=\s|,|$))?/g)].filter(m => /ngan sach|du phong|trieu|nghin|ngan|vnd|dong|tr|k|đ|\d\s*d(?:\s|,|$)/.test(m[0]));
  let budget: string | undefined, reserve = '0'; let reserves = 0;
  for (const match of matches) {
    const part = match[0].trim();
    if (/[+-]/.test(part)) throw new Error('Ngân sách và dự phòng không dùng dấu âm hoặc dấu cộng.');
    const parsed = part.match(/^(?:(ngan sach|du phong)\s*[:=]?\s*)?(\d+(?:[., ]\d+)*?)\s*(trieu|nghin|ngan|vnd|dong|tr|k|đ|d)?$/);
    if (!parsed) throw new Error('Số tiền không rõ.');
    const value = amount(parsed[2], parsed[3] ?? 'vnd');
    if (parsed[1] === 'du phong') { if (++reserves > 1) throw new Error('Chỉ nhập một khoản dự phòng.'); reserve = value; }
    else { if (budget !== undefined) throw new Error('Chỉ nhập một ngân sách, không dùng nhiều phương án.'); budget = value; }
    rest = rest.replace(match[0], '');
  }
  if (/ngan sach|du phong/.test(rest) || /\bhoac\s*\d/.test(rest)) throw new Error('Ngân sách hoặc dự phòng chưa rõ.');
  if (!budget || money(budget, { positive: true }) <= money(reserve)) throw new Error('Nhập ngân sách lớn hơn dự phòng, ví dụ 900k.');
  const endDay = new Date(Date.parse(`${startDay}T00:00:00.000Z`) + (days - 1) * 86400000).toISOString().slice(0, 10);
  timestamp(`${endDay}T00:00:00.000Z`);
  // "tự nấu được" / "nấu ở nhà" allows home-cooked estimates; "không nấu" forbids them. Both are plan settings, not food preferences.
  const cookingClauses = clauses.filter(part => COOKING_CLAUSE.test(normalizeRoadmapText(part)));
  const denies = cookingClauses.some(part => /\b(?:khong|chang|ko)\s+(?:the\s+|muon\s+|duoc\s+|co\s+)?(?:tu\s+)?nau\b/.test(normalizeRoadmapText(part)));
  if (denies && cookingClauses.some(part => !/\b(?:khong|chang|ko)\b/.test(normalizeRoadmapText(part)))) throw new Error('Mô tả vừa cho phép vừa không cho tự nấu. Chọn một.');
  const cooking: RoadmapCooking = !cookingClauses.length ? 'unspecified' : denies ? 'deny' : 'allow';
  const preferenceText = clauses.filter(part => {
    const value = normalizeRoadmapText(part);
    const settingsOnly = matches.reduce((rest, match) => rest.replace(match[0].trim(), ''), value).replace(/\b(?:trong\s+)?\d+\s*ngay\b/g, '').trim();
    if (!settingsOnly) return false;
    return !areaParts.includes(part) && !cookingClauses.includes(part) && !matches.some(match => match[0].trim() === value) && !/^\d+\s*ngay$|^\d+\s*bua\s*(?:\/\s*ngay|moi ngay|mot ngay)$|^(?:(?:bat dau|tu ngay)\s*)?\d{4}-\d{2}-\d{2}$/.test(value);
  }).join(', ');
  return { area, days, budget, reserve, mealsPerDay, startDay, endDay, preferenceText, cooking };
}
export function assertRoadmapFoodSafety(text: string, preferences?: Preferences) {
  if (/di ung|allerg|nguyen lieu|thanh phan|an toan|khong (?:co|chua)|khong dung|kieng|chay|vegan|vegetarian|gluten|lactose|halal/.test(normalizeRoadmapText(text)) || preferences?.excludedAllergens.length) throw new Error('Nguồn chưa xác nhận nguyên liệu hoặc dị ứng. Không thể lập roadmap an toàn theo điều kiện này.');
}
// 8 dishes keep every bún/bánh family of the 22 estimates inside the 4B prompt budget.
export const ROADMAP_AI_MEALS = 8;
export function roadmapAiCatalog(text: string, catalog: MealOption[]): MealOption[] {
  assertFrequencyPeriods(text);
  const required: MealOption[] = [], liked: MealOption[][] = [];
  for (const clause of normalizeRoadmapText(text, true).split(/[,;.]/).map(v => v.trim()).filter(Boolean)) {
    const name = clause.replace(/^(?:an|thich|uu tien|khong an|khong thich|bo mon|loai tru)\s+/, '').replace(/\s*(?:it nhat|toi da|dung)\s*\d+.*/, '').trim();
    const matches = [...new Map(name.split(/\s+(?:va|hoac)\s+/).flatMap(part => matchCatalogDishes(part, catalog)).map(m => [m.id, m])).values()];
    if (/^(?:khong an|khong thich|bo mon|loai tru)\s+/.test(clause) || /(?:it nhat|toi da|dung)\s*\d+/.test(clause)) required.push(...matches);
    else if (/^(?:thich|uu tien)\s+/.test(clause) && matches.length) liked.push(matches);
  }
  const mustKeep = [...new Map(required.map(m => [m.id, m])).values()];
  if (mustKeep.length > ROADMAP_AI_MEALS) throw new Error('Điều kiện bắt buộc khớp hơn 8 món cho AI local. Dùng tên món cụ thể hơn; không bỏ món được yêu cầu.');
  for (const matches of liked) if (!matches.some(m => mustKeep.some(kept => kept.id === m.id))) mustKeep.push(matches[0]);
  if (mustKeep.length > ROADMAP_AI_MEALS) throw new Error('Điều kiện và món đại diện cho sở thích cần hơn 8 món cho AI local. Dùng ít điều kiện hơn.');
  const venues = [...new Set(catalog.map(m => m.priceSource))].map(source => catalog.filter(m => m.priceSource === source));
  const diverse: MealOption[] = [];
  for (let i = 0; i < Math.max(0, ...venues.map(menu => menu.length)); i++) for (const menu of venues) if (menu[i]) diverse.push(menu[i]);
  return [...new Map([...mustKeep, ...liked.flat(), ...diverse].map(m => [m.id, m])).values()].slice(0, ROADMAP_AI_MEALS);
}
export function roadmapAiAliases(catalog: MealOption[]): MealOption[] {
  if (!Array.isArray(catalog) || catalog.length < 1 || catalog.length > ROADMAP_AI_MEALS || new Set(catalog.map(m => m.id)).size !== catalog.length) throw new Error('AI local cần 1–8 món có mã riêng.');
  return catalog.map((meal, i) => ({ ...meal, allergens: [...meal.allergens], id: `m${i + 1}` }));
}
export function restoreRoadmapAiPreferences(proposed: Preferences, catalog: MealOption[]): Preferences {
  const aliases = roadmapAiAliases(catalog); validatePreferences(proposed, aliases);
  const stableIds = new Map(aliases.map((meal, i) => [meal.id, catalog[i].id]));
  const restored: Preferences = { likedIds: proposed.likedIds.map(id => stableIds.get(id)!), excludedIds: proposed.excludedIds.map(id => stableIds.get(id)!), excludedAllergens: [...proposed.excludedAllergens], frequency: proposed.frequency.map(item => ({ ...item, mealId: stableIds.get(item.mealId)! })) };
  return validatePreferences(restored, catalog);
}
const EXCLUSION = /^(?:khong an|khong thich|bo mon|loai tru)\s+(.+)$/;
const FREQUENCY = /^(.+?)\s*(it nhat|toi da|dung)\s*(\d+)\s*(?:lan|bua)(?:\s*(?:(?:moi|mot|trong|hang|\/)\s*)?(?:7\s*ngay|tuan|week))?$/;
const LIKED = /^(?:thich|uu tien)\s+(?:an\s+)?(.+)$/;
export function parseRoadmapPreferencesOffline(text: string, catalog: MealOption[]): Preferences | null {
  try {
    if (typeof text !== 'string' || text.length > 1000) return null;
    // Full roadmap prompts and preference-only text use the same strict preference boundary.
    if (/\d\s*(?:k|tr|trieu|vnd|dong)\b/.test(normalizeRoadmapText(text))) text = parseRoadmapPrompt(text, '2000-01-01').preferenceText;
    assertRoadmapFoodSafety(text); assertFrequencyPeriods(text);
    const preferences: Preferences = { likedIds: [], excludedIds: [], excludedAllergens: [], frequency: [] };
    for (const clause of normalizeRoadmapText(text, true).split(/[,;.]/).map(c => c.trim()).filter(Boolean)) {
      const exclusion = clause.match(EXCLUSION), frequency = clause.match(FREQUENCY), liked = clause.match(LIKED);
      if (frequency && !exclusion && !liked) {
        const found = matchCatalogDishes(frequency[1].replace(/^an\s+/, ''), catalog), count = Number(frequency[3]);
        if (found.length !== 1 || count > 21 || !dishNames(found[0]).some(n => n === frequency[1].replace(/^an\s+/, '').trim()) || preferences.frequency.some(f => f.mealId === found[0].id)) return null;
        preferences.frequency.push({ mealId: found[0].id, min: frequency[2] === 'toi da' ? 0 : count, max: frequency[2] === 'it nhat' ? 21 : count });
      } else if ((exclusion || liked) && !frequency) {
        const target = exclusion ? preferences.excludedIds : preferences.likedIds;
        for (const name of (exclusion ?? liked)![1].split(/\s+(?:va|hoac)\s+/)) {
          const found = matchCatalogDishes(name, catalog);
          // Require a known name/alias: do not silently discard qualifiers or unknown foods.
          const normalized = normalizeRoadmapText(name);
          if (!found.length || !found.some(m => dishNames(m).some(n => new RegExp(`(?:^| )${escapeRegExp(normalized)}(?: |$)`).test(n)))) return null;
          target.push(...found.map(m => m.id));
        }
      } else return null;
    }
    preferences.likedIds = [...new Set(preferences.likedIds)]; preferences.excludedIds = [...new Set(preferences.excludedIds)];
    return reviewRoadmapPreferences(text, preferences, catalog);
  } catch { return null; }
}
/** suggestions=true (thinking mode): AI may add soft likes/frequencies, but the user's own exclusions, likes and counts stay exact. */
export function reviewRoadmapPreferences(text: string, proposed: Preferences, catalog: MealOption[], options: { suggestions?: boolean } = {}) {
  const suggestions = options.suggestions === true;
  validatePreferences(proposed, catalog); assertRoadmapFoodSafety(text, proposed);
  assertFrequencyPeriods(text);
  const normalized = normalizeRoadmapText(text, true);
  const clauses = normalized.split(/[,;.]/).map(x => x.trim()).filter(Boolean);
  const allowedLikes = new Set<string>(), allowedExclusions = new Set<string>(), requestedFrequency = new Set<string>();
  for (const clause of clauses) {
    const exclusion = clause.match(EXCLUSION);
    if (exclusion) {
      const names = exclusion[1].split(/\s+(?:va|hoac)\s+/).map(x => x.trim());
      for (const name of names) {
        const found = matchCatalogDishes(name, catalog);
        found.forEach(m => allowedExclusions.add(m.id));
        if (!found.length || found.some(m => !proposed.excludedIds.includes(m.id))) throw new Error('AI chưa hiểu đủ món không ăn. Sửa mô tả bằng tên món có trong nguồn rồi thử lại.');
      }
    }
    const frequency = clause.match(FREQUENCY);
    if (frequency) {
      const name = frequency[1].replace(/^an\s+/, '').trim(), count = Number(frequency[3]);
      const found = matchCatalogDishes(name, catalog);
      if (found.length !== 1) throw new Error('Tần suất cần tên một món cụ thể trong nguồn.');
      const item = proposed.frequency.find(f => f.mealId === found[0].id);
      requestedFrequency.add(found[0].id);
      if (!item || item.min !== (frequency[2] === 'toi da' ? 0 : count) || item.max !== (frequency[2] === 'it nhat' ? 21 : count)) throw new Error('AI trả về tần suất khác yêu cầu. Thử lại hoặc sửa mô tả.');
    }
    const liked = clause.match(LIKED);
    if (liked && !frequency) {
      const found = liked[1].split(/\s+(?:va|hoac)\s+/).flatMap(name => matchCatalogDishes(name, catalog));
      found.forEach(m => allowedLikes.add(m.id));
      if (suggestions && !found.length) continue;
      if (!found.length || !found.some(m => proposed.likedIds.includes(m.id))) throw new Error('AI chưa giữ món được thích. Sửa mô tả theo tên món có trong nguồn rồi thử lại.');
    }
    if (suggestions) continue;
    if (/khong|chi an|bat buoc|tranh|han che|moi|tuan|lan|it nhat|toi da|dung\s*\d/.test(clause) && !exclusion && !frequency) throw new Error('Điều kiện ăn uống chưa rõ. Dùng tên món và số lần cụ thể.');
    if (!exclusion && !frequency && !liked) throw new Error('Còn nội dung chưa hiểu trong mô tả. Dùng Quận 10, kỳ/ngân sách và “thích”, “không ăn” hoặc tần suất theo tên món.');
  }
  if (suggestions) { if (proposed.excludedIds.some(id => !allowedExclusions.has(id))) throw new Error('AI tự loại món người dùng chưa yêu cầu. Thử lại.'); return proposed; }
  if (proposed.likedIds.some(id => !allowedLikes.has(id)) || proposed.excludedIds.some(id => !allowedExclusions.has(id)) || proposed.frequency.some(f => !requestedFrequency.has(f.mealId))) throw new Error('AI tự thêm sở thích hoặc điều kiện chưa được yêu cầu. Thử lại với tên món cụ thể.');
  if (proposed.frequency.length && !/\d+\s*(?:lan|bua)/.test(normalized)) throw new Error('AI tự thêm tần suất chưa được yêu cầu.');
  if (/khong|chi an|bat buoc|tranh|han che|moi|tuan|lan/.test(normalized) && !clauses.some(c => /khong an|khong thich|bo mon|loai tru|(?:it nhat|toi da|dung)\s*\d+/.test(c))) throw new Error('Điều kiện ăn uống chưa rõ. Dùng tên món và số lần cụ thể.');
  return proposed;
}

export const THINKING_MENU = 32;
/** Thinking mode sees the whole estimate menu (≤32) with breakfast fit and local venue-name signal. */
export function thinkingAliases(catalog: MealOption[]): MealOption[] {
  if (!Array.isArray(catalog) || catalog.length < 1 || catalog.length > THINKING_MENU || new Set(catalog.map(m => m.id)).size !== catalog.length) throw new Error('AI suy nghĩ cần 1–32 món có mã riêng.');
  return catalog.map((meal, i) => ({ ...meal, allergens: [...meal.allergens], id: `m${i + 1}` }));
}
export function thinkingMenu(area: string, catalog: MealOption[], fitsBreakfast: (meal: MealOption) => boolean) {
  return thinkingAliases(catalog).map((alias, i) => ({ id: alias.id, name: alias.name, price: alias.price, cook: alias.mode === 'cook', breakfast: fitsBreakfast(catalog[i]), localVenues: localDishSignal(area, catalog[i])?.venues ?? null }));
}
export function restoreThinkingPreferences(proposed: Preferences, catalog: MealOption[]): Preferences {
  const aliases = thinkingAliases(catalog); validatePreferences(proposed, aliases);
  const stable = new Map(aliases.map((meal, i) => [meal.id, catalog[i].id]));
  return validatePreferences({ likedIds: proposed.likedIds.map(id => stable.get(id)!), excludedIds: proposed.excludedIds.map(id => stable.get(id)!), excludedAllergens: [], frequency: proposed.frequency.map(f => ({ ...f, mealId: stable.get(f.mealId)! })) }, catalog);
}
/** Cheapest possible all-eat-out total, so a too-small budget can suggest cooking instead of a bare failure. */
export function minimumEatOutCost(catalog: MealOption[], days: number, mealsPerDay: number, fits: (meal: MealOption, index: number) => boolean): bigint | null {
  let total = 0n;
  for (let index = 0; index < mealsPerDay; index++) {
    const prices = catalog.filter(m => m.mode !== 'cook' && fits(m, index)).map(m => BigInt(m.price));
    if (!prices.length) return null;
    total += prices.reduce((a, b) => a < b ? a : b) * BigInt(days);
  }
  return total;
}
