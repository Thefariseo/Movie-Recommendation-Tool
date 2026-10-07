// Anonymous counts of what people do (see the events migration), and the
// owner's summary of them. An event is a random id per browser, a name from
// the list below and a time: nothing that names a person.
import { database, settings, HttpError } from './http.js';
import { authLimit } from './authLimits.js';

export const EVENTS = new Set([
  'visit', 'onboarding_start', 'onboarding_done', 'onboarding_skip', 'import_start',
  'rated_1', 'rated_10', 'quick_round_done', 'pick_open', 'pick_save', 'pick_dismiss', 'other_picks',
  'signup', 'feedback_sent', 'taste_card_open', 'taste_card_share', 'compare_open', 'compare_done'
]);

export async function recordEvents(ctx, input = {}) {
  const visitor = typeof input.visitor === 'string' ? input.visitor : '';
  if (!/^[a-z0-9-]{8,40}$/.test(visitor)) throw new HttpError(400, 'Unknown visitor.');
  const names = (Array.isArray(input.events) ? input.events : []).filter(n => EVENTS.has(n)).slice(0, 20);
  if (!names.length) return { ok: true };
  await authLimit(ctx, 'events');
  const service = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  const db = service ? database(null, true) : database(ctx.token || settings().key);
  await db('events', { method: 'POST', body: names.map(name => ({ visitor, name })), prefer: 'return=minimal' });
  return { ok: true };
}

/** The owner's summary: only for the emails in ADMIN_EMAILS. */
export async function eventSummary(ctx, days = 30) {
  const admins = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  if (!admins.length) throw new HttpError(403, 'Set ADMIN_EMAILS on the server to see the numbers.');
  if (!admins.includes(String(ctx.user?.email || '').toLowerCase())) throw new HttpError(403, 'These numbers are only for whoever runs Umbrify.');
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new HttpError(503, 'The service key is needed to read the numbers.');
  const span = Math.max(1, Math.min(365, Number(days) || 30));
  return database(null, true)('rpc/event_summary', { method: 'POST', body: { days: span } });
}
