import { create } from "zustand";
import type { PlaybackStatus, QueueSnapshot, RepeatMode, Track } from "@domain/types";
import { ticksToSeconds } from "@domain/types";
import { jellyfinClient } from "@core/jellyfin";
import { preferenceStorage, queueSnapshotStorage, recentTrackStorage } from "@core/storage/storage";
import { useLyricsStore } from "./lyricsService";

interface PlayerState {
  queue: Track[];
  originalQueue: Track[];
  currentTrack: Track | null;
  isPlaying: boolean;
  isShuffled: boolean;
  repeatMode: RepeatMode;
  currentTimeSeconds: number;
  durationSeconds: number;
  volume: number;
  playbackStatus: PlaybackStatus;
  playbackError?: string;
  lastQueueSnapshot: QueueSnapshot | null;
  queueHistory: QueueSnapshot[];
}

interface PlayerStore extends PlayerState {
  play: (tracks: Track[], startingAt: number) => void;
  togglePlayPause: () => void;
  nextTrack: () => void;
  previousTrack: () => void;
  seek: (seconds: number) => void;
  setVolume: (volume: number) => void;
  toggleShuffle: () => void;
  toggleRepeatMode: () => void;
  jumpTo: (index: number) => void;
  addToQueue: (track: Track) => void;
  playNext: (track: Track) => void;
  removeFromQueue: (index: number) => void;
  moveQueueItem: (source: number, destination: number) => void;
  clearPlayed: () => void;
  restoreQueueSnapshot: (snapshot: QueueSnapshot) => void;
  saveQueueAsPlaylist: (name: string) => Promise<string>;
  clearQueue: () => void;
}

const storedQueueSnapshots = queueSnapshotStorage.load();
const storedPlayerVolume = preferenceStorage.loadPlayerVolume();

const initialPlayerState: PlayerState = {
  queue: [],
  originalQueue: [],
  currentTrack: null,
  isPlaying: false,
  isShuffled: false,
  repeatMode: "none",
  currentTimeSeconds: 0,
  durationSeconds: 0,
  volume: storedPlayerVolume,
  playbackStatus: "idle",
  playbackError: undefined,
  lastQueueSnapshot: storedQueueSnapshots.last,
  queueHistory: storedQueueSnapshots.history
};

function createQueueSnapshot(name: string, state: Pick<PlayerState, "queue" | "currentTrack">): QueueSnapshot | null {
  if (!state.queue.length) return null;
  const currentIndex = state.currentTrack
    ? Math.max(0, state.queue.findIndex((track) => track.id === state.currentTrack?.id))
    : 0;
  return {
    id: `${Date.now()}-${state.currentTrack?.id ?? state.queue[0]?.id ?? "queue"}`,
    name,
    queue: state.queue,
    currentIndex,
    createdAt: new Date().toISOString()
  };
}

function persistQueueSnapshot(name = "Last queue"): void {
  const snapshot = createQueueSnapshot(name, usePlayerStore.getState());
  if (!snapshot) return;
  queueSnapshotStorage.saveSnapshot(snapshot);
  const stored = queueSnapshotStorage.load();
  usePlayerStore.setState({ lastQueueSnapshot: stored.last, queueHistory: stored.history });
}

class BrowserAudioService {
  private audio = new Audio();
  private preloader = new Audio();
  private lastReportedProgress = -1;
  private processingAdvance = false;

  constructor() {
    this.audio.preload = "auto";
    this.audio.volume = storedPlayerVolume;
    this.audio.addEventListener("loadstart", () => this.setPlaybackStatus("loading"));
    this.audio.addEventListener("waiting", () => this.setPlaybackStatus("buffering"));
    this.audio.addEventListener("stalled", () => this.setPlaybackStatus("buffering"));
    this.audio.addEventListener("canplay", () => this.onCanPlay());
    this.audio.addEventListener("playing", () => this.onPlaying());
    this.audio.addEventListener("pause", () => this.onPause());
    this.audio.addEventListener("error", () => this.onError());
    this.audio.addEventListener("timeupdate", () => this.onTimeUpdate());
    this.audio.addEventListener("durationchange", () => this.onDurationChange());
    this.audio.addEventListener("ended", () => this.onEnded());
  }

  play(tracks: Track[], startingAt: number): void {
    if (startingAt < 0 || startingAt >= tracks.length) return;
    const state = usePlayerStore.getState();
    const startingTrack = tracks[startingAt];
    const queue = state.isShuffled
      ? [startingTrack, ...tracks.filter((track) => track.id !== startingTrack.id).sort(() => Math.random() - 0.5)]
      : tracks;
    usePlayerStore.setState({
      originalQueue: tracks,
      queue,
      currentTrack: state.isShuffled ? queue[0] : startingTrack,
      currentTimeSeconds: 0,
      durationSeconds: ticksToSeconds(startingTrack.durationTicks),
      isPlaying: false,
      playbackStatus: "loading",
      playbackError: undefined
    });
    persistQueueSnapshot("Playback queue");
    void this.loadCurrentAndPlay();
  }

  async togglePlayPause(): Promise<void> {
    const state = usePlayerStore.getState();
    if (!state.currentTrack) return;
    if (state.isPlaying) {
      this.audio.pause();
      usePlayerStore.setState({ isPlaying: false, playbackStatus: "paused", playbackError: undefined });
      this.updateMediaSession();
      void jellyfinClient.reportPlaybackProgress(state.currentTrack.id, this.audio.currentTime, true);
    } else {
      usePlayerStore.setState({ playbackStatus: "loading", playbackError: undefined });
      const started = await this.audio.play().then(() => true).catch(() => false);
      usePlayerStore.setState(started
        ? { isPlaying: !this.audio.paused, playbackStatus: this.audio.paused ? "paused" : "playing", playbackError: undefined }
        : { isPlaying: false, playbackStatus: "error", playbackError: "Playback could not start." });
      this.updateMediaSession();
    }
  }

  nextTrack(): void {
    if (this.processingAdvance) return;
    this.processingAdvance = true;
    window.setTimeout(() => {
      this.processingAdvance = false;
    }, 350);

    const state = usePlayerStore.getState();
    if (!state.currentTrack) return;
    const currentIndex = state.queue.findIndex((track) => track.id === state.currentTrack?.id);
    const nextIndex = currentIndex + 1;
    if (nextIndex < state.queue.length) {
      usePlayerStore.setState({ currentTrack: state.queue[nextIndex], currentTimeSeconds: 0, isPlaying: false, playbackStatus: "loading", playbackError: undefined });
      persistQueueSnapshot("Playback queue");
      void this.loadCurrentAndPlay();
    } else if (state.repeatMode === "all" && state.originalQueue.length) {
      this.play(state.originalQueue, 0);
    } else {
      this.audio.pause();
      usePlayerStore.setState({ isPlaying: false, playbackStatus: "paused", playbackError: undefined });
      void jellyfinClient.reportPlaybackStopped(state.currentTrack.id, this.audio.currentTime);
    }
  }

  previousTrack(): void {
    const state = usePlayerStore.getState();
    if (!state.currentTrack) return;
    if (this.audio.currentTime > 3) {
      this.seek(0);
      return;
    }
    const currentIndex = state.queue.findIndex((track) => track.id === state.currentTrack?.id);
    const previousIndex = currentIndex - 1;
    if (previousIndex >= 0) {
      usePlayerStore.setState({ currentTrack: state.queue[previousIndex], currentTimeSeconds: 0, isPlaying: false, playbackStatus: "loading", playbackError: undefined });
      persistQueueSnapshot("Playback queue");
      void this.loadCurrentAndPlay();
    } else {
      this.seek(0);
    }
  }

  seek(seconds: number): void {
    const state = usePlayerStore.getState();
    const next = Math.max(0, Math.min(seconds, state.durationSeconds || seconds));
    this.audio.currentTime = next;
    usePlayerStore.setState({ currentTimeSeconds: next });
    this.updateMediaSession();
  }

  setVolume(volume: number): void {
    const next = Math.max(0, Math.min(1, volume));
    this.audio.volume = next;
    preferenceStorage.savePlayerVolume(next);
    usePlayerStore.setState({ volume: next });
  }

  toggleShuffle(): void {
    const state = usePlayerStore.getState();
    if (!state.isShuffled) {
      const current = state.currentTrack;
      const remaining = state.queue.filter((track) => track.id !== current?.id).sort(() => Math.random() - 0.5);
      usePlayerStore.setState({
        isShuffled: true,
        originalQueue: state.queue,
        queue: current ? [current, ...remaining] : remaining
      });
    } else {
      usePlayerStore.setState({
        isShuffled: false,
        queue: state.originalQueue.length ? state.originalQueue : state.queue
      });
    }
    this.preloadNext();
    this.updateMediaSession();
    persistQueueSnapshot("Playback queue");
  }

  toggleRepeatMode(): void {
    const state = usePlayerStore.getState();
    const repeatMode: RepeatMode = state.repeatMode === "none" ? "all" : state.repeatMode === "all" ? "one" : "none";
    usePlayerStore.setState({ repeatMode });
    this.updateMediaSession();
  }

  jumpTo(index: number): void {
    const state = usePlayerStore.getState();
    if (index < 0 || index >= state.queue.length) return;
    usePlayerStore.setState({ currentTrack: state.queue[index], currentTimeSeconds: 0, isPlaying: false, playbackStatus: "loading", playbackError: undefined });
    persistQueueSnapshot("Playback queue");
    void this.loadCurrentAndPlay();
  }

  addToQueue(track: Track): void {
    const state = usePlayerStore.getState();
    usePlayerStore.setState({
      queue: [...state.queue, track],
      originalQueue: [...state.originalQueue, track]
    });
    if (!state.currentTrack) {
      usePlayerStore.setState({ currentTrack: track, isPlaying: false, playbackStatus: "loading", playbackError: undefined });
      void this.loadCurrentAndPlay();
    } else {
      this.preloadNext();
    }
    persistQueueSnapshot("Playback queue");
  }

  playNext(track: Track): void {
    const state = usePlayerStore.getState();
    if (!state.currentTrack) {
      this.addToQueue(track);
      return;
    }
    const currentIndex = state.queue.findIndex((queued) => queued.id === state.currentTrack?.id);
    const queue = [...state.queue];
    queue.splice(currentIndex + 1, 0, track);
    usePlayerStore.setState({ queue, originalQueue: queue });
    this.preloadNext();
    persistQueueSnapshot("Playback queue");
  }

  removeFromQueue(index: number): void {
    const state = usePlayerStore.getState();
    if (index < 0 || index >= state.queue.length) return;
    const removingCurrent = state.queue[index].id === state.currentTrack?.id;
    const queue = state.queue.filter((_, itemIndex) => itemIndex !== index);
    usePlayerStore.setState({ queue, originalQueue: queue });
    if (removingCurrent) {
      if (!queue.length) this.clearQueue();
      else {
        usePlayerStore.setState({ currentTrack: queue[Math.min(index, queue.length - 1)], isPlaying: false, playbackStatus: "loading", playbackError: undefined });
        void this.loadCurrentAndPlay();
      }
    }
    persistQueueSnapshot("Playback queue");
  }

  moveQueueItem(source: number, destination: number): void {
    const state = usePlayerStore.getState();
    const queue = [...state.queue];
    const [item] = queue.splice(source, 1);
    if (!item) return;
    queue.splice(destination, 0, item);
    usePlayerStore.setState({ queue, originalQueue: queue });
    persistQueueSnapshot("Playback queue");
  }

  clearPlayed(): void {
    const state = usePlayerStore.getState();
    if (!state.currentTrack) return;
    const currentIndex = state.queue.findIndex((track) => track.id === state.currentTrack?.id);
    if (currentIndex <= 0) return;
    const queue = state.queue.slice(currentIndex);
    usePlayerStore.setState({ queue, originalQueue: queue });
    persistQueueSnapshot("Playback queue");
  }

  restoreQueueSnapshot(snapshot: QueueSnapshot): void {
    const currentTrack = snapshot.queue[snapshot.currentIndex] ?? snapshot.queue[0] ?? null;
    this.audio.pause();
    this.audio.removeAttribute("src");
    usePlayerStore.setState({
      queue: snapshot.queue,
      originalQueue: snapshot.queue,
      currentTrack,
      currentTimeSeconds: 0,
      durationSeconds: currentTrack ? ticksToSeconds(currentTrack.durationTicks) : 0,
      isPlaying: false,
      playbackStatus: currentTrack ? "loading" : "idle",
      playbackError: undefined
    });
    persistQueueSnapshot(snapshot.name);
    void this.loadCurrentPaused();
  }

  async saveQueueAsPlaylist(name: string): Promise<string> {
    const queue = usePlayerStore.getState().queue;
    if (!queue.length) throw new Error("Queue is empty.");
    const playlistId = await jellyfinClient.createPlaylist(name);
    await jellyfinClient.addTracksToPlaylist(playlistId, queue.map((track) => track.id));
    return playlistId;
  }

  clearQueue(): void {
    const state = usePlayerStore.getState();
    if (state.currentTrack) void jellyfinClient.reportPlaybackStopped(state.currentTrack.id, this.audio.currentTime);
    this.audio.pause();
    this.audio.removeAttribute("src");
    usePlayerStore.setState({ ...initialPlayerState, volume: state.volume, lastQueueSnapshot: state.lastQueueSnapshot, queueHistory: state.queueHistory });
  }

  private async loadCurrentPaused(): Promise<void> {
    const track = usePlayerStore.getState().currentTrack;
    if (!track) return;
    this.audio.src = await this.resolveSource(track);
    this.audio.load();
    usePlayerStore.setState({
      isPlaying: false,
      durationSeconds: ticksToSeconds(track.durationTicks),
      playbackStatus: "paused",
      playbackError: undefined
    });
    this.preloadNext();
    this.updateMediaSession();
    void useLyricsStore.getState().fetchLyrics(track);
  }

  private async loadCurrentAndPlay(): Promise<void> {
    const track = usePlayerStore.getState().currentTrack;
    if (!track) return;
    this.lastReportedProgress = -1;
    usePlayerStore.setState({ isPlaying: false, playbackStatus: "loading", playbackError: undefined });
    const previous = usePlayerStore.getState().currentTrack;
    if (previous && previous.id !== track.id) void jellyfinClient.reportPlaybackStopped(previous.id, this.audio.currentTime);
    const src = await this.resolveSource(track);
    this.audio.src = src;
    this.audio.load();
    const started = await this.audio.play().then(() => true).catch(() => false);
    usePlayerStore.setState({
      isPlaying: started && !this.audio.paused,
      durationSeconds: ticksToSeconds(track.durationTicks),
      playbackStatus: started ? (this.audio.paused ? "paused" : "playing") : "error",
      playbackError: started ? undefined : "Playback could not start."
    });
    if (!started) {
      this.updateMediaSession();
      void useLyricsStore.getState().fetchLyrics(track);
      return;
    }
    this.preloadNext();
    this.updateMediaSession();
    void jellyfinClient.reportPlaybackStarted(track.id);
    preferenceStorage.recordPlay(track.id);
    recentTrackStorage.record(track);
    void useLyricsStore.getState().fetchLyrics(track);
  }

  private async resolveSource(track: Track): Promise<string> {
    return jellyfinClient.getStreamUrl(track.id);
  }

  private async preloadNext(): Promise<void> {
    const state = usePlayerStore.getState();
    if (!state.currentTrack) return;
    const index = state.queue.findIndex((track) => track.id === state.currentTrack?.id);
    const next = state.queue[index + 1];
    if (!next) return;
    this.preloader.src = await this.resolveSource(next);
    this.preloader.preload = "auto";
    this.preloader.load();
  }

  private onTimeUpdate(): void {
    const state = usePlayerStore.getState();
    const current = Math.min(this.audio.currentTime, state.durationSeconds || this.audio.currentTime);
    usePlayerStore.setState({
      currentTimeSeconds: current,
      durationSeconds: Number.isFinite(this.audio.duration) ? this.audio.duration : state.durationSeconds
    });
    useLyricsStore.getState().updateCurrentLine(current);
    const whole = Math.floor(current);
    if (state.currentTrack && whole > 0 && whole % 10 === 0 && whole !== this.lastReportedProgress) {
      this.lastReportedProgress = whole;
      void jellyfinClient.reportPlaybackProgress(state.currentTrack.id, current, !state.isPlaying);
    }
    this.updatePositionState();
  }

  private onDurationChange(): void {
    if (Number.isFinite(this.audio.duration)) {
      usePlayerStore.setState({ durationSeconds: this.audio.duration });
    }
  }

  private setPlaybackStatus(playbackStatus: PlaybackStatus): void {
    const state = usePlayerStore.getState();
    if (!state.currentTrack) return;
    usePlayerStore.setState({ playbackStatus, playbackError: undefined });
    this.updateMediaSession();
  }

  private onCanPlay(): void {
    const state = usePlayerStore.getState();
    if (!state.currentTrack || state.playbackStatus === "playing") return;
    if (state.playbackStatus === "buffering" && !this.audio.paused) {
      usePlayerStore.setState({ playbackStatus: "loading", playbackError: undefined });
      this.updateMediaSession();
    }
  }

  private onPlaying(): void {
    if (!usePlayerStore.getState().currentTrack) return;
    usePlayerStore.setState({ playbackStatus: "playing", isPlaying: true, playbackError: undefined });
    this.updateMediaSession();
  }

  private onPause(): void {
    const state = usePlayerStore.getState();
    if (!state.currentTrack || state.playbackStatus === "idle" || state.playbackStatus === "error") return;
    usePlayerStore.setState({ playbackStatus: "paused", isPlaying: false, playbackError: undefined });
    this.updateMediaSession();
  }

  private onError(): void {
    if (!usePlayerStore.getState().currentTrack) return;
    usePlayerStore.setState({ playbackStatus: "error", playbackError: "Playback failed.", isPlaying: false });
    this.updateMediaSession();
  }

  private onEnded(): void {
    const state = usePlayerStore.getState();
    if (state.repeatMode === "one") {
      this.seek(0);
      void this.audio.play();
      return;
    }
    this.nextTrack();
  }

  private updateMediaSession(): void {
    const state = usePlayerStore.getState();
    if (!("mediaSession" in navigator) || !state.currentTrack) return;
    const track = state.currentTrack;
    const artwork = track.artworkItemId
      ? [{ src: jellyfinClient.artworkUrl(track.artworkItemId, track.artworkTag, 512), sizes: "512x512", type: "image/jpeg" }]
      : [];
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artistName,
      album: track.albumName,
      artwork
    });
    navigator.mediaSession.playbackState = state.playbackStatus === "playing" || state.playbackStatus === "buffering" ? "playing" : "paused";
    const handlers: Partial<Record<MediaSessionAction, MediaSessionActionHandler>> = {
      play: () => void this.togglePlayPause(),
      pause: () => void this.togglePlayPause(),
      previoustrack: () => this.previousTrack(),
      nexttrack: () => this.nextTrack(),
      seekto: (details) => {
        if (details.seekTime !== undefined) this.seek(details.seekTime);
      }
    };
    for (const [action, handler] of Object.entries(handlers)) {
      try {
        navigator.mediaSession.setActionHandler(action as MediaSessionAction, handler ?? null);
      } catch {
        // Some browsers expose only a subset of actions.
      }
    }
    this.updatePositionState();
  }

  private updatePositionState(): void {
    const state = usePlayerStore.getState();
    if (!("mediaSession" in navigator) || !navigator.mediaSession.setPositionState || !state.currentTrack) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: Math.max(1, state.durationSeconds),
        playbackRate: 1,
        position: Math.min(state.currentTimeSeconds, Math.max(1, state.durationSeconds))
      });
    } catch {
      // Position state can throw for incomplete durations.
    }
  }
}

export const audioService = new BrowserAudioService();

export const usePlayerStore = create<PlayerStore>(() => ({
  ...initialPlayerState,
  play: (tracks, startingAt) => audioService.play(tracks, startingAt),
  togglePlayPause: () => void audioService.togglePlayPause(),
  nextTrack: () => audioService.nextTrack(),
  previousTrack: () => audioService.previousTrack(),
  seek: (seconds) => audioService.seek(seconds),
  setVolume: (volume) => audioService.setVolume(volume),
  toggleShuffle: () => audioService.toggleShuffle(),
  toggleRepeatMode: () => audioService.toggleRepeatMode(),
  jumpTo: (index) => audioService.jumpTo(index),
  addToQueue: (track) => audioService.addToQueue(track),
  playNext: (track) => audioService.playNext(track),
  removeFromQueue: (index) => audioService.removeFromQueue(index),
  moveQueueItem: (source, destination) => audioService.moveQueueItem(source, destination),
  clearPlayed: () => audioService.clearPlayed(),
  restoreQueueSnapshot: (snapshot) => audioService.restoreQueueSnapshot(snapshot),
  saveQueueAsPlaylist: (name) => audioService.saveQueueAsPlaylist(name),
  clearQueue: () => audioService.clearQueue()
}));
