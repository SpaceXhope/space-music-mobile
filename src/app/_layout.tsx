import { Stack, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SQLiteProvider } from "expo-sqlite";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { PlayerBar } from "@/components/PlayerBar";
import { AuthProvider, useAuth } from "@/features/auth/AuthProvider";
import { LibraryProvider } from "@/features/library/LibraryProvider";
import { PlayerProvider } from "@/features/player/PlayerProvider";
import { RoomsProvider } from "@/features/rooms/RoomsProvider";
import { HumanCheckProvider } from "@/features/human-check/HumanCheckProvider";
import { migrateDatabase } from "@/storage/database";
import { colors } from "@/theme";

function Navigation() {
  const { status } = useAuth();
  const pathname = usePathname();
  if (status === "initializing") {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }
  const authenticated = status === "authenticated";
  return (
    <LibraryProvider>
      <PlayerProvider>
        <RoomsProvider>
          <View style={styles.root}>
            <StatusBar style="light" />
            <Stack
              screenOptions={{
                contentStyle: { backgroundColor: colors.canvas },
                headerStyle: { backgroundColor: colors.canvasSoft },
                headerTintColor: colors.text,
                headerShadowVisible: false,
              }}
            >
              <Stack.Protected guard={!authenticated} redirectTo="/(tabs)">
                <Stack.Screen name="login" options={{ headerShown: false }} />
              </Stack.Protected>
              <Stack.Protected guard={authenticated} redirectTo="/login">
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="likes" options={{ title: "Любимые треки" }} />
                <Stack.Screen
                  name="playlist/[id]"
                  options={{ title: "Плейлист", headerBackTitle: "Назад" }}
                />
                <Stack.Screen
                  name="player"
                  options={{ presentation: "modal", headerShown: false }}
                />
                <Stack.Screen
                  name="track"
                  options={{ title: "Открываю трек", headerBackTitle: "Назад" }}
                />
                <Stack.Screen
                  name="queue"
                  options={{ title: "Очередь", headerBackTitle: "Назад" }}
                />
                <Stack.Screen
                  name="lyrics"
                  options={{ presentation: "modal", headerShown: false }}
                />
                <Stack.Screen
                  name="room"
                  options={{ title: "Комната", headerBackTitle: "Назад" }}
                />
              </Stack.Protected>
            </Stack>
            {authenticated &&
            pathname !== "/player" &&
            pathname !== "/lyrics" &&
            pathname !== "/track" ? (
              <PlayerBar />
            ) : null}
          </View>
        </RoomsProvider>
      </PlayerProvider>
    </LibraryProvider>
  );
}

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName="space-music.db" onInit={migrateDatabase}>
      <HumanCheckProvider>
        <AuthProvider>
          <Navigation />
        </AuthProvider>
      </HumanCheckProvider>
    </SQLiteProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.canvas,
  },
});
