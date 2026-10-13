// The DeadSlide Casino from the outside, as you see it once: at the top of the Long Way Down, the moment before
// it comes down. A front in the manner of Monte Carlo: cream stone, three tall arched windows over the doors, a
// clock, two towers with copper domes, a wing either side. It is only a front (the hill is behind it), built facing
// -z, standing on y = 0 with its middle at x = 0.
// buildCasinoFront() returns { group, fall(k, time), doors(k) }: fall: k 0 = standing, 1 = gone (and hidden).
import * as THREE from 'three';
import { props } from './props.js';

const smooth = (k) => { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); };

export function buildCasinoFront() {
  const group = new THREE.Group(), parts = [];
  const flat = (color) => new THREE.MeshBasicMaterial({ color, fog: false, side: THREE.DoubleSide });
  const stone = flat(0xb9aa86), shade = flat(0x8a7d62), roof = flat(0x3f7f6e), dark = flat(0x1c1611), gold = flat(0xd9a52a);
  const lit = new THREE.MeshBasicMaterial({ color: 0xffcf70, fog: false, toneMapped: false, side: THREE.DoubleSide });
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  // A piece of the building that falls on its own. tall: how far it has to sink to be gone; delay: when it starts
  // (0..1 of the fall); tilt, lean: how far it tips sideways and forward on the way (radians).
  const piece = (x, tall, delay, tilt, lean) => {
    const g = new THREE.Group();
    g.position.x = x;
    group.add(g);
    parts.push({ g, x, tall, delay, tilt, lean });
    return g;
  };
  const add = (g, geometry, material, x, y, z) => { const m = new THREE.Mesh(geometry, material); m.position.set(x, y, z); g.add(m); return m; };
  const arch = (r) => new THREE.CircleGeometry(r, 16, 0, Math.PI);

  // The middle: the doors, three tall windows, the sign, the clock.
  const mid = piece(0, 46, 0.3, 0.06, -0.35);
  add(mid, box(30, 28, 6), stone, 0, 14, 3);
  add(mid, box(72, 21, 30), shade, 0, 10.5, 21);   // (the rest of the building, behind the front)
  add(mid, box(74, 2.5, 32), roof, 0, 22, 21);
  add(mid, box(32, 1.2, 7.4), shade, 0, 28.6, 3);
  add(mid, box(30, 3.5, 6), roof, 0, 31, 3.2);
  add(mid, box(12, 7.5, 1.6), stone, 0, 33, 0.6);
  add(mid, new THREE.CircleGeometry(2.3, 20), lit, 0, 33.4, -0.25);
  add(mid, new THREE.SphereGeometry(6, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), roof, 0, 33, 5);
  for (const x of [-9, 0, 9]) {
    add(mid, box(5, 12, 0.4), lit, x, 14, -0.1);
    add(mid, arch(2.5), lit, x, 20, -0.3);
    if (x) add(mid, box(4, 5.6, 0.4), dark, x, 2.8, -0.1);
  }
  // The middle doors: two leaves on hinges, and the light of the room behind them.
  add(mid, box(4, 5.6, 0.2), lit, 0, 2.8, 0.5);
  const leaves = [-1, 1].map((side) => {
    const hinge = new THREE.Group();
    hinge.position.set(side * 2, 2.8, -0.1);
    add(hinge, box(2, 5.6, 0.3), dark, -side, 0, 0);
    mid.add(hinge);
    return hinge;
  });
  for (const x of [-13.6, -4.5, 4.5, 13.6]) add(mid, new THREE.CylinderGeometry(0.7, 0.8, 21, 10), shade, x, 11.5, -1.2);
  add(mid, box(27, 0.8, 5), roof, 0, 6.6, -2.4);
  add(mid, box(34, 0.5, 7), shade, 0, 0.25, -3.4);
  add(mid, box(31, 0.5, 5), stone, 0, 0.75, -2.4);
  {
    const c = Object.assign(document.createElement('canvas'), { width: 512, height: 96 }), g = c.getContext('2d');
    g.fillStyle = '#1c1611'; g.fillRect(0, 0, 512, 96);
    g.fillStyle = '#ffcf70'; g.font = '74px Anton, Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('C A S I N O', 256, 52);
    const face = new THREE.CanvasTexture(c);
    face.colorSpace = THREE.SRGBColorSpace;
    const sign = add(mid, new THREE.PlaneGeometry(15, 2.8), new THREE.MeshBasicMaterial({ map: face, fog: false, toneMapped: false }), 0, 25.2, -0.3);
    sign.rotation.y = Math.PI;
    mid.userData.sign = sign;
  }

  // The two towers, each with a belfry, a copper dome and a gold spire.
  for (const side of [-1, 1]) {
    const tower = piece(side * 19, 70, side < 0 ? 0 : 0.42, side * (side < 0 ? 0.7 : -0.9), -0.2);
    add(tower, box(8, 44, 7), stone, 0, 22, 3.5);
    add(tower, box(9.4, 1, 8.4), shade, 0, 44.5, 3.5);
    add(tower, box(6.5, 7, 6), stone, 0, 48.5, 3.5);
    add(tower, box(2.2, 4.6, 0.3), lit, 0, 48.5, 0.35);
    add(tower, new THREE.SphereGeometry(4.2, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.5, 1), roof, 0, 52, 3.5);
    add(tower, new THREE.ConeGeometry(0.5, 7, 6), gold, 0, 61.5, 3.5);
    for (const y of [12, 22, 32]) add(tower, box(2.4, 5, 0.3), lit, 0, y, -0.1);
    add(tower, new THREE.CircleGeometry(1.4, 16), lit, 0, 40, -0.1);
  }
  // The wings.
  for (const side of [-1, 1]) {
    const wing = piece(side * 30, 30, side < 0 ? 0.2 : 0.1, side * 0.15, -0.3);
    add(wing, box(14, 20, 5), stone, 0, 10, 2.5);
    add(wing, box(15, 1, 6), shade, 0, 20.5, 2.5);
    add(wing, box(14, 3, 5), roof, 0, 22.5, 2.6);
    for (const x of [-4, 0, 4]) for (const y of [5.5, 14]) add(wing, box(2.4, 5.4, 0.3), lit, x, y, -0.1);
  }

  // The building itself is modelled in Blender, and takes the place of the blocks above when it arrives: the middle,
  // one tower and one wing (each used on both sides: mirrored), one door leaf. What moves stays as it was: the same
  // pieces fall, the same hinges swing.
  props().then((P) => {
    if (!P.casino_mid) return;
    const painted = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide });
    const swap = (g, geometry, mirror, keep = []) => { for (const c of [...g.children]) if (!keep.includes(c)) g.remove(c); const m = new THREE.Mesh(geometry, painted); if (mirror) m.scale.x = -1; g.add(m); };
    swap(mid, P.casino_mid, false, [mid.userData.sign, ...leaves]);
    parts.forEach((p) => { if (Math.abs(p.x) === 19 && P.casino_tower) swap(p.g, P.casino_tower, p.x < 0); if (Math.abs(p.x) === 30 && P.casino_wing) swap(p.g, P.casino_wing, p.x < 0); });
    if (P.casino_door) leaves.forEach((hinge, i) => { hinge.clear(); const leaf = new THREE.Mesh(P.casino_door, painted); leaf.scale.x = i ? -1 : 1; hinge.add(leaf); });
  });

  return {
    group,
    // k: 0 = shut, 1 = thrown wide open (inward).
    doors(k) { leaves.forEach((hinge, i) => { hinge.rotation.y = (i ? -1 : 1) * 1.5 * k; }); },
    fall(k, time = 0) {
      group.visible = k < 1;
      const shake = Math.min(1, k * 14);
      parts.forEach((p, i) => {
        const f = smooth((k - p.delay) / 0.55);
        p.g.position.set(p.x + Math.sin(time * 41 + i * 2) * 0.22 * shake * (1 - f), -f * f * p.tall + Math.sin(time * 53 + i) * 0.1 * shake, 0);
        p.g.rotation.set(p.lean * f, 0, p.tilt * f);
      });
    },
  };
}
