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
    <div className="stagger grid grid-cols-3 gap-x-3 gap-y-5 py-6 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
      {displayMovies.map((m) => (
        <WatchedCard key={m.id} movie={m} />
      ))}
    </div>
  );
}
