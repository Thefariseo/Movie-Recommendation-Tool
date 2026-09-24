import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, EyeOff, RotateCcw } from "lucide-react";
import MovieCard from "./MovieCard";
import useWatched from "../hooks/useWatched";
import useWatchlist from "../hooks/useWatchlist";
import { useAuth } from "../contexts/AuthContext";
import { useSignals, currentRules } from "../utils/signals";
import { threadContext, loadThread } from "../utils/threads";
import { usePicked } from "../utils/onScreen";
import { planThreads } from "../../shared/threads.js";
import { blocked } from "../../shared/signals.js";

const HIDDEN_KEY = "umbrify_hidden_threads_v1";
const readHidden = () => {
  try { return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || "[]")); } catch { return new Set(); }
};
const saveHidden = (set) => {
  try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...set])); } catch { /* storage may be blocked */ }
};

// One thread: a row that fetches its films once it is about to scroll into view.
function Thread({ thread, ctx, exclude, taken, onHide }) {
  const picked = usePicked();
  const box = useRef(null);
  const rail = useRef(null);
  const [films, setFilms] = useState(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el || visible) return undefined;
    if (!("IntersectionObserver" in window)) { setVisible(true); return undefined; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible || films) return;
    let live = true;
    loadThread(thread, ctx, { exclude, taken: taken.current })
      .then((list) => {
        if (!live) return;
        // A film shows in one thread only: the first to claim it keeps it.
        list.forEach((m) => taken.current.add(Number(m.id)));
        setFilms(list);
      })
      .catch(() => live && setFailed(true));
    return () => { live = false; };
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const scroll = (direction) => rail.current?.scrollBy({
    left: direction * rail.current.clientWidth * 0.8,
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
  });

  // Films "Picked for you" already shows are not repeated here.
  const shown = films?.filter((m) => !picked.has(Number(m.id)));
  // A thread with too little to show is left out rather than shown half empty.
  if (shown && shown.length < 3) return null;
  if (failed) return null;
  return (
    <section ref={box} className="catalogue-section" aria-label={thread.title} aria-busy={!films}>
      <div className="catalogue-heading">
        <div className="min-w-0">
          <h2 className="truncate">{thread.title}</h2>
          <p className="truncate text-xs text-[rgb(var(--color-fg-muted))]">{thread.why}</p>
        </div>
        <div className="flex shrink-0 gap-1">
          <button className="icon-control" onClick={() => onHide(thread.id)} aria-label={`Hide the thread ${thread.title}`} title="Hide this thread"><EyeOff size={16} /></button>
          <button className="icon-control" onClick={() => scroll(-1)} aria-label={`Previous films in ${thread.title}`}><ChevronLeft size={18} /></button>
          <button className="icon-control" onClick={() => scroll(1)} aria-label={`More films in ${thread.title}`}><ChevronRight size={18} /></button>
        </div>
      </div>
      {!films ? (
        <div className="film-rail" role="status" aria-label={`Loading ${thread.title}`}>
          {[0, 1, 2, 3, 4, 5].map((i) => <div className="film-skeleton" key={i} />)}
        </div>
      ) : (
        <div ref={rail} className="film-rail" tabIndex={0} aria-label={`${thread.title}, scroll for more`}>
          {shown.map((m) => (
            <div className="rail-card" key={m.id}>
              <MovieCard movie={m} dismissable />
              {m._caption && <p className="mt-1 truncate text-xs text-[rgb(var(--color-fg-muted))]">{m._caption}</p>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Rows that each follow one thing the member loves: a director, a film, a
 * theme, a language, a decade, what their critic learned, hidden gems and
 * directors to discover. Built from ratings, so it needs a few first.
 */
export default function FilmThreads() {
  const { user } = useAuth();
  const { watched } = useWatched();
  const { watchlist } = useWatchlist();
  const signals = useSignals(user?.id);
  const [ctx, setCtx] = useState(null);
  const [hidden, setHidden] = useState(readHidden);
  const taken = useRef(new Set());
  const rated = watched.filter((m) => Number(m.rated) > 0).length;
  const libraryKey = JSON.stringify(watched.map((m) => [m.id, m.rated]));

  useEffect(() => {
    if (rated < 2) return undefined;
    let live = true;
    threadContext(watched, watchlist).then((c) => live && setCtx(c));
    return () => { live = false; };
  }, [libraryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const threads = useMemo(() => (ctx ? planThreads({ watched, evidence: ctx.evidence, rules: currentRules(), hasSpace: Boolean(ctx.member), taste: ctx.taste }) : []), [ctx, signals]); // eslint-disable-line react-hooks/exhaustive-deps
  // Watched, saved and ruled-out films never show; the set is fixed per render of threads.
  const exclude = useMemo(() => new Set([
    ...watched.map((m) => Number(m.id)),
    ...[...signals].filter(([id]) => blocked(signals, id)).map(([id]) => id),
  ]), [libraryKey, signals]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { taken.current = new Set(); }, [threads]);

  if (rated < 2) return null;
  const shown = threads.filter((t) => !hidden.has(t.id));
  const hide = (id) => { const next = new Set([...hidden, id]); setHidden(next); saveHidden(next); };
  const restore = () => { setHidden(new Set()); saveHidden(new Set()); };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="eyebrow">YOUR FILM THREADS</p>
          <p className="text-sm text-[rgb(var(--color-fg-muted))]">Rows that follow what you love: your directors, the films you loved most, your themes — and some you have yet to find.</p>
        </div>
        {hidden.size > 0 && <button className="account-secondary inline-flex items-center gap-1.5 text-xs" onClick={restore}><RotateCcw className="h-3.5 w-3.5" /> Show {hidden.size} hidden</button>}
      </div>
      {!ctx && <div className="film-rail" role="status" aria-label="Loading your threads">{[0, 1, 2, 3, 4, 5].map((i) => <div className="film-skeleton" key={i} />)}</div>}
      {shown.map((t) => <Thread key={t.id} thread={t} ctx={ctx} exclude={exclude} taken={taken} onHide={hide} />)}
    </div>
  );
}
