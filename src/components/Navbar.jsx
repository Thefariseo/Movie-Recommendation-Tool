import React, { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Compass, Library, Users, UserRound, Sun, Moon } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import SearchBar from "./SearchBar";
const destinations = [
  { path: "/", label: "Discover", icon: Compass },
  { path: "/library", label: "Library", icon: Library },
  { path: "/friends", label: "Friends", icon: Users },
];
export default function Navbar() {
  const { user } = useAuth();
  const { pathname } = useLocation();
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
      className={({ isActive }) =>
        `nav-destination ${mobile ? "nav-mobile" : ""} ${isActive || (path === "/" && pathname === "/chat") ? "nav-selected" : ""}`
      }
    >
      {mobile && <Icon size={19} aria-hidden="true" />}
      <span>{label}</span>
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
              <UserRound size={18} aria-hidden="true" />
              <span>{user ? "Account" : "Sign in"}</span>
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
