// A film's look, measured in the browser from its main still (TMDB serves
// images with open CORS). Results are tiny and kept in localStorage, so each
// film is measured once per browser.
import { measure, palette } from "../../shared/visual.js";
import { movieDetails } from "./api";

const KEY = "umbrify_looks_v1";
const MAX = 800;
let cache = null;
const inflight = new Map();

function store() {
  if (!cache) {
    try { cache = new Map(JSON.parse(localStorage.getItem(KEY) || "[]")); } catch { cache = new Map(); }
  }
  return cache;
}
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify([...store()].slice(-MAX))); } catch { /* storage may be full or blocked */ }
}

function pixels(path) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 96;
      canvas.height = 54;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, 96, 54);
      resolve(ctx.getImageData(0, 0, 96, 54).data);
    };
    img.onerror = () => reject(new Error("still unavailable"));
    img.src = `https://image.tmdb.org/t/p/w300${path}`;
  });
}

/** Cached look without measuring, or undefined. */
export const cachedLook = (id) => store().get(Number(id));

/** { ...measures, palette } for a film, or null when it has no still. */
export function lookOf(movie) {
  const id = Number(movie?.id);
  if (!id) return Promise.resolve(null);
  if (store().has(id)) return Promise.resolve(store().get(id));
  if (inflight.has(id)) return inflight.get(id);
  const work = (async () => {
    try {
      const path = movie.backdrop_path || (await movieDetails(id)).backdrop_path;
      if (!path) return null;
      const data = await pixels(path);
      const look = { ...measure(data, 96, 54), palette: palette(data, 96, 54).map((c) => c.hex) };
      store().set(id, look);
      persist();
      return look;
    } catch {
      return null;
    } finally {
      inflight.delete(id);
    }
  })();
  inflight.set(id, work);
  return work;
}
