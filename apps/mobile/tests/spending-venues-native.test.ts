import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('native catalog opens only release-specific food DB read-only, retries a failed asset import and obeys cancellation',async()=>{
 const require=createRequire(import.meta.url),ts=require('typescript'),calls:string[]=[],exports:any={};let unavailable=true;
 const db={getFirstAsync:async()=>({value:JSON.stringify({release:'2026-09-23.1'})}),execAsync:async(sql:string)=>calls.push(sql),closeAsync:async()=>calls.push('close')};
 runInNewContext(ts.transpileModule(readFileSync(new URL('../src/spending-venues-native.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,Error,require:(name:string)=>{
  if(name==='expo-sqlite')return {importDatabaseFromAssetAsync:async(file:string)=>{calls.push(`import:${file}`);if(unavailable)throw Error('missing asset');},openDatabaseAsync:async(file:string)=>{calls.push(`open:${file}`);return db;}};
  if(name==='./spending-venues')return {searchFoodVenues:async()=>[]};
  if(name.endsWith('.db'))return 101;
  throw Error(name);
 }});
 await assert.rejects(exports.loadFoodVenues({area:'Quận 10'},new AbortController().signal),/Chưa mở được kho quán/);
 unavailable=false;await exports.loadFoodVenues({area:'Quận 10'},new AbortController().signal);await exports.loadFoodVenues({area:'Quận 10'},new AbortController().signal);
 assert.equal(calls.filter(c=>c.startsWith('open:')).length,1);assert.ok(calls.includes('PRAGMA query_only=ON'));assert.ok(!calls.some(c=>c.includes('sovi.sqlite')));
 const abort=new AbortController();abort.abort();await assert.rejects(exports.loadFoodVenues({area:'Quận 10'},abort.signal),/hủy/);
});
