import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Feather, MessageSquarePlus, RotateCcw, Send, Sparkles, Star, Trash2 } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { backend } from "../utils/backend";
import useWatched from "../hooks/useWatched";
import MovieCard from "../components/MovieCard";
import { movieDetails } from "../utils/api";

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

// The films a reply recommends (or asks the member to rate), under that reply.
// Messages saved before posters were stored carry only ids; those are looked up.
function ReplyFilms({ message }) {
  const [legacy, setLegacy] = useState([]);
  const ids = message.films ? [] : message.movie_ids || [];
  useEffect(() => {
    if (!ids.length) return undefined;
    let live = true;
    Promise.allSettled(ids.map((id) => movieDetails(id))).then((r) => live && setLegacy(r.filter((x) => x.status === "fulfilled").map((x) => x.value)));
    return () => { live = false; };
  }, [ids.join()]);
  const films = message.films || legacy;
  if (!films.length) return null;
  const rateable = message.mode === "interview";
  return (
    <div className="mr-8 flex gap-3 overflow-x-auto pb-1">
      {films.map((f) => (
        <div key={f.id} className="w-28 shrink-0 space-y-1.5 sm:w-32">
          <MovieCard movie={f} />
          {(rateable || f._seen) && <QuickRate movie={f} />}
          {f._why && <p className="line-clamp-3 text-[11px] leading-snug text-slate-500">{f._why}</p>}
        </div>
      ))}
    </div>
  );
}

function Bubble({ message, animate }) {
  const mine = message.role === "user";
  return (
    <motion.div initial={animate ? { opacity: 0, y: 8 } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: "easeOut" }} className="space-y-2">
      <p className={`whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed ${mine ? "ml-10 rounded-br-md bg-indigo-600 text-white" : "mr-10 rounded-bl-md bg-slate-100 dark:bg-slate-800"}`}>
        {!mine && <span className="mb-1 block text-[10px] font-semibold uppercase opacity-60">Your critic</span>}
        {message.content}
      </p>
      {!mine && <ReplyFilms message={message} />}
    </motion.div>
  );
}

function Typing() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mr-10 inline-flex items-center gap-1 rounded-2xl rounded-bl-md bg-slate-100 px-4 py-3 dark:bg-slate-800" aria-label="Your critic is writing">
      {[0, 150, 300].map((d) => <span key={d} className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: `${d}ms` }} />)}
    </motion.div>
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
  // The member's message shows at once, before the critic answers.
  const [pending, setPending] = useState(null);
  const seenCount = useRef(null);
  const [interview, setInterview] = useState(false);
  // The open chat; null is a new one, created by its first message.
  const [threadId, setThreadId] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const log = useRef(null);
  const rated = watched.filter((m) => Number(m.rated) > 0).length;

  const showThread = (thread) => {
    seenCount.current = null;
    setThreadId(thread?.id || null);
    setState((s) => ({ ...s, messages: thread?.messages || [] }));
    // A new member starts with the interview rather than an empty box.
    setInterview(thread?.messages?.length ? thread.messages.at(-1)?.mode === "interview" : rated < 5);
  };
  const openThread = async (id) => {
    setError("");
    try {
      showThread((await backend(`critic?thread=${id}`)).thread);
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => {
    if (!user) return;
    backend("critic").then(async (s) => {
      setState({ ...s, messages: [] });
      // Pick up the latest chat where it was left.
      if (s.threads?.length) await openThread(s.threads[0].id);
      else showThread(null);
    }).catch((e) => setError(e.message));
  }, [user?.id]);
  // Scroll the conversation, not the page.
  useEffect(() => {
    const box = log.current;
    if (box) box.scrollTo({ top: box.scrollHeight, behavior: seenCount.current == null ? "auto" : "smooth" });
    if (state?.messages && seenCount.current == null) seenCount.current = state.messages.length;
  }, [state?.messages?.length, pending]);

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
    setPending(text.trim());
    setMessage("");
    const result = await call({ action: "message", message: text.trim(), mode: interview ? "interview" : "chat", thread: threadId });
    setPending(null);
    // On failure the text comes back, so nothing typed is lost.
    if (!result) return setMessage(text);
    // The member's own message was already shown; only the reply animates in.
    const { messages, ...summary } = result.thread;
    seenCount.current = messages.length - 1;
    setThreadId(summary.id);
    setState((s) => ({ ...s, messages, notes: result.notes, threads: [summary, ...(s.threads || []).filter((t) => t.id !== summary.id)] }));
    if (result.interview_complete) setInterview(false);
  };
  // Enter sends; Shift+Enter starts a new line; nothing is sent mid-composition (accents, IME).
  const onKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };
  const portrait = async (refresh = false) => {
    const result = await call({ action: "portrait", language: language(), refresh });
    if (result) setState((s) => ({ ...s, portrait: result.portrait }));
  };
  const reset = async () => {
    if (!window.confirm("Forget all your chats and everything your critic has noted about you?")) return;
    if (await call({ action: "reset" })) {
      setState((s) => ({ ...s, messages: [], notes: [], portrait: null, threads: [] }));
      showThread(null);
    }
  };
  const removeThread = async (id) => {
    if (!window.confirm("Delete this chat?")) return;
    if (!(await call({ action: "delete-thread", thread: id }))) return;
    setState((s) => ({ ...s, threads: (s.threads || []).filter((t) => t.id !== id) }));
    if (id === threadId) showThread(null);
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

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 pb-24 pt-6">
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

      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      <aside className="account-panel h-fit space-y-3">
        <button className="account-button flex w-full items-center justify-center gap-1.5" disabled={busy} onClick={() => showThread(null)}>
          <MessageSquarePlus className="h-4 w-4" /> New chat
        </button>
        {state?.threads?.length > 0 && (
          <details open className="lg:[&>summary]:hidden">
            <summary className="cursor-pointer text-xs font-semibold uppercase text-slate-500">Your chats ({state.threads.length})</summary>
            <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto lg:mt-0 lg:max-h-[60vh]">
              {state.threads.map((t) => (
                <li key={t.id} className="group flex items-center gap-1">
                  <button disabled={busy} onClick={() => openThread(t.id)} className={`min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left text-sm ${t.id === threadId ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300" : "hover:bg-slate-50 dark:hover:bg-slate-800"}`}>
                    <span className="block truncate">{t.title}</span>
                    <span className="block text-[10px] text-slate-400">{new Date(t.updated_at).toLocaleDateString()}</span>
                  </button>
                  <button disabled={busy} onClick={() => removeThread(t.id)} aria-label={`Delete ${t.title}`} className="p-1 text-slate-300 hover:text-red-500 lg:opacity-0 lg:group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </aside>
      <section className="account-panel min-w-0 space-y-4">
        <div ref={log} className="max-h-[60vh] space-y-4 overflow-y-auto overscroll-contain pr-1" role="log" aria-live="polite">
          {state?.messages?.map((m, i) => <Bubble key={i} message={m} animate={seenCount.current != null && i >= seenCount.current} />)}
          {pending && <Bubble message={{ role: "user", content: pending }} animate />}
          {busy && pending && <Typing />}
        </div>
        {!state?.messages?.length && !pending && (
          <div className="flex flex-wrap gap-2">
            {(interview ? ["Ciao! Fammi qualche domanda sui miei gusti.", "Interview me about my taste."] : ["Cosa dicono di me i miei voti?", "Something like my favourites, but braver", "Perché ho odiato il mio film peggiore?"]).map((p) => (
              <button key={p} className="account-secondary text-left" disabled={busy} onClick={() => send(p)}>{p}</button>
            ))}
          </div>
        )}
        {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
        <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <label className="sr-only" htmlFor="critic-message">{interview ? "Your answer" : "Your message"}</label>
          <textarea id="critic-message" className="account-input flex-1 resize-none" rows={Math.min(5, message.split("\n").length)} maxLength={1000} value={message}
            onChange={(e) => setMessage(e.target.value)} onKeyDown={onKey}
            placeholder={interview ? "Il mio film preferito è…" : "Troppo lento. Qualcosa con più ritmo?"} />
          <button className="account-button flex h-11 items-center gap-1.5" disabled={busy || !message.trim()} aria-label="Send">
            <Send className="h-4 w-4" /><span className="hidden sm:inline">Send</span>
          </button>
        </form>
        <p className="-mt-2 text-[11px] text-slate-400">Enter to send · Shift+Enter for a new line · 15 questions a day</p>
        {state?.notes?.length > 0 && (
          <details className="text-xs text-slate-500">
            <summary className="cursor-pointer">What your critic remembers about you ({state.notes.length})</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">{state.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
          </details>
        )}
      </section>
      </div>
    </main>
  );
}
