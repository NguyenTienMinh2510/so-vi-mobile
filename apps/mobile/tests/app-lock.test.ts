import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';

type Lock = { enabled: boolean | null; locked: boolean; covered: boolean; busy: boolean; error: string; available: boolean; retry: () => Promise<void>; unlock: () => Promise<void>; setEnabled: (enabled: boolean) => Promise<void>; assertUnlocked: () => void };
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const attempt = async (operation: Promise<unknown>) => { try { await operation; } catch { /* The public API may also reject after exposing its recoverable error. */ } };

// Execute the actual TSX provider; only native APIs and React's hook scheduler are controlled.
function harness(flag: unknown = '1', expoGo = false) {
  const require = createRequire(import.meta.url); const ts = require('typescript');
  const code = ts.transpileModule(readFileSync(new URL('../src/app-lock.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const slots: any[] = []; const pendingEffects: (() => void)[] = []; const contexts: any[] = []; let cursor = 0; let dirty = true; let tree: any; let unmounted = false; let updatesAfterUnmount = 0;
  const child = { type: 'PrivateDraft', props: { children: 'PRIVATE DRAFT' } }; const listeners = new Set<(state: string) => void>();
  const calls: string[] = []; let read: () => Promise<unknown> = async () => flag; let auth: () => Promise<any> = async () => ({ success: true });
  let privacy: () => Promise<void> = async () => {}; let write: (value: string) => Promise<void> = async value => { flag = value; };
  const writes: string[] = []; const secureCalls: { key: string; options: any }[] = []; const authOptions: any[] = []; const switcherOptions: any[] = []; const appState = { currentState: 'active', addEventListener: (_: string, listener: (state: string) => void) => { listeners.add(listener); return { remove: () => listeners.delete(listener) }; } };
  const element = (type: any, props: any, ...children: any[]) => ({ type, props: { ...props, ...(children.length ? { children } : {}) } });
  const effect = (run: () => any, deps?: unknown[]) => {
    const at = cursor++; const previous = slots[at];
    if (!previous || !deps || deps.some((value, i) => !Object.is(value, previous.deps?.[i])) || deps.length !== previous.deps?.length) {
      const record = { deps, cleanup: previous?.cleanup }; slots[at] = record;
      pendingEffects.push(() => { record.cleanup?.(); record.cleanup = run(); });
    }
  };
  const react = { createContext: (value: any) => { const context = { value, Provider: Symbol('Provider') }; contexts.push(context); return context; }, createElement: element, Fragment: 'Fragment',
    useContext: (context: any) => context.value,
    useState: (initial: any) => { const at = cursor++; if (!(at in slots)) slots[at] = typeof initial === 'function' ? initial() : initial; return [slots[at], (next: any) => { if (unmounted) { updatesAfterUnmount++; return; } const value = typeof next === 'function' ? next(slots[at]) : next; if (!Object.is(slots[at], value)) { slots[at] = value; dirty = true; } }]; },
    useRef: (initial: any) => { const at = cursor++; if (!(at in slots)) slots[at] = { current: initial }; return slots[at]; }, useEffect: effect, useLayoutEffect: effect,
    useMemo: (factory: () => any, deps: unknown[]) => { const at = cursor++; if (!slots[at] || deps.some((value, i) => !Object.is(value, slots[at].deps[i]))) slots[at] = { deps, value: factory() }; return slots[at].value; },
    useCallback: (callback: any, deps: unknown[]) => react.useMemo(() => callback, deps),
  };
  const screenCapture = {
    isAvailableAsync: async () => true,
    preventScreenCaptureAsync: async () => { calls.push('capture'); await privacy(); },
    enableAppSwitcherProtectionAsync: async (intensity: number) => { switcherOptions.push(intensity); calls.push('switcher'); await privacy(); },
    allowScreenCaptureAsync: async () => { calls.push('allow-capture'); }, disableAppSwitcherProtectionAsync: async () => { calls.push('allow-switcher'); },
  };
  const exports: any = {}; const timers: { callback: () => void; delay: number; active: boolean }[] = [];
  runInNewContext(code, { exports, Date, Math, Error, Promise, setTimeout: (callback: () => void, delay: number) => { const timer = { callback, delay, active: true }; timers.push(timer); return timer; }, clearTimeout: (timer: any) => { if (timer) timer.active = false; }, require: (name: string) => {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx: element, jsxs: element, Fragment: 'Fragment' };
    if (name === 'react-native') return { AppState: appState, Keyboard: { dismiss: () => { calls.push('keyboard-dismiss'); } }, Platform: { OS: 'ios', select: (items: any) => items.ios ?? items.default }, StyleSheet: { create: (styles: any) => styles, absoluteFillObject: {} }, View: 'View', Text: 'Text', Pressable: 'Pressable', Switch: 'Switch', ActivityIndicator: 'ActivityIndicator', Alert: { alert() {} } };
    if (name === 'expo-constants') return { __esModule: true, default: { appOwnership: expoGo ? 'expo' : null, executionEnvironment: expoGo ? 'storeClient' : 'standalone' }, ExecutionEnvironment: { StoreClient: 'storeClient', Standalone: 'standalone', Bare: 'bare' } };
    if (name === 'expo-local-authentication') return { hasHardwareAsync: async () => true, isEnrolledAsync: async () => true, supportedAuthenticationTypesAsync: async () => [2], getEnrolledLevelAsync: async () => 2, AuthenticationType: { FACIAL_RECOGNITION: 2, FINGERPRINT: 1 }, SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC_WEAK: 2, BIOMETRIC_STRONG: 3 }, authenticateAsync: async (options: any) => { authOptions.push(options); calls.push('auth'); return await auth(); }, cancelAuthenticate: async () => { calls.push('cancel-auth'); } };
    if (name === 'expo-secure-store') return { isAvailableAsync: async () => true, WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'when-unlocked', getItemAsync: async (key: string, options: any) => { secureCalls.push({ key, options }); calls.push('read'); return await read(); }, setItemAsync: async (key: string, value: string, options: any) => { secureCalls.push({ key, options }); calls.push(`write:${value}`); writes.push(value); await write(value); }, deleteItemAsync: async () => { calls.push('delete'); } };
    if (name === 'expo-screen-capture') return screenCapture;
    if (name === 'react-native-safe-area-context') return { SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
    if (name === './ui') return { colors: { background: '#000', surface: '#111', text: '#fff', secondary: '#aaa', accent: '#0f0', expense: '#f00' }, styles: {}, Button: 'Button', Card: 'Card', Icon: 'Icon', Page: 'Page' };
    throw new Error(`Unexpected app-lock dependency: ${name}`);
  } });
  function visit(node: any, fn: (node: any) => void) { if (Array.isArray(node)) { node.forEach(item => visit(item, fn)); return; } if (!node || typeof node !== 'object') return; fn(node); visit(node.props?.children, fn); }
  function render() { cursor = 0; dirty = false; tree = exports.AppLockProvider({ children: child }); visit(tree, node => { const context = contexts.find(item => item.Provider === node.type); if (context) context.value = node.props.value; }); return tree; }
  async function flush() { for (let count = 0; count < 32; count++) { if (dirty || !tree) render(); pendingEffects.splice(0).forEach(run => run()); await Promise.resolve(); } if (dirty) render(); }
  function state(): Lock { if (dirty || !tree) render(); return exports.useAppLock(); }
  function pathToChild(node: any, path: any[] = []): any[] | null { if (node === child) return path; if (Array.isArray(node)) { for (const item of node) { const found = pathToChild(item, path); if (found) return found; } } else if (node && typeof node === 'object') return pathToChild(node.props?.children, [...path, node]); return null; }
  return { exports, calls, writes, secureCalls, authOptions, switcherOptions, timers, expireTimers: (delay: number) => { timers.filter(timer => timer.active && timer.delay <= delay).forEach(timer => { timer.active = false; timer.callback(); }); }, state, render, flush, tree: () => { state(); return tree; }, childPath: () => { state(); return pathToChild(tree); },
    unmount: () => { unmounted = true; for (const slot of slots) if (typeof slot?.cleanup === 'function') slot.cleanup(); }, updatesAfterUnmount: () => updatesAfterUnmount,
    change: async (next: string) => { appState.currentState = next; listeners.forEach(listener => listener(next)); await flush(); },
    read: (next: () => Promise<unknown>) => { read = next; }, auth: (next: () => Promise<any>) => { auth = next; }, privacy: (next: () => Promise<void>) => { privacy = next; }, write: (next: (value: string) => Promise<void>) => { write = next; } };
}

function assertClosed(app: ReturnType<typeof harness>) { assert.equal(app.state().locked, true); assert.equal(app.state().covered, true); assert.throws(() => app.state().assertUnlocked()); }
async function start(flag: unknown = '1', expoGo = false) { const app = harness(flag, expoGo); await app.flush(); return app; }

test('secure app-lock flag accepts only absent, zero and one strings', () => {
  const { parseAppLockFlag } = harness().exports;
  assert.equal(parseAppLockFlag(null), false); assert.equal(parseAppLockFlag('0'), false); assert.equal(parseAppLockFlag('1'), true);
  for (const bad of [undefined, '', 'true', 'false', '01', ' 1', '1 ', 0, 1, true, false, {}, []]) assert.throws(() => parseAppLockFlag(bad));
});

test('pending cold-start secure read never mounts private children', async () => {
  const app = harness(); const pending = deferred<unknown>(); app.read(() => pending.promise); await app.flush();
  assert.equal(app.state().enabled, null); assertClosed(app); assert.equal(app.childPath(), null); assert.equal(app.calls.filter(call => call === 'auth').length, 0);
  pending.resolve('0'); await app.flush(); assert.equal(app.state().enabled, false); assert.ok(app.childPath()); assert.doesNotThrow(() => app.state().assertUnlocked());
});

test('secure read errors and corrupt flags fail closed and recover only through a successful retry', async () => {
  for (const corrupt of [false, true]) {
    const app = harness(); app.read(async () => { if (!corrupt) throw new Error('secure store unavailable'); return 'corrupt'; }); await app.flush();
    assertClosed(app); assert.equal(app.childPath(), null); assert.ok(app.state().error); assert.deepEqual(app.writes, []);
    app.read(async () => '1'); await attempt(app.state().retry()); await app.flush(); assert.equal(app.state().enabled, true); assertClosed(app); assert.equal(app.calls.filter(call => call === 'auth').length, 0);
  }
});

test('enabled cold start prepares opaque app-switcher privacy but waits for explicit unlock', async () => {
  const app = await start(); assert.equal(app.state().enabled, true); assertClosed(app); assert.equal(app.childPath(), null);
  assert.ok(app.calls.includes('switcher')); assert.ok(app.switcherOptions.every(value => value === 1)); assert.equal(app.calls.filter(call => call === 'auth').length, 0); assert.deepEqual(app.writes, []);
  assert.ok(!app.calls.includes('capture'), 'app lock preserves deliberate screenshot/export behavior');
  assert.equal(typeof app.exports.LockSettingsCard, 'function');
});

test('double unlock shares one native authentication and admits children only on success', async () => {
  const app = await start(); const pending = deferred<any>(); app.auth(() => pending.promise);
  const first = app.state().unlock(); const second = app.state().unlock(); await app.flush(); assert.equal(app.calls.filter(call => call === 'auth').length, 1); assert.equal(app.state().busy, true); assertClosed(app);
  pending.resolve({ success: true }); await Promise.all([attempt(first), attempt(second)]); await app.flush();
  assert.equal(app.state().locked, false); assert.equal(app.state().covered, false); assert.equal(app.state().busy, false); assert.ok(app.childPath()); assert.doesNotThrow(() => app.state().assertUnlocked()); assert.deepEqual(app.writes, []);
  assert.equal(app.authOptions[0].disableDeviceFallback, false, 'system device passcode remains an authentication fallback');
});

test('cancelled, unsuccessful and rejected authentication never disables or admits the app', async () => {
  for (const failure of ['user_cancel', 'authentication_failed', 'exception']) {
    const app = await start(); app.auth(async () => { if (failure === 'exception') throw new Error('native authentication unavailable'); return { success: false, error: failure }; });
    await attempt(app.state().unlock()); await app.flush(); assertClosed(app); assert.equal(app.state().enabled, true); assert.equal(app.childPath(), null); assert.equal(app.state().busy, false); assert.deepEqual(app.writes, []);
  }
});

test('success during its own inactive authentication is covered until active then unlocks without reprompting', async () => {
  const app = await start(); const pending = deferred<any>(); app.auth(() => pending.promise); const operation = app.state().unlock(); await app.flush();
  await app.change('inactive'); pending.resolve({ success: true }); await attempt(operation); await app.flush();
  assert.equal(app.state().covered, true); assert.throws(() => app.state().assertUnlocked()); assert.equal(app.childPath(), null);
  await app.change('active'); assert.equal(app.state().locked, false); assert.equal(app.state().covered, false); assert.equal(app.calls.filter(call => call === 'auth').length, 1); assert.ok(app.childPath());
});

test('background invalidates a pending authentication success and requires a fresh explicit unlock', async () => {
  const app = await start(); const pending = deferred<any>(); app.auth(() => pending.promise); const operation = app.state().unlock(); await app.flush();
  await app.change('background'); await app.change('active'); pending.resolve({ success: true }); await attempt(operation); await app.flush(); assertClosed(app); assert.equal(app.childPath(), null);
  app.auth(async () => ({ success: true })); await attempt(app.state().unlock()); await app.flush(); assert.equal(app.state().locked, false); assert.equal(app.calls.filter(call => call === 'auth').length, 2);
});

test('inactive outside authentication immediately locks with a live guard and retains hidden drafts', async () => {
  const app = await start(); await attempt(app.state().unlock()); await app.flush(); const capturedGuard = app.state().assertUnlocked; assert.ok(app.childPath());
  const dismisses = app.calls.filter(call => call === 'keyboard-dismiss').length;
  await app.change('inactive'); assertClosed(app); assert.throws(capturedGuard); assert.ok(app.calls.filter(call => call === 'keyboard-dismiss').length > dismisses, 'cover dismisses private input keyboard'); const ancestors = app.childPath(); assert.ok(ancestors, 'private children stay mounted after first admission');
  assert.ok(ancestors.some(node => node.props?.pointerEvents === 'none'), 'locked children cannot receive taps');
  assert.ok(ancestors.some(node => node.props?.accessibilityElementsHidden === true && node.props?.importantForAccessibility === 'no-hide-descendants'), 'locked children are hidden from assistive technology');
  await app.change('active'); assertClosed(app); assert.equal(app.calls.filter(call => call === 'auth').length, 1);
  await attempt(app.state().unlock()); await app.flush(); assert.doesNotThrow(capturedGuard); assert.ok(app.childPath());
});

test('enable authenticates and completes app-switcher privacy before persisting a device-only flag', async () => {
  const app = await start('0'); const pendingAuth = deferred<any>(); const pendingPrivacy = deferred<void>(); app.auth(() => pendingAuth.promise); app.privacy(() => pendingPrivacy.promise);
  const operation = app.state().setEnabled(true); const duplicate = app.state().setEnabled(true); await app.flush(); assert.equal(app.calls.filter(call => call === 'auth').length, 1); assert.deepEqual(app.writes, []);
  pendingAuth.resolve({ success: true }); await app.flush(); assert.deepEqual(app.writes, []); pendingPrivacy.resolve(); await Promise.all([attempt(operation), attempt(duplicate)]); await app.flush();
  assert.deepEqual(app.writes, ['1']); assert.equal(app.state().enabled, true);
  assert.ok(app.calls.indexOf('auth') < app.calls.indexOf('write:1')); assert.ok(app.calls.indexOf('switcher') < app.calls.indexOf('write:1')); assert.ok(app.switcherOptions.every(value => value === 1)); assert.ok(!app.calls.includes('capture'));
  assert.ok(app.secureCalls.length >= 2); const key = app.secureCalls[0].key; assert.equal(key, 'sovi.app-lock.enabled');
  for (const call of app.secureCalls) { assert.equal(call.key, key); assert.equal(call.options?.keychainAccessible, 'when-unlocked'); assert.equal(call.options?.requireAuthentication, false); }
});

test('disable requires fresh authentication before writing the disabled flag', async () => {
  const app = await start(); await attempt(app.state().unlock()); await app.flush(); const before = app.calls.filter(call => call === 'auth').length; const pending = deferred<any>(); app.auth(() => pending.promise);
  const operation = app.state().setEnabled(false); await app.flush(); assert.equal(app.calls.filter(call => call === 'auth').length, before + 1); assert.deepEqual(app.writes, []); assert.equal(app.state().enabled, true);
  pending.resolve({ success: true }); await attempt(operation); await app.flush(); assert.deepEqual(app.writes, ['0']); assert.equal(app.state().enabled, false); assert.equal(app.state().covered, false);
});

test('cancelled settings authentication cannot change either persistent flag', async () => {
  for (const flag of ['0', '1']) { const app = await start(flag); if (flag === '1') { await attempt(app.state().unlock()); await app.flush(); }
    app.auth(async () => ({ success: false, error: 'user_cancel' })); await attempt(app.state().setEnabled(flag === '0')); await app.flush(); assert.deepEqual(app.writes, []); assert.equal(app.state().enabled, flag === '1');
  }
});

test('failed enable or disable writes fail closed without silently changing the stored setting', async () => {
  for (const flag of ['0', '1']) { const app = await start(flag); if (flag === '1') { await attempt(app.state().unlock()); await app.flush(); }
    app.write(async () => { throw new Error('keychain write failed'); }); await attempt(app.state().setEnabled(flag === '0')); await app.flush(); assertClosed(app); assert.ok(app.state().error); assert.equal(app.state().enabled, flag === '1'); assert.equal(app.writes.length, 1); assert.ok(!app.calls.includes('delete'));
  }
});

test('Expo Go reports unavailable and cannot enable app lock or invoke Face ID', async () => {
  const app = await start('0', true); assert.equal(app.state().available, false); await attempt(app.state().setEnabled(true)); await app.flush(); assert.equal(app.state().enabled, false); assert.deepEqual(app.writes, []); assert.equal(app.calls.filter(call => call === 'auth').length, 0);
});

test('privacy setup failure on enabled startup remains closed even after authentication succeeds', async () => {
  const app = harness(); app.privacy(async () => { throw new Error('privacy protection unavailable'); }); await app.flush(); assertClosed(app); assert.ok(app.state().error); assert.equal(app.childPath(), null);
  await attempt(app.state().unlock()); await app.flush(); assertClosed(app); assert.equal(app.childPath(), null); assert.deepEqual(app.writes, []);
});

test('background invalidates an in-flight secure retry result', async () => {
  const app = harness(); app.read(async () => { throw new Error('read failed'); }); await app.flush(); const pending = deferred<unknown>(); app.read(() => pending.promise);
  const operation = app.state().retry(); await app.flush(); await app.change('background'); pending.resolve('0'); await attempt(operation); await app.flush();
  assert.equal(app.state().covered, true); assert.equal(app.childPath(), null); assert.throws(() => app.state().assertUnlocked());
  app.read(async () => '1'); await app.change('active'); await attempt(app.state().retry()); await app.flush(); assert.equal(app.state().enabled, true); assertClosed(app);
});

test('inactive during privacy preparation after authentication cancels enabling before the secure write', async () => {
  const app = await start('0'); const pending = deferred<void>(); app.privacy(() => pending.promise);
  const operation = app.state().setEnabled(true); await app.flush(); assert.ok(app.calls.includes('switcher')); assert.deepEqual(app.writes, []);
  await app.change('inactive'); assertClosed(app); pending.resolve(); await attempt(operation); await app.flush(); await app.change('active');
  assertClosed(app); assert.deepEqual(app.writes, []); assert.equal(app.state().enabled, false);
});

test('inactive during a settings write is not exempt as an authentication prompt', async () => {
  const app = await start(); await attempt(app.state().unlock()); await app.flush(); const pending = deferred<void>(); app.write(async () => { await pending.promise; });
  const operation = app.state().setEnabled(false); await app.flush(); assert.deepEqual(app.writes, ['0']);
  await app.change('inactive'); assertClosed(app); pending.resolve(); await attempt(operation); await app.flush(); await app.change('active');
  assertClosed(app); assert.equal(app.state().enabled, true, 'stale write completion cannot turn off the live lock');
});

test('background settings-write completion stays closed until explicit retry reads the authoritative flag', async () => {
  for (const original of ['0', '1']) {
    const app = await start(original); if (original === '1') { await attempt(app.state().unlock()); await app.flush(); }
    let durable = original; const pending = deferred<void>(); app.read(async () => durable); app.write(async value => { await pending.promise; durable = value; });
    const operation = app.state().setEnabled(original === '0'); await app.flush(); assert.equal(app.writes.length, 1);
    await app.change('background'); await app.change('active'); pending.resolve(); await attempt(operation); await app.flush(); assertClosed(app);
    assert.equal(durable, original === '0' ? '1' : '0'); const reads = app.calls.filter(call => call === 'read').length;
    await attempt(app.state().retry()); await app.flush(); assert.ok(app.calls.filter(call => call === 'read').length > reads); assert.equal(app.state().enabled, durable === '1');
    if (durable === '1') assertClosed(app); else { assert.equal(app.state().covered, false); assert.doesNotThrow(() => app.state().assertUnlocked()); }
  }
});

test('failed app-switcher preparation while enabling never persists or exposes an enabled session', async () => {
  const app = await start('0'); app.privacy(async () => { throw new Error('app-switcher protection unavailable'); }); await attempt(app.state().setEnabled(true)); await app.flush();
  assertClosed(app); assert.equal(app.state().enabled, false); assert.deepEqual(app.writes, []); assert.ok(app.state().error);
});

test('unknown and disabled lock covers describe loading or recovery without claiming Face ID is enabled', async () => {
  const app = harness('0'); const pending = deferred<unknown>(); app.read(() => pending.promise); await app.flush();
  assert.equal(app.state().enabled, null); assert.doesNotMatch(JSON.stringify(app.tree()), /Sổ Ví đang được khóa|Mở khóa bằng Face ID|Mở khóa Sổ Ví/);
  pending.resolve('0'); await app.flush(); await app.change('background'); await app.change('active');
  app.read(async () => { throw new Error('Storage not ready'); }); await attempt(app.state().retry()); await app.flush();
  assertClosed(app); assert.doesNotMatch(JSON.stringify(app.tree()), /Sổ Ví đang được khóa|Mở khóa bằng Face ID|Mở khóa Sổ Ví/); assert.equal(app.calls.filter(call => call === 'auth').length, 0);
});

test('enabling waits for its successful native prompt to return active and continues once without reprompting', async () => {
  const app = await start('0'); const pending = deferred<any>(); app.auth(() => pending.promise);
  const operation = app.state().setEnabled(true); await app.flush(); await app.change('inactive'); pending.resolve({ success: true }); await app.flush();
  assert.equal(app.state().covered, true); assert.deepEqual(app.writes, []);
  await app.change('active'); await attempt(operation); await app.flush();
  assert.deepEqual(app.writes, ['1']); assert.equal(app.state().enabled, true); assert.equal(app.state().covered, false); assert.equal(app.calls.filter(call => call === 'auth').length, 1);
});

test('enabling after a successful inactive native prompt is invalidated by true background', async () => {
  const app = await start('0'); const pending = deferred<any>(); app.auth(() => pending.promise);
  const operation = app.state().setEnabled(true); await app.flush(); await app.change('inactive'); pending.resolve({ success: true }); await app.flush();
  await app.change('background'); await app.change('active'); await attempt(operation); await app.flush();
  assertClosed(app); assert.deepEqual(app.writes, []); assert.equal(app.state().enabled, false);
});

test('accepted native authentication that never returns active times out within five seconds without writing', async () => {
  const app = await start('0'); const pending = deferred<any>(); app.auth(() => pending.promise);
  const operation = app.state().setEnabled(true); await app.flush(); await app.change('inactive'); pending.resolve({ success: true }); await app.flush();
  assert.ok(app.timers.some(timer => timer.active && timer.delay > 0 && timer.delay <= 5000), 'foreground wait has a bounded timer');
  app.expireTimers(5000); await attempt(operation); await app.flush(); assertClosed(app); assert.deepEqual(app.writes, []); assert.equal(app.state().busy, false); assert.equal(app.state().enabled, false);
  await app.change('active'); assertClosed(app); assert.equal(app.calls.filter(call => call === 'auth').length, 1);
});

test('unmount during accepted authentication foreground wait cancels timers without writing or admitting children', async () => {
  const app = await start('0'); const guard = app.state().assertUnlocked; const pending = deferred<any>(); app.auth(() => pending.promise);
  const operation = app.state().setEnabled(true); await app.flush(); await app.change('inactive'); pending.resolve({ success: true }); await app.flush();
  assert.ok(app.timers.some(timer => timer.active), 'accepted own-prompt success is waiting for active');
  app.unmount(); await attempt(operation); await app.flush(); assert.deepEqual(app.writes, []); assert.equal(app.updatesAfterUnmount(), 0); assert.throws(guard); assert.ok(app.timers.every(timer => !timer.active), 'unmount cancels the foreground wait');
});
