import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bookmark, Check, Star } from "lucide-react";
import UserAvatar from "../UserAvatar";
import { useModal } from "../../hooks/useModal";
import useWatchlist from "../../hooks/useWatchlist";
import { movieDetails } from "../../utils/api";
import { backend } from "../../utils/backend";

export const REACTIONS = [
  { key: "heart", emoji: "❤️", label: "Love it" },
  { key: "fire", emoji: "🔥", label: "Great pick" },
  { key: "wow", emoji: "😮", label: "Wow" },
  { key: "laugh", emoji: "😂", label: "Ha" },
  { key: "sad", emoji: "😢", label: "Sad" },
  { key: "agree", emoji: "👍", label: "Agree" }
];
const FILTERS = [
  { key: "all", label: "Everything" },
  { key: "loved", label: "Loved" },
  { key: "rated", label: "Ratings" },
  { key: "watchlist", label: "Watchlists" }
];
const poster = (m) => (m?.poster_path ? `https://image.tmdb.org/t/p/w154${m.poster_path}` : "/placeholder_poster.svg");
const dayOf = (at) => {
  const d = new Date(at), today = new Date();
  const days = Math.round((new Date(today.toDateString()) - new Date(d.toDateString())) / 86_400_000);
  return days === 0 ? "Today" : days === 1 ? "Yesterday" : days < 7 ? `${days} days ago` : d.toLocaleDateString(document.documentElement.lang || undefined, { day: "numeric", month: "long" });
};
const verb = (a) => (a.kind === "watchlist" ? "wants to watch" : a.rating >= 9 ? "loved" : a.rating ? "rated" : "watched");

function Reactions({ item, mine, all, onReact }) {
  const [open, setOpen] = useState(false);
  const counts = REACTIONS.map((r) => ({ ...r, n: all.filter((x) => x.emoji === r.key).length })).filter((r) => r.n);
  return (
    <div className="flex flex-wrap items-center gap-1">
      {counts.map((r) => (
        <button key={r.key} type="button" onClick={() => onReact(item, mine === r.key ? null : r.key)} aria-pressed={mine === r.key} title={r.label}
          className={`rounded-full border px-1.5 py-0.5 text-xs ${mine === r.key ? "border-indigo-400 bg-indigo-50 dark:bg-indigo-950/50" : "border-slate-200 dark:border-slate-700"}`}>
          {r.emoji} <span className="tabular-nums">{r.n}</span>
        </button>
      ))}
      <div className="relative">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="React"
          className="rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-xs text-slate-500 hover:border-indigo-400 dark:border-slate-600">+ 🙂</button>
        {open && (
          <div className="absolute bottom-full left-0 z-20 mb-1 flex gap-1 rounded-full border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900" role="group" aria-label="Reactions">
            {REACTIONS.map((r) => (
              <button key={r.key} type="button" title={r.label} aria-label={r.label} onClick={() => { setOpen(false); onReact(item, mine === r.key ? null : r.key); }}
                className={`rounded-full px-1.5 py-0.5 text-base transition hover:scale-125 ${mine === r.key ? "bg-indigo-100 dark:bg-indigo-900" : ""}`}>{r.emoji}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * What friends watched, rated and saved, newest first and grouped by day,
 * each with its poster, a reaction for films they watched, and one tap to
 * put it on your own watchlist.
 */
export default function ActivityFeed({ data, me, onChanged }) {
  const { open } = useModal();
  const { isInWatchlist, addToWatchlist } = useWatchlist();
  const [filter, setFilter] = useState("all");
  const [reactions, setReactions] = useState(data.reactions || {});
  const people = useMemo(() => new Map(data.people.map((p) => [p.id, p])), [data.people]);

  const items = data.activity.filter((a) => (filter === "all" ? true : filter === "loved" ? a.kind === "watched" && a.rating >= 8 : filter === "rated" ? a.kind === "watched" && a.rating : a.kind === "watchlist"));
  const days = [];
  for (const a of items) {
    const day = dayOf(a.updated_at);
    if (days.at(-1)?.day !== day) days.push({ day, items: [] });
    days.at(-1).items.push(a);
  }

  const react = async (a, emoji) => {
    const key = `${a.user_id}:${a.movie_id}`;
    const before = reactions[key] || [];
    setReactions((r) => ({ ...r, [key]: [...before.filter((x) => x.reactor !== me), ...(emoji ? [{ reactor: me, emoji }] : [])] }));
    try {
      await backend("social", { action: "react", owner: a.user_id, movie_id: Number(a.movie_id), emoji });
      onChanged?.();
    } catch {
      setReactions((r) => ({ ...r, [key]: before }));
    }
  };
  const show = async (movie) => { try { open(await movieDetails(movie.id)); } catch { open(movie); } };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Show">
        {FILTERS.map((f) => (
          <button key={f.key} role="radio" aria-checked={filter === f.key} onClick={() => setFilter(f.key)}
            className={`rounded-full border px-3 py-1 text-sm ${filter === f.key ? "border-indigo-500 bg-indigo-50 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-200" : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"}`}>
            {f.label}
          </button>
        ))}
      </div>
      {!items.length && <p className="account-panel text-sm text-slate-500">When mutual friends share their activity, their latest films appear here.</p>}
      {days.map(({ day, items: list }) => (
        <div key={day} className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{day}</h3>
          <ul className="space-y-2">
            {list.map((a) => {
              const person = people.get(a.user_id);
              const key = `${a.user_id}:${a.movie_id}`;
              const all = reactions[key] || [];
              const saved = isInWatchlist?.(Number(a.movie_id));
              return (
                <li key={`${key}:${a.kind}`} className="account-panel flex gap-3 p-3">
                  <button type="button" onClick={() => show({ ...a.movie, id: Number(a.movie_id) })} className="w-14 shrink-0" aria-label={`Open ${a.movie?.title}`}>
                    <img loading="lazy" decoding="async" src={poster(a.movie)} alt="" className="w-full rounded-md object-cover" style={{ aspectRatio: "2 / 3" }} />
                  </button>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="flex flex-wrap items-center gap-x-1.5 text-sm">
                      <Link to={`/friends/${a.user_id}`} className="inline-flex items-center gap-1.5 font-semibold text-slate-900 hover:underline dark:text-slate-100">
                        <UserAvatar user={person} name={person?.display_name} className="chip-avatar" />{person?.display_name || "A friend"}
                      </Link>
                      <span className="text-slate-500">{verb(a)}</span>
                      <span className="font-medium" translate="no">{a.movie?.title}</span>
                      {a.rating ? <span className="inline-flex items-center gap-0.5 text-amber-600"><Star className="h-3.5 w-3.5 fill-current" />{a.rating / 2}</span> : null}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      {a.kind === "watched" && <Reactions item={a} mine={all.find((x) => x.reactor === me)?.emoji} all={all} onReact={react} />}
                      <button type="button" disabled={saved} onClick={() => addToWatchlist({ ...a.movie, id: Number(a.movie_id) })}
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-slate-500 hover:text-indigo-600 disabled:text-emerald-600">
                        {saved ? <><Check className="h-3 w-3" /> On your watchlist</> : <><Bookmark className="h-3 w-3" /> Save</>}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
