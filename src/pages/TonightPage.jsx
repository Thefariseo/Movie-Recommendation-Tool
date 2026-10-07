import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowRight, BookOpen, Brain, Check, Clock, Ghost, Heart, Infinity as NoLimit,
  Moon, Mountain, Smile, Sparkles, Timer, Tv, Users, Zap,
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

// A choice among a few, as one strip of buttons (the time the group has).
function Segmented({ options, value, onChange, label }) {
  return (
    <div className="tonight-segmented" role="radiogroup" aria-label={label}>
      {options.map(([key, title, hint, Icon]) => (
        <button key={key} type="button" role="radio" aria-checked={value === key} onClick={() => onChange(key)}>
          {Icon && <Icon className="h-4 w-4" aria-hidden="true" />}
          <span className="font-semibold">{title}</span>
          {hint && <span className="text-[11px] opacity-70">{hint}</span>}
        </button>
      ))}
    </div>
  );
}

// One part of the night's set-up, numbered so the order reads at a glance.
function Part({ n, title, hint, aside, children }) {
  return (
    <section className="space-y-3" aria-labelledby={`tonight-${n}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={`tonight-${n}`} className="flex items-center gap-2 text-base font-semibold">
          <span className="tonight-step" aria-hidden="true">{n}</span>{title}
        </h2>
        {aside}
      </div>
      {hint && <p className="-mt-1 text-sm text-slate-500">{hint}</p>}
      {children}
    </section>
  );
}

export default function TonightPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const place = region(profile);
  const [answers, setAnswersState] = useState(ANSWERS.read);
  const [options, setOptionsState] = useState(OPTIONS.read);
  const [services, setServices] = useState(readServices);
  const [catalogue, setCatalogue] = useState([]);
  const [friends, setFriends] = useState(null);
  // A friend's page opens this with them already invited.
  const [params] = useSearchParams();
  const [chosen, setChosen] = useState(() => (/^[0-9a-f-]{36}$/i.test(params.get("with") || "") ? [params.get("with")] : []));
  const [nights, setNights] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [invited, setInvited] = useState(false);

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

  const toggleService = (id) => {
    const list = services.includes(id) ? services.filter((s) => s !== id) : [...services, id];
    setServices(list);
    saveServices(list);
  };
  const toggleFriend = (id) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length < 3 ? [...c, id] : c));

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
  // Someone without friends here yet can ask one to join.
  const invite = async () => {
    const url = window.location.origin;
    try {
      if (navigator.share) await navigator.share({ title: "Umbrify", text: "Let's pick tonight's film together on Umbrify", url });
      else { await navigator.clipboard.writeText(url); setInvited(true); }
    } catch { /* closed */ }
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
          <h1 className="font-display text-2xl sm:text-3xl">One film. Your friends. A shared movie night.</h1>
          <p className="text-sm text-slate-500">Answer a few questions, Umbrify picks films for the whole group, and everyone votes from their own phone.</p>
          <Link to="/profile" className="account-button inline-block">Sign in to start</Link>
        </section>
      </main>
    );
  }

  const noFriends = friends !== null && friends.length === 0;
  // Each part its own words, so each is translated.
  const recap = [friendNames.length ? `With ${friendNames.join(", ")}` : null, answers.mood ? MOODS[answers.mood]?.label : "Surprise us", TIMES[answers.time]?.label]
    .filter(Boolean).flatMap((part, i) => (i ? [" · ", <span key={i}>{part}</span>] : [<span key={i}>{part}</span>]));

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 pb-44 pt-6 md:pb-32">
      <header className="space-y-1">
        <p className="eyebrow flex items-center gap-1.5"><Moon className="h-3.5 w-3.5" /> TONIGHT WITH FRIENDS</p>
        <h1 className="font-display text-2xl sm:text-3xl">One film. Your friends. A shared movie night.</h1>
        <p className="text-sm text-slate-500">Choose who is watching and what kind of night it is: Umbrify picks five films for the group and everyone votes from their own phone.</p>
      </header>

      {nights.length > 0 && (
        <section className="space-y-2" aria-label="Movie nights waiting for your vote">
          <p className="text-sm font-semibold">Movie nights waiting for your vote</p>
          <div className="space-y-2">
            {nights.map((n) => (
              <Link key={n.id} to={`/tonight/${n.id}`} className="tonight-waiting">
                <Moon className="h-5 w-5 shrink-0 text-amber-500" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{`${n.films.filter((f) => !f.reserve).length} films to vote on`}</span>
                  <span className="block text-xs text-slate-500">{new Date(n.created_at).toLocaleDateString(undefined, { weekday: "long", hour: "2-digit", minute: "2-digit" })}</span>
                </span>
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 dark:text-indigo-300">Vote <ArrowRight className="h-4 w-4" /></span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {friends === null ? (
        <div className="space-y-3" role="status" aria-label="Loading your friends…">
          <div className="skeleton h-5 w-40" />
          <div className="flex gap-4">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-16 w-16 rounded-full" />)}</div>
        </div>
      ) : noFriends ? (
        <section className="account-panel space-y-3 text-center">
          <Users className="mx-auto h-8 w-8 text-indigo-500" />
          <h2 className="text-lg font-semibold">Movie nights are better together</h2>
          <p className="text-sm text-slate-500">Movie nights are for friends who follow you back and share their activity.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link className="account-button" to="/friends">Find friends</Link>
            <button type="button" className="account-secondary" onClick={invite}>{invited ? "Link copied" : "Invite a friend"}</button>
          </div>
        </section>
      ) : (
        <>
          <Part n={1} title="Who's watching with you?" hint="Pick up to three friends. Each votes from their own phone."
            aside={<span className="text-xs text-slate-500">{`${chosen.length}/3`}</span>}>
            <div className="tonight-friends">
              {friends.map((f) => {
                const on = chosen.includes(f.id);
                const full = !on && chosen.length >= 3;
                return (
                  <button key={f.id} type="button" aria-pressed={on} disabled={full} onClick={() => toggleFriend(f.id)} className="tonight-friend">
                    <span className="relative">
                      <UserAvatar user={f} name={f.display_name} className="tonight-avatar" />
                      {on && <Check className="tonight-friend-check" aria-hidden="true" />}
                    </span>
                    <span className="max-w-full truncate text-xs font-medium" translate="no">{f.display_name}</span>
                  </button>
                );
              })}
            </div>
            {chosen.length >= 3 && <p className="text-xs text-slate-500">The group is full</p>}
          </Part>

          <Part n={2} title="What are you in the mood for?">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[[null, "Surprise us", Sparkles, "Whatever suits the group best"], ...Object.entries(MOODS).map(([key, m]) => [key, m.label, MOOD_ICONS[key], MOOD_HINTS[key]])].map(([key, label, Icon, hint]) => {
                const on = answers.mood === key || (!answers.mood && key === null);
                return (
                  <button key={key || "any"} type="button" aria-pressed={on} onClick={() => setAnswer("mood", key)} className="tonight-mood" title={hint}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                    <span className="text-sm font-semibold leading-tight">{label}</span>
                    <span className="text-[11px] leading-snug opacity-70">{hint}</span>
                  </button>
                );
              })}
            </div>
          </Part>

          <Part n={3} title="How much time do you have?">
            <Segmented label="How much time do you have?" value={answers.time} onChange={(v) => setAnswer("time", v)}
              options={Object.entries(TIMES).map(([key, t]) => [key, t.label, null, TIME_ICONS[key]])} />
          </Part>

          <Part n={4} title="Where will you watch?" hint={serviceNames.length ? `On ${serviceNames.join(", ")}` : `Any service in ${place}`}>
            {catalogue.length ? (
              <div className="tonight-services">
                {catalogue.map((p) => {
                  const on = services.includes(p.provider_id);
                  return (
                    <button key={p.provider_id} type="button" onClick={() => toggleService(p.provider_id)} title={p.provider_name} aria-pressed={on} aria-label={p.provider_name}>
                      <img alt="" src={`https://image.tmdb.org/t/p/w92${p.logo_path}`} />
                      {on && <Check className="tonight-service-check" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            ) : <p className="text-sm text-slate-500"><Tv className="mr-1 inline h-4 w-4" />Streaming services could not be loaded; any service will do.</p>}
            <Toggle checked={options.rent} onChange={(v) => setOption("rent", v)}>Also films to rent or buy on these services</Toggle>
          </Part>

          <details className="tonight-more">
            <summary>
              <span className="font-semibold">More options</span>
              <span className="min-w-0 flex-1 truncate text-right text-xs text-slate-500">{extras.length ? extras.join(" · ") : "No limits"}</span>
            </summary>
            <div className="space-y-4 pt-3">
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-slate-500">Anything you'd rather avoid?</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(AVOIDABLE).map(([id, name]) => {
                    const on = options.avoid.includes(Number(id));
                    return <Chip key={id} active={on} onClick={() => setOption("avoid", on ? options.avoid.filter((g) => g !== Number(id)) : [...options.avoid, Number(id)])}>{on ? "✕ " : ""}{name}</Chip>;
                  })}
                </div>
              </div>
              <Toggle checked={options.gentle} onChange={(v) => setOption("gentle", v)}>A gentle night: no horror, thrillers, crime or war</Toggle>
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

          {/* Always in reach: what the night is so far, and the button to start it. */}
          <div className="tonight-bar">
            <div className="mx-auto flex max-w-2xl items-center gap-3 px-4">
              <p className="min-w-0 flex-1 text-xs text-slate-600 dark:text-slate-300">
                {error ? <span role="alert" className="text-red-600">{error}</span> : chosen.length ? <span className="line-clamp-2">{recap}</span> : "Pick at least one friend to start"}
              </p>
              <button className="account-button inline-flex shrink-0 items-center gap-1.5" disabled={busy || !chosen.length} onClick={startVote}>
                {busy ? "Finding films for everyone…" : <>Start the vote <ArrowRight className="h-4 w-4" /></>}
              </button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
