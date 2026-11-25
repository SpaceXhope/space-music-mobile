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
import { AppState } from "react-native";
import { useSQLiteContext } from "expo-sqlite";
import type { UserPlaylist } from "@/api/contracts";
import { mobileApi } from "@/api/client";
import type {
  MusicPlaylist,
  MusicTrack,
  PlaylistWithTracks,
} from "@/domain/music";
import { playlistFromApi, trackFromApi } from "@/domain/music";
import { readSyncCache, writeSyncCache } from "@/storage/database";
import { useAuth } from "@/features/auth/AuthProvider";

const CACHE_KEY = "remote-library-v1";
const SYNC_INTERVAL_MS = 15_000;

interface CachedLibrary {
  likedTracks: MusicTrack[];
  playlists: MusicPlaylist[];
}

interface LibraryContextValue extends CachedLibrary {
  loading: boolean;
  syncing: boolean;
  error: string | null;
  likedIds: ReadonlySet<string>;
  refresh: () => Promise<void>;
  toggleLike: (track: MusicTrack) => Promise<void>;
  createPlaylist: (
    title: string,
    description?: string,
  ) => Promise<UserPlaylist>;
  loadPlaylist: (id: string) => Promise<PlaylistWithTracks | null>;
}

const EMPTY: CachedLibrary = { likedTracks: [], playlists: [] };
const LibraryContext = createContext<LibraryContextValue | null>(null);

export function LibraryProvider({ children }: PropsWithChildren) {
  const db = useSQLiteContext();
  const { status } = useAuth();
  const [library, setLibrary] = useState<CachedLibrary>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshing = useRef<Promise<void> | null>(null);

  const persist = useCallback(
    (value: CachedLibrary) => writeSyncCache(db, CACHE_KEY, value),
    [db],
  );

  const refresh = useCallback(() => {
    if (status !== "authenticated") return Promise.resolve();
    if (refreshing.current) return refreshing.current;
    const run = (async () => {
      setSyncing(true);
      try {
        const [playlistResponse, firstLikes] = await Promise.all([
          mobileApi.listPlaylists(),
          mobileApi.listLikedTracks(100),
        ]);
        const likedItems = [...firstLikes.items];
        let cursor = firstLikes.nextCursor;
        while (cursor && likedItems.length < 2_000) {
          const page = await mobileApi.listLikedTracks(100, cursor);
          likedItems.push(...page.items);
          cursor = page.nextCursor;
        }
        const next = {
          likedTracks: likedItems.map(({ track, likedAt }) =>
            trackFromApi(track, { liked: true, likedAt }),
          ),
          playlists: playlistResponse.items.map(playlistFromApi),
        };
        setLibrary(next);
        setError(null);
        await persist(next);
      } catch (nextError) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Не удалось синхронизировать библиотеку",
        );
      } finally {
        setLoading(false);
        setSyncing(false);
      }
    })().finally(() => {
      refreshing.current = null;
    });
    refreshing.current = run;
    return run;
  }, [persist, status]);

  useEffect(() => {
    let active = true;
    void readSyncCache<CachedLibrary>(db, CACHE_KEY).then((cached) => {
      if (!active) return;
      if (cached) setLibrary(cached);
      setLoading(false);
      void refresh();
    });
    return () => {
      active = false;
    };
  }, [db, refresh]);

  useEffect(() => {
    if (status !== "authenticated") {
      const timer = setTimeout(() => {
        setLibrary(EMPTY);
        setLoading(false);
      }, 0);
      return () => clearTimeout(timer);
    }
    const interval = setInterval(() => {
      if (AppState.currentState === "active") void refresh();
    }, SYNC_INTERVAL_MS);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [refresh, status]);

  const likedIds = useMemo(
    () => new Set(library.likedTracks.map((track) => track.id)),
    [library.likedTracks],
  );

  const toggleLike = useCallback(
    async (track: MusicTrack) => {
      const wasLiked = likedIds.has(track.id);
      const before = library;
      const next = wasLiked
        ? {
            ...library,
            likedTracks: library.likedTracks.filter(
              (item) => item.id !== track.id,
            ),
          }
        : {
            ...library,
            likedTracks: [
              { ...track, liked: true, likedAt: new Date().toISOString() },
              ...library.likedTracks,
            ],
          };
      setLibrary(next);
      await persist(next);
      try {
        if (wasLiked) await mobileApi.unlikeTrack(track.id);
        else if (track.snapshot) await mobileApi.likeTrack(track.snapshot);
        else throw new Error("Нет серверного снимка трека");
      } catch (nextError) {
        setLibrary(before);
        await persist(before);
        throw nextError;
      }
    },
    [library, likedIds, persist],
  );

  const createPlaylist = useCallback(
    async (title: string, description?: string) => {
      const playlist = await mobileApi.createPlaylist(title, description);
      await refresh();
      return playlist;
    },
    [refresh],
  );

  const loadPlaylist = useCallback(async (id: string) => {
    const response = await mobileApi.getPlaylist(id);
    const summary = playlistFromApi(response.playlist);
    return {
      ...summary,
      trackCount: response.items.length,
      tracks: response.items.map((item) =>
        trackFromApi(item.track, { playlistItemId: item.id }),
      ),
    };
  }, []);

  const value = useMemo<LibraryContextValue>(
    () => ({
      ...library,
      likedIds,
      loading,
      syncing,
      error,
      refresh,
      toggleLike,
      createPlaylist,
      loadPlaylist,
    }),
    [
      createPlaylist,
      error,
      library,
      likedIds,
      loadPlaylist,
      loading,
      refresh,
      syncing,
      toggleLike,
    ],
  );
  return (
    <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>
  );
}

export function useLibrary(): LibraryContextValue {
  const context = useContext(LibraryContext);
  if (!context)
    throw new Error("useLibrary must be used inside LibraryProvider");
  return context;
}
