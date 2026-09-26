import React from "react";
import { Check, Compass, EyeOff, Gem, Heart, Info, Plus, Sparkles, Users } from "lucide-react";
import MovieCard from "./MovieCard";
import FilmRatings from "./FilmRatings";
import { useModal } from "../hooks/useModal";
import useWatchlist from "../hooks/useWatchlist";
import { useToast } from "../contexts/ToastContext";
import { dismissFilm } from "../utils/signals";
import { stars } from "../../shared/evidence.js";

// What each place of the slate is for, and how it looks.
const ROLES = {
  top: { icon: Sparkles, tone: "bg-indigo-600 text-white" },
  because: { icon: Heart, tone: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200" },
  circle: { icon: Users, tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200" },
  territory: { icon: Compass, tone: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100" },
  gem: { icon: Gem, tone: "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-200" },
};

function Role({ role }) {
  if (!role) return null;
  const { icon: Icon, tone } = ROLES[role.kind] || ROLES.top;
  return (
    <span className={`inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>
      <Icon className="h-3 w-3 shrink-0" /><span className="truncate">{role.label}</span>
    </span>
  );
}

const Predicted = ({ value, className = "" }) => (value ? <span className={`text-[11px] font-semibold text-indigo-600 dark:text-indigo-300 ${className}`} title="The rating your own diary predicts: how you rated the films most like it">For you ≈ {stars(value)}</span> : null);

// The top match, large: backdrop, poster, why, and what to do with it.
function Hero({ movie }) {
  const { open } = useModal();
  const { isInWatchlist, addToWatchlist, removeFromWatchlist } = useWatchlist();
  const { addToast } = useToast();
  const saved = isInWatchlist(movie.id);
  const backdrop = movie.backdrop_path ? `https://image.tmdb.org/t/p/w1280${movie.backdrop_path}` : null;
  const toggle = async () => {
    if (saved) { if (await removeFromWatchlist(movie.id)) addToast("Removed from Watchlist", "info"); }
    else if (await addToWatchlist(movie)) addToast("Added to Watchlist");
  };
  return (
    <article className="relative overflow-hidden rounded-2xl bg-slate-900 text-white shadow-lg">
      {backdrop && <img src={backdrop} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />}
      <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/85 to-slate-950/30" />
      <div className="relative flex items-start gap-4 p-4 sm:gap-5 sm:p-7">
        <button type="button" onClick={() => open(movie)} className="w-24 shrink-0 sm:w-40" aria-label={`View ${movie.title}`}>
          <img className="w-full rounded-xl shadow-2xl ring-1 ring-white/20" style={{ aspectRatio: "2 / 3" }} alt=""
            src={movie.poster_path ? `https://image.tmdb.org/t/p/w342${movie.poster_path}` : "/placeholder_poster.svg"} />
        </button>
        <div className="min-w-0 flex-1 space-y-3">
          <Role role={movie._role || { kind: "top", label: "Your top match" }} />
          <div>
            <h3 className="text-2xl font-bold leading-tight sm:text-3xl" style={{ color: "#fff" }}>{movie.title}</h3>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-slate-300">
              <span>{movie.release_date?.slice(0, 4)}</span>
              <FilmRatings movieId={movie.id} className="font-semibold text-slate-100" />
              {movie._predicted && <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs font-semibold text-white">For you ≈ {stars(movie._predicted)}</span>}
            </p>
          </div>
          {(movie._reasonDetail || movie._reason) && <p className="max-w-2xl text-sm leading-relaxed text-slate-200 line-clamp-4">{movie._reasonDetail || movie._reason}</p>}
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" onClick={() => open(movie)} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100"><Info className="h-4 w-4" /> Why, and the trailer</button>
            <button type="button" onClick={toggle} className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-2 text-sm font-semibold hover:bg-white/25">{saved ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {saved ? "On your watchlist" : "Watchlist"}</button>
            <button type="button" onClick={() => { dismissFilm(movie); addToast("Got it — we won't suggest it again", "info"); }} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/10"><EyeOff className="h-4 w-4" /> Not for me</button>
          </div>
        </div>
      </div>
    </article>
  );
}

/**
 * The first picks: the top match large, then the others, each with the job
 * it does in the slate (another side of your taste, your circle, a new
 * territory, a hidden gem), the rating your diary predicts, and why.
 */
export default function PicksShowcase({ movies }) {
  if (!movies.length) return null;
  const [first, ...rest] = movies;
  return (
    <div className="space-y-5">
      <Hero movie={first} />
      {rest.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {rest.map((m) => (
            <div key={m.id} className="min-w-0 space-y-1.5">
              <MovieCard movie={m} dismissable />
              <Role role={m._role} />
              <Predicted value={m._predicted} className="block" />
              {m._reason && <p className="text-xs leading-snug text-slate-500">{m._reason}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
