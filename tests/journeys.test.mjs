import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTasteSpace, placeMember, similarity } from '../shared/tasteSpace.js';
import { parseTasteMap, planJourneys, planJourney, memberMap, territoryOverTime, regionLabel, regionName, regionAt, regionScores, journeyProgress, reroute, directorJourney, bridgeJourney } from '../shared/journeys.js';

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

test('a click on the map finds the region under it, and every region is ranked for the member', () => {
  const names = regions.map(regionName);
  assert.equal(new Set(names).size, names.length, 'every region has a distinct name');
  assert.equal(regionName({ genres: ['Drama'], decade: 1990 }), 'Drama, 1990s');
  const i = space.index.get(129);
  assert.equal(regionAt(map, map.x[i], map.y[i]), map.region[i]);
  const member = placeMember(space, diary, []);
  const rows = regionScores(space, map, regions, member, diary);
  assert.equal(rows.length, regions.length);
  assert.deepEqual(rows.map(r => r.rank).sort((a, b) => a - b), regions.map((_, n) => n + 1));
  const home = rows.find(r => r.id === map.region[i]);
  assert.ok(home.seen >= 1, 'the films the member saw are counted where they sit');
  const watched = new Set(diary.map(f => f.id));
  for (const r of rows) assert.ok(r.picks.every(id => !watched.has(id) && map.region[space.index.get(id)] === r.id));
  // The region of the member's favourites ranks above the region of the film they hated.
  const hated = rows.find(r => r.id === map.region[space.index.get(550)]);
  assert.ok(home.rank < hated.rank || home.id === hated.id);
});

test('a journey can be planned to any region the member picks, at the length they choose', () => {
  const member = placeMember(space, diary, []);
  const target = regionScores(space, map, regions, member, diary).find(r => r.films >= 8 && r.id !== map.region[space.index.get(129)]);
  const journey = planJourney(space, map, regions, member, diary, target.id, { steps: 4 });
  assert.equal(journey.steps.length, 4);
  assert.equal(journey.region.id, target.id);
  assert.ok(journey.steps.slice(-2).every(s => s.region === target.id));
  assert.ok(journey.id);
  assert.equal(planJourney(space, map, regions, null, diary, target.id), null);
  assert.equal(planJourney(space, map, regions, member, diary, 999), null);
});

test('other destinations are offered on request', () => {
  const member = placeMember(space, diary, []);
  const first = planJourneys(space, map, regions, member, diary);
  const other = planJourneys(space, map, regions, member, diary, { skip: new Set(first.map(j => j.region.id)) });
  assert.ok(other.length > 0);
  assert.ok(other.every(j => !first.some(f => f.region.id === j.region.id)));
});

test('a journey re-routes after a step the member disliked, and keeps away from it', () => {
  const member = placeMember(space, diary, []);
  const journey = planJourneys(space, map, regions, member, diary, { count: 1 })[0];
  const [a, b] = journey.steps;
  // Liking the first steps changes nothing.
  const liked = [...diary, { id: a.id, title: 'A', rated: 8 }];
  assert.equal(reroute(space, map, regions, placeMember(space, liked, []), journey, liked), journey);
  assert.equal(journeyProgress(journey, liked).next.id, b.id);
  // Disliking the second re-plans the four after it, never the watched ones.
  const disliked = [...liked, { id: b.id, title: 'B', rated: 2 }];
  const me = placeMember(space, disliked, []);
  const next = reroute(space, map, regions, me, journey, disliked);
  assert.notEqual(next, journey);
  assert.deepEqual(next.steps.slice(0, 2).map(s => s.id), [a.id, b.id]);
  assert.equal(next.steps.length, journey.steps.length);
  assert.equal(next.rerouted.after, b.id);
  assert.ok(next.steps.slice(-2).every(s => s.region === journey.region.id), 'still arrives');
  const near = steps => steps.slice(2, 4).reduce((sum, s) => sum + similarity(space, s.id, b.id), 0);
  assert.ok(near(next.steps) < near(journey.steps), 'the next steps are further from the disliked film');
  const watched = new Set(disliked.map(f => f.id));
  assert.ok(next.steps.slice(2).every(s => !watched.has(s.id)));
  // The same dislike does not re-route again.
  assert.equal(reroute(space, map, regions, me, next, disliked), next);
  const progress = journeyProgress(next, disliked);
  assert.equal(progress.done, 2);
  assert.equal(progress.arrived, false);
});

test('a journey saved to the account keeps only its own fields, within bounds', async () => {
  const { cleanJourney } = await import('../server/journeys.js');
  const member = placeMember(space, diary, []);
  const journey = { ...planJourneys(space, map, regions, member, diary, { count: 1 })[0], extra: 'x'.repeat(9000) };
  const clean = cleanJourney(journey);
  assert.equal(clean.extra, undefined);
  assert.equal(clean.steps.length, journey.steps.length);
  assert.deepEqual(Object.keys(clean.region).sort(), ['decade', 'genres', 'id']);
  assert.ok(JSON.stringify(clean).length < 8000);
  assert.throws(() => cleanJourney({ ...journey, id: '../../x' }), /Invalid journey/);
  assert.throws(() => cleanJourney({ ...journey, steps: journey.steps.slice(0, 1) }), /Invalid journey/);
  assert.throws(() => cleanJourney({ ...journey, steps: journey.steps.map(s => ({ ...s, id: 'drop table' })) }), /Invalid journey/);
  assert.throws(() => cleanJourney(null), /Invalid journey/);
});

// Kurosawa's films as TMDB lists them: most famous first in vote count.
const kurosawa = [[346, 'Seven Samurai', 3900, 8.5], [548, 'Rashomon', 2000, 8.1], [11878, 'Yojimbo', 1300, 8.2], [11645, 'Ran', 1400, 8.1], [3782, 'Ikiru', 1000, 8.2], [12493, 'High and Low', 800, 8.2], [11953, 'Kagemusha', 600, 7.9], [20532, 'Red Beard', 300, 8.1], [99999, 'Unreleased', 0, 0]]
  .map(([id, title, vote_count, vote_average]) => ({ id, title, vote_count, vote_average, poster_path: '/p.jpg', release_date: id === 99999 ? '2999-01-01' : '1960-01-01', job: 'Director' }));

test('a director journey starts with the film closest to the member\'s taste, then goes from the celebrated films to the deep cuts', () => {
  const member = placeMember(space, diary, []);
  const fit = id => { const i = space.index.get(id); return i == null ? null : 1; };
  const journey = directorJourney({ id: 5026, name: 'Akira Kurosawa' }, kurosawa, { space, map, fit: id => (id === 11645 ? 1 : fit(id) && 0.1), seen: new Set([346]), steps: 5 });
  assert.equal(journey.kind, 'director');
  assert.equal(journey.person.name, 'Akira Kurosawa');
  assert.equal(journey.steps[0].id, 11645, 'the entry is the best match for the member');
  assert.equal(journey.steps.length, 5);
  assert.ok(!journey.steps.some(s => s.id === 346), 'a film already seen is not a step');
  assert.ok(!journey.steps.some(s => s.id === 99999), 'nor an unreleased one');
  const counts = journey.steps.slice(1).map(s => kurosawa.find(k => k.id === s.id).vote_count);
  assert.deepEqual(counts, [...counts].sort((a, b) => b - a), 'from the best known to the least');
  assert.match(journey.id, /^5026-0-11645$/);
  assert.equal(directorJourney({ id: 1, name: 'X' }, kurosawa.slice(0, 2)), null, 'too few films for a journey');
  assert.ok(member);
});

test('a bridge journey crosses from a loved director to a new one and ends with two of the new one\'s films', () => {
  const member = placeMember(space, diary, []);
  const miyazaki = [129, 128, 8392, 4935, 10515, 12429];
  const journey = bridgeJourney(space, map, member, diary, {
    from: { person: { id: 608, name: 'Hayao Miyazaki' }, films: miyazaki },
    to: { person: { id: 5026, name: 'Akira Kurosawa' }, films: kurosawa.map(k => k.id) }
  });
  assert.equal(journey.kind, 'bridge');
  assert.equal(journey.to.name, 'Akira Kurosawa');
  assert.equal(journey.steps.length, 6);
  const ks = new Set(kurosawa.map(k => k.id));
  assert.ok(journey.steps.slice(-2).every(s => ks.has(s.id)), 'it arrives in the new director\'s films');
  assert.ok(!journey.steps.some(s => diary.some(f => f.id === s.id)), 'no film already seen');
  assert.ok(diary.some(f => f.id === journey.from.id && f.rated >= 7), 'it starts from a loved film by the loved director');
  assert.equal(reroute(space, map, regions, member, journey, diary), journey, 'director journeys are not rerouted towards a region');
  assert.equal(bridgeJourney(space, map, member, diary, { from: { person: { id: 1, name: 'A' }, films: [] }, to: { person: { id: 2, name: 'B' }, films: [346] } }), null);
});

test('director journeys can be saved, with their director and steps the map does not know', async () => {
  const { cleanJourney } = await import('../server/journeys.js');
  const journey = directorJourney({ id: 5026, name: 'Akira Kurosawa' }, [...kurosawa, { id: 777777777, title: 'Unmapped', vote_count: 60, vote_average: 9, poster_path: '/p.jpg', release_date: '1950-01-01' }], { space, map, steps: 8 });
  const clean = cleanJourney(journey);
  assert.equal(clean.kind, 'director');
  assert.deepEqual(clean.person, { id: 5026, name: 'Akira Kurosawa' });
  const unmapped = clean.steps.find(s => s.id === 777777777);
  assert.deepEqual([unmapped.region, unmapped.x, unmapped.y], [-1, null, null]);
  assert.throws(() => cleanJourney({ ...journey, kind: 'bridge' }), /Invalid journey/, 'a bridge needs its second director');
});

test('every journey says why it starts where it does, why it suits the member, and what each step does', async () => {
  const member = placeMember(space, diary, []);
  const [journey] = planJourneys(space, map, regions, member, diary, { count: 1 });
  const { explain } = journey;
  assert.match(explain.start, new RegExp(`You gave “${journey.from.title}” \\d(\\.5)?★`));
  assert.match(explain.start, /closest|close/);
  assert.ok(explain.why.some(w => /never been here/.test(w)), 'a new region is said to be new');
  assert.ok(explain.why.some(w => /ranks \d+ of 48/.test(w)), 'with its rank for the member');
  assert.deepEqual(Object.keys(explain.steps).map(Number).sort(), journey.steps.map(s => s.id).sort(), 'a note per step');
  assert.ok(journey.steps.slice(-2).every(s => /^Inside /.test(explain.steps[s.id])), 'the last steps are inside');
  const director = directorJourney({ id: 5026, name: 'Akira Kurosawa' }, kurosawa, { fit: id => (id === 11645 ? 0.8 : null), why: ['You rate Akira Kurosawa highly.'] });
  assert.match(director.explain.start, /people with your taste love most/);
  assert.equal(director.explain.why[0], 'You rate Akira Kurosawa highly.');
  assert.match(director.explain.steps[11645], /^Start here/);
  const bridge = bridgeJourney(space, map, member, diary, {
    from: { person: { id: 608, name: 'Hayao Miyazaki' }, films: [129, 128, 8392, 4935] },
    to: { person: { id: 5026, name: 'Akira Kurosawa' }, films: kurosawa.map(k => k.id) }
  });
  assert.match(bridge.explain.start, /“Spirited Away” 5★, your highest rating for Hayao Miyazaki/);
  assert.ok(bridge.steps.slice(-2).every(s => bridge.explain.steps[s.id] === 'By Akira Kurosawa'));
  const { cleanJourney } = await import('../server/journeys.js');
  const saved = cleanJourney({ ...journey, explain: { ...explain, why: [...explain.why, 'x'.repeat(900)] } });
  assert.ok(saved.explain.why.every(w => w.length <= 300));
  assert.equal(Object.keys(saved.explain.steps).length, journey.steps.length);
});
