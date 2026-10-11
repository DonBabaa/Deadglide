// The emote wheel: hold T and it opens in the middle of the screen. Push the
// mouse toward an emote (or press its number, or click it) and let go of T to
// play it. Let go with nothing chosen and it just closes.
//
//   canOpen()      is this somewhere emotes are allowed, right now?
//   onPick(index)  play EMOTES[index]
// `wheel.open` is true while it is up: main.js keeps the mouse from turning the camera meanwhile.
import { EMOTES } from '../player/emotes.js';

const KEY = 'KeyT', REACH = 110, DEAD = 28;   // how far the pointer can be pushed from the middle (pixels), and how far before it chooses

export function createEmoteWheel({ canOpen, onPick }) {
  const el = document.getElementById('emotes'), label = document.getElementById('emotes-name');
  const typing = (e) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
  let x = 0, y = 0, chosen = -1;

  // The emotes round a circle, the first at the top, clockwise.
  const buttons = EMOTES.map((E, i) => {
    const b = document.createElement('button'), a = (i / EMOTES.length) * Math.PI * 2;
    b.type = 'button';
    b.innerHTML = `<i>${E.icon}</i><small>${i + 1}</small>`;
    b.style.left = `${50 + Math.sin(a) * 36}%`;
    b.style.top = `${50 - Math.cos(a) * 36}%`;
    b.addEventListener('click', () => { choose(i); close(true); });
    b.addEventListener('pointerenter', () => { if (!document.pointerLockElement) choose(i); });
    el.append(b);
    return b;
  });

  function choose(i) {
    chosen = i;
    buttons.forEach((b, k) => b.classList.toggle('on', k === i));
    label.textContent = i >= 0 ? EMOTES[i].name : 'Emote';
  }
  function close(play) {
    if (!wheel.open) return;
    wheel.open = false;
    el.classList.add('hidden');
    if (play && chosen >= 0) onPick(chosen);
  }

  const wheel = { open: false, close: () => close(false) };

  window.addEventListener('keydown', (e) => {
    if (typing(e)) return;
    if (wheel.open && /^Digit[1-9]$/.test(e.code) && EMOTES[e.code[5] - 1]) { e.stopImmediatePropagation(); choose(e.code[5] - 1); return close(true); }
    if (e.code !== KEY || e.repeat || wheel.open || !canOpen()) return;
    wheel.open = true;
    x = y = 0;
    choose(-1);
    el.classList.remove('hidden');
  }, true);
  window.addEventListener('keyup', (e) => { if (e.code === KEY) close(true); });
  window.addEventListener('blur', () => close(false));
  // The pointer, as a push away from the middle of the wheel (the mouse itself may be locked to the game).
  window.addEventListener('mousemove', (e) => {
    if (!wheel.open || !document.pointerLockElement) return;
    x += e.movementX; y += e.movementY;
    const far = Math.hypot(x, y);
    if (far > REACH) { x *= REACH / far; y *= REACH / far; }
    if (far < DEAD) return choose(-1);
    const turn = (Math.atan2(x, -y) + Math.PI * 2) % (Math.PI * 2);
    choose(Math.round(turn / (Math.PI * 2 / EMOTES.length)) % EMOTES.length);
  });
  return wheel;
}
