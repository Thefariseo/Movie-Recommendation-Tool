// A member's taste in a link and on a card: the films that define it, packed
// into a short code anyone can open (no account, nothing stored on a server),
// and the comparison of two tastes it makes possible.
import { tasteOf, closeness, closenessLabel, agreement } from './social.js';
import { memberMap } from './journeys.js';
import { territoryName } from './atlas.js';

const MAX_FILMS = 60;
const NAME_MAX = 30;

const toBase64Url = (bytes) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromBase64Url = (text) => {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

/**
 * The films that say most about a taste, as a code for a link: the best-rated
 * ones first (up to sixty), each a TMDB id and a rating, and the name to show.
 */
export function encodeTaste(films, name = '') {
  const rated = films.filter((f) => Number(f.rated) > 0 && Number(f.id) > 0)
    .sort((a, b) => Number(b.rated) - Number(a.rated)).slice(0, MAX_FILMS);
  const label = new TextEncoder().encode(String(name).trim().slice(0, NAME_MAX));
  const bytes = [1, label.length, ...label];
  for (const f of rated) {
    // The id as a varint, then the rating (1–10).
    let id = Number(f.id);
    while (id >= 0x80) { bytes.push((id & 0x7f) | 0x80); id = Math.floor(id / 128); }
    bytes.push(id, Math.max(1, Math.min(10, Math.round(Number(f.rated)))));
  }
  return toBase64Url(bytes);
}

/** The taste in a code, or null when it is not one. */
export function decodeTaste(code) {
  try {
    if (typeof code !== 'string' || code.length > 1200 || !/^[A-Za-z0-9_-]+$/.test(code)) return null;
    const bytes = fromBase64Url(code);
    if (bytes[0] !== 1) return null;
    const length = bytes[1];
    const name = new TextDecoder().decode(bytes.slice(2, 2 + length)).slice(0, NAME_MAX);
    const films = [];
    let i = 2 + length;
    while (i < bytes.length && films.length < MAX_FILMS) {
      let id = 0, shift = 1, b;
      do { b = bytes[i++]; id += (b & 0x7f) * shift; shift *= 128; } while (b & 0x80 && i < bytes.length);
      const rated = bytes[i++];
      if (!id || !(rated >= 1 && rated <= 10)) return null;
      films.push({ id, rated });
    }
    return films.length ? { name, films } : null;
  } catch {
    return null;
  }
}

/**
 * What a taste card shows: the territory of the map it calls home, how much
 * of the map it has explored, and the films that define it. `films` need
 * titles; `regions` are the taste map's.
 */
export function tasteSummary(space, map, regions, films) {
  const { visited } = memberMap(space, map, films);
  // Home: the territory holding most of the films loved most.
  const weight = new Map();
  for (const f of films) {
    const i = space.index.get(Number(f.id));
    if (i == null || Number(f.rated) < 7) continue;
    const r = map.region[i];
    weight.set(r, (weight.get(r) || 0) + Number(f.rated) - 6);
  }
  const homeId = [...weight].sort((a, b) => b[1] - a[1])[0]?.[0];
  const home = regions.find((r) => r.id === homeId) || null;
  const defining = films.filter((f) => Number(f.rated) >= 8 && f.title).sort((a, b) => Number(b.rated) - Number(a.rated)).slice(0, 3);
  return {
    home: home ? territoryName(home) : null,
    homeId: home?.id ?? null,
    explored: visited.size,
    territories: regions.length,
    defining,
    rated: films.filter((f) => Number(f.rated) > 0).length,
  };
}

/**
 * Two tastes side by side: how close they are (0–100, with words), the films
 * both loved, the films they loved that `mine` has not seen, and the film the
 * two disagree on most. Null when the space cannot place either of them.
 */
export function compareTastes(space, mine, theirs) {
  const a = tasteOf(space, mine), b = tasteOf(space, theirs);
  if (!a || !b) return null;
  const match = closeness(space, a, b);
  const seen = new Map(mine.map((f) => [Number(f.id), f]));
  const bothLoved = theirs.filter((f) => f.rated >= 8 && Number(seen.get(Number(f.id))?.rated) >= 8).map((f) => f.id);
  const toSee = theirs.filter((f) => f.rated >= 8 && !seen.has(Number(f.id))).slice(0, 8).map((f) => f.id);
  return { match, label: closenessLabel(match), bothLoved: bothLoved.slice(0, 8), toSee, ...agreement(mine, theirs) };
}
