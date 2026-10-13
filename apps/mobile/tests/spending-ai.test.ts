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
  let resolveOutput: ((value: any) => void) | null = null, pauseOutput = false; let output = JSON.stringify(result);
  const context = { release: async () => { calls.push('release'); }, stopCompletion: async () => { calls.push('stop'); resolveOutput?.({ text: output }); }, tokenize: async () => ({ tokens: [1, 2] }), completion: async (options: any) => { calls.push('completion'); assert.equal(options.enable_thinking, false); if (pauseOutput) return new Promise(resolve => { resolveOutput = resolve; }); return { text: output }; } };
  const fs = { documentDirectory: 'file:///Documents/', getFreeDiskStorageAsync: async () => 10_000_000_000, makeDirectoryAsync: async () => {}, getInfoAsync: async (uri: string) => ({ exists: files.has(uri) }), deleteAsync: async (uri: string) => { calls.push(`delete:${uri}`); files.delete(uri); }, copyAsync: async ({ to }: any) => { files.add(to); }, moveAsync: async ({ from, to }: any) => { if (failMove) throw new Error('move failed'); files.delete(from); files.add(to); }, createDownloadResumable: (_: string, uri: string) => ({ downloadAsync: async () => { calls.push('download'); files.add(uri); return { status: 200 }; }, cancelAsync: async () => { calls.push('cancel-download'); } }) };
  const verifier = { verifyModelAsync: async () => { calls.push('verify'); if (!verification) throw new Error('corrupt model'); return true; }, promoteModelAsync: async () => { if (failMove) throw new Error('move failed'); files.delete('file:///Documents/SoViAI/model.part'); files.add('file:///Documents/SoViAI/model.gguf'); } };
  const appState: any = { currentState: 'active', addEventListener: () => ({ remove() {} }) }; const exports: any = {};
  runInNewContext(code, { exports, console, setTimeout: (f: () => void) => { timers.push(f); return timers.length; }, clearTimeout: () => {}, require: (name: string) => {
    if (name === 'expo') return { requireOptionalNativeModule: () => native ? verifier : null };
    if (name === 'expo-constants') return { default: { executionEnvironment: native ? 'standalone' : 'storeClient' }, ExecutionEnvironment: { StoreClient: 'storeClient' } };
    if (name === 'react-native') return { AppState: appState, Platform: { OS: 'ios' } };
    if (name === 'expo-file-system/legacy') return fs;
    if (name === 'expo-document-picker') return { getDocumentAsync: async () => ({ canceled: false, assets: [{ uri: 'file:///picked/model.gguf', size: 1568476256 }] }) };
    if (name === './spending') return { parseAiPreferences };
    if (name === 'llama.rn') return { initLlama: async () => { calls.push('load'); if (pauseLoad) return new Promise(resolve => { resolveLoad = resolve; }); return context; } };
    throw new Error(`Unexpected module: ${name}`);
  } });
  return { ai: exports.spendingAi, calls, files, timers, appState, corrupt: () => { verification = false; }, failMove: () => { failMove = true; }, pauseLoad: () => { pauseLoad = true; }, finishLoad: () => { assert.ok(resolveLoad); resolveLoad(context); }, pauseOutput: () => { pauseOutput = true; }, output: (text: string) => { output = text; } };
}
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
test('Expo Go AI reports unavailable without network, disk or native load', async () => {
  const h = harness(false); await assert.rejects(() => h.ai.infer('Thích cơm', [meal])); assert.equal(h.calls.length, 0);
});
test('native adapter returns only schema checked preferences and always releases context', async () => {
  const h = harness(); const parsed = await h.ai.infer('Thích cơm', [meal]); assert.equal(JSON.stringify(parsed), JSON.stringify(result));
  assert.equal(h.calls.filter(x => x === 'release').length, 1); assert.ok(!h.calls.includes('download'));
  h.output('{"likedIds":["unknown"],"excludedIds":[],"excludedAllergens":[],"frequency":[]}'); await assert.rejects(() => h.ai.infer('Thích cơm', [meal]));
  assert.equal(h.calls.filter(x => x === 'release').length, 2);
});
test('cancel during native load waits for context and rejects late output before next operation', async () => {
  const h = harness(); h.pauseLoad(); const pending = h.ai.infer('Thích cơm', [meal]); const rejected = assert.rejects(() => pending); await settle();
  const cancel = h.ai.cancel(); await assert.rejects(() => h.ai.infer('Thích cơm', [meal])); h.finishLoad(); await cancel; await rejected;
  assert.ok(h.calls.includes('release')); assert.ok(!h.calls.includes('completion'));
});
test('timeout stops active completion and releases context without applying late output', async () => {
  const h = harness(); h.pauseOutput(); const pending = h.ai.infer('Thích cơm', [meal]); const rejected = assert.rejects(() => pending); await settle();
  assert.ok(h.timers.length); h.timers[0](); await rejected; await settle(); assert.ok(h.calls.includes('stop')); assert.ok(h.calls.includes('release'));
});
test('corrupt imported model and promotion failure preserve existing valid file', async () => {
  for (const failure of ['corrupt', 'move']) {
    const h = harness(); failure === 'corrupt' ? h.corrupt() : h.failMove(); await assert.rejects(() => h.ai.importModel());
    assert.ok(h.files.has('file:///Documents/SoViAI/model.gguf')); assert.equal(h.ai.state.phase, 'error');
  }
});
