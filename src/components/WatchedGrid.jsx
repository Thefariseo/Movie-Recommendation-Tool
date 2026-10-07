// =====================================================
// WatchedGrid – accepts optional filtered movies prop
// =====================================================
import React from "react";
import useWatched from "@/hooks/useWatched";
import useVirtualRows from "@/hooks/useVirtualRows";
import WatchedCard from "./WatchedCard";

// Columns per width, as in the grid's classes below (widest first).
const BREAKPOINTS = [[1280, 7], [1024, 6], [768, 5], [640, 4], [0, 3]];
// Past this many films only the rows on screen are drawn.
const VIRTUAL_FROM = 72;

/**
 * @param {Object[]} [movies] – pre-filtered list; falls back to full watched array
 */
export default function WatchedGrid({ movies }) {
  const { watched } = useWatched();
  const displayMovies = movies !== undefined ? movies : watched;
  const isFiltered = movies !== undefined;
  const long = displayMovies.length > VIRTUAL_FROM;
  const { container, start, end, before, after } = useVirtualRows({ count: displayMovies.length, breakpoints: BREAKPOINTS, gap: 20, offset: 24, enabled: long });

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
    // overflow-anchor: none, or the browser would move the page to keep a card
    // still each time the space above the drawn rows changes.
    <div ref={container} className="py-6" style={long ? { paddingTop: before + 24, paddingBottom: after + 24, overflowAnchor: "none" } : undefined}>
      <div className={`${long ? "" : "stagger "}grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7`}>
        {displayMovies.slice(start, end).map((m) => (
          <div key={m.id} data-virtual-row-item className="min-w-0">
            <WatchedCard movie={m} />
          </div>
        ))}
      </div>
    </div>
  );
}
