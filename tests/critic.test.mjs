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

function backend({ reply, memory = [] } = {}) {
  const seen = { openai: [], saved: [] };
  globalThis.fetch = async (url, options = {}) => {
    const u = new URL(url);
    if (u.pathname.endsWith('/auth/v1/user')) return json({ id });
    if (u.pathname === '/models/taste-space.bin') return new Response(readFileSync(new URL('../public/models/taste-space.bin', import.meta.url)));
    if (u.pathname.endsWith('/rpc/consume_limit')) return json(true);
    if (u.pathname.endsWith('/user_movies')) return json(rows);
    if (u.pathname.endsWith('/critic_memory')) {
      if (!options.method || options.method === 'GET') return json(memory);
      const body = JSON.parse(options.body);
      seen.saved.push({ method: options.method, body });
      return json([{ user_id: id, version: 0, messages: [], notes: [], portrait: null, ...body }]);
    }
    if (u.hostname === 'api.groq.test') { const body = JSON.parse(options.body); seen.openai.push({ ...body, input: body.messages[1].content, instructions: body.messages[0].content }); return json({ choices: [{ message: { content: '```json\n' + JSON.stringify(reply) + '\n```' } }] }); }
    if (u.hostname === 'api.openai.com') { seen.openai.push(JSON.parse(options.body)); return json({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(reply) }] }] }); }
    if (u.pathname.endsWith('/search/movie')) {
      const q = u.searchParams.get('query');
      const known = { 'Pulp Fiction': 680, "Howl's Moving Castle": 4935, 'Fight Club': 550 };
      return json({ results: known[q] ? [{ id: known[q], title: q, release_date: '2004-01-01' }] : [] });
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
  assert.equal(seen.saved[0].method, 'POST');
  assert.deepEqual(seen.saved[0].body.messages.map(m => m.role), ['user', 'assistant']);
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
  assert.equal(seen.openai[0].max_output_tokens, 700 + 2000);
  process.env.OPENAI_CRITIC_REASONING = 'off';
  await execute(request('critic', { action: 'explain', movie_id: 4935 }), critic);
  assert.equal(seen.openai[1].reasoning, undefined);
  assert.equal(seen.openai[1].max_output_tokens, 700);
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
