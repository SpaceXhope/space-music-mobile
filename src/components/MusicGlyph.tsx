import Svg, { Path } from "react-native-svg";

export type MusicGlyphKind =
  | "play"
  | "pause"
  | "previous"
  | "next"
  | "shuffle"
  | "repeat"
  | "repeat-one"
  | "queue"
  | "lyrics"
  | "like"
  | "like-filled"
  | "close"
  | "home"
  | "search"
  | "library"
  | "settings"
  | "room"
  | "share"
  | "more";

/**
 * One glyph set for the whole mobile UI.
 *
 * The path data is identical to the desktop player icons
 * (`src/shared/ui/icons/MobileMusicIcons.tsx`), so a control drawn on the phone
 * has the same silhouette and stroke weight as the one on the PC. Text glyphs
 * such as "|◀" or "⇄" rendered on different baselines, which is what made the
 * mobile transport look crooked next to the desktop one.
 */
const glyphPaths: Record<MusicGlyphKind, string> = {
  play: "M9 5 19 12 9 19Z",
  pause: "M8 5v14M16 5v14",
  previous: "M6 5v14M18 5 8 12l10 7Z",
  next: "M18 5v14M6 5l10 7-10 7Z",
  shuffle: "M4 6h3l10 12h3M17 15l3 3-3 3M4 18h3l4-5M13 10l4-4h3M17 3l3 3-3 3",
  repeat: "M5 8h14l-3-3M19 8v6M19 16H5l3 3M5 16v-6",
  "repeat-one": "M5 8h14l-3-3M19 8v6M19 16H5l3 3M5 16v-6M11 10l1-1v6",
  queue: "M4 7h16M4 12h16M4 17h10",
  lyrics: "M5 6h11M5 11h14M5 16h9M18 16v3",
  like: "M12 20s-7-4.35-7-9.5A4 4 0 0 1 12 7a4 4 0 0 1 7 3.5C19 15.65 12 20 12 20Z",
  "like-filled": "M12 20s-7-4.35-7-9.5A4 4 0 0 1 12 7a4 4 0 0 1 7 3.5C19 15.65 12 20 12 20Z",
  close: "M6 9l6 6 6-6",
  home: "M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1Z",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM16.5 16.5 21 21",
  library: "M5 5v14M10 5v14M14 6l5 13",
  settings:
    "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4",
  room: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM4 20v-1a5 5 0 0 1 10 0v1M16 7.5a2.5 2.5 0 0 1 0 5M17.5 20v-1a4 4 0 0 0-1.8-3.3",
  share:
    "M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6M6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6M8.6 13.5l6.8 4M15.4 6.5l-6.8 4",
  more: "M6 12h.01M12 12h.01M18 12h.01",
};

const FILLED = new Set<MusicGlyphKind>(["play", "like-filled", "more"]);

export function MusicGlyph({
  kind,
  size = 24,
  color = "#f4f7fb",
  strokeWidth,
}: {
  kind: MusicGlyphKind;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  const filled = FILLED.has(kind);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d={glyphPaths[kind]}
        fill={filled ? color : "none"}
        stroke={filled ? "none" : color}
        strokeWidth={strokeWidth ?? (kind === "pause" ? 3.5 : 2)}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
