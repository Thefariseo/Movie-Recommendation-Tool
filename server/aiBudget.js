import { database, HttpError } from './http.js';

// A ceiling on language-model calls for the whole site per day, on top of each
// member's own limits, so many members (or many new accounts) together cannot
// run up the bill. AI_DAILY_CAP overrides the default; every call counts once.
export const AI_DAILY_CAP = 400;
const cap = () => {
  const n = Number(process.env.AI_DAILY_CAP);
  return Number.isInteger(n) && n > 0 ? n : AI_DAILY_CAP;
};

/**
 * True when today's allowance still has room for one more call. A server with
 * no database to count in (local development) is not limited; with one, any
 * doubt closes the door.
 */
export async function claimAiCall() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return true;
  try {
    return (await database(null, true)('rpc/claim_ai_budget', { method: 'POST', body: { daily_cap: cap() } })) === true;
  } catch {
    return false;
  }
}

/** For callers with no fallback: the member reads that the critic is resting. */
export async function requireAiCall() {
  if (!(await claimAiCall())) throw new HttpError(429, 'Your critic is taking a break: its usage limit has been reached. Please try again later.');
}
