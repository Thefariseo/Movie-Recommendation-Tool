import React, { useEffect, useState } from "react";
import { Feather } from "lucide-react";
import { backend } from "../utils/backend";

const VERDICT = { love: "Made for you", like: "Likely a good fit", mixed: "Could go either way", skip: "Probably not for you" };

// "What would my critic say?" for one film, written against the member's diary.
export default function CriticVerdict({ movieId }) {
  const [verdict, setVerdict] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setVerdict(null); setError(""); }, [movieId]);
  const ask = async () => {
    setBusy(true);
    setError("");
    try {
      setVerdict(await backend("critic", { action: "explain", movie_id: movieId, language: (navigator.language || "en").split("-")[0] }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  if (!verdict) return (
    <div className="mt-4">
      <button type="button" className="account-secondary flex items-center gap-1.5" disabled={busy} onClick={ask}>
        <Feather className="h-3.5 w-3.5" /> {busy ? "Your critic is thinking…" : "What would my critic say?"}
      </button>
      {error && <p role="alert" className="mt-2 text-xs text-red-500">{error}</p>}
    </div>
  );
  return (
    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-600 dark:text-amber-400">Your critic · {VERDICT[verdict.verdict]}</p>
      <p className="mt-1 font-semibold">{verdict.headline}</p>
      <p className="mt-2 text-sm leading-relaxed text-slate-700 dark:text-slate-300">{verdict.analysis}</p>
    </div>
  );
}
