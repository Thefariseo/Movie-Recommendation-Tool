import React, { useEffect, useState } from "react";
import { Eye } from "lucide-react";
import useWatched from "../hooks/useWatched";
import { lookOf, cachedLook } from "../utils/visualStyle";
import { eyeOf } from "../../shared/visual.js";

const SAMPLE = 30;

// Which looks the member loves: measured from the stills of their rated films,
// a few at a time, and compared with everything they rated.
export default function YourEye() {
  const { watched } = useWatched();
  const [looks, setLooks] = useState({});
  const rated = watched.filter((m) => Number(m.rated) > 0).sort((a, b) => b.rated - a.rated);
  const sample = [...rated.slice(0, 20), ...rated.slice(20).slice(-10)].slice(0, SAMPLE);
  useEffect(() => {
    let live = true;
    (async () => {
      for (let i = 0; i < sample.length; i += 4) {
        const batch = await Promise.all(sample.slice(i, i + 4).map((m) => lookOf(m).then((l) => [m.id, l])));
        if (!live) return;
        setLooks((prev) => ({ ...prev, ...Object.fromEntries(batch) }));
      }
    })();
    return () => { live = false; };
  }, [sample.map((m) => m.id).join()]);
  const films = sample.map((m) => ({ title: m.title, rated: Number(m.rated), look: looks[m.id] || cachedLook(m.id) }));
  const traits = eyeOf(films);
  const loved = films.filter((f) => f.look && f.rated >= 8);
  if (loved.length < 4) return null;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-indigo-500"><Eye className="h-3.5 w-3.5" /> Your eye</p>
      <h2 className="mt-1 text-xl font-bold text-slate-800 dark:text-slate-100">{traits.length ? `You love ${traits.map((t) => t.label.toLowerCase()).join(", ")}.` : "Your favourites have no single look."}</h2>
      <ul className="mt-3 space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
        {traits.map((t) => <li key={t.key}><span className="font-semibold">{t.label}:</span> {t.loved} of your {t.of} favourites, like {t.examples.map((e) => `“${e}”`).join(", ")}.</li>)}
      </ul>
      <div className="mt-4 grid grid-cols-6 gap-1 sm:grid-cols-10" aria-hidden="true">
        {loved.map((f) => <div key={f.title} title={f.title} className="flex h-8 overflow-hidden rounded">{f.look.palette.slice(0, 3).map((c) => <span key={c} className="flex-1" style={{ background: c }} />)}</div>)}
      </div>
      <p className="mt-3 text-[11px] text-slate-400">Colour and light, measured from each film's main still. Looking alike does not predict what you will rate highly, so Umbrify uses your eye to describe and filter, never to rank.</p>
    </section>
  );
}
