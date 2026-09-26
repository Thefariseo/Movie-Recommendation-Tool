import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Award, Check, Compass, Flag, Lock, MapPin, Route, Users, X } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import useWatched from "../hooks/useWatched";
import { useModal } from "../hooks/useModal";
import { loadTasteSpace } from "../utils/tasteSpace";
import { loadTasteMap } from "../utils/tasteMap";
import { useFollowedJourneys } from "../utils/journeys";
import { useCircle } from "../utils/circle";
import { movieDetails } from "../utils/api";
import { placeMember } from "../../shared/tasteSpace.js";
import { memberMap, planJourney, regionScores, journeyProgress } from "../../shared/journeys.js";
import { territoryGrid, territories, tally, milestones, frontier, footprint, territoryName, territoryKind, CONQUER } from "../../shared/atlas.js";
import { regionExperts, friendJourney } from "../../shared/social.js";
import { stars } from "../../shared/evidence.js";
import TasteAtlas from "../components/TasteAtlas";

const FRIEND_COLOURS = ["#059669", "#0284c7", "#db2777", "#ea580c", "#7c3aed", "#0d9488"];
const LEGEND = [
  ["conquered", "Conquered", "bg-indigo-600"],
  ["settled", "Visited", "bg-indigo-300"],
  ["frontier", "Frontier", "bg-amber-400"],
  ["unexplored", "Unexplored", "bg-slate-300 dark:bg-slate-600"],
];
const posterOf = (m) => {
  const path = m?.poster_path || m?.poster;
  return path ? `https://image.tmdb.org/t/p/w185${path}` : "/placeholder_poster.svg";
};

function Film({ film, caption }) {
  const { open } = useModal();
  return (
    <button type="button" onClick={() => open(film)} className="block w-full text-left">
      <img className="w-full rounded-md object-cover" style={{ aspectRatio: "2 / 3" }} alt="" src={posterOf(film)} />
      <span className="mt-1 block truncate text-[11px] font-medium">{film.title}</span>
      {caption && <span className="block truncate text-[10px] text-slate-500">{caption}</span>}
    </button>
  );
}

function RegionPanel({ land, row, total, details, friendsHere, expert, onPlan, onFriendJourney, following, onClose, canPlan }) {
  const r = land.region;
  const badge = { conquered: "bg-indigo-600 text-white", settled: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200", frontier: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100", unexplored: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" }[land.status];
  const label = { conquered: "Conquered", settled: "Visited", frontier: "On your frontier", unexplored: "Unexplored" }[land.status];
  const missing = land.toConquer;
  return (
    <section className="account-panel space-y-4" aria-label={`Territory: ${territoryName(r)}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge}`}>{label}</span>
          <h3 className="mt-1 text-xl font-semibold leading-tight">{territoryName(r)}</h3>
          <p className="text-xs text-slate-500">
            {territoryKind(r)} · {r.size} films{row?.rank ? ` · for your taste it ranks ${row.rank} of ${total}` : ""}
          </p>
        </div>
        <button className="rounded-full p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={onClose} aria-label="Close territory"><X className="h-4 w-4" /></button>
      </div>
      <p className="text-sm text-slate-700 dark:text-slate-300">
        {land.status === "conquered"
          ? `Yours: you have seen ${land.seen} films here and loved ${land.loved}.`
          : land.seen
            ? `You have seen ${land.seen} film${land.seen === 1 ? "" : "s"} here${land.loved ? ` and loved ${land.loved}` : ""}. To conquer it: ${[missing.seen && `${missing.seen} more film${missing.seen === 1 ? "" : "s"}`, missing.loved && `${missing.loved} more you love`].filter(Boolean).join(", and ")}.`
            : land.status === "frontier"
              ? "You have never been here, but it borders your territory: the natural next step."
              : `You have never been here. Conquer it by seeing ${CONQUER.seen} films and loving ${CONQUER.loved}.`}
      </p>
      {land.films.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">Your films here</p>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
            {land.films.slice(0, 8).map((f) => <Film key={f.id} film={f} caption={f.rated ? `You: ${stars(f.rated)}` : "Watched"} />)}
          </div>
        </div>
      )}
      {row?.picks?.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">Your best bets here</p>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {row.picks.slice(0, 6).map((id) => details[id] && <Film key={id} film={details[id]} />)}
          </div>
        </div>
      )}
      {friendsHere.length > 0 && (
        <p className="text-xs text-slate-600 dark:text-slate-300"><Users className="mr-1 inline h-3.5 w-3.5" />{friendsHere.map((f) => `${f.name} has seen ${f.seen} here${f.loved ? ` (loved ${f.loved})` : ""}`).join(" · ")}.</p>
      )}
      <div className="flex flex-wrap gap-2">
        {canPlan && land.status !== "conquered" && (
          <button className="account-button inline-flex items-center gap-1.5" onClick={onPlan}><Route className="h-4 w-4" /> Plan a journey here</button>
        )}
        {expert && (following
          ? <Link to="/library/journeys" className="account-secondary inline-flex items-center gap-1.5"><Check className="h-4 w-4" /> Following {expert.name}'s journey</Link>
          : <button className="account-secondary inline-flex items-center gap-1.5" onClick={onFriendJourney}><Compass className="h-4 w-4" /> Journey with {expert.name}</button>)}
      </div>
    </section>
  );
}

// The taste map as a place to explore: territories, frontier, trails, friends and milestones.
export default function MapPage() {
  const { user } = useAuth();
  const { watched } = useWatched();
  const [model, setModel] = useState(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState(null);
  const [shownFriends, setShownFriends] = useState(() => new Set());
  const [trails, setTrails] = useState(true);
  const [notice, setNotice] = useState("");
  const [details, setDetails] = useState({});
  const [followed, { follow }] = useFollowedJourneys(user?.id || null);
  const circle = useCircle(user?.id || null, watched);

  useEffect(() => {
    Promise.all([loadTasteSpace(), loadTasteMap()]).then(([space, atlas]) => (space && atlas ? setModel({ space, ...atlas }) : setFailed(true)));
  }, []);
  const grid = useMemo(() => (model ? territoryGrid(model.map) : null), [model]);
  const lands = useMemo(() => (model ? territories(model.space, model.map, model.regions, watched, grid) : null), [model, grid, watched]);
  const view = useMemo(() => (model ? memberMap(model.space, model.map, watched) : null), [model, watched]);
  const member = useMemo(() => (model ? placeMember(model.space, watched, []) : null), [model, watched]);
  const scores = useMemo(() => (model ? regionScores(model.space, model.map, model.regions, member, watched) : []), [model, member, watched]);
  const friends = useMemo(() => circle.friends.map((f, n) => ({ ...f, colour: FRIEND_COLOURS[n % FRIEND_COLOURS.length], ...(model ? footprint(model.space, model.map, f.films) : {}) })), [circle.friends, model]);
  const experts = useMemo(() => (model ? regionExperts(model.space, model.map, circle.friends) : new Map()), [model, circle.friends]);
  const progress = useMemo(() => followed.map((j) => ({ ...j, arrived: journeyProgress(j, watched).arrived })), [followed, watched]);
  const marks = useMemo(() => (lands ? milestones(lands, { journeys: progress, centre: view?.centre, friendRegions: new Set(experts.keys()) }) : []), [lands, progress, view, experts]);
  const edge = useMemo(() => (lands ? frontier(lands, scores).slice(0, 6) : []), [lands, scores]);
  const row = selected == null ? null : scores.find((s) => s.id === selected);

  useEffect(() => {
    const ids = (row?.picks || []).filter((id) => !details[id]);
    if (!ids.length) return;
    Promise.allSettled(ids.map((id) => movieDetails(id))).then((rs) => {
      const next = {};
      rs.forEach((r, i) => { if (r.status === "fulfilled") next[ids[i]] = r.value; });
      setDetails((d) => ({ ...d, ...next }));
    });
  }, [row]); // eslint-disable-line react-hooks/exhaustive-deps

  if (failed) return <p className="text-sm text-slate-500">The taste map could not be loaded. Please try again later.</p>;
  if (!model || !lands) return <p className="text-sm text-slate-500" role="status">Drawing your atlas…</p>;

  const counts = tally(lands);
  const total = model.regions.length;
  const visited = counts.conquered + counts.settled;
  const land = selected == null ? null : lands.get(selected);
  const expert = selected == null ? null : experts.get(selected);
  const me = member && circle.me;
  const theirJourney = expert && (followed.find((j) => j.kind === "friend" && j.person?.id === expert.id && j.region.id === selected)
    || (me ? friendJourney(model.space, model.map, model.regions, me, expert, selected, watched) : null));
  const friendsHere = selected == null ? [] : circle.friends.map((f) => {
    const films = f.films.filter((x) => { const i = model.space.index.get(Number(x.id)); return i != null && model.map.region[i] === selected; });
    return { name: f.name, seen: films.length, loved: films.filter((x) => Number(x.rated) >= 7).length };
  }).filter((f) => f.seen);
  const plan = () => {
    const exclude = new Set(followed.flatMap((j) => j.steps.map((s) => s.id)));
    const j = planJourney(model.space, model.map, model.regions, member, watched, selected, { steps: 6, exclude, rank: row?.rank });
    if (!j) { setNotice("There are not enough films left here for a journey. Try a neighbouring territory."); return; }
    follow(j);
    setNotice(`You are following a journey into ${territoryName(land.region)}. It is on the map, and in Journeys.`);
  };

  return (
    <section className="space-y-6">
      <div className="account-panel space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow flex items-center gap-1.5"><Compass className="h-3.5 w-3.5" /> YOUR ATLAS OF CINEMA</p>
            <h2 className="text-2xl font-semibold">You have set foot in {visited} of {total} territories{counts.conquered ? `, and conquered ${counts.conquered}` : ""}.</h2>
            <p className="text-sm text-slate-500">16,000 films, placed so that films loved by the same people sit together, in {total} territories. Conquer one by seeing {CONQUER.seen} of its films and loving {CONQUER.loved}. Tap a territory to explore it.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          {LEGEND.map(([key, name, dot]) => (
            <span key={key} className="inline-flex items-center gap-1.5"><span className={`h-3 w-3 rounded-sm ${dot}`} />{name} <span className="font-semibold tabular-nums">{counts[key]}</span></span>
          ))}
          <label className="ml-auto inline-flex cursor-pointer items-center gap-1.5"><input type="checkbox" className="accent-indigo-600" checked={trails} onChange={(e) => setTrails(e.target.checked)} /> Journey trails</label>
        </div>
        {friends.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-500">Lay a friend's map over yours (their territories outlined in their colour):</span>
            {friends.map((f) => {
              const on = shownFriends.has(f.id);
              return (
                <button key={f.id} type="button" aria-pressed={on} onClick={() => setShownFriends((s) => { const n = new Set(s); if (on) n.delete(f.id); else n.add(f.id); return n; })}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${on ? "text-white" : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"}`}
                  style={on ? { background: f.colour, borderColor: f.colour } : undefined}>
                  <span className="h-2 w-2 rounded-full" style={{ background: f.colour }} />{f.name}{f.match != null ? ` · ${f.match}%` : ""}
                </button>
              );
            })}
          </div>
        )}
        <TasteAtlas
          model={model} grid={grid} lands={lands}
          points={view.points} centre={view.centre}
          journeys={trails ? followed : []}
          friends={friends.filter((f) => shownFriends.has(f.id))}
          selected={selected}
          onPick={(r) => { setSelected(r); setNotice(""); }}
        />
        {edge.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-500"><Flag className="mr-1 inline h-3.5 w-3.5 text-amber-500" />On your frontier, most promising first:</span>
            {edge.map((t) => (
              <button key={t.region.id} type="button" onClick={() => { setSelected(t.region.id); setNotice(""); }}
                className={`rounded-full border px-2.5 py-0.5 text-xs ${selected === t.region.id ? "border-amber-500 bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100" : "border-slate-200 text-slate-600 hover:border-amber-400 dark:border-slate-700 dark:text-slate-300"}`}>
                {territoryName(t.region)}
              </button>
            ))}
          </div>
        )}
        {notice && <p className="text-sm text-emerald-700 dark:text-emerald-300">{notice} <Link className="underline" to="/library/journeys">Open Journeys</Link></p>}
      </div>

      {land && (
        <RegionPanel key={land.region.id} land={land} row={row} total={total} details={details} friendsHere={friendsHere} expert={theirJourney ? expert : null}
          canPlan={Boolean(member)} following={theirJourney && followed.some((j) => j.id === theirJourney.id)}
          onPlan={plan} onFriendJourney={() => { follow(theirJourney); setNotice(`You are following ${expert.name}'s journey.`); }} onClose={() => setSelected(null)} />
      )}

      <section className="account-panel space-y-4">
        <div>
          <p className="eyebrow flex items-center gap-1.5"><Award className="h-3.5 w-3.5" /> MILESTONES</p>
          <h2 className="text-xl font-semibold">{marks.filter((m) => m.earned).length} of {marks.length} earned</h2>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {marks.map((m) => (
            <li key={m.id} className={`flex gap-3 rounded-xl border p-3 ${m.earned ? "border-amber-300 bg-amber-50/70 dark:border-amber-700/60 dark:bg-amber-950/20" : "border-slate-200 dark:border-slate-700"}`}>
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${m.earned ? "bg-amber-400 text-white" : "bg-slate-100 text-slate-400 dark:bg-slate-800"}`}>
                {m.earned ? <Award className="h-5 w-5" /> : <Lock className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{m.title}</p>
                <p className="text-xs text-slate-500">{m.detail}</p>
                {!m.earned && (
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full bg-amber-400" style={{ width: `${(100 * m.have) / m.need}%` }} /></div>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
      {!member && <p className="account-panel text-sm text-slate-500"><MapPin className="mr-1 inline h-4 w-4" />Rate at least two films you loved (7/10 or more) and Umbrify can plan journeys across the map.</p>}
    </section>
  );
}
