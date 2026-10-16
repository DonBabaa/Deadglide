// Your guns in DEAD AIR. They shoot as the game's guns do (player/weapon.js): a bullet is a thing that flies, a streak
// of light across the dark, and it goes through a zombie's body or stops in a wall; it throws what it hits back; the
// shot kicks the camera and punches the view out for an instant. Each gun is one of the game's own (its model, its
// sound), with numbers of its own for in here. And the butt of it, or the knife by it, for whatever gets too close (F).
//
//   const arms = new Arms(scene, walker, station, dead);
//   arms.update(dt, { fire, fireDown, aiming, reload, melee, still })  -> what happened: [{ type: 'hit' | 'kill' | 'shot' | 'dry' | 'reload' | 'swing' | ... }]
import * as THREE from 'three';
import { Reload } from './reload.js';

//   model: which of the game's guns it looks and sounds like. auto: keeps firing while the button is held.
//   damage: a bullet in the body (head: times this in the head; the legs take three quarters).
//   rate: shots a second at most. spread: scatter in degrees, from the hip / down the sights. bloom: what each shot adds.
//   speed: the bullet's, m/s (0: a beam, there at once). pierce: zombies it goes on through. knock: how hard a hit shoves.
//   kick: how hard the shot jolts the camera (1 = the pistol). life: seconds a bullet flies (the shotgun's run out).
// (what the Reactor's crate can give you)
export const CRATE_GUNS = ['machineGun', 'shotgun', 'revolver'];   // (no sniper out of the crate: it is the wall gun's)
export const GUNS = {
  pistol: { model: 'pistol', name: 'M9 Pistol', damage: 34, head: 2.6, rate: 6.5, auto: false, mag: 8, spare: Infinity, reload: 1.35, spread: [2.0, 0.3], bloom: 0.9, pellets: 1, flash: 1, price: 0, speed: 170, pierce: 0, knock: 1, kick: 1, life: 1.2 },
  machineGun: { model: 'machineGun', name: 'MK4 Rifle', damage: 30, head: 2.2, rate: 11, auto: true, mag: 30, spare: 240, reload: 2.25, spread: [3.2, 0.7], bloom: 0.45, pellets: 1, flash: 0.8, price: 1000, speed: 190, pierce: 0, knock: 0.8, kick: 0.7, life: 1.1 },
  shotgun: { model: 'shotgun', name: 'Trench Gun', damage: 26, head: 1.6, rate: 1.4, auto: false, mag: 6, spare: 48, reload: 2.8, spread: [5.5, 3.8], bloom: 2, pellets: 8, flash: 1.5, price: 1200, speed: 150, pierce: 1, knock: 2.5, kick: 3.5, life: 0.5 },
  sniper: { model: 'sniper', name: 'Longshot .50', damage: 420, head: 3, rate: 1.1, auto: false, mag: 5, spare: 30, reload: 2.9, spread: [3.5, 0], bloom: 3, pellets: 1, flash: 1.6, price: 0, speed: 0, pierce: Infinity, knock: 2, kick: 6, life: 0 },
  revolver: { model: 'revolver', name: 'Hand Cannon', damage: 120, head: 3, rate: 2.4, auto: false, mag: 6, spare: 42, reload: 2.4, spread: [1.4, 0.15], bloom: 2.5, pellets: 1, flash: 1.7, price: 0, speed: 220, pierce: 2, knock: 2.2, kick: 4, life: 1.2 },
};
// The melee: a knife along the pistol, the butt of anything bigger. reach: metres; arc: how far off straight ahead
// (cosine); damage; knock; and how long before the next.
export const MELEE = { reach: 2.0, arc: 0.45, damage: 110, knock: 3.2, every: 0.6, most: 2, lands: 0.38 };   // lands: seconds after F before the butt of it connects (the swing in the clip)
const RANGE = 120, MAX_BULLETS = 120;
const Z = new THREE.Vector3(0, 0, 1), HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const dir = new THREE.Vector3(), side = new THREE.Vector3(), lift = new THREE.Vector3(), aim = new THREE.Vector3(), aimAt = new THREE.Vector3(), muzzleAt = new THREE.Vector3(), m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), at2 = new THREE.Vector3();

export class Arms {
  constructor(scene, walker, station, dead) {
    Object.assign(this, { scene, walker, station, dead });
    this.carried = [];          // [{ id, mag, spare }] (two at most)
    this.held = 0;
    this.cool = 0;              // until the next shot can go
    this.meleeCool = 0;
    this.rl = null;             // the reload going on (reload.js), if one is
    this.bloom = 0;             // how far the scatter has opened up from shooting
    this.events = [];
    // What the lounge has done for you (index.js hands it the game's): damage, reload time and scatter, as multiples;
    // and the guns that are gilded (three skulls on the slots): harder hitting, more in the magazine, and gold.
    this.mods = { damage: 1, reload: 1, spread: 1 };
    this.chicken = false;       // the rubber chicken on the end of it (index.js): the melee is the chicken's
    this.gilded = new Set();
    this.golden = false;   // Golden Hour (index.js): it hits three times as hard, and uses nothing

    // The bullets: a streak of light each, 1.8 m of it, as the game draws them.
    this.bullets = Array.from({ length: MAX_BULLETS }, () => ({ alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, pierce: 0, knock: 1, gone: 0, hit: new Set(), G: null, slotId: 'pistol' }));
    this.bulletMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.035, 0.035, 1.8), new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false }), MAX_BULLETS);
    this.bulletMesh.frustumCulled = false;
    for (let i = 0; i < MAX_BULLETS; i++) this.bulletMesh.setMatrixAt(i, HIDDEN);
    scene.add(this.bulletMesh);
    // The flash: a light that makes the whole room jump out of the dark for a moment, and a burst of flame at the muzzle.
    this.flash = new THREE.PointLight(0xffc27a, 0, 16, 1.6);
    this.flash.castShadow = false;
    scene.add(this.flash);
    const fire = new THREE.SpriteMaterial({ map: flameTexture(), color: 0xffd9a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.burst = new THREE.Sprite(fire);
    this.burst.visible = false;
    scene.add(this.burst);
    this.flashLeft = 0;
    // The beam (the Longshot): there at once, a line of light from the muzzle to wherever it stopped.
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 5, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5), new THREE.MeshBasicMaterial({ color: 0xffe6b0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.beam.visible = false;
    scene.add(this.beam);
    this.beamLeft = 0;
    // Sparks off metal, what comes out of the dead, and the bits of them that come off.
    this.bits = new Bits(scene);
  }

  get gun() { return GUNS[this.carried[this.held]?.id] || GUNS.pistol; }
  magOf(id) { return Math.round(GUNS[id].mag * (this.gilded.has(id) ? 1.5 : 1)); }
  nameOf(id) { return `${this.gilded.has(id) ? 'Gilded ' : ''}${GUNS[id].name}`; }
  gild(id) {
    this.gilded.add(id);
    const c = this.carried.find((x) => x.id === id);
    if (c) { c.mag = this.magOf(id); c.spare = Math.max(c.spare, GUNS[id].spare); }
    this.walker.gild(GUNS[id].model);
  }
  get slot() { return this.carried[this.held]; }

  give(id) {
    const G = GUNS[id];
    const have = this.carried.findIndex((c) => c.id === id);
    if (have >= 0) { const c = this.carried[have]; c.spare = G.spare; c.mag = this.magOf(id); this.held = have; }
    else {
      const slot = { id, mag: this.magOf(id), spare: G.spare };
      if (this.carried.length < 2) { this.carried.push(slot); this.held = this.carried.length - 1; } else this.carried[this.held] = slot;
    }
    this.rl = null;
    this.walker.setGun(this.gun.model);
  }

  // > 0 while a reload is going on: how long it has to go (a shotgun's, one shell at a time: just > 0).
  get reloading() { return this.rl ? this.rl.left : 0; }

  swap() {
    if (this.carried.length < 2) return;
    this.held = 1 - this.held;
    this.rl = null;   // (whatever was half done stays half done: a magazine out is out)
    this.cool = 0.35;
    this.walker.setGun(this.gun.model);
    this.events.push({ type: 'swap' });
  }

  reset() {
    this.rl = null; this.gilded.clear(); this.walker.gild(null); this.carried = []; this.held = 0; this.give('pistol'); this.bloom = 0; this.cool = 0; this.meleeCool = 0; this.strikeIn = 0;
    for (const b of this.bullets) b.alive = false;
  }

  // fire: the button is held; fireDown: it went down this frame; aiming: down the sights; reload: R this frame; melee: F this frame.
  update(dt, { fire, fireDown, aiming, reload, melee, still }) {
    const events = this.events; events.length = 0;
    const G = this.gun, slot = this.slot, w = this.walker;
    this.cool -= dt;
    this.meleeCool -= dt;
    if (this.strikeIn > 0) { this.strikeIn -= dt; if (this.strikeIn <= 0) this.land(events); }   // (the swing: it connects when the clip's does)
    this.bloom = Math.max(0, this.bloom - dt * (aiming ? 9 : 6));
    // Reloading: R, or pulling the trigger on an empty one. What happens, step by step, is reload.js's (the magazine
    // out and falling, a full one in, the slide; or a shell at a time, which firing stops).
    if (melee && !still && this.meleeCool <= 0) this.strike(events);
    else if (this.rl) {
      this.rl.update(dt, events, fireDown && !still);
      if (this.rl.done) { this.rl = null; events.push({ type: 'loaded' }); }
    } else if ((reload || ((fireDown || (fire && G.auto)) && slot.mag === 0)) && slot.mag < this.magOf(slot.id) && slot.spare > 0) {
      this.rl = new Reload(slot.id, slot, this.magOf(slot.id), this.mods);
      events.push({ type: 'reload', id: slot.id, empty: slot.mag === 0 });
    } else if (!still && (G.auto ? fire : fireDown) && this.cool <= 0 && !w.sprinting && this.meleeCool < MELEE.every - 0.25) {
      if (slot.mag <= 0) { if (fireDown) events.push({ type: 'dry' }); }
      else this.shoot(G, slot, aiming, events);
    }
    // The gun comes up to shoot, and down to run; and while it is being reloaded, where all of it is (walker.js puts it there).
    w.gunUp = !w.sprinting;
    w.reloadPose = this.rl ? this.rl.pose() : null;

    this.fly(dt, events);
    // The flash and the beam fade.
    this.flashLeft -= dt;
    this.flash.intensity = this.flashLeft > 0 ? 80 * G.flash * (this.flashLeft / 0.06) : 0;
    this.burst.visible = this.flashLeft > 0;
    if (this.beamLeft > 0) { this.beamLeft -= dt; this.beam.material.opacity = Math.max(0, this.beamLeft / 0.09) * 0.9; this.beam.visible = this.beamLeft > 0; }
    this.bits.update(dt);
    return events;
  }

  // Where the scatter is now, in degrees (for the crosshair).
  spread(aiming) { const G = this.gun; return ((aiming ? G.spread[1] : G.spread[0]) + this.bloom + (this.walker.moving ? (aiming ? 0.4 : 1.2) : 0)) * this.mods.spread; }
  // What a bullet of this gun does to a part of one of them, this far along.
  harm(G, slotId, part, travelled) {
    return G.damage * this.mods.damage * (this.gilded.has(slotId) ? 1.6 : 1) * (this.golden ? 3 : 1) * (this.bonus || 1) * (part === 'head' ? G.head : part === 'legs' ? 0.75 : 1) * (G.pellets > 1 ? Math.max(0.45, 1 - travelled / 14) : 1);
  }

  shoot(G, slot, aiming, events) {
    const w = this.walker, cam = w.camera;
    if (!this.golden) slot.mag--;
    this.cool = 1 / G.rate;
    const spread = THREE.MathUtils.degToRad(this.spread(aiming));
    this.bloom = Math.min(6, this.bloom + G.bloom);
    // Where the crosshair is: along the camera's line to the first of them, or the wall (or 60 m out). The bullets go
    // from the muzzle to there, so you see them cross the view, and they land where the sights say.
    cam.getWorldDirection(aim);
    const wallT = this.station.ray(cam.position, aim, RANGE), under = this.dead.hit(cam.position, aim, wallT);
    aimAt.copy(cam.position).addScaledVector(aim, under ? under.t : Math.min(wallT, 60));
    const muzzle = w.muzzleNow(muzzleAt);
    aim.subVectors(aimAt, muzzle).normalize();
    side.crossVectors(aim, cam.up).normalize();
    lift.crossVectors(side, aim).normalize();
    w.model.onShot();
    w.kick = 1;
    w.recoil(G.kick);
    this.dead.heard(cam.position);
    events.push({ type: 'shot', gun: G });

    // The flash, at the end of the barrel.
    const at = at2.copy(muzzle);
    this.flash.position.copy(at).addScaledVector(aim, 0.35);
    this.burst.position.copy(at).addScaledVector(aim, 0.1);
    this.burst.scale.setScalar((w.view.visible ? 0.16 : 0.3) * G.flash * (0.8 + Math.random() * 0.4));
    this.burst.material.rotation = Math.random() * Math.PI * 2;
    this.flashLeft = 0.06;

    for (let p = 0; p < G.pellets; p++) {
      // (a point picked evenly from inside the circle of scatter)
      const r = spread * Math.sqrt(Math.random()), a = Math.random() * Math.PI * 2;
      dir.copy(aim).addScaledVector(side, Math.tan(r) * Math.cos(a)).addScaledVector(lift, Math.tan(r) * Math.sin(a)).normalize();
      if (G.speed === 0) { this.fireBeam(G, slot, muzzle, dir, events); continue; }
      const b = this.bullets.find((o) => !o.alive);
      if (!b) continue;
      b.alive = true; b.G = G; b.slotId = slot.id; b.pos.copy(muzzle); b.vel.copy(dir).multiplyScalar(G.speed); b.life = G.life; b.pierce = G.pierce; b.knock = G.knock; b.gone = 0; b.hit.clear();
      this.lastEnd = muzzle.clone().addScaledVector(dir, 30);
    }
  }

  // The bullets, flying: each goes on until it meets one of them (and through, if it has pierce left) or a wall.
  fly(dt, events) {
    let n = 0;
    for (const b of this.bullets) {
      if (!b.alive) continue;
      b.life -= dt;
      if (b.life <= 0) { b.alive = false; continue; }
      const speed = b.vel.length(), step = speed * dt;
      dir.copy(b.vel).divideScalar(speed);
      let left = step;
      for (let guard = 0; guard < 4 && left > 0; guard++) {
        const wall = this.station.ray(b.pos, dir, left);
        const hit = this.dead.hit(b.pos, dir, wall, false, b.hit);
        if (hit) {
          b.hit.add(hit.z);
          const travelled = b.gone + hit.t, damage = this.harm(b.G, b.slotId, hit.part, travelled);
          const killed = this.dead.hurt(hit.z, damage, hit.part, dir, b.knock);
          this.bits.blood(hit.point, dir, killed ? (hit.part === 'head' ? 26 : 14) : 6, hit.part === 'head' && killed);
          if (killed) this.bits.gibs(hit.z.hip, dir, hit.part === 'head' ? 14 : 9, hit.part === 'head' ? hit.z.head : null);
          events.push({ type: killed ? 'kill' : 'hit', z: hit.z, part: hit.part, point: hit.point.clone() });
          this.lastEnd = hit.point;
          if (b.pierce-- <= 0) { b.alive = false; break; }
          b.gone += hit.t + 0.05; left -= hit.t + 0.05;
          b.pos.copy(hit.point).addScaledVector(dir, 0.05);
          continue;
        }
        if (wall < left) { this.bits.sparks(sc.copy(b.pos).addScaledVector(dir, wall), dir); events.push({ type: 'wall', point: sc.clone() }); b.alive = false; this.lastEnd = b.pos.clone().addScaledVector(dir, wall); break; }
        b.pos.addScaledVector(dir, left); b.gone += left; left = 0;
      }
      if (!b.alive) continue;
      // Drawn: a streak behind where it is, no longer than the way it has come.
      const len = Math.min(1.8, b.gone + 0.3);
      q.setFromUnitVectors(Z, dir);
      this.bulletMesh.setMatrixAt(n++, m.compose(at2.copy(b.pos).addScaledVector(dir, -len / 2), q, sc.set(1, 1, len / 1.8)));
    }
    this.bulletMesh.count = n;
    this.bulletMesh.instanceMatrix.needsUpdate = true;
    this.bulletMesh.material.color.set(this.golden ? 0xffc233 : 0xffd9a0);
  }

  // The Longshot: a round that goes through everything in line, at once.
  fireBeam(G, slot, from, d, events) {
    const wall = this.station.ray(from, d, RANGE), skip = new Set();
    for (let guard = 0; guard < 12; guard++) {
      const hit = this.dead.hit(from, d, wall, false, skip);
      if (!hit) break;
      skip.add(hit.z);
      const killed = this.dead.hurt(hit.z, this.harm(G, slot.id, hit.part, hit.t), hit.part, d, G.knock);
      this.bits.blood(hit.point, d, killed ? 20 : 8, hit.part === 'head' && killed);
      if (killed) this.bits.gibs(hit.z.hip, d, hit.part === 'head' ? 14 : 9, hit.part === 'head' ? hit.z.head : null);
      events.push({ type: killed ? 'kill' : 'hit', z: hit.z, part: hit.part, point: hit.point.clone() });
    }
    const end = from.clone().addScaledVector(d, wall);
    if (wall < RANGE) { this.bits.sparks(end, d); events.push({ type: 'wall', point: end.clone() }); }
    this.beam.position.copy(from);
    this.beam.lookAt(end);
    this.beam.scale.set(1, 1, from.distanceTo(end));
    this.beamLeft = 0.09;
    this.beam.visible = true;
    this.lastEnd = end;
  }

  // The melee: F starts the swing (the clip, the sound); MELEE.lands later, whatever is within reach and roughly
  // ahead of you is hit hard and thrown back.
  strike(events) {
    const w = this.walker;
    this.meleeCool = MELEE.every;
    this.cool = Math.max(this.cool, 0.3);
    w.lunge = 1;
    w.meleeT = 0;
    w.model.recoil = 0.9;
    this.strikeIn = MELEE.lands;
    events.push({ type: 'swing', hit: false });
  }
  land(events) {
    const w = this.walker;
    const look = w.lookDir, from = w.pos, near = [];
    for (const z of this.dead.list) {
      if (z.hp <= 0 || z.state === 'dead') continue;
      dir.subVectors(z.pos, from).setY(0);
      const d = dir.length();
      if (d > MELEE.reach + (z.K.radius || 0.34) || d < 1e-3) continue;
      dir.divideScalar(d);
      if (dir.x * look.x + dir.z * look.z < MELEE.arc) continue;
      near.push({ z, d, dx: dir.x, dz: dir.z });
    }
    near.sort((a, b) => a.d - b.d);
    for (const { z, dx, dz } of near.slice(0, MELEE.most)) {
      dir.set(dx, 0, dz);
      const killed = this.dead.hurt(z, MELEE.damage * this.mods.damage * (this.golden ? 3 : 1) * (this.bonus || 1) * (this.chicken ? 1.6 : 1), 'body', dir, MELEE.knock * (this.chicken ? 1.8 : 1));
      this.bits.blood(z.hip.clone(), dir, killed ? 14 : 8, false);
      if (killed) this.bits.gibs(z.hip, dir, 9, null);
      events.push({ type: killed ? 'kill' : 'hit', z, part: 'body', point: z.hip.clone(), melee: true });
    }
  }
}

// Little things that fly: sparks (bright, quick, gone), blood (dark, heavier, and it stays where it lands), and the
// bits of them that come off when one dies (chunks, as the game's monsters burst).
class Bits {
  constructor(scene) {
    this.sparks_ = Array.from({ length: 120 }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3() }));
    this.drops = Array.from({ length: 260 }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), s: 1 }));
    this.pools = Array.from({ length: 90 }, () => ({ life: 0, p: new THREE.Vector3(), s: 1, a: 0 }));
    this.chunks = Array.from({ length: 160 }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), w: new THREE.Vector3(), s: 1 }));
    this.nextChunk = 0;
    this.sparkMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.014, 0.014, 0.09), new THREE.MeshBasicMaterial({ color: 0xffd08a, toneMapped: false }), this.sparks_.length);
    this.dropMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.011, 6, 4).scale(1, 1, 3.2), new THREE.MeshStandardMaterial({ color: 0x240101, roughness: 0.3, metalness: 0.15 }), this.drops.length);
    this.poolMesh = new THREE.InstancedMesh(splatGeometry(), new THREE.MeshStandardMaterial({ color: 0x2a0202, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.92, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), this.pools.length);
    this.chunkMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.11, 0.09, 0.13), new THREE.MeshStandardMaterial({ color: 0x4a3a30, roughness: 0.9 }), this.chunks.length);
    for (const mesh of [this.sparkMesh, this.dropMesh, this.poolMesh, this.chunkMesh]) { mesh.frustumCulled = false; mesh.count = 0; scene.add(mesh); }
    this.poolMesh.receiveShadow = true;
    this.chunkMesh.castShadow = true;
    this.nextPool = 0;
  }
  sparks(at, dir) {
    let n = 7;
    for (const s of this.sparks_) {
      if (s.life > 0) continue;
      s.life = 0.15 + Math.random() * 0.25;
      s.p.copy(at).addScaledVector(dir, -0.04);
      s.v.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).multiplyScalar(7).addScaledVector(dir, -4);
      if (--n === 0) break;
    }
  }
  blood(at, dir, n, gush = false) {
    for (const d of this.drops) {
      if (d.life > 0) continue;
      d.life = 2;
      d.p.copy(at);
      d.v.set(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).multiplyScalar(gush ? 4.5 : 2.6).addScaledVector(dir, 2.5 + Math.random() * 2);
      if (gush) d.v.y += 2.5;
      d.s = 0.6 + Math.random() * (gush ? 1.6 : 1);
      if (--n <= 0) break;
    }
  }
  // Chunks of one, thrown the way the shot went (from the head, if that is what went).
  gibs(at, dir, n, head = null) {
    for (let k = 0; k < n; k++) {
      const g = this.chunks[this.nextChunk++ % this.chunks.length];
      g.life = 0.6 + Math.random() * 0.6;
      g.p.copy(head && k < n / 2 ? head : at).add(sc.set((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.3));
      g.v.set((Math.random() - 0.5) * 6 + dir.x * 4, 2 + Math.random() * 4, (Math.random() - 0.5) * 6 + dir.z * 4);
      g.w.set(Math.random() * 14 - 7, Math.random() * 14 - 7, Math.random() * 14 - 7);
      g.s = 0.5 + Math.random() * 0.9;
    }
  }
  pool(at, size) {
    const p = this.pools[this.nextPool++ % this.pools.length];
    p.life = 40; p.p.set(at.x, 0.012 + (this.nextPool % 7) * 0.0015, at.z); p.s = size; p.a = Math.random() * Math.PI * 2;
  }
  update(dt) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), fwd = new THREE.Vector3(0, 0, 1);
    let n = 0;
    for (const p of this.sparks_) {
      if (p.life <= 0) continue;
      p.life -= dt; p.v.y -= 14 * dt; p.p.addScaledVector(p.v, dt);
      if (p.p.y < 0) { p.p.y = 0; p.v.y *= -0.4; }
      q.setFromUnitVectors(fwd, s.copy(p.v).normalize());
      this.sparkMesh.setMatrixAt(n++, m.compose(p.p, q, s.setScalar(Math.min(1, p.life * 6))));
    }
    this.sparkMesh.count = n; this.sparkMesh.instanceMatrix.needsUpdate = true;
    n = 0;
    for (const d of this.drops) {
      if (d.life <= 0) continue;
      d.life -= dt; d.v.y -= 11 * dt; d.p.addScaledVector(d.v, dt);
      if (d.p.y <= 0.01) { if (Math.random() < 0.35) this.pool(d.p, 0.12 + d.s * 0.18); d.life = 0; continue; }
      q.setFromUnitVectors(fwd, s.copy(d.v).normalize());   // (drawn out along the way it is flying)
      this.dropMesh.setMatrixAt(n++, m.compose(d.p, q, s.setScalar(d.s)));
    }
    this.dropMesh.count = n; this.dropMesh.instanceMatrix.needsUpdate = true;
    n = 0;
    for (const g of this.chunks) {
      if (g.life <= 0) continue;
      g.life -= dt; g.v.y -= 12 * dt; g.p.addScaledVector(g.v, dt);
      if (g.p.y < 0.05) { g.p.y = 0.05; g.v.y = Math.abs(g.v.y) > 1 ? -g.v.y * 0.3 : 0; g.v.x *= 0.6; g.v.z *= 0.6; g.w.multiplyScalar(0.5); if (Math.random() < 0.02) this.pool(g.p, 0.2 + g.s * 0.15); }
      q.setFromEuler(e.set(g.w.x * g.life, g.w.y * g.life, g.w.z * g.life));
      this.chunkMesh.setMatrixAt(n++, m.compose(g.p, q, s.setScalar(g.s * Math.min(1, g.life * 4))));
    }
    this.chunkMesh.count = n; this.chunkMesh.instanceMatrix.needsUpdate = true;
    n = 0;
    for (const p of this.pools) {
      if (p.life <= 0) continue;
      p.life -= dt;
      const grow = Math.min(1, (40 - p.life) * 3);
      this.poolMesh.setMatrixAt(n++, m.compose(p.p, q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, p.a), s.set(p.s * grow, 1, p.s * grow)));
    }
    this.poolMesh.count = n; this.poolMesh.instanceMatrix.needsUpdate = true;
  }
}

// A splash on the floor: a blob with a ragged edge.
function splatGeometry() {
  const n = 18, pts = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, r = 0.75 + Math.random() * 0.45; pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r)); }
  return new THREE.ShapeGeometry(new THREE.Shape(pts)).rotateX(-Math.PI / 2);
}

// The muzzle's flame: a soft star drawn once.
function flameTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,235,1)'); r.addColorStop(0.25, 'rgba(255,200,110,0.9)'); r.addColorStop(1, 'rgba(255,120,30,0)');
  g.fillStyle = r; g.beginPath(); g.arc(64, 64, 64, 0, Math.PI * 2); g.fill();
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3, len = 30 + ((i * 7) % 5) * 7;
    const t = g.createLinearGradient(64, 64, 64 + Math.cos(a) * len, 64 + Math.sin(a) * len);
    t.addColorStop(0, 'rgba(255,230,170,0.5)'); t.addColorStop(1, 'rgba(255,150,60,0)');
    g.strokeStyle = t; g.lineWidth = 9 - (i % 3) * 2; g.lineCap = 'round';
    g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.cos(a) * len, 64 + Math.sin(a) * len); g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
