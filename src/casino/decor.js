// The casino's fittings: what the players' casino (casino/room.js) and Babitus's house (world/houseScene.js, the same
// room blown up to the size of an arena) are both furnished with. Everything here is made with the monsters' sculpting
// kit (enemies/sculpt.js) and carries its own paint on its points (gilt, velvet, wood, glass): draw it with painted().
//
// Each maker takes how big to make it and hands back a geometry (or a few, or a Group where something in it moves),
// stood on y = 0 unless it says otherwise. The painted surfaces (marble, panels, the ceiling, the rug, the baize, the
// night outside) are at the bottom.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { tube, lump, sculpt, dirty, paint, slab, spikes } from '../enemies/sculpt.js';

const PI = Math.PI, TAU = PI * 2;
export const GILT = 0xd9b04a, DEEP = 0x8a6a22, CREAM = 0xe9dfc6, VELVET = 0x8a1420, WOOD = 0x3a2116, DARK = 0x14100c, GLASS = 0xf6f2ff, LEAF = 0x1f6a36, BRASS = 0xc79a3a;
export const painted = (extra = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.15, emissive: 0x120c04, ...extra });
const ring = (R, r, color, at, turn = [PI / 2, 0, 0], around = 24) => paint(new THREE.TorusGeometry(R, r, 6, around).rotateX(turn[0]).rotateY(turn[1]).rotateZ(turn[2]).translate(...at), color);
const box = (w, h, d, color, at) => paint(new THREE.BoxGeometry(w, h, d).translate(...at), color);
const turned = (profile, color, at = [0, 0, 0], around = 18) => paint(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), around).translate(...at), color);
const sized = (geo, k) => geo.scale(k, k, k);

// ---- Columns ----------------------------------------------------------------------------------------------------
// A fluted column, `tall` from floor to ceiling and `r` thick at its shaft: a stepped base, a gilt collar, the shaft
// (its flutes cut in), and a capital of leaves with a scroll at each corner. Centred on its middle.
export function column(tall, r) {
  const t = tall / r;
  return sized(mergeGeometries([
    dirty(sculpt(paint(new THREE.CylinderGeometry(1.0, 1.22, t - 3.4, 28, 8, true), CREAM), (v) => { const k = 1 - 0.06 * Math.abs(Math.sin(Math.atan2(v.z, v.x) * 12)); v.x *= k; v.z *= k; }), { mottle: 0.12, freq: 0.6, under: 0.3 }),   // the shaft, fluted
    ring(1.3, 0.22, GILT, [0, -t / 2 + 1.75, 0]), ring(1.42, 0.16, DEEP, [0, -t / 2 + 1.45, 0]), box(3.2, 1.1, 3.2, CREAM, [0, -t / 2 + 0.75, 0]), box(3.4, 0.25, 3.4, GILT, [0, -t / 2 + 1.3, 0]), box(3.5, 0.2, 3.5, DEEP, [0, -t / 2 + 0.1, 0]),   // its base
    ring(1.06, 0.14, GILT, [0, t / 2 - 2.0, 0]), turned([[1.0, 0], [1.25, 0.5], [1.7, 1.0], [1.7, 1.2]], GILT, [0, t / 2 - 1.9, 0], 24),                                                                  // the capital...
    ...[0, 1, 2, 3].flatMap((k) => { const a = k * PI / 2 + PI / 4, c = Math.cos(a), s = Math.sin(a); return [ring(0.42, 0.13, GILT, [c * 1.75, t / 2 - 1.05, s * 1.75], [0, -a + PI / 2, 0], 14), lump(0.16, DEEP, [c * 1.75, t / 2 - 1.05, s * 1.75], [1, 1, 1], 6)]; }),   // ...a scroll at each corner...
    ...Array.from({ length: 12 }, (_, i) => { const a = i * PI / 6; return tube([[Math.cos(a) * 1.05, t / 2 - 1.9, Math.sin(a) * 1.05], [Math.cos(a) * 1.35, t / 2 - 1.3, Math.sin(a) * 1.35], [Math.cos(a) * 1.6, t / 2 - 1.2, Math.sin(a) * 1.6]], [0.14, 0.12, 0.03], i % 2 ? GILT : DEEP, { sides: 4, steps: 3 }); }),   // ...and leaves between
    box(3.3, 0.5, 3.3, GILT, [0, t / 2 - 0.25, 0]),
  ]), r);
}

// ---- Chandeliers ------------------------------------------------------------------------------------------------
// Three tiers of lights on curved arms off a turned stem, a cup under each light, a drop of glass under each cup and
// swags of it between them, and the great drop under the lot. size: its bottom tier is 2.4 of these across (its
// middle is at the Group's origin; it hangs from `hang` above that). glow: what its lights are drawn with.
export function chandelier(size, glow, hang = 4 + size * 2) {
  const c = new THREE.Group(), gold = new THREE.MeshStandardMaterial({ color: 0xc9a44a, roughness: 0.35, metalness: 0.5, emissive: 0x2a1c04 });
  const TIERS = [[size * 2.4, 0], [size * 1.5, size * 1.1], [size * 0.7, size * 2]], lights = [];
  for (const [r, y] of TIERS) for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; lights.push(new THREE.SphereGeometry(size * 0.2, 8, 6).scale(0.8, 1.25, 0.8).translate(Math.cos(a) * r, y + size * 0.26, Math.sin(a) * r)); }
  c.add(new THREE.Mesh(mergeGeometries(lights), glow));
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.06, size * 0.06, hang, 6), gold);
  chain.position.y = size * 2.9 + hang / 2;
  c.add(chain);
  const bits = [turned([[0.02, -1.0], [0.3, -0.7], [0.12, -0.4], [0.34, 0], [0.16, 0.6], [0.3, 1.2], [0.12, 2.0], [0.2, 2.6], [0.05, 3.0]].map(([r, y]) => [r * size, y * size]), GILT), lump(size * 0.26, GLASS, [0, -size * 1.25, 0], [1, 1.5, 1], 8)];   // the stem, and the great drop under it
  for (const [r, y] of TIERS) {
    bits.push(ring(r, size * 0.07, GILT, [0, y, 0], [PI / 2, 0, 0], 28));
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU, cx = Math.cos(a), sz = Math.sin(a);
      bits.push(tube([[cx * size * 0.2, y + size * 0.5, sz * size * 0.2], [cx * r * 0.6, y - size * 0.35, sz * r * 0.6], [cx * r, y, sz * r]], [size * 0.05, size * 0.04, size * 0.035], GILT, { sides: 5, steps: 4 }),   // an arm
        turned([[0.0, 0], [0.16, 0.02], [0.2, 0.12], [0.1, 0.14]].map(([rr, yy]) => [rr * size, yy * size]), DEEP, [cx * r, y + size * 0.02, sz * r], 8),                                                    // a cup under each light
        ...spikes(1, () => [[cx * r, y - size * 0.05, sz * r], [cx * r, y - size * (0.55 + 0.2 * (i % 2)), sz * r], size * 0.07], GLASS),                                                                    // a drop of glass
        ...(i % 2 ? [] : [tube([[cx * r, y - size * 0.1, sz * r], [Math.cos(a + 0.31) * r * 0.97, y - size * 0.5, Math.sin(a + 0.31) * r * 0.97], [Math.cos(a + 0.63) * r, y - size * 0.1, Math.sin(a + 0.63) * r]], [size * 0.02, size * 0.03, size * 0.02], GLASS, { sides: 4, steps: 4 })]));   // and a swag of it to the next
    }
  }
  c.add(new THREE.Mesh(mergeGeometries(bits), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.3, emissive: 0x3a2c12 })));
  return c;
}
// The plaster rose on the ceiling that one hangs from: rings of leaves round a boss. r: how far across it is, from its middle.
export function ceilingRose(r) {
  return sized(mergeGeometries([
    turned([[0, 0], [1.0, 0], [0.96, -0.06], [0.7, -0.1], [0.62, -0.05], [0.3, -0.14], [0.12, -0.22], [0, -0.24]], CREAM, [0, 0, 0], 28),
    ring(0.98, 0.035, GILT, [0, -0.03, 0], [PI / 2, 0, 0], 32), ring(0.64, 0.03, GILT, [0, -0.08, 0], [PI / 2, 0, 0], 28),
    ...Array.from({ length: 14 }, (_, i) => { const a = (i / 14) * TAU; return lump(0.1, i % 2 ? GILT : DEEP, [Math.cos(a) * 0.82, -0.07, Math.sin(a) * 0.82], [1.5, 0.4, 0.7], 6).rotateY(0); }),
    ...Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * TAU + 0.2; return tube([[Math.cos(a) * 0.16, -0.2, Math.sin(a) * 0.16], [Math.cos(a) * 0.36, -0.16, Math.sin(a) * 0.36], [Math.cos(a) * 0.54, -0.09, Math.sin(a) * 0.54]], [0.05, 0.07, 0.015], GILT, { sides: 4, steps: 3 }); }),
  ]), r);
}

// ---- Windows, and what hangs at them ----------------------------------------------------------------------------
// Velvet curtains for a bay `wide` across, hanging `drop` from their rail: one each side, caught back with a cord, a
// pelmet across the top and a gilt rail with a ball on each end. Its rail is at y = 0, the wall behind it at z = 0.
export function drapes(wide, drop) {
  const k = wide / 10, d = drop / k, curtain = [];
  for (const s of [-1, 1]) curtain.push(dirty(sculpt(paint(new THREE.PlaneGeometry(4.2, d, 22, 14).translate(s * 2.3, -d / 2, 0), VELVET), (v) => {
    const t = -v.y / d, gather = Math.exp(-((t - 0.62) ** 2) * 30);                 // (pulled in to the side where the cord is)
    v.z = 0.5 + 0.28 * Math.sin(v.x * 6.5 + t * 2) * (1 - 0.4 * gather);
    v.x = s * 4.3 + (v.x - s * 4.3) * (1 - 0.62 * gather) * (1 - 0.12 * Math.sin(t * PI));
  }), { mottle: 0.25, freq: 0.5, under: 0 }));
  for (const s of [-1, 1]) curtain.push(ring(0.5, 0.07, GILT, [s * 3.75, -d * 0.62, 0.6], [PI / 2, 0, 0], 12), tube([[s * 4.3, -d * 0.62, 0.3], [s * 4.5, -d * 0.62 - 1.2, 0.6]], [0.06, 0.14, 0.02], GILT, { sides: 5, steps: 3 }));
  curtain.push(tube([[-5, 0.2, 0.6], [5, 0.2, 0.6]], [0.16, 0.16], GILT, { sides: 8 }), lump(0.3, GILT, [-5.1, 0.2, 0.6], [1, 1, 1], 8), lump(0.3, GILT, [5.1, 0.2, 0.6], [1, 1, 1], 8),
    dirty(sculpt(paint(new THREE.PlaneGeometry(9.6, 1.8, 30, 3).translate(0, -0.7, 0), 0x6a0f18), (v) => { v.z = 0.75 + 0.15 * Math.sin(v.x * 6.5); v.y -= 0.35 * Math.abs(Math.sin(v.x * 0.98)); }), { mottle: 0.2, freq: 0.5, under: 0 }),   // a pelmet across the top
    ...Array.from({ length: 9 }, (_, i) => lump(0.11, GILT, [-4.4 + i * 1.1, -1.72 - 0.35 * Math.abs(Math.sin((-4.4 + i * 1.1) * 0.98)), 0.82], [1, 1.5, 1], 5)));   // ...and a tassel at each of its points
  return sized(mergeGeometries(curtain), k);
}
// The frame of an arched window `w` wide and `h` high (its sill at y = 0, the wall at z = 0): a gilt moulding round
// it, glazing bars across it and fanned out in its arch, a sill on two brackets, and a keystone.
export function windowFrame(w, h) {
  const R = w / 2, spring = h - R, bits = [], arc = (r, thick, color, z = 0.06) => Array.from({ length: 14 }, (_, i) => { const a = (i / 14) * PI, b = ((i + 1) / 14) * PI; return tube([[Math.cos(a) * r, spring + Math.sin(a) * r, z], [Math.cos(b) * r, spring + Math.sin(b) * r, z]], [thick, thick], color, { sides: 6 }); });
  bits.push(...arc(R, 0.09, GILT), ...arc(R + 0.13, 0.045, DEEP, 0.03));
  for (const s of [-1, 1]) bits.push(tube([[s * R, 0, 0.06], [s * R, spring, 0.06]], [0.09, 0.09], GILT, { sides: 6 }), tube([[s * (R + 0.13), 0, 0.03], [s * (R + 0.13), spring, 0.03]], [0.045, 0.045], DEEP, { sides: 5 }));
  bits.push(tube([[0, 0, 0.05], [0, spring, 0.05]], [0.035, 0.035], GILT, { sides: 5 }), tube([[-R, spring, 0.05], [R, spring, 0.05]], [0.045, 0.045], GILT, { sides: 5 }), tube([[-R, spring * 0.5, 0.05], [R, spring * 0.5, 0.05]], [0.03, 0.03], GILT, { sides: 5 }));
  for (const a of [PI / 4, PI / 2, (3 * PI) / 4]) bits.push(tube([[0, spring, 0.05], [Math.cos(a) * R, spring + Math.sin(a) * R, 0.05]], [0.03, 0.03], GILT, { sides: 5 }));
  bits.push(slab(w + 0.6, 0.12, 0.34, CREAM, [0, -0.06, 0.14]), slab(w + 0.7, 0.05, 0.38, GILT, [0, 0.02, 0.15]), ...[-1, 1].map((s) => turned([[0.0, 0], [0.13, 0.03], [0.1, 0.16], [0.05, 0.3]], DEEP, [s * (R - 0.25), -0.42, 0.14], 8)),
    lump(0.2, GILT, [0, h + 0.06, 0.08], [0.8, 1.2, 0.5], 8), ring(R * 0.3, 0.025, GILT, [0, spring, 0.05], [0, 0, 0], 16));
  return mergeGeometries(bits);
}
// A lamp on a bracket for a wall: a backplate, a curled arm, a cup and two smaller cups on side arms. Its plate is at
// the origin, the wall at z = 0. { lamp, flames }: the lamp, and what burns in its cups (to be drawn lit). s: its size.
export function sconce(s = 1) {
  const lamp = mergeGeometries([
    turned([[0.0, 0], [0.5, 0.05], [0.42, 0.2], [0.2, 0.3]], GILT, [0, 0, 0.2], 12), tube([[0, 0.2, 0.2], [0, 0.5, 0.9], [0, 1.3, 1.1]], [0.09, 0.07, 0.06], GILT, { sides: 5, steps: 4 }),
    turned([[0.1, 0], [0.34, 0.1], [0.3, 0.3], [0.12, 0.34]], DEEP, [0, 1.3, 1.1], 10), ...[-1, 1].map((d) => tube([[0, 0.6, 0.9], [d * 0.6, 0.7, 0.8], [d * 0.8, 1.2, 0.9]], [0.05, 0.04, 0.04], GILT, { sides: 4, steps: 3 })),
    ...[-1, 1].map((d) => turned([[0.08, 0], [0.24, 0.08], [0.2, 0.22]], DEEP, [d * 0.8, 1.2, 0.9], 8)),
  ]);
  const flames = mergeGeometries([[0, 1.75, 1.1, 0.26], [-0.8, 1.55, 0.9, 0.2], [0.8, 1.55, 0.9, 0.2]].map(([x, y, z, r]) => new THREE.SphereGeometry(r, 8, 6).scale(1, 1.5, 1).translate(x, y, z)));
  return { lamp: sized(lamp, s), flames: sized(flames, s) };
}

// ---- Slot machines ----------------------------------------------------------------------------------------------
// What is bolted on to a slot machine's cabinet (1.9 x 4.6 x 1.6 of these, centred on its middle, its screen at
// z = 0.81): a lit sign over the top, the frame round the reels and the bars between them, a sloping shelf of
// buttons, the tray, the arm you pull (`arm`: false leaves that off, for a machine with one of its own that moves).
export const SLOT = { size: [1.9, 4.6, 1.6], screen: [1.5, 1.3], screenAt: [0, 0.9, 0.81] };
export function slotTrim(s = 1, arm = true) {
  return sized(mergeGeometries([
    paint(new THREE.CylinderGeometry(1.0, 1.0, 1.6, 20, 1, false, 0, PI).rotateX(PI / 2).rotateZ(PI / 2).translate(0, 2.75, 0), VELVET),
    ...Array.from({ length: 9 }, (_, i) => { const a = (i / 8) * PI; return lump(0.09, 0xffe08a, [Math.cos(a) * 0.86, 2.75 + Math.sin(a) * 0.86, 0.82], [1, 1, 0.6], 6); }),   // bulbs round the sign
    slab(1.1, 0.34, 0.04, GILT, [0, 3.05, 0.81]), slab(0.7, 0.06, 0.05, VELVET, [0, 3.1, 0.82]), slab(0.5, 0.06, 0.05, VELVET, [0, 2.98, 0.82]),
    slab(1.74, 0.12, 0.1, GILT, [0, 1.6, 0.82]), slab(1.74, 0.12, 0.1, GILT, [0, 0.2, 0.82]), slab(0.12, 1.5, 0.1, GILT, [-0.81, 0.9, 0.82]), slab(0.12, 1.5, 0.1, GILT, [0.81, 0.9, 0.82]),   // the frame
    slab(0.05, 1.3, 0.04, DARK, [-0.25, 0.9, 0.825]), slab(0.05, 1.3, 0.04, DARK, [0.25, 0.9, 0.825]), slab(1.5, 0.03, 0.05, 0xff3a2a, [0, 0.9, 0.83]),                          // between the reels; the pay line
    slab(1.9, 0.14, 0.6, DARK, [0, -0.2, 1.0], [0.5, 0, 0]),                                                                                                                  // the shelf...
    ...[0xff3a2a, 0xffc233, 0x3dff7a, 0x6fe3ff, 0xff5ad0].map((col, i) => lump(0.1, col, [-0.6 + i * 0.3, -0.1, 1.08], [1, 0.5, 1], 6)),                                        // ...of buttons
    slab(1.3, 0.1, 0.4, GILT, [0, -1.3, 0.95]), slab(1.3, 0.3, 0.06, GILT, [0, -1.18, 1.14]), slab(0.9, 0.14, 0.04, DARK, [0, -0.85, 0.815]),                                   // the tray, and the slot the coins fall from
    ...[-1.75, -1.95, -2.15].map((y) => slab(1.2, 0.05, 0.04, DARK, [0, y, 0.815])),                                                                                           // a grille
    ...(arm ? [tube([[1.0, 0.0, 0.3], [1.3, 0.2, 0.35], [1.38, 1.5, 0.5]], [0.08, 0.06, 0.05], 0xb9bec4, { sides: 6, steps: 4 }), lump(0.17, 0xff3a2a, [1.38, 1.6, 0.5], [1, 1, 1], 8)] : []),   // the arm
    ...[-1, 1].map((d) => slab(0.06, 4.4, 0.2, GILT, [d * 0.96, 0, 0.7])), slab(2.1, 0.3, 1.8, DARK, [0, -2.2, 0]),
    ...[0, 1, 2, 3, 4, 5, 6].map((i) => lump(0.06, i % 2 ? 0xffe08a : 0xff5ad0, [-0.78 + i * 0.26, 1.78, 0.83], [1, 1, 0.6], 5)),
  ]), s);
}

// ---- Doors ------------------------------------------------------------------------------------------------------
// The casino's doors. leaf: what is on each one (5.6 x 13 x 0.4 of these: six raised panels a side, a brass plate
// along the bottom, hinges, a long handle). doorway: the piers either side of them and the fan of gilt over the top
// (the middle of the threshold at the origin, the wall at z = 0, the room towards -z).
export const DOOR = { leaf: [5.6, 13, 0.4], gap: 11.4 };
export function doorTrim(s = 1) {
  return sized(mergeGeometries([
    ...[-1, 1].flatMap((f) => [
      ...[-1, 1].flatMap((x) => [-4.1, 0, 4.1].flatMap((y) => [slab(2.1, 3.3, 0.08, 0x4a2a1c, [x * 1.3, y + 0.3, f * 0.22]), slab(1.5, 2.7, 0.08, 0x2e1a10, [x * 1.3, y + 0.3, f * 0.25]), slab(2.3, 0.1, 0.1, GILT, [x * 1.3, y + 2.0, f * 0.24])])),
      slab(5.6, 0.9, 0.06, GILT, [0, -5.9, f * 0.22]),
      tube([[2.2, -1.4, f * 0.3], [2.2, -1.0, f * 0.55], [2.2, 1.0, f * 0.55], [2.2, 1.4, f * 0.3]], [0.09, 0.09, 0.09, 0.09], GILT, { sides: 6, steps: 3 }),
    ]),
    ...[-5, 0, 5].map((y) => tube([[-2.85, y - 0.5, 0], [-2.85, y + 0.5, 0]], [0.16, 0.16], DEEP, { sides: 6 })),
  ]), s);
}
export function doorway(s = 1) {
  return sized(mergeGeometries([
    ...[-1, 1].flatMap((d) => [box(1.4, 14, 1.2, CREAM, [d * 6.7, 7, -0.5]), box(1.7, 0.6, 1.5, GILT, [d * 6.7, 0.3, -0.5]), box(1.7, 0.6, 1.5, GILT, [d * 6.7, 13.7, -0.5])]),
    ...Array.from({ length: 9 }, (_, i) => { const a = (i / 8) * PI; return tube([[0, 14.2, -0.5], [Math.cos(a) * 6.4, 14.2 + Math.sin(a) * 4.2, -0.5]], [0.12, 0.2], i % 2 ? GILT : DEEP, { sides: 5 }); }),
    ...Array.from({ length: 16 }, (_, i) => { const a = (i / 16) * PI, b = ((i + 1) / 16) * PI; return tube([[Math.cos(a) * 6.5, 14.2 + Math.sin(a) * 4.3, -0.5], [Math.cos(b) * 6.5, 14.2 + Math.sin(b) * 4.3, -0.5]], [0.28, 0.28], GILT, { sides: 6 }); }),
    lump(0.9, GILT, [0, 14.4, -0.6], [1, 1, 0.5], 12), box(13, 1, 0.9, GILT, [0, 13.5, -0.3]),
  ]), s);
}

// ---- The bar ----------------------------------------------------------------------------------------------------
// A bottle: shoulders, a neck, a lip. 1.55 of these tall, stood on y = -0.65.
export const bottle = (s = 1) => sized(new THREE.LatheGeometry([[0, -0.65], [0.3, -0.65], [0.32, -0.55], [0.32, 0.1], [0.24, 0.3], [0.1, 0.42], [0.09, 0.8], [0.12, 0.82], [0.12, 0.9], [0, 0.9]].map(([r, y]) => new THREE.Vector2(r, y)), 10), s);
// What is behind a bar `long`: three shelves on gilt brackets with a rail along the front of each, and a gilt frame
// round the mirror behind them with a crest on top. It runs along z, its back to +x (the wall), from y = 0 (the
// bottom of the frame) up; a shelf every `step`. shelves: [the y of each shelf top], for whoever stands bottles on them.
export function backBar(long, s = 1) {
  const L = long / s, step = 2.6, half = L / 2, shelves = [0.65, 0.65 + step, 0.65 + step * 2], props = Math.max(2, Math.round(L / 7));
  const geo = sized(mergeGeometries([
    ...shelves.flatMap((y) => [box(1.3, 0.16, L - 1.4, WOOD, [-1.15, y, 0]), box(0.5, 0.1, L - 1.2, GILT, [-1.75, y, 0]),
      ...Array.from({ length: props }, (_, i) => { const z = -half + 1.6 + (i * (L - 3.2)) / (props - 1); return tube([[-0.55, y - 0.95, z], [-1.55, y - 0.1, z]], [0.08, 0.08], GILT, { sides: 4 }); })]),
    box(0.2, 9.6, 0.5, GILT, [0, 4.7, -half]), box(0.2, 9.6, 0.5, GILT, [0, 4.7, half]), box(0.2, 0.5, L + 0.5, GILT, [0, 9.4, 0]), box(0.2, 0.5, L + 0.5, GILT, [0, 0, 0]),
    lump(1.1, GILT, [-0.05, 10.1, 0], [0.3, 0.8, 1.6], 10), ...[-1, 1].map((d) => lump(0.5, DEEP, [-0.05, 9.9, d * 2.2], [0.3, 0.7, 1.2], 8)),
  ]), s);
  return { geo, shelves: shelves.map((y) => y * s), deep: 1.15 * s, mirror: [(L - 0.4) * s, 8.9 * s, 4.7 * s] };
}
// The front of a bar counter `long` (along z), `high`, facing -x: panels between pilasters, a kick plate, a brass foot
// rail on brackets, and a rounded lip along the edge of its top. Its foot is at the origin.
export function barFront(long, high) {
  const n = Math.max(3, Math.round(long / 1.5)), bay = long / n, bits = [];
  for (let i = 0; i < n; i++) {
    const z = -long / 2 + (i + 0.5) * bay;
    bits.push(slab(0.05, high - 0.42, bay - 0.2, 0x4a2a1c, [-0.02, high / 2 - 0.02, z]), slab(0.05, high - 0.66, bay - 0.44, 0x2e1a10, [-0.045, high / 2 - 0.02, z]),
      slab(0.06, 0.035, bay - 0.4, GILT, [-0.06, high - 0.36, z]), slab(0.06, 0.035, bay - 0.4, GILT, [-0.06, 0.32, z]));
  }
  for (let i = 0; i <= n; i++) {
    const z = -long / 2 + i * bay;
    bits.push(slab(0.09, high - 0.1, 0.13, WOOD, [-0.03, high / 2 - 0.05, z]), slab(0.11, 0.07, 0.17, GILT, [-0.04, high - 0.16, z]), slab(0.11, 0.07, 0.17, GILT, [-0.04, 0.2, z]),
      tube([[-0.02, 0.22, z], [-0.26, 0.22, z]], [0.022, 0.022], BRASS, { sides: 5 }));   // a bracket for the foot rail
  }
  bits.push(slab(0.07, 0.16, long, DARK, [-0.03, 0.08, 0]), tube([[-0.26, 0.22, -long / 2], [-0.26, 0.22, long / 2]], [0.032, 0.032], BRASS, { sides: 8 }),
    tube([[-0.1, high, -long / 2 - 0.1], [-0.1, high, long / 2 + 0.1]], [0.05, 0.05], GILT, { sides: 8 }));   // the lip of the top
  return mergeGeometries(bits);
}
// A stool: a buttoned velvet seat on a turned gilt stem, a ring for his feet, and a weighted foot. seat: how high its top is.
export function stool(seat, r = 0.28) {
  return mergeGeometries([
    dirty(sculpt(paint(new THREE.CylinderGeometry(r, r * 0.94, 0.12, 20, 2).translate(0, seat - 0.06, 0), 0x7a1220), (v) => { if (v.y > seat - 0.01) v.y += 0.035 * (1 - (Math.hypot(v.x, v.z) / r) ** 2) - 0.012 * Math.max(0, Math.cos(Math.atan2(v.z, v.x) * 6)) * (Math.hypot(v.x, v.z) / r); }), { mottle: 0.2, freq: 3, under: 0 }),
    ring(r * 0.98, 0.016, GILT, [0, seat - 0.115, 0], [PI / 2, 0, 0], 20), ...Array.from({ length: 6 }, (_, i) => lump(0.014, GILT, [Math.cos((i / 6) * TAU) * r * 0.55, seat + 0.012, Math.sin((i / 6) * TAU) * r * 0.55], [1, 0.5, 1], 5)),
    turned([[0.1, seat - 0.12], [0.05, seat - 0.2], [0.04, seat * 0.55], [0.06, seat * 0.5], [0.04, seat * 0.45], [0.045, 0.1], [0.24, 0.05], [0.27, 0.02], [0.27, 0]], GILT, [0, 0, 0], 16),
    ring(0.2, 0.016, GILT, [0, 0.3, 0], [PI / 2, 0, 0], 18), ...[0, 1, 2].map((i) => tube([[Math.cos(i * 2.094) * 0.045, 0.3, Math.sin(i * 2.094) * 0.045], [Math.cos(i * 2.094) * 0.2, 0.3, Math.sin(i * 2.094) * 0.2]], [0.012, 0.012], GILT, { sides: 4 })),
  ]);
}

// A lamp hung over the bar on a rod `drop` long (its top at y = 0): { shade, bulb }: a gilt shade, and the light in it (to be drawn lit).
export function pendant(drop = 1.2) {
  return { shade: mergeGeometries([tube([[0, 0, 0], [0, -drop + 0.3, 0]], [0.012, 0.012], DEEP, { sides: 5 }), turned([[0.03, 0.02], [0.05, 0], [0.09, -0.06], [0.2, -0.2], [0.24, -0.3], [0.25, -0.32]], GILT, [0, -drop + 0.32, 0], 16), ring(0.25, 0.012, DEEP, [0, -drop, 0], [PI / 2, 0, 0], 20), turned([[0, 0.05], [0.07, 0.03], [0.05, 0]], GILT, [0, -0.05, 0], 10)]),
    bulb: new THREE.SphereGeometry(0.075, 10, 8).scale(1, 1.2, 1).translate(0, -drop + 0.12, 0) };
}
// The leg of a table: a turned pedestal `high`, on a spreading gilt foot. r: how thick it is at its waist.
export function pedestal(high, r = 0.3) {
  return mergeGeometries([turned([[r * 3.1, 0], [r * 3.2, 0.05], [r * 2.6, 0.12], [r * 1.5, 0.17]], GILT, [0, 0, 0], 22),
    dirty(turned([[r * 1.5, 0.17], [r * 1.1, 0.3], [r * 1.55, 0.42], [r * 1.0, 0.52], [r, high * 0.62], [r * 1.35, high * 0.74], [r * 1.9, high - 0.1], [r * 2.0, high]], 0x4a2a14, [0, 0, 0], 22), { mottle: 0.2, freq: 3, under: 0 }),
    ring(r * 1.5, 0.03, GILT, [0, 0.42, 0], [PI / 2, 0, 0], 20), ring(r * 1.32, 0.025, GILT, [0, high * 0.74, 0], [PI / 2, 0, 0], 20)]);
}

// ---- Somewhere to sit ---------------------------------------------------------------------------------------------
// A sofa `long` (a seat for every 0.76 of that), buttoned velvet on gilt feet: a plump cushion to each seat, a tufted
// back with a row of gilt buttons in it, rolled arms. It faces +z, its middle at the origin; its seats are SEAT high.
// An armchair is a short one.
export const SEAT = 0.46;
export function sofa(long = 2.3) {
  const deep = 0.92, seats = Math.max(1, Math.round(long / 0.76)), each = long / seats, bits = [];
  bits.push(dirty(box(long + 0.3, 0.2, deep, 0x4a0b14, [0, 0.24, 0]), { mottle: 0.2, freq: 2, under: 0.3 }), box(long + 0.32, 0.035, deep + 0.02, GILT, [0, 0.135, 0]));
  for (let i = 0; i < seats; i++) {   // the cushions: plump in the middle, pinched at their edges
    const x = -long / 2 + (i + 0.5) * each;
    bits.push(dirty(sculpt(paint(new THREE.BoxGeometry(each - 0.03, 0.17, deep - 0.24, 8, 2, 8).translate(x, SEAT - 0.085, 0.1), VELVET), (v) => { const u = (v.x - x) / (each / 2), w = (v.z - 0.1) / ((deep - 0.24) / 2); if (v.y > SEAT - 0.09) v.y += 0.035 * (1 - u * u) * (1 - w * w) - 0.012; }), { mottle: 0.22, freq: 2.5, under: 0 }));
  }
  // (the back: leant a little, its face quilted, a button in each dimple)
  bits.push(dirty(sculpt(paint(new THREE.BoxGeometry(long, 0.58, 0.2, 18, 8, 2).translate(0, SEAT + 0.3, -deep / 2 + 0.12), VELVET), (v) => {
    const up = v.y - SEAT; v.z -= 0.16 * up;
    if (v.z > -deep / 2 + 0.12 - 0.16 * up) v.z += 0.028 * Math.abs(Math.sin(v.x * 9.2)) * Math.abs(Math.sin(up * 9.5)) - 0.012;
    if (up > 0.5) v.y += 0.03 * Math.cos((v.x / long) * PI * seats * 2) * 0.5;
  }), { mottle: 0.22, freq: 2.5, under: 0 }));
  for (let i = 0; i < Math.round(long / 0.34); i++) for (const up of [0.2, 0.42]) { const x = -long / 2 + 0.17 + i * 0.34 + (up > 0.3 ? 0.17 : 0); if (x < long / 2 - 0.05) bits.push(lump(0.017, GILT, [x, SEAT + up, -deep / 2 + 0.215 - 0.16 * up], [1, 1, 0.6], 5)); }
  for (const side of [-1, 1]) {   // the arms: rolled over at the top, a gilt rosette on the end of each roll
    const x = side * (long / 2 + 0.08);
    bits.push(dirty(box(0.17, 0.42, deep, VELVET, [x, 0.45, 0]), { mottle: 0.2, freq: 2.5, under: 0 }), dirty(paint(new THREE.CylinderGeometry(0.115, 0.115, deep, 14, 1).rotateX(PI / 2).translate(x, 0.68, 0), VELVET), { mottle: 0.2, freq: 2.5, under: 0 }),
      turned([[0, 0], [0.075, 0.004], [0.09, 0.016], [0.04, 0.03], [0, 0.036]], GILT, [0, 0, 0], 12).rotateX(PI / 2).translate(x, 0.68, deep / 2), ring(0.115, 0.012, DEEP, [x, 0.68, deep / 2], [0, 0, 0], 16));
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bits.push(turned([[0.02, 0], [0.035, 0.02], [0.03, 0.06], [0.05, 0.1], [0.06, 0.14]], GILT, [sx * (long / 2 + 0.06), 0, sz * (deep / 2 - 0.08)], 10));
  return mergeGeometries(bits);
}
export const armchair = () => sofa(0.78);
// A low table for between them: a slab of veined marble with a gilt edge, on four turned legs with a rail between. TABLE_TOP high.
export const TABLE_TOP = 0.48;
export function lowTable(w = 1.35, d = 0.72) {
  const bits = [dirty(box(w, 0.045, d, 0xefe8da, [0, TABLE_TOP - 0.0225, 0]), { mottle: 0.1, freq: 6, under: 0 }), box(w + 0.02, 0.022, d + 0.02, GILT, [0, TABLE_TOP - 0.056, 0]), box(w - 0.14, 0.05, d - 0.14, DEEP, [0, TABLE_TOP - 0.09, 0])];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bits.push(turned([[0.03, 0], [0.045, 0.02], [0.025, 0.06], [0.03, 0.2], [0.045, 0.24], [0.03, 0.28], [0.04, TABLE_TOP - 0.1]], GILT, [sx * (w / 2 - 0.1), 0, sz * (d / 2 - 0.1)], 10));
  for (const sz of [-1, 1]) bits.push(tube([[-(w / 2 - 0.1), 0.12, sz * (d / 2 - 0.1)], [w / 2 - 0.1, 0.12, sz * (d / 2 - 0.1)]], [0.014, 0.014], DEEP, { sides: 5 }));
  return mergeGeometries(bits);
}
// What stands on one: a cut-glass ashtray with a few ends in it, and a bottle with two glasses. (To be stood on its top.)
export function tableThings() {
  return mergeGeometries([
    turned([[0, 0.004], [0.075, 0.004], [0.095, 0.03], [0.085, 0.034], [0.068, 0.014], [0, 0.012]], 0x2a3238, [-0.36, 0, 0.08], 14),
    ...[0, 1, 2].map((i) => tube([[-0.36 + 0.02 * i - 0.03, 0.02, 0.08 - 0.02 * i], [-0.36 + 0.02 * i + 0.03, 0.032, 0.1 - 0.03 * i]], [0.006, 0.006], i ? 0xe8e2d2 : 0xc98a4a, { sides: 5 })),
    sized(paint(bottle(1), 0x6a3a14), 0.17).translate(0.36, 0.11, -0.12), sized(paint(new THREE.CylinderGeometry(0.33, 0.33, 0.5, 10), 0xf3efe4), 0.17).translate(0.36, 0.1, -0.12),
    ...[[0.2, 0.06], [0.46, 0.1]].map(([x, z]) => paint(new THREE.CylinderGeometry(0.032, 0.027, 0.075, 12, 1, true).translate(x, 0.04, z), 0xcfe2ea)),
    ...[[0.2, 0.06], [0.46, 0.1]].map(([x, z]) => paint(new THREE.CylinderGeometry(0.027, 0.027, 0.008, 12).translate(x, 0.005, z), 0xcfe2ea)),
  ]);
}
// A standing lamp: a weighted gilt foot, a turned stem, a pleated shade. { stand, shade }: the shade is to be drawn lit. 1.75 tall.
export function floorLamp() {
  return {
    stand: mergeGeometries([turned([[0.19, 0], [0.2, 0.03], [0.07, 0.07], [0.03, 0.12], [0.024, 0.7], [0.04, 0.74], [0.024, 0.78], [0.022, 1.36], [0.05, 1.4], [0.02, 1.44]], GILT, [0, 0, 0], 14), ring(0.2, 0.012, DEEP, [0, 0.03, 0], [PI / 2, 0, 0], 18)]),
    shade: sculpt(new THREE.CylinderGeometry(0.17, 0.3, 0.36, 28, 1, true).translate(0, 1.56, 0), (v) => { const k = 1 + 0.035 * Math.sin(Math.atan2(v.z, v.x) * 14); v.x *= k; v.z *= k; }),
  };
}

// ---- About the floor --------------------------------------------------------------------------------------------
// A palm in a gilt urn: a ringed trunk, and a head of arching fronds, each a rib with leaflets hanging off it. s: its size (3.4 of these tall).
export function palm(s = 1) {
  const bits = [turned([[0, 0], [0.34, 0], [0.4, 0.08], [0.3, 0.2], [0.42, 0.55], [0.56, 0.86], [0.52, 0.92], [0.44, 0.9], [0, 0.9]], GILT, [0, 0, 0], 16), ring(0.5, 0.035, DEEP, [0, 0.74, 0], [PI / 2, 0, 0], 18), lump(0.42, 0x2a1a10, [0, 0.9, 0], [1, 0.16, 1], 8)];
  bits.push(dirty(sculpt(tube([[0, 0.9, 0], [0.04, 1.7, 0.02], [-0.03, 2.4, 0], [0.02, 2.95, 0.01]], [0.13, 0.1, 0.09, 0.11], 0x5a4028, { sides: 10, steps: 8 }), (v) => { const k = 1 + 0.07 * Math.sin(v.y * 34); v.x *= k; v.z *= k; }), { mottle: 0.3, freq: 2, under: 0.2 }));
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * TAU + (i % 2) * 0.2, lift = 0.5 + 0.35 * (i % 3), reach = 1.25 + 0.2 * (i % 2), c = Math.cos(a), sn = Math.sin(a);
    const rib = (k) => [c * reach * k, 2.95 + lift * Math.sin(k * 2.2) - 0.75 * k * k, sn * reach * k];
    bits.push(tube([rib(0), rib(0.35), rib(0.7), rib(1)], [0.03, 0.022, 0.014, 0.005], 0x2c7a3c, { sides: 4, steps: 4 }));
    for (let j = 1; j <= 9; j++) for (const side of [-1, 1]) {
      const k = j / 10, at = rib(k), long = 0.34 * Math.sin(k * PI * 0.9 + 0.25), out = [-sn * side, 0, c * side];
      bits.push(tube([at, [at[0] + out[0] * long * 0.6 + c * 0.05, at[1] - 0.05, at[2] + out[2] * long * 0.6 + sn * 0.05], [at[0] + out[0] * long + c * 0.1, at[1] - 0.2 * long - 0.08, at[2] + out[2] * long + sn * 0.1]], [0.012, 0.03, 0.004], j % 2 ? LEAF : 0x2f8a46, { sides: 3, steps: 2 }));
    }
  }
  return sized(mergeGeometries(bits), s);
}
// A post for a velvet rope (1.1 tall: a turned stem on a weighted foot, a ball on top, a ring each side to hook to).
export function ropePost() {
  return mergeGeometries([turned([[0.2, 0], [0.22, 0.03], [0.1, 0.07], [0.045, 0.12], [0.04, 0.5], [0.06, 0.54], [0.04, 0.58], [0.04, 0.96], [0.07, 1.0], [0.05, 1.03]], GILT, [0, 0, 0], 14), lump(0.085, GILT, [0, 1.1, 0], [1, 1, 1], 10),
    ring(0.03, 0.008, DEEP, [0, 0.99, 0.06], [0, PI / 2, 0], 8), ring(0.03, 0.008, DEEP, [0, 0.99, -0.06], [0, PI / 2, 0], 8)]);
}
// The rope between two of them: plaited velvet, sagging in the middle, a gilt hook on each end. a, b: [x, y, z].
export function rope(a, b, sag = 0.28) {
  const points = Array.from({ length: 7 }, (_, i) => { const k = i / 6; return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k - sag * 4 * k * (1 - k), a[2] + (b[2] - a[2]) * k]; });
  return mergeGeometries([sculpt(tube(points, [0.034, 0.034, 0.034], 0x8a1626, { sides: 7, steps: 4 }), (v) => { v.y += 0.004 * Math.sin((v.x + v.z) * 60); }), lump(0.04, GILT, a, [1, 1, 1], 6), lump(0.04, GILT, b, [1, 1, 1], 6)]);
}
// A block of dark marble to stand a statue on: a stepped foot, a die with a gilt panel on each face, a cap.
export function plinth(w = 1.1, h = 1.3) {
  return mergeGeometries([box(w + 0.2, 0.14, w + 0.2, 0x1c1719, [0, 0.07, 0]), box(w + 0.08, 0.1, w + 0.08, DEEP, [0, 0.19, 0]), dirty(box(w, h - 0.44, w, 0x2a2326, [0, h / 2 + 0.02, 0]), { mottle: 0.25, freq: 2.5, under: 0 }),
    ...[0, 1, 2, 3].map((k) => slab(w * 0.62, (h - 0.44) * 0.62, 0.02, GILT, [0, h / 2 + 0.02, w / 2 + 0.005]).rotateY(k * PI / 2)), box(w + 0.12, 0.1, w + 0.12, GILT, [0, h - 0.15, 0]), box(w + 0.24, 0.1, w + 0.24, 0x1c1719, [0, h - 0.05, 0])]);
}
// The mouldings of a wall `long`: a skirting, a dado rail, and a cornice under the ceiling (`high` up) with a row of
// little blocks under it. It runs along x, the wall at z = 0, the room towards +z.
export function mouldings(long, high, dado = 1.05) {
  const bits = [box(long, 0.22, 0.08, 0x1c1719, [0, 0.11, 0.04]), box(long, 0.05, 0.1, GILT, [0, 0.245, 0.05]),
    box(long, 0.09, 0.09, GILT, [0, dado, 0.045]), box(long, 0.04, 0.12, DEEP, [0, dado + 0.06, 0.06]),
    box(long, 0.2, 0.34, CREAM, [0, high - 0.1, 0.17]), box(long, 0.1, 0.42, GILT, [0, high - 0.25, 0.21]), box(long, 0.14, 0.2, CREAM, [0, high - 0.4, 0.1]), box(long, 0.05, 0.25, GILT, [0, high - 0.5, 0.125])];
  const n = Math.round(long / 0.4);
  for (let i = 0; i < n; i++) bits.push(box(0.16, 0.12, 0.14, CREAM, [-long / 2 + (i + 0.5) * (long / n), high - 0.39, 0.25]));   // (the blocks)
  return mergeGeometries(bits);
}
// The beams of a coffered ceiling over a room `w` by `d`, in bays about `bay` across: gilt-edged, with a boss where they cross. Hung from y = 0.
export function coffers(w, d, bay = 3.2) {
  const nx = Math.round(w / bay), nz = Math.round(d / bay), bits = [];
  for (let i = 0; i <= nx; i++) { const x = -w / 2 + (i * w) / nx; bits.push(box(0.3, 0.26, d, CREAM, [x, -0.13, 0]), box(0.36, 0.05, d, GILT, [x, -0.27, 0])); }
  for (let j = 0; j <= nz; j++) { const z = -d / 2 + (j * d) / nz; bits.push(box(w, 0.26, 0.3, CREAM, [0, -0.13, z]), box(w, 0.05, 0.36, GILT, [0, -0.27, z])); }
  for (let i = 1; i < nx; i++) for (let j = 1; j < nz; j++) bits.push(lump(0.17, GILT, [-w / 2 + (i * w) / nx, -0.3, -d / 2 + (j * d) / nz], [1, 0.5, 1], 6));
  return mergeGeometries(bits);
}

// ---- Painted surfaces -------------------------------------------------------------------------------------------
function canvasTexture(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  if (repeat) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(...repeat); }
  return tex;
}
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
// Veins through a slab of marble: a few that wander right across it, each with finer ones breaking off.
function veins(g, x, y, w, h, color, count) {
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.strokeStyle = color;
  for (let i = 0; i < count; i++) {
    let px = x + rnd() * w, py = y - 4, dir = (rnd() - 0.5) * 1.2;
    g.lineWidth = 0.7 + rnd() * 1.8;
    g.beginPath(); g.moveTo(px, py);
    while (py < y + h + 4) {
      dir += (rnd() - 0.5) * 0.9; px += Math.sin(dir) * 16; py += 6 + rnd() * 12; g.lineTo(px, py);
      if (rnd() < 0.3) { const bx = px, by = py; g.stroke(); g.lineWidth *= 0.5; g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + (rnd() - 0.5) * 50, by + 14 + rnd() * 26); g.stroke(); g.lineWidth *= 2; g.beginPath(); g.moveTo(bx, by); }
    }
    g.stroke();
  }
  g.restore();
}
const clouded = (g, x, y, w, h, color, n) => { for (let i = 0; i < n; i++) { const cx = x + rnd() * w, cy = y + rnd() * h, r = 20 + rnd() * 60, gr = g.createRadialGradient(cx, cy, 0, cx, cy, r); gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(cx - r, cy - r, r * 2, r * 2); } };
// Polished marble: cream and black squares, each clouded and veined, a line of brass let in between them and a brass
// diamond where four meet. repeat: how many pairs of squares each way.
export const marbleFloor = (repeat) => canvasTexture(1024, 1024, (g, s) => {
  seed = 11;
  const h = s / 2;
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    const dark = (i + j) % 2, x = i * h, y = j * h;
    g.fillStyle = dark ? '#19171b' : '#ece3d0';
    g.fillRect(x, y, h, h);
    g.save(); g.beginPath(); g.rect(x, y, h, h); g.clip();
    clouded(g, x, y, h, h, dark ? 'rgba(70, 62, 78, 0.35)' : 'rgba(196, 176, 140, 0.28)', 16);
    clouded(g, x, y, h, h, dark ? 'rgba(0, 0, 0, 0.4)' : 'rgba(255, 252, 244, 0.5)', 10);
    g.restore();
    veins(g, x, y, h, h, dark ? 'rgba(236, 226, 210, 0.2)' : 'rgba(120, 96, 70, 0.3)', 5);
    veins(g, x, y, h, h, dark ? 'rgba(201, 164, 74, 0.16)' : 'rgba(80, 70, 66, 0.16)', 3);
  }
  g.strokeStyle = '#b8923c'; g.lineWidth = 6;
  for (const k of [0, h, s]) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, s); g.moveTo(0, k); g.lineTo(s, k); g.stroke(); }
  g.fillStyle = '#d9b24a';
  for (const [x, y] of [[0, 0], [h, 0], [s, 0], [0, h], [h, h], [s, h], [0, s], [h, s], [s, s]]) { g.beginPath(); g.moveTo(x, y - 22); g.lineTo(x + 22, y); g.lineTo(x, y + 22); g.lineTo(x - 22, y); g.closePath(); g.fill(); }
}, repeat);
// A scroll of leaves, for wallpaper and carpets: one repeat of it, about (x, y), `r` across.
function flourish(g, x, y, r, color) {
  g.save(); g.translate(x, y); g.fillStyle = color; g.strokeStyle = color; g.lineWidth = Math.max(1, r * 0.035);
  for (const side of [-1, 1]) {
    g.beginPath(); g.moveTo(0, -r * 0.95); g.bezierCurveTo(side * r * 0.55, -r * 0.7, side * r * 0.62, -r * 0.1, 0, r * 0.12); g.bezierCurveTo(side * r * 0.3, -r * 0.2, side * r * 0.3, -r * 0.55, 0, -r * 0.95); g.fill();
    g.beginPath(); g.moveTo(0, r * 0.12); g.bezierCurveTo(side * r * 0.75, r * 0.2, side * r * 0.8, r * 0.75, side * r * 0.28, r * 0.9); g.bezierCurveTo(side * r * 0.5, r * 0.6, side * r * 0.42, r * 0.38, 0, r * 0.3); g.fill();
    g.beginPath(); g.arc(side * r * 0.62, -r * 0.42, r * 0.2, side > 0 ? PI * 0.6 : PI * 1.9, side > 0 ? PI * 2.1 : PI * 3.4); g.stroke();
  }
  g.beginPath(); g.arc(0, r * 0.2, r * 0.09, 0, TAU); g.fill();
  g.restore();
}
// A wall: silk damask in a gilt-framed panel over a dado of dark veined marble (one bay of it: it is repeated along the wall).
export const wallPanels = () => canvasTexture(512, 1024, (g, w, h) => {
  seed = 23;
  g.fillStyle = '#e7dcc4'; g.fillRect(0, 0, w, h);
  clouded(g, 0, 0, w, h, 'rgba(255, 250, 236, 0.35)', 20);
  const px = 46, py = 70, pw = w - 92, ph = h - 400;
  g.fillStyle = '#7a1622'; g.fillRect(px, py, pw, ph);
  g.save(); g.beginPath(); g.rect(px, py, pw, ph); g.clip();
  for (let j = 0; j < 7; j++) for (let i = -1; i < 4; i++) flourish(g, px + (i + (j % 2) * 0.5) * 150 + 60, py + j * 110 + 40, 50, 'rgba(160, 44, 56, 0.9)');
  const sheen = g.createLinearGradient(px, 0, px + pw, 0); sheen.addColorStop(0, 'rgba(0,0,0,0.25)'); sheen.addColorStop(0.5, 'rgba(255,200,180,0.08)'); sheen.addColorStop(1, 'rgba(0,0,0,0.25)');
  g.fillStyle = sheen; g.fillRect(px, py, pw, ph);
  g.restore();
  g.strokeStyle = '#c9a44a'; g.lineWidth = 12; g.strokeRect(px, py, pw, ph);
  g.strokeStyle = '#8a6a22'; g.lineWidth = 3; g.strokeRect(px - 9, py - 9, pw + 18, ph + 18);
  g.strokeStyle = '#f0d98a'; g.lineWidth = 2; g.strokeRect(px + 9, py + 9, pw - 18, ph - 18);
  for (const [x, y] of [[w / 2, py], [w / 2, py + ph]]) flourish(g, x, y, 34, '#d9b24a');
  for (const [x, y] of [[px, py], [px + pw, py], [px, py + ph], [px + pw, py + ph]]) { g.fillStyle = '#d9b24a'; g.beginPath(); g.arc(x, y, 13, 0, TAU); g.fill(); }
  g.fillStyle = '#231d20'; g.fillRect(0, h - 250, w, 250);   // the dado
  veins(g, 0, h - 250, w, 250, 'rgba(255, 255, 255, 0.16)', 6);
  veins(g, 0, h - 250, w, 250, 'rgba(201, 164, 74, 0.14)', 3);
  g.strokeStyle = '#3a3034'; g.lineWidth = 3; g.strokeRect(34, h - 222, w - 68, 180);
});
// Between the beams of the ceiling: a sunk panel of cream plaster, a painted border, a gilt rose.
export const cofferPanel = (repeat) => canvasTexture(256, 256, (g, s) => {
  g.fillStyle = '#d9cdb2'; g.fillRect(0, 0, s, s);
  g.fillStyle = '#efe6d2'; g.fillRect(20, 20, s - 40, s - 40);
  g.strokeStyle = '#c9a44a'; g.lineWidth = 5; g.strokeRect(20, 20, s - 40, s - 40);
  g.strokeStyle = '#8a1a26'; g.lineWidth = 2; g.strokeRect(32, 32, s - 64, s - 64);
  g.fillStyle = '#c9a44a';
  for (let k = 0; k < 10; k++) { g.beginPath(); g.ellipse(s / 2 + Math.cos(k * 0.628) * 26, s / 2 + Math.sin(k * 0.628) * 26, 17, 8, k * 0.628, 0, TAU); g.fill(); }
  g.fillStyle = '#8a6a22'; g.beginPath(); g.arc(s / 2, s / 2, 12, 0, TAU); g.fill();
  for (const [x, y] of [[44, 44], [s - 44, 44], [44, s - 44], [s - 44, s - 44]]) flourish(g, x, y, 13, '#c9a44a');
}, repeat);
// A carpet: deep red, a wide border of scrolls between gilt lines, a field of diamonds with a leaf in each.
export const rug = () => canvasTexture(512, 512, (g, s) => {
  g.fillStyle = '#560d18'; g.fillRect(0, 0, s, s);
  g.fillStyle = '#3a0810'; g.fillRect(0, 0, s, 56); g.fillRect(0, s - 56, s, 56); g.fillRect(0, 0, 56, s); g.fillRect(s - 56, 0, 56, s);
  for (let i = 0; i < 9; i++) for (const [x, y] of [[28 + i * 57, 28], [28 + i * 57, s - 28], [28, 28 + i * 57], [s - 28, 28 + i * 57]]) flourish(g, x, y, 17, '#c9a44a');
  g.strokeStyle = '#c9a44a'; g.lineWidth = 6; g.strokeRect(6, 6, s - 12, s - 12); g.strokeRect(56, 56, s - 112, s - 112);
  g.lineWidth = 2; g.strokeRect(66, 66, s - 132, s - 132);
  g.save(); g.beginPath(); g.rect(70, 70, s - 140, s - 140); g.clip();
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
    const x = 96 + i * 46 + (j % 2) * 23, y = 96 + j * 46;
    g.fillStyle = '#6e1422'; g.beginPath(); g.moveTo(x, y - 20); g.lineTo(x + 20, y); g.lineTo(x, y + 20); g.lineTo(x - 20, y); g.closePath(); g.fill();
    flourish(g, x, y, 9, '#a03a44');
  }
  g.restore();
});
// The baize of the blackjack table, as it is printed (its dealer at the top): the arcs, what it pays, what he stands
// on, insurance, and a box for each of `seats` (degrees round from the middle of its curved edge). R: the table's
// radius, in the same units as everything that follows; the picture covers 2R by (R + depth) of it.
export const baize = (R, depth, seats, at = 0.95) => canvasTexture(1024, 640, (g, w, h) => {
  const k = w / (2 * R), cx = w / 2, cy = depth * k;
  g.fillStyle = '#0c4429'; g.fillRect(0, 0, w, h);
  seed = 5;
  for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '60,140,90'},${0.05 + rnd() * 0.06})`; g.fillRect(rnd() * w, rnd() * h, 2, 2); }
  const shade = g.createRadialGradient(cx, cy, R * k * 0.2, cx, cy, R * k * 1.05); shade.addColorStop(0, 'rgba(40, 120, 76, 0.25)'); shade.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
  g.fillStyle = shade; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#e2cf8c'; g.fillStyle = '#e2cf8c';
  g.lineWidth = 4; g.beginPath(); g.arc(cx, cy, R * k * 0.83, 0, PI); g.stroke();
  g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, R * k * 0.62, 0.08, PI - 0.08); g.stroke(); g.beginPath(); g.arc(cx, cy, R * k * 0.52, 0.1, PI - 0.1); g.stroke();
  const along = (text, radius, size, bold = true) => {
    g.font = `${bold ? '700 ' : ''}${size}px Anton, Impact, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const wide = g.measureText(text).width, span = wide / radius;
    let a = PI / 2 + span / 2;
    for (const ch of text) { const cw = g.measureText(ch).width / radius; a -= cw / 2; g.save(); g.translate(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius); g.rotate(a - PI / 2); g.fillText(ch, 0, 0); g.restore(); a -= cw / 2; }
  };
  along('BLACKJACK PAYS 3 TO 2', R * k * 0.3, 34);
  along('DEALER MUST STAND ON 17 AND DRAW TO 16', R * k * 0.445, 19, false);
  along('INSURANCE PAYS 2 TO 1', R * k * 0.57, 21);
  for (const deg of seats) {
    const a = (deg * PI) / 180, x = cx + Math.sin(a) * at * k, y = cy + Math.cos(a) * at * k;
    g.lineWidth = 4; g.beginPath(); g.arc(x, y, 0.215 * k, 0, TAU); g.stroke();
    g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 0.17 * k, 0, TAU); g.stroke();
    g.save(); g.translate(cx + Math.sin(a) * 1.55 * k, cy + Math.cos(a) * 1.55 * k); g.rotate(-a); g.lineWidth = 2; g.strokeRect(-0.24 * k, -0.2 * k, 0.48 * k, 0.4 * k); g.restore();
  }
  flourish(g, cx, cy - depth * k * 0.42, 22, '#e2cf8c');
});
// A sign: text on a board. Returns the mesh, with redraw(lines) to change what it says.
export function sign(lines, width, height, { color = '#c9a44a', board = '#17120f', size = 0.5 } = {}) {
  const c = document.createElement('canvas');
  c.width = 768; c.height = Math.round((768 * height) / width);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  mesh.redraw = (text) => {
    const g = c.getContext('2d'), w = c.width, h = c.height;
    g.fillStyle = board;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = color;
    g.lineWidth = 8; g.strokeRect(8, 8, w - 16, h - 16);
    g.lineWidth = 2; g.strokeRect(22, 22, w - 44, h - 44);
    g.fillStyle = color;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    text.forEach((line, i) => {
      const px = (h / (text.length + 0.7)) * size * 2 * (i === 0 ? 1 : 0.72);
      g.font = `${px}px Anton, Impact, sans-serif`;
      g.fillText(line, w / 2, (h * (i + 0.85)) / (text.length + 0.7), w - 60);
    });
    tex.needsUpdate = true;
  };
  mesh.redraw(lines);
  return mesh;
}

// The top of a half-round table of radius `R` with a straight strip `back` deep behind it (its dealer's side towards
// -z), cut to take baize(): one piece, lying flat at y = 0.
export function baizeTop(R, back) {
  const top = new THREE.Shape();
  top.moveTo(-R, back); top.lineTo(R, back); top.lineTo(R, 0); top.absarc(0, 0, R, 0, -PI, true); top.lineTo(-R, back);
  const cloth = new THREE.ShapeGeometry(top, 48).rotateX(-PI / 2), at = cloth.attributes.position, uv = cloth.attributes.uv;
  for (let i = 0; i < at.count; i++) uv.setXY(i, (at.getX(i) + R) / (2 * R), 1 - (at.getZ(i) + back) / (R + back));
  return cloth;
}
// A wall `w` long and `h` high with an arched opening cut through it for each window (xs: where along it each is,
// from its middle; win: { w, h, sill } of an opening). from: how far up from the floor the wall starts (the House's
// stand on the top of a curve). It takes wallPanels(): the picture runs from the floor to the ceiling whatever
// `from` is. It stands on y = 0, facing +z.
export function wall(w, h, xs = [], win = { w: 3.2, h: 6.2, sill: 0.95 }, from = 0) {
  const face = new THREE.Shape();
  face.moveTo(-w / 2, from); face.lineTo(w / 2, from); face.lineTo(w / 2, h); face.lineTo(-w / 2, h); face.lineTo(-w / 2, from);
  for (const x of xs) {
    const hole = new THREE.Path(), r = win.w / 2, foot = Math.max(win.sill, from + 0.03), spring = win.sill + win.h - r;
    hole.moveTo(x - r, foot); hole.lineTo(x + r, foot); hole.lineTo(x + r, spring); hole.absarc(x, spring, r, 0, PI, false); hole.lineTo(x - r, foot);
    face.holes.push(hole);
  }
  const geo = new THREE.ShapeGeometry(face, 20), at = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < at.count; i++) uv.setXY(i, at.getX(i) / w + 0.5, at.getY(i) / h);
  return geo;
}
// How thick the wall is, where a window goes through it: the inside of the opening (win: as wall() takes it), going
// back `deep` from the face of the wall (z = 0 to -deep). Its sill at y = 0.
export function windowReveal(win = { w: 3.2, h: 6.2 }, deep = 0.45) {
  const r = win.w / 2, spring = win.h - r, line = [[-r, 0], [-r, spring]];
  for (let i = 1; i < 16; i++) { const a = PI - (i / 16) * PI; line.push([Math.cos(a) * r, spring + Math.sin(a) * r]); }
  line.push([r, spring], [r, 0], [-r, 0]);
  const pos = [], idx = [];
  line.forEach(([x, y], i) => { pos.push(x, y, 0, x, y, -deep); if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); } });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
// The glass of an arched window `w` by `h` (its sill at y = 0): one clear pane, behind the glazing bars.
export function windowPane(w, h) {
  const arch = new THREE.Shape();
  arch.moveTo(-w / 2, 0); arch.lineTo(w / 2, 0); arch.lineTo(w / 2, h - w / 2); arch.absarc(0, h - w / 2, w / 2, 0, PI, false); arch.lineTo(-w / 2, 0);
  return new THREE.ShapeGeometry(arch, 20);
}
export const glass = () => new THREE.MeshStandardMaterial({ color: 0xa8c8e0, roughness: 0.04, metalness: 0.2, transparent: true, opacity: 0.1, depthWrite: false });
// What is outside the windows: the harbour at night, all the way round. The moon and its road on the water, a ridge
// of hills with the town's lights up it, yachts at anchor with their own lights, stars. It is painted on the inside
// of a great drum stood well off from the building, so that it slides past the windows as you move about the room.
// radius: how far off it is. level: how high the horizon is. Add it to the scene at the middle of the room.
export function outside(radius, level = 2) {
  const tex = canvasTexture(4096, 1024, (g, w, h) => {
    seed = 41;
    const sea = h * 0.56;   // (the horizon: this far down the picture)
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#050a20'); sky.addColorStop(0.36, '#122048'); sky.addColorStop(0.555, '#2a3f72'); sky.addColorStop(0.562, '#0a1738'); sky.addColorStop(1, '#030712');
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(255,255,255,${0.25 + rnd() * 0.75})`; const r = rnd() < 0.08 ? 2.6 : 1.4; g.fillRect(rnd() * w, rnd() * sea * 0.96, r, r); }
    const moonX = w * 0.74, moonY = sea * 0.42;
    const halo = g.createRadialGradient(moonX, moonY, 0, moonX, moonY, 190); halo.addColorStop(0, 'rgba(255, 244, 210, 0.5)'); halo.addColorStop(1, 'rgba(255, 244, 210, 0)');
    g.fillStyle = halo; g.fillRect(moonX - 190, moonY - 190, 380, 380);
    g.fillStyle = '#fff5d6'; g.beginPath(); g.arc(moonX, moonY, 46, 0, TAU); g.fill();
    g.fillStyle = 'rgba(190, 180, 150, 0.35)'; for (const [x, y, r] of [[-12, -10, 10], [14, 14, 7], [8, -18, 5], [-18, 16, 4]]) { g.beginPath(); g.arc(moonX + x, moonY + y, r, 0, TAU); g.fill(); }
    g.fillStyle = '#0a1024';   // the hills behind the port: a ridge that comes round to where it began
    g.beginPath(); g.moveTo(0, sea);
    for (let x = 0; x <= w; x += 16) { const a = (x / w) * TAU; g.lineTo(x, sea - 28 - 46 * (0.5 + 0.5 * Math.sin(a * 3 + 1)) - 30 * (0.5 + 0.5 * Math.sin(a * 7 + 2)) - 14 * Math.sin(a * 17)); }
    g.lineTo(w, sea); g.closePath(); g.fill();
    for (let i = 0; i < 1500; i++) {   // the town's lights, thick in places, and what the water does with them
      const x = rnd() * w, a = (x / w) * TAU, thick = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(a * 2 + 0.6)) ** 2;
      if (rnd() > thick) continue;
      const y = sea - 4 - rnd() * 62 * (0.3 + 0.7 * rnd());
      g.fillStyle = ['#ffd27a', '#ffe9b8', '#ff9a5a', '#fff2d0'][i % 4];
      g.fillRect(x, y, 2.8, 2.8);
      g.globalAlpha = 0.2; g.fillRect(x, sea + 6 + (sea - y) * 1.6, 2.8, 14 + rnd() * 20); g.globalAlpha = 1;
    }
    for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(255, 240, 200, ${0.05 + rnd() * 0.14})`; g.fillRect(moonX - 46 - i * 1.8 + rnd() * 36, sea + 6 + i * 6.5, 60 + i * 4.2 - rnd() * 50, 2.6); }   // the moon's road
    for (let i = 0; i < 22; i++) {   // yachts
      const x = ((i + 0.3 + 0.4 * rnd()) / 22) * w, far = rnd(), y = sea + 34 + far * 250, s = 0.7 + far * 1.7;
      g.fillStyle = '#f1f1f4'; g.beginPath(); g.moveTo(x - 30 * s, y); g.lineTo(x + 36 * s, y); g.lineTo(x + 26 * s, y + 9 * s); g.lineTo(x - 22 * s, y + 9 * s); g.closePath(); g.fill();
      g.fillRect(x - 14 * s, y - 8 * s, 30 * s, 8 * s); g.fillRect(x - 6 * s, y - 14 * s, 14 * s, 6 * s); g.fillRect(x, y - 46 * s, 1.6 * s, 32 * s);
      g.fillStyle = '#ffd27a'; for (let k = 0; k < 4; k++) g.fillRect(x - 10 * s + k * 6 * s, y - 6 * s, 3 * s, 3 * s);
      g.fillStyle = '#ff5a4a'; g.fillRect(x - 1, y - 48 * s, 3, 3);
      g.globalAlpha = 0.16; g.fillStyle = '#f1f1f4'; g.fillRect(x - 24 * s, y + 11 * s, 52 * s, 16 * s); g.globalAlpha = 1;
    }
  });
  tex.wrapS = THREE.RepeatWrapping;
  const tall = radius * 1.5, drum = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, tall, 64, 1, true), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, toneMapped: false, fog: false }));
  drum.position.y = level + tall * (0.5 - 0.44);   // (the horizon of the picture is 0.56 of the way down it)
  return drum;
}
// What the gilt and the marble have to reflect: the warm light of a room with chandeliers in it, laid out as a
// picture of everything round a point (scene.environment takes it as it is).
export function roomLight() {
  const tex = canvasTexture(256, 128, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#fff0cf'); sky.addColorStop(0.3, '#d8b888'); sky.addColorStop(0.55, '#7a5a40'); sky.addColorStop(0.75, '#2a1c18'); sky.addColorStop(1, '#120c0c');
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 6; i++) { const x = (i + 0.5) * (w / 6), gr = g.createRadialGradient(x, 26, 0, x, 26, 30); gr.addColorStop(0, 'rgba(255, 246, 220, 1)'); gr.addColorStop(1, 'rgba(255, 220, 160, 0)'); g.fillStyle = gr; g.fillRect(x - 30, 0, 60, 60); }
    g.fillStyle = 'rgba(130, 20, 32, 0.35)'; for (let i = 0; i < 4; i++) g.fillRect(i * (w / 4) + 10, 50, 22, 40);
  });
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}
