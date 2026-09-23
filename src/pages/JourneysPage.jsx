import React, { useEffect, useMemo, useState } from "react";
import { Check, Compass, Route } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import useWatched from "../hooks/useWatched";
import { useModal } from "../hooks/useModal";
import { loadTasteSpace } from "../utils/tasteSpace";
import { loadTasteMap } from "../utils/tasteMap";
import { movieDetails } from "../utils/api";
import { placeMember } from "../../shared/tasteSpace.js";
import { memberMap, planJourneys, regionLabel, territoryOverTime } from "../../shared/journeys.js";
import TasteMap from "../components/TasteMap";

const storageKey = (user) => `umbrify_journeys_v1:${user?.id || "guest"}`;
function readFollowed(user) {
  try { return JSON.parse(localStorage.getItem(storageKey(user)) || "[]"); } catch { return []; }
}
function saveFollowed(user, journeys) {
  try { localStorage.setItem(storageKey(user), JSON.stringify(journeys)); } catch { /* storage may be blocked */ }
}

function Journey({ journey, details, watchedIds, followed, onFollow, onDrop }) {
  const { open } = useModal();
  const done = journey.steps.filter((s) => watchedIds.has(s.id)).length;
  const last = details[journey.steps.at(-1).id];
  return (
    <article className="account-panel space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="eyebrow">{regionLabel(journey.region)}</p>
          <h3 className="text-lg font-semibold leading-snug">From “{journey.from.title}” to {last ? `“${last.title}”` : "somewhere new"}</h3>
          <p className="text-xs text-slate-500">{journey.steps.length} films, each a step further from what you know. {done > 0 && `${done} of ${journey.steps.length} watched.`}</p>
        </div>
        {followed ? <button className="account-secondary" onClick={onDrop}>Stop following</button> : <button className="account-button" onClick={onFollow}>Follow this journey</button>}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full bg-indigo-500 transition-all" style={{ width: `${(100 * done) / journey.steps.length}%` }} /></div>
      <ol className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {journey.steps.map((s, i) => {
          const d = details[s.id];
          const seen = watchedIds.has(s.id);
          return (
            <li key={s.id}>
              <button type="button" disabled={!d} onClick={() => d && open(d)} className="relative block w-full text-left">
                <img className={`aspect-[2/3] w-full rounded-md object-cover ${seen ? "opacity-60" : ""}`} alt="" src={d?.poster_path ? `https://image.tmdb.org/t/p/w185${d.poster_path}` : "/placeholder_poster.svg"} />
                <span className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900/80 text-[10px] font-bold text-white">{seen ? <Check className="h-3 w-3" /> : i + 1}</span>
                <span className="mt-1 block truncate text-[11px] leading-tight">{d?.title || "…"}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </article>
  );
}

// Journeys out of the member's comfort zone, and the map they are drawn on.
export default function JourneysPage() {
  const { user } = useAuth();
  const { watched } = useWatched();
  const [model, setModel] = useState(null);
  const [failed, setFailed] = useState(false);
  const [details, setDetails] = useState({});
  const [followed, setFollowed] = useState(() => readFollowed(user));
  useEffect(() => setFollowed(readFollowed(user)), [user?.id]);

  useEffect(() => {
    Promise.all([loadTasteSpace(), loadTasteMap()]).then(([space, atlas]) => (space && atlas ? setModel({ space, ...atlas }) : setFailed(true)));
  }, []);

  const view = useMemo(() => {
    if (!model) return null;
    const member = placeMember(model.space, watched, []);
    const followedIds = new Set(followed.flatMap((j) => j.steps.map((s) => s.id)));
    return {
      ...memberMap(model.space, model.map, watched),
      member,
      suggestions: planJourneys(model.space, model.map, model.regions, member, watched, { exclude: followedIds })
    };
  }, [model, watched, followed]);

  const shown = useMemo(() => [...followed, ...(view?.suggestions || [])], [followed, view]);
  useEffect(() => {
    const ids = [...new Set(shown.flatMap((j) => j.steps.map((s) => s.id)))].filter((id) => !details[id]);
    if (!ids.length) return;
    Promise.allSettled(ids.map((id) => movieDetails(id))).then((results) => {
      const next = {};
      results.forEach((r, i) => { if (r.status === "fulfilled") next[ids[i]] = r.value; });
      setDetails((d) => ({ ...d, ...next }));
    });
  }, [shown]);

  const watchedIds = useMemo(() => new Set(watched.map((m) => Number(m.id))), [watched]);
  const growth = useMemo(() => (view ? territoryOverTime(view.points) : []), [view]);
  const follow = (j) => { const next = [...followed, j]; setFollowed(next); saveFollowed(user, next); };
  const drop = (j) => { const next = followed.filter((f) => f.steps[0].id !== j.steps[0].id); setFollowed(next); saveFollowed(user, next); };

  if (failed) return <p className="text-sm text-slate-500">The taste map could not be loaded. Please try again later.</p>;
  if (!view) return <p className="text-sm text-slate-500">Drawing your taste map…</p>;

  return (
    <section className="space-y-6">
      <div className="account-panel space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="eyebrow flex items-center gap-1.5"><Compass className="h-3.5 w-3.5" /> YOUR TASTE MAP</p>
            <h2 className="text-xl font-semibold">You have explored {view.visited.size} of {model.regions.length} regions of cinema.</h2>
            <p className="text-xs text-slate-500">16,000 films, placed so that films loved by the same people sit together. Yours are in <span className="text-indigo-500">indigo</span> (loved) and <span className="text-rose-500">rose</span> (disliked).</p>
          </div>
          {growth.length > 1 && (
            <p className="text-xs text-slate-500">Regions over time: {growth.slice(-6).map((g) => `${g.month.slice(2)} · ${g.regions}`).join("  →  ")}</p>
          )}
        </div>
        <TasteMap map={model.map} landmarks={model.landmarks} points={view.points} centre={view.centre} journeys={shown} />
      </div>

      {!view.member ? (
        <p className="account-panel text-sm text-slate-500">Rate at least two films you loved (7/10 or more) and Umbrify will plot journeys out of your comfort zone.</p>
      ) : (
        <div className="space-y-4">
          <p className="eyebrow flex items-center gap-1.5"><Route className="h-3.5 w-3.5" /> JOURNEYS TO GROW YOUR TASTE</p>
          <p className="-mt-2 text-sm text-slate-500">Each journey starts next to a film you loved and ends in a region you have never visited, but that people with your taste love. Every step is the next film a little further along.</p>
          {followed.map((j) => <Journey key={`f${j.steps[0].id}`} journey={j} details={details} watchedIds={watchedIds} followed onDrop={() => drop(j)} />)}
          {view.suggestions.map((j) => <Journey key={`s${j.steps[0].id}`} journey={j} details={details} watchedIds={watchedIds} onFollow={() => follow(j)} />)}
          {!view.suggestions.length && !followed.length && <p className="text-sm text-slate-500">You have visited every region Umbrify can map. Impressive.</p>}
        </div>
      )}
    </section>
  );
}
