import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Feather, RotateCcw, Sparkles, Star } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { backend } from "../utils/backend";
import useWatched from "../hooks/useWatched";
import MovieCard from "../components/MovieCard";

const language = () => (navigator.language || "en").split("-")[0];

// One-tap rating for films the critic asks about during the interview.
function QuickRate({ movie }) {
  const { watched, addWatched, updateRating } = useWatched();
  const current = watched.find((m) => m.id === movie.id)?.rated;
  const rate = async (stars) => {
    const rated = stars * 2;
    if (current != null) await updateRating(movie.id, rated);
    else await addWatched({ ...movie, rated });
  };
  return (
    <div className="flex items-center gap-1" role="group" aria-label={`Rate ${movie.title}`}>
      {[1, 2, 3, 4, 5].map((s) => (
        <button key={s} type="button" onClick={() => rate(s)} aria-label={`${s} stars`} className="p-0.5">
          <Star className={`h-4 w-4 ${current >= s * 2 ? "fill-amber-400 text-amber-400" : "text-slate-300 dark:text-slate-600"}`} />
        </button>
      ))}
    </div>
  );
}

function Portrait({ portrait, onRefresh, busy }) {
  return (
    <section className="account-panel space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">YOUR TASTE, AS YOUR CRITIC READS IT</p>
          <h2 className="mt-1 text-xl font-semibold leading-snug">{portrait.headline}</h2>
        </div>
        <button className="account-secondary shrink-0" disabled={busy} onClick={onRefresh}>Rewrite</button>
      </div>
      {portrait.portrait.split(/\n+/).map((p, i) => <p key={i} className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{p}</p>)}
      <ul className="grid gap-3 sm:grid-cols-2">
        {portrait.traits.map((t) => (
          <li key={t.trait} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
            <p className="text-sm font-semibold">{t.trait}</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">{t.evidence}</p>
          </li>
        ))}
      </ul>
      <p className="text-sm"><span className="font-semibold">Blind spot: </span>{portrait.blind_spot}</p>
      {portrait.try_next?.movie && (
        <div className="flex items-center gap-4">
          <div className="w-28 shrink-0"><MovieCard movie={portrait.try_next.movie} /></div>
          <p className="text-sm text-slate-600 dark:text-slate-300"><span className="font-semibold">Start here: </span>{portrait.try_next.why}</p>
        </div>
      )}
    </section>
  );
}

export default function CriticPage() {
  const { user } = useAuth();
  const { watched } = useWatched();
  const [state, setState] = useState(null);
  const [films, setFilms] = useState([]);
  const [interview, setInterview] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const end = useRef(null);
  const rated = watched.filter((m) => Number(m.rated) > 0).length;

  useEffect(() => {
    if (!user) return;
    backend("critic").then((s) => {
      setState(s);
      // A new member starts with the interview rather than an empty box.
      if (!s.messages.length && rated < 5) setInterview(true);
      else setInterview(s.messages.at(-1)?.mode === "interview");
    }).catch((e) => setError(e.message));
  }, [user?.id]);
  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), [state?.messages?.length]);

  const call = async (data) => {
    setBusy(true);
    setError("");
    try {
      return await backend("critic", data);
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setBusy(false);
    }
  };
  const send = async (text = message) => {
    if (!text.trim() || busy) return;
    const result = await call({ action: "message", message: text, mode: interview ? "interview" : "chat" });
    if (!result) return;
    setState((s) => ({ ...s, messages: result.messages, notes: result.notes }));
    setFilms(result.films);
    setMessage("");
    if (result.interview_complete) setInterview(false);
  };
  const portrait = async (refresh = false) => {
    const result = await call({ action: "portrait", language: language(), refresh });
    if (result) setState((s) => ({ ...s, portrait: result.portrait }));
  };
  const reset = async () => {
    if (!window.confirm("Forget this conversation and everything your critic has noted about you?")) return;
    if (await call({ action: "reset" })) {
      setState((s) => ({ ...s, messages: [], notes: [], portrait: null }));
      setFilms([]);
      setInterview(rated < 5);
    }
  };

  if (!user) return (
    <main className="mx-auto max-w-xl p-6">
      <section className="account-panel">
        <p className="eyebrow">YOUR PERSONAL CRITIC</p>
        <h1 className="text-2xl font-semibold">A critic who has read your whole diary.</h1>
        <p className="my-4 text-sm text-slate-500">Sign in and your critic learns your taste from your ratings, talks films with you and remembers what you told it.</p>
        <Link to="/profile" className="account-button inline-block">Sign in</Link>
      </section>
    </main>
  );
  if (state && !state.enabled) return (
    <main className="mx-auto max-w-xl p-6">
      <section className="account-panel">
        <p className="eyebrow">YOUR PERSONAL CRITIC</p>
        <h1 className="text-2xl font-semibold">Your critic is not available yet.</h1>
        <p className="mt-4 text-sm text-slate-500">This Umbrify server has no language model configured. Your recommendations still work as usual.</p>
      </section>
    </main>
  );

  const last = state?.messages?.at(-1);
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 pb-24 pt-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="eyebrow flex items-center gap-1.5"><Feather className="h-3.5 w-3.5" /> YOUR PERSONAL CRITIC</p>
          <h1 className="text-2xl font-semibold">{interview ? "Let me get to know your taste." : "Talk films with someone who knows your diary."}</h1>
        </div>
        {state?.messages?.length > 0 && <button className="account-secondary flex items-center gap-1.5" disabled={busy} onClick={reset}><RotateCcw className="h-3.5 w-3.5" /> Forget</button>}
      </header>

      {state?.portrait ? <Portrait portrait={state.portrait} busy={busy} onRefresh={() => portrait(true)} /> : rated >= 5 && (
        <button className="account-panel flex w-full items-center gap-3 text-left" disabled={busy} onClick={() => portrait()}>
          <Sparkles className="h-5 w-5 text-indigo-500" />
          <span><span className="block font-semibold">Read my taste portrait</span><span className="text-sm text-slate-500">Your critic studies your {rated} ratings and tells you what they say about you.</span></span>
        </button>
      )}

      <section className="account-panel space-y-4">
        <div className="max-h-[480px] space-y-4 overflow-y-auto" role="log" aria-live="polite">
          {state?.messages?.map((m, i) => (
            <p key={i} className={`whitespace-pre-wrap rounded-xl p-4 text-sm leading-relaxed ${m.role === "user" ? "ml-8 bg-indigo-600 text-white" : "mr-8 bg-slate-100 dark:bg-slate-800"}`}>
              <span className="mb-1 block text-[10px] font-semibold uppercase opacity-60">{m.role === "user" ? "You" : "Your critic"}</span>
              {m.content}
            </p>
          ))}
          <div ref={end} />
        </div>
        {!state?.messages?.length && (
          <div className="flex flex-wrap gap-2">
            {(interview ? ["Ciao! Fammi qualche domanda sui miei gusti.", "Interview me about my taste."] : ["Cosa dicono di me i miei voti?", "Something like my favourites, but braver", "Perché ho odiato il mio film peggiore?"]).map((p) => (
              <button key={p} className="account-secondary text-left" disabled={busy} onClick={() => send(p)}>{p}</button>
            ))}
          </div>
        )}
        {films.length > 0 && last?.role === "assistant" && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {films.map((f) => (
              <div key={f.id} className="space-y-1.5">
                <MovieCard movie={f} />
                {interview || f._seen ? <QuickRate movie={f} /> : null}
                {f._why && <p className="text-[11px] leading-snug text-slate-500">{f._why}</p>}
              </div>
            ))}
          </div>
        )}
        {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
        <form className="flex items-end gap-3" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <label className="account-label flex-1">
            {interview ? "Your answer" : "Your message"}
            <textarea className="account-input resize-none" rows={2} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={interview ? "Il mio film preferito è…" : "Troppo lento. Qualcosa con più ritmo?"} required />
          </label>
          <button className="account-button" disabled={busy || !message.trim()}>{busy ? "Thinking…" : "Send"}</button>
        </form>
        {state?.notes?.length > 0 && (
          <details className="text-xs text-slate-500">
            <summary className="cursor-pointer">What your critic remembers about you ({state.notes.length})</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">{state.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
          </details>
        )}
      </section>
    </main>
  );
}
