import { nodeHandler, identify, body, HttpError, rateLimit } from '../server/http.js';
import { createNight, readNight, myNights, vote, decide } from '../server/tonight.js';
// Movie nights with friends. Creating one builds group picks, so it shares the
// recommendation rate limit; voting and reading are cheap and polled.
export async function tonight(ctx) {
  await identify(ctx);
  if (ctx.request.method === 'GET') {
    const id = ctx.url.searchParams.get('id');
    return id ? readNight(ctx, id) : myNights(ctx);
  }
  const input = await body(ctx);
  if (input.action === 'create') {
    await rateLimit(ctx, 'recommend');
    return createNight(ctx, input);
  }
  if (input.action === 'vote') return vote(ctx, input.id, input.movie_id, Number(input.vote));
  if (input.action === 'decide') return decide(ctx, input.id, input.mode || 'best');
  throw new HttpError(400, 'Unknown action.');
}
export default nodeHandler(tonight);
