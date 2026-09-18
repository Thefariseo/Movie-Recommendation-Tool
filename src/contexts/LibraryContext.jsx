import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { backend } from '../utils/backend';
import { importChanges, mergeRows, normalizeMovie, rowToMovie } from '../../shared/library';
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
  const refresh = useCallback(async () => {
    if (!user) {
      setReady(!authLoading);
      return;
    }
    try {
      const result = await backend('library');
      if (alive.current) {
        accept(result.rows);
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
      return true;
    } catch (e) {
      setError(e.message);
      addToast(e.message, 'error');
      return false;
    } finally {
      if (alive.current) setPending(n => n - 1);
    }
  };
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
