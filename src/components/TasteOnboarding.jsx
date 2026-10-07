import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, m as motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, NotebookPen, Shuffle, Sparkles } from "lucide-react";
import { loadTasteSpace } from "../utils/tasteSpace";
import { loadTasteMap } from "../utils/tasteMap";
import { movieDetails } from "../utils/api";
import { useAuth } from "../contexts/AuthContext";
import WelcomePoints from "./WelcomePoints";
import { saveOnboarding } from "../utils/signals";
import { skipOnboarding } from "../utils/onboarding";
import { onboardingPool, nextPair, ROUNDS } from "../../shared/onboarding.js";
import FilmTitle from "./FilmTitle";

// The importer is a page of its own elsewhere; here it loads only when chosen.
const LetterboxdImport = lazy(() => import("./LetterboxdImport"));

const poster = (d) => (d?.poster_path ? `https://image.tmdb.org/t/p/w342${d.poster_path}` : "/placeholder_poster.svg");

function Choice({ film, details, onPick, disabled }) {
  const d = details[film.id];
  return (
    <button type="button" onClick={onPick} disabled={disabled}
      className="group flex min-w-0 flex-1 flex-col items-stretch gap-2 rounded-2xl p-2 text-left transition hover:bg-indigo-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 disabled:opacity-60 dark:hover:bg-indigo-950/40"
      aria-label={`I prefer ${film.title}`}>
      <span className="relative block overflow-hidden rounded-xl shadow-md ring-1 ring-black/5">
        {d ? <img className="w-full object-cover transition-transform duration-300 group-hover:scale-105" style={{ aspectRatio: "2 / 3" }} alt="" src={poster(d)} />
          : <span className="block animate-pulse bg-slate-200 dark:bg-slate-800" style={{ aspectRatio: "2 / 3" }} />}
        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 text-center text-xs font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">This one</span>
      </span>
      <span className="px-1">
        <span className="block truncate text-sm font-semibold" translate="no"><FilmTitle film={d || film} /></span>
        <span className="block text-xs text-slate-500">{film.year || d?.release_date?.slice(0, 4)}</span>
      </span>
    </button>
  );
}

/**
 * A first visit: a few quick choices between two films place a newcomer in
 * the taste space, so their first picks are already theirs. `onDone` runs
 * once the choices are saved; `onSkip` when they would rather not.
 */
export default function TasteOnboarding({ onDone, onSkip, onStage }) {
  const { user } = useAuth();
  const [model, setModel] = useState(null);
  const [failed, setFailed] = useState(false);
  const [history, setHistory] = useState([]);
  const [details, setDetails] = useState({});
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  // How the newcomer starts: their Letterboxd diary, or quick choices between films.
  const [mode, setMode] = useState("start");
  const [imported, setImported] = useState(false);

  // The taste space (0.6 MB) is only needed for the pairs: it loads once the
  // newcomer reaches for them, or after a few seconds on a fast connection.
  const [wanted, setWanted] = useState(false);
  const want = () => setWanted(true);
  useEffect(() => {
    const fast = typeof navigator === "undefined" || !navigator.connection || (!navigator.connection.saveData && navigator.connection.effectiveType === "4g");
    if (!fast) return undefined;
    const timer = setTimeout(want, 4000);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!wanted && mode !== "pairs") return;
    Promise.all([loadTasteSpace(), loadTasteMap()]).then(([space, atlas]) => (space && atlas ? setModel({ space, pool: onboardingPool(space, atlas.regions, atlas.landmarks) }) : setFailed(true)));
  }, [wanted, mode === "pairs"]); // eslint-disable-line react-hooks/exhaustive-deps
  const pair = useMemo(() => (model && !done ? nextPair(model.space, model.pool, history) : null), [model, history, done]);
  // Until the choices are made, the page steps back (src/pages/Home.jsx) and,
  // on a phone, so does the search above it: the welcome, then each pair,
  // fills the screen.
  // Without the taste space there are no pairs to show.
  useEffect(() => { if (failed && mode === "pairs") setMode("start"); }, [failed, mode]);
  const stage = done || imported ? "done" : mode;
  useEffect(() => {
    onStage?.(stage);
    const html = document.documentElement;
    if (stage === "done") delete html.dataset.focus;
    else html.dataset.focus = "taste";
    if (stage === "pairs") window.scrollTo({ top: 0, behavior: "instant" });
    return () => { delete html.dataset.focus; };
  }, [stage]); // eslint-disable-line react-hooks/exhaustive-deps
  const chosen = history.filter((h) => h.chosen);

  useEffect(() => {
    const ids = (pair || []).map((f) => f.id).filter((id) => !details[id]);
    if (!ids.length) return;
    Promise.allSettled(ids.map((id) => movieDetails(id))).then((rs) => {
      const next = {};
      rs.forEach((r, i) => { if (r.status === "fulfilled") next[ids[i]] = r.value; });
      setDetails((d) => ({ ...d, ...next }));
    });
  }, [pair]); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = async (list) => {
    const picks = list.filter((h) => h.chosen).map((h) => details[h.chosen] || { id: h.chosen, title: h.title });
    if (!picks.length) { onSkip?.(); return; }
    setSaving(true);
    // Told first, so the page keeps this panel when the saved choices arrive.
    onDone?.();
    try { await saveOnboarding(picks); } catch { /* the picks stay in this browser's signals */ }
    setSaving(false);
    setDone(true);
  };
  const choose = (film) => {
    const next = [...history, { a: pair[0].id, b: pair[1].id, chosen: film?.id ?? null, title: film?.title }];
    setHistory(next);
    if (next.filter((h) => h.chosen).length >= ROUNDS) finish(next);
  };
  const skip = () => {
    skipOnboarding();
    onSkip?.();
  };

  if (mode === "start") return (
    <section className="welcome-band" aria-label="Welcome to Umbrify">
      <div className="welcome-band-head">
        <p className="eyebrow flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> WELCOME TO UMBRIFY</p>
        <h1 className="welcome-band-title">Films picked for your taste, and the reason why.</h1>
        <p className="welcome-band-lede">Umbrify learns what you love and finds your next film, on your own or with friends.</p>
      </div>
      <WelcomePoints />
      <div className="welcome-start">
        <h2 className="welcome-start-title">Start in a minute</h2>
        <div className="welcome-start-options">
          <button type="button" onClick={() => setMode("pairs")} onPointerEnter={want} onPointerDown={want} onFocus={want} className="welcome-option welcome-option-main" disabled={failed}>
            <Shuffle className="h-6 w-6 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">Seven quick choices</span>
              <span className="block text-sm opacity-80">Two well-known films at a time. You do not need to have seen them.</span>
            </span>
            <ArrowRight className="h-5 w-5 shrink-0" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => setMode("import")} className="welcome-option">
            <NotebookPen className="h-6 w-6 shrink-0 text-indigo-600 dark:text-indigo-300" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">I keep a diary on Letterboxd</span>
              <span className="block text-sm text-slate-500">Bring your films and ratings in a minute.</span>
            </span>
            <ArrowRight className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
          </button>
        </div>
        <div className="welcome-start-foot">
          {!user && <Link to="/profile" className="underline-offset-2 hover:underline">Already have an account? Sign in</Link>}
          <button type="button" onClick={skip} className="underline-offset-2 hover:underline">Not now, just browse</button>
        </div>
      </div>
    </section>
  );
  if (mode === "import") return (
    <section className="account-panel space-y-5 overflow-hidden" aria-label="Find your taste">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" /> WELCOME TO UMBRIFY</p>
          <h2 className="text-2xl font-semibold">{imported ? "Your diary is in." : "Bring your Letterboxd diary."}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {imported ? "Your recommendations now start from the films you have seen and rated." : "Your first picks start from the films you have already rated."}
          </p>
        </div>
        {!imported && <button type="button" onClick={skip} className="text-xs text-slate-500 underline-offset-2 hover:underline">Not now</button>}
      </div>
      <div className="space-y-3">
        {!imported && <button type="button" onClick={() => setMode("start")} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:underline"><ArrowLeft className="h-4 w-4" /> Back</button>}
        <Suspense fallback={<div className="skeleton h-40" />}>
          {/* The page is told when the import starts, so it keeps this panel when the films arrive. */}
          <LetterboxdImport onStart={() => onDone?.()} onDone={() => setImported(true)} />
        </Suspense>
      </div>
    </section>
  );
  if (failed) return null;
  return (
    <section className={`account-panel space-y-5 overflow-hidden ${done ? "" : "taste-pairs"}`} aria-label="Find your taste">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" /> FIND YOUR TASTE IN A MINUTE</p>
          <h2 className="text-2xl font-semibold">{done ? "Your first picks are ready." : "Which would you rather watch?"}</h2>
          <p className="taste-pairs-hint mt-1 text-sm text-slate-500">
            {done ? "They follow the films you chose. Rate films you have seen and they get sharper every time."
              : "You do not need to have seen them: go with the one that calls you."}
          </p>
        </div>
        {!done && <button type="button" onClick={skip} className="text-xs text-slate-500 underline-offset-2 hover:underline">Not now</button>}
      </div>
      {!done && (
        <div className="flex gap-1.5" role="progressbar" aria-valuemin={0} aria-valuemax={ROUNDS} aria-valuenow={chosen.length} aria-label="Choices made">
          {Array.from({ length: ROUNDS }, (_, i) => <span key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i < chosen.length ? "bg-indigo-500" : "bg-slate-200 dark:bg-slate-700"}`} />)}
        </div>
      )}
      {!model && !done && <div className="grid animate-pulse grid-cols-2 gap-4 sm:mx-auto sm:max-w-md">{[0, 1].map((i) => <div key={i} className="rounded-2xl bg-slate-200 dark:bg-slate-800" style={{ aspectRatio: "2 / 3" }} />)}</div>}
      {pair && !done && (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={`${pair[0].id}-${pair[1].id}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.18 }}
            className="mx-auto flex max-w-md items-center gap-2 sm:gap-4">
            <Choice film={pair[0]} details={details} onPick={() => choose(pair[0])} disabled={saving} />
            <span className="shrink-0 text-xs font-semibold uppercase tracking-widest text-slate-400">or</span>
            <Choice film={pair[1]} details={details} onPick={() => choose(pair[1])} disabled={saving} />
          </motion.div>
        </AnimatePresence>
      )}
      {!done && model && (
        <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
          <button type="button" onClick={() => choose(null)} disabled={saving || !pair} className="account-secondary inline-flex items-center gap-1.5"><Shuffle className="h-4 w-4" /> Neither: another pair</button>
          {chosen.length >= 3 && <button type="button" onClick={() => finish(history)} disabled={saving} className="text-slate-500 underline-offset-2 hover:underline">That is enough, show my picks</button>}
          {!pair && <button type="button" onClick={() => finish(history)} className="account-button">Show my picks</button>}
        </div>
      )}
      {done && (
        <div className="flex flex-wrap gap-2">
          {chosen.map((h) => (
            <span key={h.chosen} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-200"><Check className="h-3 w-3" />{details[h.chosen]?.title || h.title}</span>
          ))}
        </div>
      )}
    </section>
  );
}
