import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyLedger, applyCommand, type Command } from '../src/domain.ts';
import { validateNativeImport, drainNativeImports } from '../src/native-import.ts';

const input = { id: '11111111-2222-4333-8444-555555555555', source: 'sms', provider: 'Ngân hàng', sourceId: 'sms-1', text: 'Thanh toán thành công số tiền 58.000 VND. Mã GD: ABC123', receivedAt: '2026-10-10T12:00:00.000Z' };
function harness() {
  let ledger = emptyLedger(); let revision = 0; let pending: unknown[] = [{ ...input }];
  const order: string[] = []; const commands: Command[] = []; let failReceive = false; let failAck = false; let failProcess = false;
  const repository = {
    load: async () => ({ ledger, revision }),
    mutate: async (command: Command, expected: number) => {
      order.push(command.type); commands.push(command);
      assert.equal(expected, revision);
      if (failReceive && command.type === 'import.receive') throw new Error('disk-full');
      if (failProcess && command.type === 'import.process') throw new Error('process-failed');
      const next = applyCommand(ledger, command, { now: new Date().toISOString() });
      if (next !== ledger) revision++;
      ledger = next; return { ledger, revision };
    }
  };
  const bridge = { pendingImportsAsync: async () => pending, acknowledgeImportAsync: async (id: string) => {
    order.push('ack'); assert.ok(ledger.importedEvents.some(event => event.id === id), 'ack requires durable Inbox receipt');
    if (failAck) throw new Error('ack-failed');
    pending = pending.filter((event: any) => event.id !== id);
  } };
  return { repository, bridge, commands, order, loaded: () => ({ ledger, revision }), pending: () => pending,
    setPending: (value: unknown[]) => { pending = value; }, failReceive: (value: boolean) => { failReceive = value; }, failAck: (value: boolean) => { failAck = value; }, failProcess: (value: boolean) => { failProcess = value; } };
}

test('native boundary preserves text and validates source, IDs, dates, keys and UTF-16 limits', () => {
  assert.deepEqual(validateNativeImport(input), input);
  const exact = '😀'.repeat(2000); assert.equal(validateNativeImport({ ...input, text: exact }).text, exact);
  const bad = [null, [], { ...input, id: '../outside' }, { ...input, source: 'notification' }, { ...input, sourceId: 3 },
    { ...input, provider: 'x'.repeat(201) }, { ...input, sourceId: 'x'.repeat(201) }, { ...input, text: exact + 'x' },
    { ...input, text: '  ' }, { ...input, receivedAt: 'not-a-date' }, { ...input, receivedAt: '2099-01-01T00:00:00.000Z' },
    { ...input, receivedAt: '2026-02-30T00:00:00.000Z' }, { ...input, command: 'data.clear' }];
  for (const value of bad) assert.throws(() => validateNativeImport(value));
});

test('native delivery is persisted before ACK and analysis never posts money', async () => {
  const app = harness(); const loaded = await drainNativeImports(app.bridge, app.repository);
  assert.deepEqual(app.order, ['import.receive', 'ack', 'import.process']);
  assert.equal(loaded.ledger.importedEvents.length, 1); assert.equal(loaded.ledger.importedEvents[0].state, 'needs_review');
  assert.equal(loaded.ledger.importedEvents[0].amount, '58000');
  assert.equal(loaded.ledger.transactions.length, 0); assert.equal(loaded.ledger.transfers.length, 0); assert.equal(app.pending().length, 0);
});

test('receive failure retains native input and leaves the ledger unchanged', async () => {
  const app = harness(); app.failReceive(true);
  await assert.rejects(drainNativeImports(app.bridge, app.repository), /disk-full/);
  assert.equal(app.pending().length, 1); assert.equal(app.loaded().ledger.importedEvents.length, 0); assert.ok(!app.order.includes('ack'));
  app.failReceive(false); await drainNativeImports(app.bridge, app.repository);
  assert.equal(app.loaded().ledger.importedEvents.length, 1);
});

test('crash after receive but before ACK retries the same item without duplicate events or receipts', async () => {
  const app = harness(); app.failAck(true);
  await assert.rejects(drainNativeImports(app.bridge, app.repository), /ack-failed/);
  assert.equal(app.loaded().ledger.importedEvents.length, 1); assert.equal(app.pending().length, 1);
  app.failAck(false); await drainNativeImports(app.bridge, app.repository);
  const loaded = app.loaded(); assert.equal(loaded.ledger.importedEvents.length, 1);
  assert.equal(loaded.ledger.receipts.filter(receipt => receipt.id === `native-receive-${input.id}`).length, 1);
  assert.equal(loaded.ledger.transactions.length, 0);
});

test('same native ID with changed payload is rejected without ACK or overwriting the received event', async () => {
  const app = harness(); app.failAck(true); await assert.rejects(drainNativeImports(app.bridge, app.repository));
  app.failAck(false); app.setPending([{ ...input, text: 'Nội dung khác' }]); const before = JSON.stringify(app.loaded());
  await assert.rejects(drainNativeImports(app.bridge, app.repository));
  assert.equal(JSON.stringify(app.loaded()), before); assert.equal(app.pending().length, 1);
});

test('analysis failure after ACK leaves a durable received item for manual Inbox retry', async () => {
  const app = harness(); app.failProcess(true);
  await assert.rejects(drainNativeImports(app.bridge, app.repository), /process-failed/);
  assert.equal(app.pending().length, 0); assert.equal(app.loaded().ledger.importedEvents[0].state, 'received');
  assert.equal(app.loaded().ledger.transactions.length, 0);
});

test('invalid envelope cannot be acknowledged, persisted or execute ledger commands', async () => {
  const app = harness(); app.setPending([{ ...input, text: 'x'.repeat(4001) }]);
  await assert.rejects(drainNativeImports(app.bridge, app.repository));
  assert.equal(app.commands.length, 0); assert.equal(app.order.length, 0); assert.equal(app.pending().length, 1);
});

test('separate equal-amount source events both survive transport and existing domain dedup rules', async () => {
  const app = harness(); app.setPending([
    { ...input, sourceId: 'one', text: 'Thanh toán thành công 58.000 VND. Mã GD: ABC123' },
    { ...input, id: '22222222-3333-4444-8555-666666666666', sourceId: 'two', text: 'Thanh toán thành công 58.000 VND. Mã GD: ABC456' }
  ]);
  const loaded = await drainNativeImports(app.bridge, app.repository);
  assert.equal(loaded.ledger.importedEvents.length, 2); assert.ok(loaded.ledger.importedEvents.every(event => event.state === 'needs_review'));
  assert.equal(loaded.ledger.transactions.length, 0); assert.equal(app.pending().length, 0);
});
