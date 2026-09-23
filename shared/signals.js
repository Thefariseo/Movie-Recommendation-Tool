// Signals about single films that are not ratings, shared by the recommender
// (browser and server) and the critic, so the two never disagree: a film the
// critic warned against, judged "skip", or the member dismissed is not
// recommended again; one the critic recommended is favoured.

export const SOURCES = ['dismissed', 'critic_warned', 'critic_pick', 'verdict'];
export const VERDICT_SIGNAL = { love: 2, like: 1, mixed: -1, skip: -2 };

/**
 * One entry per film: { net, sources, movie }. A "never again" (-2) from any
 * source wins; otherwise the signals add up within [-2, 2].
 */
export function signalMap(rows = []) {
  const map = new Map();
  for (const r of rows) {
    const id = Number(r.movie_id ?? r.id);
    if (!Number.isSafeInteger(id) || !SOURCES.includes(r.source)) continue;
    const e = map.get(id) || { total: 0, veto: false, sources: new Set(), movie: null };
    e.total += Number(r.signal) || 0;
    e.veto ||= Number(r.signal) <= -2;
    e.sources.add(r.source);
    e.movie ||= r.movie && Object.keys(r.movie).length ? r.movie : null;
    map.set(id, e);
  }
  for (const [id, e] of map) map.set(id, { net: e.veto ? -2 : Math.max(-2, Math.min(2, e.total)), sources: e.sources, movie: e.movie });
  return map;
}

export const blocked = (signals, id) => (signals?.get(Number(id))?.net ?? 0) <= -2;
export const signalOf = (signals, id) => signals?.get(Number(id))?.net ?? 0;

/** A small seeded random source, so a round of picks can be replayed in tests. */
export function seeded(seed) {
  let n = (Number(seed) * 2654435761) >>> 0 || 1;
  return () => {
    n ^= n << 13; n >>>= 0;
    n ^= n >>> 17;
    n ^= n << 5; n >>>= 0;
    return (n % 1e9) / 1e9;
  };
}

/**
 * Variety between rounds: each score gets Gumbel noise scaled by `spread`, so
 * the order among close candidates changes from round to round while clearly
 * better films stay on top. Seed 0 means no noise (the first, stable round).
 */
export function jitter(items, { seed = 0, spread = 0.1, key = '_score' } = {}) {
  if (!seed) return items;
  const rand = seeded(seed);
  return items.map((m) => {
    const u = Math.min(Math.max(rand(), 1e-9), 1 - 1e-9);
    return { ...m, [key]: (Number(m[key]) || 0) - spread * Math.log(-Math.log(u)) };
  });
}

/**
 * Films shown in recent rounds are left out when enough others remain to fill
 * a round; otherwise they stay, and the soft penalty elsewhere applies.
 */
export function withoutRecent(items, recent, needed) {
  const ids = new Set([...recent].map(Number));
  if (!ids.size) return items;
  const fresh = items.filter((m) => !ids.has(Number(m.id)));
  return fresh.length >= needed ? fresh : items;
}
