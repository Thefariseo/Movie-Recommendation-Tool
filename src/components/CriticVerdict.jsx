import React, { useEffect, useState } from "react";
import { Feather, RefreshCw } from "lucide-react";
import { backend } from "../utils/backend";
import { reloadSignals } from "../utils/signals";

const VERDICT = { love: "Made for you", like: "Likely a good fit", mixed: "Could go either way", skip: "Probably not for you" };

// "What would my critic say?" for one film, written against the member's
// diary. A verdict is kept: it shows again whenever the film is opened, and
// only "Ask again" spends a new question.
export default function CriticVerdict({ movieId }) {
  const [verdict, setVerdict] = useState(null);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setVerdict(null);
    setError("");
    setChecked(false);
    backend(`critic?verdict=${movieId}`)
      .then((r) => live && setVerdict(r.verdict))
      .catch(() => {})
      .finally(() => live && setChecked(true));
    return () => { live = false; };
  }, [movieId]);
  const ask = async (refresh = false) => {
    setBusy(true);
    setError("");
    try {
      setVerdict(await backend("critic", { action: "explain", movie_id: movieId, refresh, language: (navigator.language || "en").split("-")[0] }));
      // A "skip" now keeps the film out of recommendations; let them know.
      reloadSignals();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  if (!checked) return null;
  if (!verdict) return (
    <div className="mt-4">
      <button type="button" className="account-secondary flex items-center gap-1.5" disabled={busy} onClick={() => ask(false)}>
        <Feather className="h-3.5 w-3.5" /> {busy ? "Your critic is thinking…" : "What would my critic say?"}
      </button>
      {error && <p role="alert" className="mt-2 text-xs text-red-500">{error}</p>}
    </div>
  );
  return (
    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-600 dark:text-amber-400">Your critic · {VERDICT[verdict.verdict]}</p>
        <button type="button" disabled={busy} onClick={() => ask(true)} className="flex shrink-0 items-center gap-1 text-[11px] text-amber-700 hover:underline disabled:opacity-50 dark:text-amber-400" title="Spends one of today's critic questions">
          <RefreshCw className={`h-3 w-3 ${busy ? "animate-spin" : ""}`} /> Ask again
        </button>
      </div>
      <p className="mt-1 font-semibold">{verdict.headline}</p>
      <p className="mt-2 text-sm leading-relaxed text-slate-700 dark:text-slate-300">{verdict.analysis}</p>
      {verdict.verdict === "skip" && <p className="mt-2 text-[11px] text-slate-500">Umbrify won't recommend it to you.</p>}
      {error && <p role="alert" className="mt-2 text-xs text-red-500">{error}</p>}
    </div>
  );
}
