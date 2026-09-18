import { nodeHandler, identify, database, allRows, body, HttpError } from '../server/http.js';
import { normalizeMovie } from '../shared/library.js';
export async function library(ctx) {
  await identify(ctx);
  const db = database(ctx.token);
  if (ctx.request.method === 'GET') return {
    rows: await allRows(db, `user_movies?user_id=eq.${ctx.user.id}&order=movie_id,kind`)
  };
  const input = await body(ctx);
  if (!Array.isArray(input.changes) || input.changes.length > 500) throw new HttpError(400, 'Invalid library changes.');
  const changes = input.changes.map(c => {
    if (!['watched', 'watchlist'].includes(c.kind) || !['put', 'remove', 'rate'].includes(c.op) || !Number.isSafeInteger(c.movie_id) || c.movie_id <= 0 || !Number.isInteger(c.version) || c.version < 0) throw new HttpError(400, 'Invalid library change.');
    if (c.rating != null && (!Number.isInteger(c.rating) || c.rating < 1 || c.rating > 10)) throw new HttpError(400, 'Ratings must be between 1 and 10.');
    let movie;
    try {
      movie = c.op === 'put' ? normalizeMovie({
        ...c.movie,
        id: c.movie_id
      }) : undefined;
    } catch (e) {
      throw new HttpError(400, e.message);
    }
    return {
      op: c.op,
      kind: c.kind,
      movie_id: c.movie_id,
      version: c.version,
      rating: c.rating ?? null,
      ...(movie ? {
        movie
      } : {})
    };
  });
  return {
    rows: await db('rpc/apply_library', {
      method: 'POST',
      body: {
        changes,
        importing: input.importing === true
      }
    })
  };
}
export default nodeHandler(library);
