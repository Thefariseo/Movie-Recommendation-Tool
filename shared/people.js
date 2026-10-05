// A director's or actor's films as the member would want to go through them:
// the ones they have seen with their rating, and the ones they have not,
// best bets first by the rating their own diary predicts.

// A credit too obscure to recommend: few votes, or not released yet.
const MIN_VOTES = 40;
const RELEVANT_JOBS = new Set(['Director', 'Screenplay', 'Writer', 'Director of Photography', 'Original Music Composer', 'Producer']);

/**
 * The person's films in one role ("directing", "acting" or "writing"),
 * from TMDB movie credits. Duplicates (two jobs on one film) are merged.
 */
export function creditsFor(credits, role) {
  const films = role === 'acting'
    ? (credits?.cast || []).map((c) => ({ ...c, credit: c.character || null }))
    : (credits?.crew || [])
      .filter((c) => (role === 'directing' ? c.job === 'Director' : role === 'writing' ? ['Screenplay', 'Writer', 'Novel', 'Story'].includes(c.job) : RELEVANT_JOBS.has(c.job)))
      .map((c) => ({ ...c, credit: c.job }));
  const byId = new Map();
  for (const f of films) {
    const prev = byId.get(f.id);
    byId.set(f.id, prev ? { ...prev, credit: [prev.credit, f.credit].filter(Boolean).join(', ') } : f);
  }
  return [...byId.values()];
}

/** Which roles the person has, biggest first, with their known department leading. */
export function rolesOf(credits, known = '') {
  const roles = [
    ['directing', creditsFor(credits, 'directing').length],
    ['acting', creditsFor(credits, 'acting').length],
    ['writing', creditsFor(credits, 'writing').length]
  ].filter(([, n]) => n > 0);
  const lead = { Directing: 'directing', Acting: 'acting', Writing: 'writing' }[known];
  return roles.sort((a, b) => (b[0] === lead) - (a[0] === lead) || b[1] - a[1]).map(([r]) => r);
}

/**
 * Ranks a filmography for the member. `watched` is their diary
 * ({ id, rated }), `predict` an optional id -> { rating, support }
 * (shared/predict.js). Returns { seen, unseen, stats }: films they have
 * seen, best rated first, and films they have not, best bets first (a film
 * the diary cannot judge falls back to its public rating). Unreleased and
 * barely rated films go last.
 */
export function rankFilmography(films, watched = [], predict = null) {
  const mine = new Map(watched.map((f) => [Number(f.id), f]));
  const year = (f) => Number(String(f.release_date || '').slice(0, 4)) || null;
  const seen = [], unseen = [];
  for (const f of films) {
    const own = mine.get(Number(f.id));
    const base = { ...f, year: year(f) };
    if (own) { seen.push({ ...base, rated: Number(own.rated) || null }); continue; }
    const p = predict?.(f.id);
    const predicted = p && p.support > 0.3 ? p.rating : null;
    const known = (f.vote_count || 0) >= MIN_VOTES;
    // On the 1–10 scale: what the diary predicts, else the public rating pulled towards the middle.
    const score = predicted ?? (known ? 5 + (Number(f.vote_average) - 5) * 0.8 : 0);
    unseen.push({ ...base, predicted, score, obscure: !known && predicted == null });
  }
  seen.sort((a, b) => (b.rated ?? 0) - (a.rated ?? 0) || (b.year ?? 0) - (a.year ?? 0));
  unseen.sort((a, b) => a.obscure - b.obscure || b.score - a.score || (b.vote_count || 0) - (a.vote_count || 0));
  const rated = seen.filter((f) => f.rated);
  return {
    seen,
    unseen,
    stats: {
      total: films.length,
      seen: seen.length,
      mean: rated.length ? Number((rated.reduce((s, f) => s + f.rated, 0) / rated.length).toFixed(1)) : null
    }
  };
}
