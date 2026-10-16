// The shared leaderboard, as a Cloudflare Pages Function at /api/leaderboard (the path comes from where this file is:
// functions/api/leaderboard.js).
//   GET  -> { top: [...] }                      the best scores
//   POST { name, score, wave, time, won }       post a score; returns { top, rank, improved }
// There are three boards: the main one (runs of the levels), `line` (Free Ride's best single line: ask for it with
// ?board=line, or "board": "line" in a POST; there, `wave` is how many tricks were in the line), and `run` (the
// fastest times down the hill).
//
// Scores live in Cloudflare KV: a small key-value store bound to the site under the name LEADERBOARD (set up once, in
// the Cloudflare dashboard: see HOSTING.md). Each name keeps only its best score. There is no real protection against a
// cheat posting a made-up score, only sanity limits. KV takes up to a minute to show a new score everywhere, and two
// scores posted in the same instant can lose one of them: fine for a board among friends.
const KEEP = 200;              // entries stored
const SHOW = 20;               // entries sent to the game
const MAX_SCORE = 100_000_000;
const KEYS = { main: 'level1', line: 'moon-line', run: 'long-way-down', deadair: 'dead-air' };   // (deadair: DEAD AIR, the round reached: stored as round x 100,000 + kills)   // (run: stored as 1,000,000 less the time in hundredths of a second, so that a higher score is still a better one)

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

// Letters, digits, spaces and a few symbols; at most 16 characters.
const cleanName = (raw) => String(raw ?? '').replace(/[^\p{L}\p{N} _.\-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 16);
const whole = (n, max) => Math.max(0, Math.min(max, Math.floor(Number(n)) || 0));

export async function onRequest({ request, env }) {
  const store = env.LEADERBOARD;
  if (!store) return json({ error: 'The leaderboard has no storage yet (bind a KV namespace as LEADERBOARD)' }, 500);
  let body = null;
  if (request.method === 'POST') { try { body = await request.json(); } catch { return json({ error: 'Bad request' }, 400); } }
  else if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  const KEY = KEYS[body ? body.board : new URL(request.url).searchParams.get('board')] || KEYS.main;
  const board = (await store.get(KEY, { type: 'json' })) || [];
  if (!body) return json({ top: board.slice(0, SHOW) });
  const name = cleanName(body.name), score = whole(body.score, Infinity);
  if (!name) return json({ error: 'Enter a name' }, 400);
  if (score <= 0 || score > MAX_SCORE) return json({ error: 'That score cannot be posted' }, 400);

  const entry = { name, score, wave: whole(body.wave, 999), time: whole(body.time, 86400), won: !!body.won, at: Date.now() };
  const same = (e) => e.name.toLowerCase() === name.toLowerCase();
  const old = board.find(same), improved = !old || score > old.score;
  let next = board;
  if (improved) {
    next = board.filter((e) => !same(e));
    next.push(entry);
    next.sort((a, b) => b.score - a.score || a.at - b.at);
    next.length = Math.min(next.length, KEEP);
    await store.put(KEY, JSON.stringify(next));
  }
  const rank = next.findIndex(same) + 1;   // 0 = didn't make the stored list
  return json({ top: next.slice(0, SHOW), rank, improved, best: improved ? score : old.score });
}
