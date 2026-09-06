import { Link } from "react-router-dom";
import type { Artist, Playlist, Track } from "@domain/types";
import { formatDuration, ticksToSeconds } from "@domain/types";
import { usePlayerStore } from "@core/player/audioService";
import { Artwork } from "./artwork";
import { icons } from "./icons";
import { Badge, IconButton } from "./primitives";

export function ArtistRow({ artist }: { artist: Artist }) {
  return (
    <Link className="row" to={`/library/artists/${encodeURIComponent(artist.id)}`}>
      <Artwork className="artist-row-artwork" itemId={artist.artworkId} tag={artist.artworkTag} icon={icons.artist} maxHeight={96} />
      <div className="row-main">
        <div className="row-title">{artist.name}</div>
        <div className="row-subtitle">{artist.albumCount ?? 0} albums</div>
      </div>
    </Link>
  );
}

export function PlaylistRow({ playlist }: { playlist: Playlist }) {
  return (
    <Link className="row" to={`/library/playlists/${encodeURIComponent(playlist.id)}`}>
      <Artwork className="playlist-row-artwork" itemId={playlist.artworkId ?? playlist.id} tag={playlist.artworkTag} icon={icons.playlist} maxHeight={300} />
      <div className="row-main">
        <div className="row-title">{playlist.name}</div>
        <div className="row-subtitle">{playlist.trackCount ?? 0} tracks</div>
      </div>
    </Link>
  );
}

export function TrackRow({
  track,
  index,
  contextTracks,
  artworkSize = 38,
  className,
  onFavorite,
  onDelete,
  onRemoveFromQueue,
  onRemoveFromPlaylist
}: {
  track: Track;
  index: number;
  contextTracks: Track[];
  artworkSize?: number;
  className?: string;
  onFavorite?: (track: Track) => void | Promise<void>;
  onDelete?: (track: Track) => void | Promise<void>;
  onRemoveFromQueue?: (track: Track) => void | Promise<void>;
  onRemoveFromPlaylist?: (track: Track) => void | Promise<void>;
}) {
  const player = usePlayerStore();
  const isCurrent = player.currentTrack?.id === track.id;
  const rowStateClass = isCurrent
    ? player.playbackStatus === "playing"
      ? "playing"
      : player.playbackStatus === "loading" || player.playbackStatus === "buffering"
        ? "current buffering"
        : player.playbackStatus === "error"
          ? "current error"
          : "current"
    : "";
  const artworkId = track.artworkItemId ?? track.albumId;
  const rowClassName = `row ${rowStateClass} ${className ?? ""}`.trim();

  return (
    <div className={rowClassName}>
      <button className="artwork" style={{ width: artworkSize, height: artworkSize, padding: 0 }} onClick={() => player.play(contextTracks, index)} aria-label={`Play ${track.title}`}>
        <Artwork className="artwork" itemId={artworkId} tag={track.artworkTag} maxHeight={Math.max(96, artworkSize * 2)} />
      </button>
      <div className="row-main" role="button" tabIndex={0} onClick={() => player.play(contextTracks, index)}>
        <div className="row-title">{track.title}</div>
        <div className="row-subtitle">{track.artistName} / {formatDuration(ticksToSeconds(track.durationTicks))}</div>
      </div>
      <Badge text={track.container?.toUpperCase()} />
      <div className="row-actions">
        <IconButton label="Play next" icon={icons.skip} onClick={() => player.playNext(track)} />
        {onFavorite ? <IconButton label={track.isFavorite ? "Unfavorite" : "Favorite"} icon={icons.heart} active={track.isFavorite} onClick={() => void onFavorite(track)} /> : null}
        {onRemoveFromPlaylist ? <IconButton label="Remove from playlist" icon={icons.playlist} onClick={() => void onRemoveFromPlaylist(track)} /> : null}
        {onRemoveFromQueue ? <IconButton label="Remove from queue" icon={icons.trash} onClick={() => void onRemoveFromQueue(track)} /> : null}
        {onDelete ? <IconButton label="Delete" icon={icons.trash} onClick={() => void onDelete(track)} /> : null}
      </div>
    </div>
  );
}
