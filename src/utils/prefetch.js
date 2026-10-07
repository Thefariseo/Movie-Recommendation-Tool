// A film's details start downloading the moment a finger touches its card
// (or a mouse rests on it), so its sheet opens already filled in. Elements
// that open a film carry data-film-id.
import { movieDetails } from "./api";
import { preloadPage } from "./lazyPage";
import { posterColours } from "./filmColor";

const warmed = new Set();

const posterOf = (el) => /\/t\/p\/w\d+(\/[^?#]+)$/.exec(el?.querySelector?.("img")?.getAttribute("src") || "")?.[1] || null;

/** Fetches a film's full details (and the film sheet's code) ahead of opening it. */
export function prefetchFilm(id, poster = null) {
  // Its colours too, so its sheet opens already in them.
  if (poster) posterColours(poster);
  const film = Number(id);
  if (!Number.isSafeInteger(film) || film <= 0 || warmed.has(film)) return;
  warmed.add(film);
  preloadPage("film");
  movieDetails(film).catch(() => warmed.delete(film));
}

/** The same, for a card (an element with data-film-id). */
export const prefetchCard = (el) => prefetchFilm(el.dataset.filmId, posterOf(el));

export function installFilmPrefetch(root = document) {
  const saveData = typeof navigator !== "undefined" && navigator.connection?.saveData;
  const target = (e) => e.target.closest?.("[data-film-id]");
  let timer = null;
  // A touch or a click is a near-certain open: always fetched.
  const onDown = (e) => {
    const el = target(e);
    if (el) prefetchFilm(el.dataset.filmId, posterOf(el));
  };
  // A mouse resting on a card for a moment is likely to click it.
  const onOver = (e) => {
    if (e.pointerType !== "mouse" || saveData) return;
    clearTimeout(timer);
    const el = target(e);
    if (el) timer = setTimeout(() => prefetchFilm(el.dataset.filmId, posterOf(el)), 90);
  };
  const onOut = () => clearTimeout(timer);
  root.addEventListener("pointerdown", onDown, { capture: true, passive: true });
  root.addEventListener("pointerover", onOver, { capture: true, passive: true });
  root.addEventListener("pointerout", onOut, { capture: true, passive: true });
  return () => {
    clearTimeout(timer);
    root.removeEventListener("pointerdown", onDown, { capture: true });
    root.removeEventListener("pointerover", onOver, { capture: true });
    root.removeEventListener("pointerout", onOut, { capture: true });
  };
}
