import * as SQLite from 'expo-sqlite';
import { LedgerRepository, migrations, USER_DATABASE } from './database';
import { balances, report, budgetStatus, encodeBackup, decodeBackup, type Command } from './domain';

export async function runNativeChecks(): Promise<string[]> {
  const name = `sovi-test-${Date.now()}.sqlite`; if (name === USER_DATABASE) throw new Error('Tên database test không an toàn.');
  let db = await SQLite.openDatabaseAsync(name, { useNewConnection: true }); let repo = new LedgerRepository(db); const evidence: string[] = [];
  const assert = (condition: boolean, label: string) => { if (!condition) throw new Error(`FAIL: ${label}`); evidence.push(`PASS: ${label}`); };
  try {
    // The only seed is in this explicitly isolated test database.
    await db.execAsync('PRAGMA foreign_keys=ON;'); await db.execAsync(migrations[0].sql); await db.execAsync('PRAGMA user_version=1;');
    for (const [key, value] of [['initialized', '1'], ['revision', '0'], ['timezone', 'Asia/Ho_Chi_Minh'], ['onboarded', 'true']]) await db.runAsync('INSERT INTO settings(key,value) VALUES(?,?)', key, value);
    await db.runAsync('INSERT INTO wallets(id,version,name,icon,openingBalance,openingAt,archived) VALUES(?,?,?,?,?,?,?)', 'large', 1, 'Ví test', 'wallet', '9007199254740993', '2026-01-01T00:00:00.000Z', 0);
    await repo.initialize(); let loaded = await repo.load(); assert(loaded.ledger.wallets[0].openingBalance === '9007199254740993' && loaded.ledger.importedEvents.length === 0, 'Migration v1 → v3 giữ dữ liệu và tiền vượt 2^53');
    const exported = encodeBackup(loaded.ledger, new Date().toISOString()); await repo.restore(decodeBackup(exported, { now: new Date().toISOString() }), loaded.revision); await repo.close();
    db = await SQLite.openDatabaseAsync(name, { useNewConnection: true }); repo = new LedgerRepository(db); await repo.initialize(); loaded = await repo.load(); assert(balances(loaded.ledger).total === '9007199254740993', 'TEXT round-trip, export/restore, đóng/mở giữ tiền chính xác');
    const before = JSON.stringify(loaded.ledger);
    await db.execAsync("CREATE TEMP TRIGGER fail_restore BEFORE INSERT ON wallets BEGIN SELECT RAISE(ABORT,'test restore rollback'); END;");
    let rejected = false; try { await repo.restore(decodeBackup(exported, { now: new Date().toISOString() }), loaded.revision); } catch { rejected = true; }
    assert(rejected && JSON.stringify((await repo.load()).ledger) === before, 'Lỗi sau DELETE trong restore rollback toàn bộ'); await db.execAsync('DROP TRIGGER fail_restore;');
    let counter = 0; const execute = async (command: Command) => { loaded = await repo.mutate(command, loaded.revision); return loaded; };
    const at = '2026-01-01T00:00:00.000Z';
    await execute({ type: 'data.clear', mutationId: 'test-clear', payload: { confirmation: 'XÓA' } });
    for (const [id, name, amount] of [['cash', 'Tiền mặt', '1000000'], ['bank', 'Ngân hàng', '0']]) await execute({ type: 'wallet.create', mutationId: `wallet-${id}`, payload: { id, name, icon: 'wallet', openingBalance: amount, openingAt: at, archived: false } });
    await execute({ type: 'budget.create', mutationId: 'budget', payload: { id: 'budget', name: 'Ăn uống', limit: '5500', start: at, endExclusive: '2027-01-01T00:00:00.000Z', walletIds: ['cash'], categoryIds: ['expense-food'] } });
    const expense: Command = { type: 'transaction.create', mutationId: 'expense', payload: { id: 'expense', walletId: 'cash', categoryId: 'expense-food', kind: 'expense', amount: '58000', occurredAt: at, note: 'Test', tagIds: [] } };
    await execute(expense); const transfer: Command = { type: 'transfer.create', mutationId: 'transfer', payload: { id: 'transfer', fromWalletId: 'cash', toWalletId: 'bank', amount: '100000', occurredAt: at, note: '' } };
    const beforeTransfer = JSON.stringify((await repo.load()).ledger); await db.execAsync("CREATE TEMP TRIGGER fail_transfer BEFORE INSERT ON transfers BEGIN SELECT RAISE(ABORT,'test transfer rollback'); END;");
    rejected = false; try { await execute(transfer); } catch { rejected = true; }
    assert(rejected && JSON.stringify((await repo.load()).ledger) === beforeTransfer, 'Lỗi giữa chuyển ví rollback; hàng đợi vẫn hoạt động'); await db.execAsync('DROP TRIGGER fail_transfer;');
    await execute(transfer); const originalRevision = loaded.revision; await execute(expense); assert(loaded.revision === originalRevision && loaded.ledger.transactions.length === 1, 'Retry không tạo giao dịch/hoạt động trùng');
    const b = balances(loaded.ledger); const r = report(loaded.ledger, { start: at, endExclusive: '2027-01-01T00:00:00.000Z' }); const budget = budgetStatus(loaded.ledger, 'budget');
    assert(b.byWallet.cash === '842000' && b.byWallet.bank === '100000' && b.total === '942000' && r.cashFlow === '-58000' && budget.overspent === '52500', 'Nghiệm thu số dư, dòng tiền, ngân sách trên expo-sqlite');
    const final = encodeBackup(loaded.ledger, new Date().toISOString()); const stale = loaded.revision; await repo.restore(decodeBackup(final, { now: new Date().toISOString() }), stale);
    rejected = false; try { await repo.restore(decodeBackup(final, { now: new Date().toISOString() }), stale); } catch { rejected = true; } assert(rejected, 'Restore từ preview stale bị chặn');
    loaded = await repo.load();
    const beforeImport = balances(loaded.ledger).total;
    await execute({ type: 'import.receive', mutationId: 'import-receive', payload: { id: 'import-1', source: 'sms', provider: 'Ngân hàng test', sourceId: 'MSG1', text: 'Thanh toán thành công 1.000 VND. Số dư 941.000 VND. Mã GD: REF1', receivedAt: at } });
    await execute({ type: 'import.process', mutationId: 'import-process', payload: { id: 'import-1', expectedVersion: 1 } });
    assert(balances(loaded.ledger).total === beforeImport && loaded.ledger.importedEvents[0].amount === '1000', 'Inbox phân biệt số tiền/số dư; chưa duyệt không đổi tài chính');
    const importConfirm: Command = { type: 'import.confirm', mutationId: 'import-confirm', payload: { id: 'import-1', expectedVersion: 2, entry: { type: 'transaction', payload: { id: 'import-tx', walletId: 'cash', categoryId: 'expense-food', kind: 'expense', amount: '1000', occurredAt: at, note: 'Test import', tagIds: [] } } } };
    const priorImport = JSON.stringify(loaded);
    await db.execAsync("CREATE TEMP TRIGGER fail_import BEFORE UPDATE ON imported_events WHEN NEW.state='imported' BEGIN SELECT RAISE(ABORT,'test import rollback'); END;");
    rejected = false; try { await execute(importConfirm); } catch { rejected = true; }
    assert(rejected && JSON.stringify(await repo.load()) === priorImport, 'Lỗi sau tạo giao dịch rollback Inbox, giao dịch, receipt và revision');
    await db.execAsync('DROP TRIGGER fail_import;'); await execute(importConfirm); const importRevision = loaded.revision; await execute(importConfirm);
    assert(loaded.revision === importRevision && loaded.ledger.transactions.filter(t => t.id === 'import-tx').length === 1 && loaded.ledger.importedEvents[0].state === 'imported', 'Duyệt và retry Inbox ghi đúng một lần');
    const auditBackup = encodeBackup(loaded.ledger, new Date().toISOString()); await repo.restore(decodeBackup(auditBackup, { now: new Date().toISOString() }), loaded.revision); await repo.close();
    db = await SQLite.openDatabaseAsync(name, { useNewConnection: true }); repo = new LedgerRepository(db); await repo.initialize(); loaded = await repo.load();
    assert(loaded.ledger.importedEvents[0].transactionId === 'import-tx' && balances(loaded.ledger).total === '941000', 'Backup v2 và đóng/mở giữ Inbox, liên kết và số dư');
    assert((await db.getAllAsync('PRAGMA foreign_key_check')).length === counter, 'Không có quan hệ khóa ngoại lỗi');
    return evidence;
  } finally { await repo.close(); await SQLite.deleteDatabaseAsync(name); }
}
