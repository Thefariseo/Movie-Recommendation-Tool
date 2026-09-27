import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTasteSpace } from '../shared/tasteSpace.js';
import { parseTasteMap } from '../shared/journeys.js';
import { tasteOf, closeness, closenessLabel, agreement, regionTaste, divergences, disputed, regionExperts, friendJourney, circlePicks, circleReason } from '../shared/social.js';
import { cleanJourney } from '../server/journeys.js';

const buf = (f) => { const b = readFileSync(new URL(`../public/models/${f}`, import.meta.url)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const space = parseTasteSpace(buf('taste-space.bin'));
const map = parseTasteMap(buf('taste-map.bin'));
const { regions } = JSON.parse(readFileSync(new URL('../public/models/taste-map.json', import.meta.url)));
const diary = (list) => list.map(([id, rated, title]) => ({ id, rated, title }));
const me = diary([[129, 10, 'Spirited Away'], [128, 10, 'Princess Mononoke'], [8392, 9, 'My Neighbor Totoro'], [27205, 8, 'Inception'], [550, 4, 'Fight Club']]);
const ghibliFriend = diary([[4935, 10, "Howl's Moving Castle"], [129, 9, 'Spirited Away'], [12477, 9, 'Grave of the Fireflies'], [16859, 8, "Kiki's Delivery Service"], [81, 9, 'Nausicaä'], [10515, 8, 'Castle in the Sky']]);
const horrorFriend = diary([[694, 10, 'The Shining'], [348, 9, 'Alien'], [539, 9, 'Psycho'], [1091, 9, 'The Thing'], [550, 10, 'Fight Club'], [129, 5, 'Spirited Away'], [805, 9, "Rosemary's Baby"], [9552, 8, 'The Exorcist'], [948, 8, 'Halloween']]);
const mine = tasteOf(space, me), ghibli = tasteOf(space, ghibliFriend), horror = tasteOf(space, horrorFriend);

test('closeness tells a kindred taste from a distant one', () => {
  const near = closeness(space, mine, ghibli), far = closeness(space, mine, horror);
  assert.ok(near >= 75 && far <= 60 && near - far >= 20, `${near} vs ${far}`);
  assert.equal(closeness(space, mine, mine), 100);
  assert.equal(closenessLabel(90), 'Taste twins');
  assert.equal(closenessLabel(30), 'Opposite tastes');
});

test('agreement names the film two friends split on', () => {
  const a = agreement(me, horrorFriend);
  assert.equal(a.shared, 2);
  assert.deepEqual(a.biggest, { id: 550, title: 'Fight Club', you: 4, them: 10 });
  assert.equal(agreement(me, []).shared, 0);
});

test('divergences and disputes point in opposite directions', () => {
  const d = divergences(regions, regionTaste(space, map, regions, mine.z), regionTaste(space, map, regions, horror.z));
  assert.ok(d.theirs.length && d.yours.length);
  assert.ok(d.theirs.every((r) => r.you - r.them >= 12) && d.yours.every((r) => r.them - r.you >= 12));
  const seen = new Set([...me, ...horrorFriend].map((f) => f.id));
  const fight = disputed(space, mine, horror, seen);
  assert.ok(fight.theirs.them > fight.theirs.you && fight.yours.you > fight.yours.them);
  assert.ok(!seen.has(fight.theirs.id) && !seen.has(fight.yours.id), 'only films neither has seen');
});

test('the friend who loved most films in a region guides a journey there, ending with their favourite', () => {
  const experts = regionExperts(space, map, [{ id: '22222222-2222-4222-8222-222222222222', name: 'Bea', films: horrorFriend }, { id: '33333333-3333-4333-8333-333333333333', name: 'Carlo', films: ghibliFriend }]);
  const [region, expert] = [...experts].find(([, e]) => e.name === 'Bea');
  const j = friendJourney(space, map, regions, mine, expert, region, me);
  assert.equal(j.kind, 'friend');
  assert.equal(j.person.name, 'Bea');
  assert.equal(j.steps.at(-1).id, expert.films.filter((f) => !me.some((m) => m.id === f.id))[0].id, 'their favourite comes last');
  assert.ok(j.steps.every((s) => !me.some((m) => m.id === s.id)));
  assert.match(j.explain.why[0], /^Bea knows .* better than anyone in your circle/);
  const clean = cleanJourney(j);
  assert.deepEqual(clean.person, { id: '22222222-2222-4222-8222-222222222222', name: 'Bea' });
  assert.throws(() => cleanJourney({ ...j, person: { id: 'not-a-member', name: 'X' } }));
});

test('circle picks follow the closest friend, and say who and how close', () => {
  const friends = [
    { id: 'c', name: 'Carlo', films: ghibliFriend, match: closeness(space, mine, ghibli) },
    { id: 'b', name: 'Bea', films: horrorFriend, match: closeness(space, mine, horror) }
  ];
  const picks = circlePicks(space, mine, friends, new Set(me.map((f) => f.id)));
  assert.equal(picks[0].by[0].name, 'Carlo');
  assert.ok(!picks.some((p) => me.some((m) => m.id === p.id)));
  assert.match(circleReason(picks[0]), /^Carlo \(\d+% match\) gave it [\d.]+★/);
});
