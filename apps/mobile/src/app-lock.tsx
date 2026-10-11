import React, { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, AppState, Keyboard, Platform, StyleSheet, Text, View, findNodeHandle, type AppStateStatus } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import * as ScreenCapture from 'expo-screen-capture';
import { Button, Card, Page, colors, styles } from './ui';

const flagKey = 'sovi.app-lock.enabled';
const storageOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY, requireAuthentication: false };
type AppLock = { enabled: boolean | null; locked: boolean; covered: boolean; busy: boolean; error: string; available: boolean; retry: () => Promise<void>; unlock: () => Promise<void>; setEnabled: (enabled: boolean) => Promise<void>; assertUnlocked: () => void };
type Session = { enabled: boolean | null; locked: boolean; busy: boolean; error: string; admitted: boolean; needsRead: boolean; appState: AppStateStatus | null };
const Context = createContext<AppLock | null>(null);

export function parseAppLockFlag(value: unknown): boolean {
  if (value === null || value === '0') return false;
  if (value === '1') return true;
  throw new Error('Không đọc được cài đặt khóa ứng dụng. Chọn Thử lại; dữ liệu được giữ nguyên.');
}

export function AppLockProvider({ children }: { children: ReactNode }) {
  const available = Platform.OS === 'ios' && (Constants.executionEnvironment === ExecutionEnvironment.Standalone || Constants.executionEnvironment === ExecutionEnvironment.Bare);
  const [session, setSession] = useState<Session>({ enabled: null, locked: true, busy: false, error: '', admitted: false, needsRead: true, appState: AppState.currentState });
  const live = useRef(session); const epoch = useRef(0); const mounted = useRef(true);
  const pending = useRef<Promise<void> | null>(null); const prompting = useRef(false); const ownInactive = useRef(false); const writing = useRef(false); const privacyReady = useRef(false);
  const titleRef = useRef<Text | null>(null);
  const cancelForegroundWait = useRef<(() => void) | null>(null);
  const change = useCallback((patch: Partial<Session>) => {
    if (!mounted.current) return;
    const next = { ...live.current, ...patch };
    if (!next.locked && !next.busy && !next.needsRead && next.enabled !== null && next.appState === 'active' && AppState.currentState === 'active' && (!next.enabled || privacyReady.current)) next.admitted = true;
    live.current = next;
    if (next.locked || next.appState !== 'active' || next.enabled === null) Keyboard.dismiss();
    setSession(next);
  }, []);
  const current = (generation: number) => mounted.current && generation === epoch.current && (AppState.currentState === 'active' || (AppState.currentState === 'inactive' && ownInactive.current));
  const run = (operation: (generation: number) => Promise<void>) => {
    if (pending.current) return pending.current;
    if (!mounted.current) return Promise.resolve();
    const generation = epoch.current;
    change({ busy: true, locked: true, error: '' });
    const promise = (async () => {
      try { await operation(generation); }
      catch (error) { if (mounted.current && generation === epoch.current) change({ locked: true, error: error instanceof Error ? error.message : 'Không thể xác minh khóa ứng dụng. Chọn Thử lại.' }); }
      finally { pending.current = null; change({ busy: false }); }
    })();
    pending.current = promise;
    return promise;
  };
  const preparePrivacy = async () => {
    if (!available) throw new Error('Khóa Face ID / mật mã chỉ dùng trong ứng dụng Sổ Ví riêng trên iPhone, không dùng trong Expo Go.');
    if (!privacyReady.current) {
      // shortcut: the SDK blur animates, verify Recents privacy on the iPhone before relying on it.
      await ScreenCapture.enableAppSwitcherProtectionAsync(1);
      privacyReady.current = true;
    }
  };
  const authenticate = async (generation: number) => {
    if (!available) throw new Error('Mở bản Sổ Ví riêng trên iPhone để dùng Face ID / mật mã thiết bị.');
    if (await LocalAuthentication.getEnrolledLevelAsync() < LocalAuthentication.SecurityLevel.SECRET) throw new Error('Thiết lập mật mã iPhone trong Cài đặt của thiết bị, rồi thử lại.');
    if (!current(generation)) return false;
    prompting.current = true;
    let result: LocalAuthentication.LocalAuthenticationResult;
    try { result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Mở khóa Sổ Ví', cancelLabel: 'Hủy', fallbackLabel: 'Dùng mật mã iPhone', disableDeviceFallback: false }); }
    finally { prompting.current = false; }
    if (!current(generation)) return false;
    if (result.success !== true) throw new Error(result.error === 'user_cancel' || result.error === 'system_cancel' ? 'Đã hủy xác thực. Sổ Ví vẫn được khóa.' : 'Chưa xác thực được. Thử Face ID hoặc mật mã iPhone; Sổ Ví vẫn được khóa.');
    return true;
  };
  const retry = useCallback(() => run(async generation => {
    change({ enabled: null, needsRead: true });
    const enabled = parseAppLockFlag(await SecureStore.getItemAsync(flagKey, storageOptions));
    if (!current(generation)) return;
    change({ enabled, needsRead: false });
    if (enabled) await preparePrivacy();
    if (current(generation)) change({ locked: enabled, error: '' });
  }), []);
  const unlock = useCallback(() => run(async generation => {
    if (live.current.needsRead || live.current.enabled === null) throw new Error('Chọn Thử lại để đọc cài đặt khóa trước khi mở sổ.');
    if (!live.current.enabled) throw new Error('Chọn Thử lại để xác minh cài đặt và mở sổ.');
    await preparePrivacy();
    if (current(generation) && await authenticate(generation)) change({ locked: false, error: '' });
  }), []);
  const assertUnlocked = useCallback(() => {
    const value = live.current;
    if (!mounted.current || value.locked || value.busy || value.needsRead || value.enabled === null || value.appState !== 'active' || AppState.currentState !== 'active' || (value.enabled && !privacyReady.current)) throw new Error('Sổ Ví đang được khóa. Mở khóa trước khi tiếp tục; bản nháp được giữ.');
  }, []);
  const setEnabled = useCallback((enabled: boolean) => {
    if (pending.current) return pending.current;
    if (!available) { change({ error: 'Khóa Face ID / mật mã cần bản Sổ Ví riêng trên iPhone. Expo Go không hỗ trợ tính năng này.' }); return Promise.resolve(); }
    try { assertUnlocked(); } catch (error) { change({ error: (error as Error).message }); return Promise.resolve(); }
    return run(async generation => {
      if (!await authenticate(generation)) return;
      if (ownInactive.current && live.current.appState === 'inactive' && AppState.currentState === 'inactive') await new Promise<void>((resolve, reject) => {
        let subscription: ReturnType<typeof AppState.addEventListener> | undefined;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const finish = (error?: Error) => { subscription?.remove(); if (timer !== undefined) clearTimeout(timer); cancelForegroundWait.current = null; if (error) reject(error); else resolve(); };
        cancelForegroundWait.current = () => finish(new Error('Xác minh bị gián đoạn. Cài đặt chưa đổi; chọn Thử lại.'));
        subscription = AppState.addEventListener('change', state => {
          if (state === 'active' && current(generation) && live.current.appState === 'active') finish();
          else finish(new Error('Xác minh bị gián đoạn. Cài đặt chưa đổi; chọn Thử lại.'));
        });
        timer = setTimeout(() => finish(new Error('Ứng dụng chưa hoạt động trở lại. Cài đặt chưa đổi; chọn Thử lại.')), 5000);
      });
      if (!current(generation)) return;
      if (live.current.appState !== 'active' || AppState.currentState !== 'active') throw new Error('Ứng dụng chưa hoạt động trở lại. Cài đặt chưa đổi; chọn Thử lại trước khi đổi khóa ứng dụng.');
      if (enabled) await preparePrivacy();
      if (!current(generation)) return;
      if (live.current.appState !== 'active' || AppState.currentState !== 'active') throw new Error('Ứng dụng chưa hoạt động trở lại. Cài đặt chưa đổi; chọn Thử lại trước khi đổi khóa ứng dụng.');
      writing.current = true; change({ needsRead: true });
      try { await SecureStore.setItemAsync(flagKey, enabled ? '1' : '0', storageOptions); }
      finally { writing.current = false; }
      if (current(generation)) change({ enabled, needsRead: false, locked: false, error: '' });
    });
  }, []);

  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', appState => {
      if (appState === 'inactive' && prompting.current) { ownInactive.current = true; change({ appState }); return; }
      ownInactive.current = false;
      if (appState !== 'active') {
        epoch.current++;
        const interrupted = pending.current !== null;
        change({ appState, locked: true, ...(writing.current ? { needsRead: true, ...(appState === 'background' ? { enabled: null } : {}) } : {}), ...(interrupted ? { error: 'Xác minh bị gián đoạn. Chọn Thử lại để đọc cài đặt khóa, rồi mở khóa nếu cần.' } : {}) });
      } else change({ appState, ...(live.current.enabled === false && !live.current.needsRead && !live.current.error ? { locked: false } : {}) });
    });
    void retry();
    return () => { mounted.current = false; epoch.current++; prompting.current = false; subscription.remove(); cancelForegroundWait.current?.(); };
  }, []);
  const covered = session.locked || session.busy || session.needsRead || session.enabled === null || session.appState !== 'active' || AppState.currentState !== 'active';
  useEffect(() => {
    if (covered && titleRef.current) { const handle = findNodeHandle(titleRef.current); if (handle !== null) AccessibilityInfo.setAccessibilityFocus(handle); }
  }, [covered]);
  const value: AppLock = { enabled: session.enabled, locked: covered, covered, busy: session.busy, error: session.error, available, retry, unlock, setEnabled, assertUnlocked };
  return <Context.Provider value={value}><View style={{ flex: 1, backgroundColor: colors.background }}>
    {session.admitted && <View style={{ flex: 1 }} pointerEvents={covered ? 'none' : 'auto'} accessibilityElementsHidden={covered} importantForAccessibility={covered ? 'no-hide-descendants' : 'auto'}>{children}</View>}
    {covered && <View accessibilityViewIsModal pointerEvents="auto" style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]}><Page title="Sổ Ví"><Card>
      <Text ref={titleRef} accessibilityRole="header" style={styles.heading}>{session.enabled === null || session.needsRead ? 'Đang đọc cài đặt bảo mật' : session.enabled ? session.busy ? 'Đang xác minh…' : 'Sổ Ví đang được khóa' : 'Khóa ứng dụng đang tắt'}</Text>
      <Text style={styles.text}>{session.enabled === true && !session.needsRead ? 'Mở khóa bằng Face ID hoặc mật mã iPhone.' : session.enabled === false && !session.needsRead ? 'Khóa đang tắt nên Sổ Ví không yêu cầu Face ID. Chọn Thử lại để mở sổ sau thao tác bị gián đoạn.' : 'Chưa đọc xong cài đặt khóa. Dữ liệu chưa được mở; chọn Thử lại nếu cần.'} Dữ liệu và bản nháp được giữ trên điện thoại.</Text>
      {!!session.error && <Text accessibilityRole="alert" style={styles.error}>{session.error}</Text>}
      {session.enabled === true && !session.needsRead && <Button title="Mở khóa Sổ Ví" disabled={session.busy || session.appState !== 'active'} onPress={() => void unlock()} />}
      <Button title="Thử lại" secondary disabled={session.busy || session.appState !== 'active'} onPress={() => void retry()} />
    </Card></Page></View>}
  </View></Context.Provider>;
}

export function useAppLock(): AppLock { const value = useContext(Context); if (!value) throw new Error('Khóa ứng dụng chưa được khởi tạo.'); return value; }
export function LockSettingsCard() {
  const lock = useAppLock();
  return <Card><Text style={styles.heading}>Khóa ứng dụng</Text><Text style={styles.text}>Face ID / mật mã iPhone: {lock.enabled ? 'Đang bật' : 'Đang tắt'}</Text><Text style={styles.secondary}>Cài đặt chỉ nằm trên thiết bị này, không có trong backup JSON. Khóa bảo vệ việc mở sổ; không mã hóa database hoặc file backup.</Text>
    {!lock.available && <Text style={styles.secondary}>Cần bản Sổ Ví riêng trên iPhone. Không thể bật khóa trong Expo Go.</Text>}
    {!!lock.error && <Text accessibilityRole="alert" style={styles.error}>{lock.error}</Text>}
    <Button title={lock.enabled ? 'Tắt khóa ứng dụng' : 'Bật Face ID / mật mã iPhone'} secondary disabled={!lock.available || lock.busy || lock.enabled === null} onPress={() => void lock.setEnabled(!lock.enabled)} />
  </Card>;
}
