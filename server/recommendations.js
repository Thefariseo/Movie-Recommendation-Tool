import { database, allRows, HttpError, uuid, remote } from './http.js';
import { predict, groupScore } from '../shared/model.js';
import { tasteProfile, tasteScore, genreIds, seedMovies, diversePicks, hybridScore } from '../shared/taste.js';
export async function tmdb(path, params = {}) {
  const key = process.env.TMDB_KEY || process.env.VITE_TMDB_KEY;
  if (!key) throw new HttpError(503, 'Film discovery is not configured yet.');
  const query = new URLSearchParams({
    api_key: key,
    language: 'en-US',
    ...params
  });
  return remote(`https://api.themoviedb.org/3/${path}?${query}`);
}
const watchedMovies = rows => rows.filter(r => r.kind === 'watched').map(r => ({...r.movie, id: Number(r.movie_id), rated: r.rating}));
export const contentScore = tasteScore;
export async function recommendations(ctx, members = [], constraints = {}, recentIds = []) {
  if (!Array.isArray(members) || members.length > 3) throw new HttpError(400, 'Choose up to three friends.');
  const ids = [...new Set([ctx.user.id, ...members.map(uuid)])],
    db = database(ctx.token);
  const libraries = [];
  for (const id of ids) {
    if (id !== ctx.user.id) {
      const allowed = await db('rpc/can_read_library', {
        method: 'POST',
        body: {
          other_id: id
        }
      });
      if (!allowed) throw new HttpError(403, 'Each friend must follow you back and share their activity before a group movie night.');
    }
    const rows = await allRows(db, `user_movies?user_id=eq.${id}&deleted=eq.false&order=movie_id,kind`);
    if (ids.length > 1 && !rows.some(r => r.kind === 'watched' && r.rating)) throw new HttpError(400, 'Everyone in the group needs at least one rated film.');
    libraries.push(rows);
  }
  const excluded = new Set(libraries.flat().filter(r => r.kind === 'watched').map(r => Number(r.movie_id)));
  for (const id of constraints.excluded_ids || []) excluded.add(Number(id));
  let model = null;
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      model = await database(null, true)('rpc/current_model', {
        method: 'POST',
        body: {}
      });
    } catch {/* A failed optional model lookup must not take discovery down. */}
  }
  const collaborative = ids.length === 1 ? await db('rpc/collaborative_candidates', {
    method: 'POST',
    body: {}
  }) : [];
  const candidateMap = new Map();
  const add = movies => {
    for (const m of movies || []) if (m.id && !excluded.has(Number(m.id))) candidateMap.set(Number(m.id), {...candidateMap.get(Number(m.id)), ...m, genre_ids: genreIds(m)});
  };
  const modelIds = model ? [...new Set(ids.flatMap(id => Object.keys(model.items).map(mid => ({
    id: Number(mid),
    score: predict(model, id, mid)
  })).filter(x => x.score != null && !excluded.has(x.id)).sort((a, b) => b.score - a.score).slice(0, 20).map(x => x.id)))] : [];
  const detailIds = [...new Set([...collaborative.slice(0, 24).map(x => Number(x.movie_id)), ...modelIds])].slice(0, 40);
  for (let i = 0; i < detailIds.length; i += 5) {
    const results = await Promise.allSettled(detailIds.slice(i, i + 5).map(id => tmdb(`movie/${id}`)));
    for (const r of results) if (r.status === 'fulfilled') add([{
      ...r.value,
      genre_ids: r.value.genres?.map(g => g.id)
    }]);
  }
  for (const rows of libraries) {
    const liked = seedMovies(watchedMovies(rows), 4);
    const results = await Promise.allSettled(liked.map(r => tmdb(`movie/${r.id}/recommendations`)));
    for (const r of results) if (r.status === 'fulfilled') add(r.value.results);
    const saved = rows.filter(r => r.kind === 'watchlist' && !excluded.has(Number(r.movie_id))).slice(0, 12);
    for (let i = 0; i < saved.length; i += 6) {
      const details = await Promise.allSettled(saved.slice(i, i + 6).map(r => tmdb(`movie/${r.movie_id}`)));
      for (const r of details) if (r.status === 'fulfilled') add([r.value]);
    }
  }
  const profiles = libraries.map(rows => tasteProfile(watchedMovies(rows)));
  const genres = constraints.genre_ids?.length ? constraints.genre_ids : [...new Set(profiles.flatMap(p => [...p.genres].filter(([,score]) => score > 0).sort((a,b) => b[1] - a[1]).slice(0, 2).map(([id]) => id)))].slice(0, 6);
  const discoveryParams = {
    sort_by: 'vote_average.desc',
    'vote_count.gte': '50',
    include_adult: 'false',
    'primary_release_date.lte': new Date().toISOString().slice(0, 10),
    ...(constraints.avoid_genres?.length ? { without_genres: constraints.avoid_genres.join(',') } : {}),
    ...(genres.length ? {
      with_genres: genres.join('|')
    } : {}),
    ...(constraints.max_runtime ? {
      'with_runtime.lte': String(constraints.max_runtime)
    } : {})
  };
  const discovery = await Promise.allSettled([1, 2, 3].map(page => tmdb('discover/movie', {...discoveryParams, page: String(page)})));
  for (const r of discovery) if (r.status === 'fulfilled') add(r.value.results);
  if (!candidateMap.size && discovery.every(r => r.status === 'rejected')) throw new HttpError(502, 'Film discovery is temporarily unavailable. Please try again.');
  const neighborMap = new Map(collaborative.map(x => [Number(x.movie_id), x]));
  let movies = [...candidateMap.values()].filter(m => !m.adult && (!m.release_date || m.release_date <= new Date().toISOString().slice(0, 10))).map(m => {
    const scores = ids.map((id, index) => hybridScore(
      contentScore(m, profiles[index]),
      predict(model || {users: {}, items: {}}, id, m.id),
      index === 0 ? neighborMap.get(m.id) : null
    ));
    const learned = ids.some(id => predict(model || {
        users: {},
        items: {}
      }, id, m.id) != null),
      neighbor = neighborMap.get(m.id);
    return {
      ...m,
      _score: groupScore(scores),
      _engine: learned ? 'matrix-factorization' : neighbor ? 'collaborative' : 'content',
      _reason: ids.length > 1 ? 'Balances the group’s film tastes' : learned ? 'Learned from community ratings' : neighbor ? 'Loved by people with similar ratings' : profiles[0].count ? 'Matches patterns in your likes and dislikes' : 'A well-rated starting point — rate films to personalise your picks',
      _support: neighbor ? Number(neighbor.support) : undefined
    };
  }).sort((a, b) => b._score - a._score);
  if (constraints.genre_ids?.length) movies = movies.filter(m => (m.genre_ids || []).some(id => constraints.genre_ids.includes(id)));
  if (constraints.avoid_genres?.length) movies = movies.filter(m => !(m.genre_ids || []).some(id => constraints.avoid_genres.includes(id)));
  if (constraints.max_runtime || constraints.avoid_violence || constraints.theme) {
    const enriched = [];
    // Bound provider calls; never backfill with films that violate an explicit constraint.
    for (let i = 0; i < Math.min(movies.length, 36); i += 6) {
      const part = await Promise.allSettled(movies.slice(i, i + 6).map(async m => ({
        ...m,
        ...(await tmdb(`movie/${m.id}`, {
          append_to_response: 'keywords'
        }))
      })));
      for (const r of part) if (r.status === 'fulfilled') enriched.push(r.value);
      // Check the whole bounded shortlist: early non-matches must not hide later matches.
    }
    movies = enriched.filter(m => {
      if (m.adult || (m.release_date && m.release_date > new Date().toISOString().slice(0, 10))) return false;
      const genres = genreIds(m);
      if (constraints.genre_ids?.length && !genres.some(g => constraints.genre_ids.includes(g))) return false;
      if (constraints.avoid_genres?.some(g => genres.includes(g))) return false;
      if (constraints.max_runtime && (!m.runtime || m.runtime > constraints.max_runtime)) return false;
      const keywords = m.keywords?.keywords || [];
      const text = `${m.overview || ''} ${keywords.map(k => k.name).join(' ')}`.toLowerCase();
      if (constraints.avoid_violence && (!(m.genres || []).length || ![16, 35, 10751, 10749, 10402].some(g => (m.genre_ids || m.genres.map(x => x.id)).includes(g)) || /\b(violence|violent|gore|murder|torture|killer|blood|war|gun|assault|rape|abuse)\b/i.test(text))) return false;
      if (constraints.theme && !text.includes(constraints.theme.toLowerCase())) return false;
      return true;
    });
  }
  movies = diversePicks(movies, 12, { recent: new Set(recentIds.map(Number)) });
  const engine = movies.some(m => m._engine === 'matrix-factorization') ? 'matrix-factorization' : movies.some(m => m._engine === 'collaborative') ? 'collaborative' : 'content';
  return {
    movies: movies.slice(0, 12),
    engine,
    message: ids.length > 1 ? 'Picks balance everyone’s taste; films already watched by anyone are excluded.' : engine === 'content' ? 'Not enough shared rating history yet. These picks use your film tastes.' : engine === 'collaborative' ? 'These picks use ratings from people with similar tastes.' : 'These picks include predictions from the trained community model.'
  };
}
