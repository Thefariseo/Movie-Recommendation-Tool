// =====================================================
// Root component – providers + routes + cinematic intro
// =====================================================
import React, { useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import Navbar from "./components/Navbar";
import IntroScreen from "./components/IntroScreen";
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
  // Show intro on every page load / refresh
  const [showIntro, setShowIntro] = useState(true);

  const handleIntroDone = () => setShowIntro(false);

  return (
    <ToastProvider>
      <WatchedProvider>
        <WatchlistProvider>
          <ModalProvider>
            {/* Cinematic intro overlay — rendered above everything */}
            <AnimatePresence>
              {showIntro && <IntroScreen key="intro" onDone={handleIntroDone} />}
            </AnimatePresence>

            <div className="min-h-screen bg-[rgb(var(--color-bg))] text-[rgb(var(--color-fg))]">
              <Navbar />
              <Routes>
                <Route path="/"           element={<Home />} />
                <Route path="/watchlist"  element={<WatchlistPage />} />
                <Route path="/watched"    element={<WatchedPage />} />
                <Route path="/stats"      element={<StatsPage />} />
                <Route path="/friends"    element={<FriendsPage />} />
                <Route path="/profile"    element={<Profile />} />
                {/* 404 */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
              <Analytics />
              <SpeedInsights />
            </div>
          </ModalProvider>
        </WatchlistProvider>
      </WatchedProvider>
    </ToastProvider>
  );
}
