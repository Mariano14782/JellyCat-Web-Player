import { useEffect, useMemo, useState } from "react";
import type { SearchResults, Track } from "@domain/types";
import { friendlyErrorMessage, jellyfinClient } from "@core/jellyfin";
import { preferenceStorage } from "@core/storage/storage";
import { AlbumCard, ArtistRow, CheckerStrip, EmptyState, IconButton, JLinkButton, KofiButton, LoadingState, Section, TrackRow, icons } from "@shared/ui";

const emptyResults: SearchResults = { artists: [], albums: [], tracks: [] };
const minHistoryQueryLength = 3;
const maxSearchHistoryItems = 20;

function commitSearchHistory(history: string[], query: string): string[] {
  const trimmed = query.trim().replace(/\s+/g, " ");
  if (trimmed.length < minHistoryQueryLength) return history;
  const normalized = trimmed.toLowerCase();
  return [
    trimmed,
    ...history.filter((item) => {
      const current = item.trim().replace(/\s+/g, " ").toLowerCase();
      if (current === normalized) return false;
      if (current.startsWith(normalized) || normalized.startsWith(current)) return false;
      return !isLikelyPartialSearch(current, normalized);
    })
  ].slice(0, maxSearchHistoryItems);
}

function isLikelyPartialSearch(current: string, next: string): boolean {
  if (current.length >= next.length) return false;
  if (next.length - current.length > 3) return false;
  return editDistanceAtMost(current, next, 2);
}

function editDistanceAtMost(left: string, right: string, maxDistance: number): boolean {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    let rowMin = current[0];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      const value = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        previous[rightIndex - 1] + cost
      );
      current[rightIndex] = value;
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > maxDistance) return false;
    previous = current;
  }
  return previous[right.length] <= maxDistance;
}

export function SearchView() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(emptyResults);
  const [history, setHistory] = useState(preferenceStorage.loadSearchHistory());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const commitCurrentSearch = (value = query) => {
    setHistory((current) => {
      const next = commitSearchHistory(current, value);
      if (next === current) return current;
      preferenceStorage.saveSearchHistory(next);
      return next;
    });
  };

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults(emptyResults);
      setIsLoading(false);
      setError(null);
      return undefined;
    }
    setIsLoading(true);
    let isCurrent = true;
    const timer = window.setTimeout(() => {
      void jellyfinClient.search(trimmed).then((next) => {
        if (!isCurrent) return;
        setResults(next);
        setError(null);
        commitCurrentSearch(trimmed);
      }).catch((err) => {
        if (!isCurrent) return;
        setResults(emptyResults);
        setError(friendlyErrorMessage(err, "Search failed. Try again."));
      }).finally(() => {
        if (isCurrent) setIsLoading(false);
      });
    }, 360);
    return () => {
      isCurrent = false;
      window.clearTimeout(timer);
    };
  }, [query]);

  const hasResults = useMemo(
    () => results.artists.length || results.albums.length || results.tracks.length,
    [results]
  );

  const removeHistory = (item: string) => {
    const next = history.filter((entry) => entry !== item);
    setHistory(next);
    preferenceStorage.saveSearchHistory(next);
  };

  const clearHistory = () => {
    setHistory([]);
    preferenceStorage.saveSearchHistory([]);
  };

  return (
    <main className="screen">
      <div className="topbar">
        <h1>SEARCH</h1>
        <KofiButton />
        <span className="spacer" />
        <IconButton label="Clear" icon={icons.trash} onClick={() => setQuery("")} />
      </div>
      <Section title="LIBRARY" />
      <div style={{ padding: "0 14px 12px" }}>
        <input
          className="search-input"
          placeholder="TYPE TO SEARCH..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") commitCurrentSearch();
          }}
        />
      </div>
      <CheckerStrip />
      {!query.trim() ? (
        history.length ? (
          <>
            <Section title="RECENT SEARCHES" action="CLEAR ALL" onAction={clearHistory} />
            {history.map((item) => (
              <div className="row" key={item}>
                <button className="row-main" style={{ border: 0, background: "transparent", textAlign: "left" }} onClick={() => { setQuery(item); commitCurrentSearch(item); }}>
                  <div className="row-title">{item}</div>
                </button>
                <IconButton label="Remove" icon={icons.trash} onClick={() => removeHistory(item)} />
              </div>
            ))}
          </>
        ) : <EmptyState label="ENTER QUERY TO SEARCH" />
      ) : isLoading ? <LoadingState label="SEARCHING" /> : error ? <EmptyState label={error} /> : !hasResults ? <EmptyState label="NO RESULTS FOUND" /> : (
        <SearchResultsView results={results} onCommitSearch={commitCurrentSearch} />
      )}
    </main>
  );
}

function SearchResultsView({ results, onCommitSearch }: { results: SearchResults; onCommitSearch: () => void }) {
  const [tracks, setTracks] = useState<Track[]>(results.tracks);

  useEffect(() => setTracks(results.tracks), [results.tracks]);

  const toggleFavorite = async (track: Track) => {
    await jellyfinClient.updateFavoriteStatus(track.id, !track.isFavorite);
    setTracks((current) => current.map((item) => item.id === track.id ? { ...item, isFavorite: !item.isFavorite } : item));
  };

  const deleteTrack = async (track: Track) => {
    if (!window.confirm(`Delete ${track.title} from the Jellyfin server?`)) return;
    await jellyfinClient.deleteItem(track.id);
    setTracks((current) => current.filter((item) => item.id !== track.id));
  };

  return (
    <>
      <div onClickCapture={() => onCommitSearch()}>
        {results.artists.length ? (
          <>
            <Section title="ARTISTS" action={`// ${results.artists.length}`} />
            {results.artists.slice(0, 8).map((artist) => <ArtistRow key={artist.id} artist={artist} />)}
          </>
        ) : null}
        {results.albums.length ? (
          <>
            <Section title="ALBUMS" action={`// ${results.albums.length}`} />
            <div className="h-scroll">
              {results.albums.map((album) => <AlbumCard key={album.id} album={album} />)}
            </div>
          </>
        ) : null}
        {tracks.length ? (
          <>
            <Section title="TRACKS" action={`// ${tracks.length}`} />
            {tracks.map((track, index) => (
              <TrackRow
                key={track.id}
                track={track}
                index={index}
                contextTracks={tracks}
                onFavorite={toggleFavorite}
                onDelete={deleteTrack}
              />
            ))}
          </>
        ) : null}
      </div>
      <div style={{ height: 120 }} />
      <JLinkButton to="/library" icon={icons.back} className="trust-action">BACK TO LIBRARY</JLinkButton>
    </>
  );
}
