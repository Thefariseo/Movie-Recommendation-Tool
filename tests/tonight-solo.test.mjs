import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./support/browser-modules.mjs', import.meta.url);
const tmdb = await import('./support/fake-tmdb.mjs');
const { tonightPicks } = await import('../src/algorithms/tonight.js');

const film = (id, { year = 2005, lang = 'en', genres = [18], runtime = 110, votes = 900 } = {}) => ({
  id, title: `Film ${id}`, genre_ids: genres, genres: genres.map(g => ({ id: g })), original_language: lang, origin_country: ['US'],
  vote_average: 7.6, vote_count: votes, release_date: `${year}-06-01`, popularity: 10, runtime,
  credits: { crew: [], cast: [] }, keywords: { keywords: [] }
});
const FILMS = [film(1), film(2, { year: 1975 }), film(3, { lang: 'ko' }), film(4, { genres: [27] }), film(5, { runtime: 150 }), film(6)];
beforeEach(() => {
  tmdb.reset();
  for (const f of FILMS) tmdb.catalog.set(f.id, f);
  tmdb.lists.discover = FILMS.map(({ credits, keywords, ...listed }) => listed);
});
const ids = picks => picks.map(p => p.id).sort((a, b) => a - b);

test('filters narrow tonight\'s picks', async () => {
  assert.deepEqual(ids(await tonightPicks({ time: 'standard' })), [1, 2, 3, 4, 6], 'a 150-minute film does not fit two hours');
  assert.deepEqual(ids(await tonightPicks({ time: 'long', language: 'foreign' })), [3]);
  assert.deepEqual(ids(await tonightPicks({ time: 'long', avoid: [27], era: '2000s' })), [1, 3, 5, 6]);
});

test('"show me others" never repeats a film, and the watchlist can be the only source', async () => {
  assert.deepEqual(ids(await tonightPicks({ time: 'long', exclude: new Set([1, 2, 3]) })), [4, 5, 6]);
  const watchlist = [{ id: 6, title: 'Film 6', genre_ids: [18] }, { id: 2, title: 'Film 2', genre_ids: [18] }];
  assert.deepEqual(ids(await tonightPicks({ time: 'long', watchlist, watchlistOnly: true })), [2, 6]);
});

test('rental and purchase offers count only when asked for', async () => {
  tmdb.offers.set(1, { flatrate: [{ provider_id: 8, provider_name: 'Netflix' }], rent: [], buy: [] });
  tmdb.offers.set(6, { flatrate: [], rent: [{ provider_id: 8, provider_name: 'Netflix' }], buy: [] });
  assert.deepEqual(ids(await tonightPicks({ time: 'long', providers: [8] })), [1]);
  const withRent = await tonightPicks({ time: 'long', providers: [8], rent: true });
  assert.deepEqual(ids(withRent), [1, 6]);
  assert.equal(withRent.find(p => p.id === 6).providers[0].how, 'rent');
});
