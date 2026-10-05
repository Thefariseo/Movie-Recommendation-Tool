import test from 'node:test';
import assert from 'node:assert/strict';
import { translator } from '../src/i18n/index.js';
import it from '../src/i18n/it.js';

test('exact strings, patterns with reordered slots, and the spacing around them', () => {
  const tr = translator(it);
  assert.equal(tr('Discover'), 'Scopri');
  assert.equal(tr('  Not now '), '  Non ora ');
  assert.equal(tr('You have explored 7 of 48 regions of cinema.'), 'Hai esplorato 7 regioni del cinema su 48.');
  assert.equal(tr('Week 3 of 10: Ran'), 'Settimana 3 di 10: Ran');
  assert.equal(tr('Loading Trending this week'), 'Caricamento: Di tendenza questa settimana', 'a slot that is interface text is translated too');
  assert.equal(tr('Heat'), 'Heat', 'anything not in the dictionary stays as it is');
  assert.equal(tr('42'), '42');
});

test('the recommender\'s explanations, sentence by sentence, with the bits inside them', () => {
  const tr = translator(it);
  assert.equal(tr('Fans of "Ran" love it — you gave 4.5★ · +2 more'), 'Chi ama "Ran" lo adora: gli hai dato 4.5★ · +2 altri');
  assert.equal(
    tr('2 things point to this film for you. People who loved "The Matrix" (your pick) and "Ran" (5★), as you did, tend to love this one too. By Akira Kurosawa: you gave "Ikiru" 4★.'),
    '2 indizi portano a questo film per te. Chi ha amato "The Matrix" (scelto da te) e "Ran" (5★), come te, tende ad amare anche questo. Di Akira Kurosawa: hai dato "Ikiru" 4★.'
  );
  assert.equal(tr('Because you loved “Harry and Sally”'), 'Perché hai amato «Harry and Sally»', 'titles keep their words');
  assert.equal(tr('A sentence nobody wrote. Another one.'), 'A sentence nobody wrote. Another one.');
});

test('every pattern names its slots in the translation, and no key is a bare slot', () => {
  for (const [en, out] of Object.entries(it).filter(([k]) => !k.startsWith('__'))) {
    const slots = (s) => [...s.matchAll(/\{(\d)\}/g)].map((m) => m[1]).sort().join();
    assert.equal(slots(out), slots(en), en);
    assert.match(en.replace(/\{\d\}/g, ''), /[A-Za-z]/, en);
  }
});

test('each request fetches films in the language it was made in', async () => {
  const { execute, tmdbLocale } = await import('../server/http.js');
  const seen = [];
  const ask = (lang) => execute(new Request('https://umbrify.test/api/x', { headers: lang ? { 'X-Umbrify-Lang': lang } : {} }), async () => { seen.push(tmdbLocale()); return {}; });
  await Promise.all([ask('it'), ask('en'), ask('xx'), ask(null)]);
  assert.deepEqual(seen, ['it-IT', 'en-US', 'en-US', 'en-US']);
  assert.equal(tmdbLocale(), 'en-US', 'outside a request');
});
