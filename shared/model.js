// Explicit-feedback biased matrix factorization, trained with seeded SGD.
// Ratings use Umbrify's 1–10 scale. No factors or user IDs are sent to browsers.
export function random(seed = 42) {
  let n = seed >>> 0;
  return () => {
    n = 1664525 * n + 1013904223 >>> 0;
    return n / 4294967296;
  };
}
export const clamp = x => Math.max(1, Math.min(10, x));
export function predict(model, userId, movieId) {
  const u = model.users[userId],
    i = model.items[movieId];
  if (!u || !i) return null;
  return clamp(model.mean + u.bias + i.bias + u.factors.reduce((s, x, k) => s + x * i.factors[k], 0));
}
export function fit(rows, {
  dimensions = 12,
  epochs = 100,
  learningRate = 0.015,
  regularization = 0.04,
  seed = 42
} = {}) {
  if (!rows.length) throw new Error('Ratings are required.');
  const rng = random(seed),
    model = {
      version: 1,
      dimensions,
      mean: rows.reduce((s, r) => s + Number(r.rating), 0) / rows.length,
      users: {},
      items: {}
    };
  const vector = () => ({
    bias: 0,
    factors: Array.from({
      length: dimensions
    }, () => (rng() - .5) * .2)
  });
  for (const r of rows) {
    if (!Number.isFinite(Number(r.rating)) || r.rating < 1 || r.rating > 10) throw new Error('Invalid rating.');
    model.users[r.user_id] ??= vector();
    model.items[r.movie_id] ??= vector();
  }
  const shuffled = [...rows];
  for (let epoch = 0; epoch < epochs; epoch++) {
    for (let k = shuffled.length - 1; k > 0; k--) {
      const j = Math.floor(rng() * (k + 1));
      [shuffled[j], shuffled[k]] = [shuffled[k], shuffled[j]];
    }
    const lr = learningRate / (1 + epoch * .005);
    for (const r of shuffled) {
      const u = model.users[r.user_id],
        i = model.items[r.movie_id];
      const raw = model.mean + u.bias + i.bias + u.factors.reduce((s, x, k) => s + x * i.factors[k], 0);
      const error = r.rating - raw;
      u.bias += lr * (error - regularization * u.bias);
      i.bias += lr * (error - regularization * i.bias);
      for (let k = 0; k < dimensions; k++) {
        const old = u.factors[k];
        u.factors[k] += lr * (error * i.factors[k] - regularization * u.factors[k]);
        i.factors[k] += lr * (error * old - regularization * i.factors[k]);
      }
    }
  }
  return model;
}
export function holdout(rows, seed = 42) {
  const rng = random(seed),
    byUser = new Map();
  for (const r of rows) {
    if (!byUser.has(r.user_id)) byUser.set(r.user_id, []);
    byUser.get(r.user_id).push(r);
  }
  const train = [],
    test = [];
  for (const ratings of byUser.values()) {
    const shuffled = [...ratings];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const n = ratings.length >= 5 ? Math.max(1, Math.floor(ratings.length * .2)) : 0;
    test.push(...shuffled.slice(0, n));
    train.push(...shuffled.slice(n));
  }
  const items = new Set(train.map(r => r.movie_id));
  const supported = test.filter(r => items.has(r.movie_id));
  return {
    train,
    test: supported,
    unsupported: test.length - supported.length
  };
}
export function evaluate(model, train, test) {
  const means = new Map();
  for (const r of train) {
    const [sum, n] = means.get(r.user_id) || [0, 0];
    means.set(r.user_id, [sum + r.rating, n + 1]);
  }
  let error = 0,
    baseline = 0,
    n = 0;
  for (const r of test) {
    const p = predict(model, r.user_id, r.movie_id);
    if (p == null) continue;
    const [sum, count] = means.get(r.user_id);
    error += (p - r.rating) ** 2;
    baseline += (sum / count - r.rating) ** 2;
    n++;
  }
  return {
    validation_count: n,
    rmse: n ? Math.sqrt(error / n) : null,
    baseline_rmse: n ? Math.sqrt(baseline / n) : null
  };
}
export function groupScore(scores) {
  if (!scores.length || scores.some(x => !Number.isFinite(x))) return null;
  return .6 * Math.min(...scores) + .4 * scores.reduce((a, b) => a + b, 0) / scores.length;
}
