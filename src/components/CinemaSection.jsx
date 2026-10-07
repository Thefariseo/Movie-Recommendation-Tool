import { useEffect, useMemo, useState } from "react";
import { Check, MapPin, Plus, Star, Ticket } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import useWatched from "../hooks/useWatched";
import useWatchlist from "../hooks/useWatchlist";
import { useModal } from "../hooks/useModal";
import { movieDetails, nowPlayingMovies, upcomingInRegion } from "../utils/api";
import { loadTasteSpace } from "../utils/tasteSpace";
import { ratingPredictor } from "../../shared/predict.js";
import { rankForMember } from "../../shared/cinema.js";
import { PosterGridSkeleton } from "./Skeletons";

const poster = (f) => (f?.poster_path ? `https://image.tmdb.org/t/p/w342${f.poster_path}` : "/placeholder_poster.svg");
const stars = (r) => `${Math.round(Number(r)) / 2}★`;
const browserCountry = () => {
  const parts = ((typeof navigator !== "undefined" && navigator.language) || "en-US").split("-");
  return parts.length > 1 ? parts.at(-1).toUpperCase() : { it: "IT", fr: "FR", de: "DE", es: "ES" }[parts[0]] || "US";
};
// A film first released long ago is back in cinemas, not new.
const reissue = (film) => Date.now() - new Date(film.release_date || 0).getTime() > 200 * 86_400_000;
const day = (iso) => (iso ? new Date(iso).toLocaleDateString(document.documentElement.lang || undefined, { day: "numeric", month: "short" }) : null);

function Film({ film, upcoming }) {
  const { open } = useModal();
  const { isInWatchlist, addToWatchlist } = useWatchlist();
  const saved = isInWatchlist(film.id);
  const show = async () => { try { open(await movieDetails(film.id)); } catch { open(film); } };
  const showtimes = `https://www.google.com/search?q=${encodeURIComponent(`${film.title} ${document.documentElement.lang === "it" ? "orari cinema" : "showtimes"}`)}`;
  return (
    <li className="flex flex-col">
      <button type="button" data-film-id={film.id} onClick={show} className="block text-left" aria-label={`Open ${film.title}`}>
        <img src={poster(film)} alt="" loading="lazy" className="w-full object-cover" style={{ aspectRatio: "2 / 3" }} />
        <span className="film-title" translate="no">{film.title}</span>
      </button>
      <span className="mt-1 text-xs text-slate-500">{upcoming ? `Out ${day(film.release_date)}` : reissue(film) ? `Back in cinemas · ${film.release_date.slice(0, 4)}` : `In cinemas since ${day(film.release_date)}`}</span>
      {film.forYou && (
        <span className={`mt-1 inline-flex items-center gap-1 text-xs font-semibold ${film.forYou.basis === "diary" ? "text-indigo-700 dark:text-indigo-300" : "text-slate-500"}`}
          title={film.forYou.basis === "diary" ? "The rating your own diary predicts" : "A rougher guess from the genres and eras you rate highly: this film is too new for your diary to judge"}>
          <Star className={`h-3 w-3 ${film.forYou.basis === "diary" ? "fill-current" : ""}`} />
          {film.forYou.basis === "diary" ? `For you ≈ ${stars(film.forYou.rating)}` : `Your genres ≈ ${stars(film.forYou.rating)}`}
        </span>
      )}
      <span className="mt-auto flex items-center gap-3 pt-2 text-xs">
        {!upcoming && <a href={showtimes} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-slate-600 hover:underline dark:text-slate-300"><MapPin className="h-3 w-3" /> Showtimes</a>}
        <button type="button" data-pop disabled={saved} onClick={() => addToWatchlist(film)} className="ml-auto inline-flex items-center gap-1 text-slate-500 hover:text-indigo-600 disabled:text-emerald-600">
          {saved ? <><Check className="h-3.5 w-3.5" /> Saved</> : <><Plus className="h-3.5 w-3.5" /> Save</>}
        </button>
      </span>
    </li>
  );
}

/**
 * What is in cinemas now in the member's country, and what opens soon, each
 * with the rating their diary predicts (or a rougher guess for films too new
 * for it), best bets first.
 */
export default function CinemaSection() {
  const { profile } = useAuth();
  const { watched } = useWatched();
  const region = profile?.country || browserCountry();
  const [tab, setTab] = useState("now");
  const [lists, setLists] = useState({ now: null, soon: null });
  const [space, setSpace] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => { loadTasteSpace().then(setSpace); }, []);
  useEffect(() => {
    setLists({ now: null, soon: null });
    const pages = (load) => Promise.all([load(region, 1), load(region, 2)]).then((rs) => {
      const seen = new Set();
      return rs.flatMap((r) => r.results || []).filter((f) => !seen.has(f.id) && seen.add(f.id));
    });
    const today = new Date().toISOString().slice(0, 10);
    Promise.all([pages(nowPlayingMovies), pages(upcomingInRegion)])
      .then(([now, soon]) => setLists({ now, soon: soon.filter((f) => (f.release_date || "") > today) }))
      .catch(() => setError("Cinema listings could not be loaded. Please try again."));
  }, [region]);

  const ranked = useMemo(() => {
    const predictor = space && watched.some((f) => Number(f.rated) > 0) ? ratingPredictor(space, watched) : null;
    const rank = (films) => (films ? rankForMember(films, watched, predictor ? (id) => predictor.predict(id) : null) : null);
    return { now: rank(lists.now), soon: rank(lists.soon) };
  }, [lists, space, watched]);
  const films = ranked[tab];

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="section-title flex items-center gap-2"><Ticket className="h-5 w-5" /> {tab === "now" ? "In cinemas now" : "Coming to cinemas"}</h2>
          <p className="mt-1 text-sm text-slate-500">{`Showing in ${new Intl.DisplayNames([document.documentElement.lang || "en"], { type: "region" }).of(region) || region}, best bets for your taste first.`}</p>
        </div>
        <div className="flex gap-2" role="radiogroup" aria-label="When">
          {[["now", "Now showing"], ["soon", "Coming soon"]].map(([key, label]) => (
            <button key={key} role="radio" aria-checked={tab === key} onClick={() => setTab(key)} className={tab === key ? "account-button" : "account-secondary"}>{label}</button>
          ))}
        </div>
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      {!films && !error && <PosterGridSkeleton className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4 lg:grid-cols-6" />}
      {films && !films.length && <p className="text-sm text-slate-500">Nothing listed here right now.</p>}
      {films && films.length > 0 && (
        <ul className="stagger grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4 lg:grid-cols-6">
          {films.map((f) => <Film key={f.id} film={f} upcoming={tab === "soon"} />)}
        </ul>
      )}
      {films && !watched.some((f) => Number(f.rated) > 0) && <p className="text-xs text-slate-500">Rate a few films you have seen and these will be ranked for your taste.</p>}
    </section>
  );
}
