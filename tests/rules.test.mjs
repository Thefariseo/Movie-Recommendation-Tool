import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRule, validRule, ruleMatch, ruleLabel, languageCode, countryCode } from '../shared/rules.js';
import { judge, describe } from '../shared/judge.js';
import { tasteEvidence } from '../shared/evidence.js';
import { seedMovies } from '../shared/taste.js';

const film = ({ id = 1, director = [10, 'Akira Kurosawa'], cast = [], keywords = [], language = 'ja', genres = [18], year = 1960, runtime = 110, country = 'JP' } = {}) => ({
  id, title: `Film ${id}`, release_date: `${year}-01-01`, runtime, original_language: language, origin_country: [country],
  genres: genres.map(g => ({ id: g })), credits: { crew: director ? [{ id: director[0], name: director[1], job: 'Director' }] : [], cast: cast.map(([cid, name]) => ({ id: cid, name })) },
  keywords: { keywords: keywords.map(([kid, name]) => ({ id: kid, name })) }
});

test('what the critic writes becomes rules the recommender can apply', () => {
  assert.deepEqual(parseRule({ kind: 'genre', name: 'Science Fiction', stance: 'love', why: 'x' }), { kind: 'genre', name: 'science fiction', stance: 'love', why: 'x', id: 878 });
  assert.equal(parseRule({ kind: 'language', name: 'Japanese', stance: 'love' }).code, 'ja');
  assert.equal(languageCode('giapponese'), 'ja', 'Italian names resolve too');
  assert.equal(languageCode('Korean cinema'), 'ko');
  assert.equal(countryCode('South Korea'), 'KR');
  assert.equal(countryCode('Italia'), 'IT');
  assert.deepEqual(parseRule({ kind: 'decade', name: 'the 1970s', stance: 'like' }), { kind: 'decade', name: '1970s', stance: 'like', why: '', value: 1970 });
  const runtime = parseRule({ kind: 'runtime', name: 'under 120 minutes', stance: 'avoid' });
  assert.equal(runtime.value, 120);
  assert.equal(runtime.stance, 'love', 'a runtime rule always means "up to N minutes"');
  assert.equal(parseRule({ kind: 'genre', name: 'Space opera', stance: 'love' }), null, 'unknown genres are dropped');
  assert.equal(parseRule({ kind: 'person', name: 'x', stance: 'adore' }), null);
  assert.equal(parseRule({ kind: 'mood', name: 'x', stance: 'love' }), null);
  assert.equal(validRule({ kind: 'person', name: 'Kurosawa', stance: 'love' }), false, 'a person needs a TMDB id');
  assert.equal(validRule({ kind: 'person', name: 'Kurosawa', stance: 'love', id: 5026 }), true);
  assert.equal(ruleLabel({ kind: 'language', code: 'ja', name: 'Japanese' }), 'Japanese cinema');
});

test('a film is matched against every rule, for and against', () => {
  const rules = [
    { kind: 'person', id: 10, name: 'Akira Kurosawa', stance: 'love' },
    { kind: 'theme', id: 7, name: 'samurai', stance: 'love' },
    { kind: 'theme', id: 8, name: 'gore', stance: 'avoid' },
    { kind: 'runtime', value: 120, name: 'up to 120 minutes', stance: 'love' }
  ];
  const good = ruleMatch(film({ keywords: [[7, 'samurai']] }), rules);
  assert.deepEqual(good.hits.map(h => h.rule.name), ['Akira Kurosawa', 'samurai', 'up to 120 minutes']);
  assert.equal(good.conflicts.length, 0);
  const bad = ruleMatch(film({ director: [99, 'Someone'], keywords: [[8, 'gore']], runtime: 170 }), rules);
  assert.deepEqual(bad.conflicts.map(c => c.rule.name), ['gore', 'up to 120 minutes']);
  assert.ok(bad.score < 0 && good.score > 0);
  assert.deepEqual(ruleMatch({ genre_ids: [18] }, rules).hits, [], 'a list result without details matches nothing it cannot see');
});

// The member's evidence: Kurosawa and samurai films loved, a slasher hated.
const library = [
  { rated: 10, title: 'Ran', details: film({ id: 1, keywords: [[7, 'samurai']] }) },
  { rated: 9, title: 'Ikiru', details: film({ id: 2, keywords: [[7, 'samurai']], cast: [[50, 'Takashi Shimura']] }) },
  { rated: 9, title: 'Harakiri', details: film({ id: 3, director: [11, 'Masaki Kobayashi'], keywords: [[7, 'samurai']], cast: [[50, 'Takashi Shimura']] }) },
  { rated: 2, title: 'Slasher', details: film({ id: 4, director: [12, 'Hack'], keywords: [[8, 'gore']], language: 'en', country: 'US' }) },
  { rated: 3, title: 'Slasher 2', details: film({ id: 5, director: [12, 'Hack'], keywords: [[8, 'gore']], language: 'en', country: 'US' }) }
];
const evidence = tasteEvidence(library);

test('several independent signs agreeing lift a film, and the reason names each of them', () => {
  const many = judge({
    details: film({ id: 20, keywords: [[7, 'samurai']], cast: [[50, 'Takashi Shimura']] }), evidence,
    rules: [{ kind: 'language', code: 'ja', name: 'Japanese', stance: 'love', why: 'loves Japanese classics' }],
    peer: { z: 4, films: [{ title: 'Ran', rated: 10 }, { title: 'Ikiru', rated: 9 }] }
  });
  const one = judge({ details: film({ id: 21, director: [11, 'Masaki Kobayashi'], keywords: [], language: 'en', country: 'US' }), evidence });
  const none = judge({ details: film({ id: 22, director: [77, 'Unknown'], keywords: [], language: 'en', country: 'US' }), evidence });
  assert.ok(many.agree >= 4, `agree ${many.agree}`);
  for (const kind of ['peers', 'director', 'themes', 'critic-notes']) assert.ok(many.signs.some(s => s.kind === kind), `${kind} agrees`);
  assert.ok(many.adjust > one.adjust && one.adjust > none.adjust, `${many.adjust} > ${one.adjust} > ${none.adjust}`);
  assert.equal(none.agree, 0);
  assert.ok(none.adjust < 0, 'a film nothing points to drops');
  assert.match(many.reason.short, /\+\d more$/);
  assert.match(many.reason.full, /things point to this film for you/);
  assert.match(many.reason.full, /"Ran" \(5★\)/, 'the member\'s own films are named');
  assert.match(many.reason.full, /Your critic|critic has learned/);
});

test('what goes against a film is weighed and said', () => {
  const j = judge({
    details: film({ id: 30, director: [12, 'Hack'], keywords: [[8, 'gore']], language: 'en', country: 'US' }), evidence,
    rules: [{ kind: 'theme', id: 8, name: 'gore', stance: 'avoid' }]
  });
  assert.ok(j.against.some(a => a.kind === 'director'));
  assert.ok(j.against.some(a => /avoid gore/.test(a.text)));
  assert.ok(j.adjust < -0.5);
});

test('a film is never recommended "because you gave another 3.5★"', () => {
  const weak = judge({ details: film({ id: 40, director: [77, 'Unknown'], language: 'en', country: 'US' }), seed: { title: 'Okay Film', rated: 7 } });
  assert.equal(weak.agree, 0);
  assert.equal(weak.reason, null);
  const loved = judge({ details: film({ id: 41, director: [77, 'Unknown'], language: 'en', country: 'US' }), seed: { title: 'Great Film', rated: 9 } });
  assert.match(loved.reason.short, /More like "Great Film" — you gave 4.5★/);
  // Seeds for "more like this" are loved films first.
  const seeds = seedMovies([{ id: 1, rated: 7 }, { id: 2, rated: 9 }, { id: 3, rated: 8 }, { id: 4, rated: 10 }], 3);
  assert.deepEqual(seeds.map(m => m.id).sort(), [2, 3, 4]);
});

test('with one sign the reason is that sign alone', () => {
  assert.deepEqual(describe([{ kind: 'director', strength: 0.5, short: 'By X', full: 'By X.' }]), { short: 'By X', full: 'By X.' });
  assert.equal(describe([]), null);
});
