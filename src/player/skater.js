// Kinematic skating controller. No rendering here: just position, velocity,
// board orientation and the rules for rolling, jumping, tricks, rails and landing.
import { Vector3 } from 'three';
import { config } from '../config.js';
import { heightAt, normalAt, railsNear, SPAWN, pipeAt, airFloorAt } from '../world/terrain.js';
import { PIPE_R, PIPE_FROM, EDGE } from '../world/catacombs.js';
import { TRICKS } from './tricks.js';
import { stats } from './stats.js';

const UP = new Vector3(0, 1, 0);

// The grinds. While on a rail the movement keys choose one: forward for the nose, back for the tail,
// left and right to turn the board across the rail, and the corners for the four in between.
// GRIND_KEYS[forward ? 1 : back ? 2 : 0][left ? 1 : right ? 2 : 0] is an index into GRINDS (and into the
// poses in skaterModel.js, which are in the same order).
export const GRINDS = ['50-50', 'Nosegrind', '5-0', 'Boardslide', 'Tailslide', 'Crooked grind', 'Noseslide', 'Smith grind', 'Feeble grind'];
const GRIND_KEYS = [[0, 3, 4], [1, 5, 6], [2, 7, 8]];
const TAU = Math.PI * 2;
const rad = (d) => (d * Math.PI) / 180;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const clamp01 = (t) => clamp(t, 0, 1);

// scratch vectors
const side = new Vector3(), dir = new Vector3(), target = new Vector3(), pn = new Vector3(), pt = new Vector3();
const newPos = new Vector3(), wallN = new Vector3(), tmpN = new Vector3();

// Lay a velocity onto the plane with normal n, keeping its speed (unless it
// was mostly heading into the plane, which is an impact, not a carve).
function redirect(vel, n) {
  const speed = vel.length();
  if (speed < 1e-6) return;
  vel.addScaledVector(n, -vel.dot(n));
  const tangential = vel.length();
  if (tangential > speed * 0.6) vel.multiplyScalar(speed / tangential);
}

export class Skater {
  constructor() {
    this.pos = new Vector3();
    this.prevPos = new Vector3();
    this.vel = new Vector3();
    this.fwd = new Vector3();     // board heading (unit, tangent to the board)
    this.up = new Vector3();      // board up (smoothed, for visuals + landing check)
    this.normal = new Vector3();  // true ground normal while grounded
    this.events = [];             // {type: 'ollie' | 'kick' | 'trick' | 'land' | 'sloppy' | 'grind' | 'grindEnd' | 'revert', ...} drained by main.js
    this.respawn();
  }

  respawn() {
    this.pos.set(SPAWN.x, heightAt(SPAWN.x, SPAWN.z), SPAWN.z);
    this.prevPos.copy(this.pos);
    this.vel.set(0, 0, 0);
    this.fwd.set(0, 0, -1);
    this.up.set(0, 1, 0);
    this.normal.set(0, 1, 0);
    this.grounded = true;
    this.airTime = 0;
    this.sinceGround = 0;   // time since last ground/rail contact (Infinity after an ollie)
    this.charge = 0;        // ollie charge 0..1
    this.steer = 0;         // how far he is leaning into a turn, -1..1 (it builds: see config.skate.carveIn)
    this.steerRaw = 0;      // what the keys are asking for
    this.carveHeld = 0;     // seconds this carve has been held
    this.chargeHeld = 0;    // seconds Space has been held
    this.manual = false;    // up on the back wheels
    this.manualDistance = 0;
    this.slideDistance = 0; // metres of this powerslide so far
    this.slideSide = 1;     // which way the board last went sideways
    this.recover = 0;       // seconds left of swinging back in line after a slide
    this.sinceLand = 9;     // seconds since a clean landing (for reverts)
    this.revertT = 9;       // seconds since a revert (the model spins him)
    this.balance = 0;       // on a rail: how far he is tipping, -1..1 (+ = to his left)
    this.balanceV = 0; this.balanceWind = 0; this.balanceTime = 0; this.windTime = 0;
    this.drifting = false;
    this.kickTimer = 0;     // time until the next kick-push is allowed
    this.sinceKick = 9;     // for the kick animation
    this.spin = 0;          // total body spin since takeoff (radians)
    this.flip = 0;          // total front (+) / back (-) flip since takeoff (radians)
    this.trick = null;      // board trick in progress (an entry of TRICKS)
    this.trickTime = 0;
    this.trickIndex = 0;    // which trick the button does next
    this.landed = [];       // tricks completed in this air
    this.ceiling = false;   // riding the pipe above its lip: a wall past vertical, or the roof (the Catacombs)
    this.pipeSide = 0; this.pipeAngle = 0; this.pipeX = 0; this.pipeEntry = 0; this.pipeCooldown = 0; this.roofed = false;
    this.offRoof = false;   // falling from it
    this.ceilingDistance = 0;
    this.rail = null;       // the rail we're grinding, if any
    this.railT = 0;         // distance along it
    this.railSpeed = 0;     // signed speed along it
    this.railCooldown = 0;
    this.grindDistance = 0;
    this.grindStyle = 0;    // which of GRINDS
    this.styleHeld = 0;     // how long it has been held
    this.styleDone = new Set();   // the grinds already counted since you were last on the ground
    this.clearOfRails = false;   // jumped clear of a rail on purpose: no catching one until you have touched the ground
    this.hop = null;        // { rail, t, v }: you ollied off a rail and are still over it; you will come down on it
  }

  get speed() { return this.vel.length(); }
  get grinding() { return this.rail !== null; }

  // inp: { steer (-1..1, + = left), push, kick, drift, brake, jumpHeld, jumpReleased, trickPressed }
  update(dt, inp) {
    this.prevPos.copy(this.pos);
    // Carving: the lean builds toward what the keys ask for, and bites harder the longer it is held.
    {
      const want = inp.steer, C = config.skate, building = Math.abs(want) > Math.abs(this.steer) || want * this.steer < 0;
      this.steer += (want - this.steer) * (1 - Math.exp(-(building ? C.carveIn : C.carveOut) * dt));
      this.carveHeld = want !== 0 && want === this.steerRaw ? this.carveHeld + dt : 0;
      this.steerRaw = want;
      if (want) this.slideSide = want;
    }
    this.sinceLand += dt;
    this.revertT += dt;
    // W/S flip you in the air, but not if you were already holding them when you left
    // the ground (W is how you roll): let go and press again once you're airborne.
    if (this.grounded || this.rail) { this.carriedW = inp.push; this.carriedS = inp.brake; }
    else { this.carriedW &&= inp.push; this.carriedS &&= inp.brake; }
    this.flipInput = (inp.push && !this.carriedW ? 1 : 0) - (inp.brake && !this.carriedS ? 1 : 0);
    this.drifting = inp.drift && this.grounded && !this.rail;
    this.kickTimer = Math.max(0, this.kickTimer - dt);
    this.railCooldown = Math.max(0, this.railCooldown - dt);
    this.pipeCooldown = Math.max(0, this.pipeCooldown - dt);
    this.sinceKick += dt;

    // Ollie: hold to charge, release to pop. Works on the ground and off rails.
    if (inp.jumpHeld) { this.charge = Math.min(1, this.charge + dt / config.jump.chargeTime); this.chargeHeld += dt; }
    if (inp.jumpReleased) {
      inp.jumpReleased = false;
      this.popped = this.popWindow;   // (let go at the right moment: see ollie)
      this.chargeHeld = 0;
      // Off a rail you hop: you stay over it and come back down on it (hold the powerslide key to jump clear).
      const from = this.rail && !inp.drift ? { rail: this.rail, t: this.railT, v: this.railSpeed } : null;
      const clear = this.rail && !from ? this.rail : null;
      if (this.rail) this.leaveRail();
      if (clear) this.pushOff(clear);
      if (this.ceiling) this.dropCeiling();   // (jump lets go of the roof)
      else if (this.sinceGround <= config.jump.coyoteTime) { this.ollie(); this.hop = from; }
      this.charge = 0;
      this.popped = false;
    }

    // Trick button: in the air, start the next trick on the list.
    if (inp.trickPressed) {
      inp.trickPressed = false;
      if (!this.grounded && !this.rail && !this.ceiling && !this.trick) {
        this.trick = TRICKS[this.trickIndex++ % TRICKS.length];
        this.trickTime = 0;
        this.events.push({ type: 'trick', name: this.trick.name });
      }
    }

    // A revert: Shift, tapped just as you land. He comes round with the board (it counts; it changes nothing else).
    if (this.grounded && !this.rail && inp.drift && !this.driftHeld && this.sinceLand < config.manual.revertWindow && this.vel.length() > 3) {
      this.sinceLand = 9;
      this.revertT = 0;
      this.events.push({ type: 'revertTrick' });
    }
    // A manual: E held on the ground, for as long as he keeps moving.
    {
      const up = this.grounded && !this.rail && !this.ceiling && inp.trickHeld && !this.drifting && this.vel.length() > config.manual.minSpeed;
      if (up && !this.manual) { this.manual = true; this.manualDistance = 0; }
      else if (!up && this.manual) this.endManual();
      if (this.manual) this.manualDistance += this.vel.length() * dt;
    }
    // The end of a powerslide: it is worth what it covered.
    if (this.slideDistance > 0 && !this.drifting) { this.events.push({ type: 'slideEnd', distance: this.slideDistance }); this.slideDistance = 0; }
    // The powerslide key, pressed while on a rail, steps off it.
    if (this.rail && inp.drift && !this.driftHeld) { const r = this.rail; this.leaveRail(); this.pushOff(r); }
    this.driftHeld = inp.drift;
    if (this.hop && (inp.drift || this.grounded || this.rail || this.ceiling)) this.hop = null;
    if (this.grounded) { this.styleDone.clear(); this.clearOfRails = false; }
    if (this.rail) this.stepGrind(dt, inp);
    else if (this.ceiling) this.stepPipe(dt, inp);
    else if (this.grounded) this.stepGround(dt, inp);
    else this.stepAir(dt);

    this.sinceGround = this.grounded || this.rail ? 0 : this.sinceGround + dt;

    const speed = this.vel.length();
    if (speed > config.skate.hardMaxSpeed) this.vel.multiplyScalar(config.skate.hardMaxSpeed / speed);
  }

  // Is this the moment to let go of Space? (See config.jump.popFrom.)
  get popWindow() { const J = config.jump; return this.chargeHeld >= J.chargeTime * J.popFrom && this.chargeHeld <= J.chargeTime * J.popTo; }

  endManual() {
    this.manual = false;
    this.events.push({ type: 'manualEnd', distance: this.manualDistance });
  }

  takeoff() {
    if (this.manual) this.endManual();
    this.grounded = false;
    this.airTime = 0;
    this.spin = 0;
    this.flip = 0;
    this.trick = null;
    this.landed.length = 0;
  }

  // 0..1 through the current board trick (0 when there isn't one).
  get trickProgress() { return this.trick ? Math.min(1, this.trickTime / (this.trick.time / config.tricks.speed)) : 0; }

  ollie() {
    const j = config.jump;
    dir.copy(UP).lerp(this.grounded ? this.normal : UP, j.normalBlend).normalize();
    const vn = this.vel.dot(dir);
    if (vn < 0) this.vel.addScaledVector(dir, -vn);
    const perfect = !!this.popped;
    this.popped = false;
    this.vel.addScaledVector(dir, lerp(j.minSpeed, j.maxSpeed, this.charge) * (perfect ? j.popBoost : 1));
    this.takeoff();
    this.sinceGround = Infinity;
    this.events.push({ type: 'ollie', charge: this.charge, perfect });
  }

  // ---- Ground ----------------------------------------------------------------

  stepGround(dt, inp) {
    const s = config.skate, g = config.physics.gravity * stats.gravity;
    const { pos, vel, fwd, normal: n } = this;

    // Follow the surface: momentum is carried around curves.
    normalAt(pos.x, pos.z, vel.x, vel.z, n);
    redirect(vel, n);

    // Carve. Turn rate drops with speed.
    const turnRate = lerp(s.turnRateSlow, s.turnRateFast, clamp01(vel.length() / s.maxSpeed)), going = vel.length();
    if (going > 1) dir.copy(vel).divideScalar(going);
    if (this.drifting && going > 1) {
      // Powerslide: the board is thrown round sideways (the way you are steering, or the way it last went) and held
      // there, no further than slideMax from the way you are travelling.
      target.copy(fwd).applyAxisAngle(n, (this.steerRaw || this.slideSide) * s.slideTurn * dt);
      if (target.dot(dir) >= Math.cos(s.slideMax) || target.dot(dir) > fwd.dot(dir)) fwd.copy(target);
      this.recover = s.slideRecover;
      if (going > s.slideMinSpeed && Math.abs(fwd.dot(dir)) < 0.85) this.slideDistance += going * dt;
    } else if (this.recover > 0 && going > 1) {
      // ...and let go: it swings back to point where you are going.
      this.recover -= dt;
      fwd.lerp(target.copy(dir).multiplyScalar(fwd.dot(dir) >= 0 ? 1 : -1), 1 - Math.exp(-(4 / s.slideRecover) * dt));
    } else {
      this.recover = 0;
      fwd.applyAxisAngle(n, this.steer * turnRate * (1 + s.carveBite * clamp01(this.carveHeld / s.carveBiteTime)) * dt);
    }
    fwd.addScaledVector(n, -fwd.dot(n)).normalize();

    // Stopped, with nothing held: he puts a foot down and stays where he is, however the ground tilts (short of a
    // ramp's steep face: there he rolls back down, as he should). Any of roll, push or brake and he is off again.
    const speedNow = vel.length();
    const hold = !inp.push && !inp.kick && !inp.brake && !this.drifting && n.y > s.parkSlope && speedNow < s.parkSpeed;
    if (hold) vel.set(0, 0, 0);
    // Nearly stopped on a slope: swing the board to the fall line so you roll away.
    if (!hold && speedNow < s.fallLineSpeed && n.y < 0.98) {
      target.set(0, -1, 0).addScaledVector(n, n.y).normalize();   // downhill along the surface
      if (target.dot(fwd) < 0) target.negate();
      fwd.lerp(target, clamp01((1 - n.y) * s.fallLineRate * dt * (1 - speedNow / s.fallLineSpeed)));
      fwd.addScaledVector(n, -fwd.dot(n)).normalize();
    }
    side.crossVectors(n, fwd);

    // Gravity along the slope. Wheels roll forwards freely, sideways hardly at all.
    if (!hold) {
      vel.addScaledVector(fwd, -g * fwd.y * dt);
      vel.addScaledVector(side, -g * side.y * (this.drifting ? s.driftSideSlip : s.sideSlip) * dt);
      // Pumping: crouched on the way down a slope, he pushes into it.
      const sp = vel.length();
      if (inp.jumpHeld && !this.drifting && sp > 2 && sp < s.maxSpeed && vel.y < -0.4) vel.addScaledVector(vel, (s.pumpAccel * (-vel.y / sp) * dt) / sp);
    }

    // Roll (W): gentle, steady acceleration up to cruising speed.
    const vf = Math.max(0, vel.dot(fwd)), top = s.pushMaxSpeed * stats.topSpeed;
    if (inp.push && !this.drifting) vel.addScaledVector(fwd, s.pushAccel * Math.max(0, 1 - vf / (s.cruiseSpeed * stats.topSpeed)) * dt);
    // Push (Q): one kick per press, each a burst of speed. This is how you set your
    // pace: tap for a little, keep tapping (or hold) for top speed.
    if (inp.kick && this.kickTimer <= 0 && !this.drifting) {
      vel.addScaledVector(fwd, clamp(top - vf, 0, s.kickImpulse));
      this.kickTimer = s.kickInterval;
      this.sinceKick = 0;
      this.events.push({ type: 'kick' });
    }

    // S: brake while rolling forwards; once stopped, keep holding it to roll backwards.
    const along = vel.dot(fwd);   // + = rolling forwards, - = backwards
    const reversing = inp.brake && along < 0.6 && !this.drifting;
    if (reversing) vel.addScaledVector(fwd, -s.reverseAccel * Math.max(0, 1 + along / s.reverseSpeed) * dt);

    // Grip + friction. Grip rotates velocity toward the heading (keeping speed);
    // slipping sideways scrubs a little speed off.
    let speed = vel.length();
    if (speed > 1e-4) {
      dir.copy(vel).divideScalar(speed);
      const slip = Math.abs(dir.dot(side));
      target.copy(fwd).multiplyScalar(dir.dot(fwd) >= 0 ? 1 : -1);
      dir.lerp(target, 1 - Math.exp(-(this.drifting ? s.driftGrip : s.grip) * dt)).normalize();

      let decel = s.rollFriction + s.rollDrag * speed + (this.drifting ? s.driftScrub : s.gripScrub) * slip * speed;
      if (inp.brake && !reversing) decel += s.brakeDecel;
      if (this.manual) decel += config.manual.drag;
      speed = Math.max(0, speed - decel * dt);
      vel.copy(dir).multiplyScalar(speed);
    }

    // Rolling backwards without meaning to (e.g. after stalling on a ramp): flip stance.
    // Not while S is held: then you're reversing on purpose and keep facing forwards.
    if (vel.dot(fwd) < -s.revertSpeed && !this.drifting && !inp.brake) {
      fwd.negate();
      this.events.push({ type: 'revert' });
    }

    // Move, then decide: wall, still on the ground, or airborne.
    newPos.copy(pos).addScaledVector(vel, dt);
    if (this.rideOntoPipe(newPos)) return;   // (the Catacombs) up the wall past its lip: the pipe takes over
    const h = heightAt(newPos.x, newPos.z);
    if (h - newPos.y > s.stepHeight) {
      this.hitWall(newPos);
    } else {
      // How far gravity could pull us back onto the surface this step.
      const stickGap = 0.5 * g * n.y * s.groundStick * dt * dt + 0.0005;
      if (newPos.y - h <= stickGap) {
        pos.set(newPos.x, h, newPos.z);
      } else {
        pos.copy(newPos);   // the ground fell away: launch with our surface velocity
        this.takeoff();
      }
    }

    this.up.lerp(n, 1 - Math.exp(-s.alignRate * dt)).normalize();
  }

  // ---- Air -------------------------------------------------------------------

  stepAir(dt) {
    const s = config.skate;
    const { pos, vel, fwd, up } = this;
    this.airTime += dt;

    vel.y -= config.physics.gravity * stats.gravity * dt;
    vel.multiplyScalar(Math.max(0, 1 - s.airDrag * dt));

    // Board trick in progress?
    if (this.trick) {
      this.trickTime += dt;
      if (this.trickProgress >= 1) {
        this.landed.push(this.trick);
        this.trick = null;
      }
    }

    // A/D spin your body. It doesn't change where you're flying.
    const spin = this.steerRaw * s.airTurnRate * dt;
    if (spin !== 0) {
      fwd.applyAxisAngle(UP, spin);
      up.applyAxisAngle(UP, spin);
      this.spin += spin;
    }

    // W/S flip you forwards / backwards. (Only the model turns over: see skaterModel.js.)
    this.flip += this.flipInput * s.airFlipRate * dt;

    // Level the board toward the surface we're about to land on.
    const t = s.airLevelLookahead;
    normalAt(pos.x + vel.x * t, pos.z + vel.z * t, 0, 0, tmpN);
    up.lerp(tmpN, 1 - Math.exp(-s.airLevelRate * dt)).normalize();
    fwd.addScaledVector(up, -fwd.dot(up));
    if (fwd.lengthSq() < 1e-6) fwd.set(vel.x, 0, vel.z).addScaledVector(up, -fwd.dot(up));
    fwd.normalize();

    newPos.copy(pos).addScaledVector(vel, dt);
    if (this.hop && this.followHop(dt)) return;
    if (this.tryPipe(newPos)) return;   // into the pipe's wall above the lip, or its roof: ride it
    const h = airFloorAt(newPos.x, newPos.z);
    if (false) return;   // into the pipe's wall above the lip, or its roof: ride it
    if (newPos.y > h) {
      pos.copy(newPos);
      if (!this.hop) this.tryCatchRail(dt);
    } else if (h - newPos.y > s.stepHeight) {
      // Hit the side of something: keep falling straight down, and land if we reach the ground.
      this.hitWall(newPos);
      const ground = airFloorAt(pos.x, pos.z), y = pos.y + vel.y * dt;
      if (y <= ground) {
        pos.y = ground;
        this.land();
      } else pos.y = y;
    } else {
      pos.set(newPos.x, h, newPos.z);
      this.land();
    }
  }

  // ---- The full pipe (the Catacombs) -------------------------------------------
  // Above the lip, the tunnel's wall carries on round: up through vertical, over your head, across
  // the flat roof and down the far wall. Where you are on it is `pipeSide` (-1 / +1: on that wall's
  // curve, at `pipeAngle` round it from the floor; 0: on the roof, `pipeX` from the tunnel's middle)
  // and your z. You carve on it as on the ground; gravity is gentler than it should be, so the loop
  // can be made; past vertical you bleed speed, and drop off when you run out (or when you jump).

  // The pipe's surface where we are: pn points off it (into the tunnel), pt along it toward the roof (on the roof: +x).
  pipeFrame() {
    const s = this.pipeSide, a = this.pipeAngle;
    if (s === 0) { pn.set(0, -1, 0); pt.set(1, 0, 0); }
    else { pn.set(-s * Math.sin(a), Math.cos(a), 0); pt.set(s * Math.cos(a), Math.sin(a), 0); }
  }
  pipePlace(r) {
    const s = this.pipeSide, a = this.pipeAngle;
    if (s === 0) this.pos.set(r.x + this.pipeX, r.floor + 2 * PIPE_R, this.pos.z);
    else this.pos.set(r.x + s * (r.w + PIPE_R * Math.sin(a)), r.floor + PIPE_R * (1 - Math.cos(a)), this.pos.z);
  }

  // In the air, about to be at `p`: is that into the pipe's wall or roof? If so, we're riding it.
  tryPipe(p) {
    const r = pipeAt(p.z);
    if (!r) return false;
    const { vel } = this, c = config.skate, wait = this.pipeCooldown > 0;   // (just let go of it: don't grab it again unless we actually hit it)
    const off = p.x - r.x, side = off < 0 ? -1 : 1, d = Math.abs(off) - r.w, h = p.y - r.floor;
    if (d <= 0) {   // under the flat of the roof
      if (h < 2 * PIPE_R - (wait ? 0 : c.ceilingReach) || vel.y <= 0) return false;
      this.pipeSide = 0;
      this.pipeX = off;
    } else {        // out by a wall
      const rho = Math.hypot(d, h - PIPE_R), a = Math.atan2(d, PIPE_R - h);
      if (a < PIPE_FROM || rho < PIPE_R - (wait ? 0.02 : 0.35)) return false;   // below the lip (that's the ground's business), or not there yet
      if (rho < PIPE_R - 0.02 && vel.x * side * Math.sin(a) - vel.y * Math.cos(a) <= 0) return false;   // (near it, but moving away)
      this.pipeSide = side;
      this.pipeAngle = a;
    }
    this.pos.z = p.z;
    this.pipeFrame();
    vel.addScaledVector(pn, -vel.dot(pn));   // only the speed along the surface counts
    this.joinPipe(r);
    this.trick = null;       // (whatever you were doing on the way up is forgotten)
    this.landed.length = 0;
    this.spin = this.flip = 0;
    return true;
  }

  // Rolling up the wall, about to be at `p`: past the lip? Then carry on up the pipe with all your speed.
  rideOntoPipe(p) {
    const r = pipeAt(p.z);
    if (!r) return false;
    const off = p.x - r.x, side = off < 0 ? -1 : 1, { vel } = this;
    if (Math.abs(off) - r.w < EDGE - 0.02 || vel.x * side <= 0) return false;
    const speed = vel.length();
    this.pipeSide = side;
    this.pipeAngle = PIPE_FROM + 0.002;
    this.pos.z = p.z;
    this.pipeFrame();
    vel.addScaledVector(pn, -vel.dot(pn)).setLength(speed);
    this.grounded = false;
    this.airTime = 0;
    this.joinPipe(r);
    return true;
  }

  joinPipe(r) {
    const { vel, fwd } = this;
    this.roofed = this.pipeHigh = false;   // (pipeHigh: this ride has been past vertical, which is what scores)
    if (this.pipeSide === 0) this.onRoof();
    if (vel.lengthSq() < 0.25) vel.copy(pt).multiplyScalar(0.5);
    fwd.copy(vel).normalize();
    this.ceiling = true;
    this.pipeEntry = this.pipeSide;
    this.ceilingDistance = 0;
    this.pipePlace(r);
  }

  // The first time a ride reaches the roof: you set off across it at a decent speed, whatever you arrived with.
  onRoof() {
    if (this.roofed) return;
    this.roofed = true;
    const { vel, fwd } = this, want = config.skate.ceilingSpeed, speed = vel.length();
    if (speed < 4) vel.set(0, 0, (Math.abs(vel.z) > 0.5 ? vel.z : fwd.z) < 0 ? -want : want);   // straight up into it: off along the tunnel
    else if (speed < want) vel.multiplyScalar(want / speed);
    this.events.push({ type: 'ceiling' });
  }

  stepPipe(dt, inp) {
    const c = config.skate, { pos, vel, fwd, up } = this;
    let r = pipeAt(pos.z);
    if (!r) return this.dropCeiling();
    this.pipeFrame();

    // Carve, as on the ground.
    fwd.applyAxisAngle(pn, this.steerRaw * lerp(c.turnRateSlow, c.turnRateFast, clamp01(vel.length() / c.maxSpeed)) * dt);
    fwd.addScaledVector(pn, -fwd.dot(pn)).normalize();
    // Gravity along the wall; past vertical, speed drains away.
    let speed = vel.length();
    const overhead = this.pipeSide === 0 || this.pipeAngle > Math.PI / 2;
    this.pipeHigh ||= overhead;
    if (this.pipeSide !== 0) speed -= config.physics.gravity * stats.gravity * c.pipeGravity * Math.sin(this.pipeAngle) * fwd.dot(pt) * dt;
    if (overhead) speed -= (c.ceilingDrag + (inp.brake ? c.brakeDecel : 0)) * dt;
    // On the walls (not the roof) you can roll and push, as on the ground.
    if (this.pipeSide !== 0) {
      const top = c.pushMaxSpeed * stats.topSpeed;
      if (inp.push) speed += c.pushAccel * Math.max(0, 1 - Math.max(0, speed) / (c.cruiseSpeed * stats.topSpeed)) * dt;
      if (inp.kick && this.kickTimer <= 0) {
        speed += clamp(top - speed, 0, c.kickImpulse);
        this.kickTimer = c.kickInterval;
        this.sinceKick = 0;
        this.events.push({ type: 'kick' });
      }
    }
    if (speed < 0) { speed = -speed; fwd.negate(); }   // ran out of push on the way up: roll back down
    vel.copy(fwd).multiplyScalar(speed);

    // Move along the surface, from wall to roof to wall as it comes.
    const along = vel.dot(pt), vz = vel.z;
    let turned = along;   // the same speed, measured along the new surface's own direction
    pos.z += vz * dt;
    r = pipeAt(pos.z);
    if (this.pipeSide === 0) {
      this.pipeX += along * dt;
      if (Math.abs(this.pipeX) > r.w) {   // off the edge of the roof: onto that side's wall, heading down it
        const side = this.pipeX < 0 ? -1 : 1;
        this.pipeAngle = Math.PI - (Math.abs(this.pipeX) - r.w) / PIPE_R;
        this.pipeSide = side;
        turned = -side * along;
      }
    } else {
      this.pipeAngle += (along * dt) / PIPE_R;
      if (this.pipeAngle < PIPE_FROM) return this.pipeToGround(r);
      if (this.pipeAngle > Math.PI) {     // over the top: onto the roof, heading across it
        const side = this.pipeSide;
        this.pipeX = side * (r.w - (this.pipeAngle - Math.PI) * PIPE_R);
        this.pipeSide = 0;
        turned = -side * along;
      }
    }
    this.pipeFrame();
    vel.copy(pt).multiplyScalar(turned);
    vel.z = vz;
    if (this.pipeSide === 0) this.onRoof();
    if (vel.lengthSq() > 1e-6) fwd.copy(vel).normalize();
    this.pipePlace(r);
    this.ceilingDistance += speed * dt;
    up.lerp(pn, 1 - Math.exp(-16 * dt)).normalize();
    if ((this.pipeSide === 0 || this.pipeAngle > Math.PI / 2) && vel.length() < c.ceilingMinSpeed) this.dropCeiling();
  }

  // Back down a wall to its lip: the ground takes over again.
  pipeToGround(r) {
    const side = this.pipeSide, { pos, vel } = this;
    pos.x = r.x + side * (r.w + EDGE - 0.06);
    pos.y = heightAt(pos.x, pos.z);
    this.ceiling = false;
    this.grounded = true;
    this.airTime = 0;
    normalAt(pos.x, pos.z, vel.x, vel.z, this.normal);
    if (this.pipeHigh) this.events.push({ type: 'ceilingEnd', distance: this.ceilingDistance });
    if (this.roofed && this.pipeEntry !== 0 && this.pipeEntry !== side) this.events.push({ type: 'fullpipe' });   // up one wall, over, and down the other
  }

  // Let go of the pipe (too slow up there, or you jumped): you fall.
  dropCeiling() {
    if (!this.ceiling) return;
    this.pipeFrame();
    this.ceiling = false;
    this.offRoof = true;
    this.pipeCooldown = 0.4;
    this.airTime = 0;        // (a fresh fall: there's time to get a trick in on the way down)
    this.pos.addScaledVector(pn, 0.4);
    this.vel.addScaledVector(pn, 1);
    if (this.pipeHigh) this.events.push({ type: 'ceilingEnd', distance: this.ceilingDistance });
  }

  // What did we do in the air, and was the board back under our feet in time?
  resolveTricks() {
    const T = config.tricks;
    let ok = true;
    if (this.trick) {
      if (this.trickProgress >= T.landTolerance) this.landed.push(this.trick);   // close enough: caught it
      else ok = false;
      this.trick = null;
    }
    const spins = Math.floor((Math.abs(this.spin) + rad(T.spinTolerance)) / Math.PI);   // in 180s
    const names = this.landed.map((t) => t.name);
    if (spins > 0) names.push(`${spins * 180}`);
    // Flips only count whole: come down part-way round and the landing is sloppy.
    const turned = Math.abs(this.flip) / (Math.PI * 2), flips = Math.round(turned);
    if (Math.abs(turned - flips) * 360 > T.flipTolerance) ok = false;
    else if (flips > 0) names.push(`${['', '', 'Double ', 'Triple '][flips] ?? `${flips}x `}${this.flip > 0 ? 'frontflip' : 'backflip'}`);
    let boost = spins * T.boostPerSpin + (ok ? flips * T.boostPerFlip : 0);
    for (const t of this.landed) boost += t.boost;
    boost = Math.min(T.maxBoost, boost * T.boostScale);
    this.landed.length = 0;
    this.spin = 0;
    this.flip = 0;
    return { ok, name: names.join(' + '), boost };
  }

  land() {
    const L = config.landing;
    const { pos, vel, fwd, normal: n } = this;
    normalAt(pos.x, pos.z, vel.x, vel.z, n);

    // Only the speed along the surface survives: land on a downslope to keep it.
    const impact = -vel.dot(n);
    vel.addScaledVector(n, impact);
    this.grounded = true;

    fwd.addScaledVector(n, -fwd.dot(n));
    if (fwd.lengthSq() < 1e-6) fwd.copy(vel);
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, 1).addScaledVector(n, -n.z);
    fwd.normalize();

    const trick = this.resolveTricks();
    if (this.airTime < L.minAirTime) return;

    const speed = vel.length();
    // (Dropping off the roof, you come down however you come down: only a botched trick makes it sloppy.)
    const offRoof = this.offRoof;
    this.offRoof = false;
    const upright = trick.ok && (offRoof || this.up.dot(n) >= Math.cos(rad(L.uprightAngle)));
    let aligned = true;
    if (speed > L.minCheckSpeed && !offRoof) {
      const d = fwd.dot(vel) / speed;   // 1 = nose first, -1 = tail first, 0 = sideways
      if (Math.abs(d) < Math.cos(rad(L.maxAngle))) aligned = false;
      else if (d < 0) {
        if (L.allowFakie) fwd.negate();
        else aligned = false;
      }
    }

    if (upright && aligned) {
      // Clean: keep your speed, plus a boost for any tricks.
      // (Boosts fade out as you approach 100% speed, so tricks can't snowball forever.)
      const boost = Math.min((speed > L.minCheckSpeed ? L.cleanBoost : 0) + trick.boost, Math.max(0, config.skate.maxSpeed - speed));
      if (speed > 0.5) vel.multiplyScalar((speed + boost) / speed);
      else vel.addScaledVector(fwd, boost);
      this.events.push({ type: 'land', airTime: this.airTime, impact, trick: trick.name, boost: trick.boost });
      this.sinceLand = 0;
    } else {
      // Sloppy: no fall, but most of the momentum is gone. Point the board where we're going.
      vel.multiplyScalar(L.sloppySpeedKeep);
      if (speed > 1) fwd.copy(vel).normalize();
      this.events.push({ type: 'sloppy', impact });
    }
  }

  // ---- Rails -----------------------------------------------------------------

  // Coming down near a rail, moving roughly along it? Lock on.
  // (Rails are magnetic: within `pullRadius` you are drawn sideways onto the rail's line on the way down.)
  tryCatchRail(dt = 0) {
    const G = config.grind, { pos, vel } = this;
    if (this.railCooldown > 0 || this.clearOfRails) return;
    for (const r of railsNear(pos.x, pos.z)) {
      // (an `easy` rail, the Moon's rim and the ones hung from its dome: it reaches for you from twice as far, takes
      // you while you are still going up a little, and does not mind which way you were going, or how slowly: across
      // it will do. A `wide` one, the rim: from that far to either side of it, and from however high over it, going up
      // or coming down, you drift onto its line.)
      const reach = r.easy ? 2.1 : 1, rising = vel.y > (r.easy ? 4 : 1.5);
      if (rising && !r.wide) continue;
      const px = pos.x - r.ax, py = pos.y - r.ay, pz = pos.z - r.az;
      const t = px * r.dx + py * r.dy + pz * r.dz;
      if (t < 0 || t > r.len) continue;
      const offX = px - r.dx * t, offY = py - r.dy * t, offZ = pz - r.dz * t;
      const side = Math.hypot(offX, offZ);
      if (side > Math.max(G.pullRadius * reach, r.wide || 0)) continue;
      const along = vel.x * r.dx + vel.y * r.dy + vel.z * r.dz;
      const flat = Math.hypot(vel.x, vel.z);
      if (!r.easy && (Math.abs(along) < G.minSpeed || Math.abs(along) < flat * 0.35)) continue;
      if (!rising && side <= G.catchRadius * reach && Math.abs(offY) <= G.catchHeight * reach) {
        // (which way along it: the way you were going. Came at an easy one square on: the way it runs (`flow`), or the way the board points.)
        const way = !r.easy || Math.abs(along) > Math.max(0.5, flat * 0.5) ? Math.sign(along) : r.flow || Math.sign(this.fwd.x * r.dx + this.fwd.z * r.dz) || 1;
        return this.lockOn(r, t, way * Math.max(flat, r.easy ? 9 : 0));
      }
      if (offY > 0 && offY < (r.wide ? 90 : 8)) {   // above it and a little to one side: slide over onto its line
        const k = 1 - Math.exp(-(r.wide ? 3 : G.pull) * dt);
        pos.x -= offX * k; pos.z -= offZ * k;
        vel.x -= (vel.x - r.dx * along) * k; vel.z -= (vel.z - r.dz * along) * k;
        if (!r.wide) return;   // (a wide one draws you from a long way over it: a rail hung between you and it may still take you)
      }
    }
  }

  // Onto the rail `r`, `t` metres along it, at `speed` (signed: which way along it).
  lockOn(r, t, speed) {
    const trick = this.resolveTricks(), fast = Math.abs(speed);
    this.rail = r;
    this.railT = t;
    this.railSpeed = (speed < 0 ? -1 : 1) * (fast + (trick.ok ? Math.min(trick.boost, Math.max(0, config.skate.maxSpeed - fast)) : 0));
    this.grindDistance = 0;
    this.grindStyle = 0;
    this.balance = this.balanceV = this.balanceWind = this.balanceTime = this.windTime = 0;
    this.hop = null;
    this.events.push({ type: 'grind', trick: trick.ok ? trick.name : '', boost: trick.ok ? trick.boost : 0 });
    this.stepGrind(0);
  }

  // In the air after hopping off a rail: carry on along it (round its bends, on to the next piece) however you
  // spin or flip, and land back on it. Returns true once you have. Off the end of the rail you are on your own.
  followHop(dt) {
    const H = this.hop, { vel } = this;
    let r = H.rail;
    H.v *= Math.max(0, 1 - config.skate.airDrag * dt);
    H.t += H.v * dt;
    while (H.t > r.len && r.next) { H.t -= r.len; r = r.next; }
    while (H.t < 0 && r.prev) { r = r.prev; H.t += r.len; }
    H.rail = r;
    if (H.t < 0 || H.t > r.len) { this.hop = null; return false; }
    const y = r.ay + r.dy * H.t;
    newPos.x = r.ax + r.dx * H.t; newPos.z = r.az + r.dz * H.t;
    vel.x = r.dx * H.v; vel.z = r.dz * H.v;
    if (newPos.y > y || this.airTime < 0.12) return false;
    this.pos.set(newPos.x, y, newPos.z);
    this.lockOn(r, H.t, H.v);
    return true;
  }

  stepGrind(dt, inp) {
    const G = config.grind, r = this.rail;
    // Which grind: the movement keys choose (see GRINDS). Each one counts once it has been held a moment.
    if (inp) {
      const style = GRIND_KEYS[inp.push ? 1 : inp.brake ? 2 : 0][inp.steer > 0.3 ? 1 : inp.steer < -0.3 ? 2 : 0];
      if (style !== this.grindStyle) { this.grindStyle = style; this.styleHeld = 0; }
      else if (style && (this.styleHeld += dt) >= G.styleHold && !this.styleDone.has(style)) {
        this.styleDone.add(style);
        this.events.push({ type: 'grindStyle', name: GRINDS[style] });
      }
    }
    // Balance: he tips (a lean feeds itself, and something is always nudging him), A / D lean him back. Over the edge
    // and he is off the rail. (An `easy` rail, the Moon's rim and the ones hung from its dome: he tips far more slowly.
    // They are long, and a long way up.)
    if (inp && dt > 0 && (this.balanceTime += dt) > G.balanceGrace) {
      const tips = r.easy ? 0.4 : 1;
      if ((this.windTime -= dt) <= 0) { this.windTime = 0.5 + Math.random() * 0.9; this.balanceWind = (Math.random() * 2 - 1) * G.balanceWind; }
      this.balanceV += ((G.balanceTip * this.balance + this.balanceWind) * tips + inp.steer * G.balancePush) * dt;
      this.balanceV *= Math.exp(-G.balanceDamp * dt);
      this.balance += this.balanceV * dt;
      if (Math.abs(this.balance) >= 1) {
        this.events.push({ type: 'bail' });
        this.balance = this.balanceV = 0;
        this.leaveRail();
        this.pushOff(r);
        return;
      }
    }
    let v = this.railSpeed;
    const sign = v < 0 ? -1 : 1;
    v -= config.physics.gravity * stats.gravity * r.dy * dt;                    // sloped rails pull you downhill
    if (Math.abs(v) < G.maxSpeed) v += sign * G.accel * dt;     // grinding builds speed
    else if (r.hung) v -= sign * (Math.abs(v) - G.maxSpeed) * (1 - Math.exp(-1.2 * dt));   // (a long way down a rail hung from the Moon's dome: the slope stops adding to it much past that)
    this.railSpeed = v;
    this.railT += v * dt;
    this.grindDistance += Math.abs(v) * dt;

    // Off the end of this piece and onto the next, if the rail carries on.
    let r2 = r;
    while (this.railT > r2.len && r2.next) { this.railT -= r2.len; r2 = r2.next; }
    while (this.railT < 0 && r2.prev) { r2 = r2.prev; this.railT += r2.len; }
    if (r2 !== r) return this.onto(r2);
    const t = clamp(this.railT, 0, r.len);
    this.pos.set(r.ax + r.dx * t, r.ay + r.dy * t, r.az + r.dz * t);
    this.vel.set(r.dx * v, r.dy * v, r.dz * v);
    this.fwd.set(r.dx * sign, r.dy * sign, r.dz * sign);
    this.up.copy(UP).addScaledVector(this.fwd, -this.fwd.y).normalize();

    if (this.railT < 0 || this.railT > r.len) this.leaveRail();
  }

  // The grind carries on along the next piece of a chained rail.
  onto(rail) {
    this.rail = rail;
    const t = clamp(this.railT, 0, rail.len), v = this.railSpeed, sign = v < 0 ? -1 : 1;
    this.pos.set(rail.ax + rail.dx * t, rail.ay + rail.dy * t, rail.az + rail.dz * t);
    this.vel.set(rail.dx * v, rail.dy * v, rail.dz * v);
    this.fwd.set(rail.dx * sign, rail.dy * sign, rail.dz * sign);
    this.up.copy(UP).addScaledVector(this.fwd, -this.fwd.y).normalize();
  }

  // Off a rail on purpose: nothing catches you again until you have touched the ground (or you would be drawn
  // straight back onto it), and a rail with a safe side (`exit`: the Moon's rim) sends you that way.
  pushOff(rail) {
    this.clearOfRails = true;
    if (!rail.exit) return;
    this.vel.x += rail.exit.x * config.grind.stepOff;
    this.vel.z += rail.exit.z * config.grind.stepOff;
  }

  leaveRail() {
    this.events.push({ type: 'grindEnd', distance: this.grindDistance });
    this.rail = null;
    this.grindStyle = 0;
    this.railCooldown = 0.25;
    this.takeoff();
    this.sinceGround = 0;   // you can still ollie off the end
  }

  // ---- Walls -----------------------------------------------------------------

  // Too tall to roll onto: stop the part of our velocity heading into it and
  // deflect along it. Never a fall.
  hitWall(at) {
    const s = config.skate;
    // Feel around us for where the wall is: the normal points away from it.
    wallN.set(0, 0, 0);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU, dx = Math.cos(a), dz = Math.sin(a);
      if (heightAt(this.pos.x + dx * 0.45, this.pos.z + dz * 0.45) - this.pos.y > s.stepHeight) {
        wallN.x -= dx;
        wallN.z -= dz;
      }
    }
    if (wallN.lengthSq() < 1e-6) wallN.set(this.pos.x - at.x, 0, this.pos.z - at.z);
    if (wallN.lengthSq() < 1e-6) wallN.set(-this.vel.x, 0, -this.vel.z);
    wallN.normalize();

    // A wall far too high to be anything but the edge of the world (the Moon's, which you cannot see): you are turned
    // along it and keep most of your speed, rather than stopping dead against nothing.
    const into = -this.vel.dot(wallN), flat = Math.hypot(this.vel.x, this.vel.z);
    if (into > 0 && flat > 1 && heightAt(at.x, at.z) - this.pos.y > 40) {
      let tx = this.vel.x + wallN.x * into, tz = this.vel.z + wallN.z * into, along = Math.hypot(tx, tz);
      if (along < flat * 0.15) { const turn = this.fwd.x * -wallN.z + this.fwd.z * wallN.x >= 0 ? 1 : -1; tx = -wallN.z * turn; tz = wallN.x * turn; along = 1; }   // (straight at it: go the way the board leans)
      const keep = (flat * (1 - (1 - s.edgeKeep) * Math.min(1, into / flat))) / along;   // (what is lost is in proportion to how squarely you met it: none at all running along it)
      this.vel.x = tx * keep + wallN.x * 0.5;
      this.vel.z = tz * keep + wallN.z * 0.5;
      this.fwd.set(tx, 0, tz).normalize();
      return;
    }
    if (into > 0) this.vel.addScaledVector(wallN, into * (1 + s.wallBounce));
    // Deflect the board along the wall too, or grip would steer us straight back into it.
    const facing = -this.fwd.dot(wallN);
    if (facing > 0) {
      this.fwd.addScaledVector(wallN, facing * (1 + s.wallBounce));
      if (this.fwd.lengthSq() < 1e-4) this.fwd.copy(wallN);
      this.fwd.normalize();
    }
    // Riding up into a vert wall: we keep going straight up.
    if (this.grounded && this.vel.dot(this.normal) > 0.5) this.takeoff();
  }
}
