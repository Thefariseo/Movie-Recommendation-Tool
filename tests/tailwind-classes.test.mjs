import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// tailwind.config.cjs loads @tailwindcss/aspect-ratio, which switches off
// Tailwind's own aspect-* utilities: aspect-video silently produced no CSS and
// the trailer player collapsed to zero height (sound, no picture). Use an
// inline aspectRatio style, or the plugin's aspect-w-* / aspect-h-* classes.
const files = dir => readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : /\.(jsx?|html)$/.test(f) ? [p] : []; });

test('no aspect-* utility that the aspect-ratio plugin disables', () => {
  const offenders = files(new URL('../src', import.meta.url).pathname)
    .filter(f => /(["'`\s])aspect-(auto|square|video|\[)/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(offenders, []);
});
