import React from "react";
import { Link } from "react-router-dom";
import { Bookmark, ArrowRight } from "lucide-react";
import Watchlist from "../components/Watchlist";
import useWatchlist from "../hooks/useWatchlist";
export default function WatchlistPage() {
  const { watchlist } = useWatchlist();
  return (
    <main className="library-content">
      <div className="collection-heading">
        <div>
          <h2>Saved for later</h2>
          <p>Your next movie night starts here.</p>
        </div>
        <Link to="/?view=browse" className="account-secondary">
          Find films <ArrowRight size={16} />
        </Link>
      </div>
      {watchlist.length ? (
        <Watchlist />
      ) : (
        <div className="collection-empty">
          <Bookmark size={32} aria-hidden="true" />
          <h3>Your next watch belongs here</h3>
          <p>
            Tap the + on any film to save it. You can come back to it whenever
            you’re ready.
          </p>
          <Link to="/?view=browse" className="account-button">
            Browse films
          </Link>
        </div>
      )}
    </main>
  );
}
