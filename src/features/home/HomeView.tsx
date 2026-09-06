import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlbumCard, CheckerStrip, Divider, EmptyState, IconLinkButton, JButton, KofiButton, LoadingState, RecentItemCard, Section, StatusDot, Ticker, icons } from "@shared/ui";
import { useAppStore } from "@app/appStore";
import { jellyfinClient } from "@core/jellyfin";
import { usePlayerStore } from "@core/player/audioService";
import { useRecentActivityStore } from "@core/player/recentActivity";
import { buildSmartMix, smartMixDefinitions } from "@core/player/smartMixes";
import type { SmartMixId } from "@domain/types";
import { Artwork } from "@shared/ui/artwork";
import { loadSongsSort } from "../library/songsPreferences";

export function HomeView() {
  const navigate = useNavigate();
  const connection = useAppStore((state) => state.connection);
  const isUpdateAvailable = useAppStore((state) => state.isUpdateAvailable);
  const player = usePlayerStore();
  const recentItems = useRecentActivityStore((state) => state.items);
  const [mixStatus, setMixStatus] = useState("");
  const albumsQuery = useQuery({
    queryKey: ["home", "recent-albums"],
    queryFn: () => jellyfinClient.getRecentAlbums(12),
    enabled: connection.isServerAvailable
  });

  const shuffleAll = async () => {
    const tracks = await jellyfinClient.getAllTracks("SortName", "Ascending", 500);
    if (tracks.length) {
      const shuffled = [...tracks].sort(() => Math.random() - 0.5);
      player.play(shuffled, 0);
    }
  };

  const shuffleFavorites = async () => {
    const tracks = (await jellyfinClient.getAllTracks("SortName", "Ascending", 500)).filter((track) => track.isFavorite);
    if (tracks.length) player.play(tracks.sort(() => Math.random() - 0.5), 0);
  };

  const playAll = async () => {
    const sort = loadSongsSort();
    const tracks = await jellyfinClient.getAllTracks(sort.value, sort.order);
    if (tracks.length) player.play(tracks, 0);
  };

  const recentTracksQuery = useQuery({
    queryKey: ["home", "recent-tracks"],
    queryFn: () => jellyfinClient.getTracksPage({ sortBy: "DateCreated", sortOrder: "Descending", limit: 12 }).then((page) => page.tracks),
    enabled: connection.isServerAvailable
  });

  const playSmartMix = async (id: SmartMixId) => {
    setMixStatus("BUILDING MIX");
    try {
      const artistId = id === "artist-radio" ? player.currentTrack?.artistId : undefined;
      const result = await buildSmartMix(id, { artistId });
      if (!result.tracks.length) {
        setMixStatus("NO TRACKS FOUND");
        return;
      }
      player.play(result.tracks, 0);
      setMixStatus(`${result.definition.title} READY`);
    } catch {
      setMixStatus("MIX FAILED");
    }
  };

  const restoreLastQueue = () => {
    if (player.lastQueueSnapshot) player.restoreQueueSnapshot(player.lastQueueSnapshot);
  };
  const continueQueue = player.lastQueueSnapshot?.queue ?? [];
  const continueCurrentIndex = player.lastQueueSnapshot?.currentIndex ?? 0;
  const continueTrack = continueQueue[continueCurrentIndex] ?? continueQueue[0];
  const continueCoverTracks = continueTrack
    ? [...continueQueue.slice(continueCurrentIndex + 1), ...continueQueue.slice(0, continueCurrentIndex)]
      .filter((track) => track.id !== continueTrack.id)
      .slice(0, 3)
    : [];

  return (
    <main className="screen">
      <div className="topbar">
        <div className="brand-lockup">
          <strong>JELLYCAT</strong>
          <span className="cat-mark">{` /\\_/\\\n( o.o )`}</span>
        </div>
        <KofiButton />
        <span className="spacer" />
        <StatusDot online={connection.isServerAvailable} />
        <span className="row-subtitle">{connection.isServerAvailable ? "ONLINE" : "SERVER UNAVAILABLE"}</span>
        {isUpdateAvailable ? (
          <span className="version-notice" title="A new JellyCat version is available">
            <icons.update size={14} />
            NEW VER.
          </span>
        ) : null}
        <IconLinkButton label="Settings" icon={icons.settings} to="/settings" />
      </div>
      <CheckerStrip />
      <Ticker track={player.currentTrack} />
      <div className="action-row">
        <JButton icon={icons.shuffle} onClick={() => void shuffleAll()}>SHUFFLE ALL</JButton>
        <JButton icon={icons.heart} onClick={() => void shuffleFavorites()} disabled={!connection.isServerAvailable}>SHUFFLE FAVORITES</JButton>
        <JButton icon={icons.play} onClick={() => void playAll()} disabled={!connection.isServerAvailable}>PLAY ALL</JButton>
      </div>
      <Divider />
      <Section title="CONTINUE LISTENING" action={player.lastQueueSnapshot ? `${player.lastQueueSnapshot.queue.length} TRACKS` : undefined} />
      {player.lastQueueSnapshot ? (
        <div className="feature-panel">
          <div className="continue-art-stack" aria-hidden="true">
            <Artwork
              className="continue-art-main"
              itemId={continueTrack?.artworkItemId ?? continueTrack?.albumId}
              tag={continueTrack?.artworkTag}
              icon={icons.album}
              maxHeight={220}
            />
            <div className="continue-art-thumbs">
              {[0, 1, 2].map((slot) => {
                const track = continueCoverTracks[slot];
                return (
                <Artwork
                  key={track?.id ?? `empty-${slot}`}
                  className="continue-art-thumb"
                  itemId={track?.artworkItemId ?? track?.albumId}
                  tag={track?.artworkTag}
                  icon={icons.music}
                  maxHeight={96}
                />
                );
              })}
            </div>
          </div>
          <div>
            <strong>{player.lastQueueSnapshot.name.toUpperCase()}</strong>
            <p>{player.lastQueueSnapshot.queue[player.lastQueueSnapshot.currentIndex]?.title ?? "Saved queue"} / {new Date(player.lastQueueSnapshot.createdAt).toLocaleString()}</p>
          </div>
          <JButton icon={icons.play} onClick={restoreLastQueue}>RESTORE</JButton>
        </div>
      ) : <EmptyState label="NO SAVED QUEUE" />}
      <Divider />
      <Section title="SMART MIXES" action={mixStatus || undefined} />
      <div className="smart-mix-grid">
        {smartMixDefinitions.map((mix) => (
          <button
            key={mix.id}
            className="smart-mix-card"
            type="button"
            disabled={!connection.isServerAvailable || (mix.id === "artist-radio" && !player.currentTrack?.artistId)}
            onClick={() => void playSmartMix(mix.id)}
          >
            {mix.id === "recently-added" || mix.id === "weekly-most-played" ? <icons.play size={18} /> : <icons.shuffle size={18} />}
            <strong>{mix.title}</strong>
            <span>{mix.id === "artist-radio" && !player.currentTrack?.artistId ? "Start a track first" : mix.description}</span>
          </button>
        ))}
      </div>
      <Divider />
      <Section title="ALBUMS :: RECENT" action="VIEW ALL" onAction={() => navigate("/library/albums")} />
      {albumsQuery.isLoading ? <LoadingState label="LOADING ALBUMS" /> : albumsQuery.data?.length ? (
        <div className="h-scroll">
          {albumsQuery.data.map((album) => <AlbumCard key={album.id} album={album} />)}
        </div>
      ) : <EmptyState label="NO RECORDS FOUND" />}
      <Divider />
      <Section title="LISTEN NOW" />
      {recentItems.length ? (
        <div className="h-scroll">
          {recentItems.map((item) => <RecentItemCard key={`${item.type}-${item.id}`} item={item} />)}
        </div>
      ) : <EmptyState label="NO RECENT ACTIVITY" />}
      <Divider />
      <Section title="TRACKS :: NEW" />
      {recentTracksQuery.isLoading ? <LoadingState label="LOADING TRACKS" /> : recentTracksQuery.data?.length ? (
        <div className="compact-track-list">
          {recentTracksQuery.data.slice(0, 6).map((track, index) => (
            <button key={track.id} className="settings-row compact-track-row" type="button" onClick={() => player.play(recentTracksQuery.data ?? [], index)}>
              <Artwork
                className="compact-track-artwork"
                itemId={track.artworkItemId ?? track.albumId}
                tag={track.artworkTag}
                icon={icons.music}
                maxHeight={80}
              />
              <span className="compact-track-title">{track.title}</span>
              <span className="spacer" />
              <span>{track.artistName}</span>
            </button>
          ))}
        </div>
      ) : <EmptyState label="NO NEW TRACKS" />}
    </main>
  );
}
