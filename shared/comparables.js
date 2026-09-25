// The films in a member's diary most like a given film, and what their own
// ratings of those films say about it. A critic's verdict on one film should
// rest on these, the member's nearest experience, rather than on their
// all-time favourites and most hated films.
import { similarity } from './tasteSpace.js';
import { genreIds, movieYear } from './taste.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/**
 * How alike two films are, in [0, 1]: mostly whether the same people love
 * them (the taste space), then shared genres and a nearby era. Without the
 * taste space, genres and era alone decide, at a lower ceiling.
 */
export function likeness(space, target, film) {
  const peer = space ? similarity(space, target.id, film.id) : null;
  const a = new Set(genreIds(target)), b = genreIds(film);
  const shared = b.filter((g) => a.has(g)).length;
  const genres = a.size + b.length ? shared / (a.size + b.length - shared) : 0;
  const ya = movieYear(target), yb = movieYear(film);
  const era = ya && yb ? clamp01(1 - Math.abs(ya - yb) / 30) : 0;
  if (peer == null) return 0.55 * (0.7 * genres + 0.3 * era);
  return clamp01(0.7 * clamp01(peer) + 0.2 * genres + 0.1 * era);
}

/**
 * The member's rated films closest to `target`, most alike first, and the
 * rating those films predict for it: their ratings weighted by likeness
 * (squared, so the closest count most). `spread` is how much the close
 * films disagree, on the 1–10 scale; a high spread means the prediction is
 * uncertain.
 */
export function closestInDiary(space, target, watched, { limit = 10, min = 0.15 } = {}) {
  const rated = watched.filter((m) => Number(m.rated) > 0 && Number(m.id) !== Number(target.id));
  const closest = rated
    .map((m) => ({ id: Number(m.id), title: m.title, year: movieYear(m), rated: Number(m.rated), likeness: likeness(space, target, m) }))
    .filter((m) => m.likeness >= min)
    .sort((a, b) => b.likeness - a.likeness)
    .slice(0, limit);
  if (!closest.length) return { closest, expected: null, spread: null };
  const weights = closest.map((m) => m.likeness ** 2);
  const total = weights.reduce((s, w) => s + w, 0);
  const expected = closest.reduce((s, m, i) => s + weights[i] * m.rated, 0) / total;
  const spread = Math.sqrt(closest.reduce((s, m, i) => s + weights[i] * (m.rated - expected) ** 2, 0) / total);
  return { closest, expected: Number(expected.toFixed(1)), spread: Number(spread.toFixed(1)) };
}
