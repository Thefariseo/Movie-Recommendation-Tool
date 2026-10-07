// A film's colours, read from its smallest poster (92 px, a few KB, usually
// already in the browser's cache from the poster placeholders): the colour
// that dominates it and its most vivid accent. Kept per poster, across visits.
import { palette } from "../../shared/visual.js";

const KEY = "umbrify_film_colours_v1";
const MAX = 600;
let store = null;
const inflight = new Map();

function memory() {
  if (!store) {
    try { store = new Map(JSON.parse(localStorage.getItem(KEY) || "[]")); } catch { store = new Map(); }
  }
  return store;
}
let saving = 0;
function persist() {
  clearTimeout(saving);
  saving = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify([...memory()].slice(-MAX))); } catch { /* full or blocked */ }
  }, 1200);
}

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** [h 0-360, s 0-1, l 0-1] */
export function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

export function hslToRgb([h, s, l]) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255));
}

/**
 * From a palette ([{ hex, share }], largest first): the film's base colour
 * (the largest that is neither near-black nor near-white) and its accent
 * (the most vivid that covers a fair part of the poster). A black-and-white
 * poster is `mono`.
 */
export function pickColours(colours) {
  const all = colours.map((c) => ({ rgb: hexToRgb(c.hex), share: c.share })).map((c) => ({ ...c, hsl: rgbToHsl(c.rgb) }));
  const base = all.find((c) => c.hsl[2] > 0.1 && c.hsl[2] < 0.88) || all[0];
  const vivid = all.filter((c) => c.share >= 0.05 && c.hsl[2] > 0.16 && c.hsl[2] < 0.84)
    .sort((a, b) => b.hsl[1] * Math.sqrt(b.share) - a.hsl[1] * Math.sqrt(a.share))[0] || base;
  return { base: base.rgb, accent: vivid.rgb, mono: vivid.hsl[1] < 0.14 };
}

async function measure(path) {
  const response = await fetch(`https://image.tmdb.org/t/p/w92${path}`);
  if (!response.ok) throw new Error(`poster ${response.status}`);
  const bitmap = await createImageBitmap(await response.blob());
  const w = 46, h = 69;
  const canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return pickColours(palette(ctx.getImageData(0, 0, w, h).data, w, h, 5));
}

/** The colours of a film's poster (from its poster_path), or null. Never rejects. */
export function posterColours(path) {
  if (!/^\/[\w.-]+\.(?:jpe?g|png|webp)$/i.test(path || "")) return Promise.resolve(null);
  if (memory().has(path)) return Promise.resolve(memory().get(path));
  if (inflight.has(path)) return inflight.get(path);
  const work = measure(path)
    .then((colours) => { memory().set(path, colours); persist(); return colours; })
    .catch(() => null)
    .finally(() => inflight.delete(path));
  inflight.set(path, work);
  return work;
}

/** Colours already measured for a poster, without waiting. */
export const knownColours = (path) => memory().get(path) || null;

// The steps of the site's accent scale (Tailwind's indigo, src/index.css),
// as lightness: the film's accent hue is laid on the same steps.
const STEPS = { 50: 0.965, 100: 0.925, 200: 0.85, 300: 0.73, 400: 0.57, 500: 0.42, 600: 0.31, 700: 0.25, 800: 0.19, 900: 0.13, 950: 0.075 };

/**
 * CSS variables that turn the site's accent scale into the film's: buttons,
 * stars and links inside an element carrying them take the film's colour.
 * A black-and-white film gets a quiet grey with a trace of warmth.
 */
export function accentScale(colours) {
  if (!colours) return null;
  const [h, s] = rgbToHsl(colours.accent);
  const sat = colours.mono ? 0.06 : Math.max(0.38, Math.min(0.72, s));
  const hue = colours.mono ? 30 : h;
  return Object.fromEntries(Object.entries(STEPS).map(([step, l]) => {
    // Pale steps keep a little less colour, as the brand scale does.
    const sStep = l > 0.8 ? sat * 0.75 : sat;
    return [`--accent-${step}`, hslToRgb([hue, sStep, l]).join(" ")];
  }));
}
