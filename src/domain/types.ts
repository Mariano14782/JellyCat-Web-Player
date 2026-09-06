export type RepeatMode = "none" | "all" | "one";
export type AppTheme = "original" | "mocha" | "macchiato" | "frappe" | "latte";
export type RecentItemType = "album" | "playlist";
export type PlaybackStatus = "idle" | "loading" | "buffering" | "playing" | "paused" | "error";
export type SmartMixId = "favorites" | "recently-added" | "unplayed" | "artist-radio" | "weekly-most-played";

export interface AuthSession {
  serverUrl: string;
  userId: string;
  accessToken: string;
  username: string;
}

export interface Album {
  id: string;
  name: string;
  artistName: string;
  year?: number;
  artworkId?: string;
  artworkTag?: string;
  trackCount?: number;
  format?: string;
}

export interface Artist {
  id: string;
  name: string;
  artworkId?: string;
  artworkTag?: string;
  albumCount?: number;
}

export interface Playlist {
  id: string;
  name: string;
  trackCount?: number;
  artworkId?: string;
  artworkTag?: string;
}

export interface Track {
  id: string;
  title: string;
  albumId: string;
  artistId?: string;
  artistName: string;
  albumName: string;
  durationTicks: number;
  artworkItemId?: string;
  artworkTag?: string;
  playlistItemId?: string;
  isFavorite: boolean;
  container?: string;
  bitrate?: number;
  playCount?: number;
  dateCreated?: string;
}

export interface PlayEvent {
  trackId: string;
  playedAt: string;
}

export interface SmartMixDefinition {
  id: SmartMixId;
  title: string;
  description: string;
}

export interface SmartMixResult {
  definition: SmartMixDefinition;
  tracks: Track[];
  generatedAt: string;
}

export interface QueueSnapshot {
  id: string;
  name: string;
  queue: Track[];
  currentIndex: number;
  createdAt: string;
}

export interface SavedProfile {
  id: string;
  label: string;
  serverUrl: string;
  username: string;
  userId?: string;
  persistence: "session" | "persistent" | "none";
  lastUsedAt: string;
}

export interface SearchResults {
  artists: Artist[];
  albums: Album[];
  tracks: Track[];
}

export interface RecentItem {
  id: string;
  name: string;
  artistName?: string;
  artworkId?: string;
  artworkTag?: string;
  format?: string;
  type: RecentItemType;
  lastPlayed: string;
}

export interface LyricLine {
  id: string;
  timestamp: number;
  text: string;
}

export interface LyricsState {
  lines: LyricLine[];
  plainLyrics: string;
  isLoading: boolean;
  currentLineIndex: number;
  hasLyrics: boolean;
}

export interface LyricsPayload {
  lines: LyricLine[];
  plainLyrics: string;
}

export interface ConnectionStatus {
  isServerAvailable: boolean;
  isNetworkConnected: boolean;
  diagnostic?: string;
}

export const ticksToSeconds = (ticks: number): number => ticks / 10_000_000;

export const formatDuration = (seconds: number): string => {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const total = Math.floor(safe);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

export const normalizeBaseUrl = (value: string): string => value.trim().replace(/\/+$/, "");
