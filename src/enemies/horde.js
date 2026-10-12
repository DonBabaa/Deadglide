// The horde: a survivors-style spawn director plus the monsters themselves.
//
// There are no discrete rounds. Monsters keep clawing out of the ground in a
// ring around you (mostly ahead of where you're going) and chase you. Every
// `waveLength` seconds the wave number ticks up: more of them, tougher, and
// faster types join in. On top of that come timed events: a swarm that rings
// you in, and an elite. Outrun them and the stragglers are quietly recycled
// into fresh spawns ahead, so you are never alone for long.
//
// When wave `bossWave` starts, the final boss arrives and throws filth at you
// from range. Kill him and the monsters near you die with him, an exit portal
// opens some way off (main.js draws it) and overtime starts: the portal stays
// open, and monsters pour out of the ground exponentially faster until you
// leave through it or they get you.
import * as THREE from 'three';
import { config } from '../config.js';
import { heightAt, groundAt, placeAt, confineX, airFloorAt, onPipe, pipeS, pipeRound, hasPipe, lapNear } from '../world/terrain.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { world } from '../world/level.js';
import { HOUSE, houseSpot } from '../world/house.js';
import { stats } from '../player/stats.js';
import { ENEMY_TYPES } from './types.js';
import { ramSpeed } from '../systems/upgrades.js';
import { ENEMY_PARTS, ENEMY_LITE } from './enemyModels.js';

const NEAR = 13, NEAR_MOST = 10;   // a monster this close to the camera (m) is drawn in detail: at most this many of a kind at once
const MAX = 320;          // hard cap on monsters alive (and instances per type)
const CELL = 2.5;         // spatial hash cell size
const CLIMB = 1.3;        // monsters step up anything lower than this
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e3 = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
const limb = new THREE.Matrix4(), out = new THREE.Matrix4();
const WHITE = new THREE.Color(1, 1, 1), HURT = new THREE.Color(3, 0.6, 0.5), ELITE = new THREE.Color(1.5, 0.75, 0.7);
const ABLAZE = new THREE.Color(2.4, 1.0, 0.3), FROZEN = new THREE.Color(0.55, 0.95, 1.9);   // tints: on fire, chilled
const BLOB_GRAVITY = 20;
const tint = new THREE.Color();
const BROWN = new THREE.Color(0x5a3416), BONE = new THREE.Color(0xd8d2bf);
const spot = { x: 0, y: 0, nx: 0, ny: 1 };   // (scratch: a place on the pipe)
const bx = new THREE.Vector3(), by = new THREE.Vector3(), bz = new THREE.Vector3(), basis = new THREE.Matrix4();
// A spider's web, seen from above: spokes and rings in white on nothing.
function webTexture() {
  const c = Object.assign(document.createElement('canvas'), { width: 256, height: 256 }), g = c.getContext('2d'), N = 11;
  g.translate(128, 128);
  g.strokeStyle = 'rgba(240, 240, 235, 0.95)';
  g.fillStyle = 'rgba(230, 230, 225, 0.16)';
  g.beginPath(); g.arc(0, 0, 122, 0, Math.PI * 2); g.fill();
  g.lineWidth = 2.5;
  for (let k = 0; k < N; k++) { const a = (k / N) * Math.PI * 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * 124, Math.sin(a) * 124); g.stroke(); }
  g.lineWidth = 1.8;
  for (let r = 18; r < 124; r += 17) {
    g.beginPath();
    for (let k = 0; k <= N; k++) {   // each ring sags between the spokes
      const a = (k / N) * Math.PI * 2, mid = ((k - 0.5) / N) * Math.PI * 2;
      if (k === 0) g.moveTo(r, 0); else g.quadraticCurveTo(Math.cos(mid) * r * 0.86, Math.sin(mid) * r * 0.86, Math.cos(a) * r, Math.sin(a) * r);
    }
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const cellKey = (x, z) => Math.floor(x / CELL) * 73856093 ^ Math.floor(z / CELL) * 19349663;

export class Horde {
  constructor(scene) {
    this.enemies = [];
    this.grid = new Map();
    this.events = [];   // { type: 'wave' | 'swarm' | 'elite' | 'kill' | 'hit' | 'boss' | 'bossDead', ... } drained by main.js

    // Each monster type is a few parts (body, arms, legs...), each one instanced mesh.
    this.meshes = {};
    this.fine = {};
    this.eye = new THREE.Vector3();   // where they are being looked at from (main.js keeps it up to date): what is near it is drawn in detail
    for (const name of Object.keys(ENEMY_TYPES)) {
      const T = ENEMY_TYPES[name];
      const material = new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 0.85, emissive: T.emissive || 0, side: THREE.DoubleSide,
        transparent: !!T.opacity, opacity: T.opacity || 1,
      });
      const glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });   // eyes: lit from within
      const build = (parts, most) => parts.map((p) => {
        const mesh = new THREE.InstancedMesh(p.geometry, p.glow ? glow : material, most);
        mesh.castShadow = !p.glow;
        mesh.frustumCulled = false;
        mesh.count = 0;
        mesh.setColorAt(0, WHITE);
        scene.add(mesh);
        return { mesh, pivot: new THREE.Vector3(...p.pivot), swing: p.swing, phase: p.phase };
      });
      // A monster with a plain version (ENEMY_LITE) is drawn in detail only when it is close: at most NEAR_MOST of them
      // at once. `meshes` is what the rest are drawn with; `fine` is the detailed set.
      const lite = ENEMY_LITE[name];
      this.meshes[name] = build(lite ? lite() : ENEMY_PARTS[name](), T.boss || T.miniboss ? 1 : MAX);
      if (lite) this.fine[name] = build(ENEMY_PARTS[name](), NEAR_MOST);
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

    // What the boss throws, and the puddles it leaves.
    this.blobs = Array.from({ length: 40 }, () => ({ life: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3(), spin: 0 }));
    this.blobMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.6, 1), new THREE.MeshStandardMaterial({ roughness: 0.4 }), this.blobs.length);
    this.blobMesh.frustumCulled = false;
    this.blobMesh.castShadow = true;
    this.splats = Array.from({ length: 30 }, () => ({ life: 0, x: 0, y: 0, z: 0, size: 1 }));
    this.splatMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x35170b, transparent: true, opacity: 0.85, depthWrite: false }), this.splats.length);
    this.splatMesh.frustumCulled = false;
    this.blobs.forEach((_, i) => { this.blobMesh.setMatrixAt(i, HIDDEN); this.blobMesh.setColorAt(i, BROWN); });
    this.splats.forEach((_, i) => this.splatMesh.setMatrixAt(i, HIDDEN));
    // Bones (what level 2's boss and the bone-throwers throw): the same things in flight, drawn as a tumbling femur.
    const knob = (x, y) => new THREE.SphereGeometry(0.17, 8, 6).translate(x, y, 0);
    this.boneMesh = new THREE.InstancedMesh(
      mergeGeometries([new THREE.CylinderGeometry(0.09, 0.09, 1.5, 8), knob(-0.1, 0.75), knob(0.1, 0.75), knob(-0.1, -0.75), knob(0.1, -0.75)]),
      new THREE.MeshStandardMaterial({ color: 0xd8d2bf, roughness: 0.6 }), this.blobs.length);
    this.boneMesh.frustumCulled = false;
    this.boneMesh.castShadow = true;
    this.blobs.forEach((_, i) => this.boneMesh.setMatrixAt(i, HIDDEN));
    // What Babitus throws: playing cards, and casino chips.
    this.cardMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 0.05, 1.6), new THREE.MeshStandardMaterial({ color: 0xf7f3ea, roughness: 0.5, emissive: 0x3a3832 }), this.blobs.length);
    this.chipMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.75, 0.75, 0.2, 14), new THREE.MeshStandardMaterial({ color: 0xffc233, roughness: 0.35, emissive: 0x4a3200 }), this.blobs.length);
    for (const mesh of [this.cardMesh, this.chipMesh]) {
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      this.blobs.forEach((_, i) => mesh.setMatrixAt(i, HIDDEN));
      scene.add(mesh);
    }
    this.bossVariant = '';      // which Babitus turns up ('', 'b', 'c' or 'd': how much gold he is wearing; main.js sets it)
    // Webs left on the floor by the Spider Queen.
    this.webs = Array.from({ length: 24 }, () => ({ life: 0, x: 0, y: 0, z: 0, r: 1, turn: 0 }));
    this.webMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: webTexture(), transparent: true, depthWrite: false, toneMapped: false }), this.webs.length);
    this.webMesh.frustumCulled = false;
    this.webs.forEach((_, i) => this.webMesh.setMatrixAt(i, HIDDEN));
    this.nextWeb = 0;
    scene.add(this.blobMesh, this.splatMesh, this.boneMesh, this.webMesh);
    this.nextBlob = this.nextSplat = 0;

    this.reset();
  }

  reset() {
    this.enemies.length = 0;
    this.boss = null;           // the final boss, while he's alive
    this.corpse = null;         // ...and his body while he dies (the cutscene animates it: see cutscenes.js)
    this.bossSpawned = false;
    this.mini = null;           // the mini-boss (level 2's Spider Queen), while she's alive
    this.miniSpawned = false;
    this.webbedAt = -9;
    if (this.webs) for (const w of this.webs) w.life = 0;
    this.finished = false;      // true once the boss is dead: overtime
    this.overtime = 0;          // seconds of it so far
    for (const b of this.blobs) b.life = 0;
    for (const sp of this.splats) sp.life = 0;
    this.gibs.forEach((g, i) => { g.life = 0; this.gibMesh.setMatrixAt(i, HIDDEN); });
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
    const H = config.horde;
    if (world.level === 2) {   // the Catacombs' own: rats and crawlers from the start, then skeletons, bone-throwers, and ghosts last
      const wraith = this.wave >= H.wraithWave ? 0.12 : 0, thrower = this.wave >= 3 ? 0.12 : 0, rattler = this.wave >= 2 ? 0.15 : 0;
      return r < wraith ? 'wraith' : r < wraith + thrower ? 'thrower' : r < wraith + thrower + rattler ? 'rattler' : r < wraith + thrower + rattler + 0.28 ? 'rat' : 'crawler';
    }
    const wraiths = this.wave >= H.wraithWave ? Math.min(0.3, 0.1 * (this.wave - H.wraithWave + 1)) : 0;       // ghosts come late...
    const rattlers = this.wave >= H.rattlerWave ? Math.min(0.45, 0.15 * (this.wave - H.rattlerWave + 1)) : 0;   // ...skeletons a little earlier
    return r < wraiths ? 'wraith' : r < wraiths + rattlers ? 'rattler' : 'shambler';
  }

  // A spot `dist` away at `angle`, as long as it isn't inside a building.
  spawn(name, player, angle, dist, elite = false) {
    if (this.enemies.length >= MAX) return;
    const [x, z] = placeAt(player.pos.x, player.pos.z, angle, dist), pack = elite ? 1 : ENEMY_TYPES[name].pack || 1;
    for (let k = 0; k < pack; k++) this.spawnAt(name, x + (k ? (Math.random() - 0.5) * 3 : 0), z + (k ? (Math.random() - 0.5) * 4 : 0), angle + Math.PI, elite);
  }
  spawnAt(name, x, z, yaw = 0, elite = false) {
    if (this.enemies.length >= MAX) return;
    const y = heightAt(x, z);
    if (y - groundAt(x, z) > 2.5) return;
    const T = ENEMY_TYPES[name], tough = 1 + config.horde.hpGrowth * (this.wave - 1);
    this.enemies.push({
      name, T, x, y, z, elite,
      scale: (elite ? 1.9 : 0.92 + Math.random() * 0.18) * config.horde.mobScale,
      hp: T.hp * tough * (elite ? config.horde.eliteHp : 1),
      speed: T.speed * (0.85 + Math.random() * 0.3) * (elite ? 1.25 : 1),
      yaw, rise: 0, flash: 0, kx: 0, kz: 0, ramWait: 0, phase: Math.random() * 6.28,
    });
    // One that climbs: put it on the pipe. Crawlers often start out on the roof (they're already up: nothing to claw out of).
    if (T.climbs && hasPipe()) {
      const e = this.enemies[this.enemies.length - 1];
      Object.assign(e, { s: pipeS(e.x, e.y, e.z), nx: 0, ny: 1, fs: 0, fz: 1, fall: false, vy: 0, throwTimer: 1 + Math.random() * 2 });
      if (T.drops && !elite && Math.random() < 0.5) {
        const half = pipeRound(z) / 2;
        e.s = (Math.random() < 0.5 ? -1 : 1) * (half - Math.random() * 4);
        onPipe(e.s, z, spot);
        Object.assign(e, { x: spot.x, y: spot.y, nx: spot.nx, ny: spot.ny, rise: 1 });
      }
    }
  }

  // The final boss claws his way up ahead of you.
  spawnBoss(player) {
    const house = world.level === 4;
    const name = house ? `boss3${this.bossVariant}` : world.level === 2 ? 'boss2' : 'boss';   // each level has its own
    const T = ENEMY_TYPES[name], heading = Math.atan2(player.vel.x, player.vel.z), hp = config.horde.bossHp * (T.hpScale || 1);
    // What he throws, in his colours.
    this.bossTint = new THREE.Color(T.blob ?? 0x5a3418);
    this.blobs.forEach((_, i) => this.blobMesh.setColorAt(i, this.bossTint));
    this.blobMesh.instanceColor.needsUpdate = true;
    this.splatMesh.material.color.set(T.splat ?? 0x35170b);
    const spot = houseSpot([HOUSE.boss.x, HOUSE.boss.z]);
    const [x, z] = house ? [spot.x, spot.z] : placeAt(player.pos.x, player.pos.z, heading, 55);   // (in the House he is waiting at the far end)
    this.boss = {
      name, T, x, y: heightAt(x, z), z, elite: false, scale: T.scale,
      hp, maxHp: hp, speed: T.speed, shedAt: T.shed ? 1 - T.shed.every : -1,
      yaw: house ? Math.atan2(player.pos.x - x, player.pos.z - z) : heading + Math.PI, rise: 0, flash: 0, kx: 0, kz: 0, ramWait: 0, phase: 0, throwTimer: 2,
      wheel: 3, call: null, adds: 6,
    };
    this.enemies.push(this.boss);
    this.bossSpawned = true;
    this.events.push({ type: 'boss', name: T.title });
  }

  direct(dt, player) {
    const H = config.horde;
    this.time += dt;
    if (world.level === 4) {   // the House: no waves. He is there when you arrive, and when he is dead it is over.
      if (!this.bossSpawned && this.time > 0.5 && player.grounded) this.spawnBoss(player);   // (once you have landed)
      return;
    }
    if (this.finished) {
      // Overtime: the spawn rate doubles and doubles again, they get tougher, and they come up closer to you.
      this.overtime += dt;
      const wave = H.bossWave + Math.floor(this.overtime / H.overtimeWave);
      if (wave !== this.wave) {
        this.wave = wave;
        this.events.push({ type: 'wave', wave });
      }
      const close = 1 - 0.45 * (1 - Math.exp(-this.overtime / 40)), heading = Math.atan2(player.vel.x, player.vel.z);
      this.spawnDebt = Math.min(MAX, this.spawnDebt + H.overtimeSpawnRate * 2 ** (this.overtime / H.overtimeDoubling) * dt);
      while (this.spawnDebt >= 1 && this.enemies.length < MAX) {   // (only the hard cap holds them back now)
        this.spawnDebt -= 1;
        this.spawn(this.pickType(), player, heading + (Math.random() - 0.5) * Math.PI * 1.4, H.spawnDistance * close * (0.7 + Math.random() * 0.5));
      }
      return;
    }

    const wave = Math.min(H.bossWave, 1 + Math.floor(this.time / H.waveLength));   // the boss wave is the last
    if (wave !== this.wave) {
      this.wave = wave;
      this.events.push({ type: 'wave', wave });
      // Once the ghosts are out, every new wave opens with a flight of them (the
      // crowd may already be full, so they are sent in on top of it).
      const flight = wave >= H.wraithWave ? H.wraithFlight + 2 * (wave - H.wraithWave) : 0;
      for (let i = 0; i < flight; i++) this.spawn('wraith', player, Math.random() * Math.PI * 2, H.spawnDistance * (0.8 + Math.random() * 0.4));
      if (wave === H.rattlerWave) for (let i = 0; i < 6; i++) this.spawn('rattler', player, Math.random() * Math.PI * 2, H.spawnDistance);   // the skeletons' entrance
      if (world.level === 2 && wave >= H.miniWave && wave < H.bossWave && !this.miniSpawned) this.spawnMini(player);
      if (wave >= H.bossWave && !this.bossSpawned) this.spawnBoss(player);
    }

    // Top the crowd up toward this wave's size, a few per second (a thinner crowd while the boss is up).
    const want = Math.min(H.maxAlive, H.baseAlive + H.alivePerWave * (wave - 1)) * (this.boss ? H.bossCrowd : 1);
    if (this.enemies.length < want) this.spawnDebt += (H.baseSpawnRate + H.spawnRatePerWave * (wave - 1)) * dt;
    else this.spawnDebt = 0;
    // Moving fast? They come up ahead of you. Standing still? From all around.
    const heading = Math.atan2(player.vel.x, player.vel.z), fast = Math.min(1, player.speed / 15);
    while (this.spawnDebt >= 1) {
      this.spawnDebt -= 1;
      const spread = Math.PI * (1 - 0.6 * fast);
      this.spawn(this.pickType(), player, heading + (Math.random() - 0.5) * 2 * spread, H.spawnDistance * (0.8 + Math.random() * 0.5));
    }

    if (wave === H.wraithWave && !this.warnedWraiths) {
      this.warnedWraiths = true;
      this.events.push({ type: 'wraiths' });
    }
    if (this.bossSpawned) return;   // no swarms or elites during the boss fight

    // Swarm: a closing ring.
    if (this.time >= this.nextSwarm) {
      this.nextSwarm += H.swarmEvery;
      const n = H.swarmSize + 4 * (wave - 1);
      for (let i = 0; i < n; i++) this.spawn(this.pickType(), player, (i / n) * Math.PI * 2, H.spawnDistance * 0.7);
      this.events.push({ type: 'swarm' });
    }
    // Elite: one big one.
    if (this.time >= this.nextElite) {
      this.nextElite += H.eliteEvery;
      this.spawn(world.level === 2 ? 'crawler' : 'shambler', player, heading + (Math.random() - 0.5), H.spawnDistance, true);
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
    this.player = player;
    if (this.mini && (this.mini.dead || !this.enemies.includes(this.mini))) this.mini = null;
    this.playerS = hasPipe() ? pipeS(player.pos.x, player.pos.y, player.pos.z) : 0;   // where the player is round the pipe
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
      if (!e || e.dead) continue;   // (the boss died this frame and took the ones near you with him)
      if (e.chill > 0 && (e.chill -= dt) <= 0) e.speed = e.baseSpeed;   // thawed
      if (e.fire > 0) {   // burning
        e.fire -= dt;
        if ((e.fireTick -= dt) <= 0) {
          e.fireTick = 0.25;
          this.damage(e, e.fireDps * 0.25, 0, 0, false, 0, true);
          if (e.dead) continue;
        }
      }
      let dx = px - e.x, dz = pz - e.z;
      const dist = Math.hypot(dx, dz) || 1;

      // You can't lose the boss: leave him behind and he digs his way up ahead of you.
      if ((e.T.boss || e.T.miniboss) && !e.T.house && dist > H.despawnDistance) {
        const heading = Math.atan2(player.vel.x, player.vel.z);
        [e.x, e.z] = placeAt(px, pz, heading, 55);
        e.y = heightAt(e.x, e.z);
        e.rise = 0;
        if (e.s !== undefined) { e.s = pipeS(e.x, e.y, e.z); e.rise = 1; }   // (a climber just turns up)
        continue;
      }
      // Left far behind: recycled (the director spawns a fresh one near you).
      if (dist > H.despawnDistance && world.level !== 4) {
        this.enemies[i] = this.enemies[this.enemies.length - 1];
        this.enemies.pop();
        continue;
      }
      e.flash = Math.max(0, e.flash - dt * 6);
      if (e.rise < 1) {   // still clawing out of the ground
        e.rise = Math.min(1, e.rise + dt / (H.riseTime * (e.T.boss ? 4 : 1)));
        continue;
      }
      if (e.s !== undefined) {   // one that climbs: it has its own way of getting about
        damage = Math.max(damage, this.climb(e, player, dt));
        continue;
      }

      // The boss hurls a volley whenever you're in range, faster once he's badly hurt.
      if (e.T.house) this.houseBoss(e, player, dt);
      else if (e.T.boss && (e.throwTimer -= dt) <= 0 && dist < H.bossRange) {
        e.throwTimer = H.bossThrowEvery * (e.hp < e.maxHp * 0.4 ? 0.6 : 1);
        this.throwVolley(e, player, dist);
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
          if (o === e || e.T.boss) continue;   // (nobody shoves the boss)
          const sx = e.x - o.x, sz = e.z - o.z, d = Math.hypot(sx, sz), min = (e.T.radius * e.scale + o.T.radius * o.scale);
          if (d < min && d > 1e-4) { mx += (sx / d) * (min - d) * 8; mz += (sz / d) * (min - d) * 8; }
        }
      }
      mx += e.kx; mz += e.kz;   // knockback from bullets
      e.kx *= Math.exp(-8 * dt); e.kz *= Math.exp(-8 * dt);

      const nx = e.x + mx * dt, nz = e.z + mz * dt, climb = CLIMB * Math.max(1, e.scale * 0.7);   // big things step over more
      if (e.T.flying) {
        // Fliers go straight over everything, and climb or dive to the player's height.
        e.x = confineX(nx, nz); e.z = nz;
      } else if (heightAt(nx, nz) - e.y < climb) { e.x = nx; e.z = nz; }   // walk over low things...
      else if (heightAt(nx, e.z) - e.y < climb) e.x = nx;                  // ...slide round tall ones
      else if (heightAt(e.x, nz) - e.y < climb) e.z = nz;
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
        // Deck Spikes: at speed, you run them down instead. (Elites and the boss take the hit and still hurt you.)
        const ramming = stats.ramDamage > 0 && player.speed > ramSpeed(stats.taken.spikes);
        if (!ramming || e.elite || e.T.boss) damage = Math.max(damage, e.T.damage * (e.elite ? H.eliteDamage : 1) * (1 + H.damageGrowth * (this.wave - 1)));
        if (ramming && e.ramWait <= 0) {
          e.ramWait = 0.3;
          this.damage(e, stats.ramDamage, -dx, -dz);
        }
      }
    }

    damage = Math.max(damage, this.updateBlobs(dt, player), this.updateWebs(dt, player));
    this.draw(dt);
    return damage;
  }

  // ---- The ones that climb (the Catacombs) ------------------------------------------------
  // They live on the pipe's inside surface, at (s, z): s is how far round it they are from the middle of
  // the floor (see catacombs.js). They head for where you are on it by the shorter way round, so ride up
  // a wall and they follow you up it. Returns the damage this one does to the player this frame.
  climb(e, player, dt) {
    const H = config.horde, T = e.T, px = player.pos.x, py = player.pos.y, pz = player.pos.z;
    const reach = T.radius * e.scale + H.contactRange, tall = T.height * e.scale;
    const touching = () => Math.hypot(px - e.x - e.nx * tall * 0.4, py + 0.9 - e.y - e.ny * tall * 0.4, pz - e.z) < reach + 0.7;
    const hurts = () => {
      if (!touching()) return 0;
      // Deck Spikes: at speed, you run them down instead. (Elites still hurt you.)
      const ramming = stats.ramDamage > 0 && player.speed > ramSpeed(stats.taken.spikes);
      if (ramming && e.ramWait <= 0) { e.ramWait = 0.3; this.damage(e, stats.ramDamage, e.x - px, e.z - pz); }
      return ramming && !e.elite ? 0 : T.damage * (e.elite ? H.eliteDamage : 1) * (1 + H.damageGrowth * (this.wave - 1));
    };
    e.ramWait -= dt;

    // Let go of the roof: falling.
    if (e.fall) {
      e.vy -= 30 * dt;
      e.y += e.vy * dt;
      const ground = heightAt(e.x, e.z);
      if (e.y <= ground) { e.y = ground; e.fall = false; e.s = pipeS(e.x, e.y, e.z); }
      return hurts();
    }

    const round = pipeRound(e.z), half = round / 2;
    let ds = this.playerS - e.s;
    if (ds > half) ds -= round; else if (ds < -half) ds += round;   // the shorter way round
    const dz = pz - e.z, dist = Math.hypot(ds, dz) || 1;

    // Bone-throwers hold their distance and throw; everything else comes straight at you.
    let go = dist > reach * 0.8 ? e.speed : 0;
    const K = T.throws || T.webs;   // (the Spider Queen does the same, with webs)
    if (K) {
      go = dist > K.keep + 4 ? e.speed : dist < K.keep - 7 ? -e.speed * 0.8 : 0;
      if ((e.throwTimer -= dt) <= 0 && dist < K.range) { e.throwTimer = K.every * (0.8 + Math.random() * 0.4); if (T.webs) this.spit(e, player); else this.lob(e, player); }
    }
    let ms = (ds / dist) * go, mz = (dz / dist) * go;
    // Shove away from the neighbours (measured along the surface: tx, ty is the way +s runs here).
    const tx = e.ny, ty = -e.nx, cx = Math.floor(e.x / CELL), cz = Math.floor(e.z / CELL);
    for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
      const cell = this.grid.get((cx + ox) * 73856093 ^ (cz + oz) * 19349663);
      if (!cell) continue;
      for (const o of cell) {
        if (o === e || o.T.boss) continue;
        const sx = e.x - o.x, sy = e.y - o.y, sz = e.z - o.z, d = Math.hypot(sx, sy, sz), min = T.radius * e.scale + o.T.radius * o.scale;
        if (d < min && d > 1e-4) { ms += ((sx * tx + sy * ty) / d) * (min - d) * 8; mz += (sz / d) * (min - d) * 8; }
      }
    }
    ms += e.kx * tx; mz += e.kz;   // knockback from bullets
    e.kx *= Math.exp(-8 * dt); e.kz *= Math.exp(-8 * dt);

    e.z += mz * dt;
    e.s += ms * dt;
    const now = pipeRound(e.z) / 2;
    if (e.s > now) e.s -= 2 * now; else if (e.s < -now) e.s += 2 * now;
    onPipe(e.s, e.z, spot);
    e.x = spot.x; e.nx = spot.nx; e.ny = spot.ny;
    // Low down (the floor, and the foot of the walls) they go over whatever is standing there.
    const ground = spot.ny > 0.82 ? heightAt(e.x, e.z) : spot.y;
    e.y = ground - spot.y < 2.5 ? Math.max(ground, spot.y) : spot.y;
    // Which way it faces, along the surface (turning smoothly).
    const turn = Math.min(1, 9 * dt), fs = go < 0 ? ds / dist : ms, fz = go < 0 ? dz / dist : mz, f = Math.hypot(fs, fz);
    if (f > 0.05) { e.fs += (fs / f - e.fs) * turn; e.fz += (fz / f - e.fz) * turn; }

    // A crawler on the roof right over your head lets go.
    if (T.drops && e.ny < -0.5 && py < e.y - 6 && Math.hypot(px - e.x, pz - e.z) < 3.5) { e.fall = true; e.vy = 0; e.nx = 0; e.ny = 1; }
    return hurts();
  }

  // A bone-thrower throws: one bone, lobbed at where you'll be.
  lob(e, player) {
    const K = e.T.throws, tall = e.T.height * e.scale, i = this.nextBlob++ % this.blobs.length, b = this.blobs[i];
    b.pos.set(e.x + e.nx * tall, e.y + e.ny * tall, e.z);
    const flight = Math.max(0.7, Math.min(2, b.pos.distanceTo(player.pos) / 24));
    b.life = flight + 1.5;
    b.spin = Math.random() * 6;
    b.kind = 'bone'; b.size = 0.42; b.hit = K.damage; b.splash = K.splash; b.reach = K.radius;
    const tx = player.pos.x + player.vel.x * flight * 0.8, ty = player.pos.y + 0.6, tz = player.pos.z + player.vel.z * flight * 0.8;
    b.vel.set((tx - b.pos.x) / flight, (ty - b.pos.y + 0.5 * BLOB_GRAVITY * flight * flight) / flight, (tz - b.pos.z) / flight);
    this.blobMesh.setColorAt(i, BONE);
    this.blobMesh.instanceColor.needsUpdate = true;
    this.events.push({ type: 'throw' });
  }

  // ---- The Spider Queen (level 2's mini-boss) and her webs ---------------------------------

  // She comes in along the roof, ahead of you.
  spawnMini(player) {
    const T = ENEMY_TYPES.queen, heading = Math.atan2(player.vel.x, player.vel.z), hp = config.horde.miniHp;
    const [, z] = placeAt(player.pos.x, player.pos.z, heading, 42), s = pipeRound(z) / 2 - 2;
    onPipe(s, z, spot);
    this.mini = {
      name: 'queen', T, x: spot.x, y: spot.y, z, elite: false, scale: T.scale, hp, maxHp: hp, speed: T.speed,
      yaw: 0, rise: 1, flash: 0, kx: 0, kz: 0, ramWait: 0, phase: 0, s, nx: spot.nx, ny: spot.ny, fs: 0, fz: z < player.pos.z ? 1 : -1, fall: false, vy: 0, throwTimer: 2.5,   // (facing you)
    };
    this.enemies.push(this.mini);
    this.miniSpawned = true;
    this.events.push({ type: 'miniboss', name: T.title });
  }

  // She spits: a ball of web, lobbed at where you'll be. Where it lands, it stays.
  spit(e, player) {
    const K = e.T.webs, tall = e.T.height * e.scale, i = this.nextBlob++ % this.blobs.length, b = this.blobs[i];
    b.pos.set(e.x + e.nx * tall, e.y + e.ny * tall, e.z);
    const flight = Math.max(0.8, Math.min(2.2, b.pos.distanceTo(player.pos) / 22));
    b.life = flight + 1.5;
    b.spin = Math.random() * 6;
    b.kind = 'web'; b.size = 0.75; b.hit = K.hit; b.splash = 0; b.reach = 0;
    const tx = player.pos.x + player.vel.x * flight * 0.85, tz = player.pos.z + player.vel.z * flight * 0.85, ty = airFloorAt(tx, tz);
    b.vel.set((tx - b.pos.x) / flight, (ty - b.pos.y + 0.5 * BLOB_GRAVITY * flight * flight) / flight, (tz - b.pos.z) / flight);
    this.blobMesh.setColorAt(i, WHITE);
    this.blobMesh.instanceColor.needsUpdate = true;
    this.events.push({ type: 'spit' });
  }

  layWeb(x, z) {
    const w = this.webs[this.nextWeb++ % this.webs.length], K = ENEMY_TYPES.queen.webs;
    w.x = confineX(x, z); w.z = z; w.y = heightAt(w.x, z) + 0.08;
    w.life = K.life; w.r = K.radius * (0.85 + Math.random() * 0.3); w.turn = Math.random() * 6.28;
  }

  // Webs on the floor: standing on one hurts, and drags your speed down. Returns the damage this frame.
  updateWebs(dt, player) {
    const K = ENEMY_TYPES.queen.webs;
    let damage = 0;
    for (const w of this.webs) {
      if (w.life <= 0) continue;
      w.life -= dt;
      w.z = lapNear(w.z, player.pos.z);
      if (player.grounded === false || Math.abs(player.pos.y - w.y) > 1.2 || Math.hypot(player.pos.x - w.x, player.pos.z - w.z) > w.r) continue;
      damage = K.damage;
      if (player.vel.length() > K.crawl) player.vel.multiplyScalar(Math.exp(-K.drag * dt));
      if (this.time - this.webbedAt > 2.5) { this.webbedAt = this.time; this.events.push({ type: 'webbed' }); }
    }
    return damage;
  }

  // ---- The House --------------------------------------------------------------------
  // Babitus doesn't choose what he does: the wheel does. Every few seconds it is spun; the great chandelier shows
  // the colour it lands on (the 'wheel' event), and a moment later that is what happens:
  //   red     a fan of playing cards, thrown flat and fast at you
  //   black   casino chips raining down round where you are heading
  //   green   the house wins: a ring of cards in every direction, and every slot machine pays out monsters
  // Meanwhile the slot machines in the corners spit out a pack of monsters every so often.
  houseBoss(e, player, dt) {
    const C = config.house, hurt = e.hp < e.maxHp * 0.5;
    e.roar = Math.max(0, (e.roar || 0) - dt * 1.3);   // (his arms come down again after each throw)
    if (hurt && !e.half) { e.half = true; e.speed *= 1.3; this.events.push({ type: 'bossHalf', name: e.T.title }); }
    if (e.call) {
      if ((e.call.wait -= dt) > 0) return;
      const colour = e.call.colour;
      e.call = null;
      e.roar = 0.5;
      if (colour === 'red') this.dealCards(e, player, Math.round(C.cards * (hurt ? 1.5 : 1)), 0.5);
      else if (colour === 'black') this.rainChips(player, Math.round(C.chips * (hurt ? 1.5 : 1)));
      else { this.dealCards(e, player, 16, Math.PI); for (let k = 0; k < HOUSE.slots.length; k++) this.payOut(k); }
      this.events.push({ type: 'wheelDone', colour });
      return;
    }
    if ((e.wheel -= dt) <= 0) {
      e.wheel = hurt ? C.wheelFast : C.wheelEvery;
      const r = Math.random(), colour = r < 0.1 ? 'green' : r < 0.55 ? 'red' : 'black';
      e.call = { colour, wait: C.wheelTell };
      this.events.push({ type: 'wheel', colour });
    }
    if ((e.adds -= dt) <= 0) {
      e.adds = C.addsEvery * (hurt ? 0.7 : 1);
      if (this.enemies.length < C.addsMax) this.payOut(Math.floor(Math.random() * HOUSE.slots.length));
    }
  }

  // n cards from his hand, spread `spread` radians either side of you (Math.PI: all the way round).
  dealCards(e, player, n, spread) {
    const C = config.house, aim = Math.atan2(player.pos.x + player.vel.x * 0.5 - e.x, player.pos.z + player.vel.z * 0.5 - e.z);
    for (let k = 0; k < n; k++) {
      const i = this.nextBlob++ % this.blobs.length, b = this.blobs[i], a = aim + (n > 1 ? (k / (n - 1) - 0.5) * 2 * spread : 0);
      Object.assign(b, { kind: 'card', flat: true, size: 1, hit: C.cardDamage, splash: 0, reach: 0, life: 150 / C.cardSpeed, spin: a });
      b.pos.set(e.x, e.y + e.T.height * e.scale * 0.6, e.z);
      b.vel.set(Math.sin(a) * C.cardSpeed, 0, Math.cos(a) * C.cardSpeed);
      b.sink = (b.pos.y - (player.pos.y + 1)) / (Math.hypot(player.pos.x - e.x, player.pos.z - e.z) / C.cardSpeed || 1);   // they come down to your height by the time they reach you, then fly level
      b.level = player.pos.y + 1;
    }
    this.events.push({ type: 'bossThrow' });
  }

  // n chips, dropped from the ceiling to land round where you are about to be, a few at a time.
  rainChips(player, n) {
    const C = config.house;
    for (let k = 0; k < n; k++) {
      const i = this.nextBlob++ % this.blobs.length, b = this.blobs[i], a = Math.random() * Math.PI * 2, r = k ? Math.sqrt(Math.random()) * 11 : 0, lead = 0.6 + k * 0.09;
      Object.assign(b, { kind: 'chip', flat: false, size: 1, hit: C.chipDamage, splash: C.chipSplash, reach: 2.4, life: 6, spin: Math.random() * 6 });
      b.pos.set(player.pos.x + player.vel.x * lead + Math.cos(a) * r, player.pos.y + 16 + k * 2.2, player.pos.z + player.vel.z * lead + Math.sin(a) * r);
      b.vel.set(0, -4, 0);
    }
  }

  // A slot machine pays out: a pack of monsters from one corner of the room.
  payOut(k) {
    const C = config.house, [sx, sz] = HOUSE.slots[k], spot = houseSpot([sx * 0.8, sz * 0.8]);
    for (let i = 0; i < C.addsPack; i++) this.spawnAt(Math.random() < 0.5 ? 'rattler' : 'shambler', spot.x + (Math.random() - 0.5) * 6, spot.z + (Math.random() - 0.5) * 6, 0);
    this.events.push({ type: 'payout' });
  }

  // ---- What the boss throws ---------------------------------------------------------

  // Three lobbed blobs: one at where you're heading, one short and one long, spread sideways.
  throwVolley(e, player, dist) {
    const flight = Math.max(0.9, Math.min(2.6, dist / 26)), speed = player.speed || 1;
    for (let k = -1; k <= 1; k++) {
      const i = this.nextBlob++ % this.blobs.length, b = this.blobs[i];
      b.size = 1; b.hit = b.splash = b.reach = undefined; b.flat = false;   // (his own: full size, the boss's damage)
      b.kind = e.T.bones ? 'bone' : undefined;
      this.blobMesh.setColorAt(i, this.bossTint);
      b.life = flight + 1.5;
      b.spin = Math.random() * 6;
      b.pos.set(e.x, e.y + e.T.height * e.scale * 0.72, e.z);
      const lead = flight * (0.85 + k * 0.25), side = k * 5;
      const tx = player.pos.x + player.vel.x * lead - (player.vel.z / speed) * side;
      const tz = player.pos.z + player.vel.z * lead + (player.vel.x / speed) * side;
      b.vel.set((tx - b.pos.x) / flight, (heightAt(tx, tz) - b.pos.y + 0.5 * BLOB_GRAVITY * flight * flight) / flight, (tz - b.pos.z) / flight);
    }
    this.events.push({ type: 'bossThrow' });
  }

  // Returns the damage the blobs do to the player this frame.
  updateBlobs(dt, player) {
    const H = config.horde;
    let damage = 0;
    for (const b of this.blobs) {
      if (b.life <= 0) continue;
      b.life -= dt;
      if (!b.flat) b.vel.y -= BLOB_GRAVITY * dt;
      else b.vel.y = b.pos.y > b.level ? -b.sink : 0;   // (a thrown card: down to your height, then level)
      b.pos.addScaledVector(b.vel, dt);
      const direct = b.pos.distanceTo(v.copy(player.pos).setY(player.pos.y + 0.9)) < 1.7;
      const ground = airFloorAt(b.pos.x, b.pos.z);
      if (!direct && b.pos.y > ground && b.life > 0) continue;
      // It has hit you or the ground: splat.
      b.life = 0;
      const sp = b.kind ? {} : this.splats[this.nextSplat++ % this.splats.length];   // (only filth leaves a puddle)
      if (b.kind === 'web') this.layWeb(b.pos.x, b.pos.z);
      sp.life = 5; sp.x = b.pos.x; sp.z = b.pos.z; sp.y = ground + 0.06; sp.size = (2.2 + Math.random() * 1.2) * (b.size || 1);
      const near = Math.hypot(player.pos.x - b.pos.x, player.pos.z - b.pos.z) < (b.reach ?? H.bossSplashRadius) && Math.abs(player.pos.y - ground) < 2.5;
      if (direct) damage = Math.max(damage, b.hit ?? H.bossBlobDamage);
      else if (near) damage = Math.max(damage, b.splash ?? H.bossSplashDamage);
      this.events.push({ type: b.kind && b.kind !== 'web' ? 'clatter' : 'splat' });
      for (let k = 0; k < 8; k++) {
        const g = this.gibs[this.nextGib++ % this.gibs.length];
        g.life = 0.4 + Math.random() * 0.4;
        g.pos.set(b.pos.x, ground + 0.3, b.pos.z);
        g.vel.set((Math.random() - 0.5) * 9, 2 + Math.random() * 5, (Math.random() - 0.5) * 9);
      }
    }
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
        if (e.s !== undefined) {   // a climber stands out from the surface it's on, whichever way that is
          const qx = p.x - e.x, qy = p.y - e.y, qz = p.z - e.z, along = qx * e.nx + qy * e.ny, girth = e.T.radius * e.scale + 0.2;
          if (e.hp > 0 && along > -0.15 && along < e.T.height * e.scale + 0.15 && qx * qx + qy * qy + qz * qz - along * along < girth * girth) return e;
          continue;
        }
        if (e.hp <= 0 || p.y < e.y || p.y > e.y + e.T.height * e.scale) continue;
        const r = e.T.radius * e.scale + 0.15;
        if ((p.x - e.x) ** 2 + (p.z - e.z) ** 2 < r * r) return e;
      }
    }
    // The Spider Queen is wider than a grid cell too.
    const M = this.mini;
    if (M && M.hp > 0) {
      const qx = p.x - M.x, qy = p.y - M.y, qz = p.z - M.z, along = qx * M.nx + qy * M.ny, girth = M.T.radius * M.scale;
      if (along > -0.3 && along < M.T.height * M.scale + 0.3 && qx * qx + qy * qy + qz * qz - along * along < girth * girth) return M;
    }
    // The boss is far wider than a grid cell, so check him directly.
    const B = this.boss;
    if (B && p.y > B.y && p.y < B.y + B.T.height * B.scale * B.rise) {
      const r = B.T.radius * B.scale;
      if ((p.x - B.x) ** 2 + (p.z - B.z) ** 2 < r * r) return B;
    }
    return null;
  }

  // Set a monster alight: it takes `dps` for `seconds` (the flamethrower).
  ignite(e, seconds, dps) {
    if (e.dead) return;
    e.fire = Math.max(e.fire || 0, seconds);
    e.fireDps = Math.max(e.fire > 0 ? e.fireDps || 0 : 0, dps);
    e.fireTick ??= 0.25;
  }
  // Chill a monster: it moves at `slow` times its speed for `seconds` (the Frostbite gun, Frost Aura).
  // Bosses shrug it off; the mini-boss is only slowed a little.
  chill(e, seconds, slow) {
    if (e.dead || e.T.boss) return;
    if (!(e.chill > 0)) e.baseSpeed = e.speed;
    e.speed = e.baseSpeed * (e.T.miniboss ? Math.max(slow, 0.75) : slow);
    e.chill = Math.max(e.chill || 0, seconds);
  }

  // ...and everything within `radius` of a point (an ice lance shattering).
  chillArea(pos, radius, seconds, slow) {
    for (const e of this.enemies) {
      const reach = radius + e.T.radius * e.scale;
      if ((e.x - pos.x) ** 2 + (e.z - pos.z) ** 2 < reach * reach && Math.abs(e.y - pos.y) < radius + e.T.height * e.scale) this.chill(e, seconds, slow);
    }
  }

  // quiet: don't report non-lethal hits (for damage that ticks many times a second).
  damage(e, amount, dirX, dirZ, headshot = false, knock = 1, quiet = false) {
    if (e.dead) return;   // (died with the boss, but something still had hold of it)
    e.hp -= amount;
    e.flash = 1;
    const push = e.T.boss || e.T.miniboss ? 0 : (e.elite ? 1.5 : 6) * knock;
    e.kx += dirX * push; e.kz += dirZ * push;
    while (e.T.shed && e.hp > 0 && e.hp / e.maxHp < e.shedAt) this.shed(e);
    if (e.hp > 0) {
      if (!quiet) this.events.push({ type: 'hit', headshot });
      return;
    }
    const i = this.enemies.indexOf(e);
    if (i >= 0) { this.enemies[i] = this.enemies[this.enemies.length - 1]; this.enemies.pop(); }
    this.kills++;
    this.score += e.T.score * (e.elite ? 10 : 1);
    e.dead = true;
    this.events.push({ type: 'kill', elite: e.elite || !!e.T.boss || !!e.T.miniboss, boss: !!e.T.boss, headshot, quiet, score: e.T.score, x: e.s !== undefined ? confineX(e.x, e.z) : e.x, y: e.T.flying || e.s !== undefined ? heightAt(confineX(e.x, e.z), e.z) : e.y, z: e.z, xp: e.T.xp * (e.elite ? 15 : 1) });
    const burst = 1;
    // (The boss doesn't burst yet: his body stays standing for his death scene.)
    if (e.T.boss) this.corpse = { ...e, rise: 1, flash: 0, roar: 0, dying: 0 };
    if (e === this.mini) { this.mini = null; this.events.push({ type: 'miniDead', name: e.T.title }); }
    for (let k = 0; k < (e.T.boss ? 0 : e.elite || e.T.miniboss ? 40 : 9); k++) {
      const g = this.gibs[this.nextGib++ % this.gibs.length];
      g.life = (0.5 + Math.random() * 0.5) * burst;
      g.pos.set(e.x, e.y + 0.4 + Math.random() * 1.2 * e.scale, e.z);
      g.vel.set(((Math.random() - 0.5) * 7 + dirX * 5) * burst, (2 + Math.random() * 5) * burst, ((Math.random() - 0.5) * 7 + dirZ * 5) * burst);
    }
    if (e.T.boss) this.bossDied(e);
  }

  // A boss that sheds (see types.js) has lost another slice of his health: a pack of monsters
  // drops out of him, bits fly, and he's a little smaller for it.
  shed(e) {
    const S = e.T.shed, girth = e.T.radius * e.scale;
    e.shedAt -= S.every;
    e.scale = e.T.scale * (1 - S.shrink * (1 - Math.max(0, e.shedAt + S.every)));
    for (let k = 0; k < S.count; k++) {
      const a = (k / S.count) * Math.PI * 2 + Math.random(), z = e.z + Math.cos(a) * (girth + 1.5);
      this.spawnAt(S.type, confineX(e.x + Math.sin(a) * (girth + 1.5), z), z, a);
    }
    for (let k = 0; k < 26; k++) {
      const g = this.gibs[this.nextGib++ % this.gibs.length], a = Math.random() * Math.PI * 2;
      g.life = 0.6 + Math.random() * 0.6;
      g.pos.set(e.x + Math.sin(a) * girth * 0.6, e.y + (0.3 + Math.random() * 0.6) * e.T.height * e.scale, e.z + Math.cos(a) * girth * 0.6);
      g.vel.set(Math.sin(a) * (4 + Math.random() * 6), 3 + Math.random() * 6, Math.cos(a) * (4 + Math.random() * 6));
    }
    this.events.push({ type: 'bossShed' });
  }

  // The boss is dead: the monsters near you die with him, and the escape begins.
  bossDied(boss) {
    const H = config.horde, p = this.player.pos;
    this.boss = null;
    this.finished = true;
    this.overtime = 0;
    this.spawnDebt = 0;
    for (const b of this.blobs) b.life = 0;
    this.enemies = this.enemies.filter((e) => {
      if (Math.hypot(e.x - p.x, e.z - p.z) > H.bossClearRadius) return true;
      e.dead = true;
      this.kills++;
      for (let k = 0; k < 3; k++) {
        const g = this.gibs[this.nextGib++ % this.gibs.length];
        g.life = 0.5 + Math.random() * 0.6;
        g.pos.set(e.x, e.y + 0.5 + Math.random(), e.z);
        g.vel.set((Math.random() - 0.5) * 8, 3 + Math.random() * 6, (Math.random() - 0.5) * 8);
      }
      return false;
    });
    // The portal opens a good ride away, on open ground: beyond the boss, as seen from you.
    const away = Math.atan2(boss.x - p.x, boss.z - p.z);
    let x = 0, z = 0;
    for (let tries = 0; tries < 12; tries++) {
      const a = away + (tries ? (Math.random() - 0.5) * 1.6 : 0);
      [x, z] = placeAt(p.x, p.z, a, H.escapeDistance);
      if (heightAt(x, z) - groundAt(x, z) < 0.4) break;   // not on top of a tomb or a ramp
    }
    if (boss.T.house) { const doors = houseSpot([HOUSE.doors.x, HOUSE.doors.z]); x = doors.x; z = doors.z; }   // (the way out is the way you came in)
    this.events.push({ type: 'bossDead', name: boss.T.title, x, y: heightAt(x, z), z, house: !!boss.T.house });
  }

  // Chunks blown off a monster's body. power: how hard they fly.
  gore(e, count, power = 1) {
    const tall = e.T.height * e.scale, wide = e.T.radius * e.scale;
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2, g = this.gibs[this.nextGib++ % this.gibs.length];
      g.life = (0.6 + Math.random() * 0.8) * Math.min(2, power);
      g.pos.set(e.x + Math.sin(a) * wide * 0.6, e.y + tall * (0.2 + Math.random() * 0.7), e.z + Math.cos(a) * wide * 0.6);
      g.vel.set(Math.sin(a) * (3 + Math.random() * 7) * power, (2 + Math.random() * 8) * power, Math.cos(a) * (3 + Math.random() * 7) * power);
    }
  }

  // Clods thrown up from the ground round a spot (the boss breaking out, the portal tearing open).
  erupt(x, z, radius, count) {
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2, r = radius * (0.5 + Math.random() * 0.7), g = this.gibs[this.nextGib++ % this.gibs.length];
      g.life = 0.6 + Math.random() * 0.8;
      g.pos.set(x + Math.sin(a) * r, 0, z + Math.cos(a) * r);
      g.pos.y = heightAt(g.pos.x, g.pos.z) + 0.2;
      g.vel.set(Math.sin(a) * (2 + Math.random() * 5), 6 + Math.random() * 10, Math.cos(a) * (2 + Math.random() * 5));
    }
  }

  // Damages every monster within `radius` of a point (Shockwave Landing).
  shockwave(pos, radius, amount) {
    for (const e of [...this.enemies]) {
      const dx = e.x - pos.x, dz = e.z - pos.z, d = Math.hypot(dx, dz);
      const girth = e.T.boss ? e.T.radius * e.scale : 0;   // the boss is hit at his edge, not his middle
      if (d < radius + girth && Math.abs(e.y - pos.y) < 4 + girth) this.damage(e, amount, dx / (d || 1), dz / (d || 1));
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
      const climber = e.s !== undefined;
      if (climber) v.set(e.x + e.nx * tall * 0.6 - origin.x, e.y + e.ny * tall * 0.6 - origin.y, e.z - origin.z);
      else v.set(e.x - origin.x, e.y + tall * 0.6 - origin.y, e.z - origin.z);
      const d = v.length();
      if (d > 140 || d < 1) continue;
      const cos = v.dot(dir) / d;
      if (cos > best) {
        best = cos;
        // Pull the shot onto the monster sideways, but keep the height you were
        // aiming at (within its body), so headshots stay yours to earn.
        const aimedY = origin.y + dir.y * d;
        if (climber) out.copy(v).add(origin);
        else out.set(e.x, Math.max(e.y + tall * 0.15, Math.min(e.y + tall * 0.97, aimedY)), e.z);
        found = true;
      }
    }
    return found;
  }

  // ---- Drawing ---------------------------------------------------------------------

  draw(dt) {
    const counts = {}, close = {};
    for (const name in this.meshes) counts[name] = close[name] = 0;
    for (const e of this.corpse ? [...this.enemies, this.corpse] : this.enemies) {
      const near = this.fine[e.name] && close[e.name] < NEAR_MOST && (e.x - this.eye.x) ** 2 + (e.z - this.eye.z) ** 2 < NEAR * NEAR;
      const parts = near ? this.fine[e.name] : this.meshes[e.name], i = near ? close[e.name]++ : counts[e.name]++;
      const walk = this.time * e.speed * e.T.stride + e.phase;
      // Lurching walk (fliers lean into the chase and bob); sinking below ground while still rising.
      const roar = e.roar || 0;   // the boss, bellowing: he rears back, arms up, shuddering
      const dying = e.dying || 0;   // ...and dying: he shakes harder and harder, sags and topples backwards
      e3.set(e.T.flying ? 0.45 : 0.12 - 0.45 * roar - 0.75 * dying * dying, e.yaw + (Math.random() - 0.5) * 0.12 * dying, Math.sin(walk) * e.T.sway * (1 - dying) + (Math.random() - 0.5) * (0.05 * roar + 0.16 * dying));
      const bob = e.T.flying ? Math.sin(this.time * 3 + e.phase) * 0.2 : Math.abs(Math.sin(walk)) * 0.06;
      v.set(e.x, e.y - (1 - e.rise) * e.T.height * e.scale + bob - dying * dying * e.T.height * e.scale * 0.22, e.z);
      if (e.s !== undefined) {
        // A climber: feet on the surface, whichever way up that is, facing the way it's going along it.
        by.set(e.nx, e.ny, 0);
        bz.set(e.ny * e.fs, -e.nx * e.fs, e.fz).normalize();
        bx.crossVectors(by, bz).normalize();
        v.set(e.x, e.y, e.z).addScaledVector(by, -(1 - e.rise) * e.T.height * e.scale);
        m.makeBasis(bx, by, bz).scale(sc.setScalar(e.scale)).setPosition(v);
      } else m.compose(v, q.setFromEuler(e3), sc.setScalar(e.scale));
      const color = e.flash > 0 ? HURT : e.fire > 0 ? ABLAZE : e.chill > 0 ? FROZEN : e.elite ? ELITE : WHITE;
      // Each part hangs off the body at its pivot and swings with the stride
      // (not while still climbing out of the ground).
      const moving = e.rise >= 1 ? 1 : 0.25;
      for (const p of parts) {
        const s = Math.sin(walk + p.phase) * moving - (p.swing[0] > 0.4 ? 4.4 * roar : 0);   // (only his arms swing that far)
        limb.makeRotationFromEuler(e3.set(p.swing[0] * s, p.swing[1] * s, p.swing[2] * s)).setPosition(p.pivot);
        p.mesh.setMatrixAt(i, out.multiplyMatrices(m, limb));
        p.mesh.setColorAt(i, color);
      }
    }
    for (const name in this.fine) {
      for (const { mesh } of this.fine[name]) {
        mesh.count = close[name];
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
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

    this.blobs.forEach((b, i) => {
      const bone = b.kind === 'bone', card = b.kind === 'card', chip = b.kind === 'chip', live = b.life > 0;
      if (live) {
        if (card) e3.set(0, b.spin + this.time * 14, 0.15);                 // a card, spinning flat like a thrown blade
        else if (chip) e3.set(this.time * 9 + b.spin, b.spin, 0);            // a chip, tumbling end over end
        else e3.set(this.time * (bone ? 11 : 5) + b.spin, b.spin, this.time * (bone ? 7 : 3));
        m.compose(b.pos, q.setFromEuler(e3), bone || card || chip ? sc.setScalar(b.size || 1) : sc.set(1, 0.8, 1.25).multiplyScalar(b.size || 1));   // ...a tumbling bone, or a wobbling gobbet
      }
      this.blobMesh.setMatrixAt(i, live && !b.kind || (live && b.kind === 'web') ? m : HIDDEN);
      this.boneMesh.setMatrixAt(i, live && bone ? m : HIDDEN);
      this.cardMesh.setMatrixAt(i, live && card ? m : HIDDEN);
      this.chipMesh.setMatrixAt(i, live && chip ? m : HIDDEN);
    });
    this.cardMesh.instanceMatrix.needsUpdate = true;
    this.chipMesh.instanceMatrix.needsUpdate = true;
    this.blobMesh.instanceMatrix.needsUpdate = true;
    this.boneMesh.instanceMatrix.needsUpdate = true;
    this.webs.forEach((w, i) => {
      if (w.life <= 0) { this.webMesh.setMatrixAt(i, HIDDEN); return; }
      const size = w.r * Math.min(1, (ENEMY_TYPES.queen.webs.life - w.life) * 5) * Math.min(1, w.life);   // flung open; shrivels at the end
      this.webMesh.setMatrixAt(i, m.compose(v.set(w.x, w.y, w.z), q.setFromEuler(e3.set(0, w.turn, 0)), sc.set(size, 1, size)));
    });
    this.webMesh.instanceMatrix.needsUpdate = true;
    this.splats.forEach((sp, i) => {
      if (sp.life <= 0) { this.splatMesh.setMatrixAt(i, HIDDEN); return; }
      sp.life -= dt;
      const size = Math.min(1, (5 - sp.life) * 6) * Math.min(1, Math.max(0, sp.life)) * sp.size;   // spreads fast, shrinks away at the end
      this.splatMesh.setMatrixAt(i, m.compose(v.set(sp.x, sp.y, sp.z), q.identity(), sc.set(size, 1, size)));
    });
    this.splatMesh.instanceMatrix.needsUpdate = true;

    if (this.ringLife > 0) {
      this.ringLife -= dt * 3;
      this.ring.scale.setScalar(this.ring.userData.radius * (1 - Math.max(0, this.ringLife) ** 2));
      this.ring.material.opacity = Math.max(0, this.ringLife);
      this.ring.visible = this.ringLife > 0;
    }
  }
}
