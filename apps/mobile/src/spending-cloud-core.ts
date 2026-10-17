import { buildFastPrompt, buildThinkingMessages, parseThinkingResult, type ThinkingRequest, type VenueContext } from './spending-thinking.ts';
import { parseAiPreferences, type MealOption } from './spending.ts';

export type CloudSettings = { url: string; token: string };
export function validateCloudSettings(settings: CloudSettings): CloudSettings {
  const url = new URL(settings.url.trim());
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !['', '/', '/v1/complete'].includes(url.pathname)) throw Error('URL Worker phải là https:// và không chứa thông tin đăng nhập.');
  if (typeof settings.token !== 'string' || !settings.token.trim() || /[\r\n]/.test(settings.token)) throw Error('Nhập mã truy cập Worker.');
  return { url: url.origin, token: settings.token.trim() };
}
export const cloudUnavailable = () => Object.assign(new Error('CLOUD_UNAVAILABLE: Không kết nối được AI trên mạng. Dùng bộ hiểu câu offline.'), { code: 'CLOUD_UNAVAILABLE' });
export async function completeCloud(settings: CloudSettings, mode: 'fast' | 'think', prompt: { messages: { role: string; content: string }[]; schema?: object }, signal?: AbortSignal) {
  const config = validateCloudSettings(settings), controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) throw Object.assign(Error('Đã hủy AI.'), { name: 'AbortError' });
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, mode === 'think' ? 150000 : 20000);
  try {
    const response = await fetch(`${config.url}/v1/complete`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.token}` }, body: JSON.stringify({ mode, messages: prompt.messages, ...(prompt.schema ? { schema: prompt.schema } : {}) }), signal: controller.signal, redirect: 'error' });
    if (!response.ok) throw cloudUnavailable();
    const output = await response.json();
    if (!output || typeof output.content !== 'string' || typeof output.reasoning !== 'string') throw cloudUnavailable();
    return output as { content: string; reasoning: string };
  } catch {
    if (signal?.aborted) throw Object.assign(Error('Đã hủy AI.'), { name: 'AbortError' });
    throw cloudUnavailable();
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
export async function thinkWithSettings(settings: CloudSettings, request: ThinkingRequest, catalog: MealOption[], signal?: AbortSignal) {
  const output = await completeCloud(settings, 'think', { messages: buildThinkingMessages(request, catalog) }, signal);
  return parseThinkingResult(output.content, catalog, request.cooking, output.reasoning);
}
export async function fastWithSettings(settings: CloudSettings, text: string, catalog: MealOption[], venues: VenueContext = [], aliases: string[][] = [], signal?: AbortSignal) {
  const output = await completeCloud(settings, 'fast', buildFastPrompt(text, catalog, venues, aliases), signal);
  return parseAiPreferences(output.content, catalog);
}
