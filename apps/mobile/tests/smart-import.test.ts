import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as domain from '../src/domain.ts';
import { parseImportText } from '../src/import.ts';

const now = '2026-10-10T12:00:00.000Z';
const at = '2026-10-10T01:00:00.000Z';
const period = { start: '2026-10-01T00:00:00.000Z', endExclusive: '2026-11-01T00:00:00.000Z' };
const run = (ledger: any, type: string, mutationId: string, payload: any) => domain.applyCommand(ledger, { type, mutationId, payload } as any, { now });
function fixture() {
  let s: any = domain.emptyLedger();
  for (const [id, amount] of [['cash', '1000000'], ['bank', '0']]) s = run(s, 'wallet.create', `w-${id}`, { id, name: id, icon: 'wallet', openingBalance: amount, openingAt: '2026-10-01T00:00:00.000Z', archived: false });
  for (const [id, kind] of [['food', 'expense'], ['refund', 'income']]) s = run(s, 'category.create', `c-${id}`, { id, kind, name: id, icon: 'wallet', archived: false });
  s = run(s, 'budget.create', 'b-init', { id: 'food-budget', name: 'Ăn uống', limit: '5500', ...period, walletIds: ['cash'], categoryIds: ['food'] });
  return s;
}
function receive(s: any, id: string, text = 'Thanh toán thành công số tiền 58.000 VND. Số dư 942.000 VND. Mã giao dịch: REF001', extra: any = {}) {
  return run(s, 'import.receive', `receive-${id}`, { id, source: 'sms', provider: 'Ngân hàng thử', sourceId: null, text, receivedAt: at, ...extra });
}
const process = (s: any, id: string) => run(s, 'import.process', `process-${id}`, { id, expectedVersion: s.importedEvents.find((e: any) => e.id === id).version });
const entry = (id: string, extra: any = {}) => ({ type: 'transaction', payload: { id, kind: 'expense', walletId: 'cash', categoryId: 'food', amount: '58000', occurredAt: at, note: 'Đã duyệt', tagIds: [], ...extra } });

test('text parser separates paid amount from account balance and extracts reference', () => {
  const p = parseImportText('Thanh toán thành công số tiền 58.000 VND. Số dư 942.000 VND. Mã giao dịch: REF001');
  assert.equal(p.classification, 'payment_success'); assert.equal(p.amount, '58000'); assert.equal(p.reference, 'REF001'); assert.equal(p.kind, 'expense');
  const signed = parseImportText('TK 123456 GD: -58,000 VND. SD: 942,000 VND.');
  assert.equal(signed.amount, '58000'); assert.equal(signed.kind, 'expense');
});
test('balance signs cannot determine payment direction or turn balance-only messages into payments', () => {
  const p = parseImportText('TK 123 GD: -58.000 VND. Số dư: +942.000 VND. Mã giao dịch: REF123');
  assert.equal(p.amount, '58000'); assert.equal(p.kind, 'expense'); assert.equal(p.reference, 'REF123');
  const balance = parseImportText('Số dư TK: -1.000 VND');
  assert.equal(balance.classification, 'balance_update'); assert.equal(balance.amount, null); assert.equal(balance.kind, null);
});
test('Unicode combining marks preserve parsed reference and classification', () => {
  const p = parseImportText('Thanh toán thành công số tiền 58.000 VND. Mã giao dịch: XYZ001'.normalize('NFD'));
  assert.equal(p.classification, 'payment_success'); assert.equal(p.amount, '58000'); assert.equal(p.reference, 'XYZ001');
});
test('pending orders never become paid expenses, refunds suggest income and balances stay informational', () => {
  assert.equal(parseImportText('Đơn hàng 58.000 VND đang chờ thanh toán').classification, 'pending_order');
  assert.equal(parseImportText('Thanh toán 58.000 VND chưa thành công').classification, 'pending_order');
  const refund = parseImportText('Hoàn tiền thành công số tiền 50.000 VND. Số dư 1.000.000 VND');
  assert.equal(refund.classification, 'refund'); assert.equal(refund.amount, '50000'); assert.equal(refund.kind, 'income');
  const balance = parseImportText('Số dư tài khoản hiện tại 1.000.000 VND');
  assert.equal(balance.classification, 'balance_update'); assert.equal(balance.amount, null);
  assert.equal(parseImportText('Chào bạn, ưu đãi cuối tuần').classification, 'ignored');
});
test('sending to someone else defaults expense, explicit internal wording is only a proposal', () => {
  const other = parseImportText('Đã chuyển thành công số tiền 100.000 VND cho Nguyễn A');
  assert.equal(other.classification, 'payment_success'); assert.equal(other.kind, 'expense');
  assert.equal(parseImportText('Chuyển nội bộ thành công số tiền 100.000 VND giữa các ví của tôi').classification, 'internal_transfer');
});
test('parser keeps BigInt precision and ambiguity requires correction', () => {
  assert.equal(parseImportText('Thanh toán thành công số tiền 9.007.199.254.740.993 VND').amount, '9007199254740993');
  const conflict = parseImportText('Thanh toán thành công 58.000 VND và 70.000 VND');
  assert.equal(conflict.amount, null); assert.ok(conflict.warnings.length);
  const overflow = parseImportText('Thanh toán thành công số tiền 9.223.372.036.854.775.808 VND');
  assert.equal(overflow.amount, null); assert.ok(overflow.warnings.length);
  const fractional = parseImportText('Thanh toán thành công số tiền 58.000,50 VND');
  assert.equal(fractional.amount, null); assert.ok(fractional.warnings.length);
  assert.throws(() => parseImportText('x'.repeat(4001)));
});
test('receive and process do not alter finances; only explicit confirm writes once', () => {
  const initial = fixture(); let s = process(receive(initial, 'e1'), 'e1');
  assert.equal(s.importedEvents[0].state, 'needs_review'); assert.equal(s.transactions.length, 0);
  assert.deepEqual(domain.balances(s), domain.balances(initial));
  const cmd = { type: 'import.confirm', mutationId: 'confirm-e1', payload: { id: 'e1', expectedVersion: 2, entry: entry('tx-e1') } } as any;
  s = domain.applyCommand(s, cmd, { now });
  assert.equal(s.importedEvents[0].state, 'imported'); assert.equal(s.importedEvents[0].transactionId, 'tx-e1');
  assert.equal(domain.balances(s).total, '942000'); assert.equal(domain.report(s, period).expense, '58000');
  assert.equal(s.activities.filter((a: any) => a.kind === 'budget_exceeded').length, 1);
  assert.deepEqual(domain.applyCommand(s, cmd, { now }), s);
  assert.throws(() => run(s, 'import.confirm', 'confirm-again', { ...cmd.payload, expectedVersion: 3, entry: entry('again') }));
});
test('pending, balance, ignored and stale import confirmations preserve ledger', () => {
  for (const text of ['Đơn hàng 58.000 VND đang chờ thanh toán', 'Số dư tài khoản 942.000 VND', 'Ưu đãi cuối tuần']) {
    const s = process(receive(fixture(), 'e1', text), 'e1'); const before = JSON.stringify(s);
    assert.throws(() => run(s, 'import.confirm', 'bad', { id: 'e1', expectedVersion: 2, entry: entry('bad') }));
    assert.equal(JSON.stringify(s), before);
  }
  const s = process(receive(fixture(), 'e1'), 'e1');
  assert.throws(() => run(s, 'import.confirm', 'stale', { id: 'e1', expectedVersion: 1, entry: entry('stale') }));
  const ignored = run(s, 'import.ignore', 'ignore', { id: 'e1', expectedVersion: 2 });
  assert.equal(ignored.importedEvents[0].ignored, true);
  assert.throws(() => run(ignored, 'import.confirm', 'ignored-confirm', { id: 'e1', expectedVersion: 3, entry: entry('ignored') }));
});
test('review can correct amount, refund writes income, internal transfer verifies two own wallets atomically', () => {
  let s = process(receive(fixture(), 'e1', 'Hoàn tiền thành công số tiền 50.000 VND'), 'e1');
  s = run(s, 'import.confirm', 'refund-confirm', { id: 'e1', expectedVersion: 2, entry: entry('refund-tx', { kind: 'income', categoryId: 'refund', amount: '49000' }) });
  assert.equal(domain.report(s, period).income, '49000');
  s = process(receive(s, 'e2', 'Chuyển nội bộ thành công số tiền 100.000 VND giữa các ví của tôi'), 'e2');
  const transfer = { type: 'transfer', payload: { id: 'tr1', fromWalletId: 'cash', toWalletId: 'bank', amount: '100000', occurredAt: at, note: 'Đã duyệt' } };
  assert.throws(() => run(s, 'import.confirm', 'bad-transfer', { id: 'e2', expectedVersion: 2, entry: { ...transfer, payload: { ...transfer.payload, toWalletId: 'someone-else' } } }));
  const confirmed = run(s, 'import.confirm', 'transfer-confirm', { id: 'e2', expectedVersion: 2, entry: transfer });
  assert.equal(confirmed.importedEvents[1].transferId, 'tr1'); assert.equal(domain.balances(confirmed).byWallet.bank, '100000');
  assert.equal(domain.report(confirmed, period).cashFlow, '49000');
});
test('strong references dedup across channels, source IDs are namespaced by provider/channel', () => {
  let s = process(receive(fixture(), 'e1'), 'e1');
  s = run(s, 'import.confirm', 'confirm-e1', { id: 'e1', expectedVersion: 2, entry: entry('tx1') });
  s = process(receive(s, 'e2', undefined, { source: 'email' }), 'e2');
  assert.equal(s.importedEvents[1].state, 'duplicate'); assert.equal(s.transactions.length, 1);
  s = process(receive(s, 'e3', undefined, { provider: 'Ngân hàng khác' }), 'e3');
  assert.equal(s.importedEvents[2].state, 'needs_review');
  const noRef = 'Thanh toán thành công số tiền 58.000 VND';
  let ids = process(receive(fixture(), 's1', noRef, { sourceId: 'MSG1' }), 's1');
  ids = process(receive(ids, 's2', noRef, { sourceId: 'MSG1' }), 's2');
  assert.equal(ids.importedEvents[1].state, 'duplicate');
  ids = process(receive(ids, 's3', noRef, { sourceId: 'MSG1', source: 'email' }), 's3');
  assert.equal(ids.importedEvents[2].state, 'needs_review');
});
test('equal amount/text without a strong identifier keeps two real transactions for review', () => {
  const text = 'Thanh toán thành công số tiền 58.000 VND';
  let s = process(receive(fixture(), 'e1', text), 'e1');
  s = run(s, 'import.confirm', 'confirm1', { id: 'e1', expectedVersion: 2, entry: entry('tx1') });
  s = process(receive(s, 'e2', text), 'e2');
  assert.equal(s.importedEvents[1].state, 'needs_review'); assert.ok(s.importedEvents[1].warnings.length);
  s = run(s, 'import.confirm', 'confirm2', { id: 'e2', expectedVersion: 2, entry: entry('tx2') });
  assert.equal(s.transactions.length, 2); assert.equal(domain.report(s, period).expense, '116000');
});
test('pending orders and refunds sharing a payment reference do not suppress real financial events', () => {
  let s = process(receive(fixture(), 'pending', 'Đơn hàng 58.000 VND chờ thanh toán. Mã giao dịch: REF001'), 'pending');
  s = process(receive(s, 'paid'), 'paid');
  assert.equal(s.importedEvents[1].state, 'needs_review');
  s = run(s, 'import.confirm', 'paid-confirm', { id: 'paid', expectedVersion: 2, entry: entry('paid-tx') });
  s = process(receive(s, 'refund', 'Hoàn tiền thành công số tiền 58.000 VND. Mã giao dịch: REF001'), 'refund');
  assert.equal(s.importedEvents[2].state, 'needs_review');
  s = run(s, 'import.confirm', 'refund-confirm', { id: 'refund', expectedVersion: 2, entry: entry('refund-tx', { kind: 'income', categoryId: 'refund' }) });
  assert.equal(s.transactions.length, 2); assert.equal(domain.report(s, period).cashFlow, '0');
});
test('ignoring an uncommitted duplicate owner releases the other event for explicit review', () => {
  let s = process(receive(fixture(), 'e1'), 'e1');
  s = process(receive(s, 'e2'), 'e2');
  assert.equal(s.importedEvents[1].state, 'duplicate');
  s = run(s, 'import.ignore', 'ignore-owner', { id: 'e1', expectedVersion: 2 });
  assert.equal(s.importedEvents[0].ignored, true); assert.equal(s.transactions.length, 0);
  const candidate = s.importedEvents[1];
  assert.equal(candidate.state, 'needs_review'); assert.equal(candidate.duplicateOf, null);
  s = run(s, 'import.confirm', 'confirm-released', { id: 'e2', expectedVersion: candidate.version, entry: entry('released-tx') });
  assert.equal(s.transactions.length, 1);
});
test('ignoring a duplicate owner rechecks distinct source and reference keys independently', () => {
  const text = (reference: string) => `Thanh toán thành công số tiền 58.000 VND. Mã giao dịch: ${reference}`;
  let s = process(receive(fixture(), 'e1', text('REF1'), { sourceId: 'M1' }), 'e1');
  s = process(receive(s, 'e2', text('REF2'), { sourceId: 'M1' }), 'e2');
  s = process(receive(s, 'e3', text('REF1'), { sourceId: 'M2' }), 'e3');
  assert.equal(s.importedEvents[1].duplicateOf, 'e1');
  assert.equal(s.importedEvents[2].duplicateOf, 'e1');
  s = run(s, 'import.ignore', 'ignore-mixed-owner', { id: 'e1', expectedVersion: 2 });
  assert.equal(s.importedEvents[0].ignored, true);
  s = process(receive(s, 'e4', text('REF2'), { sourceId: 'M3' }), 'e4');
  for (const id of ['e2', 'e3']) {
    const event = s.importedEvents.find((e: any) => e.id === id)!;
    assert.equal(event.state, 'needs_review'); assert.equal(event.duplicateOf, null);
    s = run(s, 'import.confirm', `confirm-${id}`, { id, expectedVersion: event.version, entry: entry(`tx-${id}`) });
  }
  const repeated = s.importedEvents.find((e: any) => e.id === 'e4')!;
  assert.equal(repeated.state, 'duplicate'); assert.equal(repeated.duplicateOf, 'e2');
  assert.equal(s.transactions.length, 2); assert.equal(domain.report(s, period).expense, '116000');
});
test('repeated malformed amount warnings remain reviewable without a partial receive failure', () => {
  const text = 'Thanh toán ' + '1,1 VND '.repeat(21);
  const parsed = parseImportText(text);
  assert.equal(parsed.amount, null); assert.ok(parsed.warnings.length > 0);
  assert.ok(parsed.warnings.length <= 20);
  const s = process(receive(fixture(), 'e1', text), 'e1');
  assert.equal(s.importedEvents[0].state, 'needs_review'); assert.equal(s.transactions.length, 0);
});
test('v2 backup preserves import audit/dedup, v1 normalizes without financial loss, invalid links rejected', () => {
  let s = process(receive(fixture(), 'e1'), 'e1');
  s = run(s, 'import.confirm', 'confirm1', { id: 'e1', expectedVersion: 2, entry: entry('tx1') });
  const json = domain.encodeBackup(s, now); assert.equal(JSON.parse(json).schemaVersion, 2);
  assert.deepEqual(domain.decodeBackup(json, { now }).ledger, s);
  const corrupt = JSON.parse(json); corrupt.ledger.importedEvents[0].transactionId = 'missing';
  assert.throws(() => domain.decodeBackup(JSON.stringify(corrupt), { now }));
  const legacyLedger: any = fixture(); delete legacyLedger.importedEvents; legacyLedger.schemaVersion = 1;
  const legacy = { schemaVersion: 1, exportedAt: now, ledger: legacyLedger };
  const restored: any = domain.decodeBackup(JSON.stringify(legacy), { now }).ledger;
  assert.equal(restored.schemaVersion, 2); assert.deepEqual(restored.importedEvents, []);
  assert.deepEqual(domain.balances(restored), domain.balances(fixture()));
  legacy.ledger.unknown = 'extra'; assert.throws(() => domain.decodeBackup(JSON.stringify(legacy), { now }));
});
test('deleting an imported transaction preserves audit/dedup and clears target link', () => {
  let s = process(receive(fixture(), 'e1'), 'e1');
  s = run(s, 'import.confirm', 'confirm1', { id: 'e1', expectedVersion: 2, entry: entry('tx1') });
  s = run(s, 'transaction.delete', 'delete', { id: 'tx1', expectedVersion: 1 });
  assert.equal(s.importedEvents[0].state, 'imported'); assert.equal(s.importedEvents[0].transactionId, null);
  s = process(receive(s, 'e2'), 'e2'); assert.equal(s.importedEvents[1].state, 'duplicate');
  assert.equal(domain.balances(s).total, '1000000');
});
