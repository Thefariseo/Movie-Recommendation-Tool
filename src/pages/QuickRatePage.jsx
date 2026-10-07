import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, EyeOff, RotateCcw, Sparkles } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useSignals } from "../utils/signals";
import { useFilmsToRate, useRate, useRatedCount, markUnseen } from "../utils/quickRate";
import StarRating from "../components/StarRating";
import TasteMeter from "../components/TasteMeter";
import SaveProgress from "../components/SaveProgress";
import FilmTitle from "../components/FilmTitle";

const ROUND = 10;
const poster = (f, size = "w500") => (f?.poster_path ? `https://image.tmdb.org/t/p/${size}${f.poster_path}` : "/placeholder_poster.svg");

/**
 * A quick round: ten films nearly everyone has seen, one at a time. A star
 * rates the film and moves on; "Not seen it" passes. The meter above shows
 * Umbrify getting to know the member, and the round ends on their new picks.
 */
export default function QuickRatePage() {
  const { user } = useAuth();
  const signals = useSignals(user?.id);
  const { films, loading, refresh } = useFilmsToRate({ limit: ROUND, signals });
  const rate = useRate();
  const rated = useRatedCount();
  const [index, setIndex] = useState(0);
  // What happened to each film of the round: a rating, or null for "not seen".
  const [answers, setAnswers] = useState({});
  const [given, setGiven] = useState(0);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const film = films?.[index];
  const done = films && index >= films.length;
  const ratedNow = Object.values(answers).filter(Boolean).length;
  // On a phone the round fills the screen: the search steps out of the header.
  useEffect(() => {
    const html = document.documentElement;
    html.dataset.focus = "rate";
    return () => { delete html.dataset.focus; };
  }, []);

  const next = () => { setGiven(0); setIndex((i) => i + 1); };
  const onRate = async (value) => {
    if (!film || !value) return;
    setGiven(value);
    setAnswers((a) => ({ ...a, [film.id]: value }));
    // The stars light up before the next film comes.
    clearTimeout(timer.current);
    timer.current = setTimeout(next, 650);
    await rate(film, value);
  };
  const pass = () => {
    if (!film) return;
    markUnseen(film.id);
    setAnswers((a) => ({ ...a, [film.id]: null }));
    next();
  };
  const back = () => { clearTimeout(timer.current); setGiven(0); setIndex((i) => Math.max(0, i - 1)); };
  const again = () => { setAnswers({}); setIndex(0); setGiven(0); refresh(); };

  return (
    <main className="quick-rate-page">
      <header className="quick-rate-head">
        <p className="eyebrow flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> QUICK ROUND</p>
        <h1 className="font-display text-2xl sm:text-3xl">Rate what you have seen</h1>
        <p className="text-sm text-slate-500">Ten well-known films, one at a time. Rate the ones you have seen and pass on the rest.</p>
      </header>
      <TasteMeter rated={rated} />

      {loading ? (
        <div className="quick-rate-card" role="status" aria-label="Loading films to rate"><div className="quick-rate-poster skeleton" /></div>
      ) : !films.length ? (
        <section className="account-panel space-y-3 text-center">
          <h2 className="text-lg font-semibold">You have rated every film we would ask about.</h2>
          <p className="text-sm text-slate-500">Search for any other film you have seen and rate it from its page.</p>
          <Link to="/" className="account-button inline-flex">See your picks <ArrowRight size={16} aria-hidden="true" /></Link>
        </section>
      ) : done ? (
        <section className="quick-rate-done space-y-4" aria-live="polite">
          <h2 className="text-xl font-semibold">{ratedNow ? "Round done." : "None of these, then."}</h2>
          <p className="text-sm text-slate-500">{ratedNow === 1 ? "You rated one film: your picks already take it into account." : ratedNow ? `You rated ${ratedNow} films: your picks already take them into account.` : "Try another ten: the next ones are different."}</p>
          <div className="flex flex-wrap gap-3">
            <Link to="/" className="account-button inline-flex">See your picks <ArrowRight size={16} aria-hidden="true" /></Link>
            <button type="button" onClick={again} className="account-secondary inline-flex"><RotateCcw size={16} aria-hidden="true" /> Another 10</button>
          </div>
          <SaveProgress />
        </section>
      ) : (
        <section className="quick-rate-card" aria-label={`Film ${index + 1} of ${films.length}`}>
          <div className="quick-rate-progress">
            <span>{`${index + 1} of ${films.length}`}</span>
            <span className="quick-rate-dots" aria-hidden="true">
              {films.map((f, i) => <span key={f.id} className={i < index ? (answers[f.id] ? "dot-rated" : "dot-passed") : i === index ? "dot-now" : ""} />)}
            </span>
          </div>
          <img key={`poster-${film.id}`} className="quick-rate-poster" alt="" src={poster(film)} />
          {/* The next poster is already on its way. */}
          {films[index + 1] && <link rel="preload" as="image" href={poster(films[index + 1])} />}
          <div className="text-center">
            <h2 className="text-xl font-semibold" translate="no"><FilmTitle film={film} /></h2>
            <p className="text-sm text-slate-500">{film.release_date?.slice(0, 4) || film.year}</p>
          </div>
          <StarRating key={`stars-${film.id}`} value={given || answers[film.id] || 0} onChange={onRate} size="xl" />
          <div className="quick-rate-actions">
            <button type="button" onClick={back} disabled={index === 0} className="account-secondary inline-flex" aria-label="Previous film"><ArrowLeft size={16} aria-hidden="true" /></button>
            <button type="button" onClick={pass} className="account-secondary inline-flex flex-1"><EyeOff size={16} aria-hidden="true" /> Not seen it</button>
          </div>
        </section>
      )}
    </main>
  );
}
