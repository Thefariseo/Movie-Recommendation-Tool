import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readList, saveList, changeListFilm } from '../server/lists.js';
import { social } from '../api/social.js';
import { execute } from '../server/http.js';

const A = '11111111-1111-4111-8111-111111111111', L = '44444444-4444-4444-8444-444444444444';
const originalFetch = globalThis.fetch;
beforeEach(() => Object.assign(process.env, { APP_URL: 'https://umbrify.test', SUPABASE_URL: 'https://db.test', SUPABASE_ANON_KEY: 'public-anon' }));
afterEach(() => { globalThis.fetch = originalFetch; });

function db(handler) {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const u = new URL(url);
    const call = { table: u.pathname.split('/').pop(), method: options.method || 'GET', auth: options.headers?.Authorization, body: options.body ? JSON.parse(options.body) : null, query: u.search };
    calls.push(call);
    return Response.json(handler?.(call) ?? []);
  };
  return calls;
}

test('a public list opens for a visitor without an account, as the anonymous role', async () => {
  const calls = db((c) => (c.table === 'film_lists' ? [{ id: L, owner: A, owner_name: 'Ada', title: 'Ozu', films: [], public: true }] : []));
  const res = await execute(new Request(`https://umbrify.test/api/social?list=${L}`), social);
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.list.title, 'Ozu');
  assert.equal(data.list.mine, false);
  assert.equal(calls.find((c) => c.table === 'film_lists').auth, 'Bearer public-anon');
});

test('a list is titled, bounded, and holds each film once with only what the page shows', async () => {
  const ctx = { token: 't', user: { id: A } };
  const calls = db((c) => (c.table === 'profiles' ? [{ display_name: 'Ada Lovelace' }] : c.table === 'film_lists' && c.method === 'POST' ? [{ id: L, ...c.body }] : []));
  await assert.rejects(saveList(ctx, { title: '  ' }), /title/);
  await assert.rejects(saveList(ctx, { title: 'x', films: Array.from({ length: 201 }, (_, i) => ({ id: i + 1, title: 't' })) }), /200/);
  const { list } = await saveList(ctx, { title: '  Seventies   horror ', films: [{ id: 5, title: 'Suspiria', poster_path: '/s.jpg', overview: 'long'.repeat(99), note: 'Argento at his wildest' }, { id: 5, title: 'Suspiria' }, { id: 6, title: 'Halloween', release_date: '1978-10-25' }] });
  const insert = calls.find((c) => c.method === 'POST').body;
  assert.equal(insert.title, 'Seventies horror');
  assert.equal(insert.owner, A);
  assert.equal(insert.owner_name, 'Ada Lovelace');
  assert.deepEqual(insert.films.map((f) => f.id), [5, 6]);
  assert.deepEqual(Object.keys(insert.films[0]).sort(), ['genre_ids', 'id', 'note', 'poster_path', 'title', 'year']);
  assert.equal(insert.films[1].year, 1978);
  assert.equal(list.mine, true);
});

test('adding puts a film at the end once; removing takes it out', async () => {
  const ctx = { token: 't', user: { id: A } };
  const stored = { id: L, title: 'Ozu', description: '', public: true, films: [{ id: 1, title: 'Tokyo Story' }, { id: 2, title: 'Late Spring' }] };
  const calls = db((c) => (c.table === 'film_lists' && c.method === 'GET' ? [stored] : c.table === 'film_lists' && c.method === 'PATCH' ? [{ ...stored, ...c.body }] : []));
  await changeListFilm(ctx, L, { id: 1, title: 'Tokyo Story' });
  assert.deepEqual(calls.find((c) => c.method === 'PATCH').body.films.map((f) => f.id), [2, 1]);
  await changeListFilm(ctx, L, 2, true);
  assert.deepEqual(calls.filter((c) => c.method === 'PATCH').at(-1).body.films.map((f) => f.id), [1]);
  assert.ok(calls.filter((c) => c.method === 'PATCH').every((c) => c.query.includes(`owner=eq.${A}`)), 'only the owner\'s list changes');
});
