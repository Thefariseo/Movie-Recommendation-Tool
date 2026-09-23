// Tonight, solo: the member's own recommendations, narrowed to the mood, the
// time they have, the services they pay for and the night's other filters,
// and nudged away from what they watched in the last few days.
import { getRecommendations } from "./recommender";
import { movieDetails, movieWatchProviders } from "../utils/api";
import { loadRatings, withRatings } from "../utils/ratings";
import { genreIds, qualityScore } from "../../shared/taste.js";
import { MOODS, TIMES, ERAS, sameAgain, passesFilters, avoidedGenres } from "../../shared/tonight.js";
import { LOOKS } from "../../shared/visual.js";
import { lookOf } from "../utils/visualStyle";

const PICKS = 5;

/**
 * Options: mood, time, look, providers (ids), region, rent (also count rental
 * and purchase offers), watchlistOnly, exclude (ids already shown tonight),
 * and the shared filters: era, language, minRating, popularity, avoid, gentle.
 */
export async function tonightPicks({
  watched = [], watchlist = [], mood = null, time = null, look = null, providers = [], region = "IT",
  rent = false, watchlistOnly = false, exclude = new Set(), recentlyShown = new Set(), ...filters
} = {}) {
  const genres = MOODS[mood]?.genres || [];
  const max = TIMES[time]?.max || null;
  const banned = avoidedGenres(filters);
  const seen = new Set([...watched.map((m) => Number(m.id)), ...[...exclude].map(Number)]);

  let ordered;
  if (watchlistOnly) {
    // From the member's own list: the recommender's order where it has an
    // opinion, the films' quality otherwise.
    const ranked = await getRecommendations({ watched, watchlist, prefs: { genres }, top: 200, recentlyShown });
    const score = new Map(ranked.map((r) => [Number(r.id), r._score || 0]));
    ordered = watchlist
      .filter((m) => !seen.has(Number(m.id)))
      .map((m) => ({ ...m, _tonight: score.has(Number(m.id)) ? score.get(Number(m.id)) + 10 : qualityScore(m) / 10 }))
      .filter((m) => !genres.length || genreIds(m).some((g) => genres.includes(g)))
      .sort((a, b) => b._tonight - a._tonight);
  } else {
    const ranked = await getRecommendations({
      watched, watchlist, top: 60, recentlyShown: new Set([...recentlyShown, ...exclude]),
      prefs: { genres, era: ERAS[filters.era] ? filters.era : undefined }
    });
    // The library keeps films in the order they were added, so its tail is
    // what the member watched most recently.
    const recent = watched.slice(-3).map((m) => genreIds(m));
    ordered = ranked
      .filter((r) => !seen.has(Number(r.id)) && !(r.genreIds || r.genre_ids || []).some((g) => banned.includes(g)))
      .map((r) => ({ ...r, _tonight: (r._score || 0) - 0.15 * sameAgain(r.genreIds || r.genre_ids, recent) }))
      .sort((a, b) => b._tonight - a._tonight);
  }

  const ratings = await loadRatings(ordered.slice(0, 60).map((r) => r.id));
  const services = new Set(providers.map(Number));
  const picks = [];
  for (let i = 0; i < ordered.length && picks.length < PICKS; i += 6) {
    const batch = await Promise.allSettled(ordered.slice(i, i + 6).map(async (r) => {
      const details = withRatings(await movieDetails(r.id), ratings.get(Number(r.id)));
      if (!passesFilters(details, filters)) return null;
      if (max && (!details.runtime || details.runtime > max)) return null;
      if (LOOKS[look]) {
        const measured = await lookOf(details);
        if (!measured || !LOOKS[look].test(measured)) return null;
      }
      let on = [];
      if (services.size) {
        const offers = await movieWatchProviders(r.id, region);
        const stream = offers.flatrate.filter((p) => services.has(Number(p.provider_id)));
        const other = rent ? [...offers.rent, ...offers.buy].filter((p) => services.has(Number(p.provider_id))) : [];
        on = [...stream.map((p) => ({ ...p, how: "stream" })), ...other.filter((p) => !stream.some((s) => s.provider_id === p.provider_id)).map((p) => ({ ...p, how: "rent" }))];
        if (!on.length) return null;
      }
      return { ...details, ...r, genre_ids: genreIds(details), runtime: details.runtime, providers: on, _reason: r.reason || r._reason || (watchlistOnly ? "From your watchlist" : null), _reasonDetail: r.reasonDetail || r.reason || null };
    }));
    for (const b of batch) if (b.status === "fulfilled" && b.value && picks.length < PICKS) picks.push(b.value);
  }
  return picks;
}
