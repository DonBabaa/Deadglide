// The site as a Cloudflare Worker (see wrangler.jsonc): the built game is served as static files, and /api/leaderboard
// is answered by the same code that answers it on Cloudflare Pages (functions/api/leaderboard.js).
import { onRequest as leaderboard } from './functions/api/leaderboard.js';

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname === '/api/leaderboard') return leaderboard({ request, env });
    return env.ASSETS.fetch(request);
  },
};
