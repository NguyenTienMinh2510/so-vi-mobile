import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as domain from '../src/domain.ts';
import { drainNativeImports, type NativeImport } from '../src/native-import.ts';

const now = '2026-10-12T00:00:00.000Z';
const id = (index: number) => `11111111-2222-4333-8444-${String(index).padStart(12, '0')}`;
const envelope = (index: number, source: 'email' | 'sms', text: string): NativeImport => ({ id: id(index), source, provider: 'BIDV', sourceId: `${source}-synthetic-${index}`, text, receivedAt: now });
const paid = 'Thanh toán thành công số tiền 58.000 VND. Số dư 942.000 VND. Mã GD: TESTMAIL001';
function harness(input: NativeImport[]) {
  let ledger = domain.emptyLedger(); let revision = 0; let pending = [...input]; let rejectProcess = false;
  ledger.wallets = [{ id: 'cash', version: 1, name: 'Tiền mặt', icon: 'wallet', openingBalance: '1000000', openingAt: now, archived: false }];
  ledger.categories = [{ id: 'food', version: 1, name: 'Ăn uống', icon: 'restaurant', kind: 'expense', archived: false }];
  const commands: domain.Command[] = []; const order: string[] = [];
  const repository = { load: async () => ({ ledger, revision }), mutate: async (command: domain.Command, expected: number) => {
    assert.equal(expected, revision); order.push(command.type);
    if (rejectProcess && command.type === 'import.process') throw new Error('Synthetic parse-write failure');
    const next = domain.applyCommand(ledger, command, { now }); commands.push(command);
    if (next !== ledger) revision++; ledger = next; return { ledger, revision };
  } };
  const bridge = { pendingImportsAsync: async () => [...pending], acknowledgeImportAsync: async (incomingId: string) => {
    assert.ok(ledger.importedEvents.some(event => event.id === incomingId), 'durable receive must precede origin ACK');
    order.push(`ack:${incomingId}`); pending = pending.filter(event => event.id !== incomingId);
  } };
  const confirm = async (incomingId: string, mutationId = 'confirm-mail', transactionId = 'mail-expense') => {
    const event = ledger.importedEvents.find(event => event.id === incomingId)!;
    return repository.mutate({ type: 'import.confirm', mutationId, payload: { id: event.id, expectedVersion: event.version, entry: { type: 'transaction', payload: { id: transactionId, kind: 'expense', walletId: 'cash', categoryId: 'food', amount: '58000', occurredAt: now, note: 'Thông báo tổng hợp đã duyệt', tagIds: [] } } } }, revision);
  };
  return { repository, bridge, commands, order, confirm, ledger: () => ledger, pending: () => pending,
    failProcess: (value: boolean) => { rejectProcess = value; }, replay: (event: NativeImport) => { pending.push(event); } };
}
const noMoney = (ledger: domain.Ledger) => {
  assert.equal(ledger.transactions.length, 0); assert.equal(ledger.transfers.length, 0); assert.equal(domain.balances(ledger).total, '1000000');
};

test('synthetic email and SMS with one unique transaction reference survive transport and require one confirmation', async () => {
  const email = envelope(1, 'email', paid); const sms = envelope(2, 'sms', paid);
  const app = harness([email, sms]); const loaded = await drainNativeImports(app.bridge, app.repository);
  assert.deepEqual(app.order, ['import.receive', `ack:${email.id}`, 'import.process', 'import.receive', `ack:${sms.id}`, 'import.process']);
  const [owner, duplicate] = loaded.ledger.importedEvents;
  assert.equal(owner.source, 'email'); assert.equal(owner.state, 'needs_review'); assert.equal(owner.amount, '58000'); assert.equal(owner.kind, 'expense'); assert.equal(owner.reference, 'TESTMAIL001');
  assert.equal(duplicate.source, 'sms'); assert.equal(duplicate.state, 'duplicate'); assert.equal(duplicate.duplicateOf, owner.id); noMoney(loaded.ledger);
  assert.equal(app.pending().length, 0); await app.confirm(owner.id); assert.equal(app.ledger().transactions.length, 1); assert.equal(domain.balances(app.ledger()).total, '942000');
  app.replay(email); app.replay(sms); await drainNativeImports(app.bridge, app.repository);
  assert.equal(app.ledger().importedEvents.length, 2); assert.equal(app.ledger().transactions.length, 1);
  assert.equal(app.commands.filter(command => command.type === 'import.receive').length, 2);
  await assert.rejects(app.confirm(duplicate.id, 'confirm-duplicate', 'duplicate-expense'));
  assert.equal(app.ledger().transactions.length, 1);
});

test('pending and failed payment emails never permit a financial confirmation', async () => {
  for (const text of ['Đơn hàng 58.000 VND đang chờ thanh toán. Mã GD: TESTPENDING', 'Thanh toán 58.000 VND thất bại. Mã GD: TESTFAILED']) {
    const app = harness([envelope(3, 'email', text)]); const loaded = await drainNativeImports(app.bridge, app.repository);
    const event = loaded.ledger.importedEvents[0]; assert.equal(event.source, 'email'); assert.equal(event.classification, 'pending_order'); assert.equal(event.kind, null);
    assert.equal(event.state, 'needs_review'); assert.equal(app.pending().length, 0); noMoney(loaded.ledger);
    const before = JSON.stringify(loaded.ledger); await assert.rejects(app.confirm(event.id)); assert.equal(JSON.stringify(app.ledger()), before);
  }
});

test('parse write failure after email ACK keeps the same durable Inbox source for manual retry', async () => {
  const email = envelope(4, 'email', paid); const app = harness([email]); app.failProcess(true);
  await assert.rejects(drainNativeImports(app.bridge, app.repository), /Synthetic parse-write failure/);
  assert.equal(app.pending().length, 0); assert.equal(app.ledger().importedEvents.length, 1); assert.equal(app.ledger().importedEvents[0].state, 'received'); noMoney(app.ledger());
  app.failProcess(false); await drainNativeImports(app.bridge, app.repository);
  assert.equal(app.ledger().importedEvents[0].state, 'received', 'empty transport retry cannot reprocess an already acknowledged source');
  const received = await app.repository.load(); const command = { type: 'import.process', mutationId: 'manual-email-retry', payload: { id: email.id, expectedVersion: received.ledger.importedEvents[0].version } } as const;
  await app.repository.mutate(command, received.revision); noMoney(app.ledger());
  assert.equal(app.ledger().importedEvents[0].state, 'needs_review'); assert.equal(app.ledger().importedEvents[0].amount, '58000');
  const repeated = await app.repository.load(); await app.repository.mutate(command, repeated.revision);
  assert.equal(app.ledger().importedEvents.length, 1); assert.equal(app.commands.filter(command => command.type === 'import.receive').length, 1);
  await app.confirm(email.id); assert.equal(app.ledger().transactions.length, 1); assert.equal(domain.balances(app.ledger()).total, '942000');
});

test('sanitized bilingual BIDV email shape uses original VND amount and leaves approval code outside strong dedup', async () => {
  // Sanitized shape only; no original email, sender, account, merchant, time or message identifier is included.
  const text = 'BIDV thông báo giao dịch vừa thực hiện thành công\nGiao dịch/Transaction type: Thanh toán hàng hóa, dịch vụ/Retail\nSố tiền giao dịch gốc/Original amount: 58.000 VND\nTrạng thái giao dịch/Transaction status: Thành công/ Successfully\nMã giao dịch/Approval code: 654321';
  const app = harness([envelope(5, 'email', text)]); const loaded = await drainNativeImports(app.bridge, app.repository);
  const event = loaded.ledger.importedEvents[0]; assert.equal(event.text, text); assert.equal(event.classification, 'payment_success'); assert.equal(event.kind, 'expense'); assert.equal(event.amount, '58000');
  assert.equal(event.reference, null, 'approval-code global uniqueness has not been established'); assert.equal(event.state, 'needs_review'); noMoney(loaded.ledger);
  await app.confirm(event.id); assert.equal(app.ledger().transactions.length, 1); assert.equal(domain.balances(app.ledger()).total, '942000');
});
