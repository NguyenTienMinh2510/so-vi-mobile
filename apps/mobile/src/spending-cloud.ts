import * as SecureStore from 'expo-secure-store';
import { cloudUnavailable, completeCloud, fastWithSettings, thinkWithSettings, validateCloudSettings, type CloudSettings } from './spending-cloud-core';
import type { ThinkingRequest, VenueContext } from './spending-thinking';
import type { MealOption } from './spending';

const KEY = 'so-vi.ai-worker';
export async function loadCloudSettings(): Promise<CloudSettings | null> {
  const saved = await SecureStore.getItemAsync(KEY);
  return saved ? validateCloudSettings(JSON.parse(saved)) : null;
}
export async function saveCloudSettings(settings: CloudSettings) {
  await SecureStore.setItemAsync(KEY, JSON.stringify(validateCloudSettings(settings)), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
}
async function settings() { return await loadCloudSettings() ?? Promise.reject(cloudUnavailable()); }
export async function cloudThink(request: ThinkingRequest, catalog: MealOption[], signal?: AbortSignal) {
  return thinkWithSettings(await settings(), request, catalog, signal);
}
export async function cloudFast(text: string, catalog: MealOption[], venues: VenueContext = [], aliases: string[][] = [], signal?: AbortSignal) {
  return fastWithSettings(await settings(), text, catalog, venues, aliases, signal);
}
export async function checkCloudConnection(config: CloudSettings, signal?: AbortSignal) {
  await completeCloud(config, 'fast', { messages: [{ role: 'user', content: 'Return {} as JSON.' }] }, signal);
}
