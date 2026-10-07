import { useCallback, useEffect, useRef } from "react";
import { haptic, reducedMotion } from "../utils/motion";

// How far (a share of the screen) or how fast (px per ms) a finger must carry
// the sheet for it to go.
const FAR_DOWN = 0.2, FAR_SIDE = 0.24, FAST = 0.55;

// Whether a touch began in something that scrolls sideways on its own (the
// row of cast photos), or in a field: there the finger is theirs.
function ownedBelow(el, stop) {
  for (; el && el !== stop; el = el.parentElement) {
    if (el.matches?.("input, textarea, select, [contenteditable]")) return true;
    if (el.scrollWidth > el.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(el).overflowX)) return true;
  }
  return false;
}
const typing = (el) => el?.matches?.("input, textarea, select, [contenteditable]");
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

/**
 * A film's sheet under a finger (src/hooks/useModal.jsx). Drawn down from its
 * top, it follows and, let go far or fast enough, falls away and closes;
 * otherwise it springs back. Drawn sideways, it slides off and the film
 * beside it, in the row it was opened from, slides in; the arrow keys and
 * `slide` do the same. Scrolling the sheet, and the rows inside it, work as
 * before. `root` is the dialog around the sheet.
 */
export default function useSheetGestures(root, { onClose, step, peek }) {
  const latest = useRef({ onClose, step, peek });
  latest.current = { onClose, step, peek };
  const busy = useRef(false);

  // The sheet's frame (what moves) and the sheet inside it.
  const parts = () => {
    const sheet = root.current?.querySelector(".film-sheet");
    return { sheet, frame: sheet?.parentElement };
  };
  const shade = (p) => {
    if (root.current) root.current.style.backgroundColor = p == null ? "" : `rgb(0 0 0 / ${(0.75 * Math.max(0, 1 - p)).toFixed(3)})`;
  };
  const place = (frame, x, y) => { frame.style.transform = x || y ? `translate3d(${x}px, ${y}px, 0)` : ""; };
  const glide = async (frame, to, duration, easing) => {
    if (reducedMotion()) duration = 0;
    const from = frame.style.transform || "translate3d(0, 0, 0)";
    const a = frame.animate([{ transform: from }, { transform: to }], { duration, easing, fill: "forwards" });
    await a.finished.catch(() => {});
    frame.style.transform = to === "translate3d(0, 0, 0)" ? "" : to;
    a.cancel();
  };
  const settle = async (frame) => {
    shade(null);
    await glide(frame, "translate3d(0, 0, 0)", 380, "cubic-bezier(0.25, 1.45, 0.45, 1)");
  };

  // Away to the film beside this one: off one side, in from the other.
  const slide = useCallback(async (dir) => {
    const { sheet, frame } = parts();
    if (!sheet || busy.current) return;
    if (!latest.current.peek(dir)) { await settle(frame); return; }
    busy.current = true;
    haptic(8);
    const w = window.innerWidth;
    await glide(frame, `translate3d(${-dir * w}px, 0, 0)`, 190, "cubic-bezier(0.4, 0, 1, 1)");
    const id = latest.current.step(dir);
    // A moment for the sheet to show the next film, not more.
    for (const started = Date.now(); id && sheet.dataset.film !== id && Date.now() - started < 700;) await nextFrame();
    sheet.querySelector(".sheet-body")?.scrollTo(0, 0);
    place(frame, dir * w, 0);
    await glide(frame, "translate3d(0, 0, 0)", 340, "cubic-bezier(0.2, 0.9, 0.3, 1.04)");
    busy.current = false;
  }, []);

  useEffect(() => {
    const dialog = root.current;
    if (!dialog) return undefined;
    let touch = null;

    const onStart = (e) => {
      const { sheet } = parts();
      touch = null;
      if (busy.current || e.touches.length !== 1 || !sheet?.contains(e.target) || ownedBelow(e.target, sheet)) return;
      const t = e.touches[0];
      const body = sheet.querySelector(".sheet-body");
      touch = { x: t.clientX, y: t.clientY, mode: null, atTop: (body?.scrollTop ?? 0) <= 0 && dialog.scrollTop <= 0, samples: [[t.clientX, t.clientY, e.timeStamp]] };
    };
    const onMove = (e) => {
      if (!touch) return;
      const t = e.touches[0];
      const dx = t.clientX - touch.x, dy = t.clientY - touch.y;
      if (!touch.mode) {
        if (Math.hypot(dx, dy) < 10) return;
        // Down from the top closes, sideways moves on; anything else is the
        // sheet's own scrolling.
        if (!e.cancelable) { touch = null; return; }
        if (dy > 0 && Math.abs(dy) > Math.abs(dx) * 1.2 && touch.atTop) touch.mode = "down";
        else if (Math.abs(dx) > Math.abs(dy) * 1.4) touch.mode = "side";
        else { touch = null; return; }
      }
      e.preventDefault();
      touch.samples.push([t.clientX, t.clientY, e.timeStamp]);
      if (touch.samples.length > 6) touch.samples.shift();
      const { frame } = parts();
      if (!frame) return;
      if (touch.mode === "down") {
        // Upwards past where it started, it resists.
        const y = dy >= 0 ? dy : -Math.sqrt(-dy) * 3;
        place(frame, 0, y);
        shade(Math.max(0, y) / window.innerHeight);
      } else {
        // With no film that way, it only gives a little.
        place(frame, latest.current.peek(dx < 0 ? 1 : -1) ? dx : dx * 0.28, 0);
      }
    };
    const onEnd = async () => {
      const now = touch;
      touch = null;
      if (!now?.mode) return;
      const { frame } = parts();
      if (!frame) return;
      const [x0, y0, t0] = now.samples[0], [x1, y1, t1] = now.samples[now.samples.length - 1];
      const dt = Math.max(1, t1 - t0);
      const dx = x1 - now.x, dy = y1 - now.y, vx = (x1 - x0) / dt, vy = (y1 - y0) / dt;
      if (now.mode === "down") {
        if (dy > window.innerHeight * FAR_DOWN || (vy > FAST && dy > 24)) {
          // It falls at the speed it was thrown, and the room lights up.
          busy.current = true;
          haptic(10);
          const h = window.innerHeight;
          const duration = Math.max(140, Math.min(320, (h - dy) / Math.max(vy, 1.6)));
          root.current?.animate([{ backgroundColor: getComputedStyle(root.current).backgroundColor }, { backgroundColor: "rgb(0 0 0 / 0)" }], { duration, fill: "forwards" });
          await glide(frame, `translate3d(0, ${h}px, 0)`, duration, "cubic-bezier(0.3, 0.6, 0.6, 1)");
          busy.current = false;
          latest.current.onClose("gone");
        } else await settle(frame);
        return;
      }
      const dir = dx < 0 ? 1 : -1;
      if (Math.abs(dx) > window.innerWidth * FAR_SIDE || (Math.abs(vx) > FAST && Math.abs(dx) > 30)) await slide(dir);
      else await settle(frame);
    };
    // The arrow keys move along the row too, unless the member is typing.
    const onKey = (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || typing(e.target)) return;
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        const dir = e.key === "ArrowRight" ? 1 : -1;
        if (!latest.current.peek(dir)) return;
        e.preventDefault();
        slide(dir);
      }
    };
    dialog.addEventListener("touchstart", onStart, { passive: true });
    dialog.addEventListener("touchmove", onMove, { passive: false });
    dialog.addEventListener("touchend", onEnd);
    dialog.addEventListener("touchcancel", onEnd);
    window.addEventListener("keydown", onKey);
    return () => {
      dialog.removeEventListener("touchstart", onStart);
      dialog.removeEventListener("touchmove", onMove);
      dialog.removeEventListener("touchend", onEnd);
      dialog.removeEventListener("touchcancel", onEnd);
      window.removeEventListener("keydown", onKey);
    };
  }, [slide]);

  return slide;
}
