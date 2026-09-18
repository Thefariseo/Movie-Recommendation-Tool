import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLibrary } from '../contexts/LibraryContext';
import { backend } from '../utils/backend';
import AccountPanel from '../components/AccountPanel';
import IntegrationsPanel from '../components/IntegrationsPanel';
const countries = {
  IT: 'Italy',
  US: 'United States',
  GB: 'United Kingdom',
  FR: 'France',
  DE: 'Germany',
  ES: 'Spain',
  PT: 'Portugal',
  CH: 'Switzerland',
  AT: 'Austria',
  NL: 'Netherlands',
  BE: 'Belgium',
  SE: 'Sweden',
  DK: 'Denmark',
  NO: 'Norway',
  FI: 'Finland',
  PL: 'Poland',
  GR: 'Greece',
  IE: 'Ireland',
  CA: 'Canada',
  AU: 'Australia',
  NZ: 'New Zealand',
  BR: 'Brazil',
  MX: 'Mexico',
  AR: 'Argentina',
  JP: 'Japan',
  KR: 'South Korea',
  IN: 'India'
};
export default function Profile() {
  const auth = useAuth();
  const library = useLibrary();
  const [profile, setProfile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    setProfile(auth.profile ? {
      display_name: auth.profile.display_name,
      country: auth.profile.country,
      discoverable: auth.profile.discoverable,
      share_activity: auth.profile.share_activity,
      collaborative: auth.profile.collaborative
    } : null);
  }, [auth.profile]);
  const update = (field, value) => setProfile(p => ({
    ...p,
    [field]: value
  }));
  const save = async e => {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      await backend('social', {
        action: 'profile',
        profile
      });
      await auth.reload();
      setMessage('Profile saved.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };
  return <main className="mx-auto max-w-5xl space-y-6 px-4 pb-24 pt-6"><div><p className="eyebrow">A PLACE FOR YOUR TASTE</p><h1 className="text-3xl font-semibold">Your profile</h1></div><div className="grid items-start gap-6 lg:grid-cols-2"><div className="space-y-6"><AccountPanel />
    {profile && <form className="account-panel space-y-4" onSubmit={save}><h2 className="text-xl font-semibold">Profile & sharing</h2><label className="account-label">Display name<input className="account-input" value={profile.display_name} onChange={e => update('display_name', e.target.value)} maxLength={60} required /></label><label className="account-label">Where you watch<select className="account-input" value={profile.country} onChange={e => update('country', e.target.value)}>{!countries[profile.country] && <option value={profile.country}>{profile.country}</option>}{Object.entries(countries).map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label><p className="text-xs text-slate-500">Streaming availability follows this country on every device. Data from JustWatch via TMDB.</p>
      {[['discoverable', 'Let people find my profile', 'Your display name appears in account searches.'], ['share_activity', 'Share my library with mutual followers', 'Friends who follow you back can view your films, ratings and watchlist, and include you in movie nights.'], ['collaborative', 'Help train community recommendations', 'Use my ratings for collaborative recommendations and model training. Turning this off invalidates the trained model that used them.']].map(([key, label, description]) => <label key={key} className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700"><input className="mt-1" type="checkbox" checked={profile[key]} onChange={e => update(key, e.target.checked)} /><span><span className="block text-sm font-semibold">{label}</span><span className="mt-1 block text-xs leading-relaxed text-slate-500">{description}</span></span></label>)}
      <button className="account-button" disabled={busy}>Save profile</button>{message && <p role="status" className="text-sm">{message}</p>}
    </form>}</div><div className="space-y-6"><section className="account-panel space-y-4"><h2 className="text-xl font-semibold">Your collection</h2><div className="grid grid-cols-3 gap-3">{[['Watched', library.watched.length], ['Watchlist', library.watchlist.length], ['Rated', library.watched.filter(m => m.rated).length]].map(([label, count]) => <div key={label} className="rounded-xl bg-slate-50 p-3 text-center dark:bg-slate-800"><p className="text-2xl font-semibold">{count}</p><p className="text-xs text-slate-500">{label}</p></div>)}</div><Link to="/stats" className="text-sm text-indigo-500">View detailed statistics →</Link></section><IntegrationsPanel /><section className="account-panel space-y-3"><h2 className="font-semibold">Manage your library</h2><p className="text-sm text-slate-500">{auth.user ? 'Clearing a list removes it from your account on every device.' : 'Guest changes are saved only on this device.'}</p><div className="flex flex-wrap gap-3">{['watchlist', 'watched'].map(kind => <button key={kind} disabled={!library.ready || !!library.pending} className="account-secondary text-red-500" onClick={() => {
              if (window.confirm(`Clear your entire ${kind} list${auth.user ? ' on every device' : ''}?`)) library.run(kind, 'clear');
            }}>Clear {kind}</button>)}</div></section></div></div></main>;
}
