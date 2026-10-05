// Films in cinemas, ranked for the member. Most new releases are not in the
// taste space yet (it learns from films people have long rated), so a film
// it cannot judge is estimated from the member's genres and eras and its
// public rating, and said to be a rougher guess.
import { tasteProfile, tasteScore, ratedOnly } from './taste.js';

/**
 * Each film with `forYou`: { rating, basis } on the 1–10 scale, where basis
 * is "diary" (the taste space and the member's own ratings) or "genres" (a
 * rougher estimate), or null when the member has rated nothing. Sorted best
 * first; films without a guess keep TMDB's popularity order.
 */
export function rankForMember(films, watched = [], predict = null) {
  const seen = new Set(watched.map((f) => Number(f.id)));
  const rated = ratedOnly(watched);
  const profile = rated.length ? tasteProfile(watched) : null;
  const ranked = films.filter((f) => !seen.has(Number(f.id))).map((f, order) => {
    const p = predict?.(f.id);
    if (p && p.support > 0.3) return { ...f, order, forYou: { rating: Number(p.rating.toFixed(1)), basis: 'diary' } };
    if (profile) return { ...f, order, forYou: { rating: Number(tasteScore(f, profile).toFixed(1)), basis: 'genres' } };
    return { ...f, order, forYou: null };
  });
  // A diary prediction is trusted a little more than a genre estimate at the same value.
  const value = (f) => (f.forYou ? f.forYou.rating + (f.forYou.basis === 'diary' ? 0.3 : 0) : -1);
  return ranked.sort((a, b) => value(b) - value(a) || a.order - b.order);
}
