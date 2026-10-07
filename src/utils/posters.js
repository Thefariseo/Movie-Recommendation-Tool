// A few films' basic details (poster, title in the interface language), for
// the pictures that show what a page does.
import { useEffect, useState } from "react";
import { movieBasic } from "./api";

/** id -> basic details, filled in as they arrive. */
export function usePosters(ids) {
  const [films, setFilms] = useState({});
  const key = ids.join(",");
  useEffect(() => {
    let alive = true;
    Promise.allSettled(ids.map((id) => movieBasic(id))).then((rs) => {
      if (!alive) return;
      const next = {};
      rs.forEach((r, i) => { if (r.status === "fulfilled" && r.value?.id) next[ids[i]] = r.value; });
      setFilms(next);
    });
    return () => { alive = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return films;
}

export const posterUrl = (film, size = "w185") => (film?.poster_path ? `https://image.tmdb.org/t/p/${size}${film.poster_path}` : null);
