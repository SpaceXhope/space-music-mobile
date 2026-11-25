import type { ProviderId } from "@/domain/music";

function normalizeUrl(rawUrl: string): URL {
  const trimmed = rawUrl.trim();
  if (!trimmed) throw new Error("Вставьте ссылку на музыку.");
  const value = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Ссылка имеет неверный формат.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Поддерживаются только HTTP и HTTPS ссылки.");
  }
  return url;
}

function matches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

export function detectProvider(rawUrl: string): {
  provider: ProviderId;
  url: string;
} {
  const url = normalizeUrl(rawUrl);
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (matches(host, "soundcloud.com")) {
    return { provider: "soundcloud", url: url.toString() };
  }
  if (
    matches(host, "spotify.com") ||
    host === "spotify.link" ||
    host.endsWith(".spotify.link")
  ) {
    return { provider: "spotify", url: url.toString() };
  }
  if (matches(host, "vk.com") || matches(host, "vk.ru")) {
    return { provider: "vk", url: url.toString() };
  }
  throw new Error("Эта площадка пока не поддерживается.");
}
