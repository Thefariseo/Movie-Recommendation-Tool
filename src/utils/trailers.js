// Picking the right trailer from TMDB's video list, which comes in no useful
// order: a film's first entry is as likely a TV spot, a Blu-ray advert or a
// fan upload as its official trailer.

// Videos that are adverts or extras, whatever TMDB calls them.
const NOT_A_TRAILER = /\b(tv spot|spot|blu-?ray|dvd|digital|on demand|now available|own it|oscar|awards?|featurette|behind the scenes|interview|review|reaction|clip|b-roll|recap|countdown)\b/i;
// Later cuts of a trailer for re-releases and special editions.
const VARIANT = /\b(b&w|black and white|version|re-?release|anniversary|remaster(ed)?|4k|restoration|ghibli fest|fest)\b/i;

/**
 * YouTube keys to try, best first: official trailers in the member's language
 * or English, then other trailers, then teasers. The trailer released closest
 * to the film itself wins a tie over later re-release trailers.
 */
export function rankTrailers(videos, { language = "en", releaseDate = null } = {}) {
  const released = releaseDate ? Date.parse(releaseDate) : NaN;
  const candidates = (videos?.results || []).filter((v) => v?.site === "YouTube" && v.key && (v.type === "Trailer" || v.type === "Teaser"));
  const score = (v) => {
    let s = 0;
    if (v.type === "Trailer") s += 4;
    if (v.official) s += 2;
    if (/official\b.*\btrailer|trailer ufficiale|main trailer/i.test(v.name || "")) s += 2;
    if (VARIANT.test(v.name || "")) s -= 2;
    if (NOT_A_TRAILER.test(v.name || "")) s -= 6;
    if (v.iso_639_1 === language) s += 3;
    else if (v.iso_639_1 === "en") s += 2;
    if (Number(v.size) >= 1080) s += 0.5;
    const published = Date.parse(v.published_at || "");
    // The trailers that launched the film: from about half a year before release to two months after.
    if (Number.isFinite(released) && Number.isFinite(published) && published - released > -200 * 864e5 && published - released < 60 * 864e5) s += 1.5;
    return s;
  };
  return [...new Set(candidates.map((v) => ({ v, s: score(v) })).sort((a, b) => b.s - a.s).map(({ v }) => v.key))];
}

/** The member's language, as TMDB's two-letter code. */
export const viewerLanguage = () => ((typeof navigator !== "undefined" && navigator.language) || "en").slice(0, 2).toLowerCase();
