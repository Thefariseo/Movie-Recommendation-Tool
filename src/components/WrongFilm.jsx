import React, { useState } from "react";
import { Search } from "lucide-react";
import useWatched from "@/hooks/useWatched";
import { useModal } from "@/hooks/useModal";
import { useToast } from "../contexts/ToastContext";
import { searchMovies } from "../utils/api";

const poster = (m) => (m.poster_path ? `https://image.tmdb.org/t/p/w92${m.poster_path}` : "/placeholder_poster.svg");

/**
 * "Wrong film?" on a film in the member's diary: an import can match a title
 * to the wrong film (a making-of in place of the film itself). The right one
 * is found by a search and takes its place, with the same rating.
 */
export default function WrongFilm({ movie, rating }) {
  const { addWatched, removeWatched, isWatched } = useWatched();
  const { open } = useModal();
  const { addToast } = useToast();
  const [shown, setShown] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);

  const search = async (e) => {
    e?.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    try { setResults(((await searchMovies(query.trim())).results || []).filter((m) => m.id !== movie.id).slice(0, 6)); }
    catch { setResults([]); }
    setBusy(false);
  };
  const replace = async (right) => {
    setBusy(true);
    try {
      if (!isWatched(right.id)) await addWatched({ ...right, rated: rating ?? undefined });
      await removeWatched(movie.id);
      addToast(`Replaced with “${right.title}”`, "success");
      open(right);
    } catch (e) {
      addToast(e.message, "error");
      setBusy(false);
    }
  };

  if (!shown) {
    return (
      <button type="button" className="text-xs text-slate-500 underline-offset-2 hover:underline"
        onClick={() => { setShown(true); setQuery(movie.original_title && movie.original_title !== movie.title ? movie.original_title : movie.title); }}>
        Wrong film? Replace it
      </button>
    );
  }
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
      <p className="text-xs text-slate-500">Search for the film you meant: it takes this one's place in your diary, with the same rating.</p>
      <form onSubmit={search} className="flex gap-2">
        <input className="account-input !mt-0 min-w-0 flex-1" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search for the right film" />
        <button className="account-secondary inline-flex shrink-0 items-center gap-1.5" disabled={busy || !query.trim()}><Search className="h-4 w-4" /> Search</button>
      </form>
      {results && !results.length && <p className="text-xs text-slate-500">No films found. Try the original title.</p>}
      {results?.length > 0 && (
        <ul className="space-y-1">
          {results.map((m) => (
            <li key={m.id}>
              <button type="button" disabled={busy} onClick={() => replace(m)} className="flex w-full items-center gap-3 rounded-md p-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800">
                <img src={poster(m)} alt="" className="h-12 w-8 shrink-0 rounded object-cover" />
                <span className="min-w-0 text-sm">
                  <span className="block truncate font-medium" translate="no">{m.title}</span>
                  <span className="block text-xs text-slate-500">{[m.release_date?.slice(0, 4), m.original_title !== m.title ? m.original_title : null].filter(Boolean).join(" · ")}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
