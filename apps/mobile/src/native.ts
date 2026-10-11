import { requireOptionalNativeModule } from 'expo';
import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import type { NativeInboxBridge } from './native-import';

type OcrResult = { text: string; languages: string[]; warnings: string[] };
type NativeBridge = NativeInboxBridge & { pendingSharedImportsAsync?: () => Promise<unknown[]>; acknowledgeSharedImportAsync?: (id: string) => Promise<void>; sharedInboxStatus?: () => Promise<{ available: boolean; error: string }>; recognizeTextAsync: (uri: string) => Promise<OcrResult>; clearOcrCacheAsync: () => Promise<void>; removeImageCopyAsync: (uri: string) => Promise<void>; addListener: (name: 'inboxChanged', listener: () => void) => { remove: () => void } };
export const nativeImportBridge = requireOptionalNativeModule<NativeBridge>('SoViNative');
export const sharedNativeImportBridge: NativeInboxBridge | null = nativeImportBridge?.pendingSharedImportsAsync && nativeImportBridge?.acknowledgeSharedImportAsync ? { pendingImportsAsync: () => nativeImportBridge.pendingSharedImportsAsync!(), acknowledgeImportAsync: id => nativeImportBridge.acknowledgeSharedImportAsync!(id) } : null;
export async function sharedInboxStatus(): Promise<{ available: boolean; error: string }> {
  if (!nativeImportBridge?.sharedInboxStatus || !sharedNativeImportBridge) return { available: false, error: 'Chia sẻ cần bản iOS riêng có extension. Expo Go không hỗ trợ nhận từ bảng chia sẻ.' };
  try { const status = await nativeImportBridge.sharedInboxStatus(); if (typeof status?.available !== 'boolean' || typeof status.error !== 'string') throw new Error('Không đọc được trạng thái vùng dữ liệu chia sẻ.'); return status; }
  catch (error) { return { available: false, error: error instanceof Error ? error.message : 'Không truy cập được vùng dữ liệu chia sẻ. Nội dung gốc được giữ.' }; }
}
export const isNativeImportAvailable = () => nativeImportBridge !== null;
export function observeNativeImports(listener: () => void): () => void {
  const subscription = nativeImportBridge?.addListener('inboxChanged', listener);
  return () => subscription?.remove();
}
export async function recognizeImportImage(camera: boolean): Promise<OcrResult | null> {
  if (!nativeImportBridge) throw new Error('OCR cần bản iOS riêng; Expo Go chưa có module Apple Vision. Bạn vẫn có thể dán nội dung.');
  const permission = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error('Chưa được cấp quyền dùng ảnh / camera. Bản nháp được giữ; cấp quyền trong Cài đặt hoặc dán văn bản.');
  await nativeImportBridge.clearOcrCacheAsync();
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: false, quality: 1, exif: false, base64: false };
  const selected = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (selected.canceled) return null;
  const asset = selected.assets[0];
  let owned: File | null = null;
  try {
    if (!asset || !asset.uri.startsWith('file://') || (asset.fileSize ?? 0) > 20 * 1024 * 1024 || asset.width <= 0 || asset.height <= 0 || asset.width > 40_000_000 / asset.height) throw new Error('Chọn một ảnh trên điện thoại tối đa 20 MB và 40 megapixel. Bản nháp được giữ.');
    const source = new File(asset.uri);
    if (source.size <= 0 || source.size > 20 * 1024 * 1024) throw new Error('Ảnh không hợp lệ hoặc vượt 20 MB. Bản nháp được giữ.');
    const directory = new Directory(Paths.cache, 'SoViOCR'); directory.create({ intermediates: true, idempotent: true });
    owned = new File(directory, `${Date.now()}-${Math.random().toString(36).slice(2)}.image`);
    source.copy(owned); return await nativeImportBridge.recognizeTextAsync(owned.uri);
  } finally {
    try { if (owned?.exists) owned.delete(); }
    finally { if (asset) await nativeImportBridge.removeImageCopyAsync(asset.uri); }
  }
}
