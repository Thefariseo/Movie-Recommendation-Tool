// Which way a change of page moves (src/hooks/useSmoothNavigation.js).
//
// Each main destination has a place, left to right as in the navigation (the
// home page's three views first, then Tonight, the critic, the library and
// its tabs, friends, the profile): moving right slides the next page in from
// the right, moving left from the left. Any other page (a person, a list, a
// season…) is a step forward into it, and back out of it.
const MAIN = ["/tonight", "/critic", "/library", "/friends", "/profile"];
const VIEWS = { foryou: 0, cinema: 1, browse: 2 };
const LIBRARY = ["watchlist", "watched", "stats", "map", "journeys", "lists"];

function placeOf(url) {
  if (url.pathname === "/") return [0, VIEWS[url.searchParams.get("view")] ?? 0];
  const i = MAIN.findIndex((p) => url.pathname === p || url.pathname.startsWith(`${p}/`));
  if (i < 0) return null;
  const tab = MAIN[i] === "/library" ? LIBRARY.indexOf(url.pathname.split("/")[2]) : 0;
  return [i + 1, Math.max(0, tab)];
}

// Tonight and a cinema season open like a screening: the lights go down.
const SCREENING = /^\/(tonight|season\/)/;

/** "forward", "back", "fade" (the same place) or "dim", from one URL to another. */
export function transitionKind(from, to) {
  if (SCREENING.test(to.pathname) && !SCREENING.test(from.pathname)) return "dim";
  const a = placeOf(from), b = placeOf(to);
  if (a && b) {
    const step = b[0] - a[0] || b[1] - a[1];
    return step > 0 ? "forward" : step < 0 ? "back" : "fade";
  }
  return b ? "back" : "forward";
}
