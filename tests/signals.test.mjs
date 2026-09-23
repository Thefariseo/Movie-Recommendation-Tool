import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { signalMap, blocked, signalOf, jitter, withoutRecent, seeded } from '../shared/signals.js';

register('./support/browser-modules.mjs', import.meta.url);
const tmdb = await import('./support/fake-tmdb.mjs');
const { getRecommendations } = await import('../src/algorithms/recommender.js');

test('a "never again" from any source wins; other signals add up within [-2, 2]', () => {
  const map = signalMap([
    { movie_id: 1, source: 'critic_pick', signal: 1 }, { movie_id: 1, source: 'dismissed', signal: -2 },
    { movie_id: 2, source: 'critic_pick', signal: 1 }, { movie_id: 2, source: 'verdict', signal: 2 },
    { movie_id: 3, source: 'verdict', signal: -1 }, { movie_id: 4, source: 'bogus', signal: 2 }
  ]);
  assert.ok(blocked(map, 1));
  assert.equal(signalOf(map, 2), 2);
  assert.equal(signalOf(map, 3), -1);
  assert.equal(signalOf(map, 4), 0);
  assert.deepEqual([...map.get(2).sources].sort(), ['critic_pick', 'verdict']);
});

test('the first round is stable; later rounds vary among close candidates only', () => {
  const items = Array.from({ length: 20 }, (_, i) => ({ id: i, _score: i === 0 ? 5 : 1 + i / 1000 }));
  assert.deepEqual(jitter(items, { seed: 0 }), items);
  const a = jitter(items, { seed: 1 }).sort((x, y) => y._score - x._score).map(x => x.id);
  const b = jitter(items, { seed: 2 }).sort((x, y) => y._score - x._score).map(x => x.id);
  assert.equal(a[0], 0); assert.equal(b[0], 0);
  assert.notDeepEqual(a.slice(1, 6), b.slice(1, 6), 'close candidates trade places between rounds');
  assert.deepEqual(jitter(items, { seed: 3 }), jitter(items, { seed: 3 }), 'a round can be replayed');
  assert.ok(seeded(7)() >= 0 && seeded(7)() < 1);
});

test('films just shown are left out only while enough others remain', () => {
  const items = [1, 2, 3, 4, 5].map(id => ({ id }));
  assert.deepEqual(withoutRecent(items, new Set([1, 2]), 3).map(x => x.id), [3, 4, 5]);
  assert.deepEqual(withoutRecent(items, new Set([1, 2, 3]), 3).map(x => x.id), [1, 2, 3, 4, 5]);
});

// End to end in the browser recommender.
const DRAMA = [18];
const film = (id, dir = [id + 1000, `Director ${id}`]) => ({
  id, title: `Film ${id}`, genre_ids: DRAMA, genres: [{ id: 18, name: 'Drama' }], original_language: 'en', origin_country: ['US'],
  vote_average: 7.5, vote_count: 900, release_date: '2005-06-01', popularity: 10,
  credits: { crew: [{ id: dir[0], name: dir[1], job: 'Director' }], cast: [] }, keywords: { keywords: [] }
});
const HATED_DIR = [77, 'Warned Director'];
beforeEach(() => {
  tmdb.reset();
  for (let id = 1; id <= 30; id++) tmdb.catalog.set(id, film(id));
  tmdb.catalog.set(50, film(50, HATED_DIR)); tmdb.catalog.set(51, film(51, HATED_DIR)); tmdb.catalog.set(52, film(52, HATED_DIR));
  tmdb.catalog.set(99, film(99));
  tmdb.lists.discover = [...Array.from({ length: 30 }, (_, i) => i + 1), 51, 52].map(id => { const { credits, keywords, ...l } = tmdb.catalog.get(id); return l; });
});
const watched = [{ id: 1, title: 'Film 1', genre_ids: DRAMA, genres: DRAMA, rated: 9 }, { id: 2, title: 'Film 2', genre_ids: DRAMA, genres: DRAMA, rated: 5 }];

test('what the critic warned against is never recommended, and its director counts against his other films', async () => {
  const signals = signalMap([{ movie_id: 50, source: 'critic_warned', signal: -2, movie: { id: 50, title: 'Film 50' } }, { movie_id: 3, source: 'dismissed', signal: -2 }]);
  const plain = await getRecommendations({ watched, top: 40 });
  const informed = await getRecommendations({ watched, top: 40, signals });
  assert.ok(!informed.some(p => p.id === 3), 'a dismissed film is gone');
  const score = (list, id) => list.find(p => p.id === id)?.score;
  assert.ok(score(informed, 51) < score(plain, 51) - 0.1, 'the warned film\'s director now counts against his other films');
});

test('a film the critic recommended joins the picks and says so', async () => {
  const signals = signalMap([{ movie_id: 99, source: 'critic_pick', signal: 1 }]);
  const picks = await getRecommendations({ watched, top: 40, signals });
  assert.equal(picks.find(p => p.id === 99)?.reason, 'Your critic recommended it');
});

test('"other picks" never repeats the round just shown when there is enough to choose from', async () => {
  const first = await getRecommendations({ watched, top: 6 });
  const next = await getRecommendations({ watched, top: 6, recentlyShown: new Set(first.map(p => p.id)), explore: 1 });
  assert.equal(next.filter(p => first.some(f => f.id === p.id)).length, 0);
});
