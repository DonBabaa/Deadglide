// The Long Way Down: level 5, the run out. The House is coming down behind you
// and the hill it stands on is going with it: one enormous descent, three
// kilometres of it, with the collapse on your heels the whole way (see
// systems/descent.js for that, and for the ghosts).
//
// The course runs straight down the hill, toward -z, between two banks. `s` is
// how far down it you are, in metres from the doors. It passes through what is
// left of the places you came through:
//   the city       the street down from the casino, between two rows of buildings
//   the cemetery   through its gates: graves up both slopes, a gravel path between
//   the sewer      the hill splits open into a storm drain: a long, deep half pipe between concrete walls
//   the hillside   open ground, big kickers, long rails
// (What you ride over is here. What you ride past, the buildings, the graves, the pines, is world/descentScene.js.)
// and ends where the hill does: the banks fall away, and the last ramp sticks
// out into nothing and throws you at the Moon.
// One fixed shape, like the Moon and the House: descentHeight(x, z) is the
// ground, PROPS and RAILS what stands on it.
import * as F from './features.js';
import { seededRandom } from './random.js';

const CHUNK = 96, X0 = 48, Z0 = 48;   // where you start (the spawn point)
export const DESCENT = {
  grade: 0.13,            // how steep the hill is (metres down per metre along)
  lane: 26,               // the course is this wide either side of the middle before the banks start to climb
  city: [30, 560],        // the street: where it begins and ends (s)
  sewer: [960, 1820],     // where the half pipe begins and ends (s)
  pipe: { flat: 6, radius: 9, lip: 14.5 },   // the half pipe: half the width of its floor, the curve of its sides, where they stop
  walk: 29,               // the storm drain's walls stand this far from the middle (walkways between them and the pipe)
  terrace: 13,            // the city's pavements end this far outside the lane, at the buildings' doors
  ramp: [2865, 2955],     // the last ramp: where it starts, and its lip
  rampRadius: 112,
  edge: [2600, 2740],     // the banks give out over this stretch: after it, the course is a tongue of ground with nothing either side
  length: 2955,
};
const smooth = (k) => { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); };

// How far down the course a spot is.
export const along = (z) => Z0 - z;
// 0..1: how much of the sewer's half pipe there is at s (it opens and closes over 60 m).
export const sewerAt = (s) => smooth((s - DESCENT.sewer[0]) / 60) * (1 - smooth((s - DESCENT.sewer[1] + 60) / 60));
// ...and how much of the city street (the banks are low there: a ramp up to the pavement).
export const cityAt = (s) => smooth((s - DESCENT.city[0]) / 40) * (1 - smooth((s - DESCENT.city[1] + 50) / 50));
const PIPE_DEPTH = DESCENT.pipe.radius - Math.sqrt(DESCENT.pipe.radius ** 2 - (DESCENT.pipe.lip - DESCENT.pipe.flat) ** 2);

export function descentHeight(x, z) {
  const D = DESCENT, s = along(z), a = Math.abs(x - X0);
  if (s < -16) return -0.012 * (s + 16) * (s + 16) + Math.max(0, a - D.lane) * 0.3;   // behind the casino the hilltop falls away: it stands on the crest
  if (s > D.ramp[1]) return -900;                           // off the end: nothing
  // The hill: level outside the doors, tipping over into the slope.
  let h = -D.grade * (s < 20 ? 0 : s < 80 ? ((s - 20) * (s - 20)) / 120 : s - 50);
  const pipe = sewerAt(s), open = (1 - pipe) * (1 - smooth((s - D.ramp[0] + 160) / 120));
  h += 1.7 * Math.sin(s / 23) * smooth((s - 130) / 90) * open;          // rollers
  h += 1.1 * Math.sin(s / 61 + x / 19) * smooth((s - 200) / 100) * open;   // and a slow swell across them
  // The sewer: the floor drops away and the sides curve up to where the ground was.
  if (pipe > 0) { const P = D.pipe; h += pipe * ((a < P.flat ? 0 : a < P.lip ? P.radius - Math.sqrt(P.radius * P.radius - (a - P.flat) * (a - P.flat)) : PIPE_DEPTH) - PIPE_DEPTH); }
  // The last ramp.
  if (s > D.ramp[0]) h += D.rampRadius - Math.sqrt(D.rampRadius * D.rampRadius - (s - D.ramp[0]) * (s - D.ramp[0]));
  // The banks... until the hill runs out: then nothing either side, all the way down.
  const e = a - D.lane, out = smooth((s - D.edge[0]) / (D.edge[1] - D.edge[0]));
  if (e > 0) {
    // Three kinds of side: open hillside (a steep bank, then the slope going on up), the city (a ramp up to the
    // pavement, then the buildings), the storm drain (a walkway, then a sheer wall).
    const city = cityAt(s);
    const wild = e > 14 ? 5.9 + (e - 14) * 0.3 : e * e * 0.03;   // (nothing tall: what stops you is in systems/descent.js)
    const town = e > D.terrace ? 15 : Math.min(e, 9) ** 2 * 0.06;
    const drain = a > D.walk ? Math.min(3, (a - D.walk) * 6) + (a - D.walk) * 0.25 : 0;   // (a low wall, and the ground going on up behind it)
    h += (wild * (1 - city - pipe) + town * city + drain * pipe) * (1 - out) - 420 * out * smooth(e / 5);
  }
  return h;
}

// Paved (true) or grass: the sewer's half pipe is concrete, and so is the last ramp.
export const descentPaved = (x, z) => { const s = along(z); return sewerAt(s) > 0.5 || cityAt(s) > 0.5 || s > DESCENT.ramp[0] - 20 || s < 40; };

// What colour the ground is at a spot (a hex number: chunkMesh.js tints the ground with it, a metre at a time).
export function descentTint(x, z) {
  const D = DESCENT, s = along(z), a = Math.abs(x - X0), e = a - D.lane;
  if (s > D.ramp[0] - 20) return (s + a * 1.4) % 14 < 2.5 && a < D.lane - 3 ? 0xd9862a : 0x8d9094;   // the last ramp: concrete, with chevrons pointing up it
  if (sewerAt(s) > 0.5) {   // the storm drain: concrete, a dark channel down the middle, yellow at the lips, grates on the walkways
    if (a < 1) return 0x24403a;
    if (a > D.pipe.lip - 0.5 && a < D.pipe.lip + 1.5) return Math.floor(s / 3) % 2 ? 0xc9a227 : 0x2a2a2c;
    if (a > 20 && a < 23 && s % 43 < 4) return 0x2c2f33;
    return a > D.walk + 0.6 ? 0x3a3f38 : a > D.walk - 0.6 ? 0x5f6468 : a < D.pipe.lip ? 0x8a8f92 : 0x74797c;
  }
  if (cityAt(s) > 0.5 || s < 40) {   // the street: tarmac, a broken white line, a line at each edge, pale kerbs and pavements
    if (a < 0.6 && s % 9 < 4.5) return 0xd8d2b4;
    if (e > 9 || s < 24) return 0x86837c;
    if (e > 0) return 0x5b5d62;
    if (a > D.lane - 1.5) return 0xc8c2a6;
    if (a > 12 && a < 13 && s % 6 < 3) return 0x9a9788;
    return 0x34373d;
  }
  const hill = s > D.sewer[1];
  const path = Math.abs(x - X0 - (hill ? 7 * Math.sin(s / 70) : 0)) < (hill ? 6 : 8);
  if (path) return hill ? 0x6b5a44 : (Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1 > 0.3 ? 0x8f8676 : 0x7c7466;   // a dirt track down the hillside; gravel through the graves
  return hill ? (e > 14 ? 0x2c3a26 : 0x3a4a2c) : e > 14 ? 0x2a3824 : 0x35452a;
}

// Keep a point (the camera) between the banks.
export function descentConfine(pos) {
  pos.x = Math.max(X0 - 40, Math.min(X0 + 40, pos.x));
}

// ---- What stands on it ----------------------------------------------------------------------
export const PROPS = [], RAILS = [];
const spot = (x, s) => ({ x: X0 + x, z: Z0 - s });
// A rail down the hill at `x`, from s0 to s1, `up` metres above the ground, in pieces that follow it.
function rail(x, s0, s1, up = 0.55, x1 = x) {
  const n = Math.max(1, Math.round((s1 - s0) / 8)), made = [];
  for (let i = 0; i < n; i++) {
    const a = s0 + ((s1 - s0) * i) / n, b = s0 + ((s1 - s0) * (i + 1)) / n, xa = x + ((x1 - x) * i) / n, xb = x + ((x1 - x) * (i + 1)) / n;
    made.push(F.rail(X0 + xa, descentHeight(X0 + xa, Z0 - a) + up, Z0 - a, X0 + xb, descentHeight(X0 + xb, Z0 - b) + up, Z0 - b));
  }
  made.forEach((r, i) => { r.next = made[i + 1] || null; r.prev = made[i - 1] || null; });
  RAILS.push(...made);
}
{
  const rand = seededRandom(7777), D = DESCENT, DOWN = 270;   // (props face down the hill)
  // The cemetery: the gates, then graves and fences either side of a clear line, kickers, and rails.
  PROPS.push(F.mausoleum({ ...spot(-20, 590), facing: DOWN }), F.mausoleum({ ...spot(20, 590), facing: DOWN }));
  for (let s = 110; s < D.sewer[0] - 80; s += 44 + rand() * 30) {
    const side = rand() < 0.5 ? -1 : 1, x = side * (5 + rand() * 15), kind = rand();
    if (kind < 0.34) PROPS.push(F.kicker({ ...spot(x, s), facing: DOWN, width: 6 + rand() * 4, radius: 9, angle: 26 + rand() * 8 }));
    else if (kind < 0.6) PROPS.push(F.box({ ...spot(x, s), facing: DOWN, length: 7, width: 3.4, height: 1.1 }));
    else if (kind < 0.8 && s > D.city[1]) PROPS.push(F.fence({ ...spot(x, s), facing: DOWN, width: 9 }));
    else rail(x, s, s + 46 + rand() * 40, 0.6);
    if (s < D.city[1] + 20) continue;   // (no graves in the street)
    for (let k = 0; k < 5; k++) PROPS.push(F.headstone({ ...spot(-side * (9 + rand() * 15), s + rand() * 30), facing: rand() * 360, kind: Math.floor(rand() * 3), scale: 1.6 + rand() }));
    if (rand() < 0.6) PROPS.push(F.tree({ ...spot((rand() < 0.5 ? -1 : 1) * (27 + rand() * 6), s + rand() * 30), variant: Math.floor(rand() * 4), scale: 1.6 + rand() }));
  }
  // The sewer: a rail along each lip and one down the middle in lengths, and kickers on the floor.
  for (let s = D.sewer[0] + 70; s < D.sewer[1] - 110; s += 150) {
    rail(-D.pipe.lip - 0.1, s, s + 90, 0.5);
    rail(D.pipe.lip + 0.1, s + 60, s + 150, 0.5);
    rail(0, s + 20, s + 70, 0.6);
    PROPS.push(F.kicker({ ...spot((rand() - 0.5) * 6, s + 110), facing: DOWN, width: 7, radius: 9, angle: 30 }));
  }
  // The hillside: fewer, bigger things, and long rails that cross the fall line.
  for (let s = D.sewer[1] + 70; s < D.ramp[0] - 190; s += 90 + rand() * 50) {
    const x = (rand() - 0.5) * 34, kind = rand();
    if (kind < 0.45) PROPS.push(F.kicker({ ...spot(x, s), facing: DOWN, width: 9 + rand() * 5, radius: 12, angle: 30 + rand() * 8 }));
    else if (kind < 0.65) PROPS.push(F.funbox({ ...spot(x, s), facing: DOWN, length: 16, width: 10, radius: 8, angle: 30 }));
    else rail(x, s, s + 80 + rand() * 60, 0.65, x + (rand() - 0.5) * 22);
  }
  // Two rails up the face of the last ramp, for anyone who wants to leave it grinding.
  for (const x of [-9, 9]) rail(x, D.ramp[0] - 60, D.ramp[1] - 2, 0.55);
}

// Hand a chunk the props and rails that fall inside it (worldgen.js calls this for level 5).
export function fillDescent(c) {
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
