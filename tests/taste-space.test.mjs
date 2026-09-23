import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { parseTasteSpace, placeMember, affinities, strongest, becauseOf, similarity, confidence } from '../shared/tasteSpace.js';
import { peerReason } from '../shared/evidence.js';

register('./support/browser-modules.mjs', import.meta.url);
const tmdb = await import('./support/fake-tmdb.mjs');
const fakeSpace = await import('./support/fake-taste-space.mjs');
const { getRecommendations } = await import('../src/algorithms/recommender.js');

// Builds the binary file the offline trainer writes, from plain vectors.
function binary(films, lambda = 1) {
  const n = films.length, k = films[0].v.length;
  const scale = films.map(f => Math.max(...f.v.map(Math.abs), 1e-8) / 127);
  const q = films.flatMap((f, i) => f.v.map(x => Math.round(x / scale[i])));
  const deq = films.map((f, i) => f.v.map((_, j) => q[i * k + j] * scale[i]));
  const YtY = Array.from({ length: k * k }, (_, rc) => deq.reduce((s, v) => s + v[Math.floor(rc / k)] * v[rc % k], 0));
  const parts = [new Uint8Array([85, 77, 84, 83]), new Uint32Array([1, n, k]), new Float32Array([lambda]), new Float32Array(YtY),
    new Int32Array(films.map(f => f.id)), new Float32Array(scale), new Uint32Array(films.map(f => f.count ?? 1000)),
    new Float32Array(films.map(() => 3.5)), new Int8Array(q)];
  const out = new Uint8Array(parts.reduce((s, p) => s + p.byteLength, 0));
  let o = 0;
  for (const p of parts) { out.set(new Uint8Array(p.buffer, p.byteOffset, p.byteLength), o); o += p.byteLength; }
  return out.buffer;
}

// Two tastes: an "arthouse" axis and a "blockbuster" axis. Films 1 and 2 are
// arthouse; 700 sits right next to them; 800 is a blockbuster. Filler films
// give the catalogue an ordinary middle.
const FILMS = [
  { id: 1, v: [1, 0.05] }, { id: 2, v: [0.95, 0] }, { id: 700, v: [0.9, 0.1] }, { id: 800, v: [0, 1] },
  ...Array.from({ length: 40 }, (_, i) => ({ id: 1000 + i, v: [0.05 * ((i % 5) - 2), 0.3 + 0.01 * i] }))
];

test('the binary export round-trips and similar films are close', () => {
  const space = parseTasteSpace(binary(FILMS));
  assert.equal(space.n, FILMS.length);
  assert.equal(space.k, 2);
  assert.ok(similarity(space, 1, 700) > 0.95);
  assert.ok(similarity(space, 1, 800) < 0.1);
  assert.equal(similarity(space, 1, 99999), null);
  assert.throws(() => parseTasteSpace(new ArrayBuffer(20)), /format/);
});

test('ratings below 7/10 say nothing about liking, higher ones say more', () => {
  assert.equal(confidence(6), 0);
  assert.ok(confidence(10) > confidence(8));
});

test('a member who loves arthouse films is placed near them and offered the arthouse match', () => {
  const space = parseTasteSpace(binary(FILMS));
  const member = placeMember(space, [{ id: 1, rated: 10, title: 'Ran' }, { id: 2, rated: 9, title: 'Ikiru' }]);
  const z = affinities(space, member);
  assert.ok(z[space.index.get(700)] > 1.5, 'the neighbour stands far above the ordinary film');
  assert.ok(z[space.index.get(800)] < z[space.index.get(700)]);
  const top = strongest(space, member, { exclude: new Set([1, 2]), limit: 3, scores: z });
  assert.equal(top[0].id, 700);
  const because = becauseOf(space, member, space.index.get(700));
  assert.deepEqual(because.map(b => b.title), ['Ran', 'Ikiru']);
  assert.deepEqual(peerReason(because), {
    short: 'Fans of "Ran" love it — you gave 5★',
    full: 'People who loved "Ran" (5★) and "Ikiru" (4.5★), as you did, tend to love this one too.'
  });
});

test('too few loved films the space knows place no one', () => {
  const space = parseTasteSpace(binary(FILMS));
  assert.equal(placeMember(space, [{ id: 1, rated: 10 }]), null);
  assert.equal(placeMember(space, [{ id: 1, rated: 5 }, { id: 2, rated: 4 }]), null, 'disliked films are not liking evidence');
  assert.equal(placeMember(space, [{ id: 555, rated: 10 }, { id: 556, rated: 10 }]), null, 'films the space does not know');
});

test('a disliked film is never named as the reason', () => {
  const space = parseTasteSpace(binary(FILMS));
  const member = placeMember(space, [{ id: 1, rated: 10, title: 'Ran' }, { id: 2, rated: 9, title: 'Ikiru' }, { id: 800, rated: 2, title: 'Flop' }]);
  assert.ok(!becauseOf(space, member, space.index.get(700)).some(b => b.title === 'Flop'));
});

// End to end: the recommender brings in the space's match and explains it.
const DRAMA = [18];
const film = (id, title = `Film ${id}`) => ({
  id, title, genre_ids: DRAMA, genres: [{ id: 18, name: 'Drama' }], original_language: 'en', origin_country: ['US'],
  vote_average: 7.5, vote_count: 900, release_date: '2005-06-01', popularity: 10,
  credits: { crew: [{ id: id + 50000, name: `Director ${id}`, job: 'Director' }], cast: [] }, keywords: { keywords: [] }
});
beforeEach(() => {
  tmdb.reset();
  for (const f of FILMS) tmdb.catalog.set(f.id, film(f.id, f.id === 1 ? 'Ran' : f.id === 2 ? 'Ikiru' : undefined));
  tmdb.lists.discover = [800, 1003, 1004].map(id => { const { credits, keywords, ...listed } = film(id); return listed; });
  fakeSpace.setSpace(parseTasteSpace(binary(FILMS)));
});
const watched = () => [
  { id: 1, title: 'Ran', genre_ids: DRAMA, genres: DRAMA, year: 2005, release_date: '2005-06-01', rated: 10 },
  { id: 2, title: 'Ikiru', genre_ids: DRAMA, genres: DRAMA, year: 2005, release_date: '2005-06-01', rated: 9 },
  { id: 1001, title: 'So-so', genre_ids: DRAMA, genres: DRAMA, year: 2005, release_date: '2005-06-01', rated: 5 }
];

test('the space\'s match joins the picks, ranks first and names the loved films behind it', async () => {
  const picks = await getRecommendations({ watched: watched(), top: 10 });
  const match = picks.find(p => p.id === 700);
  assert.ok(match, 'a film no list surfaced is found through the taste space');
  assert.equal(picks[0].id, 700);
  assert.equal(match.reason, 'Fans of "Ran" love it — you gave 5★');
  assert.ok(!/Fans of/.test(picks.find(p => p.id === 800)?.reason || ''), 'a film far from the member\'s taste is not explained by it');
});

test('without the taste space, picks carry on from the member\'s own evidence', async () => {
  fakeSpace.setSpace(null);
  const picks = await getRecommendations({ watched: watched(), top: 10 });
  assert.equal(picks.find(p => p.id === 700), undefined);
  assert.ok(picks.length > 0);
});
