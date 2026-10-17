import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FOOD_KNOWLEDGE } from '../src/food-knowledge.generated.ts';
import { estimatedRoadmapMeals } from '../src/spending-meal-estimates.ts';
import { matchCatalogDishes, dishNames, roadmapKnownArea, localDishSignal, rankMealsForArea, reviewRoadmapPreferences, roadmapAiCatalog, roadmapAiAliases } from '../src/spending-roadmap.ts';
import { searchFoodVenues, type FoodDatabase } from '../src/spending-venues.ts';

const catalog = estimatedRoadmapMeals('2026-10-17');
const id = (dish: string) => `roadmap-estimate-${dish}`;
const ids = (phrase: string) => matchCatalogDishes(phrase, catalog).map(m => m.id).sort();
const root = new URL('../', import.meta.url), path = (p: string) => new URL(p, root).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const empty = { likedIds: [] as string[], excludedIds: [] as string[], excludedAllergens: [] as string[], frequency: [] as { mealId: string; min: number; max: number }[] };

test('generated dish knowledge belongs to the bundled release and covers every estimate', () => {
  const sha = createHash('sha256').update(readFileSync(path('assets/food/sovi-food-2026-09-23.1.db'))).digest('hex');
  assert.equal(FOOD_KNOWLEDGE.release, '2026-09-23.1'); assert.equal(FOOD_KNOWLEDGE.database_sha256, sha); assert.equal(FOOD_KNOWLEDGE.evidence, 'venue_name_signal');
  assert.equal(catalog.length, 30); assert.equal(catalog.filter(m => m.mode === 'out').length, 22);
  for (const meal of catalog.filter(m => m.mode === 'out')) { const known = (FOOD_KNOWLEDGE.dishes as any)[meal.id.slice(17)]; assert.ok(known, meal.id); assert.ok(known.areas['ho chi minh'] === known.total); }
  assert.ok(Object.keys(FOOD_KNOWLEDGE.areaTotals).every(a => !/^(?:phuong|xa) /.test(a)));
});
test('dish aliases map spelling variants, longer dish names and unaccented text to one estimate', () => {
  assert.deepEqual(ids('hủ tíu'), [id('hu-tieu')]); assert.deepEqual(ids('hu tieu nam vang'), [id('hu-tieu')]);
  assert.deepEqual(ids('bún bò Huế đặc biệt'), [id('bun-bo')]); assert.deepEqual(ids('phở bò tái'), [id('pho')]);
  assert.deepEqual(ids('com tam suon bi'), [id('com-tam')]); assert.deepEqual(ids('gà xối mỡ'), [id('com-ga')]);
  assert.deepEqual(ids('bún chả cá Nha Trang'), [id('bun-ca')]); assert.deepEqual(ids('bún chả'), [id('bun-cha')].sort());
  assert.equal(ids('bún').length, 7); assert.deepEqual(ids('x'), []); assert.deepEqual(ids('pizza'), []);
  const own = { ...catalog[0], id: 'my-hu-tieu', name: 'Hủ tiếu nhà làm' };
  assert.deepEqual(dishNames(own), ['hu tieu nha lam']); assert.deepEqual(matchCatalogDishes('hủ tíu', [own]), []);
});
test('reviewer accepts alias wording only for the dish it names and still rejects AI additions', () => {
  reviewRoadmapPreferences('thích hủ tíu', { ...empty, likedIds: [id('hu-tieu')] }, catalog);
  reviewRoadmapPreferences('không ăn bún bò huế', { ...empty, excludedIds: [id('bun-bo')] }, catalog);
  reviewRoadmapPreferences('bun dau mam tom it nhat 2 lan moi tuan', { ...empty, frequency: [{ mealId: id('bun-dau'), min: 2, max: 21 }] }, catalog);
  assert.throws(() => reviewRoadmapPreferences('thích hủ tíu', { ...empty, likedIds: [id('hu-tieu'), id('pho')] }, catalog), /tự thêm/);
  assert.throws(() => reviewRoadmapPreferences('không ăn bún bò huế', { ...empty, excludedIds: [id('bun-rieu')] }, catalog));
  const shortlist = roadmapAiCatalog('không ăn bún', catalog); assert.equal(shortlist.length, 8); assert.equal(roadmapAiAliases(shortlist).at(-1)!.id, 'm8');
  assert.ok(shortlist.filter(m => /^Bún/.test(m.name)).length === 7);
});
test('area knowledge picks the most specific known district and ranks dishes by local venue-name signal', () => {
  assert.equal(roadmapKnownArea('Quận 10, TP.HCM'), 'quan 10'); assert.equal(roadmapKnownArea('Q10'), 'quan 10'); assert.equal(roadmapKnownArea('Bình Thạnh, Hồ Chí Minh'), 'binh thanh');
  assert.equal(roadmapKnownArea('TP.HCM'), 'ho chi minh'); assert.equal(roadmapKnownArea('Ninh Kiều, Cần Thơ'), null);
  const pho = catalog.find(m => m.id === id('pho'))!;
  assert.deepEqual(localDishSignal('Quận 10, TP.HCM', pho), { area: 'quan 10', venues: (FOOD_KNOWLEDGE.dishes.pho.areas as any)['quan 10'] });
  assert.equal(localDishSignal('Ninh Kiều, Cần Thơ', pho), null); assert.equal(localDishSignal('Quận 10', { ...pho, id: 'own' }), null);
  const ranked = rankMealsForArea('Quận 10, TP.HCM', catalog), counts = ranked.map(m => localDishSignal('Quận 10', m)?.venues ?? -1);
  assert.ok(ranked.slice(-8).every(m => m.mode === 'cook'));
  assert.deepEqual(counts, [...counts].sort((a, b) => b - a)); assert.equal(ranked.length, catalog.length);
  assert.deepEqual(rankMealsForArea('Ninh Kiều, Cần Thơ', catalog).map(m => m.id), catalog.map(m => m.id));
});
test('venue lookup adds exact alias phrases from knowledge, never prefixes or unvalidated aliases', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE venues(key TEXT,source TEXT,id TEXT,name TEXT,address TEXT,lat REAL,lon REAL,taxonomy TEXT,status TEXT,release TEXT,sources TEXT,licenses TEXT); CREATE TABLE venue_areas(area TEXT,venue_key TEXT); CREATE VIRTUAL TABLE venue_search USING fts5(name,taxonomy);');
  for (const [n, name, search] of [['1', 'Hủ Tíu Nam Vang Thanh Xuân', 'hu tiu nam vang thanh xuan'], ['2', 'Hủ Tiếu Mực', 'hu tieu muc'], ['3', 'Hủ Tíuz', 'hu tiuz']]) {
    const key = `overture:${n}`, row = db.prepare('INSERT INTO venues VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(key, 'overture', n, name, 'Quận 10, VN', 10.77, 106.67, '{}', null, '2026-09-23.1', '[]', '[]');
    db.prepare('INSERT INTO venue_search(rowid,name,taxonomy) VALUES(?,?,?)').run(row.lastInsertRowid, search, ''); db.prepare('INSERT INTO venue_areas VALUES(?,?)').run('quan 10', key);
  }
  const adapter: FoodDatabase = { getAllAsync: async <T>(sql: string, ...params: (string | number)[]) => db.prepare(sql).all(...params) as T[] };
  const meal = catalog.find(m => m.id === id('hu-tieu'))!;
  assert.deepEqual((await searchFoodVenues(adapter, { area: 'Quận 10', dish: meal.name })).map(v => v.id), ['2']);
  assert.deepEqual((await searchFoodVenues(adapter, { area: 'Quận 10', dish: meal.name, dishAliases: dishNames(meal) })).map(v => v.id).sort(), ['1', '2']);
  await assert.rejects(() => searchFoodVenues(adapter, { area: 'Quận 10', dishAliases: ['hu tiu'] }), /Tên gọi khác/);
  await assert.rejects(() => searchFoodVenues(adapter, { area: 'Quận 10', dish: 'Hủ tiếu', dishAliases: Array(9).fill('a') }), /Tên gọi khác/);
  assert.deepEqual(await searchFoodVenues(adapter, { area: 'Quận 10', dish: 'Hủ tiếu', dishAliases: ['" OR name : *'] }).then(v => v.map(x => x.id)), ['2']);
});
test('knowledge generator is deterministic against the bundled asset and never counts "Phố" as phở', () => {
  const out = join(mkdtempSync(join(tmpdir(), 'sovi-knowledge-')), 'k.ts');
  execFileSync(process.platform === 'win32' ? 'python' : 'python3', [path('scripts/build-food-knowledge.py'), '--output', out], { stdio: 'pipe' });
  assert.equal(readFileSync(out, 'utf8'), readFileSync(path('src/food-knowledge.generated.ts'), 'utf8'));
  const check = `import importlib.util,json,sys\nspec=importlib.util.spec_from_file_location('k',sys.argv[1]);k=importlib.util.module_from_spec(spec);spec.loader.exec_module(k)\nd=k.compile_dishes(json.load(open(sys.argv[2],encoding='utf-8')))\nprint(json.dumps([sorted(k.dishes_in_name(n,d)) for n in ['Phố Nướng','Phở Hòa','Pho 24','Bún Chả Cá 109','Bánh canh - Bún chả cá']]))`;
  const result = JSON.parse(execFileSync(process.platform === 'win32' ? 'python' : 'python3', ['-c', check, path('scripts/build-food-knowledge.py'), path('scripts/food-dishes.json')], { encoding: 'utf8' }));
  assert.deepEqual(result, [[], ['pho'], ['pho'], ['bun-ca'], ['banh-canh', 'bun-ca']]);
});
