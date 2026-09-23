"""Train Umbrify's taste space from MovieLens 32M and export it for the app.

Usage (offline, once per refresh; the dataset is not part of the repository):
  pip install numpy scipy pandas implicit
  curl -O https://files.grouplens.org/datasets/movielens/ml-32m.zip && unzip ml-32m.zip
  python scripts/taste-space/train.py ml-32m public/models/taste-space.bin

Model: implicit ALS where a rating is evidence of liking only from 3.5/5 up,
with confidence growing with the rating (the "pos" scheme). Evaluated on 2,000
held-out users who reveal 5/10/20 random ratings: recall@20 of their hidden
4.5+ films is 0.285/0.324/0.347, against 0.253/0.251/0.249 for popularity.

MovieLens is licensed for non-commercial research use; see README.txt in the
dataset. Umbrify credits GroupLens on its privacy page.

Binary layout, little endian:
  'UMTS' | u32 version | u32 n | u32 k | f32 lambda
  f32[k*k] YtY | i32[n] tmdb ids | f32[n] scale | u32[n] rating counts
  f32[n] shrunk mean rating (0.5-5) | i8[n*k] quantised factors
"""
import sys, struct, numpy as np, pandas as pd, scipy.sparse as sp
from implicit.als import AlternatingLeastSquares

src, out = sys.argv[1], sys.argv[2]
FACTORS, REG, ALPHA, ITER, MIN_RATINGS, FOLD_IN_LAMBDA = 24, .05, 1.0, 20, 50, 35.0

r = pd.read_csv(f'{src}/ratings.csv', usecols=['userId', 'movieId', 'rating'], dtype={'userId': 'int32', 'movieId': 'int32', 'rating': 'float32'})
links = pd.read_csv(f'{src}/links.csv').dropna(subset=['tmdbId'])
links = links[links.tmdbId > 0].drop_duplicates('tmdbId').astype({'tmdbId': 'int64'})
r = r.merge(links[['movieId', 'tmdbId']], on='movieId')
counts = r.movieId.value_counts()
r = r[r.movieId.map(counts) >= MIN_RATINGS]
mids, mi = np.unique(r.movieId.values, return_inverse=True)
_, ui = np.unique(r.userId.values, return_inverse=True)
y = r.rating.values
conf = np.where(y >= 3.5, y - 2.5, 0).astype(np.float32)
X = sp.csr_matrix((conf, (ui, mi)), shape=(ui.max() + 1, len(mids)))
X.eliminate_zeros()
model = AlternatingLeastSquares(factors=FACTORS, regularization=REG, alpha=ALPHA, iterations=ITER, random_state=0)
model.fit(X, show_progress=True)
V = np.asarray(model.item_factors, dtype=np.float32)[:, :FACTORS]

scale = np.maximum(np.abs(V).max(1), 1e-8) / 127
Q = np.round(V / scale[:, None]).astype(np.int8)
Vq = Q.astype(np.float32) * scale[:, None]
YtY = (Vq.T @ Vq).astype(np.float32)
n = np.bincount(mi, minlength=len(mids)).astype(np.uint32)
sums = np.bincount(mi, weights=y, minlength=len(mids))
shrunk = ((sums + 50 * y.mean()) / (n + 50)).astype(np.float32)
tmdb = links.set_index('movieId').tmdbId.reindex(mids).values.astype(np.int32)

with open(out, 'wb') as f:
    f.write(b'UMTS'); f.write(struct.pack('<IIIf', 1, len(mids), FACTORS, FOLD_IN_LAMBDA))
    for a in (YtY, tmdb, scale.astype(np.float32), n, shrunk, Q): f.write(a.astype(a.dtype.newbyteorder('<')).tobytes())
print(f'{len(mids)} films, {FACTORS} factors -> {out}')
