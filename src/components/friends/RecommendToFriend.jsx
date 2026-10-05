import { useEffect, useRef, useState } from "react";
import { Check, Send } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { backend } from "../../utils/backend";
import { useMutualFriends } from "../../utils/friends";
import UserAvatar from "../UserAvatar";

/**
 * "Recommend to a friend": choose friends who follow you back, add a note,
 * and the film lands in their inbox and their notifications. `only` limits
 * the choice to one friend (on their profile).
 */
export default function RecommendToFriend({ movie, only = null, className = "" }) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const friends = useMutualFriends(user?.id || null);
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState(only ? [only] : []);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const root = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!root.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  if (!user || !movie) return null;
  const list = only ? (friends || []).filter((f) => f.id === only) : friends || [];
  const send = async () => {
    setBusy(true);
    try {
      await backend("social", { action: "recommend", to: chosen, movie, note });
      addToast(chosen.length > 1 ? `Sent to ${chosen.length} friends` : "Sent to your friend", "success");
      setOpen(false);
      setNote("");
      if (!only) setChosen([]);
    } catch (e) {
      addToast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`relative ${className}`} ref={root}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-indigo-700 ring-1 ring-indigo-200 transition-colors hover:bg-indigo-50 dark:text-indigo-300 dark:ring-indigo-900 dark:hover:bg-indigo-950/40">
        <Send className="h-4 w-4" /> Recommend to a friend
      </button>
      {open && (
        <div role="dialog" aria-label="Recommend to a friend"
          className="fixed inset-x-4 bottom-4 z-50 space-y-3 sm:absolute sm:inset-x-auto sm:bottom-full sm:right-0 sm:mb-2 sm:w-80 rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900">
          {friends == null ? <p className="text-sm text-slate-500">Loading friends…</p>
            : !list.length ? <p className="text-sm text-slate-500">You can recommend films to friends who follow you back.</p>
            : (
              <>
                <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                  {list.map((f) => {
                    const on = chosen.includes(f.id);
                    return (
                      <button key={f.id} type="button" aria-pressed={on} onClick={() => setChosen((c) => (on ? c.filter((x) => x !== f.id) : [...c, f.id]))}
                        className={`inline-flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2.5 text-xs ${on ? "border-indigo-500 bg-indigo-50 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-200" : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"}`}>
                        <UserAvatar user={f} name={f.display_name} className="chip-avatar" />{f.display_name || "A friend"}{on && <Check className="h-3 w-3" />}
                      </button>
                    );
                  })}
                </div>
                <textarea className="account-input w-full resize-none text-sm" rows={2} maxLength={280} value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder="Why they should see it (optional)" aria-label="A note for your friend" />
                <button type="button" className="account-button w-full" disabled={busy || !chosen.length} onClick={send}>
                  {busy ? "Sending…" : "Send"}
                </button>
              </>
            )}
        </div>
      )}
    </div>
  );
}
