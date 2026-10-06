import { timingSafeEqual } from 'node:crypto';
import { nodeHandler, identify, database, allRows, body, HttpError, rateLimit } from '../server/http.js';
import { normalizeMovie } from '../shared/library.js';
import { fetchDiary, syncMember, syncEveryone, resolveFilms, SYNC_EVERY, USERNAME } from '../server/letterboxd.js';
import { authLimit } from '../server/authLimits.js';

const SINCE_OVERLAP = 3 * 60 * 1000;
const STATUS = 'username,synced_at,last_added,last_rated,last_error';
const cronAllowed = request => {
  const secret = process.env.CRON_SECRET;
  const sent = Buffer.from(request.headers.get('authorization') || '');
  const wanted = Buffer.from(`Bearer ${secret}`);
  return !!secret && sent.length === wanted.length && timingSafeEqual(sent, wanted);
};

// The Letterboxd diary sync lives here, beside the library it writes to.
async function letterboxd(ctx, action) {
  if (action === 'letterboxd-cron') {
    if (!cronAllowed(ctx.request)) throw new HttpError(401, 'Not allowed.');
    return syncEveryone();
  }
  if (action === 'letterboxd-films') {
    // Guests import too, so this is limited per address rather than per member.
    if (ctx.request.method !== 'POST') throw new HttpError(405, 'Method not allowed.');
    const input = await body(ctx);
    if (!Array.isArray(input.links) || input.links.length > 25) throw new HttpError(400, 'Send up to 25 Letterboxd links.');
    await authLimit(ctx, 'films');
    return { films: await resolveFilms(input.links) };
  }
  await identify(ctx);
  const admin = database(null, true);
  const [link] = await admin(`letterboxd_links?user_id=eq.${ctx.user.id}&select=user_id,${STATUS},cursor`);
  const status = row => row ? { linked: true, username: row.username, synced_at: row.synced_at, last_added: row.last_added, last_rated: row.last_rated, error: row.last_error } : { linked: false };
  if (ctx.request.method === 'GET') return status(link);
  const input = await body(ctx);
  if (action === 'letterboxd') {
    const username = String(input.username || '').trim().replace(/^@/, '');
    if (!username) {
      await admin(`letterboxd_links?user_id=eq.${ctx.user.id}`, { method: 'DELETE' });
      return { linked: false };
    }
    if (!USERNAME.test(username)) throw new HttpError(400, 'Enter your Letterboxd username.');
    await rateLimit(ctx, 'letterboxd');
    // Read the diary first: an unknown username is refused before anything is saved.
    const diary = await fetchDiary(username);
    const [row] = await admin('letterboxd_links?on_conflict=user_id', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=representation',
      body: { user_id: ctx.user.id, username, cursor: null, synced_at: null, last_added: 0, last_rated: 0, last_error: null, locked_until: null }
    });
    const result = await syncMember(row, { db: admin, diary });
    const [after] = await admin(`letterboxd_links?user_id=eq.${ctx.user.id}&select=${STATUS}`);
    return { ...status(after), ...result };
  }
  if (action !== 'letterboxd-sync') throw new HttpError(400, 'Unknown action.');
  if (!link) return { linked: false };
  if (input.force === true) await rateLimit(ctx, 'letterboxd');
  else if (link.synced_at && Date.now() - Date.parse(link.synced_at) < SYNC_EVERY) return { ...status(link), skipped: true };
  const result = await syncMember(link, { db: admin });
  const [after] = await admin(`letterboxd_links?user_id=eq.${ctx.user.id}&select=${STATUS}`);
  return { ...status(after), ...result };
}

export async function library(ctx) {
  const action = ctx.url.searchParams.get('action');
  if (action?.startsWith('letterboxd')) return letterboxd(ctx, action);
  await identify(ctx);
  const db = database(ctx.token);
  if (ctx.request.method === 'GET') {
    // A device that has the library asks only for what changed since the newest
    // row it holds, reaching back a little for writes that were still committing.
    const since = ctx.url.searchParams.get('since');
    if (since == null) return {
      rows: await allRows(db, `user_movies?user_id=eq.${ctx.user.id}&order=movie_id,kind`)
    };
    const at = Date.parse(since);
    if (!Number.isFinite(at)) throw new HttpError(400, 'Invalid library cursor.');
    const from = new Date(at - SINCE_OVERLAP).toISOString();
    return {
      rows: await allRows(db, `user_movies?user_id=eq.${ctx.user.id}&updated_at=gte.${encodeURIComponent(from)}&order=updated_at`)
    };
  }
  const input = await body(ctx);
  if (!Array.isArray(input.changes) || input.changes.length > 500) throw new HttpError(400, 'Invalid library changes.');
  const changes = input.changes.map(c => {
    if (!['watched', 'watchlist'].includes(c.kind) || !['put', 'remove', 'rate'].includes(c.op) || !Number.isSafeInteger(c.movie_id) || c.movie_id <= 0 || !Number.isInteger(c.version) || c.version < 0) throw new HttpError(400, 'Invalid library change.');
    if (c.rating != null && (!Number.isInteger(c.rating) || c.rating < 1 || c.rating > 10)) throw new HttpError(400, 'Ratings must be between 1 and 10.');
    let movie;
    try {
      movie = c.op === 'put' ? normalizeMovie({
        ...c.movie,
        id: c.movie_id
      }) : undefined;
    } catch (e) {
      throw new HttpError(400, e.message);
    }
    return {
      op: c.op,
      kind: c.kind,
      movie_id: c.movie_id,
      version: c.version,
      rating: c.rating ?? null,
      ...(movie ? {
        movie
      } : {})
    };
  });
  return {
    rows: await db('rpc/apply_library', {
      method: 'POST',
      body: {
        changes,
        importing: input.importing === true
      }
    })
  };
}
export default nodeHandler(library);
