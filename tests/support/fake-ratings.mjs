// Stand-in for src/utils/ratings.js: no external ratings are known, so scoring
// uses TMDB's figures and isolates the personal signals under test.
export async function loadRatings() { return new Map(); }
export const withRatings = (movie) => movie;
