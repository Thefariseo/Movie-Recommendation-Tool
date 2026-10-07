import { Crown, Heart, Sparkles, ThumbsUp } from "lucide-react";
import { usePosters, posterUrl } from "../utils/posters";

// Real films in the pictures: a pick and the films behind it, and a movie
// night's ballot.
const PICKS = [129, 496243, 843];
const BALLOT = [[120467, Heart, 3, true], [546554, ThumbsUp, 2], [346648, ThumbsUp, 1]];
const Poster = ({ film, className = "" }) => (
  <span className={`welcome-poster ${className}`}>{posterUrl(film) && <img alt="" src={posterUrl(film)} decoding="async" />}</span>
);

/**
 * What Umbrify does, in three pictures for someone who has just arrived:
 * picks that say why, movie nights with friends, a critic and a map of
 * their taste. On a phone the three scroll sideways.
 */
export default function WelcomePoints() {
  const films = usePosters([...PICKS, ...BALLOT.map(([id]) => id)]);
  return (
    <ul className="welcome-points">
      <li className="welcome-point">
        <div className="welcome-visual welcome-visual-picks" aria-hidden="true">
          {PICKS.map((id, i) => <Poster key={id} film={films[id]} className={`welcome-fan welcome-fan-${i}`} />)}
          <span className="welcome-chip"><Sparkles size={12} /><span>Because you loved</span> <span translate="no">{films[PICKS[0]]?.title || "Spirited Away"}</span></span>
        </div>
        <h3>Picks that explain themselves</h3>
        <p>Every film comes with the reason it suits you: films you loved, the people behind it, friends with your taste.</p>
      </li>
      <li className="welcome-point">
        <div className="welcome-visual welcome-visual-night" aria-hidden="true">
          <span className="welcome-avatars">
            {["A", "M", "G"].map((l, i) => <span key={l} className={`welcome-avatar welcome-avatar-${i}`}>{l}</span>)}
          </span>
          <span className="welcome-ballot">
            {BALLOT.map(([id, Icon, votes, leading]) => (
              <span key={id} className="welcome-ballot-film">
                <Poster film={films[id]} />
                <span className="welcome-votes"><Icon size={11} /> {votes}</span>
                {leading && <Crown className="welcome-crown" size={14} />}
              </span>
            ))}
          </span>
        </div>
        <h3>Movie nights with friends</h3>
        <p>Umbrify proposes films the whole group will like, and everyone votes from their own phone.</p>
      </li>
      <li className="welcome-point">
        <div className="welcome-visual welcome-visual-map" aria-hidden="true">
          <img className="welcome-map welcome-map-light" alt="" src="/welcome/map-light.webp" decoding="async" />
          <img className="welcome-map welcome-map-dark" alt="" src="/welcome/map-dark.webp" decoding="async" />
          <span className="welcome-chip welcome-chip-map"><span>Your corner of cinema</span></span>
        </div>
        <h3>A critic and a map of your taste</h3>
        <p>Talk films with a critic who has read your diary, and see where your taste sits among all of cinema.</p>
      </li>
    </ul>
  );
}
