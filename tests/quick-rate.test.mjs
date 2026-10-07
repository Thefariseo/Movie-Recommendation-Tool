import test from 'node:test';
import assert from 'node:assert/strict';
import { tasteLevel, filmsToRate, TASTE_LEVELS } from '../shared/quickRate.js';

test('the meter fills a fifth per level, and says how far the next one is', () => {
  assert.deepEqual([0, 1, 3, 10, 25, 50, 400].map((n) => tasteLevel(n).level), [0, 1, 2, 3, 4, 5, 5]);
  assert.equal(tasteLevel(0).fill, 0);
  assert.equal(tasteLevel(3).fill, 0.4);
  assert.equal(tasteLevel(10).fill, 0.6);
  assert.equal(tasteLevel(50).fill, 1);
  assert.equal(tasteLevel(0).toNext, 1);
  assert.equal(tasteLevel(4).toNext, 6);
  assert.equal(tasteLevel(60).toNext, 0);
  assert.equal(tasteLevel(4).label, TASTE_LEVELS[2].label);
  // Every rating moves the meter, never back.
  for (let n = 0; n < 60; n++) assert(tasteLevel(n + 1).fill >= tasteLevel(n).fill);
});

test('films to rate are the best known ones not yet rated, dismissed or passed on', () => {
  const landmarks = [1, 2, 3, 4, 5, 6].map((id) => ({ id, title: `Film ${id}`, year: 1990 + id }));
  const films = filmsToRate(landmarks, { exclude: new Set([1, 3]), unseen: new Set([4]), limit: 2 });
  assert.deepEqual(films.map((f) => f.id), [2, 5]);
  assert.deepEqual(films[0], { id: 2, title: 'Film 2', year: 1992 });
  assert.deepEqual(filmsToRate(null), []);
});
