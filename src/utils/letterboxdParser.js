// =====================================================
// Letterboxd CSV parser + TMDB resolver
// Handles: ratings.csv  (Date,Name,Year,Letterboxd URI,Rating)
//          watched.csv  (Date,Name,Year,Letterboxd URI)
// =====================================================
import Papa from "papaparse";
import { searchMovies } from "./api";

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
export async function resolveToTMDB({ entries, onProgress, onResult, signal }) {
  const failed = [];
  let resolved = 0;

  for (let i = 0; i < entries.length; i++) {
    if (signal?.aborted) break;

    const entry = entries[i];
    try {
      const res = await searchMovies(entry.title, 1);
      const candidates = res?.results ?? [];

      // 1. Exact year
      let match = candidates.find(
        (m) => parseInt((m.release_date || "").slice(0, 4), 10) === entry.year
      );
      // 2. Year ± 1  (region release delays)
      if (!match) {
        match = candidates.find((m) => {
          const y = parseInt((m.release_date || "").slice(0, 4), 10);
          return Math.abs(y - (entry.year || 0)) <= 1;
        });
      }
      // 3. Best title similarity
      if (!match && candidates.length) {
        const tl = entry.title.toLowerCase();
        match =
          candidates.find(
            (m) =>
              (m.title || "").toLowerCase() === tl ||
              (m.original_title || "").toLowerCase() === tl
          ) || candidates[0];
      }

      if (match) {
        onResult?.({
          id: match.id,
          title: match.title,
          poster: match.poster_path,
          genres: match.genre_ids || [],
          year: parseInt((match.release_date || "").slice(0, 4), 10) || entry.year,
          rated: entry.rating, // 1-10 or null
        });
        resolved++;
      } else {
        failed.push(entry.title);
      }
    } catch {
      failed.push(entry.title);
    }

    onProgress?.(i + 1, entries.length);

    // Throttle: pause every 15 requests to stay well under TMDB rate limit
    if ((i + 1) % 15 === 0) await new Promise((r) => setTimeout(r, 200));
  }

  return { resolved, failed };
}
