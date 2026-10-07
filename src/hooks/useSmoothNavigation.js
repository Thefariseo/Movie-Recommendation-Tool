import { useEffect, useLayoutEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { reducedMotion, transitionStarted } from "../utils/motion";
import { transitionKind } from "../utils/pageTransition";

// The app's own pages; anything else (the static privacy and terms pages) is
// a real page load.
const APP_PATHS = /^\/($|library|friends|person|list|chat|critic|tonight|season|profile|rate|watchlist|watched|stats)/;

// The elements of the next page that take the place of those a link marks:
// named only for the moment of the transition, one of each.
function nameTargets(names) {
  const done = new Set(), named = [];
  for (const el of document.querySelectorAll("[data-morph-target]")) {
    const n = el.dataset.morphTarget;
    if (!names.has(n) || done.has(n)) continue;
    done.add(n);
    el.style.viewTransitionName = n;
    named.push(el);
  }
  return named;
}
// A page whose file is still on its way gets a moment to arrive, not more
// (the screen holds still meanwhile).
const arrival = () => new Promise((resolve) => {
  const started = Date.now();
  const check = () => (!document.querySelector("[data-page-loading]") || Date.now() - started > 400 ? resolve() : setTimeout(check, 16));
  check();
});
// A target image still downloading gets a moment to arrive, not more.
const settle = (els) => Promise.race([
  Promise.all(els.filter((el) => el.tagName === "IMG").map((img) => img.decode().catch(() => {}))),
  new Promise((resolve) => setTimeout(resolve, 160)),
]);

/**
 * Links inside the app change page inside a view transition (where the
 * browser has them): sideways in the direction of travel, a dimming for
 * Tonight and seasons, and elements a link marks with data-morph (a cast
 * photo, a list's first posters) growing into the next page's
 * data-morph-target of the same name. A link may hand the next page what it
 * already shows (data-state, JSON), so that page can draw it at once. Going
 * back returns to where the member was on that page; a new page opens at
 * its top.
 */
export default function useSmoothNavigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const type = useNavigationType();
  const positions = useRef(new Map());
  const lastPath = useRef(location.pathname);

  // Clicks on in-app links, caught before React Router's own handler (which
  // then leaves them alone): navigate inside a view transition.
  useEffect(() => {
    if (typeof document.startViewTransition !== "function") return undefined;
    const onClick = (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest?.("a[href]");
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || !APP_PATHS.test(url.pathname)) return;
      const here = new URL(window.location.href);
      // The same page: a skip link or an anchor (the browser's), or in-page
      // tabs, which handle themselves unless marked data-vt.
      if (url.pathname === here.pathname && (url.search === here.search || !a.hasAttribute("data-vt"))) return;
      e.preventDefault();
      const to = url.pathname + url.search + url.hash;
      let state;
      try { state = a.dataset.state ? JSON.parse(a.dataset.state) : undefined; } catch { state = undefined; }
      if (reducedMotion()) { navigate(to, { state }); return; }
      const root = document.documentElement;
      root.dataset.vt = transitionKind(here, url);
      // Between the tabs of one page, its heading and tab bar hold still.
      const library = /^\/library\//;
      if (url.pathname === here.pathname || (library.test(url.pathname) && library.test(here.pathname))) root.dataset.vtWithin = "";
      const clear = () => { delete root.dataset.vt; delete root.dataset.vtWithin; };
      const morphs = [...a.querySelectorAll("[data-morph]")];
      const names = new Set(morphs.map((el) => el.dataset.morph));
      for (const el of morphs) el.style.viewTransitionName = el.dataset.morph;
      let targets = [];
      try {
        const vt = document.startViewTransition(async () => {
          for (const el of morphs) el.style.viewTransitionName = "";
          flushSync(() => navigate(to, { state }));
          await arrival();
          if (!names.size) return;
          targets = nameTargets(names);
          await settle(targets);
        });
        transitionStarted(vt);
        vt.finished.finally(() => {
          for (const el of targets) el.style.viewTransitionName = "";
          clear();
        });
      } catch {
        for (const el of morphs) el.style.viewTransitionName = "";
        clear();
        navigate(to, { state });
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [navigate]);

  // Where the member is on each page they visit, to come back to it.
  useEffect(() => {
    try { window.history.scrollRestoration = "manual"; } catch { /* older browsers */ }
    const key = location.key;
    const save = () => positions.current.set(key, window.scrollY);
    window.addEventListener("scroll", save, { passive: true });
    return () => window.removeEventListener("scroll", save);
  }, [location.key]);

  useLayoutEffect(() => {
    const samePage = lastPath.current === location.pathname;
    lastPath.current = location.pathname;
    const target = type === "POP" ? positions.current.get(location.key) : undefined;
    if (target == null) {
      if (!samePage) window.scrollTo({ top: 0, behavior: "instant" });
      return undefined;
    }
    // The page refills as its films arrive: keep trying to reach the spot
    // for a moment, and stop as soon as the member scrolls themselves.
    let frame = 0, stopped = false;
    const stop = () => { stopped = true; };
    const started = Date.now();
    const step = () => {
      if (stopped) return;
      window.scrollTo({ top: target, behavior: "instant" });
      if (Math.abs(window.scrollY - target) > 2 && Date.now() - started < 2500) frame = requestAnimationFrame(step);
    };
    step();
    window.addEventListener("wheel", stop, { passive: true, once: true });
    window.addEventListener("touchstart", stop, { passive: true, once: true });
    window.addEventListener("keydown", stop, { once: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchstart", stop);
      window.removeEventListener("keydown", stop);
    };
  }, [location.key, location.pathname, type]);
}
