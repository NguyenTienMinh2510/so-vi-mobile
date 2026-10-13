import { assertRoadmapArea, normalizeRoadmapArea } from './spending-roadmap.ts';

export type OsmVenue = { id: string; name: string; address: string; lat: number; lon: number; url: string; menuUrl?: string; website?: string; areaHistory?: string };
const endpoint = 'https://overpass-api.de/api/interpreter', maxBytes = 2 * 1024 * 1024;
const cache = new Map<string, { at: number; venues: OsmVenue[] }>(); let active = false, requests = 0, retryAfter = 0;
const clone = (venues: OsmVenue[]) => venues.map(venue => ({ ...venue }));
const aborted = () => new Error('Đã hủy tìm quán OpenStreetMap. Bản nháp được giữ.');
export function safeOsmLink(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 1000) return;
  try { const url = new URL(value); const host = url.hostname.toLowerCase(); if (url.protocol !== 'https:' || url.username || url.password || url.port || host === 'localhost' || !host.includes('.') || host.endsWith('.') || /(?:\.local|\.localhost|\.internal|\.lan|\.home)$/.test(host) || /^\[|^\d+\.\d+\.\d+\.\d+$/.test(host)) return; return url.href; } catch { return; }
}
async function pause(signal: AbortSignal) {
  if (signal.aborted) throw aborted();
  await new Promise<void>((resolve, reject) => { const cancel = () => { clearTimeout(timer); signal.removeEventListener('abort', cancel); reject(aborted()); }; const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve(); }, 1000); signal.addEventListener('abort', cancel, { once: true }); });
}
async function query(body: string, signal: AbortSignal): Promise<any[]> {
  if (signal.aborted) throw aborted(); if (requests >= 20) throw new Error('Đã đến giới hạn 20 lượt đọc OpenStreetMap trong phiên này.'); if (requests++) await pause(signal); if (signal.aborted) throw aborted();
  const controller = new AbortController(), cancel = () => controller.abort(); signal.addEventListener('abort', cancel, { once: true }); let timer: ReturnType<typeof setTimeout> | undefined;
  const interrupted = new Promise<never>((_, reject) => { controller.signal.addEventListener('abort', () => reject(signal.aborted ? aborted() : new Error('OpenStreetMap quá thời gian 20 giây.')), { once: true }); timer = setTimeout(cancel, 20000); });
  try { return await Promise.race([interrupted, (async () => {
    const response = await fetch(endpoint, { method: 'POST', credentials: 'omit', redirect: 'error', signal: controller.signal, headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'SoVi-Mobile/0.1.0 (personal roadmap; https://github.com/NguyenTienMinh2510/so-vi-mobile)' }, body: `data=${encodeURIComponent(`[out:json][timeout:20][maxsize:33554432];${body}`)}` });
    if (!response.ok) { if (response.status === 406 || response.status === 429) retryAfter = Date.now() + 30000; throw new Error(`OpenStreetMap chưa khả dụng (${response.status}). Thử lại sau.`); }
    if (response.url && response.url !== endpoint) throw new Error('OpenStreetMap chuyển sang nguồn không được phép.');
    if (Number(response.headers?.get('content-length') ?? 0) > maxBytes) throw new Error('Dữ liệu OpenStreetMap vượt 2 MB.');
    let text = '';
    if (response.body?.getReader) { const reader = response.body.getReader(), decoder = new TextDecoder(); let bytes = 0; try { while (true) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.byteLength; if (bytes > maxBytes) { controller.abort(); throw new Error('Dữ liệu OpenStreetMap vượt 2 MB.'); } text += decoder.decode(chunk.value, { stream: true }); } text += decoder.decode(); } finally { if (controller.signal.aborted) { try { await reader.cancel(); } catch { /* Keep transport error. */ } } reader.releaseLock(); } }
    else { text = await response.text(); if (new TextEncoder().encode(text).byteLength > maxBytes) throw new Error('Dữ liệu OpenStreetMap vượt 2 MB.'); }
    let result: any; try { result = JSON.parse(text); } catch { throw new Error('OpenStreetMap trả dữ liệu không hợp lệ.'); }
    if (!result || result.remark || !Array.isArray(result.elements) || result.elements.length > 100) throw new Error('OpenStreetMap chưa trả đủ dữ liệu hoặc có quá nhiều kết quả.');
    if (signal.aborted) throw aborted(); return result.elements;
  })()]); } finally { clearTimeout(timer); signal.removeEventListener('abort', cancel); }
}
const validId = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const vietnam = (lat: number, lon: number) => Number.isFinite(lat) && Number.isFinite(lon) && lat >= 8 && lat <= 24 && lon >= 102 && lon <= 110;
function historicAdministrative(tags: any): boolean {
  if (tags?.boundary !== 'historic' || tags.type !== 'boundary' || tags['was:boundary'] !== 'administrative' || typeof tags.end_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(tags.end_date)) return false;
  const date = Date.parse(`${tags.end_date}T00:00:00.000Z`);
  return Number.isFinite(date) && new Date(date).toISOString().slice(0, 10) === tags.end_date && tags.end_date < new Date(Date.now()).toISOString().slice(0, 10);
}
export async function loadOsmVenues(area: string, signal: AbortSignal): Promise<OsmVenue[]> {
  assertRoadmapArea(area); if (signal.aborted) throw aborted(); const key = normalizeRoadmapArea(area), cached = cache.get(key);
  if (cached && Date.now() - cached.at < 6 * 60 * 60 * 1000) return clone(cached.venues);
  if (Date.now() < retryAfter) throw new Error('Chờ ít nhất 30 giây sau phản hồi giới hạn của OpenStreetMap rồi thử lại.');
  if (active) throw new Error('Chờ lượt tìm quán OpenStreetMap hiện tại hoàn tất.');
  active = true;
  try {
    const regions = area.split(/[,;]/).map(part => part.trim()).filter(Boolean).reverse(); if (regions.length > 3) throw new Error('Ghi tối đa ba cấp khu vực, từ địa phương đến tỉnh/thành phố.');
    let parent: number | undefined, bounds: any, selectedTags: any; const history: string[] = [];
    for (const region of regions) {
      const normalized = normalizeRoadmapArea(region);
      const aliases = normalized === 'ho chi minh' ? ['Hồ Chí Minh', 'Thành phố Hồ Chí Minh', 'TP.HCM'] : normalized === 'ha noi' ? ['Hà Nội', 'Thành phố Hà Nội'] : [region, `Thành phố ${region}`, `Tỉnh ${region}`, normalized.replace(/\bquan\b/, 'Quận')];
      const names = '^(' + [...new Set(aliases)].map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')$';
      const scope = parent === undefined ? 'area["ISO3166-1"="VN"]["admin_level"="2"]->.scope;' : `relation(${parent});map_to_area->.scope;`;
      const rows = await query(`${scope}(${['name', 'name:vi', 'old_name'].map(tag => `relation(area.scope)["boundary"~"^(administrative|historic)$"][${JSON.stringify(tag)}~${JSON.stringify(names)},i];`).join('')});out body bb 40;`, signal);
      const candidates = [...new Map(rows.filter(row => row?.type === 'relation' && validId(row.id) && (row.tags?.boundary === 'administrative' || historicAdministrative(row.tags)) && ['name', 'name:vi', 'old_name'].some(tag => typeof row.tags[tag] === 'string' && row.tags[tag].split(';').some((value: string) => normalizeRoadmapArea(value) === normalized))).map(row => [row.id, row])).values()];
      const current = candidates.filter(row => row.tags.boundary === 'administrative'), matches = current.length ? current : candidates;
      if (matches.length !== 1) throw new Error('Khu vực OpenStreetMap chưa có hoặc có nhiều kết quả. Ghi rõ quận/huyện và tỉnh/thành phố.');
      const selected = matches[0]; parent = selected.id; bounds = selected.bounds; selectedTags = selected.tags;
      if (selectedTags.boundary === 'historic') history.push(`${region} (đến ${selectedTags.end_date})`);
      if (!bounds || !vietnam(bounds.minlat, bounds.minlon) || !vietnam(bounds.maxlat, bounds.maxlon) || bounds.minlat > bounds.maxlat || bounds.minlon > bounds.maxlon) throw new Error('Ranh giới khu vực OpenStreetMap không hợp lệ.');
    }
    const rows = await query(`relation(${parent!});map_to_area->.scope;.scope out body;nwr(area.scope)["amenity"~"^(restaurant|fast_food|cafe|food_court)$"];out body center 40;`, signal);
    const mapped = rows.filter(row => row?.type === 'area');
    if (mapped.length !== 1 || !validId(mapped[0].id) || mapped[0].tags?.boundary !== selectedTags.boundary || (selectedTags.boundary === 'historic' && (!historicAdministrative(mapped[0].tags) || mapped[0].tags.end_date !== selectedTags.end_date)) || !['name', 'name:vi', 'old_name'].some(tag => typeof mapped[0].tags[tag] === 'string' && mapped[0].tags[tag].split(';').some((value: string) => normalizeRoadmapArea(value) === normalizeRoadmapArea(regions[regions.length - 1])))) throw new Error('Chưa xác định được vùng tìm quán OpenStreetMap. Thử ghi rõ quận/huyện và tỉnh/thành phố.');
    if (rows.length - mapped.length > 40) throw new Error('OpenStreetMap trả quá giới hạn 40 quán.');
    const venues = new Map<string, OsmVenue>();
    for (const row of rows) {
      const tags = row?.tags; if (!['node', 'way', 'relation'].includes(row?.type) || !validId(row.id) || !tags || typeof tags !== 'object' || !['restaurant', 'fast_food', 'cafe', 'food_court'].includes(tags.amenity) || ['disused', 'abandoned', 'demolished', 'closed'].some(tag => tags[tag] === 'yes' || tags[`${tag}:amenity`])) continue;
      const name = typeof tags['name:vi'] === 'string' ? tags['name:vi'].trim() : typeof tags.name === 'string' ? tags.name.trim() : ''; if (!name || name.length > 200) continue;
      const lat = row.type === 'node' ? row.lat : row.center?.lat, lon = row.type === 'node' ? row.lon : row.center?.lon;
      if (typeof lat !== 'number' || typeof lon !== 'number' || !vietnam(lat, lon) || lat < bounds.minlat || lat > bounds.maxlat || lon < bounds.minlon || lon > bounds.maxlon) continue;
      const street = ['addr:housenumber', 'addr:street'].map(tag => typeof tags[tag] === 'string' ? tags[tag] : '').filter(Boolean).join(' ');
      const address = typeof tags['addr:full'] === 'string' && tags['addr:full'].trim() && tags['addr:full'].trim().length <= 500 ? tags['addr:full'].trim() : [street, ...['addr:suburb', 'addr:district', 'addr:city', 'addr:province'].map(tag => typeof tags[tag] === 'string' ? tags[tag] : '')].filter(Boolean).join(', ').slice(0, 500);
      const id = `osm-${row.type}-${row.id}`; venues.set(id, { id, name, address, lat, lon, url: `https://www.openstreetmap.org/${row.type}/${row.id}`, menuUrl: safeOsmLink(tags['website:menu'] ?? tags['contact:menu'] ?? tags.menu), website: safeOsmLink(tags.website ?? tags['contact:website']), ...(history.length ? { areaHistory: history.join('; ') } : {}) });
    }
    const result = [...venues.values()]; if (cache.size >= 8 && !cache.has(key)) cache.delete(cache.keys().next().value!); cache.set(key, { at: Date.now(), venues: clone(result) }); return clone(result);
  } finally { active = false; }
}
