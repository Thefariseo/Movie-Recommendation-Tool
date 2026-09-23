import test from 'node:test';
import assert from 'node:assert/strict';
import { measure, palette, combine, looksOf, eyeOf, lookSimilarity, REFERENCE } from '../shared/visual.js';

const image = (w, h, colour) => { const d = new Uint8ClampedArray(w * h * 4); for (let p = 0; p < w * h; p++) d.set([...colour(p % w, Math.floor(p / w)), 255], p * 4); return d; };
const flat = rgb => measure(image(8, 8, () => rgb), 8, 8);

test('light and colour are measured as the offline extractor measures them', () => {
  const black = flat([0, 0, 0]), white = flat([255, 255, 255]), red = flat([255, 0, 0]);
  assert.equal(black.brightness, 0); assert.equal(black.shadows, 1); assert.equal(black.saturation, 0);
  assert.equal(white.highlights, 1); assert.equal(white.contrast, 0);
  assert.equal(red.saturation, 1); assert.equal(red.warmth, 1);
  const split = measure(image(8, 8, x => (x < 4 ? [0, 0, 0] : [255, 255, 255])), 8, 8);
  assert.ok(Math.abs(split.contrast - 0.5) < 1e-9);
  assert.deepEqual(Object.keys(combine([black, white])), Object.keys(REFERENCE));
});

test('the palette finds the dominant colours, most common first', () => {
  const colours = palette(image(10, 10, x => (x < 7 ? [10, 20, 200] : [240, 200, 10])), 10, 10, 2);
  assert.deepEqual(colours.map(c => c.hex), ['#0a14c8', '#f0c80a']);
  assert.ok(Math.abs(colours[0].share - 0.7) < 0.02);
});

test('named looks follow the measures', () => {
  assert.deepEqual(looksOf(flat([128, 128, 128])).includes('bw'), true);
  assert.ok(looksOf({ brightness: .15, contrast: .2, shadows: .7, highlights: 0, saturation: .3, colourfulness: .1, warmth: .02 }).includes('moody'));
  assert.ok(looksOf({ brightness: .4, contrast: .22, shadows: .2, highlights: .05, saturation: .6, colourfulness: .3, warmth: .3 }).includes('warm'));
  assert.deepEqual(looksOf(null), []);
});

test('the eye names looks over-represented among loved films, with examples', () => {
  const moody = { brightness: .15, contrast: .2, shadows: .7, highlights: 0, saturation: .3, colourfulness: .1, warmth: .02 };
  const plain = { ...REFERENCE && Object.fromEntries(Object.entries(REFERENCE).map(([k, [m]]) => [k, m])) };
  const films = [
    ...['Se7en', 'Zodiac', 'Prisoners', 'Sicario'].map((title, i) => ({ title, rated: 10 - i % 2, look: moody })),
    { title: 'Loved plain', rated: 8, look: plain },
    ...['Meh 1', 'Meh 2', 'Meh 3'].map(title => ({ title, rated: 4, look: plain }))
  ];
  const [first] = eyeOf(films);
  assert.equal(first.key, 'moody');
  assert.equal(first.loved, 4);
  assert.deepEqual(first.examples, ['Se7en', 'Prisoners', 'Zodiac']);
  assert.deepEqual(eyeOf(films.slice(0, 3)), [], 'too few loved films say nothing');
  assert.ok(lookSimilarity(moody, moody) === 1 && lookSimilarity(moody, plain) < 0.6);
});
