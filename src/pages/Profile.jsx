import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Film,
  Bookmark,
  Star,
  ArrowUpRight,
  Globe2,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useLibrary } from "../contexts/LibraryContext";
import { backend } from "../utils/backend";
import AccountPanel from "../components/AccountPanel";
import IntegrationsPanel from "../components/IntegrationsPanel";
import UserAvatar from "../components/UserAvatar";
const countries = {
  IT: "Italy",
  US: "United States",
  GB: "United Kingdom",
  FR: "France",
  DE: "Germany",
  ES: "Spain",
  PT: "Portugal",
  CH: "Switzerland",
  AT: "Austria",
  NL: "Netherlands",
  BE: "Belgium",
  SE: "Sweden",
  DK: "Denmark",
  NO: "Norway",
  FI: "Finland",
  PL: "Poland",
  GR: "Greece",
  IE: "Ireland",
  CA: "Canada",
  AU: "Australia",
  NZ: "New Zealand",
  BR: "Brazil",
  MX: "Mexico",
  AR: "Argentina",
  JP: "Japan",
  KR: "South Korea",
  IN: "India",
};

export default function Profile() {
  const auth = useAuth(),
    library = useLibrary();
  const saved = JSON.stringify(
    auth.profile
      ? {
          display_name: auth.profile.display_name,
          country: auth.profile.country,
          discoverable: auth.profile.discoverable,
          share_activity: auth.profile.share_activity,
          collaborative: auth.profile.collaborative,
        }
      : null,
  );
  const [profile, setProfile] = useState(null),
    [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    setProfile(JSON.parse(saved));
    setMessage("");
    setError("");
  }, [saved, auth.user?.id]);
  const name =
    auth.profile?.display_name || auth.user?.full_name || "Your film story";
  const rated = library.watched.filter((m) => Number(m.rated) > 0);
  const average = rated.length
    ? (
        rated.reduce((sum, m) => sum + Number(m.rated), 0) /
        rated.length /
        2
      ).toFixed(1)
    : null;
  const joined =
    auth.user?.created_at && !Number.isNaN(Date.parse(auth.user.created_at))
      ? new Date(auth.user.created_at).toLocaleDateString("en-GB", {
          month: "long",
          year: "numeric",
        })
      : null;
  const dirty = profile && JSON.stringify(profile) !== saved;
  const update = (key, value) => {
    setProfile((p) => ({ ...p, [key]: value }));
    setMessage("");
  };
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await backend("social", { action: "profile", profile });
      await auth.reload();
      setMessage("Your changes are saved.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  if (auth.loading)
    return (
      <main className="profile-page">
        <p role="status">Loading your profile…</p>
      </main>
    );
  return (
    <main className="profile-page">
      <header className="profile-hero">
        <div className="profile-identity">
          <UserAvatar user={auth.user} name={name} />
          <div>
            <p className="eyebrow">YOUR CORNER OF CINEMA</p>
            <h1>{name}</h1>
            <p className="profile-meta">
              {auth.user ? (
                <>
                  {countries[auth.profile?.country] ||
                    auth.profile?.country ||
                    "Film lover"}
                  {joined && ` · Member since ${joined}`}
                </>
              ) : (
                "Your favourites, discoveries and next movie nights."
              )}
            </p>
            {auth.user?.provider === "google" && (
              <span className="profile-provider">
                Google account
                {auth.user.avatar_url ? " · Photo from Google" : ""}
              </span>
            )}
          </div>
        </div>
        <Link to="/library" className="account-secondary">
          Open library <ArrowUpRight size={16} />
        </Link>
      </header>
      <div className="profile-metrics" aria-label="Your film collection">
        {[
          [Film, "Watched", library.watched.length, "/library/watched"],
          [
            Bookmark,
            "Watchlist",
            library.watchlist.length,
            "/library/watchlist",
          ],
          [Star, "Rated", rated.length, "/library/stats"],
        ].map(([Icon, label, count, to]) => (
          <Link key={label} to={to}>
            <Icon size={20} aria-hidden="true" />
            <strong>{library.ready ? count : "—"}</strong>
            <span>{label}</span>
            <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        ))}
      </div>
      <div className="profile-columns">
        <div className="space-y-6">
          {profile ? (
            <form className="account-panel profile-preferences" onSubmit={save}>
              <div className="profile-section-title">
                <Globe2 size={20} />
                <div>
                  <h2>Make it yours</h2>
                  <p>Your name and where you watch.</p>
                </div>
              </div>
              <label className="account-label">
                Display name
                <input
                  className="account-input"
                  value={profile.display_name || ""}
                  maxLength={60}
                  required
                  autoComplete="nickname"
                  onChange={(e) => update("display_name", e.target.value)}
                />
              </label>
              <label className="account-label">
                Streaming country
                <select
                  className="account-input"
                  value={profile.country}
                  onChange={(e) => update("country", e.target.value)}
                >
                  {!countries[profile.country] && (
                    <option value={profile.country}>{profile.country}</option>
                  )}
                  {Object.entries(countries).map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="profile-hint">
                Streaming options follow this country across devices.
                Availability comes from JustWatch via TMDB.
              </p>
              <div className="profile-section-title profile-divider">
                <ShieldCheck size={20} />
                <div>
                  <h2>Privacy & community</h2>
                  <p>You choose what to share.</p>
                </div>
              </div>
              {[
                [
                  "discoverable",
                  "Let people find me",
                  "Show my name in member searches.",
                ],
                [
                  "share_activity",
                  "Share with mutual followers",
                  "Let friends who follow me back see my library and include me in movie nights.",
                ],
                [
                  "collaborative",
                  "Improve community recommendations",
                  "Use my ratings to learn shared tastes. Switching this off invalidates any trained model that used them.",
                ],
              ].map(([key, label, description]) => (
                <label className="profile-setting" key={key}>
                  <span>
                    <strong>{label}</strong>
                    <small>{description}</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={!!profile[key]}
                    onChange={(e) => update(key, e.target.checked)}
                  />
                </label>
              ))}
              <div className="profile-save">
                <button className="account-button" disabled={busy || !dirty}>
                  {busy ? "Saving…" : "Save changes"}
                </button>
                <span role="status">
                  {message ||
                    (dirty
                      ? "You have unsaved changes."
                      : "All changes saved.")}
                </span>
              </div>
              {error && (
                <p role="alert" className="text-sm text-red-500">
                  {error}
                </p>
              )}
            </form>
          ) : (
            <AccountPanel />
          )}
        </div>
        <aside className="space-y-6">
          <section className="account-panel profile-taste">
            <p className="eyebrow">A TASTE THAT’S YOURS</p>
            <h2>
              {rated.length
                ? "Every rating tells a story."
                : "Start with a film you love."}
            </h2>
            <p>
              {rated.length
                ? `${rated.length} rated films shape your recommendations${average ? ` · ${average}/5 average rating` : ""}.`
                : "Mark a film as watched and rate it. Your next recommendations will take it into account."}
            </p>
            <Link to="/library/stats">
              Explore your film stats <ArrowUpRight size={16} />
            </Link>
          </section>
          {auth.user && <AccountPanel />}
          <IntegrationsPanel />
          <details className="account-panel profile-maintenance">
            <summary>Library management</summary>
            <p>
              {auth.user
                ? "Clearing a list removes it from your account on every device."
                : "Guest changes are saved on this device only."}
            </p>
            <div className="flex flex-wrap gap-3">
              {["watchlist", "watched"].map((kind) => (
                <button
                  key={kind}
                  className="account-secondary text-red-500"
                  disabled={!library.ready || !!library.pending}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Clear your entire ${kind} list${auth.user ? " on every device" : ""}?`,
                      )
                    )
                      library.run(kind, "clear");
                  }}
                >
                  Clear {kind}
                </button>
              ))}
            </div>
          </details>
        </aside>
      </div>
    </main>
  );
}
