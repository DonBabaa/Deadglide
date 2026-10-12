// The other monsters, in detail (the zombie is in zombie.js). Each is the version you see close up; for the ones that
// come in hordes, enemyModels.js keeps a plain version with the same parts, in the same order, hinged in the same
// places, and the horde draws that for the ones further off. The bosses are only ever drawn like this.
// All of them are sculpted with the kit in sculpt.js: skins through points, pushed and crumpled and painted.
import * as THREE from 'three';
import { tube, lump, sculpt, dent, rough, dirty, sheet, fineHand, fineFoot, paint, part, slab, between, noise, boneShaft, fineSkull, ribCage, spikes } from './sculpt.js';

const PI = Math.PI;
const lit = (p) => ({ ...p, glow: true });
// Cloth that hangs in folds: pushed in and out round it, more toward the bottom. top: the height the folds start from.
const folds = (geo, amount, top, count = 9) => sculpt(geo, (v) => { const k = 1 + amount * Math.max(0, Math.min(1, (top - v.y) / 0.9)) * Math.sin(Math.atan2(v.z, v.x) * count + v.y * 6); v.x *= k; v.z *= k; });

// ---- Skeleton: every bone of it. ----
export function skeleton() {
  const bone = 0xddd6c1, old = 0xb3aa92, dark = 0x14120f, teeth = 0xe9e3cf, light = 0xa8ecff, cloth = 0x3a3026;
  const B = { bone, old, dark, teeth }, hands = { skin: bone, joint: old, nail: old };
  const age = (g) => dirty(g, { mottle: 0.3, freq: 30, under: 0.45 });
  const body = part([
    ...fineSkull(0.125, B, { at: [0, 1.665, 0.02], jaw: 0.22, fine: 20 }),
    ...[1.5, 1.525, 1.55].map((y, i) => age(lump(0.026, i % 2 ? bone : old, [0, y, -0.02 + i * 0.006], [1, 0.6, 1], 7))),            // neck
    ...ribCage(1.45, 1.08, 0.17, -0.04, 0.13, 8, B).map(age),
    ...[-1, 1].flatMap((s) => [
      age(tube([[s * 0.02, 1.455, 0.125], [s * 0.11, 1.48, 0.09], [s * 0.21, 1.47, 0.0]], [0.013, 0.011, 0.014], bone, { sides: 6, steps: 3 })),   // collarbone
      age(sculpt(lump(0.085, old, [s * 0.13, 1.36, -0.085], [0.75, 1, 0.14], 8), (v) => { if (v.y < 1.33) v.x = (v.x - s * 0.13) * 0.6 + s * 0.13; })),   // shoulder blade
      age(lump(0.036, old, [s * 0.21, 1.47, 0], [1, 1, 1], 8)),
    ]),
    ...[0, 1, 2, 3, 4].map((i) => age(lump(0.032, i % 2 ? bone : old, [0, 1.06 - i * 0.035, -0.035 + 0.01 * Math.sin(i)], [1, 0.55, 1], 7))),   // the small of the back
    ...[-1, 1].flatMap((s) => [
      age(sculpt(lump(0.1, bone, [s * 0.09, 0.97, -0.03], [0.85, 0.7, 0.2], 12), (v) => { v.z += Math.abs(v.x) * 0.55 - 0.05; v.x += s * Math.max(0, v.y - 0.95) * 0.5; dent(v, [s * 0.09, 0.97, 0.03], 0.06, 0.03); })),            // the wings of the pelvis
      age(lump(0.045, old, [s * 0.1, 0.9, 0], [1, 1, 1], 8)),
    ]),
    age(lump(0.045, old, [0, 0.93, -0.05], [1, 1.2, 0.7], 8)),
    age(tube([[-0.08, 0.87, 0.04], [0, 0.85, 0.07], [0.08, 0.87, 0.04]], [0.016, 0.014, 0.016], bone, { sides: 6, steps: 3 })),
    dirty(sheet([0, 0.9, 0], [0.12, 0.13], 1.5 * PI - 0.7, 1.4, 0.3, cloth, { squash: 0.7, ragged: 0.1 }), { mottle: 0.5 }),                    // what is left of its burial cloth
    dirty(sheet([0, 0.9, 0], [0.12, 0.125], 0.5 * PI - 0.5, 1.0, 0.2, cloth, { squash: 0.7, ragged: 0.1 }), { mottle: 0.5 }),
  ]);
  const eyes = lit(part([lump(0.017, light, [-0.05, 1.675, 0.115], [1, 1, 1], 6), lump(0.017, light, [0.05, 1.675, 0.115], [1, 1, 1], 6)]));
  const arm = (side, phase) => {
    const S = [side * 0.21, 1.47, 0], E = [side * 0.225, 1.19, -0.04], W = [side * 0.205, 1.13, 0.22];
    return part([
      age(boneShaft(S, E, 0.02, bone)),
      age(boneShaft([E[0] - 0.012, E[1], E[2]], [W[0] - 0.012, W[1], W[2]], 0.011, bone, 1.4)), age(boneShaft([E[0] + 0.012, E[1], E[2]], [W[0] + 0.012, W[1], W[2]], 0.011, old, 1.4)),
      ...[-0.014, 0, 0.014].map((dx) => lump(0.012, old, [W[0] + dx, W[1] - 0.004, W[2] + 0.012], [1, 1, 1], 5)),                                // the small bones of the wrist
      ...fineHand(W, [0, -0.25, 1], 0.062, hands, { curl: 0.7, thumb: -side, spread: 1.15 }),
    ], S, [0.9, 0, 0], phase);
  };
  const leg = (side, phase) => {
    const x = side * 0.1, H = [x, 0.9, 0], K = [x, 0.48, 0.04], A = [x, 0.08, 0];
    return part([
      age(boneShaft(H, K, 0.024, bone)), age(lump(0.032, old, [x - side * 0.02, 0.905, 0], [1, 1, 1], 7)),
      age(lump(0.024, bone, [x, 0.48, 0.072], [1, 1.1, 0.6], 7)),                                                                               // knee cap
      age(boneShaft([x - 0.012, 0.47, 0.04], [x - 0.012, 0.085, 0], 0.016, bone, 1.5)), age(boneShaft([x + 0.016, 0.46, 0.03], [x + 0.016, 0.09, -0.005], 0.008, old, 1.4)),
      ...fineFoot(A, 0.22, hands, 0.08).map(age),
    ], H, [0.8, 0, 0], phase);
  };
  return [body, eyes, arm(-1, 0), arm(1, PI), leg(-1, PI), leg(1, 0)];
}

// ---- Ghost: a robe with nothing in it but two eyes, and hands that are all too much there. ----
export function ghost() {
  const shroud = 0xb7c2d8, shade = 0x8792ab, deep = 0x5d6781, bone = 0xe6e2d2, dark = 0x06080d, light = 0xd6fbff, rope = 0x6b6a5a;
  const hands = { skin: bone, joint: 0xc4bfae, nail: 0x9a9684 };
  const body = part([
    dirty(folds(tube([[0, 0.36, 0], [0, 0.6, 0], [0, 0.85, 0], [0, 1.05, 0.01], [0, 1.22, 0.02]], [0.3, 0.34, 0.28, 0.22, 0.17], shroud, { sides: 30, steps: 5, caps: false }), 0.09, 1.25), { mottle: 0.25, freq: 8, under: 0.5, muck: [0.7, 0.45, deep] }),
    dirty(paint(new THREE.SphereGeometry(0.25, 24, 16, PI / 2 + 0.8, PI * 2 - 1.6).scale(1, 1.12, 1.14).translate(0, 1.33, -0.02), shade), { mottle: 0.3, freq: 10 }),   // the hood, open at the front
    tube([[0, 1.56, -0.08], [0, 1.66, -0.16], [0, 1.62, -0.27], [0, 1.52, -0.33]], [0.11, 0.07, 0.03, 0.006], shade, { sides: 8, steps: 3 }),                             // its peak, drooping behind
    lump(0.2, dark, [0, 1.32, 0], [1, 1.1, 0.95], 12),                                                                                                                    // nothing inside it
    dirty(sheet([0, 1.22, 0.02], [0.19, 0.33], 1.5 * PI + 0.35, 2 * PI - 0.7, 0.3, shade, { ragged: 0.11, across: 18, down: 5 }), { mottle: 0.3 }),                        // a mantle over the shoulders
    paint(new THREE.TorusGeometry(0.245, 0.016, 6, 24).rotateX(PI / 2).translate(0, 0.96, 0.0), rope),                                                                    // a rope round the middle...
    lump(0.03, rope, [0.05, 0.95, 0.245], [1, 1, 1], 7),
    ...[0.03, 0.075].map((x, i) => tube([[x, 0.94, 0.25], [x + 0.02, 0.78, 0.27], [x + 0.01, 0.62 - i * 0.07, 0.26]], [0.012, 0.012, 0.016], rope, { sides: 5, steps: 3 })),   // ...its ends hanging
  ]);
  const eyes = lit(part([lump(0.034, light, [-0.07, 1.34, 0.185], [1.3, 0.75, 1], 8), lump(0.034, light, [0.07, 1.34, 0.185], [1.3, 0.75, 1], 8)]));
  const arm = (side, phase) => {
    const S = [side * 0.2, 1.12, 0.04], E = [side * 0.29, 1.02, 0.27], M = [side * 0.26, 1.13, 0.5], W = [side * 0.25, 1.17, 0.6];
    return part([
      dirty(rough(tube([S, E, M], [0.085, 0.1, 0.118], shade, { sides: 16, steps: 5, caps: false }), 0.008, 25), { mottle: 0.3 }),
      lump(0.1, dark, between(E, M, 0.86), [1, 1, 0.5], 8),                                                                               // the dark up the sleeve
      ...spikes(8, (i) => { const a = (i / 8) * PI * 2; return [[M[0] + Math.cos(a) * 0.11, M[1] + Math.sin(a) * 0.11, M[2]], [M[0] + Math.cos(a) * 0.12, M[1] + Math.sin(a) * 0.12 - 0.05, M[2] + 0.05 + 0.04 * (i % 2)], 0.02]; }, deep),   // its ragged mouth
      boneShaft([between(E, M, 0.5)[0] - 0.012, between(E, M, 0.5)[1], between(E, M, 0.5)[2]], [W[0] - 0.012, W[1], W[2]], 0.009, bone, 1.4),
      boneShaft([between(E, M, 0.5)[0] + 0.012, between(E, M, 0.5)[1], between(E, M, 0.5)[2]], [W[0] + 0.012, W[1], W[2]], 0.009, bone, 1.4),
      ...fineHand(W, [0, 0.08, 1], 0.085, hands, { curl: 0.85, thumb: -side, spread: 1.3 }),
    ], S, [0.16, 0, 0.05], phase);
  };
  const hem = part(Array.from({ length: 11 }, (_, i) => {
    const a = (i / 11) * PI * 2, long = 0.4 + (i % 3) * 0.13, c = Math.cos(a), s = Math.sin(a);
    return tube([[c * 0.2, 0.42, s * 0.2], [c * 0.25, 0.42 - long * 0.5, s * 0.25 + 0.03], [c * 0.2, 0.42 - long, s * 0.2 + 0.08]], [0.11, 0.075, 0.005], i % 2 ? shade : deep, { sides: 6, steps: 4, squash: 0.35 });
  }), [0, 0.4, 0], [0.3, 0, 0.18], 1);
  return [body, eyes, arm(-1, 0), arm(1, 2), hem];
}

// ---- Giant rat: mange, bristles, whiskers, and a tail it has had a long time. ----
export function bigRat() {
  const fur = 0x3b332b, dark = 0x26201b, pink = 0xa87370, tooth = 0xe8e0c8, eye = 0xff5a3a, claw = 0xd8d2bf;
  const coat = (g, stains = []) => dirty(rough(g, 0.011, 55), { mottle: 0.45, freq: 14, under: 0.4, stains });
  const body = part([
    coat(tube([[0, 0.26, -0.4], [0, 0.36, -0.2], [0, 0.31, 0.08], [0, 0.31, 0.36], [0, 0.28, 0.54], [0, 0.255, 0.66]], [0.09, 0.2, 0.19, 0.13, 0.075, 0.03], fur, { sides: 18, steps: 5 }), [[0.1, 0.44, -0.1, 0.1, pink, 0.75], [-0.12, 0.3, 0.15, 0.07, 0x5a1a16, 0.7]]),
    ...[-1, 1].flatMap((s) => [coat(lump(0.13, dark, [s * 0.12, 0.26, -0.2], [0.8, 1, 1.2], 10)), coat(lump(0.09, fur, [s * 0.12, 0.24, 0.2], [0.8, 1, 1], 8))]),   // haunches and shoulders
    ...[-1, 1].flatMap((s) => [sculpt(lump(0.06, pink, [s * 0.095, 0.43, 0.36], [1, 1, 0.22], 10), (v) => dent(v, [s * 0.095, 0.43, 0.375], 0.05, 0.012)), lump(0.035, 0x7a4a48, [s * 0.095, 0.425, 0.372], [1, 1, 0.15], 8)]),   // ears
    lump(0.03, pink, [0, 0.262, 0.675], [1, 0.8, 0.9], 8),                                                                                    // nose
    ...spikes(10, (i) => { const s = i % 2 ? 1 : -1, k = Math.floor(i / 2); return [[s * 0.035, 0.25 + k * 0.006, 0.63], [s * (0.16 + 0.02 * k), 0.22 + k * 0.03, 0.6 + 0.015 * k], 0.0035]; }, 0xcfc8ae),   // whiskers
    slab(0.02, 0.07, 0.018, tooth, [-0.014, 0.2, 0.655], [0.2, 0, 0]), slab(0.02, 0.07, 0.018, tooth, [0.014, 0.2, 0.655], [0.2, 0, 0]),   // the long teeth...
    slab(0.016, 0.035, 0.014, tooth, [-0.011, 0.2, 0.62], [-0.3, 0, 0]), slab(0.016, 0.035, 0.014, tooth, [0.011, 0.2, 0.62], [-0.3, 0, 0]),   // ...and the ones under them
    ...spikes(28, (i) => { const z = -0.34 + i * 0.026, y = 0.47 + 0.06 * Math.sin((z + 0.4) * 3.2) - (z > 0.2 ? 0.07 : 0), x = ((i % 3) - 1) * 0.035; return [[x, y, z], [x * 1.4, y + 0.05, z - 0.035], 0.009]; }, dark),   // bristles down its back
  ]);
  const eyes = lit(part([lump(0.024, eye, [-0.065, 0.345, 0.5], [1, 1, 1], 7), lump(0.024, eye, [0.065, 0.345, 0.5], [1, 1, 1], 7)]));
  const tail = part([
    dirty(tube([[0, 0.24, -0.4], [0.03, 0.2, -0.58], [-0.04, 0.14, -0.78], [0.02, 0.08, -0.98], [0, 0.06, -1.12]], [0.034, 0.028, 0.02, 0.012, 0.004], pink, { sides: 8, steps: 6 }), { mottle: 0.45, freq: 70 }),
  ], [0, 0.24, -0.36], [0, 0.6, 0], 0);
  const leg = (side, front, phase) => {
    const hip = [side * 0.15, 0.2, front * 0.22], knee = [side * 0.175, 0.13, front * 0.22 + (front > 0 ? -0.03 : 0.05)], paw = [side * 0.15, 0.035, front * 0.22 + 0.03];
    return part([
      coat(tube([hip, knee, paw], [0.05, 0.036, 0.022], fur, { sides: 8, steps: 3 })),
      lump(0.03, pink, [paw[0], 0.018, paw[2] + 0.02], [1.1, 0.5, 1.5], 7),
      ...[-1.5, -0.5, 0.5, 1.5].flatMap((t) => [tube([[paw[0] + t * 0.014, 0.02, paw[2] + 0.04], [paw[0] + t * 0.02, 0.012, paw[2] + 0.085]], [0.008, 0.006], pink, { sides: 5 }), tube([[paw[0] + t * 0.02, 0.012, paw[2] + 0.085], [paw[0] + t * 0.021, 0.004, paw[2] + 0.105]], [0.004, 0.001], claw, { sides: 4 })]),
    ], hip, [0.9, 0, 0], phase);
  };
  return [body, eyes, tail, leg(-1, 1, 0), leg(1, 1, PI), leg(-1, -1, PI), leg(1, -1, 0)];
}

// ---- Spider (and, recoloured, the Spider Queen): a ridged abdomen with its mark, bristles, fangs, jointed legs. ----
export function fineSpider(c) {
  const body = part([
    dirty(rough(sculpt(lump(0.3, c.body, [0, 0.52, -0.34], [1, 0.85, 1.25], 20), (v) => { const k = 1 + 0.035 * Math.sin((v.z + 0.34) * 26); v.x *= k; v.y = 0.52 + (v.y - 0.52) * k; }), 0.006, 40),
      { mottle: 0.4, freq: 12, under: 0.5, stains: [[0, 0.775, -0.28, 0.1, c.mark, 0.95], [0, 0.76, -0.46, 0.075, c.mark, 0.95]] }),
    lump(0.05, c.mark, [0, 0.776, -0.37], [0.6, 0.22, 1.1], 8),
    dirty(rough(lump(0.19, c.shell, [0, 0.42, 0.1], [1.15, 0.7, 1.15], 14), 0.004, 40), { mottle: 0.35 }),                               // the front half, where the legs join
    dirty(lump(0.115, c.body, [0, 0.42, 0.31], [1, 0.95, 1], 12), { mottle: 0.3 }),                                                      // head
    tube([[0, 0.44, -0.02], [0, 0.47, -0.1]], [0.07, 0.1], c.shell, { sides: 8 }),                                                       // waist
    ...[-1, 1].flatMap((s) => [
      tube([[s * 0.045, 0.4, 0.38], [s * 0.05, 0.33, 0.43]], [0.04, 0.03], c.shell, { sides: 8, steps: 2 }),                             // jaws...
      tube([[s * 0.05, 0.33, 0.43], [s * 0.04, 0.25, 0.45], [s * 0.015, 0.2, 0.42]], [0.022, 0.014, 0.003], c.fang, { sides: 6, steps: 3 }),   // ...and fangs
      tube([[s * 0.09, 0.4, 0.36], [s * 0.15, 0.4, 0.48], [s * 0.12, 0.3, 0.55]], [0.022, 0.018, 0.012], c.leg, { sides: 6, steps: 3 }),       // feelers
    ]),
    ...[-0.03, 0, 0.03].map((x) => tube([[x, 0.45, -0.68], [x * 1.4, 0.42, -0.78]], [0.03, 0.008], c.shell, { sides: 6 })),               // spinnerets
    ...spikes(46, (i) => { const th = i * 2.399, ph = Math.acos(1 - ((i + 0.5) / 46) * 1.35), n = [Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)], b = [n[0] * 0.295, 0.52 + n[1] * 0.25, -0.34 + n[2] * 0.37]; return [b, [b[0] + n[0] * 0.06, b[1] + n[1] * 0.06, b[2] + n[2] * 0.06 - 0.02], 0.008]; }, c.leg),   // bristles
  ]);
  const eyes = lit(part([
    ...[-0.075, -0.027, 0.027, 0.075].map((x) => lump(0.019, c.eye, [x, 0.46, 0.405 - Math.abs(x) * 0.5], [1, 1, 1], 6)),
    lump(0.024, c.eye, [-0.045, 0.515, 0.385], [1, 1, 1], 6), lump(0.024, c.eye, [0.045, 0.515, 0.385], [1, 1, 1], 6),
  ]));
  const leg = (side, k) => {
    const z0 = 0.2 - k * 0.11, fan = [0.6, 0.22, -0.18, -0.58][k], hip = [side * 0.15, 0.42, z0];
    const knee = [side * 0.52, 0.82, z0 + fan * 0.55], foot = [side * 0.9, 0, z0 + fan * 1.1], shin = between(knee, foot, 0.55);
    shin[0] += side * 0.07;
    return part([
      tube([hip, between(hip, knee, 0.5), knee], [0.045, 0.04, 0.032], c.leg, { sides: 8, steps: 3 }), lump(0.042, c.body, knee, [1, 1, 1], 7),
      tube([knee, shin, foot], [0.032, 0.022, 0.005], c.leg, { sides: 8, steps: 3 }), lump(0.028, c.body, shin, [1, 1, 1], 6),
      ...spikes(6, (i) => { const p = between(knee, foot, 0.12 + i * 0.13); return [p, [p[0] + side * 0.04, p[1] + 0.05, p[2] + (i % 2 ? 0.03 : -0.03)], 0.006]; }, c.shell),
    ], hip, [0.22, 0.42, 0], (k % 2 ? PI : 0) + (side > 0 ? PI : 0));
  };
  return [body, eyes, ...[0, 1, 2, 3].flatMap((k) => [leg(-1, k), leg(1, k)])];
}

// ---- Bone-thrower: bent under a sack of them, with the next one already in his hand. ----
export function boneThrower() {
  const robe = 0x2d2722, robeDark = 0x1a1714, bone = 0xd8d2bf, old = 0xb3aa92, dark = 0x0c0b0a, teeth = 0xe0d9c2, sack = 0x5e4d34, sackDark = 0x43361f, eye = 0x8dff5a, rope = 0x7a6a4a;
  const B = { bone, old, dark, teeth }, hands = { skin: bone, joint: old, nail: old };
  const body = part([
    dirty(folds(tube([[0, 0.02, 0], [0, 0.3, 0], [0, 0.7, 0.01], [0, 1.05, 0.04], [0, 1.3, 0.1], [0, 1.46, 0.14]], [0.38, 0.33, 0.25, 0.21, 0.2, 0.12], robe, { sides: 26, steps: 4, caps: false }), 0.07, 1.3), { mottle: 0.35, freq: 9, under: 0.5, muck: [0.5, 0.6, 0x3a3226] }),
    ...[0, 1, 2, 3, 4, 5].map((i) => sheet([0, 0.16, 0], [0.37, 0.4], i * 1.05, 0.7, 0.16, robeDark, { ragged: 0.1, across: 5, down: 3 })),      // the hem, in tatters
    dirty(paint(new THREE.SphereGeometry(0.215, 22, 14, PI / 2 + 0.75, PI * 2 - 1.5).scale(1, 1.05, 1.15).translate(0, 1.6, 0.15), robeDark), { mottle: 0.3 }),   // hood
    tube([[0, 1.78, 0.05], [0, 1.84, -0.05], [0, 1.78, -0.16]], [0.1, 0.06, 0.012], robeDark, { sides: 8, steps: 3 }),
    ...fineSkull(0.125, B, { at: [0, 1.59, 0.2], jaw: 0.3, fine: 16, tilt: 0.15 }),                                                              // the skull inside it
    dirty(sheet([0, 1.45, 0.1], [0.2, 0.3], 1.5 * PI + 0.5, 2 * PI - 1.0, 0.22, robeDark, { ragged: 0.07, squash: 0.9, across: 14 }), { mottle: 0.3 }),
    paint(new THREE.TorusGeometry(0.235, 0.016, 6, 22).rotateX(PI / 2).translate(0, 0.98, 0.03), rope),                                          // a rope belt, with a few bones hung off it
    ...[-0.12, 0.02, 0.14].flatMap((x, i) => [tube([[x, 0.98, 0.25], [x, 0.86, 0.27]], [0.006, 0.006], rope, { sides: 4 }), boneShaft([x - 0.04, 0.84, 0.27], [x + 0.05, 0.7 - 0.03 * i, 0.28], 0.014, i % 2 ? old : bone)]),
    // The sack: patched, tied at the neck, with what is in it sticking out of the top.
    dirty(rough(sculpt(lump(0.27, sack, [-0.04, 1.2, -0.3], [1, 1.15, 0.9], 18), (v) => { if (v.y > 1.42) { v.x = -0.04 + (v.x + 0.04) * 0.6; v.z = -0.3 + (v.z + 0.3) * 0.6; } }), 0.014, 18), { mottle: 0.4, freq: 10, stains: [[0.1, 1.1, -0.5, 0.1, sackDark, 0.8], [-0.2, 1.3, -0.4, 0.08, sackDark, 0.8]] }),
    paint(new THREE.TorusGeometry(0.1, 0.014, 5, 12).rotateX(PI / 2).translate(-0.04, 1.46, -0.3), rope),
    slab(0.1, 0.1, 0.01, sackDark, [0.08, 1.15, -0.535], [0.1, 0.3, 0.2]),
    tube([[-0.2, 1.42, -0.1], [-0.12, 1.5, 0.1], [0.05, 1.3, 0.2]], [0.014, 0.014, 0.014], rope, { sides: 5, steps: 4 }),                         // its strap, over his shoulder
    boneShaft([-0.12, 1.4, -0.3], [-0.2, 1.72, -0.38], 0.02, bone), boneShaft([0.06, 1.4, -0.34], [0.14, 1.68, -0.44], 0.018, old), boneShaft([-0.02, 1.42, -0.3], [0.0, 1.74, -0.3], 0.016, bone),
    ...fineSkull(0.07, { bone: old, old, dark, teeth }, { at: [-0.16, 1.44, -0.18], fine: 10, yaw: -1, upper: 5, lower: 0, jaw: 0 }),
  ]);
  const eyes = lit(part([lump(0.02, eye, [-0.05, 1.612, 0.3], [1, 1, 1], 6), lump(0.02, eye, [0.05, 1.612, 0.3], [1, 1, 1], 6)]));
  const sleeve = (S, E, cuff) => dirty(rough(tube([S, E, cuff], [0.078, 0.064, 0.056], robe, { sides: 12, steps: 4, caps: false }), 0.007, 26), { mottle: 0.35 });
  const TS = [0.27, 1.42, 0], TE = [0.35, 1.68, -0.12], TW = [0.31, 1.94, -0.2];
  const throwing = part([
    sleeve(TS, TE, between(TE, TW, 0.45)),
    boneShaft(between(TE, TW, 0.25), TW, 0.012, bone, 1.4), boneShaft([between(TE, TW, 0.25)[0] + 0.02, between(TE, TW, 0.25)[1], between(TE, TW, 0.25)[2]], [TW[0] + 0.02, TW[1], TW[2]], 0.01, old, 1.4),
    ...fineHand(TW, [0, 1, -0.15], 0.07, hands, { curl: 1, thumb: 1 }),
    boneShaft([0.31, 2.0, -0.42], [0.31, 2.08, 0.02], 0.022, bone),                                                                               // the next one, in his fist
  ], TS, [0.9, 0, 0], 0);
  const OS = [-0.27, 1.42, 0], OE = [-0.32, 1.13, 0.1], OW = [-0.3, 0.9, 0.27];
  const other = part([
    sleeve(OS, OE, between(OE, OW, 0.4)),
    boneShaft(between(OE, OW, 0.2), OW, 0.012, bone, 1.4), boneShaft([between(OE, OW, 0.2)[0] + 0.02, between(OE, OW, 0.2)[1], between(OE, OW, 0.2)[2]], [OW[0] + 0.02, OW[1], OW[2]], 0.01, old, 1.4),
    ...fineHand(OW, [0, -0.7, 0.7], 0.07, hands, { curl: 0.4, thumb: -1 }),
  ], OS, [0.4, 0, 0], PI);
  return [body, eyes, throwing, other];
}

// ---- Hamzitus Goyitus: all of him. ----
export function hamzitus() {
  const skin = 0x8a9468, rot = 0x5c6648, pale = 0xa3a97c, vest = 0x3d3a31, vestDark = 0x2a2822, trousers = 0x26262b, blood = 0x6a1512, gut = 0x8c3a34, filth = 0x4a2a12, bone = 0xd8d2bf, dark = 0x121110, eye = 0xffb347, mud = 0x3a3226;
  const flesh = (g, stains = []) => dirty(rough(g, 0.006, 22), { mottle: 0.4, freq: 8, under: 0.45, stains });
  // What is inside him, and coming out: raw meat, the wet of it, fat, old blood gone black.
  const meat = 0x7a1f1a, wet = 0xa3271f, clot = 0x3d0b09, fat = 0xc9b56a, steel = 0x8e9298, grub = 0xe6dfc0;
  const raw = (g) => dirty(rough(g, 0.008, 30), { mottle: 0.5, freq: 22, under: 0.3 });
  const link = (at, turn) => paint(new THREE.TorusGeometry(0.035, 0.01, 4, 7).scale(0.65, 1, 1).rotateY(turn).translate(...at), 0x2a2b2e);
  const body = part([
    flesh(sculpt(lump(0.6, skin, [0, 0.98, 0.1], [1.05, 0.95, 1], 28), (v) => { const k = 1 + 0.03 * Math.sin(v.y * 22); v.x *= k; v.z = 0.1 + (v.z - 0.1) * k; dent(v, [0, 0.86, 0.7], 0.07, 0.05); }),
      [[-0.28, 0.72, 0.5, 0.2, filth], [0.3, 1.02, 0.52, 0.14, filth], [0.05, 0.9, 0.66, 0.44, blood, 0.88], [-0.22, 0.62, 0.56, 0.26, blood, 0.75], [0.3, 0.7, 0.5, 0.2, clot, 0.7], [0, 1.2, -0.5, 0.3, blood, 0.8]]),   // the belly, in rolls, and what has run down it
    flesh(lump(0.5, pale, [0, 0.8, 0.16], [1.02, 0.9, 0.95], 22)),                                                                     // ...sagging over where a belt was
    flesh(lump(0.46, skin, [0, 1.36, 0], [1.1, 0.85, 0.9], 22)),
    flesh(lump(0.2, pale, [-0.22, 1.34, 0.3], [1.1, 0.9, 0.7], 12)), flesh(lump(0.2, pale, [0.22, 1.34, 0.3], [1.1, 0.9, 0.7], 12)),
    dirty(tube([[0, 1.05, -0.02], [0, 1.3, -0.02], [0, 1.6, 0]], [0.57, 0.57, 0.43], vest, { sides: 24, steps: 3, squash: 0.86, arc: [1.5 * PI + 0.9, 2 * PI - 1.8] }), { mottle: 0.4, freq: 6 }),   // a vest far too small
    dirty(sheet([0, 1.6, 0], [0.44, 0.57], 1.5 * PI + 0.5, 0.45, 0.6, vestDark, { ragged: 0.1, squash: 0.9 }), { mottle: 0.4 }), dirty(sheet([0, 1.6, 0], [0.44, 0.57], 1.5 * PI - 0.95, 0.45, 0.55, vestDark, { ragged: 0.12, squash: 0.9 }), { mottle: 0.4 }),
    lump(0.2, blood, [0.05, 0.98, 0.62], [0.7, 1.5, 0.5], 12),                                                                         // split down the middle
    ...[1.16, 1.08, 1.0, 0.92].map((y) => tube([[-0.1, y, 0.66], [0.05, y - 0.01, 0.74], [0.2, y, 0.66]], [0.014, 0.018, 0.014], bone, { sides: 6, steps: 3 })),
    dirty(tube([[0, 0.92, 0.7], [-0.08, 0.84, 0.76], [0.08, 0.76, 0.74], [-0.04, 0.66, 0.72], [0.1, 0.58, 0.66], [0.02, 0.5, 0.62]], [0.06, 0.07, 0.065, 0.06, 0.05, 0.03], gut, { sides: 10, steps: 4 }), { mottle: 0.5, freq: 20 }),
    dirty(tube([[0.12, 0.9, 0.68], [0.2, 0.8, 0.7], [0.14, 0.7, 0.7]], [0.045, 0.05, 0.03], gut, { sides: 8, steps: 3 }), { mottle: 0.5, freq: 20 }),
    flesh(lump(0.25, skin, [-0.5, 1.5, 0], [1, 1, 1], 14)), flesh(lump(0.25, skin, [0.5, 1.5, 0], [1, 1, 1], 14)),
    flesh(lump(0.3, skin, [0, 1.56, 0.08], [1.25, 0.55, 1], 16)), flesh(lump(0.26, pale, [0, 1.62, 0.1], [1.15, 0.4, 1], 14)),         // no neck: rolls
    ...Array.from({ length: 12 }, (_, i) => lump(0.035 + 0.02 * (i % 3), rot, [Math.sin(i * 1.9) * 0.42, 1.05 + 0.55 * ((i * 0.37) % 1), -0.36 - 0.06 * Math.cos(i)], [1, 1, 0.6], 7)),   // boils, down his back
    flesh(sculpt(lump(0.21, skin, [0, 1.74, 0.14], [1, 1.05, 1], 22), (v) => { dent(v, [-0.08, 1.79, 0.33], 0.07, 0.05); dent(v, [0.08, 1.79, 0.33], 0.07, 0.05); dent(v, [0, 1.87, 0.3], 0.17, -0.04); dent(v, [0, 1.66, 0.34], 0.1, 0.06); }),
      [[0.13, 1.76, 0.26, 0.09, rot, 0.8], [0, 1.66, 0.3, 0.09, dark, 0.95]]),                                                         // a small head: a heavy brow, a mouth hanging open
    flesh(lump(0.2, pale, [0, 1.62, 0.2], [1.25, 0.6, 1], 14)),                                                                        // jowls
    lump(0.045, dark, [-0.08, 1.79, 0.28], [1, 1, 0.6], 8), lump(0.045, dark, [0.08, 1.79, 0.28], [1, 1, 0.6], 8),
    ...[-0.075, -0.045, -0.015, 0.015, 0.045, 0.075].map((x, i) => slab(0.024, 0.04 + 0.012 * (i % 2), 0.02, bone, [x, 1.69, 0.33], [0, x * 2, 0])),
    ...[-0.05, 0, 0.05].map((x) => slab(0.026, 0.035, 0.02, bone, [x, 1.615, 0.325])),
    tube([[0.04, 1.62, 0.34], [0.05, 1.52, 0.38], [0.045, 1.4, 0.36]], [0.014, 0.01, 0.004], filth, { sides: 5, steps: 3 }),             // drool
    lump(0.05, skin, [-0.2, 1.76, 0.1], [0.4, 1, 0.8], 8), lump(0.05, skin, [0.2, 1.76, 0.1], [0.4, 1, 0.8], 8),
    lump(0.045, rot, [0, 1.74, 0.36], [1.2, 0.8, 0.8], 8),
    ...spikes(9, (i) => { const a = (i / 8) * PI - PI / 2; return [[Math.sin(a) * 0.15, 1.92, 0.1 + Math.cos(a) * 0.06], [Math.sin(a) * 0.2, 2.0 + 0.03 * (i % 2), 0.04], 0.012]; }, 0x1d1a16),   // a few hairs
    // ---- The wound, properly: the skin peeled back off it in flaps, fat under the skin, what was inside hanging out ----
    ...[[-1, 1.2], [-1, 1.0], [-1, 0.8], [1, 1.22], [1, 1.02], [1, 0.82], [1, 0.66]].map(([s, y], i) => flesh(tube([[0.05 + s * 0.12, y, 0.66], [0.05 + s * 0.24, y + 0.03, 0.78], [0.05 + s * 0.34, y - 0.08 - 0.03 * (i % 2), 0.7]], [0.09, 0.075, 0.015], i % 2 ? pale : skin, { sides: 7, steps: 4, squash: 0.3 }))),
    ...[[-1, 1.1], [-1, 0.9], [1, 1.12], [1, 0.92], [1, 0.74]].map(([s, y]) => raw(lump(0.08, fat, [0.05 + s * 0.15, y, 0.68], [0.7, 1.3, 0.5], 8))),
    raw(lump(0.26, meat, [0.05, 0.98, 0.56], [0.75, 1.45, 0.6], 14)), raw(lump(0.13, clot, [-0.03, 1.1, 0.66], [1.2, 0.8, 0.6], 10)), raw(lump(0.1, 0x5a1420, [0.12, 0.88, 0.7], [1, 1.2, 0.7], 10)),   // the meat of him; a liver; something else
    raw(tube([[-0.06, 0.82, 0.72], [-0.24, 0.6, 0.72], [-0.3, 0.4, 0.62], [-0.16, 0.22, 0.7], [0.06, 0.1, 0.82], [0.3, 0.04, 0.95], [0.5, 0.03, 0.9]], [0.065, 0.07, 0.065, 0.06, 0.055, 0.05, 0.03], gut, { sides: 10, steps: 4 })),   // a length of gut right down to the floor, dragging
    raw(tube([[0.14, 0.8, 0.72], [0.3, 0.62, 0.66], [0.2, 0.44, 0.7], [0.32, 0.3, 0.62]], [0.05, 0.055, 0.05, 0.02], 0x9a4a3c, { sides: 8, steps: 4 })),
    raw(tube([[-0.02, 0.9, 0.74], [0.02, 0.76, 0.82], [-0.06, 0.62, 0.8], [0.04, 0.5, 0.76]], [0.04, 0.045, 0.04, 0.015], wet, { sides: 7, steps: 4 })),
    ...spikes(18, (i) => { const x = -0.26 + (i * 0.37) % 0.62, y = 0.64 + ((i * 0.53) % 0.5); return [[x, y, 0.62 + 0.08 * Math.cos(x * 3)], [x + 0.01, y - 0.14 - 0.16 * ((i * 0.31) % 1), 0.64 + 0.08 * Math.cos(x * 3)], 0.022]; }, wet),   // blood, running
    ...Array.from({ length: 16 }, (_, i) => lump(0.016, grub, [-0.1 + ((i * 0.29) % 0.34), 0.8 + ((i * 0.43) % 0.42), 0.74 + 0.03 * Math.sin(i)], [1, 0.6, 1.8], 5)),                                   // and what has moved in
    // ---- His face: a cheek torn off the teeth, one eye out on its string, the top of his skull open ----
    raw(lump(0.085, meat, [0.15, 1.69, 0.25], [0.6, 1.1, 0.8], 10)), ...[0, 1, 2, 3].map((i) => slab(0.02, 0.035, 0.022, bone, [0.14 + i * 0.012, 1.685 - i * 0.004, 0.3 - i * 0.03], [0, 0.9, 0])),
    raw(lump(0.05, clot, [-0.08, 1.79, 0.29], [1, 1, 0.5], 8)), tube([[-0.08, 1.78, 0.31], [-0.1, 1.7, 0.37], [-0.09, 1.63, 0.38]], [0.012, 0.008, 0.008], wet, { sides: 5, steps: 3 }), lump(0.036, 0xe8e2c8, [-0.09, 1.6, 0.385], [1, 1, 1], 8), lump(0.016, 0x1a1512, [-0.09, 1.59, 0.415], [1, 1, 0.5], 6),
    raw(lump(0.11, bone, [0.07, 1.9, 0.1], [1, 0.45, 1], 10)), raw(lump(0.09, 0xb8686a, [0.08, 1.93, 0.09], [1, 0.6, 1.1], 10)), ...spikes(6, (i) => [[0.02 + i * 0.03, 1.88, 0.2], [0.02 + i * 0.032, 1.76 - 0.03 * (i % 3), 0.26], 0.016], wet),
    ...spikes(7, (i) => [[-0.06 + i * 0.022, 1.63, 0.33], [-0.06 + i * 0.022, 1.5 - 0.05 * (i % 2), 0.36], 0.014], wet),                                                                                 // down his chin
    // ---- Things in him: a butcher's hook through each shoulder on its chain, a cleaver left in his back ----
    ...[-1, 1].flatMap((s) => [
      tube([[s * 0.5, 1.82, -0.1], [s * 0.54, 1.66, 0.0], [s * 0.5, 1.5, 0.2], [s * 0.42, 1.56, 0.3], [s * 0.4, 1.66, 0.3]], [0.028, 0.028, 0.026, 0.02, 0.006], steel, { sides: 6, steps: 4 }),
      ...Array.from({ length: 9 }, (_, i) => link([s * (0.5 + 0.012 * i), 1.84 - i * 0.075, -0.12 - i * 0.04], i % 2 ? PI / 2 : 0)),
      raw(lump(0.07, wet, [s * 0.5, 1.52, 0.2], [1, 1, 1], 8)), ...spikes(5, (i) => [[s * 0.5 + (i - 2) * 0.02, 1.5, 0.22], [s * 0.5 + (i - 2) * 0.024, 1.3 - 0.06 * (i % 2), 0.3], 0.016], wet),
    ]),
    slab(0.02, 0.3, 0.42, steel, [-0.22, 1.72, -0.38], [0.5, 0.2, 0.3]), tube([[-0.25, 1.86, -0.52], [-0.3, 2.06, -0.72]], [0.03, 0.035], 0x4a3220, { sides: 6 }), raw(lump(0.09, wet, [-0.2, 1.62, -0.3], [1, 1, 0.6], 8)),
    // ---- His back, where the skin has gone: the spine showing, in a trench of meat ----
    raw(lump(0.2, meat, [0, 1.28, -0.4], [0.6, 2.0, 0.5], 12)), ...Array.from({ length: 8 }, (_, i) => lump(0.045, bone, [0, 0.98 + i * 0.085, -0.5 - 0.03 * Math.sin(i * 0.5)], [1.3, 0.6, 1], 7)),
    ...[1.05, 1.22, 1.39, 1.56].flatMap((y) => [-1, 1].map((s) => tube([[s * 0.04, y, -0.5], [s * 0.2, y - 0.03, -0.47]], [0.022, 0.012], bone, { sides: 5 }))),
  ]);
  const eyes = lit(part([lump(0.03, eye, [0.08, 1.79, 0.305], [1, 1, 1], 7)]));   // (the one he has left)
  const arm = (side, phase) => {
    const S = [side * 0.56, 1.5, 0], E = [side * 0.7, 1.04, 0.08], W = [side * 0.66, 0.7, 0.32], F = [side * 0.66, 0.6, 0.4];
    return part([
      flesh(tube([S, between(S, E, 0.5), E, W], [0.22, 0.25, 0.18, 0.13], skin, { sides: 18, steps: 4 }), [[...E, 0.16, rot, 0.6]]),
      flesh(lump(0.2, pale, [side * 0.64, 1.3, 0.02], [1, 1.15, 1], 12)),                                                              // the flab hanging off it
      raw(lump(0.13, meat, [side * 0.76, 1.2, 0.1], [0.6, 1.2, 1], 10)), boneShaft([side * 0.8, 1.32, 0.1], [side * 0.8, 1.08, 0.12], 0.03, bone, 1.2),             // a bite out of it, to the bone
      ...spikes(6, (i) => [[side * 0.76, 1.12, 0.04 + i * 0.03], [side * 0.77, 0.9 - 0.05 * (i % 3), 0.06 + i * 0.03], 0.018], wet),
      raw(lump(0.09, wet, [F[0], F[1] + 0.06, F[2] + 0.16], [1.5, 0.5, 0.8], 8)), ...spikes(5, (i) => [[F[0] + (i - 2) * 0.06, F[1] - 0.1, F[2] + 0.16], [F[0] + (i - 2) * 0.06, F[1] - 0.3 - 0.06 * (i % 2), F[2] + 0.18], 0.02], wet),   // knuckles split, and dripping
      flesh(lump(0.17, rot, F, [1, 0.85, 1.05], 14)),                                                                                  // a fist like a ham
      ...[-1.5, -0.5, 0.5, 1.5].map((k) => flesh(tube([[F[0] + k * 0.075, F[1] + 0.04, F[2] + 0.12], [F[0] + k * 0.078, F[1] - 0.06, F[2] + 0.2], [F[0] + k * 0.07, F[1] - 0.14, F[2] + 0.1]], [0.05, 0.046, 0.036], skin, { sides: 8, steps: 3 }))),
      flesh(tube([[F[0] - side * 0.13, F[1] + 0.04, F[2]], [F[0] - side * 0.2, F[1] - 0.03, F[2] + 0.1]], [0.055, 0.04], skin, { sides: 8, steps: 2 })),
      dirty(rough(lump(0.13, filth, [F[0], F[1] - 0.07, F[2] + 0.08], [1, 0.9, 1], 10), 0.02, 30), { mottle: 0.5, freq: 25 }),         // a handful, ready to throw
      ...[-0.05, 0.04].map((dx) => tube([[F[0] + dx, F[1] - 0.14, F[2] + 0.08], [F[0] + dx, F[1] - 0.3, F[2] + 0.09]], [0.02, 0.004], filth, { sides: 5, steps: 2 })),
    ], S, [0.5, 0, 0], phase);
  };
  const leg = (side, phase) => {
    const x = side * 0.27, H = [x, 0.6, 0], K = [x * 1.04, 0.33, 0.06], A = [x, 0.13, 0.0];
    return part([
      dirty(rough(tube([H, K, [x, 0.2, 0.02]], [0.24, 0.19, 0.15], trousers, { sides: 16, steps: 4 }), 0.008, 18), { mottle: 0.35, freq: 8, muck: [0.5, 0.6, mud] }),
      ...spikes(7, (i) => { const a = (i / 7) * PI * 2; return [[x + Math.cos(a) * 0.14, 0.22, 0.02 + Math.sin(a) * 0.14], [x + Math.cos(a) * 0.15, 0.12 - 0.03 * (i % 2), 0.02 + Math.sin(a) * 0.15], 0.03]; }, vestDark),   // the trouser end, in ribbons
      flesh(tube([[x, 0.24, 0.02], A], [0.12, 0.1], skin, { sides: 12, steps: 2 })),
      raw(lump(0.1, meat, [x, 0.2, 0.1], [0.8, 1.3, 0.5], 8)), boneShaft([x, 0.28, 0.13], [x, 0.12, 0.13], 0.022, bone, 1.2),                                           // a shin laid open
      raw(lump(0.16, clot, [x * 1.02, 0.45, 0.17], [1, 1.4, 0.4], 8)),                                                                                                 // his trousers soaked through
      ...fineFoot(A, 0.44, { skin: rot, joint: skin, nail: 0x2b2a1e }, 0.13).map((g) => dirty(g, { mottle: 0.4, freq: 14 })),
    ], H, [0.32, 0, 0], phase);
  };
  return [body, eyes, arm(-1, 0), arm(1, PI), leg(-1, PI), leg(1, 0)];
}

// ---- Rubistus Goyitus: a giant made of the people who could not pay. ----
export function rubistus() {
  const bone = 0xc9c2ad, old = 0x9c9279, dark = 0x050505, eye = 0x8dff5a, gold = 0xc9a23a, teeth = 0xe0d9c2;
  // He is not old bones. They are still wet: blood round every mouth, sinew holding one to the next, meat left on.
  const meat = 0x7a1f1a, wet = 0xa3271f, clot = 0x3d0b09, gut = 0x8c3a34, skinned = 0x9a6a58;
  const raw = (g) => dirty(rough(g, 0.008, 30), { mottle: 0.5, freq: 22, under: 0.3 });
  const gory = (list, [x, y, z], r, yaw = 0) => list.map((g) => dirty(g, { mottle: 0.05, under: 0, stains: [[x + Math.sin(yaw) * r * 0.75, y - r * 0.45, z + Math.cos(yaw) * r * 0.75, r * 1.0, wet, 0.9], [x, y + r * 0.8, z, r * 0.5, clot, 0.7]] }));
  const S = (x, y, z, r, o = {}) => gory(fineSkull(r, { bone: o.old ? old : bone, old, dark, teeth }, { at: [x, y, z], yaw: o.yaw || 0, fine: o.fine || 12, jaw: o.jaw ?? 0.12, upper: 6, lower: 5 }), [x, y, z], r, o.yaw || 0);
  const strand = (A, B, r = 0.022, sag = 0.06, color = meat) => tube([A, [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2 - sag, (A[2] + B[2]) / 2 + 0.03], B], [r, r * 0.6, r], color, { sides: 5, steps: 3 });
  const age = (g) => dirty(g, { mottle: 0.3, freq: 14, under: 0.5 });
  const body = part([
    ...S(-0.2, 0.86, 0.02, 0.17, { yaw: -0.5, old: 1 }), ...S(0.2, 0.86, 0.02, 0.17, { yaw: 0.5 }), ...S(0, 0.8, 0.12, 0.16, { old: 1 }),          // a heap of skulls for hips...
    ...S(-0.3, 1.14, 0.04, 0.18, { yaw: -0.6 }), ...S(0, 1.12, 0.14, 0.19, { old: 1, jaw: 0.4 }), ...S(0.3, 1.14, 0.04, 0.18, { yaw: 0.6 }),       // ...three rows of them for a chest...
    ...S(-0.34, 1.44, 0.02, 0.19, { yaw: -0.5, old: 1 }), ...S(0, 1.42, 0.13, 0.2), ...S(0.34, 1.44, 0.02, 0.19, { yaw: 0.5, old: 1, jaw: 0.3 }),
    ...S(-0.16, 1.28, -0.16, 0.17, { yaw: 2.6, old: 1 }), ...S(0.16, 1.28, -0.16, 0.17, { yaw: -2.6 }),                                          // ...and more behind
    ...Array.from({ length: 13 }, (_, i) => age(lump(0.07, i % 2 ? bone : old, [0, 0.72 + i * 0.08, -0.2 + 0.03 * Math.sin(i * 0.6)], [1, 0.5, 1], 8))),   // a spine up the back of it
    ...[0.98, 1.14, 1.3, 1.46, 1.6].flatMap((y) => [-1, 1].map((s) => age(tube([[s * 0.03, y + 0.02, -0.2], [s * 0.36, y, -0.14], [s * 0.47, y - 0.03, 0.06], [s * 0.3, y - 0.08, 0.27]], [0.03, 0.028, 0.024, 0.012], bone, { sides: 7, steps: 3 })))),   // ribs, holding it in
    ...[[-0.25, 1.0, 0.2, 0.2, 1.3, 0.24], [0.18, 0.95, 0.22, -0.1, 0.7, 0.26], [-0.12, 1.26, 0.24, 0.2, 1.3, 0.2], [0.1, 1.55, 0.2, 0.4, 1.62, 0.12], [-0.4, 1.3, -0.1, -0.1, 1.5, -0.22], [0.42, 1.0, -0.1, 0.2, 1.25, -0.24], [-0.3, 0.7, 0.1, 0.05, 0.66, 0.2]]
      .map(([a, b, c, d, e, f], i) => age(boneShaft([a, b, c], [d, e, f], 0.022, i % 2 ? old : bone))),                                         // loose bones, wedged in between
    ...S(-0.56, 1.62, 0, 0.16, { yaw: -1.2 }), ...S(0.56, 1.62, 0, 0.16, { yaw: 1.2 }),                                                           // shoulders
    ...gory(fineSkull(0.3, { bone, old, dark, teeth }, { at: [0, 1.9, 0.08], fine: 26, jaw: 0.32, upper: 10, lower: 8 }), [0, 1.9, 0.08], 0.3),      // the head: one huge skull, its mouth running...
    paint(new THREE.TorusGeometry(0.275, 0.034, 8, 30).rotateX(PI / 2).translate(0, 2.14, 0.06), gold), paint(new THREE.TorusGeometry(0.285, 0.012, 6, 30).rotateX(PI / 2).translate(0, 2.19, 0.06), gold),   // ...in a crown...
    ...Array.from({ length: 9 }, (_, k) => { const a = (k / 9) * PI * 2, x = Math.sin(a) * 0.28, z = 0.06 + Math.cos(a) * 0.28; return age(tube([[x, 2.14, z], [x * 1.04, 2.28, z + (z - 0.06) * 0.04], [x * 0.96, 2.42 + 0.05 * (k % 2), z - (z - 0.06) * 0.06]], [0.028, 0.02, 0.005], bone, { sides: 6, steps: 3 })); }),   // ...of rib bones
    ...[0, 1, 2, 3].map((k) => lump(0.03, eye, [Math.sin(k * 1.57 + 0.3) * 0.3, 2.14, 0.06 + Math.cos(k * 1.57 + 0.3) * 0.3], [1, 1, 0.7], 7)),   // (set with something green)
    // ---- Sinew, from skull to skull: it is what holds him up ----
    ...[[[-0.2, 0.86, 0.1], [-0.3, 1.14, 0.12]], [[0.2, 0.86, 0.1], [0.3, 1.14, 0.12]], [[0, 0.8, 0.2], [0, 1.12, 0.24]], [[-0.3, 1.14, 0.12], [-0.34, 1.44, 0.1]], [[0.3, 1.14, 0.12], [0.34, 1.44, 0.1]], [[0, 1.12, 0.26], [0, 1.42, 0.24]],
      [[-0.3, 1.14, 0.14], [0, 1.12, 0.26]], [[0.3, 1.14, 0.14], [0, 1.12, 0.26]], [[-0.34, 1.44, 0.12], [0, 1.42, 0.24]], [[0.34, 1.44, 0.12], [0, 1.42, 0.24]], [[-0.34, 1.5, 0.05], [-0.56, 1.62, 0.06]], [[0.34, 1.5, 0.05], [0.56, 1.62, 0.06]],
      [[-0.1, 1.56, 0.12], [-0.12, 1.72, 0.1]], [[0.1, 1.56, 0.12], [0.12, 1.72, 0.1]], [[-0.2, 0.9, -0.05], [-0.16, 1.28, -0.2]], [[0.2, 0.9, -0.05], [0.16, 1.28, -0.2]]].map(([A, B], i) => raw(strand(A, B, 0.02 + 0.012 * (i % 3), 0.03 + 0.03 * (i % 2), i % 3 ? meat : wet))),
    // ---- Meat still on them: a scalp here, a cheek there, hair on two ----
    ...[[-0.34, 1.6, -0.02, 0.13], [0.3, 1.3, -0.04, 0.12], [0, 1.58, 0.1, 0.11], [-0.2, 1.0, -0.06, 0.12], [0.34, 1.6, -0.06, 0.12], [0.16, 1.42, -0.2, 0.12]].map(([x, y, z, r], i) => raw(lump(r, i % 2 ? skinned : meat, [x, y, z], [1.1, 0.5, 1.1], 9))),
    ...spikes(10, (i) => [[-0.34 + (i % 5) * 0.03 - 0.06, 1.62, -0.06 - (i % 2) * 0.04], [-0.42 + (i % 5) * 0.03, 1.36 - 0.05 * (i % 3), -0.12], 0.012], 0x1a1512), ...spikes(8, (i) => [[0.3 + (i % 4) * 0.03, 1.34, -0.1], [0.36 + (i % 4) * 0.03, 1.1 - 0.04 * (i % 3), -0.16], 0.012], 0x2a1a10),
    // ---- In the cage of his ribs: a heart, still going, on its pipes; and the meat between the ribs not all gone ----
    raw(sculpt(lump(0.13, wet, [0, 1.3, 0.02], [0.9, 1.15, 0.85], 14), (v) => dent(v, [0, 1.42, 0.1], 0.08, 0.03))), tube([[0.03, 1.4, 0.02], [0.08, 1.56, -0.02], [0.02, 1.7, -0.06]], [0.035, 0.03, 0.02], meat, { sides: 6, steps: 3 }), tube([[-0.04, 1.4, 0.02], [-0.12, 1.5, -0.04], [-0.2, 1.46, -0.1]], [0.03, 0.022, 0.012], 0x4a2a5a, { sides: 6, steps: 3 }),
    ...[1.06, 1.22, 1.38, 1.53].flatMap((y) => [-1, 1].map((s) => raw(lump(0.11, clot, [s * 0.42, y - 0.02, -0.02], [0.3, 0.6, 1.3], 8)))),
    raw(tube(Array.from({ length: 13 }, (_, i) => [0.0, 0.72 + i * 0.08, -0.17 + 0.03 * Math.sin(i * 0.6)]), [0.04, 0.04], meat, { sides: 6, steps: 2 })),
    // ---- What he wears: somebody's insides across his chest, a skin down his back, a pair of hands off his hip ----
    raw(tube([[-0.58, 1.66, 0.12], [-0.36, 1.34, 0.3], [-0.1, 1.2, 0.36], [0.16, 1.24, 0.36], [0.4, 1.4, 0.3], [0.58, 1.66, 0.12]], [0.05, 0.055, 0.06, 0.055, 0.05, 0.045], gut, { sides: 9, steps: 4 })),
    raw(tube([[-0.24, 0.8, 0.2], [-0.1, 0.56, 0.3], [0.1, 0.5, 0.3], [0.2, 0.3, 0.26], [0.14, 0.14, 0.3]], [0.045, 0.05, 0.05, 0.04, 0.015], gut, { sides: 8, steps: 4 })),
    dirty(sheet([0, 1.6, -0.1], [0.42, 0.56], PI / 2 - 1.1, 2.2, 0.95, skinned, { ragged: 0.22, across: 16, down: 7 }), { mottle: 0.45, freq: 6, under: 0.3, stains: [[0, 1.5, -0.5, 0.3, wet, 0.8], [-0.3, 1.0, -0.55, 0.25, clot, 0.8], [0.3, 0.9, -0.5, 0.2, wet, 0.7]] }),
    ...[-1, 1].flatMap((s) => [strand([s * 0.3, 0.82, 0.14], [s * 0.36, 0.62, 0.2], 0.014, 0, wet), ...fineHand([s * 0.36, 0.62, 0.2], [s * 0.1, -1, 0.15], 0.075, { skin: skinned, joint: meat, nail: clot }, { curl: 0.6, thumb: s }), raw(lump(0.04, wet, [s * 0.36, 0.63, 0.2], [1, 0.6, 1], 6))]),
    // ---- Running off him: from his teeth, from under his crown ----
    ...spikes(12, (i) => { const a = (i - 5.5) * 0.16; return [[Math.sin(a) * 0.22, 1.74, 0.08 + Math.cos(a) * 0.24], [Math.sin(a) * 0.22, 1.56 - 0.08 * (i % 3), 0.1 + Math.cos(a) * 0.25], 0.02]; }, wet),
    ...spikes(11, (i) => { const a = (i - 5) * 0.28; return [[Math.sin(a) * 0.29, 2.12, 0.06 + Math.cos(a) * 0.29], [Math.sin(a) * 0.3, 1.98 - 0.05 * (i % 2), 0.06 + Math.cos(a) * 0.3], 0.018]; }, wet),
  ]);
  const eyes = lit(part([
    lump(0.05, eye, [-0.12, 1.925, 0.32], [1, 1, 1], 8), lump(0.05, eye, [0.12, 1.925, 0.32], [1, 1, 1], 8),
    lump(0.028, eye, [-0.08, 1.436, 0.29], [1, 1, 1], 6), lump(0.028, eye, [0.08, 1.436, 0.29], [1, 1, 1], 6),                                    // and a pair still lit in his chest
    lump(0.05, 0xff2a1a, [0, 1.3, 0.1], [1, 1.2, 0.6], 8),                                                                                           // and his heart, through the ribs
  ]));
  const arm = (side, phase) => {
    const P = [side * 0.58, 1.6, 0], E = [side * 0.68, 1.1, 0.1], W = [side * 0.7, 0.72, 0.26];
    return part([
      age(boneShaft(P, E, 0.05, bone, 1.5)), age(lump(0.075, old, E, [1, 1, 1], 9)),
      raw(tube(Array.from({ length: 9 }, (_, i) => { const t = i / 8, a = t * 9; return [P[0] + (E[0] - P[0]) * t + Math.cos(a) * 0.06, P[1] + (E[1] - P[1]) * t, P[2] + (E[2] - P[2]) * t + Math.sin(a) * 0.06]; }), [0.02, 0.016], meat, { sides: 5, steps: 2 })),   // sinew wound round the bone
      raw(lump(0.09, wet, [E[0], E[1] + 0.03, E[2]], [1, 0.7, 1], 8)), raw(lump(0.1, meat, [P[0], P[1] - 0.12, P[2]], [0.9, 1.2, 0.9], 8)), raw(strand([E[0], E[1], E[2]], [W[0], W[1], W[2] + 0.02], 0.02, -0.05, wet)),
      ...spikes(6, (i) => [[side * 0.7 + (i - 2.5) * 0.05, 0.48, 0.36], [side * 0.7 + (i - 2.5) * 0.05, 0.26 - 0.07 * (i % 2), 0.38], 0.022], wet),                                                    // his fists drip
      age(boneShaft([E[0] - 0.03, E[1], E[2]], [W[0] - 0.03, W[1], W[2]], 0.032, bone, 1.4)), age(boneShaft([E[0] + 0.035, E[1], E[2]], [W[0] + 0.035, W[1], W[2]], 0.028, old, 1.4)),
      ...S(side * 0.7, 0.56, 0.32, 0.17, { yaw: side * 0.4, jaw: 0.5, fine: 14 }),                                                                // a skull for a fist...
      ...[-1.5, -0.5, 0.5, 1.5].map((k) => age(tube([[side * 0.7 + k * 0.06, 0.7, 0.3], [side * 0.7 + k * 0.07, 0.72, 0.46], [side * 0.7 + k * 0.065, 0.6, 0.53]], [0.02, 0.018, 0.008], bone, { sides: 6, steps: 3 }))),   // ...with fingers of bone over it
    ], P, [0.5, 0, 0], phase);
  };
  const leg = (side, phase) => {
    const x = side * 0.22, H = [x, 0.8, 0], K = [x, 0.42, 0.03], A = [x, 0.24, 0];
    return part([
      age(boneShaft(H, K, 0.06, bone, 1.5)), age(lump(0.09, old, K, [1, 1, 1], 9)),
      raw(lump(0.11, meat, [x, 0.66, 0.02], [0.8, 1.5, 0.8], 8)), raw(strand([x, 0.5, 0.06], [x, 0.26, 0.04], 0.03, -0.04, wet)), raw(lump(0.1, clot, [x, 0.25, 0.06], [1.3, 0.5, 1.3], 8)),         // meat on the thigh, gristle at the knee, what he has trodden in
      age(boneShaft([x - 0.03, K[1], K[2]], [x - 0.03, A[1], A[2]], 0.042, bone, 1.4)), age(boneShaft([x + 0.04, K[1], K[2]], [x + 0.04, A[1], A[2]], 0.03, old, 1.4)),
      ...S(x, 0.13, 0.08, 0.13, { old: 1, jaw: 0 }),                                                                                              // he walks on them, too
    ], H, [0.3, 0, 0], phase);
  };
  return [body, eyes, arm(-1, 0), arm(1, PI), leg(-1, PI), leg(1, 0)];
}

// ---- Babitus Goyitus: the dealer. A long, lean corpse in evening dress. jewels: 0..3, how much of your gold he has on. ----
export function fineBabitus(jewels = 0) {
  const suit = 0x101014, lapel = 0x1c1c22, shirt = 0xf3efe4, tie = 0xb3201b, skin = 0x8a9468, rot = 0x5c6648, hair = 0x0c0b0a, bone = 0xd8d2bf, dark = 0x121110, eye = 0xffb347, gold = 0xffc233, card = 0xf7f3ea;
  const cloth = (g) => dirty(rough(g, 0.004, 26), { mottle: 0.2, freq: 10, under: 0.5 });
  const body = part([
    cloth(tube([[0, 0.66, 0], [0, 0.82, 0], [0, 1.0, 0], [0, 1.2, 0.005], [0, 1.4, 0.01], [0, 1.5, 0.015]], [0.2, 0.21, 0.2, 0.25, 0.27, 0.13], suit, { sides: 24, steps: 4, squash: 0.74 })),   // a narrow chest in a tail coat
    sheet([0, 1.46, 0.01], [0.275, 0.262], 1.5 * PI - 0.36, 0.72, 0.5, shirt, { squash: 0.77, ragged: 0, across: 8, down: 5 }),                    // the shirt front...
    ...[-0.05, -0.025, 0.025, 0.05].map((x) => tube([[x, 1.43, 0.216], [x, 1.0, 0.2]], [0.004, 0.004], 0xd9d5c8, { sides: 4 })),                   // ...pleated...
    ...[1.34, 1.22, 1.1].map((y) => lump(0.012, gold, [0, y, 0.216], [1, 1, 0.6], 6)),                                                            // ...with gold studs
    sheet([0, 1.49, 0.01], [0.285, 0.272], 1.5 * PI + 0.28, 0.36, 0.52, lapel, { squash: 0.77, ragged: 0, across: 4, down: 4 }), sheet([0, 1.49, 0.01], [0.285, 0.272], 1.5 * PI - 0.64, 0.36, 0.52, lapel, { squash: 0.77, ragged: 0, across: 4, down: 4 }),   // satin lapels
    ...[-1, 1].map((s) => sculpt(lump(0.06, tie, [s * 0.062, 1.47, 0.222], [1, 0.75, 0.35], 10), (v) => { const k = 0.45 + 0.55 * Math.min(1, Math.abs(v.x) / 0.06); v.y = 1.47 + (v.y - 1.47) * k; })), lump(0.022, tie, [0, 1.47, 0.232], [1, 1, 0.8], 8),   // a red bow tie
    slab(0.07, 0.035, 0.012, shirt, [0.15, 1.33, 0.19], [0.1, -0.5, 0.2]),                                                                         // a pocket square
    paint(new THREE.TorusGeometry(0.2, 0.04, 6, 24).rotateX(PI / 2).scale(1, 1.3, 0.76).translate(0, 0.86, 0), tie),                              // a red sash at the waist
    cloth(sheet([0, 0.74, 0], [0.2, 0.17], 0.5 * PI - 0.72, 0.62, 0.52, suit, { squash: 0.76, ragged: 0.03 })), cloth(sheet([0, 0.74, 0], [0.2, 0.17], 0.5 * PI + 0.1, 0.62, 0.52, suit, { squash: 0.76, ragged: 0.03 })),   // tails
    cloth(lump(0.15, suit, [-0.31, 1.42, 0], [1.05, 0.8, 1], 12)), cloth(lump(0.15, suit, [0.31, 1.42, 0], [1.05, 0.8, 1], 12)),                    // square shoulders
    dirty(tube([[0, 1.48, 0.015], [0, 1.6, 0.02]], [0.075, 0.068], skin, { sides: 12, steps: 2 }), { mottle: 0.4, freq: 30 }),                      // a thin neck in a wing collar
    paint(new THREE.TorusGeometry(0.084, 0.018, 6, 18).rotateX(PI / 2).translate(0, 1.5, 0.015), shirt),
    dirty(rough(sculpt(lump(0.17, skin, [0, 1.76, 0.03], [0.92, 1.14, 1], 24), (v) => {
      dent(v, [-0.065, 1.79, 0.18], 0.055, 0.045); dent(v, [0.065, 1.79, 0.18], 0.055, 0.045);                                                     // sockets
      dent(v, [-0.12, 1.7, 0.1], 0.07, 0.035, [1, 0, -0.3]); dent(v, [0.12, 1.7, 0.1], 0.07, 0.035, [-1, 0, -0.3]);                                 // hollow cheeks
      dent(v, [0, 1.84, 0.17], 0.12, -0.02); dent(v, [0, 1.645, 0.18], 0.08, 0.03);                                                               // a brow; a mouth
    }), 0.002, 50), { mottle: 0.4, freq: 22, under: 0.5, stains: [[-0.12, 1.7, 0.1, 0.07, rot, 0.8], [0.12, 1.7, 0.1, 0.07, rot, 0.8], [0, 1.645, 0.17, 0.07, dark, 0.95]] }),
    dirty(lump(0.105, skin, [0, 1.612, 0.075], [0.98, 0.5, 0.95], 14), { mottle: 0.4, freq: 22 }),                                                 // lantern jaw
    ...Array.from({ length: 10 }, (_, i) => { const a = (i - 4.5) * 0.17; return slab(0.014, 0.026, 0.012, bone, [Math.sin(a) * 0.075, 1.652, 0.085 + Math.cos(a) * 0.075], [0, a, 0]); }),   // a thin smile, full of teeth
    ...Array.from({ length: 8 }, (_, i) => { const a = (i - 3.5) * 0.19; return slab(0.013, 0.02, 0.011, bone, [Math.sin(a) * 0.07, 1.63, 0.085 + Math.cos(a) * 0.07], [0, a, 0]); }),
    paint(new THREE.SphereGeometry(0.178, 20, 10, 0, PI * 2, 0, 1.3).scale(0.95, 1.0, 1.06).rotateX(-0.55).translate(0, 1.8, 0.0), hair),          // hair slicked straight back...
    tube([[0, 1.9, 0.14], [0, 1.87, 0.17], [0, 1.83, 0.175]], [0.03, 0.02, 0.004], hair, { sides: 6, steps: 3, squash: 0.5 }),                     // ...to a point in front
    tube([[-0.13, 1.84, 0.14], [0, 1.855, 0.195], [0.13, 1.84, 0.14]], [0.012, 0.02, 0.012], hair, { sides: 6, steps: 4 }),                         // one long brow
    ...[-1, 1].map((s) => tube([[0, 1.69, 0.2], [s * 0.045, 1.682, 0.19], [s * 0.08, 1.7, 0.165]], [0.008, 0.007, 0.002], hair, { sides: 5, steps: 3 })),   // a pencil moustache
    tube([[0, 1.795, 0.19], [0, 1.735, 0.228], [0, 1.705, 0.205]], [0.014, 0.02, 0.012], skin, { sides: 7, steps: 3 }),                             // a long nose
    lump(0.036, dark, [-0.065, 1.79, 0.15], [1, 1, 0.6], 8), lump(0.036, dark, [0.065, 1.79, 0.15], [1, 1, 0.6], 8),
    lump(0.04, skin, [-0.16, 1.76, 0.02], [0.4, 1.1, 0.8], 8), lump(0.04, skin, [0.16, 1.76, 0.02], [0.4, 1.1, 0.8], 8),
  ]);
  const eyes = lit(part([lump(0.024, eye, [-0.065, 1.79, 0.165], [1, 1, 1], 7), lump(0.024, eye, [0.065, 1.79, 0.165], [1, 1, 1], 7)]));
  const arm = (side, phase) => {
    const S = [side * 0.33, 1.42, 0], E = [side * 0.37, 1.02, 0.08], W = [side * 0.38, 0.72, 0.28];
    return part([
      cloth(tube([S, E, between(E, W, 0.84)], [0.09, 0.076, 0.066], suit, { sides: 14, steps: 4 })),
      tube([between(E, W, 0.8), W], [0.07, 0.068], shirt, { sides: 12, steps: 2 }), lump(0.014, gold, [W[0] + side * 0.066, W[1] + 0.02, W[2] - 0.02], [1, 1, 1], 6),   // a white cuff, and its link
      ...fineHand(W, [0, -0.45, 0.9], 0.085, { skin, joint: rot, nail: 0x2a2a22 }, { curl: 0.45, thumb: -side, spread: 1.1 }).map((g) => dirty(g, { mottle: 0.35, freq: 40 })),
      ...(side > 0 ? [-0.3, -0.15, 0, 0.15, 0.3].flatMap((turn, i) => {                                                                              // a hand of cards, fanned
        const at = [0.38 + turn * 0.16, 0.74 + Math.cos(turn * 3) * 0.03, 0.44 + i * 0.004];
        return [slab(0.1, 0.15, 0.006, card, at, [-0.3, 0, -turn]), slab(0.022, 0.03, 0.008, i % 2 ? tie : dark, [at[0], at[1] + 0.01, at[2] + 0.003], [-0.3, 0, -turn + 0.78])];
      }) : []),
    ], S, [0.45, 0, 0], phase);
  };
  const leg = (side, phase) => {
    const x = side * 0.13, H = [x, 0.66, 0], K = [x, 0.36, 0.03], A = [x, 0.12, 0];
    const shoe = sculpt(new THREE.SphereGeometry(0.1, 16, 12).scale(0.52, 0.5, 1.6).translate(x, 0.06, 0.07), (v) => { if (v.y < 0.02) v.y = 0.02; if (v.z > 0.14) v.y = 0.02 + (v.y - 0.02) * 0.7; });
    return part([
      cloth(tube([H, K, A], [0.105, 0.086, 0.07], suit, { sides: 14, steps: 4 })),
      slab(0.012, 0.52, 0.03, lapel, [x + side * 0.088, 0.4, 0.012]),                                                                              // the satin stripe down the trouser
      paint(shoe, dark), slab(0.106, 0.02, 0.31, 0x050505, [x, 0.01, 0.07]),
      lump(0.062, shirt, [x, 0.1, 0.01], [1, 0.8, 1.15], 10),                                                                                      // a white spat
    ], H, [0.34, 0, 0], phase);
  };
  // What he has taken from you: a chain, then rings and a second chain, then a crown.
  const bling = [];
  const chain = (r, y, tilt, links) => Array.from({ length: links }, (_, i) => { const a = (i / links) * PI * 2; return paint(new THREE.TorusGeometry(r * 0.09, r * 0.03, 5, 8).rotateY(a + (i % 2 ? PI / 2 : 0)).translate(Math.sin(a) * r, 0, Math.cos(a) * r * 0.95).rotateX(tilt).translate(0, y, 0.04), gold); });
  if (jewels >= 1) bling.push(...chain(0.235, 1.42, 0.5, 24), lump(0.05, gold, [0, 1.27, 0.27], [1, 1, 0.5], 10));
  if (jewels >= 2) bling.push(...chain(0.285, 1.38, 0.62, 30), lump(0.075, gold, [0, 1.16, 0.275], [1, 1, 0.5], 12), lump(0.03, gold, [-0.165, 1.72, 0.02], [1, 1, 1], 7), lump(0.03, gold, [0.165, 1.72, 0.02], [1, 1, 1], 7));
  if (jewels >= 3) bling.push(paint(new THREE.CylinderGeometry(0.17, 0.15, 0.09, 18, 1, true).translate(0, 2.0, 0), gold), ...Array.from({ length: 8 }, (_, i) => tube([[Math.cos(i * 0.785) * 0.165, 2.04, Math.sin(i * 0.785) * 0.165], [Math.cos(i * 0.785) * 0.18, 2.17, Math.sin(i * 0.785) * 0.18]], [0.035, 0.004], gold, { sides: 5 })), ...Array.from({ length: 8 }, (_, i) => lump(0.018, tie, [Math.cos(i * 0.785 + 0.39) * 0.168, 2.0, Math.sin(i * 0.785 + 0.39) * 0.168], [1, 1, 1], 6)));
  return [body, eyes, arm(-1, 0), arm(1, PI), leg(-1, PI), leg(1, 0), ...(bling.length ? [lit(part(bling))] : [])];
}
