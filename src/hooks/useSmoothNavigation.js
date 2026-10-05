import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { withTransition } from "../utils/motion";

// The app's own pages; anything else (the static privacy and terms pages) is
// a real page load.
const APP_PATHS = /^\/($|library|friends|person|list|chat|critic|tonight|season|profile|watchlist|watched|stats)/;

/**
 * Links inside the app change page with a short cross-fade (where the
 * browser supports view transitions), and going back returns to where the
 * member was on that page; a new page opens at its top.
 */
export default function useSmoothNavigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const type = useNavigationType();
  const positions = useRef(new Map());
  const lastPath = useRef(location.pathname);

  // Clicks on in-app links: navigate inside a view transition.
  useEffect(() => {
    if (typeof document.startViewTransition !== "function") return undefined;
    const onClick = (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest?.("a[href]");
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || !APP_PATHS.test(url.pathname)) return;
      // Same page (a skip link, an anchor): the browser handles it.
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      const to = url.pathname + url.search + url.hash;
      e.preventDefault();
      withTransition(() => navigate(to));
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
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
