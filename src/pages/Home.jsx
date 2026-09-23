import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, MessageCircle, Bookmark, Star } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import useWatched from "@/hooks/useWatched";
import useWatchlist from "@/hooks/useWatchlist";
import CommunityPicks from "../components/CommunityPicks";
import ForYouSection from "../components/ForYouSection";
import RecommendationList from "../components/RecommendationList";
export default function Home() {
  const { user } = useAuth(),
    { watched } = useWatched(),
    { watchlist } = useWatchlist();
  const [params] = useSearchParams();
  const view = params.get("view") === "browse" ? "browse" : "foryou";
  const hasTaste = watched.length > 0 || watchlist.length > 0;
  return (
    <main className="discover-page">
      <div className="discovery-heading">
        <div className="page-heading">
          <p className="eyebrow">A GOOD FILM STARTS HERE</p>
          <h1>What will you watch tonight?</h1>
          <p>Find your next favourite, then make it a movie night.</p>
        </div>
        <Link to="/chat" className="choose-link">
          <MessageCircle size={18} aria-hidden="true" />
          <span>Help me choose</span>
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
      <nav className="section-navigation" aria-label="Discovery sections">
        <Link
          to="/?view=foryou"
          aria-current={view === "foryou" ? "page" : undefined}
          className={view === "foryou" ? "section-selected" : ""}
        >
          For you
        </Link>
        <Link
          to="/?view=browse"
          aria-current={view === "browse" ? "page" : undefined}
          className={view === "browse" ? "section-selected" : ""}
        >
          Browse films
        </Link>
      </nav>
      {view === "browse" ? (
        <div className="space-y-10 pt-7">
          <RecommendationList title="Trending this week" type="trending" />
          <RecommendationList title="Highly rated" type="top_rated" />
          <RecommendationList title="Coming soon" type="upcoming" />
        </div>
      ) : (
        <div className="space-y-8 pt-7">
          {user ? (
            <>
              <CommunityPicks />
              {hasTaste && (
                <details className="discovery-details">
                  <summary>
                    Fine-tune by mood, decade or filmmaker
                    <span>More ways to explore your taste</span>
                  </summary>
                  <div className="pt-6">
                    <ForYouSection />
                  </div>
                </details>
              )}
            </>
          ) : hasTaste ? (
            <ForYouSection />
          ) : (
            <section className="welcome-panel">
              <div>
                <span className="welcome-icon">
                  <Star size={22} aria-hidden="true" />
                </span>
                <h2>
                  A little about your taste.
                  <br />A better next watch.
                </h2>
                <p>
                  Search a film you love and give it a rating. Your
                  recommendations grow with every film you log.
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    className="account-button"
                    onClick={() =>
                      document
                        .querySelector('[aria-label="Search all films"]')
                        ?.focus()
                    }
                  >
                    Find a film to rate
                    <ArrowRight size={16} aria-hidden="true" />
                  </button>
                  <Link
                    className="account-secondary"
                    to="/library/watched?import=1"
                  >
                    Import Letterboxd
                  </Link>
                </div>
              </div>
              <div className="welcome-note">
                <Bookmark size={24} aria-hidden="true" />
                <h3>Found something for later?</h3>
                <p>
                  Save it to your watchlist. Everything you save or rate lives
                  in your Library.
                </p>
                <Link to="/library/watchlist">
                  Open your library <ArrowRight size={15} aria-hidden="true" />
                </Link>
              </div>
            </section>
          )}
          {!hasTaste && (
            <RecommendationList
              title="Start with something popular"
              type="trending"
            />
          )}
          <Link to="/?view=browse" className="browse-more">
            Explore trending, highly rated and upcoming films
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>
      )}
    </main>
  );
}
