import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLibrary } from '../contexts/LibraryContext';
import { backend } from '../utils/backend';
import { letterboxdCSV } from '../../shared/export';
export default function IntegrationsPanel() {
  const {
    user
  } = useAuth();
  const {
    watched,
    watchlist,
    refresh
  } = useLibrary();
  const [trakt, setTrakt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(new URLSearchParams(location.search).get('trakt') === 'connected' ? 'Trakt connected.' : new URLSearchParams(location.search).has('trakt') ? 'Trakt could not connect. Please try again.' : '');
  useEffect(() => {
    if (user) backend('trakt').then(setTrakt).catch(e => setMessage(e.message));
  }, [user?.id]);
  const act = async action => {
    setBusy(true);
    setMessage('');
    try {
      const result = await backend(`trakt?action=${action}`, {
        confirm: action === 'export'
      });
      if (result.url) {
        location.assign(result.url);
        return;
      }
      setMessage(result.message);
      setTrakt(await backend('trakt'));
      await refresh();
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  };
  const download = (movies, name) => {
    const url = URL.createObjectURL(new Blob([letterboxdCSV(movies)], {
      type: 'text/csv;charset=utf-8'
    }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="account-panel space-y-5"><div><p className="eyebrow">YOUR FILMS, CONNECTED</p><h2 className="text-xl font-semibold">Connected services</h2></div>
    <div className="space-y-3"><h3 className="font-semibold">Trakt</h3><p className="text-sm text-slate-500">Import watched films, ratings and your watchlist. Export adds watchlist entries and updates ratings; it never removes anything on Trakt.</p>
      {!user ? <Link to="/profile" className="text-sm text-indigo-500">Sign in to connect Trakt</Link> : trakt?.enabled ? <div className="flex flex-wrap gap-2">{!trakt.connected ? <button className="account-button" disabled={busy} onClick={() => act('connect')}>Connect Trakt</button> : <><button className="account-button" disabled={busy} onClick={() => act('import')}>Import from Trakt</button><button className="account-secondary" disabled={busy} onClick={() => {
            if (window.confirm('Send your Umbrify ratings and watchlist to Trakt? Matching Trakt ratings will be updated.')) act('export');
          }}>Export to Trakt</button><button className="account-secondary" disabled={busy} onClick={() => act('disconnect')}>Disconnect</button></>}</div> : <p className="text-sm text-slate-500">Trakt connection is not available yet.</p>}
    </div><div className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-700"><h3 className="font-semibold">Letterboxd</h3><p className="text-sm text-slate-500">Import your Letterboxd export from the Watched page, or download files to import on Letterboxd. Automatic account sync is not available.</p><div className="flex flex-wrap gap-2"><Link className="account-secondary" to="/watched">Import from Letterboxd</Link><button className="account-secondary" onClick={() => download(watched, 'umbrify-watched-letterboxd.csv')}>Export watched & ratings</button><button className="account-secondary" onClick={() => download(watchlist, 'umbrify-watchlist-letterboxd.csv')}>Export watchlist</button></div><a className="text-xs text-indigo-500 underline" href="https://letterboxd.com/import/" target="_blank" rel="noreferrer">Open Letterboxd's import page</a></div>
    {busy && <p role="status">Syncing… Keep this page open.</p>}{message && <p role="status" className="text-sm">{message}</p>}
  </section>;
}
