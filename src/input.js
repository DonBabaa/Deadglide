// Keyboard + mouse state. Game keys are ignored while typing in the tweak panel.
const keys = new Set();

// Key bindings. Change a key here and it changes everywhere.
// (Codes are physical keys: 'KeyQ', 'Space', 'ShiftLeft', 'ControlLeft'...)
export const KEYS = {
  roll: ['KeyW'],                        // gentle, steady acceleration
  push: ['KeyQ'],                        // kick-push: a burst of speed
  brake: ['KeyS'],
  left: ['KeyA'],
  right: ['KeyD'],
  slide: ['ShiftLeft', 'ShiftRight'],    // powerslide
  ollie: ['Space'],
  trick: ['KeyE'],
};
const held = (action) => KEYS[action].some((code) => keys.has(code));
const typing = (e) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;

export const input = {
  mouseDX: 0,
  mouseDY: 0,
  jumpReleased: false,   // set on Space keyup, cleared by the skater when used
  trickPressed: false,   // set on E keydown, cleared by the skater when used
  fireHeld: false,       // left mouse
  aimHeld: false,        // right mouse

  down: (code) => keys.has(code),

  // Snapshot for one physics step.
  get steer() { return (held('left') ? 1 : 0) - (held('right') ? 1 : 0); },
  get trickHeld() { return held('trick'); },
  get push() { return held('roll'); },
  get kick() { return held('push'); },
  get brake() { return held('brake'); },
  get drift() { return held('slide'); },
  get jumpHeld() { return held('ollie'); },

  takeMouse() {
    const d = [this.mouseDX, this.mouseDY];
    this.mouseDX = this.mouseDY = 0;
    return d;
  },
};

window.addEventListener('keydown', (e) => {
  if (typing(e)) return;
  if (KEYS.ollie.includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  if (KEYS.trick.includes(e.code)) input.trickPressed = true;
});
window.addEventListener('keyup', (e) => {
  if (keys.delete(e.code) && KEYS.ollie.includes(e.code)) input.jumpReleased = true;
});
window.addEventListener('blur', () => { keys.clear(); input.fireHeld = input.aimHeld = false; });

// Mouse buttons only count while the game has the pointer (so UI clicks don't shoot).
window.addEventListener('mousedown', (e) => {
  if (!document.pointerLockElement) return;
  if (e.button === 0) input.fireHeld = true;
  if (e.button === 2) input.aimHeld = true;
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) input.fireHeld = false;
  if (e.button === 2) input.aimHeld = false;
});
window.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('mousemove', (e) => {
  if (!document.pointerLockElement) return;
  input.mouseDX += e.movementX;
  input.mouseDY += e.movementY;
});
