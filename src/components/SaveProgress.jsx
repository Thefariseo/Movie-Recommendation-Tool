import { useState } from "react";
import { Link } from "react-router-dom";
import { CloudUpload } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useLibrary } from "../contexts/LibraryContext";
import { useSignals } from "../utils/signals";

// "Later" puts the reminder away until ten more things are worth saving.
const LATER_KEY = "umbrify_save_later_v1";
const later = () => { try { return Number(localStorage.getItem(LATER_KEY)) || 0; } catch { return 0; } };

/**
 * A guest's taste lives in this browser only. Once they have something worth
 * keeping (first-visit choices, ratings, saved films), this says so and
 * offers a free account, which takes it all along (src/contexts/LibraryContext.jsx).
 */
export default function SaveProgress() {
  const { user, configured } = useAuth();
  const { watched, watchlist } = useLibrary();
  const signals = useSignals(null);
  const [hiddenAt, setHiddenAt] = useState(later);
  if (user || !configured) return null;
  const rated = watched.filter((m) => Number(m.rated) > 0).length;
  const chosen = [...signals.values()].filter((e) => e.sources?.has("onboarding")).length;
  const worth = rated + chosen + watchlist.length;
  if (!worth || (hiddenAt && worth < hiddenAt + 10)) return null;
  const parts = [rated && (rated === 1 ? "one rating" : `${rated} ratings`), chosen && (chosen === 1 ? "one choice" : `${chosen} choices`), watchlist.length && (watchlist.length === 1 ? "one saved film" : `${watchlist.length} saved films`)].filter(Boolean);
  const hide = () => {
    try { localStorage.setItem(LATER_KEY, String(worth)); } catch { /* shown again next visit */ }
    setHiddenAt(worth);
  };
  return (
    <aside className="save-progress" aria-label="Keep your taste">
      <CloudUpload className="save-progress-icon" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <h2>Your taste lives only on this device</h2>
        {/* Each part its own words, so each is translated. */}
        <p>
          <span>Create a free account to keep it everywhere:</span>{" "}
          {parts.flatMap((part, i) => (i ? [" · ", <span key={i}>{part}</span>] : [<span key={i}>{part}</span>]))}
        </p>
      </div>
      <div className="save-progress-actions">
        <Link to="/profile?mode=signup" className="account-button">Create a free account</Link>
        <button type="button" onClick={hide} className="save-progress-later">Later</button>
      </div>
    </aside>
  );
}
