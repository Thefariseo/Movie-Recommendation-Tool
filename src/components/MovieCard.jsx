// =====================================================
// File: MovieCard.jsx
// Description: Movie tile with hover overlay, rating badge, and watchlist toggle.
// =====================================================
import React from "react";
import { useModal } from "@/hooks/useModal";
import { motion } from "framer-motion";
import { Plus, Check } from "lucide-react";
import useWatchlist from "../hooks/useWatchlist";
import { useToast } from "@/contexts/ToastContext";

export default function MovieCard({ movie, showActions = true }) {
  const { isInWatchlist, addToWatchlist, removeFromWatchlist } = useWatchlist();
  const { open } = useModal();
  const { addToast } = useToast();
  const inList = isInWatchlist(movie.id);

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
      whileHover={{ scale: 1.04 }}
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
