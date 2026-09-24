import test from 'node:test';
import assert from 'node:assert/strict';
import { planThreads, rankThread, MAX_THREADS } from '../shared/threads.js';
import { tasteEvidence } from '../shared/evidence.js';
import { tasteProfile } from '../shared/taste.js';

const details = ({ id, director, keywords = [], language = 'ja', cast = [] }) => ({
  id, title: `Film ${id}`, original_language: language, origin_country: ['JP'], genres: [{ id: 18 }],
  credits: { crew: [{ id: director[0], name: director[1], job: 'Director' }], cast: cast.map(([cid, name]) => ({ id: cid, name })) },
  keywords: { keywords: keywords.map(([kid, name]) => ({ id: kid, name })) }
});
const KUROSAWA = [5026, 'Akira Kurosawa'];
const library = [
  { id: 1, title: 'Ran', rated: 10, release_date: '1985-06-01', genre_ids: [18], details: details({ id: 1, director: KUROSAWA, keywords: [[7, 'samurai']], cast: [[50, 'Tatsuya Nakadai']] }) },
  { id: 2, title: 'Ikiru', rated: 9, release_date: '1952-10-09', genre_ids: [18], details: details({ id: 2, director: KUROSAWA, keywords: [[7, 'samurai']], cast: [[50, 'Tatsuya Nakadai']] }) },
  { id: 3, title: 'Harakiri', rated: 9, release_date: '1962-09-16', genre_ids: [18], details: details({ id: 3, director: [11, 'Masaki Kobayashi'], keywords: [[7, 'samurai']] }) },
  { id: 4, title: 'Blockbuster', rated: 3, release_date: '2015-06-01', genre_ids: [28], details: details({ id: 4, director: [12, 'Hack'], language: 'en' }) },
  { id: 5, title: 'Sequel', rated: 2, release_date: '2017-06-01', genre_ids: [28], details: details({ id: 5, director: [12, 'Hack'], language: 'en' }) }
];
const evidence = tasteEvidence(library);
const watched = library.map(({ details, ...m }) => m);

test('threads follow the member\'s own loves, directors first, each explained with their films', () => {
  const threads = planThreads({ watched, evidence, hasSpace: true, taste: tasteProfile(watched) });
  assert.ok(threads.length <= MAX_THREADS);
  assert.equal(threads[0].id, 'director:5026');
  assert.equal(threads[0].title, 'More from Akira Kurosawa');
  assert.match(threads[0].why, /You gave "Ran" 5★ and "Ikiru" 4.5★/);
  assert.deepEqual(threads[0].query, { type: 'person', id: 5026, role: 'director' });
  const kinds = threads.map(t => t.kind);
  for (const k of ['similar', 'theme', 'language', 'hidden', 'new-directors']) assert.ok(kinds.includes(k), `a ${k} thread`);
  assert.ok(threads.some(t => t.title === 'Because you loved "Harakiri"'), 'the most recently loved films come first');
  assert.ok(threads.some(t => t.title === 'Japanese cinema'));
  assert.ok(!threads.some(t => /Hack/.test(t.title)), 'a disliked director never gets a thread');
});

test('what the critic learned opens threads of its own, without repeating one the ratings already show', () => {
  const rules = [
    { kind: 'person', id: 5026, name: 'Akira Kurosawa', stance: 'love' },
    { kind: 'person', id: 608, name: 'Hayao Miyazaki', stance: 'love', why: 'loves Ghibli' },
    { kind: 'theme', id: 9748, name: 'slow burn', stance: 'love' },
    { kind: 'genre', id: 27, name: 'horror', stance: 'avoid' }
  ];
  const threads = planThreads({ watched, evidence, rules });
  assert.equal(threads.filter(t => t.id === 'director:5026').length, 1);
  const miyazaki = threads.find(t => t.id === 'director:608');
  assert.equal(miyazaki.kind, 'critic');
  assert.match(miyazaki.why, /Your critic: loves Ghibli/);
  assert.ok(threads.some(t => t.title === 'Slow burn'));
});

test('without ratings or a taste space there is nothing personal to follow', () => {
  assert.deepEqual(planThreads({ watched: [] }), []);
  assert.ok(!planThreads({ watched, evidence }).some(t => t.kind === 'hidden'), 'hidden gems need the taste space');
});

test('a thread never shows a watched, ruled-out or already-shown film, and puts the best match first', () => {
  const film = (id, extra = {}) => ({ id, title: `F${id}`, poster_path: '/p.jpg', release_date: '2001-01-01', vote_count: 500, vote_average: 7, ...extra });
  const films = [film(1), film(2), film(3), film(4, { release_date: '2999-01-01' }), film(5, { vote_count: 5 }), film(6, { poster_path: null }), film(7), film(7), film(8, { vote_average: 8.5 })];
  const ranked = rankThread(films, { exclude: new Set([1]), taken: new Set([2]), fit: id => (id === 3 ? 0.9 : null) });
  assert.deepEqual(ranked.map(m => m.id), [3, 8, 7]);
});

test('the curated directors are the right people on TMDB, each once', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../src/algorithms/recommender.js', import.meta.url), 'utf8');
  const block = source.slice(source.indexOf('CINEPHILE_DIRECTORS = ['), source.indexOf('];', source.indexOf('CINEPHILE_DIRECTORS = [')));
  const list = [...block.matchAll(/id:\s*(\d+),\s*name:\s*"([^"]+)"/g)].map(m => [Number(m[1]), m[2]]);
  assert.ok(list.length >= 30);
  assert.equal(new Set(list.map(([id]) => id)).size, list.length, 'no director twice');
  // Checked against TMDB (person name and directed films); a wrong id shows another person's films.
  const known = { 5026: 'Akira Kurosawa', 4429: 'Jim Jarmusch', 6648: 'Ingmar Bergman', 95501: 'Yasujirō Ozu', 8452: 'Andrei Tarkovsky', 608: 'Hayao Miyazaki' };
  for (const [id, name] of Object.entries(known)) assert.deepEqual(list.find(([i]) => i === Number(id)), [Number(id), name]);
  assert.ok(!list.some(([id]) => [1032, 5765, 14406].includes(id)), 'Scorsese, a script supervisor and Lisa Kudrow are not in the list');
});
