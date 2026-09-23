"""Does looking alike predict rating alike? For MovieLens users, predict each
held-out rating from their other ratings weighted by visual similarity, and
compare with their plain mean. Result (445 films, 22,820 pairs): 0.9485 for the
mean, 0.9484 at best with visual neighbours, so looks never rank."""
BW, PRIOR = 32, 5
import json, glob, numpy as np, pandas as pd
import sys
CACHE, ML = sys.argv[1], sys.argv[2]
rows=[json.load(open(f)) for f in glob.glob(f'{CACHE}/*.json')]; rows=[r for r in rows if r.get('stills')]
keys=['brightness','contrast','shadows','highlights','saturation','colourfulness','warmth']
X=np.array([[r[k] for k in keys]+r['hues'] for r in rows]); X=(X-X.mean(0))/X.std(0)
ids=np.array([r['id'] for r in rows]); pos={t:i for i,t in enumerate(ids)}
r=pd.read_csv(f'{ML}/ratings.csv', usecols=['userId','movieId','rating']); d={'u': r.userId.values, 'm': r.movieId.values, 'y': r.rating.values}
links=pd.read_csv(f'{ML}/links.csv').dropna(subset=['tmdbId']).astype({'tmdbId': int})
mids=np.unique(d['m']); mt=pd.Series(links.set_index('movieId').tmdbId).reindex(mids).fillna(-1).astype(int).values
idx=np.searchsorted(mids, d['m']); t=mt[idx]
keep=np.isin(t, ids); u=d['u'][keep]; y=d['y'][keep]; f=np.array([pos[x] for x in t[keep]])
rng=np.random.default_rng(0); users=np.unique(u); rng.shuffle(users)
order=np.argsort(u,kind='stable'); us=u[order]; st=np.searchsorted(us, users); en=np.searchsorted(us, users, 'right')
se_b=se_v=se_g=0; n=0
D=((X[:,None]-X[None])**2).sum(-1)
for uid,a,b in zip(users[:4000],st[:4000],en[:4000]):
    ix=order[a:b]
    if len(ix)<20: continue
    ff=f[ix]; yy=y[ix]
    for j in range(min(len(ix),10)):
        rest=np.arange(len(ix))!=j; mean=yy[rest].mean()
        w=np.exp(-D[ff[j],ff[rest]]/BW); pv=mean+(w*(yy[rest]-mean)).sum()/(w.sum()+PRIOR)
        se_b+=(yy[j]-mean)**2; se_v+=(yy[j]-pv)**2; n+=1
print('pairs',n,'rmse user-mean',round((se_b/n)**.5,4),'visual kernel',round((se_v/n)**.5,4))
