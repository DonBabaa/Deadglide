// The House: level 4, where the game ends. It is the players' casino (casino/room.js), blown up to the size of an
// arena you can skate: the same room, K times over, with everything where it is there. A marble floor under the
// chandeliers; his blackjack table up the far end, to ollie onto, its padded rim a rail, a row of stools in front of
// it; the roulette table on your left as you come in, its wheel sunk into the floor as a bowl; the slot machines
// down the left wall; the bar down the right, a brass rail along it; columns down both sides; velvet ropes leading in
// from the doors; and the walls curving up as a quarter pipe all the way round. Babitus Goyitus is behind his table.
//
// Like the Moon it is one fixed shape, the same every time. houseHeight(x, z) is the floor; PROPS and RAILS are what
// stands on it (see features.js); what it looks like beyond that is world/houseScene.js. Everything is laid out
// from the middle of the room, in metres: +x is to the right as you come in, -z is ahead of you (toward Babitus).
import * as F from './features.js';

const CHUNK = 96;
const K = 64 / 19;   // how many times bigger than the players' casino (38 by 30) it is
export const HOUSE = {
  x: 48, z: 6,         // the middle of the room, in world coordinates (you arrive 42 m south of it, facing in)
  k: K,
  halfX: 64, halfZ: 15 * K,   // from the middle to the side walls, and to the end walls
  wall: 8,             // the walls curve up this far before they go sheer
  pit: { x: -8.1 * K, z: 5.5 * K, r: 12, depth: 3.0 },   // the roulette wheel: a bowl in the floor, where the casino's wheel is
  table: { x: 0, z: -4.1 * K, long: 4.8 * K, deep: 3.0 * K, high: 1.1, rim: 2.4 * K, back: 0.6 * K },   // his blackjack table: its middle, how far across and from front to back it is; and the half-round of it (its radius, and how deep the straight strip behind that is)
  light: { x: 0, z: -5 * K },   // the great chandelier, over his table: the signal for what he is about to do
  boss: { x: 0, z: -7.4 * K },  // where Babitus stands when you arrive: behind his table
  doors: { x: 0, z: 15 * K - 6 },      // the way out (behind you as you come in): the portal opens here
  bar: { x: 55.5, z: -4 * K, out: -1, long: 12 * K },   // the bar, down the right-hand wall: the back of its counter, which way the room is from there, how long it is (a drink is slid out onto it for you)
  slots: [-11.2, -3.8, 3.7, 11.2].map((z) => [-60, z * K]),   // the slot machines down the left-hand wall: monsters come out of them
  columns: [-12.5, 12.5].flatMap((x) => [-11, -4, 3, 10].map((z) => [x * K, z * K])),
  statues: [[-7 * K, -12.9 * K], [7 * K, -12.9 * K]],
};
const LIP_OUT = HOUSE.wall * 0.95, LIP_UP = HOUSE.wall - Math.sqrt(HOUSE.wall * HOUSE.wall - LIP_OUT * LIP_OUT);   // where the wall goes sheer
export const WALL_TOP = LIP_UP;

// World coordinates of a spot given from the middle of the room.
export const houseSpot = ([x, z]) => ({ x: HOUSE.x + x, z: HOUSE.z + z });

// `drawn`: the height to draw the floor at: the same, but without the sheer wall (houseScene.js stands a proper one there).
export function houseHeight(x, z, drawn = false) {
  const dx = x - HOUSE.x, dz = z - HOUSE.z, P = HOUSE.pit;
  let h = 0;
  const d = Math.hypot(dx - P.x, dz - P.z);
  if (d < P.r) h -= P.depth * (0.5 + 0.5 * Math.cos((d / P.r) * Math.PI));   // the wheel: flat-bottomed, steepest half-way up
  const t = Math.max(Math.abs(dx) - (HOUSE.halfX - HOUSE.wall), Math.abs(dz) - (HOUSE.halfZ - HOUSE.wall));
  // (drawn: a ledge outside the wall, and then nothing: there are windows in it, and the harbour is a long way down)
  if (t > 0) h += t < LIP_OUT ? HOUSE.wall - Math.sqrt(HOUSE.wall * HOUSE.wall - t * t) : drawn ? (t < LIP_OUT + 1.6 ? LIP_UP : -60) : 60;
  return h;
}

// Which pocket of the wheel a spot in the pit is over: 'green', 'red' or 'black' (null outside it).
export function pocketAt(x, z) {
  const dx = x - HOUSE.x - HOUSE.pit.x, dz = z - HOUSE.z - HOUSE.pit.z;
  if (Math.hypot(dx, dz) >= HOUSE.pit.r) return null;
  const n = Math.floor(((Math.atan2(dz, dx) + Math.PI) / (Math.PI * 2)) * 37) % 37;
  return n === 0 ? 'green' : n % 2 ? 'red' : 'black';
}

// Keep a point (the camera) inside the walls.
export function houseConfine(pos) {
  pos.x = Math.max(HOUSE.x - (HOUSE.halfX - 2), Math.min(HOUSE.x + HOUSE.halfX - 2, pos.x));
  pos.z = Math.max(HOUSE.z - (HOUSE.halfZ - 2), Math.min(HOUSE.z + HOUSE.halfZ - 2, pos.z));
}

// ---- What stands on it ----------------------------------------------------------------------
const at = (x, z) => ({ x: HOUSE.x + x, z: HOUSE.z + z });
export const PROPS = [], RAILS = [];
// A rail through a line of points [x, z, height above the floor there]. loop: its end joins its start.
function line(points, loop = false) {
  const made = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az, ah] = points[i], [bx, bz, bh] = points[i + 1];
    made.push(F.rail(HOUSE.x + ax, houseHeight(HOUSE.x + ax, HOUSE.z + az) + ah, HOUSE.z + az, HOUSE.x + bx, houseHeight(HOUSE.x + bx, HOUSE.z + bz) + bh, HOUSE.z + bz));
  }
  made.forEach((r, i) => { r.next = made[i + 1] || (loop ? made[0] : null); r.prev = made[i - 1] || (loop ? made[made.length - 1] : null); });
  RAILS.push(...made);
}

// His blackjack table: a slab to ollie onto, the padded rim round its curved edge a rail; a kicker at either end of
// it, aimed along it; and the five stools in front of it, low enough to clear.
{
  const T = HOUSE.table, N = 14, rim = [];
  PROPS.push(F.box({ ...at(T.x, T.z), facing: 0, length: T.long, width: T.deep, height: T.high }));
  for (let i = 0; i <= N; i++) { const a = (i / N) * Math.PI; rim.push([T.x + Math.cos(a) * (T.rim - 0.5), T.z - T.deep / 2 + T.back + Math.sin(a) * (T.rim - 0.5), T.high + 0.22]); }
  line(rim);
  for (const side of [-1, 1]) PROPS.push(F.kicker({ ...at(T.x + side * (T.long / 2 + 9), T.z), facing: side > 0 ? 180 : 0, width: 6, radius: 8, angle: 30 }));
  for (const deg of [-64, -32, 0, 32, 64]) { const a = (deg * Math.PI) / 180; PROPS.push(F.box({ ...at(T.x + Math.sin(a) * 12.4, T.z - T.deep / 2 + T.back + Math.cos(a) * 12.4), facing: 0, length: 2.2, width: 2.2, height: 0.9 })); }
}
// The roulette table: its wheel is the bowl (a brass rail round it, and a kicker aimed over it from either side); the
// rest of it, where the bets go, a long slab beside that with a rail down each edge.
{
  const P = HOUSE.pit, N = 40, ring = [];
  for (let i = 0; i <= N; i++) { const a = (i / N) * Math.PI * 2; ring.push([P.x + Math.cos(a) * (P.r + 1.2), P.z + Math.sin(a) * (P.r + 1.2), 0.5]); }
  line(ring, true);
  PROPS.push(F.kicker({ ...at(P.x, P.z - P.r - 8), facing: 90, width: 6, radius: 8, angle: 34 }), F.kicker({ ...at(P.x - P.r - 8, P.z), facing: 0, width: 6, radius: 8, angle: 34 }));
  PROPS.push(F.box({ ...at(P.x + P.r + 8.5, P.z), facing: 0, length: 11, width: 6.4, height: 1.0 }));
  for (const side of [-1, 1]) line([[P.x + P.r + 3.2, P.z + side * 3.0, 1.15], [P.x + P.r + 8.5, P.z + side * 3.0, 1.15], [P.x + P.r + 13.8, P.z + side * 3.0, 1.15]]);
}
// The bar, down the right-hand wall: a long counter you can get up on, with a brass rail along its edge.
{
  const B = HOUSE.bar, mid = B.x + 2 * B.out, edge = B.x + 4.25 * B.out, half = B.long / 2;
  PROPS.push(F.box({ ...at(mid, B.z), facing: 0, length: 4, width: B.long, height: 1.3 }));
  line([-1, -0.5, 0, 0.5, 1].map((k) => [edge, B.z + k * (half - 1), 1.45]));
}
// The velvet ropes that lead in from the doors.
for (const x of [-2.3 * K, 2.3 * K]) line([[x, 12.4 * K, 0.55], [x, 9.6 * K, 0.55], [x, 6.8 * K, 0.55]]);
// The columns down both sides, and the blocks his statues stand on: nothing to ride, and nothing to ride through.
for (const [x, z] of HOUSE.columns) PROPS.push(F.pillar({ ...at(x, z), width: 3.4 }));
for (const [x, z] of HOUSE.statues) PROPS.push(F.pillar({ ...at(x, z), width: 3.9 }));

// Hand a chunk the props and rails that fall inside it (worldgen.js calls this for level 4).
export function fillHouse(c) {
  const x1 = c.x0 + CHUNK, z1 = c.z0 + CHUNK;
  for (const p of PROPS) {
    let lowX = Infinity, highX = -Infinity, lowZ = Infinity, highZ = -Infinity;
    for (const u of [p.u0, p.u1]) for (const w of [p.w0, p.w1]) {
      const x = p.x + u * p.cos + w * p.sin, z = p.z - u * p.sin + w * p.cos;
      lowX = Math.min(lowX, x); highX = Math.max(highX, x); lowZ = Math.min(lowZ, z); highZ = Math.max(highZ, z);
    }
    if (highX >= c.x0 && lowX < x1 && highZ >= c.z0 && lowZ < z1) c.props.push(p);
  }
  for (const r of RAILS) {
    const inside = (x, z) => x >= c.x0 && x < x1 && z >= c.z0 && z < z1;
    if (inside(r.ax, r.az) || inside(r.bx, r.bz)) c.rails.push(r);
  }
}
