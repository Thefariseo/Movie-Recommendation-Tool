// The home page's backlight: the film nearest the middle of the screen (in
// the picks, a rail or a grid, scrolling either way) lends the page its
// colours. A film has to stay there a moment, so a fast scroll does not make
// the light flicker.
import { useEffect } from "react";
import { posterColours } from "../utils/filmColor";
import { setGlow } from "../utils/ambient";
import { reducedMotion } from "../utils/motion";

const posterOf = (el) => /\/t\/p\/w\d+(\/[^?#]+)$/.exec(el.querySelector("img")?.getAttribute("src") || "")?.[1] || null;
const SETTLE = 160;

export default function useAmbientGlow(enabled = true) {
  useEffect(() => {
    if (!enabled || reducedMotion() || typeof IntersectionObserver === "undefined") return undefined;
    const visible = new Set();
    const watched = new WeakSet();
    let frame = 0, settle = 0, current = null, alive = true;

    const pick = () => {
      frame = 0;
      const cx = window.innerWidth / 2, cy = window.innerHeight * 0.45;
      let best = null, bestDistance = Infinity;
      for (const el of visible) {
        const r = el.getBoundingClientRect();
        if (r.width < 40) continue;
        const dx = (r.left + r.width / 2 - cx) / window.innerWidth;
        const dy = (r.top + r.height / 2 - cy) / window.innerHeight;
        // Up and down matters more than across: a rail's middle card wins.
        const distance = dx * dx * 0.6 + dy * dy;
        if (distance < bestDistance) { bestDistance = distance; best = el; }
      }
      const path = best && posterOf(best);
      if (!path || path === current) return;
      clearTimeout(settle);
      settle = setTimeout(() => {
        current = path;
        const r = best.getBoundingClientRect();
        const clamp = (v) => Math.round(Math.max(8, Math.min(92, v)));
        const at = { x: clamp(((r.left + r.width / 2) / window.innerWidth) * 100), y: clamp(((r.top + r.height / 2) / window.innerHeight) * 100) };
        posterColours(path).then((colours) => { if (alive && current === path && colours) setGlow(colours, at); });
      }, SETTLE);
    };
    const schedule = () => { frame ||= requestAnimationFrame(pick); };

    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) visible.add(e.target);
        else visible.delete(e.target);
      }
      schedule();
    });
    const observeNew = () => {
      for (const el of document.querySelectorAll("main [data-film-id]")) {
        if (!watched.has(el)) { watched.add(el); io.observe(el); }
      }
    };
    // Films arrive after the page does: look for them as they come.
    const mutations = new MutationObserver(() => { observeNew(); schedule(); });
    mutations.observe(document.querySelector("main") || document.body, { childList: true, subtree: true });
    observeNew();
    // Capture: rails of films scroll sideways inside the page.
    window.addEventListener("scroll", schedule, { passive: true, capture: true });
    window.addEventListener("resize", schedule);
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      clearTimeout(settle);
      io.disconnect();
      mutations.disconnect();
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
      setGlow(null);
    };
  }, [enabled]);
}
