// Keyboard + mouse state. Game keys are ignored while typing in the tweak panel.
const keys = new Set();
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
  get steer() { return (keys.has('KeyA') ? 1 : 0) - (keys.has('KeyD') ? 1 : 0); },
  get push() { return keys.has('KeyW'); },
  get brake() { return keys.has('KeyS'); },
  get kick() { return keys.has('ShiftLeft') || keys.has('ShiftRight'); },
  get jumpHeld() { return keys.has('Space'); },

  takeMouse() {
    const d = [this.mouseDX, this.mouseDY];
    this.mouseDX = this.mouseDY = 0;
    return d;
  },
};

window.addEventListener('keydown', (e) => {
  if (typing(e)) return;
  if (e.code === 'Space') e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  if (e.code === 'KeyE') input.trickPressed = true;
});
window.addEventListener('keyup', (e) => {
  if (keys.delete(e.code) && e.code === 'Space') input.jumpReleased = true;
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
