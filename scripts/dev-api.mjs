// Local Vite proxy target. Production uses the same handlers on Vercel.
import http from 'node:http';
import auth from '../api/auth.js';
import library from '../api/library.js';
import social from '../api/social.js';
import chat from '../api/chat.js';
import trakt from '../api/trakt.js';
import ratings from '../api/ratings.js';
import { nodeHandler, identify, body, rateLimit } from '../server/http.js';
import { recommendations } from '../server/recommendations.js';
const recommend = nodeHandler(async ctx => {
  await identify(ctx);
  await rateLimit(ctx, 'recommend');
  const input = ctx.request.method === 'POST' ? await body(ctx) : {};
  return recommendations(ctx, input.members || []);
});
const routes = {
  auth,
  library,
  social,
  chat,
  trakt,
  ratings,
  recommend
};
http.createServer(async (req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname.slice('/api/'.length);
  if (!routes[name]) {
    res.writeHead(404, {
      'Content-Type': 'application/json'
    });
    res.end(JSON.stringify({
      error: 'Not found.'
    }));
    return;
  }
  try {
    await routes[name](req, res);
  } catch {
    res.writeHead(500, {
      'Content-Type': 'application/json'
    });
    res.end(JSON.stringify({
      error: 'Local API failed.'
    }));
  }
}).listen(3001, '127.0.0.1', () => console.log('Umbrify API: http://127.0.0.1:3001 (Vite proxies /api)'));
