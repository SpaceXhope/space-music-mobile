import type { SQLiteDatabase } from "expo-sqlite";
import { readSyncCache, writeSyncCache } from "@/storage/database";

export interface WallpaperSettings {
  uri: string;
  width: number;
  height: number;
  /** 0–100, where 50 re-centres the cover. Only meaningful for "cover". */
  positionX: number;
  positionY: number;
  fit: "cover" | "contain";
}

export const WALLPAPER_STORE_KEY = "player-wallpaper-v1";

export const DEFAULT_WALLPAPER: WallpaperSettings = {
  uri: "",
  width: 0,
  height: 0,
  positionX: 50,
  positionY: 50,
  fit: "cover",
};

export async function loadWallpaper(
  db: SQLiteDatabase,
): Promise<WallpaperSettings | null> {
  const stored = await readSyncCache<Partial<WallpaperSettings>>(
    db,
    WALLPAPER_STORE_KEY,
  );
  if (!stored || typeof stored.uri !== "string" || stored.uri.length === 0) {
    return null;
  }
  return {
    ...DEFAULT_WALLPAPER,
    ...stored,
    positionX: clampPercent(stored.positionX),
    positionY: clampPercent(stored.positionY),
    fit: stored.fit === "contain" ? "contain" : "cover",
  };
}

export async function saveWallpaper(
  db: SQLiteDatabase,
  settings: WallpaperSettings,
): Promise<void> {
  await writeSyncCache(db, WALLPAPER_STORE_KEY, settings);
}

export async function clearWallpaper(db: SQLiteDatabase): Promise<void> {
  await writeSyncCache(db, WALLPAPER_STORE_KEY, {
    ...DEFAULT_WALLPAPER,
    uri: "",
  });
}

function clampPercent(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 50;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}