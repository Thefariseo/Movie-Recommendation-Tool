// The first picks a member sees, composed rather than just ranked. A diary
// usually has several sides (Ghibli and Nolan and Kurosawa), and a plain
// ranking lets the strongest side take every place. The slate starts with the
// top match, then gives a place to each other side of their taste (a film
// anchored to a different loved film), to a film a close friend loved, to one
// from a territory of the map they have never visited, and to a hidden gem,
// as long as each is still a strong match. The rest follow in order, kept
// varied: near-duplicates and a third film by one director wait their turn.

// How far below the top pick a film may score and still take a role.
const MARGIN = 4;
// Places given by role before the rest follow in order.
const ROLE_PLACES = 6;
// How much a near-duplicate of a film already chosen loses, per unit of similarity.
const SAMENESS = 3;
const SAME_DIRECTOR = 1.5;

/**
 * `movies` sorted by _score, best first. Helpers say whether a film can take
 * a role: anchor(m) -> { id, title } of the loved film behind it;
 * sameSide(a, b) whether two anchors are one side of the taste;
 * circle(m) -> { name } of the friend behind it; territory(m) -> the name of
 * an unvisited territory it belongs to; gem(m) -> true for a less-known film;
 * similar(a, b) -> 0–1 how alike two candidates are. Returns up to `limit`
 * films, those with a role carrying `_role` ({ kind, label }).
 */
export function slate(movies, {
  limit = 12, anchor = () => null, sameSide = (a, b) => a.id === b.id, circle = () => null, territory = () => null,
  gem = () => false, similar = () => 0, recent = new Set(), margin = MARGIN
} = {}) {
  if (!movies.length) return [];
  const [top] = movies;
  const floor = (Number(top._score) || 0) - margin;
  const chosen = [];
  const taken = new Set();
  const directors = new Map();
  const sides = [];
  const take = (m, role) => {
    taken.add(Number(m.id));
    if (m.dirName) directors.set(m.dirName, (directors.get(m.dirName) || 0) + 1);
    const a = anchor(m);
    if (a && !sides.some((s) => sameSide(s, a))) sides.push(a);
    chosen.push({ m, role });
  };
  // A film may take a role while it is a strong match, not a near-duplicate
  // of one already chosen, and not a second film by a director already there.
  // Discovery places (a new territory, a gem) reach a little further down.
  const open = (m, reach = 1) => !taken.has(Number(m.id)) && (Number(m._score) || 0) >= floor - (reach - 1) * margin
    && !(m.dirName && directors.has(m.dirName)) && !chosen.some((c) => similar(c.m, m) >= 0.95);
  take(top, { kind: 'top', label: 'Your top match' });
  const roles = [
    () => { const m = movies.find((x) => open(x) && anchor(x) && !sides.some((s) => sameSide(s, anchor(x)))); return m && [m, { kind: 'because', label: `Because you loved “${anchor(m).title}”` }]; },
    () => { const m = movies.find((x) => open(x) && circle(x)); return m && [m, { kind: 'circle', label: `From your circle: ${circle(m).name}` }]; },
    () => { const m = movies.find((x) => open(x) && anchor(x) && !sides.some((s) => sameSide(s, anchor(x)))); return m && [m, { kind: 'because', label: `Because you loved “${anchor(m).title}”` }]; },
    () => { const m = movies.find((x) => open(x, 1.5) && territory(x)); return m && [m, { kind: 'territory', label: 'New territory for you', place: territory(m) }]; },
    () => { const m = movies.find((x) => open(x, 1.5) && gem(x)); return m && [m, { kind: 'gem', label: 'A hidden gem' }]; },
    () => { const m = movies.find((x) => open(x) && anchor(x) && !sides.some((s) => sameSide(s, anchor(x)))); return m && [m, { kind: 'because', label: `Because you loved “${anchor(m).title}”` }]; }
  ];
  for (const role of roles) {
    if (chosen.length >= ROLE_PLACES) break;
    const found = role();
    if (found) take(...found);
  }
  // The rest in order of score, each losing a little for resembling what is already there.
  const rest = movies.filter((m) => !taken.has(Number(m.id)));
  while (chosen.length < limit && rest.length) {
    let best = 0, bestValue = -Infinity;
    rest.forEach((m, i) => {
      const alike = Math.max(0, ...chosen.map((c) => similar(c.m, m)));
      const value = (Number(m._score) || 0) - SAMENESS * Math.max(0, alike - 0.6) / 0.4
        - (m.dirName && (directors.get(m.dirName) || 0) >= 2 ? SAME_DIRECTOR : 0) - (recent.has(Number(m.id)) ? 2 : 0);
      if (value > bestValue) { best = i; bestValue = value; }
    });
    take(rest.splice(best, 1)[0], null);
  }
  return chosen.map(({ m, role }) => (role ? { ...m, _role: role } : m));
}
