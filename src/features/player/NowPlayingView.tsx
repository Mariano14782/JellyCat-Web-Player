import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAppStore } from "@app/appStore";
import { formatDuration } from "@domain/types";
import { usePlayerStore } from "@core/player/audioService";
import { jellyfinClient } from "@core/jellyfin";
import { preferenceStorage } from "@core/storage/storage";
import { useLyricsStore } from "@core/player/lyricsService";
import { Artwork, Divider, IconButton, JButton, PrimaryTabBar, ProgressBlocks, Ticker, icons } from "@shared/ui";

const playbackStatusLabels = {
  idle: "IDLE",
  loading: "LOADING",
  buffering: "BUFFERING",
  playing: "PLAYBACK",
  paused: "PAUSED",
  error: "ERROR"
} as const;

export function NowPlayingView() {
  const navigate = useNavigate();
  const player = usePlayerStore();
  const immersive = useAppStore((state) => state.immersivePlayerBackground);
  const lyrics = useLyricsStore();
  const track = player.currentTrack;
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const [showLyrics, setShowLyrics] = useState(false);
  const [showVolume, setShowVolume] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  const exitTo = (target: number | string) => {
    setIsExiting(true);
    window.setTimeout(() => {
      if (typeof target === "number") {
        navigate(target);
      } else {
        navigate(target);
      }
    }, typeof target === "number" ? 240 : 90);
  };

  const toggleFavorite = async () => {
    if (!track) return;
    await jellyfinClient.updateFavoriteStatus(track.id, !track.isFavorite);
    usePlayerStore.setState({ currentTrack: { ...track, isFavorite: !track.isFavorite } });
  };

  const openArtist = async () => {
    if (!track) return;
    const artistId = track.artistId ?? await jellyfinClient.getArtists()
      .then((artists) => artists.find((artist) => artist.name.toLowerCase() === track.artistName.toLowerCase())?.id)
      .catch(() => undefined);

    navigate(artistId ? `/library/artists/${encodeURIComponent(artistId)}` : "/library/artists");
  };

  return (
    <main className={`now-playing ${isExiting ? "exiting" : ""}`}>
      {track && immersive ? (
        <div style={{ position: "fixed", inset: 0, opacity: 0.22, filter: "blur(44px)", transform: "scale(1.08)" }}>
          <Artwork itemId={track.artworkItemId ?? track.albumId} tag={track.artworkTag} maxHeight={1000} />
        </div>
      ) : null}
      <div className="topbar" style={{ background: "transparent" }}>
        <IconButton label="Back" icon={icons.down} onClick={() => exitTo(-1)} />
        <h1>NOW PLAYING</h1>
        <span className="spacer" />
        {track ? (
          <div className="topbar-actions">
            <JButton accent={showLyrics} icon={icons.lyrics} onClick={() => setShowLyrics((value) => !value)}>
              !!! LYRICS !!!
            </JButton>
            <IconButton label="Repeat" icon={icons.repeat} active={player.repeatMode !== "none"} onClick={player.toggleRepeatMode} />
            <IconButton label="Shuffle" icon={icons.shuffle} active={player.isShuffled} onClick={player.toggleShuffle} />
            <IconButton label="Favorite" icon={icons.heart} active={track.isFavorite} onClick={() => void toggleFavorite()} />
            <div className={`volume-control ${showVolume ? "open" : ""}`}>
              <IconButton
                label="Volume"
                icon={player.volume === 0 ? icons.volumeOff : icons.volume}
                active={showVolume}
                onClick={() => setShowVolume((value) => !value)}
              />
              <div className="volume-popover" aria-hidden={!showVolume}>
                <input
                  aria-label="Volume"
                  className="volume-slider"
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={player.volume}
                  onChange={(event) => player.setVolume(Number(event.target.value))}
                  tabIndex={showVolume ? 0 : -1}
                />
              </div>
            </div>
            <IconButton label="Queue" icon={icons.queue} onClick={() => exitTo("/queue")} />
          </div>
        ) : (
          <IconButton label="Queue" icon={icons.queue} onClick={() => exitTo("/queue")} />
        )}
      </div>
      <Divider />
      <Ticker track={track} />
      {track ? (
        <section className="now-playing-content" key={showLyrics ? "lyrics" : "details"}>
          {showLyrics ? (
            <LyricsPanel />
          ) : (
            <div className="now-playing-details">
              <section className="now-playing-art">
                <Artwork itemId={track.artworkItemId ?? track.albumId} tag={track.artworkTag} maxHeight={1000} />
              </section>
              <section className="metadata-log">
                <div>■ TRACK: {track.title}</div>
                <div>□ ARTIST: <button type="button" onClick={() => void openArtist()}>{track.artistName}<icons.externalLink aria-hidden="true" className="metadata-link-icon" /></button></div>
                <div>■ ALBUM: <Link to={`/library/albums/${encodeURIComponent(track.albumId)}`}>{track.albumName}<icons.externalLink aria-hidden="true" className="metadata-link-icon" /></Link></div>
                <div>□ FORMAT: {track.container ?? "AUDIO"}</div>
                {track.bitrate ? <div>■ BITRATE: {track.bitrate} KBPS</div> : null}
                <div>□ MONTH PLAYS: {preferenceStorage.countPlays(track.id, monthStart)}</div>
              </section>
            </div>
          )}
        </section>
      ) : (
        <div className="empty-state">// NO TRACK LOADED</div>
      )}
      {track ? (
        <div className="player-controls">
          <div className="time-row">
            <span>{formatDuration(player.currentTimeSeconds)}</span>
            <span title={player.playbackError}>{playbackStatusLabels[player.playbackStatus]}</span>
            <span>{formatDuration(player.durationSeconds)}</span>
          </div>
          <div style={{ padding: "0 14px 8px" }}>
            <ProgressBlocks
              progress={player.durationSeconds ? player.currentTimeSeconds / player.durationSeconds : 0}
              blocks={46}
              interactive
              onSeek={(pct) => player.seek(pct * player.durationSeconds)}
            />
          </div>
          <Divider />
          <div className="transport-row">
            <IconButton label="Previous" icon={icons.skipBack} onClick={player.previousTrack} />
            <JButton accent icon={player.isPlaying ? icons.pause : icons.play} onClick={player.togglePlayPause}>{player.isPlaying ? "PAUSE" : "PLAY"}</JButton>
            <IconButton label="Next" icon={icons.skip} onClick={player.nextTrack} />
          </div>
          <PrimaryTabBar />
        </div>
      ) : null}
    </main>
  );
}

function LyricsPanel() {
  const lyrics = useLyricsStore();
  const player = usePlayerStore();
  const lyricsRef = useRef<HTMLElement | null>(null);
  const activeLineRef = useRef<HTMLButtonElement | null>(null);
  const followLyricsRef = useRef(true);
  const resumeTimerRef = useRef<number | null>(null);
  const dragRef = useRef<{ pointerId: number; y: number; scrollTop: number; moved: boolean } | null>(null);

  const activeLineIsVisible = () => {
    const container = lyricsRef.current;
    const activeLine = activeLineRef.current;
    if (!container || !activeLine) return false;

    const containerRect = container.getBoundingClientRect();
    const activeRect = activeLine.getBoundingClientRect();
    return activeRect.top >= containerRect.top && activeRect.bottom <= containerRect.bottom;
  };

  const centerActiveLine = (behavior: ScrollBehavior = "smooth") => {
    const container = lyricsRef.current;
    const activeLine = activeLineRef.current;
    if (!container || !activeLine) return;

    const targetTop = activeLine.offsetTop - container.clientHeight / 2 + activeLine.clientHeight / 2;
    container.scrollTo({ top: Math.max(0, targetTop), behavior });
  };

  const pauseLyricFollow = () => {
    followLyricsRef.current = false;
    if (resumeTimerRef.current) window.clearTimeout(resumeTimerRef.current);

    resumeTimerRef.current = window.setTimeout(() => {
      if (activeLineIsVisible()) {
        followLyricsRef.current = true;
        centerActiveLine();
      }
    }, 5_000);
  };

  const handleLyricsWheel = (event: React.WheelEvent<HTMLElement>) => {
    const container = lyricsRef.current;
    if (!container) return;
    pauseLyricFollow();
    event.preventDefault();
    container.scrollTop += event.deltaY;
  };

  const handleLyricsPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    const container = lyricsRef.current;
    if (!container || event.pointerType === "mouse") {
      pauseLyricFollow();
      return;
    }

    pauseLyricFollow();
    dragRef.current = {
      pointerId: event.pointerId,
      y: event.clientY,
      scrollTop: container.scrollTop,
      moved: false
    };
    container.setPointerCapture(event.pointerId);
  };

  const handleLyricsPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const container = lyricsRef.current;
    const drag = dragRef.current;
    if (!container || !drag || drag.pointerId !== event.pointerId) return;

    const deltaY = event.clientY - drag.y;
    if (Math.abs(deltaY) > 2) drag.moved = true;
    container.scrollTop = drag.scrollTop - deltaY;
  };

  const handleLyricsPointerUp = (event: React.PointerEvent<HTMLElement>) => {
    const container = lyricsRef.current;
    const drag = dragRef.current;
    if (!container || !drag || drag.pointerId !== event.pointerId) return;

    if (container.hasPointerCapture(event.pointerId)) {
      container.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
  };

  useEffect(() => {
    if (!followLyricsRef.current) return;
    centerActiveLine();
  }, [lyrics.currentLineIndex]);

  useEffect(() => () => {
    if (resumeTimerRef.current) window.clearTimeout(resumeTimerRef.current);
  }, []);

  return (
    <section
      ref={lyricsRef}
      className="lyrics"
      id="lyrics"
      onPointerDown={handleLyricsPointerDown}
      onPointerMove={handleLyricsPointerMove}
      onPointerUp={handleLyricsPointerUp}
      onPointerCancel={handleLyricsPointerUp}
      onWheel={handleLyricsWheel}
    >
      {lyrics.isLoading ? <p className="lyric-line">// LOADING LYRICS</p> : !lyrics.hasLyrics ? <p className="lyric-line">// NO LYRICS AVAILABLE</p> : lyrics.lines.length ? (
        lyrics.lines.map((line, index) => (
          <button
            key={line.id}
            ref={index === lyrics.currentLineIndex ? activeLineRef : undefined}
            className={`lyric-line ${index === lyrics.currentLineIndex ? "active" : ""}`}
            style={{ display: "block", width: "100%", background: "transparent", border: 0, textAlign: "left" }}
            onClick={() => player.seek(line.timestamp)}
          >
            {line.text}
          </button>
        ))
      ) : (
        <p className="lyric-line">{lyrics.plainLyrics}</p>
      )}
    </section>
  );
}
