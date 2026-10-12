import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as parser from '../src/import.ts';
import * as domain from '../src/domain.ts';

const bill = 'HÓA ĐƠN\nTạm tính: 150.000\nVAT: 12.000\nGiảm giá: 10.000\nTổng thanh toán: 152.000\nKhách đưa: 200.000\nTiền thừa: 48.000';
const now = '2026-10-12T00:00:00.000Z';
type Analysis = { suggestion: parser.ImportSuggestion; candidates: { amount: string; evidence: string }[]; evidence: string | null };
function analyze(text: string): Analysis | null {
  const method = (parser as any).analyzeReceiptText;
  assert.equal(typeof method, 'function', 'receipt analysis must be exported by the actual parser');
  return method(text);
}
const apply = (ledger: domain.Ledger, type: string, mutationId: string, payload: any) => domain.applyCommand(ledger, { type, mutationId, payload } as any, { now });
function fixture() {
  let ledger = domain.emptyLedger();
  ledger = apply(ledger, 'wallet.create', 'wallet-create', { id: 'cash', name: 'Tiền mặt', icon: 'wallet', openingBalance: '1000000', openingAt: now, archived: false });
  ledger = apply(ledger, 'category.create', 'category-create', { id: 'food', name: 'Ăn uống', kind: 'expense', icon: 'restaurant', archived: false });
  return ledger;
}
const receive = (ledger: domain.Ledger, id = 'receipt', text = bill, extra: any = {}) => apply(ledger, 'import.receive', `receive-${id}`, { id, source: 'text', provider: 'Apple Vision', sourceId: null, text, receivedAt: now, ...extra });
const reparse = (ledger: domain.Ledger, id = 'receipt', text = bill, warnings: string[] = [], mutationId = `reparse-${id}`) => apply(ledger, 'import.reparse', mutationId, { id, expectedVersion: ledger.importedEvents.find(event => event.id === id)!.version, text, warnings });
const entry = (id: string, amount = '152000') => ({ type: 'transaction', payload: { id, kind: 'expense', walletId: 'cash', categoryId: 'food', amount, occurredAt: now, note: 'Hóa đơn tổng hợp đã duyệt', tagIds: [] } });

test('receipt total selects 152000 with original evidence and never cash or change', () => {
  const result = analyze(bill); assert.ok(result);
  assert.equal(result.suggestion.amount, '152000'); assert.equal(result.evidence, 'Tổng thanh toán: 152.000');
  assert.ok(result.candidates.some(candidate => candidate.amount === '152000' && candidate.evidence === result.evidence));
  assert.ok(!result.candidates.some(candidate => ['200000', '48000', '12000', '10000'].includes(candidate.amount)));
  assert.ok(result.suggestion.warnings.some(warning => /hóa đơn|hoa don/i.test(warning)), 'a bill is only a proposal, not proof of payment');
  assert.deepEqual(parser.parseImportText(bill), result.suggestion);
  assert.deepEqual(Object.keys(result.suggestion).sort(), ['amount', 'classification', 'kind', 'reference', 'warnings']);
});

test('item totals, quantities, dates, phone and percentages cannot replace the receipt total', () => {
  const text = 'HÓA ĐƠN 123456\nNgày 12/10/2026\nHotline 0901234567\nSL Đơn giá Thành tiền\nCà phê 2 30.000 60.000\nBánh 1 40.000 40.000\nVAT 8%\nTổng cộng: 108.000';
  const result = analyze(text); assert.ok(result); assert.equal(result.suggestion.amount, '108000');
  assert.equal(result.evidence, 'Tổng cộng: 108.000');
  assert.equal(analyze('Cà phê Thành tiền: 60.000\nBánh Thành tiền: 40.000'), null);
});

test('an adjacent amount belonging to a split total label survives durable OCR row text', () => {
  const text = 'HÓA ĐƠN\nTổng thanh toán\n152.000 VND\nKhách đưa\n200.000 VND\nTiền thừa\n48.000 VND';
  const result = analyze(text); assert.ok(result); assert.equal(result.suggestion.amount, '152000');
  assert.ok(result.evidence?.includes('Tổng thanh toán') && result.evidence.includes('152.000'));
  assert.ok(!result.candidates.some(candidate => ['200000', '48000'].includes(candidate.amount)));
});

test('conflicting totals and fully evidenced arithmetic mismatch require human selection', () => {
  const conflict = analyze('HÓA ĐƠN\nTổng cộng: 152.000\nTổng thanh toán: 162.000'); assert.ok(conflict);
  assert.equal(conflict.suggestion.amount, null); assert.equal(conflict.evidence, null);
  assert.deepEqual(conflict.candidates.map(candidate => candidate.amount).sort(), ['152000', '162000']);
  assert.ok(conflict.suggestion.warnings.length > 0);
  const mismatch = analyze(bill.replace('152.000', '153.000')); assert.ok(mismatch);
  assert.equal(mismatch.suggestion.amount, null); assert.ok(mismatch.suggestion.warnings.length > 0);
  assert.ok(mismatch.candidates.some(candidate => candidate.amount === '153000'));
  const incomplete = analyze('HÓA ĐƠN\nTạm tính: 150.000\nTổng thanh toán: 152.000'); assert.ok(incomplete);
  assert.equal(incomplete.suggestion.amount, '152000', 'missing tax/discount must not be invented as zero');
});

test('receipt money validates VND separators, currency, digits and 64-bit precision', () => {
  const exact = analyze('HÓA ĐƠN\nTổng thanh toán: 9.007.199.254.740.993 VND'); assert.ok(exact);
  assert.equal(exact.suggestion.amount, '9007199254740993');
  for (const amount of ['152.000,50 VND', '152,00 VND', '1.000,000 VND', 'I52.000 VND', '152.OOO VND', '152.000 USD', '9.223.372.036.854.775.808 VND', '0 VND', '-152.000 VND']) {
    const result = analyze(`HÓA ĐƠN\nTổng thanh toán: ${amount}`); assert.ok(result, amount);
    assert.equal(result.suggestion.amount, null, amount); assert.ok(result.suggestion.warnings.length > 0, amount);
  }
});

test('receipt recognition preserves bank status, reference, balance and direction precedence', () => {
  const cases = [
    ['Thanh toán thành công 58.000 VND. Số dư 942.000 VND. Mã giao dịch: TEST001', 'payment_success', '58000', 'expense', 'TEST001'],
    ['Đơn hàng chờ thanh toán\nTổng thanh toán: 152.000 VND', 'pending_order', null, null, null],
    ['Thanh toán thất bại\nTổng thanh toán: 152.000 VND', 'pending_order', null, null, null],
    ['Hoàn tiền thành công 58.000 VND. Số dư 942.000 VND', 'refund', '58000', 'income', null],
    ['Chuyển nội bộ thành công 58.000 VND giữa các ví của tôi', 'internal_transfer', '58000', null, null],
    ['Số dư tài khoản: +942.000 VND', 'balance_update', null, null, null]
  ];
  for (const [text, classification, amount, kind, reference] of cases) {
    const result = parser.parseImportText(text!);
    assert.equal(result.classification, classification); assert.equal(result.kind, kind); assert.equal(result.reference, reference);
    if (classification !== 'pending_order') assert.equal(result.amount, amount);
    assert.deepEqual(Object.keys(result).sort(), ['amount', 'classification', 'kind', 'reference', 'warnings']);
  }
  assert.equal(analyze(cases[0][0]!), null, 'a bank payment alone is not a receipt');
});

test('reparse preserves one source, OCR warnings, backup schema and finances until explicit confirmation', () => {
  const initial = fixture(); const received = receive(initial);
  const command = { type: 'import.reparse', mutationId: 'reparse-once', payload: { id: 'receipt', expectedVersion: 1, text: bill, warnings: ['Nhận diện ảnh: Kiểm tra tiếng Việt'] } } as any;
  const reviewed = domain.applyCommand(received, command, { now });
  assert.equal(reviewed.importedEvents.length, 1); assert.equal(reviewed.importedEvents[0].id, 'receipt');
  assert.equal(reviewed.importedEvents[0].state, 'needs_review'); assert.equal(reviewed.importedEvents[0].amount, '152000');
  assert.ok(reviewed.importedEvents[0].warnings.some(warning => warning.includes('Kiểm tra tiếng Việt')));
  assert.deepEqual(domain.balances(reviewed), domain.balances(initial)); assert.equal(reviewed.transactions.length, 0);
  assert.deepEqual(domain.applyCommand(reviewed, command, { now }), reviewed, 'the same reparse mutation is idempotent');
  const edited = reparse(reviewed, 'receipt', 'HÓA ĐƠN\nTổng cộng: 162.000', reviewed.importedEvents[0].warnings.filter(warning => warning.startsWith('Nhận diện ảnh: ')), 'edit-original');
  assert.equal(edited.importedEvents[0].text, 'HÓA ĐƠN\nTổng cộng: 162.000'); assert.equal(edited.importedEvents[0].amount, '162000');
  assert.equal(edited.importedEvents[0].receivedAt, now); assert.equal(edited.transactions.length, 0);
  const backup = domain.encodeBackup(edited, now); assert.equal(JSON.parse(backup).schemaVersion, 2);
  assert.deepEqual(domain.decodeBackup(backup, { now }).ledger, edited);
  const confirmed = apply(edited, 'import.confirm', 'confirm-receipt', { id: 'receipt', expectedVersion: edited.importedEvents[0].version, entry: entry('receipt-tx', '162000') });
  assert.equal(confirmed.transactions.length, 1); assert.equal(domain.balances(confirmed).total, '838000');
  assert.throws(() => reparse(confirmed, 'receipt', bill, [], 'terminal-reparse'));
});

test('reparse rejects stale or invalid inputs atomically and respects duplicate source ownership', () => {
  const received = receive(fixture());
  for (const payload of [
    { id: 'receipt', expectedVersion: 0, text: bill, warnings: [] },
    { id: 'receipt', expectedVersion: 1, text: bill },
    { id: 'receipt', expectedVersion: 1, text: '', warnings: [] },
    { id: 'receipt', expectedVersion: 1, text: 'x'.repeat(4001), warnings: [] },
    { id: 'receipt', expectedVersion: 1, text: bill, warnings: Array(21).fill('warning') },
    { id: 'receipt', expectedVersion: 1, text: bill, warnings: ['x'.repeat(501)] },
    { id: 'receipt', expectedVersion: 1, text: bill, warnings: [42] }
  ]) {
    const before = JSON.stringify(received); assert.throws(() => apply(received, 'import.reparse', 'invalid-reparse', payload));
    assert.equal(JSON.stringify(received), before);
  }
  const owner = reparse(receive(fixture(), 'owner', bill, { sourceId: 'BILL001' }), 'owner');
  const duplicate = reparse(receive(owner, 'second', bill, { sourceId: 'BILL001' }), 'second');
  assert.equal(duplicate.importedEvents[1].state, 'duplicate'); assert.equal(duplicate.importedEvents[1].duplicateOf, 'owner');
  assert.throws(() => reparse(duplicate, 'second', bill, [], 'duplicate-reparse')); assert.equal(duplicate.transactions.length, 0);
  const ignored = apply(owner, 'import.ignore', 'ignore-owner', { id: 'owner', expectedVersion: owner.importedEvents[0].version });
  assert.throws(() => reparse(ignored, 'owner', bill, [], 'ignored-reparse'));
});

test('merged OCR, parser and similar-source warnings remain bounded and valid in backup', () => {
  const nativeWarnings = Array.from({ length: 20 }, (_, index) => `Nhận diện ảnh: Kiểm tra dòng ${index + 1}`);
  let ledger = reparse(receive(fixture(), 'first'), 'first');
  ledger = reparse(receive(ledger, 'second'), 'second', bill, nativeWarnings);
  const event = ledger.importedEvents[1];
  assert.equal(event.state, 'needs_review'); assert.equal(event.amount, '152000'); assert.equal(event.warnings.length <= 20, true);
  assert.ok(event.warnings.some(warning => warning.includes('Nhận diện ảnh:')));
  assert.ok(event.warnings.some(warning => /hóa đơn|hoa don/i.test(warning)));
  assert.equal(ledger.transactions.length, 0);
  assert.deepEqual(domain.decodeBackup(domain.encodeBackup(ledger, now), { now }).ledger, ledger);
});
