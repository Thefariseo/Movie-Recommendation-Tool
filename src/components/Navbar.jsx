import React, { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Compass, Library, Users, UserRound, Sun, Moon, Feather, Clapperboard } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import useWatchlist from "../hooks/useWatchlist";
import UserAvatar from "./UserAvatar";
import SearchBar from "./SearchBar";
import NotificationBell, { InstallButton } from "./NotificationBell";
import LanguagePicker from "./LanguagePicker";
import { preloadPage } from "../utils/lazyPage";
const destinations = [
  { path: "/", label: "Discover", icon: Compass },
  { path: "/tonight", label: "Tonight", icon: Clapperboard },
  { path: "/critic", label: "Critic", icon: Feather },
  { path: "/library", label: "Library", icon: Library },
  { path: "/friends", label: "Friends", icon: Users },
];
export default function Navbar() {
  const { user, profile } = useAuth();
  const { pathname } = useLocation();
  // Films waiting on the watchlist, beside the Library: the count goes up as
  // a film saved lands there (src/utils/flight.js).
  const waiting = useWatchlist().watchlist.length;
  const [count, setCount] = useState(waiting);
  useEffect(() => {
    if (waiting <= count) { setCount(waiting); return undefined; }
    const land = () => setCount(waiting);
    const timer = setTimeout(land, 900);
    window.addEventListener("umbrify:landed", land, { once: true });
    return () => { clearTimeout(timer); window.removeEventListener("umbrify:landed", land); };
  }, [waiting]);
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains("dark"),
  );
  useEffect(() => {
    try {
      const theme = localStorage.getItem("umbrify-theme");
      setDark(
        theme
          ? theme === "dark"
          : window.matchMedia("(prefers-color-scheme: dark)").matches,
      );
    } catch {
      /* Continue with the current theme if storage is unavailable. */
    }
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  const toggle = () => {
    const value = !dark;
    setDark(value);
    try {
      localStorage.setItem("umbrify-theme", value ? "dark" : "light");
    } catch {
      /* optional */
    }
  };
  const destination = ({ path, label, icon: Icon }, mobile = false) => (
    <NavLink
      key={path}
      to={path}
      end={path === "/"}
      onPointerEnter={() => preloadPage(path)}
      onFocus={() => preloadPage(path)}
      className={({ isActive }) =>
        `nav-destination ${mobile ? "nav-mobile" : ""} ${isActive || (path === "/" && pathname === "/chat") ? "nav-selected" : ""}`
      }
    >
      {mobile && <Icon size={19} aria-hidden="true" />}
      <span>{label}</span>
      {path === "/library" && count > 0 && <span className="nav-count" aria-hidden="true">{count > 99 ? "99+" : count}</span>}
    </NavLink>
  );
  return (
    <>
      <a href="#page-content" className="skip-link">
        Skip to content
      </a>
      <header className="app-header">
        <div className="header-row">
          <Link to="/" className="brand" aria-label="Umbrify home">
            <span>umbrify</span>
          </Link>
          <nav
            aria-label="Main navigation"
            className="hidden items-center gap-1 md:flex"
          >
            {destinations.map((d) => destination(d))}
          </nav>
          <div className="header-search">
            <SearchBar />
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <LanguagePicker compact className="hidden px-1 text-[rgb(var(--color-fg-muted))] md:inline-flex" />
            {user ? <NotificationBell userId={user.id} /> : <InstallButton />}
            <button
              onClick={toggle}
              className="icon-control"
              aria-label={
                dark ? "Switch to light theme" : "Switch to dark theme"
              }
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <NavLink to="/profile" className="account-link">
              {user ? (
                <UserAvatar
                  user={user}
                  name={profile?.display_name || user.full_name}
                  className="nav-avatar"
                />
              ) : (
                <UserRound size={18} aria-hidden="true" />
              )}
              <span className="account-link-label">{user ? "Account" : "Sign in"}</span>
            </NavLink>
          </div>
        </div>
      </header>
      <nav aria-label="Mobile navigation" className="mobile-navigation">
        {destinations.map((d) => destination(d, true))}
        {destination(
          {
            path: "/profile",
            label: user ? "Account" : "Sign in",
            icon: UserRound,
          },
          true,
        )}
      </nav>
    </>
  );
}
