"""Lay the taste space out as a map and split it into regions.

Usage (after train.py, with the same MovieLens folder):
  pip install numpy pandas scikit-learn
  python scripts/taste-space/map.py ml-32m public/models/taste-space.bin public/models/taste-map.bin public/models/taste-map.json

Films are placed in 2-D with t-SNE on their normalised taste vectors, so films
loved by the same people sit together, and grouped into regions with k-means
in the full space. Each region is named after its best-known films and its
dominant genres and decades, from MovieLens titles (same licence).

taste-map.bin, little endian, films in taste-space order:
  'UMTM' | u32 version | u32 n | u16[n] x | u16[n] y | u8[n] region
"""
import sys, struct, re, json, numpy as np, pandas as pd
from sklearn.manifold import TSNE
from sklearn.cluster import KMeans

src, space, out_bin, out_json = sys.argv[1:5]
REGIONS = 48

b = open(space, 'rb').read()
_, n, k, _ = struct.unpack('<IIIf', b[4:20]); o = 20 + 4 * k * k
tmdb = np.frombuffer(b, '<i4', n, o); o += 4 * n
scale = np.frombuffer(b, '<f4', n, o); o += 4 * n
counts = np.frombuffer(b, '<u4', n, o); o += 4 * n
o += 4 * n
V = np.frombuffer(b, 'i1', n * k, o).reshape(n, k).astype(np.float32) * scale[:, None]
U = V / np.maximum(np.linalg.norm(V, axis=1, keepdims=True), 1e-9)

xy = TSNE(n_components=2, perplexity=40, init='pca', random_state=0, metric='cosine').fit_transform(U)
xy = (xy - xy.min(0)) / (xy.max(0) - xy.min(0))
q = np.round(xy * 65535).astype(np.uint16)
region = KMeans(REGIONS, n_init=4, random_state=0).fit_predict(U).astype(np.uint8)

links = pd.read_csv(f'{src}/links.csv').dropna(subset=['tmdbId'])
movies = pd.read_csv(f'{src}/movies.csv').merge(links, on='movieId')
movies['tmdbId'] = movies.tmdbId.astype(int)
meta = movies.drop_duplicates('tmdbId').set_index('tmdbId')

def clean(title):
    m = re.match(r'^(.*?)\s*\((\d{4})\)\s*$', title.strip())
    name, year = (m.group(1), int(m.group(2))) if m else (title.strip(), None)
    name = re.sub(r'\s*\(a\.k\.a\..*?\)', '', name)
    name = re.sub(r'\s*\([^)]*\)$', '', name).strip()   # drop original-language titles in brackets
    name = re.sub(r'^(.*), (The|A|An|Les|La|Le|Il|L\'|Der|Die|Das|El)$', r'\2 \1', name).replace("L' ", "L'")
    return name, year

films = []
for i in range(n):
    t = int(tmdb[i])
    title, year = clean(meta.title.get(t, '')) if t in meta.index else ('', None)
    genres = [g for g in str(meta.genres.get(t, '')).split('|') if g and g != '(no genres listed)'] if t in meta.index else []
    films.append((title, year, genres))

regions = []
for r in range(REGIONS):
    idx = np.where(region == r)[0]
    top = idx[np.argsort(-counts[idx])]
    genres = pd.Series([g for i in idx for g in films[i][2]]).value_counts()
    years = [films[i][1] for i in idx if films[i][1]]
    regions.append({
        'id': r,
        'size': int(len(idx)),
        'x': round(float(xy[idx, 0].mean()), 4), 'y': round(float(xy[idx, 1].mean()), 4),
        'genres': [g for g in genres.index[:3]],
        'decade': int(np.median(years) // 10 * 10) if years else None,
        'landmarks': [{'id': int(tmdb[i]), 'title': films[i][0], 'year': films[i][1]} for i in top[:5] if films[i][0]],
    })

# The best-known films anywhere, to label the map.
landmarks = [{'id': int(tmdb[i]), 'title': films[i][0], 'year': films[i][1], 'x': round(float(xy[i, 0]), 4), 'y': round(float(xy[i, 1]), 4)}
             for i in np.argsort(-counts)[:160] if films[i][0]]

with open(out_bin, 'wb') as f:
    f.write(b'UMTM'); f.write(struct.pack('<II', 1, n))
    f.write(q[:, 0].astype('<u2').tobytes()); f.write(q[:, 1].astype('<u2').tobytes()); f.write(region.tobytes())
json.dump({'version': 1, 'regions': regions, 'landmarks': landmarks}, open(out_json, 'w'), ensure_ascii=False, separators=(',', ':'))
print(n, 'films,', REGIONS, 'regions')
for r in regions[:8]: print(r['genres'], r['decade'], [l['title'] for l in r['landmarks'][:3]])
