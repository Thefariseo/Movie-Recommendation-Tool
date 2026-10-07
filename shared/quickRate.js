// Rating films one has seen is what sharpens every pick, so a newcomer is
// offered the films nearly everyone has seen (the taste map's best-known
// films, `landmarks`), and told how well Umbrify knows their taste so far.

/**
 * How well Umbrify knows a member, from how many films they have rated: each
 * level after the first is a fifth of the meter. `fill` is 0 to 1; `toNext`
 * the ratings still needed for the next level (0 at the last).
 */
export const TASTE_LEVELS = [
  { from: 0, label: 'We have not met yet' },
  { from: 1, label: 'Just met' },
  { from: 3, label: 'Getting to know you' },
  { from: 10, label: 'Knows your taste' },
  { from: 25, label: 'Knows you well' },
  { from: 50, label: 'Reads you like a book' }
];

export function tasteLevel(rated) {
  const n = Math.max(0, Math.floor(Number(rated) || 0));
  let level = 0;
  while (level + 1 < TASTE_LEVELS.length && n >= TASTE_LEVELS[level + 1].from) level++;
  const last = level === TASTE_LEVELS.length - 1;
  const from = TASTE_LEVELS[level].from;
  const to = last ? from : TASTE_LEVELS[level + 1].from;
  // Each level reached fills one more fifth; ratings toward the next fill
  // the way to it.
  const fill = last ? 1 : (level + (n - from) / (to - from)) / (TASTE_LEVELS.length - 1);
  return { level, label: TASTE_LEVELS[level].label, fill, toNext: last ? 0 : to - n, next: last ? null : TASTE_LEVELS[level + 1].label };
}

/**
 * The best-known films still worth asking about: not in the member's diary,
 * not dismissed or chosen on their first visit, and not ones they said they
 * have not seen. In the map's order, best known first.
 */
export function filmsToRate(landmarks, { exclude = new Set(), unseen = new Set(), limit = 10 } = {}) {
  const out = [];
  for (const l of landmarks || []) {
    const id = Number(l.id);
    if (!id || exclude.has(id) || unseen.has(id)) continue;
    out.push({ id, title: l.title, year: l.year ?? null });
    if (out.length >= limit) break;
  }
  return out;
}
