import test from 'node:test';
import assert from 'node:assert/strict';

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
