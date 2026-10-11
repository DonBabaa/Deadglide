// Turns one chunk of generated world data into something you can see.
// Materials and repeated shapes (headstones, trees) are made once and shared;
// everything else is built per chunk and thrown away when the chunk unloads.
import { descentTint } from './descent.js';
import * as THREE from 'three';
import { CATA, route, floorAt, pipePoint } from './catacombs.js';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { CHUNK, chunkBase, chunkHeight, chunkPaved } from './worldgen.js';
import { seededRandom } from './random.js';
import { MOON, moonHeight, daylight, lavaAt } from './moon.js';
import { houseHeight, pocketAt } from './house.js';
import { groundTexture, rampTexture, stoneWallTexture, stoneTexture, glowTexture, regolithTexture, plateTexture, marbleTexture } from './textures.js';

const CONCRETE = new THREE.Color(0x9c9b96), GRASS = new THREE.Color(0x35452a);
const REGOLITH = new THREE.Color(0x9b9a9c), shade = new THREE.Color();   // the Moon's dust
const FLAGSTONE = new THREE.Color(0x77705f), ROCK = new THREE.Color(0x4a4238);   // the Catacombs: floor, and the curve up the walls
const Y = new THREE.Vector3(0, 1, 0), Z3 = new THREE.Vector3(0, 0, 1), tilt = new THREE.Quaternion();
const shared = (geo) => { geo.userData.shared = true; return geo; };

// Weld a finished chunk's props together: every plain mesh that shares a material (and the same shadow
// settings) becomes one mesh. A chunk is built from dozens of separate trees, tombs, ramps and bits of decor,
// each a thing to draw (twice, with its shadow); welded, a chunk is a handful. `skip` is left alone (the ground).
function weldChunk(group, skip) {
  const sets = new Map();
  group.updateMatrixWorld(true);
  group.traverse((m) => {
    if (!m.isMesh || m.isInstancedMesh || m === skip || !m.visible || Array.isArray(m.material) || m.material.transparent || m.matrixWorld.determinant() < 0) return;
    const key = `${m.material.uuid}|${m.castShadow}|${m.receiveShadow}|${Object.keys(m.geometry.attributes).sort()}`;
    if (!sets.has(key)) sets.set(key, []);
    sets.get(key).push(m);
  });
  for (const pieces of sets.values()) {
    if (pieces.length < 2) continue;
    const indexed = pieces.every((m) => m.geometry.index);   // (a mix can't be merged as it is: flatten the indexed ones)
    const merged = mergeGeometries(pieces.map((m) => (m.geometry.index && !indexed ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrixWorld)));
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, pieces[0].material);
    mesh.castShadow = pieces[0].castShadow;
    mesh.receiveShadow = pieces[0].receiveShadow;
    for (const m of pieces) {
      if (!m.geometry.userData.shared) m.geometry.dispose();
      if (m.children.length) {   // something hangs off it: leave an empty holder in its place
        const holder = new THREE.Group();
        holder.position.copy(m.position); holder.quaternion.copy(m.quaternion); holder.scale.copy(m.scale);
        holder.add(...m.children);
        m.parent.add(holder);
      }
      m.parent.remove(m);
    }
    group.add(mesh);
  }
  return group;
}

export function createChunkBuilder() {
  const stoneMap = stoneTexture(), glow = glowTexture(), regolith = regolithTexture(), plates = plateTexture();
  const mat = {
    ground: new THREE.MeshStandardMaterial({ map: groundTexture(), vertexColors: true, roughness: 0.95 }),
    dust: new THREE.MeshStandardMaterial({ map: regolith, vertexColors: true, roughness: 1 }),   // the Moon's ground
    marble: new THREE.MeshStandardMaterial({ map: marbleTexture(), vertexColors: true, roughness: 0.35 }),   // the House's floor
    ramp: new THREE.MeshStandardMaterial({ map: rampTexture(), roughness: 0.8, side: THREE.DoubleSide }),
    tomb: new THREE.MeshStandardMaterial({ map: stoneMap, roughness: 0.95, side: THREE.DoubleSide }),
    wall: new THREE.MeshStandardMaterial({ map: stoneWallTexture(), roughness: 0.95 }),
    rock: new THREE.MeshStandardMaterial({ map: stoneWallTexture(), color: 0x8f8474, roughness: 1, side: THREE.DoubleSide }),
    ember: new THREE.MeshBasicMaterial({ color: 0xff8a3a }),
    stone: new THREE.MeshStandardMaterial({ map: stoneMap, roughness: 0.95 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xb9bec4, roughness: 0.3, metalness: 0.55 }),
    iron: new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.6, metalness: 0.4 }),
    bark: new THREE.MeshStandardMaterial({ color: 0x2a231d, roughness: 1 }),
    dirt: new THREE.MeshStandardMaterial({ color: 0x2b221a, roughness: 1 }),
    bulb: new THREE.MeshBasicMaterial({ color: 0xffe2b0 }),
    window: new THREE.MeshBasicMaterial({ color: 0xd9a35a }),
    flare: new THREE.SpriteMaterial({ map: glow, color: 0xffc98a, transparent: true, opacity: 0.6, depthWrite: false }),
    flame: new THREE.PointsMaterial({ map: glow, color: 0xffb060, size: 0.9, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  };
  // The Catacombs' ramps and coffins are old stone, not skatepark concrete.
  const under = { ...mat, ramp: mat.ramp.clone(), tomb: mat.tomb.clone() };
  under.ramp.color.set(0x7a7262);
  under.tomb.color.set(0x8c8474);
  const rand = seededRandom(11);
  const headstones = headstoneGeometries().map(shared);
  const trees = [0, 1, 2, 3].map(() => shared(treeGeometry(rand)));
  const moundGeo = shared(new THREE.SphereGeometry(1, 10, 6));
  // The House: card tables in green baize, counters in dark wood, and every rail brass.
  const casino = { ...mat, ramp: new THREE.MeshStandardMaterial({ color: 0x0f5a35, roughness: 0.95, side: THREE.DoubleSide }), tomb: new THREE.MeshStandardMaterial({ color: 0x3a2116, roughness: 0.5, side: THREE.DoubleSide }),
    steel: new THREE.MeshStandardMaterial({ color: 0xc9a44a, roughness: 0.35, metalness: 0.5, emissive: 0x2a1c04 }) };
  // ---- The Moon's props: what is drawn on top of the plain shapes you ride. ----
  const lunar = { ...mat, ramp: mat.ramp.clone(), tomb: mat.tomb.clone() };
  lunar.ramp.map = lunar.tomb.map = plates;   // the Base is plated
  lunar.ramp.color.set(0xc9cbd0);
  lunar.tomb.color.set(0xd4d4d8);
  lunar.slab = new THREE.MeshStandardMaterial({ map: regolith, color: 0x9a999c, roughness: 1, side: THREE.DoubleSide });   // (slabs of rock are rock)
  // (Nothing here is shiny metal: with a black sky there is nothing for metal to reflect, and it draws as black.)
  const hull = new THREE.MeshStandardMaterial({ color: 0xd4d5da, roughness: 0.75 });
  const foil = new THREE.MeshStandardMaterial({ color: 0xd2a63a, roughness: 0.55, emissive: 0x2a1c04 });
  const panel = new THREE.MeshStandardMaterial({ color: 0x24408c, roughness: 0.5, emissive: 0x060c20 });
  const cloth = new THREE.MeshBasicMaterial({ color: 0xe8e4da, side: THREE.DoubleSide });
  const lit = new THREE.MeshBasicMaterial({ color: 0xff5a3a });
  function lunarExtras(p) {
    const g = new THREE.Group(), add = (geometry, material, x, y, z) => { const m = new THREE.Mesh(geometry, material); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
    if (p.kind === 'lander') {
      // The lander: a foil-wrapped descent stage on four legs, the cabin on top, a dish, and the flag beside it.
      add(new THREE.CylinderGeometry(2.4, 2.7, 1.6, 8), foil, 0, 2.4, 0);
      add(new THREE.CylinderGeometry(1.5, 1.9, 1.7, 8), hull, 0, 4.0, 0);
      add(new THREE.BoxGeometry(0.9, 0.7, 0.5), lunar.tomb, 0, 4.3, 1.7);                                   // the hatch
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + Math.PI / 4, far = new THREE.Vector3(Math.cos(a) * 4.3, 0.1, Math.sin(a) * 4.3);
        g.add(new THREE.Mesh(tubeGeometry(new THREE.Vector3(Math.cos(a) * 2.2, 2.6, Math.sin(a) * 2.2), far, 0.09), hull));
        add(new THREE.CylinderGeometry(0.55, 0.55, 0.08, 10), foil, far.x, 0.08, far.z);                  // foot pad
      }
      add(new THREE.SphereGeometry(0.8, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.4).rotateX(Math.PI), hull, 1.2, 5.9, -0.4);   // dish
      add(new THREE.CylinderGeometry(0.03, 0.03, 3.2, 5), hull, 6.5, 1.6, 2.5);                       // the flag: pole...
      add(new THREE.PlaneGeometry(1.5, 0.9), cloth, 7.25, 2.75, 2.5);                                      // ...and cloth
    } else if (p.kind === 'habitat') {
      // A habitat module: a half-buried tube with ribs, its solar panels fallen alongside.
      const length = p.u1 - p.u0, top = p.localHeight(0, 0);
      add(new THREE.CylinderGeometry(0.75, 0.75, length - 1, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2), hull, 0, top, 0);
      for (let k = -2; k <= 2; k++) add(new THREE.TorusGeometry(0.78, 0.05, 5, 12, Math.PI).rotateY(Math.PI / 2), foil, k * (length / 5.5), top, 0);
      add(new THREE.BoxGeometry(3.2, 0.06, 1.5), panel, length * 0.2, 0.12, 2.6).rotation.x = 0.12;
    } else if (p.kind === 'tower') {
      // The comms tower: a lattice mast up through the deck, a dish, and a light on top.
      const top = p.localHeight(0, 0);
      for (const [x, z] of [[-2.3, -2.3], [2.3, -2.3], [2.3, 2.3], [-2.3, 2.3]]) g.add(new THREE.Mesh(tubeGeometry(new THREE.Vector3(x, 0, z), new THREE.Vector3(x * 0.5, top + 7, z * 0.5), 0.08), hull));
      for (let y = 2; y < top + 7; y += 2.5) add(new THREE.TorusGeometry(2.6 - y * 0.08, 0.04, 4, 4).rotateX(Math.PI / 2).rotateY(Math.PI / 4), hull, 0, y, 0);
      add(new THREE.BoxGeometry(6.2, 0.14, 6.2), hull, 0, top + 0.06, 0);                             // the deck's edge
      add(new THREE.SphereGeometry(1.3, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.4).rotateX(Math.PI * 0.75), hull, 0, top + 5, 1);
      add(new THREE.SphereGeometry(0.16, 8, 6), lit, 0, top + 7.2, 0);
    } else if (p.kind === 'launchpad') {
      // The Launch Pad: a gantry standing beside the ramp, striped in warning colours.
      for (const side of [-1, 1]) {
        g.add(new THREE.Mesh(tubeGeometry(new THREE.Vector3(1, 0, side * 7.5), new THREE.Vector3(p.lipU, p.lipY + 9, side * 7.5), 0.12), hull));
        g.add(new THREE.Mesh(tubeGeometry(new THREE.Vector3(p.lipU, 0, side * 7.5), new THREE.Vector3(p.lipU, p.lipY + 9, side * 7.5), 0.14), hull));
        add(new THREE.SphereGeometry(0.2, 8, 6), lit, p.lipU, p.lipY + 9.2, side * 7.5);
      }
      g.add(new THREE.Mesh(tubeGeometry(new THREE.Vector3(p.lipU, p.lipY + 9, -7.5), new THREE.Vector3(p.lipU, p.lipY + 9, 7.5), 0.12), hull));
    } else return null;
    g.position.set(p.x, p.y0, p.z);
    g.rotation.y = p.yaw;
    return g;
  }

  // Decor (the Cemetery): things that are only drawn. Nothing here is solid, so none of it changes how the place skates.
  const tuftGeo = shared(mergeGeometries([[-0.07, 0.25], [0.06, -0.2], [0, 0.05], [0.1, 0.3]].map(([x, lean], i) =>
    new THREE.ConeGeometry(0.035, 0.3 + i * 0.05, 4).translate(0, 0.15 + i * 0.025, 0).rotateZ(lean).translate(x, 0, (i - 1.5) * 0.05))));
  const rockGeo = shared(new THREE.IcosahedronGeometry(1, 0));
  const skullGeo = shared(mergeGeometries([
    new THREE.SphereGeometry(0.13, 8, 6).scale(1, 1.05, 1.1).translate(0, 0.12, 0),
    new THREE.BoxGeometry(0.14, 0.07, 0.1).translate(0, 0.03, 0.05),
  ]));
  const puddleGeo = shared(new THREE.CircleGeometry(1, 18).rotateX(-Math.PI / 2));
  const boneGeo = shared(mergeGeometries([
    new THREE.CylinderGeometry(0.035, 0.035, 1, 6),
    ...[-0.5, 0.5].flatMap((y) => [-0.035, 0.035].map((x) => new THREE.SphereGeometry(0.06, 6, 5).translate(x, y, 0))),
  ]));
  const leafGeo = shared(new THREE.CircleGeometry(0.11, 5).rotateX(-Math.PI / 2));
  const shroomGeo = shared(mergeGeometries([
    new THREE.CylinderGeometry(0.018, 0.024, 0.12, 5).translate(0, 0.06, 0),
    new THREE.SphereGeometry(0.07, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.7, 1).translate(0, 0.11, 0),
  ]));
  const crossGeo = shared(mergeGeometries([new THREE.BoxGeometry(0.05, 1.1, 0.05).translate(0, 0.5, 0), new THREE.BoxGeometry(0.5, 0.05, 0.05).translate(0, 0.75, 0)]));
  const pumpkinGeo = shared(mergeGeometries([
    new THREE.SphereGeometry(0.24, 10, 8).scale(1, 0.8, 1).translate(0, 0.19, 0),
    new THREE.CylinderGeometry(0.02, 0.03, 0.08, 5).translate(0, 0.41, 0),
  ]));
  const slabGeo = shared(new THREE.BoxGeometry(1, 0.1, 0.6).translate(0, 0.05, 0));
  const crowGeo = shared(mergeGeometries([
    new THREE.SphereGeometry(0.09, 8, 6).scale(1, 0.9, 1.7).translate(0, 0.12, 0),
    new THREE.SphereGeometry(0.055, 8, 6).translate(0, 0.21, 0.13),
    new THREE.ConeGeometry(0.018, 0.07, 4).rotateX(Math.PI / 2).translate(0, 0.2, 0.21),
    new THREE.BoxGeometry(0.03, 0.02, 0.14).rotateX(-0.3).translate(0, 0.1, -0.2),
  ]));
  const flowerGeo = shared(new THREE.SphereGeometry(0.06, 6, 5).scale(1, 0.6, 1).translate(0, 0.05, 0));
  const candleGeo = shared(mergeGeometries([new THREE.BoxGeometry(0.3, 0.04, 0.18), new THREE.CylinderGeometry(0.03, 0.035, 0.2, 6).translate(0, 0.12, 0)]));
  const spikeGeo = shared(new THREE.ConeGeometry(1, 1, 6).rotateX(Math.PI).translate(0, -0.5, 0));     // (hangs down from where it is put)
  const chainGeo = shared(new THREE.CylinderGeometry(0.025, 0.025, 1, 5).translate(0, -0.5, 0));       // (likewise)
  const lanternGeo = shared(mergeGeometries([new THREE.BoxGeometry(0.26, 0.05, 0.26).translate(0, 0.2, 0), new THREE.BoxGeometry(0.26, 0.05, 0.26).translate(0, -0.2, 0),
    ...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, z]) => new THREE.BoxGeometry(0.025, 0.4, 0.025).translate(x * 0.115, 0, z * 0.115))]));
  const tintOf = new THREE.Color();
  const underMat = {
    oldBone: new THREE.MeshStandardMaterial({ color: 0x9a927c, roughness: 0.85 }),
    moss: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, side: THREE.DoubleSide }),
    wax: new THREE.MeshStandardMaterial({ color: 0xd9d2bf, roughness: 0.6 }),
    fungus: new THREE.PointsMaterial({ map: glow, color: 0x5ff0e0, size: 0.5, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }),
  };
  const moreMat = {
    leaf: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, side: THREE.DoubleSide }),
    shroom: new THREE.MeshStandardMaterial({ color: 0xcfc4a8, roughness: 0.8 }),
    pumpkin: new THREE.MeshStandardMaterial({ color: 0xc8641c, roughness: 0.7, emissive: 0x5a2206 }),
    crow: new THREE.MeshStandardMaterial({ color: 0x0c0c0f, roughness: 0.6 }),
    flower: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }),
    firefly: new THREE.PointsMaterial({ map: glow, color: 0xf4e88a, size: 0.6, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }),
  };
  const decorMat = {
    tuft: new THREE.MeshStandardMaterial({ color: 0x2f3f24, roughness: 1 }),
    bone: new THREE.MeshStandardMaterial({ color: 0xcfc8b2, roughness: 0.7 }),
    puddle: new THREE.MeshStandardMaterial({ color: 0x0c1016, roughness: 0.04, metalness: 0.6 }),
    wisp: new THREE.PointsMaterial({ map: glow, color: 0x8dffc8, size: 1.1, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }),
  };

  // Scatter the decor over a chunk. On the grass: tufts, stones, dead shrubs, fallen leaves, toadstools, bones,
  // skulls, leaning iron crosses, broken slabs, pumpkins with a candle in them, crows. On the paving: leaves,
  // grit and puddles. On the graves: flowers. In the air: fireflies, and pale lights hanging over the graves. It has its own dice, so adding to it never moves
  // anything else in the world.
  // ---- The Moon's decor: only drawn, like the Cemetery's. ----
  // Everywhere: rocks, big and small. Round the Base: crates, fuel tanks, cracked helmets, bones, a rover that
  // will never move again. On the night side: crystals that glow, and things that might be eggs.
  const crystalGeo = shared(mergeGeometries([[0, 0, 0, 1], [0.22, 0.5, 0.3, 0.7], [-0.2, -0.4, -0.25, 0.55]].map(([x, lean, z, tall]) =>
    new THREE.ConeGeometry(0.16, tall, 5).translate(0, tall / 2, 0).rotateZ(lean).translate(x, 0, z))));
  const eggGeo = shared(new THREE.SphereGeometry(0.3, 10, 8).scale(1, 1.35, 1).translate(0, 0.32, 0));
  const helmetGeo = shared(mergeGeometries([new THREE.SphereGeometry(0.22, 12, 9).translate(0, 0.2, 0), new THREE.CylinderGeometry(0.17, 0.2, 0.08, 10).translate(0, 0.03, 0)]));
  const visorGeo = shared(new THREE.SphereGeometry(0.17, 10, 8, 0, Math.PI * 2, 0.5, 1.2).rotateX(Math.PI / 2).translate(0, 0.21, 0.07));
  const crateGeo = shared(new THREE.BoxGeometry(1, 0.8, 0.8).translate(0, 0.4, 0));
  const tankGeo = shared(new THREE.CapsuleGeometry(0.32, 1.1, 4, 10).rotateZ(Math.PI / 2).translate(0, 0.32, 0));
  const moonMat = {
    rock: new THREE.MeshStandardMaterial({ map: regolith, color: 0x8a898c, roughness: 1, flatShading: true }),
    crate: new THREE.MeshStandardMaterial({ map: plates, color: 0xb9b08a, roughness: 0.8 }),
    tank: new THREE.MeshStandardMaterial({ color: 0xc8c9ce, roughness: 0.6 }),
    visor: new THREE.MeshStandardMaterial({ color: 0x2a1a08, roughness: 0.2, emissive: 0x241405 }),
    crystal: new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
    egg: new THREE.MeshStandardMaterial({ color: 0x3f5a3a, roughness: 0.4, emissive: 0x0f2a12 }),
    spark: new THREE.PointsMaterial({ map: glow, color: 0x8ff0ff, size: 1.2, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }),
  };
  function buildMoonDecor(c, group) {
    const dice = seededRandom((Math.imul(c.cx, 73856093) ^ Math.imul(c.cz, 19349663) ^ 0x1969) | 0), BIG = 2;
    const put = (geometry, material, list, tint) => {   // list: [x, y, z, turn, sx, sy, sz, colour?]
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(geometry, material, list.length);
      list.forEach((d, i) => { mesh.setMatrixAt(i, m.compose(v.set(d[0], d[1], d[2]), q.setFromAxisAngle(Y, d[3]), sc.set(d[4], d[5], d[6]))); if (tint) mesh.setColorAt(i, tint(d[7])); });
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
    };
    // A spot in this chunk that is open ground inside the arena (always rolls the same dice, whether it's used or not).
    const spot = () => {
      const x = c.x0 + 1 + dice() * (CHUNK - 2), z = c.z0 + 1 + dice() * (CHUNK - 2), turn = dice() * 6.28, size = dice(), extra = dice();
      const out = Math.hypot(x - MOON.x, z - MOON.z);
      if (out > MOON.radius - MOON.wall - 3 || out < 5 || lavaAt(x, z) !== null || chunkHeight(c, x, z) - chunkBase(c, x, z) > 0.05) return null;
      return { x, y: chunkBase(c, x, z), z, turn, size, extra, out, day: daylight(x, z) };
    };
    const rocks = [], crystals = [], eggs = [], helmets = [], visors = [], crates = [], tanks = [], bones = [], sparks = [];
    for (let k = 0; k < 150; k++) {
      const s = spot();
      if (!s) continue;
      const big = s.extra > 0.93 ? 3.2 : s.extra > 0.7 ? 1.4 : 0.55, r = (0.16 + s.size * 0.36) * big * BIG;
      rocks.push([s.x, s.y + r * 0.2, s.z, s.turn, r, r * (0.5 + s.extra * 0.4), r * (0.7 + s.size * 0.5)]);
    }
    for (let k = 0; k < 26; k++) {   // the night side's own
      const s = spot();
      if (!s || s.day > 0.35) continue;
      if (s.extra < 0.72) {
        const tall = (0.8 + s.size * 1.6) * BIG;
        crystals.push([s.x, s.y - 0.05, s.z, s.turn, tall * 0.7, tall, tall * 0.7, s.extra]);
        sparks.push(s.x, s.y + tall * 0.8, s.z);
      } else eggs.push([s.x, s.y - 0.1, s.z, s.turn, (0.8 + s.size) * BIG * 0.7, (0.8 + s.size) * BIG * 0.7, (0.8 + s.size) * BIG * 0.7]);
    }
    for (let k = 0; k < 30; k++) {   // what the astronauts left: thick round the Base, thinning out
      const s = spot();
      if (!s || s.out > 150 || dice() > 1.15 - s.out / 130) continue;
      const kind = s.extra;
      if (kind < 0.3) crates.push([s.x, s.y, s.z, s.turn, (0.8 + s.size * 0.8) * BIG * 0.6, (0.7 + s.size * 0.6) * BIG * 0.6, (0.8 + s.size * 0.5) * BIG * 0.6]);
      else if (kind < 0.5) tanks.push([s.x, s.y, s.z, s.turn, BIG * 0.7, BIG * 0.7, BIG * 0.7]);
      else if (kind < 0.75) { helmets.push([s.x, s.y, s.z, s.turn, BIG, BIG, BIG]); visors.push([s.x, s.y, s.z, s.turn, BIG, BIG, BIG]); }
      else bones.push([s.x, s.y + 0.1, s.z, s.turn, 0.5 * BIG, 0.5 * BIG, 0.5 * BIG]);
    }
    put(rockGeo, moonMat.rock, rocks);
    put(crystalGeo, moonMat.crystal, crystals, (k) => tintOf.setHSL(0.5 + k * 0.4, 0.9, 0.62));   // cyan through violet
    put(eggGeo, moonMat.egg, eggs);
    put(helmetGeo, moonMat.tank, helmets);
    put(visorGeo, moonMat.visor, visors);
    put(crateGeo, moonMat.crate, crates);
    put(tankGeo, moonMat.tank, tanks);
    if (bones.length) {
      const mesh = new THREE.InstancedMesh(boneGeo, decorMat.bone, bones.length);
      bones.forEach((d, i) => mesh.setMatrixAt(i, m.compose(v.set(d[0], d[1], d[2]), q.setFromAxisAngle(Y, d[3]).multiply(tilt.setFromAxisAngle(Z3, Math.PI / 2)), sc.set(d[4], d[5], d[6]))));
      group.add(mesh);
    }
    if (sparks.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(sparks, 3));
      group.add(new THREE.Points(geo, moonMat.spark));
    }
  }

  // ---- The Catacombs' decor: all of it only drawn, like the Cemetery's. ----
  // Kept sparse: sewer pipes along the walls, bones on the floor, and stalactites and chained lanterns
  // hanging from the roof.
  function buildUnderDecor(c, group) {
    const dice = seededRandom((Math.imul(c.cz - Math.floor(c.cz / CATA.loop) * CATA.loop, 19349663) ^ c.seed ^ 0xbead) | 0);   // (the same every lap)
    const seed = c.seed, at = { x: 0, y: 0, nx: 0, ny: 1 }, n = new THREE.Vector3(), Zaxis = new THREE.Vector3(0, 0, 1);
    const place = (geometry, material, list, tint) => {   // list: [x, y, z, quaternion, sx, sy, sz, colour?]
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(geometry, material, list.length);
      list.forEach((d, i) => { mesh.setMatrixAt(i, m.compose(v.set(d[0], d[1], d[2]), d[3], sc.set(d[4], d[5], d[6]))); if (tint) mesh.setColorAt(i, tint(d[7])); });
      group.add(mesh);
    };
    const spin = (turn) => new THREE.Quaternion().setFromAxisAngle(Y, turn);
    // A place on the wall: `up` metres of wall above the edge of the floor, on `side`. Leaves the point in `at`, the way out of the wall in `n`.
    const wall = (side, up, z) => { const r = route(z, seed); pipePoint(side * (r.w + up), z, seed, at); n.set(at.nx, at.ny, 0); return at; };

    const flames = [];

    // Sewer pipes along both walls, on brackets.
    const iron = [];
    for (const side of [-1, 1]) for (const [up, radius] of [[9.4, 0.24], [10.4, 0.15]]) {
      let last = null;
      for (let z = c.z0; z <= c.z0 + CHUNK + 0.01; z += 2) {
        wall(side, up, z);
        const here = new THREE.Vector3(at.x + n.x * (radius + 0.12), at.y + n.y * (radius + 0.12), z);
        if (last) iron.push(tubeGeometry(last, here, radius));
        if (radius > 0.2 && Math.round(z) % 8 === 0) iron.push(tubeGeometry(new THREE.Vector3(at.x, at.y, z), here, 0.06));   // a bracket
        last = here;
      }
    }
    if (iron.length) group.add(new THREE.Mesh(mergeGeometries(iron), mat.iron));

    // From the roof: stalactites, and chains, some with a lantern on the end.
    const spikes = [], chains = [], lanterns = [], roof = CATA.ceiling;
    for (let k = 0; k < 36; k++) {
      const z = c.z0 + dice() * CHUNK, r = route(z, seed), x = r.x + (dice() * 2 - 1) * r.w, long = 0.5 + dice() * dice() * 3.2, fat = 0.12 + dice() * 0.22;
      spikes.push([x, roof, z, spin(dice() * 6.28), fat, long, fat]);
    }
    for (let k = 0; k < 9; k++) {
      const z = c.z0 + dice() * CHUNK, r = route(z, seed), x = r.x + (dice() * 2 - 1) * (r.w - 0.5), long = 3 + dice() * 6, lit = dice() < 0.6;
      chains.push([x, roof, z, spin(0), 1, long, 1]);
      if (lit) { lanterns.push([x, roof - long - 0.2, z, spin(dice()), 1, 1, 1]); flames.push(x, roof - long - 0.2, z); }
    }
    place(spikeGeo, mat.rock, spikes);
    place(chainGeo, mat.iron, chains);
    place(lanternGeo, mat.iron, lanterns);

    // Bones on the floor.
    const bones = [];
    for (let k = 0; k < 34; k++) {
      const z = c.z0 + 0.5 + dice() * (CHUNK - 1), r = route(z, seed), x = r.x + (dice() * 2 - 1) * (r.w - 0.3), turn = dice() * 6.28, size = dice();
      const y = chunkBase(c, x, z);
      if (chunkHeight(c, x, z) - y > 0.05) continue;   // something is standing here
      bones.push([x, y + 0.05, z, spin(turn).multiply(new THREE.Quaternion().setFromAxisAngle(Zaxis, Math.PI / 2)), 0.35 + size * 0.3, 0.3 + size * 0.3, 0.35 + size * 0.3]);
    }
    place(boneGeo, underMat.oldBone, bones);
    for (const [list, material] of [[flames, mat.flame]]) {
      if (!list.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(list, 3));
      group.add(new THREE.Points(geo, material));
    }
  }

  function buildDecor(c, group) {
    const dice = seededRandom((Math.imul(c.cx, 73856093) ^ Math.imul(c.cz, 19349663) ^ c.seed ^ 0x5eed) | 0);
    const lists = { tuft: [], rock: [], shrub: [], skull: [], puddle: [] }, wisps = [];
    const scatter = (list, count, paved, flat = 9) => {
      for (let k = 0; k < count; k++) {
        const x = c.x0 + 1 + dice() * (CHUNK - 2), z = c.z0 + 1 + dice() * (CHUNK - 2), y = chunkBase(c, x, z);
        const turn = dice() * 6.28, size = dice();   // (always roll the same number of dice)
        if (chunkPaved(c, x, z) !== paved || chunkHeight(c, x, z) - y > 0.05) continue;   // wrong ground, or something is standing here
        if (Math.abs(chunkBase(c, x + 0.8, z) - y) + Math.abs(chunkBase(c, x, z + 0.8) - y) > flat) continue;   // too steep for this
        list.push([x, y, z, turn, size]);
      }
    };
    const graves = c.district === 'graveyard', park = c.district === 'park';
    scatter(lists.tuft, 300, false);
    scatter(lists.rock, 44, false);
    scatter(lists.shrub, park ? 8 : 18, false);
    scatter(lists.skull, graves ? 14 : 5, false);
    scatter(lists.puddle, 8, true, 0.06);
    const more = { leaf: [], leafPaved: [], shroom: [], bone: [], cross: [], pumpkin: [], slab: [], crow: [], pebble: [] };
    scatter(more.leaf, 260, false);
    scatter(more.leafPaved, 90, true);
    scatter(more.shroom, 40, false);
    scatter(more.bone, graves ? 22 : 9, false);
    scatter(more.cross, graves ? 14 : park ? 0 : 6, false, 0.5);
    scatter(more.pumpkin, park ? 2 : 5, false, 0.4);
    scatter(more.slab, graves ? 14 : 6, false, 0.4);
    scatter(more.crow, 6, false);
    scatter(more.pebble, 30, true);
    const BIG = 2.2;   // how much larger than life the decor is drawn (so it reads from the chase camera, at speed)
    const instanced = (geometry, material, list, place, grow = BIG) => {
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(geometry, material, list.length);
      list.forEach((d, i) => { place(d); mesh.setMatrixAt(i, m.compose(v, q, sc.multiplyScalar(grow))); });
      mesh.receiveShadow = true;
      group.add(mesh);
    };
    instanced(tuftGeo, decorMat.tuft, lists.tuft, ([x, y, z, turn, size]) => { v.set(x, y, z); q.setFromAxisAngle(Y, turn); sc.setScalar(0.8 + size * 1.1); });
    instanced(rockGeo, mat.stone, lists.rock, ([x, y, z, turn, size]) => { v.set(x, y + 0.02, z); q.setFromAxisAngle(Y, turn); sc.set(0.14 + size * 0.3, 0.08 + size * 0.16, 0.12 + size * 0.24); });
    instanced(trees[0], mat.bark, lists.shrub, ([x, y, z, turn, size]) => { v.set(x, y - 0.1, z); q.setFromAxisAngle(Y, turn); sc.setScalar(0.1 + size * 0.09); });
    instanced(skullGeo, decorMat.bone, lists.skull, ([x, y, z, turn, size]) => { v.set(x, y, z); q.setFromAxisAngle(Y, turn); sc.setScalar(0.9 + size * 0.4); });
    instanced(puddleGeo, decorMat.puddle, lists.puddle, ([x, y, z, turn, size]) => { v.set(x, y + 0.025, z); q.setFromAxisAngle(Y, turn); sc.set(0.7 + size * 1.3, 1, 0.5 + size * 0.9); }, 1);
    const tinted = (geometry, material, list, tint, place) => {
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(geometry, material, list.length);
      list.forEach((d, i) => { place(d); mesh.setMatrixAt(i, m.compose(v, q, sc.multiplyScalar(BIG))); mesh.setColorAt(i, tint(d[4], d[3])); });
      mesh.receiveShadow = true;
      group.add(mesh);
    };
    const leafTint = (k, t) => tintOf.setHSL(0.03 + (t % 1) * 0.07, 0.6, 0.12 + k * 0.14);   // browns, rusts and dull oranges
    tinted(leafGeo, moreMat.leaf, more.leaf, leafTint, ([x, y, z, turn, size]) => { v.set(x, y + 0.02, z); q.setFromAxisAngle(Y, turn); sc.set(0.8 + size, 1, 0.6 + size * 0.6); });
    tinted(leafGeo, moreMat.leaf, more.leafPaved, leafTint, ([x, y, z, turn, size]) => { v.set(x, y + 0.02, z); q.setFromAxisAngle(Y, turn); sc.set(0.8 + size, 1, 0.6 + size * 0.6); });
    instanced(shroomGeo, moreMat.shroom, more.shroom, ([x, y, z, turn, size]) => { v.set(x, y, z); q.setFromAxisAngle(Y, turn); sc.setScalar(0.7 + size * 1.4); });
    instanced(boneGeo, decorMat.bone, more.bone, ([x, y, z, turn, size]) => { v.set(x, y + 0.05, z); q.setFromAxisAngle(Y, turn).multiply(tilt.setFromAxisAngle(Z3, Math.PI / 2)); sc.setScalar(0.35 + size * 0.3); });
    instanced(crossGeo, mat.iron, more.cross, ([x, y, z, turn, size]) => { v.set(x, y - 0.08, z); q.setFromAxisAngle(Y, turn).multiply(tilt.setFromAxisAngle(Z3, (size - 0.5) * 0.5)); sc.setScalar(0.8 + size * 0.5); });
    instanced(pumpkinGeo, moreMat.pumpkin, more.pumpkin, ([x, y, z, turn, size]) => { v.set(x, y, z); q.setFromAxisAngle(Y, turn); sc.setScalar(0.8 + size * 0.7); });
    instanced(slabGeo, mat.stone, more.slab, ([x, y, z, turn, size]) => { v.set(x, y, z); q.setFromAxisAngle(Y, turn).multiply(tilt.setFromAxisAngle(Z3, (size - 0.5) * 0.25)); sc.set(0.5 + size * 0.8, 0.8 + size, 0.6 + size * 0.7); });
    instanced(crowGeo, moreMat.crow, more.crow, ([x, y, z, turn, size]) => { v.set(x, y, z); q.setFromAxisAngle(Y, turn); sc.setScalar(1 + size * 0.5); });
    instanced(rockGeo, mat.stone, more.pebble, ([x, y, z, turn, size]) => { v.set(x, y + 0.01, z); q.setFromAxisAngle(Y, turn); sc.set(0.05 + size * 0.07, 0.03 + size * 0.03, 0.05 + size * 0.06); });
    // Flowers left on the graves, a candle glowing in every pumpkin, and fireflies over the grass.
    const flowers = [], lights = [], flies = [];
    for (const plot of c.plots) for (let k = 0; k < 14; k++) {
      const x = plot.x + (dice() - 0.5) * (plot.w - 1), z = plot.z + (dice() - 0.5) * (plot.d - 1), hue = dice(), size = dice();
      flowers.push([x, chunkBase(c, x, z), z, hue, size]);
    }
    tinted(flowerGeo, moreMat.flower, flowers, (size, hue) => tintOf.setHSL(hue < 0.4 ? 0.98 : hue < 0.7 ? 0.78 : 0.13, hue < 0.85 ? 0.7 : 0.1, 0.3 + size * 0.25), ([x, y, z, , size]) => { v.set(x, y, z); q.identity(); sc.setScalar(0.8 + size); });
    for (const [x, y, z, , size] of more.pumpkin) lights.push(x, y + 0.2 * (0.8 + size * 0.7) * BIG, z);
    for (let k = 0; k < 26; k++) {
      const x = c.x0 + dice() * CHUNK, z = c.z0 + dice() * CHUNK, up = 0.4 + dice() * 1.8;
      if (!chunkPaved(c, x, z)) flies.push(x, chunkBase(c, x, z) + up, z);
    }
    for (const [list, material] of [[lights, mat.flame], [flies, moreMat.firefly]]) {
      if (!list.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(list, 3));
      group.add(new THREE.Points(geo, material));
    }
    if (c.district !== 'park') {
      for (const plot of c.plots) for (let k = 0; k < 3; k++) {
        const x = plot.x + (dice() - 0.5) * plot.w, z = plot.z + (dice() - 0.5) * plot.d;
        wisps.push(x, chunkBase(c, x, z) + 0.9 + dice() * 1.4, z);
      }
      if (wisps.length) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(wisps, 3));
        group.add(new THREE.Points(geo, decorMat.wisp));
      }
    }
  }

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();

  function build(c) {
    const group = new THREE.Group(), ground = buildGround(c, mat);
    group.add(ground);
    if (c.level === 2 && c.cx === 0) group.add(buildTunnelWalls(c, under));
    for (const b of c.bowls) {   // steel coping round each bowl, following the ground at its lip
      const ring = [];
      for (let k = 0; k <= 72; k++) {
        const a = (k / 72) * Math.PI * 2, x = b.x + Math.cos(a) * b.outer, z = b.z + Math.sin(a) * b.outer;
        ring.push(new THREE.Vector3(x, chunkBase(c, b.x + Math.cos(a) * (b.outer + 0.2), b.z + Math.sin(a) * (b.outer + 0.2)) + 0.02, z));
      }
      group.add(new THREE.Mesh(mergeGeometries(ring.slice(1).map((pt, k) => tubeGeometry(ring[k], pt, 0.06))), mat.steel));
    }

    const stones = [[], [], []];
    for (const p of c.props) {
      if (p.type === 'headstone') stones[p.kind].push(p);
      else if (p.type === 'tree') {
        const tree = new THREE.Mesh(trees[p.variant], mat.bark);
        tree.position.set(p.x, p.y0 - 0.5, p.z);
        tree.rotation.y = p.variant * 1.7 + p.x;
        tree.scale.setScalar(p.scale);
        tree.castShadow = true;
        group.add(tree);
      }
      else if (p.type === 'mausoleum') group.add(buildMausoleum(p, mat));
      else if (p.type === 'monument') group.add(buildMonument(p, mat));
      else if (p.type === 'chapel') group.add(buildChapel(p, mat));
      else if (p.type === 'lamp') group.add(buildLamp(p, mat));
      else if (p.type === 'brazier') group.add(buildBrazier(p, mat));
      else {
        group.add(buildProp(p, c.level === 4 ? casino : c.level === 2 ? under : c.level === 3 ? (p.kind === 'slab' ? { ...lunar, ramp: lunar.slab, tomb: lunar.slab } : lunar) : mat, c));
        const extras = p.kind && lunarExtras(p);
        if (extras) group.add(extras);
      }
    }

    // Headstones: one instanced mesh per shape.
    stones.forEach((list, kind) => {
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(headstones[kind], mat.stone, list.length);
      list.forEach((p, i) => mesh.setMatrixAt(i, m.compose(v.set(p.x, p.y0 - 0.12, p.z), q.setFromAxisAngle(Y, p.yaw), sc.setScalar(p.scale))));
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
    });

    // Grave plots: a stone kerb round each, fresh dirt mounds, candles.
    const kerbs = [];
    for (const plot of c.plots) {
      // Walk round the plot's edge in short pieces so the kerb follows the slope.
      const hw = plot.w / 2, hd = plot.d / 2, corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd], [-hw, -hd]];
      for (let k = 0; k < 4; k++) {
        const [ax, az] = corners[k], [bx, bz] = corners[k + 1], steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 2);
        const at = (t) => {
          const x = plot.x + ax + (bx - ax) * t, z = plot.z + az + (bz - az) * t;
          return new THREE.Vector3(x, chunkBase(c, x, z) + 0.04, z);
        };
        for (let s = 0; s < steps; s++) kerbs.push(tubeGeometry(at(s / steps), at((s + 1) / steps), 0.11));
      }
    }
    if (kerbs.length) group.add(new THREE.Mesh(mergeGeometries(kerbs), mat.stone));
    if (c.dirt.length) {
      const mounds = new THREE.InstancedMesh(moundGeo, mat.dirt, c.dirt.length);
      c.dirt.forEach(([x, z, y], i) => mounds.setMatrixAt(i, m.compose(v.set(x, y, z), q.identity(), sc.set(0.5, 0.16, 0.95))));
      mounds.receiveShadow = true;
      group.add(mounds);
    }
    if (c.flames.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(c.flames, 3));
      group.add(new THREE.Points(geo, mat.flame));
    }

    if (c.level === 1) buildDecor(c, group);
    else if (c.level === 3) buildMoonDecor(c, group);
    else if (c.level === 2 && c.cx === 0) buildUnderDecor(c, group);

    // Rails: every rail and post in the chunk merged into one mesh.
    const tubes = [];
    for (const r of c.rails) {
      const a = new THREE.Vector3(r.ax, r.ay, r.az), b = new THREE.Vector3(r.bx, r.by, r.bz);
      tubes.push(tubeGeometry(a, b, 0.05));
      const posts = Math.max(1, Math.round(r.len / 2.5));
      for (let i = 0; i <= posts; i++) {
        const top = a.clone().lerp(b, 0.04 + (0.92 * i) / posts);
        tubes.push(tubeGeometry(top, new THREE.Vector3(top.x, chunkHeight(c, top.x, top.z), top.z), 0.035));
      }
    }
    if (tubes.length) {
      const rails = new THREE.Mesh(mergeGeometries(tubes), c.level === 4 ? casino.steel : mat.steel);
      rails.castShadow = true;
      group.add(rails);
    }
    return weldChunk(group, ground);
  }

  function dispose(group) {
    group.traverse((o) => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); });
  }

  return { build, dispose };
}

// ---- Ground ------------------------------------------------------------------

// One grid per chunk, 1 m cells, tinted concrete or grass per vertex.
function buildGround(c, mat) {
  const n = CHUNK, positions = [], uvs = [], colors = [], indices = [];
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const x = c.x0 + i, z = c.z0 + j;
      // (In the Catacombs the rock above the lip isn't part of this mesh: the walls are built separately, below.)
      // and the ground stops at the foot of them (it dips out of sight under the curve).
      positions.push(x, c.level === 4 ? houseHeight(x, z, true) : c.level === 3 ? moonHeight(x, z, true) : c.level === 2 && !chunkPaved(c, x, z) ? floorAt(z) - 0.6 : chunkBase(c, x, z), z);
      uvs.push(x / (c.level === 3 ? 14 : c.level === 4 ? 8 : 6), z / (c.level === 3 ? 14 : c.level === 4 ? 8 : 6));
      // (The Moon is all one dust, mottled a little so the ground reads as you move over it.)
      const pocket = c.level === 4 ? pocketAt(x, z) : null;   // (the House: marble, and the wheel's pockets painted into the pit)
      const col = c.level === 4 ? shade.set(pocket === 'red' ? 0xd0392c : pocket === 'black' ? 0x55525a : pocket === 'green' ? 0x2fae5c : 0xffffff)
        : c.level === 3 ? shade.copy(REGOLITH).multiplyScalar((0.82 + 0.3 * Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453 % 1)) * (0.42 + 0.58 * daylight(x, z)))   // (and darker on the night side)
        : c.level === 5 ? shade.set(descentTint(x, z))   // (the Long Way Down paints its own ground: road markings, gravel, the drain)
        : c.level === 2 ? (chunkPaved(c, x, z) ? FLAGSTONE : ROCK) : chunkPaved(c, x, z) ? CONCRETE : GRASS;
      colors.push(col.r, col.g, col.b);
    }
  }
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i, b = a + 1, d = a + n + 1, e = d + 1;
      indices.push(a, d, b, b, d, e);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, c.level === 4 ? mat.marble : c.level === 3 ? mat.dust : mat.ground);
  ground.receiveShadow = true;
  return ground;
}

// The Catacombs' walls, as a full pipe: up each side of the tunnel a smooth curve from the floor,
// through vertical, to the roof (the same curve the physics rides: see catacombs.js). Smooth stone
// to ride up to about head height, masonry from there on over.
function buildTunnelWalls(c, mat) {
  const group = new THREE.Group(), STEP = 2, ROWS = CHUNK / STEP, Q = CATA.quarter, SPLIT = 0.5;
  const sheet = (positions, uvs, cols, material) => {   // a grid of (ROWS + 1) x cols points -> a mesh
    const indices = [];
    for (let j = 0; j < ROWS; j++) for (let i = 0; i < cols - 1; i++) {
      const p = j * cols + i;
      indices.push(p, p + cols, p + 1, p + 1, p + cols, p + cols + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, material);
    mesh.receiveShadow = true;
    return mesh;
  };
  // One strip of the curve, between two angles round it (0 = floor, PI = roof).
  const strip = (side, from, to, steps, material, tile, apron) => {
    const pos = [], uv = [];
    for (let j = 0; j <= ROWS; j++) {
      const z = c.z0 + j * STEP, r = route(z, c.seed), edge = r.x + side * r.w;
      if (apron) { pos.push(edge - side * 1.3, r.floor + 0.015, z); uv.push(z / tile, -0.3); }   // a strip of floor to meet it
      for (let i = 0; i <= steps; i++) {
        const a = from + ((to - from) * i) / steps;
        pos.push(edge + side * Q * Math.sin(a), r.floor + Q * (1 - Math.cos(a)) + 0.015, z);
        uv.push(z / tile, (Q * a) / tile);
      }
    }
    return sheet(pos, uv, steps + 1 + (apron ? 1 : 0), material);
  };
  for (const side of [-1, 1]) {
    group.add(strip(side, 0, SPLIT, 8, mat.ramp, 4, true), strip(side, SPLIT, Math.PI, 26, mat.rock, 5, false));
  }
  return group;
}

// A fire bowl on an iron stand.
function buildBrazier(p, mat) {
  const g = new THREE.Group();
  const stand = new THREE.Mesh(mergeGeometries([
    new THREE.CylinderGeometry(0.07, 0.12, 1.0, 8).translate(0, 0.5, 0),
    new THREE.CylinderGeometry(0.3, 0.36, 0.08, 10).translate(0, 0.04, 0),
    new THREE.CylinderGeometry(0.5, 0.26, 0.36, 12).translate(0, 1.16, 0),
  ]), mat.iron);
  const embers = new THREE.Mesh(shared(EMBERS), mat.ember);
  embers.position.y = 1.33;
  const flare = new THREE.Sprite(mat.flare);
  flare.position.y = 1.7;
  flare.scale.setScalar(4);
  g.add(stand, embers, flare);
  g.position.set(p.x, p.y0, p.z);
  return g;
}
const EMBERS = new THREE.CylinderGeometry(0.44, 0.44, 0.06, 12);

// ---- Ramps, pipes, tombs -------------------------------------------------------

// Grid lines no more than `max` apart (keeping the originals), so a big flat
// prop still bends with the ground under it.
function refine(lines, max = 2) {
  const out = [lines[0]];
  for (let i = 1; i < lines.length; i++) {
    const a = lines[i - 1], b = lines[i], n = Math.ceil((b - a) / max);
    for (let k = 1; k <= n; k++) out.push(a + ((b - a) * k) / n);
  }
  return out;
}

// Mesh for one skate prop: its top surface laid over the ground, plus side walls.
function buildProp(p, mat, c) {
  if (p.type === 'fence') return buildFence(p, mat, c);
  const us = refine(p.us), ws = refine(p.ws), pos = [], uv = [];
  // Ground height under a point given in the prop's own coordinates.
  const ground = (u, w) => chunkBase(c, p.x + u * p.cos + w * p.sin, p.z - u * p.sin + w * p.cos);
  const P = (i, j) => [us[i], ground(us[i], ws[j]) + p.localHeight(us[i], ws[j]), ws[j]];
  const floor = ([x, , z]) => [x, ground(x, z) - 0.4, z];
  const tri = (a, b, c, side) => {
    pos.push(...a, ...b, ...c);
    for (const v of [a, b, c]) uv.push(side ? (v[0] + v[2]) / 3 : v[0] / 3, side ? v[1] / 3 : v[2] / 3);
  };
  const wall = (a, b) => { tri(a, b, floor(b), true); tri(a, floor(b), floor(a), true); };

  for (let i = 0; i < us.length - 1; i++) {
    for (let j = 0; j < ws.length - 1; j++) {
      tri(P(i, j), P(i, j + 1), P(i + 1, j));
      tri(P(i + 1, j), P(i, j + 1), P(i + 1, j + 1));
    }
    wall(P(i, 0), P(i + 1, 0));
    wall(P(i, ws.length - 1), P(i + 1, ws.length - 1));
  }
  for (let j = 0; j < ws.length - 1; j++) {
    wall(P(0, j), P(0, j + 1));
    wall(P(us.length - 1, j), P(us.length - 1, j + 1));
  }

  let geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo = toCreasedNormals(geo, Math.PI / 5);   // smooth curves, crisp edges
  const mesh = new THREE.Mesh(geo, p.type === 'box' ? mat.tomb : mat.ramp);   // boxes are stone tombs
  mesh.castShadow = mesh.receiveShadow = true;

  // Steel coping along quarter-pipe lips.
  if (p.type === 'quarter') {
    const lip = ws.map((w) => new THREE.Vector3(p.lipU, ground(p.lipU, w) + p.lipY, w));
    mesh.add(new THREE.Mesh(mergeGeometries(lip.slice(1).map((pt, k) => tubeGeometry(lip[k], pt, 0.06))), mat.steel));
  }
  mesh.position.set(p.x, 0.01, p.z);
  mesh.rotation.y = p.yaw;
  return mesh;
}

// A cylinder between two points, as bare geometry (for merging).
// Leaning fence round a grave plot: wrought-iron railings you can see through.
// Only the look is bars: what you ride on is still the solid ramp from features.js.
// Bars run up the long outer face, over the top (ending in a spike) and down the
// short inner face; rails run along the fence to hold them together.
function buildFence(p, mat, c) {
  const ground = (u, w) => chunkBase(c, p.x + u * p.cos + w * p.sin, p.z - u * p.sin + w * p.cos);
  const at = (u, w, lift = 0.03) => new THREE.Vector3(u, ground(u, w) + p.localHeight(u, w) + lift, w);
  const tubes = tubeBatch(), top = p.lipU, end = p.u1, width = p.w1 - p.w0;

  const count = Math.max(2, Math.round(width / 0.42));
  for (let i = 0; i <= count; i++) {
    const w = p.w0 + (width * i) / count, post = i % 6 === 0;   // every sixth bar is a thicker post
    const foot = at(0, w, -0.15), lip = at(top, w), inner = at(end, w, -0.15);
    tubes.add(foot, lip, post ? 0.05 : 0.024);
    tubes.add(lip, inner, post ? 0.05 : 0.024);
    // The spike: the bar carries on a little past the top, along the same lean.
    const spike = lip.clone().sub(foot).normalize().multiplyScalar(post ? 0.5 : 0.32).add(lip);
    tubes.add(lip, spike, post ? 0.05 : 0.024, post ? 0.012 : 0.004);
  }
  // Rails: near the foot, part-way up and along the top of the outer face, and one across the inner face.
  const steps = Math.max(1, Math.ceil(width / 2));
  for (const u of [top * 0.1, top * 0.55, top, top + (end - top) * 0.55]) {
    for (let k = 0; k < steps; k++) tubes.add(at(u, p.w0 + (width * k) / steps), at(u, p.w0 + (width * (k + 1)) / steps), u === top ? 0.045 : 0.032);
  }

  const mesh = new THREE.Mesh(tubes.build(), mat.iron);
  mesh.castShadow = true;
  mesh.position.set(p.x, 0.01, p.z);
  mesh.rotation.y = p.yaw;
  return mesh;
}

// tip: the radius at b, if it tapers.
// Many tubes as one geometry, written straight into its arrays. (A fence is a couple of hundred bars: making each
// one as a geometry of its own and merging them was most of the time it took to build a chunk.) The tubes are
// open at the ends, which are in the ground or come to a point.
function tubeBatch(sides = 6) {
  const pos = [], nor = [], uv = [], idx = [];
  const q = new THREE.Quaternion(), along = new THREE.Vector3(), v = new THREE.Vector3(), n = new THREE.Vector3();
  return {
    add(a, b, radius, tip = radius) {
      const len = a.distanceTo(b) || 1e-6, base = pos.length / 3;
      q.setFromUnitVectors(Y, along.subVectors(b, a).divideScalar(len));
      for (let end = 0; end < 2; end++) {
        for (let k = 0; k <= sides; k++) {
          const turn = (k / sides) * Math.PI * 2, r = end ? tip : radius;
          n.set(Math.sin(turn), 0, Math.cos(turn));
          v.set(n.x * r, end * len, n.z * r).applyQuaternion(q).add(a);
          n.applyQuaternion(q);
          pos.push(v.x, v.y, v.z); nor.push(n.x, n.y, n.z); uv.push(k / sides, end);
        }
      }
      for (let k = 0; k < sides; k++) {
        const i0 = base + k, i1 = i0 + 1, j0 = i0 + sides + 1, j1 = j0 + 1;
        idx.push(j0, i0, j1, i0, i1, j1);
      }
    },
    build() {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      return geo;
    },
  };
}

function tubeGeometry(a, b, radius, tip = radius) {
  const len = a.distanceTo(b), mid = a.clone().lerp(b, 0.5);
  const geo = new THREE.CylinderGeometry(tip, radius, len, 8);
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, b.clone().sub(a).normalize()));
  return geo.translate(mid.x, mid.y, mid.z);
}

// Box whose texture repeats every `tile` metres instead of stretching.
function texturedBox(w, h, d, material, tile = 4) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv, sizes = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let i = 0; i < uv.count; i++) {
    const [su, sv] = sizes[Math.floor(i / 4)];
    uv.setXY(i, (uv.getX(i) * su) / tile, (uv.getY(i) * sv) / tile);
  }
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

// Puts a group where its solid prop is. Prop local +u is the group's +X.
function placed(group, p) {
  group.position.set(p.x, p.y0, p.z);
  group.rotation.y = p.yaw;
  return group;
}

// ---- Cemetery pieces -----------------------------------------------------------

function headstoneGeometries() {
  // Rounded-top slab
  const shape = new THREE.Shape();
  shape.moveTo(-0.4, 0); shape.lineTo(-0.4, 0.9); shape.absarc(0, 0.9, 0.4, Math.PI, 0, true); shape.lineTo(0.4, 0); shape.closePath();
  const slab = new THREE.ExtrudeGeometry(shape, { depth: 0.18, bevelEnabled: false });
  slab.translate(0, 0, -0.09);
  // Cross
  const cross = mergeGeometries([
    new THREE.BoxGeometry(0.22, 1.7, 0.2).translate(0, 0.85, 0),
    new THREE.BoxGeometry(0.9, 0.22, 0.2).translate(0, 1.2, 0),
    new THREE.BoxGeometry(0.6, 0.2, 0.5).translate(0, 0.1, 0),
  ]);
  // Obelisk
  const obelisk = mergeGeometries([
    new THREE.CylinderGeometry(0.16, 0.34, 2.4, 4).translate(0, 1.5, 0),
    new THREE.ConeGeometry(0.23, 0.35, 4).translate(0, 2.87, 0),
    new THREE.BoxGeometry(0.8, 0.3, 0.8).translate(0, 0.15, 0),
  ]);
  return [slab, cross, obelisk];
}

// A bare tree: a trunk that keeps forking.
function treeGeometry(rand) {
  const parts = [], q = new THREE.Quaternion();
  const grow = (start, dir, len, radius, depth) => {
    const end = start.clone().addScaledVector(dir, len);
    const geo = new THREE.CylinderGeometry(radius * 0.65, radius, len, 5, 1, true);
    geo.translate(0, len / 2, 0).applyQuaternion(q.setFromUnitVectors(Y, dir)).translate(start.x, start.y, start.z);
    parts.push(geo);
    if (depth === 0) return;
    const forks = depth > 2 ? 2 : 2 + Math.floor(rand() * 2);
    for (let i = 0; i < forks; i++) {
      const bend = new THREE.Vector3(rand() - 0.5, rand() * 0.5 + 0.1, rand() - 0.5).normalize();
      grow(end, dir.clone().lerp(bend, 0.55).normalize(), len * (0.62 + rand() * 0.15), radius * 0.62, depth - 1);
    }
  };
  grow(new THREE.Vector3(), new THREE.Vector3((rand() - 0.5) * 0.15, 1, (rand() - 0.5) * 0.15).normalize(), 3.6, 0.32, 4);
  return mergeGeometries(parts);
}

// Flat-roofed tomb house: matches its solid box exactly, plus trim.
function buildMausoleum(p, mat) {
  const l = p.u1 - p.u0, w = p.w1 - p.w0, h = p.height;
  const house = new THREE.Group();
  const body = texturedBox(l, h, w, mat.wall, 3);
  body.position.y = h / 2;
  const cornice = texturedBox(l + 0.5, 0.35, w + 0.5, mat.stone, 3);
  cornice.position.y = h - 0.18;
  const step = texturedBox(l + 0.8, 0.2, w + 0.8, mat.stone, 3);
  step.position.y = 0.1;
  const footing = texturedBox(l + 0.8, 3, w + 0.8, mat.stone, 3);
  footing.position.y = -1.5;
  house.add(body, cornice, step, footing);
  // Front (+u side): door, columns, a cross on the roof.
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.7), mat.iron);
  door.position.set(l / 2 + 0.02, 1.35, 0);
  door.rotation.y = Math.PI / 2;
  house.add(door);
  for (const s of [-1, 1]) {
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, h - 0.5, 10), mat.stone);
    column.position.set(l / 2 + 0.3, (h - 0.5) / 2, s * 1.5);
    column.castShadow = true;
    house.add(column);
  }
  const cross = new THREE.Mesh(mergeGeometries([new THREE.BoxGeometry(0.12, 0.9, 0.12), new THREE.BoxGeometry(0.12, 0.12, 0.6).translate(0, 0.15, 0)]), mat.stone);
  cross.position.set(l / 2 - 0.3, h + 0.45, 0);
  house.add(cross);
  return placed(house, p);
}

// Pedestal (solid) with a statue on top.
function buildMonument(p, mat) {
  const monument = new THREE.Group();
  const base = texturedBox(1.9, 0.3, 1.9, mat.stone, 2);
  base.position.y = 0.15;
  const pedestal = texturedBox(1.6, 1.6, 1.6, mat.stone, 2);
  pedestal.position.y = 0.8;
  const footing = texturedBox(1.9, 2, 1.9, mat.stone, 2);
  footing.position.y = -1;
  monument.add(base, pedestal, footing);
  const add = (geo, x, y, z, rz = 0) => {
    const mesh = new THREE.Mesh(geo, mat.stone);
    mesh.position.set(x, y, z);
    mesh.rotation.z = rz;
    mesh.castShadow = true;
    monument.add(mesh);
  };
  if (p.statue === 0) {          // angel
    add(new THREE.ConeGeometry(0.5, 1.9, 10), 0, 2.55, 0);
    add(new THREE.SphereGeometry(0.22, 12, 8), 0, 3.6, 0);
    add(new THREE.ConeGeometry(0.28, 1.5, 3), -0.42, 3.0, -0.22, 2.75);   // folded wings
    add(new THREE.ConeGeometry(0.28, 1.5, 3), 0.42, 3.0, -0.22, -2.75);
  } else if (p.statue === 1) {   // tall cross
    add(new THREE.BoxGeometry(0.3, 2.8, 0.3), 0, 3.0, 0);
    add(new THREE.BoxGeometry(1.5, 0.3, 0.3), 0, 3.6, 0);
  } else {                       // urn
    add(new THREE.CylinderGeometry(0.2, 0.35, 0.5, 10), 0, 1.85, 0);
    add(new THREE.SphereGeometry(0.55, 14, 10), 0, 2.55, 0);
    add(new THREE.CylinderGeometry(0.3, 0.2, 0.25, 10), 0, 3.1, 0);
  }
  return placed(monument, p);
}

// Chapel: nave (the solid part is 13 x 24 x 9) with a tall tower and spire at one end.
function buildChapel(p, mat) {
  const chapel = new THREE.Group();
  const nave = texturedBox(13, 9, 24, mat.wall);
  nave.position.y = 4.5;
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-7, 0); roofShape.lineTo(0, 4.5); roofShape.lineTo(7, 0); roofShape.closePath();
  const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(roofShape, { depth: 25, bevelEnabled: false }), mat.stone);
  roof.position.set(0, 9, -12.5);
  roof.castShadow = true;
  const tower = texturedBox(6, 22, 6, mat.wall);
  tower.position.set(0, 11, 9);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(4.6, 12, 4), mat.stone);
  spire.position.set(0, 28, 9);
  spire.rotation.y = Math.PI / 4;
  const door = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 4), mat.iron);
  door.position.set(0, 2, 12.03);
  const footing = texturedBox(13.6, 5, 24.6, mat.stone);
  footing.position.y = -2.5;
  chapel.add(nave, roof, tower, spire, door, footing);
  for (const [x, y, z, ry] of [[0, 17, 12.03, 0], [6.53, 5, -6, Math.PI / 2], [6.53, 5, 0, Math.PI / 2], [-6.53, 5, -6, -Math.PI / 2], [-6.53, 5, 0, -Math.PI / 2]]) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.8), mat.window);
    win.position.set(x, y, z);
    win.rotation.y = ry;
    chapel.add(win);
  }
  return placed(chapel, p);
}

// Street lamp. The real lights are a small pool moved between the nearest lamps (see arena.js).
function buildLamp(p, mat) {
  const lamp = new THREE.Group();
  const pole = new THREE.Mesh(mergeGeometries([
    tubeGeometry(new THREE.Vector3(0, -1.5, 0), new THREE.Vector3(0, 7, 0), 0.09),
    tubeGeometry(new THREE.Vector3(0, 7, 0), new THREE.Vector3(-1.6, 6.8, -1.6), 0.06),
    new THREE.CylinderGeometry(0.2, 0.26, 0.5, 8).translate(0, 0.25, 0),
  ]), mat.iron);
  pole.castShadow = true;
  const bulb = new THREE.Mesh(shared(BULB), mat.bulb);
  bulb.position.set(-1.6, 6.7, -1.6);
  const flare = new THREE.Sprite(mat.flare);
  flare.position.copy(bulb.position);
  flare.scale.setScalar(5);
  lamp.add(pole, bulb, flare);
  lamp.position.set(p.x, p.y0, p.z);
  return lamp;
}
const BULB = new THREE.SphereGeometry(0.22, 10, 8);
