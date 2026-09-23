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
  // Examples are the loved films behind a value, kept so a reason can name the
  // member's own films. A disliked film is never kept as an example.
  const add = (kind, key, signal, weight = 1, name, film) => {
    const old = maps[kind].get(key) || { sum: 0, count: 0, films: 0, name, examples: [] };
    const examples = signal > 0 && film ? [...old.examples, film].sort((a, b) => b.rated - a.rated).slice(0, 3) : old.examples;
    maps[kind].set(key, { sum: old.sum + signal * weight, count: old.count + weight, films: old.films + 1, name: old.name || name, examples });
  };
  let used = 0;
  for (const film of ratedOnly(films)) {
    const d = film.details;
    if (!d) continue;
    used++;
    const s = ratingSignal(Number(film.rated), mean);
    const title = film.title || d.title || d.original_title;
    const example = title ? { title, rated: Number(film.rated) } : null;
    for (const p of directorsOf(d)) add('directors', p.id, s, 1, p.name, example);
    for (const p of castOf(d)) add('cast', p.id, s, p.weight, p.name, example);
    for (const k of keywordsOf(d)) add('keywords', k.id, s, 1, k.name, example);
    const lang = languageOf(d);
    if (lang) add('languages', lang, s, 1, lang, example);
    for (const c of countriesOf(d)) add('countries', c, s);
  }
  const shrink = (kind) => new Map([...maps[kind]].map(([key, v]) => [key, { value: v.sum / (v.count + PRIOR[kind]), count: v.films, name: v.name, examples: v.examples }]));
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
  if (!evidence || !details) return { director: 0, cast: 0, keywords: 0, country: 0, because: { director: null, actor: null, themes: [], language: null } };
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
  // something the member's own ratings actually show, and it names the films.
  const lovedDirector = dirs.filter(p => p.e.count >= 2 && p.e.value >= .3 && p.e.examples.length).sort((a, b) => b.e.value - a.e.value)[0];
  const lovedCast = cast.filter(p => p.e.count >= 2 && p.e.value >= .3 && p.weight === 1 && p.e.examples.length).sort((a, b) => b.e.value - a.e.value)[0];
  const lovedThemes = kws.filter(k => k.e.count >= 2 && k.e.value >= .25 && k.e.examples.length).sort((a, b) => b.e.value - a.e.value).slice(0, 2);
  const lang = evidence.languages.get(languageOf(details));
  // English is the default of most catalogues, so it is not a taste worth naming.
  const lovedLanguage = lang && languageOf(details) !== 'en' && lang.count >= 3 && lang.value >= .3 && lang.examples.length ? lang : null;
  const person = p => ({ name: p.name, films: p.e.count, examples: p.e.examples });
  return {
    director, cast: castScore, keywords, country,
    because: {
      director: lovedDirector ? person(lovedDirector) : null,
      actor: lovedCast ? person(lovedCast) : null,
      themes: lovedThemes.map(k => ({ name: k.name, examples: k.e.examples })),
      language: lovedLanguage ? { code: languageOf(details), films: lovedLanguage.count, examples: lovedLanguage.examples } : null
    }
  };
}

/** A 1-10 rating as the app shows it: half stars out of five. */
export function stars(rated) {
  const n = Number(rated) / 2;
  return `${Number.isInteger(n) ? n : n.toFixed(1)}★`;
}

let languageNames = null;
function languageName(code) {
  try {
    languageNames ??= new Intl.DisplayNames(['en'], { type: 'language' });
    const name = languageNames.of(code);
    return name && name !== code ? name : null;
  } catch {
    return null;
  }
}

const quoted = f => `"${f.title}"`;
// "you gave "Ran" 5★ and "Ikiru" 4.5★"
const gave = films => films.map(f => `${quoted(f)} ${stars(f.rated)}`).join(' and ');
// ""Ran" (5★) and "Ikiru" (4.5★)"
const listed = films => films.map(f => `${quoted(f)} (${stars(f.rated)})`).join(' and ');
const themeList = themes => themes.map(t => t.name).join(' and ');
const distinct = films => [...new Map(films.map(f => [f.title, f])).values()].sort((a, b) => b.rated - a.rated);

/**
 * The reason behind a taste-space pick: the member's own loved films that
 * people with the same taste loved together with it. `films` are the largest
 * contributors, strongest first, each { title, rated }.
 */
export function peerReason(films) {
  if (!films?.length) return null;
  const [first] = films;
  return {
    short: `Fans of "${first.title}" love it — you gave ${stars(first.rated)}`,
    full: `People who loved ${listed(films.slice(0, 2))}, as you did, tend to love this one too.`
  };
}

/**
 * What the member's own ratings say about a film, in two lengths: `short` fits
 * on one line under a poster, `full` explains it where there is room. Every
 * film named is one the member rated, and rated well. Returns null when the
 * evidence is not strong enough to say anything.
 */
export function evidenceReason(because) {
  if (!because) return null;
  const { director, actor, themes = [], language } = because;
  const clauses = [];
  if (director) clauses.push({
    kind: 'director', films: director.examples,
    short: `By ${director.name} — you gave ${gave(director.examples.slice(0, 1))}`,
    full: `By ${director.name}: you gave ${gave(director.examples.slice(0, 2))}.`
  });
  if (themes.length) {
    const films = distinct(themes.flatMap(t => t.examples));
    clauses.push({
      kind: 'themes', films,
      short: `About ${themeList(themes)} — like ${quoted(films[0])} ${stars(films[0].rated)}`,
      full: `About ${themeList(themes)}, like ${listed(films.slice(0, 2))}.`
    });
  }
  if (actor) clauses.push({
    kind: 'actor', films: actor.examples,
    short: `With ${actor.name} — you gave ${gave(actor.examples.slice(0, 1))}`,
    full: `With ${actor.name}, whom you rated highly in ${listed(actor.examples.slice(0, 2))}.`
  });
  const tongue = language && languageName(language.code);
  if (tongue) clauses.push({
    kind: 'language', films: language.examples,
    short: `${tongue} cinema — like ${quoted(language.examples[0])} ${stars(language.examples[0].rated)}`,
    full: `${tongue}-language cinema, which you rate highly: ${listed(language.examples.slice(0, 2))}.`
  });
  if (!clauses.length) return null;
  const [lead, next] = clauses;
  let full = lead.full;
  // A second, different kind of evidence adds depth, named through a film the
  // lead clause has not already cited.
  if (next) {
    const cited = new Set(lead.films.slice(0, 2).map(f => f.title));
    const fresh = next.films.find(f => !cited.has(f.title));
    const also = {
      themes: () => `It is also about ${themeList(themes)}`,
      actor: () => `It also stars ${actor.name}`,
      language: () => `It is also ${tongue}-language cinema`,
      director: () => `It is also by ${director.name}`
    }[next.kind]();
    full += fresh ? ` ${also}, like ${listed([fresh])}.` : ` ${also}.`;
  }
  return { short: lead.short, full };
}
