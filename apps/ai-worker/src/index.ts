type Env = { APP_TOKEN: string; AI: { run(model: string, input: Record<string, unknown>): Promise<any> } };
// Official schema/default medium reasoning: https://developers.cloudflare.com/workers-ai/models/gpt-oss-120b/
// Neuron pricing/free allocation: https://developers.cloudflare.com/workers-ai/platform/pricing/
// Small fast model https://developers.cloudflare.com/workers-ai/models/llama-3.1-8b-instruct-fp8/
export const MODELS = { think: '@cf/openai/gpt-oss-120b', fast: '@cf/meta/llama-3.1-8b-instruct-fp8' };
const LIMIT = 32 * 1024;
async function authorized(header: string | null, secret: string) {
  // Fixed-size digests avoid a length-dependent comparison; no early exit on differing bytes.
  const digest = (value: string) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  const [a, b] = await Promise.all([digest(header ?? ''), digest(`Bearer ${secret ?? ''}`)]);
  const left = new Uint8Array(a), right = new Uint8Array(b); let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return !!secret && difference === 0;
}
async function readBody(request: Request) {
  if (Number(request.headers.get('content-length')) > LIMIT) throw Error('BODY');
  const reader = request.body?.getReader(); if (!reader) throw Error('BODY');
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > LIMIT) { await reader.cancel(); throw Error('BODY'); } chunks.push(value); }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname !== '/v1/complete') return new Response(null, { status: 404 });
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    if (!await authorized(request.headers.get('authorization'), env.APP_TOKEN)) return new Response(null, { status: 401 });
    let body: any;
    try {
      body = await readBody(request);
      if (!body || !['fast', 'think'].includes(body.mode) || Object.keys(body).some(k => !['mode', 'messages', 'schema'].includes(k)) || !Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 4 || body.messages.some((m: any) => !m || !['system', 'user'].includes(m.role) || typeof m.content !== 'string' || !m.content.trim() || Object.keys(m).some(k => !['role', 'content'].includes(k))) || (body.schema !== undefined && (!body.schema || typeof body.schema !== 'object' || Array.isArray(body.schema)))) throw Error('BODY');
    } catch { return Response.json({ error: 'BAD_REQUEST' }, { status: 400 }); }
    try {
      const mode = body.mode as keyof typeof MODELS;
      const output = await env.AI.run(MODELS[mode], { messages: body.messages, max_tokens: mode === 'think' ? 4096 : 512, stream: false, ...(body.schema ? { response_format: { type: 'json_schema', json_schema: body.schema } } : {}) });
      const choice = output?.choices?.[0];
      const message = choice?.message;
      const truncated = choice?.finish_reason === 'length' || output?.finish_reason === 'length';
      let content = message?.content ?? output?.response ?? output?.content;
      if (body.schema && content && typeof content === 'object' && !Array.isArray(content)) content = JSON.stringify(content);
      if (typeof content !== 'string' || !content.trim()) return Response.json({ error: truncated ? 'AI_TRUNCATED' : 'AI_FAILED' }, { status: 502 });
      const end = content.lastIndexOf('</think>');
      if (content.includes('<think>', end < 0 ? 0 : end + '</think>'.length)) return Response.json({ error: 'AI_TRUNCATED' }, { status: 502 });
      const taggedReasoning = end < 0 ? '' : content.slice(0, end).replace(/^\s*<think>/, '').trim();
      const reasoning = [output?.reasoning, output?.reasoning_content, message?.reasoning, message?.reasoning_content, taggedReasoning].filter(v => typeof v === 'string' && v.trim()).join('\n');
      content = (end < 0 ? content : content.slice(end + '</think>'.length)).trim();
      if (!content) return Response.json({ error: truncated ? 'AI_TRUNCATED' : 'AI_FAILED' }, { status: 502 });
      return Response.json({ content, reasoning });
    } catch (error: any) {
      const limited = error?.status === 429 || error?.code === 429 || /quota|rate.?limit|neurons|daily limit/i.test(String(error?.message ?? ''));
      return Response.json({ error: limited ? 'AI_QUOTA' : 'AI_FAILED' }, { status: limited ? 429 : 502 });
    }
  },
};
