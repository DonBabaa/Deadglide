// What the riding throws up: nothing here changes how the game plays, or moves the camera, or touches the clock.
//   streaks   thin lines of air hanging in the world ahead of you, that you tear past: more of them, and longer, the
//             faster you go
//   dust      kicked up behind the wheels at speed
//   sparks    off the trucks on a rail, and off the wheels in a powerslide
//   trail     light left hanging behind the board through a trick
//   landing   a ring out across the ground and a burst of sparks when a trick is landed: bigger for a bigger trick
//   pop       a flash where a monster dies
import * as THREE from 'three';
import { glowTexture } from '../world/textures.js';

const STREAKS = 80, MOTES = 700, RINGS = 6, POPS = 10;
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const v = new THREE.Vector3(), dir = new THREE.Vector3(), side = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(), m = new THREE.Matrix4();
const Z = new THREE.Vector3(0, 0, 1), UP = new THREE.Vector3(0, 1, 0), tint = new THREE.Color();

export function createRideFx(scene, camera) {
  const glow = glowTexture();
  // Streaks: each a thin bar, lying along the way you are going.
  const streakMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.03, 0.03, 1), new THREE.MeshBasicMaterial({ color: 0xcfe2ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), STREAKS);
  streakMesh.frustumCulled = false;
  const streaks = Array.from({ length: STREAKS }, () => ({ pos: new THREE.Vector3(), on: false }));
  // Motes: dust, sparks and the trail are all points of light that fade (to black, which adds nothing).
  const pos = new Float32Array(MOTES * 3), col = new Float32Array(MOTES * 3);
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  moteGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const motePoints = new THREE.Points(moteGeo, new THREE.PointsMaterial({ map: glow, size: 0.34, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  motePoints.frustumCulled = false;
  const motes = Array.from({ length: MOTES }, () => ({ life: 0, span: 1, vel: new THREE.Vector3(), color: new THREE.Color(), drag: 0, fall: 0 }));
  let nextMote = 0;
  // Rings: the shock of a landing, flat on the ground under it.
  const rings = Array.from({ length: RINGS }, () => {
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, life: 0, size: 1 };
  });
  let nextRing = 0;
  // Pops: where something died.
  const pops = Array.from({ length: POPS }, () => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    sprite.visible = false;
    scene.add(sprite);
    return { sprite, life: 0, size: 1 };
  });
  let nextPop = 0;
  scene.add(streakMesh, motePoints);

  // One mote, at `at`, going `vel` (both Vector3s, copied), lasting `span` seconds.
  function mote(at, vel, color, span, drag = 1.5, fall = 0) {
    const i = nextMote++ % MOTES, o = motes[i];
    pos[i * 3] = at.x; pos[i * 3 + 1] = at.y; pos[i * 3 + 2] = at.z;
    o.vel.copy(vel);
    o.color.set(color);
    o.life = o.span = span;
    o.drag = drag;
    o.fall = fall;
  }
  const spread = (out, amount) => out.set((Math.random() - 0.5) * amount, (Math.random() - 0.5) * amount, (Math.random() - 0.5) * amount);
  let dust = 0, spark = 0, trail = 0;

  return {
    // Every frame. on: he is out riding (otherwise everything just dies away).
    update(dt, skater, on) {
      const speed = on ? skater.speed : 0, fast = Math.max(0, Math.min(1, (speed - 12) / 40));
      // ---- Streaks ----
      if (speed > 1) dir.copy(skater.vel).normalize();
      const want = Math.round(STREAKS * fast), long = 0.4 + speed * 0.07;
      q.setFromUnitVectors(Z, dir);
      streakMesh.material.opacity = 0.14 + 0.3 * fast;
      for (let i = 0; i < STREAKS; i++) {
        const o = streaks[i];
        if (i >= want) { if (o.on) { o.on = false; streakMesh.setMatrixAt(i, HIDDEN); } continue; }
        // Gone by (or never placed): put it back out in front, somewhere off to the side of where you are heading.
        if (!o.on || v.subVectors(o.pos, camera.position).dot(dir) < -4 || v.lengthSq() > 130 * 130) {
          side.crossVectors(dir, UP).normalize();
          const a = Math.random() * Math.PI * 2, r = 3.5 + Math.random() * 9, ahead = (o.on ? 45 : 8 + Math.random() * 45) + Math.random() * 25;
          o.pos.copy(skater.pos).addScaledVector(dir, ahead).addScaledVector(side, Math.cos(a) * r).addScaledVector(UP, 1.6 + Math.abs(Math.sin(a)) * r * 0.6);
          o.on = true;
        }
        streakMesh.setMatrixAt(i, m.compose(o.pos, q, s.set(1, 1, long)));
      }
      streakMesh.instanceMatrix.needsUpdate = true;
      // ---- What comes off the board ----
      if (on) {
        const grounded = skater.grounded && !skater.grinding;
        if (grounded && speed > 9) {                                    // dust off the back wheels
          dust += dt * (6 + speed * 0.9);
          while (dust >= 1) { dust -= 1; mote(v.copy(skater.pos).addScaledVector(dir, -0.3).add(spread(side, 0.3)), spread(s, 1.2).addScaledVector(dir, speed * 0.25).setY(0.4 + Math.random() * 0.9), 0x4a4e58, 0.5 + Math.random() * 0.4, 3); }
        }
        if (skater.grinding || (skater.drifting && speed > 6)) {        // sparks: steel on steel, or wheels going sideways
          spark += dt * (skater.grinding ? 90 : 55);
          while (spark >= 1) { spark -= 1; mote(v.copy(skater.pos).add(spread(side, 0.25)), spread(s, 5).addScaledVector(dir, speed * 0.35).setY(1 + Math.random() * 4), Math.random() < 0.3 ? 0xfff2c8 : 0xffa53a, 0.25 + Math.random() * 0.35, 1.2, 14); }
        }
        if (skater.trick && !skater.grounded) {                         // a trick, written in the air
          trail += dt * 110;
          while (trail >= 1) { trail -= 1; mote(v.copy(skater.pos).addScaledVector(skater.up, 0.15).add(spread(side, 0.22)), spread(s, 0.5), Math.random() < 0.5 ? 0xffd27a : 0x7fe3ff, 0.45 + Math.random() * 0.25, 2); }
        }
      }
      // ---- Motes ----
      for (let i = 0; i < MOTES; i++) {
        const o = motes[i];
        if (o.life <= 0) continue;
        o.life -= dt;
        const k = Math.max(0, o.life / o.span);
        o.vel.multiplyScalar(Math.max(0, 1 - o.drag * dt));
        o.vel.y -= o.fall * dt;
        pos[i * 3] += o.vel.x * dt; pos[i * 3 + 1] += o.vel.y * dt; pos[i * 3 + 2] += o.vel.z * dt;
        col[i * 3] = o.color.r * k; col[i * 3 + 1] = o.color.g * k; col[i * 3 + 2] = o.color.b * k;
      }
      moteGeo.attributes.position.needsUpdate = moteGeo.attributes.color.needsUpdate = true;
      // ---- Rings and pops ----
      for (const r of rings) {
        if (r.life <= 0) continue;
        r.life -= dt / 0.42;
        const k = 1 - Math.max(0, r.life), e = 1 - (1 - k) ** 3;
        r.mesh.scale.setScalar(0.4 + e * r.size);
        r.mesh.material.opacity = Math.max(0, r.life) * 0.5;
        r.mesh.visible = r.life > 0;
      }
      for (const p of pops) {
        if (p.life <= 0) continue;
        p.life -= dt / 0.2;
        p.sprite.scale.setScalar(p.size * (0.5 + (1 - Math.max(0, p.life)) * 1.6));
        p.sprite.material.opacity = Math.max(0, p.life) * 0.9;
        p.sprite.visible = p.life > 0;
      }
    },
    // He has come down. boost: how big the trick was (0: none, or a sloppy one: then it is only dust).
    land(skater, boost) {
      const clean = boost > 0, n = clean ? Math.min(70, 16 + boost * 6) : 14;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, out = clean ? 3 + Math.random() * (4 + boost * 0.6) : 2 + Math.random() * 2;
        side.set(Math.cos(a), 0, Math.sin(a));
        mote(v.copy(skater.pos).addScaledVector(side, 0.3), s.copy(side).multiplyScalar(out).setY(clean ? 1 + Math.random() * 3.5 : 0.6), clean ? (Math.random() < 0.4 ? 0xfff2c8 : 0xffb84a) : 0x4a4e58, 0.3 + Math.random() * 0.4, 2.2, clean ? 9 : 0);
      }
      if (!clean) return;
      const r = rings[nextRing++ % RINGS];
      r.life = 1;
      r.size = 2.2 + Math.min(9, boost * 0.9);
      r.mesh.position.copy(skater.pos).addScaledVector(skater.up, 0.06);
      r.mesh.quaternion.setFromUnitVectors(Z, skater.up);
      r.mesh.material.color.set(boost > 6 ? 0x7fe3ff : 0xffd27a);
    },
    // Something died at (x, y, z).
    kill(x, y, z, headshot) {
      const p = pops[nextPop++ % POPS];
      p.life = 1;
      p.size = headshot ? 3.2 : 2.1;
      p.sprite.position.set(x, y + 0.9, z);
      p.sprite.material.color.set(headshot ? 0xffe08a : 0xff5a3a);
      for (let i = 0; i < (headshot ? 16 : 9); i++) mote(v.set(x, y + 0.9, z), spread(s, 9).setY(Math.random() * 6), tint.set(headshot ? 0xffe08a : 0xff6a3a), 0.25 + Math.random() * 0.3, 2, 12);
    },
    reset() {
      for (const o of motes) o.life = 0;
      col.fill(0);
      for (const r of rings) { r.life = 0; r.mesh.visible = false; }
      for (const p of pops) { p.life = 0; p.sprite.visible = false; }
      streaks.forEach((o, i) => { o.on = false; streakMesh.setMatrixAt(i, HIDDEN); });
    },
  };
}
