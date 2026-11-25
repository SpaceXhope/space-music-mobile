import { FlatList, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { TrackRow } from "@/components/TrackRow";
import { useLibrary } from "@/features/library/LibraryProvider";
import { usePlayer } from "@/features/player/PlayerProvider";
import { colors } from "@/theme";

export default function LikesScreen() {
  const { likedTracks, likedIds, toggleLike, refresh, syncing } = useLibrary();
  const { playTrack } = usePlayer();
  return (
    <FlatList
      style={styles.list}
      data={likedTracks}
      keyExtractor={(item) => item.id}
      onRefresh={() => void refresh()}
      refreshing={syncing}
      contentContainerStyle={styles.content}
      ListHeaderComponent={
        <View style={styles.hero}>
          <LinearGradient
            colors={["#6f50df", "#be4e9b", "#e86b83"]}
            style={styles.cover}
          >
            <Text style={styles.heart}>♥</Text>
          </LinearGradient>
          <Text style={styles.title}>Любимые треки</Text>
          <Text style={styles.meta}>{likedTracks.length} · общие с ПК</Text>
        </View>
      }
      ListEmptyComponent={
        <Text style={styles.empty}>
          Добавленные на телефоне или ПК треки появятся здесь.
        </Text>
      }
      renderItem={({ item, index }) => (
        <TrackRow
          track={item}
          index={index}
          liked={likedIds.has(item.id)}
          onLike={() => void toggleLike(item).catch(() => undefined)}
          onPress={() =>
            void playTrack(item, likedTracks).catch(() => undefined)
          }
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingHorizontal: 12, paddingBottom: 170 },
  hero: { alignItems: "center", paddingTop: 22, paddingBottom: 22 },
  cover: {
    width: 190,
    height: 190,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 30,
  },
  heart: { color: "white", fontSize: 72 },
  title: { marginTop: 16, color: colors.text, fontSize: 25, fontWeight: "900" },
  meta: { marginTop: 7, color: colors.textMuted, fontSize: 11 },
  empty: {
    marginTop: 30,
    paddingHorizontal: 30,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 19,
  },
});
