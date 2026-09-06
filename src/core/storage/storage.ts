import type { AppTheme, AuthSession, PlayEvent, QueueSnapshot, RecentItem, SavedProfile, Track } from "@domain/types";

const prefix = "jellycat:web:";

export const storageKeys = {
  session: `${prefix}session`,
  theme: `${prefix}theme`,
  immersivePlayerBackground: `${prefix}immersivePlayerBackground`,
  localJellyfinLyrics: `${prefix}localJellyfinLyrics`,
  searchHistory: `${prefix}searchHistory`,
  recentActivity: `${prefix}recentActivity`,
  profiles: `${prefix}profiles`,
  profilePersistentTokens: `${prefix}profiles:persistentTokens`,
  profileSessionTokens: `${prefix}profiles:sessionTokens`,
  queueSnapshots: `${prefix}queueSnapshots`,
  recentTracks: `${prefix}recentTracks`,
  playerVolume: `${prefix}playerVolume`,
  playEvents: `${prefix}playEvents`
};

const sessionStorageKey = `${storageKeys.session}:session`;

export type AuthPersistence = "session" | "persistent";

export type StoredAuthSession = {
  session: AuthSession;
  persistence: AuthPersistence;
};

export type StoredProfileSession = {
  profileId: string;
  session: AuthSession;
  persistence: AuthPersistence;
};

type QueueSnapshotsState = {
  last: QueueSnapshot | null;
  history: QueueSnapshot[];
};

function profileIdFor(session: Pick<AuthSession, "serverUrl" | "userId" | "username">): string {
  return `${session.serverUrl}|${session.username}`;
}

function profileLabelFor(session: Pick<AuthSession, "serverUrl" | "username">): string {
  let host = session.serverUrl;
  try {
    host = new URL(session.serverUrl).host;
  } catch {
    host = session.serverUrl.replace(/^https?:\/\//, "");
  }
  return `${session.username} @ ${host}`;
}

function updateProfileList(profiles: SavedProfile[], profile: SavedProfile): SavedProfile[] {
  return [profile, ...profiles.filter((item) => item.id !== profile.id)]
    .sort((a, b) => Date.parse(b.lastUsedAt) - Date.parse(a.lastUsedAt));
}

export function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function saveJson<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

function loadSessionJson<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveSessionJson<T>(key: string, value: T): void {
  sessionStorage.setItem(key, JSON.stringify(value));
}

export const authSessionStorage = {
  load(): StoredAuthSession | null {
    const persistentSession = loadJson<AuthSession | null>(storageKeys.session, null);
    if (persistentSession) return { session: persistentSession, persistence: "persistent" };

    const session = loadSessionJson<AuthSession | null>(sessionStorageKey, null);
    return session ? { session, persistence: "session" } : null;
  },
  save(session: AuthSession, persistence: AuthPersistence): void {
    this.clear();
    if (persistence === "persistent") {
      saveJson(storageKeys.session, session);
      return;
    }
    saveSessionJson(sessionStorageKey, session);
  },
  clear(): void {
    localStorage.removeItem(storageKeys.session);
    sessionStorage.removeItem(sessionStorageKey);
  }
};

export const profileStorage = {
  profileIdFor,
  profileLabelFor,
  loadProfiles(): SavedProfile[] {
    return loadJson<SavedProfile[]>(storageKeys.profiles, []);
  },
  saveProfiles(profiles: SavedProfile[]): void {
    saveJson(storageKeys.profiles, profiles);
  },
  loadSessionTokens(): StoredProfileSession[] {
    return loadSessionJson<StoredProfileSession[]>(storageKeys.profileSessionTokens, []);
  },
  saveSessionTokens(sessions: StoredProfileSession[]): void {
    saveSessionJson(storageKeys.profileSessionTokens, sessions);
  },
  loadPersistentTokens(): StoredProfileSession[] {
    return loadJson<StoredProfileSession[]>(storageKeys.profilePersistentTokens, []);
  },
  savePersistentTokens(sessions: StoredProfileSession[]): void {
    saveJson(storageKeys.profilePersistentTokens, sessions);
  },
  upsertSession(session: AuthSession, persistence: AuthPersistence): SavedProfile {
    const now = new Date().toISOString();
    const existingProfiles = this.loadProfiles();
    const existing = existingProfiles.find((profile) => profile.id === profileIdFor(session));
    const profile: SavedProfile = {
      id: profileIdFor(session),
      label: existing?.label ?? profileLabelFor(session),
      serverUrl: session.serverUrl,
      username: session.username,
      userId: session.userId,
      persistence,
      lastUsedAt: now
    };
    this.saveProfiles(updateProfileList(existingProfiles, profile));

    if (persistence === "session") {
      const sessions = this.loadSessionTokens().filter((item) => item.profileId !== profile.id);
      this.saveSessionTokens([{ profileId: profile.id, session, persistence }, ...sessions]);
      this.savePersistentTokens(this.loadPersistentTokens().filter((item) => item.profileId !== profile.id));
    } else {
      const sessions = this.loadPersistentTokens().filter((item) => item.profileId !== profile.id);
      this.savePersistentTokens([{ profileId: profile.id, session, persistence }, ...sessions]);
      this.saveSessionTokens(this.loadSessionTokens().filter((item) => item.profileId !== profile.id));
    }

    return profile;
  },
  loadSession(profileId: string): StoredProfileSession | null {
    const profiles = this.loadProfiles();
    const profile = profiles.find((item) => item.id === profileId);
    if (!profile) return null;

    if (profile.persistence === "persistent") {
      const token = this.loadPersistentTokens().find((item) => item.profileId === profileId);
      if (token) return token;
    }

    return this.loadSessionTokens().find((item) => item.profileId === profileId) ?? null;
  },
  touchProfile(profileId: string, persistence?: SavedProfile["persistence"]): void {
    const profiles = this.loadProfiles();
    const profile = profiles.find((item) => item.id === profileId);
    if (!profile) return;
    this.saveProfiles(updateProfileList(profiles, {
      ...profile,
      persistence: persistence ?? profile.persistence,
      lastUsedAt: new Date().toISOString()
    }));
  },
  forgetProfile(profileId: string): void {
    const profile = this.loadProfiles().find((item) => item.id === profileId);
    this.saveProfiles(this.loadProfiles().filter((item) => item.id !== profileId));
    this.saveSessionTokens(this.loadSessionTokens().filter((item) => item.profileId !== profileId));
    this.savePersistentTokens(this.loadPersistentTokens().filter((item) => item.profileId !== profileId));
    const stored = authSessionStorage.load();
    if (stored && profile && profileIdFor(stored.session) === profileId) authSessionStorage.clear();
  },
  createPlaceholder(serverUrl: string, username: string): SavedProfile {
    const normalizedServerUrl = serverUrl.trim().replace(/\/+$/, "");
    const profile: SavedProfile = {
      id: `${normalizedServerUrl}|${username}`,
      label: profileLabelFor({ serverUrl: normalizedServerUrl, username }),
      serverUrl: normalizedServerUrl,
      username,
      persistence: "none",
      lastUsedAt: new Date().toISOString()
    };
    this.saveProfiles(updateProfileList(this.loadProfiles(), profile));
    return profile;
  }
};

export const queueSnapshotStorage = {
  load(): QueueSnapshotsState {
    return loadJson<QueueSnapshotsState>(storageKeys.queueSnapshots, { last: null, history: [] });
  },
  saveSnapshot(snapshot: QueueSnapshot): void {
    const current = this.load();
    const history = [snapshot, ...current.history.filter((item) => item.id !== snapshot.id)].slice(0, 5);
    saveJson(storageKeys.queueSnapshots, { last: snapshot, history });
  },
  clear(): void {
    localStorage.removeItem(storageKeys.queueSnapshots);
  }
};

export const recentTrackStorage = {
  load(): Track[] {
    return loadJson<Track[]>(storageKeys.recentTracks, []);
  },
  record(track: Track): void {
    saveJson(storageKeys.recentTracks, [track, ...this.load().filter((item) => item.id !== track.id)].slice(0, 25));
  },
  clear(): void {
    localStorage.removeItem(storageKeys.recentTracks);
  }
};

export const preferenceStorage = {
  loadTheme(): AppTheme {
    return loadJson<AppTheme>(storageKeys.theme, "original");
  },
  saveTheme(theme: AppTheme): void {
    saveJson(storageKeys.theme, theme);
  },
  loadImmersive(): boolean {
    return loadJson<boolean>(storageKeys.immersivePlayerBackground, false);
  },
  saveImmersive(value: boolean): void {
    saveJson(storageKeys.immersivePlayerBackground, value);
  },
  loadLocalJellyfinLyrics(): boolean {
    return loadJson<boolean>(storageKeys.localJellyfinLyrics, true);
  },
  saveLocalJellyfinLyrics(value: boolean): void {
    saveJson(storageKeys.localJellyfinLyrics, value);
  },
  loadSearchHistory(): string[] {
    return loadJson<string[]>(storageKeys.searchHistory, []);
  },
  saveSearchHistory(history: string[]): void {
    saveJson(storageKeys.searchHistory, history);
  },
  loadRecentActivity(): RecentItem[] {
    return loadJson<RecentItem[]>(storageKeys.recentActivity, []);
  },
  saveRecentActivity(items: RecentItem[]): void {
    saveJson(storageKeys.recentActivity, items);
  },
  loadPlayerVolume(): number {
    const volume = loadJson<number>(storageKeys.playerVolume, 1);
    return Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 1;
  },
  savePlayerVolume(volume: number): void {
    saveJson(storageKeys.playerVolume, Math.max(0, Math.min(1, volume)));
  },
  loadPlayEvents(): PlayEvent[] {
    return loadJson<PlayEvent[]>(storageKeys.playEvents, []).filter((event) => event.trackId && Number.isFinite(Date.parse(event.playedAt)));
  },
  recordPlay(trackId: string, playedAt = new Date().toISOString()): void {
    const cutoff = Date.now() - 8 * 24 * 60 * 60 * 1000;
    const events = this.loadPlayEvents().filter((event) => Date.parse(event.playedAt) >= cutoff);
    saveJson(storageKeys.playEvents, [...events, { trackId, playedAt }]);
  },
  countPlays(trackId: string, from: Date, to = new Date()): number {
    return this.loadPlayEvents().filter((event) => event.trackId === trackId && Date.parse(event.playedAt) >= from.getTime() && Date.parse(event.playedAt) <= to.getTime()).length;
  }
};

export function clearAppCache(): void {
  localStorage.removeItem(storageKeys.searchHistory);
  localStorage.removeItem(storageKeys.recentActivity);
  localStorage.removeItem(storageKeys.queueSnapshots);
  localStorage.removeItem(storageKeys.recentTracks);
  localStorage.removeItem(storageKeys.playerVolume);
  localStorage.removeItem(storageKeys.playEvents);
  localStorage.removeItem("jellycat:songs:limitMode");
  localStorage.removeItem("jellycat:songs:sort");
  localStorage.removeItem("jellycat:playlist:sort");
}
