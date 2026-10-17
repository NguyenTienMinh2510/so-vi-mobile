import * as thinking from '../src/spending-thinking.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { parseAiPreferences } from '../src/spending.ts';

const meal = { id: 'rice', name: 'Cơm', price: '12000', portion: '1 bữa', mode: 'out' as const, address: '', priceSource: 'Giá giả', pricedAt: '2026-10-13', estimated: false, allergens: [] };
const result = { likedIds: ['rice'], excludedIds: [], excludedAllergens: [], frequency: [] };
const request = { text: 'Thích cơm', days: 7, mealsPerDay: 3, budget: '900000', reserve: '0', cooking: 'deny' as const, menu: [{ id: meal.id, name: meal.name, price: meal.price, cook: false, breakfast: true, localVenues: null }] };
type Timer = { callback: () => void; ms: number; cleared: boolean };
function harness(native = true) {
  const require = createRequire(import.meta.url), ts = require('typescript');
  const code = ts.transpileModule(readFileSync(new URL('../src/spending-ai.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const files = new Set(['file:///Documents/SoViAI/model.gguf']); let verification = true, failMove = false;
  const calls: string[] = [], timers: Timer[] = [], initOptions: any[] = [], completions: any[] = [];
  let now = 1000, tokenCount = 2, resolveLoad: ((value: any) => void) | null = null, pauseLoad = false;
  let resolveOutput: ((value: any) => void) | null = null, pauseOutput = false, autoStop = true;
  let resolveRelease: (() => void) | null = null, pauseRelease = false, releaseError = false, stopError = false, wakeError = false;
  let output: string | undefined, completionError = false;
  const context = {
    release: async () => { calls.push('release'); if (releaseError) throw Error('release failed'); if (pauseRelease) await new Promise<void>(resolve => { resolveRelease = resolve; }); calls.push('released'); },
    stopCompletion: async () => { calls.push('stop'); if (stopError) throw Error('stop failed'); if (autoStop) resolveOutput?.({ text: JSON.stringify(result) }); },
    tokenize: async () => ({ tokens: Array(tokenCount).fill(1) }),
    completion: async (options: any) => {
      calls.push('completion'); completions.push(options);
      if (completionError) throw Error('native stopped');
      const text = output ?? JSON.stringify(options.enable_thinking ? { likedIds: ['rice'], excludedIds: [], frequency: [], allowCooking: false, tips: [] } : result);
      const response = pauseOutput ? await new Promise<any>(resolve => { resolveOutput = resolve; }) : { text };
      calls.push('completed'); return response;
    }
  };
  const fs = { documentDirectory: 'file:///Documents/', getFreeDiskStorageAsync: async () => 10_000_000_000, makeDirectoryAsync: async () => {}, getInfoAsync: async (uri: string) => ({ exists: files.has(uri) }), deleteAsync: async (uri: string) => { calls.push(`delete:${uri}`); files.delete(uri); }, copyAsync: async ({ to }: any) => { files.add(to); }, createDownloadResumable: (_: string, uri: string) => ({ downloadAsync: async () => { calls.push('download'); files.add(uri); return { status: 200 }; }, cancelAsync: async () => { calls.push('cancel-download'); } }) };
  const verifier = { verifyModelAsync: async () => { calls.push('verify'); if (!verification) throw new Error('corrupt model'); return true; }, promoteModelAsync: async () => { if (failMove) throw new Error('move failed'); files.delete('file:///Documents/SoViAI/model.part'); files.add('file:///Documents/SoViAI/model.gguf'); } };
  let stateListener: ((state: string) => void) | undefined;
  const appState: any = { currentState: 'active', addEventListener: (_: string, listener: (state: string) => void) => { stateListener = listener; return { remove() {} }; } }; const exports: any = {};
  runInNewContext(code, { exports, console, Error, Date: class extends Date { static now() { return now; } },
    setTimeout: (callback: () => void, ms: number) => { const timer = { callback, ms, cleared: false }; timers.push(timer); return timer; }, clearTimeout: (timer: Timer) => { timer.cleared = true; }, require: (name: string) => {
    if (name === 'expo') return { requireOptionalNativeModule: () => native ? verifier : null };
    if (name === 'expo-constants') return { default: { executionEnvironment: native ? 'standalone' : 'storeClient' }, ExecutionEnvironment: { StoreClient: 'storeClient' } };
    if (name === 'react-native') return { AppState: appState, Platform: { OS: 'ios' } };
    if (name === 'expo-file-system/legacy') return fs;
    if (name === 'expo-document-picker') return { getDocumentAsync: async () => ({ canceled: false, assets: [{ uri: 'file:///picked/model.gguf', size: 3443763168 }] }) };
    if (name === 'expo-keep-awake') return { activateKeepAwakeAsync: async (tag: string) => { assert.equal(tag, 'spending-ai'); calls.push('awake'); if (wakeError) throw Error('wake failed'); }, deactivateKeepAwake: async () => { calls.push('sleep'); if (wakeError) throw Error('sleep failed'); } };
    if (name === './spending') return { parseAiPreferences };
    if (name === './spending-thinking') return thinking;
    if (name === 'llama.rn') return { initLlama: async (options: any) => { calls.push('load'); initOptions.push(options); if (pauseLoad) return new Promise(resolve => { resolveLoad = resolve; }); return context; } };
    throw new Error(`Unexpected module: ${name}`);
  } });
  return { ai: exports.spendingAi, calls, files, timers, appState, initOptions, completions,
    corrupt: () => { verification = false; }, failMove: () => { failMove = true; }, pauseLoad: () => { pauseLoad = true; }, finishLoad: () => { assert.ok(resolveLoad); pauseLoad = false; resolveLoad(context); },
    pauseOutput: (stopSettles = true) => { pauseOutput = true; autoStop = stopSettles; }, finishOutput: () => { assert.ok(resolveOutput); pauseOutput = false; resolveOutput({ text: JSON.stringify(result) }); }, output: (text: string) => { output = text; },
    pauseRelease: () => { pauseRelease = true; }, finishRelease: () => { assert.ok(resolveRelease); pauseRelease = false; resolveRelease(); }, failRelease: () => { releaseError = true; }, failStop: () => { stopError = true; }, failWake: () => { wakeError = true; },
    advance: (ms: number) => { now += ms; }, tokens: (n: number) => { tokenCount = n; }, failCompletion: () => { completionError = true; },
    changeState: (state: string) => { appState.currentState = state; stateListener?.(state); },
    fire: (ms: number) => { const timer = timers.findLast(t => t.ms === ms && !t.cleared); assert.ok(timer, `timer ${ms}`); timer.cleared = true; timer.callback(); }
  };
}
const settle = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
const count = (h: ReturnType<typeof harness>, call: string) => h.calls.filter(x => x === call).length;
test('Expo Go AI reports unavailable without network, disk or native load', async () => {
  const h = harness(false); await assert.rejects(() => h.ai.infer('Thích cơm', [meal])); assert.equal(h.calls.length, 0);
});
test('native adapter checks preferences and reuses idle context even after rejected output', async () => {
  const h = harness(); const parsed = await h.ai.infer('Thích cơm', [meal]); assert.equal(JSON.stringify(parsed), JSON.stringify(result));
  assert.equal(count(h, 'release'), 0); assert.ok(!h.calls.includes('download'));
  h.output('{"likedIds":["unknown"],"excludedIds":[],"excludedAllergens":[],"frequency":[]}'); await assert.rejects(() => h.ai.infer('Thích cơm', [meal]));
  assert.equal(count(h, 'load'), 1); h.fire(30000); await settle(); assert.equal(count(h, 'released'), 1);
});
test('actual adapter shares one context for think -> think -> infer and balances wake locks', async () => {
  const h = harness(), deadline = h.ai.thinkingDeadline();
  await h.ai.think(request, [meal], deadline); await h.ai.think({ ...request, feedback: 'Try again' }, [meal], deadline); await h.ai.infer('Thích cơm', [meal]);
  assert.equal(count(h, 'load'), 1); assert.equal(count(h, 'release'), 0); assert.equal(h.initOptions[0].n_ctx, thinking.THINKING_LIMITS.context);
  assert.deepEqual(h.completions.map(c => c.n_predict), [768, 768, 512]); assert.deepEqual(h.completions.map(c => c.enable_thinking), [true, true, false]);
  assert.equal(count(h, 'awake'), 3); assert.equal(count(h, 'sleep'), 3); assert.ok(h.calls.indexOf('awake') < h.calls.indexOf('load'));
  h.fire(30000); await settle(); assert.equal(count(h, 'released'), 1);
});
test('cancel during native load waits for context and rejects late output before next operation', async () => {
  const h = harness(); h.pauseLoad(); const pending = h.ai.infer('Thích cơm', [meal]); const rejected = assert.rejects(() => pending); await settle();
  const cancel = h.ai.cancel(); await assert.rejects(() => h.ai.infer('Thích cơm', [meal])); h.finishLoad(); await cancel; await rejected;
  assert.equal(count(h, 'release'), 1); assert.equal(count(h, 'completion'), 0);
  await h.ai.infer('Thích cơm', [meal]); assert.equal(count(h, 'load'), 2);
});
test('cancel waits for active completion to settle and release to finish before reinitializing', async () => {
  const h = harness(); h.pauseOutput(false); h.pauseRelease();
  const pending = h.ai.infer('Thích cơm', [meal]), rejected = assert.rejects(() => pending); await settle();
  let cancelled = false; const cancel = h.ai.cancel().then(() => { cancelled = true; }); await settle();
  assert.equal(count(h, 'stop'), 1); assert.equal(count(h, 'release'), 0); assert.equal(cancelled, false);
  h.finishOutput(); await settle(); assert.equal(count(h, 'release'), 1); assert.ok(h.calls.indexOf('completed') < h.calls.indexOf('release'));
  await assert.rejects(() => h.ai.infer('Thích cơm', [meal])); h.finishRelease(); await cancel; await rejected;
  await h.ai.infer('Thích cơm', [meal]); assert.equal(count(h, 'load'), 2); assert.ok(h.calls.lastIndexOf('load') > h.calls.indexOf('released'));
});
test('idle release racing a new run waits for release before loading a fresh context', async () => {
  const h = harness(); await h.ai.infer('Thích cơm', [meal]); h.pauseRelease(); h.fire(30000);
  const next = h.ai.infer('Thích cơm', [meal]); await settle(); assert.equal(count(h, 'load'), 1); assert.equal(count(h, 'completion'), 1);
  h.finishRelease(); await next; assert.equal(count(h, 'load'), 2); assert.ok(h.calls.lastIndexOf('load') > h.calls.indexOf('released'));
});
test('a stale idle callback cannot release a reused context during a new completion', async () => {
  const h = harness(); await h.ai.infer('Thích cơm', [meal]); const stale = h.timers.findLast(t => t.ms === 30000)!;
  h.pauseOutput(); const next = h.ai.infer('Thích cơm', [meal]); await settle(); assert.equal(stale.cleared, true); stale.callback();
  assert.equal(count(h, 'release'), 0); h.finishOutput(); await next; assert.equal(count(h, 'load'), 1);
});
test('cancel during an idle-release/new-run race neither double releases nor starts completion', async () => {
  const h = harness(); await h.ai.infer('Thích cơm', [meal]); h.pauseRelease(); h.fire(30000);
  const next = h.ai.infer('Thích cơm', [meal]), rejected = assert.rejects(() => next); await settle(); const cancel = h.ai.cancel(); await settle();
  assert.equal(count(h, 'release'), 1); assert.equal(count(h, 'stop'), 0); h.finishRelease(); await cancel; await rejected;
  assert.equal(count(h, 'load'), 1); assert.equal(count(h, 'completion'), 1);
});
test('infer timeout stops completion and releases context without applying late output', async () => {
  const h = harness(); h.pauseOutput(); const pending = h.ai.infer('Thích cơm', [meal]); const rejected = assert.rejects(() => pending); await settle();
  h.fire(60000); await rejected; await settle(); assert.ok(h.calls.includes('stop')); assert.ok(h.calls.includes('released')); assert.equal(count(h, 'sleep'), 1);
});
test('thinking timeout signals existing fallback while retaining the context for fast inference', async () => {
  const h = harness(); h.pauseOutput(); const pending = h.ai.think(request, [meal]), rejected = assert.rejects(() => pending, thinking.isThinkingIncomplete); await settle();
  h.fire(150000); await rejected; assert.equal(count(h, 'release'), 0); h.finishOutput();
  await h.ai.infer('Thích cơm', [meal]); assert.equal(count(h, 'load'), 1);
});
test('total thinking budget caps the next attempt and exhausted budget takes fast fallback without reloading', async () => {
  const h = harness(), deadline = h.ai.thinkingDeadline(); assert.equal(deadline, 241000);
  await h.ai.think(request, [meal], deadline); h.advance(150000); await h.ai.think(request, [meal], deadline);
  assert.ok(h.timers.some(t => t.ms === 90000)); h.advance(90000);
  await assert.rejects(() => h.ai.think(request, [meal], deadline), thinking.isThinkingIncomplete);
  await h.ai.infer('Thích cơm', [meal]); assert.equal(count(h, 'load'), 1); assert.equal(count(h, 'completion'), 3);
});
test('model loading consumes the total deadline and cannot start a late thinking completion', async () => {
  const h = harness(), deadline = h.ai.thinkingDeadline(); h.pauseLoad();
  const pending = h.ai.think(request, [meal], deadline), rejected = assert.rejects(() => pending, thinking.isThinkingIncomplete); await settle();
  h.advance(240000); h.fire(150000); h.finishLoad(); await rejected; assert.equal(count(h, 'completion'), 0);
  await h.ai.infer('Thích cơm', [meal]); assert.equal(count(h, 'load'), 1);
});
test('thinking and fast prompt token caps reject before completion and always deactivate wake locks', async () => {
  for (const mode of ['think', 'infer'] as const) {
    const h = harness(); h.tokens(mode === 'think' ? 1601 : 1301);
    await assert.rejects(() => mode === 'think' ? h.ai.think(request, [meal]) : h.ai.infer('Thích cơm', [meal]), /quá dài/);
    assert.equal(count(h, 'completion'), 0); assert.equal(count(h, 'sleep'), 1);
  }
});
test('keep-awake errors cannot fail AI and native completion errors still deactivate the lock', async () => {
  const h = harness(); h.failWake(); await h.ai.infer('Thích cơm', [meal]); assert.equal(count(h, 'sleep'), 1);
  h.failCompletion(); await assert.rejects(() => h.ai.infer('Thích cơm', [meal]), /native stopped/); assert.equal(count(h, 'sleep'), 2);
});
test('inactive app releases an idle context; delete waits for release before removing only model files', async () => {
  const h = harness(); await h.ai.infer('Thích cơm', [meal]); h.changeState('inactive'); await settle(); assert.equal(count(h, 'released'), 1);
  h.changeState('active'); await h.ai.infer('Thích cơm', [meal]); h.pauseRelease(); const deleted = h.ai.deleteModel(); await settle();
  assert.equal(h.calls.filter(c => c.startsWith('delete:')).length, 0); h.finishRelease(); await deleted;
  assert.equal(h.files.size, 0); assert.ok(h.calls.findIndex(c => c.startsWith('delete:')) > h.calls.lastIndexOf('released'));
});
test('stop and release failures preserve cleanupError and block reuse or deletion', async () => {
  for (const failure of ['stop', 'release', 'idle-release']) {
    const h = harness(); await h.ai.infer('Thích cơm', [meal]);
    let pending: Promise<void> | undefined, rejected: Promise<void> | undefined;
    if (failure === 'stop') { h.pauseOutput(false); pending = h.ai.infer('Thích cơm', [meal]); rejected = assert.rejects(() => pending!); await settle(); h.failStop(); } else h.failRelease();
    if (failure === 'idle-release') { h.fire(30000); await settle(); } else { const cancel = h.ai.cancel(); if (failure === 'stop') { await settle(); h.finishOutput(); } await cancel; await rejected; }
    assert.match(h.ai.state.error, failure === 'stop' ? /Chưa dừng được AI/ : /Chưa giải phóng được AI/);
    await assert.rejects(() => h.ai.infer('Thích cơm', [meal])); await assert.rejects(() => h.ai.deleteModel());
    assert.ok(h.files.has('file:///Documents/SoViAI/model.gguf')); assert.equal(count(h, 'load'), 1);
  }
});
test('corrupt imported model and promotion failure preserve existing valid file', async () => {
  for (const failure of ['corrupt', 'move']) {
    const h = harness(); failure === 'corrupt' ? h.corrupt() : h.failMove(); await assert.rejects(() => h.ai.importModel());
    assert.ok(h.files.has('file:///Documents/SoViAI/model.gguf')); assert.equal(h.ai.state.phase, 'error');
  }
});

test('actual screen loop shares its deadline and enters the fast fallback when the repair budget expires', async () => {
  const h = harness(), deadlines: number[] = [], think = h.ai.think.bind(h.ai);
  h.ai.think = (...args: any[]) => { deadlines.push(args[2]); return think(...args); };
  const screen = readFileSync(new URL('../src/spending-roadmap-screen.tsx', import.meta.url), 'utf8');
  const start = screen.indexOf('    if (thinks) try {'), end = screen.indexOf('    } else if (parsed.preferenceText) {', start);
  assert.ok(start > 0 && end > start);
  const logic = screen.slice(start, end) + '    }';
  const require = createRequire(import.meta.url), ts = require('typescript');
  const code = ts.transpileModule(`(async () => { let plan = null, thinkingFellBack = false, allowCooking = false, preferences = {}, thinking; const warnings = []; ${logic}; return { thinkingFellBack, preferences, warnings }; })()`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const preview = await runInNewContext(code, { Error, Date, thinks: true, usesAi: true, parsed: { ...request, preferenceText: request.text }, catalog: [meal], source: {}, spendingAi: h.ai, request: 1, revision: 1, config: {}, old: null,
    setBusy() {}, setWaiting() {}, check() {}, thinkingMenu: () => request.menu, mealFitsSlot: () => true, thinkingAliases: (c: any) => c, restoreThinkingPreferences: (p: any) => p, reviewRoadmapPreferences() {},
    planSpending: () => { h.advance(240000); throw Error('try a cheaper plan'); }, stateFor() {}, errorMessage: (e: Error) => e.message, isThinkingIncomplete: thinking.isThinkingIncomplete,
    roadmapAiCatalog: (_: string, c: any) => c, roadmapAiAliases: (c: any) => c, retrievedVenueContext: () => [], dishNames: () => [], normalizeRoadmapText: (s: string) => s, restoreRoadmapAiPreferences: (p: any) => p
  });
  assert.equal(preview.thinkingFellBack, true); assert.equal(JSON.stringify(preview.preferences), JSON.stringify(result)); assert.equal(preview.warnings.length, 1);
  assert.deepEqual(deadlines, [241000, 241000]); assert.deepEqual(h.completions.map(c => c.enable_thinking), [true, false]); assert.equal(count(h, 'load'), 1);
});
