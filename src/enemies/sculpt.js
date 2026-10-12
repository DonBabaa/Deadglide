// A sculptor's kit for the detailed monster models. The plain kit in enemyModels.js makes things out of boxes, balls
// and rods; this one makes things that look grown, sewn or torn:
//   tube()     a limb, a torso, a tendon: a skin drawn through a run of points, as thick as you say at each one
//   lump()     a ball with enough faces to be pushed about
//   sculpt()   push the surface of anything about (dent an eye socket, pull out a brow)
//   rough()    crumple it: wrinkles in cloth, pits in rotten skin
//   dirty()    paint it: grime in the folds, a gradient of muck toward the ground, stains
//   sheet()    a hanging piece of cloth, wrapped part-way round something, with a ragged bottom edge
//   fineHand(), fineFoot()   fingers with knuckles and nails, toes
// Everything returns an indexed BufferGeometry with position, normal, uv and colour, so it merges with the plain kit's.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const PI = Math.PI;
const V = (p) => new THREE.Vector3(p[0], p[1], p[2]);
const smooth = (k) => { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); };

// Smooth noise in three dimensions, about -1..1. (The same place always gives the same number: that is what stops
// a seam opening where two edges of a surface meet.)
const hash = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return (s - Math.floor(s)) * 2 - 1; };
export function noise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), u = smooth(x - xi), v = smooth(y - yi), w = smooth(z - zi);
  const mix = (a, b, k) => a + (b - a) * k;
  return mix(
    mix(mix(hash(xi, yi, zi), hash(xi + 1, yi, zi), u), mix(hash(xi, yi + 1, zi), hash(xi + 1, yi + 1, zi), u), v),
    mix(mix(hash(xi, yi, zi + 1), hash(xi + 1, yi, zi + 1), u), mix(hash(xi, yi + 1, zi + 1), hash(xi + 1, yi + 1, zi + 1), u), v), w);
}

// Paint a geometry one colour (it can be painted over afterwards: see dirty()).
export function paint(geo, color) {
  const c = new THREE.Color(color), n = geo.attributes.position.count, colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

// A skin through a run of points.
//   points  [[x, y, z], ...]: where it goes (a smooth curve is drawn through them)
//   radii   how thick it is, spread evenly along it (any number of them: [0.05, 0.07, 0.04] is a forearm with a muscle)
//   o.sides   faces round it        o.steps   rings between one point and the next
//   o.squash  how deep it is compared to how wide (a torso is about 0.7)
//   o.arc     [from, sweep] in radians: only part of the way round (an open jacket). 3/2 PI is the front of an upright one.
//   o.caps    close the ends (not with an arc)
export function tube(points, radii, color, o = {}) {
  const { sides = 10, steps = 4, squash = 1, arc = null, caps = true, turn = 0 } = o;
  const curve = new THREE.CatmullRomCurve3(points.map(V), false, 'centripetal');
  const n = Math.max(1, (points.length - 1) * steps), ring = arc ? sides + 1 : sides;
  const thick = (u) => { if (radii.length === 1) return radii[0]; const f = u * (radii.length - 1), i = Math.min(radii.length - 2, Math.floor(f)); return radii[i] + (radii[i + 1] - radii[i]) * smooth(f - i); };
  const pos = [], uv = [], idx = [], P = new THREE.Vector3(), T = new THREE.Vector3(), B = new THREE.Vector3();
  let N = null;
  for (let j = 0; j <= n; j++) {
    const u = j / n;
    curve.getPoint(u, P);
    curve.getTangent(u, T).normalize();
    if (!N) N = Math.abs(T.x) > 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    N.addScaledVector(T, -N.dot(T)).normalize();   // (carried along the curve, so it does not twist)
    B.crossVectors(T, N).normalize();
    const r = thick(u);
    for (let i = 0; i < ring; i++) {
      const a = (arc ? arc[0] + (arc[1] * i) / sides : (i / sides) * PI * 2) + turn, x = Math.cos(a) * r, z = Math.sin(a) * r * squash;
      pos.push(P.x + N.x * x + B.x * z, P.y + N.y * x + B.y * z, P.z + N.z * x + B.z * z);
      uv.push(i / sides, u);
    }
  }
  for (let j = 0; j < n; j++) for (let i = 0; i < sides; i++) {
    const a = j * ring + i, b = j * ring + (arc ? i + 1 : (i + 1) % ring), c = a + ring, d = b + ring;
    idx.push(a, b, c, b, d, c);
  }
  if (caps && !arc) {
    for (const [at, first, flip] of [[0, 0, true], [1, n * ring, false]]) {
      curve.getPoint(at, P);
      const centre = pos.length / 3;
      pos.push(P.x, P.y, P.z);
      uv.push(0.5, at);
      for (let i = 0; i < sides; i++) { const a = first + i, b = first + ((i + 1) % ring); idx.push(centre, flip ? b : a, flip ? a : b); }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return paint(geo, color);
}

// A ball with enough faces to sculpt, squashed as you like, at a place.
export function lump(r, color, at = [0, 0, 0], scale = [1, 1, 1], fine = 12) {
  const geo = new THREE.SphereGeometry(r, fine, Math.max(6, Math.round(fine * 0.75))).scale(...scale).translate(...at);
  return paint(geo, color);
}

// Push every point of a surface about: fn(v) changes the Vector3 it is given.
export function sculpt(geo, fn) {
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); fn(v); p.setXYZ(i, v.x, v.y, v.z); }
  geo.computeVertexNormals();
  return geo;
}
// A dent (depth > 0) or a bump (depth < 0) round a point, along a direction.
export const dent = (v, at, radius, depth, dir = [0, 0, -1]) => {
  const d = Math.hypot(v.x - at[0], v.y - at[1], v.z - at[2]);
  if (d < radius) { const k = (1 - d / radius) ** 2 * depth; v.x += dir[0] * k; v.y += dir[1] * k; v.z += dir[2] * k; }
};

// Crumple a surface: every point moved in and out along its normal by noise. amount: how far (m). freq: how fine.
export function rough(geo, amount, freq = 18) {
  const p = geo.attributes.position, nrm = geo.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = (noise(x * freq, y * freq, z * freq) + 0.5 * noise(x * freq * 2.3, y * freq * 2.3, z * freq * 2.3)) * amount;
    p.setXYZ(i, x + nrm.getX(i) * k, y + nrm.getY(i) * k, z + nrm.getZ(i) * k);
  }
  geo.computeVertexNormals();
  return geo;
}

// Paint over what paint() did.
//   o.mottle  0..1: blotches of darker (and a little lighter)        o.freq   how fine they are
//   o.under   0..1: darker on faces that look at the ground (it reads as shadow in the folds)
//   o.muck    [height, strength, colour]: stained toward that colour below that height
//   o.stains  [[x, y, z, radius, colour, strength], ...]: blood, mostly
export function dirty(geo, o = {}) {
  const { mottle = 0.3, freq = 9, under = 0.35, muck = null, stains = [] } = o;
  const p = geo.attributes.position, nrm = geo.attributes.normal, col = geo.attributes.color, c = new THREE.Color(), s = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    c.fromBufferAttribute(col, i);
    const blotch = noise(x * freq, y * freq, z * freq) * 0.6 + noise(x * freq * 3.1, y * freq * 3.1, z * freq * 3.1) * 0.4;
    c.multiplyScalar(1 - mottle * Math.max(-0.35, blotch));
    c.multiplyScalar(1 - under * Math.max(0, -nrm.getY(i)));
    if (muck && y < muck[0]) c.lerp(s.set(muck[2]), muck[1] * smooth((muck[0] - y) / muck[0]));
    for (const [sx, sy, sz, r, colour, strength = 0.85] of stains) {
      const d = Math.hypot(x - sx, y - sy, z - sz) / r + noise(x * 40, y * 40, z * 40) * 0.25;
      if (d < 1) c.lerp(s.set(colour), strength * smooth((1 - d) * 2.2));
    }
    col.setXYZ(i, c.r, c.g, c.b);
  }
  return geo;
}

// A piece of cloth hanging part-way round an upright body.
//   centre [x, y, z] of the top of it     radius: of what it hangs round, [top, bottom]     from, sweep: the arc (see tube)
//   drop: how long it hangs               ragged: how torn its bottom edge is (m)          squash: as tube
export function sheet(centre, radius, from, sweep, drop, color, o = {}) {
  const { ragged = 0.04, squash = 1, across = 10, down = 6, lean = 0 } = o;
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= down; j++) for (let i = 0; i <= across; i++) {
    const a = from + (sweep * i) / across, k = j / down, r = radius[0] + (radius[1] - radius[0]) * k;
    const tear = j === down ? Math.abs(noise(i * 1.7, centre[0] * 9, centre[1] * 9)) * ragged + (i % 3 === 1 ? ragged * 0.8 : 0) : 0;
    pos.push(centre[0] + Math.cos(a) * r, centre[1] - drop * k + tear, centre[2] - Math.sin(a) * r * squash + lean * k);
    uv.push(i / across, k);
  }
  for (let j = 0; j < down; j++) for (let i = 0; i < across; i++) {
    const a = j * (across + 1) + i, b = a + 1, c = a + across + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return paint(geo, color);
}

// A hand on a wrist at W: a palm with knuckles, four fingers of three joints each, a thumb, and nails.
//   toward: the way the fingers point      size: the width of the palm      curl: 0 flat .. 1 a claw
//   thumb: -1 or 1, which side it is on    spread: how far apart the fingers are    c: { skin, joint, nail }
export function fineHand(W, toward, size, c, o = {}) {
  const { curl = 0.5, thumb = 1, spread = 1, missing = [] } = o;
  const f = V(toward).normalize(), up = Math.abs(f.y) > 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3().crossVectors(up, f).normalize(), back = new THREE.Vector3().crossVectors(f, side);
  const spot = (a, b, d) => [W[0] + f.x * a + side.x * b + back.x * d, W[1] + f.y * a + side.y * b + back.y * d, W[2] + f.z * a + side.z * b + back.z * d];
  const out = [];
  // The palm: a flattened lump, thicker at the heel, with the knuckles standing out of the back of it.
  const palm = new THREE.SphereGeometry(size * 0.58, 10, 8).scale(1, 0.36, 1.05).applyMatrix4(new THREE.Matrix4().makeBasis(side, back, f)).translate(...spot(size * 0.55, 0, 0));
  out.push(paint(palm, c.skin));
  const LENGTH = [0.82, 1, 0.94, 0.72];
  for (let i = 0; i < 4; i++) {
    const across = (i - 1.5) * size * 0.25 * spread, long = size * LENGTH[i], bend = curl * (0.8 + 0.12 * i);
    const k0 = spot(size * 1.02, across, size * 0.03), k1 = spot(size * 1.02 + long * 0.42, across * 1.08, -long * 0.16 * bend), k2 = spot(size * 1.02 + long * 0.72, across * 1.1, -long * 0.46 * bend), k3 = spot(size * 1.02 + long * 0.9, across * 1.1, -long * 0.82 * bend);
    out.push(paint(new THREE.SphereGeometry(size * 0.13, 7, 5).translate(...k0), c.joint));          // knuckle
    if (missing.includes(i)) { out.push(paint(new THREE.SphereGeometry(size * 0.1, 6, 4).translate(...spot(size * 1.12, across, 0)), c.nail)); continue; }   // (a stump)
    out.push(tube([k0, k1, k2, k3], [size * 0.115, size * 0.105, size * 0.1, size * 0.085, size * 0.06], c.skin, { sides: 6, steps: 2 }));
    out.push(paint(new THREE.SphereGeometry(size * 0.105, 6, 4).translate(...k1), c.joint), paint(new THREE.SphereGeometry(size * 0.095, 6, 4).translate(...k2), c.joint));
    out.push(paint(new THREE.SphereGeometry(size * 0.07, 6, 4).scale(1, 1, 1).translate(k3[0] + back.x * size * 0.03, k3[1] + back.y * size * 0.03, k3[2] + back.z * size * 0.03), c.nail));   // nail
  }
  const t0 = spot(size * 0.3, thumb * size * 0.46, 0), t1 = spot(size * 0.75, thumb * size * 0.8, -size * 0.1 * curl), t2 = spot(size * 1.15, thumb * size * 0.86, -size * 0.34 * curl);
  out.push(tube([t0, t1, t2], [size * 0.15, size * 0.12, size * 0.08], c.skin, { sides: 6, steps: 3 }), paint(new THREE.SphereGeometry(size * 0.12, 6, 4).translate(...t1), c.joint));
  return out;
}

// A bare foot on an ankle at A (the sole on the ground at y = A[1] - rise), pointing +z: heel, arch, ball, five toes.
export function fineFoot(A, long, c, rise = 0.07) {
  const [x, , z] = A, y = A[1] - rise, out = [];
  const body = sculpt(new THREE.SphereGeometry(long * 0.5, 12, 8).scale(0.4, 0.3, 1).translate(x, y + long * 0.15, z + long * 0.3), (v) => {
    if (v.y < y + 0.004) v.y = y + 0.004;                                   // flat underneath
    const k = (v.z - z) / long;
    if (k > 0.35) v.y -= (k - 0.35) * long * 0.12;                          // lower toward the toes
    if (k < 0.05) v.x = x + (v.x - x) * 0.8;                                // a narrower heel
  });
  out.push(paint(body, c.skin));
  out.push(paint(new THREE.SphereGeometry(long * 0.14, 7, 5).translate(x - long * 0.16, A[1] - rise * 0.2, z), c.joint), paint(new THREE.SphereGeometry(long * 0.13, 7, 5).translate(x + long * 0.16, A[1] - rise * 0.3, z), c.joint));   // ankle bones
  const WIDE = [0.06, 0.05, 0.046, 0.042, 0.038], OUT = [0.86, 0.9, 0.86, 0.8, 0.72];
  for (let i = 0; i < 5; i++) {
    const tx = x + (i - 2) * long * 0.085, tz = z + long * OUT[i];
    out.push(tube([[tx, y + long * 0.07, tz - long * 0.12], [tx, y + long * 0.055, tz], [tx, y + long * 0.03, tz + long * 0.07]], [long * WIDE[i], long * WIDE[i], long * WIDE[i] * 0.8], c.skin, { sides: 6, steps: 2 }));
    out.push(paint(new THREE.SphereGeometry(long * WIDE[i] * 0.7, 6, 4).scale(1, 0.5, 1).translate(tx, y + long * 0.06, tz + long * 0.045), c.nail));
  }
  return out;
}

// Several pieces made into one part of a monster: see enemyModels.js for what a part is.
export function part(pieces, pivot = [0, 0, 0], swing = [0, 0, 0], phase = 0) {
  const geometry = mergeGeometries(pieces);
  geometry.translate(-pivot[0], -pivot[1], -pivot[2]);
  return { geometry, pivot, swing, phase, glow: false };
}
// A box, turned and put somewhere.
export function slab(w, h, d, color, at, turn = [0, 0, 0]) {
  const geo = new THREE.BoxGeometry(w, h, d);
  if (turn[0]) geo.rotateX(turn[0]);
  if (turn[1]) geo.rotateY(turn[1]);
  if (turn[2]) geo.rotateZ(turn[2]);
  return paint(geo.translate(...at), color);
}
export const between = (A, B, k) => [A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k, A[2] + (B[2] - A[2]) * k];

// ---- Bones ----
// A long bone from A to B: a shaft that swells into a knob at each end.
export function boneShaft(A, B, r, color, knob = 1.6) {
  return tube([A, between(A, B, 0.1), between(A, B, 0.5), between(A, B, 0.9), B], [r * knob, r * 1.05, r * 0.85, r * 1.05, r * knob], color, { sides: 8, steps: 2 });
}
// A skull of radius r at `at`, facing +z, turned by `yaw`: a sculpted cranium with eye sockets, a nose hole, cheek
// arches and a row of top teeth; and a jaw with its own teeth, hanging open by `jaw` (radians).
// c: { bone, old, dark, teeth }. fine: how many faces round it (12 for one of a heap, 20 for a head).
export function fineSkull(r, c, o = {}) {
  const { at = [0, 0, 0], yaw = 0, jaw = 0.18, fine = 16, tilt = 0, upper = 8, lower = 6 } = o, out = [];
  const cranium = sculpt(new THREE.SphereGeometry(r, fine, Math.round(fine * 0.75)), (v) => {
    v.y *= 1.05; v.z *= 1.1;
    if (v.y < -0.1 * r) { const k = smooth((-0.1 * r - v.y) / (0.6 * r)); v.x *= 1 - 0.34 * k; v.z = v.z * (1 - 0.3 * k) + 0.16 * r * k; }   // the face narrows
    if (v.y < -0.62 * r) v.y = -0.62 * r - (v.y + 0.62 * r) * 0.08;                                                                           // and ends at the teeth
    dent(v, [-0.4 * r, 0.08 * r, 0.98 * r], 0.36 * r, 0.34 * r); dent(v, [0.4 * r, 0.08 * r, 0.98 * r], 0.36 * r, 0.34 * r);                   // sockets
    dent(v, [0, -0.3 * r, 1.08 * r], 0.2 * r, 0.24 * r);                                                                                      // the hole of the nose
    dent(v, [0, 0.36 * r, 1.0 * r], 0.6 * r, -0.07 * r);                                                                                      // brow
    dent(v, [-0.82 * r, -0.3 * r, 0.42 * r], 0.36 * r, 0.14 * r, [1, 0, 0]); dent(v, [0.82 * r, -0.3 * r, 0.42 * r], 0.36 * r, 0.14 * r, [-1, 0, 0]);   // the hollows of the cheeks
    dent(v, [0, 0.1 * r, -0.95 * r], 0.8 * r, -0.1 * r, [0, 0, -1]);                                                                          // the back of the head
  });
  out.push(dirty(paint(cranium, c.bone), { mottle: 0.28, freq: 9 / r, under: 0.5, stains: [[-0.4 * r, 0.08 * r, 0.72 * r, 0.3 * r, c.dark, 0.95], [0.4 * r, 0.08 * r, 0.72 * r, 0.3 * r, c.dark, 0.95], [0, -0.3 * r, 0.86 * r, 0.17 * r, c.dark, 0.95]] }));
  for (const s of [-1, 1]) out.push(tube([[s * 0.66 * r, -0.14 * r, 0.62 * r], [s * 0.86 * r, -0.16 * r, 0.34 * r], [s * 0.88 * r, -0.1 * r, 0.02 * r]], [0.07 * r, 0.06 * r, 0.07 * r], c.old, { sides: 6, steps: 2 }));   // cheek arches
  for (let i = 0; i < upper; i++) { const a = (i - (upper - 1) / 2) * (1.5 / upper); out.push(paint(new THREE.BoxGeometry(0.105 * r, 0.16 * r, 0.08 * r).rotateY(a).translate(Math.sin(a) * 0.5 * r, -0.68 * r, 0.42 * r + Math.cos(a) * 0.5 * r), c.teeth)); }
  // The jaw: built hanging from its hinge, then swung open.
  const hinge = [0, -0.4 * r, 0.0], jawBits = [];
  jawBits.push(dirty(paint(sculpt(new THREE.SphereGeometry(0.66 * r, Math.max(10, fine - 4), 8).scale(1.02, 0.4, 1.02).translate(0, -0.9 * r, 0.36 * r), (v) => { if (v.y > -0.84 * r) v.y = -0.84 * r; if (v.z < 0.1 * r) v.y += (0.1 * r - v.z) * 0.9; }), c.old), { mottle: 0.3, freq: 9 / r }));
  for (let i = 0; i < lower; i++) { const a = (i - (lower - 1) / 2) * (1.3 / lower); jawBits.push(paint(new THREE.BoxGeometry(0.1 * r, 0.14 * r, 0.075 * r).rotateY(a).translate(Math.sin(a) * 0.46 * r, -0.8 * r, 0.4 * r + Math.cos(a) * 0.46 * r), c.teeth)); }
  for (const g of jawBits) out.push(g.translate(-hinge[0], -hinge[1], -hinge[2]).rotateX(jaw).translate(...hinge));
  for (const g of out) { if (tilt) g.rotateX(tilt); if (yaw) g.rotateY(yaw); g.translate(...at); }
  return out;
}
// A rib cage round a spine: `pairs` ribs from the spine (at z = back) round to a breastbone (at z = front), widest
// in the middle; the vertebrae behind them; the breastbone. top, bottom: heights. wide: half its width at the widest.
export function ribCage(top, bottom, wide, back, front, pairs, c) {
  const out = [];
  for (let i = 0; i < pairs; i++) {
    const k = i / (pairs - 1), y = top + (bottom - top) * k, w = wide * (0.72 + 0.28 * Math.sin(k * PI * 0.9 + 0.25)), floating = k > 0.82;
    for (const s of [-1, 1]) out.push(tube([[s * 0.02, y + 0.012, back], [s * w * 0.8, y, back + (front - back) * 0.22], [s * w, y - 0.02, (back + front) / 2], [s * w * 0.72, y - 0.045, front - 0.02], ...(floating ? [] : [[s * 0.018, y - 0.03, front]])], [0.012, 0.011, 0.01, 0.009, 0.008], c.bone, { sides: 6, steps: 3 }));
  }
  const n = pairs + 5;
  for (let i = 0; i < n; i++) { const y = top + 0.05 + (bottom - 0.2 - top - 0.05) * (i / (n - 1)); out.push(paint(new THREE.SphereGeometry(0.03, 7, 5).scale(1, 0.55, 1).translate(0, y, back - 0.005 + 0.012 * Math.sin(i * 0.7)), i % 2 ? c.bone : c.old), paint(new THREE.BoxGeometry(0.014, 0.018, 0.05).translate(0, y, back - 0.04), c.old)); }
  out.push(tube([[0, top - 0.01, front + 0.004], [0, (top + bottom) / 2, front + 0.012], [0, bottom + (top - bottom) * 0.28, front]], [0.022, 0.026, 0.012], c.bone, { sides: 6, steps: 3, squash: 0.45 }));
  return out;
}
// A scatter of short spikes (hairs, bristles, thorns): spot(i) gives [base, tip, thickness] for each.
export function spikes(count, spot, color) {
  const out = [];
  for (let i = 0; i < count; i++) { const s = spot(i); if (s) out.push(tube([s[0], s[1]], [s[2], s[2] * 0.15], color, { sides: 4, steps: 1 })); }
  return out;
}
