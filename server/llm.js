// One structured call to the configured language model (OpenAI's Responses
// API with a strict JSON schema). Every caller treats member text as data.
import { remote, HttpError } from './http.js';

export const criticModel = () => process.env.OPENAI_CRITIC_MODEL || process.env.OPENAI_CHAT_MODEL;
export const criticEnabled = () => Boolean(process.env.OPENAI_API_KEY && criticModel());

export async function structured({ instructions, input, name, schema, maxTokens = 1500, timeout = 45000 }) {
  if (!criticEnabled()) throw new HttpError(503, 'The critic is not configured on this server yet.');
  const response = await remote('https://api.openai.com/v1/responses', {
    method: 'POST',
    timeout,
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: criticModel(),
      store: false,
      max_output_tokens: maxTokens,
      instructions,
      input: typeof input === 'string' ? input : JSON.stringify(input),
      text: { format: { type: 'json_schema', name, strict: true, schema } }
    })
  });
  const text = response.output?.flatMap(item => item.content || []).find(c => c.type === 'output_text')?.text;
  if (!text) throw new HttpError(502, 'The critic did not answer. Please try again.');
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(502, 'The critic answered in an unexpected form. Please try again.');
  }
}
