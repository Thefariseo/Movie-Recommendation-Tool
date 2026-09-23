import { nodeHandler, identify, body, HttpError } from '../server/http.js';
import { readSignals, dismiss, undismiss } from '../server/signals.js';
// A member's film signals: "Not for me" and what the critic said about films.
export async function signals(ctx) {
  await identify(ctx);
  if (ctx.request.method === 'GET') return { signals: await readSignals(ctx) };
  const input = await body(ctx);
  if (input.action === 'dismiss') return dismiss(ctx, input.movie);
  if (input.action === 'undismiss') return undismiss(ctx, input.movie_id);
  throw new HttpError(400, 'Unknown action.');
}
export default nodeHandler(signals);
