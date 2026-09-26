import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Compass, Route, Swords, Users } from "lucide-react";
import UserAvatar from "./UserAvatar";
import MovieCard from "./MovieCard";
import { useModal } from "../hooks/useModal";
import { movieDetails } from "../utils/api";
import { agreement, divergences, disputed, regionExperts, friendJourney, circlePicks, circleReason } from "../../shared/social.js";
import { regionName } from "../../shared/journeys.js";
import { stars } from "../../shared/evidence.js";

const poster = (d, size = "w185") => (d?.poster_path ? `https://image.tmdb.org/t/p/${size}${d.poster_path}` : "/placeholder_poster.svg");
const names = (rows) => rows.map((r) => regionName(r.region)).join(" · ");

function useDetails(ids) {
  const [details, setDetails] = useState({});
  const key = ids.join(",");
  useEffect(() => {
    const missing = ids.filter((id) => id && !details[id]);
    if (!missing.length) return;
    Promise.allSettled(missing.map((id) => movieDetails(id))).then((rs) => {
      const next = {};
      rs.forEach((r, i) => { if (r.status === "fulfilled") next[missing[i]] = r.value; });
      setDetails((d) => ({ ...d, ...next }));
    });
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return details;
}

// The film two friends would argue about, one side each.
function Dispute({ film, details, line }) {
  const { open } = useModal();
  const d = details[film.id];
  return (
    <button type="button" disabled={!d} onClick={() => d && open(d)} className="flex items-center gap-2 text-left">
      <img className="w-10 shrink-0 rounded" style={{ aspectRatio: "2 / 3" }} alt="" src={poster(d, "w92")} />
      <span className="text-xs"><span className="block font-medium text-slate-800 dark:text-slate-100">{d?.title || "…"}</span>{line}</span>
    </button>
  );
}

function Friend({ friend, me, model, watched, details, guides, onJourney, following }) {
  const [open, setOpen] = useState(false);
  const both = agreement(watched, friend.films);
  const split = friend.regions && me?.regions ? divergences(model.regions, me.regions, friend.regions) : null;
  const argue = friend.fight;
  const theirGuides = guides.filter((g) => g.expert.id === friend.id);
  return (
    <li className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
      <div className="flex items-center gap-3">
        <UserAvatar user={friend} name={friend.name} className="friend-avatar" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight">{friend.name}</p>
          <p className="text-xs text-slate-500">
            {friend.match == null ? "Needs a few more loved films to be placed on the map" : `${friend.label} · ${friend.films.length} films rated`}
          </p>
        </div>
        {friend.match != null && (
          <div className="w-24 text-right">
            <p className="text-lg font-bold tabular-nums text-indigo-600 dark:text-indigo-300">{friend.match}%</p>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${friend.match}%` }} /></div>
          </div>
        )}
      </div>
      {friend.match != null && (
        <div className="mt-3 space-y-2 text-sm text-slate-700 dark:text-slate-300">
          {both.shared > 0 && (
            <p>
              You have both rated {both.shared} film{both.shared === 1 ? "" : "s"} and agree on {both.agree}.
              {both.best && ` You both loved “${both.best.title}”.`}
              {both.biggest && ` You split on “${both.biggest.title}”: you gave it ${stars(both.biggest.you)}, ${friend.name} ${stars(both.biggest.them)}.`}
            </p>
          )}
          {split?.shared.length > 0 && <p><span className="font-medium">Where you meet:</span> {names(split.shared)}.</p>}
          {!open && (split?.theirs.length || split?.yours.length || argue) ? (
            <button type="button" className="text-xs font-medium text-indigo-600 hover:underline" onClick={() => setOpen(true)}>Where you part ways →</button>
          ) : null}
          {open && (
            <>
              {split?.theirs.length > 0 && <p><span className="font-medium">{friend.name}'s world, not yours:</span> {names(split.theirs)}.</p>}
              {split?.yours.length > 0 && <p><span className="font-medium">Yours, not {friend.name}'s:</span> {names(split.yours)}.</p>}
              {argue && (argue.theirs || argue.yours) && (
                <div className="rounded-lg bg-rose-50/70 p-3 dark:bg-rose-950/20">
                  <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-300"><Swords className="h-3.5 w-3.5" /> The films you would argue about</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {argue.theirs && <Dispute film={argue.theirs} details={details} line={`${friend.name} would love it; it is far from your taste.`} />}
                    {argue.yours && <Dispute film={argue.yours} details={details} line={`Made for you; ${friend.name} would likely hate it.`} />}
                  </div>
                </div>
              )}
            </>
          )}
          {theirGuides.map((g) => (
            <div key={g.region.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-emerald-50/70 px-3 py-2 dark:bg-emerald-950/20">
              <p className="text-xs"><Compass className="mr-1 inline h-3.5 w-3.5 text-emerald-600" /><span className="font-medium">{friend.name} can guide you into the corner of the map around {g.expert.films.slice(0, 2).map((f) => `“${f.title}”`).join(" and ")}</span> ({regionName(g.region)}): they loved {g.expert.films.length} films there, and you have {g.seen ? `seen only ${g.seen}` : "never been"}.</p>
              {following.has(g.journey?.id)
                ? <Link to="/library/journeys" className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-300"><Check className="h-3.5 w-3.5" /> Following · open Journeys</Link>
                : g.journey && <button type="button" className="account-secondary inline-flex items-center gap-1.5 text-xs" onClick={() => onJourney(g.journey)}><Route className="h-3.5 w-3.5" /> Journey with {friend.name}</button>}
            </div>
          ))}
        </div>
      )}
    </li>
  );
}

/**
 * The circle seen through the taste space: how close each friend is, where you
 * meet and part, the films you would argue about, who can guide you where,
 * and picks weighted by the friends closest to you.
 */
export default function TasteCircle({ circle, watched, followed, onFollow }) {
  const { model, me, friends } = circle;
  const seen = useMemo(() => new Set(watched.map((m) => Number(m.id))), [watched]);
  // The films to argue about, per friend.
  const withFights = useMemo(() => friends.map((f) => ({
    ...f,
    fight: model && me && f.taste ? disputed(model.space, me, f.taste, new Set([...seen, ...f.films.map((x) => Number(x.id))])) : null,
  })), [friends, model, me, seen]);
  // Regions a friend knows well and you barely do, with the journey they would guide.
  const guides = useMemo(() => {
    if (!model || !me) return [];
    const experts = regionExperts(model.space, model.map, friends);
    const visits = new Map();
    for (const f of watched) {
      const i = model.space.index.get(Number(f.id));
      if (i != null) visits.set(model.map.region[i], (visits.get(model.map.region[i]) || 0) + 1);
    }
    const taken = new Set(followed.flatMap((j) => j.steps.map((s) => s.id)));
    return [...experts].filter(([r]) => (visits.get(r) || 0) <= 1).map(([r, expert]) => ({
      region: model.regions.find((x) => x.id === r), expert, seen: visits.get(r) || 0,
      // A journey already followed with this friend here is the one shown.
      journey: followed.find((j) => j.kind === "friend" && j.person?.id === expert.id && j.region.id === r)
        || friendJourney(model.space, model.map, model.regions, me, expert, r, watched, { exclude: taken }),
    })).filter((g) => g.region && g.journey).sort((a, b) => b.expert.films.length - a.expert.films.length).slice(0, 6);
  }, [model, me, friends, watched, followed]);
  const picks = useMemo(() => (model ? circlePicks(model.space, me, friends.filter((f) => f.match != null), seen, { limit: 12 }) : []), [model, me, friends, seen]);
  const ids = [...withFights.flatMap((f) => [f.fight?.theirs?.id, f.fight?.yours?.id]), ...picks.map((p) => p.id)].filter(Boolean);
  const details = useDetails(ids);
  const following = new Set(followed.map((j) => j.id));

  if (circle.loading) return <p className="text-sm text-slate-500" role="status">Placing your circle on the taste map…</p>;
  if (circle.error) return <p className="text-sm text-slate-500">{circle.error}</p>;
  if (!friends.length) return null;
  return (
    <section className="account-panel space-y-5">
      <div>
        <p className="eyebrow flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> YOUR TASTE CIRCLE</p>
        <h2 className="text-xl font-semibold">How close your tastes are</h2>
        <p className="text-sm text-slate-500">Each friend is placed on the same map of 16,000 films as you, from their own ratings. The match compares the films each of you is most drawn to.</p>
        {!me && <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">Rate at least two films you loved (7/10 or more) to see how close you are.</p>}
      </div>
      <ul className="grid gap-3 lg:grid-cols-2">
        {withFights.map((f) => (
          <Friend key={f.id} friend={f} me={me} model={model} watched={watched} details={details} guides={guides} following={following} onJourney={onFollow} />
        ))}
      </ul>
      {picks.length > 0 && (
        <div className="space-y-3">
          <div>
            <h3 className="text-lg font-semibold">Picked by your circle</h3>
            <p className="text-sm text-slate-500">What your friends loved, weighted by how close their taste is to yours, not by what everyone likes.</p>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
            {picks.slice(0, 6).map((p) => (
              <div key={p.id}>
                <MovieCard movie={details[p.id] ? { ...details[p.id], _reason: circleReason(p) } : { ...p.film, id: p.id }} />
                <p className="mt-2 text-xs text-slate-500">{circleReason(p)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
