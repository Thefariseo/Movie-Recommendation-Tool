import React, { useEffect, useState } from "react";
import { Link2 } from "lucide-react";
import useWatched from "../hooks/useWatched";
import { movieDetails } from "../utils/api";
import { loadTasteSpace } from "../utils/tasteSpace";
import { cachedLook } from "../utils/visualStyle";
import { connect } from "../../shared/connections.js";
import { closestInDiary } from "../../shared/comparables.js";
import { stars } from "../../shared/evidence.js";

// Films the member rated that are tied to this one, and what ties them: the
// same saga, director, writers, cinematographer, composer or cast, shared
// themes, the same audience. A few sentences then say what those films, and
// the member's ratings of them, mean for this one.
export default function FilmConnections({ movie, details }) {
  const { watched } = useWatched();
  const [result, setResult] = useState(null);
  useEffect(() => {
    let live = true;
    setResult(null);
    if (!details || !watched.some((m) => Number(m.rated) > 0)) return undefined;
    (async () => {
      const space = await loadTasteSpace();
      const target = { id: movie.id, title: movie.title, genre_ids: movie.genre_ids || details.genres?.map((g) => g.id) || [], release_date: movie.release_date || details.release_date };
      const rated = watched.filter((m) => Number(m.rated) > 0);
      const near = closestInDiary(space, target, rated, { limit: 12, min: 0.12 }).closest.map((c) => c.id);
      // Films TMDB pairs with this one are worth a look too, when the member rated them.
      const paired = (details.recommendations?.results || []).map((r) => r.id).filter((id) => rated.some((m) => Number(m.id) === id));
      const ids = [...new Set([...near, ...paired])].slice(0, 16);
      const fetched = await Promise.allSettled(ids.map((id) => movieDetails(id)));
      const byId = new Map([[Number(movie.id), details]]);
      fetched.forEach((r, i) => r.status === "fulfilled" && byId.set(ids[i], r.value));
      const looks = new Map([movie.id, ...ids].map((id) => [Number(id), cachedLook(id)]).filter(([, l]) => l));
      const seen = watched.find((m) => Number(m.id) === Number(movie.id))?.rated;
      const out = connect({ target, details: byId, watched, space, looks, pool: paired, seen });
      if (live) setResult(out);
    })().catch(() => {});
    return () => { live = false; };
  }, [movie.id, details, watched]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!result) return null;
  return (
    <section className="mt-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700" aria-label="How it connects to your films">
      <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
        <Link2 className="h-3.5 w-3.5" /> How it connects to your films
      </p>
      <div className="space-y-1.5 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
        {result.summary.map((line) => <p key={line}>{line}</p>)}
      </div>
      <ul className="mt-3 space-y-2.5">
        {result.links.map(({ film, ties }) => (
          <li key={film.id} className="flex gap-3">
            <img className="w-10 shrink-0 self-start rounded" style={{ aspectRatio: "2 / 3" }} alt=""
              src={film.poster ? `https://image.tmdb.org/t/p/w92${film.poster}` : "/placeholder_poster.svg"} />
            <div className="min-w-0">
              <p className="text-sm font-medium leading-tight">
                {film.title} {film.year && <span className="text-xs font-normal text-slate-500">{film.year}</span>}
                <span className={`ml-2 text-xs font-semibold ${film.rated >= 8 ? "text-emerald-600" : film.rated <= 5 ? "text-rose-500" : "text-slate-500"}`}>you: {stars(film.rated)}</span>
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {ties.slice(0, 5).map((t) => (
                  <span key={t.kind} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">{t.text}</span>
                ))}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
