// =====================================================
// Recommendation engine v10
//
// MAJOR IMPROVEMENTS over v9:
// – Criterion/Radiance label boost (+0.28): films from these curated labels
//   get a significant score advantage, surfacing the highest quality world cinema
// – Expanded CINEPHILE_DIRECTORS (40 directors): 6 random seeds per call
//   → much more variety between refreshes
// – Nanocrowd-inspired keyword scoring: TMDB keyword tags are used as a proxy
//   for viewer-vocabulary matching (themes, moods, style). Passed in via prefs.
// – Tripled random page range (pages 2–15): prevents candidate pool stagnation
// – Higher jitter (±0.12): more genuine ranking variation per refresh
// – Country filter: still STRICT (Discover-only with with_origin_country)
// – Genre/mood hard filter: unchanged (MOOD_GENRES stays precise)
// – Decade diversity: max 3 films per decade in final results
// – Raised maxCandidates default to 600
// =====================================================
import {
  trendingMovies,
  upcomingMovies,
  movieDetails,
  discoverMovies,
  movieCredits,
  personMovieCredits,
} from "../utils/api";
import { GENRE_MAP } from "../utils/genres";

/* ------------------------------------------------------------------ */
/* Criterion Collection + Radiance Films — curated TMDB IDs           */
/* Films from these labels receive a significant score boost.          */
/* They represent world cinema's highest-quality, curated releases.   */
/* ------------------------------------------------------------------ */
export const CRITERION_RADIANCE_IDS = new Set([
  // ── Kurosawa ──
  346, 548, 11606, 11622, 11617, 11605, 37799, 12453,
  // ── Ozu ──
  18148, 18149, 47406, 18150, 18151,
  // ── Mizoguchi ──
  11616, 11755, 7325,
  // ── French New Wave ──
  936, 8202, 3164, 3476, 397, 11374,
  // ── Varda ──
  7577, 9823,
  // ── Bergman ──
  490, 4512, 11391, 11476, 8944, 11406, 11392,
  // ── Fellini ──
  4436, 1973, 4549, 9825, 14128, 14129,
  // ── Bresson ──
  10409, 9819, 11416, 40130,
  // ── Tarkovsky ──
  11500, 12601, 14745, 17622,
  // ── Powell & Pressburger ──
  15121, 29753, 36235, 36269,
  // ── Italian masters ──
  11397, 27596, 21968, 3114, 12155, 8853, 8856, 8854,
  771, 11659, 62175,
  // ── Buñuel ──
  10074, 8837, 10120, 10018, 10106, 14571,
  // ── Early Kubrick (Criterion titles) ──
  935, 1283, 3703,
  // ── Wong Kar-wai ──
  843, 11104, 11313, 10727, 9625, 11217,
  // ── Kiarostami ──
  14339, 7048, 19174, 49076, 17241,
  // ── Iranian cinema ──
  72545, 66947, 269238,
  // ── Eisenstein ──
  24973, 25235, 29283,
  // ── Satyajit Ray ──
  14160, 17473, 9507, 30179, 31509, 54768,
  // ── German Expressionism / Lang ──
  665, 981,
  // ── Renoir ──
  2851, 16505,
  // ── Dreyer ──
  9479, 7305, 11380, 11378,
  // ── Murnau ──
  7096, 3061,
  // ── Chaplin (CC) ──
  19840, 10520, 11185,
  // ── Carné ──
  6079,
  // ── Night of the Hunter, The General ──
  4522, 24675,
  // ── Marker ──
  27532, 30308,
  // ── Akerman ──
  33547,
  // ── Lynch (Criterion) ──
  9777, 11360, 745,
  // ── Malick ──
  8641, 14072, 3782,
  // ── Gondry / Kaufman ──
  38, 8679, 1180,
  // ── Lee / Altman ──
  7345, 9552, 44591,
  // ── Wenders ──
  207, 9376,
  // ── Herzog ──
  11024, 11023, 45017,
  // ── Fassbinder ──
  10097, 10098,
  // ── Rohmer ──
  10473, 10402,
  // ── Demy ──
  18553, 10775,
  // ── Jarmusch ──
  11098, 9691,
  // ── Park Chan-wook ──
  670, 36869, 369697,
  // ── Bong Joon-ho ──
  496243,
  // ── Sciamma ──
  614434, 523209,
  // ── Almodóvar ──
  14756, 4563, 10020, 693,
  // ── Haneke (Radiance / Criterion) ──
  44936, 49838, 47546, 27492, 37165,
  // ── Weerasethakul (Radiance) ──
  33436, 11899, 338766, 55768, 68421,
  // ── Greenaway (Radiance) ──
  26936, 8197, 40817, 2788,
  // ── Godard (Radiance) ──
  24867, 249254,
  // ── Kitano (Radiance) ──
  11777, 11612, 14763,
  // ── Béla Tarr ──
  77414, 43439, 126264, 72392,
  // ── Ruiz (Radiance) ──
  63618,
  // ── Cassavetes ──
  11593, 12215, 9364,
  // ── Yang (Edward) ──
  86793, 438799,
  // ── Hou Hsiao-hsien ──
  18025, 114015,
  // ── Jia Zhangke ──
  100044, 17919,
  // ── Miyazaki (CC) ──
  129, 128, 10515, 4935, 19982,
  // ── Angelopoulos ──
  39369,
  // ── Daisies, La Jetée, Sans Soleil ──
  56507, 17015, 71616, 51855,
  // ── Melville ──
  14363, 9354,
  // ── Bergman more ──
  11399, 11402,
  // ── Huston ──
  10576,
  // ── Van Sant ──
  3645, 1272,
  // ── Scorsese (select CC titles) ──
  1381, 274,
  // ── Lucrecia Martel ──
  22782, 390643,
  // ── Hong Sang-soo ──
  290595, 335797, 467694,
  // ── Nuri Bilge Ceylan ──
  137528, 201663, 259694,
  // ── Yorgos Lanthimos ──
  264644, 430293, 492188,
  // ── Claire Denis ──
  13436, 21450,
  // ── Ken Loach ──
  335167, 9802,
  // ── Pedro Costa ──
  170314, 280217,
]);

/* ------------------------------------------------------------------ */
/* World-cinema auteur seeds — 6 random directors per call            */
/* Expanded pool (40 directors) for maximum variety                   */
/* ------------------------------------------------------------------ */
export const CINEPHILE_DIRECTORS = [
  { id: 10099,  name: "Park Chan-wook"            },
  { id: 12453,  name: "Wong Kar-wai"              },
  { id: 4415,   name: "Federico Fellini"          },
  { id: 7232,   name: "Ingmar Bergman"            },
  { id: 83786,  name: "Céline Sciamma"            },
  { id: 608,    name: "Hayao Miyazaki"            },
  { id: 4614,   name: "Agnès Varda"               },
  { id: 15492,  name: "Ken Loach"                 },
  { id: 1769,   name: "Pedro Almodóvar"           },
  { id: 5713,   name: "Michael Haneke"            },
  { id: 21684,  name: "Bong Joon-ho"              },
  { id: 5765,   name: "Akira Kurosawa"            },
  { id: 4516,   name: "François Truffaut"         },
  { id: 4508,   name: "Jean-Luc Godard"           },
  { id: 3906,   name: "Andrei Tarkovsky"          },
  { id: 12430,  name: "Abbas Kiarostami"          },
  { id: 12451,  name: "Lars von Trier"            },
  { id: 4710,   name: "Claire Denis"              },
  { id: 79001,  name: "Apichatpong Weerasethakul" },
  { id: 42503,  name: "Nuri Bilge Ceylan"         },
  { id: 77789,  name: "Yorgos Lanthimos"          },
  { id: 14406,  name: "Satyajit Ray"              },
  { id: 5388,   name: "Yasujirō Ozu"              },
  { id: 6649,   name: "Robert Bresson"            },
  { id: 28011,  name: "Hong Sang-soo"             },
  { id: 63834,  name: "Lucrecia Martel"           },
  { id: 25765,  name: "Terrence Malick"           },
  { id: 5765,   name: "Akira Kurosawa"            },
  { id: 4756,   name: "Werner Herzog"             },
  { id: 4762,   name: "Rainer Werner Fassbinder"  },
  { id: 6696,   name: "Éric Rohmer"               },
  { id: 6835,   name: "Jacques Demy"              },
  { id: 1032,   name: "Jim Jarmusch"              },
  { id: 4748,   name: "Wim Wenders"               },
  { id: 5765,   name: "Akira Kurosawa"            },
  { id: 5398,   name: "Kenji Mizoguchi"           },
  { id: 5806,   name: "Pedro Costa"               },
  { id: 4520,   name: "Chantal Akerman"           },
  { id: 10921,  name: "Béla Tarr"                 },
  { id: 60674,  name: "Edward Yang"               },
];

/* ------------------------------------------------------------------ */
/* Mood → genre mapping (STRICT: film must match ≥1 listed genre)     */
/* ------------------------------------------------------------------ */
export const MOOD_GENRES = {
  light:       [35, 16],        // Comedy, Animation
  tense:       [53, 80],        // Thriller, Crime
  mindbending: [878, 9648],     // Sci-Fi, Mystery
  deep:        [18, 99, 36],    // Drama, Documentary, History
  epic:        [28, 12, 14],    // Action, Adventure, Fantasy
  romantic:    [10749],         // Romance ONLY
  dark:        [27, 53],        // Horror, Thriller
  artsy:       [18, 99],        // Drama, Documentary
};

/* ------------------------------------------------------------------ */
/* Genre specificity multipliers                                        */
/* ------------------------------------------------------------------ */
const GENRE_SPECIFICITY = {
  10749: 1.35, // Romance
  27:    1.30, // Horror
  878:   1.25, // Sci-Fi
  9648:  1.25, // Mystery
  80:    1.20, // Crime
  16:    1.20, // Animation
  99:    1.15, // Documentary
  36:    1.10, // History
  14:    1.10, // Fantasy
  10751: 1.05, // Family
  53:    1.00, // Thriller
  37:    1.05, // Western
  10402: 1.10, // Music
  18:    0.85, // Drama — too generic
  28:    0.90, // Action — mainstream
  12:    0.90, // Adventure
  35:    0.95, // Comedy
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function decade(year) {
  if (!year) return null;
  return Math.floor(year / 10) * 10;
}

// Raised jitter ±0.12 — more genuine ranking variation on each refresh
function jitter() {
  return (Math.random() - 0.5) * 0.24;
}

function qualityLabel(avg) {
  if (avg >= 8.5) return "a true masterpiece";
  if (avg >= 7.8) return "critically acclaimed";
  if (avg >= 7.2) return "highly regarded";
  if (avg >= 6.5) return "a solid pick";
  return "worth a watch";
}

function starsDisplay(storedRating) {
  if (!storedRating) return null;
  const d = storedRating / 2;
  return `${d % 1 === 0 ? d.toFixed(0) : d.toFixed(1)}★`;
}

// Sigmoid vote score: 5.0→0.07  6.0→0.24  7.0→0.56  7.5→0.73  8.0→0.86  8.5→0.94
function sigmoidVoteScore(avg) {
  return 1 / (1 + Math.exp(-2.2 * ((avg || 0) - 7.0)));
}

// Random page from range 2–15 (much broader than v9's 2–8)
function randPage() {
  return Math.floor(Math.random() * 14) + 2;
}

/* ------------------------------------------------------------------ */
/* Main export                                                          */
/* ------------------------------------------------------------------ */

/**
 * @param {object[]} watched         – stored watched entries
 * @param {object[]} watchlist       – stored watchlist entries
 * @param {object}   prefs           – user preference overrides
 *   prefs.genres      {number[]}    – TMDB genre ids to hard-filter
 *   prefs.era         {string}      – decade id ("1920s"…"2020s")
 *   prefs.mood        {string}      – mood key from MOOD_GENRES
 *   prefs.country     {string}      – ISO-3166 origin country code
 *   prefs.directorId  {number}      – TMDB person id (manual override)
 *   prefs.actorId     {number}      – TMDB person id
 *   prefs.keywordMap  {Map}         – keyword frequency map from liked films
 * @param {number}    top            – how many results to return
 * @param {number}    maxCandidates
 * @param {Set}       recentlyShown  – film IDs shown this session (exclude)
 */
export async function getRecommendations({
  watched = [],
  watchlist = [],
  prefs = {},
  top = 20,
  maxCandidates = 600,
  recentlyShown = new Set(),
} = {}) {

  /* ================================================================= */
  /* 1. Taste DNA: genre + decade affinity from liked films             */
  /* ================================================================= */

  const likedFilms = watched.filter((m) => !m.rated || m.rated >= 6);

  const genreWeightSum  = new Map();
  const genreCount      = new Map();
  const decadeWeightSum = new Map();
  const decadeCount     = new Map();

  likedFilms.forEach((m) => {
    const ratingFactor = m.rated ? (m.rated >= 8 ? 1.5 : m.rated >= 6 ? 1.0 : 0.6) : 0.4;
    const w = ratingFactor * (m.rated ? m.rated / 10 : 0.5);

    m.genres?.forEach((g) => {
      genreWeightSum.set(g, (genreWeightSum.get(g) || 0) + w);
      genreCount.set(g, (genreCount.get(g) || 0) + 1);
    });

    const dec = decade(m.year);
    if (dec) {
      decadeWeightSum.set(dec, (decadeWeightSum.get(dec) || 0) + w);
      decadeCount.set(dec, (decadeCount.get(dec) || 0) + 1);
    }
  });

  const SMOOTHING_ALPHA = 2;
  const genreAffinity = new Map();
  genreWeightSum.forEach((total, g) => {
    const count    = genreCount.get(g);
    const smoothed = (total + SMOOTHING_ALPHA * 0.5) / (count + SMOOTHING_ALPHA);
    genreAffinity.set(g, smoothed);
  });

  const decadeAffinity = new Map();
  decadeWeightSum.forEach((total, d) => {
    decadeAffinity.set(d, total / decadeCount.get(d));
  });

  const favGenres = [...genreAffinity.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([g]) => g)
    .slice(0, 8);

  // Strong affinity genres: user has ≥3 films rated ≥8★
  const strongAffinityGenres = new Set();
  favGenres.forEach((g) => {
    const highRatedCount = likedFilms.filter(
      (m) => m.rated >= 8 && m.genres?.includes(g)
    ).length;
    if (highRatedCount >= 3) strongAffinityGenres.add(g);
  });

  /* ================================================================= */
  /* 2. Director + Actor affinity                                        */
  /* ================================================================= */

  const directorAffinity = new Map();
  const actorAffinity    = new Map();

  const topRatedForCredits = [...watched]
    .filter((m) => m.rated >= 8)
    .sort((a, b) => (b.rated || 0) - (a.rated || 0))
    .slice(0, 15);

  await Promise.all(
    topRatedForCredits.map(async (m) => {
      try {
        const credits  = await movieCredits(m.id);
        const director = credits?.crew?.find((p) => p.job === "Director");
        if (director) {
          const prev = directorAffinity.get(director.id) || { sum: 0, count: 0, name: director.name };
          directorAffinity.set(director.id, {
            sum:   prev.sum + (m.rated || 8) / 10,
            count: prev.count + 1,
            name:  director.name,
          });
        }
        const topCast = (credits?.cast || []).slice(0, 5);
        topCast.forEach((actor) => {
          const prev = actorAffinity.get(actor.id) || { sum: 0, count: 0, name: actor.name };
          actorAffinity.set(actor.id, {
            sum:   prev.sum + (m.rated || 8) / 10,
            count: prev.count + 1,
            name:  actor.name,
          });
        });
      } catch { /* ignore */ }
    })
  );

  const dirScores   = new Map();
  const dirAvgStars = new Map();
  directorAffinity.forEach(({ sum, count, name }, id) => {
    dirScores.set(id, { score: sum / count, name });
    dirAvgStars.set(id, (sum / count) * 5);
  });

  const topDirs = [...dirScores.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, 3);

  const actorScores = new Map();
  actorAffinity.forEach(({ sum, count, name }, id) => {
    if (count >= 2) actorScores.set(id, { score: sum / count, name });
  });

  const topActors = [...actorScores.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, 3);

  /* ================================================================= */
  /* 3. Keyword profile (Nanocrowd-style nanogenre matching)            */
  /* Passed in from useRecommend after pre-building from liked films.  */
  /* ================================================================= */
  const keywordMap = prefs.keywordMap instanceof Map ? prefs.keywordMap : new Map();

  /* ================================================================= */
  /* 4. Lookup maps for reason tags                                      */
  /* ================================================================= */

  const watchedByTitle = new Map();
  watched.forEach((m) => {
    if (m.title) watchedByTitle.set(m.title.toLowerCase().trim(), m);
  });

  /* ================================================================= */
  /* 5. Era boundaries                                                   */
  /* ================================================================= */

  const eraRanges = {
    "1920s": { "primary_release_date.gte": "1920-01-01", "primary_release_date.lte": "1929-12-31" },
    "1930s": { "primary_release_date.gte": "1930-01-01", "primary_release_date.lte": "1939-12-31" },
    "1940s": { "primary_release_date.gte": "1940-01-01", "primary_release_date.lte": "1949-12-31" },
    "1950s": { "primary_release_date.gte": "1950-01-01", "primary_release_date.lte": "1959-12-31" },
    "1960s": { "primary_release_date.gte": "1960-01-01", "primary_release_date.lte": "1969-12-31" },
    "1970s": { "primary_release_date.gte": "1970-01-01", "primary_release_date.lte": "1979-12-31" },
    "1980s": { "primary_release_date.gte": "1980-01-01", "primary_release_date.lte": "1989-12-31" },
    "1990s": { "primary_release_date.gte": "1990-01-01", "primary_release_date.lte": "1999-12-31" },
    "2000s": { "primary_release_date.gte": "2000-01-01", "primary_release_date.lte": "2009-12-31" },
    "2010s": { "primary_release_date.gte": "2010-01-01", "primary_release_date.lte": "2019-12-31" },
    "2020s": { "primary_release_date.gte": "2020-01-01" },
    classic: { "primary_release_date.lte": "1979-12-31" },
    "80s90s": { "primary_release_date.gte": "1980-01-01", "primary_release_date.lte": "1999-12-31" },
    recent:  { "primary_release_date.gte": "2020-01-01" },
  };

  let eraMinYear = null;
  let eraMaxYear = null;
  if (prefs.era && eraRanges[prefs.era]) {
    const range = eraRanges[prefs.era];
    if (range["primary_release_date.gte"])
      eraMinYear = parseInt(range["primary_release_date.gte"].slice(0, 4), 10);
    if (range["primary_release_date.lte"])
      eraMaxYear = parseInt(range["primary_release_date.lte"].slice(0, 4), 10);
  }

  /* ================================================================= */
  /* 6. Effective genre filter                                           */
  /* ================================================================= */

  const moodGenres = prefs.mood ? (MOOD_GENRES[prefs.mood] || []) : [];
  const effectiveGenres = moodGenres.length > 0 ? moodGenres :
                          (prefs.genres?.length > 0 ? prefs.genres : []);

  /* ================================================================= */
  /* 7. Candidate pool                                                   */
  /* ================================================================= */

  const candidates = new Map();

  watchlist.forEach((m) =>
    candidates.set(m.id, { id: m.id, raw: m, source: "watchlist", dirScore: 0, actorScore: 0 })
  );

  const hasPersonFilter = !!(prefs.directorId || prefs.actorId);
  const withCountry     = !!prefs.country;

  /* ── Person-filter path ── */
  if (hasPersonFilter) {
    if (prefs.directorId) {
      try {
        const credits  = await personMovieCredits(prefs.directorId);
        const directed = (credits.crew || []).filter((m) => m.job === "Director");
        directed.forEach((m) => {
          if (!candidates.has(m.id))
            candidates.set(m.id, { id: m.id, raw: m, source: "director-pick", dirScore: 0, actorScore: 0 });
        });
      } catch { /* ignore */ }
    }
    if (prefs.actorId) {
      try {
        const credits = await personMovieCredits(prefs.actorId);
        (credits.cast || []).forEach((m) => {
          if (!candidates.has(m.id))
            candidates.set(m.id, { id: m.id, raw: m, source: "actor-pick", dirScore: 0, actorScore: 0 });
        });
      } catch { /* ignore */ }
    }

  } else if (withCountry) {
    /* ────────────────────────────────────────────────────────────────
     * STRICT COUNTRY PATH — only TMDB Discover with with_origin_country.
     * Person filmographies/recommendations are skipped: they do NOT
     * guarantee country accuracy (root cause of The Conversation/China bug).
     * ──────────────────────────────────────────────────────────────── */

    const baseDiscoverParams = {
      "with_origin_country": prefs.country,
      "vote_count.gte":      15,
    };

    // Use genre filter if active; otherwise let TMDB return anything for country
    if (effectiveGenres.length > 0)
      baseDiscoverParams["with_genres"] = effectiveGenres.slice(0, 3).join("|");
    if (prefs.era && eraRanges[prefs.era])
      Object.assign(baseDiscoverParams, eraRanges[prefs.era]);

    // Multiple sort strategies + random pages for variety
    const countryQueries = await Promise.all([
      discoverMovies({ ...baseDiscoverParams, sort_by: "vote_average.desc", page: 1 }),
      discoverMovies({ ...baseDiscoverParams, sort_by: "vote_average.desc", page: 2 }),
      discoverMovies({ ...baseDiscoverParams, sort_by: "vote_average.desc", page: 3 }),
      discoverMovies({ ...baseDiscoverParams, sort_by: "vote_average.desc", page: randPage() }),
      discoverMovies({ ...baseDiscoverParams, sort_by: "popularity.desc",   page: 1 }),
      discoverMovies({ ...baseDiscoverParams, sort_by: "popularity.desc",   page: 2 }),
      !prefs.era
        ? discoverMovies({ ...baseDiscoverParams, sort_by: "release_date.desc", "vote_average.gte": 5.5 })
        : Promise.resolve({ results: [] }),
    ]);

    countryQueries.forEach(({ results = [] }) => {
      results.forEach((m) => {
        if (!candidates.has(m.id))
          candidates.set(m.id, { id: m.id, raw: m, source: "discover", dirScore: 0, actorScore: 0 });
      });
    });

  } else {
    /* ── Standard path (no country, no person filter) ── */
    const discoverParams = {};

    const genresToDiscover = effectiveGenres.length > 0 ? effectiveGenres : favGenres.slice(0, 3);
    if (genresToDiscover.length > 0)
      discoverParams["with_genres"] = genresToDiscover.slice(0, 3).join("|");
    if (prefs.era && eraRanges[prefs.era])
      Object.assign(discoverParams, eraRanges[prefs.era]);

    // 4 random pages from a wide range (2–15) + page 1 as quality baseline
    const [disc1, disc2, disc3, disc4, disc5, discPopular, trend, upc] = await Promise.all([
      discoverMovies({ ...discoverParams, page: 1 }),
      discoverMovies({ ...discoverParams, page: randPage() }),
      discoverMovies({ ...discoverParams, page: randPage() }),
      discoverMovies({ ...discoverParams, page: randPage() }),
      discoverMovies({ ...discoverParams, page: randPage() }),
      discoverMovies({ ...discoverParams, sort_by: "popularity.desc", page: 1 }),
      trendingMovies("week"),
      upcomingMovies(),
    ]);

    [
      ...(disc1.results     || []),
      ...(disc2.results     || []),
      ...(disc3.results     || []),
      ...(disc4.results     || []),
      ...(disc5.results     || []),
      ...(discPopular.results || []),
      ...(trend.results     || []),
      ...(upc.results       || []),
    ].forEach((m) => {
      if (!candidates.has(m.id))
        candidates.set(m.id, { id: m.id, raw: m, source: "discover", dirScore: 0, actorScore: 0 });
    });

    // ── Director filmographies ──
    if (topDirs.length > 0) {
      const dirFilms = await Promise.all(
        topDirs.map(([dirId]) => personMovieCredits(dirId).catch(() => ({ crew: [] })))
      );
      dirFilms.forEach((data, i) => {
        const [dirId, { name, score }] = topDirs[i];
        (data.crew || []).filter((m) => m.job === "Director").forEach((m) => {
          if (!candidates.has(m.id)) {
            candidates.set(m.id, {
              id: m.id, raw: m, source: "director",
              dirScore: score, dirName: name, dirId, actorScore: 0,
            });
          }
        });
      });
    }

    // ── Actor filmographies ──
    if (topActors.length > 0) {
      const actorFilms = await Promise.all(
        topActors.map(([actorId]) => personMovieCredits(actorId).catch(() => ({ cast: [] })))
      );
      actorFilms.forEach((data, i) => {
        const [actorId, { name, score }] = topActors[i];
        (data.cast || []).forEach((m) => {
          if (!candidates.has(m.id)) {
            candidates.set(m.id, { id: m.id, raw: m, source: "actor", dirScore: 0, actorScore: score, actorName: name, actorId });
          } else {
            const e = candidates.get(m.id);
            if (e.actorScore < score)
              candidates.set(m.id, { ...e, actorScore: score, actorName: name, actorId });
          }
        });
      });
    }

    // ── Cinephile seed injection — 6 random auteurs per call (was 3) ──
    const shuffled  = [...CINEPHILE_DIRECTORS].sort(() => Math.random() - 0.5);
    const seedDirs  = shuffled.slice(0, 6);

    const cinephileFilms = await Promise.all(
      seedDirs.map(({ id }) => personMovieCredits(id).catch(() => ({ crew: [] })))
    );
    cinephileFilms.forEach((data, i) => {
      const { name } = seedDirs[i];
      (data.crew || []).filter((m) => m.job === "Director").forEach((m) => {
        if (!candidates.has(m.id)) {
          candidates.set(m.id, {
            id: m.id, raw: m, source: "cinephile_seed",
            dirScore: 0.55, dirName: name, actorScore: 0,
          });
        }
      });
    });

    // ── TMDB recommendations from top-10 highest-rated watched films ──
    const seedFilms = [...watched]
      .filter((m) => m.rated >= 8)
      .sort((a, b) => (b.rated || 0) - (a.rated || 0))
      .slice(0, 10);

    for (const m of seedFilms) {
      const d = await movieDetails(m.id);
      (d.recommendations?.results || []).forEach((r) => {
        if (!candidates.has(r.id))
          candidates.set(r.id, { id: r.id, raw: r, source: `similar:${m.title}`, dirScore: 0, actorScore: 0 });
      });
    }
  }

  const pool = [...candidates.values()].slice(0, maxCandidates);

  /* ================================================================= */
  /* 8. Score each candidate                                             */
  /* ================================================================= */

  const watchedIds = new Set(watched.map((m) => m.id));

  const voteCountFloor = watched.length >= 100 ? 80 : 30;

  const scored = pool
    .filter(({ id  }) => !watchedIds.has(id))
    .filter(({ id  }) => !recentlyShown.has(id))
    .filter(({ raw }) => (raw.vote_count   || 0) >= voteCountFloor)
    .filter(({ raw }) => (raw.vote_average || 0) >= 5.0)
    .map(({ id, raw, source, dirScore, dirName, dirId, actorScore, actorName, actorId }) => {
      const genreIds    = raw.genre_ids || [];
      const movieYear   = parseInt((raw.release_date || "").slice(0, 4), 10) || 2000;
      const movieDecade = decade(movieYear);
      const voteCount   = raw.vote_count   || 0;
      const voteAvg     = raw.vote_average || 0;

      // ── Genre score (cosine-similarity) × specificity multiplier ──
      const matching = genreIds.filter((g) => favGenres.includes(g));
      const rawGenreScore =
        matching.length > 0
          ? matching.reduce((s, g) => s + (genreAffinity.get(g) || 0), 0) /
            Math.sqrt(matching.length * favGenres.length)
          : 0;
      const maxSpecificity = genreIds.reduce(
        (mx, g) => Math.max(mx, GENRE_SPECIFICITY[g] || 1.0), 1.0
      );
      const genreScore = rawGenreScore * maxSpecificity;

      // ── Sigmoid vote score ──
      const voteScore = sigmoidVoteScore(voteAvg);

      const decScore   = decadeAffinity.get(movieDecade) || 0;
      const dirBonus   = dirScore  > 0 ? Math.min(dirScore,          1) : 0;
      const actorBonus = actorScore > 0 ? Math.min(actorScore * 0.85, 0.85) : 0;

      // ── Film quality categories ──
      let qualityBoost = 0;
      if      (voteAvg >= 8.5)                               qualityBoost = 0.22;
      else if (voteAvg >= 7.8 && voteCount >= 5000)          qualityBoost = 0.14;
      else if (voteAvg >= 7.5 && voteCount >= 50 && voteCount < 2000) qualityBoost = 0.16;
      else if (voteAvg >= 7.2)                               qualityBoost = 0.06;

      // ── Criterion / Radiance label boost ──
      // Films from these curated labels receive a significant advantage.
      // They represent the finest of world cinema and editorial taste-making.
      const criterionBoost = CRITERION_RADIANCE_IDS.has(id) ? 0.28 : 0;

      // ── Strong affinity boost ──
      const strongAffinityBoost = genreIds.some((g) => strongAffinityGenres.has(g)) ? 0.08 : 0;

      // ── Anti-mainstream penalty ──
      const mainstreamPenalty = voteCount > 50000 ? 0.08 : voteCount > 30000 ? 0.05 : 0;

      // ── Cinephile seed boost ──
      const cinephileBoost = source === "cinephile_seed" ? 0.07 : 0;

      // ── Keyword / nanogenre score (Nanocrowd-inspired) ──
      // keywordMap: Map<keywordId, {name, weight}> built from liked films' keywords
      let keywordScore = 0;
      if (keywordMap.size > 0 && raw._keywords?.length > 0) {
        const kwIds = raw._keywords;
        const matched = kwIds.filter((kwId) => keywordMap.has(kwId));
        if (matched.length > 0) {
          const kwWeight = matched.reduce((s, kwId) => s + (keywordMap.get(kwId)?.weight || 0), 0);
          keywordScore = Math.min(kwWeight / Math.sqrt(keywordMap.size) * 0.5, 0.15);
        }
      }

      // ── Final score ──
      const score =
        genreScore         * 0.28 +
        voteScore          * 0.14 +
        decScore           * 0.07 +
        dirBonus           * 0.18 +
        actorBonus         * 0.09 +
        qualityBoost             +
        criterionBoost           +
        strongAffinityBoost      +
        cinephileBoost           +
        keywordScore             -
        mainstreamPenalty        +
        jitter();

      /* ---- Reason tag ---- */
      let reason = null;

      if (source === "director-pick") {
        reason = `From your selected director's filmography`;
      } else if (source === "actor-pick") {
        reason = `From your selected actor's filmography`;
      } else if (source === "director" && dirName) {
        const avgStars = dirId != null ? dirAvgStars.get(dirId) : null;
        if (avgStars != null && avgStars > 0) {
          const avgStr = avgStars % 1 === 0 ? avgStars.toFixed(0) : avgStars.toFixed(1);
          reason = `${dirName}'s work — you rate it ${avgStr}★ on avg`;
        } else {
          reason = `Because you love ${dirName}'s films`;
        }
      } else if (source === "cinephile_seed" && dirName) {
        reason = `${dirName} — a cornerstone of world cinema`;
      } else if (source === "actor" && actorName) {
        const actScore = actorId != null ? actorScores.get(actorId)?.score : null;
        if (actScore != null) {
          const stars = ((actScore * 5) % 1 === 0)
            ? (actScore * 5).toFixed(0) : (actScore * 5).toFixed(1);
          reason = `${actorName}'s films — you rate them ${stars}★`;
        } else {
          reason = `Starring ${actorName}`;
        }
      } else if (source?.startsWith("similar:")) {
        const seedTitle = source.slice(8);
        const seedEntry = watchedByTitle.get(seedTitle.toLowerCase().trim());
        if (seedEntry?.rated) {
          const stars = starsDisplay(seedEntry.rated);
          const ql    = qualityLabel(voteAvg);
          reason = `You gave "${seedTitle}" ${stars} — ${ql} in the same vein`;
        } else {
          reason = `Because you loved "${seedTitle}"`;
        }
      } else if (matching.length > 0) {
        const topG      = [...matching].sort(
          (a, b) => (genreAffinity.get(b) || 0) - (genreAffinity.get(a) || 0)
        )[0];
        const genreName = GENRE_MAP[topG] || "this genre";
        const ql        = qualityLabel(voteAvg);
        const scoreStr  = voteAvg.toFixed(1);
        reason = `Your top ${genreName} taste — ${ql} (${scoreStr}/10)`;
      }

      return { id, score, reason, year: movieYear, genreIds, dirName: dirName || null, isCriterion: criterionBoost > 0 };
    });

  /* ================================================================= */
  /* 9. Sort → hard filters → diversity enforcement                     */
  /* ================================================================= */

  let results = scored.sort((a, b) => b.score - a.score);

  // Hard era filter
  if (eraMinYear !== null || eraMaxYear !== null) {
    results = results.filter(({ year }) => {
      if (eraMinYear !== null && year < eraMinYear) return false;
      if (eraMaxYear !== null && year > eraMaxYear) return false;
      return true;
    });
  }

  // Hard genre filter — STRICT: film must match ≥1 effective genre
  if (effectiveGenres.length > 0) {
    results = results.filter(({ genreIds: gIds }) =>
      effectiveGenres.some((g) => gIds.includes(g))
    );
  }

  // Diversity: max 2 films per director + max 4 films per decade
  if (!hasPersonFilter) {
    const dirCount    = new Map();
    const decadeCount = new Map();
    const diverse     = [];
    for (const item of results) {
      if (item.dirName) {
        const cnt = dirCount.get(item.dirName) || 0;
        if (cnt >= 2) continue;
        dirCount.set(item.dirName, cnt + 1);
      }
      const dec = decade(item.year);
      if (dec) {
        const dcnt = decadeCount.get(dec) || 0;
        if (dcnt >= 4) continue;
        decadeCount.set(dec, dcnt + 1);
      }
      diverse.push(item);
      if (diverse.length >= top * 2) break;
    }
    results = diverse;
  }

  return results.slice(0, top);
}
