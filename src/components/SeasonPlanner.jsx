import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CalendarDays, Check, Shuffle, Users } from "lucide-react";
import { backend } from "../utils/backend";
import { movieDetails } from "../utils/api";
import { planJourneys, regionName } from "../../shared/journeys.js";
import { WEEKS, MAX_MEMBERS, seasonWeek } from "../../shared/seasons.js";

const poster = (d) => (d?.poster_path ? `https://image.tmdb.org/t/p/w154${d.poster_path}` : "/placeholder_poster.svg");
const language = () => (navigator.language || "en").split("-")[0];

/** The member's seasons, each with the week it is at. */
export function SeasonList({ seasons }) {
  if (!seasons.length) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {seasons.map((s) => {
        const { current, finished } = seasonWeek(s);
        const film = s.season.weeks[current];
        return (
          <Link key={s.id} to={`/season/${s.id}`} className="account-panel flex gap-3 text-slate-900 transition hover:ring-2 hover:ring-indigo-300 dark:text-slate-100">
            <img src={poster(film)} alt="" className="h-24 w-16 shrink-0 rounded-md object-cover" />
            <span className="min-w-0">
              <span className="block text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">{finished ? "Season complete" : `Week ${current + 1} of ${s.season.weeks.length}`}</span>
              <span className="block truncate font-semibold" translate="no">{s.season.title}</span>
              <span className="block truncate text-sm text-slate-500">{finished ? `${s.season.weeks.length} films` : <>{"This week: "}<span translate="no">{film.title}</span></>}</span>
              {s.members.length > 1 && <span className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500"><Users className="h-3 w-3" /> {`with ${s.members.length - 1} friend${s.members.length > 2 ? "s" : ""}`}</span>}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

/**
 * Plans a cinema season: a path through the taste map towards a region the
 * member has not visited, 8 to 12 films long, one a week, for them alone or
 * with friends. The critic writes the introductions when it starts.
 */
export default function SeasonPlanner({ model, member, watched, exclude, signedIn }) {
  const navigate = useNavigate();
  const [weeks, setWeeks] = useState(10);
  const [skip, setSkip] = useState(() => new Set());
  const [choice, setChoice] = useState(0);
  const [friends, setFriends] = useState([]);
  const [invited, setInvited] = useState([]);
  const [details, setDetails] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const options = useMemo(() => (model && member ? planJourneys(model.space, model.map, model.regions, member, watched, { count: 3, steps: weeks, exclude, skip }) : []), [model, member, watched, weeks, exclude, skip]);
  const plan = options[Math.min(choice, options.length - 1)] || null;
  const regionOf = (j) => model.regions.find((r) => r.id === j.region.id) || j.region;

  useEffect(() => {
    if (!signedIn) return;
    backend("social")
      .then((d) => setFriends(d.people.filter((p) => d.following.includes(p.id) && d.followers.includes(p.id) && p.share_activity)))
      .catch(() => setFriends([]));
  }, [signedIn]);
  useEffect(() => {
    const ids = (plan?.steps || []).map((s) => s.id).filter((id) => !details[id]);
    if (!ids.length) return;
    Promise.allSettled(ids.map((id) => movieDetails(id))).then((rs) => {
      const next = {};
      rs.forEach((r, i) => { if (r.status === "fulfilled") next[ids[i]] = r.value; });
      setDetails((d) => ({ ...d, ...next }));
    });
  }, [plan]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    setBusy(true);
    setError("");
    try {
      const { season } = await backend("critic", { action: "season-create", films: plan.steps.map((s) => s.id), members: invited, region: plan.region, place: regionName(regionOf(plan)), language: language() });
      navigate(`/season/${season.id}`);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  if (!member) return null;
  return (
    <div className="account-panel space-y-4">
      <div>
        <p className="eyebrow flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" /> PLAN A CINEMA SEASON</p>
        <h3 className="text-lg font-semibold">One film a week, introduced by your critic.</h3>
        <p className="text-sm text-slate-500">A season walks from films you love to a corner of cinema you have not visited. A new week opens every seven days, with a note on what to look for and a question to talk over, alone or with friends.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Season length">
        {WEEKS.map((n) => (
          <button key={n} role="radio" aria-checked={weeks === n} onClick={() => { setWeeks(n); setChoice(0); }}
            className={`rounded-full border px-3 py-1 text-sm ${weeks === n ? "border-indigo-500 bg-indigo-50 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-200" : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"}`}>
            {n} weeks
          </button>
        ))}
      </div>
      {!options.length ? (
        <p className="text-sm text-slate-500">No season of this length fits your map right now. Try a shorter one{skip.size ? <>, or <button className="underline" onClick={() => setSkip(new Set())}>start over</button></> : ""}.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-500">Towards:</span>
            {options.map((j, k) => (
              <button key={j.id} onClick={() => setChoice(k)}
                className={`rounded-full border px-2.5 py-0.5 text-xs ${plan === j ? "border-amber-500 bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100" : "border-slate-200 text-slate-600 hover:border-amber-400 dark:border-slate-700 dark:text-slate-300"}`}>
                {regionName(regionOf(j))}
              </button>
            ))}
            <button className="ml-1 inline-flex items-center gap-1 text-xs text-slate-500 hover:underline" onClick={() => { setSkip((s) => new Set([...s, ...options.map((j) => j.region.id)])); setChoice(0); }}>
              <Shuffle className="h-3 w-3" /> Other destinations
            </button>
          </div>
          {plan && (
            <ol className="flex gap-2 overflow-x-auto pb-1" aria-label="The season's films">
              {plan.steps.map((s, k) => (
                <li key={s.id} className="w-20 shrink-0">
                  <img src={poster(details[s.id])} alt="" className="w-full rounded-md object-cover" style={{ aspectRatio: "2 / 3" }} />
                  <span className="mt-1 block text-[10px] font-semibold uppercase text-slate-400">Week {k + 1}</span>
                  <span className="block truncate text-[11px] font-medium" translate="no">{details[s.id]?.title || "…"}</span>
                </li>
              ))}
            </ol>
          )}
          {signedIn ? (
            <>
              {friends.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs text-slate-500">Follow it with friends (up to {MAX_MEMBERS - 1}): each of you writes a note on every week's film.</p>
                  <div className="flex flex-wrap gap-1.5">
                    {friends.map((f) => {
                      const on = invited.includes(f.id);
                      return (
                        <button key={f.id} aria-pressed={on} disabled={!on && invited.length >= MAX_MEMBERS - 1}
                          onClick={() => setInvited((list) => (on ? list.filter((x) => x !== f.id) : [...list, f.id]))}
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs ${on ? "border-indigo-500 bg-indigo-50 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-200" : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"}`}>
                          {on && <Check className="h-3 w-3" />}{f.display_name || "A friend"}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <button className="account-button" disabled={busy || !plan} onClick={start}>{busy ? "Your critic is writing the season…" : invited.length ? `Start the season with ${invited.length} friend${invited.length > 1 ? "s" : ""}` : "Start the season"}</button>
                {error && <p className="text-sm text-rose-600">{error}</p>}
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500"><Link className="font-medium text-indigo-600 hover:underline" to="/profile">Sign in</Link> to start a season: it keeps your weeks on every device and lets friends follow it with you.</p>
          )}
        </>
      )}
    </div>
  );
}
