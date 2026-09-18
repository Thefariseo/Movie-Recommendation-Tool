import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLibrary } from '../contexts/LibraryContext';
import { backend } from '../utils/backend';
import MovieCard from './MovieCard';
export default function CommunityPicks() {
  const {
    user
  } = useAuth();
  const {
    watched,
    ready
  } = useLibrary();
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const ratingKey = watched.map(m => `${m.id}:${m.rated || 0}`).join(',');
  useEffect(() => {
    if (!user || !ready) return;
    const controller = new AbortController();
    setResult(null);
    setError('');
    backend('recommend', undefined, {
      signal: controller.signal
    }).then(setResult).catch(e => {
      if (e.name !== 'AbortError') setError(e.message);
    });
    return () => controller.abort();
  }, [user?.id, ready, ratingKey, revision]);
  if (!user) return null;
  return <section className="account-panel space-y-4"><div className="flex items-center justify-between gap-4"><div><p className="eyebrow">BEYOND YOUR OWN RATINGS</p><h2 className="text-xl font-semibold">Your next great watch</h2></div><button className="account-secondary" onClick={() => setRevision(n => n + 1)}>Refresh</button></div>{error ? <p role="alert" className="text-sm text-slate-500">{error}</p> : !result ? <p role="status" className="text-sm text-slate-500">Finding your next film…</p> : <><p className="text-sm text-slate-500">{result.message}</p><div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">{result.movies.slice(0, 6).map(m => <div key={m.id}><MovieCard movie={m} /><p className="mt-2 text-xs text-slate-500">{m._reason}</p></div>)}</div></>}</section>;
}
