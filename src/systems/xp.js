// XP: monsters drop glowing gems, gems near you fly to you, and enough of
// them levels you up (main.js then offers an upgrade).
import * as THREE from 'three';
import { config } from '../config.js';
import { stats } from '../player/stats.js';

const MAX_GEMS = 400;
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();

export class Xp {
  constructor(scene) {
    this.gems = [];
    this.mesh = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(0.2),
      new THREE.MeshBasicMaterial({ color: 0x7dffb0, toneMapped: false }), MAX_GEMS);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < MAX_GEMS; i++) this.mesh.setMatrixAt(i, HIDDEN);
    scene.add(this.mesh);
    this.reset();
  }

  reset() {
    this.gems.length = 0;
    this.level = 1;
    this.xp = 0;
    this.spin = 0;
  }

  // XP needed to finish the current level.
  get needed() { return Math.round(config.xp.firstLevel + config.xp.perLevel * (this.level - 1)); }

  drop(x, y, z, amount) {
    if (this.gems.length >= MAX_GEMS) this.gems.shift();
    this.gems.push({ x, y: y + 0.5, z, amount, age: 0, pulled: false });
  }

  // Every gem on the ground starts flying to the player (Grave Magnet).
  pullAll() { for (const g of this.gems) g.pulled = true; }

  // Returns how many levels were gained this frame.
  update(dt, player) {
    const X = config.xp, radius = X.pickupRadius * stats.pickupRadius;
    this.spin += dt * 3;
    let gained = 0;
    for (let i = this.gems.length - 1; i >= 0; i--) {
      const g = this.gems[i];
      g.age += dt;
      v.set(player.pos.x - g.x, player.pos.y + 0.8 - g.y, player.pos.z - g.z);
      const dist = v.length();
      if (dist < radius) g.pulled = true;   // once caught, a gem follows you until it lands
      if (g.pulled) {
        const speed = Math.max(X.pullSpeed, player.speed * 1.6);
        if (dist < 1.2 || dist < speed * dt) {
          this.xp += g.amount * stats.xpGain;
          this.gems.splice(i, 1);
          gained++;
          continue;
        }
        g.x += (v.x / dist) * speed * dt; g.y += (v.y / dist) * speed * dt; g.z += (v.z / dist) * speed * dt;
      } else if (g.age > X.gemLifetime) {
        this.gems.splice(i, 1);
      }
    }

    let levels = 0;
    while (this.xp >= this.needed) {
      this.xp -= this.needed;
      this.level++;
      levels++;
    }

    for (let i = 0; i < MAX_GEMS; i++) {
      const g = this.gems[i];
      if (!g) { this.mesh.setMatrixAt(i, HIDDEN); continue; }
      const size = 0.8 + Math.min(1.2, g.amount * 0.08);
      this.mesh.setMatrixAt(i, m.compose(v.set(g.x, g.y + Math.sin(this.spin + i) * 0.12, g.z), q.setFromEuler(e.set(0, this.spin + i, 0)), sc.setScalar(size)));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    return { levels, collected: gained };
  }
}
