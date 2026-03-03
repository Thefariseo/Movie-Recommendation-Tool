// =====================================================
// WatchedCard – poster tile for the watched catalogue.
// Shows hover overlay, star rating and delete button.
// =====================================================
import React from "react";
import { Trash2 } from "lucide-react";
import useWatched from "@/hooks/useWatched";
import StarRating from "./StarRating";
import { useToast } from "@/contexts/ToastContext";
import { useModal } from "@/hooks/useModal";

export default function WatchedCard({ movie }) {
  const { removeWatched, updateRating } = useWatched();
  const { addToast } = useToast();
  const { open } = useModal();

  const handleRating = (rating) => {
    updateRating(movie.id, rating);
    addToast("Rating saved ✓");
  };

  // Build a minimal movie object compatible with MovieModal
  const movieForModal = {
    id: movie.id,
    title: movie.title,
    poster_path: movie.poster ?? null,
    genre_ids: movie.genres ?? [],
    release_date: movie.year ? `${movie.year}-01-01` : "",
    vote_average: 0,
  };

  return (
    <div className="group flex flex-col gap-1">
      {/* Poster area */}
      <div
        className="relative cursor-pointer overflow-hidden rounded-lg shadow"
        onClick={() => open(movieForModal)}
      >
        <img
          src={
            movie.poster
              ? `https://image.tmdb.org/t/p/w342${movie.poster}`
              : "/placeholder_poster.svg"
          }
          alt={movie.title}
          className="w-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />

        {/* Hover overlay with title */}
        <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/70 via-transparent to-transparent p-2 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <p className="line-clamp-2 text-xs font-medium text-white">
            {movie.title}
          </p>
        </div>

        {/* Delete button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            removeWatched(movie.id);
          }}
          className="absolute right-1 top-1 rounded-full bg-white/90 p-1 shadow opacity-0 transition-opacity group-hover:opacity-100 hover:bg-white"
          aria-label="Remove"
        >
          <Trash2 className="h-3.5 w-3.5 text-red-600" />
        </button>
      </div>

      {/* Star rating */}
      <div className="flex justify-center">
        <StarRating value={movie.rated} onChange={handleRating} size="md" />
      </div>
    </div>
  );
}
