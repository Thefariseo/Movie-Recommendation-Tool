// One compact representation for imports, TMDB results and cloud storage.
export function normalizeMovie(movie) {
  const id = Number(movie?.id);
  if (!Number.isSafeInteger(id) || id <= 0 || typeof movie?.title !== 'string' || !movie.title.trim()) throw new Error('A valid movie ID and title are required.');
  const genres = (movie.genre_ids || movie.genres || []).map(g => Number(g?.id ?? g)).filter(Number.isSafeInteger).slice(0, 20);
  const year = Number(movie.year || String(movie.release_date || '').slice(0, 4)) || null;
  const poster = movie.poster_path ?? movie.poster;
  const poster_path = typeof poster === 'string' && /^\/[a-zA-Z0-9._/-]+$/.test(poster) ? poster : null;
  return {
    id,
    title: movie.title.slice(0, 300),
    poster_path,
    poster: poster_path,
    genre_ids: genres,
    genres,
    year,
    release_date: movie.release_date || (year ? `${year}-01-01` : ''),
    vote_average: Number(movie.vote_average) || 0
  };
}
export function rowToMovie(row) {
  return {
    ...row.movie,
    id: Number(row.movie_id),
    ...(row.kind === 'watched' ? {
      rated: row.rating
    } : {}),
    _version: row.version,
    // When the entry last changed, used to draw how a member's taste grew.
    ...(row.updated_at ? {
      _updated: row.updated_at
    } : {})
  };
}
export function mergeRows(current, incoming) {
  const map = new Map(current.map(r => [`${r.kind}:${r.movie_id}`, r]));
  let changed = false;
  for (const row of incoming) {
    const key = `${row.kind}:${row.movie_id}`;
    if (!map.has(key) || map.get(key).version < row.version) {
      map.set(key, row);
      changed = true;
    }
  }
  return changed ? [...map.values()] : current;
}
export function importChanges(watched = [], watchlist = []) {
  return [...new Map([...watched.map(m => ['watched', m]), ...watchlist.map(m => ['watchlist', m])].map(([kind, m]) => [`${kind}:${m.id}`, {
    op: 'put',
    kind,
    movie_id: Number(m.id),
    movie: normalizeMovie(m),
    rating: kind === 'watched' && Number(m.rated) > 0 ? Number(m.rated) : null,
    version: 0
  }])).values()];
}
