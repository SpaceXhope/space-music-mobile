import * as Crypto from "expo-crypto";
import type { SQLiteDatabase } from "expo-sqlite";
import type {
  ImportedPlaylist,
  MusicPlaylist,
  MusicTrack,
  PlaylistWithTracks,
  ProviderId,
  MatchStatus,
} from "@/domain/music";

const DATABASE_VERSION = 2;

interface PlaylistRow {
  id: string;
  provider: ProviderId;
  source_url: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  track_count: number;
  created_at: string;
}

interface TrackRow {
  id: string;
  provider: ProviderId;
  source_id: string;
  source_url: string | null;
  title: string;
  artists_json: string;
  album: string | null;
  duration_ms: number | null;
  cover_url: string | null;
  playback_url: string | null;
  match_status: MatchStatus;
}

function playlistFromRow(row: PlaylistRow): MusicPlaylist {
  return {
    id: row.id,
    provider: row.provider,
    sourceUrl: row.source_url,
    title: row.title,
    ...(row.description ? { description: row.description } : {}),
    ...(row.cover_url ? { coverUrl: row.cover_url } : {}),
    trackCount: row.track_count,
    createdAt: row.created_at,
  };
}

function trackFromRow(row: TrackRow): MusicTrack {
  let artists: string[] = [];
  try {
    const value: unknown = JSON.parse(row.artists_json);
    if (Array.isArray(value)) {
      artists = value.filter(
        (artist): artist is string => typeof artist === "string",
      );
    }
  } catch {}
  return {
    id: row.id,
    provider: row.provider,
    sourceId: row.source_id,
    ...(row.source_url ? { sourceUrl: row.source_url } : {}),
    title: row.title,
    artists: artists.length > 0 ? artists : ["Unknown artist"],
    ...(row.album ? { album: row.album } : {}),
    ...(row.duration_ms ? { durationMs: row.duration_ms } : {}),
    ...(row.cover_url ? { coverUrl: row.cover_url } : {}),
    ...(row.playback_url ? { playbackUrl: row.playback_url } : {}),
    matchStatus: row.match_status,
  };
}

export async function migrateDatabase(db: SQLiteDatabase): Promise<void> {
  const version = await db.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version",
  );
  const currentVersion = version?.user_version ?? 0;

  if (currentVersion < 1)
    await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS playlists (
      id TEXT PRIMARY KEY NOT NULL,
      provider TEXT NOT NULL,
      source_url TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      cover_url TEXT,
      track_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tracks (
      id TEXT PRIMARY KEY NOT NULL,
      provider TEXT NOT NULL,
      source_id TEXT NOT NULL,
      source_url TEXT,
      title TEXT NOT NULL,
      artists_json TEXT NOT NULL,
      album TEXT,
      duration_ms INTEGER,
      cover_url TEXT,
      playback_url TEXT,
      match_status TEXT NOT NULL,
      UNIQUE(provider, source_id)
    );
    CREATE TABLE IF NOT EXISTS playlist_tracks (
      playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
      track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      PRIMARY KEY (playlist_id, position)
    );
    CREATE INDEX IF NOT EXISTS idx_playlist_tracks_track
      ON playlist_tracks(track_id);
  `);
  if (currentVersion < 2)
    await db.execAsync(`
    CREATE TABLE IF NOT EXISTS sync_cache (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION};`);
}

export async function writeSyncCache(
  db: SQLiteDatabase,
  key: string,
  value: unknown,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO sync_cache (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    key,
    JSON.stringify(value),
    Date.now(),
  );
}

export async function readSyncCache<T>(
  db: SQLiteDatabase,
  key: string,
): Promise<T | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM sync_cache WHERE key = ?",
    key,
  );
  if (!row) return null;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return null;
  }
}

export async function saveImportedPlaylist(
  db: SQLiteDatabase,
  imported: ImportedPlaylist,
): Promise<string> {
  const playlistId = Crypto.randomUUID();
  const createdAt = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO playlists
        (id, provider, source_url, title, description, cover_url, track_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      playlistId,
      imported.provider,
      imported.sourceUrl,
      imported.title,
      imported.description ?? null,
      imported.coverUrl ??
        imported.tracks.find((track) => track.coverUrl)?.coverUrl ??
        null,
      imported.tracks.length,
      createdAt,
    );

    for (let position = 0; position < imported.tracks.length; position += 1) {
      const track = imported.tracks[position];
      const existing = await db.getFirstAsync<{ id: string }>(
        "SELECT id FROM tracks WHERE provider = ? AND source_id = ?",
        track.provider,
        track.sourceId,
      );
      const trackId = existing?.id ?? Crypto.randomUUID();
      await db.runAsync(
        `INSERT INTO tracks
          (id, provider, source_id, source_url, title, artists_json, album,
           duration_ms, cover_url, playback_url, match_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(provider, source_id) DO UPDATE SET
           source_url = excluded.source_url,
           title = excluded.title,
           artists_json = excluded.artists_json,
           album = excluded.album,
           duration_ms = excluded.duration_ms,
           cover_url = excluded.cover_url,
           playback_url = COALESCE(excluded.playback_url, tracks.playback_url),
           match_status = CASE
             WHEN excluded.playback_url IS NOT NULL THEN 'ready'
             ELSE tracks.match_status
           END`,
        trackId,
        track.provider,
        track.sourceId,
        track.sourceUrl ?? null,
        track.title,
        JSON.stringify(track.artists),
        track.album ?? null,
        track.durationMs ?? null,
        track.coverUrl ?? null,
        track.playbackUrl ?? null,
        track.playbackUrl ? "ready" : (track.matchStatus ?? "needs_match"),
      );
      const persisted = await db.getFirstAsync<{ id: string }>(
        "SELECT id FROM tracks WHERE provider = ? AND source_id = ?",
        track.provider,
        track.sourceId,
      );
      if (!persisted) throw new Error("Failed to persist imported track.");
      await db.runAsync(
        "INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)",
        playlistId,
        persisted.id,
        position,
      );
    }
  });
  return playlistId;
}

export async function listPlaylists(
  db: SQLiteDatabase,
): Promise<MusicPlaylist[]> {
  const rows = await db.getAllAsync<PlaylistRow>(
    "SELECT * FROM playlists ORDER BY created_at DESC",
  );
  return rows.map(playlistFromRow);
}

export async function getPlaylist(
  db: SQLiteDatabase,
  playlistId: string,
): Promise<PlaylistWithTracks | null> {
  const playlist = await db.getFirstAsync<PlaylistRow>(
    "SELECT * FROM playlists WHERE id = ?",
    playlistId,
  );
  if (!playlist) return null;
  const tracks = await db.getAllAsync<TrackRow>(
    `SELECT tracks.*
       FROM playlist_tracks
       JOIN tracks ON tracks.id = playlist_tracks.track_id
      WHERE playlist_tracks.playlist_id = ?
      ORDER BY playlist_tracks.position`,
    playlistId,
  );
  return { ...playlistFromRow(playlist), tracks: tracks.map(trackFromRow) };
}
