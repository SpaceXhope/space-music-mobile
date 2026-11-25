import { describe, expect, it } from "vitest";
import type { MusicTrack } from "@/domain/music";
import {
  buildTrackShareText,
  buildTrackShareUrl,
  canonicalTrackId,
  isCatalogTrackId,
} from "@/domain/share";

function track(overrides: Partial<MusicTrack> = {}): MusicTrack {
  return {
    id: "local-random-sqlite-id",
    provider: "soundcloud",
    sourceId: "sc:1851039261",
    title: "Internet Love (slowed)",
    artists: ["Ivoxygen"],
    matchStatus: "ready",
    ...overrides,
  };
}

describe("mobile track sharing", () => {
  it("uses the canonical provider id and URL-encodes it", () => {
    expect(canonicalTrackId(track())).toBe("sc:1851039261");
    expect(buildTrackShareUrl("sc:1851039261")).toBe(
      "https://spacemusic-links.pages.dev/track?id=sc%3A1851039261",
    );
    expect(buildTrackShareText(track())).toContain(
      "SpaceMusic — Internet Love (slowed) — Ivoxygen\nhttps://spacemusic-links.pages.dev/track?id=sc%3A1851039261",
    );
  });

  it("never exposes a local SQLite id as a public catalog link", () => {
    const local = track({ provider: "spotify", sourceId: "spotify-track" });
    expect(canonicalTrackId(local)).toBeNull();
    expect(buildTrackShareText(local)).toBeNull();
  });

  it("accepts only deeplink-compatible catalog track ids", () => {
    expect(isCatalogTrackId("RGdkabupfPI")).toBe(true);
    expect(isCatalogTrackId("sc:1851039261")).toBe(true);
    expect(isCatalogTrackId("local-random-sqlite-id")).toBe(false);
    expect(isCatalogTrackId("sc:123/other")).toBe(false);
  });
});
