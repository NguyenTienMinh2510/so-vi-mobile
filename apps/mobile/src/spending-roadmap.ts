import { money, parseMoneyInput, timestamp } from './domain.ts';
import { validatePreferences, type MealOption, type Preferences } from './spending.ts';

export const normalizeRoadmapText = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();
export function assertRoadmapArea(area: string) {
  const text = normalizeRoadmapText(area);
  const districts = [...text.matchAll(/(?:quan|q\.?|district)\s*(\d+)/g)];
  if (districts.some(m => Number(m[1]) !== 10) || /ha noi|hanoi|da nang|da lat|hai phong|hue\b|nha trang|vung tau|bien hoa|binh duong|dong nai|can tho|thu duc|binh thanh|tan binh|tan phu|phu nhuan|go vap|binh tan|huyen|district\s*[^\d\s]/.test(text)) throw new Error('Nguồn miễn phí hiện chỉ hỗ trợ Quận 10, TP.HCM.');
  if (/\b(?:tp|thanh pho|city)\b/.test(text) && !/ho chi minh|hcm|sai gon/.test(text)) throw new Error('Nguồn miễn phí hiện chỉ hỗ trợ Quận 10, TP.HCM.');
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
    if (frequency && !/^\s*(?:(?:moi|mot|trong|hang|\/)\s*)?(?:7\s*ngay|tuan|week)\s*$/.test(frequency[1])) throw new Error('Tần suất chỉ hỗ trợ mỗi tuần hoặc mỗi 7 ngày. Ghi rõ kỳ này; không đổi số lần theo ngày/tháng/năm thành tuần.');
  }
}
export function parseRoadmapPrompt(text: string, today: string) {
  if (typeof text !== 'string' || !text.trim() || text.length > 1000) throw new Error('Mô tả roadmap từ 1 đến 1.000 ký tự.');
  timestamp(`${today}T00:00:00.000Z`); assertRoadmapArea(text);
  const normalized = normalizeRoadmapText(text);
  assertFrequencyPeriods(text);
  if (!/(?:quan|q\.?|district)\s*10\b/.test(normalized)) throw new Error('Ghi rõ Quận 10 trong mô tả; nguồn miễn phí hiện chỉ hỗ trợ khu vực này.');
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
  let rest = normalized.replace(/\d{4}-\d{2}-\d{2}/g, '').replace(/\d+\s*ngay\b/g, (value, offset: number, original: string) => /(?:moi|mot|trong|hang|\/)\s*$/.test(original.slice(0, offset)) ? value : '').replace(/\d+\s*bua\s*(?:\/\s*ngay|moi ngay|mot ngay)/g, '');
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
  const preferenceText = text.replace(/\d{4}-\d{2}-\d{2}|\d+\s*bữa\s*(?:\/\s*ngày|mỗi ngày|một ngày)/gi, '').replace(/\d+\s*ngày\b/gi, (value, offset: number, original: string) => /(?:moi|mot|trong|hang|\/)\s*$/.test(normalizeRoadmapText(original.slice(0, offset))) ? value : '')
    .replace(/(?:ngân sách|dự phòng)\s*[:=]?\s*\d+(?:[., ]\d+)*\s*(?:triệu|nghìn|ngàn|VND|đồng|tr|k|đ)?/gi, '')
    .replace(/(?:(?:ngân sách|dự phòng)\s*[:=]?\s*)?\d+(?:[., ]\d+)*\s*(?:triệu|nghìn|ngàn|VND|đồng|tr|k|đ)(?=\s|[,;.]|$)/gi, '')
    .replace(/(?:Quận|q\.?|district)\s*10\b|(?:thành phố|TP\.?)?\s*Hồ Chí Minh|TP\.?\s*HCM|HCM|Sài Gòn|bắt đầu|từ ngày/gi, '').replace(/^[\s,;:.]+|[\s,;:.]+$/g, '').trim();
  return { area: 'Quận 10, TP.HCM', days, budget, reserve, mealsPerDay, startDay, endDay, preferenceText };
}
export function assertRoadmapFoodSafety(text: string, preferences?: Preferences) {
  if (/di ung|allerg|nguyen lieu|thanh phan|an toan|khong (?:co|chua)|khong dung|kieng|chay|vegan|vegetarian|gluten|lactose|halal/.test(normalizeRoadmapText(text)) || preferences?.excludedAllergens.length) throw new Error('Nguồn chưa xác nhận nguyên liệu hoặc dị ứng. Không thể lập roadmap an toàn theo điều kiện này.');
}
export function roadmapAiCatalog(text: string, catalog: MealOption[]): MealOption[] {
  assertFrequencyPeriods(text);
  const required: MealOption[] = [], liked: MealOption[] = [], representatives: MealOption[] = [];
  for (const clause of normalizeRoadmapText(text).split(/[,;]/).map(v => v.trim()).filter(Boolean)) {
    const name = clause.replace(/^(?:an|thich|uu tien|khong an|khong thich|bo mon|loai tru)\s+/, '').replace(/\s*(?:it nhat|toi da|dung)\s*\d+.*/, '').trim();
    const matches = catalog.filter(m => name.length > 1 && name.split(/\s+(?:va|hoac)\s+/).some(part => normalizeRoadmapText(m.name).includes(part)));
    if (/^(?:thich|uu tien)\s+/.test(clause) && !/(?:it nhat|toi da|dung)\s*\d+/.test(clause)) { liked.push(...matches); if (matches[0]) representatives.push(matches[0]); }
    else required.push(...matches);
  }
  const mustKeep = [...new Map([...required, ...representatives].map(m => [m.id, m])).values()];
  if (mustKeep.length > 6) throw new Error('Điều kiện bắt buộc khớp hơn 6 món cho AI local. Dùng tên món cụ thể hơn; không bỏ món được yêu cầu.');
  const venues = [...new Set(catalog.map(m => m.priceSource))].map(source => catalog.filter(m => m.priceSource === source));
  const diverse: MealOption[] = [];
  for (let i = 0; i < Math.max(0, ...venues.map(menu => menu.length)); i++) for (const menu of venues) if (menu[i]) diverse.push(menu[i]);
  return [...new Map([...mustKeep, ...liked, ...diverse].map(m => [m.id, m])).values()].slice(0, 6);
}
export function roadmapAiAliases(catalog: MealOption[]): MealOption[] {
  if (!Array.isArray(catalog) || catalog.length < 1 || catalog.length > 6 || new Set(catalog.map(m => m.id)).size !== catalog.length) throw new Error('AI local cần 1–6 món có mã riêng.');
  return catalog.map((meal, i) => ({ ...meal, allergens: [...meal.allergens], id: `m${i + 1}` }));
}
export function restoreRoadmapAiPreferences(proposed: Preferences, catalog: MealOption[]): Preferences {
  const aliases = roadmapAiAliases(catalog); validatePreferences(proposed, aliases);
  const stableIds = new Map(aliases.map((meal, i) => [meal.id, catalog[i].id]));
  const restored: Preferences = { likedIds: proposed.likedIds.map(id => stableIds.get(id)!), excludedIds: proposed.excludedIds.map(id => stableIds.get(id)!), excludedAllergens: [...proposed.excludedAllergens], frequency: proposed.frequency.map(item => ({ ...item, mealId: stableIds.get(item.mealId)! })) };
  return validatePreferences(restored, catalog);
}
export function reviewRoadmapPreferences(text: string, proposed: Preferences, catalog: MealOption[]) {
  validatePreferences(proposed, catalog); assertRoadmapFoodSafety(text, proposed);
  assertFrequencyPeriods(text);
  const normalized = normalizeRoadmapText(text);
  const clauses = normalized.split(/[,;.]/).map(x => x.trim()).filter(Boolean);
  const allowedLikes = new Set<string>(), allowedExclusions = new Set<string>(), requestedFrequency = new Set<string>();
  for (const clause of clauses) {
    const exclusion = clause.match(/(?:khong an|khong thich|bo mon|loai tru)\s+(.+)/);
    if (exclusion) {
      const names = exclusion[1].split(/\s+(?:va|hoac)\s+/).map(x => x.trim());
      for (const name of names) {
        const found = catalog.filter(m => normalizeRoadmapText(m.name).includes(name));
        found.forEach(m => allowedExclusions.add(m.id));
        if (!found.length || found.some(m => !proposed.excludedIds.includes(m.id))) throw new Error('AI chưa hiểu đủ món không ăn. Sửa mô tả bằng tên món có trong nguồn rồi thử lại.');
      }
    }
    const frequency = clause.match(/(.+?)\s*(it nhat|toi da|dung)\s*(\d+)\s*(?:lan|bua)/);
    if (frequency) {
      const name = frequency[1].replace(/^an\s+/, '').trim(), count = Number(frequency[3]);
      const found = catalog.filter(m => normalizeRoadmapText(m.name).includes(name));
      if (found.length !== 1) throw new Error('Tần suất cần tên một món cụ thể trong nguồn.');
      const item = proposed.frequency.find(f => f.mealId === found[0].id);
      requestedFrequency.add(found[0].id);
      if (!item || item.min !== (frequency[2] === 'toi da' ? 0 : count) || item.max !== (frequency[2] === 'it nhat' ? 21 : count)) throw new Error('AI trả về tần suất khác yêu cầu. Thử lại hoặc sửa mô tả.');
    }
    const liked = clause.match(/^(?:thich|uu tien)\s+(.+)/);
    if (liked && !frequency) {
      const found = catalog.filter(m => normalizeRoadmapText(m.name).includes(liked[1]));
      found.forEach(m => allowedLikes.add(m.id));
      if (!found.length || !found.some(m => proposed.likedIds.includes(m.id))) throw new Error('AI chưa giữ món được thích. Sửa mô tả theo tên món có trong nguồn rồi thử lại.');
    }
    if (/khong|chi an|bat buoc|tranh|han che|moi|tuan|lan|it nhat|toi da|dung\s*\d/.test(clause) && !exclusion && !frequency) throw new Error('Điều kiện ăn uống chưa rõ. Dùng tên món và số lần cụ thể.');
    if (!exclusion && !frequency && !liked) throw new Error('Còn nội dung chưa hiểu trong mô tả. Dùng Quận 10, kỳ/ngân sách và “thích”, “không ăn” hoặc tần suất theo tên món.');
  }
  if (proposed.likedIds.some(id => !allowedLikes.has(id)) || proposed.excludedIds.some(id => !allowedExclusions.has(id)) || proposed.frequency.some(f => !requestedFrequency.has(f.mealId))) throw new Error('AI tự thêm sở thích hoặc điều kiện chưa được yêu cầu. Thử lại với tên món cụ thể.');
  if (proposed.frequency.length && !/\d+\s*(?:lan|bua)/.test(normalized)) throw new Error('AI tự thêm tần suất chưa được yêu cầu.');
  if (/khong|chi an|bat buoc|tranh|han che|moi|tuan|lan/.test(normalized) && !clauses.some(c => /khong an|khong thich|bo mon|loai tru|(?:it nhat|toi da|dung)\s*\d+/.test(c))) throw new Error('Điều kiện ăn uống chưa rõ. Dùng tên món và số lần cụ thể.');
  return proposed;
}
