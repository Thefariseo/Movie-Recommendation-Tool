// =====================================================
// Root component – providers + routes + cinematic intro
// =====================================================
import React, { lazy, Suspense, useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import Navbar from "./components/Navbar";
import LibraryLayout from "./components/LibraryLayout";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { LibraryProvider } from "./contexts/LibraryContext";
import Home from "./pages/Home";
import Spinner from "./components/Spinner";

// Discover ships with the app; every other page loads when it is first opened.
const ChatPage = lazy(() => import("./pages/ChatPage"));
const CriticPage = lazy(() => import("./pages/CriticPage"));
const TonightPage = lazy(() => import("./pages/TonightPage"));
const NightPage = lazy(() => import("./pages/NightPage"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const WatchlistPage = lazy(() => import("./pages/WatchlistPage"));
const FriendsPage = lazy(() => import("./pages/FriendsPage"));
const Profile = lazy(() => import("./pages/Profile"));
const WatchedPage = lazy(() => import("./pages/WatchedPage"));
const StatsPage = lazy(() => import("./pages/StatsPage"));
const JourneysPage = lazy(() => import("./pages/JourneysPage"));

import { WatchlistProvider } from "@/contexts/WatchlistContext";
import { WatchedProvider } from "@/hooks/useWatched";
import { ModalProvider } from "@/hooks/useModal";
import { ToastProvider } from "@/contexts/ToastContext";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";

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
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname]);

  // Keep the email callback outside the account-keyed tree and analytics.
  if (pathname === "/auth/callback") return <Suspense fallback={null}><AuthCallback /></Suspense>;

  return (
    <ToastProvider>
      <LibraryProvider key={loading ? "loading" : user?.id || "guest"}>
        <WatchedProvider>
          <WatchlistProvider>
            <ModalProvider>
              <MotionConfig reducedMotion="user">
                <div className="min-h-screen bg-[rgb(var(--color-bg))] text-[rgb(var(--color-fg))]">
                  <Navbar />
                  <div id="page-content" tabIndex={-1}>
                    <Suspense fallback={<div className="flex justify-center py-16"><Spinner /></div>}>
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
                        <Route path="journeys" element={<JourneysPage />} />
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
                      <Route path="/chat" element={<ChatPage />} />
                      <Route path="/critic" element={<CriticPage />} />
                      <Route path="/tonight" element={<TonightPage />} />
                      <Route path="/tonight/:id" element={<NightPage />} />
                      <Route path="/auth/callback" element={<AuthCallback />} />
                      <Route path="/profile" element={<Profile />} />
                      {/* 404 */}
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                    </Suspense>
                  </div>
                  {/* Plain anchors, not router Links: these pages are static HTML outside
                  the app, so the router must not claim them and redirect home. */}
                  <footer className="mx-auto max-w-5xl px-4 pb-28 pt-8 md:pb-10 text-sm text-[rgb(var(--color-fg-muted))]">
                    <a className="hover:underline" href="/privacy">
                      Privacy
                    </a>
                    <span aria-hidden="true"> · </span>
                    <a className="hover:underline" href="/terms">
                      Terms
                    </a>
                  </footer>
                  <Analytics />
                  <SpeedInsights />
                </div>
              </MotionConfig>
            </ModalProvider>
          </WatchlistProvider>
        </WatchedProvider>
      </LibraryProvider>
    </ToastProvider>
  );
}
