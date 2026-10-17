import * as thinking from '../src/spending-thinking.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { parseAiPreferences } from '../src/spending.ts';

const meal = { id: 'rice', name: 'Cơm', price: '12000', portion: '1 bữa', mode: 'out' as const, address: '', priceSource: 'Giá giả', pricedAt: '2026-10-13', estimated: false, allergens: [] };
const result = { likedIds: ['rice'], excludedIds: [], excludedAllergens: [], frequency: [] };
function harness(native = true) {
  const require = createRequire(import.meta.url), ts = require('typescript');
  const code = ts.transpileModule(readFileSync(new URL('../src/spending-ai.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const files = new Set(['file:///Documents/SoViAI/model.gguf']); let verification = true, failMove = false;
  const prompts: any[] = [], completions: any[] = [];
  const calls: string[] = [], timers: (() => void)[] = []; let resolveLoad: ((value: any) => void) | null = null, pauseLoad = false;
  let resolveOutput: ((value: any) => void) | null = null, pauseOutput = false; let output: any = { text: JSON.stringify(result) };
  const context = { release: async () => { calls.push('release'); }, stopCompletion: async () => { calls.push('stop'); resolveOutput?.(output); }, tokenize: async () => ({ tokens: [1, 2] }), completion: async (options: any) => { calls.push('completion'); prompts.push(options.messages); completions.push(options); if (!options.reasoning_format) assert.equal(options.enable_thinking, false); if (pauseOutput) return new Promise(resolve => { resolveOutput = resolve; }); return output; } };
  const fs = { documentDirectory: 'file:///Documents/', getFreeDiskStorageAsync: async () => 10_000_000_000, makeDirectoryAsync: async () => {}, getInfoAsync: async (uri: string) => ({ exists: files.has(uri) }), deleteAsync: async (uri: string) => { calls.push(`delete:${uri}`); files.delete(uri); }, copyAsync: async ({ to }: any) => { files.add(to); }, moveAsync: async ({ from, to }: any) => { if (failMove) throw new Error('move failed'); files.delete(from); files.add(to); }, createDownloadResumable: (_: string, uri: string) => ({ downloadAsync: async () => { calls.push('download'); files.add(uri); return { status: 200 }; }, cancelAsync: async () => { calls.push('cancel-download'); } }) };
  const verifier = { verifyModelAsync: async () => { calls.push('verify'); if (!verification) throw new Error('corrupt model'); return true; }, promoteModelAsync: async () => { if (failMove) throw new Error('move failed'); files.delete('file:///Documents/SoViAI/model.part'); files.add('file:///Documents/SoViAI/model.gguf'); } };
  const appState: any = { currentState: 'active', addEventListener: () => ({ remove() {} }) }; const exports: any = {};
  runInNewContext(code, { exports, console, setTimeout: (f: () => void) => { timers.push(f); return timers.length; }, clearTimeout: () => {}, require: (name: string) => {
    if (name === 'expo') return { requireOptionalNativeModule: () => native ? verifier : null };
    if (name === 'expo-constants') return { default: { executionEnvironment: native ? 'standalone' : 'storeClient' }, ExecutionEnvironment: { StoreClient: 'storeClient' } };
    if (name === 'react-native') return { AppState: appState, Platform: { OS: 'ios' } };
    if (name === 'expo-file-system/legacy') return fs;
    if (name === 'expo-document-picker') return { getDocumentAsync: async () => ({ canceled: false, assets: [{ uri: 'file:///picked/model.gguf', size: 3443763168 }] }) };
    if (name === './spending') return { parseAiPreferences };
    if (name === './spending-thinking') return thinking;
    if (name === 'llama.rn') return { initLlama: async () => { calls.push('load'); if (pauseLoad) return new Promise(resolve => { resolveLoad = resolve; }); return context; } };
    throw new Error(`Unexpected module: ${name}`);
  } });
  return { ai: exports.spendingAi, prompts, completions, calls, files, timers, appState, corrupt: () => { verification = false; }, failMove: () => { failMove = true; }, pauseLoad: () => { pauseLoad = true; }, finishLoad: () => { assert.ok(resolveLoad); resolveLoad(context); }, pauseOutput: () => { pauseOutput = true; }, output: (value: any) => { output = value; } };
}
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
test('native filtered assistant content is the strict JSON boundary, raw output may contain thinking or EOS', async () => {
  const h = harness(); h.output({ text: '<think>private reasoning</think>' + JSON.stringify(result) + ' [end of text]', content: JSON.stringify(result) });
  assert.equal(JSON.stringify(await h.ai.infer('Thích cơm', [meal])), JSON.stringify(result)); assert.ok(h.calls.includes('release'));
});
test('empty, malformed, invalid or interrupted canonical content never falls back to valid raw text', async () => {
  for (const extra of [{content:''}, {content:'<think>bad</think>'}, {content:'{"likedIds":["unknown"],"excludedIds":[],"excludedAllergens":[],"frequency":[]}'}, {content:JSON.stringify(result),interrupted:true}, {content:JSON.stringify(result),truncated:true}, {content:JSON.stringify(result),stopped_limit:1}, {content:JSON.stringify(result),context_full:true}]) {
    const h = harness(); h.output({text:JSON.stringify(result),...extra}); await assert.rejects(()=>h.ai.infer('Thích cơm',[meal])); assert.ok(h.calls.includes('release'));
  }
});
test('venue-name dish aliases reach the local model menu and stay bounded', async () => {
  const h = harness(); h.output({ text: JSON.stringify(result), content: JSON.stringify(result) });
  await h.ai.infer('Thích com', [meal], [], [['com trang', 'com phan']]);
  const system = h.prompts[0][0].content as string;
  assert.match(system, /"aliases":\["com trang","com phan"\]/); assert.match(system, /cách gọi khác/);
  for (const bad of [[['x'], ['y']], [Array(7).fill('a')], [['']], [['a'.repeat(61)]]]) { const b = harness(); await assert.rejects(() => b.ai.infer('Thích cơm', [meal], [], bad as string[][]), /Tên gọi khác/); }
});
test('thinking mode enables Qwen reasoning with a larger bounded context and returns parsed ideas plus the trace', async () => {
  const h = harness(); const reply = JSON.stringify({ likedIds: ['rice'], excludedIds: [], frequency: [], allowCooking: false, tips: ['Ăn cơm buổi trưa.'] });
  h.output({ text: '<think>12k mỗi bữa</think>' + reply, content: reply, reasoning_content: '12k mỗi bữa' });
  const request = { text: 'tiết kiệm', days: 7, mealsPerDay: 3, budget: '400000', reserve: '0', cooking: 'unspecified' as const, menu: [{ id: 'rice', name: 'Cơm', price: '12000', cook: false, breakfast: false, localVenues: 3 }] };
  const result = await h.ai.think(request, [meal]);
  assert.deepEqual(result.preferences.likedIds, ['rice']); assert.deepEqual(result.tips, ['Ăn cơm buổi trưa.']); assert.equal(result.reasoning, '12k mỗi bữa');
  const [system, user] = h.prompts[0]; assert.match(system.content, /SUY NGHĨ/); assert.equal(h.completions[0].enable_thinking, true); assert.equal(h.completions[0].response_format, undefined); assert.equal(h.completions[0].n_predict, 1280); assert.match(user.content, /"trungBinhMoiBuaVND":"19047"/); assert.ok(h.calls.includes('release'));
  for (const bad of [{ ...request, menu: [] }, { ...request, menu: [{ ...request.menu[0], price: '1' }] }, { ...request, cooking: 'maybe' }, { ...request, feedback: 'x'.repeat(501) }]) { const b = harness(); await assert.rejects(() => b.ai.think(bad as any, [meal])); assert.equal(b.prompts.length, 0); }
  const cut = harness(); cut.output({ text: '<think>…', content: '', stopped_limit: true }); await assert.rejects(() => cut.ai.think(request, [meal]), /chưa xong/);
  assert.match(user.content, /"thucDon":"rice\|Cơm\|12000\|ăn ngoài\|không sáng\|quán 3"/);
});
test('thinking time limit stops only the generation and reports an incomplete think for fallback', async () => {
  const h = harness(); h.pauseOutput(); h.output({ text: '<think>đang nghĩ', content: '', interrupted: true });
  const request = { text: '', days: 2, mealsPerDay: 3, budget: '300000', reserve: '0', cooking: 'unspecified' as const, menu: [{ id: 'rice', name: 'Cơm', price: '12000', cook: false, breakfast: false, localVenues: null }] };
  const pending = h.ai.think(request, [meal]); for (let i = 0; i < 20 && !h.calls.includes('completion'); i++) await new Promise(resolve => setImmediate(resolve));
  assert.ok(h.calls.includes('completion'));
  assert.equal(h.timers.length, 1); h.timers[0]();
  await assert.rejects(pending, /^Error: AI suy nghĩ chưa xong/); assert.ok(h.calls.includes('stop')); assert.ok(h.calls.includes('release'));
  for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve));
  assert.match(h.ai.state.error, /chưa xong/); assert.equal(await h.ai.checkModel(), true); // not stuck stopping: the fast mode can start immediately
});
