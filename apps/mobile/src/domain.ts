import { parseImportText, MAX_IMPORT_TEXT, type ImportClassification, type ImportSuggestion } from './import.ts';
export const MAX_MONEY = 9223372036854775807n;
export const MIN_MONEY = -9223372036854775808n;
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
export type Kind = 'income' | 'expense';
type Versioned = { id: string; version: number };
export type Wallet = Versioned & { name: string; icon: string; openingBalance: string; openingAt: string; archived: boolean };
export type Category = Versioned & { name: string; icon: string; kind: Kind; archived: boolean };
export type Tag = Versioned & { name: string; archived: boolean };
export type Transaction = Versioned & { walletId: string; categoryId: string; kind: Kind; amount: string; occurredAt: string; note: string; tagIds: string[] };
export type Transfer = Versioned & { fromWalletId: string; toWalletId: string; amount: string; occurredAt: string; note: string };
export type Adjustment = Versioned & { walletId: string; amount: string; occurredAt: string; note: string };
export type Budget = Versioned & { name: string; limit: string; start: string; endExclusive: string; walletIds: string[]; categoryIds: string[] };
export type Activity = { id: string; kind: 'mutation' | 'adjustment' | 'budget_exceeded'; entityId: string; message: string; createdAt: string; read: boolean };
export type ImportedEvent = Versioned & Omit<ImportSuggestion, 'classification'> & { source: 'sms' | 'email' | 'text'; provider: string; sourceId: string | null; text: string; receivedAt: string; state: 'received' | 'processing' | 'needs_review' | 'imported' | 'duplicate' | 'failed'; classification: ImportClassification | null; transactionId: string | null; transferId: string | null; duplicateOf: string | null; error: string | null; ignored: boolean };
export type Ledger = { schemaVersion: 2; wallets: Wallet[]; categories: Category[]; tags: Tag[]; transactions: Transaction[]; transfers: Transfer[]; adjustments: Adjustment[]; budgets: Budget[]; activities: Activity[]; settings: { timezone: string; onboarded: boolean }; receipts: { id: string; signature: string }[]; importedEvents: ImportedEvent[] };
export type Backup = { schemaVersion: 2; exportedAt: string; ledger: Ledger };
type Create<T extends Versioned> = Omit<T, 'version'>;
type Update<T extends Versioned> = Create<T> & { expectedVersion: number };
type Revision = { id: string; expectedVersion: number };
type Archive = Revision & { archived: boolean };
type Mutation<T extends string, P> = { type: T; mutationId: string; payload: P };
export type ImportEntry = { type: 'transaction'; payload: Create<Transaction> } | { type: 'transfer'; payload: Create<Transfer> };
export type Command = Mutation<'wallet.create', Create<Wallet>> | Mutation<'wallet.update', Omit<Update<Wallet>, 'openingBalance' | 'openingAt' | 'archived'>> | Mutation<'wallet.archive', Archive>
  | Mutation<'category.create', Create<Category>> | Mutation<'category.update', Omit<Update<Category>, 'archived'>> | Mutation<'category.archive', Archive>
  | Mutation<'tag.create', Create<Tag>> | Mutation<'tag.update', Revision & { name: string }> | Mutation<'tag.archive', Archive>
  | Mutation<'transaction.create', Create<Transaction>> | Mutation<'transaction.update', Update<Transaction>> | Mutation<'transaction.delete', Revision>
  | Mutation<'transfer.create', Create<Transfer>> | Mutation<'transfer.update', Update<Transfer>> | Mutation<'transfer.delete', Revision>
  | Mutation<'adjustment.create', Create<Adjustment>> | Mutation<'budget.create', Create<Budget>> | Mutation<'budget.update', Update<Budget>> | Mutation<'budget.delete', Revision>
  | Mutation<'activity.read', { id: string }> | Mutation<'settings.update', Ledger['settings']> | Mutation<'data.clear', { confirmation: 'XÓA' }>
  | Mutation<'import.receive', Pick<ImportedEvent, 'id' | 'source' | 'provider' | 'sourceId' | 'text' | 'receivedAt'>> | Mutation<'import.process', Revision> | Mutation<'import.ignore', Revision> | Mutation<'import.confirm', Revision & { entry: ImportEntry }>;
export class DomainError extends Error {
  code: string; field?: string;
  constructor(code: string, message: string, field?: string) { super(message); this.name = 'DomainError'; this.code = code; this.field = field; }
}
function fail(code: string, message: string, field?: string): never { throw new DomainError(code, message, field); }
function checked(n: bigint): bigint { if (n < MIN_MONEY || n > MAX_MONEY) fail('OVERFLOW', 'Số tiền hoặc tổng vượt giới hạn 64-bit.'); return n; }
export function money(value: string, options: { positive?: boolean } = {}): bigint {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*|-[1-9]\d*)$/.test(value) || value.length > 20) fail('INVALID_MONEY', 'Nhập số tiền VND nguyên hợp lệ.', 'amount');
  const n = checked(BigInt(value)); if (options.positive && n <= 0n) fail('INVALID_MONEY', 'Số tiền phải lớn hơn 0.', 'amount'); return n;
}
export function parseMoneyInput(value: string): string {
  const trimmed = value.trim();
  if (!/^-?(?:\d+|\d{1,3}(?:[., ]\d{3})+)$/.test(trimmed)) fail('INVALID_MONEY', 'Dùng số nguyên, ví dụ 58.000.', 'amount');
  const raw = trimmed.replace(/[., ]/g, ''); const normalized = BigInt(raw).toString(); money(normalized); return normalized;
}
export function formatMoney(value: string | bigint): string { const n = typeof value === 'bigint' ? checked(value) : money(value); return `${n < 0n ? '-' : ''}${(n < 0n ? -n : n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')} đ`; }
export function timestamp(value: unknown, field = 'occurredAt'): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail('INVALID_DATE', 'Thời điểm UTC không hợp lệ.', field);
  return value;
}
function notFuture(value: string, now: string, field = 'occurredAt') { timestamp(value, field); if (value > now) fail('FUTURE_DATE', 'Không được ghi giao dịch trong tương lai.', field); }
export function validTimezone(value: unknown): string {
  if (typeof value !== 'string' || value.length > 100) fail('INVALID_TIMEZONE', 'Múi giờ không hợp lệ.', 'timezone');
  try { new Intl.DateTimeFormat('en', { timeZone: value }).format(); } catch { fail('INVALID_TIMEZONE', 'Múi giờ không hợp lệ.', 'timezone'); } return value;
}
export function localDateKey(utc: string, timezone: string): string {
  timestamp(utc); validTimezone(timezone);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(utc));
  return ['year', 'month', 'day'].map(type => parts.find(p => p.type === type)!.value).join('-');
}
function validDay(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('INVALID_DATE', 'Ngày phải theo dạng YYYY-MM-DD.');
  const iso = `${value}T00:00:00.000Z`; timestamp(iso); return iso;
}
export function dateRange(startDay: string, endDay: string, timezone: string): { start: string; endExclusive: string } {
  const start = validDay(startDay); const end = validDay(endDay); validTimezone(timezone);
  if (startDay > endDay) fail('INVALID_DATE', 'Ngày kết thúc phải từ ngày bắt đầu.');
  const next = new Date(Date.parse(end) + 86400000).toISOString().substring(0, 10);
  const boundary = (day: string, mustExist = true) => {
    let low = Date.parse(`${day}T00:00:00.000Z`) - 2 * 86400000; let high = low + 4 * 86400000;
    while (low < high) { const mid = Math.floor((low + high) / 2); if (localDateKey(new Date(mid).toISOString(), timezone) < day) low = mid + 1; else high = mid; }
    if (mustExist && localDateKey(new Date(low).toISOString(), timezone) !== day) fail('INVALID_DATE', 'Ngày này không tồn tại trong múi giờ đã chọn.');
    return new Date(low).toISOString();
  };
  boundary(endDay); return { start: boundary(startDay), endExclusive: boundary(next, false) };
}
export function emptyLedger(): Ledger {
  return { schemaVersion: 2, wallets: [], categories: [
    ['expense-food', 'Ăn uống', 'restaurant', 'expense'], ['expense-transport', 'Di chuyển', 'car', 'expense'], ['expense-home', 'Nhà cửa', 'home', 'expense'], ['expense-other', 'Chi khác', 'ellipsis-horizontal', 'expense'], ['income-salary', 'Lương', 'briefcase', 'income'], ['income-other', 'Thu khác', 'add-circle', 'income']
  ].map(([id, name, icon, kind]) => ({ id, name, icon, kind: kind as Kind, archived: false, version: 1 })), tags: [], transactions: [], transfers: [], adjustments: [], budgets: [], activities: [], settings: { timezone: 'Asia/Ho_Chi_Minh', onboarded: false }, receipts: [], importedEvents: [] };
}
function id(value: unknown, field = 'id'): asserts value is string { if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(value) || ['__proto__', 'prototype', 'constructor'].includes(value)) fail('INVALID_INPUT', 'Mã bản ghi không hợp lệ.', field); }
function text(value: unknown, field: string, max = 100, required = true): asserts value is string { if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail('INVALID_INPUT', `Trường ${field} không hợp lệ.`, field); }
function bool(value: unknown) { if (typeof value !== 'boolean') fail('INVALID_INPUT', 'Giá trị trạng thái không hợp lệ.'); }
function revision(value: unknown) { if (!Number.isSafeInteger(value) || (value as number) < 1) fail('INVALID_INPUT', 'Phiên bản không hợp lệ.'); }
function find<T extends { id: string }>(rows: T[], key: string, field = 'id'): T { const row = rows.find(x => x.id === key); if (!row) fail('NOT_FOUND', 'Bản ghi không còn tồn tại. Tải lại để tiếp tục.', field); return row; }
function active<T extends { id: string; archived: boolean }>(rows: T[], key: string, field: string): T { const row = find(rows, key, field); if (row.archived) fail('ARCHIVED', 'Không thể ghi mới vào mục đã lưu trữ.', field); return row; }
function ids(value: unknown, field: string): asserts value is string[] { if (!Array.isArray(value) || value.length > 1000 || new Set(value).size !== value.length) fail('INVALID_RELATION', 'Danh sách quan hệ không hợp lệ.', field); for (const v of value) id(v, field); }
function fields(row: unknown, expected: string[]) {
  if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).sort().join('|') !== [...expected].sort().join('|')) fail('INVALID_BACKUP', 'Bản ghi thiếu trường hoặc có trường không được hỗ trợ.');
}
function identity(rows: Versioned[]) { const seen = new Set<string>(); for (const row of rows) { id(row.id); revision(row.version); if (seen.has(row.id)) fail('INVALID_RELATION', 'Mã bản ghi trùng.'); seen.add(row.id); } }
export function validateLedger(s: Ledger, now: string): Ledger {
  timestamp(now, 'now'); fields(s, ['schemaVersion', 'wallets', 'categories', 'tags', 'transactions', 'transfers', 'adjustments', 'budgets', 'activities', 'settings', 'receipts', 'importedEvents']);
  if (s.schemaVersion !== 2) fail('INVALID_BACKUP', 'Phiên bản dữ liệu chưa được hỗ trợ.');
  const tables = [s.wallets, s.categories, s.tags, s.transactions, s.transfers, s.adjustments, s.budgets];
  for (const rows of [...tables, s.activities, s.receipts, s.importedEvents]) if (!Array.isArray(rows) || rows.length > 100000) fail('INVALID_BACKUP', 'Danh sách bản ghi không hợp lệ hoặc quá lớn.');
  for (const rows of tables) identity(rows);
  fields(s.settings, ['timezone', 'onboarded']); validTimezone(s.settings.timezone); bool(s.settings.onboarded);
  for (const w of s.wallets) { fields(w, ['id', 'version', 'name', 'icon', 'openingBalance', 'openingAt', 'archived']); text(w.name, 'name'); text(w.icon, 'icon'); bool(w.archived); money(w.openingBalance); notFuture(w.openingAt, now, 'openingAt'); }
  for (const c of s.categories) { fields(c, ['id', 'version', 'name', 'icon', 'kind', 'archived']); text(c.name, 'name'); text(c.icon, 'icon'); bool(c.archived); if (!['income', 'expense'].includes(c.kind)) fail('INVALID_INPUT', 'Loại danh mục không hợp lệ.', 'kind'); }
  for (const t of s.tags) { fields(t, ['id', 'version', 'name', 'archived']); text(t.name, 'name'); bool(t.archived); }
  for (const t of s.transactions) {
    fields(t, ['id', 'version', 'walletId', 'categoryId', 'kind', 'amount', 'occurredAt', 'note', 'tagIds']);
    const w = find(s.wallets, t.walletId, 'walletId'); const c = find(s.categories, t.categoryId, 'categoryId');
    if (c.kind !== t.kind) fail('INVALID_RELATION', 'Danh mục không khớp loại giao dịch.', 'categoryId');
    money(t.amount, { positive: true }); notFuture(t.occurredAt, now); if (t.occurredAt < w.openingAt) fail('INVALID_DATE', 'Giao dịch phải từ thời điểm mở ví.', 'occurredAt'); text(t.note, 'note', 4000, false); ids(t.tagIds, 'tagIds'); for (const key of t.tagIds) find(s.tags, key, 'tagIds');
  }
  for (const t of s.transfers) {
    fields(t, ['id', 'version', 'fromWalletId', 'toWalletId', 'amount', 'occurredAt', 'note']);
    const a = find(s.wallets, t.fromWalletId, 'fromWalletId'); const b = find(s.wallets, t.toWalletId, 'toWalletId');
    if (a.id === b.id) fail('INVALID_RELATION', 'Chọn hai ví khác nhau.', 'toWalletId'); money(t.amount, { positive: true }); notFuture(t.occurredAt, now); if (t.occurredAt < a.openingAt || t.occurredAt < b.openingAt) fail('INVALID_DATE', 'Chuyển ví phải từ thời điểm mở cả hai ví.', 'occurredAt'); text(t.note, 'note', 4000, false);
  }
  for (const a of s.adjustments) { fields(a, ['id', 'version', 'walletId', 'amount', 'occurredAt', 'note']); const w = find(s.wallets, a.walletId, 'walletId'); money(a.amount); notFuture(a.occurredAt, now); if (a.occurredAt < w.openingAt) fail('INVALID_DATE', 'Điều chỉnh phải từ thời điểm mở ví.'); text(a.note, 'note', 4000, false); }
  for (const b of s.budgets) {
    fields(b, ['id', 'version', 'name', 'limit', 'start', 'endExclusive', 'walletIds', 'categoryIds']); text(b.name, 'name'); money(b.limit, { positive: true }); timestamp(b.start, 'start'); timestamp(b.endExclusive, 'endExclusive'); if (b.start >= b.endExclusive) fail('INVALID_DATE', 'Kỳ ngân sách không hợp lệ.', 'endExclusive');
    ids(b.walletIds, 'walletIds'); ids(b.categoryIds, 'categoryIds'); for (const key of b.walletIds) find(s.wallets, key, 'walletIds'); for (const key of b.categoryIds) if (find(s.categories, key, 'categoryIds').kind !== 'expense') fail('INVALID_RELATION', 'Ngân sách chỉ dùng danh mục chi.', 'categoryIds');
    budgetStatus(s, b.id);
  }
  const activityIds = new Set<string>();
  for (const a of s.activities) { fields(a, ['id', 'kind', 'entityId', 'message', 'createdAt', 'read']); id(a.id); id(a.entityId); if (activityIds.has(a.id)) fail('INVALID_RELATION', 'Hoạt động trùng.'); activityIds.add(a.id); if (!['mutation', 'adjustment', 'budget_exceeded'].includes(a.kind)) fail('INVALID_BACKUP', 'Loại hoạt động không hợp lệ.'); text(a.message, 'message', 4000); notFuture(a.createdAt, now, 'createdAt'); bool(a.read); }
  const receiptIds = new Set<string>(); for (const r of s.receipts) { fields(r, ['id', 'signature']); id(r.id); text(r.signature, 'signature', 20000); if (receiptIds.has(r.id)) fail('INVALID_RELATION', 'Biên nhận trùng.'); receiptIds.add(r.id); }
  validateImportedEvents(s, now);
  validateHistory(s); checked(s.transactions.filter(t => t.kind === 'income').reduce((n, t) => n + money(t.amount), 0n)); checked(s.transactions.filter(t => t.kind === 'expense').reduce((n, t) => n + money(t.amount), 0n));
  return s;
}
function importFamily(event: Pick<ImportedEvent, 'classification'>) { return event.classification === 'refund' ? 'refund' : ['payment_success', 'internal_transfer'].includes(event.classification ?? '') ? 'payment' : null; }
function strongImportDuplicate(s: Ledger, event: ImportedEvent) {
  const family = importFamily(event);
  return family && s.importedEvents.find(other => other.id !== event.id && !other.ignored && other.state !== 'duplicate' && other.state !== 'failed' && importFamily(other) === family && other.provider.toLocaleLowerCase('vi') === event.provider.toLocaleLowerCase('vi') && ((event.sourceId !== null && other.source === event.source && other.sourceId === event.sourceId) || (event.reference !== null && other.reference === event.reference)));
}
function validateImportedEvents(s: Ledger, now: string) {
  identity(s.importedEvents);
  const targets = new Set<string>();
  for (const e of s.importedEvents) {
    fields(e, ['id', 'version', 'source', 'provider', 'sourceId', 'text', 'receivedAt', 'state', 'classification', 'amount', 'reference', 'warnings', 'kind', 'transactionId', 'transferId', 'duplicateOf', 'error', 'ignored']);
    if (!['sms', 'email', 'text'].includes(e.source) || !['received', 'processing', 'needs_review', 'imported', 'duplicate', 'failed'].includes(e.state)) fail('INVALID_BACKUP', 'Nguồn hoặc trạng thái Inbox không hợp lệ.');
    text(e.provider, 'provider', 200); text(e.text, 'text', MAX_IMPORT_TEXT); notFuture(e.receivedAt, now, 'receivedAt'); bool(e.ignored);
    for (const key of ['sourceId', 'reference', 'error'] as const) if (e[key] !== null) text(e[key], key, key === 'error' ? 500 : 200);
    if (e.classification !== null && !['payment_success', 'pending_order', 'internal_transfer', 'refund', 'balance_update', 'ignored'].includes(e.classification)) fail('INVALID_BACKUP', 'Phân loại Inbox không hợp lệ.');
    if (e.amount !== null) money(e.amount, { positive: true });
    if (e.kind !== null && !['income', 'expense'].includes(e.kind)) fail('INVALID_BACKUP', 'Loại thu chi Inbox không hợp lệ.');
    if (!Array.isArray(e.warnings) || e.warnings.length > 20) fail('INVALID_BACKUP', 'Cảnh báo Inbox không hợp lệ.');
    for (const warning of e.warnings) text(warning, 'warnings', 500);
    if (e.transactionId !== null && e.transferId !== null) fail('INVALID_RELATION', 'Inbox chỉ liên kết một lần ghi sổ.');
    for (const key of ['transactionId', 'transferId'] as const) if (e[key] !== null) {
      const target = find((key === 'transactionId' ? s.transactions : s.transfers) as Versioned[], e[key]);
      const targetKey = `${key}:${target.id}`; if (targets.has(targetKey)) fail('INVALID_RELATION', 'Hai sự kiện Inbox cùng liên kết một lần ghi sổ.'); targets.add(targetKey);
      if (e.state !== 'imported') fail('INVALID_RELATION', 'Liên kết Inbox chưa được ghi sổ.');
    }
    if (e.state === 'received' && (e.classification !== null || e.amount !== null || e.reference !== null || e.kind !== null || e.warnings.length || e.error !== null)) fail('INVALID_BACKUP', 'Inbox mới nhận chưa được phân tích.');
    if (['needs_review', 'imported', 'duplicate'].includes(e.state) && (e.classification === null || e.error !== null)) fail('INVALID_BACKUP', 'Inbox thiếu kết quả phân tích.');
    if (e.state === 'failed' && e.error === null) fail('INVALID_BACKUP', 'Inbox lỗi thiếu mô tả.');
    if (e.state === 'imported' && (!importFamily(e) || e.ignored)) fail('INVALID_BACKUP', 'Inbox đã ghi sổ phải là nội dung tài chính đã duyệt.');
    if (e.transferId !== null && e.classification !== 'internal_transfer') fail('INVALID_RELATION', 'Chuyển ví Inbox sai phân loại.');
    if (e.transactionId !== null && (e.classification === 'internal_transfer' || (e.classification === 'refund' && find(s.transactions, e.transactionId).kind !== 'income'))) fail('INVALID_RELATION', 'Giao dịch Inbox sai phân loại.');
    if (e.state === 'duplicate') {
      if (e.duplicateOf === null || e.ignored) fail('INVALID_RELATION', 'Inbox trùng thiếu sự kiện gốc.');
      const owner = find(s.importedEvents, e.duplicateOf); if (owner.id === e.id || owner.state === 'duplicate' || owner.ignored || !importFamily(e) || importFamily(owner) !== importFamily(e) || owner.provider.toLocaleLowerCase('vi') !== e.provider.toLocaleLowerCase('vi') || !((e.sourceId !== null && owner.source === e.source && owner.sourceId === e.sourceId) || (e.reference !== null && owner.reference === e.reference))) fail('INVALID_RELATION', 'Liên kết chống trùng Inbox không hợp lệ.');
    } else if (e.duplicateOf !== null) fail('INVALID_RELATION', 'Inbox chưa trùng không có sự kiện gốc.');
  }
}
type BalanceEvent = { at: string; changes: [string, bigint][] };
function balanceEvents(s: Ledger): BalanceEvent[] { return [
  ...s.wallets.map(w => ({ at: w.openingAt, changes: [[w.id, money(w.openingBalance)]] as [string, bigint][] })),
  ...s.transactions.map(t => ({ at: t.occurredAt, changes: [[t.walletId, money(t.amount) * (t.kind === 'expense' ? -1n : 1n)]] as [string, bigint][] })),
  ...s.transfers.map(t => ({ at: t.occurredAt, changes: [[t.fromWalletId, -money(t.amount)], [t.toWalletId, money(t.amount)]] as [string, bigint][] })),
  ...s.adjustments.map(a => ({ at: a.occurredAt, changes: [[a.walletId, money(a.amount)]] as [string, bigint][] }))
].sort((a, b) => a.at.localeCompare(b.at)); }
function validateHistory(s: Ledger) {
  const values: Record<string, bigint> = Object.fromEntries(s.wallets.map(w => [w.id, 0n])); const events = balanceEvents(s);
  for (let i = 0; i < events.length;) { const at = events[i].at; do { for (const [key, value] of events[i].changes) values[key] += value; i++; } while (i < events.length && events[i].at === at); for (const v of Object.values(values)) checked(v); checked(Object.values(values).reduce((n, v) => n + v, 0n)); }
}
export function balances(s: Ledger, options: { at?: string; walletIds?: string[] } = {}): { byWallet: Record<string, string>; total: string } {
  if (options.at) timestamp(options.at); const chosen = s.wallets.filter(w => !options.walletIds?.length || options.walletIds.includes(w.id));
  const values: Record<string, bigint> = Object.fromEntries(chosen.map(w => [w.id, 0n]));
  for (const e of balanceEvents(s)) if (!options.at || e.at <= options.at) for (const [key, value] of e.changes) if (Object.hasOwn(values, key)) values[key] += value;
  return { byWallet: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, checked(v).toString()])), total: checked(Object.values(values).reduce((n, v) => n + v, 0n)).toString() };
}
export function budgetStatus(s: Ledger, key: string): { spent: string; remaining: string; overspent: string; percentage: string; progress: number } {
  const b = find(s.budgets, key); const spent = checked(s.transactions.filter(t => t.kind === 'expense' && t.occurredAt >= b.start && t.occurredAt < b.endExclusive && (!b.walletIds.length || b.walletIds.includes(t.walletId)) && (!b.categoryIds.length || b.categoryIds.includes(t.categoryId))).reduce((n, t) => n + money(t.amount), 0n)); const limit = money(b.limit, { positive: true });
  const tenths = (spent * 1000n + limit / 2n) / limit;
  return { spent: spent.toString(), remaining: checked(limit - spent).toString(), overspent: (spent > limit ? spent - limit : 0n).toString(), percentage: `${tenths / 10n},${tenths % 10n}`, progress: Number(spent >= limit ? 1000n : spent * 1000n / limit) / 1000 };
}
export function report(s: Ledger, options: { start: string; endExclusive: string; walletIds?: string[] }): { income: string; expense: string; cashFlow: string; totalBalance: string; byCategory: Record<string, string>; history: { date: string; balance: string }[] } {
  timestamp(options.start); timestamp(options.endExclusive); if (options.start >= options.endExclusive) fail('INVALID_DATE', 'Khoảng báo cáo không hợp lệ.');
  const rows = s.transactions.filter(t => t.occurredAt >= options.start && t.occurredAt < options.endExclusive && (!options.walletIds?.length || options.walletIds.includes(t.walletId)));
  let income = 0n, expense = 0n; const byCategory: Record<string, bigint> = Object.create(null);
  for (const t of rows) { const amount = money(t.amount); if (t.kind === 'income') income += amount; else { expense += amount; byCategory[t.categoryId] = (byCategory[t.categoryId] ?? 0n) + amount; } }
  const at = new Date(Date.parse(options.endExclusive) - 1).toISOString();
  const dates = [...new Set([options.start, ...balanceEvents(s).filter(e => e.at >= options.start && e.at < options.endExclusive).map(e => e.at), at].map(t => localDateKey(t, s.settings.timezone)))].sort();
  const history = dates.map(date => { const end = dateRange(date, date, s.settings.timezone).endExclusive; const capped = end > options.endExclusive ? options.endExclusive : end; return { date, balance: balances(s, { at: new Date(Date.parse(capped) - 1).toISOString(), walletIds: options.walletIds }).total }; });
  return { income: checked(income).toString(), expense: checked(expense).toString(), cashFlow: checked(income - expense).toString(), totalBalance: balances(s, { at, walletIds: options.walletIds }).total, byCategory: Object.fromEntries(Object.entries(byCategory).map(([key, n]) => [key, checked(n).toString()])), history };
}
export type TimelineItem = (Transaction & { type: 'transaction' }) | (Transfer & { type: 'transfer' });
export type TimelineFilter = { search?: string; walletIds?: string[]; kind?: Kind | 'transfer'; categoryIds?: string[]; tagIds?: string[]; start?: string; endExclusive?: string };
function filteredTimelineItems(s: Ledger, filter: TimelineFilter): TimelineItem[] {
  const search = filter.search?.trim().toLocaleLowerCase('vi') ?? '';
  return [...s.transactions.map(t => ({ ...t, type: 'transaction' as const })), ...s.transfers.map(t => ({ ...t, type: 'transfer' as const }))].filter(t => {
    if ((filter.start && t.occurredAt < filter.start) || (filter.endExclusive && t.occurredAt >= filter.endExclusive)) return false;
    if (filter.kind && (t.type === 'transfer' ? filter.kind !== 'transfer' : t.kind !== filter.kind)) return false;
    if (filter.walletIds?.length && !(t.type === 'transfer' ? filter.walletIds.includes(t.fromWalletId) || filter.walletIds.includes(t.toWalletId) : filter.walletIds.includes(t.walletId))) return false;
    if (filter.categoryIds?.length && (t.type === 'transfer' || !filter.categoryIds.includes(t.categoryId))) return false;
    if (filter.tagIds?.length && (t.type === 'transfer' || !filter.tagIds.every(key => t.tagIds.includes(key)))) return false;
    const category = t.type === 'transaction' ? s.categories.find(c => c.id === t.categoryId)?.name ?? '' : 'Chuyển ví';
    return !search || `${t.note} ${category}`.toLocaleLowerCase('vi').includes(search);
  });
}
export function timelineDailyTotals(s: Ledger, filter: TimelineFilter = {}): Record<string, string> {
  const totals: Record<string, bigint> = Object.create(null);
  for (const t of filteredTimelineItems(s, filter)) if (t.type === 'transaction') {
    const day = localDateKey(t.occurredAt, s.settings.timezone);
    totals[day] = (totals[day] ?? 0n) + money(t.amount) * (t.kind === 'expense' ? -1n : 1n);
  }
  return Object.fromEntries(Object.entries(totals).map(([day, total]) => [day, checked(total).toString()]));
}
export function timeline(s: Ledger, filter: TimelineFilter = {}, options: { limit?: number; cursor?: string } = {}): { items: TimelineItem[]; nextCursor: string | null } {
  const limit = options.limit ?? 50; if (!Number.isInteger(limit) || limit < 1 || limit > 200) fail('INVALID_INPUT', 'Kích thước trang không hợp lệ.');
  const items = filteredTimelineItems(s, filter).sort((a, b) => a.occurredAt === b.occurredAt ? a.id === b.id ? a.type < b.type ? 1 : a.type > b.type ? -1 : 0 : a.id < b.id ? 1 : -1 : a.occurredAt < b.occurredAt ? 1 : -1);
  let after = items; if (options.cursor) {
    let cursor: unknown; try { cursor = JSON.parse(options.cursor); } catch { fail('INVALID_INPUT', 'Trang danh sách không hợp lệ.'); }
    if (!Array.isArray(cursor) || cursor.length !== 3) fail('INVALID_INPUT', 'Trang danh sách không hợp lệ.');
    const [at, key, type] = cursor as string[]; timestamp(at); id(key); if (!['transaction', 'transfer'].includes(type)) fail('INVALID_INPUT', 'Trang danh sách không hợp lệ.');
    after = items.filter(t => t.occurredAt < at || (t.occurredAt === at && (t.id < key || (t.id === key && t.type < type))));
  }
  const page = after.slice(0, limit); const last = page[page.length - 1]; return { items: page, nextCursor: after.length > limit && last ? JSON.stringify([last.occurredAt, last.id, last.type]) : null };
}
const actionLabels: Record<string, string> = { wallet: 'ví', category: 'danh mục', tag: 'nhãn', transaction: 'giao dịch', transfer: 'chuyển ví', adjustment: 'điều chỉnh số dư', budget: 'ngân sách', settings: 'cài đặt', data: 'dữ liệu', import: 'nội dung Inbox' };
function signature(command: Command) { const sorted = (v: unknown): unknown => Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, sorted(x)])) : v; return JSON.stringify(sorted(command)); }
export function applyCommand(state: Ledger, command: Command, context: { now: string }): Ledger {
  const commandFields: Record<string, string[]> = {
    'wallet.create': ['id', 'name', 'icon', 'openingBalance', 'openingAt', 'archived'], 'wallet.update': ['id', 'name', 'icon', 'expectedVersion'], 'wallet.archive': ['id', 'expectedVersion', 'archived'],
    'category.create': ['id', 'name', 'icon', 'kind', 'archived'], 'category.update': ['id', 'name', 'icon', 'kind', 'expectedVersion'], 'category.archive': ['id', 'expectedVersion', 'archived'],
    'tag.create': ['id', 'name', 'archived'], 'tag.update': ['id', 'name', 'expectedVersion'], 'tag.archive': ['id', 'expectedVersion', 'archived'],
    'transaction.create': ['id', 'walletId', 'categoryId', 'kind', 'amount', 'occurredAt', 'note', 'tagIds'], 'transaction.update': ['id', 'walletId', 'categoryId', 'kind', 'amount', 'occurredAt', 'note', 'tagIds', 'expectedVersion'], 'transaction.delete': ['id', 'expectedVersion'],
    'transfer.create': ['id', 'fromWalletId', 'toWalletId', 'amount', 'occurredAt', 'note'], 'transfer.update': ['id', 'fromWalletId', 'toWalletId', 'amount', 'occurredAt', 'note', 'expectedVersion'], 'transfer.delete': ['id', 'expectedVersion'],
    'adjustment.create': ['id', 'walletId', 'amount', 'occurredAt', 'note'], 'budget.create': ['id', 'name', 'limit', 'start', 'endExclusive', 'walletIds', 'categoryIds'], 'budget.update': ['id', 'name', 'limit', 'start', 'endExclusive', 'walletIds', 'categoryIds', 'expectedVersion'], 'budget.delete': ['id', 'expectedVersion'],
    'activity.read': ['id'], 'settings.update': ['timezone', 'onboarded'], 'data.clear': ['confirmation'],
    'import.receive': ['id', 'source', 'provider', 'sourceId', 'text', 'receivedAt'], 'import.process': ['id', 'expectedVersion'], 'import.ignore': ['id', 'expectedVersion'], 'import.confirm': ['id', 'expectedVersion', 'entry']
  };
  fields(command, ['type', 'mutationId', 'payload']); if (!Object.hasOwn(commandFields, command.type)) fail('INVALID_INPUT', 'Thao tác không được hỗ trợ.'); fields(command.payload, commandFields[command.type]);
  timestamp(context.now, 'now'); id(command.mutationId, 'mutationId'); const sig = signature(command); const receipt = state.receipts.find(r => r.id === command.mutationId);
  if (receipt) { if (receipt.signature !== sig) fail('IDEMPOTENCY_CONFLICT', 'Mã thao tác đã được dùng với dữ liệu khác.'); return state; }
  const s: Ledger = JSON.parse(JSON.stringify(state)); const p = command.payload; const [entity, action] = command.type.split('.');
  const before = new Map(s.budgets.map(b => [b.id, budgetStatus(s, b.id).overspent !== '0']));
  const tableMap = { wallet: s.wallets, category: s.categories, tag: s.tags, transaction: s.transactions, transfer: s.transfers, adjustment: s.adjustments, budget: s.budgets };
  let effectiveEntity = entity, effectiveAction = action, effectivePayload: Command['payload'] | ImportEntry['payload'] = p;
  if (command.type === 'import.receive') {
    const incoming = command.payload; id(incoming.id); if (s.importedEvents.some(e => e.id === incoming.id)) fail('INVALID_INPUT', 'Mã Inbox đã tồn tại.');
    text(incoming.provider, 'provider', 200); if (incoming.sourceId !== null) text(incoming.sourceId, 'sourceId', 200);
    s.importedEvents.push({ ...incoming, provider: incoming.provider.trim(), sourceId: incoming.sourceId?.trim() ?? null, version: 1, state: 'received', classification: null, amount: null, reference: null, warnings: [], kind: null, transactionId: null, transferId: null, duplicateOf: null, error: null, ignored: false });
  } else if (entity === 'import') {
    const payload = p as Revision; const event = find(s.importedEvents, payload.id);
    if (event.version !== payload.expectedVersion) fail('STALE', 'Nội dung Inbox đã thay đổi. Mở lại trước khi duyệt.', 'version');
    if (event.ignored || ['imported', 'duplicate'].includes(event.state)) fail('INVALID_INPUT', 'Nội dung này đã được xử lý.');
    if (command.type === 'import.process') {
      if (!['received', 'processing', 'failed'].includes(event.state)) fail('INVALID_INPUT', 'Nội dung đã được phân tích.');
      event.state = 'processing'; event.error = null;
      try { Object.assign(event, parseImportText(event.text)); event.state = 'needs_review'; }
      catch (error) { event.state = 'failed'; event.error = error instanceof Error ? error.message.slice(0, 500) : 'Không phân tích được nội dung.'; }
      if (event.state === 'needs_review') {
        const duplicate = strongImportDuplicate(s, event);
        if (duplicate) { event.state = 'duplicate'; event.duplicateOf = duplicate.id; }
        else if (importFamily(event) && s.importedEvents.some(other => other.id !== event.id && !other.ignored && importFamily(other) === importFamily(event) && (other.text === event.text || (event.amount !== null && event.amount === other.amount)))) event.warnings.push('Có nội dung hoặc số tiền giống một mục khác. Có thể là hai giao dịch thật; kiểm tra trước khi ghi sổ.');
      }
    } else if (command.type === 'import.ignore') {
      event.ignored = true;
      const duplicates = s.importedEvents.filter(other => other.duplicateOf === event.id).sort((a, b) => a.receivedAt.localeCompare(b.receivedAt) || a.id.localeCompare(b.id));
      for (const other of duplicates) { other.duplicateOf = null; other.state = 'needs_review'; other.version++; }
      const pending = new Set(duplicates.map(other => other.id));
      for (const other of duplicates) {
        pending.delete(other.id);
        const replacement = strongImportDuplicate({ ...s, importedEvents: s.importedEvents.filter(candidate => !pending.has(candidate.id)) }, other);
        if (replacement) { other.state = 'duplicate'; other.duplicateOf = replacement.id; }
        else other.warnings = [...new Set([...other.warnings, 'Nguồn gốc đã được bỏ qua. Kiểm tra nội dung này trước khi ghi sổ.'])];
      }
    }
    else if (command.type === 'import.confirm') {
      if (event.state !== 'needs_review' || !importFamily(event)) fail('INVALID_INPUT', 'Chỉ ghi sổ nội dung thanh toán, hoàn tiền hoặc chuyển ví đã duyệt.');
      if (strongImportDuplicate(s, event)) fail('DUPLICATE', 'Mã nguồn hoặc tham chiếu đã có trong Inbox. Không ghi trùng.');
      const entry = command.payload.entry; fields(entry, ['type', 'payload']);
      if (!['transaction', 'transfer'].includes(entry.type)) fail('INVALID_INPUT', 'Chọn thu, chi hoặc chuyển ví.', 'kind');
      fields(entry.payload, commandFields[`${entry.type}.create`]);
      if (event.classification === 'refund' && (entry.type !== 'transaction' || entry.payload.kind !== 'income')) fail('INVALID_INPUT', 'Hoàn tiền phải được duyệt là khoản thu.', 'kind');
      if (entry.type === 'transfer') { event.classification = 'internal_transfer'; event.kind = null; event.transferId = entry.payload.id; }
      else { if (event.classification === 'internal_transfer') event.classification = 'payment_success'; event.kind = entry.payload.kind; event.transactionId = entry.payload.id; }
      event.state = 'imported'; effectiveEntity = entry.type; effectiveAction = 'create'; effectivePayload = entry.payload;
    } else fail('INVALID_INPUT', 'Thao tác Inbox không được hỗ trợ.');
    event.version++;
  }
  if (effectiveEntity in tableMap) {
    const rows = tableMap[effectiveEntity as keyof typeof tableMap] as Versioned[]; const payload = effectivePayload as unknown as Record<string, unknown>; id(payload.id);
    if (effectiveAction === 'create') { if (rows.some(row => row.id === payload.id)) fail('INVALID_INPUT', 'Mã bản ghi đã tồn tại.'); rows.push({ ...payload, version: 1 } as Versioned); }
    else { const row = find(rows, payload.id); if (row.version !== payload.expectedVersion) fail('STALE', 'Bản ghi đã thay đổi. Tải lại trước khi sửa.', 'version');
      if (effectiveAction === 'delete') { rows.splice(rows.indexOf(row), 1); for (const event of s.importedEvents) { if (effectiveEntity === 'transaction' && event.transactionId === row.id) event.transactionId = null; if (effectiveEntity === 'transfer' && event.transferId === row.id) event.transferId = null; } }
      else { const { expectedVersion: _, ...values } = payload; Object.assign(row, values, { version: row.version + 1 }); }
    }
    if (['transaction', 'transfer', 'adjustment'].includes(effectiveEntity) && effectiveAction !== 'delete') {
      if (effectiveEntity === 'transfer') { const t = effectivePayload as Create<Transfer>; active(s.wallets, t.fromWalletId, 'fromWalletId'); active(s.wallets, t.toWalletId, 'toWalletId'); }
      else { const t = effectivePayload as Create<Transaction>; active(s.wallets, t.walletId, 'walletId'); if (effectiveEntity === 'transaction') { active(s.categories, t.categoryId, 'categoryId'); ids(t.tagIds, 'tagIds'); for (const key of t.tagIds) active(s.tags, key, 'tagIds'); } }
    }
  } else if (entity === 'import') { /* Inbox-only transitions have no financial entry. */ }
  else if (command.type === 'settings.update') { s.settings = { ...command.payload }; }
  else if (command.type === 'activity.read') { find(s.activities, command.payload.id).read = true; }
  else if (command.type === 'data.clear') { if (command.payload.confirmation !== 'XÓA') fail('INVALID_INPUT', 'Cần xác nhận XÓA.'); Object.assign(s, emptyLedger()); }
  else fail('INVALID_INPUT', 'Thao tác không được hỗ trợ.');
  if (command.type !== 'activity.read') {
    const entityId = 'id' in p ? p.id : command.mutationId;
    s.activities.push({ id: `${command.mutationId}-change`, kind: entity === 'adjustment' ? 'adjustment' : 'mutation', entityId, message: `${action === 'create' ? 'Tạo' : action === 'delete' ? 'Xóa' : action === 'archive' ? 'Đổi trạng thái' : 'Cập nhật'} ${actionLabels[entity] ?? entity}`, createdAt: context.now, read: false });
    for (const b of s.budgets) if (!before.get(b.id) && budgetStatus(s, b.id).overspent !== '0') s.activities.push({ id: `${command.mutationId}-budget-${b.id}`, kind: 'budget_exceeded', entityId: b.id, message: `${b.name} vượt ${formatMoney(budgetStatus(s, b.id).overspent)}`, createdAt: context.now, read: false });
  }
  s.receipts.push({ id: command.mutationId, signature: sig }); validateLedger(s, context.now); backupText({ schemaVersion: 2, exportedAt: context.now, ledger: s }); return s;
}
export function validateBackup(value: unknown, context: { now: string }): Backup {
  try {
    fields(value, ['schemaVersion', 'exportedAt', 'ledger']); const original = value as { schemaVersion: number; exportedAt: string; ledger: Ledger };
    if (![1, 2].includes(original.schemaVersion)) fail('INVALID_BACKUP', 'Phiên bản backup chưa được hỗ trợ.');
    notFuture(original.exportedAt, context.now, 'exportedAt');
    let ledger = original.ledger;
    if (original.schemaVersion === 1) {
      fields(ledger, ['schemaVersion', 'wallets', 'categories', 'tags', 'transactions', 'transfers', 'adjustments', 'budgets', 'activities', 'settings', 'receipts']);
      if ((ledger as { schemaVersion: number }).schemaVersion !== 1) fail('INVALID_BACKUP', 'Phiên bản sổ không khớp backup.');
      ledger = { ...ledger, schemaVersion: 2, importedEvents: [] };
    }
    validateLedger(ledger, context.now); const normalized: Backup = { schemaVersion: 2, exportedAt: original.exportedAt, ledger }; backupText(normalized); return JSON.parse(JSON.stringify(normalized)) as Backup;
  }
  catch (e) { if (e instanceof DomainError) throw e; fail('INVALID_BACKUP', 'Cấu trúc backup không hợp lệ.'); }
}
function backupText(value: Backup): string { const json = JSON.stringify(value, null, 2); if (new TextEncoder().encode(json).byteLength > MAX_BACKUP_BYTES) fail('INVALID_BACKUP', 'Dữ liệu vượt dung lượng backup 10 MB. Không lưu thêm; xuất backup hiện tại để bảo toàn dữ liệu.'); return json; }
export function encodeBackup(state: Ledger, exportedAt: string): string { return backupText(validateBackup({ schemaVersion: 2, exportedAt, ledger: state }, { now: exportedAt })); }
export function decodeBackup(value: string, context: { now: string }): Backup {
  if (typeof value !== 'string' || new TextEncoder().encode(value).byteLength > MAX_BACKUP_BYTES) fail('INVALID_BACKUP', 'Backup vượt giới hạn 10 MB.');
  let parsed: unknown; try { parsed = JSON.parse(value); } catch { fail('INVALID_BACKUP', 'File không phải JSON hợp lệ.'); } return validateBackup(parsed, context);
}
