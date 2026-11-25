import { router } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useState } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { PlaylistCard } from "@/components/PlaylistCard";
import { TrackRow } from "@/components/TrackRow";
import { useLibrary } from "@/features/library/LibraryProvider";
import { usePlayer } from "@/features/player/PlayerProvider";
import { colors, radii } from "@/theme";

export default function LibraryScreen() {
  const {
    likedTracks,
    playlists,
    loading,
    syncing,
    error,
    refresh,
    likedIds,
    toggleLike,
    createPlaylist,
  } = useLibrary();
  const { playTrack } = usePlayer();
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const submitPlaylist = async () => {
    const clean = title.trim();
    if (!clean || creating) return;
    setCreating(true);
    try {
      const playlist = await createPlaylist(clean);
      setTitle("");
      setCreateOpen(false);
      router.push({ pathname: "/playlist/[id]", params: { id: playlist.id } });
    } catch (nextError) {
      Alert.alert(
        "Не удалось создать плейлист",
        nextError instanceof Error ? nextError.message : "Ошибка сети",
      );
    } finally {
      setCreating(false);
    }
  };
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={syncing}
            onRefresh={() => void refresh()}
            tintColor={colors.accent}
          />
        }
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>ОБЩАЯ БИБЛИОТЕКА</Text>
            <Text style={styles.title}>Медиатека</Text>
          </View>
          {syncing ? <ActivityIndicator color={colors.accent} /> : null}
        </View>

        <Pressable
          onPress={() => router.push("/likes")}
          style={styles.likesCard}
        >
          <LinearGradient
            colors={["#6f50df", "#be4e9b", "#e86b83"]}
            style={styles.likesCover}
          >
            <Text style={styles.likesHeart}>♥</Text>
          </LinearGradient>
          <View style={styles.likesCopy}>
            <Text style={styles.likesTitle}>Любимые треки</Text>
            <Text style={styles.likesMeta}>
              {likedTracks.length} · синхронизировано с ПК
            </Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>

        {error ? (
          <Pressable onPress={() => void refresh()} style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
            <Text style={styles.retry}>Повторить</Text>
          </Pressable>
        ) : null}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Плейлисты</Text>
          <Text style={styles.count}>{playlists.length}</Text>
          <Pressable
            onPress={() => setCreateOpen(true)}
            style={styles.createButton}
          >
            <Text style={styles.createButtonText}>＋ Создать</Text>
          </Pressable>
        </View>
        {loading && playlists.length === 0 ? (
          <ActivityIndicator color={colors.accent} style={styles.loader} />
        ) : null}
        <View style={styles.playlists}>
          {playlists.map((playlist) => (
            <PlaylistCard
              key={playlist.id}
              playlist={playlist}
              onPress={() =>
                router.push({
                  pathname: "/playlist/[id]",
                  params: { id: playlist.id },
                })
              }
            />
          ))}
        </View>

        {likedTracks.length > 0 ? (
          <View style={styles.recentLikes}>
            <Text style={styles.sectionTitle}>Последние добавленные</Text>
            {likedTracks.slice(0, 5).map((track) => (
              <TrackRow
                key={track.id}
                track={track}
                liked={likedIds.has(track.id)}
                onLike={() => void toggleLike(track).catch(() => undefined)}
                onPress={() =>
                  void playTrack(track, likedTracks).catch(() => undefined)
                }
              />
            ))}
          </View>
        ) : null}
      </ScrollView>
      <Modal
        visible={createOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCreateOpen(false)}
      >
        <Pressable
          onPress={() => setCreateOpen(false)}
          style={styles.modalBackdrop}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={styles.modalCard}
          >
            <Text style={styles.modalTitle}>Новый плейлист</Text>
            <Text style={styles.modalCopy}>
              Он сразу появится на телефоне и в desktop-приложении.
            </Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Название"
              placeholderTextColor={colors.textDim}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => void submitPlaylist()}
              style={styles.modalInput}
            />
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setCreateOpen(false)}
                style={styles.modalCancel}
              >
                <Text style={styles.modalCancelText}>Отмена</Text>
              </Pressable>
              <Pressable
                disabled={!title.trim() || creating}
                onPress={() => void submitPlaylist()}
                style={[
                  styles.modalSubmit,
                  (!title.trim() || creating) && styles.modalDisabled,
                ]}
              >
                {creating ? (
                  <ActivityIndicator color={colors.canvas} />
                ) : (
                  <Text style={styles.modalSubmitText}>Создать</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingHorizontal: 15, paddingBottom: 180 },
  header: {
    height: 92,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 3,
  },
  eyebrow: {
    color: colors.accent,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.8,
  },
  title: {
    marginTop: 3,
    color: colors.text,
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: -1,
  },
  likesCard: {
    height: 104,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: radii.large,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panel,
    padding: 10,
  },
  likesCover: {
    width: 82,
    height: 82,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 19,
  },
  likesHeart: { color: "white", fontSize: 36 },
  likesCopy: { flex: 1, gap: 6 },
  likesTitle: { color: colors.text, fontSize: 17, fontWeight: "800" },
  likesMeta: { color: colors.textMuted, fontSize: 11 },
  chevron: { color: colors.textDim, fontSize: 30 },
  errorCard: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: radii.medium,
    backgroundColor: "rgba(255,107,122,0.1)",
    padding: 12,
  },
  errorText: { flex: 1, color: colors.danger, fontSize: 11 },
  retry: {
    marginLeft: 10,
    color: colors.text,
    fontSize: 11,
    fontWeight: "800",
  },
  sectionHeader: {
    marginTop: 27,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  sectionTitle: { color: colors.text, fontSize: 20, fontWeight: "900" },
  count: {
    minWidth: 25,
    borderRadius: 999,
    backgroundColor: colors.panelSoft,
    color: colors.textMuted,
    fontSize: 11,
    textAlign: "center",
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  createButton: {
    marginLeft: "auto",
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.round,
    backgroundColor: colors.panelSoft,
    paddingHorizontal: 11,
  },
  createButtonText: { color: colors.text, fontSize: 11, fontWeight: "800" },
  loader: { marginTop: 30 },
  playlists: { gap: 10 },
  recentLikes: { marginTop: 30 },
  modalBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.7)",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 390,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.canvasSoft,
    padding: 18,
  },
  modalTitle: { color: colors.text, fontSize: 21, fontWeight: "900" },
  modalCopy: {
    marginTop: 6,
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 17,
  },
  modalInput: {
    height: 52,
    marginTop: 17,
    borderRadius: radii.medium,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.canvas,
    color: colors.text,
    paddingHorizontal: 13,
  },
  modalActions: { marginTop: 14, flexDirection: "row", gap: 9 },
  modalCancel: {
    flex: 1,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.medium,
    backgroundColor: colors.panelSoft,
  },
  modalCancelText: { color: colors.textMuted, fontWeight: "700" },
  modalSubmit: {
    flex: 1,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.medium,
    backgroundColor: colors.text,
  },
  modalSubmitText: { color: colors.canvas, fontWeight: "900" },
  modalDisabled: { opacity: 0.4 },
});
