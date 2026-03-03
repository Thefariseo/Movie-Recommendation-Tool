// =====================================================
// File: WatchlistPage.jsx
// Description: Page dedicated to displaying the user's watchlist.
// =====================================================
import React from "react";
import Watchlist from "../components/Watchlist";

export default function WatchlistPage() {
  return (
    <main className="pb-16 pt-6">
      <div className="mx-auto max-w-7xl px-4">
        <h1 className="mb-4 text-3xl font-bold text-slate-800 dark:text-slate-100">My Watchlist</h1>
        <Watchlist />
      </div>
    </main>
  );
}
