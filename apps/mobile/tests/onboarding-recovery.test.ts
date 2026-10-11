import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import * as domain from '../src/domain.ts';

// Actual form and useDraft share a hook scheduler; only the native UI and persisted store boundary are controlled.
function harness() {
  const require = createRequire(import.meta.url); const ts = require('typescript'); let clock = Date.parse('2026-10-11T05:01:00.000Z');
  class Clock extends Date { constructor(value?: any) { super(value === undefined ? clock : value); } static now() { return clock; } }
  let ledger = domain.emptyLedger(); let revision = 0; let sequence = 0; let slots: any[] = []; let cursor = 0; let locked = false; let failSettings = true; const commands: domain.Command[] = []; const navigation: string[] = [];
  const react = { createElement: (type: any, props: any, ...children: any[]) => ({ type, props: { ...props, children } }),
    useState: (initial: any) => { const at = cursor++; if (!(at in slots)) slots[at] = typeof initial === 'function' ? initial() : initial; return [slots[at], (next: any) => { slots[at] = typeof next === 'function' ? next(slots[at]) : next; }]; },
    useRef: (value: any) => { const at = cursor++; if (!(at in slots)) slots[at] = { current: value }; return slots[at]; }, useEffect: (effect: any) => { /* Navigation is inspected through draft completion instead of running component effects. */ },
  };
  const assertUnlocked = () => { if (locked) throw new Error('App locked'); };
  const store = { newId: () => `new-${++sequence}`, errorMessage: (error: Error) => error.message, useLedger: () => ({ ledger, revision, refresh: async () => ({ ledger: structuredClone(ledger), revision }), execute: async (command: domain.Command, expected: number) => {
    assertUnlocked(); if (failSettings && command.type === 'settings.update') throw new Error('settings commit interrupted');
    commands.push(structuredClone(command)); const next = domain.applyCommand(ledger, command, { now: new Clock().toISOString() });
    if (next !== ledger) { if (expected !== revision) throw new Error('STALE'); ledger = next; revision++; } return { ledger: structuredClone(ledger), revision };
  } }) };
  const router = { canGoBack: () => false, replace: (route: string) => navigation.push(route), push: (route: string) => navigation.push(route) };
  const imports = (name: string): any => {
    if (name === 'react') return react;
    if (name === 'react-native') return { Text: 'Text', View: 'View', StyleSheet: { create: (styles: any) => styles }, Alert: { alert() {} } };
    if (name === 'expo-router') return { router, useLocalSearchParams: () => ({}), useNavigation: () => ({ dispatch() {} }) };
    if (name === 'expo-router/react-navigation') return { usePreventRemove() {} };
    if (name === './domain') return domain;
    if (name === './store') return store;
    if (name === './app-lock') return { useAppLock: () => ({ assertUnlocked, locked, covered: locked }) };
    return {};
  };
  const load = (name: string, dependency: (name: string) => any) => { const exports: any = {}; const code = ts.transpileModule(readFileSync(new URL(`../src/${name}.tsx`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText; runInNewContext(code, { exports, Date: Clock, Error, Intl, require: dependency }); return exports; };
  const actualUI = load('ui', imports); let draft: any; let pending: Promise<void>[] = [];
  const ui = { ...actualUI, Page: 'Page', Card: 'Card', Field: 'Field', Button: 'Button', FormFooter: 'FormFooter', useDraft: (...args: any[]) => {
    draft = actualUI.useDraft(...args); const save = draft.save; const exposed = { ...draft, save: (...values: any[]) => { const work = save(...values); pending.push(work); return work; } }; return exposed;
  } };
  const forms = load('forms', name => name === './ui' ? ui : imports(name));
  const nodes = (node: any): any[] => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];
  const render = () => { cursor = 0; return forms.OnboardingScreen(); };
  const start = async () => { const button = nodes(render()).find(node => node.type === 'Button' && node.props.title === 'Bắt đầu'); assert.ok(button); button.props.onPress(); await Promise.all(pending.splice(0)); render(); };
  render(); return { render, start, commands, loaded: () => ({ ledger, revision }), draft: () => draft, advanceMinute: () => { clock += 60000; }, allowSettings: () => { failSettings = false; }, lock: (value: boolean) => { locked = value; }, remount: () => { slots = []; render(); } };
}

test('onboarding retries only the interrupted settings completion after a minute without changing the committed wallet', async () => {
  const app = harness(); app.draft().set('amount', '125000'); await app.start(); assert.equal(app.loaded().ledger.wallets.length, 1); assert.equal(app.loaded().ledger.settings.onboarded, false); assert.match(app.draft().errors.form, /interrupted/);
  const wallet = structuredClone(app.loaded().ledger.wallets[0]); const receipts = app.loaded().ledger.receipts.length; app.advanceMinute(); app.allowSettings(); await app.draft().reload(); await app.start();
  assert.equal(app.loaded().ledger.settings.onboarded, true); assert.deepEqual(app.loaded().ledger.wallets, [wallet]); assert.equal(app.loaded().ledger.receipts.length, receipts + 1); assert.equal(app.draft().errors.form, undefined);
});

test('onboarding remount resumes settings without creating a second wallet or changing the first balance', async () => {
  const app = harness(); await app.start(); const wallet = structuredClone(app.loaded().ledger.wallets[0]); app.advanceMinute(); app.allowSettings(); app.remount(); await app.start();
  assert.equal(app.loaded().ledger.settings.onboarded, true); assert.deepEqual(app.loaded().ledger.wallets, [wallet]); assert.equal(app.loaded().ledger.receipts.filter(item => item.signature.includes('wallet.create')).length, 1);
});

test('invalid onboarding timezone and locked captured actions cannot start a persisted wallet commit', async () => {
  const invalid = harness(); invalid.draft().set('timezone', 'No/Such_Zone'); await invalid.start(); assert.equal(invalid.commands.length, 0); assert.equal(invalid.loaded().ledger.wallets.length, 0); assert.ok(Object.keys(invalid.draft().errors).length > 0);
  const locked = harness(); locked.lock(true); await locked.start(); assert.equal(locked.commands.length, 0); assert.equal(locked.loaded().ledger.wallets.length, 0); assert.match(locked.draft().errors.form, /locked/);
});
