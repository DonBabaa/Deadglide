// The player's nickname: chosen on the main menu, shown by the health bar and
// used on the leaderboard. Remembered in this browser.
import { load, store } from '../systems/storage.js';

const KEY = 'name';

// Letters, digits, spaces and a few symbols; at most 16 characters (the leaderboard's rule).
export const cleanName = (raw) => String(raw ?? '').replace(/[^\p{L}\p{N} _.\-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 16);

export function getName() {
  return cleanName(load(KEY));
}

export function setName(name) {
  const clean = cleanName(name);
  store(KEY, clean);
  return clean;
}
