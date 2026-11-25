import { router } from "expo-router";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { usePlayer } from "@/features/player/PlayerProvider";
import { useLibrary } from "@/features/library/LibraryProvider";
import { MusicGlyph } from "@/components/MusicGlyph";
import { colors, radii } from "@/theme";

export function PlayerBar() {
  const {
    currentTrack,
    playing,
    buffering,
    positionSeconds,
    durationSeconds,
    canGoNext,
    toggle,
    next,
  } = usePlayer();
  const { likedIds, toggleLike } = useLibrary();
  if (!currentTrack) return null;
  const progress =
    durationSeconds > 0
      ? Math.max(0, Math.min(1, positionSeconds / durationSeconds))
      : 0;
  const tap = (run: () => void) => {
    void Haptics.selectionAsync();
    run();
  };
  const liked = likedIds.has(currentTrack.id);
  return (
    <Pressable onPress={() => router.push("/player")} style={styles.shell}>
      <View style={styles.progressTrack}>
        <View style={[styles.progress, { width: `${progress * 100}%` }]} />
      </View>
      {currentTrack.coverUrl ? (
        <Image source={{ uri: currentTrack.coverUrl }} style={styles.cover} />
      ) : (
        <View style={[styles.cover, styles.fallback]}>
          <MusicGlyph kind="library" size={20} color={colors.textDim} />
        </View>
      )}
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
        accessibilityLabel={liked ? "Убрать из любимых" : "Добавить в любимые"}
        hitSlop={8}
        onPress={(event) => {
          event.stopPropagation();
          void toggleLike(currentTrack).catch(() => undefined);
        }}
        style={styles.smallControl}
      >
        <MusicGlyph
          kind={liked ? "like-filled" : "like"}
          size={22}
          color={liked ? "#ff6485" : colors.textMuted}
        />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={playing ? "Пауза" : "Воспроизвести"}
        onPress={(event) => {
          event.stopPropagation();
          tap(toggle);
        }}
        style={styles.playControl}
      >
        <MusicGlyph
          kind={playing ? "pause" : "play"}
          size={18}
          color={colors.canvas}
        />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Следующий трек"
        disabled={!canGoNext}
        onPress={(event) => {
          event.stopPropagation();
          tap(next);
        }}
        hitSlop={8}
        style={[styles.smallControl, !canGoNext && styles.controlDisabled]}
      >
        <MusicGlyph kind="next" size={20} color={colors.textMuted} />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shell: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 78,
    zIndex: 50,
    height: 66,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    overflow: "hidden",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: "rgba(16, 12, 30, 0.98)",
    paddingHorizontal: 9,
    shadowColor: colors.black,
    shadowOpacity: 0.38,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 9 },
    elevation: 16,
  },
  progressTrack: {
    position: "absolute",
    top: 0,
    left: 10,
    right: 10,
    height: 2,
    backgroundColor: colors.border,
  },
  progress: { height: 2, backgroundColor: colors.accent },
  cover: { width: 48, height: 48, borderRadius: radii.medium },
  fallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.panelSoft,
  },
  copy: { flex: 1, minWidth: 0, gap: 3 },
  title: { color: colors.text, fontSize: 13, fontWeight: "700" },
  artist: { color: colors.textMuted, fontSize: 11 },
  smallControl: {
    width: 34,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  controlDisabled: { opacity: 0.28 },
  playControl: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: colors.text,
  },
});
