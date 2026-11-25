import * as Haptics from "expo-haptics";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import type { MusicTrack } from "@/domain/music";
import { colors, radii } from "@/theme";

function duration(ms?: number): string {
  if (!ms) return "—";
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function TrackRow({
  track,
  index,
  onPress,
  liked,
  onLike,
}: {
  track: MusicTrack;
  index?: number;
  onPress: () => void;
  liked?: boolean;
  onLike?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
    >
      {index !== undefined ? (
        <View style={styles.indexBox}>
          <Text style={styles.index}>{index + 1}</Text>
        </View>
      ) : null}
      {track.coverUrl ? (
        <Image source={{ uri: track.coverUrl }} style={styles.cover} />
      ) : (
        <View style={[styles.cover, styles.fallback]}>
          <Text style={styles.note}>♪</Text>
        </View>
      )}
      <View style={styles.copy}>
        <Text style={styles.title} numberOfLines={1}>
          {track.title}
        </Text>
        <Text style={styles.artist} numberOfLines={1}>
          {track.artists.join(", ")}
        </Text>
      </View>
      {onLike ? (
        <Pressable
          hitSlop={10}
          onPress={(event) => {
            event.stopPropagation();
            void Haptics.selectionAsync();
            onLike();
          }}
          style={styles.like}
        >
          <Text style={[styles.likeText, liked && styles.liked]}>
            {liked ? "♥" : "♡"}
          </Text>
        </Pressable>
      ) : (
        <Text style={styles.duration}>{duration(track.durationMs)}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 68,
    gap: 11,
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pressed: { backgroundColor: colors.panelSoft },
  indexBox: { width: 20, alignItems: "center" },
  index: { color: colors.textDim, fontSize: 12, fontVariant: ["tabular-nums"] },
  cover: { width: 46, height: 46, borderRadius: radii.small },
  fallback: {
    backgroundColor: colors.panelStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  note: { color: colors.textMuted, fontSize: 19 },
  copy: { flex: 1, gap: 4 },
  title: { color: colors.text, fontSize: 14, fontWeight: "700" },
  artist: { color: colors.textMuted, fontSize: 12 },
  duration: { color: colors.textDim, fontSize: 11 },
  like: {
    width: 38,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  likeText: { color: colors.textMuted, fontSize: 25 },
  liked: { color: "#ff6485" },
});
