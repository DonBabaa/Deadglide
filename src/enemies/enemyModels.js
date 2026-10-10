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

// Three fingers reaching forward from a hand at (x, y, z).
const fingers = (color, x, y, z, length = 0.09) =>
  [-0.028, 0, 0.028].map((dx) => at(rod(0.007, 0.012, length), color, x + dx, y - 0.01, z + length / 2, PI / 2 - 0.25));

// ---- Zombie: a hunched, rotting corpse. One arm reaches, the other ends in a stump. ----

function shambler() {
  const skin = 0x7b8a63, rot = 0x56624a, shirt = 0x4d4b40, shirtDark = 0x35342d, trousers = 0x2a2b30;
  const blood = 0x5a1a16, bone = 0xd8d2bf, dark = 0x121110, hair = 0x1d1a16, eye = 0xdfe6a0;

  const body = part([
    at(box(0.34, 0.2, 0.22), trousers, 0, 0.92, 0),                          // hips
    at(cap(0.17, 0.32, 0.8), shirt, 0, 1.2, 0.05, 0.28),                     // torso, bent forward
    at(box(0.1, 0.14, 0.02), shirtDark, -0.1, 0.98, 0.135),                  // shirt hanging in rags
    at(box(0.08, 0.1, 0.02), shirtDark, 0.12, 1.0, 0.13),
    at(box(0.15, 0.17, 0.03), blood, 0.07, 1.23, 0.185, 0.28),               // a wound in the chest...
    ...[1.19, 1.235, 1.28].map((y) => at(box(0.13, 0.016, 0.02), bone, 0.07, y, 0.198 + (y - 1.19) * 0.28, 0.28)),   // ...showing ribs
    at(ball(0.1), shirt, -0.22, 1.4, 0.12), at(ball(0.1), shirt, 0.22, 1.43, 0.12),   // shoulders, one dropped
    at(rod(0.05, 0.06, 0.13), skin, 0, 1.5, 0.17, 0.5),                      // neck, craned forward
    at(ball(0.155, 0.92, 1.05, 1), skin, 0.02, 1.63, 0.25),                  // head
    at(ball(0.16, 1, 0.5, 1), hair, 0.02, 1.725, 0.2),                       // what's left of the hair
    at(ball(0.08, 1, 1, 0.5), rot, -0.1, 1.6, 0.3),                          // rot on one cheek
    at(box(0.13, 0.05, 0.11), rot, 0.02, 1.515, 0.31, 0.25),                 // jaw hanging open
    at(box(0.09, 0.045, 0.02), dark, 0.02, 1.555, 0.386),                    // mouth
    at(ball(0.03), dark, -0.055, 1.66, 0.385), at(ball(0.03), dark, 0.06, 1.66, 0.385),   // eye sockets
  ]);
  const eyes = glowing([at(ball(0.018), eye, 0.062, 1.66, 0.405)]);         // one eye still shining

  // Right arm: stretched out, grabbing.
  const armR = part([
    at(rod(0.068, 0.066, 0.13), shirt, 0.24, 1.41, 0.19, 1.25),              // sleeve, torn off short
    at(cap(0.05, 0.26), skin, 0.24, 1.38, 0.3, 1.25),
    at(cap(0.042, 0.26), skin, 0.24, 1.36, 0.6, 1.5),
    at(ball(0.05, 1, 0.6, 1.3), rot, 0.24, 1.35, 0.8),
    ...fingers(rot, 0.24, 1.35, 0.84),
  ], [0.24, 1.42, 0.12], [0.14, 0, 0], 0);

  // Left arm: hangs lower and ends in a stump.
  const armL = part([
    at(cap(0.05, 0.24), shirt, -0.24, 1.3, 0.22, 0.7),
    at(ball(0.055), blood, -0.24, 1.19, 0.33),
    at(rod(0.018, 0.024, 0.17), bone, -0.24, 1.13, 0.4, 0.9),                // bone sticking out
  ], [-0.24, 1.4, 0.12], [0.22, 0, 0], PI);

  const leg = (side, stride, phase) => part([
    at(cap(0.075, 0.3), trousers, side * 0.1, 0.68, 0.02),
    at(cap(0.06, 0.3), trousers, side * 0.1, 0.3, 0),
    at(rod(0.07, 0.05, 0.08), shirtDark, side * 0.1, 0.13, 0),               // frayed trouser end
    at(box(0.1, 0.07, 0.24), rot, side * 0.1, 0.035, 0.06),                  // bare foot
  ], [side * 0.1, 0.9, 0], [stride, 0, 0], phase);

  return [body, eyes, armR, armL, leg(-1, 0.42, 0), leg(1, 0.2, PI)];   // the right leg drags
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

  const arm = (side, phase) => part([
    at(rod(0.022, 0.02, 0.3), bone, side * 0.21, 1.31, 0),                   // upper arm
    at(ball(0.03), old, side * 0.21, 1.15, 0),                               // elbow, bent like a runner's
    at(rod(0.018, 0.016, 0.28), bone, side * 0.21, 1.1, 0.13, 1.2),
    at(ball(0.035, 1, 0.6, 1.2), old, side * 0.21, 1.05, 0.28),
    ...fingers(bone, side * 0.21, 1.05, 0.31, 0.08),
  ], [side * 0.21, 1.47, 0], [0.9, 0, 0], phase);

  const leg = (side, phase) => part([
    at(rod(0.026, 0.022, 0.42), bone, side * 0.1, 0.68, 0),                  // thigh bone
    at(ball(0.036), old, side * 0.1, 0.46, 0),                               // knee
    at(rod(0.02, 0.018, 0.42), bone, side * 0.1, 0.24, 0),                   // shin
    at(box(0.06, 0.03, 0.2), old, side * 0.1, 0.02, 0.06),                   // foot
  ], [side * 0.1, 0.9, 0], [0.8, 0, 0], phase);

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

  const arm = (side, phase) => part([
    at(rod(0.115, 0.05, 0.52), shade, side * 0.25, 1.1, 0.27, 1.25),         // wide sleeve, reaching forward
    at(ball(0.045, 1, 0.6, 1.2), bone, side * 0.25, 1.18, 0.56),             // bony hand
    ...fingers(bone, side * 0.25, 1.18, 0.6, 0.11),
  ], [side * 0.25, 1.05, 0.05], [0.16, 0, 0.05], phase);

  // The ragged hem: tatters that trail and sway under the robe.
  const tatters = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * PI * 2, long = 0.42 + (i % 3) * 0.12;
    tatters.push(at(new THREE.ConeGeometry(0.11, long, 5), i % 2 ? shade : deep, Math.cos(a) * 0.19, 0.4 - long / 2, Math.sin(a) * 0.19, PI));
  }
  const hem = part(tatters, [0, 0.4, 0], [0.3, 0, 0.18], 1);

  return [body, eyes, arm(-1, 0), arm(1, 2), hem];
}

export const ENEMY_PARTS = { shambler, rattler, wraith };
