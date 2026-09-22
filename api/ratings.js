import { nodeHandler, HttpError } from '../server/http.js';
import { ratingsFor } from '../server/ratings.js';
// Film ratings are public reference data, so no account is needed to read them.
// Each request may fill a few uncached films; the daily OMDb allowance, not this
// endpoint, bounds what a caller can spend.
export async function ratings(ctx) {
  const ids = (ctx.url.searchParams.get('ids') || '').split(',').filter(Boolean).map(Number);
  if (!ids.length || ids.length > 100 || ids.some(id => !Number.isSafeInteger(id) || id <= 0)) throw new HttpError(400, 'Provide between 1 and 100 film ids.');
  const found = await ratingsFor(ids, { fill: 6 });
  return { ratings: Object.fromEntries(found) };
}
export default nodeHandler(ratings, ['GET']);
