// One structured call to the critic's language model. Two ways to configure it:
//  - OpenAI: OPENAI_API_KEY and OPENAI_CRITIC_MODEL (or OPENAI_CHAT_MODEL),
//    through the Responses API with a strict JSON schema;
//  - any OpenAI-compatible Chat Completions provider (Groq, Mistral, OpenRouter,
//    Gemini's compatibility endpoint…): CRITIC_API_URL, CRITIC_API_KEY and
//    CRITIC_MODEL. JSON mode is the common denominator there, so the schema is
//    given in the instructions and the answer is made to fit it afterwards.
// Every caller treats member text as data.
import { remote, HttpError } from './http.js';

const compatible = () => Boolean(process.env.CRITIC_API_URL && process.env.CRITIC_API_KEY && process.env.CRITIC_MODEL);
export const criticModel = () => (compatible() ? process.env.CRITIC_MODEL : process.env.OPENAI_CRITIC_MODEL || process.env.OPENAI_CHAT_MODEL);
export const criticEnabled = () => compatible() || Boolean(process.env.OPENAI_API_KEY && criticModel());

/** Makes a parsed answer fit the schema: missing or mistyped fields get empty values. */
export function conform(schema, value) {
  const types = [].concat(schema?.type || []);
  if (value === null && types.includes('null')) return null;
  if (schema?.enum) return schema.enum.includes(value) ? value : schema.enum[0];
  if (types.includes('object')) {
    const obj = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return Object.fromEntries(Object.entries(schema.properties || {}).map(([k, s]) => [k, conform(s, obj[k])]));
  }
  if (types.includes('array')) return Array.isArray(value) ? value.map(v => conform(schema.items, v)) : [];
  if (types.includes('string')) return typeof value === 'string' ? value : value == null ? (types.includes('null') ? null : '') : String(value);
  if (types.includes('integer') || types.includes('number')) {
    const n = Number(value);
    return value != null && value !== '' && Number.isFinite(n) ? (types.includes('integer') ? Math.round(n) : n) : types.includes('null') ? null : 0;
  }
  if (types.includes('boolean')) return value === true;
  return value ?? null;
}

function parse(text) {
  if (!text) throw new HttpError(502, 'The critic did not answer. Please try again.');
  // Some models wrap JSON in a code fence despite JSON mode.
  const json = String(text).trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  try {
    return JSON.parse(json);
  } catch {
    throw new HttpError(502, 'The critic answered in an unexpected form. Please try again.');
  }
}

export async function structured({ instructions, input, name, schema, maxTokens = 1500, timeout = 45000 }) {
  if (!criticEnabled()) throw new HttpError(503, 'The critic is not configured on this server yet.');
  const content = typeof input === 'string' ? input : JSON.stringify(input);
  if (compatible()) {
    const base = process.env.CRITIC_API_URL.replace(/\/+$/, '');
    const response = await remote(`${base}/chat/completions`, {
      method: 'POST',
      timeout,
      headers: { Authorization: `Bearer ${process.env.CRITIC_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.CRITIC_MODEL,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: `${instructions}\n\nAnswer with one JSON object only, matching this JSON Schema (name: ${name}):\n${JSON.stringify(schema)}` },
          { role: 'user', content }
        ]
      })
    });
    return conform(schema, parse(response.choices?.[0]?.message?.content));
  }
  const response = await remote('https://api.openai.com/v1/responses', {
    method: 'POST',
    timeout,
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: criticModel(),
      store: false,
      max_output_tokens: maxTokens,
      instructions,
      input: content,
      text: { format: { type: 'json_schema', name, strict: true, schema } }
    })
  });
  return conform(schema, parse(response.output?.flatMap(item => item.content || []).find(c => c.type === 'output_text')?.text));
}
