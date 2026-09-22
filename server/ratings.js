import { database, remote } from './http.js';
import { tmdb } from './tmdb.js';

// IMDb and Rotten Tomatoes are the reference for a film's quality. Both come from
// OMDb, whose free tier allows about 1,000 requests a day for every visitor
// together, so each film is looked up once and kept in film_ratings.
export const OMDB_DAILY_CAP = 900; // headroom below the provider's 1,000
const DAY = 86400000;
const FRESH_FOR = 30 * DAY; // ratings drift slowly
const RETRY_MISSING_AFTER = 7 * DAY; // a film with no IMDb entry may gain one
const MAX_IDS = 300; // one IN query; the public endpoint accepts at most 100

const key = () => process.env.OMDB_KEY || process.env.VITE_OMDB_KEY;
const serviceDb = () => process.env.SUPABASE_SERVICE_ROLE_KEY ? database(null, true) : null;

const number = value => {
  const n = Number(String(value ?? '').replace(/,/g, ''));
  return String(value ?? '').trim() && Number.isFinite(n) ? n : null;
};

/** OMDb's answer reduced to the three values kept, each null when absent or implausible. */
export function parseOmdb(data) {
  const rating = number(data?.imdbRating);
  const votes = number(data?.imdbVotes);
  const rt = number(String(data?.Ratings?.find(r => r?.Source === 'Rotten Tomatoes')?.Value ?? '').replace('%', ''));
  return {
    imdb_rating: rating != null && rating >= 1 && rating <= 10 ? Math.round(rating * 10) / 10 : null,
    imdb_votes: votes != null && votes >= 0 ? Math.round(votes) : null,
    rt_score: rt != null && rt >= 0 && rt <= 100 ? Math.round(rt) : null
  };
}

/** The shape exposed to the browser and to scoring. */
export const toRating = row => ({
  imdb: row.imdb_rating == null ? null : Number(row.imdb_rating),
  imdbVotes: row.imdb_votes == null ? null : Number(row.imdb_votes),
  rt: row.rt_score == null ? null : Number(row.rt_score),
  imdbId: row.imdb_id || null
});

const due = (row, now) => !row || now - Date.parse(row.fetched_at) > (row.imdb_rating == null && row.rt_score == null ? RETRY_MISSING_AFTER : FRESH_FOR);

async function lookUp(id, apiKey) {
  const { imdb_id: imdbId } = await tmdb(`movie/${id}/external_ids`);
  if (!/^tt\d{5,10}$/.test(imdbId || '')) return { tmdb_id: id, imdb_id: null, imdb_rating: null, imdb_votes: null, rt_score: null };
  return { tmdb_id: id, imdb_id: imdbId, pending: true, apiKey };
}

/**
 * Cached ratings for the given TMDB ids, filling up to `fill` missing or stale
 * films from OMDb within the day's allowance. Never throws: a film whose rating
 * cannot be had is simply absent, and callers fall back to TMDB for it.
 */
export async function ratingsFor(ids, { fill = 0 } = {}) {
  const wanted = [...new Set((ids || []).map(Number).filter(n => Number.isSafeInteger(n) && n > 0))].slice(0, MAX_IDS);
  const found = new Map();
  const db = serviceDb();
  if (!db || !wanted.length) return found;
  let rows = [];
  try {
    rows = await db(`film_ratings?tmdb_id=in.(${wanted.join(',')})&select=*`);
  } catch {
    return found;
  }
  const byId = new Map(rows.map(r => [Number(r.tmdb_id), r]));
  const now = Date.now();
  for (const [id, row] of byId) found.set(id, toRating(row));

  const apiKey = key();
  const stale = wanted.filter(id => due(byId.get(id), now)).slice(0, Math.max(0, Math.min(fill, 10)));
  if (!apiKey || !stale.length) return found;

  // Resolving the IMDb id costs a TMDB call, not OMDb allowance, so a film TMDB
  // cannot map is recorded without spending any of the day's budget.
  const resolved = (await Promise.allSettled(stale.map(id => lookUp(id, apiKey))))
    .filter(r => r.status === 'fulfilled').map(r => r.value);
  const unmapped = resolved.filter(r => !r.pending);
  let pending = resolved.filter(r => r.pending);
  if (pending.length) {
    let granted = 0;
    try {
      granted = Number(await db('rpc/claim_omdb_budget', { method: 'POST', body: { wanted: pending.length, daily_cap: OMDB_DAILY_CAP } })) || 0;
    } catch {
      granted = 0;
    }
    pending = pending.slice(0, granted);
  }
  const fetched = [];
  const results = await Promise.allSettled(pending.map(async p => {
    const data = await remote(`https://www.omdbapi.com/?apikey=${encodeURIComponent(p.apiKey)}&i=${p.imdb_id}`);
    // "Request limit reached!" or a bad key is the provider's problem, not a fact
    // about the film: record nothing, so it is tried again another day.
    if (data?.Response === 'False' && !/not found|incorrect imdb id/i.test(data?.Error || '')) return null;
    return { tmdb_id: p.tmdb_id, imdb_id: p.imdb_id, ...parseOmdb(data?.Response === 'False' ? {} : data) };
  }));
  for (const r of results) if (r.status === 'fulfilled' && r.value) fetched.push(r.value);

  const writes = [...unmapped, ...fetched].map(r => ({ ...r, fetched_at: new Date(now).toISOString() }));
  if (writes.length) {
    try {
      await db('film_ratings?on_conflict=tmdb_id', { method: 'POST', body: writes, prefer: 'resolution=merge-duplicates,return=minimal' });
    } catch {/* The values are still returned; they are simply fetched again next time. */}
  }
  for (const w of writes) found.set(Number(w.tmdb_id), toRating(w));
  return found;
}

/** Copies each film's cached ratings onto it, in the field names scoring reads. */
export async function attachRatings(movies, options) {
  const ratings = await ratingsFor(movies.map(m => m.id), options);
  return movies.map(m => {
    const r = ratings.get(Number(m.id));
    return r ? { ...m, imdb_rating: r.imdb, imdb_votes: r.imdbVotes, rt_score: r.rt } : m;
  });
}
