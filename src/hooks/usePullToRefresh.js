import { useEffect, useRef, useState } from "react";
import { haptic } from "../utils/motion";

// How far the picks must be drawn down (after the resistance) to ask for
// others, and where they wait while those load.
const READY = 72, HOLD = 58;
// However quick the answer, the reel turns for at least this long.
const SPIN = 700;

/**
 * Drawn down from the very top of the page on a touch screen, `ref` (the
 * picks) gives way to a reel of film that turns with the finger; let go past
 * the mark, the reel spins while `onRefresh` finds other picks, until `busy`
 * has come and gone. Returns the phase: "idle", "pulling", "ready" or
 * "loading". The element gets --pull (px) and --pull-turn (0 to 1).
 */
export default function usePullToRefresh(ref, { onRefresh, busy }) {
  const [phase, setPhase] = useState("idle");
  const current = useRef("idle");
  const latest = useRef(onRefresh);
  latest.current = onRefresh;
  const loading = useRef({ since: 0, sawBusy: false });
  const go = (p) => { if (current.current !== p) { current.current = p; setPhase(p); } };
  const place = (px) => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--pull", `${px.toFixed(1)}px`);
    el.style.setProperty("--pull-turn", Math.min(1, px / READY).toFixed(3));
  };
  // Back to rest: the picks glide up, then stop being movable.
  const rest = () => {
    const el = ref.current;
    go("idle");
    place(0);
    setTimeout(() => { if (current.current === "idle") el?.classList.remove("pull-active"); }, 450);
  };

  useEffect(() => {
    let start = null, pulled = 0;
    const onStart = (e) => {
      start = null;
      // Only from the very top, with nothing open over the page.
      if (e.touches.length !== 1 || window.scrollY > 0 || current.current === "loading" || document.documentElement.style.overflow === "hidden") return;
      if (!ref.current?.isConnected) return;
      start = { x: e.touches[0].clientX, y: e.touches[0].clientY, on: false };
    };
    const onMove = (e) => {
      if (!start) return;
      const dx = e.touches[0].clientX - start.x, dy = e.touches[0].clientY - start.y;
      if (!start.on) {
        if (Math.hypot(dx, dy) < 8) return;
        if (dy <= 0 || Math.abs(dx) > dy || window.scrollY > 0 || !e.cancelable) { start = null; return; }
        start.on = true;
        ref.current.classList.add("pull-active", "pulling");
        go("pulling");
      }
      e.preventDefault();
      // The further it goes, the harder it pulls.
      pulled = 150 * (1 - Math.exp(-dy / 190));
      place(pulled);
      if (pulled >= READY && current.current === "pulling") { haptic(8); go("ready"); }
      else if (pulled < READY && current.current === "ready") go("pulling");
    };
    const onEnd = () => {
      if (!start?.on) { start = null; return; }
      start = null;
      ref.current?.classList.remove("pulling");
      if (pulled < READY) { rest(); return; }
      go("loading");
      loading.current = { since: Date.now(), sawBusy: false };
      place(HOLD);
      latest.current();
    };
    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
    document.addEventListener("touchcancel", onEnd);
    // The browser's own pull-to-reload would take the gesture first.
    const html = document.documentElement;
    const before = html.style.overscrollBehaviorY;
    html.style.overscrollBehaviorY = "contain";
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
      html.style.overscrollBehaviorY = before;
    };
  }, []);

  // Once the other picks are in (or after a while regardless), the reel
  // winds back up.
  useEffect(() => {
    if (current.current !== "loading") return undefined;
    if (busy) { loading.current.sawBusy = true; return undefined; }
    const wait = loading.current.sawBusy ? Math.max(0, SPIN - (Date.now() - loading.current.since)) : 4000;
    const timer = setTimeout(rest, wait);
    return () => clearTimeout(timer);
  }, [busy, phase]);

  return phase;
}
