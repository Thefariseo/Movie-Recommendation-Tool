import { nodeHandler, HttpError } from '../server/http.js';
import { tmdb } from '../server/tmdb.js';
import { leanMovie, leanFilmography } from '../server/lean.js';

// Public film data, trimmed (server/lean.js) and cached at the edge: the same
// answer serves every visitor asking for that film in that language.
const MOVIE = /^\/movie\/(\d{1,9})$/;
const FILMOGRAPHY = /^\/person\/(\d{1,9})\/movie_credits$/;
// Where a film streams, for one country: TMDB's answer lists every country (~100 KB).
const PROVIDERS = /^\/movie\/(\d{1,9})\/watch\/providers$/;
const APPEND = new Set(['videos', 'credits', 'keywords', 'recommendations']);

export async function film(ctx) {
  const q = ctx.url.searchParams;
  const path = q.get('path') || '';
  const language = q.get('language') || 'en-US';
  if (!/^[a-z]{2}-[A-Z]{2}$/.test(language)) throw new HttpError(400, 'Invalid language.');
  const params = { language };
  let lean;
  if (MOVIE.test(path)) {
    const append = (q.get('append_to_response') || '').split(',').filter(Boolean);
    if (append.some(a => !APPEND.has(a))) throw new HttpError(400, 'Invalid film details.');
    if (append.length) params.append_to_response = append.join(',');
    const videos = q.get('include_video_language');
    if (videos) {
      if (!/^[a-z,]{1,40}$|^(?:[a-z]{2},)*null$/.test(videos)) throw new HttpError(400, 'Invalid video languages.');
      params.include_video_language = videos;
    }
    lean = leanMovie;
  } else if (PROVIDERS.test(path)) {
    const region = q.get('region') || '';
    if (!/^[A-Z]{2}$/.test(region)) throw new HttpError(400, 'Invalid country.');
    const data = await tmdb(path.slice(1), {});
    const offers = data.results?.[region] || {};
    const keep = list => (list || []).map(({ provider_id, provider_name, logo_path, display_priority }) => ({ provider_id, provider_name, logo_path, display_priority }));
    ctx.headers = { 'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800' };
    return { id: data.id, results: { [region]: { link: offers.link || null, flatrate: keep(offers.flatrate), rent: keep(offers.rent), buy: keep(offers.buy) } } };
  } else if (FILMOGRAPHY.test(path)) {
    lean = leanFilmography;
  } else throw new HttpError(400, 'Unknown film data.');
  let data;
  try {
    data = await tmdb(path.slice(1), params);
  } catch (e) {
    // TMDB's own refusals reach here as 400s: for a film id, that is "no such film".
    throw e.status === 400 ? new HttpError(404, 'No such film.') : e;
  }
  // A day fresh at the edge, a week served stale while it refreshes.
  ctx.headers = { 'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800' };
  return lean(data);
}
export default nodeHandler(film, ['GET']);
