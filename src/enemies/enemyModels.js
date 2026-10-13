// Monster models, built in code. Each monster is a handful of parts (body,
// arms, legs...) so its limbs can swing as it moves; every part is one merged,
// vertex-coloured mesh drawn with InstancedMesh.
//
// Models face +Z with their feet at y = 0 and stand about 1.8 m tall.
// A part is { geometry, pivot, swing, phase, glow }:
//   pivot  where it hinges (shoulder, hip...), in the model's own space
//   swing  how far it rotates about x / y / z as the monster moves (radians)
//   phase  where in the stride it is (so left and right limbs alternate)
//   glow   true for parts that shine in the dark whatever the light (eyes)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { zombie } from './zombie.js';
import { skeleton, ghost, bigRat, fineSpider, boneThrower, hamzitus, rubistus, fineBabitus } from './detailed.js';

const PI = Math.PI;

// ---- Small kit for building parts ----------------------------------------------

// Paint a whole geometry one colour, turn it, and put it somewhere.
function at(geo, color, x, y, z, rx = 0, ry = 0, rz = 0) {
  if (rx) geo.rotateX(rx);
  if (ry) geo.rotateY(ry);
  if (rz) geo.rotateZ(rz);
  geo.translate(x, y, z);
  const c = new THREE.Color(color), n = geo.attributes.position.count, colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const ball = (r, sx = 1, sy = 1, sz = 1) => new THREE.SphereGeometry(r, 10, 8).scale(sx, sy, sz);
const rod = (rTop, rBottom, length) => new THREE.CylinderGeometry(rTop, rBottom, length, 7);   // a bone or a sleeve
const cap = (r, length, sz = 1) => new THREE.CapsuleGeometry(r, length, 3, 8).scale(1, 1, sz);   // a fleshy limb
const hoop = (r, thick, squash = 0.75) => new THREE.TorusGeometry(r, thick, 5, 12).rotateX(PI / 2).scale(1, 1, squash);   // a rib

function part(pieces, pivot = [0, 0, 0], swing = [0, 0, 0], phase = 0) {
  const geometry = mergeGeometries(pieces);
  geometry.translate(-pivot[0], -pivot[1], -pivot[2]);
  return { geometry, pivot, swing, phase, glow: false };
}
const glowing = (pieces) => ({ ...part(pieces), glow: true });

// ---- Limbs ----
// Every arm and leg is built through a run of points (shoulder, elbow, wrist; hip, knee, ankle), so each piece starts
// exactly where the last one ended, with a joint over the join.
const small = (r, sx = 1, sy = 1, sz = 1) => new THREE.SphereGeometry(r, 7, 5).scale(sx, sy, sz);   // a joint, a knuckle
const along = (A, B, k) => [A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k, A[2] + (B[2] - A[2]) * k];
// points: where it bends. radii: how thick it is at each. joint: the colour of the joints (the limb's own, if none).
function chain(points, radii, color, joint = color) {
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    out.push(strut(points[i], points[i + 1], radii[i], radii[i + 1], color));
    if (i > 0) out.push(at(small(radii[i] * 1.22), joint, ...points[i]));
  }
  return out;
}
// A hand on the end of a wrist at W: a palm, four fingers and a thumb. toward: the way the fingers point ([x, y, z]).
// size: how wide the palm is. curl: 0 (flat) .. 1 (a claw). thumb: -1 or 1, which side it is on.
function hand(W, toward, size, color, tip = color, curl = 0.5, thumb = 1) {
  const f = new THREE.Vector3(...toward).normalize(), up = Math.abs(f.y) > 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3().crossVectors(up, f).normalize(), back = new THREE.Vector3().crossVectors(f, side);   // (back: out of the back of the hand)
  const spot = (a, b, c) => [W[0] + f.x * a + side.x * b + back.x * c, W[1] + f.y * a + side.y * b + back.y * c, W[2] + f.z * a + side.z * b + back.z * c];
  const palm = box(size, size * 0.34, size * 1.1).applyMatrix4(new THREE.Matrix4().makeBasis(side, back, f));
  const out = [at(palm, color, ...spot(size * 0.55, 0, 0))];
  for (let i = 0; i < 4; i++) {
    const across = (i - 1.5) * size * 0.25, knuckle = spot(size * 1.08, across, 0), bend = spot(size * 1.75, across, -size * 0.3 * curl), end = spot(size * 2.15, across, -size * 0.85 * curl);
    out.push(strut(knuckle, bend, size * 0.115, size * 0.1, color), strut(bend, end, size * 0.1, size * 0.07, tip));
  }
  out.push(strut(spot(size * 0.4, thumb * size * 0.5, 0), spot(size * 1.1, thumb * size * 0.82, -size * 0.25 * curl), size * 0.13, size * 0.09, color));
  return out;
}

// ---- Zombie: a hunched, rotting corpse in what is left of a suit. ----
// Built round a skeleton of points (shoulder, elbow, wrist; hip, knee, ankle), so every limb is a real limb: an upper
// and a lower piece meeting at a joint, ending in a hand or a foot. Both arms reach for you: the right one high, in
// its sleeve; the left lower, bare (the sleeve is gone at the shoulder) and bitten to the bone. He has lost a shoe,
// most of one cheek and the use of one eye. His head is its own part, so it lolls as he walks.

function shambler() {
  const skin = 0x7b8a63, skinDark = 0x5f6d4c, rot = 0x4a553c, jacket = 0x3f4238, jacketDark = 0x2a2c25, shirt = 0x8d8975, trousers = 0x2a2b30;
  const shoe = 0x1a1714, leather = 0x2b2018, blood = 0x6a1a14, bloodDark = 0x3a0e0b, gut = 0x8c3a34, bone = 0xd8d2bf, teeth = 0xcfc8ae, dark = 0x100f0e, hair = 0x1d1a16, eye = 0xdfe6a0, metal = 0x8a8f96;
  const bit = (r, sx = 1, sy = 1, sz = 1) => new THREE.SphereGeometry(r, 7, 5).scale(sx, sy, sz);   // a small round thing (a joint, a knuckle)
  const mid = (A, B, k) => [A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k, A[2] + (B[2] - A[2]) * k];

  // The trunk: hips, a belt, the shirt showing down the front of an open jacket, a hunched back, the neck.
  const body = part([
    at(ball(0.17, 1.05, 0.72, 0.82), trousers, 0, 0.95, 0),                                  // hips
    at(new THREE.CylinderGeometry(0.172, 0.176, 0.05, 10).scale(1, 1, 0.8), leather, 0, 1.03, 0.008, 0.1),   // belt...
    at(box(0.055, 0.045, 0.02), metal, 0, 1.03, 0.148, 0.1),                                 // ...and buckle
    at(cap(0.15, 0.1, 0.8), shirt, 0, 1.14, 0.04, 0.18),                                     // belly: shirt
    at(cap(0.168, 0.13, 0.84).scale(1.16, 1, 1), jacket, 0, 1.31, 0.085, 0.3),               // chest: jacket
    at(ball(0.13, 1.25, 0.8, 0.85), jacket, 0, 1.39, 0.0, 0.3),                              // the hunch of his back
    at(box(0.1, 0.3, 0.02), shirt, 0.015, 1.24, 0.196, 0.3),                                 // shirt front, between the lapels
    at(new THREE.CylinderGeometry(0.185, 0.2, 0.34, 10, 1, true, 0.9, PI * 2 - 1.8).scale(1, 1, 0.82), jacket, 0, 1.13, 0.03, 0.16),   // the jacket, round his sides and back, open at the front
    at(box(0.1, 0.36, 0.035), jacket, 0.125, 1.15, 0.135, 0.2, 0, -0.05),                    // jacket hanging open: right side...
    at(box(0.1, 0.3, 0.035), jacket, -0.13, 1.17, 0.13, 0.2, 0, 0.06),                       // ...and left, torn shorter
    at(box(0.05, 0.2, 0.02), jacketDark, 0.082, 1.33, 0.212, 0.3, 0, -0.22),                 // lapels
    at(box(0.05, 0.2, 0.02), jacketDark, -0.06, 1.33, 0.21, 0.3, 0, 0.22),
    at(box(0.06, 0.1, 0.03), jacketDark, 0.14, 0.94, 0.11, 0.1, 0, 0.2),                     // rags at the hem
    at(box(0.05, 0.13, 0.03), jacketDark, -0.15, 0.99, 0.09, 0.1, 0, -0.25),
    at(box(0.08, 0.12, 0.03), jacketDark, 0.03, 0.92, -0.13, -0.1),                          // (one at the back)
    // The wound in his left side: a hole in the shirt, three ribs across it, and something that should be inside.
    at(box(0.13, 0.15, 0.03), bloodDark, -0.075, 1.25, 0.196, 0.3),
    ...[1.2, 1.245, 1.29].map((y) => at(rod(0.009, 0.009, 0.13), bone, -0.075, y, 0.205 + (y - 1.2) * 0.3, 0, 0, PI / 2)),
    at(bit(0.04, 1, 1.3, 0.8), gut, -0.06, 1.15, 0.2),
    at(box(0.11, 0.1, 0.012), blood, -0.05, 1.11, 0.185, 0.18),                              // and the stain running down from it
    at(ball(0.088), jacket, 0.215, 1.42, 0.1),                                               // right shoulder, padded
    at(bit(0.07), skinDark, -0.215, 1.4, 0.1),                                               // left shoulder, bare
    at(hoop(0.075, 0.022, 0.9), jacketDark, 0, 1.465, 0.145, 0.45),                          // collar
    strut([0, 1.45, 0.14], [0.012, 1.57, 0.205], 0.056, 0.048, skin),                        // neck, craned forward
    strut([-0.03, 1.46, 0.16], [-0.012, 1.56, 0.225], 0.014, 0.012, blood),                  // a tendon standing out of it
  ]);

  // The head, lolling on its neck.
  const NECK = [0.01, 1.53, 0.18], LOLL = [0.05, 0, 0.09];
  const head = part([
    at(ball(0.125, 0.95, 1.08, 1.05), skin, 0.02, 1.64, 0.24),                               // skull
    at(ball(0.128, 0.95, 0.62, 1.0), hair, 0.03, 1.706, 0.212),                              // what is left of his hair...
    at(bit(0.06, 1, 0.45, 1), rot, -0.06, 1.745, 0.262),                                     // ...and a patch where it is not
    at(bit(0.03, 0.6, 1.6, 0.6), hair, 0.1, 1.69, 0.31, 0.3),                                // a lock of it over his temple
    at(box(0.17, 0.028, 0.05), skinDark, 0.02, 1.688, 0.338, 0.22),                          // brow
    at(bit(0.035, 1, 0.9, 0.6), dark, -0.032, 1.655, 0.345),                                 // eye sockets
    at(bit(0.035, 1, 0.9, 0.6), dark, 0.072, 1.655, 0.345),
    strut([0.02, 1.665, 0.36], [0.02, 1.625, 0.378], 0.012, 0.016, skin),                    // the bridge of a nose...
    at(box(0.03, 0.03, 0.02), dark, 0.02, 1.608, 0.366),                                     // ...and the hole where the rest was
    at(bit(0.036), skinDark, 0.108, 1.612, 0.3),                                             // cheekbone
    at(bit(0.05, 1, 1.1, 0.45), blood, -0.068, 1.588, 0.318),                                // the other cheek is gone: you can see the teeth
    at(box(0.05, 0.016, 0.03), teeth, -0.075, 1.578, 0.335, 0, 0.5),
    at(box(0.09, 0.018, 0.02), teeth, 0.02, 1.578, 0.354),                                   // top teeth
    at(box(0.085, 0.055, 0.04), dark, 0.02, 1.548, 0.33),                                    // the inside of his mouth
    at(box(0.12, 0.045, 0.1), skinDark, 0.032, 1.512, 0.3, 0.38, 0, 0.13),                   // jaw, hanging open and askew
    at(box(0.075, 0.016, 0.018), teeth, 0.034, 1.538, 0.348, 0.38, 0, 0.13),                 // bottom teeth
    at(bit(0.03, 0.45, 1, 0.8), skinDark, 0.146, 1.635, 0.235),                              // an ear...
    at(bit(0.022, 0.5, 0.8, 0.8), bloodDark, -0.104, 1.63, 0.235),                           // ...and where the other one was
  ], NECK, LOLL, PI / 2);
  // One eye still shining, the other barely. (They ride on the head.)
  const eyes = { ...part([at(bit(0.02), eye, 0.072, 1.655, 0.366), at(bit(0.009), eye, -0.032, 1.652, 0.36)], NECK, LOLL, PI / 2), glow: true };

  // Right arm: in its sleeve, reaching high. Shoulder, elbow, wrist; the cuff is torn back off the forearm.
  const RS = [0.22, 1.42, 0.1], RE = [0.245, 1.3, 0.36], RW = [0.24, 1.335, 0.63], RC = mid(RE, RW, 0.55);
  const armR = part([
    strut(RS, RE, 0.07, 0.058, jacket),
    at(bit(0.06), jacket, ...RE),
    strut(RE, RC, 0.057, 0.052, jacket),
    at(rod(0.056, 0.05, 0.03), jacketDark, ...RC, PI / 2),                                   // the torn edge of the cuff
    strut(RC, RW, 0.036, 0.03, skin),
    at(bit(0.032), skinDark, ...RW),
    at(box(0.072, 0.03, 0.09), skin, 0.24, 1.328, 0.69, 0.22),                               // palm
    ...[0, 1, 2, 3].flatMap((i) => { const x = 0.24 + (i - 1.5) * 0.019; return [strut([x, 1.32, 0.735], [x, 1.292, 0.792], 0.0095, 0.008, skinDark), strut([x, 1.292, 0.792], [x, 1.255, 0.808], 0.008, 0.005, rot)]; }),   // four fingers, hooked
    strut([0.205, 1.326, 0.69], [0.186, 1.304, 0.748], 0.011, 0.007, skinDark),              // thumb
  ], RS, [0.16, 0, 0], 0);

  // Left arm: bare, lower, and bitten: the forearm is open to the bone and the hand hangs from it.
  const LS = [-0.22, 1.4, 0.1], LE = [-0.262, 1.2, 0.3], LW = [-0.24, 1.125, 0.55], LB = mid(LE, LW, 0.5);
  const armL = part([
    strut(LS, mid(LS, LE, 0.32), 0.074, 0.068, jacketDark),                                  // the stump of the sleeve
    strut(LS, LE, 0.052, 0.045, skin),
    at(bit(0.047), skinDark, ...LE),
    strut(LE, LW, 0.043, 0.03, skin),
    at(bit(0.043, 1, 1, 1.3), blood, ...LB),                                                 // the bite
    strut(mid(LE, LW, 0.36), mid(LE, LW, 0.66), 0.012, 0.012, bone),                         // (bone, in the middle of it)
    at(bit(0.03), skinDark, ...LW),
    at(box(0.066, 0.028, 0.085), rot, -0.24, 1.09, 0.6, 0.95),                               // palm, limp
    ...[0, 1, 2, 3].map((i) => { const x = -0.24 + (i - 1.5) * 0.018; return strut([x, 1.058, 0.632], [x, 0.985, 0.648], 0.009, 0.005, rot); }),   // fingers, hanging
  ], LS, [0.22, 0, 0], PI);

  // Legs: thigh, knee, shin. The right one still has its shoe; the left has lost it, and the knee is out of the trouser.
  const leg = (side, stride, phase) => {
    const x = side * 0.1, H = [x, 0.92, 0], K = [x * 1.05, 0.5, 0.05], A = [x, 0.1, 0], shod = side > 0;
    return part([
      strut(H, K, 0.098, 0.072, trousers),
      at(bit(0.074), shod ? trousers : skinDark, ...K),
      strut(K, A, 0.07, 0.05, trousers),
      at(rod(0.052, 0.043, 0.05), jacketDark, x, 0.12, 0),                                   // frayed trouser end
      ...(shod ? [
        at(box(0.105, 0.022, 0.275), dark, x, 0.011, 0.062),                                 // sole
        at(box(0.098, 0.07, 0.2), shoe, x, 0.057, 0.03),                                     // shoe
        at(ball(0.052, 0.94, 0.72, 1.3), shoe, x, 0.05, 0.14),                               // its toe
      ] : [
        at(box(0.085, 0.05, 0.19), skinDark, x, 0.028, 0.045),                               // a bare foot...
        at(bit(0.036, 1.1, 0.6, 1), rot, x, 0.026, 0.145),
        ...[-1, 0, 1].map((t) => at(bit(0.014), rot, x + t * 0.028, 0.02, 0.18)),            // ...with its toes
      ]),
    ], H, [stride, 0, 0], phase);
  };

  return [body, head, eyes, armR, armL, leg(-1, 0.42, 0), leg(1, 0.2, PI)];   // (the right leg drags)
}

// ---- Skeleton: bare bones, sprinting, with cold lights in its eye sockets. ----

function rattler() {
  const bone = 0xddd6c1, old = 0xb3aa92, dark = 0x14120f, glow = 0xa8ecff, cloth = 0x3a3026;

  const body = part([
    at(ball(0.13, 0.9, 1, 1.05), bone, 0, 1.66, 0.02),                       // skull
    at(box(0.12, 0.05, 0.1), old, 0, 1.545, 0.05),                           // jaw
    at(box(0.09, 0.02, 0.02), dark, 0, 1.575, 0.107),                        // teeth line
    at(ball(0.036), dark, -0.048, 1.67, 0.115), at(ball(0.036), dark, 0.048, 1.67, 0.115),   // sockets
    at(box(0.026, 0.04, 0.02), dark, 0, 1.62, 0.132),                        // nose hole
    at(rod(0.024, 0.024, 0.62), old, 0, 1.22, -0.03),                        // spine
    ...[1.0, 1.1, 1.5].map((y) => at(box(0.07, 0.03, 0.06), bone, 0, y, -0.03)),   // vertebrae showing
    ...[[1.42, 0.15], [1.34, 0.175], [1.26, 0.175], [1.18, 0.15]].map(([y, r]) => at(hoop(r, 0.014), bone, 0, y, 0.02)),   // ribs
    at(box(0.036, 0.27, 0.02), bone, 0, 1.3, 0.145),                         // breastbone
    at(box(0.42, 0.03, 0.03), bone, 0, 1.47, 0),                             // collarbones
    at(ball(0.036), old, -0.21, 1.47, 0), at(ball(0.036), old, 0.21, 1.47, 0),
    at(box(0.26, 0.1, 0.14), bone, 0, 0.93, 0),                              // pelvis
    at(ball(0.07), old, -0.1, 0.9, 0), at(ball(0.07), old, 0.1, 0.9, 0),
    at(box(0.2, 0.22, 0.02), cloth, 0, 0.79, 0.08),                          // a scrap of burial cloth
  ]);

  const eyes = glowing([at(ball(0.017), glow, -0.048, 1.67, 0.132), at(ball(0.017), glow, 0.048, 1.67, 0.132)]);   // the lights in its sockets

  // Arms bent like a runner's: upper arm, the two bones of the forearm, a hand of finger bones.
  const arm = (side, phase) => {
    const S = [side * 0.21, 1.47, 0], E = [side * 0.225, 1.19, -0.04], W = [side * 0.205, 1.13, 0.22];
    return part([
      strut(S, E, 0.024, 0.02, bone),
      at(small(0.03), old, ...E),
      strut([E[0] - 0.012, E[1], E[2]], [W[0] - 0.012, W[1], W[2]], 0.014, 0.012, bone),     // radius...
      strut([E[0] + 0.012, E[1], E[2]], [W[0] + 0.012, W[1], W[2]], 0.014, 0.012, bone),     // ...and ulna
      at(small(0.024), old, ...W),
      ...hand(W, [0, -0.25, 1], 0.062, bone, old, 0.7, -side),
    ], S, [0.9, 0, 0], phase);
  };

  // Legs: thigh bone, knee cap, the two bones of the shin, a heel and a foot of long toes.
  const leg = (side, phase) => {
    const x = side * 0.1, H = [x, 0.9, 0], K = [x, 0.48, 0.04], A = [x, 0.07, 0];
    return part([
      strut(H, K, 0.028, 0.022, bone),
      at(small(0.036), old, ...K),
      at(small(0.022, 1, 1, 0.6), bone, x, 0.48, 0.07),                                       // knee cap
      strut([x - 0.012, 0.48, 0.04], [x - 0.012, 0.07, 0], 0.017, 0.013, bone),              // shin...
      strut([x + 0.014, 0.47, 0.03], [x + 0.014, 0.08, -0.005], 0.01, 0.009, old),           // ...and the thin bone beside it
      at(small(0.028), old, ...A),
      at(small(0.03, 1, 0.8, 1.2), old, x, 0.035, -0.03),                                     // heel
      ...[-1, 0, 1].map((t) => strut([x + t * 0.012, 0.05, 0.01], [x + t * 0.026, 0.015, 0.2], 0.012, 0.008, bone)),   // the long bones of the foot
    ], H, [0.8, 0, 0], phase);
  };

  return [body, eyes, arm(-1, 0), arm(1, PI), leg(-1, PI), leg(1, 0)];   // arms swing against the legs
}

// ---- Ghost: an empty hooded shroud with burning eyes, bony hands and a trailing hem. ----

function wraith() {
  const shroud = 0xb7c2d8, shade = 0x8792ab, deep = 0x5d6781, bone = 0xe6e2d2, dark = 0x06080d, glow = 0xd6fbff;
  const profile = [[0.3, 0.38], [0.34, 0.6], [0.3, 0.8], [0.23, 1.0], [0.19, 1.14], [0.17, 1.22]].map(([r, y]) => new THREE.Vector2(r, y));

  const body = part([
    at(new THREE.LatheGeometry(profile, 12), shroud, 0, 0, 0),               // the robe
    at(new THREE.SphereGeometry(0.25, 14, 10, PI / 2 + 0.85, PI * 2 - 1.7).scale(1, 1.12, 1.12), shade, 0, 1.33, -0.02),   // hood, open at the front
    at(new THREE.ConeGeometry(0.1, 0.26, 7), shade, 0, 1.6, -0.14, -0.6),    // its drooping peak
    at(ball(0.2, 1, 1.1, 0.95), dark, 0, 1.32, 0),                           // nothing inside it...
    at(box(0.3, 0.05, 0.02), deep, 0, 0.95, 0.24, 0.12),                     // a rope belt
  ]);

  const eyes = glowing([at(ball(0.034, 1.25, 0.8, 1), glow, -0.07, 1.34, 0.185), at(ball(0.034, 1.25, 0.8, 1), glow, 0.07, 1.34, 0.185)]);   // ...but eyes

  // Arms: a sleeve from the shoulder that widens to its mouth, a bony wrist out of it, and a hand reaching.
  const arm = (side, phase) => {
    const S = [side * 0.2, 1.12, 0.04], E = [side * 0.29, 1.02, 0.27], M = [side * 0.26, 1.13, 0.5], W = [side * 0.25, 1.17, 0.6];
    return part([
      ...chain([S, E, M], [0.085, 0.095, 0.105], shade),
      at(new THREE.TorusGeometry(0.1, 0.014, 5, 10), deep, ...M, 0.2),                        // the mouth of the sleeve
      strut(along(E, M, 0.6), W, 0.022, 0.018, bone),                                         // forearm, what there is of it
      ...hand(W, [0, 0.08, 1], 0.08, bone, bone, 0.85, -side),
    ], S, [0.16, 0, 0.05], phase);
  };

  // The ragged hem: tatters that trail and sway under the robe.
  const tatters = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * PI * 2, long = 0.42 + (i % 3) * 0.12;
    tatters.push(at(new THREE.ConeGeometry(0.11, long, 5), i % 2 ? shade : deep, Math.cos(a) * 0.19, 0.4 - long / 2, Math.sin(a) * 0.19, PI));
  }
  const hem = part(tatters, [0, 0.4, 0], [0.3, 0, 0.18], 1);

  return [body, eyes, arm(-1, 0), arm(1, 2), hem];
}

// ---- The final boss: a bloated giant of a zombie, belly split open, drooling. ----
// (Modelled at normal size; the horde draws him several times bigger.)

function boss() {
  const skin = 0x8a9468, rot = 0x5c6648, pale = 0xa3a97c, vest = 0x3d3a31, vestDark = 0x2a2822, trousers = 0x26262b;
  const blood = 0x6a1512, gut = 0x8c3a34, filth = 0x4a2a12, bone = 0xd8d2bf, dark = 0x121110, eye = 0xffb347;

  const body = part([
    at(ball(0.6, 1.05, 0.95, 1), skin, 0, 0.98, 0.1),                        // the belly
    at(ball(0.5, 1.02, 0.9, 0.95), pale, 0, 0.82, 0.16),                     // ...sagging over the belt
    at(ball(0.46, 1.1, 0.85, 0.9), vest, 0, 1.36, 0),                        // chest in a vest far too small
    at(box(0.3, 0.5, 0.06), vestDark, -0.34, 1.2, 0.3, 0, 0.5), at(box(0.3, 0.5, 0.06), vestDark, 0.34, 1.2, 0.3, 0, -0.5),   // its open flaps
    at(ball(0.2, 0.7, 1.5, 0.5), blood, 0.05, 0.98, 0.64),                   // split down the middle
    at(ball(0.1, 1, 1, 0.8), gut, -0.02, 0.9, 0.7), at(ball(0.09), gut, 0.1, 0.82, 0.69), at(ball(0.08), gut, 0.04, 0.72, 0.66),   // guts spilling out
    ...[1.14, 1.06].map((y) => at(box(0.26, 0.022, 0.03), bone, 0.05, y, 0.68)),   // ribs across the split
    at(ball(0.14, 1.3, 0.8, 1), filth, -0.28, 0.72, 0.5), at(ball(0.1), filth, 0.3, 1.02, 0.52),   // smeared with filth
    at(ball(0.24), skin, -0.5, 1.5, 0), at(ball(0.24), skin, 0.5, 1.5, 0),   // shoulders
    at(ball(0.3, 1.25, 0.6, 1), skin, 0, 1.56, 0.08),                        // no neck, just rolls
    at(ball(0.21, 1, 1.05, 1), skin, 0, 1.74, 0.14),                         // a small head
    at(ball(0.2, 1.2, 0.7, 1), pale, 0, 1.62, 0.2),                          // jowls
    at(ball(0.09, 1, 1, 0.5), rot, 0.13, 1.76, 0.26),                        // rot on one cheek
    at(box(0.2, 0.09, 0.05), dark, 0, 1.65, 0.335),                          // mouth, hanging open
    ...[-0.06, 0, 0.06].map((x) => at(box(0.035, 0.04, 0.03), bone, x, 1.685, 0.345)),   // teeth
    at(box(0.05, 0.16, 0.03), filth, 0.04, 1.56, 0.36),                      // drool
    at(ball(0.04), dark, -0.08, 1.79, 0.31), at(ball(0.04), dark, 0.08, 1.79, 0.31),   // eye sockets
    at(box(0.36, 0.1, 0.06), rot, 0, 1.87, 0.22, -0.3),                      // heavy brow
  ]);
  const eyes = glowing([at(ball(0.026), eye, -0.08, 1.79, 0.335), at(ball(0.026), eye, 0.08, 1.79, 0.335)]);

  // Arms: upper arm (all flab), an elbow, a forearm, and a fist like a ham with a handful ready to throw.
  const arm = (side, phase) => {
    const S = [side * 0.56, 1.5, 0], E = [side * 0.7, 1.04, 0.08], W = [side * 0.66, 0.7, 0.32], F = [side * 0.66, 0.6, 0.4];
    return part([
      ...chain([S, E, W], [0.22, 0.18, 0.13], skin, rot),
      at(ball(0.2, 1, 1.15, 1), pale, side * 0.64, 1.3, 0.02, 0.2),                           // (the flab hanging off it)
      at(ball(0.17, 1, 0.85, 1.05), rot, ...F),                                                // the fist
      ...[-1.5, -0.5, 0.5, 1.5].map((k) => at(small(0.055), skin, F[0] + k * 0.075, F[1] + 0.02, F[2] + 0.15)),   // knuckles
      at(small(0.06), skin, F[0] - side * 0.16, F[1] + 0.02, F[2] + 0.04),                     // thumb
      at(ball(0.12), filth, F[0], F[1] - 0.06, F[2] + 0.09),                                   // ...with a handful ready to throw
    ], S, [0.5, 0, 0], phase);
  };

  // Legs: thighs like tree trunks, a knee, a calf, and a broad bare foot with toes.
  const leg = (side, phase) => {
    const x = side * 0.27, H = [x, 0.6, 0], K = [x * 1.04, 0.33, 0.06], A = [x, 0.1, 0];
    return part([
      ...chain([H, K, A], [0.24, 0.19, 0.13], trousers),
      at(rod(0.15, 0.14, 0.05), vestDark, x, 0.13, 0),                                         // the trouser end
      at(ball(0.15, 0.95, 0.5, 1.5), rot, x, 0.06, 0.1),                                       // the foot
      ...[-1.5, -0.5, 0.5, 1.5].map((k) => at(small(0.042), skin, x + k * 0.066, 0.045, 0.31)),   // toes
    ], H, [0.32, 0, 0], phase);
  };

  return [body, eyes, arm(-1, 0), arm(1, PI), leg(-1, PI), leg(1, 0)];
}

// ---- Level 2: a giant rat. Low, long, all teeth and tail. ----

function rat() {
  const fur = 0x3b332b, dark = 0x26201b, pink = 0xa87370, tooth = 0xe8e0c8, eye = 0xff5a3a;
  const body = part([
    at(ball(0.2, 1, 0.85, 1.9), fur, 0, 0.27, 0),                               // body
    at(ball(0.17, 1, 0.8, 1.2), dark, 0, 0.34, -0.16),                          // haunches, humped
    at(ball(0.13, 1, 1, 1.45), fur, 0, 0.3, 0.42),                              // head
    at(ball(0.055, 1, 1, 1.7), pink, 0, 0.26, 0.6),                             // snout
    at(ball(0.055, 1, 1, 0.3), pink, -0.09, 0.42, 0.36), at(ball(0.055, 1, 1, 0.3), pink, 0.09, 0.42, 0.36),   // ears
    at(box(0.022, 0.06, 0.02), tooth, -0.016, 0.2, 0.66), at(box(0.022, 0.06, 0.02), tooth, 0.016, 0.2, 0.66), // two long teeth
  ]);
  const eyes = glowing([at(ball(0.024), eye, -0.065, 0.345, 0.5), at(ball(0.024), eye, 0.065, 0.345, 0.5)]);
  const tail = part([at(rod(0.008, 0.03, 0.62), pink, 0, 0.22, -0.66, PI / 2)], [0, 0.24, -0.36], [0, 0.6, 0], 0);
  const leg = (side, front, phase) => part([
    at(rod(0.028, 0.04, 0.2), fur, side * 0.15, 0.1, front * 0.22),
    at(ball(0.035, 1, 0.5, 1.6), pink, side * 0.15, 0.015, front * 0.22 + 0.03),
  ], [side * 0.15, 0.2, front * 0.22], [0.9, 0, 0], phase);
  return [body, eyes, tail, leg(-1, 1, 0), leg(1, 1, PI), leg(-1, -1, PI), leg(1, -1, 0)];
}

// ---- Level 2: the spider. Eight legs, a fat abdomen, a cluster of eyes. (The Spider Queen is the same, recoloured.) ----

// A straight piece from one point to another.
function strut(from, to, rFrom, rTo, color) {
  const A = new THREE.Vector3(...from), B = new THREE.Vector3(...to), geo = rod(rTo, rFrom, A.distanceTo(B));
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()));
  return at(geo, color, (A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
}

function spider(c = { body: 0x2b221c, shell: 0x1b1512, leg: 0x211a15, mark: 0x8a1a16, fang: 0xd8d2bf, eye: 0xff3a2a }) {
  const body = part([
    at(ball(0.3, 1, 0.85, 1.25), c.body, 0, 0.52, -0.34),                       // abdomen
    at(ball(0.1, 1.1, 0.3, 1.9), c.mark, 0, 0.75, -0.36),                       // the mark on its back
    at(ball(0.19, 1.15, 0.7, 1.15), c.shell, 0, 0.42, 0.1),                     // the front half, where the legs join
    at(ball(0.115), c.body, 0, 0.42, 0.31),                                     // head
    at(rod(0.008, 0.03, 0.17), c.fang, -0.05, 0.31, 0.4, 0.5), at(rod(0.008, 0.03, 0.17), c.fang, 0.05, 0.31, 0.4, 0.5),   // fangs
    at(rod(0.012, 0.04, 0.12), c.shell, 0, 0.44, -0.72, -PI / 2),               // spinneret
  ]);
  const eyes = glowing([
    ...[-0.075, -0.027, 0.027, 0.075].map((x) => at(ball(0.019), c.eye, x, 0.46, 0.405 - Math.abs(x) * 0.5)),
    at(ball(0.024), c.eye, -0.045, 0.515, 0.385), at(ball(0.024), c.eye, 0.045, 0.515, 0.385),
  ]);
  // A leg: out and up from the body to a knee higher than its back, then down to the floor, fanned front to back.
  const leg = (side, k) => {
    const z0 = 0.2 - k * 0.11, fan = [0.6, 0.22, -0.18, -0.58][k], hip = [side * 0.15, 0.42, z0];
    const knee = [side * 0.52, 0.82, z0 + fan * 0.55], foot = [side * 0.9, 0, z0 + fan * 1.1];
    return part([
      strut(hip, knee, 0.04, 0.03, c.leg), at(ball(0.04), c.body, ...knee), strut(knee, foot, 0.03, 0.012, c.leg),
    ], hip, [0.22, 0.42, 0], (k % 2 ? PI : 0) + (side > 0 ? PI : 0));
  };
  return [body, eyes, ...[0, 1, 2, 3].flatMap((k) => [leg(-1, k), leg(1, k)])];
}
const crawler = () => spider();
const queen = () => spider({ body: 0x23122c, shell: 0x140a1a, leg: 0x1c1024, mark: 0xd0201b, fang: 0xe8e0c8, eye: 0xc17bff });

// ---- Level 2: the bone-thrower. Hooded, bent under a sack of bones, one arm cocked back with a femur. ----

function thrower() {
  const robe = 0x2d2722, robeDark = 0x1a1714, bone = 0xd8d2bf, dark = 0x0c0b0a, sack = 0x5e4d34, eye = 0x8dff5a;
  const femur = (x, y, z, rx, length = 0.4) => [
    at(rod(0.022, 0.022, length), bone, x, y, z, rx),
    at(ball(0.04), bone, x, y + Math.cos(rx) * length / 2, z + Math.sin(rx) * length / 2),
    at(ball(0.04), bone, x, y - Math.cos(rx) * length / 2, z - Math.sin(rx) * length / 2),
  ];
  const body = part([
    at(rod(0.17, 0.36, 1.1), robe, 0, 0.55, 0),                                 // robe to the ground
    at(box(0.5, 0.05, 0.5), robeDark, 0, 0.03, 0),                              // its ragged hem
    at(cap(0.21, 0.3, 0.85), robe, 0, 1.26, 0.06, 0.3),                         // bent back
    at(ball(0.21, 1, 1, 1.1), robeDark, 0, 1.6, 0.16),                          // hood
    at(ball(0.13, 1, 1.1, 1), bone, 0, 1.58, 0.24),                             // the skull inside it
    at(ball(0.036), dark, -0.05, 1.6, 0.345), at(ball(0.036), dark, 0.05, 1.6, 0.345),
    at(box(0.1, 0.05, 0.05), bone, 0, 1.49, 0.33),                              // jaw
    at(ball(0.27, 1, 1.15, 0.9), sack, -0.04, 1.2, -0.3),                       // the sack
    ...femur(-0.12, 1.52, -0.3, 0.5, 0.36), ...femur(0.08, 1.5, -0.36, -0.4, 0.34),   // what's in it, sticking out
  ]);
  const eyes = glowing([at(ball(0.02), eye, -0.05, 1.6, 0.37), at(ball(0.02), eye, 0.05, 1.6, 0.37)]);
  // The throwing arm, cocked back over his shoulder: sleeve to the elbow, bare bone from there, a hand round the next one.
  const TS = [0.27, 1.42, 0], TE = [0.35, 1.68, -0.12], TW = [0.31, 1.94, -0.2];
  const throwing = part([
    ...chain([TS, TE, along(TE, TW, 0.45)], [0.075, 0.062, 0.05], robe),
    strut(along(TE, TW, 0.3), TW, 0.026, 0.022, bone),
    ...hand(TW, [0, 1, -0.15], 0.07, bone, bone, 1, 1),
    ...femur(0.31, 2.03, -0.2, 1.0, 0.44),                                      // the next one, in his fist
  ], TS, [0.9, 0, 0], 0);
  // The other arm: hanging forward out of its sleeve, fingers open.
  const OS = [-0.27, 1.42, 0], OE = [-0.32, 1.13, 0.1], OW = [-0.3, 0.9, 0.27];
  const other = part([
    ...chain([OS, OE, along(OE, OW, 0.4)], [0.075, 0.064, 0.052], robe),
    strut(along(OE, OW, 0.25), OW, 0.026, 0.02, bone),
    ...hand(OW, [0, -0.7, 0.7], 0.07, bone, bone, 0.4, -1),
  ], OS, [0.4, 0, 0], PI);
  return [body, eyes, throwing, other];
}

// ---- Level 2's boss: a giant made of skulls, held together by nothing you can see. ----
// (Modelled at normal size; the horde draws him several times bigger.)

function boss2() {
  const bone = 0xc9c2ad, old = 0x9c9279, dark = 0x050505, eye = 0x8dff5a, gold = 0xc9a23a;
  // A skull of radius r facing +z (turned by `yaw`): cranium, two sockets, a nose hole, a jaw.
  const skull = (x, y, z, r, color = bone, yaw = 0) => [
    at(ball(r, 1, 1.05, 1.1), color, 0, 0, 0),
    at(ball(r * 0.3), dark, -r * 0.38, r * 0.08, r * 0.92), at(ball(r * 0.3), dark, r * 0.38, r * 0.08, r * 0.92),
    at(box(r * 0.16, r * 0.26, r * 0.1), dark, 0, -r * 0.3, r * 1.05),
    at(box(r * 1.05, r * 0.42, r * 0.9), color, 0, -r * 0.82, r * 0.35),
    at(box(r * 0.8, r * 0.1, r * 0.06), dark, 0, -r * 0.72, r * 0.82),
  ].map((g) => g.rotateY(yaw).translate(x, y, z));

  const body = part([
    // A heap of skulls for hips, three rows of them for a chest.
    ...skull(-0.2, 0.86, 0.02, 0.17, old, -0.5), ...skull(0.2, 0.86, 0.02, 0.17, bone, 0.5), ...skull(0, 0.8, 0.12, 0.16, old),
    ...skull(-0.3, 1.14, 0.04, 0.18, bone, -0.6), ...skull(0, 1.12, 0.14, 0.19, old), ...skull(0.3, 1.14, 0.04, 0.18, bone, 0.6),
    ...skull(-0.34, 1.44, 0.02, 0.19, old, -0.5), ...skull(0, 1.42, 0.13, 0.2, bone), ...skull(0.34, 1.44, 0.02, 0.19, old, 0.5),
    ...skull(-0.16, 1.28, -0.16, 0.17, old, 2.6), ...skull(0.16, 1.28, -0.16, 0.17, bone, -2.6),   // and more behind
    at(rod(0.05, 0.06, 1.0), old, 0, 1.2, -0.1),                                                    // a spine through the middle of it
    ...[1.0, 1.3, 1.58].map((y) => at(hoop(0.4, 0.022), bone, 0, y, 0)),                            // ribs holding it together
    ...skull(-0.56, 1.62, 0, 0.16, bone, -1.2), ...skull(0.56, 1.62, 0, 0.16, bone, 1.2),           // shoulders
    // The head: one huge skull, wearing a crown of rib bones.
    ...skull(0, 1.9, 0.08, 0.3, bone),
    ...[-0.12, -0.04, 0.04, 0.12].map((x) => at(box(0.06, 0.07, 0.04), bone, x, 1.67, 0.4)),        // teeth
    at(hoop(0.27, 0.03, 1), gold, 0, 2.12, 0.06),
    ...[0, 1, 2, 3, 4, 5, 6].map((k) => at(rod(0.006, 0.026, 0.24), bone, Math.sin(k * 0.9) * 0.27, 2.24, 0.06 + Math.cos(k * 0.9) * 0.27)),
  ]);
  const eyes = glowing([
    at(ball(0.05), eye, -0.115, 1.925, 0.415), at(ball(0.05), eye, 0.115, 1.925, 0.415),              // his own
    at(ball(0.028), eye, -0.076, 1.436, 0.355), at(ball(0.028), eye, 0.076, 1.436, 0.355),              // and a pair still lit in his chest
  ]);

  const arm = (side, phase) => part([
    at(rod(0.045, 0.06, 0.5), bone, side * 0.66, 1.36, 0.04, 0.2),                                  // one long bone...
    at(ball(0.07), old, side * 0.68, 1.1, 0.1),
    at(rod(0.035, 0.045, 0.46), bone, side * 0.68, 0.86, 0.2, 0.45),                                // ...then two
    at(rod(0.03, 0.04, 0.46), old, side * 0.73, 0.86, 0.18, 0.45),
    ...skull(side * 0.7, 0.58, 0.32, 0.17, bone, side * 0.4),                                       // and a skull for a fist
  ], [side * 0.58, 1.6, 0], [0.5, 0, 0], phase);

  const leg = (side, phase) => part([
    at(rod(0.06, 0.075, 0.42), bone, side * 0.22, 0.6, 0),
    at(ball(0.085), old, side * 0.22, 0.38, 0.02),
    at(rod(0.05, 0.06, 0.34), bone, side * 0.22, 0.2, 0),
    ...skull(side * 0.22, 0.13, 0.08, 0.13, old),                                                   // he walks on them, too
  ], [side * 0.22, 0.8, 0], [0.3, 0, 0], phase);

  return [body, eyes, arm(-1, 0), arm(1, PI), leg(-1, PI), leg(1, 0)];
}

// ENEMY_PARTS: each monster as it is seen close up. ENEMY_LITE: a plainer version of the same monster (the same parts,
// in the same order, hinged in the same places) that the horde draws for the ones further away. A monster with no plain
// version is always drawn in full.
const QUEEN = { body: 0x23122c, shell: 0x140a1a, leg: 0x1c1024, mark: 0xd0201b, fang: 0xe8e0c8, eye: 0xc17bff };
const CRAWLER = { body: 0x2b221c, shell: 0x1b1512, leg: 0x211a15, mark: 0x8a1a16, fang: 0xd8d2bf, eye: 0xff3a2a };
export const ENEMY_LITE = { shambler, rattler, wraith, rat, crawler, thrower };
export const ENEMY_PARTS = {
  shambler: zombie, rattler: skeleton, wraith: ghost, rat: bigRat, crawler: () => fineSpider(CRAWLER), thrower: boneThrower, queen: () => fineSpider(QUEEN),
  boss: hamzitus, boss2: rubistus, boss3: () => fineBabitus(0), boss3b: () => fineBabitus(1), boss3c: () => fineBabitus(2), boss3d: () => fineBabitus(3),
};
// (the other zombies: the first one's body, until their own have arrived: see realMobs.js)
for (const name of ['zombieb', 'zombiec']) { ENEMY_PARTS[name] = () => ENEMY_PARTS.shambler(); ENEMY_LITE[name] = () => ENEMY_LITE.shambler(); }
