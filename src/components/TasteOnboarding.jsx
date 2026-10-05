import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, m as motion } from "framer-motion";
import { Check, Shuffle, Sparkles } from "lucide-react";
import { loadTasteSpace } from "../utils/tasteSpace";
import { loadTasteMap } from "../utils/tasteMap";
import { movieDetails } from "../utils/api";
import { saveOnboarding } from "../utils/signals";
import { skipOnboarding } from "../utils/onboarding";
import { onboardingPool, nextPair, ROUNDS } from "../../shared/onboarding.js";

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
        <span className="block truncate text-sm font-semibold" translate="no">{film.title}</span>
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
export default function TasteOnboarding({ onDone, onSkip }) {
  const [model, setModel] = useState(null);
  const [failed, setFailed] = useState(false);
  const [history, setHistory] = useState([]);
  const [details, setDetails] = useState({});
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    Promise.all([loadTasteSpace(), loadTasteMap()]).then(([space, atlas]) => (space && atlas ? setModel({ space, pool: onboardingPool(space, atlas.regions) }) : setFailed(true)));
  }, []);
  const pair = useMemo(() => (model && !done ? nextPair(model.space, model.pool, history) : null), [model, history, done]);
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

  if (failed) return null;
  return (
    <section className="account-panel space-y-5 overflow-hidden" aria-label="Find your taste">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" /> FIND YOUR TASTE IN A MINUTE</p>
          <h2 className="text-2xl font-semibold">{done ? "Your first picks are ready." : "Which would you rather watch?"}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {done ? "They follow the films you chose. Rate films you have seen and they get sharper every time."
              : "Seven quick choices between two films. You do not need to have seen them: go with the one that calls you."}
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
