import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { estimatedRoadmapMeals } from '../src/spending-meal-estimates.ts';
import { dishImageKey } from '../src/dish-image-keys.ts';

// dish-images.ts uses Metro requires; check its key logic and assets from the source text.
const source = readFileSync(new URL('../src/dish-images.ts', import.meta.url), 'utf8');
const keys = [...source.matchAll(/'([a-z-]+)': require\('\.\.\/assets\/dishes\/([a-z-]+)\.png'\)/g)];
test('every roadmap estimate resolves to a bundled dish illustration or family fallback', () => {
  assert.ok(keys.every(([, key, file]) => key === file));
  for (const [, , file] of keys) { const png = readFileSync(new URL(`../assets/dishes/${file}.png`, import.meta.url)); assert.equal(png.readUInt32BE(16), 192); assert.ok(png.length < 40000, file); }
  const names = new Set(keys.map(([, key]) => key));
  for (const meal of estimatedRoadmapMeals('2026-10-17')) assert.ok(names.has(dishImageKey(meal, key => names.has(key))), meal.id);
  for (const fallback of ['generic-noodle', 'generic-rice', 'generic-meal', 'chao', 'banh-mi']) assert.ok(names.has(fallback));
  assert.ok(existsSync(new URL('../assets/dishes/pho.png', import.meta.url)));
});
test('other meals fall back by dish family name', () => {
  const has = (key: string) => keys.some(([, k]) => k === key);
  assert.equal(dishImageKey({ id: 'roadmap-estimate-pho', name: 'Phở' }, has), 'pho'); assert.equal(dishImageKey({ id: 'roadmap-estimate-unknown', name: 'Phở cuốn' }, has), 'generic-noodle');
  assert.equal(dishImageKey({ id: 'mine', name: 'Bún mọc' }, has), 'generic-noodle'); assert.equal(dishImageKey({ id: 'mine', name: 'Cháo lòng' }, has), 'chao');
  assert.equal(dishImageKey({ id: 'mine', name: 'Cơm văn phòng' }, has), 'generic-rice'); assert.equal(dishImageKey({ id: 'mine', name: 'Bánh mì que' }, has), 'banh-mi'); assert.equal(dishImageKey({ id: 'mine', name: 'Gỏi cuốn' }, has), 'generic-meal');
});
