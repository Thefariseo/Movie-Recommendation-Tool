// =====================================================
// File: src/utils/api.js
// Description: Centralised TMDB API client with lightweight in‑memory cache.
// =====================================================
import axios from "axios";

/**
 * IMPORTANT
 * Make sure you expose your TMDB key to Vite with the name VITE_TMDB_KEY
 * in a .env file placed at the project root, e.g.:
 *   VITE_TMDB_KEY=03d2df4d3ea6faca84abadc1a6811e0c
 */
const API_KEY = import.meta.env.VITE_TMDB_KEY;
const BASE_URL = "https://api.themoviedb.org/3";

// Create an axios instance with default params so that we don't have to repeat them.
const client = axios.create({
  baseURL: BASE_URL,
  params: {
    api_key: API_KEY,
    language: "en-US",
  },
});

// Simple in‑memory cache to avoid hammering the rate‑limited TMDB API.
const cache = new Map();
const queue  = [];
const MAX_CONCURRENT = 3;

/**
 * Generic GET wrapper with caching.
 * @param {string} url - endpoint path beginning with '/'.
 * @param {object} [params] - additional query parameters.
 */
async function get(url, params = {}) {
  const key = url + JSON.stringify(params);
  if (cache.has(key)) return cache.get(key);
  
  // --- simple promise queue ---
  while (queue.length >= MAX_CONCURRENT) await queue[0];
  const pending = client.get(url, { params }).then(r => r.data);
  queue.push(pending);

  const data = await pending;
  queue.splice(queue.indexOf(pending), 1);
  cache.set(key, data);
  return data;
}

// =========================
// Convenience API helpers
// =========================
export function searchMovies(query, page = 1) {
  return get("/search/movie", { query, page, include_adult: false });
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

export function movieDetails(id) {
  return get(`/movie/${id}`, { append_to_response: "videos,credits,recommendations" });
}
/** TMDB → external_ids per ricavare IMDb */
export function externalIds(id) {
  return get(`/movie/${id}/external_ids`);
}

/** Rotten Tomatoes score tramite OMDb (richiede API key gratuita)  
    Imposta `VITE_OMDB_KEY` nel `.env` se vuoi il tomatoMeter,
    altrimenti restituirà null senza errori. */
export async function rottenScore(imdbID) {
  const key = import.meta.env.VITE_OMDB_KEY;
  if (!key) return null;
  try {
    const url = `https://www.omdbapi.com/?apikey=${key}&i=${imdbID}`;
    const { Ratings } = await (await fetch(url)).json();
    const rt = Ratings?.find((r) => r.Source === "Rotten Tomatoes");
    return rt ? rt.Value : null;
  } catch {
    return null;
  }
}

// You can add more specific helpers as your app grows (reviews, similar, etc.)

/** TMDB /discover/movie with arbitrary filter params.
 *  Default vote_count.gte is intentionally low (50) so that world cinema
 *  and art-house films are not systematically excluded.
 *  Callers may override by passing their own "vote_count.gte" in params. */
export function discoverMovies(params = {}) {
  return get("/discover/movie", {
    sort_by: "vote_average.desc",
    "vote_count.gte": 50,
    ...params,
  });
}

/** Credits only (lighter than full movieDetails) */
export function movieCredits(id) {
  return get(`/movie/${id}/credits`);
}

/** Search for people (directors, actors) by name */
export function searchPeople(query) {
  return get("/search/person", { query, include_adult: false });
}

/** Full movie filmography for a person — returns { cast: [...], crew: [...] }
 *  Use crew (filter job === "Director") for directors,
 *  cast for actors. This gives us the authoritative candidate pool
 *  when the user filters by a specific person. */
export function personMovieCredits(personId) {
  return get(`/person/${personId}/movie_credits`);
}

/** Streaming / rental / purchase providers for a film.
 *  countryCode: ISO 3166-1 alpha-2 (e.g. "US", "IT", "FR").
 *  Returns { flatrate, rent, buy, link } arrays for that country. */
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
