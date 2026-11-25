import type { ImportedPlaylist } from "@/domain/music";
import { credentials } from "@/storage/credentials";
import { detectProvider } from "./detect";
import { importSoundCloud, importSpotify } from "./oembed";
import { resolveImportedPlaylist } from "./resolver";
import { importVk } from "./vk";

export { detectProvider } from "./detect";

export async function importProviderUrl(
  rawUrl: string,
): Promise<ImportedPlaylist> {
  const detected = detectProvider(rawUrl);
  let playlist: ImportedPlaylist;
  switch (detected.provider) {
    case "soundcloud":
      playlist = await importSoundCloud(detected.url);
      break;
    case "spotify":
      playlist = await importSpotify(detected.url);
      break;
    case "vk":
      playlist = await importVk(detected.url, await credentials.getVkToken());
      break;
    default:
      throw new Error("Этот источник не поддерживается локальным импортом.");
  }
  return resolveImportedPlaylist(playlist);
}
