import type { SmartMixDefinition, SmartMixId, SmartMixResult, Track } from "@domain/types";
import { jellyfinClient } from "@core/jellyfin";
import { preferenceStorage } from "@core/storage/storage";

const pageSize = 500;
const shuffleCandidateCap = 500;
const recentlyAddedCap = 100;
const maxUnplayedPages = 4;

export const smartMixDefinitions: SmartMixDefinition[] = [
  { id: "favorites", title: "FAVORITES MIX", description: "Shuffle your favorite tracks." },
  { id: "recently-added", title: "RECENTLY ADDED", description: "Newest tracks in your library." },
  { id: "unplayed", title: "UNPLAYED", description: "Tracks with no Jellyfin plays yet." },
  { id: "artist-radio", title: "ARTIST RADIO", description: "Shuffle more from the current artist." },
  { id: "weekly-most-played", title: "WEEKLY TOP 20", description: "Your 20 most played tracks this week." }
];

function shuffleTracks(tracks: Track[]): Track[] {
  return [...tracks].sort(() => Math.random() - 0.5);
}

function definitionFor(id: SmartMixId): SmartMixDefinition {
  const definition = smartMixDefinitions.find((item) => item.id === id);
  if (!definition) throw new Error(`Unknown smart mix: ${id}`);
  return definition;
}

async function favoriteMix(): Promise<Track[]> {
  const page = await jellyfinClient.getTracksPage({
    sortBy: "SortName",
    sortOrder: "Ascending",
    favoritesOnly: true,
    limit: shuffleCandidateCap,
    startIndex: 0
  });
  return shuffleTracks(page.tracks);
}

async function recentlyAddedMix(): Promise<Track[]> {
  const page = await jellyfinClient.getTracksPage({
    sortBy: "DateCreated",
    sortOrder: "Descending",
    limit: recentlyAddedCap,
    startIndex: 0
  });
  return page.tracks;
}

async function unplayedMix(): Promise<Track[]> {
  const candidates: Track[] = [];
  for (let pageIndex = 0; pageIndex < maxUnplayedPages && candidates.length < shuffleCandidateCap; pageIndex += 1) {
    const page = await jellyfinClient.getTracksPage({
      sortBy: "SortName",
      sortOrder: "Ascending",
      limit: pageSize,
      startIndex: pageIndex * pageSize
    });
    candidates.push(...page.tracks.filter((track) => !track.playCount).slice(0, shuffleCandidateCap - candidates.length));
    if (!page.tracks.length || page.tracks.length < pageSize) break;
  }
  return shuffleTracks(candidates);
}

async function artistRadioMix(artistId?: string): Promise<Track[]> {
  if (!artistId) return [];
  return shuffleTracks((await jellyfinClient.getArtistTracks(artistId)).slice(0, shuffleCandidateCap));
}

async function weeklyMostPlayedMix(): Promise<Track[]> {
  const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const counts = new Map(preferenceStorage.loadPlayEvents().filter((event) => Date.parse(event.playedAt) >= weekStart.getTime()).map((event) => [event.trackId, 0]));
  for (const event of preferenceStorage.loadPlayEvents()) {
    if (Date.parse(event.playedAt) >= weekStart.getTime()) counts.set(event.trackId, (counts.get(event.trackId) ?? 0) + 1);
  }
  if (!counts.size) return [];
  const tracks = (await jellyfinClient.getAllTracks("SortName", "Ascending")).filter((track) => counts.has(track.id));
  return tracks.sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0)).slice(0, 20);
}

export async function buildSmartMix(id: SmartMixId, options: { artistId?: string } = {}): Promise<SmartMixResult> {
  const tracks = id === "favorites"
    ? await favoriteMix()
    : id === "recently-added"
      ? await recentlyAddedMix()
      : id === "unplayed"
        ? await unplayedMix()
        : id === "artist-radio"
          ? await artistRadioMix(options.artistId)
          : await weeklyMostPlayedMix();

  return {
    definition: definitionFor(id),
    tracks,
    generatedAt: new Date().toISOString()
  };
}

export const smartMixInternals = {
  pageSize,
  shuffleCandidateCap,
  recentlyAddedCap,
  maxUnplayedPages,
  shuffleTracks
};
