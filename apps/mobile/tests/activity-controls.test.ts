import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import * as domain from '../src/domain.ts';

const now = '2026-10-12T00:00:00.000Z';
function fixture(unread = 63, read = 2) {
  const ledger = domain.emptyLedger();
  ledger.wallets = [{ id: 'cash', version: 1, name: 'Tiền mặt', icon: 'wallet', openingBalance: '1000000', openingAt: now, archived: false }];
  ledger.budgets = [{ id: 'budget', version: 1, name: 'Ngân sách thử', limit: '100000', start: now, endExclusive: '2026-11-01T00:00:00.000Z', walletIds: [], categoryIds: [] }];
  ledger.activities = Array.from({ length: unread + read }, (_, index) => ({ id: `activity-${String(index).padStart(3, '0')}`, kind: 'budget_exceeded', entityId: 'budget', message: `Thông báo thử ${index}`, createdAt: index < 2 ? now : '2026-10-11T00:00:00.000Z', read: index >= unread })) as domain.Activity[];
  return ledger;
}
function harness(initial = fixture()) {
  const require = createRequire(import.meta.url); const ts = require('typescript'); const exports: any = {};
  let ledger = initial; let revision = 0; let cursor = 0; let dirty = true; let tree: any; let sequence = 0; let locked = false; let attempts = 0;
  let pauseAt = 0; let rejectAt = 0; let release: (() => void) | undefined;
  const slots: any[] = []; const effects: any[] = []; const commands: domain.Command[] = []; const routes: any[] = []; const confirmations: { title: string; message: string; accept: () => void }[] = [];
  const assertUnlocked = () => { if (locked) throw new Error('Khóa thử trong khi dọn'); };
  const store = () => {
    const capturedRevision = revision;
    return { ledger, revision: capturedRevision, execute: async (command: domain.Command, expected = capturedRevision) => {
      attempts++;
      if (pauseAt === attempts) await new Promise<void>(resolve => { release = resolve; });
      assertUnlocked(); if (expected !== revision) throw new Error('Phiên bản dữ liệu đã thay đổi');
      if (rejectAt === attempts) { rejectAt = 0; throw new Error('Lỗi ghi thử một phần'); }
      assert.equal(command.type, 'activity.read', 'clearing notifications cannot execute a financial or destructive command');
      ledger = domain.applyCommand(ledger, command, { now }); commands.push(command); revision++; dirty = true;
      return { ledger, revision };
    }, refresh: async () => ({ ledger, revision }) };
  };
  const react = { Fragment: 'Fragment', createElement: (type: any, props: any, ...children: any[]) => ({ type, props: { ...props, children } }),
    useState: (initial: any) => { const at = cursor++; if (!(at in slots)) slots[at] = typeof initial === 'function' ? initial() : initial; return [slots[at], (next: any) => { slots[at] = typeof next === 'function' ? next(slots[at]) : next; dirty = true; }]; },
    useRef: (initial: any) => { const at = cursor++; if (!(at in slots)) slots[at] = { current: initial }; return slots[at]; },
    useEffect: (callback: any, deps?: any[]) => { const at = cursor++; const previous = slots[at]; if (!previous || !deps || deps.some((value, index) => !Object.is(value, previous.deps?.[index]))) { slots[at] = { deps }; effects.push(callback); } }
  };
  const source = ts.transpileModule(readFileSync(new URL('../src/screens.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  runInNewContext(source, { exports, Date, Error, require: (name: string) => {
    if (name === 'react') return react;
    if (name === 'react-native') return { Text: 'Text', View: 'View', Pressable: 'Pressable' };
    if (name === 'expo-router') return { router: { push: (value: any) => routes.push(value) } };
    if (name === './domain') return domain;
    if (name === './store') return { useLedger: store, newId: () => `activity-mutation-${++sequence}`, errorMessage: (error: Error) => error.message };
    if (name === './app-lock') return { useAppLock: () => ({ assertUnlocked }) };
    if (name === './ui') return { Page: 'Page', Card: 'Card', Choice: 'Choice', Button: 'Button', Empty: 'Empty', Icon: 'Icon', styles: {}, colors: {}, localInput: (value: string) => value, confirm: (title: string, message: string, accept: () => void) => confirmations.push({ title, message, accept }) };
    return {};
  } });
  function nodes(node: any): any[] { if (!node || typeof node !== 'object') return []; if (Array.isArray(node)) return node.flatMap(nodes); if (typeof node.type === 'function') return nodes(node.type(node.props)); return [node, ...nodes(node.props?.children)]; }
  const render = () => { cursor = 0; dirty = false; tree = exports.ActivitiesScreen(); return nodes(tree); };
  const flush = async () => { for (let index = 0; index < 512; index++) { if (dirty || !tree) render(); effects.splice(0).forEach(callback => callback()); await Promise.resolve(); } };
  const clear = () => { const button = render().find(node => node.type === 'Button' && node.props.title === 'Dọn thông báo'); assert.ok(button, 'activity screen must expose the approved clear action'); return button; };
  const filter = () => { const choice = render().find(node => node.type === 'Choice' && node.props.label === 'Trạng thái'); assert.ok(choice, 'activity screen must expose All/Unread/Read filters'); return choice; };
  const visible = () => render().filter(node => node.type === 'Card' && /^activity-/.test(node.props.key)).map(node => node.props.key);
  return { render, flush, clear, filter, visible, commands, routes, confirmations, ledger: () => ledger, attempts: () => attempts,
    pause: (number: number) => { pauseAt = number; }, reject: (number: number) => { rejectAt = number; }, release: () => { assert.ok(release); pauseAt = 0; release(); },
    interfere: (mode: 'stale' | 'restore' | 'lock') => { if (mode === 'lock') locked = true; else { revision++; if (mode === 'restore') ledger = JSON.parse(JSON.stringify(ledger)); } dirty = true; }, unlock: () => { locked = false; dirty = true; },
    arrive: () => { ledger = { ...ledger, activities: [...ledger.activities, { id: 'activity-new', kind: 'mutation', entityId: 'cash', message: 'Thông báo mới khi đang xác nhận', createdAt: now, read: false }] }; revision++; dirty = true; } };
}
const sorted = (ledger: domain.Ledger, read?: boolean) => ledger.activities.filter(activity => read === undefined || activity.read === read).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)).map(activity => activity.id);
const preservedHistory = (ledger: domain.Ledger) => ledger.activities.map(({ read, ...activity }) => activity);

test('actual Activity filters default to unread, count and page stable rows while browsing never mutates the ledger', async () => {
  const app = harness(); await app.flush(); const before = JSON.stringify(app.ledger()); const choice = app.filter();
  assert.deepEqual(Array.from(choice.props.selected), ['unread']);
  assert.deepEqual(Array.from(choice.props.items, (item: any) => item.id).sort(), ['all', 'read', 'unread']);
  const hasCount = (count: number) => app.render().some(node => node.type === 'Text' && new RegExp(`(^|\\D)${count}(\\D|$)`).test(node.props.children.flat(Infinity).join('')));
  assert.ok(hasCount(63), 'rendered summary must report the unread count');
  assert.deepEqual(app.visible(), sorted(app.ledger(), false).slice(0, 50));
  const load = app.render().find(node => node.type === 'Button' && node.props.title === 'Tải thêm hoạt động'); assert.ok(load); load.props.onPress(); await app.flush(); assert.deepEqual(app.visible(), sorted(app.ledger(), false));
  app.filter().props.onSelect('read'); await app.flush(); assert.deepEqual(app.visible(), sorted(app.ledger(), true)); assert.ok(hasCount(2), 'read filter summary must report its count');
  app.filter().props.onSelect('all'); await app.flush(); assert.deepEqual(app.visible(), sorted(app.ledger()).slice(0, 50)); assert.ok(hasCount(65), 'all filter summary must report its count');
  const budget = app.render().find(node => node.type === 'Button' && node.props.title === 'Xem ngân sách'); assert.ok(budget); budget.props.onPress(); assert.equal(app.routes.at(-1).params.id, 'budget');
  assert.equal(JSON.stringify(app.ledger()), before); assert.equal(app.commands.length, 0);
});

test('clear confirmation marks every unread notification once across pages and filters without deleting history or money', async () => {
  const app = harness(); await app.flush(); const original = app.ledger(); const history = preservedHistory(original); const expected = sorted(original, false);
  app.filter().props.onSelect('read'); await app.flush(); app.clear().props.onPress(); assert.equal(app.confirmations.length, 1); assert.equal(app.commands.length, 0);
  assert.ok(app.confirmations[0].message.length > 0); app.pause(1); const accept = app.confirmations[0].accept; accept(); accept(); await app.flush();
  assert.equal(app.attempts(), 1, 'a captured duplicate confirmation cannot start a second batch'); assert.equal(app.clear().props.disabled, true);
  app.release(); await app.flush(); assert.equal(app.commands.length, 63);
  assert.deepEqual(app.commands.map(command => (command.payload as any).id).sort(), [...expected].sort()); assert.equal(new Set(app.commands.map(command => command.mutationId)).size, 63);
  assert.ok(app.ledger().activities.every(activity => activity.read)); assert.deepEqual(preservedHistory(app.ledger()), history);
  assert.deepEqual(app.ledger().wallets, original.wallets); assert.deepEqual(app.ledger().transactions, original.transactions); assert.deepEqual(app.ledger().transfers, original.transfers); assert.equal(domain.balances(app.ledger()).total, '1000000');
  assert.deepEqual(domain.decodeBackup(domain.encodeBackup(app.ledger(), now), { now }).ledger, app.ledger());
});

test('partial failure, revision changes, restore or live lock stop the clear batch and retry only unread targets', async () => {
  for (const mode of ['reject', 'stale', 'restore', 'lock'] as const) {
    const app = harness(fixture(4, 0)); await app.flush(); const before = preservedHistory(app.ledger());
    if (mode === 'reject') app.reject(3); else app.pause(3);
    app.clear().props.onPress(); app.confirmations.at(-1)!.accept(); await app.flush();
    if (mode !== 'reject') { app.interfere(mode); app.release(); await app.flush(); }
    assert.equal(app.commands.length, 2, mode); assert.equal(app.ledger().activities.filter(activity => activity.read).length, 2, mode);
    assert.ok(app.render().some(node => node.type === 'Text' && node.props.accessibilityRole === 'alert'), `${mode} must report a recoverable error`);
    assert.deepEqual(preservedHistory(app.ledger()), before); assert.equal(domain.balances(app.ledger()).total, '1000000');
    app.unlock(); await app.flush(); app.clear().props.onPress(); app.confirmations.at(-1)!.accept(); await app.flush();
    assert.equal(app.commands.length, 4, mode); assert.equal(new Set(app.commands.map(command => (command.payload as any).id)).size, 4, mode);
    assert.ok(app.ledger().activities.every(activity => activity.read)); assert.deepEqual(preservedHistory(app.ledger()), before);
  }
  const changed = harness(fixture(4, 0)); await changed.flush(); changed.clear().props.onPress(); const queuedConfirmation = changed.confirmations.at(-1)!.accept;
  changed.arrive(); await changed.flush(); queuedConfirmation(); await changed.flush();
  assert.equal(changed.commands.length, 0, 'data received while confirmation is open must invalidate the old clear snapshot');
  assert.equal(changed.ledger().activities.length, 5); assert.ok(changed.ledger().activities.every(activity => !activity.read));
  assert.ok(changed.render().some(node => node.type === 'Text' && node.props.accessibilityRole === 'alert'));
});

test('an empty unread view disables clear and cannot invoke a command or delete previously read history', async () => {
  const app = harness(fixture(0, 2)); await app.flush(); const before = JSON.stringify(app.ledger());
  assert.equal(app.clear().props.disabled, true); assert.deepEqual(app.visible(), []);
  const captured = app.clear().props.onPress; captured(); await app.flush(); for (const confirmation of app.confirmations) confirmation.accept(); await app.flush();
  assert.equal(app.commands.length, 0); assert.equal(JSON.stringify(app.ledger()), before); assert.equal(app.ledger().activities.length, 2);
});
