import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Globe, Lock, Plus } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { changeList, useMyLists } from "../utils/lists";
import { PosterGridSkeleton } from "../components/Skeletons";

const poster = (f) => (f?.poster_path ? `https://image.tmdb.org/t/p/w154${f.poster_path}` : "/placeholder_poster.svg");
// What a list's page can draw before it loads (src/pages/ListPage.jsx): its
// title, words and first posters, which grow into their places there.
const hintOf = (l) => JSON.stringify({ list: {
  id: l.id, title: l.title, description: l.description || "", public: l.public, mine: true, count: l.films.length,
  films: l.films.slice(0, 5).map((f) => ({ id: f.id, poster_path: f.poster_path || null })),
} });

/** The member's lists in the Library: each with a strip of its first posters, and a new one. */
export default function ListsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const lists = useMyLists(user?.id || null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  if (!user) return <section className="account-panel text-sm">Sign in to make lists you can share with anyone. <Link className="font-medium text-indigo-600 hover:underline" to="/profile">Sign in</Link></section>;

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { list } = await changeList("list-save", { list: { title, films: [] } });
      navigate(`/list/${list.id}`);
    } catch (err) {
      addToast(err.message, "error");
      setBusy(false);
    }
  };

  return (
    <section className="space-y-6 pt-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="section-title">Your lists</h2>
          <p className="mt-1 text-sm text-slate-500">Group films however you like and send the link to anyone, even without an account. Add films from any film sheet.</p>
        </div>
        <form onSubmit={create} className="flex w-full gap-2 sm:w-auto">
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} required placeholder="Seventies horror, For Ozu lovers…" aria-label="New list title" className="account-input !mt-0 min-w-0 flex-1 sm:w-64 sm:flex-none" />
          <button className="account-button inline-flex shrink-0 items-center gap-1.5" disabled={busy || !title.trim()}><Plus className="h-4 w-4" /> New list</button>
        </form>
      </div>
      {lists == null && <PosterGridSkeleton count={3} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" />}
      {lists && !lists.length && <p className="account-panel text-sm text-slate-500">No lists yet. Start one above, or open any film and use “Add to list”.</p>}
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(lists || []).map((l) => (
          <li key={l.id}>
            <Link to={`/list/${l.id}`} data-state={hintOf(l)} className="account-panel block space-y-3 text-slate-900 transition hover:border-slate-900 dark:text-slate-100 dark:hover:border-white">
              <div className="flex h-24 gap-1 overflow-hidden">
                {l.films.slice(0, 5).map((f, i) => <img loading="lazy" decoding="async" key={f.id} src={poster(f)} alt="" data-morph={`list-film-${i}`} className="h-24 w-16 object-cover" />)}
                {!l.films.length && <span className="flex h-24 w-full items-center justify-center bg-slate-100 text-xs text-slate-400 dark:bg-slate-800">Empty</span>}
              </div>
              <div>
                <p className="font-semibold uppercase" translate="no" data-morph="list-title">{l.title}</p>
                <p className="flex items-center gap-1 text-xs text-slate-500">{l.public ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />}{`${l.films.length} films`}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
