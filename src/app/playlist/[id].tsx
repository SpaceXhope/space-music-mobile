import { useCallback, useEffect, useState } from "react";
import { Stack, useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { TrackRow } from "@/components/TrackRow";
import type { PlaylistWithTracks } from "@/domain/music";
import { useLibrary } from "@/features/library/LibraryProvider";
import { usePlayer } from "@/features/player/PlayerProvider";
import { colors, radii } from "@/theme";

export default function PlaylistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { loadPlaylist, likedIds, toggleLike } = useLibrary();
  const { playTrack } = usePlayer();
  const [playlist, setPlaylist] = useState<PlaylistWithTracks | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void loadPlaylist(id)
      .then((value) => active && setPlaylist(value))
      .catch(
        (error) =>
          active &&
          Alert.alert(
            "Не удалось открыть плейлист",
            error instanceof Error ? error.message : "Ошибка сети",
          ),
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id, loadPlaylist]);

  const play = useCallback(
    (index: number) => {
      if (!playlist?.tracks[index]) return;
      void playTrack(playlist.tracks[index], playlist.tracks).catch((error) =>
        Alert.alert(
          "Не удалось воспроизвести",
          error instanceof Error ? error.message : "Поток недоступен",
        ),
      );
    },
    [playTrack, playlist],
  );

  if (loading)
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  if (!playlist)
    return (
      <View style={styles.loading}>
        <Text style={styles.missing}>Плейлист не найден.</Text>
      </View>
    );

  return (
    <>
      <Stack.Screen options={{ title: playlist.title }} />
      <FlatList
        data={playlist.tracks}
        keyExtractor={(track, index) =>
          `${track.playlistItemId || track.id}-${index}`
        }
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.hero}>
            {playlist.coverUrl ? (
              <Image source={{ uri: playlist.coverUrl }} style={styles.cover} />
            ) : (
              <LinearGradient
                colors={["#7455ed", "#c87cff"]}
                style={styles.cover}
              >
                <Text style={styles.placeholder}>♫</Text>
              </LinearGradient>
            )}
            <Text style={styles.title}>{playlist.title}</Text>
            {playlist.description ? (
              <Text style={styles.description}>{playlist.description}</Text>
            ) : null}
            <Text style={styles.meta}>{playlist.tracks.length} треков</Text>
            {playlist.tracks[0] ? (
              <Pressable onPress={() => play(0)} style={styles.playButton}>
                <Text style={styles.playButtonText}>▶ Воспроизвести</Text>
              </Pressable>
            ) : null}
          </View>
        }
        renderItem={({ item, index }) => (
          <TrackRow
            track={item}
            index={index}
            liked={likedIds.has(item.id)}
            onLike={() => void toggleLike(item).catch(() => undefined)}
            onPress={() => play(index)}
          />
        )}
      />
    </>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.canvas,
  },
  missing: { color: colors.textMuted },
  content: { paddingHorizontal: 12, paddingBottom: 170 },
  hero: { alignItems: "center", paddingTop: 22, paddingBottom: 20 },
  cover: {
    width: 210,
    height: 210,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 30,
  },
  placeholder: { color: "white", fontSize: 62 },
  title: {
    maxWidth: 340,
    marginTop: 17,
    color: colors.text,
    fontSize: 25,
    lineHeight: 30,
    fontWeight: "900",
    textAlign: "center",
  },
  description: {
    maxWidth: 330,
    marginTop: 7,
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
  },
  meta: { marginTop: 8, color: colors.textDim, fontSize: 11 },
  playButton: {
    height: 44,
    marginTop: 15,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.round,
    backgroundColor: colors.text,
    paddingHorizontal: 20,
  },
  playButtonText: { color: colors.canvas, fontSize: 12, fontWeight: "900" },
});
