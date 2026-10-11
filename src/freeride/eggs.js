// =====================================================================================
//   SPOILERS. This file is the Moon's secrets: where each costume is hidden and what
//   you have to do to get it. If you want to find them yourself, close it now.
// =====================================================================================
//
// Six costumes (player/costumes.js), each won by finding something and doing
// something. A costume, once won, is yours for good (it is saved with your
// cosmetics) and each player has to win it personally.
//
// main.js calls update() every frame of Free Ride, shot() when the sniper is
// fired and vent() when a gas vent throws you; `onFound(id)` is called once, the
// moment a costume is won.
import * as THREE from 'three';
import { MOON, VENTS, LAVA_Y, ISLAND, TOWER, LANDER, RIM_LENGTH, moonHeight } from '../world/moon.js';
import { astronaut } from './targets.js';

// Where the monolith stands (from the middle of the arena), deep in the night side.
const MONOLITH = { x: MOON.x - 186, z: MOON.z - 58 };
const EARTH = new THREE.Vector3(0.35, 0.62, 0.7).normalize();   // where the Earth hangs in the sky (see arena.js)

// has(id): is this costume already won?  ghosts(): the other riders (freeride/ride.js).
export function createEggs({ scene, skater, has, ghosts, onFound }) {
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  // 1. The last man: a dead astronaut, sitting on the rock in the middle of the Lava Pit.
  const lastMan = astronaut();
  lastMan.position.set(ISLAND.x + 0.9, ISLAND.top - 0.75, ISLAND.z - 0.6);   // (sat down: his legs are in the rock)
  lastMan.rotation.set(-0.2, 2.2, 0.12);
  lastMan.scale.setScalar(0.8);
  // 2. The monolith: black, and unlit. You only see it when your headlamp finds it.
  const slab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 9, 0.6), new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.25 }));
  slab.position.set(MONOLITH.x, moonHeight(MONOLITH.x, MONOLITH.z) + 4.4, MONOLITH.z);
  slab.rotation.y = 0.5;
  group.add(lastMan, slab);

  let still = 0, swept = 0, lastAngle = null, together = 0;
  const vents = new Set();
  const won = (id) => { if (!has(id)) onFound(id); };

  return {
    setVisible(on) { group.visible = on; },
    reset() { still = swept = together = 0; lastAngle = null; vents.clear(); },

    update(dt) {
      const p = skater.pos, slow = skater.speed < 1.5, rolling = skater.grounded && !skater.grinding;
      // 1. Dead Astronaut: land on the rock in the lava and come to a stop beside him.
      still = rolling && slow && Math.hypot(p.x - ISLAND.x, p.z - ISLAND.z) < ISLAND.half + 0.3 && p.y > LAVA_Y + 0.4 ? still + dt : 0;
      if (still > 0.6) won('astronaut');
      // 2. The Grey: carve a full circle round the monolith without leaving the ground, stopping or wandering off.
      const dx = p.x - MONOLITH.x, dz = p.z - MONOLITH.z, far = Math.hypot(dx, dz);
      if (rolling && skater.speed > 3 && far > 2.5 && far < 17) {
        const angle = Math.atan2(dz, dx);
        if (lastAngle !== null) swept += Math.atan2(Math.sin(angle - lastAngle), Math.cos(angle - lastAngle));
        lastAngle = angle;
        if (Math.abs(swept) >= Math.PI * 2) won('grey');
      } else { swept = 0; lastAngle = null; }
      // 4. Golden Boy: you and another rider, stopped side by side at the lander, for three seconds.
      let friend = false;
      if (slow && Math.hypot(p.x - LANDER.x, p.z - LANDER.z) < 16) {
        for (const g of ghosts().values()) if (g.pos.distanceTo(p) < 3.2 && g.last.speed < 1.5) friend = true;
      }
      together = friend ? together + dt : 0;
      if (together > 3) won('gilded');
      // 5. Void Walker: grind the rim rail the whole way round, in one grind.
      if (skater.rail?.rim && skater.grindDistance >= RIM_LENGTH * 0.97) won('void');
    },

    // 3. Cosmonaut: from the deck of the comms tower, shoot the Earth.
    shot(dir) {
      const p = skater.pos;
      if (Math.hypot(p.x - TOWER.x, p.z - TOWER.z) < TOWER.half + 0.5 && p.y > TOWER.top - 0.6 && dir.dot(EARTH) > Math.cos(0.05)) won('cosmonaut');
    },

    // 6. Little Green Man: ride every gas vent on the Moon in one session.
    vent(index) {
      vents.add(index);
      if (vents.size >= VENTS.length) won('martian');
    },
  };
}
