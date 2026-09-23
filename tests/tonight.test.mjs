import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { compromise, fairnessWeights, tally, sameAgain } from '../shared/tonight.js';
import { execute } from '../server/http.js';
import { tonight } from '../api/tonight.js';

const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222', C = '33333333-3333-4333-8333-333333333333';
const v = (user_id, movie_id, vote) => ({ user_id, movie_id, vote });

test('whoever gave up their favourite last time has compromised, the others have not', () => {
  const night = { members: [A, B], winner: 1, votes: [v(A, 1, 2), v(A, 2, -1), v(B, 1, -1), v(B, 2, 2)] };
  const debt = compromise([night], [A, B]);
  assert.equal(debt[A], 0);
  assert.equal(debt[B], 3);
  const w = fairnessWeights(debt);
  assert.equal(w[A], 1);
  assert.equal(w[B], 1.45);
});

test('older nights count less, and absent members are not blamed', () => {
  const lost = { members: [A, B], winner: 1, votes: [v(B, 1, -1), v(B, 2, 2)] };
  const recent = compromise([lost, { members: [A], winner: 1, votes: [] }], [A, B]);
  const older = compromise([{ members: [A], winner: 1, votes: [] }, lost], [A, B]);
  assert.ok(recent[B] > older[B]);
  assert.equal(compromise([lost], [A, B, C])[C], 0);
  assert.ok(fairnessWeights({ [A]: 0, [B]: 50 })[B] <= 1.5, 'extra say is capped');
});

test('weighted votes decide, vetoes break ties, then the recommender\'s order', () => {
  const films = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const even = [v(A, 1, 2), v(B, 1, 1), v(A, 2, 1), v(B, 2, 2)];
  assert.equal(tally(films, even)[0].id, 1, 'a tie goes to the recommender\'s order');
  assert.equal(tally(films, even, { [B]: 1.5 })[0].id, 2, 'a heavier vote tips it');
  const veto = [v(A, 1, 2), v(B, 1, -1), v(C, 1, 1), v(A, 2, 1), v(B, 2, 1)];
  assert.equal(tally(films, veto)[0].id, 2, 'at equal score, the film nobody vetoes wins');
  assert.deepEqual(tally(films, []).map(r => r.id), [1, 2, 3]);
});

test('a film like the last few watched is pushed down in proportion', () => {
  assert.equal(sameAgain([27, 53], [[27], [53, 80]]), 1);
  assert.equal(sameAgain([35, 18], [[27]]), 0);
  assert.equal(sameAgain([], [[27]]), 0);
});

const originalFetch = globalThis.fetch;
beforeEach(() => { Object.assign(process.env, { APP_URL: 'https://umbrify.test', SUPABASE_URL: 'https://db.test', SUPABASE_ANON_KEY: 'public', TMDB_KEY: 'tmdb' }); });
afterEach(() => { globalThis.fetch = originalFetch; });
const request = data => new Request('https://umbrify.test/api/tonight', {
  method: 'POST', body: JSON.stringify(data),
  headers: { Origin: 'https://umbrify.test', 'X-Umbrify-Request': '1', 'Content-Type': 'application/json', Cookie: 'umbrify_access=valid' }
});
function db({ me = A, night }) {
  const writes = [];
  globalThis.fetch = async (url, options = {}) => {
    const u = new URL(url);
    if (u.pathname.endsWith('/auth/v1/user')) return Response.json({ id: me });
    if (u.pathname.endsWith('/tonight_sessions')) {
      if (options.method === 'PATCH') { writes.push(['decide', JSON.parse(options.body)]); night.status = 'decided'; night.winner = JSON.parse(options.body).winner; return Response.json([night]); }
      return Response.json([night]);
    }
    if (u.pathname.endsWith('/tonight_votes')) {
      if (options.method === 'POST') { const b = JSON.parse(options.body); writes.push(['vote', b]); night.votes.push(b); return new Response(null, { status: 201 }); }
      return Response.json(night.votes);
    }
    if (u.pathname.endsWith('/profiles')) return Response.json([{ id: A, display_name: 'Ada' }, { id: B, display_name: 'Bea' }]);
    throw new Error(`Unexpected request: ${u}`);
  };
  return writes;
}
const ballot = () => ({ id: '44444444-4444-4444-8444-444444444444', host: A, members: [A, B], status: 'open', winner: null, weights: { [A]: 1, [B]: 1.45 }, films: [{ id: 10, title: 'Ten' }, { id: 20, title: 'Twenty' }], votes: [] });

test('a vote on a film not on the ballot, or an invalid vote, is refused', async () => {
  db({ night: ballot() });
  assert.equal((await execute(request({ action: 'vote', id: ballot().id, movie_id: 99, vote: 2 }), tonight)).status, 400);
  assert.equal((await execute(request({ action: 'vote', id: ballot().id, movie_id: 10, vote: 5 }), tonight)).status, 400);
});

test('only the host decides, and the decision applies the fairness weights', async () => {
  const night = ballot();
  night.votes = [v(A, 10, 2), v(A, 20, 1), v(B, 20, 2), v(B, 10, 1)];
  db({ me: B, night });
  assert.equal((await execute(request({ action: 'decide', id: night.id }), tonight)).status, 403);
  const writes = db({ me: A, night });
  const res = await (await execute(request({ action: 'decide', id: night.id }), tonight)).json();
  // Unweighted it is a tie (3 each) that film 10 would win on order; Bea's extra say picks 20.
  assert.equal(writes[0][1].winner, 20);
  assert.equal(res.night.status, 'decided');
});

import { passesFilters, avoidedGenres } from '../shared/tonight.js';
test('the night\'s filters: era, language, rating, known or unknown, genres to avoid', () => {
  const film = { release_date: '1994-09-23', original_language: 'en', genre_ids: [18, 80], vote_average: 8.7, vote_count: 27000 };
  assert.ok(passesFilters(film, {}));
  assert.ok(passesFilters(film, { era: '80s90s', language: 'en', minRating: 8, popularity: 'crowd' }));
  assert.ok(!passesFilters(film, { era: 'recent' }));
  assert.ok(!passesFilters(film, { language: 'foreign' }));
  assert.ok(passesFilters(film, { minRating: 8 }));
  assert.ok(!passesFilters({ ...film, vote_average: 6.9 }, { minRating: 7 }));
  assert.ok(!passesFilters(film, { popularity: 'gems' }));
  assert.ok(!passesFilters(film, { gentle: true }), 'crime is left out of a gentle night');
  assert.ok(!passesFilters(film, { avoid: [18] }));
  assert.ok(!passesFilters({ ...film, release_date: '' }, { era: '2000s' }), 'an unknown year never passes an era');
  assert.deepEqual(avoidedGenres({ avoid: [16, 27], gentle: true }).sort((a, b) => a - b), [16, 27, 53, 80, 10752]);
});
