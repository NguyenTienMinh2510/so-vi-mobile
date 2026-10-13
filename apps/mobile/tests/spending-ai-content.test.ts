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
  const calls: string[] = [], timers: (() => void)[] = []; let resolveLoad: ((value: any) => void) | null = null, pauseLoad = false;
  let resolveOutput: ((value: any) => void) | null = null, pauseOutput = false; let output: any = { text: JSON.stringify(result) };
  const context = { release: async () => { calls.push('release'); }, stopCompletion: async () => { calls.push('stop'); resolveOutput?.(output); }, tokenize: async () => ({ tokens: [1, 2] }), completion: async (options: any) => { calls.push('completion'); assert.equal(options.enable_thinking, false); if (pauseOutput) return new Promise(resolve => { resolveOutput = resolve; }); return output; } };
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
    if (name === 'llama.rn') return { initLlama: async () => { calls.push('load'); if (pauseLoad) return new Promise(resolve => { resolveLoad = resolve; }); return context; } };
    throw new Error(`Unexpected module: ${name}`);
  } });
  return { ai: exports.spendingAi, calls, files, timers, appState, corrupt: () => { verification = false; }, failMove: () => { failMove = true; }, pauseLoad: () => { pauseLoad = true; }, finishLoad: () => { assert.ok(resolveLoad); resolveLoad(context); }, pauseOutput: () => { pauseOutput = true; }, output: (value: any) => { output = value; } };
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
