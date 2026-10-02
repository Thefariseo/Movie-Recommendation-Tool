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

  const handleRating = async (rating) => {
    if (!await updateRating(movie.id, rating)) return;
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
    <div className="group flex min-w-0 flex-col gap-1.5">
      {/* Poster area */}
      <div className="relative overflow-hidden rounded-lg shadow">
        <button type="button" onClick={() => open(movieForModal)} className="block w-full" aria-label={`View ${movie.title}`}>
          <img
            src={
              movie.poster
                ? `https://image.tmdb.org/t/p/w342${movie.poster}`
                : "/placeholder_poster.svg"
            }
            alt=""
            className="w-full object-cover transition-transform duration-300 group-hover:scale-105"
            style={{ aspectRatio: "2 / 3" }}
            loading="lazy"
            decoding="async"
          />
        </button>

        {/* Delete button: on hover with a mouse, always reachable by keyboard and touch */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            removeWatched(movie.id);
          }}
          className="absolute right-1 top-1 rounded-full bg-white/90 p-1 shadow transition-opacity hover:bg-white focus:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
          aria-label={`Remove ${movie.title} from watched`}
          title="Remove from watched"
        >
          <Trash2 className="h-3.5 w-3.5 text-red-600" />
        </button>
      </div>

      <div className="min-w-0 px-0.5">
        <p className="truncate text-xs font-semibold leading-tight text-slate-800 dark:text-slate-100" title={movie.title}>{movie.title}</p>
        {movie.year && <p className="text-[11px] text-slate-500">{movie.year}</p>}
      </div>
      <StarRating value={movie.rated} onChange={handleRating} size="sm" />
    </div>
  );
}
