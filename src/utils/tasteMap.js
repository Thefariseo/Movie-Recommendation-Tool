// Loads the taste map (coordinates and regions, ~0.1 MB) once per visit.
import { parseTasteMap } from "../../shared/journeys.js";

let loading = null;

/** { map, regions, landmarks }, or null when it cannot be loaded. */
export function loadTasteMap() {
  loading ??= Promise.all([
    fetch("/models/taste-map.bin").then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`taste map ${r.status}`)))),
    fetch("/models/taste-map.json").then((r) => (r.ok ? r.json() : Promise.reject(new Error(`taste map ${r.status}`))))
  ])
    .then(([bin, meta]) => ({ map: parseTasteMap(bin), regions: meta.regions, landmarks: meta.landmarks }))
    .catch(() => {
      loading = null;
      return null;
    });
  return loading;
}
