import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { claimAiCall, requireAiCall, AI_DAILY_CAP } from '../server/aiBudget.js';
import { interpret } from '../server/conversation.js';

const originalFetch = globalThis.fetch;
beforeEach(() => {
  Object.assign(process.env, { APP_URL: 'https://umbrify.test', SUPABASE_URL: 'https://db.test', SUPABASE_ANON_KEY: 'public', SUPABASE_SERVICE_ROLE_KEY: 'service' });
  delete process.env.AI_DAILY_CAP;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_CHAT_MODEL;
});

function budget(answer) {
  const asked = [];
  globalThis.fetch = async (url, options = {}) => {
    const u = String(url);
    if (u.endsWith('/rpc/claim_ai_budget')) {
      asked.push(JSON.parse(options.body));
      return answer instanceof Error ? Promise.reject(answer) : Response.json(answer);
    }
    if (u.startsWith('https://api.openai.com/')) throw new Error('The model must not be asked');
    throw new Error(`Unexpected request ${u}`);
  };
  return asked;
}

test('each model call claims one unit of the site-wide daily allowance', async () => {
  const asked = budget(true);
  assert.equal(await claimAiCall(), true);
  assert.deepEqual(asked, [{ daily_cap: AI_DAILY_CAP }]);
  process.env.AI_DAILY_CAP = '50';
  await claimAiCall();
  assert.equal(asked[1].daily_cap, 50);
});

test('a spent allowance or an unreachable database stops the call', async () => {
  budget(false);
  assert.equal(await claimAiCall(), false);
  await assert.rejects(requireAiCall(), e => e.status === 429 && /taking a break/.test(e.message));
  budget(new Error('down'));
  assert.equal(await claimAiCall(), false);
});

test('past the allowance, the chat falls back to its own parser without asking the model', async () => {
  process.env.OPENAI_API_KEY = 'sk-test';
  process.env.OPENAI_CHAT_MODEL = 'test-model';
  budget(false);
  const result = await interpret('something funny and short', {}, [], []);
  assert.equal(result.mode, 'guided-fallback');
});
