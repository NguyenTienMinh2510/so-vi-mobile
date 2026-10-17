import { assertRoadmapArea, normalizeRoadmapArea, normalizeRoadmapText } from './spending-roadmap.ts';

export type FoodVenue = { key: string; source: string; id: string; name: string; address: string; lat: number; lon: number; taxonomy: string; status: string | null; release: string; sources: string; licenses: string; distanceKm?: number };
export type VenueQuery = { area: string; dish?: string; dishAliases?: string[]; name?: string; group?: 'bakery' | 'noodles' | 'rice' | 'vegetarian'; origin?: { lat: number; lon: number }; radiusKm?: number; limit?: number };
export type FoodDatabase = { getAllAsync<T>(sql: string, ...params: (string | number)[]): Promise<T[]> };
export const FOOD_NOTICE = 'Overture Places · 2026-09-23.1 · TP.HCM cũ (polygon 2008). Dữ liệu có thể thiếu hoặc cũ; chưa xác minh thực đơn, giá, giờ mở cửa.';
const closed = "lower(replace(coalesce(v.status,''),' ','_')) NOT IN ('permanently_closed','closed')";

export function googleMapsSearch(query: string) {
  if (typeof query !== 'string' || !query.trim() || query.length > 1200) throw new Error('Nội dung tìm bản đồ không hợp lệ.');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
export const venueMapsUrl = (venue: FoodVenue) => googleMapsSearch(`${venue.name} ${venue.address} ${venue.lat},${venue.lon}`);
export function assertGoogleMapsUrl(value: string) {
  const url = new URL(value);
  if (url.origin !== 'https://www.google.com' || url.pathname !== '/maps/search/' || url.username || url.password || url.searchParams.get('api') !== '1' || !url.searchParams.get('query')?.trim() || [...url.searchParams.keys()].some(k => !['api', 'query'].includes(k))) throw new Error('Liên kết Google Maps không hợp lệ.');
  return url.href;
}
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const rad = Math.PI / 180, dlat = (b.lat - a.lat) * rad, dlon = (b.lon - a.lon) * rad;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(Math.sin(dlat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dlon / 2) ** 2)));
}
export function venueEvidence(_venue: FoodVenue) { return 'Gợi ý cần xác minh · tên/phân loại, chưa chứng minh quán bán món này'; }
export function retrievedVenueContext(venues: FoodVenue[]) {
  if (venues.length > 12 || new Set(venues.map(v => v.key)).size !== venues.length) throw new Error('Tập quán truy xuất không hợp lệ.');
  return venues.slice(0, 3).map(v => ({ id: v.key, name: v.name.slice(0, 100), evidence: 'unverified_candidate' as const }));
}
export function validateRetrievedVenueIds(ids: unknown, venues: FoodVenue[]) {
  if (!Array.isArray(ids) || ids.length > 12 || ids.some(id => typeof id !== 'string' || !venues.some(v => v.key === id)) || new Set(ids).size !== ids.length) throw new Error('AI tham chiếu quán ngoài tập truy xuất.');
  return ids.map(id => venues.find(v => v.key === id)!);
}

export async function searchFoodVenues(db: FoodDatabase, query: VenueQuery): Promise<FoodVenue[]> {
  assertRoadmapArea(query.area);
  const limit = query.limit ?? 5;
  if (!Number.isInteger(limit) || limit < 1 || limit > 12 || (query.dish?.length ?? 0) > 200 || (query.name?.length ?? 0) > 200) throw new Error('Giới hạn tìm quán không hợp lệ.');
  const parts = [...new Set(query.area.split(/[,;]/).map(normalizeRoadmapArea).join(',').replace(/\bho chi minh\b/g, ',ho chi minh,').split(',').flatMap(p => p.trim().split(/\s*;\s*/)).filter(Boolean).map(p => p.trim().replace(/^(?:quan (?!\d)|huyen |thanh pho )/, '')))];
  if (!parts.length) return [];
  const params: (string | number)[] = [], filters = [closed];
  for (const part of parts) { filters.push('EXISTS(SELECT 1 FROM venue_areas a WHERE a.venue_key=v.key AND a.area=?)'); params.push(part); }
  const words = normalizeRoadmapText(query.name || query.dish || '').match(/[a-z0-9]+/g) ?? [];
  if ((query.name !== undefined || query.dish !== undefined) && !words.length && !query.group) return [];
  if (query.dishAliases !== undefined && (!query.dish || !Array.isArray(query.dishAliases) || query.dishAliases.length > 8 || query.dishAliases.some(a => typeof a !== 'string' || a.length > 60))) throw new Error('Tên gọi khác của món không hợp lệ.');
  // Other names of the same dish ("hủ tíu" for "hủ tiếu") are exact FTS phrases, never prefix matches.
  const aliasPhrases = [...new Set((query.dishAliases ?? []).map(a => (normalizeRoadmapText(a).match(/[a-z0-9]+/g) ?? []).join(' ')).filter(a => a && a !== words.join(' ')))];
  const groups = { bakery: 'bakery', noodles: 'noodle_restaurant OR ramen_restaurant OR soup_restaurant', rice: 'rice_restaurant', vegetarian: 'vegetarian_restaurant' };
  if (query.group && !Object.hasOwn(groups, query.group)) throw new Error('Nhóm món không hợp lệ.');
  if (words.length || query.group) {
    filters.push('v.rowid IN (SELECT rowid FROM venue_search WHERE venue_search MATCH ?)');
    // The match is a candidate signal only; Vietnamese taxonomy is never menu evidence.
    const match = words.length ? [`name : (${words.map(w => `"${w}"${query.name ? '*' : ''}`).join(' AND ')})`, ...aliasPhrases.map(a => `name : "${a}"`)].join(' OR ') : '';
    params.push([match, query.group ? `taxonomy : (${groups[query.group]})` : ''].filter(Boolean).join(' OR '));
  }
  let order = 'v.key'; const orderParams: (string | number)[] = [];
  if (query.origin) {
    const { lat, lon } = query.origin, radius = query.radiusKm ?? 5;
    if (![lat, lon, radius].every(Number.isFinite) || lat < -85 || lat > 85 || lon < -180 || lon > 180 || radius <= 0 || radius > 50) throw new Error('Vị trí hoặc bán kính không hợp lệ.');
    const dy = radius / 111, dx = radius / (111 * Math.cos(lat * Math.PI / 180));
    filters.push('v.lat BETWEEN ? AND ? AND v.lon BETWEEN ? AND ?'); params.push(lat - dy, lat + dy, lon - dx, lon + dx);
    order = '((v.lat-?)*(v.lat-?) + (v.lon-?)*(v.lon-?)*?)'; orderParams.push(lat, lat, lon, lon, Math.cos(lat * Math.PI / 180) ** 2);
  } else if (query.radiusKm !== undefined) throw new Error('Cần vị trí để lọc khoảng cách.');
  if (query.dish && /[^\x00-\x7f]/.test(query.dish)) { order = `CASE WHEN instr(lower(v.name),?)>0 THEN 0 ELSE 1 END, ${order}`; orderParams.unshift(query.dish.toLowerCase().normalize('NFC')); }
  const rows = await db.getAllAsync<FoodVenue>(`SELECT v.* FROM venues v WHERE ${filters.join(' AND ')} ORDER BY ${order} LIMIT ?`, ...params, ...orderParams, query.origin ? 60 : limit);
  const found = rows.filter(v => typeof v.key === 'string' && v.key === `${v.source}:${v.id}` && typeof v.name === 'string' && typeof v.address === 'string' && Number.isFinite(v.lat) && Number.isFinite(v.lon));
  return query.origin ? found.map(v => ({ ...v, distanceKm: distanceKm(query.origin!, v) })).filter(v => v.distanceKm <= (query.radiusKm ?? 5)).sort((a, b) => a.distanceKm - b.distanceKm).slice(0, limit) : found.slice(0, limit);
}
