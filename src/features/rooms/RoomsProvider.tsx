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
import { usePlayer } from "@/features/player/PlayerProvider";
import { useAuth } from "@/features/auth/AuthProvider";
import { mobileApi } from "@/api/client";
import type {
  Room,
  RoomState,
  RoomSummary,
} from "@/api/contracts";
import { trackFromApi, type MusicTrack } from "@/domain/music";

const POLL_INTERVAL_MS = 2_500;
const STATE_PUSH_DEBOUNCE_MS = 600;

interface RoomsContextValue {
  rooms: RoomSummary[];
  loading: boolean;
  error: string | null;
  activeRoom: Room | null;
  /** Controls guarded by the active room: push to the room, apply locally. */
  control: {
    toggle: () => void;
    next: () => void;
    previous: () => void;
    seek: (seconds: number) => void;
    playIndex: (index: number) => void;
    removeAt: (index: number) => void;
  };
  createRoom: (name: string) => Promise<Room>;
  joinRoom: (code: string) => Promise<Room>;
  leaveRoom: () => Promise<void>;
  closeRoom: () => Promise<void>;
  refreshRooms: () => Promise<void>;
  setActiveRoom: (room: Room | null) => void;
}

const EMPTY: RoomSummary[] = [];
const RoomsContext = createContext<RoomsContextValue | null>(null);

export function RoomsProvider({ children }: PropsWithChildren) {
  const { status } = useAuth();
  const player = usePlayer();
  const [rooms, setRooms] = useState<RoomSummary[]>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const lastPushedState = useRef<string>("");
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roomIdRef = useRef<string | null>(null);

  useEffect(() => {
    roomIdRef.current = activeRoom?.id ?? null;
  }, [activeRoom?.id]);

  const refreshRooms = useCallback(async () => {
    if (status !== "authenticated") return;
    try {
      const response = await mobileApi.listRooms();
      setRooms(response.items);
      setError(null);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Не удалось загрузить комнаты",
      );
    }
  }, [status]);

  useEffect(() => {
    if (status !== "authenticated") return;
    let active = true;
    void (async () => {
      if (active) setLoading(true);
      try {
        await refreshRooms();
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  /** Push the current local playback state to the room. */
  const pushState = useCallback(
    (room: Room, patch: Partial<RoomState> = {}) => {
      if (pushTimer.current) clearTimeout(pushTimer.current);
      pushTimer.current = setTimeout(() => {
        void (async () => {
          const state: RoomState = {
            queue: room.state.queue,
            currentIndex: room.state.currentIndex,
            playing: patch.playing ?? player.playing,
            position: patch.position ?? player.positionSeconds,
            ...patch,
          };
          lastPushedState.current = JSON.stringify(state);
          try {
            const update = await mobileApi.updateRoomState(room.id, state);
            setActiveRoom((current) =>
              current && current.id === room.id
                ? { ...current, revision: update.revision, state: update.state }
                : current,
            );
          } catch {
            // poll will reconcile
          }
        })();
      }, STATE_PUSH_DEBOUNCE_MS);
    },
    [player.playing, player.positionSeconds],
  );

  // Any member may control the room: the transport writes the shared state
  // and the local player mirrors it immediately for a responsive feel.
  const control = useMemo(
    () => ({
      toggle: () => {
        const room = activeRoom;
        if (!room) return;
        player.toggle();
        pushState(room, { playing: !player.playing });
      },
      next: () => {
        const room = activeRoom;
        if (!room || room.state.queue.length === 0) return;
        const index = (room.state.currentIndex + 1) % room.state.queue.length;
        void player
          .applySharedState(
            room.state.queue.map((entry) => trackFromApi(entry)),
            index,
            true,
            0,
          )
          .then(() => pushState(room, { currentIndex: index, playing: true, position: 0 }))
          .catch(() => undefined);
      },
      previous: () => {
        const room = activeRoom;
        if (!room || room.state.queue.length === 0) return;
        if (player.positionSeconds > 3) {
          void player.seek(0);
          pushState(room, { position: 0 });
          return;
        }
        const index =
          room.state.currentIndex > 0
            ? room.state.currentIndex - 1
            : room.state.queue.length - 1;
        void player
          .applySharedState(
            room.state.queue.map((entry) => trackFromApi(entry)),
            index,
            true,
            0,
          )
          .then(() => pushState(room, { currentIndex: index, playing: true, position: 0 }))
          .catch(() => undefined);
      },
      seek: (seconds: number) => {
        const room = activeRoom;
        if (!room) return;
        void player.seek(seconds);
        pushState(room, { position: seconds });
      },
      playIndex: (index: number) => {
        const room = activeRoom;
        if (!room || index < 0 || index >= room.state.queue.length) return;
        void player
          .applySharedState(
            room.state.queue.map((entry) => trackFromApi(entry)),
            index,
            true,
            0,
          )
          .then(() => pushState(room, { currentIndex: index, playing: true, position: 0 }))
          .catch(() => undefined);
      },
      removeAt: (index: number) => {
        const room = activeRoom;
        if (!room || index === room.state.currentIndex) return;
        const queue = room.state.queue.filter((_, i) => i !== index);
        const currentIndex =
          index < room.state.currentIndex
            ? room.state.currentIndex - 1
            : room.state.currentIndex;
        void player
          .applySharedState(
            queue.map((entry) => trackFromApi(entry)),
            Math.max(0, currentIndex),
            player.playing,
            player.positionSeconds,
          )
          .then(() => pushState(room, { queue, currentIndex }))
          .catch(() => undefined);
      },
    }),
    [activeRoom, player, pushState],
  );

  // Poll the shared room state; apply remote changes unless they came from us.
  useEffect(() => {
    const roomId = activeRoom?.id;
    if (!roomId) return;
    let stopped = false;
    let since = activeRoom.revision;
    const poll = async () => {
      try {
        const fresh = await mobileApi.getRoom(roomId, since);
        if (stopped || !fresh) return;
        since = fresh.revision;
        lastPushedState.current = "";
        setActiveRoom(fresh);
        const tracks: MusicTrack[] = fresh.state.queue.map((entry) =>
          trackFromApi(entry),
        );
        const index = Math.max(0, Math.min(fresh.state.currentIndex, tracks.length - 1));
        const resolver = () =>
          player.applySharedState(tracks, index, fresh.state.playing, fresh.state.position);
        void resolver().catch(() => undefined);
      } catch {
        // transient network failure; next tick retries
      }
    };
    const interval = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      clearInterval(interval);
      if (pushTimer.current) clearTimeout(pushTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoom?.id]);

  const createRoom = useCallback(
    async (name: string) => {
      const firstTrack = player.currentTrack;
      const room = await mobileApi.createRoom(name, {
        queue: firstTrack?.snapshot ? [firstTrack.snapshot] : [],
        currentIndex: firstTrack?.snapshot ? 0 : -1,
        playing: player.playing,
        position: player.positionSeconds,
      });
      lastPushedState.current = "";
      setActiveRoom(room);
      await refreshRooms();
      return room;
    },
    [player.currentTrack, player.playing, player.positionSeconds, refreshRooms],
  );

  const joinRoom = useCallback(
    async (code: string) => {
      const room = await mobileApi.joinRoom(code);
      lastPushedState.current = "";
      setActiveRoom(room);
      const tracks: MusicTrack[] = room.state.queue.map((entry) =>
        trackFromApi(entry),
      );
      if (tracks.length > 0) {
        const index = Math.max(0, Math.min(room.state.currentIndex, tracks.length - 1));
        await player
          .applySharedState(tracks, index, room.state.playing, room.state.position)
          .catch(() => undefined);
      }
      await refreshRooms();
      return room;
    },
    [player, refreshRooms],
  );

  const leaveRoom = useCallback(async () => {
    const roomId = activeRoom?.id;
    if (!roomId) return;
    await mobileApi.leaveRoom(roomId).catch(() => undefined);
    setActiveRoom(null);
    await refreshRooms();
  }, [activeRoom?.id, refreshRooms]);

  const closeRoom = useCallback(async () => {
    const roomId = activeRoom?.id;
    if (!roomId) return;
    await mobileApi.closeRoom(roomId).catch(() => undefined);
    setActiveRoom(null);
    await refreshRooms();
  }, [activeRoom?.id, refreshRooms]);

  const value = useMemo<RoomsContextValue>(
    () => ({
      rooms,
      loading,
      error,
      activeRoom,
      control,
      createRoom,
      joinRoom,
      leaveRoom,
      closeRoom,
      refreshRooms,
      setActiveRoom,
    }),
    [
      rooms,
      loading,
      error,
      activeRoom,
      control,
      createRoom,
      joinRoom,
      leaveRoom,
      closeRoom,
      refreshRooms,
    ],
  );

  return (
    <RoomsContext.Provider value={value}>{children}</RoomsContext.Provider>
  );
}

export function useRooms(): RoomsContextValue {
  const context = useContext(RoomsContext);
  if (!context) throw new Error("useRooms must be used inside RoomsProvider");
  return context;
}