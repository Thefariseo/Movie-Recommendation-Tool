// The taste space on the server. Functions run on Edge, without a filesystem,
// so the static file is fetched from the site itself once per warm instance.
import { parseTasteSpace } from '../shared/tasteSpace.js';
import { parseTasteMap } from '../shared/journeys.js';

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

let mapLoading = null;

/** The taste map ({ map, regions }), fetched like the space; null when it cannot be. */
export function loadTasteMap() {
  const origin = process.env.APP_URL;
  if (!origin) return Promise.resolve(null);
  mapLoading ??= Promise.all([
    fetch(new URL('/models/taste-map.bin', origin)).then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`taste map ${r.status}`)))),
    fetch(new URL('/models/taste-map.json', origin)).then(r => (r.ok ? r.json() : Promise.reject(new Error(`taste map ${r.status}`))))
  ])
    .then(([bin, meta]) => ({ map: parseTasteMap(bin), regions: meta.regions }))
    .catch(() => {
      mapLoading = null;
      return null;
    });
  return mapLoading;
}
