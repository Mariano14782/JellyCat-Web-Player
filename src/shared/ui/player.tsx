import { useEffect, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import type { Track } from "@domain/types";
import { formatDuration, ticksToSeconds } from "@domain/types";
import { jellyfinClient } from "@core/jellyfin";
import { usePlayerStore } from "@core/player/audioService";
import { Artwork } from "./artwork";
import { icons } from "./icons";
import { IconButton } from "./primitives";
import { ProgressBlocks } from "./progress";

export function Ticker({ track }: { track?: Track | null }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLSpanElement | null>(null);
  const [metrics, setMetrics] = useState({ distance: 0, duration: 18, copies: 2 });
  const text = track
    ? `NOW PLAYING: ${track.title.toUpperCase()}  ·  ARTIST: ${track.artistName.toUpperCase()}  ·  ALBUM: ${track.albumName.toUpperCase()}  ·  ${track.container ? `FORMAT: ${track.container.toUpperCase()}  ·  ` : ""}${track.bitrate ? `BITRATE: ${track.bitrate} KBPS  ·  ` : ""}${track.playCount !== undefined ? `PLAYS: ${track.playCount}  ·  ` : ""}DURATION: ${formatDuration(ticksToSeconds(track.durationTicks))}  ·  `
    : "JELLYCAT // INDUSTRIAL AUDIO INTERFACE  ·  SYSTEM READY  ·  WAITING FOR INPUT  ·  ";

  useEffect(() => {
    const measure = () => {
      const textWidth = textRef.current?.offsetWidth ?? 0;
      const containerWidth = containerRef.current?.clientWidth ?? 0;
      const distance = Math.max(0, textWidth);
      const copies = textWidth > 0 ? Math.max(2, Math.ceil(containerWidth / textWidth) + 2) : 2;
      setMetrics({ distance, duration: Math.max(8, distance / 60), copies });
    };

    measure();
    const observer = new ResizeObserver(measure);
    if (containerRef.current) observer.observe(containerRef.current);
    if (textRef.current) observer.observe(textRef.current);
    return () => observer.disconnect();
  }, [text]);

  return (
    <div ref={containerRef} className="ticker">
      <div
        className="ticker-track"
        style={{
          "--ticker-distance": `${metrics.distance}px`,
          "--ticker-duration": `${metrics.duration}s`
        } as React.CSSProperties}
      >
        {Array.from({ length: metrics.copies }).map((_, index) => (
          <span key={index} ref={index === 0 ? textRef : undefined} aria-hidden={index > 0 ? "true" : undefined}>{text}</span>
        ))}
      </div>
    </div>
  );
}

export function MiniPlayer() {
  const player = usePlayerStore();
  const track = player.currentTrack;
  const [showVolume, setShowVolume] = useState(false);
  const progress = player.durationSeconds > 0 ? player.currentTimeSeconds / player.durationSeconds : 0;

  const toggleFavorite = async () => {
    if (!track) return;
    await jellyfinClient.updateFavoriteStatus(track.id, !track.isFavorite);
    usePlayerStore.setState({ currentTrack: { ...track, isFavorite: !track.isFavorite } });
  };

  return (
    <div className="mini-player-shell">
      {track ? (
        <div className="mini-player">
          <Link to="/now-playing" className="mini-player-artwork-link">
            <Artwork className="mini-player-artwork" itemId={track.artworkItemId ?? track.albumId} tag={track.artworkTag} maxHeight={160} />
          </Link>
          <div className="mini-player-main">
            <div className="mini-player-progress">
              <ProgressBlocks
                progress={progress}
                blocks={60}
                interactive
                onSeek={(pct) => player.seek(pct * player.durationSeconds)}
              />
            </div>
            <Link to="/now-playing" className="mini-player-meta">
              <div className="mini-player-title">{track.title}</div>
              <div className="mini-player-artist">{track.artistName}</div>
            </Link>
            <div className="mini-player-spacer" />
            <div className="mini-player-controls">
              <IconButton label="Previous" icon={icons.skipBack} onClick={player.previousTrack} />
              <IconButton label={player.isPlaying ? "Pause" : "Play"} icon={player.isPlaying ? icons.pause : icons.play} onClick={player.togglePlayPause} />
              <IconButton label="Next" icon={icons.skip} onClick={player.nextTrack} />
              <IconButton label={track.isFavorite ? "Unfavorite" : "Favorite"} icon={icons.heart} active={track.isFavorite} onClick={() => void toggleFavorite()} />
              <div className={`mini-volume-control ${showVolume ? "open" : ""}`}>
                <IconButton
                  label="Volume"
                  icon={player.volume === 0 ? icons.volumeOff : icons.volume}
                  active={showVolume}
                  onClick={() => setShowVolume((value) => !value)}
                />
                <div className="mini-volume-popover" aria-hidden={!showVolume}>
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
            </div>
          </div>
        </div>
      ) : null}
      <PrimaryTabBar />
    </div>
  );
}

export function PrimaryTabBar() {
  return (
    <nav className="tabbar" aria-label="Primary">
      <NavLink to="/home"><icons.home size={17} />HOME</NavLink>
      <NavLink to="/search"><icons.search size={17} />SEARCH</NavLink>
      <NavLink to="/library"><icons.library size={17} />LIBRARY</NavLink>
    </nav>
  );
}
