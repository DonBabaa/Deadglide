// The gun in Kirky's hand: which weapons are owned, firing, pooled tracer
// bullets, impact sparks and a muzzle flash. Bullets stop when they hit the
// ground or anything solid. The weapons themselves are described in weapons.js.
import * as THREE from 'three';
import { config } from '../config.js';
import { blockedAt } from '../world/terrain.js';
import { stats } from './stats.js';
import { WEAPONS } from './weapons.js';

const MAX_BULLETS = 160, MAX_SPARKS = 256, MAX_FIRE = 420;
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1), HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
const dir = new THREE.Vector3(), aim = new THREE.Vector3(), tmp = new THREE.Vector3();
const q2 = new THREE.Quaternion(), axis = new THREE.Vector3(), X = new THREE.Vector3(1, 0, 0);
const PROBES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
// Fire's colour through its life (k: 0 = just lit, 1 = out): white-hot, yellow, orange, a dull red, gone. Writes r, g, b into `to` at `i`.
function flameTint(to, i, k, bright = 1) {
  const fade = bright * (k < 0.75 ? 1 : (1 - k) / 0.25);
  to[i] = fade * (k < 0.55 ? 1 : 1 - (k - 0.55) * 1.1);
  to[i + 1] = fade * Math.max(0.04, 0.9 - 1.25 * k);
  to[i + 2] = fade * Math.max(0.01, 0.6 - 2.6 * k);
}
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
    // Fire (the flamethrower, and anything it has set alight): soft glowing points, each with its own size and
    // colour. The flamethrower's "bullets" are drawn as these, with a lot more thrown in round them for body.
    this.embers = Array.from({ length: MAX_FIRE }, () => ({ life: 0, total: 1, pos: new THREE.Vector3(), vel: new THREE.Vector3(), size: 1 }));
    this.nextEmber = 0;
    const N = MAX_BULLETS + MAX_FIRE, fire = new THREE.BufferGeometry();
    fire.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    fire.setAttribute('tint', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    fire.setAttribute('size', new THREE.BufferAttribute(new Float32Array(N), 1));
    this.fireFx = new THREE.Points(fire, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'attribute float size; attribute vec3 tint; varying vec3 vTint; void main() { vTint = tint; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * 720.0 / -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying vec3 vTint; void main() { float d = length(gl_PointCoord - 0.5) * 2.0; float a = pow(max(0.0, 1.0 - d), 1.6); gl_FragColor = vec4(vTint * a, a); }',
    }));
    this.fireFx.frustumCulled = false;
    this.fireLight = new THREE.PointLight(0xff7a2a, 0, 28, 1.8);
    scene.add(this.fireFx, this.fireLight);
    // Sawblades and ice lances have shapes of their own.
    this.bladeMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.46, 0.46, 0.04, 8), new THREE.MeshStandardMaterial({ color: 0xd4dbe2, metalness: 0.85, roughness: 0.22, emissive: 0x3a4148 }), MAX_BULLETS);
    this.lanceMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(0.17, 2.8, 6).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xbfeaff, transparent: true, opacity: 0.92, toneMapped: false }), MAX_BULLETS);
    for (const mesh of [this.bladeMesh, this.lanceMesh]) {
      mesh.frustumCulled = false;
      for (let i = 0; i < MAX_BULLETS; i++) mesh.setMatrixAt(i, HIDDEN);
      scene.add(mesh);
    }
    this.clock = 0;
    this.clangs = 0;   // blades that have bounced since main.js last asked (it plays the sound)
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
    for (const mesh of [this.bulletMesh, this.bladeMesh, this.lanceMesh]) {
      for (let i = 0; i < MAX_BULLETS; i++) mesh.setMatrixAt(i, HIDDEN);
      mesh.instanceMatrix.needsUpdate = true;
    }
    for (const e of this.embers) e.life = 0;
    this.fireFx.geometry.setDrawRange(0, 0);
    this.fireLight.intensity = 0;
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
      b.total = W.life;
      b.bounces = W.bounce || 0;
      if (W.flame) {
        (b.seen ??= new Set()).clear();   // (what this puff has already burnt)
        // Flame for show round the one that does the burning: a tight bright core, and looser stuff that billows.
        for (let k = 0; k < 3; k++) this.ember(muzzle, tmp.copy(dir).multiplyScalar(W.speed * (0.75 + Math.random() * 0.4)).add(axis.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).multiplyScalar(5)), W.life * (0.6 + Math.random() * 0.7), 0.5 + Math.random() * 0.6);
      }
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
    this.shot = { origin: muzzle.clone(), dir: dir.clone(), reach: 0 };   // (the last beam fired: Free Ride judges its own hits from it)
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
    this.shot.reach = travelled;
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
      if (W.flame) { b.vel.multiplyScalar(Math.exp(-1.6 * dt)); b.vel.y += 2.5 * dt; }   // fire slows, billows and rises
      // Move in short hops so fast bullets can't skip through thin things.
      const speed = b.vel.length(), hops = Math.ceil((speed * dt) / 0.6);
      for (let h = 0; h < hops && b.alive; h++) {
        b.pos.addScaledVector(b.vel, dt / hops);
        const victim = horde.hitTest(b.pos), solid = this.blocked(b.pos);
        if (W.flame) {   // fire goes through everything, burning each thing once and leaving it alight
          if (victim && !b.seen.has(victim)) {
            b.seen.add(victim);
            horde.damage(victim, b.damage, b.vel.x / speed, b.vel.z / speed, false, 0, true);
            horde.ignite(victim, W.burn.seconds, W.burn.dps * stats.damage);
          }
          if (solid) b.alive = false;
          continue;
        }
        if (W.blast > 0) {
          if (victim || solid) this.explode(b, horde);
        } else if (victim && victim !== b.last) {
          const head = b.pos.y > victim.y + victim.T.height * victim.scale * HEAD;
          horde.damage(victim, b.damage * (head ? config.gun.headshotMult : 1), b.vel.x / speed, b.vel.z / speed, head, W.knock);
          this.burst(b.pos, b.vel, head ? 14 : 7);
          if (W.chill) horde.chill(victim, W.chill.seconds, W.chill.slow);
          b.last = victim;                       // piercing: carry on through, but never hit the same one twice
          if (b.pierce-- <= 0) this.spent(b, horde);
        }
        if (b.alive && solid) {
          this.burst(b.pos, b.vel);
          if (b.bounces > 0) this.ricochet(b, dt / hops);   // a sawblade glances off
          else this.spent(b, horde);
        }
      }
      b.life -= dt;
      if (b.life <= 0) {
        if (b.alive && W.blast > 0) this.explode(b, horde);
        else if (b.alive) this.spent(b, horde);   // (an ice lance that hit nothing still shatters where it ends up)
        b.alive = false;
      }
      // Draw it: a tracer, a spinning blade or a lance of ice. (Fire is drawn with the rest of the fire, below.)
      this.bulletMesh.setMatrixAt(i, HIDDEN);
      this.bladeMesh.setMatrixAt(i, HIDDEN);
      this.lanceMesh.setMatrixAt(i, HIDDEN);
      if (!b.alive || W.flame) return;
      dir.copy(b.vel).normalize();
      if (W.blade) {
        axis.crossVectors(dir, Y);   // it flies edge-on, like a thrown disc...
        if (axis.lengthSq() < 1e-4) axis.copy(X);
        q.setFromUnitVectors(Y, axis.normalize()).multiply(q2.setFromAxisAngle(Y, this.clock * 38 + i));   // ...spinning
        this.bladeMesh.setMatrixAt(i, m.compose(b.pos, q, sc.setScalar(1)));
      } else if (W.lance) this.lanceMesh.setMatrixAt(i, m.compose(b.pos, q.setFromUnitVectors(Z, dir), sc.setScalar(1)));
      else this.bulletMesh.setMatrixAt(i, m.compose(b.pos, q.setFromUnitVectors(Z, dir), sc.set(W.tracer[0], W.tracer[0], W.tracer[1])));
    });
    this.bulletMesh.instanceMatrix.needsUpdate = this.bladeMesh.instanceMatrix.needsUpdate = this.lanceMesh.instanceMatrix.needsUpdate = true;
    this.updateFire(dt, horde);
  }

  // Everything that's burning: the flamethrower's jet, the puffs thrown in round it, and monsters alight.
  updateFire(dt, horde) {
    this.clock += dt;
    const g = this.fireFx.geometry, P = g.attributes.position.array, T = g.attributes.tint.array, S = g.attributes.size.array;
    let n = 0, lit = 0;
    const put = (pos, k, size, bright) => {
      P[n * 3] = pos.x; P[n * 3 + 1] = pos.y; P[n * 3 + 2] = pos.z;
      flameTint(T, n * 3, k, bright);
      S[n++] = size;
    };
    // The jet itself: tight and white-hot at the nozzle, opening out.
    for (const b of this.bullets) {
      if (!b.alive || !b.def.flame) continue;
      const k = 1 - b.life / b.total;
      put(b.pos, k, 0.7 + 3.4 * k, 1);
      if (k > 0.25 && k < 0.6) { this.fireLight.position.copy(b.pos); lit++; }
    }
    // Monsters on fire throw flames of their own.
    for (const e of horde.enemies) {
      if (!(e.fire > 0) || Math.random() > dt * 14) continue;
      const tall = e.T.height * e.scale, wide = e.T.radius * e.scale;
      this.ember(tmp.set(e.x + (Math.random() - 0.5) * wide * 1.6, e.y + (0.2 + Math.random() * 0.7) * tall, e.z + (Math.random() - 0.5) * wide * 1.6), axis.set((Math.random() - 0.5) * 1.5, 2 + Math.random() * 3, (Math.random() - 0.5) * 1.5), 0.35 + Math.random() * 0.35, 0.5 + Math.random() * 0.5 * e.scale);
    }
    for (const e of this.embers) {
      if (e.life <= 0) continue;
      e.life -= dt;
      e.vel.multiplyScalar(Math.exp(-1.8 * dt));
      e.vel.y += 4 * dt;                                                // it billows up
      e.vel.x += (Math.random() - 0.5) * 18 * dt; e.vel.z += (Math.random() - 0.5) * 18 * dt;   // and flickers
      e.pos.addScaledVector(e.vel, dt);
      const k = 1 - Math.max(0, e.life) / e.total;
      if (e.life > 0) put(e.pos, k, e.size * (0.8 + 2.6 * k), 0.8);
    }
    g.setDrawRange(0, n);
    g.attributes.position.needsUpdate = g.attributes.tint.needsUpdate = g.attributes.size.needsUpdate = true;
    this.fireLight.intensity = lit ? 260 + Math.random() * 180 : this.fireLight.intensity * Math.exp(-14 * dt);   // the jet lights the place up, flickering
  }

  // A bullet has stopped. (An ice lance shatters: everything round it is chilled.)
  spent(b, horde) {
    b.alive = false;
    if (b.def.shatter) {
      horde.chillArea(b.pos, b.def.shatter, b.def.chill.seconds, b.def.chill.slow);
      for (let k = 0; k < 3; k++) this.burst(b.pos, tmp.set(Math.random() - 0.5, -0.6, Math.random() - 0.5).multiplyScalar(70), 10);
    }
  }

  // A sawblade has run into the world: step back out of it, find which way the surface faces, and bounce.
  ricochet(b, step) {
    b.bounces--;
    b.pos.addScaledVector(b.vel, -step);
    axis.set(0, 0, 0);
    for (const [x, y, z] of PROBES) if (this.blocked(tmp.set(b.pos.x + x * 0.5, b.pos.y + y * 0.5, b.pos.z + z * 0.5))) axis.sub(tmp.set(x, y, z));
    if (axis.lengthSq() < 0.5) axis.copy(b.vel).negate();
    axis.normalize();
    const into = b.vel.dot(axis);
    if (into < 0) b.vel.addScaledVector(axis, -2 * into);
    b.last = null;   // (it can cut the same monster again on the way back)
    this.clangs++;
  }

  // One puff of fire for show.
  ember(at, vel, life, size) {
    const e = this.embers[this.nextEmber++ % MAX_FIRE];
    e.life = e.total = life;
    e.pos.copy(at);
    e.vel.copy(vel);
    e.size = size;
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
