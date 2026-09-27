// The social graph of taste. Every friend is placed in the taste space from
// their own ratings, exactly like the member, so everything here is computed
// from the space and the two diaries, without asking a language model:
// how close two tastes are, where they part ways, the film two friends would
// argue about, which friend knows a region of the map best (and the journey
// they would guide you on), and picks weighted by the friends closest to you.
import { placeMember, affinities, peerStrength } from './tasteSpace.js';
import { regionLabel } from './journeys.js';
import { stars } from './evidence.js';

// Films the comparisons are made on: known well enough that the space is sure of them.
const KNOWN = 500;
// How many of each member's strongest films define their taste for a comparison.
const TOP = 300;

/** A member's place in the space from their diary: { member, z } or null. */
export function tasteOf(space, films, saved = []) {
  const member = placeMember(space, films, saved);
  return member ? { member, z: affinities(space, member) } : null;
}

function topOf(space, z, n = TOP) {
  const ids = [];
  for (let i = 0; i < space.n; i++) if (space.counts[i] >= KNOWN) ids.push(i);
  return ids.sort((a, b) => z[b] - z[a]).slice(0, n);
}

/**
 * How close two tastes are, 0–100: the correlation of the two members'
 * affinities over the films either of them is most drawn to. Over the whole
 * catalogue everyone agrees that good films are good; on the films that
 * define each taste, a Ghibli lover and a horror fan part ways.
 */
export function closeness(space, a, b) {
  const union = [...new Set([...topOf(space, a.z), ...topOf(space, b.z)])];
  const n = union.length;
  let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
  for (const i of union) {
    const x = a.z[i], y = b.z[i];
    sa += x; sb += y; saa += x * x; sbb += y * y; sab += x * y;
  }
  const ma = sa / n, mb = sb / n;
  const r = (sab / n - ma * mb) / Math.sqrt(Math.max((saa / n - ma * ma) * (sbb / n - mb * mb), 1e-12));
  return Math.round(50 + 50 * Math.max(-1, Math.min(1, r)));
}

/** A closeness in words. */
export function closenessLabel(match) {
  return match >= 85 ? 'Taste twins' : match >= 70 ? 'Kindred spirits' : match >= 55 ? 'A lot in common' : match >= 40 ? 'Some common ground' : 'Opposite tastes';
}

/**
 * The films both have rated: how many, how many they agree on (within one
 * star), and the one they disagree on most. `mine` and `theirs` are diaries.
 */
export function agreement(mine, theirs) {
  const their = new Map(theirs.filter((f) => Number(f.rated) > 0).map((f) => [Number(f.id), f]));
  const both = mine.filter((f) => Number(f.rated) > 0 && their.has(Number(f.id)))
    .map((f) => ({ id: Number(f.id), title: f.title || their.get(Number(f.id)).title, you: Number(f.rated), them: Number(their.get(Number(f.id)).rated) }));
  if (!both.length) return { shared: 0, agree: 0, biggest: null, best: null };
  const gap = (f) => Math.abs(f.you - f.them);
  const biggest = [...both].sort((x, y) => gap(y) - gap(x))[0];
  const best = [...both].sort((x, y) => (y.you + y.them) - (x.you + x.them))[0];
  return { shared: both.length, agree: both.filter((f) => gap(f) <= 2).length, biggest: gap(biggest) >= 4 ? biggest : null, best: best.you >= 8 && best.them >= 8 ? best : null };
}

function regionValues(space, map, regions, z) {
  const byRegion = new Map(regions.map((r) => [r.id, []]));
  for (let i = 0; i < space.n; i++) if (space.counts[i] >= 300) byRegion.get(map.region[i])?.push(z[i]);
  return new Map([...byRegion].map(([id, zs]) => {
    const top = zs.sort((a, b) => b - a).slice(0, 20);
    return [id, top.length ? top.reduce((s, v) => s + v, 0) / top.length : -Infinity];
  }));
}

// Everyone is drawn to the regions of the most popular films. The baseline is
// a member who loved the eighty most-rated films, so a region counts as
// someone's for how far they are drawn to it beyond that.
const baselines = new WeakMap();
function baseline(space, map, regions) {
  if (!baselines.has(space)) {
    const popular = Array.from(space.tmdb, (id, i) => ({ id, c: space.counts[i] })).sort((a, b) => b.c - a.c).slice(0, 80).map(({ id }) => ({ id, rated: 8 }));
    baselines.set(space, regionValues(space, map, regions, affinities(space, placeMember(space, popular))));
  }
  return baselines.get(space);
}

/**
 * How much a member is drawn to each region, beyond what everyone is: the
 * mean affinity of the region's twenty films they are most drawn to, less
 * the same for a member who only loved the most popular films. Returns
 * region id -> rank (1 is their most distinctive region) and the values.
 */
export function regionTaste(space, map, regions, z) {
  const base = baseline(space, map, regions);
  const value = new Map([...regionValues(space, map, regions, z)].map(([id, v]) => [id, v - (base.get(id) ?? 0)]));
  const rank = new Map([...value].sort((a, b) => b[1] - a[1]).map(([id], n) => [id, n + 1]));
  return { value, rank };
}

/**
 * Where two tastes meet and where they part: the regions both rank highly,
 * and the regions one ranks far above the other. `me` and `friend` are
 * regionTaste results.
 */
export function divergences(regions, me, friend, { limit = 3 } = {}) {
  const rows = regions.map((r) => ({ region: r, you: me.rank.get(r.id), them: friend.rank.get(r.id) }));
  const shared = rows.filter((r) => r.you <= 12 && r.them <= 12).sort((a, b) => (a.you + a.them) - (b.you + b.them)).slice(0, limit);
  const theirs = rows.filter((r) => r.them <= 10 && r.you - r.them >= 12).sort((a, b) => (b.you - b.them) - (a.you - a.them)).slice(0, limit);
  const yours = rows.filter((r) => r.you <= 10 && r.them - r.you >= 12).sort((a, b) => (b.them - b.you) - (a.them - a.you)).slice(0, limit);
  return { shared, theirs, yours };
}

/**
 * The films the two of you would argue about: well known, seen by neither,
 * and loved by one taste while the other is far from it. The first is the one
 * the friend would champion, the second the one you would.
 */
export function disputed(space, me, friend, seen = new Set(), { minRatings = 1500 } = {}) {
  let theirs = null, yours = null;
  for (let i = 0; i < space.n; i++) {
    if (space.counts[i] < minRatings || seen.has(space.tmdb[i])) continue;
    const a = me.z[i], b = friend.z[i];
    // How strongly one side loves it, times how far the other side is.
    const forThem = Math.min(b, 6) - a, forYou = Math.min(a, 6) - b;
    if (b >= 2.5 && (!theirs || forThem > theirs.gap)) theirs = { id: space.tmdb[i], gap: forThem, you: a, them: b };
    if (a >= 2.5 && (!yours || forYou > yours.gap)) yours = { id: space.tmdb[i], gap: forYou, you: a, them: b };
  }
  return { theirs: theirs?.gap >= 2 ? theirs : null, yours: yours?.gap >= 2 ? yours : null };
}

/**
 * Who in your circle knows each region best: the friend who loved the most
 * films there (7/10 or more), with at least `min` of them. `friends` are
 * { id, name, films } with rated diaries. Returns region id -> expert.
 */
export function regionExperts(space, map, friends, { min = 3 } = {}) {
  const experts = new Map();
  for (const f of friends) {
    const loved = new Map();
    for (const film of f.films) {
      if (Number(film.rated) < 7) continue;
      const i = space.index.get(Number(film.id));
      if (i == null) continue;
      const r = map.region[i];
      loved.set(r, [...(loved.get(r) || []), film]);
    }
    for (const [r, films] of loved) {
      if (films.length < min || (experts.get(r)?.films.length || 0) >= films.length) continue;
      experts.set(r, { id: f.id, name: f.name, films: [...films].sort((a, b) => b.rated - a.rated) });
    }
  }
  return experts;
}

/**
 * A journey into a region guided by a friend: through the films they loved
 * there that you have not seen, from the one closest to your taste to their
 * own favourite, which comes last. It sets off from your loved film nearest
 * the region. `me` is { member, z }; `expert` from regionExperts.
 */
export function friendJourney(space, map, regions, me, expert, regionId, watched, { steps = 6, exclude = new Set() } = {}) {
  const meta = regions.find((r) => r.id === regionId);
  const seen = new Set([...watched.map((f) => Number(f.id)), ...exclude]);
  const pool = expert.films.filter((f) => !seen.has(Number(f.id)) && space.index.get(Number(f.id)) != null);
  if (!meta || pool.length < 3) return null;
  const at = (id) => space.index.get(Number(id));
  const favourite = pool[0];
  const rest = pool.slice(1).sort((a, b) => me.z[at(b.id)] - me.z[at(a.id)]).slice(0, steps - 1);
  const path = [...rest, favourite].map((f) => ({ id: Number(f.id), region: map.region[at(f.id)], x: map.x[at(f.id)], y: map.y[at(f.id)], title: f.title, rated: Number(f.rated) }));
  // Home: the member's loved film closest to where the journey begins.
  const first = at(path[0].id);
  const home = me.member.used.filter((u) => u.rated >= 7 && u.title)
    .map((u) => ({ ...u, d: (map.x[u.i] - map.x[first]) ** 2 + (map.y[u.i] - map.y[first]) ** 2 }))
    .sort((a, b) => a.d - b.d)[0];
  if (!home) return null;
  const name = regionLabel(meta);
  const loved = expert.films.length;
  return {
    id: `${home.id}-${regionId}-${path[0].id}`,
    kind: 'friend',
    person: { id: expert.id, name: expert.name },
    region: { id: meta.id, genres: meta.genres, decade: meta.decade },
    from: { id: home.id, title: home.title, rated: home.rated },
    steps: path.map(({ id, region, x, y }) => ({ id, region, x, y })),
    explain: {
      start: `It begins with “${path[0].title}”, the film ${expert.name} loved here that sits closest to your taste; your nearest film on the map is “${home.title}” (${stars(home.rated)}).`,
      why: [
        `${expert.name} knows ${name} better than anyone in your circle: they have loved ${loved} film${loved === 1 ? '' : 's'} there.`,
        `Every step is a film ${expert.name} rated highly, so you can compare notes as you go.`,
        `It ends with their favourite, “${favourite.title}” (${stars(favourite.rated)}).`
      ],
      steps: Object.fromEntries(path.map((p, n) => [p.id, n === path.length - 1 ? `${expert.name}'s favourite · ${stars(p.rated)}` : `${expert.name}: ${stars(p.rated)}`]))
    }
  };
}

/**
 * Picks weighted by the friends whose taste is closest to yours rather than
 * by everyone: films your close friends loved (8/10 or more) that you have
 * not seen, each counted by how close the friend is, and by how well the
 * film suits your own taste. `friends` are { id, name, films, match }.
 */
export function circlePicks(space, me, friends, seen = new Set(), { limit = 12 } = {}) {
  const picks = new Map();
  for (const f of friends) {
    const weight = Math.max(0, (f.match - 40) / 60);
    if (!weight) continue;
    for (const film of f.films) {
      const id = Number(film.id), rated = Number(film.rated);
      if (rated < 8 || seen.has(id)) continue;
      const entry = picks.get(id) || { id, title: film.title, film, score: 0, by: [] };
      entry.score += weight * (rated - 6) / 4;
      entry.by.push({ id: f.id, name: f.name, rated, match: f.match });
      picks.set(id, entry);
    }
  }
  return [...picks.values()].map((p) => {
    const i = me ? space.index.get(p.id) : null;
    const fit = i == null ? 0 : peerStrength(me.z[i]);
    return { ...p, fit, score: p.score + 0.6 * fit, by: p.by.sort((a, b) => b.match - a.match || b.rated - a.rated) };
  }).sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Why a circle pick is there, naming the friends and how close they are. */
export function circleReason(pick) {
  const [first, second] = pick.by;
  const who = `${first.name} (${first.match}% match) gave it ${stars(first.rated)}`;
  const also = second ? `, and ${second.name} ${stars(second.rated)}` : '';
  const fit = pick.fit >= 0.4 ? '; people with your taste love it too' : pick.fit <= 0 ? '; a step away from your usual taste' : '';
  return `${who}${also}${fit}.`;
}
