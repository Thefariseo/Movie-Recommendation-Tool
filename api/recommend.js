import { execute, identify, body, rateLimit } from '../server/http.js';
import { discoveryConstraints } from '../shared/discovery.js';
import { recommendations } from '../server/recommendations.js';
export const config = {
  runtime: 'edge'
};
export default async function handler(request) {
  return execute(request, async ctx => {
    await identify(ctx);
    await rateLimit(ctx, 'recommend');
    const input = request.method === 'POST' ? await body(ctx) : {};
    const constraints = discoveryConstraints(input.constraints || {});
    const recent = Array.isArray(input.recent_ids) ? input.recent_ids.filter(x => Number.isSafeInteger(x) && x > 0).slice(-100) : [];
    return recommendations(ctx, input.members || [], constraints, recent);
  });
}
