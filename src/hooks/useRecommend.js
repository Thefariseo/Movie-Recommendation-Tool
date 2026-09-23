// Account-scoped recommendations with stale-request protection.
import { useCallback, useEffect, useRef, useState } from "react";
import {useAuth} from "../contexts/AuthContext";
import useWatched   from "@/hooks/useWatched";
import useWatchlist from "./useWatchlist";
import { getRecommendations, CRITERION_RADIANCE_IDS } from "../algorithms/recommender";
import { movieDetails, movieWatchProviders } from "../utils/api";
import { loadSignals, useSignals } from "../utils/signals";
import { blocked } from "../../shared/signals.js";

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
  // A reason built on the director already names them; saying it twice reads badly.
  const namesDirector = directorName && reason?.includes(directorName);
  return [reason ? `${reason.replace(/[.!?]$/, "")}.` : null, directorName && !namesDirector ? `Directed by ${directorName}.` : null, firstSentence(overview)].filter(Boolean).join(' ');
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

  const prefsKey     = JSON.stringify(prefs);
  const requestVersion = useRef(0);
  const ratingKey = JSON.stringify(watched.map(m => [m.id, m.rated]));
  const signals = useSignals(user?.id);
  // Each explicit refresh is a new round: 0 is the first, stable one.
  const rounds = useRef(0);

  const load = useCallback(async (explore = 0) => {
    const version = ++requestVersion.current;
    if (!watched.length && !watchlist.length) { setList([]); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const recentlyShown = getShownIds(shownKey);

      const ranked = await getRecommendations({
        watched,
        watchlist,
        prefs,
        top,
        recentlyShown,
        signals: await loadSignals(user?.id ?? null),
        explore,
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
        const { score, reason, reasonDetail, isCriterion } = ranked.find((r) => r.id === d.id) || { score: 0, reason: null };
        const director = d.credits?.crew?.find((p) => p.job === "Director");
        const keywords = d.keywords?.keywords || [];
        const year     = d.release_date ? d.release_date.slice(0, 4) : null;

        const narrative = buildNarrative({
          id:           d.id,
          title:        d.title || null,
          year,
          reason:       reasonDetail || reason,
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
          _reasonDetail: reasonDetail || reason,
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
  }, [watched, watchlist, prefsKey, top, region, shownKey, ratingKey, user?.id]);

  useEffect(() => {
    load(0);
    return () => { requestVersion.current++; };
  }, [load]);
  const refresh = useCallback(() => load(++rounds.current), [load]);

  // A film dismissed with "Not for me" leaves the list at once.
  const visible = list.filter((m) => !blocked(signals, m.id));
  return {
    loading,
    error,
    pick: visible[0] || null,
    list: visible.slice(1),
    refresh,
  };
}

