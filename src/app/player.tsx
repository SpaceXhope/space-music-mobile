import { useEffect, useState } from "react";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useSQLiteContext } from "expo-sqlite";
import {
  Image,
  Pressable,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLibrary } from "@/features/library/LibraryProvider";
import { usePlayer } from "@/features/player/PlayerProvider";
import { MusicGlyph } from "@/components/MusicGlyph";
import { WallpaperBackground } from "@/components/WallpaperBackground";
import { loadWallpaper, type WallpaperSettings } from "@/features/wallpaper/wallpaper";
import { buildTrackShareText } from "@/domain/share";
import { colors, radii } from "@/theme";

function time(seconds: number) {
  if (!Number.isFinite(seconds)) return "0:00";
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

/**
 * The transport is a five-slot grid, exactly like the desktop player
 * (`src/features/player/ui/FullscreenTransportControls.tsx`). Equal flex slots
 * keep the play button on the optical centre of the screen no matter which
 * controls are disabled or how wide their labels are.
 */
function TransportSlot({
  children,
  onPress,
  disabled,
  active,
  label,
}: {
  children: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  active?: boolean;
  label: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled), selected: active }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={[styles.slot, disabled && styles.slotDisabled]}
    >
      {children}
    </Pressable>
  );
}

export default function PlayerScreen() {
  const db = useSQLiteContext();
  const [wallpaper, setWallpaper] = useState<WallpaperSettings | null>(null);
  useEffect(() => {
    let active = true;
    void loadWallpaper(db).then((settings) => {
      if (active) setWallpaper(settings);
    });
    return () => {
      active = false;
    };
  }, [db]);
  const {
    currentTrack,
    playing,
    buffering,
    positionSeconds,
    durationSeconds,
    error,
    shuffleEnabled,
    repeatMode,
    canGoNext,
    canGoPrevious,
    toggle,
    next,
    previous,
    seek,
    toggleShuffle,
    cycleRepeatMode,
  } = usePlayer();
  const { likedIds, toggleLike } = useLibrary();
  const { width, height } = useWindowDimensions();
  const [timelineWidth, setTimelineWidth] = useState(1);
  const coverSize = Math.min(width - 56, Math.max(210, height * 0.39), 430);

  if (!currentTrack)
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Сейчас ничего не играет</Text>
      </View>
    );

  const progress =
    durationSeconds > 0
      ? Math.max(0, Math.min(1, positionSeconds / durationSeconds))
      : 0;
  const liked = likedIds.has(currentTrack.id);
  const shareText = buildTrackShareText(currentTrack);
  const shareTrack = async () => {
    if (!shareText) return;
    await Share.share(
      { message: shareText, title: currentTrack.title },
      { dialogTitle: "Поделиться треком" },
    );
  };
  return (
    <View style={styles.root}>
      <WallpaperBackground settings={wallpaper} dim={wallpaper ? 0.62 : 1} />
      <LinearGradient
        colors={
          wallpaper
            ? ["rgba(36,20,76,0.42)", "rgba(13,10,27,0.55)", "rgba(7,8,18,0.92)"]
            : ["#24144c", "#0d0a1b", "#070812"]
        }
        style={StyleSheet.absoluteFill}
      >
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Закрыть плеер"
            onPress={() => router.back()}
            hitSlop={12}
            style={styles.headerButton}
          >
            <MusicGlyph kind="close" size={26} color={colors.text} />
          </Pressable>
          <Text style={styles.now}>СЕЙЧАС ИГРАЕТ</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Открыть очередь"
            onPress={() => router.push("/queue")}
            hitSlop={12}
            style={styles.headerButton}
          >
            <MusicGlyph kind="queue" size={24} color={colors.text} />
          </Pressable>
        </View>
        <View style={styles.body}>
          {currentTrack.coverUrl ? (
            <Image
              source={{ uri: currentTrack.coverUrl }}
              style={[styles.cover, { width: coverSize, height: coverSize }]}
            />
          ) : (
            <LinearGradient
              colors={["#7455ed", "#c87cff"]}
              style={[styles.cover, { width: coverSize, height: coverSize }]}
            />
          )}
          <View style={[styles.details, { width: coverSize }]}>
            <View style={styles.infoRow}>
              <View style={styles.copy}>
                <Text numberOfLines={1} style={styles.title}>
                  {currentTrack.title}
                </Text>
                <Text numberOfLines={1} style={styles.artist}>
                  {currentTrack.artists.join(", ")}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  liked ? "Убрать из любимых" : "Добавить в любимые"
                }
                onPress={() =>
                  void toggleLike(currentTrack).catch(() => undefined)
                }
                hitSlop={12}
                style={styles.likeButton}
              >
                <MusicGlyph
                  kind={liked ? "like-filled" : "like"}
                  size={26}
                  color={liked ? "#ff6485" : colors.textMuted}
                />
              </Pressable>
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable
              accessibilityRole="adjustable"
              accessibilityLabel="Позиция воспроизведения"
              accessibilityValue={{
                min: 0,
                max: Math.round(durationSeconds),
                now: Math.round(positionSeconds),
              }}
              onLayout={(event) =>
                setTimelineWidth(Math.max(1, event.nativeEvent.layout.width))
              }
              onPress={(event) => {
                const ratio = Math.max(
                  0,
                  Math.min(1, event.nativeEvent.locationX / timelineWidth),
                );
                void seek(ratio * durationSeconds);
              }}
              style={styles.timelineHitbox}
            >
              <View style={styles.timeline}>
                <View
                  style={[styles.timelineFill, { width: `${progress * 100}%` }]}
                />
                <View
                  style={[styles.timelineThumb, { left: `${progress * 100}%` }]}
                />
              </View>
            </Pressable>
            <View style={styles.times}>
              <Text style={styles.time}>{time(positionSeconds)}</Text>
              <Text style={styles.time}>{time(durationSeconds)}</Text>
            </View>
            <View style={styles.controls}>
              <TransportSlot
                label={shuffleEnabled ? "Случайный порядок включён" : "Случайный порядок выключен"}
                active={shuffleEnabled}
                onPress={toggleShuffle}
              >
                <MusicGlyph
                  kind="shuffle"
                  size={24}
                  color={shuffleEnabled ? colors.accent : colors.textMuted}
                />
              </TransportSlot>
              <TransportSlot
                label="Предыдущий трек"
                disabled={!canGoPrevious}
                onPress={previous}
              >
                <MusicGlyph kind="previous" size={23} color={colors.text} />
              </TransportSlot>
              <TransportSlot
                label={playing ? "Пауза" : "Воспроизвести"}
                onPress={toggle}
              >
                <View style={styles.play}>
                  <MusicGlyph
                    kind={playing ? "pause" : "play"}
                    size={26}
                    color={colors.canvas}
                  />
                </View>
              </TransportSlot>
              <TransportSlot
                label="Следующий трек"
                disabled={!canGoNext}
                onPress={next}
              >
                <MusicGlyph kind="next" size={23} color={colors.text} />
              </TransportSlot>
              <TransportSlot
                label={
                  repeatMode === "off"
                    ? "Повтор выключен"
                    : repeatMode === "all"
                      ? "Повтор всех"
                      : "Повтор одного"
                }
                active={repeatMode !== "off"}
                onPress={cycleRepeatMode}
              >
                <MusicGlyph
                  kind={repeatMode === "one" ? "repeat-one" : "repeat"}
                  size={24}
                  color={repeatMode === "off" ? colors.textMuted : colors.accent}
                />
              </TransportSlot>
            </View>
            <View style={styles.secondaryRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Открыть текст песни"
                onPress={() => router.push("/lyrics")}
                style={styles.secondaryButton}
              >
                <MusicGlyph kind="lyrics" size={18} color={colors.text} />
                <Text style={styles.secondaryLabel}>Текст</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Открыть очередь"
                onPress={() => router.push("/queue")}
                style={styles.secondaryButton}
              >
                <MusicGlyph kind="queue" size={18} color={colors.text} />
                <Text style={styles.secondaryLabel}>Очередь</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Поделиться треком"
                disabled={!shareText}
                onPress={() => void shareTrack()}
                style={[
                  styles.secondaryButton,
                  !shareText && styles.secondaryDisabled,
                ]}
              >
                <MusicGlyph kind="share" size={18} color={colors.text} />
                <Text style={styles.secondaryLabel}>Поделиться</Text>
              </Pressable>
            </View>
            {buffering ? <Text style={styles.buffering}>Загружаю поток…</Text> : null}
          </View>
        </View>
      </SafeAreaView>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  header: {
    height: 56,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  now: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  body: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 12 },
  cover: {
    alignSelf: "center",
    borderRadius: 30,
    shadowColor: "#000",
    shadowOpacity: 0.55,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 18 },
    elevation: 20,
  },
  details: { alignSelf: "center" },
  infoRow: {
    marginTop: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  copy: { flex: 1, gap: 5 },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  artist: { color: colors.textMuted, fontSize: 14 },
  likeButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  error: {
    marginTop: 10,
    borderRadius: radii.small,
    backgroundColor: "rgba(255,107,122,0.11)",
    color: colors.danger,
    fontSize: 11,
    lineHeight: 16,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  timelineHitbox: { height: 30, marginTop: 8, justifyContent: "center" },
  timeline: {
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.borderStrong,
  },
  timelineFill: { height: 5, borderRadius: 3, backgroundColor: "#b9a9ff" },
  timelineThumb: {
    position: "absolute",
    top: -4,
    width: 13,
    height: 13,
    marginLeft: -6.5,
    borderRadius: 7,
    backgroundColor: colors.text,
  },
  times: { flexDirection: "row", justifyContent: "space-between" },
  time: { color: colors.textDim, fontSize: 10, fontVariant: ["tabular-nums"] },
  controls: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
  },
  slot: {
    flex: 1,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  slotDisabled: { opacity: 0.28 },
  play: {
    width: 62,
    height: 62,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 31,
    backgroundColor: colors.text,
  },
  secondaryRow: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: radii.round,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: "rgba(255,255,255,0.055)",
  },
  secondaryLabel: { color: colors.text, fontSize: 12, fontWeight: "800" },
  secondaryDisabled: { opacity: 0.35 },
  buffering: {
    marginTop: 10,
    textAlign: "center",
    color: colors.textDim,
    fontSize: 10,
  },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.canvas },
  emptyText: { color: colors.textMuted },
});
