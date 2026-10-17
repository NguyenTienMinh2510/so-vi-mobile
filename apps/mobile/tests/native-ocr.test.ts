import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';

function harness(options: { absent?: boolean; denied?: boolean; canceled?: boolean; fail?: boolean; oversized?: boolean; original?: boolean; text?: string } = {}) {
  const require = createRequire(import.meta.url); const ts = require('typescript');
  const code = ts.transpileModule(readFileSync(new URL('../src/native.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const source = options.original ? 'file:///Photos/original.jpg' : 'file:///cache/ImagePicker/selected.jpg';
  const files = new Map([[source, options.oversized ? 21 * 1024 * 1024 : 100]]); const removed: string[] = []; const calls: string[] = [];
  const bridge = { addListener: () => ({ remove() {} }), clearOcrCacheAsync: async () => { calls.push('cleanup'); },
    removeImageCopyAsync: async (uri: string) => { if (uri.startsWith('file:///cache/')) { removed.push(uri); files.delete(uri); } },
    recognizeTextAsync: async (uri: string) => { calls.push('vision'); assert.ok(uri.startsWith('file:///cache/SoViOCR/')); if (options.fail) throw new Error('vision-failed'); return { text: options.text ?? 'Thanh toán 58.000 VND', languages: ['en-US'], warnings: ['Kiểm tra dấu tiếng Việt'] }; } };
  class Directory { uri: string; constructor(root: any, name: string) { this.uri = (root.uri ?? root) + name + '/'; } create() {} }
  class File { uri: string; constructor(root: any, name?: string) { this.uri = name ? root.uri + name : root; } get size() { return files.get(this.uri) ?? 0; } get exists() { return files.has(this.uri); } copy(target: File) { files.set(target.uri, this.size); } delete() { removed.push(this.uri); files.delete(this.uri); } }
  const permission = async () => { calls.push('permission'); return { granted: !options.denied }; };
  const picker = async () => { calls.push('picker'); return { canceled: !!options.canceled, assets: [{ uri: source, fileSize: files.get(source), width: 100, height: 100 }] }; };
  const exports: any = {};
  runInNewContext(code, { exports, Date, Math, require: (name: string) => {
    if (name === 'expo') return { requireOptionalNativeModule: () => options.absent ? null : bridge };
    if (name === 'expo-file-system') return { File, Directory, Paths: { cache: 'file:///cache/' } };
    if (name === 'expo-image-picker') return { requestCameraPermissionsAsync: permission, requestMediaLibraryPermissionsAsync: permission, launchCameraAsync: picker, launchImageLibraryAsync: picker };
    throw new Error('Unexpected dependency ' + name);
  } });
  return { exports, removed, calls, files, source };
}

test('actual OCR wrapper handles missing module, denied permission and cancel without running Vision', async () => {
  const absent = harness({ absent: true }); await assert.rejects(absent.exports.recognizeImportImage(false)); assert.equal(absent.calls.length, 0);
  const denied = harness({ denied: true }); await assert.rejects(denied.exports.recognizeImportImage(true)); assert.deepEqual(denied.calls, ['permission']);
  const cancel = harness({ canceled: true }); assert.equal(await cancel.exports.recognizeImportImage(false), null); assert.ok(!cancel.calls.includes('vision')); assert.equal(cancel.removed.length, 0);
});

test('actual OCR wrapper preserves full long text and cleans both owned copies after success', async () => {
  const text = 'x'.repeat(4001); const app = harness({ text }); const result = await app.exports.recognizeImportImage(false);
  assert.equal(result.text, text); assert.equal(result.warnings.length, 1); assert.equal(app.removed.length, 2); assert.equal(app.files.size, 0);
});

test('actual OCR wrapper cleans owned images after Vision error or oversize rejection', async () => {
  const error = harness({ fail: true }); await assert.rejects(error.exports.recognizeImportImage(false), /vision-failed/); assert.equal(error.files.size, 0);
  const large = harness({ oversized: true }); await assert.rejects(large.exports.recognizeImportImage(false)); assert.equal(large.files.size, 0); assert.ok(!large.calls.includes('vision'));
});

test('actual OCR wrapper removes its temporary copy while retaining the Photos original', async () => {
  const app = harness({ original: true }); await app.exports.recognizeImportImage(false);
  assert.ok(app.files.has(app.source)); assert.equal(app.removed.length, 1); assert.ok(app.removed[0].includes('/SoViOCR/'));
});
