// Browser smoke test of the built site: every main page, on a phone and on a
// desktop, as a guest in English and as a member in Italian. TMDB and the API
// are answered from fixtures, so it runs anywhere without keys or network.
// A page fails on a script error, a console error, a sideways scroll, a raw
// "{0}" / "undefined" / "NaN" on screen, or a missing landmark; a few flows
// (filters, opening and rating a film, linking Letterboxd) are clicked through.
//
//   npm run build && npm run test:ui
//
// PW_CHROMIUM points at a Chromium binary when Playwright's own is not installed.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from 'playwright';

const PORT = 4179;
const BASE = `http://localhost:${PORT}`;
const MEMBER = '11111111-1111-4111-8111-111111111111';
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64');

const FILMS = [
  [129, 'Spirited Away', '2001-07-20', [16, 14]], [128, 'Princess Mononoke', '1997-07-12', [16, 12]],
  [8392, 'My Neighbor Totoro', '1988-04-16', [16, 10751]], [11645, 'Ran', '1985-06-01', [18, 36]],
  [670, 'Oldboy', '2003-11-21', [18, 53]], [346, 'Seven Samurai', '1954-04-26', [28, 18]],
  [18148, 'Tokyo Story', '1953-11-03', [18]], [843, 'In the Mood for Love', '2000-09-29', [18, 10749]],
  [5336, 'Salò, or the 120 Days of Sodom', '1976-01-10', [18, 27]], [25403, 'Caro diario', '1993-11-12', [35, 18]],
  [496243, 'Parasite', '2019-05-30', [35, 53, 18]], [313369, 'La La Land', '2016-11-29', [35, 18, 10402]],
  [550, 'Fight Club', '1999-10-15', [18]], [680, 'Pulp Fiction', '1994-09-10', [53, 80]]
].concat(Array.from({ length: 60 }, (_, i) => [900000 + i, `Fixture Film ${i + 1}`, `${1960 + (i % 60)}-0${(i % 9) + 1}-15`, [[18], [35], [53, 80], [878, 12], [10749, 18], [27, 53]][i % 6]]))
  .map(([id, title, release_date, genre_ids], i) => ({
  id, title, original_title: title, release_date, genre_ids, overview: `${title} overview.`,
  poster_path: `/p${id}.jpg`, backdrop_path: `/b${id}.jpg`, vote_average: 7 + (i % 3) / 2, vote_count: 1000 + i * 37,
  popularity: 50 - i, original_language: 'en', adult: false
}));
const GENRES = { 878: 'Science Fiction', 12: 'Adventure', 14: 'Fantasy', 16: 'Animation', 18: 'Drama', 27: 'Horror', 28: 'Action', 35: 'Comedy', 36: 'History', 53: 'Thriller', 80: 'Crime', 10402: 'Music', 10749: 'Romance', 10751: 'Family' };
const page1 = results => ({ page: 1, total_pages: 1, total_results: results.length, results });
const person = { id: 2, name: 'Akira Kurosawa', known_for_department: 'Directing', biography: '', profile_path: null };

function detail(id) {
  const film = FILMS.find(f => f.id === id) || { ...FILMS[0], id, title: `Film ${id}`, original_title: `Film ${id}` };
  return {
    ...film, runtime: 118, tagline: '', status: 'Released', imdb_id: 'tt0000001',
    genres: film.genre_ids.map(g => ({ id: g, name: GENRES[g] || 'Drama' })),
    production_countries: [{ iso_3166_1: 'JP', name: 'Japan' }], spoken_languages: [{ iso_639_1: 'ja', english_name: 'Japanese' }],
    credits: { cast: [{ id: 1, name: 'Toshiro Mifune', character: 'Lead', profile_path: null, order: 0 }], crew: [{ ...person, job: 'Director', department: 'Directing' }] },
    keywords: { keywords: [{ id: 1, name: 'samurai' }, { id: 2, name: 'family' }] },
    videos: { results: [] }, recommendations: page1(FILMS.filter(f => f.id !== id).slice(0, 6)),
    similar: page1([]), release_dates: { results: [] }, 'watch/providers': { results: {} },
    images: { backdrops: [], posters: [] }, external_ids: { imdb_id: 'tt0000001' }
  };
}

/** TMDB, answered from the fixtures above by the shape each endpoint returns. */
function tmdb(url) {
  const path = new URL(url).pathname.replace(/^\/3/, '');
  let m;
  if ((m = path.match(/^\/movie\/(\d+)$/))) return detail(Number(m[1]));
  if ((m = path.match(/^\/movie\/(\d+)\/(credits)$/))) return detail(Number(m[1])).credits;
  if ((m = path.match(/^\/movie\/(\d+)\/keywords$/))) return { id: Number(m[1]), keywords: detail(1).keywords.keywords };
  if ((m = path.match(/^\/movie\/(\d+)\/(videos|release_dates|watch\/providers|images|external_ids)$/))) return detail(Number(m[1]))[m[2]];
  if ((m = path.match(/^\/person\/(\d+)\/(movie|combined)_credits$/))) {
    return { id: Number(m[1]), cast: FILMS.slice(0, 20).map(f => ({ ...f, character: 'Lead' })), crew: FILMS.slice(10, 30).map(f => ({ ...f, job: 'Director', department: 'Directing' })) };
  }
  if ((m = path.match(/^\/person\/(\d+)$/))) {
    const crew = FILMS.map(f => ({ ...f, job: 'Director', department: 'Directing' }));
    return { ...person, id: Number(m[1]), movie_credits: { cast: [], crew }, combined_credits: { cast: [], crew }, images: { profiles: [] } };
  }
  if (path === '/genre/movie/list') return { genres: Object.entries(GENRES).map(([id, name]) => ({ id: Number(id), name })) };
  if (path.startsWith('/search/person')) return page1([person]);
  if (path === '/configuration') return { images: { secure_base_url: 'https://image.tmdb.org/t/p/' } };
  return { ...page1(FILMS), dates: { minimum: '2026-01-01', maximum: '2026-12-31' } };
}

/** The API, as a guest (401) or as a member with a small diary. */
function api({ member }) {
  const rows = FILMS.slice(0, 8).map((f, i) => ({ kind: 'watched', movie_id: f.id, rating: 10 - (i % 4), deleted: false, version: 1, updated_at: `2026-09-0${(i % 9) + 1}T10:00:00Z`, movie: { id: f.id, title: f.title, poster_path: f.poster_path, genre_ids: f.genre_ids, year: Number(f.release_date.slice(0, 4)) } }))
    .concat(FILMS.slice(8, 10).map(f => ({ kind: 'watchlist', movie_id: f.id, rating: null, deleted: false, version: 1, updated_at: '2026-09-10T10:00:00Z', movie: { id: f.id, title: f.title, poster_path: f.poster_path, genre_ids: f.genre_ids } })));
  const writes = [];
  let letterboxd = { linked: false };
  const handle = async route => {
    const request = route.request();
    const url = new URL(request.url());
    const action = url.searchParams.get('action');
    const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    const body = request.method() === 'POST' ? JSON.parse(request.postData() || '{}') : null;
    // Film details and filmographies come through the site's own trimmed endpoint.
    if (url.pathname === '/api/film') return json(tmdb(`https://api.themoviedb.org/3${url.searchParams.get('path')}`));
    if (url.pathname === '/api/auth') return member ? json({ configured: true, user: { id: MEMBER, email: 'ada@example.com' }, profile: { id: MEMBER, display_name: 'Ada', country: 'IT' } }) : json({ configured: true, user: null });
    if (!member) return json({ error: 'Please sign in to continue.' }, 401);
    if (url.pathname === '/api/library') {
      if (action === 'letterboxd') {
        if (body) letterboxd = body.username ? { linked: true, username: body.username, synced_at: new Date().toISOString(), added: 3, rated: 1 } : { linked: false };
        return json(letterboxd);
      }
      if (action === 'letterboxd-sync') return json(letterboxd.linked ? { linked: true, username: letterboxd.username, skipped: true } : { linked: false });
      if (body) {
        writes.push(body);
        return json({ rows: body.changes.map(c => ({ kind: c.kind, movie_id: c.movie_id, rating: c.rating, deleted: c.op === 'remove', version: c.version + 1, updated_at: new Date().toISOString(), movie: c.movie || rows.find(r => r.movie_id === c.movie_id)?.movie || { id: c.movie_id, title: 'Film' } })) });
      }
      return json({ rows: url.searchParams.has('since') ? [] : rows });
    }
    if (url.pathname === '/api/ratings') return json({ ratings: {} });
    if (url.pathname === '/api/recommend') return json({ movies: FILMS.slice(10, 16).map(f => ({ ...f, reasons: ['Close to films you loved'] })), message: 'Picked from your diary.' });
    if (url.pathname === '/api/social') return json({ friends: [], followers: [], following: [], requests: [], feed: [], notifications: [], lists: [], items: [] });
    return json({});
  };
  return { handle, writes };
}

const failures = [];
const fail = (where, what) => failures.push(`${where}: ${what}`);
/** One clicked-through flow: anything stuck or thrown is a failure, and the run goes on. */
async function step(where, flow) {
  try {
    await flow();
  } catch (e) {
    fail(where, e.message.split('\n')[0]);
  }
}

async function visit(page, problems, label, path, landmark) {
  await page.goto(BASE + path, { waitUntil: 'networkidle' }).catch(e => fail(label, `could not load ${path}: ${e.message}`));
  await page.waitForTimeout(1200);
  const where = `${label} ${path}`;
  for (const p of problems.splice(0)) fail(where, p);
  const found = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      overflow: document.documentElement.scrollWidth - innerWidth,
      raw: (text.match(/\{#?\d\}|\bundefined\b|\bNaN\b|\[object Object\]/g) || []).slice(0, 3)
    };
  });
  if (found.overflow > 1) fail(where, `scrolls sideways by ${found.overflow}px`);
  if (found.raw.length) fail(where, `shows ${found.raw.join(', ')}`);
  if (landmark && !(await page.locator(landmark).first().isVisible().catch(() => false))) fail(where, `missing ${landmark}`);
  // UI_SHOTS=<dir> keeps a picture of every page, to see what failed.
  if (process.env.UI_SHOTS) await page.screenshot({ path: `${process.env.UI_SHOTS}/${label.replace(/\W+/g, '-')}${path.replace(/\W+/g, '-')}.png` });
}

async function run(browser, { label, member, locale, width }) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, locale, hasTouch: width < 600, serviceWorkers: 'block' });
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', e => problems.push(`script error: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push(`console: ${m.text().slice(0, 200)}`); });
  await page.route(/^https?:\/\/(?!localhost)/, route => {
    const url = route.request().url();
    if (url.startsWith('https://api.themoviedb.org/')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify(tmdb(url)) });
    if (/\.(png|jpe?g|webp|gif)(\?|$)/.test(url) || url.startsWith('https://image.tmdb.org/')) return route.fulfill({ contentType: 'image/png', body: PIXEL });
    return route.abort();
  });
  const backend = api({ member });
  await page.route(/\/api\//, backend.handle);

  const film = '.film-open';
  // A guest's home starts with the welcome; a member's with picks.
  const pages = [
    ['/', member ? film : null], ['/?view=browse', film], ['/?view=cinema', null], ['/library/watched', null], ['/library/watchlist', null],
    ['/library/stats', null], ['/library/journeys', null], ['/library/lists', null], ['/friends', null], ['/profile', null],
    ['/critic', null], ['/tonight', null], ['/map', null], ['/person/2', null], ['/rate', null]
  ];
  for (const [path, landmark] of pages) await visit(page, problems, label, path, landmark);

  page.setDefaultTimeout(8000);
  // Filters (a member's picks): open the sheet, choose a genre, show the films; the chip appears.
  if (member) await step(`${label} filters`, async () => {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const filters = page.getByRole('button', { name: /^(Filters|Filtri)/ }).first();
  if (await filters.isVisible().catch(() => false)) {
    await filters.click();
    await page.getByRole('dialog').getByRole('button', { name: /^(Drama|Dramma|Drammatico)$/ }).first().click();
    await page.getByRole('button', { name: /^(Show films|Mostra i film)$/ }).click();
    await page.waitForTimeout(600);
    if (!(await page.getByRole('button', { name: /^(Filters|Filtri) · 1/ }).count())) fail(label, 'a chosen genre does not show as an active filter');
  } else fail(label, 'no Filters button on the picks');
  });

  // A film opens, and (for a member) a star rates it.
  await step(`${label} film`, async () => {
  await page.goto(`${BASE}/?view=browse`, { waitUntil: 'networkidle' });
  await page.locator(film).first().click();
  await page.waitForTimeout(1500);
  if (!(await page.locator('.film-sheet, [role="dialog"]').count())) fail(label, 'a film does not open');
  else if (member) {
    const before = backend.writes.length;
    const star = page.getByRole('button', { name: /(4 stars|4 stelle)/i }).first();
    if (await star.count()) {
      await star.click();
      await page.waitForTimeout(1200);
      if (backend.writes.length === before) fail(label, 'rating a film saves nothing');
    } else fail(label, 'no rating stars on an opened film');
  }
  await page.keyboard.press('Escape');
  });

  // A member links Letterboxd from the profile.
  if (member) await step(`${label} letterboxd`, async () => {
    await page.goto(`${BASE}/profile`, { waitUntil: 'networkidle' });
    const name = page.getByLabel(/^(Letterboxd username|Nome utente Letterboxd)$/);
    if (await name.count()) {
      await name.fill('ada');
      await page.getByRole('button', { name: /^(Connect|Collega)$/ }).click();
      await page.waitForTimeout(800);
      if (!(await page.getByText(/(Synced with|Sincronizzato con)/).count())) fail(label, 'linking Letterboxd shows no linked state');
    } else fail(label, 'no Letterboxd username field on the profile');
  });
  for (const p of problems.splice(0)) fail(`${label} flows`, p);
  await context.close();
}

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
try {
  for (let i = 0; i < 50; i++) {
    if (await fetch(BASE).then(r => r.ok, () => false)) break;
    await sleep(200);
  }
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  try {
    for (const run_ of [
      { label: 'guest/en/phone', member: false, locale: 'en-US', width: 390 },
      { label: 'member/it/phone', member: true, locale: 'it-IT', width: 390 },
      { label: 'member/it/desktop', member: true, locale: 'it-IT', width: 1280 },
      { label: 'guest/en/desktop', member: false, locale: 'en-US', width: 1280 }
    ]) await run(browser, run_);
  } finally {
    await browser.close();
  }
} finally {
  server.kill();
}
if (failures.length) {
  console.error(`UI smoke test failed (${failures.length}):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('UI smoke test passed: 15 pages × 4 views, filters, film sheet, rating, Letterboxd link.');
