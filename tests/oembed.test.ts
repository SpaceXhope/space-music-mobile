import { afterEach, describe, expect, it, vi } from "vitest";
import { importSoundCloud } from "@/providers/oembed";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SoundCloud oEmbed import", () => {
  it("stores the numeric catalog id instead of the page path", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            title: "Ivoxygen - Internet Love (slowed)",
            author_name: "amtrsss",
            thumbnail_url: "https://i1.sndcdn.com/art.jpg",
            html: '<iframe src="https://w.soundcloud.com/player/?url=https%3A%2F%2Fapi.soundcloud.com%2Ftracks%2F1851039261"></iframe>',
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    const imported = await importSoundCloud(
      "https://soundcloud.com/amtrsss/ivoxygen-internet-love-slowed",
    );

    expect(imported.tracks[0]?.sourceId).toBe("sc:1851039261");
  });

  it("does not fall back to an unplayable URL-derived id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ title: "Track", author_name: "Artist" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(
      importSoundCloud("https://soundcloud.com/artist/track"),
    ).rejects.toThrow("идентификатор трека");
  });
});
