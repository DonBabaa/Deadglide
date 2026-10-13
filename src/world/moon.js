// Free Ride: the Moon. One fixed arena, the same for everybody who ever plays it
// (it has its own dice, not the world seed), about 500 m across, built for lines.
//
// The land (moonHeight): highlands climbing to a peak (Mons) in the north-west, a
// low basin in the south holding one enormous crater (the Big Bowl), a ridge
// across the middle, small craters everywhere, and two channels cut into it:
// the Snake Run, winding down from Mons to the Big Bowl, and the Rille, a long
// half-pipe round the north and east. A crater wall rings the lot. It is a
// quarter pipe, so the edge of the map throws you back in, and there is a rail
// to grind all the way round its lip.
//
// All of it is under glass: a dome over the whole crater (DOME), a moon base big enough to ride in. Things hang
// from it: rails over the lip of the wall, a ring round the top of Mons, and, from right under the top of it, the
// Helter: a rail that winds three times round the Base on its way down, through hoops, which only the Geyser in the
// middle of the Base gets you up to.
//
// What stands on it (fillMoon): the Base in the middle (a lander, habitat
// modules to ride as ledges, solar banks as kickers, pipes and cables as rails),
// the Launch Pad (one huge kicker aimed over the ridge), a comms tower with a
// deck you can only reach by a hard jump, the Monorail (a rail from Mons all the
// way down to the Base), slabs of rock to pop off, gas vents that blow you into
// the air, and the Lava Pit: a rift full of lava with a kicker either side of it.
//
// North is -z, east is +x. Everything below is measured from the middle of the
// arena, which is where you arrive. The north-west is the night side.
import * as F from './features.js';

export const MOON = {
  x: 48, z: 48,        // the middle of the arena (the spawn point), in world coordinates
  radius: 250,         // out to the foot of the rim wall...
  wall: 18,            // ...which curves up this far before it goes sheer
  ledge: 6,            // level ground beyond the lip before the wall you cannot see (room to come off the rim rail, or miss it)
  mons: { x: -150, z: -150, height: 46, spread: 95 },
  basin: { x: 10, z: 140, depth: 9, spread: 110 },
  ridge: { z: -58, height: 8, width: 20 },
  plaza: 34,           // the ground is level within this far of the middle (the Base stands here)
  ventKick: 15,        // how fast a gas vent throws you upward (m/s)
  ventRadius: 2.4,
  apron: 34,           // this far in from the foot of the wall, the ground has smoothed out: nothing but the big swells of it, so that the wall is one clean bowl all the way round
};
// The glass over it all: half an egg, `radius` across at the ground and `height` at its top (high enough to clear
// Mons and the wall behind it, which stand far above the rest). domeAt: how high the glass is over a place.
export const DOME = { radius: 286, height: 142 };
export const domeAt = (x, z) => DOME.height * Math.sqrt(Math.max(0, 1 - ((x - MOON.x) ** 2 + (z - MOON.z) ** 2) / (DOME.radius * DOME.radius)));
const SEED = 1969, CHUNK = 96;
const LIP_OUT = MOON.wall * 0.95, LIP_UP = MOON.wall - Math.sqrt(MOON.wall * MOON.wall - LIP_OUT * LIP_OUT);   // where the wall goes sheer: how far out, how far up
export const WALL_AT = MOON.radius - MOON.wall + LIP_OUT;   // ...measured from the middle

function lattice(ix, iz, seed) {
  let h = (seed ^ Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
// Smooth noise, -1..1, with features about `size` metres across.
function layer(x, z, size, seed) {
  const fx = x / size, fz = z / size, ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
  const sx = tx * tx * tx * (tx * (tx * 6 - 15) + 10), sz = tz * tz * tz * (tz * (tz * 6 - 15) + 10);
  const a = lattice(ix, iz, seed), b = lattice(ix + 1, iz, seed), c = lattice(ix, iz + 1, seed), d = lattice(ix + 1, iz + 1, seed);
  return (a + (b - a) * sx + (c - a + (a - b + d - c) * sx) * sz) * 2 - 1;
}
const smooth = (k) => { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); };
let rolls = 0;
const dice = () => lattice(rolls++, 7, SEED);   // the Moon's own dice: the same rolls every time

// How much daylight a place gets: 1 on the sunlit side (south and east), 0 on the night side (north-west).
export const daylight = (x, z) => smooth((x - MOON.x + (z - MOON.z) + 150) / 170);

// ---- Channels: half-pipes cut into the land along a winding line ----------------------
//   pts: the line; floor: half the width of its flat bottom; R: the radius of its walls; depth: how deep.
const channel = (pts, floor, R, depth) => {
  const reach = floor + Math.sqrt(R * R - (R - depth) ** 2), xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
  return { pts, floor, R, depth, reach, x0: Math.min(...xs) - reach, x1: Math.max(...xs) + reach, z0: Math.min(...zs) - reach, z1: Math.max(...zs) + reach };
};
export const SNAKE = channel([[-128, -118], [-150, -75], [-105, -45], [-140, -5], [-95, 25], [-120, 65], [-70, 90], [-45, 120]], 4.5, 7, 5);
export const RILLE = channel([[-75, -200], [-20, -208], [40, -198], [95, -198], [150, -162], [182, -118], [170, -80], [205, -35], [185, 15], [205, 60]], 6, 9, 6.5);
// The Lava Pit, south-east of the Base: a short, wide, deep one, with lava in the bottom of it.
export const LAVA = channel([[80, 85], [118, 55]], 8, 5, 5.5);
const CHANNELS = [SNAKE, RILLE, LAVA];
// How much a channel cuts out of the ground at a point.
function cut(ch, x, z) {
  if (x < ch.x0 || x > ch.x1 || z < ch.z0 || z > ch.z1) return 0;
  let best = Infinity;
  for (let i = 0; i < ch.pts.length - 1; i++) {
    const [ax, az] = ch.pts[i], [bx, bz] = ch.pts[i + 1], ex = bx - ax, ez = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez)));
    const d2 = (x - ax - ex * t) ** 2 + (z - az - ez * t) ** 2;
    if (d2 < best) best = d2;
  }
  const d = Math.sqrt(best) - ch.floor;
  if (d <= 0) return ch.depth;
  if (d >= ch.reach - ch.floor) return 0;
  return Math.max(0, ch.depth - (ch.R - Math.sqrt(ch.R * ch.R - d * d)));
}

// ---- Craters: { x, z, r, depth, rim }. The Big Bowl first, then a scatter of small ones. ----
export const CRATERS = [{ x: 10, z: 140, r: 62, depth: 20, rim: 3.2 }];
for (let tries = 0; tries < 400 && CRATERS.length < 38; tries++) {
  const a = dice() * Math.PI * 2, d = 50 + dice() * (MOON.radius - 80), r = 7 + dice() * dice() * 22;
  const x = Math.cos(a) * d, z = Math.sin(a) * d;
  if (CRATERS.some((c) => Math.hypot(c.x - x, c.z - z) < (c.r + r) * 1.15)) continue;   // (they don't overlap)
  CRATERS.push({ x, z, r, depth: r * (0.24 + dice() * 0.1), rim: r * 0.07 });
}

// `drawn`: the height to draw the ground at. The same as the real thing, except that the sheer rock above the
// wall's lip is left out (arena.js stands a proper wall there instead of stretching the ground up it).
export function moonHeight(x, z, drawn = false) {
  const dx = x - MOON.x, dz = z - MOON.z, dist = Math.hypot(dx, dz);
  // (near the wall the small things die away: 1 out on the plain, 0 from a little before the wall's foot)
  const rough = 1 - smooth((dist - (MOON.radius - MOON.wall - MOON.apron)) / (MOON.apron - 8));
  // Rolling ground: broad swells, hills, and small lumps on top.
  let h = layer(x, z, 170, SEED) * 7 + (layer(x, z, 70, SEED + 1) * 3 + layer(x, z, 26, SEED + 2) * 0.7) * rough;
  // The highlands, climbing to Mons.
  const M = MOON.mons, B = MOON.basin, R = MOON.ridge;
  h += M.height * Math.exp(-(((dx - M.x) ** 2 + (dz - M.z) ** 2) / (M.spread * M.spread)));
  h += 9 * smooth((-dx - dz) / 320);
  // The southern basin, and the ridge across the middle (it dies away toward the walls).
  h -= B.depth * Math.exp(-(((dx - B.x) ** 2 + (dz - B.z) ** 2) / (B.spread * B.spread)));
  h += R.height * Math.exp(-(((dz - R.z) / R.width) ** 2)) * smooth((225 - Math.abs(dx)) / 70);
  // Level ground in the middle.
  h *= 1 - smooth(1 - (dist - MOON.plaza * 0.5) / (MOON.plaza * 0.9));
  // Craters: a bowl, and a raised rim round it.
  for (let i = 0; i < CRATERS.length; i++) {
    const c = CRATERS[i], cx = dx - c.x, cz = dz - c.z, d2 = cx * cx + cz * cz, reach = c.r * 1.9;
    if (d2 > reach * reach) continue;
    const d = Math.sqrt(d2) / c.r;
    if (d < 1) h -= c.depth * (1 - d * d) ** 1.4 * rough;
    h += c.rim * Math.exp(-(((d - 1) / 0.22) ** 2)) * rough;
  }
  // The Snake Run and the Rille.
  for (let i = 0; i < CHANNELS.length; i++) h -= cut(CHANNELS[i], dx, dz) * rough;
  // The wall round the arena: a quarter pipe, then sheer rock.
  const t = dist - (MOON.radius - MOON.wall);
  if (t > 0) h += t < LIP_OUT ? MOON.wall - Math.sqrt(MOON.wall * MOON.wall - t * t) : drawn || t < LIP_OUT + MOON.ledge ? LIP_UP : 90;
  return h;
}

// The lava: a flat lake `LAVA_DEEP` metres above the pit's floor. lavaAt gives its height if (x, z) is over it, or null.
const LAVA_MID = [(LAVA.pts[0][0] + LAVA.pts[1][0]) / 2, (LAVA.pts[0][1] + LAVA.pts[1][1]) / 2], LAVA_DEEP = 1.4;
export const LAVA_Y = moonHeight(MOON.x + LAVA_MID[0], MOON.z + LAVA_MID[1]) + LAVA_DEEP;
export const lavaAt = (x, z) => (cut(LAVA, x - MOON.x, z - MOON.z) > 0 && moonHeight(x, z) < LAVA_Y ? LAVA_Y : null);
// Where to draw it: { x, z, length, width, turn (radians, about y) }.
export const LAVA_LAKE = {
  x: MOON.x + LAVA_MID[0], z: MOON.z + LAVA_MID[1],
  length: Math.hypot(LAVA.pts[1][0] - LAVA.pts[0][0], LAVA.pts[1][1] - LAVA.pts[0][1]) + 2 * LAVA.reach, width: 2 * LAVA.reach,
  turn: -Math.atan2(LAVA.pts[1][1] - LAVA.pts[0][1], LAVA.pts[1][0] - LAVA.pts[0][0]),
};

// Keep a point (a THREE.Vector3: the camera) inside the wall.
export function moonConfine(pos) {
  const dx = pos.x - MOON.x, dz = pos.z - MOON.z, dist = Math.hypot(dx, dz), max = MOON.radius + MOON.ledge - 3;
  if (dist > max) { pos.x = MOON.x + (dx / dist) * max; pos.z = MOON.z + (dz / dist) * max; }
}

// ---- What stands on it ----------------------------------------------------------------------
// Built once, in world coordinates. PROPS are things with a shape you ride or run into (see features.js);
// RAILS are grind rails, chained end to end so a grind carries on from one piece to the next.
const at = (x, z) => ({ x: MOON.x + x, z: MOON.z + z });
const ground = (x, z) => moonHeight(MOON.x + x, MOON.z + z);
export const PROPS = [], RAILS = [];
// A rail through a line of points [x, z, height above the ground there]. loop: its end joins its start.
function line(points, loop = false) {
  const made = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az, ah] = points[i], [bx, bz, bh] = points[i + 1];
    made.push(F.rail(MOON.x + ax, ground(ax, az) + ah, MOON.z + az, MOON.x + bx, ground(bx, bz) + bh, MOON.z + bz));
  }
  made.forEach((r, i) => { r.next = made[i + 1] || (loop ? made[0] : null); r.prev = made[i - 1] || (loop ? made[made.length - 1] : null); });
  RAILS.push(...made);
}
// A rail in one straight line through the air from one point to another (heights above the ground at each end), in pieces.
function span(ax, az, ah, bx, bz, bh, pieces) {
  const y0 = ground(ax, az) + ah, y1 = ground(bx, bz) + bh, made = [];
  for (let i = 0; i < pieces; i++) {
    const a = i / pieces, b = (i + 1) / pieces, mix = (p, q, t) => p + (q - p) * t;
    made.push(F.rail(MOON.x + mix(ax, bx, a), mix(y0, y1, a), MOON.z + mix(az, bz, a), MOON.x + mix(ax, bx, b), mix(y0, y1, b), MOON.z + mix(az, bz, b)));
  }
  made.forEach((r, i) => { r.next = made[i + 1] || null; r.prev = made[i - 1] || null; });
  RAILS.push(...made);
}

// The rim rail: right round the lip of the crater wall. (Its pieces are marked `rim`.)
export const RIM_LENGTH = 2 * Math.PI * (WALL_AT - 0.5);
{
  const N = 280, r = WALL_AT - 0.5, ring = [], first = RAILS.length;
  for (let i = 0; i <= N; i++) { const a = (i / N) * Math.PI * 2; ring.push([Math.cos(a) * r, Math.sin(a) * r, 0.4]); }
  line(ring, true);
  // (`exit`: which way is off it. Straight down from the lip there is only the wall, so getting off pushes you in toward the middle.)
  for (let i = first; i < RAILS.length; i++) {
    const r = RAILS[i], mx = MOON.x - (r.ax + r.bx) / 2, mz = MOON.z - (r.az + r.bz) / 2, far = Math.hypot(mx, mz);
    r.rim = true;
    r.easy = true;   // (it catches you from further off, and whichever way you come at it: see Skater.tryCatchRail)
    r.wide = 7.5;    // (and from this far to either side of it, however high over it you are, you drift onto its line: ride straight up the wall and it is the rail you come down on, not the ledge behind it)
    r.exit = { x: mx / far, z: mz / far };
  }
}
// The Monorail: from high on Mons, straight down over the highlands to the edge of the Base.
span(-138, -138, 3, -30, -30, 1.2, 22);

// ---- What hangs from the glass ----
// Rails in the air, hung from the dome on cables (marked `hung`, and `easy`: they catch you from further off than a
// rail on the ground, because you are coming at them from a long way down). HOOPS: rings to go through,
// { x, y, z, nx, ny, nz (which way through), r, pts (what one is worth), quiet (says nothing: there are a lot of
// them in a row) }: main.js scores them.
export const HOOPS = [];
// A rail through points [x, z, y] (from the middle; y is a height in the world, not above the ground).
function sky(points, loop = false) {
  const made = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az, ay] = points[i], [bx, bz, by] = points[i + 1];
    made.push(Object.assign(F.rail(MOON.x + ax, ay, MOON.z + az, MOON.x + bx, by, MOON.z + bz), { hung: true, easy: true }));
  }
  made.forEach((r, i) => { r.next = made[i + 1] || (loop ? made[0] : null); r.prev = made[i - 1] || (loop ? made[made.length - 1] : null); });
  RAILS.push(...made);
  return made;
}
const arc = (cx, cz, r, y, from, to, n) => Array.from({ length: n + 1 }, (_, i) => { const a = from + ((to - from) * i) / n; return [cx + Math.cos(a) * r, cz + Math.sin(a) * r, typeof y === 'function' ? y(a) : y]; });
const hoop = (x, y, z, nx, ny, nz, r, more) => HOOPS.push({ x: MOON.x + x, y, z: MOON.z + z, nx, ny, nz, r, ...more });
// Over the wall: four long rails a few metres above its lip and just inside it, each a sixth of the way round. Come
// up the wall fast, and they are what you land on.
for (const middle of [0.35, 1.75, 3.3, 5.6]) {
  const r = WALL_AT - 1.6, y = (a) => moonHeight(MOON.x + Math.cos(a) * (WALL_AT - 3), MOON.z + Math.sin(a) * (WALL_AT - 3)) + 5.2;
  sky(arc(0, 0, r, y, middle - 0.5, middle + 0.5, 44));
}
// The Crown: a ring round the top of Mons, an ollie off its slopes, the highest grind there is on the ground.
{
  const M = MOON.mons, top = moonHeight(MOON.x + M.x, MOON.z + M.z);
  sky(arc(M.x, M.z, 11, top + 0.9, 0, Math.PI * 2, 40), true);
}
// The Geyser, in the middle of the Base: ride over it and it throws you to the top of the dome, up through three
// hoops, each wider than the last, and onto the Helter: a rail hung from the glass, which starts as a ring right
// under it and winds outward and down, three times round the Base and through a hoop every so often, to let you off
// a couple of metres over the ground. Whichever way you were going when you crossed the Geyser, it is the Helter's
// top turn you come up to: GEYSER.aim says where that turn is on a bearing, and main.js throws you at it.
//   turns: times round; from, to: how far out it starts and ends; lead: it starts this much of a turn early (so that
//   coming up at its very start is still coming up at rail); power: how late it leaves its height (higher: later);
//   start: the bearing it starts on; piece: how long each straight piece of it is.
const HELTER = { turns: 3, from: 30, to: 72, lead: 0.05, power: 2.8, start: 0.6, piece: 4.5 };
export const GEYSER = { x: MOON.x + 16, z: MOON.z - 20, radius: 3.4, reach: DOME.height - 13 };   // reach: how high it throws you (m above its mouth)
{
  const gx = GEYSER.x - MOON.x, gz = GEYSER.z - MOON.z, ground = moonHeight(GEYSER.x, GEYSER.z), top = ground + GEYSER.reach, H = HELTER;
  const angle = (u) => H.start + Math.PI * 2 * H.turns * u, out = (u) => H.from + (H.to - H.from) * u;   // (u: 0 at its start, 1 at its end)
  const end = moonHeight(GEYSER.x + Math.cos(angle(1)) * H.to, GEYSER.z + Math.sin(angle(1)) * H.to) + 2.4;
  const high = (u) => top - (top - end) * Math.max(0, u) ** H.power;
  GEYSER.aim = (bearing) => { const u = (((((bearing - H.start) / (Math.PI * 2)) % 1) + 1) % 1) / H.turns; return { r: out(u), y: high(u) }; };
  const points = [], marks = [];
  for (let u = -H.lead / H.turns, gone = 0, mark = 70; ; ) {
    const a = angle(u), r = out(u), x = gx + Math.cos(a) * r, z = gz + Math.sin(a) * r, y = Math.max(high(u), moonHeight(MOON.x + x, MOON.z + z) + 2.4);
    points.push([x, z, y]);
    if (u >= 1) break;
    if (u > 0 && (gone += H.piece) >= mark) { mark += 95; marks.push([x, z, y, a]); }
    u = Math.min(1, u + H.piece / (Math.PI * 2 * H.turns * r));
  }
  for (const r of sky(points)) r.flow = 1;   // (come at it square on, as the Geyser brings you, and you go the way it runs: down)
  for (const [x, z, y, a] of marks) hoop(x, y + 1, z, -Math.sin(a), 0, Math.cos(a), 2.7, { pts: 300, quiet: true });   // (stood on the rail: grind it and you thread them)
  for (const [up, r] of [[0.3, 9], [0.55, 17], [0.8, 27]]) hoop(gx, ground + GEYSER.reach * up, gz, 0, 1, 0, r, { pts: 500 });
}
// A hoop over each of three vents, as high as a vent throws you, and one off the end of the Launch Pad.
for (const [x, z] of [[32, 32], [-62, 58], [150, 62]]) hoop(x, moonHeight(MOON.x + x, MOON.z + z) + 3.4, z, 0, 1, 0, 3.2);
hoop(115, moonHeight(MOON.x + 115, MOON.z - 128) + 9.5, -112, 0, 0, 1, 4.6);

// The Base.
PROPS.push(
  Object.assign(F.box({ ...at(-10, -9), facing: 20, length: 5.5, width: 5.5, height: 3.2 }), { kind: 'lander' }),
  Object.assign(F.box({ ...at(14, 6), facing: 20, length: 14, width: 2.6, height: 0.9 }), { kind: 'habitat' }),      // habitat modules: long ledges
  Object.assign(F.box({ ...at(-6, 19), facing: 100, length: 11, width: 2.4, height: 0.6 }), { kind: 'habitat' }),
  F.kicker({ ...at(25, -15), facing: 325, width: 6, radius: 10, angle: 30 }),                                        // solar banks, tipped over: kickers
  F.kicker({ ...at(-26, 10), facing: 160, width: 6, radius: 10, angle: 30 }),
  F.kicker({ ...at(8, 27), facing: 80, width: 6, radius: 10, angle: 30 }),
  F.quarter({ ...at(2, -31), facing: 270, width: 16, radius: 6, angle: 68, deck: 3 }),
);
line([[-23, 4, 0.5], [-13, 13, 0.5], [-3, 23, 0.5]]);            // a pipeline along the ground
line([[-8, -9, 3.2], [3, -13, 1.8], [15, -9, 0.6]]);             // a cable sagging from the lander, away to the east
// The Launch Pad: one huge kicker in the north-east, aimed south over the ridge.
PROPS.push(Object.assign(F.kicker({ ...at(115, -128), facing: 90, width: 12, radius: 26, angle: 40 }), { kind: 'launchpad' }));
// The comms tower on the ridge, and the kicker that might just get you onto it.
PROPS.push(
  Object.assign(F.box({ ...at(60, -58), length: 5.5, width: 5.5, height: 9 }), { kind: 'tower', drape: false }),
  F.kicker({ ...at(60, -98), facing: 90, width: 7, radius: 14, angle: 38 }),
);
// A rock standing out of the lava in the middle of the pit, just big enough to land on.
export const ISLAND = { x: MOON.x + LAVA_MID[0], z: MOON.z + LAVA_MID[1], half: 1.9, top: LAVA_Y + 1.3 };
PROPS.push(Object.assign(F.box({ x: ISLAND.x, z: ISLAND.z, facing: 25, length: ISLAND.half * 2, width: ISLAND.half * 2, height: LAVA_DEEP + 1.3 }), { kind: 'slab', drape: false }));
// (Places other things are measured from.)
export const LANDER = at(-10, -9), TOWER = { ...at(60, -58), half: 2.75, top: moonHeight(MOON.x + 60, MOON.z - 58) + 9 };
// The Lava Pit's two kickers, one on each side, facing each other across it.
{
  const [ax, az] = LAVA.pts[0], [bx, bz] = LAVA.pts[1], len = Math.hypot(bx - ax, bz - az), px = -(bz - az) / len, pz = (bx - ax) / len;   // (px, pz): straight across the pit
  const shape = { width: 9, radius: 9, angle: 32 }, back = LAVA.reach + 0.8 + F.kicker({ x: 0, z: 0, ...shape }).lipU, facing = (Math.atan2(pz, px) * 180) / Math.PI;
  PROPS.push(
    F.kicker({ ...at(LAVA_MID[0] - px * back, LAVA_MID[1] - pz * back), facing, ...shape }),
    F.kicker({ ...at(LAVA_MID[0] + px * back, LAVA_MID[1] + pz * back), facing: facing + 180, ...shape }));
}
// Where the Rille runs out, in the east: a kicker to finish on.
PROPS.push(F.kicker({ ...at(205, 68), facing: 90, width: 9, radius: 12, angle: 34 }));
// Slabs of rock all over, tipped up at one end: something to pop off wherever you are.
for (let n = 0, tries = 0; n < 22 && tries < 300; tries++) {
  const a = dice() * Math.PI * 2, d = 55 + dice() * 150, x = Math.cos(a) * d, z = Math.sin(a) * d, facing = dice() * 360, size = dice();
  if (CRATERS.some((c) => Math.hypot(c.x - x, c.z - z) < c.r * 1.25) || CHANNELS.some((ch) => cut(ch, x, z) > 0)) continue;
  if (d > MOON.radius - MOON.wall - MOON.apron - 6) continue;   // (the run-in to the wall is left clear)
  PROPS.push(Object.assign(F.kicker({ ...at(x, z), facing, width: 3.5 + size * 3, radius: 5 + size * 4, angle: 32 + size * 8 }), { kind: 'slab' }));
  n++;
}

// Gas vents: ride over one and it throws you into the air. [x, z] from the middle.
export const VENTS = [[32, 32], [-62, 58], [10, 140], [150, 62], [-165, 22], [-30, -122], [122, -62], [-105, -165], [88, 150]].map(([x, z]) => at(x, z));
// The vent a point is standing on (-1 if none).
export function ventAt(x, z) {
  for (let i = 0; i < VENTS.length; i++) if ((VENTS[i].x - x) ** 2 + (VENTS[i].z - z) ** 2 < MOON.ventRadius * MOON.ventRadius) return i;
  return -1;
}

// Beacons: a tall coloured light at each place, to steer by. { x, z, color, name }
export const BEACONS = [
  { ...at(-20, -24), color: 0xfff1c8, name: 'Base' }, { ...at(-128, -112), color: 0xb46bff, name: 'Mons' }, { ...at(-45, 112), color: 0x5aff8d, name: 'Snake Run' },
  { ...at(-55, 140), color: 0xffa040, name: 'Big Bowl' }, { ...at(-80, -192), color: 0x4fa8ff, name: 'Rille' }, { ...at(124, -128), color: 0xff4a3a, name: 'Launch Pad' },
];

// Give a chunk (see worldgen.js) the props and rails that reach into it.
export function fillMoon(c) {
  const x1 = c.x0 + CHUNK, z1 = c.z0 + CHUNK;
  for (const p of PROPS) {
    let lowX = Infinity, highX = -Infinity, lowZ = Infinity, highZ = -Infinity;
    for (const u of [p.u0, p.u1]) for (const w of [p.w0, p.w1]) {
      const x = p.x + u * p.cos + w * p.sin, z = p.z - u * p.sin + w * p.cos;
      lowX = Math.min(lowX, x); highX = Math.max(highX, x); lowZ = Math.min(lowZ, z); highZ = Math.max(highZ, z);
    }
    if (highX >= c.x0 && lowX < x1 && highZ >= c.z0 && lowZ < z1) c.props.push(p);
  }
  // (`near`: those, and the rim's pieces just over the chunk's edge: it reaches for you from further than its own width)
  const near = [];
  for (const r of RAILS) {
    const inside = (x, z) => x >= c.x0 && x < x1 && z >= c.z0 && z < z1;
    if (inside(r.ax, r.az) || inside(r.bx, r.bz)) c.rails.push(r);
    else if (r.wide && Math.max(r.ax, r.bx) > c.x0 - 9 && Math.min(r.ax, r.bx) < x1 + 9 && Math.max(r.az, r.bz) > c.z0 - 9 && Math.min(r.az, r.bz) < z1 + 9) near.push(r);
  }
  if (near.length) c.near = c.rails.concat(near);
}
