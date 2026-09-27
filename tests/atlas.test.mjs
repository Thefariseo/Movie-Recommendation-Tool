import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTasteSpace } from '../shared/tasteSpace.js';
import { parseTasteMap } from '../shared/journeys.js';
import { territoryGrid, borders, territories, tally, milestones, frontier, territoryName, CONQUER } from '../shared/atlas.js';

const buf = (f) => { const b = readFileSync(new URL(`../public/models/${f}`, import.meta.url)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const space = parseTasteSpace(buf('taste-space.bin'));
const map = parseTasteMap(buf('taste-map.bin'));
const { regions } = JSON.parse(readFileSync(new URL('../public/models/taste-map.json', import.meta.url)));
const grid = territoryGrid(map);
const regionOf = (id) => map.region[space.index.get(id)];

test('every region gets a territory on the grid, in one main piece, with neighbours', () => {
  const present = new Set(Array.from(grid.cells).filter((c) => c >= 0));
  assert.equal(present.size, regions.length);
  const next = borders(grid);
  assert.ok([...next.values()].every((s) => s.size >= 1));
  for (const [a, set] of next) for (const b of set) assert.ok(next.get(b).has(a), 'borders are mutual');
});

test('territories: conquered, visited, frontier and unexplored follow the diary', () => {
  // Five Ghibli films, four loved: their region is conquered.
  const ghibli = [[129, 10], [128, 10], [8392, 9], [4935, 9], [10515, 6]].map(([id, rated]) => ({ id, rated }));
  const lands = territories(space, map, regions, [...ghibli, { id: 694, rated: 5 }], grid);
  const home = lands.get(regionOf(129));
  assert.equal(home.status, 'conquered');
  assert.equal(home.films[0].rated, 10, 'the best-rated film first');
  const shining = lands.get(regionOf(694));
  assert.equal(shining.status, 'settled');
  assert.deepEqual(shining.toConquer, { seen: CONQUER.seen - 1, loved: CONQUER.loved });
  const counts = tally(lands);
  assert.equal(counts.conquered + counts.settled + counts.frontier + counts.unexplored, regions.length);
  assert.ok(counts.frontier > 0);
  for (const t of lands.values()) if (t.status === 'frontier') assert.ok(t.neighbours.some((n) => lands.get(n).seen > 0), 'a frontier borders a visited territory');
  const edge = frontier(lands, [{ id: [...lands.values()].find((t) => t.status === 'frontier').region.id, score: 9, rank: 1 }]);
  assert.equal(edge[0].rank, 1, 'the most promising frontier first');
});

test('milestones count what the member has done, and names read as places', () => {
  const lands = territories(space, map, regions, [[129, 10], [128, 10], [8392, 9], [4935, 9], [10515, 8]].map(([id, rated]) => ({ id, rated })), grid);
  const marks = milestones(lands, { journeys: [{ arrived: true, kind: 'friend' }] });
  const by = Object.fromEntries(marks.map((m) => [m.id, m]));
  assert.equal(by.conquest.earned, true);
  assert.equal(by.pathfinder.earned, true);
  assert.equal(by.company.earned, true);
  assert.equal(by.atlas.earned, false);
  assert.ok(marks.every((m) => m.have <= m.need));
  assert.equal(territoryName({ landmarks: [{ title: 'Spirited Away' }, { title: 'Princess Mononoke' }] }), 'Spirited Away & Princess Mononoke');
  assert.equal(territoryName({ genres: ['Horror', 'Thriller'], decade: 1980 }), 'Horror & Thriller, 1980s');
});
