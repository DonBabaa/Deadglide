// Kirky: board + rider, built in code. Purely visual: reads the Skater's
// state each frame and poses itself. Model forward is +Z.
// He wears a hoodie with the hood up over a beanie, belted jeans and black
// Vans-style skate shoes, and he is never without a cigarette.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { config } from '../config.js';
import { glowTexture } from '../world/textures.js';
import { hoodieTexture, denimTexture, ribTexture, canvasTexture, deckTexture, emblemTexture } from './kirkyTextures.js';
import { buildGuns } from './gunModels.js';
import { COSTUMES, buildMask, buildPack } from './costumes.js';

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

// Weld the loose pieces of a group that share a material into one mesh. He is built from a couple of hundred
// small shapes, each one a separate thing to draw (twice: once for its shadow), which adds up fast with four
// riders on the Moon. Only pieces that never move or hide on their own may be welded: list the others in `keep`.
function weld(group, keep = []) {
  const sets = new Map();
  for (const m of group.children) {
    if (!m.isMesh || m.children.length || keep.includes(m) || !m.castShadow || !m.visible) continue;
    if (!sets.has(m.material)) sets.set(m.material, []);
    sets.get(m.material).push(m);
  }
  for (const [material, pieces] of sets) {
    if (pieces.length < 2) continue;
    const merged = mergeGeometries(pieces.map((m) => { m.updateMatrix(); return (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrix); }));
    if (!merged) continue;
    for (const m of pieces) { group.remove(m); m.geometry.dispose(); }
    group.add(part(merged, material));
  }
  return group;
}

const HAND = new THREE.Vector3(0, 0, 0.56);   // his gun hand, in the gun arm's space
const FLIP_PIVOT = 0.85;   // he flips about this height (his middle)
const X_AXIS = new THREE.Vector3(1, 0, 0), flipQ = new THREE.Quaternion(), pivot = new THREE.Vector3();

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
    this.mats = { hoodie, hoodieRib, beanie, wood, urethane, gunmetal, skin };   // the ones cosmetics repaint (see applyLook)

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
    weld(deck);
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
      return weld(g);
    };
    const leg = (side) => {
      const group = new THREE.Group();
      group.position.set(side * 0.17, 0.86, 0);
      const foot = shoe();
      foot.position.set(0, -0.445, 0.04);
      // The shin, cuff and foot hang off the knee, so the leg can bend (group.knee.rotation.x).
      const knee = (group.knee = new THREE.Group());
      knee.position.set(0, -0.42, 0.01);
      knee.add(
        part(new THREE.SphereGeometry(0.078, 10, 8), denim),
        limb(0.07, 0.3, denim, 0, -0.18, -0.01),
        tube(0.076, 0.05, denim, 0, -0.355, -0.01),   // turned-up cuff
        foot,
      );
      weld(knee);
      group.add(limb(0.085, 0.3, denim, 0, -0.2, 0.03), knee);
      return group;
    };
    this.backLeg = leg(-1);   // swings for the kick-push
    this.frontLeg = leg(1);

    this.torso = new THREE.Group();
    this.torso.position.y = 0.86;
    const flat = (mesh) => { mesh.scale.z = 0.73; return mesh; };   // bodies are wider than they are deep
    // Left arm: hangs from the shoulder (this.leftArm.rotation.x swings it forward and back).
    const armL = limb(0.062, 0.46, hoodie, -0.13, -0.24, 0); armL.rotation.z = -0.5;
    const cuffL = tube(0.058, 0.06, hoodieRib, -0.255, -0.45, 0); cuffL.rotation.z = -0.5;
    const handL = part(new THREE.SphereGeometry(0.055, 10, 8), skin, -0.285, -0.495, 0);
    this.leftArm = new THREE.Group();
    this.leftArm.position.set(-0.2, 0.58, 0.04);
    this.leftArm.add(armL, cuffL, handL);
    this.offArm = [armL, cuffL, handL];   // hidden while that hand is on a two-handed gun
    // A bone-white skull stencilled on the back of the hoodie (the side the camera sees most).
    const emblem = part(new THREE.CircleGeometry(0.105, 20), new THREE.MeshStandardMaterial({ map: emblemTexture(), transparent: true, roughness: 0.9 }), 0, 0.4, -0.146);
    emblem.rotation.y = Math.PI;
    emblem.castShadow = false;
    // Hood, up: a shell round the head, open at the face and underneath.
    const hood = part(new THREE.SphereGeometry(0.178, 20, 14, Math.PI / 2 + 0.78, TAU - 1.56, 0, 2.35), hoodie, 0, 0.79, -0.025);
    hood.scale.set(1, 1.1, 1.14);
    const brim = part(new THREE.CylinderGeometry(0.137, 0.137, 0.05, 20, 1, true), beanie, 0, 0.845, 0);
    this.hood = hood;
    // Costumes: a holder on his head for a helmet or an alien's head, and one on his back for a pack (see applyLook).
    this.maskHolder = new THREE.Group();
    this.maskHolder.position.set(0, 0.8, 0);
    this.packHolder = new THREE.Group();
    this.packHolder.position.set(0, 0.37, -0.2);
    this.torso.add(
      flat(tube(0.165, 0.16, denim, 0, -0.04, 0, 0.17)),                    // hips
      flat(tube(0.178, 0.045, leather, 0, 0.045, 0)),                       // belt...
      box(0.06, 0.042, 0.02, metal, 0, 0.045, 0.132),                       // ...and buckle
      flat(part(new THREE.CapsuleGeometry(0.19, 0.3, 4, 14), hoodie, 0, 0.36, 0)),   // hoodie body
      flat(tube(0.192, 0.07, hoodieRib, 0, 0.11, 0, 0.196)),                // ribbed hem
      box(0.25, 0.13, 0.03, hoodie, 0, 0.24, 0.132),                        // kangaroo pocket
      tube(0.006, 0.17, white, -0.045, 0.52, 0.142), tube(0.006, 0.14, white, 0.045, 0.535, 0.142),   // drawstrings
      this.leftArm, emblem, this.maskHolder, this.packHolder,
      part(new THREE.SphereGeometry(0.17, 14, 10), hoodie, 0, 0.61, -0.06),          // hood gathered at the neck
      part(new THREE.SphereGeometry(0.125, 16, 12), skin, 0, 0.8, 0),                // head
      (this.beanieDome = part(new THREE.SphereGeometry(0.133, 16, 8, 0, TAU, 0, Math.PI / 2), beanie, 0, 0.825, 0)),   // beanie...
      (this.hair = part(new THREE.SphereGeometry(0.131, 16, 8, 0, TAU, 0, Math.PI / 2), dark, 0, 0.815, -0.004)),      // (his hair, for when he isn't wearing one)
      (this.brim = brim),                                                                           // ...with a folded brim
      part(new THREE.SphereGeometry(0.013, 8, 6), dark, -0.045, 0.8, 0.114), part(new THREE.SphereGeometry(0.013, 8, 6), dark, 0.045, 0.8, 0.114),   // eyes
      box(0.04, 0.008, 0.01, dark, -0.045, 0.82, 0.116), box(0.04, 0.008, 0.01, dark, 0.045, 0.82, 0.116),                                           // brows
      part(new THREE.SphereGeometry(0.018, 8, 6).scale(0.9, 1.2, 1), skin, 0, 0.782, 0.126),                                                         // nose
      box(0.05, 0.007, 0.01, dark, -0.004, 0.752, 0.118),                                                                                            // mouth
      part(new THREE.SphereGeometry(0.024, 8, 6).scale(0.5, 1, 0.8), skin, -0.123, 0.795, 0), part(new THREE.SphereGeometry(0.024, 8, 6).scale(0.5, 1, 0.8), skin, 0.123, 0.795, 0),   // ears
      part(new THREE.SphereGeometry(0.128, 14, 8, 0, TAU, 1.2, 0.5), dark, 0, 0.8, -0.004),                                                           // hair showing under the beanie, round the back and sides
      hood,
    );
    weld(this.torso, [hood, brim, this.beanieDome, this.hair]);   // (those four come and go with what he wears)

    // Cigarette, with a glowing tip. (Smoke puffs are made in updateSmoke.)
    const paper = std(0xf2efe6, 0.9), filter = std(0xc98a4b, 0.9);
    const cig = new THREE.Group();
    cig.position.set(0.035, 0.765, 0.115);
    cig.rotation.set(0.25, 0.3, 0);   // drooping from the corner of the mouth
    // (Cosmetics can swap the cigarette for a lollipop or a toothpick: all three sit in the same spot.)
    this.mouth = {
      cigarette: [
        part(new THREE.CylinderGeometry(0.011, 0.011, 0.11, 8).rotateX(Math.PI / 2), paper, 0, 0, 0.075),
        part(new THREE.CylinderGeometry(0.0115, 0.0115, 0.04, 8).rotateX(Math.PI / 2), filter, 0, 0, 0.01),
      ],
      lollipop: [
        part(new THREE.CylinderGeometry(0.005, 0.005, 0.1, 6).rotateX(Math.PI / 2), paper, 0, 0, 0.05),
        part(new THREE.SphereGeometry(0.03, 12, 10), std(0xe8336d, 0.25), 0, 0, 0.115),
      ],
      toothpick: [part(new THREE.CylinderGeometry(0.003, 0.0045, 0.12, 5).rotateX(Math.PI / 2), wood, 0, 0, 0.06)],
      nothing: [],
      pipe: [   // a briar pipe (it smokes)
        part(new THREE.CylinderGeometry(0.007, 0.009, 0.09, 6).rotateX(Math.PI / 2), std(0x1c1410, 0.5), 0, 0, 0.045),
        part(new THREE.CylinderGeometry(0.024, 0.018, 0.045, 10), std(0x4a2a16, 0.55), 0, 0.012, 0.1),
        part(new THREE.CylinderGeometry(0.019, 0.019, 0.006, 10), std(0x100c0a, 0.9), 0, 0.036, 0.1),
      ],
      rose: [   // held between his teeth by the stem
        part(new THREE.CylinderGeometry(0.004, 0.004, 0.15, 5).rotateX(Math.PI / 2), std(0x2f6a35, 0.7), 0, 0, 0.07),
        part(new THREE.SphereGeometry(0.03, 10, 8), std(0xb3101e, 0.5), 0, 0.004, 0.155),
        part(new THREE.SphereGeometry(0.018, 8, 6), std(0x7a0a14, 0.5), 0, 0.012, 0.165),
        part(new THREE.SphereGeometry(0.014, 6, 5).scale(1, 0.4, 1.6), std(0x2f6a35, 0.7), 0.012, 0, 0.09),
      ],
      bone: [
        part(new THREE.CylinderGeometry(0.006, 0.006, 0.11, 6).rotateX(Math.PI / 2), std(0xd8d2bf, 0.6), 0, 0, 0.06),
        part(new THREE.SphereGeometry(0.011, 6, 5), std(0xd8d2bf, 0.6), 0, 0, 0.118), part(new THREE.SphereGeometry(0.011, 6, 5), std(0xd8d2bf, 0.6), 0, 0, 0.004),
      ],
      cigar: [   // (a casino prize)
        part(new THREE.CylinderGeometry(0.019, 0.017, 0.125, 10).rotateX(Math.PI / 2), std(0x4a2e18, 0.8), 0, 0, 0.068),
        part(new THREE.CylinderGeometry(0.0195, 0.0195, 0.018, 10).rotateX(Math.PI / 2), std(0xd9b24a, 0.35), 0, 0, 0.04),
      ],
    };
    cig.add(...Object.values(this.mouth).flat());
    this.smoking = true;   // false when it isn't a cigarette: no ember, no smoke trail
    this.ember = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff6a1a, toneMapped: false }));
    this.ember.position.z = 0.132;
    cig.add(this.ember);
    this.torso.add(cig);

    const smokeTex = glowTexture();
    this.smoke = Array.from({ length: 70 }, () => {   // (enough for the big cloud after a HotBox)
      const puff = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: 0xb9bcc4, transparent: true, opacity: 0, depthWrite: false }));
      puff.visible = false;
      puff.userData = { life: 0, drift: new THREE.Vector3(), size: 1 };
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
    );
    // The guns (see gunModels.js): all built up front, one shown at a time. The hand holds them by the grip.
    this.guns = buildGuns(gunmetal);
    for (const id in this.guns) {
      const g = this.guns[id];
      weld(g.group);
      g.group.position.add(HAND);
      g.group.visible = id === 'pistol';
      this.gunArm.add(g.group);
    }
    this.gun = this.guns.pistol;   // the one in his hand

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
    this.flip = 0;       // the flip angle being shown
    this.inhale = 0;     // 0..1: taking a long drag (the ember flares, no smoke escapes)
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

    // Front / back flips: the whole of him turns over about his middle. Back on the
    // ground, whatever is left of the turn unwinds quickly.
    if (skater.flip !== 0) this.flip = skater.flip;
    else {
      this.flip = Math.atan2(Math.sin(this.flip), Math.cos(this.flip)) * Math.exp(-14 * dt);
      if (Math.abs(this.flip) < 0.01) this.flip = 0;
    }
    if (this.flip !== 0) {
      this.root.quaternion.multiply(flipQ.setFromAxisAngle(X_AXIS, this.flip));
      pivot.set(0, FLIP_PIVOT, 0).applyQuaternion(this.root.quaternion);
      this.root.position.addScaledVector(skater.up, FLIP_PIVOT).sub(pivot);
    }

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

  // Blowing out a lungful: call every frame while he exhales. A thick cloud rolls out of his mouth.
  exhale(dt) {
    this.blow = (this.blow || 0) + dt * 34;   // puffs per second
    this.torso.localToWorld(z.set(0, 0.8, 0));               // out from his head through the cigarette: the way he is facing
    this.ember.getWorldPosition(x).sub(z).setY(0).normalize();
    z.copy(x);
    while (this.blow >= 1) {
      this.blow -= 1;
      const puff = this.smoke[this.nextPuff++ % this.smoke.length];
      this.ember.getWorldPosition(puff.position);
      puff.position.y -= 0.02;
      puff.userData.life = 1;
      puff.userData.size = 2.2 + Math.random() * 1.6;
      puff.userData.drift.set((Math.random() - 0.5) * 0.5, 0.15 + Math.random() * 0.45, (Math.random() - 0.5) * 0.5).addScaledVector(z, 0.7 + Math.random() * 0.9);
      puff.visible = true;
    }
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
      grip.copy(this.gun.support).add(HAND);
      this.supportHand.position.copy(grip);
      const reach = grip.sub(local).length();
      this.supportArm.position.copy(local).addScaledVector(grip, 0.5);
      this.supportArm.quaternion.setFromUnitVectors(UP, grip.divideScalar(reach));
      this.supportArm.scale.y = reach / 0.516;   // (0.516 = the arm's own length)
    }
    this.muzzle.copy(this.gun.muzzle).add(HAND).applyMatrix4(this.gunArm.matrixWorld);
  }

  // Cigarette smoke: little puffs left hanging in the air behind you.
  updateSmoke(dt) {
    this.time += dt;
    this.ember.material.color.setScalar(1).multiply(EMBER).multiplyScalar(0.75 + 0.45 * Math.sin(this.time * 2.2) ** 2 + 5 * this.inhale);   // slow glow, flaring on a drag
    this.ember.scale.setScalar(1 + 0.8 * this.inhale);
    this.puffTimer -= dt;
    if (this.puffTimer <= 0 && this.root.visible && this.inhale <= 0 && this.smoking) {
      this.puffTimer = 0.11;
      const puff = this.smoke[this.nextPuff++ % this.smoke.length];
      this.ember.getWorldPosition(puff.position);
      puff.userData.life = 1;
      puff.userData.size = 1;
      puff.userData.drift.set((Math.random() - 0.5) * 0.3, 0.5 + Math.random() * 0.3, (Math.random() - 0.5) * 0.3);
      puff.visible = true;
    }
    for (const puff of this.smoke) {
      const u = puff.userData;
      if (u.life <= 0) continue;
      u.life -= dt / 2.2;
      puff.position.addScaledVector(u.drift, dt);
      puff.scale.setScalar((0.06 + (1 - u.life) * 0.5) * u.size);
      puff.material.opacity = Math.max(0, u.life) * (u.size > 1 ? 0.5 : 0.3);
      puff.visible = u.life > 0;
    }
  }

  // Hide or show the whole model (including any smoke still hanging about).
  setVisible(visible) {
    this.root.visible = visible;
    if (!visible) for (const puff of this.smoke) { puff.visible = false; puff.userData.life = 0; }
  }

  // Dress him. look: see currentLook() in systems/cosmetics.js.
  applyLook(look) {
    const M = this.mats, repaint = (material, texture) => { material.map?.dispose(); material.map = texture; material.needsUpdate = true; };
    // Costumes. The body: the hoodie becomes the suit, with a pack on his back, and perhaps another skin.
    // The head: a helmet or an alien's head goes on over his own (and nothing fits in his mouth).
    const body = COSTUMES[look.outfit], masked = !!COSTUMES[look.mask], hoodieColor = body ? body.suit : look.hoodie;
    if (hoodieColor !== this.shownHoodie) {
      this.shownHoodie = hoodieColor;
      repaint(M.hoodie, hoodieTexture(hoodieColor));
      repaint(M.hoodieRib, ribTexture(`#${new THREE.Color(hoodieColor).multiplyScalar(0.8).getHexString()}`));   // cuffs and hem a shade darker
    }
    M.skin.color.set(body?.skin ?? COSTUMES[look.mask]?.skin ?? 0xc99873);
    if (look.outfit !== this.look?.outfit) { this.packHolder.clear(); const pack = buildPack(look.outfit); if (pack) this.packHolder.add(pack); }
    if (look.mask !== this.look?.mask) { this.maskHolder.clear(); this.maskHolder.add(buildMask(look.mask)); }
    this.hood.visible = !masked;
    const bare = look.beanie === 'none' || masked;
    this.beanieDome.visible = this.brim.visible = !bare;
    this.hair.visible = bare && !masked;
    if (!bare && look.beanie !== this.look?.beanie) repaint(M.beanie, ribTexture(look.beanie));
    if (look.deck !== this.look?.deck) {
      repaint(M.wood, look.deck === 'wood' ? null : deckTexture(look.deck));
      M.wood.color.set(look.deck === 'wood' ? 0x9a6a3c : 0xffffff);
    }
    M.urethane.color.set(look.wheels);
    for (const kind in this.mouth) for (const piece of this.mouth[kind]) piece.visible = kind === look.smoke && !masked;
    this.smoking = this.ember.visible = !masked && (look.smoke === 'cigarette' || look.smoke === 'cigar' || look.smoke === 'pipe');
    this.look = { ...look };
    this.paintGun();   // (the gun may have gone gold)
  }

  // The gun in his hand is gold if he owns that finish for it (he holds a pistol until told otherwise).
  paintGun() {
    const gold = !!this.look?.goldGuns.has(this.def?.id || 'pistol'), metal = this.mats.gunmetal;
    metal.color.set(gold ? 0xffc233 : 0x1b1d21);
    metal.emissive.set(gold ? 0x5a3a00 : 0x000000);
    metal.roughness = gold ? 0.3 : 0.45;
  }

  setWeapon(def) {
    this.def = def;
    this.paintGun();
    this.gun = this.guns[def.id] || this.guns.pistol;
    for (const id in this.guns) this.guns[id].group.visible = this.guns[id] === this.gun;
    this.twoHanded = !!def.twoHanded;
    this.supportArm.visible = this.supportHand.visible = this.twoHanded;
    for (const piece of this.offArm) piece.visible = !this.twoHanded;
  }

  onShot() { this.recoil = 0.25; }
}
