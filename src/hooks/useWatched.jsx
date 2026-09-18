import React, { createContext, useContext } from 'react';
import { useLibrary } from '../contexts/LibraryContext';
export const WatchedContext = createContext(null);
export function WatchedProvider({
  children
}) {
  const {
    watched,
    run
  } = useLibrary();
  return <WatchedContext.Provider value={{
    watched,
    isWatched: id => watched.some(m => m.id === id),
    addWatched: m => run('watched', 'add', m),
    removeWatched: id => run('watched', 'remove', id),
    clearWatched: () => run('watched', 'clear'),
    bulkAdd: movies => run('watched', 'import', movies),
    updateRating: (id, rating) => run('watched', 'rate', {
      id,
      rating
    })
  }}>{children}</WatchedContext.Provider>;
}
export default function useWatched() {
  const value = useContext(WatchedContext);
  if (!value) throw new Error('WatchedProvider required');
  return value;
}
