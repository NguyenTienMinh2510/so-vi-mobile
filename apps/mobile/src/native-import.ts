import { timestamp, type ImportedEvent } from './domain.ts';
import { MAX_IMPORT_TEXT } from './import.ts';
import type { LedgerRepository, LoadedLedger } from './database';

export type NativeImport = Pick<ImportedEvent, 'id' | 'source' | 'provider' | 'sourceId' | 'text' | 'receivedAt'>;
export type NativeInboxBridge = { pendingImportsAsync: () => Promise<unknown[]>; acknowledgeImportAsync: (id: string) => Promise<void> };
const keys = ['id', 'source', 'provider', 'sourceId', 'text', 'receivedAt'] as const;
export function validateNativeImport(input: unknown): NativeImport {
  const invalid = () => { throw new Error('Nội dung Shortcuts không hợp lệ. Bản gốc được giữ trong hàng chờ; không ghi sổ.'); };
  if (!input || typeof input !== 'object' || Array.isArray(input) || Reflect.ownKeys(input).length !== keys.length || keys.some(key => !Object.hasOwn(input, key))) invalid();
  const value = input as Record<string, unknown>;
  const validText = (text: unknown, max: number): text is string => typeof text === 'string' && !!text.trim() && text.length <= max;
  if (typeof value.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.id) || !['sms', 'email', 'text'].includes(value.source as string) || !validText(value.provider, 200) || (value.sourceId !== null && !validText(value.sourceId, 200)) || !validText(value.text, MAX_IMPORT_TEXT)) invalid();
  timestamp(value.receivedAt, 'receivedAt');
  if ((value.receivedAt as string) > new Date().toISOString()) invalid();
  return { id: value.id as string, source: value.source as NativeImport['source'], provider: (value.provider as string).trim(), sourceId: value.sourceId === null ? null : (value.sourceId as string).trim(), text: value.text as string, receivedAt: value.receivedAt as string };
}

export async function drainNativeImports(bridge: NativeInboxBridge, repository: Pick<LedgerRepository, 'load' | 'mutate'>): Promise<LoadedLedger> {
  const pending = await bridge.pendingImportsAsync();
  if (!Array.isArray(pending) || pending.length > 50) throw new Error('Hàng chờ Shortcuts không hợp lệ. Nội dung được giữ để thử lại.');
  let loaded = await repository.load();
  for (const input of pending) {
    const incoming = validateNativeImport(input);
    loaded = await repository.load();
    const existing = loaded.ledger.importedEvents.find(event => event.id === incoming.id);
    if (existing) {
      if (keys.some(key => existing[key] !== incoming[key])) throw new Error('Mã Shortcuts đã có nội dung khác trong Inbox. Cả hai bản được giữ để đối chiếu.');
    } else {
      loaded = await repository.mutate({ type: 'import.receive', mutationId: `native-receive-${incoming.id}`, payload: incoming }, loaded.revision);
    }
    await bridge.acknowledgeImportAsync(incoming.id);
    loaded = await repository.load();
    const event = loaded.ledger.importedEvents.find(item => item.id === incoming.id);
    if (event && !event.ignored && ['received', 'processing', 'failed'].includes(event.state)) loaded = await repository.mutate({ type: 'import.process', mutationId: `native-process-${incoming.id}-${event.version}`, payload: { id: event.id, expectedVersion: event.version } }, loaded.revision);
  }
  return loaded;
}
