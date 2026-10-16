// Kirky: board + rider, built in code. Purely visual: reads the Skater's
// state each frame and poses itself. Model forward is +Z.
// He wears a hoodie with the hood up over a beanie, belted jeans and black
// Vans-style skate shoes, and he is never without a cigarette.
import * as THREE from 'three';
import { realGuns } from './gunModels.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { config } from '../config.js';
import { glowTexture } from '../world/textures.js';
import { hoodieTexture, denimTexture, ribTexture, canvasTexture, deckTexture, emblemTexture } from './kirkyTextures.js';
import { buildGuns } from './gunModels.js';
import { COSTUMES, buildMask, buildPack, mouthOf } from './costumes.js';
import { tube as skinTube, lump, sculpt, dent, fineHand } from '../enemies/sculpt.js';
import { whenBody, attachBody } from './kirkyBody.js';

const TAU = Math.PI * 2;
const x = new THREE.Vector3(), z = new THREE.Vector3(), basis = new THREE.Matrix4();
const local = new THREE.Vector3();
const qInv = new THREE.Quaternion(), qAim = new THREE.Quaternion(), ORIGIN = new THREE.Vector3();
const REST = new THREE.Quaternion().setFromEuler(new THREE.Euler(1.2, 0.5, 0));   // gun arm hanging at the side
const REST_TWO_HANDED = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.26, 0.2, 0));   // long guns: carried low across the body (not so low that the longest of them is in the ground)
const UP = new THREE.Vector3(0, 1, 0), grip = new THREE.Vector3();
const ease = (t) => t * t * (3 - 2 * t);
const EMBER = new THREE.Color(0xff6a1a);

function part(geometry, material, px = 0, py = 0, pz = 0) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(px, py, pz);
  mesh.castShadow = true;
  return mesh;
}
const limb = (radius, length, material, px, py, pz) => part(new THREE.CapsuleGeometry(radius, length, 4, 12), material, px, py, pz);
const box = (w, h, d, material, px, py, pz) => part(new THREE.BoxGeometry(w, h, d), material, px, py, pz);
const tube = (radius, length, material, px, py, pz, radiusTop = radius) => part(new THREE.CylinderGeometry(radiusTop, radius, length, 16), material, px, py, pz);

// Weld the loose pieces of a group that share a material into one mesh. He is built from a couple of hundred
// small shapes, each one a separate thing to draw (twice: once for its shadow), which adds up fast with four
// riders on the Moon. Only pieces that never move or hide on their own may be welded: list the others in `keep`.
function weld(group, keep = []) {
  const sets = new Map();
  for (const m of group.children) {
    if (!m.isMesh || m.children.length || keep.includes(m) || !m.castShadow || !m.visible) continue;
    if (!sets.has(m.material)) sets.set(m.material, []);
    sets.get(m.material).push(m);
  }
  for (const [material, pieces] of sets) {
    if (pieces.length < 2) continue;
    const merged = mergeGeometries(pieces.map((m) => { m.updateMatrix(); return (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrix); }));
    if (!merged) continue;
    for (const m of pieces) { group.remove(m); m.geometry.dispose(); }
    group.add(part(merged, material));
  }
  return group;
}

// How the board sits for each grind (in the order of GRINDS in skater.js): [turned across the rail, nose tipped
// down (+) or up (-), how far he stands to one side of the rail], in radians and metres.
const GRIND_POSES = [
  [0, 0, 0],                 // 50-50: both trucks on
  [0, 0.3, 0],               // nosegrind: front truck only
  [0, -0.3, 0],              // 5-0: back truck only
  [Math.PI / 2, 0, 0],       // boardslide: across the rail, on the middle of the deck
  [Math.PI / 2, 0, 0.32],    // tailslide: across it, on the tail
  [0.45, 0.3, 0],            // crooked: front truck, tail swung out
  [Math.PI / 2, 0, -0.32],   // noseslide: across it, on the nose
  [-0.4, 0.22, 0],           // smith: back truck, nose dipped down one side
  [0.4, -0.2, 0],            // feeble: back truck, nose over the other side
];

const MANUAL_POSE = [0, -0.34, 0];   // a manual: the nose up, the back wheels down
const HAND = new THREE.Vector3(0, 0, 0.56);   // his gun hand, in the gun arm's space (with the arm out straight)
// His arms bend. The gun arm is a shoulder (this.gunArm, pointing along its own +z), an elbow UPPER along it
// (this.foreArm, which turns about x: negative bends the hand up toward the arm's +y) and a hand FORE further on.
const UPPER = 0.27, FORE = HAND.z - UPPER;
const SHOULDER = new THREE.Vector3(0.2, 0.57, 0.03);   // where it hangs from, on his torso (the other is its mirror)
const sPos = new THREE.Vector3(), aim = new THREE.Vector3(), ax = new THREE.Vector3(), ay = new THREE.Vector3(), az = new THREE.Vector3(), qHand = new THREE.Quaternion(), rootInv = new THREE.Matrix4();
// The monsters' sculpting kit (enemies/sculpt.js) makes shapes that carry their own paint; his are coloured by
// his materials instead (the shop repaints those), so the paint comes off.
const shape = (geo) => { geo.deleteAttribute('color'); return geo; };
const SKIN = { skin: 0, joint: 0, nail: 0 };
// A skin through a stack of cross-sections, bottom to top. Each is [x, y, z, half-width, half-depth, squareness]:
// where its middle is, how wide and deep it is there, and how square (1: an ellipse; less: boxier, like a body).
// That is how his clothes are cut: a section at the hem, the waist, the chest, the shoulders.
function loft(rings, sides = 32) {
  const pos = [], uv = [], idx = [], n = rings.length;
  let run = 0;
  for (let j = 0; j < n; j++) {
    const [cx, cy, cz, rx, rz, sq = 1] = rings[j];
    if (j) run += Math.hypot(cx - rings[j - 1][0], cy - rings[j - 1][1], cz - rings[j - 1][2]);
    for (let i = 0; i <= sides; i++) {
      const a = (i / sides) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      pos.push(cx + Math.sign(c) * Math.abs(c) ** sq * rx, cy, cz + Math.sign(sn) * Math.abs(sn) ** sq * rz);
      uv.push(i / sides, run * 2.2);
    }
  }
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < sides; i++) { const a = j * (sides + 1) + i, b = a + 1, c = a + sides + 1; idx.push(a, c, b, b, c, c + 1); }
  for (const [j, flip] of [[0, false], [n - 1, true]]) {          // closed at both ends
    const mid = pos.length / 3;
    pos.push(rings[j][0], rings[j][1], rings[j][2]);
    uv.push(0.5, 0.5);
    for (let i = 0; i < sides; i++) { const a = j * (sides + 1) + i; idx.push(mid, flip ? a + 1 : a, flip ? a : a + 1); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
// Creases in cloth: every point pushed out from (or in toward) the line down the middle of the piece.
// middle(y) gives that line's [x, z]; fold(v, angle round it) gives how much (0.02 = 2% further out).
function crease(geo, middle, fold) {
  const P = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i);
    const [mx, mz] = middle(v.y), dx = v.x - mx, dz = v.z - mz;
    if (dx * dx + dz * dz < 1e-8) continue;
    const k = 1 + fold(v, Math.atan2(dz, dx));
    P.setXYZ(i, mx + dx * k, v.y, mz + dz * k);
  }
  geo.computeVertexNormals();
  return geo;
}
const bell = (x) => Math.exp(-x * x);
const FLIP_PIVOT = 0.85;   // he flips about this height (his middle)
const X_AXIS = new THREE.Vector3(1, 0, 0), flipQ = new THREE.Quaternion(), pivot = new THREE.Vector3();

const qTuck = new THREE.Quaternion();
// Where the snapped boof ends, which is where it burns: the middle of the last ring of its far half, which
// tools/build_guns.py turns 0.8 rad up about the under side of the break (0.074 along it), and a touch beyond it.
export const SNAPPED_END = new THREE.Vector3(0, 0.0325, 0.1006);

export class SkaterModel {
  constructor(scene) {
    const std = (color, roughness = 0.8, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
    const wood = std(0x9a6a3c, 0.6), grip = std(0x111214, 0.95), urethane = std(0xe9e4d4, 0.5);
    const metal = std(0x9aa0a6, 0.35, { metalness: 0.6 }), gunmetal = std(0x1b1d21, 0.45);
    const skin = std(0xc99873, 0.7), white = std(0xeeeeea, 0.7), leather = std(0x121214, 0.5), dark = std(0x14110f, 0.9);
    const hoodie = std(0xffffff, 0.95, { map: hoodieTexture(), side: THREE.DoubleSide });
    const hoodieRib = std(0xffffff, 0.95, { map: ribTexture('#682622') });
    const denim = std(0xffffff, 0.9, { map: denimTexture() });
    const beanie = std(0xffffff, 0.95, { map: ribTexture('#24262c') });
    const shoeCanvas = std(0xffffff, 0.9, { map: canvasTexture() });
    this.mats = { hoodie, hoodieRib, beanie, wood, urethane, gunmetal, skin };   // the ones cosmetics repaint (see applyLook)

    this.root = new THREE.Group();   // position + board orientation
    this.tilt = new THREE.Group();   // carve lean
    this.root.add(this.tilt);

    // ---- Board (its own group so it can flip under the rider's feet) ----
    this.board = new THREE.Group();
    this.board.rotation.order = 'YXZ';
    // The deck: a real one. Seven plies pressed with a dip across it and a kick at each end, rounded off at nose and
    // tail; grip tape on top, the graphic underneath (the shop's deck designs are painted on that), and the plies
    // showing at the edge.
    const deck = new THREE.Group();
    {
      const W = 0.11, FLAT = 0.3, KICK = 0.115, T = 0.007, NZ = 34, NX = 10;
      const half = (zz) => (Math.abs(zz) <= FLAT ? W : W * Math.sqrt(Math.max(0, 1 - ((Math.abs(zz) - FLAT) / KICK) ** 2)) * 0.98 + W * 0.02);
      const rise = (xx, zz) => 0.013 * (xx / W) ** 2 + (Math.abs(zz) > FLAT - 0.04 ? 2.6 * (Math.abs(zz) - FLAT + 0.04) ** 2 : 0);   // the dip across it; the kicks
      const top = [], under = [], uvs = [], edge = [], edgeUv = [], faces = [], rim = [];
      for (let j = 0; j <= NZ; j++) {
        const zz = -(FLAT + KICK) + (2 * (FLAT + KICK) * j) / NZ, h = half(zz);
        for (let i = 0; i <= NX; i++) {
          const xx = -h + (2 * h * i) / NX, yy = rise(xx, zz);
          top.push(xx, yy + T, zz);
          under.push(xx, yy - T, zz);
          uvs.push(xx / (2 * W) + 0.5, zz / (2 * (FLAT + KICK)) + 0.5);
        }
      }
      const at = (i, j) => j * (NX + 1) + i;
      for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) faces.push(at(i, j), at(i, j + 1), at(i + 1, j), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1));
      const sheet = (pos, flip) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        g.setIndex(flip ? faces.map((_, k) => faces[k - (k % 3) + [0, 2, 1][k % 3]]) : faces);
        g.computeVertexNormals();
        return g;
      };
      // The edge: a strip right round, from the top sheet's rim down to the bottom one's.
      for (let j = 0; j <= NZ; j++) rim.push(at(NX, j));
      for (let j = NZ; j >= 0; j--) rim.push(at(0, j));
      rim.push(rim[0]);
      const ring = [];
      rim.forEach((k, n) => { edge.push(top[k * 3], top[k * 3 + 1], top[k * 3 + 2], under[k * 3], under[k * 3 + 1], under[k * 3 + 2]); edgeUv.push(n / rim.length, 1, n / rim.length, 0); if (n) ring.push(n * 2 - 2, n * 2 - 1, n * 2, n * 2, n * 2 - 1, n * 2 + 1); });
      const side = new THREE.BufferGeometry();
      side.setAttribute('position', new THREE.Float32BufferAttribute(edge, 3));
      side.setAttribute('uv', new THREE.Float32BufferAttribute(edgeUv, 2));
      side.setIndex(ring);
      side.computeVertexNormals();
      const ply = std(0xd9b888, 0.7, { side: THREE.DoubleSide }), rubber = std(0x1a1a1c, 0.9), bushing = std(0xc8201b, 0.6);
      deck.add(part(sheet(top, false), grip), part(sheet(under, true), wood), part(side, ply));
      deck.add(box(0.2, 0.0012, 0.004, std(0x2a2b2e, 0.95), 0, 0.0085, 0.11));                                // where the grip tape was cut
      for (const end of [-1, 1]) {
        const z0 = end * 0.2;
        for (const bx of [-0.021, 0.021]) for (const bz of [-0.027, 0.027]) deck.add(part(new THREE.CylinderGeometry(0.0045, 0.0045, 0.004, 8), metal, bx, 0.0085, z0 + bz));   // four bolts, through the deck
        deck.add(
          box(0.062, 0.005, 0.088, rubber, 0, -0.0095, z0),                                                     // a riser pad
          box(0.056, 0.009, 0.08, metal, 0, -0.0165, z0),                                                       // the baseplate
          part(new THREE.CylinderGeometry(0.008, 0.008, 0.05, 8).rotateX(end * 0.5), metal, 0, -0.04, z0 - end * 0.012),   // the kingpin...
          part(new THREE.CylinderGeometry(0.016, 0.014, 0.012, 12).rotateX(end * 0.5), bushing, 0, -0.03, z0 - end * 0.006),   // ...and its two bushings
          part(new THREE.CylinderGeometry(0.014, 0.017, 0.012, 12).rotateX(end * 0.5), bushing, 0, -0.05, z0 - end * 0.018),
          part(new THREE.CylinderGeometry(0.02, 0.012, 0.012, 10).rotateX(end * 0.5), metal, 0, -0.06, z0 - end * 0.024),     // the nut on the end of it
          part(new THREE.CylinderGeometry(0.02, 0.036, 0.045, 4).rotateY(Math.PI / 4).scale(1.5, 1, 0.75), metal, 0, -0.052, z0 + end * 0.012),   // the hanger...
          part(new THREE.CylinderGeometry(0.0125, 0.0125, 0.15, 10).rotateZ(Math.PI / 2), metal, 0, -0.075, z0 + end * 0.012),                     // ...its barrel...
          part(new THREE.CylinderGeometry(0.0045, 0.0045, 0.245, 8).rotateZ(Math.PI / 2), metal, 0, -0.075, z0 + end * 0.012),                     // ...and the axle through it
          part(new THREE.CylinderGeometry(0.009, 0.012, 0.03, 8).rotateX(Math.PI / 2 - end * 0.6), metal, 0, -0.035, z0 + end * 0.03),             // the pivot, into its cup
        );
        for (const wx of [-0.1, 0.1]) {
          const wz = z0 + end * 0.012;
          deck.add(
            part(new THREE.LatheGeometry([[0.012, -0.0175], [0.025, -0.0175], [0.0295, -0.013], [0.03, 0], [0.0295, 0.013], [0.025, 0.0175], [0.012, 0.0175]].map(([r, y]) => new THREE.Vector2(r, y)), 18).rotateZ(Math.PI / 2), urethane, wx, -0.075, wz),   // a wheel, rounded at its edges
            part(new THREE.CylinderGeometry(0.0125, 0.0125, 0.036, 12).rotateZ(Math.PI / 2), white, wx, -0.075, wz),              // its core
            part(new THREE.CylinderGeometry(0.008, 0.008, 0.038, 10).rotateZ(Math.PI / 2), rubber, wx, -0.075, wz),               // the bearing's shield
            part(new THREE.CylinderGeometry(0.006, 0.006, 0.006, 6).rotateZ(Math.PI / 2), metal, wx + Math.sign(wx) * 0.021, -0.075, wz),   // the axle nut
          );
        }
      }
    }
    weld(deck);
    deck.scale.setScalar(1.35);   // slightly oversized so it reads from the chase camera
    this.board.add(deck);
    this.board.position.y = 0.142;
    this.tilt.add(this.board);

    // ---- Rider, standing side-on with bent knees ----
    this.rider = new THREE.Group();
    this.rider.position.y = 0.16;
    this.rider.rotation.y = -1.15;

    // Black skate shoe: white sole and side stripe, white laces. Origin at the bottom of the sole.
    // Everything he is made of is a smooth skin (the monsters' sculpting kit): no boxes, no seams between pieces.
    const skinned = (geo, material) => part(shape(geo), material);
    const round = (v, c, w, h, d, p = 0.5) => { const f = (x, a) => Math.sign(x) * a * Math.pow(Math.abs(x) / a, p); v.x = c[0] + f(v.x - c[0], w); v.y = c[1] + f(v.y - c[1], h); v.z = c[2] + f(v.z - c[2], d); };   // a ball, squared off a little
    const shoe = () => {
      const g = new THREE.Group();
      g.add(
        // The sole: a slab of white rubber, rounded at the toe and the heel.
        skinned(sculpt(lump(1, 0, [0, 0.015, 0], [0.0615, 0.015, 0.157], 20), (v) => { round(v, [0, 0.015, 0], 0.0615, 0.015, 0.157, 0.42); if (v.z > 0.09) v.x *= 1 - 0.25 * ((v.z - 0.09) / 0.07) ** 2; }), white),
        // The upper: low over the toes, rising to the tongue, padded round the ankle.
        skinned(sculpt(lump(1, 0, [0, 0.08, -0.004], [0.06, 0.06, 0.154], 22), (v) => {
          const t = (v.z + 0.157) / 0.304;                                  // 0 at the heel, 1 at the toe
          if (v.y < 0.026) v.y = 0.026;
          else v.y = 0.026 + (v.y - 0.026) * (t > 0.45 ? 1 - 0.62 * ((t - 0.45) / 0.55) ** 1.3 : 1 + 0.75 * (0.45 - t));
          if (t > 0.6) v.x *= 1 - 0.2 * ((t - 0.6) / 0.4) ** 2;
          v.x *= 1 - 0.12 * Math.max(0, (v.y - 0.1) / 0.1);                 // narrower at the ankle
        }), shoeCanvas),
        skinned(sculpt(lump(1, 0, [0, 0.044, 0.112], [0.057, 0.03, 0.046], 14), (v) => { if (v.y < 0.026) v.y = 0.026; }), white),   // the rubber toe cap
        skinned(lump(0.03, 0, [0, 0.094, 0.02], [1.0, 0.45, 2.2], 10), shoeCanvas),                                              // the tongue
        ...[0, 1, 2, 3].map((i) => skinned(skinTube([[-0.036, 0.083 + i * 0.006, 0.07 - i * 0.03], [0, 0.1 + i * 0.006, 0.066 - i * 0.03], [0.036, 0.083 + i * 0.006, 0.07 - i * 0.03]], [0.0045, 0.0045], 0, { sides: 5, steps: 3 }), white)),   // laces
        ...[-1, 1].map((sd) => skinned(skinTube([[sd * 0.058, 0.05, -0.13], [sd * 0.064, 0.075, -0.03], [sd * 0.057, 0.052, 0.07]], [0.005, 0.006, 0.004], 0, { sides: 5, steps: 4 }), white)),   // the stripe down each side
        skinned(new THREE.TorusGeometry(0.046, 0.016, 8, 18).rotateX(Math.PI / 2).scale(1, 1, 1.25).translate(0, 0.142, -0.075), shoeCanvas),   // the padded collar
        skinned(skinTube([[0, 0.14, -0.075], [0, 0.19, -0.07]], [0.043, 0.045], 0, { sides: 14, steps: 2 }), white),                           // a sock
      );
      return weld(g);
    };
    // Legs: cut loose, like the jeans a skater wears. They leave his hips a hip's width apart and run out to where his
    // feet are on the board (OUT further apart at the knee, and as much again at the foot). The cloth creases across the
    // front of the hip and behind the knee, and stacks up in folds where it sits on the shoe.
    const HIP = 0.094, OUT = 0.038;
    const links = (from, to, sag, out, count, R, r, material) => Array.from({ length: count }, (_, i) => {   // a chain, hanging between two places
      const t = (i + 0.5) / count, dip = Math.sin(t * Math.PI);
      return part(new THREE.TorusGeometry(R, r, 5, 9).rotateY(i % 2 ? Math.PI / 2 : 0).rotateX(0.6), material, from[0] + (to[0] - from[0]) * t + out[0] * dip, from[1] + (to[1] - from[1]) * t - sag * dip, from[2] + (to[2] - from[2]) * t + out[1] * dip);
    });
    const leg = (side) => {
      const group = new THREE.Group();
      group.position.set(side * HIP, 0.86, 0);
      const foot = shoe();
      foot.position.set(side * OUT, -0.445, 0.04);
      // The shin, cuff and foot hang off the knee, so the leg can bend (group.knee.rotation.x).
      const knee = (group.knee = new THREE.Group());
      knee.position.set(side * OUT, -0.42, 0.012);
      const shinMiddle = (y) => { const t = Math.max(0, Math.min(1, -y / 0.345)); return [side * OUT * t * t, -0.014 * t]; };
      knee.add(
        skinned(lump(0.086, 0, [0, 0.0, 0.004], [1, 1.1, 1.04], 20), denim),                                                             // the knee
        skinned(crease(loft([[side * OUT, -0.35, -0.012, 0.079, 0.082, 0.95], [side * OUT * 0.9, -0.3, -0.014, 0.076, 0.079, 0.95], [side * OUT * 0.55, -0.2, -0.014, 0.078, 0.082, 0.95], [side * OUT * 0.2, -0.08, -0.006, 0.082, 0.088, 0.95], [0, 0.03, 0, 0.084, 0.088, 0.95]], 28),
          shinMiddle, (v, a) => 0.085 * Math.sin(v.y * 150 + Math.sin(a * 2) * 1.5) * bell((v.y + 0.29) / 0.075) + 0.025 * Math.sin(a * 3 + v.y * 20) * bell((v.y + 0.12) / 0.1)), denim),   // the shin, stacked on the shoe
        skinned(new THREE.TorusGeometry(0.079, 0.007, 6, 28).rotateX(Math.PI / 2).scale(1, 1, 1.04), denim, side * OUT, -0.349, -0.012),   // the hem
        foot,
      );
      if (side > 0) knee.add(                                                                                                           // his front knee has gone through: skin, and the threads left across it
        skinned(lump(0.05, 0, [0, 0.004, 0.072], [0.95, 0.8, 0.32], 12), skin),
        ...[0, 1, 2, 3, 4].map((i) => skinned(skinTube([[-0.046, -0.026 + i * 0.014, 0.078], [0, -0.024 + i * 0.014, 0.09], [0.046, -0.026 + i * 0.014, 0.078]], [0.0022, 0.0022], 0, { sides: 4, steps: 3 }), white)));
      weld(knee);
      const thighMiddle = (y) => { const t = Math.max(0, Math.min(1, -y / 0.42)); return [side * OUT * t * t, 0.004 + 0.016 * Math.sin(t * Math.PI)]; };
      group.add(
        skinned(crease(loft([[side * OUT, -0.43, 0.012, 0.084, 0.088, 0.95], [side * OUT * 0.62, -0.31, 0.017, 0.09, 0.094, 0.95], [side * OUT * 0.3, -0.19, 0.02, 0.098, 0.102, 0.95], [side * 0.004, -0.06, 0.014, 0.103, 0.107, 0.95], [0, 0.05, 0.004, 0.1, 0.104, 0.95]], 30),
          thighMiddle, (v, a) => 0.03 * Math.sin(v.y * 110 + a) * bell((v.y + 0.06) / 0.06) * Math.max(0, Math.sin(a)) + 0.035 * Math.sin(v.y * 120) * bell((v.y + 0.38) / 0.05) * Math.max(0, -Math.sin(a)) + 0.012 * Math.sin(a * 4 + v.y * 14)), denim),   // the thigh
        skinned(skinTube([[side * 0.1, 0.03, 0.004], [side * 0.106, -0.12, 0.014], [side * 0.112, -0.28, 0.016], [side * (OUT + 0.083), -0.42, 0.012]], [0.0035, 0.0035], 0, { sides: 5, steps: 6 }), denim),   // the seam down the outside
        knee,
      );
      return group;
    };
    this.backLeg = leg(-1);   // swings for the kick-push
    this.frontLeg = leg(1);

    this.torso = new THREE.Group();
    this.torso.position.y = 0.86;
    const flat = (mesh) => { mesh.scale.z = 0.73; return mesh; };   // bodies are wider than they are deep
    // Left arm: hangs from the shoulder (this.leftArm.rotation swings it), and bends at the elbow (this.leftFore.rotation.x).
    // A sleeve: loose, creased where the arm bends and bunched up above the cuff. along: which way it runs (the arm's own axis).
    const sleeve = (points, radii, folds = null) => { const g = skinTube(points, radii, 0, { sides: 20, steps: 6 }); return part(shape(folds ? sculpt(g, folds) : g), hoodie); };
    const fingers = (W, toward, size, o, turn = 0) => fineHand(W, toward, size, SKIN, o).map((g) => part(shape(turn ? g.rotateZ(turn) : g), skin));
    const upperL = sleeve([[0.01, 0.03, 0], [-0.012, -0.08, 0], [-0.026, -0.18, 0], [-0.035, -UPPER, 0]], [0.096, 0.092, 0.082, 0.076],
      (v) => { const k = 1 + 0.07 * Math.sin(v.y * 130) * bell((v.y + 0.23) / 0.06) + 0.03 * Math.sin(v.y * 60 + v.z * 40); v.x = -0.03 + (v.x + 0.03) * k; v.z *= k; });
    const capL = part(new THREE.SphereGeometry(0.092, 20, 16), hoodie, 0.014, -0.004, 0);
    this.leftFore = new THREE.Group();
    this.leftFore.position.set(-0.035, -UPPER, 0);
    this.leftFore.rotation.x = -0.3;
    this.leftFore.add(
      part(new THREE.SphereGeometry(0.078, 18, 14), hoodie),                                                        // elbow
      sleeve([[0, 0.01, 0], [0, -0.09, 0.004], [0, -0.16, 0.007], [0, -0.2, 0.008]], [0.076, 0.074, 0.078, 0.058],
        (v) => { const k = 1 + 0.08 * Math.sin(v.y * 150) * bell((v.y + 0.15) / 0.05) + 0.06 * Math.sin(v.y * 140) * bell(v.y / 0.05); v.x *= k; v.z = 0.006 + (v.z - 0.006) * k; }),
      part(shape(skinTube([[0, -0.19, 0.008], [0, -0.25, 0.01]], [0.053, 0.05], 0, { sides: 12, steps: 2 })), hoodieRib),   // cuff
      ...fingers([0, -0.245, 0.01], [0, -1, 0.12], 0.08, { curl: 0.55, thumb: 1 }),
      part(new THREE.TorusGeometry(0.047, 0.012, 6, 14).rotateX(Math.PI / 2), leather, 0, -0.262, 0.01), part(new THREE.CylinderGeometry(0.02, 0.02, 0.012, 10).rotateZ(Math.PI / 2), metal, -0.05, -0.262, 0.01),   // a watch
    );
    weld(this.leftFore);
    this.leftArm = new THREE.Group();
    this.leftArm.position.set(-SHOULDER.x, SHOULDER.y, SHOULDER.z);
    this.leftArm.add(upperL, capL, this.leftFore);
    this.offArm = [upperL, capL, this.leftFore];   // hidden while that hand is on a two-handed gun
    // A bone-white skull stencilled on the back of the hoodie (the side the camera sees most).
    const emblem = part(new THREE.CircleGeometry(0.105, 28), new THREE.MeshStandardMaterial({ map: emblemTexture(), transparent: true, roughness: 0.9 }), 0, 0.4, -0.157);
    emblem.rotation.y = Math.PI;
    emblem.castShadow = false;
    // Hood, up: a shell round the head, open at the face and underneath. It is big enough to have the beanie inside it.
    const hood = part(new THREE.SphereGeometry(0.2, 32, 22, Math.PI / 2 + 0.72, TAU - 1.44, 0, 2.3), hoodie, 0, 0.8, 0.0);
    hood.scale.set(1, 1.08, 1.1);
    hood.add(part(new THREE.TorusGeometry(0.136, 0.015, 10, 36), hoodie, 0, 0.002, 0.15));   // the rolled edge round his face
    // The beanie: pulled down, its edge rolled up once.
    const brim = part(new THREE.TorusGeometry(0.126, 0.02, 10, 32).rotateX(Math.PI / 2), beanie, 0, 0.858, 0.0);
    this.hood = hood;
    const gold = std(0xd9b04a, 0.3, { metalness: 0.7 }), red = std(0xb3261e, 0.85);
    // What only shows when it is his own head on his shoulders (no helmet, no alien's): a gold chain with a tag on it, and
    // headphones hung round his neck.
    this.neckwear = new THREE.Group();
    this.neckwear.add(
      ...links([-0.078, 0.6, 0.128], [0.078, 0.6, 0.128], 0.135, [0, 0.036], 30, 0.0075, 0.0021, gold),                           // the chain: link by link, down onto his chest
      part(new THREE.TorusGeometry(0.008, 0.002, 5, 10), gold, 0, 0.456, 0.166),                                               // ...a ring on it...
      skinned(sculpt(lump(1, 0, [0, 0.426, 0.169], [0.014, 0.023, 0.0028], 12), (v) => round(v, [0, 0.426, 0.169], 0.014, 0.023, 0.0028, 0.35)), gold),   // ...and a dog tag
      // Headphones: the band round the back of his neck, over the hood; a cup resting on each collarbone.
      part(new THREE.TorusGeometry(0.168, 0.011, 8, 30, Math.PI * 1.12).rotateZ(Math.PI * 0.94 - Math.PI / 2).rotateX(Math.PI / 2 - 0.42), leather, 0, 0.67, -0.03),
      ...[-1, 1].flatMap((sd) => [
        part(new THREE.CylinderGeometry(0.047, 0.05, 0.03, 20).rotateX(Math.PI / 2).rotateY(sd * 0.75), leather, sd * 0.128, 0.605, 0.106),                  // the cup...
        part(new THREE.TorusGeometry(0.04, 0.012, 8, 20).rotateY(sd * 0.75), dark, sd * 0.117, 0.605, 0.094),                                                // ...its cushion...
        part(new THREE.CylinderGeometry(0.03, 0.03, 0.006, 16).rotateX(Math.PI / 2).rotateY(sd * 0.75), red, sd * 0.14, 0.605, 0.119),                       // ...the badge on its back...
        skinned(skinTube([[sd * 0.15, 0.66, 0.02], [sd * 0.16, 0.64, 0.07], [sd * 0.14, 0.62, 0.105]], [0.007, 0.007], 0, { sides: 6, steps: 4 }), metal),   // ...and the arm it slides on
      ]),
    );
    // Costumes: a holder on his head for a helmet or an alien's head, and one on his back for a pack (see applyLook).
    this.maskHolder = new THREE.Group();
    this.maskHolder.position.set(0, 0.8, 0);
    this.packHolder = new THREE.Group();
    this.packHolder.position.set(0, 0.37, -0.2);
    const centre = () => [0, 0];
    this.torso.add(
      // The top of his jeans, cut like jeans: waist, hips, down to the crotch. The thighs come out of the bottom of it.
      skinned(sculpt(loft([[0, -0.14, 0, 0.07, 0.06, 1], [0, -0.105, 0, 0.15, 0.1, 0.9], [0, -0.04, -0.004, 0.19, 0.126, 0.85], [0, 0.03, -0.002, 0.184, 0.12, 0.85], [0, 0.075, 0, 0.178, 0.114, 0.85], [0, 0.1, 0, 0.175, 0.111, 0.85]], 40), (v) => {
        if (v.z < 0) v.z -= 0.02 * bell((v.y + 0.045) / 0.07) * (0.72 + 0.28 * Math.cos((Math.abs(v.x) - 0.085) * 20));   // (the seat of them)
      }), denim),
      skinned(loft([[0, 0.066, 0, 0.181, 0.117, 0.85], [0, 0.07, 0, 0.184, 0.12, 0.85], [0, 0.102, 0, 0.181, 0.117, 0.85], [0, 0.106, 0, 0.177, 0.113, 0.85]], 40), denim),   // the waistband
      skinned(loft([[0, 0.071, 0, 0.186, 0.122, 0.85], [0, 0.074, 0, 0.19, 0.126, 0.85], [0, 0.097, 0, 0.19, 0.126, 0.85], [0, 0.1, 0, 0.186, 0.122, 0.85]], 40), leather),   // a belt through it...
      ...[0.5, 1.15, 1.9, 2.6, 4.71].map((a) => skinned(skinTube([[Math.cos(a) * 0.186, 0.064, Math.sin(a) * 0.122 * 1.03], [Math.cos(a) * 0.192, 0.086, Math.sin(a) * 0.128 * 1.03], [Math.cos(a) * 0.186, 0.108, Math.sin(a) * 0.122 * 1.03]], [0.007, 0.008, 0.007], 0, { sides: 6, steps: 3, squash: 0.5 }), denim)),   // ...and the loops that hold it
      part(new THREE.TorusGeometry(0.02, 0.0045, 6, 4).rotateZ(Math.PI / 4).scale(1.25, 1, 0.6), metal, 0, 0.086, 0.129), skinned(skinTube([[-0.02, 0.086, 0.131], [0.012, 0.086, 0.133]], [0.003, 0.002], 0, { sides: 5 }), metal),   // its buckle, and the prong
      skinned(skinTube([[0, 0.066, 0.118], [0.002, 0.0, 0.127], [0, -0.07, 0.112], [0, -0.115, 0.07]], [0.003, 0.0035, 0.003, 0.002], 0, { sides: 5, steps: 5 }), denim),   // the fly
      ...[-1, 1].flatMap((sd) => [
        skinned(skinTube([[sd * 0.07, 0.066, 0.112], [sd * 0.115, 0.03, 0.104], [sd * 0.165, 0.012, 0.062]], [0.003, 0.0035, 0.003], 0, { sides: 5, steps: 6 }), leather),   // the scoop of a front pocket...
        part(new THREE.SphereGeometry(0.0055, 8, 6), metal, sd * 0.07, 0.064, 0.114), part(new THREE.SphereGeometry(0.0055, 8, 6), metal, sd * 0.166, 0.012, 0.06),          // ...riveted at both ends
        // A back pocket: a patch sewn on, with a line of stitching across it.
        skinned(sculpt(lump(1, 0, [sd * 0.088, -0.03, -0.131], [0.052, 0.058, 0.007], 14), (v) => { round(v, [sd * 0.088, -0.03, -0.131], 0.052, 0.058, 0.007, 0.45); if (v.y < -0.06) v.x = sd * 0.088 + (v.x - sd * 0.088) * (1 - 0.5 * ((-0.06 - v.y) / 0.03)); v.z -= 0.012 * (1 - Math.abs(v.x - sd * 0.088) / 0.06); }), denim),
        skinned(skinTube([[sd * 0.04, -0.012, -0.146], [sd * 0.088, -0.03, -0.151], [sd * 0.136, -0.012, -0.146]], [0.002, 0.002], 0, { sides: 4, steps: 4 }), leather),
      ]),
      // A bandana, hanging out of his right back pocket: a folded corner of red cloth, white-spotted.
      skinned(sculpt(lump(1, 0, [0.088, -0.075, -0.152], [0.04, 0.075, 0.009], 14), (v) => { const t = Math.max(0, (-0.02 - v.y) / 0.13); v.x = 0.088 + (v.x - 0.088) * (1 - 0.92 * t); v.z += 0.008 * Math.sin(v.y * 70) - 0.02 * t; }), red),
      ...[[0.074, -0.03], [0.1, -0.035], [0.086, -0.062], [0.097, -0.085], [0.08, -0.095], [0.089, -0.122]].map(([bx, by]) => part(new THREE.SphereGeometry(0.0045, 6, 5).scale(1, 1, 0.4), white, bx, by, -0.1625 - 0.02 * Math.max(0, (-0.02 - by) / 0.13) + 0.008 * Math.sin(by * 70))),
      // A wallet chain: from a belt loop at the front, hanging down his right side, to the pocket behind.
      ...links([0.172, 0.062, 0.062], [0.132, -0.01, -0.118], 0.17, [0.045, -0.01], 20, 0.0095, 0.0026, metal),
      // The hoodie, cut loose: hem, the cloth blousing over it, chest, shoulders, neck. It creases toward the hem and
      // pulls in folds from the armpits.
      skinned(crease(loft([[0, 0.085, 0, 0.196, 0.142, 0.85], [0, 0.15, 0, 0.222, 0.166, 0.85], [0, 0.21, 0.002, 0.234, 0.176, 0.85], [0, 0.31, 0.004, 0.212, 0.155, 0.85], [0, 0.43, 0.008, 0.216, 0.154, 0.85], [0, 0.52, 0.004, 0.228, 0.142, 0.82], [0, 0.585, -0.002, 0.2, 0.122, 0.85], [0, 0.63, -0.006, 0.12, 0.1, 0.9], [0, 0.67, -0.008, 0.08, 0.078, 1]], 48),
        centre, (v, a) => 0.07 * Math.sin(a * 9 + v.y * 9) * bell((v.y - 0.2) / 0.08) + 0.06 * Math.sin(v.y * 40 + Math.abs(Math.cos(a)) * 6) * bell((v.y - 0.4) / 0.14) * Math.abs(Math.cos(a)) ** 2 + 0.035 * Math.sin(a * 3 + v.y * 16 + 1) * bell((v.y - 0.33) / 0.2)), hoodie),
      skinned(loft([[0, 0.066, 0, 0.196, 0.141, 0.85], [0, 0.072, 0, 0.202, 0.147, 0.85], [0, 0.135, 0, 0.206, 0.151, 0.85], [0, 0.142, 0, 0.2, 0.146, 0.85]], 48), hoodieRib),   // its ribbed hem
      // The pocket on the front: a pouch, open at both sides.
      skinned(sculpt(lump(1, 0, [0, 0.255, 0.146], [0.138, 0.072, 0.03], 20), (v) => { round(v, [0, 0.255, 0.146], 0.138, 0.072, 0.03, 0.55); if (v.y > 0.255) v.x *= 1 - 0.35 * ((v.y - 0.255) / 0.072); v.z -= 0.035 * (Math.abs(v.x) / 0.138) ** 2; }), hoodie),
      ...[-1, 1].map((sd) => skinned(skinTube([[sd * 0.092, 0.322, 0.158], [sd * 0.12, 0.262, 0.158], [sd * 0.136, 0.2, 0.146]], [0.006, 0.0085, 0.006], 0, { sides: 6, steps: 5 }), dark)),   // ...its two mouths
      // Drawstrings out of the hood, through an eyelet each, with a metal tag on the end.
      skinned(skinTube([[-0.045, 0.615, 0.118], [-0.049, 0.53, 0.156], [-0.052, 0.45, 0.163]], [0.0055, 0.0055], 0, { sides: 6, steps: 5 }), white), skinned(skinTube([[0.045, 0.615, 0.118], [0.049, 0.54, 0.156], [0.052, 0.48, 0.162]], [0.0055, 0.0055], 0, { sides: 6, steps: 5 }), white),
      tube(0.0075, 0.024, metal, -0.052, 0.439, 0.163), tube(0.0075, 0.024, metal, 0.052, 0.469, 0.162),
      part(new THREE.TorusGeometry(0.009, 0.003, 5, 12).rotateX(0.5), metal, -0.045, 0.612, 0.121), part(new THREE.TorusGeometry(0.009, 0.003, 5, 12).rotateX(0.5), metal, 0.045, 0.612, 0.121),
      this.leftArm, emblem, this.maskHolder, this.packHolder,
      skinned(lump(1, 0, [0, 0.63, -0.045], [0.175, 0.085, 0.16], 22), hoodie),                                                // the hood, gathered at his neck
      skinned(skinTube([[0, 0.6, 0.005], [0, 0.7, 0.01]], [0.066, 0.06], 0, { sides: 16, steps: 2 }), skin),                   // neck
      // The head: a jaw, cheekbones, a brow, hollows for the eyes. And a plain face on it.
      skinned(sculpt(lump(0.125, 0, [0, 0.8, 0], [0.96, 1.06, 1], 30), (v) => {
        if (v.y < 0.775) v.x *= 1 - 1.5 * (0.775 - v.y);
        dent(v, [-0.045, 0.806, 0.125], 0.03, 0.006); dent(v, [0.045, 0.806, 0.125], 0.03, 0.006);
        dent(v, [0, 0.69, 0.1], 0.05, -0.012);
        dent(v, [-0.085, 0.76, 0.085], 0.04, 0.006, [1, 0, -0.4]); dent(v, [0.085, 0.76, 0.085], 0.04, 0.006, [-1, 0, -0.4]);
      }), skin),
      (this.beanieDome = part(new THREE.SphereGeometry(0.134, 28, 14, 0, TAU, 0, Math.PI / 2 + 0.1), beanie, 0, 0.852, 0.0)),   // beanie...
      (this.hair = part(new THREE.SphereGeometry(0.131, 24, 12, 0, TAU, 0, Math.PI / 2), dark, 0, 0.815, -0.004)),               // (his hair, for when he isn't wearing one)
      (this.brim = brim),                                                                                                       // ...with its rolled edge
      ...[-1, 1].flatMap((sd) => [
        part(new THREE.SphereGeometry(0.0105, 12, 10).scale(1.15, 1, 0.6), dark, sd * 0.044, 0.804, 0.1135),                    // eyes: small and dark
        skinned(skinTube([[sd * 0.024, 0.823, 0.118], [sd * 0.046, 0.829, 0.114], [sd * 0.066, 0.824, 0.103]], [0.0035, 0.005, 0.003], 0, { sides: 6, steps: 4 }), dark),   // a brow over each
        skinned(lump(0.024, 0, [sd * 0.122, 0.796, 0.0], [0.45, 1, 0.8], 12), skin),                                            // ears
      ]),
      skinned(skinTube([[0, 0.812, 0.119], [0, 0.787, 0.137], [0, 0.773, 0.126]], [0.01, 0.0165, 0.013], 0, { sides: 10, steps: 4 }), skin),   // nose
      skinned(skinTube([[-0.024, 0.75, 0.113], [0, 0.748, 0.121], [0.024, 0.75, 0.113]], [0.003, 0.0042, 0.003], 0, { sides: 6, steps: 4 }), dark),   // mouth
      part(new THREE.TorusGeometry(0.011, 0.003, 6, 12).rotateY(Math.PI / 2), gold, -0.126, 0.774, 0.004),                      // a ring in one ear
      part(new THREE.SphereGeometry(0.129, 24, 10, Math.PI / 2 + 1.05, TAU - 2.1, 1.15, 0.6), dark, 0, 0.8, -0.004),                                    // hair showing under the beanie, round the back and sides
      this.neckwear,
      hood,
    );
    // His head is in proportion to a grown man's body (a little under an eighth of his height), which is smaller than the
    // one all of this was first built round: so everything above the neck goes in a holder, and the holder is scaled.
    this.head = new THREE.Group();
    this.head.position.set(0, 0.69, 0);
    this.head.scale.setScalar(0.9);
    const headIn = (this.headIn = new THREE.Group());
    headIn.position.set(0, -0.69, 0);
    this.head.add(headIn);
    for (const m of [...this.torso.children]) {
      if (m === this.maskHolder) { headIn.add(m); continue; }
      if (!m.isMesh) continue;
      m.geometry.computeBoundingBox();
      const b = m.geometry.boundingBox;
      if ((b.min.y + b.max.y) / 2 * m.scale.y + m.position.y > 0.72) headIn.add(m);
    }
    weld(headIn, [hood, brim, this.beanieDome, this.hair]);   // (those come and go with what he wears)
    weld(this.torso, [this.neckwear]);
    this.torso.add(this.head);

    // Cigarette, with a glowing tip. (Smoke puffs are made in updateSmoke.)
    const paper = std(0xf2efe6, 0.9), filter = std(0xc98a4b, 0.9);
    const cig = new THREE.Group();
    cig.position.set(0, 0.75, 0.112);
    cig.rotation.set(0.16, 0, 0);   // straight out of the middle of his mouth, drooping a little
    // (Cosmetics can swap the cigarette for a lollipop or a toothpick: all three sit in the same spot.)
    this.mouth = {
      cigarette: [
        part(new THREE.CylinderGeometry(0.011, 0.011, 0.11, 8).rotateX(Math.PI / 2), paper, 0, 0, 0.075),
        part(new THREE.CylinderGeometry(0.0115, 0.0115, 0.04, 8).rotateX(Math.PI / 2), filter, 0, 0, 0.01),
      ],
      lollipop: [
        part(new THREE.CylinderGeometry(0.005, 0.005, 0.1, 6).rotateX(Math.PI / 2), paper, 0, 0, 0.05),
        part(new THREE.SphereGeometry(0.03, 12, 10), std(0xe8336d, 0.25), 0, 0, 0.115),
      ],
      toothpick: [part(new THREE.CylinderGeometry(0.003, 0.0045, 0.12, 5).rotateX(Math.PI / 2), wood, 0, 0, 0.06)],
      nothing: [],
      pipe: [   // a briar pipe (it smokes)
        part(new THREE.CylinderGeometry(0.007, 0.009, 0.09, 6).rotateX(Math.PI / 2), std(0x1c1410, 0.5), 0, 0, 0.045),
        part(new THREE.CylinderGeometry(0.024, 0.018, 0.045, 10), std(0x4a2a16, 0.55), 0, 0.012, 0.1),
        part(new THREE.CylinderGeometry(0.019, 0.019, 0.006, 10), std(0x100c0a, 0.9), 0, 0.036, 0.1),
      ],
      rose: [   // held between his teeth by the stem
        part(new THREE.CylinderGeometry(0.004, 0.004, 0.15, 5).rotateX(Math.PI / 2), std(0x2f6a35, 0.7), 0, 0, 0.07),
        part(new THREE.SphereGeometry(0.03, 10, 8), std(0xb3101e, 0.5), 0, 0.004, 0.155),
        part(new THREE.SphereGeometry(0.018, 8, 6), std(0x7a0a14, 0.5), 0, 0.012, 0.165),
        part(new THREE.SphereGeometry(0.014, 6, 5).scale(1, 0.4, 1.6), std(0x2f6a35, 0.7), 0.012, 0, 0.09),
      ],
      bone: [
        part(new THREE.CylinderGeometry(0.006, 0.006, 0.11, 6).rotateX(Math.PI / 2), std(0xd8d2bf, 0.6), 0, 0, 0.06),
        part(new THREE.SphereGeometry(0.011, 6, 5), std(0xd8d2bf, 0.6), 0, 0, 0.118), part(new THREE.SphereGeometry(0.011, 6, 5), std(0xd8d2bf, 0.6), 0, 0, 0.004),
      ],
      // His last one, snapped in the middle and smoked anyway: the far half hangs. (broken: in the ending.
      // goldbroken: the same in gold, the prize for finishing the game.)
      ...Object.fromEntries([['broken', paper, filter], ['goldbroken', std(0xffc233, 0.3), std(0xb8860b, 0.3)]].map(([kind, stick, butt]) => [kind, [
        part(new THREE.CylinderGeometry(0.011, 0.011, 0.045, 8).rotateX(Math.PI / 2), stick, 0, 0, 0.0525),
        part(new THREE.CylinderGeometry(0.011, 0.011, 0.055, 8).rotateX(Math.PI / 2 + 0.75), stick, 0, -0.0187, 0.095),
        part(new THREE.CylinderGeometry(0.0115, 0.0115, 0.04, 8).rotateX(Math.PI / 2), butt, 0, 0, 0.01),
      ]])),
      cigar: [   // (a casino prize)
        part(new THREE.CylinderGeometry(0.019, 0.017, 0.125, 10).rotateX(Math.PI / 2), std(0x4a2e18, 0.8), 0, 0, 0.068),
        part(new THREE.CylinderGeometry(0.0195, 0.0195, 0.018, 10).rotateX(Math.PI / 2), std(0xd9b24a, 0.35), 0, 0, 0.04),
      ],
    };
    cig.add(...Object.values(this.mouth).flat());
    this.smoking = true;   // false when it isn't a cigarette: no ember, no smoke trail
    this.ember = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff6a1a, toneMapped: false }));
    this.ember.position.z = 0.132;
    cig.add(this.ember);
    headIn.add(cig);
    this.cig = cig;
    // The boof itself is modelled in Blender (a hand-rolled joint: tools/build_guns.py, in public/models/guns.glb), and
    // takes the place of the built one when the file arrives: whole, snapped (his last one), and snapped in gold.
    realGuns().then((scene) => {
      if (!scene) return;
      const found = {};
      scene.traverse((o) => { const is = o.isMesh && o.name.match(/^(boof|boofbroken)_(Paper|Crutch|Ash)/); if (is) (found[is[1]] ||= []).push([is[2], o.geometry]); });
      const ash = std(0x4a4744, 1), gold = std(0xffc233, 0.3), goldDark = std(0xb8860b, 0.3);
      const swap = (kind, from, mats) => {
        if (!found[from]) return;
        const on = this.mouth[kind].some((m) => m.visible);
        for (const old of this.mouth[kind]) cig.remove(old);
        this.mouth[kind] = found[from].map(([finish, geometry]) => { const m = new THREE.Mesh(geometry, mats[finish]); m.castShadow = true; m.visible = on; cig.add(m); return m; });
      };
      swap('cigarette', 'boof', { Paper: paper, Crutch: filter, Ash: ash });
      swap('broken', 'boofbroken', { Paper: paper, Crutch: filter, Ash: ash });
      swap('goldbroken', 'boofbroken', { Paper: gold, Crutch: goldDark, Ash: goldDark });
      // (The snapped one's far half is turned up from the break: tools/build_guns.py. Its ember sits on the end of that.)
      this.realBoof = !!found.boofbroken;
      this.placeEmber();
    });

    const smokeTex = glowTexture();
    this.smoke = Array.from({ length: 70 }, () => {   // (enough for the big cloud after a HotBox)
      const puff = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: 0xb9bcc4, transparent: true, opacity: 0, depthWrite: false }));
      puff.visible = false;
      puff.userData = { life: 0, drift: new THREE.Vector3(), size: 1 };
      scene.add(puff);
      return puff;
    });
    this.nextPuff = 0;
    this.puffTimer = 0;
    this.time = 0;

    this.rider.add(this.backLeg, this.frontLeg, this.torso);
    this.tilt.add(this.rider);

    // ---- Gun arm: points along +Z of its own group, so we can aim it anywhere ----
    this.gunArm = new THREE.Group();
    this.gunArm.position.set(0.05, 1.6, 0.2);   // (his shoulder: kept there every frame by seatArm, however he is standing)
    this.foreArm = new THREE.Group();
    this.foreArm.position.set(0, 0, UPPER);
    this.foreArm.rotation.x = -0.35;
    const along = (points, radii, material, folds = null) => { const g = skinTube(points, radii, 0, { sides: 20, steps: 6 }); return part(shape(folds ? sculpt(g, folds) : g), material); };
    this.foreArm.add(
      part(new THREE.SphereGeometry(0.078, 18, 14), hoodie),                                                         // elbow
      along([[0, 0, -0.01], [0, 0, 0.09], [0, 0, 0.16], [0, 0, 0.2]], [0.076, 0.074, 0.078, 0.058], hoodie,
        (v) => { const k = 1 + 0.08 * Math.sin(v.z * 150) * bell((v.z - 0.15) / 0.05) + 0.06 * Math.sin(v.z * 140) * bell(v.z / 0.05); v.x *= k; v.y *= k; }),
      along([[0, 0, 0.19], [0, 0, 0.25]], [0.053, 0.05], hoodieRib),                                                 // cuff
      ...fineHand([0, 0, 0.245], [0, 0, 1], 0.08, SKIN, { curl: 1, thumb: 1 }).map((g) => part(shape(g.rotateZ(-Math.PI / 2)), skin)),   // a hand, closed round the grip
    );
    weld(this.foreArm);
    this.gunArm.add(part(new THREE.SphereGeometry(0.092, 20, 16), hoodie, 0, 0, 0.004), along([[0, 0, -0.03], [0, -0.004, 0.08], [0, -0.004, 0.18], [0, 0, UPPER]], [0.096, 0.092, 0.082, 0.076], hoodie,
      (v) => { const k = 1 + 0.07 * Math.sin(v.z * 130) * bell((v.z - 0.23) / 0.06) + 0.03 * Math.sin(v.z * 60 + v.x * 40); v.x *= k; v.y *= k; }), this.foreArm);
    // Wherever his torso has got to (leaning, crouched, turned), the arm hangs from its shoulder. (It is not part of
    // the torso, so that it can point anywhere whatever the rest of him is doing: so it is put there every time it is drawn.)
    const seat = () => this.seatArm(), arm = this.gunArm, update = arm.updateMatrixWorld;
    arm.updateMatrixWorld = function (force) { seat(); update.call(this, force); };
    // The guns (see gunModels.js): all built up front, one shown at a time. The hand holds them by the grip.
    this.guns = buildGuns(gunmetal);
    for (const id in this.guns) {
      const g = this.guns[id];
      weld(g.group);
      g.group.position.add(HAND).z -= UPPER;   // (in the forearm's space)
      g.group.visible = id === 'pistol';
      this.foreArm.add(g.group);
    }
    this.gun = this.guns.pistol;   // the one in his hand

    // Support arm for two-handed guns: reaches from the left shoulder to the
    // fore-end. It lives in the gun's space and is re-aimed every frame.
    this.supportArm = limb(0.058, 0.4, hoodie, 0, 0, 0);
    this.supportHand = part(new THREE.SphereGeometry(0.057, 10, 8), skin);
    this.supportArm.visible = this.supportHand.visible = false;
    this.gunArm.add(this.supportArm, this.supportHand);
    this.twoHanded = false;
    this.gunArm.quaternion.copy(REST);
    this.root.add(this.gunArm);
    this.muzzle = new THREE.Vector3();
    this.armed = 0;      // seconds the arm stays raised after the last shot
    this.recoil = 0;

    scene.add(this.root);
    this.lean = 0;
    this.grindPose = [0, 0, 0];   // the board's pose on a rail, eased toward one of GRIND_POSES
    this.crouch = 0;
    this.flip = 0;       // the flip angle being shown
    whenBody(() => attachBody(this));   // (his real body, once it has loaded: see kirkyBody.js)
    this.inhale = 0;     // 0..1: taking a long drag (the ember flares, no smoke escapes)
  }

  // aimPoint: world position under the crosshair. gunUp: aiming or firing right now.
  // hidden: don't draw him at all (looking down a scope).
  update(dt, skater, renderPos, aimPoint, gunUp, invulnerable = 0, hidden = false) {
    this.root.position.copy(renderPos);
    this.root.visible = !hidden && (invulnerable <= 0 || Math.floor(invulnerable * 12) % 2 === 0);   // blink after a hit

    // Orientation from the board's up + heading.
    z.copy(skater.fwd).addScaledVector(skater.up, -skater.fwd.dot(skater.up)).normalize();
    x.crossVectors(skater.up, z);
    this.root.quaternion.setFromRotationMatrix(basis.makeBasis(x, skater.up, z));

    // Front / back flips: the whole of him turns over about his middle. Back on the
    // ground, whatever is left of the turn unwinds quickly.
    if (skater.flip !== 0) this.flip = skater.flip;
    else {
      this.flip = Math.atan2(Math.sin(this.flip), Math.cos(this.flip)) * Math.exp(-14 * dt);
      if (Math.abs(this.flip) < 0.01) this.flip = 0;
    }
    if (this.flip !== 0) {
      this.root.quaternion.multiply(flipQ.setFromAxisAngle(X_AXIS, this.flip));
      pivot.set(0, FLIP_PIVOT, 0).applyQuaternion(this.root.quaternion);
      this.root.position.addScaledVector(skater.up, FLIP_PIVOT).sub(pivot);
    }

    // Lean into carves, more at speed.
    const speed01 = Math.min(1, skater.speed / config.skate.maxSpeed);
    const leanTarget = skater.grounded ? -skater.steer * (0.15 + 0.5 * speed01) * (skater.drifting ? 1.5 : 1) : 0;
    this.lean += (leanTarget - this.lean) * (1 - Math.exp(-10 * dt));
    this.tilt.rotation.z = this.lean + (skater.grinding ? (skater.balance || 0) * 0.5 : 0);   // (on a rail: how far he is tipping)
    // A revert: he comes right round, quickly.
    this.rider.rotation.y = -1.15 + (skater.revertT < 0.32 ? Math.PI * 2 * (1 - ease(skater.revertT / 0.32)) : 0);

    // Board tricks: the board flips under the feet while the rider tucks up.
    const trick = skater.trick, p = ease(skater.trickProgress);
    if (trick) this.board.rotation.set(trick.pitch * TAU * p, trick.yaw * TAU * p, trick.roll * TAU * p);
    this.air = skater.grounded || skater.grinding ? 0 : (this.air || 0) + dt;
    const pop = !trick && this.air > 0 && this.air < 0.36 ? Math.sin((Math.PI * this.air) / 0.36) : 0;   // (0 -> 1 -> 0 over the first third of a second in the air)
    if (!trick) this.board.rotation.set(this.grindPose[1] - 0.42 * pop, this.grindPose[0], 0);
    this.pop = pop;
    // On a rail: the grind he is holding.
    const pose = skater.manual ? MANUAL_POSE : GRIND_POSES[skater.grinding ? skater.grindStyle || 0 : 0], easing = 1 - Math.exp(-16 * dt);
    for (let i = 0; i < 3; i++) this.grindPose[i] += (pose[i] - this.grindPose[i]) * easing;
    this.tilt.position.x = this.grindPose[2];
    const tuck = trick ? Math.sin(skater.trickProgress * Math.PI) : 0;
    this.board.position.y = 0.142 + tuck * 0.12 + 0.05 * pop;
    this.tuck = tuck;
    // He rides with his knees bent, and crouches by bending them further (and tucks them up through a trick): the
    // thighs go forward, the shins back by twice as much, so his feet stay under him, and he sinks by what that costs.
    // (a skater's stance: low, knees well bent and out over his toes, weight over the middle of the board)
    const bend = 0.52 + 0.45 * this.crouch + 0.35 * tuck;
    this.frontLeg.rotation.x = this.backLeg.rotation.x = -bend;
    this.frontLeg.knee.rotation.x = this.backLeg.knee.rotation.x = 2 * bend;
    this.rider.position.y = 0.16 - (this.legLength ?? 0.865) * (1 - Math.cos(bend)) + tuck * 0.1;

    // Crouch: charging an ollie, mid-trick, or balancing on a rail.
    const crouchTarget = Math.max(skater.charge, skater.grinding ? 0.5 : 0, tuck * 0.5);
    this.crouch += (crouchTarget - this.crouch) * (1 - Math.exp(-18 * dt));
    this.torso.rotation.x = 0.3 + 0.3 * this.crouch + 0.12 * speed01;   // (leaning in over his knees, chest toward his toes)   // (he stands up straight: chest up, shoulders back)

    // Kick-push: back leg swings down and back.
    const k = Math.min(1, skater.sinceKick / (config.skate.kickInterval * 0.8));
    this.backLeg.rotation.z = -Math.sin(k * Math.PI) * 0.9;
    this.riding = performance.now();   // (he is on his board: his feet are kept on it, see kirkyBody.js)
    this.kick = skater.grounded ? k : 1;   // (0 -> 1 through a push; 1: both feet on the board)
    // He goes down into the push and leans over his front foot, and comes up out of it.
    this.rider.position.y -= 0.07 * Math.sin(this.kick * Math.PI);
    this.torso.rotation.x += 0.2 * Math.sin(this.kick * Math.PI);

    // His free arm: out from his side for balance, further the faster he goes; up when he is in the air; swinging
    // with the push; thrown the other way to a carve. (An emote, when one is playing, takes it over after this.)
    const air = skater.grounded ? 0 : 1, push = Math.sin(k * Math.PI);
    this.armOut ??= 0.3;
    this.armOut += (0.85 + 0.2 * speed01 + 0.45 * air + 0.3 * tuck - this.armOut) * (1 - Math.exp(-8 * dt));   // (his arms are out from his sides for balance all the time he is riding)
    this.leftArm.rotation.set(-0.25 * this.crouch - 0.2 * air + 0.5 * push + Math.sin(this.time * 2.1) * 0.04, 0, -this.armOut + this.lean * 0.6);
    this.leftFore.rotation.x = -(0.45 + 0.4 * this.crouch + 0.3 * air);
    this.updateArm(dt, aimPoint, gunUp);
    this.updateSmoke(dt);
  }

  // Put the gun arm on its shoulder. (Called whenever it is about to be drawn or measured.)
  seatArm() {
    this.torso.updateWorldMatrix(true, false);
    this.gunArm.position.copy(sPos.copy(SHOULDER).applyMatrix4(this.torso.matrixWorld).applyMatrix4(rootInv.copy(this.root.matrixWorld).invert()));
  }

  // Where his gun hand is, in the world.
  handWorld(out) {
    this.gunArm.updateWorldMatrix(true, true);
    return this.foreArm.localToWorld(out.set(0, 0.02, FORE + 0.04));
  }

  // Bend the gun arm so that its hand is at `point` (in the world): w of the way there from however it is now.
  // The elbow drops below the line from his shoulder to the place, as an elbow does.
  handTo(point, w = 1) {
    this.root.updateWorldMatrix(true, false);
    this.seatArm();
    this.gunArm.updateWorldMatrix(false, false);
    this.gunArm.getWorldPosition(sPos);
    const far = Math.max(Math.abs(UPPER - FORE) + 0.02, Math.min(UPPER + FORE - 0.005, aim.subVectors(point, sPos).length()));
    const bend = Math.PI - Math.acos((UPPER * UPPER + FORE * FORE - far * far) / (2 * UPPER * FORE)), lift = Math.acos((UPPER * UPPER + far * far - FORE * FORE) / (2 * UPPER * far));
    aim.normalize();
    ax.crossVectors(UP, aim);
    if (ax.lengthSq() < 1e-6) ax.set(1, 0, 0);
    ax.normalize();
    ay.crossVectors(aim, ax);                                            // (square to the line, on the upper side of it)
    az.copy(aim).multiplyScalar(Math.cos(lift)).addScaledVector(ay, -Math.sin(lift));   // the way the upper arm points: below the line
    ay.crossVectors(az, ax);
    qHand.setFromRotationMatrix(basis.makeBasis(ax, ay, az));
    this.gunArm.quaternion.slerp(qInv.setFromRotationMatrix(this.root.matrixWorld).invert().multiply(qHand), w);
    this.foreArm.rotation.x += (-bend - this.foreArm.rotation.x) * w;
  }

  // Blowing out a lungful: call every frame while he exhales. A thick cloud rolls out of his mouth.
  // big: how much bigger than a lungful (the Golden BOOF: a cloud).
  exhale(dt, big = 1) {
    this.blow = (this.blow || 0) + dt * 34;   // puffs per second
    this.torso.localToWorld(z.set(0, 0.8, 0));               // out from his head through the cigarette: the way he is facing
    this.ember.getWorldPosition(x).sub(z).setY(0).normalize();
    z.copy(x);
    while (this.blow >= 1) {
      this.blow -= 1;
      const puff = this.smoke[this.nextPuff++ % this.smoke.length];
      this.ember.getWorldPosition(puff.position);
      puff.position.y -= 0.02;
      puff.userData.life = 1;
      puff.userData.size = (2.2 + Math.random() * 1.6) * big;
      puff.userData.drift.set((Math.random() - 0.5) * 0.5 * big, 0.15 + Math.random() * 0.45, (Math.random() - 0.5) * 0.5 * big).addScaledVector(z, (0.7 + Math.random() * 0.9) * Math.sqrt(big));
      puff.material.color.set(big > 1 ? 0xc4b48c : 0xb9bcc4);
      puff.visible = true;
    }
  }

  // Gun arm: raised toward `aimPoint` while gunUp (and for a moment after), otherwise hanging.
  updateArm(dt, aimPoint, gunUp) {
    this.armed = gunUp ? 0.5 : Math.max(0, this.armed - dt);
    this.recoil *= Math.exp(-25 * dt);
    this.root.updateMatrixWorld();
    // (freeArm: a clip has all of him (the dance: his gun put away). Nothing here is to hold the gun arm.)
    if (this.freeArm) { this.gunArm.updateMatrixWorld(); return; }
    // Out straight to shoot (a little give in it for the kick); loose at his side otherwise. Both hands on a long gun: straight.
    // A long gun is held in to his body: his upper arm down along his ribs, his forearm (and the gun along it) out
    // at what he is shooting, so that his other hand can get to its fore-end.
    const tucked = this.twoHanded ? 1.25 : 0;
    const elbow = this.twoHanded ? tucked + this.recoil * 0.8 : this.armed > 0 && aimPoint ? 0.1 + this.recoil * 1.6 : 0.5 + 0.25 * this.crouch;
    qTuck.setFromAxisAngle(X_AXIS, tucked);
    this.foreArm.rotation.y = this.foreArm.rotation.z = 0;   // (whatever kept it out of his body last frame turned it: it bends at the elbow, and that is all)
    this.foreArm.rotation.x += (-elbow - this.foreArm.rotation.x) * (1 - Math.exp(-(this.armed > 0 ? 28 : 9) * dt));
    if (this.armed > 0 && aimPoint) {
      this.gunArm.getWorldPosition(local);
      local.subVectors(aimPoint, local).normalize();
      local.y += this.recoil;
      // (In his own space, and the right way up: the shortest turn from "ahead" to where he is aiming rolls the gun
      // over, and tucks his arm up instead of down, whenever that is back along the world's z: all the way down the
      // Long Way Down, for one.)
      local.normalize().applyQuaternion(qInv.copy(this.root.quaternion).invert());
      if (Math.abs(local.y) > 0.98) local.z += 0.2;
      qAim.setFromRotationMatrix(basis.lookAt(local, ORIGIN, UP));
      this.gunArm.quaternion.slerp(qAim.multiply(qTuck), 1 - Math.exp(-30 * dt));
    } else {
      this.gunArm.quaternion.slerp(this.twoHanded ? qInv.copy(REST_TWO_HANDED).multiply(qTuck) : REST, 1 - Math.exp(-8 * dt));
    }
    this.gunArm.updateMatrixWorld();

    // Second hand on the fore-end: stretch the support arm from the left shoulder to it.
    if (this.twoHanded) {
      this.gunArm.worldToLocal(this.torso.localToWorld(local.set(-0.27, 0.5, 0.04)));   // left shoulder, in the gun's space
      grip.copy(this.gun.support).add(HAND);
      this.supportHand.position.copy(grip);
      const reach = grip.sub(local).length();
      this.supportArm.position.copy(local).addScaledVector(grip, 0.5);
      this.supportArm.quaternion.setFromUnitVectors(UP, grip.divideScalar(reach));
      this.supportArm.scale.y = reach / 0.516;   // (0.516 = the arm's own length)
    }
    this.muzzle.copy(this.gun.muzzle).add(HAND);
    this.muzzle.z -= UPPER - (this.gripShift || 0);
    this.muzzle.applyMatrix4(this.foreArm.matrixWorld);
  }

  // Cigarette smoke: little puffs left hanging in the air behind you.
  updateSmoke(dt) {
    this.time += dt;
    this.ember.material.color.setScalar(1).multiply(EMBER).multiplyScalar(0.75 + 0.45 * Math.sin(this.time * 2.2) ** 2 + 5 * this.inhale);   // slow glow, flaring on a drag
    this.ember.scale.setScalar((this.emberSize ?? 1) * (1 + 0.8 * this.inhale));
    this.puffTimer -= dt;
    if (this.puffTimer <= 0 && this.root.visible && this.inhale <= 0 && this.smoking) {
      this.puffTimer = 0.11;
      const puff = this.smoke[this.nextPuff++ % this.smoke.length];
      this.ember.getWorldPosition(puff.position);
      puff.userData.life = 1;
      puff.userData.size = 1;
      puff.material.color.set(0xb9bcc4);
      puff.userData.drift.set((Math.random() - 0.5) * 0.3, 0.5 + Math.random() * 0.3, (Math.random() - 0.5) * 0.3);
      puff.visible = true;
    }
    for (const puff of this.smoke) {
      const u = puff.userData;
      if (u.life <= 0) continue;
      u.life -= dt / (u.size > 4.5 ? 1.6 : 2.2);   // (a big cloud thins sooner, or nothing is seen through it for a while)
      puff.position.addScaledVector(u.drift, dt);
      puff.scale.setScalar((0.06 + (1 - u.life) * 0.5) * u.size);
      puff.material.opacity = Math.max(0, u.life) * (u.size > 4.5 ? 0.48 : u.size > 1 ? 0.5 : 0.3);
      puff.visible = u.life > 0;
    }
  }

  // Hide or show the whole model (including any smoke still hanging about).
  setVisible(visible) {
    this.root.visible = visible;
    if (!visible) for (const puff of this.smoke) { puff.visible = false; puff.userData.life = 0; }
  }

  // Dress him. look: see currentLook() in systems/cosmetics.js.
  applyLook(look) {
    const M = this.mats, repaint = (material, texture) => { material.map?.dispose(); material.map = texture; material.needsUpdate = true; };
    // Costumes. The body: the hoodie becomes the suit, with a pack on his back, and perhaps another skin.
    // The head: a helmet or an alien's head goes on over his own (and nothing fits in his mouth).
    const body = COSTUMES[look.outfit], masked = !!COSTUMES[look.mask], hoodieColor = body ? body.suit : look.hoodie;
    if (hoodieColor !== this.shownHoodie) {
      this.shownHoodie = hoodieColor;
      repaint(M.hoodie, hoodieTexture(hoodieColor));
      repaint(M.hoodieRib, ribTexture(`#${new THREE.Color(hoodieColor).multiplyScalar(0.8).getHexString()}`));   // cuffs and hem a shade darker
    }
    M.skin.color.set(body?.skin ?? COSTUMES[look.mask]?.skin ?? 0xc99873);
    if (look.outfit !== this.look?.outfit) { this.packHolder.clear(); const pack = buildPack(look.outfit); if (pack) this.packHolder.add(pack); }
    if (look.mask !== this.look?.mask) { this.maskHolder.clear(); this.maskHolder.add(buildMask(look.mask)); }
    this.hood.visible = this.neckwear.visible = !masked;
    // (no beanies any more: the slot they were in is his hat's now, see kirkyBody.js)
    this.beanieDome.visible = this.brim.visible = false;
    this.hair.visible = !masked;
    if (look.deck !== this.look?.deck) {
      repaint(M.wood, look.deck === 'wood' ? null : deckTexture(look.deck));
      M.wood.color.set(look.deck === 'wood' ? 0x9a6a3c : 0xffffff);
    }
    M.urethane.color.set(look.wheels);
    // What is in his mouth shows whatever he has on his head: in a costume it moves to that head's mouth.
    const lips = masked ? mouthOf(look.mask) : null;
    const mouth = this.mouthAt || [0, 0.75, 0.112];   // (where his own mouth is)
    this.cig.position.set(lips ? lips[0] : mouth[0], lips ? 0.8 + lips[1] : mouth[1], lips ? lips[2] : mouth[2]);
    for (const kind in this.mouth) for (const piece of this.mouth[kind]) piece.visible = kind === look.smoke;
    const snapped = look.smoke === 'broken' || look.smoke === 'goldbroken';
    this.smoking = this.ember.visible = (look.smoke === 'cigarette' || look.smoke === 'cigar' || look.smoke === 'pipe' || snapped);
    this.placeEmber(look.smoke);
    this.emberSize = look.smoke === 'goldbroken' ? 0.9 : 1;   // (it fills the end of it: the snapped one is an open roll of paper there)
    this.look = { ...look };
    this.masked = masked;
    this.afterLook?.(masked);
    this.paintGun();   // (the gun may have gone gold)
  }

  // The gun in his hand is gold if he owns that finish for it (he holds a pistol until told otherwise).
  paintGun() {
    const gold = !!this.look?.goldGuns.has(this.def?.id || 'pistol'), metal = this.mats.gunmetal;
    metal.color.set(gold ? 0xffc233 : 0x1b1d21);
    metal.emissive.set(gold ? 0x5a3a00 : 0x000000);
    metal.roughness = gold ? 0.3 : 0.45;
  }

  // The ember: at the end of whatever he is smoking.
  placeEmber(smoke = this.look?.smoke) {
    const snapped = smoke === 'broken' || smoke === 'goldbroken';
    if (snapped && this.realBoof) this.ember.position.copy(SNAPPED_END);
    else this.ember.position.set(0, snapped ? -0.0375 : 0, snapped ? 0.117 : 0.132);
  }

  setWeapon(def) {
    this.def = def;
    this.paintGun();
    this.gun = this.guns[def.id] || this.guns.pistol;
    for (const id in this.guns) this.guns[id].group.visible = this.guns[id] === this.gun;
    this.twoHanded = !!def.twoHanded;
    this.supportArm.visible = this.supportHand.visible = this.twoHanded;
    for (const piece of this.offArm) piece.visible = !this.twoHanded;
    this.hideFigure?.();
  }

  onShot() { this.recoil = 0.25; }
}
