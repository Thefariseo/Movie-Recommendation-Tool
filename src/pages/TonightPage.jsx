import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Moon, Users, User, Clock } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import useWatched from "../hooks/useWatched";
import useWatchlist from "../hooks/useWatchlist";
import { useModal } from "../hooks/useModal";
import { backend } from "../utils/backend";
import { watchProviderList } from "../utils/api";
import { tonightPicks } from "../algorithms/tonight";
import { MOODS, TIMES } from "../../shared/tonight.js";
import { LOOKS } from "../../shared/visual.js";
import MovieCard from "../components/MovieCard";

const SERVICES_KEY = "umbrify_services_v1";
const readServices = () => {
  try { return JSON.parse(localStorage.getItem(SERVICES_KEY) || "[]"); } catch { return []; }
};
const saveServices = (ids) => {
  try { localStorage.setItem(SERVICES_KEY, JSON.stringify(ids)); } catch { /* storage may be blocked */ }
};
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
          <span className="flex items-center gap-2 text-xs text-slate-500">Streaming on
            {film.providers.map((p) => <img key={p.provider_id} className="h-6 w-6 rounded" alt={p.provider_name} title={p.provider_name} src={`https://image.tmdb.org/t/p/w92${p.logo_path}`} />)}
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
  const findSolo = async () => {
    setBusy(true);
    setError("");
    setPicks(null);
    try {
      const found = await tonightPicks({ watched, watchlist, mood, time, look, providers: services, region: place });
      setPicks(found);
      if (!found.length) setError(services.length ? "Nothing on your services fits tonight. Try another mood, more time or more services." : "Nothing fits tonight. Try another mood or more time.");
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
      const { night } = await backend("tonight", { action: "create", members: chosen, mood, time, providers: services, region: place });
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
        <button className="account-button" disabled={busy || (mode === "group" && !chosen.length)} onClick={mode === "solo" ? findSolo : startVote}>
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
        </section>
      )}
    </main>
  );
}
