// =====================================================
// Navbar – Umbrify sticky header
// =====================================================
import React, { useState, useEffect } from "react";
import { Link, NavLink } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Sun, Moon, Menu, X } from "lucide-react";

const links = [
  { path: "/",          label: "Discover" },
  { path: "/watchlist", label: "Watchlist" },
  { path: "/watched",   label: "Watched" },
  { path: "/stats",     label: "Stats" },
  { path: "/friends",   label: "Friends" },
  { path: "/profile",   label: "Profile" },
];

/* Umbrify logotype — dotted icon + wordmark */
function UmbrifyLogo() {
  return (
    <span className="flex items-center gap-2">
      {/* Favicon SVG as logo mark */}
      <img
        src="/favicon.svg"
        alt="Umbrify"
        className="h-6 w-6"
        onError={(e) => { e.target.style.display = "none"; }}
      />
      <span
        className="text-base font-bold tracking-tight lowercase text-slate-900 dark:text-white"
        style={{ fontFamily: "'Playfair Display', Georgia, serif", letterSpacing: "-0.01em" }}
      >
        umbrify
      </span>
    </span>
  );
}

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const [dark, setDark] = useState(() => {
    if (typeof window === "undefined") return false;
    if (document.documentElement.classList.contains("dark")) return true;
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  });

  useEffect(() => {
    if (dark) document.documentElement.classList.add("dark");
    else       document.documentElement.classList.remove("dark");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    if (next) document.documentElement.classList.add("dark");
    else       document.documentElement.classList.remove("dark");
  };

  return (
    <header
      className={`sticky top-0 z-50 w-full transition-all duration-300 ${
        scrolled
          ? "bg-white/85 shadow-sm backdrop-blur-lg dark:bg-slate-950/90"
          : "bg-white/70 backdrop-blur-md dark:bg-slate-950/80"
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">

        {/* Brand */}
        <Link
          to="/"
          className="flex items-center no-underline hover:opacity-80 transition-opacity"
        >
          <UmbrifyLogo />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-6 md:flex">
          {links.map(({ path, label }) => (
            <NavLink
              key={path}
              to={path}
              end={path === "/"}
              className={({ isActive }) =>
                `text-sm font-medium transition-colors no-underline ${
                  isActive
                    ? "text-indigo-600 dark:text-indigo-400"
                    : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Right controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            aria-label="Toggle theme"
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          <button
            className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 md:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {open && (
          <motion.nav
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="overflow-hidden border-t border-slate-100 bg-white/95 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/95 md:hidden"
          >
            <div className="flex flex-col gap-1 px-4 py-3">
              {links.map(({ path, label }) => (
                <NavLink
                  key={path}
                  to={path}
                  end={path === "/"}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `rounded-lg px-3 py-2 text-sm font-medium no-underline transition-colors ${
                      isActive
                        ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400"
                        : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                    }`
                  }
                >
                  {label}
                </NavLink>
              ))}
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
