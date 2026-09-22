import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { parseOmdb, ratingsFor, attachRatings, OMDB_DAILY_CAP } from '../server/ratings.js';
import { ratings } from '../api/ratings.js';
import { execute } from '../server/http.js';

const originalFetch = globalThis.fetch;
const json = (data, status = 200) => new Response(data === undefined ? '' : JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  process.env.APP_URL = 'https://umbrify.test';
  process.env.SUPABASE_URL = 'https://db.test';
  process.env.SUPABASE_ANON_KEY = 'public-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  process.env.TMDB_KEY = 'tmdb-key';
  process.env.OMDB_KEY = 'omdb-key';
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.OMDB_KEY;
  delete process.env.VITE_OMDB_KEY;
});

// A fake of the three services, recording what the code asked of each.
function services({ cached = [], budget = 100, imdbIds = {}, omdb = {} } = {}) {
  const calls = { omdb: [], tmdb: [], writes: [], claims: [] };
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.startsWith('https://db.test/rest/v1/film_ratings?tmdb_id=in.')) {
      const ids = u.match(/in\.\(([^)]*)\)/)[1].split(',').map(Number);
      return json(cached.filter(r => ids.includes(r.tmdb_id)));
    }
    if (u === 'https://db.test/rest/v1/rpc/claim_omdb_budget') {
      const { wanted, daily_cap } = JSON.parse(init.body);
      calls.claims.push({ wanted, daily_cap });
      const granted = Math.min(wanted, budget);
      budget -= granted;
      return json(granted);
    }
    if (u.startsWith('https://db.test/rest/v1/film_ratings?on_conflict=')) {
      calls.writes.push(...JSON.parse(init.body));
      return json(undefined, 201);
    }
    const external = u.match(/themoviedb\.org\/3\/movie\/(\d+)\/external_ids/);
    if (external) {
      calls.tmdb.push(Number(external[1]));
      return json({ imdb_id: imdbIds[external[1]] ?? null });
    }
    const title = u.match(/omdbapi\.com\/\?apikey=[^&]*&i=(tt\d+)/);
    if (title) {
      calls.omdb.push(title[1]);
      const answer = omdb[title[1]];
      return typeof answer === 'function' ? answer() : json(answer ?? { Response: 'False', Error: 'Movie not found!' });
    }
    throw new Error(`unexpected request ${u}`);
  };
  return calls;
}

const inception = { Response: 'True', imdbRating: '8.8', imdbVotes: '2,612,345', Ratings: [{ Source: 'Internet Movie Database', Value: '8.8/10' }, { Source: 'Rotten Tomatoes', Value: '87%' }] };

test('OMDb answers are reduced to plausible values, and absent ones stay null', () => {
  assert.deepEqual(parseOmdb(inception), { imdb_rating: 8.8, imdb_votes: 2612345, rt_score: 87 });
  assert.deepEqual(parseOmdb({ imdbRating: 'N/A', imdbVotes: 'N/A', Ratings: [] }), { imdb_rating: null, imdb_votes: null, rt_score: null });
  // Rotten Tomatoes is often missing for world cinema; IMDb must survive without it.
  assert.deepEqual(parseOmdb({ imdbRating: '7.1', imdbVotes: '812' }), { imdb_rating: 7.1, imdb_votes: 812, rt_score: null });
  assert.deepEqual(parseOmdb({ imdbRating: '11', Ratings: [{ Source: 'Rotten Tomatoes', Value: '140%' }] }), { imdb_rating: null, imdb_votes: null, rt_score: null });
  assert.deepEqual(parseOmdb(undefined), { imdb_rating: null, imdb_votes: null, rt_score: null });
});

test('cached ratings are served without spending any OMDb allowance', async () => {
  const calls = services({ cached: [{ tmdb_id: 27205, imdb_id: 'tt1375666', imdb_rating: '8.8', imdb_votes: 2600000, rt_score: 87, fetched_at: new Date().toISOString() }] });
  const found = await ratingsFor([27205], { fill: 6 });
  assert.deepEqual(found.get(27205), { imdb: 8.8, imdbVotes: 2600000, rt: 87, imdbId: 'tt1375666' });
  assert.equal(calls.omdb.length, 0);
  assert.equal(calls.claims.length, 0);
});

test('a missing film is looked up once, stored, and returned', async () => {
  const calls = services({ imdbIds: { 27205: 'tt1375666' }, omdb: { tt1375666: inception } });
  const found = await ratingsFor([27205], { fill: 6 });
  assert.deepEqual(found.get(27205), { imdb: 8.8, imdbVotes: 2612345, rt: 87, imdbId: 'tt1375666' });
  assert.deepEqual(calls.omdb, ['tt1375666']);
  assert.deepEqual(calls.claims, [{ wanted: 1, daily_cap: OMDB_DAILY_CAP }]);
  assert.equal(calls.writes.length, 1);
  assert.equal(calls.writes[0].tmdb_id, 27205);
  assert.ok(!('apiKey' in calls.writes[0]) && !JSON.stringify(calls.writes).includes('omdb-key'), 'the API key must never be stored');
});

test('the daily allowance caps OMDb calls and the rest fall back silently', async () => {
  const calls = services({ budget: 1, imdbIds: { 1: 'tt0000001', 2: 'tt0000002', 3: 'tt0000003' }, omdb: { tt0000001: inception, tt0000002: inception, tt0000003: inception } });
  const found = await ratingsFor([1, 2, 3], { fill: 6 });
  assert.equal(calls.omdb.length, 1);
  assert.equal(found.size, 1);
});

test('films TMDB cannot map to IMDb are recorded without spending allowance', async () => {
  const calls = services({ imdbIds: {} });
  const found = await ratingsFor([555], { fill: 6 });
  assert.equal(calls.claims.length, 0);
  assert.equal(calls.omdb.length, 0);
  assert.equal(calls.writes.length, 1);
  assert.equal(calls.writes[0].imdb_id, null);
  assert.deepEqual(found.get(555), { imdb: null, imdbVotes: null, rt: null, imdbId: null });
});

test('a provider limit is not mistaken for a fact about the film', async () => {
  const calls = services({ imdbIds: { 9: 'tt0000009' }, omdb: { tt0000009: () => json({ Response: 'False', Error: 'Request limit reached!' }, 401) } });
  const found = await ratingsFor([9], { fill: 6 });
  assert.equal(calls.writes.length, 0, 'nothing is cached, so the film is retried another day');
  assert.equal(found.has(9), false);
});

test('a film OMDb does not know is cached as empty so it is not asked again tomorrow', async () => {
  const calls = services({ imdbIds: { 10: 'tt0000010' } });
  await ratingsFor([10], { fill: 6 });
  assert.equal(calls.writes.length, 1);
  assert.equal(calls.writes[0].imdb_rating, null);
});

test('stale rows are refreshed; fresh empty rows are left alone for a week', async () => {
  const old = new Date(Date.now() - 40 * 86400000).toISOString();
  const recent = new Date(Date.now() - 2 * 86400000).toISOString();
  const calls = services({
    cached: [
      { tmdb_id: 20, imdb_id: 'tt0000020', imdb_rating: '6.0', imdb_votes: 10, rt_score: null, fetched_at: old },
      { tmdb_id: 21, imdb_id: null, imdb_rating: null, imdb_votes: null, rt_score: null, fetched_at: recent }
    ],
    imdbIds: { 20: 'tt0000020' }, omdb: { tt0000020: inception }
  });
  await ratingsFor([20, 21], { fill: 6 });
  assert.deepEqual(calls.tmdb, [20]);
});

test('without a key or a service credential nothing is fetched and nothing breaks', async () => {
  delete process.env.OMDB_KEY;
  let calls = services({ imdbIds: { 1: 'tt0000001' }, omdb: { tt0000001: inception } });
  assert.equal((await ratingsFor([1], { fill: 6 })).size, 0);
  assert.equal(calls.omdb.length, 0);
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.OMDB_KEY = 'omdb-key';
  calls = services();
  assert.equal((await ratingsFor([1], { fill: 6 })).size, 0);
});

test('the legacy VITE_ variable still works, so no environment change is needed to deploy', async () => {
  delete process.env.OMDB_KEY;
  process.env.VITE_OMDB_KEY = 'legacy-key';
  const calls = services({ imdbIds: { 27205: 'tt1375666' }, omdb: { tt1375666: inception } });
  await ratingsFor([27205], { fill: 6 });
  assert.equal(calls.omdb.length, 1);
});

test('ratings are copied onto films under the names scoring reads', async () => {
  services({ cached: [{ tmdb_id: 27205, imdb_id: 'tt1375666', imdb_rating: '8.8', imdb_votes: 2600000, rt_score: 87, fetched_at: new Date().toISOString() }] });
  const [withRating, without] = await attachRatings([{ id: 27205, title: 'Inception' }, { id: 1, title: 'Unknown' }]);
  assert.equal(withRating.imdb_rating, 8.8);
  assert.equal(withRating.rt_score, 87);
  assert.equal(without.imdb_rating, undefined);
});

test('the endpoint validates ids and answers without an account', async () => {
  services({ cached: [{ tmdb_id: 27205, imdb_id: 'tt1375666', imdb_rating: '8.8', imdb_votes: 5, rt_score: null, fetched_at: new Date().toISOString() }] });
  const ok = await execute(new Request('https://umbrify.test/api/ratings?ids=27205'), ratings, ['GET']);
  assert.equal(ok.status, 200);
  assert.deepEqual((await ok.json()).ratings['27205'], { imdb: 8.8, imdbVotes: 5, rt: null, imdbId: 'tt1375666' });
  for (const bad of ['', 'abc', '0', '-3', Array.from({ length: 101 }, (_, i) => i + 1).join(',')]) {
    const res = await execute(new Request(`https://umbrify.test/api/ratings?ids=${bad}`), ratings, ['GET']);
    assert.equal(res.status, 400, `ids=${bad.slice(0, 20)}`);
  }
});

import { qualityScore, criticAverage, ratingReach, tasteScore, tasteProfile } from '../shared/taste.js';

test('IMDb and Rotten Tomatoes outrank TMDB when they disagree', () => {
  const tmdbDarling = { vote_average: 8.6, vote_count: 3000, imdb_rating: 5.2, imdb_votes: 40000, rt_score: 20 };
  const criticsChoice = { vote_average: 6.0, vote_count: 3000, imdb_rating: 8.1, imdb_votes: 40000, rt_score: 95 };
  assert.ok(qualityScore(criticsChoice) > qualityScore(tmdbDarling));
  assert.ok(criticAverage(criticsChoice) > 8 && criticAverage(tmdbDarling) < 6);
});

test('a missing Rotten Tomatoes score is not read as 0%', () => {
  const imdbOnly = { imdb_rating: 7.6, imdb_votes: 50000, rt_score: null, vote_average: 7.6, vote_count: 900 };
  assert.equal(criticAverage(imdbOnly), 7.6);
  assert.ok(qualityScore(imdbOnly) > 7.4, 'an absent RT figure must not drag the film down');
  assert.equal(criticAverage({ imdb_rating: 7.6, rt_score: '' }), 7.6);
  assert.equal(criticAverage({ imdb_rating: 7.6, rt_score: undefined }), 7.6);
});

test('films not yet rated externally keep exactly the previous TMDB behaviour', () => {
  const film = { vote_average: 7.4, vote_count: 420 };
  assert.equal(qualityScore(film), (420 * 7.4 + 100 * 6.2) / 520);
  assert.equal(criticAverage(film), 7.4);
  assert.equal(ratingReach(film), 420);
});

test('a thin IMDb sample is shrunk, a well-attested one is trusted', () => {
  const obscure = { imdb_rating: 9.4, imdb_votes: 40 };
  const attested = { imdb_rating: 8.4, imdb_votes: 400000 };
  assert.ok(qualityScore(attested) > qualityScore(obscure));
  assert.ok(Math.abs(qualityScore(attested) - 8.4) < .01);
});

test('Rotten Tomatoes alone still produces a usable quality mark', () => {
  assert.equal(criticAverage({ rt_score: 100 }), 9.5);
  assert.equal(criticAverage({ rt_score: 0 }), 4);
  assert.ok(qualityScore({ rt_score: 92 }) > qualityScore({ rt_score: 40 }));
});

test('IMDb reach is expressed in TMDB-sized units so popularity thresholds keep meaning', () => {
  assert.equal(ratingReach({ imdb_rating: 7, imdb_votes: 50000, vote_count: 900 }), 5000);
  assert.equal(ratingReach({ rt_score: 80, vote_count: 900 }), 900);
});

test('personal taste scoring now follows the external reference', () => {
  const profile = tasteProfile([]);
  const hi = tasteScore({ id: 1, genre_ids: [18], imdb_rating: 8.3, imdb_votes: 90000, rt_score: 94, vote_average: 6.1 }, profile);
  const lo = tasteScore({ id: 2, genre_ids: [18], imdb_rating: 5.9, imdb_votes: 90000, rt_score: 31, vote_average: 8.4 }, profile);
  assert.ok(hi > lo);
});
