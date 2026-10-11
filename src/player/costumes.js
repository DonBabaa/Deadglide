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

export const COSTUMES = {
  astronaut: { name: 'Dead Astronaut', suit: '#d6d6da', pack: 0x77787e, helmet: { shell: 0xd9d9de, visor: 0x1c1408, skull: true } },
  grey: { name: 'The Grey', suit: '#7f8a84', skin: 0x8f9a92, alien: { color: 0x8f9a92, eyes: 0x050508, big: 1.25 } },
  cosmonaut: { name: 'Cosmonaut', suit: '#c2561c', pack: 0xd8d8dc, helmet: { shell: 0xf0f0f2, visor: 0xb9882a, stripe: 0xc8201b } },
  gilded: { name: 'Golden Boy', suit: '#c9a23a', pack: 0xa8842a, helmet: { shell: 0xd9b24a, visor: 0x2a1c04 } },
  void: { name: 'Void Walker', suit: '#0c0c14', skin: 0x15151f, alien: { color: 0x0e0e16, eyes: 0xb46bff, big: 1.2, lit: true } },
  martian: { name: 'Little Green Man', suit: '#2f8a34', skin: 0x55c84a, alien: { color: 0x55c84a, eyes: 0x050508, big: 1.15, antennae: true } },
};

const std = (color, roughness = 0.6, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
const part = (geometry, material, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geometry, material); m.position.set(x, y, z); m.castShadow = true; return m; };

// What goes over his head. (His head is a sphere 0.125 m across at the origin of this group.)
export function buildMask(id) {
  const C = COSTUMES[id], g = new THREE.Group();
  if (!C) return g;
  if (C.helmet) {
    const H = C.helmet;
    g.add(
      part(new THREE.SphereGeometry(0.205, 20, 14), std(H.shell, 0.45), 0, 0.01, 0),
      part(new THREE.SphereGeometry(0.2, 18, 12, 0, Math.PI * 2, 0.45, 1.25).rotateX(Math.PI / 2), std(H.visor, 0.15, { emissive: H.visor, emissiveIntensity: 0.25 }), 0, 0.01, 0.03),
      part(new THREE.CylinderGeometry(0.15, 0.17, 0.07, 16), std(0x55565c, 0.6), 0, -0.19, 0),   // the neck ring
    );
    if (H.skull) g.add(part(new THREE.SphereGeometry(0.095, 12, 10), new THREE.MeshBasicMaterial({ color: 0xd8d2bf }), 0, 0.0, 0.135), part(new THREE.SphereGeometry(0.022, 6, 5), new THREE.MeshBasicMaterial({ color: 0x0a0806 }), -0.035, 0.015, 0.222), part(new THREE.SphereGeometry(0.022, 6, 5), new THREE.MeshBasicMaterial({ color: 0x0a0806 }), 0.035, 0.015, 0.222));
    if (H.stripe) g.add(part(new THREE.TorusGeometry(0.207, 0.014, 6, 24, Math.PI).rotateY(Math.PI / 2), std(H.stripe, 0.5), 0, 0.01, 0));
  } else if (C.alien) {
    const A = C.alien, eye = A.lit ? new THREE.MeshBasicMaterial({ color: A.eyes, toneMapped: false }) : std(A.eyes, 0.1);
    const head = part(new THREE.SphereGeometry(0.17, 20, 16), std(A.color, 0.5), 0, 0.05, 0.005);
    head.scale.set(A.big, A.big * 1.22, A.big * 1.05);
    g.add(head);
    for (const s of [-1, 1]) {
      const e = part(new THREE.SphereGeometry(0.055, 12, 10), eye, s * 0.075 * A.big, 0.045, 0.145 * A.big);
      e.scale.set(1, 1.5, 0.5);
      e.rotation.z = s * -0.45;
      g.add(e);
      if (A.antennae) g.add(part(new THREE.CylinderGeometry(0.006, 0.008, 0.2, 5), std(A.color, 0.5), s * 0.07, 0.34, 0), part(new THREE.SphereGeometry(0.022, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff5a3a }), s * 0.07, 0.45, 0));
    }
  }
  return g;
}

// The pack on his back.
export function buildPack(id) {
  const C = COSTUMES[id];
  if (!C || !C.pack) return null;
  const g = new THREE.Group();
  g.add(part(new THREE.BoxGeometry(0.3, 0.36, 0.14), std(C.pack, 0.7), 0, 0, 0), part(new THREE.BoxGeometry(0.2, 0.08, 0.06), std(0x33343a, 0.6), 0, 0.2, 0), part(new THREE.SphereGeometry(0.02, 6, 5), new THREE.MeshBasicMaterial({ color: 0xff4a3a }), 0.1, 0.12, -0.075));
  return g;
}
