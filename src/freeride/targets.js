// Free Ride's targets: dead astronauts on the Moon's day side, aliens on its
// night side. They can't hurt you. They are there to be sniped, for points on
// your line, and everyone in a session sees and shoots the same ones.
//
// Nobody simulates them. Each target is on a fixed route, and where it is at
// any moment is worked out from the session's clock, so every browser gets the
// same answer. Only three things ever need saying to the others:
//   startled   something made it react (a player came close, a shot went by)
//   shot       a guest asks the host: I hit this one. The host says who got it:
//   down       it's dead, until the clock reads `until`
// plus a `sync` from the host every couple of seconds, for anyone who missed something.
//
//   hopper     a dead astronaut bounding round the rim of a crater. Startled: bigger leaps, faster.
//   burrower   a dead astronaut that keeps climbing out of a crater and sinking back. Startled, or with anyone near: it ducks.
//   drifter    an alien floating round a loop over the night side. Startled: it climbs, speeds up and weaves.
//   golden     a rare one that crosses the whole arena, there for 25 seconds in every 90. Startled: it bolts.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MOON, CRATERS, daylight, moonHeight } from '../world/moon.js';

const KINDS = {
  //         speed   near: startles within   respawn   m, D: when startled, time runs m times faster for it for D seconds   points
  hopper:   { speed: 4,  near: 14, respawn: 18, m: 2,   D: 3, points: 300 },
  burrower: { speed: 0,  near: 24, respawn: 22, m: 1,   D: 4, points: 400 },
  drifter:  { speed: 6,  near: 18, respawn: 20, m: 2.5, D: 4, points: 450 },
  golden:   { speed: 16, near: 45, respawn: 0,  m: 2.2, D: 5, points: 2500 },
};
const GOLD_EVERY = 90, GOLD_FOR = 25;
// Where a shot counts, measured up the body from its feet: [height of the middle, radius] of the body and of the head.
const HIT = { astronaut: { body: [1.3, 0.85], head: [2.6, 0.55] }, alien: { body: [1.1, 0.7], head: [2.35, 0.7] } };

// Weld a model built from many small pieces into one mesh per material. Twenty-two targets of a dozen pieces
// each is a lot of separate things to draw every frame; welded, each is three or four.
function weld(model) {
  const byMaterial = new Map(), out = new THREE.Group();
  model.updateMatrixWorld(true);
  model.traverse((piece) => {
    if (!piece.isMesh) return;
    if (!byMaterial.has(piece.material)) byMaterial.set(piece.material, []);
    byMaterial.get(piece.material).push(piece.geometry.clone().applyMatrix4(piece.matrixWorld));
  });
  for (const [material, pieces] of byMaterial) {
    const mesh = new THREE.Mesh(mergeGeometries(pieces), material);
    mesh.castShadow = true;
    out.add(mesh);
  }
  return out;
}

// ---- What they look like ------------------------------------------------------------
export function astronaut() {
  const g = new THREE.Group(), suit = new THREE.MeshStandardMaterial({ color: 0xd9d9de, roughness: 0.8 }), grey = new THREE.MeshStandardMaterial({ color: 0x77787e, roughness: 0.8 });
  const add = (geometry, material, x, y, z) => { const m = new THREE.Mesh(geometry, material); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  add(new THREE.CapsuleGeometry(0.5, 0.75, 4, 10), suit, 0, 1.35, 0);                                   // body
  add(new THREE.BoxGeometry(0.75, 0.95, 0.4), grey, 0, 1.5, -0.45);                                     // life support, long dead
  add(new THREE.SphereGeometry(0.52, 14, 10), suit, 0, 2.6, 0);                                         // helmet
  add(new THREE.SphereGeometry(0.4, 12, 8, 0, Math.PI * 2, 0.35, 1.3).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1a1206, roughness: 0.15, emissive: 0x2a1c04 }), 0, 2.6, 0.18);   // visor
  add(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ color: 0xd8d2bf }), 0, 2.62, 0.3);   // and what's left behind it
  for (const s of [-1, 1]) {
    add(new THREE.CapsuleGeometry(0.17, 0.75, 3, 8), suit, s * 0.68, 1.5, 0.12).rotation.set(-0.5, 0, s * 0.35);   // arms, reaching
    add(new THREE.CapsuleGeometry(0.2, 0.6, 3, 8), suit, s * 0.26, 0.45, 0);                                       // legs
    add(new THREE.BoxGeometry(0.3, 0.16, 0.5), grey, s * 0.26, 0.08, 0.08);                                        // boots
  }
  add(new THREE.SphereGeometry(0.06, 6, 5), new THREE.MeshBasicMaterial({ color: 0xff4a3a }), 0.25, 1.9, -0.66);  // a light that's still on
  return g;
}
function alien(skin, glow, floating) {
  const g = new THREE.Group(), body = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.5, emissive: glow, emissiveIntensity: 0.9 }), black = new THREE.MeshBasicMaterial({ color: 0x050508 });
  const add = (geometry, material, x, y, z) => { const m = new THREE.Mesh(geometry, material); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  add(new THREE.CapsuleGeometry(0.3, 0.9, 4, 8), body, 0, 1.1, 0);                                      // a thin body
  add(new THREE.SphereGeometry(0.62, 14, 12).scale(1, 1.2, 1), body, 0, 2.35, 0.04);                    // a huge head
  for (const s of [-1, 1]) {
    add(new THREE.SphereGeometry(0.2, 10, 8).scale(1, 1.5, 0.5), black, s * 0.26, 2.3, 0.52).rotation.z = s * -0.5;   // eyes
    add(new THREE.CapsuleGeometry(0.07, 1.1, 3, 6), body, s * 0.42, 1.15, 0.05).rotation.z = s * 0.25;                // long arms
    add(new THREE.CapsuleGeometry(0.09, 0.6, 3, 6), body, s * 0.15, 0.35, 0);                                         // legs
  }
  if (floating) add(new THREE.CylinderGeometry(0.9, 0.5, 0.14, 16), new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.75 }), 0, -0.15, 0);   // the disc it rides
  return g;
}

// ---- Who they are, and where they go ----------------------------------------------------
let roll = 0;
const dice = () => { const v = Math.sin(++roll * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };   // their own dice: the same every time
function makeList() {
  const list = [], day = (c) => daylight(MOON.x + c.x, MOON.z + c.z);
  const sunny = CRATERS.slice(1).filter((c) => day(c) > 0.55).sort((a, b) => b.r - a.r), dark = CRATERS.slice(1).filter((c) => day(c) < 0.4);
  const make = (kind, extra) => list.push({ kind, ...KINDS[kind], ...extra, phase: dice() * 10, turn: dice() < 0.5 ? -1 : 1, until: 0, shift: 0, sT: -1e9 });
  for (const c of [CRATERS[0], ...sunny.slice(0, 7)]) make('hopper', { cx: MOON.x + c.x, cz: MOON.z + c.z, rx: c.r * 1.06, rz: c.r * 1.06 });   // round the rims
  for (const c of sunny.slice(7, 13)) make('burrower', { cx: MOON.x + c.x, cz: MOON.z + c.z, rx: 0, rz: 0 });                                     // in the hollows
  for (const c of dark.slice(0, 7)) make('drifter', { cx: MOON.x + c.x, cz: MOON.z + c.z, rx: c.r + 14 + dice() * 20, rz: c.r + 22 + dice() * 26, alt: 8 + dice() * 7 });
  make('golden', { cx: MOON.x, cz: MOON.z, rx: 175, rz: 150, alt: 15 });
  return list;
}

const o = new THREE.Vector3(), tmp = new THREE.Vector3();
// How far along a ray (origin, unit direction) it meets a sphere (-1: it doesn't).
function raySphere(origin, dir, centre, radius) {
  o.subVectors(centre, origin);
  const along = o.dot(dir), off2 = o.lengthSq() - along * along;
  if (along < 0 || off2 > radius * radius) return -1;
  return along - Math.sqrt(radius * radius - off2);
}

// ride: the session (freeride/ride.js). onKill({ kind, head, dist, points, shot }): one of yours has been confirmed.
// burst(at, velocity, count): throw sparks (the weapon's).
export function createTargets({ scene, ride, onKill, burst }) {
  const group = new THREE.Group(), list = makeList(), pending = new Map();
  group.visible = false;
  scene.add(group);
  list.forEach((T, i) => {
    T.i = i;
    T.pos = new THREE.Vector3(); T.body = new THREE.Vector3(); T.head = new THREE.Vector3();
    T.hit = HIT[T.kind === 'hopper' || T.kind === 'burrower' ? 'astronaut' : 'alien'];
    T.model = weld(T.kind === 'hopper' || T.kind === 'burrower' ? astronaut() : T.kind === 'golden' ? alien(0xd9b24a, 0xa87a10, true) : alien(0x7fae8a, 0x1f6a3a, true));
    T.model.scale.setScalar(T.kind === 'golden' ? 1.5 : 1.25);
    T.size = T.model.scale.x;
    group.add(T.model);
  });
  let sinceCheck = 0, sinceSync = 0, on = false;

  const alive = (T, t) => t >= T.until && (T.kind !== 'golden' || t % GOLD_EVERY < GOLD_FOR);
  const startledFor = (T, t) => t - T.sT;   // seconds since it was last startled
  // Its own time: the clock, run faster while it's startled.
  const itsTime = (T, t) => t + T.shift + (T.m - 1) * Math.max(0, Math.min(T.D, t - T.sT));
  function startle(T, at) {
    if (at - T.sT < T.D) return false;                 // already startled
    if (T.sT > -1e8) T.shift += (T.m - 1) * T.D;       // (the last fright ran its course: keep what it added)
    T.sT = at;
    return true;
  }
  // Something frightened it: react here at once, and tell the others.
  function frighten(T) {
    const at = ride.clock();
    if (!startle(T, at)) return;
    if (ride.active) (ride.hosting ? ride.toAll : ride.toHost)({ k: 'st', i: T.i, at });
  }

  // Put a target where it is at time t.
  function place(T, t, dt) {
    const up = alive(T, t), tau = itsTime(T, t), scared = startledFor(T, t) < T.D ? 1 : 0;
    let x = T.cx, z = T.cz, y = 0, lift = 0, show = up;
    if (T.kind === 'burrower') {
      const out = (t + T.phase) % 7 < 4 && !scared;       // up for four seconds in seven, unless it's keeping its head down
      T.rise = THREE.MathUtils.lerp(T.rise ?? 0, out ? 1 : 0, 1 - Math.exp(-6 * dt));
      y = moonHeight(x, z) - (1 - T.rise) * 3.4 * T.size;
      show = up && T.rise > 0.05;
      T.model.rotation.y = t * 0.6 + T.phase;
    } else {
      const a = T.phase + T.turn * (T.speed / Math.max(T.rx, T.rz)) * tau;
      x += Math.cos(a) * T.rx; z += Math.sin(a) * T.rz;
      if (T.kind === 'hopper') lift = Math.sin(Math.PI * ((tau / 1.5) % 1)) * 2.6 * (1 + 0.9 * scared);            // bounding
      else {
        lift = T.alt + Math.sin(t * 1.3 + T.phase) * 1.2 + scared * 5 * Math.sin(Math.PI * Math.min(1, startledFor(T, t) / T.D));   // floating; up and away when startled
        if (scared) { const w = Math.sin(t * 9 + T.phase) * 3; x += -Math.sin(a) * w; z += Math.cos(a) * w; }          // ...weaving
      }
      y = moonHeight(x, z) + lift;
      T.model.rotation.y = Math.atan2(-Math.sin(a) * T.rx * T.turn, Math.cos(a) * T.rz * T.turn);                   // facing the way it's going
    }
    T.pos.set(x, y, z);
    T.model.position.copy(T.pos);
    T.model.visible = show;
    T.up = show && (T.kind !== 'burrower' || T.rise > 0.5);   // can it be shot?
    T.body.set(x, y + T.hit.body[0] * T.size, z);
    T.head.set(x, y + T.hit.head[0] * T.size, z);
  }

  // It's been shot. by: whose it was.
  function down(T, by, until) {
    T.until = until;
    burst(T.body, tmp.set(0, 60, 0), 26);
    burst(T.head, tmp.set(0, 90, 0), 16);
    const mine = pending.get(T.i);
    pending.delete(T.i);
    if (by === ride.myId && mine) onKill({ kind: T.kind, points: T.points, ...mine });
  }
  function kill(T, by) {   // (host, or alone) it's dead: decide until when, and say so
    const t = ride.clock(), until = T.kind === 'golden' ? Math.ceil((t + 1) / GOLD_EVERY) * GOLD_EVERY : t + T.respawn;
    if (ride.active) ride.toAll({ k: 'down', i: T.i, by, until });
    down(T, by, until);
  }

  return {
    list,
    setVisible(visible) { on = group.visible = visible; },
    reset() { for (const T of list) { T.until = 0; T.shift = 0; T.sT = -1e9; T.rise = 0; } pending.clear(); },

    // Every frame. playerPos: where this player is (coming close startles them).
    update(dt, playerPos) {
      if (!on) return;
      const t = ride.clock();
      for (const T of list) place(T, t, dt);
      if ((sinceCheck += dt) > 0.25) {
        sinceCheck = 0;
        for (const T of list) if (T.model.visible && T.pos.distanceTo(playerPos) < T.near) frighten(T);
      }
      if (ride.hosting && (sinceSync += dt) > 2) {
        sinceSync = 0;
        ride.toAll({ k: 'sync', s: list.map((T) => [T.until, T.shift, T.sT]) });
      }
    },

    // A sniper shot: from `origin` along `dir` (unit), as far as `reach`. Returns what it hit ({ kind, head, dist }) or null.
    // `shot` is whatever main.js wants back with the kill (what you were doing when you fired).
    // A shot that passes close to one without hitting it frightens it.
    shoot(origin, dir, reach, shot) {
      let best = null;
      for (const T of list) {
        if (!T.up) continue;
        const head = raySphere(origin, dir, T.head, T.hit.head[1] * T.size), body = raySphere(origin, dir, T.body, T.hit.body[1] * T.size);
        const at = head >= 0 && (body < 0 || head <= body + 0.6) ? head : body;   // (a shot through the head counts as the head, even if it clips a shoulder first)
        if (at >= 0 && at <= reach && (!best || at < best.dist)) best = { T, head: at === head, dist: at };
      }
      for (const T of list) {
        if (!T.up || (best && best.T === T)) continue;
        const along = o.subVectors(T.body, origin).dot(dir);
        if (along > 0 && along < reach && o.lengthSq() - along * along < 36) frighten(T);   // within 6 m of the line of fire
      }
      if (!best) return null;
      pending.set(best.T.i, { head: best.head, dist: best.dist, shot });
      if (ride.active && !ride.hosting) ride.toHost({ k: 'shot', i: best.T.i });
      else kill(best.T, ride.myId);
      return { kind: best.T.kind, head: best.head, dist: best.dist };
    },

    // Something about the targets has arrived from another player (from: who sent it).
    onGame(from, m) {
      const T = list[m.i], t = ride.clock();
      if (m.k === 'st' && T && Number.isFinite(m.at)) {
        if (startle(T, m.at) && ride.hosting) ride.toAll({ k: 'st', i: T.i, at: m.at });   // (the host passes it on)
      } else if (m.k === 'shot' && T && ride.hosting) {
        if (alive(T, t)) kill(T, from);   // first one to the host gets it
      } else if (m.k === 'down' && T && !ride.hosting && Number.isFinite(m.until)) down(T, m.by, m.until);
      else if (m.k === 'sync' && !ride.hosting && Array.isArray(m.s)) {
        m.s.forEach((s, i) => { const L = list[i]; if (L && Array.isArray(s)) { L.until = Number(s[0]) || 0; L.shift = Number(s[1]) || 0; L.sT = Number.isFinite(s[2]) ? s[2] : -1e9; } });
      }
    },
  };
}
