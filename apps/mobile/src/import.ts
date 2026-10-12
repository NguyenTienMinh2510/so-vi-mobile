export type ImportClassification = 'payment_success' | 'pending_order' | 'internal_transfer' | 'refund' | 'balance_update' | 'ignored';
export type ImportSuggestion = { classification: ImportClassification; amount: string | null; reference: string | null; warnings: string[]; kind: 'income' | 'expense' | null };
export const MAX_IMPORT_TEXT = 4000;

const fold = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
export function analyzeReceiptText(text: string): { suggestion: ImportSuggestion; candidates: { amount: string; evidence: string }[]; evidence: string | null } | null {
  if (typeof text !== 'string' || !text.trim() || text.length > MAX_IMPORT_TEXT) throw new Error('Dán nội dung từ 1 đến 4.000 ký tự.');
  const normalized = fold(text);
  if (/chua (?:thanh toan|thanh cong)|cho (?:thanh toan|xac nhan)|dang (?:cho|xu ly)|pending|that bai|khong thanh cong|hoan tien|refund|chuyen noi bo|giua (?:cac |hai )?(?:vi|tai khoan) cua toi|so du|\bbalance\b|ma\s+(?:giao dich|gd|tham chieu)|\breference\b|\btransaction\b|thanh toan thanh cong|ghi [nc]o|credited|debited/.test(normalized)) return null;
  const totalLabel = /^(?:tong thanh toan|tong cong|tong tien(?: thanh toan)?|phai tra|grand total|amount due|total due)\b\s*(?:\(?(?:vnd|dong|d|₫)\)?)?\s*[:=]?\s*/;
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const candidates: { amount: string; evidence: string }[] = [];
  const warnings = ['Hóa đơn chỉ là đề xuất, chưa chứng minh đã thanh toán. Xác nhận giao dịch thực tế trước khi ghi sổ.'];
  const components: Record<string, bigint[]> = { subtotal: [], tax: [], discount: [], fee: [] };
  let recognized = false; let unsafe = false;
  const amountOf = (value: string) => {
    const match = /^(\d+|\d{1,3}(?:\.\d{3})+|\d{1,3}(?:,\d{3})+|\d{1,3}(?: \d{3})+)\s*(?:vnd|vnđ|dong|d|₫)?$/i.exec(value.trim());
    if (!match) return null;
    const valueMoney = BigInt(match[1].replace(/[., ]/g, ''));
    return valueMoney > 0n && valueMoney <= 9223372036854775807n ? valueMoney.toString() : null;
  };
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]; const normalizedLine = fold(line); const total = totalLabel.exec(normalizedLine);
    if (total) {
      recognized = true;
      let raw = normalizedLine.slice(total[0].length).trim(); let evidence = line;
      if (!raw && index + 1 < lines.length && amountOf(fold(lines[index + 1]))) { raw = lines[++index]; evidence += '\n' + raw; }
      const amount = amountOf(fold(raw));
      if (amount) candidates.push({ amount, evidence });
      else { unsafe = true; warnings.push('Dòng tổng có tiền tệ, chữ số hoặc dấu phân cách chưa rõ; hãy nhập lại VND nguyên.'); }
    } else {
      const component = /^(tam tinh|subtotal|vat|thue|giam gia|discount|phu phi|phi dich vu|service charge)\b\s*[:=]?\s*(.*)$/.exec(normalizedLine);
      if (component) {
        const amount = amountOf(component[2]);
        if (amount) components[/^(tam tinh|subtotal)$/.test(component[1]) ? 'subtotal' : /^(vat|thue)$/.test(component[1]) ? 'tax' : /^(giam gia|discount)$/.test(component[1]) ? 'discount' : 'fee'].push(BigInt(amount));
      }
    }
  }
  if (!recognized) return null;
  const distinct = [...new Set(candidates.map(candidate => candidate.amount))];
  let amount = distinct.length === 1 && !unsafe ? distinct[0] : null;
  if (distinct.length > 1) warnings.push('Có nhiều tổng khác nhau; chọn dòng đúng hoặc sửa số tiền khi duyệt.');
  if (amount && components.subtotal.length === 1 && components.tax.length === 1 && components.discount.length === 1) {
    const expected = components.subtotal[0] + components.tax[0] + components.fee.reduce((sum, fee) => sum + fee, 0n) - components.discount[0];
    if (expected !== BigInt(amount)) { amount = null; warnings.push('Tạm tính, thuế/phụ phí và giảm giá không khớp tổng; hãy đối chiếu hóa đơn.'); }
  }
  if (!amount) warnings.push('Chưa chọn được tổng đáng tin cậy; chọn ứng viên hoặc nhập số tiền đã kiểm tra.');
  return { suggestion: { classification: 'payment_success', amount, reference: null, warnings: [...new Set(warnings)], kind: 'expense' }, candidates, evidence: amount ? candidates.find(candidate => candidate.amount === amount)!.evidence : null };
}

export function parseImportText(text: string): ImportSuggestion {
  if (typeof text !== 'string' || !text.trim() || text.length > MAX_IMPORT_TEXT) throw new Error('Dán nội dung từ 1 đến 4.000 ký tự.');
  const receipt = analyzeReceiptText(text); if (receipt) return receipt.suggestion;
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
  const warnings: string[] = [];
  const pending = /chua (?:thanh toan|thanh cong)|cho (?:thanh toan|xac nhan)|dang (?:cho|xu ly)|pending|that bai|khong thanh cong/.test(normalized);
  const refund = /hoan tien|refund/.test(normalized);
  const internal = /chuyen noi bo|giua (?:cac |hai )?vi cua toi|giua (?:cac |hai )?tai khoan cua toi/.test(normalized);
  const movement = /thanh toan|chuyen|giao dich|\bgd\b|ghi no|ghi co|nhan tien|credited|debited|payment/.test(normalized.replace(/(?:ma\s+(?:giao dich|gd)|reference|ref)\s*[:#=]?\s*[a-z0-9_-]+/g, ''));
  const balance = /so du|\bsd\b|balance/.test(normalized);
  const amounts: string[] = [];
  const signs: string[] = [];
  // shortcut: recognize labeled or currency VND amounts only; add a bank format after a real unsupported sample.
  const tokens = /([+-]?\s*\d[\d.,]*(?: \d{3})*)\s*(vnd|vnđ|dong|d\b|₫)/g;
  for (const match of normalized.matchAll(tokens)) {
    const before = normalized.slice(0, match.index);
    const preceding = before.slice(Math.max(before.lastIndexOf(';'), before.lastIndexOf('\n'), before.lastIndexOf('vnd')) + 1);
    if (/(?:so du|\bsd\b|balance)[^\d]*$/.test(preceding) || /(?:so du|\bsd\b|balance)(?:\s+(?:tai khoan|hien tai|kha dung))*\s*[:=]?\s*$/.test(before)) continue;
    const raw = match[1].replace(/\s+/g, '').replace(/^[+-]/, '');
    if (!/^(?:\d+|\d{1,3}(?:[.,]\d{3})+)$/.test(raw)) { warnings.push('Số tiền có phần lẻ hoặc dấu phân cách chưa rõ; hãy nhập lại VND nguyên.'); continue; }
    const value = BigInt(raw.replace(/[.,]/g, ''));
    if (value <= 0n || value > 9223372036854775807n) { warnings.push('Số tiền nằm ngoài giới hạn VND hợp lệ.'); continue; }
    amounts.push(value.toString());
    if (/^[+-]/.test(match[1].trim())) signs.push(match[1].trim()[0]);
  }
  const classification: ImportClassification = pending ? 'pending_order' : refund ? 'refund' : internal ? 'internal_transfer' : balance && !movement ? 'balance_update' : movement || signs.length ? 'payment_success' : /don hang|order/.test(normalized) ? 'pending_order' : balance ? 'balance_update' : 'ignored';
  const distinct = [...new Set(amounts)];
  let amount = distinct.length === 1 && !warnings.length ? distinct[0] : null;
  if (distinct.length > 1) warnings.push('Có nhiều số tiền khác nhau; hãy xác định số tiền giao dịch.');
  if (classification === 'balance_update' || classification === 'ignored') amount = null;
  if (!amount && !['balance_update', 'ignored'].includes(classification) && !warnings.length) warnings.push('Chưa xác định được số tiền giao dịch; hãy nhập khi duyệt.');
  if (classification === 'ignored') warnings.push('Nội dung chưa nhận diện được; giữ lại hoặc bỏ qua.');
  if (internal) warnings.push('Chỉ chọn chuyển ví nếu cả hai ví đều thuộc bạn.');
  const referenceMatch = /(?:ma\s+(?:giao dich|gd|tham chieu)|reference|ref|transaction\s*(?:id|no))\s*[:#=]?\s*([a-z0-9][a-z0-9_-]{0,199})\b/i.exec(normalized);
  const reference = referenceMatch ? referenceMatch[1].toUpperCase() : null;
  if (new Set(signs).size > 1) warnings.push('Có cả dấu cộng và trừ; hãy kiểm tra loại thu chi.');
  const income = refund || /ghi co|nhan tien|credited/.test(normalized) || (signs.length > 0 && signs.every(sign => sign === '+'));
  return { classification, amount, reference, warnings: [...new Set(warnings)], kind: ['pending_order', 'balance_update', 'ignored', 'internal_transfer'].includes(classification) ? null : income ? 'income' : 'expense' };
}
