// =====================================================
// File: src/utils/api.js
// Centralised TMDB API client with lightweight in-memory cache.
// =====================================================
import { viewerLanguage } from "./trailers";
import { currentLanguage, tmdbLocale } from "../i18n/index.js";
import { track } from "./activity";
import { noteTitles } from "./titleStore";

const API_KEY = import.meta.env.VITE_TMDB_KEY;
const BASE_URL = "https://api.themoviedb.org/3";

// A film's details and a person's filmography are the heaviest answers TMDB
// gives (hundreds of credited names); the site's own /api/film returns them
// trimmed to what is read, cached at the edge for every visitor. TMDB itself
// answers if that is unavailable.
const LEAN = /^\/(movie\/\d+|person\/\d+\/movie_credits)$/;
let leanDown = false;

/** One TMDB GET with the key and language every request carries. */
export async function tmdbGet(url, params = {}, { signal } = {}) {
  // Titles, plots and genres come in the interface language.
  const query = new URLSearchParams({ language: tmdbLocale() });
  for (const [k, v] of Object.entries(params)) if (v != null) query.set(k, String(v));
  if (LEAN.test(url) && !leanDown) {
    // Offline, both would fail alike: a network error is not retried at TMDB.
    const lean = await fetch(`/api/film?path=${encodeURIComponent(url)}&${query}`, { signal });
    // A site without the endpoint (a static preview) is not asked again this visit;
    // a server error falls back to TMDB for this request only.
    if (!(lean.headers.get("content-type") || "").includes("json")) leanDown = true;
    else if (lean.ok) return lean.json();
    else if (lean.status < 500) throw new Error(`TMDB ${lean.status}`);
  }
  query.set("api_key", API_KEY);
  const response = await fetch(`${BASE_URL}${url}?${query}`, { signal });
  if (!response.ok) throw new Error(`TMDB ${response.status}`);
  return response.json();
}

// In-memory cache of answers, the least recently used dropped past a bound so
// a long visit does not keep every film it ever opened.
const CACHE_MAX = 800;
const cache = new Map();
const remember = (key, data) => {
  cache.delete(key);
  cache.set(key, data);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
};
const inflight = new Map();
const queue  = [];
// Well under TMDB's rate limit; recommendations fetch a shortlist in batches of 6.
const MAX_CONCURRENT = 6;

async function get(url, params = {}) {
  const key = url + JSON.stringify(params);
  if (cache.has(key)) { const hit = cache.get(key); remember(key, hit); return hit; }
  // Two callers asking for the same film at once share one request.
  if (inflight.has(key)) return inflight.get(key);

  const request = (async () => {
    // Waiting for a free slot must not inherit someone else's failure: a 404
    // for one film used to reject every request queued behind it.
    while (queue.length >= MAX_CONCURRENT) await Promise.race(queue.map((p) => p.catch(() => {})));
    const pending = track(tmdbGet(url, params));
    queue.push(pending);
    try {
      const data = await pending;
      remember(key, data);
      // Answers in another language (a search matched in English) are not
      // the interface's titles.
      if (!params.language) noteTitles(data);
      return data;
    } finally {
      queue.splice(queue.indexOf(pending), 1);
    }
  })();
  inflight.set(key, request);
  try {
    return await request;
  } finally {
    inflight.delete(key);
  }
}

// ─── Movie endpoints ─────────────────────────────────────────────────────────

export function searchMovies(query, page = 1) {
  return get("/search/movie", { query, page, include_adult: false });
}

/**
 * Candidates for an imported entry: searched in English, the language
 * Letterboxd and most CSV exports name films in, with and without its year
 * (TMDB only finds some films under an English title when the year is given).
 */
export async function importCandidates(title, year) {
  const ask = (params) => get("/search/movie", { query: title, include_adult: false, language: "en-US", ...params }).catch(() => ({ results: [] }));
  const [withYear, without] = await Promise.all([year ? ask({ year }) : { results: [] }, ask({})]);
  const seen = new Set();
  return [...(withYear.results || []), ...(without.results || [])].filter((m) => !seen.has(m.id) && seen.add(m.id));
}

export function trendingMovies(timeWindow = "week") {
  return get(`/trending/movie/${timeWindow}`);
}

export function topRatedMovies(page = 1) {
  return get("/movie/top_rated", { page });
}

export function upcomingMovies(page = 1) {
  return get("/movie/upcoming", { page });
}

/**
 * Full movie details: videos, credits, keywords, recommendations.
 * Keywords are used for nanogenre/mood matching (Nanocrowd-style approach).
 */
export async function movieDetails(id) {
  const details = await get(`/movie/${id}`, detailParams());
  // A film without a plot in the interface language keeps the English one.
  if (details?.overview || currentLanguage() === "en") return details;
  const english = await get(`/movie/${id}`, { language: "en-US" }).catch(() => null);
  return english?.overview ? { ...details, overview: english.overview } : details;
}

const detailParams = () => ({
  append_to_response: "videos,credits,keywords,recommendations",
  // Otherwise TMDB returns only English videos, and many films have none.
  include_video_language: `${viewerLanguage()},en,null`,
});

/**
 * A film with its credits and keywords, without the videos and the
 * recommendations: about a third of the full details, for comparing films.
 * Full details already fetched for the film are used instead.
 */
export function movieCore(id) {
  const full = cache.get(`/movie/${id}` + JSON.stringify(detailParams()));
  return full ? Promise.resolve(full) : get(`/movie/${id}`, { append_to_response: "credits,keywords" });
}

/**
 * A film's title in the interface language: from details already fetched,
 * else from its basic details (the lightest answer that has it).
 */
export async function movieTitle(id) {
  for (const params of [detailParams(), { append_to_response: "credits,keywords" }, {}]) {
    const hit = cache.get(`/movie/${id}` + JSON.stringify(params));
    if (hit?.title) return hit.title;
  }
  return (await get(`/movie/${id}`)).title;
}

/**
 * The title to save for a film found in English (an import): its title in the
 * interface language, so a library reads in one language.
 */
export async function localTitle(film) {
  if (currentLanguage() === "en") return film.title;
  return movieTitle(film.id).catch(() => film.title);
}

/** Fetch TMDB keywords only (lighter call for bulk keyword profiling) */
export function movieKeywords(id) {
  return get(`/movie/${id}/keywords`);
}

export function externalIds(id) {
  return get(`/movie/${id}/external_ids`);
}

/**
 * TMDB /discover/movie.
 * Default vote_count.gte is intentionally low (30) so world cinema and
 * art-house films are not systematically excluded.
 */
export function discoverMovies(params = {}) {
  return get("/discover/movie", {
    sort_by: "vote_average.desc",
    "vote_count.gte": 30,
    ...params,
  });
}

export function movieCredits(id) {
  return get(`/movie/${id}/credits`);
}

export function searchPeople(query) {
  return get("/search/person", { query, include_adult: false });
}

export function personMovieCredits(personId) {
  return get(`/person/${personId}/movie_credits`);
}

/** A person's biography, photo and best-known department. */
export async function personDetails(personId) {
  const person = await get(`/person/${personId}`);
  // A biography missing in the interface language comes in English.
  if (person?.biography || currentLanguage() === "en") return person;
  const english = await get(`/person/${personId}`, { language: "en-US" }).catch(() => null);
  return english?.biography ? { ...person, biography: english.biography } : person;
}

/** Films in cinemas now, or soon, in a region. */
export function nowPlayingMovies(region = "US", page = 1) {
  return get("/movie/now_playing", { region, page });
}
export function upcomingInRegion(region = "US", page = 1) {
  return get("/movie/upcoming", { region, page });
}

/**
 * Streaming / rental / purchase providers for a film.
 * countryCode: ISO 3166-1 alpha-2 (e.g. "US", "IT", "FR").
 */
export async function movieWatchProviders(id, countryCode = "US") {
  const data = await get(`/movie/${id}/watch/providers`);
  const region = data.results?.[countryCode] || {};
  return {
    flatrate: region.flatrate || [],
    rent:     region.rent     || [],
    buy:      region.buy      || [],
    link:     region.link     || null,
  };
}

/** Streaming services offered in a region, most prominent first. */
export function watchProviderList(region = "US") {
  return get("/watch/providers/movie", { watch_region: region });
}
