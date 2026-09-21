import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execute, allRows, HttpError } from '../server/http.js';
import { auth } from '../api/auth.js';
import { library } from '../api/library.js';
import { social } from '../api/social.js';
import { chat } from '../api/chat.js';
import { recommendations } from '../server/recommendations.js';
const originalFetch = globalThis.fetch;
const id = '11111111-1111-4111-8111-111111111111';
beforeEach(() => {
  process.env.APP_URL = 'https://umbrify.test';
  process.env.SUPABASE_URL = 'https://db.test';
  process.env.SUPABASE_ANON_KEY = 'public-key';
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'Content-Type': 'application/json'
  }
});
const request = (path, data, headers = {}) => new Request(`https://umbrify.test/api/${path}`, {
  method: data === undefined ? 'GET' : 'POST',
  headers: {
    Origin: 'https://umbrify.test',
    'X-Umbrify-Request': '1',
    'Content-Type': 'application/json',
    ...headers
  },
  ...(data === undefined ? {} : {
    body: JSON.stringify(data)
  })
});
test('protected library rejects anonymous callers before touching data', async () => {
  globalThis.fetch = () => {
    throw new Error('must not fetch');
  };
  const result = await execute(request('library'), library);
  assert.equal(result.status, 401);
});
test('CSRF and method checks run before mutation handlers', async () => {
  const result = await execute(request('auth?action=login', {
    email: 'a@b.it',
    password: 'password123'
  }, {
    Origin: 'https://evil.test'
  }), () => {
    throw new Error('must not run');
  });
  assert.equal(result.status, 403);
  const missingHeader = new Request('https://umbrify.test/api/library', {
    method: 'POST',
    headers: {
      Origin: 'https://umbrify.test'
    },
    body: '{}'
  });
  assert.equal((await execute(missingHeader, library)).status, 403);
});
test('login stores httpOnly cookies and never returns tokens in JSON', async () => {
  globalThis.fetch = async (url, options) => {
    assert(String(url).includes('/token?grant_type=password'));
    assert(!options.body.includes('service-role'));
    return json({
      access_token: 'access-secret',
      refresh_token: 'refresh-secret',
      expires_in: 3600
    });
  };
  const result = await execute(request('auth?action=login', {
    email: 'me@example.com',
    password: 'long-password'
  }), auth);
  assert.equal(result.status, 200);
  const body = await result.text();
  assert(!body.includes('secret'));
  assert.equal(result.headers.getSetCookie().length, 2);
  assert(result.headers.getSetCookie().every(c => c.includes('HttpOnly') && c.includes('Secure') && c.includes('SameSite=Lax')));
});
test('invalid access tokens cannot select another account by supplying user_id', async () => {
  globalThis.fetch = async () => json({
    message: 'Invalid JWT'
  }, 401);
  const result = await execute(request('library', {
    user_id: id,
    changes: []
  }, {
    Cookie: 'umbrify_access=forged'
  }), library);
  assert.equal(result.status, 401);
});
test('library derives identity from verified auth and forwards optimistic versions', async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({
      url: String(url),
      ...options
    });
    if (String(url).endsWith('/user')) return json({
      id
    });
    return json([]);
  };
  const result = await execute(request('library', {
    user_id: 'someone-else',
    changes: [{
      op: 'put',
      kind: 'watched',
      movie_id: 1,
      movie: {
        id: 55,
        title: 'Film'
      },
      rating: 9,
      version: 3
    }]
  }, {
    Cookie: 'umbrify_access=valid'
  }), library);
  assert.equal(result.status, 200);
  const sent = JSON.parse(calls.at(-1).body);
  assert.equal(sent.changes[0].version, 3);
  assert.equal(sent.changes[0].movie.id, 1);
  assert(!('user_id' in sent));
  assert.equal(calls.at(-1).headers.Authorization, 'Bearer valid');
});
test('library reports conflicts and rejects bad ratings without an RPC mutation', async () => {
  let count = 0;
  globalThis.fetch = async url => {
    if (String(url).endsWith('/user')) return json({
      id
    });
    count++;
    return json({
      code: '40001',
      message: 'Library changed'
    }, 400);
  };
  const headers = {
    Cookie: 'umbrify_access=valid'
  };
  assert.equal((await execute(request('library', {
    changes: [{
      op: 'rate',
      kind: 'watched',
      movie_id: 1,
      version: 2,
      rating: 9
    }]
  }, headers), library)).status, 409);
  assert.equal((await execute(request('library', {
    changes: [{
      op: 'rate',
      kind: 'watched',
      movie_id: 1,
      version: 2,
      rating: 99
    }]
  }, headers), library)).status, 400);
  assert.equal(count, 1);
});
test('all library pages are fetched instead of silently truncating at 1,000', async () => {
  const calls = [];
  const rows = await allRows(async path => {
    calls.push(path);
    return path.includes('offset=0') ? Array.from({
      length: 1000
    }, (_, i) => i) : [1000, 1001];
  }, 'user_movies?order=movie_id');
  assert.equal(rows.length, 1002);
  assert.equal(calls.length, 2);
  assert(calls[1].includes('offset=1000'));
});
test('group recommendations reject private friends before querying their libraries or TMDB', async () => {
  globalThis.fetch = async url => {
    const path = String(url);
    if (path.includes(`user_id=eq.${id}`)) return json([{
      kind: 'watched',
      rating: 9,
      movie_id: 1,
      movie: {
        genre_ids: [18]
      }
    }]);
    if (path.includes('can_read_library')) return json(false);
    throw new Error(`Unexpected private read: ${path}`);
  };
  await assert.rejects(() => recommendations({
    user: {
      id
    },
    token: 'valid'
  }, ['22222222-2222-4222-8222-222222222222']), e => e.status === 403);
});
test('chat refuses another user’s conversation', async () => {
  globalThis.fetch = async url => String(url).endsWith('/user') ? json({
    id
  }) : json([]);
  const result = await execute(request('chat?id=22222222-2222-4222-8222-222222222222', undefined, {
    Cookie: 'umbrify_access=valid'
  }), chat);
  assert.equal(result.status, 404);
});
test('profile writes cannot set owner IDs or server-only fields', async () => {
  let payload;
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith('/user')) return json({
      id
    });
    payload = JSON.parse(options.body);
    assert(String(url).includes(`id=eq.${id}`));
    return new Response(null, {
      status: 204
    });
  };
  const result = await execute(request('social', {
    action: 'profile',
    profile: {
      id: 'victim',
      display_name: 'Matteo',
      country: 'IT',
      discoverable: false,
      share_activity: false,
      collaborative: true,
      admin: true
    }
  }, {
    Cookie: 'umbrify_access=valid'
  }), social);
  assert.equal(result.status, 200);
  assert(!('id' in payload));
  assert(!('admin' in payload));
});
test('Google callback rejects mismatched state without exchanging the code', async () => {
  globalThis.fetch = () => {
    throw new Error('must not exchange');
  };
  const result = await execute(request('auth?action=callback&code=secret&state=evil', undefined, {
    Cookie: 'umbrify_pkce=verifier; umbrify_oauth_state=expected'
  }), auth);
  assert.equal(result.status, 303);
  assert(result.headers.get('location').includes('auth_error=1'));
});
test('a stale tab cannot write into an account switched in another tab', async () => {
  let dataRequests = 0;
  globalThis.fetch = async url => {
    if (String(url).endsWith('/user')) return json({
      id: '22222222-2222-4222-8222-222222222222'
    });
    dataRequests++;
    return json([]);
  };
  const result = await execute(request('library', {
    changes: []
  }, {
    Cookie: 'umbrify_access=new-account',
    'X-Umbrify-Account': id
  }), library);
  assert.equal(result.status, 409);
  assert.equal((await result.json()).code, 'account_changed');
  assert.equal(dataRequests, 0);
});
test('expired sessions refresh safely and still enforce the expected account', async () => {
  let dataRequests = 0;
  globalThis.fetch = async (url, options) => {
    const path = String(url);
    if (path.includes('grant_type=refresh_token')) return json({
      access_token: 'new-access',
      refresh_token: 'new-refresh',
      expires_in: 3600
    });
    if (path.endsWith('/user')) {
      if (options.headers.Authorization === 'Bearer expired') return json({
        message: 'Expired JWT'
      }, 401);
      return json({
        id
      });
    }
    dataRequests++;
    return json([]);
  };
  const result = await execute(request('library', undefined, {
    Cookie: 'umbrify_access=expired; umbrify_refresh=refresh',
    'X-Umbrify-Account': id
  }), library);
  assert.equal(result.status, 200);
  assert.equal(result.headers.getSetCookie().length, 2);
  assert.equal(dataRequests, 1);
  assert(!JSON.stringify(await result.json()).includes('new-access'));
});

test('account-changing auth actions are also bound to the active tab account',async()=>{
  const {backend,setBackendAccount}=await import('../src/utils/backend.js');
  setBackendAccount(id);
  const headers=[];
  globalThis.fetch=async(url,options)=>{headers.push(options.headers);return json({ok:true});};
  await backend('auth?action=password',{password:'new-password'});
  await backend('auth?action=logout',{});
  await backend('auth');
  await backend('auth?action=login',{email:'a@b.com',password:'password123'});
  assert.equal(headers[0]['X-Umbrify-Account'],id);assert.equal(headers[1]['X-Umbrify-Account'],id);
  assert.equal(headers[2]['X-Umbrify-Account'],undefined);assert.equal(headers[3]['X-Umbrify-Account'],undefined);
  setBackendAccount(null);
});
test('stale-tab password changes are blocked before the provider update',async()=>{
  let calls=0;globalThis.fetch=async()=>{calls++;return json({id:'22222222-2222-4222-8222-222222222222'});};
  const result=await execute(request('auth?action=password',{password:'a-new-password'},{Cookie:'umbrify_access=new-account','X-Umbrify-Account':id}),auth);
  assert.equal(result.status,409);assert.equal(calls,1);
});
test('same-origin requests are accepted without Origin, cross-site ones never are', async () => {
  const post = headers => new Request('https://umbrify.test/api/library', {
    method: 'POST',
    headers,
    body: '{}'
  });
  const reached = () => {
    throw new HttpError(418, 'reached the handler');
  };
  const status = async headers => (await execute(post(headers), reached)).status;
  const signed = {
    'X-Umbrify-Request': '1',
    'Content-Type': 'application/json'
  };
  // Browsers that omit Origin on same-origin calls still prove first-party intent.
  assert.equal(await status({ ...signed, 'Sec-Fetch-Site': 'same-origin' }), 418);
  assert.equal(await status({ ...signed, Referer: 'https://umbrify.test/profile' }), 418);
  assert.equal(await status({ ...signed, Origin: 'https://umbrify.test' }), 418);
  // Anything that names another site, or names nothing at all, is refused.
  assert.equal(await status({ ...signed, 'Sec-Fetch-Site': 'cross-site' }), 403);
  assert.equal(await status({ ...signed, 'Sec-Fetch-Site': 'same-site' }), 403);
  assert.equal(await status({ ...signed, Referer: 'https://evil.test/umbrify.test' }), 403);
  assert.equal(await status({ ...signed, Referer: 'not-a-url' }), 403);
  assert.equal(await status(signed), 403);
  // A present but wrong Origin is never rescued by a same-origin fallback header.
  assert.equal(await status({ ...signed, Origin: 'https://evil.test', 'Sec-Fetch-Site': 'same-origin' }), 403);
  assert.equal(await status({ ...signed, Origin: 'https://evil.test', Referer: 'https://umbrify.test/profile' }), 403);
  // The unforgeable custom header stays mandatory whatever else is supplied.
  assert.equal(await status({ Origin: 'https://umbrify.test', 'Sec-Fetch-Site': 'same-origin' }), 403);
});
test('the sign-in callback distinguishes why it failed and records only the reason', async () => {
  const logged = [];
  const error = console.error;
  console.error = (...args) => logged.push(args.join(' '));
  try {
    const callback = (query, cookie) => execute(new Request(`https://umbrify.test/api/auth?action=callback&${query}`, {
      method: 'GET',
      ...(cookie ? { headers: { Cookie: cookie } } : {})
    }), auth);
    const pair = 'umbrify_pkce=verifier-value; umbrify_oauth_state=state-value';
    const reasonOf = async (query, cookie) => {
      logged.length = 0;
      const result = await callback(query, cookie);
      assert.equal(result.status, 303);
      assert.equal(result.headers.get('Location'), 'https://umbrify.test/profile?auth_error=1');
      return logged.join(' ');
    };
    assert.match(await reasonOf('error=access_denied'), /provider refused the sign-in: access_denied/);
    assert.match(await reasonOf('error=invalid_client&error_description=Unauthorized'), /provider refused the sign-in: Unauthorized/);
    assert.match(await reasonOf('state=state-value', pair), /no authorization code/);
    assert.match(await reasonOf('code=abc', pair), /no state/);
    assert.match(await reasonOf('code=abc&state=state-value'), /cookies did not survive/);
    assert.match(await reasonOf('code=abc&state=other', pair), /older attempt/);
    globalThis.fetch = () => new Response(JSON.stringify({ error_description: 'invalid flow state' }), { status: 400 });
    const rejected = await reasonOf('code=abc&state=state-value', pair);
    assert.match(rejected, /exchange was rejected: invalid flow state/);
    // The verifier and the authorization code must never reach the log.
    assert.ok(!/verifier-value|abc/.test(rejected), 'secrets must not be logged');
    globalThis.fetch = () => new Response(JSON.stringify({
      access_token: 'a',
      refresh_token: 'r',
      expires_in: 3600
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const ok = await callback('code=abc&state=state-value', pair);
    assert.equal(ok.headers.get('Location'), 'https://umbrify.test/profile');
  } finally {
    console.error = error;
  }
});
