import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import * as roadmap from '../src/spending-roadmap.ts';
const bounds={minlat:10,maxlat:11,minlon:106,maxlon:107};
const venue=(id=1,tags:any={})=>({type:'node',id,lat:10.78,lon:106.67,tags:{name:'Quán cơm kiểm thử',amenity:'restaurant','addr:street':'Hòa Hưng','addr:housenumber':'133','addr:district':'Quận 10','addr:city':'Hồ Chí Minh',...tags}});
function harness(options:any={}){
 const ts=createRequire(import.meta.url)('typescript');const calls:any[]=[];let clock=Date.parse('2026-10-13T16:00:00Z');class Clock extends Date{static now(){return clock;} }
 const exports:any={};const fetch=async(url:any,init:any)=>{calls.push({url:String(url),init});if(options.pause)return new Promise(()=>{});if(options.status)return{ok:false,status:options.status,url:String(url),headers:{get:()=>null},text:async()=>''};
 const query=init?.body?decodeURIComponent(String(init.body).replace(/^data=/,'').replace(/\+/g,' ')):new URL(String(url)).searchParams.get('data')??'';
 const isVenue=query.includes('amenity'), isDistrict=query.includes('Quận 10');const mapped={type:'area',id:3600000200,tags:{boundary:'administrative',name:'Quận 10',...options.mappedTags},bounds};let body=isVenue?{elements:[...(options.mapped===false?[]:[mapped]),...(options.venues??[venue()])]}:{elements:options.areas??[{type:'relation',id:isDistrict?200:100,tags:{boundary:'administrative',name:isDistrict?'Quận 10':'Hồ Chí Minh'},bounds}]};if(options.remark&&isVenue)body={...body,remark:'runtime error: timeout'};const text=options.oversize?'x'.repeat(2*1024*1024+1):JSON.stringify(body);
 return{ok:true,status:200,url:options.redirect??String(url),headers:{get:()=>null},text:async()=>text};};
 runInNewContext(ts.transpileModule(readFileSync(new URL('../src/spending-osm.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,URL,AbortController,TextEncoder,TextDecoder,Date:Clock,fetch,console,setTimeout:(fn:any,ms:number)=>{if(ms<=1000)queueMicrotask(fn);return 1;},clearTimeout:()=>{},require:(id:string)=>{if(id.replace('.ts','')==='./spending-roadmap')return roadmap;throw Error(id);}});
 return{load:exports.loadOsmVenues,calls,tick:(ms:number)=>clock+=ms};
}
test('OSM lookup sends only bounded escaped Vietnam area queries and preserves unpriced venues',async()=>{
 const h=harness();const rows=await h.load('Quận 10, TP.HCM',new AbortController().signal);assert.equal(rows.length,1);assert.equal(rows[0].name,'Quán cơm kiểm thử');assert.match(rows[0].id,/node.*1/);assert.equal(rows[0].url,'https://www.openstreetmap.org/node/1');assert.equal(rows[0].price,undefined);assert.ok(h.calls.length<=4);
 for(const c of h.calls){assert.equal(new URL(c.url).origin,'https://overpass-api.de');assert.equal(new URL(c.url).pathname,'/api/interpreter');assert.equal(c.init.credentials,'omit');assert.equal(c.init.redirect,'error');const q=decodeURIComponent(String(c.init.body??new URL(c.url).searchParams.get('data')));assert.ok(!/900k|thích|wallet|ledger/.test(q));assert.match(q,/timeout:20/);assert.match(q,/maxsize:/);}
 assert.ok(h.calls.some(c=>decodeURIComponent(String(c.init.body??c.url)).includes('VN')));
});
test('OSM deduplicates typed IDs and excludes closed, invalid-coordinate and non-food rows',async()=>{
 const h=harness({venues:[venue(),venue(),{...venue(2),lat:99},venue(3,{amenity:'bank'}),venue(4,{disused:'yes'}),{type:'way',id:5,center:{lat:10.79,lon:106.68},tags:{name:'Quán bún',amenity:'fast_food'}}]});const rows=await h.load('Quận 10, TP.HCM',new AbortController().signal);assert.equal(rows.length,2);assert.ok(rows.some((v:any)=>v.url==='https://www.openstreetmap.org/way/5'));
});
test('OSM website and menu tags stay optional safe external links, never automatic fetch or invented price',async()=>{
 const h=harness({venues:[venue(1,{'website:menu':'https://restaurant.example/menu',website:'https://restaurant.example'}),venue(2,{'website:menu':'javascript:alert(1)',website:'http://127.0.0.1/private'}),venue(3,{'website:menu':'https://user:password@example.com/menu',website:'https://localhost/menu'})]});const rows=await h.load('Quận 10, TP.HCM',new AbortController().signal);assert.equal(rows[0].menuUrl,'https://restaurant.example/menu');assert.ok(!rows[1].menuUrl&&!rows[1].website&&!rows[2].menuUrl&&!rows[2].website);assert.ok(h.calls.every(c=>new URL(c.url).hostname==='overpass-api.de'));
});
test('OSM rejects ambiguous area, incomplete remark, oversized body and cross-origin redirects',async()=>{
 for(const options of [{areas:[{type:'relation',id:1,tags:{name:'Hồ Chí Minh',boundary:'administrative'},bounds},{type:'relation',id:2,tags:{name:'Hồ Chí Minh',boundary:'administrative'},bounds}]},{remark:true},{oversize:true},{redirect:'https://evil.test/data'},{areas:[]}]){const h=harness(options);await assert.rejects(()=>h.load('Quận 10, TP.HCM',new AbortController().signal));}
});
test('OSM honors canceled lookup and HTTP rate limits without automatic retries',async()=>{
 const h=harness();const c=new AbortController();c.abort();await assert.rejects(()=>h.load('Quận 10, TP.HCM',c.signal));assert.equal(h.calls.length,0);
 const limited=harness({status:429});await assert.rejects(()=>limited.load('Quận 10, TP.HCM',new AbortController().signal));assert.equal(limited.calls.length,1);
});
test('OSM caches completed area results while returned objects cannot mutate later lookups',async()=>{
 const h=harness();const first=await h.load('Quận 10, TP.HCM',new AbortController().signal);const count=h.calls.length;first[0].name='mutated';const again=await h.load('Quận 10, TP.HCM',new AbortController().signal);assert.equal(h.calls.length,count);assert.notEqual(again[0].name,'mutated');h.tick(6*60*60*1000+1);await h.load('Quận 10, TP.HCM',new AbortController().signal);assert.ok(h.calls.length>count);
});

test('OSM untrusted query syntax and oversized area input cannot broaden a country lookup',async()=>{
 for(const area of ['Quận 10");nwr;out;(','x'.repeat(201),'https://evil.test']){const h=harness();await assert.rejects(()=>h.load(area,new AbortController().signal));assert.equal(h.calls.length,0);}
});

test('missing mapped administrative area is an unresolved search, never cached as no restaurants',async()=>{const h=harness({mapped:false});await assert.rejects(()=>h.load('Quận 10, TP.HCM',new AbortController().signal));});

test('OSM full address tags are preserved for matching a public menu to the exact venue',async()=>{const address='133 Hòa Hưng, Quận 10, Hồ Chí Minh';const h=harness({venues:[venue(1,{'addr:full':address,'addr:street':'','addr:housenumber':'','addr:district':'','addr:city':''})]});assert.equal((await h.load('Quận 10, TP.HCM',new AbortController().signal))[0].address,address);});

test('Overpass requests identify the same real application and enforce a 30-second manual retry cooldown',async()=>{
 for(const status of [406,429]){
  const options={status},h=harness(options),signal=new AbortController().signal;
  await assert.rejects(()=>h.load('Quận 10, TP.HCM',signal));assert.equal(h.calls.length,1);
  assert.equal(h.calls[0].init.headers['User-Agent'],'SoVi-Mobile/0.1.0 (personal roadmap; https://github.com/NguyenTienMinh2510/so-vi-mobile)');
  options.status=0;await assert.rejects(()=>h.load('Quận 10, TP.HCM',signal),/chờ|đợi/i);assert.equal(h.calls.length,1);
  h.tick(29999);await assert.rejects(()=>h.load('Quận 10, TP.HCM',signal));assert.equal(h.calls.length,1);
  h.tick(1);assert.equal((await h.load('Quận 10, TP.HCM',signal)).length,1);
  assert.ok(h.calls.every(c=>c.init.headers['User-Agent']===h.calls[0].init.headers['User-Agent']));
 }
});

test('verified former administrative boundaries resolve with explicit history while current boundaries take precedence',async()=>{
 const tags={name:'Quận 10',type:'boundary',boundary:'historic','was:boundary':'administrative',end_date:'2025-06-30'};
 const old={type:'relation',id:6228121,tags,bounds};
 const h=harness({areas:[old],mappedTags:tags});const rows=await h.load('Quận 10',new AbortController().signal);
 assert.equal(rows.length,1);assert.match(rows[0].areaHistory,/Quận 10/);assert.match(rows[0].areaHistory,/2025-06-30/);assert.equal(rows[0].price,undefined);assert.equal(h.calls.length,2);
 const current=harness({areas:[old,{type:'relation',id:200,tags:{name:'Quận 10',boundary:'administrative'},bounds}]});const today=await current.load('Quận 10',new AbortController().signal);assert.equal(today[0].areaHistory,undefined);assert.ok(decodeURIComponent(current.calls[1].init.body).includes('relation(200)'));
});

test('historic regions fail closed for invalid or future dates, nonadministrative history, ambiguity or mismatched mapped history',async()=>{
 const tags={name:'Quận 10',type:'boundary',boundary:'historic','was:boundary':'administrative',end_date:'2025-06-30'},old={type:'relation',id:6228121,tags,bounds};
 for(const changed of [{end_date:'2025-02-30'},{end_date:'2099-01-01'},{end_date:''},{'was:boundary':'national_park'},{type:'multipolygon'}]){const h=harness({areas:[{...old,tags:{...tags,...changed}}],mappedTags:tags});await assert.rejects(()=>h.load('Quận 10',new AbortController().signal));assert.equal(h.calls.length,1);}
 for(const options of [{areas:[old,{...old,id:6228122}],mappedTags:tags},{areas:[old],mappedTags:{...tags,end_date:'2025-06-29'}},{areas:[old],mappedTags:{boundary:'administrative',name:'Quận 10'}}]){const h=harness(options);await assert.rejects(()=>h.load('Quận 10',new AbortController().signal));}
});
