// The crate in the Reactor: put your points in and it rolls through its guns, faster and faster, over its open lid,
// and stops on one. Take it (E) before it sinks back in. Anything but the gun in your hand.
//
//   const crate = createCrate({ scene, at, pieces, guns: walker.model.guns, sound });
//   crate.offer(meNear) -> { text, price, act } or null        crate.update(dt)
import * as THREE from 'three';
import { GUNS, CRATE_GUNS } from './arms.js';
import { signTexture } from './station.js';

const ROLL = 2.4, HOLD = 9;   // seconds it rolls; seconds you have to take it

export function createCrate({ scene, at, price = 950, pieces, guns, sound }) {
  const group = new THREE.Group();
  group.position.set(at.x, 0, at.z);
  scene.add(group);
  if (pieces.Prop_Chest) { const c = pieces.Prop_Chest.clone(true); c.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; }); group.add(c); }
  // Its glow (it is the one warm-coloured thing in the Reactor): a light, and a beam straight up out of it while it rolls.
  const glow = new THREE.PointLight(0x7ad8ff, 9, 10, 1.6);
  glow.position.set(0, 1.4, 0.3);
  group.add(glow);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.0, 7, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0x9ae6ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  beam.position.y = 3.6;
  group.add(beam);
  // Seen from across the room, in the dark: two rings of light wobbling over it, and a sign hung above that says
  // what it is and what it costs (it turns, so it reads from anywhere).
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x9ae6ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.035, 10, 48), ringMat);
  ring.position.y = 2.05; group.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.028, 10, 48), ringMat);
  ring2.position.y = 2.35; group.add(ring2);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.85), new THREE.MeshBasicMaterial({ map: signTexture('MYSTERY CRATE', `${price}  ·  a random gun`, '#9ae6ff', '#ffd27a'), transparent: true, toneMapped: false }));
  sign.position.set(0, 3.05, 0); group.add(sign);
  const signBack = sign.clone(); signBack.position.set(0, 0, -0.01); signBack.rotation.y = Math.PI; sign.add(signBack);   // (and the same on its back: it reads from either side)
  const signGlow = new THREE.PointLight(0x9ae6ff, 4, 4, 1.5); signGlow.position.set(0, 3.0, 0.4); group.add(signGlow);
  // The guns it shows: a copy of each, hidden but for the one it is on.
  const shown = {};
  for (const id of CRATE_GUNS) {
    const g = guns[GUNS[id].model];
    if (!g) continue;
    const copy = g.group.clone(true);
    copy.traverse((o) => { o.visible = true; });
    copy.visible = false;
    copy.scale.setScalar(1.6);
    copy.position.set(0, 1.25, 0);
    group.add(copy);
    shown[id] = copy;
  }
  // And Babitus's chip (he signs everything): a big gold one, G.O.Y on both faces. Now and then it is what you get.
  shown.chip = chipModel();
  shown.chip.visible = false;
  shown.chip.position.set(0, 1.25, 0);
  group.add(shown.chip);
  const CHIP_CHANCE = 0.14;
  let state = 'idle', t = 0, pick = null, on = null, tick = 0, held = null;
  const show = (id) => { for (const k in shown) shown[k].visible = k === id; on = id; };

  return {
    // What E does here: pay to roll it, or take what it stopped on.
    offer(near, holding) {
      if (!near) return null;
      if (state === 'idle') return { text: `Press E for a random gun  [${price}]`, price, act: () => { state = 'rolling'; t = 0; tick = 0; held = holding; pick = Math.random() < CHIP_CHANCE ? 'chip' : CRATE_GUNS.filter((g) => g !== holding)[Math.floor(Math.random() * (CRATE_GUNS.length - 1))]; sound.crate?.('open'); } };
      if (state === 'ready') return { text: pick === 'chip' ? "Press E to take Babitus's chip  ·  G.O.Y" : `Press E to take the ${GUNS[pick].name}`, price: 0, act: () => { state = 'idle'; show(null); return pick; }, take: pick };
      return null;
    },
    update(dt) {
      const time = performance.now() / 1000;
      if (state === 'rolling') {
        t += dt;
        tick -= dt;
        if (tick <= 0) {   // (it slows as it goes: a gun every tick, the ticks getting longer)
          tick = 0.06 + 0.3 * (t / ROLL) ** 2;
          const options = CRATE_GUNS.filter((g) => g !== on);
          show(options[Math.floor(Math.random() * options.length)]);
          sound.crate?.('tick');
        }
        if (t >= ROLL) { state = 'ready'; t = 0; show(pick); sound.crate?.('done'); }
      } else if (state === 'ready') {
        t += dt;
        if (t >= HOLD) { state = 'idle'; show(null); sound.crate?.('gone'); }
      }
      // the gun turns slowly over the open lid, and (with little time left to take it) sinks back in
      for (const k in shown) { shown[k].rotation.y = time * 1.6; shown[k].position.y = 1.25 + 0.06 * Math.sin(time * 3) - (state === 'ready' && t > HOLD - 2 ? (t - HOLD + 2) * 0.35 : 0); }
      beam.material.opacity = state === 'rolling' ? 0.13 + 0.06 * Math.sin(time * 20) : state === 'ready' ? 0.1 : 0.055 + 0.025 * Math.sin(time * 2.4);
      glow.intensity = state === 'idle' ? 9 + 2 * Math.sin(time * 1.4) : 18;
      ring.rotation.set(Math.PI / 2 + 0.3 * Math.sin(time * 1.7), time * 0.9, 0); ring2.rotation.set(Math.PI / 2 - 0.35 * Math.sin(time * 2.3 + 1), -time * 1.3, 0);
      ring.position.y = 2.05 + 0.08 * Math.sin(time * 2); ring2.position.y = 2.35 + 0.08 * Math.sin(time * 2 + 1.5);
      sign.rotation.y = time * 0.45;
      ringMat.opacity = state === 'idle' ? 0.7 + 0.25 * Math.sin(time * 4) : 1;
      glow.color.set(state === 'idle' ? 0x7ad8ff : 0xffd27a);
    },
    reset() { state = 'idle'; show(null); void held; },
    rig(what) { if (state === 'idle') { state = 'rolling'; t = 0; tick = 0; pick = what; } },   // (the tests: make it land on this)
  };
}

// Babitus's chip: a fat gold casino chip, his initials-of-something on both faces and his name round the edge.
function chipModel() {
  const face = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#d9a52a'; g.beginPath(); g.arc(128, 128, 128, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#3a2305'; g.lineWidth = 10; g.beginPath(); g.arc(128, 128, 104, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.fillStyle = i % 2 ? '#3a2305' : '#f3d27a'; g.beginPath(); g.arc(128 + Math.cos(a) * 116, 128 + Math.sin(a) * 116, 9, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#2a1803'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '900 86px Anton, Impact, sans-serif'; g.fillText('G.O.Y', 128, 122);
    g.font = '700 26px "Barlow Condensed", "Arial Narrow", sans-serif'; g.fillText('BABITUS', 128, 178);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  })();
  const gold = new THREE.MeshStandardMaterial({ color: 0xd9a52a, metalness: 0.85, roughness: 0.3 });
  const faceMat = new THREE.MeshStandardMaterial({ map: face, metalness: 0.6, roughness: 0.35 });
  const chip = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.075, 48), [gold, faceMat, faceMat]);
  chip.rotation.x = Math.PI / 2;   // (stood on its edge, a face to you)
  const g = new THREE.Group();
  g.add(chip);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
