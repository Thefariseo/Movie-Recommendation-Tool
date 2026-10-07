import React, { Suspense, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, MessageCircle, Bookmark, Star } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import useWatched from "@/hooks/useWatched";
import useWatchlist from "@/hooks/useWatchlist";
import CommunityPicks from "../components/CommunityPicks";
import { lazyPage } from "../utils/lazyPage";
import { PicksSkeleton } from "../components/PicksShowcase";
import RecommendationList from "../components/RecommendationList";
import { useSignals } from "../utils/signals";
import { onboardingSkipped } from "../utils/onboarding";
import { hasSeeds } from "../../shared/onboarding.js";
import useAmbientGlow from "../hooks/useAmbientGlow";
// Guests' picks are computed in the browser; members' come from the server,
// so the in-browser recommender is only downloaded when a guest needs it.
const ForYouSection = lazyPage(() => import("../components/ForYouSection"));
const TasteOnboarding = lazyPage(() => import("../components/TasteOnboarding"));
const CinemaSection = lazyPage(() => import("../components/CinemaSection"));

export default function Home() {
  const { user } = useAuth(),
    { watched } = useWatched(),
    { watchlist } = useWatchlist();
  const [params] = useSearchParams();
  const view = ["browse", "cinema"].includes(params.get("view")) ? params.get("view") : "foryou";
  const seeded = hasSeeds(useSignals(user?.id));
  const [skipped, setSkipped] = useState(onboardingSkipped);
  // Kept on screen once done, to show the choices the new picks follow.
  const [finished, setFinished] = useState(false);
  // A newcomer with nothing rated first makes a few quick choices.
  const onboarding = finished || (!watched.some((m) => Number(m.rated) > 0) && !seeded && !skipped);
  const hasTaste = watched.length > 0 || watchlist.length > 0 || seeded;
  // The page glows in the colours of the film in the middle of the screen.
  useAmbientGlow();
  return (
    <main className="discover-page">
      <div className="discovery-heading">
        <div className="page-heading">
          <p className="eyebrow">A GOOD FILM STARTS HERE</p>
          <h1>What will you watch tonight?</h1>
          <p>Find your next favourite, then make it a movie night.</p>
        </div>
        <Link to="/critic" className="choose-link">
          <MessageCircle size={18} aria-hidden="true" />
          <span>Help me choose</span>
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
      <nav className="section-navigation" aria-label="Discovery sections">
        <Link
          to="/?view=foryou"
          data-vt
          aria-current={view === "foryou" ? "page" : undefined}
          className={view === "foryou" ? "section-selected" : ""}
        >
          For you
        </Link>
        <Link
          to="/?view=cinema"
          data-vt
          aria-current={view === "cinema" ? "page" : undefined}
          className={view === "cinema" ? "section-selected" : ""}
        >
          In cinemas
        </Link>
        <Link
          to="/?view=browse"
          data-vt
          aria-current={view === "browse" ? "page" : undefined}
          className={view === "browse" ? "section-selected" : ""}
        >
          Browse films
        </Link>
      </nav>
      {view === "cinema" ? (
        <div className="pt-7">
          <Suspense fallback={<PicksSkeleton />}>
            <CinemaSection />
          </Suspense>
        </div>
      ) : view === "browse" ? (
        <div className="space-y-10 pt-7">
          <RecommendationList title="Trending this week" type="trending" />
          <RecommendationList title="Highly rated" type="top_rated" />
          <RecommendationList title="Coming soon" type="upcoming" />
        </div>
      ) : (
        <div className="space-y-8 pt-7">
          {onboarding && (
            <Suspense fallback={<PicksSkeleton />}>
              <TasteOnboarding onSkip={() => setSkipped(true)} onDone={() => setFinished(true)} />
            </Suspense>
          )}
          {user ? (
            <CommunityPicks />
          ) : hasTaste ? (
            <Suspense fallback={<PicksSkeleton />}>
              <ForYouSection />
            </Suspense>
          ) : onboarding ? null : (
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
        </div>
      )}
    </main>
  );
}
