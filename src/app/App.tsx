import { lazy, Suspense, useEffect, useLayoutEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Navigate, Route, BrowserRouter as Router, Routes, useLocation } from "react-router-dom";
import { useAppStore } from "./appStore";
import { usePlayerStore } from "@core/player/audioService";
import { MiniPlayer } from "@shared/ui";
import { HomeView } from "@features/home/HomeView";
import { SearchView } from "@features/search/SearchView";
import {
  AlbumDetailView,
  AlbumsView,
  ArtistDetailView,
  ArtistsView,
  LibraryHomeView,
  PlaylistDetailView,
  PlaylistsView,
  SongsView
} from "@features/library";
import { LoginView } from "@features/settings/LoginView";
import { SettingsView } from "@features/settings/SettingsView";
import { AboutPage, ChangelogPage, CopyrightPage, CurrentlyOnPage, NoticesPage, PrivacyPage, TermsPage } from "@features/trust/TrustPages";
import { NowPlayingView } from "@features/player/NowPlayingView";
import { QueueView } from "@features/player/QueueView";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000
    }
  }
});

const Analytics = import.meta.env.VITE_ENABLE_ANALYTICS === "false"
  ? null
  : lazy(() => import("@vercel/analytics/react").then((module) => ({ default: module.Analytics })));

function RequireAuth({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAppStore((state) => state.isAuthenticated);
  const location = useLocation();
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
  }, []);

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [pathname]);

  return null;
}

function AnalyticsReporter() {
  const { pathname, search } = useLocation();
  if (!Analytics) return null;

  const path = `${pathname}${search}`;

  return (
    <Suspense fallback={null}>
      <Analytics path={path} route={pathname} />
    </Suspense>
  );
}

function RoutedApp() {
  const theme = useAppStore((state) => state.theme);
  const checkConnection = useAppStore((state) => state.checkConnection);
  const checkForUpdate = useAppStore((state) => state.checkForUpdate);
  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const volume = usePlayerStore((state) => state.volume);
  const togglePlayPause = usePlayerStore((state) => state.togglePlayPause);
  const setVolume = usePlayerStore((state) => state.setVolume);
  const location = useLocation();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    void checkConnection();
    const id = window.setInterval(() => void checkConnection(), 30_000);
    return () => window.clearInterval(id);
  }, [checkConnection]);

  useEffect(() => {
    void checkForUpdate();
    const id = window.setInterval(() => void checkForUpdate(), 30 * 60_000);
    return () => window.clearInterval(id);
  }, [checkForUpdate]);

  useEffect(() => {
    const handleKeyboardShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || target?.tagName === "INPUT" || target?.tagName === "SELECT" || target?.tagName === "TEXTAREA") return;

      if (event.code === "Space") {
        if (!currentTrack) return;
        event.preventDefault();
        void togglePlayPause();
      } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        if (!currentTrack) return;
        event.preventDefault();
        setVolume(volume + (event.key === "ArrowUp" ? 0.05 : -0.05));
      }
    };

    window.addEventListener("keydown", handleKeyboardShortcut);
    return () => window.removeEventListener("keydown", handleKeyboardShortcut);
  }, [currentTrack, setVolume, togglePlayPause, volume]);

  const isFullscreenRoute = location.pathname === "/queue" || location.pathname === "/now-playing";
  const pageTransitionClass = isFullscreenRoute ? "route-transition fullscreen-route-transition" : "route-transition";
  const showMiniPlayer = location.pathname !== "/now-playing";
  const appShellClass = `app-shell ${showMiniPlayer && currentTrack ? "has-mini-player" : ""}`;

  return (
    <Routes>
      <Route path="/login" element={<LoginView />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/currently-on" element={<CurrentlyOnPage />} />
      <Route path="/copyright" element={<CopyrightPage />} />
      <Route path="/notices" element={<NoticesPage />} />
      <Route path="/changelog" element={<ChangelogPage />} />
      <Route
        path="/*"
        element={
          <RequireAuth>
            <ScrollToTop />
            <div className={appShellClass}>
              <div key={location.pathname} className={pageTransitionClass}>
                <Routes>
                  <Route path="/" element={<Navigate to="/home" replace />} />
                  <Route path="/home" element={<HomeView />} />
                  <Route path="/search" element={<SearchView />} />
                  <Route path="/library" element={<LibraryHomeView />} />
                  <Route path="/library/songs" element={<SongsView />} />
                  <Route path="/library/albums" element={<AlbumsView />} />
                  <Route path="/library/albums/:albumId" element={<AlbumDetailView />} />
                  <Route path="/library/artists" element={<ArtistsView />} />
                  <Route path="/library/artists/:artistId" element={<ArtistDetailView />} />
                  <Route path="/library/playlists" element={<PlaylistsView />} />
                  <Route path="/library/playlists/:playlistId" element={<PlaylistDetailView />} />
                  <Route path="/settings" element={<SettingsView />} />
                  <Route path="/now-playing" element={<NowPlayingView />} />
                  <Route path="/queue" element={<QueueView />} />
                </Routes>
              </div>
              {showMiniPlayer ? <MiniPlayer /> : null}
            </div>
          </RequireAuth>
        }
      />
    </Routes>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <RoutedApp />
        <AnalyticsReporter />
      </Router>
    </QueryClientProvider>
  );
}
