// =====================================================
// File: MovieCard.jsx
// Movie tile with hover overlay, rating badge, watchlist toggle.
// + Genre-based glow shadow on hover (v7)
// =====================================================
import React from "react";
import { useModal } from "@/hooks/useModal";
import { motion } from "framer-motion";
import { Plus, Check } from "lucide-react";
import useWatchlist from "../hooks/useWatchlist";
import { useToast } from "@/contexts/ToastContext";

/* Genre ID → glow color (rgba) */
const GENRE_GLOW = {
  28:    "rgba(249,115,22,0.55)",   // Action → orange
  12:    "rgba(234,179,8,0.45)",    // Adventure → yellow
  16:    "rgba(132,204,22,0.40)",   // Animation → lime
  35:    "rgba(250,204,21,0.40)",   // Comedy → yellow
  80:    "rgba(168,85,247,0.50)",   // Crime → purple
  99:    "rgba(20,184,166,0.40)",   // Documentary → teal
  18:    "rgba(139,92,246,0.48)",   // Drama → violet
  10751: "rgba(74,222,128,0.40)",   // Family → green
  14:    "rgba(249,115,22,0.40)",   // Fantasy → orange
  36:    "rgba(251,191,36,0.40)",   // History → amber
  27:    "rgba(220,38,38,0.60)",    // Horror → red
  10402: "rgba(6,182,212,0.40)",    // Music → cyan
  9648:  "rgba(99,102,241,0.50)",   // Mystery → indigo
  10749: "rgba(244,114,182,0.55)",  // Romance → pink
  878:   "rgba(6,182,212,0.55)",    // Sci-Fi → cyan
  10770: "rgba(168,85,247,0.40)",   // TV Movie → purple
  53:    "rgba(107,114,128,0.50)",  // Thriller → slate
  10752: "rgba(75,85,99,0.50)",     // War → gray
  37:    "rgba(180,83,9,0.50)",     // Western → brown
};

const DEFAULT_GLOW = "rgba(99,102,241,0.35)"; // indigo fallback

export default function MovieCard({ movie, showActions = true }) {
  const { isInWatchlist, addToWatchlist, removeFromWatchlist } = useWatchlist();
  const { open } = useModal();
  const { addToast } = useToast();
  const inList = isInWatchlist(movie.id);

  // Primary genre for glow
  const primaryGenreId =
    (movie.genre_ids && movie.genre_ids[0]) ||
    (movie.genres && movie.genres[0]?.id) ||
    null;
  const glowColor = GENRE_GLOW[primaryGenreId] || DEFAULT_GLOW;

  const handleWatchlistClick = (e) => {
    e.stopPropagation();
    if (inList) {
      removeFromWatchlist(movie.id);
      addToast("Removed from Watchlist", "info");
    } else {
      addToWatchlist(movie);
      addToast("Added to Watchlist ✓");
    }
  };

  return (
    <motion.div
      whileHover={{
        scale: 1.05,
        boxShadow: `0 0 22px 5px ${glowColor}`,
        transition: { duration: 0.22 },
      }}
      onClick={() => open(movie)}
      className="relative cursor-pointer overflow-hidden rounded-xl shadow-md"
    >
      {/* Poster */}
      <img
        src={
          movie.poster_path
            ? `https://image.tmdb.org/t/p/w185${movie.poster_path}`
            : "/placeholder_poster.svg"
        }
        alt={movie.title}
        className="h-full w-full object-cover object-top"
        loading="lazy"
      />

      {/* TMDB rating badge */}
      {movie.vote_average > 0 && (
        <span className="absolute left-2 top-2 rounded-md bg-black/70 px-1.5 py-0.5 text-xs font-bold text-amber-400">
          ★ {movie.vote_average.toFixed(1)}
        </span>
      )}

      {/* Always-visible title strip */}
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/85 via-black/50 to-transparent px-2 pb-2 pt-6">
        <h3 className="line-clamp-2 text-[11px] font-semibold leading-tight text-white sm:text-xs">
          {movie.title}
        </h3>
      </div>

      {/* Hover: watchlist button */}
      {showActions && (
        <motion.div
          initial={{ opacity: 0 }}
          whileHover={{ opacity: 1 }}
          className="absolute inset-0 flex items-end justify-end p-2"
        >
          <button
            onClick={handleWatchlistClick}
            className="flex items-center gap-1 rounded-lg bg-indigo-600 px-2 py-1 text-[11px] font-medium text-white shadow hover:bg-indigo-500"
          >
            {inList ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            {inList ? "Added" : "+List"}
          </button>
        </motion.div>
      )}
    </motion.div>
  );
}
