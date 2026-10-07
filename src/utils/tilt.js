// Posters that lean: towards the mouse resting on one, with a sheen where the
// light would catch it; on phones, every poster in view leans a little with
// the phone itself (where the browser gives its orientation without asking;
// iOS asks, so there they stay still). Angles are set on the posters only,
// never on the whole page, so each change restyles a handful of elements.
import { reducedMotion } from "./motion";

const POSTERS = ".film-poster, [data-tilt]";
const MAX = 8; // degrees, under the mouse
const PHONE = 0.22; // degrees per degree the phone turns
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function set(el, rx, ry, glare = null) {
  el.style.setProperty("--tilt-x", `${rx.toFixed(2)}deg`);
  el.style.setProperty("--tilt-y", `${ry.toFixed(2)}deg`);
  if (glare) {
    el.style.setProperty("--glare-x", `${glare.x}%`);
    el.style.setProperty("--glare-y", `${glare.y}%`);
    el.style.setProperty("--glare", "1");
  }
}
function reset(el) {
  el.classList.remove("tilting");
  for (const p of ["--tilt-x", "--tilt-y", "--glare"]) el.style.removeProperty(p);
}

export function installTilt() {
  if (typeof window === "undefined" || reducedMotion()) return () => {};
  const cleanups = [];

  // The mouse.
  let active = null, frame = 0, last = null;
  const onMove = (e) => {
    if (e.pointerType !== "mouse") return;
    last = e;
    frame ||= requestAnimationFrame(() => {
      frame = 0;
      const el = last.target.closest?.(POSTERS) || null;
      if (active && active !== el) reset(active);
      active = el;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const px = clamp((last.clientX - r.left) / r.width, 0, 1);
      const py = clamp((last.clientY - r.top) / r.height, 0, 1);
      el.classList.add("tilting");
      set(el, (0.5 - py) * MAX, (px - 0.5) * MAX, { x: Math.round(px * 100), y: Math.round(py * 100) });
    });
  };
  const onLeaveWindow = () => { if (active) reset(active); active = null; };
  document.addEventListener("pointermove", onMove, { passive: true });
  document.documentElement.addEventListener("pointerleave", onLeaveWindow);
  cleanups.push(() => {
    document.removeEventListener("pointermove", onMove);
    document.documentElement.removeEventListener("pointerleave", onLeaveWindow);
    cancelAnimationFrame(frame);
  });

  // The phone itself.
  const touch = window.matchMedia?.("(pointer: coarse)").matches;
  const askFirst = typeof window.DeviceOrientationEvent?.requestPermission === "function";
  if (touch && "DeviceOrientationEvent" in window && !askFirst && typeof IntersectionObserver !== "undefined") {
    const visible = new Set();
    const seen = new WeakSet();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) visible.add(e.target);
        else { visible.delete(e.target); reset(e.target); }
      }
    });
    const observe = () => document.querySelectorAll(POSTERS).forEach((el) => { if (!seen.has(el)) { seen.add(el); io.observe(el); } });
    const mutations = new MutationObserver(observe);
    mutations.observe(document.body, { childList: true, subtree: true });
    observe();
    // However the phone is held becomes level, slowly: only turning it moves the posters.
    let level = null, tilt = null, pending = 0;
    const onOrientation = (e) => {
      if (e.beta == null || e.gamma == null) return;
      level = level ? { b: level.b * 0.97 + e.beta * 0.03, g: level.g * 0.97 + e.gamma * 0.03 } : { b: e.beta, g: e.gamma };
      tilt = { x: clamp((e.beta - level.b) * PHONE, -6, 6), y: clamp((e.gamma - level.g) * PHONE, -6, 6) };
      pending ||= requestAnimationFrame(() => {
        pending = 0;
        for (const el of visible) set(el, -tilt.x, tilt.y);
      });
    };
    window.addEventListener("deviceorientation", onOrientation);
    cleanups.push(() => {
      window.removeEventListener("deviceorientation", onOrientation);
      io.disconnect();
      mutations.disconnect();
      cancelAnimationFrame(pending);
    });
  }
  return () => cleanups.forEach((fn) => fn());
}
