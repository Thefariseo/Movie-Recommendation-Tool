import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execute } from '../server/http.js';
import { film } from '../api/film.js';
import { leanMovie, leanFilmography } from '../server/lean.js';

const originalFetch = globalThis.fetch;
beforeEach(() => { process.env.APP_URL = 'https://umbrify.test'; process.env.TMDB_KEY = 'tmdb-key'; });
afterEach(() => { globalThis.fetch = originalFetch; });

const crew = (job, i) => ({ id: i, name: `Person ${i}`, job, department: job === 'Director' ? 'Directing' : 'Crew', credit_id: `c${i}` });
const big = {
  id: 129, title: 'Spirited Away', overview: 'A girl.', runtime: 125, genres: [{ id: 16, name: 'Animation' }],
  credits: {
    cast: Array.from({ length: 60 }, (_, i) => ({ id: 1000 + i, name: `Actor ${i}`, character: `Role ${i}`, order: 59 - i, profile_path: null, cast_id: i, adult: false })),
    crew: [crew('Director', 1), crew('Screenplay', 2), crew('Director of Photography', 3), crew('Original Music Composer', 4), ...Array.from({ length: 200 }, (_, i) => crew('Grip', 100 + i))]
  },
  keywords: { keywords: Array.from({ length: 50 }, (_, i) => ({ id: i, name: `k${i}` })) },
  videos: { results: [{ site: 'YouTube', type: 'Trailer', key: 'a', iso_639_1: 'it' }, { site: 'YouTube', type: 'Featurette', key: 'b' }, { site: 'Vimeo', type: 'Trailer', key: 'c' }] },
  recommendations: { page: 1, results: [{ id: 128, title: 'Princess Mononoke', overview: 'x'.repeat(900), genre_ids: [16], vote_count: 9000, backdrop_path: '/b.jpg', poster_path: '/p.jpg' }] }
};

test('a film keeps its facts, its first twenty actors, its key crew and its trailers', () => {
  const lean = leanMovie(big);
  assert.equal(lean.runtime, 125);
  assert.deepEqual(lean.genres, big.genres);
  assert.equal(lean.credits.cast.length, 20);
  assert.equal(lean.credits.cast[0].order, 0); // billed first
  assert.equal(lean.credits.cast[0].character, 'Role 59');
  assert.deepEqual(lean.credits.crew.map(c => c.job), ['Director', 'Screenplay', 'Director of Photography', 'Original Music Composer']);
  assert.deepEqual(lean.videos.results.map(v => v.key), ['a']);
  assert.equal(lean.keywords.keywords.length, 40);
  assert.equal(lean.recommendations.results[0].overview, undefined);
  assert.equal(lean.recommendations.results[0].poster_path, '/p.jpg');
  assert.ok(JSON.stringify(lean).length < JSON.stringify(big).length / 4);
});

test('a filmography keeps every role played and the key jobs behind the camera', () => {
  const lean = leanFilmography({ id: 2, cast: [{ id: 1, title: 'A', character: 'X', overview: 'long', credit_id: 'z' }], crew: [{ id: 2, title: 'B', job: 'Director' }, { id: 3, title: 'C', job: 'Grip' }] });
  assert.deepEqual(lean.cast, [{ id: 1, title: 'A', character: 'X', order: undefined }]);
  assert.deepEqual(lean.crew.map(f => f.id), [2]);
});

test('the film endpoint is public, trimmed and cacheable; anything else is refused', async () => {
  const asked = [];
  globalThis.fetch = async url => {
    asked.push(String(url));
    if (String(url).includes('/movie/404')) return Response.json({ status_message: 'not found' }, { status: 404 });
    return Response.json(big);
  };
  const get = path => execute(new Request(`https://umbrify.test/api/film?${path}`), film);
  const ok = await get('path=%2Fmovie%2F129&language=it-IT&append_to_response=credits,keywords');
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('cache-control'), /public.*s-maxage=86400/);
  assert.equal(ok.headers.get('vary'), null);
  assert.equal((await ok.json()).credits.cast.length, 20);
  assert.match(asked[0], /movie\/129\?.*language=it-IT.*append_to_response=credits%2Ckeywords/);
  assert.equal((await get('path=%2Fmovie%2F404&language=en-US')).status, 404);
  for (const bad of ['path=%2Fsearch%2Fmovie', 'path=%2Fmovie%2F1&append_to_response=account_states', 'path=%2Fmovie%2F1&language=xx', 'path=%2Fmovie%2F1%2Freviews']) {
    const res = await get(bad);
    assert.equal(res.status, 400, bad);
    assert.match(res.headers.get('cache-control'), /no-store/);
  }
});
