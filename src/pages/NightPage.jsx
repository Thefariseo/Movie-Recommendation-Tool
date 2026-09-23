import React, { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Check, Copy, Moon, Scale } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useModal } from "../hooks/useModal";
import { backend } from "../utils/backend";

const CHOICES = [
  { vote: -1, label: "No" },
  { vote: 1, label: "Fine" },
  { vote: 2, label: "Yes please" }
];
const POLL_MS = 3000;

// A movie night ballot. Everyone opens the same link on their own phone; the
// page refreshes itself so votes appear live, and the host decides.
export default function NightPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { open } = useModal();
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => backend(`tonight?id=${id}`).then(setState).catch((e) => setError(e.message)), [id]);
  useEffect(() => {
    if (!user) return undefined;
    load();
    const timer = setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
    return () => clearInterval(timer);
  }, [user?.id, load]);

  const act = async (data) => {
    setBusy(true);
    setError("");
    try {
      setState(await backend("tonight", { id, ...data }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!user) return <main className="mx-auto max-w-xl p-6"><section className="account-panel"><h1 className="text-xl font-semibold">Sign in to vote on this movie night.</h1><Link className="account-button mt-4 inline-block" to="/profile">Sign in</Link></section></main>;
  if (!state) return <main className="mx-auto max-w-xl p-6">{error ? <p role="alert" className="text-sm text-red-500">{error}</p> : <p className="text-sm text-slate-500">Loading the ballot…</p>}</main>;

  const { night, votes, people, ranking } = state;
  const name = (uid) => people.find((p) => p.id === uid)?.display_name || "Someone";
  const mine = (movieId) => votes.find((v) => v.user_id === user.id && Number(v.movie_id) === movieId)?.vote;
  const voted = new Set(votes.map((v) => v.user_id));
  const favoured = Object.entries(night.weights || {}).filter(([, w]) => w > 1);
  const decided = night.status === "decided";
  const winner = decided && night.films.find((f) => f.id === Number(night.winner));
  const score = Object.fromEntries(ranking.map((r) => [r.id, r]));

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 pb-24 pt-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow flex items-center gap-1.5"><Moon className="h-3.5 w-3.5" /> MOVIE NIGHT</p>
          <h1 className="text-2xl font-semibold">{decided ? "Tonight you are watching…" : "Vote for tonight's film"}</h1>
          <p className="mt-1 text-sm text-slate-500">{night.members.map((m) => `${name(m)}${voted.has(m) ? " ✓" : ""}`).join(" · ")}</p>
        </div>
        {!decided && (
          <button className="account-secondary flex items-center gap-1.5" onClick={async () => {
            try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard may be blocked */ }
          }}>{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Link copied" : "Copy link for friends"}</button>
        )}
      </header>

      {favoured.length > 0 && (
        <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          <Scale className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{favoured.map(([uid, w]) => `${name(uid)} compromised in your recent movie nights, so their votes count ×${w} tonight.`).join(" ")}</span>
        </p>
      )}

      {winner && (
        <button type="button" onClick={() => open(winner)} className="account-panel flex w-full items-center gap-4 text-left">
          <img className="w-24 rounded-lg" alt="" src={winner.poster_path ? `https://image.tmdb.org/t/p/w342${winner.poster_path}` : "/placeholder_poster.svg"} />
          <span><span className="block text-2xl font-semibold">{winner.title}</span>{winner._reason && <span className="mt-1 block text-sm text-slate-500">{winner._reason}</span>}</span>
        </button>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {night.films.map((f) => (
          <article key={f.id} className={`account-panel flex gap-3 ${decided && f.id !== Number(night.winner) ? "opacity-50" : ""}`}>
            <button type="button" onClick={() => open(f)} className="w-20 shrink-0"><img className="rounded-md" alt={f.title} src={f.poster_path ? `https://image.tmdb.org/t/p/w185${f.poster_path}` : "/placeholder_poster.svg"} /></button>
            <div className="min-w-0 flex-1 space-y-2">
              <p className="font-semibold leading-tight">{f.title} <span className="text-xs font-normal text-slate-500">{f.release_date?.slice(0, 4)}</span></p>
              {f._reason && <p className="line-clamp-2 text-xs text-slate-500">{f._reason}</p>}
              {f.providers?.length > 0 && <p className="text-xs text-slate-500">On {f.providers.map((p) => p.name).join(", ")}</p>}
              {!decided ? (
                <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Your vote on ${f.title}`}>
                  {CHOICES.map((c) => (
                    <button key={c.vote} type="button" disabled={busy} aria-pressed={mine(f.id) === c.vote}
                      onClick={() => act({ action: "vote", movie_id: f.id, vote: mine(f.id) === c.vote ? 0 : c.vote })}
                      className={`rounded-full border px-2.5 py-1 text-xs ${mine(f.id) === c.vote ? "border-indigo-500 bg-indigo-600 text-white" : "border-slate-200 dark:border-slate-700"}`}>{c.label}</button>
                  ))}
                </div>
              ) : null}
              <p className="text-[11px] text-slate-400">{score[f.id]?.voters || 0} votes · score {score[f.id]?.score ?? 0}</p>
            </div>
          </article>
        ))}
      </div>

      {!decided && night.host === user.id && (
        <button className="account-button" disabled={busy || !votes.length} onClick={() => act({ action: "decide" })}>Decide now</button>
      )}
      {!decided && night.host !== user.id && <p className="text-sm text-slate-500">{name(night.host)} decides when everyone has voted.</p>}
      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
    </main>
  );
}
