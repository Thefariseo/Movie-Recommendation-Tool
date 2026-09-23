import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useLibrary } from "../contexts/LibraryContext";
import { backend } from "../utils/backend";
import DiscoveryFilters from "./DiscoveryFilters";
import { DEFAULT_DISCOVERY } from "../../shared/discovery.js";
import MovieCard from "./MovieCard";
import { useSignals } from "../utils/signals";
import { blocked } from "../../shared/signals.js";
export default function CommunityPicks() {
  const { user } = useAuth();
  const { watched, watchlist, ready } = useLibrary();
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [filters, setFilters] = useState(DEFAULT_DISCOVERY);
  const [recent, setRecent] = useState([]);
  const signals = useSignals(user?.id);
  const owner = useRef(user?.id);
  const libraryKey = JSON.stringify([
    watched.map((m) => [m.id, m.rated]),
    watchlist.map((m) => m.id),
  ]);
  useEffect(() => {
    if (owner.current !== user?.id) {
      owner.current = user?.id;
      setRecent([]);
    }
    if (!user || !ready) {
      setResult(null);
      return;
    }
    const controller = new AbortController();
    setResult(null);
    setError("");
    backend(
      "recommend",
      {
        constraints: {
          ...filters,
          director_id: filters.director?.id,
          actor_id: filters.actor?.id,
        },
        recent_ids: recent,
      },
      { signal: controller.signal },
    )
      .then((data) => {
        if (!controller.signal.aborted) setResult(data);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [user?.id, ready, libraryKey, revision, filters, recent]);
  if (!user) return null;
  // What is on screen: dismissed films leave at once.
  const shown = (result?.movies || []).filter((m) => !blocked(signals, m.id)).slice(0, 6);
  const refresh = () => {
    setRecent((prev) =>
      [
        ...new Set([
          ...prev,
          ...shown.map((m) => m.id),
        ]),
      ].slice(-100),
    );
    setRevision((n) => n + 1);
  };
  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Picked for you</h2>
        </div>
        <button
          className="account-secondary"
          onClick={refresh}
          disabled={!result && !error}
        >
          Other picks
        </button>
      </div>
      <DiscoveryFilters
        value={filters}
        onChange={(next) => {
          setFilters(next);
          setRecent([]);
        }}
      />
      {error ? (
        <p role="alert" className="text-sm text-slate-500">
          {error}
        </p>
      ) : !result ? (
        <p role="status" className="text-sm text-slate-500">
          Finding your next film…
        </p>
      ) : (
        <>
          <p className="text-sm text-slate-500">{result.message}</p>
          {!result.movies.length && (
            <p role="status">
              No matches for these preferences. Expand Filters to adjust your
              choices.
            </p>
          )}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {shown.map((m) => (
              <div key={m.id}>
                <MovieCard movie={m} dismissable />
                <p className="mt-2 text-xs text-slate-500">{m._reason}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
