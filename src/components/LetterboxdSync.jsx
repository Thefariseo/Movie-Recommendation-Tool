import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useLibrary } from "../contexts/LibraryContext";
import { backend } from "../utils/backend";
import { ago } from "./NotificationBell";

const outcome = (r) => r.busy
  ? "A sync is already running. Try again in a minute."
  : r.added || r.rated
    ? `Synced: ${r.added} films added, ${r.rated} ratings updated.`
    : "Up to date with your Letterboxd diary.";

/**
 * Links a Letterboxd username so new diary entries (films and ratings) arrive
 * by themselves: on a visit every few hours, every night, or with "Sync now".
 */
export default function LetterboxdSync() {
  const { user } = useAuth();
  const { refresh } = useLibrary();
  const [state, setState] = useState(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!user) return;
    backend("library?action=letterboxd").then(setState).catch(() => setState({ linked: false }));
  }, [user?.id]);

  const run = async (action, data) => {
    setBusy(true);
    setMessage("");
    try {
      const result = await backend(`library?action=${action}`, data);
      setState(result);
      if (result.linked) setMessage(outcome(result));
      if (result.added || result.rated) await refresh();
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!user) return <p className="text-sm text-slate-500"><Link to="/profile" className="text-indigo-500">Sign in</Link> to keep your films in sync with Letterboxd.</p>;
  if (!state) return null;
  return (
    <div className="space-y-2">
      {state.linked ? (
        <>
          <p className="text-sm">
            Synced with <a className="font-medium text-indigo-500" href={`https://letterboxd.com/${state.username}/`} target="_blank" rel="noreferrer" translate="no">@{state.username}</a>
            {state.synced_at && <span className="text-slate-500"> · <span>{`last sync ${ago(state.synced_at)}`}</span></span>}
          </p>
          <p className="text-xs text-slate-500">New diary entries and ratings arrive by themselves, every few hours and every night. Nothing is ever removed.</p>
          {state.error && !message && <p role="status" className="text-sm text-amber-600">{state.error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="account-button" disabled={busy} onClick={() => run("letterboxd-sync", { force: true })}>
              <RefreshCw size={16} aria-hidden="true" className={busy ? "animate-spin" : ""} /> Sync now
            </button>
            <button type="button" className="account-secondary" disabled={busy} onClick={() => run("letterboxd", { username: "" })}>Stop syncing</button>
          </div>
        </>
      ) : (
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) run("letterboxd", { username: name.trim() }); }}>
          <p className="text-sm text-slate-500">Keep your films in sync: add your username and every film you log on Letterboxd, with its rating, arrives here by itself.</p>
          <div className="flex flex-wrap gap-2">
            <label className="flex min-w-[200px] flex-1 items-center rounded-lg border border-slate-200 bg-white pl-3 text-sm dark:border-slate-700 dark:bg-slate-800">
              <span className="text-slate-400" aria-hidden="true">letterboxd.com/</span>
              <input className="w-full bg-transparent py-2 pr-3 outline-none" value={name} onChange={(e) => setName(e.target.value)} placeholder="username" aria-label="Letterboxd username" autoComplete="off" autoCapitalize="none" spellCheck="false" />
            </label>
            <button type="submit" className="account-button" disabled={busy || !name.trim()}>{busy ? "Connecting…" : "Connect"}</button>
          </div>
        </form>
      )}
      {busy && <p role="status" className="text-xs text-slate-500">Reading your Letterboxd diary…</p>}
      {message && <p role="status" className="text-sm">{message}</p>}
    </div>
  );
}
