// A cinema season: 8 to 12 films, one a week, chosen along a path through the
// taste map and introduced by the member's critic, followed alone or with
// friends. Week k opens k weeks after the season starts; nothing is locked
// for good, a later week simply has not opened yet.

export const WEEKS = [8, 10, 12];
export const MAX_MEMBERS = 6;
const WEEK = 7 * 86_400_000;

/**
 * The week open now (0-based, capped at the last) and the count of weeks
 * open. `season` is a stored season ({ started_at, season: { weeks } }).
 */
export function seasonWeek(season, now = Date.now()) {
  const n = (season.season?.weeks || season.weeks)?.length || 0;
  const elapsed = Math.floor((now - new Date(season.started_at).getTime()) / WEEK);
  const current = Math.max(0, Math.min(n - 1, elapsed));
  return { current, open: Math.max(1, Math.min(n, elapsed + 1)), finished: elapsed >= n };
}

/** When week k opens. */
export const weekOpens = (season, k) => new Date(new Date(season.started_at).getTime() + k * WEEK);

/**
 * Each member's place in the season: the films they have watched among its
 * weeks. `watched` maps a member id to the set of film ids they watched.
 */
export function seasonProgress(season, members, watched) {
  const ids = season.weeks.map((w) => Number(w.id));
  return Object.fromEntries(members.map((m) => {
    const seen = watched.get(m) || new Set();
    return [m, ids.filter((id) => seen.has(id))];
  }));
}

const firstSentence = (text) => {
  const s = String(text || '').match(/^.+?[.!?](?:\s|$)/);
  return (s ? s[0] : String(text || '').slice(0, 200)).trim();
};

/**
 * The season's notes without the critic (the language model is not
 * configured or failed): honest, plain text built from the films' facts.
 */
export function plainNotes(films, { place = 'new ground' } = {}) {
  return {
    title: `A season of ${place}`,
    introduction: `${films.length} films, one a week, on a path from what you already love towards ${place}. Each week opens a new film; watch it when you can, then compare notes.`,
    weeks: films.map((f, k) => ({
      id: f.id,
      intro: [k === 0 ? 'The season opens close to home.' : k === films.length - 1 ? 'The last stop of the season.' : `Week ${k + 1}, a step further.`, f.director ? `Directed by ${f.director}${f.year ? ` (${f.year})` : ''}.` : null, firstSentence(f.overview)].filter(Boolean).join(' ').slice(0, 360),
      watch_for: '',
      question: k === 0 ? 'What drew you in, and what kept you at a distance?' : `How does it compare with last week's ${films[k - 1].title}?`
    }))
  };
}

const text = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * A season as stored: the films in order (id, title, year, poster) with the
 * critic's notes, bounded. `notes` comes from the critic or plainNotes, and
 * may miss films or carry films that are not in the season: those are ignored.
 */
export function composeSeason(films, notes, { region = null, by = 'critic' } = {}) {
  const byId = new Map((notes?.weeks || []).map((w) => [Number(w.id), w]));
  const plain = plainNotes(films);
  return {
    title: text(notes?.title, 80) || plain.title,
    introduction: text(notes?.introduction, 700) || plain.introduction,
    by,
    region: region ? { id: Number(region.id) || null, genres: (region.genres || []).slice(0, 3).map((g) => text(g, 30)), decade: Number(region.decade) || null } : null,
    weeks: films.map((f, k) => {
      const w = byId.get(Number(f.id)) || plain.weeks[k];
      return {
        id: Number(f.id), title: text(f.title, 200), year: Number(f.year) || null, poster_path: f.poster_path ? text(f.poster_path, 100) : null,
        intro: text(w.intro, 400) || plain.weeks[k].intro,
        watch_for: text(w.watch_for, 200),
        question: text(w.question, 200) || plain.weeks[k].question
      };
    })
  };
}
