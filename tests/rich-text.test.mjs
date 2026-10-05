import test from 'node:test';
import assert from 'node:assert/strict';
import { richRuns } from '../shared/richText.js';

test('a model\'s *emphasis* and **weight** become runs, never stray asterisks', () => {
  assert.deepEqual(richRuns('Hai dato 4★ ad *Arancia meccanica* e 4,5★ a *2001: Odissea nello spazio*: qui'), [
    { text: 'Hai dato 4★ ad ' }, { text: 'Arancia meccanica', em: true }, { text: ' e 4,5★ a ' },
    { text: '2001: Odissea nello spazio', em: true }, { text: ': qui' },
  ]);
  assert.deepEqual(richRuns('a **bold** move and _Brazil_'), [{ text: 'a ' }, { text: 'bold', strong: true }, { text: ' move and ' }, { text: 'Brazil', em: true }]);
});

test('arithmetic, identifiers and plain text are left as they are', () => {
  assert.deepEqual(richRuns('5 * 3 = 15 and 2*3*4'), [{ text: '5 * 3 = 15 and 2*3*4' }]);
  assert.deepEqual(richRuns('snake_case_name'), [{ text: 'snake_case_name' }]);
  assert.deepEqual(richRuns(''), []);
});
