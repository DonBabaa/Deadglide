// What is printed on the player's keys. The game listens for physical keys
// (KeyW is the key where W sits on a QWERTY keyboard, wherever you are), so on
// a French AZERTY keyboard "KeyW" is the key marked Z, and the help has to say Z.
//
// In the page, an element with data-key="KeyW" (or several: data-key="KeyA KeyD")
// has its text replaced by what those keys are called on this keyboard.
const AZERTY = { KeyQ: 'A', KeyA: 'Q', KeyW: 'Z', KeyZ: 'W', KeyM: ',', Backquote: '²' };
const NAMES = { Space: 'Space', ShiftLeft: 'Shift', Escape: 'Esc', Backspace: 'Backspace', Enter: 'Enter', Backquote: '`' };
let layout = null;   // the browser's own answer, when it will give one (Chrome and Edge do)

export function keyLabel(code) {
  const own = layout?.get(code);
  if (own) return own.length === 1 ? own.toUpperCase() : own;
  // No answer from the browser: guess from the language it's set to.
  if (!layout && /^fr\b/i.test(navigator.language || '') && AZERTY[code]) return AZERTY[code];
  return NAMES[code] || code.replace(/^Key|^Digit/, '');
}

function relabel() {
  for (const el of document.querySelectorAll('[data-key]')) el.textContent = el.dataset.key.split(' ').map(keyLabel).join(' / ');
}

relabel();
navigator.keyboard?.getLayoutMap?.().then((map) => { layout = map; relabel(); }).catch(() => {});
