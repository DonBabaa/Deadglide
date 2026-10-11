// The House: level 4, where the game ends. The casino, blown up to the size of
// an arena you can skate: a marble floor under chandeliers, the roulette wheel
// sunk into the middle of it as a bowl, card tables to ride over, the bar down
// one side, and the walls curving up as a quarter pipe all the way round.
// Babitus Goyitus is waiting at the far end.
//
// Like the Moon it is one fixed shape, the same every time. houseHeight(x, z)
// is the floor; PROPS and RAILS are what stands on it (see features.js).
// Everything is laid out from the middle of the room, in metres: +x is to the
// right as you come in, -z is ahead of you (toward Babitus).
import * as F from './features.js';

const CHUNK = 96;
export const HOUSE = {
  x: 48, z: 6,         // the middle of the room, in world coordinates (you arrive 42 m south of it, facing in)
  half: 64,            // from the middle to each wall
  wall: 8,             // the walls curve up this far before they go sheer
  pit: { r: 18, depth: 3.4 },   // the roulette wheel: a bowl in the middle of the floor
  boss: { x: 0, z: -40 },       // where Babitus stands when you arrive
  doors: { x: 0, z: 58 },       // the way out (behind you as you come in): the portal opens here
  bar: { x: -52, z: -4 },       // where the barman slides a drink out for you
  slots: [[-54, -54], [54, -54], [-54, 54], [54, 54]],   // the banks of slot machines in the corners: monsters come out of them
};
const LIP_OUT = HOUSE.wall * 0.95, LIP_UP = HOUSE.wall - Math.sqrt(HOUSE.wall * HOUSE.wall - LIP_OUT * LIP_OUT);   // where the wall goes sheer
export const WALL_TOP = LIP_UP;

// World coordinates of a spot given from the middle of the room.
export const houseSpot = ([x, z]) => ({ x: HOUSE.x + x, z: HOUSE.z + z });

// `drawn`: the height to draw the floor at: the same, but without the sheer wall (arena.js stands a proper one there).
export function houseHeight(x, z, drawn = false) {
  const dx = x - HOUSE.x, dz = z - HOUSE.z, P = HOUSE.pit;
  let h = 0;
  const d = Math.hypot(dx, dz);
  if (d < P.r) h -= P.depth * (0.5 + 0.5 * Math.cos((d / P.r) * Math.PI));   // the wheel: flat-bottomed, steepest half-way up
  const t = Math.max(Math.abs(dx), Math.abs(dz)) - (HOUSE.half - HOUSE.wall);
  if (t > 0) h += t < LIP_OUT ? HOUSE.wall - Math.sqrt(HOUSE.wall * HOUSE.wall - t * t) : drawn ? LIP_UP : 60;
  return h;
}

// Which pocket of the wheel a spot in the pit is over: 'green', 'red' or 'black' (null outside it).
export function pocketAt(x, z) {
  const dx = x - HOUSE.x, dz = z - HOUSE.z;
  if (Math.hypot(dx, dz) >= HOUSE.pit.r) return null;
  const n = Math.floor(((Math.atan2(dz, dx) + Math.PI) / (Math.PI * 2)) * 37) % 37;
  return n === 0 ? 'green' : n % 2 ? 'red' : 'black';
}

// Keep a point (the camera) inside the walls.
export function houseConfine(pos) {
  const max = HOUSE.half - 2;
  pos.x = Math.max(HOUSE.x - max, Math.min(HOUSE.x + max, pos.x));
  pos.z = Math.max(HOUSE.z - max, Math.min(HOUSE.z + max, pos.z));
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

// The card tables: four funboxes round the wheel, and a kicker aimed over it from each side.
for (const [x, z, facing] of [[-33, -22, 40], [33, -22, -40], [-33, 24, 140], [33, 24, -140]]) PROPS.push(F.funbox({ ...at(x, z), facing, length: 15, width: 9, radius: 7, angle: 32 }));
for (const [x, z, facing] of [[0, 30, 270], [0, -30, 90], [30, 0, 180], [-30, 0, 0]]) PROPS.push(F.kicker({ ...at(x, z), facing, width: 6, radius: 8, angle: 34 }));
// The bar, down the left-hand wall: a long counter you can get up on, with a brass rail along its edge.
PROPS.push(F.box({ ...at(-50, -4), facing: 0, length: 4, width: 44, height: 1.3 }));
line([[-47.7, -26, 1.45], [-47.7, -15, 1.45], [-47.7, -4, 1.45], [-47.7, 7, 1.45], [-47.7, 18, 1.45]]);
// The brass rail round the wheel, and the velvet ropes that lead in from the doors.
{
  const N = 40, ring = [];
  for (let i = 0; i <= N; i++) { const a = (i / N) * Math.PI * 2; ring.push([Math.cos(a) * (HOUSE.pit.r + 1.2), Math.sin(a) * (HOUSE.pit.r + 1.2), 0.5]); }
  line(ring, true);
}
for (const x of [-7, 7]) line([[x, 54, 0.55], [x, 44, 0.55], [x, 34, 0.55]]);
// Two long tables on the right, end to end with a gap to clear.
PROPS.push(F.box({ ...at(50, -14), facing: 0, length: 4, width: 16, height: 1.1 }), F.box({ ...at(50, 12), facing: 0, length: 4, width: 16, height: 1.1 }));
line([[52.2, -22, 1.25], [52.2, -14, 1.25], [52.2, -6, 1.25]]);
line([[52.2, 4, 1.25], [52.2, 12, 1.25], [52.2, 20, 1.25]]);

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
