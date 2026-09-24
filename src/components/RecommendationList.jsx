import React, { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import MovieCard from "./MovieCard";
import { trendingMovies, topRatedMovies, upcomingMovies } from "@/utils/api";
const FETCHERS = {
  trending: () => trendingMovies("week"),
  top_rated: () => topRatedMovies(1),
  upcoming: () => upcomingMovies(1),
};
export default function RecommendationList({ title, type }) {
  const [movies, setMovies] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(false),
    [retry, setRetry] = useState(0);
  const rail = useRef(null);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    FETCHERS[type]()
      .then((data) => {
        if (!cancelled) setMovies(data.results || []);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [type, retry]);
  const scroll = (direction) =>
    rail.current?.scrollBy({
      left: direction * rail.current.clientWidth * 0.8,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  return (
    <section
      className="catalogue-section"
      aria-label={title}
      aria-busy={loading}
    >
      <div className="catalogue-heading">
        <h2>{title}</h2>
        <div className="flex gap-1">
          <button
            className="icon-control"
            onClick={() => scroll(-1)}
            aria-label={`Previous ${title} films`}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            className="icon-control"
            onClick={() => scroll(1)}
            aria-label={`More ${title} films`}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      {error ? (
        <div className="catalogue-message" role="status">
          We couldn’t load these films.{" "}
          <button onClick={() => setRetry((n) => n + 1)}>Try again</button>
        </div>
      ) : loading ? (
        <div
          className="film-rail"
          role="status"
          aria-label={`Loading ${title}`}
        >
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div className="film-skeleton" key={i} />
          ))}
        </div>
      ) : movies.length ? (
        <div
          ref={rail}
          className="film-rail"
          tabIndex={0}
          aria-label={`${title} films, scroll for more`}
        >
          {movies.slice(0, 12).map((m) => (
            <div className="rail-card" key={m.id}>
              <MovieCard movie={m} />
            </div>
          ))}
        </div>
      ) : (
        <p className="catalogue-message">No films available right now.</p>
      )}
    </section>
  );
}
