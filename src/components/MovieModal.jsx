// =====================================================
// MovieModal – cinematic full-detail sheet
// Trailer: thumbnail lazy-embed (no autoplay issues)
// =====================================================
import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  Plus,
  Eye,
  EyeOff,
  ExternalLink,
  Clock,
  Play,
  X,
  Star,
  Sparkles,
  Tv,
} from "lucide-react";
import useWatchlist from "@/hooks/useWatchlist";
import useWatched from "@/hooks/useWatched";
import { externalIds, rottenScore, movieDetails, movieWatchProviders } from "@/utils/api";
import StarRating from "./StarRating";
import { useToast } from "@/contexts/ToastContext";

/* Detect user's country for watch providers */
function detectCountry() {
  const lang = (typeof navigator !== "undefined" && navigator.language) || "en-US";
  const parts = lang.split("-");
  if (parts.length > 1) return parts[parts.length - 1].toUpperCase();
  const map = { it: "IT", fr: "FR", de: "DE", es: "ES", pt: "BR", ja: "JP", ko: "KR", zh: "CN" };
  return map[parts[0]] || "US";
}

export default function MovieModal({ movie, onClose }) {
  const { isInWatchlist, addToWatchlist, removeFromWatchlist } = useWatchlist();
  const { isWatched, addWatched, removeWatched, updateRating, watched } = useWatched();
  const { addToast } = useToast();

  const inWatchlist    = isInWatchlist(movie.id);
  const alreadyWatched = isWatched(movie.id);
  const watchedEntry   = watched.find((m) => m.id === movie.id);

  /* ---- External IDs + Rotten Tomatoes ---- */
  const [imdbID,    setImdbID]    = useState(null);
  const [tomato,    setTomato]    = useState(null);
  const [providers, setProviders] = useState(null); // { flatrate, rent, buy }

  useEffect(() => {
    setImdbID(null);
    setTomato(null);
    setProviders(null);

    externalIds(movie.id).then((ids) => {
      if (ids?.imdb_id) {
        setImdbID(ids.imdb_id);
        rottenScore(ids.imdb_id).then(setTomato);
      }
    });

    // Fetch streaming providers for this film
    const country = detectCountry();
    movieWatchProviders(movie.id, country)
      .then(setProviders)
      .catch(() => {});
  }, [movie.id]);

  /* ---- Full details + trailer ---- */
  const [details, setDetails]           = useState(null);
  const [trailerKey, setTrailerKey]     = useState(null);
  // trailerState: "thumb" | "player"
  const [trailerState, setTrailerState] = useState("thumb");

  const findTrailer = (videos) =>
    videos?.results?.find(
      (v) => v.site === "YouTube" && (v.type === "Trailer" || v.type === "Teaser")
    );

  useEffect(() => {
    setTrailerKey(null);
    setTrailerState("thumb");

    if (movie.credits && movie.videos) {
      setDetails(movie);
      const t = findTrailer(movie.videos);
      if (t) setTrailerKey(t.key);
    } else {
      movieDetails(movie.id)
        .then((d) => {
          setDetails(d);
          const t = findTrailer(d.videos);
          if (t) setTrailerKey(t.key);
        })
        .catch(() => {});
    }
  }, [movie.id]);

  /* ---- Actions ---- */
  const toggleWatchlist = () => {
    if (inWatchlist) {
      removeFromWatchlist(movie.id);
      addToast("Removed from Watchlist", "info");
    } else {
      addToWatchlist(movie);
      addToast("Added to Watchlist ✓");
    }
  };

  const toggleWatched = () => {
    if (alreadyWatched) {
      removeWatched(movie.id);
      addToast("Removed from Watched", "info");
    } else {
      addWatched({
        id:     movie.id,
        title:  movie.title,
        poster: movie.poster_path ?? null,
        genres: movie.genre_ids ?? details?.genres?.map((g) => g.id) ?? [],
        year:   parseInt((movie.release_date || details?.release_date || "").slice(0, 4), 10) || null,
      });
      addToast("Marked as Watched ✓");
    }
  };

  const handleRating = (rating) => {
    updateRating(movie.id, rating);
    addToast(`Rating saved: ${rating / 2}/5 ✓`);
  };

  /* ---- Derived ---- */
  const genres   = details?.genres ?? [];
  const director = details?.credits?.crew?.find((p) => p.job === "Director");
  const cast     = details?.credits?.cast?.slice(0, 6) ?? [];
  const runtime  = details?.runtime;
  const year     = (movie.release_date || details?.release_date || "").slice(0, 4);
  const reason   = movie._reason;

  /* ---- CinemaAtlas deep-link ---- */
  const cinematlasUrl = `https://www.cinematlas.it/?s=${encodeURIComponent(movie.title)}`;

  /* ---- YouTube thumbnail URLs ---- */
  const thumbHq  = trailerKey ? `https://img.youtube.com/vi/${trailerKey}/hqdefault.jpg`  : null;
  const thumbMax = trailerKey ? `https://img.youtube.com/vi/${trailerKey}/maxresdefault.jpg` : null;

  /* ---- Trailer section: shows when player active ---- */
  const showingTrailer = trailerState === "player" && trailerKey;

  return (
    <motion.div
      key="modal"
      initial={{ scale: 0.94, opacity: 0, y: 24 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      exit={{ scale: 0.94, opacity: 0, y: 24 }}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
      onClick={(e) => e.stopPropagation()}
      className="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900"
    >
      {/* ── Trailer player (lazy-embed: only mounted when user clicks play) ── */}
      <AnimatePresence>
        {showingTrailer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative aspect-video bg-black"
          >
            {/* iframe created on user click — browser permits autoplay in this case */}
            <iframe
              className="absolute inset-0 h-full w-full"
              src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              title={`${movie.title} — Trailer`}
            />
            <button
              onClick={() => setTrailerState("thumb")}
              className="absolute right-3 top-3 z-10 rounded-full bg-black/70 p-1.5 text-white backdrop-blur hover:bg-black"
            >
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Cinematic backdrop (hidden while trailer plays) ── */}
      {!showingTrailer && (
        <div className="relative h-52 overflow-hidden sm:h-64 md:h-72">
          {movie.backdrop_path ? (
            <img
              src={`https://image.tmdb.org/t/p/w1280${movie.backdrop_path}`}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-slate-700 to-slate-900" />
          )}

          {/* Bottom fade */}
          <div className="absolute inset-0 bg-gradient-to-t from-white via-white/10 to-transparent dark:from-slate-900 dark:via-slate-900/20" />

          {/* ── Trailer thumbnail + play button ──
               Clicking this button creates the iframe (direct user gesture → autoplay allowed) */}
          {trailerKey && (
            <button
              onClick={() => setTrailerState("player")}
              className="absolute inset-0 flex items-center justify-center group"
              aria-label="Watch Trailer"
            >
              {/* Semi-transparent thumbnail overlay for "preview" feel */}
              {thumbMax && (
                <img
                  src={thumbMax}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover opacity-0 group-hover:opacity-20 transition-opacity duration-300"
                  onError={(e) => { if (thumbHq) e.target.src = thumbHq; }}
                />
              )}
              <span className="relative flex items-center gap-2 rounded-full bg-black/55 px-5 py-2.5 text-sm font-medium text-white backdrop-blur-sm transition-all group-hover:bg-black/75 group-hover:scale-105">
                <Play className="h-4 w-4 fill-white" />
                Watch Trailer
              </span>
            </button>
          )}

          {/* Reason chip */}
          {reason && (
            <div className="absolute left-4 top-4">
              <span className="rounded-full bg-indigo-600/90 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm shadow">
                {reason}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Scrollable body ── */}
      <div className="max-h-[62vh] overflow-y-auto px-6 pb-8 pt-4">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-3 z-20 rounded-full bg-white/85 p-1.5 text-slate-500 shadow backdrop-blur transition-colors hover:text-slate-900 dark:bg-slate-800/85 dark:text-slate-400 dark:hover:text-slate-100"
        >
          <X className="h-4 w-4" />
        </button>

        {/* ── Poster + Title row ── */}
        <div className="flex gap-5">
          <img
            src={
              movie.poster_path
                ? `https://image.tmdb.org/t/p/w185${movie.poster_path}`
                : "/placeholder_poster.svg"
            }
            alt={movie.title}
            className="-mt-16 w-28 shrink-0 rounded-xl shadow-xl ring-2 ring-white dark:ring-slate-800 sm:w-32"
          />
          <div className="min-w-0 flex-1 pt-1">
            <h2 className="text-xl font-bold leading-tight text-slate-900 dark:text-slate-50 sm:text-2xl">
              {movie.title}
            </h2>

            {/* Meta row */}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              {year && <span className="font-medium">{year}</span>}
              {runtime && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {runtime} min
                </span>
              )}
              {movie.vote_average > 0 && (
                <span className="flex items-center gap-1 font-semibold text-amber-500">
                  <Star className="h-3 w-3 fill-amber-500" />
                  {movie.vote_average.toFixed(1)}
                </span>
              )}
              {tomato && <span className="text-red-500">🍅 {tomato}</span>}
            </div>

            {/* Director */}
            {director && (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Dir.{" "}
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {director.name}
                </span>
              </p>
            )}

            {/* Genre tags */}
            {genres.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {genres.map((g) => (
                  <span
                    key={g.id}
                    className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  >
                    {g.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── CineSuggest narrative — only shown for recommendations ── */}
        {movie._narrative && (
          <div className="mt-5 rounded-xl border border-indigo-100 bg-indigo-50/70 p-4 dark:border-indigo-900/40 dark:bg-indigo-950/30">
            <div className="mb-2 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
              <p className="text-[10px] font-semibold uppercase tracking-widest text-indigo-500 dark:text-indigo-400">
                Why this was picked for you
              </p>
            </div>
            <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              {movie._narrative}
            </p>
          </div>
        )}

        {/* ── Overview ── */}
        {movie.overview && (
          <p className="mt-5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            {movie.overview}
          </p>
        )}

        {/* ── Cast ── */}
        {cast.length > 0 && (
          <div className="mt-5">
            <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              Cast
            </p>
            <div className="flex gap-4 overflow-x-auto pb-1 scrollbar-hide">
              {cast.map((a) => (
                <div key={a.id} className="w-14 shrink-0 text-center">
                  <img
                    src={
                      a.profile_path
                        ? `https://image.tmdb.org/t/p/w92${a.profile_path}`
                        : "/placeholder_poster.svg"
                    }
                    alt={a.name}
                    className="h-14 w-14 rounded-full object-cover ring-2 ring-slate-100 dark:ring-slate-700"
                  />
                  <p className="mt-1 line-clamp-2 text-[10px] leading-tight text-slate-500 dark:text-slate-400">
                    {a.name}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── User rating (only when watched) ── */}
        {alreadyWatched && (
          <div className="mt-5 flex items-center gap-3">
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
              Your rating
            </span>
            <StarRating value={watchedEntry?.rated} onChange={handleRating} size="md" />
          </div>
        )}

        {/* ── Action buttons ── */}
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            onClick={toggleWatched}
            className="btn-primary flex items-center gap-1.5 text-sm"
          >
            {alreadyWatched ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            {alreadyWatched ? "Watched ✓" : "Mark as Watched"}
          </button>

          <button
            onClick={toggleWatchlist}
            className="btn-secondary flex items-center gap-1.5 text-sm"
          >
            {inWatchlist ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {inWatchlist ? "In Watchlist" : "+ Watchlist"}
          </button>

          {trailerKey && trailerState !== "player" && (
            <button
              onClick={() => setTrailerState("player")}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-red-600 ring-1 ring-red-200 transition-colors hover:bg-red-50 dark:ring-red-900 dark:hover:bg-red-900/20"
            >
              <Play className="h-4 w-4" /> Trailer
            </button>
          )}
        </div>

        {/* ── Streaming providers ── */}
        {providers?.flatrate?.length > 0 && (
          <div className="mt-5">
            <p className="mb-2.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              <Tv className="h-3.5 w-3.5" />
              Where to stream
            </p>
            <div className="flex flex-wrap gap-2">
              {providers.flatrate.map((p) => (
                <div
                  key={p.provider_id}
                  className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 dark:bg-slate-800"
                >
                  <img
                    src={`https://image.tmdb.org/t/p/w45${p.logo_path}`}
                    alt={p.provider_name}
                    className="h-5 w-5 rounded-md object-cover"
                  />
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    {p.provider_name}
                  </span>
                </div>
              ))}
            </div>
            {providers?.rent?.length > 0 && (
              <p className="mt-1.5 text-[10px] text-slate-400">
                Also available to rent on {providers.rent.map((p) => p.provider_name).slice(0, 3).join(", ")}.
              </p>
            )}
          </div>
        )}

        <hr className="my-5 border-slate-100 dark:border-slate-800" />

        {/* ── External links ── */}
        <div className="flex flex-wrap gap-5 text-xs">
          <a
            href={`https://www.themoviedb.org/movie/${movie.id}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-slate-500 transition-colors hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-300"
          >
            TMDB <ExternalLink className="h-3 w-3" />
          </a>
          {imdbID && (
            <a
              href={`https://www.imdb.com/title/${imdbID}/`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-slate-500 transition-colors hover:text-amber-500 dark:text-slate-400 dark:hover:text-amber-400"
            >
              IMDb <ExternalLink className="h-3 w-3" />
            </a>
          )}
          <a
            href={cinematlasUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-slate-500 transition-colors hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-300"
          >
            Cinematlas <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </motion.div>
  );
}
