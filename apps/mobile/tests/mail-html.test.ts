import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { messageToPlainText, looksLikeHtml, parseImportText, MAX_IMPORT_TEXT } from '../src/import.ts';

// Synthetic HTML in the shape of a bank card notification (not a real customer email).
const row = (label: string, value: string) => `<tr><td style="padding:4px;font-family:Arial">${label}</td><td><b>${value}</b></td></tr>`;
const email = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Thông báo</title><style>td{color:#333}${'.x{margin:0}'.repeat(900)}</style></head><body><!-- tracking --><div>TH&Ocirc;NG B&Aacute;O GIAO D&#7882;CH TH&#7866; TH&Agrave;NH C&Ocirc;NG</div><table>${row('Số thẻ/Card Number:', '5171xx0000')}${row('Giao dịch/Transaction type:', 'Thanh toán hàng hóa, dịch vụ/Retail')}${row('Số tiền giao dịch gốc/Original amount:', '58,000&nbsp;VND')}${row('Trạng thái giao dịch/Transaction status:', 'Thành công/ Successfully')}${row('Tại/At:', 'CUA HANG TEST &amp; CO')}</table><script>var a="<td>1.000.000 VND</td>"</script></body></html>`;

test('HTML-only bank email becomes short readable text and parses the transaction amount', () => {
  assert.ok(email.length > MAX_IMPORT_TEXT); assert.ok(looksLikeHtml(email));
  const plain = messageToPlainText(email);
  assert.ok(plain.length < 1000); assert.doesNotMatch(plain, /<|tracking|margin|1\.000\.000/);
  assert.match(plain, /Original amount:\n58,000 VND/); assert.match(plain, /CUA HANG TEST & CO/); assert.match(plain, /GIAO DỊCH THẺ/);
  assert.deepEqual(parseImportText(plain), { classification: 'payment_success', amount: '58000', reference: null, warnings: [], kind: 'expense' });
});
test('plain text passes through unchanged, raw size is bounded and subject-only input explains the miss', () => {
  const sms = 'BIDV: TK 123 -58.000VND luc 10:41. SD: 1.000.000VND'; assert.equal(messageToPlainText(sms), sms); assert.equal(looksLikeHtml('a < b > c'), false);
  assert.throws(() => messageToPlainText('<div>' + 'a'.repeat(200001) + '</div>'), /quá dài/);
  const subject = parseImportText('BIDV - THÔNG BÁO GIAO DỊCH THẺ THÀNH CÔNG');
  assert.equal(subject.amount, null); assert.ok(subject.warnings.some(w => /tiêu đề email/.test(w)));
  assert.ok(!parseImportText('Thanh toán thành công 58.000 VND').warnings.some(w => /tiêu đề/.test(w)));
});
test('Shortcuts intent converts email HTML natively before the 4.000-character queue limit', () => {
  const swift = readFileSync(new URL('../plugins/SoViImportIntent.swift', import.meta.url), 'utf8');
  assert.match(swift, /enqueue\(text: try SoViMessageText\.plain\(text\)/); assert.match(swift, /maximumRaw = 200_000/);
  for (const tag of ['script|style|head|title', '<br', '&nbsp;', '&#(x']) assert.ok(swift.includes(tag), tag);
});
test('pasting HTML into the import screen keeps readable text', () => {
  const screen = readFileSync(new URL('../src/import-screen.tsx', import.meta.url), 'utf8');
  assert.equal((screen.match(/draft\.set\('text', pastedText\(text\)\)/g) ?? []).length, 2);
});
