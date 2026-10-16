// DEAD AIR's map: Shackleton Station, a research base in the crater at the Moon's south pole whose floor never
// sees the sun. Built from Quaternius's Modular Sci-Fi MegaKit (CC0: public/models/deadair_kit.glb, made by
// tools/build_deadair_kit.py), laid out here on the kit's own 4 m grid.
//
// Everything about the place comes from one map of letters, one per 4 m cell: what is floor and what is rock, so
// where the walls go, what is solid to walk into and to shoot, which cells a zombie can find its way through, and
// where the doors are that points open. Nothing about it is drawn or tested separately from that map.
//
//   const station = await buildStation(scene);
//   station.collide(position, radius)          keep something round out of the walls (and closed doors)
//   station.ray(from, direction, far)          how far a bullet goes before it hits a wall, the floor or the ceiling
//   station.see(a, b)                          is there a clear line between two points
//   station.flow(target)                       distances from every cell to the target's (for the dead to follow)
//   station.step(position, flow, out)          where to head next from a place, toward the target
//   station.open(door)                         a door's panels slide away, and the zone behind it is open
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { loadModel } from '../models.js';
import { MOON, moonHeight } from '../world/moon.js';
import { regolithTexture } from '../world/textures.js';

export const CELL = 4;          // metres: the kit's grid
export const HEIGHT = 5;        // floor to ceiling (a wall is 3 m, the piece on top of it 2 more); a tall room (ZONES[].h) is 8: two walls and the piece
export const RISE = 2;          // what a flight of the kit's stairs climbs (a cell long): the deck's height over the floor it looks down on
const FACE = 1.56;              // how far a wall's inner face stands from the middle of its cell
const BACK = 2.8;               // ...and its back (it is solid all the way through to there)

// The map. '#' is rock; a letter is a cell of floor in that zone.
//   b  the Arrival Bay (where you come in)     c  the Spine (the corridor: two cells wide where it leaves the bay, for a party)     l  Lab 2
//   m  the Med Bay (along from the end of the Spine)     r  the Reactor (down from Lab 2)
//   (one floor, every room the station's own height: the deck over the Med Bay, its stairs and the taller rooms are gone, at his word)
//   q  the Crew Quarters (east of the Reactor, through its own door: the cell past it is the doorway)
const MAP = [
  '########################',
  '#bbbbbb#ccc#############',   // (the Spine's north branch stops short of the Med Bay: its last cell was a way round the Med Bay's door)
  '#bbbbccccccmmm##########',
  '#bbbbbb###c##m##########',
  '#bbbbbb#llll#mmmmm######',
  '#bbbbbb#llll#mmmmm######',
  '#bbbbbb#llll#mmmmmm#####',
  '#########r###mmmmmm#####',
  '#######rrrrr############',
  '#######rrrrrqqqqq#######',
  '#######rrrrr#qqqq#######',
  '#######rrrrr#qqqq#######',
  '########################',
];
// The stairs: the cell, and the way it climbs (from the floor at its far edge to RISE at this one).
export const STAIRS = [];   // (none now: one floor)
export const ZONES = {
  b: { name: 'Arrival Bay', floor: 'Platform_DarkPlates', wall: ['WallAstra_Straight', 'WallAstra_Straight_Divided', 'WallAstra_Straight_Flat'], top: 'TopCables_Straight', open: true },
  c: { name: 'The Spine', floor: 'Platform_Metal', wall: ['WallBand_Straight', 'WallBand_Straight', 'WallBand_Straight'], top: 'TopCables_Straight_Hanging', open: true },   // (the kit has no divided WallBand: asking for one left a hole)
  l: { name: 'Lab 2', floor: 'Platform_Squares', wall: ['WallAstra_Straight_Flat', 'WallAstra_Straight', 'WallAstra_Straight_Divided'], top: 'TopSimple_Straight', open: false },
  m: { name: 'Med Bay', floor: 'Platform_CenterPlate', wall: ['WallAstra_Straight_Window', 'WallAstra_Straight_Flat', 'WallBand_Straight'], top: 'TopPlastic_Straight', open: false },
  r: { name: 'The Reactor', floor: 'Platform_X', wall: ['WallBand_Straight', 'WallAstra_Straight_Divided', 'WallBand_Straight'], top: 'TopCables_Straight_Hanging', open: false },
  q: { name: 'Crew Quarters', floor: 'Platform_3Plates', wall: ['WallAstra_Straight_Flat', 'WallAstra_Straight_Divided', 'WallAstra_Straight'], top: 'TopPlastic_Straight', open: false },
};
// Doors that points open: the edge between two cells. Closed, they stop everything: you, the dead, bullets.
export const DOORS = [
  { name: 'Lab 2', a: [10, 3], b: [10, 4], price: 750 },
  { name: 'the Med Bay', a: [10, 2], b: [11, 2], price: 1000 },
  { name: 'the Reactor', a: [9, 6], b: [9, 7], price: 1250 },
  { name: 'the Crew Quarters', a: [11, 9], b: [12, 9], price: 1500 },
];
// Where the dead come from (in the dark, out of sight if they can be), the ones found feeding, the player's start,
// the gun on the wall, and what stands about.
export const SPAWNS = [[1, 1], [6, 6], [1, 6], [6, 1], [4, 6], [8, 2], [9, 1], [10, 1], [9, 2], [8, 5], [11, 5], [16, 7], [18, 6], [11, 10], [7, 11], [16, 11], [11, 6], [8, 6], [11, 4], [16, 4], [17, 4], [13, 2], [7, 10], [11, 8], [9, 11], [16, 10], [13, 11], [14, 7]].map(([i, j]) => ({ i, j }));   // (each a hole in the wall with a red gash over it; the Arrival Bay's five open only once the station is awake: until you leave the bay it is the safe room)
export const FEEDERS = [{ i: 8, j: 2, yaw: 0.6 }];   // (in the Spine: the bay is safe until you leave it)
// Where Jun's recorders can lie (logs.js): [x, z, yaw]; the first is the bay's, by the first body, always day one.
export const LOG_SPOTS = [[6.9, 13.1, 1.2], [30.7, 7.0, 0.4], [41.5, 9.3, 2.8], [34.6, 18.5, 2.0], [54.5, 10.6, 1.1], [62.4, 21.4, 0.3], [31.6, 38.5, 1.9], [42.4, 34.6, 2.4], [10.2, 6.4, 0.7], [26.4, 8.8, 1.5], [58.2, 18.4, 2.2], [38.4, 39.2, 0.9], [57.5, 42.6, 1.0], [66.0, 15.4, 2.2], [51.9, 39.4, 0.5]];
// Kask's hand, on the walls, in blood: [i, j, side, along, height, text]. The first is what his lighter finds first.
export const WRITING = [[2, 1, 'n', 0.3, 1.55, 'NINE DAYS'], [1, 5, 'w', 0.2, 1.5, 'WE WERE HERE'], [8, 1, 'n', 0.1, 1.6, 'HOLD IT SHUT'], [12, 2, 'n', 0.4, 1.55, "DON'T OPEN MED BAY"], [7, 8, 'w', 0.2, 1.6, 'DAY 4'], [16, 4, 'n', -0.4, 1.45, 'TWO KEYS'], [13, 11, 's', 0.2, 1.5, 'SHE WAS RIGHT'], [16, 4, 'n', 0.4, 1.5, 'LOOK UP'], [16, 9, 'e', 0.1, 1.6, 'DAY 6  ·  THREE LEFT']];
export const NINE_DAYS = { x: 0, y: 0, z: 0, nx: 0, nz: 0 };
// The crank for the dish (the uplink needs two, with friends): a wheel on a post in the Med Bay, a few strides from the console.
export const CRANK = { x: 13 * CELL + 0.4, z: 4 * CELL + 0.6 };
// The two keys (his ask): two terminals at opposite ends of the station, KEY A on the Arrival Bay's north wall, KEY B on
// Lab 2's south wall by the Reactor's door; turn one and the other within the window (seconds: index.js) and the Reactor's
// door opens, and the safe beside KEY B with it. { x, z, face: the way its screen looks, name, where }
export const SAFE = { a: { x: 3 * CELL + 0.8, z: 1 * CELL - FACE, face: 0, name: 'KEY A', where: 'the Arrival Bay' }, b: { x: 11 * CELL, z: 6 * CELL + FACE, face: Math.PI, name: 'KEY B', where: 'Lab 2, by the Reactor door' }, at: { x: 10.5 * CELL - 0.8, z: 6 * CELL + FACE } };
// The crawlspace: a duct through the rock from the Spine's south wall (cell 8, 2) to the Lab's north wall (cell 8, 4), a metre
// square, on your belly. Either end has a hatch; it is the old shaft access (log 3). Something uses it too.
export const DUCT = { from: new THREE.Vector3(8 * CELL, 0, 2 * CELL + FACE - 0.05), to: new THREE.Vector3(8 * CELL, 0, 4 * CELL - FACE + 0.05), w: 1.1, h: 1.1 };   // (where NINE DAYS is, and which way it faces into the room: filled in when the station is built)
export const START = { i: 2, j: 2, yaw: Math.PI / 2 };
// The way into the lounge: an airlock in the Arrival Bay's west wall (the edge of cell i, j on that side). Through it is
// a room of its own (lounge.js), where the dead cannot follow.
export const LOUNGE = { i: 17, j: 5, side: 'e', name: 'Crew Lounge', price: 2000 };   // (behind the Med Bay's door, and 2000 to unseal it: a place earned)
// The Med Bay's uplink: a console on its north wall. (The west end of the Arrival Bay, where the shuttle's dock was, is the lift's now.)
export const UPLINK = { i: 14, j: 4, x: 14 * CELL, z: 4 * CELL - 1.25 };
// The lift's cell: the west end of the Arrival Bay. Its ceiling is the shaft (lift.js builds the cage and the shaft).
export const LIFT_CELL = { i: 1, j: 2 };
// The bay crate the drill sends you over (PROPS' 'Prop_Crate4' at 4.5, 3.6: in metres).
export const BAY_CRATE = new THREE.Vector3(4.5 * CELL - CELL / 2, 0.9, 3.6 * CELL - CELL / 2);
export const WALL_GUNS = [{ gun: 'machineGun', price: 1000, i: 7, j: 2, side: 'n' }, { gun: 'shotgun', price: 1200, i: 13, j: 5, side: 'w' }];
// The crate in the Reactor: points in, a gun out (any of them: see arms.js).
export const CRATE = { x: 36, z: 44.6, price: 950 };   // (where it stands: against the Reactor's back wall, behind its core)
export const CORE = { x: 36, z: 36 };                  // the reactor's core, in the middle of it
const PROPS = [
  // (the corner pair stands off the west wall, one square on the other: offset, they made a pocket in front of the (1,1) hole
  // that a zombie coming through it could not get out of)
  ['Prop_Crate4', 1.6, 0.56, 1.6, 0.3], ['Prop_Crate3', 1.7, 0.56, 1.0, 0.1], ['Prop_Crate4', 1.6, 1.68, 1.6, 0.45], ['Prop_Barrel_Large', 4.6, 0, 4.4, 0],
  ['Prop_Barrel_Large', 4.2, 0, 4.7, 0], ['Prop_Crate4', 3.6, 0.56, 1.2, 0.8], ['Prop_Computer', 8.3, 0, 4.25, 0], ['Prop_Computer', 8.75, 0, 4.25, 0],
  ['Prop_Crate3', 11.3, 0.56, 6.4, 0.5], ['Prop_Barrel_Large', 11.6, 0, 4.3, 0], ['Prop_Chest', 9.0, 0, 6.6, 0], ['Prop_Vent_Big', 6.0, 3.6, 1.62, 0],
  // the Med Bay: beds (crates under sheets, near enough), its computers, a cabinet
  ['Prop_Computer', 14.3, 0, 5.2, Math.PI / 2], ['Prop_Crate4', 16.375, 0.56, 6.625, 0], ['Prop_Crate3', 15.0, 0.56, 6.65, 0.1], ['Prop_Chest', 16.6, 0, 5.0, -Math.PI / 2], ['Prop_AccessPoint', 14.5, 1.4, 4.15, 0],
  // Lab 2: crates and a pillar to fight round, a terminal
  ['Prop_Crate4', 9.2, 0.56, 5.4, 0.4], ['Prop_Crate3', 9.75, 0.56, 5.15, 0.9], ['Prop_Crate4', 11.6, 0.56, 5.6, 0.2], ['Prop_Barrel_Large', 11.7, 0, 6.9, 0],
  ['Prop_Computer', 8.7, 0, 4.7, 0], ['Column_MetalSupport', 10.5, 0, 6.0, 0], ['Prop_Barrel_Large', 8.6, 0, 6.8, 0],
  // the Arrival Bay: more of what came in on the last shuttle
  ['Prop_Crate4', 4.5, 0.56, 3.6, 0.2], ['Prop_Chest', 2.2, 0, 4.4, 1.6], ['Prop_Barrel_Large', 1.4, 0, 3.9, 0],
  // the Reactor: pipes up to the roof round its core, barrels, cables
  ['Column_Pipes', 8.25, 0, 8.875, 0], ['Column_Pipes', 10.75, 0, 8.875, Math.PI], ['Column_Pipes', 8.25, 0, 10.125, 0], ['Column_Pipes', 10.75, 0, 10.125, Math.PI],
  ['Prop_Barrel_Large', 7.4, 0, 10.65, 0], ['Prop_Barrel_Large', 7.6, 0, 10.75, 0], ['Prop_Crate4', 11.575, 0.56, 10.6, 0.3], ['Prop_Crate3', 11.6, 0.56, 8.4, 0.2],
  ['Prop_Crate4', 8.1, 0.56, 11.7, 0.6], ['Prop_Barrel_Large', 11.5, 0, 11.75, 0], ['Column_Pipes', 8.25, 0, 11.4, 0], ['Column_Pipes', 10.75, 0, 11.4, Math.PI],
  // the Med Bay's east end: the nook under the stairs, more beds
  ['Prop_Crate4', 17.9, 0.56, 4.7, 0.1], ['Prop_Crate3', 18.4, 0.56, 4.6, 0.7], ['Prop_Barrel_Large', 18.6, 0, 5.4, 0], ['Prop_Chest', 19.3, 0, 7.6, Math.PI],
  // the Crew Quarters: lockers along the north wall, footlockers, crates
  ['Prop_ItemHolder', 13.3, 0, 9.22, 0], ['Prop_ItemHolder', 13.8, 0, 9.22, 0], ['Prop_ItemHolder', 14.3, 0, 9.22, 0], ['Prop_ItemHolder', 14.8, 0, 9.22, 0],
  ['Prop_Chest', 14.6, 0, 11.05, 0], ['Prop_Chest', 15.6, 0, 11.05, 0], ['Prop_Crate4', 16.9, 0.56, 9.5, 0.3], ['Prop_Crate3', 17.0, 0.56, 10.1, 0.9], ['Prop_Barrel_Large', 13.4, 0, 11.7, 0],
];
// The bunks in the Crew Quarters: [x, z, yaw] in metres (two tiers, a blanket on each; the chicken is under one of them).
export const BUNKS = [[56, 44.9, 0], [60, 44.9, 0], [64, 44.9, 0], [51.1, 41.0, Math.PI / 2]];
// The crew (what is left of them), where they fell: [x, z, yaw], in metres. And the blood: on the floor under them and where
// it was thrown ([x, z, size]), and up the walls ([i, j, side, along, height, size]).
export const CORPSES = [[6, 13.5, 1.2], [30, 7.5, 0.4], [41, 8.6, 2.8], [34, 18, 2.0], [54, 10, 1.1], [62, 22, 0.3], [31, 38, 1.9], [42, 35, 2.4]];
const FLOOR_BLOOD = [[6, 13.5, 1.6], [30, 7.5, 1.3], [41, 8.6, 1.5], [34, 18, 1.7], [54, 10, 1.4], [62, 22, 1.2], [31, 38, 1.8], [42, 35, 1.5], [10, 6, 1.1], [26, 8.4, 0.9], [37, 22, 1.2], [58, 18, 1.0], [38, 39, 1.0], [14.5, 5.5, 1.3]];
// Trails of it across the floor, from a body to where something was dragged (or crawled): [x1, z1, x2, z2].
const TRAILS = [[30, 7.5, 26.4, 8.8], [41, 8.6, 34.6, 18.5], [54, 10, 58.2, 18.4], [31, 38, 38.4, 39.2], [6, 13.5, 10.2, 6.4]];
const WALL_BLOOD = [[3, 1, 'n', -0.6, 1.2, 1.6], [8, 2, 's', 0.4, 1.0, 1.3], [10, 1, 'n', -0.3, 1.1, 1.4], [13, 2, 'n', 0.2, 1.3, 1.5], [8, 5, 'w', 0.5, 1.1, 1.4], [7, 9, 'w', -0.3, 1.4, 1.7], [15, 4, 'n', 0.8, 1.0, 1.2], [1, 3, 'w', 0.3, 0.9, 1.1]];
// What of those you walk into (and shoot into, below their tops): crates, barrels, the computers, the chests, the pipes.
const SOLID = /Crate|Barrel|Computer|Chest|Column/;

const at = (i, j) => (MAP[j] && MAP[j][i] && MAP[j][i] !== '#' ? MAP[j][i] : null);
const SIDES = { w: [-1, 0, 0], e: [1, 0, Math.PI], n: [0, -1, -Math.PI / 2], s: [0, 1, Math.PI / 2] };   // [di, dj, the turn that puts a kit wall (made on the west side) on that side]
// The levels. A cell's floor is at its zone's y (0, or the deck's RISE); a stair cell climbs from 0 at its low edge to RISE
// at its high one. Its ceiling is its zone's h (5, or 8 for a tall room). Two cells are linked (you walk from one to the
// other) when they share a level, or through a stair's two ends: the deck looks down into the Med Bay over a parapet.
const stairAt = (i, j) => { const s = STAIRS.find((s) => s.i === i && s.j === j); if (!s) return null; const [di, dj] = SIDES[s.dir]; return { ...s, di, dj }; };
export const levelOf = (i, j) => ZONES[at(i, j)]?.y || 0;
export const ceilOf = (i, j) => ZONES[at(i, j)]?.h || HEIGHT;
const linked = (i, j, di, dj) => {
  if (!at(i, j) || !at(i + di, j + dj)) return false;
  const sa = stairAt(i, j), sb = stairAt(i + di, j + dj);
  if (sa) return di === sa.di && dj === sa.dj ? levelOf(i + di, j + dj) === RISE : di === -sa.di && dj === -sa.dj ? levelOf(i + di, j + dj) === 0 : false;
  if (sb) return linked(i + di, j + dj, -di, -dj);
  return levelOf(i, j) === levelOf(i + di, j + dj);
};
// The floor's height at a point (a stair's slope in its cell).
export const levelAt = (p) => {
  const i = Math.round(p.x / CELL), j = Math.round(p.z / CELL), st = stairAt(i, j);
  if (!st) return levelOf(i, j);
  const t = ((p.x - i * CELL) * st.di + (p.z - j * CELL) * st.dj + CELL / 2) / CELL;
  return RISE * Math.max(0, Math.min(1, t));
};
export const ceilAt = (p) => ceilOf(Math.round(p.x / CELL), Math.round(p.z / CELL));
// Where the dead come out: at each spawn, the wall on a side that is rock is broken through (a hole in it: the kit's
// broken wall), and they drop out of it. { i, j, side, zone, x, z, yaw: the way into the room }
export const OPENINGS = SPAWNS.map(({ i, j }) => {
  const side = ['n', 'w', 'e', 's'].find((k) => !at(i + SIDES[k][0], j + SIDES[k][1])) || 'n';
  const [di, dj, turn] = SIDES[side];
  // (the hole is off the middle of the piece: 0.9 m along it)
  const hx = 0.9 * Math.sin(turn), hz = 0.9 * Math.cos(turn);
  return { i, j, side, zone: at(i, j), x: i * CELL + di * (FACE - 0.45) + hx, z: j * CELL + dj * (FACE - 0.45) + hz, yaw: Math.atan2(-di, -dj), wx: i * CELL + di * FACE + hx, wz: j * CELL + dj * FACE + hz };
});
const openingAt = (i, j, side) => OPENINGS.some((o) => o.i === i && o.j === j && o.side === side);
const doorKey = (a, b) => (a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]) ? `${a}|${b}` : `${b}|${a}`);
const w2 = new THREE.Vector3(), v = new THREE.Vector3(), q = new THREE.Quaternion(), m = new THREE.Matrix4(), e3 = new THREE.Euler(), s1 = new THREE.Vector3(1, 1, 1);

// The kit, fetched once (the station and the airlock on the Moon both build from it): its pieces by name.
let kitComing = null;
export const loadKit = () => (kitComing ||= loadModel('deadair_kit.glb').then((gltf) => {
  const pieces = {};
  for (const node of gltf.scene.children) pieces[node.name] = node;
  // (the kit's window glass is painted on: see through it, a little)
  gltf.scene.traverse((o) => { if (o.isMesh && o.material?.name === 'M_Glass') { o.material.transparent = true; o.material.opacity = 0.32; o.material.depthWrite = false; o.material.roughness = 0.08; o.material.metalness = 0.3; o.material.color.set(0xb9d4e8); } });
  return pieces;
}));

let station_crank = null;
export const crankWheel = () => station_crank;
const ductLamps = [];
export const ductLights = () => ductLamps;
export async function buildStation(scene) {
  const pieces = await loadKit();
  const W = MAP[0].length, H = MAP.length, rng = mulberry(7);

  // ---- What is solid: every wall as a box, every closed door as a box. Bucketed by cell, for speed.
  const doors = DOORS.map((d) => ({ ...d, key: doorKey(d.a, d.b), open: false, slide: 0, panels: [] }));
  const doorAt = new Map(doors.map((d) => [d.key, d]));
  const boxes = [];
  const edgeBlocked = (i, j, di, dj) => {
    if (!at(i + di, j + dj) || !linked(i, j, di, dj)) return true;
    const d = doorAt.get(doorKey([i, j], [i + di, j + dj]));
    return !!d && !d.open;
  };
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    if (!at(i, j)) continue;
    const cx = i * CELL, cz = j * CELL;
    for (const [di, dj] of Object.values(SIDES)) {
      const nb = at(i + di, j + dj);
      if (nb && linked(i, j, di, dj)) continue;
      const level = levelOf(i, j), other = nb ? levelOf(i + di, j + dj) : 0, plain = nb && !stairAt(i, j) && !stairAt(i + di, j + dj);
      if (plain && level > other) continue;   // (the upper side of a parapet: the lower cell's wall is what stops you)
      const top = plain && level < other ? level + 3 : undefined;   // (a parapet: a wall's height; over it, bullets and a look down)
      // (the slab from the wall's face back into the rock; a little longer than the cell, so corners close up: but only
      // at an end where the wall goes on round a corner. Where it stops at open floor (the cell along it is open, and so
      // is the one beyond that, round its end), it stops: 0.8 m more of it there was a wall nobody could see)
      const runs = (s) => { const ai = i + (di ? 0 : s), aj = j + (di ? s : 0); return !at(ai, aj) || !at(ai + di, aj + dj) ? 0.8 : 0; };
      const lo = runs(-1), hi = runs(1);
      if (di) boxes.push({ x0: Math.min(cx + di * FACE, cx + di * BACK), x1: Math.max(cx + di * FACE, cx + di * BACK), z0: cz - CELL / 2 - lo, z1: cz + CELL / 2 + hi, top });
      else boxes.push({ x0: cx - CELL / 2 - lo, x1: cx + CELL / 2 + hi, z0: Math.min(cz + dj * FACE, cz + dj * BACK), z1: Math.max(cz + dj * FACE, cz + dj * BACK), top });
    }
  }
  for (const d of doors) {   // (a closed door: a slab across the edge between its two cells)
    const x = ((d.a[0] + d.b[0]) / 2) * CELL, z = ((d.a[1] + d.b[1]) / 2) * CELL, across = d.a[0] === d.b[0];
    d.box = across ? { x0: x - CELL / 2, x1: x + CELL / 2, z0: z - 0.18, z1: z + 0.18, door: d } : { x0: x - 0.18, x1: x + 0.18, z0: z - CELL / 2, z1: z + CELL / 2, door: d };
    d.at = new THREE.Vector3(x, 0, z);
    d.across = across;
    boxes.push(d.box);
  }
  const solid = (b) => (!b.door || !b.door.open) && (!b.lift || b.lift.solid);   // (a door shut; the lift's rails while it is down)

  // ---- What is drawn. Every piece of kit is put where it goes; then all of it that shares a material is welded into
  // one mesh (a couple of hundred pieces would otherwise be a couple of thousand things to draw).
  const welder = kitWelder(pieces), place = welder.place, group = welder.group;
  // (a wall from y up to the ceiling h: walls of 3, then the 2 m piece on top if that is what is left)
  // (the kit's top piece is modelled sitting on a 3 m wall: its own geometry runs from 3 to 5, so it is placed 3 m under where it shows)
  const stack = (Z, cx, cz, yaw, y, h, first = null) => {
    let first0 = null;
    for (let n = 0; y + 3 <= h; y += 3, n++) { const name = n === 0 && first ? first : Z.wall[Math.floor(rng() * Z.wall.length)]; if (n === 0) first0 = name; place(name, cx, y, cz, yaw); }
    if (h - y >= 2) place(Z.top, cx, y - 3, cz, yaw);
    return first0;
  };
  // Where each wall's inner face really is (the kit's walls are not all the same depth): by cell and side, for what hangs on them.
  const faces = new Map(), faceCache = new Map();
  const faceOf = (name) => { if (!name || !pieces[name]) return FACE; if (!faceCache.has(name)) { const b = new THREE.Box3().setFromObject(pieces[name]); faceCache.set(name, Math.max(1.3, Math.min(2.1, -b.max.x))); } return faceCache.get(name); };
  const faceAt = (i, j, side) => faces.get(`${i},${j},${side}`) ?? FACE;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const zone = at(i, j);
    if (!zone) continue;
    const Z = ZONES[zone], cx = i * CELL, cz = j * CELL, st = stairAt(i, j), base = st ? 0 : (Z.y || 0), h = Z.h || HEIGHT;
    place(Z.floor, cx, base, cz);
    if (st) {   // (two flights side by side fill the cell, climbing from its low edge)
      const yaw = Math.atan2(st.di, st.dj);
      for (const s of [-1, 1]) place('Platform_Stairs_4', cx + st.di * CELL / 2 + s * st.dj, 0, cz + st.dj * CELL / 2 - s * st.di, yaw + Math.PI);   // (the kit's flight is high at its own end: from the high edge, back down)
    }
    if (!(i === LIFT_CELL.i && j === LIFT_CELL.j)) place('Platform_DarkPlates', cx, h, cz, 0, Math.PI);   // the ceiling: floor plates, face down (the lift's cell has the shaft instead)
    for (const [side, [di, dj, yaw]] of Object.entries(SIDES)) {
      const next = at(i + di, j + dj);
      if (next && linked(i, j, di, dj)) {   // (open to the next cell: but where this room is the taller, the wall goes on up over the other's ceiling)
        const hn = ceilOf(i + di, j + dj);
        if (h > hn) stack(Z, cx, cz, yaw, doorAt.has(doorKey([i, j], [i + di, j + dj])) ? 5 : hn - 2, h);
        continue;
      }
      const plain = next && !st && !stairAt(i + di, j + dj);
      if (plain && levelOf(i, j) > levelOf(i + di, j + dj)) continue;   // (the deck's edge over a room: the room's wall is its parapet)
      if (plain && levelOf(i, j) < levelOf(i + di, j + dj)) { place(Z.wall[Math.floor(rng() * Z.wall.length)], cx, base, cz, yaw); place('BottomMetal_Straight', cx, base, cz, yaw); continue; }   // (the parapet: one wall, a metre over the deck)
      if (i === LOUNGE.i && j === LOUNGE.j && side === LOUNGE.side) {   // (an airlock: a door frame in place of the wall)
        place('Door_Frame_Square', cx + di * CELL / 2, base, cz + dj * CELL / 2, di ? Math.PI / 2 : 0);
        if (h > base + 5) stack(Z, cx, cz, yaw, base + 5, h);
        continue;
      }
      // (a wall with her writing on it is solid: never a window, or the words float on the glass)
      const written = WRITING.some(([wi, wj, ws]) => wi === i && wj === j && ws === side);
      const wall = openingAt(i, j, side) ? (zone === 'c' || zone === 'r' ? 'WallBand_Straight_Broken' : 'WallAstra_Straight_Broken') : written ? (Z.wall.find((n) => !/Window/.test(n)) || 'WallAstra_Straight_Flat') : null;
      faces.set(`${i},${j},${side}`, faceOf(stack(Z, cx, cz, yaw, base, h, wall)));
      place('BottomMetal_Straight', cx, base, cz, yaw);
    }
  }
  // The bunks (the Crew Quarters): a frame of posts, two tiers, a blanket on each.
  {
    const steel = new THREE.MeshStandardMaterial({ color: 0x5a5c62, metalness: 0.75, roughness: 0.45 }), blanket = new THREE.MeshStandardMaterial({ map: blanketTexture(), roughness: 0.95 });
    for (const [x, z, yaw] of BUNKS) {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = yaw;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.0, 8), steel); post.position.set(sx * 1.0, 1.0, sz * 0.45); g.add(post); }
      for (const y of [0.45, 1.35]) {
        const slab = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.12, 0.9), steel); slab.position.y = y; g.add(slab);
        const bed = new THREE.Mesh(new THREE.BoxGeometry(1.96, 0.16, 0.86), blanket); bed.position.y = y + 0.14; g.add(bed);
        const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.5), new THREE.MeshStandardMaterial({ color: 0xb8b2a6, roughness: 0.9 })); pillow.position.set(-0.72, y + 0.27, 0); g.add(pillow);
      }
      g.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
      scene.add(g);
      const c = Math.cos(yaw), s = Math.sin(yaw), ex = Math.abs(c) * 1.0 + Math.abs(s) * 0.45, ez = Math.abs(s) * 1.0 + Math.abs(c) * 0.45;
      boxes.push({ x0: x - ex, x1: x + ex, z0: z - ez, z1: z + ez, top: 1.7 });
    }
  }
  for (const d of doors) {
    place('Door_Frame_Square', d.at.x, 0, d.at.z, d.across ? 0 : Math.PI / 2);
  }
  // (a sign over every door: what is through it, and what it costs; OPEN once it is)
  const doorSignTex = (d) => signTexture(d.name.replace(/^the /i, '').toUpperCase(), d.open ? '●  OPEN  ●' : `SEALED  ·  ${d.price}`, d.open ? '#7dffa0' : '#ffc266', d.open ? '#7dffa0' : '#ff5040');
  for (const d of doors) {
    // (one on each face of the frame's header, clear of it, so it reads from either room)
    const mat = new THREE.MeshBasicMaterial({ map: doorSignTex(d), transparent: true, toneMapped: false });
    const signs = [-1, 1].map((k) => { const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.0), mat); sign.position.set(d.at.x + (d.across ? 0 : 0.42 * k), 4.45, d.at.z + (d.across ? 0.42 * k : 0)); sign.rotation.y = d.across ? (k > 0 ? 0 : Math.PI) : (k > 0 ? Math.PI / 2 : -Math.PI / 2); scene.add(sign); return sign; });
    d.sign = signs[0];
    d.resign = () => { mat.map = doorSignTex(d); mat.needsUpdate = true; };
  }
  for (const [name, x, y, z, yaw] of PROPS) {
    place(name, x * CELL - CELL / 2, y, z * CELL - CELL / 2, yaw);
    // (solid where it stands: a box round it, as high as it is)
    if (!SOLID.test(name) || !pieces[name]) continue;
    const local = new THREE.Box3().setFromObject(pieces[name]), M = new THREE.Matrix4().compose(v.set(x * CELL - CELL / 2, y, z * CELL - CELL / 2), q.setFromEuler(e3.set(0, yaw, 0)), s1);
    const world = local.clone().applyMatrix4(M);
    if (world.min.y > levelAt(v) + 1.2) continue;
    boxes.push({ x0: world.min.x + 0.05, x1: world.max.x - 0.05, z0: world.min.z + 0.05, z1: world.max.z - 0.05, top: world.max.y });
  }
  welder.finish();
  // The doors' panels move, so they are their own meshes: two halves that slide apart into the frame's sides.
  for (const d of doors) {
    for (const half of [-1, 1]) {
      const panel = pieces.Door_Metal.clone(true);
      panel.position.copy(d.at);
      // (each half turned so that it covers the half of the doorway it slides out of: in a north-south wall the two had it
      // the other way round, so "open" slid each across the other's half and the doorway stayed shut to look at, though
      // it was open to walk through: the Med Bay's and the Crew Quarters')
      panel.rotation.y = d.across ? (half < 0 ? 0 : Math.PI) : (half < 0 ? -Math.PI / 2 : Math.PI / 2);
      panel.userData.half = half;
      panel.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
      group.add(panel);
      d.panels.push(panel);
    }
  }
  // The airlock into the lounge: shut (it is a room of its own: you go through, nothing follows), a sign by it, and the
  // only warm light in the place over it. lounge.at: the middle of the doorway; outside: where you stand to go in (and
  // come back out to); facing: the way into the bay from it.
  const airlock = (D, signTex, warmColour) => {
    const [di, dj] = SIDES[D.side], at3 = new THREE.Vector3(D.i * CELL + di * CELL / 2, 0, D.j * CELL + dj * CELL / 2);
    const panels = [];
    for (const half of [-1, 1]) {
      const panel = pieces.Door_Metal.clone(true);
      panel.position.copy(at3);
      panel.rotation.y = di ? (half < 0 ? -Math.PI / 2 : Math.PI / 2) : (half < 0 ? 0 : Math.PI);   // (as the doors' halves, above)
      panel.userData.half = half; panel.userData.across = !di;
      panel.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
      group.add(panel); panels.push(panel);
    }
    const into = new THREE.Vector3(-di, 0, -dj), side = new THREE.Vector3(-into.z, 0, into.x);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.75), new THREE.MeshStandardMaterial({ map: signTex, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 0.9, transparent: true }));
    sign.position.copy(at3).addScaledVector(into, 0.62).addScaledVector(side, 2.2).setY(2.55);
    sign.lookAt(sign.position.clone().add(into));
    const warm = new THREE.PointLight(warmColour, 7, 6, 1.8);
    warm.position.copy(at3).addScaledVector(into, 1.2).setY(3.6);
    group.add(sign, warm);
    const slide = (k) => { for (const p of panels) { p.position.copy(at3); if (p.userData.across) p.position.x += 2.05 * k * p.userData.half; else p.position.z += 2.05 * k * p.userData.half; } };
    // (the seats, for the shuttle: three spots just inside the bay from the door, a stride apart)
    const seats = [-1.3, 0, 1.3].map((o) => at3.clone().addScaledVector(into, 2.3).addScaledVector(side, o));
    return { at: at3, outside: at3.clone().addScaledVector(into, 1.5), facing: Math.atan2(into.x, into.z), into, side, sign, panels, slide, seats };
  };
  const lounge = airlock(LOUNGE, signTexture('CREW LOUNGE', '●  SEALED  ·  SAFE  ●'), 0xffb066);
  const dock = null;   // (the shuttle dock is gone: the lift, lift.js, is the way in and out)
  // The uplink: a console on the Med Bay's north wall, and a sign over it.
  place('Prop_Computer', UPLINK.x, 0, UPLINK.z - 0.1, 0);
  {
    const tex = signTexture('UPLINK', 'DEAD AIR  ·  NO CARRIER', '#ff8a5a', '#ff5040');
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.7, transparent: true }));
    sign.position.set(UPLINK.x, 2.35, UPLINK.z - 0.2);
    group.add(sign);
  }
  scene.add(group);
  // The blood: splashes on the floor, and up the walls, drawn once each (it is nine days old).
  {
    const mat = () => new THREE.MeshStandardMaterial({ map: bloodTexture(), transparent: true, roughness: 0.25, metalness: 0.1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
    const plane = new THREE.PlaneGeometry(1, 1);
    for (const [x, z, size] of FLOOR_BLOOD) {
      const b = new THREE.Mesh(plane, mat());
      b.rotation.x = -Math.PI / 2; b.rotation.z = Math.random() * Math.PI * 2;
      b.position.set(x, 0.012, z); b.scale.set(size, size * (0.7 + Math.random() * 0.5), 1);
      b.receiveShadow = true;
      scene.add(b);
    }
    // (the crawlspace: a square tube of dark steel through the rock, a red lamp halfway; a hatch on each wall)
    {
      const dark = new THREE.MeshStandardMaterial({ color: 0x2c2d31, metalness: 0.55, roughness: 0.7 });
      const len = DUCT.to.z - DUCT.from.z + 1.4, zc = (DUCT.from.z + DUCT.to.z) / 2, half = DUCT.w / 2, top = DUCT.h;
      // (lined with riveted sheet: seams across it every 40 cm, rivets along them, rust and grime run down from them)
      const lining = (along, across) => { const t = ductTexture(); t.repeat.set(along, across); return new THREE.MeshStandardMaterial({ map: t, color: 0xb8bcc4, metalness: 0.55, roughness: 0.62 }); };
      for (const [x, y, w, h] of [[-half - 0.05, top / 2, 0.1, top], [half + 0.05, top / 2, 0.1, top], [0, top + 0.05, DUCT.w + 0.2, 0.1], [0, -0.05, DUCT.w + 0.2, 0.1]]) {
        const sideFace = w < h;   // (a wall: its face is the box's x side; the roof and floor: its y side)
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, len), lining(len / 0.8, (sideFace ? h : w) / 0.8)); m.position.set(DUCT.from.x + x, y, zc); m.receiveShadow = true; scene.add(m);
      }
      for (let k = 0; k < 5; k++) { const rib = new THREE.Mesh(new THREE.BoxGeometry(DUCT.w + 0.1, 0.04, 0.06), dark); rib.position.set(DUCT.from.x, top - 0.02, DUCT.from.z + 0.6 + k * (len - 1.5) / 4); scene.add(rib); }
      const lamp = new THREE.PointLight(0xff2a14, 1.4, 4, 1.6); lamp.position.set(DUCT.from.x, top - 0.15, zc); scene.add(lamp);
      // (either hatch: a sign over it, and an amber lamp that blinks (index.js), so that it reads as a way through)
      for (const [z, into] of [[DUCT.from.z, -1], [DUCT.to.z, 1]]) {
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), new THREE.MeshBasicMaterial({ map: signTexture('CRAWLSPACE', 'MAINTENANCE  ·  E TO ENTER', '#ffb347', '#ffd27a'), transparent: true, toneMapped: false }));
        sign.position.set(DUCT.from.x, 2.0, z + into * 0.06); sign.rotation.y = into > 0 ? 0 : Math.PI; scene.add(sign);
        const amber = new THREE.PointLight(0xffb347, 1.6, 5, 1.6); amber.position.set(DUCT.from.x, 1.9, z + into * 0.6); scene.add(amber);
        ductLamps.push(amber);
      }
      // (each hatch: a frame round the hole in the wall, and its grille, louvred, hinged at the top and swung up open over it)
      const steel = new THREE.MeshStandardMaterial({ color: 0x3c3f45, metalness: 0.7, roughness: 0.45 });
      for (const [z, into] of [[DUCT.from.z, -1], [DUCT.to.z, 1]]) {
        const fz = z + into * 0.04, W = DUCT.w + 0.16, Hh = DUCT.h + 0.12;
        for (const [x, y, w, h] of [[0, Hh, W + 0.1, 0.08], [0, 0.02, W + 0.1, 0.06], [-W / 2, Hh / 2, 0.08, Hh], [W / 2, Hh / 2, 0.08, Hh]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), steel); b.position.set(DUCT.from.x + x, y, fz); b.castShadow = true; scene.add(b); }
        const flap = new THREE.Group(); flap.position.set(DUCT.from.x, Hh, fz + into * 0.03); flap.rotation.x = into * -1.25; scene.add(flap);   // (hinged along the frame's top, swung out and up)
        for (const [x, y, w, h] of [[0, -0.03, W - 0.04, 0.05], [0, -Hh + 0.08, W - 0.04, 0.05], [-W / 2 + 0.03, -Hh / 2, 0.05, Hh - 0.08], [W / 2 - 0.03, -Hh / 2, 0.05, Hh - 0.08]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.04), steel); b.position.set(x, y, 0); b.castShadow = true; flap.add(b); }
        for (let n = 0; n < 7; n++) { const slat = new THREE.Mesh(new THREE.BoxGeometry(W - 0.1, 0.11, 0.012), steel); slat.position.set(0, -0.13 - n * ((Hh - 0.2) / 7), 0); slat.rotation.x = 0.55; flap.add(slat); }
        for (const x of [-W / 2 + 0.12, W / 2 - 0.12]) { const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.12, 8), steel); hinge.rotation.z = Math.PI / 2; hinge.position.set(DUCT.from.x + x, Hh, fz + into * 0.03); scene.add(hinge); }
      }
    }
    // (the crank: a post and a wheel, by the dish's cable run)
    {
      const steel = new THREE.MeshStandardMaterial({ color: 0x8a8c92, metalness: 0.8, roughness: 0.4 });
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.0, 10), steel); post.position.set(CRANK.x, 0.5, CRANK.z); scene.add(post);
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 10, 32), steel); wheel.position.set(CRANK.x, 1.05, CRANK.z); wheel.rotation.y = Math.PI / 2; scene.add(wheel);
      for (let i = 0; i < 4; i++) { const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.58, 0.03), steel); spoke.position.set(CRANK.x, 1.05, CRANK.z); spoke.rotation.x = i * Math.PI / 4; wheel.add(spoke); spoke.position.set(0, 0, 0); }
      station_crank = wheel;
      const tag = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.55), new THREE.MeshBasicMaterial({ map: signTexture('DISH', 'MANUAL  ·  CRANK', '#9ae6ff', '#ffd27a'), transparent: true, side: THREE.DoubleSide, toneMapped: false })); tag.position.set(CRANK.x - 0.2, 1.7, CRANK.z); tag.rotation.y = -Math.PI / 2; scene.add(tag);
    }
    // (the two keys' terminals; the safe on Lab 2's south wall by KEY B, and the shutter that slides up)
    {
      const dark = new THREE.MeshStandardMaterial({ color: 0x3a3b3f, metalness: 0.5, roughness: 0.6 });
      // (each key: a terminal against the wall, its screen saying which key it is and what it opens, a lamp on it)
      for (const P of [SAFE.a, SAFE.b]) {
        const out = new THREE.Vector3(Math.sin(P.face), 0, Math.cos(P.face));   // (from the wall into the room)
        const pc = pieces.Prop_Computer?.clone(true);
        if (pc) { pc.position.set(P.x, 0, P.z + out.z * 0.42); pc.rotation.y = P.face; pc.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } }); scene.add(pc); }
        const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.34), new THREE.MeshBasicMaterial({ map: keyScreen(P.name, false), toneMapped: false }));
        scr.position.set(P.x, 1.62, P.z + out.z * 0.05); scr.rotation.y = P.face; scene.add(scr); P.screen = scr;
        const glow = new THREE.PointLight(0xffd27a, 0.9, 3.2, 1.6); glow.position.set(P.x, 1.5, P.z + out.z * 0.6); scene.add(glow); P.glow = glow;
        const led = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a14, toneMapped: false })); led.position.set(P.x + 0.42 * Math.cos(P.face), 1.62, P.z + out.z * 0.06); scene.add(led); P.led = led;
      }
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.5), dark); box.position.set(SAFE.at.x, 1.1, SAFE.at.z - 0.25); scene.add(box);
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.66, 0.05), new THREE.MeshStandardMaterial({ color: 0x55575c, metalness: 0.7, roughness: 0.4 })); door.position.set(SAFE.at.x, 1.1, SAFE.at.z - 0.53); scene.add(door);
      SAFE.door = door;
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6), new THREE.MeshBasicMaterial({ map: signTexture('TWO KEYS', 'KEY A IN THE BAY  ·  KEY B HERE', '#ffd27a', '#ff5040'), transparent: true, toneMapped: false })); sign.position.set(SAFE.at.x, 1.95, SAFE.at.z - 0.02); sign.rotation.y = Math.PI; scene.add(sign);
    }
    // (the writing: her words, each on a plane just off the wall, the paint run)
    for (const [k, [i, j, side, along, height, text]] of WRITING.entries()) {
      const [di, dj] = SIDES[side], ax = -dj, az = di;
      const w = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.6), new THREE.MeshBasicMaterial({ map: writingTexture(text), transparent: true, depthWrite: false, toneMapped: false }));
      w.position.set(i * CELL + di * (faceAt(i, j, side) - 0.09) + ax * along, height, j * CELL + dj * (faceAt(i, j, side) - 0.09) + az * along);
      w.rotation.y = Math.atan2(-di, -dj); w.rotation.z = (Math.random() - 0.5) * 0.12;
      w.scale.setScalar(text.length > 12 ? 1.25 : 1);
      scene.add(w);
      if (k === 0) { NINE_DAYS.x = w.position.x; NINE_DAYS.y = height; NINE_DAYS.z = w.position.z; NINE_DAYS.nx = -di; NINE_DAYS.nz = -dj; }
    }
    for (const [x1, z1, x2, z2] of TRAILS) {
      const n = 11;
      for (let k = 0; k < n; k++) {
        const t = k / (n - 1), b = new THREE.Mesh(plane, mat());
        b.position.set(x1 + (x2 - x1) * t + (Math.random() - 0.5) * 0.3, 0.012, z1 + (z2 - z1) * t + (Math.random() - 0.5) * 0.3);
        b.rotation.x = -Math.PI / 2; b.rotation.z = Math.random() * Math.PI;
        const size = 0.9 - 0.5 * t;
        b.scale.set(size * 1.6, size, 1);
        scene.add(b);
      }
    }
    for (const [i, j, side, along, height, size] of WALL_BLOOD) {
      const [di, dj] = SIDES[side], b = new THREE.Mesh(plane, mat());
      const ax = -dj, az = di;   // (along the wall)
      b.position.set(i * CELL + di * (faceAt(i, j, side) - 0.08) + ax * along, height, j * CELL + dj * (faceAt(i, j, side) - 0.08) + az * along);
      b.rotation.y = Math.atan2(-di, -dj); b.rotation.z = (Math.random() - 0.5) * 0.6;
      b.scale.set(size, size * 1.3, 1);
      scene.add(b);
    }
  }
  // The holes they come through: lit red from the other side, so you know where to look.
  const gashTex = gashTexture(), gash = new THREE.PlaneGeometry(1.5, 1.35);
  const gashMat = new THREE.MeshStandardMaterial({ map: gashTex, emissiveMap: gashTex, emissive: 0x5a1208, emissiveIntensity: 0.55, roughness: 1, metalness: 0, side: THREE.DoubleSide });
  for (const o of OPENINGS) {
    const [di, dj] = SIDES[o.side];
    const g = new THREE.Mesh(gash, gashMat);
    g.position.set(o.wx + di * 0.25, 2.15, o.wz + dj * 0.25);
    g.rotation.y = Math.atan2(-di, -dj);
    scene.add(g);
  }

  // ---- Finding the way: distances (in cells) from every cell to the target's, through open edges.
  const index = (i, j) => j * W + i;
  const cellOf = (p) => [Math.round(p.x / CELL), Math.round(p.z / CELL)];
  const flow = (target) => {
    const dist = new Float32Array(W * H).fill(Infinity), [ti, tj] = cellOf(target), queue = [[ti, tj]];
    if (!at(ti, tj)) return dist;
    dist[index(ti, tj)] = 0;
    for (let k = 0; k < queue.length; k++) {
      const [i, j] = queue[k], d = dist[index(i, j)];
      for (const [di, dj] of Object.values(SIDES)) {
        if (edgeBlocked(i, j, di, dj) || dist[index(i + di, j + dj)] !== Infinity) continue;
        dist[index(i + di, j + dj)] = d + 1;
        queue.push([i + di, j + dj]);
      }
    }
    return dist;
  };

  const station = {
    group, doors, boxes, pieces, lounge, dock, width: W, depth: H, map: MAP,
    zoneAt: (p) => { const [i, j] = cellOf(p); return at(i, j); },
    cellOf, center: (i, j, out = new THREE.Vector3()) => out.set(i * CELL, 0, j * CELL),
    isOpenZone: (zone) => ZONES[zone]?.open || doors.some((d) => d.open && (at(...d.a) === zone || at(...d.b) === zone)) || (!!ZONES[zone]?.via && station.isOpenZone(ZONES[zone].via)),
    levelAt, ceilAt, stairAt: (p) => !!stairAt(Math.round(p.x / CELL), Math.round(p.z / CELL)),

    // Push a circle (radius r, on the floor plane) out of everything solid near it.
    // (y: how high your feet are: what you are above, you are not stopped by)
    collide(p, r, y = 0) {
      for (let pass = 0; pass < 2; pass++) for (const b of boxes) {
        if (!solid(b) || p.x < b.x0 - r || p.x > b.x1 + r || p.z < b.z0 - r || p.z > b.z1 + r) continue;
        if (b.top !== undefined && y >= b.top - 0.12) continue;
        const nx = Math.max(b.x0, Math.min(b.x1, p.x)), nz = Math.max(b.z0, Math.min(b.z1, p.z)), dx = p.x - nx, dz = p.z - nz, d = Math.hypot(dx, dz);
        if (d >= r) continue;
        if (d > 1e-6) { p.x = nx + (dx / d) * r; p.z = nz + (dz / d) * r; }
        else {   // (its middle is inside the box: out by the nearest side)
          const out = [p.x - b.x0, b.x1 - p.x, p.z - b.z0, b.z1 - p.z], k = out.indexOf(Math.min(...out));
          if (k === 0) p.x = b.x0 - r; else if (k === 1) p.x = b.x1 + r; else if (k === 2) p.z = b.z0 - r; else p.z = b.z1 + r;
        }
      }
      return p;
    },
    // How far along `dir` (a unit vector) from `from` before something solid, up to `far`. A box is solid from the floor to the ceiling.
    ray(from, dir, far = 100) {
      let best = far;
      if (dir.y < -1e-6) best = Math.min(best, (0 - from.y) / dir.y);
      if (dir.y > 1e-6) best = Math.min(best, (ceilAt(from) - from.y) / dir.y);
      for (const b of boxes) {
        if (!solid(b)) continue;
        let t0 = 0, t1 = best;
        for (const [o, d, lo, hi] of [[from.x, dir.x, b.x0, b.x1], [from.z, dir.z, b.z0, b.z1]]) {
          if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) { t0 = Infinity; break; } continue; }
          let a = (lo - o) / d, c = (hi - o) / d;
          if (a > c) [a, c] = [c, a];
          t0 = Math.max(t0, a); t1 = Math.min(t1, c);
          if (t0 > t1) break;
        }
        if (b.top !== undefined && t0 <= t1 && Math.min(from.y + dir.y * t0, from.y + dir.y * t1) > b.top) continue;   // (over the top of it)
        if (t0 <= t1 && t0 < best) best = t0;
      }
      return Math.max(0, best);
    },
    // The floor under a point (r: how wide what stands there is): the top of the highest low thing it is over, or 0.
    groundAt(p, r = 0.2) {
      let g = levelAt(p);
      for (const b of boxes) if (b.top !== undefined && b.top > g && b.top < g + 1.6 && solid(b) && p.x > b.x0 - r && p.x < b.x1 + r && p.z > b.z0 - r && p.z < b.z1 + r) g = Math.max(g, b.top);
      return g;
    },
    // What is in front of p, the way dir goes, within reach: the low thing there (a crate, a barrel: to vault over or
    // climb onto): { top, near, far } (how far along dir its near side is, and its far side), or null.
    ledge(p, dir, reach = 1.1) {
      const out = (lo, hi, o, d) => (d > 1e-6 ? (hi - o) / d : d < -1e-6 ? (lo - o) / d : Infinity);
      for (let s = 0.3; s <= reach; s += 0.2) {
        const x = p.x + dir.x * s, z = p.z + dir.z * s;
        let got = null;
        for (const b of boxes) {
          if (b.top === undefined || b.top >= 1.45 || !solid(b) || x <= b.x0 || x >= b.x1 || z <= b.z0 || z >= b.z1) continue;
          const far = Math.min(out(b.x0, b.x1, p.x, dir.x), out(b.z0, b.z1, p.z, dir.z));
          const near = Math.max(-out(-b.x1, -b.x0, -p.x, dir.x), -out(-b.z1, -b.z0, -p.z, dir.z), 0);   // (the same, from the other side)
          got = { top: Math.max(got?.top ?? 0, b.top), near: Math.min(got?.near ?? Infinity, near), far: Math.max(got?.far ?? 0, far) };
        }
        if (got) return got;
      }
      return null;
    },
    // Whether the way from a to b, over anything low (a crate), runs into a wall or a shut door.
    walled(a, b) { v.set(b.x - a.x, 0, b.z - a.z); const d = v.length(); if (d < 1e-6) return false; v.divideScalar(d); return station.ray(w2.set(a.x, 1.5, a.z), v, d) < d - 0.05; },
    // Whether something r across can stand at p on the floor (nothing solid there, nothing low under it).
    clear(p, r = 0.3) {
      const q = { x: p.x, z: p.z };
      this.collide(q, r, 0);
      return Math.hypot(q.x - p.x, q.z - p.z) < 0.02 && this.groundAt(p, r) <= levelAt(p) + 0.01;
    },
    see(a, b) { v.subVectors(b, a); const d = v.length(); if (d < 1e-6) return true; v.divideScalar(d); return station.ray(a, v, d) >= d - 0.05; },
    flow,
    // Where to head next from p, given a flow field: the middle of the neighbouring cell nearest the target (or the
    // target itself, if it is in sight: the dead come straight at you when they can see you).
    step(p, dist, out) {
      const [i, j] = cellOf(p);
      let best = dist[index(i, j)], bi = i, bj = j;
      for (const [di, dj] of Object.values(SIDES)) {
        if (edgeBlocked(i, j, di, dj)) continue;
        const d = dist[index(i + di, j + dj)];
        if (d < best) { best = d; bi = i + di; bj = j + dj; }
      }
      return out.set(bi * CELL, 0, bj * CELL);
    },
    open(d) {
      if (d.open) return false;
      d.open = true;
      d.resign?.();
      return true;
    },
    // Every door shut again (a new game).
    reset() {
      for (const d of doors) {
        d.open = false; d.slide = 0; d.resign?.();
        for (const p of d.panels) p.position.copy(d.at);
      }
    },
    update(dt) {
      for (const d of doors) {
        // (hammered on, from the other side: the panels jolt in their frame, and part a crack)
        if (d.jolt > 0 && !d.open) {
          d.jolt -= dt;
          const gap = d.jolt > 0 ? 0.035 + 0.025 * Math.abs(Math.sin(d.jolt * 34)) : 0;
          for (const p of d.panels) { p.position.copy(d.at); if (d.across) p.position.x += gap * p.userData.half; else p.position.z += gap * p.userData.half; }
          continue;
        }
        if (!d.open || d.slide >= 1) continue;
        d.slide = Math.min(1, d.slide + dt / 0.9);
        const k = d.slide * d.slide * (3 - 2 * d.slide);
        for (const p of d.panels) {
          const half = p.userData.half, push = 2.05 * k * half;
          p.position.copy(d.at);
          if (d.across) p.position.x += push; else p.position.z += push;
        }
      }
    },
  };
  return station;
}

// Laying out kit, welded: place(name, x, y, z, yaw, roll) puts a piece of the kit there; finish() welds everything put
// down so far that shares a material into one mesh, in `group` (a couple of hundred pieces would otherwise be a couple
// of thousand things to draw). The station uses it, and so does the lounge (lounge.js).
export function kitWelder(pieces) {
  const welds = new Map(), group = new THREE.Group();
  const place = (name, x, y, z, yaw = 0, roll = 0) => {
    const piece = pieces[name];
    if (!piece) { console.warn(`DEAD AIR: no piece ${name} in the kit`); return; }
    piece.updateMatrixWorld(true);
    m.compose(v.set(x, y, z), q.setFromEuler(e3.set(roll, yaw, 0)), s1);
    piece.traverse((o) => {
      if (!o.isMesh || o.isSkinnedMesh) return;
      const geometry = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(m, o.matrixWorld));
      const key = o.material.name || o.material.uuid;
      if (!welds.has(key)) welds.set(key, { material: o.material, parts: [] });
      welds.get(key).parts.push(geometry);
    });
  };
  const finish = () => {
    for (const { material, parts } of welds.values()) {
      even(parts);
      const merged = mergeGeometries(parts, false);
      if (!merged) { console.warn(`DEAD AIR: could not weld ${material.name}`); continue; }
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
      for (const g of parts) g.dispose();
    }
    welds.clear();
    return group;
  };
  return { place, finish, group };
}

// Welding needs every piece to carry the same kinds of data. Pieces of the kit differ (some have vertex colours, some a
// second set of texture coordinates): what one lacks is given a harmless default (white, zero), what only some have
// and nothing reads is dropped, and every piece gets an index.
function even(parts) {
  for (const g of parts) {
    for (const name of ['skinIndex', 'skinWeight']) g.deleteAttribute(name);
    // (all as plain 32-bit numbers: one piece's colours are bytes, another's are floats)
    for (const [name, attr] of Object.entries(g.attributes)) {
      if (attr.array instanceof Float32Array && !attr.normalized && !attr.isInterleavedBufferAttribute) continue;
      const out = new Float32Array(attr.count * attr.itemSize);
      for (let i = 0; i < attr.count; i++) for (let c = 0; c < attr.itemSize; c++) out[i * attr.itemSize + c] = attr.getComponent(i, c);
      g.setAttribute(name, new THREE.BufferAttribute(out, attr.itemSize));
    }
  }
  const names = new Set(parts.flatMap((g) => Object.keys(g.attributes)));
  for (const g of parts) {
    for (const name of names) {
      if (g.attributes[name]) continue;
      const size = name === 'color' ? (parts.find((o) => o.attributes.color)?.attributes.color.itemSize || 3) : name.startsWith('uv') ? 2 : name === 'tangent' ? 4 : 3;
      const fill = new Float32Array(g.attributes.position.count * size).fill(name === 'color' ? 1 : 0);
      g.setAttribute(name, new THREE.BufferAttribute(fill, size));
    }
    if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
    for (const name of Object.keys(g.morphAttributes)) delete g.morphAttributes[name];
  }
}

// A seeded random number, so the station is the same every time.
function mulberry(seed) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// The sign by the airlock: stencilled, lit from behind, amber.
// Blood, nine days old: dark, a splash with drips off it (drawn once per splash, so no two are alike).
function bloodTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 256);
  const blot = (x, y, r, a) => { const grd = g.createRadialGradient(x, y, 0, x, y, r); grd.addColorStop(0, `rgba(96,8,6,${a})`); grd.addColorStop(0.7, `rgba(70,4,3,${a * 0.85})`); grd.addColorStop(1, 'rgba(60,0,0,0)'); g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
  blot(128, 128, 90, 0.95);
  for (let k = 0; k < 24; k++) { const a = Math.random() * Math.PI * 2, d = 40 + Math.random() * 80; blot(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 6 + Math.random() * 22, 0.6 + Math.random() * 0.4); }
  for (let k = 0; k < 9; k++) { const x = 60 + Math.random() * 136, y = 100 + Math.random() * 60, h = 20 + Math.random() * 90; g.fillStyle = 'rgba(95,6,4,0.85)'; g.fillRect(x, y, 2 + Math.random() * 3, h); blot(x + 1, y + h, 4 + Math.random() * 4, 0.9); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// What is behind a broken wall: a dark way through, red light down the sides of it, cables.
function gashTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 70, 6, 64, 64, 80);
  r.addColorStop(0, '#000000'); r.addColorStop(0.55, '#050101'); r.addColorStop(0.85, '#1a0402'); r.addColorStop(1, '#2e0703');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 26; i++) {   // (pipes and cables, dark against it)
    const x = Math.random() * 128, w = 1 + Math.random() * 3;
    g.fillStyle = `rgba(0,0,0,${0.35 + Math.random() * 0.5})`; g.fillRect(x, 0, w, 128);
    if (Math.random() < 0.25) { g.fillStyle = 'rgba(140,40,20,0.18)'; g.fillRect(x + w, 0, 1, 128); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// A lit sign: a title and a line under it, in a colour each.
// A key terminal's screen: which key, what it opens, and (turned) that it is.
export function keyScreen(name, on, left = 0) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 140;
  const g = c.getContext('2d');
  g.fillStyle = on ? '#062012' : '#1a0806'; g.fillRect(0, 0, 256, 140);
  for (let y = 0; y < 140; y += 3) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, y, 256, 1); }
  g.textAlign = 'center'; g.fillStyle = on ? '#7dffb0' : '#ff5040';
  g.font = '700 56px Anton, Impact, sans-serif'; g.fillText(name, 128, 62);
  g.font = '600 20px "Barlow Condensed", sans-serif'; g.fillStyle = on ? '#bfffd8' : '#ffd27a';
  g.fillText(on ? `TURNED  ·  THE OTHER, ${Math.ceil(left)} S` : 'TWO KEYS OPEN THE REACTOR', 128, 96);
  g.fillText(on ? '' : 'E  ·  TURN THIS, THEN THE OTHER', 128, 122);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// The crawlspace's lining: riveted steel sheet (seams across it, rivets along them, rust and grime run from them).
function ductTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#4a4d53'; g.fillRect(0, 0, 256, 256);
  for (let n = 0; n < 2600; n++) { const v = 60 + Math.random() * 40; g.fillStyle = `rgba(${v},${v + 2},${v + 6},0.25)`; g.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 4, 1 + Math.random() * 2); }
  for (const y of [0, 128]) {
    g.fillStyle = '#26282c'; g.fillRect(0, y, 256, 5); g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, y + 5, 256, 1);
    for (let x = 8; x < 256; x += 22) { g.fillStyle = '#2a2c30'; g.beginPath(); g.arc(x, y + 11, 3.2, 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,0.28)'; g.beginPath(); g.arc(x - 1, y + 10, 1.2, 0, 7); g.fill(); }
    for (let n = 0; n < 9; n++) { const x = Math.random() * 256, h = 20 + Math.random() * 70; const grd = g.createLinearGradient(0, y + 12, 0, y + 12 + h); grd.addColorStop(0, 'rgba(92,46,20,0.55)'); grd.addColorStop(1, 'rgba(92,46,20,0)'); g.fillStyle = grd; g.fillRect(x, y + 12, 2 + Math.random() * 5, h); }
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
// Words on a wall in blood: a hand that shook, and the paint that ran.
export function writingTexture(text) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 280;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 1024, 280);
  g.font = '700 118px "Barlow Condensed", "Arial Narrow", sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
  const width = g.measureText(text).width, scale = Math.min(1, 960 / width);
  g.save(); g.translate(32, 120); g.scale(scale, 1);
  let x = 0;
  for (const ch of text) {
    const dy = (Math.random() - 0.5) * 14, rot = (Math.random() - 0.5) * 0.12;
    g.save(); g.translate(x, dy); g.rotate(rot);
    g.fillStyle = `rgba(${120 + Math.random() * 30},${6 + Math.random() * 10},${8 + Math.random() * 8},0.92)`;
    g.fillText(ch, 0, 0);
    g.restore();
    const w = g.measureText(ch).width;
    // (a drip under some of the letters)
    if (Math.random() < 0.35) { g.fillStyle = 'rgba(110,8,10,0.8)'; const dx = x + w * (0.3 + Math.random() * 0.5); g.fillRect(dx, 40 + dy, 5 + Math.random() * 4, 30 + Math.random() * 110); g.beginPath(); g.arc(dx + 4, 70 + dy + Math.random() * 110, 6, 0, Math.PI * 2); g.fill(); }
    x += w + 6;
  }
  g.restore();
  // (smears from the heel of the hand)
  for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(90,6,8,${0.15 + Math.random() * 0.2})`; g.fillRect(Math.random() * 900, 60 + Math.random() * 120, 60 + Math.random() * 200, 8 + Math.random() * 20); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
// The painted sky behind it: the horizon's hills, the Earth up over them, the stars.
export function moonTexture() {
  const c = document.createElement('canvas'); c.width = 1536; c.height = 560;
  const g = c.getContext('2d');
  g.fillStyle = '#02030a'; g.fillRect(0, 0, 1536, 560);
  const rnd = mulberry(11);
  for (let i = 0; i < 420; i++) { const a = 0.3 + rnd() * 0.7, r = rnd() < 0.08 ? 1.8 : 1.0; g.fillStyle = `rgba(255,255,255,${a})`; g.beginPath(); g.arc(rnd() * 1536, rnd() * 330, r, 0, Math.PI * 2); g.fill(); }
  // the Earth: a blue disc, cloud swirls, the night side
  const ex = 1130, ey = 120, er = 58;
  const sky = g.createRadialGradient(ex - 18, ey - 18, 6, ex, ey, er); sky.addColorStop(0, '#9fd6ff'); sky.addColorStop(0.55, '#2b7ad6'); sky.addColorStop(1, '#0a2a6a');
  g.fillStyle = sky; g.beginPath(); g.arc(ex, ey, er, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.55)'; for (let i = 0; i < 9; i++) { g.beginPath(); g.ellipse(ex - 30 + rnd() * 60, ey - 30 + rnd() * 60, 10 + rnd() * 16, 4 + rnd() * 5, rnd() * 3, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = 'rgba(42,110,60,0.7)'; g.beginPath(); g.ellipse(ex - 12, ey + 8, 22, 14, 0.6, 0, Math.PI * 2); g.fill();
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = 'rgba(0,0,10,0.82)'; g.beginPath(); g.arc(ex + 34, ey + 8, er, 0, Math.PI * 2); g.fill();
  g.globalCompositeOperation = 'source-over';
  // the ground: grey hills, a crater's rim, the near regolith lit from the left
  g.fillStyle = '#3a3a3c'; g.beginPath(); g.moveTo(0, 350);
  for (let x = 0; x <= 1536; x += 48) g.lineTo(x, 330 + Math.sin(x / 190) * 14 + Math.sin(x / 61) * 6 + rnd() * 4);
  g.lineTo(1536, 560); g.lineTo(0, 560); g.closePath(); g.fill();
  const near = g.createLinearGradient(0, 360, 0, 560); near.addColorStop(0, '#55555a'); near.addColorStop(1, '#232326');
  g.fillStyle = near; g.beginPath(); g.moveTo(0, 400); for (let x = 0; x <= 1536; x += 32) g.lineTo(x, 392 + Math.sin(x / 83) * 9 + rnd() * 5); g.lineTo(1536, 560); g.lineTo(0, 560); g.closePath(); g.fill();
  for (let i = 0; i < 70; i++) { const x = rnd() * 1536, y = 405 + rnd() * 150, r = 3 + rnd() * 14; g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(x, y, r, r * 0.4, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = 'rgba(150,150,158,0.5)'; g.beginPath(); g.ellipse(x - r * 0.3, y - r * 0.15, r * 0.6, r * 0.2, 0, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = 'rgba(190,190,200,0.35)'; g.beginPath(); g.ellipse(560, 372, 170, 18, 0, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// A bunk's blanket: grey issue wool, a dark fold, a stripe at the foot.
export function blanketTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d'), rnd = mulberry(5);
  g.fillStyle = '#4c5248'; g.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 1800; i++) { g.fillStyle = `rgba(${20 + rnd() * 30},${24 + rnd() * 30},${18 + rnd() * 24},0.25)`; g.fillRect(rnd() * 256, rnd() * 128, 2, 1); }
  g.fillStyle = '#2c3029'; g.fillRect(170, 0, 6, 128); g.fillRect(186, 0, 3, 128);
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(60, 0, 8, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export function signTexture(title, line, colour = '#ffc266', lineColour = '#7dffa0') {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(14, 10, 6, 0.92)'; g.fillRect(0, 0, 512, 256);
  g.strokeStyle = colour; g.lineWidth = 8; g.strokeRect(10, 10, 492, 236);
  g.fillStyle = colour; g.textAlign = 'center';
  g.font = '700 74px "Barlow Condensed", "Arial Narrow", sans-serif'; g.fillText(title, 256, 118);
  g.font = '600 38px "Barlow Condensed", "Arial Narrow", sans-serif'; g.fillStyle = lineColour; g.fillText(line, 256, 190);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
