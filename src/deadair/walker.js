// You, on foot: Kirky in your own clothes, a gun in his hand and a lamp on his chest.
//
// The mouse looks; the movement keys walk relative to where you look (Shift sprints). The camera sits over his right
// shoulder; hold the right mouse button and it goes to his eyes, first person, down the sights, and he slows to a
// careful walk. The lamp is the only light most of the station has.
import * as THREE from 'three';
import { SkaterModel } from '../player/skaterModel.js';
import { currentLook } from '../systems/cosmetics.js';
import { WEAPONS } from '../player/weapons.js';
import { config } from '../config.js';
import { HEIGHT } from './station.js';
import { readyGuns, rigGun, rigOf } from './reload.js';

export const WALKING = {
  walk: 4.0,          // metres a second
  sprint: 6.6,        // Shift (forward only)
  aimed: 2.3,         // down the sights
  back: 2.9,          // backing off
  accel: 11,          // how quickly he gets up to it
  radius: 0.42,       // how close he gets to a wall
  eye: 1.66,          // first person: the height of his eyes
  shoulder: 0.62,     // over the shoulder: how far right of him the camera is...
  height: 1.72,       // ...how high...
  behind: 2.7,        // ...and how far back
  fov: 72,
  aimFov: 54,
};
// The new clips (tools/build_anims.py: dl/Rifle *.fbx, Reload, rifle melee, Fall Over): which stretch of each is
// played, in seconds of the clip. [from, to]
export const CUTS = {
  start: [0.25, 1.15],    // a long gun: off from standing (then the run takes over)
  stop: [0.1, 1.45],      // ...and pulling up
  down: [0.0, 1.5],       // ...lowering it from the shoulder when he stops aiming
  melee: [0.35, 1.6],     // ...the butt of it (F): played whole, faster than it was caught (meleeRate)
  meleeRate: 1.6,
  jump: [0.75, 1.6],      // a jump (Standing Jump): from his legs straightening (the crouch before it is the game's push)
  rjump: [0.8, 1.6],      // ...with a long gun (Rifle Jump)
  reload: [0.0, 3.6],     // ...a reload, stood
  die: [0.0, 0.75],       // ...going down with it (to his knees: then he sits, gun up)
  bite: [0.0, 0.6],       // bitten: staggering back (the first of falling over; not the fall)
  fall: 1.98,             // down: Fall Over to the floor, where it holds (the clip is 2.03 s)
};
const LIFTED = { lifted: true };   // (a jump, a vault: how high he is is the game's, not the clip's)
const READY = 1.1;        // seconds his gun stays up after he last aimed or fired
const JUMP = { up: 4.4, climb: 5.6, push: 1.6, gravity: 13 };   // m/s up for a jump, for one up onto a crate; forward for that; m/s^2 down
// Over a crate (Space at one, moving at it): seconds it takes, how far past its far side he lands, the part of the clip
// played (the run in to the landing: never the end of it, where he crouches down behind it), how low he rides over it.
const VAULT = { time: 0.62, past: 0.6, clip: [0.32, 1.55], tuck: 0.25 };
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (rate, dt) => 1 - Math.exp(-rate * dt);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// First person, reloading: where the gun goes (added to where it is, as far as the reload has lifted it), for each
// kind of reload: up toward the middle and turned over so that what is being done to it is in front of you (the
// magazine well, the loading port), or (the revolver) its muzzle up to the ceiling for the cases to fall out.
export const VIEW_RELOAD = {
  mag: { x: -0.07, y: 0.075, z: 0.05, rx: 0.2, ry: 0.22, rz: -0.6, tip: 0.08 },
  long: { x: -0.03, y: 0.03, z: -0.1, rx: 0.08, ry: 0.42, rz: -0.45, tip: 0.05 },   // (a rifle: further off, turned to show its side)
  shells: { x: -0.04, y: 0.04, z: -0.1, rx: 0.06, ry: 0.5, rz: -1.0, tip: 0 },
  wheel: { x: -0.09, y: 0.04, z: 0.12, rx: 0.1, ry: 0.3, rz: -0.25, tip: 0.75 },
};
const REST = { mag: 0, fresh: null, slide: 0, pump: 0, shell: null, loader: null, lift: 0, tip: 0, hand: null };
const hv = new THREE.Vector3(), hv2 = new THREE.Vector3(), reAim = new THREE.Vector3();
const to = new THREE.Vector3(), forward = new THREE.Vector3(), right = new THREE.Vector3(), wish = new THREE.Vector3(), look = new THREE.Vector3(), pivot = new THREE.Vector3(), eye = new THREE.Vector3(), want = new THREE.Vector3();

export class Walker {
  constructor(scene, camera, station) {
    this.scene = scene;
    this.camera = camera;
    this.station = station;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = -0.05;
    this.face = 0;          // which way his body faces
    this.aim = 0;           // 0: over the shoulder; 1: first person
    this.walkTime = 0;
    this.aimPoint = new THREE.Vector3();
    this.lookDir = new THREE.Vector3(0, 0, 1);
    this.sprinting = false;
    this.moving = false;
    this.alive = true;
    this.gunUp = true;      // (arms.js: down while he reloads)
    this.focus = Infinity;  // how far off the nearest of them in the lamp's way is (index.js)
    this.crush = 0;         // 1: there is no room behind him for the camera, and it has gone to his eyes
    this.kick = 0;          // the gun in first person, jumping back as it fires
    this.shake = 0;         // the camera, jolted by the shot (and settling)
    this.climb = 0;         // how far the shots have kicked his aim up (it comes back down)
    this.fovPunch = 0;      // the view punched out for an instant by a shot
    this.fovBase = WALKING.fov;
    this.lunge = 0;         // the melee: the gun thrust forward
    this.emote = null;      // a clip of his to play while he stands (the dance, T)
    this.ready = 0;         // >0: his gun is up (he aimed or fired this long ago, less than READY); otherwise it is carried
    this.moveT = 0;         // how long he has been moving
    this.stopT = 9;         // how long since he stopped (after a run)
    this.downT = 9;         // how long since his gun came down from aiming
    this.meleeT = 9;        // how long since the melee
    this.reloadT = 0;       // how long into a reload
    this.bitT = 9;          // how long since he was bitten
    this.fellT = 0;         // how long he has been down
    this.forceClip = null;  // (the tests: { name, at } played instead of whatever he would be doing)
    this.y = 0;             // how high his feet are (a jump; on top of a crate)
    this.vy = 0;
    this.airT = 9;          // how long he has been off the floor (9: he is on it)
    this.gravityScale = 1;  // (low gravity: tonight's modifier)
    this.held = 0;          // seconds something has you by the ankle: no walking, no jumping
    this.lift = 0;          // how far off the floor something has you (the Warden's hand)
    this.push = new THREE.Vector3();   // pulled or shoved by something other than your own legs (the air going out), m/s
    this.liftTo = 0;
    this.crawl = null;      // { from, to, len, yaw, axis, k, scared, back }: in the duct, on your belly
    this.vaulting = false;  // (up onto a crate)
    this.vault = null;      // over one: { from, to, top, t, keep } while he is going over
    this.ground = 0;
    this.jumpHeld = false;
    this.carriedY = null;   // (a height: carried at it, the lift's floor; null: on his own feet)

    const k = (this.model = new SkaterModel(scene));
    k.board.visible = false;
    k.rider.position.y = 0;
    k.rider.rotation.y = 0;
    // (in your own clothes; his guns gold only when the lounge has gilded them: see gild)
    this.look = { ...currentLook(), goldGuns: new Set() };
    try { k.applyLook(this.look); } catch {}
    // First person: his gun (a copy of the one in his hand), out in front of the camera.
    this.view = new THREE.Group();
    this.view.visible = false;
    camera.add(this.view);
    // (a breath of cold light on it from above, so that it is a gun and not a hole in the picture)
    this.viewLight = new THREE.PointLight(0x9fb4ff, 0.7, 1.4, 2);
    this.viewLight.position.set(-0.25, 0.22, -0.2);
    camera.add(this.viewLight);   // (on the camera, never hidden: a light coming and going makes everything recompile)
    scene.add(camera);
    this.setGun('pistol');

    // The lamp: a cone of cold white light from his chest, where he is looking. It casts the only shadows there are.
    this.lamp = new THREE.SpotLight(0xf4f1ff, 170, 34, 0.46, 0.5, 1.7);
    this.lamp.castShadow = true;
    this.lamp.shadow.mapSize.set(1024, 1024);
    this.lamp.shadow.camera.near = 0.3;
    this.lamp.shadow.bias = -0.0004;
    scene.add(this.lamp, this.lamp.target);
    this.lampOn = true;
    this.power = 1;   // how much the lamp is giving (0..1: the scares take it away; never hidden, which would make everything recompile)
    // (and a little of it thrown back off whatever it is on, so the room round you is not pitch black)
    this.spill = new THREE.PointLight(0xc8d2ff, 3, 7, 1.6);
    scene.add(this.spill);
  }

  // Cut the moving parts out of his guns, for reloading (reload.js): once the real ones have arrived.
  async rig() {
    if (!(await readyGuns())) return;
    for (const id of ['pistol', 'machineGun', 'shotgun', 'revolver']) if (this.model.guns[id]) rigGun(this.model.guns[id].group, id);
    this.setGun(this.gun.id);
  }

  setGun(id) {
    this.handOff();
    this.reloadPose = null;   // (a reload of the gun he had is nothing to do with this one)
    this.gun = WEAPONS[id] || WEAPONS.pistol;
    this.model.setWeapon(this.gun);
    this.view.clear();
    const held = this.model.gun, copy = held.group.clone(true);
    copy.position.set(0, 0, 0);
    copy.visible = true;
    copy.traverse((o) => { o.visible = true; if (o.isMesh) { o.castShadow = false; o.renderOrder = 2; } });
    for (const name of ['rig-fresh', 'rig-shell', 'rig-loader']) { const o = copy.getObjectByName(name); if (o) o.visible = false; }
    // (turned so that its barrel points where the camera looks, away down -z; sized as a real one is; and put so that
    // the top of its back end is where the view group is: that is what lines up under the sights)
    const barrel = new THREE.Vector3(held.muzzle.x, 0, held.muzzle.z).normalize();
    copy.quaternion.setFromUnitVectors(barrel.lengthSq() > 0.5 ? barrel : new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1));
    const long = !!(this.gun.twoHanded || id === 'shotgun' || id === 'machineGun');
    const box = new THREE.Box3().setFromObject(copy), size = box.getSize(new THREE.Vector3());
    copy.scale.setScalar((long ? 0.7 : 0.19) / Math.max(0.01, size.z));
    box.setFromObject(copy);
    copy.position.set(-(box.min.x + box.max.x) / 2, -box.max.y, -box.max.z);
    this.viewLong = long;
    this.viewGun = copy;
    this.view.add(copy);
    this.rigK = rigOf(held.group);   // (the moving parts of his gun, and of the copy in front of you)
    this.rigV = rigOf(copy);
  }

  // Reloading: his other hand off the gun (it was on the magazine, the slide, the pump), and his guns as they were.
  handOff() {
    if (!this.handOn) return;
    const k = this.model;
    k.gun.support.copy(this.supportSaved);
    k.twoHanded = !!this.gun.twoHanded;
    k.supportArm.visible = k.supportHand.visible = k.twoHanded;
    for (const piece of k.offArm) piece.visible = !k.twoHanded;
    this.handOn = false;
  }
  // Where his other hand goes, in the gun's own space, while he reloads (null: where it holds the gun anyway).
  handTarget(r, P) {
    if (!r || !P.hand) return null;
    if ((P.hand === 'mag' || P.hand === 'fresh') && !r.seat) return null;
    if (P.hand === 'mag') return hv.copy(r.seat).addScaledVector(r.axis, (P.mag ?? 0.05) + 0.03);
    if (P.hand === 'fresh' && P.fresh != null) return hv.copy(r.seat).addScaledVector(r.axis, P.fresh + 0.03);
    if (P.hand === 'slide') return hv.set(0, 0.045, -0.045);
    if (P.hand === 'pump') return hv.set(0, 0.0, 0.42 - 0.075 * P.pump);
    if (P.hand === 'shell' && r.shell) return hv.copy(r.shell.position);
    if (P.hand === 'loader' && r.loader) return hv.copy(r.loader.position).add(hv2.set(0, -0.01, -0.03));
    return null;
  }
  // The visible gun's parts (the copy in front of you in first person, his own otherwise), and its group.
  get rigNow() { return this.view.visible ? this.rigV : this.rigK; }
  get gunNow() { return this.view.visible ? this.viewGun : this.model.gun.group; }

  // A gun of his gilded (its model's id), or none of them any more (null).
  gild(model) {
    if (model) this.look.goldGuns.add(model); else this.look.goldGuns.clear();
    try { this.model.applyLook(this.look); } catch {}
    this.model.paintGun?.();
  }

  // Where the end of the barrel is now, in the world: the gun in front of your eye, or the one in his hand.
  muzzleNow(out) {
    if (this.view.visible && this.viewGun) { this.camera.updateMatrixWorld(); return this.viewGun.localToWorld(out.copy(this.model.gun.muzzle)); }
    return out.copy(this.model.muzzle);
  }

  // A shot: the aim kicks up (and comes back down), the camera jolts, the view punches out. kick: 1 = the pistol.
  recoil(kick) {
    const up = 0.013 * kick;
    this.pitch += up; this.climb += up;
    this.shake = Math.max(this.shake, 0.045 * kick);
    this.fovPunch += 0.9 * kick;
  }

  spawn(x, z, yaw) {
    this.pos.set(x, 0, z);
    this.vel.set(0, 0, 0);
    this.y = this.vy = this.ground = 0; this.airT = 9; this.vaulting = false; this.vault = null;
    this.y = this.ground = this.station?.groundAt?.(this.pos, 0.18) ?? 0;
    this.yaw = this.face = yaw;
    this.pitch = -0.05;
    this.downed = false;
  }

  // keys: { forward, back, left, right, sprint }  mouse: [dx, dy]  aiming: right button held  firing: left
  // Into the duct: from one hatch toward the other (the camera is at your eyes down there; W on, S back, no gun).
  enterDuct(from, to) {
    const axis = to.clone().sub(from).setY(0), len = axis.length(); axis.divideScalar(len);
    this.crawl = { from: from.clone(), to: to.clone(), len, axis, yaw: Math.atan2(axis.x, axis.z), k: 0.02, scared: false, moving: 0, drop: 0 };
    this.yaw = this.crawl.yaw; this.pitch = 0; this.vel.set(0, 0, 0); this.y = 0; this.vault = null;
  }
  updateCrawl(dt, keys, mouse) {
    const c = this.crawl, W = WALKING, sens = config.camera.mouseSensitivity * 0.6;
    this.yaw = c.yaw + Math.max(-0.55, Math.min(0.55, wrap(this.yaw - c.yaw) - mouse[0] * sens));
    this.pitch = Math.max(-0.35, Math.min(0.45, this.pitch - mouse[1] * sens));
    const ahead = (keys.forward ? 1 : 0) - (keys.back ? 1 : 0);
    c.moving = ahead;
    c.k = Math.max(0, Math.min(1, c.k + ahead * dt * 0.42 / c.len));
    this.pos.lerpVectors(c.from, c.to, c.k); this.y = 0; this.vel.set(0, 0, 0); this.face = c.yaw;
    const k = this.model;
    k.root.position.copy(this.pos); k.root.position.y = 0; k.root.rotation.set(0, c.yaw, 0);
    k.carryInClip = false; k.freeArm = true;
    if (ahead > 0) k.play?.('crawl', 1, 1.1, undefined, true); else if (ahead < 0) k.play?.('crawlback', 1, 1, undefined, true); else k.play?.('crawl', 1, 1, 0.25, true);
    k.updateArm?.(dt, this.aimPoint, false);
    k.updateSmoke?.(dt);
    // (the camera: at your eyes, a hand off the floor, looking down the duct; the lamp with it)
    look.set(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    this.lookDir.copy(look);
    forward.set(Math.sin(c.yaw), 0, Math.cos(c.yaw));
    c.drop = Math.min(1, c.drop + dt / 0.5);   // (down onto his belly: the camera comes down with him, over half a second)
    const dropK = c.drop * c.drop * (3 - 2 * c.drop);
    want.copy(this.pos).addScaledVector(forward, 0.5 - 0.3 * (1 - dropK)).setY(0.52 + (W.eye - 0.52) * (1 - dropK));
    this.camera.position.copy(want);
    this.camera.lookAt(want.x + look.x, want.y + look.y, want.z + look.z);
    this.view.visible = false; k.root.visible = false;
    this.aimPoint.copy(want).addScaledVector(look, 3);
    this.lamp.position.copy(want).addScaledVector(look, 0.3);
    this.lamp.target.position.copy(this.aimPoint);
    this.lamp.intensity = 90 * this.power * (this.lampOn ? 1 : 0);
    if (c.k >= 1) { this.pos.copy(c.to).addScaledVector(c.axis, 0.95); this.crawl = null; this.yaw = c.yaw; k.root.visible = true; }
    else if (c.k <= 0) { this.pos.copy(c.from).addScaledVector(c.axis, -0.95); this.crawl = null; this.yaw = c.yaw + Math.PI; k.root.visible = true; }
  }
  update(dt, keys, mouse, aiming, firing, still = false) {
    if (this.crawl) { this.updateCrawl(dt, keys, mouse); return; }
    if (this.held > 0) { this.held -= dt; still = true; }
    this.lift += (this.liftTo - this.lift) * Math.min(1, dt * 6);
    const W = WALKING, sens = config.camera.mouseSensitivity * (aiming ? 0.75 : 1);
    this.yaw = wrap(this.yaw - mouse[0] * sens);
    this.pitch = Math.max(-1.25, Math.min(1.25, this.pitch - mouse[1] * sens));
    { const back = this.climb * damp(7, dt); this.pitch -= back; this.climb -= back; }   // (the kick settles)
    this.shake *= 1 - damp(7, dt);
    this.fovPunch *= 1 - damp(11, dt);
    this.lunge *= 1 - damp(8, dt);
    forward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    right.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));

    // Walking.
    const ahead = (keys.forward ? 1 : 0) - (keys.back ? 1 : 0), side = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    wish.set(0, 0, 0).addScaledVector(forward, ahead).addScaledVector(right, side);
    if (wish.lengthSq() > 1) wish.normalize();
    this.sprinting = !still && keys.sprint && ahead > 0 && !aiming && !firing;
    const top = (still || this.downed ? 0 : aiming ? W.aimed : this.sprinting ? W.sprint : ahead < 0 ? W.back : W.walk) * (this.carrying ? 0.68 : 1);
    const flying = this.y > this.ground + 0.01 || this.vy > 0;
    this.vel.lerp(wish.multiplyScalar(top), damp(flying ? 2.5 : W.accel, dt));   // (in the air he keeps going the way he went)
    // Space: a jump. At something low in front of him (a crate, a barrel): over it, if he is moving at it and there is
    // floor on its far side; otherwise up onto it.
    if (keys.jump && !this.jumpHeld && !flying && !still && !this.downed && !this.vault) {
      const ledge = this.station.ledge(this.pos, forward);
      const to = ledge && ahead > 0 && this.y < 0.05 ? this.pos.clone().addScaledVector(forward, ledge.far + VAULT.past) : null;
      if (to && ledge.far < 2.6 && this.station.clear(to, W.radius + 0.05) && !this.station.walled(this.pos, to)) {
        this.vault = { from: this.pos.clone(), to, top: ledge.top, t: 0, keep: Math.max(Math.hypot(this.vel.x, this.vel.z), W.walk) };
      } else if (ledge && ledge.top > this.y + 0.2) { this.vy = JUMP.climb * Math.sqrt(Math.max(0.6, (ledge.top - this.y) / 1.1)); this.vel.addScaledVector(forward, JUMP.push); this.vaulting = true; this.airT = 0; }
      else { this.vy = JUMP.up * (this.gravityScale < 1 ? 1.45 : 1); this.airT = 0; }
    }
    this.jumpHeld = !!keys.jump;
    if (this.vault) {
      // (going over: along a line from where he went up to where he lands, riding up over it; nothing low in his way,
      // the walls still are. He lands moving as fast as he went in, the way he is going: no stop, no slowing down.)
      const v = this.vault;
      v.t += dt;
      const s = Math.min(1, v.t / VAULT.time), dir = v.to.clone().sub(v.from);
      this.pos.copy(v.from).addScaledVector(dir, s);
      this.station.collide(this.pos, W.radius, 9);
      this.y = Math.max(0, v.top - VAULT.tuck) * Math.pow(Math.sin(Math.PI * s), 0.55);
      dir.y = 0; dir.normalize();
      this.vel.copy(dir).multiplyScalar(v.keep);
      if (s >= 1) { this.vault = null; this.y = 0; this.vel.copy(dir).multiplyScalar(Math.max(v.keep, top)); }
      this.ground = 0; this.vy = 0; this.airT = 9;
    } else {
      this.pos.addScaledVector(this.vel, dt).addScaledVector(this.push, dt);
      this.push.multiplyScalar(Math.max(0, 1 - 4 * dt));
      this.station.collide(this.pos, W.radius, this.y);
      this.ground = this.station.groundAt(this.pos, 0.18);
      if (this.carriedY != null) { this.y = this.ground = this.carriedY; this.vy = 0; this.airT = 9; }   // (on the lift's floor as it goes up the shaft: where it is, he is)
      else {
      this.vy -= JUMP.gravity * this.gravityScale * dt;
      this.y += this.vy * dt;
      { const top = (this.station.ceilAt ? this.station.ceilAt(this.pos) : 5) - 1.85; if (this.y > top) { this.y = top; this.vy = Math.min(0, this.vy); } }   // (low gravity: the ceiling stops him)
      if (this.y <= this.ground) { this.y = this.ground; this.vy = 0; this.airT = 9; this.vaulting = false; }
      else if (this.airT >= 9 && this.vy <= 0 && this.y - this.ground < 0.35) { this.y = this.ground; this.vy = 0; }   // (down a flight of stairs: his feet stay on them)
      else if (this.airT < 9) this.airT += dt;
      else if (this.y > this.ground + 0.05) this.airT = 0.3;   // (walked off the edge of something)
      }
    }
    const speed = Math.hypot(this.vel.x, this.vel.z);
    this.moving = speed > 0.6;

    // His body: toward where he is going, or where he is looking while he aims or shoots.
    const facing = aiming || firing || speed < 0.4 ? this.yaw : Math.atan2(this.vel.x, this.vel.z) + (ahead < 0 ? Math.PI : 0);
    this.face = wrap(this.face + wrap(facing - this.face) * damp(aiming || firing ? 18 : 9, dt));
    const k = this.model;
    k.root.position.copy(this.pos);
    k.root.position.y = this.y + this.lift;
    k.root.rotation.set(0, this.face, 0);
    const pace = speed / W.walk, long = !!(this.gun.twoHanded || this.gun.id === 'machineGun' || this.gun.id === 'shotgun');
    // How long he has been at what he is doing (the clips that start, stop and change it are played by it).
    const wasReady = this.ready > 0;
    this.ready = aiming || firing ? READY : Math.max(0, this.ready - dt);
    if (wasReady && this.ready <= 0) this.downT = 0; else this.downT += dt;
    if (speed >= 0.3) { this.moveT += dt; } else { if (this.moveT > 0.6) this.stopT = 0; this.moveT = 0; this.stopT += dt; }
    this.meleeT += dt;   // (arms.strike puts it back to 0: the swing)
    this.reloadT = this.reloadPose ? this.reloadT + dt : 0;
    this.bitT += dt;
    this.fellT = this.downed ? this.fellT + dt : 0;
    const within = (cut, t) => t < (cut[1] - cut[0]) / (cut === CUTS.melee ? CUTS.meleeRate : 1);
    if (this.forceClip) { k.carryInClip = !!this.forceClip.carry; k.play?.(this.forceClip.name, 1, 1, this.forceClip.at, !!this.forceClip.whole); k.rider.position.y = 0; }
    else if (this.downed) {
      // (going down: with a long gun, the run that ends in the fall; then sat on the floor with his gun)
      // (going down: Fall Over, the whole of it, and he stays where it leaves him, flat out; his gun arm is still his own)
      k.play?.('fallover', 1, 1, Math.min(CUTS.fall, this.fellT), false); k.rider.position.y = 0;
    } else {
      k.rider.position.y = 0;
      let clip = null, rate = 1, at, whole = false, how = null;
      k.carryInClip = false;
      if (within(CUTS.bite, this.bitT)) { clip = 'fallover'; at = CUTS.bite[0] + this.bitT; }
      else if (within(CUTS.melee, this.meleeT)) { clip = 'riflemelee'; at = CUTS.melee[0] + this.meleeT * CUTS.meleeRate; whole = true; k.carryInClip = true; }   // (all of him: the swing is in his arms, the gun in his hand)
      else if (this.vault) { clip = 'vault'; at = VAULT.clip[0] + (VAULT.clip[1] - VAULT.clip[0]) * Math.min(1, this.vault.t / VAULT.time); how = LIFTED; }
      else if (this.airT < 9) { clip = long ? 'riflejump' : 'jump'; at = (long ? CUTS.rjump : CUTS.jump)[0] + Math.min(this.airT, 0.9) * (this.vaulting ? 1.4 : 1); how = LIFTED; }
      else if (this.emote && speed < 0.3) { k.play?.(this.emote, 1, 1, undefined, true); clip = false; }
      else if (speed < 0.3) {
        if (long && this.reloadPose && within(CUTS.reload, this.reloadT)) { clip = 'reload'; at = CUTS.reload[0] + this.reloadT; }
        else if (long && within(CUTS.stop, this.stopT) && !this.ready) { clip = 'riflestop'; at = CUTS.stop[0] + this.stopT; }
        else if (long && within(CUTS.down, this.downT)) { clip = 'rifledown'; at = CUTS.down[0] + this.downT; }
        else clip = long ? 'breathe' : this.ready > 0 ? 'pistolidle' : 'idle';   // (a pistol not in use: his hands are his own, not round a gun that is at his side)
      } else if (this.sprinting) { clip = long ? 'riflesprint' : 'sprint'; rate = long ? Math.max(0.8, speed / W.sprint) : 0.95 + 0.1 * pace; }
      else if (long && (aiming || ahead < 0 || this.ready > 0)) { clip = 'riflewalk'; rate = Math.max(0.55, pace) * (ahead < 0 ? -1 : 1); }
      else if (long && within(CUTS.start, this.moveT)) { clip = 'riflestart'; at = CUTS.start[0] + this.moveT; }
      else if (long) { clip = 'riflerun'; rate = Math.max(0.7, speed / W.walk); }
      else { clip = 'walk'; rate = Math.max(0.55, pace) * (ahead < 0 ? -1 : 1); }
      if (clip) k.play?.(clip, 1, rate, at, whole, how);
    }
    this.walkTime += dt * speed;
    k.updateSmoke?.(dt);

    // The camera: over the shoulder, or (aiming) at his eyes.
    this.aim = lerp(this.aim, aiming ? 1 : 0, damp(aiming ? 16 : 11, dt));
    const eyes = Math.max(this.aim, this.crush);   // (how far the camera has gone to his eyes: aiming, or no room behind him)
    look.set(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    this.lookDir.copy(look);
    const low = this.downed ? 0.62 : 0;   // (sat on the floor: his eyes, and the camera over his shoulder, come down with him)
    eye.set(this.pos.x, W.eye - low + this.y + this.lift, this.pos.z).addScaledVector(forward, 0.12);
    pivot.set(this.pos.x, W.height - low * 0.8 + this.y + this.lift, this.pos.z).addScaledVector(right, W.shoulder);
    // (never through a wall: pulled in to whatever is between him and where it wants to be; and if that leaves no
    // room to see him by, it goes to his eyes rather than sit in the back of his head)
    const shoulderAt = pivot.clone(), roomBehind = W.behind;
    to.copy(look).multiplyScalar(-1);
    const room = this.station.ray(shoulderAt, to, roomBehind + 0.3) - 0.3;
    this.crush = lerp(this.crush, room < 1.15 && !aiming ? 1 : 0, damp(room < 1.15 ? 14 : 5, dt));
    const back = Math.max(0.05, Math.min(W.behind, room)) * (1 - eyes);
    want.copy(pivot).addScaledVector(look, -back).lerp(eye, eyes);
    want.x += (Math.random() - 0.5) * this.shake; want.y += (Math.random() - 0.5) * this.shake; want.z += (Math.random() - 0.5) * this.shake;
    want.y = Math.max(0.3, Math.min(HEIGHT - 0.25, want.y));
    this.camera.position.copy(want);
    this.camera.lookAt(want.x + look.x, want.y + look.y, want.z + look.z);
    this.fovBase = lerp(this.fovBase, lerp(W.fov, W.aimFov, this.aim) + (this.sprinting ? 6 : 0), damp(12, dt));
    this.camera.fov = this.fovBase + this.fovPunch;
    this.camera.updateProjectionMatrix();
    k.root.visible = eyes < 0.55;
    // (first person: his gun in front of you, swaying with his steps, jumping as it fires)
    this.view.visible = eyes >= 0.55;
    this.viewLight.intensity = this.view.visible ? 0.7 : 0;
    if (this.view.visible) {
      this.kick *= Math.exp(-18 * dt);
      const bob = Math.min(1, speed / W.walk) * (1 - 0.7 * this.aim), step = this.walkTime * 2.1;
      // (down the sights: its back end just under the middle of the view; from the hip: down and to the right)
      // (low and a little to the right even down the sights: what you are shooting at stays clear, the gun is at the edge of it)
      const near = this.viewLong ? 0.2 : 0.32, hip = 1 - this.aim;
      this.view.position.set(0.075 + 0.085 * hip + 0.012 * Math.sin(step) * bob, -0.085 - 0.07 * hip - 0.008 * Math.abs(Math.cos(step)) * bob + (this.gunUp ? 0 : -0.2), -near + 0.05 * this.kick);
      this.view.rotation.set(0.22 * this.kick + (this.gunUp ? 0 : -0.6), 0.05 * hip, 0);
      // (the melee: thrust forward and over, and back)
      this.view.position.z -= 0.24 * this.lunge; this.view.position.x -= 0.05 * this.lunge;
      this.view.rotation.x += 0.45 * this.lunge; this.view.rotation.z -= 0.4 * this.lunge;
      // (reloading: brought up and in, and turned over to get at it: its magazine well toward you; the shotgun the
      // other way, its loading port; the revolver's muzzle up to the ceiling for the cases to fall out)
      const P = this.reloadPose;
      if (P) {
        const V = (P.kind === 'mag' && this.viewLong ? VIEW_RELOAD.long : VIEW_RELOAD[P.kind]) || VIEW_RELOAD.mag, L = P.lift;
        this.view.position.x += V.x * L; this.view.position.y += V.y * L; this.view.position.z += V.z * L;
        this.view.rotation.x += V.rx * L + V.tip * (P.tip || 0);
        this.view.rotation.y += V.ry * L;
        this.view.rotation.z += V.rz * L;
      }
    }

    // What the crosshair is on: where his gun points.
    const reach = this.station.ray(this.camera.position, look, 80);
    this.aimPoint.copy(this.camera.position).addScaledVector(look, reach);
    // Reloading: every part where the reload has it, on both guns; his gun up in front of his chest, and his other hand
    // on the work (the magazine, the slide, the pump, a shell, the speedloader).
    const P = this.reloadPose;
    placeParts(this.rigK, P);
    placeParts(this.rigV, P);
    if (P) {
      if (!this.handOn) {
        this.handOn = true;
        this.supportSaved = (this.supportSaved || new THREE.Vector3()).copy(k.gun.support);
        this.handAt = (this.handAt || new THREE.Vector3()).copy(k.gun.support);
        k.twoHanded = true;
        k.supportArm.visible = k.supportHand.visible = true;
        for (const piece of k.offArm) piece.visible = false;
      }
      this.handAt.lerp(this.handTarget(this.rigK, P) || this.supportSaved, damp(16, dt));
      k.gun.support.copy(this.handAt);
      reAim.set(this.pos.x + Math.sin(this.face) * 0.85, 1.32 + 0.35 * (P.tip || 0), this.pos.z + Math.cos(this.face) * 0.85);
      k.updateArm(dt, reAim, true);
    } else {
      this.handOff();
      // (his gun arm is aimed by hand, never by a clip: up at what the crosshair is on while he is using it, or thrust
      // forward for the melee; otherwise it comes down and he carries it. Only a dance has all of him, the gun put away.)
      const dancing = (!!this.emote && speed < 0.3) || within(CUTS.melee, this.meleeT);   // (and the melee: the clip has both arms)
      k.freeArm = dancing;
      const thrust = this.meleeT < 0.45, up = this.ready > 0 || this.view.visible;
      // (a long gun not in use: carried at low ready, its muzzle down in front of him and both hands on it, never
      // hanging off one arm while the other reaches for nothing; a pistol hangs at his side)
      const lowReady = long && !up && !thrust && !dancing;
      if (thrust) reAim.set(this.pos.x + Math.sin(this.face) * 2, 1.25 + this.y, this.pos.z + Math.cos(this.face) * 2);
      else if (lowReady) reAim.set(this.pos.x + Math.sin(this.face) * 2.2, (this.sprinting ? 0.2 : 0.35) + this.y, this.pos.z + Math.cos(this.face) * 2.2);
      k.updateArm(dt, thrust || lowReady ? reAim : this.aimPoint, !dancing && this.gunUp && (lowReady || thrust || (up && !this.sprinting)));
    }

    // The lamp: from his chest, where he looks (from the camera itself in first person, so its circle is on the sights).
    const power = this.lampOn ? this.power : 0;
    // (in first person, from just in front of the gun, so that the gun is a shape against what it lights, not burnt white)
    this.lamp.position.copy(this.pos).setY(1.45 + this.y).addScaledVector(right, 0.18).lerp(want.copy(this.camera.position).addScaledVector(look, 0.9).addScaledVector(this.camera.up, -0.08), eyes);
    this.lamp.target.position.copy(this.aimPoint);
    // (and, like an eye, it does not burn white on what is right in front of it: the nearer what it lights, the less of it)
    this.lamp.intensity = power * 170 * Math.max(0.12, Math.min(1, (Math.min(reach, this.focus) / 5) ** 1.6));
    this.spill.position.copy(this.aimPoint).addScaledVector(look, -1.2);
    this.spill.intensity = power * 2.2 * Math.min(1, 9 / Math.max(1, reach));
  }

  dispose() {
    this.model.setVisible?.(false);
    this.scene.remove(this.model.root, this.lamp, this.lamp.target, this.spill);
  }
}

// Put a rigged gun's moving parts where a reload's pose says (no pose: all where they belong).
function placeParts(r, P) {
  if (!r) return;
  P ||= REST;
  if (r.mag) { r.mag.visible = P.mag != null; if (r.mag.visible) r.mag.position.copy(r.axis).multiplyScalar(P.mag); }
  if (r.fresh) { r.fresh.visible = P.fresh != null; if (r.fresh.visible) r.fresh.position.copy(r.axis).multiplyScalar(P.fresh); }
  if (r.slide) r.slide.position.z = -0.032 * (P.slide || 0);
  if (r.pump) r.pump.position.z = -0.075 * (P.pump || 0);
  if (r.shell) {
    r.shell.visible = P.shell != null;
    if (r.shell.visible) {   // (up from under the gun to the port, and pushed in forward)
      const s = P.shell, start = hv.copy(r.port).add(hv2.set(0, -0.1, -0.04)), end = hv2.copy(r.port).add(new THREE.Vector3(0, 0.004, 0.07));
      if (s < 0.55) r.shell.position.copy(start).lerp(r.port, s / 0.55);
      else r.shell.position.copy(r.port).lerp(end, (s - 0.55) / 0.45);
    }
  }
  if (r.loader) {
    r.loader.visible = P.loader != null;
    if (r.loader.visible) r.loader.position.copy(r.breech).add(hv.set(-0.03, -0.1, -0.1).multiplyScalar(1 - P.loader)).add(hv2.set(0, 0, -0.014));
  }
}
