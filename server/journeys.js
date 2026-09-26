// The journeys a member follows (see shared/journeys.js), kept per account.
import { database, HttpError } from './http.js';

export const MAX_FOLLOWED = 12;
const int = (v) => (Number.isSafeInteger(Number(v)) ? Number(v) : null);
// A step's place on the taste map, or null when the map does not know the film.
const coordinate = (v) => (v == null || !Number.isFinite(Number(v)) ? null : Math.min(1, Math.max(0, Number(v))));
const KINDS = ['director', 'bridge', 'friend'];
const person = (p) => (int(p?.id) > 0 ? { id: int(p.id), name: text(p.name, 120) } : null);
// A friend who guides a journey is a member, known by their account id.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const friend = (p) => (UUID.test(String(p?.id || '')) ? { id: String(p.id).toLowerCase(), name: text(p.name, 120) } : null);
const text = (v, max) => String(v ?? '').slice(0, max);

/** Keeps only the fields a journey has, with bounded sizes; throws on anything malformed. */
export function cleanJourney(j) {
  const steps = Array.isArray(j?.steps) ? j.steps : [];
  const region = j?.region || {};
  const clean = {
    id: text(j?.id, 60),
    region: {
      id: int(region.id),
      genres: (Array.isArray(region.genres) ? region.genres : []).slice(0, 3).map((g) => text(g, 30)),
      decade: int(region.decade)
    },
    from: { id: int(j?.from?.id), title: text(j?.from?.title, 200), rated: int(j?.from?.rated) },
    steps: steps.slice(0, 10).map((s) => ({ id: int(s?.id), region: int(s?.region), x: coordinate(s?.x), y: coordinate(s?.y) })),
    // Director journeys: through one director's films, or from one to another;
    // friend journeys: through the films a friend loved in a region.
    ...(KINDS.includes(j?.kind) ? { kind: j.kind, person: j.kind === 'friend' ? friend(j.person) : person(j.person), ...(j.kind === 'bridge' ? { to: person(j.to) } : {}) } : {}),
    // Why the journey starts where it does, why it suits the member, and a note per step.
    ...(j?.explain && typeof j.explain === 'object' ? { explain: {
      start: text(j.explain.start, 400),
      why: (Array.isArray(j.explain.why) ? j.explain.why : []).slice(0, 5).map((w) => text(w, 300)),
      steps: Object.fromEntries(Object.entries(j.explain.steps || {}).slice(0, 10).filter(([id]) => int(id) > 0).map(([id, note]) => [String(int(id)), text(note, 120)]))
    } } : {}),
    ...(j?.routedFor ? { routedFor: text(j.routedFor, 200) } : {}),
    ...(int(j?.rerouted?.after) ? { rerouted: { after: int(j.rerouted.after) } } : {})
  };
  if (!/^[0-9]+-[0-9]+-[0-9]+$/.test(clean.id) || clean.region.id == null || !clean.from.id || steps.length < 2 || steps.length > 10
    || clean.steps.some((s) => !s.id || s.id <= 0 || s.region == null)
    || (clean.kind && !clean.person) || (clean.kind === 'bridge' && !clean.to)) throw new HttpError(400, 'Invalid journey.');
  return clean;
}

export async function readJourneys(ctx) {
  const rows = await database(ctx.token)(`followed_journeys?user_id=eq.${ctx.user.id}&select=journey&order=created_at`);
  return rows.map((r) => r.journey);
}

/** Follows a journey, or saves a followed one again after it changed (a re-route). */
export async function saveJourney(ctx, journey) {
  const clean = cleanJourney(journey);
  const db = database(ctx.token);
  const existing = await db(`followed_journeys?user_id=eq.${ctx.user.id}&select=id`);
  if (!existing.some((r) => r.id === clean.id) && existing.length >= MAX_FOLLOWED) throw new HttpError(400, `You can follow up to ${MAX_FOLLOWED} journeys at a time.`);
  await db('followed_journeys?on_conflict=user_id,id', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates',
    body: { user_id: ctx.user.id, id: clean.id, journey: clean, updated_at: new Date().toISOString() }
  });
  return { journey: clean };
}

export async function dropJourney(ctx, id) {
  if (!/^[0-9]+-[0-9]+-[0-9]+$/.test(String(id))) throw new HttpError(400, 'Choose a journey.');
  await database(ctx.token)(`followed_journeys?user_id=eq.${ctx.user.id}&id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
  return { ok: true };
}
