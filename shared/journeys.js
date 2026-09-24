// Journeys and the taste map. The map lays the taste space out in two
// dimensions (films loved by the same people sit together) and splits it into
// regions. A journey leads from a film the member loved into a region they
// have never visited but the space expects them to like, in small steps: each
// film a little further from home and a little closer to the destination.
import { confidence } from './tasteSpace.js';

/** Parse taste-map.bin: coordinates in [0, 1] and a region per film, in taste-space order. */
export function parseTasteMap(buffer) {
  const view = new DataView(buffer);
  const magic = String.fromCharCode(...new Uint8Array(buffer, 0, 4));
  if (magic !== 'UMTM' || view.getUint32(4, true) !== 1) throw new Error('Unknown taste map format.');
  const n = view.getUint32(8, true);
  const xs = new Uint16Array(buffer.slice(12, 12 + 2 * n));
  const ys = new Uint16Array(buffer.slice(12 + 2 * n, 12 + 4 * n));
  const region = new Uint8Array(buffer.slice(12 + 4 * n, 12 + 5 * n));
  const x = Float32Array.from(xs, (v) => v / 65535);
  const y = Float32Array.from(ys, (v) => v / 65535);
  return { n, x, y, region };
}

const unit = (v) => {
  const norm = Math.hypot(...v) || 1;
  return v.map((x) => x / norm);
};
// Unit-length film vectors, computed once per loaded space.
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
const vectorOf = (space, i) => Array.from(unitVectors(space).subarray(i * space.k, i * space.k + space.k));
const cosAt = (space, i, aim) => {
  const u = unitVectors(space), k = space.k;
  let s = 0;
  for (let j = 0; j < k; j++) s += u[i * k + j] * aim[j];
  return s;
};
const cos = (a, b) => a.reduce((s, x, j) => s + x * b[j], 0);

/** A region's name for people: its genres and decade, and a film everyone knows from it. */
export function regionLabel(region) {
  const genres = region.genres.slice(0, 2).join(' & ') || 'Films';
  const era = region.decade ? `, ${region.decade}s` : '';
  return `${genres}${era}`;
}

/**
 * A name that tells regions apart: several share genres and a decade, so the
 * best-known film in it goes along (from the map's metadata, when present).
 */
export function regionName(region) {
  const landmark = region?.landmarks?.[0]?.title;
  return landmark ? `${regionLabel(region)} · ${landmark}` : regionLabel(region);
}

/**
 * Where the member stands on the map: every film they rated, where they sit
 * (the loved films' weighted centre) and which regions they have visited.
 */
export function memberMap(space, map, watched) {
  const points = [];
  let sx = 0, sy = 0, sw = 0;
  const visited = new Map();
  for (const f of watched) {
    const i = space.index.get(Number(f.id));
    if (i == null) continue;
    const r = map.region[i];
    points.push({ id: Number(f.id), title: f.title, rated: f.rated ?? null, x: map.x[i], y: map.y[i], region: r, when: f._updated || null });
    visited.set(r, (visited.get(r) || 0) + 1);
    const c = confidence(f.rated);
    if (c > 0) { sx += c * map.x[i]; sy += c * map.y[i]; sw += c; }
  }
  return { points, visited, centre: sw ? { x: sx / sw, y: sy / sw } : null };
}

/**
 * How the member's territory grew: regions visited by the end of each month,
 * from when films were logged. Empty without dates.
 */
export function territoryOverTime(points) {
  const dated = points.filter((p) => p.when).sort((a, b) => String(a.when).localeCompare(String(b.when)));
  const seen = new Set();
  const months = new Map();
  for (const p of dated) {
    seen.add(p.region);
    months.set(String(p.when).slice(0, 7), seen.size);
  }
  return [...months].map(([month, regions]) => ({ month, regions }));
}

// How close each film is to the member's taste, as a cosine rather than the
// raw affinity: a raw score grows with a film's popularity, and a journey is
// about the kind of film, not the famous ones. Cached per member vector.
const closeness = new WeakMap();
function closenessTo(space, member) {
  if (!closeness.has(member)) {
    const me = unit(Array.from(member.vector));
    const z = new Float32Array(space.n);
    for (let i = 0; i < space.n; i++) z[i] = cosAt(space, i, me);
    closeness.set(member, z);
  }
  return closeness.get(member);
}

const visitedRegions = (space, map, watched) => {
  const visited = new Set();
  for (const f of watched) {
    const i = space.index.get(Number(f.id));
    if (i != null) visited.add(map.region[i]);
  }
  return visited;
};

/** The region under a point of the map (coordinates in [0, 1]): the nearest film's. */
export function regionAt(map, x, y) {
  let best = -1, bestD = Infinity;
  for (let i = 0; i < map.n; i++) {
    const d = (map.x[i] - x) ** 2 + (map.y[i] - y) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best < 0 ? null : map.region[best];
}

/**
 * Every region seen from the member: how promising its best films are for
 * them, its rank among all regions, how many of its films they have seen, and
 * its best films for them that they have not seen.
 */
export function regionScores(space, map, regions, member, watched, { minRatings = 300, picks = 6 } = {}) {
  const z = member ? closenessTo(space, member) : null;
  const seenIds = new Set(watched.map((f) => Number(f.id)));
  const films = new Map(regions.map((r) => [r.id, []]));
  const seen = new Map(regions.map((r) => [r.id, 0]));
  for (let i = 0; i < space.n; i++) {
    const r = map.region[i];
    if (seenIds.has(space.tmdb[i])) { seen.set(r, (seen.get(r) || 0) + 1); continue; }
    if (space.counts[i] >= minRatings) films.get(r)?.push(i);
  }
  const rows = regions.map((r) => {
    const list = films.get(r.id) || [];
    const order = z ? [...list].sort((a, b) => z[b] - z[a]) : list;
    const best = z ? order.slice(0, 10).map((i) => z[i]) : [];
    return {
      id: r.id,
      region: r,
      seen: seen.get(r.id) || 0,
      score: best.length ? best.reduce((a, b) => a + b, 0) / best.length : 0,
      picks: order.slice(0, picks).map((i) => space.tmdb[i]),
      films: list.length
    };
  });
  [...rows].sort((a, b) => b.score - a.score).forEach((row, n) => { row.rank = n + 1; });
  return rows;
}

// A path of `steps` films from `start` (a unit vector) towards the destination,
// the last steps inside it. `avoid` are unit vectors of films the member
// disliked on the way: the path keeps its distance from them.
// `arrives(i)` says whether film index i is inside the destination.
function walk(space, map, z, start, centre, arrives, steps, blocked, avoid = [], minRatings = 300) {
  const path = [];
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    const aim = unit(start.map((x, j) => (1 - t) * x + t * centre[j]));
    let best = null, bestValue = -Infinity;
    for (let i = 0; i < space.n; i++) {
      const id = space.tmdb[i];
      if (space.counts[i] < minRatings || blocked.has(id)) continue;
      if (s >= steps - 1 && !arrives(i)) continue;
      let value = cosAt(space, i, aim) + 0.25 * z[i];
      for (const a of avoid) value -= 0.6 * Math.max(0, cosAt(space, i, a));
      if (value > bestValue) { best = i; bestValue = value; }
    }
    if (best == null) break;
    blocked.add(space.tmdb[best]);
    path.push({ id: space.tmdb[best], region: map.region[best], x: map.x[best], y: map.y[best] });
  }
  return path;
}

// The destination's centre: its films the member should like most.
function destination(space, map, z, regionId, seen, minRatings) {
  const films = [];
  for (let i = 0; i < space.n; i++) if (map.region[i] === regionId && space.counts[i] >= minRatings && !seen.has(space.tmdb[i])) films.push(i);
  if (!films.length) return null;
  const top = films.sort((a, b) => z[b] - z[a]).slice(0, 25);
  return { films, centre: unit(top.map((i) => vectorOf(space, i)).reduce((s, v) => s.map((x, j) => x + v[j]))) };
}

/**
 * One journey to a chosen region, `steps` films long, from the loved film
 * closest to it. Null when the member has no loved film to start from or the
 * region has too few films left.
 */
export function planJourney(space, map, regions, member, watched, regionId, { steps = 6, minRatings = 300, exclude = new Set() } = {}) {
  if (!member) return null;
  const z = closenessTo(space, member);
  const meta = regions.find((g) => g.id === regionId);
  const seen = new Set([...watched.map((f) => Number(f.id)), ...exclude]);
  const target = meta && destination(space, map, z, regionId, seen, minRatings);
  if (!target || target.films.length < steps) return null;
  // Home is the loved film closest to the destination, so the first step is familiar.
  const home = member.used
    .filter((u) => u.rated >= 7 && u.title)
    .map((u) => ({ ...u, v: vectorOf(space, u.i) }))
    .sort((a, b) => cos(b.v, target.centre) - cos(a.v, target.centre))[0];
  if (!home) return null;
  const path = walk(space, map, z, home.v, target.centre, (i) => map.region[i] === regionId, steps, new Set(seen), [], minRatings);
  if (path.length !== steps) return null;
  return {
    id: `${home.id}-${regionId}-${path[0].id}`,
    region: { id: meta.id, genres: meta.genres, decade: meta.decade },
    from: { id: home.id, title: home.title, rated: home.rated },
    steps: path
  };
}

/**
 * Up to `count` journeys into regions the member has not visited, most
 * promising first, each `steps` films long. `member` comes from placeMember.
 * `skip` leaves regions out (to offer other destinations).
 */
export function planJourneys(space, map, regions, member, watched, { count = 3, steps = 6, minRatings = 300, exclude = new Set(), skip = new Set() } = {}) {
  if (!member) return [];
  const visited = visitedRegions(space, map, watched);
  const ranked = regionScores(space, map, regions, member, watched, { minRatings, picks: 0 })
    .filter((r) => !visited.has(r.id) && !skip.has(r.id) && r.films >= steps)
    .sort((a, b) => b.score - a.score);
  const journeys = [];
  const taken = new Set(exclude);
  for (const target of ranked) {
    if (journeys.length >= count) break;
    const meta = target.region;
    // Keep the destinations different from one another.
    if (journeys.some((j) => j.region.genres[0] === meta.genres[0] && j.region.decade === meta.decade)) continue;
    const journey = planJourney(space, map, regions, member, watched, target.id, { steps, minRatings, exclude: taken });
    if (!journey) continue;
    journey.steps.forEach((s) => taken.add(s.id));
    journeys.push({ ...journey, promise: Number(target.score.toFixed(2)) });
  }
  return journeys;
}

/**
 * Where the member is on a journey: the steps they watched (with ratings),
 * the next step, and whether they have arrived.
 */
export function journeyProgress(journey, watched) {
  const rated = new Map(watched.map((f) => [Number(f.id), f.rated ?? null]));
  const steps = journey.steps.map((s) => ({ ...s, watched: rated.has(s.id), rated: rated.get(s.id) ?? null }));
  const next = steps.find((s) => !s.watched) || null;
  return { steps, done: steps.filter((s) => s.watched).length, next, arrived: !next };
}

/**
 * A journey adapts to how its films land. When the member disliked a step
 * (4/10 or less), the steps after their latest watched one are planned again
 * from the last step they liked (or the film the journey started from),
 * keeping away from what they disliked. Returns the journey unchanged when
 * nothing needs to change; otherwise a new journey with `rerouted` naming the
 * film that caused it.
 */
export function reroute(space, map, regions, member, journey, watched, { minRatings = 300, exclude = new Set() } = {}) {
  // Director journeys follow a filmography or a line between two directors:
  // they are not rerouted towards a region.
  if (!member || journey.kind) return journey;
  const progress = journeyProgress(journey, watched);
  const lastWatched = progress.steps.map((s) => s.watched).lastIndexOf(true);
  const disliked = progress.steps.filter((s) => s.watched && s.rated != null && s.rated <= 4);
  const pending = progress.steps.length - lastWatched - 1;
  // Once per new dislike, so the path does not shift with every film watched.
  const key = disliked.map((s) => s.id).join(',');
  if (!disliked.length || pending <= 0 || journey.routedFor === key) return journey;
  const z = closenessTo(space, member);
  const seen = new Set([...watched.map((f) => Number(f.id)), ...exclude, ...journey.steps.slice(0, lastWatched + 1).map((s) => s.id)]);
  const target = destination(space, map, z, journey.region.id, seen, minRatings);
  if (!target) return journey;
  const liked = progress.steps.slice(0, lastWatched + 1).filter((s) => s.watched && (s.rated == null || s.rated >= 6)).at(-1);
  const startIndex = space.index.get(Number(liked?.id ?? journey.from.id));
  if (startIndex == null) return journey;
  const avoid = disliked.map((s) => space.index.get(s.id)).filter((i) => i != null).map((i) => vectorOf(space, i));
  const path = walk(space, map, z, vectorOf(space, startIndex), target.centre, (i) => map.region[i] === journey.region.id, pending, seen, avoid, minRatings);
  if (path.length !== pending) return journey;
  return {
    ...journey,
    steps: [...journey.steps.slice(0, lastWatched + 1), ...path],
    routedFor: key,
    rerouted: { after: disliked.at(-1).id }
  };
}

// Where a film sits on the map, when the taste space knows it.
const placed = (space, map, id) => {
  const i = space?.index.get(Number(id));
  return i == null || !map ? { region: -1, x: null, y: null } : { region: map.region[i], x: map.x[i], y: map.y[i] };
};
const NO_REGION = { id: -1, genres: [], decade: null };

/**
 * A journey through one director's films the member has not seen: it starts
 * with the one closest to their taste (the taste space's match, or the best
 * known when it has none) and goes on from their celebrated films to the
 * deep cuts. `films` are the director's credits as TMDB lists them.
 */
export function directorJourney(person, films, { space = null, map = null, fit = () => null, seen = new Set(), steps = 6 } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const pool = [...new Map(films
    .filter((m) => m?.id && m.poster_path && m.release_date && m.release_date <= today && (m.vote_count || 0) >= 50 && !seen.has(Number(m.id)))
    .map((m) => [Number(m.id), m])).values()];
  if (pool.length < 3) return null;
  const known = (m) => (m.vote_count || 0) * Math.max(0.1, (m.vote_average || 0) - 5);
  const entry = [...pool].sort((a, b) => (fit(b.id) ?? -2) - (fit(a.id) ?? -2) || known(b) - known(a))[0];
  // The films worth the journey, then from the most celebrated to the least known.
  const rest = pool.filter((m) => m.id !== entry.id)
    .sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0))
    .slice(0, steps - 1)
    .sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0));
  const path = [entry, ...rest].map((m) => ({ id: Number(m.id), ...placed(space, map, m.id) }));
  return {
    id: `${Number(person.id)}-0-${path[0].id}`,
    kind: 'director',
    person: { id: Number(person.id), name: person.name },
    region: NO_REGION,
    from: { id: path[0].id, title: entry.title, rated: null },
    steps: path
  };
}

/**
 * A journey from a director the member loves to one they have not tried: it
 * starts from the loved director's films, crosses the taste space film by
 * film, and ends with two films by the new director. `from.films` and
 * `to.films` are TMDB ids of each director's films.
 */
export function bridgeJourney(space, map, member, watched, { from, to, steps = 6, minRatings = 200, exclude = new Set() }) {
  if (!space || !member) return null;
  const z = closenessTo(space, member);
  const seen = new Set([...watched.map((f) => Number(f.id)), ...exclude]);
  const index = (ids) => ids.map((id) => space.index.get(Number(id))).filter((i) => i != null);
  const rated = new Map(watched.map((f) => [Number(f.id), Number(f.rated) || 0]));
  // Home: the loved director's films the member loved, or all of theirs the space knows.
  const home = index(from.films).filter((i) => rated.get(space.tmdb[i]) >= 7);
  const start = home.length ? home : index(from.films);
  const target = index(to.films).filter((i) => space.counts[i] >= minRatings && !seen.has(space.tmdb[i]));
  if (!start.length || target.length < 2) return null;
  const mean = (list) => unit(list.map((i) => vectorOf(space, i)).reduce((s, v) => s.map((x, j) => x + v[j])));
  const centre = mean([...target].sort((a, b) => z[b] - z[a]).slice(0, 5));
  const inTarget = new Set(target);
  const path = walk(space, map, z, mean(start), centre, (i) => inTarget.has(i), steps, new Set(seen), [], minRatings);
  if (path.length !== steps) return null;
  const first = start.map((i) => space.tmdb[i]).find((id) => rated.has(id)) ?? space.tmdb[start[0]];
  const firstFilm = watched.find((f) => Number(f.id) === first);
  return {
    id: `${Number(from.person.id)}-${Number(to.person.id)}-${path[0].id}`,
    kind: 'bridge',
    person: { id: Number(from.person.id), name: from.person.name },
    to: { id: Number(to.person.id), name: to.person.name },
    region: NO_REGION,
    from: { id: first, title: firstFilm?.title || from.person.name, rated: firstFilm?.rated ?? null },
    steps: path.map((p) => ({ ...p, region: map ? p.region : -1 }))
  };
}
