// =====================================================
// IntroScreen – cinematic intro overlay
// • Fetches trending backdrops and crossfades between them
// • Word-by-word phrase reveal with blur animation
// • Auto-advances after 4s; click/tap anywhere to skip
// • Cross-browser: unique SVG filter ID, webkit prefix, AnimatePresence mode sync
// • Shows on every page load (no sessionStorage guard)
// =====================================================
import React, { useEffect, useId, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { trendingMovies } from "../utils/api";

/* ---- Phrase animation variants ---- */
const sentence = {
  hidden:  { opacity: 1 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.11, delayChildren: 0.5 },
  },
};

const wordVariant = {
  hidden:  { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};

const PHRASE   = "What do you want to watch tonight?";
const words    = PHRASE.split(" ");
const DURATION = 4500; // ms before auto-advance
const SWAP_MS  = 2400; // backdrop crossfade interval

/* ---- Film-grain overlay — unique ID per mount prevents clashes in StrictMode ---- */
function GrainOverlay({ filterId }) {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.07]"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <filter id={filterId}>
        <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter={`url(#${filterId})`} />
    </svg>
  );
}

/* ================================================================ */
export default function IntroScreen({ onDone }) {
  const uid                             = useId(); // stable unique ID per mount
  const filterId                        = `grain-intro-${uid.replace(/:/g, "")}`;
  const [backdrops, setBackdrops]       = useState([]); // TMDB image URLs
  const [activeIdx, setActiveIdx]       = useState(0);
  const calledRef                       = useRef(false);  // guard double-call
  const isDone                          = useRef(false);

  /* ---- Safe onDone: called at most once ---- */
  const finish = useCallback(() => {
    if (calledRef.current || isDone.current) return;
    calledRef.current = true;
    isDone.current    = true;
    onDone();
  }, [onDone]);

  /* ---- Fetch trending movie backdrops ---- */
  useEffect(() => {
    trendingMovies("week")
      .then((data) => {
        const imgs = (data.results || [])
          .filter((m) => m.backdrop_path)
          .slice(0, 10)
          .map((m) => `https://image.tmdb.org/t/p/w1280${m.backdrop_path}`);
        setBackdrops(imgs);
      })
      .catch(() => {});
  }, []);

  /* ---- Crossfade backdrops ---- */
  useEffect(() => {
    if (backdrops.length < 2) return;
    const id = setInterval(
      () => setActiveIdx((i) => (i + 1) % backdrops.length),
      SWAP_MS
    );
    return () => clearInterval(id);
  }, [backdrops]);

  /* ---- Auto-advance ---- */
  useEffect(() => {
    const t = setTimeout(finish, DURATION);
    return () => clearTimeout(t);
  }, [finish]);

  return (
    <motion.div
      /* Entry */
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.45 } }}
      /* Exit: slide up — AnimatePresence in App.jsx handles unmount */
      exit={{ y: "-100%", opacity: 0, transition: { duration: 0.65, ease: [0.76, 0, 0.24, 1] } }}
      onClick={finish}
      className="fixed inset-0 z-[9999] flex cursor-pointer flex-col items-center justify-center overflow-hidden bg-black"
      role="button"
      aria-label="Skip intro"
    >
      {/* ── Dynamic backdrop images (crossfade) ── */}
      <div className="absolute inset-0">
        <AnimatePresence>
          {backdrops.length > 0 && backdrops[activeIdx] != null && (
            <motion.div
              key={activeIdx}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.5, ease: "easeInOut" }}
              className="absolute inset-0"
            >
              <img
                src={backdrops[activeIdx]}
                className="h-full w-full object-cover"
                alt=""
                draggable={false}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Dark scrim */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/65 via-black/55 to-black/80" />

      {/* Film grain texture — unique filter ID avoids Safari/Firefox ID collision */}
      <GrainOverlay filterId={filterId} />

      {/* Radial vignette */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 85% 75% at 50% 50%, transparent 25%, rgba(0,0,0,0.65) 100%)",
        }}
      />

      {/* ── Logo / app name ── */}
      <motion.p
        initial={{ opacity: 0, letterSpacing: "0.35em" }}
        animate={{ opacity: 0.5, letterSpacing: "0.28em" }}
        transition={{ delay: 0.2, duration: 0.9 }}
        className="relative z-10 mb-10 text-[10px] font-light uppercase tracking-[0.28em] text-white select-none"
      >
        CineSuggest
      </motion.p>

      {/* ── Main phrase ── */}
      <motion.div
        variants={sentence}
        initial="hidden"
        animate="visible"
        className="relative z-10 flex max-w-lg flex-wrap justify-center gap-x-3 gap-y-1 px-8 text-center"
      >
        {words.map((w, i) => (
          <motion.span
            key={i}
            variants={wordVariant}
            className="text-3xl font-light leading-snug tracking-wide text-white sm:text-4xl md:text-[2.75rem]"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
          >
            {w}
          </motion.span>
        ))}
      </motion.div>

      {/* ── Skip hint ── */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.8, duration: 0.6 }}
        className="relative z-10 mt-12 text-[10px] uppercase tracking-[0.22em] text-white/35 select-none"
      >
        tap anywhere to continue
      </motion.p>

      {/* ── Progress bar ── */}
      <motion.div
        initial={{ scaleX: 0, originX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: DURATION / 1000, ease: "linear" }}
        className="absolute bottom-0 left-0 h-[1px] w-full bg-white/25"
      />
    </motion.div>
  );
}
