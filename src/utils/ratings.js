import { useEffect, useState } from "react";
import { backend } from "./backend";

// IMDb and Rotten Tomatoes ratings, fetched through our server so the OMDb key
// stays private and each film is looked up once for every visitor.
const known = new Map();     // film id -> { imdb, imdbVotes, rt, imdbId }
const missedAt = new Map();  // film id -> when the server last had nothing for it
const inflight = new Set();
const listeners = new Set();
// The server fills a few uncached films per request, so asking again later is
// how a film without ratings gets them.
const RETRY_AFTER = 5 * 60 * 1000;
let queued = new Set();
let timer = null;

const eligible = (ids) => [...new Set(ids.map(Number).filter((n) => Number.isSafeInteger(n) && n > 0))]
  .filter((id) => !known.has(id) && !inflight.has(id) && Date.now() - (missedAt.get(id) || 0) >= RETRY_AFTER);

async function request(ids) {
  ids.forEach((id) => inflight.add(id));
  const found = {};
  for (let i = 0; i < ids.length; i += 100) {
    try {
      Object.assign(found, (await backend(`ratings?ids=${ids.slice(i, i + 100).join(",")}`)).ratings);
    } catch {
      /* Ratings enrich the page; without them scoring falls back to TMDB. */
    }
  }
  const now = Date.now();
  for (const id of ids) {
    inflight.delete(id);
    const r = found[id];
    if (r && (r.imdb != null || r.rt != null)) known.set(id, r);
    else missedAt.set(id, now);
  }
}

/** Ratings for many films at once, for scoring. Always resolves. */
export async function loadRatings(ids) {
  const missing = eligible(ids);
  if (missing.length) await request(missing);
  return new Map(ids.map(Number).filter((id) => known.has(id)).map((id) => [id, known.get(id)]));
}

/** A film carrying its ratings under the field names shared/taste.js reads. */
export function withRatings(movie, rating) {
  return rating ? { ...movie, imdb_rating: rating.imdb, imdb_votes: rating.imdbVotes, rt_score: rating.rt } : movie;
}

function flush() {
  timer = null;
  const ids = eligible([...queued]);
  queued = new Set();
  if (ids.length) request(ids).then(() => listeners.forEach((notify) => notify()));
}

/** One film's ratings for display. Cards rendered together share one request. */
export function useFilmRating(id) {
  const film = Number(id);
  const [, redraw] = useState(0);
  useEffect(() => {
    if (!Number.isSafeInteger(film) || film <= 0 || known.has(film)) return undefined;
    const notify = () => redraw((n) => n + 1);
    listeners.add(notify);
    queued.add(film);
    timer ??= setTimeout(flush, 30);
    return () => listeners.delete(notify);
  }, [film]);
  return known.get(film) || null;
}
