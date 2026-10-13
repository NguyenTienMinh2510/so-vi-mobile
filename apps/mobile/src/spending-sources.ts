import { localDateKey, timestamp } from './domain.ts';
import { validateMeal, type MealOption } from './spending.ts';
import { assertRoadmapArea, normalizeRoadmapText } from './spending-roadmap.ts';

export const ROADMAP_SOURCES = [
  'https://food.be.com.vn/ho-chi-minh/dieu-lan-quan-chay-hoa-hung-26064',
  'https://food.be.com.vn/ho-chi-minh/ngon-qua-ha-com-tam-com-trua-cach-mang-thang-8-59400',
  'https://food.be.com.vn/ho-chi-minh/com-ga-xoi-mo-co-sau-cach-mang-thang-8-85550',
] as const;
const MAX_PAGE = 2 * 1024 * 1024;
function sourceUrl(url: string) { if (!(ROADMAP_SOURCES as readonly string[]).includes(url)) throw new Error('Địa chỉ nguồn không được hỗ trợ.'); return url; }
function plain(value: string) {
  return value.replace(/<[^>]*>/g, '').replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_, entity: string) => {
    const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
    if (entity[0] !== '#') return named[entity.toLowerCase()];
    const point = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : '';
  }).replace(/\s+/g, ' ').trim();
}
function stableId(url: string, name: string) { let hash = 14695981039346656037n; for (const c of `${url}\n${name}`) hash = BigInt.asUintN(64, (hash ^ BigInt(c.codePointAt(0)!)) * 1099511628211n); return `online-${hash.toString(16).padStart(16, '0')}`; }
export function parseOnlineMenu(html: string, url: string, day: string): MealOption[] {
  sourceUrl(url); timestamp(`${day}T00:00:00.000Z`);
  if (typeof html !== 'string' || new TextEncoder().encode(html).byteLength > MAX_PAGE) throw new Error('Trang thực đơn vượt giới hạn 2 MB.');
  let restaurant: Record<string, unknown> | undefined; let currency = false; let nodes = 0;
  const visit = (value: unknown, depth = 0) => {
    if (++nodes > 10000 || depth > 20) throw new Error('Dữ liệu nguồn quá phức tạp.');
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(v => visit(v, depth + 1)); return; }
    const row = value as Record<string, unknown>;
    if (row.priceCurrency !== undefined) { if (row.priceCurrency !== 'VND') throw new Error('Nguồn không dùng giá VND.'); currency = true; }
    if (row['@type'] === 'Restaurant' || (Array.isArray(row['@type']) && row['@type'].includes('Restaurant'))) {
      if (restaurant) throw new Error('Nguồn có nhiều địa điểm chưa rõ.'); restaurant = row;
    }
    Object.values(row).forEach(v => visit(v, depth + 1));
  };
  for (const match of html.matchAll(/<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    let parsed: unknown; try { parsed = JSON.parse(match[1]); } catch { throw new Error('Dữ liệu địa điểm không hợp lệ.'); } visit(parsed);
  }
  if (!restaurant || typeof restaurant.name !== 'string' || !restaurant.address || typeof restaurant.address !== 'object') throw new Error('Nguồn thiếu địa điểm có cấu trúc.');
  const addressData = restaurant.address as Record<string, unknown>;
  const address = plain(['streetAddress', 'addressLocality', 'addressRegion'].map(k => typeof addressData[k] === 'string' ? addressData[k] : '').filter(Boolean).join(', '));
  const normalized = normalizeRoadmapText(address);
  if (!/(?:quan|q\.?|district)\s*10\b/.test(normalized) || !/ho chi minh|hcm/.test(normalized)) throw new Error('Địa điểm ngoài Quận 10, TP.HCM.');
  assertRoadmapArea(address);
  if (!currency && !(typeof restaurant.priceRange === 'string' && /₫|VND/.test(restaurant.priceRange))) throw new Error('Nguồn chưa xác nhận đơn vị VND.');
  const venue = plain(restaurant.name); const result: MealOption[] = []; const seen = new Set<string>();
  for (const match of html.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article\s*>/gi)) {
    const nameField = match[1].match(/<h4\b[^>]*>([\s\S]*?)<\/h4\s*>/i), priceField = match[1].match(/<data\b[^>]*\bvalue\s*=\s*["']([0-9]+)["'][^>]*>([\s\S]*?)<\/data\s*>/i);
    if (!nameField || !priceField || !/₫|VND/.test(plain(priceField[2]))) continue;
    const name = plain(nameField[1]), key = normalizeRoadmapText(name);
    if (!name || name.length > 200 || /^(?:them|nuoc|tra\b|cafe|ca phe|coca|pepsi|sprite|7up|rau them|com them|sot|topping)/.test(key) || seen.has(key)) continue;
    const price = BigInt(priceField[1]).toString(); if (price === '0') continue;
    const meal: MealOption = { id: stableId(url, key), name, price, portion: `1 phần · ${venue}`, mode: 'out', address, priceSource: url, pricedAt: day, estimated: true, allergens: [] };
    if (result.some(m => m.id === meal.id)) throw new Error('Mã món nguồn bị trùng. Chưa thể dùng thực đơn này.');
    try { validateMeal(meal); } catch { continue; } seen.add(key); result.push(meal); if (result.length === 6) break;
  }
  if (!result.length) throw new Error('Nguồn chưa có món chính với giá VND rõ ràng.');
  return result;
}
function abortError() { return new Error('Đã hủy đọc nguồn. Bản nháp được giữ.'); }
async function waitForSource(signal: AbortSignal) {
  if (signal.aborted) throw abortError();
  await new Promise<void>((resolve, reject) => { const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve(); }, 1000); const cancel = () => { clearTimeout(timer); signal.removeEventListener('abort', cancel); reject(abortError()); }; signal.addEventListener('abort', cancel, { once: true }); });
}
async function readPage(url: string, signal: AbortSignal): Promise<string> {
  const controller = new AbortController(); const cancel = () => controller.abort(); signal.addEventListener('abort', cancel, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const interrupted = new Promise<never>((_, reject) => { controller.signal.addEventListener('abort', () => reject(signal.aborted ? abortError() : new Error('Nguồn quá thời gian 20 giây.')), { once: true }); timer = setTimeout(cancel, 20000); });
  try {
    if (signal.aborted) throw abortError();
    return await Promise.race([interrupted, (async () => {
      const response = await fetch(sourceUrl(url), { method: 'GET', signal: controller.signal, redirect: 'error', credentials: 'omit' });
      if (!response.ok) throw new Error(`Nguồn chưa khả dụng (${response.status}).`);
      if (response.url) sourceUrl(response.url);
      const contentLength = Number(response.headers?.get('content-length') ?? 0); if (contentLength > MAX_PAGE) throw new Error('Trang thực đơn vượt giới hạn 2 MB.');
      if (response.body?.getReader) {
        const reader = response.body.getReader(); const decoder = new TextDecoder(); let bytes = 0, html = '';
        try { while (true) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.byteLength; if (bytes > MAX_PAGE) { controller.abort(); throw new Error('Trang thực đơn vượt giới hạn 2 MB.'); } html += decoder.decode(chunk.value, { stream: true }); } return html + decoder.decode(); }
        finally { if (controller.signal.aborted) { try { await reader.cancel(); } catch { /* Preserve the source error. */ } } reader.releaseLock(); }
      }
      // shortcut: native fetch has no stream reader; reject oversized text before parsing, upgrade with a bounded native transport if providers grow.
      const html = await response.text(); if (new TextEncoder().encode(html).byteLength > MAX_PAGE) throw new Error('Trang thực đơn vượt giới hạn 2 MB.'); return html;
    })()]);
  } finally { clearTimeout(timer); signal.removeEventListener('abort', cancel); }
}
export async function loadOnlineMeals(area: string, signal: AbortSignal): Promise<{ meals: MealOption[]; warnings: string[] }> {
  assertRoadmapArea(area); if (signal.aborted) throw abortError();
  if (!/(?:quan|q\.?|district)\s*10\b/.test(normalizeRoadmapText(area)) || !/ho chi minh|hcm/.test(normalizeRoadmapText(area))) throw new Error('Nguồn miễn phí hiện chỉ hỗ trợ Quận 10, TP.HCM.');
  const meals: MealOption[] = [], warnings: string[] = []; const day = localDateKey(new Date().toISOString(), 'Asia/Ho_Chi_Minh');
  for (let i = 0; i < ROADMAP_SOURCES.length; i++) {
    if (i) await waitForSource(signal); if (signal.aborted) throw abortError();
    try { const html = await readPage(ROADMAP_SOURCES[i], signal); if (signal.aborted) throw abortError(); meals.push(...parseOnlineMenu(html, ROADMAP_SOURCES[i], day)); }
    catch (error) { if (signal.aborted) throw abortError(); warnings.push(`Nguồn ${i + 1}: ${error instanceof Error ? error.message : 'Không đọc được.'}`); }
  }
  if (!meals.length) throw new Error('Chưa đọc được món và giá từ nguồn. Giữ bản nháp; thử lại khi có mạng.');
  if (new Set(meals.map(m => m.id)).size !== meals.length) throw new Error('Mã món giữa các nguồn bị trùng. Chưa thể dùng thực đơn này.');
  return { meals, warnings };
}
