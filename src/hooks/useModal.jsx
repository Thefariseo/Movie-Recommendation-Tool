import { createContext, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useLocation } from "react-router-dom";
import { lazyPage } from "../utils/lazyPage";
import { reducedMotion } from "../utils/motion";
import { AnimatePresence, m as motion } from "framer-motion";

const ModalCtx = createContext();
export const useModal = () => useContext(ModalCtx);

/* ---------- Root that lives once, usually inside <App> ---------- */
// The film sheet opens out of the card the member tapped, like a curtain (the
// card, its poster and its title grow into the sheet's), and closes back into
// the film's card while one is in view. Following a link out of the sheet (a
// cast member, the director) closes it inside that page's own transition.
export function ModalProvider({ children }) {
  // The film shown, the page it was opened on, and whether it came out of its
  // card (the sheet then skips its own entrance).
  const [shown, setShown] = useState(null);
  // Bumped to drop a closing sheet at once, with no fading out.
  const [generation, setGeneration] = useState(0);
  const now = useRef(null);
  now.current = shown;
  const { pathname } = useLocation();
  const page = useRef(pathname);
  page.current = pathname;
  const origin = useRef(null);
  const closing = useRef(false);
  useEffect(() => rememberPosters(), []);
  // A film is open on one page: a link followed out of it leaves it behind.
  useEffect(() => { if (now.current && now.current.at !== pathname) setShown(null); }, [pathname]);

  const open = useCallback((next) => {
    if (!next) return;
    // A film opened from inside the sheet takes the sheet's place.
    const poster = now.current ? null : recentPoster();
    const card = poster?.closest("[data-film-id], button, a") || null;
    if (!now.current) origin.current = card ? { card, id: String(next.id) } : null;
    // (A sheet still fading out would share the names the card takes.)
    if (!poster || !canMorph() || document.querySelector(".film-sheet")) { setShown({ movie: next, at: page.current }); return; }
    const movie = { ...next, _posterSrc: poster.currentSrc || poster.src };
    const parts = cardParts(card, poster);
    const html = document.documentElement;
    name(parts, true);
    html.dataset.curtain = "open";
    try {
      const vt = document.startViewTransition(async () => {
        name(parts, false);
        flushSync(() => setShown({ movie, at: page.current, curtain: true }));
        await document.querySelector("[data-film-poster]")?.decode?.().catch(() => {});
      });
      vt.finished.finally(() => { delete html.dataset.curtain; });
    } catch {
      name(parts, false);
      delete html.dataset.curtain;
      setShown({ movie, at: page.current });
    }
  }, []);

  const close = useCallback(() => {
    const film = now.current?.movie;
    if (!film || closing.current) return;
    // A link out of the sheet is opening its page, whose transition closes it.
    if (document.documentElement.dataset.vt) return;
    const card = canMorph() ? cardInView(film, origin.current) : null;
    if (!card) { setShown(null); return; }
    const parts = cardParts(card, card.querySelector("img"));
    const html = document.documentElement;
    closing.current = true;
    html.dataset.curtain = "close";
    const done = () => { name(parts, false); closing.current = false; delete html.dataset.curtain; };
    try {
      const vt = document.startViewTransition(() => {
        flushSync(() => { setShown(null); setGeneration((g) => g + 1); });
        name(parts, true);
      });
      vt.finished.finally(done);
    } catch {
      done();
      setShown(null);
    }
  }, []);

  const value = useMemo(() => ({ open, close }), [open, close]);
  return (
    <ModalCtx.Provider value={value}>
      {children}
      <AnimatePresence key={`${generation} ${pathname}`}>
        {shown && shown.at === pathname && <ModalRoot key="film" movie={shown.movie} curtain={Boolean(shown.curtain)} onClose={close} />}
      </AnimatePresence>
    </ModalCtx.Provider>
  );
}

const canMorph = () => MovieModal.ready() && !reducedMotion() && typeof document.startViewTransition === "function";

// The parts of a film card that turn into the sheet's: the card itself (the
// sheet's frame), its poster and its title (src/index.css, "The film sheet").
function cardParts(card, poster) {
  return [[card, "film-frame"], [poster, "film-poster"], [card?.querySelector(".film-title"), "film-title"]]
    .filter(([el], i, all) => el && all.findIndex(([other]) => other === el) === i);
}
function name(parts, on) {
  for (const [el, n] of parts) el.style.viewTransitionName = on ? n : "";
}

// The film's card on the page behind the sheet, if one is in view: the one it
// opened from, or another showing the same film.
function cardInView(film, from) {
  const inView = (el) => {
    if (!el?.isConnected || el.closest("[role=dialog]") || !el.querySelector("img")) return false;
    const r = el.getBoundingClientRect();
    return r.width >= 40 && r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth;
  };
  const id = String(film.id);
  if (from?.id === id && inView(from.card)) return from.card;
  return [...document.querySelectorAll(`[data-film-id="${CSS.escape(id)}"]`)].find(inView) || null;
}

/* ---------- backdrop ---------- */
function ModalRoot({ movie, curtain, onClose }) {
  const root = useRef(null);
  // A dialog: Escape closes it, the page behind stays still, and focus moves
  // into it and back to where it was when it closes.
  useEffect(() => {
    const before = document.activeElement;
    const html = document.documentElement;
    const overflow = html.style.overflow;
    html.style.overflow = "hidden";
    root.current?.focus({ preventScroll: true });
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      html.style.overflow = overflow;
      before?.focus?.({ preventScroll: true });
    };
  }, [onClose]);
  return (
    <motion.div
      key="backdrop"
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-label={movie.title}
      tabIndex={-1}
      // Out of its card, the page transition already brings it in.
      initial={curtain ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] overflow-y-auto bg-black/75 backdrop-blur-sm focus:outline-none"
      onClick={onClose}
    >
      {/* The film's own light behind its sheet (src/utils/ambient.js). */}
      <div className="film-overlay-light" aria-hidden="true" />
      {/* Centre vertically; scrollable on small screens */}
      <div className="film-sheet-wrap flex min-h-full items-center justify-center p-4">
        <Suspense fallback={<div className="h-64 w-full max-w-2xl animate-pulse rounded-2xl bg-white/10" role="status" aria-label="Opening the film" />}>
          <MovieModal movie={movie} curtain={curtain} onClose={onClose} />
        </Suspense>
      </div>
    </motion.div>
  );
}

// The film page (trailer player, critic verdict, look, ratings) loads the
// first time a film is opened, or ahead of it once the app is idle, not
// with the app.
const MovieModal = lazyPage(() => import("../components/MovieModal"), "film");

// The poster image under the member's last tap, for a moment after it.
let lastPoster = null, lastTap = 0;
function rememberPosters() {
  const onDown = (e) => {
    const box = e.target.closest?.("button, a");
    const img = e.target.tagName === "IMG" ? e.target : box?.querySelector("img");
    lastPoster = img && img.naturalWidth && img.getBoundingClientRect().width >= 48 ? img : null;
    lastTap = Date.now();
  };
  document.addEventListener("pointerdown", onDown, true);
  return () => document.removeEventListener("pointerdown", onDown, true);
}
const recentPoster = () => (lastPoster?.isConnected && Date.now() - lastTap < 4000 ? lastPoster : null);
