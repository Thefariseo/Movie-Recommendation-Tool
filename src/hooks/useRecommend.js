// =====================================================
// Hook: generate ranked recommendations
// – Builds critic-friend narrative (_narrative) with multi-variant phrases
// – Handles actor reason tags (new in v7)
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
  const map = {
    it: "IT", fr: "FR", de: "DE", es: "ES",
    pt: "BR", ja: "JP", ko: "KR", zh: "CN",
    nl: "NL", sv: "SE", da: "DK", pl: "PL",
  };
  return map[parts[0]] || "US";
}

/* ------------------------------------------------------------------ */
/* Pick a random element from an array                                  */
/* ------------------------------------------------------------------ */
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/* ------------------------------------------------------------------ */
/* Critic-friend narrative builder                                      */
/* Multi-variant phrases so it doesn't feel copy-pasted on every load  */
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

  const dir = directorName ? `, directed by ${directorName}` : "";

  // ── Pattern 1: Director affinity (auto-detected from history)
  // reason: "Nolan's work — you rate it 4.2★ on avg"
  const dirAffinityMatch = reason?.match(/^(.+?)'s work — you rate it ([\d.]+)★ on avg$/);
  if (dirAffinityMatch) {
    const dirN  = directorName || dirAffinityMatch[1];
    const stars = dirAffinityMatch[2];
    return pick([
      `You're a ${dirN} person — ${stars}★ on average. That doesn't happen by accident. This one is ${qualityPhrase(avg)} and sits right in their signature territory. Based on your history with their work, I'd bet on this.`,
      `${stars} stars average for ${dirN}. That kind of consistency tells me something. This is ${qualityPhrase(avg)}, and it's exactly the kind of film that built that reputation. Don't sleep on it.`,
      `You've given ${dirN}'s work ${stars} on average. This is ${qualityPhrase(avg)} — squarely in their wheelhouse. If the name on the poster means anything to you, this one's worth your time.`,
    ]);
  }

  // ── Pattern 2: Similar to a seed film the user rated highly
  const simMatch = reason?.match(/^You gave "(.+?)" ([\d.]+★)/);
  if (simMatch) {
    const [, seedTitle, seedStars] = simMatch;
    return pick([
      `You gave "${seedTitle}" ${seedStars} — I took note. This is ${qualityPhrase(avg)}${dir}, and lives in the same cinematic territory. If that rating was genuine, this should land the same way.`,
      `"${seedTitle}" got ${seedStars} from you. This film shares its DNA — same tonal register, similar craft. It's ${qualityPhrase(avg)}${dir}. Worth a shot.`,
      `Based on your ${seedStars} for "${seedTitle}", this feels like a natural follow-up. ${qualityPhrase(avg).charAt(0).toUpperCase() + qualityPhrase(avg).slice(1)}${dir}. Same kind of film, different story.`,
    ]);
  }

  // ── Pattern 3: Genre taste
  const genreMatch = reason?.match(/^Your top (.+?) taste/);
  if (genreMatch) {
    const genre = genreMatch[1];
    return pick([
      `${genre} is your turf — it shows up consistently in your top-rated films. This is ${qualityPhrase(avg)}${dir}. It fits the profile of what you actually rate well in that space.`,
      `You've got a clear ${genre} streak in your history. This one is ${qualityPhrase(avg)}${dir} — exactly the kind of film that drives that pattern.`,
      `Looking at your ${genre} ratings, you have taste. This is ${qualityPhrase(avg)}${dir}, and it belongs in the same conversation as your favourites in that genre.`,
    ]);
  }

  // ── Pattern 4: Actor affinity (auto-detected)
  // reason: "Cate Blanchett's films — you rate them 4.2★"
  const actorAffinityMatch = reason?.match(/^(.+?)'s films — you rate them ([\d.]+)★$/);
  if (actorAffinityMatch) {
    const actorN = actorAffinityMatch[1];
    const stars  = actorAffinityMatch[2];
    return pick([
      `You clearly respond to ${actorN}'s work — ${stars} stars on average says it all. This is ${qualityPhrase(avg)}${dir}, and ${actorN} is at the centre of it. It fits your pattern.`,
      `${stars}★ for ${actorN}'s films on average. This one is ${qualityPhrase(avg)} and features them in a role that plays to their strengths${dir ? ` — ${directorName} directed` : ""}.`,
      `Your track record with ${actorN}'s films is strong. This is ${qualityPhrase(avg)}${dir}. Given your ratings, it's a natural next watch.`,
    ]);
  }

  // ── Pattern 5: User explicitly picked a director
  if (reason === "From your selected director's filmography" && directorName) {
    return [
      `You asked for ${directorName}'s filmography — here's one of their films.`,
      score ? `It holds ${score} on TMDB.` : null,
      overview ? overview.slice(0, 180) + (overview.length > 180 ? "…" : "") : null,
    ].filter(Boolean).join(" ");
  }

  // ── Pattern 6: User explicitly picked an actor
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
