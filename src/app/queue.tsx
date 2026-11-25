import { Stack } from "expo-router";
import {
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { usePlayer } from "@/features/player/PlayerProvider";
import { colors, radii } from "@/theme";

const REPEAT_LABEL = {
  off: "Выкл.",
  all: "Все",
  one: "Один",
} as const;

export default function QueueScreen() {
  const {
    queue,
    currentIndex,
    shuffleEnabled,
    repeatMode,
    playIndex,
    toggleShuffle,
    cycleRepeatMode,
    removeFromQueue,
    clearUpcoming,
  } = usePlayer();
  const upcomingCount = Math.max(0, queue.length - currentIndex - 1);

  return (
    <>
      <Stack.Screen options={{ title: `Очередь · ${queue.length}` }} />
      <FlatList
        style={styles.list}
        data={queue}
        keyExtractor={(track, index) => `${track.id}-${index}`}
        contentContainerStyle={[
          styles.content,
          queue.length === 0 && styles.emptyContent,
        ]}
        ListHeaderComponent={
          queue.length > 0 ? (
            <View style={styles.header}>
              <View style={styles.headerCopy}>
                <Text style={styles.eyebrow}>ТЕКУЩАЯ СЕССИЯ</Text>
                <Text style={styles.title}>Дальше в очереди</Text>
                <Text style={styles.subtitle}>
                  {upcomingCount > 0
                    ? `${upcomingCount} ${upcomingCount === 1 ? "трек" : "треков"} после текущего`
                    : "Это последний трек"}
                </Text>
              </View>
              <View style={styles.modeRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Переключить случайный порядок"
                  accessibilityState={{ selected: shuffleEnabled }}
                  onPress={toggleShuffle}
                  style={[
                    styles.modeButton,
                    shuffleEnabled && styles.modeButtonActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.modeIcon,
                      shuffleEnabled && styles.modeTextActive,
                    ]}
                  >
                    ⇄
                  </Text>
                  <Text
                    style={[
                      styles.modeLabel,
                      shuffleEnabled && styles.modeTextActive,
                    ]}
                  >
                    Случайно
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Режим повтора: ${REPEAT_LABEL[repeatMode]}`}
                  onPress={cycleRepeatMode}
                  style={[
                    styles.modeButton,
                    repeatMode !== "off" && styles.modeButtonActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.modeIcon,
                      repeatMode !== "off" && styles.modeTextActive,
                    ]}
                  >
                    {repeatMode === "one" ? "↻¹" : "↻"}
                  </Text>
                  <Text
                    style={[
                      styles.modeLabel,
                      repeatMode !== "off" && styles.modeTextActive,
                    ]}
                  >
                    {REPEAT_LABEL[repeatMode]}
                  </Text>
                </Pressable>
                {upcomingCount > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Очистить следующие треки"
                    onPress={clearUpcoming}
                    style={styles.clearButton}
                  >
                    <Text style={styles.clearText}>Очистить далее</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : undefined
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Text style={styles.emptyNote}>♪</Text>
            </View>
            <Text style={styles.emptyTitle}>Очередь пока пуста</Text>
            <Text style={styles.emptyCopy}>
              Запустите трек из поиска, микса или медиатеки.
            </Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const current = index === currentIndex;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${current ? "Сейчас играет" : "Включить"}: ${item.title}`}
              onPress={() =>
                void playIndex(index).catch((nextError) =>
                  Alert.alert(
                    "Не удалось воспроизвести",
                    nextError instanceof Error
                      ? nextError.message
                      : "Поток недоступен",
                  ),
                )
              }
              style={({ pressed }) => [
                styles.row,
                current && styles.rowCurrent,
                pressed && styles.rowPressed,
              ]}
            >
              <View style={styles.orderBox}>
                <Text style={[styles.order, current && styles.currentOrder]}>
                  {current ? "▶" : index + 1}
                </Text>
              </View>
              {item.coverUrl ? (
                <Image source={{ uri: item.coverUrl }} style={styles.cover} />
              ) : (
                <LinearGradient
                  colors={["#7455ed", "#c87cff"]}
                  style={styles.cover}
                />
              )}
              <View style={styles.rowCopy}>
                <Text
                  numberOfLines={1}
                  style={[styles.trackTitle, current && styles.currentTitle]}
                >
                  {item.title}
                </Text>
                <Text numberOfLines={1} style={styles.artist}>
                  {item.artists.join(", ")}
                </Text>
                {current ? <Text style={styles.playing}>СЕЙЧАС ИГРАЕТ</Text> : null}
              </View>
              {!current ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Убрать ${item.title} из очереди`}
                  hitSlop={10}
                  onPress={(event) => {
                    event.stopPropagation();
                    removeFromQueue(index);
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
    </>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingHorizontal: 12, paddingBottom: 170 },
  emptyContent: { flexGrow: 1 },
  header: { paddingHorizontal: 4, paddingTop: 20, paddingBottom: 18 },
  headerCopy: { gap: 5 },
  eyebrow: {
    color: colors.accent,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.7,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: -0.8,
  },
  subtitle: { color: colors.textMuted, fontSize: 12 },
  modeRow: { marginTop: 17, flexDirection: "row", alignItems: "center", gap: 8 },
  modeButton: {
    height: 42,
    minWidth: 88,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: radii.round,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    paddingHorizontal: 12,
  },
  modeButtonActive: {
    borderColor: "rgba(102,185,255,0.45)",
    backgroundColor: "rgba(102,185,255,0.12)",
  },
  modeIcon: { color: colors.textMuted, fontSize: 17, fontWeight: "800" },
  modeLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "800" },
  modeTextActive: { color: colors.accent },
  clearButton: {
    height: 42,
    marginLeft: "auto",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  clearText: { color: colors.danger, fontSize: 11, fontWeight: "800" },
  row: {
    minHeight: 72,
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
  rowPressed: { opacity: 0.72 },
  orderBox: { width: 25, alignItems: "center" },
  order: { color: colors.textDim, fontSize: 11, fontVariant: ["tabular-nums"] },
  currentOrder: { color: colors.accent, fontSize: 13 },
  cover: { width: 50, height: 50, borderRadius: 13 },
  rowCopy: { flex: 1, minWidth: 0, gap: 3 },
  trackTitle: { color: colors.text, fontSize: 14, fontWeight: "700" },
  currentTitle: { color: colors.accent },
  artist: { color: colors.textMuted, fontSize: 11.5 },
  playing: { color: colors.accent, fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  removeButton: {
    width: 40,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
  },
  removeText: { color: colors.textDim, fontSize: 25, fontWeight: "300" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  emptyIcon: {
    width: 78,
    height: 78,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
    backgroundColor: colors.panel,
  },
  emptyNote: { color: colors.accent, fontSize: 34 },
  emptyTitle: { marginTop: 18, color: colors.text, fontSize: 19, fontWeight: "900" },
  emptyCopy: {
    maxWidth: 280,
    marginTop: 7,
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
});
