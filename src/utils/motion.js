// Motion helpers: view transitions between states, a tap of haptic feedback,
// and posters that fade in. Each one does nothing for those who ask their
// system to reduce motion, and on browsers without the feature.
import { flushSync } from "react-dom";

export const reducedMotion = () => {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
};

const canTransition = () => typeof document !== "undefined" && typeof document.startViewTransition === "function" && !reducedMotion();

/**
 * Runs a state change as a view transition: the browser cross-fades from the
 * old screen to the new one (and morphs elements that share a
 * view-transition-name). `update` must change the page synchronously.
 */
export function withTransition(update) {
  if (!canTransition()) { update(); return; }
  try {
    document.startViewTransition(() => flushSync(update));
  } catch {
    update();
  }
}

/** A short vibration on phones that have one, to confirm a save or a rating. */
export function haptic(ms = 10) {
  try {
    if (window.matchMedia("(pointer: coarse)").matches) navigator.vibrate?.(ms);
  } catch { /* not supported */ }
}

/** Plays the "pop" on an element (a star, a save button) that was just used. */
export function pop(el) {
  if (!el || reducedMotion()) return;
  el.classList.remove("tap-pop");
  // Restart the animation when tapped again quickly.
  void el.offsetWidth;
  el.classList.add("tap-pop");
  el.addEventListener("animationend", () => el.classList.remove("tap-pop"), { once: true });
}

/**
 * Film images that are not ready yet fade in when they arrive, instead of
 * popping in. Images already in the browser's cache show at once. An image
 * marked data-no-fade (one that is animated otherwise) is left alone.
 */
export function fadeInImages(root = document.body) {
  if (reducedMotion()) return () => {};
  const seen = new WeakSet();
  const handle = (img) => {
    if (seen.has(img)) return;
    seen.add(img);
    if (img.hasAttribute("data-no-fade") || img.complete) return;
    if (!/image\.tmdb\.org|ytimg\.com/.test(img.getAttribute("src") || "")) return;
    img.classList.add("img-fade");
    const done = () => img.classList.add("img-in");
    img.addEventListener("load", done, { once: true });
    img.addEventListener("error", done, { once: true });
  };
  root.querySelectorAll("img").forEach(handle);
  const observer = new MutationObserver((records) => {
    for (const r of records) {
      for (const node of r.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.tagName === "IMG") handle(node);
        else node.querySelectorAll?.("img").forEach(handle);
      }
    }
  });
  observer.observe(root, { childList: true, subtree: true });
  return () => observer.disconnect();
}

/**
 * Buttons marked data-pop (save, seen, a star) pop and, on phones, give a
 * short vibration when used. data-pop="parent" pops the element around the
 * button (a star around its two halves).
 */
export function installTapFeedback(root = document) {
  const onClick = (e) => {
    const el = e.target.closest?.("[data-pop]");
    if (!el || el.disabled) return;
    pop(el.dataset.pop === "parent" ? el.parentElement : el.querySelector("svg") || el);
    haptic();
  };
  root.addEventListener("click", onClick, true);
  return () => root.removeEventListener("click", onClick, true);
}
