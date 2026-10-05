import { createContext, Suspense, useContext, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { lazyPage } from "../utils/lazyPage";
import { reducedMotion } from "../utils/motion";
import { AnimatePresence, m as motion } from "framer-motion";

const ModalCtx = createContext();
export const useModal = () => useContext(ModalCtx);

/* ---------- Root that lives once, usually inside <App> ---------- */
export function ModalProvider({ children }) {
  const [movie, setMovie] = useState(null);
  useEffect(() => rememberPosters(), []);

  // The poster just tapped grows into the film sheet's poster.
  const open = (next) => {
    const poster = recentPoster();
    if (!next || movie || !poster || !modalReady || reducedMotion() || typeof document.startViewTransition !== "function") return setMovie(next);
    const film = { ...next, _posterSrc: poster.currentSrc || poster.src };
    poster.style.viewTransitionName = "film-poster";
    try {
      document.startViewTransition(async () => {
        poster.style.viewTransitionName = "";
        flushSync(() => setMovie(film));
        await document.querySelector("[data-film-poster]")?.decode?.().catch(() => {});
      });
    } catch {
      poster.style.viewTransitionName = "";
      setMovie(film);
    }
  };

  return (
    <ModalCtx.Provider value={{ open, close: () => setMovie(null) }}>
      {children}
      <AnimatePresence>
        {movie && <ModalRoot movie={movie} onClose={() => setMovie(null)} />}
      </AnimatePresence>
    </ModalCtx.Provider>
  );
}

/* ---------- backdrop ---------- */
function ModalRoot({ movie, onClose }) {
  return (
    <motion.div
      key="backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] overflow-y-auto bg-black/75 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Centre vertically; scrollable on small screens */}
      <div className="flex min-h-full items-center justify-center p-4">
        <Suspense fallback={<div className="h-64 w-full max-w-2xl animate-pulse rounded-2xl bg-white/10" role="status" aria-label="Opening the film" />}>
          <MovieModal movie={movie} onClose={onClose} />
        </Suspense>
      </div>
    </motion.div>
  );
}

// The film page (trailer player, critic verdict, look, ratings) loads the
// first time a film is opened, not with the app.
let modalReady = false;
const MovieModal = lazyPage(() => import("../components/MovieModal").then((m) => { modalReady = true; return m; }), "film");

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