import { afterEach, describe, expect, it } from "vitest";
import type { AuthSession } from "@domain/types";
import { authSessionStorage, preferenceStorage, profileStorage, storageKeys } from "./storage";

const session: AuthSession = {
  serverUrl: "https://jellyfin.example",
  userId: "user-1",
  username: "mar",
  accessToken: "token-1"
};

describe("authSessionStorage", () => {
  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("stores auth in sessionStorage by default", () => {
    authSessionStorage.save(session, "session");

    expect(sessionStorage.getItem(`${storageKeys.session}:session`)).toContain("token-1");
    expect(localStorage.getItem(storageKeys.session)).toBeNull();
    expect(authSessionStorage.load()).toEqual({ session, persistence: "session" });
  });

  it("stores auth in localStorage only for persistent login", () => {
    authSessionStorage.save(session, "persistent");

    expect(localStorage.getItem(storageKeys.session)).toContain("token-1");
    expect(sessionStorage.getItem(`${storageKeys.session}:session`)).toBeNull();
    expect(authSessionStorage.load()).toEqual({ session, persistence: "persistent" });
  });

  it("clears both session-only and persistent auth", () => {
    authSessionStorage.save(session, "persistent");
    authSessionStorage.save({ ...session, accessToken: "token-2" }, "session");
    authSessionStorage.clear();

    expect(localStorage.getItem(storageKeys.session)).toBeNull();
    expect(sessionStorage.getItem(`${storageKeys.session}:session`)).toBeNull();
    expect(authSessionStorage.load()).toBeNull();
  });
});

describe("preferenceStorage", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("enables local Jellyfin lyrics by default and persists changes", () => {
    expect(preferenceStorage.loadLocalJellyfinLyrics()).toBe(true);

    preferenceStorage.saveLocalJellyfinLyrics(false);

    expect(localStorage.getItem(storageKeys.localJellyfinLyrics)).toBe("false");
    expect(preferenceStorage.loadLocalJellyfinLyrics()).toBe(false);
  });

  it("persists player volume and clamps invalid values", () => {
    expect(preferenceStorage.loadPlayerVolume()).toBe(1);

    preferenceStorage.savePlayerVolume(0.42);
    expect(localStorage.getItem(storageKeys.playerVolume)).toBe("0.42");
    expect(preferenceStorage.loadPlayerVolume()).toBe(0.42);

    preferenceStorage.savePlayerVolume(2);
    expect(preferenceStorage.loadPlayerVolume()).toBe(1);

    localStorage.setItem(storageKeys.playerVolume, JSON.stringify("loud"));
    expect(preferenceStorage.loadPlayerVolume()).toBe(1);
  });
});

describe("profileStorage", () => {
  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("stores session profile tokens only in sessionStorage", () => {
    const profile = profileStorage.upsertSession(session, "session");

    expect(profile.persistence).toBe("session");
    expect(localStorage.getItem(storageKeys.profilePersistentTokens)).toBe("[]");
    expect(sessionStorage.getItem(storageKeys.profileSessionTokens)).toContain("token-1");
    expect(profileStorage.loadSession(profile.id)?.session).toEqual(session);
  });

  it("stores persistent profile tokens only after persistent opt-in", () => {
    const profile = profileStorage.upsertSession(session, "persistent");

    expect(profile.persistence).toBe("persistent");
    expect(localStorage.getItem(storageKeys.profilePersistentTokens)).toContain("token-1");
    expect(sessionStorage.getItem(storageKeys.profileSessionTokens)).toBe("[]");
    expect(profileStorage.loadSession(profile.id)?.persistence).toBe("persistent");
  });

  it("can save a profile placeholder without a token", () => {
    const profile = profileStorage.createPlaceholder("https://jellyfin.example/", "mar");

    expect(profile.persistence).toBe("none");
    expect(profile.serverUrl).toBe("https://jellyfin.example");
    expect(profileStorage.loadSession(profile.id)).toBeNull();
  });
});
