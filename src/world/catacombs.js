// Level 2: the Catacombs. One long tunnel running along +z (downhill: "deeper"),
// winding from side to side and opening into a round chamber every so often.
//
// In cross-section the tunnel is a full pipe: a flat floor, a wall each side that
// curves up through vertical and on over your head, and a flat roof joining them.
// Like the cemetery, the ground is a pure height function, which can't describe a
// wall that leans over you. So the height function covers the pipe up to where it
// is nearly upright (the "lip"), with solid rock outside it; from the lip on round
// to the roof and down the far side, the skater rides the same curve by its own
// rules (see stepPipe in player/skater.js). The roof you see is drawn by arena.js.
//
// The whole tunnel stays inside the middle column of chunks (x from 0 to 96), so
// nothing in it ever straddles a chunk border sideways.
import * as F from './features.js';

export const CATA = {
  centre: 48,        // x the tunnel wanders about (the middle of chunk column 0)
  tunnel: 5,         // half-width of the tunnel floor
  vert: 35,          // how steep (degrees) the wall is where the height function hands over to the pipe (the "lip")
  rock: 40,          // how far the solid rock stands above the floor
  ceiling: 23,       // how far above the floor the roof is. The walls are half-circles of half this radius.
  slope: 0.035,      // the floor drops this much per metre of +z
  spacing: 260,      // metres between chambers
  chamber: [24, 32], // a chamber's radius, smallest to largest
};
const Q = (CATA.quarter = CATA.ceiling / 2);   // the radius of the walls' curve
export const PIPE_R = Q, PIPE_FROM = (CATA.vert * Math.PI) / 180;   // ...and the angle round it (0 = floor, PI = roof) where the pipe takes over
export const EDGE = Q * Math.sin((CATA.vert * Math.PI) / 180);        // how far out from the floor's edge the lip is...
export const LIP = Q * (1 - Math.cos((CATA.vert * Math.PI) / 180));   // ...and how high (the wall goes vertical here)

function hash(i, seed) {
  let h = (seed ^ Math.imul(i, 374761393)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
// Smooth 1D noise, -1..1, with features about `size` metres long.
function wave(z, size, seed) {
  const f = z / size, i = Math.floor(f), t = f - i, s = t * t * (3 - 2 * t), a = hash(i, seed), b = hash(i + 1, seed);
  return (a + (b - a) * s) * 2 - 1;
}
const smooth = (k) => { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); };

// The tunnel at a given z: where its middle is (x), the half-width of its floor (w), and how high the floor is.
// (Returns the same object every time: read it before calling again.)
const R = { x: 0, w: 0, floor: 0, chamber: 0 };
export function route(z, seed) {
  const k = Math.round((z - CATA.centre) / CATA.spacing), d = Math.abs(z - (k * CATA.spacing + CATA.centre));
  const radius = CATA.chamber[0] + hash(k, seed + 7) * (CATA.chamber[1] - CATA.chamber[0]);
  R.chamber = d < radius ? Math.sqrt(1 - (d / radius) ** 2) : 0;                 // 1 in the middle of a chamber, 0 outside it
  R.w = CATA.tunnel + (radius - CATA.tunnel) * R.chamber;
  const straight = 1 - smooth((d - radius) / 45);                                // the tunnel runs straight into and out of a chamber
  R.x = CATA.centre + (wave(z, 190, seed) * 19 + wave(z, 70, seed + 3) * 6) * (1 - straight);
  R.floor = -CATA.slope * (z - CATA.centre);
  return R;
}
export const floorAt = (z) => -CATA.slope * (z - CATA.centre);

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
const STEP = 16;   // metres between one thing and the next along the tunnel

// Fill a chunk (see worldgen.js for what a chunk holds). Every 16 m along the tunnel there is a
// brazier or some candles against a wall, and usually something to skate: a rail, a stone coffin,
// a kicker, a heap of bones. Chambers get monuments and tombs, and a bowl in the middle.
export function fillCatacombs(c, rand) {
  if (c.cx !== 0) return;   // solid rock
  const seed = c.seed;
  for (let z = c.z0 + STEP / 2; z < c.z0 + 96; z += STEP) {
    const { x: mid, w, chamber } = route(z, seed);
    const n = Math.round(z / STEP), side = n % 2 ? 1 : -1;

    // Light: a brazier on one side, a few candles on the other.
    if (n % 2 === 0 || chamber > 0) {
      const bx = mid + side * (w + 1.1);
      c.props.push(F.brazier({ x: bx, z }));
      c.lamps.push({ x: bx, z, y: cataHeight(bx, z, seed), h: 2.3, dx: 0, power: 420 });
      c.flames.push(bx, 1.5, z);
    }
    for (let k = 0; k < 3; k++) if (rand() < 0.6) c.flames.push(mid - side * (w + 0.6 + rand() * 0.8), 0.2, z + range(rand, -5, 5));

    const start = Math.hypot(mid - CATA.centre, z - CATA.centre) < 16;   // clear floor where you arrive
    const middle = chamber > 0.97;
    if (start) continue;
    if (middle) {   // the middle of a chamber: a bowl
      c.bowls.push(F.bowl({ x: mid, z, flat: range(rand, 5.5, 7) }));
      continue;
    }
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
}
