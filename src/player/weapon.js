// The gun in Kirky's hand: which weapons are owned, firing, pooled tracer
// bullets, impact sparks and a muzzle flash. Bullets stop when they hit the
// ground or anything solid. The weapons themselves are described in weapons.js.
import * as THREE from 'three';
import { config } from '../config.js';
import { blockedAt } from '../world/terrain.js';
import { stats } from './stats.js';
import { WEAPONS } from './weapons.js';

const MAX_BULLETS = 160, MAX_SPARKS = 256;
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1), HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
const dir = new THREE.Vector3(), aim = new THREE.Vector3(), tmp = new THREE.Vector3();
const HEAD = 0.78;   // hits above this fraction of a monster's height are headshots

function pool(geometry, color, count, scene) {
  const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial({ color, toneMapped: false }), count);
  mesh.frustumCulled = false;
  for (let i = 0; i < count; i++) mesh.setMatrixAt(i, HIDDEN);
  scene.add(mesh);
  return mesh;
}

export class Weapon {
  constructor(scene) {
    this.bullets = Array.from({ length: MAX_BULLETS }, () => ({ alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, def: null, damage: 0, pierce: 0, last: null }));
    this.sparks = Array.from({ length: MAX_SPARKS }, () => ({ life: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3() }));
    this.bulletMesh = pool(new THREE.BoxGeometry(0.035, 0.035, 1.8), 0xffd9a0, MAX_BULLETS, scene);
    this.sparkMesh = pool(new THREE.BoxGeometry(0.03, 0.03, 0.03), 0xffb060, MAX_SPARKS, scene);
    this.flash = new THREE.PointLight(0xffc880, 0, 14, 2);
    scene.add(this.flash);
    // Laser beams (sniper): a glowing core inside a wider halo, fading fast.
    this.beams = Array.from({ length: 4 }, () => {
      const core = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 8, 1, true).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff1e6, transparent: true, toneMapped: false, fog: false }));
      const halo = new THREE.Mesh(core.geometry, new THREE.MeshBasicMaterial({ color: 0xff3b1f, transparent: true, toneMapped: false, fog: false, blending: THREE.AdditiveBlending, depthWrite: false }));
      core.visible = halo.visible = false;
      core.frustumCulled = halo.frustumCulled = false;
      scene.add(core, halo);
      return { core, halo, life: 0, length: 1 };
    });
    this.nextBeam = 0;
    this.beamEnd = new THREE.Vector3();
    this.nextSpark = 0;
    this.reset();
  }

  // ---- Which gun ---------------------------------------------------------------

  reset() {
    this.owned = ['pistol'];
    this.def = WEAPONS.pistol;
    this.cooldown = 0;
    for (const b of this.bullets) b.alive = false;
    for (const beam of this.beams) { beam.life = 0; beam.core.visible = beam.halo.visible = false; }
  }

  has(id) { return this.owned.includes(id); }

  equip(id) {
    if (!this.has(id) || this.def.id === id) return false;
    this.def = WEAPONS[id];
    this.cooldown = Math.min(this.cooldown, 0.25);   // a short beat to bring the new gun up
    return true;
  }

  // A new gun from a chest: pick it up and switch to it.
  give(id) {
    if (!this.has(id)) this.owned.push(id);
    this.equip(id);
  }

  equipSlot(index) { return this.owned[index] ? this.equip(this.owned[index]) : false; }
  cycle(step) {
    const i = this.owned.indexOf(this.def.id), n = this.owned.length;
    return this.equip(this.owned[(i + step + n) % n]);
  }

  // ---- Firing --------------------------------------------------------------------

  // Returns true on frames where a shot was fired. `damageMult` covers the
  // situational bonuses (airborne, trick buff) that main.js works out.
  update(dt, firing, aiming, muzzle, aimPoint, horde, damageMult = 1) {
    const W = this.def;
    this.cooldown -= dt;
    let fired = false;
    if (firing && this.cooldown <= 0) {
      this.cooldown = 1 / (W.fireRate * stats.fireRate * (stats.frenzy > 0 ? 2 : 1));
      fired = this.fire(muzzle, aimPoint, aiming ? W.spreadAim : W.spreadHip, horde, W.damage * stats.damage * damageMult);
    }

    this.flash.intensity *= Math.exp(-30 * dt);
    for (const beam of this.beams) {
      if (beam.life <= 0) continue;
      beam.life -= dt / 0.45;
      const t = Math.max(0, beam.life);
      beam.core.scale.set(0.05 * t, 0.05 * t, beam.length);
      beam.halo.scale.set(0.3 * t * t, 0.3 * t * t, beam.length);   // a fat flare that collapses to a thread
      beam.core.material.opacity = t;
      beam.halo.material.opacity = t * 0.7;
      beam.core.visible = beam.halo.visible = t > 0;
    }
    this.updateBullets(dt, horde);
    this.updateSparks(dt);
    return fired;
  }

  fire(muzzle, aimPoint, spreadDeg, horde, damage) {
    const W = this.def, spread = (spreadDeg * Math.PI) / 180;
    aim.copy(aimPoint).sub(muzzle).normalize();
    // Aim assist: if a monster is nearly in line, shoot at it instead.
    if (config.gun.aimAssist > 0 && horde.assist(muzzle, aim, config.gun.aimAssist, tmp)) aim.copy(tmp).sub(muzzle).normalize();
    if (W.gravity > 0) aim.y += 0.12;   // lobbed shells are thrown a little upward
    if (W.beam) return this.fireBeam(muzzle, aim, spread, horde, damage);

    // Split Shot adds bullets; single-bullet guns fan them out sideways.
    const count = W.pellets + stats.projectiles - 1;
    let fired = false;
    for (let i = 0; i < count; i++) {
      const b = this.bullets.find((x) => !x.alive);
      if (!b) break;
      dir.copy(aim);
      if (W.pellets === 1) dir.applyAxisAngle(Y, (i - (count - 1) / 2) * 0.07);
      dir.x += (Math.random() - 0.5) * 2 * spread;
      dir.y += (Math.random() - 0.5) * 2 * spread;
      dir.z += (Math.random() - 0.5) * 2 * spread;
      dir.normalize();
      b.alive = true;
      b.def = W;
      b.life = W.life;
      b.damage = damage;
      b.pierce = W.pierce + stats.pierce;
      b.last = null;
      b.pos.copy(muzzle);
      b.vel.copy(dir).multiplyScalar(W.speed);
      fired = true;
    }
    if (fired) {
      this.flash.position.copy(muzzle);
      this.flash.intensity = 60 * W.flash;
    }
    return fired;
  }

  // Laser: instant, and it keeps going through every monster in line until it meets the world.
  fireBeam(muzzle, aimDir, spread, horde, damage) {
    const W = this.def, hit = new Set();
    dir.copy(aimDir);
    dir.x += (Math.random() - 0.5) * 2 * spread;
    dir.y += (Math.random() - 0.5) * 2 * spread;
    dir.z += (Math.random() - 0.5) * 2 * spread;
    dir.normalize();
    const p = this.beamEnd.copy(muzzle);
    let travelled = 0;
    for (; travelled < 420; travelled += 0.5) {
      p.addScaledVector(dir, 0.5);
      if (this.blocked(p)) break;
      const victim = horde.hitTest(p);
      if (!victim || hit.has(victim)) continue;
      hit.add(victim);
      const head = p.y > victim.y + victim.T.height * victim.scale * HEAD;
      horde.damage(victim, damage * (head ? config.gun.headshotMult : 1), dir.x, dir.z, head, W.knock);
      this.burst(p, tmp.copy(dir).multiplyScalar(120), 10);
    }
    this.burst(p, tmp.copy(dir).multiplyScalar(160), 24);   // where it finally lands

    const beam = this.beams[this.nextBeam++ % this.beams.length];
    beam.life = 1;
    beam.length = travelled;
    for (const mesh of [beam.core, beam.halo]) {
      mesh.position.copy(muzzle).addScaledVector(dir, travelled / 2);
      mesh.quaternion.setFromUnitVectors(Z, dir);
    }
    this.flash.position.copy(p).addScaledVector(dir, -0.6);   // light up whatever it hit
    this.flash.intensity = 500;
    return true;
  }

  blocked(p) { return blockedAt(p.x, p.y, p.z); }

  updateBullets(dt, horde) {
    this.bullets.forEach((b, i) => {
      if (!b.alive) return;
      const W = b.def;
      b.vel.y -= W.gravity * dt;
      // Move in short hops so fast bullets can't skip through thin things.
      const speed = b.vel.length(), hops = Math.ceil((speed * dt) / 0.6);
      for (let h = 0; h < hops && b.alive; h++) {
        b.pos.addScaledVector(b.vel, dt / hops);
        const victim = horde.hitTest(b.pos), solid = this.blocked(b.pos);
        if (W.blast > 0) {
          if (victim || solid) this.explode(b, horde);
        } else if (victim && victim !== b.last) {
          const head = b.pos.y > victim.y + victim.T.height * victim.scale * HEAD;
          horde.damage(victim, b.damage * (head ? config.gun.headshotMult : 1), b.vel.x / speed, b.vel.z / speed, head, W.knock);
          this.burst(b.pos, b.vel, head ? 14 : 7);
          b.last = victim;                       // piercing: carry on through, but never hit the same one twice
          if (b.pierce-- <= 0) b.alive = false;
        }
        if (b.alive && solid) {
          this.burst(b.pos, b.vel);
          b.alive = false;
        }
      }
      b.life -= dt;
      if (b.life <= 0) {
        if (b.alive && W.blast > 0) this.explode(b, horde);
        b.alive = false;
      }
      if (b.alive) {
        this.bulletMesh.setMatrixAt(i, m.compose(b.pos, q.setFromUnitVectors(Z, dir.copy(b.vel).normalize()), sc.set(W.tracer[0], W.tracer[0], W.tracer[1])));
      } else this.bulletMesh.setMatrixAt(i, HIDDEN);
    });
    this.bulletMesh.instanceMatrix.needsUpdate = true;
  }

  explode(b, horde) {
    horde.shockwave(b.pos, b.def.blast, b.damage);
    for (let k = 0; k < 4; k++) this.burst(b.pos, tmp.set(Math.random() - 0.5, -1, Math.random() - 0.5).multiplyScalar(60), 12);
    this.flash.position.copy(b.pos);
    this.flash.intensity = 220;
    b.alive = false;
  }

  burst(at, vel, count = 7) {
    for (let k = 0; k < count; k++) {
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
