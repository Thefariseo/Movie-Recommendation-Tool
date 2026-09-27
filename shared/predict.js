// A personal rating for a film the member has not seen, predicted from how
// they rated the films most like it in the taste space. The member's place in
// the space comes only from films they liked, so it cannot see a film close
// to several they disliked; this can, and a middling rating counts as well.
import { peerStrength } from './tasteSpace.js';

// Cosine similarity below this says little in this space (half of all pairs
// of films sit above 0.25); above it, the weight grows with the square.
const FLOOR = 0.45;
// How many of the member's films can speak for a candidate.
const NEIGHBOURS = 15;
// Pulls a prediction with little behind it back towards the member's mean.
const PRIOR = 0.6;

const units = new WeakMap();
function unitVectors(space) {
  if (!units.has(space)) {
    const { n, k, vectors } = space;
    const out = new Float32Array(n * k);
    for (let i = 0; i < n; i++) {
      let norm = 0;
      for (let j = 0; j < k; j++) norm += vectors[i * k + j] ** 2;
      norm = Math.sqrt(norm) || 1;
      for (let j = 0; j < k; j++) out[i * k + j] = vectors[i * k + j] / norm;
    }
    units.set(space, out);
  }
  return units.get(space);
}

/**
 * A predictor for one member: predict(id) -> { rating, support, neighbours }
 * or null when the space does not know the film. `rating` is on the 1–10
 * scale, `support` how much of the member's own experience stands behind it
 * (0 when none of their films is close), `neighbours` the closest of their
 * films with the member's rating and the similarity.
 */
export function ratingPredictor(space, watched) {
  const rated = [];
  for (const f of watched) {
    const r = Number(f.rated), i = space.index.get(Number(f.id));
    if (r > 0 && i != null) rated.push({ i, id: Number(f.id), title: f.title, rated: r });
  }
  const all = watched.filter((f) => Number(f.rated) > 0);
  const mean = all.length ? all.reduce((s, f) => s + Number(f.rated), 0) / all.length : 6.5;
  const u = unitVectors(space), k = space.k;
  const predict = (id) => {
    const i = space.index.get(Number(id));
    if (i == null) return null;
    const near = [];
    for (const f of rated) {
      if (f.i === i) continue;
      let s = 0;
      for (let j = 0; j < k; j++) s += u[i * k + j] * u[f.i * k + j];
      if (s > FLOOR) near.push({ ...f, sim: s });
    }
    near.sort((a, b) => b.sim - a.sim);
    const used = near.slice(0, NEIGHBOURS);
    let sw = 0, swr = 0;
    for (const f of used) { const w = ((f.sim - FLOOR) / (1 - FLOOR)) ** 2; sw += w; swr += w * f.rated; }
    return {
      rating: Number(((swr + PRIOR * mean) / (sw + PRIOR)).toFixed(2)),
      support: Number(sw.toFixed(2)),
      neighbours: used.slice(0, 3).map(({ id, title, rated: r, sim }) => ({ id, title, rated: r, sim: Number(sim.toFixed(2)) }))
    };
  };
  return { predict, mean };
}

/**
 * The candidates the taste space offers one member, best first: the films
 * people with their taste love most, re-ranked by the rating the member's own
 * diary predicts, plus a few less-known films ("gems") that would otherwise
 * be buried under famous ones. `z` are the member's affinities.
 */
export function spaceCandidates(space, z, predictor, excluded = new Set(), { main = 40, gems = 10, pool = 240 } = {}) {
  const value = (i) => {
    const p = predictor.predict(space.tmdb[i]);
    return peerStrength(z[i]) + 0.3 * ((p?.rating ?? predictor.mean) - predictor.mean);
  };
  const top = (min, max, n) => {
    const ids = [];
    for (let i = 0; i < space.n; i++) if (space.counts[i] >= min && space.counts[i] < max && !excluded.has(space.tmdb[i])) ids.push(i);
    return ids.sort((a, b) => z[b] - z[a]).slice(0, pool).map((i) => ({ i, v: value(i) })).sort((a, b) => b.v - a.v).slice(0, n).map(({ i }) => space.tmdb[i]);
  };
  const best = top(200, Infinity, main);
  const hidden = top(60, 1500, gems + main).filter((id) => !best.includes(id)).slice(0, gems);
  return { best, hidden };
}
