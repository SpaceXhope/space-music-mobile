import { useMemo, useState } from "react";
import { router } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRooms } from "@/features/rooms/RoomsProvider";
import { colors, radii } from "@/theme";
import { MusicGlyph } from "@/components/MusicGlyph";

function CodeInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={(next) =>
        onChange(next.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))
      }
      placeholder="Код комнаты"
      placeholderTextColor={colors.textDim}
      autoCapitalize="characters"
      autoCorrect={false}
      maxLength={6}
      style={styles.codeInput}
    />
  );
}

export default function RoomsScreen() {
  const {
    rooms,
    loading,
    error,
    activeRoom,
    createRoom,
    joinRoom,
    refreshRooms,
    setActiveRoom,
  } = useRooms();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const sorted = useMemo(
    () =>
      [...rooms].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [rooms],
  );

  const run = async (job: () => Promise<{ id: string }>) => {
    setBusy(true);
    try {
      await job();
      router.push("/room");
    } catch (nextError) {
      Alert.alert(
        "Не удалось",
        nextError instanceof Error ? nextError.message : "Попробуйте ещё раз",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={styles.safe}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.eyebrow}>СОВМЕСТНОЕ ПРОСЛУШИВАНИЕ</Text>
      <Text style={styles.title}>Комнаты</Text>
      <Text style={styles.subtitle}>
        Любой участник комнаты может ставить треки, листать очередь и менять
        позицию — общий плейлист на всех устройствах.
      </Text>

      {activeRoom ? (
        <Pressable
          onPress={() => router.push("/room")}
          style={styles.activeCard}
        >
          <View style={styles.activeCopy}>
            <Text style={styles.activeKicker}>
              В КОМНАТЕ · {activeRoom.memberCount}{" "}
              {activeRoom.memberCount === 1 ? "участник" : "участника"}
            </Text>
            <Text style={styles.activeName}>{activeRoom.name}</Text>
            <Text style={styles.activeCode}>Код: {activeRoom.joinCode}</Text>
          </View>
          <MusicGlyph kind="room" size={26} color={colors.accent} />
        </Pressable>
      ) : null}

      <Text style={styles.sectionLabel}>СОЗДАТЬ КОМНАТУ</Text>
      <View style={styles.card}>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Название комнаты"
          placeholderTextColor={colors.textDim}
          maxLength={60}
          style={styles.nameInput}
        />
        <Pressable
          accessibilityRole="button"
          disabled={busy || name.trim().length === 0}
          onPress={() => void run(() => createRoom(name.trim()))}
          style={[
            styles.primaryButton,
            (busy || name.trim().length === 0) && styles.buttonDisabled,
          ]}
        >
          {busy ? (
            <ActivityIndicator color={colors.canvas} size="small" />
          ) : (
            <Text style={styles.primaryText}>Создать комнату</Text>
          )}
        </Pressable>
      </View>

      <Text style={styles.sectionLabel}>ВОЙТИ ПО КОДУ</Text>
      <View style={styles.card}>
        <View style={styles.codeRow}>
          <CodeInput value={code} onChange={setCode} />
          <Pressable
            accessibilityRole="button"
            disabled={busy || code.length < 4}
            onPress={() => void run(() => joinRoom(code))}
            style={[
              styles.joinButton,
              (busy || code.length < 4) && styles.buttonDisabled,
            ]}
          >
            <Text style={styles.joinText}>Войти</Text>
          </Pressable>
        </View>
      </View>

      <Text style={styles.sectionLabel}>МОИ КОМНАТЫ</Text>
      {loading ? (
        <ActivityIndicator color={colors.accent} style={styles.loader} />
      ) : sorted.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Пока нет комнат</Text>
          <Text style={styles.emptyCopy}>
            Создайте комнату и отправьте код другу — оба сможете управлять
            очередью.
          </Text>
        </View>
      ) : (
        sorted.map((room) => (
          <Pressable
            key={room.id}
            onPress={() => {
              setActiveRoom({
                id: room.id,
                name: room.name,
                joinCode: "",
                ownerId: room.ownerId,
                revision: room.revision,
                memberCount: room.memberCount,
                updatedAt: room.updatedAt,
                role: "member",
                members: [],
                state: {
                  queue: [],
                  currentIndex: -1,
                  playing: false,
                  position: 0,
                },
              } as never);
              router.push("/room");
            }}
            style={styles.roomRow}
          >
            <View style={styles.roomIcon}>
              <MusicGlyph kind="room" size={20} color={colors.accent} />
            </View>
            <View style={styles.roomCopy}>
              <Text numberOfLines={1} style={styles.roomName}>
                {room.name}
              </Text>
              <Text style={styles.roomMeta}>
                {room.memberCount}{" "}
                {room.memberCount === 1 ? "участник" : "участника"} · обновлена{" "}
                {new Date(room.updatedAt).toLocaleTimeString("ru-RU", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Text>
            </View>
            <Text style={styles.roomChevron}>›</Text>
          </Pressable>
        ))
      )}

      {error ? (
        <Pressable onPress={() => void refreshRooms()} style={styles.errorRow}>
          <Text style={styles.errorText}>{error} — нажмите, чтобы повторить</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingHorizontal: 17, paddingTop: 24, paddingBottom: 180 },
  eyebrow: {
    color: colors.accent,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.8,
  },
  title: {
    marginTop: 4,
    color: colors.text,
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: -1,
  },
  subtitle: {
    marginTop: 8,
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  activeCard: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: radii.large,
    borderWidth: 1,
    borderColor: "rgba(102,185,255,0.45)",
    backgroundColor: "rgba(102,185,255,0.10)",
    padding: 16,
  },
  activeCopy: { flex: 1, gap: 4 },
  activeKicker: {
    color: colors.accent,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.3,
  },
  activeName: { color: colors.text, fontSize: 18, fontWeight: "900" },
  activeCode: {
    color: colors.textMuted,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  sectionLabel: {
    marginTop: 28,
    marginBottom: 9,
    color: colors.textDim,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  card: {
    gap: 12,
    borderRadius: radii.large,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    padding: 13,
  },
  nameInput: {
    height: 48,
    borderRadius: radii.medium,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.canvasSoft,
    paddingHorizontal: 13,
    color: colors.text,
    fontSize: 14,
  },
  codeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  codeInput: {
    flex: 1,
    height: 48,
    borderRadius: radii.medium,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.canvasSoft,
    paddingHorizontal: 13,
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 2,
  },
  primaryButton: {
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.medium,
    backgroundColor: colors.accent,
  },
  joinButton: {
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.medium,
    backgroundColor: colors.accent,
    paddingHorizontal: 20,
  },
  primaryText: { color: colors.canvas, fontSize: 13, fontWeight: "900" },
  joinText: { color: colors.canvas, fontSize: 13, fontWeight: "900" },
  buttonDisabled: { opacity: 0.4 },
  loader: { marginTop: 24 },
  empty: {
    alignItems: "center",
    paddingHorizontal: 26,
    paddingVertical: 26,
    borderRadius: radii.large,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
  },
  emptyTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
  emptyCopy: {
    marginTop: 6,
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
  },
  roomRow: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: radii.medium,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    paddingHorizontal: 12,
    marginBottom: 9,
  },
  roomIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: "rgba(102,185,255,0.12)",
  },
  roomCopy: { flex: 1, gap: 3 },
  roomName: { color: colors.text, fontSize: 14, fontWeight: "800" },
  roomMeta: { color: colors.textMuted, fontSize: 11 },
  roomChevron: { color: colors.textDim, fontSize: 22 },
  errorRow: {
    marginTop: 16,
    padding: 12,
    borderRadius: radii.medium,
    backgroundColor: "rgba(255,107,122,0.1)",
  },
  errorText: { color: colors.danger, fontSize: 11, textAlign: "center" },
});