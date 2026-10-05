// Loads the taste map (coordinates and regions, ~0.1 MB) once per visit.
import { parseTasteMap } from "../../shared/journeys.js";
import { currentLanguage } from "../i18n/index.js";

let loading = null;

// The regions are named after well-known films, with English titles in the
// map's data; other languages have their titles in landmarks-<lang>.json.
const localTitles = () => {
  const lang = currentLanguage();
  if (lang === "en") return Promise.resolve(null);
  return fetch(`/models/landmarks-${lang}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
};
const localize = (titles) => (l) => (titles?.[l.id] ? { ...l, title: titles[l.id], original_title: l.title } : l);

/** { map, regions, landmarks }, or null when it cannot be loaded. */
export function loadTasteMap() {
  loading ??= Promise.all([
    fetch("/models/taste-map.bin").then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`taste map ${r.status}`)))),
    fetch("/models/taste-map.json").then((r) => (r.ok ? r.json() : Promise.reject(new Error(`taste map ${r.status}`)))),
    localTitles(),
  ])
    .then(([bin, meta, titles]) => {
      const named = localize(titles);
      return {
        map: parseTasteMap(bin),
        regions: meta.regions.map((r) => ({ ...r, landmarks: (r.landmarks || []).map(named) })),
        landmarks: meta.landmarks.map(named),
      };
    })
    .catch(() => {
      loading = null;
      return null;
    });
  return loading;
}
