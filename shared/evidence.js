// Signed taste evidence beyond genre and decade: who made a film, who is in it,
// what it is about, and where it comes from. Loved and disliked films both
// count, so a director a member keeps rating low is steered away from rather
// than merely not preferred. Every value rests on the member's own ratings.
import { ratingSignal, ratedOnly, ratingMean } from './taste.js';

// Keywords describing how a film was released rather than what it is about.
const RELEASE_KEYWORDS = new Set(['duringcreditsstinger', 'aftercreditsstinger']);

// Prior strength per signal: how many films of evidence it takes before a value
// approaches the rating signal behind it. A director's style is the most
// consistent thing across films, a country the least.
const PRIOR = { directors: 1, cast: 2, keywords: 2, languages: 2, countries: 3 };

// Top-billed actors say more about a film than the sixth name on the poster.
const billingWeight = i => (i < 2 ? 1 : i < 4 ? .6 : .35);

export function directorsOf(details) {
  return (details?.credits?.crew || []).filter(p => p?.job === 'Director' && p.id != null).map(p => ({ id: Number(p.id), name: p.name }));
}
export function castOf(details) {
  return (details?.credits?.cast || []).filter(p => p?.id != null).slice(0, 6).map((p, i) => ({ id: Number(p.id), name: p.name, weight: billingWeight(i) }));
}
export function keywordsOf(details) {
  const list = details?.keywords?.keywords || details?.keywords?.results || [];
  return list.filter(k => k?.id != null && !RELEASE_KEYWORDS.has(String(k.name || '').toLowerCase())).map(k => ({ id: Number(k.id), name: k.name }));
}
export function countriesOf(details) {
  const codes = details?.origin_country?.length ? details.origin_country : (details?.production_countries || []).map(c => c?.iso_3166_1);
  return [...new Set(codes.filter(c => /^[A-Z]{2}$/.test(c || '')))];
}
export const languageOf = details => (/^[a-z]{2,3}$/.test(details?.original_language || '') ? details.original_language : null);

/**
 * The member's most telling films in both directions, to be fetched in full.
 * A disliked film is as informative as a loved one: it is what keeps a
 * director or a theme the member keeps rating low out of the picks.
 */
export function evidenceSample(library, { loved = 18, disliked = 10 } = {}) {
  const rated = ratedOnly(library);
  const mean = ratingMean(rated);
  const signal = m => ratingSignal(Number(m.rated), mean);
  return [
    ...[...rated].sort((a, b) => b.rated - a.rated).filter(m => signal(m) > .15).slice(0, loved),
    ...[...rated].sort((a, b) => a.rated - b.rated).filter(m => signal(m) < -.15).slice(0, disliked)
  ];
}

/**
 * Aggregate taste evidence from rated films that carry TMDB details.
 * `library` is the member's whole rated history, used only for the rating mean,
 * so a sample of films is judged against the member's usual scale.
 * Each map holds id -> { value in [-1, 1], count, name }.
 */
export function tasteEvidence(films, library = films) {
  const mean = ratingMean(ratedOnly(library));
  const maps = { directors: new Map(), cast: new Map(), keywords: new Map(), languages: new Map(), countries: new Map() };
  const add = (kind, key, signal, weight = 1, name) => {
    const old = maps[kind].get(key) || { sum: 0, count: 0, films: 0, name };
    maps[kind].set(key, { sum: old.sum + signal * weight, count: old.count + weight, films: old.films + 1, name: old.name || name });
  };
  let used = 0;
  for (const film of ratedOnly(films)) {
    const d = film.details;
    if (!d) continue;
    used++;
    const s = ratingSignal(Number(film.rated), mean);
    for (const p of directorsOf(d)) add('directors', p.id, s, 1, p.name);
    for (const p of castOf(d)) add('cast', p.id, s, p.weight, p.name);
    for (const k of keywordsOf(d)) add('keywords', k.id, s, 1, k.name);
    const lang = languageOf(d);
    if (lang) add('languages', lang, s);
    for (const c of countriesOf(d)) add('countries', c, s);
  }
  const shrink = (kind) => new Map([...maps[kind]].map(([key, v]) => [key, { value: v.sum / (v.count + PRIOR[kind]), count: v.films, name: v.name }]));
  return {
    directors: shrink('directors'), cast: shrink('cast'), keywords: shrink('keywords'),
    languages: shrink('languages'), countries: shrink('countries'), films: used, mean
  };
}

const clamp = v => Math.max(-1, Math.min(1, v));
const valueOf = (map, key) => map?.get(key)?.value || 0;

/** A candidate's language affinity. Needs only list metadata, so it can run on every candidate. */
export function languageAffinity(movie, evidence) {
  return valueOf(evidence?.languages, languageOf(movie));
}

/**
 * How a candidate's details line up with the member's evidence, each part in
 * [-1, 1]. Only the parts with some evidence are non-zero, and `because` names
 * the concrete matches worth telling the member about.
 */
export function evidenceMatch(details, evidence) {
  if (!evidence || !details) return { director: 0, cast: 0, keywords: 0, country: 0, because: {} };
  const dirs = directorsOf(details).map(p => ({ ...p, e: evidence.directors.get(p.id) })).filter(p => p.e);
  const director = dirs.length ? clamp(dirs.reduce((s, p) => s + p.e.value, 0) / dirs.length) : 0;

  const cast = castOf(details).map(p => ({ ...p, e: evidence.cast.get(p.id) })).filter(p => p.e);
  const castScore = cast.length ? clamp(cast.reduce((s, p) => s + p.weight * p.e.value, 0) / Math.sqrt(cast.length)) : 0;

  // Divided by the root of all the candidate's keywords, so a film tagged with
  // forty keywords cannot outscore one tagged with eight on volume alone.
  const all = keywordsOf(details);
  const kws = all.map(k => ({ ...k, e: evidence.keywords.get(k.id) })).filter(k => k.e);
  const keywords = kws.length ? clamp(kws.reduce((s, k) => s + k.e.value, 0) / Math.sqrt(all.length)) : 0;

  const countries = countriesOf(details).map(c => valueOf(evidence.countries, c)).filter(v => v !== 0);
  const country = countries.length ? clamp(countries.reduce((a, b) => a + b, 0) / countries.length) : 0;

  // Only well-supported, clearly positive matches are cited: a reason must be
  // something the member's own ratings actually show.
  const lovedDirector = dirs.filter(p => p.e.count >= 2 && p.e.value >= .3).sort((a, b) => b.e.value - a.e.value)[0];
  const lovedCast = cast.filter(p => p.e.count >= 2 && p.e.value >= .3 && p.weight === 1).sort((a, b) => b.e.value - a.e.value)[0];
  const lovedThemes = kws.filter(k => k.e.count >= 2 && k.e.value >= .25).sort((a, b) => b.e.value - a.e.value).slice(0, 2);
  return {
    director, cast: castScore, keywords, country,
    because: {
      director: lovedDirector ? { name: lovedDirector.name, films: lovedDirector.e.count } : null,
      actor: lovedCast ? { name: lovedCast.name, films: lovedCast.e.count } : null,
      themes: lovedThemes.map(k => k.name)
    }
  };
}

/** The member-facing sentence for the strongest cited match, or null. */
export function evidenceReason(because) {
  if (because?.director) return `Directed by ${because.director.name}, whose films you rate highly`;
  if (because?.themes?.length) return `Shares themes from films you rated highly: ${because.themes.join(', ')}`;
  if (because?.actor) return `With ${because.actor.name}, from films you rated highly`;
  return null;
}
