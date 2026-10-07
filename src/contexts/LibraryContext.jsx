import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { backend } from '../utils/backend';
import { importChanges, mergeRows, normalizeMovie, rowToMovie } from '../../shared/library';
import { hasGuestSignals, importGuestSignals } from '../utils/signals';
const LibraryContext = createContext(null);
export const useLibrary = () => useContext(LibraryContext);
function guestRead(kind) {
  try {
    const x = JSON.parse(localStorage.getItem(kind) || '[]');
    return Array.isArray(x) ? x : [];
  } catch {
    return [];
  }
}
export function LibraryProvider({
  children
}) {
  const {
    user,
    loading: authLoading
  } = useAuth();
  const {
    addToast
  } = useToast();
  const [rows, setRows] = useState([]);
  const ref = useRef(rows);
  const [guest, setGuest] = useState(() => ({
    watched: guestRead('watched'),
    watchlist: guestRead('watchlist')
  }));
  const guestRef = useRef(guest);
  const [ready, setReady] = useState(!user && !authLoading);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState(null);
  const queue = useRef(Promise.resolve());
  const alive = useRef(true);
  const accept = useCallback(incoming => {
    ref.current = mergeRows(ref.current, incoming);
    setRows(ref.current);
  }, []);
  // Polls ask only for rows changed since the newest one seen, with a few
  // minutes of overlap for writes still committing (versions make repeats
  // harmless); a full read now and then is the safety net.
  const cursor = useRef({
    user: null,
    since: null,
    full: 0
  });
  const refresh = useCallback(async () => {
    if (!user) {
      setReady(!authLoading);
      return;
    }
    if (cursor.current.user !== user.id) cursor.current = {
      user: user.id,
      since: null,
      full: 0
    };
    const c = cursor.current;
    if (c.since && typeof document !== 'undefined' && document.hidden) return;
    const full = !c.since || Date.now() - c.full > 30 * 60 * 1000;
    try {
      const result = await backend(full ? 'library' : `library?since=${encodeURIComponent(c.since)}`, undefined, {
        account: user.id
      });
      if (alive.current && cursor.current === c) {
        accept(result.rows);
        const newest = result.rows.reduce((m, r) => Math.max(m, Date.parse(r.updated_at) || 0), Date.parse(c.since) || 0);
        if (newest) c.since = new Date(newest).toISOString();
        if (full) c.full = Date.now();
        setReady(true);
        setError(null);
      }
    } catch (e) {
      if (alive.current) setError(e.message);
    }
  }, [user?.id, authLoading, accept]);
  useEffect(() => {
    alive.current = true;
    refresh();
    const timer = user ? setInterval(refresh, 30000) : null;
    window.addEventListener('focus', refresh);
    const onStorage = () => {
      if (!user) {
        const next = {
          watched: guestRead('watched'),
          watchlist: guestRead('watchlist')
        };
        guestRef.current = next;
        setGuest(next);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => {
      alive.current = false;
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('storage', onStorage);
    };
  }, [refresh, user?.id]);
  // A linked Letterboxd diary is read on a visit, at most every few hours (the
  // server keeps the same pace), once the page has settled.
  useEffect(() => {
    if (!user) return undefined;
    const key = `umbrify_letterboxd_check:${user.id}`;
    let last = 0;
    try {
      last = Number(localStorage.getItem(key)) || 0;
    } catch {/* private mode: the server's own pace still applies */}
    if (Date.now() - last < 3 * 3600 * 1000) return undefined;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(key, String(Date.now()));
      } catch {/* see above */}
      backend('library?action=letterboxd-sync', {}, {
        account: user.id
      }).then(r => {
        if (!r.added && !r.rated) return;
        refresh();
        addToast(r.added ? `${r.added} new films from your Letterboxd diary` : `${r.rated} ratings updated from Letterboxd`, 'success');
      }).catch(() => {});
    }, 4000);
    return () => clearTimeout(timer);
  }, [refresh, user?.id, addToast]);
  const run = useCallback((kind, operation, values) => {
    setPending(n => n + 1);
    const task = queue.current.then(async () => {
      if (!alive.current) return false;
      if (!ready) throw new Error('Wait for your library to load before making changes.');
      if (!user) {
        let next = [...guestRef.current[kind]];
        if (operation === 'add') {
          const m = values;
          if (!next.some(x => x.id === m.id)) next.push({
            ...normalizeMovie(m),
            ...(kind === 'watched' ? {
              rated: m.rated
            } : {})
          });
        }
        if (operation === 'remove') next = next.filter(m => m.id !== values);
        if (operation === 'clear') next = [];
        if (operation === 'rate') next = next.map(m => m.id === values.id ? {
          ...m,
          rated: values.rating
        } : m);
        if (operation === 'import') {
          const ids = new Set(next.map(m => m.id));
          for (const m of values) if (!ids.has(m.id)) {
            next.push({
              ...normalizeMovie(m),
              rated: m.rated
            });
            ids.add(m.id);
          }
        }
        localStorage.setItem(kind, JSON.stringify(next));
        guestRef.current = {
          ...guestRef.current,
          [kind]: next
        };
        setGuest(guestRef.current);
        return true;
      }
      if (!navigator.onLine) throw new Error('You are offline. Reconnect to save changes to your account.');
      const existing = ref.current.filter(r => r.kind === kind);
      const byId = new Map(existing.map(r => [Number(r.movie_id), r]));
      const change = (id, op, movie, rating) => ({
        kind,
        movie_id: Number(id),
        op,
        version: byId.get(Number(id))?.version || 0,
        ...(movie ? {
          movie: normalizeMovie(movie)
        } : {}),
        rating: rating || null
      });
      let changes = [];
      if (operation === 'add' && (!byId.has(values.id) || byId.get(values.id).deleted)) changes = [change(values.id, 'put', values, values.rated)];
      if (operation === 'remove') changes = [change(values, 'remove')];
      if (operation === 'clear') changes = existing.filter(r => !r.deleted).map(r => change(r.movie_id, 'remove'));
      if (operation === 'rate') changes = [change(values.id, 'rate', null, values.rating)];
      if (operation === 'import') changes = values.map(m => change(m.id, 'put', m, m.rated));
      for (let start = 0; start < changes.length; start += 500) {
        const result = await backend('library', {
          changes: changes.slice(start, start + 500),
          importing: operation === 'import'
        }, {
          account: user.id
        });
        if (!alive.current) return false;
        accept(result.rows);
      }
      setError(null);
      return true;
    }).catch(async e => {
      if (alive.current) {
        setError(e.message);
        addToast(e.message, 'error');
        if (e.status === 409) await refresh();
      }
      return false;
    }).finally(() => {
      if (alive.current) setPending(n => Math.max(0, n - 1));
    });
    queue.current = task;
    return task;
  }, [ready, user?.id, accept, refresh, addToast]);
  const importGuest = async () => {
    const changes = importChanges(guestRead('watched'), guestRead('watchlist'));
    if (!user || !ready || pending) return false;
    setPending(n => n + 1);
    try {
      for (let i = 0; i < changes.length; i += 500) {
        const result = await backend('library', {
          changes: changes.slice(i, i + 500),
          importing: true
        }, {
          account: user.id
        });
        if (!alive.current) return false;
        accept(result.rows);
      }
      // Only remove the guest copy after every batch has succeeded.
      localStorage.removeItem('watched');
      localStorage.removeItem('watchlist');
      setGuest({
        watched: [],
        watchlist: []
      });
      // The first-visit choices and dismissed films come along too.
      return await importGuestSignals();
    } catch (e) {
      setError(e.message);
      addToast(e.message, 'error');
      return false;
    } finally {
      if (alive.current) setPending(n => n - 1);
    }
  };
  // A guest who creates an account keeps what they did on this device: into
  // an account with nothing in it yet, it moves on its own. An account that
  // already has films is asked first (src/components/AccountPanel.jsx), since
  // the device may be shared.
  const moved = useRef(false);
  useEffect(() => {
    if (!user || !ready || pending || moved.current) return;
    moved.current = true;
    const onDevice = guestRead('watched').length + guestRead('watchlist').length;
    if (rows.length || (!onDevice && !hasGuestSignals())) return;
    importGuest().then(ok => {
      if (ok && onDevice) addToast('What you rated and saved on this device is now in your account.');
    });
  }, [user?.id, ready, pending]); // eslint-disable-line react-hooks/exhaustive-deps
  const active = useMemo(() => rows.filter(r => !r.deleted), [rows]);
  const watched = useMemo(() => user ? active.filter(r => r.kind === 'watched').map(rowToMovie) : guest.watched, [active, user?.id, guest.watched]);
  const watchlist = useMemo(() => user ? active.filter(r => r.kind === 'watchlist').map(rowToMovie) : guest.watchlist, [active, user?.id, guest.watchlist]);
  return <LibraryContext.Provider value={{
    watched,
    watchlist,
    ready,
    pending,
    error,
    refresh,
    run,
    importGuest,
    guestCount: guestRead('watched').length + guestRead('watchlist').length
  }}>{children}</LibraryContext.Provider>;
}
