import { useEffect, useMemo, useRef, useState } from "react";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useSQLiteContext } from "expo-sqlite";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { LyricsSearchResult } from "@/api/contracts";
import { mobileApi } from "@/api/client";
import {
  parseLyricsCandidate,
  type MobileLyricLine,
} from "@/features/lyrics/lyricsParser";
import { usePlayer } from "@/features/player/PlayerProvider";
import { readSyncCache, writeSyncCache } from "@/storage/database";
import { colors } from "@/theme";

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export default function LyricsScreen() {
  const db = useSQLiteContext();
  const {
    currentTrack,
    playing,
    buffering,
    positionSeconds,
    durationSeconds,
    toggle,
    seek,
  } = usePlayer();
  const listRef = useRef<FlatList<MobileLyricLine>>(null);
  const [result, setResult] = useState<LyricsSearchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const track = currentTrack;
    if (!track) {
      const emptyTimer = setTimeout(() => {
        setLoading(false);
        setResult(null);
      }, 0);
      return () => clearTimeout(emptyTimer);
    }
    let active = true;
    const controller = new AbortController();
    const cacheKey = `lyrics-v1:${track.id}`;
    const loadTimer = setTimeout(() => {
      setLoading(true);
      setError(null);
      setResult(null);

      void readSyncCache<LyricsSearchResult>(db, cacheKey).then((cached) => {
        if (!active || !cached) return;
        setResult(cached);
        setLoading(false);
      });

      void mobileApi
        .searchLyrics(
          {
            title: track.title,
            artist: track.artists[0] ?? "",
            durationMs: track.durationMs,
          },
          controller.signal,
        )
        .then(async (next) => {
          if (!active) return;
          setResult(next);
          if (next) await writeSyncCache(db, cacheKey, next);
        })
        .catch((nextError) => {
          if (!active || isAbortError(nextError)) return;
          setError(
            nextError instanceof Error
              ? nextError.message
              : "Не удалось загрузить текст",
          );
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 0);

    return () => {
      active = false;
      clearTimeout(loadTimer);
      controller.abort();
    };
  }, [currentTrack, db, reloadKey]);

  const lines = useMemo(
    () =>
      result && currentTrack
        ? parseLyricsCandidate(result.candidate, currentTrack.durationMs)
        : [],
    [currentTrack, result],
  );
  const positionMs = positionSeconds * 1_000;
  const activeIndex = useMemo(() => {
    let found = -1;
    for (let index = 0; index < lines.length; index += 1) {
      const timeMs = lines[index].timeMs;
      if (timeMs === null || timeMs > positionMs + 80) break;
      found = index;
    }
    return found;
  }, [lines, positionMs]);

  useEffect(() => {
    if (activeIndex < 0 || lines.length === 0) return;
    listRef.current?.scrollToIndex({
      index: activeIndex,
      animated: true,
      viewPosition: 0.34,
    });
  }, [activeIndex, lines.length]);

  const progress =
    durationSeconds > 0
      ? Math.max(0, Math.min(1, positionSeconds / durationSeconds))
      : 0;

  return (
    <LinearGradient
      colors={["#17102f", "#090817", "#070a12"]}
      style={styles.root}
    >
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Закрыть текст песни"
          onPress={() => router.back()}
          style={styles.headerButton}
        >
          <Text style={styles.close}>⌄</Text>
        </Pressable>
        <View style={styles.headerCopy}>
          <Text numberOfLines={1} style={styles.trackTitle}>
            {currentTrack?.title ?? "Текст песни"}
          </Text>
          <Text numberOfLines={1} style={styles.trackArtist}>
            {currentTrack?.artists.join(", ") ?? ""}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Обновить текст"
          onPress={() => setReloadKey((value) => value + 1)}
          style={styles.headerButton}
        >
          <Text style={styles.reload}>↻</Text>
        </Pressable>
      </View>

      {loading && lines.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={styles.loadingText}>Ищем лучший текст…</Text>
        </View>
      ) : lines.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>≋</Text>
          <Text style={styles.emptyTitle}>Текст пока не найден</Text>
          <Text style={styles.emptyCopy}>
            {error ?? "Попробуйте обновить его немного позже."}
          </Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={lines}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          onScrollToIndexFailed={({ index, averageItemLength }) => {
            listRef.current?.scrollToOffset({
              offset: Math.max(0, index * averageItemLength),
              animated: true,
            });
          }}
          ListHeaderComponent={
            <View style={styles.sourceRow}>
              <Text style={styles.sourceLabel}>
                {result?.candidate.provider || result?.provider || "Space Music"}
              </Text>
              <Text style={styles.syncLabel}>
                {result?.candidate.syncLevel === "plain"
                  ? "БЕЗ СИНХРОНИЗАЦИИ"
                  : "СИНХРОНИЗИРОВАНО"}
              </Text>
            </View>
          }
          renderItem={({ item, index }) => {
            const active = index === activeIndex;
            const passed = activeIndex >= 0 && index < activeIndex;
            return (
              <Pressable
                disabled={item.timeMs === null}
                accessibilityRole={item.timeMs === null ? "text" : "button"}
                accessibilityLabel={
                  item.timeMs === null
                    ? item.text
                    : `Перейти к строке: ${item.text}`
                }
                onPress={() =>
                  item.timeMs === null
                    ? undefined
                    : void seek(item.timeMs / 1_000)
                }
                style={styles.lineButton}
              >
                <Text
                  style={[
                    styles.line,
                    passed && styles.linePassed,
                    active && styles.lineActive,
                  ]}
                >
                  {item.text}
                </Text>
              </Pressable>
            );
          }}
        />
      )}

      {currentTrack ? (
        <View style={styles.transport}>
          <View style={styles.progressTrack}>
            <View style={[styles.progress, { width: `${progress * 100}%` }]} />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={playing ? "Пауза" : "Воспроизвести"}
            onPress={toggle}
            style={styles.playButton}
          >
            <Text style={styles.playText}>
              {buffering ? "…" : playing ? "Ⅱ" : "▶"}
            </Text>
          </Pressable>
          <View style={styles.transportCopy}>
            <Text numberOfLines={1} style={styles.transportTitle}>
              {activeIndex >= 0 ? lines[activeIndex]?.text : currentTrack.title}
            </Text>
            <Text style={styles.transportMeta}>Текст следует за музыкой</Text>
          </View>
        </View>
      ) : null}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: 42 },
  header: {
    height: 62,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
  },
  headerButton: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  close: { color: colors.text, fontSize: 30, marginTop: -8 },
  reload: { color: colors.textMuted, fontSize: 24 },
  headerCopy: { flex: 1, minWidth: 0, alignItems: "center", gap: 3 },
  trackTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
  trackArtist: { color: colors.textMuted, fontSize: 10.5 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 35,
    paddingBottom: 100,
  },
  loadingText: { marginTop: 14, color: colors.textMuted, fontSize: 12 },
  emptyIcon: { color: colors.accent, fontSize: 54 },
  emptyTitle: { marginTop: 12, color: colors.text, fontSize: 20, fontWeight: "900" },
  emptyCopy: {
    maxWidth: 300,
    marginTop: 7,
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 170 },
  sourceRow: {
    marginBottom: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sourceLabel: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  syncLabel: { color: colors.textDim, fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  lineButton: { minHeight: 62, justifyContent: "center", paddingVertical: 10 },
  line: {
    color: "rgba(244,247,251,0.48)",
    fontSize: 23,
    lineHeight: 30,
    fontWeight: "800",
    letterSpacing: -0.45,
  },
  linePassed: { color: "rgba(244,247,251,0.24)" },
  lineActive: { color: colors.text, fontSize: 26, lineHeight: 33 },
  transport: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 16,
    height: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    overflow: "hidden",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: "rgba(13,10,27,0.96)",
    paddingHorizontal: 11,
  },
  progressTrack: {
    position: "absolute",
    top: 0,
    left: 14,
    right: 14,
    height: 2,
    backgroundColor: colors.border,
  },
  progress: { height: 2, backgroundColor: colors.accent },
  playButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    backgroundColor: colors.text,
  },
  playText: { color: colors.canvas, fontSize: 15, fontWeight: "900" },
  transportCopy: { flex: 1, minWidth: 0, gap: 4 },
  transportTitle: { color: colors.text, fontSize: 12, fontWeight: "700" },
  transportMeta: { color: colors.textDim, fontSize: 9.5 },
});
