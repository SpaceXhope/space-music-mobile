import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { useSQLiteContext } from "expo-sqlite";
import { API_BASE_URL } from "@/api/client";
import { useAuth } from "@/features/auth/AuthProvider";
import { useLibrary } from "@/features/library/LibraryProvider";
import {
  clearWallpaper,
  loadWallpaper,
  saveWallpaper,
  type WallpaperSettings,
} from "@/features/wallpaper/wallpaper";
import { colors, radii } from "@/theme";

function SettingRow({
  title,
  description,
  trailing,
}: {
  title: string;
  description: string;
  trailing?: string;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowDescription}>{description}</Text>
      </View>
      {trailing ? <Text style={styles.trailing}>{trailing}</Text> : null}
    </View>
  );
}

export default function SettingsScreen() {
  const { user, logout } = useAuth();
  const { likedTracks, playlists, syncing, refresh } = useLibrary();
  const db = useSQLiteContext();
  const [wallpaper, setWallpaper] = useState<WallpaperSettings | null>(null);
  useEffect(() => {
    let active = true;
    void loadWallpaper(db).then((settings) => {
      if (!active) return;
      setWallpaper(settings);
    });
    return () => {
      active = false;
    };
  }, [db]);

  const applyWallpaper = useCallback(
    (patch: Partial<WallpaperSettings>) => {
      setWallpaper((current) => {
        const next = { ...(current ?? { uri: "", width: 0, height: 0, positionX: 50, positionY: 50, fit: "cover" }), ...patch };
        void saveWallpaper(db, next).catch(() => undefined);
        return next;
      });
    },
    [db],
  );

  const pickWallpaper = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Нет доступа",
        "Разрешите доступ к фотографиям, чтобы выбрать фон плеера.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    applyWallpaper({
      uri: asset.uri,
      width: asset.width,
      height: asset.height,
      positionX: 50,
      positionY: 50,
    });
  }, [applyWallpaper]);

  const removeWallpaper = useCallback(() => {
    setWallpaper(null);
    void clearWallpaper(db).catch(() => undefined);
  }, [db]);

  const changePosition = useCallback(
    (axis: "positionX" | "positionY", delta: number) => {
      setWallpaper((current) => {
        if (!current) return current;
        const value = Math.max(0, Math.min(100, current[axis] + delta));
        const next = { ...current, [axis]: value };
        void saveWallpaper(db, next).catch(() => undefined);
        return next;
      });
    },
    [db],
  );

  const confirmLogout = () =>
    Alert.alert(
      "Выйти из аккаунта?",
      "Локальный кэш останется на устройстве, но серверная библиотека будет недоступна.",
      [
        { text: "Отмена", style: "cancel" },
        { text: "Выйти", style: "destructive", onPress: () => void logout() },
      ],
    );
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.eyebrow}>SPACE MUSIC ACCOUNT</Text>
        <Text style={styles.title}>Настройки</Text>

        <View style={styles.profile}>
          {user?.avatarUrl ? (
            <Image source={{ uri: user.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarText}>
                {(user?.displayName || user?.username || "S")
                  .slice(0, 1)
                  .toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.profileCopy}>
            <Text style={styles.profileName}>
              {user?.displayName || user?.username || "Space Music"}
            </Text>
            <Text style={styles.profileMeta}>
              {user?.email ||
                (user?.username
                  ? `@${user.username}`
                  : "Синхронизированный аккаунт")}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>СИНХРОНИЗАЦИЯ</Text>
        <View style={styles.card}>
          <SettingRow
            title="Любимые треки"
            description="Общие с desktop-приложением"
            trailing={String(likedTracks.length)}
          />
          <SettingRow
            title="Плейлисты"
            description="Хранятся в аккаунте Space Music"
            trailing={String(playlists.length)}
          />
          <SettingRow
            title="Состояние"
            description="Автообновление каждые 15 секунд"
            trailing={syncing ? "Синхронизация…" : "Готово"}
          />
          <Pressable onPress={() => void refresh()} style={styles.syncButton}>
            <Text style={styles.syncButtonText}>Синхронизировать сейчас</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionLabel}>ОФОРМЛЕНИЕ</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>Фон плеера</Text>
              <Text style={styles.rowDescription}>
                Картинка на весь экран плеера, затемнённая под интерфейс
              </Text>
            </View>
            {wallpaper?.uri ? (
              <Image
                source={{ uri: wallpaper.uri }}
                style={styles.wallpaperThumb}
              />
            ) : (
              <View style={[styles.wallpaperThumb, styles.wallpaperThumbEmpty]}>
                <Text style={styles.wallpaperThumbEmptyText}>—</Text>
              </View>
            )}
          </View>
          <View style={styles.buttonRow}>
            <Pressable
              accessibilityRole="button"
              onPress={() => void pickWallpaper().catch(() => undefined)}
              style={styles.pickButton}
            >
              <Text style={styles.pickButtonText}>
                {wallpaper?.uri ? "Заменить" : "Выбрать изображение"}
              </Text>
            </Pressable>
            {wallpaper?.uri ? (
              <Pressable
                accessibilityRole="button"
                onPress={removeWallpaper}
                style={styles.clearButton}
              >
                <Text style={styles.clearButtonText}>Убрать</Text>
              </Pressable>
            ) : null}
          </View>
          {wallpaper?.uri ? (
            <>
              <View style={styles.divider} />
              <View style={styles.alignRow}>
                <Text style={styles.alignLabel}>Способ</Text>
                <View style={styles.segment}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => applyWallpaper({ fit: "cover" })}
                    style={[
                      styles.segmentButton,
                      wallpaper.fit === "cover" && styles.segmentActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        wallpaper.fit === "cover" && styles.segmentTextActive,
                      ]}
                    >
                      Заполнить
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => applyWallpaper({ fit: "contain" })}
                    style={[
                      styles.segmentButton,
                      wallpaper.fit === "contain" && styles.segmentActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        wallpaper.fit === "contain" && styles.segmentTextActive,
                      ]}
                    >
                      Целиком
                    </Text>
                  </Pressable>
                </View>
              </View>
              <View style={styles.alignRow}>
                <Text style={styles.alignLabel}>По горизонтали</Text>
                <View style={styles.stepper}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Сдвинуть фон влево"
                    disabled={wallpaper.positionX <= 0}
                    onPress={() => changePosition("positionX", -5)}
                    style={[
                      styles.stepButton,
                      wallpaper.positionX <= 0 && styles.stepDisabled,
                    ]}
                  >
                    <Text style={styles.stepText}>−</Text>
                  </Pressable>
                  <Text style={styles.stepValue}>{wallpaper.positionX}%</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Сдвинуть фон вправо"
                    disabled={wallpaper.positionX >= 100}
                    onPress={() => changePosition("positionX", 5)}
                    style={[
                      styles.stepButton,
                      wallpaper.positionX >= 100 && styles.stepDisabled,
                    ]}
                  >
                    <Text style={styles.stepText}>+</Text>
                  </Pressable>
                </View>
              </View>
              <View style={styles.alignRow}>
                <Text style={styles.alignLabel}>По вертикали</Text>
                <View style={styles.stepper}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Сдвинуть фон вверх"
                    disabled={wallpaper.positionY <= 0}
                    onPress={() => changePosition("positionY", -5)}
                    style={[
                      styles.stepButton,
                      wallpaper.positionY <= 0 && styles.stepDisabled,
                    ]}
                  >
                    <Text style={styles.stepText}>−</Text>
                  </Pressable>
                  <Text style={styles.stepValue}>{wallpaper.positionY}%</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Сдвинуть фон вниз"
                    disabled={wallpaper.positionY >= 100}
                    onPress={() => changePosition("positionY", 5)}
                    style={[
                      styles.stepButton,
                      wallpaper.positionY >= 100 && styles.stepDisabled,
                    ]}
                  >
                    <Text style={styles.stepText}>+</Text>
                  </Pressable>
                </View>
              </View>
            </>
          ) : null}
        </View>

        <Text style={styles.sectionLabel}>ПРИЛОЖЕНИЕ</Text>
        <View style={styles.card}>
          <SettingRow
            title="Фоновое воспроизведение"
            description="Управление на экране блокировки Android и iOS"
            trailing="Вкл."
          />
          <SettingRow title="API" description={API_BASE_URL} trailing="0.3.3" />
        </View>

        <Pressable onPress={confirmLogout} style={styles.logout}>
          <Text style={styles.logoutText}>Выйти из аккаунта</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
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
  profile: {
    marginTop: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    borderRadius: radii.large,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panel,
    padding: 13,
  },
  avatar: { width: 58, height: 58, borderRadius: 19 },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#6047c9",
  },
  avatarText: { color: "white", fontSize: 20, fontWeight: "900" },
  profileCopy: { flex: 1, gap: 5 },
  profileName: { color: colors.text, fontSize: 17, fontWeight: "800" },
  profileMeta: { color: colors.textMuted, fontSize: 11 },
  sectionLabel: {
    marginTop: 28,
    marginBottom: 9,
    color: colors.textDim,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  card: {
    overflow: "hidden",
    borderRadius: radii.large,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
  },
  row: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowCopy: { flex: 1, gap: 4 },
  rowTitle: { color: colors.text, fontSize: 13, fontWeight: "700" },
  rowDescription: { color: colors.textMuted, fontSize: 10.5 },
  trailing: {
    maxWidth: 110,
    color: colors.accent,
    fontSize: 11,
    fontWeight: "800",
    textAlign: "right",
  },
  syncButton: { height: 48, alignItems: "center", justifyContent: "center" },
  syncButtonText: { color: colors.text, fontSize: 12, fontWeight: "800" },
  wallpaperThumb: { width: 46, height: 46, borderRadius: 12 },
  wallpaperThumbEmpty: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.canvasSoft,
  },
  wallpaperThumbEmptyText: { color: colors.textDim, fontSize: 14 },
  buttonRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 13,
  },
  pickButton: {
    flex: 1,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.medium,
    backgroundColor: colors.accent,
  },
  pickButtonText: { color: colors.canvas, fontSize: 12, fontWeight: "900" },
  clearButton: {
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.medium,
    borderWidth: 1,
    borderColor: "rgba(255,107,122,0.4)",
    paddingHorizontal: 14,
  },
  clearButtonText: { color: colors.danger, fontSize: 12, fontWeight: "800" },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 14,
    backgroundColor: colors.border,
  },
  alignRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 14,
  },
  alignLabel: { color: colors.textMuted, fontSize: 12 },
  segment: {
    flexDirection: "row",
    borderRadius: radii.medium,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.canvasSoft,
    padding: 2,
  },
  segmentButton: {
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.small,
    paddingHorizontal: 12,
  },
  segmentActive: { backgroundColor: "rgba(102,185,255,0.16)" },
  segmentText: { color: colors.textMuted, fontSize: 11, fontWeight: "700" },
  segmentTextActive: { color: colors.accent },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  stepButton: {
    width: 40,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.medium,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.canvasSoft,
  },
  stepDisabled: { opacity: 0.35 },
  stepText: { color: colors.text, fontSize: 18, fontWeight: "800" },
  stepValue: {
    width: 40,
    color: colors.text,
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  logout: {
    height: 52,
    marginTop: 22,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.medium,
    backgroundColor: "rgba(255,107,122,0.1)",
  },
  logoutText: { color: colors.danger, fontSize: 13, fontWeight: "800" },
});
