import { useEffect, useRef, useState } from "react";
import { Check, ListPlus, Plus } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { changeList, useMyLists } from "../../utils/lists";

/** "Add to list" in the film sheet: tick the member's lists, or start a new one with this film. */
export default function AddToList({ movie }) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const lists = useMyLists(user?.id || null);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const root = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!root.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  if (!user || !movie) return null;

  const has = (list) => list.films.some((f) => Number(f.id) === Number(movie.id));
  const toggle = async (list) => {
    setBusy(true);
    try {
      if (has(list)) await changeList("list-remove", { id: list.id, movie_id: Number(movie.id) });
      else await changeList("list-add", { id: list.id, movie });
    } catch (e) { addToast(e.message, "error"); }
    setBusy(false);
  };
  const create = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      await changeList("list-save", { list: { title, films: [movie] } });
      setTitle("");
      addToast("List created", "success");
    } catch (err) { addToast(err.message, "error"); }
    setBusy(false);
  };

  return (
    <div className="relative" ref={root}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800">
        <ListPlus className="h-4 w-4" /> Add to list
      </button>
      {open && (
        <div role="dialog" aria-label="Add to list"
          className="fixed inset-x-4 bottom-4 z-50 space-y-2 border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900 sm:absolute sm:inset-x-auto sm:bottom-full sm:left-0 sm:mb-2 sm:w-72">
          {lists == null ? <p className="text-sm text-slate-500">Loading…</p> : (
            <ul className="max-h-52 space-y-0.5 overflow-y-auto">
              {lists.map((l) => (
                <li key={l.id}>
                  <button type="button" disabled={busy} onClick={() => toggle(l)} aria-pressed={has(l)}
                    className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center border ${has(l) ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300"}`}>{has(l) && <Check className="h-3 w-3" />}</span>
                    <span className="min-w-0 flex-1 truncate" translate="no">{l.title}</span>
                    <span className="text-xs text-slate-400">{l.films.length}</span>
                  </button>
                </li>
              ))}
              {!lists.length && <li className="px-2 py-1 text-sm text-slate-500">No lists yet. Start one with this film.</li>}
            </ul>
          )}
          <form onSubmit={create} className="flex gap-1.5 border-t border-slate-100 pt-2 dark:border-slate-800">
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} placeholder="New list…" aria-label="New list title" className="account-input !mt-0 flex-1 !py-1.5" />
            <button className="account-button !min-h-0 !px-3" disabled={busy || !title.trim()} aria-label="Create list"><Plus className="h-4 w-4" /></button>
          </form>
        </div>
      )}
    </div>
  );
}
