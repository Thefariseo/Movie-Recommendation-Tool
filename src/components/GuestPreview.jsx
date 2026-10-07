import { Link } from "react-router-dom";
import { Crown, Heart, Moon, Sparkles, ThumbsUp } from "lucide-react";
import { usePosters, posterUrl } from "../utils/posters";

const Poster = ({ film, className = "" }) => (
  <span className={`guest-poster ${className}`}>{posterUrl(film) && <img alt="" src={posterUrl(film)} decoding="async" />}</span>
);
const Title = ({ film }) => <span translate="no">{film?.title || ""}</span>;

/**
 * What a page that needs an account does, shown to a guest instead of a bare
 * "sign in": the promise, a worked example with real films, and the way in.
 */
export default function GuestPreview({ eyebrow, title, text, points = [], children }) {
  return (
    <main className="guest-preview">
      <div className="guest-preview-copy">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="font-display text-2xl sm:text-3xl">{title}</h1>
        <p className="guest-preview-text">{text}</p>
        {points.length > 0 && <ul className="guest-preview-points">{points.map((p) => <li key={p}>{p}</li>)}</ul>}
        <div className="guest-preview-actions">
          <Link to="/profile?mode=signup" className="account-button">Create a free account</Link>
          <Link to="/profile" className="account-secondary">Sign in</Link>
        </div>
        <p className="guest-preview-note">Free. What you rated on this device comes with you.</p>
      </div>
      <figure className="guest-example">
        <figcaption className="guest-example-label">Example</figcaption>
        {children}
      </figure>
    </main>
  );
}

// A movie night's ballot, voted on: three friends, four films, one leading.
const NIGHT = [[120467, Heart, 3, true], [546554, ThumbsUp, 2], [346648, ThumbsUp, 2], [567, ThumbsUp, 1]];
export function NightExample() {
  const films = usePosters(NIGHT.map(([id]) => id));
  return (
    <div className="guest-night" aria-hidden="true">
      <div className="guest-night-head">
        <Moon size={16} />
        <span>Friday night</span>
        <span className="welcome-avatars">{["A", "M", "G"].map((l, i) => <span key={l} className={`welcome-avatar welcome-avatar-${i}`}>{l}</span>)}</span>
      </div>
      <div className="guest-night-ballot">
        {NIGHT.map(([id, Icon, votes, leading]) => (
          <div key={id} className={`guest-night-film ${leading ? "guest-night-leading" : ""}`}>
            <Poster film={films[id]} />
            <span className="guest-night-votes"><Icon size={12} /> {votes}</span>
            {leading && <span className="guest-night-badge"><Crown size={12} /> <span>Leading</span></span>}
          </div>
        ))}
      </div>
      <p className="guest-night-foot">Everyone has voted. The host draws the film.</p>
    </div>
  );
}

// A question to the critic and its answer, with the film it suggests.
export function CriticExample() {
  const films = usePosters([567]);
  return (
    <div className="guest-chat" aria-hidden="true">
      <p className="guest-bubble guest-bubble-me">Something tense but not violent, under two hours.</p>
      <div className="guest-bubble guest-bubble-critic">
        <p className="guest-critic-name"><Sparkles size={12} /> <span>Your critic</span></p>
        <p>All suspense and almost no blood, in under two hours. You gave Vertigo five stars: here is Hitchcock at his most playful.</p>
        <div className="guest-critic-film">
          <Poster film={films[567]} className="guest-poster-small" />
          <span>
            <strong><Title film={films[567]} /></strong>
            <span className="block text-xs text-slate-500">1954 · 112 min</span>
          </span>
        </div>
      </div>
    </div>
  );
}

// A friend whose taste is close to the member's, and the films both loved.
export function FriendsExample() {
  const films = usePosters([666277, 965150, 976893]);
  return (
    <div className="guest-friend" aria-hidden="true">
      <div className="guest-friend-head">
        <span className="welcome-avatar welcome-avatar-1 guest-friend-avatar">S</span>
        <span>
          <strong translate="no">Sara</strong>
          <span className="block text-sm text-slate-500">87% taste match</span>
        </span>
      </div>
      <p className="guest-friend-label">You both loved</p>
      <div className="guest-friend-films">{[666277, 965150, 976893].map((id) => <Poster key={id} film={films[id]} />)}</div>
      <p className="guest-friend-foot">She just rated a film you have on your watchlist.</p>
    </div>
  );
}
