import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url)));
const site = Object.fromEntries(config.headers.find(h => h.source === '/(.*)').headers.map(h => [h.key.toLowerCase(), h.value]));
const csp = Object.fromEntries(site['content-security-policy'].split(';').map(d => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));

test('every page is sent with a strict content security policy and the other protective headers', () => {
  assert.deepEqual(csp['default-src'], ["'self'"]);
  assert.deepEqual(csp['object-src'], ["'none'"]);
  assert.deepEqual(csp['frame-ancestors'], ["'none'"]);
  assert.deepEqual(csp['base-uri'], ["'self'"]);
  assert.ok(!csp['script-src'].some(s => /unsafe/.test(s)), 'no inline or eval scripts');
  assert.equal(site['x-frame-options'], 'DENY');
  assert.equal(site['x-content-type-options'], 'nosniff');
  assert.equal(site['referrer-policy'], 'strict-origin-when-cross-origin');
  assert.match(site['permissions-policy'], /camera=\(\)/);
});

// Every external host the browser code names must be allowed by the policy,
// or the feature using it breaks silently in production.
test('the policy allows every external host the app loads from', () => {
  const files = [];
  const walk = dir => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(jsx?|css)$/.test(f)) files.push(p); } };
  walk(new URL('../src', import.meta.url).pathname);
  const allowed = [...csp['img-src'], ...csp['connect-src'], ...csp['frame-src'], ...csp['style-src'], ...csp['script-src']];
  const covers = host => allowed.some(a => a === `https://${host}` || (a.startsWith('https://*.') && host.endsWith(a.slice(9))));
  // Hosts only ever linked to, never loaded from.
  const linkOnly = new Set(['www.themoviedb.org', 'letterboxd.com', 'www.imdb.com', 'www.justwatch.com', 'www.cinematlas.it', 'umbrify.vercel.app', 'www.youtube.com']);
  const hosts = new Set(files.flatMap(f => [...readFileSync(f, 'utf8').matchAll(/https:\/\/([a-z0-9.-]+\.[a-z]{2,})/g)].map(m => m[1])));
  for (const host of hosts) if (!linkOnly.has(host)) assert.ok(covers(host), `${host} is used by the app but not allowed by the policy`);
  assert.ok(csp['frame-src'].includes('https://www.youtube-nocookie.com'), 'trailers play');
});
