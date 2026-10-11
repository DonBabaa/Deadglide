// Emotes: short gestures played on a skater model, on top of whatever pose it
// is already in (riding in Free Ride, walking or sitting in the casino).
// Everyone who can see you sees them: only the emote's number is sent, and each
// machine plays it on its own copy of your model.
//
// To add one: an entry here, with a pose(k, t, w, P) that moves the model.
//   k   the SkaterModel        t   seconds since it began
//   w   0..1: how much of the emote to show (it eases in and out by itself)
//   P   helpers: P.left(x, y, z) and P.right(x, y, z) aim the two arms (radians),
//       P.lean(x) tips his body forward (+) or back (-), P.twist(y) turns it.
// The wheel (ui/emoteWheel.js) lays them out in this order, clockwise from the top.
const smooth = (k) => { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); };
const lerp = (a, b, t) => a + (b - a) * t;

export const EMOTES = [
  { id: 'wave', name: 'Wave', icon: '\u{1F44B}', time: 2.4, pose: (k, t, w, P) => P.left(-2.6, 0, Math.sin(t * 11) * 0.45) },
  { id: 'cheer', name: 'Cheer', icon: '\u{1F64C}', time: 2.4, pose: (k, t, w, P) => {
    const pump = Math.sin(t * 13) * 0.14;
    P.left(-2.7 + pump, 0, 0.15);
    P.right(-1.35 + pump, 0, 0);
    P.lean(-0.18);
  } },
  { id: 'smoke', name: 'Smoke', icon: '\u{1F6AC}', time: 3.4, pose: (k, t, w, P, dt) => {
    P.right(-0.95, -0.5, 0, smooth(t / 0.4) * (1 - smooth((t - 1.7) / 0.3)));   // hand to his mouth for the drag
    k.inhale = smooth((t - 0.45) / 0.4) * (1 - smooth((t - 1.6) / 0.12));
    if (t > 1.9 && t < 3.0) k.exhale(dt);
    P.lean(-0.2 * smooth((t - 1.8) / 0.3));   // head back as it rolls out
  } },
  { id: 'dance', name: 'Dance', icon: '\u{1F57A}', time: 3.6, pose: (k, t, w, P) => {
    const beat = Math.sin(t * 9);
    P.left(-1.5 + beat * 0.9, 0, 0.3);
    P.right(-0.5 - beat * 0.7, 0.2, 0);
    P.twist(beat * 0.5);
    P.lean(Math.abs(beat) * 0.12);
  } },
  { id: 'laugh', name: 'Laugh', icon: '\u{1F602}', time: 2.4, pose: (k, t, w, P) => {
    P.left(-0.95, 0, 0.75);   // a hand on his belly
    P.lean(-0.28 + Math.sin(t * 24) * 0.06);
  } },
  { id: 'bow', name: 'Bow', icon: '\u{1F647}', time: 2.2, pose: (k, t, w, P) => {
    P.lean(0.95);
    P.left(0.5, 0, 0.2);
  } },
];

// One per model. driven: something else sets his left arm every frame (the casino's walking and sitting
// poses do; out on the board nothing does, so there the emote has to put it back itself).
export function createEmoter(model, driven = false) {
  let index = -1, t = 0;
  const k = model;
  const P = {
    w: 0,
    left(x, y, z) {
      const r = k.leftArm.rotation;
      if (driven) r.set(lerp(r.x, x, P.w), lerp(r.y, y, P.w), lerp(r.z, z, P.w));
      else r.set(x * P.w, y * P.w, z * P.w);
    },
    right(x, y, z, w = 1) {
      const r = k.gunArm.rotation, a = P.w * w;
      r.set(lerp(r.x, x, a), lerp(r.y, y, a), lerp(r.z, z, a));
    },
    lean(x) { k.torso.rotation.x += x * P.w; },
    twist(y) { k.torso.rotation.y = y * P.w; },
  };
  // Both his own arms, whatever he is carrying; and a lit cigarette for a smoke, whatever is usually in his mouth.
  const dress = (on) => {
    if (k.twoHanded) {
      for (const piece of k.offArm) piece.visible = on;
      k.supportArm.visible = k.supportHand.visible = !on;
    }
    if (EMOTES[index]?.id !== 'smoke') return;
    if (!on) { k.inhale = 0; k.applyLook(k.look); return; }
    for (const kind in k.mouth) for (const piece of k.mouth[kind]) piece.visible = kind === 'cigarette';
    k.ember.visible = k.smoking = true;
  };

  const emoter = {
    // Which emote is playing, as a number to send to the others: 0 for none, otherwise its place in EMOTES plus one.
    get playing() { return index + 1; },
    play(i) {
      if (!EMOTES[i]) return;
      emoter.stop();
      index = i; t = 0;
      dress(true);
    },
    stop() {
      if (index < 0) return;
      dress(false);
      index = -1;
      k.torso.rotation.y = 0;
      if (!driven) k.leftArm.rotation.set(0, 0, 0);
    },
    // Somebody else's model: make it match the number they sent.
    match(n) {
      if (n !== emoter.playing) n > 0 ? emoter.play(n - 1) : emoter.stop();
    },
    // Call after the model has been posed for the frame.
    update(dt) {
      if (index < 0) return;
      const E = EMOTES[index];
      if ((t += dt) >= E.time) return emoter.stop();
      P.w = smooth(t / 0.2) * smooth((E.time - t) / 0.25);
      E.pose(k, t, P.w, P, dt);
    },
  };
  return emoter;
}
