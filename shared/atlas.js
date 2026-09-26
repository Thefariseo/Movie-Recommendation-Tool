// The taste map as a place to explore. Its 48 regions become territories:
// the ones the member has conquered (seen enough of, and loved some), the
// ones they have set foot in, the frontier (unvisited regions that border
// their territory) and the unexplored rest. A coarse grid over the map gives
// every territory a shape and borders, and milestones mark the exploration.
import { memberMap } from './journeys.js';

// What it takes to conquer a region: films seen there, of which loved (7/10+).
export const CONQUER = { seen: 5, loved: 3 };
export const STATUS = ['conquered', 'settled', 'frontier', 'unexplored'];

/** A region's name for the atlas: its best-known films, with genres and decade as a subtitle. */
export function territoryName(region) {
  const [a, b] = (region?.landmarks || []).map((l) => l.title);
  return a ? (b ? `${a} & ${b}` : a) : `${(region?.genres || []).slice(0, 2).join(' & ') || 'Films'}${region?.decade ? `, ${region.decade}s` : ''}`;
}
export function territoryKind(region) {
  return `${(region?.genres || []).slice(0, 2).join(' & ') || 'Films'}${region?.decade ? ` · ${region.decade}s` : ''}`;
}

/**
 * Which regions border which: regions sharing a stretch of border on the
 * grid (`min` cell edges, so a corner touching is not a border). Returns
 * region id -> Set of neighbouring region ids.
 */
export function borders(grid, { min = 3 } = {}) {
  const length = new Map();
  const link = (a, b) => {
    if (a < 0 || b < 0 || a === b) return;
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    length.set(key, (length.get(key) || 0) + 1);
  };
  const { w, h, cells } = grid;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const r = cells[y * w + x];
    if (x + 1 < w) link(r, cells[y * w + x + 1]);
    if (y + 1 < h) link(r, cells[(y + 1) * w + x]);
  }
  const next = new Map();
  for (const [key, n] of length) {
    if (n < min) continue;
    const [a, b] = key.split(':').map(Number);
    if (!next.has(a)) next.set(a, new Set());
    if (!next.has(b)) next.set(b, new Set());
    next.get(a).add(b);
    next.get(b).add(a);
  }
  return next;
}

/**
 * A grid over the map, each cell given to the region most of its films
 * belong to (-1 for open sea), smoothed so coasts are not ragged. The map is
 * 1.6 times as wide as it is tall.
 */
export function territoryGrid(map, { w = 96, h = 60 } = {}) {
  const votes = Array.from({ length: w * h }, () => new Map());
  for (let i = 0; i < map.n; i++) {
    const x = Math.min(w - 1, Math.floor(map.x[i] * w)), y = Math.min(h - 1, Math.floor(map.y[i] * h));
    const cell = votes[y * w + x];
    cell.set(map.region[i], (cell.get(map.region[i]) || 0) + 1);
  }
  const cells = new Int16Array(w * h).fill(-1);
  votes.forEach((v, c) => { let best = -1, n = 0; for (const [r, k] of v) if (k > n) { best = r; n = k; } cells[c] = best; });
  // Two passes of smoothing: a cell takes its neighbourhood's majority when most of it is land.
  for (let pass = 0; pass < 2; pass++) {
    const copy = Int16Array.from(cells);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const count = new Map();
      let land = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const r = copy[ny * w + nx];
        if (r < 0) continue;
        land++;
        count.set(r, (count.get(r) || 0) + 1);
      }
      if (land >= 5) {
        let best = copy[y * w + x], n = 0;
        for (const [r, k] of count) if (k > n) { best = r; n = k; }
        cells[y * w + x] = best;
      } else if (land <= 2) cells[y * w + x] = -1;
    }
  }
  // Crumbs: a patch of a region cut off from its main body (a handful of
  // stray films) joins the land around it, so every territory reads as one shape.
  const seen = new Uint8Array(w * h);
  const patches = [];
  for (let c = 0; c < w * h; c++) {
    if (seen[c] || cells[c] < 0) continue;
    const r = cells[c], patch = [c];
    seen[c] = 1;
    for (let k = 0; k < patch.length; k++) {
      const x = patch[k] % w, y = Math.floor(patch[k] / w);
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        const n = ny * w + nx;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[n] || cells[n] !== r) continue;
        seen[n] = 1;
        patch.push(n);
      }
    }
    patches.push({ r, cells: patch });
  }
  const largest = new Map();
  for (const p of patches) if (p.cells.length > (largest.get(p.r)?.cells.length || 0)) largest.set(p.r, p);
  for (const p of patches) {
    if (largest.get(p.r) === p || p.cells.length >= 12) continue;
    const around = new Map();
    for (const c of p.cells) {
      const x = c % w, y = Math.floor(c / w);
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        const r = nx < 0 || ny < 0 || nx >= w || ny >= h ? -1 : cells[ny * w + nx];
        if (r >= 0 && r !== p.r) around.set(r, (around.get(r) || 0) + 1);
      }
    }
    let best = -1, n = 0;
    for (const [r, k] of around) if (k > n) { best = r; n = k; }
    for (const c of p.cells) cells[c] = best;
  }
  return { w, h, cells };
}

/**
 * The member's territories: for every region, how many films they have seen
 * and loved there, its status, and how far it is from being conquered.
 * `grid` gives the borders; `watched` the member's diary.
 */
export function territories(space, map, regions, watched, grid) {
  const seen = new Map(), loved = new Map(), films = new Map();
  for (const f of watched) {
    const i = space.index.get(Number(f.id));
    if (i == null) continue;
    const r = map.region[i];
    seen.set(r, (seen.get(r) || 0) + 1);
    if (Number(f.rated) >= 7) loved.set(r, (loved.get(r) || 0) + 1);
    films.set(r, [...(films.get(r) || []), f]);
  }
  const next = borders(grid);
  const held = (r) => (seen.get(r) || 0) > 0;
  const out = new Map();
  for (const region of regions) {
    const s = seen.get(region.id) || 0, l = loved.get(region.id) || 0;
    const status = s >= CONQUER.seen && l >= CONQUER.loved ? 'conquered'
      : s > 0 ? 'settled'
        : [...(next.get(region.id) || [])].some(held) ? 'frontier' : 'unexplored';
    out.set(region.id, {
      region, status, seen: s, loved: l,
      films: (films.get(region.id) || []).sort((a, b) => (b.rated || 0) - (a.rated || 0)),
      // What is still missing to conquer it.
      toConquer: status === 'conquered' ? null : { seen: Math.max(0, CONQUER.seen - s), loved: Math.max(0, CONQUER.loved - l) },
      neighbours: [...(next.get(region.id) || [])]
    });
  }
  return out;
}

/** How many regions are in each status. */
export function tally(lands) {
  const counts = Object.fromEntries(STATUS.map((s) => [s, 0]));
  for (const t of lands.values()) counts[t.status]++;
  return counts;
}

/**
 * Milestones of exploration, earned or not, each with its progress:
 * { id, title, detail, earned, have, need }. `journeys` are the member's
 * followed journeys with `arrived` set; `centre` their place on the map.
 */
export function milestones(lands, { journeys = [], centre = null, friendRegions = new Set() } = {}) {
  const all = [...lands.values()];
  const visited = all.filter((t) => t.seen > 0);
  const conquered = all.filter((t) => t.status === 'conquered');
  const decades = new Set(visited.map((t) => t.region.decade).filter(Boolean));
  const genres = new Set(visited.map((t) => t.region.genres?.[0]).filter(Boolean));
  const far = centre ? Math.max(0, ...visited.map((t) => Math.hypot(t.region.x - centre.x, (t.region.y - centre.y) / 1.6))) : 0;
  const arrived = journeys.filter((j) => j.arrived);
  const guided = arrived.filter((j) => j.kind === 'friend').length + visited.filter((t) => friendRegions.has(t.region.id)).length;
  const step = (id, title, detail, have, need) => ({ id, title, detail, have: Math.min(have, need), need, earned: have >= need });
  return [
    step('footholds', 'First footholds', 'Set foot in 5 regions of the map.', visited.length, 5),
    step('explorer', 'Explorer', 'Set foot in 12 regions.', visited.length, 12),
    step('cartographer', 'Cartographer', 'Set foot in half of the map: 24 regions.', visited.length, 24),
    step('atlas', 'Atlas', 'Set foot in 40 of the 48 regions.', visited.length, 40),
    step('conquest', 'First conquest', `Conquer a region: see ${CONQUER.seen} films there and love ${CONQUER.loved}.`, conquered.length, 1),
    step('empire', 'An empire of taste', 'Conquer 5 regions.', conquered.length, 5),
    step('pathfinder', 'Pathfinder', 'Finish a journey.', arrived.length, 1),
    step('far', 'Far from home', 'Visit a region on the far side of the map from where your taste sits.', Math.round(far * 100), 45),
    step('decades', 'Time traveller', 'Visit regions from 6 different decades.', decades.size, 6),
    step('genres', 'Genre nomad', 'Visit regions led by 6 different genres.', genres.size, 6),
    step('company', 'In good company', 'Explore a region a friend knows well.', guided, 1)
  ];
}

/**
 * The frontier, most promising first: unvisited regions that border the
 * member's territory. `scores` are regionScores rows (for the promise).
 */
export function frontier(lands, scores = []) {
  const rank = new Map(scores.map((r) => [r.id, r]));
  return [...lands.values()].filter((t) => t.status === 'frontier')
    .map((t) => ({ ...t, promise: rank.get(t.region.id)?.score ?? 0, rank: rank.get(t.region.id)?.rank ?? null }))
    .sort((a, b) => b.promise - a.promise);
}

/** A friend's footprint on the map: their films' points, their centre, the regions they have visited. */
export function footprint(space, map, films) {
  const { points, centre, visited } = memberMap(space, map, films);
  return { points, centre, visited };
}
