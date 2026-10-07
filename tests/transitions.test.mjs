import test from 'node:test';
import assert from 'node:assert/strict';
import { transitionKind } from '../src/utils/pageTransition.js';

const kind = (from, to) => transitionKind(new URL(from, 'https://umbrify.test'), new URL(to, 'https://umbrify.test'));

test('the home views slide the way the member moves along them', () => {
  assert.equal(kind('/?view=foryou', '/?view=cinema'), 'forward');
  assert.equal(kind('/?view=browse', '/?view=foryou'), 'back');
  assert.equal(kind('/', '/?view=browse'), 'forward');
});

test('the main destinations and the library tabs keep their order', () => {
  assert.equal(kind('/?view=browse', '/critic'), 'forward');
  assert.equal(kind('/profile', '/library/watched'), 'back');
  assert.equal(kind('/library/watchlist', '/library/lists'), 'forward');
  assert.equal(kind('/library/map', '/library/watched'), 'back');
  assert.equal(kind('/friends', '/friends'), 'fade');
});

test('a page off the navigation is a step forward, and back out of it', () => {
  assert.equal(kind('/?view=foryou', '/person/525'), 'forward');
  assert.equal(kind('/person/525', '/library/lists'), 'back');
  assert.equal(kind('/list/abc', '/person/525'), 'forward');
});

test('Tonight and a cinema season open with the lights going down', () => {
  assert.equal(kind('/?view=foryou', '/tonight'), 'dim');
  assert.equal(kind('/library/journeys', '/season/s1'), 'dim');
  // Already in the dark: an evening opened from Tonight just moves on.
  assert.equal(kind('/tonight', '/tonight/n1'), 'fade');
  assert.equal(kind('/tonight', '/critic'), 'forward');
});
