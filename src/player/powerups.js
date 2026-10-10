// Power-ups won from HotBox Zones. You don't know which one a zone holds
// until you've captured it.
//
// To add one: give it an entry in POWERUPS (with how long it lasts), then make
// it do something, either in update() below or wherever main.js reads
// powerups.active(id).
import * as THREE from 'three';
import { config } from '../config.js';
import { glowTexture } from '../world/textures.js';

export const POWERUPS = {
  shield: { name: 'Shield', color: 0x58b7ff, description: 'a bubble soaks up damage' },
  gas: { name: 'TozToxik', color: 0x8dff5a, description: 'toxic gas follows you' },
  regen: { name: 'Munchies', color: 0xff8fb0, description: 'you heal over time' },
  slow: { name: 'Couch Lock', color: 0xb58cff, description: 'every monster slows right down' },
  blaze: { name: 'Blaze', color: 0xff8a2a, description: 'double fire rate and double damage' },
  float: { name: 'Moon Rocks', color: 0xdfe8ff, description: 'low gravity: huge air' },
};

// How long each one lasts comes from config.powerups (shieldTime, gasTime, regenTime...).
const duration = (id) => config.powerups[`${id}Time`];

export class Powerups {
  constructor(scene) {
    // Shield bubble.
    this.bubble = new THREE.Mesh(
      new THREE.SphereGeometry(1.25, 24, 16),
      new THREE.MeshBasicMaterial({ color: POWERUPS.shield.color, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.bubble.visible = false;
    scene.add(this.bubble);

    // Gas cloud: puffs that trail after the player.
    const tex = glowTexture();
    this.cloud = Array.from({ length: 30 }, (_, i) => {
      const puff = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: i % 3 ? 0x8dff5a : 0xd8ff7a, transparent: true, opacity: 0, depthWrite: false }));
      puff.userData = { angle: i * 2.4, reach: 0.25 + ((i * 7) % 10) / 13, height: 0.3 + (i % 5) * 0.45, speed: 0.5 + (i % 4) * 0.3, lag: 2 + (i % 5) };
      puff.visible = false;
      scene.add(puff);
      return puff;
    });

    // A coloured ring at Kirky's feet for each power-up that's running (the gas ring also shows its reach).
    this.rings = {};
    Object.keys(POWERUPS).forEach((id, i) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 5, 56), new THREE.MeshBasicMaterial({ color: POWERUPS[id].color, transparent: true, opacity: 0.6, toneMapped: false }));
      ring.rotation.x = Math.PI / 2;
      ring.visible = false;
      ring.userData.radius = 0.8 + i * 0.16;
      scene.add(ring);
      this.rings[id] = ring;
    });
    this.time = {};      // id -> seconds left
    this.clock = 0;
    this.reset();
  }

  reset() {
    for (const id in POWERUPS) this.time[id] = 0;
    this.shieldHp = 0;      // damage the shield can still take
    this.shieldFlash = 0;
    this.gasTick = 0;
    this.bubble.visible = false;
    for (const id in this.rings) this.rings[id].visible = false;
    for (const puff of this.cloud) { puff.visible = false; puff.material.opacity = 0; }
  }

  // A random one, for a zone to hand out.
  random() {
    const ids = Object.keys(POWERUPS);
    return ids[Math.floor(Math.random() * ids.length)];
  }

  grant(id) {
    this.time[id] = duration(id);
    if (id === 'shield') this.shieldHp = config.powerups.shieldHp;
  }

  active(id) { return this.time[id] > 0; }

  // What's running, as { name: seconds left }, for the HUD.
  running() {
    const out = {};
    for (const id in POWERUPS) if (this.active(id)) out[POWERUPS[id].name] = this.time[id];
    return out;
  }

  // The shield takes the hit if it's up. Returns true if it did.
  absorb(damage) {
    if (!this.active('shield')) return false;
    this.shieldHp -= damage;
    if (this.shieldHp <= 0) this.time.shield = 0;   // broken
    this.shieldFlash = 1;
    return true;
  }

  // game: { heal(n) }.
  update(dt, pos, horde, game) {
    const P = config.powerups;
    this.clock += dt;
    const gassing = this.active('gas');
    for (const id in this.time) this.time[id] = Math.max(0, this.time[id] - dt);

    // Munchies: steady healing.
    if (this.active('regen')) game.heal(P.regenRate * dt);

    // Shield: flares when hit, flickers when nearly gone.
    this.shieldFlash = Math.max(0, this.shieldFlash - dt * 4);
    this.bubble.visible = this.active('shield');
    if (this.bubble.visible) {
      const weak = this.shieldHp < P.shieldHp * 0.3 || this.time.shield < 4;
      this.bubble.position.set(pos.x, pos.y + 1, pos.z);
      this.bubble.material.opacity = 0.14 + 0.5 * this.shieldFlash + (weak ? 0.1 * Math.sin(this.clock * 18) : 0.04 * Math.sin(this.clock * 3));
      this.bubble.scale.setScalar(1 + 0.12 * this.shieldFlash);
    }

    // TozToxik: everything inside the cloud takes damage several times a second.
    if (gassing && (this.gasTick -= dt) <= 0) {
      this.gasTick = 0.25;
      for (const e of [...horde.enemies]) {
        if (e.rise >= 1 && Math.hypot(e.x - pos.x, e.z - pos.z) < P.gasRadius && Math.abs(e.y - pos.y) < 4) horde.damage(e, P.gasDps * 0.25, 0, 0, false, 0, true);
      }
    }
    const fade = Math.min(1, this.time.gas / 2);   // thins out over its last two seconds
    for (const puff of this.cloud) {
      const u = puff.userData;
      if (!gassing) {
        if (puff.visible) puff.visible = false;
        continue;
      }
      if (!puff.visible) { puff.visible = true; puff.position.copy(pos); }
      // Each puff circles its own spot in the cloud and catches up with the player at its own pace, so the gas trails.
      const a = u.angle + this.clock * u.speed, r = u.reach * P.gasRadius;
      const k = 1 - Math.exp(-u.lag * dt);
      puff.position.x += (pos.x + Math.cos(a) * r - puff.position.x) * k;
      puff.position.y += (pos.y + u.height - puff.position.y) * k;
      puff.position.z += (pos.z + Math.sin(a) * r - puff.position.z) * k;
      puff.scale.setScalar(3.2 + Math.sin(this.clock * 1.3 + u.angle) * 0.6);
      puff.material.opacity = 0.2 * fade;
    }

    // Rings underfoot: one per running power-up, blinking in its last three seconds.
    for (const id in this.rings) {
      const ring = this.rings[id], left = this.time[id];
      ring.visible = left > 0 && (left > 3 || Math.floor(left * 6) % 2 === 0);
      if (!ring.visible) continue;
      ring.position.set(pos.x, pos.y + 0.12, pos.z);
      ring.scale.setScalar(id === 'gas' ? P.gasRadius : ring.userData.radius);
    }
  }
}
