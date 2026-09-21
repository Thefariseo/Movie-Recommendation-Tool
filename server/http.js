// Shared by Node functions and the Edge recommender. No browser secrets.
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export function settings() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  const origin = process.env.APP_URL?.replace(/\/$/, '');
  if (!url || !key || !origin) throw new HttpError(503, 'Accounts are not available yet. Your guest library is still on this device.');
  return {
    url: url.replace(/\/$/, ''),
    key,
    origin
  };
}
export async function remote(url, {
  headers = {},
  timeout = 12000,
  ...options
} = {}) {
  const response = await fetch(url, {
    ...options,
    headers,
    signal: AbortSignal.timeout(timeout)
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new HttpError(502, 'A connected service returned an invalid response.');
  }
  if (!response.ok) {
    const status = response.status === 401 ? 401 : response.status === 429 ? 429 : data?.code === '40001' ? 409 : response.status >= 500 ? 502 : 400;
    throw new HttpError(status, data?.msg || data?.error_description || data?.message || 'The connected service could not complete this request.');
  }
  return data;
}
export function cookies(request) {
  return Object.fromEntries((request.headers.get('cookie') || '').split(';').map(p => {
    const i = p.indexOf('=');
    return i < 0 ? [] : [p.slice(0, i).trim(), p.slice(i + 1)];
  }).filter(p => p.length === 2));
}
export function setCookie(ctx, name, value, seconds) {
  const secure = settings().origin.startsWith('https:') ? '; Secure' : '';
  ctx.cookies.push(`${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${secure}`);
}
export function saveSession(ctx, session) {
  if (!session?.access_token || !session?.refresh_token) throw new HttpError(401, 'No session was returned. Please sign in again.');
  setCookie(ctx, 'umbrify_access', session.access_token, Math.max(60, session.expires_in || 3600));
  setCookie(ctx, 'umbrify_refresh', session.refresh_token, 60 * 60 * 24 * 30);
}
export function clearSession(ctx) {
  setCookie(ctx, 'umbrify_access', '', 0);
  setCookie(ctx, 'umbrify_refresh', '', 0);
}
export async function authRequest(path, body, token) {
  const {
    url,
    key
  } = settings();
  return remote(`${url}/auth/v1/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      apikey: key,
      'Content-Type': 'application/json',
      ...(token ? {
        Authorization: `Bearer ${token}`
      } : {})
    },
    ...(body ? {
      body: JSON.stringify(body)
    } : {})
  });
}
function checkAccount(ctx, user) {
  const expected = ctx.request.headers.get("x-umbrify-account");
  if (expected && expected !== user.id) {
    const error = new HttpError(409, "Your account changed in another tab. Refreshing your session…");
    error.code = "account_changed";
    throw error;
  }
}
export async function identify(ctx, required = true) {
  const c = cookies(ctx.request);
  let token = c.umbrify_access;
  if (token) {
    try {
      const user = await authRequest('user', null, token);
      checkAccount(ctx, user);
      ctx.user = user;
      ctx.token = token;
      return user;
    } catch (e) {
      if (e.status !== 401 && e.status !== 400) throw e;
    }
  }
  if (c.umbrify_refresh) {
    try {
      const session = await authRequest('token?grant_type=refresh_token', {
        refresh_token: c.umbrify_refresh
      });
      const user = await authRequest('user', null, session.access_token);
      saveSession(ctx, session);
      checkAccount(ctx, user);
      ctx.user = user;
      ctx.token = session.access_token;
      return user;
    } catch (e) {
      if (e.status !== 400 && e.status !== 401) throw e;
      clearSession(ctx);
    }
  }
  if (required) throw new HttpError(401, 'Please sign in to continue.');
  return null;
}
export function database(token, service = false) {
  const {
    url,
    key
  } = settings();
  const credential = service ? process.env.SUPABASE_SERVICE_ROLE_KEY : key;
  if (!credential) throw new HttpError(503, 'This feature has not been enabled yet.');
  return async (path, {
    method = 'GET',
    body,
    prefer,
    headers = {}
  } = {}) => remote(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: credential,
      Authorization: `Bearer ${service ? credential : token}`,
      'Content-Type': 'application/json',
      ...(prefer ? {
        Prefer: prefer
      } : {}),
      ...headers
    },
    ...(body !== undefined ? {
      body: JSON.stringify(body)
    } : {})
  });
}
export async function allRows(db, path, max = 20000) {
  const rows = [];
  for (let offset = 0; offset <= max; offset += 1000) {
    const page = await db(`${path}${path.includes('?') ? '&' : '?'}limit=1000&offset=${offset}`);
    if (!Array.isArray(page)) throw new HttpError(502, 'Invalid library response.');
    rows.push(...page);
    if (rows.length > max) throw new HttpError(413, 'This catalogue exceeds the current import limit.');
    if (page.length < 1000) return rows;
  }
  throw new HttpError(413, 'Catalogue is too large.');
}
export async function body(ctx) {
  const length = Number(ctx.request.headers.get('content-length') || 0);
  if (length > 1000000) throw new HttpError(413, 'Request too large.');
  const raw = await ctx.request.text();
  if (raw.length > 1000000) throw new HttpError(413, 'Request too large.');
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw new HttpError(400, 'Invalid JSON.');
  }
}
export function csrf(request) {
  const {
    origin
  } = settings();
  const deny = () => {
    throw new HttpError(403, 'Request origin could not be verified.');
  };
  // No cross-site caller can set this: it forces a preflight, and the API answers
  // with no CORS headers, so the preflight fails before the request is sent.
  if (request.headers.get('x-umbrify-request') !== '1') deny();
  // A missing Origin is not proof of a cross-site caller; browsers are inconsistent
  // about sending it on same-origin requests. Sec-Fetch-Site and Referer are just as
  // unforgeable from another site, so check those before refusing a first-party call.
  const sent = request.headers.get('origin');
  if (sent) {
    if (sent !== origin) deny();
    return;
  }
  const site = request.headers.get('sec-fetch-site');
  if (site) {
    if (site !== 'same-origin') deny();
    return;
  }
  const referer = request.headers.get('referer');
  let refererOrigin = null;
  try {
    refererOrigin = referer ? new URL(referer).origin : null;
  } catch {
    refererOrigin = null;
  }
  if (refererOrigin !== origin) deny();
}
export function uuid(value) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '')) throw new HttpError(400, 'Invalid identifier.');
  return value;
}
export async function rateLimit(ctx, bucket) {
  const ok = await database(ctx.token)('rpc/consume_limit', {
    method: 'POST',
    body: {
      bucket_name: bucket,
      max_calls: 1,
      seconds: 60
    }
  });
  if (!ok) throw new HttpError(429, 'Too many requests. Please try again later.');
}
export async function execute(request, work, methods = ['GET', 'POST']) {
  const ctx = {
    request,
    cookies: [],
    url: new URL(request.url)
  };
  let result,
    status = 200;
  try {
    if (!methods.includes(request.method)) throw new HttpError(405, 'Method not allowed.');
    if (!['GET', 'HEAD'].includes(request.method)) csrf(request);
    result = await work(ctx);
  } catch (e) {
    status = e.status || 500;
    // Never log auth tokens, provider payloads, message content, or rating matrices.
    if (status === 500) console.error('Umbrify request failed:', e.name);
    result = {
      error: status === 500 ? 'Something went wrong. Please try again.' : e.message,
      ...(e.code === 'account_changed' ? {
        code: e.code
      } : {})
    };
  }
  const headers = new Headers({
    'Cache-Control': 'private, no-store',
    'Vary': 'Cookie',
    'X-Content-Type-Options': 'nosniff'
  });
  for (const c of ctx.cookies) headers.append('Set-Cookie', c);
  if (result?.redirect) {
    headers.set('Location', result.redirect);
    return new Response(null, {
      status: 303,
      headers
    });
  }
  headers.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(result), {
    status,
    headers
  });
}
export function nodeHandler(work, methods) {
  return async (req, res) => {
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) if (value != null) headers.set(key, Array.isArray(value) ? value.join(',') : value);
    let raw;
    if (!['GET', 'HEAD'].includes(req.method)) {
      if (req.body !== undefined) raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);else {
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 1000000) {
            res.statusCode = 413;
            res.end();
            return;
          }
          chunks.push(chunk);
        }
        raw = Buffer.concat(chunks).toString();
      }
    }
    const request = new Request(new URL(req.url, process.env.APP_URL || 'http://localhost:3000'), {
      method: req.method,
      headers,
      ...(raw !== undefined ? {
        body: raw
      } : {})
    });
    const response = await execute(request, work, methods);
    res.statusCode = response.status;
    for (const [key, value] of response.headers) if (key !== 'set-cookie') res.setHeader(key, value);
    const cookieHeaders = response.headers.getSetCookie();
    if (cookieHeaders.length) res.setHeader('Set-Cookie', cookieHeaders);
    res.end(await response.text());
  };
}
