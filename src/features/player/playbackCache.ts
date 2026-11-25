/**
 * Resolved stream URLs are reused between plays.
 *
 * A playback URL lives for a few minutes; asking the API for it again on every
 * replay, queue jump and previous-track tap cost a full signed round trip and
 * was the main reason a track took seconds to start on mobile.
 */
export interface CachedPlayback {
  url: string;
  expiresAt?: string;
}

const STORE = new Map<string, CachedPlayback>();
/** Stay well clear of the server-side expiry so playback never starts dead. */
export const EXPIRY_GUARD_MS = 45_000;
const MAX_ENTRIES = 200;

function isFresh(entry: CachedPlayback): boolean {
  if (!entry.expiresAt) return true;
  const expiresAt = Date.parse(entry.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt - Date.now() > EXPIRY_GUARD_MS;
}

export function cachePlayback(id: string, entry: CachedPlayback): void {
  if (!entry.url) return;
  if (STORE.size >= MAX_ENTRIES) {
    const oldest = STORE.keys().next();
    if (!oldest.done) STORE.delete(oldest.value);
  }
  STORE.set(id, entry);
}

export function cachedPlayback(id: string): CachedPlayback | null {
  const entry = STORE.get(id);
  if (!entry) return null;
  if (!isFresh(entry)) {
    STORE.delete(id);
    return null;
  }
  return entry;
}

export function forgetPlayback(id?: string): void {
  if (id) STORE.delete(id);
  else STORE.clear();
}

/** Rehydrate the cache from disk (called once at startup). */
export function hydratePlaybackCache(
  entries: [string, CachedPlayback][] | Record<string, CachedPlayback>,
): void {
  const source = Array.isArray(entries) ? entries : Object.entries(entries);
  for (const [id, entry] of source) {
    if (id && entry && typeof entry.url === "string" && isFresh(entry)) {
      STORE.set(id, entry);
    }
  }
}

/** Snapshot for persistence. */
export function playbackCacheSnapshot(): Record<string, CachedPlayback> {
  const out: Record<string, CachedPlayback> = {};
  for (const [id, entry] of STORE) {
    if (isFresh(entry)) out[id] = entry;
  }
  return out;
}
