// =====================================================
// Root component – providers + routes + cinematic intro
// =====================================================
import React, { useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import Navbar from "./components/Navbar";
import LibraryLayout from "./components/LibraryLayout";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { LibraryProvider } from "./contexts/LibraryContext";
import ChatPage from "./pages/ChatPage";
import CriticPage from "./pages/CriticPage";
import TonightPage from "./pages/TonightPage";
import NightPage from "./pages/NightPage";
import AuthCallback from "./pages/AuthCallback";
import Home from "./pages/Home";
import WatchlistPage from "./pages/WatchlistPage";
import FriendsPage from "./pages/FriendsPage";
import Profile from "./pages/Profile";
import WatchedPage from "./pages/WatchedPage";
import StatsPage from "./pages/StatsPage";
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
  if (pathname === "/auth/callback") return <AuthCallback />;

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
