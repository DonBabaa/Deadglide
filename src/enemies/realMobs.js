// Monsters made in Blender (public/models/mobs.glb: see tools/build_mobs.py), in place of the ones enemyModels.js
// builds out of shapes. Each comes already cut into the parts the game swings (a mesh per part, sat at its pivot, its
// colours on its points), so all this has to do is hand them over in the form the rest of the game expects, and say
// how each part swings as the monster walks.
//
// loadRealMobs() is awaited once, before anything is built from ENEMY_PARTS (see main.js). If the file is not there,
// nothing changes: the built ones stay.
import * as THREE from 'three';
import { loadModel } from '../models.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { ENEMY_PARTS, ENEMY_LITE, crowned, plainQueen } from './enemyModels.js';

const PI = Math.PI;
// monster -> part -> [how far it swings about x / y / z (rad), where in the stride it is, does it glow]
const SWINGS = {
  shambler: {
    body: [[0.03, 0, 0.02], 0], head: [[0.05, 0, 0.09], PI / 2], eyes: [[0.05, 0, 0.09], PI / 2, true],
    arm_l: [[0.2, 0, 0.05], 0], arm_r: [[0.26, 0, 0.05], PI], leg_l: [[0.42, 0, 0], 0], leg_r: [[0.2, 0, 0], PI],   // (one leg drags)
  },
  // (Hamzitus and Rubistus: each the body he came with, cut as the other zombies' are: public/models/zombies.glb)
  boss: { body: [[0.04, 0, 0.03], 0], head: [[0.05, 0, 0.06], PI / 2], arm_l: [[0.22, 0, 0.1], 0], arm_r: [[0.22, 0, 0.1], PI], leg_l: [[0.36, 0, 0], PI], leg_r: [[0.36, 0, 0], 0] },
  boss2: { body: [[0.04, 0, 0.03], 0], head: [[0.05, 0, 0.06], PI / 2], arm_l: [[0.22, 0, 0.1], 0], arm_r: [[0.22, 0, 0.1], PI], leg_l: [[0.36, 0, 0], PI], leg_r: [[0.36, 0, 0], 0] },
  boss3: { body: [[0.015, 0, 0.01], 0], eyes: [[0.015, 0, 0.01], 0, true], arm_l: [[0.14, 0, 0.03], 0], arm_r: [[0.14, 0, 0.03], PI], leg_l: [[0.3, 0, 0], PI], leg_r: [[0.3, 0, 0], 0] },
};
SWINGS.zombieb = SWINGS.zombiec = SWINGS.shambler;   // (the other zombies: public/models/zombies.glb)

// What a monster carries or trails that is not part of his body: made here, out of shapes, to fit the body he has
// now. Each is [the part it swings with (its pivot and swing are that part's), the pieces].
const PROPS = {};   // (nobody carries anything of the kind now: Hamzitus's cleaver went with his old body. The hanging of them is kept: see below)

function tinted(geometry, tint) {
  const c = geometry.attributes.color;
  for (let i = 0; i < c.count; i++) c.setXYZ(i, ...tint(c.getX(i), c.getY(i), c.getZ(i)));
  return geometry;
}

function plain(mesh) {
  const from = mesh.geometry, geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', from.attributes.position.clone());
  geometry.setAttribute('normal', from.attributes.normal.clone());
  // (its own texture coordinates, if it came painted; otherwise none worth having, but the built ones have one: parts get merged together)
  geometry.setAttribute('uv', from.attributes.uv ? from.attributes.uv.clone() : new THREE.BufferAttribute(new Float32Array(from.attributes.position.count * 2), 2));
  const c = from.attributes.color, colours = new Float32Array(from.attributes.position.count * 3);
  for (let i = 0; i < from.attributes.position.count; i++) { colours[i * 3] = c ? c.getX(i) : 0.5; colours[i * 3 + 1] = c ? c.getY(i) : 0.5; colours[i * 3 + 2] = c ? c.getZ(i) : 0.5; }
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  if (from.index) geometry.setIndex(from.index.clone());
  return geometry;
}

// What a part is painted with, if it came painted (tools/build_zombies.py): its skin, the bumps in it, and how much it is
// lightened (it was painted for daylight; the number is in its material's name: "zombieb|1.9").
function paint(mesh) {
  const m = mesh.material;
  if (!m || !m.map) return {};
  return { map: m.map, normalMap: m.normalMap || null, gain: +String(m.name).split('|')[1] || 1 };
}
// The material a painted part is drawn with, one per picture (so the parts of a body that share one share it). The
// rest are drawn by the colours of their points, as they always were.
const PAINTED = new Map();
export function paintedMaterial(p, extra = {}) {
  const key = `${p.map.uuid}|${p.gain}|${JSON.stringify(extra)}`;
  if (!PAINTED.has(key)) PAINTED.set(key, new THREE.MeshStandardMaterial({ map: p.map, normalMap: p.normalMap, color: new THREE.Color().setScalar(p.gain), roughness: 0.82, side: THREE.DoubleSide, ...extra }));
  return PAINTED.get(key);
}

ENEMY_PARTS.ultimus = () => ENEMY_PARTS.boss2();   // (until his own model has arrived, or if it never does)

export async function loadRealMobs() {
  let gltf;
  try { gltf = await loadModel('mobs.glb'); } catch (error) { console.warn('Monsters: no models to load, so they stay as they were.', error); return; }
  // (the other zombies are in a file of their own: if it is not there, they are the first one over again)
  try { gltf.scene.add((await loadModel('zombies.glb')).scene); } catch (error) { console.warn('Monsters: no other zombies to load.', error); }
  // (and the rat: tools/build_rat.py. Its parts are numbered as the first modelled rat's were, and take their place.)
  try { gltf.scene.add((await loadModel('rat.glb')).scene); } catch (error) { console.warn('Monsters: no rat to load.', error); }
  const found = {};   // name -> { fine: { part: [mesh...] }, lite: { part: [mesh...] } }  (a part painted on two pictures is two meshes: head, head2)
  const fileOf = (o) => { while (o.parent && o.parent !== gltf.scene) o = o.parent; return o; };   // (which of the files it came in)
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const is = o.name.match(/^([a-z0-9]+)_(lite_)?([a-z_]+?)(?:\d*)$/i);
    if (!is || !SWINGS[is[1]] || !SWINGS[is[1]][is[3]]) return;
    const set = (found[is[1]] ||= { fine: {}, lite: {} })[is[2] ? 'lite' : 'fine'], from = fileOf(o);
    if (!set[is[3]] || set[is[3]].from !== from) { set[is[3]] = []; set[is[3]].from = from; }   // (a later file's part replaces an earlier one's)
    set[is[3]].push(o);
  });
  // The creatures (and the ghost) replace the built ones part for part: a mesh called <monster>_p<n> is part n's new
  // shape, hinged where the mesh sits; how it swings is what the built part did.
  const numbered = {};   // name -> { fine: [mesh...], lite: [mesh...] }
  gltf.scene.traverse((o) => {
    const is = o.isMesh && o.name.match(/^([a-z0-9]+?)_(lite_)?p(\d+)$/i);
    if (is) ((numbered[is[1]] ||= { fine: [], lite: [] })[is[2] ? 'lite' : 'fine'])[+is[3]] = o;
  });
  // (a numbered mesh past the end of the built one's parts is something the built one did not have: a leg)
  const swap = (built, meshes, tint) => () => { const old = built(); return meshes.map((mesh, i) => mesh && (old[i] ? { ...old[i], geometry: tint ? tinted(plain(mesh), tint) : plain(mesh), pivot: mesh.position.toArray() } : { geometry: plain(mesh), pivot: mesh.position.toArray(), swing: [0.55, 0, 0], phase: i % 2 ? PI : 0, glow: false })).filter(Boolean); };
  // Goyitus Ultimus (the hill's boss: systems/descent.js) is all his own: flesh, what burns in him, two arms, bones, iron.
  if (numbered.ultimus) { const U = numbered.ultimus.fine; ENEMY_PARTS.ultimus = () => U.map((mesh, i) => mesh && { geometry: plain(mesh), pivot: mesh.position.toArray(), swing: i === 2 || i === 3 ? [0.9, 0, 0] : [0, 0, 0], phase: i === 3 ? PI : 0, glow: i === 1 }).filter(Boolean); delete numbered.ultimus; }
  for (const name in numbered) {
    if (ENEMY_PARTS[name] && numbered[name].fine.length) ENEMY_PARTS[name] = swap(ENEMY_PARTS[name], numbered[name].fine);
    if (ENEMY_LITE[name] && numbered[name].lite.length) ENEMY_LITE[name] = swap(ENEMY_LITE[name], numbered[name].lite);
  }
  // The Spider Queen is the spider again, in her own colours (violet-black, her mark a brighter red), and wearing
  // what is hers alone: her crown, her spines, her fangs and her eggs (crowned, in enemyModels.js).
  if (numbered.crawler && ENEMY_PARTS.queen) {
    const spider = swap(plainQueen, numbered.crawler.fine, (r, g, b) => (r > 2.2 * g ? [r * 1.5, g * 0.6, b] : [r * 0.85 + 0.012, g * 0.5, b * 1.9 + 0.02]));
    ENEMY_PARTS.queen = () => crowned(spider());
  }
  for (const name in found) {
    const make = (set) => () => Object.entries(SWINGS[name]).filter(([part]) => set[part]).flatMap(([part, [swing, phase, glow]]) => set[part].map((mesh) => ({ geometry: plain(mesh), pivot: mesh.position.toArray(), swing, phase, glow: !!glow, ...paint(mesh) })));
    if (!Object.keys(found[name].fine).length) continue;
    // Babitus puts his gold on as the fight goes on: boss3b, c and d are him again with one, two and all three lots of
    // it (meshes called boss3_gold1..3: made in Blender, their shine baked on, drawn unlit).
    if (name === 'boss3') {
      const gold = [];
      gltf.scene.traverse((o) => { const is = o.isMesh && o.name.match(/^boss3_gold(\d)$/); if (is) gold[+is[1]] = o; });
      ['boss3b', 'boss3c', 'boss3d'].forEach((alias, n) => {
        const body = make(found[name].fine);
        ENEMY_PARTS[alias] = () => [...body(), ...gold.filter((g, tier) => g && tier <= n + 1).map((g) => ({ geometry: plain(g), pivot: [0, 0, 0], swing: SWINGS.boss3.body[0], phase: 0, glow: true }))];
      });
    }
    const real = make(found[name].fine);
    ENEMY_PARTS[name] = !PROPS[name] ? real : () => {
      const parts = real(), names = Object.keys(SWINGS[name]).filter((part) => found[name].fine[part]).flatMap((part) => found[name].fine[part].map(() => part));
      for (const [on, pieces] of PROPS[name]()) {
        const host = parts[names.indexOf(on)];
        if (!host) continue;
        const geometry = mergeGeometries(pieces.map((g) => { const n = g.index ? g.toNonIndexed() : g; for (const key of Object.keys(n.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(key)) n.deleteAttribute(key); return n; }));
        parts.push({ geometry: mergeVertices(geometry).translate(-host.pivot[0], -host.pivot[1], -host.pivot[2]), pivot: host.pivot, swing: host.swing, phase: host.phase, glow: false });
      }
      return parts;
    };
    if (Object.keys(found[name].lite).length && ENEMY_LITE[name]) ENEMY_LITE[name] = make(found[name].lite);
  }
}
