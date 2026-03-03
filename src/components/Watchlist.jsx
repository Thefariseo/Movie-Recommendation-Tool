// =====================================================
// File: Watchlist.jsx
// Description: Grid of user's watchlisted movies with ability to remove.
// =====================================================
import React from "react";
import MovieCard from "./MovieCard";
import useWatchlist from "../hooks/useWatchlist";

export default function Watchlist() {
  const { watchlist } = useWatchlist();

  if (!watchlist.length) {
    return (
      <div className="flex h-96 flex-col items-center justify-center text-center">
        <p className="mb-4 text-lg font-medium text-slate-600 dark:text-slate-300">
          Your watchlist is empty. Start adding movies you like!
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 p-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
      {watchlist.map((movie) => (
        <MovieCard key={movie.id} movie={movie} />
      ))}
    </div>
  );
}