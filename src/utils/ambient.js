// The site's ambient light: a soft glow behind the page in the colours of the
// film in front of the member (the one in the middle of the screen on the
// home page, or the one whose sheet is open), fading from film to film like a
// television's backlight. Two CSS colour properties carry it (--ambient-1,
// --ambient-2, registered in src/index.css so they transition); nothing is
// lit for those who asked their system for less motion.
import { reducedMotion } from "./motion";

let glow = null;
let film = null;
let place = null; // { x, y } in % of the screen: where the glow's film is
const css = (rgb) => `rgb(${rgb.join(" ")})`;

function apply() {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const colours = film || glow;
  if (!colours || reducedMotion()) {
    for (const p of ["--ambient-1", "--ambient-2", "--ambient-x", "--ambient-y"]) root.style.removeProperty(p);
    root.classList.remove("ambient-film");
    return;
  }
  root.style.setProperty("--ambient-1", css(colours.base));
  root.style.setProperty("--ambient-2", css(colours.accent));
  // An open sheet is lit from above; the home's glow sits behind its film.
  const at = film ? { x: 50, y: 18 } : place || { x: 50, y: 35 };
  root.style.setProperty("--ambient-x", `${at.x}%`);
  root.style.setProperty("--ambient-y", `${at.y}%`);
  root.classList.toggle("ambient-film", !!film);
}

/**
 * The home page's glow follows the film in the middle of the screen (null:
 * none); `at` is where that film is, in % of the screen.
 */
export function setGlow(colours, at = null) {
  glow = colours;
  place = at;
  apply();
}

/** An open film sheet lights the page in its colours until it closes (null). */
export function setFilmLight(colours) {
  film = colours;
  apply();
}
