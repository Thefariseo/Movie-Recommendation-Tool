// =====================================================
// Statistics / Analytics dashboard + Cinema Profile
// =====================================================
import React, { useMemo, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Film,
  Star,
  Clock,
  User,
  Video,
  Clapperboard,
  TrendingUp,
} from "lucide-react";
import useWatched from "@/hooks/useWatched";
import { GENRE_MAP } from "@/utils/genres";
import { movieCredits } from "@/utils/api";
import StarRating from "@/components/StarRating";

/* ---- Cinematic persona based on top genre ---- */
function derivePersona(topGenreName) {
  const map = {
    Drama:        { label: "The Thoughtful Auteur",   desc: "You gravitate toward films with emotional depth and complex characters." },
    Thriller:     { label: "The Edge-of-Seat Devotee", desc: "Suspense and tension are your cinematic fuel." },
    Action:       { label: "The Adrenaline Seeker",   desc: "You live for spectacle, pace, and high-stakes storytelling." },
    Comedy:       { label: "The Laugh Connoisseur",   desc: "You find joy in wit, timing, and the lighter side of cinema." },
    Horror:       { label: "The Night Owl",           desc: "You embrace the dark, the uncanny, and the visceral thrill of fear." },
    "Science Fiction": { label: "The World Builder",  desc: "Speculative futures and impossible worlds are your natural habitat." },
    Fantasy:      { label: "The Mythmaker",           desc: "Epic worlds and legendary journeys define your cinema taste." },
    Romance:      { label: "The Romantic",            desc: "Love in all its forms — euphoric, tragic, quiet — is your story." },
    Crime:        { label: "The Detective",           desc: "Moral ambiguity, clever plots, and shadowy worlds fascinate you." },
    Documentary:  { label: "The Truth Seeker",        desc: "You prefer cinema that illuminates the real world around us." },
    Animation:    { label: "The Imagineer",           desc: "You see animation as a vessel for the most imaginative storytelling." },
    History:      { label: "The Chronicler",          desc: "The past lives vividly through the films you choose to watch." },
    Mystery:      { label: "The Puzzle Solver",       desc: "Every clue, every twist — you're always one step ahead." },
  };
  return map[topGenreName] || { label: "The Cinephile", desc: "A wide-ranging taste that defies easy categorisation." };
}

/* ================================================================ */
export default function StatsPage() {
  const { watched } = useWatched();

  /* ---- Base stats (synchronous) ---- */
  const stats = useMemo(() => {
    if (!watched.length) return null;

    const genreFreq = {};
    watched.forEach((m) =>
      (m.genres || []).forEach((g) => { genreFreq[g] = (genreFreq[g] || 0) + 1; })
    );
    const topGenres = Object.entries(genreFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([id, count]) => ({ name: GENRE_MAP[id] || `#${id}`, count }));
    const maxGenre = Math.max(...topGenres.map((g) => g.count), 1);

    const rated = watched.filter((m) => m.rated);
    const avgRating = rated.length
      ? rated.reduce((s, m) => s + m.rated, 0) / rated.length / 2
      : null;

    const ratingDist = [1, 2, 3, 4, 5].map((star) => ({
      star,
      count: rated.filter((m) => Math.round(m.rated / 2) === star).length,
    }));
    const maxRating = Math.max(...ratingDist.map((r) => r.count), 1);

    const decadeDist = {};
    watched.forEach((m) => {
      if (m.year) {
        const d = Math.floor(m.year / 10) * 10;
        decadeDist[d] = (decadeDist[d] || 0) + 1;
      }
    });
    const decades = Object.entries(decadeDist)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([decade, count]) => ({ label: `${decade}s`, count }));
    const maxDecade = Math.max(...decades.map((d) => d.count), 1);
    const topDecade = decades.reduce((best, d) => (!best || d.count > best.count ? d : best), null);

    const estHours = Math.round((watched.length * 100) / 60);

    return {
      topGenres, maxGenre, avgRating, ratingDist, maxRating,
      decades, maxDecade, topDecade, ratedCount: rated.length, estHours,
      topGenreName: topGenres[0]?.name || null,
    };
  }, [watched]);

  /* ---- Cinema profile (async: fetch director/actor credits) ---- */
  const [profile, setProfile]       = useState(null);
  const [profileLoading, setLoading] = useState(false);

  useEffect(() => {
    if (!watched.length) return;
    let cancelled = false;

    const build = async () => {
      setLoading(true);
      try {
        const top = [...watched]
          .filter((m) => m.rated)
          .sort((a, b) => (b.rated || 0) - (a.rated || 0))
          .slice(0, 12);

        if (!top.length) { setProfile({}); return; }

        const dirCount = {};
        const actCount = {};

        await Promise.all(
          top.map(async (m) => {
            try {
              const creds = await movieCredits(m.id);
              const dir = creds.crew?.find((p) => p.job === "Director");
              if (dir) {
                const e = dirCount[dir.id] || { name: dir.name, id: dir.id, count: 0, totalRating: 0 };
                e.count++;
                e.totalRating += (m.rated || 0) / 2;
                dirCount[dir.id] = e;
              }
              creds.cast?.slice(0, 4).forEach((a) => {
                const e = actCount[a.id] || { name: a.name, id: a.id, profile: a.profile_path, count: 0 };
                e.count++;
                actCount[a.id] = e;
              });
            } catch { /* ignore */ }
          })
        );

        if (cancelled) return;

        const topDir = Object.values(dirCount).sort((a, b) => b.count - a.count)[0] || null;
        const topAct = Object.values(actCount).sort((a, b) => b.count - a.count)[0] || null;

        setProfile({ topDir, topAct });
      } catch { /* ignore */ } finally {
        if (!cancelled) setLoading(false);
      }
    };

    build();
    return () => { cancelled = true; };
  }, [watched]);

  /* ---- Empty state ---- */
  if (!watched.length) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-20 text-center">
        <Film className="mx-auto mb-4 h-14 w-14 text-slate-300 dark:text-slate-600" />
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">No stats yet</h1>
        <p className="mt-2 text-slate-500">
          <Link to="/watched" className="text-indigo-600 hover:underline dark:text-indigo-400">
            Add some movies
          </Link>{" "}
          to see your watching statistics.
        </p>
      </main>
    );
  }

  const persona = derivePersona(stats?.topGenreName);

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 pb-20 pt-6">
      <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">My Stats</h1>

      {/* ── Cinema Profile card ── */}
      <section className="overflow-hidden rounded-2xl bg-slate-950 text-white shadow-xl">
        {/* Grain */}
        <svg className="pointer-events-none absolute h-0 w-0" aria-hidden="true">
          <filter id="grain-stats">
            <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
        </svg>

        <div
          className="relative overflow-hidden px-6 py-7 sm:px-8"
          style={{
            background:
              "radial-gradient(ellipse 80% 70% at 5% 50%, rgba(99,102,241,0.14) 0%, transparent 60%)," +
              "radial-gradient(ellipse 55% 55% at 95% 50%, rgba(139,92,246,0.08) 0%, transparent 55%)",
          }}
        >
          <div className="mb-1 flex items-center gap-2">
            <User className="h-4 w-4 text-indigo-400" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Cinema Profile
            </span>
          </div>

          <h2 className="mt-1 text-2xl font-bold text-white sm:text-3xl">{persona.label}</h2>
          <p className="mt-1.5 max-w-lg text-sm text-slate-400">{persona.desc}</p>

          {/* Profile stats grid */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {/* Favourite genre */}
            {stats.topGenreName && (
              <ProfileChip
                icon={<Film className="h-3.5 w-3.5" />}
                label="Top Genre"
                value={stats.topGenreName}
              />
            )}

            {/* Favourite decade */}
            {stats.topDecade && (
              <ProfileChip
                icon={<TrendingUp className="h-3.5 w-3.5" />}
                label="Favourite Era"
                value={stats.topDecade.label}
              />
            )}

            {/* Favourite director */}
            {profileLoading ? (
              <ProfileChip icon={<Video className="h-3.5 w-3.5" />} label="Top Director" value="…" />
            ) : profile?.topDir ? (
              <ProfileChip
                icon={<Clapperboard className="h-3.5 w-3.5" />}
                label="Top Director"
                value={profile.topDir.name}
              />
            ) : null}

            {/* Favourite actor */}
            {profileLoading ? (
              <ProfileChip icon={<User className="h-3.5 w-3.5" />} label="Top Actor" value="…" />
            ) : profile?.topAct ? (
              <ProfileChip
                icon={<User className="h-3.5 w-3.5" />}
                label="Top Actor"
                value={profile.topAct.name}
              />
            ) : null}
          </div>
        </div>
      </section>

      {/* ── Summary numbers ── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard icon={<Film className="h-5 w-5" />}  label="Watched"     value={watched.length} />
        <StatCard icon={<Star className="h-5 w-5" />}  label="Rated"       value={stats.ratedCount} />
        <StatCard
          icon={<Star className="h-5 w-5 fill-amber-400 text-amber-400" />}
          label="Avg Rating"
          value={stats.avgRating !== null ? `${stats.avgRating.toFixed(1)} ★` : "—"}
        />
        <StatCard icon={<Clock className="h-5 w-5" />} label="Est. Hours"  value={`${stats.estHours}h`} />
      </div>

      {/* ── Genre chart ── */}
      {stats.topGenres.length > 0 && (
        <ChartSection title="Favourite Genres">
          {stats.topGenres.map(({ name, count }) => (
            <BarRow key={name} label={name} value={count} max={stats.maxGenre} />
          ))}
        </ChartSection>
      )}

      {/* ── Rating distribution ── */}
      {stats.ratedCount > 0 && (
        <ChartSection title="Rating Distribution">
          {stats.ratingDist.map(({ star, count }) => (
            <BarRow
              key={star}
              label={<StarRating value={star * 2} readonly size="sm" showLabel={false} />}
              value={count}
              max={stats.maxRating}
              color="amber"
            />
          ))}
        </ChartSection>
      )}

      {/* ── By decade ── */}
      {stats.decades.length > 0 && (
        <ChartSection title="Films by Decade">
          {stats.decades.map(({ label, count }) => (
            <BarRow key={label} label={label} value={count} max={stats.maxDecade} />
          ))}
        </ChartSection>
      )}

      {/* ── Recently added ── */}
      <section>
        <h2 className="mb-4 text-base font-semibold text-slate-800 dark:text-slate-100">
          Recently Added
        </h2>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {[...watched].reverse().slice(0, 5).map((m) => (
            <div key={m.id} className="text-center">
              <img
                src={m.poster ? `https://image.tmdb.org/t/p/w185${m.poster}` : "/placeholder_poster.svg"}
                alt={m.title}
                className="mx-auto h-24 w-16 rounded-lg object-cover shadow"
                loading="lazy"
              />
              <p className="mt-1 line-clamp-2 text-xs leading-tight text-slate-500 dark:text-slate-400">
                {m.title}
              </p>
              {m.rated && (
                <div className="mt-1 flex justify-center">
                  <StarRating value={m.rated} readonly size="sm" showLabel={false} />
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

/* ---- Sub-components ---- */

function ProfileChip({ icon, label, value }) {
  return (
    <div className="rounded-xl bg-white/5 px-3 py-2.5 backdrop-blur-sm">
      <div className="mb-1 flex items-center gap-1.5 text-indigo-400">{icon}</div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function StatCard({ icon, label, value }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-100 dark:bg-slate-800/80 dark:ring-slate-700/60">
      <div className="mb-2 text-indigo-500 dark:text-indigo-400">{icon}</div>
      <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{value}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  );
}

function ChartSection({ title, children }) {
  return (
    <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-100 dark:bg-slate-800/80 dark:ring-slate-700/60">
      <h2 className="mb-5 text-sm font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        {title}
      </h2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function BarRow({ label, value, max, color = "indigo" }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  const barColor = color === "amber" ? "bg-amber-400" : "bg-indigo-500 dark:bg-indigo-400";

  return (
    <div className="flex items-center gap-3">
      <div className="w-24 shrink-0 text-xs text-slate-600 dark:text-slate-400">{label}</div>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
        <div
          className={`h-full rounded-full ${barColor} transition-all duration-700`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="w-6 text-right text-xs font-semibold text-slate-500 dark:text-slate-400">
        {value}
      </div>
    </div>
  );
}
