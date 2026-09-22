import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLibrary } from '../contexts/LibraryContext';
import { backend } from '../utils/backend';
import { GENRE_MAP } from '../utils/genres';
import MovieCard from './MovieCard';
export default function CommunityPicks() {
  const { user } = useAuth();
  const { watched, watchlist, ready } = useLibrary();
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [genre, setGenre] = useState('');
  const [runtime, setRuntime] = useState('');
  const [recent, setRecent] = useState([]);
  const owner = useRef(user?.id);
  const libraryKey = JSON.stringify([watched.map(m => [m.id, m.rated]), watchlist.map(m => m.id)]);
  useEffect(() => {
    if (owner.current !== user?.id) {
      owner.current = user?.id;
      setRecent([]);
    }
    if (!user || !ready) { setResult(null); return; }
    const controller = new AbortController();
    setResult(null);
    setError('');
    backend('recommend', {
      constraints: { genre_ids: genre ? [Number(genre)] : [], max_runtime: runtime ? Number(runtime) : null },
      recent_ids: recent,
    }, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setResult(data);
    }).catch(e => {
      if (!controller.signal.aborted) setError(e.message);
    });
    return () => controller.abort();
  }, [user?.id, ready, libraryKey, revision, genre, runtime, recent]);
  if (!user) return null;
  const refresh = () => {
    setRecent(prev => [...new Set([...prev, ...(result?.movies.slice(0, 6).map(m => m.id) || [])])].slice(-100));
    setRevision(n => n + 1);
  };
  return <section className="account-panel space-y-4">
    <div className="flex items-center justify-between gap-4">
      <div><p className="eyebrow">CHOSEN FOR YOUR TASTE</p><h2 className="text-xl font-semibold">Your next great watch</h2></div>
      <button className="account-secondary" onClick={refresh} disabled={!result && !error}>Other picks</button>
    </div>
    <div className="flex flex-wrap gap-3">
      <label className="text-sm">Genre <select className="account-input" value={genre} onChange={e => {setGenre(e.target.value); setRecent([]);}}>
        <option value="">Any genre</option>{Object.entries(GENRE_MAP).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select></label>
      <label className="text-sm">Time available <select className="account-input" value={runtime} onChange={e => {setRuntime(e.target.value); setRecent([]);}}>
        <option value="">Any length</option><option value="90">Up to 90 minutes</option><option value="120">Up to 2 hours</option><option value="150">Up to 2½ hours</option>
      </select></label>
    </div>
    {error ? <p role="alert" className="text-sm text-slate-500">{error}</p> : !result ? <p role="status" className="text-sm text-slate-500">Finding your next film…</p> : <>
      <p className="text-sm text-slate-500">{result.message}</p>
      {!result.movies.length && <p role="status">No matches for these preferences. Try another genre or a longer runtime.</p>}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">{result.movies.slice(0, 6).map(m => <div key={m.id}><MovieCard movie={m} /><p className="mt-2 text-xs text-slate-500">{m._reason}</p></div>)}</div>
    </>}
  </section>;
}
