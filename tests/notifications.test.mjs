import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readNotifications, notify, pushKey, subscribePush } from '../server/notifications.js';

const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222', C = '33333333-3333-4333-8333-333333333333';
const originalFetch = globalThis.fetch;
const env = { APP_URL: 'https://umbrify.test', SUPABASE_URL: 'https://db.test', SUPABASE_ANON_KEY: 'public' };
beforeEach(() => {
  for (const k of ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) delete process.env[k];
  Object.assign(process.env, env);
});
afterEach(() => { globalThis.fetch = originalFetch; });
const hours = (h) => new Date(Date.now() - h * 3600_000).toISOString();

function tables(t) {
  const seen = [];
  globalThis.fetch = async (url) => {
    const u = new URL(url);
    const table = u.pathname.split('/').pop();
    seen.push(table + u.search);
    return Response.json(t[table]?.(u.searchParams) ?? []);
  };
  return seen;
}

test('the bell lists a night waiting for my vote, a decided night, a new follower and a friend\'s loved film, newest first', async () => {
  tables({
    tonight_sessions: () => [
      { id: 'n1', host: B, members: [A, B], status: 'open', films: [{ id: 1, title: 'Alien' }, { id: 2, title: 'Heat' }, { id: 3, title: 'Ran', reserve: true }], created_at: hours(1) },
      { id: 'n2', host: C, members: [A, C], status: 'open', films: [{ id: 4 }], created_at: hours(2) },
      // Nobody answered for two days: it has expired and asks for nothing.
      { id: 'n4', host: C, members: [A, C], status: 'open', films: [{ id: 5 }], created_at: hours(60) },
      { id: 'n3', host: A, members: [A, B], status: 'decided', winner: 2, films: [{ id: 2, title: 'Heat', poster_path: '/h.jpg' }], created_at: hours(30), decided_at: hours(5) }
    ],
    tonight_votes: () => [{ session_id: 'n2', user_id: A, updated_at: hours(2) }, { session_id: 'n4', user_id: C, updated_at: hours(50) }],
    follows: (q) => (q.get('followed_id') ? [{ follower_id: C, created_at: hours(3) }] : [{ followed_id: B }]),
    user_movies: () => [{ user_id: B, movie_id: 9, movie: { title: 'Tokyo Story', poster_path: '/t.jpg' }, rating: 10, updated_at: hours(8) }],
    profiles: () => [{ id: B, display_name: 'Bea' }, { id: C, display_name: 'Carlo' }]
  });
  const { items, push } = await readNotifications({ token: 't', user: { id: A } });
  assert.deepEqual(items.map((i) => i.kind), ['night-vote', 'follower', 'night-decided', 'friend-loved']);
  assert.equal(items[0].title, 'Bea invited you to a movie night');
  assert.equal(items[0].body, '2 films are waiting for your vote.', 'wild cards stay hidden');
  assert.equal(items[0].link, '/tonight/n1');
  assert.match(items[1].body, /Follow back/, 'Carlo is not followed back');
  assert.equal(items[2].title, "Tonight's film: Heat");
  assert.equal(items[2].body, 'Your movie night is decided.');
  assert.equal(items[3].title, 'Bea loved Tokyo Story');
  assert.equal(push, null, 'push is off without VAPID keys');
});

test('push stays off until VAPID keys and the service role are set, and then reaches every device', async () => {
  let sent = [];
  const send = async (sub, payload) => { sent.push([sub.endpoint, JSON.parse(payload)]); };
  assert.equal(await notify([B], { title: 'x' }, { send }), 0);
  assert.equal(pushKey(), null);
  Object.assign(process.env, { VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv', SUPABASE_SERVICE_ROLE_KEY: 'service' });
  assert.equal(pushKey(), 'pub');
  const removed = [];
  const db = async (path, { method } = {}) => {
    if (method === 'DELETE') { removed.push(path); return []; }
    return [{ user_id: B, endpoint: 'https://push.test/1', p256dh: 'k', auth: 'a' }, { user_id: C, endpoint: 'https://push.test/gone', p256dh: 'k', auth: 'a' }];
  };
  let asked = 0;
  const sendSome = async (sub, payload) => {
    if (sub.endpoint.endsWith('gone')) throw Object.assign(new Error('gone'), { statusCode: 410 });
    return send(sub, payload);
  };
  const n = await notify([B, C, B], async () => { asked++; return { title: 'Bea invited you', body: 'Vote', link: '/tonight/n1' }; }, { send: sendSome, db });
  assert.equal(n, 1);
  assert.equal(asked, 1, 'the message is built once');
  assert.deepEqual(sent, [['https://push.test/1', { title: 'Bea invited you', body: 'Vote', link: '/tonight/n1', tag: null }]]);
  assert.equal(removed.length, 1, 'a device the push service forgot is forgotten too');
  assert.match(removed[0], /gone/);
  sent = [];
  assert.equal(await notify([B], { title: 'x' }, { send, db: async () => { throw new Error('down'); } }), 0, 'never throws');
});

test('a subscription must be a real push endpoint with its keys', async () => {
  Object.assign(process.env, { VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv', SUPABASE_SERVICE_ROLE_KEY: 'service' });
  const saved = tables({ push_subscriptions: () => [] });
  const ctx = { token: 't', user: { id: A } };
  await assert.rejects(subscribePush(ctx, { endpoint: 'http://insecure.test', keys: { p256dh: 'x'.repeat(60), auth: 'y'.repeat(16) } }), /invalid/);
  await assert.rejects(subscribePush(ctx, { endpoint: 'https://push.test/1', keys: { p256dh: 'short', auth: 'y'.repeat(16) } }), /invalid/);
  await subscribePush(ctx, { endpoint: 'https://push.test/1', keys: { p256dh: 'x'.repeat(60), auth: 'y'.repeat(16) } });
  assert.equal(saved.length, 1);
});
