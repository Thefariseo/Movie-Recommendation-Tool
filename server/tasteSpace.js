// The taste space on the server. Functions run on Edge, without a filesystem,
// so the static file is fetched from the site itself once per warm instance.
import { parseTasteSpace } from '../shared/tasteSpace.js';

let loading = null;

/** The parsed taste space, or null when it cannot be fetched; picks then carry on without it. */
export function loadTasteSpace() {
  const origin = process.env.APP_URL;
  if (!origin) return Promise.resolve(null);
  loading ??= fetch(new URL('/models/taste-space.bin', origin))
    .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`taste space ${r.status}`))))
    .then(parseTasteSpace)
    .catch(() => {
      loading = null;
      return null;
    });
  return loading;
}
