export interface ApiCover {
  url: string;
  width: number;
  height: number;
  fallbackUrl?: string;
}

export interface ApiTrackArtist {
  id: string;
  name: string;
}

export interface ApiTrack {
  id: string;
  type?: "track";
  title: string;
  artists: ApiTrackArtist[];
  album?: { id: string; title: string };
  durationMs: number;
  cover?: ApiCover;
  explicit?: boolean;
  viewer?: { liked: boolean };
}

export interface SpaceUser {
  id: string;
  email?: string;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  expiresAt?: number;
  user: SpaceUser;
}

export interface LikedTracksPage {
  items: { track: ApiTrack; likedAt: string }[];
  nextCursor: string | null;
}

export interface UserPlaylist {
  id: string;
  title: string;
  description?: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  revision: number;
  trackCount?: number;
  coverUrls?: string[];
}

export interface UserPlaylistItem {
  id: string;
  track: ApiTrack;
  position: number;
  addedAt: string;
}

export type SearchResult =
  | (ApiTrack & { type: "track" })
  | { type: "artist"; id: string; name: string; cover?: ApiCover }
  | {
      type: "album";
      id: string;
      title: string;
      artists: ApiTrackArtist[];
      year?: number;
      cover?: ApiCover;
    }
  | {
      type: "playlist";
      id: string;
      title: string;
      author?: string;
      cover?: ApiCover;
    };

export interface PlaybackStream {
  url: string;
  expiresAt: string;
  mimeType: string;
  codec?: string;
  size: number;
}

export interface PlaybackHistoryItem {
  id: string;
  track: ApiTrack;
  listenedAt: string;
}

export interface DailyMix {
  id: string;
  title: string;
  description: string;
  clusterArtists: string[];
  cover?: ApiCover;
  trackCount: number;
  tracks: ApiTrack[];
}

export interface PopularTrackItem {
  rank: number;
  track: ApiTrack;
  playCount: number;
  viewer?: { liked: boolean };
}

export interface RoomMember {
  userId: string;
  role: "owner" | "member";
  displayName: string;
  avatarUrl?: string | null;
  joinedAt: string;
}

export interface RoomState {
  queue: ApiTrack[];
  currentIndex: number;
  playing: boolean;
  position: number;
}

export interface RoomSummary {
  id: string;
  name: string;
  ownerId: string;
  revision: number;
  memberCount: number;
  updatedAt: string;
}

export interface Room extends RoomSummary {
  joinCode: string;
  role: "owner" | "member";
  members: RoomMember[];
  state: RoomState;
}

export interface RoomStateUpdate {
  revision: number;
  state: RoomState;
}

export type LyricsFormat = "plain" | "lrc" | "ttml" | "qrc" | "richsync";
export type LyricsContentKind =
  | "plain"
  | "line_synced"
  | "word_synced"
  | "syllable_synced";
export type LyricsSyncLevel =
  | "plain"
  | "line_level"
  | "word_level"
  | "syllable_level";

export interface LyricsCandidate {
  provider: string;
  matchedTrack?: {
    title?: string;
    artists?: string[];
    durationMs?: number;
  };
  lyrics: {
    format: LyricsFormat;
    content: string;
  };
  syncHint?: LyricsContentKind;
  contentKind: LyricsContentKind;
  syncLevel: LyricsSyncLevel;
  topPriority?: boolean;
  quality: {
    total: number;
    match: number;
    content: number;
    sync: number;
    source: number;
    reasons: string[];
  };
}

export interface LyricsSearchResult {
  provider?: string;
  cached: boolean;
  candidate: LyricsCandidate;
}
