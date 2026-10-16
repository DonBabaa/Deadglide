// The dead of Shackleton Station: the game's own zombies (the three bodies of ZOMBIES, cut into parts and moved by
// motion capture exactly as the horde's are), but on foot in the dark, and moved by clips the story never uses:
//   walker    zwalk      the slow ones, early on
//   runner    zrun       later, more and more of them
//   sprinter  sprint     later still
//   crawler   crawlrun   down on its hands, low, quick, easy to miss in the dark
// and, whatever kind it is: zstand (up off the floor, where it was lying), zbite (down on its knees, feeding, until
// something disturbs it), zscream (when it has seen you), zattack (on you), zdeath.
//
//   const dead = new Dead(scene, station);
//   dead.spawn('walker', x, z, yaw, 'rise' | 'feed' | 'walk', hp)
//   dead.update(dt, players, events)      players: [{ pos, eye, alive }]; what happens is pushed onto events
//   dead.hit(from, dir, far)              the nearest zombie a ray hits: { z, t, part: 'head' | 'body' | 'legs', point }
//   dead.hurt(z, damage, part, dir)       -> true if that killed it
import * as THREE from 'three';
import { ENEMY_PARTS, ENEMY_LITE } from '../enemies/enemyModels.js';
import { ENEMY_TYPES, ZOMBIES } from '../enemies/types.js';
import { withKnees, legLine } from '../enemies/knees.js';
import { pose, place, aimOf, clipLength } from '../enemies/mobAnims.js';
import { paintedMaterial } from '../enemies/realMobs.js';

// gait: the clip it moves by; pace: the speed (m/s) at which that clip's feet keep to the floor; speed: how fast it goes.
export const KINDS = {
  walker: { gait: 'zwalk', pace: 1.05, speed: 1.3, turn: 3.5 },
  runner: { gait: 'zrun', pace: 3.4, speed: 3.5, turn: 6 },
  sprinter: { gait: 'zrun', pace: 3.4, speed: 3.85, turn: 7 },   // (the fastest of them, and still a touch slower than you walk: 4 m/s)
  crawler: { gait: 'crawlrun', pace: 2.2, speed: 2.1, turn: 5, low: true },
  // The Warden (every fifth round): Hamzitus's body, half again as big as a man, slow, and his fists like hammers.
  // clips: his own (a walk, a roar, both fists going round and round, a fall). reach, radius, claw, swing: his own measure.
  warden: { gait: 'mwalk', pace: 1.1, speed: 1.7, turn: 2.2, body: 'boss', scale: 1.45, reach: 2.0, radius: 0.8, claw: 55, swing: 1.9,
    clips: { scream: 'mroar', attack: 'hamz', death: 'mdie' } },
  // The screamer (from round 4): the gaunt body, yellow, slow; it sees you and it calls, and everything that hears it comes.
  screamer: { gait: 'zwalk', pace: 1.05, speed: 1.1, turn: 3.5, call: true, every: 14 },
  // (the stalker: Priya. Silent. Moves only while nobody is looking at it; under your eyes it stands where it stopped, mid-stride)
  stalker: { gait: 'zwalk', pace: 1.05, speed: 2.6, turn: 6, stalk: true, quiet: true },
};
const CLIPS = { scream: 'zscream', attack: 'zattack', death: 'zdeath' };
const clipOf = (z, what) => z.K.clips?.[what] || CLIPS[what];
const SPEED_CAP = 3.9;   // m/s: never as fast as you walk (4)
export const DEAD = {
  reach: 1.05,         // how close (from its middle to yours) before it can get its hands on you
  claw: 25,            // what a hit does to you (you have 100)
  atDoor: 5,           // how many wait at the lounge's airlock while all of you are inside (the rest stand off)
  swing: 1.15,         // seconds between swings while it is on you
  lands: 0.5,          // how far into a swing it lands
  radius: 0.34,
  rise: 1.55,          // zstand is played this many times as fast as it was caught
  lie: 7,              // seconds a body stays down before it sinks away
  wake: 6.5,           // a feeder looks up from its meal if you come this near where it can see you...
  hear: 15,            // ...or fire a gun this near it
};
const MOST = 24;   // of each body at once
const NEAR = 16, FINE = 12;   // within this many metres of the camera they are drawn in full detail (at most this many of each body); the rest, plainer. (Six and ten metres left the ones in the cut-ins plain; nobody wants that.)
// (for the network: a zombie's kind and what it is doing, as numbers)
const KIND_LIST = Object.keys(KINDS), STATES = ['rise', 'feed', 'scream', 'chase', 'attack', 'dead', 'stand', 'drop', 'grab', 'show', 'vault', 'climb', 'hang', 'duct', 'skit'];
// Over a crate in its way (Kirky's vault, slower: a moment it is easy to shoot), and up onto one after you (the start of
// a wall climb, slowly): seconds each takes, the part of the clip played, how far past (or onto) it it ends up.
const VAULT = { time: 1.15, clip: [0.32, 1.55], past: 0.5, tuck: 0.25, every: 1.5 };
const CLIMB = { time: 1.7, clip: [0.15, 1.05], onto: 0.45 };
const HIGH = 0.6;   // (higher than that above it, or below it, you are out of its reach: it has to climb)
const CLIMBERS = (z) => z.kind !== 'warden' && !z.K.low;
// The grab: on you, now and then, one of them gets hold of you instead of swinging. You cannot move or shoot; it has
// your face. Mash F (each press is a shove) to throw it off, or a friend shoots it off you; else, in bite seconds, it
// bites, and lets go. chance: of a landing swing becoming a grab; every: seconds before anyone can be grabbed again.
export const GRAB = { chance: 0.3, every: 14, bite: 3.6, damage: 45, shove: 0.25, slip: 0.06, hold: 0.82, lunge: 0.85, kinds: ['walker', 'runner', 'sprinter', 'warden'] };
// The Warden's hand: he does not claw, he takes you by the throat and lifts you off the floor. Further off (he is big),
// slower to shake, harder when it ends.
export const LIFT = { hold: 1.4, chance: 0.75, bite: 4.4, damage: 70, shove: 0.16 };
const holdOf = (z) => (z.kind === 'warden' ? LIFT.hold : GRAB.hold);
// Holding you, it lunges at your face again and again (every GRAB.lunge seconds): 0..1, how far into a lunge it is at t.
export const lungeOf = (t) => { const ph = t % GRAB.lunge; return ph < 0.3 ? ph / 0.3 : Math.max(0, 1 - (ph - 0.3) / 0.25); };
const WHITE = new THREE.Color(1, 1, 1), HURT = new THREE.Color(1.8, 0.45, 0.4);
const m = new THREE.Matrix4(), out = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
const v = new THREE.Vector3(), w = new THREE.Vector3(), next = new THREE.Vector3(), tint = new THREE.Color(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// The colours they come in: pale, gone green, bloodied, grey, jaundiced (each one is one of these, on its body's own colours).
const TINTS = [new THREE.Color(0.96, 0.93, 0.9), new THREE.Color(0.72, 0.86, 0.68), new THREE.Color(0.78, 0.46, 0.42), new THREE.Color(0.55, 0.56, 0.62), new THREE.Color(0.92, 0.84, 0.58), new THREE.Color(1, 1, 1)];
const FLINCH = new THREE.Matrix4(), FLINCH2 = new THREE.Matrix4(), FLINCH3 = new THREE.Matrix4();

export class Dead {
  constructor(scene, station) {
    this.scene = scene;
    this.station = station;
    this.list = [];
    this.flows = new Map();   // target cell -> flow field (dropped whenever a door opens)
    this.time = 0;
    // In a party, the host's browser runs the dead; everyone else's draws copies of them (remote: true), moved by
    // what the host sends (snapshot / apply), and asks the host to hurt them (outbox) rather than hurting them itself.
    this.remote = false;
    this.outbox = [];
    this.nextId = 1;
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
    const glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });   // (the eyes: they catch the lamp, and they show in the dark)
    this.eye = new THREE.Vector3();   // where they are seen from (index.js keeps it at the camera)
    const set = (name, list, most) => {
      const T = ENEMY_TYPES[name];
      const parts = withKnees(name, list).map((p, index, all) => {
        const mesh = new THREE.InstancedMesh(p.geometry, p.glow ? glow : p.map ? paintedMaterial(p) : material, most);
        mesh.castShadow = !p.glow;
        mesh.frustumCulled = false;
        mesh.matrixAutoUpdate = false;
        mesh.count = 0;
        mesh.visible = false;
        mesh.setColorAt(0, WHITE);
        scene.add(mesh);
        const [px, py, pz] = p.pivot, mid = Math.abs(px) < 0.02;
        const role = p.role ? p.role : Math.hypot(px, py, pz) < 0.01 ? 'core' : mid ? (py > T.height * 0.72 ? 'head' : 'tail') : py > (legLine(name) ?? T.height * 0.6) ? 'arm' : 'leg';
        const rel = p.parent !== undefined ? new THREE.Vector3(...p.pivot).sub(new THREE.Vector3(...all[p.parent].pivot)) : null;
        return { mesh, glow: !!p.glow, elbow: !!p.elbow, held: !!p.held, pivot: new THREE.Vector3(...p.pivot), role, side: Math.sign(px) || (p.parent !== undefined ? Math.sign(all[p.parent].pivot[0]) : 0), parent: p.parent, rel, local: new THREE.Matrix4(), aim: aimOf(p.geometry, role) };
      }).map((part, index, all) => {
        if (part.role === 'arm') { const first = all.find((o) => o.role === 'arm' && o.pivot.equals(part.pivot)); if (first !== part) part.aim = first.aim; }
        if (part.held) { const fore = all.find((o) => o.role === 'forearm' && o.parent === part.parent && !o.held); if (fore) part.aim = fore.aim; }
        return part;
      });
      parts.hipY = (parts.find((o) => o.role === 'leg') || { pivot: { y: T.height * 0.5 } }).pivot.y;
      // (the middle of his head, as it was made: where a headshot is aimed at, wherever the clip has put it)
      const head = parts.find((o) => o.role === 'head' && !o.glow) || parts.find((o) => o.role === 'head');
      head.mesh.geometry.computeBoundingSphere();
      parts.head = head;
      parts.headMid = head.mesh.geometry.boundingSphere.center.clone();
      // (where each hand is, as the body was made: the far end of the forearm along the way it points. The star's mic goes there.)
      for (const part of parts) {
        if (part.role !== 'forearm' || part.held) continue;
        const g = part.mesh.geometry; if (!g.boundingBox) g.computeBoundingBox();
        // (its points are measured from its hinge, the elbow: the hand is `reach` along `aim` from there, and place()'s
        // matrix for it already puts the elbow where it goes)
        const b = g.boundingBox, c = new THREE.Vector3();
        let reach = 0;
        for (let k = 0; k < 8; k++) { c.set(k & 1 ? b.max.x : b.min.x, k & 2 ? b.max.y : b.min.y, k & 4 ? b.max.z : b.min.z); reach = Math.max(reach, c.dot(part.aim)); }
        part.handLocal = part.aim.clone().multiplyScalar(reach * 0.92);
      }
      parts.headR = Math.min(0.2, Math.max(0.13, head.mesh.geometry.boundingSphere.radius * 0.8));
      parts.n = 0;
      return parts;
    };
    // Each body twice: in full (for the near ones) and plainer (the rest). `parts` is the full one: what shots are measured against.
    // (the two that came from outside: the soldier and the gaunt one. Not the game's own shambler.)
    this.bodies = ZOMBIES.filter((name) => name !== 'shambler').map((name) => {
      const parts = set(name, ENEMY_PARTS[name](), FINE), lite = ENEMY_LITE[name] ? set(name, ENEMY_LITE[name](), MOST) : null;
      return { name, parts, lite };
    });
    // (the Warden's: one of him at a time, in full)
    this.special = { boss: { name: 'boss', parts: set('boss', ENEMY_PARTS.boss(), 2), lite: null } };
    this.looks = [];   // [{ eye, dir }]: where the living are looking (index.js sets it): for the Watcher, who moves only unseen
    this.grabCool = 0; // seconds before the next grab
    this.grabChance = GRAB.chance;   // (index.js turns it up for Nightmare)
  }

  kindOf(kind) { return KINDS[kind] || KINDS.walker; }
  get alive() { let n = 0; for (const z of this.list) if (z.hp > 0) n++; return n; }

  spawn(kind, x, zz, yaw, how = 'rise', hp = 100, opts = {}) {
    const K = KINDS[kind] || KINDS.walker;
    const body = K.body ? this.special[K.body] : this.bodies[opts.body ?? (K.call ? this.bodies.length - 1 : Math.floor(Math.random() * this.bodies.length))];
    const z = {
      id: opts.id ?? this.nextId++, kind, K, body, hp, most: hp, state: how === 'feed' ? 'feed' : how === 'drop' ? 'drop' : how === 'rise' && !K.low ? 'rise' : 'chase', t: 0,
      y: (this.station?.groundAt?.({ x, z: zz }, 0.2) ?? 0) + (how === 'drop' ? 1.45 : 0), vy: 0, flinch: 0, lastCyc: 0,
      pos: new THREE.Vector3(x, 0, zz), vel: new THREE.Vector3(), yaw, step: Math.random() * 4, phase: Math.random(),
      speed: K.speed * (0.9 + Math.random() * 0.2), scale: (K.scale || 1) * (0.94 + Math.random() * 0.12), flash: 0, slow: 0, swing: 0, groan: 1 + Math.random() * 4,
      head: new THREE.Vector3(x, 1.6, zz), hip: new THREE.Vector3(x, 0.95, zz), headless: false, target: null, sink: 0,
      tint: K.call ? new THREE.Color(0.95, 0.82, 0.3) : TINTS[Math.floor(Math.random() * TINTS.length)].clone().offsetHSL((Math.random() - 0.5) * 0.05, 0, (Math.random() - 0.5) * 0.12).multiplyScalar(0.66),   // (one of the colours they come in, and filthy: they have been down here in the dark a long time)
    };
    this.list.push(z);
    return z;
  }

  // A body on the floor that does not get up (and does not sink away): what a feeder is eating.
  // id: its own (negative: never one of the host's living), the same on every browser, so that one that gets up again
  // (a sleeper: scares.js) gets up everywhere.
  corpse(x, zz, yaw, id = -1 - this.list.length) {
    const z = this.spawn('walker', x, zz, yaw, 'walk', 0, { id });
    z.hp = 0; z.state = 'dead'; z.t = 99; z.keep = true; z.headless = Math.random() < 0.5;
    z.tint.multiplyScalar(0.8);
    return z;
  }

  // The nearest zombie a ray hits before `far`: its head (a ball), its body (a capsule from its hips to its neck) or its legs.
  // (all: the dead on the floor too, for what is only looking, not shooting)
  // (skip: ones a bullet has already been through)
  hit(from, dir, far, all = false, skip = null) {
    let best = null;
    for (const z of this.list) {
      if (z.hp <= 0 && !all) continue;
      if (skip && skip.has(z)) continue;
      // (a quick look first: is the ray anywhere near it)
      v.subVectors(z.pos, from); const along = v.dot(dir);
      if (along < -1 || along > far + 1) continue;
      if (v.addScaledVector(dir, -along).setY(0).lengthSq() > 4 * z.scale * z.scale) continue;
      const r = z.body.parts.headR * z.scale * 1.3;
      let t = sphere(from, dir, z.head, r);
      let part = 'head';
      w.copy(z.head).addScaledVector(up, -r * 0.7);
      const tb = capsule(from, dir, z.hip, w, (z.K.body ? 0.42 : 0.3) * z.scale);   // (the Warden is broad as a door)
      if (tb < t - 0.02) { t = tb; part = 'body'; }
      if (!z.K.low) {
        v.set(z.pos.x, 0.12, z.pos.z);
        const tl = capsule(from, dir, v, z.hip, 0.19 * z.scale);
        if (tl < t - 0.02) { t = tl; part = 'legs'; }
      }
      if (t < far && (!best || t < best.t)) best = { z, t, part, point: from.clone().addScaledVector(dir, t) };
    }
    return best;
  }

  // knock: how hard it is thrown back (1: a pistol round). It flinches from the hit either way.
  hurt(z, damage, part, dir, knock = 1) {
    knock = (knock || 0) * (this.knockScale || 1);   // (low gravity: they go further)
    if (z.hp <= 0) return false;
    z.flinch = 1;
    if (z.state === 'grab') z.hold = (z.hold || 0) + damage / 150;   // (shot off you, by a friend: a couple of rounds does it)
    if (dir && z.kind !== 'warden') { z.vel.x += dir.x * 2.4 * knock; z.vel.z += dir.z * 2.4 * knock; }   // (along the floor only: a round from above is not a lift)
    if (this.remote) {   // (a copy: flinch, and ask the host)
      z.flash = 0.09;
      this.outbox.push({ id: z.id, dmg: Math.round(damage * 10) / 10, part, dx: dir ? +dir.x.toFixed(2) : 0, dz: dir ? +dir.z.toFixed(2) : 0 });
      return false;
    }
    z.hp -= damage;
    z.flash = 0.09;
    z.slow = Math.max(z.slow, part === 'legs' ? 0.45 : 0.22);
    if (z.state === 'feed' || z.state === 'stand') { z.state = 'scream'; z.t = 0; }
    if (z.hp > 0) return false;
    z.state = 'dead'; z.t = 0;
    z.headless = part === 'head';
    z.fall = dir ? Math.atan2(dir.x, dir.z) : z.yaw;
    return true;
  }

  // Down it goes (the host said so).
  kill(z, part, dir) {
    if (z.state === 'dead') return;
    z.hp = 0; z.state = 'dead'; z.t = 0;
    z.headless = part === 'head';
    z.fall = dir ? Math.atan2(dir.x, dir.z) : z.yaw;
  }
  byId(id) { return this.list.find((z) => z.id === id); }

  // ---- The network: what the host sends, and what a copy does with it ----
  // The living, as small numbers: [id, body, kind, state, x, z, yaw, t, swing, flags] (x100, whole).
  snapshot() {
    const out = [];
    for (const z of this.list) {
      if (z.hp <= 0 && z.state !== 'dead') continue;
      if (z.state === 'dead') continue;
      out.push([z.id, this.bodies.indexOf(z.body), KIND_LIST.indexOf(z.kind), STATES.indexOf(z.state), Math.round(z.pos.x * 100), Math.round(z.pos.z * 100), Math.round(z.yaw * 100), Math.round(z.t * 100), Math.round(z.swing * 100), z.flash > 0 ? 1 : 0, Math.round((z.y || 0) * 100), z.state === 'grab' ? String(z.victimId) : z.state === 'show' ? `${z.role}:${Math.round(z.pos.x * 10)}:${Math.round(z.pos.z * 10)}` : '']);
    }
    return out;
  }
  // A guest: make the copies what the host says (new ones appear, gone ones go, the rest are steered toward it).
  apply(list, age = 0) {
    const seen = new Set();
    for (const [id, body, kind, state, x, zz, yaw, t, swing, flags, y, victim] of list) {
      seen.add(id);
      let z = this.byId(id);
      const S = STATES[state] || 'chase';
      if (!z) {
        z = this.spawn(KIND_LIST[kind] || 'walker', x / 100, zz / 100, yaw / 100, S === 'rise' ? 'rise' : S === 'feed' ? 'feed' : 'walk', 100, { id, body });
        z.net = new THREE.Vector3(x / 100, 0, zz / 100);
      }
      if (z.state === 'dead') { if (!z.keep || S === 'dead') continue; z.keep = false; z.hp = 100; z.sink = 0; }   // (a sleeper, up again)
      const to = new THREE.Vector3(x / 100, 0, zz / 100);
      if (z.netAt) z.vel.subVectors(to, z.net).divideScalar(Math.max(0.05, (performance.now() - z.netAt) / 1000));   // (how fast, from the last two)
      z.net = to; z.netAt = performance.now(); z.netYaw = yaw / 100;
      if (z.state !== S) { z.state = S; z.t = t / 100; if (S !== 'scream') z.screamed = false; }
      else if (Math.abs(z.t - t / 100) > 0.4) z.t = t / 100;
      z.swing = swing / 100;
      z.victimId = S === 'grab' ? victim || null : null;
      if (S === 'show' && victim) { const [role] = String(victim).split(':'); z.role = role; z.showT = (z.showT || 0); }
      if (flags & 1) z.flash = 0.09;
      z.y = (y || 0) / 100;
      if (KIND_LIST[kind] && z.kind !== KIND_LIST[kind]) { z.kind = KIND_LIST[kind]; z.K = KINDS[z.kind]; }
    }
    for (const z of this.list) if (!seen.has(z.id) && z.state !== 'dead' && z.net) { z.hp = 0; z.state = 'dead'; z.t = 0; }   // (gone from the host's: dead, and we missed it)
    void age;
  }
  // A guest, each frame: glide toward where the host last had them, and keep their clips going.
  follow(dt, events = null) {
    this.time += dt;
    for (const z of this.list) {
      z.t += dt;
      z.flash = Math.max(0, z.flash - dt);
      z.flinch *= Math.exp(-8 * dt);
      const cyc = Math.floor(z.step * 2);
      if (cyc !== z.lastCyc) { z.lastCyc = cyc; if (events && (z.state === 'chase' || z.state === 'attack') && z.vel.lengthSq() > 0.3) events.push({ type: 'zstep', z }); }
      if (z.state === 'show') { z.showT = (z.showT || 0) + dt; if (z.role === 'crowd' && z.vel.lengthSq() < 0.2) z.y = Math.max(0, Math.sin(z.showT * 7.2 + (z.phase || 0) * 6) * 0.22 - 0.05); }
      if (z.state === 'dead') { if (z.t > clipLength(clipOf(z, 'death')) / 1.25 + DEAD.lie && !z.keep) z.sink += dt; continue; }
      if (!z.net) continue;
      // (carried on a little past where it was said, by how fast it was going, then pulled to it)
      const ahead = Math.min(0.2, (performance.now() - (z.netAt || 0)) / 1000);
      w.copy(z.net).addScaledVector(z.vel, ahead);
      z.pos.lerp(w, Math.min(1, dt * 10));
      z.yaw = wrap(z.yaw + wrap(z.netYaw - z.yaw) * Math.min(1, dt * 10));
      if (z.swing > 0) z.swing += dt;
    }
    this.list = this.list.filter((z) => z.sink < 1.4);
    this.draw(dt);
  }

  // A gun went off at p: whatever is feeding near enough looks up.
  heard(p) {
    for (const z of this.list) if (z.state === 'feed' && z.pos.distanceTo(p) < DEAD.hear) { z.state = 'scream'; z.t = 0; }
  }

  doorsChanged() { this.flows.clear(); }

  flowTo(p) {
    const [i, j] = this.station.cellOf(p), key = i + j * 1000;
    let f = this.flows.get(key);
    if (!f) { f = this.station.flow(p); this.flows.set(key, f); }
    return f;
  }

  // The show (index.js's joke): the ones near enough become the crowd, each with a mark in front of the stage; the star
  // stands on it. stage: where; facing: the way the crowd faces; rows of three, 1.3 m apart.
  showStart(crowd, stage, facing, star) {
    const side = { x: Math.cos(facing), z: -Math.sin(facing) }, back = { x: -Math.sin(facing), z: -Math.cos(facing) };
    crowd.forEach((z, i) => {
      const row = Math.floor(i / 3), col = (i % 3) - 1;
      z.state = 'show'; z.role = 'crowd'; z.showT = -0.3 * Math.random(); z.swing = 0; z.watch = false; z.victimId = null;
      z.mark = { x: stage.x + back.x * (2.6 + row * 1.3) + side.x * col * 1.3, z: stage.z + back.z * (2.6 + row * 1.3) + side.z * col * 1.3 };
      z.faceTo = facing;
    });
    if (star) { star.state = 'show'; star.role = 'star'; star.act = 'rise'; star.showT = 0; star.swing = 0; star.mark = null; star.pos.set(stage.x, 0, stage.z); star.vel.set(0, 0, 0); star.yaw = facing + Math.PI; star.y = 0; }
  }
  // Over: the crowd comes for you (screaming), the star goes back where it came from.
  showEnd() {
    for (const z of this.list) {
      if (z.state !== 'show') continue;
      if (z.role === 'star') { z.hp = 0; z.state = 'dead'; z.t = 99; z.keep = false; z.sink = 0.5; continue; }
      z.state = 'scream'; z.t = 0; z.screamFor = 1.2; z.mark = null; z.y = 0; z.role = null;
    }
  }

  // It has you: from here on index.js plays it (the camera, the mashing); this keeps it on you.
  grab(z, target) {
    z.state = 'grab'; z.t = 0; z.swing = 0; z.hold = 0; z.lift = z.kind === 'warden';
    z.victimId = target.id;
    z.bearing = Math.atan2(z.pos.x - target.pos.x, z.pos.z - target.pos.z);
    this.grabCool = GRAB.every;
  }
  // Off you: thrown (staggered, a moment stood) or done with you.
  free(z, thrown) {
    if (z.state !== 'grab') return;
    z.victimId = null; z.hold = 0; z.t = 0;
    if (thrown) { z.state = 'stand'; z.standFor = 1.3; z.watch = false; z.vel.x += Math.sin(z.bearing) * 3; z.vel.z += Math.cos(z.bearing) * 3; z.flinch = 1; }
    else z.state = 'chase';
  }

  update(dt, players, events) {
    this.grabCool -= dt;
    const busy = new Set(this.list.filter((g) => g.state === 'grab').map((g) => g.victimId));
    this.time += dt;
    const S = this.station;
    // (all of you in the lounge: the nearest five keep at the airlock, the rest stand where they are until someone comes out)
    const safeAll = players.length > 0 && players.every((p) => !p.alive || p.safe);
    if (safeAll) {
      const spot = players.find((p) => p.alive)?.pos;
      const coming = this.list.filter((z) => z.hp > 0 && (z.state === 'chase' || z.state === 'attack' || (z.state === 'stand' && z.lurk)));
      if (spot) coming.sort((a, b) => a.pos.distanceToSquared(spot) - b.pos.distanceToSquared(spot));
      coming.forEach((z, i) => {
        if (i >= DEAD.atDoor && !z.lurk) { z.lurk = true; z.state = 'stand'; z.standFor = 1e9; z.watch = false; z.t = 0; z.vel.set(0, 0, 0); }
        else if (i < DEAD.atDoor && z.lurk) { z.lurk = false; z.state = 'chase'; z.t = 0; }
      });
    } else for (const z of this.list) if (z.lurk) { z.lurk = false; if (z.state === 'stand') { z.state = 'chase'; z.t = 0; } }
    for (const z of this.list) {
      z.t += dt;
      z.flash = Math.max(0, z.flash - dt);
      z.slow = Math.max(0, z.slow - dt);
      z.flinch *= Math.exp(-8 * dt);
      if (z.state === 'dead') {
        if (z.t > clipLength(clipOf(z, 'death')) / 1.25 + DEAD.lie && !z.keep) z.sink += dt;
        if (z.y > 0) z.y = Math.max(S.groundAt(z.pos, 0.2), z.y - dt * (1 + z.t * 12));   // (killed going over a crate: it falls)
        continue;
      }
      // Going over a crate: along a line, up over it, and on the way it was going (a little slower than it came).
      if (z.state === 'vault') {
        const o = z.over, s = Math.min(1, z.t / VAULT.time);
        z.pos.lerpVectors(o.from, o.to, s);
        z.y = Math.max(0, o.top - VAULT.tuck) * Math.pow(Math.sin(Math.PI * s), 0.55);
        z.yaw = wrap(z.yaw + wrap(o.yaw - z.yaw) * Math.min(1, dt * 10));
        if (s >= 1) { z.state = 'chase'; z.t = 0; z.y = 0; z.vel.set(Math.sin(o.yaw), 0, Math.cos(o.yaw)).multiplyScalar(z.speed * 0.6); z.overIn = VAULT.every; }
        continue;
      }
      // Climbing up onto one (you are up there): hands on it, up, and on top of it.
      if (z.state === 'climb') {
        const o = z.over, s = Math.min(1, z.t / CLIMB.time), up = Math.min(1, Math.max(0, (s - 0.2) / 0.6)), along = Math.min(1, Math.max(0, (s - 0.45) / 0.55));
        z.pos.lerpVectors(o.from, o.to, along * along * (3 - 2 * along));
        z.y = o.top * up * up * (3 - 2 * up);
        z.yaw = wrap(z.yaw + wrap(o.yaw - z.yaw) * Math.min(1, dt * 10));
        if (s >= 1) { z.state = 'chase'; z.t = 0; z.y = o.top; z.vel.set(0, 0, 0); z.overIn = VAULT.every; }
        continue;
      }
      // (its feet on the plates, when it is going somewhere and near enough to hear)
      const cyc = Math.floor(z.step * 2);
      if (cyc !== z.lastCyc) { z.lastCyc = cyc; if ((z.state === 'chase' || z.state === 'attack') && z.vel.lengthSq() > 0.3) events.push({ type: 'zstep', z }); }
      // Who it is after: the nearest of you still standing.
      // (those in the lounge only if there is nobody else: then they wait at its airlock)
      let target = null, far = Infinity;
      for (const pass of [false, true]) {
        for (const p of players) { if (!p.alive || !!(p.safe || p.shield) !== pass) continue; const d = Math.hypot(p.pos.x - z.pos.x, p.pos.z - z.pos.z); if (d < far) { far = d; target = p; } }
        if (target) break;
      }
      z.target = target;
      z.groan -= dt;
      if (z.groan < 0 && !z.K.quiet) { z.groan = (z.state === 'chase' ? 2.5 : 5) + Math.random() * 5; events.push({ type: 'groan', z }); }
      // Hanging (from a cable in the ceiling): it waits there until one of you is under it (scares.js lets it go).
      if (z.state === 'hang') { z.vel.set(0, 0, 0); continue; }
      // In the duct (the crawlspace): along it on its belly, from the far end toward whoever is in there; over them, and
      // out the way they came in (index.js watches `z.duct.k` for the moment it reaches them).
      if (z.state === 'duct') {
        const d = z.duct; d.k = Math.min(1.08, d.k + dt * d.speed / d.len);
        z.pos.lerpVectors(d.from, d.to, Math.min(1, d.k)); z.y = 0; z.vel.set(0, 0, 0); z.yaw = d.yaw;
        if (d.k >= 1.08) { z.state = 'chase'; z.t = 0; z.pos.copy(d.to).addScaledVector(d.axis, 0.9); z.duct = null; }
        continue;
      }
      // Dropping (out of a vent): down it comes, and gets up running.
      if (z.state === 'drop') {
        const floor = S.groundAt(z.pos, 0.2);
        z.vy = (z.vy || 0) - 14 * (this.gravityScale || 1) * dt;
        z.y = Math.max(floor, (z.y || 0) + z.vy * dt);
        if (z.y <= floor && z.t > 0.2) { z.state = 'scream'; z.t = 0.6; events.push({ type: 'landed', z }); }
        continue;
      }
      // Standing (a scare): stock still in the dark, looking at you, until the light finds it (or it has waited long enough).
      if (z.state === 'stand') {
        if (target) z.yaw = wrap(z.yaw + wrap(Math.atan2(target.pos.x - z.pos.x, target.pos.z - z.pos.z) - z.yaw) * Math.min(1, dt * 3));
        if (z.watch) {   // (the Watcher: still while anyone has eyes on it; a moment unseen, and it comes)
          const seen = this.looks.some((l) => { v.subVectors(z.head, l.eye); const d = v.length(); if (d < 1e-3) return true; v.divideScalar(d); return v.dot(l.dir) > 0.6 && this.station.see(l.eye, z.head); });
          if (seen) z.t = 0;
          else if (z.t > 1.3) { z.state = 'scream'; z.t = 0; z.watch = false; events.push({ type: 'watcher', z }); }
          continue;
        }
        if (z.t > (z.standFor ?? 3)) { z.state = 'scream'; z.t = 0; }
        continue;
      }
      if (z.state === 'rise') {
        if (z.t > clipLength('zstand') / DEAD.rise) { z.state = z.kind === 'sprinter' ? 'scream' : 'chase'; z.t = 0; }
        continue;
      }
      if (z.state === 'feed') {
        // (it is busy: you can get right up to it, if it does not see you coming)
        if (target && far < DEAD.wake && S.see(z.head, target.eye)) { z.state = 'scream'; z.t = 0; events.push({ type: 'wake', z, close: far }); }
        continue;
      }
      if (z.state === 'scream') {
        if (z.t < 0.05) events.push({ type: 'scream', z });
        if (target) z.yaw = wrap(z.yaw + wrap(Math.atan2(target.pos.x - z.pos.x, target.pos.z - z.pos.z) - z.yaw) * Math.min(1, dt * 6));
        if (z.t > (z.screamFor ?? 1.5)) { z.state = 'chase'; z.t = 0; if (z.kind === 'walker') { z.kind = 'runner'; z.K = KINDS.runner; z.speed = z.K.speed; } }   // (a feeder you have woken does not walk; a screamer stays what it is)
        continue;
      }
      if (z.state === 'show') {
        // (to its mark, and then it dances there; the star goes nowhere: it is the stage's)
        z.showT = (z.showT || 0) + dt;
        if (z.mark) {
          const dx = z.mark.x - z.pos.x, dz = z.mark.z - z.pos.z, d = Math.hypot(dx, dz);
          const speed = d > 0.25 ? Math.min(z.speed, 2.2) : 0;
          z.vel.x += ((dx / (d || 1)) * speed - z.vel.x) * Math.min(1, dt * 6);
          z.vel.z += ((dz / (d || 1)) * speed - z.vel.z) * Math.min(1, dt * 6);
          z.pos.addScaledVector(z.vel, dt);
          const face = d > 0.4 ? Math.atan2(dx, dz) : z.faceTo ?? z.yaw;
          z.yaw = wrap(z.yaw + wrap(face - z.yaw) * Math.min(1, dt * 4));
          z.y = d > 0.4 ? 0 : Math.max(0, Math.sin(z.showT * 7.2 + (z.phase || 0) * 6) * 0.22 - 0.05);   // (hopping on the beat)
        } else z.vel.set(0, 0, 0);
        continue;
      }
      if (z.state === 'skit') {   // (one of them, scripted from outside: z.skit = { to, speed, face, clip, rate, freeze, loop })
        const k = z.skit || (z.skit = {});
        k.t = (k.t || 0) + dt;
        if (k.to) {
          const dx = k.to.x - z.pos.x, dz = k.to.z - z.pos.z, d = Math.hypot(dx, dz);
          const speed = d > 0.3 ? (k.speed || 1.3) : 0;
          z.vel.x += ((dx / (d || 1)) * speed - z.vel.x) * Math.min(1, dt * 6);
          z.vel.z += ((dz / (d || 1)) * speed - z.vel.z) * Math.min(1, dt * 6);
          z.pos.addScaledVector(z.vel, dt);
          if (!k.noCollide) S.collide(z.pos, 0.3, z.y || 0);
          if (k.y != null) z.y = k.y;
          k.there = d <= 0.35;
          const face = d > 0.4 ? Math.atan2(dx, dz) : k.face ? Math.atan2(k.face.x - z.pos.x, k.face.z - z.pos.z) : z.yaw;
          z.yaw = wrap(z.yaw + wrap(face - z.yaw) * Math.min(1, dt * 5));
        } else {
          z.vel.set(0, 0, 0);
          if (k.face) z.yaw = wrap(z.yaw + wrap(Math.atan2(k.face.x - z.pos.x, k.face.z - z.pos.z) - z.yaw) * Math.min(1, dt * 5));
        }
        z.swing = 0;
        continue;
      }
      if (z.state === 'grab') {
        const T = players.find((p) => p.id === z.victimId);
        if (!T || !T.alive || T.safe || T.shield || T.downed) { this.free(z, false); continue; }
        // (pinned in front of whoever it has, facing them, arms out; and after a while, the bite, and it lets go)
        const lung = lungeOf(z.t);   // (in at your face, and back, and in again)
        z.pos.set(T.pos.x + Math.sin(z.bearing) * (holdOf(z) - 0.4 * lung * (z.kind === 'warden' ? 0.3 : 0.25)), 0, T.pos.z + Math.cos(z.bearing) * (holdOf(z) - 0.4 * lung * (z.kind === 'warden' ? 0.3 : 0.25)));   // (the neck bite's own lean does the rest)
        z.y = T.y || 0;   // (up on a crate with you, if that is where you are)
        z.vel.set(0, 0, 0);
        z.yaw = Math.atan2(T.pos.x - z.pos.x, T.pos.z - z.pos.z);
        if (z.hold >= 1) { this.free(z, true); events.push({ type: 'freed', z, target: T }); continue; }
        if (z.t > (z.kind === 'warden' ? LIFT.bite : GRAB.bite)) { events.push({ type: 'bite', z, target: T, damage: z.kind === 'warden' ? LIFT.damage : GRAB.damage }); this.free(z, false); z.state = 'chase'; z.swing = 0; }
        continue;
      }
      if (!target) { z.vel.multiplyScalar(1 - Math.min(1, dt * 4)); continue; }
      if (z.K.call) {   // (the screamer: in sight of you, it stops and calls; then not again for a while)
        z.callIn = (z.callIn ?? 1.5) - dt;
        if (z.callIn <= 0 && far < 18 && S.see(z.head, target.eye)) { z.callIn = z.K.every; z.state = 'scream'; z.t = 0; z.screamFor = 2.6; events.push({ type: 'call', z, at: z.pos.clone() }); continue; }
      }
      // Which way: straight at you, if it can see you; otherwise through the station, cell by cell, the shortest way round.
      const close = far < 9 && S.see(v.set(z.pos.x, 1.2, z.pos.z), w.set(target.pos.x, 1.2, target.pos.z));
      if (close) next.copy(target.pos);
      else {
        S.step(z.pos, this.flowTo(target.pos), next);
        // (and toward the cell after that, as soon as the corner is out of its way: no squaring off round corners)
        const after = S.step(next, this.flowTo(target.pos), w.clone());
        if (S.see(v.set(z.pos.x, 1, z.pos.z), w.set(after.x, 1, after.z))) next.copy(after);
      }
      const dx = next.x - z.pos.x, dz = next.z - z.pos.z, d = Math.hypot(dx, dz) || 1;
      const reach = z.K.reach || DEAD.reach, swingT = z.K.swing || DEAD.swing;
      const above = (target.y || 0) - (z.y || 0);
      const on = far < reach && Math.abs(above) < HIGH;
      // The stalker: under anyone's eyes it is a statue (and says so, the first time); unseen, it comes, fast and silent.
      if (z.K.stalk) {
        const by = this.looks.filter((l) => { v.subVectors(z.head, l.eye); const d = v.length(); if (d < 1e-3 || d > 26) return false; v.divideScalar(d); return v.dot(l.dir) > 0.55 && this.station.see(l.eye, z.head); });
        const eyed = by.length > 0; z.eyedBy = by.map((l) => l.id || 'me');
        if (eyed && !z.frozen && !z.eyedOnce) { z.eyedOnce = true; events.push({ type: 'stalkSeen', z }); }
        z.frozen = eyed;
        if (eyed && far > reach) { z.vel.set(0, 0, 0); z.swing = 0; continue; }
      }
      // (a crate in its way: over it; you up on one: up it comes after you. Not every moment: one is done, a breath first)
      z.overIn = (z.overIn || 0) - dt;
      if (!on && CLIMBERS(z) && z.overIn <= 0 && (z.y || 0) < 0.05) {
        const dir = above > HIGH && far < 2.4 ? w.set(target.pos.x - z.pos.x, 0, target.pos.z - z.pos.z).normalize() : v.set(dx / d, 0, dz / d);
        const L = S.ledge(z.pos, dir, 0.8), r = z.K.radius || DEAD.radius;
        if (L && above > HIGH && Math.abs(L.top - (target.y || 0)) < 0.3) {
          z.over = { from: z.pos.clone(), to: z.pos.clone().addScaledVector(dir, Math.max(L.near + 0.2, Math.min(L.near + CLIMB.onto, L.far - 0.15))), top: L.top, yaw: Math.atan2(dir.x, dir.z) };   // (onto it, and no further than it goes)
          z.state = 'climb'; z.t = 0; z.swing = 0; z.vel.set(0, 0, 0); events.push({ type: 'zclimb', z });
          continue;
        }
        if (L && L.far < 2.2) {
          const to = z.pos.clone().addScaledVector(dir, L.far + VAULT.past);
          if (S.clear(to, r + 0.05) && !S.walled(z.pos, to)) {
            z.over = { from: z.pos.clone(), to, top: L.top, yaw: Math.atan2(dir.x, dir.z) };
            z.state = 'vault'; z.t = 0; z.swing = 0; events.push({ type: 'zvault', z });
            continue;
          }
        }
        z.overIn = 0.4;   // (nothing to go over: look again in a moment)
      }
      // (up on something, and walked off the edge of it: down it drops)
      {   // (its feet: up a slope or a step, or falling to the floor under it)
        const g = S.groundAt(z.pos, 0.2), y = z.y || 0;
        if (g > y + 0.005 && g - y < 0.7) { z.y = g; z.vy = 0; }
        else if (y > g + 0.02) { z.vy = (z.vy || 0) - 14 * (this.gravityScale || 1) * dt; z.y = Math.max(g, y + z.vy * dt); }
        else if (y !== g) { z.y = g; z.vy = 0; }
      }
      // (a long way off and out of sight, it hurries: nobody sees a walker run; and lost for too long, it is brought back: index.js)
      const hurry = !close && far > 16 ? 1.6 : 1;   // (and never faster than SPEED_CAP: you can always walk away from one)
      z.farFor = !close && far > 24 ? (z.farFor || 0) + dt : 0;
      // (and one that has no way to you at all, or is far off and has got no nearer for a long while, is brought in
      // too: a round must always end. One stuck in the crowd round you is not: it is where it should be. And none is
      // ever moved where any of you can see it go)
      const seen = this.looks.some((l) => this.station.see(l.eye, z.head));
      if (!on && z.state === 'chase' && !seen) {
        if (far < (z.best ?? Infinity) - 1) { z.best = far; z.stuck = 0; } else if (far > 14) z.stuck = (z.stuck || 0) + dt;
        const cell = S.cellOf(z.pos), way = this.flowTo(target.pos)[cell[1] * S.width + cell[0]];
        if (!Number.isFinite(way)) z.stuck = (z.stuck || 0) + dt * 4;
        if (z.stuck > 12 && z.kind !== 'warden') { z.stuck = 0; z.best = Infinity; events.push({ type: 'lost', z }); continue; }
      } else { z.stuck = 0; if (seen) z.best = Math.min(z.best ?? Infinity, far); }
      if (z.farFor > 12 && z.kind !== 'warden' && !seen) { z.farFor = 0; events.push({ type: 'lost', z }); continue; }
      const speed = on ? 0 : Math.min(SPEED_CAP, z.speed * hurry) * (z.slow > 0 ? 0.35 : 1);
      z.vel.x += ((dx / d) * speed - z.vel.x) * Math.min(1, dt * 5);
      z.vel.z += ((dz / d) * speed - z.vel.z) * Math.min(1, dt * 5);
      const face = on || close ? Math.atan2(target.pos.x - z.pos.x, target.pos.z - z.pos.z) : Math.atan2(z.vel.x, z.vel.z);
      z.yaw = wrap(z.yaw + wrap(face - z.yaw) * Math.min(1, dt * z.K.turn));
      z.pos.addScaledVector(z.vel, dt);
      // On you: it swings, and every so often a swing lands.
      if (on || z.swing > 0) {
        const was = z.swing;
        z.swing += dt;
        if (was < DEAD.lands * swingT / DEAD.swing && z.swing >= DEAD.lands * swingT / DEAD.swing && far < reach + 0.35 && Math.abs(above) < HIGH) {   // (not from the floor at one of you up on a crate)
          if (this.grabCool <= 0 && GRAB.kinds.includes(z.kind) && !target.downed && !busy.has(target.id) && Math.random() < (z.kind === 'warden' ? LIFT.chance : this.grabChance)) { this.grab(z, target); events.push({ type: 'grab', z, target }); }
          else events.push({ type: 'claw', z, target, damage: z.K.claw || DEAD.claw });
        }
        if (z.swing > swingT) z.swing = on ? z.swing - swingT : 0;
      }
      if (z.state !== 'grab') z.state = on ? 'attack' : 'chase';   // (one that has just got hold of you keeps hold)
    }
    // They do not walk through each other (or through you), nor through the walls.
    const live = this.list.filter((z) => z.hp > 0 && z.state !== 'feed');
    for (let a = 0; a < live.length; a++) {
      const A = live[a];
      for (let b = a + 1; b < live.length; b++) {
        const B = live[b], dx = B.pos.x - A.pos.x, dz = B.pos.z - A.pos.z, d2 = dx * dx + dz * dz, r = (A.K.radius || DEAD.radius) + (B.K.radius || DEAD.radius);
        if (d2 > r * r || d2 < 1e-8) continue;
        const d = Math.sqrt(d2), push = (r - d) / 2;
        A.pos.x -= (dx / d) * push; A.pos.z -= (dz / d) * push; B.pos.x += (dx / d) * push; B.pos.z += (dz / d) * push;
      }
      for (const p of players) {
        if (!p.alive || A.state === 'climb' || A.state === 'vault') continue;
        const dx = A.pos.x - p.pos.x, dz = A.pos.z - p.pos.z, d = Math.hypot(dx, dz), r = (A.K.radius || DEAD.radius) + 0.45;
        if (d < r && d > 1e-6) { A.pos.x = p.pos.x + (dx / d) * r; A.pos.z = p.pos.z + (dz / d) * r; }
      }
      if (A.state !== 'vault' && A.state !== 'climb') S.collide(A.pos, A.K.radius || DEAD.radius, A.y || 0);
    }
    // What has sunk away is gone.
    this.list = this.list.filter((z) => z.sink < 1.4);
    this.draw(dt);
  }

  draw(dt = 0) {
    const all = [...this.bodies, ...Object.values(this.special)];
    for (const body of all) { body.parts.n = 0; if (body.lite) body.lite.n = 0; }
    const t = this.time;
    for (const z of this.list) {
      const body = z.body, near = z.pos.distanceToSquared(this.eye) < NEAR * NEAR;
      const parts = near && body.parts.n < FINE ? body.parts : body.lite && body.lite.n < MOST ? body.lite : body.parts.n < FINE ? body.parts : null;
      if (!parts) continue;
      const i = parts.n++;
      // Which clip it moves by, and what on top of it.
      const K = z.K, len = clipLength;
      const gait = K.gait;
      let other = null, at = 0, wgt = 0, loop = false;
      const moving = Math.hypot(z.vel.x, z.vel.z);
      z.step += z.frozen || z.state === 'hang' ? 0 : dt * (z.state === 'chase' || z.state === 'attack' || z.state === 'skit' ? Math.max(0.35, Math.min(1.9, moving / K.pace)) : 0.3);
      if (z.state === 'dead') { const D = clipOf(z, 'death'); other = D; wgt = 1; at = Math.min(len(D) * 0.97, z.t * 1.25); }
      else if (z.state === 'rise') { other = 'zstand'; wgt = 1; at = Math.min(len('zstand') * 0.97, z.t * DEAD.rise); }
      else if (z.state === 'stand') { other = 'zidle'; wgt = 1; at = 1.2 + z.t * 0.35; loop = true; }
      else if (z.state === 'drop') { other = 'walldrop'; wgt = 1; at = Math.min(len('walldrop') * 0.9, 0.5 + z.t * 0.9); }
      else if (z.state === 'hang') { other = 'walldrop'; wgt = 1; at = 0.35 + 0.02 * Math.sin(t * 1.3); }   // (limp, turning a little on its cable)
      else if (z.state === 'duct') { other = 'crawlrun'; wgt = 1; at = z.t * 1.4; loop = true; }
      else if (z.state === 'vault') { other = 'vault'; wgt = 1; at = VAULT.clip[0] + (VAULT.clip[1] - VAULT.clip[0]) * Math.min(1, z.t / VAULT.time); }
      else if (z.state === 'climb') { other = 'wallclimb'; wgt = 1; at = CLIMB.clip[0] + (CLIMB.clip[1] - CLIMB.clip[0]) * Math.min(1, z.t / CLIMB.time); }
      else if (z.state === 'feed') { other = 'zbite'; wgt = 1; at = t * 0.9 + z.phase * 6; loop = true; }
      else if (z.state === 'scream') { other = clipOf(z, 'scream'); wgt = Math.min(1, z.t * 5, (z.screamFor ?? 1.5) - z.t > 0 ? ((z.screamFor ?? 1.5) - z.t) * 4 : 0); at = 0.35 + z.t * 1.2; }
      else if (z.state === 'show') {
        const st = z.showT || 0;
        // (the open mic: the star sings (his own Singing clip; the roar for the finale), the four behind him breakdance,
        // the crowd in front cheers, claps and rallies, each their own way)
        if (z.role === 'star') { other = z.act === 'finale' ? clipOf(z, 'attack') : z.act === 'rise' ? 'zstand' : 'sing'; wgt = 1; loop = z.act !== 'rise'; at = z.act === 'rise' ? Math.min(len('zstand') * 0.97, st * 1.1) : z.act === 'finale' ? st * 1.3 : 0.2 + st; }
        else if (z.role === 'fan') { other = ['cheer', 'clap', 'rally'][(z.who || 0) % 3]; wgt = 1; loop = true; at = st * (1 + 0.1 * ((z.who || 0) % 4)) + (z.phase || 0) * 3; }
        else if (z.role === 'crowd' && z.dancing) { other = 'breakdance'; wgt = 1; loop = true; at = st * 1.0 + (z.phase || 0) * 2; }
        else { other = Math.hypot(z.vel.x, z.vel.z) > 0.3 ? null : 'zidle'; wgt = 1; loop = true; at = 1.0 + st * 1.6 + (z.phase || 0) * 3; }
      }
      else if (z.state === 'skit') {
        const k = z.skit || {};
        if (k.clip) { other = k.clip; wgt = k.wgt ?? 1; loop = !!k.loop; at = (k.from || 0) + (k.freeze != null ? Math.min(k.freeze, k.t * (k.rate || 1)) : k.t * (k.rate || 1)); }
        else if (moving < 0.3) { other = 'zidle'; wgt = 1; loop = true; at = 1.0 + t * 1.2 + (z.phase || 0) * 3; }
      }
      else if (z.state === 'grab') { other = 'neckbite'; wgt = 1; at = 0.2 + z.t * 1.0; loop = true; }   // (it has you by the neck: his Zombie Neck Bite clip, the whole time)
      else if (z.swing > 0) { const A = clipOf(z, 'attack'); other = A; wgt = Math.min(1, z.swing * 6, 1); at = A === 'zattack' ? 0.55 + (z.swing / DEAD.swing) * 1.25 : (z.swing / (z.K.swing || DEAD.swing)) * len(A); loop = A !== 'zattack'; }
      const P = pose(gait, z.step, other, at, wgt, loop);
      const sink = z.sink * 0.9;
      m.compose(v.set(z.pos.x, (z.y || 0) - sink + (z.hop || 0), z.pos.z), q.setFromAxisAngle(up, z.yaw), sc.setScalar(z.scale));
      if (z.flinch > 0.02 && z.state !== 'dead') m.multiply(FLINCH.makeTranslation(0, parts.hipY, 0)).multiply(FLINCH2.makeRotationX(-0.42 * z.flinch)).multiply(FLINCH3.makeTranslation(0, -parts.hipY, 0));
      const colour = z.flash > 0 ? HURT : tint.copy(z.tint);
      place(parts, P, parts.hipY, true, (part, L) => {
        if (part === parts.head) z.head.copy(parts.headMid).applyMatrix4(L).applyMatrix4(m);
        if ((z.role === 'star' || z.holdsThing) && part.handLocal && part.side < 0) { (z.handR ||= new THREE.Vector3()).copy(part.handLocal).applyMatrix4(L).applyMatrix4(m); (z.elbowR ||= new THREE.Vector3()).set(0, 0, 0).applyMatrix4(L).applyMatrix4(m); }
        if (part.role === 'core') z.hip.set(0, parts.hipY, 0).applyMatrix4(L).applyMatrix4(m);
        if (z.headless && part.role === 'head') part.mesh.setMatrixAt(i, zero);
        else part.mesh.setMatrixAt(i, out.multiplyMatrices(m, L));
        part.mesh.setColorAt(i, part.glow ? WHITE : colour);
      });
    }
    for (const body of all) for (const parts of [body.parts, body.lite]) for (const part of parts || []) {
      part.mesh.count = parts.n;
      part.mesh.visible = parts.n > 0;
      part.mesh.instanceMatrix.needsUpdate = true;
      if (part.mesh.instanceColor) part.mesh.instanceColor.needsUpdate = true;
    }
  }

  clear() { this.list.length = 0; this.flows.clear(); this.outbox.length = 0; this.draw(0); }
}

// Where along a ray (unit dir) it first meets a ball / a capsule (Infinity if it never does).
function sphere(o, d, c, r) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z, b = ox * d.x + oy * d.y + oz * d.z, k = ox * ox + oy * oy + oz * oz - r * r, h = b * b - k;
  if (h < 0) return Infinity;
  const t = -b - Math.sqrt(h);
  return t >= 0 ? t : -b + Math.sqrt(h) >= 0 ? 0 : Infinity;
}
const ba = new THREE.Vector3(), oa = new THREE.Vector3();
function capsule(o, d, a, b, r) {
  ba.subVectors(b, a); oa.subVectors(o, a);
  const baba = ba.dot(ba), bard = ba.dot(d), baoa = ba.dot(oa), rdoa = d.dot(oa), oaoa = oa.dot(oa);
  const A = baba - bard * bard, B = baba * rdoa - baoa * bard, C = baba * oaoa - baoa * baoa - r * r * baba, h = B * B - A * C;
  if (h >= 0 && A > 1e-9) {
    const t = (-B - Math.sqrt(h)) / A, y = baoa + t * bard;
    if (y > 0 && y < baba && t >= 0) return t;
    const c = y <= 0 ? a : b;
    const s = sphere(o, d, c, r);
    return s;
  }
  return Math.min(sphere(o, d, a, r), sphere(o, d, b, r));
}
