// Costumes: full outfits found on the Moon (see freeride/eggs.js), each in two
// pieces you can wear together or apart: the body (the hoodie becomes a suit,
// perhaps with a pack on its back, perhaps with different skin) and the head (a
// helmet or an alien's head, over his own).
//
// SkaterModel.applyLook reads this table; systems/cosmetics.js lists the same
// ids in its `outfit` and `mask` slots.
//   suit     the colour the hoodie is repainted
//   skin     his skin colour, if it changes
//   pack     the colour of the pack on his back, if he has one
//   helmet   { shell, visor, skull: a skull behind the visor, stripe: a band over the top }
//   alien    { color, eyes, big: how much bigger than a head, antennae, lit: the eyes glow }
import * as THREE from 'three';
import { tube, lump, sculpt, dent, rough, dirty, paint, part, slab, fineSkull, spikes } from '../enemies/sculpt.js';

export const COSTUMES = {
  astronaut: { name: 'Dead Astronaut', suit: '#d6d6da', pack: 0x77787e, helmet: { shell: 0xd9d9de, visor: 0x1c1408, skull: true } },
  grey: { name: 'The Grey', suit: '#7f8a84', skin: 0x8f9a92, alien: { color: 0x8f9a92, eyes: 0x050508, big: 1.25 } },
  cosmonaut: { name: 'Cosmonaut', suit: '#c2561c', pack: 0xd8d8dc, helmet: { shell: 0xf0f0f2, visor: 0xb9882a, stripe: 0xc8201b } },
  gilded: { name: 'Golden Boy', suit: '#c9a23a', pack: 0xa8842a, helmet: { shell: 0xd9b24a, visor: 0x2a1c04 } },
  void: { name: 'Void Walker', suit: '#0c0c14', skin: 0x15151f, alien: { color: 0x0e0e16, eyes: 0xb46bff, big: 1.2, lit: true } },
  martian: { name: 'Little Green Man', suit: '#2f8a34', skin: 0x55c84a, alien: { color: 0x55c84a, eyes: 0x050508, big: 1.15, antennae: true } },
};

const PI = Math.PI;
// Where his mouth is in a costume's head (from the middle of his own): what he is smoking is moved there, so it
// still shows. An alien has a mouth of its own; in a helmet it sticks out through the visor (he was never going to go without).
export function mouthOf(id) {
  const C = COSTUMES[id];
  if (!C) return null;
  return C.alien ? [0, -0.1 * C.alien.big, 0.132 * C.alien.big] : [0, -0.055, 0.2];
}

const std = (color, roughness = 0.6, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
// Everything here is sculpted with the monsters' kit (enemies/sculpt.js) and painted point by point, then drawn as at
// most three meshes: what is matt, what shines (a visor, an eye), and what is lit.
const mesh = (pieces, material) => { const m = new THREE.Mesh(part(pieces).geometry, material); m.castShadow = true; return m; };
const matt = (roughness = 0.55, metalness = 0) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness });
const lit = () => new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
const ring = (R, r, color, at, turn = [PI / 2, 0, 0], arc = PI * 2) => paint(new THREE.TorusGeometry(R, r, 6, 28, arc).rotateX(turn[0]).rotateY(turn[1]).rotateZ(turn[2]).translate(...at), color);
const DARK = 0x2b2c31, STEEL = 0x6d6f76, RUBBER = 0x17171a;

// What goes over his head. (His head is a sphere 0.125 m across at the origin of this group.)
export function buildMask(id) {
  const C = COSTUMES[id], g = new THREE.Group();
  if (!C) return g;
  if (C.helmet) {
    const H = C.helmet, worn = id === 'astronaut', gold = id === 'gilded';
    const shell = dirty(rough(lump(0.205, H.shell, [0, 0.01, 0], [1, 1, 1], 28), worn ? 0.003 : 0, 30), { mottle: worn ? 0.3 : 0.1, freq: worn ? 14 : 6, under: 0.3, stains: worn ? [[-0.12, 0.12, 0.1, 0.07, 0x77756c, 0.7], [0.1, -0.08, -0.14, 0.09, 0x77756c, 0.7]] : [] });
    if (H.skull) {   // the glass is see-through on this one, so the shell is hollowed out behind it and dark inside
      const p = shell.attributes.position, col = shell.attributes.color;
      for (let i = 0; i < p.count; i++) if (p.getZ(i) > 0.105) { p.setZ(i, 0.0 - (p.getZ(i) - 0.105) * 0.6); col.setXYZ(i, 0.02, 0.018, 0.015); }
      shell.computeVertexNormals();
    }
    const pieces = [
      shell,
      ring(0.207, 0.006, DARK, [0, 0.01, -0.03], [0, 0, 0]),                                                   // the seam, ear over the top to ear
      ring(0.184, 0.016, DARK, [0, 0.0, 0.116], [0.1, 0, 0]),                                                  // the frame of the visor
      ...Array.from({ length: 10 }, (_, i) => { const a = (i / 10) * PI * 2; return lump(0.008, STEEL, [Math.cos(a) * 0.184, Math.sin(a) * 0.183 - 0.012, 0.132 + Math.sin(a) * 0.018], [1, 1, 1], 6); }),   // ...and its rivets
      tube([[0, -0.165, 0], [0, -0.235, 0]], [0.155, 0.172], STEEL, { sides: 24, steps: 2 }),                  // the neck ring: a collar...
      ring(0.165, 0.014, DARK, [0, -0.17, 0]), ring(0.178, 0.014, DARK, [0, -0.232, 0]),                       // ...between two bands...
      ...Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * PI * 2; return lump(0.011, H.shell, [Math.cos(a) * 0.168, -0.2, Math.sin(a) * 0.168], [1, 1, 1], 6); }),   // ...bolted all the way round
      slab(0.05, 0.05, 0.03, DARK, [0, -0.2, 0.172]), slab(0.03, 0.02, 0.02, 0xc8201b, [0, -0.2, 0.19]),       // its catch
      ...[-1, 1].flatMap((s) => [
        lump(0.062, STEEL, [s * 0.2, -0.01, 0.0], [0.42, 1, 1], 12), lump(0.036, DARK, [s * 0.222, -0.01, 0.0], [0.4, 1, 1], 10),   // ear pieces
        tube([[s * 0.17, 0.12, 0.06], [s * 0.175, 0.125, 0.14]], [0.03, 0.034], DARK, { sides: 10, steps: 2 }),                    // a lamp on each temple
        tube([[s * 0.09, -0.16, 0.13], [s * 0.19, -0.24, 0.05], [s * 0.15, -0.3, -0.1]], [0.022, 0.022, 0.022], RUBBER, { sides: 8, steps: 5 }),   // air hoses, round to the pack
      ]),
      ...[-0.03, 0, 0.03].map((x) => slab(0.016, 0.05, 0.02, DARK, [x, -0.135, 0.158], [0.6, 0, 0])),          // the grille he breathes through
      tube([[0.13, 0.13, -0.1], [0.15, 0.3, -0.13]], [0.007, 0.004], STEEL, { sides: 5 }), lump(0.012, DARK, [0.15, 0.3, -0.13], [1, 1, 1], 6),   // an aerial
      slab(0.07, 0.03, 0.05, DARK, [0, 0.2, -0.07], [0.3, 0, 0]),                                              // a fitting on the crown
    ];
    if (H.stripe) pieces.push(tube([[0, 0.03, 0.212], [0, 0.17, 0.135], [0, 0.222, 0], [0, 0.17, -0.125], [0, 0.03, -0.205], [0, -0.1, -0.175]], [0.03, 0.03, 0.03, 0.03, 0.03, 0.03], H.stripe, { sides: 8, steps: 5, squash: 0.25 }),   // the band over the top
      slab(0.07, 0.03, 0.01, 0xf0f0f2, [0, 0.185, 0.118], [-0.9, 0, 0]));                                      // ...and a badge on it
    if (gold) pieces.push(...spikes(7, (i) => { const a = (i - 3) * 0.32; return [[Math.sin(a) * 0.19, 0.08 + Math.cos(a) * 0.18, -0.04], [Math.sin(a) * 0.25, 0.1 + Math.cos(a) * 0.25, -0.06], 0.016]; }, 0xf2d27a));   // a crest of rays
    if (H.skull) pieces.push(...fineSkull(0.105, { bone: 0xd8d2bf, old: 0xb3aa92, dark: 0x0a0806, teeth: 0xe9e3cf }, { at: [0, -0.005, 0.075], jaw: 0.25, fine: 18 }));   // whoever wore it last
    g.add(mesh(pieces, matt(gold ? 0.3 : 0.5, gold ? 0.55 : 0)));
    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.2, 26, 14, 0, PI * 2, 0, 1.15).rotateX(PI / 2 + 0.1).translate(0, 0.01, 0.03),
      std(H.visor, 0.12, { emissive: H.visor, emissiveIntensity: 0.25, metalness: 0.4, transparent: !!H.skull, opacity: H.skull ? 0.42 : 1 }));
    g.add(visor);
    const lights = [lump(0.026, 0xfff2c8, [-0.175, 0.125, 0.142], [1, 1, 0.4], 8), lump(0.026, 0xfff2c8, [0.175, 0.125, 0.142], [1, 1, 0.4], 8), lump(0.009, 0xff4a3a, [0.15, 0.312, -0.13], [1, 1, 1], 6)];
    if (H.skull) lights.push(...[[-0.06, 0.07, 0.218, 0.02, 0.1, 0.228], [0.02, 0.1, 0.228, 0.09, 0.03, 0.212], [0.02, 0.1, 0.228, 0.0, -0.02, 0.232]].map(([a, b, c, d, e, f]) => tube([[a, b, c], [d, e, f]], [0.003, 0.002], 0xd9e6ee, { sides: 4 })));   // the crack across the glass
    g.add(mesh(lights, lit()));
  } else if (C.alien) {
    const A = C.alien, B = A.big, c = [0, 0.05, 0.005], rx = 0.17 * B, ry = 0.17 * B * 1.22, rz = 0.17 * B * 1.05;
    const shade = new THREE.Color(A.color).multiplyScalar(0.55).getHex(), vein = new THREE.Color(A.color).multiplyScalar(0.75).getHex();
    const ex = 0.075 * B, ez = 0.145 * B;
    const head = dirty(rough(sculpt(lump(0.17, A.color, c, [B, B * 1.22, B * 1.05], 32), (v) => {
      const t = (v.y - c[1]) / ry, k = t < 0 ? 1 - 0.5 * t * t : 1 + 0.07 * t;                                 // a great skull over a small pointed chin
      v.x *= k; v.z = c[2] + (v.z - c[2]) * (t < 0 ? 1 - 0.3 * t * t : k);
      dent(v, [-ex, 0.045, ez + 0.02], 0.065 * B, 0.022); dent(v, [ex, 0.045, ez + 0.02], 0.065 * B, 0.022);    // the eyes sit in hollows...
      dent(v, [0, 0.11 * B, rz], 0.1 * B, -0.012);                                                             // ...under a brow
      dent(v, [-0.09 * B, -0.06, 0.1 * B], 0.06, 0.015); dent(v, [0.09 * B, -0.06, 0.1 * B], 0.06, 0.015);      // hollow cheeks
    }), 0.0015, 60), { mottle: 0.3, freq: 16, under: 0.45, stains: [[0, -0.105 * B, 0.13 * B, 0.03, shade, 0.9]] });
    const pieces = [
      head,
      tube([[0, -0.08 * B, 0], [0, -0.2, 0]], [0.06, 0.05], A.color, { sides: 10, steps: 2 }),                 // a thin neck
      lump(0.006, shade, [-0.012, -0.04, 0.165 * B], [1, 1.6, 0.6], 6), lump(0.006, shade, [0.012, -0.04, 0.165 * B], [1, 1.6, 0.6], 6),   // two slits for a nose
      tube([[-0.035 * B, -0.098 * B, 0.128 * B], [0, -0.104 * B, 0.14 * B], [0.035 * B, -0.098 * B, 0.128 * B]], [0.002, 0.005, 0.002], shade, { sides: 5, steps: 4 }),   // a small mouth
      ...[-1, 1].flatMap((s) => [
        tube([[s * 0.03, 0.2 * B, 0.12 * B], [s * 0.07 * B, 0.25 * B, 0.04], [s * 0.1 * B, 0.2 * B, -0.07], [s * 0.07 * B, 0.1, -0.15 * B]], [0.004, 0.005, 0.004, 0.002], vein, { sides: 5, steps: 5 }),   // veins over the skull
        tube([[s * 0.02, 0.25 * B, 0.02], [s * 0.035, 0.2 * B, -0.11 * B]], [0.004, 0.002], vein, { sides: 5, steps: 3 }),
        lump(0.012, shade, [s * rx * 0.97, 0.01, -0.01], [0.4, 1.4, 1], 6),                                    // a hole for an ear
      ]),
    ];
    const bright = [];
    if (A.antennae) {
      for (const s of [-1, 1]) {
        pieces.push(tube([[s * 0.06, 0.24, 0], [s * 0.08, 0.34, -0.02], [s * 0.13, 0.42, 0.01], [s * 0.15, 0.47, 0.05]], [0.012, 0.009, 0.007, 0.006], A.color, { sides: 7, steps: 6 }),   // feelers, bent...
          ...[0.3, 0.6].map((k) => lump(0.012, vein, [s * (0.06 + 0.06 * k), 0.24 + 0.17 * k, -0.01], [1, 0.7, 1], 6)),                                                             // ...and jointed
          sculpt(lump(0.06, A.color, [s * rx * 1.02, 0.03, -0.01], [0.9, 0.6, 0.3], 10), (v) => { v.y += Math.max(0, Math.abs(v.x) - rx) * 0.9; }),                                 // big pointed ears
          lump(0.03, shade, [s * rx * 1.03, 0.035, 0.0], [0.7, 0.5, 0.2], 8));
        bright.push(lump(0.024, 0xff5a3a, [s * 0.15, 0.48, 0.055], [1, 1, 1], 10));
      }
      pieces.push(tube([[-0.06 * B, -0.09 * B, 0.115 * B], [0, -0.125 * B, 0.13 * B], [0.06 * B, -0.09 * B, 0.115 * B]], [0.002, 0.007, 0.002], shade, { sides: 5, steps: 5 }));          // and a grin
    }
    if (A.lit) {
      pieces.push(...spikes(9, (i) => { const a = (i - 4) * 0.3; return [[Math.sin(a) * 0.13, 0.19 * B + Math.cos(a) * 0.04, -0.06], [Math.sin(a) * 0.2, 0.3 * B + 0.04 * (i % 2), -0.2 - 0.05 * (i % 3)], 0.02]; }, shade));   // a crest swept back
      bright.push(lump(0.014, A.eyes, [0, 0.15 * B, rz * 0.93], [0.6, 1.3, 0.5], 8),                                                    // a third eye
        ...[-1, 1].map((s) => tube([[s * ex, -0.02, ez], [s * ex * 1.1, -0.07, ez - 0.01], [s * ex * 0.8, -0.12 * B, ez - 0.05]], [0.004, 0.003, 0.001], A.eyes, { sides: 4, steps: 4 })));   // ...and what runs from the other two
    }
    g.add(mesh(pieces, matt(0.5)));
    // Eyes: black almonds, wrapped round the face (or lit, if he is the kind whose eyes are).
    const eyes = [-1, 1].map((s) => paint(new THREE.SphereGeometry(0.055, 18, 14).scale(1, 1.55, 0.5).rotateZ(s * -0.5).rotateY(s * 0.35).translate(s * ex, 0.045, ez), A.eyes));
    g.add(mesh(eyes, A.lit ? lit() : matt(0.06)));
    if (!A.lit) bright.push(...[-1, 1].map((s) => lump(0.008, 0xffffff, [s * ex - 0.012, 0.085, ez + 0.027], [1, 1, 0.4], 6)));          // the light in them
    if (bright.length) g.add(mesh(bright, lit()));
  }
  return g;
}

// The pack on his back. (0.3 wide, 0.36 tall; its back is toward -z.)
export function buildPack(id) {
  const C = COSTUMES[id];
  if (!C || !C.pack) return null;
  const g = new THREE.Group(), worn = id === 'astronaut', gold = id === 'gilded', tank = gold ? 0xe6c35a : 0xb9bbc2;
  const boxy = (v, w, h, d) => { const f = (x, a) => Math.sign(x) * a * Math.pow(Math.abs(x) / a, 0.42); v.x = f(v.x, w); v.y = f(v.y, h); v.z = f(v.z, d); };   // a ball squared off
  const pieces = [
    dirty(sculpt(lump(1, C.pack, [0, 0, 0], [0.15, 0.18, 0.07], 18), (v) => boxy(v, 0.15, 0.18, 0.07)), { mottle: worn ? 0.35 : 0.15, freq: 12, under: 0.35 }),   // the case
    ring(0.1, 0.006, DARK, [0, 0.02, -0.071], [0, 0, 0]),                                                       // a hatch in the back of it...
    ...[0, 1, 2, 3].map((i) => lump(0.01, STEEL, [Math.cos(i * 1.57 + 0.78) * 0.1, 0.02 + Math.sin(i * 1.57 + 0.78) * 0.1, -0.073], [1, 1, 0.5], 6)),   // ...on four bolts
    slab(0.11, 0.07, 0.02, DARK, [0, 0.03, -0.075]),                                                            // the panel
    ring(0.022, 0.005, STEEL, [-0.03, -0.06, -0.074], [0, 0, 0]), lump(0.02, 0xe8e6da, [-0.03, -0.06, -0.073], [1, 1, 0.2], 8),   // a gauge
    slab(0.05, 0.012, 0.012, STEEL, [0.04, -0.06, -0.076]), slab(0.05, 0.012, 0.012, STEEL, [0.04, -0.085, -0.076]),            // vents
    slab(0.2, 0.08, 0.07, DARK, [0, 0.21, 0]), slab(0.16, 0.02, 0.09, STEEL, [0, 0.255, 0]),                    // the unit on top
    tube([[0.07, 0.25, -0.01], [0.075, 0.42, -0.02]], [0.006, 0.003], STEEL, { sides: 5 }),                     // its aerial
    ...[-1, 1].flatMap((s) => [
      tube([[s * 0.175, -0.15, -0.02], [s * 0.175, 0.13, -0.02]], [0.046, 0.046], tank, { sides: 14, steps: 2, caps: false }),   // an air tank down each side
      lump(0.046, tank, [s * 0.175, 0.13, -0.02], [1, 0.8, 1], 10), lump(0.046, tank, [s * 0.175, -0.15, -0.02], [1, 0.6, 1], 10),
      ring(0.048, 0.006, DARK, [s * 0.175, 0.06, -0.02]), ring(0.048, 0.006, DARK, [s * 0.175, -0.09, -0.02]),  // strapped on
      tube([[s * 0.175, 0.16, -0.02], [s * 0.175, 0.2, -0.02]], [0.014, 0.014], STEEL, { sides: 7 }), ring(0.02, 0.005, 0xc8201b, [s * 0.175, 0.2, -0.02]),   // a valve and its wheel
      tube([[s * 0.175, 0.2, -0.02], [s * 0.16, 0.27, 0.03], [s * 0.11, 0.25, 0.1]], [0.016, 0.016, 0.016], RUBBER, { sides: 7, steps: 5 }),   // the hose to the helmet
      slab(0.04, 0.34, 0.012, DARK, [s * 0.09, 0, 0.072]),                                                      // the straps over his shoulders
    ]),
  ];
  g.add(mesh(pieces, matt(gold ? 0.35 : 0.6, gold ? 0.5 : 0.1)));
  g.add(mesh([lump(0.012, 0xff4a3a, [-0.035, 0.045, -0.087], [1, 1, 0.5], 6), lump(0.012, 0x5cff7a, [0, 0.045, -0.087], [1, 1, 0.5], 6), lump(0.012, 0xffc233, [0.035, 0.045, -0.087], [1, 1, 0.5], 6),
    slab(0.07, 0.012, 0.004, 0x7fe3ff, [0, 0.015, -0.086]), lump(0.007, 0xff4a3a, [0.075, 0.425, -0.02], [1, 1, 1], 6)], lit()));   // lamps, a read-out, the light on the aerial
  return g;
}
