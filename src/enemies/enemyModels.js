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

  const arm = (side, phase) => part([
    at(cap(0.17, 0.3), skin, side * 0.62, 1.26, 0.06, 0.25),                 // upper arm, all flab
    at(cap(0.14, 0.32), skin, side * 0.64, 0.86, 0.2, 0.5),                  // forearm
    at(ball(0.17, 1, 0.8, 1.1), rot, side * 0.64, 0.62, 0.34),               // a fist like a ham
    at(ball(0.12), filth, side * 0.64, 0.56, 0.42),                          // ...with a handful ready to throw
  ], [side * 0.56, 1.5, 0], [0.5, 0, 0], phase);

  const leg = (side, phase) => part([
    at(cap(0.21, 0.2), trousers, side * 0.27, 0.42, 0.02),                   // thighs like tree trunks
    at(cap(0.16, 0.12), trousers, side * 0.27, 0.2, 0),
    at(box(0.26, 0.1, 0.4), rot, side * 0.27, 0.05, 0.08),                   // bare foot
  ], [side * 0.27, 0.6, 0], [0.32, 0, 0], phase);

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
  const throwing = part([
    at(rod(0.05, 0.06, 0.36), robe, 0.3, 1.56, -0.04, -0.5),                    // arm, cocked back over his shoulder
    at(rod(0.028, 0.034, 0.3), bone, 0.3, 1.84, -0.18, -0.3),
    ...femur(0.3, 2.06, -0.22, 1.0, 0.42),                                      // the next one
  ], [0.27, 1.42, 0], [0.9, 0, 0], 0);
  const other = part([
    at(rod(0.05, 0.06, 0.4), robe, -0.3, 1.2, 0.08, 0.25),
    at(rod(0.026, 0.032, 0.3), bone, -0.3, 0.9, 0.16, 0.4),
  ], [-0.27, 1.42, 0], [0.4, 0, 0], PI);
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

// ---- The last boss: Babitus Goyitus, the dealer. A long, lean corpse in a dinner suit. ----
// jewels: 0 to 3, how much gold he is wearing (it goes by how much you have ever wagered at his tables).
function babitus(jewels = 0) {
  const suit = 0x101014, lapel = 0x1c1c22, shirt = 0xf3efe4, tie = 0xb3201b, skin = 0x8a9468, rot = 0x5c6648, hair = 0x0c0b0a, bone = 0xd8d2bf, dark = 0x121110, eye = 0xffb347, gold = 0xffc233, card = 0xf7f3ea;

  const body = part([
    at(cap(0.26, 0.5, 0.75), suit, 0, 1.18, 0),                                   // a narrow chest in a dinner jacket
    at(cap(0.22, 0.2, 0.75), suit, 0, 0.82, 0),                                   // ...buttoned at the waist
    at(box(0.2, 0.52, 0.04), shirt, 0, 1.2, 0.2),                                 // shirt front
    at(box(0.1, 0.5, 0.05), lapel, -0.15, 1.22, 0.2, 0, 0, 0.16), at(box(0.1, 0.5, 0.05), lapel, 0.15, 1.22, 0.2, 0, 0, -0.16),   // satin lapels
    at(box(0.07, 0.07, 0.05), tie, 0, 1.46, 0.22), at(box(0.09, 0.1, 0.04), tie, -0.07, 1.46, 0.21, 0, 0, 0.5), at(box(0.09, 0.1, 0.04), tie, 0.07, 1.46, 0.21, 0, 0, -0.5),   // a red bow tie
    ...[1.3, 1.16, 1.02].map((y) => at(ball(0.014), dark, 0, y, 0.225)),            // studs
    at(ball(0.15), suit, -0.31, 1.42, 0), at(ball(0.15), suit, 0.31, 1.42, 0),    // square shoulders
    at(rod(0.07, 0.08, 0.14), skin, 0, 1.56, 0.02),                               // a thin neck
    at(ball(0.17, 0.92, 1.12, 1), skin, 0, 1.76, 0.03),                           // a long head
    at(box(0.2, 0.1, 0.16), skin, 0, 1.63, 0.07),                                 // lantern jaw
    at(ball(0.07, 1, 1, 0.5), rot, -0.11, 1.72, 0.12), at(ball(0.07, 1, 1, 0.5), rot, 0.11, 1.72, 0.12),   // hollow cheeks
    at(ball(0.175, 0.95, 0.8, 1.05), hair, 0, 1.86, -0.02),                       // hair slicked straight back
    at(box(0.16, 0.035, 0.03), dark, 0, 1.64, 0.155),                             // a thin smile
    ...[-0.05, -0.017, 0.017, 0.05].map((x) => at(box(0.026, 0.03, 0.02), bone, x, 1.645, 0.165)),   // ...full of teeth
    at(ball(0.036), dark, -0.065, 1.79, 0.15), at(ball(0.036), dark, 0.065, 1.79, 0.15),   // eye sockets
    at(box(0.3, 0.04, 0.05), hair, 0, 1.845, 0.13, -0.25),                        // one long brow
  ]);
  const eyes = glowing([at(ball(0.024), eye, -0.065, 1.79, 0.17), at(ball(0.024), eye, 0.065, 1.79, 0.17)]);

  const arm = (side, phase) => part([
    at(cap(0.085, 0.34), suit, side * 0.36, 1.2, 0.04, 0.2),                      // sleeve
    at(cap(0.07, 0.3), suit, side * 0.38, 0.84, 0.18, 0.55),
    at(rod(0.075, 0.075, 0.05), shirt, side * 0.38, 0.69, 0.28, 0.55),            // a white cuff
    at(ball(0.07, 1, 0.7, 1.2), skin, side * 0.38, 0.63, 0.34),                   // a long grey hand
    ...fingers(rot, side * 0.38, 0.63, 0.4),
    ...(side > 0 ? [-0.3, -0.15, 0, 0.15, 0.3].map((turn, i) => at(box(0.1, 0.15, 0.006), card, 0.38 + turn * 0.16, 0.74 + Math.cos(turn * 3) * 0.03, 0.42 + i * 0.004, -0.3, 0, -turn)) : []),   // a hand of cards, fanned
  ], [side * 0.33, 1.42, 0], [0.45, 0, 0], phase);

  const leg = (side, phase) => part([
    at(cap(0.1, 0.36), suit, side * 0.13, 0.46, 0),                               // trouser leg
    at(cap(0.085, 0.22), suit, side * 0.13, 0.2, 0),
    at(ball(0.09, 0.9, 0.55, 1.7), dark, side * 0.13, 0.05, 0.07),                // patent shoe
  ], [side * 0.13, 0.66, 0], [0.34, 0, 0], phase);

  // What he has taken from you: a chain, then rings and a second chain, then a crown.
  const bling = [];
  if (jewels >= 1) bling.push(at(hoop(0.2, 0.022, 0.7), gold, 0, 1.4, 0.04, 0.5), at(ball(0.05), gold, 0, 1.24, 0.24));
  if (jewels >= 2) bling.push(at(hoop(0.26, 0.03, 0.7), gold, 0, 1.34, 0.05, 0.62), at(ball(0.075), gold, 0, 1.1, 0.25), at(ball(0.03), gold, -0.165, 1.9, 0.02), at(ball(0.03), gold, 0.165, 1.9, 0.02));
  if (jewels >= 3) bling.push(at(rod(0.17, 0.15, 0.09), gold, 0, 2.0, 0), ...[0, 1, 2, 3, 4, 5].map((i) => at(rod(0.004, 0.03, 0.12), gold, Math.cos(i * 1.047) * 0.15, 2.09, Math.sin(i * 1.047) * 0.15)));
  return [body, eyes, arm(-1, 0), arm(1, PI), leg(-1, PI), leg(1, 0), ...(bling.length ? [glowing(bling)] : [])];
}

export const ENEMY_PARTS = { shambler, rattler, wraith, rat, crawler, thrower, queen, boss, boss2, boss3: () => babitus(0), boss3b: () => babitus(1), boss3c: () => babitus(2), boss3d: () => babitus(3) };
