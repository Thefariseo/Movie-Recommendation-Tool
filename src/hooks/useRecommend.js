// =====================================================
// Hook: generate ranked recommendations
// v9 changes:
// – sessionStorage "recently shown" tracking: shown film IDs are excluded
//   from future calls within the same browser session → genuine variety on refresh
// – richer narrative builder: more patterns, more cinephile vocabulary
// – passes recentlyShown Set to getRecommendations
// – marks returned films as shown after display
// =====================================================
import { useCallback, useEffect, useRef, useState } from "react";
import useWatched   from "@/hooks/useWatched";
import useWatchlist from "./useWatchlist";
import { getRecommendations } from "../algorithms/recommender";
import { movieDetails, movieWatchProviders } from "../utils/api";

/* ------------------------------------------------------------------ */
/* Recently-shown tracking (session-scoped to guarantee fresh picks)   */
/* ------------------------------------------------------------------ */
const SHOWN_KEY = "cs_shown_v9";
const SHOWN_MAX = 120; // keep last 120 shown film IDs

function getShownIds() {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(SHOWN_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

function addShownIds(ids) {
  try {
    const prev    = [...getShownIds()];
    const updated = [...new Set([...prev, ...ids])].slice(-SHOWN_MAX);
    sessionStorage.setItem(SHOWN_KEY, JSON.stringify(updated));
  } catch { /* sessionStorage might be blocked in some browsers */ }
}

/* ------------------------------------------------------------------ */
/* Detect user's streaming region from browser locale                  */
/* ------------------------------------------------------------------ */
function detectCountry() {
  const lang  = (typeof navigator !== "undefined" && navigator.language) || "en-US";
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
/* Helpers                                                              */
/* ------------------------------------------------------------------ */
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/* ------------------------------------------------------------------ */
/* Critic-friend narrative builder                                      */
/* Multi-variant phrasing so text doesn't feel copy-pasted.            */
/* Language is precise, cinephile-appropriate, never generic.          */
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

  // ── Pattern 1: Director affinity (auto-detected)
  const dirAffinityMatch = reason?.match(/^(.+?)'s work — you rate it ([\d.]+)★ on avg$/);
  if (dirAffinityMatch) {
    const dirN  = directorName || dirAffinityMatch[1];
    const stars = dirAffinityMatch[2];
    return pick([
      `You're a ${dirN} person — ${stars}★ on average. That consistency doesn't happen by accident. This is ${qualityPhrase(avg)} and sits squarely in their signature territory.`,
      `${stars} stars average for ${dirN}. That kind of loyalty to a director tells me something real about your taste. This is ${qualityPhrase(avg)} — don't sleep on it.`,
      `You've given ${dirN}'s work ${stars} on average. This is ${qualityPhrase(avg)}. If the name on the poster carries weight for you, this one earns its place.`,
      `${dirN} appears consistently in your top-rated films. This one is ${qualityPhrase(avg)} — right in the centre of what makes their work worth returning to.`,
    ]);
  }

  // ── Pattern 2: Similar to a seed film the user rated highly
  const simMatch = reason?.match(/^You gave "(.+?)" ([\d.]+★)/);
  if (simMatch) {
    const [, seedTitle, seedStars] = simMatch;
    return pick([
      `You gave "${seedTitle}" ${seedStars}. I noticed. This is ${qualityPhrase(avg)}${dir}, and it lives in the same cinematic territory. If that rating was genuine, this should land.`,
      `"${seedTitle}" got ${seedStars} from you. This film shares its DNA — same tonal register, similar craft${dir ? `, from ${directorName}` : ""}. It's ${qualityPhrase(avg)}.`,
      `Based on your ${seedStars} for "${seedTitle}", this is a natural follow-up. ${qualityPhrase(avg).charAt(0).toUpperCase() + qualityPhrase(avg).slice(1)}${dir}. Same kind of film, different story.`,
      `${seedStars} for "${seedTitle}" suggests you respond to this register. This is ${qualityPhrase(avg)}${dir} — similar emotional frequency, different entry point.`,
    ]);
  }

  // ── Pattern 3: Genre taste (with specificity)
  const genreMatch = reason?.match(/^Your top (.+?) taste/);
  if (genreMatch) {
    const genre = genreMatch[1];
    return pick([
      `${genre} is your turf — it shows up consistently in your top-rated films. This is ${qualityPhrase(avg)}${dir}. It fits the profile of what you actually rate well in that space.`,
      `You have a clear ${genre} streak. This one is ${qualityPhrase(avg)}${dir} — exactly the kind of film that drives that pattern.`,
      `Looking at your ${genre} ratings, you have taste. This is ${qualityPhrase(avg)}${dir}, and it belongs in the same conversation as your favourites.`,
      `Your ${genre} history has a consistent quality threshold. This is ${qualityPhrase(avg)}${dir} — it clears it.`,
    ]);
  }

  // ── Pattern 4: Actor affinity (auto-detected)
  const actorAffinityMatch = reason?.match(/^(.+?)'s films — you rate them ([\d.]+)★$/);
  if (actorAffinityMatch) {
    const actorN = actorAffinityMatch[1];
    const stars  = actorAffinityMatch[2];
    return pick([
      `You clearly respond to ${actorN}'s work — ${stars} stars on average says it all. This is ${qualityPhrase(avg)}${dir}, with them in a central role.`,
      `${stars}★ for ${actorN}'s films on average. This one is ${qualityPhrase(avg)} and features them${dir ? ` under ${directorName}` : ""}. Your track record suggests this lands.`,
      `Your ratings for ${actorN}'s films are strong. This is ${qualityPhrase(avg)}${dir}. Given the pattern, it's a natural next watch.`,
    ]);
  }

  // ── Pattern 5: World cinema auteur seed
  const cinephileMatch = reason?.match(/^(.+?) — a cornerstone of world cinema$/);
  if (cinephileMatch) {
    const dirN = cinephileMatch[1];
    return pick([
      `${dirN} is one of cinema's essential voices. This is ${qualityPhrase(avg)} — the kind of film that expands what you think a movie can be.`,
      `If you haven't spent time with ${dirN}'s work, this is the entry point. ${qualityPhrase(avg).charAt(0).toUpperCase() + qualityPhrase(avg).slice(1)} and formally unlike most of what mainstream cinema offers.`,
      `${dirN} occupies a specific place in film history — films that reward patience and attention. This one is ${qualityPhrase(avg)}.`,
    ]);
  }

  // ── Pattern 6: User explicitly picked a director
  if (reason === "From your selected director's filmography" && directorName) {
    return [
      `You asked for ${directorName}'s filmography — here's one of their films.`,
      score ? `It holds ${score} on TMDB.` : null,
      overview ? overview.slice(0, 200) + (overview.length > 200 ? "…" : "") : null,
    ].filter(Boolean).join(" ");
  }

  // ── Pattern 7: User explicitly picked an actor
  if (reason === "From your selected actor's filmography") {
    return [
      directorName ? `Directed by ${directorName}.` : null,
      score ? `Holds ${score} on TMDB.` : null,
      overview ? overview.slice(0, 200) + (overview.length > 200 ? "…" : "") : null,
    ].filter(Boolean).join(" ");
  }

  // ── Fallback: overview
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
      // Pass the current session's shown IDs so the engine avoids them
      const recentlyShown = getShownIds();

      const ranked = await getRecommendations({
        watched, watchlist, prefs, top, recentlyShown,
      });

      // Fetch full details sequentially (respects rate limits via cache)
      const topIds  = ranked.map((r) => r.id);
      const details = [];
      for (const id of topIds) details.push(await movieDetails(id));

      const scored = details.map((d) => {
        const { score, reason } = ranked.find((r) => r.id === d.id) || { score: 0, reason: null };
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

      // Fetch streaming providers for hero pick only
      if (scored.length > 0) {
        try {
          const country   = detectCountry();
          const providers = await movieWatchProviders(scored[0].id, country);
          scored[0]       = { ...scored[0], _providers: providers };
        } catch { /* providers optional */ }
      }

      // Mark all displayed films as shown so next refresh skips them
      addShownIds(topIds);

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
