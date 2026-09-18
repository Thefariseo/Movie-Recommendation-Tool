import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLibrary } from '../contexts/LibraryContext';
import { backend } from '../utils/backend';
export default function AccountPanel() {
  const auth = useAuth();
  const library = useLibrary();
  const [mode, setMode] = useState(new URLSearchParams(location.search).has('recovery') ? 'password' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(new URLSearchParams(location.search).has('auth_error') ? 'Sign-in could not be completed. Please try again.' : '');
  const perform = async action => {
    setBusy(true);
    setMessage('');
    try {
      const result = await action();
      if (result?.url) {
        location.assign(result.url);
        return;
      }
      setMessage(result?.message || 'Saved.');
      await auth.reload();
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  };
  if (auth.loading) return <section className="account-panel" aria-busy="true">Checking your account…</section>;
  return <section className="account-panel space-y-4">
    <div><p className="eyebrow">YOUR CINEMA, EVERYWHERE</p><h2 className="text-xl font-semibold">{auth.user ? 'Your account' : 'Keep your collection with you'}</h2></div>
    {auth.error && <p role="alert">{auth.error} <button className="text-indigo-500 underline" onClick={auth.reload}>Retry</button></p>}
    {!auth.configured ? <p className="text-sm text-slate-500">Accounts are not available yet. You can keep using Umbrify as a guest on this device.</p> : auth.user && mode !== 'password' ? <>
      <p className="text-sm">Signed in as <strong>{auth.user.email}</strong></p>
      <p className="text-sm" role="status">{library.pending ? 'Saving…' : library.error ? library.error : library.ready ? 'Your library is synced across devices.' : 'Loading your library…'}</p>
      {library.error && <button className="account-secondary" onClick={library.refresh}>Retry sync</button>}
      {library.guestCount > 0 && <div className="rounded-xl bg-indigo-50 p-4 text-sm dark:bg-indigo-950"><p>There are {library.guestCount} entries saved on this device. Import them into this account? Existing cloud entries will be kept.</p><button disabled={busy || !!library.pending || !library.ready} className="account-button mt-3" onClick={() => perform(async () => ({
          message: (await library.importGuest()) ? 'Device library imported.' : 'Import did not finish. Your device copy is still safe.'
        }))}>Import device library</button></div>}
      <div className="flex flex-wrap gap-3"><button className="account-secondary" onClick={() => setMode('password')}>Change password</button><button disabled={busy || !!library.pending} className="account-secondary" onClick={() => perform(auth.signOut)}>Sign out</button></div>
    </> : <>
      <div className="flex gap-4 text-sm">{!auth.user && ['login', 'signup', 'recover'].map(m => <button key={m} className={mode === m ? 'font-semibold text-indigo-500' : 'text-slate-500'} onClick={() => {
          setMode(m);
          setMessage('');
        }}>{m === 'login' ? 'Sign in' : m === 'signup' ? 'Create account' : 'Forgot password?'}</button>)}</div>
      <form className="space-y-3" onSubmit={e => {
        e.preventDefault();
        perform(() => backend(`auth?action=${mode}`, {
          email,
          password,
          display_name: name
        }));
      }}>
        {mode === 'signup' && <label className="account-label">Name<input className="account-input" value={name} onChange={e => setName(e.target.value)} maxLength={60} autoComplete="nickname" required /></label>}
        {mode !== 'password' && <label className="account-label">Email<input className="account-input" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required /></label>}
        {mode !== 'recover' && <label className="account-label">Password<input className="account-input" type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={8} maxLength={128} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required /></label>}
        <button className="account-button" disabled={busy}>{busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : mode === 'recover' ? 'Send reset link' : mode === 'password' ? 'Save new password' : 'Sign in'}</button>
        {auth.user && <button className="account-secondary ml-2" type="button" onClick={() => setMode('login')}>Back to account</button>}
      </form>
      {auth.google && !auth.user && <button className="account-secondary w-full" disabled={busy} onClick={() => perform(() => backend('auth?action=google', {}))}>Continue with Google</button>}
    </>}
    {message && <p className="text-sm" role="status">{message}</p>}
  </section>;
}
