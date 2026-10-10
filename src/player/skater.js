// Kinematic skating controller. No rendering here: just position, velocity,
// board orientation and the rules for rolling, jumping, tricks, rails and landing.
import { Vector3 } from 'three';
import { config } from '../config.js';
import { heightAt, normalAt, railsNear, SPAWN } from '../world/terrain.js';
import { TRICKS } from './tricks.js';
import { stats } from './stats.js';

const UP = new Vector3(0, 1, 0);
const TAU = Math.PI * 2;
const rad = (d) => (d * Math.PI) / 180;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const clamp01 = (t) => clamp(t, 0, 1);

// scratch vectors
const side = new Vector3(), dir = new Vector3(), target = new Vector3();
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
    this.steer = 0;
    this.drifting = false;
    this.kickTimer = 0;     // time until the next kick-push is allowed
    this.sinceKick = 9;     // for the kick animation
    this.spin = 0;          // total body spin since takeoff (radians)
    this.trick = null;      // board trick in progress (an entry of TRICKS)
    this.trickTime = 0;
    this.trickIndex = 0;    // which trick the button does next
    this.landed = [];       // tricks completed in this air
    this.rail = null;       // the rail we're grinding, if any
    this.railT = 0;         // distance along it
    this.railSpeed = 0;     // signed speed along it
    this.railCooldown = 0;
    this.grindDistance = 0;
  }

  get speed() { return this.vel.length(); }
  get grinding() { return this.rail !== null; }

  // inp: { steer (-1..1, + = left), push, kick, drift, brake, jumpHeld, jumpReleased, trickPressed }
  update(dt, inp) {
    this.prevPos.copy(this.pos);
    this.steer = inp.steer;
    this.drifting = inp.drift && this.grounded && !this.rail;
    this.kickTimer = Math.max(0, this.kickTimer - dt);
    this.railCooldown = Math.max(0, this.railCooldown - dt);
    this.sinceKick += dt;

    // Ollie: hold to charge, release to pop. Works on the ground and off rails.
    if (inp.jumpHeld) this.charge = Math.min(1, this.charge + dt / config.jump.chargeTime);
    if (inp.jumpReleased) {
      inp.jumpReleased = false;
      if (this.rail) this.leaveRail();
      if (this.sinceGround <= config.jump.coyoteTime) this.ollie();
      this.charge = 0;
    }

    // Trick button: in the air, start the next trick on the list.
    if (inp.trickPressed) {
      inp.trickPressed = false;
      if (!this.grounded && !this.rail && !this.trick) {
        this.trick = TRICKS[this.trickIndex++ % TRICKS.length];
        this.trickTime = 0;
        this.events.push({ type: 'trick', name: this.trick.name });
      }
    }

    if (this.rail) this.stepGrind(dt);
    else if (this.grounded) this.stepGround(dt, inp);
    else this.stepAir(dt);

    this.sinceGround = this.grounded || this.rail ? 0 : this.sinceGround + dt;

    const speed = this.vel.length();
    if (speed > config.skate.hardMaxSpeed) this.vel.multiplyScalar(config.skate.hardMaxSpeed / speed);
  }

  takeoff() {
    this.grounded = false;
    this.airTime = 0;
    this.spin = 0;
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
    this.vel.addScaledVector(dir, lerp(j.minSpeed, j.maxSpeed, this.charge));
    this.takeoff();
    this.sinceGround = Infinity;
    this.events.push({ type: 'ollie', charge: this.charge });
  }

  // ---- Ground ----------------------------------------------------------------

  stepGround(dt, inp) {
    const s = config.skate, g = config.physics.gravity;
    const { pos, vel, fwd, normal: n } = this;

    // Follow the surface: momentum is carried around curves.
    normalAt(pos.x, pos.z, vel.x, vel.z, n);
    redirect(vel, n);

    // Carve. Turn rate drops with speed.
    let turnRate = lerp(s.turnRateSlow, s.turnRateFast, clamp01(vel.length() / s.maxSpeed));
    if (this.drifting) turnRate *= s.driftTurnMult;   // powerslide: the board swings round faster than you change direction
    fwd.applyAxisAngle(n, this.steer * turnRate * dt);
    fwd.addScaledVector(n, -fwd.dot(n)).normalize();

    // Nearly stopped on a slope: swing the board to the fall line so you roll away.
    const speedNow = vel.length();
    if (speedNow < s.fallLineSpeed && n.y < 0.98) {
      target.set(0, -1, 0).addScaledVector(n, n.y).normalize();   // downhill along the surface
      if (target.dot(fwd) < 0) target.negate();
      fwd.lerp(target, clamp01((1 - n.y) * s.fallLineRate * dt * (1 - speedNow / s.fallLineSpeed)));
      fwd.addScaledVector(n, -fwd.dot(n)).normalize();
    }
    side.crossVectors(n, fwd);

    // Gravity along the slope. Wheels roll forwards freely, sideways hardly at all.
    vel.addScaledVector(fwd, -g * fwd.y * dt);
    vel.addScaledVector(side, -g * side.y * (this.drifting ? s.driftSideSlip : s.sideSlip) * dt);

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

    // Grip + friction. Grip rotates velocity toward the heading (keeping speed);
    // slipping sideways scrubs a little speed off.
    let speed = vel.length();
    if (speed > 1e-4) {
      dir.copy(vel).divideScalar(speed);
      const slip = Math.abs(dir.dot(side));
      target.copy(fwd).multiplyScalar(dir.dot(fwd) >= 0 ? 1 : -1);
      dir.lerp(target, 1 - Math.exp(-(this.drifting ? s.driftGrip : s.grip) * dt)).normalize();

      let decel = s.rollFriction + s.rollDrag * speed + (this.drifting ? s.driftScrub : s.gripScrub) * slip * speed;
      if (inp.brake) decel += s.brakeDecel;
      speed = Math.max(0, speed - decel * dt);
      vel.copy(dir).multiplyScalar(speed);
    }

    // Rolling backwards (e.g. after stalling on a ramp): flip stance.
    if (vel.dot(fwd) < -s.revertSpeed && !this.drifting) {
      fwd.negate();
      this.events.push({ type: 'revert' });
    }

    // Move, then decide: wall, still on the ground, or airborne.
    newPos.copy(pos).addScaledVector(vel, dt);
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

    vel.y -= config.physics.gravity * dt;
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
    const spin = this.steer * s.airTurnRate * dt;
    if (spin !== 0) {
      fwd.applyAxisAngle(UP, spin);
      up.applyAxisAngle(UP, spin);
      this.spin += spin;
    }

    // Level the board toward the surface we're about to land on.
    const t = s.airLevelLookahead;
    normalAt(pos.x + vel.x * t, pos.z + vel.z * t, 0, 0, tmpN);
    up.lerp(tmpN, 1 - Math.exp(-s.airLevelRate * dt)).normalize();
    fwd.addScaledVector(up, -fwd.dot(up));
    if (fwd.lengthSq() < 1e-6) fwd.set(vel.x, 0, vel.z).addScaledVector(up, -fwd.dot(up));
    fwd.normalize();

    newPos.copy(pos).addScaledVector(vel, dt);
    const h = heightAt(newPos.x, newPos.z);
    if (newPos.y > h) {
      pos.copy(newPos);
      this.tryCatchRail();
    } else if (h - newPos.y > s.stepHeight) {
      // Hit the side of something: keep falling straight down, and land if we reach the ground.
      this.hitWall(newPos);
      const ground = heightAt(pos.x, pos.z), y = pos.y + vel.y * dt;
      if (y <= ground) {
        pos.y = ground;
        this.land();
      } else pos.y = y;
    } else {
      pos.set(newPos.x, h, newPos.z);
      this.land();
    }
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
    let boost = spins * T.boostPerSpin;
    for (const t of this.landed) boost += t.boost;
    boost = Math.min(T.maxBoost, boost * T.boostScale);
    this.landed.length = 0;
    this.spin = 0;
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
    const upright = trick.ok && this.up.dot(n) >= Math.cos(rad(L.uprightAngle));
    let aligned = true;
    if (speed > L.minCheckSpeed) {
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
    } else {
      // Sloppy: no fall, but most of the momentum is gone. Point the board where we're going.
      vel.multiplyScalar(L.sloppySpeedKeep);
      if (speed > 1) fwd.copy(vel).normalize();
      this.events.push({ type: 'sloppy', impact });
    }
  }

  // ---- Rails -----------------------------------------------------------------

  // Coming down near a rail, moving roughly along it? Lock on.
  tryCatchRail() {
    const G = config.grind, { pos, vel } = this;
    if (this.railCooldown > 0 || vel.y > 1.5) return;
    for (const r of railsNear(pos.x, pos.z)) {
      const px = pos.x - r.ax, py = pos.y - r.ay, pz = pos.z - r.az;
      const t = px * r.dx + py * r.dy + pz * r.dz;
      if (t < 0 || t > r.len) continue;
      const offX = px - r.dx * t, offY = py - r.dy * t, offZ = pz - r.dz * t;
      if (Math.hypot(offX, offZ) > G.catchRadius || Math.abs(offY) > G.catchHeight) continue;
      const along = vel.x * r.dx + vel.y * r.dy + vel.z * r.dz;
      const flat = Math.hypot(vel.x, vel.z);
      if (Math.abs(along) < G.minSpeed || Math.abs(along) < flat * 0.5) continue;

      const trick = this.resolveTricks();
      this.rail = r;
      this.railT = t;
      this.railSpeed = Math.sign(along) * (flat + (trick.ok ? Math.min(trick.boost, Math.max(0, config.skate.maxSpeed - flat)) : 0));
      this.grindDistance = 0;
      this.events.push({ type: 'grind', trick: trick.ok ? trick.name : '', boost: trick.ok ? trick.boost : 0 });
      this.stepGrind(0);
      return;
    }
  }

  stepGrind(dt) {
    const G = config.grind, r = this.rail;
    let v = this.railSpeed;
    const sign = v < 0 ? -1 : 1;
    v -= config.physics.gravity * r.dy * dt;                    // sloped rails pull you downhill
    if (Math.abs(v) < G.maxSpeed) v += sign * G.accel * dt;     // grinding builds speed
    this.railSpeed = v;
    this.railT += v * dt;
    this.grindDistance += Math.abs(v) * dt;

    const t = clamp(this.railT, 0, r.len);
    this.pos.set(r.ax + r.dx * t, r.ay + r.dy * t, r.az + r.dz * t);
    this.vel.set(r.dx * v, r.dy * v, r.dz * v);
    this.fwd.set(r.dx * sign, r.dy * sign, r.dz * sign);
    this.up.copy(UP).addScaledVector(this.fwd, -this.fwd.y).normalize();

    if (this.railT < 0 || this.railT > r.len) this.leaveRail();
  }

  leaveRail() {
    this.events.push({ type: 'grindEnd', distance: this.grindDistance });
    this.rail = null;
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

    const into = -this.vel.dot(wallN);
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
