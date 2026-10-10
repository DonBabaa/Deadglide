// The gun: pooled tracer bullets, impact sparks and a muzzle flash.
// Bullets stop when they hit the ground or anything solid.
import * as THREE from 'three';
import { config } from '../config.js';
import { heightAt } from '../world/terrain.js';
import { stats } from './stats.js';

const MAX_BULLETS = 96, MAX_SPARKS = 256;
const Z = new THREE.Vector3(0, 0, 1), ONE = new THREE.Vector3(1, 1, 1), HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const m = new THREE.Matrix4(), q = new THREE.Quaternion(), dir = new THREE.Vector3(), aim = new THREE.Vector3(), tmp = new THREE.Vector3();

function pool(geometry, color, count, scene) {
  const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial({ color, toneMapped: false }), count);
  mesh.frustumCulled = false;
  for (let i = 0; i < count; i++) mesh.setMatrixAt(i, HIDDEN);
  scene.add(mesh);
  return mesh;
}

export class Weapon {
  constructor(scene) {
    this.bullets = Array.from({ length: MAX_BULLETS }, () => ({ alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, damage: 0, pierce: 0, last: null }));
    this.sparks = Array.from({ length: MAX_SPARKS }, () => ({ life: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3() }));
    this.bulletMesh = pool(new THREE.BoxGeometry(0.035, 0.035, 1.8), 0xffd9a0, MAX_BULLETS, scene);
    this.sparkMesh = pool(new THREE.BoxGeometry(0.03, 0.03, 0.03), 0xffb060, MAX_SPARKS, scene);
    this.flash = new THREE.PointLight(0xffc880, 0, 14, 2);
    scene.add(this.flash);
    this.cooldown = 0;
    this.nextSpark = 0;
  }

  // Returns true on frames where a shot was fired. `damageMult` covers the
  // situational bonuses (airborne, trick buff) that main.js works out.
  update(dt, firing, aiming, muzzle, aimPoint, horde, damageMult = 1) {
    const G = config.gun;
    this.cooldown -= dt;
    let fired = false;
    if (firing && this.cooldown <= 0) {
      this.cooldown = 1 / (G.fireRate * stats.fireRate);
      fired = this.fire(muzzle, aimPoint, aiming ? G.spreadAim : G.spreadHip, horde, G.damage * stats.damage * damageMult);
    }

    this.flash.intensity *= Math.exp(-30 * dt);
    this.updateBullets(dt, horde);
    this.updateSparks(dt);
    return fired;
  }

  fire(muzzle, aimPoint, spreadDeg, horde, damage) {
    const spread = (spreadDeg * Math.PI) / 180;
    aim.copy(aimPoint).sub(muzzle).normalize();
    // Aim assist: if a monster is nearly in line, shoot at it instead.
    if (config.gun.aimAssist > 0 && horde.assist(muzzle, aim, config.gun.aimAssist, tmp)) aim.copy(tmp).sub(muzzle).normalize();

    // Split Shot: extra bullets fan out sideways.
    const count = stats.projectiles;
    let fired = false;
    for (let i = 0; i < count; i++) {
      const b = this.bullets.find((x) => !x.alive);
      if (!b) break;
      dir.copy(aim).applyAxisAngle(Y, (i - (count - 1) / 2) * 0.07);
      dir.x += (Math.random() - 0.5) * 2 * spread;
      dir.y += (Math.random() - 0.5) * 2 * spread;
      dir.z += (Math.random() - 0.5) * 2 * spread;
      dir.normalize();
      b.alive = true;
      b.life = config.gun.bulletLife;
      b.damage = damage;
      b.pierce = stats.pierce;
      b.last = null;
      b.pos.copy(muzzle);
      b.vel.copy(dir).multiplyScalar(config.gun.bulletSpeed);
      fired = true;
    }
    if (fired) {
      this.flash.position.copy(muzzle);
      this.flash.intensity = 60;
    }
    return fired;
  }

  blocked(p) { return p.y <= heightAt(p.x, p.z); }

  updateBullets(dt, horde) {
    this.bullets.forEach((b, i) => {
      if (!b.alive) return;
      // Move in short hops so fast bullets can't skip through thin things.
      const dist = b.vel.length() * dt, hops = Math.ceil(dist / 0.6);
      for (let h = 0; h < hops && b.alive; h++) {
        b.pos.addScaledVector(b.vel, dt / hops);
        const victim = horde.hitTest(b.pos);
        if (victim && victim !== b.last) {
          horde.damage(victim, b.damage, b.vel.x / config.gun.bulletSpeed, b.vel.z / config.gun.bulletSpeed);
          this.burst(b.pos, b.vel);
          b.last = victim;                       // Grindstone: carry on through, but never hit the same one twice
          if (b.pierce-- <= 0) b.alive = false;
        }
        if (b.alive && this.blocked(b.pos)) {
          this.burst(b.pos, b.vel);
          b.alive = false;
        }
      }
      b.life -= dt;
      if (b.life <= 0) b.alive = false;
      if (b.alive) this.bulletMesh.setMatrixAt(i, m.compose(b.pos, q.setFromUnitVectors(Z, dir.copy(b.vel).normalize()), ONE));
      else this.bulletMesh.setMatrixAt(i, HIDDEN);
    });
    this.bulletMesh.instanceMatrix.needsUpdate = true;
  }

  burst(at, vel) {
    for (let k = 0; k < 7; k++) {
      const s = this.sparks[this.nextSpark++ % MAX_SPARKS];
      s.life = 0.2 + Math.random() * 0.3;
      s.pos.copy(at).addScaledVector(vel, -0.004);
      s.vel.set(Math.random() - 0.5, Math.random() * 0.9 + 0.2, Math.random() - 0.5).multiplyScalar(9).addScaledVector(vel, -0.03);
    }
  }

  updateSparks(dt) {
    this.sparks.forEach((s, i) => {
      if (s.life <= 0) return;
      s.life -= dt;
      s.vel.y -= 25 * dt;
      s.pos.addScaledVector(s.vel, dt);
      if (s.life > 0) this.sparkMesh.setMatrixAt(i, m.makeTranslation(s.pos.x, s.pos.y, s.pos.z));
      else this.sparkMesh.setMatrixAt(i, HIDDEN);
    });
    this.sparkMesh.instanceMatrix.needsUpdate = true;
  }

  // Where the crosshair is pointing: walk the camera ray until it hits the world.
  aimPoint(camera, out) {
    camera.getWorldDirection(dir);
    out.copy(camera.position).addScaledVector(dir, 4);
    for (let d = 4; d < 320; d += 1.5) {
      out.addScaledVector(dir, 1.5);
      if (this.blocked(tmp.copy(out))) break;
    }
    return out;
  }
}
