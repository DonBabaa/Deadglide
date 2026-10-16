// =====================================================================================
//   The way into DEAD AIR, from the Moon: the freight lift.
// =====================================================================================
//
// Behind you as you arrive, a little way off in the plaza: a lit sign on a post, SHACKLETON STATION · MAINTENANCE
// ACCESS, an arrow, and a runway of floor lights to a square steel cage on the dust: an industrial lift, its gate
// open, a green lamp on. Roll in. In a party, everyone has to be aboard: the lamp goes amber and a klaxon counts
// down only once the last of you is in; step off and it waits. Then the gate shuts and down it goes (it is the
// way to Shackleton Station: src/deadair/, by way of cutscenes.lift).
//
//   const airlock = createAirlock({ scene, onEnter });
//   airlock.setVisible(on)                      (built the first time it is wanted, from the station's own kit)
//   airlock.update(dt, me, others)              me: the skater's position; others: the party's (ride.positions())
//   airlock.aboard / party / waiting            how many are in, of how many; waiting: you are, they are not
//   airlock.force()                             as if everyone were in (the editor)
//   airlock.cage                                the group that is the lift (the cut-in's shaft is built round it)
import * as THREE from 'three';
import { MOON, moonHeight } from '../world/moon.js';
import { loadKit, signTexture } from '../deadair/station.js';
import { playPortalOpen, playHatch } from '../fx/audio.js';

// Where: south of the middle (behind you as you arrive, facing north), on the level plaza, clear of the Base.
const AT = new THREE.Vector3(MOON.x + 4, 0, MOON.z + 13);
AT.y = moonHeight(AT.x, AT.z);
const TURN = 0.35;                                                         // (not square to anything: it was dropped there)
const HALF = 2.0;                                                          // half the cage's width (the kit's plate is 4 m)
const SIGN_AT = new THREE.Vector3(MOON.x + 1.2, 0, MOON.z + 5.2);         // the sign on its post, between spawn and the lift
SIGN_AT.y = moonHeight(SIGN_AT.x, SIGN_AT.z);
const COUNT = 3.2;                                                         // seconds of klaxon once everyone is aboard

export function createAirlock({ scene, onEnter }) {
  const group = new THREE.Group();
  group.position.copy(AT);
  group.rotation.y = TURN;
  group.visible = false;
  scene.add(group);
  const cage = new THREE.Group();
  group.add(cage);
  let built = null, entered = false, time = 0, countdown = -1, gate = 0, forced = false;
  let holdOpen = false;

  async function build() {
    const pieces = await loadKit();
    const dark = new THREE.MeshStandardMaterial({ color: 0x3a3b3f, metalness: 0.4, roughness: 0.7 });
    const put = (parent, name, x, y, z, yaw = 0) => {
      const p = pieces[name]; if (!p) { console.warn(`The lift: no piece ${name} in the kit`); return null; }
      const c = p.clone(true); c.position.set(x, y, z); c.rotation.y = yaw;
      c.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
      parent.add(c);
      return c;
    };
    // The cage: the kit's plate for a floor, rails on three sides, four posts and a frame over the top, two lamps.
    put(cage, 'Platform_Metal', 0, 0.02, 0, 0);
    for (const [x, z, yaw] of [[-(HALF - 0.2), 0, Math.PI / 2], [HALF - 0.2, 0, -Math.PI / 2], [0, HALF - 0.2, Math.PI]]) put(cage, 'Platform_Rails_4', x, 0.02, z, yaw);
    for (const [x, z] of [[-HALF, -HALF], [HALF, -HALF], [-HALF, HALF], [HALF, HALF]]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.2, 0.16), dark); post.position.set(x, 1.6, z); post.castShadow = true; cage.add(post); }
    for (const [x, z, w, d] of [[0, -HALF, HALF * 2 + 0.16, 0.16], [0, HALF, HALF * 2 + 0.16, 0.16], [-HALF, 0, 0.16, HALF * 2], [HALF, 0, 0.16, HALF * 2]]) { const beam = new THREE.Mesh(new THREE.BoxGeometry(w, 0.18, d), dark); beam.position.set(x, 3.25, z); cage.add(beam); }
    const lamp = new THREE.PointLight(0x3aff6a, 2.2, 7, 1.6); lamp.position.set(0, 3.0, 0); cage.add(lamp);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: 0x3aff6a, toneMapped: false })); bulb.position.set(0, 3.05, 0); cage.add(bulb);
    const klaxon = new THREE.PointLight(0xff8a2a, 0, 9, 1.4); klaxon.position.set(0, 2.6, -HALF + 0.3); cage.add(klaxon);
    put(cage, 'Prop_AccessPoint', HALF - 0.35, 1.2, HALF - 0.45, Math.PI);   // (the call panel, on the back rail)
    // The gate: two door halves that slide apart (open) along the front.
    const halves = [-1, 1].map((side) => {
      const h = put(cage, 'Door_Metal', 0, 0.02, -HALF + 0.1, side < 0 ? 0 : Math.PI);
      if (h) h.userData.side = side;
      return h;
    }).filter(Boolean);
    // The sign over the gate, and the one on the post by spawn with the arrow; the runway of floor lights between them.
    const over = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), new THREE.MeshBasicMaterial({ map: signTexture('SHACKLETON STATION', 'MAINTENANCE ACCESS  ·  DECK C', '#9ae6ff', '#ffd27a'), transparent: true, toneMapped: false }));
    over.position.set(0, 2.55, -HALF - 0.12); over.rotation.y = Math.PI; cage.add(over);
    const post = new THREE.Group(); post.position.copy(SIGN_AT); scene.add(post);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 2.4, 10), dark); pole.position.y = 1.2; post.add(pole);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshBasicMaterial({ map: signTexture('SHACKLETON STATION  →', 'MAINTENANCE ACCESS  ·  ALL ABOARD', '#9ae6ff', '#ffd27a'), transparent: true, side: THREE.DoubleSide, toneMapped: false }));
    board.position.y = 2.2; board.rotation.y = Math.atan2(MOON.x - SIGN_AT.x, MOON.z - SIGN_AT.z); post.add(board);
    const boardLight = new THREE.PointLight(0x9ae6ff, 1.6, 6, 1.5); boardLight.position.y = 2.6; post.add(boardLight);
    const runway = [];
    for (let i = 0; i <= 5; i++) {
      const k = i / 5, x = SIGN_AT.x + (AT.x - 1.2 - SIGN_AT.x) * k, z = SIGN_AT.z + (AT.z - 2.6 - SIGN_AT.z) * k;
      const l = put(scene, 'Prop_Light_Floor', x, moonHeight(x, z) + 0.02, z, 0);
      if (l) runway.push(l);
    }
    built = { halves, lamp, bulb, klaxon, post, runway };
    group.userData.extras = [post, ...runway];
    for (const o of group.userData.extras) o.visible = group.visible;
  }

  const local = new THREE.Vector3();
  const inside = (p) => { local.copy(p); group.worldToLocal(local); return Math.abs(local.x) < HALF - 0.1 && Math.abs(local.z) < HALF - 0.1 && p.y < AT.y + 2.5; };

  const airlock = {
    aboard: 0, party: 1, waiting: false,
    get open() { return countdown >= 0 || entered; },
    get place() { return AT; },
    get signAt() { return SIGN_AT; },   // (the post by spawn: the cutscenes keep their cameras clear of it)
    get cage() { return cage; },
    get lamp() { return AT; },
    setVisible(on) {
      group.visible = on;
      for (const o of group.userData.extras || []) o.visible = on;
      if (on && !built) build().catch((error) => console.warn('The lift could not be built.', error));
    },
    reset() { entered = false; countdown = -1; gate = 0; forced = false; holdOpen = false; },
    // The gate held open (the roll-in of the way down; the arrival back at the surface): nothing counts, nothing shuts.
    holdGate(on) { holdOpen = !!on; },
    // The gate put where a cutscene wants it (0 open, 1 shut), at once: nothing updates the lift while one plays.
    setGate(k) { gate = Math.min(1, Math.max(0, k)); if (!built) return; const e = gate * gate * (3 - 2 * gate); for (const h of built.halves) h.position.x = h.userData.side * (HALF * 0.96 * (1 - e) + 0.02); },
    unseal() {},                 // (kept for the party messages of the old hatch: nothing to unseal now)
    shot() { return false; },    // (nothing to shoot either)
    force() { forced = true; },  // (the editor: as if everyone were aboard)
    update(dt, pos, others = []) {
      if (!built || !group.visible) return;
      time += dt;
      const me = !!pos && inside(pos), in_ = others.filter((o) => inside(o)).length, all = me && in_ === others.length;
      airlock.aboard = (me ? 1 : 0) + in_; airlock.party = 1 + others.length; airlock.waiting = me && !all && countdown < 0;
      if (!entered) {
        if ((all || forced) && countdown < 0) { countdown = COUNT; playPortalOpen(); }
        else if (countdown > 1.0 && !(all || forced)) countdown = -1;   // (somebody stepped off: it waits)
        if (countdown >= 0) { countdown -= dt; if (countdown <= 0) { entered = true; playHatch(); onEnter?.(); } }
      }
      gate = Math.min(1, Math.max(0, gate + ((countdown >= 0 || entered) && !holdOpen ? dt / 1.2 : -dt / 0.9)));
      const k = gate * gate * (3 - 2 * gate);
      for (const h of built.halves) h.position.x = h.userData.side * (HALF * 0.96 * (1 - k) + 0.02);
      const counting = countdown >= 0 && !entered;
      built.klaxon.intensity = counting ? (Math.sin(time * 18) > 0 ? 7 : 0.4) : entered ? 3 : 0;
      built.lamp.color.set(counting || entered ? 0xff8a2a : 0x3aff6a);
      built.bulb.material.color.set(counting || entered ? 0xff8a2a : 0x3aff6a);
      built.lamp.intensity = 2.2 + (counting ? 1.5 * Math.max(0, Math.sin(time * 18)) : 0);
      for (let i = 0; i < built.runway.length; i++) built.runway[i].visible = group.visible && Math.sin(time * 4 - i * 0.9) > -0.6;   // (chasing, up the runway toward it)
    },
  };
  return airlock;
}
