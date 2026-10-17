import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { searchFoodVenues, venueEvidence, googleMapsSearch, venueMapsUrl, assertGoogleMapsUrl, retrievedVenueContext, validateRetrievedVenueIds, type FoodDatabase, type FoodVenue } from '../src/spending-venues.ts';
import { estimatedRoadmapMeals, mealFitsSlot, mealGroup } from '../src/spending-meal-estimates.ts';
import { emptyLedger, applyCommand } from '../src/domain.ts';
import { planSpending, parseAiPreferences } from '../src/spending.ts';

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE venues(key TEXT,source TEXT,id TEXT,name TEXT,address TEXT,lat REAL,lon REAL,taxonomy TEXT,status TEXT,release TEXT,sources TEXT,licenses TEXT); CREATE TABLE venue_areas(area TEXT,venue_key TEXT,PRIMARY KEY(area,venue_key)); CREATE VIRTUAL TABLE venue_search USING fts5(name,taxonomy);`);
  const put = (id: string, name: string, status: string | null, area: string, lat = 10.77, search = 'pho dam') => {
    const key = `overture:${id}`; const result = db.prepare('INSERT INTO venues VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(key,'overture',id,name,`${area}, VN`,lat,106.67,'vietnamese_restaurant',status,'2026-09-23.1','[]','["CDLA-Permissive-2.0"]');
    db.prepare('INSERT INTO venue_search(rowid,name,taxonomy) VALUES(?,?,?)').run(result.lastInsertRowid,search,'vietnamese_restaurant');
    for (const a of [area, 'ho chi minh']) db.prepare('INSERT INTO venue_areas VALUES(?,?)').run(a,key);
  };
  put('one','Phở Đậm',null,'quan 10'); put('closed','Phở Đậm đã đóng','permanently_closed','quan 10'); put('other','Phở Đậm Q1',null,'quan 1'); put('far','Phở Đậm xa',null,'quan 10',10.9); put('prefix','Văn Phòng',null,'quan 10',10.77,'van phong'); put('rural','Phở Đậm huyện',null,'binh chanh'); put('000','Phố',null,'quan 10',10.95,'pho');
  const adapter: FoodDatabase = { getAllAsync: async <T>(sql: string,...params: (string|number)[]) => db.prepare(sql).all(...params) as T[] };
  return { db, adapter };
}
test('food export importer verifies hashes, ignores review set, repeats safely and never writes a ledger', () => {
  execFileSync(process.platform === 'win32' ? 'python' : 'python3', [new URL('./import-food.test.py',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')],{stdio:'pipe'});
});
test('Vietnamese dish/name search uses exact district aliases and whole dish tokens, excludes closed venues',async()=>{
  const {db,adapter}=fixture();
  try {
    for(const dish of ['Phở Đậm','pho dam']) { const rows=await searchFoodVenues(adapter,{area:'Q10, TP.HCM',dish});assert.deepEqual(rows.map(v=>v.id),['far','one']); }
    const all=await searchFoodVenues(adapter,{area:'Quận 10 TP.HCM',dish:'phở'});assert.ok(all.every(v=>v.id!=='prefix'&&v.id!=='other'&&v.id!=='closed'));
    assert.notEqual(all[0].id,'000','accent-exact dishes rank before folded homonyms');
    assert.equal((await searchFoodVenues(adapter,{area:'Bình Chánh, TP.HCM',dish:'pho'}))[0].id,'rural');
    assert.equal((await searchFoodVenues(adapter,{area:'Huyện Bình Chánh, TP.HCM',name:'Phở Đ'}))[0].id,'rural');
    assert.deepEqual(await searchFoodVenues(adapter,{area:'Hà Nội',dish:'pho'}),[]);
    assert.deepEqual(await searchFoodVenues(adapter,{area:'Quận 10, TP.HCM',dish:'sushi'}),[]);
    assert.deepEqual(await searchFoodVenues(adapter,{area:'Quận 10',group:'bakery'}),[]);
    assert.deepEqual(await searchFoodVenues(adapter,{area:'Quận 10',dish:'🍣'}),[]);
    assert.deepEqual(await searchFoodVenues(adapter,{area:'Quận 10',dish:'" OR *; DROP TABLE venues;'}),[]);
    assert.equal((await searchFoodVenues(adapter,{area:'Quận 10',dish:'pho',origin:{lat:10.77,lon:106.67},radiusKm:1})).length,1);
    await assert.rejects(searchFoodVenues(adapter,{area:'Quận 10',limit:13}));
    await assert.rejects(searchFoodVenues(adapter,{area:'Quận 10',origin:{lat:NaN,lon:106}}));
  } finally {db.close();}
});
test('no missing price/menu evidence is promoted; Maps URLs and retrieved IDs are checked',async()=>{
  const {db,adapter}=fixture();try {
    const rows=await searchFoodVenues(adapter,{area:'Quận 10',dish:'pho'}), venue=rows[0];
    assert.match(venueEvidence(venue),/cần xác minh/);assert.equal(Object.hasOwn(venue,'price'),false);assert.equal(Object.hasOwn(venue,'dishes'),false);
    assert.equal(validateRetrievedVenueIds([venue.key],rows)[0],venue);assert.throws(()=>validateRetrievedVenueIds(['invented'],rows));
    assert.equal(retrievedVenueContext(rows)[0].evidence,'unverified_candidate');
    for(const url of [venueMapsUrl(venue),googleMapsSearch('phở Quận 10')]){assert.ok(assertGoogleMapsUrl(url));assert.equal(new URL(url).searchParams.has('query_place_id'),false);}
    assert.throws(()=>assertGoogleMapsUrl('https://evil.example/maps/search/?api=1&query=foo'));
    assert.throws(()=>parseAiPreferences(JSON.stringify({likedIds:[],excludedIds:[],excludedAllergens:[],frequency:[],venueIds:['invented']}),estimatedRoadmapMeals('2026-10-17')));
  }finally{db.close();}
});
test('estimated week respects breakfast, varies dishes/groups and saves/reopens unchanged ledger schema',()=>{
 const catalog=estimatedRoadmapMeals('2026-10-17'), ledger=emptyLedger(), config={id:'food-plan',name:'Quận 10, TP.HCM',startDay:'2026-10-17',endDay:'2026-10-23',timezone:'Asia/Ho_Chi_Minh',budget:'900000',reserve:'0',walletIds:[],categoryIds:[],mealsPerDay:3,allowCooking:false,fixed:[]};
 const plan=planSpending(ledger,config,catalog,{likedIds:[catalog[0].id],excludedIds:[],excludedAllergens:[],frequency:[]},'2026-10-17T05:00:00.000Z');
 assert.ok(plan.meals.filter(s=>s.index===0).every(s=>mealFitsSlot(s.meal,0,3)));assert.ok(new Set(plan.meals.map(s=>s.meal.id)).size>=14);assert.ok(new Set(plan.meals.map(s=>mealGroup(s.meal))).size>=5);
 const saved=applyCommand(ledger,{type:'spending.roadmap.upsert',mutationId:'save-food',payload:{catalog,plan,expectedVersion:null}},{now:'2026-10-17T05:00:00.000Z'});
 assert.equal(saved.transactions.length,0);assert.deepEqual(JSON.parse(JSON.stringify(saved)).spending.plans[0].meals,plan.meals);assert.ok(saved.spending.catalog.every(m=>m.estimated&&m.address===''));
});
