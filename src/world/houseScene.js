// What the House (level 4) looks like beyond its floor and the props you ride:
// the walls, the coffered ceiling, columns, chandeliers, the slot machines in
// the corners, the doors and the shelves behind the bar. Nothing here can be
// touched; arena.js shows it for level 4 and calls update() every frame.
import * as THREE from 'three';
import { HOUSE, WALL_TOP } from './house.js';
import { panelTexture } from './textures.js';

const CEILING = 34;

export function buildHouseScene() {
  const group = new THREE.Group(), H = HOUSE, S = H.half;
  group.position.set(H.x, 0, H.z);
  const std = (color, roughness = 0.7, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
  const lit = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: false });
  const add = (geo, material, x, y, z) => { const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); group.add(m); return m; };
  const gold = std(0xc9a44a, 0.35, { metalness: 0.5, emissive: 0x2a1c04 }), wood = std(0x3a2116, 0.5), cream = std(0xe9dfc6, 0.85);

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
  const columns = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.1, 1.3, CEILING - WALL_TOP, 14), cream, 16);
  const caps = new THREE.InstancedMesh(new THREE.BoxGeometry(3.2, 1, 3.2), gold, 32);
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
      g.add(top, screen);
      group.add(g);
    }
  }

  // The doors you came in by (the way out, once he is dead), and the bottles behind the bar.
  // (Kirky came through them without knocking: they hang open, one off its top hinge, and the night is outside.)
  const night = add(new THREE.PlaneGeometry(11.4, 13), new THREE.MeshBasicMaterial({ color: 0x0b1424, toneMapped: false }), H.doors.x, WALL_TOP + 6.5, S - 0.45);
  night.rotation.y = Math.PI;
  let wayOut = false;   // (lit up, once it is the way out)
  for (const side of [-1, 1]) {
    const a = side < 0 ? 1.3 : 1.05, leaf = add(new THREE.BoxGeometry(5.6, 13, 0.4), wood, H.doors.x + side * (5.7 - 2.8 * Math.cos(a)), WALL_TOP + 6.5, S - 0.7 - 2.8 * Math.sin(a));
    leaf.rotation.set(0, side * a, side > 0 ? 0.1 : 0);
  }
  add(new THREE.BoxGeometry(13, 1, 0.9), gold, H.doors.x, WALL_TOP + 13.5, S - 0.7);
  add(new THREE.BoxGeometry(0.8, 9, 40), wood, -(S - 1.2), WALL_TOP + 5.5, H.bar.z);
  const bottles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.28, 0.32, 1.3, 8), lit(0xffffff), 60);
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
