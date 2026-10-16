// The freight lift (his picture): one cage, built here for the Moon's lift (freeride/airlock.js) and the station's
// (deadair/lift.js), so that the lift you go down in is the lift you come up in. A frame of dark square tube, wire mesh
// on three sides and over the top, two mesh doors across the front that slide apart, a header and the track they run
// in, a call panel on the post by the doors, a caged work lamp up on the front of the roof, a sign over the doors.
// Built into `cage` with its doors toward -z (turn the group to point them elsewhere).
//   const f = buildFreightCage(cage, pieces, { half, height, title, sub });
//   f.placeLeaves(k)   the doors: 1 shut (meeting in the middle) .. 0 open (each beyond its side)
//   f.halves, f.lamp (its PointLight), f.bulb, f.klaxon, f.screen, f.lampAt (the lamp, in the cage's space)
import * as THREE from 'three';
import { signTexture } from './station.js';

// Wire mesh: a square of it, its wires dark on nothing (alpha), to be tiled.
export function meshTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 32, 32);
  g.strokeStyle = '#d8dadf'; g.lineWidth = 4;
  g.strokeRect(2, 2, 28, 28);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function buildFreightCage(cage, pieces, { half = 2, height = 3.3, title = 'SHACKLETON STATION', sub = 'MAINTENANCE ACCESS  ·  DECK C' } = {}) {
  const put = (parent, name, x, y, z, yaw = 0) => {
    const p = pieces[name]; if (!p) { console.warn(`The lift: no piece ${name} in the kit`); return null; }
    const c = p.clone(true); c.position.set(x, y, z); c.rotation.y = yaw;
    c.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
    parent.add(c);
    return c;
  };
  // The cage, as a freight lift is (his picture): a frame of square steel tube, dark, with wire mesh between its
  // members on three sides and over the top; a pair of mesh doors in a frame across the front that slide apart; a
  // call panel on the post by the doors; a caged work lamp up on the front of the roof. (On the Moon, a lock over its call button: freeride/lockout.js.)
  const steel = new THREE.MeshStandardMaterial({ color: 0x24272c, metalness: 0.65, roughness: 0.45 });
  const steelDark = new THREE.MeshStandardMaterial({ color: 0x17191c, metalness: 0.6, roughness: 0.55 });
  const mesh = new THREE.MeshStandardMaterial({ map: meshTexture(), color: 0x50555c, metalness: 0.6, roughness: 0.5, alphaTest: 0.45, side: THREE.DoubleSide });
  const bar = (w, h, d, x, y, z, m = steel) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; b.receiveShadow = true; cage.add(b); return b; };
  const panel = (w, h, x, y, z, yaw, parent = cage, m = mesh) => { const g = new THREE.PlaneGeometry(w, h); const t = m.map.clone(); t.needsUpdate = true; t.repeat.set(w / 0.09, h / 0.09); const mat = m.clone(); mat.map = t; const p = new THREE.Mesh(g, mat); p.position.set(x, y, z); p.rotation.y = yaw; parent.add(p); return p; };
  const H = height, T = 0.12;   // (its height; the tube's size)
  put(cage, 'Platform_Metal', 0, 0.02, 0, 0);
  for (const [x, z] of [[-half, -half], [half, -half], [-half, half], [half, half]]) bar(T, H, T, x, H / 2, z);   // corner posts
  for (const z of [-half, half]) { bar(half * 2 + T, T, T, 0, H, z); bar(half * 2 + T, T * 0.8, T * 0.8, 0, 0.1, z); }   // the frame over the top and round the foot
  for (const x of [-half, half]) { bar(T, T, half * 2, x, H, 0); bar(T * 0.8, T * 0.8, half * 2, x, 0.1, 0); }
  for (const y of [1.1, 2.2]) { bar(T * 0.7, T * 0.7, half * 2, -half, y, 0, steelDark); bar(T * 0.7, T * 0.7, half * 2, half, y, 0, steelDark); bar(half * 2, T * 0.7, T * 0.7, 0, y, half, steelDark); }   // its rails, sides and back
  bar(T * 0.7, H, T * 0.7, 0, H / 2, half, steelDark);   // (the back's middle upright)
  // the mesh: the sides, the back (two panels each side of its upright), the roof
  panel(half * 2, H - 0.2, -half + 0.01, H / 2, 0, Math.PI / 2); panel(half * 2, H - 0.2, half - 0.01, H / 2, 0, -Math.PI / 2);
  panel(half * 2, H - 0.2, 0, H / 2, half - 0.01, Math.PI);
  { const roof = panel(half * 2, half * 2, 0, H - 0.01, 0, 0); roof.rotation.set(-Math.PI / 2, 0, 0); }
  // the doors: two leaves, each a frame of tube round a mesh, a bar across at hand height and a handle at the meeting edge;
  // closed they fill the front between its posts, open they stand aside, beyond them
  const leafW = half - 0.03, leafH = H - 0.25;
  const halves = [-1, 1].map((side) => {
    const leaf = new THREE.Group(); leaf.userData.side = side;
    const lb = (w, h, d, x, y, z, m = steel) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; leaf.add(b); };
    lb(leafW, 0.07, 0.06, 0, leafH, 0); lb(leafW, 0.07, 0.06, 0, 0.12, 0); lb(0.07, leafH, 0.06, -leafW / 2, leafH / 2 + 0.06, 0); lb(0.07, leafH, 0.06, leafW / 2, leafH / 2 + 0.06, 0);
    lb(leafW, 0.06, 0.05, 0, 1.1, 0, steelDark); lb(leafW, 0.05, 0.05, 0, 2.2, 0, steelDark);
    lb(0.035, 0.42, 0.035, -side * (leafW / 2 - 0.16), 1.25, -0.07, steelDark);   // (the handle, out on its front)
    lb(0.03, 0.03, 0.06, -side * (leafW / 2 - 0.16), 1.45, -0.04, steelDark); lb(0.03, 0.03, 0.06, -side * (leafW / 2 - 0.16), 1.05, -0.04, steelDark);
    panel(leafW - 0.06, leafH - 0.06, 0, leafH / 2 + 0.08, 0, 0, leaf);
    leaf.position.set(side * (leafW / 2 + 0.015), 0.02, -half - 0.09);
    cage.add(leaf);
    return leaf;
  });
  // the doors' frame: a header over them, the track it runs in out past each side
  bar(half * 2 + 4.4, 0.14, 0.12, 0, H - 0.05, -half - 0.17, steelDark);
  bar(half * 2 + 4.4, 0.05, 0.1, 0, 0.04, -half - 0.17, steelDark);
  // the call panel: on the post by the doors, out in front (its screen lit)
  const box = bar(0.16, 0.42, 0.08, half + 0.17, 1.35, -half - 0.06, steelDark);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.07), new THREE.MeshBasicMaterial({ color: 0x9ae6ff, toneMapped: false })); screen.position.set(half + 0.17, 1.47, -half - 0.105); screen.rotation.y = Math.PI; cage.add(screen);
  const buttons = [0x3aff6a, 0xff2a14].map((c, k) => { const b2 = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 10), new THREE.MeshBasicMaterial({ color: c, toneMapped: false })); b2.rotation.x = Math.PI / 2; b2.position.set(half + 0.17, 1.3 - k * 0.07, -half - 0.105); cage.add(b2); return b2; });
  // the lamp: a work lamp in a cage of wire, up on the front of the roof (the one to shoot)
  const LAMP = new THREE.Vector3(0, H + 0.2, -half + 0.12);
  bar(0.2, 0.06, 0.2, LAMP.x, H + 0.05, LAMP.z, steelDark);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), new THREE.MeshBasicMaterial({ color: 0xff2a14, toneMapped: false })); bulb.position.copy(LAMP); cage.add(bulb);
  for (let k = 0; k < 4; k++) { const wire = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.008, 4, 16, Math.PI), steelDark); wire.position.copy(LAMP).setY(H + 0.08); wire.rotation.set(0, (k * Math.PI) / 4, 0); cage.add(wire); }
  const lamp = new THREE.PointLight(0xff2a14, 2.2, 8, 1.6); lamp.position.copy(LAMP).setY(H - 0.2); cage.add(lamp);
  const klaxon = new THREE.PointLight(0xff8a2a, 0, 9, 1.4); klaxon.position.set(0, 2.6, -half + 0.3); cage.add(klaxon);
  // the sign over the doors (the only one: the one on its post by spawn, and the lights on the floor, are gone)
  const over = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.0), new THREE.MeshBasicMaterial({ map: signTexture(title, sub, '#9ae6ff', '#ffd27a'), transparent: true, toneMapped: false }));
  over.position.set(0, H + 0.62, -half - 0.2); over.rotation.y = Math.PI; cage.add(over);
  // (closed, k 1, the leaves meet in the middle of the front; open, 0, each stands beyond its side)
  const placeLeaves = (k) => { const e = k * k * (3 - 2 * k); for (const h of halves) h.position.x = h.userData.side * ((half - 0.015) / 2 + 0.015 + (1 - e) * (half + 0.12)); };
  return { halves, lamp, bulb, klaxon, screen, lampAt: LAMP, placeLeaves };
}
