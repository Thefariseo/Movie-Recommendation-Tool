// =====================================================
// RecommendationList – collapsible horizontal carousel
// =====================================================
import React, { useEffect, useState } from "react";
import MovieCard from "./MovieCard";
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";

const scrollAmount = 500;

export default function RecommendationList({ title, endpoint, defaultOpen = false }) {
  const [movies, setMovies]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen]   = useState(defaultOpen);

  useEffect(() => {
    let cancelled = false;

    async function fetchMovies() {
      setLoading(true);
      try {
        const res = await axios.get(endpoint);
        if (!cancelled) setMovies(res.data.results);
      } catch (err) {
        console.error("Failed fetching movies", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchMovies();
    return () => (cancelled = true);
  }, [endpoint]);

  return (
    <section className="mb-2">
      {/* ── Clickable header ── */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="mb-3 flex w-full items-center justify-between px-4 text-left group"
        aria-expanded={isOpen}
      >
        <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors md:text-2xl">
          {title}
        </h2>
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.25 }}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-500 group-hover:bg-indigo-100 group-hover:text-indigo-600 dark:bg-slate-800 dark:text-slate-400 dark:group-hover:bg-indigo-900/30 dark:group-hover:text-indigo-400 transition-colors"
        >
          <ChevronDown className="h-4 w-4" />
        </motion.span>
      </button>

      {/* ── Collapsible carousel ── */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="relative pb-6">
              <motion.button
                whileTap={{ scale: 0.9 }}
                className="absolute left-0 top-1/2 z-10 -translate-y-1/2 rounded-r-lg bg-white/70 p-2 shadow hover:bg-white dark:bg-slate-800 dark:hover:bg-slate-700"
                onClick={() =>
                  document.getElementById(title)?.scrollBy({ left: -scrollAmount, behavior: "smooth" })
                }
                aria-label="Scroll Left"
              >
                <ChevronLeft className="h-6 w-6" />
              </motion.button>

              <div id={title} className="scrollbar-hide flex gap-4 overflow-x-auto px-8">
                {loading ? (
                  <div className="mx-auto flex w-full items-center justify-center py-12">
                    <span className="loading loading-bars loading-lg" />
                  </div>
                ) : (
                  movies.slice(0, 10).map((m) => (
                    <MovieCard key={m.id} movie={m} />
                  ))
                )}
              </div>

              <motion.button
                whileTap={{ scale: 0.9 }}
                className="absolute right-0 top-1/2 z-10 -translate-y-1/2 rounded-l-lg bg-white/70 p-2 shadow hover:bg-white dark:bg-slate-800 dark:hover:bg-slate-700"
                onClick={() =>
                  document.getElementById(title)?.scrollBy({ left: scrollAmount, behavior: "smooth" })
                }
                aria-label="Scroll Right"
              >
                <ChevronRight className="h-6 w-6" />
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Thin divider when collapsed */}
      {!isOpen && (
        <div className="mx-4 border-t border-slate-100 dark:border-slate-800" />
      )}
    </section>
  );
}
