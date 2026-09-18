import React, { createContext } from 'react';
import { useLibrary } from './LibraryContext';
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
    addToWatchlist: m => run('watchlist', 'add', m),
    removeFromWatchlist: id => run('watchlist', 'remove', id),
    clearWatchlist: () => run('watchlist', 'clear')
  }}>{children}</WatchlistContext.Provider>;
}
