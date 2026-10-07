// The well-known films a member is asked to rate (shared/quickRate.js), with
// their posters, and rating one in a tap.
import { useCallback, useEffect, useMemo, useState } from "react";
import { loadTasteMap } from "./tasteMap";
import { movieBasic } from "./api";
import { filmsToRate } from "../../shared/quickRate.js";
import useWatched from "../hooks/useWatched";

// Films the member said they have not seen: not asked about again.
const UNSEEN_KEY = "umbrify_unseen_v1";
const readUnseen = () => {
  try { return new Set(JSON.parse(localStorage.getItem(UNSEEN_KEY) || "[]").map(Number)); } catch { return new Set(); }
};
export function markUnseen(id) {
  const ids = [...readUnseen(), Number(id)].slice(-300);
  try { localStorage.setItem(UNSEEN_KEY, JSON.stringify(ids)); } catch { /* storage may be blocked */ }
}

/**
 * Up to `limit` well-known films to rate, with their basic details (poster,
 * year, title in the interface language). Films leave the list once rated or
 * passed on only when `refresh` is called, so a row does not jump under a tap.
 * `signals` are the member's film signals (shared/signals.js).
 */
export function useFilmsToRate({ limit = 10, signals } = {}) {
  const { watched } = useWatched();
  const [landmarks, setLandmarks] = useState(null);
  const [details, setDetails] = useState({});
  const [round, setRound] = useState(0);
  useEffect(() => { loadTasteMap().then((m) => setLandmarks(m?.landmarks || [])).catch(() => setLandmarks([])); }, []);
  // Fixed for the round: what is excluded is read when the round starts.
  const films = useMemo(() => {
    if (!landmarks) return null;
    const exclude = new Set(watched.map((m) => Number(m.id)));
    for (const [id] of signals || []) exclude.add(Number(id));
    return filmsToRate(landmarks, { exclude, unseen: readUnseen(), limit });
  }, [landmarks, round, limit]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const missing = (films || []).filter((f) => !details[f.id]);
    if (!missing.length) return;
    let alive = true;
    Promise.allSettled(missing.map((f) => movieBasic(f.id))).then((rs) => {
      if (!alive) return;
      const next = {};
      rs.forEach((r, i) => { if (r.status === "fulfilled" && r.value?.id) next[missing[i].id] = r.value; });
      setDetails((d) => ({ ...d, ...next }));
    });
    return () => { alive = false; };
  }, [films]); // eslint-disable-line react-hooks/exhaustive-deps
  return {
    films: films && films.map((f) => ({ ...f, ...(details[f.id] || {}), title: details[f.id]?.title || f.title })),
    loading: !films,
    refresh: useCallback(() => setRound((n) => n + 1), []),
  };
}

/** Rates a film in one tap (0 takes the rating away), as the film sheet does. */
export function useRate() {
  const { watched, addWatched, updateRating } = useWatched();
  return useCallback(async (film, rating) => {
    const seen = watched.find((m) => Number(m.id) === Number(film.id));
    if (seen) return updateRating(film.id, rating);
    // A failed save says so itself (src/contexts/LibraryContext.jsx).
    return addWatched({
      id: film.id,
      title: film.title,
      poster: film.poster_path ?? null,
      genres: film.genre_ids ?? film.genres?.map((g) => g.id ?? g) ?? [],
      year: parseInt((film.release_date || "").slice(0, 4), 10) || film.year || null,
      ...(rating ? { rated: rating } : {}),
    });
  }, [watched, addWatched, updateRating]);
}

/** How many films the member has rated. */
export function useRatedCount() {
  const { watched } = useWatched();
  return watched.filter((m) => Number(m.rated) > 0).length;
}
