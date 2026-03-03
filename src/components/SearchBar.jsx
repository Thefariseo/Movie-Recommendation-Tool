// =====================================================
// File: SearchBar.jsx
// Description: Movie search bar with debounced input and suggestions dropdown.
// =====================================================
import React, { useState, useEffect } from "react";
import { Search } from "lucide-react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { useModal } from "@/hooks/useModal";

export default function SearchBar() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [show, setShow] = useState(false);
  const { open } = useModal();

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timeout = setTimeout(async () => {
      try {
        const res = await axios.get("https://api.themoviedb.org/3/search/movie", {
          params: {
            api_key: import.meta.env.VITE_TMDB_KEY,
            query,
          },
        });
        setResults(res.data.results.slice(0, 7));
      } catch (err) {
        console.error(err);
      }
    }, 400); // debounce

    return () => clearTimeout(timeout);
  }, [query]);

  return (
    <div className="relative">
      <div className="flex items-center rounded-lg bg-white p-2 shadow dark:bg-slate-800">
        <Search className="h-5 w-5 text-slate-400" />
        <input
          type="text"
          className="ml-2 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400 dark:text-slate-100"
          placeholder="Search for a movie..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShow(true);
          }}
        />
      </div>

      <AnimatePresence>
        {show && results.length > 0 && (
          <motion.ul
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute z-50 mt-2 w-full divide-y divide-slate-100 rounded-lg bg-white shadow-lg dark:divide-slate-700 dark:bg-slate-800"
          >
            {results.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => {
                    open(m);
                    setShow(false);
                  }}
                  className="flex w-full items-center …"
                >
                  <img
                    src={m.poster_path ? `https://image.tmdb.org/t/p/w92${m.poster_path}` : "/placeholder_poster.svg"}
                    alt={m.title}
                    className="h-12 w-8 object-cover"
                  />
                  <span className="line-clamp-1 text-sm text-slate-800 dark:text-slate-200">{m.title}</span>
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
