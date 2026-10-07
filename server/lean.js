// Film and filmography answers trimmed to what the site reads. TMDB's full
// credits run to hundreds of names (a film's answer averages ~48 KB, a
// filmography ~120 KB); scoring and the film sheet need a few actors, the key
// crew and the films' basic facts. Trimmed answers are a tenth of the size
// and, being the same for everyone, are cached at Vercel's edge.

const CAST = 20;
const KEY_JOBS = new Set(['Director', 'Screenplay', 'Writer', 'Story', 'Novel', 'Director of Photography', 'Original Music Composer', 'Editor', 'Producer']);
const VIDEO_TYPES = new Set(['Trailer', 'Teaser']);

const pick = (o, keys) => Object.fromEntries(keys.filter(k => o?.[k] !== undefined).map(k => [k, o[k]]));
const FILM = ['id', 'title', 'original_title', 'release_date', 'poster_path', 'backdrop_path', 'genre_ids', 'vote_average', 'vote_count', 'popularity', 'original_language', 'adult', 'video'];
// original_name: a name TMDB gives in its own script (봉준호) has its Latin spelling there.
const PERSON = ['id', 'name', 'original_name', 'profile_path', 'known_for_department'];

/** A film in a list (recommendations, a filmography): its facts, not its plot, which no list shows. */
export const leanListFilm = f => pick(f, FILM);

export function leanCredits(credits) {
  if (!credits) return credits;
  const cast = [...(credits.cast || [])].sort((a, b) => (a.order ?? 999) - (b.order ?? 999)).slice(0, CAST)
    .map(c => ({ ...pick(c, PERSON), character: c.character, order: c.order }));
  const crew = (credits.crew || []).filter(c => KEY_JOBS.has(c.job))
    .map(c => ({ ...pick(c, PERSON), job: c.job, department: c.department }));
  return { ...(credits.id ? { id: credits.id } : {}), cast, crew };
}

/** A film's details with only the credits, videos and recommendations the site uses. */
export function leanMovie(m) {
  if (!m || typeof m !== 'object') return m;
  const out = { ...m };
  if (m.credits) out.credits = leanCredits(m.credits);
  if (m.videos) out.videos = { results: (m.videos.results || []).filter(v => v.site === 'YouTube' && VIDEO_TYPES.has(v.type)) };
  if (m.recommendations) out.recommendations = { ...pick(m.recommendations, ['page', 'total_pages', 'total_results']), results: (m.recommendations.results || []).map(leanListFilm) };
  if (m.keywords?.keywords) out.keywords = { keywords: m.keywords.keywords.slice(0, 40) };
  return out;
}

/** A person's filmography: as actor, every film; as crew, the key jobs only. */
export function leanFilmography(c) {
  if (!c) return c;
  return {
    id: c.id,
    cast: (c.cast || []).map(f => ({ ...leanListFilm(f), character: f.character, order: f.order })),
    crew: (c.crew || []).filter(f => KEY_JOBS.has(f.job)).map(f => ({ ...leanListFilm(f), job: f.job, department: f.department }))
  };
}
