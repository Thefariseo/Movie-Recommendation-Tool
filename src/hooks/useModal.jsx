import { createContext, useContext, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const ModalCtx = createContext();
export const useModal = () => useContext(ModalCtx);

/* ---------- Root that lives once, usually inside <App> ---------- */
export function ModalProvider({ children }) {
  const [movie, setMovie] = useState(null);

  return (
    <ModalCtx.Provider value={{ open: setMovie, close: () => setMovie(null) }}>
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
        <MovieModal movie={movie} onClose={onClose} />
      </div>
    </motion.div>
  );
}

/* import dinamico per evitare circular-deps */
import MovieModal from "../components/MovieModal";