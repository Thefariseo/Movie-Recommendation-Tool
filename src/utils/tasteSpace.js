// Loads the taste space once per visit. It is a static file of about 0.6 MB,
// fetched only when recommendations are built and cached by the browser after.
import { parseTasteSpace } from "../../shared/tasteSpace.js";

let loading = null;

/** The parsed taste space, or null when it cannot be loaded; picks then carry on without it. */
export function loadTasteSpace() {
  loading ??= fetch("/models/taste-space.bin")
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`taste space ${r.status}`))))
    .then(parseTasteSpace)
    .catch(() => {
      loading = null;
      return null;
    });
  return loading;
}
