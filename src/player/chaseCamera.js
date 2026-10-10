// Third-person camera. Normally it chases the board: behind the heading,
// lagging on turns, pulling back and widening with speed. Hold aim (right
// mouse) and it moves in over the shoulder, zooms, and stops following the
// board so your aim stays put while you carve.
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
    this.fov = config.camera.fov;
    this.dip = 0;                 // landing thump
    this.shake = 0;
  }

  snap(skater) {
    this.focus.copy(skater.pos);
    this.yaw = Math.atan2(skater.fwd.x, skater.fwd.z);
    this.aimYaw = this.aimPitch = 0;
  }

  update(dt, skater, target, mouseDX, mouseDY, aiming) {
    const c = config.camera;
    const speed01 = Math.min(1, skater.speed / config.skate.maxSpeed);
    this.aim = lerp(this.aim, aiming ? 1 : 0, damp(12, dt));

    const sens = c.mouseSensitivity * lerp(1, c.aimSensitivity, this.aim);
    this.aimYaw = wrap(this.aimYaw - mouseDX * sens);
    this.aimPitch = MathUtils.clamp(this.aimPitch + mouseDY * sens, -0.9, 0.9);

    if (!aiming) {
      // Swing lazily behind the heading (ignore it when the board points straight up/down)...
      const { fwd } = skater;
      if (fwd.x * fwd.x + fwd.z * fwd.z > 0.1) {
        const step = wrap(Math.atan2(fwd.x, fwd.z) - this.yaw) * damp(c.yawLag, dt);
        this.yaw += step;
      }
      // ...and let the mouse offset drift back to centre.
      const yawLimit = MathUtils.degToRad(c.aimYawLimit);
      this.aimYaw = MathUtils.clamp(this.aimYaw, -yawLimit, yawLimit) * (1 - damp(c.aimRecenter, dt));
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
    const dist = lerp(lerp(c.distance, c.distanceFast, speed01), c.aimDistance, this.aim);
    // Over-the-shoulder: slide the camera and its look point sideways together.
    const shoulder = c.aimShoulder * this.aim, rx = -Math.cos(yaw) * shoulder, rz = Math.sin(yaw) * shoulder;

    const cam = this.camera;
    cam.position.set(
      this.focus.x + rx - Math.sin(yaw) * Math.cos(elevation) * dist,
      this.focus.y + c.lookHeight + Math.sin(elevation) * dist,
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
    this.fov = lerp(this.fov, lerp(speedFov, c.aimFov, this.aim), damp(8, dt));
    cam.fov = this.fov;
    cam.updateProjectionMatrix();
  }

  onLand(impact) { this.dip = Math.min(0.7, impact * config.camera.landingDip); }
  onSloppy() { this.shake = config.camera.sloppyShake; }
  onShot() { this.shake = Math.max(this.shake, config.gun.recoil); }
}
