// A film's details start downloading the moment a finger touches its card
// (or a mouse rests on it), so its sheet opens already filled in. Elements
// that open a film carry data-film-id.
import { movieDetails } from "./api";
import { preloadPage } from "./lazyPage";

const warmed = new Set();

/** Fetches a film's full details (and the film sheet's code) ahead of opening it. */
export function prefetchFilm(id) {
  const film = Number(id);
  if (!Number.isSafeInteger(film) || film <= 0 || warmed.has(film)) return;
  warmed.add(film);
  preloadPage("film");
  movieDetails(film).catch(() => warmed.delete(film));
}

export function installFilmPrefetch(root = document) {
  const saveData = typeof navigator !== "undefined" && navigator.connection?.saveData;
  const target = (e) => e.target.closest?.("[data-film-id]");
  let timer = null;
  // A touch or a click is a near-certain open: always fetched.
  const onDown = (e) => {
    const el = target(e);
    if (el) prefetchFilm(el.dataset.filmId);
  };
  // A mouse resting on a card for a moment is likely to click it.
  const onOver = (e) => {
    if (e.pointerType !== "mouse" || saveData) return;
    clearTimeout(timer);
    const el = target(e);
    if (el) timer = setTimeout(() => prefetchFilm(el.dataset.filmId), 90);
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
