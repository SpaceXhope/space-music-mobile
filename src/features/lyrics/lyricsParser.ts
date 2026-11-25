import type { LyricsCandidate } from "@/api/contracts";

export interface MobileLyricLine {
  id: string;
  text: string;
  timeMs: number | null;
  endMs: number | null;
}

function decodeEntities(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    );
}

function cleanText(value: string): string {
  return decodeEntities(
    value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function parseClock(value: string | undefined): number | null {
  if (!value) return null;
  const raw = value.trim();
  if (/^\d+(?:\.\d+)?ms$/i.test(raw)) return Number.parseFloat(raw);
  if (/^\d+(?:\.\d+)?s$/i.test(raw)) return Number.parseFloat(raw) * 1_000;
  const parts = raw.split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return null;
  if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1_000;
  if (parts.length === 3)
    return (parts[0] * 3_600 + parts[1] * 60 + parts[2]) * 1_000;
  return null;
}

function parseLrc(content: string): MobileLyricLine[] {
  const output: MobileLyricLine[] = [];
  for (const rawLine of content.split(/\r?\n/)) {
    const timestamps = Array.from(
      rawLine.matchAll(/\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g),
    );
    if (timestamps.length === 0) continue;
    const text = rawLine
      .replace(/\[[^\]]+\]/g, "")
      .replace(/<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g, "")
      .trim();
    if (!text) continue;
    for (const timestamp of timestamps) {
      const seconds = Number.parseFloat(timestamp[2].replace(":", "."));
      const timeMs = (Number(timestamp[1]) * 60 + seconds) * 1_000;
      output.push({
        id: `lrc-${output.length}-${Math.round(timeMs)}`,
        text,
        timeMs,
        endMs: null,
      });
    }
  }
  return output;
}

function parseQrc(content: string): MobileLyricLine[] {
  const output: MobileLyricLine[] = [];
  for (const rawLine of content.split(/\r?\n/)) {
    const match = rawLine.match(/^\[(\d+),(\d+)\](.*)$/);
    if (!match) continue;
    const timeMs = Number(match[1]);
    const durationMs = Number(match[2]);
    const text = match[3].replace(/\(\d+,\d+\)/g, "").trim();
    if (!text) continue;
    output.push({
      id: `qrc-${output.length}-${timeMs}`,
      text,
      timeMs,
      endMs: timeMs + durationMs,
    });
  }
  return output;
}

function parseRichSync(content: string): MobileLyricLine[] {
  try {
    const value: unknown = JSON.parse(content.trim());
    if (!Array.isArray(value)) return [];
    return value
      .map((entry, index): MobileLyricLine | null => {
        if (!entry || typeof entry !== "object") return null;
        const line = entry as {
          ts?: unknown;
          te?: unknown;
          x?: unknown;
          l?: { c?: unknown }[];
        };
        const start = Number(line.ts);
        if (!Number.isFinite(start)) return null;
        const end = Number(line.te);
        const text =
          typeof line.x === "string"
            ? line.x.trim()
            : Array.isArray(line.l)
              ? line.l
                  .map((part) =>
                    typeof part?.c === "string" ? part.c : "",
                  )
                  .join("")
                  .trim()
              : "";
        if (!text) return null;
        const timeMs = Math.round(start * 1_000);
        return {
          id: `rich-${index}-${timeMs}`,
          text,
          timeMs,
          endMs: Number.isFinite(end) ? Math.round(end * 1_000) : null,
        };
      })
      .filter((line): line is MobileLyricLine => Boolean(line));
  } catch {
    return [];
  }
}

function parseTtml(content: string): MobileLyricLine[] {
  const output: MobileLyricLine[] = [];
  const paragraphPattern = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
  for (const match of content.matchAll(paragraphPattern)) {
    const attributes = match[1];
    const begin = attributes.match(/\bbegin=["']([^"']+)["']/i)?.[1];
    const end = attributes.match(/\bend=["']([^"']+)["']/i)?.[1];
    const duration = attributes.match(/\bdur=["']([^"']+)["']/i)?.[1];
    const timeMs = parseClock(begin);
    const text = cleanText(match[2]);
    if (!text) continue;
    const explicitEnd = parseClock(end);
    const durationMs = parseClock(duration);
    output.push({
      id: `ttml-${output.length}-${timeMs ?? "plain"}`,
      text,
      timeMs,
      endMs:
        explicitEnd ??
        (timeMs !== null && durationMs !== null ? timeMs + durationMs : null),
    });
  }
  return output;
}

function parsePlain(content: string): MobileLyricLine[] {
  return content
    .split(/\r?\n/)
    .map((line) => cleanText(line))
    .filter(Boolean)
    .map((text, index) => ({
      id: `plain-${index}`,
      text,
      timeMs: null,
      endMs: null,
    }));
}

function finishTiming(
  lines: MobileLyricLine[],
  durationMs?: number,
): MobileLyricLine[] {
  const timed = lines.filter((line) => line.timeMs !== null);
  if (timed.length === 0) return lines;
  return [...lines]
    .sort((a, b) => (a.timeMs ?? 0) - (b.timeMs ?? 0))
    .map((line, index, sorted) => ({
      ...line,
      endMs:
        line.endMs ??
        sorted[index + 1]?.timeMs ??
        (durationMs && durationMs > (line.timeMs ?? 0) ? durationMs : null),
    }));
}

export function parseLyricsCandidate(
  candidate: LyricsCandidate,
  durationMs?: number,
): MobileLyricLine[] {
  const { content, format } = candidate.lyrics;
  let lines: MobileLyricLine[] = [];
  if (format === "richsync") lines = parseRichSync(content);
  else if (format === "ttml") lines = parseTtml(content);
  else if (format === "qrc") lines = parseQrc(content);
  else if (format === "lrc") lines = parseLrc(content);

  if (lines.length === 0 && format !== "plain") {
    lines = parseLrc(content);
  }
  if (lines.length === 0) lines = parsePlain(content);
  return finishTiming(lines, durationMs);
}
