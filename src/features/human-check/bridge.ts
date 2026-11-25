import type { AuthPurpose } from "@/api/authChallenge";

interface CheckResult {
  type: "token" | "error" | "expired";
  token?: string;
}

export function humanCheckPageUrl(apiBaseUrl: string, action: AuthPurpose): string {
  return `${apiBaseUrl.replace(/\/+$/, "")}/v1/auth/verify?action=${action}`;
}

function isVerificationPage(url: URL, apiBaseUrl: string, action: AuthPurpose): boolean {
  return url.protocol === "https:" && url.origin === new URL(apiBaseUrl).origin &&
    url.pathname === "/v1/auth/verify" && url.searchParams.get("action") === action;
}

export function humanCheckNavigationAllowed(
  url: string,
  isTopFrame: boolean,
  apiBaseUrl: string,
  action: AuthPurpose,
): boolean {
  try {
    const parsed = new URL(url);
    if (isVerificationPage(parsed, apiBaseUrl, action)) return true;
    if (parsed.protocol !== "https:") return false;
    if (parsed.origin === new URL(apiBaseUrl).origin && parsed.pathname.startsWith("/cdn-cgi/challenge-platform/")) return true;
    return !isTopFrame && parsed.origin === "https://challenges.cloudflare.com";
  } catch { return false; }
}

export function parseHumanCheckMessage(
  serialized: string,
  pageUrl: string,
  apiBaseUrl: string,
  action: AuthPurpose,
  channel: string,
): CheckResult | null {
  if (serialized.length > 8192) return null;
  try {
    if (!isVerificationPage(new URL(pageUrl), apiBaseUrl, action)) return null;
    const data = JSON.parse(serialized) as Record<string, unknown>;
    if (!data || data.source !== "space-music-native-check" || data.channel !== channel ||
        data.origin !== new URL(apiBaseUrl).origin || data.action !== action) return null;
    if (data.type === "token" && typeof data.token === "string" && data.token.length > 0 && data.token.length <= 4096) {
      return { type: "token", token: data.token };
    }
    if (data.type === "error" || data.type === "expired") return { type: data.type };
  } catch {}
  return null;
}

export function humanCheckBridge(apiBaseUrl: string, action: AuthPurpose, channel: string): string {
  const origin = JSON.stringify(new URL(apiBaseUrl).origin);
  return `(() => {
    if (window.__spaceNativeCheckBridge) return;
    window.__spaceNativeCheckBridge = true;
    const origin = ${origin};
    const action = ${JSON.stringify(action)};
    const channel = ${JSON.stringify(channel)};
    window.addEventListener('message', (event) => {
      if (event.origin !== origin || event.source !== window) return;
      const data = event.data;
      if (!data || data.source !== 'space-music-turnstile' || data.action !== action) return;
      if (!['token', 'error', 'expired'].includes(data.type)) return;
      if (data.type === 'token' && (typeof data.token !== 'string' || !data.token || data.token.length > 4096)) return;
      window.ReactNativeWebView.postMessage(JSON.stringify({
        source: 'space-music-native-check', channel, origin, action,
        type: data.type, token: data.type === 'token' ? data.token : undefined
      }));
    });
  })(); true;`;
}
