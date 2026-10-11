// Power-ups won from HotBox Zones. They are permanent for the run, they stack
// (capturing the same one again levels it up), and all of them work on their
// own with no input from the player. Level-up upgrades can strengthen the ones
// you own (see the "requires" entries in systems/upgrades.js).
//
// Each power-up's numbers are in POWERUPS below as a function of
//   L = its level (how many times you've won it), and
//   m = its upgrade bonuses { damage, size, rate, count } (multipliers, count is added).
// To add a power-up: add an entry here and make it act in update().
// `explain` is the text on the card shown the first time you win it in a run.
import * as THREE from 'three';
import { stats, POWER_IDS } from './stats.js';
import { config } from '../config.js';
import { glowTexture } from '../world/textures.js';

export const POWERUPS = {
  shield: {
    name: 'Shield', color: 0x58b7ff, max: 5, description: 'a bubble soaks up damage, then recharges',
    explain: 'A bubble round you takes the hits instead of your health. Leave it alone for a few seconds and it recharges by itself.',
    numbers: (L, m) => ({ capacity: (20 + 12 * L) * m.size, delay: 9 / m.rate, regen: 10 }),   // HP it holds, seconds unhit before it refills, HP per second
  },
  gas: {
    name: 'TozToxik', color: 0x8dff5a, max: 5, description: 'toxic gas round you and in a trail behind you',
    explain: 'A cloud of toxic gas follows you and damages every monster inside it. It also hangs in a trail behind you: the faster you skate, the longer the trail.',
    numbers: (L, m) => ({ radius: (4 + 0.6 * (L - 1)) * m.size, dps: (14 + 6 * (L - 1)) * m.damage, linger: 2.2 + 0.3 * (L - 1) }),   // linger: seconds the trail hangs about
  },
  fire: {
    name: 'Ring of Fire', color: 0xff7a2a, max: 5, description: 'fireballs circle you and burn what they touch',
    explain: 'Fireballs circle you, sweeping in and out, and burn any monster they pass through. Nothing to aim: just skate close.',
    numbers: (L, m) => ({ orbs: Math.min(8, 1 + L + m.count), radius: 3.2 * m.size, damage: (22 + 6 * (L - 1)) * m.damage, spin: 2.6 }),
  },
  seekers: {
    name: 'Grave Seekers', color: 0xc9a6ff, max: 5, description: 'homing skulls hunt the nearest monsters',
    explain: 'Every second or two, skulls fly out on their own and home in on the nearest monsters.',
    numbers: (L, m) => ({ volley: 1 + Math.floor(L / 2) + m.count, every: 1.6 / m.rate, damage: (26 + 8 * (L - 1)) * m.damage, speed: 30, range: 45 }),
  },
  thorns: {
    name: 'Thorns', color: 0xc8d0d6, max: 5, description: 'anything that gets close is torn up and thrown back',
    explain: 'A ring of barbs spins round you. Anything that gets close enough to claw you is torn up and thrown back.',
    numbers: (L, m) => ({ radius: 1.9 * m.size, dps: (26 + 12 * (L - 1)) * m.damage, knock: 2.5 }),
  },
  lightning: {
    name: 'Chain Lightning', color: 0x9fe8ff, max: 5, description: 'bolts strike nearby monsters and jump between them',
    explain: 'Every few seconds a bolt strikes the nearest monster, then jumps on to the ones next to it.',
    numbers: (L, m) => ({ every: 2.6 / m.rate, damage: (45 + 15 * (L - 1)) * m.damage, jumps: 2 + L + m.count, range: 30, hop: 9 }),
  },
  float: {
    name: 'Moon Rocks', color: 0xdfe8ff, max: 4, description: 'lower gravity: bigger air',
    explain: 'Gravity pulls on you less. You jump higher, hang longer and have more time for tricks and flips.',
    numbers: (L) => ({ gravity: Math.max(0.5, 1 - 0.12 * L) }),
  },
  frost: {
    name: 'Frost Aura', color: 0x9fd8ff, max: 5, description: 'a ring of cold: monsters near you slow right down',
    explain: 'A ring of cold surrounds you. Any monster inside it is chilled: it moves far slower, and the cold eats at it.',
    numbers: (L, m) => ({ radius: (5 + 0.8 * (L - 1)) * m.size, slow: Math.max(0.35, 0.72 - 0.07 * L), dps: (5 + 3 * (L - 1)) * m.damage }),
  },
  rain: {
    name: 'Bone Rain', color: 0xe8dfc8, max: 5, description: 'bones fall out of the dark onto monsters and burst',
    explain: 'Every few seconds, huge bones drop out of the dark onto monsters near you and burst, hurting everything around where they land.',
    numbers: (L, m) => ({ every: 3.2 / m.rate, strikes: 1 + Math.floor(L / 2) + m.count, damage: (50 + 15 * (L - 1)) * m.damage, radius: 3.6 * m.size, range: 28 }),
  },
  pact: {
    name: 'Blood Pact', color: 0xd0201b, max: 4, description: 'killing heals you, a little',
    explain: 'Kill enough monsters and you get some health back. The more of these you have, the fewer kills it takes.',
    numbers: (L) => ({ every: Math.max(6, 20 - 4 * L), heal: 3 + L }),   // kills per heal, HP per heal
  },
};

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
const Z = new THREE.Vector3(0, 0, 1);
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), a = new THREE.Vector3(), b = new THREE.Vector3(), sc = new THREE.Vector3();
const level = (id) => stats.power[id].level;
const numbers = (id) => POWERUPS[id].numbers(level(id), stats.power[id]);
const basic = (color, extra = {}) => new THREE.MeshBasicMaterial({ color, toneMapped: false, ...extra });

export class Powerups {
  constructor(scene) {
    const glow = glowTexture();
    const sprite = (color, opacity = 0) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color, transparent: true, opacity, depthWrite: false }));
      s.visible = false;
      scene.add(s);
      return s;
    };

    // Shield bubble.
    this.bubble = new THREE.Mesh(new THREE.SphereGeometry(1.25, 24, 16), basic(POWERUPS.shield.color, { transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.bubble.visible = false;
    scene.add(this.bubble);

    // TozToxik: a cloud that stays with you, and a trail of patches dropped along your path.
    this.cloud = Array.from({ length: 16 }, (_, i) => {
      const puff = sprite(i % 3 ? 0x8dff5a : 0xd8ff7a);
      puff.userData = { angle: i * 2.4, reach: 0.3 + ((i * 7) % 10) / 14, height: 0.3 + (i % 5) * 0.4, speed: 0.5 + (i % 4) * 0.3 };
      return puff;
    });
    this.trail = Array.from({ length: 44 }, (_, i) => ({ life: 0, total: 1, pos: new THREE.Vector3(), puff: sprite(i % 2 ? 0x8dff5a : 0xb6ff6a) }));
    this.nextPatch = 0;
    this.sinceDrop = 0;   // metres travelled since the last patch

    // Ring of Fire: orbiting fireballs.
    this.orbs = Array.from({ length: 8 }, () => {
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), basic(0xffd27a));
      const flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: POWERUPS.fire.color, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
      flare.scale.setScalar(2.2);
      orb.add(flare);
      orb.visible = false;
      scene.add(orb);
      return orb;
    });

    // Grave Seekers: homing skulls.
    this.seekers = Array.from({ length: 24 }, () => {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), basic(0xf1e9ff));
      const flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: POWERUPS.seekers.color, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
      flare.scale.setScalar(1.6);
      mesh.add(flare);
      mesh.visible = false;
      scene.add(mesh);
      return { mesh, vel: new THREE.Vector3(), life: 0, target: null, damage: 0 };
    });

    // Thorns: a spinning hoop of barbs.
    const hoop = new THREE.Group(), iron = new THREE.MeshStandardMaterial({ color: 0x9aa3aa, roughness: 0.35, metalness: 0.7 });
    hoop.add(new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 5, 40).rotateX(Math.PI / 2), iron));
    for (let i = 0; i < 14; i++) {
      const barb = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.34, 5).rotateZ(-Math.PI / 2), iron);
      const t = (i / 14) * Math.PI * 2;
      barb.position.set(Math.cos(t) * 1.12, 0, Math.sin(t) * 1.12);
      barb.rotation.y = -t;
      hoop.add(barb);
    }
    hoop.visible = false;
    scene.add(hoop);
    this.hoop = hoop;

    // Chain Lightning: bolts drawn as thin glowing bars, a few jagged pieces per jump.
    this.bolts = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), basic(0xe6fbff, { transparent: true, fog: false }), 96);
    this.bolts.frustumCulled = false;
    this.bolts.count = 0;
    scene.add(this.bolts);
    this.boltLight = new THREE.PointLight(POWERUPS.lightning.color, 0, 30, 2);
    scene.add(this.boltLight);

    // Frost Aura: a pale ring on the ground.
    this.frostRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 56).rotateX(-Math.PI / 2), basic(POWERUPS.frost.color, { transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.frostFill = new THREE.Mesh(new THREE.CircleGeometry(0.9, 40).rotateX(-Math.PI / 2), basic(POWERUPS.frost.color, { transparent: true, opacity: 0.06, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.frostRing.add(this.frostFill);
    this.frostRing.visible = false;
    scene.add(this.frostRing);

    // Bone Rain: bones on their way down.
    const femur = new THREE.CylinderGeometry(0.13, 0.13, 1.9, 8);
    this.drops = Array.from({ length: 8 }, () => {
      const mesh = new THREE.Mesh(femur, new THREE.MeshStandardMaterial({ color: 0xe8dfc8, roughness: 0.6, emissive: 0x3a352a }));
      for (const y of [-0.95, 0.95]) for (const x of [-0.13, 0.13]) { const knob = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), mesh.material); knob.position.set(x, y, 0); mesh.add(knob); }
      mesh.visible = false;
      scene.add(mesh);
      return { mesh, life: 0, at: new THREE.Vector3(), damage: 0, radius: 0 };
    });

    this.clock = 0;
    this.reset();
  }

  reset() {
    this.shieldHp = 0;
    this.sinceHit = 99;
    this.shieldFlash = 0;
    this.tick = 0;          // shared timer for damage that ticks (gas, thorns)
    this.seekTimer = 0;
    this.boltTimer = 0;
    this.boltLife = 0;
    this.sinceDrop = 0;
    this.bubble.visible = this.hoop.visible = false;
    for (const p of this.cloud) p.visible = false;
    for (const t of this.trail) { t.life = 0; t.puff.visible = false; }
    for (const o of this.orbs) o.visible = false;
    for (const s of this.seekers) { s.life = 0; s.mesh.visible = false; }
    this.bolts.count = 0;
    this.boltLight.intensity = 0;
    this.frostRing.visible = false;
    this.rainTimer = 2;
    for (const d of this.drops) { d.life = 0; d.mesh.visible = false; }
    this.pactKills = 0;
  }

  // Blood Pact: a monster has died. Returns the HP that heals you (usually 0).
  onKill() {
    if (!level('pact')) return 0;
    const N = numbers('pact');
    if (++this.pactKills < N.every) return 0;
    this.pactKills = 0;
    return N.heal;
  }

  // ---- Winning them ---------------------------------------------------------------

  // Levels a power-up up by one. Returns its new level.
  grant(id) {
    const p = stats.power[id];
    p.level = Math.min(POWERUPS[id].max, p.level + 1);
    if (id === 'shield') this.shieldHp = numbers('shield').capacity;   // comes up full
    return p.level;
  }

  // A random power-up that can still be levelled, or null if everything is maxed.
  random() {
    // Once you hold as many different ones as you're allowed, a zone can only level up what you have.
    const full = POWER_IDS.filter((id) => level(id) > 0).length >= config.hotbox.maxPowers;
    const open = POWER_IDS.filter((id) => level(id) < POWERUPS[id].max && (!full || level(id) > 0));
    return open.length ? open[Math.floor(Math.random() * open.length)] : null;
  }

  // "TozToxik III" style label for a power-up at its current level.
  label(id) { return `${POWERUPS[id].name} ${ROMAN[level(id)] || level(id)}`; }

  // What you own, for the HUD: [{ label, color }].
  owned() {
    return POWER_IDS.filter((id) => level(id) > 0).map((id) => ({ label: this.label(id), color: POWERUPS[id].color }));
  }

  // 0..1: how charged the shield is (0 if you don't have one).
  shieldCharge() { return level('shield') ? this.shieldHp / numbers('shield').capacity : 0; }

  // The shield takes the hit if it has any charge. Returns true if it did.
  absorb(damage) {
    if (this.shieldHp <= 0) return false;
    this.shieldHp = Math.max(0, this.shieldHp - damage);
    this.sinceHit = 0;
    this.shieldFlash = 1;
    return true;
  }

  // ---- Every frame ------------------------------------------------------------------

  // player: the skater (for speed). pos: where to draw things round him.
  update(dt, player, pos, horde) {
    this.clock += dt;
    const ticking = (this.tick -= dt) <= 0;   // gas and thorns bite four times a second
    if (ticking) this.tick = 0.25;
    const alive = horde.enemies;

    stats.gravity = level('float') ? numbers('float').gravity : 1;

    this.updateShield(dt, pos);
    this.updateGas(dt, player, pos, horde, ticking);
    this.updateFire(dt, pos, horde);
    this.updateSeekers(dt, pos, horde, alive);
    this.updateThorns(dt, pos, horde, ticking);
    this.updateLightning(dt, pos, horde);
    this.updateFrost(dt, pos, horde, ticking);
    this.updateRain(dt, pos, horde, alive);
  }

  updateFrost(dt, pos, horde, ticking) {
    const on = level('frost') > 0;
    this.frostRing.visible = on;
    if (!on) return;
    const N = numbers('frost');
    this.frostRing.position.set(pos.x, pos.y + 0.12, pos.z);
    this.frostRing.scale.setScalar(N.radius * (1 + 0.03 * Math.sin(this.clock * 3)));
    this.frostRing.rotation.y = this.clock * 0.4;
    if (!ticking) return;
    for (const e of [...horde.enemies]) {
      if (e.rise < 1 || Math.abs(e.y - pos.y) > 6) continue;
      if (Math.hypot(e.x - pos.x, e.z - pos.z) > N.radius + (e.T.boss ? e.T.radius * e.scale : 0)) continue;
      horde.chill(e, 0.7, N.slow);
      horde.damage(e, N.dps * 0.25, 0, 0, false, 0, true);
    }
  }

  updateRain(dt, pos, horde, alive) {
    if (level('rain') && (this.rainTimer -= dt) <= 0) {
      const N = numbers('rain');
      this.rainTimer = N.every;
      const near = alive.filter((e) => e.rise >= 1 && Math.hypot(e.x - pos.x, e.z - pos.z) < N.range);
      for (let k = 0; k < N.strikes && near.length; k++) {
        const e = near[Math.floor(Math.random() * near.length)], d = this.drops.find((x) => x.life <= 0);
        if (!d) break;
        d.life = 0.5;
        d.at.set(e.x, e.y, e.z);
        d.damage = N.damage;
        d.radius = N.radius;
        d.mesh.visible = true;
      }
    }
    for (const d of this.drops) {
      if (d.life <= 0) continue;
      d.life -= dt;
      d.mesh.position.set(d.at.x, d.at.y + Math.max(0, d.life) * 28, d.at.z);   // (half a second to fall 14 m)
      d.mesh.rotation.set(this.clock * 13, 0, 0.6);
      if (d.life <= 0) {
        d.mesh.visible = false;
        horde.shockwave(d.at, d.radius, d.damage);
      }
    }
  }

  updateShield(dt, pos) {
    const on = level('shield') > 0;
    if (on) {
      const N = numbers('shield');
      this.sinceHit += dt;
      if (this.sinceHit > N.delay) this.shieldHp = Math.min(N.capacity, this.shieldHp + N.regen * dt);   // recharges once you've been left alone
    }
    this.shieldFlash = Math.max(0, this.shieldFlash - dt * 4);
    this.bubble.visible = on && (this.shieldHp > 0 || this.shieldFlash > 0);
    if (!this.bubble.visible) return;
    const charge = this.shieldCharge();
    this.bubble.position.set(pos.x, pos.y + 1, pos.z);
    this.bubble.material.opacity = 0.05 + 0.13 * charge + 0.5 * this.shieldFlash + (charge < 0.3 ? 0.06 * Math.sin(this.clock * 18) : 0);
    this.bubble.scale.setScalar(1 + 0.12 * this.shieldFlash);
  }

  updateGas(dt, player, pos, horde, ticking) {
    const on = level('gas') > 0;
    if (on) {
      const N = numbers('gas'), patchRadius = N.radius * 0.8;
      // Drop a patch every couple of metres travelled: the faster you go, the longer the trail.
      this.sinceDrop += player.speed * dt;
      while (this.sinceDrop >= 2.2) {
        this.sinceDrop -= 2.2;
        const t = this.trail[this.nextPatch++ % this.trail.length];
        t.life = t.total = N.linger;
        t.pos.copy(pos);
      }
      if (ticking) {
        for (const e of [...horde.enemies]) {
          if (e.rise < 1 || Math.abs(e.y - pos.y) > 6) continue;
          const girth = e.T.boss ? e.T.radius * e.scale : 0;   // the boss is far wider than the rest
          let inGas = Math.hypot(e.x - pos.x, e.z - pos.z) < N.radius + girth;
          for (let i = 0; !inGas && i < this.trail.length; i++) {
            const t = this.trail[i];
            inGas = t.life > 0 && Math.hypot(e.x - t.pos.x, e.z - t.pos.z) < patchRadius + girth && Math.abs(e.y - t.pos.y) < 4;
          }
          if (inGas) horde.damage(e, N.dps * 0.25, 0, 0, false, 0, true);
        }
      }
      for (const puff of this.cloud) {
        const u = puff.userData, ang = u.angle + this.clock * u.speed, r = u.reach * N.radius;
        puff.visible = true;
        puff.position.set(pos.x + Math.cos(ang) * r, pos.y + u.height, pos.z + Math.sin(ang) * r);
        puff.scale.setScalar(N.radius * 0.6 + Math.sin(this.clock * 1.3 + u.angle) * 0.5);
        puff.material.opacity = 0.16;
      }
      for (const t of this.trail) {
        if (t.life <= 0) continue;
        t.life -= dt;
        const k = Math.max(0, t.life / t.total);
        t.puff.visible = t.life > 0;
        t.puff.position.set(t.pos.x, t.pos.y + 0.9 + (1 - k) * 0.8, t.pos.z);   // drifts upward as it thins
        t.puff.scale.setScalar(patchRadius * (1.5 + (1 - k) * 0.9));
        t.puff.material.opacity = 0.24 * Math.min(1, k * 2);
      }
    } else {
      for (const puff of this.cloud) puff.visible = false;
    }
  }

  updateFire(dt, pos, horde) {
    const N = level('fire') ? numbers('fire') : null;
    this.orbs.forEach((orb, i) => {
      orb.visible = !!N && i < N.orbs;
      if (!orb.visible) return;
      // The ring breathes in and out as it turns, so it sweeps the ground between you and its edge
      // (otherwise monsters standing right next to you would be safely inside it).
      const ang = this.clock * N.spin + (i / N.orbs) * Math.PI * 2;
      const r = 1.3 + (N.radius - 1.3) * (0.5 + 0.5 * Math.sin(this.clock * 1.9 + i * 0.5));
      orb.position.set(pos.x + Math.cos(ang) * r, pos.y + 0.9 + Math.sin(this.clock * 3 + i) * 0.12, pos.z + Math.sin(ang) * r);
      // Burn whatever it passes through (each monster at most a couple of times a second).
      for (const e of [...horde.enemies]) {
        if (e.rise < 1 || (e.burnAt || 0) > this.clock) continue;
        const dx = e.x - orb.position.x, dz = e.z - orb.position.z;
        if (dx * dx + dz * dz < Math.max(1.5, (e.T.radius * e.scale) ** 2) && orb.position.y > e.y - 0.3 && orb.position.y < e.y + e.T.height * e.scale + 0.3) {
          e.burnAt = this.clock + 0.4;
          const d = Math.hypot(e.x - pos.x, e.z - pos.z) || 1;
          horde.damage(e, N.damage, (e.x - pos.x) / d, (e.z - pos.z) / d, false, 0.6, true);
        }
      }
    });
  }

  updateSeekers(dt, pos, horde, alive) {
    if (level('seekers')) {
      const N = numbers('seekers');
      if ((this.seekTimer -= dt) <= 0) {
        this.seekTimer = N.every;
        // Send a skull at each of the nearest few monsters.
        const targets = alive.filter((e) => e.rise >= 1).map((e) => [Math.hypot(e.x - pos.x, e.z - pos.z), e]).filter(([d]) => d < N.range).sort((p, r) => p[0] - r[0]).slice(0, N.volley);
        targets.forEach(([, e], i) => {
          const s = this.seekers.find((x) => x.life <= 0);
          if (!s) return;
          s.life = 3.2;
          s.target = e;
          s.damage = N.damage;
          s.mesh.position.set(pos.x, pos.y + 1.6, pos.z);
          const ang = this.clock * 3 + i * 2.1;
          s.vel.set(Math.cos(ang) * 6, 9, Math.sin(ang) * 6);   // they leap up and out, then swing round onto their target
          s.mesh.visible = true;
        });
      }
    }
    for (const s of this.seekers) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (!s.target || s.target.hp <= 0) s.target = this.nearest(alive, s.mesh.position, 40);   // target gone: find another
      if (s.target) {
        const e = s.target;
        a.set(e.x, e.y + e.T.height * e.scale * 0.6, e.z).sub(s.mesh.position);
        const dist = a.length();
        if (dist < 0.9) {
          horde.damage(e, s.damage, a.x / (dist || 1), a.z / (dist || 1), false, 1, true);
          s.life = 0;
        } else s.vel.lerp(a.multiplyScalar(30 / dist), Math.min(1, 7 * dt));
      }
      s.mesh.position.addScaledVector(s.vel, dt);
      s.mesh.visible = s.life > 0;
    }
  }

  updateThorns(dt, pos, horde, ticking) {
    const on = level('thorns') > 0;
    this.hoop.visible = on;
    if (!on) return;
    const N = numbers('thorns');
    this.hoop.position.set(pos.x, pos.y + 0.75, pos.z);
    this.hoop.rotation.y = this.clock * 5;
    this.hoop.scale.setScalar(N.radius * 0.55);
    if (!ticking) return;
    for (const e of [...horde.enemies]) {
      const dx = e.x - pos.x, dz = e.z - pos.z, d = Math.hypot(dx, dz);
      if (e.rise >= 1 && d < N.radius + e.T.radius * e.scale && Math.abs(e.y - pos.y) < 2.2) horde.damage(e, N.dps * 0.25, dx / (d || 1), dz / (d || 1), false, N.knock, true);
    }
  }

  updateLightning(dt, pos, horde) {
    if (level('lightning') && (this.boltTimer -= dt) <= 0) {
      const N = numbers('lightning');
      this.boltTimer = N.every;
      // Hit the nearest monster, then keep jumping to the nearest one not yet hit.
      const hit = new Set();
      let from = a.set(pos.x, pos.y + 1.3, pos.z).clone(), reach = N.range, pieces = 0;
      for (let j = 0; j <= N.jumps; j++) {
        const e = this.nearest(horde.enemies, from, reach, hit);
        if (!e) break;
        hit.add(e);
        const to = new THREE.Vector3(e.x, e.y + e.T.height * e.scale * 0.6, e.z);
        pieces = this.drawBolt(from, to, pieces);
        horde.damage(e, N.damage, 0, 0, false, 0.5, true);
        from = to;
        reach = N.hop;
      }
      if (pieces) {
        this.bolts.count = pieces;
        this.bolts.instanceMatrix.needsUpdate = true;
        this.boltLife = 1;
        this.boltLight.position.copy(from);
        this.boltLight.intensity = 300;
      }
    }
    this.boltLife = Math.max(0, this.boltLife - dt * 6);
    this.bolts.material.opacity = this.boltLife;
    this.bolts.visible = this.boltLife > 0;
    this.boltLight.intensity *= Math.exp(-20 * dt);
  }

  // A jagged line of bars from one point to another. Returns the new count of bars used.
  drawBolt(from, to, used) {
    const steps = 4;
    let last = from;
    for (let i = 1; i <= steps && used < 96; i++) {
      const next = b.copy(from).lerp(to, i / steps).clone();
      if (i < steps) next.add(a.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(1.3));
      const len = last.distanceTo(next);
      q.setFromUnitVectors(Z, a.copy(next).sub(last).normalize());
      this.bolts.setMatrixAt(used++, m4.compose(b.copy(last).lerp(next, 0.5), q, sc.set(0.09, 0.09, len)));
      last = next;
    }
    return used;
  }

  // The closest live monster to a point within `range`, skipping any in `except`.
  nearest(enemies, point, range, except) {
    let best = null, bestDist = range;
    for (const e of enemies) {
      if (e.rise < 1 || e.hp <= 0 || (except && except.has(e))) continue;
      const d = Math.hypot(e.x - point.x, e.z - point.z);
      if (d < bestDist) { best = e; bestDist = d; }
    }
    return best;
  }
}
