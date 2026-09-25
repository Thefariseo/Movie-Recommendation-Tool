// How a film connects to the member's own diary. For each of the rated films
// closest to it, the concrete ties between the two, most telling first: the
// same saga, director, writers, cinematographer, composer or cast, the themes
// they share, how much of their audience they share, where and when they were
// made, and how they look. Then what those films, and the member's ratings of
// them, say about this one. Every sentence names real films and real people.
import { closestInDiary } from './comparables.js';
import { directorsOf, keywordsOf, countriesOf, stars } from './evidence.js';
import { movieYear } from './taste.js';
import { LOOKS, looksOf, lookSimilarity } from './visual.js';
import { similarity } from './tasteSpace.js';

// Keywords that describe how a film came about or was released rather than
// what it is about; sharing one says nothing.
const HOLLOW = new Set([
  'based on novel or book', 'based on comic', 'based on true story', 'based on play or musical', 'sequel', 'prequel',
  'remake', 'woman director', 'duringcreditsstinger', 'aftercreditsstinger', 'anime', 'live action remake',
  'based on short story', 'biography', 'independent film', 'black and white'
]);
// TMDB's tone keywords: how a film feels rather than what it is about.
const TONES = new Set([
  'complex', 'dreary', 'intense', 'suspenseful', 'dramatic', 'inspirational', 'admiring', 'cautionary', 'amused',
  'hopeful', 'provocative', 'playful', 'whimsical', 'melancholy', 'somber', 'tense', 'bold', 'thoughtful', 'sincere',
  'anxious', 'angry', 'sad', 'mysterious', 'romantic', 'hilarious', 'absurd', 'depressing', 'gloomy', 'witty',
  'philosophical', 'introspective', 'bittersweet', 'reflective', 'defiant', 'awestruck', 'joyful', 'frightened'
]);
// Crew roles worth naming, and how each reads in both films.
const CREW = [
  { jobs: ['Screenplay', 'Writer', 'Story', 'Novel', 'Author'], role: 'writer', verb: 'written by', weight: 0.4 },
  { jobs: ['Director of Photography'], role: 'cinematographer', verb: 'shot by', weight: 0.35 },
  { jobs: ['Original Music Composer', 'Music'], role: 'composer', verb: 'music by', weight: 0.3 },
  { jobs: ['Editor'], role: 'editor', verb: 'edited by', weight: 0.15 }
];

const names = (list) => (list.length <= 1 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`);
const quoted = (f) => `“${f.title}”`;
// Several ties in one breath: "both directed by X; Y and Z in both".
const joined = (ties) => ties.map((t) => t.text).join('; ');
let regionNames = null;
const country = (code) => {
  let name = code;
  try { regionNames ??= new Intl.DisplayNames(['en'], { type: 'region' }); name = regionNames.of(code); } catch { /* keep the code */ }
  return /^(United|Netherlands|Czech|Philippines|Dominican)/.test(name) ? `the ${name}` : name;
};

function crewOf(details, jobs) {
  const seen = new Map();
  for (const p of details?.credits?.crew || []) if (jobs.includes(p?.job) && p.id != null) seen.set(Number(p.id), p.name);
  return seen;
}

/**
 * The ties between two films, strongest first: { kind, weight, text }.
 * `a` and `b` are TMDB details (credits and keywords appended); `peer` their
 * taste-space similarity or null; `looks` an optional [lookA, lookB].
 */
export function tiesBetween(a, b, { peer = null, looks = null } = {}) {
  const ties = [];
  const saga = a?.belongs_to_collection;
  if (saga?.id && saga.id === b?.belongs_to_collection?.id) {
    const base = saga.name.replace(/ Collection$/, '');
    const name = /^the /i.test(base) ? `${base} saga` : `the ${base} saga`;
    ties.push({ kind: 'saga', weight: 1, text: `part of ${name}`, name });
  }
  const bDirectors = new Set(directorsOf(b).map((p) => p.id));
  const directors = directorsOf(a).filter((p) => bDirectors.has(p.id)).map((p) => p.name);
  if (directors.length) ties.push({ kind: 'director', weight: 0.8, text: `both directed by ${names(directors)}`, people: directors });

  for (const { jobs, role, verb, weight } of CREW) {
    const mine = crewOf(a, jobs), theirs = crewOf(b, jobs);
    // A director who also wrote both films is already named as the director.
    const shared = [...mine].filter(([id]) => theirs.has(id) && !bDirectors.has(id)).map(([, name]) => name).slice(0, 2);
    if (shared.length) ties.push({ kind: role, weight, text: `${verb} ${names(shared)}`, people: shared });
  }

  // The top eight billed of each, so a lead in one and a supporting part in the other still count.
  const billed = (d) => (d?.credits?.cast || []).slice(0, 8).filter((p) => p?.id != null);
  const bCast = new Set(billed(b).map((p) => Number(p.id)));
  const actors = billed(a).filter((p) => bCast.has(Number(p.id))).map((p) => p.name).slice(0, 3);
  if (actors.length) ties.push({ kind: 'cast', weight: Math.min(0.6, 0.25 * actors.length), text: `${names(actors)} in both`, people: actors });

  const bThemes = new Set(keywordsOf(b).map((k) => k.id));
  const shared = keywordsOf(a).filter((k) => bThemes.has(k.id) && !HOLLOW.has(String(k.name).toLowerCase())).map((k) => String(k.name).toLowerCase());
  // TMDB tags tone ("dreary", "suspenseful") alongside subject; they read differently.
  const themes = shared.filter((k) => !TONES.has(k)).slice(0, 3), tones = shared.filter((k) => TONES.has(k)).slice(0, 2);
  if (themes.length) ties.push({ kind: 'themes', weight: Math.min(0.4, 0.12 * themes.length + 0.04), text: `both about ${names(themes)}`, themes });
  if (tones.length) ties.push({ kind: 'tone', weight: 0.1 * tones.length, text: `both ${names(tones)} in tone` });

  if (peer != null && peer >= 0.45) {
    const text = peer >= 0.75 ? 'loved by almost exactly the same people' : peer >= 0.6 ? 'loved by much the same people' : 'popular with the same audience';
    ties.push({ kind: 'audience', weight: 0.6 * peer, text });
  }

  const ya = movieYear(a), yb = movieYear(b);
  const places = countriesOf(a).filter((c) => countriesOf(b).includes(c));
  if (ya && yb && Math.floor(ya / 10) === Math.floor(yb / 10) && places.length) {
    ties.push({ kind: 'era', weight: 0.12, text: `both made in ${country(places[0])} in the ${Math.floor(ya / 10) * 10}s` });
  }

  if (looks?.[0] && looks?.[1] && lookSimilarity(looks[0], looks[1]) >= 0.7) {
    const both = looksOf(looks[0]).filter((k) => looksOf(looks[1]).includes(k)).map((k) => LOOKS[k].label.toLowerCase());
    if (both.length) ties.push({ kind: 'look', weight: 0.12, text: `the same ${names(both)} look on screen` });
  }
  return ties.sort((x, y) => y.weight - x.weight);
}

// What a 1–10 rating the member gave means, in words.
const feeling = (r) => (r >= 8.5 ? 'loved' : r >= 7 ? 'liked' : r >= 5.5 ? 'were lukewarm about' : 'did not like');
const lean = (r) => (r >= 8 ? 'love' : r >= 6.5 ? 'like' : r >= 5 ? 'feel mixed about' : 'dislike');
// Ties that come from the people who made the films, not from the audience or the look.
const MADE = new Set(['saga', 'director', 'writer', 'cinematographer', 'composer', 'cast']);

/**
 * The member's rated films this film is most tied to, and what they say.
 * - target: the film ({ id, title, genre_ids | genres, release_date })
 * - details: Map of TMDB id -> details, for the target and the diary films
 *   (a film missing from it is still judged by its audience and genres)
 * - watched: the member's diary, { id, title, rated, genres, year, poster }
 * - space: the taste space, or null
 * - looks: optional Map of id -> look
 * - pool: extra diary film ids to consider (films TMDB pairs with this one)
 * - seen: the member's own rating of the film, when they have rated it
 * Returns { links: [{ film, ties, score }], summary, expected, spread } or null.
 */
export function connect({ target, details, watched, space = null, looks = null, pool = [], limit = 4, seen = null }) {
  const rated = watched.filter((m) => Number(m.rated) > 0 && Number(m.id) !== Number(target.id));
  if (!rated.length) return null;
  const near = closestInDiary(space, target, rated, { limit: 12, min: 0.12 });
  const likeness = new Map(near.closest.map((c) => [c.id, c.likeness]));
  const ids = [...new Set([...near.closest.map((c) => c.id), ...pool.map(Number)])];
  const byId = new Map(rated.map((m) => [Number(m.id), m]));
  const mine = details.get(Number(target.id));
  const all = ids.map((id) => byId.get(id)).filter(Boolean).map((film) => {
    const peer = space ? similarity(space, target.id, film.id) : null;
    const theirs = details.get(Number(film.id));
    const ties = mine && theirs
      ? tiesBetween(mine, theirs, { peer, looks: looks && [looks.get(Number(target.id)), looks.get(Number(film.id))] })
      : tiesBetween({}, {}, { peer });
    const score = (likeness.get(Number(film.id)) || 0) + 0.5 * ties.reduce((s, t) => s + t.weight, 0);
    return { film: { id: Number(film.id), title: film.title, rated: Number(film.rated), year: film.year || movieYear(film), poster: film.poster || film.poster_path || null }, ties, score };
  }).filter((l) => l.ties.length).sort((a, b) => b.score - a.score);
  if (!all.length) return null;
  // The rating the most tied films predict, each counted by how strongly it
  // is tied (cubed, so a film's own sequel far outweighs a loose neighbour).
  const top = all.slice(0, 8);
  const weights = top.map((l) => l.score ** 3);
  const total = weights.reduce((s, w) => s + w, 0);
  const expected = top.reduce((s, l, i) => s + weights[i] * l.film.rated, 0) / total;
  const spread = Math.sqrt(top.reduce((s, l, i) => s + weights[i] * (l.film.rated - expected) ** 2, 0) / total);
  const guess = { expected: Number(expected.toFixed(1)), spread: Number(spread.toFixed(1)), count: top.length };
  const links = all.slice(0, limit);
  return { links, summary: summarise(links, guess, Number(seen) || null), ...guess };
}

/**
 * What the closest films, and the member's ratings of them, say about this
 * film: a few sentences, each built on named films. `guess` is the rating
 * they predict ({ expected, spread, count }); `seen` the member's own rating.
 */
export function summarise(links, guess = {}, seen = null) {
  const [first, second] = links;
  const lines = [];
  const made = (l) => l.ties.filter((t) => MADE.has(t.kind));
  const lead = (l) => l.ties[0].text;
  const ratings = links.map((l) => l.film.rated);
  const high = links.filter((l) => l.film.rated >= 8), low = links.filter((l) => l.film.rated <= 5);

  // The strongest tie, stated plainly.
  const saga = first.ties.find((t) => t.kind === 'saga');
  if (saga) {
    const rest = first.ties.filter((t) => t !== saga && MADE.has(t.kind)).slice(0, 2);
    lines.push(`It belongs to ${saga.name}, like ${quoted(first.film)}, which you gave ${stars(first.film.rated)}${rest.length ? `: ${joined(rest)}` : ''}.`);
  } else lines.push(`Its closest film in your diary is ${quoted(first.film)} (${stars(first.film.rated)}): ${joined(first.ties.slice(0, 2))}.`);

  if (high.length && low.length) {
    // The close films pull both ways; say which way this one leans, and why.
    const up = high[0], down = low[0];
    const upMade = made(up).length, downMade = made(down).length;
    const toward = upMade > downMade || (upMade === downMade && up.score >= down.score) ? up : down;
    const other = toward === up ? down : up;
    const because = made(toward)[0]?.text || lead(toward);
    lines.push(`Your nearest films pull both ways: you gave ${quoted(up.film)} ${stars(up.film.rated)} but ${quoted(down.film)} ${stars(down.film.rated)}. It has more in common with ${quoted(toward.film)} (${because}) than with ${quoted(other.film)}, so it leans toward the one you ${toward === up ? 'loved' : 'did not like'}.`);
  } else if (second) {
    const all = ratings.every((r) => r >= 8) ? 'loved' : ratings.every((r) => r >= 7) ? 'liked' : ratings.every((r) => r <= 5) ? 'did not like' : null;
    lines.push(`${quoted(second.film)}, which you ${feeling(second.film.rated)} (${stars(second.film.rated)}), is close too: ${joined(second.ties.slice(0, 2))}.${all ? ` The films closest to it are all ones you ${all}.` : ''}`);
  }

  // Who made it matters more than who watched it: say when the tie is only the audience, or only the subject.
  if (!links.some((l) => made(l).length)) {
    lines.push(links.some((l) => l.ties.some((t) => t.kind === 'audience'))
      ? 'None of the people who made it worked on a film you have rated: the link is the audience that loves both, not the craft.'
      : 'Nothing but its subject ties it to the films you have rated: this would be new ground for you.');
  } else {
    const people = [...new Set(links.flatMap((l) => l.ties.filter((t) => t.people).flatMap((t) => t.people)))];
    const recurring = people.filter((p) => links.filter((l) => l.ties.some((t) => t.people?.includes(p))).length >= 2);
    if (recurring.length) lines.push(`${names(recurring.slice(0, 2))} ${recurring.length > 1 ? 'run' : 'runs'} through several of these films.`);
  }

  if (guess.expected == null || guess.count < 2) return lines;
  if (seen) {
    const gap = seen - guess.expected;
    lines.push(Math.abs(gap) < 1
      ? `You gave it ${stars(seen)}, in line with the films of yours it is tied to.`
      : `You gave it ${stars(seen)}, ${gap > 0 ? 'more' : 'less'} than the films it is tied to would suggest (about ${stars(guess.expected)}): it ${gap > 0 ? 'won you over more than its neighbours did' : 'fell short of its neighbours'}.`);
  } else {
    const certain = guess.spread <= 1.2;
    lines.push(`Weighing the films it is tied to, the closest counting most, you would likely ${lean(guess.expected)} it (about ${stars(guess.expected)})${certain ? '.' : ', though they disagree enough that it could go either way.'}`);
  }
  return lines;
}
