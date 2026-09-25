import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execute } from '../server/http.js';
import { critic } from '../api/critic.js';

const id = '11111111-1111-4111-8111-111111111111';
const originalFetch = globalThis.fetch;
const json = (data, status = 200) => Response.json(data, { status });
const request = (path, data) => new Request(`https://umbrify.test/api/${path}`, {
  method: data === undefined ? 'GET' : 'POST',
  headers: { Origin: 'https://umbrify.test', 'X-Umbrify-Request': '1', 'Content-Type': 'application/json', Cookie: 'umbrify_access=valid' },
  ...(data === undefined ? {} : { body: JSON.stringify(data) })
});
beforeEach(() => {
  Object.assign(process.env, { APP_URL: 'https://umbrify.test', SUPABASE_URL: 'https://db.test', SUPABASE_ANON_KEY: 'public', TMDB_KEY: 'tmdb' });
  delete process.env.OPENAI_API_KEY; delete process.env.OPENAI_CHAT_MODEL; delete process.env.OPENAI_CRITIC_MODEL;
  delete process.env.CRITIC_API_URL; delete process.env.CRITIC_API_KEY; delete process.env.CRITIC_MODEL; delete process.env.OPENAI_CRITIC_REASONING;
});
afterEach(() => { globalThis.fetch = originalFetch; });

// Real TMDB ids the shipped taste space knows.
const DIARY = [[129, 'Spirited Away', 10], [128, 'Princess Mononoke', 10], [8392, 'My Neighbor Totoro', 9], [550, 'Fight Club', 3], [680, 'Pulp Fiction', 2]];
const rows = DIARY.map(([movie_id, title, rating]) => ({ kind: 'watched', movie_id, rating, movie: { id: movie_id, title, year: 2001, genre_ids: [16] } }));

function backend({ reply, replies = null, memory = [], threads = [], verdicts = [] } = {}) {
  const seen = { openai: [], saved: [], threads: [], verdicts: [], signals: [] };
  globalThis.fetch = async (url, options = {}) => {
    const u = new URL(url);
    if (u.pathname.endsWith('/auth/v1/user')) return json({ id });
    if (u.pathname === '/models/taste-space.bin') return new Response(readFileSync(new URL('../public/models/taste-space.bin', import.meta.url)));
    if (u.pathname.endsWith('/rpc/consume_limit')) return json(true);
    if (u.pathname.endsWith('/user_movies')) return json(rows);
    if (u.pathname.endsWith('/critic_verdicts')) {
      if (!options.method || options.method === 'GET') return json(verdicts);
      const body = JSON.parse(options.body); seen.verdicts.push(body); verdicts = [{ verdict: body.verdict }]; return new Response(null, { status: 201 });
    }
    if (u.pathname.endsWith('/taste_signals')) { seen.signals.push(...[].concat(JSON.parse(options.body))); return new Response(null, { status: 201 }); }
    if (u.pathname.endsWith('/critic_threads')) {
      if (!options.method || options.method === 'GET') return json(threads);
      const body = options.method === 'DELETE' ? {} : JSON.parse(options.body);
      seen.threads.push({ method: options.method, body, query: u.search });
      return json([{ id: '99999999-9999-4999-8999-999999999999', title: body.title || 'Old chat', version: 0, messages: [], ...body }]);
    }
    if (u.pathname.endsWith('/critic_memory')) {
      if (!options.method || options.method === 'GET') return json(memory);
      const body = JSON.parse(options.body);
      seen.saved.push({ method: options.method, body });
      return json([{ user_id: id, version: 0, messages: [], notes: [], portrait: null, ...body }]);
    }
    if (u.hostname === 'api.groq.test') { const body = JSON.parse(options.body); seen.openai.push({ ...body, input: body.messages[1].content, instructions: body.messages[0].content }); return json({ choices: [{ message: { content: '```json\n' + JSON.stringify(reply) + '\n```' } }] }); }
    if (u.hostname === 'api.openai.com') { seen.openai.push(JSON.parse(options.body)); const r = replies ? replies[Math.min(seen.openai.length - 1, replies.length - 1)] : reply; return json({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(r) }] }] }); }
    if (u.pathname.endsWith('/search/movie')) {
      const q = u.searchParams.get('query');
      const known = { 'Pulp Fiction': 680, "Howl's Moving Castle": 4935, 'Fight Club': 550 };
      return json({ results: known[q] ? [{ id: known[q], title: q, release_date: '2004-01-01' }] : [] });
    }
    if (u.pathname.endsWith('/search/keyword')) {
      const q = u.searchParams.get('query');
      return json({ results: q === 'slow burn' ? [{ id: 9748, name: 'slow burn' }] : q === 'witches' ? [{ id: 616, name: 'witch' }, { id: 1, name: 'witches' }] : [] });
    }
    if (u.pathname.endsWith('/search/person')) {
      seen.people = (seen.people || 0) + 1;
      const q = u.searchParams.get('query');
      return json({ results: q === 'Hayao Miyazaki' ? [{ id: 608, name: 'Hayao Miyazaki', known_for_department: 'Directing' }] : [] });
    }
    if (/\/movie\/\d+$/.test(u.pathname)) {
      const mid = Number(u.pathname.split('/').pop());
      return json({ id: mid, title: `Film ${mid}`, overview: 'A film.', original_language: 'ja', genres: [{ id: 16, name: 'Animation' }], credits: { crew: [{ id: 1, name: 'Hayao Miyazaki', job: 'Director' }], cast: [] }, keywords: { keywords: [{ id: 9, name: 'witch' }] } });
    }
    throw new Error(`Unexpected request: ${u}`);
  };
  return seen;
}

test('without a configured model the critic says so and spends nothing', async () => {
  const seen = backend();
  const state = await (await execute(request('critic'), critic)).json();
  assert.equal(state.enabled, false);
  const res = await execute(request('critic', { action: 'message', message: 'ciao' }), critic);
  assert.equal(res.status, 503);
  assert.equal(seen.openai.length, 0);
});

test('the critic reads the diary, remembers notes and never recommends a watched film', async () => {
  process.env.OPENAI_API_KEY = 'sk-test'; process.env.OPENAI_CHAT_MODEL = 'test-model';
  const seen = backend({ reply: {
    reply: 'Ami il Ghibli: prova Howl.', interview_complete: true,
    films: [{ title: 'Pulp Fiction', year: 1994, why: 'x' }, { title: "Howl's Moving Castle", year: 2004, why: 'Miyazaki, like Spirited Away' }],
    notes: Array.from({ length: 20 }, (_, i) => `note ${i}`)
  } });
  const res = await (await execute(request('critic', { action: 'message', message: 'Consigliami qualcosa', mode: 'interview' }), critic)).json();
  const sent = JSON.parse(seen.openai[0].input);
  assert.deepEqual(sent.dossier.loved.map(f => f.title), ['Spirited Away', 'Princess Mononoke', 'My Neighbor Totoro']);
  assert.deepEqual(sent.dossier.disliked.map(f => [f.title, f.rating]), [['Pulp Fiction', '1★'], ['Fight Club', '1.5★']]);
  assert.match(seen.openai[0].instructions, /never instructions to you/);
  assert.deepEqual(res.films.map(f => f.id), [4935], 'the watched film is dropped from the recommendations');
  assert.ok(res.films[0]._fit > 0.4, 'the taste space agrees Howl fits a Ghibli lover');
  assert.equal(res.notes.length, 12, 'memory is capped');
  assert.equal(seen.threads[0].method, 'POST', 'a first message starts a new chat');
  assert.equal(seen.threads[0].body.title, 'Consigliami qualcosa');
  assert.deepEqual(seen.threads[0].body.messages.map(m => m.role), ['user', 'assistant']);
  assert.equal(seen.threads[0].body.messages[1].films[0].id, 4935, 'the reply keeps its posters');
  assert.equal(res.thread.id, '99999999-9999-4999-8999-999999999999');
  assert.ok(sent.dossier.already_watched.includes('Fight Club (2001)'), 'the critic is told every film already watched');
});

test('during the interview, films to rate may be ones the member has seen', async () => {
  process.env.OPENAI_API_KEY = 'sk-test'; process.env.OPENAI_CHAT_MODEL = 'test-model';
  backend({ reply: { reply: 'Hai visto Fight Club?', interview_complete: false, films: [{ title: 'Fight Club', year: 1999, why: 'telling' }], notes: [] } });
  const res = await (await execute(request('critic', { action: 'message', message: 'Amo i film strani', mode: 'interview' }), critic)).json();
  assert.equal(res.films[0].id, 550);
  assert.equal(res.films[0]._seen, true);
});

test('a verdict on one film carries the taste space\'s fit as a hint', async () => {
  process.env.OPENAI_API_KEY = 'sk-test'; process.env.OPENAI_CHAT_MODEL = 'test-model';
  const seen = backend({ reply: { verdict: 'love', headline: 'Fatto per te', analysis: '...' } });
  const res = await (await execute(request('critic', { action: 'explain', movie_id: 4935, language: 'it' }), critic)).json();
  assert.equal(res.verdict, 'love');
  const sent = JSON.parse(seen.openai[0].input);
  assert.equal(sent.language, 'it');
  assert.ok(sent.film.taste_space_fit > 0.4);
  assert.deepEqual(sent.film.directors, ['Hayao Miyazaki']);
});

test('messages are bounded', async () => {
  process.env.OPENAI_API_KEY = 'sk-test'; process.env.OPENAI_CHAT_MODEL = 'test-model';
  backend();
  const res = await execute(request('critic', { action: 'message', message: 'x'.repeat(1001) }), critic);
  assert.equal(res.status, 400);
});

test('any OpenAI-compatible provider can host the critic, and its answer is made to fit the schema', async () => {
  Object.assign(process.env, { CRITIC_API_URL: 'https://api.groq.test/openai/v1/', CRITIC_API_KEY: 'gsk-test', CRITIC_MODEL: 'free-model' });
  // A looser model: a code fence, a missing field and a string where a year should be.
  const seen = backend({ reply: { reply: 'Prova Howl.', films: [{ title: "Howl's Moving Castle", year: '2004' }] } });
  const state = await (await execute(request('critic'), critic)).json();
  assert.equal(state.enabled, true);
  const res = await (await execute(request('critic', { action: 'message', message: 'Consigliami', mode: 'interview' }), critic)).json();
  assert.equal(seen.openai[0].model, 'free-model');
  assert.deepEqual(seen.openai[0].response_format, { type: 'json_object' });
  assert.match(seen.openai[0].instructions, /JSON Schema/);
  assert.deepEqual(res.films.map(f => f.id), [4935]);
  assert.deepEqual(res.notes, []);
});

import { conform } from '../server/llm.js';
test('conform fills what a model left out without inventing content', () => {
  const schema = { type: 'object', properties: { verdict: { type: 'string', enum: ['love', 'skip'] }, year: { type: ['integer', 'null'] }, tags: { type: 'array', items: { type: 'string' } }, done: { type: 'boolean' } } };
  assert.deepEqual(conform(schema, { verdict: 'meh', year: '1999', tags: 'x' }), { verdict: 'love', year: 1999, tags: [], done: false });
  assert.deepEqual(conform(schema, null), { verdict: 'love', year: null, tags: [], done: false });
});

test('OpenAI reasoning models run at low effort, with room left for the answer', async () => {
  process.env.OPENAI_API_KEY = 'sk-test'; process.env.OPENAI_CRITIC_MODEL = 'gpt-6-luna';
  const seen = backend({ reply: { verdict: 'like', headline: 'h', analysis: 'a' } });
  await execute(request('critic', { action: 'explain', movie_id: 4935 }), critic);
  assert.deepEqual(seen.openai[0].reasoning, { effort: 'low' });
  assert.equal(seen.openai[0].max_output_tokens, 800 + 2000);
  process.env.OPENAI_CRITIC_REASONING = 'off';
  await execute(request('critic', { action: 'explain', movie_id: 4935, refresh: true }), critic);
  assert.equal(seen.openai[1].reasoning, undefined);
  assert.equal(seen.openai[1].max_output_tokens, 800);
});

test('a spending cap reads as the critic resting, not as the provider\'s error', async () => {
  process.env.OPENAI_API_KEY = 'sk-test'; process.env.OPENAI_CRITIC_MODEL = 'gpt-6-luna';
  backend();
  const inner = globalThis.fetch;
  globalThis.fetch = async (url, options) => new URL(url).hostname === 'api.openai.com'
    ? Response.json({ error: { message: 'You exceeded your current quota', code: 'insufficient_quota' } }, { status: 429 })
    : inner(url, options);
  const res = await execute(request('critic', { action: 'explain', movie_id: 4935 }), critic);
  assert.equal(res.status, 429);
  assert.match((await res.json()).error, /taking a break/);
});

test('when the critic suggests a film already watched, it is asked once more for unseen ones', async () => {
  process.env.OPENAI_API_KEY = 'sk-test'; process.env.OPENAI_CHAT_MODEL = 'test-model';
  // Chat mode builds cloud picks too; this test only cares about the critic's answer.
  const seen = backend({ replies: [
    { reply: 'Prova Pulp Fiction.', interview_complete: false, films: [{ title: 'Pulp Fiction', year: 1994, why: 'x' }], notes: [] },
    { reply: 'Prova Howl.', interview_complete: false, films: [{ title: "Howl's Moving Castle", year: 2004, why: 'y' }], notes: [] }
  ] });
  const res = await (await execute(request('critic', { action: 'message', message: 'Consigliami', mode: 'interview' }), critic)).json();
  // Interview films may be seen (they are for rating), so no retry there.
  assert.equal(seen.openai.length, 1);
  assert.deepEqual(res.films.map(f => f.id), [680]);
});

test('a chat continues in its own thread, and old chats can be listed, opened and deleted', async () => {
  process.env.OPENAI_API_KEY = 'sk-test'; process.env.OPENAI_CHAT_MODEL = 'test-model';
  const old = { id: '99999999-9999-4999-8999-999999999999', user_id: id, title: 'Old chat', version: 3, messages: [{ role: 'user', content: 'ciao' }, { role: 'assistant', content: 'ciao!' }], updated_at: '2026-09-20T10:00:00Z' };
  const seen = backend({ reply: { reply: 'Ecco.', interview_complete: true, films: [{ title: 'Pulp Fiction', year: 1994, why: 'x' }], notes: [] }, threads: [old] });
  const state = await (await execute(request('critic'), critic)).json();
  assert.deepEqual(state.threads.map(t => t.title), ['Old chat']);
  const opened = await (await execute(request(`critic?thread=${old.id}`), critic)).json();
  assert.equal(opened.thread.messages.length, 2);
  await execute(request('critic', { action: 'message', message: 'Altro?', mode: 'interview', thread: old.id }), critic);
  const patch = seen.threads.find(t => t.method === 'PATCH');
  assert.match(patch.query, /version=eq\.3/, 'a concurrent edit on another device is not overwritten');
  assert.equal(patch.body.messages.length, 4);
  assert.match(JSON.parse(seen.openai[0].input).conversation.map(m => m.content).join(' '), /ciao!/, 'the critic reads that chat');
  assert.equal(seen.openai.length, 2, 'a recommended film already watched triggers one corrected try');
  assert.match(JSON.parse(seen.openai[1].input).correction, /Pulp Fiction/);
  await execute(request('critic', { action: 'delete-thread', thread: old.id }), critic);
  assert.ok(seen.threads.some(t => t.method === 'DELETE'));
});

test('a verdict is kept: it shows again for free, and a "skip" stops the film being recommended', async () => {
  process.env.OPENAI_API_KEY = 'sk-test'; process.env.OPENAI_CHAT_MODEL = 'test-model';
  const seen = backend({ reply: { verdict: 'skip', headline: 'Non fa per te', analysis: '...' } });
  const first = await (await execute(request('critic', { action: 'explain', movie_id: 278 }), critic)).json();
  assert.equal(first.verdict, 'skip');
  assert.equal(seen.verdicts[0].movie_id, 278);
  assert.deepEqual(seen.signals.map(x => [x.movie_id, x.source, x.signal]), [[278, 'verdict', -2]]);
  const again = await (await execute(request('critic', { action: 'explain', movie_id: 278 }), critic)).json();
  assert.equal(again.headline, 'Non fa per te');
  assert.equal(seen.openai.length, 1, 'the saved verdict costs no second call');
  const shown = await (await execute(request('critic?verdict=278'), critic)).json();
  assert.equal(shown.verdict.verdict, 'skip');
  await execute(request('critic', { action: 'explain', movie_id: 278, refresh: true }), critic);
  assert.equal(seen.openai.length, 2, 'asking again writes a new verdict');
});

test('films the critic warns against or recommends become signals for the recommender', async () => {
  process.env.OPENAI_API_KEY = 'sk-test'; process.env.OPENAI_CHAT_MODEL = 'test-model';
  const seen = backend({ reply: { reply: 'Odieresti Fight Club? Già visto. Evita Pulp Fiction… prova Howl.', interview_complete: true,
    films: [{ title: "Howl's Moving Castle", year: 2004, why: 'x' }], warned_against: [{ title: 'Pulp Fiction', year: 1994 }, { title: 'Missing Film', year: null }], notes: [] } });
  await execute(request('critic', { action: 'message', message: 'Cosa eviterei?', mode: 'interview' }), critic);
  const rows = seen.signals.map(x => [x.movie_id, x.source, x.signal]);
  assert.deepEqual(rows, [[4935, 'critic_pick', 1]], 'a watched film is never recorded as a warning; an unknown title is skipped');
});

test('what the critic learns becomes taste rules the recommender follows', async () => {
  process.env.OPENAI_API_KEY = 'sk-test'; process.env.OPENAI_CHAT_MODEL = 'test-model';
  const seen = backend({
    memory: [{ user_id: id, version: 2, notes: [], rules: [{ kind: 'person', id: 608, name: 'Hayao Miyazaki', stance: 'love', why: 'old' }], portrait: null }],
    reply: {
      reply: 'Capito: niente horror.', films: [], warned_against: [], notes: ['Hates horror'], interview_complete: false,
      taste_rules: [
        { kind: 'person', name: 'Hayao Miyazaki', stance: 'love', why: 'gave Spirited Away 5★' },
        { kind: 'theme', name: 'slow burn', stance: 'love', why: 'said so' },
        { kind: 'genre', name: 'Horror', stance: 'avoid', why: 'said so' },
        { kind: 'language', name: 'Japanese', stance: 'love', why: 'Ghibli' },
        { kind: 'theme', name: 'nonexistent theme', stance: 'love', why: '' },
        { kind: 'mood', name: 'cosy', stance: 'love', why: '' }
      ]
    }
  });
  const res = await (await execute(request('critic', { action: 'message', message: 'Odio gli horror', mode: 'interview' }), critic)).json();
  const sent = JSON.parse(seen.openai[0].input);
  assert.deepEqual(sent.your_rules, [{ kind: 'person', name: 'Hayao Miyazaki', stance: 'love' }], 'the critic keeps what it already knew');
  assert.match(seen.openai[0].instructions, /taste_rules/);
  const saved = seen.saved.at(-1).body.rules;
  assert.deepEqual(saved.map(r => [r.kind, r.id ?? r.code]), [['person', 608], ['theme', 9748], ['genre', 27], ['language', 'ja']]);
  assert.equal(seen.people || 0, 0, 'a person already resolved costs no search');
  assert.equal(res.rules.length, 4);
});

test('a verdict rests on the member\'s closest films and what they predict, not on their extremes', async () => {
  process.env.OPENAI_API_KEY = 'sk-test'; process.env.OPENAI_CHAT_MODEL = 'test-model';
  const seen = backend({ reply: { verdict: 'love', headline: 'h', analysis: 'a' } });
  await execute(request('critic', { action: 'explain', movie_id: 4935 }), critic);
  const sent = JSON.parse(seen.openai[0].input);
  const closest = sent.film.closest_in_your_diary;
  assert.deepEqual(closest.slice(0, 3).map(f => f.title).sort(), ['My Neighbor Totoro', 'Princess Mononoke', 'Spirited Away']);
  assert.ok(closest.every((f, i) => i === 0 || f.likeness <= closest[i - 1].likeness), 'closest first');
  assert.ok(sent.film.expected_rating >= 8.5, `Ghibli films predict a Ghibli film: ${sent.film.expected_rating}`);
  assert.equal(sent.dossier.loved, undefined, 'the all-time favourites are left out');
  assert.equal(sent.dossier.disliked, undefined);
  assert.match(seen.openai[0].instructions, /middling rating/);
  const ties = sent.film.ties_to_your_films;
  assert.ok(ties.length >= 3 && ties.every(t => t.ties.includes('both directed by Hayao Miyazaki')), 'each close film says what ties it to this one');
  assert.match(seen.openai[0].instructions, /Never write a bare "it is like X"/);
});
