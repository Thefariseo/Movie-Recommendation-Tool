// Shared scoring for local and cloud discovery. Missing ratings are not likes.
export const genreIds = movie => [...new Set((movie.genre_ids || movie.genres || [])
  .map(g => Number(g?.id ?? g)).filter(Number.isSafeInteger))];
export const movieYear = movie => Number(movie.year || String(movie.release_date || '').slice(0, 4)) || null;
export function tasteProfile(movies) {
  const rated = movies.filter(m => Number(m.rated) >= 1 && Number(m.rated) <= 10);
  const mean = rated.length ? rated.reduce((s, m) => s + Number(m.rated), 0) / rated.length : 6;
  const genres = new Map(), decades = new Map();
  const add = (map, key, signal) => {
    const old = map.get(key) || { sum: 0, count: 0 };
    map.set(key, { sum: old.sum + signal, count: old.count + 1 });
  };
  for (const m of rated) {
    // Absolute dislike still matters for users who rate everything harshly;
    // centering also distinguishes preferences in generous rating histories.
    const signal = Math.max(-1, Math.min(1, (.65 * (m.rated - mean) + .35 * (m.rated - 5.5)) / 3));
    for (const g of genreIds(m)) add(genres, g, signal);
    const year = movieYear(m);
    if (year) add(decades, Math.floor(year / 10) * 10, signal);
  }
  const shrink = map => new Map([...map].map(([key, {sum, count}]) => [key, sum / (count + 3)]));
  return { genres: shrink(genres), decades: shrink(decades), count: rated.length, mean };
}
export function qualityScore(movie) {
  const count = Math.max(0, Number(movie.vote_count) || 0);
  const average = Math.max(0, Math.min(10, Number(movie.vote_average) || 0));
  return (count * average + 100 * 6.2) / (count + 100);
}
export function tasteScore(movie, profile) {
  const genres = genreIds(movie);
  const affinity = genres.length ? genres.reduce((s, g) => s + (profile.genres.get(g) || 0), 0) / Math.sqrt(genres.length) : 0;
  const year = movieYear(movie);
  return Math.max(1, Math.min(10, qualityScore(movie) + 2.4 * affinity + .6 * (profile.decades.get(Math.floor(year / 10) * 10) || 0)));
}
export function similarity(a, b) {
  const ga = genreIds(a), gb = genreIds(b);
  const union = new Set([...ga, ...gb]).size;
  let score = union ? .75 * ga.filter(g => gb.includes(g)).length / union : 0;
  const ya = movieYear(a), yb = movieYear(b);
  if (ya && yb && Math.floor(ya / 10) === Math.floor(yb / 10)) score += .1;
  if (a.original_language && a.original_language === b.original_language) score += .05;
  if (a.dirName && a.dirName === b.dirName) score = Math.max(score, .9);
  if (a.belongs_to_collection?.id && a.belongs_to_collection.id === b.belongs_to_collection?.id) score = 1;
  return score;
}
// Greedy relevance/diversity trade-off, deterministic for reproducible tests.
// Recent impressions are soft penalties, so a narrow filter can still return picks.
export function diversePicks(movies, limit = 12, { recent = new Set(), strength = .65 } = {}) {
  const pool = [...new Map(movies.map(m => [Number(m.id), m])).values()];
  const selected = [];
  while (pool.length && selected.length < limit) {
    let best = 0, bestValue = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const m = pool[i];
      const overlap = selected.length ? Math.max(...selected.map(s => similarity(m, s))) : 0;
      const value = (Number(m._score) || 0) - strength * overlap - (recent.has(Number(m.id)) ? 2 : 0);
      if (value > bestValue || (value === bestValue && Number(m.id) < Number(pool[best].id))) {
        best = i; bestValue = value;
      }
    }
    selected.push(pool.splice(best, 1)[0]);
  }
  return selected;
}
export function seedMovies(movies, limit = 4) {
  return diversePicks(movies.filter(m => m.rated >= 7).map(m => ({...m, _score: Number(m.rated)})), limit, {strength: 2});
}
export function hybridScore(content, learned, neighbor) {
  const support = Math.max(0, Number(neighbor?.support) || 0);
  const neighborWeight = Number.isFinite(Number(neighbor?.score)) && support > 0 ? .65 * support / (support + 4) : 0;
  const modelWeight = Number.isFinite(learned) ? .55 : 0;
  const total = Math.min(.8, neighborWeight + modelWeight);
  const evidence = neighborWeight + modelWeight;
  return evidence ? (1 - total) * content + total * (neighborWeight * Number(neighbor?.score || 0) + modelWeight * (learned || 0)) / evidence : content;
}
