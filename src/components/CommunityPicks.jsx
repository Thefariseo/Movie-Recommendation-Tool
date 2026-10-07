import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useLibrary } from "../contexts/LibraryContext";
import { backend } from "../utils/backend";
import DiscoveryFilters from "./DiscoveryFilters";
import { DEFAULT_DISCOVERY } from "../../shared/discovery.js";
import PicksShowcase, { PicksSkeleton } from "./PicksShowcase";
import { useSignals } from "../utils/signals";
import { blocked } from "../../shared/signals.js";
import { hasSeeds } from "../../shared/onboarding.js";
export default function CommunityPicks() {
  const { user } = useAuth();
  const { watched, watchlist, ready } = useLibrary();
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [filters, setFilters] = useState(DEFAULT_DISCOVERY);
  const [recent, setRecent] = useState([]);
  const signals = useSignals(user?.id);
  // Picks are asked for again once a newcomer's first choices are in.
  const seeded = hasSeeds(signals);
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
  }, [user?.id, ready, libraryKey, revision, filters, recent, seeded]);
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
          <h2 className="section-title">Picked for you</h2>
        </div>
        <button
          className="account-secondary"
          onClick={refresh}
          data-track="other_picks"
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
        <PicksSkeleton />
      ) : (
        <>
          <p className="text-sm text-slate-500">{result.message}</p>
          {!result.movies?.length && (
            <p role="status">
              No matches for these preferences. Expand Filters to adjust your
              choices.
            </p>
          )}
          <PicksShowcase movies={shown} />
        </>
      )}
    </section>
  );
}
