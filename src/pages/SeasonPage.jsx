import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CalendarDays, Check, Eye, Feather, Lock, MessageCircle, Users } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import useWatched from "../hooks/useWatched";
import { useModal } from "../hooks/useModal";
import { backend } from "../utils/backend";
import { movieDetails } from "../utils/api";
import UserAvatar from "../components/UserAvatar";
import { seasonWeek, weekOpens } from "../../shared/seasons.js";
import RichText from "../components/RichText";
import FilmTitle from "../components/FilmTitle";

const poster = (w) => (w?.poster_path ? `https://image.tmdb.org/t/p/w185${w.poster_path}` : "/placeholder_poster.svg");
const day = (d) => d.toLocaleDateString(document.documentElement.lang || undefined, { weekday: "short", day: "numeric", month: "short" });

function Note({ mine, onSave }) {
  const [text, setText] = useState(mine || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => setText(mine || ""), [mine]);
  const save = async () => {
    setSaving(true);
    try { await onSave(text); setSaved(true); setTimeout(() => setSaved(false), 1500); } finally { setSaving(false); }
  };
  return (
    <div className="space-y-1.5">
      <textarea className="account-input w-full resize-none text-sm" rows={2} maxLength={600} value={text} onChange={(e) => setText(e.target.value)}
        placeholder="Your take, for the others in the season…" aria-label="Your note on this film" />
      <div className="flex items-center gap-2">
        <button className="account-secondary text-xs" disabled={saving || text.trim() === (mine || "")} onClick={save}>{mine ? "Update note" : "Share note"}</button>
        {saved && <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><Check className="h-3 w-3" /> Saved</span>}
      </div>
    </div>
  );
}

function Week({ week, k, season, open, current, me, people, data, seen, onSave }) {
  const { open: openFilm } = useModal();
  const opens = weekOpens(season, k);
  const notes = data.notes.filter((n) => Number(n.movie_id) === week.id);
  const mine = notes.find((n) => n.user_id === me)?.note;
  const ratings = data.ratings.filter((r) => r.movie_id === week.id);
  const name = (id) => people.get(id)?.display_name || "A friend";
  const ask = `In my cinema season "${season.season.title}", week ${k + 1} is ${week.title}${week.year ? ` (${week.year})` : ""}. ${week.question}`;
  const showFilm = async () => { try { openFilm(await movieDetails(week.id)); } catch { /* the film sheet is optional */ } };
  if (!open) {
    return (
      <li className="flex items-center gap-3 rounded-xl border border-dashed border-slate-200 p-3 text-sm text-slate-500 dark:border-slate-700">
        <Lock className="h-4 w-4 shrink-0" />
        <span>{`Week ${k + 1} opens ${day(opens)}`}</span>
      </li>
    );
  }
  return (
    <li className={`account-panel space-y-3 ${current ? "ring-2 ring-indigo-400" : ""}`}>
      <div className="flex gap-4">
        <button type="button" data-film-id={week.id} onClick={showFilm} className="w-24 shrink-0 sm:w-28" aria-label={`Open ${week.title}`}>
          <img loading="lazy" decoding="async" src={poster(week)} alt="" className="w-full rounded-lg object-cover shadow" style={{ aspectRatio: "2 / 3" }} />
        </button>
        <div className="min-w-0 space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">{`Week ${k + 1}${current ? " · this week" : ""}`}</p>
          <h3 className="text-lg font-semibold leading-tight" translate="no"><FilmTitle film={week} /> {week.year && <span className="font-normal text-slate-500">({week.year})</span>}</h3>
          {seen && <p className="inline-flex items-center gap-1 text-xs text-emerald-600"><Check className="h-3 w-3" /> You have watched it</p>}
          <p className="text-sm"><RichText>{week.intro}</RichText></p>
          {week.watch_for && <p className="flex gap-1.5 text-sm text-slate-600 dark:text-slate-300"><Eye className="mt-0.5 h-4 w-4 shrink-0" /> <span><span className="font-medium">Watch for:</span> {week.watch_for}</span></p>}
        </div>
      </div>
      <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/50">
        <p className="font-medium">To talk over: {week.question}</p>
        <Link to={`/critic?ask=${encodeURIComponent(ask)}`} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline"><Feather className="h-3 w-3" /> Discuss it with your critic</Link>
      </div>
      {(notes.some((n) => n.user_id !== me) || ratings.some((r) => r.user_id !== me)) && (
        <ul className="space-y-2">
          {[...people.keys()].filter((id) => id !== me).map((id) => {
            const note = notes.find((n) => n.user_id === id);
            const rated = ratings.find((r) => r.user_id === id);
            if (!note && !rated) return null;
            return (
              <li key={id} className="flex gap-2 text-sm">
                <UserAvatar user={people.get(id)} name={name(id)} className="bell-avatar" />
                <span>
                  <span className="font-medium">{name(id)}</span>{rated?.rating ? <span className="text-slate-500"> · {rated.rating}/10</span> : rated ? <span className="text-slate-500"> · watched</span> : null}
                  {note && <span className="block text-slate-700 dark:text-slate-300"><RichText>{note.note}</RichText></span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <Note mine={mine} onSave={(text) => onSave(week.id, text)} />
    </li>
  );
}

/** One cinema season: the weeks open so far, everyone's notes, and the weeks to come. */
export default function SeasonPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { watched } = useWatched();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    backend(`critic?season=${encodeURIComponent(id)}`).then(setData).catch((e) => setError(e.message));
  }, [id, user?.id]);

  if (!user && !authLoading) return <main className="mx-auto max-w-3xl p-4"><p className="account-panel text-sm">Sign in to follow this cinema season. <Link className="font-medium text-indigo-600 hover:underline" to="/profile">Sign in</Link></p></main>;
  if (error) return <main className="mx-auto max-w-3xl p-4"><p className="account-panel text-sm text-rose-600">{error}</p></main>;
  if (!data) return <main className="mx-auto max-w-3xl p-4"><p className="text-sm text-slate-500" role="status">Opening the season…</p></main>;

  const season = data.season;
  const { current, open, finished } = seasonWeek(season);
  const people = new Map(data.people.map((p) => [p.id, p]));
  const n = season.season.weeks.length;
  const seenIds = new Set(watched.map((m) => Number(m.id)));
  const host = season.host === user.id;
  const save = async (movieId, note) => setData(await backend("critic", { action: "season-note", id: season.id, movie_id: movieId, note }));
  const leave = async () => {
    if (!window.confirm(host ? "End this season for everyone?" : "Leave this season?")) return;
    await backend("critic", { action: "season-leave", id: season.id });
    navigate("/library/journeys");
  };

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4">
      <header className="space-y-3">
        <p className="eyebrow flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" /> {finished ? "CINEMA SEASON · COMPLETE" : `CINEMA SEASON · WEEK ${current + 1} OF ${n}`}</p>
        <h1 className="font-display text-3xl sm:text-4xl" translate="no">{season.season.title}</h1>
        <p className="text-slate-600 dark:text-slate-300"><RichText>{season.season.introduction}</RichText></p>
        {season.season.by === "critic" && <p className="inline-flex items-center gap-1 text-xs text-slate-500"><Feather className="h-3 w-3" /> Introduced by your critic</p>}
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden="true"><div className="h-full bg-indigo-500" style={{ width: `${(100 * open) / n}%` }} /></div>
        <ul className="flex flex-wrap gap-3" aria-label="Who follows the season">
          {season.members.map((m) => (
            <li key={m} className="flex items-center gap-2 text-sm">
              <UserAvatar user={people.get(m)} name={people.get(m)?.display_name} className="bell-avatar" />
              <span>{m === user.id ? "You" : people.get(m)?.display_name || "A friend"}<span className="block text-xs text-slate-500">{`${(data.progress[m] || []).length}/${n} watched`}</span></span>
            </li>
          ))}
        </ul>
        {season.members.length === 1 && <p className="inline-flex items-center gap-1 text-xs text-slate-500"><Users className="h-3 w-3" /> A season of your own. Start the next one with friends to compare notes each week.</p>}
      </header>
      <ol className="space-y-4">
        {season.season.weeks.map((w, k) => (
          <Week key={w.id} week={w} k={k} season={season} open={k < open} current={!finished && k === current} me={user.id} people={people} data={data} seen={seenIds.has(w.id)} onSave={save} />
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4 text-sm dark:border-slate-700">
        <Link to="/critic" className="inline-flex items-center gap-1 text-indigo-600 hover:underline"><MessageCircle className="h-4 w-4" /> Talk to your critic</Link>
        <button onClick={leave} className="text-slate-500 hover:underline">{host ? "End the season" : "Leave the season"}</button>
      </div>
    </main>
  );
}
