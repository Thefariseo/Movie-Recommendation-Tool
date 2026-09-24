import React, { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import MovieCard from "./MovieCard";
import { trendingMovies, topRatedMovies, upcomingMovies, nowPlayingMovies, discoverMovies } from "@/utils/api";
// A different country each day for the world tour.
const WORLD = ["KR", "JP", "FR", "IT", "IR", "MX", "DE", "ES", "TW", "BR", "DK", "IN", "SE", "AR", "PL", "TR"];
export const worldCountry = (day = Math.floor(Date.now() / 86400000)) => WORLD[day % WORLD.length];
const FETCHERS = {
  trending: () => trendingMovies("week"),
  top_rated: () => topRatedMovies(1),
  upcoming: () => upcomingMovies(1),
  now_playing: () => nowPlayingMovies(1),
  // Films rated as highly as the classics everyone knows, by far fewer people.
  hidden: () => discoverMovies({ sort_by: "vote_average.desc", "vote_average.gte": 7.8, "vote_count.gte": 300, "vote_count.lte": 3000, without_genres: "99,10770", page: 1 + (Math.floor(Date.now() / 86400000) % 3) }),
  classics: () => discoverMovies({ sort_by: "vote_average.desc", "primary_release_date.lte": "1979-12-31", "vote_count.gte": 1000 }),
  world: () => discoverMovies({ sort_by: "vote_average.desc", with_origin_country: worldCountry(), "vote_count.gte": 200, without_genres: "99" }),
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
