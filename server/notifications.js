// What a member should hear about: movie nights waiting for their vote or just
// decided, people who started following them, and films their friends loved.
// Nothing is stored for the bell: each item is read from the tables it is
// about, so it disappears once acted on (a vote cast, a follow returned).
// Push messages to a member's devices go out when a night is created or
// decided and when someone follows them, and only once the deployment has
// VAPID keys (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY) and the service role key.
import webpush from 'web-push';
import { database, HttpError } from './http.js';
import { seasonWeek, weekOpens } from '../shared/seasons.js';
import { nightExpired, votesBySession } from '../shared/tonight.js';

const DAY = 86_400_000;
const EMOJI = { heart: '❤️', fire: '🔥', wow: '😮', laugh: '😂', sad: '😢', agree: '👍' };
const since = (days) => new Date(Date.now() - days * DAY).toISOString();
const name = (people, id) => people.get(id)?.display_name || 'A friend';
const filmTitle = (night, id) => night.films?.find((f) => Number(f.id) === Number(id))?.title || 'a film';

/** The bell's items, newest first: [{ id, kind, at, title, body, link, actor, poster }]. */
export async function readNotifications(ctx) {
  const db = database(ctx.token), me = ctx.user.id;
  const [nights, followers, following, seasons, picks, reactions] = await Promise.all([
    db(`tonight_sessions?members=cs.{${me}}&or=${encodeURIComponent(`(status.eq.open,decided_at.gte."${since(7)}")`)}&select=id,host,members,status,winner,films,created_at,decided_at&order=created_at.desc&limit=10`),
    db(`follows?followed_id=eq.${me}&created_at=gte.${since(30)}&select=follower_id,created_at&order=created_at.desc&limit=20`),
    db(`follows?follower_id=eq.${me}&select=followed_id&limit=500`),
    // Before the seasons migration runs, there are simply no seasons.
    db(`cinema_seasons?members=cs.{${me}}&select=id,host,season,started_at&order=started_at.desc&limit=10`).catch(() => []),
    // Films friends sent, still unseen, and friends' reactions to the member's films.
    db(`film_recommendations?recipient=eq.${me}&seen_at=is.null&select=id,sender,movie,note,created_at&order=created_at.desc&limit=10`).catch(() => []),
    db(`activity_reactions?owner=eq.${me}&created_at=gte.${since(14)}&select=movie_id,reactor,emoji,created_at&order=created_at.desc&limit=30`).catch(() => [])
  ]);
  // Each season's film of the week, when the member has not watched it yet.
  const weekly = seasons.map((s) => ({ s, k: seasonWeek(s).current, w: s.season.weeks[seasonWeek(s).current] })).filter(({ s }) => !seasonWeek(s).finished);
  const seenWeekly = weekly.length ? new Set((await db(`user_movies?user_id=eq.${me}&kind=eq.watched&deleted=eq.false&movie_id=in.(${weekly.map(({ w }) => w.id).join(',')})&select=movie_id`)).map((r) => Number(r.movie_id))) : new Set();
  const waiting = nights.filter((n) => n.status === 'open' && n.host !== me);
  const [votes, loved] = await Promise.all([
    waiting.length ? db(`tonight_votes?session_id=in.(${waiting.map((n) => n.id).join(',')})&select=session_id,user_id,updated_at&limit=500`) : [],
    following.length ? db(`user_movies?user_id=in.(${following.map((f) => f.followed_id).slice(0, 200).join(',')})&kind=eq.watched&deleted=eq.false&rating=gte.9&updated_at=gte.${since(14)}&select=user_id,movie_id,movie,rating,updated_at&order=updated_at.desc&limit=12`) : []
  ]);
  const ids = new Set([...nights.flatMap((n) => [n.host, ...n.members]), ...followers.map((f) => f.follower_id), ...loved.map((l) => l.user_id), ...picks.map((r) => r.sender), ...reactions.map((r) => r.reactor)]);
  ids.delete(me);
  const people = new Map(ids.size ? (await db(`profiles?id=in.(${[...ids].join(',')})&select=id,display_name,avatar_url`)).map((p) => [p.id, p]) : []);
  const voted = new Set(votes.filter((v) => v.user_id === me).map((v) => v.session_id));
  // A night nobody answered for two days has expired: it no longer asks for a vote.
  const bySession = votesBySession(votes);
  const open = waiting.filter((n) => !nightExpired(n, bySession.get(n.id)));
  const followed = new Set(following.map((f) => f.followed_id));
  const items = [];
  for (const n of open) {
    if (voted.has(n.id)) continue;
    const shown = (n.films || []).filter((f) => !f.reserve);
    items.push({ id: `vote:${n.id}`, kind: 'night-vote', at: n.created_at, actor: people.get(n.host) || null, title: `${name(people, n.host)} invited you to a movie night`, body: `${shown.length} films are waiting for your vote.`, link: `/tonight/${n.id}` });
  }
  for (const n of nights) {
    if (n.status !== 'decided') continue;
    const winner = n.films?.find((f) => Number(f.id) === Number(n.winner));
    items.push({ id: `decided:${n.id}`, kind: 'night-decided', at: n.decided_at, actor: people.get(n.host) || null, title: `Tonight's film: ${filmTitle(n, n.winner)}`, body: n.host === me ? 'Your movie night is decided.' : `${name(people, n.host)} decided the movie night.`, link: `/tonight/${n.id}`, poster: winner?.poster_path || null });
  }
  for (const { s, k, w } of weekly) {
    if (seenWeekly.has(Number(w.id))) continue;
    items.push({ id: `season:${s.id}:${k}`, kind: 'season-week', at: weekOpens(s, k).toISOString(), actor: null, title: `Week ${k + 1} of ${s.season.title}: ${w.title}`, body: w.question ? `After watching: ${w.question}` : 'This week\'s film is open.', link: `/season/${s.id}`, poster: w.poster_path || null });
  }
  for (const r of picks) {
    items.push({ id: `pick:${r.id}`, kind: 'friend-pick', at: r.created_at, actor: people.get(r.sender) || null, title: `${name(people, r.sender)} recommends ${r.movie?.title || 'a film'}`, body: r.note || 'A film picked for you by a friend.', link: '/friends?tab=inbox', poster: r.movie?.poster_path || null });
  }
  // Reactions to one film come as one item.
  const byFilm = new Map();
  for (const r of reactions) (byFilm.get(r.movie_id) || byFilm.set(r.movie_id, []).get(r.movie_id)).push(r);
  if (byFilm.size) {
    const films = new Map((await db(`user_movies?user_id=eq.${me}&movie_id=in.(${[...byFilm.keys()].join(',')})&kind=eq.watched&select=movie_id,movie`).catch(() => [])).map((m) => [Number(m.movie_id), m.movie]));
    for (const [movieId, list] of byFilm) {
      const film = films.get(Number(movieId));
      const who = list.length === 1 ? name(people, list[0].reactor) : `${name(people, list[0].reactor)} and ${list.length - 1} more`;
      items.push({ id: `react:${movieId}`, kind: 'reaction', at: list[0].created_at, actor: people.get(list[0].reactor) || null, title: `${who} reacted to ${film?.title || 'a film you watched'}`, body: list.map((r) => EMOJI[r.emoji] || '').join(' '), link: '/friends', poster: film?.poster_path || null });
    }
  }
  for (const f of followers) {
    const back = followed.has(f.follower_id);
    items.push({ id: `follow:${f.follower_id}`, kind: 'follower', at: f.created_at, actor: people.get(f.follower_id) || null, title: `${name(people, f.follower_id)} follows you`, body: back ? 'You follow each other: you can plan movie nights together.' : 'Follow back to share picks and plan movie nights.', link: '/friends' });
  }
  for (const l of loved) {
    items.push({ id: `loved:${l.user_id}:${l.movie_id}`, kind: 'friend-loved', at: l.updated_at, actor: people.get(l.user_id) || null, title: `${name(people, l.user_id)} loved ${l.movie?.title || 'a film'}`, body: `Rated it ${l.rating}/10.`, link: `/friends`, poster: l.movie?.poster_path || null, movie: { id: l.movie_id, title: l.movie?.title || null } });
  }
  items.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return { items: items.slice(0, 30), push: pushKey() };
}

/** The member's name as their friends see it, for the messages they cause. */
export async function senderName(ctx) {
  try {
    const [p] = await database(ctx.token)(`profiles?id=eq.${ctx.user.id}&select=display_name`);
    return p?.display_name || 'A friend';
  } catch {
    return 'A friend';
  }
}

/** The public VAPID key the browser subscribes with, or null when push is off. */
export function pushKey() {
  const { VAPID_PUBLIC_KEY: pub, VAPID_PRIVATE_KEY: key, SUPABASE_SERVICE_ROLE_KEY: service } = process.env;
  return pub && key && service ? pub : null;
}

const validKey = (v, min, max) => typeof v === 'string' && v.length >= min && v.length <= max && /^[A-Za-z0-9_-]+=*$/.test(v);

/** Saves this browser's push subscription for the member. */
export async function subscribePush(ctx, subscription) {
  if (!pushKey()) throw new HttpError(503, 'Notifications on this device are not available yet.');
  const { endpoint, keys = {} } = subscription || {};
  if (typeof endpoint !== 'string' || !/^https:\/\/[^\s]+$/.test(endpoint) || endpoint.length > 1000 || !validKey(keys.p256dh, 40, 200) || !validKey(keys.auth, 10, 100)) throw new HttpError(400, 'This device sent an invalid subscription.');
  await database(ctx.token)('push_subscriptions?on_conflict=user_id,endpoint', { method: 'POST', prefer: 'resolution=merge-duplicates', body: { user_id: ctx.user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth } });
  return { ok: true };
}

export async function unsubscribePush(ctx, endpoint) {
  if (typeof endpoint !== 'string' || endpoint.length > 1000) throw new HttpError(400, 'Unknown device.');
  await database(ctx.token)(`push_subscriptions?user_id=eq.${ctx.user.id}&endpoint=eq.${encodeURIComponent(endpoint)}`, { method: 'DELETE' });
  return { ok: true };
}

/**
 * Sends `message` ({ title, body, link, tag }, or an async function giving
 * it, called only when there is a device to send to) to every device of `userIds`.
 * Never throws: a notification is a courtesy, the action it reports stands.
 * Devices the push service no longer knows are forgotten.
 */
export async function notify(userIds, message, { send = webpush.sendNotification.bind(webpush), db = null } = {}) {
  const key = pushKey();
  const users = [...new Set(userIds)].filter(Boolean);
  if (!key || !users.length) return 0;
  try {
    const service = db || database(null, true);
    const devices = await service(`push_subscriptions?user_id=in.(${users.join(',')})&select=user_id,endpoint,p256dh,auth&limit=100`);
    if (!devices.length) return 0;
    if (typeof message === 'function') message = await message();
    const options = { vapidDetails: { subject: process.env.VAPID_SUBJECT || process.env.APP_URL || 'mailto:hello@umbrify.app', publicKey: key, privateKey: process.env.VAPID_PRIVATE_KEY }, TTL: 6 * 3600, timeout: 5000 };
    const payload = JSON.stringify({ title: String(message.title).slice(0, 120), body: String(message.body || '').slice(0, 240), link: message.link || '/', tag: message.tag || null });
    let sent = 0;
    await Promise.all(devices.map(async (d) => {
      try {
        await send({ endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } }, payload, options);
        sent++;
      } catch (e) {
        if (e?.statusCode === 404 || e?.statusCode === 410) await service(`push_subscriptions?user_id=eq.${d.user_id}&endpoint=eq.${encodeURIComponent(d.endpoint)}`, { method: 'DELETE' }).catch(() => {});
      }
    }));
    return sent;
  } catch {
    return 0;
  }
}
