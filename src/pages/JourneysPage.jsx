import React, { useEffect, useMemo, useState } from "react";
import { Check, Clapperboard, Compass, Flag, Info, ListPlus, MapPin, RefreshCw, Route, Search, Shuffle, X } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import useWatched from "../hooks/useWatched";
import useWatchlist from "../hooks/useWatchlist";
import { useModal } from "../hooks/useModal";
import { loadTasteSpace } from "../utils/tasteSpace";
import { loadTasteMap } from "../utils/tasteMap";
import { useFollowedJourneys } from "../utils/journeys";
import { movieDetails, personMovieCredits, searchPeople } from "../utils/api";
import { directorContext, directorsToDiscover, lovedDirectors } from "../utils/directors";
import { placeMember, becauseOf } from "../../shared/tasteSpace.js";
import { memberMap, planJourney, planJourneys, regionAt, regionLabel, regionName, regionScores, journeyProgress, reroute, territoryOverTime, directorJourney, bridgeJourney } from "../../shared/journeys.js";
import TasteMap from "../components/TasteMap";

const LENGTHS = [
  { steps: 4, label: "Short", hint: "4 films" },
  { steps: 6, label: "Classic", hint: "6 films" },
  { steps: 8, label: "Long", hint: "8 films" }
];
const poster = (d) => (d?.poster_path ? `https://image.tmdb.org/t/p/w185${d.poster_path}` : "/placeholder_poster.svg");
const homeOf = (region) => (region?.landmarks || []).slice(0, 3).map((l) => l.title);

function Poster({ id, details, badge, dim, ring, caption, note }) {
  const { open } = useModal();
  const d = details[id];
  return (
    <button type="button" disabled={!d} onClick={() => d && open(d)} className="relative block w-full text-left">
      <img style={{ aspectRatio: "2 / 3" }} className={`w-full rounded-md object-cover ${dim ? "opacity-60" : ""} ${ring ? "ring-2 ring-indigo-500 ring-offset-2 ring-offset-white dark:ring-offset-slate-900" : ""}`} alt="" src={poster(d)} />
      {badge}
      <span className="mt-1 block truncate text-[11px] font-medium leading-tight">{d?.title || "…"}</span>
      {caption && <span className="block truncate text-[10px] leading-tight text-slate-500">{caption}</span>}
      {note && <span className="block text-[10px] leading-tight text-indigo-600 dark:text-indigo-300 line-clamp-2">{note}</span>}
    </button>
  );
}

function Journey({ journey, region, details, watched, why, followed, onFollow, onDrop, onWatchlist, notice }) {
  const progress = journeyProgress(journey, watched);
  const last = details[journey.steps.at(-1).id];
  const disliked = journey.rerouted && (details[journey.rerouted.after]?.title || "a film you disliked");
  // What the card says, by kind of journey.
  const n = journey.steps.length;
  const text = journey.kind === "director" ? {
    eyebrow: `Director journey · ${journey.person.name}`,
    title: `Through ${journey.person.name}'s films`,
    about: `${n} films, from the one closest to your taste to the deep cuts.`,
    arrived: `You have been through ${journey.person.name}'s films. Pick another director to keep going.`,
  } : journey.kind === "friend" ? {
    eyebrow: `Guided by ${journey.person.name} · ${regionLabel(journey.region)}`,
    title: `${journey.person.name}'s way into ${regionLabel(journey.region)}`,
    about: `${n} films ${journey.person.name} loved, from the one closest to your taste to their favourite.`,
    arrived: `You have seen ${journey.person.name}'s favourites here. Time to compare notes.`,
  } : journey.kind === "bridge" ? {
    eyebrow: "From one director to another",
    title: `From ${journey.person.name} to ${journey.to.name}`,
    about: `${n} films, from ${journey.person.name}'s world to ${journey.to.name}'s, each a step closer.`,
    arrived: `You made it to ${journey.to.name}. Their films are yours to explore now.`,
  } : {
    eyebrow: `${regionLabel(journey.region)}${homeOf(region).length ? ` · home of ${homeOf(region).slice(0, 2).join(", ")}` : ""}`,
    title: `From “${journey.from.title}” to ${last ? `“${last.title}”` : "somewhere new"}`,
    about: `${n} films, each a step further from what you know.`,
    arrived: `You made it: ${regionLabel(journey.region)} is part of your map now. Pick another region to keep exploring.`,
  };
  return (
    <article className="account-panel space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="eyebrow">{text.eyebrow}</p>
          <h3 className="text-lg font-semibold leading-snug">{text.title}</h3>
          <p className="text-xs text-slate-500">
            {text.about}
            {progress.done > 0 && ` ${progress.done} of ${journey.steps.length} watched.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!progress.arrived && <button className="account-secondary inline-flex items-center gap-1.5" onClick={onWatchlist} title="Add the films still ahead to your watchlist"><ListPlus className="h-4 w-4" /> Watchlist</button>}
          {followed
            ? <button className="account-secondary inline-flex items-center gap-1.5" onClick={onDrop}><X className="h-4 w-4" /> Stop following</button>
            : <button className="account-button" onClick={onFollow}>Follow this journey</button>}
        </div>
      </div>
      {journey.explain && (
        <details className="group rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/50" open={!followed}>
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
            <Info className="h-3.5 w-3.5" /> Why this journey
          </summary>
          <div className="mt-2 space-y-2">
            {journey.explain.start && (
              <p className="text-slate-700 dark:text-slate-200"><span className="font-medium">{journey.kind === "director" || journey.kind === "friend" ? `Why start with “${details[journey.steps[0].id]?.title || journey.from.title}”` : `Why set off from “${journey.from.title}”`}: </span>{journey.explain.start}</p>
            )}
            {journey.explain.why?.length > 0 && (
              <ul className="space-y-1 text-slate-600 dark:text-slate-300">
                {journey.explain.why.map((w, n) => (
                  <li key={n} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-indigo-500" aria-hidden="true" />{w}</li>
                ))}
              </ul>
            )}
          </div>
        </details>
      )}
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full bg-indigo-500 transition-all" style={{ width: `${(100 * progress.done) / journey.steps.length}%` }} /></div>
      {progress.arrived && (
        <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"><Flag className="h-4 w-4 shrink-0" /> {text.arrived}</p>
      )}
      {disliked && !progress.arrived && (
        <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"><RefreshCw className="h-3.5 w-3.5 shrink-0" /> Re-routed after “{disliked}”: the films ahead keep away from it and still reach the same place.</p>
      )}
      {notice && <p className="text-xs text-emerald-600 dark:text-emerald-400">{notice}</p>}
      <ol className={`grid gap-2 ${journey.steps.length > 6 ? "grid-cols-4 sm:grid-cols-8" : "grid-cols-3 sm:grid-cols-6"}`}>
        {progress.steps.map((s, i) => {
          const next = followed && progress.next?.id === s.id;
          return (
            <li key={s.id}>
              <Poster
                id={s.id}
                details={details}
                dim={s.watched}
                ring={next}
                caption={next ? "Up next" : s.watched ? (s.rated != null ? `You gave ${s.rated}/10` : "Watched") : journey.kind === "director" ? details[s.id]?.release_date?.slice(0, 4) : why.get(s.id)}
                note={journey.explain?.steps?.[s.id] || (journey.kind === "director" ? (i === 0 ? "Start here" : i === progress.steps.length - 1 ? "A deep cut" : null) : null)}
                badge={<span className={`absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white ${next ? "bg-indigo-600" : "bg-slate-900/80"}`}>{s.watched ? <Check className="h-3 w-3" /> : i + 1}</span>}
              />
            </li>
          );
        })}
      </ol>
    </article>
  );
}

function RegionPanel({ row, total, details, member, onPlan, onClose }) {
  const [steps, setSteps] = useState(6);
  const r = row.region;
  return (
    <div className="space-y-3 rounded-xl border border-amber-300/60 bg-amber-50/60 p-4 dark:border-amber-700/50 dark:bg-amber-950/20">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="eyebrow flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> {row.seen ? `YOU HAVE SEEN ${row.seen} FILM${row.seen === 1 ? "" : "S"} HERE` : "UNEXPLORED"}</p>
          <h3 className="text-lg font-semibold">{regionLabel(r)}</h3>
          <p className="text-xs text-slate-500">
            Home of {homeOf(r).join(", ")}.
            {member && ` For your taste it ranks ${row.rank} of ${total}${row.rank <= 5 ? ", one of your strongest" : row.rank > total - 5 ? ", one of your weakest" : ""}.`}
          </p>
        </div>
        <button className="rounded-full p-1 text-slate-500 hover:bg-slate-200/60 dark:hover:bg-slate-800" onClick={onClose} aria-label="Close region"><X className="h-4 w-4" /></button>
      </div>
      {member && row.picks.length > 0 && (
        <>
          <p className="text-xs font-medium text-slate-600 dark:text-slate-300">Your best bets here</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {row.picks.map((id) => <Poster key={id} id={id} details={details} />)}
          </div>
        </>
      )}
      {member ? (
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700" role="radiogroup" aria-label="Journey length">
            {LENGTHS.map((l) => (
              <button key={l.steps} role="radio" aria-checked={steps === l.steps} title={l.hint} onClick={() => setSteps(l.steps)}
                className={`rounded-md px-2.5 py-1 text-xs ${steps === l.steps ? "bg-indigo-600 text-white" : "text-slate-600 dark:text-slate-300"}`}>{l.label}</button>
            ))}
          </div>
          <button className="account-button inline-flex items-center gap-1.5" onClick={() => onPlan(r.id, steps)}><Route className="h-4 w-4" /> Plan a journey here</button>
        </div>
      ) : (
        <p className="text-xs text-slate-500">Rate at least two films you loved and Umbrify can plan a journey here.</p>
      )}
    </div>
  );
}

// Directors' films of their own, or a line from one director to another: the
// member picks a director they love, one to discover, or any they search for.
function DirectorJourneys({ ctx, model, member, watched, exclude, onPlanned }) {
  const [discover, setDiscover] = useState([]);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState([]);
  const [chosen, setChosen] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const loved = useMemo(() => (ctx ? lovedDirectors(ctx) : []), [ctx]);

  useEffect(() => {
    if (!ctx) return;
    let live = true;
    directorsToDiscover(ctx, new Set(watched.map((m) => Number(m.id))), { limit: 6 }).then((d) => live && setDiscover(d)).catch(() => {});
    return () => { live = false; };
  }, [ctx]); // eslint-disable-line react-hooks/exhaustive-deps

  // Directors by name, as the member types.
  useEffect(() => {
    if (query.trim().length < 2) { setFound([]); return undefined; }
    const timer = setTimeout(() => {
      searchPeople(query.trim()).then((r) => setFound((r.results || []).filter((p) => p.known_for_department === "Directing").slice(0, 6))).catch(() => setFound([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const directed = async (id) => ((await personMovieCredits(id)).crew || []).filter((m) => m.job === "Director");

  const choose = async (person) => {
    setChosen(person.id);
    setBusy(true);
    setMessage("");
    try {
      const seen = new Set([...watched.map((m) => Number(m.id)), ...exclude]);
      const films = await directed(person.id);
      const plans = [];
      const lovedEntry = loved.find((d) => d.id === person.id);
      const discovered = discover.find((d) => d.id === person.id);
      const seenOfTheirs = films.filter((m) => watched.some((w) => Number(w.id) === Number(m.id))).length;
      const why = [
        lovedEntry ? `You rate ${person.name} highly: you gave ${lovedEntry.examples.slice(0, 2).map((f) => `“${f.title}” ${f.rated / 2}★`).join(" and ")}.` : null,
        discovered ? `People with your taste love ${person.name}'s “${discovered.best.title}”, and you have not seen any of their films yet.` : null,
        !lovedEntry && !discovered && seenOfTheirs ? `You have seen ${seenOfTheirs} of ${person.name}'s films.` : null,
      ];
      const own = directorJourney(person, films, { space: model.space, map: model.map, fit: ctx.fit, seen, why });
      if (own) plans.push(own);
      const isLoved = loved.some((d) => d.id === person.id);
      // From a director they love to this one; or, for a loved director, on to one they have not tried.
      const pairs = isLoved ? discover.slice(0, 3).map((d) => [person, d]) : loved.slice(0, 3).map((d) => [d, person]);
      for (const [from, to] of pairs) {
        const bridge = bridgeJourney(model.space, model.map, member, watched, {
          from: { person: from, films: (from.id === person.id ? films : await directed(from.id)).map((m) => m.id) },
          to: { person: to, films: (to.id === person.id ? films : await directed(to.id)).map((m) => m.id) },
          // The two journeys may share films: each stands on its own.
          exclude,
          why: [
            from.examples ? `You rate ${from.name} highly: you gave ${from.examples.slice(0, 2).map((f) => `“${f.title}” ${f.rated / 2}★`).join(" and ")}.` : null,
            to.best ? `${to.name} is new to you; people with your taste love their “${to.best.title}”.` : null,
          ],
        });
        if (bridge) { plans.push(bridge); break; }
      }
      if (!plans.length) setMessage(`There are not enough of ${person.name}'s films left for a journey — you may have seen most of them.`);
      onPlanned(plans);
    } catch {
      setMessage("This director's films could not be loaded. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const chip = (p, hint) => (
    <button key={p.id} type="button" onClick={() => choose(p)} disabled={busy} title={hint}
      className={`rounded-full border px-2.5 py-0.5 text-xs ${chosen === p.id ? "border-indigo-500 bg-indigo-600 text-white" : "border-slate-200 text-slate-600 hover:border-indigo-400 dark:border-slate-700 dark:text-slate-300"}`}>
      {p.name}
    </button>
  );
  return (
    <section className="account-panel space-y-3">
      <div>
        <p className="eyebrow flex items-center gap-1.5"><Clapperboard className="h-3.5 w-3.5" /> DIRECTOR JOURNEYS</p>
        <p className="text-sm text-slate-500">Go through a director's films, from the one closest to your taste to the deep cuts — or follow a line from a director you love to one you have never tried.</p>
      </div>
      {!ctx ? <p className="text-xs text-slate-500">Reading your directors…</p> : (
        <>
          {loved.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-slate-500">Directors you love:</span>
              {loved.map((d) => chip(d, `You gave ${d.examples.map((f) => `“${f.title}” ${f.rated}/10`).join(", ")}`))}
            </div>
          )}
          {discover.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-slate-500">To discover:</span>
              {discover.map((d) => chip(d, `People with your taste love “${d.best.title}”`))}
            </div>
          )}
          <label className="flex max-w-sm items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-700">
            <Search className="h-4 w-4 text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Any director…" aria-label="Search a director" className="w-full bg-transparent outline-none" />
          </label>
          {found.length > 0 && <div className="flex flex-wrap gap-1.5">{found.map((p) => chip(p))}</div>}
          {busy && <p className="text-xs text-slate-500" role="status">Planning the journey…</p>}
          {message && <p className="text-xs text-rose-600">{message}</p>}
        </>
      )}
    </section>
  );
}

// Journeys out of the member's comfort zone, and the map they are drawn on.
export default function JourneysPage() {
  const { user } = useAuth();
  const { watched } = useWatched();
  const { watchlist, isInWatchlist, addToWatchlist } = useWatchlist();
  const [model, setModel] = useState(null);
  const [failed, setFailed] = useState(false);
  const [details, setDetails] = useState({});
  const [followed, { follow, update, drop }, saveError] = useFollowedJourneys(user?.id || null);
  const [selected, setSelected] = useState(null);
  const [planned, setPlanned] = useState(null);
  const [planError, setPlanError] = useState("");
  const [skip, setSkip] = useState(() => new Set());
  const [notice, setNotice] = useState({});

  useEffect(() => {
    Promise.all([loadTasteSpace(), loadTasteMap()]).then(([space, atlas]) => (space && atlas ? setModel({ space, ...atlas }) : setFailed(true)));
  }, []);

  const member = useMemo(() => (model ? placeMember(model.space, watched, []) : null), [model, watched]);
  const scores = useMemo(() => (model ? regionScores(model.space, model.map, model.regions, member, watched) : []), [model, member, watched]);
  const view = useMemo(() => {
    if (!model) return null;
    const followedIds = new Set([...followed, ...(planned ? [planned] : [])].flatMap((j) => j.steps.map((s) => s.id)));
    const busy = new Set([...skip, ...followed.map((j) => j.region.id), ...(planned ? [planned.region.id] : [])]);
    return {
      ...memberMap(model.space, model.map, watched),
      suggestions: planJourneys(model.space, model.map, model.regions, member, watched, { exclude: followedIds, skip: busy })
    };
  }, [model, member, watched, followed, planned, skip]);

  // A followed journey re-routes when one of its films did not land.
  useEffect(() => {
    if (!model || !member) return;
    for (const j of followed) {
      const next = reroute(model.space, model.map, model.regions, member, j, watched);
      if (next !== j) update(next);
    }
  }, [model, member, followed, watched]); // eslint-disable-line react-hooks/exhaustive-deps

  // The member's signed evidence and taste-space fit, for director journeys.
  const [ctx, setCtx] = useState(null);
  const libraryKey = JSON.stringify(watched.map((m) => [m.id, m.rated]));
  useEffect(() => {
    let live = true;
    directorContext(watched, watchlist).then((c) => live && setCtx(c)).catch(() => {});
    return () => { live = false; };
  }, [libraryKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const [directorPlans, setDirectorPlans] = useState([]);
  const suggestions = useMemo(() => [...directorPlans.filter((j) => !followed.some((f) => f.id === j.id)), ...(planned ? [planned] : []), ...(view?.suggestions || [])], [directorPlans, followed, planned, view]);
  const shown = useMemo(() => [...followed, ...suggestions], [followed, suggestions]);
  const selectedRow = selected == null ? null : scores.find((r) => r.id === selected);

  useEffect(() => {
    const ids = [...new Set([...shown.flatMap((j) => [...j.steps.map((s) => s.id), j.rerouted?.after].filter(Boolean)), ...(selectedRow?.picks || [])])].filter((id) => !details[id]);
    if (!ids.length) return;
    Promise.allSettled(ids.map((id) => movieDetails(id))).then((results) => {
      const next = {};
      results.forEach((r, i) => { if (r.status === "fulfilled") next[ids[i]] = r.value; });
      setDetails((d) => ({ ...d, ...next }));
    });
  }, [shown, selectedRow]); // eslint-disable-line react-hooks/exhaustive-deps

  // Why each step is on the way: the loved film it is closest to, for you.
  const why = useMemo(() => {
    const out = new Map();
    if (!model || !member) return out;
    for (const s of shown.flatMap((j) => j.steps)) {
      const i = model.space.index.get(s.id);
      if (i == null || out.has(s.id)) continue;
      const [top] = becauseOf(model.space, member, i, { limit: 1 });
      if (top) out.set(s.id, `Near “${top.title}”`);
    }
    return out;
  }, [model, member, shown]);

  const growth = useMemo(() => (view ? territoryOverTime(view.points) : []), [view]);
  const regionMeta = (id) => model?.regions.find((r) => r.id === id);
  const explorable = scores.filter((r) => !view?.visited.has(r.id)).sort((a, b) => a.rank - b.rank).slice(0, 6);

  const plan = (regionId, steps) => {
    const exclude = new Set(followed.flatMap((j) => j.steps.map((s) => s.id)));
    const journey = planJourney(model.space, model.map, model.regions, member, watched, regionId, { steps, exclude, rank: scores.find((r) => r.id === regionId)?.rank });
    setPlanError(journey ? "" : "There are not enough films left in this region for a journey that long. Try a shorter one.");
    if (journey) setPlanned(journey);
  };
  const followJourney = (j) => {
    follow(j);
    if (planned?.id === j.id) setPlanned(null);
  };
  const toWatchlist = (j) => {
    const ahead = journeyProgress(j, watched).steps.filter((s) => !s.watched && details[s.id] && !isInWatchlist(s.id));
    ahead.forEach((s) => addToWatchlist(details[s.id]));
    setNotice({ [j.id]: ahead.length ? `Added ${ahead.length} film${ahead.length === 1 ? "" : "s"} to your watchlist.` : "The films ahead are already on your watchlist." });
  };

  if (failed) return <p className="text-sm text-slate-500">The taste map could not be loaded. Please try again later.</p>;
  if (!view) return <p className="text-sm text-slate-500">Drawing your taste map…</p>;

  const total = model.regions.length;
  return (
    <section className="space-y-6">
      <div className="account-panel space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="eyebrow flex items-center gap-1.5"><Compass className="h-3.5 w-3.5" /> YOUR TASTE MAP</p>
            <h2 className="text-xl font-semibold">You have explored {view.visited.size} of {total} regions of cinema.</h2>
            <p className="text-xs text-slate-500">16,000 films, placed so that films loved by the same people sit together. Yours are in <span className="text-indigo-500">indigo</span> (loved) and <span className="text-rose-500">rose</span> (disliked). Tap anywhere on the map to explore that region.</p>
          </div>
          {growth.length > 1 && (
            <p className="text-xs text-slate-500">Regions over time: {growth.slice(-6).map((g) => `${g.month.slice(2)} · ${g.regions}`).join("  →  ")}</p>
          )}
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden="true"><div className="h-full bg-amber-500" style={{ width: `${(100 * view.visited.size) / total}%` }} /></div>
        <TasteMap
          map={model.map}
          landmarks={model.landmarks}
          points={view.points}
          centre={view.centre}
          journeys={shown}
          selected={selected}
          onPick={({ x, y }) => { setSelected(regionAt(model.map, x, y)); setPlanError(""); }}
        />
        {member && explorable.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-500">Unexplored, and made for you:</span>
            {explorable.map((r) => (
              <button key={r.id} onClick={() => { setSelected(r.id); setPlanError(""); }}
                className={`rounded-full border px-2.5 py-0.5 text-xs ${selected === r.id ? "border-amber-500 bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100" : "border-slate-200 text-slate-600 hover:border-amber-400 dark:border-slate-700 dark:text-slate-300"}`}>
                {regionName(r.region)}
              </button>
            ))}
          </div>
        )}
        {selectedRow && <RegionPanel key={selectedRow.id} row={selectedRow} total={total} details={details} member={member} onPlan={plan} onClose={() => setSelected(null)} />}
        {planError && <p className="text-xs text-rose-600">{planError}</p>}
      </div>

      {!member ? (
        <p className="account-panel text-sm text-slate-500">Rate at least two films you loved (7/10 or more) and Umbrify will plot journeys out of your comfort zone.</p>
      ) : (
        <div className="space-y-4">
          {saveError && <p className="text-sm text-rose-600">{saveError}</p>}
          {followed.length > 0 && (
            <>
              <p className="eyebrow flex items-center gap-1.5"><Route className="h-3.5 w-3.5" /> YOUR JOURNEYS</p>
              {followed.map((j) => (
                <Journey key={j.id} journey={j} region={regionMeta(j.region.id)} details={details} watched={watched} why={why} followed notice={notice[j.id]}
                  onDrop={() => drop(j)} onWatchlist={() => toWatchlist(j)} />
              ))}
            </>
          )}
          <DirectorJourneys ctx={ctx} model={model} member={member} watched={watched}
            exclude={new Set(followed.flatMap((j) => j.steps.map((s) => s.id)))} onPlanned={setDirectorPlans} />
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="eyebrow flex items-center gap-1.5"><Route className="h-3.5 w-3.5" /> JOURNEYS TO GROW YOUR TASTE</p>
              <p className="text-sm text-slate-500">Each journey starts next to a film you loved and ends in a region you have never visited, but that people with your taste love. If a film on the way does not land, rate it and the journey re-routes.</p>
            </div>
            {view.suggestions.length > 0 && (
              <button className="account-secondary inline-flex items-center gap-1.5" onClick={() => setSkip((s) => new Set([...s, ...view.suggestions.map((j) => j.region.id)]))}>
                <Shuffle className="h-4 w-4" /> Other destinations
              </button>
            )}
          </div>
          {suggestions.map((j) => (
            <Journey key={j.id} journey={j} region={regionMeta(j.region.id)} details={details} watched={watched} why={why} notice={notice[j.id]}
              onFollow={() => followJourney(j)} onWatchlist={() => toWatchlist(j)} />
          ))}
          {!suggestions.length && skip.size > 0 && (
            <p className="text-sm text-slate-500">No more destinations for now. <button className="underline" onClick={() => setSkip(new Set())}>Start over</button></p>
          )}
          {!suggestions.length && !skip.size && !followed.length && <p className="text-sm text-slate-500">You have visited every region Umbrify can map. Impressive.</p>}
        </div>
      )}
    </section>
  );
}
