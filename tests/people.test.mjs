import test from 'node:test';
import assert from 'node:assert/strict';
import { creditsFor, rolesOf, rankFilmography } from '../shared/people.js';

const credits = {
  cast: [{ id: 9, title: 'Cameo', release_date: '2001-01-01', vote_count: 500, vote_average: 6, character: 'Himself' }],
  crew: [
    { id: 1, title: 'Ran', job: 'Director', release_date: '1985-06-01', vote_count: 2000, vote_average: 8.2 },
    { id: 1, title: 'Ran', job: 'Screenplay', release_date: '1985-06-01', vote_count: 2000, vote_average: 8.2 },
    { id: 2, title: 'Ikiru', job: 'Director', release_date: '1952-10-09', vote_count: 1200, vote_average: 8.1 },
    { id: 3, title: 'Dodes\'ka-den', job: 'Director', release_date: '1970-10-31', vote_count: 300, vote_average: 7.3 },
    { id: 4, title: 'Lost early short', job: 'Director', release_date: '1940-01-01', vote_count: 3, vote_average: 9.5 },
    { id: 5, title: 'Red Beard', job: 'Director', release_date: '1965-04-03', vote_count: 600, vote_average: 8.0 }
  ]
};

test('a filmography by role, with a film merged across jobs', () => {
  const directing = creditsFor(credits, 'directing');
  assert.deepEqual(directing.map((f) => f.id), [1, 2, 3, 4, 5]);
  assert.equal(creditsFor(credits, 'writing')[0].credit, 'Screenplay');
  assert.deepEqual(rolesOf(credits, 'Directing'), ['directing', 'acting', 'writing']);
  assert.deepEqual(rolesOf(credits, 'Acting'), ['acting', 'directing', 'writing']);
});

test('seen films carry the member\'s rating; unseen ones are ranked by the diary, then by the public', () => {
  const predict = (id) => ({ 3: { rating: 9, support: 1 }, 2: { rating: 6, support: 1 }, 5: { rating: 8, support: 0.1 } }[id] || null);
  const { seen, unseen, stats } = rankFilmography(creditsFor(credits, 'directing'), [{ id: 1, rated: 10 }], predict);
  assert.deepEqual(seen.map((f) => [f.title, f.rated, f.year]), [['Ran', 10, 1985]]);
  assert.deepEqual(unseen.map((f) => f.title), ["Dodes'ka-den", 'Red Beard', 'Ikiru', 'Lost early short']);
  assert.equal(unseen[0].predicted, 9);
  assert.equal(unseen[1].predicted, null, 'too little support to predict');
  assert.ok(unseen.at(-1).obscure, 'barely rated films go last');
  assert.deepEqual(stats, { total: 5, seen: 1, mean: 10 });
});
