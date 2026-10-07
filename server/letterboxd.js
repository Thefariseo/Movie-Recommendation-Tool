import { HttpError, database } from './http.js';
import { tmdb } from './tmdb.js';
import { normalizeMovie } from '../shared/library.js';

// Letterboxd has no public API, but each member's diary is a public RSS feed
// with the TMDB id, the rating and the date of their latest entries (about 50).
// Reading it keeps Umbrify in step after the first full import.
export const SYNC_EVERY = 3 * 60 * 60 * 1000; // on a visit, at most this often
export const USERNAME = /^[A-Za-z0-9_]{1,40}$/;

const entity = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = text => String(text || '')
  .replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1')
  .replace(/&(?:#(\d+)|#x([0-9a-f]+)|(\w+));/gi, (m, dec, hex, name) =>
    dec ? String.fromCodePoint(Number(dec)) : hex ? String.fromCodePoint(parseInt(hex, 16)) : entity[name.toLowerCase()] ?? m)
  .trim();
const tag = (item, name) => {
  const m = item.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]) : '';
};

/** The diary entries of a Letterboxd RSS feed, newest first. Lists and reviews of non-films are skipped. */
export function parseDiary(xml) {
  const entries = [];
  for (const [, item] of String(xml || '').matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const id = Number(tag(item, 'tmdb:movieId'));
    const title = tag(item, 'letterboxd:filmTitle');
    if (!Number.isSafeInteger(id) || id <= 0 || !title) continue;
    const stars = Number(tag(item, 'letterboxd:memberRating'));
    const published = Date.parse(tag(item, 'pubDate'));
    const watched = tag(item, 'letterboxd:watchedDate');
    entries.push({
      id,
      title: title.slice(0, 300),
      year: Number(tag(item, 'letterboxd:filmYear')) || null,
      // Half stars out of five become Umbrify's one-to-ten scale.
      rating: stars > 0 && stars <= 5 ? Math.round(stars * 2) : null,
      published: Number.isFinite(published) ? published : 0,
      watched: /^\d{4}-\d{2}-\d{2}$/.test(watched) ? watched : null
    });
  }
  return entries.sort((a, b) => b.published - a.published);
}

/** Reads a member's diary; a 404 means the username does not exist. */
export async function fetchDiary(username) {
  if (!USERNAME.test(username || '')) throw new HttpError(400, 'Enter your Letterboxd username.');
  let response;
  try {
    response = await fetch(`https://letterboxd.com/${encodeURIComponent(username)}/rss/`, {
      headers: { Accept: 'application/rss+xml, application/xml', 'User-Agent': 'Umbrify (+https://umbrify.vercel.app)' },
      signal: AbortSignal.timeout(10000)
    });
  } catch {
    throw new HttpError(502, 'Letterboxd could not be reached. Try again later.');
  }
  if (response.status === 404) throw new HttpError(404, 'No Letterboxd member has that username.');
  if (!response.ok) throw new HttpError(502, 'Letterboxd could not be reached. Try again later.');
  return parseDiary(await response.text());
}

/** Poster and genres from TMDB for films new to the library; the diary's own title and year if TMDB fails. */
async function describe(entry) {
  try {
    const film = await tmdb(`movie/${entry.id}`, { language: 'en-US' });
    return normalizeMovie({ ...film, id: entry.id, title: film?.title || entry.title, year: entry.year || undefined });
  } catch {
    return normalizeMovie({ id: entry.id, title: entry.title, year: entry.year });
  }
}

/**
 * Applies the diary entries published since the last sync. Each entry is read
 * once, so a rating the member changes in Umbrify afterwards stays unless they
 * log the film again on Letterboxd.
 */
export async function syncMember(link, { db = database(null, true), diary } = {}) {
  if (!(await db('rpc/lock_letterboxd', { method: 'POST', body: { actor: link.user_id } }))) return { busy: true, added: 0, rated: 0 };
  const now = new Date().toISOString();
  try {
    const entries = diary || await fetchDiary(link.username);
    const after = link.cursor ? Date.parse(link.cursor) : 0;
    const fresh = [];
    const seen = new Set();
    for (const e of entries) {
      if (e.published <= after || seen.has(e.id)) continue; // newest entry for a film wins
      seen.add(e.id);
      fresh.push(e);
    }
    let result = { added: 0, rated: 0 };
    if (fresh.length) {
      const known = new Set((await db(`user_movies?user_id=eq.${link.user_id}&kind=eq.watched&deleted=eq.false&movie_id=in.(${fresh.map(e => e.id).join(',')})&select=movie_id`)).map(r => Number(r.movie_id)));
      const rows = [];
      for (let i = 0; i < fresh.length; i += 10) {
        rows.push(...await Promise.all(fresh.slice(i, i + 10).map(async e => ({
          movie_id: e.id,
          rating: e.rating,
          watched_at: new Date(e.published || Date.now()).toISOString(),
          // A film already in the library only needs its rating, not a TMDB call.
          movie: known.has(e.id) ? { id: e.id, title: e.title, year: e.year } : await describe(e)
        }))));
      }
      result = await db('rpc/apply_letterboxd', { method: 'POST', body: { actor: link.user_id, entries: rows } });
    }
    const newest = entries.reduce((m, e) => Math.max(m, e.published), after);
    await db(`letterboxd_links?user_id=eq.${link.user_id}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: { cursor: newest ? new Date(newest).toISOString() : null, synced_at: now, last_added: result.added || 0, last_rated: result.rated || 0, last_error: null, locked_until: null }
    });
    return { added: result.added || 0, rated: result.rated || 0 };
  } catch (e) {
    await db(`letterboxd_links?user_id=eq.${link.user_id}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: { synced_at: now, last_error: String(e.status ? e.message : 'The sync failed. Try again later.').slice(0, 200), locked_until: null }
    }).catch(() => {});
    throw e;
  }
}

/** The night run: every linked member, least recently synced first, within the time allowed. */
export async function syncEveryone({ db = database(null, true), budgetMs = 45000 } = {}) {
  const started = Date.now();
  const links = await db('letterboxd_links?select=user_id,username,cursor,synced_at&order=synced_at.asc.nullsfirst&limit=500');
  let members = 0, failed = 0;
  for (const link of links) {
    if (Date.now() - started > budgetMs) break;
    try {
      await syncMember(link, { db });
      members++;
    } catch {
      failed++;
    }
  }
  return { members, failed, remaining: links.length - members - failed };
}

// ── Exact films for an export ────────────────────────────────────────────────
// A Letterboxd export names films by title and year only, which can point at
// the wrong film (a remake, a namesake). Each row also carries the film's
// Letterboxd link, whose page names its TMDB id. The import asks for that only
// when the title and year leave a doubt; answers are kept for everyone.
const SHORT = /^https:\/\/boxd\.it\/([A-Za-z0-9]{1,12})\/?$/;
const PAGE = /^https:\/\/letterboxd\.com\/(?:[A-Za-z0-9_]{1,40}\/)?film\/([a-z0-9-]{1,200})\/?(?:\d+\/?)?$/;

/** The canonical form of a Letterboxd film link, or null for anything else. */
export function filmLink(uri) {
  const u = String(uri || '').trim();
  const short = u.match(SHORT);
  if (short) return `https://boxd.it/${short[1]}`;
  const page = u.match(PAGE);
  return page ? `https://letterboxd.com/film/${page[1]}/` : null;
}

/** The TMDB movie id named on a Letterboxd film page (null for TV, or when absent). */
export function tmdbIdOnPage(html) {
  const body = String(html || '').match(/<body[^>]*>/)?.[0] || '';
  if (!/data-tmdb-type="movie"/.test(body)) return null;
  const id = Number(body.match(/data-tmdb-id="(\d+)"/)?.[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function readFilmPage(link) {
  const response = await fetch(link, {
    headers: { Accept: 'text/html', 'User-Agent': 'Umbrify (+https://umbrify.vercel.app)' },
    redirect: 'follow',
    signal: AbortSignal.timeout(8000)
  });
  // A missing page is a fact worth keeping; a refusal or an outage is not.
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Letterboxd answered ${response.status}`);
  if (!/^https:\/\/(letterboxd\.com|boxd\.it)\//.test(response.url || link)) return null; // redirected off Letterboxd
  // The id sits on the <body> tag near the top; stop reading once it is in.
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let html = '';
  while (html.length < 200000) {
    const { done, value } = await reader.read();
    if (done) break;
    html += decoder.decode(value, { stream: true });
    if (/<body[^>]*>/.test(html)) break;
  }
  reader.cancel().catch(() => {});
  return tmdbIdOnPage(html);
}

/** TMDB ids for up to 25 Letterboxd film links, keyed by the link as sent; links that cannot be read are left out. */
export async function resolveFilms(uris, { db = database(null, true) } = {}) {
  const sent = (uris || []).slice(0, 25).map(u => [String(u), filmLink(u)]).filter(([, l]) => l);
  const links = [...new Set(sent.map(([, l]) => l))];
  const found = {};
  if (!links.length) return {};
  let cached = [];
  try {
    cached = await db(`letterboxd_films?link=in.(${links.map(l => `"${l}"`).join(',')})&select=link,tmdb_id`);
  } catch {/* read them all from Letterboxd */}
  for (const row of cached) if (row.tmdb_id) found[row.link] = Number(row.tmdb_id);
  const missing = links.filter(l => !(l in found) && !cached.some(r => r.link === l));
  const fresh = [];
  for (let i = 0; i < missing.length; i += 6) {
    const results = await Promise.allSettled(missing.slice(i, i + 6).map(readFilmPage));
    results.forEach((r, j) => {
      if (r.status !== 'fulfilled') return; // unreachable now; asked again next time
      fresh.push({ link: missing[i + j], tmdb_id: r.value });
      if (r.value) found[missing[i + j]] = r.value;
    });
  }
  if (fresh.length) {
    await db('letterboxd_films?on_conflict=link', { method: 'POST', body: fresh, prefer: 'resolution=merge-duplicates,return=minimal' }).catch(() => {});
  }
  return Object.fromEntries(sent.filter(([, l]) => found[l]).map(([u, l]) => [u, found[l]]));
}
