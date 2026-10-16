// The lift: the industrial cage the party came down in, and the only way back out. It stands in the lift cell at the
// west end of the Arrival Bay, under a shaft that goes up thirty-four metres to the Moon. Down, its gate open, it is a
// room you walk into (its walls are solid); up, the cell is open floor under the dark square of the shaft. The story
// moves it: it leaves without you at the end of the way in, comes back down when the signal is answered, and takes
// everyone up at the end. The shaft's top hatch is what fails in a decompression: open, the stars show through it.
//
//   const lift = createLift({ scene, pieces, boxes });
//   lift.at, lift.half, lift.state ('down' | 'up' | 'coming' | 'leaving'), lift.y
//   lift.setDown() / lift.setUp()       at once (a new game: down, for the way in)
//   lift.call(secs) / lift.leave(secs)  the cage on its way (the gate shuts first, opens when it lands)
//   lift.gate(k) / lift.gateK           the gate: 0 shut .. 1 open (slides itself when it lands or leaves)
//   lift.hatch(k) / lift.hatchK         the top hatch: 0 shut .. 1 open (the decompression)
//   lift.rails                          where you stand to hold on inside it (world points)
//   lift.lever, lift.panel, lift.post   the lever inside; the call panel and the sign post by the gate, outside
//   lift.inside(pos), lift.runway(on), lift.lamp(colour), lift.update(dt)
import * as THREE from 'three';
import { CELL, HEIGHT, signTexture, LIFT_CELL } from './station.js';
import { buildFreightCage } from './freight.js';

export const LIFT_BAY = { i: LIFT_CELL.i, j: LIFT_CELL.j, x: LIFT_CELL.i * CELL, z: LIFT_CELL.j * CELL, half: 1.95, shaft: 34 };
const SHAFT_TOP = HEIGHT + LIFT_BAY.shaft;   // (the hatch)
const UP_Y = SHAFT_TOP - 3.6;                 // (where the cage waits, out of the way up the shaft)

export function createLift({ scene, pieces, boxes }) {
  const H = LIFT_BAY.half, at = new THREE.Vector3(LIFT_BAY.x, 0, LIFT_BAY.z);
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a3b3f, metalness: 0.4, roughness: 0.7 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x8a8c92, metalness: 0.8, roughness: 0.4 });
  const put = (parent, name, x, y, z, yaw = 0) => {
    const p = pieces[name]; if (!p) { console.warn(`The lift: no piece ${name} in the kit`); return null; }
    const c = p.clone(true); c.position.set(x, y, z); c.rotation.y = yaw;
    c.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
    parent.add(c);
    return c;
  };

  // ---- The cage: the Moon's freight lift (deadair/freight.js), the very one you came down in, its doors on the east,
  // toward the bay. (It was the kit's plate with rails, posts and a pair of steel doors: not the lift of the way down.)
  const cage = new THREE.Group(); cage.position.copy(at); scene.add(cage);
  const body = new THREE.Group(); body.rotation.y = -Math.PI / 2; cage.add(body);   // (built with its doors toward -z: turned to the east)
  const F = buildFreightCage(body, pieces, { half: H, height: 3.3 });
  const cutLight = new THREE.PointLight(0xffd9a0, 0, 7, 1.6); cutLight.position.set(0, 2.4, 0); cage.add(cutLight);   // (for the cinematics: the cage lit from inside)
  const lampLight = F.lamp, bulb = F.bulb;   // (its caged work lamp, up on the front of the roof: amber down here, flashing on the way)
  lampLight.intensity = 2.4;
  put(cage, 'Prop_AccessPoint', -(H - 0.35), 1.2, 0.6, -Math.PI / 2);   // (the panel on the back wall)
  // (the lever: a box on the back wall with a handle standing up; pulled, it lies back)
  const leverBox = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.26, 0.2), steel); leverBox.position.set(-(H - 0.3), 1.15, -0.7); cage.add(leverBox);
  const handle = new THREE.Group(); handle.position.set(-(H - 0.3), 1.28, -0.7); cage.add(handle);
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.5, 8), steel); stick.position.y = 0.25; handle.add(stick);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshStandardMaterial({ color: 0xe8291c, roughness: 0.4 })); knob.position.y = 0.5; handle.add(knob);
  // The gate: its two mesh doors (0 shut .. 1 open: the freight cage's own run the other way).
  let gateK = 1;
  const gate = (k) => { gateK = Math.max(0, Math.min(1, k)); F.placeLeaves(1 - gateK); };
  gate(1);

  // ---- The shaft: four walls up from the bay's ceiling, a red strip every two metres, the hatch at the top and the stars behind it
  const shaft = new THREE.Group(); shaft.position.set(at.x, 0, at.z); scene.add(shaft);
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x24262a, metalness: 0.5, roughness: 0.75 });
  const stripMat = new THREE.MeshBasicMaterial({ color: 0xff2a14, toneMapped: false });
  const W = H * 2 + 1.0, SH = LIFT_BAY.shaft;
  for (const [x, z, w, d] of [[0, -W / 2, W, 0.3], [0, W / 2, W, 0.3], [-W / 2, 0, 0.3, W], [W / 2, 0, 0.3, W]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, SH, d), wallMat); m.position.set(x, HEIGHT + SH / 2, z); shaft.add(m);
    for (let y = HEIGHT + 1; y < SHAFT_TOP; y += 2) { const r = new THREE.Mesh(new THREE.BoxGeometry(w > 1 ? w * 0.8 : 0.04, 0.05, d > 1 ? d * 0.8 : 0.04), stripMat); r.position.set(x * 0.9, y, z * 0.9); shaft.add(r); }
  }
  // (the lip round the opening in the bay's ceiling)
  for (const [x, z, w, d] of [[0, -W / 2, W + 0.6, 0.6], [0, W / 2, W + 0.6, 0.6], [-W / 2, 0, 0.6, W], [W / 2, 0, 0.6, W]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, d), dark); m.position.set(x, HEIGHT - 0.15, z); shaft.add(m); }
  // (the hatch: a plate across the top that slides aside; the stars, a dark sky past it, lit faintly from above)
  const hatch = new THREE.Mesh(new THREE.BoxGeometry(W, 0.3, W), new THREE.MeshStandardMaterial({ color: 0x45474c, metalness: 0.7, roughness: 0.5 })); hatch.position.set(0, SHAFT_TOP, 0); shaft.add(hatch);
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(W * 6, W * 6), new THREE.MeshBasicMaterial({ map: starTexture(), toneMapped: false, fog: false })); sky.position.set(0, SHAFT_TOP + 1.2, 0); sky.rotation.x = Math.PI / 2; shaft.add(sky);
  const skyLight = new THREE.SpotLight(0x9ec8ff, 0, 60, 0.35, 0.6, 1.2); skyLight.position.set(0, SHAFT_TOP + 0.5, 0); skyLight.target.position.set(0, 0, 0); shaft.add(skyLight, skyLight.target);
  let hatchK = 0;
  const setHatch = (k) => { hatchK = Math.max(0, Math.min(1, k)); hatch.position.x = W * hatchK; skyLight.intensity = 40 * hatchK; };
  setHatch(0);
  // ---- Outside the gate: the post with the sign and the call panel; the runway of floor lights from the Spine to the gate
  const post = new THREE.Group(); post.position.set(at.x + H + 0.9, 0, at.z + H + 0.5); scene.add(post);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 2.4, 10), dark); pole.position.y = 1.2; post.add(pole);
  // (two faces back to back, each reading the right way, each arrow pointing at the cage)
  for (const [yaw, arrow] of [[Math.PI / 2, '◄  THE WAY OUT'], [-Math.PI / 2, 'THE WAY OUT  ►']]) {
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.75), new THREE.MeshBasicMaterial({ map: signTexture('LIFT', arrow, '#9ae6ff', '#ffd27a'), transparent: true, toneMapped: false }));
    face.position.set(0, 2.1, 0); face.rotation.y = yaw; post.add(face);
  }
  const panel = put(post, 'Prop_AccessPoint', 0, 1.25, -0.25, Math.PI / 2);
  const postLight = new THREE.PointLight(0x9ae6ff, 1.6, 6, 1.6); postLight.position.set(0, 2.4, 0); post.add(postLight);
  const runway = [];
  for (let i = 0; i < 7; i++) { const l = put(scene, 'Prop_Light_Floor', at.x + H + 1.2 + i * 2.4, 0.02, at.z + (i % 2 ? 1.1 : -1.1), 0); if (l) { l.visible = false; runway.push(l); } }
  const runwayLights = runway.map((l) => { const p = new THREE.PointLight(0x9ae6ff, 0, 3.5, 1.8); p.position.copy(l.position).setY(0.4); scene.add(p); return p; });

  // ---- Solid: its walls when the cage is down (you walk in through the doors)
  const railBoxes = [
    { x0: at.x - H - 0.1, x1: at.x - H + 0.25, z0: at.z - H, z1: at.z + H, top: 3.3, lift: null },   // (the back, the sides: mesh, to the roof)
    { x0: at.x - H, x1: at.x + H, z0: at.z - H - 0.1, z1: at.z - H + 0.25, top: 3.3, lift: null },
    { x0: at.x - H, x1: at.x + H, z0: at.z + H - 0.25, z1: at.z + H + 0.1, top: 3.3, lift: null },
    { x0: at.x + H - 0.25, x1: at.x + H + 0.1, z0: at.z - H, z1: at.z - H + 0.3, top: 3.3, lift: null },   // (the corner posts either side of the doorway)
    { x0: at.x + H - 0.25, x1: at.x + H + 0.1, z0: at.z + H - 0.3, z1: at.z + H, top: 3.3, lift: null },
  ];
  const api = {
    at, half: H, state: 'down', y: 0, gateK: 1, hatchK: 0, group: cage, shaft, hatch,
    rails: [at.clone().add(new THREE.Vector3(-H + 0.7, 0, -0.9)), at.clone().add(new THREE.Vector3(-H + 0.7, 0, 0.9)), at.clone().add(new THREE.Vector3(0.2, 0, -H + 0.7)), at.clone().add(new THREE.Vector3(0.2, 0, H - 0.7))],
    lever: at.clone().add(new THREE.Vector3(-H + 0.6, 1.2, -0.7)),
    panel: post.position.clone().setY(1.25), post: post.position.clone(),
    get solid() { return api.state === 'down'; },
    inside(p) { return api.state === 'down' && Math.abs(p.x - at.x) < H - 0.15 && Math.abs(p.z - at.z) < H - 0.15; },
    gate, hatch: setHatch,
    lamp(colour) { lampLight.color.set(colour); bulb.material.color.set(colour); },
    light(k) { cutLight.intensity = 4.5 * k; },
    runway(on) { for (const l of runway) l.visible = !!on; for (const p of runwayLights) p.intensity = on ? 1.2 : 0; },
    setDown() { api.state = 'down'; api.y = 0; cage.position.y = 0; gate(1); api.lamp(0xffb347); api.pulled(false); },
    setUp() { api.state = 'up'; api.y = UP_Y; cage.position.y = UP_Y; gate(0); api.lamp(0xff8a2a); },
    // The cage on its way: down (called) or up (leaving). The gate shuts first; it opens again as it lands.
    call(secs = 12) { if (api.state === 'coming') return; api.state = 'coming'; api.tripFor = secs; api.tripT = 0; api.from = api.y; api.to = 0; gate(0); api.lamp(0xffb347); },
    leave(secs = 10) { if (api.state === 'leaving') return; api.state = 'leaving'; api.tripFor = secs; api.tripT = 0; api.from = api.y; api.to = UP_Y; gate(0); api.lamp(0xff8a2a); },
    pulled(on) { handle.rotation.x = on ? -1.25 : 0; },
    reset() { api.setDown(); setHatch(0); api.runway(false); api.pulled(false); },
    update(dt) {
      if (api.state === 'coming' || api.state === 'leaving') {
        api.tripT += dt;
        const k = Math.min(1, api.tripT / api.tripFor);
        // (slow off the mark, fast in the middle, slow to a stop)
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        api.y = api.from + (api.to - api.from) * e;
        cage.position.y = api.y;
        bulb.material.color.setHex(Math.floor(api.tripT * 4) % 2 ? 0xff8a2a : 0x3a2a10); lampLight.intensity = Math.floor(api.tripT * 4) % 2 ? 2.4 : 0.8;
        if (k >= 1) { api.state = api.to === 0 ? 'down' : 'up'; if (api.state === 'down') { gate(1); api.lamp(0xffb347); lampLight.intensity = 2.4; } }
      }
      api.gateK = gateK; api.hatchK = hatchK;
      api.landed = api.state === 'down' && api.tripT !== undefined && api.tripT >= api.tripFor;
    },
  };
  for (const b of railBoxes) { b.lift = api; boxes.push(b); }
  api.setDown();
  return api;
}

// A dark sky with stars, for the top of the shaft.
function starTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#03040a'; g.fillRect(0, 0, 512, 512);
  let seed = 9;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 1400; i++) { const a = 0.45 + rnd() * 0.55, r = rnd() < 0.08 ? 3.2 : 1.6 + rnd(); g.fillStyle = `rgba(255,255,255,${a})`; g.beginPath(); g.arc(rnd() * 512, rnd() * 512, r, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
