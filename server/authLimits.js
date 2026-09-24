// Limits on sign-in, sign-up and password recovery, per client IP and per
// email address (see the auth_attempts migration). Both are hashed before
// they leave this server. Without the service role key, or if the database
// cannot be reached, sign-in carries on under Supabase's own limits.
import { createHash } from 'node:crypto';
import { database, HttpError } from './http.js';

export const AUTH_LIMITS = {
  login: [['ip', 20, 900], ['email', 10, 900]],
  signup: [['ip', 5, 3600]],
  recover: [['ip', 5, 3600], ['email', 3, 3600]]
};
const hash = value => createHash('sha256').update(value).digest('hex');

/** The caller's IP as Vercel reports it: set by Vercel's edge, not by the client. */
export function clientIp(request) {
  return request.headers.get('x-real-ip') || (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
}

export async function authLimit(ctx, action, email) {
  const limits = AUTH_LIMITS[action];
  if (!limits || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const db = database(null, true);
  for (const [kind, max, seconds] of limits) {
    const value = kind === 'ip' ? clientIp(ctx.request) : String(email || '').trim().toLowerCase();
    let ok = true;
    try {
      ok = await db('rpc/consume_auth_limit', { method: 'POST', body: { bucket_name: `${action}-${kind}`, hashed: hash(`${kind}:${value}`), max_calls: max, seconds } });
    } catch { /* Fail open: Supabase's own limits still apply. */ }
    if (ok === false) throw new HttpError(429, 'Too many attempts. Please wait a few minutes and try again.');
  }
}
