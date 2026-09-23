// Taste rules: what the member's critic has learned about them, in a form the
// recommender can use. The critic writes them in words ("loves Kurosawa",
// "avoids gore", "prefers films under two hours"); the server resolves each to
// TMDB ids once, and every recommender then matches films against them.
import { genreIds } from './taste.js';
import { directorsOf, castOf, keywordsOf, countriesOf, languageOf } from './evidence.js';

export const RULE_KINDS = ['genre', 'theme', 'person', 'language', 'country', 'decade', 'runtime'];
export const STANCES = { love: 1, like: 0.5, dislike: -0.5, avoid: -1 };
export const MAX_RULES = 16;

// TMDB's movie genres, by their English names.
export const GENRES = {
  action: 28, adventure: 12, animation: 16, comedy: 35, crime: 80, documentary: 99, drama: 18, family: 10751,
  fantasy: 14, history: 36, horror: 27, music: 10402, mystery: 9648, romance: 10749, 'science fiction': 878,
  'sci-fi': 878, 'tv movie': 10770, thriller: 53, war: 10752, western: 37
};
const GENRE_NAMES = Object.fromEntries(Object.entries(GENRES).filter(([n]) => n !== 'sci-fi').map(([n, id]) => [id, n]));

const LANGUAGE_CODES = ['en', 'it', 'fr', 'de', 'es', 'pt', 'ja', 'ko', 'zh', 'cn', 'hi', 'ru', 'sv', 'da', 'no', 'fi', 'pl', 'nl', 'tr', 'fa', 'ar', 'he', 'th', 'id', 'el', 'hu', 'cs', 'ro', 'uk', 'ta', 'te', 'ml', 'bn', 'vi', 'tl', 'is', 'et', 'ka'];
const COUNTRY_CODES = ['US', 'GB', 'IT', 'FR', 'DE', 'ES', 'PT', 'JP', 'KR', 'CN', 'HK', 'TW', 'IN', 'RU', 'SE', 'DK', 'NO', 'FI', 'PL', 'NL', 'BE', 'TR', 'IR', 'IL', 'TH', 'ID', 'GR', 'HU', 'CZ', 'RO', 'UA', 'MX', 'AR', 'BR', 'CL', 'CO', 'CA', 'AU', 'NZ', 'IE', 'AT', 'CH', 'IS', 'EG', 'NG', 'ZA', 'SN', 'MA', 'TN', 'PH', 'VN'];

let names = null;
function displayNames() {
  if (names) return names;
  const table = (type, codes) => {
    const out = new Map();
    for (const locale of ['en', 'it']) {
      try {
        const d = new Intl.DisplayNames([locale], { type });
        for (const c of codes) {
          const n = d.of(c);
          if (n && n !== c) out.set(n.toLowerCase(), c);
        }
      } catch { /* Without Intl names only codes resolve. */ }
    }
    return out;
  };
  names = { language: table('language', LANGUAGE_CODES), region: table('region', COUNTRY_CODES) };
  return names;
}
const clean = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/** A language name or code ("Japanese", "giapponese", "ja") as an ISO 639-1 code, or null. */
export function languageCode(name) {
  const s = clean(name, 40).toLowerCase().replace(/[- ]?(language|cinema|films?)$/, '').trim();
  if (/^[a-z]{2}$/.test(s)) return s;
  return displayNames().language.get(s) || null;
}
/** A country name or code as an ISO 3166-1 code, or null. */
export function countryCode(name) {
  const s = clean(name, 60);
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase();
  const t = s.toLowerCase();
  const aliases = { usa: 'US', america: 'US', 'united states of america': 'US', uk: 'GB', britain: 'GB', england: 'GB', 'south korea': 'KR', korea: 'KR' };
  return aliases[t] || displayNames().region.get(t) || null;
}

/**
 * What the critic wrote, as a rule with everything but TMDB ids resolved:
 * { kind, name, stance, why, id?, code?, value? }. Returns null for anything
 * malformed. Themes and people still need their TMDB id (see the server).
 */
export function parseRule(raw) {
  const kind = String(raw?.kind || '');
  const stance = String(raw?.stance || '');
  const name = clean(raw?.name, 80);
  if (!RULE_KINDS.includes(kind) || !(stance in STANCES) || !name) return null;
  const base = { kind, name, stance, why: clean(raw?.why, 160) };
  if (kind === 'genre') {
    const id = GENRES[name.toLowerCase()];
    return id ? { ...base, id, name: GENRE_NAMES[id] } : null;
  }
  if (kind === 'language') { const code = languageCode(name); return code ? { ...base, code } : null; }
  if (kind === 'country') { const code = countryCode(name); return code ? { ...base, code } : null; }
  if (kind === 'decade') {
    const m = name.match(/(1[89]\d|20\d)\d/);
    return m ? { ...base, value: Math.floor(Number(m[0]) / 10) * 10, name: `${Math.floor(Number(m[0]) / 10) * 10}s` } : null;
  }
  if (kind === 'runtime') {
    const m = name.match(/\d{2,3}/);
    const value = m ? Number(m[0]) : null;
    // A runtime rule is always "up to N minutes"; its stance says how much it matters.
    return value && value >= 60 && value <= 240 ? { ...base, value, name: `up to ${value} minutes`, stance: STANCES[stance] > 0 ? stance : 'love' } : null;
  }
  return base;
}

/** A stored rule, checked again: never trust what comes back from storage or a client. */
export function validRule(r) {
  if (!r || !RULE_KINDS.includes(r.kind) || !(r.stance in STANCES) || !r.name) return false;
  if (['genre', 'theme', 'person'].includes(r.kind)) return Number.isSafeInteger(Number(r.id)) && Number(r.id) > 0;
  if (r.kind === 'language') return /^[a-z]{2}$/.test(r.code || '');
  if (r.kind === 'country') return /^[A-Z]{2}$/.test(r.code || '');
  return Number.isFinite(Number(r.value));
}

const yearOf = d => Number(String(d?.release_date || '').slice(0, 4)) || null;

/**
 * How a film lines up with the member's rules. `score` is in about [-1, 1];
 * `hits` are the rules it satisfies (for the reason) and `conflicts` the ones
 * it goes against, each { rule, weight }. Works on list results too, with
 * fewer rules checkable (no people, themes or runtime without details).
 */
export function ruleMatch(film, rules = []) {
  const hits = [], conflicts = [];
  if (!film || !rules.length) return { score: 0, hits, conflicts };
  const genres = genreIds(film);
  const themes = new Set(keywordsOf(film).map(k => k.id));
  const directors = new Set(directorsOf(film).map(p => p.id));
  const cast = new Set(castOf(film).slice(0, 4).map(p => p.id));
  const language = languageOf(film);
  const countries = countriesOf(film);
  const year = yearOf(film);
  for (const rule of rules) {
    const w = STANCES[rule.stance] || 0;
    let matched = false, weight = w;
    if (rule.kind === 'genre') { matched = genres.includes(Number(rule.id)); weight = w * 0.5; }
    else if (rule.kind === 'theme') matched = themes.has(Number(rule.id));
    else if (rule.kind === 'person') { matched = directors.has(Number(rule.id)) || cast.has(Number(rule.id)); weight = directors.has(Number(rule.id)) ? w : w * 0.7; }
    else if (rule.kind === 'language') matched = language === rule.code;
    else if (rule.kind === 'country') { matched = countries.includes(rule.code); weight = w * 0.6; }
    else if (rule.kind === 'decade') { matched = year != null && Math.floor(year / 10) * 10 === Number(rule.value); weight = w * 0.4; }
    else if (rule.kind === 'runtime' && film.runtime) {
      // Within the limit is a small plus; well over it goes against the rule.
      if (film.runtime <= rule.value) hits.push({ rule, weight: 0.15 * Math.abs(w) });
      else if (film.runtime > rule.value + 15) conflicts.push({ rule, weight: -0.6 * Math.abs(w) });
      continue;
    }
    if (!matched) continue;
    (weight > 0 ? hits : conflicts).push({ rule, weight });
  }
  const score = Math.max(-1.5, Math.min(1.5, [...hits, ...conflicts].reduce((s, h) => s + h.weight, 0)));
  return { score, hits, conflicts };
}

/** A rule in words, for reasons: "Kurosawa", "slow burn", "Japanese cinema". */
export function ruleLabel(rule) {
  if (rule.kind === 'language') {
    try { return `${new Intl.DisplayNames(['en'], { type: 'language' }).of(rule.code)} cinema`; } catch { return rule.name; }
  }
  if (rule.kind === 'country') {
    try { return `films from ${new Intl.DisplayNames(['en'], { type: 'region' }).of(rule.code)}`; } catch { return rule.name; }
  }
  if (rule.kind === 'genre') return rule.name.replace(/^\w/, c => c.toUpperCase());
  if (rule.kind === 'decade') return `the ${rule.name}`;
  if (rule.kind === 'runtime') return `films ${rule.name}`;
  return rule.name;
}
