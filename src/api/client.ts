import type {
  ApiTrack,
  AuthSession,
  DailyMix,
  LikedTracksPage,
  LyricsSearchResult,
  PlaybackHistoryItem,
  PlaybackStream,
  PopularTrackItem,
  Room,
  RoomState,
  RoomStateUpdate,
  RoomSummary,
  SearchResult,
  SpaceUser,
  UserPlaylist,
  UserPlaylistItem,
} from "./contracts";
import { getSession, sessionExpiry, setSession } from "./session";
import { signRequest, syncServerTime } from "./signer";
import { RequestSigningError } from "./signerCore";
import {
  type AuthChallenge,
  type AuthPurpose,
  type AuthRequestOptions,
  isCheckMode,
  throwIfAborted,
} from "./authChallenge";
import { PowCheckError, solvePowChallenge } from "./proofOfWork";

export const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_URL || "https://api.tryliner.fun"
).replace(/\/+$/, "");

const CLIENT_VERSION = "0.3.3-mobile";
const REQUEST_TIMEOUT_MS = 15_000;
const ERROR_BODY_TIMEOUT_MS = 2_000;
let refreshPromise: Promise<AuthSession | null> | null = null;

interface AuthProof {
  pow?: { token: string; nonce: string };
  turnstile?: string;
}

export class MobileApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "MobileApiError";
  }
}

function cloudflareBlockError(response: Response): MobileApiError {
  const rayId = response.headers.get("cf-ray")?.trim();
  return new MobileApiError(
    response.status,
    [
      "Cloudflare заблокировал запрос входа до API.",
      "Смените сеть или повторите позже.",
      rayId ? `Ray ID: ${rayId}.` : "",
    ]
      .filter(Boolean)
      .join(" "),
    "EDGE_BLOCKED",
  );
}

async function readErrorBody(response: Response): Promise<string> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(""), ERROR_BODY_TIMEOUT_MS);
    response.text().then(
      (text) => {
        clearTimeout(timer);
        resolve(text);
      },
      () => {
        clearTimeout(timer);
        resolve("");
      },
    );
  });
}

async function parseError(response: Response): Promise<MobileApiError> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (response.status === 403 && contentType.includes("text/html")) {
    return cloudflareBlockError(response);
  }

  const text = await readErrorBody(response);
  let body: Record<string, unknown> = {};
  if (contentType.includes("application/json") && text) {
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {}
  }
  const edgeBlocked =
    response.status === 403 &&
    /cloudflare|sorry, you have been blocked/i.test(text);
  if (edgeBlocked) return cloudflareBlockError(response);

  return new MobileApiError(
    response.status,
    typeof body.message === "string"
      ? body.message
      : response.statusText || "Сервер вернул ошибку",
    typeof body.code === "string" ? body.code : undefined,
  );
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const userSignal = init.signal;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const abortFromCaller = () => controller.abort();
  if (userSignal?.aborted) controller.abort();
  else userSignal?.addEventListener("abort", abortFromCaller, { once: true });
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) {
      throw new MobileApiError(
        0,
        "Сервер не ответил за 15 секунд. Проверьте VPN и подключение к интернету.",
        "NETWORK_TIMEOUT",
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
    userSignal?.removeEventListener("abort", abortFromCaller);
  }
}

function baseHeaders(): Record<string, string> {
  return {
    "user-agent": `SpaceMusicMobile/${CLIENT_VERSION}`,
    "x-client-version": CLIENT_VERSION,
    "x-platform": "mobile",
  };
}

async function signedHeaders(method: string, path: string, body: string) {
  try {
    const headers = await signRequest(method, path, body);
    if (
      !/^[A-Za-z0-9_-]{43}$/.test(headers["x-liner-signature"] ?? "") ||
      !/^\d{1,16}$/.test(headers["x-liner-timestamp"] ?? "") ||
      !/^[a-f0-9]{16}$/.test(headers["x-liner-nonce"] ?? "")
    ) throw new RequestSigningError();
    return headers;
  } catch (error) {
    if (error instanceof RequestSigningError) {
      throw new MobileApiError(0, error.message, "REQUEST_SIGNING_FAILED");
    }
    throw error;
  }
}

async function refreshSession(): Promise<AuthSession | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const current = await getSession();
    if (!current?.refreshToken) return null;
    try {
      const body = JSON.stringify({ refreshToken: current.refreshToken });
      const response = await fetchWithTimeout(`${API_BASE_URL}/v1/auth/refresh`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...baseHeaders(),
          ...(await signedHeaders("POST", "/v1/auth/refresh", body)),
        },
        body,
      });
      syncServerTime(response.headers.get("date"));
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          const error = await parseError(response);
          if (
            error.code === "INVALID_REFRESH_TOKEN" ||
            error.code === "REFRESH_SESSION_EXPIRED"
          ) {
            const latest = await getSession();
            if (latest?.refreshToken === current.refreshToken) await setSession(null);
          }
        }
        return null;
      }
      const next = (await response.json()) as AuthSession;
      const latest = await getSession();
      if (latest?.refreshToken !== current.refreshToken) return latest;
      const merged = { ...current, ...next, user: next.user || current.user };
      await setSession(merged);
      return merged;
    } catch (error) {
      if (error instanceof MobileApiError && error.code === "REQUEST_SIGNING_FAILED") throw error;
      return null;
    }
  })().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

async function validAccessToken(): Promise<string | null> {
  const current = await getSession();
  if (!current?.accessToken) return null;
  const expiry = sessionExpiry(current);
  if (expiry !== null && expiry - Date.now() < 120_000) {
    return (
      (await refreshSession())?.accessToken ??
      (expiry > Date.now() ? current.accessToken : null)
    );
  }
  return current.accessToken;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  authenticated = true,
  retry = true,
): Promise<T> {
  throwIfAborted(init.signal ?? undefined);
  if (!path.startsWith("/") || path.startsWith("//") || /[\r\n\0#]/.test(path) || path.trim() !== path) {
    throw new MobileApiError(0, "Некорректный путь запроса.", "REQUEST_PATH_INVALID");
  }
  const token = authenticated ? await validAccessToken() : null;
  const method = (init.method || "GET").toUpperCase();
  if (init.body != null && typeof init.body !== "string") {
    throw new MobileApiError(0, "Формат тела запроса не поддерживается.", "REQUEST_BODY_UNSUPPORTED");
  }
  const body = typeof init.body === "string" ? init.body : "";
  const signature = await signedHeaders(method, path, body);
  throwIfAborted(init.signal ?? undefined);
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  if (init.body) headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  for (const [name, value] of Object.entries({ ...baseHeaders(), ...signature })) headers.set(name, value);
  const response = await fetchWithTimeout(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });
  syncServerTime(response.headers.get("date"));
  if (response.status === 401 && authenticated && retry) {
    const refreshed = await refreshSession();
    if (refreshed) return request<T>(path, init, true, false);
  }
  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

async function authenticate(
  path: "/v1/auth/login" | "/v1/auth/register",
  input: Record<string, unknown>,
  options: AuthRequestOptions = {},
): Promise<AuthSession> {
  const purpose: AuthPurpose =
    path === "/v1/auth/login" ? "login" : "register";
  const email = typeof input.email === "string" ? input.email : "";
  const proof = await authProofFor(purpose, email, options);
  throwIfAborted(options.signal);
  options.onPhase?.("sign-in");
  const result = await request<AuthSession>(
    path,
    {
      method: "POST",
      signal: options.signal,
      body: JSON.stringify({
        ...input,
        pow: proof.pow,
        turnstile: proof.turnstile,
      }),
    },
    false,
  );
  throwIfAborted(options.signal);
  await setSession(result);
  return result;
}

async function authProofFor(
  purpose: AuthPurpose,
  email: string,
  options: AuthRequestOptions,
): Promise<AuthProof> {
  throwIfAborted(options.signal);
  options.onPhase?.("challenge");
  let challenge: AuthChallenge;
  try {
    challenge = await request<AuthChallenge>(
      "/v1/auth/challenge",
      {
        method: "POST",
        body: JSON.stringify({ purpose, email }),
        signal: options.signal,
      },
      false,
    );
  } catch (error) {
    if (error instanceof MobileApiError && error.status === 404) return {};
    throw error;
  }

  if (!challenge || !isCheckMode(challenge.mode) ||
      (challenge.turnstile && !isCheckMode(challenge.turnstile.mode))) {
    throw new MobileApiError(428, "Сервер прислал некорректную проверку входа.", "AUTH_CHECK_INVALID");
  }
  const proof: AuthProof = {};
  const turnstileMode = challenge.turnstile?.edge === true
    ? "required"
    : challenge.turnstile?.mode ?? "off";
  if (turnstileMode !== "off") {
    options.onPhase?.("human-check");
    const token = await options.humanCheck?.({ action: purpose, mode: turnstileMode, signal: options.signal });
    throwIfAborted(options.signal);
    if (typeof token === "string" && token.length > 0 && token.length <= 4096) proof.turnstile = token;
    else if (turnstileMode === "required") {
      throw new MobileApiError(428, "Завершите проверку входа и повторите попытку.", "HUMAN_CHECK_CANCELLED");
    }
  }
  if (challenge.mode !== "off") {
    options.onPhase?.("proof-of-work");
    // Human verification can outlive the original PoW token. Refresh only once.
    if (Date.parse(challenge.expiresAt) - Date.now() < 10_000) {
      challenge = await request<AuthChallenge>("/v1/auth/challenge", {
        method: "POST", body: JSON.stringify({ purpose, email }), signal: options.signal,
      }, false);
      if (!challenge || !isCheckMode(challenge.mode) ||
          (challenge.turnstile && !isCheckMode(challenge.turnstile.mode))) {
        throw new MobileApiError(428, "Сервер прислал некорректную проверку входа.", "AUTH_CHECK_INVALID");
      }
      if ((challenge.turnstile?.mode === "required" || challenge.turnstile?.edge) && !proof.turnstile) {
        throw new MobileApiError(428, "Повторите проверку входа.", "HUMAN_CHECK_REQUIRED");
      }
    }
    try {
      if (challenge.mode !== "off") proof.pow = await solvePowChallenge(challenge, options.signal);
    } catch (error) {
      if (error instanceof PowCheckError) throw new MobileApiError(428, error.message, error.code);
      throw error;
    }
  }
  return proof;
}

export const mobileApi = {
  login: (email: string, password: string, options?: AuthRequestOptions) =>
    authenticate("/v1/auth/login", { email, password }, options),
  register: (
    email: string,
    password: string,
    username: string,
    displayName: string,
    options?: AuthRequestOptions,
  ) =>
    authenticate("/v1/auth/register", {
      email,
      password,
      username,
      displayName,
    }, options),
  getMe: () => request<SpaceUser>("/v1/me"),
  logout: async () => {
    const session = await getSession();
    if (session?.refreshToken) {
      await request<void>("/v1/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      }).catch(() => undefined);
    }
    await setSession(null);
  },
  listLikedTracks: (limit = 100, cursor?: string) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set("cursor", cursor);
    return request<LikedTracksPage>(`/v1/me/library/tracks?${params}`);
  },
  likeTrack: (track: ApiTrack) =>
    request<void>(`/v1/me/library/tracks/${encodeURIComponent(track.id)}`, {
      method: "PUT",
      body: JSON.stringify({ track, trackSnapshot: track }),
    }),
  unlikeTrack: (id: string) =>
    request<void>(`/v1/me/library/tracks/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  listPlaylists: () => request<{ items: UserPlaylist[] }>("/v1/me/playlists"),
  getPlaylist: (id: string) =>
    request<{ playlist: UserPlaylist; items: UserPlaylistItem[] }>(
      `/v1/me/playlists/${encodeURIComponent(id)}`,
    ),
  createPlaylist: (title: string, description?: string) =>
    request<UserPlaylist>("/v1/me/playlists", {
      method: "POST",
      body: JSON.stringify({ title, description }),
    }),
  addPlaylistTrack: (playlistId: string, track: ApiTrack) =>
    request<UserPlaylistItem>(
      `/v1/me/playlists/${encodeURIComponent(playlistId)}/tracks/${encodeURIComponent(track.id)}`,
      {
        method: "POST",
        body: JSON.stringify({ track, trackSnapshot: track }),
      },
    ),
  removePlaylistItem: (playlistId: string, itemId: string) =>
    request<void>(
      `/v1/me/playlists/${encodeURIComponent(playlistId)}/items/${encodeURIComponent(itemId)}`,
      { method: "DELETE" },
    ),
  search: (query: string, signal?: AbortSignal) =>
    request<{ items: SearchResult[] }>(
      `/v1/catalog/search?q=${encodeURIComponent(query)}&type=all`,
      { signal },
    ),
  getTrack: (id: string, signal?: AbortSignal) =>
    request<ApiTrack>(`/v1/catalog/tracks/${encodeURIComponent(id)}`, {
      signal,
    }),
  getHistory: (limit = 20) =>
    request<{ items: PlaybackHistoryItem[]; nextCursor: string | null }>(
      `/v1/me/history?limit=${limit}`,
    ),
  getPopularTracks: (limit = 30) =>
    request<{ items: PopularTrackItem[] }>(
      `/v1/explore/popular?window=7d&limit=${limit}`,
    ),
  getDailyMixes: () =>
    request<{ items: DailyMix[]; generatedAt: string }>(
      "/v1/me/recommendations/daily-mixes",
    ),
  searchLyrics: async (
    hint: { title: string; artist: string; durationMs?: number },
    signal?: AbortSignal,
  ) => {
    const params = new URLSearchParams({
      title: hint.title.trim(),
      artist: hint.artist.trim(),
      ...(hint.durationMs && hint.durationMs > 0
        ? { durationMs: String(Math.round(hint.durationMs)) }
        : {}),
    });
    try {
      return await request<LyricsSearchResult>(
        `/v1/me/lyrics/search?${params.toString()}`,
        { signal },
      );
    } catch (error) {
      if (
        error instanceof MobileApiError &&
        error.status === 404 &&
        error.code === "LYRICS_NOT_FOUND"
      ) {
        return null;
      }
      throw error;
    }
  },
  resolvePlayback: (id: string, signal?: AbortSignal) =>
    request<PlaybackStream>(`/v1/tracks/${encodeURIComponent(id)}/playback`, {
      method: "POST",
      signal,
    }),
  listRooms: () => request<{ items: RoomSummary[] }>("/v1/rooms"),
  createRoom: (name: string, state: Partial<RoomState>) =>
    request<Room>("/v1/rooms", {
      method: "POST",
      body: JSON.stringify({ name, state }),
    }),
  joinRoom: (code: string) =>
    request<Room>("/v1/rooms/join", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  getRoom: (id: string, since = 0) =>
    request<Room | undefined>(
      `/v1/rooms/${encodeURIComponent(id)}${since > 0 ? `?since=${since}` : ""}`,
    ),
  updateRoomState: (id: string, state: RoomState) =>
    request<RoomStateUpdate>(
      `/v1/rooms/${encodeURIComponent(id)}/state`,
      { method: "PUT", body: JSON.stringify({ state }) },
    ),
  renameRoom: (id: string, name: string) =>
    request<Room>(`/v1/rooms/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),
  leaveRoom: (id: string) =>
    request<void>(`/v1/rooms/${encodeURIComponent(id)}/leave`, {
      method: "POST",
    }),
  closeRoom: (id: string) =>
    request<void>(`/v1/rooms/${encodeURIComponent(id)}`, { method: "DELETE" }),
};
