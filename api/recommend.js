import { execute, identify, body, rateLimit } from '../server/http.js';
import { recommendations } from '../server/recommendations.js';
export const config = {
  runtime: 'edge'
};
export default async function handler(request) {
  return execute(request, async ctx => {
    await identify(ctx);
    await rateLimit(ctx, 'recommend');
    const input = request.method === 'POST' ? await body(ctx) : {};
    return recommendations(ctx, input.members || []);
  });
}
