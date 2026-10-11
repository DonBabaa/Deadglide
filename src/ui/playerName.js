// The player's nickname: chosen on the main menu, shown by the health bar and
// used on the leaderboard. Remembered in this browser.
const KEY = 'deadglide.name';   // (the key keeps the game's old name so nobody loses theirs)

// Letters, digits, spaces and a few symbols; at most 16 characters (the leaderboard's rule).
export const cleanName = (raw) => String(raw ?? '').replace(/[^\p{L}\p{N} _.\-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 16);

export function getName() {
  try { return cleanName(localStorage.getItem(KEY)); } catch { return ''; }
}

export function setName(name) {
  const clean = cleanName(name);
  try { localStorage.setItem(KEY, clean); } catch {}
  return clean;
}
