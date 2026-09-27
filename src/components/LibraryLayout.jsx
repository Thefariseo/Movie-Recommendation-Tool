import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import useWatched from "@/hooks/useWatched";
import useWatchlist from "@/hooks/useWatchlist";
export default function LibraryLayout() {
  const { watched } = useWatched(),
    { watchlist } = useWatchlist();
  return (
    <div className="library-layout">
      <div className="page-heading">
        <p className="eyebrow">YOUR FILM COLLECTION</p>
        <h1>Library</h1>
        <p>Keep your next watch and your film history in one place.</p>
      </div>
      <nav className="section-navigation" aria-label="Library sections">
        {[
          ["watchlist", "Watchlist", watchlist.length],
          ["watched", "Watched", watched.length],
          ["stats", "Stats", null],
          ["map", "Map", null],
          ["journeys", "Journeys", null],
        ].map(([path, label, count]) => (
          <NavLink
            key={path}
            to={`/library/${path}`}
            className={({ isActive }) => (isActive ? "section-selected" : "")}
          >
            {label}
            {count !== null && <span className="section-count">{count}</span>}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
