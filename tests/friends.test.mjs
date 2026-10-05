import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { recommendFilm, react, reactionsFor, personView } from '../server/friends.js';

const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222', C = '33333333-3333-4333-8333-333333333333';
const originalFetch = globalThis.fetch;
beforeEach(() => {
  for (const k of ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) delete process.env[k];
  Object.assign(process.env, { APP_URL: 'https://umbrify.test', SUPABASE_URL: 'https://db.test', SUPABASE_ANON_KEY: 'public' });
});
afterEach(() => { globalThis.fetch = originalFetch; });
const ctx = { token: 't', user: { id: A } };

function db(handler) {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const u = new URL(url);
    const call = { table: u.pathname.split('/').pop(), method: options.method || 'GET', query: u.searchParams, body: options.body ? JSON.parse(options.body) : null };
    calls.push(call);
    const out = handler?.(call);
    if (out instanceof Response) return out;
    return Response.json(out ?? []);
  };
  return calls;
}

test('a film goes to each friend once, with a bounded note, and the earlier copy is replaced', async () => {
  const calls = db();
  await assert.rejects(recommendFilm(ctx, { to: [], movie: { id: 1, title: 'Ran' } }), /friends/);
  await assert.rejects(recommendFilm(ctx, { to: [B], movie: { title: 'No id' } }), (e) => e.status === 400);
  const out = await recommendFilm(ctx, { to: [B, C, B, A], movie: { id: 11645, title: 'Ran', poster_path: '/r.jpg', overview: 'long'.repeat(500) }, note: 'x'.repeat(400) });
  assert.equal(out.sent, 2, 'never to yourself, never twice');
  const insert = calls.find((c) => c.method === 'POST');
  assert.deepEqual(insert.body.map((r) => r.recipient), [B, C]);
  assert.equal(insert.body[0].note.length, 280);
  assert.deepEqual(Object.keys(insert.body[0].movie).sort(), ['genre_ids', 'id', 'poster_path', 'title', 'year'], 'only what the inbox shows is kept');
  assert.ok(calls.findIndex((c) => c.method === 'DELETE') < calls.indexOf(insert), 'the earlier copy goes first');
});

test('sending to someone who is not a mutual friend is refused plainly', async () => {
  db((c) => (c.method === 'POST' ? new Response(JSON.stringify({ code: '42501', message: 'new row violates row-level security policy' }), { status: 403 }) : null));
  await assert.rejects(recommendFilm(ctx, { to: [B], movie: { id: 1, title: 'Ran' } }), (e) => e.status === 403 && /follow you back/.test(e.message));
});

test('a reaction is one of six, and none removes it', async () => {
  const calls = db();
  await assert.rejects(react(ctx, { owner: B, movie_id: 5, emoji: 'poop' }), /Unknown reaction/);
  await react(ctx, { owner: B, movie_id: 5, emoji: 'fire' });
  assert.deepEqual(calls.at(-1).body, { owner: B, movie_id: 5, reactor: A, emoji: 'fire', created_at: calls.at(-1).body.created_at });
  await react(ctx, { owner: B, movie_id: 5, emoji: null });
  assert.equal(calls.at(-1).method, 'DELETE');
  db(() => [{ owner: B, movie_id: 5, reactor: A, emoji: 'fire' }, { owner: B, movie_id: 5, reactor: C, emoji: 'heart' }]);
  assert.deepEqual(await reactionsFor(ctx, [{ user_id: B, movie_id: 5 }]), { [`${B}:5`]: [{ reactor: A, emoji: 'fire' }, { reactor: C, emoji: 'heart' }] });
});

test('a profile shows the library only to mutual friends who share it', async () => {
  const state = { followsBack: false, share: true };
  db((c) => {
    if (c.table === 'profiles') return [{ id: B, display_name: 'Bea', share_activity: state.share }];
    if (c.table === 'follows') return c.query.get('follower_id') === `eq.${A}` ? [{ followed_id: B }] : state.followsBack ? [{ follower_id: B }] : [];
    if (c.table === 'user_movies') return [{ movie_id: 1, kind: 'watched', movie: { id: 1, title: 'Ran' }, rating: 9 }];
    return [];
  });
  let v = await personView(ctx, B);
  assert.deepEqual([v.relation, v.shares, v.rows.length], [{ following: true, follower: false, mutual: false }, false, 0]);
  state.followsBack = true;
  v = await personView(ctx, B);
  assert.deepEqual([v.relation.mutual, v.shares, v.rows.length], [true, true, 1]);
  state.share = false;
  v = await personView(ctx, B);
  assert.deepEqual([v.shares, v.rows.length], [false, 0]);
});
