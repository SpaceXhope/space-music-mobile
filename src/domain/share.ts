import type { MusicTrack } from "./music";

export const TRACK_SHARE_BASE_URL = "https://spacemusic-links.pages.dev";

const CATALOG_TRACK_ID = /^(?:[A-Za-z0-9_-]{11}|sc:\d{1,20})$/;

export function isCatalogTrackId(value: unknown): value is string {
  return typeof value === "string" && CATALOG_TRACK_ID.test(value);
}

/** Returns only IDs the public link and catalog playback routes understand. */
export function canonicalTrackId(track: MusicTrack): string | null {
  const candidates = [
    track.snapshot?.id,
    track.provider === "soundcloud" ? track.sourceId : undefined,
    track.provider === "space" ? track.sourceId : undefined,
    track.provider === "space" ? track.id : undefined,
  ];
  return candidates.find(isCatalogTrackId) ?? null;
}

export function buildTrackShareUrl(id: string): string | null {
  if (!isCatalogTrackId(id)) return null;
  return `${TRACK_SHARE_BASE_URL}/track?id=${encodeURIComponent(id)}`;
}

export function buildTrackShareText(track: MusicTrack): string | null {
  const id = canonicalTrackId(track);
  const url = id ? buildTrackShareUrl(id) : null;
  if (!url) return null;
  const details = [track.title, track.artists.join(", ")]
    .map((value) => value.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return `SpaceMusic — ${details.join(" — ")}\n${url}`;
}
