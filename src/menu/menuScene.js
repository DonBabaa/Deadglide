// The scene behind the main menu: Kirky leaning on a tomb, smoking, his
// board propped up beside him, taking the odd pot-shot into the dark.
// It is set up in the real world next to the spawn point and hidden in play.
import * as THREE from 'three';
import { SkaterModel } from '../player/skaterModel.js';
import { heightAt, SPAWN } from '../world/terrain.js';
import { stoneTexture } from '../world/textures.js';
import { playShot } from '../fx/audio.js';

const FACING = -0.9;   // which way he looks out over the cemetery (radians about the vertical)
const v = new THREE.Vector3();

export class MenuScene {
  constructor(scene, camera) {
    this.camera = camera;
    const x0 = SPAWN.x + 7, z0 = SPAWN.z + 9;
    this.origin = new THREE.Vector3(x0, heightAt(x0, z0), z0);

    // Everything here is in a group that faces the way Kirky does: +Z is "forward".
    this.group = new THREE.Group();
    this.group.position.copy(this.origin);
    this.group.rotation.y = FACING;
    scene.add(this.group);

    // The tomb he leans on: a slab on a plinth with a cross at its head.
    const stone = new THREE.MeshStandardMaterial({ map: stoneTexture(), roughness: 0.95 });
    const block = (w, h, d, x, y, z) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stone);
      mesh.position.set(x, y, z);
      mesh.castShadow = mesh.receiveShadow = true;
      this.group.add(mesh);
    };
    block(2.5, 0.5, 1.2, 0.2, -0.05, -0.75);    // plinth (sunk a little, in case the ground slopes)
    block(2.3, 0.75, 1.0, 0.2, 0.55, -0.75);    // tomb
    block(2.42, 0.1, 1.12, 0.2, 0.97, -0.75);   // lid
    // A cross standing in the ground at the head of the tomb.
    block(0.6, 0.4, 0.5, -1.5, 0.1, -0.75);       // its footing
    block(0.2, 1.55, 0.16, -1.5, 1.05, -0.75);    // upright
    block(0.8, 0.2, 0.16, -1.5, 1.42, -0.75);     // arms

    // Kirky himself: the same model as in play, posed by hand.
    this.kirky = new SkaterModel(scene);
    const k = this.kirky;
    k.board.visible = false;                         // his board is beside him instead
    k.root.position.copy(this.origin);
    k.root.rotation.y = FACING;
    k.rider.position.y = 0;                          // standing on the ground, not on a deck
    k.rider.rotation.y = 0.25;                       // turned a touch toward the camera
    k.tilt.rotation.x = -0.16;                       // leaning back on the tomb
    k.torso.rotation.x = 0.1;
    k.frontLeg.rotation.x = 0.32;                    // one foot out in front...
    k.backLeg.rotation.x = -0.05;
    k.backLeg.rotation.z = 0.06;

    // The board, stood on its tail in front of the tomb and leaning back against
    // it, wheels facing out. (Kept clear of the stone so nothing cuts through it.)
    const board = k.board.clone();
    board.visible = true;
    board.position.set(-0.72, 0.6, 0.0);
    board.rotation.set(-1.83, 0, 0.06);
    this.group.add(board);

    // Shooting: a muzzle flash and a tracer streak.
    this.flash = new THREE.PointLight(0xffc880, 0, 12, 2);
    scene.add(this.flash);
    this.tracer = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 1.8), new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false }));
    this.tracer.visible = false;
    scene.add(this.tracer);
    this.tracerVel = new THREE.Vector3();
    this.tracerLife = 0;
    this.target = new THREE.Vector3();
    this.nextBurst = 3;      // seconds until he next raises the gun
    this.shotsLeft = 0;
    this.shotTimer = 0;
    this.time = 0;
    this.visible = true;
  }

  setVisible(visible) {
    this.visible = visible;
    this.group.visible = visible;
    this.kirky.setVisible(visible);
    this.tracer.visible = false;
    this.flash.intensity = 0;
  }

  update(dt) {
    const k = this.kirky;
    this.time += dt;

    // Every few seconds: pick something out in the dark and put a few rounds into it.
    this.nextBurst -= dt;
    if (this.nextBurst <= 0 && this.shotsLeft === 0) {
      this.shotsLeft = 1 + Math.floor(Math.random() * 3);
      this.shotTimer = 0.55;   // time to bring the gun up first
      this.nextBurst = 4 + Math.random() * 5;
      const a = FACING + (Math.random() - 0.5) * 0.9;
      this.target.set(this.origin.x + Math.sin(a) * 70, this.origin.y + 1 + Math.random() * 2, this.origin.z + Math.cos(a) * 70);
    }
    const aiming = this.shotsLeft > 0;
    k.updateArm(dt, this.target, aiming);
    if (aiming && (this.shotTimer -= dt) <= 0) {
      this.shotsLeft--;
      this.shotTimer = 0.22;
      k.onShot();
      playShot();   // (silent until the first click, like all browser audio)
      this.flash.position.copy(k.muzzle);
      this.flash.intensity = 60;
      this.tracer.position.copy(k.muzzle);
      this.tracerVel.copy(this.target).sub(k.muzzle).normalize();
      this.tracer.quaternion.setFromUnitVectors(v.set(0, 0, 1), this.tracerVel);
      this.tracerVel.multiplyScalar(170);
      this.tracerLife = 0.45;
    }
    this.flash.intensity *= Math.exp(-30 * dt);
    this.tracerLife -= dt;
    this.tracer.visible = this.tracerLife > 0;
    if (this.tracer.visible) this.tracer.position.addScaledVector(this.tracerVel, dt);

    // Idle life: breathing, and the smoke.
    k.torso.rotation.x = 0.1 + Math.sin(this.time * 1.3) * 0.015;
    k.updateSmoke(dt);

    // Camera: off to his side, drifting slightly. He sits to the right of the
    // frame so the menu has the left.
    const sway = Math.sin(this.time * 0.25) * 0.25;
    this.camera.position.set(-2.1 + sway, 1.45, 3.7).applyAxisAngle(THREE.Object3D.DEFAULT_UP, FACING).add(this.origin);
    this.camera.lookAt(v.set(-1.0, 1.05, 0).applyAxisAngle(THREE.Object3D.DEFAULT_UP, FACING).add(this.origin));
    this.camera.fov = 42;
    this.camera.updateProjectionMatrix();
  }
}
