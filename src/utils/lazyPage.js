// Pages and the film page load on demand. After a new release, a tab opened
// before it still asks for the old files, which no longer exist: the page is
// then reloaded once, to pick up the new release. A second failure in a row
// is a real one and is shown as an error.
import { createElement, lazy } from "react";
import { whenQuiet } from "./activity";

const KEY = "umbrify_reloaded_for_update";
// Each main destination's file, fetched early so opening it is instant.
const loaders = new Map();

export function lazyPage(load, path = null) {
  let loaded = null;
  const fetchFile = () => load().then((module) => { loaded = module.default; return module; });
  if (path) loaders.set(path, fetchFile);
  const Lazy = lazy(() => fetchFile()
    .then((module) => {
      try { sessionStorage.removeItem(KEY); } catch { /* storage may be blocked */ }
      return module;
    })
    .catch((error) => {
      let reloaded = true;
      try { reloaded = sessionStorage.getItem(KEY) === "1"; if (!reloaded) sessionStorage.setItem(KEY, "1"); } catch { /* storage may be blocked */ }
      if (reloaded) throw error;
      window.location.reload();
      // Nothing renders while the page reloads.
      return new Promise(() => {});
    }));
  // Once its file is here (fetched ahead of time, or opened before), the page
  // draws in the same turn instead of a moment later: a transition into it
  // then finds it in place.
  const Page = (props) => createElement(loaded || Lazy, props);
  Page.ready = () => loaded !== null;
  return Page;
}

/** Fetches a destination's file ahead of time (a pointer resting on its link). */
export function preloadPage(path) {
  loaders.get(path)?.().catch(() => { /* fetched again, with its fallback, when opened */ });
}

/**
 * Once the page has loaded and its films have arrived, fetches the main
 * destinations' files, unless the visitor asked their browser to save data.
 */
export function preloadPagesWhenIdle() {
  if (typeof navigator !== "undefined" && navigator.connection?.saveData) return;
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 200));
  // Only once the page in front of the member has what it needs: fetched
  // earlier, these files compete with its own films.
  const start = () => whenQuiet().then(() => idle(() => { for (const path of loaders.keys()) preloadPage(path); }, { timeout: 3000 }));
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
}
