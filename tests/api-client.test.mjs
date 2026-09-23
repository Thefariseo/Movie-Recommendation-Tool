import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./support/browser-modules.mjs', import.meta.url);
const axios = await import('./support/fake-axios.mjs');
const api = await import('../src/utils/api.js');

const tick = () => new Promise((r) => setTimeout(r, 0));
let next = 1000;
beforeEach(() => axios.reset());

test('a failed request does not fail the requests queued behind it', async () => {
  const base = next; next += 20;
  // Fill every slot, then queue one more behind them.
  const running = Array.from({ length: 6 }, (_, i) => api.movieDetails(base + i));
  const queued = api.movieDetails(base + 6);
  await tick();
  assert.equal(axios.requests.length, 6, 'the seventh waits for a free slot');
  running.slice(1).forEach((p) => p.catch(() => {}));
  axios.requests[0].reject(new Error('404 for one film'));
  await assert.rejects(running[0]);
  await tick();
  assert.equal(axios.requests.length, 7, 'the freed slot goes to the queued request');
  axios.requests[6].resolve({ id: base + 6 });
  assert.deepEqual(await queued, { id: base + 6 }, 'the queued request succeeds on its own merits');
  axios.requests.slice(1, 6).forEach((r, i) => r.resolve({ id: base + 1 + i }));
});

test('simultaneous requests for the same film share one call, and the answer is cached', async () => {
  const id = next++;
  const a = api.movieDetails(id), b = api.movieDetails(id);
  await tick();
  assert.equal(axios.requests.length, 1);
  axios.requests[0].resolve({ id });
  assert.deepEqual(await a, { id });
  assert.deepEqual(await b, { id });
  assert.deepEqual(await api.movieDetails(id), { id });
  assert.equal(axios.requests.length, 1, 'a cached film is not fetched again');
});

test('a failure is not cached, so the film can be retried', async () => {
  const id = next++;
  const first = api.movieDetails(id);
  await tick();
  axios.requests[0].reject(new Error('temporary'));
  await assert.rejects(first);
  const second = api.movieDetails(id);
  await tick();
  assert.equal(axios.requests.length, 2);
  axios.requests[1].resolve({ id });
  assert.deepEqual(await second, { id });
});
