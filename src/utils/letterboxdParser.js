// =====================================================
// Letterboxd CSV parser + TMDB resolver
// Handles: ratings.csv  (Date,Name,Year,Letterboxd URI,Rating)
//          watched.csv  (Date,Name,Year,Letterboxd URI)
// =====================================================
import Papa from "papaparse";
import { importCandidates, localTitle, searchMovies, movieCore } from "./api";
import { backend } from "./backend";
import { bestMatch, certain } from "../../shared/titleMatch.js";

/** Detect format by header presence of "Rating" column */
export function detectFormat(headers) {
  const h = headers.map((s) => s.trim().toLowerCase());
  return h.includes("rating") ? "ratings" : "watched";
}

/**
 * Parse a Letterboxd CSV string.
 * Returns { format, entries: [{ title, year, rating|null, uri, date }] }
 *
 * Rating is converted from Letterboxd 0.5-5 scale → internal 1-10 scale.
 */
export function parseLetterboxdCSV(csvText) {
  const { data } = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  if (!data.length) return { format: "unknown", entries: [] };

  const format = detectFormat(Object.keys(data[0]));

  const entries = data
    .map((row) => {
      const title = (row.Name || row.name || "").trim();
      const year = parseInt(row.Year || row.year || "0", 10) || null;
      const uri = (row["Letterboxd URI"] || "").trim();
      const date = (row.Date || row.date || "").trim();

      // Letterboxd: 0.5-5 stars → multiply by 2 → internal 1-10
      const raw = parseFloat(row.Rating || row.rating || "0");
      const rating = raw > 0 ? Math.round(raw * 2) : null;

      return title ? { title, year, rating, uri, date } : null;
    })
    .filter(Boolean);

  return { format, entries };
}

/**
 * Merge ratings + watched entry lists.
 * Ratings file wins (has rating), watched-only entries are kept unrated.
 * De-duplication key: Letterboxd URI (unique) or "title|year".
 */
export function mergeEntries(ratingsEntries, watchedEntries) {
  const map = new Map();

  for (const e of ratingsEntries) {
    const key = e.uri || `${e.title.toLowerCase()}|${e.year}`;
    map.set(key, e);
  }

  for (const e of watchedEntries) {
    const key = e.uri || `${e.title.toLowerCase()}|${e.year}`;
    if (!map.has(key)) map.set(key, { ...e, rating: null });
  }

  return Array.from(map.values());
}

/**
 * Resolve merged entries to TMDB objects.
 *
 * @param {object[]} entries  - merged list from mergeEntries()
 * @param {Function} onProgress(current, total)
 * @param {Function} onResult(movie)  - called for each success
 * @param {AbortSignal} signal
 * @returns {{ resolved: number, failed: string[] }}
 */
/**
 * The film the import used to pick for an entry, before titleMatch: the first
 * result of the entry's year (or a year off) among a search in the interface
 * language, else the first result. Re-importing finds and replaces its
 * mistakes (a making-of in place of Salò).
 */
export function legacyMatch(candidates, entry) {
  const yearOf = (m) => parseInt((m.release_date || "").slice(0, 4), 10);
  const tl = String(entry.title || "").toLowerCase();
  return candidates.find((m) => yearOf(m) === entry.year)
    || candidates.find((m) => Math.abs(yearOf(m) - (entry.year || 0)) <= 1)
    || candidates.find((m) => (m.title || "").toLowerCase() === tl || (m.original_title || "").toLowerCase() === tl)
    || candidates[0] || null;
}

export async function resolveToTMDB({ entries, onProgress, onResult, signal, owned = new Set(), exact = exactFilms }) {
  const failed = [];
  const doubtful = [];
  let resolved = 0, done = 0, next = 0;

  const emit = async (entry, match) => {
    try {
      if (!match) {
        failed.push(entry.title);
        return;
      }
      // A film not in the library yet may have been imported wrongly before:
      // the film the old matching chose, when the member has it, is replaced.
      let replaces = null;
      if (owned.size && !owned.has(match.id)) {
        const legacy = legacyMatch((await searchMovies(entry.title, 1).catch(() => null))?.results || [], entry);
        if (legacy && legacy.id !== match.id && owned.has(legacy.id)) replaces = legacy.id;
      }
      onResult?.({
        replaces,
        id: match.id,
        title: await localTitle(match),
        poster: match.poster_path,
        genres: match.genre_ids || (match.genres || []).map((g) => g.id),
        year: parseInt((match.release_date || "").slice(0, 4), 10) || entry.year,
        rated: entry.rating, // 1-10 or null
      });
      resolved++;
    } catch {
      failed.push(entry.title);
    } finally {
      onProgress?.(++done, entries.length);
    }
  };

  // A few entries at a time: each asks TMDB twice, and the client keeps six
  // requests in flight. An entry whose title and year leave a doubt waits for
  // its Letterboxd page to say which film it is.
  const worker = async () => {
    while (next < entries.length && !signal?.aborted) {
      const entry = entries[next++];
      let candidates = [];
      try {
        candidates = await importCandidates(entry.title, entry.year);
      } catch {/* the Letterboxd page may still know */}
      const match = bestMatch(candidates, entry);
      if (entry.uri && !certain(match, candidates, entry)) doubtful.push({ entry, match });
      else await emit(entry, match);
    }
  };
  await Promise.all([worker(), worker(), worker()]);

  for (let i = 0; i < doubtful.length && !signal?.aborted; i += 25) {
    const group = doubtful.slice(i, i + 25);
    const films = await exact(group.map((d) => d.entry.uri)).catch(() => ({}));
    await Promise.all(group.map(async ({ entry, match }) => {
      const id = films[entry.uri];
      if (!id || id === match?.id) return emit(entry, match);
      const film = await movieCore(id).catch(() => null);
      return emit(entry, film?.id ? film : match);
    }));
  }

  return { resolved, failed };
}

/** TMDB ids for Letterboxd film links, read by the server from each film's page. */
export async function exactFilms(links) {
  return (await backend("library?action=letterboxd-films", { links })).films || {};
}
