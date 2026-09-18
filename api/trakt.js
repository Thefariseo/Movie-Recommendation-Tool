import { nodeHandler, identify, database, allRows, body, HttpError, settings, cookies, setCookie, rateLimit, remote } from '../server/http.js';
import { randomSecret, hash, encrypt, decrypt } from '../server/crypto.js';
import { normalizeMovie } from '../shared/library.js';
function enabled() {
  return !!(process.env.TRAKT_CLIENT_ID && process.env.TRAKT_CLIENT_SECRET && process.env.INTEGRATION_ENCRYPTION_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
function oauthInput() {
  return {
    client_id: process.env.TRAKT_CLIENT_ID,
    client_secret: process.env.TRAKT_CLIENT_SECRET,
    redirect_uri: `${settings().origin}/api/trakt?action=callback`
  };
}
async function tokenRequest(data) {
  return remote('https://api.trakt.tv/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      ...oauthInput(),
      ...data
    })
  });
}
async function traktRequest(token, path, {
  method = 'GET',
  body: payload
} = {}) {
  const response = await fetch(`https://api.trakt.tv/${path}`, {
    method,
    signal: AbortSignal.timeout(12000),
    headers: {
      'Content-Type': 'application/json',
      'trakt-api-version': '2',
      'trakt-api-key': process.env.TRAKT_CLIENT_ID,
      Authorization: `Bearer ${token}`
    },
    ...(payload ? {
      body: JSON.stringify(payload)
    } : {})
  });
  if (!response.ok) throw new HttpError(response.status === 429 ? 429 : 502, response.status === 401 ? 'Reconnect Trakt to continue.' : 'Trakt could not complete the request. Please try again later.');
  const text = await response.text();
  return {
    data: text ? JSON.parse(text) : null,
    pages: Number(response.headers.get('x-pagination-page-count') || 1)
  };
}
async function allTrakt(token, path) {
  const output = [];
  for (let page = 1; page <= 20; page++) {
    const {
      data,
      pages
    } = await traktRequest(token, `${path}?extended=full&page=${page}&limit=1000`);
    if (!Array.isArray(data)) throw new HttpError(502, 'Trakt returned an invalid catalogue.');
    output.push(...data);
    if (pages > 20 || output.length > 20000) throw new HttpError(413, 'This Trakt catalogue is too large for one sync. No import was applied.');
    if (page >= pages) return output;
  }
  throw new HttpError(413, 'Catalogue is too large.');
}
export async function trakt(ctx) {
  const action = ctx.url.searchParams.get('action') || 'status';
  if (action === 'callback' && ctx.request.method === 'GET') {
    if (!enabled()) throw new HttpError(503, 'Trakt is not enabled yet.');
    const state = ctx.url.searchParams.get('state'),
      code = ctx.url.searchParams.get('code');
    const c = cookies(ctx.request);
    setCookie(ctx, 'umbrify_trakt_state', '', 0);
    if (!state || state !== c.umbrify_trakt_state || !code) return {
      redirect: `${settings().origin}/profile?trakt=error`
    };
    const admin = database(null, true);
    const states = await admin(`oauth_states?digest=eq.${await hash(state)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}`, {
      method: 'DELETE',
      prefer: 'return=representation'
    });
    if (states.length !== 1) return {
      redirect: `${settings().origin}/profile?trakt=expired`
    };
    try {
      const token = await tokenRequest({
        code,
        grant_type: 'authorization_code'
      });
      await admin('integration_tokens', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates',
        body: {
          user_id: states[0].user_id,
          encrypted_token: await encrypt(token),
          updated_at: new Date().toISOString(),
          locked_until: null
        }
      });
      return {
        redirect: `${settings().origin}/profile?trakt=connected`
      };
    } catch {
      return {
        redirect: `${settings().origin}/profile?trakt=error`
      };
    }
  }
  await identify(ctx);
  if (action === 'status' && ctx.request.method === 'GET') {
    const rows = enabled() ? await database(null, true)(`integration_tokens?user_id=eq.${ctx.user.id}&select=updated_at`) : [];
    return {
      enabled: enabled(),
      connected: !!rows.length,
      updated_at: rows[0]?.updated_at
    };
  }
  if (ctx.request.method !== 'POST') throw new HttpError(405, 'Method not allowed.');
  if (!enabled()) throw new HttpError(503, 'Trakt is not enabled yet.');
  await rateLimit(ctx, 'trakt');
  const admin = database(null, true);
  const input = await body(ctx);
  if (action === 'connect') {
    const state = randomSecret();
    setCookie(ctx, 'umbrify_trakt_state', state, 600);
    await admin(`oauth_states?user_id=eq.${ctx.user.id}`, {
      method: 'DELETE'
    });
    await admin('oauth_states', {
      method: 'POST',
      body: {
        digest: await hash(state),
        user_id: ctx.user.id,
        expires_at: new Date(Date.now() + 600000).toISOString()
      }
    });
    return {
      url: `https://trakt.tv/oauth/authorize?${new URLSearchParams({
        response_type: 'code',
        client_id: process.env.TRAKT_CLIENT_ID,
        redirect_uri: oauthInput().redirect_uri,
        state
      })}`
    };
  }
  if (!['import', 'export', 'disconnect'].includes(action)) throw new HttpError(400, 'Unknown Trakt action.');
  if (!(await admin('rpc/lock_integration', {
    method: 'POST',
    body: {
      actor: ctx.user.id
    }
  }))) throw new HttpError(409, 'Connect Trakt first, or wait for the current sync to finish.');
  try {
    const [row] = await admin(`integration_tokens?user_id=eq.${ctx.user.id}&select=encrypted_token`);
    let token = await decrypt(row.encrypted_token);
    if ((token.created_at + token.expires_in) * 1000 < Date.now() + 60000) {
      token = await tokenRequest({
        grant_type: 'refresh_token',
        refresh_token: token.refresh_token
      });
      await admin(`integration_tokens?user_id=eq.${ctx.user.id}`, {
        method: 'PATCH',
        body: {
          encrypted_token: await encrypt(token),
          updated_at: new Date().toISOString()
        }
      });
    }
    if (action === 'disconnect') {
      await remote('https://api.trakt.tv/oauth/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...oauthInput(),
          token: token.access_token
        })
      });
      await admin(`integration_tokens?user_id=eq.${ctx.user.id}`, {
        method: 'DELETE'
      });
      return {
        message: 'Trakt disconnected.'
      };
    }
    const db = database(ctx.token);
    if (action === 'import') {
      // Read every page successfully before committing the first batch.
      const [watched, ratings, watchlist] = await Promise.all([allTrakt(token.access_token, 'sync/watched/movies'), allTrakt(token.access_token, 'sync/ratings/movies'), allTrakt(token.access_token, 'sync/watchlist/movies')]);
      const ratingMap = new Map(ratings.map(x => [x.movie?.ids?.tmdb, x.rating]));
      const source = [...watched.map(x => ['watched', x]), ...ratings.map(x => ['watched', x]), ...watchlist.map(x => ['watchlist', x])];
      const changes = new Map();
      let skipped = 0;
      for (const [kind, entry] of source) {
        const m = entry.movie;
        if (!Number.isSafeInteger(m?.ids?.tmdb)) {
          skipped++;
          continue;
        }
        const movie = normalizeMovie({
          id: m.ids.tmdb,
          title: m.title,
          year: m.year
        });
        changes.set(`${kind}:${movie.id}`, {
          op: 'put',
          kind,
          movie_id: movie.id,
          movie,
          rating: kind === 'watched' ? ratingMap.get(movie.id) || null : null,
          version: 0
        });
      }
      let imported = 0;
      const list = [...changes.values()];
      for (let i = 0; i < list.length; i += 500) {
        try {
          const rows = await db('rpc/apply_library', {
            method: 'POST',
            body: {
              changes: list.slice(i, i + 500),
              importing: true
            }
          });
          imported += rows.length;
        } catch {
          throw new HttpError(502, `Sync stopped after ${imported} imported entries. Retry to resume; existing entries are preserved.`);
        }
      }
      return {
        message: `Imported ${imported} new entries. ${list.length - imported} existing entries preserved; ${skipped} entries without a TMDB ID skipped.`
      };
    }
    if (input.confirm !== true) throw new HttpError(400, 'Confirm before sending ratings and watchlist entries to Trakt.');
    const rows = await allRows(db, `user_movies?user_id=eq.${ctx.user.id}&deleted=eq.false&order=movie_id,kind`);
    let sent = 0,
      notFound = 0;
    for (const kind of ['watchlist', 'watched']) {
      const movies = rows.filter(r => r.kind === kind && (kind === 'watchlist' || r.rating)).map(r => ({
        ids: {
          tmdb: Number(r.movie_id)
        },
        ...(kind === 'watched' ? {
          rating: r.rating
        } : {})
      }));
      for (let i = 0; i < movies.length; i += 100) {
        try {
          const result = await traktRequest(token.access_token, kind === 'watchlist' ? 'sync/watchlist' : 'sync/ratings', {
            method: 'POST',
            body: {
              movies: movies.slice(i, i + 100)
            }
          });
          notFound += result.data?.not_found?.movies?.length || 0;
          sent += movies.slice(i, i + 100).length;
        } catch {
          throw new HttpError(502, `Trakt sync stopped after ${sent} entries. Retry to resume.`);
        }
      }
    }
    return {
      message: `Sent ${sent - notFound} ratings/watchlist entries to Trakt; ${notFound} not found. No watched-history events or deletions were sent.`
    };
  } finally {
    await admin(`integration_tokens?user_id=eq.${ctx.user.id}`, {
      method: 'PATCH',
      body: {
        locked_until: null
      }
    }).catch(() => {});
  }
}
export default nodeHandler(trakt);
