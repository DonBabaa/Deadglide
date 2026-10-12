// What the House (level 4) looks like beyond its floor and the props you ride:
// the walls, the coffered ceiling, columns, chandeliers, the slot machines in
// the corners, the doors and the shelves behind the bar. Nothing here can be
// touched; arena.js shows it for level 4 and calls update() every frame.
import * as THREE from 'three';
import { HOUSE, WALL_TOP } from './house.js';
import { panelTexture } from './textures.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { tube, lump, sculpt, dirty, paint, slab, spikes } from '../enemies/sculpt.js';

const CEILING = 34;

export function buildHouseScene() {
  const group = new THREE.Group(), H = HOUSE, S = H.half;
  group.position.set(H.x, 0, H.z);
  const std = (color, roughness = 0.7, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
  const lit = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: false });
  const add = (geo, material, x, y, z) => { const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); group.add(m); return m; };
  const gold = std(0xc9a44a, 0.35, { metalness: 0.5, emissive: 0x2a1c04 }), wood = std(0x3a2116, 0.5), cream = std(0xe9dfc6, 0.85);
  // The sculpted fittings (made with the monsters' kit: enemies/sculpt.js) carry their own paint: gilt, velvet, wood, glass.
  const PI = Math.PI, GILT = 0xd9b04a, DEEP = 0x8a6a22, CREAM = 0xe9dfc6, VELVET = 0x8a1420, WOOD = 0x3a2116, DARK = 0x14100c;
  const painted = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, emissive: 0x120c04 });
  const ring = (R, r, color, at, turn = [PI / 2, 0, 0], around = 24) => paint(new THREE.TorusGeometry(R, r, 6, around).rotateX(turn[0]).rotateY(turn[1]).rotateZ(turn[2]).translate(...at), color);
  const box = (w, h, d, color, at) => paint(new THREE.BoxGeometry(w, h, d).translate(...at), color);
  const turned = (profile, color, at = [0, 0, 0], around = 18) => paint(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), around).translate(...at), color);

  // Walls: cream panels framed in gold, from the top of the curve to the ceiling. And the ceiling.
  const panels = panelTexture();
  for (let k = 0; k < 4; k++) {
    const map = panels.clone();
    map.needsUpdate = true;
    map.repeat.set(8, 1);
    const wall = add(new THREE.PlaneGeometry(S * 2, CEILING - WALL_TOP), new THREE.MeshStandardMaterial({ map, roughness: 0.85 }), 0, (CEILING + WALL_TOP) / 2, 0);
    wall.position.set([0, S - 0.4, 0, -(S - 0.4)][k], (CEILING + WALL_TOP) / 2, [-(S - 0.4), 0, S - 0.4, 0][k]);
    wall.rotation.y = [0, -Math.PI / 2, Math.PI, Math.PI / 2][k];
  }
  const coffers = panels.clone();
  coffers.needsUpdate = true;
  coffers.repeat.set(8, 8);
  add(new THREE.PlaneGeometry(S * 2, S * 2).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ map: coffers, color: 0xd8cdb2, roughness: 0.9 }), 0, CEILING, 0);
  // A gold cornice where the wall meets the curve.
  for (let k = 0; k < 4; k++) {
    const rail = add(new THREE.BoxGeometry(S * 2, 0.5, 0.5), gold, 0, WALL_TOP + 0.2, 0);
    rail.position.set([0, S - 0.5, 0, -(S - 0.5)][k], WALL_TOP + 0.2, [-(S - 0.5), 0, S - 0.5, 0][k]);
    rail.rotation.y = k % 2 ? Math.PI / 2 : 0;
  }

  // Columns down both sides, standing on the curve.
  const tall = CEILING - WALL_TOP;
  const columns = new THREE.InstancedMesh(mergeGeometries([
    dirty(sculpt(paint(new THREE.CylinderGeometry(1.0, 1.22, tall - 3.4, 28, 8, true), CREAM), (v) => { const k = 1 - 0.06 * Math.abs(Math.sin(Math.atan2(v.z, v.x) * 12)); v.x *= k; v.z *= k; }), { mottle: 0.12, freq: 0.6, under: 0.3 }),   // the shaft, fluted
    ring(1.3, 0.22, GILT, [0, -tall / 2 + 1.75, 0]), ring(1.42, 0.16, DEEP, [0, -tall / 2 + 1.45, 0]), box(3.2, 1.1, 3.2, CREAM, [0, -tall / 2 + 0.75, 0]), box(3.4, 0.25, 3.4, GILT, [0, -tall / 2 + 1.3, 0]),   // its base
    ring(1.06, 0.14, GILT, [0, tall / 2 - 2.0, 0]), turned([[1.0, 0], [1.25, 0.5], [1.7, 1.0], [1.7, 1.2]], GILT, [0, tall / 2 - 1.9, 0], 24),                                                                  // the capital...
    ...[0, 1, 2, 3].flatMap((k) => { const a = k * PI / 2 + PI / 4, c = Math.cos(a), s = Math.sin(a); return [ring(0.42, 0.13, GILT, [c * 1.75, tall / 2 - 1.05, s * 1.75], [0, -a + PI / 2, 0], 14), lump(0.16, DEEP, [c * 1.75, tall / 2 - 1.05, s * 1.75], [1, 1, 1], 6)]; }),   // ...a scroll at each corner...
    ...Array.from({ length: 12 }, (_, i) => { const a = i * PI / 6; return tube([[Math.cos(a) * 1.05, tall / 2 - 1.9, Math.sin(a) * 1.05], [Math.cos(a) * 1.35, tall / 2 - 1.3, Math.sin(a) * 1.35], [Math.cos(a) * 1.6, tall / 2 - 1.2, Math.sin(a) * 1.6]], [0.14, 0.12, 0.03], i % 2 ? GILT : DEEP, { sides: 4, steps: 3 }); }),   // ...and leaves between
    box(3.3, 0.5, 3.3, GILT, [0, tall / 2 - 0.25, 0]),
  ]), painted, 16);
  const caps = new THREE.InstancedMesh(new THREE.BoxGeometry(0.01, 0.01, 0.01), gold, 32);   // (the capitals are part of the columns now)
  const m = new THREE.Matrix4();
  let n = 0;
  for (const side of [-1, 1]) for (let i = 0; i < 4; i++) for (const along of [0, 1]) {
    const t = -S + 16 + i * ((S * 2 - 32) / 3), x = along ? t : side * (S - 2.2), z = along ? side * (S - 2.2) : t;
    columns.setMatrixAt(n, m.makeTranslation(x, (CEILING + WALL_TOP) / 2, z));
    caps.setMatrixAt(n * 2, m.makeTranslation(x, CEILING - 0.5, z));
    caps.setMatrixAt(n * 2 + 1, m.makeTranslation(x, WALL_TOP + 0.5, z));
    n++;
  }
  group.add(columns, caps);

  // Chandeliers: a big one over the wheel (the one real light, and the signal for what Babitus is about to do),
  // and four smaller ones that only glow.
  const bulb = lit(0xffe6b0), signal = lit(0xffe6b0);
  const chandelier = (x, z, size, glow) => {
    const c = new THREE.Group();
    c.position.set(x, CEILING - 4 - size * 2, z);
    for (const [r, y] of [[size * 2.4, 0], [size * 1.5, size * 1.1], [size * 0.7, size * 2]]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, size * 0.09, 6, 28).rotateX(Math.PI / 2), gold);
      ring.position.y = y;
      c.add(ring);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2, b = new THREE.Mesh(new THREE.SphereGeometry(size * 0.2, 8, 6), glow);
        b.position.set(Math.cos(a) * r, y + size * 0.22, Math.sin(a) * r);
        c.add(b);
      }
    }
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.06, size * 0.06, 4 + size * 2, 6), gold);
    chain.position.y = size * 2 + 2;
    c.add(chain);
    const bits = [turned([[0.02, -1.0], [0.3, -0.7], [0.12, -0.4], [0.34, 0], [0.16, 0.6], [0.3, 1.2], [0.12, 2.0], [0.2, 2.6], [0.05, 3.0]].map(([r, y]) => [r * size, y * size]), GILT), lump(size * 0.26, 0xf6f2ff, [0, -size * 1.25, 0], [1, 1.5, 1], 8)];   // the stem, and the great drop under it
    for (const [r, y] of [[size * 2.4, 0], [size * 1.5, size * 1.1], [size * 0.7, size * 2]]) for (let i = 0; i < 10; i++) {
      const a = (i / 10) * PI * 2, cx = Math.cos(a), sz = Math.sin(a);
      bits.push(tube([[cx * size * 0.2, y + size * 0.5, sz * size * 0.2], [cx * r * 0.6, y - size * 0.35, sz * r * 0.6], [cx * r, y, sz * r]], [size * 0.05, size * 0.04, size * 0.035], GILT, { sides: 5, steps: 4 }),   // an arm
        turned([[0.0, 0], [0.16, 0.02], [0.2, 0.12], [0.1, 0.14]].map(([rr, yy]) => [rr * size, yy * size]), DEEP, [cx * r, y + size * 0.02, sz * r], 8),                                                    // a cup under each light
        ...spikes(1, () => [[cx * r, y - size * 0.05, sz * r], [cx * r, y - size * (0.55 + 0.2 * (i % 2)), sz * r], size * 0.07], 0xf6f2ff),                                                                 // a drop of glass
        ...(i % 2 ? [] : [tube([[cx * r, y - size * 0.1, sz * r], [Math.cos(a + 0.31) * r * 0.97, y - size * 0.5, Math.sin(a + 0.31) * r * 0.97], [Math.cos(a + 0.63) * r, y - size * 0.1, Math.sin(a + 0.63) * r]], [size * 0.02, size * 0.03, size * 0.02], 0xf6f2ff, { sides: 4, steps: 4 })]));   // and a swag of it to the next
    }
    c.add(new THREE.Mesh(mergeGeometries(bits), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.3, emissive: 0x3a2c12 })));
    group.add(c);
    return c;
  };
  const great = chandelier(0, 0, 2.6, signal);
  for (const [x, z] of [[-34, -34], [34, -34], [-34, 34], [34, 34]]) chandelier(x, z, 1.3, bulb);
  const lamp = new THREE.PointLight(0xffe2b0, 2600, 170, 1.6);
  lamp.position.set(0, CEILING - 12, 0);
  group.add(lamp);

  // Slot machines: a bank of them in each corner, screens flickering.
  const cabinet = std(0x7a1420, 0.5), screens = [];
  // What is bolted on to each (the cabinet is 1.9 x 4.6 x 1.6, its screen at z = 0.81): a lit sign over the top, the
  // frame round the reels and the bars between them, a sloping shelf of buttons, the tray, the arm you pull.
  const slotTrim = mergeGeometries([
    paint(new THREE.CylinderGeometry(1.0, 1.0, 1.6, 20, 1, false, 0, PI).rotateX(PI / 2).rotateZ(PI / 2).rotateY(0).translate(0, 2.75, 0), VELVET),
    ...Array.from({ length: 9 }, (_, i) => { const a = (i / 8) * PI; return lump(0.09, 0xffe08a, [Math.cos(a) * 0.86, 2.75 + Math.sin(a) * 0.86, 0.82], [1, 1, 0.6], 6); }),   // bulbs round the sign
    slab(1.1, 0.34, 0.04, GILT, [0, 3.05, 0.81]), slab(0.7, 0.06, 0.05, VELVET, [0, 3.1, 0.82]), slab(0.5, 0.06, 0.05, VELVET, [0, 2.98, 0.82]),
    slab(1.74, 0.12, 0.1, GILT, [0, 1.6, 0.82]), slab(1.74, 0.12, 0.1, GILT, [0, 0.2, 0.82]), slab(0.12, 1.5, 0.1, GILT, [-0.81, 0.9, 0.82]), slab(0.12, 1.5, 0.1, GILT, [0.81, 0.9, 0.82]),   // the frame
    slab(0.05, 1.3, 0.04, DARK, [-0.25, 0.9, 0.825]), slab(0.05, 1.3, 0.04, DARK, [0.25, 0.9, 0.825]), slab(1.5, 0.03, 0.05, 0xff3a2a, [0, 0.9, 0.83]),                          // between the reels; the pay line
    slab(1.9, 0.14, 0.6, DARK, [0, -0.2, 1.0], [0.5, 0, 0]),                                                                                                                  // the shelf...
    ...[0xff3a2a, 0xffc233, 0x3dff7a, 0x6fe3ff, 0xff5ad0].map((col, i) => lump(0.1, col, [-0.6 + i * 0.3, -0.1, 1.08], [1, 0.5, 1], 6)),                                        // ...of buttons
    slab(1.3, 0.1, 0.4, GILT, [0, -1.3, 0.95]), slab(1.3, 0.3, 0.06, GILT, [0, -1.18, 1.14]), slab(0.9, 0.14, 0.04, DARK, [0, -0.85, 0.815]),                                   // the tray, and the slot the coins fall from
    ...[-1.75, -1.95, -2.15].map((y) => slab(1.2, 0.05, 0.04, DARK, [0, y, 0.815])),                                                                                           // a grille
    tube([[1.0, 0.0, 0.3], [1.3, 0.2, 0.35], [1.38, 1.5, 0.5]], [0.08, 0.06, 0.05], 0xb9bec4, { sides: 6, steps: 4 }), lump(0.17, 0xff3a2a, [1.38, 1.6, 0.5], [1, 1, 1], 8),   // the arm
    ...[-1, 1].map((s) => slab(0.06, 4.4, 0.2, GILT, [s * 0.96, 0, 0.7])), slab(2.1, 0.3, 1.8, DARK, [0, -2.2, 0]),
    ...[0, 1, 2, 3, 4, 5, 6].map((i) => lump(0.06, i % 2 ? 0xffe08a : 0xff5ad0, [-0.78 + i * 0.26, 1.78, 0.83], [1, 1, 0.6], 5)),
  ]);
  for (const [sx, sz] of H.slots) {
    const facing = Math.atan2(-sx, -sz);
    for (let i = -2; i <= 2; i++) {
      const g = new THREE.Group();
      g.position.set(sx + Math.cos(facing) * i * 2.3, WALL_TOP * 0.55, sz - Math.sin(facing) * i * 2.3);
      g.rotation.y = facing;
      g.add(new THREE.Mesh(new THREE.BoxGeometry(1.9, 4.6, 1.6), cabinet));
      const top = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 1.7), gold);
      top.position.y = 2.5;
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.3), lit(0xffc233));
      screen.position.set(0, 0.9, 0.81);
      screen.userData.beat = Math.random() * 6;
      screens.push(screen);
      g.add(top, screen, new THREE.Mesh(slotTrim, painted));
      group.add(g);
    }
  }

  // The doors you came in by (the way out, once he is dead), and the bottles behind the bar.
  // (Kirky came through them without knocking: they hang open, one off its top hinge, and the night is outside.)
  const night = add(new THREE.PlaneGeometry(11.4, 13), new THREE.MeshBasicMaterial({ color: 0x0b1424, toneMapped: false }), H.doors.x, WALL_TOP + 6.5, S - 0.45);
  night.rotation.y = Math.PI;
  let wayOut = false;   // (lit up, once it is the way out)
  // Each leaf (5.6 x 13 x 0.4): six raised panels a side, a brass plate along the bottom, hinges, and a long handle.
  const doorTrim = mergeGeometries([
    ...[-1, 1].flatMap((f) => [
      ...[-1, 1].flatMap((x) => [-4.1, 0, 4.1].flatMap((y) => [slab(2.1, 3.3, 0.08, 0x4a2a1c, [x * 1.3, y + 0.3, f * 0.22]), slab(1.5, 2.7, 0.08, 0x2e1a10, [x * 1.3, y + 0.3, f * 0.25]), slab(2.3, 0.1, 0.1, GILT, [x * 1.3, y + 2.0, f * 0.24])])),
      slab(5.6, 0.9, 0.06, GILT, [0, -5.9, f * 0.22]),
      tube([[2.2, -1.4, f * 0.3], [2.2, -1.0, f * 0.55], [2.2, 1.0, f * 0.55], [2.2, 1.4, f * 0.3]], [0.09, 0.09, 0.09, 0.09], GILT, { sides: 6, steps: 3 }),
    ]),
    ...[-5, 0, 5].map((y) => tube([[-2.85, y - 0.5, 0], [-2.85, y + 0.5, 0]], [0.16, 0.16], DEEP, { sides: 6 })),
  ]);
  // The doorway itself: a pier either side, and a fan of gilt over the top.
  group.add(new THREE.Mesh(mergeGeometries([
    ...[-1, 1].flatMap((s) => [box(1.4, 14, 1.2, CREAM, [H.doors.x + s * 6.7, WALL_TOP + 7, S - 0.9]), box(1.7, 0.6, 1.5, GILT, [H.doors.x + s * 6.7, WALL_TOP + 0.3, S - 0.9]), box(1.7, 0.6, 1.5, GILT, [H.doors.x + s * 6.7, WALL_TOP + 13.7, S - 0.9])]),
    ...Array.from({ length: 9 }, (_, i) => { const a = (i / 8) * PI; return tube([[H.doors.x, WALL_TOP + 14.2, S - 0.9], [H.doors.x + Math.cos(a) * 6.4, WALL_TOP + 14.2 + Math.sin(a) * 4.2, S - 0.9]], [0.12, 0.2], i % 2 ? GILT : DEEP, { sides: 5 }); }),
    ...Array.from({ length: 16 }, (_, i) => { const a = (i / 16) * PI, b = ((i + 1) / 16) * PI; return tube([[H.doors.x + Math.cos(a) * 6.5, WALL_TOP + 14.2 + Math.sin(a) * 4.3, S - 0.9], [H.doors.x + Math.cos(b) * 6.5, WALL_TOP + 14.2 + Math.sin(b) * 4.3, S - 0.9]], [0.28, 0.28], GILT, { sides: 6 }); }),
    lump(0.9, GILT, [H.doors.x, WALL_TOP + 14.4, S - 1.0], [1, 1, 0.5], 12),
  ]), painted));
  // Round the walls, between the columns: velvet curtains caught back with a cord, under a gilt rail; and a lamp on a bracket.
  {
    const drop = CEILING - WALL_TOP - 5, curtain = [];
    for (const s of [-1, 1]) curtain.push(dirty(sculpt(paint(new THREE.PlaneGeometry(4.2, drop, 22, 14).translate(s * 2.3, -drop / 2, 0), VELVET), (v) => {
      const t = -v.y / drop, gather = Math.exp(-((t - 0.62) ** 2) * 30);                 // (pulled in to the side where the cord is)
      v.z = 0.5 + 0.28 * Math.sin(v.x * 6.5 + t * 2) * (1 - 0.4 * gather);
      v.x = s * 4.3 + (v.x - s * 4.3) * (1 - 0.62 * gather) * (1 - 0.12 * Math.sin(t * PI));
    }), { mottle: 0.25, freq: 0.5, under: 0 }));
    for (const s of [-1, 1]) curtain.push(ring(0.5, 0.07, GILT, [s * 3.75, -drop * 0.62, 0.6], [PI / 2, 0, 0], 12), tube([[s * 4.3, -drop * 0.62, 0.3], [s * 4.5, -drop * 0.62 - 1.2, 0.6]], [0.06, 0.14, 0.02], GILT, { sides: 5, steps: 3 }));
    curtain.push(tube([[-5, 0.2, 0.6], [5, 0.2, 0.6]], [0.16, 0.16], GILT, { sides: 8 }), lump(0.3, GILT, [-5.1, 0.2, 0.6], [1, 1, 1], 8), lump(0.3, GILT, [5.1, 0.2, 0.6], [1, 1, 1], 8),
      dirty(sculpt(paint(new THREE.PlaneGeometry(9.6, 1.8, 30, 3).translate(0, -0.7, 0), 0x6a0f18), (v) => { v.z = 0.75 + 0.15 * Math.sin(v.x * 6.5); v.y -= 0.35 * Math.abs(Math.sin(v.x * 0.98)); }), { mottle: 0.2, freq: 0.5, under: 0 }));   // a pelmet across the top
    const sconce = mergeGeometries([
      turned([[0.0, 0], [0.5, 0.05], [0.42, 0.2], [0.2, 0.3]], GILT, [0, 0, 0.2], 12), tube([[0, 0.2, 0.2], [0, 0.5, 0.9], [0, 1.3, 1.1]], [0.09, 0.07, 0.06], GILT, { sides: 5, steps: 4 }),
      turned([[0.1, 0], [0.34, 0.1], [0.3, 0.3], [0.12, 0.34]], DEEP, [0, 1.3, 1.1], 10), ...[-1, 1].map((s) => tube([[0, 0.6, 0.9], [s * 0.6, 0.7, 0.8], [s * 0.8, 1.2, 0.9]], [0.05, 0.04, 0.04], GILT, { sides: 4, steps: 3 })),
      ...[-1, 1].map((s) => turned([[0.08, 0], [0.24, 0.08], [0.2, 0.22]], DEEP, [s * 0.8, 1.2, 0.9], 8)),
    ]);
    const flameGeo = mergeGeometries([[0, 1.75, 1.1, 0.26], [-0.8, 1.55, 0.9, 0.2], [0.8, 1.55, 0.9, 0.2]].map(([x, y, z, r]) => new THREE.SphereGeometry(r, 8, 6).scale(1, 1.5, 1).translate(x, y, z)));
    const spots = [];
    for (let k = 0; k < 4; k++) for (let i = 0; i < 3; i++) {
      const t = -S + 16 + (i + 0.5) * ((S * 2 - 32) / 3), x = [t, S - 0.6, -t, -(S - 0.6)][k], z = [-(S - 0.6), t, S - 0.6, -t][k];
      if (k === 2 && Math.abs(x - H.doors.x) < 14) continue;                                // (not across the doors...)
      if (k === 3 && Math.abs(z - H.bar.z) < 24) continue;                                  // (...or the bar)
      spots.push([x, z, [0, -PI / 2, PI, PI / 2][k]]);
    }
    const drapes = new THREE.InstancedMesh(mergeGeometries(curtain), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }), spots.length);
    const lamps = new THREE.InstancedMesh(sconce, painted, spots.length * 2), flames = new THREE.InstancedMesh(flameGeo, lit(0xffd9a0), spots.length * 2);
    const mm = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), at = new THREE.Vector3();
    spots.forEach(([x, z, turn], i) => {
      q.setFromAxisAngle(up, turn);
      drapes.setMatrixAt(i, mm.compose(at.set(x, CEILING - 3, z), q, one));
      for (const s of [-1, 1]) { at.set(s * 6.6, WALL_TOP + 5, 0).applyQuaternion(q).add({ x, y: 0, z }); const j = i * 2 + (s > 0 ? 1 : 0); lamps.setMatrixAt(j, mm.compose(at, q, one)); flames.setMatrixAt(j, mm.compose(at, q, one)); }
    });
    group.add(drapes, lamps, flames);
  }
  for (const side of [-1, 1]) {
    const a = side < 0 ? 1.3 : 1.05, leaf = add(new THREE.BoxGeometry(5.6, 13, 0.4), wood, H.doors.x + side * (5.7 - 2.8 * Math.cos(a)), WALL_TOP + 6.5, S - 0.7 - 2.8 * Math.sin(a));
    leaf.rotation.set(0, side * a, side > 0 ? 0.1 : 0);
    leaf.add(new THREE.Mesh(doorTrim, painted));
  }
  add(new THREE.BoxGeometry(13, 1, 0.9), gold, H.doors.x, WALL_TOP + 13.5, S - 0.7);
  add(new THREE.BoxGeometry(0.8, 9, 40), wood, -(S - 1.2), WALL_TOP + 5.5, H.bar.z);
  // Behind the bar: three shelves on brackets, a mirror in a gilt frame behind them, and the bottles (each a bottle: shoulders, a neck, a cork).
  group.add(new THREE.Mesh(mergeGeometries([
    ...[0, 1, 2].flatMap((k) => [box(1.3, 0.16, 39, WOOD, [-(S - 1.9), WALL_TOP + 1.45 + k * 2.6, H.bar.z]), box(0.5, 0.1, 39.2, GILT, [-(S - 2.5), WALL_TOP + 1.45 + k * 2.6, H.bar.z]),
      ...Array.from({ length: 6 }, (_, i) => tube([[-(S - 1.3), WALL_TOP + 0.5 + k * 2.6, H.bar.z - 18 + i * 7.2], [-(S - 2.3), WALL_TOP + 1.35 + k * 2.6, H.bar.z - 18 + i * 7.2]], [0.08, 0.08], GILT, { sides: 4 }))]),
    box(0.2, 9.6, 0.5, GILT, [-(S - 0.75), WALL_TOP + 5.5, H.bar.z - 20.2]), box(0.2, 9.6, 0.5, GILT, [-(S - 0.75), WALL_TOP + 5.5, H.bar.z + 20.2]), box(0.2, 0.5, 40.9, GILT, [-(S - 0.75), WALL_TOP + 10.2, H.bar.z]), box(0.2, 0.5, 40.9, GILT, [-(S - 0.75), WALL_TOP + 0.8, H.bar.z]),
    lump(1.1, GILT, [-(S - 0.8), WALL_TOP + 10.9, H.bar.z], [0.3, 0.8, 1.6], 10),
  ]), painted));
  const bottles = new THREE.InstancedMesh(new THREE.LatheGeometry([[0, -0.65], [0.3, -0.65], [0.32, -0.55], [0.32, 0.1], [0.24, 0.3], [0.1, 0.42], [0.09, 0.8], [0.12, 0.82], [0.12, 0.9], [0, 0.9]].map(([r, y]) => new THREE.Vector2(r, y)), 10), lit(0xffffff), 60);
  const tint = new THREE.Color();
  for (let i = 0; i < 60; i++) {
    bottles.setMatrixAt(i, m.makeTranslation(-(S - 1.9), WALL_TOP + 2.2 + (i % 3) * 2.6, H.bar.z - 18 + Math.floor(i / 3) * 1.9));
    bottles.setColorAt(i, tint.setHSL([0.08, 0.3, 0.55, 0.0, 0.12][i % 5], 0.8, 0.5));
  }
  group.add(bottles);
  // The drink the barman slides out: a tall glowing glass on the counter.
  const drink = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.26, 1.1, 10), lit(0x6fe3ff));
  drink.position.set(H.bar.x + 2, 2.4, H.bar.z);
  group.add(drink);

  const colour = new THREE.Color(), want = new THREE.Color(0xffe6b0);
  group.userData = {
    drink,
    // The doorway: glowing (the way out, once he is dead) or just the night.
    exit(on) { wayOut = on; },
    // What the great chandelier is showing: 'red', 'black' (it dims), 'green', or null for its ordinary light.
    signal(name) { want.set(name === 'red' ? 0xff3a2a : name === 'green' ? 0x3dff7a : name === 'black' ? 0x6a5cff : 0xffe6b0); },
    update(dt, time) {
      colour.copy(signal.color).lerp(want, 1 - Math.exp(-9 * dt));
      signal.color.copy(colour);
      lamp.color.copy(colour);
      great.rotation.y += dt * 0.15;
      for (const s of screens) s.material.color.setHSL((time * 0.3 + s.userData.beat) % 1, 0.9, 0.5 + 0.2 * Math.sin(time * 9 + s.userData.beat));
      night.material.color.set(0x0b1424).lerp(colour.set(0x7dffb0), wayOut ? 0.45 + 0.3 * Math.sin(time * 4) : 0);
      drink.rotation.y += dt * 2;
      drink.position.y = 2.4 + Math.sin(time * 3) * 0.12;
    },
  };
  return group;
}
