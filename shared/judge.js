// The judge: the final word on a shortlisted film, used by every recommender.
// It gathers every independent sign that the member will like a film — what
// people with their taste love, a director or actor they rate highly, themes
// and a language from their loved films, what their critic has learned about
// them, a film their critic recommended, a loved film it is close to — and
// every sign against it. A film several independent signs agree on climbs; one
// held up by a single loose link, or by nothing but its genre, drops. The
// reason names each sign with the member's own films.
import { evidenceMatch, stars } from './evidence.js';
import { ruleMatch, ruleLabel } from './rules.js';
import { peerStrength } from './tasteSpace.js';

// How far each kind of sign must go before it counts as agreeing.
const AGREES = 0.25;
// Score added for the number of independent signs that agree (0, 1, 2, 3, 4+).
// No sign at all means the film is only there for its genre and ratings.
const AGREEMENT = [-0.2, 0, 0.12, 0.22, 0.3];
// The same signed evidence weights the recommender always used, plus the critic's rules.
const WEIGHTS = { director: 0.35, cast: 0.12, keywords: 0.30, country: 0.08, rules: 0.45, conflict: 0.12 };

const quoted = f => `"${f.title}"`;
// ""Ran" (5★) and "Ikiru" (4.5★)"
const listed = films => films.map(f => `${quoted(f)} (${stars(f.rated)})`).join(' and ');
// ""Ran" 5★ and "Ikiru" 4.5★"
const gave = films => films.map(f => `${quoted(f)} ${stars(f.rated)}`).join(' and ');
const clamp01 = v => Math.max(0, Math.min(1, v));

let languageNames = null;
const tongue = code => {
  try { languageNames ??= new Intl.DisplayNames(['en'], { type: 'language' }); return languageNames.of(code); } catch { return code; }
};

/**
 * Judge one film. Inputs, all optional but `details`:
 * - details: the film in full (credits and keywords)
 * - evidence: tasteEvidence of the member
 * - rules: the member's resolved taste rules (shared/rules.js)
 * - peer: { z, films } — the taste-space match and the loved films behind it
 * - signal: { net, sources } from shared/signals.js
 * - seed: { title, rated } when the film came from a loved film's "more like this"
 * - saved: the film is on the member's watchlist
 * Returns { adjust, agree, signs, against, reason: { short, full } | null }.
 */
export function judge({ details, evidence = null, rules = [], peer = null, signal = null, seed = null, saved = false }) {
  const match = evidence ? evidenceMatch(details, evidence) : null;
  const because = match?.because || {};
  const rule = ruleMatch(details, rules);
  const signs = [];
  const against = [];

  if (peer?.z != null && peer.z >= 1.5 && peer.films?.length) {
    const [first, second] = peer.films;
    signs.push({
      kind: 'peers', strength: clamp01(peerStrength(peer.z)),
      short: `Fans of ${quoted(first)} love it — you gave ${stars(first.rated)}`,
      full: `People who loved ${listed([first, second].filter(Boolean))}, as you did, tend to love this one too.`
    });
  }
  if (because.director) {
    const d = because.director;
    signs.push({ kind: 'director', strength: clamp01(match.director), short: `By ${d.name} — you gave ${gave(d.examples.slice(0, 1))}`, full: `By ${d.name}: you gave ${gave(d.examples.slice(0, 2))}.` });
  }
  if (because.actor) {
    const a = because.actor;
    signs.push({ kind: 'actor', strength: clamp01(match.cast), short: `With ${a.name} — you gave ${gave(a.examples.slice(0, 1))}`, full: `With ${a.name}, whom you rated highly in ${listed(a.examples.slice(0, 2))}.` });
  }
  if (because.themes?.length) {
    const names = because.themes.map(t => t.name).join(' and ');
    const films = [...new Map(because.themes.flatMap(t => t.examples).map(f => [f.title, f])).values()].sort((a, b) => b.rated - a.rated);
    signs.push({ kind: 'themes', strength: clamp01(match.keywords * 1.5), short: `About ${names} — like ${gave(films.slice(0, 1))}`, full: `About ${names}, like ${listed(films.slice(0, 2))}.` });
  }
  if (because.language) {
    const l = because.language;
    signs.push({ kind: 'language', strength: 0.4, short: `${tongue(l.code)} cinema — like ${gave(l.examples.slice(0, 1))}`, full: `${tongue(l.code)}-language cinema, which you rate highly: ${listed(l.examples.slice(0, 2))}.` });
  }
  if (rule.hits.length) {
    const best = [...rule.hits].sort((a, b) => b.weight - a.weight);
    const labels = best.slice(0, 2).map(h => ruleLabel(h.rule));
    const why = best.find(h => h.rule.why)?.rule.why;
    signs.push({
      kind: 'critic-notes', strength: clamp01(rule.hits.reduce((s, h) => s + h.weight, 0)),
      short: `Your critic: ${labels.join(', ')}`,
      full: `From what your critic has learned about you: ${labels.join(' and ')}${why ? ` (“${why}”)` : ''}.`
    });
  }
  if (signal?.net > 0 && (signal.sources?.has?.('critic_pick') || signal.sources?.has?.('verdict'))) {
    const pick = signal.sources.has('critic_pick');
    signs.push({ kind: 'critic', strength: signal.net >= 2 ? 0.9 : 0.6, short: pick ? 'Your critic recommended it' : 'Your critic thinks you would like it', full: pick ? 'Your critic recommended it in one of your chats.' : 'Your critic judged it a film for you.' });
  }
  if (seed?.title && Number(seed.rated) >= 8) {
    signs.push({ kind: 'similar', strength: 0.35, short: `More like ${quoted(seed)} — you gave ${stars(seed.rated)}`, full: `It is often recommended alongside ${quoted(seed)}, which you gave ${stars(seed.rated)}.` });
  }
  if (saved) signs.push({ kind: 'watchlist', strength: 0.3, short: 'On your watchlist', full: 'You saved it to your watchlist.' });

  // What goes against the film, in the member's own terms.
  if (match && match.director <= -0.3) against.push({ kind: 'director', text: 'You have rated this director’s films low.' });
  if (match && match.keywords <= -0.25) against.push({ kind: 'themes', text: 'Its themes are ones you tend to rate low.' });
  for (const c of rule.conflicts.slice(0, 2)) against.push({ kind: 'critic-notes', text: `Your critic noted you ${c.rule.stance === 'avoid' ? 'avoid' : 'are not keen on'} ${ruleLabel(c.rule)}.` });
  if (signal?.net < 0 && signal.net > -2) against.push({ kind: 'critic', text: 'Your critic had doubts about it for you.' });

  const agreeing = signs.filter(s => s.strength >= AGREES && s.kind !== 'watchlist');
  const agree = agreeing.length + (signs.some(s => s.kind === 'watchlist') && agreeing.length ? 0.5 : 0);
  const adjust = (match ? WEIGHTS.director * match.director + WEIGHTS.cast * match.cast + WEIGHTS.keywords * match.keywords + WEIGHTS.country * match.country : 0)
    + WEIGHTS.rules * rule.score
    + AGREEMENT[Math.min(AGREEMENT.length - 1, Math.floor(agree))]
    - WEIGHTS.conflict * against.length;

  return { adjust, agree: agreeing.length, signs: agreeing.length ? agreeing : signs, against, reason: describe(agreeing.length ? agreeing : signs, against) };
}

/**
 * The reason in two lengths. With several signs, the short one leads with the
 * strongest and says how many more agree; the full one names each of them.
 */
export function describe(signs, against = []) {
  if (!signs.length) return null;
  const ordered = [...signs].sort((a, b) => b.strength - a.strength);
  const [lead] = ordered;
  const more = ordered.length - 1;
  const short = more > 0 ? `${lead.short} · +${more} more` : lead.short;
  const full = [
    ordered.length > 1 ? `${ordered.length} things point to this film for you.` : null,
    ...ordered.map(s => s.full),
    against.length ? `Worth knowing: ${against.map(a => a.text.replace(/\.$/, '')).join('; ')}.` : null
  ].filter(Boolean).join(' ');
  return { short, full };
}
