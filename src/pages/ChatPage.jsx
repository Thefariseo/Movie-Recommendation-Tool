import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { backend } from '../utils/backend';
import MovieCard from '../components/MovieCard';
export default function ChatPage() {
  const {
    user
  } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [session, setSession] = useState(null);
  const [message, setMessage] = useState('');
  const [movies, setMovies] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const end = useRef(null);
  const refresh = () => backend('chat').then(r => setSessions(r.sessions));
  useEffect(() => {
    if (user) refresh().catch(e => setError(e.message));
  }, [user?.id]);
  useEffect(() => {
    end.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest'
    });
  }, [session?.messages]);
  const send = async (text = message) => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await backend('chat', {
        id: session?.id,
        message: text
      });
      setSession(result.session);
      setMovies(result.movies);
      setMessage('');
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const open = async id => {
    setBusy(true);
    setError('');
    try {
      const result = await backend(`chat?id=${id}`);
      setSession(result.session);
      setMovies([]);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  if (!user) return <main className="mx-auto max-w-xl p-6"><section className="account-panel"><p className="eyebrow">LET’S FIND YOUR NEXT FILM</p><h1 className="text-2xl font-semibold">Tell me what you're in the mood for.</h1><p className="my-4 text-sm text-slate-500">Sign in to save conversations and pick up where you left off on any device.</p><Link to="/profile" className="account-button inline-block">Sign in to chat</Link></section></main>;
  return <main className="mx-auto grid max-w-6xl gap-6 px-4 pb-24 pt-6 lg:grid-cols-[230px_1fr]">
    <aside className="account-panel h-fit space-y-4"><p className="eyebrow">YOUR CONVERSATIONS</p><button className="account-button w-full" disabled={busy} onClick={() => {
        setSession(null);
        setMovies([]);
        setError('');
      }}>New conversation</button><div className="space-y-2">{sessions.map(s => <div key={s.id} className="flex items-center gap-2"><button disabled={busy} onClick={() => open(s.id)} className={`min-w-0 flex-1 truncate rounded-lg p-2 text-left text-sm ${session?.id === s.id ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950' : ''}`}>{s.title}</button><button disabled={busy} aria-label={`Delete ${s.title}`} className="text-slate-400" onClick={async () => {
            if (!window.confirm('Delete this conversation?')) return;
            setBusy(true);
            try {
              await backend('chat', {
                action: 'delete',
                id: s.id
              });
              if (session?.id === s.id) {
                setSession(null);
                setMovies([]);
              }
              await refresh();
            } catch (e) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}>×</button></div>)}</div></aside>
    <section className="account-panel space-y-5"><div><p className="eyebrow">THE SCREENING ROOM</p><h1 className="text-2xl font-semibold">What feels right tonight?</h1><p className="mt-2 text-sm text-slate-500">Keep refining. Your preferences stay with this conversation.</p></div>
      <div className="max-h-[420px] space-y-4 overflow-y-auto" role="log" aria-live="polite">{session?.messages.map((m, i) => <p key={i} className={`whitespace-pre-wrap rounded-xl p-4 text-sm leading-relaxed ${m.role === 'user' ? 'ml-8 bg-indigo-600 text-white' : 'mr-8 bg-slate-100 dark:bg-slate-800'}`}><span className="mb-1 block text-[10px] font-semibold uppercase opacity-60">{m.role === 'user' ? 'You' : 'Umbrify'}</span>{m.content}</p>)}<div ref={end} /></div>
      {!session && <div className="flex flex-wrap gap-2">{['A comedy under 100 minutes', 'Una maratona di fantascienza', 'Qualcosa di romantico, senza violenza'].map(prompt => <button key={prompt} className="account-secondary text-left" disabled={busy} onClick={() => send(prompt)}>{prompt}</button>)}</div>}
      {session?.constraints && <div className="flex flex-wrap gap-2 text-xs text-slate-500">{session.constraints.max_runtime && <span>≤ {session.constraints.max_runtime} min</span>}{session.constraints.avoid_violence && <span>Gentler picks</span>}{session.constraints.theme && <span>{session.constraints.theme}</span>}</div>}
      {movies.length > 0 && <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{movies.map(m => <MovieCard key={m.id} movie={m} />)}</div>}
      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
      <form className="flex items-end gap-3" onSubmit={e => {
        e.preventDefault();
        send();
      }}><label className="account-label flex-1">Your message<textarea className="account-input resize-none" rows={2} maxLength={1000} value={message} onChange={e => setMessage(e.target.value)} placeholder="No, troppo violento. Qualcosa di più leggero?" required /></label><button className="account-button" disabled={busy || !message.trim()}>{busy ? 'Thinking…' : 'Send'}</button></form>
    </section>
  </main>;
}
