import { useEffect, useRef, useState } from "react";
import { LinearGradient } from "expo-linear-gradient";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/features/auth/AuthProvider";
import type { AuthPhase } from "@/api/authChallenge";
import { colors, radii } from "@/theme";

export default function LoginScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<AuthPhase>("challenge");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  const submit = async () => {
    if (controller.current) return;
    if (!email.includes("@") || password.length < 8) {
      setError("Введите корректную почту и пароль не короче 8 символов.");
      return;
    }
    setBusy(true);
    setError("");
    const attempt = new AbortController();
    controller.current = attempt;
    const options = { signal: attempt.signal, onPhase: setPhase };
    Keyboard.dismiss();
    try {
      if (mode === "login") await login(email, password, options);
      else {
        if (!/^[a-z0-9_]{3,30}$/.test(username.trim().toLowerCase())) {
          throw new Error("Имя пользователя: 3–30 символов a-z, 0-9 или _");
        }
        await register(email, password, username, displayName || username, options);
      }
    } catch (nextError) {
      if (attempt.signal.aborted) return;
      const message =
        nextError instanceof Error
          ? nextError.message
          : "Не удалось войти в Space Music";
      setError(message);
      Alert.alert(
        mode === "login" ? "Не удалось войти" : "Не удалось зарегистрироваться",
        message,
      );
    } finally {
      if (controller.current === attempt) controller.current = null;
      setBusy(false);
    }
  };

  return (
    <LinearGradient
      colors={["#07050f", "#0d0820", "#070914"]}
      style={styles.root}
    >
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={styles.safe}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.planet}>
              <View style={styles.planetCore} />
              <View style={styles.ring} />
            </View>
            <Text style={styles.brand}>SPACE MUSIC</Text>
            <Text style={styles.title}>Вся музыка синхронизирована</Text>
            <Text style={styles.subtitle}>
              Войдите в тот же аккаунт, что и на ПК. Лайки и плейлисты будут
              общими.
            </Text>

            <View style={styles.card}>
              <View style={styles.tabs}>
                {(["login", "register"] as const).map((item) => (
                  <Pressable
                    key={item}
                    disabled={busy}
                    onPress={() => {
                      setMode(item);
                      setError("");
                    }}
                    style={[styles.tab, mode === item && styles.tabActive]}
                  >
                    <Text
                      style={[
                        styles.tabText,
                        mode === item && styles.tabTextActive,
                      ]}
                    >
                      {item === "login" ? "Войти" : "Регистрация"}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <TextInput
                editable={!busy}
                value={email}
                onChangeText={setEmail}
                placeholder="Электронная почта"
                placeholderTextColor={colors.textDim}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                textContentType="emailAddress"
                style={styles.input}
              />
              <TextInput
                editable={!busy}
                value={password}
                onChangeText={setPassword}
                placeholder="Пароль"
                placeholderTextColor={colors.textDim}
                autoCapitalize="none"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                textContentType={
                  mode === "login" ? "password" : "newPassword"
                }
                secureTextEntry
                returnKeyType={mode === "login" ? "done" : "next"}
                onSubmitEditing={
                  mode === "login" ? () => void submit() : undefined
                }
                style={styles.input}
              />
              {mode === "register" ? (
                <>
                  <TextInput
                    editable={!busy}
                    value={username}
                    onChangeText={setUsername}
                    placeholder="Имя пользователя"
                    placeholderTextColor={colors.textDim}
                    autoCapitalize="none"
                    style={styles.input}
                  />
                  <TextInput
                    editable={!busy}
                    value={displayName}
                    onChangeText={setDisplayName}
                    placeholder="Отображаемое имя"
                    placeholderTextColor={colors.textDim}
                    style={styles.input}
                  />
                </>
              ) : null}
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Pressable
                disabled={busy}
                onPress={() => void submit()}
                style={[styles.button, busy && styles.buttonBusy]}
              >
                {busy ? (
                  <ActivityIndicator color="#100b20" />
                ) : (
                  <Text style={styles.buttonText}>
                    {mode === "login" ? "Продолжить" : "Создать аккаунт"}
                  </Text>
                )}
              </Pressable>
              {busy ? (
                <View style={styles.checkProgress}>
                  <Text accessibilityLiveRegion="polite" style={styles.checkLabel}>
                    {phase === "challenge" ? "Запрашиваем проверку…" : phase === "human-check" ? "Ожидаем проверку Cloudflare…" : phase === "proof-of-work" ? "Выполняем проверку устройства…" : "Входим в аккаунт…"}
                  </Text>
                  <Pressable accessibilityRole="button" onPress={() => controller.current?.abort()} style={styles.cancel}>
                    <Text style={styles.checkLabel}>Отмена</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 22,
    paddingBottom: 38,
  },
  planet: {
    width: 86,
    height: 86,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
  },
  planetCore: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#8067ef",
    shadowColor: "#9b85ff",
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 12,
  },
  ring: {
    position: "absolute",
    width: 88,
    height: 32,
    borderRadius: 44,
    borderWidth: 2,
    borderColor: "rgba(220,211,255,0.7)",
    transform: [{ rotate: "-14deg" }],
  },
  brand: {
    marginTop: 12,
    color: colors.accent,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2.4,
  },
  title: {
    marginTop: 12,
    color: colors.text,
    textAlign: "center",
    fontSize: 30,
    lineHeight: 34,
    fontWeight: "900",
    letterSpacing: -1,
  },
  subtitle: {
    alignSelf: "center",
    maxWidth: 340,
    marginTop: 10,
    color: colors.textMuted,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 19,
  },
  card: {
    marginTop: 28,
    gap: 11,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: "rgba(17,13,31,0.92)",
    padding: 14,
  },
  tabs: { flexDirection: "row", gap: 7, marginBottom: 2 },
  tab: {
    flex: 1,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: colors.panelSoft,
  },
  tabActive: { backgroundColor: "#7455ed" },
  tabText: { color: colors.textMuted, fontSize: 13, fontWeight: "700" },
  tabTextActive: { color: "white" },
  input: {
    height: 52,
    borderRadius: radii.medium,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: "rgba(7,7,16,0.72)",
    color: colors.text,
    paddingHorizontal: 14,
    fontSize: 14,
  },
  error: { color: colors.danger, fontSize: 12, lineHeight: 17 },
  button: {
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.medium,
    backgroundColor: "#b9a9ff",
  },
  buttonText: { color: "#100b20", fontSize: 14, fontWeight: "900" },
  buttonBusy: { opacity: 0.7 },
  checkProgress: { alignItems: "center", gap: 3 },
  checkLabel: { color: colors.textMuted, fontSize: 12, textAlign: "center" },
  cancel: { minHeight: 44, paddingHorizontal: 20, alignItems: "center", justifyContent: "center" },
});
