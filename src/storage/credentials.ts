import * as SecureStore from "expo-secure-store";

const KEYS = {
  vkToken: "space-music.vk-access-token",
  resolverUrl: "space-music.resolver-url",
  resolverToken: "space-music.resolver-token",
} as const;

async function read(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function write(key: string, value: string): Promise<void> {
  const normalized = value.trim();
  if (!normalized) {
    await SecureStore.deleteItemAsync(key);
    return;
  }
  await SecureStore.setItemAsync(key, normalized, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export const credentials = {
  getVkToken: () => read(KEYS.vkToken),
  setVkToken: (value: string) => write(KEYS.vkToken, value),
  clearVkToken: () => SecureStore.deleteItemAsync(KEYS.vkToken),
  getResolverUrl: () => read(KEYS.resolverUrl),
  setResolverUrl: (value: string) => write(KEYS.resolverUrl, value),
  getResolverToken: () => read(KEYS.resolverToken),
  setResolverToken: (value: string) => write(KEYS.resolverToken, value),
};
