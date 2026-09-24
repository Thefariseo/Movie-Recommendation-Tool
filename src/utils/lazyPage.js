// Pages and the film page load on demand. After a new release, a tab opened
// before it still asks for the old files, which no longer exist: the page is
// then reloaded once, to pick up the new release. A second failure in a row
// is a real one and is shown as an error.
import { lazy } from "react";

const KEY = "umbrify_reloaded_for_update";

export function lazyPage(load) {
  return lazy(() => load()
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
}
