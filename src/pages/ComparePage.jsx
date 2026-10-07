import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, Sparkles } from "lucide-react";
import useWatched from "../hooks/useWatched";
import { useModal } from "../hooks/useModal";
import { loadTasteSpace } from "../utils/tasteSpace";
import { usePosters, posterUrl } from "../utils/posters";
import { decodeTaste, compareTastes } from "../../shared/tasteCard.js";
import { track } from "../utils/events";
import { t } from "../i18n/index.js";

// Enough of the visitor's own ratings for a comparison worth reading.
const ENOUGH = 5;

function Films({ ids, label }) {
  const films = usePosters(ids);
  const { open } = useModal();
  if (!ids.length) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{label}</h2>
      <div className="compare-films">
        {ids.map((id) => (
          <button key={id} type="button" data-film-id={id} onClick={() => films[id] && open(films[id])} className="text-left">
            <span className="guest-poster">{posterUrl(films[id]) && <img alt="" src={posterUrl(films[id])} />}</span>
            <span className="mt-1 block truncate text-xs font-medium" translate="no">{films[id]?.title || ""}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/**
 * A friend's taste link (src/pages/TasteCardPage.jsx), opened: how close the
 * visitor's taste is to theirs, the films both loved, the films the friend
 * loved that the visitor has not seen, and where they disagree. A visitor
 * with too few ratings first rates a few films they know.
 */
export default function ComparePage() {
  const [params] = useSearchParams();
  const code = params.get("t") || "";
  const theirs = useMemo(() => decodeTaste(code), [code]);
  const { watched } = useWatched();
  const mine = useMemo(() => watched.filter((m) => Number(m.rated) > 0).map((m) => ({ id: Number(m.id), title: m.title, rated: Number(m.rated) })), [watched]);
  const [space, setSpace] = useState(undefined);
  useEffect(() => { track("compare_open"); loadTasteSpace().then(setSpace); }, []);
  const result = useMemo(() => (space && theirs && mine.length >= ENOUGH ? compareTastes(space, mine, theirs.films) : null), [space, theirs, mine]);
  useEffect(() => { if (result) track("compare_done"); }, [!!result]); // eslint-disable-line react-hooks/exhaustive-deps
  const who = theirs?.name || t("your friend");

  if (!theirs) return (
    <main className="taste-card-page">
      <section className="account-panel space-y-3">
        <h1 className="font-display text-2xl uppercase">This link does not hold a taste</h1>
        <p className="text-sm text-slate-500">Ask for the link again, or make your own taste card.</p>
        <Link to="/taste" className="account-button inline-flex">Make my taste card</Link>
      </section>
    </main>
  );
  return (
    <main className="taste-card-page">
      <header className="space-y-2">
        <p className="eyebrow flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> TASTE MATCH</p>
        <h1 className="font-display text-2xl uppercase sm:text-3xl">
          {theirs.name
            ? <><span>How close is your taste to</span> <span translate="no">{theirs.name}</span><span>?</span></>
            : <span>How close is your taste to theirs?</span>}
        </h1>
        <p className="text-sm text-slate-500">{`${theirs.films.length} films from their card, compared with yours on the map of cinema.`}</p>
      </header>
      {mine.length < ENOUGH ? (
        <section className="account-panel space-y-3">
          <h2 className="text-lg font-semibold">{mine.length ? `Rate ${ENOUGH - mine.length} more films to see your match` : `Rate ${ENOUGH} films you have seen to see your match`}</h2>
          <p className="text-sm text-slate-500">A minute, with films nearly everyone has seen. No account needed.</p>
          <Link to={`/rate?next=${encodeURIComponent(`/compare?t=${code}`)}`} className="account-button inline-flex">Rate films you know <ArrowRight size={16} aria-hidden="true" /></Link>
          <Films ids={theirs.films.filter((f) => f.rated >= 8).slice(0, 8).map((f) => f.id)} label={`Films ${who} loved`} />
        </section>
      ) : space === undefined ? (
        <div className="skeleton h-40" role="status" aria-label="Comparing" />
      ) : !result ? (
        <section className="account-panel"><p className="text-sm text-slate-500">These films are too little known to compare. Rate a few more well-known ones.</p></section>
      ) : (
        <>
          <section className="compare-match">
            <strong>{`${result.match}%`}</strong>
            <span>{result.label}</span>
            {result.shared > 0 && <small>{`${result.shared} films you have both rated · you agree on ${result.agree}`}</small>}
          </section>
          <Films ids={result.bothLoved} label="You both loved" />
          <Films ids={result.toSee} label={`${who} loved these, and you have not seen them`} />
          {result.biggest && (
            <section className="account-panel text-sm">
              <span>Where you part ways:</span>{" "}
              <strong translate="no">{result.biggest.title}</strong>{" "}
              <span>{`(you ${result.biggest.you / 2}★, them ${result.biggest.them / 2}★)`}</span>
            </section>
          )}
        </>
      )}
      <section className="account-panel flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm">Make your own card and send it back.</span>
        <Link to="/taste" className="account-secondary inline-flex">Make my taste card <ArrowRight size={16} aria-hidden="true" /></Link>
      </section>
    </main>
  );
}
