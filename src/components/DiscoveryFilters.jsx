import React, { useEffect, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import {
  MOODS,
  DECADES,
  COUNTRIES,
  DEFAULT_DISCOVERY,
} from "../../shared/discovery.js";
import { GENRE_MAP } from "../utils/genres";
import { searchPeople } from "../utils/api";

function PersonFilter({ label, value, onChange }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("");
  useEffect(() => {
    let live = true;
    setResults([]);
    if (value || query.trim().length < 2) {
      setStatus("");
      return;
    }
    setStatus("Searching…");
    const timer = setTimeout(() => {
      searchPeople(query.trim())
        .then((data) => {
          if (!live) return;
          setResults((data.results || []).slice(0, 8));
          setStatus(data.results?.length ? "" : "No people found.");
        })
        .catch(() => {
          if (live) setStatus("Search unavailable. Try again.");
        });
    }, 350);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, value]);
  return (
    <div className="min-w-0 space-y-2">
      <label className="account-label">
        {label}
        {value ? (
          <span className="flex items-center gap-2">
            <span>{value.name}</span>
            <button
              type="button"
              className="text-xs underline"
              onClick={() => {
                onChange(null);
                setQuery("");
              }}
            >
              Remove {label.toLowerCase()}
            </button>
          </span>
        ) : (
          <input
            className="account-input"
            value={query}
            placeholder={`Search ${label.toLowerCase()}…`}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
        )}
      </label>
      {status && (
        <p role="status" className="text-xs text-slate-500">
          {status}
        </p>
      )}
      {!!results.length && !value && (
        <ul className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-indigo-50 dark:hover:bg-slate-800"
                onClick={() => {
                  onChange({ id: p.id, name: p.name });
                  setResults([]);
                }}
              >
                {p.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
export default function DiscoveryFilters({ value, onChange }) {
  const set = (key, v) =>
    onChange({
      ...value,
      [key]: v,
      ...(key === "mood" ? { genre_ids: [] } : {}),
    });
  const count =
    value.genre_ids.length +
    ["mood", "decade", "country", "director", "actor", "max_runtime"].filter(
      (k) => value[k],
    ).length;
  const chip = (active) =>
    `rounded-full border px-3 py-1.5 text-sm ${active ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-200 dark:border-slate-700"}`;
  return (
    <details className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
      <summary className="cursor-pointer text-sm font-semibold">
        <SlidersHorizontal className="mr-2 inline h-4 w-4" />
        Filters {count ? `· ${count} active` : "· Mood, genre, decade & more"}
      </summary>
      <div className="mt-5 space-y-5">
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Mood</legend>
          <div className="flex flex-wrap gap-2">
            {MOODS.map((m) => (
              <button
                type="button"
                key={m.id}
                aria-pressed={value.mood === m.id}
                className={chip(value.mood === m.id)}
                onClick={() => set("mood", value.mood === m.id ? "" : m.id)}
              >
                {m.emoji} {m.label}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Genres</legend>
          <div className="flex flex-wrap gap-2">
            {Object.entries(GENRE_MAP).map(([id, name]) => (
              <button
                type="button"
                key={id}
                aria-pressed={value.genre_ids.includes(Number(id))}
                className={chip(value.genre_ids.includes(Number(id)))}
                onClick={() =>
                  onChange({
                    ...value,
                    mood: "",
                    genre_ids: value.genre_ids.includes(Number(id))
                      ? value.genre_ids.filter((g) => g !== Number(id))
                      : [...value.genre_ids, Number(id)],
                  })
                }
              >
                {name}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="account-label">
            Runtime
            <select
              className="account-input"
              value={value.max_runtime}
              onChange={(e) => set("max_runtime", e.target.value)}
            >
              <option value="">Any length</option>
              <option value="90">Up to 90 minutes</option>
              <option value="120">Up to 2 hours</option>
              <option value="150">Up to 2½ hours</option>
            </select>
          </label>
          <label className="account-label">
            Decade
            <select
              className="account-input"
              value={value.decade}
              onChange={(e) => set("decade", e.target.value)}
            >
              <option value="">Any decade</option>
              {DECADES.filter((d) => d.id !== "all").map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <label className="account-label">
            Country of origin
            <select
              className="account-input"
              value={value.country}
              onChange={(e) => set("country", e.target.value)}
            >
              <option value="">Any country</option>
              {COUNTRIES.filter((c) => c.code !== "any").map((c) => (
                <option key={c.code} value={c.code}>
                  {c.flag} {c.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <PersonFilter
            label="Director"
            value={value.director}
            onChange={(v) => set("director", v)}
          />
          <PersonFilter
            label="Actor"
            value={value.actor}
            onChange={(v) => set("actor", v)}
          />
        </div>
        {!!count && (
          <button
            type="button"
            className="text-sm text-indigo-600 underline"
            onClick={() => onChange(DEFAULT_DISCOVERY)}
          >
            Clear all filters
          </button>
        )}
      </div>
    </details>
  );
}
