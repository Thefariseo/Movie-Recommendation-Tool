import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Check, Plus, Star } from "lucide-react";
import useWatched from "../hooks/useWatched";
import useWatchlist from "../hooks/useWatchlist";
import { useModal } from "../hooks/useModal";
import { movieDetails, personDetails, personMovieCredits } from "../utils/api";
import { loadTasteSpace } from "../utils/tasteSpace";
import { whenStill } from "../utils/motion";
import { ratingPredictor } from "../../shared/predict.js";
import { creditsFor, rolesOf, rankFilmography } from "../../shared/people.js";
import { PageHeaderSkeleton, PosterGridSkeleton } from "../components/Skeletons";

const ROLE_LABELS = { directing: "Directed", acting: "Acted in", writing: "Written" };
const poster = (f) => (f?.poster_path ? `https://image.tmdb.org/t/p/w342${f.poster_path}` : "/placeholder_poster.svg");
const stars = (r) => `${Number(r) / 2}★`;
const firstSentences = (text, n = 3) => (String(text || "").match(/[^.!?]+[.!?]+(\s|$)/g) || [text || ""]).slice(0, n).join("").trim();

function Film({ film }) {
  const { open } = useModal();
  const { isInWatchlist, addToWatchlist } = useWatchlist();
  const saved = isInWatchlist(film.id);
  const show = async () => { try { open(await movieDetails(film.id)); } catch { open(film); } };
  return (
    <li className="group relative">
      <button type="button" data-film-id={film.id} onClick={show} className="block w-full text-left" aria-label={`Open ${film.title}`}>
        <img src={poster(film)} alt="" loading="lazy" className={`w-full object-cover ${film.rated != null ? "" : "transition group-hover:opacity-90"}`} style={{ aspectRatio: "2 / 3" }} />
        <span className="film-title" translate="no">{film.title}</span>
        <span className="block text-xs text-slate-500">
          {[film.year, film.credit && film.credit !== "Director" ? film.credit : null].filter(Boolean).join(" · ")}
        </span>
      </button>
      {film.rated != null ? (
        <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400"><Check className="h-3 w-3" />{film.rated ? `You gave ${stars(film.rated)}` : "Seen"}</span>
      ) : (
        <span className="mt-1 flex items-center gap-2 text-xs">
          {film.predicted != null
            ? <span className="inline-flex items-center gap-1 font-semibold text-indigo-700 dark:text-indigo-300" title="The rating your own diary predicts"><Star className="h-3 w-3 fill-current" />{`For you ≈ ${stars(Math.round(film.predicted))}`}</span>
            : film.vote_count >= 40 ? <span className="text-slate-500">{`TMDB ${Number(film.vote_average).toFixed(1)}`}</span> : null}
          <button type="button" data-pop disabled={saved} onClick={() => addToWatchlist(film)} aria-label={saved ? "On your watchlist" : "Save to watchlist"}
            className="ml-auto text-slate-400 hover:text-indigo-600 disabled:text-emerald-600">{saved ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}</button>
        </span>
      )}
    </li>
  );
}

// The top of their page: a photo and a name, which a cast photo or a name
// tapped elsewhere grows into (src/hooks/useSmoothNavigation.js).
function Header({ person, children }) {
  return (
    <>
      <button type="button" onClick={() => window.history.back()} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:underline"><ArrowLeft className="h-4 w-4" /> Back</button>
      <header className="flex flex-wrap items-start gap-6">
        {person.profile_path && <img src={`https://image.tmdb.org/t/p/w300${person.profile_path}`} alt="" data-morph-target="person-photo" className="w-32 object-cover sm:w-44" style={{ aspectRatio: "2 / 3" }} />}
        <div className="min-w-0 flex-1 space-y-3">{children}</div>
      </header>
    </>
  );
}

/** A director's or actor's page: their films ranked for the member, seen and still to see. */
export default function PersonPage() {
  const { id } = useParams();
  // What the link here already showed (their photo, their name), drawn at once.
  const { state } = useLocation();
  const hint = state?.person && String(state.person.id) === id ? state.person : null;
  const [params, setParams] = useSearchParams();
  const { watched } = useWatched();
  const [person, setPerson] = useState(null);
  const [credits, setCredits] = useState(null);
  const [space, setSpace] = useState(null);
  const [error, setError] = useState("");
  const [bio, setBio] = useState(false);

  useEffect(() => {
    setPerson(null); setCredits(null); setError("");
    Promise.all([personDetails(id), personMovieCredits(id)])
      .then(([p, c]) => whenStill().then(() => { setPerson(p); setCredits(c); }))
      .catch(() => setError("This person could not be loaded. Please try again."));
  }, [id]);
  useEffect(() => { loadTasteSpace().then(setSpace); }, []);

  const roles = useMemo(() => (credits ? rolesOf(credits, person?.known_for_department) : []), [credits, person]);
  const role = roles.includes(params.get("role")) ? params.get("role") : roles[0];
  const ranked = useMemo(() => {
    if (!credits || !role) return null;
    const predictor = space ? ratingPredictor(space, watched) : null;
    return rankFilmography(creditsFor(credits, role), watched, predictor ? (fid) => predictor.predict(fid) : null);
  }, [credits, role, space, watched]);

  if (error) return <main className="mx-auto max-w-6xl space-y-3 px-4 py-6"><p className="account-panel text-sm text-rose-600">{error}</p></main>;
  if (!person || !ranked) {
    if (!hint) return <main className="mx-auto max-w-6xl space-y-8 px-4 pb-24 pt-14"><PageHeaderSkeleton portrait /><PosterGridSkeleton /></main>;
    return (
      <main className="mx-auto max-w-6xl space-y-8 px-4 pb-24 pt-6">
        <Header person={{ ...hint, ...person }}>
          <div className="skeleton mt-1 h-3 w-40" aria-hidden="true" />
          <h1 className="font-display text-4xl sm:text-5xl" translate="no" data-morph-target="person-name">{person?.name || hint.name}</h1>
          <div className="skeleton h-3 w-full max-w-2xl" aria-hidden="true" />
        </Header>
        <PosterGridSkeleton />
      </main>
    );
  }

  const start = ranked.unseen.filter((f) => !f.obscure).slice(0, 3);
  const life = [person.birthday?.slice(0, 4), person.deathday?.slice(0, 4)].filter(Boolean).join("–");
  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 pb-24 pt-6">
      <Header person={person}>
        <p className="eyebrow">{[person.known_for_department, life, person.place_of_birth].filter(Boolean).join(" · ")}</p>
        <h1 className="font-display text-4xl sm:text-5xl" translate="no" data-morph-target="person-name">{person.name}</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {ranked.stats.seen
            ? `You have seen ${ranked.stats.seen} of ${ranked.stats.total} films${ranked.stats.mean ? `, ${stars(ranked.stats.mean)} on average` : ""}.`
            : `You have not seen any of their ${ranked.stats.total} films yet.`}
        </p>
        {person.biography && (
          <p className="max-w-3xl font-serif text-base leading-relaxed text-slate-700 dark:text-slate-300">
            {bio ? person.biography : firstSentences(person.biography)}{" "}
            {person.biography.length > firstSentences(person.biography).length + 5 && <button type="button" onClick={() => setBio((b) => !b)} className="font-sans text-sm text-indigo-600 hover:underline">{bio ? "Less" : "More"}</button>}
          </p>
        )}
      </Header>

      {roles.length > 1 && (
        <nav className="section-navigation" aria-label="Roles">
          {roles.map((r) => (
            <a key={r} href={`?role=${r}`} onClick={(e) => { e.preventDefault(); setParams({ role: r }, { replace: true }); }} className={r === role ? "section-selected" : ""} aria-current={r === role ? "page" : undefined}>
              {ROLE_LABELS[r]} <span className="section-count">{creditsFor(credits, r).length}</span>
            </a>
          ))}
        </nav>
      )}

      {start.length > 0 && (
        <section className="space-y-3">
          <h2 className="section-title">Start here</h2>
          <p className="text-sm text-slate-500">The films of theirs you are most likely to love, from what your own ratings say.</p>
          <ul className="stagger grid grid-cols-3 gap-4 sm:max-w-xl">{start.map((f) => <Film key={f.id} film={f} />)}</ul>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="section-title">{`Still to see (${ranked.unseen.length})`}</h2>
        {ranked.unseen.length ? <ul className="rise stagger grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-6">{ranked.unseen.filter((f) => !start.includes(f)).map((f) => <Film key={f.id} film={f} />)}</ul>
          : <p className="text-sm text-slate-500">You have seen every one. Impressive.</p>}
      </section>

      {ranked.seen.length > 0 && (
        <section className="space-y-3">
          <h2 className="section-title">{`Seen (${ranked.seen.length})`}</h2>
          <ul className="rise stagger grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-6">{ranked.seen.map((f) => <Film key={f.id} film={f} />)}</ul>
        </section>
      )}
      <p className="text-xs text-slate-500">Biography and filmography from TMDB. <Link to="/library/journeys" className="hover:underline">Directors you love have journeys too →</Link></p>
    </main>
  );
}
