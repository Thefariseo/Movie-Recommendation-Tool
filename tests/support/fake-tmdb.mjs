// An in-memory stand-in for src/utils/api.js. Tests fill `catalog` with full
// film details and `lists` with what discovery endpoints return.
export const catalog = new Map();
export const lists = { discover: [], trending: [], upcoming: [] };
export const calls = [];
const result = (films) => ({ results: films.map((f) => ({ ...f })), page: 1, total_pages: 1 });
export function reset() { offers?.clear?.(); catalog.clear(); lists.discover = []; lists.trending = []; lists.upcoming = []; calls.length = 0; }
export async function movieDetails(id) {
  calls.push(`details:${id}`);
  const film = catalog.get(Number(id));
  if (!film) throw new Error(`no details for ${id}`);
  return { recommendations: { results: [] }, ...film };
}
export async function discoverMovies() { calls.push('discover'); return result(lists.discover); }
export async function trendingMovies() { return result(lists.trending); }
export async function upcomingMovies() { return result(lists.upcoming); }
export async function personMovieCredits(id) { calls.push(`person:${id}`); return { crew: [], cast: [] }; }
export async function movieCredits(id) { calls.push(`credits:${id}`); return catalog.get(Number(id))?.credits || { crew: [], cast: [] }; }
export const offers = new Map();
export async function movieWatchProviders(id) { return offers.get(Number(id)) || { flatrate: [], rent: [], buy: [], link: null }; }
