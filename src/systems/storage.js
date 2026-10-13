// Saving in this browser (localStorage), under "mastre:deadslide:<name>".
// The game is one of several on the Mastre Gaming hub (mastre.json), and they all save on the one site: the prefix
// (the hub's name, then this game's id there) keeps its saves apart from theirs.
// It used to save under "deadslide.<name>", and before that, when it was called Deadglide, under "deadglide.<name>".
// Anything found under an old name is moved to the new one before the game reads a thing, so nobody loses a best
// score, gold or settings to a rename.
const PREFIX = 'mastre:deadslide:';
const OLD = ['deadslide.', 'deadglide.'];   // (the later name first: where both hold something, it is the one kept)
const key = (name) => PREFIX + name;

try {
  for (const old of OLD) {
    for (const was of Object.keys(localStorage)) {
      if (!was.startsWith(old)) continue;
      const now = key(was.slice(old.length));
      if (localStorage.getItem(now) === null) localStorage.setItem(now, localStorage.getItem(was));
      localStorage.removeItem(was);
    }
  }
} catch {}

// The saved text for `name`, or null if there is none (or storage is blocked).
export function load(name) {
  try { return localStorage.getItem(key(name)); } catch { return null; }
}

export function store(name, value) {
  try { localStorage.setItem(key(name), value); } catch {}
}
