import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { parseDiary, syncMember, syncEveryone } from '../server/letterboxd.js';
import { library } from '../api/library.js';
import { execute } from '../server/http.js';

const originalFetch = globalThis.fetch;
const json = (data, status = 200) => new Response(data === undefined ? '' : JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const item = ({ id, title, year = 2020, stars, at, watched = '2026-10-01' }) => `<item> <title>${title}</title> <pubDate>${at}</pubDate> <letterboxd:watchedDate>${watched}</letterboxd:watchedDate> <letterboxd:filmTitle>${title}</letterboxd:filmTitle> <letterboxd:filmYear>${year}</letterboxd:filmYear>${stars ? ` <letterboxd:memberRating>${stars}</letterboxd:memberRating>` : ''}${id ? ` <tmdb:movieId>${id}</tmdb:movieId>` : ''} <description><![CDATA[ <p>Watched.</p> ]]></description> </item>`;
const feed = items => `<?xml version='1.0' encoding='utf-8'?><rss xmlns:letterboxd="https://letterboxd.com" xmlns:tmdb="https://themoviedb.org"><channel>${items.join('')}</channel></rss>`;

beforeEach(() => {
  process.env.APP_URL = 'https://umbrify.test';
  process.env.SUPABASE_URL = 'https://db.test';
  process.env.SUPABASE_ANON_KEY = 'public-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  process.env.TMDB_KEY = 'tmdb-key';
  process.env.CRON_SECRET = 'night-secret';
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.CRON_SECRET;
});

test('the diary feed gives TMDB ids, ratings on a ten-point scale and entries newest first', () => {
  const entries = parseDiary(feed([
    item({ id: 11, title: 'Salò, or the 120 Days of Sodom', year: 1975, stars: '4.5', at: 'Fri, 2 Oct 2026 10:00:00 +0000' }),
    item({ id: 12, title: 'Caro diario &amp; more', year: 1993, at: 'Sat, 3 Oct 2026 10:00:00 +0000' }),
    item({ title: 'A list, not a film', at: 'Sun, 4 Oct 2026 10:00:00 +0000' })
  ]));
  assert.deepEqual(entries.map(e => [e.id, e.title, e.year, e.rating]), [
    [12, 'Caro diario & more', 1993, null],
    [11, 'Salò, or the 120 Days of Sodom', 1975, 9]
  ]);
});

// A fake Supabase and TMDB that remember what the sync asked for.
function services({ library = [], diary, locked = false } = {}) {
  const calls = { applied: [], patches: [], tmdb: [] };
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.startsWith('https://letterboxd.com/')) return u.includes('/nobody/') ? new Response('', { status: 404 }) : new Response(diary, { status: 200 });
    if (u.startsWith('https://api.themoviedb.org/3/movie/')) {
      const id = Number(u.match(/movie\/(\d+)/)[1]);
      calls.tmdb.push(id);
      return json({ id, title: `TMDB ${id}`, poster_path: `/p${id}.jpg`, genres: [{ id: 18 }], release_date: '1975-01-01' });
    }
    if (u.includes('/rpc/lock_letterboxd')) return json(!locked);
    if (u.includes('/rpc/apply_letterboxd')) {
      const body = JSON.parse(init.body);
      calls.applied.push(body);
      return json({ added: body.entries.filter(e => !library.includes(e.movie_id)).length, rated: body.entries.filter(e => library.includes(e.movie_id) && e.rating).length });
    }
    if (u.includes('/rest/v1/user_movies?')) return json(library.map(movie_id => ({ movie_id })));
    if (u.includes('/rest/v1/letterboxd_links?') && init.method === 'PATCH') {
      calls.patches.push(JSON.parse(init.body));
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected request ${u}`);
  };
  return calls;
}

test('a sync applies only entries published since the last one, and asks TMDB only about new films', async () => {
  const calls = services({
    library: [21],
    diary: feed([
      item({ id: 22, title: 'New film', stars: '3', at: 'Mon, 5 Oct 2026 10:00:00 +0000' }),
      item({ id: 21, title: 'Rewatched', stars: '5', at: 'Sun, 4 Oct 2026 10:00:00 +0000' }),
      item({ id: 22, title: 'New film', stars: '2', at: 'Sun, 4 Oct 2026 09:00:00 +0000' }),
      item({ id: 23, title: 'Already applied', stars: '4', at: 'Thu, 1 Oct 2026 10:00:00 +0000' })
    ])
  });
  const result = await syncMember({ user_id: 'u1', username: 'ada', cursor: '2026-10-02T00:00:00Z' });
  assert.deepEqual(result, { added: 1, rated: 1 });
  const [{ actor, entries }] = calls.applied;
  assert.equal(actor, 'u1');
  // The newest entry for a film wins; the one before the cursor is not read again.
  assert.deepEqual(entries.map(e => [e.movie_id, e.rating]), [[22, 6], [21, 10]]);
  assert.deepEqual(calls.tmdb, [22]);
  assert.equal(entries[0].movie.poster_path, '/p22.jpg');
  assert.equal(calls.patches[0].cursor, '2026-10-05T10:00:00.000Z');
  assert.equal(calls.patches[0].last_error, null);
});

test('nothing new means no write to the library', async () => {
  const calls = services({ diary: feed([item({ id: 23, title: 'Old', stars: '4', at: 'Thu, 1 Oct 2026 10:00:00 +0000' })]) });
  assert.deepEqual(await syncMember({ user_id: 'u1', username: 'ada', cursor: '2026-10-02T00:00:00Z' }), { added: 0, rated: 0 });
  assert.equal(calls.applied.length, 0);
  assert.equal(calls.patches.length, 1);
});

test('a member already syncing is left alone', async () => {
  const calls = services({ locked: true, diary: feed([]) });
  assert.equal((await syncMember({ user_id: 'u1', username: 'ada', cursor: null })).busy, true);
  assert.equal(calls.patches.length, 0);
});

test('a failed read is recorded on the link and the lock is released', async () => {
  const calls = services({ diary: feed([]) });
  await assert.rejects(syncMember({ user_id: 'u1', username: 'nobody', cursor: null }), /No Letterboxd member/);
  assert.equal(calls.patches[0].last_error, 'No Letterboxd member has that username.');
  assert.equal(calls.patches[0].locked_until, null);
});

test('the night run reaches every linked member and survives one failing', async () => {
  const calls = services({ diary: feed([item({ id: 30, title: 'Film', stars: '4', at: 'Mon, 5 Oct 2026 10:00:00 +0000' })]) });
  const fetcher = globalThis.fetch;
  globalThis.fetch = async (url, init) => String(url).includes('letterboxd_links?select=')
    ? json([{ user_id: 'a', username: 'ada', cursor: null }, { user_id: 'b', username: 'nobody', cursor: null }])
    : fetcher(url, init);
  assert.deepEqual(await syncEveryone(), { members: 1, failed: 1, remaining: 0 });
  assert.equal(calls.applied.length, 1);
});

test('only Vercel cron, holding the secret, can start the night run', async () => {
  services({ diary: feed([]) });
  const fetcher = globalThis.fetch;
  globalThis.fetch = async (url, init) => String(url).includes('letterboxd_links?select=') ? json([]) : fetcher(url, init);
  const call = authorization => execute(new Request('https://umbrify.test/api/library?action=letterboxd-cron', { headers: authorization ? { authorization } : {} }), library);
  assert.equal((await call()).status, 401);
  assert.equal((await call('Bearer wrong')).status, 401);
  const ok = await call('Bearer night-secret');
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { members: 0, failed: 0, remaining: 0 });
  delete process.env.CRON_SECRET;
  assert.equal((await call('Bearer undefined')).status, 401);
});

test('a visit soon after the last sync is skipped and reports no new films', async () => {
  const calls = services({ diary: feed([]) });
  const fetcher = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u === 'https://db.test/auth/v1/user') return json({ id: 'u1' });
    if (u.includes('letterboxd_links?user_id=eq.u1&select=')) return json([{ user_id: 'u1', username: 'ada', cursor: null, synced_at: new Date().toISOString(), last_added: 12, last_rated: 3, last_error: null }]);
    return fetcher(url, init);
  };
  const response = await execute(new Request('https://umbrify.test/api/library?action=letterboxd-sync', {
    method: 'POST',
    headers: { cookie: 'umbrify_access=token', 'x-umbrify-request': '1', origin: 'https://umbrify.test', 'content-type': 'application/json' },
    body: '{}'
  }), library);
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.skipped, true);
  assert.equal(result.added, undefined);
  assert.equal(result.last_added, 12);
  assert.equal(calls.applied.length, 0);
});

test('only Letterboxd film links are read, in one canonical form', async () => {
  const { filmLink, tmdbIdOnPage } = await import('../server/letterboxd.js');
  assert.equal(filmLink('https://boxd.it/237s'), 'https://boxd.it/237s');
  assert.equal(filmLink('https://letterboxd.com/ada/film/salo-or-the-120-days-of-sodom/'), 'https://letterboxd.com/film/salo-or-the-120-days-of-sodom/');
  assert.equal(filmLink('https://letterboxd.com/ada/film/salo-or-the-120-days-of-sodom/2/'), 'https://letterboxd.com/film/salo-or-the-120-days-of-sodom/');
  for (const bad of ['https://evil.test/film/x/', 'https://boxd.it/../x', 'javascript:alert(1)', '', null]) assert.equal(filmLink(bad), null);
  assert.equal(tmdbIdOnPage('<html><body class="film" data-type="film" data-tmdb-type="movie" data-tmdb-id="5336">'), 5336);
  assert.equal(tmdbIdOnPage('<body data-tmdb-type="tv" data-tmdb-id="1399">'), null);
  assert.equal(tmdbIdOnPage('<body>'), null);
});

test('film links resolve from the shared cache first, and a refusal is not remembered', async () => {
  const { resolveFilms } = await import('../server/letterboxd.js');
  const written = [];
  const read = [];
  const db = async (path, options = {}) => {
    if (options.method === 'POST') { written.push(...options.body); return null; }
    return [{ link: 'https://boxd.it/aaa', tmdb_id: 11 }, { link: 'https://boxd.it/nope', tmdb_id: null }];
  };
  globalThis.fetch = async (url) => {
    read.push(String(url));
    if (String(url).endsWith('/bbb')) return new Response('<html><body data-tmdb-type="movie" data-tmdb-id="22">', { status: 200 });
    if (String(url).endsWith('/ccc')) return new Response('', { status: 403 });
    return new Response('', { status: 404 });
  };
  const found = await resolveFilms(['https://boxd.it/aaa', 'https://boxd.it/bbb', 'https://boxd.it/ccc', 'https://boxd.it/ddd', 'https://boxd.it/nope', 'https://evil.test/x'], { db });
  assert.deepEqual(found, { 'https://boxd.it/aaa': 11, 'https://boxd.it/bbb': 22 });
  // Cached links, including a known miss, are not read again.
  assert.deepEqual(read.sort(), ['https://boxd.it/bbb', 'https://boxd.it/ccc', 'https://boxd.it/ddd']);
  // A missing page is remembered; Letterboxd refusing is not.
  assert.deepEqual(written.map(w => [w.link, w.tmdb_id]).sort(), [['https://boxd.it/bbb', 22], ['https://boxd.it/ddd', null]]);
});

test('the film-link service is open to guests but bounded', async () => {
  globalThis.fetch = async (url) => String(url).includes('consume_auth_limit') ? json(true) : json([]);
  const call = data => execute(new Request('https://umbrify.test/api/library?action=letterboxd-films', {
    method: 'POST',
    headers: { 'x-umbrify-request': '1', origin: 'https://umbrify.test', 'content-type': 'application/json' },
    body: JSON.stringify(data)
  }), library);
  assert.equal((await call({ links: Array(26).fill('https://boxd.it/a') })).status, 400);
  const ok = await call({ links: [] });
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { films: {} });
});
