// Personalised discovery: signed taste evidence, confidence-aware quality,
// diverse seeds and soft repeat penalties.
import {
  trendingMovies,
  upcomingMovies,
  movieDetails,
  discoverMovies,
  personMovieCredits,
} from "../utils/api";
import { tasteProfile, genreIds, qualityScore, seedMovies, diversePicks, criticAverage, ratingReach, externalRatings } from "../../shared/taste.js";
import { tasteEvidence, evidenceSample, evidenceMatch, evidenceReason, peerReason, languageAffinity, directorsOf, languageOf, stars } from "../../shared/evidence.js";
import { placeMember, affinities, strongest, becauseOf, peerStrength } from "../../shared/tasteSpace.js";
import { loadRatings, withRatings } from "../utils/ratings";
import { loadTasteSpace } from "../utils/tasteSpace";
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

// How many of the strongest candidates are fetched in full for the second stage.
// Details are cached, and the final cards reuse them.
const SHORTLIST = 36;

// How many of the taste space's strongest matches join the candidate pool, and
// how far a match must stand above the member's ordinary film to be named as
// the reason (in standard deviations over the whole catalogue).
const SPACE_PICKS = 30;
const SPACE_REASON_Z = 1.5;

// The most specific thing the member's own ratings show about a shortlisted
// film, as { short, full }. Nothing is claimed without rated films behind it.
function shortlistReason(candidate, because) {
  // An explicit director or actor filter already explains itself.
  if (candidate.source === "director-pick" || candidate.source === "actor-pick") return null;
  // "You gave X 4.5★" names a concrete film; only a loved director beats it.
  if (candidate.source?.startsWith("similar:") && !because.director) return null;
  // So does the taste space, naming the loved films that pull a film up.
  if (candidate.peer && !because.director && !because.actor) return null;
  return evidenceReason(because);
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

  const likedFilms = watched.filter(m => Number(m.rated) >= 6);
  const taste = tasteProfile(watched);
  const genreAffinity = taste.genres;
  const decadeAffinity = taste.decades;
  const favGenres = [...genreAffinity].filter(([, score]) => score > 0)
    .sort((a,b) => b[1] - a[1]).slice(0, 8).map(([id]) => id);
  // Each favourite genre's best-rated film, to name in reasons. Only clearly
  // loved films (8/10 or more) qualify as an example.
  const bestOfGenre = new Map();
  for (const m of [...watched].filter((w) => Number(w.rated) >= 8 && w.title).sort((a, b) => b.rated - a.rated)) {
    for (const g of genreIds(m)) if (favGenres.includes(g) && !bestOfGenre.has(g)) bestOfGenre.set(g, m);
  }

  // Strong affinity genres: user has ≥3 films rated ≥8★
  const strongAffinityGenres = new Set();
  favGenres.forEach((g) => {
    const highRatedCount = likedFilms.filter(
      (m) => m.rated >= 8 && m.genres?.includes(g)
    ).length;
    if (highRatedCount >= 3) strongAffinityGenres.add(g);
  });

  /* ================================================================= */
  /* 2. Signed evidence: directors, cast, themes, languages, countries   */
  /* ================================================================= */

  // One cached details call per sampled film carries credits, keywords,
  // language and country together.
  const sample = evidenceSample(watched);
  const sampleDetails = await Promise.allSettled(sample.map((m) => movieDetails(m.id)));
  const evidence = tasteEvidence(
    sample.map((m, i) => ({ rated: m.rated, title: m.title, details: sampleDetails[i].status === "fulfilled" ? sampleDetails[i].value : null })),
    watched,
  );

  // Filmographies worth exploring: people the evidence says the member likes.
  // 0.3 takes a film rated clearly above the member's own mean, so the reason
  // "a director among your highly rated films" is never an overstatement.
  const topDirs = [...evidence.directors.entries()]
    .filter(([, e]) => e.value >= 0.3)
    .sort((a, b) => b[1].value - a[1].value)
    .slice(0, 3)
    .map(([id, e]) => [id, { name: e.name, score: e.value }]);

  // The taste space: where the member sits among 200,000 people's loved films.
  // Without the file, or with too few loved films it knows, picks carry on
  // from the member's own evidence alone.
  const space = await loadTasteSpace();
  const member = space && placeMember(space, watched, watchlist.map((m) => m.id));
  const peer = member ? affinities(space, member) : null;
  const peerZ = (id) => {
    const i = peer && space.index.get(Number(id));
    return i == null ? null : peer[i];
  };

  const topActors = [...evidence.cast.entries()]
    .filter(([, e]) => e.count >= 2 && e.value >= 0.3)
    .sort((a, b) => b[1].value - a[1].value)
    .slice(0, 3)
    .map(([id, e]) => [id, { name: e.name, score: e.value }]);

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

  const hydratedWatchlist = await Promise.allSettled(watchlist.slice(0, 20).map(m => movieDetails(m.id)));
  hydratedWatchlist.forEach(r => {
    if (r.status === 'fulfilled') {
      const m = r.value;
      candidates.set(m.id, {id: m.id, raw: {...m, genre_ids: genreIds(m)}, source: 'watchlist', dirScore: 0, actorScore: 0});
    }
  });

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

    // Exploration candidates still have to earn their place through taste scoring.
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
            dirScore: 0, dirName: name, actorScore: 0,
          });
        }
      });
    });

    // ── The taste space's strongest matches ──
    if (member) {
      const exclude = new Set([...watched, ...watchlist].map((m) => Number(m.id)));
      const matches = strongest(space, member, { limit: SPACE_PICKS, exclude, scores: peer });
      for (let i = 0; i < matches.length; i += 6) {
        const fetched = await Promise.allSettled(matches.slice(i, i + 6).map((m) => movieDetails(m.id)));
        fetched.forEach((r) => {
          if (r.status !== "fulfilled" || !r.value?.id || candidates.has(r.value.id)) return;
          candidates.set(r.value.id, { id: r.value.id, raw: { ...r.value, genre_ids: genreIds(r.value) }, source: "taste-space", dirScore: 0, actorScore: 0 });
        });
      }
    }

    // ── TMDB recommendations from top-10 highest-rated watched films ──
    const seedFilms = seedMovies(watched, 8);

    for (const m of seedFilms) {
      const d = await movieDetails(m.id).catch(() => ({}));
      (d.recommendations?.results || []).forEach((r) => {
        if (!candidates.has(r.id))
          candidates.set(r.id, { id: r.id, raw: r, source: `similar:${m.title}`, dirScore: 0, actorScore: 0 });
      });
    }
  }

  // Apply country/person constraints to every source, including saved watchlists.
  let pool = [...candidates.values()].slice(0, maxCandidates);
  // IMDb and Rotten Tomatoes, not TMDB, decide how good a candidate is. A film
  // not yet in the shared cache keeps TMDB's figures until it is.
  const ratings = await loadRatings(pool.map((p) => p.id));
  pool = pool.map((p) => ({ ...p, raw: withRatings(p.raw, ratings.get(Number(p.id))) }));
  if (prefs.country || hasPersonFilter) {
    pool = pool.filter(({id, raw}) => !watched.some(m => Number(m.id) === Number(id)) && !raw.adult)
      .sort((a,b) => qualityScore(b.raw)-qualityScore(a.raw)).slice(0,80);
    const checked = [];
    for (let offset = 0; offset < pool.length; offset += 6) {
      checked.push(...await Promise.allSettled(pool.slice(offset, offset + 6).map(async item => {
      const d = await movieDetails(item.id);
      if (prefs.country && !(d.origin_country || d.production_countries?.map(c => c.iso_3166_1) || []).includes(prefs.country)) return null;
      if (prefs.directorId && !d.credits?.crew?.some(p => p.job === 'Director' && Number(p.id) === Number(prefs.directorId))) return null;
      if (prefs.actorId && !d.credits?.cast?.some(p => Number(p.id) === Number(prefs.actorId))) return null;
      return {...item, raw: {...item.raw, ...d, genre_ids: genreIds(d)}};
      })));
    }
    pool = checked.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value);
  }

  /* ================================================================= */
  /* 8. Score each candidate                                             */
  /* ================================================================= */

  const watchedIds = new Set(watched.map((m) => Number(m.id)));

  const voteCountFloor = watched.length >= 100 ? 80 : 30;

  const scored = pool
    .filter(({ id  }) => !watchedIds.has(Number(id)))
    .filter(({ raw }) => !raw.adult && (!raw.release_date || raw.release_date <= new Date().toISOString().slice(0, 10)))
    .filter(({ raw }) => (raw.vote_count   || 0) >= voteCountFloor)
    .filter(({ raw }) => criticAverage(raw) >= 5.0)
    .map(({ id, raw, source, dirScore, dirName, dirId, actorScore, actorName, actorId }) => {
      const genreIds    = raw.genre_ids || raw.genres?.map(g => g.id ?? g) || [];
      const movieYear   = parseInt((raw.release_date || "").slice(0, 4), 10) || 2000;
      const movieDecade = decade(movieYear);
      // TMDB's count measures popularity, which every candidate has; quality
      // comes from IMDb and Rotten Tomatoes whenever they are known.
      const voteCount   = raw.vote_count   || 0;
      const voteAvg     = criticAverage(raw);
      const reach       = ratingReach(raw);

      // ── Genre score (cosine-similarity) × specificity multiplier ──
      const matching = genreIds.filter((g) => favGenres.includes(g));
      const rawGenreScore = genreIds.length ? genreIds.reduce((s,g) => s + (genreAffinity.get(g) || 0), 0) / Math.sqrt(genreIds.length) : 0;
      const maxSpecificity = genreIds.reduce(
        (mx, g) => Math.max(mx, GENRE_SPECIFICITY[g] || 1.0), 1.0
      );
      const genreScore = rawGenreScore * maxSpecificity;

      // ── Sigmoid vote score ──
      const voteScore = sigmoidVoteScore(qualityScore(raw));

      const decScore   = decadeAffinity.get(movieDecade) || 0;
      // Provisional: which filmography a candidate came from. The second stage
      // replaces these with signed evidence from the film's actual credits.
      const dirBonus   = dirScore  > 0 ? Math.min(dirScore,          1) : 0;
      const actorBonus = actorScore > 0 ? Math.min(actorScore * 0.85, 0.85) : 0;
      // Original language comes with every TMDB list result, so it can shape
      // the whole pool, not only the shortlist.
      const langScore  = languageAffinity(raw, evidence);
      // What people with the member's taste love, standardised over the whole
      // catalogue and bounded so one signal cannot drown the rest. Films the
      // space does not know (recent or rare) are neutral on it.
      const z          = peerZ(id);
      const peerScore  = peerStrength(z);

      // ── Film quality categories ──
      let qualityBoost = 0;
      if      (voteAvg >= 8.5)                               qualityBoost = 0.22;
      else if (voteAvg >= 7.8 && reach >= 5000)              qualityBoost = 0.14;
      else if (voteAvg >= 7.5 && reach >= 50 && reach < 2000) qualityBoost = 0.16;
      else if (voteAvg >= 7.2)                               qualityBoost = 0.06;

      // ── Criterion / Radiance label boost ──
      // A small editorial tie-breaker must not override personal preferences.
      const criterionBoost = CRITERION_RADIANCE_IDS.has(id) ? 0.03 : 0;

      // ── Strong affinity boost ──
      const strongAffinityBoost = genreIds.some((g) => strongAffinityGenres.has(g)) ? 0.08 : 0;

      // ── Anti-mainstream penalty ──
      const mainstreamPenalty = voteCount > 50000 ? 0.08 : voteCount > 30000 ? 0.05 : 0;

      // ── Cinephile seed boost ──
      const cinephileBoost = source === "cinephile_seed" ? 0.01 : 0;

      // ── Final score ──
      const score =
        genreScore         * 0.55 +
        voteScore          * 0.14 +
        decScore           * 0.07 +
        dirBonus           * 0.18 +
        actorBonus         * 0.09 +
        qualityBoost             +
        criterionBoost           +
        strongAffinityBoost      +
        cinephileBoost           +
        langScore          * 0.15 +
        peerScore          * 0.60 -
        mainstreamPenalty        +
        0;

      /* ---- Reason tag ---- */
      let reason = null;
      let reasonDetail = null;
      // Named only when the space places the film well above the member's usual.
      const peerFilms  = z != null && z >= SPACE_REASON_Z ? becauseOf(space, member, space.index.get(Number(id))) : [];
      const peerCited  = peerReason(peerFilms);

      if (source === "director-pick") {
        reason = `From your selected director's filmography`;
      } else if (source === "actor-pick") {
        reason = `From your selected actor's filmography`;
      } else if (source === "director" && dirName) {
        reason = `From ${dirName}, a director among your highly rated films`;
      } else if (peerCited && (source === "taste-space" || source === "discover" || source === "cinephile_seed" || source === "watchlist")) {
        reason = peerCited.short;
        reasonDetail = peerCited.full;
      } else if (source === "cinephile_seed" && dirName) {
        reason = "A world-cinema discovery to explore";
      } else if (source === "actor" && actorName) {
        reason = `Features ${actorName}, who appears in films you rated highly`;
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
      } else if (peerCited) {
        reason = peerCited.short;
        reasonDetail = peerCited.full;
      } else if (matching.length > 0) {
        const topG      = [...matching].sort(
          (a, b) => (genreAffinity.get(b) || 0) - (genreAffinity.get(a) || 0)
        )[0];
        const genreName = GENRE_MAP[topG] || "this genre";
        const ql        = qualityLabel(voteAvg);
        // Quote a real source's figure, never the blend used for ranking.
        const { imdb, rt } = externalRatings(raw);
        const cited     = imdb != null ? `IMDb ${imdb.toFixed(1)}` : rt != null ? `${rt}% on Rotten Tomatoes` : null;
        // Name the member's best-rated film of that genre, so the reason points
        // at something they actually watched rather than a category.
        const example   = bestOfGenre.get(topG);
        if (example) {
          reason = `${genreName} you rate highly — like "${example.title}" ${stars(example.rated)}`;
          reasonDetail = `${genreName} is among the genres you rate highest; you gave "${example.title}" ${stars(example.rated)}. This one is ${ql}${cited ? ` (${cited})` : ""}.`;
        } else {
          reason = cited ? `Your top ${genreName} taste — ${ql} (${cited})` : `Your top ${genreName} taste — ${ql}`;
        }
      }

      return {
        id, score, reason, reasonDetail, source, year: movieYear, genreIds, dirName: dirName || null,
        original_language: raw.original_language, isCriterion: criterionBoost > 0,
        provisional: dirBonus * 0.18 + actorBonus * 0.09,
        peer: !!peerCited && reason === peerCited.short,
      };
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

  /* ================================================================= */
  /* 10. Second stage: the shortlist, judged on its real credits        */
  /* ================================================================= */

  // List results carry no credits or keywords, so the strongest candidates are
  // fetched in full and re-scored on signed evidence. A director the member
  // rates low now counts against a film and a shared theme counts for it,
  // whichever source the film came from.
  if (evidence.films > 0) {
    const shortlist = results.slice(0, SHORTLIST);
    const details = [];
    for (let i = 0; i < shortlist.length; i += 6) {
      details.push(...await Promise.allSettled(shortlist.slice(i, i + 6).map((r) => movieDetails(r.id))));
    }
    shortlist.forEach((r, i) => {
      const d = details[i].status === "fulfilled" ? details[i].value : null;
      if (!d) return;
      const match = evidenceMatch(d, evidence);
      r.score += -r.provisional
        + 0.35 * match.director
        + 0.12 * match.cast
        + 0.30 * match.keywords
        + 0.08 * match.country;
      r.dirName = directorsOf(d)[0]?.name || r.dirName;
      r.original_language = languageOf(d) || r.original_language;
      const cited = shortlistReason(r, match.because);
      if (cited) { r.reason = cited.short; r.reasonDetail = cited.full; }
    });
    results.sort((a, b) => b.score - a.score);
  }

  return diversePicks(results.map(m => ({...m, genre_ids: m.genreIds, _score: m.score})), top, {recent: new Set([...recentlyShown].map(Number)), strength: hasPersonFilter ? .06 : .12});
}
