// "Tonight": the rules shared by the browser and the server. Moods map to
// genres, a group's votes are tallied with fairness weights, and a member who
// compromised in recent movie nights gets a little more say in the next.

import { genreIds, criticAverage, ratingReach } from './taste.js';

export const MOODS = {
  light: { label: 'Light & fun', genres: [35, 16, 10751] },
  tense: { label: 'Edge of the seat', genres: [53, 80] },
  mindbending: { label: 'Mind-bending', genres: [878, 9648] },
  moving: { label: 'Something moving', genres: [18, 10749] },
  epic: { label: 'Big & epic', genres: [28, 12, 14] },
  dark: { label: 'Dark', genres: [27, 53] },
  curious: { label: 'Learn something', genres: [99, 36] }
};

export const TIMES = {
  short: { label: 'Under 100 min', max: 100 },
  standard: { label: 'Up to 2 hours', max: 125 },
  long: { label: 'No limit', max: null }
};

// Keys match the recommender's era ranges, so the era also narrows discovery.
export const ERAS = {
  classic: { label: 'Classics (before 1980)', to: 1979 },
  '80s90s': { label: "'80s & '90s", from: 1980, to: 1999 },
  '2000s': { label: '2000s', from: 2000, to: 2009 },
  '2010s': { label: '2010s', from: 2010, to: 2019 },
  recent: { label: 'Since 2020', from: 2020 }
};

export const LANGUAGES = {
  en: { label: 'In English', test: (lang) => lang === 'en' },
  foreign: { label: 'Not in English', test: (lang) => !!lang && lang !== 'en' },
  it: { label: 'Italian', test: (lang) => lang === 'it' }
};

export const MIN_RATINGS = [7, 7.5, 8];

// Reach is IMDb votes scaled to TMDB's audience (see ratingReach).
export const POPULARITY = {
  gems: { label: 'Hidden gems', test: (reach) => reach < 2500 },
  crowd: { label: 'Crowd-pleasers', test: (reach) => reach >= 8000 }
};

export const AVOIDABLE = { 27: 'Horror', 53: 'Thriller', 10752: 'War', 80: 'Crime', 10749: 'Romance', 16: 'Animation', 99: 'Documentary', 36: 'History', 37: 'Western', 10402: 'Music' };
// Gentler nights leave out the genres most likely to be violent or frightening.
export const GENTLE_AVOID = [27, 53, 80, 10752];

/** The genres a night's filters rule out. */
export const avoidedGenres = ({ avoid = [], gentle = false } = {}) => [...new Set([...avoid.map(Number), ...(gentle ? GENTLE_AVOID : [])])];

/**
 * Whether a film passes the night's filters. `movie` has TMDB fields and,
 * when known, IMDb/RT ratings. Unknown values never pass a filter that asks
 * for them (no year, no era; no rating, no minimum).
 */
export function passesFilters(movie, { era = null, language = null, minRating = null, popularity = null, avoid = [], gentle = false } = {}) {
  const year = Number(String(movie?.release_date || '').slice(0, 4)) || Number(movie?.year) || null;
  const range = ERAS[era];
  if (range && (!year || (range.from && year < range.from) || (range.to && year > range.to))) return false;
  if (LANGUAGES[language] && !LANGUAGES[language].test(movie?.original_language)) return false;
  if (minRating && criticAverage(movie) < minRating) return false;
  if (POPULARITY[popularity] && !POPULARITY[popularity].test(ratingReach(movie))) return false;
  const banned = avoidedGenres({ avoid, gentle });
  if (banned.length && genreIds(movie).some((g) => banned.includes(g))) return false;
  return true;
}

// -1 no, 1 fine, 2 yes please. Not voting on a film counts as 0.
export const VOTES = [-1, 1, 2];

/**
 * How much each member compromised in the group's recent decided nights:
 * for each night, the gap between the best vote they gave and their vote on
 * the film that won, newest nights counting most. `history` is newest first,
 * each { members, winner, votes: [{ user_id, movie_id, vote }] }.
 */
export function compromise(history, members, { nights = 6, decay = .7 } = {}) {
  const debt = Object.fromEntries(members.map(m => [m, 0]));
  history.slice(0, nights).forEach((night, age) => {
    for (const m of members) {
      if (!night.members?.includes(m)) continue;
      const mine = night.votes.filter(v => v.user_id === m);
      if (!mine.length) continue;
      const best = Math.max(...mine.map(v => v.vote));
      const onWinner = mine.find(v => Number(v.movie_id) === Number(night.winner))?.vote ?? 0;
      debt[m] += Math.max(0, best - onWinner) * decay ** age;
    }
  });
  return debt;
}

/** Vote weights from compromise: 1 for everyone, up to 1.5 for whoever gave up most lately. */
export function fairnessWeights(debt) {
  const values = Object.values(debt);
  const min = Math.min(...values, 0);
  return Object.fromEntries(Object.entries(debt).map(([m, d]) => [m, Number(Math.min(1.5, 1 + .15 * (d - min)).toFixed(2))]));
}

/**
 * Each film's weighted score, best first. Ties go to the film more members
 * accept (no -1), then to the recommender's own order.
 */
export function tally(films, votes, weights = {}) {
  return films.filter(f => !f.reserve).map((f, order) => {
    const mine = votes.filter(v => Number(v.movie_id) === Number(f.id));
    const score = mine.reduce((s, v) => s + (weights[v.user_id] ?? 1) * v.vote, 0);
    const vetoes = mine.filter(v => v.vote < 0).length;
    return { id: Number(f.id), score: Number(score.toFixed(2)), vetoes, voters: mine.length, order };
  }).sort((a, b) => b.score - a.score || a.vetoes - b.vetoes || a.order - b.order);
}

/**
 * Solo nights vary: a candidate sharing most of its genres with what the
 * member watched in the last few days is pushed down a little.
 */
export function sameAgain(genreIds, recentGenres) {
  if (!genreIds?.length || !recentGenres?.length) return 0;
  const recent = new Set(recentGenres.flat());
  return genreIds.filter(g => recent.has(g)).length / genreIds.length;
}

/**
 * How a movie night is decided. "best" takes the most wanted film; the draws
 * leave it to chance, with odds everyone can see before the host draws:
 * weighted by how much the group wants each film, even among the films nobody
 * said no to, or a wild card nobody has seen on the ballot.
 */
export const DRAWS = {
  best: { label: 'Most wanted', hint: 'The film the group wants most wins.', needsVotes: true },
  lottery: { label: 'Weighted draw', hint: 'Every film nobody vetoed can win; the more it is wanted, the better its odds.', needsVotes: true },
  chance: { label: 'Pure chance', hint: 'Equal odds for every film nobody said no to.', needsVotes: false },
  wildcard: { label: 'Wild card', hint: 'A surprise: one of the hidden films picked for your group, not on the ballot.', needsVotes: false }
};

const onBallot = films => films.filter(f => !f.reserve);

/** Each film's chance of winning under a mode, as [{ id, p }] summing to 1. */
export function drawOdds(mode, films, votes = [], weights = {}) {
  const ballot = onBallot(films);
  if (mode === 'wildcard') {
    const reserve = films.filter(f => f.reserve);
    if (reserve.length) return reserve.map(f => ({ id: Number(f.id), p: 1 / reserve.length }));
    mode = 'chance';
  }
  const ranking = tally(ballot, votes, weights);
  if (!ranking.length) return [];
  if (mode === 'best') return [{ id: ranking[0].id, p: 1 }];
  // A film someone said no to only stays in the draw when every film was vetoed.
  const open = ranking.filter(r => r.vetoes === 0);
  const pool = open.length ? open : ranking;
  const weight = r => (mode === 'lottery' ? Math.max(0, r.score) + 0.5 : 1);
  const total = pool.reduce((s, r) => s + weight(r), 0);
  return pool.map(r => ({ id: r.id, p: Number((weight(r) / total).toFixed(4)) }));
}

/** The film a draw lands on, given a uniform random number in [0, 1). */
export function drawWinner(odds, random) {
  let acc = 0;
  for (const o of odds) {
    acc += o.p;
    if (random < acc) return o.id;
  }
  return odds.at(-1)?.id ?? null;
}
