import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { seasonWeek, weekOpens, composeSeason, plainNotes, seasonProgress } from '../shared/seasons.js';
import { createSeason, readSeason } from '../server/seasons.js';

const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';
const DAY = 86_400_000;
const films = Array.from({ length: 8 }, (_, k) => ({ id: 100 + k, title: `Film ${k}`, year: 1990 + k, poster_path: `/p${k}.jpg`, overview: `A story number ${k}. More.`, director: `Director ${k}` }));

test('a week opens every seven days, and the season ends after the last', () => {
  const season = { started_at: new Date(Date.now() - 15 * DAY).toISOString(), weeks: films };
  assert.deepEqual(seasonWeek(season), { current: 2, open: 3, finished: false });
  assert.deepEqual(seasonWeek({ ...season, started_at: new Date().toISOString() }), { current: 0, open: 1, finished: false });
  assert.deepEqual(seasonWeek({ ...season, started_at: new Date(Date.now() - 60 * DAY).toISOString() }), { current: 7, open: 8, finished: true });
  assert.deepEqual(seasonWeek({ started_at: season.started_at, season: { weeks: films } }), { current: 2, open: 3, finished: false }, 'a stored season too');
  assert.equal(weekOpens(season, 1).getTime() - new Date(season.started_at).getTime(), 7 * DAY);
});

test('the critic\'s notes are kept in the season\'s order, bounded, and missing ones fall back to plain notes', () => {
  const notes = { title: 'Into the night', introduction: 'x'.repeat(2000), weeks: [{ id: 101, intro: 'Second.', watch_for: 'The light.', question: 'Why?' }, { id: 999, intro: 'Not in the season.' }] };
  const season = composeSeason(films, notes, { region: { id: 4, genres: ['Drama'], decade: 1970 } });
  assert.equal(season.title, 'Into the night');
  assert.equal(season.introduction.length, 700);
  assert.deepEqual(season.weeks.map((w) => w.id), films.map((f) => f.id));
  assert.equal(season.weeks[1].intro, 'Second.');
  assert.equal(season.weeks[0].intro, plainNotes(films).weeks[0].intro);
  assert.match(season.weeks[0].intro, /Directed by Director 0 \(1990\)\. A story number 0\./);
  assert.match(season.weeks[3].question, /Film 2/, 'the plain question compares with last week');
  assert.deepEqual(seasonProgress(season, [A, B], new Map([[A, new Set([100, 101, 5])]])), { [A]: [100, 101], [B]: [] });
});

const originalFetch = globalThis.fetch;
beforeEach(() => {
  for (const k of ['OPENAI_API_KEY', 'CRITIC_API_URL', 'VAPID_PUBLIC_KEY']) delete process.env[k];
  Object.assign(process.env, { APP_URL: 'https://umbrify.test', SUPABASE_URL: 'https://db.test', SUPABASE_ANON_KEY: 'public', TMDB_KEY: 'tmdb' });
});
afterEach(() => { globalThis.fetch = originalFetch; });

test('a season starts with 8, 10 or 12 films, and without the critic its notes are plain', async () => {
  const inserted = [];
  globalThis.fetch = async (url, options = {}) => {
    const u = new URL(url);
    if (u.hostname === 'api.themoviedb.org') {
      const id = Number(u.pathname.split('/').pop());
      const f = films.find((x) => x.id === id);
      return Response.json({ id, title: f.title, release_date: `${f.year}-01-01`, poster_path: f.poster_path, overview: f.overview, credits: { crew: [{ job: 'Director', name: f.director }] } });
    }
    if (u.pathname.endsWith('/cinema_seasons')) { const body = JSON.parse(options.body); inserted.push(body); return Response.json([{ id: 'season-1', ...body }]); }
    return Response.json([]);
  };
  const ctx = { token: 't', user: { id: A } };
  await assert.rejects(createSeason(ctx, { films: films.slice(0, 5).map((f) => f.id) }), /8, 10, 12/);
  const { season } = await createSeason(ctx, { films: films.map((f) => f.id), members: [B, A], place: 'Japanese drama of the 1950s' });
  assert.deepEqual(inserted[0].members, [A, B], 'the host first, never twice');
  assert.equal(season.season.by, 'plain');
  assert.equal(season.season.title, 'A season of Japanese drama of the 1950s');
  assert.equal(season.season.weeks.length, 8);
});

test('notes on weeks not open yet stay hidden from the others', async () => {
  const row = { id: 'season-1', host: A, members: [A, B], started_at: new Date(Date.now() - 15 * DAY).toISOString(), season: composeSeason(films, null) };
  globalThis.fetch = async (url) => {
    const u = new URL(url);
    const table = u.pathname.split('/').pop();
    if (table === 'cinema_seasons') return Response.json([row]);
    if (table === 'season_notes') return Response.json([
      { user_id: B, movie_id: 100, note: 'Week one, open.' },
      { user_id: B, movie_id: 102, note: 'Week three, open.' },
      { user_id: B, movie_id: 103, note: 'Week four, not open yet.' },
      { user_id: A, movie_id: 104, note: 'My own early note.' }
    ]);
    if (table === 'user_movies') return Response.json([{ user_id: B, movie_id: 100, rating: 9 }]);
    return Response.json([]);
  };
  const data = await readSeason({ token: 't', user: { id: A } }, '33333333-3333-4333-8333-333333333333');
  assert.deepEqual(data.notes.map((n) => n.note), ['Week one, open.', 'Week three, open.', 'My own early note.']);
  assert.deepEqual(data.progress, { [A]: [], [B]: [100] });
});
