// =====================================================
// Hook: generate ranked recommendations
// – Builds critic-friend narrative (_narrative)
// – Attaches director name (_director) to each pick
// – Fetches streaming providers (_providers) for hero pick
// =====================================================
import { useCallback, useEffect, useRef, useState } from "react";
import useWatched from "@/hooks/useWatched";
import useWatchlist from "./useWatchlist";
import { getRecommendations } from "../algorithms/recommender";
import { movieDetails, movieWatchProviders } from "../utils/api";

/* ------------------------------------------------------------------ */
/* Detect the user's country from browser locale (for providers)        */
/* ------------------------------------------------------------------ */
function detectCountry() {
  const lang = (typeof navigator !== "undefined" && navigator.language) || "en-US";
  const parts = lang.split("-");
  if (parts.length > 1) return parts[parts.length - 1].toUpperCase();
  // Language-code → most common country fallback
  const map = {
    it: "IT", fr: "FR", de: "DE", es: "ES",
    pt: "BR", ja: "JP", ko: "KR", zh: "CN",
    nl: "NL", sv: "SE", da: "DK", pl: "PL",
  };
  return map[parts[0]] || "US";
}

/* ------------------------------------------------------------------ */
/* Critic-friend narrative builder                                      */
/* Generates 2-3 sentences that sound like a knowledgeable friend.     */
/* ------------------------------------------------------------------ */
function buildNarrative({ reason, directorName, overview, voteAverage }) {
  const avg = typeof voteAverage === "number" ? voteAverage : 0;
  const score = avg > 0 ? `${avg.toFixed(1)}/10` : null;

  const qualityPhrase = (a) =>
    a >= 8.5 ? "a masterpiece — no argument" :
    a >= 7.8 ? `critically acclaimed${score ? ` at ${score}` : ""}` :
    a >= 7.2 ? `highly regarded${score ? ` (${score})` : ""}` :
    a >= 6.5 ? `well-reviewed${score ? ` (${score})` : ""}` :
    score     ? `${score} on TMDB` : "worth discovering";

  // ── Pattern 1: Director affinity (auto-detected from your history)
  // reason: "Nolan's work — you rate it 4.2★ on avg"
  const dirAffinityMatch = reason?.match(/^(.+?)'s work — you rate it ([\d.]+)★ on avg$/);
  if (dirAffinityMatch) {
    const dirN  = directorName || dirAffinityMatch[1];
    const stars = dirAffinityMatch[2];
    return [
      `You're a ${dirN} person — ${stars}★ on average. That doesn't happen by accident.`,
      `This one is ${qualityPhrase(avg)} and sits right in their signature territory.`,
      `Based on your history with their work, I'd bet on this.`,
    ].join(" ");
  }

  // ── Pattern 2: Similar to a seed film the user rated highly
  // reason: 'You gave "Parasite" 5★ — critically acclaimed in the same vein'
  const simMatch = reason?.match(/^You gave "(.+?)" ([\d.]+★)/);
  if (simMatch) {
    const [, seedTitle, seedStars] = simMatch;
    return [
      `You gave "${seedTitle}" ${seedStars} — I took note.`,
      `This is ${qualityPhrase(avg)}${directorName ? `, directed by ${directorName}` : ""}, and lives in the same cinematic territory.`,
      `If that rating was genuine, this should land the same way.`,
    ].join(" ");
  }

  // ── Pattern 3: Genre taste
  // reason: "Your top Drama taste — highly regarded (7.4/10)"
  const genreMatch = reason?.match(/^Your top (.+?) taste/);
  if (genreMatch) {
    const genre = genreMatch[1];
    return [
      `${genre} is your turf — it shows up consistently in your top-rated films.`,
      `This is ${qualityPhrase(avg)}${directorName ? `, directed by ${directorName}` : ""}.`,
      `It fits the profile of what you actually rate well in that space.`,
    ].join(" ");
  }

  // ── Pattern 4: User explicitly picked a director
  if (reason === "From your selected director's filmography" && directorName) {
    return [
      `You asked for ${directorName}'s filmography — here's one of their films.`,
      score ? `It holds ${score} on TMDB.` : null,
      overview ? overview.slice(0, 180) + (overview.length > 180 ? "…" : "") : null,
    ].filter(Boolean).join(" ");
  }

  // ── Pattern 5: User explicitly picked an actor
  if (reason === "From your selected actor's filmography") {
    return [
      directorName ? `Directed by ${directorName}.` : null,
      score ? `Holds ${score} on TMDB.` : null,
      overview ? overview.slice(0, 200) + (overview.length > 200 ? "…" : "") : null,
    ].filter(Boolean).join(" ");
  }

  // ── Fallback: use overview (truncated)
  if (overview) {
    return overview.length > 300 ? overview.slice(0, 300) + "…" : overview;
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* Hook                                                                 */
/* ------------------------------------------------------------------ */

export default function useRecommend({ prefs = {}, top = 10 } = {}) {
  const { watched }   = useWatched();
  const { watchlist } = useWatchlist();

  const [loading, setLoading] = useState(false);
  const [list,    setList]    = useState([]);
  const [error,   setError]   = useState(null);

  const prefsKey     = JSON.stringify(prefs);
  const prevPrefsKey = useRef(prefsKey);

  const refresh = useCallback(async () => {
    if (!watched.length && !watchlist.length) return;
    setLoading(true);
    setError(null);
    try {
      const ranked = await getRecommendations({ watched, watchlist, prefs, top });

      // Fetch full details sequentially (respects API rate limits via cache)
      const topIds  = ranked.map((r) => r.id);
      const details = [];
      for (const id of topIds) details.push(await movieDetails(id));

      const scored = details.map((d) => {
        const { score, reason } = ranked.find((r) => r.id === d.id) || {
          score: 0,
          reason: null,
        };

        const director = d.credits?.crew?.find((p) => p.job === "Director");

        const narrative = buildNarrative({
          reason,
          directorName: director?.name || null,
          overview:     d.overview,
          voteAverage:  d.vote_average,
        });

        return {
          ...d,
          _score:     score,
          _reason:    reason,
          _narrative: narrative,
          _director:  director?.name || null,
        };
      });

      // Fetch streaming providers for the hero pick only (performance)
      if (scored.length > 0) {
        try {
          const country   = detectCountry();
          const providers = await movieWatchProviders(scored[0].id, country);
          scored[0]       = { ...scored[0], _providers: providers };
        } catch { /* providers are optional */ }
      }

      setList(scored);
    } catch (err) {
      console.error("Recommendation failed", err);
      setError(err);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watched, watchlist, prefsKey, top]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    loading,
    error,
    pick: list[0] || null,
    list: list.slice(1),
    refresh,
  };
}
