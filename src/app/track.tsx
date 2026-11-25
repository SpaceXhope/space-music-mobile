import { useEffect, useMemo, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { mobileApi } from "@/api/client";
import { isCatalogTrackId } from "@/domain/share";
import { trackFromApi } from "@/domain/music";
import { usePlayer } from "@/features/player/PlayerProvider";
import { colors, radii } from "@/theme";

export default function SharedTrackScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = useMemo(
    () => (typeof params.id === "string" ? params.id : null),
    [params.id],
  );
  const { playTrack } = usePlayer();
  const [error, setError] = useState<string | null>(null);
  const visibleError = isCatalogTrackId(id)
    ? error
    : "Ссылка на трек имеет неверный формат.";

  useEffect(() => {
    if (!isCatalogTrackId(id)) return;
    const controller = new AbortController();
    void mobileApi
      .getTrack(id, controller.signal)
      .then(trackFromApi)
      .then((track) => playTrack(track))
      .then(() => router.replace("/player"))
      .catch((nextError: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Не удалось открыть этот трек.",
        );
      });
    return () => controller.abort();
  }, [id, playTrack]);

  return (
    <View style={styles.root}>
      {visibleError ? (
        <>
          <Text style={styles.error}>{visibleError}</Text>
          <Pressable
            onPress={() => router.replace("/(tabs)")}
            style={styles.button}
          >
            <Text style={styles.buttonText}>На главную</Text>
          </Pressable>
        </>
      ) : (
        <>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={styles.status}>Загружаю трек…</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    backgroundColor: colors.canvas,
    padding: 24,
  },
  status: { color: colors.textMuted, fontSize: 13 },
  error: {
    maxWidth: 340,
    color: colors.danger,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
  },
  button: {
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.round,
    backgroundColor: colors.text,
    paddingHorizontal: 20,
  },
  buttonText: { color: colors.canvas, fontSize: 12, fontWeight: "900" },
});
