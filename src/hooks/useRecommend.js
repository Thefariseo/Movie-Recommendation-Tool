// Account-scoped recommendations with stale-request protection.
import { useCallback, useEffect, useRef, useState } from "react";
import {useAuth} from "../contexts/AuthContext";
import useWatched   from "@/hooks/useWatched";
import useWatchlist from "./useWatchlist";
import { getRecommendations, CRITERION_RADIANCE_IDS } from "../algorithms/recommender";
import { movieDetails, movieWatchProviders, movieKeywords } from "../utils/api";

/* ------------------------------------------------------------------ */
/* Recently-shown tracking (session-scoped)                            */
/* ------------------------------------------------------------------ */
const SHOWN_KEY = "umbrify_shown_v10";
const SHOWN_MAX = 150;

function getShownIds(key = SHOWN_KEY) {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(key) || "[]"));
  } catch {
    return new Set();
  }
}

function addShownIds(ids, key = SHOWN_KEY) {
  try {
    const prev    = [...getShownIds(key)];
    const updated = [...new Set([...prev, ...ids])].slice(-SHOWN_MAX);
    sessionStorage.setItem(key, JSON.stringify(updated));
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
/** Extract the first complete sentence from an overview. */
function firstSentence(text) {
  if (!text) return null;
  const m = text.match(/^.+?[.!?](?:\s|$)/);
  return m ? m[0].trim() : (text.length > 160 ? text.slice(0, 160) + "…" : text);
}

// Explanations use recorded evidence and provider metadata, not invented
// claims about a film's emotional tone or an actor's importance in it.
function buildNarrative({ reason, directorName, overview }) {
  return [reason ? `${reason.replace(/[.!?]$/, "")}.` : null, directorName ? `Directed by ${directorName}.` : null, firstSentence(overview)].filter(Boolean).join(' ');
}
async function buildKeywordProfile(likedFilms) {
  const map = new Map();
  const films = likedFilms.filter(m => m.rated >= 7).sort((a,b) => b.rated-a.rated).slice(0,15);
  for (let i=0; i<films.length; i+=5) {
    const results = await Promise.allSettled(films.slice(i,i+5).map(m => movieKeywords(m.id)));
    results.forEach((r,index) => {
      if (r.status !== 'fulfilled') return;
      for (const kw of r.value?.keywords || []) {
        const old = map.get(kw.id) || {name:kw.name,weight:0};
        map.set(kw.id,{...old,weight:old.weight + films[i+index].rated/10});
      }
    });
  }
  return map;
}

/* ------------------------------------------------------------------ */
/* Hook                                                                 */
/* ------------------------------------------------------------------ */

export default function useRecommend({ prefs = {}, top = 10 } = {}) {
  const {profile, user} = useAuth();
  const shownKey = `${SHOWN_KEY}:${user?.id || "guest"}`;
  const region = profile?.country || detectCountry();
  const { watched }   = useWatched();
  const { watchlist } = useWatchlist();

  const [loading, setLoading] = useState(false);
  const [list,    setList]    = useState([]);
  const [error,   setError]   = useState(null);

  const kwProfileRef = useRef(null);

  const prefsKey     = JSON.stringify(prefs);
  const requestVersion = useRef(0);
  const ratingKey = JSON.stringify(watched.map(m => [m.id, m.rated]));

  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    if (!watched.length && !watchlist.length) { setList([]); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const cacheKey = `${shownKey}:${ratingKey}`;
      let keywordMap = kwProfileRef.current?.key === cacheKey ? kwProfileRef.current.value : null;
      if (!keywordMap) {
        keywordMap = await buildKeywordProfile(watched);
        if (version !== requestVersion.current) return;
        kwProfileRef.current = {key: cacheKey, value: keywordMap};
      }
      const recentlyShown = getShownIds(shownKey);

      const ranked = await getRecommendations({
        watched,
        watchlist,
        prefs: { ...prefs, keywordMap },
        top,
        recentlyShown,
      });

      // Fetch full details (keywords, videos, credits)
      const topIds  = ranked.map((r) => r.id);
      const details = [];
      for (let i = 0; i < topIds.length; i += 5) {
        const batch = await Promise.allSettled(topIds.slice(i, i + 5).map(id => movieDetails(id)));
        for (const r of batch) if (r.status === 'fulfilled') details.push(r.value);
        if (version !== requestVersion.current) return;
      }

      // Build enhanced objects with film-specific narratives
      const scored = details.map((d) => {
        const { score, reason, isCriterion } = ranked.find((r) => r.id === d.id) || { score: 0, reason: null };
        const director = d.credits?.crew?.find((p) => p.job === "Director");
        const keywords = d.keywords?.keywords || [];
        const year     = d.release_date ? d.release_date.slice(0, 4) : null;

        const narrative = buildNarrative({
          id:           d.id,
          title:        d.title || null,
          year,
          reason,
          directorName: director?.name || null,
          overview:     d.overview,
          voteAverage:  d.vote_average,
          keywords,
          isCriterion:  isCriterion || CRITERION_RADIANCE_IDS.has(d.id),
        });

        return {
          ...d,
          _score:       score,
          _reason:      reason,
          _narrative:   narrative,
          _director:    director?.name || null,
          _keywords:    keywords,
          _isCriterion: isCriterion || CRITERION_RADIANCE_IDS.has(d.id),
        };
      });

      // Streaming providers for hero only
      if (scored.length > 0) {
        try {
          const country   = region;
          const providers = await movieWatchProviders(scored[0].id, country);
          scored[0]       = { ...scored[0], _providers: providers };
        } catch { /* optional */ }
      }

      if (version !== requestVersion.current) return;
      addShownIds(scored.map(m => m.id), shownKey);
      setList(scored);
    } catch (err) {
      console.error("Recommendation failed", err);
      if (version === requestVersion.current) setError(err);
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watched, watchlist, prefsKey, top, region, shownKey, ratingKey]);

  useEffect(() => {
    refresh();
    return () => { requestVersion.current++; };
  }, [refresh]);

  return {
    loading,
    error,
    pick: list[0] || null,
    list: list.slice(1),
    refresh,
  };
}

