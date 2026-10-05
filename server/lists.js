// Personal film lists with a public link (migration 202610060002). Anyone can
// read a public list, signed in or not; only its owner changes it.
import { database, settings, HttpError, uuid } from './http.js';
import { normalizeMovie } from '../shared/library.js';

export const MAX_FILMS = 200;
const text = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const film = (m) => {
  const n = normalizeMovie(m);
  return { id: n.id, title: n.title, poster_path: n.poster_path ?? null, year: n.year ?? null, genre_ids: n.genre_ids || [], note: text(m?.note, 200) || undefined };
};
// A visitor without an account reads as the anonymous role.
const reader = (ctx) => database(ctx.token || settings().key);

/** A list by id: public ones for anyone, private ones for their owner. */
export async function readList(ctx, id) {
  const [list] = await reader(ctx)(`film_lists?id=eq.${uuid(id)}&select=id,owner,owner_name,title,description,films,public,created_at,updated_at`);
  if (!list) throw new HttpError(404, 'This list does not exist or is private.');
  return { list: { ...list, mine: Boolean(ctx.user && list.owner === ctx.user.id) } };
}

export async function myLists(ctx) {
  return { lists: await database(ctx.token)(`film_lists?owner=eq.${ctx.user.id}&select=id,title,description,films,public,updated_at&order=updated_at.desc&limit=100`) };
}

async function ownerName(ctx) {
  try {
    const [p] = await database(ctx.token)(`profiles?id=eq.${ctx.user.id}&select=display_name`);
    return text(p?.display_name, 60);
  } catch {
    return '';
  }
}

/** Creates a list, or with `id` changes one of the member's: title, description, visibility and films. */
export async function saveList(ctx, { id = null, title, description = '', public: isPublic = true, films = [] } = {}) {
  const clean = { title: text(title, 100), description: String(description ?? '').trim().slice(0, 600), public: isPublic !== false };
  if (!clean.title) throw new HttpError(400, 'Give the list a title.');
  if (!Array.isArray(films) || films.length > MAX_FILMS) throw new HttpError(400, `A list holds up to ${MAX_FILMS} films.`);
  let items;
  try {
    const seen = new Set();
    items = films.map(film).filter((f) => !seen.has(f.id) && seen.add(f.id));
  } catch (e) {
    throw new HttpError(400, e.message);
  }
  const db = database(ctx.token);
  const body = { ...clean, films: items, owner_name: await ownerName(ctx), updated_at: new Date().toISOString() };
  if (id) {
    const [saved] = await db(`film_lists?id=eq.${uuid(id)}&owner=eq.${ctx.user.id}`, { method: 'PATCH', prefer: 'return=representation', body });
    if (!saved) throw new HttpError(404, 'This list does not exist or is not yours.');
    return { list: { ...saved, mine: true } };
  }
  const [saved] = await db('film_lists', { method: 'POST', prefer: 'return=representation', body: { ...body, owner: ctx.user.id } });
  return { list: { ...saved, mine: true } };
}

/** Adds a film to one of the member's lists (at the end), or removes it. */
export async function changeListFilm(ctx, id, movie, remove = false) {
  const db = database(ctx.token);
  const [list] = await db(`film_lists?id=eq.${uuid(id)}&owner=eq.${ctx.user.id}&select=id,title,description,public,films`);
  if (!list) throw new HttpError(404, 'This list does not exist or is not yours.');
  const movieId = Number(remove ? movie : movie?.id);
  let films = list.films.filter((f) => Number(f.id) !== movieId);
  if (!remove) {
    if (films.length >= MAX_FILMS) throw new HttpError(400, `A list holds up to ${MAX_FILMS} films.`);
    films = [...films, movie];
  }
  return saveList(ctx, { ...list, films });
}

export async function deleteList(ctx, id) {
  await database(ctx.token)(`film_lists?id=eq.${uuid(id)}&owner=eq.${ctx.user.id}`, { method: 'DELETE' });
  return { ok: true };
}
