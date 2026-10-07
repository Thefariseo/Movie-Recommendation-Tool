import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { Check, Globe, Lock, Pencil, Plus, Share2, Star, Trash2, X } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import useWatched from "../hooks/useWatched";
import useWatchlist from "../hooks/useWatchlist";
import { useModal } from "../hooks/useModal";
import { backend } from "../utils/backend";
import { movieDetails } from "../utils/api";
import { changeList, listUrl, shareLink } from "../utils/lists";
import { loadTasteSpace } from "../utils/tasteSpace";
import { whenStill } from "../utils/motion";
import { ratingPredictor } from "../../shared/predict.js";
import { PageHeaderSkeleton, PosterGridSkeleton } from "../components/Skeletons";
import FilmTitle from "../components/FilmTitle";

const poster = (f) => (f?.poster_path ? `https://image.tmdb.org/t/p/w342${f.poster_path}` : "/placeholder_poster.svg");
const stars = (r) => `${Math.round(Number(r)) / 2}★`;
// The first posters, which a list's card grows into (src/hooks/useSmoothNavigation.js).
const morphTarget = (rank) => (rank <= 5 ? `list-film-${rank - 1}` : undefined);

function Film({ film, rank, mine, seen, predicted, onRemove }) {
  const { open } = useModal();
  const { isInWatchlist, addToWatchlist } = useWatchlist();
  const saved = isInWatchlist(Number(film.id));
  const show = async () => { try { open(await movieDetails(film.id)); } catch { open(film); } };
  return (
    <li className="flex flex-col">
      <button type="button" data-film-id={film.id} onClick={show} className="relative block text-left" aria-label={`Open ${film.title}`}>
        <img src={poster(film)} alt="" loading="lazy" data-morph-target={morphTarget(rank)} className="w-full object-cover" style={{ aspectRatio: "2 / 3" }} />
        <span className="absolute left-0 top-0 bg-black/75 px-2 py-0.5 text-xs font-semibold text-white">{rank}</span>
        <span className="film-title" translate="no"><FilmTitle film={film} /></span>
      </button>
      <span className="text-xs text-slate-500">{film.year || ""}</span>
      {film.note && <span className="mt-1 font-serif text-sm italic text-slate-700 dark:text-slate-300" translate="no">{film.note}</span>}
      <span className="mt-auto flex items-center gap-2 pt-1.5 text-xs">
        {seen != null ? <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400"><Check className="h-3 w-3" />{seen ? `You gave ${stars(seen)}` : "Seen"}</span>
          : predicted != null ? <span className="inline-flex items-center gap-1 font-semibold text-indigo-700 dark:text-indigo-300"><Star className="h-3 w-3 fill-current" />{`For you ≈ ${stars(predicted)}`}</span> : null}
        {mine ? <button type="button" onClick={onRemove} className="ml-auto text-slate-400 hover:text-rose-600" aria-label={`Remove ${film.title} from the list`}><X className="h-4 w-4" /></button>
          : seen == null && <button type="button" data-pop disabled={saved} onClick={() => addToWatchlist({ ...film, id: Number(film.id) })} className="ml-auto text-slate-400 hover:text-indigo-600 disabled:text-emerald-600" aria-label={saved ? "On your watchlist" : "Save to watchlist"}>{saved ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}</button>}
      </span>
    </li>
  );
}

// A list's page before it loads, drawn from what its card showed: the title,
// the words and the first posters, in the places they will keep.
function Arriving({ hint }) {
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 pb-24 pt-6" aria-busy="true">
      <header className="space-y-3">
        <p className="eyebrow flex items-center gap-1.5">
          {hint.public ? <Globe className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
          {hint.public ? "A list" : "A private list"}
        </p>
        <h1 className="font-display text-4xl sm:text-5xl" translate="no" data-morph-target="list-title">{hint.title}</h1>
        {hint.description && <p className="max-w-3xl font-serif text-lg leading-relaxed text-slate-700 dark:text-slate-300" translate="no">{hint.description}</p>}
        <p className="text-sm text-slate-500">{`${hint.count} films`}</p>
        {/* The buttons it will have, still asleep, so nothing moves when they wake. */}
        <div className="flex flex-wrap gap-2" aria-hidden="true">
          {hint.public && <button type="button" tabIndex={-1} disabled className="account-button inline-flex items-center gap-1.5"><Share2 className="h-4 w-4" /> Share</button>}
          {hint.mine && <button type="button" tabIndex={-1} disabled className="account-secondary inline-flex items-center gap-1.5"><Pencil className="h-4 w-4" /> Edit</button>}
          {hint.mine && <button type="button" tabIndex={-1} disabled className="account-secondary inline-flex items-center gap-1.5"><Trash2 className="h-4 w-4" /> Delete</button>}
        </div>
      </header>
      <ol className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4 lg:grid-cols-6">
        {hint.films.map((f, i) => (
          <li key={f.id} className="space-y-2">
            {/* The card's own smaller poster, already here, until the larger one arrives. */}
            <img src={poster(f)} alt="" data-no-fade data-morph-target={morphTarget(i + 1)} className="w-full bg-cover object-cover"
              style={{ aspectRatio: "2 / 3", backgroundImage: f.poster_path ? `url("https://image.tmdb.org/t/p/w154${f.poster_path}")` : undefined }} />
            <div className="skeleton h-3 w-3/4" aria-hidden="true" />
          </li>
        ))}
      </ol>
    </main>
  );
}

/** A film list as anyone with the link sees it; its owner can edit it here too. */
export default function ListPage() {
  const { id } = useParams();
  const { state } = useLocation();
  const hint = state?.list && String(state.list.id) === id ? state.list : null;
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addToast } = useToast();
  const { watched } = useWatched();
  const [list, setList] = useState(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: "", description: "", public: true });
  const [space, setSpace] = useState(null);

  useEffect(() => {
    backend(`social?list=${encodeURIComponent(id)}`).then((d) => whenStill().then(() => setList(d.list))).catch((e) => setError(e.message));
  }, [id, user?.id]);
  useEffect(() => { loadTasteSpace().then(setSpace); }, []);
  useEffect(() => { if (list) document.title = `${list.title} · Umbrify`; return () => { document.title = "Umbrify"; }; }, [list]);

  const mine = useMemo(() => new Map(watched.map((f) => [Number(f.id), Number(f.rated) || 0])), [watched]);
  const predictor = useMemo(() => (space && watched.some((f) => Number(f.rated) > 0) ? ratingPredictor(space, watched) : null), [space, watched]);
  const predicted = (fid) => { const p = predictor?.predict(fid); return p && p.support > 0.3 ? p.rating : null; };

  if (error) return <main className="mx-auto max-w-3xl p-4"><p className="account-panel text-sm text-rose-600">{error}</p></main>;
  if (!list && hint) return <Arriving hint={hint} />;
  if (!list) return <main className="mx-auto max-w-6xl space-y-6 px-4 pb-24 pt-6"><PageHeaderSkeleton /><PosterGridSkeleton className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4 lg:grid-cols-6" /></main>;

  const seenCount = list.films.filter((f) => mine.has(Number(f.id))).length;
  const save = async (patch) => {
    try {
      const { list: saved } = await changeList("list-save", { list: { ...list, ...patch } });
      setList(saved);
      setEditing(false);
    } catch (e) { addToast(e.message, "error"); }
  };
  const remove = async (film) => {
    try { setList((await changeList("list-remove", { id: list.id, movie_id: Number(film.id) })).list); } catch (e) { addToast(e.message, "error"); }
  };
  const share = async () => {
    try { addToast((await shareLink(listUrl(list.id), list.title)) === "copied" ? "Link copied" : "Shared", "success"); } catch { /* closed */ }
  };
  const destroy = async () => {
    if (!window.confirm("Delete this list?")) return;
    await changeList("list-delete", { id: list.id });
    navigate("/library/lists");
  };

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 pb-24 pt-6">
      <header className="space-y-3">
        <p className="eyebrow flex items-center gap-1.5">
          {list.public ? <Globe className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
          {list.public ? "A list" : "A private list"} · <span translate="no">{list.owner_name || "An Umbrify member"}</span>
        </p>
        {editing ? (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save(draft); }}>
            <input className="account-input font-display text-2xl" value={draft.title} maxLength={100} required onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} aria-label="Title" />
            <textarea className="account-input" rows={3} maxLength={600} value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} placeholder="What ties these films together?" aria-label="Description" />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.public} onChange={(e) => setDraft((d) => ({ ...d, public: e.target.checked }))} /> Anyone with the link can see it</label>
            <div className="flex gap-2"><button className="account-button">Save</button><button type="button" className="account-secondary" onClick={() => setEditing(false)}>Cancel</button></div>
          </form>
        ) : (
          <>
            <h1 className="font-display text-4xl sm:text-5xl" translate="no" data-morph-target="list-title">{list.title}</h1>
            {list.description && <p className="max-w-3xl font-serif text-lg leading-relaxed text-slate-700 dark:text-slate-300" translate="no">{list.description}</p>}
            <p className="text-sm text-slate-500">{user && seenCount ? `${list.films.length} films · you have seen ${seenCount}` : `${list.films.length} films`}</p>
          </>
        )}
        {!editing && (
          <div className="flex flex-wrap gap-2">
            {list.public && <button className="account-button inline-flex items-center gap-1.5" onClick={share}><Share2 className="h-4 w-4" /> Share</button>}
            {list.mine && <button className="account-secondary inline-flex items-center gap-1.5" onClick={() => { setDraft({ title: list.title, description: list.description, public: list.public }); setEditing(true); }}><Pencil className="h-4 w-4" /> Edit</button>}
            {list.mine && <button className="account-secondary inline-flex items-center gap-1.5" onClick={destroy}><Trash2 className="h-4 w-4" /> Delete</button>}
          </div>
        )}
      </header>
      {!list.films.length && <p className="account-panel text-sm text-slate-500">{list.mine ? "This list is empty. Open any film and use “Add to list”." : "This list is empty for now."}</p>}
      <ol className="rise stagger grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4 lg:grid-cols-6">
        {list.films.map((f, i) => (
          <Film key={f.id} film={f} rank={i + 1} mine={list.mine} seen={mine.has(Number(f.id)) ? mine.get(Number(f.id)) : null} predicted={predicted(f.id)} onRemove={() => remove(f)} />
        ))}
      </ol>
      {!user && (
        <section className="account-panel flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">Umbrify finds the films made for your taste, and lets you make lists like this one.</p>
          <Link to="/" className="account-button">Find your films</Link>
        </section>
      )}
    </main>
  );
}
