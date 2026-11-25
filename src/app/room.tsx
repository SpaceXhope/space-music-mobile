import { useCallback } from "react";
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
import { router } from "expo-router";
import { useRooms } from "@/features/rooms/RoomsProvider";
import { usePlayer } from "@/features/player/PlayerProvider";
import { MusicGlyph } from "@/components/MusicGlyph";
import { trackFromApi } from "@/domain/music";
import { colors, radii } from "@/theme";

export default function RoomScreen() {
  const { activeRoom, control, leaveRoom, closeRoom } = useRooms();
  const player = usePlayer();

  const confirmLeave = useCallback(() => {
    if (!activeRoom) return;
    const label =
      activeRoom.role === "owner" ? "Закрыть комнату" : "Покинуть комнату";
    Alert.alert(
      label + "?",
      activeRoom.role === "owner"
        ? "Комната закроется для всех участников."
        : "Вы перестанете видеть общую очередь.",
      [
        { text: "Отмена", style: "cancel" },
        {
          text: label,
          style: "destructive",
          onPress: () => {
            if (activeRoom.role === "owner") void closeRoom();
            else void leaveRoom();
            router.back();
          },
        },
      ],
    );
  }, [activeRoom, closeRoom, leaveRoom]);

  if (!activeRoom) {
    return (
      <View style={styles.empty}>
        <MusicGlyph kind="room" size={44} color={colors.textDim} />
        <Text style={styles.emptyTitle}>Вы не в комнате</Text>
        <Text style={styles.emptyCopy}>
          Создайте комнату или войдите по коду, чтобы слушать вместе.
        </Text>
        <Pressable onPress={() => router.replace("/rooms")} style={styles.cta}>
          <Text style={styles.ctaText}>К комнатам</Text>
        </Pressable>
      </View>
    );
  }

  const tracks = activeRoom.state.queue.map((entry) => trackFromApi(entry));
  const currentIndex = Math.max(
    -1,
    Math.min(activeRoom.state.currentIndex, tracks.length - 1),
  );
  const currentTrack = currentIndex >= 0 ? tracks[currentIndex] : null;

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={["#24144c", "#0d0a1b", "#070812"]}
        style={styles.header}
      >
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={styles.nowPlaying}>
              {activeRoom.state.playing ? "СЛУШАЕМ ВМЕСТЕ" : "КОМНАТА"}
            </Text>
            <Text style={styles.roomName}>{activeRoom.name}</Text>
            <Text style={styles.roomMeta}>
              {activeRoom.joinCode ? `Код ${activeRoom.joinCode} · ` : ""}
              {activeRoom.memberCount}{" "}
              {activeRoom.memberCount === 1 ? "участник" : "участника"}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Выйти из комнаты"
            onPress={confirmLeave}
            hitSlop={10}
            style={styles.leaveButton}
          >
            <Text style={styles.leaveText}>Выйти</Text>
          </Pressable>
        </View>

        {activeRoom.members.length > 0 ? (
          <View style={styles.membersRow}>
            {activeRoom.members.slice(0, 6).map((member) => (
              <View key={member.userId} style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {(member.displayName || "?").slice(0, 1).toUpperCase()}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </LinearGradient>

      <FlatList
        style={styles.list}
        data={tracks}
        keyExtractor={(track, index) => `${track.id}-${index}`}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          currentTrack ? (
            <View style={styles.currentCard}>
              {currentTrack.coverUrl ? (
                <Image
                  source={{ uri: currentTrack.coverUrl }}
                  style={styles.currentCover}
                />
              ) : (
                <LinearGradient
                  colors={["#7455ed", "#c87cff"]}
                  style={styles.currentCover}
                />
              )}
              <View style={styles.currentCopy}>
                <Text numberOfLines={1} style={styles.currentTitle}>
                  {currentTrack.title}
                </Text>
                <Text numberOfLines={1} style={styles.currentArtist}>
                  {currentTrack.artists.join(", ") || "—"}
                </Text>
              </View>

              <View style={styles.transport}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Предыдущий трек"
                  onPress={control.previous}
                  hitSlop={6}
                  style={styles.transportButton}
                >
                  <MusicGlyph
                    kind="previous"
                    size={22}
                    color={colors.text}
                  />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    activeRoom.state.playing ? "Пауза" : "Воспроизвести"
                  }
                  onPress={control.toggle}
                  style={styles.playButton}
                >
                  <MusicGlyph
                    kind={activeRoom.state.playing ? "pause" : "play"}
                    size={24}
                    color={colors.canvas}
                  />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Следующий трек"
                  onPress={control.next}
                  hitSlop={6}
                  style={styles.transportButton}
                >
                  <MusicGlyph kind="next" size={22} color={colors.text} />
                </Pressable>
              </View>

              {player.buffering ? (
                <ActivityIndicator
                  color={colors.accent}
                  size="small"
                  style={styles.buffer}
                />
              ) : null}
            </View>
          ) : (
            <View style={styles.noTrack}>
              <Text style={styles.noTrackTitle}>Очередь пуста</Text>
              <Text style={styles.noTrackCopy}>
                Комнату можно наполнять с любого устройства участников.
              </Text>
            </View>
          )
        }
        ListEmptyComponent={<View />}
        renderItem={({ item, index }) => {
          const current = index === currentIndex;
          return (
            <Pressable
              onPress={() => control.playIndex(index)}
              style={[styles.row, current && styles.rowCurrent]}
            >
              {item.coverUrl ? (
                <Image source={{ uri: item.coverUrl }} style={styles.rowCover} />
              ) : (
                <View style={[styles.rowCover, styles.rowCoverFallback]} />
              )}
              <View style={styles.rowCopy}>
                <Text
                  numberOfLines={1}
                  style={[styles.rowTitle, current && styles.rowTitleCurrent]}
                >
                  {item.title}
                </Text>
                <Text numberOfLines={1} style={styles.rowArtist}>
                  {item.artists.join(", ") || "—"}
                </Text>
              </View>
              {!current && index !== currentIndex ? (
                <Pressable
                  hitSlop={10}
                  onPress={(event) => {
                    event.stopPropagation();
                    control.removeAt(index);
                  }}
                  style={styles.removeButton}
                >
                  <Text style={styles.removeText}>×</Text>
                </Pressable>
              ) : null}
            </Pressable>
          );
        }}
      />

      <View style={styles.hint}>
          <Text style={styles.hintText}>
            Вы управляете очередью этой комнаты — изменения видят все.
          </Text>
        </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    backgroundColor: colors.canvas,
  },
  emptyTitle: { marginTop: 14, color: colors.text, fontSize: 18, fontWeight: "900" },
  emptyCopy: {
    maxWidth: 280,
    marginTop: 8,
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
  cta: {
    marginTop: 18,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.medium,
    backgroundColor: colors.accent,
    paddingHorizontal: 24,
  },
  ctaText: { color: colors.canvas, fontSize: 13, fontWeight: "900" },
  header: { paddingHorizontal: 17, paddingTop: 22, paddingBottom: 18 },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  headerCopy: { flex: 1, gap: 4 },
  nowPlaying: {
    color: colors.accent,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  roomName: { color: colors.text, fontSize: 24, fontWeight: "900" },
  roomMeta: { color: colors.textMuted, fontSize: 12 },
  leaveButton: {
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.round,
    borderWidth: 1,
    borderColor: "rgba(255,107,122,0.4)",
    paddingHorizontal: 13,
  },
  leaveText: { color: colors.danger, fontSize: 12, fontWeight: "800" },
  membersRow: {
    marginTop: 13,
    flexDirection: "row",
    gap: -8,
  },
  avatar: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    borderWidth: 2,
    borderColor: "#1a1037",
    backgroundColor: "#6047c9",
  },
  avatarText: { color: "white", fontSize: 11, fontWeight: "900" },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 12, paddingBottom: 40 },
  currentCard: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: radii.large,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panel,
    padding: 13,
  },
  currentCover: { width: 54, height: 54, borderRadius: radii.medium },
  currentCopy: { flex: 1, minWidth: 0, gap: 3 },
  currentTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  currentArtist: { color: colors.textMuted, fontSize: 12 },
  transport: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  transportButton: {
    width: 36,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  playButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    backgroundColor: colors.text,
  },
  buffer: { position: "absolute", right: 14, bottom: 8 },
  noTrack: {
    marginTop: 14,
    alignItems: "center",
    padding: 26,
    borderRadius: radii.large,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
  },
  noTrackTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  noTrackCopy: {
    marginTop: 6,
    color: colors.textMuted,
    fontSize: 12,
    textAlign: "center",
  },
  row: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: radii.medium,
    paddingHorizontal: 8,
  },
  rowCurrent: {
    borderWidth: 1,
    borderColor: "rgba(102,185,255,0.24)",
    backgroundColor: "rgba(102,185,255,0.08)",
  },
  rowCover: { width: 42, height: 42, borderRadius: 11 },
  rowCoverFallback: { backgroundColor: colors.panelStrong },
  rowCopy: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { color: colors.text, fontSize: 13, fontWeight: "700" },
  rowTitleCurrent: { color: colors.accent },
  rowArtist: { color: colors.textMuted, fontSize: 11 },
  removeButton: {
    width: 38,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  removeText: { color: colors.textDim, fontSize: 24, fontWeight: "300" },
  hint: {
    marginHorizontal: 12,
    marginBottom: 12,
    alignItems: "center",
    borderRadius: radii.medium,
    backgroundColor: "rgba(66,211,146,0.09)",
    padding: 10,
  },
  hintText: { color: colors.textMuted, fontSize: 11, textAlign: "center" },
});