import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useModal } from "../hooks/useModal";
import { useAuth } from "../contexts/AuthContext";
import { useSignals } from "../utils/signals";
import { useFilmsToRate, useRate, useRatedCount, markUnseen } from "../utils/quickRate";
import useWatched from "../hooks/useWatched";
import Rail from "./Rail";
import StarRating from "./StarRating";
import TasteMeter from "./TasteMeter";
import FilmTitle from "./FilmTitle";

const poster = (f) => (f.poster_path ? `https://image.tmdb.org/t/p/w342${f.poster_path}` : "/placeholder_poster.svg");

/**
 * Films nearly everyone has seen, each with its stars: a newcomer rates the
 * ones they know right here (each rating sharpens every pick), passes on the
 * others, or rates ten in a row on their own page (/rate).
 */
export default function KnownFilms() {
  const { user } = useAuth();
  const signals = useSignals(user?.id);
  const { films, loading } = useFilmsToRate({ limit: 12, signals });
  const { watched } = useWatched();
  const rate = useRate();
  const rated = useRatedCount();
  const { open } = useModal();
  // Passed on here, the film leaves the row at once.
  const [passed, setPassed] = useState(() => new Set());
  const ratingOf = (id) => Number(watched.find((m) => Number(m.id) === Number(id))?.rated) || 0;
  const shown = (films || []).filter((f) => !passed.has(f.id));
  if (!loading && !shown.length) return null;
  return (
    <section className="catalogue-section known-films" aria-label="Seen these? Rate them">
      <div className="catalogue-heading known-films-heading">
        <div>
          <h2 className="section-title">Seen these? Rate them</h2>
          <p className="known-films-lede">Films nearly everyone has seen. Each rating sharpens every pick.</p>
        </div>
        <Link to="/rate" className="choose-link">
          <span>Rate 10 in a row</span>
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
      <TasteMeter rated={rated} compact />
      {loading ? (
        <div className="film-rail" role="status" aria-label="Loading films to rate">
          {[0, 1, 2, 3, 4, 5].map((i) => <div className="film-skeleton" key={i} />)}
        </div>
      ) : (
        <Rail className="film-rail" tabIndex={0} label="Films to rate, scroll for more">
          {shown.map((f) => {
            const value = ratingOf(f.id);
            return (
              <div className="rail-card" key={f.id}>
                <article className={`film-card known-card ${value ? "known-rated" : ""}`}>
                  <button type="button" className="film-open" data-film-id={f.id} onClick={() => open(f)} aria-label={`View ${f.title}`}>
                    <span className="film-poster"><img loading="lazy" decoding="async" alt="" src={poster(f)} /></span>
                    <span className="film-title" translate="no"><FilmTitle film={f} /></span>
                    <span className="film-year">{f.release_date?.slice(0, 4) || f.year}</span>
                  </button>
                  <div className="known-rate">
                    <StarRating value={value} onChange={(r) => rate(f, r)} size="md" showLabel={false} />
                    {!value && (
                      <button type="button" className="known-pass" onClick={() => { markUnseen(f.id); setPassed((p) => new Set([...p, f.id])); }}>
                        Not seen it
                      </button>
                    )}
                  </div>
                </article>
              </div>
            );
          })}
        </Rail>
      )}
    </section>
  );
}
