// Match the browser's 96 × 54 analysis of the TMDB main still.
// Only fixed-host TMDB image paths are fetched, never arbitrary user URLs.
import sharp from "sharp";
import { measure } from "../shared/visual.js";
const cache = new Map();
export async function filmLook(movie) {
  const path = movie.backdrop_path;
  if (
    typeof path !== "string" ||
    !/^\/[a-zA-Z0-9_-]+\.(jpg|png|webp)$/.test(path)
  )
    return null;
  if (cache.has(path)) return cache.get(path);
  try {
    const response = await fetch(`https://image.tmdb.org/t/p/w300${path}`, {
      signal: AbortSignal.timeout(4000),
      redirect: "error",
    });
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 2_000_000) return null;
    const rgba = await sharp(bytes, { limitInputPixels: 4_000_000 })
      .resize(96, 54, { fit: "fill" })
      .toColourspace("srgb")
      .ensureAlpha()
      .raw()
      .toBuffer();
    const look = measure(rgba, 96, 54);
    if (cache.size >= 800) cache.delete(cache.keys().next().value);
    cache.set(path, look);
    return look;
  } catch {
    return null;
  }
}
