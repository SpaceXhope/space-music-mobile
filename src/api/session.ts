import * as SecureStore from "expo-secure-store";
import type { AuthSession } from "./contracts";

const SESSION_KEY = "space-music.auth-session.v1";
let memorySession: AuthSession | null | undefined;
let readPromise: Promise<AuthSession | null> | null = null;
let writePromise: Promise<void> = Promise.resolve();

export function isAuthSession(value: unknown): value is AuthSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<AuthSession>;
  return typeof session.accessToken === "string" && session.accessToken.length > 0 &&
    typeof session.refreshToken === "string" && session.refreshToken.length > 0 &&
    typeof session.user?.id === "string" && session.user.id.length > 0;
}

export async function getSession(): Promise<AuthSession | null> {
  await writePromise;
  if (memorySession !== undefined) return memorySession;
  if (readPromise) return readPromise;
  readPromise = (async () => {
    try {
      const raw = await SecureStore.getItemAsync(SESSION_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      memorySession = isAuthSession(parsed) ? parsed : null;
      return memorySession;
    } finally {
      readPromise = null;
    }
  })();
  return readPromise;
}

export function setSession(session: AuthSession | null): Promise<void> {
  if (session !== null && !isAuthSession(session)) return Promise.reject(new Error("Сервер прислал некорректную сессию входа."));
  const operation = writePromise.then(async () => {
    if (readPromise) await readPromise.catch(() => undefined);
    if (session) {
      await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session), {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      });
    } else await SecureStore.deleteItemAsync(SESSION_KEY);
    memorySession = session;
  });
  writePromise = operation.catch(() => undefined);
  return operation;
}

export function sessionExpiry(session: AuthSession): number | null {
  const value = session.accessTokenExpiresAt || session.expiresAt;
  if (!value) return null;
  const parsed = typeof value === "number" ? value : new Date(value).getTime();
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed < 10_000_000_000 ? parsed * 1000 : parsed;
}
