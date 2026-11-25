import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from "expo-audio";
import { useSQLiteContext } from "expo-sqlite";
import { mobileApi } from "@/api/client";
import { trackFromApi, type MusicTrack } from "@/domain/music";
import {
  cachePlayback,
  cachedPlayback,
  hydratePlaybackCache,
  playbackCacheSnapshot,
} from "./playbackCache";
import { readSyncCache, writeSyncCache } from "@/storage/database";

const PLAYBACK_CACHE_KEY = "playback-cache-v1";

export type RepeatMode = "off" | "all" | "one";

interface PlayerContextValue {
  currentTrack: MusicTrack | null;
  queue: MusicTrack[];
  currentIndex: number;
  playing: boolean;
  buffering: boolean;
  positionSeconds: number;
  durationSeconds: number;
  error: string | null;
  shuffleEnabled: boolean;
  repeatMode: RepeatMode;
  canGoNext: boolean;
  canGoPrevious: boolean;
  playTrack: (track: MusicTrack, queue?: MusicTrack[]) => Promise<void>;
  playIndex: (index: number) => Promise<void>;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => Promise<void>;
  toggleShuffle: () => void;
  cycleRepeatMode: () => void;
  removeFromQueue: (index: number) => void;
  clearUpcoming: () => void;
  /** Replace the whole session from a shared room snapshot, then play/pause/seek as commanded. */
  applySharedState: (
    tracks: MusicTrack[],
    index: number,
    playing: boolean,
    positionSeconds: number,
  ) => Promise<void>;
  /** Start an artist radio: an infinite stream built from provider search. */
  startArtistRadio: (artists: string[]) => Promise<void>;
  /** Leave radio mode; playback of the current queue continues. */
  stopRadio: () => void;
  radioArtists: string[];
}

const PlayerContext = createContext<PlayerContextValue | null>(null);
const STREAM_EXPIRY_GUARD_MS = 30_000;
/** Resolve the next tracks right away; a delay only made the following tap slow. */
const PREFETCH_DELAY_MS = 250;
const PREFETCH_AHEAD = 3;

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function hasFreshPlayback(track: MusicTrack): boolean {
  if (cachedPlayback(track.id)) return true;
  if (!track.playbackUrl) return false;
  if (!track.playbackExpiresAt) return true;
  const expiresAt = Date.parse(track.playbackExpiresAt);
  return (
    Number.isFinite(expiresAt) &&
    expiresAt - Date.now() > STREAM_EXPIRY_GUARD_MS
  );
}

function shuffleTracks(items: MusicTrack[]): MusicTrack[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
}

function playbackQueue(
  items: MusicTrack[],
  selectedIndex: number,
  shuffleEnabled: boolean,
): { items: MusicTrack[]; selectedIndex: number } {
  if (!shuffleEnabled || items.length < 2) {
    return { items, selectedIndex };
  }
  const selected = items[selectedIndex];
  if (!selected) return { items, selectedIndex };
  return {
    items: [
      selected,
      ...shuffleTracks(items.filter((_, index) => index !== selectedIndex)),
    ],
    selectedIndex: 0,
  };
}

export function PlayerProvider({ children }: PropsWithChildren) {
  const db = useSQLiteContext();
  const player = useAudioPlayer(null, { updateInterval: 500 });
  const status = useAudioPlayerStatus(player);
  const [queue, setQueue] = useState<MusicTrack[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [shuffleEnabled, setShuffleEnabled] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("off");
  const [radioArtists, setRadioArtists] = useState<string[]>([]);
  const loadEpoch = useRef(0);
  const loadController = useRef<AbortController | null>(null);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentTrack = currentIndex >= 0 ? (queue[currentIndex] ?? null) : null;

  // Resolved stream URLs survive restarts: hydrate the in-memory cache once
  // and persist it (debounced) so a replayed track starts without a signed
  // playback round trip.
  useEffect(() => {
    let active = true;
    void readSyncCache<Record<string, { url: string; expiresAt?: string }>>(
      db,
      PLAYBACK_CACHE_KEY,
    ).then((cached) => {
      if (!active || !cached) return;
      hydratePlaybackCache(cached);
    });
    return () => {
      active = false;
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, [db]);

  const schedulePersist = useCallback(() => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      const snapshot = playbackCacheSnapshot();
      if (Object.keys(snapshot).length === 0) return;
      void writeSyncCache(db, PLAYBACK_CACHE_KEY, snapshot).catch(
        () => undefined,
      );
    }, 800);
  }, [db]);

  useEffect(() => {
    void setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: "doNotMix",
    });
    return () => {
      loadController.current?.abort();
      player.clearLockScreenControls();
    };
  }, [player]);

  const resolve = useCallback(
    async (track: MusicTrack, signal?: AbortSignal): Promise<MusicTrack> => {
      if (hasFreshPlayback(track)) return track;
      const cached = cachedPlayback(track.id);
      if (cached)
        return {
          ...track,
          playbackUrl: cached.url,
          playbackExpiresAt: cached.expiresAt,
        };
      const stream = await mobileApi.resolvePlayback(track.id, signal);
      cachePlayback(track.id, { url: stream.url, expiresAt: stream.expiresAt });
      schedulePersist();
      return {
        ...track,
        playbackUrl: stream.url,
        playbackExpiresAt: stream.expiresAt,
      };
    },
    [schedulePersist],
  );

  const attach = useCallback(
    async (track: MusicTrack, index: number, expectedEpoch: number) => {
      loadController.current?.abort();
      const controller = new AbortController();
      loadController.current = controller;
      try {
        const playable = await resolve(track, controller.signal);
        if (expectedEpoch !== loadEpoch.current || controller.signal.aborted)
          return;
        setQueue((items) => {
          if (items[index]?.id !== track.id) return items;
          const nextItems = [...items];
          nextItems[index] = playable;
          return nextItems;
        });
        setCurrentIndex(index);
        player.replace(playable.playbackUrl!);
        player.setActiveForLockScreen(true, {
          title: playable.title,
          artist: playable.artists.join(", "),
          ...(playable.album ? { albumTitle: playable.album } : {}),
          ...(playable.coverUrl ? { artworkUrl: playable.coverUrl } : {}),
        });
        player.play();
        setError(null);
      } finally {
        if (loadController.current === controller) loadController.current = null;
      }
    },
    [player, resolve],
  );

  const playTrack = useCallback(
    async (track: MusicTrack, nextQueue: MusicTrack[] = [track]) => {
      const selectedIndex = Math.max(
        0,
        nextQueue.findIndex((item) => item.id === track.id),
      );
      const prepared = playbackQueue(
        nextQueue,
        selectedIndex,
        shuffleEnabled,
      );
      const epoch = ++loadEpoch.current;
      setQueue(prepared.items);
      setCurrentIndex(prepared.selectedIndex);
      setError(null);
      try {
        await attach(
          prepared.items[prepared.selectedIndex] ?? track,
          prepared.selectedIndex,
          epoch,
        );
      } catch (nextError) {
        if (epoch !== loadEpoch.current || isAbortError(nextError)) return;
        const message =
          nextError instanceof Error
            ? nextError.message
            : "Не удалось запустить трек";
        setError(message);
        throw nextError;
      }
    },
    [attach, shuffleEnabled],
  );

  const playIndex = useCallback(
    async (index: number) => {
      const track = queue[index];
      if (!track) return;
      const epoch = ++loadEpoch.current;
      setCurrentIndex(index);
      setError(null);
      try {
        await attach(track, index, epoch);
      } catch (nextError) {
        if (epoch !== loadEpoch.current || isAbortError(nextError)) return;
        const message =
          nextError instanceof Error
            ? nextError.message
            : "Не удалось запустить трек";
        setError(message);
        throw nextError;
      }
    },
    [attach, queue],
  );

  // ---- shared rooms and artist radio --------------------------------------

  const applySharedState = useCallback(
    async (
      tracks: MusicTrack[],
      index: number,
      playing: boolean,
      positionSeconds: number,
    ) => {
      if (tracks.length === 0) return;
      const safeIndex = Math.max(0, Math.min(index, tracks.length - 1));
      const track = tracks[safeIndex];
      if (!track) return;
      const epoch = ++loadEpoch.current;
      setQueue(tracks);
      setCurrentIndex(safeIndex);
      setError(null);
      try {
        await attach(track, safeIndex, epoch);
        if (!playing) player.pause();
        else if (positionSeconds > 1 && Number.isFinite(status.duration))
          void player.seekTo(Math.min(positionSeconds, status.duration));
      } catch (nextError) {
        if (epoch !== loadEpoch.current || isAbortError(nextError)) return;
        const message =
          nextError instanceof Error
            ? nextError.message
            : "Не удалось запустить трек";
        setError(message);
      }
    },
    [attach, player, status.duration],
  );

  const radioRefill = useRef(false);
  const radioArtistsRef = useRef<string[]>([]);

  const refillRadio = useCallback(async () => {
    const artists = radioArtistsRef.current;
    if (artists.length === 0 || radioRefill.current) return;
    radioRefill.current = true;
    try {
      const known = new Set(queue.map((item) => item.id));
      const found: MusicTrack[] = [];
      for (const artist of artists) {
        try {
          const response = await mobileApi.search(artist);
          for (const item of response.items) {
            if (item.type !== "track") continue;
            const track = trackFromApi(item);
            if (!known.has(track.id)) {
              known.add(track.id);
              found.push(track);
            }
          }
        } catch {
          // one artist failing must not stop the stream
        }
      }
      if (found.length === 0) return;
      setQueue((items) => [...items, ...found]);
    } finally {
      radioRefill.current = false;
    }
  }, [queue]);

  // Keep the radio infinite: refill as the tail of the queue approaches.
  useEffect(() => {
    if (radioArtistsRef.current.length === 0 || queue.length === 0) return;
    if (currentIndex < 0) return;
    if (queue.length - currentIndex > 6) return;
    const timer = setTimeout(() => void refillRadio(), 400);
    return () => clearTimeout(timer);
  }, [currentIndex, queue.length, refillRadio]);

  const startArtistRadio = useCallback(async (artists: string[]) => {
    const names = artists.map((name) => name.trim()).filter(Boolean);
    const seeds = [...new Set(names)];
    if (seeds.length === 0) throw new Error("Нет исполнителей для потока");
    const seen = new Set<string>();
    const pool: MusicTrack[] = [];
    for (const artist of seeds) {
      try {
        const response = await mobileApi.search(artist);
        for (const item of response.items) {
          if (item.type !== "track") continue;
          const track = trackFromApi(item);
          if (seen.has(track.id)) continue;
          seen.add(track.id);
          pool.push(track);
        }
      } catch {
        // skip artists the provider cannot resolve
      }
    }
    if (pool.length === 0) throw new Error("Не удалось собрать поток");
    radioArtistsRef.current = seeds;
    setRadioArtists(seeds);
    await playTrack(pool[0], pool);
  }, [playTrack]);

  const stopRadio = useCallback(() => {
    radioArtistsRef.current = [];
    setRadioArtists([]);
  }, []);

  const nextIndex = useCallback(() => {
    if (currentIndex < 0 || queue.length === 0) return -1;
    if (currentIndex + 1 < queue.length) return currentIndex + 1;
    return repeatMode === "all" && queue.length > 1 ? 0 : -1;
  }, [currentIndex, queue.length, repeatMode]);

  const next = useCallback(() => {
    const index = nextIndex();
    if (index >= 0) void playIndex(index).catch(() => undefined);
  }, [nextIndex, playIndex]);

  const previous = useCallback(() => {
    if (status.currentTime > 3) {
      void player.seekTo(0);
      return;
    }
    const index =
      currentIndex > 0
        ? currentIndex - 1
        : repeatMode === "all" && queue.length > 1
          ? queue.length - 1
          : -1;
    if (index >= 0) void playIndex(index).catch(() => undefined);
  }, [currentIndex, playIndex, player, queue.length, repeatMode, status.currentTime]);

  useEffect(() => {
    if (!status.didJustFinish) return;
    const timer = setTimeout(() => {
      if (repeatMode === "one") {
        void player.seekTo(0).then(() => player.play());
        return;
      }
      next();
    }, 0);
    return () => clearTimeout(timer);
  }, [next, player, repeatMode, status.didJustFinish]);

  // Warm the next few tracks in parallel so "next" starts instantly.
  const prefetchController = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      prefetchController.current?.abort();
      prefetchController.current = null;
    },
    [],
  );
  useEffect(() => {
    if (currentIndex < 0 || queue.length < 2) return;
    const controller = prefetchController.current ?? new AbortController();
    prefetchController.current = controller;
    const targets: { index: number; track: MusicTrack }[] = [];
    for (let offset = 1; offset <= PREFETCH_AHEAD; offset += 1) {
      const index =
        currentIndex + offset < queue.length
          ? currentIndex + offset
          : repeatMode === "all" && queue.length > 1
            ? (currentIndex + offset) % queue.length
            : -1;
      const track = index >= 0 ? queue[index] : undefined;
      if (!track || track.id === currentTrack?.id) continue;
      if (targets.some((entry) => entry.track.id === track.id)) continue;
      if (hasFreshPlayback(track)) continue;
      targets.push({ index, track });
    }
    if (targets.length === 0) return;

    const timer = setTimeout(() => {
      for (const target of targets) {
        void resolve(target.track, controller.signal)
          .then((playable) => {
            if (controller.signal.aborted) return;
            setQueue((items) => {
              const slot = items.findIndex(
                (item) => item.id === target.track.id,
              );
              if (slot < 0) return items;
              const nextItems = [...items];
              nextItems[slot] = { ...nextItems[slot], ...playable };
              return nextItems;
            });
          })
          .catch(() => undefined);
      }
    }, PREFETCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [currentIndex, currentTrack?.id, queue, repeatMode, resolve]);

  const toggle = useCallback(() => {
    if (status.playing) player.pause();
    else if (currentTrack?.playbackUrl) player.play();
    else if (currentTrack) void playTrack(currentTrack, queue);
  }, [currentTrack, playTrack, player, queue, status.playing]);

  const seek = useCallback(
    (seconds: number) =>
      player.seekTo(Math.max(0, Math.min(status.duration || seconds, seconds))),
    [player, status.duration],
  );

  const toggleShuffle = useCallback(() => {
    setShuffleEnabled((enabled) => {
      const nextEnabled = !enabled;
      if (nextEnabled && currentIndex >= 0 && currentIndex < queue.length - 1) {
        setQueue((items) => [
          ...items.slice(0, currentIndex + 1),
          ...shuffleTracks(items.slice(currentIndex + 1)),
        ]);
      }
      return nextEnabled;
    });
  }, [currentIndex, queue.length]);

  const cycleRepeatMode = useCallback(() => {
    setRepeatMode((mode) =>
      mode === "off" ? "all" : mode === "all" ? "one" : "off",
    );
  }, []);

  const removeFromQueue = useCallback(
    (index: number) => {
      if (index < 0 || index >= queue.length || index === currentIndex) return;
      setQueue((items) => items.filter((_, itemIndex) => itemIndex !== index));
      if (index < currentIndex) setCurrentIndex((value) => value - 1);
    },
    [currentIndex, queue.length],
  );

  const clearUpcoming = useCallback(() => {
    if (currentIndex < 0) return;
    setQueue((items) => items.slice(0, currentIndex + 1));
  }, [currentIndex]);

  const canGoNext = nextIndex() >= 0;
  const canGoPrevious =
    status.currentTime > 3 ||
    currentIndex > 0 ||
    (repeatMode === "all" && queue.length > 1);

  const value = useMemo<PlayerContextValue>(
    () => ({
      currentTrack,
      queue,
      currentIndex,
      playing: status.playing,
      buffering: status.isBuffering,
      positionSeconds: status.currentTime,
      durationSeconds: status.duration,
      error,
      shuffleEnabled,
      repeatMode,
      canGoNext,
      canGoPrevious,
      playTrack,
      playIndex,
      toggle,
      next,
      previous,
      seek,
      toggleShuffle,
      cycleRepeatMode,
      removeFromQueue,
      clearUpcoming,
      applySharedState,
      startArtistRadio,
      stopRadio,
      radioArtists,
    }),
    [
      canGoNext,
      canGoPrevious,
      clearUpcoming,
      currentIndex,
      currentTrack,
      cycleRepeatMode,
      error,
      next,
      playIndex,
      playTrack,
      previous,
      queue,
      removeFromQueue,
      repeatMode,
      seek,
      shuffleEnabled,
      status.currentTime,
      status.duration,
      status.isBuffering,
      status.playing,
      toggle,
      toggleShuffle,
      applySharedState,
      startArtistRadio,
      stopRadio,
      radioArtists,
    ],
  );
  return (
    <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
  );
}

export function usePlayer(): PlayerContextValue {
  const context = useContext(PlayerContext);
  if (!context) throw new Error("usePlayer must be used inside PlayerProvider");
  return context;
}
