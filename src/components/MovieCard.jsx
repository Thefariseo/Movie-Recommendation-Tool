import React from "react";
import FilmRatings from "./FilmRatings";
import { Plus, Check } from "lucide-react";
import { useModal } from "@/hooks/useModal";
import useWatchlist from "../hooks/useWatchlist";
import { useToast } from "@/contexts/ToastContext";
export default function MovieCard({ movie, showActions = true }) {
  const { isInWatchlist, addToWatchlist, removeFromWatchlist } = useWatchlist();
  const { open } = useModal(),
    { addToast } = useToast();
  const saved = isInWatchlist(movie.id);
  const toggle = async () => {
    if (saved) {
      if (!(await removeFromWatchlist(movie.id))) return;
      addToast("Removed from Watchlist", "info");
    } else {
      if (!(await addToWatchlist(movie))) return;
      addToast("Added to Watchlist");
    }
  };
  return (
    <article className="film-card">
      <button
        className="film-open"
        onClick={() => open(movie)}
        aria-label={`View ${movie.title}`}
      >
        <span className="film-poster">
          <img
            loading="lazy"
            src={
              movie.poster_path
                ? `https://image.tmdb.org/t/p/w342${movie.poster_path}`
                : "/placeholder_poster.svg"
            }
            alt=""
          />
          <FilmRatings movieId={movie.id} className="film-rating" />
        </span>
        <span className="film-title">{movie.title}</span>
        <span className="film-year">
          {movie.release_date?.slice(0, 4) || movie.year || "Year unavailable"}
        </span>
      </button>
      {showActions && (
        <button
          className={`film-save ${saved ? "film-saved" : ""}`}
          onClick={toggle}
          aria-pressed={saved}
          aria-label={`${saved ? "Remove" : "Save"} ${movie.title} ${saved ? "from" : "to"} watchlist`}
          title={saved ? "Remove from watchlist" : "Save to watchlist"}
        >
          {saved ? <Check size={17} /> : <Plus size={17} />}
        </button>
      )}
    </article>
  );
}
