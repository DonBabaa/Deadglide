// The shared leaderboard, as a Netlify Function at /api/leaderboard.
//   GET  -> { top: [...] }                      the best scores
//   POST { name, score, wave, time, won }       post a score; returns { top, rank, improved }
//
// Scores live in Netlify Blobs (storage that comes with the site: nothing to
// set up). Each name keeps only its best score. There is no real protection
// against a cheat posting a made-up score, only sanity limits.
import { getStore } from '@netlify/blobs';

const KEEP = 200;              // entries stored
const SHOW = 20;               // entries sent to the game
const MAX_SCORE = 100_000_000;
const KEY = 'level1';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

// Letters, digits, spaces and a few symbols; at most 16 characters.
const cleanName = (raw) => String(raw ?? '').replace(/[^\p{L}\p{N} _.\-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 16);
const whole = (n, max) => Math.max(0, Math.min(max, Math.floor(Number(n)) || 0));

export default async (req) => {
  const store = getStore({ name: 'leaderboard', consistency: 'strong' });
  const board = (await store.get(KEY, { type: 'json' })) || [];

  if (req.method === 'GET') return json({ top: board.slice(0, SHOW) });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'Bad request' }, 400); }
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
    await store.setJSON(KEY, next);
  }
  const rank = next.findIndex(same) + 1;   // 0 = didn't make the stored list
  return json({ top: next.slice(0, SHOW), rank, improved, best: improved ? score : old.score });
};

export const config = { path: '/api/leaderboard' };
