// Level 2: the Catacombs. A sewer that runs in a loop: skate far enough along it
// and you are back where you started. On the loop there is one huge cavern (the
// hub, where you arrive: full of things to skate) and three smaller chambers.
//
// The loop is made by repetition: the tunnel runs along z, and everything about
// it repeats every LOOP metres. Whatever is lying on the floor is moved round to
// the copy of its spot nearest you (see loopNear), so going on and going back
// both bring you to the things you left behind.
//
// In cross-section the tunnel is a full pipe: a flat floor, a wall each side that
// curves up through vertical and on over your head, and a flat roof joining them.
// Like the cemetery, the ground is a pure height function, which can't describe a
// wall that leans over you. So the height function covers the pipe up to its
// "lip" (where the wall reaches CATA.vert degrees), with solid rock outside it;
// from the lip on round to the roof and down the far side, the skater rides the
// same curve by its own rules (see stepPipe in player/skater.js), and so do the
// monsters that climb (pipePoint, below). The roof you see is drawn by arena.js.
//
// The whole tunnel stays inside the middle column of chunks (x from 0 to 96), so
// nothing in it ever straddles a chunk border sideways.
import * as F from './features.js';

const CHUNK = 96;
export const CATA = {
  centre: 48,        // x the tunnel wanders about (the middle of chunk column 0); the hub's middle is at z = this, too
  tunnel: 5,         // half-width of the tunnel floor
  vert: 35,          // how steep (degrees) the wall is where the height function hands over to the pipe (the "lip")
  rock: 40,          // how far the solid rock stands above the floor
  ceiling: 23,       // how far above the floor the roof is. The walls are half-circles of half this radius.
  slope: 0,          // (the floor is level: a loop can't go downhill all the way round)
  loop: 12,          // chunks in one lap (12 x 96 m = 1152 m)
  stops: 4,          // wide places on the lap, evenly spaced: the hub, then chambers
  chamber: [24, 32], // a chamber's half-width, smallest to largest (it is 1.7 times as long as it is wide)
  hub: { halfWidth: 40, halfLength: 118, flat: 42 },   // the hub: half its width, half its length, and how far from its middle it stays at full width
};
export const LOOP = CATA.loop * CHUNK;
const SPACING = LOOP / CATA.stops;
const Q = (CATA.quarter = CATA.ceiling / 2);   // the radius of the walls' curve
export const PIPE_R = Q, PIPE_FROM = (CATA.vert * Math.PI) / 180;   // ...and the angle round it (0 = floor, PI = roof) where the pipe takes over
export const EDGE = Q * Math.sin(PIPE_FROM);        // how far out from the floor's edge the lip is...
export const LIP = Q * (1 - Math.cos(PIPE_FROM));   // ...and how high

const mod = (a, n) => ((a % n) + n) % n;
// The copy of z (they repeat every LOOP metres) that is nearest to `near`.
export const loopNear = (z, near) => z + LOOP * Math.round((near - z) / LOOP);
// Which chunk of the lap a chunk row is (so that every lap is built the same).
export const lapChunk = (cz) => mod(cz, CATA.loop);

function hash(i, seed) {
  let h = (seed ^ Math.imul(i, 374761393)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
// Smooth 1D noise, -1..1, with features `size` metres long (size must divide LOOP, so it joins up).
function wave(z, size, seed) {
  const f = z / size, i = Math.floor(f), t = f - i, s = t * t * (3 - 2 * t), n = LOOP / size;
  const a = hash(mod(i, n), seed), b = hash(mod(i + 1, n), seed);
  return (a + (b - a) * s) * 2 - 1;
}
const smooth = (k) => { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); };

// The tunnel at a given z: where its middle is (x), the half-width of its floor (w), how high the floor is,
// how far into a wide place we are (chamber: 0 = plain tunnel, 1 = its middle) and whether that place is the hub.
// (Returns the same object every time: read it before calling again.)
const R = { x: 0, w: 0, floor: 0, chamber: 0, hub: false };
export function route(z, seed) {
  const k = Math.round((z - CATA.centre) / SPACING), d = Math.abs(z - (k * SPACING + CATA.centre)), stop = mod(k, CATA.stops);
  const radius = CATA.chamber[0] + hash(stop, seed + 7) * (CATA.chamber[1] - CATA.chamber[0]);
  const wide = stop === 0 ? CATA.hub.halfWidth : radius, long = stop === 0 ? CATA.hub.halfLength : radius * 1.7, flat = stop === 0 ? CATA.hub.flat : 0;
  // The walls swing out and back in on a smooth curve, never end-on to the tunnel: wherever you meet one,
  // it is a wall you can ride up, not a corner to run into.
  R.chamber = d >= long ? 0 : d <= flat ? 1 : Math.cos((Math.PI / 2) * (d - flat) / (long - flat)) ** 2;
  R.hub = stop === 0 && d < long;
  R.w = CATA.tunnel + (wide - CATA.tunnel) * R.chamber;
  const straight = 1 - smooth((d - long) / 45);                                  // the tunnel runs straight into and out of a wide place
  R.x = CATA.centre + (wave(z, 192, seed) * 19 + wave(z, 72, seed + 3) * 6) * (1 - straight);
  R.floor = 0;
  return R;
}
export const floorAt = () => 0;

export function cataHeight(x, z, seed) {
  route(z, seed);
  const d = Math.abs(x - R.x) - R.w;
  if (d <= 0) return R.floor;
  if (d < EDGE) return R.floor + Q - Math.sqrt(Q * Q - d * d);
  return R.floor + CATA.rock;
}
// For something in the air: the height of the pipe's wall under it, all the way out to where the wall is
// upright (cataHeight stops at the lip and calls the rest rock, which is right for anything on foot).
export function cataAirFloor(x, z, seed) {
  route(z, seed);
  const d = Math.abs(x - R.x) - R.w;
  return d <= 0 ? R.floor : d < Q ? R.floor + Q - Math.sqrt(Q * Q - d * d) : R.floor + CATA.rock;
}
// On the tunnel floor (true) or up a wall (false)?
export const cataFloor = (x, z, seed) => Math.abs(x - route(z, seed).x) <= R.w;

// A spot in the tunnel `dist` metres along it from (px, pz): ahead if `angle` points down +z, behind if not.
export function cataPlace(px, pz, angle, dist, seed) {
  const z = pz + (Math.cos(angle) >= 0 ? dist : -dist);
  route(z, seed);
  return [R.x + (Math.random() * 2 - 1) * Math.max(1, R.w - 1.5), z];
}
// The nearest x that is inside the tunnel at this z (`pad` metres up the walls' curve allowed).
export function cataConfine(x, z, seed, pad = 0) {
  route(z, seed);
  return Math.max(R.x - R.w - pad, Math.min(R.x + R.w + pad, x));
}

// ---- Round the pipe (for the monsters that climb) ------------------------------------
// A place on the pipe's inside surface is (s, z): s is how far round you are from the middle of the
// floor, in metres along the surface: across the floor, up a wall (+ is the +x side), and along the roof
// to its middle, where +s and -s meet.

export const pipeAround = (z, seed) => 4 * route(z, seed).w + 2 * Math.PI * Q;   // all the way round
// Fills out = { x, y, nx, ny } (the point, and the direction straight off the surface there) and returns it.
export function pipePoint(s, z, seed, out) {
  route(z, seed);
  const w = R.w, side = s < 0 ? -1 : 1, a = Math.min(Math.abs(s), 2 * w + Math.PI * Q);
  if (a <= w) { out.x = R.x + s; out.y = R.floor; out.nx = 0; out.ny = 1; }
  else if (a <= w + Math.PI * Q) {
    const phi = (a - w) / Q;
    out.x = R.x + side * (w + Q * Math.sin(phi)); out.y = R.floor + Q * (1 - Math.cos(phi));
    out.nx = -side * Math.sin(phi); out.ny = Math.cos(phi);
  } else { out.x = R.x + side * (2 * w + Math.PI * Q - a); out.y = R.floor + 2 * Q; out.nx = 0; out.ny = -1; }
  return out;
}
// The s of the place on the pipe nearest a point in the world.
export function pipeCoord(x, y, z, seed) {
  route(z, seed);
  const off = x - R.x, side = off < 0 ? -1 : 1, d = Math.abs(off) - R.w, h = y - R.floor;
  if (d <= 0) return h > Q ? side * (2 * R.w + Math.PI * Q - Math.abs(off)) : off;
  return side * (R.w + Q * Math.max(0, Math.atan2(d, Q - h)));
}

// ---- What's in it ------------------------------------------------------------------

const pick = (rand, list) => list[Math.floor(rand() * list.length)];
const range = (rand, a, b) => a + rand() * (b - a);
function weighted(rand, weights) {
  let total = 0;
  for (const k in weights) total += weights[k];
  let r = rand() * total;
  for (const k in weights) if ((r -= weights[k]) < 0) return k;
  return 'empty';
}
const IN_TUNNEL = { rail: 3, coffin: 3, kicker: 2, bones: 2, empty: 3 };
const IN_CHAMBER = { monument: 2, tombs: 3, kicker: 1, rail: 2, bones: 1, empty: 2 };
const IN_HUB = { funbox: 3, kicker: 3, quarter: 2, halfpipe: 2, bowl: 4, mound: 1, rail: 2, tombs: 1, monument: 1, spine: 2, gap: 1 };   // (worldgen.js's skatepark features)
const STEP = 16;                       // metres between one thing and the next along the tunnel
const ROWS = [14, 36.7, 59.3, 82], COLUMNS = [18, 38, 58, 78];   // the hub is laid out on a grid: where its cells' middles are in a chunk, along it and across

function brazier(c, x, z, seed) {
  c.props.push(F.brazier({ x, z }));
  c.lamps.push({ x, z, y: cataHeight(x, z, seed), h: 2.3, dx: 0, power: 420 });
  c.flames.push(x, 1.5, z);
}

// Fill a chunk (see worldgen.js for what a chunk holds). `features` is worldgen's skatepark kit, for the hub.
// Along the tunnel, every 16 m there is a brazier or some candles against a wall, and usually something to
// skate: a rail, a stone coffin, a kicker, a heap of bones. Chambers get monuments and tombs, and a bowl in
// the middle. The hub is a skatepark: a grid of funboxes, kickers, quarter pipes, half-pipes and bowls,
// with a clear patch in the middle where you arrive.
export function fillCatacombs(c, rand, features) {
  if (c.cx !== 0) return;   // solid rock
  const seed = c.seed, fromSpawn = (x, z) => Math.hypot(x - CATA.centre, loopNear(z, CATA.centre) - CATA.centre);

  for (let z = c.z0 + STEP / 2; z < c.z0 + CHUNK; z += STEP) {
    const { x: mid, w, chamber, hub } = route(z, seed);
    const n = Math.round(z / STEP), side = n % 2 ? 1 : -1;

    // Light: a brazier on one side, a few candles on the other.
    if (n % 2 === 0 || chamber > 0) brazier(c, mid + side * (w + 1.1), z, seed);
    for (let k = 0; k < 3; k++) if (rand() < 0.6) c.flames.push(mid - side * (w + 0.6 + rand() * 0.8), 0.2, z + range(rand, -5, 5));
    if (hub) continue;   // (the hub's floor is laid out below)

    // The middle of a chamber is a big bowl (put in below): leave it room.
    const stop = Math.round((z - CATA.centre) / SPACING);
    if (chamber > 0 && Math.abs(z - (stop * SPACING + CATA.centre)) < 17) continue;
    const x = mid + range(rand, -1, 1) * Math.max(0, w - (chamber ? 9 : 4.5));
    const feature = weighted(rand, chamber > 0.3 ? IN_CHAMBER : IN_TUNNEL);
    if (feature === 'rail') {
      const half = range(rand, 5, 7), dx = route(z + half, seed).x - route(z - half, seed).x;   // (it follows the tunnel round)
      c.railSpecs.push([x - dx / 2, z - half, x + dx / 2, z + half, 0.5, 0.5]);
    } else if (feature === 'coffin') {
      c.props.push(F.box({ x, z, facing: 90 + range(rand, -12, 12), length: range(rand, 5, 8), width: range(rand, 1.4, 2.2), height: range(rand, 0.5, 1) }));
    } else if (feature === 'kicker') {
      const facing = pick(rand, [90, 270]);
      c.props.push(F.kicker({ x, z: z - Math.sin(F.rad(facing)) * 4, facing, width: 5, radius: range(rand, 7, 9), angle: range(rand, 26, 34) }));
    } else if (feature === 'bones') {
      c.mounds.push({ x, z, r: range(rand, 4, 6), h: range(rand, 0.7, 1.5) });
    } else if (feature === 'monument') {
      c.props.push(F.monument({ x, z, facing: pick(rand, [0, 90, 180, 270]), statue: Math.floor(rand() * 3) }));
      c.flames.push(x + 1.1, 0.2, z, x - 1.1, 0.2, z);
    } else if (feature === 'tombs') {
      for (const s of [-1, 1]) {
        c.props.push(F.box({ x: x + s * range(rand, 2.5, 4), z: z + range(rand, -3, 3), facing: 90 + range(rand, -20, 20), length: range(rand, 4, 6), width: range(rand, 1.2, 2), height: range(rand, 0.5, 1.1) }));
      }
    }
  }

  // A big bowl in the middle of every chamber.
  for (let k = Math.ceil((c.z0 - CATA.centre) / SPACING); k * SPACING + CATA.centre < c.z0 + CHUNK; k++) {
    const z = k * SPACING + CATA.centre;
    if (mod(k, CATA.stops) !== 0) c.bowls.push(F.bowl({ x: route(z, seed).x, z, flat: range(rand, 6, 7.5) }));
  }

  // The hub.
  for (const dz of ROWS) for (const dx of COLUMNS) {
    const x = c.x0 + dx, z = c.z0 + dz, HALF = 10;
    if (!route(z, seed).hub || fromSpawn(x, z) < 16) continue;
    const fits = (zz) => { const r = route(zz, seed); return r.hub && Math.abs(x - r.x) + HALF <= r.w; };   // (the hub is an oval: is this cell all on its floor?)
    if (!fits(z - HALF) || !fits(z + HALF)) continue;
    // (The four cells out at the corners of the hub's wide part are always bowls.)
    const corner = (dx === COLUMNS[0] || dx === COLUMNS[3]) && lapChunk(c.cz) === 0 && (dz === ROWS[0] || dz === ROWS[3]);
    const feature = corner ? 'bowl' : weighted(rand, IN_HUB);
    if (feature === 'bowl') c.bowls.push(F.bowl({ x, z, flat: 4.4 }));   // (a small one: the cells are close together)
    else features[feature](c, x, z, rand);
  }
  // ...lit by braziers standing out on the floor between them.
  for (const dz of [25.3, 70.7]) for (const dx of [25.3, 48, 70.7]) {
    const x = c.x0 + dx, z = c.z0 + dz, r = route(z, seed);
    if (r.hub && Math.abs(x - r.x) < r.w - 6 && fromSpawn(x, z) > 8) brazier(c, x, z, seed);
  }
}
