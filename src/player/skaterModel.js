// Kirky: board + rider, built in code. Purely visual: reads the Skater's
// state each frame and poses itself. Model forward is +Z.
// He wears a hoodie with the hood up over a beanie, belted jeans and black
// Vans-style skate shoes, and he is never without a cigarette.
import * as THREE from 'three';
import { config } from '../config.js';
import { glowTexture } from '../world/textures.js';
import { hoodieTexture, denimTexture, ribTexture, canvasTexture } from './kirkyTextures.js';

const TAU = Math.PI * 2;
const x = new THREE.Vector3(), z = new THREE.Vector3(), basis = new THREE.Matrix4();
const Z = new THREE.Vector3(0, 0, 1), local = new THREE.Vector3();
const qInv = new THREE.Quaternion(), qAim = new THREE.Quaternion();
const REST = new THREE.Quaternion().setFromEuler(new THREE.Euler(1.2, 0.5, 0));   // gun arm hanging at the side
const REST_TWO_HANDED = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.5, 0.2, 0));   // long guns: carried low across the body
const UP = new THREE.Vector3(0, 1, 0), grip = new THREE.Vector3();
const ease = (t) => t * t * (3 - 2 * t);
const EMBER = new THREE.Color(0xff6a1a);

function part(geometry, material, px = 0, py = 0, pz = 0) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(px, py, pz);
  mesh.castShadow = true;
  return mesh;
}
const limb = (radius, length, material, px, py, pz) => part(new THREE.CapsuleGeometry(radius, length, 4, 12), material, px, py, pz);
const box = (w, h, d, material, px, py, pz) => part(new THREE.BoxGeometry(w, h, d), material, px, py, pz);
const tube = (radius, length, material, px, py, pz, radiusTop = radius) => part(new THREE.CylinderGeometry(radiusTop, radius, length, 16), material, px, py, pz);

export class SkaterModel {
  constructor(scene) {
    const std = (color, roughness = 0.8, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
    const wood = std(0x9a6a3c, 0.6), grip = std(0x111214, 0.95), urethane = std(0xe9e4d4, 0.5);
    const metal = std(0x9aa0a6, 0.35, { metalness: 0.6 }), gunmetal = std(0x1b1d21, 0.45);
    const skin = std(0xc99873, 0.7), white = std(0xeeeeea, 0.7), leather = std(0x121214, 0.5), dark = std(0x14110f, 0.9);
    const hoodie = std(0xffffff, 0.95, { map: hoodieTexture(), side: THREE.DoubleSide });
    const hoodieRib = std(0xffffff, 0.95, { map: ribTexture('#682622') });
    const denim = std(0xffffff, 0.9, { map: denimTexture() });
    const beanie = std(0xffffff, 0.95, { map: ribTexture('#24262c') });
    const shoeCanvas = std(0xffffff, 0.9, { map: canvasTexture() });

    this.root = new THREE.Group();   // position + board orientation
    this.tilt = new THREE.Group();   // carve lean
    this.root.add(this.tilt);

    // ---- Board (its own group so it can flip under the rider's feet) ----
    this.board = new THREE.Group();
    this.board.rotation.order = 'YXZ';
    const deck = new THREE.Group();
    deck.add(box(0.22, 0.014, 0.6, wood, 0, 0, 0), box(0.22, 0.004, 0.6, grip, 0, 0.009, 0));
    for (const end of [-1, 1]) {
      const kick = part(new THREE.CylinderGeometry(0.11, 0.11, 0.014, 16, 1, false, 0, Math.PI).rotateY(end > 0 ? -Math.PI / 2 : Math.PI / 2), wood, 0, 0, end * 0.3);
      kick.rotation.x = -end * 0.32;   // upturned nose / tail
      deck.add(kick, box(0.16, 0.035, 0.05, metal, 0, -0.025, end * 0.2));
      for (const wx of [-0.1, 0.1]) {
        deck.add(part(new THREE.CylinderGeometry(0.03, 0.03, 0.035, 12).rotateZ(Math.PI / 2), urethane, wx, -0.075, end * 0.2));
      }
    }
    deck.scale.setScalar(1.35);   // slightly oversized so it reads from the chase camera
    this.board.add(deck);
    this.board.position.y = 0.142;
    this.tilt.add(this.board);

    // ---- Rider, standing side-on with bent knees ----
    this.rider = new THREE.Group();
    this.rider.position.y = 0.16;
    this.rider.rotation.y = -1.15;

    // Black skate shoe: white sole and side stripe, white laces. Origin at the bottom of the sole.
    const shoe = () => {
      const g = new THREE.Group();
      g.add(
        box(0.125, 0.034, 0.31, white, 0, 0.017, 0),                                           // sole
        box(0.117, 0.058, 0.2, shoeCanvas, 0, 0.063, -0.045),                                   // heel and sides
        part(new THREE.SphereGeometry(0.0585, 12, 8).scale(1, 0.62, 1.55), shoeCanvas, 0, 0.05, 0.075),   // rounded toe
        box(0.119, 0.05, 0.1, shoeCanvas, 0, 0.115, -0.095),                                    // ankle collar
        box(0.05, 0.012, 0.13, shoeCanvas, 0, 0.098, 0.03),                                     // tongue
      );
      for (const side of [-1, 1]) {
        const stripe = box(0.004, 0.016, 0.17, white, side * 0.0595, 0.068, -0.02);             // the side stripe
        stripe.rotation.x = -0.12;
        g.add(stripe);
      }
      for (let i = 0; i < 4; i++) g.add(box(0.068, 0.006, 0.011, white, 0, 0.107 - i * 0.004, 0.005 + i * 0.03));   // laces
      return g;
    };
    const leg = (side) => {
      const group = new THREE.Group();
      group.position.set(side * 0.17, 0.86, 0);
      const foot = shoe();
      foot.position.set(0, -0.865, 0.05);
      group.add(
        limb(0.085, 0.3, denim, 0, -0.2, 0.03), limb(0.07, 0.3, denim, 0, -0.6, 0),
        tube(0.076, 0.05, denim, 0, -0.775, 0),   // turned-up cuff
        foot,
      );
      return group;
    };
    this.backLeg = leg(-1);   // swings for the kick-push
    this.frontLeg = leg(1);

    this.torso = new THREE.Group();
    this.torso.position.y = 0.86;
    const flat = (mesh) => { mesh.scale.z = 0.73; return mesh; };   // bodies are wider than they are deep
    const armL = limb(0.062, 0.46, hoodie, -0.33, 0.34, 0.04); armL.rotation.z = -0.5;
    const cuffL = tube(0.058, 0.06, hoodieRib, -0.455, 0.13, 0.04); cuffL.rotation.z = -0.5;
    const handL = part(new THREE.SphereGeometry(0.055, 10, 8), skin, -0.485, 0.085, 0.04);
    this.offArm = [armL, cuffL, handL];   // hidden while that hand is on a two-handed gun
    // Hood, up: a shell round the head, open at the face and underneath.
    const hood = part(new THREE.SphereGeometry(0.178, 20, 14, Math.PI / 2 + 0.78, TAU - 1.56, 0, 2.35), hoodie, 0, 0.79, -0.025);
    hood.scale.set(1, 1.1, 1.14);
    const brim = part(new THREE.CylinderGeometry(0.137, 0.137, 0.05, 20, 1, true), beanie, 0, 0.845, 0);
    this.torso.add(
      flat(tube(0.165, 0.16, denim, 0, -0.04, 0, 0.17)),                    // hips
      flat(tube(0.178, 0.045, leather, 0, 0.045, 0)),                       // belt...
      box(0.06, 0.042, 0.02, metal, 0, 0.045, 0.132),                       // ...and buckle
      flat(part(new THREE.CapsuleGeometry(0.19, 0.3, 4, 14), hoodie, 0, 0.36, 0)),   // hoodie body
      flat(tube(0.192, 0.07, hoodieRib, 0, 0.11, 0, 0.196)),                // ribbed hem
      box(0.25, 0.13, 0.03, hoodie, 0, 0.24, 0.132),                        // kangaroo pocket
      tube(0.006, 0.17, white, -0.045, 0.52, 0.142), tube(0.006, 0.14, white, 0.045, 0.535, 0.142),   // drawstrings
      armL, cuffL, handL,
      part(new THREE.SphereGeometry(0.17, 14, 10), hoodie, 0, 0.61, -0.06),          // hood gathered at the neck
      part(new THREE.SphereGeometry(0.125, 16, 12), skin, 0, 0.8, 0),                // head
      part(new THREE.SphereGeometry(0.133, 16, 8, 0, TAU, 0, Math.PI / 2), beanie, 0, 0.825, 0),   // beanie...
      brim,                                                                           // ...with a folded brim
      part(new THREE.SphereGeometry(0.013, 8, 6), dark, -0.045, 0.8, 0.114), part(new THREE.SphereGeometry(0.013, 8, 6), dark, 0.045, 0.8, 0.114),   // eyes
      box(0.04, 0.008, 0.01, dark, -0.045, 0.82, 0.116), box(0.04, 0.008, 0.01, dark, 0.045, 0.82, 0.116),                                           // brows
      hood,
    );

    // Cigarette, with a glowing tip. (Smoke puffs are made in updateSmoke.)
    const paper = std(0xf2efe6, 0.9), filter = std(0xc98a4b, 0.9);
    const cig = new THREE.Group();
    cig.position.set(0.035, 0.765, 0.115);
    cig.rotation.set(0.25, 0.3, 0);   // drooping from the corner of the mouth
    cig.add(
      part(new THREE.CylinderGeometry(0.011, 0.011, 0.11, 8).rotateX(Math.PI / 2), paper, 0, 0, 0.075),
      part(new THREE.CylinderGeometry(0.0115, 0.0115, 0.04, 8).rotateX(Math.PI / 2), filter, 0, 0, 0.01),
    );
    this.ember = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff6a1a, toneMapped: false }));
    this.ember.position.z = 0.132;
    cig.add(this.ember);
    this.torso.add(cig);

    const smokeTex = glowTexture();
    this.smoke = Array.from({ length: 22 }, () => {
      const puff = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: 0xb9bcc4, transparent: true, opacity: 0, depthWrite: false }));
      puff.visible = false;
      puff.userData = { life: 0, drift: new THREE.Vector3() };
      scene.add(puff);
      return puff;
    });
    this.nextPuff = 0;
    this.puffTimer = 0;
    this.time = 0;

    this.rider.add(this.backLeg, this.frontLeg, this.torso);
    this.tilt.add(this.rider);

    // ---- Gun arm: points along +Z of its own group, so we can aim it anywhere ----
    this.gunArm = new THREE.Group();
    this.gunArm.position.set(0.05, 1.42, 0.12);
    this.gunArm.add(
      limb(0.062, 0.4, hoodie, 0, 0, 0.26).rotateX(Math.PI / 2),
      tube(0.058, 0.06, hoodieRib, 0, 0, 0.5).rotateX(Math.PI / 2),
      part(new THREE.SphereGeometry(0.055, 10, 8), skin, 0, 0, 0.56),
      (this.barrel = box(0.045, 0.07, 0.3, gunmetal, 0, 0.03, 0.7)),   // slide + barrel
      box(0.04, 0.13, 0.06, gunmetal, 0, -0.05, 0.6),                  // grip
    );
    // Telescopic sight (only shown on scoped guns): tube, mounts, and a glinting lens.
    this.scope = new THREE.Group();
    this.scope.position.set(0, 0.125, 0.86);
    this.scope.add(
      part(new THREE.CylinderGeometry(0.024, 0.024, 0.3, 12).rotateX(Math.PI / 2), gunmetal),
      part(new THREE.CylinderGeometry(0.034, 0.026, 0.07, 12).rotateX(Math.PI / 2), gunmetal, 0, 0, 0.17),    // front bell
      part(new THREE.CylinderGeometry(0.028, 0.03, 0.05, 12).rotateX(Math.PI / 2), gunmetal, 0, 0, -0.16),    // eyepiece
      box(0.02, 0.05, 0.03, gunmetal, 0, -0.035, 0.08), box(0.02, 0.05, 0.03, gunmetal, 0, -0.035, -0.08),    // mounts
      part(new THREE.CircleGeometry(0.031, 16), new THREE.MeshBasicMaterial({ color: 0x7fd4ff, toneMapped: false }), 0, 0, 0.206),   // lens
    );
    this.scope.visible = false;
    this.gunArm.add(this.scope);

    // Support arm for two-handed guns: reaches from the left shoulder to the
    // fore-end. It lives in the gun's space and is re-aimed every frame.
    this.supportArm = limb(0.058, 0.4, hoodie, 0, 0, 0);
    this.supportHand = part(new THREE.SphereGeometry(0.057, 10, 8), skin);
    this.supportArm.visible = this.supportHand.visible = false;
    this.gunArm.add(this.supportArm, this.supportHand);
    this.twoHanded = false;
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
  // hidden: don't draw him at all (looking down a scope).
  update(dt, skater, renderPos, aimPoint, gunUp, invulnerable = 0, hidden = false) {
    this.root.position.copy(renderPos);
    this.root.visible = !hidden && (invulnerable <= 0 || Math.floor(invulnerable * 12) % 2 === 0);   // blink after a hit

    // Orientation from the board's up + heading.
    z.copy(skater.fwd).addScaledVector(skater.up, -skater.fwd.dot(skater.up)).normalize();
    x.crossVectors(skater.up, z);
    this.root.quaternion.setFromRotationMatrix(basis.makeBasis(x, skater.up, z));

    // Lean into carves, more at speed.
    const speed01 = Math.min(1, skater.speed / config.skate.maxSpeed);
    const leanTarget = skater.grounded ? -skater.steer * (0.15 + 0.5 * speed01) * (skater.drifting ? 1.5 : 1) : 0;
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

    this.updateArm(dt, aimPoint, gunUp);
    this.updateSmoke(dt);
  }

  // Gun arm: raised toward `aimPoint` while gunUp (and for a moment after), otherwise hanging.
  updateArm(dt, aimPoint, gunUp) {
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
      this.gunArm.quaternion.slerp(this.twoHanded ? REST_TWO_HANDED : REST, 1 - Math.exp(-8 * dt));
    }
    this.gunArm.updateMatrixWorld();

    // Second hand on the fore-end: stretch the support arm from the left shoulder to it.
    if (this.twoHanded) {
      this.gunArm.worldToLocal(this.torso.localToWorld(local.set(-0.27, 0.5, 0.04)));   // left shoulder, in the gun's space
      grip.set(0, -0.035, 0.84);
      this.supportHand.position.copy(grip);
      const reach = grip.sub(local).length();
      this.supportArm.position.copy(local).addScaledVector(grip, 0.5);
      this.supportArm.quaternion.setFromUnitVectors(UP, grip.divideScalar(reach));
      this.supportArm.scale.y = reach / 0.516;   // (0.516 = the arm's own length)
    }
    this.muzzle.set(0, 0.03, 0.6 + 0.3 * this.barrel.scale.z).applyMatrix4(this.gunArm.matrixWorld);
  }

  // Cigarette smoke: little puffs left hanging in the air behind you.
  updateSmoke(dt) {
    this.time += dt;
    this.ember.material.color.setScalar(1).multiply(EMBER).multiplyScalar(0.75 + 0.45 * Math.sin(this.time * 2.2) ** 2);   // slow glow
    this.puffTimer -= dt;
    if (this.puffTimer <= 0 && this.root.visible) {
      this.puffTimer = 0.11;
      const puff = this.smoke[this.nextPuff++ % this.smoke.length];
      this.ember.getWorldPosition(puff.position);
      puff.userData.life = 1;
      puff.userData.drift.set((Math.random() - 0.5) * 0.3, 0.5 + Math.random() * 0.3, (Math.random() - 0.5) * 0.3);
      puff.visible = true;
    }
    for (const puff of this.smoke) {
      const u = puff.userData;
      if (u.life <= 0) continue;
      u.life -= dt / 2.2;
      puff.position.addScaledVector(u.drift, dt);
      puff.scale.setScalar(0.06 + (1 - u.life) * 0.5);
      puff.material.opacity = Math.max(0, u.life) * 0.3;
      puff.visible = u.life > 0;
    }
  }

  // Hide or show the whole model (including any smoke still hanging about).
  setVisible(visible) {
    this.root.visible = visible;
    if (!visible) for (const puff of this.smoke) { puff.visible = false; puff.userData.life = 0; }
  }

  // Longer guns get a longer (and slightly chunkier) barrel.
  setWeapon(def) {
    this.barrel.scale.set(1 + (def.barrel - 1) * 0.25, 1 + (def.barrel - 1) * 0.2, def.barrel);
    this.barrel.position.z = 0.55 + 0.15 * def.barrel;
    this.scope.visible = !!def.scope;
    this.twoHanded = !!def.twoHanded;
    this.supportArm.visible = this.supportHand.visible = this.twoHanded;
    for (const piece of this.offArm) piece.visible = !this.twoHanded;
  }

  onShot() { this.recoil = 0.25; }
}
