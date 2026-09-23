"""Extract each film's visual style from its textless TMDB stills.

Usage (offline; TMDB_KEY in the environment; resumable, one JSON per film):
  pip install numpy pillow
  python scripts/visual-style/extract.py public/models/taste-space.bin cache/visual
  python scripts/visual-style/build.py cache/visual public/models/visual-style.bin

For every film the taste space knows, up to four of the best-voted backdrops
without text are downloaded at 300 px and measured: light (brightness,
contrast, share of deep shadow and of highlights), colour (saturation,
colourfulness, warm-cool balance, black-and-white), the hue mix, and a
five-colour palette. These describe colour and light only: stills say nothing
reliable about editing rhythm or camera movement.
"""
import io, json, os, struct, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from PIL import Image

space, out = sys.argv[1], sys.argv[2]
KEY = os.environ['TMDB_KEY']
os.makedirs(out, exist_ok=True)

b = open(space, 'rb').read()
_, n, k, _ = struct.unpack('<IIIf', b[4:20])
ids = np.frombuffer(b, '<i4', n, 20 + 4 * k * k)

def get(url, tries=4):
    for t in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=20) as r:
                return r.read()
        except Exception as e:
            if getattr(e, 'code', None) == 404: return None
            time.sleep(1.5 * (t + 1))
    return None

def measure(img):
    a = np.asarray(img.convert('RGB').resize((96, 54)), dtype=np.float32) / 255
    r, g, bl = a[..., 0], a[..., 1], a[..., 2]
    L = .2126 * r + .7152 * g + .0722 * bl
    mx, mn = a.max(-1), a.min(-1)
    s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    rg, yb = r - g, .5 * (r + g) - bl
    colourful = np.sqrt(rg.std() ** 2 + yb.std() ** 2) + .3 * np.sqrt(rg.mean() ** 2 + yb.mean() ** 2)
    h = np.asarray(img.convert('RGB').resize((96, 54)).convert('HSV'), dtype=np.float32)[..., 0] / 255
    w = s * mx
    hues = np.histogram(h, bins=6, range=(0, 1), weights=w)[0]
    hues = hues / max(hues.sum(), 1e-6)
    return {
        'brightness': float(L.mean()), 'contrast': float(L.std()),
        'shadows': float((L < .15).mean()), 'highlights': float((L > .85).mean()),
        'saturation': float(s.mean()), 'colourfulness': float(colourful),
        'warmth': float((r - bl).mean()), 'hues': hues.round(4).tolist(),
    }, a.reshape(-1, 3)

def palette(pixels, k=5, iters=12):
    rng = np.random.default_rng(0)
    pts = pixels[rng.choice(len(pixels), min(len(pixels), 4000), replace=False)]
    c = pts[rng.choice(len(pts), k, replace=False)]
    for _ in range(iters):
        lab = ((pts[:, None] - c[None]) ** 2).sum(-1).argmin(1)
        c = np.array([pts[lab == j].mean(0) if (lab == j).any() else c[j] for j in range(k)])
    share = np.bincount(lab, minlength=k) / len(pts)
    order = np.argsort(-share)
    return [('#%02x%02x%02x' % tuple((c[j] * 255).round().astype(int))) for j in order], share[order].round(3).tolist()

def film(tmdb):
    path = f'{out}/{tmdb}.json'
    if os.path.exists(path): return 'cached'
    meta = get(f'https://api.themoviedb.org/3/movie/{tmdb}/images?api_key={KEY}&include_image_language=null')
    stills = sorted(json.loads(meta).get('backdrops', []), key=lambda x: -x.get('vote_count', 0))[:4] if meta else []
    shots, pixels = [], []
    for s in stills:
        raw = get(f'https://image.tmdb.org/t/p/w300{s["file_path"]}')
        if not raw: continue
        m, px = measure(Image.open(io.BytesIO(raw)))
        shots.append(m); pixels.append(px)
    result = {'id': int(tmdb), 'stills': len(shots)}
    if shots:
        result.update({key: float(np.mean([s[key] for s in shots])) for key in shots[0] if key != 'hues'})
        result['hues'] = np.mean([s['hues'] for s in shots], 0).round(4).tolist()
        result['palette'], result['palette_share'] = palette(np.concatenate(pixels))
    json.dump(result, open(path, 'w'))
    return 'ok' if shots else 'empty'

done = 0
with ThreadPoolExecutor(16) as pool:
    for status in pool.map(film, ids.tolist()):
        done += 1
        if done % 500 == 0: print(done, 'of', n, flush=True)
print('finished', n)
