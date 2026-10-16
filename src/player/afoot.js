// Off the board, in Free Ride. B: he kicks it up by its tail, flicks it over onto his back and goes on foot. The
// movement keys walk him the way the camera is looking (Shift runs, Space is a moon hop, S on its own backs off); B
// again and the board comes down off his back under his front foot, he steps on and rolls away at the pace he was
// going. Everything the Moon does to a rider it does to him on foot (the vents, the Geyser, the lava throw him just
// the same): it moves the skater, and on foot he is still the skater, his position and his speed. Only the rules for
// moving him are different, and the clips: his own walk, run and jump (kirkyBody.js), as in DEAD AIR.
import * as THREE from 'three';
import { config } from '../config.js';
import { heightAt } from '../world/terrain.js';
import { stats } from './stats.js';
import { keyLabel } from '../ui/keys.js';
import { playFootstep, playBoardFlick, playBoardDown } from '../fx/audio.js';

export const AFOOT = {
  key: 'KeyB',
  walk: 4.0, run: 6.8, back: 2.8, aimed: 2.4,   // m/s: walking (the movement keys), running (Shift), backing off (S alone), aiming
  accel: 10,         // how quickly he gets to the pace he wants on his feet...
  air: 2.2,          // ...in the air (a little steering in a hop)
  coast: 3.2,        // ...and running out the speed of the board he has just stepped off (it carries him on a few strides)
  carry: 9,          // m/s: the most of the board's speed that he can run out (faster than that, he lets the rest go)
  hop: 5.2,          // m/s up: a moon hop (on the Moon, a metre and a half up and well over a second in the air)
  stepUp: 0.45,      // the tallest thing he steps straight up onto
  steep: 1.3,        // rise over run: ground steeper than this ahead of him is a wall (a ramp's face, a bowl's side)
  off: 0.46,         // seconds: the board kicked up and flicked over onto his back
  on: 0.34,          // ...and down off it, under his foot, and stepped on
  ride: 3.4,         // m/s at least: rolling away from stepping on
};
const JUMP = [0.75, 1.6], RJUMP = [0.8, 1.6];   // the parts of the jump clips played through a hop (as in DEAD AIR's walker)
const LIFTED = { lifted: true };                 // (how high he is is the game's, not the clip's)
const SQUARE = { upright: 1 };                   // (see poseFoot)
const lowAim = new THREE.Vector3();
const STANCE = -1.15;                            // (on his board he stands across it: skaterModel.js)
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (rate, dt) => 1 - Math.exp(-rate * dt);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const smooth = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
const fw = new THREE.Vector3(), rt = new THREE.Vector3(), wish = new THREE.Vector3(), p1 = new THREE.Vector3(), sc = new THREE.Vector3();
const q1 = new THREE.Quaternion(), qf = new THREE.Quaternion(), X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0);

// The board on his back, and the one in the air between his feet and his back (copies of his own, made as he steps
// off: whatever deck he has on now). For his model, or a friend's.
// On his back it hangs from his chest bone, as his chain and his pack do (kirkyBody.js hangs them there every frame,
// after the clip has posed him): so it leans and turns with his back as he runs. Where on the bone is worked out from
// his own body, once: up his spine (to his neck), across his shoulders, and behind them.
// (worked out from his body, posed standing, running, sprinting and in a hop: a vertex at a time, how far behind his
// spine he is at each height up it and each place across it. He is a big man, and his back bulges out below his chest
// to nearly half a metre behind his spine at the waist; slung high and steeply across it, nose over his right shoulder
// and tail to his left hip (the shallower side), it clears all of him by a few centimetres, and lies against him.)
const BACK = { off: 0.255, pack: 0.13, up: 0.25, lean: 1.0 };   // m behind his spine (more over a pack); its middle, up it; its lean across his back (rad: + its nose up over his right shoulder)
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), up = new THREE.Vector3(), side = new THREE.Vector3(), ahead = new THREE.Vector3(), basis = new THREE.Matrix4();
function boards(model) {
  const B = { back: null, fly: null, hung: { thing: null, on: null } };
  // (his bones: the ones of the body he is wearing, the one being drawn; the others he could change into are posed by nothing)
  const bone = (name) => { let b = null; model.root.traverseVisible((o) => { if (!b && o.isSkinnedMesh && o.skeleton) b = o.skeleton.getBoneByName(name) || null; }); return b; };
  B.make = () => {
    const copy = () => { const c = model.board.clone(true); c.rotation.set(0, 0, 0); c.position.set(0, 0, 0); c.visible = true; c.traverse((o) => { if (o.isMesh) o.castShadow = true; }); return c; };
    for (const key of ['back', 'fly']) if (B[key]) B[key].removeFromParent();
    B.back = new THREE.Group();
    B.back.add(copy());
    B.back.visible = false;
    B.fly = copy();
    B.fly.visible = false;
    model.root.parent?.add(B.fly);
    B.hung.thing = B.back;
    B.fit();
  };
  // Where on his chest bone (from where his bones were when he was last drawn: any pose will do, all of it is measured
  // against the same one).
  B.fit = () => {
    const sp = bone('spine_03'), nk = bone('neck_01'), l = bone('upperarm_l'), r = bone('upperarm_r');
    if (sp && model.hung && model.hung.length && model.hung[0] !== B.hung && !model.hung[0].on) return;   // (his chain and pack not yet hung: kirkyBody measures them first, and would measure this along with them)
    if (!sp || !nk || !l || !r || !model.hung) {   // (no body yet: on the old figure's back)
      B.back.position.set(0, 0.02, -0.16); B.back.rotation.set(Math.PI / 2, 0, 0.5);
      model.packHolder.add(B.back);
      return;
    }
    // (as he was drawn: read straight from the bones, never asked for again, which would work them out afresh from
    // their parents and not as kirkyBody has posed them)
    v1.setFromMatrixPosition(sp.matrixWorld); up.setFromMatrixPosition(nk.matrixWorld).sub(v1).normalize();
    side.setFromMatrixPosition(r.matrixWorld); v2.setFromMatrixPosition(l.matrixWorld); side.sub(v2);
    side.addScaledVector(up, -side.dot(up)).normalize();
    ahead.crossVectors(up, side);                                  // (the way his chest faces)
    const packed = model.packHolder.children.length > 0 && model.packHolder.visible;
    const zb = v2.copy(up).applyAxisAngle(ahead, BACK.lean), yb = ahead, xb = v3.crossVectors(yb, zb).normalize();   // (along it: up his back, leant; its grip to him)
    model.board.getWorldScale(sc);
    basis.makeBasis(xb, yb, zb).scale(sc);
    basis.setPosition(v1.addScaledVector(up, BACK.up).addScaledVector(ahead, -(BACK.off + (packed ? BACK.pack : 0))));
    B.hung.on = sp.matrixWorld.clone().invert().multiply(basis);
    model.root.add(B.back);
    if (!model.hung.includes(B.hung)) model.hung.push(B.hung);
  };
  B.wear = (on) => { if (!B.back) return; if (on && !B.hung.on && B.back.parent !== model.packHolder) B.fit(); B.back.visible = on; };
  B.drop = () => { if (B.back) B.back.visible = false; if (B.fly) B.fly.visible = false; };
  return B;
}

// Pose his model on foot for a frame (his own, or a friend's): where he is, which way he faces, what he is doing.
// how: { speed, air, airT, sprint, back, ready, gunUp, rate }
function poseFoot(model, dt, pos, face, how, aimPoint, hidden = false, blinking = 0) {
  const k = model;
  k.root.position.copy(pos);
  k.root.visible = !hidden && (blinking <= 0 || Math.floor(blinking * 12) % 2 === 0);
  k.root.quaternion.setFromAxisAngle(Y, face);
  k.flip = 0; k.lean = 0; k.crouch = 0; k.tuck = 0; k.pop = 0; k.kick = 1; k.air = how.air ? (k.air || 0) + dt : 0;
  k.tilt.rotation.set(0, 0, 0);
  k.tilt.position.x = 0;
  k.torso.rotation.set(0, 0, 0);
  k.frontLeg.rotation.set(0, 0, 0); k.backLeg.rotation.set(0, 0, 0);
  k.frontLeg.knee.rotation.x = k.backLeg.knee.rotation.x = 0;
  k.leftArm.rotation.set(0, 0, 0);
  k.board.visible = false;
  k.riding = undefined;   // (off his board: kirkyBody plays what he is told, below)
  const long = !!k.twoHanded, hs = how.speed;
  let clip, rate = 1, at, lift = null;
  if (how.air) { clip = long ? 'riflejump' : 'jump'; const c = long ? RJUMP : JUMP; at = Math.min(c[1], c[0] + Math.min(how.airT, 0.9)); lift = LIFTED; }
  else if (hs < 0.3) clip = long && !how.plain ? 'breathe' : how.ready > 0 ? 'pistolidle' : 'idle';   // (plain: a cutscene's, stood square on: the rifle's idle stands him side-on)
  else if (how.sprint) { clip = long ? 'riflesprint' : 'sprint'; rate = long ? Math.max(0.8, hs / AFOOT.run) : 0.95 + 0.1 * (hs / AFOOT.walk); }
  else if (long && (how.gunUp || how.ready > 0 || how.back)) { clip = 'riflewalk'; rate = Math.max(0.55, hs / AFOOT.walk) * (how.back ? -1 : 1); }
  else if (long) { clip = 'riflerun'; rate = Math.max(0.7, hs / AFOOT.walk); }
  else { clip = 'walk'; rate = Math.max(0.55, hs / AFOOT.walk) * (how.back ? -1 : 1); }
  // (the rifle clips turn his chest well round from his hips, the way a man holds a long gun across himself: on the
  // Moon, walking, that read as him going along sideways. His back is brought most of the way round to face where he goes.)
  if (long && !lift) lift = SQUARE;
  // (a pistol he is not using: the clip has that arm too, the gun in its hand (kirkyBody's carryInClip), as in DEAD AIR:
  // posed by hand, it went where it hangs when he rides, which on his feet is folded up behind his back)
  const carry = !long && !how.gunUp;
  k.carryInClip = carry;
  k.play?.(clip, 1, rate, at, carry, lift);
  k.pistolGrip = (k.pistolGrip || 0) + ((!long && how.gunUp ? 1 : 0) - (k.pistolGrip || 0)) * Math.min(1, dt * 14);   // (a pistol up: both hands on it)
  // (a long gun he is not using is carried at low ready: muzzle down in front of him, both hands on it, never hung off one arm)
  if (long && !how.gunUp) { lowAim.set(pos.x + Math.sin(face) * 2.2, pos.y + (how.sprint ? 0.25 : 0.4), pos.z + Math.cos(face) * 2.2); k.updateArm(dt, lowAim, true); }
  else k.updateArm(dt, aimPoint, how.gunUp);
  k.updateSmoke(dt);
}

export function createAfoot({ skater, model, chase, input, emoter = null }) {
  const s = skater, B = boards(model);
  let on = false, phase = null, t = 0, face = 0, camYaw = 0, airT = 9, sprint = false, back = false, ready = 0, stride = 0, jumpWas = false;
  let want = 0, riderY = 0, riderRot = STANCE, aimingNow = false;
  const p0 = new THREE.Vector3(), q0 = new THREE.Quaternion();

  // The hint: which key, and what it does now.
  const hint = document.createElement('div');
  hint.id = 'afoot';
  document.getElementById('hud')?.append(hint);
  let said = '';
  const say = () => {
    const B_ = `<b>${keyLabel(AFOOT.key)}</b>`;
    const text = on ? `${B_} back on the board <span>·</span> <b>${keyLabel('ShiftLeft')}</b> run <span>·</span> <b>${keyLabel('Space')}</b> hop` : `${B_} off the board`;
    if (text !== said) { hint.innerHTML = text; said = text; }
    hint.classList.toggle('on', on);
  };
  say();

  // Off the board (only with all four wheels on the ground: not on a rail, not in a trick, not in the air).
  const canStepOff = () => s.grounded && !s.grinding && !s.trick && !s.ceiling && s.pipeSide !== 1 && s.pipeSide !== -1;
  function stepOff() {
    if (s.manual) s.endManual?.();
    on = true; phase = 'off'; t = 0; want = 0;
    face = Math.atan2(s.fwd.x, s.fwd.z);
    camYaw = chase.yaw + chase.aimYaw;
    model.board.updateWorldMatrix(true, false);
    model.board.matrixWorld.decompose(p0, q0, sc);
    B.make();
    B.fly.position.copy(p0); B.fly.quaternion.copy(q0); B.fly.visible = true;
    riderY = model.rider.position.y; riderRot = model.rider.rotation.y;
    // (he runs out the board's speed, up to a point)
    s.vel.y = 0;
    const hs = Math.hypot(s.vel.x, s.vel.z);
    if (hs > AFOOT.carry) { s.vel.x *= AFOOT.carry / hs; s.vel.z *= AFOOT.carry / hs; }
    s.steer = 0; s.charge = 0;
    airT = 9; stride = 0.6;
    chase.free = true;
    playBoardFlick();
    say();
  }
  function stepOn() {
    phase = 'on'; t = 0; want = 0;
    B.back?.updateWorldMatrix(true, true);
    if (B.back) B.back.children[0].matrixWorld.decompose(p0, q0, sc);
    B.wear(false);
    if (B.fly) { B.fly.position.copy(p0); B.fly.quaternion.copy(q0); B.fly.visible = true; }
    playBoardDown();
  }
  // Back on it, rolling (the end of stepping on; or at once, with nothing to see: a cutscene, a respawn, a new level).
  function mount(rolling = true) {
    const hs = Math.hypot(s.vel.x, s.vel.z);
    on = false; phase = null; want = 0;
    B.drop();
    model.board.visible = true;
    s.fwd.set(Math.sin(face), 0, Math.cos(face));
    const keep = rolling ? Math.max(AFOOT.ride, hs) : 0;
    s.vel.set(s.fwd.x * keep, 0, s.fwd.z * keep);
    s.grounded = true;
    s.up.set(0, 1, 0);
    s.prevPos.copy(s.pos);
    if (rolling) s.sinceKick = 0;   // (a push, stepping on)
    input.jumpReleased = false; input.trickPressed = false;
    // (the camera, which was where the mouse put it, becomes the board's: from here it swings round behind it)
    chase.yaw = wrap(chase.yaw + chase.aimYaw); chase.aimYaw = 0; chase.free = false;
    model.riding = performance.now();
    say();
  }

  const api = {
    get on() { return on; },
    get face() { return face; },
    get phase() { return phase; },
    get airT() { return airT; },
    get sprinting() { return sprint; },
    get boards() { return B; },   // (the tests)
    // B: off, or back on. Pressed in the air (or mid-trick) it waits for him to land, for a moment.
    toggle() {
      if (phase) return;
      if (!on) { if (canStepOff()) stepOff(); else want = 0.6; return; }
      if (s.grounded) stepOn(); else want = 0.6;
    },
    // At once, with nothing to show for it (a cutscene that needs him on his board, a respawn, a new level).
    reset() { if (on || phase) mount(false); },
    // On his feet at once, the board on his back (Free Ride starts him on foot: main.js sets footNext and this is done
    // the first frame he is on the ground).
    footNext: false,
    stepOffNow() {
      if (on || phase) return;
      on = true; want = 0;
      face = Math.atan2(s.fwd.x, s.fwd.z);
      camYaw = chase.yaw + chase.aimYaw;
      B.make(); B.wear(true); if (B.fly) B.fly.visible = false;
      model.board.visible = false; model.riding = undefined;
      model.rider.position.y = 0; model.rider.rotation.y = 0;
      s.vel.set(0, 0, 0); s.steer = 0; s.charge = 0; airT = 9; stride = 0;
      chase.free = true;
      say();
    },

    // One physics step (in place of skater.update). camYaw: which way the camera looks.
    step(dt, inp, yaw, aiming) {
      camYaw = yaw;
      aimingNow = aiming;
      const v = s.vel, g = config.physics.gravity * stats.gravity;
      s.prevPos.copy(s.pos);
      if (!s.grounded && airT >= 9) airT = 0;   // (thrown up by something: a vent, the Geyser, the lava)
      // Where he wants to go: the keys, the way the camera looks.
      const f = (inp.push ? 1 : 0) - (inp.brake ? 1 : 0), r = -inp.steer;
      fw.set(Math.sin(yaw), 0, Math.cos(yaw)); rt.set(-fw.z, 0, fw.x);
      wish.copy(fw).multiplyScalar(f).addScaledVector(rt, r);
      const n = wish.length();
      if (n > 1) wish.divideScalar(n);
      sprint = inp.drift && f > 0 && !aiming && phase !== 'on';
      back = f < 0 && r === 0 && !aiming;
      const pace = aiming ? AFOOT.aimed : sprint ? AFOOT.run : back ? AFOOT.back : AFOOT.walk;
      if (s.grounded || n > 0.1) {
        const a = damp(phase === 'off' ? AFOOT.coast : s.grounded ? AFOOT.accel : AFOOT.air, dt);
        v.x += (wish.x * pace - v.x) * a;
        v.z += (wish.z * pace - v.z) * a;
      }
      // A hop.
      const jump = inp.jumpHeld && !jumpWas;
      jumpWas = inp.jumpHeld;
      if (jump && s.grounded && !phase) { v.y = AFOOT.hop; s.grounded = false; airT = 0; playFootstep(0.9); }
      // Move him: along the ground (up what he can step onto, not into a wall or up a ramp's face), or through the air.
      let ground = NaN;   // (the height of the ground where he ends up: asked for once)
      const tryTo = (x, z) => {
        const h = heightAt(x, z), rise = h - s.pos.y;
        if (rise > AFOOT.stepUp) return false;
        if (s.grounded && rise > 0.02) {   // (going up: is it a slope he can walk up, or the face of something?)
          const dx = x - s.pos.x, dz = z - s.pos.z, d = Math.hypot(dx, dz) || 1;
          const ahead = heightAt(x + (dx / d) * 0.3, z + (dz / d) * 0.3) - h;
          if (ahead > 0.3 * AFOOT.steep) return false;
        }
        s.pos.x = x; s.pos.z = z; ground = h;
        return true;
      };
      const nx = s.pos.x + v.x * dt, nz = s.pos.z + v.z * dt;
      if (!tryTo(nx, nz)) {   // (along the wall, then, whichever way it lets him)
        if (tryTo(nx, s.pos.z)) v.z = 0;
        else if (tryTo(s.pos.x, nz)) v.x = 0;
        else v.x = v.z = 0;
      }
      const h = Number.isNaN(ground) ? heightAt(s.pos.x, s.pos.z) : ground;
      if (s.grounded) {
        v.y = 0;
        if (s.pos.y - h > 0.4) { s.grounded = false; airT = 0.3; }   // (walked off the edge of something: falling)
        else s.pos.y = h;
      } else {
        v.y -= g * dt;
        airT += dt;
        s.pos.y += v.y * dt;
        if (s.pos.y <= h) {
          s.pos.y = h; v.y = 0; s.grounded = true;
          playFootstep(Math.min(1.6, 0.7 + airT * 0.5));
          airT = 9; stride = 0;
        }
      }
      s.up.lerp(Y, damp(10, dt)).normalize();
      s.normal?.set?.(0, 1, 0);
      if (want > 0 && (want -= dt) > 0 && !phase && s.grounded) { want = 0; stepOn(); }
    },

    // A frame: the turn of him, his clips, his board (in place of model.update).
    pose(dt, at, aimPoint, gunUp, hidden, blinking) {
      // (waiting to step off until he lands)
      if (!on && want > 0) { if ((want -= dt) > 0 && canStepOff()) { want = 0; stepOff(); } }
      if (!on && !phase) return false;
      const v = s.vel, hs = Math.hypot(v.x, v.z);
      ready = gunUp ? 1.1 : Math.max(0, ready - dt);
      // Which way he faces: where he is going; where the camera looks, while he aims or shoots or backs off.
      const target = gunUp || aimingNow || back ? camYaw : hs > 0.5 ? Math.atan2(v.x, v.z) : face;
      face = wrap(face + wrap(target - face) * damp(gunUp || aimingNow ? 18 : 10, dt));
      s.fwd.set(Math.sin(face), 0, Math.cos(face));
      if (emoter && emoter.playing && hs > 0.8) emoter.stop();   // (an emote is for standing still)
      poseFoot(model, dt, at, face, { speed: hs, air: !s.grounded, airT: airT >= 9 ? 0 : airT, sprint: sprint && hs > AFOOT.walk * 0.8, back, ready, gunUp }, aimPoint, hidden, blinking);
      // Getting off and on: the step down from the deck, the turn from across it to square on, the board in the air.
      t += dt;
      if (phase === 'off') {
        const e = smooth(t / AFOOT.off);
        model.rider.position.y = lerp(riderY, 0, smooth(t / 0.22));
        model.rider.rotation.y = lerp(riderRot, 0, smooth(t / 0.3));
        B.wear(false);
        B.back.updateWorldMatrix(true, true);
        B.back.children[0].matrixWorld.decompose(p1, q1, sc);
        // (kicked up by its tail: it rises and turns over once as it goes up over his shoulder)
        B.fly.position.lerpVectors(p0, p1, e);
        B.fly.position.y += 0.55 * Math.sin(Math.PI * Math.min(1, e * 1.1));
        B.fly.quaternion.slerpQuaternions(q0, q1, e).multiply(qf.setFromAxisAngle(X, -Math.PI * 2 * smooth(t / (AFOOT.off * 0.85))));
        if (t >= AFOOT.off) { phase = null; B.fly.visible = false; B.wear(true); }
      } else if (phase === 'on') {
        const e = smooth(t / AFOOT.on);
        // (down off his back, round in front of him, wheels down, under his front foot)
        p1.copy(at).addScaledVector(s.fwd, 0.3 * (1 - e));
        p1.y += 0.142;
        q1.setFromAxisAngle(Y, face);
        B.fly.position.lerpVectors(p0, p1, e);
        B.fly.position.y += 0.25 * Math.sin(Math.PI * e);
        B.fly.quaternion.slerpQuaternions(q0, q1, e);
        model.rider.position.y = lerp(0, 0.1, smooth((t - AFOOT.on * 0.6) / (AFOOT.on * 0.4)));
        model.rider.rotation.y = lerp(0, STANCE, smooth((t - AFOOT.on * 0.5) / (AFOOT.on * 0.5)));
        if (t >= AFOOT.on) mount(true);
      } else {
        model.rider.position.y = 0;
        model.rider.rotation.y = 0;
        B.wear(true);
      }
      // His feet, on the ground.
      if (on && s.grounded && hs > 0.6) {
        const step = 1.0 + 0.2 * hs;
        if ((stride += hs * dt) >= step) { stride -= step; playFootstep(sprint ? 0.95 : 0.55); }
      }
      return true;
    },
    // In a cutscene that leaves him where he is (a costume found): kept standing, rather than let go limp.
    hold(dt) {
      if (!on) return;
      poseFoot(model, dt, s.pos, face, { speed: 0, air: false, airT: 0, sprint: false, back: false, ready: 0, gunUp: false }, null);
      model.rider.position.y = 0; model.rider.rotation.y = 0;
    },
    show(visible) { hint.classList.toggle('hidden', !visible); },
    // A cutscene that has him on his feet (the way into the lift): walking at `speed` (0: stood), facing `face`, his
    // board on his back. cineEnd() puts it back under him.
    cine(dt, pos, faceAt, speed) {
      if (!B.back) B.make();
      B.wear(true); if (B.fly) B.fly.visible = false;
      poseFoot(model, dt, pos, faceAt, { speed, air: false, airT: 0, sprint: false, back: false, ready: 0, gunUp: false, plain: true }, null);
      model.rider.position.y = 0; model.rider.rotation.y = 0;
    },
    cineEnd() { if (on || phase) return; B.drop(); model.board.visible = true; },
  };
  return api;
}

// A friend on foot (their state says so): posed the same, their board on their back.
export function poseFriendAfoot(g, dt, s) {
  const k = g.model;
  g.afootBoards ||= boards(k);
  const B = g.afootBoards;
  if (!B.back) B.make();
  B.wear(true);
  const face = Math.atan2(s.fx, s.fz), hs = Math.hypot(s.vx, s.vz);
  poseFoot(k, dt, g.pos, face, { speed: hs, air: !s.ground, airT: s.ground ? 0 : 0.4, sprint: hs > AFOOT.walk + 0.8, back: false, ready: s.gun ? 1 : 0, gunUp: !!s.gun }, g.aim, false, s.safe);
  k.rider.position.y = 0; k.rider.rotation.y = 0;
}
export function friendOnBoard(g) {
  if (!g.afootBoards) return;
  g.afootBoards.drop();
  g.model.board.visible = true;
}
