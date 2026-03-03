// =====================================================
// Hook: generate ranked recommendations — v10.1
//
// CHANGES vs v10:
// – Criterion/Radiance never mentioned as PRIMARY reason.
//   Only a very brief "(Criterion Collection)" suffix at the END
//   for confirmed CC films (Radiance never mentioned).
// – DIRECTOR_STYLE_MAP: each auteur gets a specific style description
//   so director-based narratives sound like a critic, not a template.
// – buildNarrative now receives `title` and `year` → used in narrative text
//   so every comment is grounded in the specific film being recommended.
// – Keywords used as concrete thematic anchors, not just vague "vibes".
// – Overview first sentence extracted and used in fallback patterns.
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

/** Extract the first complete sentence from an overview. */
function firstSentence(text) {
  if (!text) return null;
  const m = text.match(/^.+?[.!?](?:\s|$)/);
  return m ? m[0].trim() : (text.length > 160 ? text.slice(0, 160) + "…" : text);
}

/* ------------------------------------------------------------------ */
/* Criterion Collection IDs for subtle narrative suffix                */
/* (Radiance Films NOT mentioned — these are confirmed CC titles only)*/
/* ------------------------------------------------------------------ */
const CRITERION_ONLY_IDS = new Set([
  // Kurosawa
  346, 548, 11606, 11622, 11617, 11605, 37799,
  // Ozu
  18148, 18149, 47406, 18150, 18151,
  // Mizoguchi
  11616, 11755, 7325,
  // Bergman
  490, 4512, 11391, 11476, 8944, 11406, 11392,
  // Fellini
  4436, 1973, 4549, 9825, 14128,
  // Bresson
  10409, 9819, 11416, 40130,
  // Tarkovsky
  11500, 12601, 14745, 17622,
  // French New Wave
  936, 8202, 3164, 3476, 7577, 9823, 397,
  // Powell & Pressburger
  15121, 29753, 36235, 36269,
  // Italian masters
  11397, 3114, 12155, 8853, 8856, 771, 11659,
  // Buñuel
  10074, 8837, 10120, 10018, 10106, 14571,
  // Early Kubrick
  935, 1283, 3703,
  // Wong Kar-wai
  843, 11104, 11313, 10727, 9625, 11217,
  // Kiarostami
  14339, 7048, 19174, 49076,
  // Lang, Dreyer, Murnau
  665, 981, 9479, 7305, 11380, 11378, 7096, 3061,
  // Renoir
  2851, 16505,
  // Chaplin
  19840, 10520, 11185,
  // De Sica
  771, 11659,
  // Eisenstein
  24973, 25235, 29283,
  // Ray
  14160, 17473, 9507, 30179,
  // Marker, Akerman, Cassavetes
  27532, 30308, 33547, 11593, 12215,
  // Lynch
  9777, 11360, 745,
  // Malick
  8641, 14072, 3782,
  // Gondry / Kaufman
  38, 8679, 1180,
  // Wenders, Herzog
  207, 9376, 11024, 11023,
  // Demy, Rohmer
  18553, 10775, 10473, 10402,
  // Jarmusch
  11098, 9691,
  // Park Chan-wook
  670, 369697,
  // Yang
  86793, 438799,
  // Miyazaki
  129, 128, 10515, 4935, 19982,
  // Almodóvar
  14756, 4563, 10020, 693,
  // Haneke
  44936, 49838, 37165,
  // Tarr
  77414, 43439, 126264,
  // Melville
  14363, 9354,
]);

/* ------------------------------------------------------------------ */
/* Director style descriptions — for specific, critic-style narratives */
/* ------------------------------------------------------------------ */
const DIRECTOR_STYLE_MAP = {
  "Wong Kar-wai":              "his languorous, time-drenched portraits of longing and unrequited love",
  "Ingmar Bergman":            "his unflinching examination of faith, mortality, and the fractures of the human psyche",
  "Federico Fellini":          "his dreamlike, carnivalesque vision of memory and Italian decadence",
  "Andrei Tarkovsky":          "his slow, spiritually charged cinema of time, memory, and transcendence",
  "Yasujirō Ozu":              "his precise, deceptively quiet portraits of family life and generational change",
  "Akira Kurosawa":            "his morally epic, visually commanding humanism",
  "Abbas Kiarostami":          "his quietly philosophical, documentary-inflected meditations on reality and cinema itself",
  "Michael Haneke":            "his cold, methodical dismantling of bourgeois complacency and moral complicity",
  "Bong Joon-ho":              "his genre-bending social satire of class and inequality",
  "Park Chan-wook":            "his formally precise, viscerally controlled cinema of obsession and revenge",
  "Céline Sciamma":            "her tender, exacting portraits of female desire, identity, and looking",
  "Pedro Almodóvar":           "his melodramatic, emotionally vivid explorations of desire, grief, and transformation",
  "Lars von Trier":            "his deliberately provocative, emotionally devastating formal experiments",
  "Claire Denis":              "her elliptical, sensory-driven storytelling and attention to bodies in space",
  "Apichatpong Weerasethakul": "his meditative, myth-saturated slow cinema where the boundaries of dream and reality dissolve",
  "Nuri Bilge Ceylan":         "his Chekhovian, landscape-driven excavations of Turkish society and male existential crisis",
  "Yorgos Lanthimos":          "his cold, formally precise absurdist satire of social rituals and power dynamics",
  "Satyajit Ray":              "his humane, intimately observed neorealist portraits of Indian life",
  "Robert Bresson":            "his radically austere, spiritually charged cinema of minimal expression and transcendence",
  "Hong Sang-soo":             "his minimalist, deceptively casual comedies of romantic confusion and repetition",
  "Lucrecia Martel":           "her elliptical, sensory-rich dissections of Argentine bourgeois life",
  "Hayao Miyazaki":            "his hand-drawn worlds of wonder, ecological anxiety, and the complexity of growing up",
  "Ken Loach":                 "his committed, naturalistic social realism rooted in working-class British experience",
  "Agnès Varda":               "her playfully rigorous, politically alive documentary and fiction filmmaking",
  "Jean-Luc Godard":           "his formally radical, politically charged disassembly of cinema's own language",
  "François Truffaut":         "his tender, semi-autobiographical New Wave storytelling — cinema as lived feeling",
  "Terrence Malick":           "his rapturous, voice-over-driven meditation on memory, nature, and lost innocence",
  "Werner Herzog":             "his obsessive, mythically scaled confrontations between human will and nature",
  "Rainer Werner Fassbinder":  "his melodramatic, politically brutal portraits of power, love, and oppression",
  "Éric Rohmer":               "his witty, dialogue-driven moral tales of love, desire, and self-deception",
  "Jacques Demy":              "his bittersweet, pastel-coloured musical world where love always costs something",
  "Jim Jarmusch":              "his deadpan, deliberately paced celebrations of marginal lives and accidental poetry",
  "Wim Wenders":               "his melancholic, road-drifting cinema of alienation and cultural longing",
  "Kenji Mizoguchi":           "his long-take, deeply compassionate portraits of women in feudal and modern Japan",
  "Chantal Akerman":           "her durational, structurally radical cinema of female experience and domestic time",
  "Béla Tarr":                 "his hypnotic, apocalyptically slow black-and-white cinema of moral and physical decay",
  "Edward Yang":               "his intricate, multi-stranded Taipei canvases of modernity and disconnection",
  "Satyajit Ray":              "his humane, intimately observed portraits of Indian life across class and generation",
  "Pedro Costa":               "his austere, politically fierce films made with non-professional actors in Lisbon's margins",
};

/* ------------------------------------------------------------------ */
/* TMDB keywords → thematic vibes                                      */
/* ------------------------------------------------------------------ */
const KEYWORD_VIBE_MAP = {
  "melancholy":          "melancholy",
  "sadness":             "deep sadness",
  "grief":               "grief and loss",
  "loneliness":          "loneliness",
  "nostalgia":           "nostalgic yearning",
  "longing":             "aching longing",
  "obsession":           "obsession",
  "jealousy":            "jealousy and desire",
  "existentialism":      "existentialist questioning",
  "alienation":          "alienation",
  "redemption":          "search for redemption",
  "revenge":             "revenge",
  "unrequited love":     "unrequited love",
  "first love":          "tenderness of first love",
  "heartbreak":          "heartbreak",
  "regret":              "regret",
  "surrealism":          "surrealist logic",
  "slow cinema":         "slow-burn pacing",
  "handheld camera":     "raw, immediate camerawork",
  "long take":           "hypnotic long takes",
  "black and white":     "black-and-white photography",
  "nonlinear narrative": "non-linear storytelling",
  "film noir":           "noir atmosphere",
  "neo noir":            "neo-noir tension",
  "magical realism":     "magical realism",
  "minimalism":          "minimalist restraint",
  "memory":              "memory",
  "identity":            "identity",
  "class conflict":      "class tensions",
  "political satire":    "political satire",
  "war":                 "wartime moral weight",
  "death":               "mortality",
  "family drama":        "intimate family dynamics",
  "coming of age":       "coming-of-age",
  "road movie":          "road movie restlessness",
  "betrayal":            "betrayal",
  "poverty":             "social realism",
  "immigration":         "immigrant experience",
};

function extractVibes(keywords = []) {
  const vibes = [];
  for (const kw of keywords) {
    const name = (kw.name || "").toLowerCase();
    const vibe = KEYWORD_VIBE_MAP[name];
    if (vibe && !vibes.includes(vibe)) vibes.push(vibe);
    if (vibes.length >= 3) break;
  }
  return vibes;
}

/* ------------------------------------------------------------------ */
/* Build keyword profile from liked films                              */
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
/* Quality phrase helpers                                               */
/* ------------------------------------------------------------------ */
function qualityPhrase(avg) {
  if (avg >= 8.5) return "masterpiece-tier";
  if (avg >= 7.8) return "critically acclaimed";
  if (avg >= 7.2) return "highly regarded";
  if (avg >= 6.5) return "well-reviewed";
  return "worth discovering";
}

function scoreStr(avg) {
  return avg > 0 ? `${avg.toFixed(1)}/10` : null;
}

/* ------------------------------------------------------------------ */
/* Criterion suffix — subtle, at the very end, only if confirmed CC   */
/* ------------------------------------------------------------------ */
function criterionSuffix(id) {
  return CRITERION_ONLY_IDS.has(id) ? " (Criterion Collection)" : "";
}

/* ------------------------------------------------------------------ */
/* Critic-friend narrative builder — v10.1                            */
/* Film-specific: uses title, year, director style, keywords, overview*/
/* ------------------------------------------------------------------ */
function buildNarrative({
  id, title, year, reason,
  directorName, overview, voteAverage, keywords, isCriterion,
}) {
  const avg   = typeof voteAverage === "number" ? voteAverage : 0;
  const score = scoreStr(avg);
  const vibes = extractVibes(keywords || []);
  const titleYear = title ? (year ? `"${title}" (${year})` : `"${title}"`) : null;
  const dirStyle  = directorName ? DIRECTOR_STYLE_MAP[directorName] : null;
  const overviewOpener = firstSentence(overview);
  const cc = criterionSuffix(id);

  /* ── Director affinity (auto-detected from ratings) ── */
  const dirAffinityMatch = reason?.match(/^(.+?)'s work — you rate it ([\d.]+)★ on avg$/);
  if (dirAffinityMatch) {
    const dirN  = directorName || dirAffinityMatch[1];
    const stars = dirAffinityMatch[2];
    const style = dirStyle || `their distinctive cinematic voice`;
    const vibeStr = vibes.length >= 2 ? `It sits in the territory of ${vibes.slice(0, 2).join(" and ")}.` : "";
    return pick([
      `You give ${dirN}'s films ${stars} on average — that consistency tells me something. ${titleYear || "This film"} is ${qualityPhrase(avg)}${score ? ` at ${score}` : ""}. The whole film is built around ${style}. ${vibeStr}`.trim() + cc,
      `${stars}★ average for ${dirN}. ${titleYear || "This"} is exactly the kind of film that drives that pattern — ${score ? `${score} on TMDB, ` : ""}with all the hallmarks of ${style}. ${vibeStr}`.trim() + cc,
      `You're clearly in sync with ${dirN}'s sensibility (${stars}★ avg). ${titleYear ? `${titleYear} is` : "This is"} ${qualityPhrase(avg)} — deep in ${style}. ${vibeStr}`.trim() + cc,
    ]);
  }

  /* ── Similar to a seed film the user rated highly ── */
  const simMatch = reason?.match(/^You gave "(.+?)" ([\d.]+★)/);
  if (simMatch) {
    const [, seedTitle, seedStars] = simMatch;
    const vibeStr = vibes.length >= 2 ? `thematically around ${vibes.slice(0, 2).join(" and ")}` : null;
    const dirNote = dirStyle ? ` Directed by ${directorName} — known for ${dirStyle}.` : (directorName ? ` Directed by ${directorName}.` : "");
    return pick([
      `You gave "${seedTitle}" ${seedStars}. ${titleYear ? `${titleYear}` : "This film"} lives in the same emotional register${vibeStr ? ` — orbiting ${vibeStr}` : ""}. ${qualityPhrase(avg).charAt(0).toUpperCase() + qualityPhrase(avg).slice(1)}${score ? ` (${score})` : ""}.${dirNote}`.trim() + cc,
      `"${seedTitle}" got ${seedStars} from you. ${titleYear || "This"} is ${qualityPhrase(avg)} and shares its DNA${vibeStr ? ` — specifically ${vibeStr}` : ""}.${dirNote}`.trim() + cc,
      `That ${seedStars} for "${seedTitle}" is the signal here. ${titleYear ? `${titleYear}` : "This"} operates ${vibeStr ? `in the same register of ${vibeStr}` : "in very similar territory"} — ${qualityPhrase(avg)}${score ? `, ${score}` : ""}.${dirNote}`.trim() + cc,
    ]);
  }

  /* ── Genre taste match ── */
  const genreMatch = reason?.match(/^Your top (.+?) taste/);
  if (genreMatch) {
    const genre = genreMatch[1];
    const vibeStr = vibes.length >= 2 ? `marked by ${vibes.slice(0, 2).join(" and ")}` : null;
    const dirNote = dirStyle ? ` ${directorName}, known for ${dirStyle}.` : (directorName ? ` Directed by ${directorName}.` : "");
    return pick([
      `${genre} runs deep in your ratings. ${titleYear ? `${titleYear} is` : "This is"} ${qualityPhrase(avg)}${score ? ` (${score})` : ""}${vibeStr ? `, ${vibeStr}` : ""}.${dirNote}`.trim() + cc,
      `Your ${genre} pattern has a clear quality threshold — and this clears it. ${titleYear ? `${titleYear}` : "This film"} is ${qualityPhrase(avg)}${score ? ` at ${score}` : ""}${vibeStr ? `, built around themes of ${vibeStr}` : ""}.${dirNote}`.trim() + cc,
      `Looking at your ${genre} history: you respond to films ${vibeStr ? `marked by ${vibeStr}` : "of real substance"}. ${titleYear ? `${titleYear}` : "This"} is ${qualityPhrase(avg)}${score ? ` (${score})` : ""}.${dirNote}`.trim() + cc,
    ]);
  }

  /* ── Actor affinity ── */
  const actorAffinityMatch = reason?.match(/^(.+?)'s films — you rate them ([\d.]+)★$/);
  if (actorAffinityMatch) {
    const actorN = actorAffinityMatch[1];
    const stars  = actorAffinityMatch[2];
    const dirNote = dirStyle ? ` Directed by ${directorName} — ${dirStyle}.` : (directorName ? ` Directed by ${directorName}.` : "");
    const vibeStr = vibes.length >= 2 ? `It navigates ${vibes.slice(0, 2).join(" and ")}.` : "";
    return [
      `You rate ${actorN}'s films ${stars} on average. ${titleYear ? `${titleYear} has them in a central role` : "They're central here"} — ${qualityPhrase(avg)}${score ? ` at ${score}` : ""}.${dirNote} ${vibeStr}`.trim() + cc,
    ].join("");
  }

  /* ── World cinema auteur seed ── */
  const cinephileMatch = reason?.match(/^(.+?) — a cornerstone of world cinema$/);
  if (cinephileMatch) {
    const dirN  = cinephileMatch[1];
    const style = DIRECTOR_STYLE_MAP[dirN] || `their singular cinematic vision`;
    const vibeStr = vibes.length >= 2 ? ` Thematically: ${vibes.slice(0, 2).join(" and ")}.` : "";
    return pick([
      `${dirN} built a body of work around ${style}. ${titleYear ? `${titleYear} is` : "This is"} ${qualityPhrase(avg)}${score ? ` (${score})` : ""} — the kind of film that genuinely expands what you think cinema can do.${vibeStr}`.trim() + cc,
      `If you haven't spent time with ${dirN}'s cinema, ${titleYear || "this"} is a natural entry point. ${qualityPhrase(avg).charAt(0).toUpperCase() + qualityPhrase(avg).slice(1)}${score ? ` at ${score}` : ""} — built entirely around ${style}.${vibeStr}`.trim() + cc,
    ]);
  }

  /* ── User manually selected a director ── */
  if (reason === "From your selected director's filmography" && directorName) {
    const style = dirStyle || null;
    const opener = overviewOpener || null;
    return [
      `From ${directorName}'s filmography${style ? ` — ${style}` : ""}.`,
      score ? `${qualityPhrase(avg).charAt(0).toUpperCase() + qualityPhrase(avg).slice(1)} at ${score}.` : null,
      opener,
    ].filter(Boolean).join(" ") + cc;
  }

  /* ── User manually selected an actor ── */
  if (reason === "From your selected actor's filmography") {
    const dirNote = directorName ? `Directed by ${directorName}${dirStyle ? `, known for ${dirStyle}` : ""}. ` : "";
    return [
      dirNote,
      score ? `${qualityPhrase(avg).charAt(0).toUpperCase() + qualityPhrase(avg).slice(1)} at ${score}.` : null,
      overviewOpener,
    ].filter(Boolean).join(" ") + cc;
  }

  /* ── Keyword-driven fallback (specific vibes, no category match) ── */
  if (vibes.length >= 2) {
    const dirNote = dirStyle ? `${directorName} — known for ${dirStyle}. ` : (directorName ? `Directed by ${directorName}. ` : "");
    return `${dirNote}${titleYear ? `${titleYear} works in the territory of ` : "Thematically: "}${vibes.slice(0, 3).join(", ")}. ${qualityPhrase(avg).charAt(0).toUpperCase() + qualityPhrase(avg).slice(1)}${score ? ` (${score})` : ""}.${cc}`.trim();
  }

  /* ── Last resort: overview opener + quality ── */
  if (overviewOpener) {
    const dirNote = dirStyle ? ` ${directorName}, working in ${dirStyle}.` : (directorName ? ` Directed by ${directorName}.` : "");
    return `${qualityPhrase(avg).charAt(0).toUpperCase() + qualityPhrase(avg).slice(1)}${score ? ` (${score})` : ""}.${dirNote} ${overviewOpener}`.trim() + cc;
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

  const kwProfileRef = useRef(null);

  const prefsKey     = JSON.stringify(prefs);
  const prevPrefsKey = useRef(prefsKey);

  const refresh = useCallback(async () => {
    if (!watched.length && !watchlist.length) return;
    setLoading(true);
    setError(null);
    try {
      // Build keyword profile once per session
      if (!kwProfileRef.current) {
        const likedFilms = watched.filter((m) => !m.rated || m.rated >= 6);
        kwProfileRef.current = await buildKeywordProfile(likedFilms);
      }
      const keywordMap    = kwProfileRef.current;
      const recentlyShown = getShownIds();

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
      for (const id of topIds) {
        try {
          details.push(await movieDetails(id));
        } catch {
          details.push({ id });
        }
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
          const country   = detectCountry();
          const providers = await movieWatchProviders(scored[0].id, country);
          scored[0]       = { ...scored[0], _providers: providers };
        } catch { /* optional */ }
      }

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
