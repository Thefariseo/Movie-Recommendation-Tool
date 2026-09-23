import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Moon, Users, User, Clock, SlidersHorizontal, RefreshCw } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import useWatched from "../hooks/useWatched";
import useWatchlist from "../hooks/useWatchlist";
import { useModal } from "../hooks/useModal";
import { backend } from "../utils/backend";
import { watchProviderList } from "../utils/api";
import { tonightPicks } from "../algorithms/tonight";
import { MOODS, TIMES, ERAS, LANGUAGES, MIN_RATINGS, POPULARITY, AVOIDABLE } from "../../shared/tonight.js";
import { LOOKS } from "../../shared/visual.js";
import MovieCard from "../components/MovieCard";

const SERVICES_KEY = "umbrify_services_v1";
const readServices = () => {
  try { return JSON.parse(localStorage.getItem(SERVICES_KEY) || "[]"); } catch { return []; }
};
const saveServices = (ids) => {
  try { localStorage.setItem(SERVICES_KEY, JSON.stringify(ids)); } catch { /* storage may be blocked */ }
};
// The night's extra filters, remembered between visits.
const OPTIONS_KEY = "umbrify_tonight_v1";
const NO_OPTIONS = { era: null, language: null, minRating: null, popularity: null, avoid: [], gentle: false, rent: false, watchlistOnly: false };
const readOptions = () => {
  try { return { ...NO_OPTIONS, ...JSON.parse(localStorage.getItem(OPTIONS_KEY) || "{}") }; } catch { return NO_OPTIONS; }
};
const saveOptions = (options) => {
  try { localStorage.setItem(OPTIONS_KEY, JSON.stringify(options)); } catch { /* storage may be blocked */ }
};
const activeCount = (o) => ["era", "language", "minRating", "popularity"].filter((k) => o[k]).length + o.avoid.length + ["gentle", "rent", "watchlistOnly"].filter((k) => o[k]).length;

function Toggle({ checked, onChange, children }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

function region(profile) {
  if (profile?.country) return profile.country;
  const parts = (navigator.language || "it-IT").split("-");
  return parts.length > 1 ? parts.at(-1).toUpperCase() : "IT";
}

const Chip = ({ active, children, ...props }) => (
  <button type="button" className={`rounded-full border px-3 py-1.5 text-sm transition ${active ? "border-indigo-500 bg-indigo-600 text-white" : "border-slate-200 hover:border-indigo-300 dark:border-slate-700"}`} {...props}>{children}</button>
);

function Hero({ film }) {
  const { open } = useModal();
  return (
    <button type="button" onClick={() => open(film)} className="account-panel flex w-full gap-4 text-left sm:gap-6">
      <img className="w-28 shrink-0 rounded-lg sm:w-40" alt="" src={film.poster_path ? `https://image.tmdb.org/t/p/w342${film.poster_path}` : "/placeholder_poster.svg"} />
      <span className="min-w-0 space-y-2">
        <span className="eyebrow block">TONIGHT</span>
        <span className="block text-2xl font-semibold leading-tight">{film.title}</span>
        <span className="flex flex-wrap gap-3 text-xs text-slate-500">
          {film.release_date && <span>{film.release_date.slice(0, 4)}</span>}
          {film.runtime ? <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{film.runtime} min</span> : null}
        </span>
        {film._reasonDetail && <span className="block text-sm leading-relaxed text-slate-600 dark:text-slate-300">{film._reasonDetail}</span>}
        {film.providers?.length > 0 && (
          <span className="flex flex-wrap items-center gap-2 text-xs text-slate-500">{film.providers.every((p) => p.how === "rent") ? "To rent or buy on" : "Streaming on"}
            {film.providers.map((p) => <img key={p.provider_id} className="h-6 w-6 rounded" alt={p.provider_name} title={`${p.provider_name}${p.how === "rent" ? " (rent or buy)" : ""}`} src={`https://image.tmdb.org/t/p/w92${p.logo_path}`} />)}
          </span>
        )}
      </span>
    </button>
  );
}

export default function TonightPage() {
  const { user, profile } = useAuth();
  const { watched } = useWatched();
  const { watchlist } = useWatchlist();
  const navigate = useNavigate();
  const place = region(profile);
  const [mode, setMode] = useState("solo");
  const [mood, setMood] = useState(null);
  const [time, setTime] = useState("standard");
  const [look, setLook] = useState(null);
  const [options, setOptionsState] = useState(readOptions);
  const [shown, setShown] = useState([]);
  // Opens by itself when filters from an earlier visit are still on.
  const [moreOpen, setMoreOpen] = useState(() => activeCount(readOptions()) > 0);
  const setOption = (key, value) => setOptionsState((o) => { const next = { ...o, [key]: value }; saveOptions(next); return next; });
  const resetOptions = () => { setOptionsState(NO_OPTIONS); saveOptions(NO_OPTIONS); };
  const [services, setServices] = useState(readServices);
  const [catalogue, setCatalogue] = useState([]);
  const [picks, setPicks] = useState(null);
  const [friends, setFriends] = useState([]);
  const [chosen, setChosen] = useState([]);
  const [nights, setNights] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    watchProviderList(place).then((d) => setCatalogue((d.results || []).sort((a, b) => (a.display_priorities?.[place] ?? a.display_priority ?? 99) - (b.display_priorities?.[place] ?? b.display_priority ?? 99)).slice(0, 14))).catch(() => setCatalogue([]));
  }, [place]);
  useEffect(() => {
    if (!user) return;
    backend("social").then((d) => setFriends(d.people.filter((p) => d.following.includes(p.id) && d.followers.includes(p.id) && p.share_activity))).catch(() => {});
    backend("tonight").then((d) => setNights(d.nights.filter((n) => n.status === "open"))).catch(() => {});
  }, [user?.id]);

  const toggleService = (id) => {
    const next = services.includes(id) ? services.filter((s) => s !== id) : [...services, id];
    setServices(next);
    saveServices(next);
  };
  // "Show me others" keeps what was already offered tonight out of the next round.
  const findSolo = async (more = false) => {
    setBusy(true);
    setError("");
    const exclude = new Set(more ? shown : []);
    if (!more) setShown([]);
    setPicks(null);
    try {
      const found = await tonightPicks({ watched, watchlist, mood, time, look, providers: services, region: place, exclude, ...options });
      setPicks(found);
      setShown((s) => [...(more ? s : []), ...found.map((f) => f.id)]);
      if (!found.length) setError(more ? "That's everything that fits tonight. Loosen a filter to see more." : services.length ? "Nothing on your services fits tonight. Try another mood, more time, fewer filters or more services." : "Nothing fits tonight. Try another mood, more time or fewer filters.");
    } catch {
      setError("Tonight's picks could not be loaded. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  const startVote = async () => {
    setBusy(true);
    setError("");
    try {
      const { watchlistOnly, ...shared } = options;
      const { night } = await backend("tonight", { action: "create", members: chosen, mood, time, providers: services, region: place, ...shared });
      navigate(`/tonight/${night.id}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const serviceNames = useMemo(() => catalogue.filter((c) => services.includes(c.provider_id)).map((c) => c.provider_name).join(", "), [catalogue, services]);

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 pb-24 pt-6">
      <header>
        <p className="eyebrow flex items-center gap-1.5"><Moon className="h-3.5 w-3.5" /> TONIGHT</p>
        <h1 className="text-2xl font-semibold">One film for tonight, and where to watch it.</h1>
      </header>

      {nights.length > 0 && (
        <section className="account-panel space-y-2">
          <p className="eyebrow">MOVIE NIGHTS WAITING FOR YOUR VOTE</p>
          {nights.map((n) => <Link key={n.id} to={`/tonight/${n.id}`} className="block text-sm font-medium text-indigo-600 hover:underline">{n.films.length} films to vote on · {new Date(n.created_at).toLocaleString()}</Link>)}
        </section>
      )}

      <section className="account-panel space-y-5">
        <div className="flex gap-2">
          <Chip active={mode === "solo"} onClick={() => setMode("solo")}><User className="mr-1 inline h-3.5 w-3.5" />Just me</Chip>
          <Chip active={mode === "group"} onClick={() => setMode("group")}><Users className="mr-1 inline h-3.5 w-3.5" />With friends</Chip>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-semibold">What are you in the mood for?</p>
          <div className="flex flex-wrap gap-2">
            <Chip active={!mood} onClick={() => setMood(null)}>Surprise me</Chip>
            {Object.entries(MOODS).map(([key, m]) => <Chip key={key} active={mood === key} onClick={() => setMood(key)}>{m.label}</Chip>)}
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-semibold">How much time do you have?</p>
          <div className="flex flex-wrap gap-2">{Object.entries(TIMES).map(([key, t]) => <Chip key={key} active={time === key} onClick={() => setTime(key)}>{t.label}</Chip>)}</div>
        </div>
        {mode === "solo" && (
          <div className="space-y-2">
            <p className="text-sm font-semibold">A look? <span className="font-normal text-slate-500">Colour and light</span></p>
            <div className="flex flex-wrap gap-2">
              <Chip active={!look} onClick={() => setLook(null)}>Any</Chip>
              {Object.entries(LOOKS).map(([key, l]) => <Chip key={key} active={look === key} onClick={() => setLook(key)}>{l.label}</Chip>)}
            </div>
          </div>
        )}
        {catalogue.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-semibold">Your services in {place} <span className="font-normal text-slate-500">{services.length ? `· ${serviceNames}` : "· any"}</span></p>
            <div className="flex flex-wrap gap-2">
              {catalogue.map((p) => (
                <button key={p.provider_id} type="button" onClick={() => toggleService(p.provider_id)} title={p.provider_name} aria-pressed={services.includes(p.provider_id)}
                  className={`rounded-lg p-0.5 ring-2 transition ${services.includes(p.provider_id) ? "ring-indigo-500" : "opacity-50 ring-transparent hover:opacity-100"}`}>
                  <img className="h-9 w-9 rounded-md" alt={p.provider_name} src={`https://image.tmdb.org/t/p/w92${p.logo_path}`} />
                </button>
              ))}
            </div>
          </div>
        )}
        <details className="rounded-xl border border-slate-200 p-3 dark:border-slate-700" open={moreOpen} onToggle={(e) => setMoreOpen(e.currentTarget.open)}>
          <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
            <SlidersHorizontal className="h-4 w-4" /> More filters {activeCount(options) > 0 && <span className="rounded-full bg-indigo-600 px-2 text-xs text-white">{activeCount(options)}</span>}
          </summary>
          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-semibold">Era</p>
              <div className="flex flex-wrap gap-2">
                <Chip active={!options.era} onClick={() => setOption("era", null)}>Any</Chip>
                {Object.entries(ERAS).map(([key, e]) => <Chip key={key} active={options.era === key} onClick={() => setOption("era", key)}>{e.label}</Chip>)}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-semibold">Language</p>
              <div className="flex flex-wrap gap-2">
                <Chip active={!options.language} onClick={() => setOption("language", null)}>Any</Chip>
                {Object.entries(LANGUAGES).map(([key, l]) => <Chip key={key} active={options.language === key} onClick={() => setOption("language", key)}>{l.label}</Chip>)}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-semibold">Rated at least <span className="font-normal text-slate-500">IMDb and Rotten Tomatoes</span></p>
              <div className="flex flex-wrap gap-2">
                <Chip active={!options.minRating} onClick={() => setOption("minRating", null)}>Any</Chip>
                {MIN_RATINGS.map((r) => <Chip key={r} active={options.minRating === r} onClick={() => setOption("minRating", r)}>{r}+</Chip>)}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-semibold">Known or unknown</p>
              <div className="flex flex-wrap gap-2">
                <Chip active={!options.popularity} onClick={() => setOption("popularity", null)}>Any</Chip>
                {Object.entries(POPULARITY).map(([key, p]) => <Chip key={key} active={options.popularity === key} onClick={() => setOption("popularity", key)}>{p.label}</Chip>)}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-semibold">Not tonight</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(AVOIDABLE).map(([id, name]) => {
                  const on = options.avoid.includes(Number(id));
                  return <Chip key={id} active={on} onClick={() => setOption("avoid", on ? options.avoid.filter((g) => g !== Number(id)) : [...options.avoid, Number(id)])}>{on ? "✕ " : ""}{name}</Chip>;
                })}
              </div>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <Toggle checked={options.gentle} onChange={(v) => setOption("gentle", v)}>No horror, thrillers, crime or war</Toggle>
              <Toggle checked={options.rent} onChange={(v) => setOption("rent", v)}>Also films to rent or buy on my services</Toggle>
              {mode === "solo" && <Toggle checked={options.watchlistOnly} onChange={(v) => setOption("watchlistOnly", v)}>Only from my watchlist ({watchlist.length})</Toggle>}
            </div>
            {activeCount(options) > 0 && <button type="button" className="text-xs text-indigo-600 hover:underline" onClick={resetOptions}>Clear filters</button>}
          </div>
        </details>
        {mode === "group" && (
          user ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold">Who is watching with you? <span className="font-normal text-slate-500">Up to three friends</span></p>
              {friends.length ? (
                <div className="flex flex-wrap gap-2">{friends.map((f) => <Chip key={f.id} active={chosen.includes(f.id)} onClick={() => setChosen((c) => c.includes(f.id) ? c.filter((x) => x !== f.id) : c.length < 3 ? [...c, f.id] : c)}>{f.display_name}</Chip>)}</div>
              ) : <p className="text-sm text-slate-500">Movie nights are for mutual friends who share their activity. <Link className="text-indigo-600 hover:underline" to="/friends">Find friends</Link></p>}
            </div>
          ) : <p className="text-sm text-slate-500"><Link className="text-indigo-600 hover:underline" to="/profile">Sign in</Link> to plan a movie night with friends.</p>
        )}
        <button className="account-button" disabled={busy || (mode === "group" && !chosen.length) || (mode === "solo" && options.watchlistOnly && !watchlist.length)} onClick={mode === "solo" ? () => findSolo(false) : startVote}>
          {busy ? "Looking…" : mode === "solo" ? "Find my film" : "Start the vote"}
        </button>
        {mode === "group" && <p className="text-xs text-slate-500">Everyone votes from their own phone. Whoever compromised in your recent movie nights gets a little more say tonight.</p>}
        {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
      </section>

      {picks?.length > 0 && (
        <section className="space-y-4">
          <Hero film={picks[0]} />
          {picks.length > 1 && (
            <>
              <p className="eyebrow">OR</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{picks.slice(1).map((m) => <MovieCard key={m.id} movie={m} />)}</div>
            </>
          )}
          <button type="button" className="account-secondary flex items-center gap-1.5" disabled={busy} onClick={() => findSolo(true)}>
            <RefreshCw className="h-3.5 w-3.5" /> Show me others
          </button>
        </section>
      )}
    </main>
  );
}
