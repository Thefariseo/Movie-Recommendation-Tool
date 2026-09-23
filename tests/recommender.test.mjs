import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./support/browser-modules.mjs', import.meta.url);
const tmdb = await import('./support/fake-tmdb.mjs');
const { getRecommendations } = await import('../src/algorithms/recommender.js');

// Every film is a drama from the same decade with identical TMDB figures, so
// genre, era and quality cannot separate them. Any ordering the tests observe
// comes from the signed evidence: director, cast, themes, language, country.
const DRAMA = [18];
function film(id, { director, cast = [], keywords = [], lang = 'en', countries = ['US'] } = {}) {
  return {
    id, title: `Film ${id}`, genre_ids: DRAMA, genres: [{ id: 18, name: 'Drama' }],
    original_language: lang, origin_country: countries,
    vote_average: 7.5, vote_count: 900, release_date: '2005-06-01', popularity: 10,
    credits: {
      crew: director ? [{ id: director[0], name: director[1], job: 'Director' }] : [],
      cast: cast.map(([cid, name]) => ({ id: cid, name }))
    },
    keywords: { keywords: keywords.map(([kid, name]) => ({ id: kid, name })) }
  };
}
const LOVED_DIR = [10, 'Alma Loved'];
const DISLIKED_DIR = [20, 'Bruno Disliked'];
const TIME_TRAVEL = [500, 'time travel'];
const FOUND_FOOTAGE = [600, 'found footage'];

function library() {
  const entries = [
    [film(1, { director: LOVED_DIR, keywords: [TIME_TRAVEL], lang: 'ja', countries: ['JP'] }), 10],
    [film(2, { director: LOVED_DIR, keywords: [TIME_TRAVEL], lang: 'ja', countries: ['JP'] }), 9],
    [film(3, { director: DISLIKED_DIR, keywords: [FOUND_FOOTAGE] }), 2],
    [film(4, { director: DISLIKED_DIR, keywords: [FOUND_FOOTAGE] }), 1],
    [film(5, { director: [30, 'Carla Fine'] }), 7]
  ];
  for (const [f] of entries) tmdb.catalog.set(f.id, f);
  return entries.map(([f, rated]) => ({ id: f.id, title: f.title, genre_ids: DRAMA, genres: DRAMA, year: 2005, release_date: f.release_date, rated }));
}
const candidates = {
  lovedDirector: film(100, { director: LOVED_DIR }),
  dislikedDirector: film(200, { director: DISLIKED_DIR }),
  lovedTheme: film(300, { director: [40, 'Dario New'], keywords: [TIME_TRAVEL] }),
  neutral: film(400, { director: [50, 'Elena New'] }),
  lovedLanguage: film(500, { director: [60, 'Fumi New'], lang: 'ja', countries: ['JP'] }),
  dislikedTheme: film(600, { director: [70, 'Gino New'], keywords: [FOUND_FOOTAGE] })
};

beforeEach(() => {
  tmdb.reset();
  for (const f of Object.values(candidates)) tmdb.catalog.set(f.id, f);
  // Discovery returns the candidates as TMDB list results: no credits, no keywords.
  tmdb.lists.discover = Object.values(candidates).map(({ credits, keywords, ...listed }) => listed);
});

const rankOf = (picks, id) => picks.findIndex(p => p.id === id);

test('films are ranked by the member\'s own evidence when genre cannot tell them apart', async () => {
  const picks = await getRecommendations({ watched: library(), top: 10 });
  const r = id => rankOf(picks, id);
  const { lovedDirector, dislikedDirector, lovedTheme, neutral, lovedLanguage, dislikedTheme } = candidates;
  assert.equal(picks.length, 6);
  for (const liked of [lovedDirector, lovedTheme, lovedLanguage]) assert.ok(r(liked.id) < r(neutral.id), `${liked.title} should beat the neutral film`);
  for (const disliked of [dislikedDirector, dislikedTheme]) assert.ok(r(disliked.id) > r(neutral.id), `${disliked.title} should rank below the neutral film`);
  assert.equal(r(lovedDirector.id), 0, 'a director rated highly twice is the strongest single signal');
});

test('a disliked director is penalised even when the film arrives through generic discovery', async () => {
  const picks = await getRecommendations({ watched: library(), top: 10 });
  assert.equal(rankOf(picks, candidates.dislikedDirector.id), picks.length - 1);
});

test('reasons cite only what the member\'s ratings show', async () => {
  const picks = await getRecommendations({ watched: library(), top: 10 });
  const reason = id => picks.find(p => p.id === id)?.reason;
  assert.equal(reason(100), 'Directed by Alma Loved, whose films you rate highly');
  assert.equal(reason(300), 'Shares themes from films you rated highly: time travel');
  assert.ok(!/Bruno Disliked|found footage/.test(picks.map(p => p.reason).join(' ')), 'disliked evidence is never offered as a reason');
});

test('films already watched are never recommended', async () => {
  const watched = library();
  tmdb.lists.discover.push({ ...tmdb.catalog.get(1), credits: undefined, keywords: undefined });
  const picks = await getRecommendations({ watched, top: 10 });
  assert.equal(rankOf(picks, 1), -1);
});

test('without rated films the second stage is skipped and discovery still works', async () => {
  const picks = await getRecommendations({ watched: [], watchlist: [], top: 10 });
  assert.equal(picks.length, 6);
  assert.equal(tmdb.calls.filter(c => c.startsWith('details:')).length, 0, 'no evidence means no shortlist fetches');
});

test('only directors rated clearly above the member\'s mean have their filmographies explored', async () => {
  const watched = library();
  tmdb.catalog.set(6, film(6, { director: [80, 'Mild Liking'] }));
  watched.push({ id: 6, title: 'Film 6', genre_ids: DRAMA, genres: DRAMA, year: 2005, release_date: '2005-06-01', rated: 7 });
  await getRecommendations({ watched, top: 10 });
  const explored = tmdb.calls.filter(c => c.startsWith('person:')).map(c => Number(c.slice(7)));
  assert.ok(explored.includes(10), 'the loved director is explored');
  assert.ok(!explored.includes(80), 'one film a notch above average is not enough to call a director a favourite');
  assert.ok(!explored.includes(20), 'a disliked director is never explored');
});
