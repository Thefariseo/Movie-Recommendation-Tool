import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeTaste, decodeTaste } from '../shared/tasteCard.js';

test('a taste travels in a short code: best-rated films first, with the name', () => {
  const films = [{ id: 129, rated: 10 }, { id: 496243, rated: 9 }, { id: 13, rated: 6 }, { id: 5, rated: 0 }, { id: 1234567, rated: 8 }];
  const code = encodeTaste(films, 'Matteo');
  assert.match(code, /^[A-Za-z0-9_-]+$/);
  const back = decodeTaste(code);
  assert.equal(back.name, 'Matteo');
  assert.deepEqual(back.films, [{ id: 129, rated: 10 }, { id: 496243, rated: 9 }, { id: 1234567, rated: 8 }, { id: 13, rated: 6 }]);
  const many = Array.from({ length: 200 }, (_, i) => ({ id: 1000 + i, rated: 7 }));
  assert.equal(decodeTaste(encodeTaste(many)).films.length, 60);
  assert(encodeTaste(many, 'x').length < 500, 'the link stays short');
});

test('anything that is not a taste code is refused', () => {
  for (const bad of ['', 'not a code!', 'AAAA', null, 'x'.repeat(2000)]) assert.equal(decodeTaste(bad), null);
});
