// Film threads: rows on the Discover page, each following one thing the
// member's ratings (or their critic) say they love — a director, an actor, a
// film, a theme, a language, a decade — plus hidden gems the taste space finds
// and directors they have never tried. Planning is pure, so it is tested
// without the network; src/utils/threads.js fetches each thread's films.
import { stars } from './evidence.js';
import { STANCES } from './rules.js';
import { qualityScore, genreIds } from './taste.js';

export const MAX_THREADS = 10;

const quoted = f => `"${f.title}"`;
const gave = films => films.map(f => `${quoted(f)} ${stars(f.rated)}`).join(' and ');
const capital = s => String(s || '').replace(/^\w/, c => c.toUpperCase());
let languageNames = null;
const tongue = code => {
  try { languageNames ??= new Intl.DisplayNames(['en'], { type: 'language' }); return languageNames.of(code) || code; } catch { return code; }
};
const strongest = (map, { min = 0.3, count = 2, limit = 3, skip = () => false } = {}) => [...(map || new Map())]
  .filter(([key, e]) => e.value >= min && e.count >= count && e.examples?.length && !skip(key, e))
  .sort((a, b) => b[1].value * Math.sqrt(b[1].count) - a[1].value * Math.sqrt(a[1].count))
  .slice(0, limit);

/**
 * The threads worth showing, strongest first. Each is
 * { id, kind, title, why, query } where query says what to fetch:
 *   { type: 'person', id, role }          a filmography
 *   { type: 'similar', id }               TMDB's "more like this" of one film
 *   { type: 'discover', params }          TMDB discover
 *   { type: 'hidden' }                    the taste space's lesser-known matches
 *   { type: 'new-directors' }             directors the member has never tried
 * `evidence` is tasteEvidence (may be null), `rules` the critic's rules.
 */
export function planThreads({ watched = [], evidence = null, rules = [], hasSpace = false, taste = null } = {}) {
  const threads = [];
  const add = t => { if (!threads.some(x => x.id === t.id)) threads.push(t); };
  const rated = watched.filter(m => Number(m.rated) > 0);

  // Directors: the clearest taste there is.
  for (const [id, e] of strongest(evidence?.directors, { limit: 3 })) {
    add({ id: `director:${id}`, kind: 'director', title: `More from ${e.name}`, why: `You gave ${gave(e.examples.slice(0, 2))}`, query: { type: 'person', id: Number(id), role: 'director' } });
  }
  // Films loved most recently: the library keeps the order films were added.
  const loved = [...rated].reverse().filter(m => Number(m.rated) >= 9 && m.title).slice(0, 2);
  for (const m of loved.length ? loved : [...rated].reverse().filter(m => Number(m.rated) >= 8 && m.title).slice(0, 1)) {
    add({ id: `similar:${m.id}`, kind: 'similar', title: `Because you loved ${quoted(m)}`, why: `You gave it ${stars(m.rated)}`, query: { type: 'similar', id: Number(m.id) } });
  }
  // Themes from films the member loved.
  for (const [id, e] of strongest(evidence?.keywords, { min: 0.25, limit: 2 })) {
    add({ id: `theme:${id}`, kind: 'theme', title: capital(e.name), why: `Like ${gave(e.examples.slice(0, 2))}`, query: { type: 'discover', params: { with_keywords: String(id), sort_by: 'vote_average.desc', 'vote_count.gte': 100 } } });
  }
  // What the critic learned that the ratings do not already show.
  for (const r of rules.filter(r => STANCES[r.stance] > 0).slice(0, 6)) {
    const why = `Your critic: ${r.why || 'you love it'}`;
    if (r.kind === 'person') add({ id: `director:${r.id}`, kind: 'critic', title: r.role === 'actor' ? `With ${r.name}` : `More from ${r.name}`, why, query: { type: 'person', id: Number(r.id), role: r.role === 'actor' ? 'actor' : 'director' } });
    else if (r.kind === 'theme') add({ id: `theme:${r.id}`, kind: 'critic', title: capital(r.name), why, query: { type: 'discover', params: { with_keywords: String(r.id), sort_by: 'vote_average.desc', 'vote_count.gte': 100 } } });
    else if (r.kind === 'language') add({ id: `language:${r.code}`, kind: 'critic', title: `${tongue(r.code)} cinema`, why, query: { type: 'discover', params: { with_original_language: r.code, sort_by: 'vote_average.desc', 'vote_count.gte': 150 } } });
  }
  // Languages other than English the member rates highly.
  for (const [code, e] of strongest(evidence?.languages, { count: 3, limit: 1, skip: c => c === 'en' })) {
    add({ id: `language:${code}`, kind: 'language', title: `${tongue(code)} cinema`, why: `Like ${gave(e.examples.slice(0, 2))}`, query: { type: 'discover', params: { with_original_language: code, sort_by: 'vote_average.desc', 'vote_count.gte': 150 } } });
  }
  if (hasSpace && rated.length >= 3) {
    add({ id: 'hidden', kind: 'hidden', title: 'Hidden gems for your taste', why: 'Lesser-known films people with your taste love', query: { type: 'hidden' } });
    add({ id: 'new-directors', kind: 'new-directors', title: 'Directors to discover', why: 'Filmmakers you have not tried yet, loved by people with your taste', query: { type: 'new-directors' } });
  }
  // The decade the member rates highest, in their favourite genres.
  const decades = [...(taste?.decades || new Map())].filter(([, v]) => v >= 0.15).sort((a, b) => b[1] - a[1]);
  if (decades.length) {
    const [decade] = decades[0];
    const genres = [...(taste?.genres || new Map())].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([g]) => g);
    add({ id: `decade:${decade}`, kind: 'decade', title: `The ${decade}s, your way`, why: 'The decade you rate highest, in the genres you love', query: { type: 'discover', params: { 'primary_release_date.gte': `${decade}-01-01`, 'primary_release_date.lte': `${decade + 9}-12-31`, ...(genres.length ? { with_genres: genres.join('|') } : {}), sort_by: 'vote_average.desc', 'vote_count.gte': 200 } } });
  }
  // Actors, after the rest: a cast is a weaker thread than a director.
  for (const [id, e] of strongest(evidence?.cast, { min: 0.35, limit: 1 })) {
    add({ id: `actor:${id}`, kind: 'actor', title: `With ${e.name}`, why: `You gave ${gave(e.examples.slice(0, 2))}`, query: { type: 'person', id: Number(id), role: 'actor' } });
  }
  return threads.slice(0, MAX_THREADS);
}

/**
 * A thread's films, ready to show: never a film already watched or ruled
 * out, never one another thread already shows, released, with enough
 * ratings to trust, not one the taste space expects them to dislike (below
 * `minFit`); best first, where "best" is the taste space's match when it knows
 * the film and its quality otherwise.
 */
export function rankThread(films, { exclude = new Set(), taken = new Set(), fit = () => null, minVotes = 50, minFit = null, limit = 14 } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const seen = new Set();
  return films
    .filter(m => m?.id && !m.adult && m.poster_path && !exclude.has(Number(m.id)) && !taken.has(Number(m.id)))
    .filter(m => m.release_date && m.release_date <= today && (m.vote_count || 0) >= minVotes)
    .filter(m => (seen.has(Number(m.id)) ? false : seen.add(Number(m.id))))
    // TMDB's "more like this" and broad discovery bring noise; a film the taste
    // space knows and expects the member not to care for is left out. Films it
    // does not know (recent, rare) stay.
    .filter(m => minFit == null || (fit(m.id) ?? Infinity) >= minFit)
    .map(m => ({ ...m, genre_ids: genreIds(m), _thread: (fit(m.id) ?? 0) + qualityScore(m) / 10 }))
    .sort((a, b) => b._thread - a._thread)
    .slice(0, limit);
}
