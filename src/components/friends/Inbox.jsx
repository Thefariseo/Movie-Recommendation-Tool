import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bookmark, Check, Inbox as InboxIcon, X } from "lucide-react";
import UserAvatar from "../UserAvatar";
import { useModal } from "../../hooks/useModal";
import useWatchlist from "../../hooks/useWatchlist";
import useWatched from "../../hooks/useWatched";
import { movieDetails } from "../../utils/api";
import { backend } from "../../utils/backend";

const poster = (m) => (m?.poster_path ? `https://image.tmdb.org/t/p/w185${m.poster_path}` : "/placeholder_poster.svg");

/**
 * The films friends sent the member, each with who sent it and their note.
 * Opening it marks them seen.
 */
export default function Inbox({ people, onSeen }) {
  const { open } = useModal();
  const { isInWatchlist, addToWatchlist } = useWatchlist();
  const { watched } = useWatched();
  const [recs, setRecs] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    backend("social?inbox=1")
      .then((d) => {
        setRecs(d.recommendations || []);
        if ((d.recommendations || []).some((r) => !r.seen_at)) backend("social", { action: "recommend-seen" }).then(() => onSeen?.()).catch(() => {});
      })
      .catch((e) => { setError(e.message); setRecs([]); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const dismiss = async (id) => {
    setRecs((list) => list.filter((r) => r.id !== id));
    await backend("social", { action: "recommend-dismiss", id }).catch(() => {});
  };
  const show = async (movie) => { try { open(await movieDetails(movie.id)); } catch { open(movie); } };
  const seen = new Map(watched.map((m) => [Number(m.id), m.rated]));
  const name = (id) => people.get(id)?.display_name || "A friend";

  if (recs == null) return <p className="text-sm text-slate-500" role="status">Opening your inbox…</p>;
  return (
    <section className="space-y-3">
      {error && <p className="text-sm text-rose-600">{error}</p>}
      {!recs.length && (
        <div className="account-panel flex items-center gap-3 text-sm text-slate-500">
          <InboxIcon className="h-5 w-5 shrink-0" />
          <p>No films from friends yet. Open any film and use “Recommend to a friend” to start.</p>
        </div>
      )}
      <ul className="grid gap-3 sm:grid-cols-2">
        {recs.map((r) => {
          const id = Number(r.movie?.id);
          const saved = isInWatchlist(id);
          const rated = seen.get(id);
          return (
            <li key={r.id} className={`account-panel flex gap-3 p-3 ${r.seen_at ? "" : "ring-2 ring-indigo-300 dark:ring-indigo-700"}`}>
              <button type="button" onClick={() => show(r.movie)} className="w-20 shrink-0" aria-label={`Open ${r.movie?.title}`}>
                <img loading="lazy" decoding="async" src={poster(r.movie)} alt="" className="w-full rounded-md object-cover" style={{ aspectRatio: "2 / 3" }} />
              </button>
              <div className="min-w-0 flex-1 space-y-1.5">
                <Link to={`/friends/${r.sender}`} className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:underline dark:text-slate-300">
                  <UserAvatar user={people.get(r.sender)} name={name(r.sender)} className="chip-avatar" />{`${name(r.sender)} recommends`}
                </Link>
                <p className="font-semibold leading-tight" translate="no">{r.movie?.title} {r.movie?.year && <span className="font-normal text-slate-500">({r.movie.year})</span>}</p>
                {r.note && <p className="rounded-lg bg-slate-50 px-2 py-1 text-sm italic text-slate-700 dark:bg-slate-800/60 dark:text-slate-200" translate="no">“{r.note}”</p>}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {rated != null ? <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><Check className="h-3 w-3" /> You have seen it</span>
                    : <button type="button" data-pop disabled={saved} onClick={() => addToWatchlist(r.movie)} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-600 disabled:text-emerald-600">
                      {saved ? <><Check className="h-3 w-3" /> On your watchlist</> : <><Bookmark className="h-3 w-3" /> Save</>}
                    </button>}
                  <button type="button" onClick={() => dismiss(r.id)} className="ml-auto inline-flex items-center gap-1 text-xs text-slate-400 hover:text-rose-600" aria-label="Remove from inbox"><X className="h-3 w-3" /> Remove</button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
