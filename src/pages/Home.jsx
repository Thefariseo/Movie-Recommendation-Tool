// =====================================================
// Home – discovery-first landing page
// • Watched history → ForYouSection hero + carousels
// • No history      → Immersive cinematic onboarding
// =====================================================
import React from "react";
import { Link } from "react-router-dom";
import { Film, BookmarkPlus, Sparkles, TrendingUp, Clapperboard } from "lucide-react";
import SearchBar from "../components/SearchBar";
import RecommendationList from "../components/RecommendationList";
import ForYouSection from "../components/ForYouSection";
import useWatched from "@/hooks/useWatched";

/* Carousels use typed identifiers — RecommendationList maps them to api.js helpers */
const categories = [
  { title: "Trending This Week", type: "trending"  },
  { title: "Top Rated",          type: "top_rated" },
  { title: "Coming Soon",        type: "upcoming"  },
];

/* ---- Film-grain overlay (pure SVG) ---- */
function GrainOverlay({ opacity = "0.05" }) {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={{ opacity }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <filter id="grain-home">
        <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#grain-home)" />
    </svg>
  );
}

/* ---- Single "how it works" step ---- */
function Step({ icon: Icon, title, desc }) {
  return (
    <div className="flex items-start gap-3.5">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10">
        <Icon className="h-3.5 w-3.5 text-indigo-300" />
      </div>
      <div>
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{desc}</p>
      </div>
    </div>
  );
}

/* ---- Immersive dark cinematic hero shown when user has no watch history ---- */
function OnboardingBanner() {
  return (
    <section className="relative overflow-hidden rounded-2xl bg-slate-950 shadow-2xl">
      <GrainOverlay opacity="0.06" />

      {/* Subtle radial accent gradients */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 90% 70% at 5% 50%, rgba(99,102,241,0.15) 0%, transparent 60%)," +
            "radial-gradient(ellipse 65% 65% at 95% 40%, rgba(139,92,246,0.08) 0%, transparent 55%)",
        }}
      />

      <div className="relative z-10 grid grid-cols-1 gap-8 px-7 py-10 sm:px-10 sm:py-14 md:grid-cols-2 md:gap-16">

        {/* ── Left: headline + CTA ── */}
        <div className="flex flex-col justify-center">
          <span className="mb-4 inline-flex w-fit items-center gap-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-[10px] font-medium uppercase tracking-widest text-indigo-300">
            <Sparkles className="h-2.5 w-2.5" />
            Personalised discovery
          </span>

          <h1 className="text-3xl font-bold leading-tight text-white sm:text-4xl">
            Your personal{" "}
            <em className="font-light not-italic text-indigo-300">cinema companion.</em>
          </h1>

          <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-400">
            Rate the films you&apos;ve seen — Umbrify maps your taste in directors,
            genres and decades to surface picks that feel chosen just for you.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/watched"
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition-all hover:bg-indigo-500 active:scale-95"
            >
              <BookmarkPlus className="h-4 w-4" />
              Start rating films
            </Link>
            <Link
              to="/watched"
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-slate-200 backdrop-blur-sm transition-colors hover:bg-white/10"
            >
              <Film className="h-4 w-4 opacity-60" />
              Import from Letterboxd
            </Link>
          </div>
        </div>

        {/* ── Right: how it works ── */}
        <div className="flex flex-col justify-center gap-5 border-t border-white/5 pt-6 md:border-l md:border-t-0 md:pl-10 md:pt-0">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600">
            How it works
          </p>
          <Step
            icon={Film}
            title="Log what you've watched"
            desc="Add films manually or import your entire Letterboxd history in seconds."
          />
          <Step
            icon={Clapperboard}
            title="Rate each film honestly"
            desc="Half-star precision. Your ratings calibrate the recommendation engine."
          />
          <Step
            icon={TrendingUp}
            title="Get picks made for you"
            desc="Personalised suggestions tuned to your directors, genres, and eras — updating with every rating."
          />
        </div>
      </div>
    </section>
  );
}

/* ================================================================ */
export default function Home() {
  const { watched } = useWatched();
  const hasHistory  = watched.length > 0;

  return (
    <main className="space-y-8 pb-20 pt-4 lg:pt-6">
      {/* Search bar */}
      <div className="mx-auto max-w-xl px-4">
        <SearchBar />
      </div>

      {/* Primary discovery section */}
      <div className="px-4 md:px-6 lg:px-10">
        {hasHistory ? <ForYouSection /> : <OnboardingBanner />}
      </div>

      {/* Curated carousels — secondary, collapsed by default */}
      {categories.map(({ title, type }) => (
        <RecommendationList key={type} title={title} type={type} defaultOpen={false} />
      ))}
    </main>
  );
}
