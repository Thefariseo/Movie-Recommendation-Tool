// Friends, closer (see migration 202610060001): a friend's profile, films
// recommended to a friend with a note, and reactions to what friends watched.
import { database, allRows, HttpError, uuid } from './http.js';
import { normalizeMovie } from '../shared/library.js';
import { notify, senderName } from './notifications.js';

export const REACTIONS = ['heart', 'fire', 'wow', 'laugh', 'sad', 'agree'];
const int = (v) => (Number.isSafeInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);
const compact = (m) => ({ id: m.id, title: m.title, poster_path: m.poster_path ?? null, year: m.year ?? null, genre_ids: m.genre_ids || [] });

/**
 * A person as the member may see them: their profile, how the two of you
 * follow each other, and, when they share their activity with you, their
 * library (rated films and watchlist) and the films you sent each other.
 */
export async function personView(ctx, id) {
  const db = database(ctx.token), me = ctx.user.id, other = uuid(id);
  const [[person], following, follower] = await Promise.all([
    db(`profiles?id=eq.${other}&select=id,display_name,avatar_url,share_activity,discoverable`),
    db(`follows?follower_id=eq.${me}&followed_id=eq.${other}&select=followed_id`),
    db(`follows?follower_id=eq.${other}&followed_id=eq.${me}&select=follower_id`)
  ]);
  if (!person) throw new HttpError(404, 'This person does not exist or keeps their profile private.');
  const relation = { following: following.length > 0, follower: follower.length > 0 };
  relation.mutual = relation.following && relation.follower;
  const shares = relation.mutual && person.share_activity;
  const [rows, sent, received] = shares || other === me
    ? await Promise.all([
      allRows(db, `user_movies?user_id=eq.${other}&deleted=eq.false&select=movie_id,kind,movie,rating,updated_at&order=movie_id,kind`),
      db(`film_recommendations?sender=eq.${me}&recipient=eq.${other}&select=id,movie,note,created_at,seen_at&order=created_at.desc&limit=30`).catch(() => []),
      db(`film_recommendations?sender=eq.${other}&recipient=eq.${me}&select=id,movie,note,created_at,seen_at&order=created_at.desc&limit=30`).catch(() => [])
    ])
    : [[], [], []];
  return { person: { id: person.id, display_name: person.display_name, avatar_url: person.avatar_url, share_activity: person.share_activity }, relation, shares: Boolean(shares), rows, sent, received };
}

/** Sends a film to one or more mutual friends, with an optional note. */
export async function recommendFilm(ctx, { to = [], movie, note = '' } = {}) {
  const db = database(ctx.token);
  const recipients = [...new Set((Array.isArray(to) ? to : [to]).map(uuid))].filter((id) => id !== ctx.user.id);
  if (!recipients.length || recipients.length > 10) throw new HttpError(400, 'Choose one to ten friends.');
  let film;
  try {
    film = compact(normalizeMovie(movie));
  } catch (e) {
    throw new HttpError(400, e.message);
  }
  const text = String(note ?? '').trim().slice(0, 280) || null;
  // A film sent again replaces the earlier one, so its note is the latest and it shows as new.
  const rows = recipients.map((recipient) => ({ sender: ctx.user.id, recipient, movie_id: film.id, movie: film, note: text, created_at: new Date().toISOString(), seen_at: null }));
  await db(`film_recommendations?sender=eq.${ctx.user.id}&movie_id=eq.${film.id}&recipient=in.(${recipients.join(',')})`, { method: 'DELETE' });
  try {
    await db('film_recommendations', { method: 'POST', body: rows });
  } catch (e) {
    if (e.status === 401 || e.status === 400 || e.status === 403) throw new HttpError(403, 'You can recommend films to friends who follow you back.');
    throw e;
  }
  await notify(recipients, async () => ({ title: `${await senderName(ctx)} recommends ${film.title}`, body: text || 'A film picked for you by a friend.', link: '/friends?tab=inbox', tag: `rec-${film.id}` }));
  return { ok: true, sent: recipients.length };
}

/** The films friends sent the member, newest first, with who sent them. */
export async function inbox(ctx) {
  const db = database(ctx.token);
  const recs = await db(`film_recommendations?recipient=eq.${ctx.user.id}&select=id,sender,movie,note,created_at,seen_at&order=created_at.desc&limit=60`).catch(() => []);
  return { recommendations: recs };
}

export async function markRecommendationsSeen(ctx) {
  await database(ctx.token)(`film_recommendations?recipient=eq.${ctx.user.id}&seen_at=is.null`, { method: 'PATCH', body: { seen_at: new Date().toISOString() } });
  return { ok: true };
}

export async function dismissRecommendation(ctx, id) {
  await database(ctx.token)(`film_recommendations?id=eq.${uuid(id)}`, { method: 'DELETE' });
  return { ok: true };
}

/** Sets (or with emoji null, removes) the member's reaction to a friend's film. */
export async function react(ctx, { owner, movie_id, emoji }) {
  const db = database(ctx.token), who = uuid(owner), film = int(movie_id);
  if (!film) throw new HttpError(400, 'Choose a film.');
  const key = `owner=eq.${who}&movie_id=eq.${film}&reactor=eq.${ctx.user.id}`;
  if (emoji == null) {
    await db(`activity_reactions?${key}`, { method: 'DELETE' });
    return { ok: true };
  }
  if (!REACTIONS.includes(emoji)) throw new HttpError(400, 'Unknown reaction.');
  try {
    await db('activity_reactions?on_conflict=owner,movie_id,reactor', { method: 'POST', prefer: 'resolution=merge-duplicates', body: { owner: who, movie_id: film, reactor: ctx.user.id, emoji, created_at: new Date().toISOString() } });
  } catch (e) {
    if (e.status === 400 || e.status === 401 || e.status === 403) throw new HttpError(403, 'You can react to films of friends who share their activity with you.');
    throw e;
  }
  return { ok: true };
}

/** Reactions on the given activity rows ([{ user_id, movie_id }]), grouped by "owner:movie". */
export async function reactionsFor(ctx, rows) {
  const owners = [...new Set(rows.map((r) => r.user_id))];
  const movies = [...new Set(rows.map((r) => Number(r.movie_id)))];
  if (!owners.length) return {};
  const found = await database(ctx.token)(`activity_reactions?owner=in.(${owners.join(',')})&movie_id=in.(${movies.join(',')})&select=owner,movie_id,reactor,emoji&limit=1000`).catch(() => []);
  const out = {};
  for (const r of found) (out[`${r.owner}:${r.movie_id}`] ||= []).push({ reactor: r.reactor, emoji: r.emoji });
  return out;
}
