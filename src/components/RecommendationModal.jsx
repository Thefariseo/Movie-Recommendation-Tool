import React from "react";
import { Plus, Check, RefreshCcw } from "lucide-react";
import { motion } from "framer-motion";
import useWatchlist from "../hooks/useWatchlist";
import useRecommend from "../hooks/useRecommend";
import Spinner from "./Spinner";

export default function RecommendationModal({ onClose }) {
  const { pick, loading, refresh } = useRecommend();
  const { isInWatchlist, addToWatchlist, removeFromWatchlist } = useWatchlist();

  if (loading || !pick) return <Spinner />;

  const inList = isInWatchlist(pick.id);
  const toggleList = () =>
    inList ? removeFromWatchlist(pick.id) : addToWatchlist(pick);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] grid place-items-center bg-black/50 p-4"
    >
      <motion.div
        key={pick.id}
        initial={{ rotateY: 90, scale: 0.8 }}
        animate={{ rotateY: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 20 }}
        className="relative w-full max-w-md …"
      >
        <button
          className="absolute right-4 top-4 text-2xl font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          onClick={onClose}
        >
          ×
        </button>

        <img
          src={
            pick.poster_path
              ? `https://image.tmdb.org/t/p/w500${pick.poster_path}`
              : "/placeholder_poster.svg"
          }
          alt={pick.title}
          className="mx-auto mb-4 h-64 rounded-lg object-cover"
        />
        <h2 className="mb-2 text-center text-xl font-semibold">{pick.title}</h2>
        <p className="mb-4 line-clamp-4 text-sm text-slate-600 dark:text-slate-300">
          {pick.overview}
        </p>

        <div className="flex items-center justify-between">
          <button
            onClick={toggleList}
            className="flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-500"
          >
            {inList ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {inList ? "In Watchlist" : "Add to Watchlist"}
          </button>

          <button
            onClick={refresh}
            className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-700"
          >
            <RefreshCcw className="h-4 w-4" /> Another pick
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}