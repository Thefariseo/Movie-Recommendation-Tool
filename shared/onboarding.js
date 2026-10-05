// A first visit, before any rating: a few quick choices between two films
// ("this one or that one?") place a newcomer in the taste space, so their
// first picks are already theirs. The pairs adapt: the first ones set far-apart
// corners of cinema against each other; once two choices are in, each pair is
// two films the member's provisional taste cannot yet tell apart, from
// different parts of the map, which is where an answer teaches the most.
import { placeMember, affinities } from './tasteSpace.js';

export const ROUNDS = 7;
// What a choice counts as in the space: a clear liking, short of a rating.
export const SEED_RATING = 8;

/**
 * The films the pairs are drawn from: films nearly everyone knows, so a
 * newcomer can answer every pair with confidence. These are the map's
 * best-known films overall (`landmarks`). Famous films crowd into a few
 * regions of the map, so they are grouped by taste instead: the most
 * different films become group centres and every other joins its nearest,
 * and a pair never repeats a group. Without them, the best-known films of
 * every region are used. Returns [{ id, title, year, region, i }].
 */
export const GROUPS = 3 * ROUNDS;

export function onboardingPool(space, regions, landmarks = null) {
  if (landmarks?.length) {
    const films = landmarks
      .map((l) => ({ id: Number(l.id), title: l.title, year: l.year ?? null, i: space.index.get(Number(l.id)) }))
      .filter((f) => f.i != null);
    if (films.length >= 2 * GROUPS) {
      // Farthest-point centres, from the best-known film onwards.
      const centres = [films[0]];
      const closest = films.map((f) => cosine(space, f.i, films[0].i));
      while (centres.length < GROUPS) {
        let next = 0;
        for (let j = 1; j < films.length; j++) if (closest[j] < closest[next]) next = j;
        centres.push(films[next]);
        films.forEach((f, j) => { closest[j] = Math.max(closest[j], cosine(space, f.i, films[next].i)); });
      }
      return films.map((f) => {
        let region = 0, best = -Infinity;
        centres.forEach((c, g) => { const v = cosine(space, f.i, c.i); if (v > best) { best = v; region = g; } });
        return { ...f, region };
      });
    }
  }
  const pool = [];
  for (const r of regions) {
    for (const l of (r.landmarks || []).slice(0, 3)) {
      const i = space.index.get(Number(l.id));
      if (i != null) pool.push({ id: Number(l.id), title: l.title, year: l.year ?? null, region: r.id, i });
    }
  }
  return pool;
}

const cosine = (space, a, b) => {
  const { k, vectors } = space;
  let dot = 0, na = 0, nb = 0;
  for (let q = 0; q < k; q++) {
    const x = vectors[a * k + q], y = vectors[b * k + q];
    dot += x * y; na += x * x; nb += y * y;
  }
  return dot / Math.sqrt(na * nb || 1);
};

/**
 * The next pair to show, or null when the pool runs out. `history` is
 * [{ a, b, chosen }] with film ids (chosen null for "neither"); `random` a
 * source in [0, 1) so the first pair differs between visitors.
 */
export function nextPair(space, pool, history = [], random = Math.random) {
  const shown = new Set(history.flatMap((h) => [h.a, h.b]));
  const usedRegions = new Set(pool.filter((f) => shown.has(f.id)).map((f) => f.region));
  const open = pool.filter((f) => !shown.has(f.id) && !usedRegions.has(f.region));
  if (open.length < 2) return null;
  const chosen = history.filter((h) => h.chosen).map((h) => ({ id: h.chosen, rated: SEED_RATING }));
  const member = chosen.length >= 2 ? placeMember(space, chosen) : null;
  const z = member ? affinities(space, member) : null;
  let best = null, bestValue = -Infinity;
  // A random anchor keeps the first pair different for each visitor; after
  // that, every pair of open films is weighed.
  const anchors = z ? open : [open[Math.floor(random() * open.length)]];
  for (const a of anchors) {
    for (const b of open) {
      if (a.id === b.id || a.region === b.region) continue;
      const apart = cosine(space, a.i, b.i);
      const value = z
        // Two films the member is equally drawn to, from different corners, both plausible.
        ? -Math.abs(z[a.i] - z[b.i]) - 1.5 * apart + 0.25 * (z[a.i] + z[b.i]) / 2
        // Before any taste: the two most different films.
        : -apart;
      if (value > bestValue) { bestValue = value; best = [a, b]; }
    }
  }
  return best && (random() < 0.5 ? best : [best[1], best[0]]);
}

/**
 * The member's onboarding choices as films for placing them in the space,
 * next to what they rated: each choice counts as a clear liking, unless they
 * have rated that film since. `signals` is a signal map (shared/signals.js).
 */
export function withSeeds(watched, signals) {
  const rated = new Set(watched.map((m) => Number(m.id)));
  const seeds = [];
  for (const [id, e] of signals || []) {
    if (!e.sources?.has('onboarding') || e.net <= 0 || rated.has(id)) continue;
    seeds.push({ ...(e.movie || {}), id, title: e.movie?.title || '', rated: SEED_RATING, _seed: true });
  }
  return seeds.length ? [...watched, ...seeds] : watched;
}

/** Whether the member has made onboarding choices. */
export const hasSeeds = (signals) => [...(signals || new Map()).values()].some((e) => e.sources?.has('onboarding') && e.net > 0);
