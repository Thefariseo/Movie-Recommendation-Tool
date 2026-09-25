import React, { useEffect, useState } from "react";
import { Palette } from "lucide-react";
import { lookOf, cachedLook } from "../utils/visualStyle";
import { LOOKS, looksOf } from "../../shared/visual.js";

// A film's look: its palette and the named looks it has. Which of the
// member's films it looks like is one of the ties FilmConnections weighs.
export default function FilmLook({ movie }) {
  const [look, setLook] = useState(() => cachedLook(movie.id) || null);
  useEffect(() => {
    let live = true;
    lookOf(movie).then((l) => live && setLook(l));
    return () => { live = false; };
  }, [movie.id]);
  if (!look) return null;
  const names = looksOf(look).map((k) => LOOKS[k].label);
  return (
    <div className="mt-4">
      <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400"><Palette className="h-3 w-3" /> The look</p>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex overflow-hidden rounded-md" aria-hidden="true">{look.palette.map((c) => <span key={c} className="h-6 w-8" style={{ background: c }} />)}</div>
        {names.length > 0 && <span className="text-xs text-slate-600 dark:text-slate-300">{names.join(" · ")}</span>}
      </div>
    </div>
  );
}
