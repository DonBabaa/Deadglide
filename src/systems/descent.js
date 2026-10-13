// The Long Way Down (level 5): what chases you down the hill.
//   the collapse   a wall of dust coming down the course behind you. It starts slowly and keeps getting faster,
//                  and it is never far behind however fast you go. If it reaches you, that is the end of the run.
//   Goyitus Ultimus  the three brothers you killed, run together into one ghost that flies down the hill ahead of
//                  you. He throws at where you are about to be (a red ring on the ground shows where: steer round
//                  it, or be in the air or on a rail when it lands; what hits you hurts, and slows you, and the
//                  collapse is right behind). Every few seconds he begins a rite: sigils light in the sky. Shoot
//                  them all out before it is done and he is stunned and loses a seal; fail, and he lets fly with
//                  everything. Six seals, and he is finished.
//   the clock      how long you have been going. Off the lip of the last ramp, it stops: that is your time.
// main.js calls update() every frame of the level and acts on what it returns.
import * as THREE from 'three';
import { config } from '../config.js';
import { DESCENT, along, descentHeight, cityAt, sewerAt } from '../world/descent.js';
import { buildDescentScene } from '../world/descentScene.js';
import { ENEMY_PARTS } from '../enemies/enemyModels.js';
import { ENEMY_TYPES } from '../enemies/types.js';
import { pose, aimOf, hasMobAnims } from '../enemies/mobAnims.js';
import { glowTexture } from '../world/textures.js';
import { buildCasinoFront } from '../world/casinoFront.js';
import { load, store } from './storage.js';
import { difficulty } from './difficulty.js';

const X0 = 48, Z0 = 48;
const RED = new THREE.Color(2.2, 0.35, 0.25);
// The way you leave the last ramp in the closing scene, and where the Moon hangs: ahead, a little above the horizon.
export const FLIGHT = new THREE.Vector3(0, 0.3, -1).normalize();
const MOON_FAR = 900;
const smooth = (k) => { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); };

// What each brother throws: how many at once, how far apart across the course, and how close one has to land to hit.
const THROWS = {
  blob: { count: 1, spread: 0, radius: 3.4 },   // Hamzitus: one big ball of filth
  bone: { count: 2, spread: 5, radius: 2.3 },   // Rubistus: a pair of bones
  card: { count: 3, spread: 6.5, radius: 2.2 }, // Babitus: a fan of cards
};

// One of the dead bosses, as a ghost: his model in his own colours, see-through, with a glow of `tint` round him.
// place: 'side' (flying beside you) or 'ahead' (up in front of you).
export function ghost(name, tint, throws, map) {
  const group = new THREE.Group(), T = ENEMY_TYPES[name], arms = [];
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false });
  for (const p of ENEMY_PARTS[name]()) {
    const mesh = new THREE.Mesh(p.geometry, material);
    mesh.position.set(...p.pivot);
    if (p.swing[0] > 0.4) arms.push(mesh);
    group.add(mesh);
  }
  const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map, color: tint, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  aura.position.y = T.height * 0.55;
  aura.scale.setScalar(T.height * 2.6);
  group.add(aura);
  group.scale.setScalar(T.scale * 0.55);
  // (his colours, pushed toward his tint and brightened: unlit, he would be nearly black)
  const base = new THREE.Color(tint).lerp(new THREE.Color(0xffffff), 0.45).multiplyScalar(2.1);
  return { group, material, aura, arms, base, throws, side: 0, tall: T.height * T.scale * 0.55, size: T.scale * 0.55, title: T.title, lost: 0 };
}

// The Moon as a disc: pale, with its seas and a few craters, and a soft glow round it.
function moonTexture() {
  const c = Object.assign(document.createElement('canvas'), { width: 512, height: 512 }), g = c.getContext('2d');
  const halo = g.createRadialGradient(256, 256, 150, 256, 256, 256);
  halo.addColorStop(0, 'rgba(210,225,255,0.5)');
  halo.addColorStop(1, 'rgba(210,225,255,0)');
  g.fillStyle = halo; g.fillRect(0, 0, 512, 512);
  g.save();
  g.beginPath(); g.arc(256, 256, 170, 0, 7); g.clip();
  const face = g.createRadialGradient(200, 190, 20, 256, 256, 190);
  face.addColorStop(0, '#fbf8ee');
  face.addColorStop(1, '#c9c6ba');
  g.fillStyle = face; g.fillRect(0, 0, 512, 512);
  g.fillStyle = 'rgba(120,122,128,0.45)';
  for (const [x, y, r] of [[200, 190, 62], [290, 170, 44], [310, 260, 54], [215, 300, 38], [150, 255, 26], [270, 345, 30]]) { g.beginPath(); g.ellipse(x, y, r, r * 0.8, 0.4, 0, 7); g.fill(); }
  g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 3;
  for (const [x, y, r] of [[350, 330, 14], [180, 370, 10], [330, 130, 9], [130, 180, 8], [250, 240, 6], [385, 230, 8]]) { g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke(); }
  g.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createDescent({ scene, skater }) {
  const C = config.descent, group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  // The collapse: a bank of dust the width of the course, churning, with solid dark behind it.
  const dust = new THREE.Group(), map = glowTexture();
  const puffs = Array.from({ length: 54 }, (_, i) => {
    const puff = new THREE.Sprite(new THREE.SpriteMaterial({ map, color: i % 3 ? 0x7a6a56 : 0x4a4036, transparent: true, opacity: 0.92, depthWrite: false, fog: false }));
    puff.userData = { x: ((i % 9) / 8 - 0.5) * 96, y: 3 + Math.floor(i / 9) * 8, phase: i * 1.7, size: 26 + (i % 5) * 5 };
    dust.add(puff);
    return puff;
  });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(240, 150), new THREE.MeshBasicMaterial({ color: 0x1f1a15, fog: false }));
  back.position.set(0, 50, 9);
  back.rotation.y = Math.PI;   // (facing down the hill)
  dust.add(back);
  group.add(dust);
  // Put the dust `wall` metres down the course, churning.
  function placeDust(wall, time) {
    const wz = Z0 - wall;
    dust.position.set(X0, descentHeight(X0, wz), wz);   // (behind the crest it is out of sight: it comes up over it)
    for (const puff of puffs) {
      const u = puff.userData, t = time * 1.3 + u.phase;
      puff.position.set(u.x + Math.sin(t) * 5, u.y + Math.cos(t * 0.8) * 3, -Math.abs(Math.sin(t * 0.6)) * 9);
      puff.scale.setScalar(u.size * (1 + 0.15 * Math.sin(t * 1.4)));
    }
  }

  // The casino, from outside: at the top of the hill, behind where you start. Only ever seen in the opening scene.
  const casino = buildCasinoFront();
  casino.group.position.set(X0, 0, Z0 + 12);
  casino.fall(1);
  group.add(casino.group);

  // The Moon, straight down the hill: where all this is heading. It gets bigger the further down you are.
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTexture(), transparent: true, depthWrite: false, fog: false, toneMapped: false }));
  group.add(moon);
  // Everything you ride past: the city, the graves, the drain, the pines, and the skyline all round (world/descentScene.js).
  const scenery = buildDescentScene();
  group.add(scenery.group);
  const placeMoon = (from, size) => { moon.position.copy(from).addScaledVector(FLIGHT, MOON_FAR); moon.scale.setScalar(size); scenery.follow(from); };

  // Lights up both edges of the last ramp, and a bar of them across its lip.
  {
    const D = DESCENT, spots = [];
    for (let s = D.ramp[0] - 150; s < D.ramp[1]; s += 7.5) for (const side of [-1, 1]) spots.push([side * (D.lane - 1), s, 0.5, 0.5, 2.6]);
    spots.push([0, D.ramp[1] - 0.6, 2 * D.lane, 0.5, 0.6]);
    const lights = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffb347, toneMapped: false, fog: false }), spots.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), at = new THREE.Vector3(), size = new THREE.Vector3();
    spots.forEach(([x, s, w, h, d], i) => {
      const y = descentHeight(X0 + x, Z0 - s), rise = descentHeight(X0 + x, Z0 - s - 1) - y;
      q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.atan(rise));   // (lying along the slope)
      lights.setMatrixAt(i, m.compose(at.set(X0 + x, y + 0.35, Z0 - s), q, size.set(w, h, d)));
    });
    lights.frustumCulled = false;
    group.add(lights);
  }

  // The brothers: Hamzitus (sickly green) on your left, Rubistus (bone blue) on your right, Babitus (gold) ahead.
  const ghosts = [ghost('ultimus', 0xb9a0ff, 'blob', map)];   // Goyitus Ultimus: one ghost, with something of each brother in him
  for (const g of ghosts) group.add(g.group);

  // What they throw: a few of each, used in turn, each with a red ring on the ground where it is going to land.
  const lit = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: false, fog: false });
  const shapes = {
    blob: [new THREE.SphereGeometry(1.2, 10, 8), lit(0x6b3d1a)],   // (filth: brown)
    bone: [new THREE.CapsuleGeometry(0.24, 2.3, 3, 6), lit(0xf2ecd8)],
    card: [new THREE.BoxGeometry(1.5, 0.06, 2.1), lit(0xfff8e8)],
  };
  const ringShape = new THREE.RingGeometry(0.8, 1, 28).rotateX(-Math.PI / 2);
  const shots = Array.from({ length: 22 }, () => {
    const body = new THREE.Group(), kinds = {};
    for (const kind in shapes) { kinds[kind] = new THREE.Mesh(...shapes[kind]); body.add(kinds[kind]); }
    const ring = new THREE.Mesh(ringShape, new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false, fog: false, side: THREE.DoubleSide }));
    body.visible = ring.visible = false;
    group.add(body, ring);
    return { live: false, t: 0, radius: 0, from: new THREE.Vector3(), to: new THREE.Vector3(), body, kinds, ring };
  });
  const clearShots = () => { for (const sh of shots) { sh.live = false; sh.body.visible = sh.ring.visible = false; } };

  // He lets go of one: aimed at where you will be when it lands if you carry on as you are, `dx` metres to one side
  // of that and `late` seconds off it. kind: whose it is (what is thrown, how many, how wide).
  function hurl(kind, dx = 0, late = 0) {
    const T = THROWS[kind], p = skater.pos, v = skater.vel, from = ghosts.find((g) => g.throws === kind) || ghosts[0];
    for (let i = 0; i < T.count; i++) {
      const sh = shots.find((s) => !s.live);
      if (!sh) return;
      const x = Math.max(X0 - 30, Math.min(X0 + 30, p.x + v.x * (C.throwFlight + late) + dx + (i - (T.count - 1) / 2) * T.spread)), z = p.z + v.z * (C.throwFlight + late);
      Object.assign(sh, { live: true, t: 0, radius: T.radius });
      sh.from.copy(from.group.position).y += from.tall * 0.7;
      sh.to.set(x, descentHeight(x, z) + 0.9, z);
      for (const k in sh.kinds) sh.kinds[k].visible = k === kind;
      sh.ring.position.set(x, sh.to.y - 0.4, z);
      sh.ring.scale.setScalar(T.radius);
      sh.body.visible = sh.ring.visible = true;
    }
  }

  // The sigils of his rite: a bright heart with a ring closing on it, in one of the brothers' colours.
  const TINTS = [0x7dff5a, 0x7ab8ff, 0xffc233], SEAT = [[0, 0, 0, 0], [3.2, 3.4, 2, -0.3], [-1.6, 7.2, 1.2, 0.18]];   // (SEAT: where each brother sits in the one body, and how he leans)
  const ringMap = (() => {
    const c = Object.assign(document.createElement('canvas'), { width: 256, height: 256 }), g = c.getContext('2d');
    g.translate(128, 128); g.strokeStyle = '#fff'; g.lineCap = 'round';
    g.lineWidth = 9; g.beginPath(); g.arc(0, 0, 112, 0, 7); g.stroke();
    g.lineWidth = 4; g.beginPath(); g.arc(0, 0, 92, 0, 7); g.stroke();
    for (let i = 0; i < 12; i++) { g.rotate(Math.PI / 6); g.lineWidth = i % 3 ? 4 : 9; g.beginPath(); g.moveTo(0, -92); g.lineTo(0, i % 3 ? -104 : -70); g.stroke(); }
    g.lineWidth = 5; g.beginPath(); for (let i = 0; i < 4; i++) { const a = i * 2 * Math.PI / 3; g.lineTo(Math.sin(a) * 70, -Math.cos(a) * 70); } g.stroke();
    return new THREE.CanvasTexture(c);
  })();
  const sigils = Array.from({ length: 6 }, () => {
    const g = new THREE.Group();
    const core = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }));
    const ring = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringMap, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }));
    g.add(core, ring);
    g.visible = false;
    group.add(g);
    return { group: g, core, ring, live: false, pop: 0, ox: 0, oy: 0, oz: 0, phase: 0 };
  });
  const seg = new THREE.Vector3(), toSigil = new THREE.Vector3();
  const reach = new THREE.Vector3(), hand = new THREE.Vector3();   // (lunge(): his hands)
  const newBoss = () => ({ met: false, seals: C.seals, wait: C.riteEvery * 0.6, harass: 3, rite: null, volley: null, stun: 0, turn: 0, kind() { const live = ['blob', 'bone', 'card'].slice(0, Math.max(1, Math.ceil(this.seals / 2))); return live[this.turn++ % live.length]; } });   // (what he throws: each brother's own, for as long as that brother's seals hold)

  // The stretches of the hill, by where each starts.
  const ZONES = [[DESCENT.city[1] + 10, 'The Cemetery'], [DESCENT.sewer[0] + 8, 'Storm Drain 7'], [DESCENT.sewer[1], 'The Hillside'], [DESCENT.edge[0], 'The Edge']];
  const state = { zone: 0, time: 0, wall: 0, best: Math.max(0, Number(load('bestRun')) || 0), wind: null, wait: 0, next: 0, done: false, boss: newBoss() };

  return {
    state,
    setVisible(on) { group.visible = on; },
    reset() {
      Object.assign(state, { zone: 0, time: 0, wall: C.wallStart, wind: null, wait: C.throwEvery, next: 0, done: false, boss: newBoss() });
      for (const g of ghosts) g.lost = 0;
      for (const g of sigils) { g.live = false; g.pop = 0; g.group.visible = false; }
      clearShots();
      casino.fall(1);
      casino.doors(0);
      for (const g of ghosts) { g.group.visible = true; g.aura.material.opacity = 0.55; }
      placeMoon(skater.pos, 150);
    },
    // The fastest you have ever got down, in seconds (0: never).
    get best() { return state.best; },

    // For the scene before the run (cutscenes.collapse): the casino `fall` (0..1) of the way down, the dust `wall`
    // metres down the course, and the ghosts `rise` (0..1) of the way up out of the ground in front of it.
    stage(wall, time, rise, fall = 1) {
      casino.fall(fall, time);
      placeDust(wall, time);
      back.visible = wall > -45;   // (the dark behind the dust: not until it is over the crest, or it shows behind the casino)
      placeMoon(skater.pos, 150);
      clearShots();
      ghosts.forEach((g, i) => {
        const x = X0 + g.side * 10, z = Z0 - wall - (g.side ? 7 : 3), up = g.side ? 3 : 10;
        g.group.position.set(x, descentHeight(x, z) - g.tall * 1.3 + (g.tall * 1.3 + up) * smooth(rise) + Math.sin(time * 2 + i) * 0.5, z);
        g.group.rotation.set(0, Math.atan2(skater.pos.x - x, skater.pos.z - z), 0);
        g.group.scale.setScalar(g.size);
        g.group.visible = true;
        for (const arm of g.arms) arm.rotation.x = -2.2 * smooth(rise) + Math.sin(time * 3 + i) * 0.2;
        g.material.color.copy(g.base);
        g.material.opacity = 0.7;
      });
    },

    // The casino's front doors, for the scene of Kirky arriving at them (cutscenes.street): 0 shut, 1 burst open.
    doors(k) { casino.doors(k); },

    // For the scene when it catches you (cutscenes.buried): the dust `wall` metres down the course, and nothing thrown.
    bury(wall, time) { placeDust(wall, time); clearShots(); },

    // For the scene as he leaves the last ramp (cutscenes.launch): the dust `wall` metres down the course, over the
    // ramp behind him, and Goyitus Ultimus coming down out of it after him: turned toward `toward`, pitched over
    // `dive` rad, and stood wherever has his hands at `hands`. His arms do what a man's do going through something
    // in front of him with both hands (the clip `rummage`, `at` seconds into it: see enemies/mobAnims.js).
    lunge(wall, time, hands, toward, dive, at) {
      placeDust(wall, time);
      back.visible = true;
      const g = ghosts[0], P = hasMobAnims() ? pose('rummage', at) : null;
      g.group.visible = true;
      g.group.scale.setScalar(g.size);
      g.material.color.copy(g.base);
      g.material.opacity = 0.85;
      g.aura.material.opacity = 0.55;
      g.group.position.set(0, 0, 0);
      g.group.rotation.set(dive, Math.atan2(toward.x - hands.x, toward.z - hands.z), 0, 'YXZ');
      for (const arm of g.arms) {
        if (!arm.aim) {   // (which way it points as it was made, and where its hand is: the point of it furthest from its shoulder)
          const spot = arm.geometry.attributes.position;
          let far = 0;
          arm.aim = aimOf(arm.geometry, 'arm');
          arm.tip = new THREE.Vector3();
          for (let i = 0; i < spot.count; i++) { const d = spot.getX(i) ** 2 + spot.getY(i) ** 2 + spot.getZ(i) ** 2; if (d > far) { far = d; arm.tip.set(spot.getX(i), spot.getY(i), spot.getZ(i)); } }
        }
        if (P) arm.quaternion.setFromUnitVectors(arm.aim, arm.position.x > 0 ? P.armL : P.armR);
        else arm.rotation.set(-1.5 + Math.sin(time * 5 + arm.position.x) * 0.15, 0, 0);
      }
      // (where that has his hands, with him at the origin: so he goes wherever puts them where they are wanted)
      g.group.updateMatrixWorld(true);
      reach.set(0, 0, 0);
      for (const arm of g.arms) reach.add(hand.copy(arm.tip).applyMatrix4(arm.matrixWorld));
      g.group.position.copy(hands).sub(reach.multiplyScalar(1 / Math.max(1, g.arms.length)));
    },

    // For the scene after it (cutscenes.launch): nobody chasing any more, and the Moon ahead of `from`, `size` across.
    launch(from, size) {
      clearShots();
      for (const g of ghosts) g.group.visible = false;
      for (const g of sigils) g.group.visible = false;
      placeMoon(from, size);
    },

    // Returns { gap: metres between you and the collapse, caught, hit: damage from something thrown that landed on you
    // this frame, tell: a ghost has just started to glow (-1 left, 1 right, 2 ahead), finished: your time, the frame
    // you leave the last ramp }.
    // bullets: the gun's (weapon.bullets); beam: a beam fired this frame ({ origin, dir }), if one was.
    update(dt, bullets, beam) {
      const out = { gap: 0, caught: false, hit: 0, tell: 0, finished: 0 };
      if (state.done) return out;
      const p = skater.pos, s = along(p.z);
      if (s > 2) state.time += dt;   // (the clock starts when you leave the doors)

      // The collapse.
      const speed = Math.min(C.wallMax, C.wallSpeed + C.wallGain * state.time) * difficulty.collapse;
      state.wall = Math.max(state.wall + (s > 2 ? speed * dt : 0), s - C.wallLeash);
      out.gap = s - state.wall;
      out.caught = out.gap < C.wallKill;
      back.visible = true;
      placeDust(state.wall, state.time);
      placeMoon(p, 150 + 190 * Math.min(1, s / DESCENT.length));
      // The sides: you can get up the banks, not past what stands at the top of them.
      const reach = cityAt(s) > 0.5 ? DESCENT.lane + DESCENT.terrace - 0.6 : sewerAt(s) > 0.5 ? DESCENT.walk - 0.6 : DESCENT.lane + 15;
      if (s < DESCENT.edge[0] && Math.abs(p.x - X0) > reach) {
        p.x = X0 + Math.sign(p.x - X0) * reach;
        if (skater.vel.x * (p.x - X0) > 0) skater.vel.x *= -0.3;
      }
      // Off the side, where the hill has run out: gone.
      if (s < DESCENT.ramp[1] && p.y < descentHeight(X0, p.z) - 45) out.caught = out.fell = true;

      if (state.zone < ZONES.length && s >= ZONES[state.zone][0]) out.zone = ZONES[state.zone++][1];   // (you have just got somewhere)
      const left = smooth((s - DESCENT.edge[0]) / 140);   // 0..1: the brothers dropping back, where the hill runs out

      // ---- Goyitus Ultimus ----
      // The three of them, run together into one thing that flies down the hill ahead of you, looking back.
      // He never lets up: a shot at you every couple of seconds. And every so often he begins a rite: sigils light in
      // the sky round him, and when it is finished he lets fly with everything. Shoot every sigil out before then and
      // it breaks in his face: he is stunned, and one of the six seals that hold him together goes. Two seals to a
      // brother; when a brother's are gone he comes away and is lost. Break all six and he is finished.
      const B = state.boss, on = s > 60 && s < DESCENT.ramp[0] - 60 && B.seals > 0;
      if (on && !B.met) { B.met = true; out.met = true; }
      B.stun = Math.max(0, B.stun - dt);
      if (on && B.stun <= 0) {
        if (!B.rite) {
          if ((B.harass -= dt) <= 0) {   // a shot at you, to keep you moving
            B.harass = C.harassEvery * (0.7 + Math.random() * 0.6) * (0.75 + 0.25 * B.seals / C.seals);
            hurl(B.kind(), (Math.random() - 0.5) * 3, 0);
            out.thrown = true;
          }
          if ((B.wait -= dt) <= 0) {     // the rite begins
            const broken = C.seals - B.seals, count = Math.min(sigils.length, 3 + Math.floor(broken / 2));
            B.rite = { t: 0, time: C.riteTime - 0.25 * broken, count };
            for (let i = 0; i < count; i++) {
              const g = sigils[i], a = ((i + 0.5) / count - 0.5) * 2;   // (-1..1 across the sky)
              Object.assign(g, { live: true, pop: 0, ox: a * 13 + (Math.random() - 0.5) * 3, oy: 6 + 4 * Math.cos(a * 1.3) + Math.random() * 2, oz: -19 - Math.random() * 6, phase: Math.random() * 6 });
              g.group.visible = true;
              g.core.material.color.set(TINTS[i % 3]);
              g.ring.material.color.set(TINTS[i % 3]);
            }
            out.rite = count;
          }
        } else {
          const R = B.rite;
          R.t += dt;
          const left = sigils.filter((g) => g.live).length;
          if (!left) {                      // every one of them shot out: it breaks on him
            B.rite = null; B.stun = C.stunTime; B.wait = C.riteEvery; B.harass = 1.5;
            B.seals--;
            out.stun = true;
            if (B.seals % 2 === 0 && B.seals > 0) out.lost = B.seals === 4 ? 'Babitus' : 'Rubistus';   // (a brother's second seal: he comes away)
            if (B.seals <= 0) { out.broken = true; state.wall -= C.brokenRelief; }
          } else if (R.t >= R.time) {       // it is finished: everything he has, more of it for every sigil left standing
            B.rite = null; B.wait = C.riteEvery * 0.8; B.harass = 1.2;
            B.volley = { left: 3 + 2 * left, t: 0 };
            for (const g of sigils) { g.live = false; g.group.visible = false; }
            out.barrage = true;
          }
        }
      } else if (!on && B.rite) { B.rite = null; for (const g of sigils) { g.live = false; g.group.visible = false; } }
      if (B.volley && (B.volley.t -= dt) <= 0) {
        B.volley.t = 0.16;
        hurl(B.kind(), (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 0.5);
        out.thrown = true;
        if (--B.volley.left <= 0) B.volley = null;
      }

      // The sigils: hanging in the sky ahead of you, drawing in as the rite runs out. A bullet through one puts it out.
      const rite = B.rite ? B.rite.t / B.rite.time : 0;
      for (const g of sigils) {
        if (g.pop > 0) { g.pop -= dt * 3; g.group.scale.setScalar(1 + (1 - g.pop) * 2.5); g.core.material.opacity = g.ring.material.opacity = Math.max(0, g.pop); if (g.pop <= 0) g.group.visible = false; continue; }
        if (!g.live) continue;
        g.group.position.set(p.x * 0.6 + X0 * 0.4 + g.ox + Math.sin(state.time * 1.3 + g.phase) * 1.6, p.y + g.oy + Math.sin(state.time * 2.1 + g.phase) * 0.8, p.z + g.oz);
        g.group.scale.setScalar(1);
        g.core.material.opacity = 0.95;
        g.ring.material.opacity = 0.9;
        g.ring.scale.setScalar(5.4 - 3.4 * rite);                                     // (the ring closes on it: when it touches, time is up)
        g.ring.material.rotation = state.time * 1.5 + g.phase;
        g.core.scale.setScalar(3.4 * (1 + 0.12 * Math.sin(state.time * 9 + g.phase)) * (rite > 0.75 ? 1 + 0.3 * Math.sin(state.time * 30) : 1));
        for (const b of bullets || []) {
          if (!b.alive) continue;
          // (how near the bullet's path this frame came to it)
          seg.copy(b.vel).multiplyScalar(-dt);
          const back2 = seg.lengthSq() || 1, k = Math.max(0, Math.min(1, toSigil.subVectors(g.group.position, b.pos).dot(seg) / back2));
          if (toSigil.addScaledVector(seg, -k).lengthSq() < C.sigilRadius * C.sigilRadius) { b.alive = false; g.live = false; g.pop = 1; out.sigil = (out.sigil || 0) + 1; break; }
        }
        if (g.live && beam) {
          const d2 = toSigil.subVectors(g.group.position, beam.origin), al = d2.dot(beam.dir);
          if (al > 0 && d2.lengthSq() - al * al < C.sigilRadius * C.sigilRadius) { g.live = false; g.pop = 1; out.sigil = (out.sigil || 0) + 1; }
        }
      }
      out.boss = B.met && B.seals > 0 ? B.seals / C.seals : null;
      out.charge = rite;

      // His body: the three run together. Hamzitus is the bulk of him; Rubistus leans out of his shoulder; Babitus
      // stands out of the top, crowned. He hangs ahead of you over the course, turned to face you.
      const ax = p.x * 0.5 + X0 * 0.5 + Math.sin(state.time * 0.45) * 9, az = p.z - 46 - 5 * Math.sin(state.time * 0.3), reel = B.stun > 0 ? Math.min(1, B.stun) : 0;
      const ay = Math.max(descentHeight(ax, az), p.y - 2) + 9 + Math.sin(state.time * 1.4) * 0.9 - 3 * reel;
      const hot = B.rite ? 0.25 + 0.75 * rite * (0.6 + 0.4 * Math.sin(state.time * (10 + 20 * rite))) : B.volley ? 1 : 0;
      ghosts.forEach((g, i) => {
        const [ox, oy, oz, roll] = SEAT[i], gone = g.lost || 0;
        g.group.position.set(ax + ox + gone * (i - 1) * 30, ay + oy + gone * 14 + Math.sin(state.time * 2 + i * 2) * 0.35, az + oz + 90 * left + gone * 40);
        g.group.rotation.set(-0.5 * reel + 0.15 * Math.sin(state.time * 0.9 + i), Math.atan2(p.x - ax, p.z - az) + 0.25 * (i - 1) + 1.2 * reel * Math.sin(state.time * 5 + i), roll + 0.5 * reel * Math.sin(state.time * 7 + i));
        g.group.scale.setScalar(g.size * (1 + 0.04 * Math.sin(state.time * 3 + i)));
        if (B.seals <= 0) g.lost = Math.min(1, (g.lost || 0) + dt * 0.5);   // (finished: he comes apart, upward, and is gone)
        const lift = B.rite ? -2.7 * smooth(rite * 1.5) + 0.25 * Math.sin(state.time * 14 + i) : B.volley ? 0.9 : reel ? 1.1 : -0.4 + Math.sin(state.time * 1.6 + i) * 0.3;
        for (const arm of g.arms) arm.rotation.x = lift;
        g.material.color.copy(g.base).lerp(RED, hot).multiplyScalar(reel ? 0.45 + 0.4 * Math.abs(Math.sin(state.time * 18)) : 1);
        g.material.opacity = (0.72 + 0.2 * hot) * (1 - left) * (1 - gone) * (on || B.seals <= 0 || s <= 60 ? 1 : 1);
        g.aura.material.opacity = 0.6 * (1 - left) * (1 - gone);
        g.group.visible = B.seals > 0 || gone < 1;
      });

      // What is in the air.
      for (const sh of shots) {
        if (!sh.live) continue;
        sh.t += dt;
        const f = Math.min(1, sh.t / C.throwFlight);
        sh.body.position.lerpVectors(sh.from, sh.to, f).y += Math.sin(f * Math.PI) * 3;
        sh.body.rotation.set(sh.t * 9, sh.t * 6, 0);
        sh.ring.material.opacity = 0.45 + 0.4 * Math.abs(Math.sin(sh.t * 16));
        if (f >= 1) {
          sh.live = false;
          sh.body.visible = sh.ring.visible = false;
          if (Math.hypot(p.x - sh.to.x, p.z - sh.to.z) < sh.radius && skater.grounded && !skater.grinding) out.hit = C.throwDamage;
        }
      }

      // Off the end.
      if (s >= DESCENT.ramp[1]) {
        state.done = true;
        out.finished = state.time;
        if (!state.best || state.time < state.best) { state.best = state.time; store('bestRun', String(state.time)); out.record = true; }
      }
      return out;
    },
  };
}
