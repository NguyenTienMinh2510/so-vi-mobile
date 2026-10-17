const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');
const ts = require('typescript');
const loaded: any = {};
runInNewContext(ts.transpileModule(readFileSync(require.resolve('../src/index.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: loaded, crypto, TextEncoder, TextDecoder, Request, Response, URL, Uint8Array, Error });
const worker = loaded.default, MODELS = loaded.MODELS;

const token = 'fake-test-token';
const body = { mode: 'think', messages: [{ role: 'user', content: 'test preference' }] };
const request = (value: unknown = body, authorization: string | null = `Bearer ${token}`) => new Request('https://worker.test/v1/complete', { method: 'POST', headers: authorization ? { Authorization: authorization } : {}, body: JSON.stringify(value) });
test('missing, wrong, or differently sized tokens return an empty 401 without running AI', async () => {
  for (const auth of [null, 'Bearer wrong', 'Bearer fake-test-token-extra']) {
    const response = await worker.fetch(request(body, auth), { APP_TOKEN: token, AI: { run: async () => { throw Error('must not run'); } } });
    assert.equal(response.status, 401); assert.equal(await response.text(), '');
  }
});
test('body is capped by actual streamed bytes and mode/messages/schema are validated', async () => {
  for (const value of [{ ...body, mode: 'other' }, { ...body, messages: Array(5).fill(body.messages[0]) }, { ...body, messages: [{ role: 'assistant', content: 'test' }] }, { ...body, schema: [] }, { ...body, messages: [{ role: 'user', content: 'ở'.repeat(20000) }] }, { ...body, model: 'client-selected' }]) {
    const response = await worker.fetch(request(value), { APP_TOKEN: token, AI: { run: async () => { throw Error('must not run'); } } });
    assert.equal(response.status, 400);
  }
});
test('server selects models/token caps and separates reasoning tags or fields', async () => {
  for (const mode of ['think', 'fast'] as const) {
    const response = await worker.fetch(request({ ...body, mode }), { APP_TOKEN: token, AI: { run: async (model, input) => {
      assert.equal(model, MODELS[mode]); assert.equal(input.max_tokens, mode === 'think' ? 2048 : 512);
      return mode === 'think' ? { response: '<think>private thought</think>{"likedIds":[]}' } : { response: '{}', reasoning: 'field' };
    } } });
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), mode === 'think' ? { content: '{"likedIds":[]}', reasoning: 'private thought' } : { content: '{}', reasoning: 'field' });
  }
});
test('AI failure, quota, malformed or unfinished output return short safe errors', async () => {
  for (const [output, status] of [[Error('internal prompt should never leak'), 502], [Object.assign(Error('quota exceeded'), { status: 429 }), 429], [{ response: '<think>unfinished' }, 502], [{ unexpected: true }, 502]] as const) {
    const response = await worker.fetch(request(), { APP_TOKEN: token, AI: { run: async () => { if (output instanceof Error) throw output; return output; } } });
    assert.equal(response.status, status); assert.deepEqual(await response.json(), { error: status === 429 ? 'AI_QUOTA' : 'AI_FAILED' });
  }
});
test('only POST /v1/complete is routed', async () => {
  const env = { APP_TOKEN: token, AI: { run: async () => ({}) } };
  assert.equal((await worker.fetch(new Request('https://worker.test/other'), env)).status, 404);
  assert.equal((await worker.fetch(new Request('https://worker.test/v1/complete'), env)).status, 405);
});
test('fast schema uses Workers JSON mode and normalizes an object response', async () => {
  const schema = { type: 'object', properties: {} };
  const response = await worker.fetch(request({ ...body, mode: 'fast', schema }), { APP_TOKEN: token, AI: { run: async (_model, input) => {
    assert.deepEqual(JSON.parse(JSON.stringify(input.response_format)), { type: 'json_schema', json_schema: schema });
    return { response: { likedIds: [] } };
  } } });
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { content: '{"likedIds":[]}', reasoning: '' });
});
