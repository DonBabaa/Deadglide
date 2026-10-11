// The scene behind the main menu: Kirky leaning on a tomb, smoking, his
// board propped up beside him, taking the odd pot-shot into the dark.
// It is set up in the real world next to the spawn point and hidden in play.
// Once you have finished the game it moves to the Moon (setPlace): he leans on a supply crate out on the plain,
// the lander behind him, a sniper rifle in his hand, and now and then a saucer goes over in the distance.
import * as THREE from 'three';
import { SkaterModel } from '../player/skaterModel.js';
import { heightAt, SPAWN } from '../world/terrain.js';
import { stoneTexture } from '../world/textures.js';
import { playShot, playSniper, playBossIntro, playThunder } from '../fx/audio.js';
import { WEAPONS } from '../player/weapons.js';
import { hud } from '../ui/hud.js';

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
    this.decor = { earth: [], moon: [] };   // what he leans on, in each place
    let place = 'earth', material = stone;
    const block = (w, h, d, x, y, z) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z);
      mesh.castShadow = mesh.receiveShadow = true;
      this.group.add(mesh);
      this.decor[place].push(mesh);
      return mesh;
    };
    block(2.5, 0.5, 1.2, 0.2, -0.05, -0.75);    // plinth (sunk a little, in case the ground slopes)
    block(2.3, 0.75, 1.0, 0.2, 0.55, -0.75);    // tomb
    block(2.42, 0.1, 1.12, 0.2, 0.97, -0.75);   // lid
    // A cross standing in the ground at the head of the tomb.
    block(0.6, 0.4, 0.5, -1.5, 0.1, -0.75);       // its footing
    block(0.2, 1.55, 0.16, -1.5, 1.05, -0.75);    // upright
    block(0.8, 0.2, 0.16, -1.5, 1.42, -0.75);     // arms
    // ...and on the Moon: a supply crate the same size, strapped, with a marker pole and its light where the cross was.
    place = 'moon';
    material = new THREE.MeshStandardMaterial({ color: 0xb9bcc2, roughness: 0.55, metalness: 0.3 });
    block(2.5, 0.2, 1.2, 0.2, 0.0, -0.75);      // its skid
    block(2.3, 0.85, 1.0, 0.2, 0.55, -0.75);    // the crate
    material = new THREE.MeshStandardMaterial({ color: 0xd9a52a, roughness: 0.5, metalness: 0.4 });
    block(0.14, 0.9, 1.04, -0.5, 0.55, -0.75);  // two straps
    block(0.14, 0.9, 1.04, 0.9, 0.55, -0.75);
    block(2.34, 0.06, 1.04, 0.2, 0.99, -0.75);  // its lid
    material = new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.6, metalness: 0.5 });
    block(0.5, 0.12, 0.5, -1.5, 0.06, -0.75);   // the foot of the pole
    block(0.07, 2.3, 0.07, -1.5, 1.2, -0.75);   // the pole
    material = new THREE.MeshBasicMaterial({ color: 0x7dffb0, toneMapped: false });
    block(0.16, 0.16, 0.16, -1.5, 2.4, -0.75);  // its light
    for (const mesh of this.decor.moon) mesh.visible = false;
    this.moon = false;

    // The saucer: a long way off behind him, crossing now and then.
    this.saucer = new THREE.Group();
    const hull = new THREE.MeshStandardMaterial({ color: 0x8f97a3, roughness: 0.35, metalness: 0.7 });
    this.saucer.add(new THREE.Mesh(new THREE.CylinderGeometry(2.2, 4.6, 0.8, 24), hull), new THREE.Mesh(new THREE.CylinderGeometry(4.6, 3, 0.5, 24), hull));
    this.saucer.children[1].position.y = -0.6;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1.9, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x9dffe0, transparent: true, opacity: 0.75, toneMapped: false }));
    dome.position.y = 0.35;
    this.saucer.add(dome);
    this.saucerLights = [];
    for (let i = 0; i < 8; i++) {
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), new THREE.MeshBasicMaterial({ color: 0x7dffb0, toneMapped: false }));
      bulb.position.set(Math.cos((i / 8) * Math.PI * 2) * 3.9, -0.45, Math.sin((i / 8) * Math.PI * 2) * 3.9);
      this.saucer.add(bulb);
      this.saucerLights.push(bulb);
    }
    this.saucer.scale.setScalar(1.6);
    this.saucer.visible = false;
    scene.add(this.saucer);
    this.saucerWait = 6;   // seconds until it next comes over
    this.saucerT = -1;     // how far across it is (0..1), or -1: not about

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

  // You have just finished the game: the title screen gets its own cut-in. The gold cigarette, very close; Kirky
  // from the ground up, and the title; a long way back; and then the menu, as it was.
  celebrate() {
    this.cut = { t: 0, marks: {} };
    document.body.classList.add('title-cut');
  }
  endCut() {
    if (!this.cut) return;
    this.cut = null;
    document.body.classList.remove('title-cut');
    hud.flash(null);
    hud.lines(0);
    hud.hideBossIntro();
  }

  // Where the menu is: the cemetery (false), or, once the game is finished, the Moon (true). Call after the level
  // has been changed, so the ground it stands on is the right ground.
  setPlace(moon) {
    this.moon = moon;
    const x0 = moon ? SPAWN.x - 20.9 : SPAWN.x + 7, z0 = moon ? SPAWN.z - 0.3 : SPAWN.z + 9;   // (on the Moon: out on the plain, the lander behind him)
    this.origin.set(x0, heightAt(x0, z0), z0);
    this.group.position.copy(this.origin);
    this.kirky.root.position.copy(this.origin);
    for (const mesh of this.decor.earth) mesh.visible = !moon;
    for (const mesh of this.decor.moon) mesh.visible = moon;
    this.kirky.setWeapon(moon ? WEAPONS.sniper : WEAPONS.pistol);
    this.tracer.scale.z = moon ? 3 : 1;
    this.saucer.visible = false;
    this.saucerT = -1;
    this.saucerWait = 5;
  }

  setVisible(visible) {
    if (!visible) { this.endCut(); this.saucer.visible = false; }
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
      this.shotsLeft = this.moon ? 1 : 1 + Math.floor(Math.random() * 3);   // (the rifle: one at a time)
      this.shotTimer = this.moon ? 0.9 : 0.55;   // time to bring the gun up first
      this.nextBurst = (this.moon ? 6 : 4) + Math.random() * 5;
      const a = FACING + (Math.random() - 0.5) * 0.9;
      this.target.set(this.origin.x + Math.sin(a) * 70, this.origin.y + 1 + Math.random() * 2, this.origin.z + Math.cos(a) * 70);
    }
    const aiming = this.shotsLeft > 0;
    k.updateArm(dt, this.target, aiming);
    if (aiming && (this.shotTimer -= dt) <= 0) {
      this.shotsLeft--;
      this.shotTimer = 0.22;
      k.onShot();
      if (this.moon) playSniper(); else playShot();   // (silent until the first click, like all browser audio)
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

    // The Moon: every so often a saucer crosses the sky behind him, bobbing, its lights going round.
    if (this.moon && this.visible) {
      if (this.saucerT < 0 && (this.saucerWait -= dt) <= 0) { this.saucerT = 0; this.saucerSide = Math.random() < 0.5 ? -1 : 1; this.saucerHigh = 8 + Math.random() * 9; }
      if (this.saucerT >= 0) {
        this.saucerT += dt / 11;
        const back = v.set(-Math.sin(FACING), 0, -Math.cos(FACING)), across = (this.saucerT - 0.5) * 2 * this.saucerSide * 90 + 35;   // (centred a little to his right: the lander is in the way on the left)
        this.saucer.position.copy(this.origin).addScaledVector(back, 95);
        this.saucer.position.x += -back.z * across;
        this.saucer.position.z += back.x * across;
        this.saucer.position.y += this.saucerHigh + Math.sin(this.time * 1.7) * 2.5;
        this.saucer.rotation.set(Math.sin(this.time * 1.3) * 0.12, this.time * 0.8, Math.cos(this.time * 1.1) * 0.12);
        this.saucerLights.forEach((bulb, i) => bulb.material.color.setHSL(0.4, 1, 0.35 + 0.35 * Math.max(0, Math.sin(this.time * 9 - i * 0.8))));
        this.saucer.visible = true;
        if (this.saucerT >= 1) { this.saucerT = -1; this.saucer.visible = false; this.saucerWait = 14 + Math.random() * 16; }
      }
    }

    // Idle life: breathing, and the smoke.
    k.torso.rotation.x = 0.1 + Math.sin(this.time * 1.3) * 0.015;
    k.updateSmoke(dt);

    // Camera: off to his side, drifting slightly. He sits to the right of the
    // frame so the menu has the left.
    const sway = Math.sin(this.time * 0.25) * 0.25;
    this.camera.position.set(-2.1 + sway, 1.45, 3.7).applyAxisAngle(THREE.Object3D.DEFAULT_UP, FACING).add(this.origin);
    this.camera.lookAt(v.set(-1.0, 1.05, 0).applyAxisAngle(THREE.Object3D.DEFAULT_UP, FACING).add(this.origin));
    this.camera.fov = 42;
    if (this.cut) {
      const c = this.cut, t = (c.t += dt), CUTS = [0, 1.3, 2.9, 4.0], smooth = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
      const fwd = new THREE.Vector3(Math.sin(FACING), 0, Math.cos(FACING)), side = new THREE.Vector3(fwd.z, 0, -fwd.x), head = new THREE.Vector3();
      k.root.updateMatrixWorld(true);
      k.torso.localToWorld(head.set(0, 0.78, 0));
      const once = (name, at, fn) => { if (t >= at && !c.marks[name]) { c.marks[name] = true; fn(); } };
      if (t < CUTS[1]) {            // the cigarette
        this.camera.position.copy(head).addScaledVector(fwd, 0.7).addScaledVector(side, 0.28);
        this.camera.lookAt(v.copy(head).addScaledVector(fwd, 0.12));
        this.camera.fov = 30 - 9 * smooth(t / 0.14);
      } else if (t < CUTS[2]) {     // from the ground, up at him
        this.camera.position.copy(this.origin).addScaledVector(fwd, 2.7 - 0.4 * smooth((t - CUTS[1]) / 1.6)).addScaledVector(side, -1.1);
        this.camera.position.y += 0.3;
        this.camera.lookAt(head);
        this.camera.fov = 56 - 12 * smooth((t - CUTS[1]) / 0.14);
      } else if (t < CUTS[3]) {     // a long way back
        this.camera.position.copy(this.origin).addScaledVector(fwd, 9).addScaledVector(side, -4);
        this.camera.position.y += 3.5;
        this.camera.lookAt(v.copy(this.origin).setY(this.origin.y + 1));
        this.camera.fov = 40;
      }
      once('thunder', 0, () => playThunder());
      once('title', CUTS[1], () => { playBossIntro(); hud.bossIntro('The house lost', 'DeadSlide'); });
      let pop = 0;
      for (const at of CUTS) if (t >= at) pop = Math.max(pop, Math.exp(-(t - at) * 8));
      hud.flash('#ffffff', pop * 0.85);
      hud.lines(t >= CUTS[1] && t < CUTS[2] ? 0.8 : 0);
      if (t > CUTS[3] + 0.5) this.endCut();
    }
    this.camera.updateProjectionMatrix();
  }
}
