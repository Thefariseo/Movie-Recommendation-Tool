// Writes public/models/landmarks-<lang>.json: the titles, in that language,
// of the films the taste map names its regions after (its landmarks), so the
// map reads in the interface language without asking TMDB for each one.
// Usage: TMDB_KEY=... node scripts/taste-space/localize-landmarks.mjs it
import { readFileSync, writeFileSync } from 'node:fs';

const lang = process.argv[2] || 'it';
const locale = { it: 'it-IT' }[lang];
const key = process.env.TMDB_KEY || process.env.VITE_TMDB_KEY;
if (!locale || !key) throw new Error('Usage: TMDB_KEY=... node localize-landmarks.mjs it');

const map = JSON.parse(readFileSync(new URL('../../public/models/taste-map.json', import.meta.url)));
const ids = [...new Set([...map.landmarks, ...map.regions.flatMap((r) => r.landmarks || [])].map((l) => Number(l.id)))];
const titles = {};
for (let i = 0; i < ids.length; i += 8) {
  await Promise.all(ids.slice(i, i + 8).map(async (id) => {
    const r = await fetch(`https://api.themoviedb.org/3/movie/${id}?api_key=${key}&language=${locale}`);
    if (!r.ok) return;
    const film = await r.json();
    if (film.title) titles[id] = film.title;
  }));
}
writeFileSync(new URL(`../../public/models/landmarks-${lang}.json`, import.meta.url), JSON.stringify(titles));
console.log(`${Object.keys(titles).length} of ${ids.length} titles in ${locale}`);
