export type ImportClassification = 'payment_success' | 'pending_order' | 'internal_transfer' | 'refund' | 'balance_update' | 'ignored';
export type ImportSuggestion = { classification: ImportClassification; amount: string | null; reference: string | null; warnings: string[]; kind: 'income' | 'expense' | null };
export const MAX_IMPORT_TEXT = 4000;

export function parseImportText(text: string): ImportSuggestion {
  if (typeof text !== 'string' || !text.trim() || text.length > MAX_IMPORT_TEXT) throw new Error('Dán nội dung từ 1 đến 4.000 ký tự.');
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
  const classification: ImportClassification = pending ? 'pending_order' : refund ? 'refund' : internal ? 'internal_transfer' : movement || signs.length ? 'payment_success' : /don hang|order/.test(normalized) ? 'pending_order' : balance ? 'balance_update' : 'ignored';
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
