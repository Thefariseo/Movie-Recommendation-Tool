import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./support/browser-modules.mjs', import.meta.url);
const { rankTrailers } = await import('../src/utils/trailers.js');

const v = (key, extra = {}) => ({ key, site: 'YouTube', type: 'Trailer', official: true, iso_639_1: 'en', size: 1080, published_at: '2010-05-01T00:00:00Z', name: 'Trailer', ...extra });

test('the official trailer beats adverts, TV spots and fan uploads, whatever TMDB\'s order', () => {
  // Parasite's list really opens with a Blu-ray advert.
  const videos = { results: [
    v('ad', { type: 'Teaser', name: 'OWN IT ON BLU-RAY & DVD!' }),
    v('spot', { type: 'Teaser', name: 'TV Spot #9' }),
    v('fan', { official: false, name: '35mm Theatrical Trailer #3', published_at: '2022-03-07T00:00:00Z' }),
    v('official', { name: 'Official Trailer' }),
    v('vimeo', { site: 'Vimeo', name: 'Official Trailer' })
  ] };
  const keys = rankTrailers(videos, { releaseDate: '2010-07-15' });
  assert.equal(keys[0], 'official');
  assert.ok(keys.indexOf('fan') < keys.indexOf('ad'), 'adverts come last');
  assert.ok(!keys.includes('vimeo'), 'only YouTube can be embedded');
});

test('a trailer in the member\'s language is preferred, then English', () => {
  const videos = { results: [v('en'), v('it', { iso_639_1: 'it', name: 'Trailer ufficiale' }), v('fr', { iso_639_1: 'fr' })] };
  assert.deepEqual(rankTrailers(videos, { language: 'it' }).slice(0, 2), ['it', 'en']);
  assert.equal(rankTrailers(videos, { language: 'en' })[0], 'en');
});

test('the trailer from the film\'s own release wins over a later re-release', () => {
  const videos = { results: [v('fest', { name: 'Ghibli Fest 2023 Trailer', published_at: '2023-09-29T00:00:00Z' }), v('original', { published_at: '2001-06-01T00:00:00Z' })] };
  assert.equal(rankTrailers(videos, { releaseDate: '2001-07-20' })[0], 'original');
});

test('the launch trailer beats later special-edition cuts (Parasite\'s real list)', () => {
  const videos = { results: [
    v('bw', { name: 'B&W Version Official Australian Trailer [Subtitled]', published_at: '2020-05-12T00:00:00Z' }),
    v('us2', { name: 'Official US Trailer 2 [Subtitled]', published_at: '2019-10-02T00:00:00Z' }),
    v('us', { name: 'Official US Trailer [Subtitled]', published_at: '2019-08-14T00:00:00Z' }),
    v('intl', { name: "Official Int'l Main Trailer [Subtitled]", published_at: '2019-05-10T00:00:00Z' })
  ] };
  const keys = rankTrailers(videos, { releaseDate: '2019-05-30' });
  assert.equal(keys[0], 'intl');
  assert.equal(keys.at(-1), 'bw');
});

test('no videos, no trailers', () => {
  assert.deepEqual(rankTrailers(undefined), []);
  assert.deepEqual(rankTrailers({ results: [v('clip', { type: 'Clip' })] }), []);
});
