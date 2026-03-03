// =====================================================
// Recommendation engine v8
// NEW vs v7:
// – CINEPHILE_DIRECTORS: 26 world-cinema auteur director IDs for discovery seeding
// – Country filter FIX: source-aware — "discover" results were already fetched with
//   with_origin_country → skip re-check. Director filmographies with active country
//   filter now use discoverMovies({ with_crew, with_origin_country }) instead of full
//   personMovieCredits — guarantees correct country + preserves director affinity.
// – expandHorizons mode (prefs.expandHorizons):
//   • injects 3 random cinephile seed directors into pool
//   • lowers voteCountFloor to 20 for deeper cuts into art house / world cinema
//   • cinephile seeds get +0.08 score boost and a "cornerstone of world cinema" reason
// – Hidden gem boost: vote_avg ≥7.5 AND vote_count 50–2000 → +0.12 score bonus
// – Anti-mainstream penalty: vote_count >30 000 → −0.05 (curbs MCU/blockbuster flooding)
// – Adaptive voteCountFloor: 20 (expandHorizons) / 100 (≥100 films) / 40 (default)
// – maxCandidates bumped to 400 to accommodate cinephile seed addition
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
/* World-cinema auteur seeds                                           */
/* Injected when user has <50 films watched OR prefs.expandHorizons   */
/* 3 random directors are picked per call for variety                 */
/* ------------------------------------------------------------------ */
export const CINEPHILE_DIRECTORS = [
  { id: 10099, name: "Park Chan-wook"            }, // Oldboy, The Handmaiden
  { id: 12453, name: "Wong Kar-wai"              }, // In the Mood for Love, Chungking Express
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
  { id: 42503, name: "Nuri Bilge Ceylan"         }, // Winter Sleep, Once Upon a Time in Anatolia
  { id: 77789, name: "Yorgos Lanthimos"          }, // The Lobster, The Favourite
  { id: 14406, name: "Satyajit Ray"              }, // The Apu Trilogy, Charulata
  { id: 5388,  name: "Yasujirō Ozu"              }, // Tokyo Story, Late Spring
  { id: 6649,  name: "Robert Bresson"            }, // Au Hasard Balthazar, A Man Escaped
  { id: 28011, name: "Hong Sang-soo"             }, // Right Now Wrong Then, The Woman Who Ran
  { id: 63834, name: "Lucrecia Martel"           }, // La Ciénaga, Zama
];

/* ------------------------------------------------------------------ */
/* Mood → genre mapping                                                 */
/* ------------------------------------------------------------------ */

export const MOOD_GENRES = {
  light:       [35, 16],          // Comedy, Animation
  tense:       [53, 80],          // Thriller, Crime
  mindbending: [878, 9648, 53],   // Sci-Fi, Mystery, Thriller
  deep:        [18, 36, 99],      // Drama, History, Documentary
  epic:        [28, 12, 14],      // Action, Adventure, Fantasy
  romantic:    [10749, 18],       // Romance, Drama
  dark:        [27, 53],          // Horror, Thriller
  artsy:       [18, 99],          // Drama, Documentary
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function decade(year) {
  if (!year) return null;
  return Math.floor(year / 10) * 10;
}

// Small random jitter for diversity (±0.02)
function jitter() {
  return (Math.random() - 0.5) * 0.04;
}

// Human-readable quality label based on TMDB vote average
function qualityLabel(avg) {
  if (avg >= 8.5) return "a true masterpiece";
  if (avg >= 7.8) return "critically acclaimed";
  if (avg >= 7.2) return "highly regarded";
  if (avg >= 6.5) return "a solid pick";
  return "worth a watch";
}

// Format a stored rating (1-10) as display stars string, e.g. "4.5★"
function starsDisplay(storedRating) {
  if (!storedRating) return null;
  const d = storedRating / 2;
  return `${d % 1 === 0 ? d.toFixed(0) : d.toFixed(1)}★`;
}

/* ------------------------------------------------------------------ */
/* Main export                                                          */
/* ------------------------------------------------------------------ */

/**
 * @param {object[]} watched         – stored watched entries
 * @param {object[]} watchlist       – stored watchlist entries
 * @param {object}   prefs           – user preference overrides
 *   prefs.genres         {number[]}  – TMDB genre ids to hard-filter
 *   prefs.era            {string}    – decade id ("1920s"…"2020s") or legacy alias
 *   prefs.mood           {string}    – mood key from MOOD_GENRES
 *   prefs.country        {string}    – ISO-3166 origin country (e.g. "FR", "JP")
 *   prefs.directorId     {number}    – TMDB person id (manual override)
 *   prefs.actorId        {number}    – TMDB person id
 *   prefs.expandHorizons {boolean}   – world-cinema mode: cinephile seeds + lower floors
 * @param {number}   top             – how many results to return
 * @param {number}   maxCandidates
 */
export async function getRecommendations({
  watched = [],
  watchlist = [],
  prefs = {},
  top = 20,
  maxCandidates = 400,
} = {}) {

  /* ================================================================= */
  /* 1. Taste DNA: genre + decade affinity from LIKED films only        */
  /*    Bayesian-smoothed: small library → more conservative estimates  */
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

  // Bayesian smoothing: blend raw affinity toward 0.5 for genres with few observations
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

  const sortedGenres = [...genreAffinity.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([g]) => g);

  const favGenres = sortedGenres.slice(0, 8);

  /* ================================================================= */
  /* 2. Director + Actor affinity — merged from same credit fetches     */
  /*    Only top-15 highest-rated watched films (≥8★)                  */
  /* ================================================================= */

  const directorAffinity = new Map(); // dirId → { sum, count, name }
  const actorAffinity    = new Map(); // actorId → { sum, count, name }

  const topRatedForCredits = [...watched]
    .filter((m) => m.rated >= 8)
    .sort((a, b) => (b.rated || 0) - (a.rated || 0))
    .slice(0, 15);

  await Promise.all(
    topRatedForCredits.map(async (m) => {
      try {
        const credits = await movieCredits(m.id);

        const director = credits?.crew?.find((p) => p.job === "Director");
        if (director) {
          const prev = directorAffinity.get(director.id) || { sum: 0, count: 0, name: director.name };
          directorAffinity.set(director.id, {
            sum:   prev.sum + (m.rated || 8) / 10,
            count: prev.count + 1,
            name:  director.name,
          });
        }

        // Actor affinity — top 5 billed cast
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

  // Director scores + avg star display
  const dirScores   = new Map();
  const dirAvgStars = new Map();

  directorAffinity.forEach(({ sum, count, name }, id) => {
    dirScores.set(id, { score: sum / count, name });
    dirAvgStars.set(id, (sum / count) * 5);
  });

  const topDirs = [...dirScores.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, 3);

  // Actor scores — only actors who appear in ≥2 top-rated films
  const actorScores = new Map();
  actorAffinity.forEach(({ sum, count, name }, id) => {
    if (count >= 2) actorScores.set(id, { score: sum / count, name });
  });

  const topActors = [...actorScores.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, 3);

  /* ================================================================= */
  /* 3. Lookup maps for personal reason tags                            */
  /* ================================================================= */

  const watchedByTitle = new Map();
  watched.forEach((m) => {
    if (m.title) watchedByTitle.set(m.title.toLowerCase().trim(), m);
  });

  /* ================================================================= */
  /* 4. Era boundaries (individual decades + legacy aliases)            */
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
    // Legacy aliases
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
  /* 5. Effective genre filter: mood > explicit genres > auto-affinity  */
  /* ================================================================= */

  const moodGenres = prefs.mood ? (MOOD_GENRES[prefs.mood] || []) : [];
  const effectiveGenres = moodGenres.length > 0 ? moodGenres :
                          (prefs.genres?.length > 0 ? prefs.genres : []);

  /* ================================================================= */
  /* 6. Candidate pool                                                   */
  /* ================================================================= */

  const candidates = new Map();

  // a) Watchlist — always included
  watchlist.forEach((m) =>
    candidates.set(m.id, { id: m.id, raw: m, source: "watchlist", dirScore: 0, actorScore: 0 })
  );

  const hasPersonFilter = !!(prefs.directorId || prefs.actorId);
  const withCountry     = !!prefs.country;

  /* ── Person-filter path ── */
  if (hasPersonFilter) {
    if (prefs.directorId) {
      try {
        const credits = await personMovieCredits(prefs.directorId);
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
  } else {
    /* ── Standard path ── */
    const discoverParams = {};

    const genresToDiscover = effectiveGenres.length > 0 ? effectiveGenres : favGenres.slice(0, 3);
    if (genresToDiscover.length > 0) {
      discoverParams["with_genres"] = genresToDiscover.slice(0, 3).join("|");
    }

    if (prefs.era && eraRanges[prefs.era]) {
      Object.assign(discoverParams, eraRanges[prefs.era]);
    }

    // Country filter on Discover — lower vote floor so art-house films aren't excluded
    if (withCountry) {
      discoverParams["with_origin_country"] = prefs.country;
      discoverParams["vote_count.gte"]      = 20; // lower floor for country-specific cinema
    }

    // When country is selected: skip trending/upcoming (mixed countries) and fetch more pages
    const discoverFetches = [
      discoverMovies({ ...discoverParams, page: 1 }),
      discoverMovies({ ...discoverParams, page: 2 }),
      discoverMovies({ ...discoverParams, page: 3 }),
    ];

    const [disc1, disc2, disc3, trend, upc] = await Promise.all([
      ...discoverFetches,
      withCountry ? Promise.resolve({ results: [] }) : trendingMovies("week"),
      withCountry ? Promise.resolve({ results: [] }) : upcomingMovies(),
    ]);

    [
      ...(disc1.results || []),
      ...(disc2.results || []),
      ...(disc3.results || []),
      ...(trend.results || []),
      ...(upc.results   || []),
    ].forEach((m) => {
      if (!candidates.has(m.id))
        candidates.set(m.id, { id: m.id, raw: m, source: "discover", dirScore: 0, actorScore: 0 });
    });

    // ── Director filmographies ── country-aware
    //
    // When country filter is active: use discoverMovies({ with_crew, with_origin_country })
    // → guaranteed correct country, preserves director affinity boost, API-verified
    //
    // When no country filter: use personMovieCredits for full filmography
    if (topDirs.length > 0) {
      const dirFilms = await Promise.all(
        topDirs.map(([dirId]) =>
          withCountry
            ? discoverMovies({
                with_crew:           dirId,
                with_origin_country: prefs.country,
                "vote_count.gte":    10, // very low floor for country-specific art house
              }).catch(() => ({ results: [] }))
            : personMovieCredits(dirId).catch(() => ({ crew: [] }))
        )
      );

      dirFilms.forEach((data, i) => {
        const [dirId, { name, score }] = topDirs[i];
        const films = withCountry
          ? (data.results || [])
          : (data.crew || []).filter((m) => m.job === "Director");

        films.forEach((m) => {
          if (!candidates.has(m.id)) {
            candidates.set(m.id, {
              id: m.id,
              raw: m,
              // Tag as "discover" when from country-filtered API call — source-aware filter trusts it
              source:   withCountry ? "discover" : "director",
              dirScore: score,
              dirName:  name,
              dirId,
              actorScore: 0,
            });
          }
        });
      });
    }

    // ── Actor filmographies ──
    if (topActors.length > 0) {
      const actorDiscover = await Promise.all(
        topActors.map(([actorId]) =>
          personMovieCredits(actorId).catch(() => ({ cast: [] }))
        )
      );
      actorDiscover.forEach((credits, i) => {
        const [actorId, { name, score }] = topActors[i];
        (credits.cast || []).forEach((m) => {
          if (!candidates.has(m.id)) {
            candidates.set(m.id, {
              id: m.id,
              raw: m,
              source:     "actor",
              dirScore:   0,
              actorScore: score,
              actorName:  name,
              actorId,
            });
          } else {
            const existing = candidates.get(m.id);
            if (existing.actorScore < score) {
              candidates.set(m.id, { ...existing, actorScore: score, actorName: name, actorId });
            }
          }
        });
      });
    }

    // ── Cinephile seed injection ──
    //
    // Active when: user has <50 films (new cinephile, broaden horizons) OR
    //              prefs.expandHorizons (user explicitly requests world-cinema mode)
    // Skipped when country filter is active (the country constraint already narrows scope)
    //
    // Picks 3 random directors from CINEPHILE_DIRECTORS per call for variety.
    const shouldInjectCinephile = (prefs.expandHorizons || watched.length < 50) && !withCountry;

    if (shouldInjectCinephile) {
      const shuffled = [...CINEPHILE_DIRECTORS].sort(() => Math.random() - 0.5);
      const seedDirs = shuffled.slice(0, 3);

      const cinephileFilms = await Promise.all(
        seedDirs.map(({ id }) => personMovieCredits(id).catch(() => ({ crew: [] })))
      );

      cinephileFilms.forEach((credits, i) => {
        const { name } = seedDirs[i];
        const directed = (credits.crew || []).filter((m) => m.job === "Director");
        directed.forEach((m) => {
          if (!candidates.has(m.id)) {
            candidates.set(m.id, {
              id:         m.id,
              raw:        m,
              source:     "cinephile_seed",
              dirScore:   0.55, // moderate baseline — boosted further in scoring
              dirName:    name,
              actorScore: 0,
            });
          }
        });
      });
    }

    // ── TMDB recommendations seeded from top-10 highest-rated watched films ──
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
  /* 7. Country filter — SOURCE-AWARE                                    */
  /*                                                                     */
  /* BUG FIX vs v7:                                                      */
  /* TMDB list/filmography endpoints (/discover/movie, /person/credits,  */
  /* /movie/recommendations) often omit the origin_country field — it    */
  /* only appears reliably in the /movie/{id} detail endpoint.           */
  /*                                                                     */
  /* The old strict filter (reject if origin_country missing) silently   */
  /* dropped discover results that had already been API-filtered with    */
  /* with_origin_country.                                                 */
  /*                                                                     */
  /* New source-aware rules:                                             */
  /*   "discover"  → API already verified → pass through unconditionally */
  /*   "watchlist" → always include                                      */
  /*   "cinephile_seed" → world cinema, not country-bound → pass through */
  /*   everything else  → lenient: allow if origin_country missing;      */
  /*                       reject only if present and doesn't match      */
  /* ================================================================= */

  let filteredPool = pool;
  if (withCountry && !hasPersonFilter) {
    filteredPool = pool.filter(({ source, raw }) => {
      // Discover results fetched with with_origin_country → trust the API filter
      if (source === "discover")        return true;
      // Watchlist: always include regardless of country
      if (source === "watchlist")       return true;
      // Cinephile seeds: world-cinema exploration, not country-bound
      if (source === "cinephile_seed")  return true;

      // For director/actor filmographies and similar:
      // TMDB list responses often omit origin_country.
      // Lenient rule: allow if field missing; reject only if present and wrong.
      const countries = raw?.origin_country;
      if (!Array.isArray(countries) || countries.length === 0) return true;
      return countries.includes(prefs.country);
    });
  }

  /* ================================================================= */
  /* 8. Score each candidate                                             */
  /* ================================================================= */

  const watchedIds = new Set(watched.map((m) => m.id));

  // Adaptive vote count floor:
  // – expandHorizons: 20 (hidden gems, art house, world cinema)
  // – 100+ films seen: 100 (experienced user — filter out obscure noise)
  // – default: 40 (balanced)
  const voteCountFloor = prefs.expandHorizons ? 20 :
                         watched.length >= 100  ? 100 : 40;

  const scored = filteredPool
    .filter(({ id })  => !watchedIds.has(id))
    .filter(({ raw }) => (raw.vote_count   || 0) >= voteCountFloor)
    .filter(({ raw }) => (raw.vote_average || 0) >= 5.5)
    .map(({ id, raw, source, dirScore, dirName, dirId, actorScore, actorName, actorId }) => {
      const genreIds    = raw.genre_ids || [];
      const movieYear   = parseInt((raw.release_date || "").slice(0, 4), 10) || 2000;
      const movieDecade = decade(movieYear);

      // Genre score: cosine-similarity style — weighted match over all matching genres
      const matching = genreIds.filter((g) => favGenres.includes(g));
      const genreScore =
        matching.length > 0
          ? matching.reduce((s, g) => s + (genreAffinity.get(g) || 0), 0) /
            Math.sqrt(matching.length * favGenres.length)
          : 0;

      const voteScore  = Math.min(1, (raw.vote_average || 0) / 10);
      const decScore   = decadeAffinity.get(movieDecade) || 0;
      const dirBonus   = dirScore > 0 ? Math.min(dirScore, 1) : 0;
      const actorBonus = actorScore > 0 ? Math.min(actorScore * 0.85, 0.85) : 0;

      const voteCount  = raw.vote_count || 0;

      // Prestige: well-rated + reasonably known (≥500 votes)
      const isPrestige    = (raw.vote_average || 0) >= 7.5 && voteCount >= 500;
      const prestigeBoost = isPrestige ? 0.08 : 0;

      // Hidden gem: high avg + niche audience (50–2000 votes)
      // Rewards celebrated-in-niche films that would be penalised by a naive vote-count score
      const isHiddenGem    = (raw.vote_average || 0) >= 7.5 && voteCount >= 50 && voteCount < 2000;
      const hiddenGemBoost = isHiddenGem ? 0.12 : 0;

      // Anti-mainstream: films with >30 000 votes are almost certainly blockbusters
      // Apply a small penalty so MCU/franchise entries don't crowd out everything else
      const isMainstream      = voteCount > 30000;
      const mainstreamPenalty = isMainstream ? 0.05 : 0;

      // Cinephile seed extra boost (on top of dirBonus from dirScore:0.55)
      const cinephileBoost = source === "cinephile_seed" ? 0.08 : 0;

      // Rebalanced weights (sum ≈ 1.0):
      // genre 0.28 + vote 0.18 + decade 0.10 + director 0.18 + actor 0.10
      // + prestige 0.08 + hiddenGem 0.12 + cinephile 0.08 − mainstream 0.05 + jitter 0.02
      const score =
        genreScore   * 0.28 +
        voteScore    * 0.18 +
        decScore     * 0.10 +
        dirBonus     * 0.18 +
        actorBonus   * 0.10 +
        prestigeBoost    +
        hiddenGemBoost   +
        cinephileBoost   -
        mainstreamPenalty +
        jitter();

      /* ---- Personal reason tag ---- */
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
            ? (actScore * 5).toFixed(0)
            : (actScore * 5).toFixed(1);
          reason = `${actorName}'s films — you rate them ${stars}★`;
        } else {
          reason = `Starring ${actorName}`;
        }
      } else if (source?.startsWith("similar:")) {
        const seedTitle = source.slice(8);
        const seedEntry = watchedByTitle.get(seedTitle.toLowerCase().trim());
        if (seedEntry?.rated) {
          const stars = starsDisplay(seedEntry.rated);
          const ql    = qualityLabel(raw.vote_average || 0);
          reason = `You gave "${seedTitle}" ${stars} — ${ql} in the same vein`;
        } else {
          reason = `Because you loved "${seedTitle}"`;
        }
      } else if (matching.length > 0) {
        const topG      = [...matching].sort(
          (a, b) => (genreAffinity.get(b) || 0) - (genreAffinity.get(a) || 0)
        )[0];
        const genreName = GENRE_MAP[topG] || "this genre";
        const ql        = qualityLabel(raw.vote_average || 0);
        const scoreStr  = (raw.vote_average || 0).toFixed(1);
        reason = `Your top ${genreName} taste — ${ql} (${scoreStr}/10)`;
      }

      return { id, score, reason, year: movieYear, genreIds, dirName: dirName || null };
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

  // Hard genre filter (mood or explicit genres)
  if (effectiveGenres.length > 0) {
    results = results.filter(({ genreIds: gIds }) =>
      effectiveGenres.some((g) => gIds.includes(g))
    );
  }

  // Diversity enforcement: max 2 films per director in final results
  // (skip when user explicitly picks a director — they WANT that filmography)
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
