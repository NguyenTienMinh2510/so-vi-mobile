import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as cloudCore from '../src/spending-cloud-core.ts';
import { completeCloud, validateCloudSettings, thinkWithSettings, fastWithSettings } from '../src/spending-cloud-core.ts';
import { parseRoadmapPreferencesOffline, reviewRoadmapPreferences } from '../src/spending-roadmap.ts';
import type { MealOption } from '../src/spending.ts';

const settings = { url: 'https://worker.test', token: 'fake-test-token' };
const catalog: MealOption[] = ['Phở', 'Bún bò'].map((name, i) => ({ id: `m${i + 1}`, name, price: '30000', portion: '1 phần', mode: 'out', address: 'Quận 10', priceSource: 'Giá dự trù', pricedAt: '2026-10-18', estimated: true, allergens: [] }));
test('offline preferences handle full prompts, subjects, exclusions and weekly bounds', () => {
  assert.deepEqual(parseRoadmapPreferencesOffline('quận 10, thích ăn phở, 700k trong 7 ngày', catalog), { likedIds: ['m1'], excludedIds: [], excludedAllergens: [], frequency: [] });
  const text = 'mình thích phở, em không ăn bún bò, phở tối đa 3 lần';
  const result = parseRoadmapPreferencesOffline(text, catalog);
  assert.deepEqual(result, { likedIds: ['m1'], excludedIds: ['m2'], excludedAllergens: [], frequency: [{ mealId: 'm1', min: 0, max: 3 }] });
  assert.equal(reviewRoadmapPreferences(text, result!, catalog), result);
  for (const [text, min, max] of [['phở ít nhất 2 lần mỗi tuần', 2, 21], ['phở đúng 2 lần', 2, 2]] as const) assert.deepEqual(parseRoadmapPreferencesOffline(text, catalog)?.frequency, [{ mealId: 'm1', min, max }]);
  for (const text of ['ăn gì cũng được', 'thích ph', 'thích hở', 'thích phở không hành', 'thích phở và pizza', 'phở đúng 2 lần mỗi ngày', 'dị ứng đậu', 'thích phở, không ăn phở']) assert.equal(parseRoadmapPreferencesOffline(text, catalog), null, text);
});
test('Worker settings require HTTPS and exclude credentials, query secrets and redirects', () => {
  assert.deepEqual(validateCloudSettings({ ...settings, url: 'https://worker.test/v1/complete' }), settings);
  for (const url of ['http://worker.test', 'https://user:pass@worker.test', 'https://worker.test?token=test', 'https://worker.test/other']) assert.throws(() => validateCloudSettings({ ...settings, url }));
  assert.throws(() => validateCloudSettings({ ...settings, token: '' }));
});
test('native client stores URL and token together in device-only unlocked SecureStore', async () => {
  const require = createRequire(import.meta.url), ts = require('typescript'), client: any = {};
  let stored: string | null = null, key = '', options: any;
  const secure = { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only', getItemAsync: async (name: string) => { assert.equal(name, key || 'so-vi.ai-worker'); return stored; }, setItemAsync: async (name: string, value: string, config: any) => { key = name; stored = value; options = config; } };
  runInNewContext(ts.transpileModule(readFileSync(new URL('../src/spending-cloud.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: client, require: (name: string) => name === 'expo-secure-store' ? secure : cloudCore });
  assert.equal(await client.loadCloudSettings(), null);
  await client.saveCloudSettings(settings); assert.equal(options.keychainAccessible, 'device-only');
  assert.deepEqual(await client.loadCloudSettings(), settings);
  await assert.rejects(client.saveCloudSettings({ ...settings, url: 'http://worker.test' })); assert.deepEqual(JSON.parse(stored!), settings);
});
test('cloud reuses strict prompts and parsers and sends only selected roadmap facts', async () => {
  const original = globalThis.fetch; const requests: any[] = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://worker.test/v1/complete'); assert.equal(init?.redirect, 'error');
    const body = JSON.parse(String(init?.body)); requests.push(body);
    assert.deepEqual(Object.keys(body).sort(), body.mode === 'think' ? ['messages', 'mode'] : ['messages', 'mode', 'schema']);
    return Response.json({ content: JSON.stringify(body.mode === 'think' ? { likedIds: ['m1'], excludedIds: [], frequency: [], allowCooking: false, tips: ['Đổi món.'] } : { likedIds: ['m1'], excludedIds: [], excludedAllergens: [], frequency: [] }), reasoning: 'Test reasoning' });
  };
  try {
    const request = { text: 'thích phở', days: 7, mealsPerDay: 3, budget: '700000', reserve: '0', cooking: 'deny' as const, menu: catalog.map(m => ({ id: m.id, name: m.name, price: m.price, cook: false, breakfast: true, localVenues: null })), ledger: 'must never leave device', transactions: [], balances: 'private' };
    assert.equal((await thinkWithSettings(settings, request, catalog)).reasoning, 'Test reasoning');
    assert.deepEqual((await fastWithSettings(settings, 'thích phở', catalog)).likedIds, ['m1']);
    assert.ok(!JSON.stringify(requests).includes('must never leave device')); assert.ok(!JSON.stringify(requests).includes('private'));
  } finally { globalThis.fetch = original; }
});
test('network errors, quota, upstream errors and malformed responses are recognizable; caller cancellation propagates', async () => {
  const original = globalThis.fetch;
  try {
    for (const status of [429, 500, 502, 401]) {
      globalThis.fetch = async () => new Response(null, { status });
      await assert.rejects(completeCloud(settings, 'fast', { messages: [] }), { code: 'CLOUD_UNAVAILABLE' });
    }
    globalThis.fetch = async () => { throw Error('network'); };
    await assert.rejects(completeCloud(settings, 'think', { messages: [] }), { code: 'CLOUD_UNAVAILABLE' });
    globalThis.fetch = async () => Response.json({ wrong: true });
    await assert.rejects(completeCloud(settings, 'think', { messages: [] }), { code: 'CLOUD_UNAVAILABLE' });
    const controller = new AbortController(); controller.abort();
    await assert.rejects(completeCloud(settings, 'think', { messages: [] }, controller.signal), { name: 'AbortError' });
  } finally { globalThis.fetch = original; }
});
test('both cloud deadlines abort stalled fetch and clear timers', async t => {
  const original = globalThis.fetch; t.mock.timers.enable({ apis: ['setTimeout'] });
  globalThis.fetch = async (_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(Error('timeout'))));
  try {
    for (const [mode, ms] of [['fast', 20000], ['think', 90000]] as const) {
      const pending = assert.rejects(completeCloud(settings, mode, { messages: [] }), { code: 'CLOUD_UNAVAILABLE' });
      t.mock.timers.tick(ms); await pending;
    }
  } finally { globalThis.fetch = original; t.mock.timers.reset(); }
});
