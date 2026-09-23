// The taste space: a vector per film, learned from which films the same people
// love together (MovieLens 32M, trained offline by scripts/taste-space/train.py).
// A member is placed in that space from their own ratings, so a handful of loved
// films is enough to find others that people with the same taste loved.

const MAGIC = 'UMTS';

/** Parse the binary export into typed arrays. */
export function parseTasteSpace(buffer) {
  const view = new DataView(buffer);
  const magic = String.fromCharCode(...new Uint8Array(buffer, 0, 4));
  if (magic !== MAGIC || view.getUint32(4, true) !== 1) throw new Error('Unknown taste space format.');
  const n = view.getUint32(8, true), k = view.getUint32(12, true), lambda = view.getFloat32(16, true);
  let offset = 20;
  // Copies keep every array aligned whatever the offsets turn out to be.
  const take = (Type, count) => {
    const bytes = count * Type.BYTES_PER_ELEMENT;
    const out = new Type(buffer.slice(offset, offset + bytes));
    offset += bytes;
    return out;
  };
  const YtY = take(Float32Array, k * k);
  const tmdb = take(Int32Array, n);
  const scale = take(Float32Array, n);
  const counts = take(Uint32Array, n);
  const mean = take(Float32Array, n);
  const quantised = take(Int8Array, n * k);
  const vectors = new Float32Array(n * k);
  for (let i = 0; i < n; i++) for (let j = 0; j < k; j++) vectors[i * k + j] = quantised[i * k + j] * scale[i];
  const index = new Map();
  for (let i = 0; i < n; i++) index.set(tmdb[i], i);
  return { n, k, lambda, YtY, tmdb, counts, mean, vectors, index };
}

// A rating is evidence of liking only from 7/10 up, and more so the higher it
// is, exactly as the space was trained. A saved-for-later film is a weaker hint.
export function confidence(rated) {
  const stars = Number(rated) / 2;
  return stars >= 3.5 ? stars - 2.5 : 0;
}
const WATCHLIST_CONFIDENCE = 0.5;

function solve(A, b, k) {
  // Gaussian elimination with partial pivoting; A is k×k, symmetric positive definite.
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < k; c++) {
    let p = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < k; r++) {
      const f = M[r][c] / M[c][c];
      for (let j = c; j <= k; j++) M[r][j] -= f * M[c][j];
    }
  }
  const x = new Array(k).fill(0);
  for (let r = k - 1; r >= 0; r--) {
    let s = M[r][k];
    for (let j = r + 1; j < k; j++) s -= M[r][j] * x[j];
    x[r] = s / M[r][r];
  }
  return x;
}

/**
 * Place a member in the space. Returns null without at least `min` loved films
 * the space knows, since a vector from one film is little more than its neighbours.
 * `films` are { id, rated } in Umbrify's 1-10 scale; `saved` are watchlist ids.
 */
export function placeMember(space, films = [], saved = [], { min = 2 } = {}) {
  const { k, YtY, vectors, index, lambda } = space;
  const used = [];
  for (const f of films) {
    const i = index.get(Number(f.id)), c = confidence(f.rated);
    if (i != null && c > 0) used.push({ i, c, id: Number(f.id), rated: Number(f.rated), title: f.title });
  }
  const loved = used.length;
  const seen = new Set(used.map((u) => u.i));
  for (const id of saved) {
    const i = index.get(Number(id));
    if (i != null && !seen.has(i)) { used.push({ i, c: WATCHLIST_CONFIDENCE, id: Number(id) }); seen.add(i); }
  }
  if (loved < min) return null;
  const A = Array.from({ length: k }, (_, r) => Array.from({ length: k }, (_, c) => YtY[r * k + c] + (r === c ? lambda : 0)));
  const b = new Array(k).fill(0);
  for (const { i, c } of used) {
    const v = vectors.subarray(i * k, i * k + k);
    for (let r = 0; r < k; r++) {
      b[r] += (1 + c) * v[r];
      for (let q = 0; q < k; q++) A[r][q] += c * v[r] * v[q];
    }
  }
  const user = solve(A, b, k);
  return { vector: Float32Array.from(user), used, A };
}

/** Raw affinity of the member for film index i. */
export function affinityAt(space, member, i) {
  const { k, vectors } = space;
  let s = 0;
  for (let j = 0; j < k; j++) s += vectors[i * k + j] * member.vector[j];
  return s;
}

/**
 * Affinity for every film, standardised over the whole catalogue so that 0 is
 * an ordinary film for this member; strong matches sit several deviations up.
 */
export function affinities(space, member) {
  const out = new Float32Array(space.n);
  let sum = 0, sq = 0;
  for (let i = 0; i < space.n; i++) { const s = affinityAt(space, member, i); out[i] = s; sum += s; sq += s * s; }
  const mean = sum / space.n, sd = Math.sqrt(Math.max(sq / space.n - mean * mean, 1e-12));
  for (let i = 0; i < space.n; i++) out[i] = (out[i] - mean) / sd;
  return out;
}

/** The films the member is most likely to love, as [{ id, z, i }], excluding `exclude` ids. */
export function strongest(space, member, { limit = 40, exclude = new Set(), minRatings = 200, scores = affinities(space, member) } = {}) {
  const picks = [];
  for (let i = 0; i < space.n; i++) {
    if (space.counts[i] < minRatings || exclude.has(space.tmdb[i])) continue;
    picks.push({ id: space.tmdb[i], z: scores[i], i });
  }
  return picks.sort((a, b) => b.z - a.z).slice(0, limit);
}

/**
 * Which of the member's loved films pull a candidate up. The member's vector is
 * a weighted sum of their films, so the score splits exactly into one share per
 * film: (1 + c) · vᵢᵀ A⁻¹ v_film. Only films rated 7/10 or more are named.
 */
export function becauseOf(space, member, i, { limit = 2 } = {}) {
  const { k, vectors } = space;
  const x = solve(member.A, Array.from(vectors.subarray(i * k, i * k + k)), k);
  return member.used
    .filter((u) => u.rated && u.title)
    .map((u) => {
      let s = 0;
      for (let j = 0; j < k; j++) s += vectors[u.i * k + j] * x[j];
      return { title: u.title, rated: u.rated, id: u.id, share: (1 + u.c) * s };
    })
    .filter((u) => u.share > 0)
    .sort((a, b) => b.share - a.share)
    .slice(0, limit);
}

/** Cosine similarity between two films of the space, by TMDB id; null when unknown. */
export function similarity(space, a, b) {
  const i = space.index.get(Number(a)), j = space.index.get(Number(b));
  if (i == null || j == null) return null;
  const { k, vectors } = space;
  let dot = 0, na = 0, nb = 0;
  for (let q = 0; q < k; q++) {
    const x = vectors[i * k + q], y = vectors[j * k + q];
    dot += x * y; na += x * x; nb += y * y;
  }
  return dot / Math.sqrt(na * nb || 1);
}

/**
 * A standardised affinity as a bounded strength in (-1, 1). Affinities are
 * heavy-tailed (a Ghibli lover's next Ghibli sits twenty deviations up), so a
 * hard cap would tie every strong match; this keeps them ordered.
 */
export const peerStrength = z => (z == null ? 0 : Math.tanh(z / 6));
