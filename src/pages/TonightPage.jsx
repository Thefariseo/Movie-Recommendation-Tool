import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft, ArrowRight, BookOpen, Brain, Check, Clock, Ghost, Heart, Infinity as NoLimit,
  Moon, Mountain, Pencil, Smile, Sparkles, Timer, Tv, Users, Zap,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { backend } from "../utils/backend";
import { watchProviderList } from "../utils/api";
import { MOODS, TIMES, ERAS, LANGUAGES, MIN_RATINGS, POPULARITY, AVOIDABLE } from "../../shared/tonight.js";
import { LOOKS } from "../../shared/visual.js";
import UserAvatar from "../components/UserAvatar";

// What the host chose last time, remembered between visits.
const remember = (key, fallback) => ({
  read: () => {
    try { return { ...fallback, ...JSON.parse(localStorage.getItem(key) || "null") }; } catch { return fallback; }
  },
  save: (value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage may be blocked */ }
  },
});
const SERVICES = remember("umbrify_services_v1", { list: [] });
const readServices = () => {
  try { const v = JSON.parse(localStorage.getItem("umbrify_services_v1") || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
};
const saveServices = (ids) => SERVICES.save(ids);
const NO_OPTIONS = { era: null, language: null, minRating: null, popularity: null, avoid: [], gentle: false, rent: false, watchlistOnly: false };
const OPTIONS = remember("umbrify_tonight_v1", NO_OPTIONS);
const ANSWERS = remember("umbrify_tonight_answers_v1", { mood: null, time: "standard", look: null });

function region(profile) {
  if (profile?.country) return profile.country;
  const parts = (navigator.language || "it-IT").split("-");
  return parts.length > 1 ? parts.at(-1).toUpperCase() : "IT";
}

const MOOD_ICONS = { light: Smile, tense: Zap, mindbending: Brain, moving: Heart, epic: Mountain, dark: Ghost, curious: BookOpen };
const MOOD_HINTS = { light: "Comedies, animation, family", tense: "Thrillers and crime", mindbending: "Sci-fi and mysteries", moving: "Drama and romance", epic: "Action, adventure, fantasy", dark: "Horror and dark thrillers", curious: "Documentaries and history" };
const TIME_ICONS = { short: Timer, standard: Clock, long: NoLimit };

const STEPS = [
  { key: "friends", title: "Who's watching with you?", hint: "Pick up to three friends. Each votes from their own phone." },
  { key: "mood", title: "What are you in the mood for?", hint: "One tap and you're on to the next question." },
  { key: "time", title: "How much time do you have?", hint: "Films longer than this are left out." },
  { key: "where", title: "Where will you watch?", hint: "Only films on these services, or any if you pick none." },
  { key: "avoid", title: "Anything you'd rather avoid?", hint: "Optional. Leave it as it is and carry on." },
  { key: "review", title: "Ready when you are", hint: "Check the answers, then everyone votes." },
];

// A big answer tile: one choice of a question.
function Tile({ active, onClick, icon: Icon, title, hint, children }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`group flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition ${active ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-500 dark:bg-indigo-950/40" : "border-slate-200 hover:border-indigo-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/60"}`}>
      {children || (Icon && <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${active ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 group-hover:bg-indigo-100 group-hover:text-indigo-700 dark:bg-slate-800 dark:text-slate-300"}`}><Icon className="h-5 w-5" /></span>)}
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </span>
      {active && <Check className="h-5 w-5 shrink-0 text-indigo-600" />}
    </button>
  );
}

const Chip = ({ active, children, ...props }) => (
  <button type="button" aria-pressed={active}
    className={`rounded-full border px-3 py-1.5 text-sm transition ${active ? "border-indigo-500 bg-indigo-600 text-white" : "border-slate-200 hover:border-indigo-300 dark:border-slate-700"}`} {...props}>
    {children}
  </button>
);

function Toggle({ checked, onChange, children }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

export default function TonightPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const place = region(profile);
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [answers, setAnswersState] = useState(ANSWERS.read);
  const [options, setOptionsState] = useState(OPTIONS.read);
  const [services, setServices] = useState(readServices);
  const [catalogue, setCatalogue] = useState([]);
  const [friends, setFriends] = useState(null);
  const [chosen, setChosen] = useState([]);
  const [nights, setNights] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const setAnswer = (key, value) => setAnswersState((a) => { const next = { ...a, [key]: value }; ANSWERS.save(next); return next; });
  const setOption = (key, value) => setOptionsState((o) => { const next = { ...o, [key]: value }; OPTIONS.save(next); return next; });

  useEffect(() => {
    watchProviderList(place)
      .then((d) => setCatalogue((d.results || [])
        .sort((a, b) => (a.display_priorities?.[place] ?? a.display_priority ?? 99) - (b.display_priorities?.[place] ?? b.display_priority ?? 99))
        .slice(0, 16)))
      .catch(() => setCatalogue([]));
  }, [place]);
  useEffect(() => {
    if (!user) return;
    backend("social")
      .then((d) => setFriends(d.people.filter((p) => d.following.includes(p.id) && d.followers.includes(p.id) && p.share_activity)))
      .catch(() => setFriends([]));
    backend("tonight").then((d) => setNights(d.nights.filter((n) => n.status === "open"))).catch(() => {});
  }, [user?.id]);

  const go = (to) => { setDirection(to > step ? 1 : -1); setStep(Math.max(0, Math.min(STEPS.length - 1, to))); };
  const next = () => go(step + 1);
  // A single choice moves on by itself, after a beat to see it selected.
  const choose = (key, value) => { setAnswer(key, value); setTimeout(() => go(STEPS.findIndex((s) => s.key === key) + 1), 220); };
  const toggleService = (id) => {
    const list = services.includes(id) ? services.filter((s) => s !== id) : [...services, id];
    setServices(list);
    saveServices(list);
  };
  const canContinue = STEPS[step].key !== "friends" || chosen.length > 0;

  const startVote = async () => {
    setBusy(true);
    setError("");
    try {
      const { night } = await backend("tonight", { action: "create", members: chosen, mood: answers.mood, time: answers.time, providers: services, region: place, look: answers.look, ...options });
      navigate(`/tonight/${night.id}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const serviceNames = useMemo(() => catalogue.filter((c) => services.includes(c.provider_id)).map((c) => c.provider_name), [catalogue, services]);
  const friendNames = (friends || []).filter((f) => chosen.includes(f.id)).map((f) => f.display_name);
  const extras = [
    ...options.avoid.map((g) => `No ${AVOIDABLE[g]?.toLowerCase()}`),
    options.gentle && "Gentle night",
    options.era && ERAS[options.era]?.label,
    options.language && LANGUAGES[options.language]?.label,
    options.minRating && `Rated ${options.minRating}+`,
    options.popularity && POPULARITY[options.popularity]?.label,
    answers.look && LOOKS[answers.look]?.label,
    options.watchlistOnly && "From your watchlists",
    options.rent && "Rentals too",
  ].filter(Boolean);

  if (!user) {
    return (
      <main className="mx-auto max-w-xl px-4 pb-24 pt-10">
        <section className="account-panel space-y-3 text-center">
          <Moon className="mx-auto h-8 w-8 text-indigo-500" />
          <h1 className="text-2xl font-semibold">One film. Your friends. A shared movie night.</h1>
          <p className="text-sm text-slate-500">Answer a few questions, Umbrify picks films for the whole group, and everyone votes from their own phone.</p>
          <Link to="/profile" className="account-button inline-block">Sign in to start</Link>
        </section>
      </main>
    );
  }

  const current = STEPS[step];
  const summary = [
    { step: 0, label: "Watching", value: friendNames.length ? friendNames.join(", ") : "Nobody yet" },
    { step: 1, label: "Mood", value: answers.mood ? MOODS[answers.mood]?.label : "Surprise us" },
    { step: 2, label: "Time", value: TIMES[answers.time]?.label || "No limit" },
    { step: 3, label: "Where", value: serviceNames.length ? serviceNames.join(", ") : "Any service" },
    { step: 4, label: "Also", value: extras.length ? extras.join(" · ") : "No limits" },
  ];

  return (
    <main className="mx-auto max-w-2xl space-y-5 px-4 pb-24 pt-6">
      <header className="space-y-1">
        <p className="eyebrow flex items-center gap-1.5"><Moon className="h-3.5 w-3.5" /> TONIGHT WITH FRIENDS</p>
        <h1 className="text-2xl font-semibold">One film. Your friends. A shared movie night.</h1>
      </header>

      {nights.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Movie nights waiting for your vote</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {nights.map((n) => (
              <Link key={n.id} to={`/tonight/${n.id}`} className="rounded-full bg-white px-3 py-1 text-sm font-medium text-amber-900 shadow-sm hover:bg-amber-100 dark:bg-amber-900/40 dark:text-amber-100">
                {n.films.filter((f) => !f.reserve).length} films · {new Date(n.created_at).toLocaleDateString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="account-panel space-y-5 overflow-hidden">
        {/* Progress: one segment per question, done ones clickable. */}
        <div className="space-y-2">
          <div className="flex gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step + 1} aria-label="Question">
            {STEPS.map((s, i) => (
              <button key={s.key} type="button" onClick={() => i < step && go(i)} disabled={i >= step} aria-label={`Back to: ${s.title}`}
                className={`h-1.5 flex-1 rounded-full transition ${i <= step ? "bg-indigo-500" : "bg-slate-200 dark:bg-slate-700"} ${i < step ? "cursor-pointer hover:bg-indigo-400" : ""}`} />
            ))}
          </div>
          <p className="text-xs text-slate-500">Question {step + 1} of {STEPS.length}</p>
        </div>

        <AnimatePresence mode="wait" initial={false} custom={direction}>
          <motion.div key={current.key} custom={direction}
            initial={{ opacity: 0, x: 32 * direction }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -32 * direction }}
            transition={{ duration: 0.18 }} className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold">{current.title}</h2>
              <p className="text-sm text-slate-500">{current.hint}</p>
            </div>

            {current.key === "friends" && (
              friends === null ? <p className="text-sm text-slate-500" role="status">Loading your friends…</p>
                : friends.length ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {friends.map((f) => {
                      const on = chosen.includes(f.id);
                      return (
                        <Tile key={f.id} active={on} title={f.display_name} hint={on ? "Watching tonight" : chosen.length >= 3 ? "The group is full" : "Tap to invite"}
                          onClick={() => setChosen((c) => (on ? c.filter((x) => x !== f.id) : c.length < 3 ? [...c, f.id] : c))}>
                          <UserAvatar user={f} name={f.display_name} className="friend-avatar" />
                        </Tile>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600 dark:bg-slate-800/50 dark:text-slate-300">
                    <Users className="mb-2 h-5 w-5 text-indigo-500" />
                    Movie nights are for friends who follow you back and share their activity.{" "}
                    <Link className="font-medium text-indigo-600 hover:underline" to="/friends">Find friends</Link>
                  </div>
                )
            )}

            {current.key === "mood" && (
              <div className="grid gap-2 sm:grid-cols-2">
                <Tile active={!answers.mood} icon={Sparkles} title="Surprise us" hint="Whatever suits the group best" onClick={() => choose("mood", null)} />
                {Object.entries(MOODS).map(([key, m]) => (
                  <Tile key={key} active={answers.mood === key} icon={MOOD_ICONS[key]} title={m.label} hint={MOOD_HINTS[key]} onClick={() => choose("mood", key)} />
                ))}
              </div>
            )}

            {current.key === "time" && (
              <div className="grid gap-2">
                {Object.entries(TIMES).map(([key, t]) => (
                  <Tile key={key} active={answers.time === key} icon={TIME_ICONS[key]} title={t.label} hint={t.max ? `Films up to ${t.max} minutes` : "Any length, even a long epic"} onClick={() => choose("time", key)} />
                ))}
              </div>
            )}

            {current.key === "where" && (
              <div className="space-y-3">
                {catalogue.length ? (
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                    {catalogue.map((p) => {
                      const on = services.includes(p.provider_id);
                      return (
                        <button key={p.provider_id} type="button" onClick={() => toggleService(p.provider_id)} title={p.provider_name} aria-pressed={on}
                          className={`relative rounded-xl p-1 ring-2 transition ${on ? "ring-indigo-500" : "opacity-60 ring-transparent hover:opacity-100"}`}>
                          <img className="w-full rounded-lg" style={{ aspectRatio: "1 / 1" }} alt={p.provider_name} src={`https://image.tmdb.org/t/p/w92${p.logo_path}`} />
                          {on && <Check className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-indigo-600 p-0.5 text-white" />}
                        </button>
                      );
                    })}
                  </div>
                ) : <p className="text-sm text-slate-500"><Tv className="mr-1 inline h-4 w-4" />Streaming services could not be loaded; any service will do.</p>}
                <p className="text-xs text-slate-500">{serviceNames.length ? `On ${serviceNames.join(", ")}` : `Any service in ${place}`}</p>
                <Toggle checked={options.rent} onChange={(v) => setOption("rent", v)}>Also films to rent or buy on these services</Toggle>
              </div>
            )}

            {current.key === "avoid" && (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {Object.entries(AVOIDABLE).map(([id, name]) => {
                    const on = options.avoid.includes(Number(id));
                    return <Chip key={id} active={on} onClick={() => setOption("avoid", on ? options.avoid.filter((g) => g !== Number(id)) : [...options.avoid, Number(id)])}>{on ? "✕ " : ""}{name}</Chip>;
                  })}
                </div>
                <Toggle checked={options.gentle} onChange={(v) => setOption("gentle", v)}>A gentle night: no horror, thrillers, crime or war</Toggle>
                <details className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <summary className="cursor-pointer text-sm font-semibold">More options</summary>
                  <div className="mt-3 space-y-3">
                    {[
                      ["Era", "era", ERAS], ["Language", "language", LANGUAGES], ["Known or unknown", "popularity", POPULARITY],
                    ].map(([label, key, table]) => (
                      <div key={key} className="space-y-1.5">
                        <p className="text-xs font-semibold text-slate-500">{label}</p>
                        <div className="flex flex-wrap gap-1.5">
                          <Chip active={!options[key]} onClick={() => setOption(key, null)}>Any</Chip>
                          {Object.entries(table).map(([k, v]) => <Chip key={k} active={options[key] === k} onClick={() => setOption(key, k)}>{v.label}</Chip>)}
                        </div>
                      </div>
                    ))}
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-slate-500">Rated at least (IMDb and Rotten Tomatoes)</p>
                      <div className="flex flex-wrap gap-1.5">
                        <Chip active={!options.minRating} onClick={() => setOption("minRating", null)}>Any</Chip>
                        {MIN_RATINGS.map((r) => <Chip key={r} active={options.minRating === r} onClick={() => setOption("minRating", r)}>{r}+</Chip>)}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-slate-500">A look (colour and light)</p>
                      <div className="flex flex-wrap gap-1.5">
                        <Chip active={!answers.look} onClick={() => setAnswer("look", null)}>Any</Chip>
                        {Object.entries(LOOKS).map(([k, l]) => <Chip key={k} active={answers.look === k} onClick={() => setAnswer("look", k)}>{l.label}</Chip>)}
                      </div>
                    </div>
                    <Toggle checked={options.watchlistOnly} onChange={(v) => setOption("watchlistOnly", v)}>Only from the group's watchlists</Toggle>
                  </div>
                </details>
              </div>
            )}

            {current.key === "review" && (
              <div className="space-y-3">
                <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
                  {summary.map((row) => (
                    <li key={row.label} className="flex items-center gap-3 px-4 py-3">
                      <span className="w-20 shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-500">{row.label}</span>
                      <span className="min-w-0 flex-1 text-sm">{row.value}</span>
                      <button type="button" onClick={() => go(row.step)} className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100 hover:text-indigo-600 dark:hover:bg-slate-800" aria-label={`Change ${row.label}`}><Pencil className="h-3.5 w-3.5" /></button>
                    </li>
                  ))}
                </ul>
                <button className="account-button flex w-full items-center justify-center gap-2 py-3 text-base" disabled={busy || !chosen.length} onClick={startVote}>
                  {busy ? "Finding films for everyone…" : <>Start the vote <ArrowRight className="h-4 w-4" /></>}
                </button>
                <p className="text-center text-xs text-slate-500">Umbrify picks five films for the whole group. Whoever compromised in your recent movie nights gets a little more say.</p>
                {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {current.key !== "review" && (
          <div className="flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-800">
            <button type="button" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 disabled:invisible dark:hover:text-slate-200" onClick={() => go(step - 1)} disabled={step === 0}>
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <button type="button" className="account-button inline-flex items-center gap-1.5" onClick={next} disabled={!canContinue}>
              {current.key === "avoid" ? "Review" : "Next"} <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}
        {current.key === "review" && (
          <button type="button" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200" onClick={() => go(step - 1)}>
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
        )}
      </section>
    </main>
  );
}
