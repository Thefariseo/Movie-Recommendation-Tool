// One film's IMDb and Rotten Tomatoes ratings for display (src/utils/ratings.js).
import { useEffect, useState } from "react";
import { knownRating, watchRating } from "../utils/ratings";

export function useFilmRating(id) {
  const [, redraw] = useState(0);
  useEffect(() => watchRating(id, () => redraw((n) => n + 1)), [id]);
  return knownRating(id);
}
