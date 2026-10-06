import React from "react";
import useWatched from "@/hooks/useWatched";
import { useToast } from "../contexts/ToastContext";
import StarRating from "./StarRating";

// What a rating says, in words, under the stars.
const feeling = (r) => (r >= 9 ? "You loved it" : r >= 7 ? "You liked it" : r >= 5 ? "It was so-so" : "Not for you");

/**
 * Rating a film is one tap: a star puts it in the diary with that rating,
 * or changes the rating of a film already there. Seen without a rating, and
 * taking it out of the diary, are a smaller step aside.
 */
export default function RateFilm({ movie, details }) {
  const { isWatched, addWatched, removeWatched, updateRating, watched } = useWatched();
  const { addToast } = useToast();
  const seen = isWatched(movie.id);
  const rated = Number(watched.find((m) => m.id === movie.id)?.rated) || 0;

  const entry = (rating) => ({
    id: movie.id,
    title: details?.title || movie.title,
    poster: movie.poster_path ?? details?.poster_path ?? null,
    genres: movie.genre_ids ?? details?.genres?.map((g) => g.id) ?? [],
    year: parseInt((movie.release_date || details?.release_date || "").slice(0, 4), 10) || null,
    ...(rating ? { rated: rating } : {}),
  });
  const rate = async (rating) => {
    if (!seen) {
      if (!await addWatched(entry(rating))) return;
      addToast(rating ? `In your diary: ${rating / 2}/5 ✓` : "Marked as Watched ✓");
      return;
    }
    if (!await updateRating(movie.id, rating)) return;
    addToast(rating ? `Rating saved: ${rating / 2}/5 ✓` : "Rating removed", rating ? "success" : "info");
  };
  const markOnly = async () => { if (await addWatched(entry(0))) addToast("Marked as Watched ✓"); };
  const unwatch = async () => { if (await removeWatched(movie.id)) addToast("Removed from Watched", "info"); };

  return (
    <section aria-label="Your rating" className={`mt-5 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border p-4 ${rated ? "border-amber-200 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-950/20" : "border-slate-200 dark:border-slate-700"}`}>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-slate-900 dark:text-slate-50">
          {rated ? feeling(rated) : seen ? "You have seen it: how was it?" : "Seen it? Rate it"}
        </p>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          {rated ? "Tap another star to change it. Your ratings shape every pick."
            : seen ? "One tap on the stars: your ratings shape every pick."
              : "One tap on a star puts it in your diary with your rating."}
        </p>
      </div>
      <StarRating value={rated} onChange={rate} size="xl" />
      <div className="w-full text-xs text-slate-500 sm:w-auto">
        {seen
          ? <button type="button" onClick={unwatch} className="underline-offset-2 hover:underline">Remove from watched</button>
          : <button type="button" onClick={markOnly} className="underline-offset-2 hover:underline">Seen it, no rating</button>}
      </div>
    </section>
  );
}
