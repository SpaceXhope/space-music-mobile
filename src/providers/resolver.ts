import type { ImportedPlaylist, ImportedTrack } from "@/domain/music";
import { credentials } from "@/storage/credentials";

interface ResolveResponse {
  playbackUrl?: string;
  title?: string;
  artists?: string[];
  album?: string;
  durationMs?: number;
  coverUrl?: string;
}

async function resolveTrack(
  baseUrl: string,
  token: string | null,
  track: ImportedTrack,
): Promise<ImportedTrack> {
  const response = await fetch(
    `${baseUrl.replace(/\/+$/, "")}/v1/resolve-track`,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        provider: track.provider,
        sourceId: track.sourceId,
        sourceUrl: track.sourceUrl,
        title: track.title,
        artists: track.artists,
        album: track.album,
        durationMs: track.durationMs,
        coverUrl: track.coverUrl,
      }),
    },
  );
  if (!response.ok) return track;
  const resolved = (await response.json()) as ResolveResponse;
  if (!resolved.playbackUrl) return track;
  return {
    ...track,
    title: resolved.title?.trim() || track.title,
    artists: resolved.artists?.filter(Boolean).length
      ? resolved.artists
      : track.artists,
    album: resolved.album ?? track.album,
    durationMs: resolved.durationMs ?? track.durationMs,
    coverUrl: resolved.coverUrl ?? track.coverUrl,
    playbackUrl: resolved.playbackUrl,
    matchStatus: "ready",
  };
}

async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const output = Array.from({ length: items.length }) as R[];
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await run(items[index]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return output;
}

export async function resolveImportedPlaylist(
  playlist: ImportedPlaylist,
): Promise<ImportedPlaylist> {
  const baseUrl = await credentials.getResolverUrl();
  if (!baseUrl) return playlist;
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    return playlist;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
    return playlist;
  const token = await credentials.getResolverToken();
  const tracks = await mapConcurrent(playlist.tracks, 3, (track) =>
    resolveTrack(baseUrl, token, track).catch(() => track),
  );
  return { ...playlist, tracks };
}
