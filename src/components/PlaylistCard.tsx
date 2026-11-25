import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { MusicPlaylist } from "@/domain/music";
import { PROVIDER_COLORS } from "@/domain/music";
import { colors, radii } from "@/theme";

export function PlaylistCard({
  playlist,
  onPress,
}: {
  playlist: MusicPlaylist;
  onPress: () => void;
}) {
  const gradient = PROVIDER_COLORS[playlist.provider];
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
    >
      <View style={styles.artwork}>
        {playlist.coverUrl ? (
          <Image source={{ uri: playlist.coverUrl }} style={styles.image} />
        ) : (
          <LinearGradient colors={gradient} style={styles.image}>
            <Text style={styles.placeholder}>♫</Text>
          </LinearGradient>
        )}
      </View>
      <View style={styles.copy}>
        <Text style={styles.title} numberOfLines={2}>
          {playlist.title}
        </Text>
        <Text style={styles.meta}>
          {playlist.trackCount} {playlist.trackCount === 1 ? "трек" : "треков"}
        </Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 116,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: radii.large,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    padding: 10,
  },
  pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
  artwork: {
    width: 94,
    height: 94,
    overflow: "hidden",
    borderRadius: 18,
    backgroundColor: colors.panelStrong,
  },
  image: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  placeholder: { color: "rgba(255,255,255,0.88)", fontSize: 36 },
  copy: { flex: 1, alignItems: "flex-start", gap: 7 },
  title: {
    color: colors.text,
    fontSize: 17,
    lineHeight: 21,
    fontWeight: "700",
  },
  meta: { color: colors.textMuted, fontSize: 12 },
  chevron: { color: colors.textDim, fontSize: 31, paddingHorizontal: 4 },
});
