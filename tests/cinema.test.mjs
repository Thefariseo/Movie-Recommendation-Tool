import test from 'node:test';
import assert from 'node:assert/strict';
import { rankForMember } from '../shared/cinema.js';

const films = [
  { id: 1, title: 'Loud Action', genre_ids: [28], release_date: '2026-10-01', vote_average: 7, vote_count: 300 },
  { id: 2, title: 'Quiet Drama', genre_ids: [18], release_date: '2026-10-01', vote_average: 7, vote_count: 300 },
  { id: 3, title: 'Known Classic Rerelease', genre_ids: [18], release_date: '2026-10-01', vote_average: 8, vote_count: 9000 },
  { id: 4, title: 'Already Seen', genre_ids: [18], release_date: '2026-09-01', vote_average: 8, vote_count: 900 }
];

test('in cinemas: unseen films, the diary first, then the genres the member loves', () => {
  const watched = [
    { id: 10, genre_ids: [18], rated: 10, year: 2020 }, { id: 11, genre_ids: [18], rated: 9, year: 2021 },
    { id: 12, genre_ids: [28], rated: 3, year: 2020 }, { id: 4, genre_ids: [18], rated: 8 }
  ];
  const predict = (id) => (id === 3 ? { rating: 8.8, support: 1 } : null);
  const ranked = rankForMember(films, watched, predict);
  assert.deepEqual(ranked.map((f) => f.title), ['Known Classic Rerelease', 'Quiet Drama', 'Loud Action']);
  assert.deepEqual(ranked[0].forYou, { rating: 8.8, basis: 'diary' });
  assert.equal(ranked[1].forYou.basis, 'genres');
  assert.ok(ranked[1].forYou.rating > ranked[2].forYou.rating, 'drama lover over action hater');
});

test('without a diary, the cinema keeps its own order and makes no guesses', () => {
  const ranked = rankForMember(films, [], null);
  assert.deepEqual(ranked.map((f) => f.id), [1, 2, 3, 4]);
  assert.ok(ranked.every((f) => f.forYou === null));
});
