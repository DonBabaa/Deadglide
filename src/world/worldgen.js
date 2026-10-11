// Procedural world generation. The world is an endless grid of chunks; each
// chunk is a 3x3 grid of slots, and each slot gets one feature (a ramp, a
// grave plot, a bowl...) picked by the chunk's district type. Everything is
// driven by the world seed, so the same seed always builds the same world.
//
// The land itself rolls (see noise.js) and is never flattened. Skate features
// (ramps, pipes, tombs, bowls) are laid over the slope and follow it; rigid
// things (headstones, buildings, trees) stand upright on the ground at their
// centre. Slots on ground too steep to build on are left as open hillside.
//
// To change what the world is made of: edit DISTRICTS (how often each feature
// appears) or add a function to FEATURES.
import { seededRandom } from './random.js';
import * as F from './features.js';
import { hillHeight } from './noise.js';
import { world } from './level.js';
import { moonHeight, fillMoon } from './moon.js';
import { houseHeight, fillHouse } from './house.js';
import { descentHeight, descentPaved, fillDescent } from './descent.js';
import { cataHeight, cataFloor, fillCatacombs, lapChunk } from './catacombs.js';

export const CHUNK = 96;        // metres per chunk
export const SLOT = CHUNK / 3;  // metres per feature slot
const PATH = 2.5;               // half-width of the paved lanes between slots
const TOO_STEEP = 0.28;         // slots sloping more than this (rise / run) are left empty

// Feature weights per district type.
const DISTRICTS = {
  park: { funbox: 2, kicker: 3, rail: 3, quarter: 2, halfpipe: 1, bowl: 2, mound: 1, platform: 2, tombs: 1, graves: 1, gap: 2, spine: 2, ledges: 2, megaramp: 1, empty: 3 },
  graveyard: { graves: 6, mausoleum: 2, monument: 2, trees: 2, tombs: 2, rail: 1, kicker: 1, empty: 3 },
  mixed: { graves: 3, funbox: 1, kicker: 2, rail: 2, quarter: 1, bowl: 1, mound: 2, platform: 1, mausoleum: 1, monument: 1, trees: 1, tombs: 1, gap: 1, spine: 1, ledges: 1, megaramp: 1, empty: 4 },
};

const DIRS = [0, 90, 180, 270];
const pick = (rand, list) => list[Math.floor(rand() * list.length)];
const range = (rand, a, b) => a + rand() * (b - a);

function weighted(rand, weights) {
  let total = 0;
  for (const k in weights) total += weights[k];
  let r = rand() * total;
  for (const k in weights) if ((r -= weights[k]) < 0) return k;
  return 'empty';
}

// Each feature fills one slot centred on (x, z). It may add props, bowls,
// mounds, rail specs ([x1, z1, x2, z2, heightAboveGround1, heightAboveGround2])
// and candle flames, and returns true if the slot should be paved.
const FEATURES = {
  empty: () => false,

  funbox(c, x, z, rand) {
    const facing = pick(rand, DIRS), box = F.funbox({ x, z, facing });
    c.props.push(box);
    const ux = Math.cos(F.rad(facing)), uz = Math.sin(F.rad(facing));
    if (rand() < 0.7) c.railSpecs.push([x - ux * 3.5, z - uz * 3.5, x + ux * 3.5, z + uz * 3.5, 0.45, 0.45]);
    return true;
  },

  kicker(c, x, z, rand) {
    const facing = pick(rand, DIRS), ux = Math.cos(F.rad(facing)), uz = Math.sin(F.rad(facing));
    const k = F.kicker({ x: x - ux * 12, z: z - uz * 12, facing, width: range(rand, 5, 7), radius: range(rand, 8, 12), angle: range(rand, 30, 40) });
    c.props.push(k);
    if (rand() < 0.5) {   // a rail to land on
      const a = k.lipU - 12 + 4, b = 14;
      c.railSpecs.push([x + ux * a, z + uz * a, x + ux * b, z + uz * b, k.lipY + 0.3, 0.55]);
    }
    return true;
  },

  rail(c, x, z, rand) {
    const angle = F.rad(pick(rand, [0, 45, 90, 135])), len = range(rand, 7, 11);
    const ux = Math.cos(angle) * len, uz = Math.sin(angle) * len;
    c.railSpecs.push([x - ux, z - uz, x + ux, z + uz, 0.5, 0.5]);
    return rand() < 0.6;
  },

  quarter(c, x, z, rand) {
    const facing = pick(rand, DIRS), ux = Math.cos(F.rad(facing)), uz = Math.sin(F.rad(facing));
    c.props.push(F.quarter({ x: x - ux * 4, z: z - uz * 4, facing, width: range(rand, 12, 16), deck: 5 }));
    return true;
  },

  halfpipe(c, x, z, rand) {
    const facing = pick(rand, [0, 90]), ux = Math.cos(F.rad(facing)), uz = Math.sin(F.rad(facing));
    c.props.push(
      F.quarter({ x: x + ux * 5, z: z + uz * 5, facing, width: 16, deck: 2, vert: 3 }),
      F.quarter({ x: x - ux * 5, z: z - uz * 5, facing: facing + 180, width: 16, deck: 2, vert: 3 }));
    return true;
  },

  bowl(c, x, z, rand) {
    c.bowls.push(F.bowl({ x, z, flat: range(rand, 5.5, 8) }));
    return true;
  },

  mound(c, x, z, rand) {
    c.mounds.push({ x, z, r: range(rand, 11, 15), h: range(rand, 2.5, 4.5) });
    return rand() < 0.5;
  },

  // A gap: two kickers facing each other, with a rail strung between their lips. Clear it, or grind it.
  gap(c, x, z, rand) {
    const facing = pick(rand, DIRS), ux = Math.cos(F.rad(facing)), uz = Math.sin(F.rad(facing)), half = range(rand, 5, 7);
    const shape = { width: 6, radius: 9, angle: 32 }, start = half + F.kicker({ x: 0, z: 0, ...shape }).lipU;   // (each kicker's lip is `half` metres from the middle)
    const up = F.kicker({ x: x - ux * start, z: z - uz * start, facing, ...shape });
    c.props.push(up, F.kicker({ x: x + ux * start, z: z + uz * start, facing: facing + 180, ...shape }));
    if (rand() < 0.6) c.railSpecs.push([x - ux * half, z - uz * half, x + ux * half, z + uz * half, up.lipY + 0.25, up.lipY + 0.25]);
    return true;
  },

  // A spine: two quarter pipes back to back. Up one side, over the top, down the other.
  spine(c, x, z, rand) {
    const facing = pick(rand, [0, 90]), ux = Math.cos(F.rad(facing)), uz = Math.sin(F.rad(facing));
    const shape = { width: range(rand, 11, 15), radius: 5, angle: 60, deck: 0.3 }, back = F.quarter({ x: 0, z: 0, ...shape }).u1 - 0.15;   // (how far back from the top each one starts)
    c.props.push(
      F.quarter({ x: x - ux * back, z: z - uz * back, facing, ...shape }),
      F.quarter({ x: x + ux * back, z: z + uz * back, facing: facing + 180, ...shape }));
    return true;
  },

  // Ledges: three long stone blocks stepping up, side by side, with a rail along the tallest.
  ledges(c, x, z, rand) {
    const facing = pick(rand, DIRS), ux = Math.cos(F.rad(facing)), uz = Math.sin(F.rad(facing)), length = range(rand, 9, 12);
    [0.4, 0.75, 1.1].forEach((height, i) => {
      const off = (i - 1) * 3.1, along = (i - 1) * 2.5;   // (each one a little further on than the last)
      c.props.push(F.box({ x: x - uz * off + ux * along, z: z + ux * off + uz * along, facing, length, width: 2.2, height }));
    });
    const rx = x - uz * 3.1 + ux * 2.5, rz = z + ux * 3.1 + uz * 2.5, half = length / 2 - 0.6;
    c.railSpecs.push([rx - ux * half, rz - uz * half, rx + ux * half, rz + uz * half, 0.45, 0.45]);
    return true;
  },

  // One enormous kicker.
  megaramp(c, x, z, rand) {
    const facing = pick(rand, DIRS), ux = Math.cos(F.rad(facing)), uz = Math.sin(F.rad(facing));
    c.props.push(F.kicker({ x: x - ux * 13, z: z - uz * 13, facing, width: range(rand, 8, 10), radius: 14, angle: range(rand, 36, 41) }));
    return true;
  },

  // Raised platform: bank up one side, handrail down the other.
  platform(c, x, z, rand) {
    const facing = pick(rand, DIRS), ux = Math.cos(F.rad(facing)), uz = Math.sin(F.rad(facing));
    c.props.push(
      F.kicker({ x: x - ux * 13.47, z: z - uz * 13.47, facing, width: 10, radius: 8, angle: 34 }),
      F.box({ x, z, facing, length: 18, width: 10, height: 1.37 }));
    c.railSpecs.push([x + ux * 7, z + uz * 7, x + ux * 15, z + uz * 15, 0.5, 0.45]);
    return true;
  },

  // Grass plot full of headstones, with a bare tree in one corner and a leaning
  // fence along each side: ramps to jump the graves from, or to roll out over.
  graves(c, x, z, rand) {
    const w = range(rand, 18, 25), d = range(rand, 12, 20);
    c.plots.push({ x, z, w, d });
    // One fence per side, its lip just outside the kerb, with the corners left open to ride through.
    const RISE = 3, LIP = 0.4;
    for (const [facing, half, length] of [[180, w / 2, d], [0, w / 2, d], [270, d / 2, w], [90, d / 2, w]]) {
      const ux = Math.cos(F.rad(facing)), uz = Math.sin(F.rad(facing));   // (+u points into the plot)
      c.props.push(F.fence({ x: x - ux * (half + LIP + RISE), z: z - uz * (half + LIP + RISE), facing, width: length - 4.5, rise: RISE }));
    }
    for (let gz = z - d / 2 + 2; gz <= z + d / 2 - 1.2; gz += 3.6) {
      for (let gx = x - w / 2 + 1.6; gx <= x + w / 2 - 1.6; gx += 2.4) {
        if (rand() < 0.22) continue;
        const kind = rand() < 0.62 ? 0 : rand() < 0.7 ? 1 : 2;
        c.props.push(F.headstone({ x: gx, z: gz, facing: (rand() - 0.5) * 14, kind, scale: range(rand, 0.9, 1.2) }));
        if (kind !== 2 && rand() < 0.45) c.dirt.push([gx, gz + 1.25]);
        if (kind !== 2 && rand() < 0.3) c.flames.push(gx + (rand() - 0.5) * 0.5, 0.2, gz + 0.4);
      }
    }
    c.props.push(F.tree({ x: x + pick(rand, [-1, 1]) * (w / 2 - 0.8), z: z + d / 2 - 0.8, scale: range(rand, 1.4, 2), variant: Math.floor(rand() * 4) }));
    return false;
  },

  mausoleum(c, x, z, rand) {
    const facing = pick(rand, DIRS), m = F.mausoleum({ x, z, facing });
    c.props.push(m);
    for (const s of [-1, 1]) c.flames.push(x + 4.4 * m.cos + s * 1.9 * m.sin, 0.25, z - 4.4 * m.sin + s * 1.9 * m.cos);   // candles by the door
    return false;
  },

  monument(c, x, z, rand) {
    c.props.push(F.monument({ x, z, facing: pick(rand, DIRS), statue: Math.floor(rand() * 3) }));
    c.flames.push(x + 1.1, 0.2, z, x - 1.1, 0.2, z);
    return rand() < 0.5;
  },

  tombs(c, x, z, rand) {
    const n = 2 + Math.floor(rand() * 2);
    for (let i = 0; i < n; i++) {
      c.props.push(F.box({
        x: x + (i - (n - 1) / 2) * 9, z: z + range(rand, -8, 8), facing: range(rand, -25, 25) + pick(rand, [0, 90]),
        length: range(rand, 5, 9), width: range(rand, 1.2, 3), height: range(rand, 0.5, 1.2),
      }));
    }
    return rand() < 0.5;
  },

  trees(c, x, z, rand) {
    const n = 3 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) {
      c.props.push(F.tree({ x: x + range(rand, -12, 12), z: z + range(rand, -12, 12), scale: range(rand, 1.3, 2.2), variant: Math.floor(rand() * 4) }));
    }
    return false;
  },

  chapel(c, x, z, rand) {
    c.props.push(F.chapel({ x, z, facing: pick(rand, DIRS) }));
    return false;
  },
};

// ---- Per-chunk height sampling ----------------------------------------------

// The ground itself (hills, bowls and mounds), without props.
export function chunkBase(c, x, z) {
  if (c.level === 3) return moonHeight(x, z);   // (the Moon is one fixed shape: nothing is added to it here)
  if (c.level === 4) return houseHeight(x, z);  // (and so is the House)
  if (c.level === 5) return descentHeight(x, z);   // (and the hill)
  let h = c.level === 2 ? cataHeight(x, z, c.seed) : hillHeight(x, z, c.seed);
  for (const b of c.bowls) h += F.bowlHeight(b, x, z);
  for (const m of c.mounds) h += F.moundHeight(m, x, z);
  return h;
}

// Props are bucketed into a coarse grid so we only check the few nearby.
const CELL = 8, CELLS = CHUNK / CELL;
function buildGrid(c) {
  c.grid = Array.from({ length: CELLS * CELLS }, () => []);
  const cell = (v) => Math.min(CELLS - 1, Math.max(0, Math.floor(v / CELL)));
  for (const p of c.props) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const u of [p.u0, p.u1]) for (const w of [p.w0, p.w1]) {
      const x = p.x + u * p.cos + w * p.sin, z = p.z - u * p.sin + w * p.cos;   // local -> world
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
    }
    for (let i = cell(x0 - c.x0); i <= cell(x1 - c.x0); i++) {
      for (let j = cell(z0 - c.z0); j <= cell(z1 - c.z0); j++) c.grid[j * CELLS + i].push(p);
    }
  }
}

export function chunkHeight(c, x, z) {
  const base = chunkBase(c, x, z);
  let h = base;
  const i = Math.floor((x - c.x0) / CELL), j = Math.floor((z - c.z0) / CELL);
  if (i < 0 || i >= CELLS || j < 0 || j >= CELLS) return h;
  for (const p of c.grid[j * CELLS + i]) {
    const dx = x - p.x, dz = z - p.z;
    const u = dx * p.cos - dz * p.sin;
    if (u < p.u0 || u > p.u1) continue;
    const w = dx * p.sin + dz * p.cos;
    if (w < p.w0 || w > p.w1) continue;
    const ph = (p.drape ? base : p.y0) + p.localHeight(u, w);
    if (ph > h) h = ph;
  }
  return h;
}

// Is this spot concrete (true) or grass (false)? Lanes run between the slots.
export function chunkPaved(c, x, z) {
  if (c.level === 3 || c.level === 4) return false;
  if (c.level === 5) return descentPaved(x, z);
  if (c.level === 2) return cataFloor(x, z, c.seed);   // (the Catacombs: flagstones on the floor, bare rock up the walls)
  const lx = x - c.x0, lz = z - c.z0;
  const ex = lx % SLOT, ez = lz % SLOT;
  if (ex < PATH || ex > SLOT - PATH || ez < PATH || ez > SLOT - PATH) return true;
  return c.paved[Math.min(2, Math.floor(lz / SLOT)) * 3 + Math.min(2, Math.floor(lx / SLOT))] === 1;
}

// ---- Chunk generation --------------------------------------------------------

function chunkSeed(cx, cz, seed) {
  let h = (seed ^ Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  return h ^ (h >>> 13);
}

export function generateChunk(cx, cz, seed) {
  const rand = seededRandom(chunkSeed(cx, world.level === 2 ? lapChunk(cz) : cz, seed));   // (the Catacombs are a loop: every lap is built the same)
  const c = {
    cx, cz, seed, level: world.level, x0: cx * CHUNK, z0: cz * CHUNK,
    props: [], rails: [], railSpecs: [], bowls: [], mounds: [], plots: [],
    dirt: [], flames: [], lamps: [], paved: new Uint8Array(9),
  };
  if (c.level === 2) fillCatacombs(c, rand, FEATURES);
  else if (c.level === 3) fillMoon(c);
  else if (c.level === 4) fillHouse(c);
  else if (c.level === 5) fillDescent(c);
  else fillCemetery(c, rand, seed);

  // Stand everything on the ground: rigid props at the height under their centre,
  // candles and dirt mounds wherever they are.
  for (const p of c.props) p.y0 = chunkBase(c, p.x, p.z);
  for (let k = 0; k < c.flames.length; k += 3) c.flames[k + 1] += chunkBase(c, c.flames[k], c.flames[k + 2]);
  for (const d of c.dirt) d.push(chunkBase(c, d[0], d[1]));

  buildGrid(c);
  // Rails sit a set height above whatever is under each end.
  for (const [x1, z1, x2, z2, h1, h2] of c.railSpecs) {
    c.rails.push(F.rail(x1, chunkHeight(c, x1, z1) + h1, z1, x2, chunkHeight(c, x2, z2) + h2, z2));
  }
  return c;
}

// Level 1: a 3x3 grid of features picked by the chunk's district, and a couple of street lamps.
function fillCemetery(c, rand, seed) {
  const { cx, cz } = c;
  const home = cx === 0 && cz === 0;   // the spawn chunk is always a skatepark
  c.district = home ? 'park' : weighted(rand, { park: 3, graveyard: 3, mixed: 4 });
  const landmark = !home && rand() < 0.1 ? Math.floor(rand() * 9) : -1;   // the odd chapel

  for (let j = 0; j < 3; j++) {
    for (let i = 0; i < 3; i++) {
      const slot = j * 3 + i, x = c.x0 + (i + 0.5) * SLOT, z = c.z0 + (j + 0.5) * SLOT;
      let feature = slot === landmark ? 'chapel' : weighted(rand, DISTRICTS[c.district]);
      if (home && slot === 4) feature = 'empty';    // clear ground to spawn on...
      if (home && slot === 1) feature = 'funbox';   // ...with a funbox straight ahead
      // Too steep to build on? Leave it as open hillside.
      const rise = Math.max(
        Math.abs(hillHeight(x + 12, z, seed) - hillHeight(x - 12, z, seed)),
        Math.abs(hillHeight(x, z + 12, seed) - hillHeight(x, z - 12, seed)));
      if (!home && rise / 24 > TOO_STEEP) feature = 'empty';
      if (FEATURES[feature](c, x, z, rand) || (home && slot === 4)) c.paved[slot] = 1;
    }
  }

  // A couple of street lamps where the lanes cross.
  for (let n = 0; n < 2; n++) {
    const x = c.x0 + pick(rand, [1, 2]) * SLOT + 3.2, z = c.z0 + pick(rand, [1, 2]) * SLOT + 3.2;
    if (c.lamps.some((l) => l.x === x && l.z === z)) continue;
    const post = F.lamp({ x, z });
    post.y0 = chunkBase(c, x, z);
    c.lamps.push({ x, z, y: post.y0 });
    c.props.push(post);
  }
}
