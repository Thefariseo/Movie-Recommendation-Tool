// Movie nights with friends: the host's group picks become a short ballot,
// everyone votes from their own phone, and the host decides. Weights come from
// the group's own history, so whoever compromised lately counts a bit more.
import { database, HttpError, uuid } from './http.js';
import { recommendations, tmdb } from './recommendations.js';
import { MOODS, TIMES, VOTES, compromise, fairnessWeights, tally, passesFilters, avoidedGenres } from '../shared/tonight.js';

const BALLOT = 5;
const compact = m => ({
  id: Number(m.id), title: m.title, poster_path: m.poster_path || null, release_date: m.release_date || null,
  genre_ids: m.genre_ids || [], runtime: m.runtime || null, _reason: m._reason || null, providers: m.providers || []
});

/** Which of the member's services stream a film in their region, by provider id. */
async function streamedOn(id, region, providers, rent = false) {
  try {
    const data = await tmdb(`movie/${id}/watch/providers`);
    const here = data.results?.[region] || {};
    const offers = [...(here.flatrate || []), ...(rent ? [...(here.rent || []), ...(here.buy || [])] : [])];
    const found = offers.filter(p => providers.includes(Number(p.provider_id)));
    return [...new Map(found.map(p => [Number(p.provider_id), { id: Number(p.provider_id), name: p.provider_name, logo_path: p.logo_path }])).values()];
  } catch {
    return [];
  }
}

/** The group's decided nights involving the host, newest first, with their votes. */
async function history(db, members) {
  const nights = await db(`tonight_sessions?status=eq.decided&members=ov.{${members.join(',')}}&select=id,members,winner&order=decided_at.desc&limit=6`);
  if (!nights.length) return [];
  const votes = await db(`tonight_votes?session_id=in.(${nights.map(n => n.id).join(',')})&select=session_id,user_id,movie_id,vote`);
  return nights.map(n => ({ ...n, votes: votes.filter(v => v.session_id === n.id) }));
}

export async function createNight(ctx, { members = [], mood = null, time = null, providers = [], region = 'IT', rent = false, era = null, language = null, minRating = null, popularity = null, avoid = [], gentle = false } = {}) {
  if (!Array.isArray(members) || !members.length || members.length > 3) throw new HttpError(400, 'Choose one to three friends.');
  const friends = [...new Set(members.map(uuid))].filter(id => id !== ctx.user.id);
  const genres = MOODS[mood]?.genres || [];
  const filters = { era, language, minRating: Number(minRating) || null, popularity, avoid: Array.isArray(avoid) ? avoid.map(Number).filter(Number.isSafeInteger).slice(0, 12) : [], gentle: gentle === true };
  const max = TIMES[time]?.max || null;
  // Group picks check that every friend follows back and shares their activity.
  const picks = await recommendations(ctx, friends, { genre_ids: genres, avoid_genres: avoidedGenres(filters), avoid_violence: filters.gentle, max_runtime: max, theme: null, marathon_count: 1, excluded_ids: [] });
  const services = Array.isArray(providers) ? providers.map(Number).filter(Number.isSafeInteger).slice(0, 12) : [];
  const safeRegion = /^[A-Z]{2}$/.test(region) ? region : 'IT';
  let ballot = [];
  for (const m of picks.movies) {
    if (ballot.length >= BALLOT) break;
    if (!passesFilters(m, filters)) continue;
    if (!services.length) { ballot.push(m); continue; }
    const on = await streamedOn(m.id, safeRegion, services, rent === true);
    if (on.length) ballot.push({ ...m, providers: on });
  }
  if (!ballot.length) throw new HttpError(404, services.length ? 'None of tonight’s picks is on your services with these filters. Try more services, fewer filters or another mood.' : 'No picks matched these filters. Try fewer filters, another mood or more time.');
  const db = database(ctx.token);
  const everyone = [ctx.user.id, ...friends];
  const weights = fairnessWeights(compromise(await history(db, everyone), everyone));
  const [night] = await db('tonight_sessions', { method: 'POST', prefer: 'return=representation', body: { host: ctx.user.id, members: everyone, films: ballot.map(compact), weights } });
  return { night };
}

export async function readNight(ctx, id) {
  const db = database(ctx.token);
  const [night] = await db(`tonight_sessions?id=eq.${uuid(id)}`);
  if (!night) throw new HttpError(404, 'This movie night does not exist or you are not invited.');
  const [votes, people] = await Promise.all([
    db(`tonight_votes?session_id=eq.${night.id}&select=user_id,movie_id,vote`),
    db(`profiles?id=in.(${night.members.join(',')})&select=id,display_name`)
  ]);
  return { night, votes, people, ranking: tally(night.films, votes, night.weights) };
}

export async function myNights(ctx) {
  return { nights: await database(ctx.token)(`tonight_sessions?members=cs.{${ctx.user.id}}&select=id,host,members,status,winner,created_at,films&order=created_at.desc&limit=10`) };
}

export async function vote(ctx, id, movieId, value) {
  if (!VOTES.includes(value) && value !== 0) throw new HttpError(400, 'Vote -1, 1 or 2, or 0 to clear.');
  const db = database(ctx.token);
  const { night } = await readNight(ctx, id);
  if (night.status !== 'open') throw new HttpError(409, 'This movie night has already been decided.');
  if (!night.films.some(f => f.id === Number(movieId))) throw new HttpError(400, 'That film is not on tonight’s ballot.');
  const key = `session_id=eq.${night.id}&user_id=eq.${ctx.user.id}&movie_id=eq.${Number(movieId)}`;
  if (value === 0) await db(`tonight_votes?${key}`, { method: 'DELETE' });
  else await db('tonight_votes?on_conflict=session_id,user_id,movie_id', { method: 'POST', prefer: 'resolution=merge-duplicates', body: { session_id: night.id, user_id: ctx.user.id, movie_id: Number(movieId), vote: value, updated_at: new Date().toISOString() } });
  return readNight(ctx, id);
}

export async function decide(ctx, id) {
  const db = database(ctx.token);
  const { night, votes } = await readNight(ctx, id);
  if (night.host !== ctx.user.id) throw new HttpError(403, 'Only the host decides.');
  if (night.status !== 'open') throw new HttpError(409, 'This movie night has already been decided.');
  if (!votes.length) throw new HttpError(400, 'Wait for at least one vote.');
  const [best] = tally(night.films, votes, night.weights);
  const saved = await db(`tonight_sessions?id=eq.${night.id}&status=eq.open`, { method: 'PATCH', prefer: 'return=representation', body: { status: 'decided', winner: best.id, decided_at: new Date().toISOString() } });
  if (!saved.length) throw new HttpError(409, 'This movie night has already been decided.');
  return readNight(ctx, id);
}
