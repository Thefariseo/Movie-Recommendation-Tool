import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTasteSpace } from '../shared/tasteSpace.js';
import { closestInDiary, likeness } from '../shared/comparables.js';

const b = readFileSync(new URL('../public/models/taste-space.bin', import.meta.url));
const space = parseTasteSpace(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
const film = (id, title, rated, genre_ids, year) => ({ id, title, rated, genre_ids, release_date: `${year}-01-01` });
// A diary with loud extremes far from the film, and middling ratings close to it.
const diary = [
  film(346, 'Seven Samurai', 10, [28, 18], 1954),
  film(24428, 'The Avengers', 2, [28, 12, 878], 2012),
  film(155, 'The Dark Knight', 6, [18, 28, 80], 2008),
  film(272, 'Batman Begins', 6, [28, 80, 18], 2005),
  film(49026, 'The Dark Knight Rises', 5, [28, 80, 18], 2012)
];

test('the closest films in the diary decide, middling ratings included', () => {
  const target = { id: 1726, title: 'Iron Man', genre_ids: [28, 878, 12], release_date: '2008-04-30' };
  const { closest, expected, spread } = closestInDiary(space, target, diary);
  assert.equal(closest[0].title, 'The Avengers', 'the closest film is the most alike, whatever its rating');
  assert.ok(!closest.slice(0, 3).some(f => f.title === 'Seven Samurai'), 'a loved film far from this one does not lead');
  assert.ok(expected < 6, `close films rated low and middling predict a middling-to-low rating: ${expected}`);
  assert.ok(spread >= 0);
});

test('likeness falls back to genres and era when the taste space does not know a film', () => {
  const unknown = { id: 999999999, genre_ids: [28, 878], release_date: '2010-01-01' };
  const l = likeness(space, unknown, diary[1]);
  assert.ok(l > 0 && l < 0.6);
  assert.equal(closestInDiary(space, unknown, []).expected, null);
});
