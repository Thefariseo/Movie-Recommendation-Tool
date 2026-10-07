import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Download, Link2, Share2, Sparkles } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import useWatched from "../hooks/useWatched";
import { loadTasteSpace } from "../utils/tasteSpace";
import { loadTasteMap } from "../utils/tasteMap";
import { movieCore, personDetails } from "../utils/api";
import { drawTasteCard } from "../utils/tasteCardImage";
import { encodeTaste, tasteSummary } from "../../shared/tasteCard.js";
import { track } from "../utils/events";

// Enough rated films for a card that says something.
const ENOUGH = 5;

const latin = (s) => /^[\p{Script=Latin}\p{P}\p{Zs}\d]+$/u.test(s || "");

// The directors of the member's best-rated films, those who come back most
// first, their names in Latin letters (TMDB keeps 봉준호 as both name and
// original name; its Latin spellings are among the person's other names).
async function favouriteDirectors(films) {
  const top = [...films].filter((f) => Number(f.rated) >= 7).sort((a, b) => b.rated - a.rated).slice(0, 15);
  const details = await Promise.allSettled(top.map((f) => movieCore(f.id)));
  const score = new Map();
  details.forEach((r, i) => {
    if (r.status !== "fulfilled") return;
    for (const p of (r.value.credits?.crew || []).filter((c) => c.job === "Director")) {
      const d = score.get(p.id) || { name: latin(p.name) || !latin(p.original_name) ? p.name : p.original_name, id: p.id, score: 0 };
      d.score += Number(top[i].rated) - 6;
      score.set(p.id, d);
    }
  });
  const best = [...score.values()].sort((a, b) => b.score - a.score).slice(0, 3);
  return Promise.all(best.map(async (d) => {
    if (latin(d.name)) return d.name;
    const person = await personDetails(d.id).catch(() => null);
    return (person?.also_known_as || []).find(latin) || d.name;
  }));
}

/**
 * "My cinema": the member's taste as an image to share (the map of cinema
 * with their films on it, their home territory, the directors and films that
 * define them) and a link that tells whoever opens it how close their own
 * taste is (src/pages/ComparePage.jsx).
 */
export default function TasteCardPage() {
  const { user, profile } = useAuth();
  const { watched } = useWatched();
  const rated = useMemo(() => watched.filter((m) => Number(m.rated) > 0), [watched]);
  const [name, setName] = useState(profile?.display_name || "");
  const [image, setImage] = useState(null);
  const [blob, setBlob] = useState(null);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const canvas = useRef(null);
  useEffect(() => { if (profile?.display_name) setName((n) => n || profile.display_name); }, [profile?.display_name]);
  useEffect(() => { track("taste_card_open"); }, []);
  const link = useMemo(() => `${window.location.origin}/compare?t=${encodeTaste(rated, name)}`, [rated, name]);

  useEffect(() => {
    if (rated.length < ENOUGH) return undefined;
    let alive = true;
    const timer = setTimeout(async () => {
      const [space, atlas, directors] = await Promise.all([loadTasteSpace(), loadTasteMap(), favouriteDirectors(rated)]);
      if (!alive) return;
      if (!space || !atlas) { setFailed(true); return; }
      const summary = tasteSummary(space, atlas.map, atlas.regions, rated);
      const el = canvas.current || document.createElement("canvas");
      canvas.current = el;
      await drawTasteCard(el, { name: name.trim(), space, map: atlas.map, films: rated, summary, directors });
      if (!alive) return;
      setImage(el.toDataURL("image/png"));
      el.toBlob((b) => alive && setBlob(b), "image/png");
    }, 300);
    return () => { alive = false; clearTimeout(timer); };
  }, [rated.length, name]); // eslint-disable-line react-hooks/exhaustive-deps

  const file = blob ? new File([blob], "my-cinema-umbrify.png", { type: "image/png" }) : null;
  const canShareFile = !!(file && navigator.canShare?.({ files: [file] }));
  const share = async () => {
    track("taste_card_share");
    try {
      if (canShareFile) await navigator.share({ files: [file], text: `${link}` });
      else if (navigator.share) await navigator.share({ title: "Umbrify", url: link });
      else { await navigator.clipboard.writeText(link); setCopied(true); }
    } catch { /* closed */ }
  };
  const copy = async () => {
    track("taste_card_share");
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* blocked */ }
  };

  if (rated.length < ENOUGH) return (
    <main className="taste-card-page">
      <section className="account-panel space-y-3">
        <p className="eyebrow flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> MY CINEMA</p>
        <h1 className="font-display text-2xl uppercase">Your taste card needs a few more ratings</h1>
        <p className="text-sm text-slate-500">{rated.length ? `Rate ${ENOUGH - rated.length} more films and your card is ready to share.` : `Rate ${ENOUGH} films you have seen and your card is ready to share.`}</p>
        <Link to="/rate" className="account-button inline-flex">Rate films you know</Link>
      </section>
    </main>
  );
  return (
    <main className="taste-card-page">
      <header className="space-y-2">
        <p className="eyebrow flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> MY CINEMA</p>
        <h1 className="font-display text-2xl uppercase sm:text-3xl">Your taste, on one card</h1>
        <p className="text-sm text-slate-500">Share it, and send the link: whoever opens it sees how close their taste is to yours.</p>
      </header>
      <div className="taste-card-layout">
        <div className="taste-card-image">
          {image ? <img src={image} alt="Your taste card: your films on the map of cinema, your home territory, the directors and films that define you." /> : failed ? <p className="p-6 text-sm text-slate-500">The map could not be loaded. Try again in a moment.</p> : <div className="skeleton h-full w-full" role="status" aria-label="Drawing your card" />}
        </div>
        <div className="space-y-4">
          <label className="account-label">
            Name on the card
            <input className="account-input" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} placeholder="Optional" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="account-button inline-flex" onClick={share} disabled={!image}><Share2 size={16} aria-hidden="true" /> Share my card</button>
            {image && <a className="account-secondary inline-flex" href={image} download="my-cinema-umbrify.png" onClick={() => track("taste_card_share")}><Download size={16} aria-hidden="true" /> Download</a>}
          </div>
          <div className="space-y-2">
            <p className="text-sm font-semibold">Compare your taste with a friend</p>
            <p className="text-sm text-slate-500">Send this link: they rate a few films and see how compatible you are, the films you both loved and the ones they should see.</p>
            <button type="button" className="account-secondary inline-flex" onClick={copy}>{copied ? <Check size={16} aria-hidden="true" /> : <Link2 size={16} aria-hidden="true" />} {copied ? "Link copied" : "Copy the link"}</button>
          </div>
          {!user && <p className="text-xs text-slate-500">The link carries the films on your card, not your account: anyone with it sees those films and your ratings of them.</p>}
          {user && <p className="text-xs text-slate-500">The link carries the films on your card and your ratings of them, nothing else from your account.</p>}
        </div>
      </div>
    </main>
  );
}
