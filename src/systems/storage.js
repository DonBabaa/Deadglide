// Saving in this browser (localStorage), under "deadslide.<name>".
// The game used to be called Deadglide: anything saved under the old name is
// still read, and moved to the new name the first time it's found, so nobody
// loses a best score, gold or settings to the rename.
const key = (name) => `deadslide.${name}`;
const oldKey = (name) => `deadglide.${name}`;

// The saved text for `name`, or null if there is none (or storage is blocked).
export function load(name) {
  try {
    let value = localStorage.getItem(key(name));
    if (value === null) {
      value = localStorage.getItem(oldKey(name));
      if (value !== null) {
        localStorage.setItem(key(name), value);
        localStorage.removeItem(oldKey(name));
      }
    }
    return value;
  } catch { return null; }
}

export function store(name, value) {
  try { localStorage.setItem(key(name), value); } catch {}
}
