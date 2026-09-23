import React, { useEffect, useState } from "react";
import { Palette } from "lucide-react";
import useWatched from "../hooks/useWatched";
import { lookOf, cachedLook } from "../utils/visualStyle";
import { LOOKS, looksOf, lookSimilarity } from "../../shared/visual.js";

// A film's look: its palette, the named looks it has, and which film the
// member loved looks most like it (among films whose look is already known).
export default function FilmLook({ movie }) {
  const { watched } = useWatched();
  const [look, setLook] = useState(() => cachedLook(movie.id) || null);
  useEffect(() => {
    let live = true;
    lookOf(movie).then((l) => live && setLook(l));
    return () => { live = false; };
  }, [movie.id]);
  if (!look) return null;
  const twin = watched
    .filter((m) => m.id !== movie.id && Number(m.rated) >= 7 && cachedLook(m.id))
    .map((m) => ({ m, s: lookSimilarity(look, cachedLook(m.id)) }))
    .sort((a, b) => b.s - a.s)[0];
  const names = looksOf(look).map((k) => LOOKS[k].label);
  return (
    <div className="mt-4">
      <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400"><Palette className="h-3 w-3" /> The look</p>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex overflow-hidden rounded-md" aria-hidden="true">{look.palette.map((c) => <span key={c} className="h-6 w-8" style={{ background: c }} />)}</div>
        {names.length > 0 && <span className="text-xs text-slate-600 dark:text-slate-300">{names.join(" · ")}</span>}
      </div>
      {twin && twin.s >= 0.6 && <p className="mt-1.5 text-xs text-slate-500">Looks like “{twin.m.title}”, which you gave {twin.m.rated / 2}★.</p>}
    </div>
  );
}
