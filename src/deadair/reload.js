// Reloading, in DEAD AIR: what each gun does, and the parts of it that move.
//
// The guns are the game's own (public/models/guns.glb, one mesh per finish: no part of them comes apart). So the parts
// a reload moves are cut out of the model here, by where they are: the pistol's magazine (its base plate: the rest of
// it is inside the grip, and is made here, to slide out with it) and its slide; the rifle's magazine; the shotgun's
// pump. Each becomes a mesh of its own in the gun (rigGun), and the reload (Reload) says, frame by frame, where each
// is (pose): the magazine out, falling (it is thrown into the world: Drops), a full one in, the slide back. The
// revolver is not cut: it tips up, the cases fall out of it, and a speedloader goes in.
//
// The sounds are recordings (CC0: public/sounds/deadair/CREDITS.txt), one for each thing that happens.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { realGuns } from '../player/gunModels.js';

// kind: mag (out, in, and the slide racked if it was empty), shells (one at a time; firing stops it), wheel.
// time: seconds for an empty one (from a magazine with rounds still in it: `tactical` of that, and one stays in the
// chamber). at: when, as a share of it, each thing happens. sounds: the recordings for them.
export const RELOADS = {
  pistol: { kind: 'mag', time: 1.45, tactical: 0.78, at: { out: 0.2, in: 0.56, rack: 0.76 }, sounds: { out: 'pistol_out', in: 'pistol_in', rack: 'pistol_rack' } },
  machineGun: { kind: 'mag', time: 2.3, tactical: 0.8, at: { out: 0.18, in: 0.6, rack: 0.8 }, sounds: { out: 'rifle_out', in: 'rifle_in', rack: 'rifle_bolt' } },
  sniper: { kind: 'mag', time: 2.9, tactical: 0.82, at: { out: 0.2, in: 0.58, rack: 0.8 }, sounds: { out: 'rifle_out', in: 'rifle_in', rack: 'rifle_bolt' } },
  shotgun: { kind: 'shells', lift: 0.32, per: 0.5, lower: 0.3, rack: 0.42, sounds: { first: 'shell_first', shell: 'shell', rack: 'shotgun_rack' } },
  revolver: { kind: 'wheel', time: 2.4, at: { dump: 0.2, load: 0.6, close: 0.8 }, sounds: { load: 'round', close: 'clip2', open: 'clip1' } },
};
// Where each gun's moving parts are (in the gun's own space: its barrel along +z), and which finish they are in.
//   mag: the magazine; seat: where its bottom sits, and axis: the way it comes out (down the grip, or the well)
const CUTS = {
  pistol: { mag: { finish: 'Steel', where: (c) => c.y < -0.085 }, slide: { finish: 'Metal', where: (c) => c.y > 0.004 }, seat: [0, -0.105, -0.032], axis: [0, -0.983, -0.181], inside: [0.021, 0.098, 0.031] },
  machineGun: { mag: { finish: 'Steel', where: (c) => c.y < -0.03 && c.z > 0.03 && c.z < 0.26 }, seat: [0, -0.04, 0.14], axis: [0, -0.97, 0.24] },
  shotgun: { pump: { finish: 'Wood', where: (c) => c.z > 0.28 }, port: [0, -0.028, 0.045] },
  revolver: { breech: [0, 0.026, 0.012] },
};
const brassMat = new THREE.MeshStandardMaterial({ color: 0xc8a046, metalness: 0.85, roughness: 0.28 });
const copperMat = new THREE.MeshStandardMaterial({ color: 0xb4643a, metalness: 0.8, roughness: 0.32 });
const hullMat = new THREE.MeshStandardMaterial({ color: 0x8e1712, roughness: 0.55 });
const darkMat = new THREE.MeshStandardMaterial({ color: 0x161719, roughness: 0.6, metalness: 0.3 });

// ---- Cutting the parts out ------------------------------------------------------------------------------------------
let finishes = null;   // geometry (as guns.glb has it) -> its finish ('Metal', 'Steel', ...)
export async function readyGuns() {
  const scene = await realGuns();
  if (!finishes) {
    finishes = new Map();
    scene?.traverse((o) => { const is = o.isMesh && o.name.match(/^[a-zA-Z]+_(Metal|Steel|Polymer|Wood|BoneDark|Bone|Brass|Glass|Light)/); if (is) finishes.set(o.geometry, is[1]); });
  }
  return !!scene;
}

// The triangles of a geometry that `where` says are the part's (by their middles), and the rest: [rest, part].
function split(geometry, where) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const pos = g.attributes.position, n = pos.count / 3, c = new THREE.Vector3(), keep = [], take = [];
  for (let t = 0; t < n; t++) {
    c.set(0, 0, 0);
    for (let k = 0; k < 3; k++) c.x += pos.getX(t * 3 + k) / 3, c.y += pos.getY(t * 3 + k) / 3, c.z += pos.getZ(t * 3 + k) / 3;
    (where(c) ? take : keep).push(t);
  }
  const pick = (list) => {
    const out = new THREE.BufferGeometry();
    for (const [name, a] of Object.entries(g.attributes)) {
      const arr = new a.array.constructor(list.length * 3 * a.itemSize);
      list.forEach((t, i) => arr.set(a.array.subarray(t * 3 * a.itemSize, (t + 1) * 3 * a.itemSize), i * 3 * a.itemSize));
      out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize, a.normalized));
    }
    return out;
  };
  return take.length ? [pick(keep), pick(take)] : [geometry, null];
}

// Give a gun (one of Kirky's: its group, as gunModels.js made it) its moving parts. Done once a gun; a copy of the
// group made afterwards (the first-person one) has them too: find them with rigOf.
export function rigGun(group, id) {
  const C = CUTS[id];
  if (!C || group.userData.rigged || !finishes) return;
  group.userData.rigged = true;
  const part = (name) => { const g = new THREE.Group(); g.name = name; group.add(g); return g; };
  for (const key of ['mag', 'slide', 'pump']) {
    const cut = C[key];
    if (!cut) continue;
    const into = part(`rig-${key}`);
    for (const mesh of [...group.children]) {
      if (!mesh.isMesh || finishes.get(mesh.userData.source || mesh.geometry) !== cut.finish) continue;
      const [rest, taken] = split(mesh.geometry, cut.where);
      if (!taken) continue;
      mesh.userData.source ||= mesh.geometry;   // (the geometry as it came: its finish is known by it)
      mesh.geometry = rest;
      const m = new THREE.Mesh(taken, mesh.material);
      m.castShadow = true;
      into.add(m);
    }
  }
  const seat = C.seat && new THREE.Vector3(...C.seat), axis = C.axis && new THREE.Vector3(...C.axis).normalize();
  const mag = group.getObjectByName('rig-mag');
  if (mag && C.inside) {
    // (the pistol's magazine, up inside the grip: its body, the holes down its back, the round on the top)
    const [w, h, d] = C.inside, up = axis.clone().negate();
    const body = new THREE.Mesh(magazineBody(w, h, d), mag.children[0]?.material || darkMat);
    body.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
    body.position.copy(seat).addScaledVector(up, h / 2 + 0.004);
    const round = cartridge(0.0045, 0.022);
    round.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, -axis.z, 1).normalize());
    round.position.copy(seat).addScaledVector(up, h + 0.009).add(new THREE.Vector3(0, 0, 0.004));
    mag.add(body, round);
  }
  if (mag) {
    // (the full one that goes in: the same magazine again)
    const fresh = mag.clone(true);
    fresh.name = 'rig-fresh';
    fresh.visible = false;
    group.add(fresh);
  }
  if (id === 'shotgun') {
    const shell = shotgunShell();
    shell.name = 'rig-shell';
    shell.visible = false;
    group.add(shell);
  }
  if (id === 'revolver') {
    const loader = speedloader();
    loader.name = 'rig-loader';
    loader.visible = false;
    group.add(loader);
  }
  group.userData.rig = { seat, axis, port: C.port && new THREE.Vector3(...C.port), breech: C.breech && new THREE.Vector3(...C.breech) };
}
// The moving parts of a rigged gun (or of a copy of one).
export function rigOf(group) {
  if (!group?.userData.rig) return null;
  const find = (n) => group.getObjectByName(n) || null;
  return { ...group.userData.rig, mag: find('rig-mag'), fresh: find('rig-fresh'), slide: find('rig-slide'), pump: find('rig-pump'), shell: find('rig-shell'), loader: find('rig-loader') };
}

// ---- The reload, step by step ---------------------------------------------------------------------------------------
// pose(): where the parts are now, for walker.js to put them there, on his gun and on the one in front of you.
//   lift: 0..1, how far the gun is brought up and turned to get at it   mag, fresh: how far out along the axis (null: not there)
//   slide, pump: how far back   shell: 0..1 along its way in (null: none)   loader: likewise   hand: where his other hand goes (gun space)
export class Reload {
  constructor(id, slot, cap, mods) {
    const R = RELOADS[id] || RELOADS.pistol;
    this.id = id; this.R = R; this.kind = R.kind; this.slot = slot; this.cap = cap;
    this.t = 0; this.done = false; this.stopping = false; this.fired = new Set();
    this.empty = slot.mag === 0;
    this.chamber = this.kind === 'mag' && !this.empty ? 1 : 0;   // (one stays up the spout: 30 + 1)
    const speed = mods?.reload ?? 1;
    if (this.kind === 'shells') { this.per = R.per * speed; this.lift = R.lift * speed; this.lower = R.lower * speed; this.T = Infinity; this.shells = 0; this.next = this.lift; }
    else this.T = R.time * (this.empty || this.kind === 'wheel' ? 1 : R.tactical) * speed;
  }
  get left() { return this.kind === 'shells' ? 1 : Math.max(0, this.T - this.t); }
  // The fresh magazine back in his hand: the reload goes on from the moment it came up from his belt.
  resume() { this.hold = false; if (this.kind === 'mag') this.t = this.T * (this.R.at.out + 0.1); }

  // Advance: what happened this frame goes onto `events` ({ type: 'reloadSound', name } | { type: 'magOut' } ...).
  update(dt, events, fireDown) {
    if (this.done || this.hold) return;   // (hold: the fresh magazine is out of his hands: see index.js, the skit)
    this.t += dt;
    const slot = this.slot, R = this.R;
    const once = (key, fn) => { if (!this.fired.has(key)) { this.fired.add(key); fn(); } };
    if (this.kind === 'mag') {
      const k = this.t / this.T, A = R.at;
      if (k >= A.out) once('out', () => { slot.spare += slot.mag - this.chamber; slot.mag = this.chamber; events.push({ type: 'reloadSound', name: R.sounds.out }, { type: 'magOut' }); });
      if (k >= A.in) once('in', () => { const take = Math.min(this.cap + this.chamber - slot.mag, slot.spare); slot.mag += take; slot.spare -= take; events.push({ type: 'reloadSound', name: R.sounds.in }); });
      if (this.empty && k >= A.rack) once('rack', () => events.push({ type: 'reloadSound', name: R.sounds.rack }));
      if (k >= 1) this.done = true;
    } else if (this.kind === 'wheel') {
      const k = this.t / this.T, A = R.at;
      if (k >= 0.08) once('open', () => events.push({ type: 'reloadSound', name: R.sounds.open }));
      if (k >= A.dump) once('dump', () => { slot.spare += slot.mag; slot.mag = 0; events.push({ type: 'dump' }); });
      if (k >= A.load) once('load', () => { const take = Math.min(this.cap, slot.spare); slot.mag += take; slot.spare -= take; events.push({ type: 'reloadSound', name: R.sounds.load }); });
      if (k >= A.close) once('close', () => events.push({ type: 'reloadSound', name: R.sounds.close }));
      if (k >= 1) this.done = true;
    } else {
      // Shells: up, then one at a time until it is full (or you are out, or you fire), then down (and the pump, if it was empty).
      if (fireDown && slot.mag > 0) this.stopping = true;
      if (this.ending === undefined && this.t >= this.next) {   // (a shell is on its way in, or would be)
        if (slot.mag >= this.cap || slot.spare <= 0 || this.stopping) this.ending = this.t;   // (no more: down)
        else if (this.t >= this.next + this.per) {
          slot.mag++; slot.spare--;
          events.push({ type: 'reloadSound', name: this.shells === 0 && this.empty ? R.sounds.first : R.sounds.shell });
          this.shells++;
          this.next += this.per;
        }
      }
      if (this.ending !== undefined) {
        const e = this.t - this.ending, rack = this.empty ? R.rack : 0;
        if (rack) { if (e >= 0.05) once('rack', () => events.push({ type: 'reloadSound', name: R.sounds.rack })); }
        if (e >= rack + this.lower) this.done = true;
      }
    }
  }

  // Where everything is, now.
  pose() {
    const P = { kind: this.kind, lift: 0, mag: 0, fresh: null, slide: 0, pump: 0, shell: null, loader: null, hand: null, tip: 0 };
    const ease = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
    if (this.kind === 'mag') {
      const k = Math.min(1, this.t / this.T), A = this.R.at;
      P.lift = ease(k / 0.14) * (1 - ease((k - 0.88) / 0.12));
      // out: it slides down, and goes (it is thrown into the world as it leaves: see index.js on magOut)
      P.mag = k < A.out ? 0.035 * ease((k - A.out + 0.05) / 0.05) : null;
      // the full one: up from his belt, into the well, home with a push
      const from = A.out + 0.1;
      if (k >= from && k < A.in + 0.02) { const s = ease((k - from) / (A.in - from)); P.fresh = 0.2 * (1 - s); P.hand = 'fresh'; }
      else if (k >= A.in + 0.02) P.mag = 0;
      if (k > A.out - 0.06 && k < A.out + 0.06) P.hand = 'mag';
      if (this.hold) { P.mag = null; P.fresh = null; P.hand = null; P.lift = 1; }   // (empty-handed, the gun up, waiting on it)
      // the slide: back and let go
      if (this.empty && k >= A.rack && k < A.rack + 0.12) { const s = (k - A.rack) / 0.12; P.slide = s < 0.45 ? s / 0.45 : 1 - (s - 0.45) / 0.55; P.hand = 'slide'; }
      P.tip = this.empty && k >= A.rack && k < A.rack + 0.12 ? 1 : 0;
    } else if (this.kind === 'wheel') {
      const k = Math.min(1, this.t / this.T), A = this.R.at;
      P.lift = ease(k / 0.12) * (1 - ease((k - 0.88) / 0.12));
      P.tip = ease((k - 0.1) / 0.12) * (1 - ease((k - A.dump - 0.12) / 0.1));   // (muzzle up, for the cases to fall out)
      if (k >= A.dump + 0.05 && k < A.load + 0.03) { P.loader = ease((k - A.dump - 0.05) / (A.load - A.dump - 0.05)); P.hand = 'loader'; }
    } else {
      const t = this.t;
      if (this.ending === undefined) P.lift = ease(t / this.lift);
      else { const e = t - this.ending, rack = this.empty ? this.R.rack : 0; P.lift = 1 - ease((e - rack) / this.lower); if (rack && e < rack) { const s = e / rack; P.pump = s < 0.5 ? s / 0.5 : 1 - (s - 0.5) / 0.5; P.hand = 'pump'; } }
      if (this.ending === undefined && t >= this.next) { P.shell = Math.min(1, (t - this.next) / this.per); P.hand = 'shell'; }
    }
    return P;
  }
}

// ---- What falls ---------------------------------------------------------------------------------------------------
// A dropped magazine, the cases out of the revolver: thrown into the world where they were, falling, bouncing on the
// plates, settling, and gone after a while. land(position, kind) is called the first time each hits the floor (a sound).
export class Drops {
  constructor(scene, land) { this.scene = scene; this.land = land; this.list = []; }
  throw(object, velocity, spin, kind, life = 9) {
    object.updateMatrixWorld(true);
    const thing = object.clone(true);
    thing.visible = true;
    thing.traverse((o) => { o.visible = true; if (o.isMesh) { o.castShadow = true; o.renderOrder = 0; } });
    object.matrixWorld.decompose(thing.position, thing.quaternion, thing.scale);
    // (a part of the first-person gun is drawn small and close: out in the world it is its real size)
    if (kind === 'viewMag') { thing.scale.setScalar(1); kind = 'mag'; }
    this.scene.add(thing);
    this.list.push({ thing, v: velocity.clone(), w: spin.clone(), kind, life, age: 0, landed: false });
  }
  update(dt) {
    const q = new THREE.Quaternion(), e = new THREE.Euler();
    for (let i = this.list.length - 1; i >= 0; i--) {
      const d = this.list[i];
      d.age += dt;
      d.v.y -= 11 * dt;
      d.thing.position.addScaledVector(d.v, dt);
      d.thing.quaternion.premultiply(q.setFromEuler(e.set(d.w.x * dt, d.w.y * dt, d.w.z * dt)));
      const floor = d.kind === 'mag' ? 0.02 : 0.006;
      if (d.thing.position.y < floor) {
        d.thing.position.y = floor;
        if (!d.landed || Math.abs(d.v.y) > 1) this.land(d.thing.position, d.kind, Math.min(1, Math.abs(d.v.y) / 4));
        d.landed = true;
        d.v.y = Math.abs(d.v.y) > 0.8 ? -d.v.y * 0.32 : 0;
        d.v.x *= 0.5; d.v.z *= 0.5; d.w.multiplyScalar(0.45);
      }
      if (d.age > d.life) {
        const s = Math.max(0, 1 - (d.age - d.life) / 0.6);
        d.thing.scale.multiplyScalar(s > 0 ? Math.max(0.9, s) : 0);
        if (s <= 0) { this.scene.remove(d.thing); this.list.splice(i, 1); }
      }
    }
  }
  clear() { for (const d of this.list) this.scene.remove(d.thing); this.list.length = 0; }
}

// ---- The made parts -------------------------------------------------------------------------------------------------
// A pistol magazine's body: a rounded steel box, the holes down its back that show how full it is, a lip at the top.
function magazineBody(w, h, d) {
  const parts = [new RoundedBoxGeometry(w, h, d, 2, 0.0035)];
  for (let i = 0; i < 5; i++) parts.push(new THREE.CylinderGeometry(0.0022, 0.0022, 0.002, 8).rotateX(Math.PI / 2).translate(0, -h * 0.35 + i * h * 0.16, -d / 2 - 0.0004));
  parts.push(new RoundedBoxGeometry(w * 0.86, 0.006, d * 0.8, 1, 0.002).translate(0, h / 2 + 0.002, 0.002));
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); return g; }));
}
// One round: a brass case, a copper bullet with a rounded nose, pointing along +z.
function cartridge(r, len) {
  const g = new THREE.Group();
  const lathe = (pts, mat) => new THREE.Mesh(new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 14).rotateX(Math.PI / 2), mat);
  g.add(lathe([[0, 0], [r * 1.08, 0], [r * 1.08, len * 0.06], [r * 0.92, len * 0.1], [r, len * 0.14], [r, len * 0.62], [0.001, len * 0.62]], brassMat));
  g.add(lathe([[0.001, len * 0.6], [r * 0.9, len * 0.6], [r * 0.88, len * 0.8], [r * 0.6, len * 0.95], [0.001, len]], copperMat));
  for (const m of g.children) m.castShadow = true;
  return g;
}
// A shotgun shell: a ribbed red hull with a crimped end, on a brass head with its rim.
function shotgunShell() {
  const g = new THREE.Group(), r = 0.0093, len = 0.058;
  const lathe = (pts, mat) => new THREE.Mesh(new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 16).rotateX(Math.PI / 2), mat);
  const hull = [[0, 0.012]];
  for (let i = 0; i <= 8; i++) hull.push([r * (i % 2 ? 0.985 : 1), 0.012 + (i / 8) * (len - 0.02)]);
  hull.push([r * 0.92, len - 0.004], [r * 0.45, len], [0, len - 0.002]);
  g.add(lathe(hull, hullMat));
  g.add(lathe([[0, 0], [r * 1.13, 0], [r * 1.13, 0.0025], [r * 1.02, 0.004], [r * 1.02, 0.016], [r * 0.99, 0.017], [0, 0.017]], brassMat));
  for (const m of g.children) m.castShadow = true;
  return g;
}
// A speedloader: six rounds held in a dark ring, a knurled knob on the back.
function speedloader() {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.011, 24).rotateX(Math.PI / 2), darkMat);
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.009, 0.012, 12).rotateX(Math.PI / 2).translate(0, 0, -0.011), darkMat);
  g.add(ring, knob);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2, round = cartridge(0.0042, 0.03);
    round.position.set(Math.cos(a) * 0.0125, Math.sin(a) * 0.0125, 0.002);
    g.add(round);
  }
  return g;
}
// One spent case, for the revolver to drop.
export function spentCase() { const g = cartridge(0.0042, 0.03); g.remove(g.children[1]); return g; }
