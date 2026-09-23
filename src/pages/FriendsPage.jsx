import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLibrary } from '../contexts/LibraryContext';
import { backend } from '../utils/backend';
import UserAvatar from '../components/UserAvatar';
import MovieCard from '../components/MovieCard';
const empty = {
  people: [],
  following: [],
  followers: [],
  activity: [],
  lists: []
};
export default function FriendsPage() {
  const {
    user,
    loading
  } = useAuth();
  const {
    watchlist
  } = useLibrary();
  const [data, setData] = useState(empty);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState([]);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [picks, setPicks] = useState(null);
  const [friendLibrary, setFriendLibrary] = useState(null);
  const refresh = useCallback(async () => {
    if (user) setData(await backend('social'));
  }, [user?.id]);
  useEffect(() => {
    refresh().catch(e => setError(e.message));
  }, [refresh]);
  const act = async fn => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  if (loading) return <main className="p-8">Loading…</main>;
  if (!user) return <main className="mx-auto max-w-xl p-6"><section className="account-panel"><p className="eyebrow">BETTER TOGETHER</p><h1 className="text-2xl font-semibold">A shared love of film</h1><p className="my-4 text-slate-500">Follow friends, build a watchlist together and find a film for everyone.</p><Link className="account-button inline-block" to="/profile">Sign in to connect</Link></section></main>;
  const mutual = data.people.filter(p => data.following.includes(p.id) && data.followers.includes(p.id));
  const select = id => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 3 ? [...prev, id] : prev);
  return <main className="mx-auto max-w-6xl space-y-6 px-4 pb-24 pt-6">
    <div><p className="eyebrow">YOUR CIRCLE</p><h1 className="text-3xl font-semibold">Cinema is better together.</h1><p className="mt-2 text-sm text-slate-500">Activity and movie nights are shared between mutual followers who enable sharing in their profile.</p></div>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}
    <div className="grid gap-6 lg:grid-cols-2"><section className="account-panel space-y-4"><h2 className="text-xl font-semibold">Find your people</h2>
      <form className="flex items-end gap-2" onSubmit={e => {
          e.preventDefault();
          act(async () => setResults((await backend(`social?q=${encodeURIComponent(query)}`)).people));
        }}><label className="account-label flex-1">Search by name<input className="account-input" value={query} minLength={2} maxLength={60} required onChange={e => setQuery(e.target.value)} /></label><button disabled={busy} className="account-button">Search</button></form>
      <p className="text-xs text-slate-500">Only people who make their profile discoverable appear here.</p>
      {results.map(p => <div key={p.id} className="flex items-center justify-between gap-3"><span className="inline-flex items-center gap-2"><UserAvatar user={p} name={p.display_name} className="friend-avatar" />{p.display_name}</span><button disabled={busy} className="account-secondary" onClick={() => act(() => backend('social', {
            action: data.following.includes(p.id) ? 'unfollow' : 'follow',
            user_id: p.id
          }))}>{data.following.includes(p.id) ? 'Unfollow' : 'Follow'}</button></div>)}
      <h3 className="font-semibold">Following & followers</h3>{!data.people.length && <p className="text-sm text-slate-500">Your circle starts with a follow.</p>}
      {data.people.map(p => <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 py-2 dark:border-slate-800"><span className="inline-flex items-center gap-2"><UserAvatar user={p} name={p.display_name} className="friend-avatar" />{p.display_name}<small className="ml-2 text-slate-500">{data.followers.includes(p.id) ? 'Follows you' : ''}</small></span><div className="flex gap-2">{mutual.some(x => x.id === p.id) && p.share_activity && <button className="account-secondary" disabled={busy} onClick={() => act(async () => setFriendLibrary({
              name: p.display_name,
              rows: (await backend('social', {
                action: 'friend-library',
                user_id: p.id
              })).rows
            }))}>View library</button>}<button disabled={busy} className="account-secondary" onClick={() => act(() => backend('social', {
              action: data.following.includes(p.id) ? 'unfollow' : 'follow',
              user_id: p.id
            }))}>{data.following.includes(p.id) ? 'Unfollow' : 'Follow back'}</button></div></div>)}
    </section>
    <section className="account-panel space-y-4"><p className="eyebrow">MAKE A NIGHT OF IT</p><h2 className="text-xl font-semibold">One film. Everyone happy.</h2><p className="text-sm text-slate-500">Choose up to three friends. Picks balance everyone's ratings and exclude films anyone has already watched.</p>
      {!mutual.length && <p className="text-sm">Follow each other to plan a movie night.</p>}
      {mutual.map(p => <label key={p.id} className="flex items-center gap-3"><input type="checkbox" checked={selected.includes(p.id)} onChange={() => select(p.id)} /><UserAvatar user={p} name={p.display_name} className="friend-avatar" />{p.display_name}{!p.share_activity && <span className="text-xs text-slate-500">Activity private</span>}</label>)}
      <button className="account-button" disabled={busy || !selected.length} onClick={() => act(async () => setPicks(await backend('recommend', {
          members: selected
        })))}>Find our film</button>
      <form className="space-y-2 border-t border-slate-200 pt-4 dark:border-slate-700" onSubmit={e => {
          e.preventDefault();
          act(async () => {
            await backend('social', {
              action: 'create-list',
              title,
              members: selected
            });
            setTitle('');
          });
        }}><label className="account-label">A watchlist for this group<input className="account-input" value={title} onChange={e => setTitle(e.target.value)} maxLength={100} placeholder="Friday night picks" required /></label><button className="account-secondary" disabled={busy || !selected.length}>Create shared watchlist</button></form>
    </section></div>
    {picks && <section className="account-panel space-y-4"><h2 className="text-xl font-semibold">Tonight's shortlist</h2><p className="text-sm text-slate-500">{picks.message}</p><div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">{picks.movies.map(m => <MovieCard key={m.id} movie={m} />)}</div></section>}
    {friendLibrary && <section className="account-panel space-y-4"><div className="flex justify-between"><h2 className="text-xl font-semibold">{friendLibrary.name}'s watchlist</h2><button onClick={() => setFriendLibrary(null)}>Close</button></div><div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">{friendLibrary.rows.filter(r => r.kind === 'watchlist').map(r => <MovieCard key={r.movie_id} movie={r.movie} />)}</div>{!friendLibrary.rows.some(r => r.kind === 'watchlist') && <p>No films on this watchlist yet.</p>}</section>}
    <section className="space-y-4"><h2 className="text-xl font-semibold">Shared watchlists</h2>{!data.lists.length && <p className="text-sm text-slate-500">Create your first list with the friends above.</p>}{data.lists.map(list => <div key={list.id} className="account-panel space-y-4"><div className="flex flex-wrap justify-between gap-3"><h3 className="text-lg font-semibold">{list.title}</h3><button className="account-secondary" disabled={busy} onClick={() => {
            if (window.confirm(list.owner_id === user.id ? 'Delete this shared list for everyone?' : 'Leave this shared list?')) act(() => backend('social', {
              action: list.owner_id === user.id ? 'delete-list' : 'leave-list',
              list_id: list.id
            }));
          }}>{list.owner_id === user.id ? 'Delete list' : 'Leave list'}</button></div>
      <label className="account-label">Add from your watchlist<select value="" className="account-input" disabled={busy} onChange={e => {
            const movie = watchlist.find(m => String(m.id) === e.target.value);
            if (movie) act(() => backend('social', {
              action: 'add-movie',
              list_id: list.id,
              movie
            }));
          }}><option value="">Choose a film…</option>{watchlist.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}</select></label>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">{list.list_movies.map(r => <div key={r.movie_id}><MovieCard movie={r.movie} /><button className="mt-2 text-xs text-slate-500 underline" disabled={busy} onClick={() => act(() => backend('social', {
              action: 'remove-movie',
              list_id: list.id,
              movie_id: Number(r.movie_id)
            }))}>Remove from shared list</button></div>)}</div></div>)}</section>
    <section className="account-panel space-y-4"><h2 className="text-xl font-semibold">Recent library activity</h2>{!data.activity.length && <p className="text-sm text-slate-500">When mutual friends share their activity, their latest films appear here.</p>}{data.activity.map(a => <div key={`${a.user_id}:${a.movie_id}:${a.kind}`} className="border-t border-slate-100 py-3 dark:border-slate-800"><p className="text-sm"><strong>{data.people.find(p => p.id === a.user_id)?.display_name || 'A friend'}</strong> {a.kind === 'watchlist' ? 'added to their watchlist' : a.rating ? `rated ${a.rating / 2}/5` : 'watched'} <strong>{a.movie.title}</strong></p><time className="text-xs text-slate-500">{new Date(a.updated_at).toLocaleString()}</time></div>)}</section>
  </main>;
}
