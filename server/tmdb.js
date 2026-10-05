import { HttpError, remote, tmdbLocale } from './http.js';

// Answers are kept for a while in a warm instance: "Other picks", a second
// member asking for the same films, the critic and the night all ask TMDB
// for the same details again and again. Two callers asking at once share one
// request. Kept per fetch implementation, so a replaced fetch (as in tests)
// starts from an empty cache.
const TTL_MS = 60 * 60 * 1000;
const MAX_ENTRIES = 1500;
const caches = new WeakMap();
function cacheFor(fetcher) {
  if (!caches.has(fetcher)) caches.set(fetcher, { answers: new Map(), inflight: new Map() });
  return caches.get(fetcher);
}

export async function tmdb(path, params = {}) {
  const key = process.env.TMDB_KEY || process.env.VITE_TMDB_KEY;
  if (!key) throw new HttpError(503, 'Film discovery is not configured yet.');
  const query = new URLSearchParams({
    api_key: key,
    language: tmdbLocale(),
    ...params
  });
  const url = `https://api.themoviedb.org/3/${path}?${query}`;
  const { answers, inflight } = cacheFor(globalThis.fetch);
  const hit = answers.get(url);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  if (inflight.has(url)) return inflight.get(url);
  const request = remote(url).then(data => {
    answers.delete(url);
    answers.set(url, { data, at: Date.now() });
    if (answers.size > MAX_ENTRIES) answers.delete(answers.keys().next().value);
    return data;
  }).finally(() => inflight.delete(url));
  inflight.set(url, request);
  return request;
}
