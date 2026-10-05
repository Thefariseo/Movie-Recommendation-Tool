import React, { useEffect, useState } from "react";
import Rail from "./Rail";
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
  return (
    <section
      className="catalogue-section"
      aria-label={title}
      aria-busy={loading}
    >
      <div className="catalogue-heading">
        <h2 className="section-title">{title}</h2>
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
        <Rail
          className="film-rail stagger"
          tabIndex={0}
          label={`${title} films, scroll for more`}
        >
          {movies.slice(0, 12).map((m) => (
            <div className="rail-card" key={m.id}>
              <MovieCard movie={m} />
            </div>
          ))}
        </Rail>
      ) : (
        <p className="catalogue-message">No films available right now.</p>
      )}
    </section>
  );
}
