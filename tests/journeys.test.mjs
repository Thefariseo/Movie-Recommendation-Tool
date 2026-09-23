import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTasteSpace, placeMember } from '../shared/tasteSpace.js';
import { parseTasteMap, planJourneys, memberMap, territoryOverTime, regionLabel } from '../shared/journeys.js';

const file = name => { const b = readFileSync(new URL(`../public/models/${name}`, import.meta.url)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const space = parseTasteSpace(file('taste-space.bin'));
const map = parseTasteMap(file('taste-map.bin'));
const { regions, landmarks } = JSON.parse(readFileSync(new URL('../public/models/taste-map.json', import.meta.url)));
const diary = [[129, 'Spirited Away', 10], [128, 'Princess Mononoke', 10], [8392, 'My Neighbor Totoro', 9], [11645, 'Ran', 9], [670, 'Oldboy', 8], [550, 'Fight Club', 3]]
  .map(([id, title, rated], i) => ({ id, title, rated, _updated: `2026-0${i + 1}-15T10:00:00Z` }));

test('the shipped map covers the whole taste space, with named regions and landmarks', () => {
  assert.equal(map.n, space.n);
  assert.ok(map.x.every(v => v >= 0 && v <= 1) && map.y.every(v => v >= 0 && v <= 1));
  assert.ok(Math.max(...map.region) < regions.length);
  assert.ok(regions.every(r => r.landmarks.length && r.genres.length));
  assert.ok(landmarks.length >= 100);
  assert.match(regionLabel({ genres: ['Drama', 'Romance'], decade: 1990 }), /^Drama & Romance, 1990s$/);
  assert.throws(() => parseTasteMap(new ArrayBuffer(16)), /format/);
});

test('the member is drawn where their loved films are, and their territory grows month by month', () => {
  const view = memberMap(space, map, diary);
  assert.equal(view.points.length, diary.length);
  assert.ok(view.centre.x > 0 && view.centre.x < 1);
  const growth = territoryOverTime(view.points);
  assert.equal(growth.length, diary.length);
  assert.ok(growth.every((g, i) => i === 0 || g.regions >= growth[i - 1].regions));
  assert.deepEqual(territoryOverTime(view.points.map(p => ({ ...p, when: null }))), []);
});

test('journeys start from a loved film, never repeat or revisit, and end in a region the member has never visited', () => {
  const member = placeMember(space, diary, []);
  const journeys = planJourneys(space, map, regions, member, diary);
  assert.equal(journeys.length, 3);
  const visited = new Set(diary.map(f => map.region[space.index.get(f.id)]));
  const watched = new Set(diary.map(f => f.id));
  const all = journeys.flatMap(j => j.steps.map(s => s.id));
  assert.equal(new Set(all).size, all.length, 'no film appears twice');
  for (const j of journeys) {
    assert.ok(diary.some(f => f.id === j.from.id && f.rated >= 7), 'home is a loved film');
    assert.equal(j.steps.length, 6);
    assert.ok(!visited.has(j.region.id), 'the destination is new territory');
    assert.ok(j.steps.slice(-2).every(s => s.region === j.region.id), 'the last steps arrive');
    assert.ok(j.steps.every(s => !watched.has(s.id)), 'no watched film is a step');
  }
  assert.deepEqual(planJourneys(space, map, regions, null, diary), []);
});

test('followed journeys are not suggested again', () => {
  const member = placeMember(space, diary, []);
  const first = planJourneys(space, map, regions, member, diary, { count: 1 })[0];
  const next = planJourneys(space, map, regions, member, diary, { count: 3, exclude: new Set(first.steps.map(s => s.id)) });
  assert.ok(next.every(j => j.steps.every(s => !first.steps.some(f => f.id === s.id))));
});
