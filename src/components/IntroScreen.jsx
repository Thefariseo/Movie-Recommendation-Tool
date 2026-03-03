// =====================================================
// IntroScreen – cinematic intro overlay
// • Fetches backdrops from 3 TMDB endpoints, deduplicates & shuffles
// • Starts from a random position in the pool — always looks different
// • Crossfades between images every 2.4 s
// • Word-by-word phrase reveal with blur animation
// • Auto-advances after 4.5 s; click/tap anywhere to skip
// • Cross-browser: unique SVG filter ID per mount
// =====================================================
import React, { useEffect, useId, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { trendingMovies, topRatedMovies } from "../utils/api";

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

/* ---- Shuffle array in-place (Fisher-Yates) ---- */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

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

  /* ---- Fetch backdrops from 3 sources, deduplicate, shuffle ---- */
  useEffect(() => {
    Promise.all([
      trendingMovies("week").catch(() => ({ results: [] })),
      trendingMovies("day").catch(() => ({ results: [] })),
      topRatedMovies(1).catch(() => ({ results: [] })),
      topRatedMovies(2).catch(() => ({ results: [] })),
    ]).then(([week, day, top1, top2]) => {
      const seen = new Set();
      const imgs = [];

      for (const result of [week, day, top1, top2]) {
        for (const m of (result.results || [])) {
          if (m.backdrop_path && !seen.has(m.id)) {
            seen.add(m.id);
            imgs.push(`https://image.tmdb.org/t/p/w1280${m.backdrop_path}`);
          }
        }
      }

      // Shuffle and pick up to 30 images
      const shuffled = shuffle(imgs).slice(0, 30);

      // Start from a random position so each visit looks different
      const startIdx = Math.floor(Math.random() * Math.min(shuffled.length, 8));
      setBackdrops(shuffled);
      setActiveIdx(startIdx);
    });
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
        umbrify
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
