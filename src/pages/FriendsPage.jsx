import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Activity, CalendarDays, Clapperboard, Copy, Inbox as InboxIcon, Link2, ListPlus, Search, Sparkles, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLibrary } from '../contexts/LibraryContext';
import { backend } from '../utils/backend';
import { forgetSocial, mutualFriends } from '../utils/friends';
import UserAvatar from '../components/UserAvatar';
import MovieCard from '../components/MovieCard';
import TasteCircle from '../components/TasteCircle';
import ActivityFeed from '../components/friends/ActivityFeed';
import Inbox from '../components/friends/Inbox';
import useWatched from '../hooks/useWatched';
import { useCircle } from '../utils/circle';
import { useFollowedJourneys } from '../utils/journeys';
import { PageHeaderSkeleton, PosterGridSkeleton } from "../components/Skeletons";

const empty = { people: [], following: [], followers: [], activity: [], reactions: {}, lists: [], unseen: 0 };
const TABS = [
  { key: 'activity', label: 'Activity', icon: Activity },
  { key: 'inbox', label: 'From friends', icon: InboxIcon },
  { key: 'circle', label: 'Your circle', icon: Sparkles },
  { key: 'together', label: 'Together', icon: Clapperboard },
  { key: 'people', label: 'People', icon: Users }
];

function Person({ p, data, busy, onToggle, children }) {
  const following = data.following.includes(p.id), follower = data.followers.includes(p.id);
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 py-2 first:border-t-0 dark:border-slate-800">
      <Link to={`/friends/${p.id}`} className="inline-flex min-w-0 items-center gap-2 text-slate-900 hover:underline dark:text-slate-100">
        <UserAvatar user={p} name={p.display_name} className="friend-avatar" />
        <span className="min-w-0">
          <span className="block truncate font-medium" translate="no">{p.display_name || 'A friend'}</span>
          <span className="block text-xs text-slate-500">{following && follower ? 'You follow each other' : follower ? 'Follows you' : following ? 'You follow them' : ''}</span>
        </span>
      </Link>
      <div className="flex gap-2">
        {children}
        <button disabled={busy} className={following ? 'account-secondary' : 'account-button'} onClick={() => onToggle(p, following)}>
          {following ? 'Unfollow' : follower ? 'Follow back' : 'Follow'}
        </button>
      </div>
    </li>
  );
}

export default function FriendsPage() {
  const { user, loading } = useAuth();
  const { watchlist } = useLibrary();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(t => t.key === params.get('tab')) ? params.get('tab') : 'activity';
  const [data, setData] = useState(empty);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [selected, setSelected] = useState([]);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [picks, setPicks] = useState(null);
  const { watched } = useWatched();
  const circle = useCircle(user?.id || null, watched);
  const [followed, { follow }] = useFollowedJourneys(user?.id || null);

  const refresh = useCallback(async () => {
    if (!user) return;
    forgetSocial();
    setData({ ...empty, ...(await backend('social')) });
  }, [user?.id]);
  useEffect(() => { refresh().catch(e => setError(e.message)); }, [refresh]);
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
  const toggleFollow = (p, following) => act(() => backend('social', { action: following ? 'unfollow' : 'follow', user_id: p.id }));
  const mutual = useMemo(() => mutualFriends(data), [data]);
  const waiting = data.people.filter(p => data.followers.includes(p.id) && !data.following.includes(p.id));
  const people = useMemo(() => new Map(data.people.map(p => [p.id, p])), [data.people]);

  if (loading) return <main className="mx-auto max-w-6xl space-y-8 px-4 pt-10"><PageHeaderSkeleton /><PosterGridSkeleton count={6} /></main>;
  if (!user) return <main className="mx-auto max-w-xl p-6"><section className="account-panel"><p className="eyebrow">BETTER TOGETHER</p><h1 className="font-display text-2xl sm:text-3xl">A shared love of film</h1><p className="my-4 text-slate-500">Follow friends, build a watchlist together and find a film for everyone.</p><Link className="account-button inline-block" to="/profile">Sign in to connect</Link></section></main>;

  const select = id => setSelected(prev => (prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 3 ? [...prev, id] : prev));
  const invite = `${window.location.origin}/friends/${user.id}`;
  const copyInvite = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'Umbrify', text: 'Follow me on Umbrify and let us find films together.', url: invite });
      else { await navigator.clipboard.writeText(invite); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    } catch { /* the member closed the share sheet */ }
  };
  const go = key => setParams(key === 'activity' ? {} : { tab: key }, { replace: true });

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 pb-24 pt-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">YOUR CIRCLE</p>
          <h1 className="font-display text-3xl sm:text-4xl">Cinema is better together.</h1>
          <p className="mt-2 text-sm text-slate-500">Activity and movie nights are shared between mutual followers who enable sharing in their profile.</p>
        </div>
        {mutual.length > 0 && (
          <ul className="flex -space-x-2" aria-label="Your friends">
            {mutual.slice(0, 8).map(p => <li key={p.id}><Link to={`/friends/${p.id}`} title={p.display_name}><UserAvatar user={p} name={p.display_name} className="friend-avatar ring-2 ring-white dark:ring-slate-900" /></Link></li>)}
            {mutual.length > 8 && <li className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold dark:bg-slate-800">+{mutual.length - 8}</li>}
          </ul>
        )}
      </div>

      <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-700" aria-label="Friends sections">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => go(key)} aria-current={tab === key ? 'page' : undefined}
            className={`-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium ${tab === key ? 'border-indigo-500 text-indigo-700 dark:text-indigo-300' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}>
            <Icon className="h-4 w-4" />{label}
            {key === 'inbox' && data.unseen > 0 && <span className="rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">{data.unseen}</span>}
            {key === 'people' && waiting.length > 0 && <span className="rounded-full bg-indigo-500 px-1.5 text-[10px] font-bold text-white">{waiting.length}</span>}
          </button>
        ))}
      </nav>

      {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}

      {tab === 'activity' && (
        <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
          <ActivityFeed data={data} me={user.id} />
          <aside className="space-y-4">
            {data.unseen > 0 && (
              <button onClick={() => go('inbox')} className="account-panel flex w-full items-center gap-3 text-left ring-2 ring-indigo-300 dark:ring-indigo-700">
                <InboxIcon className="h-5 w-5 text-indigo-500" />
                <span className="text-sm font-medium">{data.unseen === 1 ? 'A friend sent you a film' : `Friends sent you ${data.unseen} films`}</span>
              </button>
            )}
            {waiting.length > 0 && (
              <div className="account-panel space-y-2">
                <p className="text-sm font-semibold">Follow back</p>
                <ul>{waiting.slice(0, 4).map(p => <Person key={p.id} p={p} data={data} busy={busy} onToggle={toggleFollow} />)}</ul>
              </div>
            )}
            <div className="account-panel space-y-2">
              <p className="flex items-center gap-1.5 text-sm font-semibold"><Link2 className="h-4 w-4" /> Invite friends</p>
              <p className="text-xs text-slate-500">Send your link: whoever opens it can follow you, and once you follow each other you can plan movie nights.</p>
              <button className="account-secondary inline-flex w-full items-center justify-center gap-1.5" onClick={copyInvite}><Copy className="h-4 w-4" /> {copied ? 'Link copied' : 'Share your link'}</button>
            </div>
          </aside>
        </div>
      )}

      {tab === 'inbox' && <Inbox people={people} onSeen={() => setData(d => ({ ...d, unseen: 0 }))} />}

      {tab === 'circle' && <TasteCircle circle={circle} watched={watched} followed={followed} onFollow={follow} />}

      {tab === 'together' && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <Link to="/tonight" className="account-panel group space-y-1 text-slate-900 transition hover:ring-2 hover:ring-indigo-300 dark:text-slate-100">
              <p className="eyebrow flex items-center gap-1.5"><Clapperboard className="h-3.5 w-3.5" /> MOVIE NIGHT</p>
              <h2 className="section-title">One film. Everyone happy.</h2>
              <p className="text-sm text-slate-500">Umbrify picks films for the whole group, everyone votes from their own phone, and the draw is fair.</p>
              <span className="text-sm font-medium text-indigo-600 group-hover:underline">Plan a movie night →</span>
            </Link>
            <Link to="/library/journeys" className="account-panel group space-y-1 text-slate-900 transition hover:ring-2 hover:ring-indigo-300 dark:text-slate-100">
              <p className="eyebrow flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" /> CINEMA SEASON</p>
              <h2 className="section-title">One film a week, together.</h2>
              <p className="text-sm text-slate-500">8 to 12 weeks introduced by your critic; each of you writes a note on every week's film.</p>
              <span className="text-sm font-medium text-indigo-600 group-hover:underline">Plan a season →</span>
            </Link>
          </div>

          <section className="account-panel space-y-4">
            <div>
              <h2 className="section-title">Quick picks for a group</h2>
              <p className="text-sm text-slate-500">Choose up to three friends. Picks balance everyone's ratings and exclude films anyone has already watched.</p>
            </div>
            {!mutual.length && <p className="text-sm">Follow each other to plan a movie night.</p>}
            <div className="flex flex-wrap gap-2">
              {mutual.map(p => (
                <button key={p.id} aria-pressed={selected.includes(p.id)} onClick={() => select(p.id)} disabled={!p.share_activity}
                  className={`inline-flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm disabled:opacity-50 ${selected.includes(p.id) ? 'border-indigo-500 bg-indigo-50 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-200' : 'border-slate-200 dark:border-slate-700'}`}>
                  <UserAvatar user={p} name={p.display_name} className="chip-avatar" /><span translate="no">{p.display_name}</span>{!p.share_activity && <span className="text-xs text-slate-500">Activity private</span>}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="account-button" disabled={busy || !selected.length} onClick={() => act(async () => setPicks(await backend('recommend', { members: selected })))}>Find our film</button>
            </div>
            {picks && <div className="space-y-2 border-t border-slate-200 pt-4 dark:border-slate-700"><h3 className="font-semibold">Tonight's shortlist</h3><p className="text-sm text-slate-500">{picks.message}</p><div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">{picks.movies.map(m => <MovieCard key={m.id} movie={m} />)}</div></div>}
            <form className="flex flex-wrap items-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-700" onSubmit={e => {
              e.preventDefault();
              act(async () => {
                await backend('social', { action: 'create-list', title, members: selected });
                setTitle('');
              });
            }}>
              <label className="account-label flex-1">A watchlist for this group<input className="account-input" value={title} onChange={e => setTitle(e.target.value)} maxLength={100} placeholder="Friday night picks" required /></label>
              <button className="account-secondary inline-flex items-center gap-1.5" disabled={busy || !selected.length}><ListPlus className="h-4 w-4" /> Create shared watchlist</button>
            </form>
          </section>

          <section className="space-y-4">
            <h2 className="section-title">Shared watchlists</h2>
            {!data.lists.length && <p className="text-sm text-slate-500">Create your first list with the friends above.</p>}
            {data.lists.map(list => (
              <div key={list.id} className="account-panel space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold" translate="no">{list.title}</h3>
                    <p className="flex items-center gap-1 text-xs text-slate-500">{(list.list_members || []).map(m => people.get(m.user_id)?.display_name || (m.user_id === user.id ? 'You' : null)).filter(Boolean).join(', ')}</p>
                  </div>
                  <button className="account-secondary" disabled={busy} onClick={() => {
                    if (window.confirm(list.owner_id === user.id ? 'Delete this shared list for everyone?' : 'Leave this shared list?')) act(() => backend('social', { action: list.owner_id === user.id ? 'delete-list' : 'leave-list', list_id: list.id }));
                  }}>{list.owner_id === user.id ? 'Delete list' : 'Leave list'}</button>
                </div>
                <label className="account-label">Add from your watchlist<select value="" className="account-input" disabled={busy} onChange={e => {
                  const movie = watchlist.find(m => String(m.id) === e.target.value);
                  if (movie) act(() => backend('social', { action: 'add-movie', list_id: list.id, movie }));
                }}><option value="">Choose a film…</option>{watchlist.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}</select></label>
                {!list.list_movies.length && <p className="text-sm text-slate-500">No films on this watchlist yet.</p>}
                <div className="stagger grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">{list.list_movies.map(r => <div key={r.movie_id}><MovieCard movie={r.movie} /><button className="mt-2 text-xs text-slate-500 underline" disabled={busy} onClick={() => act(() => backend('social', { action: 'remove-movie', list_id: list.id, movie_id: Number(r.movie_id) }))}>Remove from shared list</button></div>)}</div>
              </div>
            ))}
          </section>
        </div>
      )}

      {tab === 'people' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="account-panel space-y-4">
            <h2 className="section-title">Find your people</h2>
            <form className="flex items-end gap-2" onSubmit={e => {
              e.preventDefault();
              act(async () => setResults((await backend(`social?q=${encodeURIComponent(query)}`)).people));
            }}>
              <label className="account-label flex-1">Search by name<input className="account-input" value={query} minLength={2} maxLength={60} required onChange={e => setQuery(e.target.value)} /></label>
              <button disabled={busy} className="account-button inline-flex items-center gap-1.5"><Search className="h-4 w-4" /> Search</button>
            </form>
            <p className="text-xs text-slate-500">Only people who make their profile discoverable appear here.</p>
            {results && !results.length && <p className="text-sm text-slate-500">No people found.</p>}
            {results && <ul>{results.map(p => <Person key={p.id} p={p} data={data} busy={busy} onToggle={toggleFollow} />)}</ul>}
            <div className="space-y-2 border-t border-slate-200 pt-4 dark:border-slate-700">
              <p className="flex items-center gap-1.5 text-sm font-semibold"><Link2 className="h-4 w-4" /> Your invite link</p>
              <div className="flex gap-2"><input readOnly value={invite} className="account-input flex-1 text-xs" aria-label="Your invite link" onFocus={e => e.target.select()} /><button className="account-secondary inline-flex items-center gap-1.5" onClick={copyInvite}><Copy className="h-4 w-4" /> {copied ? 'Copied' : 'Share'}</button></div>
            </div>
          </section>
          <section className="account-panel space-y-2">
            <h2 className="section-title">Following & followers</h2>
            {!data.people.length && <p className="text-sm text-slate-500">Your circle starts with a follow.</p>}
            <ul>{data.people.map(p => <Person key={p.id} p={p} data={data} busy={busy} onToggle={toggleFollow} />)}</ul>
          </section>
        </div>
      )}
    </main>
  );
}
