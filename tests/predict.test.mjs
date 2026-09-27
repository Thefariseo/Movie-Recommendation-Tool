import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTasteSpace, placeMember, affinities } from '../shared/tasteSpace.js';
import { ratingPredictor, spaceCandidates } from '../shared/predict.js';
import { slate } from '../shared/slate.js';

const b = readFileSync(new URL('../public/models/taste-space.bin', import.meta.url));
const space = parseTasteSpace(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
// Loves Ghibli, dislikes the violent crime films of the 90s.
const diary = [[129, 10, 'Spirited Away'], [128, 10, 'Princess Mononoke'], [8392, 9, 'My Neighbor Totoro'], [27205, 8, 'Inception'], [550, 3, 'Fight Club'], [680, 4, 'Pulp Fiction'], [807, 4, 'Se7en'], [13, 8, 'Forrest Gump']].map(([id, rated, title]) => ({ id, rated, title }));

test('the diary predicts a rating from the closest films, disliked ones included', () => {
  const { predict, mean } = ratingPredictor(space, diary);
  const howl = predict(4935), lambs = predict(274);
  assert.ok(howl.rating >= 8.5, `Howl's Moving Castle: ${howl.rating}`);
  assert.equal(howl.neighbours[0].title.length > 0, true);
  assert.ok(['My Neighbor Totoro', 'Spirited Away', 'Princess Mononoke'].includes(howl.neighbours[0].title));
  assert.ok(lambs.rating < mean, `The Silence of the Lambs sits among films they disliked: ${lambs.rating} < ${mean.toFixed(2)}`);
  assert.equal(predict(999999999), null, 'a film the space does not know');
  assert.ok(howl.support > lambs.support || howl.rating > lambs.rating);
});

test('space candidates are led by what the diary predicts, with less-known gems beside them', () => {
  const predictor = ratingPredictor(space, diary);
  const z = affinities(space, placeMember(space, diary));
  const { best, hidden } = spaceCandidates(space, z, predictor, new Set(diary.map((f) => f.id)));
  assert.ok(best.includes(4935), "Howl's Moving Castle is among the best");
  assert.ok(!best.some((id) => diary.some((f) => f.id === id)));
  assert.ok(hidden.length > 0 && hidden.every((id) => space.counts[space.index.get(id)] < 1500 && !best.includes(id)));
});

test('the slate gives places to other sides of the taste, new territory and a gem, then keeps the rest varied', () => {
  const film = (id, score, extra = {}) => ({ id, title: `Film ${id}`, _score: score, ...extra });
  const movies = [
    film(1, 10, { side: 'A', dirName: 'Miyazaki' }), film(2, 9.9, { side: 'A', dirName: 'Miyazaki' }), film(3, 9.8, { side: 'A', dirName: 'Miyazaki' }),
    film(4, 9, { side: 'B' }), film(5, 8.5, { side: 'A', friend: 'Carlo' }), film(6, 8, { land: 'Get Out & Parasite' }),
    film(7, 7.5, { gem: true }), film(8, 1, { side: 'D' }), film(9, 9.7, { side: 'A' })
  ];
  const sides = { A: { id: 100, title: 'Spirited Away' }, B: { id: 200, title: 'Up' }, C: { id: 300, title: 'Inception' }, D: { id: 400, title: 'Heat' } };
  const out = slate(movies, {
    limit: 8, margin: 4,
    anchor: (m) => sides[m.side] || null, circle: (m) => (m.friend ? { name: m.friend } : null),
    territory: (m) => m.land || null, gem: (m) => Boolean(m.gem),
    similar: (a, b) => (a.side && a.side === b.side ? 0.97 : 0.2)
  });
  const roles = Object.fromEntries(out.filter((m) => m._role).map((m) => [m._role.kind + (m._role.kind === 'because' ? m.id : ''), m.id]));
  assert.equal(out[0].id, 1);
  assert.equal(out[0]._role.label, 'Your top match');
  assert.equal(roles.because4, 4, 'another side of the taste');
  assert.equal(out.find((m) => m.id === 4)._role.label, 'Because you loved “Up”');
  assert.equal(roles.territory, 6);
  assert.equal(roles.gem, 7);
  assert.ok(!out.slice(0, 5).some((m) => m.id === 8), 'a weak film never takes a role');
  assert.ok(out.findIndex((m) => m.id === 2) > out.findIndex((m) => m.id === 6), 'a near-duplicate of the top waits its turn');
  assert.equal(new Set(out.map((m) => m.id)).size, out.length);
});
