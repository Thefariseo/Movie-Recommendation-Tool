import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTasteSpace } from '../shared/tasteSpace.js';
import { connect, tiesBetween } from '../shared/connections.js';

const b = readFileSync(new URL('../public/models/taste-space.bin', import.meta.url));
const space = parseTasteSpace(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
const person = (id, name, job) => ({ id, name, job });
const film = ({ id, title, year, saga = null, crew = [], cast = [], keywords = [], country = 'US', genres = [18, 80] }) => ({
  id, title, release_date: `${year}-01-01`, genres: genres.map((g) => ({ id: g })), origin_country: [country],
  belongs_to_collection: saga, credits: { crew, cast: cast.map(([cid, name]) => ({ id: cid, name })) },
  keywords: { keywords: keywords.map(([kid, name]) => ({ id: kid, name })) }
});
const SAGA = { id: 230, name: 'The Godfather Collection' };
const coppola = person(1776, 'Francis Ford Coppola', 'Director'), puzo = person(3084, 'Mario Puzo', 'Screenplay'), rota = person(1259, 'Nino Rota', 'Original Music Composer');
const scorsese = person(1032, 'Martin Scorsese', 'Director');
const details = new Map([
  [240, film({ id: 240, title: 'The Godfather Part II', year: 1974, saga: SAGA, crew: [coppola, puzo, rota], cast: [[1158, 'Al Pacino'], [3087, 'Robert Duvall'], [380, 'Robert De Niro']], keywords: [[1, 'mafia'], [2, 'sequel'], [3, 'dreary'], [4, 'family']] })],
  [238, film({ id: 238, title: 'The Godfather', year: 1972, saga: SAGA, crew: [coppola, puzo, rota], cast: [[3084, 'Marlon Brando'], [1158, 'Al Pacino'], [3087, 'Robert Duvall']], keywords: [[1, 'mafia'], [2, 'sequel'], [3, 'dreary'], [4, 'family']] })],
  [769, film({ id: 769, title: 'GoodFellas', year: 1990, crew: [scorsese], cast: [[380, 'Robert De Niro']], keywords: [[1, 'mafia']] })],
  [111, film({ id: 111, title: 'Scarface', year: 1983, crew: [person(1150, 'Brian De Palma', 'Director')], cast: [[1158, 'Al Pacino']], keywords: [[1, 'mafia']] })]
]);
const diary = [
  { id: 238, title: 'The Godfather', rated: 10, genres: [18, 80], year: 1972 },
  { id: 769, title: 'GoodFellas', rated: 9, genres: [18, 80], year: 1990 },
  { id: 111, title: 'Scarface', rated: 4, genres: [28, 80, 18], year: 1983 },
  { id: 129, title: 'Spirited Away', rated: 10, genres: [16, 10751, 14], year: 2001 }
];
const target = { id: 240, title: 'The Godfather Part II', genre_ids: [18, 80], release_date: '1974-12-20' };

test('ties name what two films share, strongest first, and skip hollow keywords', () => {
  const ties = tiesBetween(details.get(240), details.get(238), { peer: 0.8 });
  const kinds = ties.map((t) => t.kind);
  assert.deepEqual(kinds.slice(0, 2), ['saga', 'director']);
  assert.ok(ties.find((t) => t.kind === 'saga').text.includes('The Godfather saga'));
  assert.ok(!ties.some((t) => /the The/.test(t.text)));
  assert.ok(ties.some((t) => t.text === 'written by Mario Puzo') && ties.some((t) => t.text === 'music by Nino Rota'));
  assert.ok(ties.find((t) => t.kind === 'cast').text.includes('Al Pacino and Robert Duvall'));
  const themes = ties.find((t) => t.kind === 'themes').text;
  assert.ok(themes.includes('mafia') && !themes.includes('sequel') && !themes.includes('dreary'), themes);
  assert.equal(ties.find((t) => t.kind === 'tone')?.text, 'both dreary in tone');
  assert.equal(ties.find((t) => t.kind === 'audience').text, 'loved by almost exactly the same people');
  assert.equal(ties.find((t) => t.kind === 'era').text, 'both made in the United States in the 1970s');
  assert.ok(!tiesBetween(details.get(240), details.get(769)).some((t) => t.kind === 'era'), 'different decades are not an era tie');
});

test('the sequel of a loved film leads, and the prediction follows it rather than the loose neighbours', () => {
  const c = connect({ target, details, watched: diary, space });
  assert.equal(c.links[0].film.title, 'The Godfather');
  assert.match(c.summary[0], /^It belongs to The Godfather saga, like “The Godfather”, which you gave 5★: both directed by Francis Ford Coppola/);
  assert.ok(c.expected >= 8.5, `a 5★ film's sequel is expected to be loved: ${c.expected}`);
  assert.ok(c.summary.some((l) => /pull both ways/.test(l)), 'a close film rated low is not hidden');
  assert.ok(!c.links.some((l) => l.film.title === 'Spirited Away' && l.ties.some((t) => t.kind !== 'audience')));
});

test('a film already rated is compared with its neighbours, not predicted', () => {
  const c = connect({ target, details, watched: [...diary, { id: 240, title: 'The Godfather Part II', rated: 6, genres: [18, 80], year: 1974 }], space, seen: 6 });
  assert.ok(c.links.every((l) => l.film.id !== 240));
  assert.match(c.summary.at(-1), /^You gave it 3★, less than the films it is tied to would suggest/);
});

test('without shared people, the summary says what the tie really is', () => {
  const lone = new Map([[240, details.get(240)], [769, film({ id: 769, title: 'GoodFellas', year: 1990, keywords: [[1, 'mafia']] })]]);
  const c = connect({ target, details: lone, watched: diary.slice(1, 2), space: null });
  assert.ok(c.summary.some((l) => /new ground/.test(l)), c.summary.join(' '));
  assert.equal(connect({ target, details, watched: [], space }), null);
});
