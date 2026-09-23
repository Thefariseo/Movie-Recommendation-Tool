import { nodeHandler, identify, body, HttpError, rateLimit } from '../server/http.js';
import { criticEnabled } from '../server/llm.js';
import { criticState, criticMessage, criticPortrait, criticExplain, criticReset } from '../server/critic.js';
// The personal critic. Every call that reaches the language model is rate
// limited per member; reading the conversation and resetting it are not.
const language = value => (/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(value || '') ? value : 'en');
export async function critic(ctx) {
  await identify(ctx);
  if (ctx.request.method === 'GET') return { enabled: criticEnabled(), ...await criticState(ctx) };
  const input = await body(ctx);
  if (input.action === 'reset') return criticReset(ctx);
  if (!criticEnabled()) throw new HttpError(503, 'The critic is not configured on this server yet.');
  await rateLimit(ctx, 'critic-minute');
  await rateLimit(ctx, 'critic-day');
  if (input.action === 'portrait') return criticPortrait(ctx, { language: language(input.language), refresh: input.refresh === true });
  if (input.action === 'explain') return criticExplain(ctx, input.movie_id, { language: language(input.language) });
  if (input.action === 'message') return criticMessage(ctx, input.message, { mode: input.mode === 'interview' ? 'interview' : 'chat' });
  throw new HttpError(400, 'Unknown critic action.');
}
export default nodeHandler(critic);
