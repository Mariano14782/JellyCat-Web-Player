import type React from "react";
import { Link } from "react-router-dom";
import { useAppStore } from "@app/appStore";
import { CheckerStrip, Divider, JLinkButton, Section, icons } from "@shared/ui";

function TrustShell({ title, children }: { title: string; children: React.ReactNode }) {
  const isAuthenticated = useAppStore((state) => state.isAuthenticated);

  return (
    <main className="screen trust-screen">
      <div className="topbar">
        <Link className="text-link" to={isAuthenticated ? "/home" : "/login"}>JELLYCAT</Link>
        <span className="spacer" />
        <nav className="trust-nav" aria-label="Trust pages">
          <Link to="/about">ABOUT</Link>
          <Link to="/privacy">PRIVACY</Link>
          <Link to="/terms">TERMS</Link>
          <Link to="/currently-on">CURRENTLY ON</Link>
          <Link to="/copyright">COPYRIGHT</Link>
          <Link to="/notices">NOTICES</Link>
          <Link to="/changelog">CHANGELOG</Link>
        </nav>
      </div>
      <CheckerStrip />
      <section className="trust-panel">
        <h1>{title}</h1>
        {children}
      </section>
      <Divider />
    </main>
  );
}

export function AboutPage() {
  return (
    <TrustShell title="ABOUT JELLYCAT">
      <Section title="PROJECT" />
      <p>JellyCat is a static web music client for Jellyfin servers controlled by the user. It does not provide, host, index, or distribute music or media.</p>
      <p>The web app connects directly from your browser to your Jellyfin server and uses LRCLIB for optional lyrics lookup.</p>
      <Section title="DONATIONS" />
      <p>JellyCat is free. Donations are optional and support development.</p>
      <p>Donations do not grant features, access, priority, support guarantees, or any other benefit.</p>
      <JLinkButton href="https://ko-fi.com/mar_" target="_blank" rel="noopener noreferrer" accent icon={icons.externalLink} className="trust-action">KO-FI</JLinkButton>
    </TrustShell>
  );
}

export function PrivacyPage() {
  return (
    <TrustShell title="PRIVACY POLICY">
      <p>JellyCat is a static browser client. It does not run a JellyCat backend, host your media, or collect your Jellyfin server credentials or library contents.</p>
      <Section title="JELLYFIN" />
      <p>Your browser sends your server URL, username/password during login, access token, library requests, artwork requests, audio streams, playlist actions, favorite changes, delete actions, and playback reports directly to your Jellyfin server.</p>
      <Section title="BROWSER STORAGE" />
      <p>JellyCat stores visual preferences, search history, recent activity, sorting preferences, and a Jellyfin device ID in this browser. Login is session-only by default.</p>
      <p>If you choose “Remember this browser,” JellyCat stores your Jellyfin access token on this device until you disconnect or clear site data.</p>
      <Section title="LYRICS" />
      <p>When lyrics are opened, JellyCat requests lyrics from the server or fallbacks to LRCLIB using artist name, album name, track title, and duration.</p>
      <Section title="ANALYTICS" />
      <p>The hosted online version may use Vercel Analytics for anonymous route-level usage measurement. Self-hosted Docker builds disable analytics.</p>
    </TrustShell>
  );
}

export function TermsPage() {
  return (
    <TrustShell title="TERMS OF USE">
      <p>Use JellyCat with media libraries and Jellyfin servers you control or have permission to access.</p>
      <p>JellyCat does not provide media content. Availability depends on your Jellyfin server, network, browser, and host policies.</p>
      <p>JellyCat is provided as-is, without warranties or guarantees of uninterrupted service, compatibility, or support.</p>
    </TrustShell>
  );
}

export function CopyrightPage() {
  return (
    <TrustShell title="COPYRIGHT DISCLAIMER">
      <p>JellyCat does not host, distribute, or provide music or other media content.</p>
      <p>JellyCat is a client for connecting to Jellyfin servers controlled by the user. Users are responsible for ensuring they have the rights to access and play content in their own media libraries.</p>
    </TrustShell>
  );
}

export function NoticesPage() {
  return (
    <TrustShell title="OPEN SOURCE NOTICES">
      <p>JellyCat uses open source dependencies including React, React DOM, React Router, TanStack Query, Zustand, Lucide React, Vite, TypeScript, Vitest, Playwright, Testing Library, and the Jellyfin TypeScript SDK.</p>
      <p>Direct runtime dependency licenses include MIT, ISC, and MPL-2.0. Build and test tooling include MIT, Apache-2.0, and compatible licenses.</p>
    </TrustShell>
  );
}

export function CurrentlyOnPage() {
  return (
    <TrustShell title="CURRENTLY ON">
      <p>This page tracks the work currently being considered for JellyCat. Items here are plans and priorities, not guaranteed release dates or support commitments.</p>
      <Section title="WEB SPA" />
      <p>Polish the public web client, verify production hosting behavior, and keep browser playback, queue, search, and library flows working smoothly.</p>
      <Section title="WEB HOSTING" />
      <p>Polish and test the docker image to run JellyCat locally best way possible.</p>
      <Section title="PORTS" />
      <p>As the native ios app seems to be ready, I´m focusing on the next port that uses the same arquitecture, macOS. As Apple only allows to publish with a paid developer account, I´ll leave them ready and continue with the android and windows ports.</p>
    </TrustShell>
  );
}

export function ChangelogPage() {
  return (
    <TrustShell title="CHANGELOG">
      <Section title="1.3.0" />
      <p>- Redesigned the queue view with larger artwork, drag-and-drop reordering, improved actions, and inline removal controls.</p>
      <p>- Added persistent volume settings, mini-player volume controls, animated volume panels, and keyboard shortcuts for playback and volume.</p>
      <p>- Added monthly play counts and a weekly top 20 Smart Mix based on local playback history.</p>
      <Section title="1.1.0" />
      <p>- Added a playback status indicator in the player UI.</p>
      <p>- Fixed a bug where progress bar on the mini player didn´t change the song timestamp.</p>
      <p>- Changed the icon for active favorite tracks.</p>
      <p>- Changed icons in the UI.</p>
      <p>- Added links in the full player to artist/album pages.</p>
      <p>- Added a small UI element to indicate when a new version is available.</p>
      <Section title="1.0.1" />
      <p>- Finished docker workflow and fixed crypto.randomUUID fallback for Safari.</p>
      <Section title="0.3.0" />
      <p>- Implemented docker image, github actions to build and push to docker hub, implemented button to limit playlist items shown and implementation for local lyrics from Jellyfin.</p>
      <Section title="0.2.0" />
      <p>- Ui polishing, optimized queries, jellyfin compatibility improvements, changes and polish of some layouts.</p>
      <Section title="0.1.0" />
      <p>- Initial static web SPA readiness pass for Jellyfin music browsing, playback, lyrics, playlist tools, trust pages, explicit persistent login, and future Vercel hosting configuration.</p>
    </TrustShell>
  );
}
