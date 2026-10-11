// Third-person camera. Normally it chases the board: behind the heading,
// lagging on turns, pulling back and widening with speed. Hold aim (right
// mouse) and it moves in over the shoulder, zooms, and stops following the
// board so your aim stays put while you carve. The mouse wheel zooms in and out.
import { Vector3, MathUtils } from 'three';
import { config } from '../config.js';
import { heightAt } from '../world/terrain.js';

const lerp = (a, b, t) => a + (b - a) * t;
const damp = (rate, dt) => 1 - Math.exp(-rate * dt);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const look = new Vector3();
const rad = MathUtils.degToRad;

export class ChaseCamera {
  constructor(camera) {
    this.camera = camera;
    this.focus = new Vector3();   // smoothed point we orbit
    this.yaw = 0;                 // smoothed heading we sit behind
    this.aimYaw = 0;              // mouse offsets
    this.aimPitch = 0;
    this.aim = 0;                 // 0..1 blend into the over-the-shoulder view
    this.scope = 0;               // 0..1 blend into looking down a scope
    this.idle = 0;                // seconds since the mouse or the gun was last used
    this.zoom = 1;                // mouse-wheel zoom: multiplies the camera distance (eases toward zoomTarget)
    this.zoomTarget = 1;
    this.fov = config.camera.fov;
    this.dip = 0;                 // landing thump
    this.shake = 0;
  }

  snap(skater) {
    this.focus.copy(skater.pos);
    this.yaw = Math.atan2(skater.fwd.x, skater.fwd.z);
    this.aimYaw = this.aimPitch = 0;
  }

  // Mouse wheel: clicks > 0 pulls the camera back, < 0 brings it in.
  zoomBy(clicks) {
    const c = config.camera;
    this.zoomTarget = MathUtils.clamp(this.zoomTarget * (1 + c.zoomStep) ** clicks, c.zoomMin, c.zoomMax);
  }

  // scoped: aiming with a scoped gun (the view goes to Kirky's eye and zooms right in).
  // firing: the trigger is held (so the view holds still in the world, like when aiming).
  update(dt, skater, target, mouseDX, mouseDY, aiming, scoped = false, firing = false) {
    const c = config.camera;
    const speed01 = Math.min(1, skater.speed / config.skate.maxSpeed);
    this.aim = lerp(this.aim, aiming ? 1 : 0, damp(12, dt));
    this.scope = lerp(this.scope, scoped ? 1 : 0, damp(scoped ? 9 : 16, dt));

    const sens = c.mouseSensitivity * lerp(lerp(1, c.aimSensitivity, this.aim), c.scopeSensitivity, this.scope);
    this.aimYaw = wrap(this.aimYaw - mouseDX * sens);
    this.aimPitch = MathUtils.clamp(this.aimPitch + mouseDY * sens, -0.9, 0.9);

    // The mouse can look anywhere, all the way round, whether or not you're aiming.
    // While you're aiming or shooting, the view holds still in the world as the board
    // turns under you. Leave the mouse and the gun alone for a moment and the view
    // drifts back behind the board.
    const holding = aiming || firing;
    if (holding || mouseDX !== 0 || mouseDY !== 0) this.idle = 0;
    else this.idle += dt;

    // Swing lazily behind the heading (ignore it when the board points straight up/down).
    // Not in the air: spinning a 360 turns the board, not the view.
    const { fwd } = skater;
    if ((skater.grounded || skater.grinding) && fwd.x * fwd.x + fwd.z * fwd.z > 0.1) {
      const step = wrap(Math.atan2(fwd.x, fwd.z) - this.yaw) * damp(c.yawLag, dt);
      this.yaw += step;
      if (holding) this.aimYaw = wrap(this.aimYaw - step);   // cancel it out: keep pointing where you were pointing
    }
    if (this.idle > c.recenterDelay) {
      this.aimYaw *= 1 - damp(c.aimRecenter, dt);
      this.aimPitch *= 1 - damp(c.aimRecenter, dt);
    }

    // Follow the board; height follows more slowly so jumps read as jumps.
    const kxz = damp(c.followLag, dt), ky = damp(c.followLagY, dt);
    this.focus.x = lerp(this.focus.x, target.x, kxz);
    this.focus.z = lerp(this.focus.z, target.z, kxz);
    this.focus.y = lerp(this.focus.y, target.y, ky);

    const yaw = this.yaw + this.aimYaw;
    // The camera orbits at `elevation` but looks out past the rider toward the
    // horizon, so the crosshair lands on what's ahead rather than on your back.
    const pitch = rad(c.pitch) + this.aimPitch;
    const elevation = Math.max(pitch, -0.08);
    const viewPitch = rad(c.viewTilt) - pitch;   // + = looking up
    this.zoom = lerp(this.zoom, this.zoomTarget, damp(12, dt));
    const dist = lerp(lerp(lerp(c.distance, c.distanceFast, speed01), c.aimDistance, this.aim) * this.zoom, -0.35, this.scope);   // scoped: just in front of his face
    // Over-the-shoulder: slide the camera and its look point sideways together.
    const shoulder = lerp(c.aimShoulder * this.aim, 0.12, this.scope), rx = -Math.cos(yaw) * shoulder, rz = Math.sin(yaw) * shoulder;

    const cam = this.camera;
    cam.position.set(
      this.focus.x + rx - Math.sin(yaw) * Math.cos(elevation) * dist,
      this.focus.y + lerp(c.lookHeight, 1.58, this.scope) + Math.sin(elevation) * dist,
      this.focus.z + rz - Math.cos(yaw) * Math.cos(elevation) * dist);

    // Stay above the ground.
    cam.position.y = Math.max(cam.position.y, heightAt(cam.position.x, cam.position.z) + 0.5);

    this.dip *= 1 - damp(9, dt);
    this.shake *= 1 - damp(6, dt);
    cam.position.y -= this.dip;
    cam.position.x += (Math.random() - 0.5) * this.shake;
    cam.position.y += (Math.random() - 0.5) * this.shake;

    look.set(Math.sin(yaw) * Math.cos(viewPitch), Math.sin(viewPitch), Math.cos(yaw) * Math.cos(viewPitch)).add(cam.position);
    cam.lookAt(look);

    const speedFov = lerp(c.fov, c.fovFast, Math.pow(speed01, 1.3));
    this.fov = lerp(this.fov, lerp(lerp(speedFov, c.aimFov, this.aim), c.scopeFov, this.scope), damp(10, dt));
    cam.fov = this.fov;
    cam.updateProjectionMatrix();
  }

  onLand(impact) { this.dip = Math.min(0.7, impact * config.camera.landingDip); }
  onSloppy() { this.shake = config.camera.sloppyShake; }
  onShot(kick = 1) {
    this.shake = Math.max(this.shake, config.gun.recoil * kick * lerp(1, 0.25, this.scope));   // (shake is magnified by the zoom, so tone it down when scoped)
    this.fov += kick * lerp(0.6, 0.9, this.scope);   // the view punches out for an instant
  }
}
