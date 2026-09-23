// A film's look, measured from its stills: light (brightness, contrast, deep
// shadow, highlights) and colour (saturation, colourfulness, warm or cool).
// Stills say nothing reliable about editing or camera movement, so this is
// colour and light only.
//
// Tested offline on MovieLens against 445 well-known films, looking alike did
// not predict how people rate films (rating error 0.9485 with the member's
// mean, 0.9484 at best with visual neighbours). So a film's look describes and
// filters; it never ranks.

// Distribution over those 445 well-known films, the reference for "dark",
// "vivid" and the rest.
export const REFERENCE = {
  brightness: [0.357, 0.119], contrast: [0.226, 0.045], shadows: [0.320, 0.173], highlights: [0.083, 0.087],
  saturation: [0.376, 0.122], colourfulness: [0.167, 0.065], warmth: [0.064, 0.088]
};

/** Measure RGBA pixels (as canvas getImageData returns them). */
export function measure(data, width, height) {
  const n = width * height;
  let sumL = 0, sumL2 = 0, shadows = 0, highlights = 0, sat = 0, warm = 0;
  let rg = 0, rg2 = 0, yb = 0, yb2 = 0;
  for (let p = 0; p < n; p++) {
    const r = data[p * 4] / 255, g = data[p * 4 + 1] / 255, b = data[p * 4 + 2] / 255;
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    sumL += L; sumL2 += L * L;
    if (L < 0.15) shadows++;
    if (L > 0.85) highlights++;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    sat += mx > 0 ? (mx - mn) / mx : 0;
    warm += r - b;
    const a = r - g, c = 0.5 * (r + g) - b;
    rg += a; rg2 += a * a; yb += c; yb2 += c * c;
  }
  const mean = sumL / n;
  const sd = (s, s2) => Math.sqrt(Math.max(s2 / n - (s / n) ** 2, 0));
  const colourfulness = Math.hypot(sd(rg, rg2), sd(yb, yb2)) + 0.3 * Math.hypot(rg / n, yb / n);
  return {
    brightness: mean, contrast: Math.sqrt(Math.max(sumL2 / n - mean * mean, 0)),
    shadows: shadows / n, highlights: highlights / n, saturation: sat / n, colourfulness, warmth: warm / n
  };
}

/** Up to `k` dominant colours as hex, most common first (a few rounds of k-means). */
export function palette(data, width, height, k = 5) {
  const pts = [];
  const step = Math.max(1, Math.floor((width * height) / 1500));
  for (let p = 0; p < width * height; p += step) pts.push([data[p * 4], data[p * 4 + 1], data[p * 4 + 2]]);
  let centres = Array.from({ length: k }, (_, j) => pts[Math.floor(((j + 0.5) * pts.length) / k)]);
  let labels = [];
  for (let round = 0; round < 8; round++) {
    labels = pts.map((q) => centres.reduce((best, c, j) => {
      const d = (q[0] - c[0]) ** 2 + (q[1] - c[1]) ** 2 + (q[2] - c[2]) ** 2;
      return d < best[1] ? [j, d] : best;
    }, [0, Infinity])[0]);
    centres = centres.map((c, j) => {
      const mine = pts.filter((_, i) => labels[i] === j);
      return mine.length ? [0, 1, 2].map((ch) => mine.reduce((s, q) => s + q[ch], 0) / mine.length) : c;
    });
  }
  const counts = centres.map((_, j) => labels.filter((l) => l === j).length);
  return centres.map((c, j) => ({ hex: `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`, share: counts[j] / pts.length }))
    .sort((a, b) => b.share - a.share);
}

/** Averages several stills' measures into one look. */
export function combine(looks) {
  const keys = Object.keys(REFERENCE);
  return Object.fromEntries(keys.map((key) => [key, looks.reduce((s, l) => s + l[key], 0) / looks.length]));
}

const z = (look, key) => (look[key] - REFERENCE[key][0]) / REFERENCE[key][1];

// Named looks, each a test on how far a film sits from the reference.
export const LOOKS = {
  moody: { label: 'Dark & moody', test: (l) => z(l, 'brightness') < -0.6 && z(l, 'shadows') > 0.5 },
  bright: { label: 'Bright & airy', test: (l) => z(l, 'brightness') > 0.7 },
  vivid: { label: 'Vivid colour', test: (l) => z(l, 'colourfulness') > 0.8 && z(l, 'saturation') > 0.3 },
  muted: { label: 'Muted colour', test: (l) => z(l, 'saturation') < -0.7 && l.saturation > 0.08 },
  bw: { label: 'Black & white', test: (l) => l.saturation < 0.08 },
  warm: { label: 'Warm tones', test: (l) => z(l, 'warmth') > 0.8 && l.saturation >= 0.08 },
  cool: { label: 'Cool tones', test: (l) => z(l, 'warmth') < -0.8 && l.saturation >= 0.08 },
  contrast: { label: 'Hard contrast', test: (l) => z(l, 'contrast') > 1 }
};

/** The looks a film has, as keys of LOOKS. */
export const looksOf = (look) => (look ? Object.keys(LOOKS).filter((key) => LOOKS[key].test(look)) : []);

/**
 * The member's eye: which looks are over-represented among the films they
 * love, compared with how common each look is among everything they rated.
 * `films` are { title, rated, look }. Needs a few loved films with a look.
 */
export function eyeOf(films) {
  const withLook = films.filter((f) => f.look && f.rated != null);
  const loved = withLook.filter((f) => f.rated >= 8);
  if (loved.length < 4) return [];
  return Object.keys(LOOKS).map((key) => {
    const inLoved = loved.filter((f) => LOOKS[key].test(f.look));
    const share = inLoved.length / loved.length;
    const base = withLook.filter((f) => LOOKS[key].test(f.look)).length / withLook.length;
    return { key, label: LOOKS[key].label, share, lift: share - base, loved: inLoved.length, of: loved.length, examples: inLoved.sort((a, b) => b.rated - a.rated).slice(0, 3).map((f) => f.title) };
  }).filter((t) => t.loved >= 2 && t.share >= 0.3).sort((a, b) => b.share - a.share || b.lift - a.lift).slice(0, 3);
}

/** How alike two looks are, 0 to 1. */
export function lookSimilarity(a, b) {
  const keys = Object.keys(REFERENCE);
  const d2 = keys.reduce((s, key) => s + (z(a, key) - z(b, key)) ** 2, 0);
  return Math.exp(-d2 / (2 * keys.length));
}
