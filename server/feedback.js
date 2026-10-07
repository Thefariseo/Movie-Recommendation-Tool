// A message from the "Feedback" button: stored for the owner to read, with
// the page it was written on. Guests may send one too, a few an hour per IP.
import { database, settings, HttpError } from './http.js';
import { authLimit } from './authLimits.js';

// Control characters (other than line breaks) are dropped.
const clean = (value, max) => (typeof value === 'string' ? [...value].filter((c) => c === '\n' || c === '\t' || c.charCodeAt(0) >= 32).join('').trim().slice(0, max) : '');

export async function sendFeedback(ctx, input = {}) {
  const message = clean(input.message, 2000);
  if (message.length < 3) throw new HttpError(400, 'Write a few words first.');
  await authLimit(ctx, 'feedback');
  const row = {
    user_id: ctx.user?.id || null,
    message,
    page: clean(input.page, 200) || null,
    contact: clean(input.contact, 200) || null,
    lang: clean(input.lang, 8) || null
  };
  // The service key when there is one; otherwise as the caller, under the table's policy.
  const service = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  const db = service ? database(null, true) : database(ctx.token || settings().key);
  await db('feedback', { method: 'POST', body: row, prefer: 'return=minimal' });
  return { ok: true };
}
