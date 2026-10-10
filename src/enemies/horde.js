// The horde: a survivors-style spawn director plus the monsters themselves.
//
// There are no discrete rounds. Monsters keep clawing out of the ground in a
// ring around you (mostly ahead of where you're going) and chase you. Every
// `waveLength` seconds the wave number ticks up: more of them, tougher, and
// faster types join in. On top of that come timed events: a swarm that rings
// you in, and an elite. Outrun them and the stragglers are quietly recycled
// into fresh spawns ahead, so you are never alone for long.
import * as THREE from 'three';
import { config } from '../config.js';
import { heightAt, groundAt } from '../world/terrain.js';
import { stats } from '../player/stats.js';
import { ENEMY_TYPES } from './types.js';
import { ENEMY_PARTS } from './enemyModels.js';

const MAX = 320;          // hard cap on monsters alive (and instances per type)
const CELL = 2.5;         // spatial hash cell size
const CLIMB = 1.3;        // monsters step up anything lower than this
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e3 = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
const limb = new THREE.Matrix4(), out = new THREE.Matrix4();
const WHITE = new THREE.Color(1, 1, 1), HURT = new THREE.Color(3, 0.6, 0.5), ELITE = new THREE.Color(1.5, 0.75, 0.7);
const cellKey = (x, z) => Math.floor(x / CELL) * 73856093 ^ Math.floor(z / CELL) * 19349663;

export class Horde {
  constructor(scene) {
    this.enemies = [];
    this.grid = new Map();
    this.events = [];   // { type: 'wave' | 'swarm' | 'elite' | 'kill' | 'hit', ... } drained by main.js

    // Each monster type is a few parts (body, arms, legs...), each one instanced mesh.
    this.meshes = {};
    for (const name of Object.keys(ENEMY_TYPES)) {
      const T = ENEMY_TYPES[name];
      const material = new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 0.85, emissive: T.emissive || 0, side: THREE.DoubleSide,
        transparent: !!T.opacity, opacity: T.opacity || 1,
      });
      const glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });   // eyes: lit from within
      this.meshes[name] = ENEMY_PARTS[name]().map((p) => {
        const mesh = new THREE.InstancedMesh(p.geometry, p.glow ? glow : material, MAX);
        mesh.castShadow = !p.glow;
        mesh.frustumCulled = false;
        mesh.count = 0;
        mesh.setColorAt(0, WHITE);
        scene.add(mesh);
        return { mesh, pivot: new THREE.Vector3(...p.pivot), swing: p.swing, phase: p.phase };
      });
    }

    // Chunks of monster that fly off when one dies.
    this.gibs = Array.from({ length: 300 }, () => ({ life: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3() }));
    this.gibMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), new THREE.MeshStandardMaterial({ color: 0x4d5a44, roughness: 1 }), this.gibs.length);
    this.gibMesh.frustumCulled = false;
    this.gibs.forEach((_, i) => this.gibMesh.setMatrixAt(i, HIDDEN));
    scene.add(this.gibMesh);
    this.nextGib = 0;

    // Shockwave ring (from the Shockwave Landing upgrade).
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 6, 48), new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, toneMapped: false }));
    this.ring.rotation.x = Math.PI / 2;
    this.ring.visible = false;
    this.ringLife = 0;
    scene.add(this.ring);

    this.reset();
  }

  reset() {
    this.enemies.length = 0;
    this.time = 0;
    this.wave = 1;
    this.kills = 0;
    this.score = 0;
    this.spawnDebt = 0;
    this.warnedWraiths = false;
    this.nextSwarm = config.horde.swarmEvery;
    this.nextElite = config.horde.eliteEvery;
    this.events.length = 0;
  }

  // ---- Director ----------------------------------------------------------------

  // Which monster comes out of the ground next.
  pickType() {
    const r = Math.random();
    const wraiths = this.wave >= 3 ? Math.min(0.3, 0.1 * (this.wave - 2)) : 0;   // ghosts from wave 3
    const rattlers = Math.min(0.45, 0.12 * (this.wave - 1));                     // none in wave 1, then more and more
    return r < wraiths ? 'wraith' : r < wraiths + rattlers ? 'rattler' : 'shambler';
  }

  // A spot `dist` away at `angle`, as long as it isn't inside a building.
  spawn(name, player, angle, dist, elite = false) {
    if (this.enemies.length >= MAX) return;
    const x = player.pos.x + Math.sin(angle) * dist, z = player.pos.z + Math.cos(angle) * dist;
    const y = heightAt(x, z);
    if (y - groundAt(x, z) > 2.5) return;
    const T = ENEMY_TYPES[name], tough = 1 + config.horde.hpGrowth * (this.wave - 1);
    this.enemies.push({
      name, T, x, y, z, elite,
      scale: elite ? 1.9 : 0.92 + Math.random() * 0.18,
      hp: T.hp * tough * (elite ? config.horde.eliteHp : 1),
      speed: T.speed * (0.85 + Math.random() * 0.3) * (elite ? 1.25 : 1),
      yaw: angle + Math.PI, rise: 0, flash: 0, kx: 0, kz: 0, ramWait: 0, phase: Math.random() * 6.28,
    });
  }

  direct(dt, player) {
    const H = config.horde;
    this.time += dt;

    const wave = 1 + Math.floor(this.time / H.waveLength);
    if (wave !== this.wave) {
      this.wave = wave;
      this.events.push({ type: 'wave', wave });
      // From wave 3, every new wave opens with a flight of ghosts (the crowd may
      // already be full, so they are sent in on top of it).
      const flight = wave >= 3 ? H.wraithFlight + 2 * (wave - 3) : 0;
      for (let i = 0; i < flight; i++) this.spawn('wraith', player, Math.random() * Math.PI * 2, H.spawnDistance * (0.8 + Math.random() * 0.4));
    }

    // Top the crowd up toward this wave's size, a few per second.
    const want = Math.min(H.maxAlive, H.baseAlive + H.alivePerWave * (wave - 1));
    if (this.enemies.length < want) this.spawnDebt += (H.baseSpawnRate + H.spawnRatePerWave * (wave - 1)) * dt;
    else this.spawnDebt = 0;
    // Moving fast? They come up ahead of you. Standing still? From all around.
    const heading = Math.atan2(player.vel.x, player.vel.z), fast = Math.min(1, player.speed / 15);
    while (this.spawnDebt >= 1) {
      this.spawnDebt -= 1;
      const spread = Math.PI * (1 - 0.6 * fast);
      this.spawn(this.pickType(), player, heading + (Math.random() - 0.5) * 2 * spread, H.spawnDistance * (0.8 + Math.random() * 0.5));
    }

    // Swarm: a closing ring.
    if (this.time >= this.nextSwarm) {
      this.nextSwarm += H.swarmEvery;
      const n = H.swarmSize + 4 * (wave - 1);
      for (let i = 0; i < n; i++) this.spawn(this.pickType(), player, (i / n) * Math.PI * 2, H.spawnDistance * 0.7);
      this.events.push({ type: 'swarm' });
    }
    // Elite: one big one.
    if (wave === 3 && !this.warnedWraiths) {
      this.warnedWraiths = true;
      this.events.push({ type: 'wraiths' });
    }
    if (this.time >= this.nextElite) {
      this.nextElite += H.eliteEvery;
      this.spawn('shambler', player, heading + (Math.random() - 0.5), H.spawnDistance, true);
      this.events.push({ type: 'elite' });
    }
  }

  // ---- Simulation ----------------------------------------------------------------

  // Returns the damage the player takes this frame (0 if nothing reached them).
  update(dt, player) {
    if (!config.horde.enabled) {
      if (this.enemies.length) this.enemies.length = 0;
      this.draw(dt);
      return 0;
    }
    this.direct(dt, player);

    // Bucket everyone for neighbour and bullet checks.
    this.grid.clear();
    for (const e of this.enemies) {
      const key = cellKey(e.x, e.z), cell = this.grid.get(key);
      if (cell) cell.push(e); else this.grid.set(key, [e]);
    }

    let damage = 0;
    const H = config.horde, px = player.pos.x, pz = player.pos.z;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      let dx = px - e.x, dz = pz - e.z;
      const dist = Math.hypot(dx, dz) || 1;

      // Left far behind: recycled (the director spawns a fresh one near you).
      if (dist > H.despawnDistance) {
        this.enemies[i] = this.enemies[this.enemies.length - 1];
        this.enemies.pop();
        continue;
      }
      e.flash = Math.max(0, e.flash - dt * 6);
      if (e.rise < 1) {   // still clawing out of the ground
        e.rise = Math.min(1, e.rise + dt / H.riseTime);
        continue;
      }

      // Chase the player, shoving away from the neighbours.
      dx /= dist; dz /= dist;
      const reach = e.T.radius * e.scale + H.contactRange;
      const advance = dist > reach * 0.8 ? e.speed : 0;   // stop at arm's length instead of walking through you
      let mx = dx * advance, mz = dz * advance;
      const cx = Math.floor(e.x / CELL), cz = Math.floor(e.z / CELL);
      for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
        const cell = this.grid.get((cx + ox) * 73856093 ^ (cz + oz) * 19349663);
        if (!cell) continue;
        for (const o of cell) {
          if (o === e) continue;
          const sx = e.x - o.x, sz = e.z - o.z, d = Math.hypot(sx, sz), min = (e.T.radius * e.scale + o.T.radius * o.scale);
          if (d < min && d > 1e-4) { mx += (sx / d) * (min - d) * 8; mz += (sz / d) * (min - d) * 8; }
        }
      }
      mx += e.kx; mz += e.kz;   // knockback from bullets
      e.kx *= Math.exp(-8 * dt); e.kz *= Math.exp(-8 * dt);

      const nx = e.x + mx * dt, nz = e.z + mz * dt;
      if (e.T.flying) {
        // Fliers go straight over everything, and climb or dive to the player's height.
        e.x = nx; e.z = nz;
      } else if (heightAt(nx, nz) - e.y < CLIMB) { e.x = nx; e.z = nz; }   // walk over low things...
      else if (heightAt(nx, e.z) - e.y < CLIMB) e.x = nx;                  // ...slide round tall ones
      else if (heightAt(e.x, nz) - e.y < CLIMB) e.z = nz;
      else { e.x -= dz * e.speed * dt; e.z += dx * e.speed * dt; }         // boxed in: sidestep
      // The crowd can't shove anyone into the exact spot the player is standing on.
      const ox = e.x - px, oz = e.z - pz, od = Math.hypot(ox, oz);
      if (od < 0.75 && od > 1e-4) { e.x = px + (ox / od) * 0.75; e.z = pz + (oz / od) * 0.75; }
      const ground = heightAt(e.x, e.z);
      if (e.T.flying) {
        // Cruise overhead while far away; come down (or up!) to you when close.
        const cruise = Math.max(player.pos.y + 0.4, ground + 3.5);
        const wantY = Math.max(ground + 0.3, dist < 18 ? player.pos.y + 0.2 : cruise);
        e.y += Math.max(-e.T.climb * dt, Math.min(e.T.climb * dt, wantY - e.y));
      } else e.y = ground;

      const want = Math.atan2(dx, dz);
      e.yaw += Math.atan2(Math.sin(want - e.yaw), Math.cos(want - e.yaw)) * Math.min(1, 8 * dt);

      // Close enough to claw the player?
      e.ramWait -= dt;
      if (dist < reach && Math.abs(player.pos.y - e.y) < e.T.height * e.scale) {
        if (stats.ramDamage > 0 && player.speed > H.ramSpeed) {
          // Deck Spikes: at speed, you run them down instead.
          if (e.ramWait <= 0) {
            e.ramWait = 0.3;
            this.damage(e, stats.ramDamage, -dx, -dz);
          }
        } else damage = Math.max(damage, e.T.damage * (e.elite ? H.eliteDamage : 1) * (1 + H.damageGrowth * (this.wave - 1)));
      }
    }

    this.draw(dt);
    return damage;
  }

  // ---- Getting shot ---------------------------------------------------------------

  // The monster (if any) a bullet at point p has hit.
  hitTest(p) {
    const cx = Math.floor(p.x / CELL), cz = Math.floor(p.z / CELL);
    for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
      const cell = this.grid.get((cx + ox) * 73856093 ^ (cz + oz) * 19349663);
      if (!cell) continue;
      for (const e of cell) {
        if (e.hp <= 0 || p.y < e.y || p.y > e.y + e.T.height * e.scale) continue;
        const r = e.T.radius * e.scale + 0.15;
        if ((p.x - e.x) ** 2 + (p.z - e.z) ** 2 < r * r) return e;
      }
    }
    return null;
  }

  damage(e, amount, dirX, dirZ, headshot = false, knock = 1) {
    e.hp -= amount;
    e.flash = 1;
    const push = (e.elite ? 1.5 : 6) * knock;
    e.kx += dirX * push; e.kz += dirZ * push;
    if (e.hp > 0) {
      this.events.push({ type: 'hit', headshot });
      return;
    }
    const i = this.enemies.indexOf(e);
    if (i >= 0) { this.enemies[i] = this.enemies[this.enemies.length - 1]; this.enemies.pop(); }
    this.kills++;
    this.score += e.T.score * (e.elite ? 10 : 1);
    this.events.push({ type: 'kill', elite: e.elite, headshot, score: e.T.score, x: e.x, y: e.T.flying ? heightAt(e.x, e.z) : e.y, z: e.z, xp: e.T.xp * (e.elite ? 15 : 1) });
    for (let k = 0; k < (e.elite ? 30 : 9); k++) {
      const g = this.gibs[this.nextGib++ % this.gibs.length];
      g.life = 0.5 + Math.random() * 0.5;
      g.pos.set(e.x, e.y + 0.4 + Math.random() * 1.2 * e.scale, e.z);
      g.vel.set((Math.random() - 0.5) * 7 + dirX * 5, 2 + Math.random() * 5, (Math.random() - 0.5) * 7 + dirZ * 5);
    }
  }

  // Damages every monster within `radius` of a point (Shockwave Landing).
  shockwave(pos, radius, amount) {
    for (const e of [...this.enemies]) {
      const dx = e.x - pos.x, dz = e.z - pos.z, d = Math.hypot(dx, dz);
      if (d < radius && Math.abs(e.y - pos.y) < 4) this.damage(e, amount, dx / (d || 1), dz / (d || 1));
    }
    this.ring.position.set(pos.x, pos.y + 0.3, pos.z);
    this.ring.userData.radius = radius;
    this.ringLife = 1;
    this.ring.visible = true;
  }

  // Aim assist: the monster closest to the line of fire, within `degrees` of it.
  // Writes its chest position into `out` and returns true if there is one.
  assist(origin, dir, degrees, out) {
    let best = Math.cos((degrees * Math.PI) / 180), found = false;
    for (const e of this.enemies) {
      if (e.rise < 0.6) continue;
      const tall = e.T.height * e.scale;
      v.set(e.x - origin.x, e.y + tall * 0.6 - origin.y, e.z - origin.z);
      const d = v.length();
      if (d > 140 || d < 1) continue;
      const cos = v.dot(dir) / d;
      if (cos > best) {
        best = cos;
        // Pull the shot onto the monster sideways, but keep the height you were
        // aiming at (within its body), so headshots stay yours to earn.
        const aimedY = origin.y + dir.y * d;
        out.set(e.x, Math.max(e.y + tall * 0.15, Math.min(e.y + tall * 0.97, aimedY)), e.z);
        found = true;
      }
    }
    return found;
  }

  // ---- Drawing ---------------------------------------------------------------------

  draw(dt) {
    const counts = {};
    for (const name in this.meshes) counts[name] = 0;
    for (const e of this.enemies) {
      const parts = this.meshes[e.name], i = counts[e.name]++;
      const walk = this.time * e.speed * e.T.stride + e.phase;
      // Lurching walk (fliers lean into the chase and bob); sinking below ground while still rising.
      e3.set(e.T.flying ? 0.45 : 0.12, e.yaw, Math.sin(walk) * e.T.sway);
      const bob = e.T.flying ? Math.sin(this.time * 3 + e.phase) * 0.2 : Math.abs(Math.sin(walk)) * 0.06;
      v.set(e.x, e.y - (1 - e.rise) * e.T.height * e.scale + bob, e.z);
      m.compose(v, q.setFromEuler(e3), sc.setScalar(e.scale));
      const color = e.flash > 0 ? HURT : e.elite ? ELITE : WHITE;
      // Each part hangs off the body at its pivot and swings with the stride
      // (not while still climbing out of the ground).
      const moving = e.rise >= 1 ? 1 : 0.25;
      for (const p of parts) {
        const s = Math.sin(walk + p.phase) * moving;
        limb.makeRotationFromEuler(e3.set(p.swing[0] * s, p.swing[1] * s, p.swing[2] * s)).setPosition(p.pivot);
        p.mesh.setMatrixAt(i, out.multiplyMatrices(m, limb));
        p.mesh.setColorAt(i, color);
      }
    }
    for (const name in this.meshes) {
      for (const { mesh } of this.meshes[name]) {
        mesh.count = counts[name];
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    }

    this.gibs.forEach((g, i) => {
      if (g.life <= 0) return;
      g.life -= dt;
      g.vel.y -= 22 * dt;
      g.pos.addScaledVector(g.vel, dt);
      this.gibMesh.setMatrixAt(i, g.life > 0 ? m.makeTranslation(g.pos.x, g.pos.y, g.pos.z) : HIDDEN);
    });
    this.gibMesh.instanceMatrix.needsUpdate = true;

    if (this.ringLife > 0) {
      this.ringLife -= dt * 3;
      this.ring.scale.setScalar(this.ring.userData.radius * (1 - Math.max(0, this.ringLife) ** 2));
      this.ring.material.opacity = Math.max(0, this.ringLife);
      this.ring.visible = this.ringLife > 0;
    }
  }
}
