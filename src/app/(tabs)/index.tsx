import { useCallback, useEffect, useState } from "react";
import { LinearGradient } from "expo-linear-gradient";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { mobileApi } from "@/api/client";
import type {
  DailyMix,
  PlaybackHistoryItem,
  PopularTrackItem,
} from "@/api/contracts";
import { trackFromApi, type MusicTrack } from "@/domain/music";
import { useAuth } from "@/features/auth/AuthProvider";
import { useLibrary } from "@/features/library/LibraryProvider";
import { usePlayer } from "@/features/player/PlayerProvider";
import { colors, radii } from "@/theme";

function TrackTile({
  track,
  onPress,
}: {
  track: MusicTrack;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.trackTile, pressed && styles.pressed]}
    >
      {track.coverUrl ? (
        <Image source={{ uri: track.coverUrl }} style={styles.trackCover} />
      ) : (
        <LinearGradient
          colors={["#7455ed", "#c87cff"]}
          style={styles.trackCover}
        />
      )}
      <Text numberOfLines={1} style={styles.trackTitle}>
        {track.title}
      </Text>
      <Text numberOfLines={1} style={styles.trackArtist}>
        {track.artists.join(", ")}
      </Text>
    </Pressable>
  );
}

export default function HomeScreen() {
  const { user } = useAuth();
  const { likedIds, toggleLike, refresh: refreshLibrary } = useLibrary();
  const { playTrack } = usePlayer();
  const [popular, setPopular] = useState<MusicTrack[]>([]);
  const [recent, setRecent] = useState<MusicTrack[]>([]);
  const [mixes, setMixes] = useState<DailyMix[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [popularResult, historyResult, mixesResult] =
      await Promise.allSettled([
        mobileApi.getPopularTracks(20),
        mobileApi.getHistory(16),
        mobileApi.getDailyMixes(),
        refreshLibrary(),
      ]);
    if (popularResult.status === "fulfilled")
      setPopular(
        popularResult.value.items.map((item: PopularTrackItem) =>
          trackFromApi(item.track, { liked: item.viewer?.liked }),
        ),
      );
    if (historyResult.status === "fulfilled") {
      const seen = new Set<string>();
      setRecent(
        historyResult.value.items
          .filter(
            (item: PlaybackHistoryItem) =>
              !seen.has(item.track.id) && Boolean(seen.add(item.track.id)),
          )
          .map((item: PlaybackHistoryItem) => trackFromApi(item.track)),
      );
    }
    if (mixesResult.status === "fulfilled") setMixes(mixesResult.value.items);
    setLoading(false);
  }, [refreshLibrary]);

  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, [refresh]);

  const play = (track: MusicTrack, queue: MusicTrack[]) =>
    void playTrack(track, queue).catch(() => undefined);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => void refresh()}
            tintColor={colors.accent}
          />
        }
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>SPACE MUSIC</Text>
            <Text style={styles.heading}>
              Привет, {user?.displayName || user?.username || "слушатель"}
            </Text>
          </View>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(user?.displayName || user?.username || "S")
                .slice(0, 1)
                .toUpperCase()}
            </Text>
          </View>
        </View>

        <LinearGradient
          colors={["#2a185d", "#17102f", "#0e0b1c"]}
          style={styles.hero}
        >
          <View style={styles.heroOrb} />
          <Text style={styles.heroKicker}>СИНХРОНИЗИРОВАНО</Text>
          <Text style={styles.heroTitle}>
            Одна библиотека на телефоне и ПК.
          </Text>
          <Text style={styles.heroCopy}>
            Лайки и плейлисты сохраняются в аккаунте Space Music.
          </Text>
        </LinearGradient>

        {loading && popular.length === 0 ? (
          <ActivityIndicator color={colors.accent} style={styles.loader} />
        ) : null}

        {recent.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Недавно слушали</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.row}
            >
              {recent.map((track) => (
                <TrackTile
                  key={track.id}
                  track={track}
                  onPress={() => play(track, recent)}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {mixes.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Миксы для тебя</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.row}
            >
              {mixes.map((mix) => {
                const queue = mix.tracks.map((track) => trackFromApi(track));
                return (
                  <Pressable
                    key={mix.id}
                    onPress={() => queue[0] && play(queue[0], queue)}
                    style={styles.mixCard}
                  >
                    {mix.cover?.url ? (
                      <Image
                        source={{ uri: mix.cover.url }}
                        style={styles.mixCover}
                      />
                    ) : (
                      <LinearGradient
                        colors={["#7455ed", "#c87cff"]}
                        style={styles.mixCover}
                      />
                    )}
                    <Text numberOfLines={1} style={styles.mixTitle}>
                      {mix.title}
                    </Text>
                    <Text numberOfLines={2} style={styles.mixCopy}>
                      {mix.description}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        {popular.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Популярно сейчас</Text>
            {popular.slice(0, 12).map((track, index) => (
              <Pressable
                key={track.id}
                onPress={() => play(track, popular)}
                style={styles.popularRow}
              >
                <Text style={styles.rank}>{index + 1}</Text>
                {track.coverUrl ? (
                  <Image
                    source={{ uri: track.coverUrl }}
                    style={styles.smallCover}
                  />
                ) : (
                  <View style={[styles.smallCover, styles.coverFallback]} />
                )}
                <View style={styles.popularCopy}>
                  <Text numberOfLines={1} style={styles.popularTitle}>
                    {track.title}
                  </Text>
                  <Text numberOfLines={1} style={styles.popularArtist}>
                    {track.artists.join(", ")}
                  </Text>
                </View>
                <Pressable
                  hitSlop={10}
                  onPress={(event) => {
                    event.stopPropagation();
                    void toggleLike(track).catch(() => undefined);
                  }}
                >
                  <Text
                    style={[
                      styles.heart,
                      likedIds.has(track.id) && styles.heartOn,
                    ]}
                  >
                    {likedIds.has(track.id) ? "♥" : "♡"}
                  </Text>
                </Pressable>
              </Pressable>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingBottom: 180 },
  header: {
    height: 84,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  eyebrow: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2.2,
  },
  heading: {
    maxWidth: 300,
    marginTop: 3,
    color: colors.text,
    fontSize: 25,
    fontWeight: "900",
    letterSpacing: -0.7,
  },
  avatar: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    backgroundColor: "#2a1d58",
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  avatarText: { color: colors.text, fontWeight: "900" },
  hero: {
    minHeight: 205,
    marginHorizontal: 16,
    overflow: "hidden",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: 22,
    justifyContent: "flex-end",
  },
  heroOrb: {
    position: "absolute",
    right: -30,
    top: -45,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(161,126,255,0.18)",
  },
  heroKicker: {
    color: "#b9a9ff",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.7,
  },
  heroTitle: {
    maxWidth: 290,
    marginTop: 7,
    color: colors.text,
    fontSize: 25,
    lineHeight: 29,
    fontWeight: "900",
    letterSpacing: -0.8,
  },
  heroCopy: {
    maxWidth: 310,
    marginTop: 9,
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  loader: { marginTop: 40 },
  section: { marginTop: 27 },
  sectionTitle: {
    marginBottom: 12,
    paddingHorizontal: 18,
    color: colors.text,
    fontSize: 20,
    fontWeight: "900",
  },
  row: { gap: 12, paddingHorizontal: 18 },
  trackTile: { width: 142 },
  pressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
  trackCover: { width: 142, height: 142, borderRadius: 19 },
  trackTitle: {
    marginTop: 9,
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  trackArtist: { marginTop: 3, color: colors.textMuted, fontSize: 11 },
  mixCard: {
    width: 180,
    borderRadius: radii.large,
    backgroundColor: colors.panel,
    padding: 9,
  },
  mixCover: { width: 162, height: 162, borderRadius: 18 },
  mixTitle: {
    marginTop: 9,
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  mixCopy: {
    marginTop: 3,
    color: colors.textMuted,
    fontSize: 10.5,
    lineHeight: 15,
  },
  popularRow: {
    minHeight: 64,
    marginHorizontal: 12,
    paddingHorizontal: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rank: { width: 22, color: colors.textDim, textAlign: "center", fontSize: 12 },
  smallCover: { width: 44, height: 44, borderRadius: radii.small },
  coverFallback: { backgroundColor: colors.panelStrong },
  popularCopy: { flex: 1, gap: 3 },
  popularTitle: { color: colors.text, fontSize: 13, fontWeight: "700" },
  popularArtist: { color: colors.textMuted, fontSize: 11 },
  heart: {
    width: 38,
    color: colors.textMuted,
    textAlign: "center",
    fontSize: 24,
  },
  heartOn: { color: "#ff6485" },
});
