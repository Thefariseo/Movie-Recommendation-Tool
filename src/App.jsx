// =====================================================
// Root component – providers + routes + cinematic intro
// =====================================================
import React, { Suspense, useEffect, useState } from "react";
import { lazyPage, preloadPagesWhenIdle } from "./utils/lazyPage";
import LanguagePicker from "./components/LanguagePicker";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { LazyMotion, MotionConfig } from "framer-motion";
import Navbar from "./components/Navbar";
import LibraryLayout from "./components/LibraryLayout";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { LibraryProvider } from "./contexts/LibraryContext";
import Home from "./pages/Home";
import TopProgress, { PageLoading } from "./components/TopProgress";
import useSmoothNavigation from "./hooks/useSmoothNavigation";
import { fadeInImages, installTapFeedback } from "./utils/motion";
import { installFilmPrefetch } from "./utils/prefetch";

// Discover ships with the app; every other page loads when it is first opened.
const ChatPage = lazyPage(() => import("./pages/ChatPage"));
const CriticPage = lazyPage(() => import("./pages/CriticPage"), "/critic");
const TonightPage = lazyPage(() => import("./pages/TonightPage"), "/tonight");
const NightPage = lazyPage(() => import("./pages/NightPage"));
const SeasonPage = lazyPage(() => import("./pages/SeasonPage"));
const FriendProfilePage = lazyPage(() => import("./pages/FriendProfilePage"));
const PersonPage = lazyPage(() => import("./pages/PersonPage"));
const ListPage = lazyPage(() => import("./pages/ListPage"));
const ListsPage = lazyPage(() => import("./pages/ListsPage"));
const AuthCallback = lazyPage(() => import("./pages/AuthCallback"));
const WatchlistPage = lazyPage(() => import("./pages/WatchlistPage"), "/library");
const FriendsPage = lazyPage(() => import("./pages/FriendsPage"), "/friends");
const Profile = lazyPage(() => import("./pages/Profile"), "/profile");
const WatchedPage = lazyPage(() => import("./pages/WatchedPage"));
const StatsPage = lazyPage(() => import("./pages/StatsPage"));
const JourneysPage = lazyPage(() => import("./pages/JourneysPage"));
const MapPage = lazyPage(() => import("./pages/MapPage"));

import { WatchlistProvider } from "@/contexts/WatchlistContext";
import { WatchedProvider } from "@/hooks/useWatched";
import { ModalProvider } from "@/hooks/useModal";
import { ToastProvider } from "@/contexts/ToastContext";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";

const loadMotionFeatures = () => import("./utils/motionFeatures").then((m) => m.default);

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

function AppContent() {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();
  useSmoothNavigation();
  useEffect(() => { preloadPagesWhenIdle(); }, []);
  useEffect(() => fadeInImages(), []);
  useEffect(() => installTapFeedback(), []);
  useEffect(() => installFilmPrefetch(), []);
  // Pages wait for the account to be known: rendered as a guest first, they
  // were thrown away and rebuilt a moment later (a flash, and their films
  // fetched twice). A slow answer does not hold the page for long.
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setWaited(true), 2500);
    return () => clearTimeout(timer);
  }, []);
  const pagesReady = !loading || waited;

  // Keep the email callback outside the account-keyed tree and analytics.
  if (pathname === "/auth/callback") return <Suspense fallback={null}><AuthCallback /></Suspense>;

  // Animations load their light core only; the modal and toasts, which sit
  // outside the page, honour the member's reduced-motion setting too.
  return (
    <LazyMotion features={loadMotionFeatures} strict><MotionConfig reducedMotion="user">
    <ToastProvider>
      <LibraryProvider key={user?.id || "guest"}>
        <WatchedProvider>
          <WatchlistProvider>
            <ModalProvider>
                              <div className="min-h-screen bg-[rgb(var(--color-bg))] text-[rgb(var(--color-fg))]">
                  <TopProgress />
                  <Navbar />
                  <div id="page-content" tabIndex={-1}>
                    {!pagesReady ? <PageLoading /> : (
                    <Suspense fallback={<PageLoading />}>
                    <Routes>
                      <Route path="/" element={<Home />} />
                      <Route path="/library" element={<LibraryLayout />}>
                        <Route
                          index
                          element={<Navigate to="watchlist" replace />}
                        />
                        <Route path="watchlist" element={<WatchlistPage />} />
                        <Route path="watched" element={<WatchedPage />} />
                        <Route path="stats" element={<StatsPage />} />
                        <Route path="map" element={<MapPage />} />
                        <Route path="journeys" element={<JourneysPage />} />
                        <Route path="lists" element={<ListsPage />} />
                      </Route>
                      <Route
                        path="/watchlist"
                        element={<Navigate to="/library/watchlist" replace />}
                      />
                      <Route
                        path="/watched"
                        element={<Navigate to="/library/watched" replace />}
                      />
                      <Route
                        path="/stats"
                        element={<Navigate to="/library/stats" replace />}
                      />
                      <Route path="/friends" element={<FriendsPage />} />
                      <Route path="/friends/:id" element={<FriendProfilePage />} />
                      <Route path="/person/:id" element={<PersonPage />} />
                      <Route path="/list/:id" element={<ListPage />} />
                      <Route path="/chat" element={<ChatPage />} />
                      <Route path="/critic" element={<CriticPage />} />
                      <Route path="/tonight" element={<TonightPage />} />
                      <Route path="/tonight/:id" element={<NightPage />} />
                      <Route path="/season/:id" element={<SeasonPage />} />
                      <Route path="/auth/callback" element={<AuthCallback />} />
                      <Route path="/profile" element={<Profile />} />
                      {/* 404 */}
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                    </Suspense>
                    )}
                  </div>
                  {/* Plain anchors, not router Links: these pages are static HTML outside
                  the app, so the router must not claim them and redirect home. */}
                  {pagesReady && <footer className="mx-auto max-w-[var(--app-width)] px-4 pb-28 pt-8 text-sm text-[rgb(var(--color-fg-muted))] sm:px-8 md:pb-10">
                    <a className="hover:underline" href="/privacy">
                      Privacy
                    </a>
                    <span aria-hidden="true"> · </span>
                    <a className="hover:underline" href="/terms">
                      Terms
                    </a>
                    <span aria-hidden="true"> · </span>
                    <LanguagePicker />
                  </footer>}
                  <Analytics />
                  <SpeedInsights />
                </div>
                          </ModalProvider>
          </WatchlistProvider>
        </WatchedProvider>
      </LibraryProvider>
    </ToastProvider>
    </MotionConfig></LazyMotion>
  );
}
