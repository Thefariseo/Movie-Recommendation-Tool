// =====================================================
// WatchedPage – catalogue with search, filter & sort
// =====================================================
import React, { useEffect, useMemo, useState } from "react";
import WatchedGrid from "../components/WatchedGrid";
import LetterboxdImport from "../components/LetterboxdImport";
import useWatched from "@/hooks/useWatched";
import { GENRE_MAP } from "@/utils/genres";
import { Link, useSearchParams } from "react-router-dom";
import { Search, Upload, Film } from "lucide-react";

export default function WatchedPage() {
  const { watched } = useWatched();
  const [params] = useSearchParams();
  const importing = params.get("import") === "1";
  const [showImport, setShowImport] = useState(importing);
  useEffect(() => {
    if (importing) setShowImport(true);
  }, [importing]);

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
    <main className="library-content">
      <div className="collection-heading">
        <div>
          <h2>Your film history</h2>
          <p>
            Rate what you’ve seen to make your recommendations more personal.
          </p>
        </div>
        <button
          className="account-secondary"
          aria-expanded={showImport}
          aria-controls="letterboxd-import"
          onClick={() => setShowImport((v) => !v)}
        >
          <Upload size={16} aria-hidden="true" />
          Import films
        </button>
      </div>
      {showImport && (
        <section id="letterboxd-import" className="mb-6">
          <LetterboxdImport />
        </section>
      )}

      {/* Filters row */}
      {watched.length > 0 && (
        <div className="mb-6 mt-4 flex flex-wrap gap-3">
          {/* Title search */}
          <div className="relative min-w-[180px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              aria-label="Search watched films"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search movies…"
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          {/* Genre filter */}
          <select
            aria-label="Filter watched films by genre"
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
            aria-label="Sort watched films"
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

      {watched.length ? (
        <>
          <p className="mb-4 text-sm text-slate-500">
            {filtered.length} of {watched.length} films
          </p>
          <WatchedGrid movies={filtered} />
        </>
      ) : (
        <div className="collection-empty">
          <Film size={32} aria-hidden="true" />
          <h3>Start your film story</h3>
          <p>
            Search for a film above and mark it as watched, or bring your
            ratings from Letterboxd.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/?view=browse" className="account-button">
              Find a film
            </Link>
            <button
              className="account-secondary"
              onClick={() => setShowImport(true)}
            >
              Import Letterboxd
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
