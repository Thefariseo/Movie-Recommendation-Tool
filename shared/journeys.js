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

/**
 * Up to `count` journeys into regions the member has not visited, most
 * promising first, each `steps` films long. `member` comes from placeMember.
 */
export function planJourneys(space, map, regions, member, watched, { count = 3, steps = 6, minRatings = 300, exclude = new Set() } = {}) {
  if (!member) return [];
  // Cosine rather than the raw affinity: a raw score grows with a film's
  // popularity, and a journey is about the kind of film, not the famous ones.
  const me = unit(Array.from(member.vector));
  const z = new Float32Array(space.n);
  for (let i = 0; i < space.n; i++) z[i] = cosAt(space, i, me);
  const seen = new Set([...watched.map((f) => Number(f.id)), ...exclude]);
  const visited = new Set();
  for (const f of watched) {
    const i = space.index.get(Number(f.id));
    if (i != null) visited.add(map.region[i]);
  }
  // Each unvisited region's promise: how much the member should like its best films.
  const byRegion = new Map();
  for (let i = 0; i < space.n; i++) {
    if (space.counts[i] < minRatings || seen.has(space.tmdb[i])) continue;
    const r = map.region[i];
    if (visited.has(r)) continue;
    if (!byRegion.has(r)) byRegion.set(r, []);
    byRegion.get(r).push(i);
  }
  const promise = [...byRegion].map(([r, films]) => {
    const best = films.map((i) => z[i]).sort((a, b) => b - a).slice(0, 10);
    return { r, films, score: best.reduce((a, b) => a + b, 0) / Math.max(best.length, 1) };
  }).filter((p) => p.films.length >= steps).sort((a, b) => b.score - a.score);

  const loved = member.used.filter((u) => u.rated >= 7 && u.title);
  const journeys = [];
  const taken = new Set();
  for (const target of promise) {
    if (journeys.length >= count) break;
    const meta = regions.find((g) => g.id === target.r);
    // Keep the destinations different from one another.
    if (!meta || journeys.some((j) => j.region.genres[0] === meta.genres[0] && j.region.decade === meta.decade)) continue;
    const top = target.films.sort((a, b) => z[b] - z[a]).slice(0, 25);
    const centre = unit(top.map((i) => vectorOf(space, i)).reduce((s, v) => s.map((x, j) => x + v[j])));
    // Home is the loved film closest to the destination, so the first step is familiar.
    const home = loved.map((u) => ({ ...u, v: vectorOf(space, u.i) })).sort((a, b) => cos(b.v, centre) - cos(a.v, centre))[0];
    if (!home) break;
    const path = [];
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const aim = unit(home.v.map((x, j) => (1 - t) * x + t * centre[j]));
      let best = null, bestValue = -Infinity;
      for (let i = 0; i < space.n; i++) {
        const id = space.tmdb[i];
        if (space.counts[i] < minRatings || seen.has(id) || taken.has(id)) continue;
        // The last steps must land inside the destination.
        if (s >= steps - 1 && map.region[i] !== target.r) continue;
        const value = cosAt(space, i, aim) + 0.25 * z[i];
        if (value > bestValue) { best = i; bestValue = value; }
      }
      if (best == null) break;
      taken.add(space.tmdb[best]);
      path.push({ id: space.tmdb[best], region: map.region[best], x: map.x[best], y: map.y[best] });
    }
    if (path.length === steps) journeys.push({ region: meta, from: { id: home.id, title: home.title, rated: home.rated }, steps: path, promise: Number(target.score.toFixed(2)) });
  }
  return journeys;
}
