// =====================================================
// File: src/hooks/useWatchlist.js
// Description: Thin wrapper around WatchlistContext.
// =====================================================

import { useContext } from "react";
import { WatchlistContext } from "@/contexts/WatchlistContext";

/**
 * Gives any component convenient access to the global
 * watchlist state and helper methods.
 *
 * @example
 *   const { watchlist, addToWatchlist } = useWatchlist();
 */
export default function useWatchlist() {
  const ctx = useContext(WatchlistContext);

  if (!ctx) {
    // Helps during development if the provider is missing.
    throw new Error("useWatchlist must be used inside <WatchlistProvider>");
  }

  return ctx;
}