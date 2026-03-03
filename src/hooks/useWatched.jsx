// =====================================================
// Hook + provider: Watched catalogue (localStorage-backed)
// =====================================================
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

/**
 * shape: {
 *   id:        number,          // TMDB id
 *   title:     string,
 *   poster:    string | null,   // poster_path
 *   genres:    number[],        // TMDB genre ids
 *   year:      number,          // release year
 *   rated?:    number           // optional user rating 1-10
 * }
 */
export const WatchedContext = createContext(null);

/* ---------- Provider ---------- */
export function WatchedProvider({ children }) {
  const [watched, setWatched] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("watched")) ?? [];
    } catch {
      return [];
    }
  });

  /* persist on change */
  useEffect(() => {
    localStorage.setItem("watched", JSON.stringify(watched));
  }, [watched]);

  /* helpers */
  const isWatched = useCallback(
    (id) => watched.some((m) => m.id === id),
    [watched]
  );

  const addWatched = useCallback((movie) => {
    setWatched((prev) => {
      if (prev.find((m) => m.id === movie.id)) return prev;
      return [...prev, movie];
    });
  }, []);

  const removeWatched = useCallback((id) => {
    setWatched((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const clearWatched = useCallback(() => setWatched([]), []);

  /** bulk insert (e.g. CSV) */
  const bulkAdd = useCallback((movies) => {
    setWatched((prev) => {
      const ids = new Set(prev.map((m) => m.id));
      const merged = [
        ...prev,
        ...movies.filter((m) => !ids.has(m.id)),
      ];
      return merged;
    });
  }, []);

  /** optionally update user rating */
  const updateRating = useCallback((id, rated) => {
    setWatched((prev) =>
      prev.map((m) => (m.id === id ? { ...m, rated } : m))
    );
  }, []);

  const value = {
    watched,
    isWatched,
    addWatched,
    removeWatched,
    bulkAdd,
    clearWatched,
    updateRating,
  };

  return (
    <WatchedContext.Provider value={value}>
      {children}
    </WatchedContext.Provider>
  );
}

/* ---------- Hook ---------- */
export default function useWatched() {
  const ctx = useContext(WatchedContext);
  if (!ctx) {
    throw new Error("useWatched must be used inside <WatchedProvider>");
  }
  return ctx;
}