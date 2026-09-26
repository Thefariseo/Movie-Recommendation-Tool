import React, { useMemo, useState } from "react";
import useRecommend from "../hooks/useRecommend";
import DiscoveryFilters from "./DiscoveryFilters";
import PicksShowcase from "./PicksShowcase";
import { DEFAULT_DISCOVERY } from "../../shared/discovery.js";
// Guests use the same controls and layout, with their on-device library.
export default function ForYouSection() {
  const [filters, setFilters] = useState(DEFAULT_DISCOVERY);
  const prefs = useMemo(
    () => ({
      genres: filters.genre_ids,
      mood: filters.mood || undefined,
      era: filters.decade || undefined,
      country: filters.country || undefined,
      directorId: filters.director?.id,
      actorId: filters.actor?.id,
      maxRuntime: Number(filters.max_runtime) || null,
    }),
    [filters],
  );
  const {
    pick,
    list: rest,
    loading,
    error,
    refresh,
  } = useRecommend({ prefs, top: 6 });
  const list = pick ? [pick, ...rest] : [];
  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">Picked for you</h2>
        <button
          className="account-secondary"
          disabled={loading}
          onClick={refresh}
        >
          Other picks
        </button>
      </div>
      <DiscoveryFilters value={filters} onChange={setFilters} />
      <p className="text-sm text-slate-500">
        Based on your film tastes on this device.
      </p>
      {loading ? (
        <p role="status">Finding your next film…</p>
      ) : error ? (
        <p role="alert">Picks could not be loaded. Try again.</p>
      ) : !list.length ? (
        <p role="status">
          No matches for these preferences. Expand Filters to adjust your
          choices.
        </p>
      ) : (
        <PicksShowcase movies={list} />
      )}
    </section>
  );
}
