import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Track } from "@domain/types";

const track: Track = {
  id: "track-1",
  title: "Song One",
  albumId: "album-1",
  artistName: "Artist",
  albumName: "Album",
  durationTicks: 120_000_000,
  isFavorite: false
};

const secondTrack: Track = {
  ...track,
  id: "track-2",
  title: "Song Two"
};

type FakeListener = () => void;

class FakeAudio {
  paused = true;
  src = "";
  preload = "";
  volume = 1;
  currentTime = 0;
  duration = 12;
  listeners = new Map<string, FakeListener[]>();
  load = vi.fn(() => this.dispatch("loadstart"));
  play = vi.fn(async () => {
    this.paused = false;
    this.dispatch("playing");
  });
  pause = vi.fn(() => {
    this.paused = true;
    this.dispatch("pause");
  });
  removeAttribute = vi.fn((name: string) => {
    if (name === "src") this.src = "";
  });
  addEventListener = vi.fn((event: string, listener: FakeListener) => {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
  });

  dispatch(event: string): void {
    for (const listener of this.listeners.get(event) ?? []) listener();
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

async function setupAudioService() {
  const audioInstances: FakeAudio[] = [];
  const fetchLyrics = vi.fn(() => new Promise<void>(() => undefined));
  const reportPlaybackStarted = vi.fn(async () => undefined);

  vi.stubGlobal("Audio", vi.fn(function AudioMock() {
    const audio = new FakeAudio();
    audioInstances.push(audio);
    return audio;
  }));

  vi.doMock("./lyricsService", () => ({
    useLyricsStore: {
      getState: () => ({
        fetchLyrics,
        updateCurrentLine: vi.fn()
      })
    }
  }));

  vi.doMock("@core/jellyfin", () => ({
    jellyfinClient: {
      getStreamUrl: vi.fn(() => "https://jellyfin.example/Audio/track-1/universal"),
      createPlaylist: vi.fn(async () => "playlist-1"),
      addTracksToPlaylist: vi.fn(async () => undefined),
      reportPlaybackStarted,
      reportPlaybackProgress: vi.fn(async () => undefined),
      reportPlaybackStopped: vi.fn(async () => undefined),
      artworkUrl: vi.fn(() => "https://jellyfin.example/art.jpg")
    }
  }));

  const { usePlayerStore } = await import("./audioService");
  return { audioInstances, fetchLyrics, reportPlaybackStarted, usePlayerStore };
}

describe("audio service playback startup", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("starts audio before lyrics finish loading", async () => {
    const { audioInstances, fetchLyrics, reportPlaybackStarted, usePlayerStore } = await setupAudioService();

    usePlayerStore.getState().play([track], 0);
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(audioInstances[0].load).toHaveBeenCalled();
    expect(audioInstances[0].play).toHaveBeenCalled();
    expect(fetchLyrics).toHaveBeenCalledWith(track);
    expect(usePlayerStore.getState().isPlaying).toBe(true);
    expect(usePlayerStore.getState().playbackStatus).toBe("playing");
    expect(reportPlaybackStarted).toHaveBeenCalledWith(track.id);
  });

  it("marks a selected track as loading before media starts", async () => {
    const { audioInstances, usePlayerStore } = await setupAudioService();
    const pendingPlayback = deferred<void>();
    audioInstances[0].play.mockReturnValueOnce(pendingPlayback.promise);

    usePlayerStore.getState().play([track], 0);

    expect(usePlayerStore.getState()).toMatchObject({
      currentTrack: track,
      isPlaying: false,
      playbackStatus: "loading"
    });
  });

  it("restores saved volume when the audio service starts", async () => {
    localStorage.setItem("jellycat:web:playerVolume", JSON.stringify(0.35));

    const { audioInstances, usePlayerStore } = await setupAudioService();

    expect(usePlayerStore.getState().volume).toBe(0.35);
    expect(audioInstances[0].volume).toBe(0.35);
  });

  it("persists volume changes", async () => {
    const { audioInstances, usePlayerStore } = await setupAudioService();

    usePlayerStore.getState().setVolume(0.25);

    expect(usePlayerStore.getState().volume).toBe(0.25);
    expect(audioInstances[0].volume).toBe(0.25);
    expect(localStorage.getItem("jellycat:web:playerVolume")).toBe("0.25");
  });

  it("tracks playing, buffering, error, and idle media states", async () => {
    const { audioInstances, usePlayerStore } = await setupAudioService();

    usePlayerStore.getState().play([track], 0);
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(usePlayerStore.getState()).toMatchObject({ isPlaying: true, playbackStatus: "playing" });

    audioInstances[0].dispatch("waiting");
    expect(usePlayerStore.getState()).toMatchObject({
      currentTrack: track,
      playbackStatus: "buffering"
    });

    audioInstances[0].dispatch("stalled");
    expect(usePlayerStore.getState().playbackStatus).toBe("buffering");

    audioInstances[0].dispatch("error");
    expect(usePlayerStore.getState().playbackStatus).toBe("error");
    expect(usePlayerStore.getState().playbackError).toBeTruthy();

    usePlayerStore.getState().clearQueue();
    expect(usePlayerStore.getState()).toMatchObject({
      currentTrack: null,
      isPlaying: false,
      playbackStatus: "idle"
    });
  });

  it("marks user pause as paused", async () => {
    const { usePlayerStore } = await setupAudioService();

    usePlayerStore.getState().play([track], 0);
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    await usePlayerStore.getState().togglePlayPause();

    expect(usePlayerStore.getState()).toMatchObject({
      isPlaying: false,
      playbackStatus: "paused"
    });
  });

  it("clears played items while preserving the current and upcoming queue", async () => {
    const { usePlayerStore } = await setupAudioService();

    usePlayerStore.getState().play([track, secondTrack], 0);
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    usePlayerStore.getState().jumpTo(1);
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    usePlayerStore.getState().clearPlayed();

    expect(usePlayerStore.getState().queue.map((item: Track) => item.id)).toEqual(["track-2"]);
    expect(usePlayerStore.getState().currentTrack?.id).toBe("track-2");
  });

  it("restores a queue snapshot paused", async () => {
    const { usePlayerStore } = await setupAudioService();

    usePlayerStore.getState().restoreQueueSnapshot({
      id: "snapshot-1",
      name: "Saved queue",
      queue: [track, secondTrack],
      currentIndex: 1,
      createdAt: "2026-06-16T00:00:00.000Z"
    });
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(usePlayerStore.getState()).toMatchObject({
      queue: [track, secondTrack],
      currentTrack: secondTrack,
      isPlaying: false,
      playbackStatus: "paused"
    });
  });

  it("saves the current queue as a playlist in queue order", async () => {
    const { usePlayerStore } = await setupAudioService();
    const { jellyfinClient } = await import("@core/jellyfin");

    usePlayerStore.getState().play([track, secondTrack], 0);
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    await usePlayerStore.getState().saveQueueAsPlaylist("Road queue");

    expect(jellyfinClient.createPlaylist).toHaveBeenCalledWith("Road queue");
    expect(jellyfinClient.addTracksToPlaylist).toHaveBeenCalledWith("playlist-1", ["track-1", "track-2"]);
  });
});
