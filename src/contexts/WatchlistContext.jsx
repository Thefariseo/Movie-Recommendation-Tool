import React, { createContext } from 'react';
import { useLibrary } from './LibraryContext';
import { flyToLibrary } from '../utils/flight';
export const WatchlistContext = createContext(null);
export function WatchlistProvider({
  children
}) {
  const {
    watchlist,
    run
  } = useLibrary();
  return <WatchlistContext.Provider value={{
    watchlist,
    isInWatchlist: id => watchlist.some(m => m.id === id),
    // A film saved flies to the Library as it is saved.
    addToWatchlist: m => {
      if (!watchlist.some(x => Number(x.id) === Number(m?.id))) flyToLibrary(m);
      return run('watchlist', 'add', m);
    },
    removeFromWatchlist: id => run('watchlist', 'remove', id),
    clearWatchlist: () => run('watchlist', 'clear')
  }}>{children}</WatchlistContext.Provider>;
}
