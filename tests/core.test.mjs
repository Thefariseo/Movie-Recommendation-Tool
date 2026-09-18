import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMovie, mergeRows, importChanges } from '../shared/library.js';
import { fit, predict, holdout, evaluate, groupScore, random } from '../shared/model.js';
import { parseConversation, emptyConstraints, validateConstraints } from '../shared/conversation.js';
import { letterboxdCSV } from '../shared/export.js';
import { encrypt, decrypt, hash, randomSecret } from '../server/crypto.js';
test('normalization preserves legacy ratings metadata without executable paths', () => {
  const movie = normalizeMovie({
    id: 42,
    title: 'A film',
    poster: '/poster.jpg',
    genres: [18, 35],
    year: 2024
  });
  assert.deepEqual(movie.genre_ids, [18, 35]);
  assert.equal(movie.poster_path, '/poster.jpg');
  assert.equal(movie.release_date, '2024-01-01');
  assert.equal(normalizeMovie({
    ...movie,
    poster_path: 'javascript:alert(1)'
  }).poster_path, null);
  assert.throws(() => normalizeMovie({
    id: 0,
    title: 'x'
  }));
  assert.throws(() => normalizeMovie({
    id: 3,
    title: ''
  }));
});
test('late responses cannot resurrect a deleted movie or overwrite a newer rating', () => {
  const current = [{
    kind: 'watched',
    movie_id: 1,
    version: 3,
    deleted: true
  }, {
    kind: 'watched',
    movie_id: 2,
    version: 5,
    rating: 9
  }];
  assert.equal(mergeRows(current, [{
    kind: 'watched',
    movie_id: 1,
    version: 2,
    deleted: false
  }]), current);
  const result = mergeRows(current, [{
    kind: 'watched',
    movie_id: 2,
    version: 4,
    rating: 1
  }, {
    kind: 'watchlist',
    movie_id: 1,
    version: 1
  }]);
  assert.equal(result[0].deleted, true);
  assert.equal(result[1].rating, 9);
  assert.equal(result.length, 3);
});
test('imports deduplicate films per list and retain both watched and watchlist entries', () => {
  const rows = importChanges([{
    id: 1,
    title: 'Film',
    rated: 7
  }, {
    id: 1,
    title: 'Film',
    rated: 9
  }], [{
    id: 1,
    title: 'Film'
  }]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].rating, 9);
  assert.equal(rows[1].rating, null);
});
test('conversation keeps constraints across turns and resets explicitly', () => {
  let state = parseConversation('Una commedia sotto 100 minuti', emptyConstraints());
  assert.equal(state.max_runtime, 100);
  assert.deepEqual(state.genre_ids, [35]);
  state = parseConversation('No, troppo violento', state);
  assert.equal(state.avoid_violence, true);
  assert.equal(state.max_runtime, 100);
  state = parseConversation('Altri film', state, [1, 2]);
  assert.deepEqual(state.excluded_ids, [1, 2]);
  assert.deepEqual(parseConversation('ricomincia', state), emptyConstraints());
  const rejected = parseConversation('no horror', parseConversation('horror'));
  assert(!rejected.genre_ids.includes(27));
  assert(rejected.avoid_genres.includes(27));
});
test('structured preferences reject unbounded values and invalid genres', () => {
  const c = validateConstraints({
    genre_ids: [35, 999, 35],
    max_runtime: 999,
    marathon_count: 50,
    theme: '<script>alert!</script>'
  });
  assert.deepEqual(c.genre_ids, [35]);
  assert.equal(c.max_runtime, null);
  assert.equal(c.marathon_count, 5);
  assert(!c.theme.includes('<'));
});
test('held-out ratings never leak into the training split; predictions learn latent tastes', () => {
  const rng = random(9),
    rows = [];
  for (let u = 0; u < 40; u++) for (let i = 0; i < 24; i++) if (rng() < .8) rows.push({
    user_id: `user-${u}`,
    movie_id: i + 1,
    rating: (u % 2 === i % 2 ? 8 : 2) + i % 3 * .2
  });
  const split = holdout(rows);
  const trainKeys = new Set(split.train.map(r => `${r.user_id}:${r.movie_id}`));
  assert(split.test.length > 20);
  assert(split.test.every(r => !trainKeys.has(`${r.user_id}:${r.movie_id}`)));
  const model = fit(split.train);
  const metrics = evaluate(model, split.train, split.test);
  assert(metrics.rmse < metrics.baseline_rmse * .7, JSON.stringify(metrics));
  assert.equal(predict(model, 'unknown', 1), null);
  assert.equal(predict(model, 'user-1', 99999), null);
  assert.deepEqual(fit(split.train, {
    epochs: 2
  }), fit(split.train, {
    epochs: 2
  }));
});
test('group scoring penalizes a pick disliked by one participant', () => {
  assert(groupScore([7, 7, 7]) > groupScore([10, 10, 2]));
  assert.equal(groupScore([]), null);
  assert.equal(groupScore([5, NaN]), null);
});
test('Letterboxd CSV uses exact movie IDs and 0.5–5 ratings', () => {
  const csv = letterboxdCSV([{
    id: 1,
    title: 'A, "film"',
    rated: 9,
    year: 2020
  }, {
    id: 2,
    title: '=HYPERLINK("bad")'
  }]);
  assert(csv.includes('"tmdbID","Title","Year","Rating"'));
  assert(csv.includes('"4.5"'));
  assert(csv.includes('"A, ""film"""'));
  assert(csv.includes("'=HYPERLINK"));
});
test('Trakt tokens are authenticated and encrypted; tampering is rejected', async () => {
  process.env.INTEGRATION_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  const value = {
    access_token: 'private',
    refresh_token: 'also-private'
  };
  const encrypted = await encrypt(value);
  assert(!encrypted.includes('private'));
  assert.deepEqual(await decrypt(encrypted), value);
  const parts = encrypted.split('.');
  const bytes = Buffer.from(parts[1], 'base64url');
  bytes[0] ^= 1;
  await assert.rejects(() => decrypt(`${parts[0]}.${bytes.toString('base64url')}`));
  assert.notEqual(randomSecret(), randomSecret());
  assert.equal((await hash('state')).length, 43);
});
