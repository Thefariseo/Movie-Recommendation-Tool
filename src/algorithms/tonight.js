// Tonight, solo: the member's own recommendations, narrowed to the mood, the
// time they have and the services they pay for, and nudged away from what they
// watched in the last few days.
import { getRecommendations } from "./recommender";
import { movieDetails, movieWatchProviders } from "../utils/api";
import { genreIds } from "../../shared/taste.js";
import { MOODS, TIMES, sameAgain } from "../../shared/tonight.js";

const PICKS = 5;

export async function tonightPicks({ watched = [], watchlist = [], mood = null, time = null, providers = [], region = "IT", recentlyShown = new Set() } = {}) {
  const genres = MOODS[mood]?.genres || [];
  const max = TIMES[time]?.max || null;
  const ranked = await getRecommendations({ watched, watchlist, prefs: { genres }, top: 40, recentlyShown });
  // The library keeps films in the order they were added, so its tail is what
  // the member watched most recently.
  const recent = watched.slice(-3).map((m) => genreIds(m));
  const ordered = ranked
    .map((r) => ({ ...r, _tonight: (r._score || 0) - 0.15 * sameAgain(r.genreIds || r.genre_ids, recent) }))
    .sort((a, b) => b._tonight - a._tonight);
  const services = new Set(providers.map(Number));
  const picks = [];
  for (let i = 0; i < ordered.length && picks.length < PICKS; i += 6) {
    const batch = await Promise.allSettled(ordered.slice(i, i + 6).map(async (r) => {
      const details = await movieDetails(r.id);
      if (max && (!details.runtime || details.runtime > max)) return null;
      let on = [];
      if (services.size) {
        const offers = await movieWatchProviders(r.id, region);
        on = offers.flatrate.filter((p) => services.has(Number(p.provider_id)));
        if (!on.length) return null;
      }
      return { ...details, ...r, genre_ids: genreIds(details), runtime: details.runtime, providers: on, _reason: r.reason, _reasonDetail: r.reasonDetail || r.reason };
    }));
    for (const b of batch) if (b.status === "fulfilled" && b.value && picks.length < PICKS) picks.push(b.value);
  }
  return picks;
}
