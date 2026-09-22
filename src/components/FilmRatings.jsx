import React from "react";
import { useFilmRating } from "@/utils/ratings";

// IMDb and Rotten Tomatoes, the reference marks for a film. Nothing is shown
// until a real figure is known: TMDB's average in their place would mislead.
export default function FilmRatings({ movieId, className = "" }) {
  const rating = useFilmRating(movieId);
  if (!rating || (rating.imdb == null && rating.rt == null)) return null;
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      {rating.imdb != null && (
        <span
          title={`IMDb ${rating.imdb.toFixed(1)}/10${rating.imdbVotes ? ` from ${rating.imdbVotes.toLocaleString("en-US")} ratings` : ""}`}
          aria-label={`IMDb rating ${rating.imdb.toFixed(1)} out of 10`}
        >
          <span className="font-black tracking-tight text-[#f5c518]">IMDb</span>{" "}
          {rating.imdb.toFixed(1)}
        </span>
      )}
      {rating.rt != null && (
        <span
          title="Rotten Tomatoes: share of positive critic reviews"
          aria-label={`Rotten Tomatoes ${rating.rt} percent`}
        >
          <span aria-hidden="true">🍅</span> {rating.rt}%
        </span>
      )}
    </span>
  );
}
