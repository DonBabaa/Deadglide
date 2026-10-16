// =====================================================================================
//   The way into DEAD AIR, from the Moon: the freight lift.
// =====================================================================================
//
// Behind you as you arrive, a little way off in the plaza: a freight lift on the dust (his picture): a frame of dark
// square tube, wire mesh between, two mesh doors under a lit sign, a call panel, and a caged lamp over the doors. It is
// sealed: its call button is locked out, a cover and a padlock over it (freeride/lockout.js): shoot the lock off (shot();
// a friend's shot comes as unseal()) and the doors open. Walk in, and say you are ready
// (E: toggleReady); once everyone in it is, the doors shut and down it goes (it is the way to Shackleton Station:
// src/deadair/, by way of cutscenes.lift). The post with its sign and the runway of lights are gone; signAt is where
// the post stood, kept as a line for the cutscenes' cameras to keep off.
//
//   const airlock = createAirlock({ scene, onEnter });
//   airlock.setVisible(on)                      (built the first time it is wanted, from the station's own kit)
//   airlock.update(dt, me, others)              me: the skater's position; others: the party's (ride.positions())
//   airlock.aboard / party / waiting            how many are in, of how many; waiting: you are, they are not
//   airlock.force()                             as if everyone were in (the editor)
//   airlock.cage                                the group that is the lift (the cut-in's shaft is built round it)
import * as THREE from 'three';
import { MOON, moonHeight } from '../world/moon.js';
import { loadKit } from '../deadair/station.js';
import { buildFreightCage } from '../deadair/freight.js';   // (the cage itself: the same one the station's lift is)
import { buildLockout } from './lockout.js';
import { playPortalOpen, playHatch, playClang, playSnap } from '../fx/audio.js';

// Where: south of the middle (behind you as you arrive, facing north), on the level plaza, clear of the Base.
const AT = new THREE.Vector3(MOON.x + 4, 0, MOON.z + 13);
AT.y = moonHeight(AT.x, AT.z);
const TURN = 0.35;                                                         // (not square to anything: it was dropped there)
const HALF = 2.0;                                                          // half the cage's width (the kit's plate is 4 m)
const SIGN_AT = new THREE.Vector3(MOON.x + 1.2, 0, MOON.z + 5.2);         // the sign on its post, between spawn and the lift
SIGN_AT.y = moonHeight(SIGN_AT.x, SIGN_AT.z);
const COUNT = 3.2;                                                         // seconds of klaxon once everyone is aboard and ready
export function createAirlock({ scene, onEnter }) {
  const group = new THREE.Group();
  group.position.copy(AT);
  group.rotation.y = TURN;
  group.visible = false;
  scene.add(group);
  const cage = new THREE.Group();
  group.add(cage);
  let built = null, entered = false, time = 0, countdown = -1, gate = 0, forced = false;
  let holdOpen = false, insideMe = false;

  async function build() {
    const pieces = await loadKit();
    // The cage, as a freight lift is (his picture): deadair/freight.js, the same cage the station's lift is.
    built = buildFreightCage(cage, pieces, { half: HALF, height: 3.3 });
    // (and the lock on its call button: what is shot to open it. The lamp on the roof is its light, no more)
    lockout = buildLockout(cage, { x: HALF + 0.17, y: 1.35, z: -HALF - 0.1 });
    lockout.clank = () => playClang();
    if (!locked) lockout.break();
    group.userData.extras = [];
  }

  const local = new THREE.Vector3();
  const inside = (p) => { local.copy(p); group.worldToLocal(local); return Math.abs(local.x) < HALF - 0.1 && Math.abs(local.z) < HALF - 0.1 && p.y < AT.y + 2.5; };

  // The leaves: closed (k 1) they meet in the middle of the front, open (0) each stands beyond its side.
  const placeLeaves = (k) => built.placeLeaves(k);
  // Locked until somebody shoots the lock off its call button; then, everyone in it says they are ready (E), and down it goes.
  let locked = true, meReady = false, lockout = null;
  const ray = new THREE.Ray();
  // (what it says, at the foot of the screen, near it: see main.js for the key)
  const tell = document.createElement('div');
  tell.id = 'lift-ready';
  document.getElementById('hud')?.append(tell);
  let told = '';
  const say = (text) => { if (text !== told) { tell.innerHTML = text; told = text; } tell.classList.toggle('on', !!text); };

  const airlock = {
    aboard: 0, party: 1, waiting: false, ready: 0,
    get open() { return countdown >= 0 || entered; },
    get place() { return AT; },
    get signAt() { return SIGN_AT; },   // (where the post with its sign stood: the cutscenes still keep their cameras off that line)
    get cage() { return cage; },
    get lamp() { return AT; },
    get locked() { return locked; },
    get lockout() { return lockout; },   // (the tests)
    get meReady() { return meReady; },
    get meInside() { return insideMe; },
    setVisible(on) {
      group.visible = on;
      for (const o of group.userData.extras || []) o.visible = on;
      if (on && !built) build().catch((error) => console.warn('The lift could not be built.', error));
      if (!on) say('');
    },
    // (back from the station: it stays unlocked; nobody is ready)
    reset() { entered = false; countdown = -1; gate = locked ? 1 : 0; forced = false; holdOpen = false; meReady = false; },
    // The gate held open (the roll-in of the way down; the arrival back at the surface): nothing counts, nothing shuts.
    holdGate(on) { holdOpen = !!on; },
    // The gate put where a cutscene wants it (0 open, 1 shut), at once: nothing updates the lift while one plays.
    setGate(k) { gate = Math.min(1, Math.max(0, k)); if (built) placeLeaves(gate); },
    // The lock shot off its call button (by you: shot(); by a friend: unseal()): unlocked, the lamp goes green, the doors open.
    unseal() { if (!locked) return; locked = false; lockout?.break(); playSnap(); playPortalOpen(); },
    shot(origin, dir, reach = 400) {
      if (!locked || !built || !group.visible || !lockout) return false;
      ray.set(origin, dir);
      const at = lockout.where(new THREE.Vector3());
      if (at.distanceTo(origin) > reach || !lockout.hit(ray)) return false;
      airlock.unseal();
      return true;
    },
    toggleReady() { if (insideMe && !locked && !entered) { meReady = !meReady; return true; } return false; },
    force() { forced = true; locked = false; },  // (the editor: as if everyone were aboard)
    // others: the party's positions; ready: whether each of them has said so (ride.js)
    update(dt, pos, others = [], ready = []) {
      if (!built || !group.visible) return;
      time += dt;
      lockout?.update(dt);
      insideMe = !!pos && inside(pos);
      if (!insideMe) meReady = false;   // (out of it: not ready)
      const inOthers = others.map((o) => inside(o)), in_ = inOthers.filter(Boolean).length;
      const readyOthers = others.filter((o, k) => inOthers[k] && ready[k]).length;
      const all = insideMe && meReady && readyOthers === others.length;
      airlock.aboard = (insideMe ? 1 : 0) + in_; airlock.party = 1 + others.length; airlock.ready = (meReady ? 1 : 0) + readyOthers;
      airlock.waiting = insideMe && meReady && !all && countdown < 0;
      if (!entered && !locked) {
        if ((all || forced) && countdown < 0) { countdown = COUNT; playPortalOpen(); }
        else if (countdown > 1.0 && !(all || forced)) countdown = -1;   // (somebody stepped off, or is not ready: it waits)
        if (countdown >= 0) { countdown -= dt; if (countdown <= 0) { entered = true; playHatch(); onEnter?.(); } }
      }
      gate = Math.min(1, Math.max(0, gate + ((locked || countdown >= 0 || entered) && !holdOpen ? dt / 1.2 : -dt / 0.9)));
      placeLeaves(gate);
      const counting = countdown >= 0 && !entered;
      built.klaxon.intensity = counting ? (Math.sin(time * 18) > 0 ? 7 : 0.4) : entered ? 3 : 0;
      const c = locked ? 0xff2a14 : counting || entered ? 0xff8a2a : 0x3aff6a;
      built.lamp.color.set(c); built.bulb.material.color.set(c); built.screen.material.color.set(locked ? 0xff5040 : meReady ? 0x7dffb0 : 0x9ae6ff);
      built.lamp.intensity = locked ? 1.4 + 1.2 * Math.max(0, Math.sin(time * 3)) : 2.2 + (counting ? 1.5 * Math.max(0, Math.sin(time * 18)) : 0);
      // what it says (near it, in Free Ride)
      const near = !!pos && Math.hypot(pos.x - AT.x, pos.z - AT.z) < 14;
      if (!near || entered) say('');
      else if (locked) say('');   // (locked: nothing said. The lock on its button is there to be seen, and shot)
      else if (!insideMe) say('<b>THE LIFT</b> <span>·</span> get in');
      else if (counting) say('<b>GOING DOWN</b>');
      else if (!meReady) say(`<b>READY CHECK</b> <span>·</span> <kbd>E</kbd> ready <span>·</span> ${airlock.ready} of ${airlock.party} ready`);
      else say(`<b>READY</b> <span>·</span> waiting for the others <span>·</span> ${airlock.ready} of ${airlock.party} ready  ·  <kbd>E</kbd> not ready`);
    },
  };
  return airlock;
}
