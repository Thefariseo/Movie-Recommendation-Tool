// A film saved to the watchlist flies there: a copy of its poster arcs from
// where the member tapped to the Library in the navigation, which gives a
// little jump as it lands.
import { reducedMotion } from "./motion";

let lastTarget = null, lastAt = 0;

/** Remembers where the member last tapped, where a saved film flies from. */
export function installFlightOrigin(root = document) {
  const onDown = (e) => { lastTarget = e.target; lastAt = Date.now(); };
  root.addEventListener("pointerdown", onDown, { capture: true, passive: true });
  return () => root.removeEventListener("pointerdown", onDown, { capture: true });
}

const inView = (el) => {
  const r = el?.getBoundingClientRect();
  return Boolean(r && r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight);
};

// The poster of the film just saved, by where the member tapped.
function posterOf(movie) {
  const from = lastTarget?.isConnected && Date.now() - lastAt < 4000 ? lastTarget : null;
  if (from?.closest(".film-sheet")) return document.querySelector(".film-sheet [data-film-poster]");
  const img = from?.closest("[data-film-id], .film-card, li, article")?.querySelector("img");
  if (inView(img)) return img;
  const path = movie?.poster_path || movie?.poster;
  return path ? [...document.images].find((i) => i.src.includes(path) && inView(i)) || null : null;
}

// Where the Library sits in the navigation on this screen.
const library = () => [...document.querySelectorAll("a.nav-destination[href='/library']")].find(inView) || null;

/** The Library's link gives a little jump, and its count goes up. */
export function bump() {
  window.dispatchEvent(new Event("umbrify:landed"));
  for (const el of document.querySelectorAll("a.nav-destination[href='/library']")) {
    el.classList.remove("nav-bump");
    void el.offsetWidth;
    el.classList.add("nav-bump");
    el.addEventListener("animationend", () => el.classList.remove("nav-bump"), { once: true });
  }
}

/** Sends the film's poster flying to the Library (or just bumps it). */
export function flyToLibrary(movie) {
  if (typeof document === "undefined") return;
  const img = posterOf(movie), link = library();
  if (reducedMotion() || !img || !link) { bump(); return; }
  const target = link.querySelector("svg") || link;
  const a = img.getBoundingClientRect(), b = target.getBoundingClientRect();
  const ghost = document.createElement("img");
  ghost.src = img.currentSrc || img.src;
  ghost.alt = "";
  ghost.className = "flying-poster";
  Object.assign(ghost.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px` });
  document.body.appendChild(ghost);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const end = Math.max(0.08, Math.min(0.5, 22 / a.width));
  // Up first, then down into the icon: an arc, not a straight line.
  const lift = Math.min(120, Math.abs(dy) * 0.3 + 40);
  const flight = ghost.animate([
    { transform: "translate(0, 0) scale(1) rotate(0deg)", opacity: 1 },
    { transform: `translate(${dx * 0.3}px, ${dy * 0.3 - lift}px) scale(${(1 + end) / 1.7}) rotate(-6deg)`, opacity: 1, offset: 0.38 },
    { transform: `translate(${dx}px, ${dy}px) scale(${end}) rotate(-12deg)`, opacity: 0.4 },
  ], { duration: 720, easing: "cubic-bezier(0.45, 0, 0.55, 1)" });
  flight.finished.then(() => { ghost.remove(); bump(); }, () => ghost.remove());
}
