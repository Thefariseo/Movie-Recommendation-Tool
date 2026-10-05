import test from 'node:test';
import assert from 'node:assert/strict';
import { bestMatch } from '../shared/titleMatch.js';

const film = (id, title, original_title, release_date, vote_count) => ({ id, title, original_title, release_date, vote_count });

test('a well-known film a year off wins over an unknown one of the exact year (Salò)', () => {
  const candidates = [
    film(1523709, 'Backstage on the Set of Salò, or the 120 Days of Sodom', 'Backstage sul set di Salò', '1975-12-10', 0),
    film(5336, 'Salò, or the 120 Days of Sodom', 'Salò o le 120 giornate di Sodoma', '1976-01-10', 2378),
  ];
  assert.equal(bestMatch(candidates, { title: 'Salò, or the 120 Days of Sodom', year: 1975 }).id, 5336);
});

test('a film found under another of its titles still counts (Caro diario as "Dear Diary")', () => {
  const candidates = [
    film(25403, 'Caro diario', 'Caro diario', '1993-11-12', 529),
    film(244901, 'Dear Diary', 'Dear Diary', '1996-12-13', 13),
  ];
  assert.equal(bestMatch(candidates, { title: 'Dear Diary', year: 1993 }).id, 25403);
});

test('spelling differences are forgiven, documentaries about a film are not preferred to it', () => {
  const candidates = [
    film(997152, 'Nostalghia Nostalghia', 'Nostalghia Nostalghia', '2012-01-01', 0),
    film(420164, 'Andrey Tarkovsky in Nostalghia', 'Andreij Tarkovskij in Nostalghia', '1984-05-05', 6),
    film(1394, 'Nostalgia', 'Ностальгия', '1983-05-01', 630),
  ];
  assert.equal(bestMatch(candidates, { title: 'Nostalghia', year: 1983 }).id, 1394);
  assert.equal(bestMatch([film(108, 'Three Colors: Blue', 'Trois couleurs : Bleu', '1993-09-08', 1963)], { title: 'Three Colours: Blue', year: 1993 }).id, 108);
});

test('the year separates remakes, and nothing is invented from no results', () => {
  const both = [film(11906, 'Suspiria', 'Suspiria', '1977-02-01', 3275), film(361292, 'Suspiria', 'Suspiria', '2018-10-26', 2847)];
  assert.equal(bestMatch(both, { title: 'Suspiria', year: 1977 }).id, 11906);
  assert.equal(bestMatch(both, { title: 'Suspiria', year: 2018 }).id, 361292);
  assert.equal(bestMatch([], { title: 'Anything', year: 2000 }), null);
  assert.equal(bestMatch(both, { title: '', year: 2000 }), null);
});
