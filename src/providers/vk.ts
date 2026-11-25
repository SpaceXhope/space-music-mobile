import type { ImportedPlaylist, ImportedTrack } from "@/domain/music";

const API = "https://api.vk.com/method";
const API_VERSION = "5.199";
const PAGE_SIZE = 1000;
const MAX_TRACKS = 10_000;

interface VkError {
  error_code?: number;
  error_msg?: string;
}

interface Envelope<T> {
  response?: T;
  error?: VkError;
}

interface PlaylistResponse {
  title?: string;
  description?: string;
  photo?: { photo_1200?: string; photo_600?: string; photo_300?: string };
}

interface AudioItem {
  id?: number;
  owner_id?: number;
  title?: string;
  artist?: string;
  duration?: number;
  main_artists?: { name?: string }[];
  album?: {
    title?: string;
    thumb?: { photo_1200?: string; photo_600?: string; photo_300?: string };
  };
}

interface AudioPage {
  count?: number;
  items?: AudioItem[];
}

interface PlaylistRef {
  ownerId: string;
  playlistId: string;
  accessKey?: string;
}

function parseReference(rawUrl: string): PlaylistRef {
  const url = new URL(rawUrl);
  const values = [
    url.pathname,
    decodeURIComponent(url.searchParams.get("z") ?? ""),
  ];
  for (const value of values) {
    const match = value.match(
      /(?:audio_playlist|music\/playlist\/)(-?\d+)_(\d+)(?:_([a-zA-Z0-9_-]+))?/,
    );
    if (match) {
      return {
        ownerId: match[1],
        playlistId: match[2],
        ...(match[3] ? { accessKey: match[3] } : {}),
      };
    }
  }
  throw new Error("Нужна ссылка именно на плейлист VK.");
}

function cover(photo: PlaylistResponse["photo"]): string | undefined {
  return photo?.photo_1200 || photo?.photo_600 || photo?.photo_300;
}

async function request<T>(
  method: string,
  token: string,
  params: Record<string, string>,
): Promise<T> {
  const body = new URLSearchParams({
    ...params,
    access_token: token,
    v: API_VERSION,
  });
  const response = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body: body.toString(),
  });
  if (!response.ok) throw new Error(`VK API недоступен (${response.status}).`);
  const envelope = (await response.json()) as Envelope<T>;
  if (envelope.error) {
    throw new Error(
      `VK API ${envelope.error.error_code ?? "?"}: ${envelope.error.error_msg ?? "запрос отклонён"}`,
    );
  }
  if (envelope.response === undefined)
    throw new Error("VK вернул пустой ответ.");
  return envelope.response;
}

function mapTrack(item: AudioItem): ImportedTrack | null {
  if (
    !Number.isFinite(item.id) ||
    !Number.isFinite(item.owner_id) ||
    !item.title?.trim()
  ) {
    return null;
  }
  const structuredArtists = (item.main_artists ?? [])
    .map((artist) => artist.name?.trim())
    .filter((artist): artist is string => Boolean(artist));
  const artists =
    structuredArtists.length > 0
      ? structuredArtists
      : item.artist?.trim()
        ? [item.artist.trim()]
        : ["Unknown artist"];
  return {
    provider: "vk",
    sourceId: `vk:${item.owner_id}_${item.id}`,
    title: item.title.trim(),
    artists,
    ...(item.album?.title?.trim() ? { album: item.album.title.trim() } : {}),
    ...(item.duration && item.duration > 0
      ? { durationMs: Math.round(item.duration * 1000) }
      : {}),
    ...(cover(item.album?.thumb) ? { coverUrl: cover(item.album?.thumb) } : {}),
    matchStatus: "needs_match",
  };
}

export async function importVk(
  rawUrl: string,
  accessToken: string | null,
): Promise<ImportedPlaylist> {
  if (!accessToken?.trim()) {
    throw new Error("Сначала сохраните токен VK в настройках.");
  }
  const reference = parseReference(rawUrl);
  const common = {
    owner_id: reference.ownerId,
    playlist_id: reference.playlistId,
    album_id: reference.playlistId,
    ...(reference.accessKey ? { access_key: reference.accessKey } : {}),
  };
  const playlist = await request<PlaylistResponse>(
    "audio.getPlaylistById",
    accessToken,
    common,
  );
  const tracks: ImportedTrack[] = [];
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;
  while (offset < total && tracks.length < MAX_TRACKS) {
    const page = await request<AudioPage>("audio.get", accessToken, {
      ...common,
      count: String(PAGE_SIZE),
      offset: String(offset),
    });
    const items = Array.isArray(page.items) ? page.items : [];
    if (Number.isFinite(page.count)) total = Number(page.count);
    tracks.push(
      ...items
        .map(mapTrack)
        .filter((track): track is ImportedTrack => Boolean(track)),
    );
    if (items.length === 0) break;
    offset += items.length;
  }
  if (tracks.length === 0) {
    throw new Error(
      "VK не вернул треки. Проверьте доступ токена и приватность плейлиста.",
    );
  }
  return {
    provider: "vk",
    sourceUrl: rawUrl,
    title: playlist.title?.trim() || "VK playlist",
    ...(playlist.description?.trim()
      ? { description: playlist.description.trim() }
      : {}),
    ...(cover(playlist.photo) ? { coverUrl: cover(playlist.photo) } : {}),
    tracks,
  };
}
