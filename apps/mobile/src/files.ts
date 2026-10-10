import { File, Paths } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { MAX_BACKUP_BYTES, decodeBackup, encodeBackup, type Backup, type Ledger } from './domain';

async function share(contents: string, extension: 'json' | 'csv') {
  if (!await Sharing.isAvailableAsync()) throw new Error('Chia sẻ file không khả dụng trên nền tảng này.');
  const file = new File(Paths.cache, `so-vi-${Date.now()}.${extension}`); file.create({ overwrite: true }); file.write(contents);
  try { await Sharing.shareAsync(file.uri, { mimeType: extension === 'json' ? 'application/json' : 'text/csv', UTI: extension === 'json' ? 'public.json' : 'public.comma-separated-values-text', dialogTitle: 'Lưu backup Sổ Ví' }); } finally { if (file.exists) file.delete(); }
}
export async function exportBackup(ledger: Ledger) { await share(encodeBackup(ledger, new Date().toISOString()), 'json'); }
export async function chooseBackup(): Promise<Backup | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', 'public.json'], copyToCacheDirectory: true }); if (result.canceled) return null;
  const asset = result.assets[0]; const file = new File(asset.uri);
  try { if ((asset.size ?? file.size) > MAX_BACKUP_BYTES) throw new Error('File backup vượt giới hạn 10 MB.'); return decodeBackup(await file.text(), { now: new Date().toISOString() }); }
  finally { if (file.exists) file.delete(); }
}
export async function exportCsv(s: Ledger) {
  const cell = (value: string) => `"${(/^[\t\r\n]|^\s*[=+@-]/.test(value) ? `'${value}` : value).replace(/"/g, '""')}"`;
  const rows = [['Loại', 'Số tiền VND', 'UTC', 'Ví', 'Danh mục', 'Ghi chú', 'Nhãn'], ...s.transactions.map(t => [t.kind === 'expense' ? 'Chi' : 'Thu', t.amount, t.occurredAt, s.wallets.find(w => w.id === t.walletId)!.name, s.categories.find(c => c.id === t.categoryId)!.name, t.note, t.tagIds.map(id => s.tags.find(tag => tag.id === id)!.name).join('; ')]), ...s.transfers.map(t => ['Chuyển ví', t.amount, t.occurredAt, `${s.wallets.find(w => w.id === t.fromWalletId)!.name} → ${s.wallets.find(w => w.id === t.toWalletId)!.name}`, '', t.note, ''])];
  await share(`\uFEFF${rows.map(row => row.map(cell).join(',')).join('\r\n')}`, 'csv');
}
