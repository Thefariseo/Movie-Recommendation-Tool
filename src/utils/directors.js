// What the Journeys page needs to know about directors: the member's signed
// evidence and taste-space fit, the directors their ratings say they love,
// and auteurs they have never tried that the taste space expects them to love.
import { movieDetails, personMovieCredits } from "./api";
import { loadTasteSpace } from "./tasteSpace";
import { tasteEvidence, evidenceSample } from "../../shared/evidence.js";
import { placeMember, affinities, peerStrength } from "../../shared/tasteSpace.js";
import { tasteProfile } from "../../shared/taste.js";
import { CINEPHILE_DIRECTORS } from "../algorithms/recommender";

let cached = { key: null, value: null };

/**
 * Everything director journeys need to know about the member, computed once per library
 * state: signed evidence, the genre and decade profile, and the taste space.
 */
export async function directorContext(watched, watchlist = []) {
  const key = JSON.stringify([watched.map((m) => [m.id, m.rated]), watchlist.map((m) => m.id)]);
  if (cached.key === key) return cached.value;
  const value = (async () => {
    const sample = evidenceSample(watched);
    const details = await Promise.allSettled(sample.map((m) => movieDetails(m.id)));
    const evidence = tasteEvidence(sample.map((m, i) => ({ rated: m.rated, title: m.title, details: details[i].status === "fulfilled" ? details[i].value : null })), watched);
    const space = await loadTasteSpace();
    const member = space && placeMember(space, watched, watchlist.map((m) => m.id));
    const z = member ? affinities(space, member) : null;
    const fit = (id) => {
      const i = z && space.index.get(Number(id));
      return i == null ? null : peerStrength(z[i]);
    };
    return { evidence: evidence.films ? evidence : null, taste: tasteProfile(watched), space, member, z, fit };
  })();
  cached = { key, value };
  return value;
}

/**
 * Directors the member has never watched, the ones whose films the taste
 * space expects them to love most, best first: { id, name, best, score }.
 */
export async function directorsToDiscover(ctx, exclude = new Set(), { limit = 10 } = {}) {
  if (!ctx.member) return [];
  const known = new Set([...(ctx.evidence?.directors?.keys() || [])].map(Number));
  // Eighteen a day, a different handful each day, so the list stays fresh and cheap.
  const day = Math.floor(Date.now() / 86400000);
  const pool = [...new Map(CINEPHILE_DIRECTORS.map((d) => [d.id, d])).values()]
    .filter((d) => !known.has(d.id))
    .sort((a, b) => ((a.id * 7919 + day) % 104729) - ((b.id * 7919 + day) % 104729))
    .slice(0, 18);
  const today = new Date().toISOString().slice(0, 10);
  const credits = await Promise.allSettled(pool.map((d) => personMovieCredits(d.id)));
  return pool.map((d, i) => {
    const films = credits[i].status === "fulfilled" ? (credits[i].value.crew || []).filter((m) => m.job === "Director" && m.poster_path && m.release_date && m.release_date <= today && (m.vote_count || 0) >= 30 && !exclude.has(Number(m.id))) : [];
    const scored = films.map((m) => ({ m, f: ctx.fit(m.id) })).filter((x) => x.f != null).sort((a, b) => b.f - a.f);
    const top = scored.slice(0, 3);
    return { id: d.id, name: d.name, best: top[0]?.m, score: top.length ? top.reduce((s, x) => s + x.f, 0) / top.length : -Infinity };
  }).filter((x) => x.best).sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Directors the member's ratings say they love, strongest first: { id, name, examples }. */
export function lovedDirectors(ctx, { limit = 8 } = {}) {
  return [...(ctx.evidence?.directors || new Map())]
    .filter(([, e]) => e.value >= 0.3 && e.examples?.length)
    .sort((a, b) => b[1].value * Math.sqrt(b[1].count) - a[1].value * Math.sqrt(a[1].count))
    .slice(0, limit)
    .map(([id, e]) => ({ id: Number(id), name: e.name, examples: e.examples }));
}
