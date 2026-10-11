import React, { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { openRepository, type LedgerRepository, type LoadedLedger } from './database';
import { type Backup, type Command } from './domain';
import { drainNativeImports } from './native-import';
import { nativeImportBridge, sharedNativeImportBridge, sharedInboxStatus, observeNativeImports } from './native';
import { useAppLock } from './app-lock';

export const newId = () => `id-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 12)}`;
type Store = { loaded: LoadedLedger | null; error: string | null; nativeImportError: string; notice: string; retry: () => void; retryNativeImports: () => Promise<void>; refresh: () => Promise<LoadedLedger>; execute: (command: Command, revision?: number) => Promise<LoadedLedger>; restore: (backup: Backup, revision: number) => Promise<LoadedLedger> };
const Context = createContext<Store | null>(null);
export function StoreProvider({ children }: { children: ReactNode }) {
  const { assertUnlocked } = useAppLock();
  const [loaded, setLoaded] = useState<LoadedLedger | null>(null); const [error, setError] = useState<string | null>(null); const [notice, setNotice] = useState(''); const [attempt, setAttempt] = useState(0);
  const repository = useRef<LedgerRepository | null>(null);
  const [nativeImportError, setNativeImportError] = useState('');
  const draining = useRef<Promise<void> | null>(null); const drainAgain = useRef(false);
  const update = (result: LoadedLedger) => setLoaded(previous => previous && previous.revision > result.revision ? previous : result);
  const retryNativeImports = async () => {
    if ((!nativeImportBridge && !sharedNativeImportBridge) || !repository.current) return;
    drainAgain.current = true;
    if (draining.current) return draining.current;
    const repo = repository.current;
    draining.current = (async () => {
      try {
        do {
          drainAgain.current = false; const errors: string[] = [];
          if (nativeImportBridge) { try { const result = await drainNativeImports(nativeImportBridge, repo); if (repository.current === repo) update(result); } catch { errors.push('Chưa nhận hoặc phân tích hết nội dung Shortcuts. Bản chưa nhận được giữ trong hàng chờ; bản đã nhận nằm trong Inbox. Chọn Thử nhận lại hoặc mở mục Mới nhận để phân tích.'); } }
          if (sharedNativeImportBridge) {
            try { const status = await sharedInboxStatus(); if (!status.available) throw new Error(status.error); const result = await drainNativeImports(sharedNativeImportBridge, repo); if (repository.current === repo) update(result); }
            catch { errors.push('Chưa nhận hoặc phân tích hết nội dung chia sẻ. Bản chưa nhận được giữ trong vùng dữ liệu chung; bản đã nhận nằm trong Inbox. Chọn Thử nhận lại; Shortcuts vẫn có hàng chờ riêng.'); }
          }
          if (repository.current === repo) { setNativeImportError(errors.join('\n')); if (errors.length) { try { const current = await repo.load(); if (repository.current === repo) update(current); } catch { /* Preserve the existing loaded ledger when ingress refresh fails. */ } } }
        } while (drainAgain.current && repository.current === repo);
      } catch {
        if (repository.current === repo) {
          setNativeImportError('Chưa nhận hết nội dung Shortcuts hoặc chia sẻ. Hàng chờ gốc được giữ; bản đã nhận nằm trong Inbox. Chọn Thử nhận lại hoặc mở mục Mới nhận để phân tích.');
          try { const current = await repo.load(); if (repository.current === repo) update(current); } catch { /* Keep ingress errors separate from opening the ledger. */ }
        }
      } finally { draining.current = null; }
    })();
    return draining.current;
  };
  useEffect(() => {
    let active = true; let opened: LedgerRepository | null = null; setError(null);
    const stopObserving = observeNativeImports(() => { void retryNativeImports(); });
    void openRepository().then(async repo => { opened = repo; if (!active) { await repo.close(); return; } repository.current = repo; const result = await repo.load(); if (active) { update(result); await retryNativeImports(); } }).catch(e => { if (active) setError(errorMessage(e)); });
    return () => { active = false; stopObserving(); repository.current = null; if (opened) void opened.close(); };
  }, [attempt]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 4000); return () => clearTimeout(timer); }, [notice]);
  const refresh = async () => { if (!repository.current) throw new Error('Database chưa sẵn sàng.'); const result = await repository.current.load(); update(result); return result; };
  useEffect(() => { const sub = AppState.addEventListener('change', state => { if (state === 'active' && repository.current) { void refresh().catch(e => setError(errorMessage(e))); void retryNativeImports(); } }); return () => sub.remove(); }, []);
  const execute = async (command: Command, revision = loaded?.revision) => { assertUnlocked(); if (!repository.current || revision === undefined) throw new Error('Database chưa sẵn sàng.'); const result = await repository.current.mutate(command, revision); update(result); setNotice('Đã lưu vào Sổ Ví'); return result; };
  const restore = async (backup: Backup, revision: number) => { assertUnlocked(); if (!repository.current) throw new Error('Database chưa sẵn sàng.'); const result = await repository.current.restore(backup, revision); update(result); setNotice('Đã khôi phục backup'); return result; };
  return <Context.Provider value={{ loaded, error, nativeImportError, notice, refresh, execute, restore, retryNativeImports, retry: () => { setLoaded(null); setAttempt(x => x + 1); } }}>{children}</Context.Provider>;
}
export function useStore(): Store { const value = useContext(Context); if (!value) throw new Error('Store chưa được khởi tạo.'); return value; }
export function useLedger() { const store = useStore(); if (!store.loaded) throw new Error('Database chưa sẵn sàng.'); return { ...store, ledger: store.loaded.ledger, revision: store.loaded.revision }; }
export function errorMessage(error: unknown) { return error instanceof Error ? error.message : 'Thao tác thất bại. Dữ liệu và bản nháp được giữ để thử lại.'; }
