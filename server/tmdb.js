import { HttpError, remote } from './http.js';
export async function tmdb(path, params = {}) {
  const key = process.env.TMDB_KEY || process.env.VITE_TMDB_KEY;
  if (!key) throw new HttpError(503, 'Film discovery is not configured yet.');
  const query = new URLSearchParams({
    api_key: key,
    language: 'en-US',
    ...params
  });
  return remote(`https://api.themoviedb.org/3/${path}?${query}`);
}
