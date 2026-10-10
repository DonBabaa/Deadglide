// One merged, vertex-coloured mesh per enemy type, drawn with InstancedMesh.
// Feet at y = 0, facing +Z, about 1.8 m tall.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Paint a whole geometry one colour (so differently coloured parts can be merged).
function tint(geo, hex) {
  const c = new THREE.Color(hex), n = geo.attributes.position.count, colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}
const box = (w, h, d, x, y, z, color, rx = 0) => tint(new THREE.BoxGeometry(w, h, d).rotateX(rx).translate(x, y, z), color);
const ball = (r, x, y, z, color) => tint(new THREE.SphereGeometry(r, 10, 8).translate(x, y, z), color);
const limb = (r, len, x, y, z, color, rx = 0) => tint(new THREE.CapsuleGeometry(r, len, 3, 8).rotateX(rx).translate(x, y, z), color);

// Zombie: hunched, arms reaching forward.
function shambler() {
  const skin = 0x6f7f5c, shirt = 0x4a4f45, trousers = 0x2b2a2e;
  return mergeGeometries([
    limb(0.11, 0.55, -0.15, 0.42, 0, trousers), limb(0.11, 0.55, 0.15, 0.42, 0, trousers),
    box(0.52, 0.62, 0.3, 0, 1.15, 0.05, shirt, 0.2),
    ball(0.17, 0, 1.62, 0.16, skin),
    limb(0.075, 0.5, -0.3, 1.32, 0.38, skin, Math.PI / 2 - 0.15), limb(0.075, 0.5, 0.3, 1.3, 0.38, skin, Math.PI / 2 + 0.1),
  ]);
}

// Skeleton: thin, upright, arms out to the sides.
function rattler() {
  const bone = 0xd9d4c2, dark = 0x2a2824;
  return mergeGeometries([
    limb(0.045, 0.7, -0.12, 0.42, 0, bone), limb(0.045, 0.7, 0.12, 0.42, 0, bone),
    box(0.3, 0.12, 0.16, 0, 0.88, 0, bone),                                  // pelvis
    limb(0.035, 0.4, 0, 1.12, 0, bone),                                      // spine
    box(0.4, 0.34, 0.22, 0, 1.3, 0, bone), box(0.3, 0.24, 0.23, 0, 1.3, 0, dark),   // ribcage
    ball(0.15, 0, 1.66, 0.02, bone), box(0.18, 0.05, 0.05, 0, 1.68, 0.14, dark),    // skull + eye sockets
    limb(0.035, 0.55, -0.27, 1.1, 0.12, bone, 0.4), limb(0.035, 0.55, 0.27, 1.1, 0.12, bone, 0.4),
  ]);
}

// Ghost: a pale hooded shroud with a skull face, arms reaching, no legs.
function wraith() {
  const shroud = 0xaeb9cf, hood = 0x7f8aa3, bone = 0xe6e2d2, dark = 0x101218;
  return mergeGeometries([
    tint(new THREE.ConeGeometry(0.42, 1.25, 9, 1, true).translate(0, 0.62, 0), shroud),   // trailing robe, open at the bottom
    ball(0.24, 0, 1.32, 0, hood),
    ball(0.15, 0, 1.3, 0.12, bone), box(0.17, 0.05, 0.05, 0, 1.33, 0.25, dark),
    limb(0.055, 0.5, -0.3, 1.0, 0.3, shroud, Math.PI / 2 - 0.3), limb(0.055, 0.5, 0.3, 1.0, 0.3, shroud, Math.PI / 2 - 0.3),
  ]);
}

export const ENEMY_GEOMETRY = { shambler, rattler, wraith };
