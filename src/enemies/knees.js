// Elbows, too: an arm comes as one stiff part hinged at the shoulder, and is cut the same way, half-way along it
// (`elbow`: how far along, as a share of its length), into the same part and a new one on the end of the list:
//   { role: 'forearm', parent: the index of the arm it hangs from }
// Its pivot is the elbow. Whatever is in that hand (a part of its own, hinged at the same shoulder) becomes a forearm
// part as well (`held`), so that it goes where the hand goes.
//
// Knees. A monster's leg comes as one stiff part, hinged at the hip. withKnees() cuts each leg in two where it bends
// (a person's, a rat's: at the knee; a spider's: at the top of its arch) and hands back the same list of parts with
// the lower half of each leg added on the end as a part of its own:
//   { role: 'shin', parent: the index of the leg it hangs from, hinge: 'x' | 'z', flex: how far it bends (rad), ... }
// Its pivot is the knee. Whoever draws the monster (horde.js in a run, modelViewer.js in the editor) turns it about
// that, on the end of the upper half, as the leg comes forward.
import * as THREE from 'three';

// monster -> { cut: 'y' (below a height) | 'x' (further out than a distance), at: where (for y: that share of the hip's
// height; for x: metres from the middle), legBelow: a part hinged lower than this, off the middle line, is a leg, flex }
const person = (legBelow, flex, elbow = 0.5) => ({ cut: 'y', at: 0.54, legBelow, flex, elbow });
const KNEES = {
  shambler: person(1.1, 0.95), zombieb: person(1.1, 0.95), zombiec: person(1.2, 0.95), rattler: person(1.1, 1.15), boss: person(1.3, 0.8), boss2: person(1.5, 0.8),
  boss3: person(1.4, 0.85), boss3b: person(1.4, 0.85), boss3c: person(1.4, 0.85), boss3d: person(1.4, 0.85), thrower: person(1.1, 1.1),
  rat: { cut: 'y', at: 0.5, legBelow: 0.3, flex: 0.8 },
  crawler: { cut: 'x', at: 0.46, legBelow: 9, flex: 0.35 }, queen: { cut: 'x', at: 0.46, legBelow: 9, flex: 0.35 },
};

// A part of this monster hinged lower than this (and off its middle line) is a leg; undefined: no telling from here.
export const legLine = (name) => KNEES[name]?.legBelow;

export function withKnees(name, parts) {
  const K = KNEES[name];
  if (!K) return parts;
  const out = parts.slice();
  parts.forEach((p, i) => {
    const [px, py, pz] = p.pivot;
    if (p.glow || p.role || Math.abs(px) < 0.02 || py > K.legBelow || Math.hypot(px, py, pz) < 0.01) return;
    const g = p.geometry.index ? p.geometry.toNonIndexed() : p.geometry, pos = g.attributes.position, n = pos.count / 3;
    const side = Math.sign(px), level = py * K.at;
    const low = (x, y) => (K.cut === 'y' ? y + py < level : Math.abs(x + px) > K.at);
    // Where the knee is: the middle of the leg where it is cut.
    let kx = 0, ky = 0, kz = 0, near = 0;
    for (let v = 0; v < pos.count; v++) {
      const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
      if (K.cut === 'y' ? Math.abs(y + py - level) < 0.05 * Math.max(1, py) : Math.abs(Math.abs(x + px) - K.at) < 0.05) { kx += x; ky += y; kz += z; near++; }
    }
    if (!near) return;
    kx /= near; ky /= near; kz /= near;
    if (K.cut === 'y') ky = level - py; else kx = side * K.at - px;
    const which = new Uint8Array(n);
    let lower = 0;
    for (let t = 0; t < n; t++) {
      const a = t * 3, x = (pos.getX(a) + pos.getX(a + 1) + pos.getX(a + 2)) / 3, y = (pos.getY(a) + pos.getY(a + 1) + pos.getY(a + 2)) / 3;
      if (low(x, y)) { which[t] = 1; lower++; }
    }
    if (!lower || lower === n) return;
    const half = (want, shift) => {
      const made = new THREE.BufferGeometry(), count = (want ? lower : n - lower) * 3;
      for (const key of Object.keys(g.attributes)) {
        const from = g.attributes[key], size = from.itemSize, data = new Float32Array(count * size);
        let w = 0;
        for (let t = 0; t < n; t++) {
          if (which[t] !== want) continue;
          for (let v = t * 3; v < t * 3 + 3; v++) for (let c = 0; c < size; c++) data[w++] = from.getComponent(v, c) - (key === 'position' ? shift[c] : 0);
        }
        made.setAttribute(key, new THREE.BufferAttribute(data, size));
      }
      return made;
    };
    out[i] = { ...p, geometry: half(0, [0, 0, 0]) };
    out.push({ geometry: half(1, [kx, ky, kz]), pivot: [px + kx, py + ky, pz + kz], swing: [0, 0, 0], phase: p.phase, glow: false, map: p.map, normalMap: p.normalMap, gain: p.gain, role: 'shin', parent: i, hinge: K.cut === 'y' ? 'x' : 'z', flex: K.flex });
  });
  if (K.elbow) {
    const shoulders = new Map();   // a shoulder (where it is, as text) -> { arm: the index of its upper half, at: its elbow, from that shoulder }
    parts.forEach((p, i) => {
      const [px, py, pz] = p.pivot;
      if (p.glow || p.role || Math.abs(px) < 0.02 || py <= K.legBelow) return;
      const g = p.geometry.index ? p.geometry.toNonIndexed() : p.geometry, pos = g.attributes.position, done = shoulders.get(p.pivot.join());
      if (done) {   // (what is in that hand: all of it goes with the forearm)
        const held = g.clone().translate(-done.at[0], -done.at[1], -done.at[2]);
        out[i] = { ...p, geometry: held, pivot: [px + done.at[0], py + done.at[1], pz + done.at[2]], swing: [0, 0, 0], role: 'forearm', parent: done.arm, held: true };
        return;
      }
      // Which way it runs (to the point of it furthest from the shoulder), how long it is, and the middle of it where it is cut.
      let far = 0, ax = 0, ay = 0, az = 0;
      for (let v = 0; v < pos.count; v++) { const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v), d = x * x + y * y + z * z; if (d > far) { far = d; ax = x; ay = y; az = z; } }
      const length = Math.sqrt(far), cut = length * K.elbow;
      if (length < 0.15) return;
      ax /= length; ay /= length; az /= length;
      let kx = 0, ky = 0, kz = 0, near = 0;
      for (let v = 0; v < pos.count; v++) {
        const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
        if (Math.abs(x * ax + y * ay + z * az - cut) < 0.07 * length) { kx += x; ky += y; kz += z; near++; }
      }
      if (!near) return;
      kx /= near; ky /= near; kz /= near;
      const halves = split(g, (x, y, z) => x * ax + y * ay + z * az > cut, [kx, ky, kz]);
      if (!halves) return;
      out[i] = { ...p, geometry: halves[0], elbow: true };
      shoulders.set(p.pivot.join(), { arm: i, at: [kx, ky, kz] });
      out.push({ geometry: halves[1], pivot: [px + kx, py + ky, pz + kz], swing: [0, 0, 0], phase: p.phase, glow: false, map: p.map, normalMap: p.normalMap, gain: p.gain, role: 'forearm', parent: i });
    });
  }
  return out;
}

// A shape (its triangles each with corners of their own) in two: [those whose middle is not `below`, those whose
// middle is, measured from `shift`]. null if it all falls one side.
function split(g, below, shift) {
  const pos = g.attributes.position, n = pos.count / 3, which = new Uint8Array(n);
  let lower = 0;
  for (let t = 0; t < n; t++) {
    const a = t * 3;
    if (below((pos.getX(a) + pos.getX(a + 1) + pos.getX(a + 2)) / 3, (pos.getY(a) + pos.getY(a + 1) + pos.getY(a + 2)) / 3, (pos.getZ(a) + pos.getZ(a + 1) + pos.getZ(a + 2)) / 3)) { which[t] = 1; lower++; }
  }
  if (!lower || lower === n) return null;
  return [0, 1].map((want) => {
    const made = new THREE.BufferGeometry(), count = (want ? lower : n - lower) * 3;
    for (const key of Object.keys(g.attributes)) {
      const from = g.attributes[key], size = from.itemSize, data = new Float32Array(count * size);
      let w = 0;
      for (let t = 0; t < n; t++) {
        if (which[t] !== want) continue;
        for (let v = t * 3; v < t * 3 + 3; v++) for (let c = 0; c < size; c++) data[w++] = from.getComponent(v, c) - (want && key === 'position' ? shift[c] : 0);
      }
      made.setAttribute(key, new THREE.BufferAttribute(data, size));
    }
    return made;
  });
}
