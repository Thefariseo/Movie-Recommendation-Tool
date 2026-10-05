import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTasteSpace, placeMember, affinities, becauseOf } from '../shared/tasteSpace.js';
import { onboardingPool, nextPair, withSeeds, hasSeeds, ROUNDS, SEED_RATING } from '../shared/onboarding.js';
import { signalMap } from '../shared/signals.js';
import { judge } from '../shared/judge.js';
import { ratingPredictor } from '../shared/predict.js';

const b = readFileSync(new URL('../public/models/taste-space.bin', import.meta.url));
const space = parseTasteSpace(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
const { regions } = JSON.parse(readFileSync(new URL('../public/models/taste-map.json', import.meta.url)));
const pool = onboardingPool(space, regions);
const seededRandom = (seed) => () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);

test('pairs set two regions against each other and never repeat a film or a region', () => {
  const history = [];
  for (let k = 0; k < ROUNDS; k++) {
    const pair = nextPair(space, pool, history, seededRandom(7 + k));
    assert.ok(pair, `a pair for round ${k + 1}`);
    assert.notEqual(pair[0].region, pair[1].region);
    history.push({ a: pair[0].id, b: pair[1].id, chosen: pair[0].id });
  }
  const shown = history.flatMap((h) => [h.a, h.b]);
  assert.equal(new Set(shown).size, shown.length);
  const shownRegions = pool.filter((f) => shown.includes(f.id)).map((f) => f.region);
  assert.equal(new Set(shownRegions).size, shownRegions.length);
});

test('seven choices place a newcomer close to the taste behind them', () => {
  const truth = affinities(space, placeMember(space, [[129, 10], [128, 10], [8392, 9], [4935, 9]].map(([id, rated]) => ({ id, rated }))));
  const history = [];
  for (let k = 0; k < ROUNDS; k++) {
    const [a, c] = nextPair(space, pool, history, seededRandom(3 + k));
    history.push({ a: a.id, b: c.id, chosen: truth[a.i] >= truth[c.i] ? a.id : c.id });
  }
  const z = affinities(space, placeMember(space, history.map((h) => ({ id: h.chosen, rated: SEED_RATING }))));
  const known = [...Array(space.n).keys()].filter((i) => space.counts[i] >= 1000);
  const top = (zz) => new Set([...known].sort((x, y) => zz[y] - zz[x]).slice(0, 200));
  const t = top(truth); let shared = 0;
  for (const i of top(z)) if (t.has(i)) shared++;
  assert.ok(shared >= 60, `the choices recover the taste: ${shared} of 200 top films shared`);
});

test('first-visit picks place the member but are never cited as ratings', () => {
  const signals = signalMap([129, 128, 8392].map((id, n) => ({ movie_id: id, source: 'onboarding', signal: 1, movie: { id, title: ['Spirited Away', 'Princess Mononoke', 'My Neighbor Totoro'][n] } })));
  assert.equal(hasSeeds(signals), true);
  const films = withSeeds([], signals);
  assert.equal(films.length, 3);
  assert.ok(films.every((f) => f._seed && f.rated === SEED_RATING));
  assert.equal(withSeeds([{ id: 129, rated: 6, title: 'Spirited Away' }], signals).filter((f) => f._seed).length, 2, 'a rated film is no longer a seed');
  const member = placeMember(space, films);
  const howl = space.index.get(4935);
  const peers = becauseOf(space, member, howl);
  assert.ok(peers.length && peers.every((f) => f.seed));
  const verdict = judge({ details: { id: 4935 }, peer: { z: 10, films: peers } });
  assert.match(verdict.signs[0].short, /— you picked it$/);
  assert.match(verdict.signs[0].full, /\(your pick\)/);
  assert.doesNotMatch(verdict.signs[0].full, /★/);
  assert.equal(ratingPredictor(space, films).predict(4935).neighbours.length, 0, 'no pick is named as a rated neighbour');
});
