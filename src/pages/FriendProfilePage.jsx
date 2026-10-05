import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CalendarDays, Clapperboard, Heart, Send, Sparkles, Star, Swords, UserCheck, UserPlus } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import useWatched from "../hooks/useWatched";
import useWatchlist from "../hooks/useWatchlist";
import { useModal } from "../hooks/useModal";
import { backend } from "../utils/backend";
import { movieDetails } from "../utils/api";
import { forgetSocial } from "../utils/friends";
import { loadTasteSpace } from "../utils/tasteSpace";
import { loadTasteMap } from "../utils/tasteMap";
import UserAvatar from "../components/UserAvatar";
import { tasteOf, closeness, closenessLabel, regionTaste, divergences, disputed, friendOverview } from "../../shared/social.js";
import { ratingPredictor } from "../../shared/predict.js";
import { regionName } from "../../shared/journeys.js";
import Rail from "../components/Rail";
import { PageHeaderSkeleton, PosterGridSkeleton } from "../components/Skeletons";

const poster = (m, size = "w185") => (m?.poster_path ? `https://image.tmdb.org/t/p/${size}${m.poster_path}` : "/placeholder_poster.svg");
const stars = (r) => `${Number(r) / 2}★`;
const diary = (rows) => rows.filter((r) => r.kind === "watched").map((r) => ({ ...r.movie, id: Number(r.movie_id), rated: r.rating, _updated: r.updated_at }));
const saved = (rows) => rows.filter((r) => r.kind === "watchlist").map((r) => ({ ...r.movie, id: Number(r.movie_id) }));

function Film({ film, caption, children }) {
  const { open } = useModal();
  const show = async () => { try { open(await movieDetails(film.id)); } catch { open(film); } };
  return (
    <li className="w-28 shrink-0 sm:w-32">
      <button type="button" onClick={show} className="block w-full text-left" aria-label={`Open ${film.title}`}>
        <img loading="lazy" decoding="async" src={poster(film)} alt="" className="w-full rounded-lg object-cover shadow-sm" style={{ aspectRatio: "2 / 3" }} />
        <span className="mt-1 block truncate text-xs font-semibold" translate="no">{film.title}</span>
      </button>
      {caption && <span className="block text-[11px] leading-tight text-slate-500">{caption}</span>}
      {children}
    </li>
  );
}

function Row({ icon: Icon, title, hint, films, render, empty }) {
  return (
    <section className="space-y-2">
      <div>
        <h2 className="section-title flex items-center gap-1.5 !text-lg">{Icon && <Icon className="h-4 w-4 text-indigo-500" />}{title}</h2>
        {hint && <p className="text-sm text-slate-500">{hint}</p>}
      </div>
      {films.length ? <Rail as="ul" className="flex gap-3 overflow-x-auto pb-2">{films.map(render)}</Rail> : empty && <p className="text-sm text-slate-500">{empty}</p>}
    </section>
  );
}

/** A friend's page: how your tastes meet, what they hold for you, and what to do together. */
export default function FriendProfilePage() {
  const { id } = useParams();
  const { user, loading: authLoading } = useAuth();
  const { addToast } = useToast();
  const { watched } = useWatched();
  const { watchlist } = useWatchlist();
  const [view, setView] = useState(null);
  const [error, setError] = useState("");
  const [model, setModel] = useState(null);
  const [disputes, setDisputes] = useState({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(() => new Set());

  const load = () => backend(`social?person=${encodeURIComponent(id)}`).then(setView).catch((e) => setError(e.message));
  useEffect(() => { if (user) load(); }, [id, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    Promise.all([loadTasteSpace(), loadTasteMap()]).then(([space, atlas]) => space && atlas && setModel({ space, ...atlas }));
  }, []);

  const theirs = useMemo(() => (view ? diary(view.rows) : []), [view]);
  const theirList = useMemo(() => (view ? saved(view.rows) : []), [view]);
  const taste = useMemo(() => {
    if (!model || !theirs.length) return null;
    const me = tasteOf(model.space, watched), them = tasteOf(model.space, theirs, theirList.map((f) => f.id));
    if (!me || !them) return { me, them, match: null };
    const match = closeness(model.space, me, them);
    const split = divergences(model.regions, regionTaste(model.space, model.map, model.regions, me.z), regionTaste(model.space, model.map, model.regions, them.z), { limit: 3 });
    const seen = new Set([...watched, ...theirs].map((f) => Number(f.id)));
    return { me, them, match, label: closenessLabel(match), split, fight: disputed(model.space, me, them, seen) };
  }, [model, theirs, theirList, watched]);
  const overview = useMemo(() => {
    const predictor = model ? ratingPredictor(model.space, watched) : null;
    return friendOverview(watched, theirs, watchlist, theirList, predictor ? (fid) => predictor.predict(fid) : null);
  }, [model, watched, theirs, watchlist, theirList]);
  // Your loved films they have not seen: one tap sends one.
  const forThem = useMemo(() => {
    const known = new Set(theirs.map((f) => Number(f.id)));
    return watched.filter((f) => Number(f.rated) >= 8 && !known.has(Number(f.id))).sort((a, b) => b.rated - a.rated).slice(0, 12);
  }, [watched, theirs]);

  useEffect(() => {
    const ids = [taste?.fight?.theirs?.id, taste?.fight?.yours?.id].filter((x) => x && !disputes[x]);
    if (!ids.length) return;
    Promise.allSettled(ids.map((x) => movieDetails(x))).then((rs) => {
      const next = {};
      rs.forEach((r, i) => { if (r.status === "fulfilled") next[ids[i]] = r.value; });
      setDisputes((d) => ({ ...d, ...next }));
    });
  }, [taste]); // eslint-disable-line react-hooks/exhaustive-deps

  const follow = async (on) => {
    setBusy(true);
    try {
      await backend("social", { action: on ? "follow" : "unfollow", user_id: id });
      forgetSocial();
      await load();
    } catch (e) {
      addToast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };
  const send = async (film) => {
    setSent((s) => new Set(s).add(film.id));
    try {
      await backend("social", { action: "recommend", to: [id], movie: film });
      addToast(`Sent ${film.title}`, "success");
    } catch (e) {
      setSent((s) => { const n = new Set(s); n.delete(film.id); return n; });
      addToast(e.message, "error");
    }
  };

  if (!user && !authLoading) return <main className="mx-auto max-w-3xl p-4"><p className="account-panel text-sm">Sign in to see your friends. <Link className="font-medium text-indigo-600 hover:underline" to="/profile">Sign in</Link></p></main>;
  if (error) return <main className="mx-auto max-w-3xl space-y-3 p-4"><Link to="/friends" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:underline"><ArrowLeft className="h-4 w-4" /> Friends</Link><p className="account-panel text-sm text-rose-600">{error}</p></main>;
  if (!view) return <main className="mx-auto max-w-3xl space-y-8 p-4 pt-10"><PageHeaderSkeleton /><PosterGridSkeleton count={6} className="grid grid-cols-3 gap-3 sm:grid-cols-6" /></main>;

  const { person, relation } = view;
  const name = person.display_name || "A friend";
  const self = person.id === user.id;
  const relationText = self ? "This is you" : relation.mutual ? "You follow each other" : relation.follower ? "Follows you" : relation.following ? "You follow them" : "Not connected yet";

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 pb-24 pt-6">
      <Link to="/friends" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:underline"><ArrowLeft className="h-4 w-4" /> Friends</Link>
      <header className="account-panel flex flex-wrap items-center gap-5">
        <UserAvatar user={person} name={name} className="profile-avatar" />
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="font-display text-3xl sm:text-4xl" translate="no">{name}</h1>
          <p className="text-sm text-slate-500">{relationText}</p>
          {view.shares && (
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600 dark:text-slate-300">
              <span>{`${overview.stats.rated} films rated`}</span>
              {overview.stats.mean != null && <span>{`average ${stars(overview.stats.mean)}`}</span>}
              <span>{`${overview.stats.loved} loved`}</span>
              <span>{`${overview.stats.watchlist} on their watchlist`}</span>
            </p>
          )}
        </div>
        {taste?.match != null && (
          <div className="text-right">
            <p className="text-4xl font-bold tabular-nums text-indigo-600 dark:text-indigo-300">{taste.match}%</p>
            <p className="text-sm text-slate-500">{taste.label}</p>
          </div>
        )}
        {!self && (
          <div className="flex w-full flex-wrap gap-2">
            {relation.following
              ? <button className="account-secondary inline-flex items-center gap-1.5" disabled={busy} onClick={() => follow(false)}><UserCheck className="h-4 w-4" /> Following</button>
              : <button className="account-button inline-flex items-center gap-1.5" disabled={busy} onClick={() => follow(true)}><UserPlus className="h-4 w-4" /> {relation.follower ? "Follow back" : "Follow"}</button>}
            {view.shares && <Link to={`/tonight?with=${person.id}`} className="account-secondary inline-flex items-center gap-1.5"><Clapperboard className="h-4 w-4" /> Plan a movie night</Link>}
            {view.shares && <Link to="/library/journeys" className="account-secondary inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" /> Start a season together</Link>}
          </div>
        )}
      </header>

      {!self && !view.shares && (
        <p className="account-panel text-sm text-slate-500">
          {relation.mutual ? `${name} keeps their activity private. Their films and how close your tastes are will appear here if they turn on sharing in their profile.` : "Follow each other and their films, how close your tastes are and what they would recommend you will appear here."}
        </p>
      )}

      {view.shares && (
        <>
          {taste?.split && (taste.split.shared.length > 0 || taste.split.theirs.length > 0 || taste.split.yours.length > 0) && (
            <section className="grid gap-3 sm:grid-cols-3">
              {[["Where you meet", taste.split.shared], [`${name}'s world, not yours`, taste.split.theirs], [`Yours, not ${name}'s`, taste.split.yours]].map(([title, rows]) => rows.length > 0 && (
                <div key={title} className="account-panel space-y-1 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
                  <ul className="space-y-0.5 text-sm">{rows.map((r) => <li key={r.region.id}>{regionName(r.region)}</li>)}</ul>
                </div>
              ))}
            </section>
          )}

          <Row icon={Sparkles} title={`${name}'s favourites for you`} hint="Films they loved that you have not seen, the best bets for your taste first."
            films={overview.favourites} empty="You have seen every film they loved. Impressive."
            render={(f) => <Film key={f.id} film={f} caption={f.predicted != null ? `${name}: ${stars(f.them)} · for you ≈ ${stars(f.predicted)}` : `${name}: ${stars(f.them)}`} />} />

          <Row icon={Heart} title="You both loved" films={overview.bothLoved} empty="No film you both loved yet."
            render={(f) => <Film key={f.id} film={f} caption={`you ${stars(f.you)} · ${name} ${stars(f.them)}`} />} />

          {overview.bothWant.length > 0 && (
            <Row icon={Clapperboard} title="You both want to see" hint="On both your watchlists: a movie night that plans itself."
              films={overview.bothWant} render={(f) => <Film key={f.id} film={f} />} />
          )}

          {(taste?.fight?.theirs || taste?.fight?.yours) && (
            <section className="space-y-2">
              <h2 className="section-title flex items-center gap-1.5 !text-lg"><Swords className="h-4 w-4 text-indigo-500" />{`The films you would argue about`}</h2>
              <ul className="flex gap-3">
                {taste.fight.theirs && disputes[taste.fight.theirs.id] && <Film film={disputes[taste.fight.theirs.id]} caption={`${name} would love it; it is far from your taste.`} />}
                {taste.fight.yours && disputes[taste.fight.yours.id] && <Film film={disputes[taste.fight.yours.id]} caption={`You would love it; it is far from ${name}'s.`} />}
              </ul>
            </section>
          )}

          <Row icon={Send} title={`Send ${name} a film`} hint="Films you loved that they have not seen. One tap and it lands in their inbox."
            films={forThem} empty="They have seen every film you loved."
            render={(f) => (
              <Film key={f.id} film={f} caption={`you ${stars(f.rated)}`}>
                <button type="button" disabled={sent.has(f.id)} onClick={() => send(f)} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline disabled:text-emerald-600 disabled:no-underline">
                  {sent.has(f.id) ? "Sent" : <><Send className="h-3 w-3" /> Send</>}
                </button>
              </Film>
            )} />

          {(view.received.length > 0 || view.sent.length > 0) && (
            <section className="grid gap-4 sm:grid-cols-2">
              {[[`${name} sent you`, view.received], [`You sent ${name}`, view.sent]].map(([title, list]) => list.length > 0 && (
                <div key={title} className="space-y-2">
                  <h2 className="section-title !text-lg">{title}</h2>
                  <ul className="space-y-2">
                    {list.slice(0, 6).map((r) => (
                      <li key={r.id} className="flex items-center gap-2 text-sm">
                        <img loading="lazy" decoding="async" src={poster(r.movie, "w92")} alt="" className="w-8 shrink-0 rounded" style={{ aspectRatio: "2 / 3" }} />
                        <span className="min-w-0"><span className="block truncate font-medium" translate="no">{r.movie?.title}</span>{r.note && <span className="block truncate text-xs italic text-slate-500" translate="no">“{r.note}”</span>}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          )}

          <Row icon={Star} title="Lately" films={[...theirs].sort((a, b) => String(b._updated).localeCompare(String(a._updated))).slice(0, 12)}
            render={(f) => <Film key={f.id} film={f} caption={f.rated ? stars(f.rated) : "watched"} />} />
        </>
      )}
    </main>
  );
}
