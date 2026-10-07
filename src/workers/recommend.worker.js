// Builds recommendations away from the page: scoring hundreds of candidates,
// placing the member in the taste space and judging the shortlist take a
// few hundred milliseconds of computation, which on the page's own thread
// would freeze scrolling and taps while they run. Requests to TMDB and to
// the site share the browser's HTTP cache with the page.
import { getRecommendations } from "../algorithms/recommender.js";
import { assignLanguage } from "../i18n/index.js";

self.onmessage = async ({ data }) => {
  const { id, args, language } = data || {};
  assignLanguage(language);
  try {
    self.postMessage({ id, result: await getRecommendations(args) });
  } catch (e) {
    self.postMessage({ id, error: String(e?.message || e) });
  }
};
