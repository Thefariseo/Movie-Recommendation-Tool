import { nodeHandler, identify, body, HttpError } from '../server/http.js';
import { readSignals, dismiss, undismiss } from '../server/signals.js';
import { readJourneys, saveJourney, dropJourney } from '../server/journeys.js';
// A member's notes on their taste: "Not for me", what the critic said about
// films, and the journeys they follow.
export async function signals(ctx) {
  await identify(ctx);
  if (ctx.request.method === 'GET') {
    if (ctx.url.searchParams.has('journeys')) return { journeys: await readJourneys(ctx) };
    return { signals: await readSignals(ctx) };
  }
  const input = await body(ctx);
  if (input.action === 'dismiss') return dismiss(ctx, input.movie);
  if (input.action === 'undismiss') return undismiss(ctx, input.movie_id);
  if (input.action === 'save-journey') return saveJourney(ctx, input.journey);
  if (input.action === 'drop-journey') return dropJourney(ctx, input.id);
  throw new HttpError(400, 'Unknown action.');
}
export default nodeHandler(signals);
