// =====================================================
// ForYouSection – Cinematic discovery hero v4
// • Mood bar ("Tonight I feel like…")
// • Geographic origin country filter
// • Individual decade buckets from 1920s to 2020s
// • Streaming provider badges on hero (with pulse animation)
// • FIXED: Narrative readability — dark frosted glass panel
// • Director/actor person search with filmography filter
// • Staggered entrance for picks carousel
// =====================================================
import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  RefreshCw, Sparkles, Play, Plus, Check,
  SlidersHorizontal, X, Shuffle, User, Film,
  Video, ChevronDown, Globe, Tv, Compass,
} from "lucide-react";
import { useModal }        from "@/hooks/useModal";
import useRecommend        from "@/hooks/useRecommend";
import useWatchlist        from "@/hooks/useWatchlist";
import useWatched          from "@/hooks/useWatched";
import { useToast }        from "@/contexts/ToastContext";
import { GENRE_MAP }       from "@/utils/genres";
import { searchPeople }    from "@/utils/api";

/* ------------------------------------------------------------------ */
/* Static data                                                          */
/* ------------------------------------------------------------------ */

const MOODS = [
  { id: "light",       label: "Light",        emoji: "😄", hint: "comedies & animation" },
  { id: "tense",       label: "Tense",        emoji: "😰", hint: "thrillers & crime" },
  { id: "mindbending", label: "Mind-bending", emoji: "🤯", hint: "sci-fi & mystery" },
  { id: "deep",        label: "Deep",         emoji: "🎭", hint: "drama & history" },
  { id: "epic",        label: "Epic",         emoji: "🌀", hint: "action & adventure" },
  { id: "romantic",    label: "Romantic",     emoji: "💑", hint: "romance & drama" },
  { id: "dark",        label: "Dark",         emoji: "😱", hint: "horror & thriller" },
  { id: "artsy",       label: "Artsy",        emoji: "🎨", hint: "drama & documentary" },
];

const DECADES = [
  { id: "all",   label: "All" },
  { id: "1920s", label: "1920s" },
  { id: "1930s", label: "1930s" },
  { id: "1940s", label: "1940s" },
  { id: "1950s", label: "1950s" },
  { id: "1960s", label: "1960s" },
  { id: "1970s", label: "1970s" },
  { id: "1980s", label: "1980s" },
  { id: "1990s", label: "1990s" },
  { id: "2000s", label: "2000s" },
  { id: "2010s", label: "2010s" },
  { id: "2020s", label: "2020s" },
];

const COUNTRIES = [
  { code: "any", label: "Any country",  flag: "🌍" },
  { code: "US",  label: "American",     flag: "🇺🇸" },
  { code: "GB",  label: "British",      flag: "🇬🇧" },
  { code: "FR",  label: "French",       flag: "🇫🇷" },
  { code: "IT",  label: "Italian",      flag: "🇮🇹" },
  { code: "DE",  label: "German",       flag: "🇩🇪" },
  { code: "ES",  label: "Spanish",      flag: "🇪🇸" },
  { code: "SE",  label: "Scandinavian", flag: "🇸🇪" },
  { code: "JP",  label: "Japanese",     flag: "🇯🇵" },
  { code: "KR",  label: "Korean",       flag: "🇰🇷" },
  { code: "CN",  label: "Chinese",      flag: "🇨🇳" },
  { code: "HK",  label: "HK",           flag: "🇭🇰" },
  { code: "TW",  label: "Taiwanese",    flag: "🇹🇼" },
  { code: "IN",  label: "Indian",       flag: "🇮🇳" },
  { code: "IR",  label: "Iranian",      flag: "🇮🇷" },
  { code: "PL",  label: "Polish",       flag: "🇵🇱" },
  { code: "RU",  label: "Russian",      flag: "🇷🇺" },
  { code: "MX",  label: "Mexican",      flag: "🇲🇽" },
  { code: "AR",  label: "Argentine",    flag: "🇦🇷" },
  { code: "BR",  label: "Brazilian",    flag: "🇧🇷" },
];

/* ------------------------------------------------------------------ */
/* Framer Motion variants for staggered picks entrance                 */
/* ------------------------------------------------------------------ */
const carouselContainer = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.07, delayChildren: 0.1 },
  },
};

const carouselItem = {
  hidden:  { opacity: 0, y: 24, scale: 0.95 },
  visible: { opacity: 1, y: 0,  scale: 1, transition: { duration: 0.38, ease: [0.22, 1, 0.36, 1] } },
};

/* ------------------------------------------------------------------ */
/* Sub-components                                                       */
/* ------------------------------------------------------------------ */

/* Secondary pick card */
function PickCard({ movie }) {
  const { open } = useModal();
  const { isInWatchlist, addToWatchlist, removeFromWatchlist } = useWatchlist();
  const { addToast } = useToast();
  const inList = isInWatchlist(movie.id);

  const handleWL = (e) => {
    e.stopPropagation();
    if (inList) {
      removeFromWatchlist(movie.id);
      addToast("Removed from Watchlist", "info");
    } else {
      addToWatchlist(movie);
      addToast("Added to Watchlist ✓");
    }
  };

  return (
    <motion.div
      variants={carouselItem}
      whileHover={{ scale: 1.05, y: -4 }}
      onClick={() => open(movie)}
      className="relative shrink-0 w-36 cursor-pointer overflow-hidden rounded-xl shadow-lg"
    >
      <img
        src={
          movie.poster_path
            ? `https://image.tmdb.org/t/p/w185${movie.poster_path}`
            : "/placeholder_poster.svg"
        }
        alt={movie.title}
        className="h-52 w-full object-cover"
        loading="lazy"
      />

      {movie.vote_average > 0 && (
        <span className="absolute left-1.5 top-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-amber-400">
          ★ {movie.vote_average.toFixed(1)}
        </span>
      )}

      <motion.div
        initial={{ opacity: 0 }}
        whileHover={{ opacity: 1 }}
        className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/85 via-black/30 to-transparent p-2.5"
      >
        <p className="mb-1 line-clamp-2 text-[11px] font-semibold leading-tight text-white">
          {movie.title}
        </p>
        <button
          onClick={handleWL}
          className="flex items-center gap-0.5 self-end rounded-md bg-indigo-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-indigo-500 transition-colors"
        >
          {inList ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
          {inList ? "Added" : "+List"}
        </button>
      </motion.div>

      {movie._reason && (
        <div className="absolute bottom-0 inset-x-0 pointer-events-none">
          <div className="bg-gradient-to-t from-black/90 to-transparent pt-6 pb-1.5 px-2">
            <p className="line-clamp-1 text-[9px] text-indigo-300 leading-tight">{movie._reason}</p>
          </div>
        </div>
      )}
    </motion.div>
  );
}

/* Skeleton loader */
function Skeleton() {
  return (
    <div className="animate-pulse">
      <div className="relative overflow-hidden rounded-2xl bg-slate-200 dark:bg-slate-700 h-[380px] sm:h-[460px] md:h-[520px] w-full mb-5" />
      <div className="flex gap-3 px-1">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="shrink-0 w-36 h-52 rounded-xl bg-slate-200 dark:bg-slate-700" />
        ))}
      </div>
    </div>
  );
}

/* Person filter chip */
function PersonChip({ label, icon: Icon, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-3 py-1 text-xs font-medium text-white">
      <Icon className="h-3 w-3" />
      {label}
      <button onClick={onRemove} className="ml-0.5 hover:text-indigo-200 transition-colors">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

/* Debounced person search */
function PersonSearch({ placeholder, icon: Icon, onSelect }) {
  const [query,   setQuery]   = useState("");
  const [results, setResults] = useState([]);
  const [isOpen,  setIsOpen]  = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef           = useRef(null);
  const containerRef          = useRef(null);

  const doSearch = useCallback(async (q) => {
    if (!q.trim() || q.length < 2) { setResults([]); setIsOpen(false); return; }
    setLoading(true);
    try {
      const data   = await searchPeople(q);
      const people = (data.results || []).slice(0, 6);
      setResults(people);
      setIsOpen(people.length > 0);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  const handleChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 350);
  };

  const handleSelect = (person) => {
    onSelect({ id: person.id, name: person.name });
    setQuery(""); setResults([]); setIsOpen(false);
  };

  useEffect(() => {
    const fn = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 dark:border-slate-600 dark:bg-slate-700/60">
        <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={handleChange}
          placeholder={placeholder}
          className="w-36 bg-transparent text-xs outline-none placeholder:text-slate-400 dark:text-slate-200"
        />
        {loading && (
          <span className="h-3 w-3 animate-spin rounded-full border border-indigo-400 border-t-transparent" />
        )}
      </div>

      <AnimatePresence>
        {isOpen && results.length > 0 && (
          <motion.ul
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 top-full z-50 mt-1 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800"
          >
            {results.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => handleSelect(p)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
                >
                  {p.profile_path ? (
                    <img src={`https://image.tmdb.org/t/p/w45${p.profile_path}`} alt={p.name}
                      className="h-7 w-7 shrink-0 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-700">
                      <User className="h-4 w-4 text-slate-400" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-800 dark:text-slate-200">{p.name}</p>
                    {p.known_for_department && (
                      <p className="truncate text-[10px] text-slate-400">{p.known_for_department}</p>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ================================================================ */
/* Main component                                                      */
/* ================================================================ */

export default function ForYouSection() {
  const { open }    = useModal();
  const { watched } = useWatched();
  const { isInWatchlist, addToWatchlist, removeFromWatchlist } = useWatchlist();
  const { addToast } = useToast();

  /* ---- Preference state ---- */
  const [showPrefs,    setShowPrefs]    = useState(false);
  const [selMood,      setSelMood]      = useState(null);   // mood id
  const [selGenres,    setSelGenres]    = useState([]);
  const [selEra,       setSelEra]       = useState("all");
  const [selCountry,   setSelCountry]   = useState("any");
  const [directorPick,   setDirectorPick]   = useState(null);
  const [actorPick,      setActorPick]      = useState(null);
  const [expandHorizons, setExpandHorizons] = useState(false);

  /* Genre list from user's actual watch history */
  const availableGenres = useMemo(() => {
    const ids = new Set();
    watched.forEach((m) => m.genres?.forEach((g) => ids.add(g)));
    return [...ids]
      .map((id) => ({ id, name: GENRE_MAP[id] || String(id) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [watched]);

  /* Mood and explicit genres are mutually exclusive */
  const handleMoodSelect = (id) => {
    setSelMood((prev) => (prev === id ? null : id));
    setSelGenres([]);  // clear genres when mood selected
  };
  const toggleGenre = (id) => {
    setSelMood(null);  // clear mood when genre selected
    setSelGenres((prev) => prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]);
  };

  const prefs = useMemo(() => ({
    genres:         selGenres,
    era:            selEra === "all" ? undefined : selEra,
    mood:           selMood || undefined,
    country:        selCountry === "any" ? undefined : selCountry,
    directorId:     directorPick?.id,
    actorId:        actorPick?.id,
    expandHorizons: expandHorizons || undefined,
  }), [selGenres, selEra, selMood, selCountry, directorPick, actorPick, expandHorizons]);

  const prefCount =
    (selMood ? 1 : selGenres.length) +
    (selEra !== "all" ? 1 : 0) +
    (selCountry !== "any" ? 1 : 0) +
    (directorPick    ? 1 : 0) +
    (actorPick       ? 1 : 0) +
    (expandHorizons  ? 1 : 0);

  const hasPrefs = prefCount > 0;

  const clearPrefs = () => {
    setSelMood(null);
    setSelGenres([]);
    setSelEra("all");
    setSelCountry("any");
    setDirectorPick(null);
    setActorPick(null);
    setExpandHorizons(false);
  };

  /* ---- Recommendations ---- */
  const { pick, list, loading, refresh } = useRecommend({ prefs, top: 10 });

  const inList = pick ? isInWatchlist(pick.id) : false;

  const handleWL = (e) => {
    e.stopPropagation();
    if (!pick) return;
    if (inList) {
      removeFromWatchlist(pick.id);
      addToast("Removed from Watchlist", "info");
    } else {
      addToWatchlist(pick);
      addToast("Added to Watchlist ✓");
    }
  };

  /* ---- Hero derived data ---- */
  const heroImg    = pick?.backdrop_path
    ? `https://image.tmdb.org/t/p/w1280${pick.backdrop_path}`
    : pick?.poster_path
    ? `https://image.tmdb.org/t/p/w780${pick.poster_path}`
    : null;

  const year       = (pick?.release_date || "").slice(0, 4);
  const voteLabel  = pick?.vote_average > 0 ? `★ ${pick.vote_average.toFixed(1)}` : null;
  const heroText   = pick?._narrative || pick?.overview || null;
  const dirName    = pick?._director  || null;
  const heroGenres = pick?.genres?.slice(0, 3) || [];

  /* ---- Streaming providers for hero pick ---- */
  const providers  = pick?._providers?.flatrate || [];

  return (
    <section>
      {/* ── Section header ── */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-slate-100 md:text-2xl">
            <Sparkles className="h-5 w-5 text-indigo-500" />
            For You
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Based on {watched.length} film{watched.length !== 1 ? "s" : ""}
            {hasPrefs && <span className="ml-1 font-medium text-indigo-500">· filtered</span>}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {directorPick && (
            <PersonChip label={directorPick.name} icon={Video} onRemove={() => setDirectorPick(null)} />
          )}
          {actorPick && (
            <PersonChip label={actorPick.name} icon={User} onRemove={() => setActorPick(null)} />
          )}

          <button
            onClick={() => setShowPrefs((v) => !v)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ring-1 transition-colors ${
              showPrefs || hasPrefs
                ? "bg-indigo-600 text-white ring-indigo-600"
                : "text-slate-600 ring-slate-300 hover:bg-slate-100 dark:text-slate-300 dark:ring-slate-600 dark:hover:bg-slate-800"
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Preferences
            {hasPrefs && (
              <span className="ml-0.5 rounded-full bg-white/25 px-1.5 text-xs">{prefCount}</span>
            )}
            <ChevronDown className={`h-3 w-3 transition-transform ${showPrefs ? "rotate-180" : ""}`} />
          </button>

          {/* Expand Horizons: world-cinema mode — cinephile seeds + hidden gems */}
          <button
            onClick={() => setExpandHorizons((v) => !v)}
            title="World cinema mode: surfaces auteur films, hidden gems, and international art house. Lowers vote-count floor for deeper cuts."
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ring-1 transition-colors ${
              expandHorizons
                ? "bg-amber-500 text-white ring-amber-500 shadow-md"
                : "text-slate-600 ring-slate-300 hover:bg-slate-100 dark:text-slate-300 dark:ring-slate-600 dark:hover:bg-slate-800"
            }`}
          >
            <Compass className="h-4 w-4" />
            {expandHorizons ? "Horizons ✓" : "Expand"}
          </button>

          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 ring-1 ring-slate-300 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:ring-slate-600 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Mood bar — "Tonight I feel like…" ── */}
      <div className="mb-4 rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3 dark:border-slate-700/50 dark:bg-slate-800/40">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
          Tonight I feel like…
        </p>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {MOODS.map((m) => (
            <button
              key={m.id}
              onClick={() => handleMoodSelect(m.id)}
              title={m.hint}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                selMood === m.id
                  ? "bg-indigo-600 text-white ring-2 ring-indigo-400 ring-offset-1"
                  : "bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-indigo-300 dark:bg-slate-700 dark:text-slate-300 dark:ring-slate-600"
              }`}
            >
              <span className="text-sm leading-none">{m.emoji}</span>
              {m.label}
            </button>
          ))}
          {selMood && (
            <button
              onClick={() => setSelMood(null)}
              className="flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-xs text-rose-500 ring-1 ring-rose-200 hover:bg-rose-50 dark:ring-rose-900"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Preferences panel (collapsible) ── */}
      <AnimatePresence>
        {showPrefs && (
          <motion.div
            key="prefs"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800/80">

              {/* Decade */}
              <div className="mb-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
                  Decade
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {DECADES.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => setSelEra(d.id)}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                        selEra === d.id
                          ? "bg-indigo-600 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Country of origin */}
              <div className="mb-4">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-slate-400">
                  <Globe className="h-3.5 w-3.5" />
                  Cinematography
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {COUNTRIES.map((c) => (
                    <button
                      key={c.code}
                      onClick={() => setSelCountry(c.code)}
                      className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                        selCountry === c.code
                          ? "bg-indigo-600 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                      }`}
                    >
                      {c.flag} {c.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Genres (hidden when mood is active — mood covers genre selection) */}
              {!selMood && (
                <div className="mb-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
                    Genres
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {availableGenres.map((g) => {
                      const sel = selGenres.includes(g.id);
                      return (
                        <button
                          key={g.id}
                          onClick={() => toggleGenre(g.id)}
                          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                            sel
                              ? "bg-indigo-600 text-white"
                              : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                          }`}
                        >
                          {sel && <span className="mr-1">✓</span>}
                          {g.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Director / Actor search */}
              <div className="mb-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
                  Director / Actor
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {directorPick ? (
                    <PersonChip label={directorPick.name} icon={Film} onRemove={() => setDirectorPick(null)} />
                  ) : (
                    <PersonSearch placeholder="Search director…" icon={Film} onSelect={setDirectorPick} />
                  )}
                  {actorPick ? (
                    <PersonChip label={actorPick.name} icon={User} onRemove={() => setActorPick(null)} />
                  ) : (
                    <PersonSearch placeholder="Search actor…" icon={User} onSelect={setActorPick} />
                  )}
                </div>
                {(directorPick || actorPick) && (
                  <p className="mt-1.5 text-[10px] text-slate-400">
                    Showing films from their full filmography. Country filter not applied in this mode.
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3 mt-2">
                {hasPrefs && (
                  <button
                    onClick={clearPrefs}
                    className="flex items-center gap-1.5 text-xs text-rose-500 hover:underline"
                  >
                    <X className="h-3.5 w-3.5" /> Clear all
                  </button>
                )}
                <button
                  onClick={() => { clearPrefs(); refresh(); setShowPrefs(false); }}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50 dark:ring-slate-700 dark:hover:bg-slate-800"
                >
                  <Shuffle className="h-4 w-4" />
                  Surprise me
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Loading ── */}
      {loading && <Skeleton />}

      {/* ── Hero + picks ── */}
      {!loading && pick && (
        <>
          {/* ═══ HERO CARD ═══ */}
          <AnimatePresence mode="wait">
            <motion.div
              key={pick.id}
              initial={{ opacity: 0, scale: 1.02 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="relative mb-5 cursor-pointer overflow-hidden rounded-2xl shadow-2xl"
              style={{ minHeight: "clamp(360px, 60vh, 580px)" }}
              onClick={() => open(pick)}
            >
              {/* Backdrop */}
              {heroImg ? (
                <img src={heroImg} alt={pick.title}
                  className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <div className="absolute inset-0 bg-slate-800" />
              )}

              {/* Gradient scrim — very strong at bottom for readability */}
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/90 to-black/10" />

              {/* ── Streaming providers (top-right) with pulse glow ── */}
              {providers.length > 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="absolute right-4 top-4 flex items-center gap-1.5"
                >
                  <motion.div
                    animate={{ boxShadow: ["0 0 0 0 rgba(99,102,241,0)", "0 0 0 6px rgba(99,102,241,0.3)", "0 0 0 0 rgba(99,102,241,0)"] }}
                    transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                    className="flex items-center gap-1.5 rounded-xl bg-black/60 px-2 py-1.5 backdrop-blur-sm"
                  >
                    <Tv className="h-3 w-3 text-indigo-400" />
                    {providers.slice(0, 4).map((p) => (
                      <img
                        key={p.provider_id}
                        src={`https://image.tmdb.org/t/p/w45${p.logo_path}`}
                        alt={p.provider_name}
                        title={p.provider_name}
                        className="h-6 w-6 rounded-md object-cover shadow-md ring-1 ring-white/20"
                      />
                    ))}
                  </motion.div>
                </motion.div>
              )}

              {/* ── Reason chip (top-left) ── */}
              {pick._reason && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, type: "spring", stiffness: 280 }}
                  className="absolute left-5 top-5"
                >
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600/90 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm shadow-lg">
                    <Sparkles className="h-3 w-3" />
                    {pick._reason}
                  </span>
                </motion.div>
              )}

              {/* ── Bottom info block ── */}
              <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-8">
                <div className="flex items-end justify-between gap-6">

                  {/* Left: text */}
                  <div className="min-w-0 flex-1">
                    {/* Director */}
                    {dirName && (
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.1 }}
                        className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-indigo-300"
                      >
                        {dirName}
                      </motion.p>
                    )}

                    {/* Title */}
                    <motion.h3
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.15, duration: 0.4 }}
                      className="line-clamp-2 text-2xl font-bold leading-tight text-white sm:text-3xl md:text-4xl"
                      style={{
                        fontFamily: "'Playfair Display', Georgia, serif",
                        textShadow: "0 2px 12px rgba(0,0,0,0.9)",
                      }}
                    >
                      {pick.title}
                    </motion.h3>

                    {/* Meta */}
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.22 }}
                      className="mt-2 flex flex-wrap items-center gap-2 text-xs"
                    >
                      {year && <span className="font-medium text-white/80">{year}</span>}
                      {voteLabel && (
                        <span className="font-semibold text-amber-400">{voteLabel}</span>
                      )}
                      {heroGenres.map((g) => (
                        <span
                          key={g.id}
                          className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-medium text-white/80 backdrop-blur-sm"
                        >
                          {g.name}
                        </span>
                      ))}
                    </motion.div>

                    {/* ── NARRATIVE — dark frosted glass panel for guaranteed readability ── */}
                    {heroText && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.3, duration: 0.4 }}
                        className="mt-3 max-w-xl"
                      >
                        <div className="rounded-xl bg-black/65 px-3.5 py-2.5 backdrop-blur-md">
                          <p className="line-clamp-3 text-sm font-normal leading-relaxed text-white sm:line-clamp-4">
                            {heroText}
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </div>

                  {/* Right: actions */}
                  <div className="flex shrink-0 flex-col gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); open(pick); }}
                      className="flex items-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-lg hover:bg-slate-100 transition-colors"
                    >
                      <Play className="h-4 w-4 fill-slate-900" />
                      Details
                    </button>
                    <button
                      onClick={handleWL}
                      className={`flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-lg transition-colors ${
                        inList
                          ? "bg-indigo-600 text-white hover:bg-indigo-500"
                          : "bg-white/15 text-white backdrop-blur hover:bg-white/25"
                      }`}
                    >
                      {inList ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                      {inList ? "In List" : "Watchlist"}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* ── More picks carousel — staggered entrance ── */}
          {list.length > 0 && (
            <div>
              <h3 className="mb-3 px-1 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                More picks for you
              </h3>
              <motion.div
                variants={carouselContainer}
                initial="hidden"
                animate="visible"
                className="flex gap-3 overflow-x-auto pb-3 scrollbar-hide"
              >
                {list.map((m) => (
                  <PickCard key={m.id} movie={m} />
                ))}
              </motion.div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
