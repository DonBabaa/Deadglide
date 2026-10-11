// The Long Way Down (level 5): what chases you down the hill.
//   the collapse   a wall of dust coming down the course behind you. It starts slowly and keeps getting faster,
//                  and it is never far behind however fast you go. If it reaches you, that is the end of the run.
//   the ghosts     the three brothers you killed: one down each side of you, and Babitus up ahead. Every few
//                  seconds one of them glows red, then throws something at where you are about to be (a red ring
//                  on the ground shows where). Steer round it, or be in the air or on a rail when it lands.
//   the clock      how long you have been going. Off the lip of the last ramp, it stops: that is your time.
// main.js calls update() every frame of the level and acts on what it returns.
import * as THREE from 'three';
import { config } from '../config.js';
import { DESCENT, along, descentHeight, cityAt, sewerAt } from '../world/descent.js';
import { buildDescentScene } from '../world/descentScene.js';
import { ENEMY_PARTS } from '../enemies/enemyModels.js';
import { ENEMY_TYPES } from '../enemies/types.js';
import { glowTexture } from '../world/textures.js';
import { buildCasinoFront } from '../world/casinoFront.js';
import { load, store } from './storage.js';

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
function ghost(name, tint, throws, map) {
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
  return { group, material, aura, arms, base, throws, side: 0, tall: T.height * T.scale * 0.55 };
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
  const ghosts = [ghost('boss', 0x7dff5a, 'blob', map), ghost('boss2', 0x7ab8ff, 'bone', map), ghost('boss3d', 0xffc233, 'card', map)];
  ghosts[0].side = -1;
  ghosts[1].side = 1;
  for (const g of ghosts) group.add(g.group);

  // What they throw: a few of each, used in turn, each with a red ring on the ground where it is going to land.
  const lit = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: false, fog: false });
  const shapes = {
    blob: [new THREE.SphereGeometry(1.2, 10, 8), lit(0x9be04a)],
    bone: [new THREE.CapsuleGeometry(0.24, 2.3, 3, 6), lit(0xf2ecd8)],
    card: [new THREE.BoxGeometry(1.5, 0.06, 2.1), lit(0xfff8e8)],
  };
  const ringShape = new THREE.RingGeometry(0.8, 1, 28).rotateX(-Math.PI / 2);
  const shots = Array.from({ length: 6 }, () => {
    const body = new THREE.Group(), kinds = {};
    for (const kind in shapes) { kinds[kind] = new THREE.Mesh(...shapes[kind]); body.add(kinds[kind]); }
    const ring = new THREE.Mesh(ringShape, new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false, fog: false, side: THREE.DoubleSide }));
    body.visible = ring.visible = false;
    group.add(body, ring);
    return { live: false, t: 0, radius: 0, from: new THREE.Vector3(), to: new THREE.Vector3(), body, kinds, ring };
  });
  const clearShots = () => { for (const sh of shots) { sh.live = false; sh.body.visible = sh.ring.visible = false; } };

  // A ghost lets go: aimed at where you will be when it lands, if you carry on as you are.
  function hurl(g) {
    const T = THROWS[g.throws], p = skater.pos, v = skater.vel;
    for (let i = 0; i < T.count; i++) {
      const sh = shots.find((s) => !s.live);
      if (!sh) return;
      const x = Math.max(X0 - 30, Math.min(X0 + 30, p.x + v.x * C.throwFlight + (i - (T.count - 1) / 2) * T.spread)), z = p.z + v.z * C.throwFlight;
      Object.assign(sh, { live: true, t: 0, radius: T.radius });
      sh.from.copy(g.group.position).y += g.tall * 0.7;
      sh.to.set(x, descentHeight(x, z) + 0.9, z);
      for (const kind in sh.kinds) sh.kinds[kind].visible = kind === g.throws;
      sh.ring.position.set(x, sh.to.y - 0.4, z);
      sh.ring.scale.setScalar(T.radius);
      sh.body.visible = sh.ring.visible = true;
    }
  }

  // The stretches of the hill, by where each starts.
  const ZONES = [[DESCENT.city[1] + 10, 'The Cemetery'], [DESCENT.sewer[0] + 8, 'Storm Drain 7'], [DESCENT.sewer[1], 'The Hillside'], [DESCENT.edge[0], 'The Edge']];
  const state = { zone: 0, time: 0, wall: 0, best: Math.max(0, Number(load('bestRun')) || 0), wind: null, wait: 0, next: 0, done: false };

  return {
    state,
    setVisible(on) { group.visible = on; },
    reset() {
      Object.assign(state, { zone: 0, time: 0, wall: C.wallStart, wind: null, wait: C.throwEvery, next: 0, done: false });
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
        for (const arm of g.arms) arm.rotation.x = -2.2 * smooth(rise) + Math.sin(time * 3 + i) * 0.2;
        g.material.color.copy(g.base);
        g.material.opacity = 0.7;
      });
    },

    // The casino's front doors, for the scene of Kirky arriving at them (cutscenes.street): 0 shut, 1 burst open.
    doors(k) { casino.doors(k); },

    // For the scene when it catches you (cutscenes.buried): the dust `wall` metres down the course, and nothing thrown.
    bury(wall, time) { placeDust(wall, time); clearShots(); },

    // For the scene after it (cutscenes.launch): nobody chasing any more, and the Moon ahead of `from`, `size` across.
    launch(from, size) {
      clearShots();
      for (const g of ghosts) g.group.visible = false;
      placeMoon(from, size);
    },

    // Returns { gap: metres between you and the collapse, caught, hit: damage from something thrown that landed on you
    // this frame, tell: a ghost has just started to glow (-1 left, 1 right, 2 ahead), finished: your time, the frame
    // you leave the last ramp }.
    update(dt) {
      const out = { gap: 0, caught: false, hit: 0, tell: 0, finished: 0 };
      if (state.done) return out;
      const p = skater.pos, s = along(p.z);
      if (s > 2) state.time += dt;   // (the clock starts when you leave the doors)

      // The collapse.
      const speed = Math.min(C.wallMax, C.wallSpeed + C.wallGain * state.time);
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

      // The ghosts, in turn: one winds up (glowing red), then throws.
      if (!state.wind && (state.wait -= dt) <= 0 && s > 60 && s < DESCENT.ramp[0] - 60) {
        state.wind = { who: state.next, t: 0, thrown: false };
        state.next = (state.next + 1) % ghosts.length;
        out.tell = ghosts[state.wind.who].side || 2;
      }
      ghosts.forEach((g, i) => {
        const w = state.wind && state.wind.who === i ? state.wind : null;
        const t = w ? w.t : 0, tell = C.throwTell, lean = w ? smooth(t / tell) * (1 - smooth((t - tell - 0.2) / 0.5)) : 0;
        // The two at your sides fly out wide, a little ahead; Babitus high up in front. Each leans in as he winds up.
        const x = g.side ? p.x + g.side * (21 - 6 * lean) : p.x + Math.sin(state.time * 0.5) * 7;
        const z = g.side ? p.z - 9 - 4 * Math.sin(state.time * 0.7 + i * 2) : p.z - 30 + 6 * lean;
        g.group.position.set(x, Math.max(descentHeight(x, z), p.y - 2) + (g.side ? 1.5 : 9) + Math.sin(state.time * 2 + i) * 0.6, z + 90 * left);
        g.group.rotation.set(0, Math.atan2(p.x - x, p.z - z), 0);
        // Arms: back over his head through the tell, then down hard as he lets go.
        const lift = w ? (t < tell ? -2.6 * smooth(t / tell) : -2.6 + 3.6 * smooth((t - tell) / 0.2)) : Math.sin(state.time * 1.6 + i) * 0.15;
        for (const arm of g.arms) arm.rotation.x = lift;
        const hot = w && t < tell ? 0.5 + 0.5 * Math.sin(t * 22) : 0;
        g.material.color.copy(g.base).lerp(RED, hot);
        g.material.opacity = (0.7 + 0.25 * hot) * (1 - left);
        g.aura.material.opacity = 0.55 * (1 - left);
      });
      if (state.wind) {
        const w = state.wind;
        w.t += dt;
        if (!w.thrown && w.t >= C.throwTell) { w.thrown = true; hurl(ghosts[w.who]); out.thrown = true; }
        if (w.t > C.throwTell + 0.7) { state.wind = null; state.wait = C.throwEvery * (0.75 + Math.random() * 0.5); }
      }

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
