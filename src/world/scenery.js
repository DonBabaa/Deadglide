// The scenery, in detail: everything in the world that is only drawn, never ridden. It is sculpted with the same kit
// as the monsters (enemies/sculpt.js) and painted point by point; chunkMesh.js draws it with a material that lays
// that paint over the stone texture, so one mesh can be stone, iron, wood and moss at once.
// Everything here returns bare geometry, made once and shared (or kept by size), with the ground at y = 0.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { tube, lump, sculpt, dent, rough, dirty, sheet, paint, slab, noise, boneShaft, fineSkull, spikes } from '../enemies/sculpt.js';

const PI = Math.PI;
const STONE = 0xd9d5ca, PALE = 0xece8dd, OLD = 0xb3ae9f, MOSS = 0x5f7a44, LICHEN = 0xa9a05a, SOOT = 0x3b3833, IRON = 0x2a2b2e, RUST = 0x6b3a22, WOOD = 0x5a3d26, GOLD = 0xc9a23a;

// ---- The kit's own additions ----
// The stone texture repeats every `tile` metres, whichever way a face looks.
function wrap(geo, tile = 2) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    if (ay >= ax && ay >= az) uv.setXY(i, p.getX(i) / tile, p.getZ(i) / tile);
    else if (ax >= az) uv.setXY(i, p.getZ(i) / tile, p.getY(i) / tile);
    else uv.setXY(i, p.getX(i) / tile, p.getY(i) / tile);
  }
  return geo;
}
// A block of stone, cut into cells small enough to weather. at: its centre.
const block = (w, h, d, color, at = [0, 0, 0], cell = 0, turn = [0, 0, 0]) => {
  const n = (s) => (cell ? Math.max(1, Math.min(12, Math.ceil(s / cell))) : 1);
  return paint(new THREE.BoxGeometry(w, h, d, n(w), n(h), n(d)).rotateX(turn[0]).rotateY(turn[1]).rotateZ(turn[2]).translate(...at), color);
};
// A flat outline ([[x, y], ...]) given depth along z, from z = 0. holes: outlines cut out of it.
function extrude(outline, depth, color, bevel = 0, holes = []) {
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 6 });
  return paint(mergeVertices(geo), color);
}
// The outline of a pointed arch, w wide and h tall, standing on y = 0. (Anticlockwise from bottom left.)
function arch(w, h, n = 7) {
  const s = Math.max(0, h - 0.866 * w), out = [[-w / 2, 0], [w / 2, 0]];
  for (let i = 0; i <= n; i++) { const a = (i / n) * (PI / 3); out.push([-w / 2 + w * Math.cos(a), s + w * Math.sin(a)]); }
  for (let i = n - 1; i >= 0; i--) { const a = (i / n) * (PI / 3); out.push([w / 2 - w * Math.cos(a), s + w * Math.sin(a)]); }
  return out;
}
const ring = (R, r, color, at, turn = [PI / 2, 0, 0], arc = PI * 2, around = 20) => paint(new THREE.TorusGeometry(R, r, 6, around, arc).rotateX(turn[0]).rotateY(turn[1]).rotateZ(turn[2]).translate(...at), color);
const turned = (profile, color, at = [0, 0, 0], around = 16) => paint(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), around).translate(...at), color);   // (turned on a lathe: [[radius, height], ...])
// The same thing on the other side (s = -1): mirrored in x, and turned the right way out again.
const side = (geo, s) => { if (s > 0) return geo; geo.scale(-1, 1, 1); const i = geo.index.array; for (let k = 0; k < i.length; k += 3) { const t = i[k]; i[k] = i[k + 1]; i[k + 1] = t; } geo.computeVertexNormals(); return geo; };
const move = (geo, at, turn = [0, 0, 0]) => geo.rotateX(turn[0]).rotateY(turn[1]).rotateZ(turn[2]).translate(...at);
// Years out of doors: chipped, blotched, dark underneath, green toward the ground and wherever the damp sits.
const weather = (geo, o = {}) => dirty(o.chip === 0 ? geo : rough(geo, o.chip ?? 0.012, o.grain ?? 5), { mottle: o.mottle ?? 0.35, freq: o.freq ?? 2.2, under: 0.45, muck: o.moss === 0 ? null : [o.moss ?? 0.6, 0.6, MOSS], stains: o.stains || [] });
const join = (pieces, tile = 2) => wrap(mergeGeometries(pieces), tile);
// Lines of lettering cut into a face: thin dark strips. at: the middle of the top line; across: [x, z] along the line.
const lettering = (lines, at, wide, across = [1, 0], gap = 0.09, color = SOOT) => Array.from({ length: lines }, (_, i) => {
  const w = wide * (0.55 + 0.45 * Math.abs(Math.sin(i * 2.7 + 1)));
  return slab(Math.abs(across[0]) * w + 0.012, 0.03, Math.abs(across[1]) * w + 0.012, color, [at[0], at[1] - i * gap, at[2]]);
});

// ---- The Cemetery ----

// Three headstones: a round-topped slab, a ringed cross, an obelisk. Each stands on y = 0, facing +z.
export function headstones() {
  const round = [[-0.4, 0], [0.4, 0], [0.4, 0.9], ...Array.from({ length: 9 }, (_, i) => { const a = ((i + 1) / 10) * PI; return [0.4 * Math.cos(a), 0.9 + 0.4 * Math.sin(a)]; }), [-0.4, 0.9]];
  const panel = round.map(([x, y]) => [x * 0.8, 0.14 + y * 0.82]);
  const slabStone = join([
    weather(sculpt(move(extrude(round, 0.16, STONE, 0.02), [0, 0, -0.08]), (v) => { dent(v, [0.36, 1.2, 0], 0.16, 0.07, [-0.7, -0.7, 0]); }), { moss: 0.5, stains: [[-0.25, 0.25, 0.1, 0.25, MOSS, 0.7], [0.2, 1.1, 0.1, 0.18, LICHEN, 0.6]] }),   // (with a corner knocked off)
    move(extrude(panel, 0.012, OLD), [0, 0, 0.1]),                                                              // the face it is cut into
    slab(0.05, 0.2, 0.014, SOOT, [0, 1.02, 0.115]), slab(0.15, 0.05, 0.014, SOOT, [0, 1.06, 0.115]),            // a cross...
    ...lettering(5, [0, 0.82, 0.115], 0.5),                                                                     // ...and who lies here
    weather(block(1.0, 0.16, 0.34, OLD, [0, 0.06, 0], 0.2), { moss: 0.3 }),                                     // its footing
    ...[-0.36, 0.36].map((x) => lump(0.07, MOSS, [x, 0.14, 0.12], [1.3, 0.5, 1], 6)),
  ], 1.2);
  const cross = join([
    weather(block(0.2, 1.75, 0.18, STONE, [0, 0.95, 0], 0.12), { moss: 0.5, stains: [[0.05, 0.5, 0.09, 0.2, LICHEN, 0.6]] }),   // the shaft
    weather(block(0.92, 0.2, 0.18, STONE, [0, 1.3, 0], 0.12), { moss: 0 }),                                     // the arms
    weather(ring(0.3, 0.05, OLD, [0, 1.3, 0], [0, 0, 0], PI * 2, 24), { moss: 0, chip: 0.006 }),                // the ring round where they meet
    lump(0.075, PALE, [0, 1.3, 0.09], [1, 1, 0.5], 8),                                                          // a boss in the middle...
    ...[[0, 1.72], [-0.36, 1.3], [0.36, 1.3], [0, 0.9]].map(([x, y]) => lump(0.04, OLD, [x, y, 0.09], [1, 1, 0.5], 6)),   // ...and one on each limb
    ...[0.62, 0.5, 0.38].map((y, i) => slab(0.1, 0.02, 0.012, SOOT, [0, y, 0.094 + i * 0])),
    weather(block(0.62, 0.2, 0.5, STONE, [0, 0.24, 0], 0.15), { moss: 0.3 }), weather(block(0.86, 0.16, 0.7, OLD, [0, 0.08, 0], 0.2), { moss: 0.3 }),   // two steps under it
  ], 1.2);
  const needle = paint(new THREE.CylinderGeometry(0.15, 0.31, 2.3, 4, 8).rotateY(PI / 4).translate(0, 1.75, 0), STONE);
  const obelisk = join([
    weather(needle, { moss: 0.9, stains: [[0.1, 1.2, 0.2, 0.3, LICHEN, 0.6], [-0.2, 2.2, -0.1, 0.25, SOOT, 0.5]] }),
    paint(new THREE.ConeGeometry(0.215, 0.32, 4).rotateY(PI / 4).translate(0, 3.06, 0), PALE),                  // its point
    weather(block(0.62, 0.36, 0.62, STONE, [0, 0.44, 0], 0.15), { moss: 0.5 }), weather(block(0.74, 0.1, 0.74, PALE, [0, 0.62, 0], 0.2), { moss: 0 }),   // a die...
    weather(block(0.84, 0.16, 0.84, OLD, [0, 0.2, 0], 0.2), { moss: 0.3 }), weather(block(1.0, 0.14, 1.0, STONE, [0, 0.06, 0], 0.25), { moss: 0.2 }),    // ...on two steps
    slab(0.4, 0.22, 0.014, SOOT, [0, 0.44, 0.315]), ...lettering(2, [0, 0.48, 0.322], 0.3, [1, 0], 0.07, OLD),  // a plate on the front
    ring(0.13, 0.03, MOSS, [0, 1.1, 0.25], [0.12, 0, 0], PI * 2, 14),                                           // a wreath, left a long time ago
    ...Array.from({ length: 8 }, (_, i) => lump(0.035, i % 2 ? MOSS : LICHEN, [Math.cos(i * 0.785) * 0.13, 1.1 + Math.sin(i * 0.785) * 0.13, 0.27], [1, 1, 0.6], 5)),
  ], 1.2);
  return [slabStone, cross, obelisk];
}

// A bare tree: roots, a trunk that keeps forking, twigs, a few rags of moss. rand: its dice. depth: how many times it forks.
export function tree(rand, depth = 5) {
  const BARK = 0x3a3129, DARK = 0x29221c, pieces = [], V = (v) => [v.x, v.y, v.z];
  const grow = (start, dir, len, r, depth) => {
    const end = start.clone().addScaledVector(dir, len), mid = start.clone().addScaledVector(dir, len * 0.5).add(new THREE.Vector3(rand() - 0.5, rand() * 0.3, rand() - 0.5).multiplyScalar(len * 0.2));
    pieces.push(tube([V(start), V(mid), V(end)], [r, r * 0.8, r * 0.62], depth % 2 ? BARK : DARK, { sides: depth > 3 ? 10 : depth > 1 ? 6 : 4, steps: depth > 2 ? 3 : 2, caps: depth === 0 }));
    if (depth > 2 && rand() < 0.6) pieces.push(lump(r * 0.5, DARK, V(mid.clone().add(new THREE.Vector3(rand() - 0.5, 0, rand() - 0.5).normalize().multiplyScalar(r * 0.7))), [1, 1.3, 1], 6));   // a knot
    if (depth === 0) { if (rand() < 0.22) pieces.push(tube([V(end), [end.x + 0.05, end.y - 0.5 - rand() * 0.6, end.z]], [0.012, 0.03, 0.004], MOSS, { sides: 3, steps: 2 })); return; }   // a rag of moss
    const forks = depth > 3 ? 2 : 2 + Math.floor(rand() * 2);
    for (let i = 0; i < forks; i++) {
      const bend = new THREE.Vector3(rand() - 0.5, rand() * 0.5 + 0.1, rand() - 0.5).normalize();
      grow(end, dir.clone().lerp(bend, 0.55).normalize(), len * (0.6 + rand() * 0.16), r * 0.62, depth - 1);
    }
    if (depth === 3 && rand() < 0.5) pieces.push(tube([V(mid), V(mid.clone().add(new THREE.Vector3(rand() - 0.5, 0.2, rand() - 0.5).multiplyScalar(0.9)))], [r * 0.45, r * 0.3], DARK, { sides: 5 }));   // a limb that broke off
  };
  grow(new THREE.Vector3(), new THREE.Vector3((rand() - 0.5) * 0.15, 1, (rand() - 0.5) * 0.15).normalize(), 3.6, 0.34, depth);
  for (let k = 0; k < 6; k++) { const a = k * 1.05 + rand() * 0.5, far = 1.0 + rand() * 0.7; pieces.push(tube([[0, 1.25, 0], [Math.cos(a) * 0.4, 0.7, Math.sin(a) * 0.4], [Math.cos(a) * far, 0.38, Math.sin(a) * far]], [0.2, 0.15, 0.04], k % 2 ? BARK : DARK, { sides: 6, steps: 3 })); }   // roots
  pieces.push(tube([[0.3, 2.0, 0.05], [0.36, 2.15, 0.05]], [0.13, 0.1], DARK, { sides: 7 }), lump(0.08, 0x0c0a08, [0.37, 2.15, 0.05], [0.5, 1, 1], 6));   // a hollow where a bough was
  return dirty(rough(mergeGeometries(pieces), 0.035, 3.5), { mottle: 0.45, freq: 2.5, under: 0.4, muck: [1.6, 0.5, MOSS] });
}

// A fluted column from y = 0 to `tall`, with a base and a capital.
function column(r, tall, at) {
  const shaft = sculpt(paint(new THREE.CylinderGeometry(r * 0.86, r, tall - r * 2, 20, 6), PALE), (v) => { const k = 1 - 0.07 * Math.abs(Math.sin(Math.atan2(v.z, v.x) * 10)); v.x *= k; v.z *= k; });
  return [
    weather(move(shaft, [at[0], tall / 2, at[1]]), { moss: 0.7, chip: 0.004 }),
    ring(r * 1.05, r * 0.2, OLD, [at[0], r * 0.55, at[1]]), block(r * 2.8, r * 0.4, r * 2.8, STONE, [at[0], r * 0.2, at[1]]),                     // base
    ring(r * 0.92, r * 0.14, OLD, [at[0], tall - r * 1.25, at[1]]), turned([[r * 0.88, 0], [r * 1.25, r * 0.5], [r * 1.25, r * 0.6]], STONE, [at[0], tall - r * 1.1, at[1]]),
    block(r * 2.9, r * 0.45, r * 2.9, STONE, [at[0], tall - r * 0.27, at[1]]),                                                                    // capital
  ];
}

// The trim of a tomb house l long, w wide and h tall (its plain walls are drawn by chunkMesh). The front is +x.
const tombs = new Map();
export function mausoleum(l, w, h) {
  const key = `${l.toFixed(1)}|${w.toFixed(1)}|${h.toFixed(1)}`;
  if (tombs.has(key)) return tombs.get(key);
  const f = l / 2, hw = w / 2, deep = 0.9, pieces = [];
  // The porch: four columns, a beam over them cut with teeth, a gable with a wreath in it.
  for (const z of [-hw + 0.35, -0.95, 0.95, hw - 0.35]) pieces.push(...column(0.2, h - 0.45, [f + deep - 0.3, z]));
  pieces.push(weather(block(deep + 0.3, 0.45, w + 0.5, STONE, [f + deep / 2 - 0.05, h - 0.22, 0], 0.4), { moss: 0 }));
  for (let z = -hw; z <= hw + 0.01; z += 0.3) pieces.push(block(0.1, 0.12, 0.16, PALE, [f + deep + 0.1, h - 0.38, z]));
  pieces.push(weather(move(extrude([[-hw - 0.3, 0], [hw + 0.3, 0], [0, w * 0.2]], deep + 0.4, STONE, 0.03), [f - 0.2, h, 0], [0, PI / 2, 0]), { moss: 0, stains: [[f + deep, h + 0.2, -hw * 0.5, 0.5, LICHEN, 0.5]] }));
  pieces.push(ring(Math.min(0.34, w * 0.05), 0.06, OLD, [f + deep + 0.24, h + w * 0.075, 0], [0, PI / 2, 0], PI * 2, 18));
  // The doorway: a stone frame, and a pair of iron doors in panels, studded, with a ring on each.
  pieces.push(block(0.24, 3.0, 0.3, PALE, [f + 0.1, 1.5, -0.95]), block(0.24, 3.0, 0.3, PALE, [f + 0.1, 1.5, 0.95]), block(0.3, 0.34, 2.5, PALE, [f + 0.12, 3.05, 0]), block(0.12, 0.28, 0.5, STONE, [f + 0.3, 3.05, 0]));
  for (const s of [-1, 1]) {
    pieces.push(block(0.08, 2.84, 0.78, IRON, [f + 0.06, 1.42, s * 0.4]));
    for (const y of [0.75, 2.05]) pieces.push(block(0.03, 1.0, 0.54, 0x1c1d20, [f + 0.105, y, s * 0.4]), block(0.02, 0.06, 0.7, RUST, [f + 0.12, y + 0.62, s * 0.4]));
    for (let k = 0; k < 6; k++) pieces.push(lump(0.03, 0x4a4b50, [f + 0.115, 0.3 + k * 0.48, s * 0.74], [0.6, 1, 1], 5));
    pieces.push(ring(0.09, 0.015, 0x6d6f76, [f + 0.14, 1.45, s * 0.12], [0, PI / 2, 0], PI * 2, 12), lump(0.03, 0x6d6f76, [f + 0.12, 1.54, s * 0.12], [1, 1, 1], 5));
  }
  pieces.push(slab(0.02, 0.26, 1.4, SOOT, [f + 0.28, 3.42, 0]), ...lettering(2, [f + 0.292, 3.47, 0], 1.1, [0, 1], 0.09, OLD));   // the family's name over the door
  // Three steps up to it, an urn at each corner of the roof, a cross on the gable.
  for (let k = 0; k < 3; k++) pieces.push(weather(block(deep + 0.5 + k * 0.32, 0.14, w + 0.4 + k * 0.3, k % 2 ? OLD : STONE, [f + (deep + 0.5 + k * 0.32) / 2 - 0.2, 0.31 - k * 0.14, 0], 0.5), { moss: 0.4 }));
  for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) pieces.push(turned([[0.02, 0], [0.16, 0.02], [0.08, 0.12], [0.2, 0.36], [0.22, 0.5], [0.12, 0.62], [0.15, 0.68], [0.02, 0.8]], OLD, [sx * (f - 0.25), h + 0.16, sz * (hw - 0.25)], 10));
  pieces.push(block(0.14, 1.0, 0.14, PALE, [f + deep, h + w * 0.2 + 0.4, 0]), block(0.14, 0.14, 0.62, PALE, [f + deep, h + w * 0.2 + 0.58, 0]));
  // Down the sides: a plinth, flat piers, a band under the roof. Up one corner: ivy.
  for (const s of [-1, 1]) {
    pieces.push(weather(block(l + 0.3, 0.5, 0.16, OLD, [0, 0.25, s * (hw + 0.06)], 0.5), { moss: 0.5 }), block(l + 0.2, 0.2, 0.14, PALE, [0, h - 0.6, s * (hw + 0.05)]));
    for (let x = -f + 0.4; x < f; x += 2.2) pieces.push(weather(block(0.4, h - 0.6, 0.14, STONE, [x, h / 2 - 0.1, s * (hw + 0.05)], 0.4), { moss: 0.8 }));
  }
  pieces.push(weather(block(0.16, 0.5, w + 0.3, OLD, [-f - 0.06, 0.25, 0], 0.5), { moss: 0.5 }));
  for (let k = 0; k < 4; k++) pieces.push(tube([[f - 0.6 - k * 0.5, 0, hw + 0.14], [f - 0.9 - k * 0.4, h * 0.4, hw + 0.15], [f - 0.5 - k * 0.7, h * (0.6 + 0.1 * k), hw + 0.15]], [0.03, 0.02, 0.008], 0x2f3a22, { sides: 4, steps: 4 }));
  for (let k = 0; k < 46; k++) { const t = noise(k * 0.7, 3, 1) * 0.5 + 0.5, u = noise(k * 1.3, 9, 4) * 0.5 + 0.5; pieces.push(lump(0.1, k % 3 ? 0x3d5a2a : 0x54703a, [f - 0.3 - t * 2.4, 0.2 + u * h * 0.75, hw + 0.17], [1, 1.2, 0.25], 5)); }
  const geo = join(pieces, 2);
  geo.userData.shared = true;
  tombs.set(key, geo);
  return geo;
}

// What stands on a monument's pedestal (its top is at y = 1.6), and the mouldings round the pedestal. 0: an angel; 1: a tall cross; 2: an urn.
export function statues() {
  const pedestal = () => [
    weather(block(1.76, 0.14, 1.76, PALE, [0, 0.37, 0], 0.3), { moss: 0.3 }), weather(block(1.84, 0.16, 1.84, PALE, [0, 1.53, 0], 0.3), { moss: 0 }), block(1.7, 0.08, 1.7, OLD, [0, 1.42, 0]),
    ...[[1, 0], [0, 1], [-1, 0], [0, -1]].flatMap(([x, z]) => [slab(x ? 0.02 : 0.9, 0.6, z ? 0.02 : 0.9, SOOT, [x * 0.805, 0.92, z * 0.805]), ...lettering(4, [x * 0.818, 1.08, z * 0.818], 0.7, [Math.abs(z), Math.abs(x)], 0.1, OLD)]),
    ...[[-1, -1], [1, 1]].map(([x, z]) => lump(0.2, MOSS, [x * 0.8, 0.32, z * 0.8], [1, 0.5, 1], 6)),
  ];
  const folds = (geo, amount, top, low, count) => sculpt(geo, (v) => { const k = 1 + amount * Math.max(0, Math.min(1, (top - v.y) / (top - low))) * Math.sin(Math.atan2(v.z, v.x) * count + v.y * 4); v.x *= k; v.z *= k; });
  const marble = (g, stains = []) => weather(g, { moss: 0, chip: 0.006, grain: 9, stains: [[0, 3.2, -0.2, 0.5, SOOT, 0.35], ...stains] });
  // The angel: robed, head bowed over her joined hands, wings folded.
  const wing = (s) => [
    marble(tube([[s * 0.1, 3.15, -0.2], [s * 0.4, 3.75, -0.34], [s * 0.72, 3.5, -0.4], [s * 0.78, 2.7, -0.4]], [0.07, 0.08, 0.06, 0.03], PALE, { sides: 7, steps: 5, squash: 0.6 })),   // the bone of it
    ...[0, 1, 2].flatMap((row) => spikes(11 - row * 2, (i) => {
      const t = (i + 0.5) / (11 - row * 2), x = s * (0.14 + t * 0.62), top = 3.2 + Math.sin(t * PI * 0.9) * 0.5 - row * 0.12, long = (0.55 + t * 0.95) * (1 - row * 0.24);
      return [[x, top, -0.3 - row * 0.03 - t * 0.08], [x + s * 0.06, top - long, -0.36 - t * 0.1 - row * 0.02], 0.06];
    }, row % 2 ? STONE : PALE)),                                                                                  // three rows of feathers
  ];
  const angel = join([
    ...pedestal(),
    marble(folds(tube([[0, 1.6, 0], [0, 2.1, 0], [0, 2.7, 0.01], [0, 3.1, 0.03], [0, 3.3, 0.05]], [0.56, 0.44, 0.33, 0.27, 0.16], PALE, { sides: 26, steps: 5 }), 0.1, 3.0, 1.6, 11), [[0, 1.8, 0.3, 0.5, MOSS, 0.35]]),   // the robe
    marble(sheet([0, 3.24, 0.03], [0.24, 0.4], 0, PI * 2, 0.42, STONE, { ragged: 0.03, across: 22, down: 5 })),   // a mantle over the shoulders
    marble(sculpt(lump(0.19, PALE, [0, 3.5, 0.1], [0.92, 1.1, 1], 18), (v) => { dent(v, [-0.07, 3.52, 0.28], 0.06, 0.03); dent(v, [0.07, 3.52, 0.28], 0.06, 0.03); dent(v, [0, 3.46, 0.3], 0.05, -0.03); })),   // her face, bowed
    marble(paint(new THREE.SphereGeometry(0.21, 16, 10, 0, PI * 2, 0, 1.75).rotateX(-0.75).translate(0, 3.52, 0.07), STONE)),   // her hair...
    ...[-1, 1].map((s) => marble(tube([[s * 0.15, 3.5, 0], [s * 0.2, 3.25, -0.06], [s * 0.16, 3.0, -0.1]], [0.07, 0.06, 0.02], STONE, { sides: 6, steps: 4 }))),   // ...falling to her shoulders
    ...[-1, 1].flatMap((s) => [
      marble(tube([[s * 0.27, 3.2, 0.02], [s * 0.32, 2.86, 0.16], [s * 0.06, 2.98, 0.36]], [0.1, 0.11, 0.07], PALE, { sides: 10, steps: 5 })),   // arms, in wide sleeves
      marble(sheet([s * 0.19, 2.95, 0.26], [0.1, 0.14], 0, PI * 2, 0.3, STONE, { ragged: 0.04, across: 10, down: 3 })),
    ]),
    marble(lump(0.075, PALE, [0, 3.0, 0.4], [1, 1.3, 0.9], 10)),                                                  // her hands, joined
    ...wing(-1), ...wing(1),
  ], 1.5);
  // The cross: ringed, cut with a pattern, ivy up it.
  const cross = join([
    ...pedestal(),
    weather(block(0.34, 2.9, 0.3, STONE, [0, 3.05, 0], 0.2), { moss: 0, stains: [[0.1, 2.0, 0.15, 0.4, LICHEN, 0.6]] }), weather(block(1.6, 0.32, 0.3, STONE, [0, 3.65, 0], 0.2), { moss: 0 }),
    weather(ring(0.52, 0.08, OLD, [0, 3.65, 0], [0, 0, 0], PI * 2, 28), { moss: 0, chip: 0.006 }),
    weather(block(0.7, 0.3, 0.6, OLD, [0, 1.75, 0], 0.2), { moss: 0 }),
    lump(0.12, PALE, [0, 3.65, 0.15], [1, 1, 0.5], 10), lump(0.12, PALE, [0, 3.65, -0.15], [1, 1, 0.5], 10),
    ...Array.from({ length: 9 }, (_, i) => ring(0.07, 0.014, OLD, [0, 2.1 + i * 0.16, 0.152], [0, 0, 0], PI * 2, 10)),   // a chain of knots down the shaft
    ...[-0.62, 0.62].map((x) => ring(0.07, 0.014, OLD, [x, 3.65, 0.152], [0, 0, 0], PI * 2, 10)), ring(0.07, 0.014, OLD, [0, 4.3, 0.152], [0, 0, 0], PI * 2, 10),
    tube([[0.2, 1.6, 0.16], [-0.2, 2.2, 0.17], [0.2, 2.8, 0.16], [-0.18, 3.4, 0.17], [0.3, 3.7, 0.16]], [0.03, 0.025, 0.02, 0.015, 0.008], 0x2f3a22, { sides: 5, steps: 5 }),
    ...Array.from({ length: 26 }, (_, i) => lump(0.08, i % 3 ? 0x3d5a2a : 0x54703a, [Math.sin(i * 1.05) * 0.22, 1.65 + i * 0.08, 0.18], [1, 1.2, 0.25], 5)),
  ], 1.5);
  // The urn: draped, with a flame for a lid.
  const urn = join([
    ...pedestal(),
    weather(turned([[0.02, 0], [0.42, 0.02], [0.4, 0.1], [0.2, 0.2], [0.17, 0.36], [0.26, 0.46], [0.48, 0.72], [0.58, 1.0], [0.56, 1.2], [0.4, 1.36], [0.3, 1.42], [0.36, 1.5], [0.34, 1.56], [0.02, 1.6]], PALE, [0, 1.6, 0], 22), { moss: 0, chip: 0.006, grain: 8, stains: [[0.3, 2.5, 0.4, 0.4, LICHEN, 0.5]] }),
    ...[-1, 1].map((s) => weather(ring(0.2, 0.045, OLD, [s * 0.6, 2.75, 0], [0, 0, 0], PI * 2, 14), { moss: 0, chip: 0.004 })),   // handles
    weather(sheet([0, 3.12, 0], [0.38, 0.62], 0.4, 3.6, 0.95, STONE, { ragged: 0.16, across: 20, down: 7 }), { moss: 0, chip: 0.02, grain: 6 }),   // a cloth thrown over it
    ...spikes(7, (i) => { const a = i * 0.9; return [[Math.cos(a) * 0.08, 3.18, Math.sin(a) * 0.08], [Math.cos(a) * 0.05, 3.45 + 0.12 * (i % 3), Math.sin(a) * 0.05], 0.07]; }, PALE),   // the flame
    ...Array.from({ length: 10 }, (_, i) => lump(0.05, i % 2 ? 0x8a3a4a : 0x54703a, [Math.cos(i * 0.6 + 2) * 0.62, 1.66, Math.sin(i * 0.6 + 2) * 0.62], [1, 0.7, 1], 5)),   // flowers left at its foot
  ], 1.5);
  return [angel, cross, urn];
}

// The trim of the chapel (its nave, 13 x 9 x 24, and its tower, 6 x 22 x 6 at z = 9, are drawn plain by chunkMesh).
// Returns { stone, glass }: what is carved, and what is lit from inside.
export function chapel() {
  const pieces = [], glass = [];
  const window = (at, turn, w, h, deep = 0.3) => {   // a pointed window: its frame, a bar up the middle and one across, and the glass behind
    const outer = arch(w + 0.36, h + 0.3), inner = arch(w, h).map(([x, y]) => [x, y + 0.12]);
    pieces.push(move(extrude(outer, deep, PALE, 0, [inner.slice().reverse()]), [0, 0, -deep / 2].map((v, i) => v), [0, 0, 0]).rotateY(turn).translate(...at),
      move(block(0.09, h, 0.1, PALE, [0, h / 2 + 0.1, 0]), at, [0, turn, 0]), move(block(w, 0.09, 0.1, PALE, [0, h * 0.45, 0]), at, [0, turn, 0]), move(block(w + 0.6, 0.16, deep + 0.2, STONE, [0, -0.06, 0]), at, [0, turn, 0]));
    glass.push(new THREE.ShapeGeometry(new THREE.Shape(inner.map(([x, y]) => new THREE.Vector2(x, y))), 6).rotateY(turn).translate(...at));
  };
  // The nave: a plinth, a band under the eaves, and buttresses between tall windows down both sides.
  pieces.push(weather(block(13.5, 1.0, 24.5, OLD, [0, 0.5, 0], 1.5), { moss: 0.9, chip: 0.03 }), block(13.3, 0.3, 24.3, PALE, [0, 8.85, 0]));
  for (const s of [-1, 1]) {
    for (const z of [-11.2, -8.4, -3, 3, 8.4]) pieces.push(
      weather(block(1.1, 5.2, 1.0, STONE, [s * 7.0, 2.6, z], 0.5), { moss: 1.2, chip: 0.03 }), weather(block(0.75, 3.0, 0.9, STONE, [s * 6.85, 6.6, z], 0.5), { moss: 0, chip: 0.03 }),
      side(move(extrude([[0, 0], [0.75, 0], [0, 0.8]], 0.9, PALE), [6.5, 8.1, z - 0.45]), s), side(move(extrude([[0, 0], [0.45, 0], [0, 0.5]], 1.0, PALE), [7.1, 5.2, z - 0.5]), s));
    for (const z of [-6, 0, 5.8]) window([s * 6.56, 2.6, z], s * PI / 2, 1.3, 4.2);
    for (let z = -11.5; z <= 11.6; z += 1.15) pieces.push(block(0.3, 0.3, 0.5, STONE, [s * 6.7, 8.55, z]));   // corbels under the eaves
  }
  // The roof: slates in courses, a ridge, and a cross on the far gable.
  for (const s of [-1, 1]) for (let k = 0; k < 9; k++) {
    const t = (k + 0.5) / 9, x = s * (7 - t * 7), y = 9 + t * 4.5;
    pieces.push(dirty(block(0.98, 0.07, 25.2, k % 2 ? 0x55565c : 0x45464c, [x, y + 0.08, 0], 1.2, [0, 0, s * -0.571]), { mottle: 0.5, freq: 1.5, under: 0 }));
  }
  pieces.push(block(0.3, 0.3, 25.4, SOOT, [0, 13.6, 0]), ...Array.from({ length: 12 }, (_, i) => block(0.16, 0.3, 0.16, SOOT, [0, 13.85, -12 + i * 2.1])), block(0.2, 1.6, 0.2, PALE, [0, 14.4, -12.5]), block(0.9, 0.2, 0.2, PALE, [0, 14.7, -12.5]));
  window([0, 3.2, -12.06], PI, 2.4, 5.2);                                                                       // the great window in the far end
  // The tower: buttressed at the corners, banded, with a rose window, a belfry and battlements under the spire.
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    pieces.push(weather(block(1.2, 15, 1.2, STONE, [sx * 3.2, 7.5, 9 + sz * 3.2], 0.6), { moss: 1.4, chip: 0.03 }), weather(block(0.9, 6.5, 0.9, STONE, [sx * 3.1, 18.2, 9 + sz * 3.1], 0.6), { moss: 0, chip: 0.03 }));
    pieces.push(paint(new THREE.ConeGeometry(0.55, 2.6, 4).rotateY(PI / 4).translate(sx * 3.05, 24.3, 9 + sz * 3.05), PALE), block(1.0, 0.25, 1.0, PALE, [sx * 3.05, 22.95, 9 + sz * 3.05]), lump(0.14, PALE, [sx * 3.05, 25.7, 9 + sz * 3.05], [1, 1, 1], 6));   // a pinnacle
    pieces.push(weather(sculpt(lump(0.3, OLD, [sx * 3.5, 21.2, 9 + sz * 3.5], [1, 0.8, 1], 8), (v) => { v.x += sx * Math.max(0, v.y - 21.1) * 0; dent(v, [sx * 3.8, 21.2, 9 + sz * 3.8], 0.3, -0.4, [sx * 0.7, -0.1, sz * 0.7]); }), { moss: 0, chip: 0.02 }));   // a gargoyle, leaning out
  }
  for (const y of [7.5, 14.5, 21.8]) pieces.push(block(6.3, 0.3, 6.3, PALE, [0, y, 9]));
  for (let k = -2; k <= 2; k++) for (const [x, z, w, d] of [[k * 1.35, 12.1, 0.7, 0.4], [k * 1.35, 5.9, 0.7, 0.4], [3.1, 9 + k * 1.35, 0.4, 0.7], [-3.1, 9 + k * 1.35, 0.4, 0.7]]) pieces.push(block(w, 0.9, d, STONE, [x, 22.4, z]));   // battlements
  pieces.push(ring(1.25, 0.16, PALE, [0, 11.2, 12.06], [0, 0, 0], PI * 2, 28), ...Array.from({ length: 8 }, (_, i) => move(block(0.08, 1.2, 0.1, PALE, [0, 0.6, 0]), [0, 11.2, 12.08], [0, 0, i * PI / 4])), ring(0.3, 0.07, PALE, [0, 11.2, 12.1], [0, 0, 0], PI * 2, 14));
  glass.push(new THREE.CircleGeometry(1.2, 24).translate(0, 11.2, 12.03));
  for (const [x, z, turn] of [[0, 12.04, 0], [3.04, 9, PI / 2], [-3.04, 9, -PI / 2], [0, 5.96, PI]]) {         // the belfry: two openings a side, slatted
    for (const k of [-1, 1]) {
      const at = [x + (turn === 0 || turn === PI ? k * 1.1 : 0), 16.3, z + (turn === 0 || turn === PI ? 0 : k * 1.1)];
      pieces.push(move(extrude(arch(1.5, 3.9), 0.3, PALE, 0, [arch(1.1, 3.4).map(([a, b]) => [a, b + 0.2]).reverse()]), [0, 0, -0.15]).rotateY(turn).translate(...at), move(extrude(arch(1.1, 3.4), 0.04, 0x0c0b0a), [0, 0.2, -0.1]).rotateY(turn).translate(...at));
      for (let s = 0; s < 6; s++) pieces.push(move(block(1.1, 0.06, 0.26, 0x2a231d, [0, 0.55 + s * 0.42, 0.02], 0, [0.5, 0, 0]), at, [0, turn, 0]));
    }
  }
  // The spire: eight-sided, ribbed, with a cross and a weathercock.
  pieces.push(dirty(paint(new THREE.ConeGeometry(4.3, 12.5, 8, 10).rotateY(PI / 8).translate(0, 28.2, 9), 0x4a4b52), { mottle: 0.5, freq: 0.9, under: 0 }));
  for (let k = 0; k < 8; k++) { const a = (k / 8) * PI * 2 + PI / 8; pieces.push(tube([[Math.sin(a) * 4.3, 22, 9 + Math.cos(a) * 4.3], [0, 34.4, 9]], [0.13, 0.04], SOOT, { sides: 5 })); }
  for (const y of [25, 28, 31]) pieces.push(ring(4.3 * (34.45 - y) / 12.5, 0.07, SOOT, [0, y, 9], [PI / 2, 0, 0], PI * 2, 8).rotateY(0));
  pieces.push(tube([[0, 34, 9], [0, 37, 9]], [0.08, 0.05], IRON, { sides: 6 }), block(1.1, 0.12, 0.12, IRON, [0, 36.1, 9]), lump(0.2, GOLD, [0, 34.5, 9], [1, 1, 1], 8),
    paint(new THREE.ConeGeometry(0.2, 0.9, 4).rotateZ(-PI / 2).translate(0.5, 37.1, 9), GOLD), lump(0.22, GOLD, [-0.1, 37.15, 9], [1.4, 1, 0.5], 8), ...spikes(4, (i) => [[-0.3, 37.2, 9], [-0.7, 37.3 + i * 0.13, 9], 0.08], GOLD));
  // The door: three orders of arch, planked doors on long iron hinges, steps, a lantern either side.
  for (let k = 0; k < 3; k++) pieces.push(move(extrude(arch(3.6 - k * 0.5, 5.6 - k * 0.4), 0.3, k % 2 ? STONE : PALE, 0, [arch(3.0 - k * 0.5, 5.1 - k * 0.4).reverse()]), [0, 0, 12.0 + (2 - k) * 0.22]));
  pieces.push(move(extrude(arch(2.1, 4.3), 0.12, WOOD), [0, 0, 12.0]));
  for (let k = -3; k <= 3; k++) pieces.push(block(0.03, 4.0, 0.02, 0x2e1e12, [k * 0.3, 2.0, 12.13]));
  for (const s of [-1, 1]) {
    for (const y of [0.8, 2.3, 3.4]) pieces.push(tube([[s * 1.0, y, 12.14], [s * 0.5, y + 0.05, 12.14], [s * 0.12, y - 0.08, 12.14]], [0.05, 0.035, 0.015], IRON, { sides: 4, steps: 3, squash: 0.4 }));
    pieces.push(ring(0.11, 0.02, IRON, [s * 0.22, 2.0, 12.16], [0, 0, 0], PI * 2, 12));
    pieces.push(tube([[s * 2.3, 3.6, 12.05], [s * 2.3, 3.8, 12.5], [s * 2.3, 3.5, 12.6]], [0.04, 0.03, 0.02], IRON, { sides: 5, steps: 3 }), block(0.3, 0.42, 0.3, IRON, [s * 2.3, 3.2, 12.6]), paint(new THREE.ConeGeometry(0.26, 0.24, 4).rotateY(PI / 4).translate(s * 2.3, 3.52, 12.6), IRON));
    glass.push(new THREE.BoxGeometry(0.22, 0.3, 0.22).translate(s * 2.3, 3.2, 12.6));
  }
  for (let k = 0; k < 3; k++) pieces.push(weather(block(5 + k * 0.9, 0.18, 1.2 + k * 0.5, k % 2 ? OLD : STONE, [0, 0.4 - k * 0.18, 12.5 + k * 0.25], 0.6), { moss: 0.5 }));
  return { stone: join(pieces, 3), glass: mergeGeometries(glass.map((g) => { g.deleteAttribute('uv'); g.deleteAttribute('normal'); return g.index ? g.toNonIndexed() : g; })) };
}

// A street lamp: a fluted iron post from the ground, a scrolled arm, and a lantern hanging at (-1.6, 6.7, -1.6).
export function lamp() {
  const L = [-1.6, 6.7, -1.6], pieces = [
    sculpt(turned([[0.34, -1.5], [0.34, 0.1], [0.3, 0.16], [0.22, 0.3], [0.26, 0.55], [0.26, 0.95], [0.17, 1.1], [0.2, 1.2], [0.11, 1.35]], IRON, [0, 0, 0], 16), (v) => { if (v.y > 0.3 && v.y < 1) { const k = 1 - 0.1 * Math.abs(Math.sin(Math.atan2(v.z, v.x) * 4)); v.x *= k; v.z *= k; } }),
    sculpt(tube([[0, 1.3, 0], [0, 4, 0], [0, 7.0, 0]], [0.1, 0.085, 0.065], IRON, { sides: 12, steps: 6 }), (v) => { const k = 1 - 0.12 * Math.abs(Math.sin(Math.atan2(v.z, v.x) * 6)); v.x *= k; v.z *= k; }),
    ...[1.4, 3.4, 3.5, 6.1, 6.9].map((y) => ring(0.11, 0.03, 0x3a3b40, [0, y, 0], [PI / 2, 0, 0], PI * 2, 12)),
    tube([[-0.4, 5.7, 0.4], [0.4, 5.7, -0.4]], [0.025, 0.025], IRON, { sides: 5 }), lump(0.04, IRON, [-0.4, 5.7, 0.4], [1, 1, 1], 5), lump(0.04, IRON, [0.4, 5.7, -0.4], [1, 1, 1], 5),   // the bar the lamplighter's ladder leant on
    lump(0.11, IRON, [0, 7.05, 0], [1, 1, 1], 8), tube([[0, 7.1, 0], [0, 7.5, 0]], [0.04, 0.005], IRON, { sides: 5 }),
    tube([[0, 6.5, 0], [-0.35, 7.35, -0.35], [-1.1, 7.5, -1.1], [-1.6, 7.2, -1.6]], [0.055, 0.05, 0.04, 0.03], IRON, { sides: 6, steps: 5 }),   // the arm...
    tube(Array.from({ length: 9 }, (_, i) => { const a = i * 0.75, r = 0.42 - i * 0.045; return [-0.5 - Math.cos(a) * r * 0.7, 6.75 + Math.sin(a) * r, -0.5 - Math.cos(a) * r * 0.7]; }), [0.03, 0.012], IRON, { sides: 5, steps: 3 }),   // ...and the scroll under it
    tube([[0, 6.1, 0], [-0.5, 6.4, -0.5], [-0.95, 7.42, -0.95]], [0.025, 0.02, 0.02], IRON, { sides: 4, steps: 4 }),
    paint(new THREE.CylinderGeometry(0.06, 0.36, 0.3, 6).translate(L[0], L[1] + 0.42, L[2]), IRON), paint(new THREE.CylinderGeometry(0.2, 0.14, 0.08, 6).translate(L[0], L[1] - 0.3, L[2]), IRON),   // the lantern: a hat, a floor...
    ...Array.from({ length: 6 }, (_, i) => { const a = (i / 6) * PI * 2; return tube([[L[0] + Math.cos(a) * 0.33, L[1] + 0.28, L[2] + Math.sin(a) * 0.33], [L[0] + Math.cos(a) * 0.19, L[1] - 0.27, L[2] + Math.sin(a) * 0.19]], [0.014, 0.014], IRON, { sides: 4 }); }),   // ...six bars...
    lump(0.05, IRON, [L[0], L[1] + 0.62, L[2]], [1, 1.4, 1], 6), tube([[L[0], L[1] + 0.56, L[2]], [L[0], L[1] + 0.86, L[2]]], [0.02, 0.004], IRON, { sides: 4 }),   // ...and a spike
  ];
  return dirty(mergeGeometries(pieces), { mottle: 0.4, freq: 3, under: 0.3, stains: [[0, 0.4, 0.2, 0.5, RUST, 0.6], [0, 3.5, 0, 0.3, RUST, 0.5]] });
}

// A fire bowl on three iron legs. (The embers are at y = 1.33.)
export function brazier() {
  const pieces = [
    turned([[0.0, 0.98], [0.22, 1.0], [0.4, 1.12], [0.5, 1.3], [0.52, 1.36], [0.46, 1.36], [0.42, 1.3], [0.2, 1.16], [0, 1.14]], IRON, [0, 0, 0], 18),   // the bowl
    ring(0.5, 0.035, 0x3a3b40, [0, 1.36, 0]), ring(0.4, 0.02, 0x3a3b40, [0, 1.13, 0]),
    ...Array.from({ length: 12 }, (_, i) => lump(0.022, 0x4a4b50, [Math.cos(i * 0.5236) * 0.5, 1.28, Math.sin(i * 0.5236) * 0.5], [1, 1, 1], 5)),      // rivets
    ...[0, 1, 2].flatMap((k) => { const a = k * 2.094, c = Math.cos(a), s = Math.sin(a); return [
      tube([[c * 0.22, 1.02, s * 0.22], [c * 0.1, 0.6, s * 0.1], [c * 0.3, 0.12, s * 0.3], [c * 0.46, 0, s * 0.46]], [0.04, 0.035, 0.035, 0.05], IRON, { sides: 6, steps: 4 }),
      lump(0.06, IRON, [c * 0.48, 0.03, s * 0.48], [1.2, 0.5, 1.2], 6),
    ]; }),
    ring(0.13, 0.025, IRON, [0, 0.58, 0]),                                                                       // a ring holding the legs together
    ...Array.from({ length: 9 }, (_, i) => lump(0.09 + 0.03 * (i % 3), i % 2 ? 0x1a1512 : 0x2b1c12, [Math.cos(i * 2.4) * 0.26 * (i % 3 ? 1 : 0.3), 1.31, Math.sin(i * 2.4) * 0.26 * (i % 3 ? 1 : 0.3)], [1, 0.7, 1], 5)),   // coals
  ];
  return dirty(mergeGeometries(pieces), { mottle: 0.4, freq: 5, under: 0.3, stains: [[0.3, 1.2, 0.3, 0.3, RUST, 0.6]] });
}

// The small things scattered over the ground. Each is made once and drawn many times.
export function decor() {
  const BONE = { bone: 0xddd6c1, old: 0xb3aa92, dark: 0x14120f, teeth: 0xe9e3cf };
  const blade = (x, z, lean, tall, turn) => tube([[x, 0, z], [x + Math.cos(turn) * lean * 0.4, tall * 0.6, z + Math.sin(turn) * lean * 0.4], [x + Math.cos(turn) * lean, tall, z + Math.sin(turn) * lean]], [0.02, 0.015, 0.002], 0xffffff, { sides: 3, steps: 1, caps: false });
  const rock = (seed) => dirty(sculpt(paint(mergeVertices(new THREE.IcosahedronGeometry(1, 2)), 0xffffff), (v) => { const k = 1 + 0.28 * noise(v.x * 1.4 + seed, v.y * 1.4, v.z * 1.4) + 0.1 * noise(v.x * 4 + seed, v.y * 4, v.z * 4); v.multiplyScalar(k); if (v.y < -0.3) v.y = -0.3; }), { mottle: 0.45, freq: 2.5, under: 0.5 });
  return {
    tuft: (() => {   // grass: seven blades, dark at the root and paler toward the tip
      const g = mergeGeometries([[-0.07, 0, 0.12, 0.3, 0.3], [0.06, 0.03, -0.1, 0.36, 2.8], [0, -0.05, 0.05, 0.42, 1.4], [0.1, 0.02, 0.16, 0.26, 4.4], [-0.03, 0.07, -0.14, 0.34, 5.4], [0.02, 0.1, 0.2, 0.22, 3.6], [-0.1, -0.06, 0.18, 0.2, 2.0]].map(([x, z, lean, tall, turn]) => blade(x, z, lean, tall, turn)));
      const p = g.attributes.position, c = g.attributes.color;
      for (let i = 0; i < p.count; i++) { const k = 0.45 + p.getY(i) * 2.6; c.setXYZ(i, k, k, k * 0.9); }
      return g;
    })(),
    rock: wrap(rock(3), 1.5),
    skull: mergeGeometries([...fineSkull(0.13, BONE, { at: [0, 0.13, 0], jaw: 0, fine: 10, upper: 5, lower: 0, tilt: -0.15 })]),
    bone: boneShaft([0, -0.5, 0], [0, 0.5, 0], 0.035, 0xffffff, 1.7),
    ribs: mergeGeometries([...Array.from({ length: 5 }, (_, i) => tube([[-0.2, 0.02, i * 0.09 - 0.18], [-0.16, 0.2, i * 0.09 - 0.18], [0, 0.27, i * 0.09 - 0.18], [0.16, 0.2, i * 0.09 - 0.18], [0.2, 0.02, i * 0.09 - 0.18]], [0.012, 0.016, 0.016, 0.016, 0.012], 0xffffff, { sides: 4, steps: 3 })), tube([[0, 0.27, -0.22], [0, 0.27, 0.24]], [0.03, 0.03], 0xe2dcc8, { sides: 5, steps: 4 })]),
    leaf: paint(new THREE.ShapeGeometry(new THREE.Shape([[0, -0.13], [0.05, -0.07], [0.09, 0], [0.06, 0.03], [0.08, 0.08], [0.03, 0.08], [0, 0.15], [-0.03, 0.08], [-0.08, 0.08], [-0.06, 0.03], [-0.09, 0]].map(([x, y]) => new THREE.Vector2(x, y)))).rotateX(-PI / 2), 0xffffff),
    shroom: mergeGeometries([
      tube([[0, 0, 0], [0.01, 0.07, 0], [0, 0.12, 0]], [0.026, 0.018, 0.02], 0xe6dfc8, { sides: 6, steps: 2 }),
      dirty(paint(new THREE.SphereGeometry(0.075, 12, 6, 0, PI * 2, 0, PI / 2).scale(1, 0.75, 1).translate(0, 0.11, 0), 0xb8452e), { mottle: 0.3, freq: 30, under: 0 }),
      paint(new THREE.CircleGeometry(0.073, 12).rotateX(PI / 2).translate(0, 0.111, 0), 0x6b5a48),               // the gills
      ...[[0.03, 0.01], [-0.03, 0.03], [0, -0.04], [-0.04, -0.02], [0.045, -0.03]].map(([x, z]) => lump(0.012, 0xf3efe2, [x, 0.11 + Math.sqrt(Math.max(0, 0.075 * 0.075 - x * x - z * z)) * 0.75, z], [1, 0.4, 1], 5)),   // its spots
      tube([[0.09, 0, 0.04], [0.095, 0.06, 0.04]], [0.014, 0.012], 0xe6dfc8, { sides: 5 }), paint(new THREE.SphereGeometry(0.04, 8, 5, 0, PI * 2, 0, PI / 2).translate(0.095, 0.055, 0.04), 0xb8452e),   // and a small one beside it
    ]),
    cross: mergeGeometries([
      tube([[0, -0.1, 0], [0, 1.05, 0]], [0.028, 0.024], IRON, { sides: 6, steps: 3 }), tube([[-0.27, 0.75, 0], [0.27, 0.75, 0]], [0.024, 0.024], IRON, { sides: 6 }),
      ...[[0, 1.07], [-0.29, 0.75], [0.29, 0.75]].flatMap(([x, y]) => [lump(0.04, IRON, [x, y, 0], [1, 1, 0.6], 6), ...[-1, 1].map((s) => lump(0.028, IRON, x ? [x, y + s * 0.045, 0] : [s * 0.045, y - 0.02, 0], [1, 1, 0.6], 5))]),   // a trefoil on each end
      ring(0.13, 0.014, IRON, [0, 0.75, 0], [0, 0, 0], PI * 2, 16),
      ...[-1, 1].map((s) => tube([[s * 0.02, 0.3, 0], [s * 0.16, 0.42, 0], [s * 0.1, 0.58, 0], [s * 0.03, 0.5, 0]], [0.012, 0.012, 0.01, 0.006], IRON, { sides: 4, steps: 3 })),   // scrolls
      slab(0.2, 0.12, 0.012, RUST, [0, 0.52, 0.03]),                                                             // a name plate
    ]),
    pumpkin: mergeGeometries([
      dirty(sculpt(lump(0.24, 0xe07a24, [0, 0.19, 0], [1, 0.8, 1], 20), (v) => { const k = 1 - 0.09 * Math.abs(Math.sin(Math.atan2(v.z, v.x) * 5)); v.x *= k; v.z *= k; dent(v, [0, 0.39, 0], 0.1, 0.04, [0, -1, 0]); }), { mottle: 0.25, freq: 10, under: 0.5 }),
      tube([[0, 0.34, 0], [0.01, 0.42, 0], [0.05, 0.47, 0.01]], [0.03, 0.022, 0.016], 0x4a5a2a, { sides: 6, steps: 3 }),
      ...[-1, 1].map((s) => paint(new THREE.ConeGeometry(0.045, 0.07, 3).rotateX(PI / 2).scale(1, 1, 0.2).translate(s * 0.085, 0.25, 0.212), 0xfff0a0)),   // a face cut in it: eyes...
      paint(new THREE.ConeGeometry(0.025, 0.04, 3).rotateX(PI / 2).scale(1, 1, 0.2).translate(0, 0.19, 0.236), 0xfff0a0),
      ...[-2, -1, 0, 1, 2].map((k) => slab(0.034, 0.03 + 0.012 * (k % 2 ? 1 : 0), 0.01, 0xfff0a0, [k * 0.04, 0.125 + Math.abs(k) * 0.012, 0.215 - Math.abs(k) * 0.012])),   // ...and teeth
    ]),
    slab: wrap(mergeGeometries([
      weather(sculpt(block(0.58, 0.1, 0.6, 0xffffff, [-0.21, 0.05, 0], 0.1), (v) => { if (v.x > 0) v.x -= 0.06 * noise(v.z * 9, 1, 2) + 0.03; }), { moss: 0, chip: 0.012, grain: 8 }),
      weather(sculpt(block(0.36, 0.1, 0.6, 0xe4e0d6, [0.34, 0.03, 0.02], 0.1, [0, 0.12, 0.07]), (v) => { if (v.x < 0.3) v.x -= 0.06 * noise(v.z * 9, 1, 2) - 0.04; }), { moss: 0, chip: 0.012, grain: 8 }),
      ...lettering(3, [-0.22, 0.102, -0.14], 0.36, [1, 0], -0.11, 0x55524a).map((g) => g.rotateX(0)),
    ]), 0.8),
    crow: mergeGeometries([
      dirty(tube([[0, 0.1, -0.13], [0, 0.125, -0.02], [0, 0.17, 0.08], [0, 0.215, 0.12]], [0.03, 0.085, 0.07, 0.04], 0x15151a, { sides: 10, steps: 4 }), { mottle: 0.3, freq: 30, under: 0.3 }),
      lump(0.055, 0x101014, [0, 0.235, 0.14], [1, 1, 1.1], 10),
      tube([[0, 0.232, 0.18], [0, 0.222, 0.235], [0, 0.205, 0.265]], [0.022, 0.014, 0.002], 0x2a2a2e, { sides: 5, steps: 3 }),   // beak
      lump(0.009, 0xd8d8d0, [-0.036, 0.25, 0.168], [1, 1, 1], 5), lump(0.009, 0xd8d8d0, [0.036, 0.25, 0.168], [1, 1, 1], 5),
      ...[-1, 1].flatMap((s) => [
        lump(0.085, 0x0c0c10, [s * 0.062, 0.14, -0.03], [0.35, 0.7, 1.5], 8),                                    // a folded wing...
        ...spikes(4, (i) => [[s * 0.07, 0.13 - i * 0.012, -0.1], [s * (0.06 - i * 0.012), 0.09 - i * 0.012, -0.25 + i * 0.025], 0.02], 0x0a0a0d),   // ...and its long feathers
        tube([[s * 0.03, 0.07, 0], [s * 0.035, 0.012, 0.01]], [0.008, 0.006], 0x2a2a2e, { sides: 4 }),
        ...[-0.5, 0, 0.5].map((t) => tube([[s * 0.035, 0.012, 0.01], [s * 0.035 + t * 0.03, 0.004, 0.05]], [0.005, 0.002], 0x2a2a2e, { sides: 3 })),   // toes
      ]),
      ...spikes(5, (i) => [[(i - 2) * 0.012, 0.1, -0.13], [(i - 2) * 0.03, 0.075, -0.3], 0.022], 0x0c0c10),       // tail
    ]),
    flower: mergeGeometries([
      tube([[0, 0, 0], [0.01, 0.05, 0]], [0.006, 0.005], 0x2f4a22, { sides: 3 }),
      ...Array.from({ length: 5 }, (_, i) => lump(0.03, 0xffffff, [Math.cos(i * 1.257) * 0.034, 0.055, Math.sin(i * 1.257) * 0.034], [1, 0.3, 1], 4)),
      lump(0.018, 0xf2c94a, [0, 0.06, 0], [1, 0.7, 1], 5),
    ]),
    mound: dirty(rough(lump(1, 0xffffff, [0, 0, 0], [1, 1, 1], 14), 0.09, 3), { mottle: 0.5, freq: 3, under: 0 }),
  };
}

// ---- The Catacombs ----
// What hangs from the roof and lies along the walls. A stalactite and a chain hang down from y = 0.
export function under() {
  const BONE = { bone: 0xcfc8b2, old: 0x9a927c, dark: 0x0c0b0a, teeth: 0xd8d2bf };
  const links = [];
  for (let i = 0; i < 62; i++) links.push(paint(new THREE.TorusGeometry(0.07, 0.02, 4, 7).scale(0.62, 1, 1).rotateY(i % 2 ? PI / 2 : 0).translate(0, -0.08 - i * 0.16, 0), i % 5 ? IRON : 0x3d2a1e));
  return {
    // A stalactite: ribbed where the water ran, wet and dark at its tip. (1 m long and 1 m across: it is stretched to fit.)
    spike: dirty(sculpt(paint(new THREE.CylinderGeometry(0.02, 1, 1, 12, 7, true).rotateX(PI).translate(0, -0.5, 0), 0xffffff), (v) => {
      const a = Math.atan2(v.z, v.x), t = -v.y, k = (1 - 0.35 * t * (1 - t) * 2) * (1 + 0.16 * Math.sin(a * 5 + t * 3) + 0.2 * noise(v.x * 3, t * 4, v.z * 3));
      v.x *= k; v.z *= k; v.x += 0.08 * Math.sin(t * 5) * t;
    }), { mottle: 0.45, freq: 2.5, under: 0, stains: [[0, -1, 0, 0.5, 0x2a2622, 0.8]] }),
    chain: mergeGeometries(links),                                                                              // (10 m of it: hung so that only as much as is wanted shows below the roof)
    // A lantern on the end of it: a hook, a hat, four posts and their cross-bars, panes of smoked glass, a candle inside.
    lantern: mergeGeometries([
      ring(0.05, 0.012, IRON, [0, 0.36, 0], [0, 0, 0], PI * 2, 10), tube([[0, 0.31, 0], [0, 0.24, 0]], [0.015, 0.015], IRON, { sides: 4 }),
      paint(new THREE.ConeGeometry(0.24, 0.16, 4).rotateY(PI / 4).translate(0, 0.25, 0), IRON), block(0.3, 0.03, 0.3, IRON, [0, 0.17, 0]), block(0.3, 0.04, 0.3, IRON, [0, -0.2, 0]),
      ...[[-1, -1], [1, -1], [1, 1], [-1, 1]].flatMap(([x, z]) => [block(0.028, 0.36, 0.028, IRON, [x * 0.13, -0.01, z * 0.13]), lump(0.022, RUST, [x * 0.13, -0.22, z * 0.13], [1, 1, 1], 5)]),
      ...[0, 1, 2, 3].flatMap((k) => { const a = k * PI / 2, c = Math.cos(a), s = Math.sin(a); return [block(Math.abs(s) * 0.26 + 0.012, 0.015, Math.abs(c) * 0.26 + 0.012, IRON, [c * 0.13, 0.03, s * 0.13]), block(Math.abs(s) * 0.24 + 0.004, 0.32, Math.abs(c) * 0.24 + 0.004, 0x7a5a22, [c * 0.122, -0.01, s * 0.122])]; }),
      tube([[0, -0.18, 0], [0, -0.06, 0]], [0.03, 0.026], 0xe6dfc8, { sides: 6 }),
      lump(0.03, IRON, [0, -0.24, 0], [1, 1.6, 1], 5),
    ]),
    skull: mergeGeometries([...fineSkull(0.13, BONE, { at: [0, 0.13, 0], jaw: 0.1, fine: 10, upper: 5, lower: 4 })]),
    // Three candles burnt down on a spill of wax. (The flame is at y = 0.33.)
    candles: mergeGeometries([
      dirty(lump(0.16, 0xe6dfc8, [0, 0.01, 0], [1, 0.12, 0.8], 10), { mottle: 0.2, freq: 20, under: 0 }),
      ...[[0, 0, 0.26, 0.035], [0.09, 0.04, 0.16, 0.03], [-0.08, -0.03, 0.1, 0.032]].flatMap(([x, z, tall, r]) => [
        tube([[x, 0, z], [x, tall, z]], [r * 1.15, r], 0xe6dfc8, { sides: 7, steps: 2 }),
        ...[0, 2.1, 4.2].map((a) => tube([[x + Math.cos(a) * r, tall, z + Math.sin(a) * r], [x + Math.cos(a) * r * 1.2, tall * 0.5, z + Math.sin(a) * r * 1.2]], [0.008, 0.012, 0.004], 0xf3efe2, { sides: 3, steps: 2 })),   // where it has run
        tube([[x, tall, z], [x, tall + 0.03, z]], [0.004, 0.003], 0x1a1512, { sides: 3 }),
      ]),
    ]),
    // A flange where two lengths of sewer pipe are bolted together. (Round z; 1 = the pipe's radius.)
    flange: mergeGeometries([new THREE.TorusGeometry(1.12, 0.14, 5, 14), ...Array.from({ length: 8 }, (_, i) => new THREE.SphereGeometry(0.1, 5, 4).translate(Math.cos(i * 0.785) * 1.18, Math.sin(i * 0.785) * 1.18, 0.14))]),
  };
}

// ---- The Moon ----
// What is scattered over the dust. Each stands on y = 0.
export function lunar() {
  const WHITE = 0xe9e9ee, GREY = 0x8e9098, DARK = 0x2b2c31, RED = 0xc8201b;
  const shard = (x, z, lean, turn, tall, r) => move(sculpt(paint(new THREE.CylinderGeometry(r * 0.75, r, tall, 6, 3).translate(0, tall / 2, 0), 0xffffff), (v) => { const t = v.y / tall; if (t > 0.72) { const k = 1 - (t - 0.72) / 0.28; v.x *= k; v.z *= k; } }), [x, 0, z], [lean * Math.cos(turn), 0, lean * Math.sin(turn)]);
  const crystal = mergeGeometries([[0, 0, 0, 0, 1.3, 0.14], [0.18, 0.1, 0.45, 0.3, 0.8, 0.11], [-0.17, -0.12, 0.5, 2.6, 0.65, 0.1], [0.05, -0.2, 0.6, 4.4, 0.5, 0.08], [-0.1, 0.2, 0.35, 1.4, 0.95, 0.09], [0.22, -0.08, 0.8, 5.5, 0.38, 0.07], [-0.26, 0.04, 0.9, 3.3, 0.3, 0.06]].map(([x, z, lean, turn, tall, r]) => shard(x, z, lean, turn, tall, r)));
  { const p = crystal.attributes.position, c = crystal.attributes.color, n = crystal.attributes.normal;         // (it is drawn unlit, so its facets are painted on)
    for (let i = 0; i < p.count; i++) { const k = 0.55 + 0.3 * Math.min(1, p.getY(i)) + 0.25 * (n.getX(i) * 0.6 + n.getZ(i) * 0.3 + 0.4); c.setXYZ(i, k, k, k); } }
  return {
    crystal,
    // An egg, if that is what it is: ridged, veined, sitting in a nest of something.
    egg: mergeGeometries([
      dirty(sculpt(lump(0.3, 0xffffff, [0, 0.36, 0], [1, 1.35, 1], 20), (v) => { const k = 1 + 0.05 * Math.sin(Math.atan2(v.z, v.x) * 7 + v.y * 6) * Math.min(1, v.y * 3); v.x *= k; v.z *= k; }), { mottle: 0.5, freq: 9, under: 0.4 }),
      ...Array.from({ length: 6 }, (_, i) => { const a = i * 1.05; return tube([[Math.cos(a) * 0.1, 0.72, Math.sin(a) * 0.1], [Math.cos(a + 0.4) * 0.3, 0.45, Math.sin(a + 0.4) * 0.3], [Math.cos(a + 0.2) * 0.26, 0.12, Math.sin(a + 0.2) * 0.26]], [0.008, 0.016, 0.02], 0x9adf8a, { sides: 4, steps: 4 }); }),   // veins
      ...Array.from({ length: 9 }, (_, i) => { const a = i * 0.7; return tube([[Math.cos(a) * 0.2, 0.06, Math.sin(a) * 0.2], [Math.cos(a) * 0.42, 0.1, Math.sin(a) * 0.42], [Math.cos(a + 0.5) * 0.55, 0, Math.sin(a + 0.5) * 0.55]], [0.05, 0.035, 0.008], 0x55504a, { sides: 5, steps: 3 }); }),   // what it sits in
    ]),
    // A helmet somebody is not coming back for.
    helmet: mergeGeometries([
      dirty(lump(0.22, WHITE, [0, 0.2, 0], [1, 1, 1], 16), { mottle: 0.3, freq: 14, under: 0.3, stains: [[0.1, 0.3, -0.1, 0.1, GREY, 0.7]] }),
      turned([[0.17, 0], [0.2, 0.01], [0.2, 0.06], [0.17, 0.08]], GREY, [0, 0, 0], 14), ring(0.19, 0.016, DARK, [0, 0.07, 0], [PI / 2, 0, 0], PI * 2, 14),
      ring(0.165, 0.016, DARK, [0, 0.21, 0.13], [0.05, 0, 0], PI * 2, 18),                                       // the frame of the visor
      ...[-1, 1].map((s) => lump(0.05, GREY, [s * 0.215, 0.19, 0], [0.4, 1, 1], 8)),
      tube([[0.13, 0.33, -0.1], [0.15, 0.5, -0.12]], [0.006, 0.003], GREY, { sides: 4 }),
      slab(0.07, 0.03, 0.01, RED, [0, 0.4, 0.07], [-0.9, 0, 0]),
    ]),
    // A supply crate: framed, strapped, latched, stencilled.
    crate: wrap(mergeGeometries([
      dirty(block(0.94, 0.74, 0.74, 0xf2f0e6, [0, 0.4, 0], 0.2), { mottle: 0.3, freq: 5, under: 0.3 }),
      ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => block(0.07, 0.8, 0.07, GREY, [sx * 0.47, 0.4, sz * 0.37]))),                // corner posts
      ...[0.03, 0.77].flatMap((y) => [block(1.0, 0.06, 0.07, GREY, [0, y, -0.37]), block(1.0, 0.06, 0.07, GREY, [0, y, 0.37]), block(0.07, 0.06, 0.8, GREY, [-0.47, y, 0]), block(0.07, 0.06, 0.8, GREY, [0.47, y, 0])]),
      ...[-0.25, 0.25].map((x) => block(0.07, 0.82, 0.82, DARK, [x, 0.4, 0])),                                   // straps
      block(0.12, 0.08, 0.03, 0xc9a23a, [0, 0.62, 0.385]), block(0.3, 0.1, 0.012, RED, [0, 0.38, 0.378]), block(0.2, 0.03, 0.012, DARK, [0, 0.26, 0.378]),   // a latch, a stencil
      ...[-1, 1].map((s) => ring(0.07, 0.012, DARK, [s * 0.5, 0.45, 0], [0, PI / 2, 0], PI, 8)),                 // handles
    ]), 1),
    // A fuel tank on its cradle.
    tank: mergeGeometries([
      dirty(paint(new THREE.CapsuleGeometry(0.32, 1.1, 6, 16).rotateZ(PI / 2).translate(0, 0.4, 0), WHITE), { mottle: 0.25, freq: 6, under: 0.4, stains: [[0.3, 0.2, 0.3, 0.25, 0x6b3a22, 0.4]] }),
      ...[-0.36, 0, 0.36].map((x) => ring(0.33, 0.018, GREY, [x, 0.4, 0], [0, PI / 2, 0], PI * 2, 18)),          // bands
      ring(0.322, 0.03, 0xd8b23a, [0.18, 0.4, 0], [0, PI / 2, 0], PI * 2, 18),                                   // a warning stripe
      ...[-0.4, 0.4].flatMap((x) => [block(0.08, 0.14, 0.6, DARK, [x, 0.07, 0]), block(0.08, 0.2, 0.06, DARK, [x, 0.16, 0.26]), block(0.08, 0.2, 0.06, DARK, [x, 0.16, -0.26])]),   // the cradle
      tube([[0.88, 0.4, 0], [0.98, 0.4, 0]], [0.05, 0.04], GREY, { sides: 7 }), ring(0.07, 0.012, RED, [1.0, 0.4, 0], [0, PI / 2, 0], PI * 2, 10),   // the valve and its wheel
      tube([[0.2, 0.72, 0], [0.2, 0.8, 0], [0.5, 0.82, 0.1], [0.9, 0.5, 0.05]], [0.014, 0.014, 0.014, 0.014], DARK, { sides: 4, steps: 4 }),
      lump(0.04, GREY, [0.2, 0.73, 0], [1, 0.6, 1], 6),
    ]),
  };
}

// The lander's fittings (its two stages, legs and pads are drawn plain by chunkMesh). The hatch faces +z.
export function landerTrim() {
  const HULL = 0xe2e3e8, GREY = 0x8e9098, DARK = 0x1c1d22, FOIL = 0xd9ad3e, FOIL2 = 0xb98a2a, pieces = [];
  // The descent stage's foil, crumpled, in panels.
  pieces.push(dirty(rough(paint(new THREE.CylinderGeometry(2.46, 2.76, 1.62, 32, 6, true).translate(0, 2.4, 0), FOIL), 0.05, 2.2), { mottle: 0.5, freq: 3, under: 0.3 }));
  for (let k = 0; k < 8; k++) { const a = k * PI / 4 + PI / 8; pieces.push(tube([[Math.cos(a) * 2.5, 3.2, Math.sin(a) * 2.5], [Math.cos(a) * 2.8, 1.6, Math.sin(a) * 2.8]], [0.035, 0.035], FOIL2, { sides: 4 })); }
  pieces.push(ring(2.5, 0.05, GREY, [0, 3.22, 0], [PI / 2, 0, 0], PI * 2, 32), ring(2.78, 0.05, GREY, [0, 1.6, 0], [PI / 2, 0, 0], PI * 2, 32));
  pieces.push(turned([[0.35, 1.6], [0.5, 1.3], [0.85, 0.75], [0.95, 0.55], [0.9, 0.55], [0.8, 0.75], [0.45, 1.3], [0.3, 1.6]], DARK, [0, 0, 0], 20));   // the engine bell
  // The cabin: faceted plates, two windows, the hatch and its porch, thrusters at four corners, a docking ring.
  pieces.push(dirty(rough(paint(new THREE.CylinderGeometry(1.53, 1.93, 1.72, 16, 4, true).translate(0, 4.0, 0), HULL), 0.015, 3), { mottle: 0.25, freq: 2, under: 0.3 }));
  for (let k = 0; k < 16; k++) { const a = k * PI / 8; pieces.push(tube([[Math.cos(a) * 1.55, 4.85, Math.sin(a) * 1.55], [Math.cos(a) * 1.95, 3.15, Math.sin(a) * 1.95]], [0.018, 0.018], GREY, { sides: 4 })); }
  pieces.push(paint(new THREE.CylinderGeometry(0.9, 1.5, 0.3, 16).translate(0, 4.98, 0), HULL), turned([[0.5, 5.1], [0.55, 5.3], [0.45, 5.34], [0.42, 5.12]], GREY, [0, 0, 0], 16));
  for (const s of [-1, 1]) pieces.push(move(extrude([[0, 0], [0.55, 0.12], [0.4, 0.5], [0.05, 0.42]], 0.03, DARK), [s > 0 ? 0.5 : -1.05, 4.3, 1.62], [-0.22, s * 0.35, 0]), ring(0.3, 0.02, GREY, [s * 0.78, 4.52, 1.6], [-0.22, s * 0.35, 0], PI * 2, 4));
  pieces.push(block(1.0, 0.8, 0.08, GREY, [0, 3.72, 1.92]), block(0.8, 0.62, 0.05, HULL, [0, 3.72, 1.97]), ring(0.1, 0.018, DARK, [0.22, 3.72, 2.0], [0, 0, 0], PI * 2, 10), block(1.1, 0.06, 0.8, GREY, [0, 3.26, 2.3]));
  for (let k = 0; k < 4; k++) {
    const a = k * PI / 2 + PI / 4, c = Math.cos(a), s = Math.sin(a), at = [c * 1.95, 4.4, s * 1.95];
    pieces.push(block(0.3, 0.3, 0.3, GREY, at, 0, [0, -a, 0]));
    for (const [dx, dy, dz] of [[c, 0, s], [0, 1, 0], [0, -1, 0], [-s, 0, c]]) pieces.push(move(turned([[0.03, 0], [0.09, 0.2], [0.08, 0.2]], DARK, [0, 0, 0], 8), [0, 0, 0], [dy ? (dy > 0 ? 0 : PI) : PI / 2, 0, 0]).rotateY(dy ? 0 : Math.atan2(dx, dz)).translate(at[0] + dx * 0.15, at[1] + dy * 0.15, at[2] + dz * 0.15));
  }
  // Legs: two braces to each, a probe under each pad, and a ladder down the one in front of the hatch.
  for (let k = 0; k < 4; k++) {
    const a = k * PI / 2 + PI / 4, c = Math.cos(a), s = Math.sin(a), knee = [c * 3.4, 1.15, s * 3.4];
    for (const t of [-0.45, 0.45]) pieces.push(tube([[Math.cos(a + t) * 2.65, 1.75, Math.sin(a + t) * 2.65], knee], [0.05, 0.05], GREY, { sides: 5 }));
    pieces.push(lump(0.16, GREY, knee, [1, 1, 1], 8), ring(0.56, 0.04, FOIL2, [c * 4.3, 0.12, s * 4.3], [PI / 2, 0, 0], PI * 2, 16), tube([[c * 4.3, 0.05, s * 4.3], [c * 4.5, -0.5, s * 4.5]], [0.02, 0.01], GREY, { sides: 4 }));
    pieces.push(dirty(rough(tube([[c * 2.5, 2.4, s * 2.5], knee], [0.2, 0.17], FOIL, { sides: 8, steps: 3 }), 0.02, 6), { mottle: 0.5, freq: 6 }));
  }
  { const top = [1.55, 3.1, 1.55], foot = [3.6, 0.75, 3.6];
    for (const side of [-0.16, 0.16]) pieces.push(tube([[top[0] + side, top[1], top[2] - side], [foot[0] + side, foot[1], foot[2] - side]], [0.022, 0.022], HULL, { sides: 4 }));
    for (let r = 0; r < 9; r++) { const t = r / 8.5, x = top[0] + (foot[0] - top[0]) * t, y = top[1] + (foot[1] - top[1]) * t; pieces.push(tube([[x - 0.16, y, x + 0.16], [x + 0.16, y, x - 0.16]], [0.018, 0.018], HULL, { sides: 4 })); } }
  // On the roof: the dish on its arm, with its horn; two whip aerials; a rendezvous radar.
  pieces.push(tube([[0.6, 4.9, -0.3], [1.0, 5.4, -0.4], [1.2, 5.75, -0.4]], [0.05, 0.04, 0.04], GREY, { sides: 6, steps: 3 }), tube([[1.2, 5.3, -0.4], [1.2, 5.0, -0.4]], [0.02, 0.05], DARK, { sides: 6 }));
  for (let k = 0; k < 3; k++) { const a = k * 2.094; pieces.push(tube([[1.2 + Math.cos(a) * 0.75, 5.62, -0.4 + Math.sin(a) * 0.75], [1.2, 5.02, -0.4]], [0.012, 0.012], GREY, { sides: 3 })); }
  for (const [x, z] of [[-0.9, -0.6], [-0.5, 0.9]]) pieces.push(tube([[x, 4.85, z], [x * 1.1, 6.6, z * 1.1]], [0.015, 0.006], GREY, { sides: 4 }), lump(0.03, DARK, [x * 1.1, 6.6, z * 1.1], [1, 1, 1], 5));
  pieces.push(block(0.3, 0.3, 0.3, GREY, [-0.2, 5.1, 1.1]), paint(new THREE.SphereGeometry(0.3, 12, 6, 0, PI * 2, 0, PI / 2).rotateX(PI / 2 - 0.5).translate(-0.2, 5.3, 1.25), HULL));
  // Beside it: the flag's stand and the rod that holds the cloth out, a plaque, and an experiment left running.
  pieces.push(paint(new THREE.ConeGeometry(0.12, 0.2, 8).translate(6.5, 0.1, 2.5), GREY), tube([[6.5, 3.2, 2.5], [8.0, 3.2, 2.5]], [0.02, 0.02], HULL, { sides: 4 }));
  pieces.push(block(0.5, 0.36, 0.03, GREY, [3.05, 1.5, 3.2], 0, [0, PI / 4, 0]), ...lettering(3, [3.07, 1.58, 3.22], 0.36, [0.7, 0.7], 0.08, DARK).map((g) => g));
  pieces.push(block(0.6, 0.4, 0.6, FOIL, [-6, 0.3, 4]), ...[-1, 1].map((s) => block(0.9, 0.03, 0.5, 0x24408c, [-6 + s * 0.8, 0.5, 4], 0, [0, 0, s * 0.3])), tube([[-6, 0.5, 4], [-6, 1.3, 4]], [0.02, 0.012], GREY, { sides: 4 }), paint(new THREE.SphereGeometry(0.2, 10, 5, 0, PI * 2, 0, PI / 2).rotateX(PI).translate(-6, 1.45, 4), HULL));
  for (const [x, z] of [[-7.4, 5.2], [-4.8, 5.5], [-6.5, 2.2]]) pieces.push(tube([[-6, 0.15, 4], [(x - 6) / 2, 0.03, (z + 4) / 2 + 0.3], [x, 0.03, z]], [0.012, 0.012, 0.012], DARK, { sides: 3, steps: 4 }), block(0.3, 0.16, 0.3, GREY, [x, 0.08, z]));
  return mergeGeometries(pieces);
}

// The comms tower's fittings. top: the height of its deck.
export function towerTrim(top) {
  const HULL = 0xd4d5da, GREY = 0x8e9098, DARK = 0x2b2c31, pieces = [], tall = top + 7;
  const leg = (k, y) => { const [x, z] = [[-2.3, -2.3], [2.3, -2.3], [2.3, 2.3], [-2.3, 2.3]][k % 4], t = y / tall; return [x * (1 - 0.5 * t), y, z * (1 - 0.5 * t)]; };
  for (let y = 0; y < tall - 1; y += 2.5) for (let k = 0; k < 4; k++) pieces.push(tube([leg(k, y), leg(k + 1, Math.min(tall, y + 2.5))], [0.035, 0.035], GREY, { sides: 4 }), tube([leg(k + 1, y), leg(k, Math.min(tall, y + 2.5))], [0.035, 0.035], GREY, { sides: 4 }));   // cross-bracing
  for (let y = 0.4; y < top; y += 0.42) pieces.push(tube([[2.3 - y * 0.06 - 0.25, y, 2.42 - y * 0.06], [2.3 - y * 0.06 + 0.25, y, 2.42 - y * 0.06]], [0.02, 0.02], HULL, { sides: 3 }));   // a ladder up one leg
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) pieces.push(tube([[sx * 3.05, top + 0.1, sz * 3.05], [sx * 3.05, top + 1.1, sz * 3.05]], [0.035, 0.035], HULL, { sides: 4 }));
  for (const y of [0.55, 1.1]) for (let k = 0; k < 4; k++) { const c = [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]; pieces.push(tube([[c[k][0] * 3.05, top + y, c[k][1] * 3.05], [c[k + 1][0] * 3.05, top + y, c[k + 1][1] * 3.05]], [0.025, 0.025], HULL, { sides: 4 })); }   // a rail round the deck
  pieces.push(block(1.0, 0.8, 0.7, GREY, [-1.8, top + 0.5, -1.6]), block(0.8, 0.5, 0.5, DARK, [1.7, top + 0.35, -1.9]), ...[0, 1, 2].map((i) => block(0.1, 0.06, 0.02, [0xff5a3a, 0x5cff7a, 0xffc233][i], [-2.05 + i * 0.25, top + 0.7, -1.24])));
  pieces.push(tube([[0, top + 5, 1], [0, top + 5.3, 1.9]], [0.05, 0.03], GREY, { sides: 5 }), ...[0, 1, 2].map((k) => tube([[Math.cos(k * 2.09) * 1.0, top + 5.6 + Math.sin(k * 2.09) * 0.4, 1.9], [0, top + 5.3, 1.95]], [0.015, 0.015], GREY, { sides: 3 })));   // the dish's horn
  for (let k = 0; k < 4; k++) pieces.push(tube([leg(k, tall), [leg(k, tall)[0] * 5, 0.1, leg(k, tall)[2] * 5]], [0.012, 0.012], DARK, { sides: 3 }), block(0.4, 0.3, 0.4, GREY, [leg(k, tall)[0] * 5, 0.15, leg(k, tall)[2] * 5]));   // stays, to anchors in the dust
  pieces.push(tube([[0, tall, 0], [0, tall + 2.2, 0]], [0.04, 0.012], HULL, { sides: 5 }), ...[0.6, 1.1, 1.6].map((y) => tube([[-0.45 + y * 0.15, tall + y, 0], [0.45 - y * 0.15, tall + y, 0]], [0.012, 0.012], HULL, { sides: 3 })));   // an aerial on top
  return mergeGeometries(pieces);
}

// The Launch Pad's gantry, filled in. lipU, lipY: where the ramp's lip is.
export function gantryTrim(lipU, lipY) {
  const HULL = 0xd4d5da, GREY = 0x8e9098, DARK = 0x2b2c31, YELLOW = 0xd8b23a, pieces = [], h = lipY + 9;
  for (const side of [-1, 1]) {
    const z = side * 7.5;
    for (let y = 0; y < h - 0.5; y += 2.2) {                                                                    // a second post, and lattice between the two
      const y1 = Math.min(h, y + 2.2);
      pieces.push(tube([[lipU - 1.6, y, z], [lipU, y1, z]], [0.05, 0.05], GREY, { sides: 4 }), tube([[lipU, y, z], [lipU - 1.6, y1, z]], [0.05, 0.05], GREY, { sides: 4 }), tube([[lipU - 1.6, y1, z], [lipU, y1, z]], [0.05, 0.05], HULL, { sides: 4 }));
    }
    pieces.push(tube([[lipU - 1.6, 0, z], [lipU - 1.6, h, z]], [0.12, 0.12], HULL, { sides: 6 }));
    for (let k = 0; k < 4; k++) pieces.push(block(1.2, 0.5, 1.2, k % 2 ? DARK : YELLOW, [lipU - 0.8 + (k % 2 ? 0.02 : 0), 0.25 + k * 0.5, z]));   // a footing in warning colours
    pieces.push(block(0.7, 0.5, 0.5, DARK, [lipU - 0.8, h - 0.6, z - side * 0.6]), paint(new THREE.ConeGeometry(0.4, 0.5, 10, 1, true).rotateX(side * PI / 2).translate(lipU - 0.8, h - 0.6, z - side * 1.1), GREY));   // a floodlight
    pieces.push(tube([[1, 0.2, z + side * 0.6], [lipU * 0.5, 0.25, z + side * 0.9], [lipU - 2, 0.2, z + side * 0.6]], [0.14, 0.14, 0.14], DARK, { sides: 6, steps: 5 }), block(1.6, 1.2, 1.0, GREY, [0.2, 0.6, z + side * 0.7]), ring(0.3, 0.05, YELLOW, [0.2, 0.7, z + side * 1.22], [0, 0, 0], PI * 2, 12));   // a fuel line and its pump
  }
  for (let z = -7.5; z < 7.4; z += 2.5) pieces.push(tube([[lipU, h, z], [lipU - 1.6, h, z + 2.5]], [0.05, 0.05], GREY, { sides: 4 }), tube([[lipU - 1.6, h, z], [lipU, h, z + 2.5]], [0.05, 0.05], GREY, { sides: 4 }));
  pieces.push(tube([[lipU - 1.6, h, -7.5], [lipU - 1.6, h, 7.5]], [0.12, 0.12], HULL, { sides: 6 }));
  for (let k = -3; k <= 3; k++) pieces.push(block(0.25, 0.5, 1.0, k % 2 ? DARK : YELLOW, [lipU - 0.8, h + 0.3, k * 1.0]));   // the board across the top
  return mergeGeometries(pieces);
}

// ---- The Long Way Down ----
// What lines the hill. All of it is drawn many times over (see descentScene.js), so each is made once, sparingly.
export function street() {
  const STEEL = 0x3a3e44, DARK = 0x15181c, GLASS = 0x1b2330, CHROME = 0xb9bec4, GREEN = 0x2d5a34;
  const boxy = (geo, w, h, d, p = 0.4) => sculpt(geo, (v) => { const f = (x, a) => Math.sign(x) * a * Math.pow(Math.abs(x) / a, p); v.x = f(v.x, w); v.y = f(v.y, h); v.z = f(v.z, d); });
  // A street lamp, 7 m, its middle at y = 0, its arm reaching toward +x... no: toward -x (see where it is hung).
  const lamp = mergeGeometries([
    turned([[0.22, -3.5], [0.22, -3.2], [0.14, -3.0], [0.11, -2.2], [0.08, 0], [0.065, 3.2]], STEEL, [0, 0, 0], 8),
    ring(0.13, 0.03, DARK, [0, -2.2, 0], [PI / 2, 0, 0], PI * 2, 8), ring(0.09, 0.025, DARK, [0, 2.4, 0], [PI / 2, 0, 0], PI * 2, 8),
    tube([[0, 3.0, 0], [-0.3, 3.5, 0], [-1.2, 3.55, 0], [-2.1, 3.4, 0]], [0.06, 0.055, 0.05, 0.045], STEEL, { sides: 6, steps: 4 }),
    tube([[0, 2.3, 0], [-0.7, 3.1, 0], [-1.3, 3.5, 0]], [0.025, 0.025, 0.025], STEEL, { sides: 4, steps: 3 }),
    boxy(lump(1, DARK, [0, 0, 0], [0.42, 0.11, 0.2], 8), 0.42, 0.11, 0.2).translate(-2.1, 3.36, 0),
    block(0.5, 0.04, 0.26, 0xffe2a8, [-2.1, 3.25, 0]),
    block(0.26, 0.5, 0.2, STEEL, [0.12, -1.6, 0]), block(0.2, 0.3, 0.03, 0xd8b23a, [0.12, -1.6, 0.11]),            // a box of switches, and a notice on it
  ]);
  // A parked car, 4.3 m, standing on y = 0, its tail toward +z. (White: each is tinted its own colour.)
  const wheel = (x, z) => [paint(new THREE.CylinderGeometry(0.33, 0.33, 0.24, 14).rotateZ(PI / 2).translate(x, 0.33, z), 0x111214), paint(new THREE.CylinderGeometry(0.19, 0.19, 0.26, 10).rotateZ(PI / 2).translate(x, 0.33, z), 0x8e9298)];
  const car = mergeGeometries([
    sculpt(boxy(lump(1, 0xffffff, [0, 0, 0], [0.95, 0.36, 2.15], 20), 0.95, 0.36, 2.15, 0.34).translate(0, 0.62, 0), (v) => {
      for (const z of [-1.35, 1.35]) { const d = Math.hypot(v.z - z, v.y - 0.33); if (d < 0.44 && Math.abs(v.x) > 0.6) v.x *= 0.9; }   // wheel arches
      if (v.z < -1.4 && v.y > 0.7) v.y -= (-1.4 - v.z) * 0.22;                                                    // the bonnet slopes
    }),
    boxy(lump(1, GLASS, [0, 0, 0], [0.82, 0.32, 1.1], 16), 0.82, 0.32, 1.1, 0.45).translate(0, 1.22, 0.2),         // the glass...
    boxy(lump(1, 0xffffff, [0, 0, 0], [0.8, 0.05, 0.85], 10), 0.8, 0.05, 0.85, 0.4).translate(0, 1.54, 0.25),      // ...and the roof over it
    ...[-1, 1].flatMap((s) => [block(0.05, 0.56, 0.07, 0xffffff, [s * 0.8, 1.24, 0.2]), block(0.05, 0.6, 0.07, 0xffffff, [s * 0.76, 1.22, -0.78], 0, [0.5, 0, 0]), block(0.05, 0.6, 0.07, 0xffffff, [s * 0.76, 1.22, 1.2], 0, [-0.45, 0, 0]),
      lump(0.08, 0xffffff, [s * 1.0, 1.0, -0.7], [0.6, 0.7, 1.2], 6), lump(0.1, 0xf6f2d8, [s * 0.66, 0.68, -2.1], [1.3, 0.7, 0.5], 6), block(0.03, 0.03, 0.9, DARK, [s * 0.955, 0.75, 0.25]),
      block(0.1, 0.03, 0.03, CHROME, [s * 0.96, 0.82, -0.15]), block(0.1, 0.03, 0.03, CHROME, [s * 0.96, 0.82, 0.75])]),
    ...wheel(-0.86, -1.35), ...wheel(0.86, -1.35), ...wheel(-0.86, 1.35), ...wheel(0.86, 1.35),
    block(1.86, 0.16, 0.12, DARK, [0, 0.36, -2.12]), block(1.86, 0.16, 0.12, DARK, [0, 0.36, 2.12]), block(1.0, 0.2, 0.04, DARK, [0, 0.6, -2.15]), block(0.5, 0.12, 0.03, 0xf2f0e6, [0, 0.5, 2.17]),   // bumpers, a grille, a plate
    tube([[0.7, 1.5, 0.9], [0.72, 2.0, 1.1]], [0.01, 0.006], DARK, { sides: 3 }),
  ]);
  // A palm, 8.4 m, its middle at y = 0: a ringed trunk with a lean to it, a head of fronds, a few nuts.
  const palm = mergeGeometries([
    sculpt(tube([[0, -4.2, 0], [0.25, -2, 0], [0.2, 1, 0], [-0.1, 4.0, 0]], [0.3, 0.22, 0.19, 0.17], 0x7a644a, { sides: 8, steps: 5 }), (v) => { const k = 1 + 0.07 * Math.sin(v.y * 9); v.x = (v.x - 0.1) * k + 0.1; v.z *= k; }),
    lump(0.34, 0x5a4a34, [-0.1, 4.0, 0], [1, 0.8, 1], 8),
    ...Array.from({ length: 11 }, (_, i) => { const a = i * 0.571 * 2, c = Math.cos(a), s = Math.sin(a), long = 3.4 + (i % 3) * 0.5, up = 0.9 - (i % 4) * 0.35;
      const A = [-0.1, 4.05, 0], B = [-0.1 + c * long * 0.5, 4.1 + up, s * long * 0.5], C = [-0.1 + c * long, 4.05 + up - 1.7, s * long];
      return [tube([A, B, C], [0.05, 0.04, 0.01], GREEN, { sides: 3, steps: 4 }),
        ...[0.25, 0.4, 0.55, 0.7, 0.85].flatMap((t) => { const k = 1 - t, P = [k * k * A[0] + 2 * k * t * B[0] + t * t * C[0], k * k * A[1] + 2 * k * t * B[1] + t * t * C[1] + 0.25 * Math.sin(t * PI), k * k * A[2] + 2 * k * t * B[2] + t * t * C[2]], w = 0.75 * Math.sin(t * PI) + 0.25;
          return [-1, 1].map((d) => tube([P, [P[0] - s * d * w, P[1] - 0.45 - 0.3 * t, P[2] + c * d * w]], [0.07, 0.01], i % 2 ? GREEN : 0x3a6e3c, { sides: 3, squash: 0.25 })); })];
    }).flat(),
    ...[0, 2.1, 4.2].map((a) => lump(0.14, 0x4a3a22, [-0.1 + Math.cos(a) * 0.28, 3.72, Math.sin(a) * 0.28], [1, 1.1, 1], 6)),
  ]);
  // What is on a roof: a water tank on legs, a hut for the stairs, a vent, an aerial. (Stands on y = 0.)
  const roof = mergeGeometries([
    paint(new THREE.CylinderGeometry(1.3, 1.3, 2.2, 12).translate(-3, 2.6, 2), 0x6a5a48), paint(new THREE.ConeGeometry(1.45, 0.8, 12).translate(-3, 4.1, 2), 0x3a3a3e),
    ...[0, 1, 2, 3].map((k) => tube([[-3 + Math.cos(k * 1.57 + 0.78) * 1.1, 0, 2 + Math.sin(k * 1.57 + 0.78) * 1.1], [-3 + Math.cos(k * 1.57 + 0.78) * 1.0, 1.5, 2 + Math.sin(k * 1.57 + 0.78) * 1.0]], [0.07, 0.07], DARK, { sides: 4 })),
    ring(1.32, 0.04, DARK, [-3, 2.0, 2], [PI / 2, 0, 0], PI * 2, 12), ring(1.32, 0.04, DARK, [-3, 3.2, 2], [PI / 2, 0, 0], PI * 2, 12),
    block(2.6, 2.4, 3.0, 0x77726a, [3, 1.2, -1]), block(2.9, 0.2, 3.3, DARK, [3, 2.5, -1]), block(0.9, 1.8, 0.06, 0x2a2622, [3, 0.9, 0.53]),
    block(1.4, 0.9, 1.0, 0x8e9298, [0, 0.45, -3]), paint(new THREE.CylinderGeometry(0.4, 0.4, 0.1, 10).translate(0, 0.95, -3), DARK),
    tube([[4.5, 0, 3], [4.5, 5.5, 3]], [0.05, 0.02], DARK, { sides: 4 }), ...[3.5, 4.3, 5.0].map((y) => tube([[3.7 + (y - 3.5) * 0.3, y, 3], [5.3 - (y - 3.5) * 0.3, y, 3]], [0.02, 0.02], DARK, { sides: 3 })),
    ...[-1, 1].flatMap((s) => [block(15.6, 0.7, 0.3, 0x6a665e, [0, 0.35, s * 5.2]), block(0.3, 0.7, 10.4, 0x6a665e, [s * 7.8, 0.35, 0])]),   // the parapet
  ]);
  // The foot of a building, on the pavement, facing +z: a shop window under a striped awning, a door, a drainpipe, a balcony.
  const awning = sculpt(paint(new THREE.PlaneGeometry(6.4, 2.0, 16, 4).rotateX(-PI / 2 + 0.5).translate(0, 3.3, 1.0), 0xffffff), (v) => { if (v.z > 1.7) v.y -= 0.18 * Math.abs(Math.sin(v.x * 2.45)); });
  { const p = awning.attributes.position, c = awning.attributes.color; for (let i = 0; i < p.count; i++) { const k = Math.floor((p.getX(i) + 3.2) / 0.8) % 2 ? 1 : 0.42; c.setXYZ(i, k, k * 0.92, k * 0.84); } }
  const front = mergeGeometries([
    awning, tube([[-3.2, 2.85, 1.85], [3.2, 2.85, 1.85]], [0.03, 0.03], DARK, { sides: 4 }), ...[-3.2, 3.2].map((x) => tube([[x, 2.85, 1.85], [x, 2.6, 0.05]], [0.025, 0.025], DARK, { sides: 3 })),
    block(6.2, 0.5, 0.3, 0x55514a, [0, 0.25, 0.15]), block(0.16, 2.3, 0.16, DARK, [-3.0, 1.6, 0.1]), block(0.16, 2.3, 0.16, DARK, [-0.4, 1.6, 0.1]), block(2.8, 0.14, 0.16, DARK, [-1.7, 2.75, 0.1]), block(0.08, 2.2, 0.1, DARK, [-1.7, 1.6, 0.1]),   // the window's frame
    block(1.5, 2.9, 0.12, 0x3a2a1e, [1.6, 1.45, 0.08]), block(1.1, 1.0, 0.04, 0x2a1e14, [1.6, 0.75, 0.15]), block(0.08, 0.3, 0.1, CHROME, [1.05, 1.4, 0.18]), block(1.9, 0.14, 0.9, 0x55514a, [1.6, 0.07, 0.45]),             // the door, its step
    tube([[3.6, 0, 0.18], [3.6, 12, 0.18]], [0.09, 0.09], 0x3a3e44, { sides: 5 }), ...[2, 6, 10].map((y) => ring(0.1, 0.025, DARK, [3.6, y, 0.18], [PI / 2, 0, 0], PI * 2, 6)),
    block(4.6, 0.14, 1.1, 0x4a4640, [-0.4, 6.6, 0.55]), ...Array.from({ length: 10 }, (_, i) => block(0.05, 0.95, 0.05, DARK, [-2.6 + i * 0.49, 7.1, 1.05])), block(4.6, 0.06, 0.06, DARK, [-0.4, 7.6, 1.05]), block(0.06, 0.06, 1.1, DARK, [-2.65, 7.6, 0.55]), block(0.06, 0.06, 1.1, DARK, [1.85, 7.6, 0.55]),   // a balcony...
    ...[-1.8, -0.4, 1.0].map((x) => lump(0.3, 0x3a6e3c, [x, 6.95, 0.8], [1.3, 0.8, 0.8], 6)), block(3.6, 0.3, 0.4, 0x7a4a30, [-0.4, 6.82, 0.8]),                                                                              // ...with a box of something green on it
    block(0.9, 0.6, 0.7, 0x8e9298, [2.7, 5.2, 0.35]),
    paint(new THREE.CylinderGeometry(0.3, 0.26, 0.9, 10).translate(-3.9, 0.45, 0.6), 0x2d5a34), ring(0.3, 0.03, DARK, [-3.9, 0.9, 0.6], [PI / 2, 0, 0], PI * 2, 10),                                                           // a bin
    turned([[0.16, 0], [0.16, 0.5], [0.1, 0.6], [0.12, 0.72], [0.0, 0.8]], 0xb3261e, [4.3, 0, 0.9], 8), ...[-1, 1].map((s) => tube([[4.3, 0.42, 0.9], [4.3 + s * 0.24, 0.42, 0.9]], [0.06, 0.06], 0xb3261e, { sides: 5 })),    // a hydrant
  ]);
  const frontGlow = mergeGeometries([new THREE.PlaneGeometry(2.5, 2.1).translate(-1.7, 1.6, 0.06), new THREE.PlaneGeometry(1.1, 0.5).translate(1.6, 2.6, 0.16), new THREE.PlaneGeometry(1.6, 2.4).translate(-0.4, 8.2, 0.03)]);
  // A pine: a trunk, and five skirts of boughs, each drooping and ragged at its edge.
  const pine = mergeGeometries([
    paint(new THREE.CylinderGeometry(0.16, 0.36, 4.6, 6).translate(0, 2.3, 0), 0x3a2c20),
    ...[[2.5, 3.0, 2.0, 0x1b3626], [2.1, 2.7, 3.7, 0x1f3d2a], [1.65, 2.5, 5.3, 0x25472f], [1.2, 2.3, 6.8, 0x2b5236], [0.75, 2.2, 8.2, 0x316040]].map(([r, tall, y, col], k) =>
      dirty(sculpt(paint(new THREE.ConeGeometry(r, tall, 11, 2, true).translate(0, y + tall / 2, 0), col), (v) => { const a = Math.atan2(v.z, v.x), edge = Math.max(0, 1 - (v.y - y) / tall); v.y -= edge * edge * (0.5 + 0.35 * Math.sin(a * 5 + k)); const s = 1 + edge * 0.14 * Math.sin(a * 11 + k * 2); v.x *= s; v.z *= s; }), { mottle: 0.4, freq: 1.5, under: 0.5 })),
  ]);
  return { lamp, car, palm, roof, front, frontGlow, pine, boulder: decor().rock, tree: (rand) => tree(rand, 3) };
}
