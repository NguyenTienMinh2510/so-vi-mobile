import * as SQLite from 'expo-sqlite';
import { searchFoodVenues, type VenueQuery } from './spending-venues';

// Release-specific, read-only catalog; never opens or migrates the user's sovi.sqlite.
export const FOOD_DATABASE = 'sovi-food-2026-09-23.1.db';
let database: Promise<SQLite.SQLiteDatabase> | null = null;
async function openFoodDatabase() {
  if (!database) database = (async () => {
    await SQLite.importDatabaseFromAssetAsync(FOOD_DATABASE, { assetId: require('../assets/food/sovi-food-2026-09-23.1.db') });
    const db = await SQLite.openDatabaseAsync(FOOD_DATABASE);
    try {
      const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM metadata WHERE key='manifest'");
      if (!row || JSON.parse(row.value).release !== '2026-09-23.1') throw new Error('Sai phiên bản kho quán.');
      await db.execAsync('PRAGMA query_only=ON'); return db;
    } catch (error) { await db.closeAsync(); throw error; }
  })().catch(error => { database = null; throw new Error(`Chưa mở được kho quán. Thử lại hoặc cài bản ứng dụng có dữ liệu. ${error instanceof Error ? error.message : ''}`); });
  return database;
}
export async function loadFoodVenues(query: VenueQuery, signal: AbortSignal) {
  if (signal.aborted) throw new Error('Đã hủy tìm quán.');
  const result = await searchFoodVenues(await openFoodDatabase(), query);
  if (signal.aborted) throw new Error('Đã hủy tìm quán.');
  return result;
}
