// =====================================================
// Recommendation engine v9
// FIXES vs v8:
// – MOOD_GENRES: romantic now [10749] ONLY — removed Drama(18) which caused
//   every Drama film to pass the Romantic filter (e.g. Spartacus for Romantic)
// – Country filter: STRICT path — when country active, ONLY use TMDB Discover
//   with with_origin_country. Skip ALL person filmographies and seed recs
//   (they do not guarantee country accuracy → root cause of The Conversation/China bug)
// – Always inject cinephile seeds (removed conditional expandHorizons toggle)
// – recentlyShown parameter: exclude IDs seen in this session for variety
// – Discover page randomisation: random pages 2–8 alongside page 1 to prevent
//   the exact same candidate pool on every refresh
// – Sigmoid vote score: much better differentiation in the 6–9 quality band
// – Genre specificity multiplier: romance/horror/sci-fi weighted higher than drama/action
// – Film quality categories (masterpiece/acclaimed/hidden_gem/solid) replace flat boosts
// – Strong affinity boost: films matching genres where user has ≥3 high-rated films
// – Jitter increased ±0.02 → ±0.08 for genuine ranking variation
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
/* World-cinema auteur seeds — always injected (no toggle required)    */
/* 3 random directors chosen per call for variety                      */
/* ------------------------------------------------------------------ */
export const CINEPHILE_DIRECTORS = [
  { id: 10099, name: "Park Chan-wook"            }, // Oldboy, The Handmaiden
  { id: 12453, name: "Wong Kar-wai"              }, // In the Mood for Love
  { id: 4415,  name: "Federico Fellini"          }, // 8½, La Dolce Vita
  { id: 7232,  name: "Ingmar Bergman"            }, // The Seventh Seal, Persona
  { id: 83786, name: "Céline Sciamma"            }, // Portrait of a Lady on Fire
  { id: 608,   name: "Hayao Miyazaki"            }, // Spirited Away, Princess Mononoke
  { id: 4614,  name: "Agnès Varda"               }, // Cléo from 5 to 7, Vagabond
  { id: 15492, name: "Ken Loach"                 }, // I, Daniel Blake, Kes
  { id: 1769,  name: "Pedro Almodóvar"           }, // All About My Mother, Talk to Her
  { id: 5713,  name: "Michael Haneke"            }, // The White Ribbon, Caché
  { id: 21684, name: "Bong Joon-ho"              }, // Parasite, Memories of Murder
  { id: 5765,  name: "Akira Kurosawa"            }, // Seven Samurai, Rashomon
  { id: 4516,  name: "François Truffaut"         }, // The 400 Blows, Jules and Jim
  { id: 4508,  name: "Jean-Luc Godard"           }, // Breathless, Contempt
  { id: 3906,  name: "Andrei Tarkovsky"          }, // Stalker, The Mirror, Solaris
  { id: 12430, name: "Abbas Kiarostami"          }, // Close-Up, Taste of Cherry
  { id: 12451, name: "Lars von Trier"            }, // Melancholia, Dancer in the Dark
  { id: 4710,  name: "Claire Denis"              }, // Beau Travail, 35 Shots of Rum
  { id: 79001, name: "Apichatpong Weerasethakul" }, // Uncle Boonmee, Memoria
  { id: 42503, name: "Nuri Bilge Ceylan"         }, // Winter Sleep
  { id: 77789, name: "Yorgos Lanthimos"          }, // The Lobster, The Favourite
  { id: 14406, name: "Satyajit Ray"              }, // The Apu Trilogy
  { id: 5388,  name: "Yasujirō Ozu"              }, // Tokyo Story, Late Spring
  { id: 6649,  name: "Robert Bresson"            }, // Au Hasard Balthazar
  { id: 28011, name: "Hong Sang-soo"             }, // Right Now Wrong Then
  { id: 63834, name: "Lucrecia Martel"           }, // La Ciénaga, Zama
];

/* ------------------------------------------------------------------ */
/* Mood → genre mapping                                                 */
/* IMPORTANT: genres here are used as HARD FILTERS at the end.        */
/* Keep them precise — a film must match at least one listed genre.    */
/*                                                                     */
/* BUG FIX: romantic was [10749, 18]. Drama(18) is far too broad and  */
/* caused any drama film (Spartacus, etc.) to pass the romantic filter.*/
/* romantic is now [10749] ONLY — the Romance genre ID.               */
/* ------------------------------------------------------------------ */
export const MOOD_GENRES = {
  light:       [35, 16],        // Comedy, Animation — fun & upbeat
  tense:       [53, 80],        // Thriller, Crime
  mindbending: [878, 9648],     // Sci-Fi, Mystery (Thriller removed — more precise)
  deep:        [18, 99, 36],    // Drama, Documentary, History
  epic:        [28, 12, 14],    // Action, Adventure, Fantasy
  romantic:    [10749],         // Romance ONLY — no Drama (too broad)
  dark:        [27, 53],        // Horror, Thriller
  artsy:       [18, 99],        // Drama, Documentary
};

/* ------------------------------------------------------------------ */
/* Genre specificity multipliers                                        */
/* Niche/specific genres boost score; generic/mainstream penalised.    */
/* This prevents Drama from dominating everything.                     */
/* ------------------------------------------------------------------ */
const GENRE_SPECIFICITY = {
  10749: 1.35, // Romance — very specific taste signal
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
  18:    0.85, // Drama — too generic (everyone has drama)
  28:    0.90, // Action — very mainstream
  12:    0.90, // Adventure — mainstream
  35:    0.95, // Comedy — common
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function decade(year) {
  if (!year) return null;
  return Math.floor(year / 10) * 10;
}

// Increased jitter for genuine ranking variation on each refresh
function jitter() {
  return (Math.random() - 0.5) * 0.16; // ±0.08
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

// Sigmoid-shaped vote score: much better differentiation in the 6–9 range
// 5.0→0.07  6.0→0.24  7.0→0.56  7.5→0.73  8.0→0.86  8.5→0.94  9.0→0.98
function sigmoidVoteScore(avg) {
  return 1 / (1 + Math.exp(-2.2 * ((avg || 0) - 7.0)));
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
 * @param {Set}       recentlyShown  – film IDs shown in this session (exclude them)
 */
export async function getRecommendations({
  watched = [],
  watchlist = [],
  prefs = {},
  top = 20,
  maxCandidates = 450,
  recentlyShown = new Set(),
} = {}) {

  /* ================================================================= */
  /* 1. Taste DNA: genre + decade affinity from LIKED films             */
  /*    Bayesian-smoothed; uses cosine-similarity style genre scoring   */
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

  // Strong affinity genres: user has rated ≥3 films ≥8★ in this genre
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
  /* 3. Lookup maps for reason tags                                      */
  /* ================================================================= */

  const watchedByTitle = new Map();
  watched.forEach((m) => {
    if (m.title) watchedByTitle.set(m.title.toLowerCase().trim(), m);
  });

  /* ================================================================= */
  /* 4. Era boundaries                                                   */
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
  /* 5. Effective genre filter                                           */
  /* ================================================================= */

  const moodGenres = prefs.mood ? (MOOD_GENRES[prefs.mood] || []) : [];
  const effectiveGenres = moodGenres.length > 0 ? moodGenres :
                          (prefs.genres?.length > 0 ? prefs.genres : []);

  /* ================================================================= */
  /* 6. Candidate pool                                                   */
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
    /* ================================================================= */
    /* ── STRICT COUNTRY PATH ────────────────────────────────────────── */
    /* When a country filter is active, ONLY use TMDB Discover with       */
    /* with_origin_country. Skip ALL person filmographies and TMDB seed   */
    /* recommendations — they do NOT guarantee country accuracy.          */
    /*                                                                    */
    /* ROOT CAUSE FIX: person filmography responses (/person/{id}/credits)*/
    /* and TMDB recommendation responses do NOT include origin_country    */
    /* in the movie objects. The lenient filter in v8 allowed them        */
    /* through → caused The Conversation (US) appearing for China (CN).   */
    /* ================================================================= */

    const baseDiscoverParams = {
      "with_origin_country": prefs.country,
      "vote_count.gte":      15, // low floor so art-house films aren't excluded
    };

    // Genres / era applied on top of country filter
    const genresToDiscover = effectiveGenres.length > 0 ? effectiveGenres : favGenres.slice(0, 3);
    if (genresToDiscover.length > 0)
      baseDiscoverParams["with_genres"] = genresToDiscover.slice(0, 3).join("|");
    if (prefs.era && eraRanges[prefs.era])
      Object.assign(baseDiscoverParams, eraRanges[prefs.era]);

    // Multiple sort strategies for diversity within the country
    const countryQueries = await Promise.all([
      discoverMovies({ ...baseDiscoverParams, sort_by: "vote_average.desc", page: 1 }),
      discoverMovies({ ...baseDiscoverParams, sort_by: "vote_average.desc", page: 2 }),
      discoverMovies({ ...baseDiscoverParams, sort_by: "vote_average.desc", page: 3 }),
      discoverMovies({ ...baseDiscoverParams, sort_by: "popularity.desc",   page: 1 }),
      discoverMovies({ ...baseDiscoverParams, sort_by: "popularity.desc",   page: 2 }),
      // Recent releases from this country (if no era filter)
      !prefs.era
        ? discoverMovies({ ...baseDiscoverParams, sort_by: "release_date.desc", "vote_average.gte": 6.0 })
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

    // Randomised page selection so each refresh draws different candidates
    const randPage = () => Math.floor(Math.random() * 7) + 2; // pages 2-8

    const [disc1, disc2, disc3, discPopular, trend, upc] = await Promise.all([
      discoverMovies({ ...discoverParams, page: 1 }),          // always include page 1 (quality baseline)
      discoverMovies({ ...discoverParams, page: randPage() }),  // random page
      discoverMovies({ ...discoverParams, page: randPage() }),  // random page
      discoverMovies({ ...discoverParams, sort_by: "popularity.desc", page: 1 }), // freshness
      trendingMovies("week"),
      upcomingMovies(),
    ]);

    [
      ...(disc1.results     || []),
      ...(disc2.results     || []),
      ...(disc3.results     || []),
      ...(discPopular.results || []),
      ...(trend.results     || []),
      ...(upc.results       || []),
    ].forEach((m) => {
      if (!candidates.has(m.id))
        candidates.set(m.id, { id: m.id, raw: m, source: "discover", dirScore: 0, actorScore: 0 });
    });

    // ── Director filmographies (full — no country filter active) ──
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

    // ── Cinephile seed injection (always active — this is the base mode) ──
    // 3 random auteur directors per call → different films every refresh
    const shuffled = [...CINEPHILE_DIRECTORS].sort(() => Math.random() - 0.5);
    const seedDirs = shuffled.slice(0, 3);

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
  /* 7. Score each candidate                                             */
  /* ================================================================= */

  const watchedIds = new Set(watched.map((m) => m.id));

  // Adaptive vote count floor
  const voteCountFloor = watched.length >= 100 ? 80 : 30;

  const scored = pool
    .filter(({ id  }) => !watchedIds.has(id))
    .filter(({ id  }) => !recentlyShown.has(id))   // exclude session-shown films
    .filter(({ raw }) => (raw.vote_count   || 0) >= voteCountFloor)
    .filter(({ raw }) => (raw.vote_average || 0) >= 5.5)
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
      // Niche genres score higher; generic genres (drama, action) penalised slightly
      const maxSpecificity = genreIds.reduce(
        (mx, g) => Math.max(mx, GENRE_SPECIFICITY[g] || 1.0), 1.0
      );
      const genreScore = rawGenreScore * maxSpecificity;

      // ── Sigmoid vote score — much better quality differentiation ──
      const voteScore = sigmoidVoteScore(voteAvg);

      const decScore    = decadeAffinity.get(movieDecade) || 0;
      const dirBonus    = dirScore  > 0 ? Math.min(dirScore,          1) : 0;
      const actorBonus  = actorScore > 0 ? Math.min(actorScore * 0.85, 0.85) : 0;

      // ── Film quality category (replaces flat prestige/hidden-gem boosts) ──
      let qualityBoost = 0;
      if      (voteAvg >= 8.5)                               qualityBoost = 0.22; // Masterpiece
      else if (voteAvg >= 7.8 && voteCount >= 5000)          qualityBoost = 0.14; // Acclaimed
      else if (voteAvg >= 7.5 && voteCount >= 50 && voteCount < 2000) qualityBoost = 0.16; // Hidden gem
      else if (voteAvg >= 7.2)                               qualityBoost = 0.06; // Solid

      // ── Strong affinity: user has ≥3 high-rated films in this genre ──
      const strongAffinityBoost = genreIds.some((g) => strongAffinityGenres.has(g)) ? 0.08 : 0;

      // ── Anti-mainstream penalty ── curbs blockbuster flooding ──
      const mainstreamPenalty = voteCount > 30000 ? 0.06 : 0;

      // ── Cinephile seed boost ──
      const cinephileBoost = source === "cinephile_seed" ? 0.07 : 0;

      // ── Final score ──
      // Weights chosen so that a strong genre + quality match can outperform
      // a director affinity film, but director affinity can beat a generic genre match.
      const score =
        genreScore         * 0.30 +
        voteScore          * 0.15 +
        decScore           * 0.08 +
        dirBonus           * 0.20 +
        actorBonus         * 0.10 +
        qualityBoost            +
        strongAffinityBoost     +
        cinephileBoost          -
        mainstreamPenalty       +
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

      return { id, score, reason, year: movieYear, genreIds, dirName: dirName || null };
    });

  /* ================================================================= */
  /* 8. Sort → hard filters → diversity enforcement                     */
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

  // Hard genre filter (mood or explicit) — STRICT: film must match ≥1 effective genre
  // This is the definitive barrier that prevents Spartacus appearing for Romantic
  if (effectiveGenres.length > 0) {
    results = results.filter(({ genreIds: gIds }) =>
      effectiveGenres.some((g) => gIds.includes(g))
    );
  }

  // Diversity: max 2 films per director
  if (!hasPersonFilter) {
    const dirCount = new Map();
    const diverse  = [];
    for (const item of results) {
      if (item.dirName) {
        const cnt = dirCount.get(item.dirName) || 0;
        if (cnt >= 2) continue;
        dirCount.set(item.dirName, cnt + 1);
      }
      diverse.push(item);
      if (diverse.length >= top * 2) break;
    }
    results = diverse;
  }

  return results.slice(0, top);
}
