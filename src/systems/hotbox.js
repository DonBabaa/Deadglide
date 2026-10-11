// HotBox Zones: hazy rings that appear out in the cemetery. Stay inside one
// for a few seconds and it fills with smoke; when it's full you get a random
// power-up. Leave early and the smoke thins out again. One zone is up at a time.
import * as THREE from 'three';
import { config } from '../config.js';
import { heightAt, groundAt, placeAt, lapNear } from '../world/terrain.js';
import { glowTexture } from '../world/textures.js';

const HAZE = 0xc9b8ff;   // every zone looks the same: you can't tell what's inside

// A floating label painted onto a canvas.
function labelSprite(text) {
  const c = document.createElement('canvas');
  c.width = 768; c.height = 128;
  const g = c.getContext('2d');
  g.font = "italic 84px Anton, Impact, 'Arial Narrow Bold', sans-serif";
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 12;
  g.strokeStyle = '#0c0c0e';
  g.strokeText(text.toUpperCase(), 384, 68);
  g.fillStyle = '#e6dcff';
  g.fillText(text.toUpperCase(), 384, 68);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, fog: false }));
  sprite.scale.set(12, 2, 1);
  return sprite;
}

export class HotBox {
  constructor(scene) {
    const H = config.hotbox, glow = glowTexture();
    this.group = new THREE.Group();
    this.group.visible = false;
    const see = { color: HAZE, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, toneMapped: false };
    this.wall = new THREE.Mesh(new THREE.CylinderGeometry(H.radius, H.radius, 5, 56, 1, true), new THREE.MeshBasicMaterial({ ...see, opacity: 0.14 }));
    this.wall.position.y = 1.5;
    this.rim = new THREE.Mesh(new THREE.TorusGeometry(H.radius, 0.12, 6, 72), new THREE.MeshBasicMaterial({ color: HAZE, fog: false, toneMapped: false }));
    this.rim.rotation.x = Math.PI / 2;
    this.beam = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: HAZE, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, opacity: 0.7 }));
    this.beam.position.y = 34;
    this.beam.scale.set(7, 70, 1);
    // The smoke. A few thin wisps when the zone is empty; while you stand in it
    // the cloud billows outward and upward until the whole ring is full.
    this.puffs = Array.from({ length: 26 }, (_, i) => {
      const puff = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: i % 3 ? 0xf1ecff : HAZE, transparent: true, depthWrite: false, opacity: 0 }));
      puff.userData = { angle: i * 2.4, reach: 0.15 + ((i * 7) % 11) / 12, height: 0.5 + (i % 6) * 0.75, speed: 0.2 + (i % 4) * 0.12 };
      return puff;
    });
    const label = labelSprite('HotBox Zone');
    label.position.y = 6.4;
    this.group.add(this.wall, this.rim, this.beam, label, ...this.puffs);
    scene.add(this.group);
    this.time = 0;
    this.reset();
  }

  reset() {
    this.zone = null;                             // { x, y, z, age, progress }
    this.wait = config.hotbox.firstDelay;         // seconds until the next zone appears
    this.group.visible = false;
  }

  // Put a new zone somewhere ahead of the player, on open ground.
  spawn(player) {
    const H = config.hotbox, heading = Math.atan2(player.vel.x, player.vel.z);
    for (let tries = 0; tries < 12; tries++) {
      const a = heading + (Math.random() - 0.5) * 2.6, d = H.minDistance + Math.random() * (H.maxDistance - H.minDistance);
      const [x, z] = placeAt(player.pos.x, player.pos.z, a, d);
      if (heightAt(x, z) - groundAt(x, z) > 0.6) continue;   // something is standing there
      this.zone = { x, y: groundAt(x, z), z, age: 0, progress: 0 };
      this.group.position.set(x, this.zone.y, z);
      this.group.visible = true;
      return;
    }
  }

  // Returns { zone, inside, captured }: captured is true on the frame a zone is completed.
  update(dt, player) {
    const H = config.hotbox;
    this.time += dt;
    if (!this.zone) {
      if ((this.wait -= dt) <= 0) this.spawn(player);
      return { zone: this.zone, inside: false, captured: false };
    }
    const zone = this.zone;
    zone.age += dt;
    this.group.position.z = zone.z = lapNear(zone.z, player.pos.z);
    const inside = Math.hypot(player.pos.x - zone.x, player.pos.z - zone.z) < H.radius && Math.abs(player.pos.y - zone.y) < 6;
    zone.progress = Math.max(0, Math.min(1, zone.progress + (inside ? dt / H.captureTime : -dt / H.drainTime)));

    // The smoke cloud grows with progress: wider, taller, thicker.
    const p = zone.progress, pulse = 0.5 + 0.5 * Math.sin(this.time * (3 + p * 10));
    for (const puff of this.puffs) {
      const u = puff.userData, a = u.angle + this.time * u.speed * (1 + p * 2);
      const r = u.reach * H.radius * (0.2 + 0.8 * p);
      puff.position.set(Math.cos(a) * r, (0.4 + u.height * (0.25 + 0.75 * p)) + Math.sin(this.time + u.angle) * 0.25, Math.sin(a) * r);
      puff.scale.setScalar(2.5 + 6.5 * p + Math.sin(this.time * 1.2 + u.angle) * 0.5);
      puff.material.opacity = 0.07 + 0.3 * p;
    }
    this.wall.material.opacity = 0.1 + 0.06 * pulse + 0.12 * p;
    this.beam.material.opacity = 0.45 + 0.35 * pulse;
    this.rim.position.y = 4 + Math.sin(this.time * 1.5) * 0.25;

    const captured = zone.progress >= 1;
    if (captured || zone.age > H.lifetime) {
      this.zone = null;
      this.group.visible = false;
      this.wait = captured ? H.respawnDelay : 3;   // an expired zone is replaced quickly
    }
    return { zone, inside, captured };
  }
}
