import test from 'node:test';
import assert from 'node:assert/strict';
import { tasteEvidence, evidenceMatch, languageAffinity, keywordsOf, countriesOf } from '../shared/evidence.js';

// A film as TMDB's /movie/{id}?append_to_response=credits,keywords returns it.
const details = ({ director = [1, 'Director One'], cast = [], keywords = [], lang = 'en', countries = ['US'] } = {}) => ({
  original_language: lang,
  origin_country: countries,
  credits: {
    crew: director ? [{ id: director[0], name: director[1], job: 'Director' }, { id: 999, name: 'An Editor', job: 'Editor' }] : [],
    cast: cast.map(([id, name]) => ({ id, name }))
  },
  keywords: { keywords: keywords.map(([id, name]) => ({ id, name })) }
});
const film = (rated, d) => ({ rated, details: details(d) });

test('a director the member keeps rating low is steered away from, not just ignored', () => {
  const ev = tasteEvidence([
    film(9, { director: [10, 'Loved'] }), film(10, { director: [10, 'Loved'] }),
    film(2, { director: [20, 'Disliked'] }), film(3, { director: [20, 'Disliked'] }),
    film(7, { director: [30, 'Neutral'] })
  ]);
  assert.ok(ev.directors.get(10).value > .4);
  assert.ok(ev.directors.get(20).value < -.4);
  assert.ok(evidenceMatch(details({ director: [20, 'Disliked'] }), ev).director < 0);
  assert.ok(evidenceMatch(details({ director: [10, 'Loved'] }), ev).director > 0);
  assert.equal(evidenceMatch(details({ director: [77, 'Unknown'] }), ev).director, 0);
});

test('one film is weaker evidence than several', () => {
  const once = tasteEvidence([film(10, { director: [1, 'A'] }), film(5, { director: [9, 'Z'] })]);
  const often = tasteEvidence([film(10, { director: [1, 'A'] }), film(10, { director: [1, 'A'] }), film(10, { director: [1, 'A'] }), film(5, { director: [9, 'Z'] })]);
  assert.ok(often.directors.get(1).value > once.directors.get(1).value);
  assert.ok(once.directors.get(1).value <= .55, 'a single film must not claim full certainty');
});

test('a theme present in both loved and hated films cancels out', () => {
  const both = [1, 'based on novel or book'];
  const ev = tasteEvidence([
    film(10, { keywords: [both, [2, 'time travel']] }), film(9, { keywords: [both, [2, 'time travel']] }),
    film(2, { keywords: [both, [3, 'found footage']] }), film(1, { keywords: [both, [3, 'found footage']] })
  ]);
  assert.ok(Math.abs(ev.keywords.get(1).value) < .1);
  assert.ok(ev.keywords.get(2).value > .4);
  assert.ok(ev.keywords.get(3).value < -.4);
});

test('keyword volume does not buy a higher score', () => {
  const ev = tasteEvidence([film(10, { keywords: [[2, 'time travel']] }), film(9, { keywords: [[2, 'time travel']] }), film(6, {})]);
  const focused = evidenceMatch(details({ keywords: [[2, 'time travel'], [50, 'x'], [51, 'y']] }), ev).keywords;
  const noisy = evidenceMatch(details({ keywords: [[2, 'time travel'], ...Array.from({ length: 40 }, (_, i) => [100 + i, `k${i}`])] }), ev).keywords;
  assert.ok(focused > noisy);
});

test('release trivia is not treated as a theme', () => {
  assert.deepEqual(keywordsOf(details({ keywords: [[1, 'duringcreditsstinger'], [2, 'heist']] })).map(k => k.name), ['heist']);
});

test('language and country preferences are learned in both directions', () => {
  const ev = tasteEvidence([
    film(10, { lang: 'ja', countries: ['JP'] }), film(9, { lang: 'ja', countries: ['JP'] }),
    film(3, { lang: 'en', countries: ['US'] }), film(2, { lang: 'en', countries: ['US'] })
  ]);
  assert.ok(languageAffinity({ original_language: 'ja' }, ev) > 0);
  assert.ok(languageAffinity({ original_language: 'en' }, ev) < 0);
  assert.equal(languageAffinity({ original_language: 'ko' }, ev), 0);
  assert.ok(evidenceMatch(details({ lang: 'ja', countries: ['JP'] }), ev).country > 0);
  assert.deepEqual(countriesOf({ production_countries: [{ iso_3166_1: 'FR' }, { iso_3166_1: 'bad' }] }), ['FR']);
});

test('ratings are read against the member\'s own scale', () => {
  // For someone who gives most films 9, a 7 is a mild disappointment.
  const generous = Array.from({ length: 20 }, () => ({ rated: 9 }));
  const ev = tasteEvidence([film(7, { director: [5, 'D'] })], [...generous, { rated: 7 }]);
  assert.ok(ev.directors.get(5).value < 0);
});

test('only well-supported, clearly positive matches become reasons', () => {
  const ev = tasteEvidence([
    film(10, { director: [10, 'Loved Twice'], cast: [[70, 'Lead']], keywords: [[2, 'time travel']] }),
    film(9, { director: [10, 'Loved Twice'], cast: [[70, 'Lead']], keywords: [[2, 'time travel']] }),
    film(10, { director: [11, 'Loved Once'] }),
    film(5, { director: [12, 'Meh'] })
  ]);
  const twice = evidenceMatch(details({ director: [10, 'Loved Twice'], cast: [[70, 'Lead']], keywords: [[2, 'time travel']] }), ev).because;
  assert.deepEqual(twice.director, { name: 'Loved Twice', films: 2 });
  assert.deepEqual(twice.actor, { name: 'Lead', films: 2 });
  assert.deepEqual(twice.themes, ['time travel']);
  assert.equal(evidenceMatch(details({ director: [11, 'Loved Once'] }), ev).because.director, null, 'one film is not enough to cite');
});

test('films without details, unrated films and empty input add nothing', () => {
  const ev = tasteEvidence([{ rated: 9 }, { rated: null, details: details() }, film(8, {})]);
  assert.equal(ev.films, 1);
  const none = tasteEvidence([]);
  assert.equal(none.films, 0);
  assert.deepEqual(evidenceMatch(details(), none), { director: 0, cast: 0, keywords: 0, country: 0, because: { director: null, actor: null, themes: [] } });
  assert.deepEqual(evidenceMatch(null, ev).because, {});
});
