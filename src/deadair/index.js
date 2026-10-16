// DEAD AIR: the secret mode. Up to four of you in Shackleton Station, a dark research base outside the Moon's dome,
// against the dead, round after round, until the last of you goes down.
//
// Like the casino, it is a room of its own with its own camera and its own loop (main.js hands it the frame while
// it is open), fetched only the first time it is wanted.
//
//   const deadAir = createDeadAir({ renderer, onLeave });
//   await deadAir.enter();             main.js then calls deadAir.update(dt, input, mouse) and draws deadAir.scene
//
// The rules (as the old zombie modes had them): you start with a pistol and 500 points. Every bullet that hits one of
// them is 10; a kill is 60, through the head 100. Points open doors (more of the station, more ways for them to come)
// and buy what is chalked on the walls. Each round there are more of them, they take more killing, and more of them
// run. They hurt; you get better if you can get away for a moment. Go down and that is it (on your own: with others,
// they can get you up).
import * as THREE from 'three';
import { syncAudioControls } from '../ui/audioControls.js';
import { buildStation, CELL, START, HEIGHT, OPENINGS, FEEDERS, WALL_GUNS, ZONES, CRATE, CORE, LOUNGE, UPLINK, CORPSES, LOG_SPOTS, BAY_CRATE, ceilOf, levelOf, RISE } from './station.js';
import { createLogs } from './logs.js';
import { createLift } from './lift.js';
import { DUCT, CRANK, SAFE, BUNKS, crankWheel, ductLights } from './station.js';
import { loadModel } from '../models.js';
import { NIGHTS, nightOf, pickNight, kindBy } from './nights.js';
import { createStory, PA, EPITAPHS, STEPS } from './story.js';
import { createCrate } from './crate.js';
import { Walker } from './walker.js';
import { SkaterModel } from '../player/skaterModel.js';
import { Dead, KINDS, GRAB, LIFT, lungeOf } from './dead.js';
import { Arms, GUNS } from './arms.js';
import { createDeadHud } from './hud.js';
import { createDeadSound } from './sound.js';
import { Coins, GOLD } from './coins.js';
import { createLounge } from './lounge.js';
import { Drops, spentCase } from './reload.js';
import { Others, STATE } from './party.js';
import { createScares } from './scares.js';
import { Pickups, PICKUPS } from './pickups.js';
import { currentLook } from '../systems/cosmetics.js';
import { getName } from '../ui/playerName.js';
import { finished } from '../systems/profile.js';
import { load, store } from '../systems/storage.js';
import { holdMusic, setSpace, playHit, playHeadshot, playKill, playHurt, playCoin, unlockAudio, playGolden, playLighter } from '../fx/audio.js';

export const RULES = {
  points: 500,             // to start with
  hit: 10, kill: 60, headshot: 100,
  health: 100,
  regenAfter: 2.6,         // seconds after a hit before you start to get better...
  regen: 40,               // ...and how fast (health a second)
  breakTime: 9,            // between rounds
  ammoPrice: 0.5,          // a wall gun's ammunition, as a share of the gun's price
  bleed: 30,               // with friends: seconds you can stay down before you bleed out (back next round)
  revive: 3,               // seconds a friend has to hold E over you to get you up
  revived: 0.5,            // ...and how much of your health you get up with
  // Golden Hour: for whoever has finished the story (the Golden BOOF is theirs). G lights it: a cut-in, then this
  // long of three times the damage, no ammunition used, double points, and a warm gold light round you in the dark.
  golden: { time: 30, kills: 25, cut: 7.6 },   // the Golden BOOF: seconds it lasts; kills that charge it; seconds of the cut-in
  // The Warden: every fifth round, a while after it begins. hp: times one of that round's; bounty: points to whoever kills him.
  warden: { every: 5, after: 6, hp: 9, bounty: 500, coins: 8, cut: 2.6 },
  // With friends: more of them a round for each of you after the first, and each one a little harder to kill.
  party: { more: 0.5, tougher: 0.25 },
  nuke: 400,               // what a NUKE pays everyone
};
// How many of them a round has, how much killing each takes, how quickly they come, and what kind.
const ROUND = {
  count: (n) => Math.min(70, Math.round(7 + 2.5 * (n - 1) + 0.25 * n * n)),
  hp: (n) => (n <= 9 ? 100 + 55 * (n - 1) : 540 * 1.1 ** (n - 9)),
  every: (n) => Math.max(0.45, 1.6 - 0.12 * n),
  most: (n) => Math.min(26, 10 + 2 * n),
  // (most of them run, from the first round; the walkers are the few, and the sprinters and crawlers come later)
  kind: (n) => {
    const k = Math.random();
    if (n >= 4 && k < 0.07) return 'screamer';
    const crawl = n >= 3 ? 0.08 : 0, sprint = n >= 3 ? Math.min(0.4, 0.1 + 0.08 * (n - 3)) : 0, run = n === 1 ? 0.45 : n === 2 ? 0.65 : 0.8 - sprint;
    return k < crawl ? 'crawler' : k < crawl + sprint ? 'sprinter' : k < crawl + sprint + run ? 'runner' : 'walker';
  },
};

// openCasino: main.js's, which hands back the game's casino (the lounge is the casino, in another room: lounge.js).
// party: the Free Ride session (freeride/ride.js), if you came with friends: then the host's browser runs the dead,
// the rounds, the doors and the gold, and everyone else's draws them and asks it for what they do (see onNet).
export function createDeadAir({ renderer, onLeave, onOut = null, openCasino, party }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020203);
  scene.fog = new THREE.FogExp2(0x030305, 0.035);
  const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 220);
  // Hardly any light: a breath of cold blue so that black is not flat, the red of the emergency lamps, and a few
  // strip lights still working (just: they flicker, and one of them is nearly gone).
  scene.add(new THREE.HemisphereLight(0x33405e, 0x0a0809, 0.55));
  const reds = [[1.2, 3.6, 1.2], [4.4, 4.6, 4.4], [6.6, 4.2, 6.6], [9.2, 3.0, 2.0], [10.6, 4.2, 6.4]].map(([x, y, z]) => {
    const red = new THREE.PointLight(0xff2a14, 14, 13, 1.8);
    red.position.set(x * CELL - CELL / 2, y, z * CELL - CELL / 2);
    red.userData.phase = Math.random() * 10;
    scene.add(red);
    return red;
  });
  //            cell      how it behaves: steady with the odd blink, dying (more off than on), off until its room is opened
  const STRIPS = [[[2, 2], 'steady', 'b'], [[3, 4], 'steady', 'b'], [[5, 5], 'dying', 'b'], [[7, 2], 'dying', 'c'], [[10, 3], 'blink', 'c'], [[9, 5], 'dark', 'l'], [[10, 6], 'dark', 'l'], [[15, 5], 'dark', 'm'], [[12, 2], 'dark', 'm'], [[9, 8], 'dark', 'r'], [[9, 11], 'dark', 'r'], [[9, 1], 'blink', 'c'], [[17, 5], 'dark', 'm'], [[16, 3], 'dark', 'o'], [[14, 3], 'dark', 's'], [[15, 7], 'dark', 'm'], [[14, 10], 'dark', 'q'], [[12, 9], 'dark', 'q']];
  const tube = new THREE.BoxGeometry(1.5, 0.06, 0.22);
  // (every strip glows on its own; the light they throw comes from a pool of four, which go to the nearest lit ones:
  // a light costs every pixel in the station something, lit or not, and nobody can tell four from nine)
  const strips = STRIPS.map(([[i, j], how, zone]) => {
    const glow = new THREE.Mesh(tube, new THREE.MeshStandardMaterial({ color: 0x222428, emissive: 0xdfeaff, emissiveIntensity: 0, roughness: 0.4 }));
    // (in a tall room the strip hangs on a rod, five and a half metres over its floor: the light has to reach it)
    const base = levelOf(i, j), top = ceilOf(i, j), y = base + Math.min(top - base, 5.5) - 0.12;
    glow.position.set(i * CELL, y, j * CELL);
    scene.add(glow);
    if (top - y > 0.5) { const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, top - y, 6), new THREE.MeshStandardMaterial({ color: 0x1a1b1e, roughness: 0.8 })); rod.position.set(i * CELL, (top + y) / 2, j * CELL); scene.add(rod); }
    return { glow, at: new THREE.Vector3(i * CELL, y - 0.33, j * CELL), how, zone, on: how !== 'dark', level: 0, phase: Math.random() * 20 };
  });
  const stripPool = Array.from({ length: 4 }, () => { const l = new THREE.PointLight(0xcfe0ff, 0, 11, 1.7); scene.add(l); return l; });

  let story = null, uplinkLight = null, watchLight = null, warmed = false, dust = null;
  // Dust in the air, everywhere, seen only where a lamp's beam goes through it (which is how you see the beam).
  function makeDust(st) {
    const pts = [], seeds = [];
    for (let j = 0; j < st.depth; j++) for (let i = 0; i < st.width; i++) {
      if (!st.map[j][i] || st.map[j][i] === '#') continue;
      for (let k = 0; k < 14; k++) { pts.push(i * CELL + (Math.random() - 0.5) * CELL, 0.2 + Math.random() * 3.4, j * CELL + (Math.random() - 0.5) * CELL); seeds.push(Math.random() * 100); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    geo.setAttribute('seed', new THREE.Float32BufferAttribute(seeds, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { lampPos: { value: new THREE.Vector3() }, lampDir: { value: new THREE.Vector3(0, 0, 1) }, cosCone: { value: 0.9 }, time: { value: 0 }, px: { value: 1 } },
      vertexShader: `uniform vec3 lampPos; uniform vec3 lampDir; uniform float cosCone; uniform float time; uniform float px; attribute float seed; varying float vA;
        void main() {
          vec3 p = position + vec3(sin(time * 0.31 + seed * 7.0), sin(time * 0.17 + seed * 3.0) * 0.6, cos(time * 0.23 + seed * 5.0)) * 0.18;
          vec3 d = p - lampPos; float dist = length(d); d /= max(dist, 0.001);
          float cone = smoothstep(cosCone, cosCone + 0.1, dot(d, lampDir));
          vA = cone * clamp(1.0 - dist / 12.0, 0.0, 1.0) * (0.55 + 0.4 * fract(seed * 0.37));
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = clamp(4.2 * px / -mv.z, 1.2, 7.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `varying float vA;
        void main() { float r = length(gl_PointCoord - 0.5) * 2.0; float a = (1.0 - smoothstep(0.4, 1.0, r)) * vA; if (a < 0.01) discard; gl_FragColor = vec4(1.0, 0.93, 0.8, a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    return points;
  }
  function runDust() {
    if (!dust) return;
    const u = dust.material.uniforms, L = walker.lamp;
    u.time.value = time;
    u.px.value = renderer.domElement.clientHeight;
    L.getWorldPosition(u.lampPos.value);
    u.lampDir.value.copy(L.target.position).sub(u.lampPos.value).normalize();
    u.cosCone.value = Math.cos(L.angle || 0.5);
    dust.visible = (walker.power > 0.5) && !lounge.inside;
  }
  // One of them has you: { id, z, hold } while it does (hold: how near you are to throwing it off).
  let grab = null, grabCut = null;
  let lift = null, exiting = false, debris = null;
  let lastZone = null, seenZones = new Set();   // (a banner with the room's name the first time you walk into it)   // the lift (lift.js); the way out playing; what a decompression blows up the shaft   // grabCut: { kind: 'on' | 'off' | 'bite', t, z }: a cut-in of it, a few frames long
  function startGrab(id, z) {
    if (grab || me.downed || me.out || game.over || me.safe || me.shield) return;
    const lift = !!(z && z.kind === 'warden');
    grab = { id, z: z || null, hold: 0, ph: 0, lift };
    grabCut = { kind: lift ? 'lift' : 'on', t: 0, z: z || null, pos: me.pos.clone(), yaw: walker.yaw };
    if (lift) { walker.liftTo = 0.95; hud.tip('The Warden has you off the floor: mash F  ·  a friend can shoot his arm'); }
    if (z) { sound.voice(z, 'scream'); z.flinch = 0; }
    sound.gasp?.();
    sound.sting(0.9);
    hud.whiteout(0.45);
    walker.shake = 0.1; walker.fovPunch = 9;
    story.tip('grab');
    arms.rl = null;
  }
  function endGrab(thrown) {
    if (grab?.lift) { walker.liftTo = 0; sound.thud(me.pos.clone().setY(0.2)); walker.shake = 0.12; }
    if (!grab) return;
    const z = grab.z || dead.byId(grab.id);
    if (thrown) {
      if (hosting()) { if (z) dead.free(z, true); } else say({ da: 'free', z: grab.id });
      if (z) { sound.swing(true); sound.thud(z.pos.clone().setY(0.4)); grabCut = { kind: 'off', t: 0, z, pos: me.pos.clone(), yaw: walker.yaw }; }
      grace = Math.max(grace, 0.8);
    } else if (z) grabCut = { kind: 'bite', t: 0, z, pos: me.pos.clone(), yaw: walker.yaw };
    grab = null;
    hud.struggle(null);
  }
  // The cut-ins of the grab (Dave the Diver: a hard cut to the side, speed lines, a flash, and back):
  //   on    0.55 s   low and to the side: it slams into him, arms round him
  //   off   0.5 s    from behind his shoulder: it thrown back, arms up
  //   bite  0.6 s    tight on the two heads from the side, a white flash as it bites
  const GRAB_CUTS = { on: 0.55, off: 0.5, bite: 1.1, lift: 1.5 };
  function runGrabCut(dt) {
    const c = grabCut;
    if (!c) return false;
    c.t += dt;
    const C = GRAB_CUTS[c.kind], z = c.z, k = walker.model;
    const front = new THREE.Vector3(Math.sin(c.yaw), 0, Math.cos(c.yaw)), side = new THREE.Vector3(front.z, 0, -front.x), mid = c.pos.clone().addScaledVector(front, 0.45);
    let cam, at, fov, lines = 0, flash = 0;
    if (c.kind === 'on') { const s = c.t / C; cam = mid.clone().addScaledVector(side, 2.4 - 0.7 * s).addScaledVector(front, 0.2).setY(1.45 + 0.1 * s); at = mid.clone().setY(1.35); fov = 44 - 8 * s; lines = s < 0.5 ? 1 : 0; flash = s < 0.08 ? 0.5 : 0; }
    else if (c.kind === 'off') { const s = c.t / C; cam = c.pos.clone().addScaledVector(front, -1.6).addScaledVector(side, -0.7).setY(1.7); at = (z ? z.pos.clone() : mid).setY(1.2); fov = 50 - 8 * s; lines = s < 0.4 ? 1 - s * 2 : 0; }
    else if (c.kind === 'lift') {   // (the Warden's hand: your boots coming off the floor, from low beside you; then up his arm to his face)
      const s = c.t / C, boots = c.pos.clone().setY(0.25 + 0.9 * Math.min(1, s * 2.2));
      if (s < 0.5) { cam = c.pos.clone().addScaledVector(side, 2.0).addScaledVector(front, 0.6).setY(0.45); at = boots; fov = 40; lines = s < 0.15 ? 1 : 0; flash = s < 0.06 ? 0.6 : 0; }
      else { const u = (s - 0.5) / 0.5; cam = c.pos.clone().addScaledVector(side, 1.6).addScaledVector(front, 0.5).setY(0.6 + 1.3 * u); at = (z && z.head ? z.head.clone() : mid.clone().setY(2.3)).lerp(boots, 1 - u); fov = 38; lines = u < 0.2 ? 1 : 0; }
    }
    else { const s = c.t / C; cam = mid.clone().addScaledVector(side, 1.4).setY(1.2); at = mid.clone().setY(0.95); fov = 34 - 4 * s; flash = s > 0.3 && s < 0.45 ? 0.85 : 0; lines = s > 0.3 ? 1 : 0; }
    // (never through a wall)
    const from = mid.clone().setY(1.3), to = cam.clone().sub(from), len = to.length();
    const room = station.ray(from, to.clone().divideScalar(len), len + 0.3) - 0.3;
    if (room < len) cam.copy(from).addScaledVector(to.divideScalar(len), Math.max(0.7, room));
    camera.position.copy(cam); camera.lookAt(at); camera.fov = fov; camera.updateProjectionMatrix();
    k.root.visible = true; walker.view.visible = false;
    hud.cine(true, lines, flash, '', 0, '');
    if (c.t >= C) { grabCut = null; hud.cine(false); }
    return true;
  }

  // ---- Co-op moments (QTEs). One language: a key, a word, a bar (hud.qte). The host runs them; a guest sends its presses
  // ('qte' messages) and gets the state back in the snapshot. Solo, they are yours alone.
  let holdQ = null, decomp = null, strap = null, decompDone = false, carryHold = 0, safeArm = 0, b2bSaid = 0;
  // CARRY THE DOWNED: F held a second on a downed friend: they are on your back (slow, no gun for you; they fire the pistol over
  // your shoulder); F again, or the lounge, sets them down. Everyone hears who carries whom ('carry').
  function startCarry(friend) {
    if (!friend || me.carrying) return;
    me.carrying = friend.id;
    (hosting() ? tell : say)({ da: 'carry', who: friend.id, by: myId() });
    others.carried(friend.id, 'me');
    hud.tip(`Carrying ${friend.name}: slow, no gun  ·  F again to set them down  ·  nobody gets left on this deck`);
    sound.thud(me.pos.clone().setY(0.6));
  }
  function stopCarry() {
    if (!me.carrying) return;
    (hosting() ? tell : say)({ da: 'carry', who: me.carrying, by: '' });
    others.carried(me.carrying, null);
    me.carrying = null;
  }
  function runCarry(dt, meleeDown) {
    if (me.carrying) {
      const o = others.list().find((x) => x.id === me.carrying);
      if (!o || !o.downed || o.out || me.safe || me.downed) stopCarry();
      else if (meleeDown) stopCarry();
    }
    walker.carrying = !!me.carrying;
    // (carried: you go where they go, a step behind, and you keep your pistol)
    if (me.carriedBy) {
      const c = others.list().find((x) => x.id === me.carriedBy);
      if (!c || !me.downed) { me.carriedBy = null; }
      else { const f = c.face || 0; walker.pos.set(c.pos.x - Math.sin(f) * 0.35, 0, c.pos.z - Math.cos(f) * 0.35); walker.vel.set(0, 0, 0); me.bleed = Math.min(RULES.bleed, me.bleed + dt * 0.5); }
    }
  }
  // THE CRANK (with friends): A and D, one after the other, at the wheel: the dish turns while you do.
  let crankLast = 0, crankKey = '', crankT = 0;
  function runCrank(dt, aKey, dKey) {
    const near = Math.hypot(me.pos.x - CRANK.x, me.pos.z - CRANK.z) < 1.7, busy = game.story?.busy === 'signal';
    crankT = Math.max(0, crankT - dt);
    if (near && busy) {
      const key = aKey && crankKey !== 'a' ? 'a' : dKey && crankKey !== 'd' ? 'd' : '';
      if (key) { crankKey = key; crankT = 0.7; crankLast += 1; const w = crankWheel(); if (w) w.rotateZ(0.6); sound.clatter?.('mag', V3(CRANK.x, 1, CRANK.z), 0.5); }
      hud.qte('A / D', 'CRANK THE DISH', game.story?.k ?? 0, crankT > 0 ? '#7dffb0' : '#ff3a2a', null, crankT > 0 ? 'keep it turning' : 'A, then D, then A...');
    } else if (crankShown) hud.qte(null);
    crankShown = near && busy;
    me.cranking = near && busy && crankT > 0;
  }
  let crankShown = false;
  // THE EYE: who has the stalker frozen.
  function runEye() {
    const z = dead.list.find((o) => o.K?.stalk && o.hp > 0 && o.frozen);
    if (!z) { hud.eye(null); return; }
    const names = (z.eyedBy || []).map((id) => (id === 'me' ? 'you' : others.map.get(id)?.name || 'a friend'));
    hud.eye(names.join(' · ') || 'you');
  }
  // BACK TO BACK: two of you within arm's reach, facing away from each other: harder hits, and the dead come from every side anyway.
  function runBackToBack() {
    if (!coop()) { arms.bonus = 1; return; }
    const f = fwd();
    const mate = others.list().find((o) => o.alive && !o.downed && o.pos.distanceTo(me.pos) < 1.7 && Math.sin(o.face || 0) * f.x + Math.cos(o.face || 0) * f.z < -0.5);
    arms.bonus = mate ? 1.25 : 1;
    if (mate && time - b2bSaid > 40) { b2bSaid = time; hud.banner('BACK TO BACK', 0x9ae6ff); const here = me.pos.clone().setY(1.3), sd = sideOf(f); playCut([{ for: 1.1, cam: (s) => ({ cam: here.clone().addScaledVector(sd, 2.6 - 0.4 * s).setY(1.35), at: here.clone().lerp(mate.pos.clone().setY(1.3), 0.5), from: here, fov: 46, lines: s < 0.2 ? 1 : 0, flash: s < 0.05 ? 0.5 : 0, title: 'BACK TO BACK', sub: '+25 % damage while you hold it', kk: Math.min(1, s * 3) }) }]); }
  }
  // THE DEAD-MAN SAFE: E on one plate arms it for a second; E on the other within that second opens it (two of you, or one at a sprint).
  let safeOpen = false;
  function runSafe(dt, useDown) {
    if (safeOpen || !station.isOpenZone('l')) return;
    safeArm = Math.max(0, safeArm - dt);
    SAFE.a.led && (SAFE.a.led.material.color.set(safeArm > 0 && safeArmed === 'a' ? 0x7dffb0 : 0xff2a14));
    SAFE.b.led && (SAFE.b.led.material.color.set(safeArm > 0 && safeArmed === 'b' ? 0x7dffb0 : 0xff2a14));
    const atA = Math.hypot(me.pos.x - SAFE.a.x, me.pos.z - SAFE.a.z) < 1.7, atB = Math.hypot(me.pos.x - SAFE.b.x, me.pos.z - SAFE.b.z) < 1.7;
    if (useDown && (atA || atB)) {
      const which = atA ? 'a' : 'b';
      if (safeArm > 0 && safeArmed !== which) openSafe();
      else { safeArmed = which; safeArm = 1.2; sound.thud(V3(which === 'a' ? SAFE.a.x : SAFE.b.x, 1.2, SAFE.a.z)); (hosting() ? tell : say)({ da: 'qte', k: 'plate', w: which }); }
    }
    if (atA || atB) hud.qte('E', safeArm > 0 ? 'THE OTHER PLATE' : 'TWO KEYS', safeArm / 1.2, '#ffd27a', null, safeArm > 0 ? 'the other plate, now' : 'this plate, then the other within a second');
    else if (safeShown) hud.qte(null);
    safeShown = atA || atB;
  }
  let safeArmed = '', safeShown = false;
  function openSafe() {
    if (safeOpen) return;
    safeOpen = true; safeArm = 0; hud.qte(null);
    if (SAFE.door) SAFE.door.position.y = 1.72;
    sound.door(V3(SAFE.at.x, 1.2, SAFE.at.z)); sound.sting(0.6);
    hud.banner('THE SAFE', 0xffd27a); addPoints(300);
    if (!logs.found.has(4)) setTimeout(() => { if (active) tookLog(4, true); }, 700);
    const here = me.pos.clone().setY(1.3);
    if (!SAFE.glow) { SAFE.glow = new THREE.PointLight(0x7dffb0, 0, 4, 2); SAFE.glow.position.set(SAFE.at.x, 1.3, SAFE.at.z - 0.9); scene.add(SAFE.glow); }
    SAFE.glow.intensity = 2.2;
    playCut([{ for: 1.6, cam: (s) => ({ cam: V3(SAFE.at.x + 1.4 - 0.4 * s, 1.55, SAFE.at.z - 2.4 + 0.4 * s), at: V3(SAFE.at.x, 1.15, SAFE.at.z - 0.4), from: V3(SAFE.at.x, 1.1, SAFE.at.z - 1.2), fov: 44 - 8 * s, lines: s < 0.2 ? 1 : 0, flash: s < 0.06 ? 0.6 : 0, say: ['Kirky', 'Two keys. ...Day four.'] }) }]);
    (hosting() ? tell : say)({ da: 'qte', k: 'safe' });
  }
  // HOLD IT SHUT: a shut door is being hammered on from the other side. Press E as the marker crosses the green; three good
  // hits fill it and it holds (150 to everyone near); fourteen seconds without and it bursts: open, and three of them through it.
  function startHold(d) {
    if (holdQ || decomp || strap || !d || d.open) return;
    holdQ = { d, t: 0, fill: 0.15, hits: 0, bang: 0, good: 0, miss: 0 };
    d.jolt = 99;
    const here = me.pos.clone().setY(1.3), n = d.across ? V3(0, 0, 1) : V3(1, 0, 0); if (n.dot(here.clone().sub(d.at)) < 0) n.negate();
    playCut([{ for: 1.3, cam: (s) => ({ cam: d.at.clone().addScaledVector(n, 2.2 - 0.5 * s).add(V3(n.z * 0.9, 1.5, -n.x * 0.9)), at: d.at.clone().setY(1.2), from: d.at.clone().addScaledVector(n, 0.5).setY(1.2), fov: 44 - 6 * s, lines: 1, flash: s < 0.06 ? 0.6 : 0, title: 'HOLD IT SHUT', sub: 'E as the marker crosses the green  ·  three good hits', kk: Math.min(1, s * 3) }) }]);
    sound.sting(0.8);
    if (hosting()) tell({ da: 'qte', k: 'hold', i: station.doors.indexOf(d) });
  }
  function holdHit(good) { if (!holdQ) return; if (good) { holdQ.fill = Math.min(1, holdQ.fill + 0.3); holdQ.hits++; holdQ.good = 0.25; sound.thud(holdQ.d.at.clone().setY(1.2)); } else { holdQ.fill = Math.max(0, holdQ.fill - 0.1); holdQ.miss = 0.25; } }
  function runHold(dt, useDown) {
    const h = holdQ; if (!h) return;
    if (h.d.open) { holdQ = null; hud.qte(null); h.d.jolt = 0; return; }   // (opened by someone: nothing to hold)
    h.t += dt; h.bang -= dt; h.good -= dt; h.miss -= dt;
    const at = 0.5 + 0.5 * Math.sin(h.t * 3.4), zone = [0.4, 0.6], near = h.d.at.distanceTo(me.pos) < 3.2;
    if (h.bang <= 0) { h.bang = 0.55 + Math.random() * 0.4; sound.bang(0.9, h.d.at.clone().setY(1.4)); walker.shake = Math.max(walker.shake, 0.03); }
    if (useDown && near) { const good = at >= zone[0] && at <= zone[1]; if (hosting() || !coop()) holdHit(good); else say({ da: 'qte', k: 'holdhit', g: good ? 1 : 0 }); }
    if (hosting() || !coop()) h.fill = Math.max(0, h.fill - dt * 0.05);
    hud.qte('E', 'HOLD IT SHUT', h.fill, h.miss > 0 ? '#ff3a2a' : h.good > 0 ? '#7dffb0' : '#9ae6ff', { at, zone }, near ? `${h.hits} of 3 good hits` : 'get to the door');
    if (!(hosting() || !coop())) return;
    if (h.fill >= 1) { endHold(true); return; }
    if (h.t > 14) endHold(false);
  }
  function endHold(held) {
    const h = holdQ; if (!h) return;
    holdQ = null; hud.qte(null); h.d.jolt = 0;
    if (held) { sound.sting(0.5); hud.banner('HELD', 0x7dffb0); for (const p of everyone()) if (p.pos.distanceTo(h.d.at) < 6) { if (p === me) addPoints(150); } hud.tip('It held. For now.'); }
    else {
      station.open(h.d); dead.doorsChanged(); sound.door(h.d.at.clone().setY(2)); sound.sting(1.2);
      const n = h.d.across ? V3(0, 0, 1) : V3(1, 0, 0); if (n.dot(me.pos.clone().sub(h.d.at)) > 0) n.negate();
      for (let i = 0; i < 3; i++) { const p = h.d.at.clone().addScaledVector(n, 1.2 + i * 0.7).add(V3((i - 1) * 0.5, 0, 0)); const z = dead.spawn('runner', p.x, p.z, Math.atan2(me.pos.x - p.x, me.pos.z - p.z), 'walk', hpOf(Math.max(1, game.round))); z.state = 'scream'; z.t = 0; game.left += 1; }
      const here = me.pos.clone().setY(1.3);
      playCut([{ for: 1.2, cam: (s) => ({ cam: here.clone().addScaledVector(n, -0.4).add(V3(n.z * 1.2, 0.3, -n.x * 1.2)), at: h.d.at.clone().setY(1.2), from: here, fov: 48, lines: 1, flash: s < 0.1 ? 0.9 : 0, title: 'IT BURST', kk: Math.min(1, s * 3) }) }]);
    }
    if (hosting()) tell({ da: 'qte', k: 'holdend', held: held ? 1 : 0, i: station.doors.indexOf(h.d) });
  }
  // DECOMPRESSION: with the cage up, the shaft's top hatch lets go for ten seconds: a siren, the bay's air going up the
  // shaft past you, the stars showing through the hatch far above. Hold a rail (E, by a wall of the bay) or be pulled
  // under the shaft and up into it (30 off, dropped back, dazed); one of you at the call panel by the gate can mash F
  // and shut it early. The dead in the bay have nothing to hold: they go up the shaft and are gone.
  function startDecomp() {
    if (decomp || holdQ || strap || game.over || !lift || lift.state !== 'up') return;
    decomp = { t: 0, left: 10, shutBy: 0, stamina: 1, stuck: 0, flung: [] };
    sound.siren?.(10); sound.sting(1.0);
    hud.banner('DECOMPRESSION', 0xff5040); hud.tip('The shaft hatch failed: hold a rail (E, by a wall), or shut it from the panel by the lift gate (mash F)');
    const c = lift.at.clone();
    playCut([{ for: 2.0, cam: (s) => ({ cam: V3(c.x + 1.3, 1.0 + 0.3 * s, c.z + 1.7), at: V3(c.x, HEIGHT + 16 + 18 * s, c.z), from: V3(c.x, 1.5, c.z), fov: 56 - 10 * s, lines: 1, flash: s < 0.08 ? 0.9 : 0, title: 'DECOMPRESSION', sub: 'the shaft hatch failed  ·  hold a rail (E), or shut it from the panel (F)', kk: Math.min(1, s * 3) }) }]);
    if (hosting()) tell({ da: 'qte', k: 'decomp' });
  }
  const nearWall = (() => { const dirs = Array.from({ length: 8 }, (_, i) => new THREE.Vector3(Math.sin(i * Math.PI / 4), 0, Math.cos(i * Math.PI / 4))); return (p) => dirs.some((d) => station.ray(p.clone().setY(1), d, 1.5) < 1.35); })();
  // (what the air takes with it: dust and scraps, up the shaft)
  function makeDebris() {
    const tex = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'); g.fillStyle = 'rgba(200,196,180,0.9)'; g.fillRect(10, 12, 12, 8); g.fillStyle = 'rgba(120,116,100,0.8)'; g.fillRect(14, 8, 6, 16); return new THREE.CanvasTexture(c); })();
    const list = Array.from({ length: 40 }, () => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })); sp.visible = false; sp.scale.setScalar(0.12 + Math.random() * 0.12); sp.userData = { v: new THREE.Vector3(), life: 0 }; scene.add(sp); return sp; });
    return list;
  }
  function runDebris(dt, on) {
    if (!debris) debris = makeDebris();
    const c = lift.at;
    for (const sp of debris) {
      const u = sp.userData;
      if (!sp.visible) { if (on && Math.random() < dt * 1.2) { sp.visible = true; sp.position.set(c.x + 2 + Math.random() * 18, 0.1 + Math.random() * 0.6, c.z - 8 + Math.random() * 16); u.v.set(0, 0, 0); u.life = 0; } continue; }
      u.life += dt;
      const to = c.clone().sub(sp.position).setY(0), d = to.length();
      if (d > 1.2) { to.multiplyScalar(1 / d); u.v.addScaledVector(to, dt * 9); u.v.y += dt * 1.5; } else u.v.y += dt * 16;
      sp.position.addScaledVector(u.v, dt);
      sp.material.rotation += dt * 6;
      if (sp.position.y > HEIGHT + 20 || u.life > 9 || (!on && sp.position.y > 0.5)) sp.visible = false;
    }
  }
  function runDecomp(dt, use, meleeDown) {
    const q = decomp; if (!q) return;
    q.t += dt; q.left -= dt;
    const k = Math.min(1, q.t / 1.2);
    lift.hatch(q.left > 0.5 ? k : Math.max(0, q.left / 0.5));
    const c = lift.at;
    const inBay = station.zoneAt(me.pos) === 'b' && !me.safe && !me.downed;
    const atPanel = Math.hypot(lift.panel.x - me.pos.x, lift.panel.z - me.pos.z) < 2.0;
    const holding = inBay && use && nearWall(me.pos) && q.stamina > 0;
    me.holdingRail = holding;
    if (holding) q.stamina = Math.max(0, q.stamina - dt * 0.07);
    if (inBay && !holding && q.stuck <= 0) {
      const to = c.clone().sub(me.pos).setY(0), d = to.length();
      if (d > 1.6) { to.multiplyScalar(1 / d); walker.push.addScaledVector(to, dt * (q.t < 3 ? 4 : 9)); }   // (the first seconds take the dead; you feel it build)
      else { q.stuck = 2.5; clawed(30, null); walker.held = 2.5; walker.push.set(0, 0, 0); walker.liftTo = 2.4; setTimeout(() => { walker.liftTo = 0; }, 1400); hud.tip('Pulled up into the shaft: hold a rail next time'); }
    }
    if (q.stuck > 0) q.stuck -= dt;
    if (atPanel && meleeDown) { q.shutBy++; sound.thud(lift.panel); if (q.shutBy >= 10 && q.left > 0.6) { q.left = 0.5; hud.banner('OVERRIDE', 0x7dffb0); addPoints(200); } if (hosting()) tell({ da: 'qte', k: 'override', n: q.shutBy }); else say({ da: 'qte', k: 'override' }); }
    hud.qte(atPanel ? 'F' : 'E', atPanel ? 'SHUT THE HATCH' : holding ? 'HOLD ON' : 'HOLD A RAIL', atPanel ? Math.min(1, q.shutBy / 10) : q.stamina, holding || atPanel ? '#7dffb0' : '#ff3a2a', null, `${Math.max(0, Math.ceil(q.left))} s  ·  ${atPanel ? 'mash F' : holding ? 'keep E held' : 'E by a wall'}`);
    // (the dead in the bay, loose: pulled under the shaft, and up it, and gone)
    if (hosting() || !coop()) for (const z of dead.list) {
      if (z.hp <= 0 || z.state === 'dead' || z.state === 'feed' || station.zoneAt(z.pos) !== 'b') continue;
      const to = c.clone().sub(z.pos).setY(0), d = to.length();
      if (d > 0.05) to.multiplyScalar(1 / d);
      z.vel.addScaledVector(to, dt * 34);   // (they have nothing to hold: far more prone to it than you)
      if (d < 1.6) { dead.kill(z, 'body', V3(0, 1, 0)); z.flung = 0; q.flung.push(z); game.left = Math.max(0, game.left - 1); if (coop()) tell({ da: 'kill', id: z.id, by: '', part: 'body', dx: 0, dz: 0 }); }
    }
    for (const z of q.flung) { z.flung += dt; z.y = (z.y || 0) + dt * (5 + 12 * z.flung); z.sink = z.y > HEIGHT + 30 ? 2 : 0; }
    runDebris(dt, q.left > 0.5);
    if (q.left <= 0) endDecomp();
  }
  function endDecomp() {
    if (!decomp) return;
    const flung = decomp.flung;
    decomp = null; me.holdingRail = false; hud.qte(null); lift.hatch(0); sound.slam?.(lift.at.clone().setY(HEIGHT + 2)); walker.push.set(0, 0, 0); walker.liftTo = 0;
    for (const z of flung) z.sink = 2;
    const c = lift.at.clone();
    playCut([{ for: 1.1, cam: (s) => ({ cam: V3(c.x + 1.6, 1.2, c.z + 1.2), at: V3(c.x, HEIGHT + 30, c.z), from: V3(c.x, 1.5, c.z), fov: 50, flash: s < 0.1 ? 0.6 : 0, lines: s < 0.3 ? 1 : 0, title: 'SEALED', sub: 'the hatch held', kk: Math.min(1, s * 3) }) }]);
    if (hosting()) tell({ da: 'qte', k: 'decompend' });
  }
  // THE LIFT COMING BACK: the signal answered, the cage sent down. From the bay, up the shaft at its lamp coming; from inside
  // the empty cage, the bay's square growing under it; from the floor as it lands, the gate opening, the runway coming on.
  function liftArrival() {
    lift.call(9.5); lift.runway(true); lift.light(1);
    story.line('Dome control', 'Lift descending. Clear the shaft.');
    sound.station?.();
    const c = lift.at.clone(), H = lift.half;
    playCut([
      { for: 3.2, cam: (s) => ({ cam: V3(c.x + 1.2, 1.1, c.z + 1.4), at: V3(c.x, lift.y + 1.2, c.z), from: V3(c.x, 1.5, c.z), fov: 54 - 8 * s, lines: 0.5, flash: s < 0.05 ? 0.5 : 0, title: 'THE LIFT IS COMING', sub: 'they heard you  ·  the cage is on its way down', kk: Math.min(1, s * 3) }) },
      { for: 3.0, cam: () => ({ cam: V3(c.x + 0.6, lift.y + 1.3, c.z - 0.5), at: V3(c.x, 0, c.z), from: V3(c.x, lift.y + 1.3, c.z), fov: 60, lines: 0.6 }) },
      { for: 5.0, cam: (s) => ({ cam: V3(c.x + H + 5.5 - 1.2 * s, 1.3, c.z + 2.6), at: V3(c.x, 1.1, c.z), from: V3(c.x + H + 1.5, 1.2, c.z), fov: 48 - 6 * s, lines: s < 0.2 ? 0.8 : 0, flash: s > 0.65 && s < 0.7 ? 0.6 : 0, title: s > 0.7 ? 'THE LIFT IS DOWN' : '', sub: s > 0.7 ? 'everyone in  ·  hold a rail (E)  ·  the last one in pulls the lever (F)' : '', kk: Math.min(1, Math.max(0, (s - 0.7) * 3)), say: s > 0.72 ? ['Kirky', 'The lift. Everyone in. Go.'] : null }) },
    ], () => lift.light(0));
  }
  // BOARDING: the lift is down, its gate open. Everyone in: E by a rail to hold on (fifteen seconds for the rest once
  // the first does); the last one in pulls the lever (mash F): the gate shuts on whatever reaches in, and the cage goes.
  function railAt(pos) { return lift && lift.state === 'down' && lift.gateK > 0.9 ? lift.rails.find((r) => Math.hypot(r.x - pos.x, r.z - pos.z) < 1.05) || null : null; }
  function runStrap(dt, useDown, meleeDown) {
    const st = game.story?.step ?? 0;
    if (STEPS[st]?.id !== 'escape' || game.over || exiting) { if (strap) { strap = null; hud.qte(null); } me.seat = false; return; }
    if (!strap) strap = { t: 0, since: -1, hatch: 0, shutting: false };
    const q = strap, rail = railAt(me.pos);
    if (!me.seat && rail && useDown && !me.downed) { me.seat = true; const face = Math.atan2(lift.at.x + 4 - rail.x, lift.at.z - rail.z); walker.spawn(rail.x, rail.z, face); walker.yaw = face; sound.thud(rail.clone().setY(0.5)); }
    if (me.seat) { walker.held = 0.2; if (!lift.inside(me.pos)) me.seat = false; }
    const seated = everyone().filter((p) => (p === me ? me.seat : p.st) && (p.alive || p.downed)), alive = everyone().filter((p) => p.alive || p.downed);
    if (seated.length > 0 && q.since < 0) q.since = 0;
    if (q.since >= 0) q.since += dt;
    const all = seated.length >= alive.length && alive.length > 0;
    if (!all && q.since > 15) { q.since = -1; me.seat = false; hud.banner('NOT EVERYONE', 0xff5040); story.line('Dome control', 'Everyone in the cage. Now. I mean it.'); }
    if (all && !q.shutting) { q.shutting = true; q.hatch = 0; sound.sting(0.9); }
    if (q.shutting) {
      if (meleeDown) { q.hatch++; sound.thud(lift.lever); walker.shake = 0.03; lift.pulled(q.hatch % 2 === 1); if (!hosting() && coop()) say({ da: 'qte', k: 'hatch' }); }
      hud.qte('F', 'PULL THE LEVER', q.hatch / 8, '#ffcf4a', null, 'mash F  ·  the last one in');
      if (q.hatch >= 8 && (hosting() || !coop())) { hud.qte(null); hatchShut(); }
    } else if (me.seat) hud.qte('E', 'HOLDING ON', seated.length / Math.max(1, alive.length), '#7dffb0', null, `${seated.length} of ${alive.length} in the cage  ·  ${q.since >= 0 ? Math.max(0, Math.ceil(15 - q.since)) + ' s' : ''}`);
    else if (rail) hud.hint('Press E to hold the rail');
    else if (lift.state === 'down' && me.pos.distanceTo(lift.at) < 10) hud.hint('Into the lift  ·  hold a rail (E)');
  }
  // The lever pulled: the gate shuts on whatever reaches in, the cage goes, and the way out plays (the win is at its end).
  function hatchShut() {
    if (exiting) return;
    lift.pulled(true); game.hatchShut = true;
    exitCinematic();
    if (hosting()) tell({ da: 'qte', k: 'hatchshut' });
  }
  function exitCinematic() {
    if (exiting) return;
    exiting = true;
    const c = lift.at.clone(), H = lift.half;
    const inCage = (dx, dz, y) => V3(c.x + dx, lift.y + y, c.z + dz);
    // (the dead at the gate, reaching in; the ones that had you are left behind)
    for (let i = 0; i < 3; i++) { const z = dead.spawn('runner', c.x + H + 0.7 + (i % 2) * 0.5, c.z - 0.9 + i * 0.9, -Math.PI / 2, 'walk', 9999); z.state = 'attack'; z.swing = 0.15 + i * 0.1; z.yaw = -Math.PI / 2; z.gateStuck = true; }
    lift.gate(1); lift.light(1);
    sound.sting(1.2);
    setTimeout(() => { if (active) { lift.leave(11); sound.deadAir?.(1.6, 'bang'); } }, 2300);
    const him = () => V3(me.pos.x, lift.y + 1.25, me.pos.z);
    playCut([
      // the lever down, the gate shutting on the arms coming through
      { for: 2.3, cam: (s) => { lift.gate(1 - Math.min(1, s * 1.5)); const gate = inCage(H, 0, 1.0), h = him(), back = h.clone().sub(gate).setY(0).normalize(), sd = V3(back.z, 0, -back.x);   // (over his shoulder, at it; never out of the cage)
        const cam = h.clone().addScaledVector(back, 1.4 - 0.3 * s).addScaledVector(sd, 0.5).setY(lift.y + 1.65), R = H - 0.3;
        cam.x = Math.min(c.x + R, Math.max(c.x - R, cam.x)); cam.z = Math.min(c.z + R, Math.max(c.z - R, cam.z));
        return { cam, at: gate, from: h, fov: 50, lines: s < 0.2 ? 1 : 0, flash: s < 0.05 ? 0.6 : 0, say: ['Kirky', 'Go. GO.'], free: true }; } },
      // from the bay floor: the cage lifting away, the lamp going up, the dead under it
      { for: 3.0, cam: (s) => ({ cam: V3(c.x + H + 3.4, 0.45, c.z + 1.1), at: inCage(0, 0, 1.0 + 0.4 * s), from: V3(c.x + H + 1.2, 1.0, c.z + 0.3), fov: 52 - 6 * s, lines: 0.4, say: s > 0.4 ? ['Dome control', 'Lift ascending. Hold on to something.'] : null }) },   // (low, out in the bay, the dead at the gate in front: the cage lifting off over them)
      // inside: him, holding the rail, the shaft's strips streaming down past the cage
      { for: 3.4, cam: (s) => { const o = V3(c.x - me.pos.x, 0, c.z - me.pos.z); if (o.lengthSq() < 0.05) o.set(1, 0, 0); o.normalize(); return { cam: V3(me.pos.x + o.x * 2.2, lift.y + 1.45 + 0.1 * s, me.pos.z + o.z * 2.2), at: him(), from: V3(me.pos.x + o.x * 0.6, lift.y + 1.3, me.pos.z + o.z * 0.6), fov: 42, lines: 0.6, say: s > 0.3 ? ['Kirky', "...We're out. We're out."] : null }; } },
      // looking up: the hatch opening, the stars
      { for: 3.2, cam: (s) => { lift.hatch(Math.min(1, s * 1.4)); return { cam: inCage(0.4, -0.3, 0.6), at: V3(c.x, HEIGHT + 34, c.z), from: inCage(0, 0, 1.0), fov: 62 - 12 * s, lines: 1, title: s > 0.45 ? 'THE SURFACE' : '', sub: s > 0.45 ? 'nine days after the last transmission' : '', kk: Math.min(1, Math.max(0, (s - 0.45) * 3)) }; } },
      // the white of it
      { for: 1.5, cam: (s) => ({ cam: inCage(0, 0, 1.3), at: V3(c.x, HEIGHT + 40, c.z), from: inCage(0, 0, 1.3), fov: 40, flash: Math.min(1, s * 2.5) }) },
    ], () => { lift.light(0); onWin(); });
  }
  function onQte(from, m, host) {
    if (m.k === 'hold' && !host) startHold(station.doors[+m.i]);
    else if (m.k === 'holdhit' && host) holdHit(!!+m.g);
    else if (m.k === 'holdend' && !host) { if (holdQ) { const held = !!+m.held; holdQ.fill = held ? 1 : 0; endHold(held); } }
    else if (m.k === 'decomp' && !host) startDecomp();
    else if (m.k === 'override') { if (decomp) { if (host) decomp.shutBy++; else decomp.shutBy = Math.max(decomp.shutBy, +m.n || 0); if (decomp.shutBy >= 10 && decomp.left > 0.6) decomp.left = 0.5; } }
    else if (m.k === 'decompend' && !host) endDecomp();
    else if (m.k === 'hatch' && host && strap) { strap.hatch++; }
    else if (m.k === 'hatchshut' && !host) hatchShut();
    else if (m.k === 'plate') { if (host) tell(m); if (safeArm > 0 && safeArmed !== m.w) openSafe(); else { safeArmed = m.w; safeArm = 1.2; } }
    else if (m.k === 'safe') { if (!safeOpen) { safeOpen = true; if (SAFE.door) SAFE.door.position.y = 1.72; hud.banner('THE SAFE', 0xffd27a); if (!logs.found.has(4)) setTimeout(() => { if (active) tookLog(4, false); }, 700); } if (host) tell(m); }
  }

  // ---- Cut-ins (Dave the Diver): a few seconds, the camera somewhere else, titles, lines, a flash; the world runs on
  // behind them (nothing can hurt you meanwhile: grace). shots: [{ for, cam: (s, into) => { cam, at, from?, fov, lines,
  // flash, title, sub, kk, say } }]. One at a time: a new one while one is up waits its turn (next).
  let cutIn = null, cutNext = [];
  function playCut(shots, done = null) {
    if (cutIn) { if (cutNext.length < 3) cutNext.push([shots, done]); return; }
    cutIn = { t: 0, shots, done, total: shots.reduce((a, s) => a + s.for, 0) };
    grace = Math.max(grace, cutIn.total + 0.3);
  }
  function runCut(dt) {
    const c = cutIn;
    if (!c) { if (cutNext.length) { const [shots, done] = cutNext.shift(); playCut(shots, done); } return false; }
    c.t += dt;
    let i = 0, t0 = 0;
    while (i < c.shots.length - 1 && c.t >= t0 + c.shots[i].for) { t0 += c.shots[i].for; i++; }
    const sh = c.shots[i], into = c.t - t0, v = sh.cam(Math.min(1, into / sh.for), into) || {};
    if (v.cam && v.at) {
      // (never through a wall: pulled in toward what it is looking at)
      // (on the deck: a shot written for the floor would put the camera under it; it is lifted with the floor it is on)
      { const lift = station.levelAt?.(me.pos) || 0; if (lift > 0.1) { if (v.cam.y < lift + 0.25) v.cam.y += lift; if (v.from && v.from.y < lift + 0.25) v.from.y += lift; if (v.at.y < lift + 0.1) v.at.y += lift; } }
      const from = (v.from || v.at).clone(), to = v.cam.clone().sub(from), len = to.length();
      const shaft = v.free || from.y > (station.ceilAt?.(from) ?? HEIGHT) - 0.05;   // (up the lift's shaft, over the station: nothing of it to hit)
      if (len > 0.01 && !shaft) { const room = station.ray(from, to.clone().divideScalar(len), len + 0.3) - 0.3; if (room < len) v.cam.copy(from).addScaledVector(to.divideScalar(len), Math.max(0.5, room)); }
      camera.position.copy(v.cam); camera.lookAt(v.at); camera.fov = v.fov || 48; camera.updateProjectionMatrix();
    }
    walker.model.root.visible = true; walker.view.visible = false;
    hud.cine(true, v.lines || 0, v.flash || 0, v.title || '', v.kk ?? (v.title ? 1 : 0), v.sub || '', '', v.say || null);
    if (c.t >= c.total) { cutIn = null; hud.cine(false); c.done?.(); }
    return true;
  }
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const fwd = () => V3(Math.sin(walker.yaw), 0, Math.cos(walker.yaw));
  const sideOf = (f) => V3(f.z, 0, -f.x);
  // The objectives: as one is done and the next begins, a cut-in for each: the lot of you, from in front (whoever is
  // near is in it), then the place itself with its name and what it wants. (kind: 'intro' | 'done'; i: the step.)
  function cutObjective(kind, i) {
    const step = STEPS[i]; if (!step) return;
    const here = me.pos.clone().setY(1.3), f = fwd(), sd = sideOf(f);
    const where = step.at ? step.at().clone() : null;
    const doneTitle = { power: 'POWER RESTORED', signal: 'SIGNAL SENT', hold: 'THE LIFT IS DOWN' }[step.id] || '';
    const subOf = step.id === 'hold' ? `the lift is coming back down  ·  hold until round ${game.story?.until || '?'}` : step.detail.replace(/\.$/, '').toLowerCase();
    const shots = [];
    // (toward it from your side of it: the camera stands between you and it, looking at it, a little off the line)
    const w = where || here, toMe = here.clone().sub(w).setY(0); if (toMe.lengthSq() < 0.01) toMe.copy(f).negate(); toMe.normalize();
    const across = V3(toMe.z, 0, -toMe.x), wFrom = w.clone().addScaledVector(toMe, 1.4).setY(1.2);   // (from: just outside it, clear of its own bulk)
    const face = () => me.pos.clone().setY(1.45);
    const LINE = { power: ['Power first.', 'The Reactor. Down from the Lab.'], signal: ['Now the radio.', 'The Med Bay. Along the Spine, and left.'], hold: ['Now we wait. With them.', "Three rounds. Nobody wanders off."] }[step.id] || ['', ''];
    const DONE = { power: 'Lights. Great. Now I can see what has been eating the crew.', signal: 'They heard. ...They heard.' }[step.id] || '';
    if (kind === 'done') {
      // the place, lit: the title; then his face, and what he makes of it
      shots.push({ for: 2.6, cam: (s) => ({ cam: w.clone().addScaledVector(toMe, 3.6 - 0.9 * s).addScaledVector(across, 1.3).setY(1.8 - 0.2 * s), at: w.clone().setY(1.1), from: wFrom, fov: 46 - 6 * s, flash: s < 0.08 ? 0.7 : 0, lines: s < 0.3 ? 1 : 0, title: doneTitle, kk: Math.min(1, s * 4) }) });
      shots.push({ for: 2.2, cam: (s) => ({ cam: face().addScaledVector(f, 1.3).addScaledVector(sd, 0.35 - 0.1 * s).setY(1.42), at: face(), from: face(), fov: 36, lines: 0, say: s > 0.15 && DONE ? ['Kirky', DONE] : null }) });
    } else {
      // his face: the word; the place, from your side of it, the title; the reverse: the lot of you, small, from where you have to get to
      shots.push({ for: 2.2, cam: (s) => ({ cam: face().addScaledVector(f, 1.3 - 0.15 * s).addScaledVector(sd, 0.4).setY(1.42), at: face(), from: face(), fov: 38, lines: s < 0.2 ? 1 : 0, flash: s < 0.06 ? 0.5 : 0, say: s > 0.1 ? ['Kirky', LINE[0]] : null }) });
      if (where) {
        shots.push({ for: 3.2, cam: (s) => ({ cam: w.clone().addScaledVector(toMe, 4.6 - 1.6 * s).addScaledVector(across, 1.6 - 0.9 * s).setY(2.0 - 0.5 * s), at: w.clone().setY(1.2), from: wFrom, fov: 48 - 10 * s, lines: s < 0.2 ? 1 : 0, flash: s < 0.06 ? 0.6 : 0, title: step.title, sub: subOf, kk: Math.min(1, s * 3) }) });
        shots.push({ for: 2.0, cam: (s) => ({ cam: here.clone().addScaledVector(f, -2.6 + 0.4 * s).addScaledVector(sd, -1.2).setY(2.2), at: here.clone().addScaledVector(f, 2.5).setY(1.1), from: here, fov: 52, lines: 0, say: s > 0.2 ? ['Kirky', LINE[1]] : null }) });
      } else {
        shots.push({ for: 2.6, cam: (s) => ({ cam: here.clone().addScaledVector(f, -2.4).addScaledVector(sd, -1.2).setY(2.3), at: here.clone().addScaledVector(f, 3).setY(1.2), from: here, fov: 50, lines: s < 0.2 ? 1 : 0, title: step.title, sub: subOf, kk: Math.min(1, s * 3) }) });
        shots.push({ for: 2.0, cam: (s) => ({ cam: face().addScaledVector(f, 1.25).addScaledVector(sd, -0.35).setY(1.42), at: face(), from: face(), fov: 36, lines: 0, say: s > 0.15 ? ['Kirky', LINE[1]] : null }) });
      }
    }
    playCut(shots);
  }
  let lastStep = -1, introducedPower = false;
  let objQuiet = -1;   // (until then, the story's steps change without their cut-ins: an editor stage jumping through them)
  function watchObjectives() {
    const s = game.story?.step ?? 0;
    if (lastStep < 0 || time < objQuiet) { lastStep = s; return; }
    if (s !== lastStep) {
      const was = lastStep; lastStep = s;
      if (s > was && !game.over) { if (STEPS[was]?.id !== 'escape' && STEPS[was]?.id !== 'hold') cutObjective('done', was); if (STEPS[s] && STEPS[s].id !== 'out' && STEPS[s].id !== 'escape') cutObjective('intro', s); }   // (the lift's arrival is its own cinematic)
    }
  }
  // ---- THE GLANCE: a scare does not take the camera. It pulls your view toward the thing for about a second, hard at
  // first and easing off (you can fight it), with speed lines; Kirky's word for it goes on the subtitle line. The camera
  // is yours the whole time, so nothing gets to you while you cannot see.
  let glance = null, lastGlance = -99;
  const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  function glanceAt(at, { for: dur = 1.1, k = 1, lines = 0.55, say = null, title = null, colour = 0xff5040, gap = 5 } = {}) {
    if (!at || me.safe || game.over || intro >= 0 || grab || cutIn) return false;
    if (time - lastGlance < gap) return false;   // (not two on top of each other)
    lastGlance = time;
    glance = { at, t: 0, for: dur, k, lines };
    if (say) story.line(say[0], say[1]);
    if (title) hud.banner(title, colour);
    return true;
  }
  function runGlance(dt) {
    const g = glance; if (!g) return;
    g.t += dt;
    const s = g.t / g.for;
    if (s >= 1 || me.safe || game.over) { glance = null; hud.glance(0); return; }
    const p = typeof g.at === 'function' ? g.at() : g.at;
    if (!p) { glance = null; hud.glance(0); return; }
    const eye = walker.camera.position, d = p.clone().sub(eye);
    const lim = walker.aim > 0.5 ? 0.9 : 0.42, wantYaw = Math.atan2(d.x, d.z), wantPitch = Math.max(-lim * 0.8, Math.min(lim, Math.atan2(d.y, Math.hypot(d.x, d.z))));   // (third person: no further than the mouse could take it)
    const a = 1 - Math.exp(-g.k * 6.5 * (1 - s) * dt);   // (hard at first, nothing by the end)
    walker.yaw += wrapA(wantYaw - walker.yaw) * a;
    walker.pitch += (wantPitch - walker.pitch) * a;
    hud.glance(g.lines * (s < 0.15 ? s / 0.15 : 1 - (s - 0.15) / 0.85));
  }
  // The scares: a glance at each (the camera stays yours). What each looks at, and what he says.
  function cutScare(e) {
    if (me.safe || game.over || intro >= 0 || grab) return;
    const z = e.z;
    const head = () => (z?.head && Number.isFinite(z.head.x) ? z.head.clone() : (z ? z.pos.clone().setY((z.y || 0) + 1.5) : null));
    const K = e.kind;
    if (K === 'lampOut') { glanceAt(null); hud.glance(0.4); setTimeout(() => hud.glance(0), 500); story.line('Kirky', 'Not now. Not the lamp.'); }
    else if (K === 'lamp' && z) glanceAt(head, { say: ['Kirky', '...There you are.'] });
    else if (K === 'vent') glanceAt(V3(7 * CELL, HEIGHT - 0.2, 2 * CELL), { for: 1.3, k: 1.2 });
    else if (K === 'ventDrop' && z) glanceAt(head, { k: 1.4, lines: 0.7 });
    else if (K === 'breath') { hud.glance(0.35); setTimeout(() => hud.glance(0), 700); }
    else if (K === 'sleeper' && z) glanceAt(head, { k: 1.3, say: ['Kirky', 'It was dead. It was dead!'] });
    else if (K === 'doorstep' && z) glanceAt(head, { k: 1.5, lines: 0.7 });
    else if (K === 'watcher' && z) glanceAt(head, { for: 1.4, say: ['Kirky', "...Don't look away."] });
    else if (K === 'steam' && e.p) glanceAt(e.p.clone(), { for: 0.9, k: 0.8 });
    else if (K === 'hanging' && z) glanceAt(head, { k: 1.4, lines: 0.7 });
    else if (K === 'knock' && e.door) {
      glanceAt(e.door.at.clone().setY(1.4), { for: 1.3, say: ['Kirky', 'Something wants in.'] });
      // (and sometimes it does not stop: hold it shut. The host's call, or yours alone)
      if ((hosting() || !coop()) && Math.random() < 0.5) setTimeout(() => { if (active && !game.over && !e.door.open) startHold(e.door); }, 2200);
    }
    else if (K === 'ankle' && z) { walker.held = 1.1; clawed(8, z); glanceAt(z.pos.clone().setY(0.3), { k: 1.6, lines: 0.8 }); }
    else if (K === 'stalker' && z) glanceAt(head, { for: 1.5, k: 1.3, title: 'KEEP EYES ON IT', colour: 0x9ae6ff, say: ['Kirky', 'Keep looking at it. Everyone.'] });
    else if (K === 'riseAll') { const r = dead.list.find((o) => o.state === 'rise' && o.hp > 0); glanceAt(r ? () => (r.head ? r.head.clone() : r.pos.clone().setY(1.4)) : null, { for: 1.6, k: 1.2, lines: 0.8, title: "THEY'RE ALL GETTING UP", say: ['Kirky', 'All of them. All of them at once.'] }); }
    else if (K === 'window' && z) glanceAt(() => z.pos.clone().setY(RISE + 1.4), { for: 1.5, k: 0.9, say: ['Kirky', "...That's outside."] });
    else if (K === 'parapet' && z) glanceAt(() => z.pos.clone().setY(RISE + 1.9), { for: 1.3, k: 1.3, lines: 0.7 });
    else if (K === 'overhead') glanceAt(V3(me.pos.x, RISE + 0.9, 4 * CELL - 1.56), { for: 1.2, k: 0.9, say: ['Kirky', '...Upstairs.'] });
    else if (K === 'bunk' && e.p) glanceAt(e.p.clone().setY(0.75), { for: 1.3, k: 1.2 });
    else if (K === 'bunkUp' && z) glanceAt(head, { k: 1.4, lines: 0.7, say: ['Kirky', '...Nope.'] });
    else if (K === 'sitter' && z) glanceAt(head, { k: 1.3, say: ['Kirky', '...Hey.'] });
    else if (K === 'chest' && e.p) glanceAt(e.p.clone().setY(0.6), { k: 1.3, lines: 0.7 });
    else if (K === 'wheel') glanceAt(V3(CRANK.x, 1.05, CRANK.z), { for: 1.4, say: ['Kirky', '...Nobody is on that.'] });
    else if (K === 'gone' && e.p) glanceAt(e.p.clone().setY(0.25), { for: 1.4, say: ['Kirky', '...It was right there.'] });
    else if (K === 'recorder' && e.p) glanceAt(e.p.clone().setY(0.4), { for: 1.3, k: 0.9, say: ['Kirky', "...Who's playing that?"] });
    else if (K === 'blackout') { hud.glance(0.3); setTimeout(() => hud.glance(0), 600); }
  }
  // Each frame while it has you: its face, and nothing else; F shoves.
  function runGrab(dt, meleeDown) {
    if (!grab) return;
    if (!grab.z) grab.z = dead.byId(grab.id);
    const z = grab.z;
    grab.t = (grab.t || 0) + dt;
    // (dead, done with you, or never yours; a guest's copy takes a moment to catch up with the host's word, so a moment's grace)
    if (!z || z.hp <= 0 || (z.victimId != null && z.victimId !== myId()) || (z.state !== 'grab' && grab.t > 0.8)) { grab = null; hud.struggle(null); return; }
    if (meleeDown) { grab.hold = Math.min(1, grab.hold + (grab.lift ? LIFT.shove : GRAB.shove)); walker.lunge = 1; walker.recoil(2.2); z.flinch = 1; sound.swing(true); sound.meat(z.hip, true); }
    else grab.hold = Math.max(0, grab.hold - GRAB.slip * dt);
    // (the host reads the shoving off the zombie itself; a guest sends it)
    if (hosting()) z.hold = Math.max(z.hold || 0, grab.hold);
    else if (meleeDown) say({ da: 'shove', z: grab.id, k: grab.hold });
    if (grab.hold >= 1) { endGrab(true); return; }
    // It lunges at your face, again and again: the view jolts in with each one, the screen reddens, it snarls; the
    // whole thing shakes harder the longer it goes on.
    const lung = lungeOf(z.t), ph = z.t % GRAB.lunge;
    if (ph < grab.ph) { sound.voice(z, 'claw'); sound.freaked?.(); hud.hurtFrom(0, 1); }   // (a new lunge begins)
    grab.ph = ph;
    const head = z.head, dx = head.x - walker.camera.position.x, dz = head.z - walker.camera.position.z, dy = head.y - 0.08 + 0.05 * lung - walker.camera.position.y;
    walker.yaw = Math.atan2(dx, dz); walker.pitch = Math.max(-0.6, Math.min(0.6, Math.atan2(dy, Math.hypot(dx, dz))));
    walker.climb = 0;
    walker.shake = Math.max(walker.shake, 0.02 + 0.09 * lung + 0.02 * Math.min(1, z.t / GRAB.bite));
    walker.fovPunch = Math.max(walker.fovPunch, 7 * lung);
    hud.blood(0.18 + 0.4 * lung);
    hud.struggle(grab.hold);
  }
  const tick = () => new Promise((r) => setTimeout(r, 20));
  // Every shader compiled now, with nobody looking: a body of each kind, the bullets, the flash, the gun before your
  // eye. (The first of anything drawn mid-round is a stall; this is where it goes instead.)
  function warmUp() {
    const undo = [];
    const show = (o) => { if (o && o.visible === false) { o.visible = true; undo.push(() => { o.visible = false; }); } };
    const bodies = [...(dead.bodies || []), ...Object.values(dead.special || {})];
    for (const body of bodies) for (const parts of [body.parts, body.lite]) for (const part of parts || []) {
      const mesh = part.mesh; if (!mesh) continue;
      show(mesh);
      if (mesh.count === 0) { mesh.count = 1; mesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0, -50, 0)); mesh.instanceMatrix.needsUpdate = true; undo.push(() => { mesh.count = 0; }); }
    }
    show(arms.burst); show(arms.beam); show(walker.view); show(walker.model.root); show(core);
    try { renderer.compile(scene, camera); } catch (error) { console.warn('DEAD AIR: warm-up', error); }
    for (const u of undo) u();
  }
  let station = null, walker = null, dead = null, arms = null, sound = null, coins = null, lounge = null, drops = null, others = null, scares = null, crate = null, core = null, pickups = null, logs = null, active = false, building = null, time = 0, grace = 0;
  const hud = createDeadHud();
  const events = [];
  // The game.
  // gold: picked up off the dead, spent in the lounge; mods, perks, maxHealth: what its bar has done for you.
  const fresh = () => ({ night: '', round: 0, points: RULES.points, health: RULES.health, maxHealth: RULES.health, sinceHit: 9, left: 0, spawned: 0, spawnIn: 0, breakFor: 4, kills: 0, headshots: 0, over: false, downFor: 0,
    gold: 0, houseTake: 0, mods: { damage: 1, reload: 1, spread: 1 }, perks: {}, boof: 0, golden: 0, cut: -1, loungeOpen: false, story: { step: 0, k: 0, until: 0, busy: '' }, power: false, won: false, dark: false, epitaph: '', tally: {}, hard: false, picked: false });
  // One of this round's, with Nightmare's measure on it.
  const hpOf = (n) => ROUND.hp(n) * (game.hard ? 1.25 : 1) * (N().hp || 1);
  // Tonight's modifier (nights.js): what it changes, read where it matters.
  const N = () => nightOf(game.night) || {};
  function applyNight() {
    const n = N();
    if (scene.fog) scene.fog.density = n.fog || 0.035;
    if (walker) walker.gravityScale = n.gravity || 1;
    if (dead) { dead.gravityScale = n.gravity || 1; dead.knockScale = n.knock || 1; }
    if (scares) { scares.gaps = { lamp: n.lampGap || 1, breath: n.breath || 1 }; scares.reset(n.sleepers === 'all' ? CORPSES.map(([x, z, yaw], i) => [x, z, yaw, -200 - i]) : []); }
  }
  const game = fresh();
  const me = { id: 'me', pos: new THREE.Vector3(), eye: new THREE.Vector3(), alive: true, safe: false, downed: false, out: false, bleed: 0 };
  // ---- With friends ----
  const coop = () => !!party?.active;
  const hosting = () => !coop() || party.hosting;
  const myId = () => (coop() ? party.myId : 'me');
  const say = (m) => { if (coop()) { if (party.hosting) party.toAll(m); else party.toHost(m); } };   // to everyone (a guest: by way of the host)
  const tell = (m) => { if (coop() && party.hosting) party.toAll(m); };                             // the host, to the guests
  let folk = [me];   // everyone in the game, as of this frame (me, and the others as they last said)
  const everyone = () => folk;
  const refreshFolk = () => { folk = [me, ...(others ? others.list() : [])]; return folk; };
  let seenIntro = false, sendClock = 0, snapClock = 0, shots = 0, coinId = 1, reviving = 0, goldLight = null, wasG = false;
  const myLook = () => { const { goldGuns, ...look } = currentLook(); return { ...look, gilded: [...arms.gilded].map((id) => GUNS[id].model) }; };
  const myState = () => {
    const w = walker, e = arms.lastEnd || me.pos, r = (n, k = 100) => Math.round(n * k) / k;
    return { x: r(w.pos.x), z: r(w.pos.z), face: r(w.face), yaw: r(w.yaw), pitch: r(w.pitch), speed: r(Math.hypot(w.vel.x, w.vel.z), 10), sprint: w.sprinting ? 1 : 0, aim: r(w.aim, 10), shots,
      ex: r(e.x), ey: r(e.y), ez: r(e.z), down: me.downed ? 1 : 0, out: me.out ? 1 : 0, safe: me.safe ? 1 : 0, pts: game.points, hp: Math.round(game.health), bleed: Math.ceil(me.bleed), rl: arms.reloading > 0 ? 1 : 0, mic: lounge?.dancing ? 1 : 0,
      y: r(w.y), air: w.airT < 9 ? 1 : 0, mel: w.meleeT < 0.5 ? 1 : 0, st: me.seat ? 1 : 0, hr: me.holdingRail ? 1 : 0, ck: me.cranking ? 1 : 0, rv: me.reviving ? 1 : 0, cb: me.carriedBy ? 1 : 0,
      lx: lounge?.inside && lounge.room ? r(lounge.room.pos.x) : 0, lz: lounge?.inside && lounge.room ? r(lounge.room.pos.z) : 0, ly: lounge?.inside && lounge.room ? r(lounge.room.yaw) : 0, em: lounge?.inside && lounge.room ? (lounge.room.emoter?.playing || 0) : 0 };
  };
  const cleanState = (raw) => { const s = {}; for (const k of STATE) s[k] = Number.isFinite(raw?.[k]) ? raw[k] : 0; return s; };
  let wasFire = false, wasUse = false, wasReload = false, wasSwap = false, wasMelee = false, wasHelp = false, stepAt = 0, puffAt = 0, hitMark = 0, hurtDir = { b: 0, k: 0 };
  const wallGuns = [];

  async function build() {
    hud.show(true); hud.loading('Welding the station', 0.05);
    await tick();
    station = await buildStation(scene);
    hud.loading('Loading the guns', 0.45); await tick();
    walker = new Walker(scene, camera, station);
    await walker.rig();   // (the parts of his guns that move when he reloads: reload.js)
    hud.loading('Waking the dead', 0.6); await tick();
    dead = new Dead(scene, station);
    arms = new Arms(scene, walker, station, dead);
    sound = createDeadSound(station);
    coins = new Coins(scene);
    pickups = new Pickups(scene);
    others = new Others(scene, sound);
    story = createStory({ station, hud, sound, walker, dead, others, camera, scene, game: () => game, me: () => me, everyone, hosting, coop, tell, say, playLighter, onPower, onWin, lampOn: (id, pos) => others?.lamp(id, pos), seated: () => { const all = everyone().filter((p) => p.alive || p.downed); return all.length ? all.filter((p) => (p === me ? me.seat : p.st)).length / all.length : 0; }, hatchShut: () => !!game.hatchShut, liftCall: () => liftArrival(), liftIn: () => { lift.setUp(); lift.call(6.8); lift.light(1); }, lift: () => lift, cranking: () => me.cranking || others.list().some((o) => o.ck), atCore: () => everyone().filter((p) => p.alive && Math.hypot(p.pos.x - CORE.x, p.pos.z - CORE.z) < 2.8).length, party: () => everyone().filter((p) => p.alive || p.downed).length });
    logs = createLogs({ scene, spots: LOG_SPOTS });
    dust = makeDust(station);
    scene.add(dust);
    watchLight = new THREE.PointLight(0xff2a18, 0, 6, 1.4);   // (on the Watcher, so that you can see it seeing you)
    scene.add(watchLight);
    uplinkLight = new THREE.PointLight(0xff3020, 0, 8, 1.6);
    uplinkLight.position.set(UPLINK.x, 2.4, UPLINK.z + 0.8);
    scene.add(uplinkLight);
    scares = createScares({ station, dead, walker, sound, pieces: station.pieces, scene });
    scares.logs = logs;
    lift = createLift({ scene, pieces: station.pieces, boxes: station.boxes });
    crate = createCrate({ scene, at: CRATE, price: CRATE.price, pieces: station.pieces, guns: walker.model.guns, sound });
    // The reactor's core: a column of cold blue light in the middle of the Reactor, humming (dim until it is opened up).
    core = new THREE.Group();
    core.position.set(CORE.x, 0, CORE.z);
    const TALL = ceilOf(Math.round(CORE.x / CELL), Math.round(CORE.z / CELL));
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, TALL, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0x0a1820, emissive: 0x48c8ff, emissiveIntensity: 0.4, transparent: true, opacity: 0.55, side: THREE.DoubleSide, roughness: 0.1 }));
    glass.position.y = TALL / 2;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, TALL, 12), new THREE.MeshBasicMaterial({ color: 0x9ae6ff, toneMapped: false }));
    rod.position.y = TALL / 2;
    for (const y of [0.15, TALL - 0.15]) { const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.3, 24), new THREE.MeshStandardMaterial({ color: 0x2a2c30, metalness: 0.8, roughness: 0.4 })); ring.position.y = y; core.add(ring); }
    const coreLight = new THREE.PointLight(0x48c8ff, 0, 16, 1.6);
    coreLight.position.y = 2.5;
    core.add(glass, rod, coreLight);
    core.userData = { glass, coreLight };
    scene.add(core);
    // (both solid: you walk round them, and the core stops bullets)
    station.boxes.push({ x0: CORE.x - 0.95, x1: CORE.x + 0.95, z0: CORE.z - 0.95, z1: CORE.z + 0.95 }, { x0: CRATE.x - 0.7, x1: CRATE.x + 0.7, z0: CRATE.z - 0.5, z1: CRATE.z + 0.5, top: 1.0 });
    // Golden Hour's light: made now, dark until then (a light coming or going makes everything recompile).
    goldLight = new THREE.PointLight(0xffc04a, 0, 15, 1.5);
    scene.add(goldLight);
    scene.userData.eye = camera.position;
    drops = new Drops(scene, (p, kind, level) => sound.clatter(kind, p.clone().setY(0.1), level));
    // (friends in the lounge with you: drawn in the room where they said they were, dancing if they are)
    lounge = createLounge({ station, game, arms, walker, openCasino, onOut: comeOut, hud, sound, renderer, solo: () => !coop(), friends: () => (coop() ? others.list().filter((o) => o.safe).map((o) => ({ id: o.id, name: o.name, look: o.look || {}, x: o.lx, z: o.lz, yaw: o.ly, emote: o.em })) : []) });
    // The gun chalked on the wall: the gun itself, hung there, with its outline drawn round it.
    for (const W of WALL_GUNS) {
      const c = station.center(W.i, W.j), G = GUNS[W.gun];
      const held = walker.model.guns[G.model], copy = held.group.clone(true);
      copy.traverse((o) => { o.visible = true; });
      const n = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[W.side];
      const out = new THREE.Vector3(-n[0], 0, -n[1]), up = new THREE.Vector3(0, 1, 0), along = new THREE.Vector3().crossVectors(out, up);
      const face = new THREE.Vector3(c.x + n[0] * 1.5, 1.55, c.z + n[1] * 1.5);
      // (flat to the wall, its barrel along it, the right way up: the gun's sideways is the wall's out, its barrel the wall's along)
      const barrel = new THREE.Vector3(held.muzzle.x, 0, held.muzzle.z).normalize(), sideways = new THREE.Vector3().crossVectors(up, barrel);
      const from = new THREE.Matrix4().makeBasis(sideways, up, barrel), to = new THREE.Matrix4().makeBasis(out, up, along);
      copy.quaternion.setFromRotationMatrix(to.multiply(from.invert()));
      copy.scale.setScalar(1.35);
      const box = new THREE.Box3().setFromObject(copy), mid = box.getCenter(new THREE.Vector3());
      copy.position.copy(face).sub(mid).addScaledVector(out, 0.08);
      const chalk = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.65), new THREE.MeshStandardMaterial({ map: chalkTexture(G.name), transparent: true, depthWrite: false, roughness: 1 }));
      chalk.position.copy(face).addScaledVector(out, 0.01).setY(face.y + 0.05);
      chalk.lookAt(chalk.position.clone().add(out));
      const glint = new THREE.PointLight(0xbfd6ff, 2.2, 3.4, 1.6);
      glint.position.copy(face).addScaledVector(out, 0.9).setY(2.0);
      scene.add(copy, chalk, glint);
      wallGuns.push({ ...W, G, at: new THREE.Vector3(c.x + n[0] * 1.2, 0, c.z + n[1] * 1.2) });
    }
  }

  function reset() {
    station.reset();
    dead.clear();
    dead.doorsChanged();
    arms.reset();
    const kept = { hard: game.hard, picked: game.picked };   // (Normal or Nightmare stays as it was chosen: Again is the same game again)
    Object.assign(game, fresh(), kept);
    logs?.place();
    game.woke = false; wokeAt = 0; game.hatchShut = false; me.seat = false; me.holdingRail = false; me.cranking = false;
    holdQ = null; decomp = null; strap = null; decompDone = false; hud.qte(null); lift?.reset(); exiting = false; if (debris) for (const sp of debris) sp.visible = false;
    lastZone = null; seenZones = new Set(); endDrill(false);
    safeOpen = false; safeArm = 0; me.carrying = null; me.carriedBy = null; me.reviving = false; if (SAFE.door) SAFE.door.position.y = 1.1; if (SAFE.glow) SAFE.glow.intensity = 0;
    if (skit) endSkit(false);
    if (dud) endDud(); if (conga) endConga(); resetTrophy(); dudNow = dudNext = false; danceT = 0;
    if (chickenTaken) { chickenTaken = false; arms.chicken = false; homeChicken(); walker.setGun(walker.gun.id); }
    if (!coop() || hosting()) game.night = pickNight();
    applyNight();
    scares.steamRate = N().steam || 1;
    dead.grabChance = game.hard ? 0.5 : 0.3;
    arms.mods = game.mods;
    coins.clear();
    pickups.clear();
    drops.clear();
    for (const s of strips) { s.on = s.how !== 'dark'; }
    grab = null; grabCut = null; hud.struggle(null);
    lounge.clearStage();
    toStart();
    Object.assign(me, { id: myId(), alive: true, downed: false, out: false, bleed: 0, safe: false });
    coinId = 1; shots = 0; reviving = 0;
    scares.reset();
    crate.reset();
    wardenCut = null;
    arms.golden = false; if (goldLight) goldLight.intensity = 0; hud.cine(false); walker.model.applyLook(walker.look);
    dead.remote = coop() && !party.hosting;   // (a guest draws the host's dead: see onNet)
    // Something feeding, behind the door: you will find it when you open it. (What it is eating is everybody's own.)
    for (const [x, z, yaw] of CORPSES) dead.corpse(x, z, yaw);   // (the crew, where they fell)
    for (const F of FEEDERS) {
      const p = station.center(F.i, F.j);
      dead.corpse(p.x + Math.sin(F.yaw) * 0.85, p.z + Math.cos(F.yaw) * 0.85, F.yaw + 1.9);   // (one of the crew)
      if (!dead.remote) dead.spawn('walker', p.x, p.z, F.yaw, 'feed', 260);
    }
    hud.card(null);
    hud.down('');
    hud.round(0);
    hud.points(game.points);
    hud.gold(0);
  }

  // To the start (in a party, each to a place of their own round it).
  function toStart() {
    const c = station.center(START.i, START.j), id = String(myId());
    let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
    const k = id === 'host' || id === 'me' ? 0 : 1 + (Math.abs(h) % 3), off = [[0, 0], [1.3, 0.9], [-1.1, 1.2], [0.6, -1.3]][k];
    walker.spawn(c.x + off[0], c.z + off[1], START.yaw);
    walker.downed = false;
  }

  // Where one can come from: a place in a part of the station that is open, out of your sight, not too near you.
  const spawnAt = new THREE.Vector3();
  function pickSpawn(unseen = false) {
    const options = [];
    const up = everyone().filter((p) => p.alive && !p.safe), near = up.length ? up : [me];
    for (const o of OPENINGS) {
      if (!station.isOpenZone(o.zone)) continue;
      const far = Math.min(...near.map((p) => Math.hypot(o.x - p.pos.x, o.z - p.pos.z)));
      if (far < 4.5) continue;
      // (how far it has to come, in cells, to the nearest of you: never the far end of the station)
      const cells = Math.min(...near.map((p) => dead.flowTo(p.pos)[o.j * station.width + o.i]));
      if (!Number.isFinite(cells) || cells > 8) continue;
      const seen = near.some((p) => station.see(p.eye, spawnAt.set(o.x, 1.2, o.z)));
      if (unseen && seen) continue;
      options.push({ o, score: (far > 7 && far < 20 ? 5 : 1) + (seen ? 1 : 2) + Math.max(0, 4 - Math.abs(cells - 3)) + Math.random() * 3 });
    }
    if (!options.length) return null;
    options.sort((a, b) => b.score - a.score);
    const o = options[0].o;
    spawnAt.set(o.x, 0, o.z);
    spawnAt.yaw = o.yaw;
    return spawnAt;
  }

  function startRound() {
    game.round++;
    game.wardenDue = game.round % (N().wardenEvery || RULES.warden.every) === 0 ? RULES.warden.after : 0;
    if (hosting() || !coop()) {
      const venting = N().decomp ? game.round >= 3 && game.round % N().decomp === 0 : (!decompDone && game.round >= 4 && Math.random() < 0.5);
      if (venting) { decompDone = true; setTimeout(() => { if (active && !game.over) startDecomp(); }, 18000 + Math.random() * 10000); }
      if (game.round >= 2) setTimeout(() => { if (active && !game.over) scares.hangOne(); }, 1500 + Math.random() * 4000);   // (one on a cable in the Reactor, most rounds)
      if (game.round === (game.hard ? 4 : 6)) setTimeout(() => { if (active && !game.over) { const n = scares.riseAll(); if (n) tell({ da: 'riseAll' }); } }, 2500);   // (the sleepers' round)
    }
    if (game.round === 10 && !trophyDone && (hosting() || !coop())) { trophyDone = true; setTimeout(() => { if (active && !game.over) trophyCall(); }, 9000); }
    dead.hpNow = hpOf(game.round);   // (for the scares: what one of this round takes)
    if (me.downed || me.out) getUp(1);   // (whoever bled out is back for the next one)
    game.party = Math.max(1, everyone().filter((p) => p.alive || p.downed).length);
    game.left = Math.round(ROUND.count(game.round) * (N().count || 1) * (1 + RULES.party.more * (game.party - 1)) * (game.hard ? 1.35 : 1));
    if (game.round === 1 && N().name) { hud.banner(`TONIGHT  ·  ${N().name}`, 0x9ae6ff); hud.tip(`Tonight: ${N().blurb}`); }
    game.spawned = 0;
    game.spawnIn = 0.6;
    hud.round(game.round, true);
    sound.roundStart(game.round);
    // Every fourth round from the fourth, the deck takes the lights back: only your lamps, and the reds, low.
    const dark = N().dark ? true : game.hard ? game.round >= 2 && game.round % 3 === 2 : game.round >= 4 && game.round % 4 === 0;
    if (dark !== game.dark) { game.dark = dark; if (dark) { hud.banner('LIGHTS OUT', 0xff5040); setTimeout(() => { if (active) { story.pa(-1); tell({ da: 'pa', i: -1 }); } }, 1200); } }
    // And now and then, from the second round, one of them is just standing there, at the far end, looking at you.
    watcherDue = Math.random() < (game.hard ? 0.85 : 0.65) ? 3 + Math.random() * 8 : 0;   // (from the first round)
  }

  // ---- The objective marker: a diamond on it when it is in view, an arrow at the edge of the screen when it is not ----
  const markAt = new THREE.Vector3();
  function runMarker() {
    const w = story.where();
    const el = renderer.domElement, W = el.clientWidth, H = el.clientHeight;
    if (!w || game.over || game.cut >= 0 || intro >= 0) { hud.marker(null); return; }
    const d = w.at.distanceTo(me.pos);
    if (d < 3.5) { hud.marker(null); return; }
    markAt.copy(w.at).setY(1.7).project(camera);
    const behind = markAt.z > 1;
    let x = (markAt.x + 1) / 2 * W, y = (1 - markAt.y) / 2 * H;
    const inside = !behind && markAt.x > -0.92 && markAt.x < 0.92 && markAt.y > -0.85 && markAt.y < 0.85;
    if (inside) { hud.marker(x, y, w.title, `${Math.round(d)} m`, false); return; }
    // (off the screen: the arrow sits on the edge, pointing the way; behind you, it points the other way)
    let ax = markAt.x, ay = markAt.y;
    if (behind) { ax = -ax; ay = -ay; }
    const ang = Math.atan2(ax, ay);   // (0 = up the screen)
    const rx = 0.86, ry = 0.78;
    const k = Math.min(rx / Math.max(1e-6, Math.abs(ax)), ry / Math.max(1e-6, Math.abs(ay)));
    x = (ax * k + 1) / 2 * W; y = (1 - ay * k) / 2 * H;
    hud.marker(x, y, w.title, `${Math.round(d)} m`, true, ang);
  }

  // The crate: a marker on it while it is in view (and not right next to you), with how far and what it costs.
  const crateAt = new THREE.Vector3(CRATE.x, 1.9, CRATE.z), crateMark = new THREE.Vector3();
  // ---- THE BAY DRILL: the first time in, the Arrival Bay (where nothing comes) teaches the controls, one at a time: a card
  // with the key, what it does, and a marker on the thing to do it to; each step is done when you do it, with a word from
  // Kirky; then the way on. Once per browser ('deadair.drill'); the editor's stage 'drill' runs it again. Leaving the bay
  // ends it (and wakes the station, as always).
  const DRILL = [
    { id: 'move', key: 'W A S D', text: 'Walk', note: 'the mouse looks round  ·  no board down here', need: 5, line: 'Legs. I remember these.' },
    { id: 'sprint', key: 'SHIFT', text: 'Sprint', note: 'hold it while you walk forward', need: 1.2, line: 'Faster than the board. ...No. It is not.' },
    { id: 'jump', key: 'SPACE', text: 'Jump  ·  vault a crate', note: 'run at the crate and jump: over it, or up on it', at: () => BAY_CRATE, mark: 'the crate', line: 'Over. Like a rail, but worse.' },
    { id: 'aim', key: 'RIGHT + LEFT', text: 'Aim and fire', note: 'hold the right button to aim down the sights, left to fire', at: () => V3(CORPSES[0][0], 0.4, CORPSES[0][1]), mark: 'make sure', need: 2, line: 'Sorry. Had to be sure.' },
    { id: 'reload', key: 'R', text: 'Reload', note: 'a wall gun sells ammo for the gun you carry', line: 'Count your rounds. Nobody else will.' },
    { id: 'melee', key: 'F', text: 'Melee', note: 'when one is on you: it knocks them back  ·  mash it if one grabs you', line: 'Up close, the gun is a stick.' },
    { id: 'use', key: 'E', text: 'Pick up the recorder', note: 'E also opens doors, buys from the walls, holds rails', at: () => V3(LOG_SPOTS[0][0], 0.2, LOG_SPOTS[0][1]), mark: 'the recorder', line: "Jun's. Day one.", skip: () => logs.found.has(1) || !logs.placed.some((l) => l.day === 1 && !l.taken) },
    { id: 'go', key: 'H', text: 'Every control, any time', note: 'the way on is the Spine, east  ·  nothing comes until you leave this bay', at: () => V3(7 * CELL, 1.4, 2 * CELL), mark: 'the Spine', wait: 6, line: 'Power first. Then the radio. Then home.' },
  ];
  let drill = null, drillMark = new THREE.Vector3(), drillEv = {};
  function startDrill(force = false) {
    if (!force && load('deadair.drill') === '1') return;
    drill = { i: 0, t: 0, k: 0, done: 0, last: me.pos.clone(), shots: 0, step: DRILL[0] };
    while (drill.i < DRILL.length && DRILL[drill.i].skip?.()) drill.i++;
    drill.step = DRILL[drill.i];
  }
  function endDrill(finished) {
    if (!drill) return;
    drill = null; hud.drill(null); hud.dmarker(null);
    if (finished) { try { store('deadair.drill', '1'); } catch {} }
  }
  // what happened this frame, for the drill: { shot, swing, reload, help, use }
  function runDrill(dt, ev) {
    const d = drill; if (!d) return;
    if (game.over || intro >= 0) return;
    if (station.zoneAt(me.pos) !== 'b' && d.step?.id !== 'go') { endDrill(true); return; }   // (out of the bay: it is over, and the station is awake)
    if (cutIn || me.safe) { hud.drill(null); hud.dmarker(null); return; }
    const st = d.step; if (!st) { endDrill(true); return; }
    d.t += dt;
    if (d.done > 0) {   // (done: the card green a moment, then the next)
      d.done -= dt;
      if (d.done <= 0) { d.i++; while (d.i < DRILL.length && DRILL[d.i].skip?.()) d.i++; d.step = DRILL[d.i]; d.k = 0; d.t = 0; if (!d.step) { endDrill(true); return; } }
    } else {
      const moved = me.pos.distanceTo(d.last); d.last.copy(me.pos);
      if (st.id === 'move') d.k += moved / st.need;
      else if (st.id === 'sprint') d.k += walker.sprinting && walker.moving ? dt / st.need : 0;
      else if (st.id === 'jump') d.k = walker.vault || walker.y > 0.25 ? 1 : d.k;
      else if (st.id === 'aim') { if (ev.shot && walker.aim > 0.5) d.shots++; d.k = d.shots / st.need; }
      else if (st.id === 'reload') d.k = ev.reload ? 1 : d.k;
      else if (st.id === 'melee') d.k = ev.swing ? 1 : d.k;
      else if (st.id === 'use') d.k = st.skip() ? 1 : d.k;
      else if (st.id === 'go') d.k = ev.help || d.t > st.wait ? 1 : Math.min(0.99, d.t / st.wait);
      if (d.k >= 1) { d.k = 1; d.done = 1.1; sound.sting?.(0.25); if (st.line) story.line('Kirky', st.line); }
    }
    hud.drill({ key: st.key, text: st.text, note: st.note, n: d.i + 1, of: DRILL.length, k: d.k, done: d.done > 0 });
    // (its marker)
    if (st.at && d.done <= 0) {
      const el = renderer.domElement, W = el.clientWidth, H = el.clientHeight, p = st.at();
      drillMark.copy(p).project(camera);
      if (drillMark.z < 1 && Math.abs(drillMark.x) < 0.95 && Math.abs(drillMark.y) < 0.9) hud.dmarker((drillMark.x + 1) / 2 * W, (1 - drillMark.y) / 2 * H, `${st.mark}  ·  ${Math.round(p.distanceTo(me.pos))} m`);
      else hud.dmarker(null);
    } else hud.dmarker(null);
  }
  function runCrateMark() {
    const el = renderer.domElement, W = el.clientWidth, H = el.clientHeight;
    const d = crateAt.distanceTo(me.pos);
    if (game.over || game.cut >= 0 || intro >= 0 || d < 3 || d > 24 || !station.see(walker.camera.position, crateAt)) { hud.cmarker(null); return; }
    crateMark.copy(crateAt).project(camera);
    if (crateMark.z > 1 || Math.abs(crateMark.x) > 0.95 || Math.abs(crateMark.y) > 0.9) { hud.cmarker(null); return; }
    hud.cmarker((crateMark.x + 1) / 2 * W, (1 - crateMark.y) / 2 * H, `${Math.round(d)} m  ·  ${CRATE.price}`);
  }

  // Babitus's chip, out of the crate: gold, and a word from Kirky.
  function tookChip() {
    game.gold += 500; hud.gold(game.gold, 500); playCoin(1); sound.buy();
    hud.banner('G.O.Y', 0xffcf4a);
    story.speak('chip'); story.tip('chip');
  }

  // ---- The open mic, with friends: every one of you on the stage, dancing, for four seconds at once ----
  let micFor = 0;
  function runMic(dt) {
    if (!coop()) { lounge.waiting = ''; return; }
    const all = everyone(), on = all.filter((p) => (p === me ? lounge.dancing : p.mic)).length;
    lounge.waiting = `OPEN MIC  ·  ${on} of ${all.length} dancing  ·  everyone, on the stage`;
    if (!hosting()) return;
    micFor = on === all.length && all.length > 0 ? micFor + dt : 0;
    if (micFor > 4) { micFor = 0; lounge.show(); tell({ da: 'mic' }); }
  }

  // ---- The Watcher ----
  // One of them, stood in an opening you can see from here, a long way off, looking at you. It does not move while
  // you look at it. Look away, and it is coming.
  let watcherDue = 0, doorNoise = 0;
  function spawnWatcher() {
    const eye = walker.camera.position, look = walker.lookDir;
    const options = OPENINGS.filter((o) => {
      if (!station.isOpenZone(o.zone)) return false;
      const d = Math.hypot(o.x - me.pos.x, o.z - me.pos.z);
      if (d < 10 || d > 30) return false;
      const p = new THREE.Vector3(o.x, 1.4, o.z), to = p.clone().sub(eye).normalize();
      return to.dot(look) > 0.3 && station.see(eye, p);
    });
    if (!options.length) return;
    const o = options[Math.floor(Math.random() * options.length)];
    const z = dead.spawn('runner', o.x, o.z, Math.atan2(me.pos.x - o.x, me.pos.z - o.z), 'walk', hpOf(game.round) * 1.5);
    z.state = 'stand'; z.t = 0; z.watch = true; z.standFor = 999;
    game.left += 1;
    sound.sting(0.35);
  }

  // ---- The Warden ----
  let wardenCut = null;   // { z, t }: his arrival, being shown
  function spawnWarden(twin = false) {
    const at = pickSpawn();
    if (!at) { game.wardenDue = 2; return; }
    if (N().twins && !twin) setTimeout(() => { if (active && !game.over) spawnWarden(true); }, 2600);   // (the twins: the other, a breath behind)
    const z = dead.spawn('warden', at.x, at.z, at.yaw ?? 0, 'walk', hpOf(game.round) * RULES.warden.hp);
    const p = everyone().find((o) => o.alive) || me;
    z.yaw = Math.atan2(p.pos.x - z.pos.x, p.pos.z - z.pos.z);
    z.state = 'scream'; z.screamFor = 2.6; z.t = 0;
    game.left += 1;
    wardenCut = { z, t: 0 };
    story.tip('warden');
    tell({ da: 'warden', id: z.id });
  }
  // His arrival: low in front of him as he roars, looking up; then his name. (The game does not stop for it.)
  function runWardenCut(dt) {
    const c = wardenCut;
    if (!c) return false;
    if (!c.z) { c.z = dead.byId(c.id); if (!c.z) { if ((c.wait = (c.wait || 0) + dt) > 3) wardenCut = null; return false; } }
    c.t += dt;
    const z = c.z, head = z.head.clone(), front = new THREE.Vector3(Math.sin(z.yaw), 0, Math.cos(z.yaw)), side = new THREE.Vector3(front.z, 0, -front.x), C = RULES.warden.cut;
    let cam, at, fov, title = '', sub = '', k = 0, lines = 0;
    if (c.t < 1.2) { const s2 = c.t / 1.2; cam = z.pos.clone().addScaledVector(front, 2.8 - 0.6 * s2).addScaledVector(side, 0.8).setY(0.7); at = head; fov = 46 - 6 * s2; lines = c.t < 0.25 ? 1 : 0; }
    else { const s2 = (c.t - 1.2) / (C - 1.2); cam = z.pos.clone().addScaledVector(front, 4.2).addScaledVector(side, -1.4).setY(1.2); at = head.clone().add(new THREE.Vector3(0, -0.6, 0)); fov = 52; title = 'THE WARDEN'; sub = 'Nobody leaves the station'; k = s2; }
    const room = station.ray(z.pos.clone().setY(1.2), cam.clone().sub(z.pos.clone().setY(1.2)).normalize(), 6);   // (never through a wall)
    if (room < cam.distanceTo(z.pos.clone().setY(1.2))) cam.copy(z.pos.clone().setY(1.2)).addScaledVector(cam.clone().sub(z.pos.clone().setY(1.2)).normalize(), Math.max(1.2, room - 0.3));
    camera.position.copy(cam); camera.lookAt(at); camera.fov = fov; camera.updateProjectionMatrix();
    walker.view.visible = false;
    hud.cine(true, lines, c.t < 0.12 ? 0.6 : 0, title, k, sub);
    if (c.t >= C) { wardenCut = null; hud.cine(false); }
    return true;
  }

  // ---- The way in: a cut-in the first time you arrive (click or any key skips it) ----
  let intro = -1;
  function runIntro(dt) {
    intro += dt;
    story.dt = dt;
    walker.update(dt, {}, [0, 0], false, false, true);
    if (!story.entrance(intro, dt)) endIntro();
  }
  function endIntro() { intro = -1; walker.power = 1; story.entranceDone(); startDrill(); lift?.light(0); if (lift && lift.state === 'down') setTimeout(() => { if (active && lift.state === 'down') lift.leave(9); }, 600); hud.hint('Click to begin'); askDifficulty(); if (!introducedPower && !testing) { introducedPower = true; setTimeout(() => { if (active && game.story?.step === 0 && !game.over) cutObjective('intro', 0); }, 1500); } }
  // Normal or Nightmare: the host's call, before the first round (Nightmare once you have got out once in this browser).
  function askDifficulty() {
    setTimeout(() => { if (active) lounge.prepare().catch((error) => console.warn('DEAD AIR: the lounge could not be got ready.', error)); }, 300);   // (a lot to build: now, while the card is up and nothing moves)
    if (game.picked || testing) { game.picked = true; return; }
    if (!hosting()) { hud.pick(true, { waiting: true }); return; }
    document.exitPointerLock?.();
    hud.hint('');
    hud.pick(true, { unlocked: !!load('deadair.won'), night: N(), onPick: (d) => { setDifficulty(!!d); tell({ da: 'diff', h: game.hard ? 1 : 0, nt: game.night }); hud.hint('Click to begin'); } });
  }
  function setDifficulty(hard) {
    game.hard = hard; game.picked = true;
    hud.pick(false);
    dead.grabChance = hard ? 0.5 : 0.3;
    if (hard) hud.banner('NIGHTMARE', 0xe8291c);
  }

  function addPoints(n) { if (n > 0 && game.golden > 0) n *= 2; game.points += n; hud.points(game.points, n); }

  // ---- Golden Hour ----
  const goldenMine = () => finished() || !!testing?.golden || !!game.boofFree;   // (boofFree: the editor's stage, for whoever has not finished the story)
  const goldenReady = () => goldenMine() && game.boof >= RULES.golden.kills && game.golden <= 0 && game.cut < 0;
  let dudNow = false, dudNext = false, dud = null;
  function lightUp() {
    game.cut = 0;
    game.boof = 0;
    dudNow = !!(testing?.dud || dudNext || Math.random() < 0.1); dudNext = false;   // (one boof in ten is a dud)
    grace = RULES.golden.cut + 0.5;
    walker.model.applyLook({ ...walker.look, smoke: 'goldbroken' });
    playLighter();
  }
  // Each frame: the cut-in (the camera is its, after the walker has put it where it would be), then the hour itself.
  function runGolden(dt) {
    const k = walker.model;
    if (game.cut >= 0) {
      game.cut += dt;
      const t = game.cut, C = RULES.golden.cut;
      const head = k.root.position.clone().setY(1.62), front = new THREE.Vector3(Math.sin(walker.face), 0, Math.cos(walker.face)), side = new THREE.Vector3(front.z, 0, -front.x);
      let cam, at, fov, lines = 0, flash = 0, title = '';
      // (the first shot is on his mouth, where the BOOF is: under the brim of his hat, from a little below)
      const mouth = k.ember ? k.ember.getWorldPosition(new THREE.Vector3()) : head.clone().add(new THREE.Vector3(0, -0.2, 0));
      story.dt = dt;
      const shot = story.goldenShot(t, C, head, front, side, mouth, k);
      ({ cam, at, fov, lines, flash, title } = shot);
      if (shot.puff) k.exhale(dt * shot.puff, 1.9);   // (the BOOF itself: a lungful out, a big one)
      camera.position.copy(cam); camera.lookAt(at); camera.fov = fov; camera.updateProjectionMatrix();
      k.root.visible = true; walker.view.visible = false;
      hud.cine(true, lines, Math.max(0, flash), title, shot.kk, shot.sub, '', shot.say);
      goldLight.intensity = (shot.puff ? 45 : 30) * Math.min(1, t / 0.5);
      goldLight.position.copy(head).addScaledVector(front, 0.5);
      if (t >= C) { game.cut = -1; hud.cine(false); if (dudNow) startDud(); else { game.golden = RULES.golden.time; arms.golden = true; playGolden(); } }
    }
    if (game.golden > 0) {
      game.golden -= dt;
      goldLight.intensity = 22 * Math.min(1, game.golden / 1.5) * (0.9 + 0.1 * Math.sin(time * 9));
      goldLight.position.copy(walker.pos).setY(1.8);
      k.updateSmoke?.(dt);
      if (game.golden <= 0) { game.golden = 0; arms.golden = false; goldLight.intensity = 0; walker.model.applyLook(walker.look); }
    } else if (game.cut < 0) goldLight.intensity = 0;
    hud.golden(goldenMine() && goldenReady(), game.golden, goldenMine() ? game.boof / RULES.golden.kills : -1, RULES.golden.kills);
    hud.keys({ golden: goldenMine() });
    if (goldenMine() && goldenReady()) story.tip('golden');
  }

  // E: open the door you are at, or buy the gun on the wall.
  // One of Jun's recorders: kept, the card, his voice, a cut-in on it and on Kirky listening; a word from him after. Everyone's.
  function tookLog(day, mine = true) {
    const got = logs.take(day);
    if (!got) return;
    if (mine) tell({ da: 'log', day });
    const at = got.pos || me.pos.clone(), here = me.pos.clone().setY(1.3), f = fwd(), sd = sideOf(f);
    const toMe = here.clone().sub(at).setY(0); if (toMe.lengthSq() < 0.01) toMe.copy(f).negate(); toMe.normalize();
    const secs = sound.log?.(day) || 4;
    hud.log(day, logs.WHO, got.text);
    // (a little light on it for the camera: the recorder's own glow, up, for the length of it)
    const glow = new THREE.PointLight(0xffd9a8, 5, 4, 1.6); glow.position.copy(at).setY(0.9); scene.add(glow);
    setTimeout(() => glow.removeFromParent(), 2200);
    setTimeout(() => { if (active) hud.log(null); }, (secs + 2.5) * 1000);
    playCut([
      { for: 1.5, cam: (s) => ({ cam: at.clone().addScaledVector(toMe, 1.3 - 0.3 * s).add(V3(0, 0.55, 0)).addScaledVector(V3(toMe.z, 0, -toMe.x), 0.4), at: at.clone().setY(0.05), from: at.clone().setY(0.4), fov: 40 - 6 * s, flash: s < 0.06 ? 0.4 : 0, lines: s < 0.15 ? 0.6 : 0 }) },
      { for: Math.max(2.4, secs - 0.8), cam: (s) => ({ cam: here.clone().addScaledVector(f, 1.35 - 0.15 * s).addScaledVector(sd, 0.45).setY(1.42), at: here.clone().setY(1.3), from: here, fov: 34, lines: 0 }) },
    ], () => { if (active) setTimeout(() => story.speak(`log${day}`), 300); });
    hud.tip(`${logs.count} of ${logs.LOGS.length} logs found  ·  the rest are out there, on other nights`);
  }
  function useAt() {
    // (the crawlspace: either hatch)
    for (const [a, b] of [[DUCT.from, DUCT.to], [DUCT.to, DUCT.from]]) {
      if (Math.hypot(me.pos.x - a.x, me.pos.z - a.z) < 1.7 && !walker.crawl) return { text: 'Press E  ·  the crawlspace  ·  on your belly, no gun; W on, S back', price: 0, act: () => { story.tip('duct'); walker.enterDuct(a, b); } };
    }
    // (the chicken, under its bunk)
    if (chicken && !chickenTaken && chickenHome && station.isOpenZone('q') && me.pos.distanceTo(chickenHome) < 1.8) return { text: 'Press E  ·  a rubber chicken, under the bunk  ·  ...why not', price: 0, act: takeChicken };
    // (a recorder, if you are standing by one)
    const lo = logs?.offer(me.pos);
    if (lo) return { text: lo.text, price: 0, act: () => tookLog(lo.log) };
    // (the crate first: it stands by the core, and its reach is the shorter)
    if (station.isOpenZone('r') && Math.hypot(me.pos.x - CRATE.x, me.pos.z - CRATE.z) < 2.3) {
      const o = crate.offer(true, arms.slot?.id);
      story.tip('crate');
      if (o) return { text: o.text, price: o.price, act: () => { const id = o.act(); if (id === 'chip') tookChip(); else if (id) { arms.give(id); sound.buy(); } } };
    }
    const so = story.offer(me.pos);
    if (so) return so;
    if (station.lounge.outside.distanceTo(me.pos) < 2.3) {
      story.tip('lounge');
      if (!game.loungeOpen) return { text: `Press E to unseal the Crew Lounge  [${LOUNGE.price}]  ·  a safe room: gold, upgrades, a drink`, price: LOUNGE.price, act: () => { game.loungeOpen = true; say({ da: 'lounge' }); sound.door(station.lounge.at.clone().setY(2)); } };
      return { text: 'Press E to go into the Crew Lounge  ·  sealed, safe', price: 0, act: goIn };
    }
    for (const d of station.doors) {
      if (d.open || d.at.distanceTo(me.pos) > 2.4) continue;
      if (holdQ && holdQ.d === d) continue;   // (being held shut: E is the hold's, not the door's price)
      const i = station.doors.indexOf(d);
      story.tip('door');
      return { text: `Press E to open ${d.name}  [${d.price}]`, price: d.price, act: () => { openDoor(i); if (!hosting()) say({ da: 'door', i }); } };
    }
    if (station.isOpenZone('r') && Math.hypot(me.pos.x - CRATE.x, me.pos.z - CRATE.z) < 2.3) {
      const o = crate.offer(true, arms.slot?.id);
      story.tip('crate');
      if (o) return { text: o.text, price: o.price, act: () => { const id = o.act(); if (id === 'chip') tookChip(); else if (id) { arms.give(id); sound.buy(); } } };
    }
    for (const W of wallGuns) {
      if (W.at.distanceTo(me.pos) > 1.9) continue;
      const have = arms.carried.find((c) => c.id === W.gun);
      if (have) return { text: `Press E for ${W.G.name} ammo  [${Math.round(W.price * RULES.ammoPrice)}]`, price: Math.round(W.price * RULES.ammoPrice), act: () => arms.give(W.gun) };
      return { text: `Press E for ${W.G.name}  [${W.price}]`, price: W.price, act: () => arms.give(W.gun) };
    }
    return null;
  }

  // A door opens (bought here, or by a friend): for everyone. The host tells the others.
  function openDoor(i) {
    const d = station.doors[i];
    if (!d || d.open) return;
    station.open(d); dead.doorsChanged(); sound.door(d.at.clone().setY(2));
    for (const s of strips) if (s.how === 'dark' && station.isOpenZone(s.zone)) { s.on = true; s.level = 0; s.how = 'blink'; }
    tell({ da: 'door', i });
  }

  // One of them is dead: whoever did it gets the points; the host counts it off the round, and decides what it had on it.
  // Who did what (for the card at the end): kills, headshots, friends got up; by player id.
  function tallyOf(id) {
    const t = game.tally;
    if (!t[id]) t[id] = { name: id === myId() ? (getName() || 'Kirky') : (others.map.get(id)?.name || 'Friend'), kills: 0, heads: 0, revives: 0 };
    return t[id];
  }
  function onKill(z, part, by, dir) {
    if (by) { const t = tallyOf(by); t.kills++; if (part === 'head') t.heads++; }
    if (by === myId()) {
      if (z?.kind === 'warden') { addPoints(RULES.warden.bounty); sound.sting(1.2); }
      if (z?.kind === 'screamer') addPoints(100);
      addPoints(part === 'head' ? RULES.headshot : RULES.kill);
      game.kills++;
      // (every kill charges the Golden BOOF, until it is full)
      if (goldenMine() && game.golden <= 0 && game.cut < 0 && game.boof < RULES.golden.kills) { game.boof++; if (game.boof === 5) story.tip('boof'); }
      if (part === 'head') { game.headshots++; playHeadshot(); } else playKill();
      hitMark = 0.2;
    }
    if (z) {
      sound.voice(z, 'die');
      for (let i = 0; i < 3; i++) arms.bits.pool(z.pos.clone().add(new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5)), 0.35 + Math.random() * 0.3);
    }
    if (!hosting() || !z) return;
    game.left = Math.max(0, game.left - 1);
    if (z.kind === 'warden' || Math.random() < GOLD.chance + (part === 'head' ? GOLD.head : 0)) {
      const value = GOLD.value(game.round) * (z.kind === 'warden' ? 6 : 1), n = z.kind === 'warden' ? RULES.warden.coins : Math.random() < 0.3 ? 2 : 1;
      coins.drop(z.pos, value, n, coinId);
      tell({ da: 'coin', id: coinId, x: Math.round(z.pos.x * 100) / 100, z: Math.round(z.pos.z * 100) / 100, v: value, n });
      coinId += n;
    }
    tell({ da: 'kill', id: z.id, by, part, dx: dir ? Math.round(dir.x * 100) / 100 : 0, dz: dir ? Math.round(dir.z * 100) / 100 : 0 });
    const kind = z.kind === 'warden' ? 'ammo' : Pickups.roll();
    if (kind) { const p = pickups.drop(kind, z.pos); tell({ da: 'pk', id: p.id, k: kind, x: Math.round(z.pos.x * 100) / 100, z: Math.round(z.pos.z * 100) / 100 }); }
  }

  // A pickup, had: what it does, for everyone (the host says so; everyone does it to themselves).
  function pickupEffect(kind) {
    if (kind === 'ammo') {
      for (const c of arms.carried) { c.spare = GUNS[c.id].spare; c.mag = arms.magOf(c.id); }
      arms.rl = null;
      hud.banner('MAX AMMO', 0x7dffb0);
      sound.buy();
    } else if (kind === 'nuke') {
      hud.banner('NUKE', 0xffd27a);
      hud.whiteout(1);
      sound.nuke?.();
      addPoints(RULES.nuke);
      if (hosting()) {
        for (const z of dead.list) if (z.hp > 0 && z.state !== 'feed') { dead.kill(z, 'body', null); game.left = Math.max(0, game.left - 1); tell({ da: 'kill', id: z.id, by: '', part: 'body', dx: 0, dz: 0 }); }
      }
    }
  }
  function tookPickup(p) {
    pickups.take(p.id);
    story.tip('pickup');
    if (hosting()) { pickupEffect(p.kind); tell({ da: 'pkfx', id: p.id, k: p.kind }); }
    else say({ da: 'pick', id: p.id });
  }

  // Something got its hands on you (z: which, if known).
  function clawed(damage, z) {
    if (grab) return;   // (one has you: the rest wait their turn; the bite, when it comes, comes after it lets go)
    if (me.shield) return;   // (a cut-in never hurts you)
    if (conga && z && !conga.z.includes(z)) congaBroken = true;   // (a claw from one not in the line)
    story.tip('melee');
    if (game.over || me.downed || me.out) return;
    if (me.safe) { sound.bang(0.8 + Math.random() * 0.4, station.lounge.at.clone().setY(1.2)); lounge.hit(); return; }
    if (grace > 0) return;
    game.health -= testing?.god ? 0 : damage; game.sinceHit = 0;
    grace = Math.max(grace, 0.25);   // (three of them landing in the same instant is one hit, not ninety points of you gone at once)
    if (z) { sound.voice(z, 'claw'); hurtDir = { b: wrap(Math.atan2(z.pos.x - me.pos.x, z.pos.z - me.pos.z) - walker.yaw), k: 1 }; }   // (and which side it came from)
    playHurt();
    if (game.health <= 0) { game.health = 0; down(); }
  }

  // Up again: a friend got you up (part: of your health), or a new round has begun.
  function getUp(part = RULES.revived) {
    const wasOut = me.out;
    Object.assign(me, { downed: false, out: false, alive: true, bleed: 0 });
    walker.downed = false;
    game.health = game.maxHealth * part;
    game.sinceHit = 0;
    grace = 2;
    hud.down('');
    if (wasOut) toStart();
  }

  // Into the lounge, through the airlock (and, when you come back out, here again, with whatever is waiting).
  let reliefSaid = false;
  function goIn() {
    sound.door(station.lounge.at.clone().setY(2));
    me.safe = true;
    // (the relief: the breath out, the chord, and the first time, his word for it)
    setTimeout(() => { if (active && me.safe) { sound.relief?.(); if (!reliefSaid) { reliefSaid = true; story.line('Kirky', '...Okay. Okay.'); } } }, 700);
    me.pos.copy(station.lounge.outside);
    walker.vel.set(0, 0, 0);
    sound.inside(true);
    hud.lounge(true, '');
    input0.trickPressed = false;   // (the E that opened it is not the casino's)
    lounge.enter().catch((error) => { console.warn('DEAD AIR: the lounge would not open.', error); comeOut(); });
  }
  function comeOut() {
    me.safe = false;
    if (hosting() && game.round > 0 && !game.over && game.left > 0) scares.doorstep(station.lounge.outside, station.lounge.facing, hpOf(game.round));
    grace = 1.5;   // (a moment to see what is there before it can get its hands on you)
    const o = station.lounge.outside;
    walker.spawn(o.x, o.z, station.lounge.facing);
    sound.inside(false);
    sound.door(station.lounge.at.clone().setY(2));
    hud.lounge(false);
    setSpace('hall');
    holdMusic(0);
    hud.hint('Click to carry on');
  }

  // Down. On your own, that is the end of it; with friends, you have a while for one of them to get you up.
  function down() {
    story.tip('down');
    if (coop()) {
      Object.assign(me, { downed: true, alive: false, bleed: RULES.bleed });
      walker.downed = true;
      sound.down();
      hud.down('DOWN');
      return;
    }
    gameOver();
  }
  // Everybody is down: that is it. (The host decides, and tells everyone.)
  // The power is on: every strip in the station lights, and stays lit (the dark ones blink awake).
  function onPower() {
    game.power = true;
    for (const s of strips) { s.on = true; if (s.how === 'dark') { s.how = 'blink'; s.level = 0; } }
    sound.station?.();
  }
  // Everyone is on the shuttle: that is the end, and a good one.
  function onWin() {
    if (game.over) return;
    game.over = true; game.won = true;
    store('deadair.won', '1');
    sound.sting?.(1.3);
    hud.banner('YOU GOT OUT', 0x7dffb0);
    tell({ da: 'won' });
    // (the shuttle asks; he answers; what he carries; then the line)
    const n = everyone().filter((p) => p.alive || p.downed).length || 1;
    story.speak('benny');
    setTimeout(() => { if (game.over) story.line('Kirky', n === 1 ? '...One.' : `...${['', '', 'Two', 'Three', 'Four'][n] || n}.`); }, 2000);
    setTimeout(() => { if (game.over && logs.count > 0) story.speak('kept'); }, 3900);
    setTimeout(() => { if (game.over) story.speak('out'); }, logs.count > 0 ? 5900 : 3900);
    setTimeout(() => { if (game.over && game.won) showCard(); }, logs.count > 0 ? 7600 : 5600);
  }

  function gameOver() {
    if (game.over) return;
    game.over = true;
    me.alive = false;
    walker.downed = true;
    game.downFor = 0;
    if (!me.downed) sound.down();
    hud.down(coop() ? 'EVERYONE IS DOWN' : 'YOU ARE DOWN');
    tell({ da: 'over' });
  }
  function showCard() {
    hud.down('');
    document.exitPointerLock?.();
    const guest = coop() && !party.hosting;
    // (your best: the round you got to, kept in this browser)
    let best = { round: 0, kills: 0 };
    try { best = { ...best, ...JSON.parse(load('deadair.best') || '{}') }; } catch {}
    const better = game.round > best.round || (game.round === best.round && game.kills > best.kills);
    if (better) { best = { round: game.round, kills: game.kills }; store('deadair.best', JSON.stringify(best)); }
    const record = better && game.round > 1 ? '  ·  YOUR BEST YET' : `  ·  best: round ${best.round}`;
    if (!game.won && !game.epitaph) game.epitaph = EPITAPHS[Math.floor(Math.random() * EPITAPHS.length)];
    const line = (extra = '') => `${game.won ? 'Kirky: "Next time, we take the stairs."  ·  ' : `${game.epitaph}  ·  `}Round ${game.round}  ·  ${game.kills} killed  ·  ${game.headshots} through the head  ·  ${game.points.toLocaleString()} points  ·  ${logs.count} of ${logs.LOGS.length} logs${logs.all ? `  ·  ${logs.CREW.join(' · ')}` : ''}${record}${extra}${guest ? '  ·  the host decides whether you go again' : ''}`;
    const pick = (act) => { if (act === 'again') { reset(); tell({ da: 'again' }); mode.lock(); } else if (game.won && onOut) mode.out(); else mode.leave(); };
    const title = (game.won ? 'YOU GOT OUT' : 'YOU DIED') + (game.hard ? '  ·  NIGHTMARE' : '');
    const crew = Object.values(game.tally).sort((a, b) => b.kills - a.kills);
    hud.card(title, line(), pick, guest ? ['leave'] : ['again', 'leave'], null, '', crew);
    const leaveBtn = document.querySelector('#deadair .da-card button[data-act=leave]'); if (leaveBtn) leaveBtn.textContent = game.won && onOut ? 'To the surface' : 'Leave';
    // (and onto the board, under your name, if you have one: only on the published site, where the board is)
    const name = getName();
    if (name && game.round > 0) {
      fetch('/api/leaderboard', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ board: 'deadair', name, score: game.round * 100000 + Math.min(99999, game.kills) + (game.won ? 50000000 : 0) + (game.hard ? 20000000 : 0), wave: game.round, time: 0, won: !!game.won }) })
        .then((r) => r.json()).then((d) => { if (d && Array.isArray(d.top) && game.over) hud.card(title, line(d.rank ? `  ·  #${d.rank} on the board` : ''), pick, guest ? ['leave'] : ['again', 'leave'], d.top, name, crew); }).catch(() => {});
    }
  }

  // ---- The network ----
  // Each frame: what you are doing, to the others (a guest, to the host: twelve times a second); and the host, the
  // whole game as it stands (ten times a second): the round, the dead, everybody, the doors.
  function runNet(dt) {
    if (!coop()) {
      if (others.map.size) others.clear();
      if (dead.remote) { dead.remote = false; game.left = Math.max(game.left, dead.alive); game.spawned = ROUND.count(game.round); }   // (the host has gone: the dead are yours now)
      return;
    }
    // (the host has gone: carry on, on your own, with what was there)
    if (dead.remote && party.hosting) { dead.remote = false; game.left = dead.alive; game.spawned = ROUND.count(game.round); }
    for (const h of dead.outbox) say({ da: 'hit', ...h });
    dead.outbox.length = 0;
    for (const c of coins.picked) say({ da: 'took', c });
    sendClock += dt; snapClock += dt;
    if (!party.hosting && sendClock >= 1 / 12) {
      sendClock = 0;
      say({ da: 'me', s: myState(), name: getName() || 'Kirky', look: myLook(), gun: arms.slot?.id });
    }
    if (party.hosting && snapClock >= 0.1) {
      snapClock = 0;
      const p = [[myId(), myState(), getName() || 'Kirky', myLook(), arms.slot?.id], ...[...others.map.values()].map((o) => [o.id, o.s, o.name, o.lookRaw, o.gun])];
      tell({ da: 'snap', r: game.round, z: dead.snapshot(), p, doors: station.doors.map((d) => (d.open ? 1 : 0)), dk: game.dark ? 1 : 0, nt: game.night, hd: game.picked ? (game.hard ? 1 : 0) : -1, st: [game.story.step, Math.round(game.story.k * 1000) / 1000, game.story.until, game.story.busy] });
    }
    // Everybody down? (the host decides)
    if (party.hosting && !game.over && game.round > 0 && everyone().every((p) => !p.alive)) gameOver();
  }

  // What has come from the others. from: who sent it (a guest's id; 'host' for a guest).
  function onNet(from, m) {
    if (!active || !station || !m) return;
    const host = coop() && party.hosting;
    const dir = (x, z) => new THREE.Vector3(+x || 0, 0, +z || 0);
    switch (m.da) {
      case 'me': if (host) others.hear(from, cleanState(m.s), String(m.name || 'Friend').slice(0, 16), m.look && typeof m.look === 'object' ? m.look : null, GUNS[m.gun] ? m.gun : 'pistol'); break;
      case 'hit': if (host) { const z = dead.byId(m.id); if (z && z.hp > 0 && z.state !== 'dead') { const d = dir(m.dx, m.dz); if (dead.hurt(z, Math.min(3000, Math.max(0, +m.dmg || 0)), m.part, d)) onKill(z, m.part, from, d); } } break;
      case 'door': openDoor(+m.i); break;
      case 'lounge': game.loungeOpen = true; if (host) tell(m); break;
      case 'log': if (m.day >= 1 && m.day <= 9) tookLog(+m.day, false); if (host) tell(m); break;
      case 'woke': if (!game.woke) { game.woke = true; if (host) tell(m); } break;
      case 'riseAll': if (!host) cutScare({ kind: 'riseAll' }); break;
      case 'qte': onQte(from, m, host); break;
      case 'carry': { if (host) tell(m); const by = m.by === myId() ? 'me' : m.by; if (m.who === myId()) me.carriedBy = m.by ? by : null; else others.carried(m.who, m.by ? by : null); break; }
      case 'story': if (!host) story.apply(m.s); break;
      case 'begin': if (host) story.begin(String(m.what || '')); break;
      case 'began': if (!host && m.what === 'signal') { story.speak('signalOn'); story.tip('signal'); } break;
      case 'won': if (!host) onWin(); break;
      case 'diff': if (!host) { if (m.nt && nightOf(m.nt) && m.nt !== game.night) { game.night = m.nt; applyNight(); } setDifficulty(!!+m.h); } break;
      case 'mic': if (!host && lounge.inside) lounge.show(); break;
      case 'took': coins.take(m.c); if (host) tell(m); break;
      case 'revive': if (host) tell(m); if (m.by && m.by !== myId()) tallyOf(m.by).revives++; if (m.who === myId() && me.downed && !me.out) getUp(); break;
      case 'snap': if (!host) applySnap(m); break;
      case 'kill': if (!host) { const z = dead.byId(m.id); if (z) dead.kill(z, m.part, dir(m.dx, m.dz)); onKill(z, m.part, m.by, dir(m.dx, m.dz)); } break;
      case 'claw': if (!host && m.to === myId()) clawed(+m.dmg || 0, dead.byId(m.z)); break;
      case 'grab': if (!host && m.to === myId()) startGrab(+m.z, dead.byId(+m.z)); break;
      case 'bite': if (!host && m.to === myId()) { endGrab(false); walker.bitT = 0; const z = dead.byId(+m.z); clawed(+m.dmg || 0, z); walker.recoil(6); walker.shake = 0.14; hud.whiteout(0.3); if (z) sound.meat(z.head, true); } break;
      case 'shove': if (host) { const z = dead.byId(+m.z); if (z && z.state === 'grab' && z.victimId === from) z.hold = Math.max(z.hold || 0, Math.min(1, +m.k || 0)); } break;
      case 'free': if (host) { const z = dead.byId(+m.z); if (z && z.state === 'grab' && z.victimId === from) dead.free(z, true); } break;
      case 'coin': if (!host) coins.drop(new THREE.Vector3(+m.x, 0, +m.z), +m.v || 0, Math.min(3, +m.n || 1), +m.id); break;
      case 'over': if (!host) gameOver(); break;
      case 'scare': if (m.k === 'blackout') { if (!host) scares.blackout(); } else { if (host) tell(m); scares.mirror(m.k, m, me); } break;
      case 'pa': if (!host) story.pa(+m.i); break;
      case 'warden': if (!host) wardenCut = { id: m.id, t: 0 }; break;
      case 'pk': if (!host && PICKUPS[m.k]) pickups.drop(m.k, new THREE.Vector3(+m.x, 0, +m.z), +m.id); break;
      case 'pick': if (host) { const p = pickups.list.find((o) => o.id === +m.id); if (p) tookPickup(p); } break;
      case 'pkfx': if (!host) { pickups.take(+m.id); pickupEffect(m.k); } break;
      case 'again': if (!host) { reset(); hud.hint('Click to carry on'); } break;
    }
  }
  // A guest: the game as the host has it.
  function applySnap(m) {
    if (Array.isArray(m.z)) dead.apply(m.z);
    story.apply(m.st);
    if (m.hd !== undefined && +m.hd >= 0 && !game.picked) setDifficulty(!!+m.hd);
    if (m.nt && nightOf(m.nt) && m.nt !== game.night) { game.night = m.nt; applyNight(); }
    if (m.dk !== undefined && !!m.dk !== game.dark) { game.dark = !!m.dk; if (game.dark) hud.banner('LIGHTS OUT', 0xff5040); }
    if (Number.isFinite(m.r) && m.r !== game.round) {
      const up = m.r > game.round;
      game.round = m.r;
      hud.round(m.r, up);
      if (up && m.r > 0) { sound.roundStart(m.r); if (me.downed || me.out) getUp(1); }
    }
    const here = new Set();
    for (const [id, s, name, look, gun] of Array.isArray(m.p) ? m.p : []) {
      if (id === myId()) continue;
      here.add(id);
      others.hear(id, cleanState(s), String(name || 'Friend').slice(0, 16), look && typeof look === 'object' ? look : null, GUNS[gun] ? gun : 'pistol');
    }
    for (const id of [...others.map.keys()]) if (!here.has(id)) others.remove(id);
    (m.doors || []).forEach((o, i) => { if (o) openDoor(i); });
  }
  // A guest: their voices (the host's events are its own: here they groan and scream on a clock of their own).
  function voices(dt) {
    for (const z of dead.list) {
      if (z.state === 'dead') continue;
      z.groan -= dt;
      if (z.groan < 0) { z.groan = (z.state === 'chase' ? 1.8 : 4) + Math.random() * 4; if (!me.safe) sound.voice(z, z.state === 'feed' ? 'feed' : 'groan'); }
      // (close, and somewhere you are not looking: its breath, right behind you)
      if (!me.safe && z.hp > 0 && z.state !== 'feed') {
        const dx = z.pos.x - me.pos.x, dz = z.pos.z - me.pos.z, d = Math.hypot(dx, dz);
        if (d < 6 && (dx * walker.lookDir.x + dz * walker.lookDir.z) / (d || 1) < 0.2) { z.breath = (z.breath ?? 0) - dt; if (z.breath <= 0) { z.breath = 1.1 + Math.random() * 1.1; sound.behind(z); } }
      }
      if (z.state === 'scream' && !z.screamed) { z.screamed = true; if (!me.safe) sound.voice(z, 'scream'); }
    }
  }

  const FAR = new THREE.Vector3(1e5, 0, 1e5);
  const NO_DIR = new THREE.Vector3();   // (a friend's eye counts for being seen; only yours for the Watcher)   // (somewhere no coin will ever fly to)
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  let input0 = { trickPressed: false };

  // ---- THE RELOAD SKIT: one reload in ten, the fresh magazine slips out of his hand. One of them walks over, picks it up,
  // brings it, holds it out. He takes it. "...Thanks." It stands there a second. Then it is what it was.
  let skit = null, fumbleNext = false;
  function magMesh() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.105, 0.04), new THREE.MeshStandardMaterial({ color: 0x2a2c30, metalness: 0.8, roughness: 0.35 })); body.castShadow = true; g.add(body);
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.012, 0.03), new THREE.MeshStandardMaterial({ color: 0xc8a046, metalness: 0.85, roughness: 0.3 })); top.position.y = 0.058; g.add(top);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.008, 0.046), new THREE.MeshStandardMaterial({ color: 0x1a1b1e, roughness: 0.6 })); plate.position.y = -0.056; g.add(plate);
    return g;
  }
  function maybeFumble() {
    const rl = arms.rl;
    if (skit || !rl || rl.kind !== 'mag' || rl.hold || cutIn || grab || game.over || me.downed || me.safe || walker.crawl || holdQ || decomp || strap) return;
    if (!(fumbleNext || testing?.fumble || Math.random() < 0.1)) return;
    const eye = walker.camera.position;
    const z = dead.list.filter((z) => z.hp > 0 && (z.state === 'chase' || z.state === 'attack' || z.state === 'stand') && z.kind !== 'warden' && !z.K.stalk && !z.watch && z.pos.distanceTo(me.pos) > 1.6 && z.pos.distanceTo(me.pos) < 14 && station.see(eye, z.head)).sort((a, b) => a.pos.distanceTo(me.pos) - b.pos.distanceTo(me.pos))[0];
    if (!z) return;
    fumbleNext = false;
    startSkit(z, rl);
  }
  function startSkit(z, rl) {
    rl.hold = true;
    const hand = walker.model?.gun?.group ? walker.model.gun.group.getWorldPosition(new THREE.Vector3()) : me.pos.clone().setY(1.0);
    const f = fwd(), sd = sideOf(f);
    const mag = magMesh(); mag.position.copy(hand); mag.rotation.set(0.3, Math.random() * 6, 0.2); scene.add(mag);
    const floor = walker.y;
    const land = me.pos.clone().addScaledVector(f, 0.55).addScaledVector(sd, 0.25 + Math.random() * 0.2).setY(floor + 0.045);
    const toZ = z.pos.clone().sub(land).setY(0); const dz = toZ.length() || 1; toZ.multiplyScalar(1 / dz);
    const pickAt = land.clone().addScaledVector(toZ, 0.42).setY(0);
    const stand = me.pos.clone().addScaledVector(toZ, 1.15).setY(0);
    const tFetch = Math.min(2.4, Math.max(0.9, dz / 2.2 + 0.3)), tPick = 2.0, tBring = Math.min(2.2, Math.max(0.7, pickAt.distanceTo(stand) / 2.2 + 0.3)), tGive = 1.5;
    const light = new THREE.PointLight(0xffd9a0, 1.8, 3.6, 1.8); light.position.copy(hand); scene.add(light);   // (the moment, lit, whatever the room is doing)
    skit = { z, rl, mag, land, pickAt, stand, phase: 'drop', t: 0, pt: 0, vy: 0.4, landed: false, held: false, taking: -1, tFetch, tPick, tBring, tGive, floor, light };
    z.skitting = true;
    const here = () => me.pos.clone().setY(1.3);
    const zh = () => (z.head ? z.head.clone() : z.pos.clone().setY(1.5));
    const mid = () => here().lerp(zh(), 0.5);
    playCut([
      { for: 0.8, cam: (s) => ({ cam: land.clone().addScaledVector(f, 1.1).addScaledVector(sd, 0.5).setY(floor + 0.32 + 0.1 * s), at: mag.position.clone(), from: here(), fov: 42, lines: s < 0.25 ? 1 : 0, flash: s < 0.06 ? 0.5 : 0, say: s > 0.35 ? ['Kirky', '...Oh, come on.'] : null }) },
      { for: tFetch, cam: (s) => ({ cam: here().addScaledVector(toZ, -1.5).addScaledVector(sd, 0.9).setY(2.05), at: zh().setY(1.1), from: here().setY(1.6), fov: 46, lines: s < 0.15 ? 1 : 0 }) },
      { for: tPick, cam: (s) => ({ cam: land.clone().addScaledVector(sd, 2.3).addScaledVector(toZ, 0.2).setY(1.05 - 0.25 * s), at: land.clone().addScaledVector(toZ, 0.25).setY(0.6 + 0.25 * s), from: land.clone().setY(0.6), fov: 40, lines: s < 0.2 ? 1 : 0, flash: s < 0.05 ? 0.4 : 0 }) },
      { for: tBring, cam: (s) => ({ cam: mid().addScaledVector(sd, 3.2 - 0.4 * s).setY(1.45), at: mid().setY(1.2), from: here(), fov: 44, lines: s < 0.15 ? 1 : 0 }) },
      { for: tGive, cam: (s) => ({ cam: zh().addScaledVector(toZ, 0.7).addScaledVector(sd, -0.6).setY(1.75), at: here().setY(1.25), from: zh(), fov: 40 - 4 * s, lines: s < 0.2 ? 1 : 0, flash: s < 0.05 ? 0.5 : 0, say: s > 0.45 ? ['Kirky', '...Thanks.'] : null, title: s > 0.2 ? 'COURTESY' : null, sub: s > 0.2 ? 'one in ten reloads  ·  do not ask' : null, kk: Math.min(1, s * 3) }) },
    ]);
  }
  function endSkit(ok) {
    const s = skit; if (!s) return;
    skit = null;
    if (s.rl.hold) s.rl.resume();
    scene.remove(s.mag); if (s.light) scene.remove(s.light);
    const z = s.z; z.skitting = false; z.holdsThing = false; z.skit = null;
    if (z.hp > 0 && z.state === 'skit') { z.state = 'stand'; z.standFor = ok ? 1.4 : 0.1; z.t = 0; z.watch = false; }
    if (ok) { addPoints(50); hud.tip('It gave it back. ...Do not ask.'); }
  }
  function runSkit(dt) {
    const s = skit; if (!s) return;
    const z = s.z;
    if (z.hp <= 0 || (s.phase !== 'drop' && z.state !== 'skit') || game.over || me.downed || grab || me.safe) { endSkit(false); return; }
    s.t += dt; s.pt += dt;
    walker.held = Math.max(walker.held, 0.3);   // (he stands there: you do not walk off without it)
    if (s.phase === 'drop') {
      if (!s.landed) {
        s.vy -= 9.8 * dt;
        s.mag.position.y += s.vy * dt;
        s.mag.position.lerp(new THREE.Vector3(s.land.x, s.mag.position.y, s.land.z), Math.min(1, dt * 6));
        s.mag.rotation.x += dt * 9; s.mag.rotation.z += dt * 4;
        if (s.mag.position.y <= s.land.y) { s.mag.position.copy(s.land); s.mag.rotation.set(Math.PI / 2, 0, 0.5 + Math.random()); s.landed = true; sound.clatter('mag', s.land, 1); }
      }
      if (s.pt >= 0.8) { s.phase = 'fetch'; s.pt = 0; z.state = 'skit'; z.t = 0; z.swing = 0; z.vel.set(0, 0, 0); z.skit = { to: s.pickAt, speed: 2.3, face: me.pos, t: 0 }; }
    } else if (s.phase === 'fetch') {
      if (s.pt >= s.tFetch) { s.phase = 'pick'; s.pt = 0; z.skit = { clip: 'pickup', rate: 1.7, face: s.land, t: 0 }; z.holdsThing = true; }   // (his Unarmed Grab Torch From Floor clip: down, the hand on it, up)
    } else if (s.phase === 'pick') {
      if (s.pt >= 0.9) s.held = true;
      if (s.pt >= s.tPick) { s.phase = 'bring'; s.pt = 0; z.skit = { to: s.stand, speed: 2.3, face: me.pos, t: 0 }; }
    } else if (s.phase === 'bring') {
      if (s.pt >= s.tBring) { s.phase = 'give'; s.pt = 0; z.skit = { clip: 'throw', rate: 1, freeze: 0.6, face: me.pos, t: 0 }; sound.moan?.(z.pos.clone().setY(1.4)); }
    } else if (s.phase === 'give') {
      if (s.pt >= 0.7 && s.taking < 0) { s.taking = 0; s.from = s.mag.position.clone(); }
      if (s.taking >= 0 && s.taking < 1) {
        s.taking = Math.min(1, s.taking + dt / 0.35);
        const hand = walker.model?.gun?.group ? walker.model.gun.group.getWorldPosition(new THREE.Vector3()) : me.pos.clone().setY(1.0);
        s.mag.position.lerpVectors(s.from, hand, s.taking);
        if (s.taking >= 1) { s.held = false; s.mag.visible = false; if (s.rl.hold) s.rl.resume(); }
      }
      if (s.pt >= s.tGive) { endSkit(true); return; }
    }
    if (s.light) s.light.position.copy(s.mag.visible ? s.mag.position : me.pos).y += 0.4;
    if (s.held && s.taking < 0) {   // (in its hand, on the way)
      const h = z.handR || z.pos.clone().setY(0.9).add(new THREE.Vector3(Math.sin(z.yaw), 0, Math.cos(z.yaw)).multiplyScalar(0.35));
      s.mag.position.copy(h); s.mag.rotation.set(0.4, z.yaw, 0.3);
    }
  }

  // ---- THE DUD: the boof backfires. Six seconds of coughing; the dead nearest stop and watch; one of them pats his back.
  function startDud() {
    walker.model.applyLook(walker.look);
    game.boof = Math.round(RULES.golden.kills * 0.5);
    hud.banner('DUD', 0xff5040); hud.tip('One boof in ten is a dud. Half the charge back. ...Shoot something.');
    const f = fwd(), sd = sideOf(f), here = me.pos.clone().setY(1.3);
    const near = dead.list.filter((z) => z.hp > 0 && (z.state === 'chase' || z.state === 'attack' || z.state === 'stand') && z.kind !== 'warden' && !z.K.stalk && !z.watch && z.pos.distanceTo(me.pos) > 1.2 && z.pos.distanceTo(me.pos) < 13).sort((a, b) => a.pos.distanceTo(me.pos) - b.pos.distanceTo(me.pos)).slice(0, 3);
    const spots = [me.pos.clone().addScaledVector(f, -1.25), me.pos.clone().addScaledVector(sd, 1.5).addScaledVector(f, 0.3), me.pos.clone().addScaledVector(sd, -1.5).addScaledVector(f, 0.3)];
    near.forEach((z, i) => { z.state = 'skit'; z.t = 0; z.swing = 0; z.vel.set(0, 0, 0); z.skit = { to: spots[i].setY(0), speed: 1.6, face: me.pos, t: 0 }; });
    dud = { t: 0, z: near, patter: near[0] || null, patted: false };
    const pat = () => (dud?.patter ? dud.patter.pos.clone() : here.clone().addScaledVector(f, -1.25)).setY(1.3);
    const face = () => me.pos.clone().setY(1.45);
    playCut([
      // his face, front: the drag that goes wrong
      { for: 1.6, cam: (s) => ({ cam: face().addScaledVector(f, 1.25).addScaledVector(sd, 0.3).setY(1.4), at: face(), from: face(), fov: 36, lines: s < 0.2 ? 1 : 0, flash: s < 0.05 ? 0.4 : 0, title: s > 0.1 ? 'DUD' : null, sub: s > 0.1 ? 'one boof in ten' : null, kk: Math.min(1, s * 4) }) },
      // wide, from behind and above him: the dead walking up, and stopping, to watch
      { for: 2.4, cam: (s) => ({ cam: here.clone().addScaledVector(f, -2.8).addScaledVector(sd, 1.6).setY(2.5), at: here.clone().addScaledVector(f, 1.0).setY(1.1), from: here, fov: 50, lines: s < 0.15 ? 1 : 0 }) },
      // the pat, in profile: him doubled over, the hand on his back
      { for: 1.6, cam: () => ({ cam: here.clone().addScaledVector(sd, 2.6).addScaledVector(f, -0.3).setY(1.3), at: here.clone().lerp(pat(), 0.4).setY(1.15), from: here, fov: 40, lines: 0.4, flash: dud && dud.patted ? 0.25 : 0 }) },
      // his face again: the line
      { for: 1.4, cam: (s) => ({ cam: face().addScaledVector(f, 1.2).addScaledVector(sd, -0.3).setY(1.42), at: face(), from: face(), fov: 36, lines: 0, say: s > 0.15 ? ['Kirky', "...I'm fine. Shoot something."] : null }) },
    ], () => endDud());
  }
  function endDud() {
    const d = dud; if (!d) return;
    dud = null;
    for (const z of d.z) if (z.hp > 0 && z.state === 'skit') { z.state = 'stand'; z.standFor = 0.9; z.t = 0; z.watch = false; z.skit = null; }
  }
  function runDud(dt) {
    const d = dud; if (!d) return;
    if (game.over || me.downed || grab || me.safe) { endDud(); return; }
    d.t += dt;
    walker.held = Math.max(walker.held, 0.3);
    if (Math.random() < dt * 2.2) walker.model.exhale?.(0.3, 0.5);
    if (d.t >= 4.2 && !d.patted && d.patter && d.patter.hp > 0 && d.patter.state === 'skit') { d.patted = true; d.patter.skit = { clip: 'throw', rate: 0.7, freeze: 0.55, face: me.pos, t: 0 }; sound.thud(me.pos.clone().setY(1.2)); }
  }

  // ---- THE CONGA: dance (T) six seconds with the dead about, and the nearest five line up behind you, on the beat, until
  // something breaks it: a shot, a swing, a claw from one not in the line, the lounge, half a minute.
  let conga = null, danceT = 0, congaBroken = false, congaArm = 0;   // (congaArm: the editor's stage: the next dance counts as six seconds in)
  const trail = [], lastTrail = new THREE.Vector3();
  function trailPoint(back) {
    let left = back;
    for (let i = 0; i < trail.length - 1; i++) { const a = trail[i], b = trail[i + 1], seg = a.distanceTo(b); if (seg >= left) return a.clone().lerp(b, seg > 1e-6 ? left / seg : 0); left -= seg; }
    const last = trail[trail.length - 1] || me.pos, f = fwd();
    return last.clone().addScaledVector(f, -Math.max(0, left));
  }
  function startConga(picks) {
    picks.forEach((z) => { z.state = 'skit'; z.t = 0; z.swing = 0; z.vel.set(0, 0, 0); z.skit = { to: me.pos.clone().setY(0), speed: 2.0, face: me.pos, t: 0 }; z.hop = 0; });
    conga = { t: 0, z: picks };
    trail.length = 0; trail.push(me.pos.clone()); lastTrail.copy(me.pos); congaBroken = false;
    sound.crowd?.('cheer', me.pos.clone().setY(1.4)); sound.sting(0.3);
    hud.banner('CONGA', 0xffd27a); hud.tip('They are in a line behind you. Keep going: it holds until something breaks it.'); for (const z of picks) sound.moan?.('groan', z.pos.clone().setY(1.4), { level: 0.6, rate: 1.3 });
    const here = me.pos.clone().setY(1.3), f = fwd(), sd = sideOf(f);
    playCut([{ for: 2.8, cam: (s) => ({ cam: here.clone().addScaledVector(f, 2.9 - 0.5 * s).addScaledVector(sd, 0.7).setY(1.5), at: here.clone().setY(1.15), from: here, fov: 44, lines: s < 0.2 ? 1 : 0, flash: s < 0.05 ? 0.5 : 0, title: s > 0.1 ? 'CONGA' : null, sub: s > 0.1 ? 'until something breaks it' : null, say: s > 0.6 ? ['Kirky', '...Okay. Okay!'] : null, kk: Math.min(1, s * 4) }) }]);
  }
  function endConga(why = '') {
    const c = conga; if (!c) return;
    conga = null; danceT = 0;
    let n = 0;
    for (const z of c.z) { z.hop = 0; if (z.hp > 0 && z.state === 'skit') { n++; z.state = 'stand'; z.standFor = 0.6 + Math.random() * 0.8; z.t = 0; z.watch = false; z.skit = null; } }
    if (n) addPoints(25 * n);
    if (why) hud.tip(why);
  }
  function runConga(dt) {
    if (congaArm > 0 && walker.emote === 'dance') { danceT = Math.max(danceT, congaArm); congaArm = 0; }
    danceT = walker.emote === 'dance' && !conga ? danceT + dt : conga ? danceT : 0;
    if (!conga && danceT >= 2.5 && !cutIn && !grab && !me.safe && !me.downed && !game.over) {
      const picks = dead.list.filter((z) => z.hp > 0 && (z.state === 'chase' || z.state === 'attack' || z.state === 'stand') && z.kind !== 'warden' && !z.K.stalk && !z.watch && z.pos.distanceTo(me.pos) > 1.2 && z.pos.distanceTo(me.pos) < 13 && station.see(walker.camera.position, z.head)).sort((a, b) => a.pos.distanceTo(me.pos) - b.pos.distanceTo(me.pos)).slice(0, 5);
      if (picks.length >= 2) startConga(picks); else danceT = 3;
    }
    const c = conga; if (!c) return;
    c.t += dt;
    if (me.pos.distanceTo(lastTrail) > 0.3) { trail.unshift(me.pos.clone()); if (trail.length > 80) trail.length = 80; lastTrail.copy(me.pos); }
    c.z.forEach((z, i) => {
      if (!z.skit) return;
      z.skit.to = trailPoint(0.95 * (i + 1)).setY(0); z.skit.speed = 2.1; z.skit.face = i === 0 ? me.pos : c.z[i - 1].pos; z.skit.clip = 'rally'; z.skit.loop = true; z.skit.wgt = 0.6; z.skit.rate = 1.1;   // (arms up, rallying, over the walk)
      z.hop = c.t > 2.6 ? Math.max(0, Math.sin(c.t * 7.2 + i * 0.9) * 0.2 - 0.04) : 0;
    });
    if (congaBroken) endConga('...and that was the conga.');
    else if (c.t > 30 || me.safe || me.downed || grab || game.over || c.z.some((z) => z.hp <= 0 || z.state !== 'skit')) endConga(c.t > 30 ? 'The line broke up. They had a good time.' : '');
  }

  // ---- THE TROPHY: round ten, the PA: Mastre of the Month. A gold Kirky comes down out of the ceiling onto the nearest of
  // them, and stays. "...Great."
  let trophy = null, statue = null, trophyDone = false, trophyBox = null, goldMat = null;
  function trophyCall() {
    const secs = sound.mastre();
    hud.tip('The PA: Mastre of the Month. ...Collect your trophy.');
    setTimeout(() => { if (active && !game.over) trophyDrop(); }, Math.min(9000, secs * 1000 + 600));
  }
  function trophyDrop() {
    if (trophy) return;
    if (!statue) { statue = new SkaterModel(scene); statue.board.visible = false; statue.rider.position.y = 0; statue.root.visible = false; try { statue.applyLook({ ...walker.look, smoke: null }); } catch {} }
    goldMat ||= new THREE.MeshStandardMaterial({ color: 0xffc83c, metalness: 1, roughness: 0.22, emissive: 0x2a1a00 });
    gild();
    try { statue.play?.('idle', 1, 1, 0.4, false); } catch {}
    const f = fwd(), sd = sideOf(f), here = me.pos.clone().setY(1.3);
    const z = dead.list.filter((z) => z.hp > 0 && (z.state === 'chase' || z.state === 'attack' || z.state === 'stand') && z.pos.distanceTo(me.pos) > 2.2 && z.pos.distanceTo(me.pos) < 12 && station.see(walker.camera.position, z.head)).sort((a, b) => a.pos.distanceTo(me.pos) - b.pos.distanceTo(me.pos))[0] || null;
    const at = z ? z.pos.clone() : me.pos.clone().addScaledVector(f, 4.2);
    at.y = station.levelAt(at);
    const top = station.ceilAt(at) - 0.4;
    if (!statue.pedestal) { statue.pedestal = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.34, 0.9), new THREE.MeshStandardMaterial({ color: 0x3a2a10, metalness: 0.8, roughness: 0.35 })); scene.add(statue.pedestal); }
    statue.pedestal.visible = true;
    statue.root.visible = true;
    statue.root.rotation.y = Math.atan2(me.pos.x - at.x, me.pos.z - at.z);
    trophy = { t: 0, at, z, top, landed: false };
    const spot = () => at.clone();
    const statueAt = () => statue.root.position.clone();
    playCut([
      // over his shoulder, at the one it is for
      { for: 1.0, cam: (s) => ({ cam: here.clone().addScaledVector(f, -0.7).addScaledVector(sd, 0.55).setY(1.7), at: (z && z.head ? z.head.clone() : spot().setY(1.4)), from: here, fov: 46 - 6 * s, lines: s < 0.3 ? 1 : 0, flash: s < 0.06 ? 0.6 : 0, title: 'MASTRE OF THE MONTH', sub: 'congratulations  ·  please collect your trophy', kk: Math.min(1, s * 4) }) },
      // over his shoulder, wide: the gold coming down out of the ceiling ahead, onto it
      { for: 1.7, cam: (s) => ({ cam: here.clone().addScaledVector(f, -1.6).addScaledVector(sd, 1.9).setY(1.9), at: statueAt().setY(Math.max(1.0, statueAt().y + 0.9)), from: here, fov: 58, lines: 0.5, flash: trophy && trophy.landed && trophy.t < 1.62 ? 0.6 : 0 }) },   // (a flash as it lands, not for the whole shot)
      // where it landed, from in front, rising; and him
      { for: 1.8, cam: (s) => { const o = here.clone().sub(spot()).setY(0).normalize(); return { cam: spot().addScaledVector(o, 4.4).addScaledVector(sd, 1.2).setY(1.0 + 0.7 * s), at: spot().setY(1.25), from: spot().addScaledVector(o, 1.2).setY(1.2), fov: 44, lines: 0, say: s > 0.4 ? ['Kirky', '...Great.'] : null }; } },   // (from: outside the statue's own box, or the camera is pulled into the gold)
    ], () => { hud.banner('MASTRE OF THE MONTH', 0xffd27a); addPoints(500); });
  }
  // (gold, every part of him: his real body arrives after he is asked for, so it is gilded again as it comes)
  function gild() {
    const gunGroups = new Set([...Object.values(statue.guns || {}).map((g) => g.group), statue.gun?.group].filter(Boolean));
    const inGun = (o) => { for (let p = o; p && p !== statue.root; p = p.parent) if (gunGroups.has(p) || /^rig-|gun|rifle|pistol|shotgun|revolver|sniper/i.test(p.name || '')) return true; return false; };
    statue.root.traverse((o) => { if (!o.isMesh) return; if (inGun(o)) { o.visible = false; return; } if (o.material !== goldMat) { o.material = goldMat; o.castShadow = true; } });
    if (statue.ember) statue.ember.visible = false;
    for (const g of gunGroups) g.visible = false;
  }
  function runTrophy(dt) {
    const T = trophy; if (!T || !statue) return;
    T.t += dt;
    if (T.t < 8) gild();
    const fall = 1.55, k = Math.min(1, T.t / fall), y = T.at.y + (T.top - T.at.y) * (1 - k * k);
    statue.root.position.set(T.at.x, y + 0.34, T.at.z);
    statue.pedestal.position.set(T.at.x, y + 0.17, T.at.z);
    if (k >= 1 && !T.landed) {
      T.landed = true;
      sound.slam?.(T.at.clone().setY(0.5)); sound.thud(T.at.clone().setY(0.3)); sound.sting(0.6);
      if (T.z && T.z.hp > 0 && T.z.pos.distanceTo(T.at) < 1.3) { const killed = dead.hurt(T.z, 99999, 'head', new THREE.Vector3(0, -1, 0), 0); if (killed) onKill(T.z, 'head', myId()); }
      trophyBox = { x0: T.at.x - 0.45, x1: T.at.x + 0.45, z0: T.at.z - 0.45, z1: T.at.z + 0.45, top: 2.2 };
      station.boxes.push(trophyBox);
    }
  }
  function resetTrophy() {
    trophy = null; trophyDone = false;
    if (statue) { statue.root.visible = false; if (statue.pedestal) statue.pedestal.visible = false; }
    if (trophyBox) { const i = station.boxes.indexOf(trophyBox); if (i >= 0) station.boxes.splice(i, 1); trophyBox = null; }
  }

  // ---- THE RUBBER CHICKEN: under a bunk in the Crew Quarters. Taken, it goes on the end of his gun; F is a chicken from then on.
  let chicken = null, chickenHome = null, chickenTaken = false, chickenDirty = false, lastSqueak = -9;
  loadModel('chicken.glb').then((gltf) => {
    chicken = gltf.scene;
    chicken.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    chickenHome = new THREE.Vector3(BUNKS[0][0] + 0.35, 0.03, BUNKS[0][1] + 0.05);
    homeChicken();
  }, () => {});
  function homeChicken() {
    if (!chicken) return;
    chicken.removeFromParent();
    chicken.scale.setScalar(7.0); chicken.position.copy(chickenHome); chicken.rotation.set(0, 0.6, Math.PI / 2);
    scene.add(chicken);
  }
  function mountChicken() {
    if (!chicken || !chickenTaken) return;
    const held = walker.model?.gun; if (!held?.group) return;
    const ws = held.group.getWorldScale(new THREE.Vector3()).x || 1;
    chicken.removeFromParent();
    held.group.add(chicken);
    chicken.scale.setScalar(9.0 / ws);
    chicken.position.copy(held.muzzle || new THREE.Vector3(0, 0, 0.2)); chicken.position.y += 0.02 / ws;
    chicken.rotation.set(Math.PI / 2, 0, 0);
    walker.setGun(walker.gun.id);
  }
  function takeChicken() {
    if (chickenTaken || !chicken) return;
    chickenTaken = true; arms.chicken = true;
    sound.squeak(chickenHome.clone().setY(0.4)); sound.sting(0.3);
    hud.banner('CHICKEN BAYONET', 0xffd27a); hud.tip('F: the chicken. It squeaks. They hate it.');
    const at = chickenHome.clone().setY(0.14), here = me.pos.clone().setY(1.3), f = fwd(), sd = sideOf(f);
    const out = me.pos.clone().sub(chickenHome).setY(0); const d = out.length() || 1; out.multiplyScalar(1 / d);   // (from under the bunk, out toward him)
    const light = new THREE.PointLight(0xffe2b0, 2.2, 3.0, 1.8); light.position.copy(chickenHome).add(out.clone().multiplyScalar(0.5)).setY(0.5); scene.add(light);
    playCut([
      { for: 1.3, cam: (s) => ({ cam: chickenHome.clone().addScaledVector(out, 1.5 - 0.3 * s).setY(0.2), at: at.clone(), from: at.clone().addScaledVector(out, 0.9), fov: 34, lines: s < 0.25 ? 1 : 0, flash: s < 0.06 ? 0.5 : 0, title: s > 0.1 ? 'A RUBBER CHICKEN' : null, sub: s > 0.1 ? 'under the bunk  ·  it squeaks' : null, kk: Math.min(1, s * 4) }) },
      { for: 1.2, cam: (s) => ({ cam: here.clone().addScaledVector(f, 0.95).addScaledVector(sd, 0.3).setY(1.05 + 0.1 * s), at: here.clone().setY(1.45), from: here, fov: 38, lines: s < 0.2 ? 1 : 0, say: s > 0.2 ? ['Kirky', '...Sure. Why not.'] : null }) },
    ], () => { scene.remove(light); mountChicken(); });
    addPoints(100);
  }
  function runChicken(dt) {
    if (chickenDirty) { chickenDirty = false; mountChicken(); }
    if (!chicken || chickenTaken || !chickenHome) return;
    if (me.pos.distanceTo(chickenHome) < 2.4 && time - lastSqueak > 4.5) { lastSqueak = time; sound.squeak(chickenHome.clone().setY(0.3)); }
  }

  // A magazine out: dropped from whichever gun you can see (the one in front of you, or his), into the world, where it
  // falls, clatters on the plates and lies there a while.
  function throwMag() {
    const r = walker.rigNow;
    if (!r?.mag) return;
    const v = new THREE.Vector3((Math.random() - 0.5) * 0.5, -0.4, (Math.random() - 0.5) * 0.5).addScaledVector(walker.vel, 0.8);
    drops.throw(r.mag, v, new THREE.Vector3(Math.random() * 6 - 3, Math.random() * 3 - 1.5, Math.random() * 6 - 3), walker.view.visible ? 'viewMag' : 'mag');
  }
  // The revolver opened: its six cases tip out of the back of the cylinder.
  function dumpCases() {
    const r = walker.rigNow, gun = walker.gunNow;
    if (!r?.breech || !gun) return;
    gun.updateMatrixWorld(true);
    for (let i = 0; i < 6; i++) {
      const c = spentCase();
      gun.localToWorld(c.position.copy(r.breech).add(new THREE.Vector3((Math.random() - 0.5) * 0.02, (Math.random() - 0.5) * 0.02, -0.01)));
      c.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      c.updateMatrixWorld(true);
      drops.throw(c, new THREE.Vector3((Math.random() - 0.5) * 0.8, -0.2 - Math.random() * 0.6, (Math.random() - 0.5) * 0.8), new THREE.Vector3(Math.random() * 20 - 10, Math.random() * 20 - 10, Math.random() * 20 - 10), 'case', 6);
    }
  }

  // The dead, and what they do. While you are in the lounge, their swings land on the airlock door.
  function runDead(dt) {
    if (dead.remote) {   // (a guest: the host's, drawn; their steps are heard here too)
      events.length = 0;
      dead.follow(dt, events);
      for (const e of events) if (e.type === 'zstep' && !me.safe && e.z.pos.distanceTo(me.pos) < 16) sound.zstep(e.z.pos.clone().setY(0.1), e.z.kind !== 'walker');
      voices(dt);
      return;
    }
    events.length = 0;
    dead.looks = [{ eye: walker.camera.position, dir: walker.lookDir, id: 'me' }, ...(coop() ? others.list().map((o) => ({ eye: o.eye, dir: new THREE.Vector3(Math.sin(o.face || 0), 0, Math.cos(o.face || 0)), id: o.id })) : [])];   // (where every one of you is looking from)
    dead.update(game.cut >= 0 && !coop() ? dt * 0.2 : dt, everyone(), events);   // (slowed right down while the Golden Hour cut-in plays)
    for (const e of events) {
      if (e.type === 'groan') { if (!me.safe) sound.voice(e.z, e.z.state === 'feed' ? 'feed' : 'groan'); }
      else if (e.type === 'scream') { if (!me.safe) sound.voice(e.z, 'scream'); }
      else if (e.type === 'wake') { if (e.close < 5 && !me.safe) sound.sting(1); }
      else if (e.type === 'landed') sound.thud(e.z.pos.clone().setY(0.2));
      else if (e.type === 'zvault' || e.type === 'zclimb') sound.thud(e.z.pos.clone().setY(0.7));   // (hands slapped down on a crate)
      else if (e.type === 'watcher') { sound.sting(1.1); sound.voice(e.z, 'scream'); cutScare({ kind: 'watcher', z: e.z }); }
      else if (e.type === 'stalkSeen') { sound.sting(0.7); cutScare({ kind: 'stalker', z: e.z }); }
      else if (e.type === 'call') {
        sound.sting(0.55); sound.voice(e.z, 'call'); story.tip('screamer');
        dead.heard(e.at.clone().setY(1.2));
        for (let i = 0; i < 2; i++) { const at = pickSpawn(); if (at) { dead.spawn('runner', at.x, at.z, at.yaw ?? 0, 'drop', hpOf(game.round)); game.left += 1; } }
      }
      else if (e.type === 'zstep') { if (!me.safe && e.z.pos.distanceTo(me.pos) < 16) sound.zstep(e.z.pos.clone().setY(0.1), e.z.kind !== 'walker'); }
      else if (e.type === 'lost') {   // (wandering far off for too long: it comes up out of the floor again, nearer)
        const at = pickSpawn(true);
        if (at) { e.z.pos.set(at.x, 0, at.z); e.z.vel.set(0, 0, 0); e.z.state = 'drop'; e.z.y = 1.45; e.z.vy = 0; e.z.yaw = at.yaw ?? e.z.yaw; e.z.t = 0; e.z.farFor = 0; }   // (back in through a hole in a wall, out of your sight)
      }
      else if (e.type === 'claw') {
        if (e.target === me) clawed(e.damage, e.z);
        else { tell({ da: 'claw', to: e.target.id, dmg: e.damage, z: e.z.id }); sound.voice(e.z, 'claw'); }
      }
      else if (e.type === 'grab') {
        if (e.target === me) startGrab(e.z.id, e.z);
        else { tell({ da: 'grab', to: e.target.id, z: e.z.id }); sound.voice(e.z, 'claw'); }
      }
      else if (e.type === 'bite') {
        if (e.target === me) { endGrab(false); walker.bitT = 0; clawed(e.damage, e.z); walker.recoil(6); walker.shake = 0.14; hud.whiteout(0.3); sound.meat(e.z.head, true); }
        else tell({ da: 'bite', to: e.target.id, dmg: e.damage, z: e.z.id });
      }
      else if (e.type === 'freed') { if (e.target === me) endGrab(false); sound.thud(e.z.pos.clone().setY(0.4)); }
    }
  }
  // Rounds: a break, then the next lot, a few at a time, from wherever you cannot see.
  let wokeAt = 0;
  function wake() {
    if (game.woke) return;
    game.woke = true;
    tell({ da: 'woke' });
    // (down the Spine, the first of them; every strip between you and it dies: the station is awake)
    const here = me.pos.clone().setY(1.3), f = fwd(), sd = sideOf(f), spine = V3(26, 1.3, 8), far = V3(40, 1.3, 8);
    sound.sting?.(0.9); sound.station?.();
    setTimeout(() => sound.faraway?.(), 400);
    playCut([
      { for: 2.0, cam: (s) => ({ cam: here.clone().addScaledVector(f, -2.2 + 0.8 * s).addScaledVector(sd, -0.8).setY(1.7), at: spine, from: here, fov: 50 - 6 * s, lines: s < 0.15 ? 1 : 0, flash: s < 0.05 ? 0.4 : 0, say: ['Kirky', '...Not easy.'] }) },
      { for: 2.8, cam: (s) => ({ cam: V3(22 + 2 * s, 1.5, 8.6), at: far, from: V3(23, 1.3, 8), fov: 44, lines: s < 0.2 ? 1 : 0, title: 'DEAD AIR', sub: 'Shackleton Station  ·  Deck C', kk: Math.min(1, s * 2.5) }) },
    ], () => { game.breakFor = Math.min(game.breakFor, 0.6); });
    scares.blackout?.();
  }
  // The duct: halfway along, something is coming the other way (the host puts it in); it reaches you, bites, and goes on
  // past you and out. The cut-ins: its eyes down the duct; its face at yours.
  function runDuct() {
    const c = walker.crawl;
    if (!c) return;
    if (!c.scared && c.k > 0.42 && (hosting() || !coop())) {
      c.scared = true;
      const z = dead.spawn('crawler', c.to.x, c.to.z, c.yaw + Math.PI, 'walk', hpOf(Math.max(1, game.round)) * 0.6);
      z.state = 'duct'; z.t = 0; z.duct = { from: c.to.clone(), to: c.from.clone(), axis: c.axis.clone().negate(), len: c.len, k: 0, speed: 0.75, yaw: c.yaw + Math.PI };
      c.z = z; game.left += 1;
      sound.sting(0.9); sound.clatter?.('mag', c.to.clone().setY(0.5), 0.8);
      const eye = walker.camera.position.clone(), ahead = c.axis.clone();
      playCut([{ for: 1.4, cam: (s) => ({ cam: eye.clone().addScaledVector(ahead, 0.2), at: eye.clone().addScaledVector(ahead, 3 - 1.2 * s).setY(0.45), from: eye, fov: 46 - 12 * s, lines: s > 0.3 ? 1 : 0, flash: s < 0.05 ? 0.3 : 0, say: ['Kirky', 'Something is in here with me.'] }) }]);
    }
    const z = c.z;
    if (z && z.state === 'duct' && !c.bitten) {
      const mine = c.k, its = 1 - z.duct.k;   // (both as a share of the way from the Spine end)
      if (its <= mine + 0.06) {
        c.bitten = true;
        clawed(25, z);
        const eye = walker.camera.position.clone(), ahead = c.axis.clone();
        playCut([{ for: 0.9, cam: (s) => ({ cam: eye.clone().addScaledVector(ahead, -0.15), at: eye.clone().addScaledVector(ahead, 0.5).setY(0.4), from: eye, fov: 40, lines: 1, flash: s < 0.1 ? 0.9 : 0, say: ['Kirky', 'OFF— it is going over— it is going over me—'] }) }]);
        sound.meat(z.head, true);
      }
    }
  }
  function runRounds(dt) {
    if (game.over || dead.remote || testing?.calm) return;   // (a guest: the host keeps the rounds; calm: a test wants the station to itself)
    if (game.round === 0 && !game.woke) {   // (the bay is yours: nothing comes until you leave it, or have had long enough)
      if (intro < 0 && station.zoneAt(me.pos) !== 'b') wake();   // (the bay is yours for as long as you stay in it: nothing comes until you leave)
      return;
    }
    if (game.round === 0 || (game.left <= 0 && dead.alive - dead.list.filter((z) => z.state === 'feed' && z.hp > 0).length <= 0)) {
      if (game.breakFor <= 0 && game.round > 0) {
        game.breakFor = RULES.breakTime; sound.roundEnd(); scares.blackout(); tell({ da: 'scare', k: 'blackout' });
        if (Math.random() < 0.5) setTimeout(() => { if (active && !game.over) sound.deadAir(2.4, Math.random() < 0.6 ? 'scream' : 'bang'); }, 4200);
        const i = Math.floor(Math.random() * PA.length);
        setTimeout(() => { if (active && !game.over) { story.pa(i); tell({ da: 'pa', i }); } }, 2500);
      }
      game.breakFor -= dt;
      if (game.breakFor <= 0) startRound();
      return;
    }
    if (everyone().every((p) => p.safe || !p.alive)) return;   // (everybody in the lounge: nothing more comes until somebody is out)
    if (game.wardenDue > 0 && (game.wardenDue -= dt) <= 0) spawnWarden();
    if (watcherDue > 0 && (watcherDue -= dt) <= 0) spawnWatcher();
    game.spawnIn -= dt;
    const fighting = dead.list.filter((z) => z.hp > 0 && z.state !== 'feed').length;
    const want = Math.round(ROUND.count(game.round) * (N().count || 1) * (1 + RULES.party.more * ((game.party || 1) - 1)) * (game.hard ? 1.35 : 1));
    if (game.spawnIn <= 0 && game.spawned < want && fighting < ROUND.most(game.round) + (N().more || 0)) {
      const at = pickSpawn();
      if (at) {
        const kind = kindBy(N()) || ROUND.kind(game.round);
        dead.spawn(kind, at.x, at.z, at.yaw ?? 0, 'drop', hpOf(game.round) * (1 + RULES.party.tougher * ((game.party || 1) - 1)) * (kind === 'crawler' ? 0.6 : 1));
        if (!me.safe && at.distanceTo(me.pos) < 22) sound.thud(at.clone().setY(1.8));
        game.spawned++;
      }
      game.spawnIn = ROUND.every(game.round) * (N().every || 1) * (0.6 + Math.random() * 0.8);
    }
  }
  // The lights: the emergency reds pulse and stutter; the strips hold, blink or are dying.
  function runLights(dt) {
    crate.update(dt);
    const lit = station.isOpenZone('r') ? 1 : 0.15, c = core.userData;
    c.coreLight.intensity = (14 * lit + 2 * Math.sin(time * 7.3) * lit) * scares.dim * (game.power ? 1.8 : 1);
    c.glass.material.emissiveIntensity = (0.25 + 0.6 * lit) * (0.85 + 0.15 * Math.sin(time * 5.1));
    for (const red of reds) {
      const t = time + red.userData.phase, stutter = Math.sin(t * 13.7) > 0.93 ? 0.25 : 1;
      red.intensity = (9 + 6 * Math.sin(t * 1.3)) * stutter * scares.dim * (game.dark ? 0.3 : 1);
    }
    for (const s of strips) {
      const t = time + s.phase;
      let want = 0;
      if (s.on) {
        if (s.how === 'steady') want = Math.sin(t * 0.37) * Math.sin(t * 2.9) > 0.985 ? 0.1 : 1;
        else if (s.how === 'blink') want = (Math.sin(t * 0.8) + Math.sin(t * 5.3) * 0.4) > 1.15 ? 0 : 1;
        else if (s.how === 'dying') want = Math.sin(t * 0.23) > 0.55 ? (Math.random() < 0.5 ? 1 : 0.15) : Math.random() < 0.02 ? 0.7 : 0;
      }
      if (game.dark) want = 0;
      s.level += (want - s.level) * Math.min(1, dt * (want > s.level ? 40 : 18));
      s.glow.material.emissiveIntensity = 2.2 * s.level * scares.dim * (game.power ? 1.4 : 1);
    }
    const litStrips = strips.filter((s) => s.level > 0.01).map((s) => ({ s, d: s.at.distanceToSquared(camera.position) })).sort((a, b) => a.d - b.d);
    stripPool.forEach((l, i) => { const e = litStrips[i]; if (!e) { l.intensity = 0; return; } l.position.copy(e.s.at); l.intensity = 9 * e.s.level * scares.dim * (game.power ? 1.5 : 1); });
    if (uplinkLight) uplinkLight.intensity = game.story?.busy === 'signal' ? (Math.sin(time * 11) > 0 ? 14 : 1.5) * scares.dim : 0;
    if (watchLight) {
      const w = dead.list.find((z) => z.watch && z.hp > 0);
      watchLight.intensity = w ? 5 + 1.5 * Math.sin(time * 2.1) : 0;
      if (w) watchLight.position.copy(w.head).add(new THREE.Vector3(0, 0.5, 0));
    }
  }

  // The pause menu: up whenever the pointer is let go (Esc) once the game has had it. Nothing but its own Leave
  // button leaves the station. (With friends the station does not wait: the menu is only a menu.)
  let paused = false, everLocked = false;
  function setPaused(on) {
    if (paused === on) return;
    paused = on;
    hud.pause(on, {
      settings: document.getElementById('audio-controls'),
      onResume: () => { unlockAudio(); sound?.open(true); mode.lock(); },
      onControls: () => hud.help(true),
      onLeave: () => { setPaused(false); mode.leave(); },
    });
    if (on) { syncAudioControls(); hud.hint(''); }
  }
  document.addEventListener('pointerlockchange', () => {
    if (!active) return;
    if (document.pointerLockElement === renderer.domElement) { everLocked = true; setPaused(false); }
    else if (everLocked && !lounge?.inside && !game.over && intro < 0 && !hud.picking && !testing) setPaused(true);
  });
  const mode = {
    get scene() { return lounge?.inside ? lounge.scene : scene; },
    get camera() { return lounge?.inside ? lounge.camera : camera; },
    get lounge() { return lounge; },
    get coins() { return coins; },
    get active() { return active; },
    get station() { return station; },
    get walker() { return walker; },
    get dead() { return dead; },
    get arms() { return arms; },
    get sound() { return sound; },
    get game() { return game; },
    get others() { return others; },
    get scares() { return scares; },
    get skit() { return skit; },
    get drill() { return drill ? { id: drill.step?.id, i: drill.i, k: +drill.k.toFixed(2) } : null; },
    get introT() { return intro; },
    cutObjective: (kind, i) => cutObjective(kind, i),
    get lift() { return lift; },
    get exiting() { return exiting; },
    get cutIn() { return cutIn ? { t: +cutIn.t.toFixed(2), total: +cutIn.total.toFixed(2), n: cutIn.shots.length } : null; },
    get dud() { return dud; },
    get conga() { return conga; },
    get trophy() { return trophy; },
    get chicken() { return { taken: chickenTaken, home: chickenHome, loaded: !!chicken }; },
    get pickups() { return pickups; },
    get me() { return me; },
    get folk() { return folk; },
    get story() { return story; },
    openDoor: (i) => openDoor(i),
    watcher: () => spawnWatcher(),
    grabWho: (id) => { const p = everyone().find((o) => o.id === id); const z = dead.list.find((o) => o.hp > 0 && o.state !== 'dead' && o.state !== 'feed' && GRAB.kinds.includes(o.kind)); if (!p || !z) return null; dead.grab(z, p); if (p === me) startGrab(z.id, z); else tell({ da: 'grab', to: p.id, z: z.id }); return z.id; },
    chip: () => crate.rig('chip'),
    loungeShow: () => lounge.show(),
    goIn: () => goIn(),
    offer: () => useAt(),
    pickHard: (h) => setDifficulty(!!h),
    ask: () => { game.picked = false; testing = null; askDifficulty(); },
    get grabState() { return grab ? { hold: +grab.hold.toFixed(2), t: +(grab.t || 0).toFixed(2), z: grab.id } : null; },
    pause: (on = true) => setPaused(on),
    get logs() { return logs; },
    get night() { return N(); },
    setNight: (id) => { if (nightOf(id)) { game.night = id; applyNight(); } return game.night; },
    wake: () => wake(),
    hurt: (n = 999) => { grace = 0; clawed(n, null); },
    stage: (id) => runStage(id),
    get stages() { return STAGES.map(({ id, group, name, blurb }) => ({ id, group, name, blurb })); },
    grabMe: () => { const z = dead.list.find((o) => o.hp > 0 && o.state !== 'dead' && o.state !== 'feed' && GRAB.kinds.includes(o.kind)); if (!z) return null; dead.grab(z, me); startGrab(z.id, z); return z.id; },
    onNet: (from, m) => onNet(from, m),
    async enter() {
      entered = false;
      await (building ||= build());
      if (!warmed) { warmed = true; hud.loading('Warming the shaders', 0.9); await tick(); warmUp(); }
      hud.loading(null);
      others.clear();
      reset();
      active = true;
      time = 0;
      holdMusic(0);        // (no music in here: what you hear is the station)
      setSpace('hall');
      sound.open(true);
      hud.show(true);
      hud.hint('Click to begin');
      everLocked = false;
      onResize();
      warmScene();   // (the station's shaders, compiled now, behind the black: the first frames of the way in used to hitch on them)
      if (!seenIntro && !testing) { seenIntro = true; intro = 0; hud.hint(''); }
      else if (!game.picked) askDifficulty();   // (in again without the way in: the choice comes up at once)
      // (the lounge is built while the difficulty card is up: see askDifficulty)
      entered = true;
    },
    leave() {
      setPaused(false);
      active = false;
      hud.show(false);
      sound.open(false);
      holdMusic(null);
      document.exitPointerLock?.();
      onLeave?.();
    },
    // Out, the way you came: the lift up to the Moon (main.js plays the arrival at the surface).
    out() {
      setPaused(false);
      active = false;
      hud.show(false);
      sound.open(false);
      holdMusic(null);
      document.exitPointerLock?.();
      (onOut || onLeave)?.();
    },
    update(dt, input, mouse) {
      if (!active) return;
      dt = Math.min(dt, 0.05);
      input0 = input;
      time += dt;
      if (intro >= 0) {   // (the way in: everything holds while it plays; with friends the world goes on behind it)
        if (coop()) { refreshFolk(); runDead(dt); others.update(dt, walker.pos, walker.yaw); runNet(dt); } else dead.draw(0);
        lift?.update(dt);
        runIntro(dt);
        runLights(dt);
        sound.update(dt, camera, { danger: 0 });
        return;
      }
      // In the lounge: the casino has you; out here it all goes on without you (they come to the airlock, and wait).
      if (lounge.inside) {
        refreshFolk();
        runMic(dt);
        lounge.update(dt, input);
        runDead(dt);
        runRounds(dt);
        coins.update(dt, FAR);
        pickups.update(dt);
        others.update(dt, walker.pos, walker.yaw);
        runNet(dt);
        let waiting = 0;
        for (const z of dead.list) if (z.hp > 0 && z.state !== 'feed' && z.pos.distanceTo(me.pos) < 3.2) waiting++;
        hud.lounge(true, waiting ? `${waiting} of them at the airlock` : lounge.prompt);
        // (and you hear them: through the door, from where it is)
        doorNoise -= dt;
        if (waiting && doorNoise <= 0) { doorNoise = (1.4 + Math.random() * 2.4) / Math.min(3, waiting); sound.atDoor(station.lounge.at.clone().setY(1.3), waiting); }
        hud.round(game.round);
        runLights(dt);
        story.update(dt);
        sound.update(dt, camera, { danger: Math.min(1, waiting / 4), dark: game.dark, hard: game.hard });
        return;
      }
      refreshFolk();
      const locked = !!document.pointerLockElement;
      const playing = (locked || testing) && (game.picked || !!testing);
      const world = playing || coop() || game.over;   // (with friends, the station does not wait for you; nor does the end wait for your pointer)
      const fireNow = playing && (input.fireHeld || !!testing?.fire), aiming = playing && (input.aimHeld || !!testing?.aim) && !game.over;
      const keys = testing?.keys || { forward: input.down('KeyW'), back: input.down('KeyS'), left: input.down('KeyA'), right: input.down('KeyD'), sprint: input.down('ShiftLeft') || input.down('ShiftRight'), jump: input.down('Space') };
      const use = input.down('KeyE') || !!testing?.use, reloadKey = input.down('KeyR') || !!testing?.reload, swapKey = input.down('KeyQ') || input.down('Digit1') || input.down('Digit2'), gKey = input.down('KeyG') || !!testing?.g, meleeKey = input.down('KeyF') || !!testing?.melee, helpKey = input.down('KeyH') || input.down('Tab'), danceKey = input.down('KeyT') || !!testing?.dance;
      if (helpKey && !wasHelp) { hud.help(); drillEv.help = true; }
      const held = me.out || game.over || !!grab;   // (down but not out, you can still shoot from the floor: a last stand; held by one of them, you can do nothing but shove)
      // T: he dances (while he stands still, and nothing else is going on). Dance long enough with enough of them watching...
      walker.emote = danceKey && playing && !held && !me.downed && !aiming && !fireNow && !arms.rl ? 'dance' : null;
      if (dud) walker.emote = 'drunkidle';   // (the dud: doubled over, coughing)
      if (walker.emote && !walker.moving) story.tip('dance');
      if (grab) runGrab(dt, meleeKey && !wasMelee);
      walker.update(playing || held || me.downed ? dt : 0, keys, playing || grab ? mouse : [0, 0], (aiming && !held) || !!grab, fireNow && !held, !playing || held);
      walker.focus = dead.hit(camera.position, walker.lookDir, 30, true)?.t ?? Infinity;
      dead.eye.copy(camera.position);
      me.pos.copy(walker.pos);
      me.y = walker.y;
      me.eye.set(walker.pos.x, 1.6, walker.pos.z);
      station.update(dt);
      grace = Math.max(0, grace - dt);

      if (world) {
        // Your guns.
        const can = playing && !held;
        const happened = arms.update(dt, { fire: can && fireNow, fireDown: can && fireNow && !wasFire, aiming, reload: can && reloadKey && !wasReload, melee: can && meleeKey && !wasMelee, still: !can || !!walker.crawl });
        if (can && swapKey && !wasSwap && !me.downed) arms.swap();
        for (const e of happened) {
          if (e.type === 'hit') { addPoints(RULES.hit); hitMark = 0.12; playHit(); sound.meat(e.point, !!e.melee || arms.gun.pellets > 1); }
          else if (e.type === 'kill') { sound.meat(e.point, true); onKill(e.z, e.part, myId()); }
          else if (e.type === 'swing') { drillEv.swing = true; sound.swing(e.hit); if (arms.chicken) sound.squeak(me.pos.clone().setY(1.2)); if (conga) congaBroken = true; }
          else if (e.type === 'dry') story.tip('reload');
          else if (e.type === 'shot') { drillEv.shot = true; shots++; sound.shot(e.gun.model, e.gun.auto); if (conga) congaBroken = true; }
          else if (e.type === 'wall') sound.ricochet(e.point);
          else if (e.type === 'reloadSound') sound.part(e.name);
          else if (e.type === 'magOut') { throwMag(); maybeFumble(); drillEv.reload = true; }
          else if (e.type === 'dump') dumpCases();
          else if (e.type === 'dry') sound.dry();
          else if (e.type === 'swap') { sound.swap(); chickenDirty = true; }
        }
        runDead(dt);
        others.update(dt);
        scares.update(dt, { me, round: game.round, host: hosting(), reloading: arms.reloading > 0, playing });
        if (scares.spawned) { game.left += scares.spawned; scares.spawned = 0; }
        if (scares.wants === 'watcher') { scares.wants = null; if (hosting()) spawnWatcher(); }
        if (scares.wants === 'stalker') { scares.wants = null; if (hosting()) { const at = pickSpawn(true); if (at) { const z = dead.spawn('stalker', at.x, at.z, at.yaw ?? 0, 'walk', hpOf(game.round) * 1.4); z.name = 'PRIYA RAMAN'; game.left += 1; } } }

        if (gKey && !wasG && playing && !held && goldenReady()) lightUp();
        wasG = gKey;
        runGolden(dt);
        runWardenCut(dt);
        if (!game.over && (me.downed || me.out)) {
          // Down (with friends): bleeding out, unless one of them gets to you. Out: wait for the next round.
          runRounds(dt);
          coins.update(dt, FAR);
          if (me.downed && !me.out) {
            me.bleed -= dt;
            hud.down(`DOWN  ·  ${Math.max(0, Math.ceil(me.bleed))}`);
            if (me.bleed <= 0) { me.out = true; hud.down('BLED OUT  ·  back next round'); }
          }
          hud.hint('');
        } else if (!game.over) {
          runRounds(dt);
          // Getting better.
          game.sinceHit += dt;
          if (!game.hard && game.sinceHit > RULES.regenAfter) game.health = Math.min(game.maxHealth, game.health + RULES.regen * dt);
          // Gold, picked up; and whatever else is lying there.
          const got = coins.update(dt, me.pos);
          if (got) { game.gold += got; hud.gold(game.gold, got); playCoin(0.5); story.tip('gold'); }
          const pk = pickups.near(me.pos);
          if (pk) tookPickup(pk);
          // A friend down near you: hold E to get them up (before anything else E does).
          const friend = coop() ? others.list().find((o) => o.downed && !o.out && !o.carriedBy && o.pos.distanceTo(me.pos) < 1.9) : null;
          if (friend && playing && !me.carrying) {
            // (together: a second pair of hands on them halves it. F held a second instead: pick them up and carry them)
            const helpers = others.list().filter((o) => o.id !== friend.id && o.rv && o.pos.distanceTo(friend.pos) < 2.4).length;
            hud.hint(`Hold E to get ${friend.name} up  ·  or hold F to carry them`);
            reviving = use ? reviving + dt * (1 + helpers) : 0;
            me.reviving = !!use;
            if (use) hud.qte('E', helpers ? 'REVIVE TOGETHER' : 'GET THEM UP', Math.min(1, reviving / RULES.revive), '#7dffb0', null, helpers ? `${helpers + 1} of you: twice as fast` : ''); else hud.qte(null);
            carryHold = meleeKey ? carryHold + dt : 0;
            if (carryHold > 1.0) { carryHold = 0; startCarry(friend); }
            if (reviving >= RULES.revive) { reviving = 0; me.reviving = false; hud.qte(null); tallyOf(myId()).revives++; if (party.hosting) tell({ da: 'revive', who: friend.id, by: myId() }); else say({ da: 'revive', who: friend.id, by: myId() }); addPoints(50); }
          } else { if (reviving > 0 || me.reviving) hud.qte(null); reviving = 0; me.reviving = false; carryHold = 0; }
          // E to buy (or to go through the airlock).
          const offer = friend && playing ? null : useAt();
          if (friend && playing) { /* (the revive has the E) */ }
          else if (offer) {
            hud.hint(game.points >= offer.price ? offer.text : `${offer.text}  ·  not enough points`);
            if (use && !wasUse) {
              if (game.points >= offer.price) { if (offer.price) { addPoints(-offer.price); sound.buy(); } offer.act(); } else sound.deny();
            }
          } else hud.hint('');
        } else {
          coins.update(dt, FAR);
          game.downFor += dt;
          if (game.downFor > 3.2 && game.downFor - dt <= 3.2) showCard();
        }
        runNet(dt);
        // Footsteps.
        const stride = walker.sprinting ? 1.45 : 0.82;
        if (walker.walkTime - stepAt > stride) { stepAt = walker.walkTime; sound.step(walker.sprinting ? 1.2 : walker.aim > 0.5 ? 0.6 : 1, walker.sprinting); }
        if (walker.sprinting && time - puffAt > 0.62) { puffAt = time; sound.puff(1); }
        else if (game.health < game.maxHealth * 0.4 && !game.over && time - puffAt > 2.3) { puffAt = time; sound.scared(0.8); }
      }
      if (!playing) {
        if (!world) { dead.draw(0); coins.draw(); }
        if (!game.over) hud.hint(!game.picked ? '' : game.round === 0 && time < 0.5 ? 'Click to begin' : 'Click to carry on  ·  Esc again to leave');
      } else if (game.round === 0 && !game.over && !drill) hud.hint('WASD walk  ·  Shift sprint  ·  Space jump / vault  ·  right button aims  ·  F melee  ·  R reload  ·  Q swap  ·  E buy and open');   // (the first time: how it is played)
      wasFire = fireNow; wasUse = use; wasReload = reloadKey; wasSwap = swapKey; wasMelee = meleeKey; wasHelp = helpKey;
      runLights(dt);
      runDust();
      story.update(dt);
      drops.update(dt);
      pickups.update(dt);

      // What is on the screen, and what you hear.
      let near = Infinity;
      for (const z of dead.list) if (z.hp > 0 && z.state !== 'feed') near = Math.min(near, z.pos.distanceTo(me.pos));
      const danger = Math.max(0, Math.min(1, 1 - (near - 2) / 14)), hurt = 1 - game.health / game.maxHealth;
      sound.update(dt, camera, { danger, hurt: game.over ? 1 : hurt, dark: game.dark, signal: game.story?.busy === 'signal', hard: game.hard });
      hitMark = Math.max(0, hitMark - dt);
      if (hurtDir.k > 0) { hurtDir.k = Math.max(0, hurtDir.k - dt * 1.4); hud.hurtFrom(hurtDir.b, hurtDir.k); }
      const slot = arms.slot;
      hud.ammo(slot ? arms.nameOf(slot.id) : '', slot ? slot.mag : 0, slot ? slot.spare : 0, slot ? arms.magOf(slot.id) : 0, arms.reloading > 0);
      hud.cross(arms.spread(aiming) / 4, walker.aim > 0.6, hitMark > 0);
      hud.blood(game.over ? 1 : Math.max(0, hurt * 1.15 - 0.15));
      { const zn = station.zoneAt(walker.pos); hud.zone(zn); if (zn && zn !== lastZone) { lastZone = zn; if (!seenZones.has(zn) && intro < 0 && !cutIn && ZONES[zn]) { seenZones.add(zn); hud.banner(ZONES[zn].name.toUpperCase(), 0xe8e2d6); } } }
      for (const l of ductLights()) l.intensity = 1.0 + 0.9 * Math.max(0, Math.sin(time * 4.5));
      hud.gold(game.gold);
      hud.team(coop() ? others.list() : []);
      runMarker();
      runCrateMark();
      logs?.update(dt, time);
      runDuct();
      {
        const useNow = input0?.down?.('KeyE') || !!testing?.use, melNow = input0?.down?.('KeyF') || !!testing?.melee;
        const useDown = useNow && !wasQteUse, melDown = melNow && !wasQteMel; wasQteUse = useNow; wasQteMel = melNow;
        lift?.update(dt);
        walker.carriedY = exiting && lift ? lift.y : null;   // (up the shaft with the cage)
        if (exiting && lift) { walker.y = lift.y; walker.vy = 0; walker.model.root.position.y = lift.y; }
        runDrill(dt, drillEv); drillEv = {};
        me.shield = !!(cutIn || skit || dud || conga || (trophy && trophy.t < 4.5) || game.cut >= 0 || exiting);   // (the trophy stays as a prop: only its fall shields you)
        runGlance(dt);
        runSkit(dt);
        runChicken(dt);
        runDud(dt);
        runConga(dt);
        runTrophy(dt);
        if (holdQ) runHold(dt, useDown);
        if (decomp) runDecomp(dt, useNow, melDown);
        if (active && !me.safe) runStrap(dt, useDown, melDown);
        if (coop()) runCarry(dt, melDown);
        if (coop()) runCrank(dt, input0?.down?.('KeyA') || !!testing?.a, input0?.down?.('KeyD') || !!testing?.d);
        runEye();
        runBackToBack();
        if (!me.safe && !me.downed) runSafe(dt, useDown);
      }
      watchObjectives();
      for (const e of scares.events) { if (e.kind === 'net') { if (coop()) (hosting() ? tell : say)({ da: 'scare', k: e.id, x: e.x, z: e.z }); continue; } cutScare(e); }
      scares.events.length = 0;
      sound.crateHum?.(crateAt);
      if (grabCut) runGrabCut(dt);
      else runCut(dt);
      if (testing?.freeCam) { const [x, y, z, tx, ty, tz] = testing.freeCam; camera.position.set(x, y, z); camera.lookAt(tx, ty, tz); camera.updateProjectionMatrix(); }
      // (the tests: a camera of their own, to look at him from wherever)
      if (testing?.cam) { camera.position.fromArray(testing.cam.pos); camera.lookAt(...testing.cam.at); camera.fov = testing.cam.fov || 50; camera.updateProjectionMatrix(); walker.model.root.visible = true; walker.view.visible = false; }
    },
    // (pointer lock, from a click on the card's button: the click is the user's own)
    lock() { renderer.domElement.requestPointerLock?.()?.catch?.(() => {}); },
  };
  // ---- The editor's stages: every part of the mode, set up on demand (mode.stage(id), once it is in). Each run()
  // is called with the station built and the intro over; `at(x, z, yaw)` puts him somewhere, `doors()` opens them all.
  const at = (x, z, yaw = 0) => { if (walker.crawl) { walker.crawl = null; walker.model.root.visible = true; } walker.spawn(x, z, yaw); walker.yaw = yaw; me.pos.copy(walker.pos); };
  const allDoors = () => { for (let i = 0; i < station.doors.length; i++) openDoor(i); };
  const rich = () => { game.points = Math.max(game.points, 99999); game.gold = Math.max(game.gold, 500); };
  const toRound = (n) => { for (const z of dead.list) if (z.hp > 0 && z.state !== 'feed') dead.kill(z, 'body', null); game.round = n - 1; game.left = 0; game.breakFor = 0.01; };
  const nearOne = (kind = 'runner') => { const f = new THREE.Vector3(Math.sin(walker.yaw), 0, Math.cos(walker.yaw)), p = walker.pos.clone().addScaledVector(f, 2.2); return dead.spawn(kind, p.x, p.z, walker.yaw + Math.PI, 'walk', hpOf(Math.max(1, game.round))); };
  const STAGES = [
    { id: 'intro', group: 'The way in', name: 'The entrance', blurb: 'the cut-in on the way in: the party in the dark, the lighter, the first scream', run: () => { intro = 0; hud.hint(''); } },
    { id: 'pick', group: 'The way in', name: 'Normal or Nightmare', blurb: 'the choice before the first round', run: () => { game.picked = false; askDifficulty(); } },
    { id: 'night', group: 'The station', name: "Tonight's modifier, the next one", blurb: 'blackout · low gravity · the quiet · twins · steam · the swarm, in turn; round 1 from the bay', run: () => { game.night = NIGHTS[nightStage++ % NIGHTS.length].id; applyNight(); hud.banner(`TONIGHT  ·  ${N().name}`, 0x9ae6ff); hud.tip(`Tonight: ${N().blurb}`); wake(); } },
    { id: 'bay', group: 'The station', name: 'Arrival Bay, round 1', blurb: 'a plain start: the bay, the pistol, the first of them', run: () => { wake(); } },
    { id: 'log', group: 'The way in', name: 'The first recorder', blurb: "day one, by the first body in the bay: the card, Jun's voice, Kirky's word", run: () => { logs.forget(); logs.place(); const p = logs.placed[0]; if (p) at(p.pos.x - 1.2, p.pos.z, Math.PI / 2); } },
    { id: 'open', group: 'The station', name: 'Everything open', blurb: 'every door open, 99,999 points, round 1', run: () => { allDoors(); rich(); } },
    { id: 'round3', group: 'The station', name: 'Round 3', blurb: 'sprinters and crawlers from here; the vent is live', run: () => { allDoors(); rich(); toRound(3); } },
    { id: 'round5', group: 'The station', name: 'Round 5: the Warden', blurb: 'the Warden comes a while into it', run: () => { allDoors(); rich(); toRound(5); } },
    { id: 'round8', group: 'The station', name: 'Round 8: lights out', blurb: 'the strips go, the reds drop, your lamps', run: () => { allDoors(); rich(); toRound(8); } },
    { id: 'warden', group: 'The station', name: 'The Warden, now', blurb: 'his cut-in and him, wherever you are', run: () => { rich(); spawnWarden(); } },
    { id: 'watcher', group: 'The station', name: 'The Watcher', blurb: 'one stood in an opening, lit red, looking at you', run: () => { rich(); spawnWatcher(); } },
    { id: 'screamer', group: 'The station', name: 'A screamer', blurb: 'in front of you; in sight of you it calls, and more come', run: () => { rich(); nearOne('screamer'); } },
    { id: 'power', group: 'The objectives', name: 'Restore power', blurb: 'at the core in the Reactor: E, and stay by it', run: () => { allDoors(); rich(); at(CORE.x, CORE.z + 2.2, Math.PI); } },
    { id: 'signal', group: 'The objectives', name: 'Send the signal', blurb: 'power restored; at the Med Bay uplink: E, and keep it alive 45 s', run: () => { allDoors(); rich(); story.apply([1, 0, 0, '']); at(UPLINK.x, UPLINK.z + 2.2, Math.PI); } },
    { id: 'hold', group: 'The objectives', name: 'Hold out', blurb: 'the signal sent: three rounds until the lift comes back', run: () => { allDoors(); rich(); story.apply([2, 0, 0, '']); } },
    { id: 'escape', group: 'The objectives', name: 'Get to the lift', blurb: 'the lift sent down: the cut-in of it coming, the runway, everyone in', run: () => { allDoors(); rich(); lift.setUp(); story.apply([2, 0, game.round, '']); at(8 * CELL, 2 * CELL, -Math.PI / 2); setTimeout(() => { story.apply([3, 0, 0, '']); lift.call(14); lift.runway(true); }, 400); } },
    { id: 'won', group: 'The objectives', name: 'You got out', blurb: 'the win, and its card', run: () => { allDoors(); story.apply([4, 0, 0, '']); } },
    { id: 'boof', group: 'The cut-ins', name: 'The Golden BOOF', blurb: 'charged: press G (unlocked here whether or not you finished the story)', run: () => { game.boofFree = true; game.boof = RULES.golden.kills; nearOne('walker'); hud.tip('G: hit the boof'); } },
    { id: 'grab', group: 'The cut-ins', name: 'Grabbed', blurb: 'one has you: mash F, or wait for the bite', run: () => { const z = nearOne('runner'); setTimeout(() => { if (active && z.hp > 0) { dead.grab(z, me); startGrab(z.id, z); } }, 400); } },
    { id: 'down', group: 'The cut-ins', name: 'Down, and the card', blurb: 'you go down; alone, the end card', run: () => { grace = 0; clawed(999, null); } },
    { id: 'pause', group: 'The cut-ins', name: 'The pause menu', blurb: 'Esc: resume, controls, settings, leave', run: () => { setPaused(true); } },
    { id: 'lamp', group: 'The scares', name: 'The lamp', blurb: 'your lamp stutters and dies; when it comes back, one is right there', run: () => { allDoors(); at(6 * CELL, 2 * CELL, Math.PI / 2); scares.lamp(); } },
    { id: 'vent', group: 'The scares', name: 'The vent', blurb: 'something along the ceiling over your head, out behind you', run: () => { allDoors(); at(7 * CELL, 2 * CELL + 1.0, Math.PI); scares.vent(); } },
    { id: 'breath', group: 'The scares', name: 'The breath', blurb: 'right behind your ear; nothing there', run: () => { setTimeout(() => active && scares.breath(me), 800); } },
    { id: 'doorstep', group: 'The scares', name: 'The doorstep', blurb: 'coming out of the lounge, one waiting just outside', run: () => { allDoors(); rich(); toRound(2); game.loungeOpen = true; at(station.lounge.outside.x, station.lounge.outside.z, station.lounge.facing); scares.doorstep(station.lounge.outside, station.lounge.facing, hpOf(2), true); } },
    { id: 'deck', group: 'The station', name: 'The Observation Deck', blurb: 'a floor up, over the Med Bay: the parapet, the windows, the Moon', run: () => { allDoors(); rich(); at(16 * CELL, 3 * CELL, Math.PI); } },
    { id: 'stairs', group: 'The station', name: 'The stairs', blurb: 'from the Med Bay\'s north arm, up to the deck', run: () => { allDoors(); rich(); at(13 * CELL + 0.3, 3 * CELL, Math.PI / 2); } },
    { id: 'quarters', group: 'The station', name: 'The Crew Quarters', blurb: 'through the Reactor\'s east door: the bunks, the lockers, what they wrote', run: () => { allDoors(); rich(); at(13 * CELL, 10 * CELL, Math.PI / 2); } },
    { id: 'medbay', group: 'The station', name: 'The Med Bay', blurb: 'the tall room, the deck over its north side', run: () => { allDoors(); rich(); at(16 * CELL, 6 * CELL, Math.PI + 0.3); } },
    { id: 'skit', group: 'The laughs', name: 'The reload skit', blurb: 'one reload in ten: the fresh mag slips; one of them picks it up and hands it back (press R here)', run: () => { allDoors(); rich(); at(15 * CELL, 5 * CELL, 0); const z = dead.spawn('walker', 15 * CELL + 2.6, 5 * CELL + 4.2, Math.PI, 'walk', 400); z.state = 'stand'; z.standFor = 99; z.watch = false; fumbleNext = true; const s = arms.slot; if (s) s.mag = Math.min(s.mag, 2); } },
    { id: 'dud', group: 'The laughs', name: 'The boof dud', blurb: 'one Golden BOOF in ten: no hour, a coughing fit, the dead stop to watch, one pats his back (press G here)', run: () => { allDoors(); rich(); game.boofFree = true; game.boof = RULES.golden.kills; at(15 * CELL, 5 * CELL, 0); for (const [dx, dz] of [[2.2, 4.5], [-3.5, 3.2], [3.6, 2.6]]) { const z = dead.spawn('walker', 15 * CELL + dx, 5 * CELL + dz, Math.PI, 'walk', 400); z.state = 'stand'; z.standFor = 99; z.watch = false; } dudNext = true; } },
    { id: 'conga', group: 'The laughs', name: 'The conga', blurb: 'dance (T) a few seconds with the dead about: the nearest five line up behind you, rallying, until something breaks it', run: () => { allDoors(); rich(); at(15 * CELL, 5 * CELL, 0); for (const [dx, dz] of [[1.5, 4.5], [-2.5, 4.2], [3.2, 3.0], [-3.8, 2.4], [0.4, 6.2]]) { const z = dead.spawn('walker', 15 * CELL + dx, 5 * CELL + dz, Math.PI, 'walk', 400); z.state = 'stand'; z.standFor = 99; z.watch = false; } congaArm = 2.3; } },
    { id: 'trophy', group: 'The laughs', name: 'The Mastre trophy', blurb: 'round ten: the PA, and a gold Kirky out of the ceiling onto the nearest of them', run: () => { allDoors(); rich(); at(15 * CELL, 5 * CELL, 0); const z = dead.spawn('walker', 15 * CELL + 0.6, 5 * CELL + 4.4, Math.PI, 'walk', 400); z.state = 'stand'; z.standFor = 99; z.watch = false; trophyDone = true; trophyCall(); } },
    { id: 'chicken', group: 'The laughs', name: 'The rubber chicken', blurb: 'under a bunk in the Crew Quarters: E, and F is a chicken from then on', run: () => { allDoors(); rich(); at(BUNKS[0][0] + 1.3, BUNKS[0][1] - 1.3, -Math.PI / 4); } },
    { id: 'safe', group: 'Co-op', name: 'The dead-man safe', blurb: 'the Lab: E on one plate, then the other within a second (two of you, or one at a sprint)', run: () => { allDoors(); rich(); at(SAFE.a.x, SAFE.a.z - 1.2, 0); } },
    { id: 'crank', group: 'Co-op', name: 'The crank (uplink)', blurb: 'the wheel in the Med Bay: with friends the dish turns only while one of you cranks (A / D)', run: () => { allDoors(); rich(); story.apply([1, 0, 0, '']); at(CRANK.x - 1.6, CRANK.z, Math.PI / 2); } },
    { id: 'holdit', group: 'Co-op', name: 'Hold it shut', blurb: 'the Lab door, hammered on: E as the marker crosses the green, three good hits (alone it is just you)', run: () => { rich(); toRound(2); const d = station.doors[0]; at(d.at.x - (d.across ? 0 : 1.8), d.at.z - (d.across ? 1.8 : 0), Math.atan2(d.across ? 0 : 1, d.across ? 1 : 0)); setTimeout(() => startHold(d), 800); } },
    { id: 'decomp', group: 'Co-op', name: 'Decompression', blurb: 'the outer door lets go: hold a rail (E by a wall) or shut it from the panel (mash F)', run: () => { rich(); toRound(3); holdQ = null; strap = null; hud.qte(null); lift.setUp(); at(START.i * CELL + 2, START.j * CELL, Math.PI); setTimeout(() => startDecomp(), 800); } },
    { id: 'drill', group: 'The way in', name: 'The bay drill', blurb: 'the first time in: the controls, a step at a time, in the safe bay', run: () => { at(START.i * CELL, START.j * CELL, START.yaw); game.woke = false; setTimeout(() => startDrill(true), 300); } },
    { id: 'board', group: 'Co-op', name: 'Into the lift', blurb: 'the lift is down: E by a rail inside it, then mash F on the lever: the way out', run: () => { allDoors(); rich(); lift.setDown(); lift.runway(true); story.apply([3, 0, 0, '']); if (!game.power) onPower(); at(lift.at.x + 3.6, lift.at.z, -Math.PI / 2); } },   // (by then the power is on: it was the first thing done)
    { id: 'crawl', group: 'The scares', name: 'The crawlspace', blurb: 'the duct from the Spine to the Lab: in on your belly; halfway, something is coming the other way', run: () => { allDoors(); rich(); toRound(2); at(DUCT.from.x, DUCT.from.z - 1.3, 0); setTimeout(() => walker.enterDuct(DUCT.from, DUCT.to), 2200); } },
    { id: 'lift', group: 'The scares', name: "The Warden's hand", blurb: 'he does not claw: he lifts you off the floor by the throat; mash F', run: () => { rich(); toRound(2); const z = nearOne('warden'); setTimeout(() => { if (active && z.hp > 0) { dead.grab(z, me); startGrab(z.id, z); } }, 900); } },
    { id: 'window', group: 'The scares', name: 'The window', blurb: 'on the deck, looking out: something walks past the glass', run: () => { allDoors(); rich(); at(16 * CELL, 3 * CELL, Math.PI); setTimeout(() => scares.force('window', me), 600); } },
    { id: 'parapet', group: 'The scares', name: 'The parapet', blurb: 'in the Med Bay under the deck: a hand over the edge, and the rest of it comes down', run: () => { allDoors(); rich(); at(16 * CELL, 4 * CELL + 0.4, Math.PI); setTimeout(() => scares.force('parapet', me), 600); } },
    { id: 'overhead', group: 'The scares', name: 'Steps overhead', blurb: 'in the Med Bay: six slow steps on the deck over your head', run: () => { allDoors(); rich(); at(16 * CELL, 5 * CELL, Math.PI); setTimeout(() => scares.force('overhead', me), 600); } },
    { id: 'bunk', group: 'The scares', name: 'The bunk', blurb: 'the quarters: the blanket on the second bunk moves; what is under it gets up', run: () => { allDoors(); rich(); at(BUNKS[1][0] - 1.3, BUNKS[1][1] - 1.5, Math.PI / 5); setTimeout(() => scares.force('bunk', me), 600); } },
    { id: 'sitter', group: 'The scares', name: 'The one on the stairs', blurb: 'sitting at the top of the stairs with its back to you: walk up (W)', run: () => { allDoors(); rich(); toRound(1); at(13 * CELL, 3 * CELL, Math.PI / 2); scares.force('sitter', me); } },
    { id: 'chest', group: 'The scares', name: 'The footlocker', blurb: 'the quarters: its lid flies open as you pass; off and not looking, it slams shut', run: () => { allDoors(); rich(); at(14.6 * CELL - CELL / 2, 11.05 * CELL - CELL / 2 - 1.7, 0); setTimeout(() => scares.force('chest', me), 600); } },
    { id: 'wheel', group: 'The scares', name: 'The wheel', blurb: 'the Med Bay, alone: the crank turns by itself', run: () => { allDoors(); rich(); at(CRANK.x - 2.6, CRANK.z + 0.4, Math.PI / 2); setTimeout(() => scares.force('wheel', me), 600); } },
    { id: 'gone', group: 'The scares', name: 'The missing body', blurb: 'a body gone from where it lay (the Spine\'s): go back to it', run: () => { allDoors(); rich(); toRound(2); at(13 * CELL, 2 * CELL, -Math.PI / 2); setTimeout(() => scares.force('gone', me), 600); } },
    { id: 'recorder', group: 'The scares', name: 'The recorder', blurb: 'one of Jun\'s recorders playing by itself, somewhere else', run: () => { allDoors(); rich(); at(4 * CELL, 2 * CELL, Math.PI / 2); setTimeout(() => scares.force('recorder', me), 600); } },
    { id: 'drip', group: 'The scares', name: 'The drip', blurb: 'the Med Bay: blood off the parapet edge onto the plates', run: () => { allDoors(); rich(); at(16 * CELL, 5 * CELL - 2, Math.PI); } },
    { id: 'steam', group: 'The scares', name: 'Steam', blurb: 'a pipe lets go beside you in the Spine; sometimes something is in it', run: () => { allDoors(); at(22, 8.6, -Math.PI / 2); setTimeout(() => scares.steamNow(me.pos), 400); } },
    { id: 'hanging', group: 'The scares', name: 'The hanging one', blurb: 'one on a cable in the Reactor; it lets go as you pass under', run: () => { allDoors(); rich(); toRound(2); at(34, 31.5, 0); setTimeout(() => { const h = scares.hangOne(); if (h) at(h.pos.x - 1.4, h.pos.z - 1.2, Math.atan2(1.4, 1.2)); }, 1200); } },
    { id: 'knock', group: 'The scares', name: 'The knock', blurb: 'stand by a shut door: something on the other side wants through', run: () => { rich(); const d = station.doors[0]; at(d.at.x - (d.across ? 0 : 1.5), d.at.z - (d.across ? 1.5 : 0), Math.atan2(d.across ? 0 : 1, d.across ? 1 : 0)); setTimeout(() => scares.knockNow(me.pos), 900); } },
    { id: 'ankle', group: 'The scares', name: 'The ankle', blurb: 'the first body takes your foot as you step over it', run: () => { at(6.4, 12.6, 0.3); setTimeout(() => scares.ankleNow(me.pos), 700); } },
    { id: 'stalker', group: 'The scares', name: 'The stalker', blurb: 'Priya: it moves only when nobody looks; look away and it comes', run: () => { allDoors(); rich(); toRound(2); const z = dead.spawn('stalker', me.pos.x + 9, me.pos.z, Math.PI * 1.5, 'walk', 500); z.name = 'PRIYA RAMAN'; } },
    { id: 'riseall', group: 'The scares', name: "The sleepers' round", blurb: 'every body on the floor gets up at once', run: () => { allDoors(); rich(); toRound(2); setTimeout(() => { scares.riseAll(); }, 1500); } },
    { id: 'blackout', group: 'The scares', name: 'The blackout', blurb: 'every light out, a scream far off', run: () => { scares.blackout(); } },
    { id: 'sleeper', group: 'The scares', name: 'A sleeper', blurb: 'a body on the floor that is not as dead as it looks: walk up to it (round 2)', run: () => { allDoors(); toRound(2); at(8.6 * CELL - 3, 5.6 * CELL, Math.PI / 2); } },
    { id: 'lounge', group: 'The Crew Lounge', name: 'The lounge', blurb: 'inside: the tables, the bar, the stage', run: () => { rich(); game.loungeOpen = true; goIn(); } },
    { id: 'openmic', group: 'The Crew Lounge', name: 'The open mic', blurb: 'the whole show, his song and all', run: () => { rich(); game.loungeOpen = true; goIn(); const wait = setInterval(() => { if (!active) clearInterval(wait); else if (lounge.inside && lounge.room?.stageSpots) { clearInterval(wait); setTimeout(() => lounge.show(), 1200); } }, 200); } },
    { id: 'crate', group: 'The Crew Lounge', name: 'The crate', blurb: 'by the core, 99,999 points: roll it', run: () => { allDoors(); rich(); at(CRATE.x, CRATE.z + 2.4, Math.PI); } },
    { id: 'chip', group: 'The Crew Lounge', name: "Babitus's chip", blurb: 'the crate rigged to land on the chip', run: () => { allDoors(); rich(); at(CRATE.x, CRATE.z + 2.4, Math.PI); crate.rig('chip'); } },
  ];
  // Every shader the station will need, compiled in one go while nothing is moving (the hidden things shown for it).
  let sceneWarm = false;
  function warmScene() {
    if (sceneWarm) return;
    sceneWarm = true;
    try {
      const shown = [];
      scene.traverse((o) => { if ((o.isMesh || o.isSprite || o.isPoints || o.isLine) && !o.visible) { o.visible = true; shown.push(o); } });
      renderer.compile(scene, camera);
      for (const o of shown) o.visible = false;
    } catch (error) { console.warn('DEAD AIR: could not warm the station up.', error); }
  }
  function runStage(id) {
    objQuiet = time + 2.5;
    if (game.over || game.won) { game.over = false; game.won = false; hud.over?.(false); }   // (a stage after the ending: the ending is put away)
    const s = STAGES.find((x) => x.id === id);
    if (!s) return false;
    return new Promise((done) => {
      const tick = setInterval(() => {
        if (!active) { clearInterval(tick); done(false); return; }
        if (!entered || !walker || !station) return;
        clearInterval(tick);
        if (id !== 'intro' && intro >= 0) endIntro();
        if (id !== 'pick') { game.picked = true; hud.pick(false); }
        if (id !== 'bay' && id !== 'intro' && id !== 'log' && id !== 'pick') game.woke = true;   // (no first scream in the way of what the stage is for)
        try { s.run(); } catch (error) { console.warn('DEAD AIR: the stage would not set up.', error); }
        done(true);
      }, 100);
    });
  }
  let testing = null, entered = false, nightStage = 0, wasQteUse = false, wasQteMel = false;   // (entered: enter() has done everything it does)
  // (for testing without the pointer: the game runs as if it were locked; { aim, fire } hold those buttons down)
  mode.test = (on = {}) => { testing = on ? { aim: false, fire: false, ...on } : null; if (testing && intro >= 0) endIntro(); return testing; };
  window.deadAir = mode;   // (for testing from the console, as window.game is)

  // Click to play; Esc lets the pointer go (and the game stops), Esc again leaves.
  renderer.domElement.addEventListener('click', () => {
    if (!active) return;
    if (intro >= 0) endIntro();
    if (game.over) { if (game.downFor < 3.2) { game.downFor = 3.2; showCard(); } return; }
    if (!lounge?.inside && !document.pointerLockElement) { unlockAudio(); sound?.open(true); mode.lock(); }
  });
  addEventListener('keydown', (e) => { if (active && intro >= 0 && e.code !== 'Escape') endIntro(); });
  // (Esc with the pointer already gone: the menu, if it is not up; if it is, back into the game)
  addEventListener('keydown', (e) => {
    if (!active || e.code !== 'Escape' || document.pointerLockElement || lounge?.inside || game.over || intro >= 0 || hud.picking || testing) return;
    if (paused) { unlockAudio(); sound?.open(true); mode.lock(); } else if (everLocked) setPaused(true);
  });
  function onResize() { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
  addEventListener('resize', onResize);
  void KINDS;
  return mode;
}

// The outline chalked round a gun on the wall, and its name under it.
function chalkTexture(name) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(235,235,225,0.85)'; g.lineWidth = 7; g.lineCap = g.lineJoin = 'round';
  const wob = () => (Math.random() - 0.5) * 6;
  g.beginPath();
  const pts = [[40, 120], [120, 96], [300, 92], [470, 100], [478, 128], [330, 136], [250, 140], [230, 200], [190, 206], [180, 150], [60, 150]];
  pts.forEach(([x, y], i) => (i ? g.lineTo(x + wob(), y + wob()) : g.moveTo(x, y)));
  g.closePath(); g.stroke();
  g.font = '600 34px "Barlow Condensed", "Arial Narrow", sans-serif'; g.fillStyle = 'rgba(235,235,225,0.8)'; g.textAlign = 'center';
  g.fillText(name.toUpperCase(), 256, 244);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
