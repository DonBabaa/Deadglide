// Board + rider, built in code. Purely visual: reads the Skater's state each
// frame and poses itself. Model forward is +Z.
import * as THREE from 'three';
import { config } from '../config.js';

const TAU = Math.PI * 2;
const x = new THREE.Vector3(), z = new THREE.Vector3(), basis = new THREE.Matrix4();
const Z = new THREE.Vector3(0, 0, 1), local = new THREE.Vector3();
const qInv = new THREE.Quaternion(), qAim = new THREE.Quaternion();
const REST = new THREE.Quaternion().setFromEuler(new THREE.Euler(1.2, 0.5, 0));   // gun arm hanging at the side
const ease = (t) => t * t * (3 - 2 * t);

function part(geometry, material, px, py, pz) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(px, py, pz);
  mesh.castShadow = true;
  return mesh;
}
const limb = (radius, length, material, px, py, pz) => part(new THREE.CapsuleGeometry(radius, length, 4, 10), material, px, py, pz);

export class SkaterModel {
  constructor(scene) {
    const std = (color, roughness = 0.8) => new THREE.MeshStandardMaterial({ color, roughness });
    const wood = std(0x9a6a3c, 0.6), grip = std(0x111214, 0.95), urethane = std(0xe9e4d4, 0.5), metal = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.35, metalness: 0.6 });
    const denim = std(0x2f3f5c), hoodie = std(0x6b2f2a), skin = std(0xc99873, 0.7), shoe = std(0xe6e6e6, 0.6), beanie = std(0x1d1f24), gunmetal = std(0x1b1d21, 0.45);

    this.root = new THREE.Group();   // position + board orientation
    this.tilt = new THREE.Group();   // carve lean
    this.root.add(this.tilt);

    // Board (its own group so it can flip under the rider's feet).
    this.board = new THREE.Group();
    this.board.rotation.order = 'YXZ';
    const deck = new THREE.Group();
    deck.add(part(new THREE.BoxGeometry(0.22, 0.014, 0.6), wood, 0, 0, 0), part(new THREE.BoxGeometry(0.22, 0.004, 0.6), grip, 0, 0.009, 0));
    for (const end of [-1, 1]) {
      const kick = part(new THREE.CylinderGeometry(0.11, 0.11, 0.014, 16, 1, false, 0, Math.PI).rotateY(end > 0 ? -Math.PI / 2 : Math.PI / 2), wood, 0, 0, end * 0.3);
      kick.rotation.x = -end * 0.32;   // upturned nose / tail
      deck.add(kick, part(new THREE.BoxGeometry(0.16, 0.035, 0.05), metal, 0, -0.025, end * 0.2));
      for (const wx of [-0.1, 0.1]) {
        deck.add(part(new THREE.CylinderGeometry(0.03, 0.03, 0.035, 12).rotateZ(Math.PI / 2), urethane, wx, -0.075, end * 0.2));
      }
    }
    deck.scale.setScalar(1.35);   // slightly oversized so it reads from the chase camera
    this.board.add(deck);
    this.board.position.y = 0.142;
    this.tilt.add(this.board);

    // Rider, standing side-on with bent knees.
    this.rider = new THREE.Group();
    this.rider.position.y = 0.16;
    this.rider.rotation.y = -1.15;
    const leg = (side) => {
      const group = new THREE.Group();
      group.position.set(side * 0.17, 0.86, 0);
      group.add(limb(0.085, 0.3, denim, 0, -0.2, 0.03), limb(0.07, 0.3, denim, 0, -0.6, 0), part(new THREE.BoxGeometry(0.12, 0.09, 0.28), shoe, 0, -0.82, 0.05));
      return group;
    };
    this.backLeg = leg(-1);   // swings for the kick-push
    this.frontLeg = leg(1);

    this.torso = new THREE.Group();
    this.torso.position.y = 0.86;
    const chest = part(new THREE.CapsuleGeometry(0.19, 0.3, 4, 12), hoodie, 0, 0.34, 0);
    chest.scale.z = 0.72;
    const armL = limb(0.06, 0.48, hoodie, -0.33, 0.33, 0.04); armL.rotation.z = -0.5;
    this.torso.add(
      chest, armL,
      part(new THREE.SphereGeometry(0.055, 8, 6), skin, -0.47, 0.1, 0.04),    // off hand
      part(new THREE.SphereGeometry(0.2, 12, 8), hoodie, 0, 0.6, -0.05),      // hood bunched at the neck
      part(new THREE.SphereGeometry(0.125, 14, 10), skin, 0, 0.8, 0),         // head
      part(new THREE.SphereGeometry(0.132, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), beanie, 0, 0.82, 0),
    );
    this.rider.add(this.backLeg, this.frontLeg, this.torso);
    this.tilt.add(this.rider);

    // Gun arm: points along +Z of its own group, so we can aim it anywhere.
    this.gunArm = new THREE.Group();
    this.gunArm.position.set(0.05, 1.42, 0.12);
    this.gunArm.add(
      limb(0.06, 0.42, hoodie, 0, 0, 0.27).rotateX(Math.PI / 2),
      part(new THREE.SphereGeometry(0.055, 8, 6), skin, 0, 0, 0.56),
      part(new THREE.BoxGeometry(0.045, 0.07, 0.3), gunmetal, 0, 0.03, 0.7),      // slide + barrel
      part(new THREE.BoxGeometry(0.04, 0.13, 0.06), gunmetal, 0, -0.05, 0.6),     // grip
    );
    this.gunArm.quaternion.copy(REST);
    this.root.add(this.gunArm);
    this.muzzle = new THREE.Vector3();
    this.armed = 0;      // seconds the arm stays raised after the last shot
    this.recoil = 0;

    scene.add(this.root);
    this.lean = 0;
    this.crouch = 0;
  }

  // aimPoint: world position under the crosshair. gunUp: aiming or firing right now.
  update(dt, skater, renderPos, aimPoint, gunUp, invulnerable = 0) {
    this.root.position.copy(renderPos);
    this.root.visible = invulnerable <= 0 || Math.floor(invulnerable * 12) % 2 === 0;   // blink after a hit

    // Orientation from the board's up + heading.
    z.copy(skater.fwd).addScaledVector(skater.up, -skater.fwd.dot(skater.up)).normalize();
    x.crossVectors(skater.up, z);
    this.root.quaternion.setFromRotationMatrix(basis.makeBasis(x, skater.up, z));

    // Lean into carves, more at speed.
    const speed01 = Math.min(1, skater.speed / config.skate.maxSpeed);
    const leanTarget = skater.grounded ? -skater.steer * (0.15 + 0.5 * speed01) : 0;
    this.lean += (leanTarget - this.lean) * (1 - Math.exp(-10 * dt));
    this.tilt.rotation.z = this.lean;

    // Board tricks: the board flips under the feet while the rider tucks up.
    const trick = skater.trick, p = ease(skater.trickProgress);
    if (trick) this.board.rotation.set(trick.pitch * TAU * p, trick.yaw * TAU * p, trick.roll * TAU * p);
    else this.board.rotation.set(0, 0, 0);
    const tuck = trick ? Math.sin(skater.trickProgress * Math.PI) : 0;
    this.board.position.y = 0.142 + tuck * 0.12;
    this.frontLeg.rotation.x = this.backLeg.rotation.x = -tuck * 0.5;

    // Crouch: charging an ollie, mid-trick, or balancing on a rail.
    const crouchTarget = Math.max(skater.charge, skater.grinding ? 0.5 : 0, tuck * 0.5);
    this.crouch += (crouchTarget - this.crouch) * (1 - Math.exp(-18 * dt));
    this.rider.scale.y = 1 - 0.3 * this.crouch;
    this.torso.rotation.x = 0.12 + 0.35 * this.crouch + 0.2 * speed01;

    // Kick-push: back leg swings down and back.
    const k = Math.min(1, skater.sinceKick / (config.skate.kickInterval * 0.8));
    this.backLeg.rotation.z = -Math.sin(k * Math.PI) * 0.9;

    // Gun arm: raised toward the crosshair while aiming/firing, otherwise hanging.
    this.armed = gunUp ? 0.5 : Math.max(0, this.armed - dt);
    this.recoil *= Math.exp(-25 * dt);
    this.root.updateMatrixWorld();
    if (this.armed > 0 && aimPoint) {
      this.gunArm.getWorldPosition(local);
      local.subVectors(aimPoint, local).normalize();
      local.y += this.recoil;
      qAim.setFromUnitVectors(Z, local.normalize());
      this.gunArm.quaternion.slerp(qInv.copy(this.root.quaternion).invert().multiply(qAim), 1 - Math.exp(-30 * dt));
    } else {
      this.gunArm.quaternion.slerp(REST, 1 - Math.exp(-8 * dt));
    }
    this.gunArm.updateMatrixWorld();
    this.muzzle.set(0, 0.03, 0.9).applyMatrix4(this.gunArm.matrixWorld);
  }

  onShot() { this.recoil = 0.25; }
}
