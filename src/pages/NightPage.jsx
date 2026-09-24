import React, { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Check, Copy, Dices, Moon, Scale, Sparkles, Trophy, Shuffle } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useModal } from "../hooks/useModal";
import { backend } from "../utils/backend";
import { DRAWS } from "../../shared/tonight.js";

const CHOICES = [
  { vote: -1, label: "No" },
  { vote: 1, label: "Fine" },
  { vote: 2, label: "Yes please" }
];
const POLL_MS = 3000;
const DRAW_ICONS = { best: Trophy, lottery: Dices, chance: Shuffle, wildcard: Sparkles };
const poster = (f, size = "w185") => (f?.poster_path ? `https://image.tmdb.org/t/p/${size}${f.poster_path}` : "/placeholder_poster.svg");
const percent = (p) => `${Math.round(p * 100)}%`;

// The draw, played once for everyone who opens the night after it: posters
// flick past, slowing down, and stop on the winner. Wild cards nobody saw are
// shown face down until the last one turns over.
function Reel({ films, winner, onDone }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { onDone(); return undefined; }
    let step = 0, timer;
    const steps = 18 + films.length;
    const tick = () => {
      step++;
      setIndex(step);
      if (step >= steps) { timer = setTimeout(onDone, 700); return; }
      // Each flick a little slower than the last, like a wheel losing speed.
      timer = setTimeout(tick, 60 + 14 * step);
    };
    timer = setTimeout(tick, 60);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const steps = 18 + films.length;
  const current = index >= steps ? winner : films[index % films.length];
  return (
    <div className="account-panel flex flex-col items-center gap-3 py-8" role="status" aria-live="polite">
      <p className="eyebrow flex items-center gap-1.5"><Dices className="h-3.5 w-3.5" /> THE DRAW</p>
      <img key={index} className="h-56 rounded-lg shadow-lg" style={{ aspectRatio: "2 / 3" }} alt="" src={current ? poster(current, "w342") : "/placeholder_poster.svg"} />
      <p className="text-lg font-semibold">{index >= steps ? winner?.title : "…"}</p>
    </div>
  );
}

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
  const [mode, setMode] = useState("best");
  // The reel plays once per night on each device.
  const revealKey = `umbrify_revealed:${id}`;
  const [revealed, setRevealed] = useState(() => { try { return sessionStorage.getItem(revealKey) === "1"; } catch { return false; } });
  const reveal = () => { setRevealed(true); try { sessionStorage.setItem(revealKey, "1"); } catch { /* storage may be blocked */ } };

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

  const { night, votes, people, ranking, odds = {} } = state;
  const name = (uid) => people.find((p) => p.id === uid)?.display_name || "Someone";
  const mine = (movieId) => votes.find((v) => v.user_id === user.id && Number(v.movie_id) === movieId)?.vote;
  const voted = new Set(votes.map((v) => v.user_id));
  const favoured = Object.entries(night.weights || {}).filter(([, w]) => w > 1);
  const decided = night.status === "decided";
  const winner = decided && night.films.find((f) => f.id === Number(night.winner));
  const score = Object.fromEntries(ranking.map((r) => [r.id, r]));
  const draw = night.draw;
  const drawn = draw && draw.mode !== "best";
  const winnerOdds = drawn ? draw.odds?.find((o) => Number(o.id) === Number(night.winner))?.p : null;
  const title = (fid) => night.films.find((f) => Number(f.id) === Number(fid))?.title || "A wild card";
  // Films on the reel: the ballot's contenders, or face-down cards for a wild card.
  const reelFilms = draw?.mode === "wildcard" ? (draw.odds || []).map(() => null) : (draw?.odds || []).map((o) => night.films.find((f) => Number(f.id) === Number(o.id))).filter(Boolean);
  const preview = odds[mode] || [];

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

      {winner && drawn && !revealed && <Reel films={reelFilms.length ? reelFilms : [winner]} winner={winner} onDone={reveal} />}
      {winner && (!drawn || revealed) && (
        <button type="button" onClick={() => open(winner)} className="account-panel flex w-full items-center gap-4 text-left">
          <img className="w-24 rounded-lg" alt="" src={poster(winner, "w342")} />
          <span>
            {draw && <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">{DRAWS[draw.mode]?.label}{winnerOdds != null && draw.mode !== "wildcard" ? ` · it had ${percent(winnerOdds)} odds` : ""}</span>}
            <span className="block text-2xl font-semibold">{winner.title}</span>
            {winner._reason && <span className="mt-1 block text-sm text-slate-500">{winner._reason}</span>}
          </span>
        </button>
      )}
      {drawn && revealed && draw.mode !== "wildcard" && draw.odds?.length > 1 && (
        <p className="text-xs text-slate-500">The odds were: {draw.odds.map((o) => `${title(o.id)} ${percent(o.p)}`).join(" · ")}.</p>
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
        <section className="account-panel space-y-3">
          <p className="text-sm font-semibold">How do you want to decide?</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="How to decide">
            {Object.entries(DRAWS).filter(([key]) => key !== "wildcard" || night.wildcards > 0).map(([key, d]) => {
              const Icon = DRAW_ICONS[key];
              return (
                <button key={key} type="button" role="radio" aria-checked={mode === key} onClick={() => setMode(key)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${mode === key ? "border-indigo-500 bg-indigo-600 text-white" : "border-slate-200 dark:border-slate-700"}`}>
                  <Icon className="h-4 w-4" /> {d.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-slate-500">{DRAWS[mode].hint}</p>
          {mode !== "wildcard" && preview.length > 0 && (votes.length > 0 || mode === "chance") && (
            <ul className="space-y-1 text-xs">
              {preview.map((o) => (
                <li key={o.id} className="flex items-center gap-2">
                  <span className="w-40 truncate">{title(o.id)}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><span className="block h-full bg-indigo-500" style={{ width: percent(o.p) }} /></span>
                  <span className="w-10 text-right tabular-nums">{percent(o.p)}</span>
                </li>
              ))}
            </ul>
          )}
          {mode === "wildcard" && <p className="text-xs text-slate-500">{night.wildcards} hidden films picked for your group — nobody has seen them on the ballot.</p>}
          <button className="account-button inline-flex items-center gap-1.5" disabled={busy || (DRAWS[mode].needsVotes && !votes.length)} onClick={() => act({ action: "decide", mode })}>
            {mode === "best" ? <><Trophy className="h-4 w-4" /> Decide now</> : <><Dices className="h-4 w-4" /> Draw now</>}
          </button>
          {DRAWS[mode].needsVotes && !votes.length && <p className="text-xs text-slate-500">Wait for a vote, or leave it to chance.</p>}
        </section>
      )}
      {!decided && night.host !== user.id && <p className="text-sm text-slate-500">{name(night.host)} decides when everyone has voted.</p>}
      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
    </main>
  );
}
