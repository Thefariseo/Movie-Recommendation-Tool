// Shared scoring for local and cloud discovery. Missing ratings are not likes.
export const genreIds = movie => [...new Set((movie.genre_ids || movie.genres || [])
  .map(g => Number(g?.id ?? g)).filter(Number.isSafeInteger))];
export const movieYear = movie => Number(movie.year || String(movie.release_date || '').slice(0, 4)) || null;
// How much one rating says about taste, from -1 (a clear dislike) to 1. Absolute
// dislike still matters for users who rate everything harshly; centering on the
// member's own mean also separates preferences in generous rating histories.
export function ratingSignal(rated, mean) {
  return Math.max(-1, Math.min(1, (.65 * (rated - mean) + .35 * (rated - 5.5)) / 3));
}
export const ratedOnly = movies => movies.filter(m => Number(m.rated) >= 1 && Number(m.rated) <= 10);
export const ratingMean = rated => rated.length ? rated.reduce((s, m) => s + Number(m.rated), 0) / rated.length : 6;
export function tasteProfile(movies) {
  const rated = ratedOnly(movies);
  const mean = ratingMean(rated);
  const genres = new Map(), decades = new Map();
  const add = (map, key, signal) => {
    const old = map.get(key) || { sum: 0, count: 0 };
    map.set(key, { sum: old.sum + signal, count: old.count + 1 });
  };
  for (const m of rated) {
    const signal = ratingSignal(Number(m.rated), mean);
    for (const g of genreIds(m)) add(genres, g, signal);
    const year = movieYear(m);
    if (year) add(decades, Math.floor(year / 10) * 10, signal);
  }
  const shrink = map => new Map([...map].map(([key, {sum, count}]) => [key, sum / (count + 3)]));
  return { genres: shrink(genres), decades: shrink(decades), count: rated.length, mean };
}
// IMDb and Rotten Tomatoes are the reference for a film's quality. TMDB's own
// average is kept only for films no external source has rated yet, so a film is
// never held back merely because its ratings have not been fetched.
const present = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
export function externalRatings(movie) {
  const imdb = present(movie?.imdb_rating) ? Number(movie.imdb_rating) : null;
  const rt = present(movie?.rt_score) ? Number(movie.rt_score) : null;
  return {
    imdb: imdb != null && imdb >= 1 && imdb <= 10 ? imdb : null,
    rt: rt != null && rt >= 0 && rt <= 100 ? rt : null,
    votes: present(movie?.imdb_votes) ? Math.max(0, Number(movie.imdb_votes)) : 0
  };
}
// Rotten Tomatoes is the share of positive reviews, not a mark. 0% maps to 4 and
// 100% to 9.5, so unanimous acclaim lands where an excellent IMDb score does.
const rtOnTen = rt => 4 + .055 * rt;
// IMDb's weight when both exist. It covers almost every film; RT is sparser and
// driven by fewer, professional reviews.
const IMDB_SHARE = .6;
/** The mark a reader would see, on a 10-point scale, without any shrinkage. */
export function criticAverage(movie) {
  const { imdb, rt } = externalRatings(movie);
  if (imdb != null && rt != null) return IMDB_SHARE * imdb + (1 - IMDB_SHARE) * rtOnTen(rt);
  if (imdb != null) return imdb;
  if (rt != null) return rtOnTen(rt);
  return Math.max(0, Math.min(10, Number(movie?.vote_average) || 0));
}
/** How many people a mark rests on, in TMDB-sized units so thresholds keep meaning. */
export function ratingReach(movie) {
  const { imdb, votes } = externalRatings(movie);
  // IMDb audiences run roughly an order of magnitude above TMDB's.
  return imdb != null && votes ? votes / 10 : Math.max(0, Number(movie?.vote_count) || 0);
}
export function qualityScore(movie) {
  const { imdb, rt, votes } = externalRatings(movie);
  if (imdb != null || rt != null) {
    // Thin IMDb samples are shrunk towards a typical film. The prior of 1,000
    // votes is TMDB's former 100 scaled to IMDb's larger audience, so a
    // well-liked art-house film is not flattened for being little known.
    const imdbPart = imdb == null ? null : (votes * imdb + 1000 * 6.4) / (votes + 1000);
    const rtPart = rt == null ? null : rtOnTen(rt);
    if (imdbPart != null && rtPart != null) return IMDB_SHARE * imdbPart + (1 - IMDB_SHARE) * rtPart;
    return imdbPart ?? rtPart;
  }
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
// Films whose "more like this" seeds the candidates: the ones the member
// clearly loved (8/10 or more), topped up with 7/10 ones only when too few.
export function seedMovies(movies, limit = 4) {
  const pick = min => diversePicks(movies.filter(m => m.rated >= min).map(m => ({...m, _score: Number(m.rated)})), limit, {strength: 2});
  const loved = pick(8);
  if (loved.length >= limit) return loved;
  const ids = new Set(loved.map(m => m.id));
  return [...loved, ...pick(7).filter(m => !ids.has(m.id))].slice(0, limit);
}
export function hybridScore(content, learned, neighbor) {
  const support = Math.max(0, Number(neighbor?.support) || 0);
  const neighborWeight = Number.isFinite(Number(neighbor?.score)) && support > 0 ? .65 * support / (support + 4) : 0;
  const modelWeight = Number.isFinite(learned) ? .55 : 0;
  const total = Math.min(.8, neighborWeight + modelWeight);
  const evidence = neighborWeight + modelWeight;
  return evidence ? (1 - total) * content + total * (neighborWeight * Number(neighbor?.score || 0) + modelWeight * (learned || 0)) / evidence : content;
}
