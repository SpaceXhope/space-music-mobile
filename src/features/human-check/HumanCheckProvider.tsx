import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type PropsWithChildren,
} from "react";
import * as Crypto from "expo-crypto";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { API_BASE_URL, MobileApiError } from "@/api/client";
import { abortError, throwIfAborted, type HumanCheckRequest } from "@/api/authChallenge";
import { colors, radii } from "@/theme";
import { humanCheckBridge, humanCheckNavigationAllowed, humanCheckPageUrl, parseHumanCheckMessage } from "./bridge";

type Prompt = (request: HumanCheckRequest) => Promise<string | null>;
interface PendingCheck extends HumanCheckRequest {
  channel: string;
  resolve: (token: string | null) => void;
  reject: (error: Error) => void;
  cleanup: () => void;
}
const HumanCheckContext = createContext<Prompt | null>(null);

export function HumanCheckProvider({ children }: PropsWithChildren) {
  const pending = useRef<PendingCheck | null>(null);
  const [request, setRequest] = useState<PendingCheck | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<"loading" | "ready" | "error" | "expired">("loading");

  const finish = useCallback((token: string | null, error?: Error) => {
    const current = pending.current;
    if (!current) return;
    pending.current = null;
    current.cleanup();
    setRequest(null);
    if (error) current.reject(error);
    else current.resolve(token);
  }, []);

  const prompt = useCallback<Prompt>((input) => {
    throwIfAborted(input.signal);
    if (pending.current) return Promise.reject(new MobileApiError(428, "Проверка входа уже открыта.", "HUMAN_CHECK_BUSY"));
    const channel = Crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const abort = () => finish(null, abortError());
      const timer = setTimeout(() => finish(null, new MobileApiError(428, "Время проверки входа истекло. Повторите попытку.", "HUMAN_CHECK_TIMEOUT")), 180_000);
      const next: PendingCheck = {
        ...input, channel, resolve, reject,
        cleanup: () => {
          clearTimeout(timer);
          input.signal?.removeEventListener("abort", abort);
        },
      };
      pending.current = next;
      input.signal?.addEventListener("abort", abort, { once: true });
      setAttempt(0);
      setPhase("loading");
      setRequest(next);
    });
  }, [finish]);

  useEffect(() => () => {
    const current = pending.current;
    pending.current = null;
    current?.cleanup();
    current?.reject(abortError());
  }, []);

  const script = useMemo(() => request ? humanCheckBridge(API_BASE_URL, request.action, request.channel) : "", [request]);
  return (
    <HumanCheckContext.Provider value={prompt}>
      {children}
      <Modal visible={request !== null} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => finish(null)}>
        <SafeAreaView style={styles.root}>
          <View style={styles.header}>
            <Text style={styles.title}>Проверка входа</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Закрыть проверку" onPress={() => finish(null)} style={styles.button}>
              <Text style={styles.buttonText}>Отмена</Text>
            </Pressable>
          </View>
          <Text style={styles.copy}>Пройдите проверку Cloudflare в этом окне. VPN можно оставить включённым.</Text>
          {request ? (
            <WebView
              key={`${request.channel}-${attempt}`}
              source={{ uri: humanCheckPageUrl(API_BASE_URL, request.action) }}
              style={styles.webview}
              originWhitelist={["https://*"]}
              injectedJavaScriptBeforeContentLoaded={script}
              injectedJavaScript={script}
              injectedJavaScriptBeforeContentLoadedForMainFrameOnly
              injectedJavaScriptForMainFrameOnly
              javaScriptEnabled
              domStorageEnabled
              setSupportMultipleWindows={false}
              javaScriptCanOpenWindowsAutomatically={false}
              allowsInlineMediaPlayback={false}
              mediaPlaybackRequiresUserAction
              allowFileAccess={false}
              allowFileAccessFromFileURLs={false}
              allowUniversalAccessFromFileURLs={false}
              mixedContentMode="never"
              onShouldStartLoadWithRequest={(navigation) => humanCheckNavigationAllowed(navigation.url, navigation.isTopFrame ?? true, API_BASE_URL, request.action)}
              onLoadStart={() => setPhase("loading")}
              onLoadEnd={() => setPhase((value) => value === "loading" ? "ready" : value)}
              onError={() => setPhase("error")}
              onHttpError={(event) => { if (event.nativeEvent.statusCode !== 403) setPhase("error"); }}
              onContentProcessDidTerminate={() => setPhase("error")}
              onRenderProcessGone={() => setPhase("error")}
              onMessage={(event) => {
                if (pending.current?.channel !== request.channel) return;
                const result = parseHumanCheckMessage(event.nativeEvent.data, event.nativeEvent.url, API_BASE_URL, request.action, request.channel);
                if (result?.type === "token") finish(result.token!);
                else if (result) setPhase(result.type);
              }}
            />
          ) : null}
          <View style={styles.footer}>
            {phase === "loading" ? <ActivityIndicator color={colors.accent} /> : null}
            <Text accessibilityLiveRegion="polite" style={styles.status}>
              {phase === "loading" ? "Открываем проверку…" : phase === "error" ? "Не удалось загрузить проверку. Проверьте подключение и попробуйте снова." : phase === "expired" ? "Проверка истекла. Обновите страницу." : "Завершите проверку на странице выше."}
            </Text>
            <Pressable accessibilityRole="button" onPress={() => { setPhase("loading"); setAttempt((value) => value + 1); }} style={styles.button}>
              <Text style={styles.buttonText}>Обновить</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>
    </HumanCheckContext.Provider>
  );
}

export function useHumanCheck(): Prompt {
  const prompt = useContext(HumanCheckContext);
  if (!prompt) throw new Error("useHumanCheck must be used inside HumanCheckProvider");
  return prompt;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, gap: 12 },
  title: { flex: 1, color: colors.text, fontSize: 20, fontWeight: "800" },
  copy: { paddingHorizontal: 16, paddingBottom: 16, color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  webview: { flex: 1, backgroundColor: colors.canvasSoft },
  footer: { padding: 16, gap: 12, alignItems: "center" },
  status: { color: colors.textMuted, textAlign: "center", fontSize: 13, lineHeight: 19 },
  button: { minHeight: 44, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", borderRadius: radii.medium, backgroundColor: colors.panelSoft },
  buttonText: { color: colors.text, fontSize: 13, fontWeight: "700" },
});
