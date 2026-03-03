// =====================================================
// WatchedPage – catalogue with search, filter & sort
// =====================================================
import React, { useMemo, useState } from "react";
import WatchedGrid from "../components/WatchedGrid";
import LetterboxdImport from "../components/LetterboxdImport";
import useWatched from "@/hooks/useWatched";
import { GENRE_MAP } from "@/utils/genres";
import { Search } from "lucide-react";

export default function WatchedPage() {
  const { watched } = useWatched();

  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("added-desc");
  const [genreFilter, setGenreFilter] = useState("all");

  /* Collect unique genres present in the catalogue */
  const genreOptions = useMemo(() => {
    const ids = new Set();
    watched.forEach((m) => m.genres?.forEach((g) => ids.add(g)));
    return [...ids]
      .map((id) => ({ id, name: GENRE_MAP[id] || String(id) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [watched]);

  /* Filtered + sorted movies */
  const filtered = useMemo(() => {
    let arr = [...watched];

    if (query.trim()) {
      const q = query.toLowerCase();
      arr = arr.filter((m) => m.title.toLowerCase().includes(q));
    }

    if (genreFilter !== "all") {
      const gId = Number(genreFilter);
      arr = arr.filter((m) => m.genres?.includes(gId));
    }

    switch (sortBy) {
      case "title-asc":
        arr.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "title-desc":
        arr.sort((a, b) => b.title.localeCompare(a.title));
        break;
      case "year-asc":
        arr.sort((a, b) => (a.year || 0) - (b.year || 0));
        break;
      case "year-desc":
        arr.sort((a, b) => (b.year || 0) - (a.year || 0));
        break;
      case "rating-desc":
        arr.sort((a, b) => (b.rated || 0) - (a.rated || 0));
        break;
      case "rating-asc":
        arr.sort((a, b) => (a.rated || 0) - (b.rated || 0));
        break;
      case "added-asc":
        /* original insertion order – no-op */
        break;
      case "added-desc":
      default:
        arr.reverse();
        break;
    }

    return arr;
  }, [watched, query, sortBy, genreFilter]);

  return (
    <main className="mx-auto max-w-7xl px-4 pb-16 pt-6">
      <h1 className="mb-6 text-3xl font-bold text-slate-800 dark:text-slate-100">
        My Watched Movies
        <span className="ml-3 text-lg font-normal text-slate-400">
          ({watched.length})
        </span>
      </h1>

      <LetterboxdImport />

      {/* Filters row */}
      {watched.length > 0 && (
        <div className="mb-6 mt-4 flex flex-wrap gap-3">
          {/* Title search */}
          <div className="relative min-w-[180px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search movies…"
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          {/* Genre filter */}
          <select
            value={genreFilter}
            onChange={(e) => setGenreFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="all">All Genres</option>
            {genreOptions.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="added-desc">Recently Added</option>
            <option value="added-asc">Oldest Added</option>
            <option value="title-asc">Title A → Z</option>
            <option value="title-desc">Title Z → A</option>
            <option value="year-desc">Newest Films</option>
            <option value="year-asc">Oldest Films</option>
            <option value="rating-desc">Highest Rated</option>
            <option value="rating-asc">Lowest Rated</option>
          </select>
        </div>
      )}

      <WatchedGrid movies={watched.length > 0 ? filtered : undefined} />
    </main>
  );
}
