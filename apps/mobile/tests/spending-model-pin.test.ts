import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('requested4B model has identical pinned byte/hash identity in JS metadata and private native verifier', () => {
  const ai = readFileSync(new URL('../src/spending-ai.ts', import.meta.url), 'utf8'), native = readFileSync(new URL('../modules/so-vi-native/ios/ModelFileVerifier.swift', import.meta.url), 'utf8');
  assert.ok(ai.includes("bytes: 3443763168")); assert.ok(native.includes('3_443_763_168'));
  const checksum = '21c4643259ce62ffd979848e5819ce03823fd9e9902279ab54cc0d572d83d33e'; assert.ok(ai.includes(checksum) && native.includes(checksum));
  assert.ok(ai.includes('4168f45a16a1290d65a4ec0fa312ae917a4c15d6')); assert.ok(ai.includes('Qwen_Qwen3.5-4B-Q5_K_M.gguf'));
  assert.ok(native.includes('total == byteCount')); assert.ok(native.includes('hash.finalize()')); assert.ok(native.includes('file.resolvingSymlinksInPath()'));
});
