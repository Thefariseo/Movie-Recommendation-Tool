import React, { useEffect, useId, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Search, X } from "lucide-react";
import axios from "axios";
import { useModal } from "@/hooks/useModal";
export default function SearchBar() {
  const [query, setQuery] = useState(""),
    [results, setResults] = useState([]);
  const [show, setShow] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [active, setActive] = useState(-1);
  const id = useId(),
    wrapper = useRef(null),
    input = useRef(null);
  const { pathname } = useLocation();
  const { open } = useModal();
  useEffect(() => {
    setShow(false);
  }, [pathname]);
  useEffect(() => {
    const outside = (e) => {
      if (!wrapper.current?.contains(e.target)) setShow(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  useEffect(() => {
    setResults([]);
    setError("");
    setActive(-1);
    if (!query.trim()) {
      setBusy(false);
      return;
    }
    const controller = new AbortController();
    setBusy(true);
    const timer = setTimeout(async () => {
      try {
        const res = await axios.get(
          "https://api.themoviedb.org/3/search/movie",
          {
            signal: controller.signal,
            params: {
              api_key: import.meta.env.VITE_TMDB_KEY,
              query: query.trim(),
              include_adult: false,
            },
          },
        );
        if (!controller.signal.aborted)
          setResults(res.data.results.slice(0, 7));
      } catch (e) {
        if (!controller.signal.aborted)
          setError("Search is unavailable. Please try again.");
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);
  const choose = (m) => {
    open(m);
    setShow(false);
    input.current?.focus();
  };
  const expanded = show && !!query.trim();
  return (
    <div
      ref={wrapper}
      className="global-search"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setShow(false);
      }}
    >
      <Search
        size={18}
        className="shrink-0 text-slate-400"
        aria-hidden="true"
      />
      <input
        ref={input}
        type="search"
        role="combobox"
        aria-label="Search all films"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={`${id}-results`}
        aria-activedescendant={
          expanded && active >= 0 ? `${id}-${active}` : undefined
        }
        placeholder="Search any film…"
        value={query}
        autoComplete="off"
        onChange={(e) => {
          setQuery(e.target.value);
          setShow(true);
          setActive(-1);
        }}
        onFocus={() => setShow(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setShow(false);
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setShow(true);
            setActive((n) => Math.min(n + 1, results.length - 1));
          }
          if (e.key === "ArrowUp" && results.length) {
            e.preventDefault();
            setActive((n) => Math.max(n - 1, 0));
          }
          if (e.key === "Enter" && expanded && results[active]) {
            e.preventDefault();
            choose(results[active]);
          }
        }}
      />
      {query && (
        <button
          aria-label="Clear search"
          className="search-clear"
          onClick={() => {
            setQuery("");
            input.current?.focus();
          }}
        >
          <X size={16} />
        </button>
      )}
      {expanded && (
        <div className="search-popover">
          <p className="px-4 pb-2 pt-3 text-xs font-medium text-slate-500">
            Search the film catalogue
          </p>
          <ul id={`${id}-results`} role="listbox" aria-label="Film results">
            {results.map((m, i) => (
              <li
                key={m.id}
                id={`${id}-${i}`}
                role="option"
                aria-selected={active === i}
              >
                <button
                  tabIndex={-1}
                  className={`search-result ${active === i ? "search-active" : ""}`}
                  onClick={() => choose(m)}
                >
                  <img
                    src={
                      m.poster_path
                        ? `https://image.tmdb.org/t/p/w92${m.poster_path}`
                        : "/placeholder_poster.svg"
                    }
                    alt=""
                    width="32"
                    height="48"
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {m.title}
                    </span>
                    <span className="text-xs text-slate-500">
                      {m.release_date?.slice(0, 4) ||
                        "Release date unavailable"}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {(busy || error || !results.length) && (
            <p role="status" className="px-4 py-4 text-sm text-slate-500">
              {busy
                ? "Searching…"
                : error || "No films found. Try another title."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
