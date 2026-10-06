import React, { useEffect, useRef, useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import {
  MOODS,
  DECADES,
  COUNTRIES,
  DEFAULT_DISCOVERY,
} from "../../shared/discovery.js";
import { GENRE_MAP } from "../utils/genres";
import { searchPeople } from "../utils/api";

const RUNTIMES = [
  ["", "Any length"],
  ["90", "Up to 90 min"],
  ["120", "Up to 2 hours"],
  ["150", "Up to 2½ hours"],
];
const runtimeLabel = (v) => RUNTIMES.find(([k]) => k === String(v))?.[1];
const countryOf = (code) => COUNTRIES.find((c) => c.code === code);
const decadeOf = (id) => DECADES.find((d) => d.id === id);

const chip = (active) =>
  `inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${active ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-200 hover:border-slate-400 dark:border-slate-700"}`;

function PersonFilter({ label, value, onChange }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("");
  useEffect(() => {
    let live = true;
    setResults([]);
    if (value || query.trim().length < 2) {
      setStatus("");
      return undefined;
    }
    setStatus("Searching…");
    const timer = setTimeout(() => {
      searchPeople(query.trim())
        .then((data) => {
          if (!live) return;
          setResults((data.results || []).slice(0, 6));
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
      <p className="text-sm font-semibold">{label}</p>
      {value ? (
        <button type="button" className={chip(true)} onClick={() => { onChange(null); setQuery(""); }}>
          <span translate="no">{value.name}</span> <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      ) : (
        <input
          className="account-input !mt-0"
          value={query}
          placeholder={`Search ${label.toLowerCase()}…`}
          aria-label={`Search ${label.toLowerCase()}`}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />
      )}
      {status && <p role="status" className="text-xs text-slate-500">{status}</p>}
      {!!results.length && !value && (
        <ul className="flex flex-wrap gap-2">
          {results.map((p) => (
            <li key={p.id}>
              <button type="button" className={chip(false)} onClick={() => { onChange({ id: p.id, name: p.name }); setResults([]); }}>
                <span translate="no">{p.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Everything beyond the moods, in a sheet: changes apply when it closes. */
function FilterSheet({ value, onApply, onClose }) {
  const [draft, setDraft] = useState(value);
  const set = (key, v) => setDraft((d) => ({ ...d, [key]: v, ...(key === "mood" ? { genre_ids: [] } : {}) }));
  const toggleGenre = (id) => setDraft((d) => ({
    ...d,
    mood: "",
    genre_ids: d.genre_ids.includes(id) ? d.genre_ids.filter((g) => g !== id) : [...d.genre_ids, id],
  }));
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") close.current(); };
    const html = document.documentElement;
    const overflow = html.style.overflow;
    html.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); html.style.overflow = overflow; };
  }, []);
  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Filters" onClick={(e) => e.stopPropagation()}
        className="filter-sheet flex max-h-[88vh] w-full flex-col rounded-t-2xl bg-[rgb(var(--color-bg))] shadow-2xl sm:max-w-xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3 dark:border-slate-700">
          <p className="font-semibold">Filters</p>
          <button type="button" className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={onClose} aria-label="Close filters"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Genres</legend>
            <div className="flex flex-wrap gap-2">
              {Object.entries(GENRE_MAP).map(([id, name]) => (
                <button type="button" key={id} aria-pressed={draft.genre_ids.includes(Number(id))} className={chip(draft.genre_ids.includes(Number(id)))} onClick={() => toggleGenre(Number(id))}>{name}</button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Length</legend>
            <div className="flex flex-wrap gap-2">
              {RUNTIMES.map(([k, label]) => (
                <button type="button" key={k || "any"} aria-pressed={String(draft.max_runtime || "") === k} className={chip(String(draft.max_runtime || "") === k)} onClick={() => set("max_runtime", k)}>{label}</button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Decade</legend>
            <div className="snap-row -mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
              <button type="button" aria-pressed={!draft.decade} className={chip(!draft.decade)} onClick={() => set("decade", "")}>Any decade</button>
              {DECADES.filter((d) => d.id !== "all").map((d) => (
                <button type="button" key={d.id} aria-pressed={draft.decade === d.id} className={chip(draft.decade === d.id)} onClick={() => set("decade", d.id)}>{d.label}</button>
              ))}
            </div>
          </fieldset>
          <label className="account-label block">
            Country of origin
            <select className="account-input" value={draft.country} onChange={(e) => set("country", e.target.value)}>
              <option value="">Any country</option>
              {COUNTRIES.filter((c) => c.code !== "any").map((c) => <option key={c.code} value={c.code}>{c.flag} {c.label}</option>)}
            </select>
          </label>
          <div className="grid gap-5 sm:grid-cols-2">
            <PersonFilter label="Director" value={draft.director} onChange={(v) => set("director", v)} />
            <PersonFilter label="Actor" value={draft.actor} onChange={(v) => set("actor", v)} />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-3 dark:border-slate-700">
          <button type="button" className="text-sm text-slate-500 underline-offset-2 hover:underline" onClick={() => setDraft({ ...DEFAULT_DISCOVERY, mood: draft.mood })}>Clear</button>
          <button type="button" className="account-button" onClick={() => { onApply(draft); onClose(); }}>Show films</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Discovery filters: the moods one tap away in a row that scrolls on phones,
 * every active filter as a chip that removes it, and the rest in a sheet.
 */
export default function DiscoveryFilters({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const set = (key, v) => onChange({ ...value, [key]: v, ...(key === "mood" ? { genre_ids: [] } : {}) });
  const active = [
    ...value.genre_ids.map((id) => ({ key: `g${id}`, label: GENRE_MAP[id] || `#${id}`, clear: () => onChange({ ...value, genre_ids: value.genre_ids.filter((g) => g !== id) }) })),
    value.max_runtime && { key: "runtime", label: runtimeLabel(value.max_runtime), clear: () => set("max_runtime", "") },
    value.decade && { key: "decade", label: decadeOf(value.decade)?.label || value.decade, clear: () => set("decade", "") },
    value.country && { key: "country", label: `${countryOf(value.country)?.flag || ""} ${countryOf(value.country)?.label || value.country}`, clear: () => set("country", "") },
    value.director && { key: "director", label: value.director.name, person: true, clear: () => set("director", null) },
    value.actor && { key: "actor", label: value.actor.name, person: true, clear: () => set("actor", null) },
  ].filter(Boolean);
  return (
    <div className="space-y-2">
      <div className="snap-row -mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0" role="group" aria-label="Filters">
        <button type="button" className={chip(active.length > 0)} onClick={() => setOpen(true)}>
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" /> Filters{active.length ? ` · ${active.length}` : ""}
        </button>
        {active.map((f) => (
          <button type="button" key={f.key} className={chip(true)} onClick={f.clear} aria-label={`Remove ${f.label}`}>
            <span translate={f.person ? "no" : undefined}>{f.label}</span> <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ))}
        <span className="mx-1 h-6 w-px shrink-0 bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
        {MOODS.map((m) => (
          <button type="button" key={m.id} aria-pressed={value.mood === m.id} className={chip(value.mood === m.id)} onClick={() => set("mood", value.mood === m.id ? "" : m.id)} title={m.hint}>
            <span aria-hidden="true">{m.emoji}</span> {m.label}
          </button>
        ))}
      </div>
      {open && <FilterSheet value={value} onApply={onChange} onClose={() => setOpen(false)} />}
    </div>
  );
}
