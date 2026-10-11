// Gold: some monsters drop coins, coins near you fly to you. What you're
// carrying is only yours once you leave through the exit portal (main.js banks
// it then); die and it's gone.
import * as THREE from 'three';
import { config } from '../config.js';
import { stats } from '../player/stats.js';

const MAX_COINS = 240;
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();

export class Gold {
  constructor(scene) {
    this.coins = [];
    this.mesh = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.24, 0.24, 0.06, 14).rotateX(Math.PI / 2),   // a coin standing on its edge
      new THREE.MeshBasicMaterial({ color: 0xffc233, toneMapped: false }), MAX_COINS);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < MAX_COINS; i++) this.mesh.setMatrixAt(i, HIDDEN);
    scene.add(this.mesh);
    this.reset();
  }

  reset() {
    this.coins.length = 0;
    this.carried = 0;   // gold picked up this run, not yet banked
    this.spin = 0;
  }

  drop(x, y, z, amount) {
    if (this.coins.length >= MAX_COINS) this.coins.shift();
    this.coins.push({ x, y: y + 0.6, z, amount, age: 0, pulled: false });
  }

  // A monster died: maybe it was carrying something. `overtime`: after the boss, they carry more.
  maybeDrop(kill, overtime) {
    const G = config.gold;
    if (kill.boss) {
      // The boss bursts into a ring of fat coins.
      for (let i = 0; i < 10; i++) this.drop(kill.x + Math.sin(i * 0.63) * 4, kill.y, kill.z + Math.cos(i * 0.63) * 4, G.bossGold / 10);
    } else if (kill.elite) this.drop(kill.x, kill.y, kill.z, G.eliteGold);
    else if (Math.random() < G.dropChance * (overtime ? G.overtimeBonus : 1)) this.drop(kill.x, kill.y, kill.z, G.coinValue);
  }

  // Returns the gold picked up this frame (0 if none).
  update(dt, player) {
    const G = config.gold, radius = config.xp.pickupRadius * stats.pickupRadius;
    this.spin += dt * 4;
    let gained = 0;
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      c.age += dt;
      v.set(player.pos.x - c.x, player.pos.y + 0.8 - c.y, player.pos.z - c.z);
      const dist = v.length();
      if (dist < radius) c.pulled = true;   // once caught, a coin follows you until it lands
      if (c.pulled) {
        const speed = Math.max(config.xp.pullSpeed, player.speed * 1.6);
        if (dist < 1.2 || dist < speed * dt) {
          gained += c.amount * stats.goldGain;
          this.coins.splice(i, 1);
          continue;
        }
        c.x += (v.x / dist) * speed * dt; c.y += (v.y / dist) * speed * dt; c.z += (v.z / dist) * speed * dt;
      } else if (c.age > G.lifetime) this.coins.splice(i, 1);
    }
    this.carried += gained;

    for (let i = 0; i < MAX_COINS; i++) {
      const c = this.coins[i];
      if (!c) { this.mesh.setMatrixAt(i, HIDDEN); continue; }
      const size = 0.9 + Math.min(1.3, c.amount * 0.035);   // bigger piles, bigger coins
      this.mesh.setMatrixAt(i, m.compose(v.set(c.x, c.y + Math.sin(this.spin * 0.7 + i) * 0.1, c.z), q.setFromEuler(e.set(0, this.spin + i, 0)), sc.setScalar(size)));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    return gained;
  }
}
