import type {
  ImportedPlaylist,
  ImportedTrack,
  ProviderId,
} from "@/domain/music";

interface OEmbedResponse {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
  html?: string;
}

function sourceId(url: URL): string {
  return `${url.hostname}${url.pathname}`.replace(/\/+$/, "");
}

function singleTrack(
  provider: ProviderId,
  rawUrl: string,
  data: OEmbedResponse,
  canonicalSourceId?: string,
): ImportedPlaylist {
  const url = new URL(rawUrl);
  const title = data.title?.trim() || "Imported track";
  const artists = data.author_name?.trim()
    ? [data.author_name.trim()]
    : [provider === "spotify" ? "Spotify artist" : "SoundCloud artist"];
  const track: ImportedTrack = {
    provider,
    sourceId: canonicalSourceId ?? sourceId(url),
    sourceUrl: rawUrl,
    title,
    artists,
    ...(data.thumbnail_url ? { coverUrl: data.thumbnail_url } : {}),
    matchStatus: "needs_match",
  };
  return {
    provider,
    sourceUrl: rawUrl,
    title,
    ...(data.thumbnail_url ? { coverUrl: data.thumbnail_url } : {}),
    tracks: [track],
  };
}

function soundCloudSourceId(data: OEmbedResponse): string | null {
  const html = data.html ?? "";
  const encoded = html.match(
    /api\.soundcloud\.com(?:\/|%2f)tracks(?:\/|%2f)(\d{1,20})/i,
  );
  if (encoded?.[1]) return `sc:${encoded[1]}`;
  try {
    const decoded = decodeURIComponent(html);
    const plain = decoded.match(
      /api\.soundcloud\.com\/tracks\/(\d{1,20})/i,
    );
    return plain?.[1] ? `sc:${plain[1]}` : null;
  } catch {
    return null;
  }
}

async function fetchOEmbed(endpoint: string): Promise<OEmbedResponse> {
  const response = await fetch(endpoint, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Площадка не вернула данные (${response.status}).`);
  }
  return (await response.json()) as OEmbedResponse;
}

export async function importSoundCloud(
  rawUrl: string,
): Promise<ImportedPlaylist> {
  const url = new URL(rawUrl);
  if (url.pathname.includes("/sets/") || url.pathname.endsWith("/likes")) {
    throw new Error(
      "Для плейлистов SoundCloud нужен client ID в сервисе сопоставления. Отдельный трек уже можно импортировать.",
    );
  }
  const endpoint = new URL("https://soundcloud.com/oembed");
  endpoint.searchParams.set("format", "json");
  endpoint.searchParams.set("url", rawUrl);
  const data = await fetchOEmbed(endpoint.toString());
  const canonicalSourceId = soundCloudSourceId(data);
  if (!canonicalSourceId) {
    throw new Error("SoundCloud не вернул идентификатор трека.");
  }
  return singleTrack("soundcloud", rawUrl, data, canonicalSourceId);
}

export async function importSpotify(rawUrl: string): Promise<ImportedPlaylist> {
  const url = new URL(rawUrl);
  const parts = url.pathname.split("/").filter(Boolean);
  const entityIndex = parts.findIndex((part) =>
    ["track", "album", "playlist"].includes(part),
  );
  const entity = entityIndex >= 0 ? parts[entityIndex] : undefined;
  if (entity !== "track") {
    throw new Error(
      "Полный плейлист Spotify импортируется через Windows-клиент или собственный resolver с Spotify OAuth. На Android сейчас доступен отдельный трек.",
    );
  }
  const endpoint = new URL("https://open.spotify.com/oembed");
  endpoint.searchParams.set("url", rawUrl);
  return singleTrack("spotify", rawUrl, await fetchOEmbed(endpoint.toString()));
}
