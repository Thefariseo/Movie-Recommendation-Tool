import { nodeHandler, settings, authRequest, identify, body, saveSession, clearSession, cookies, setCookie, HttpError, database, remote } from '../server/http.js';
import { authLimit } from '../server/authLimits.js';
import { publicUser } from '../server/user-profile.js';
import { randomSecret, hash } from '../server/crypto.js';
export async function auth(ctx) {
  const action = ctx.url.searchParams.get('action') || 'session';
  if (action === 'session' && ctx.request.method === 'GET') {
    const configured = !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY && process.env.APP_URL);
    if (!configured) return {
      user: null,
      configured: false,
      google: false
    };
    const user = await identify(ctx, false);
    const profiles = user ? await database(ctx.token)(`profiles?id=eq.${user.id}&select=*`) : [];
    return {
      user: user ? publicUser(user) : null,
      profile: profiles[0] || null,
      configured: true,
      google: process.env.GOOGLE_AUTH_ENABLED === 'true',
      trakt: !!process.env.TRAKT_CLIENT_ID,
      chat: !!(process.env.OPENAI_API_KEY && process.env.OPENAI_CHAT_MODEL)
    };
  }
  const {
    origin,
    url,
    key
  } = settings();
  if (action === 'callback' && ctx.request.method === 'GET') {
    const c = cookies(ctx.request);
    const code = ctx.url.searchParams.get('code');
    const state = ctx.url.searchParams.get('state');
    const reported = ctx.url.searchParams.get('error_description') || ctx.url.searchParams.get('error');
    setCookie(ctx, 'umbrify_pkce', '', 0);
    setCookie(ctx, 'umbrify_oauth_state', '', 0);
    // Every branch below used to collapse into one silent redirect, which left no way
    // to tell a dropped cookie from a rejected exchange. Only the reason is recorded:
    // never the code, the verifier or the state, and never the provider's payload.
    const abandon = reason => {
      console.error('Umbrify sign-in callback failed:', reason);
      return {
        redirect: `${origin}/profile?auth_error=1`
      };
    };
    // The provider's refusal is an OAuth error code, not member data: without it a
    // refusal after a granted consent is indistinguishable from a rejected credential.
    if (reported) return abandon(`the provider refused the sign-in: ${reported.slice(0, 200)}`);
    if (!code) return abandon('the callback carried no authorization code');
    if (!state) return abandon('the callback carried no state');
    if (!c.umbrify_pkce || !c.umbrify_oauth_state) return abandon('the sign-in cookies did not survive the redirect back');
    if (state !== c.umbrify_oauth_state) return abandon('the state did not match its cookie, so this redirect belongs to an older attempt');
    try {
      const session = await authRequest('token?grant_type=pkce', {
        auth_code: code,
        code_verifier: c.umbrify_pkce
      });
      saveSession(ctx, session);
    } catch (e) {
      return abandon(`the code exchange was rejected: ${e.message}`);
    }
    return {
      redirect: `${origin}/profile`
    };
  }
  if (ctx.request.method !== 'POST') throw new HttpError(405, 'Method not allowed.');
  const input = await body(ctx);
  if (action === 'google') {
    if (process.env.GOOGLE_AUTH_ENABLED !== 'true') throw new HttpError(503, 'Google sign-in is not enabled yet.');
    const verifier = randomSecret(),
      state = randomSecret();
    setCookie(ctx, 'umbrify_pkce', verifier, 600);
    setCookie(ctx, 'umbrify_oauth_state', state, 600);
    const params = new URLSearchParams({
      provider: 'google',
      redirect_to: `${origin}/api/auth?action=callback&state=${state}`,
      code_challenge: await hash(verifier),
      code_challenge_method: 's256'
    });
    return {
      url: `${url}/auth/v1/authorize?${params}`
    };
  }
  if (action === 'login' || action === 'signup' || action === 'recover') {
    if (typeof input.email !== 'string' || input.email.length > 254 || !input.email.includes('@')) throw new HttpError(400, 'Enter a valid email address.');
    if (action !== 'recover' && (typeof input.password !== 'string' || input.password.length < 8 || input.password.length > 128)) throw new HttpError(400, 'Use a password between 8 and 128 characters.');
    await authLimit(ctx, action, input.email);
    if (action === 'recover') {
      await authRequest(`recover?redirect_to=${encodeURIComponent(`${origin}/auth/callback`)}`, {
        email: input.email
      });
      return {
        message: 'If this email has an account, a reset link is on its way.'
      };
    }
    const session = action === 'login' ? await authRequest('token?grant_type=password', {
      email: input.email,
      password: input.password
    }) : await authRequest(`signup?redirect_to=${encodeURIComponent(`${origin}/auth/callback`)}`, {
      email: input.email,
      password: input.password,
      data: {
        display_name: String(input.display_name || 'Film lover').slice(0, 60)
      }
    });
    if (session.access_token) {
      saveSession(ctx, session);
      return {
        signedIn: true
      };
    }
    return {
      message: 'Check your inbox to confirm your account, then sign in.'
    };
  }
  // Supabase email verification/recovery uses a short-lived fragment callback.
  if (action === 'email-callback') {
    if (typeof input.access_token !== 'string' || typeof input.refresh_token !== 'string' || input.access_token.length > 8000 || input.refresh_token.length > 8000) throw new HttpError(400, 'Invalid sign-in link.');
    await authRequest('user', null, input.access_token);
    saveSession(ctx, {
      access_token: input.access_token,
      refresh_token: input.refresh_token,
      expires_in: 3600
    });
    return {
      ok: true
    };
  }
  await identify(ctx);
  if (action === 'logout') {
    await remote(`${url}/auth/v1/logout?scope=local`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${ctx.token}`
      }
    });
    clearSession(ctx);
    return {
      ok: true
    };
  }
  if (action === 'password') {
    if (typeof input.password !== 'string' || input.password.length < 8 || input.password.length > 128) throw new HttpError(400, 'Use a password between 8 and 128 characters.');
    await remote(`${url}/auth/v1/user`, {
      method: 'PUT',
      headers: {
        apikey: key,
        Authorization: `Bearer ${ctx.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        password: input.password
      })
    });
    return {
      ok: true
    };
  }
  throw new HttpError(400, 'Unknown account action.');
}
export default nodeHandler(auth);
