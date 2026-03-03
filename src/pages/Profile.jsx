// =====================================================
// Profile – username, stats summary, theme toggle,
//           danger zone, link to full Stats page
// =====================================================
import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Sun, Moon, BarChart2 } from "lucide-react";
import useWatchlist from "../hooks/useWatchlist";
import useWatched from "@/hooks/useWatched";

export default function Profile() {
  const [username, setUsername] = useState(
    () => localStorage.getItem("username") || "Guest"
  );
  const { watchlist, clearWatchlist } = useWatchlist();
  const { watched, clearWatched } = useWatched();

  const [dark, setDark] = useState(
    () => document.documentElement.classList.contains("dark")
  );

  const toggleTheme = () => {
    const newTheme = !dark;
    setDark(newTheme);
    document.documentElement.classList.toggle("dark", newTheme);
  };

  const handleUsernameChange = (e) => {
    setUsername(e.target.value);
    localStorage.setItem("username", e.target.value);
  };

  const ratedCount = watched.filter((m) => m.rated).length;

  return (
    <main className="flex flex-col items-center gap-8 pb-24 pt-8">
      <section className="w-full max-w-xl rounded-xl bg-white p-6 shadow dark:bg-slate-800">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">
            Profile
          </h1>
          <button
            onClick={toggleTheme}
            className="rounded-full p-2 ring-1 ring-slate-300 dark:ring-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
            aria-label="Toggle Theme"
          >
            {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
        </div>

        {/* Username */}
        <div className="mb-6">
          <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
            Username
          </label>
          <input
            type="text"
            className="w-full rounded-md border border-slate-300 bg-transparent p-2 text-sm outline-none focus:ring-2 focus:ring-indigo-600 dark:border-slate-600 dark:text-slate-100 dark:focus:ring-indigo-400"
            value={username}
            onChange={handleUsernameChange}
          />
        </div>

        {/* Stats summary */}
        <div className="mb-2 grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-slate-50 p-3 text-center dark:bg-slate-700/50">
            <p className="text-xl font-bold text-slate-800 dark:text-slate-100">
              {watched.length}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Watched</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3 text-center dark:bg-slate-700/50">
            <p className="text-xl font-bold text-slate-800 dark:text-slate-100">
              {watchlist.length}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Watchlist</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3 text-center dark:bg-slate-700/50">
            <p className="text-xl font-bold text-slate-800 dark:text-slate-100">
              {ratedCount}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Rated</p>
          </div>
        </div>

        <Link
          to="/stats"
          className="mt-3 inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:underline dark:text-indigo-400"
        >
          <BarChart2 className="h-4 w-4" /> View detailed statistics →
        </Link>

        {/* Danger Zone */}
        <div className="mt-8 rounded-lg border border-red-300/60 bg-red-50 p-4 dark:border-red-700/40 dark:bg-red-900/20">
          <h2 className="mb-3 text-sm font-semibold text-red-700 dark:text-red-400">
            Danger Zone
          </h2>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={clearWatchlist}
              className="rounded-md bg-red-600 px-3 py-1 text-sm font-medium text-white hover:bg-red-500"
            >
              Clear Watchlist
            </button>
            <button
              onClick={clearWatched}
              className="rounded-md bg-red-600 px-3 py-1 text-sm font-medium text-white hover:bg-red-500"
            >
              Clear Watched
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
