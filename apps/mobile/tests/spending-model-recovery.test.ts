import * as thinking from '../src/spending-thinking.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const final = 'file:///Documents/SoViAI/model.gguf', part = 'file:///Documents/SoViAI/model.part', bytes = 3443763168;
function harness(entries: [string, number][], failure = '') {
  const localRequire = createRequire(import.meta.url), ts = localRequire('typescript');
  const code = ts.transpileModule(readFileSync(new URL('../src/spending-ai.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const files = new Map(entries), calls: string[] = [], exports: any = {}; let finishVerify: (() => void) | undefined;
  const fs = { documentDirectory: 'file:///Documents/', getFreeDiskStorageAsync: async () => { calls.push('disk'); return failure === 'download-promote' ? 10_000_000_000 : 0; }, makeDirectoryAsync: async () => {},
    getInfoAsync: async (uri: string) => ({ exists: files.has(uri), size: files.get(uri) }),
    deleteAsync: async (uri: string) => { calls.push('delete'); files.delete(uri); },
    createDownloadResumable: () => { calls.push('network'); if (failure !== 'download-promote') throw Error('Network must not start during recovery'); return { downloadAsync: async () => { files.set(part, bytes); return { status: 200 }; }, cancelAsync: async () => {} }; } };
  const verifier = { prepareModelDirectoryAsync: async () => { if (failure === 'path') throw Error('Unsafe model path'); return 'file:///Documents/SoViAI/'; },
    verifyModelAsync: async (uri: string) => { calls.push('verify:' + uri); if (failure === 'hash') throw Error('Checksum mismatch'); assert.equal(files.get(uri), bytes); if (failure === 'paused') return new Promise<boolean>(resolve => { finishVerify = () => resolve(true); }); return true; },
    promoteModelAsync: async () => { calls.push('promote'); if (['promote', 'download-promote'].includes(failure)) throw Error('Promotion interrupted'); files.set(final, files.get(part)!); files.delete(part); } };
  runInNewContext(code, { exports, console, setTimeout, clearTimeout, require: (name: string) => {
    if (name === 'expo') return { requireOptionalNativeModule: () => verifier };
    if (name === 'expo-constants') return { default: { executionEnvironment: 'standalone' }, ExecutionEnvironment: { StoreClient: 'storeClient' } };
    if (name === 'react-native') return { Platform: { OS: 'ios' }, AppState: { currentState: 'active' } };
    if (name === 'expo-file-system/legacy') return fs;
    if (name === 'expo-document-picker') return {};
    if (name === './spending') return {};
    if (name === './spending-thinking') return thinking;
    throw Error('Unexpected module ' + name);
  } });
  return { ai: exports.spendingAi, files, calls, finishVerification: () => finishVerify?.() };
}
test('restart verifies and atomically recovers a completed download before marking it ready', async () => {
  const h = harness([[part, bytes]]);
  assert.equal(await h.ai.checkModel(), true);
  assert.equal(h.ai.state.phase, 'ready'); assert.equal(h.files.get(final), bytes); assert.ok(!h.files.has(part));
  assert.deepEqual(h.calls, ['verify:' + part, 'promote']);
});
test('retry uses the completed download without network or another free3.8GB allocation', async () => {
  const h = harness([[part, bytes]]);
  await h.ai.downloadModel(); assert.equal(h.ai.state.phase, 'ready');
  assert.deepEqual(h.calls, ['verify:' + part, 'promote']);
});
test('already verified current model is preferred over an unrelated leftover candidate', async () => {
  const h = harness([[final, bytes], [part, bytes]]);
  assert.equal(await h.ai.checkModel(), true);
  assert.deepEqual(h.calls, ['verify:' + final]); assert.ok(h.files.has(part));
});
test('incomplete leftover is never promoted or silently accepted as a model', async () => {
  const h = harness([[part, bytes - 1]]);
  assert.equal(await h.ai.checkModel(), false);
  assert.equal(h.ai.state.phase, 'missing'); assert.equal(h.files.get(part), bytes - 1); assert.deepEqual(h.calls, []);
});
test('corrupt full-size candidate and private path failures block recovery and network', async () => {
  for (const failure of ['hash', 'path']) {
    const h = harness([[part, bytes]], failure);
    await assert.rejects(() => h.ai.checkModel(), failure === 'hash' ? /Checksum/ : /Unsafe/);
    assert.equal(h.ai.state.phase, 'error'); assert.ok(h.files.has(part)); assert.ok(!h.files.has(final));
    assert.ok(!h.calls.includes('network')); assert.ok(!h.calls.includes('promote'));
  }
});
test('failed promotion keeps a completed candidate so the next check can retry', async () => {
  const h = harness([[part, bytes]], 'promote');
  await assert.rejects(() => h.ai.checkModel(), /Promotion/);
  assert.equal(h.ai.state.phase, 'error'); assert.equal(h.files.get(part), bytes); assert.ok(!h.files.has(final));
});
test('a previous model of different size can be replaced only by a verified completed candidate', async () => {
  const h = harness([[final, 1568476256], [part, bytes]]);
  assert.equal(await h.ai.checkModel(), true);
  assert.equal(h.files.get(final), bytes); assert.deepEqual(h.calls, ['verify:' + part, 'promote']);
});
test('cancel during recovery cannot promote or delete a completed file when verification replies late', async () => {
  const h = harness([[part, bytes]], 'paused');
  const pending = h.ai.checkModel();
  for (let i = 0; i < 16; i++) await Promise.resolve();
  const cancel = h.ai.cancel(); h.finishVerification(); await cancel;
  await assert.rejects(() => pending, /hủy/);
  assert.equal(h.files.get(part), bytes); assert.ok(!h.files.has(final)); assert.ok(!h.calls.includes('promote'));
});
test('failure after a completed network transfer retains the candidate for a later verified recovery', async () => {
  const h = harness([], 'download-promote');
  await assert.rejects(() => h.ai.downloadModel(), /Promotion/);
  assert.equal(h.files.get(part), bytes); assert.ok(!h.files.has(final)); assert.equal(h.ai.state.phase, 'error');
});
