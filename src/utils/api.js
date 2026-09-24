// =====================================================
// File: src/utils/api.js
// Centralised TMDB API client with lightweight in-memory cache.
// =====================================================
import axios from "axios";
import { viewerLanguage } from "./trailers";

const API_KEY = import.meta.env.VITE_TMDB_KEY;
const BASE_URL = "https://api.themoviedb.org/3";

const client = axios.create({
  baseURL: BASE_URL,
  params: {
    api_key: API_KEY,
    language: "en-US",
  },
});

// Simple in-memory cache
const cache = new Map();
const inflight = new Map();
const queue  = [];
// Well under TMDB's rate limit; recommendations fetch a shortlist in batches of 6.
const MAX_CONCURRENT = 6;

async function get(url, params = {}) {
  const key = url + JSON.stringify(params);
  if (cache.has(key)) return cache.get(key);
  // Two callers asking for the same film at once share one request.
  if (inflight.has(key)) return inflight.get(key);

  const request = (async () => {
    // Waiting for a free slot must not inherit someone else's failure: a 404
    // for one film used to reject every request queued behind it.
    while (queue.length >= MAX_CONCURRENT) await Promise.race(queue.map((p) => p.catch(() => {})));
    const pending = client.get(url, { params }).then(r => r.data);
    queue.push(pending);
    try {
      const data = await pending;
      cache.set(key, data);
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
export function movieDetails(id) {
  return get(`/movie/${id}`, {
    append_to_response: "videos,credits,keywords,recommendations",
    // Otherwise TMDB returns only English videos, and many films have none.
    include_video_language: `${viewerLanguage()},en,null`,
  });
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
