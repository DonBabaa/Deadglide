// The others, in DEAD AIR: your friends from the Moon (the Free Ride party: freeride/ride.js carries the messages).
// Each is drawn here as they say they are, about twelve times a second: their Kirky in their own clothes, the gun in
// their hand, walking or sprinting or down on the floor, their lamp lighting what they look at, the flash and streak
// of every shot they fire (and its sound, from where they are), and their name over their head.
//
// What one says about themselves (STATE): where they are and which way they face and look, how they are moving, which
// gun, how many shots fired so far (and where the last went), down, out (bled out), in the lounge, and their points.
//
//   const others = new Others(scene, sound);
//   others.hear(id, state)       a state arrived      others.update(dt, camera)      each frame
//   others.list()                [{ id, name, pos, eye, alive, safe, downed, points, ... }] (for the host: who the dead go after)
import * as THREE from 'three';
import { SkaterModel } from '../player/skaterModel.js';
import { WEAPONS } from '../player/weapons.js';
import { GUNS } from './arms.js';

// x z: where.  face: their body's heading.  yaw pitch: where they look.  speed, sprint, aim (0..1): how they move.
// gun: which.  shots: fired so far.  ex ey ez: where the last went.  down, out, safe: 1 or 0.  pts: points.  hp: health.
export const STATE = ['x', 'z', 'face', 'yaw', 'pitch', 'speed', 'sprint', 'aim', 'shots', 'ex', 'ey', 'ez', 'down', 'out', 'safe', 'pts', 'hp', 'bleed', 'rl', 'mic', 'y', 'air', 'mel', 'st', 'hr', 'ck', 'rv', 'cb', 'lx', 'lz', 'ly', 'em'];
const GONE_AFTER = 15000;   // (milliseconds of silence before a friend is taken to have gone: building the lounge can hold their browser a while)
const LAMPS = 3;   // (a lamp each, made up front: a light coming or going makes everything recompile)

export class Others {
  constructor(scene, sound) {
    this.scene = scene;
    this.sound = sound;
    this.map = new Map();   // id -> one of them
    this.lamps = Array.from({ length: LAMPS }, () => {
      const lamp = new THREE.SpotLight(0xf4f1ff, 0, 30, 0.46, 0.5, 1.7);
      scene.add(lamp, lamp.target);
      return { lamp, who: null };
    });
    this.tracer = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(6 * 8), 3)), new THREE.LineBasicMaterial({ color: 0xffe6b0, transparent: true, opacity: 0.8, toneMapped: false }));
    this.tracer.frustumCulled = false;
    this.tracer.geometry.setDrawRange(0, 0);
    scene.add(this.tracer);
    this.streaks = [];
  }

  // A friend carried by someone (or set down: null): they are drawn on that one's back from now on.
  carried(id, by) { const o = this.map.get(id); if (o) o.carriedBy = by; }
  // A friend's lamp, by hand (the way in: each clicks on in its turn): at `pos`, or off (null).
  lamp(id, pos) {
    const o = this.map.get(id); if (!o) return;
    let L = this.lamps.find((l) => l.who === id) || this.lamps.find((l) => !l.who);
    if (!L) return;
    L.who = id;
    L.lamp.intensity = pos ? 140 : 0;
    if (pos) { L.lamp.position.copy(pos).setY(1.45); L.lamp.target.position.copy(pos).add(new THREE.Vector3(Math.sin(o.face), 0, Math.cos(o.face)).multiplyScalar(6)).setY(1.2); }
  }
  // A friend's newest state. name, look, gun: who they are (sent with it now and then).
  hear(id, s, name, look, gunId) {
    let o = this.map.get(id);
    if (!o) {
      const model = new SkaterModel(this.scene);
      model.board.visible = false;
      model.rider.position.y = 0;
      model.rider.rotation.y = 0;
      const tag = nameTag(name || 'Friend');
      this.scene.add(tag);
      o = { id, name: name || 'Friend', model, tag, pos: new THREE.Vector3(s.x, 0, s.z), eye: new THREE.Vector3(), face: s.face, s, heard: 0, shots: s.shots, gun: '', look: null, walkTime: 0 };
      this.map.set(id, o);
    }
    if (name && name !== o.name) { this.scene.remove(o.tag); o.tag = nameTag(name); this.scene.add(o.tag); o.name = name; }
    if (look) o.lookRaw = look;
    if (look && JSON.stringify(look) !== o.lookKey) { o.lookKey = JSON.stringify(look); try { o.model.applyLook({ ...look, goldGuns: new Set(look.gilded || []) }); } catch {} }
    if (gunId && gunId !== o.gun) { o.gun = gunId; o.model.setWeapon(WEAPONS[GUNS[gunId]?.model] || WEAPONS.pistol); }
    // Shots since we last heard: a flash, a streak to where the last went, and its sound, from where they are.
    if (s.shots > o.shots) {
      o.flash = 0.06;
      const end = new THREE.Vector3(s.ex, s.ey, s.ez);
      this.streaks.push({ from: o.model.muzzle.clone(), to: end, life: 0.07 });
      const G = GUNS[o.gun] || GUNS.pistol;
      this.sound?.shotFrom?.(o.pos.clone().setY(1.4), G.model);
    }
    o.shots = s.shots;
    o.s = s;
    o.heard = performance.now();
    return o;
  }

  remove(id) {
    const o = this.map.get(id);
    if (!o) return;
    o.model.setVisible?.(false);
    this.scene.remove(o.model.root, o.tag);
    for (const l of this.lamps) if (l.who === id) { l.who = null; l.lamp.intensity = 0; }
    this.map.delete(id);
  }
  clear() { for (const id of [...this.map.keys()]) this.remove(id); }

  // Who is out there, for the host's dead to go after (and for the revive prompt, and the HUD).
  list() { return [...this.map.values()].map((o) => ({ id: o.id, name: o.name, pos: o.pos, eye: o.eye, alive: !o.s.down && !o.s.out, safe: !!o.s.safe, downed: !!o.s.down, out: !!o.s.out, points: o.s.pts || 0, bleed: o.s.bleed || 0, hp: o.s.hp, mic: !!o.s.mic, st: !!o.s.st, hr: !!o.s.hr, ck: !!o.s.ck, rv: !!o.s.rv, cb: !!o.s.cb, face: o.face, carriedBy: o.carriedBy || null, lx: o.s.lx || 0, lz: o.s.lz || 0, ly: o.s.ly || 0, em: o.s.em || 0, look: o.lookRaw || null })); }

  update(dt, mePos = null, meYaw = 0) {
    const now = performance.now();
    for (const o of [...this.map.values()]) if (now - o.heard > GONE_AFTER) this.remove(o.id);
    // their lamps go to the first three of them
    let li = 0;
    for (const o of this.map.values()) {
      const s = o.s, k = o.model;
      const inside = !!s.safe;
      k.root.visible = !inside;
      o.tag.visible = !inside;
      if (inside) continue;
      // Glide to where they said they were (carried: on the carrier's back, whoever that is).
      let tx = s.x, tz = s.z;
      if (o.carriedBy) { const c = o.carriedBy === 'me' ? (mePos ? { pos: mePos, face: meYaw } : null) : this.map.get(o.carriedBy); if (c) { const f = c.face ?? c.yaw ?? 0; tx = c.pos.x - Math.sin(f) * 0.35; tz = c.pos.z - Math.cos(f) * 0.35; } }
      o.pos.x += (tx - o.pos.x) * Math.min(1, dt * 12); o.pos.z += (tz - o.pos.z) * Math.min(1, dt * 12);
      if (Math.hypot(tx - o.pos.x, tz - o.pos.z) > 6) o.pos.set(tx, 0, tz);
      o.face += Math.atan2(Math.sin(s.face - o.face), Math.cos(s.face - o.face)) * Math.min(1, dt * 12);
      o.y = (o.y || 0) + ((s.y || 0) - (o.y || 0)) * Math.min(1, dt * 14);
      o.eye.set(o.pos.x, 1.6 + o.y, o.pos.z);
      k.root.position.copy(o.pos);
      k.root.position.y = o.y;
      k.root.rotation.set(0, o.face, 0);
      // What they are doing: down (sat on the floor, gun up), or walking, sprinting, stood with it.
      const long = !!(WEAPONS[GUNS[o.gun]?.model]?.twoHanded || o.gun === 'shotgun' || o.gun === 'machineGun');
      if (o.forceClip) { k.play?.(o.forceClip.name, 1, 1, o.forceClip.at, false); k.rider.position.y = 0; }   // (a cinematic has them: the way in's heap)
      else if (o.carriedBy) { k.play?.('sitgun', 1, 1, undefined, false, { seated: true, upright: 0.5 }); k.rider.position.y = 0.3; }
      else if (s.down || s.out) { k.play?.('sitgun', 1, 1, undefined, false, { seated: true, upright: 0.2 }); k.rider.position.y = -0.62; }
      else {
        k.rider.position.y = 0;
        // (the swing: all of them, the gun in their hand; off the floor: the jump)
        o.melT = s.mel && !o.wasMel ? 0 : (o.melT ?? 9) + dt; o.wasMel = !!s.mel;
        o.airT = s.air ? (o.airT ?? 0) + dt : 0;
        k.carryInClip = o.melT < 0.75;
        if (o.melT < 0.75) k.play?.('riflemelee', 1, 1, 0.35 + o.melT * 1.6, true);
        else if (s.air) k.play?.(long ? 'riflejump' : 'jump', 1, 1, (long ? 0.2 : 0.55) + Math.min(o.airT, 0.9), false);
        else {
          const clip = s.speed < 0.3 ? (long ? 'breathe' : 'pistolidle') : s.sprint ? 'sprint' : long ? 'riflewalk' : 'walk';
          k.play?.(clip, 1, s.speed < 0.3 ? 1 : Math.max(0.55, s.speed / 4), undefined, false);
        }
      }
      // Their gun: up at what they are looking at (down while they run or reload).
      const look = new THREE.Vector3(Math.sin(s.yaw) * Math.cos(s.pitch), Math.sin(s.pitch), Math.cos(s.yaw) * Math.cos(s.pitch));
      const aimAt = o.eye.clone().addScaledVector(look, 20);
      k.freeArm = !!s.sprint || o.melT < 0.75;
      k.updateArm(dt, aimAt, !s.sprint && !s.rl && !s.down);
      if (o.flash > 0) { o.flash -= dt; k.onShot(); }
      // Their lamp.
      if (li < this.lamps.length) {
        const L = this.lamps[li++];
        L.who = o.id;
        L.lamp.intensity = s.out ? 0 : 140;
        L.lamp.position.copy(o.pos).setY(1.45 + o.y);
        L.lamp.target.position.copy(aimAt);
      }
      // Their name: over their head, the same size on screen however far off (red, and DOWN, when they are down).
      const far = Math.max(1, o.pos.distanceTo(this.scene.userData.eye || o.pos) / 8);
      o.tag.scale.set(1.6 * far, 0.5 * far, 1);
      o.tag.position.copy(o.pos).setY(2.25 + 0.25 * far);
      setTagState(o.tag, s.down ? 'down' : s.out ? 'out' : '');
    }
    for (; li < this.lamps.length; li++) { this.lamps[li].lamp.intensity = 0; this.lamps[li].who = null; }
    // The streaks of their shots.
    const pos = this.tracer.geometry.attributes.position;
    this.streaks = this.streaks.filter((t) => (t.life -= dt) > 0).slice(-8);
    this.streaks.forEach((t, i) => { pos.setXYZ(i * 2, t.from.x, t.from.y, t.from.z); pos.setXYZ(i * 2 + 1, t.to.x, t.to.y, t.to.z); });
    pos.needsUpdate = true;
    this.tracer.geometry.setDrawRange(0, this.streaks.length * 2);
  }
}

// A name over a friend's head: drawn over everything, so you can find them through a wall.
function nameTag(name) {
  const c = Object.assign(document.createElement('canvas'), { width: 512, height: 160 });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, fog: false }));
  tag.renderOrder = 20;
  tag.userData = { canvas: c, name: name.slice(0, 16).toUpperCase(), state: null };
  setTagState(tag, '');
  return tag;
}
function setTagState(tag, state) {
  const u = tag.userData;
  if (u.state === state) return;
  u.state = state;
  const g = u.canvas.getContext('2d');
  g.clearRect(0, 0, 512, 160);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '64px Anton, Impact, sans-serif';
  g.lineWidth = 10; g.strokeStyle = 'rgba(0,0,0,0.85)';
  const colour = state === 'down' ? '#ff3a2a' : state === 'out' ? '#8a8a8a' : '#e8e2d6';
  g.strokeText(u.name, 256, 52, 480); g.fillStyle = colour; g.fillText(u.name, 256, 52, 480);
  if (state) {
    g.font = '44px Anton, Impact, sans-serif';
    const text = state === 'down' ? '✚ DOWN: HOLD E' : 'BLED OUT';
    g.strokeText(text, 256, 120, 480); g.fillText(text, 256, 120, 480);
  }
  tag.material.map.needsUpdate = true;
}
