// Reading and writing a member's film signals (see shared/signals.js).
import { database, HttpError } from './http.js';
import { normalizeMovie } from '../shared/library.js';
import { SOURCES } from '../shared/signals.js';
import { validRule } from '../shared/rules.js';

export async function readSignals(ctx) {
  return database(ctx.token)(`taste_signals?user_id=eq.${ctx.user.id}&select=movie_id,source,signal,movie&order=created_at.desc&limit=2000`);
}

const compact = (m) => {
  try {
    const n = normalizeMovie(m);
    return { id: n.id, title: n.title, poster_path: n.poster_path, genre_ids: n.genre_ids, year: n.year ?? null };
  } catch {
    return { id: Number(m?.id) };
  }
};

/** Upserts signals: [{ movie, source, signal }]. Failures never break the caller's answer. */
export async function writeSignals(ctx, entries) {
  const rows = entries
    .filter((e) => SOURCES.includes(e.source) && Number.isSafeInteger(Number(e.movie?.id)) && Number(e.signal))
    .map((e) => ({ user_id: ctx.user.id, movie_id: Number(e.movie.id), source: e.source, signal: Math.max(-2, Math.min(2, Math.round(e.signal))), movie: compact(e.movie), created_at: new Date().toISOString() }));
  if (!rows.length) return;
  try {
    await database(ctx.token)('taste_signals?on_conflict=user_id,movie_id,source', { method: 'POST', prefer: 'resolution=merge-duplicates', body: rows });
  } catch { /* A signal is a refinement; the reply it came with still stands. */ }
}

export async function dismiss(ctx, movie) {
  if (!Number.isSafeInteger(Number(movie?.id)) || Number(movie.id) <= 0) throw new HttpError(400, 'Choose a film.');
  await database(ctx.token)('taste_signals?on_conflict=user_id,movie_id,source', { method: 'POST', prefer: 'resolution=merge-duplicates', body: { user_id: ctx.user.id, movie_id: Number(movie.id), source: 'dismissed', signal: -2, movie: compact(movie) } });
  return { ok: true };
}

export async function undismiss(ctx, id) {
  if (!Number.isSafeInteger(Number(id))) throw new HttpError(400, 'Choose a film.');
  await database(ctx.token)(`taste_signals?user_id=eq.${ctx.user.id}&movie_id=eq.${Number(id)}&source=eq.dismissed`, { method: 'DELETE' });
  return { ok: true };
}

/** What the member's critic has learned (shared/rules.js), for the recommenders. Empty until it has. */
export async function readRules(ctx) {
  const [row] = await database(ctx.token)(`critic_memory?user_id=eq.${ctx.user.id}&select=rules`).catch(() => []);
  return (Array.isArray(row?.rules) ? row.rules : []).filter(validRule);
}
