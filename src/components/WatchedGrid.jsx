// =====================================================
// WatchedGrid – accepts optional filtered movies prop
// =====================================================
import React from "react";
import useWatched from "@/hooks/useWatched";
import WatchedCard from "./WatchedCard";

/**
 * @param {Object[]} [movies] – pre-filtered list; falls back to full watched array
 */
export default function WatchedGrid({ movies }) {
  const { watched } = useWatched();
  const displayMovies = movies !== undefined ? movies : watched;
  const isFiltered = movies !== undefined;

  if (!displayMovies.length) {
    return (
      <p className="py-12 text-center text-slate-600 dark:text-slate-300">
        {isFiltered
          ? "No movies match your filters."
          : "Your watched catalogue is empty — import a CSV or add manually!"}
      </p>
    );
  }

  return (
    <div className="grid gap-4 py-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
      {displayMovies.map((m) => (
        <WatchedCard key={m.id} movie={m} />
      ))}
    </div>
  );
}
