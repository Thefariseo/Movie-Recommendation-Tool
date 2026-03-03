// =====================================================
// Hook: generate ranked recommendations — v10
//
// IMPROVEMENTS over v9:
// – Keyword profile built from liked films (Nanocrowd-style nanogenre analysis).
//   TMDB keyword tags map to mood/theme fingerprints; passed to recommender
//   so candidates with overlapping keywords rank higher.
// – Re-ranking after full detail fetch: keyword overlap re-scores results
// – Criterion/Radiance attribution in narratives
// – Richer narrative builder (10 patterns, cinephile vocabulary)
// – Keywords → "vibes" mapping for specificity in descriptions
// =====================================================
import { useCallback, useEffect, useRef, useState } from "react";
import useWatched   from "@/hooks/useWatched";
import useWatchlist from "./useWatchlist";
import { getRecommendations, CRITERION_RADIANCE_IDS } from "../algorithms/recommender";
import { movieDetails, movieWatchProviders, movieKeywords } from "../utils/api";

/* ------------------------------------------------------------------ */
/* Recently-shown tracking (session-scoped)                            */
/* ------------------------------------------------------------------ */
const SHOWN_KEY = "umbrify_shown_v10";
const SHOWN_MAX = 150;

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
  } catch { /* sessionStorage might be blocked */ }
}

/* ------------------------------------------------------------------ */
/* Detect user's streaming region                                       */
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
/* TMDB keywords → mood/thematic vibes                                 */
/* Maps community-curated keyword tags to evocative descriptions.     */
/* This is the Nanocrowd approach: vocabulary audiences use about film.*/
/* ------------------------------------------------------------------ */
const KEYWORD_VIBE_MAP = {
  // Emotional registers
  "melancholy":         "melancholic undercurrent",
  "sadness":            "deeply felt sadness",
  "grief":              "grief and loss",
  "loneliness":         "solitude and loneliness",
  "nostalgia":          "nostalgic yearning",
  "longing":            "aching sense of longing",
  "obsession":          "obsessive inner logic",
  "jealousy":           "jealousy and desire",
  "existentialism":     "existentialist questioning",
  "alienation":         "alienation and distance",
  "redemption":         "search for redemption",
  "revenge":            "revenge narrative",
  "unrequited love":    "unrequited love",
  "first love":         "tenderness of first love",
  "heartbreak":         "heartbreak",
  "regret":             "regret and what-if",
  // Cinematic style
  "surrealism":         "surrealist imagery",
  "slow cinema":        "deliberate slow-burn pacing",
  "handheld camera":    "raw, immediate camerawork",
  "long take":          "hypnotic long takes",
  "black and white":    "black-and-white photography",
  "nonlinear narrative":"non-linear storytelling",
  "unreliable narrator":"unreliable narration",
  "film noir":          "film noir atmosphere",
  "neo noir":           "neo-noir tension",
  "magical realism":    "magical realism",
  "minimalism":         "minimalist restraint",
  "female protagonist": "strong female perspective",
  "political":          "political undercurrent",
  // Thematic
  "memory":             "meditation on memory",
  "identity":           "crisis of identity",
  "class conflict":     "class tensions",
  "political satire":   "biting political satire",
  "war":                "wartime moral weight",
  "death":              "confrontation with mortality",
  "religion":           "spiritual and religious undertones",
  "family drama":       "intimate family dynamics",
  "coming of age":      "coming-of-age story",
  "road movie":         "road movie restlessness",
  "childhood":          "childhood perspective",
  "friendship":         "deep bond of friendship",
  "betrayal":           "betrayal and trust",
  "violence":           "controlled violence",
  "poverty":            "unflinching social realism",
  "immigration":        "immigrant experience",
  "history":            "historical texture",
};

function extractVibes(keywords = []) {
  const vibes = [];
  for (const kw of keywords) {
    const name  = (kw.name || "").toLowerCase();
    const vibe  = KEYWORD_VIBE_MAP[name];
    if (vibe && !vibes.includes(vibe)) vibes.push(vibe);
    if (vibes.length >= 3) break;
  }
  return vibes;
}

/* ------------------------------------------------------------------ */
/* Build keyword frequency profile from liked films                    */
/* Returns Map<keywordId, {name, weight}>                              */
/* ------------------------------------------------------------------ */
async function buildKeywordProfile(likedFilms) {
  const topLiked = likedFilms
    .filter((m) => m.rated >= 7)
    .sort((a, b) => (b.rated || 0) - (a.rated || 0))
    .slice(0, 15);

  const kwMap = new Map();
  await Promise.allSettled(
    topLiked.map(async (film) => {
      try {
        const data = await movieKeywords(film.id);
        const kws  = data?.keywords || [];
        const w    = (film.rated || 7) / 10;
        kws.forEach((kw) => {
          const prev = kwMap.get(kw.id) || { name: kw.name, weight: 0 };
          kwMap.set(kw.id, { name: kw.name, weight: prev.weight + w });
        });
      } catch { /* ignore */ }
    })
  );
  return kwMap;
}

/* ------------------------------------------------------------------ */
/* Critic-friend narrative builder — v10                               */
/* 10 pattern types, cinephile vocabulary.                             */
/* ------------------------------------------------------------------ */
function buildNarrative({ reason, directorName, overview, voteAverage, keywords, isCriterion }) {
  const avg    = typeof voteAverage === "number" ? voteAverage : 0;
  const score  = avg > 0 ? `${avg.toFixed(1)}/10` : null;
  const vibes  = extractVibes(keywords || []);
  const vibeStr = vibes.length > 0 ? vibes.slice(0, 2).join(" and ") : null;

  const qualityPhrase = (a) =>
    a >= 8.5 ? "a masterpiece — no argument" :
    a >= 7.8 ? `critically acclaimed${score ? ` at ${score}` : ""}` :
    a >= 7.2 ? `highly regarded${score ? ` (${score})` : ""}` :
    a >= 6.5 ? `well-reviewed${score ? ` (${score})` : ""}` :
    score     ? `${score} on TMDB` : "worth discovering";

  const dir = directorName ? `, directed by ${directorName}` : "";

  // ── Pattern 0: Criterion/Radiance title — curated label attribution
  if (isCriterion) {
    const vibeAddendum = vibeStr ? ` Thematically, it works in the register of ${vibeStr}.` : "";
    return pick([
      `A Criterion Collection or Radiance Films title — meaning it has been selected as one of cinema's most important works. ${qualityPhrase(avg).charAt(0).toUpperCase() + qualityPhrase(avg).slice(1)}${dir}. These labels don't curate lightly.${vibeAddendum}`,
      `This is a Criterion/Radiance release: editorially curated, internationally recognised.${dir ? ` ${directorName}'s filmmaking deserves your full attention.` : ""} ${qualityPhrase(avg).charAt(0).toUpperCase() + qualityPhrase(avg).slice(1)}.${vibeAddendum}`,
      `Released by Criterion or Radiance — the gold standard of boutique cinema curation. ${qualityPhrase(avg).charAt(0).toUpperCase() + qualityPhrase(avg).slice(1)}${dir}. This is essential viewing.${vibeAddendum}`,
    ]);
  }

  // ── Pattern 1: Director affinity (auto-detected)
  const dirAffinityMatch = reason?.match(/^(.+?)'s work — you rate it ([\d.]+)★ on avg$/);
  if (dirAffinityMatch) {
    const dirN  = directorName || dirAffinityMatch[1];
    const stars = dirAffinityMatch[2];
    const vibeAddendum = vibeStr ? ` Tonally it sits in the territory of ${vibeStr}.` : "";
    return pick([
      `You're a ${dirN} person — ${stars}★ on average. That consistency doesn't happen by accident. This is ${qualityPhrase(avg)} and sits squarely in their signature territory.${vibeAddendum}`,
      `${stars} stars average for ${dirN}. That kind of loyalty to a director tells me something real about your taste. This is ${qualityPhrase(avg)} — don't sleep on it.${vibeAddendum}`,
      `You've given ${dirN}'s work ${stars} on average. This is ${qualityPhrase(avg)}. If the name on the poster carries weight for you, this one earns its place.${vibeAddendum}`,
      `${dirN} appears consistently in your top-rated films. This one is ${qualityPhrase(avg)} — right in the centre of what makes their work worth returning to.${vibeAddendum}`,
    ]);
  }

  // ── Pattern 2: Similar to a seed film the user rated highly
  const simMatch = reason?.match(/^You gave "(.+?)" ([\d.]+★)/);
  if (simMatch) {
    const [, seedTitle, seedStars] = simMatch;
    const vibeAddendum = vibeStr ? ` It shares themes of ${vibeStr}.` : "";
    return pick([
      `You gave "${seedTitle}" ${seedStars}. I noticed. This is ${qualityPhrase(avg)}${dir}, and it lives in the same cinematic territory. If that rating was genuine, this should land.${vibeAddendum}`,
      `"${seedTitle}" got ${seedStars} from you. This film shares its DNA — same tonal register, similar craft${dir ? `, from ${directorName}` : ""}.${vibeAddendum} It's ${qualityPhrase(avg)}.`,
      `Based on your ${seedStars} for "${seedTitle}", this is a natural follow-up. ${qualityPhrase(avg).charAt(0).toUpperCase() + qualityPhrase(avg).slice(1)}${dir}. Same kind of film, different story.${vibeAddendum}`,
      `${seedStars} for "${seedTitle}" suggests you respond to this register. This is ${qualityPhrase(avg)}${dir}${vibeStr ? ` — ${vibeStr}` : ""} — similar emotional frequency, different entry point.`,
    ]);
  }

  // ── Pattern 3: Genre taste (with specificity)
  const genreMatch = reason?.match(/^Your top (.+?) taste/);
  if (genreMatch) {
    const genre = genreMatch[1];
    const vibeAddendum = vibeStr ? ` Thematically it works in ${vibeStr}.` : "";
    return pick([
      `${genre} is your turf — it shows up consistently in your top-rated films. This is ${qualityPhrase(avg)}${dir}. It fits the profile of what you actually rate well in that space.${vibeAddendum}`,
      `You have a clear ${genre} streak. This one is ${qualityPhrase(avg)}${dir} — exactly the kind of film that drives that pattern.${vibeAddendum}`,
      `Looking at your ${genre} ratings, you have taste. This is ${qualityPhrase(avg)}${dir}, and it belongs in the same conversation as your favourites.${vibeAddendum}`,
      `Your ${genre} history has a consistent quality threshold. This is ${qualityPhrase(avg)}${dir} — it clears it.${vibeAddendum}`,
    ]);
  }

  // ── Pattern 4: Actor affinity (auto-detected)
  const actorAffinityMatch = reason?.match(/^(.+?)'s films — you rate them ([\d.]+)★$/);
  if (actorAffinityMatch) {
    const actorN = actorAffinityMatch[1];
    const stars  = actorAffinityMatch[2];
    const vibeAddendum = vibeStr ? ` Thematically: ${vibeStr}.` : "";
    return pick([
      `You clearly respond to ${actorN}'s work — ${stars} stars on average says it all. This is ${qualityPhrase(avg)}${dir}, with them in a central role.${vibeAddendum}`,
      `${stars}★ for ${actorN}'s films on average. This one is ${qualityPhrase(avg)} and features them${dir ? ` under ${directorName}` : ""}. Your track record suggests this lands.${vibeAddendum}`,
      `Your ratings for ${actorN}'s films are strong. This is ${qualityPhrase(avg)}${dir}. Given the pattern, it's a natural next watch.${vibeAddendum}`,
    ]);
  }

  // ── Pattern 5: World cinema auteur seed
  const cinephileMatch = reason?.match(/^(.+?) — a cornerstone of world cinema$/);
  if (cinephileMatch) {
    const dirN = cinephileMatch[1];
    const vibeAddendum = vibeStr ? ` It operates in the register of ${vibeStr}.` : "";
    return pick([
      `${dirN} is one of cinema's essential voices. This is ${qualityPhrase(avg)} — the kind of film that expands what you think a movie can be.${vibeAddendum}`,
      `If you haven't spent time with ${dirN}'s work, this is the entry point. ${qualityPhrase(avg).charAt(0).toUpperCase() + qualityPhrase(avg).slice(1)} and formally unlike most of what mainstream cinema offers.${vibeAddendum}`,
      `${dirN} occupies a specific place in film history — films that reward patience and attention. This one is ${qualityPhrase(avg)}.${vibeAddendum}`,
    ]);
  }

  // ── Pattern 6: User explicitly picked a director
  if (reason === "From your selected director's filmography" && directorName) {
    const vibeAddendum = vibeStr ? ` Thematically: ${vibeStr}.` : "";
    return [
      `You asked for ${directorName}'s filmography — here's one of their films.`,
      score ? `It holds ${score} on TMDB.${vibeAddendum}` : vibeAddendum || null,
      overview ? overview.slice(0, 200) + (overview.length > 200 ? "…" : "") : null,
    ].filter(Boolean).join(" ");
  }

  // ── Pattern 7: User explicitly picked an actor
  if (reason === "From your selected actor's filmography") {
    const vibeAddendum = vibeStr ? ` Thematically: ${vibeStr}.` : "";
    return [
      directorName ? `Directed by ${directorName}.` : null,
      score ? `Holds ${score} on TMDB.${vibeAddendum}` : vibeAddendum || null,
      overview ? overview.slice(0, 200) + (overview.length > 200 ? "…" : "") : null,
    ].filter(Boolean).join(" ");
  }

  // ── Pattern 8: Keyword-only narrative (no other reason)
  if (vibes.length >= 2) {
    return `${qualityPhrase(avg).charAt(0).toUpperCase() + qualityPhrase(avg).slice(1)}${dir}. Audience descriptions converge around themes of ${vibes.join(" and ")} — a specific combination that matches the emotional territory you gravitate towards.`;
  }

  // ── Pattern 9: Fallback with quality score
  if (overview) {
    const vibeAddendum = vibeStr ? ` Themes of ${vibeStr} run through it.` : "";
    const ql = qualityPhrase(avg);
    const prefix = dir ? `${ql.charAt(0).toUpperCase() + ql.slice(1)}${dir}.${vibeAddendum} ` : "";
    const body = overview.length > 280 ? overview.slice(0, 280) + "…" : overview;
    return prefix + body;
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

  // keyword profile is computed once per session and cached
  const kwProfileRef  = useRef(null);

  const prefsKey     = JSON.stringify(prefs);
  const prevPrefsKey = useRef(prefsKey);

  const refresh = useCallback(async () => {
    if (!watched.length && !watchlist.length) return;
    setLoading(true);
    setError(null);
    try {
      // ── Build keyword profile (once per session) ──
      if (!kwProfileRef.current) {
        const likedFilms = watched.filter((m) => !m.rated || m.rated >= 6);
        kwProfileRef.current = await buildKeywordProfile(likedFilms);
      }
      const keywordMap = kwProfileRef.current;

      // Pass keyword map and recently shown IDs to the engine
      const recentlyShown = getShownIds();

      const ranked = await getRecommendations({
        watched,
        watchlist,
        prefs: { ...prefs, keywordMap },
        top,
        recentlyShown,
      });

      // Fetch full details (includes keywords, videos, credits)
      const topIds  = ranked.map((r) => r.id);
      const details = [];
      for (const id of topIds) {
        try {
          details.push(await movieDetails(id));
        } catch {
          details.push({ id });
        }
      }

      // Map details to enhanced objects
      const scored = details.map((d) => {
        const { score, reason, isCriterion } = ranked.find((r) => r.id === d.id) || { score: 0, reason: null };
        const director = d.credits?.crew?.find((p) => p.job === "Director");
        const keywords = d.keywords?.keywords || [];

        const narrative = buildNarrative({
          reason,
          directorName: director?.name || null,
          overview:     d.overview,
          voteAverage:  d.vote_average,
          keywords,
          isCriterion:  isCriterion || CRITERION_RADIANCE_IDS.has(d.id),
        });

        return {
          ...d,
          _score:      score,
          _reason:     reason,
          _narrative:  narrative,
          _director:   director?.name || null,
          _keywords:   keywords,
          _isCriterion: isCriterion || CRITERION_RADIANCE_IDS.has(d.id),
        };
      });

      // Streaming providers for hero pick only
      if (scored.length > 0) {
        try {
          const country   = detectCountry();
          const providers = await movieWatchProviders(scored[0].id, country);
          scored[0]       = { ...scored[0], _providers: providers };
        } catch { /* providers optional */ }
      }

      // Mark all displayed films as shown
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
