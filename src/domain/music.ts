import type { ApiTrack, UserPlaylist } from "@/api/contracts";

export type ProviderId = "space" | "soundcloud" | "spotify" | "vk";

export type MatchStatus = "ready" | "needs_match" | "unavailable";

export interface MusicTrack {
  id: string;
  provider: ProviderId;
  sourceId: string;
  sourceUrl?: string;
  title: string;
  artists: string[];
  album?: string;
  durationMs?: number;
  coverUrl?: string;
  playbackUrl?: string;
  playbackExpiresAt?: string;
  matchStatus: MatchStatus;
  liked?: boolean;
  likedAt?: string;
  playlistItemId?: string;
  snapshot?: ApiTrack;
}

export interface MusicPlaylist {
  id: string;
  provider: ProviderId;
  sourceUrl: string;
  title: string;
  description?: string;
  coverUrl?: string;
  trackCount: number;
  createdAt: string;
  remote?: UserPlaylist;
}

export interface PlaylistWithTracks extends MusicPlaylist {
  tracks: MusicTrack[];
}

export interface ImportedTrack extends Omit<MusicTrack, "id" | "matchStatus"> {
  matchStatus?: MatchStatus;
}

export interface ImportedPlaylist {
  provider: ProviderId;
  sourceUrl: string;
  title: string;
  description?: string;
  coverUrl?: string;
  tracks: ImportedTrack[];
}

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  space: "Space Music",
  soundcloud: "SoundCloud",
  spotify: "Spotify",
  vk: "VK Music",
};

export const PROVIDER_COLORS: Record<ProviderId, readonly [string, string]> = {
  space: ["#7455ed", "#c87cff"],
  soundcloud: ["#ff7a18", "#d9480f"],
  spotify: ["#24d366", "#087f3f"],
  vk: ["#3390ec", "#1456a0"],
};

export function trackFromApi(
  track: ApiTrack,
  extra: Partial<MusicTrack> = {},
): MusicTrack {
  return {
    id: track.id,
    provider: "space",
    sourceId: track.id,
    title: track.title,
    artists: track.artists.map((artist) => artist.name).filter(Boolean),
    ...(track.album?.title ? { album: track.album.title } : {}),
    durationMs: track.durationMs,
    ...(track.cover?.url ? { coverUrl: track.cover.url } : {}),
    matchStatus: "ready",
    liked: track.viewer?.liked,
    snapshot: track,
    ...extra,
  };
}

export function playlistFromApi(playlist: UserPlaylist): MusicPlaylist {
  return {
    id: playlist.id,
    provider: "space",
    sourceUrl: "",
    title: playlist.title,
    ...(playlist.description ? { description: playlist.description } : {}),
    ...(playlist.coverUrls?.[0] ? { coverUrl: playlist.coverUrls[0] } : {}),
    trackCount: playlist.trackCount ?? 0,
    createdAt: playlist.createdAt,
    remote: playlist,
  };
}
