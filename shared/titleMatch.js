// Which TMDB film an imported diary entry (a title and a year, as Letterboxd
// or a CSV gives them) means. The first result of the right year is not
// enough: a 1975 making-of with no votes would win over Pasolini's Salò,
// dated 1976 on TMDB. Each candidate is scored on its title, its year and how
// well known it is.

const plain = (s) => String(s ?? '')
  .normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();

// Letter pairs of a title, for a similarity that forgives spelling
// (Nostalgia / Nostalghia, Colours / Colors).
const pairs = (s) => { const out = []; for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2)); return out; };
function similarity(a, b) {
  const pa = pairs(a), pb = pairs(b);
  if (!pa.length || !pb.length) return a === b ? 1 : 0;
  const rest = [...pb];
  let common = 0;
  for (const p of pa) { const i = rest.indexOf(p); if (i >= 0) { common++; rest.splice(i, 1); } }
  return (2 * common) / (pa.length + pb.length);
}

/**
 * How well a candidate's titles match: 3 the same, 2.5 nearly (spelling),
 * 1 one starts the other, 0.5 one contains the other, and 1 when nothing in
 * its main titles matches: TMDB found it under another of its titles (Moretti's
 * Caro diario as "Dear Diary").
 */
function titleScore(candidate, wanted) {
  const titles = [candidate.title, candidate.original_title].map(plain).filter(Boolean);
  if (titles.includes(wanted)) return 3;
  if (titles.some((t) => similarity(t, wanted) >= 0.8)) return 2.5;
  if (titles.some((t) => t.startsWith(wanted) || wanted.startsWith(t))) return 1;
  if (titles.some((t) => t.includes(wanted) || wanted.includes(t))) return 0.5;
  return 1;
}

/** 3 the same year, 1.5 a year apart (release dates differ by country), lower further away. */
function yearScore(candidate, year) {
  const y = Number(String(candidate.release_date || '').slice(0, 4));
  if (!year || !y) return 0;
  const gap = Math.abs(y - year);
  return gap === 0 ? 3 : gap === 1 ? 1.5 : gap <= 3 ? 0 : -2;
}

/**
 * The best candidate for { title, year } among TMDB's search results, or
 * null when there are none. Fame (votes) breaks ties and outweighs a one-year gap, up to
 * a point, so an obscure film of the same name and year still wins over a
 * famous one from another decade.
 */
export function bestMatch(candidates, { title, year }) {
  const wanted = plain(title);
  if (!wanted) return null;
  let best = null, bestScore = -Infinity;
  for (const c of candidates || []) {
    if (!c?.id || c.adult) continue;
    const score = titleScore(c, wanted) + yearScore(c, Number(year) || null) + Math.min(2, Math.log10(1 + (Number(c.vote_count) || 0)));
    if (score > bestScore) { best = c; bestScore = score; }
  }
  return best;
}

/**
 * Whether the chosen film is beyond doubt: its title and year are exactly the
 * entry's, and no other candidate comes close on both. Otherwise the import
 * asks the film's Letterboxd page which TMDB film it is.
 */
export function certain(best, candidates, { title, year }) {
  const wanted = plain(title);
  const y = Number(year) || null;
  if (!best || !wanted || titleScore(best, wanted) < 3 || yearScore(best, y) < 3) return false;
  return !(candidates || []).some((c) => c?.id && c.id !== best.id && !c.adult && titleScore(c, wanted) >= 2.5 && yearScore(c, y) >= 1.5);
}
