// The ground as a pure height function over an endless, procedurally
// generated world: heightAt(x, z), normalAt(x, z) and the rails near a point.
// Physics samples this directly; chunkMesh.js builds matching meshes.
import { CHUNK, generateChunk, chunkHeight, chunkBase } from './worldgen.js';
import { world } from './level.js';
import { moonConfine } from './moon.js';
import { houseConfine } from './house.js';
import { descentConfine } from './descent.js';
import { cataPlace, cataConfine, cataAirFloor, route, CATA, EDGE, loopNear, pipePoint, pipeCoord, pipeAround } from './catacombs.js';

// World seed: random each run, or fixed with ?seed=1234 in the URL.
const fromUrl = typeof location !== 'undefined' ? Number(new URLSearchParams(location.search).get('seed')) : 0;
export const SEED = fromUrl || Math.floor(Math.random() * 1e6) + 1;

// Middle of the home chunk.
export const SPAWN = { x: CHUNK / 2, z: CHUNK / 2 };

// Chunk data is generated the first time anything asks about that area.
const chunks = new Map();
let last = null;
export function getChunk(cx, cz) {
  if (last && last.cx === cx && last.cz === cz) return last;
  const key = (cx + 32768) * 65536 + (cz + 32768);
  let c = chunks.get(key);
  if (!c) {
    if (chunks.size > 600) chunks.clear();   // don't hoard the whole world
    c = generateChunk(cx, cz, SEED);
    chunks.set(key, c);
  }
  return (last = c);
}
// Switch level: the world is rebuilt from scratch (arena.js does the same for what's on screen).
export function setLevel(level) {
  world.level = level;
  chunks.clear();
  last = null;
}
// A spot `dist` metres from (px, pz) in direction `angle`, for putting monsters, zones and portals.
// In the Catacombs there is only along the tunnel: ahead or behind, somewhere across its width.
export const placeAt = (px, pz, angle, dist) => (world.level === 2 ? cataPlace(px, pz, angle, dist, SEED) : [px + Math.sin(angle) * dist, pz + Math.cos(angle) * dist]);
// Keep something that flies inside the walls.
export const confineX = (x, z) => (world.level === 2 ? cataConfine(x, z, SEED) : x);

// The tunnel's pipe at this z ({ x: its middle, w: half the floor's width, floor }), or null where there isn't one.
// (The same object every call: read it before asking again.)
export const pipeAt = (z) => (world.level === 2 ? route(z, SEED) : null);
// What is under something that's in the air (in the Catacombs, the pipe's wall counts right up to where it's upright).
export const airFloorAt = (x, z) => (world.level === 2 ? cataAirFloor(x, z, SEED) : heightAt(x, z));
// Is this point inside something solid? (What stops bullets, and where the crosshair's line of sight ends.)
// In the Catacombs the pipe's walls and roof are solid, but the space inside them is not: heightAt alone
// would call everything out past the lip rock, right where you are when you ride a wall.
export function blockedAt(x, y, z) {
  if (world.level !== 2) return y <= heightAt(x, z);
  const r = route(z, SEED), d = Math.abs(x - r.x) - r.w, R = CATA.ceiling / 2, h = y - r.floor;
  if (h >= 2 * R) return true;
  if (d > EDGE - 0.1) return h <= 0 || Math.hypot(d, h - R) >= R;
  return y <= heightAt(x, z);
}
// The Catacombs are a loop: things repeat every lap. This is the copy of `z` nearest to `near` (elsewhere, just z).
// Whatever lies on the floor waiting to be picked up is kept at the copy of its spot nearest the player, so you
// find it again whether you carry on round or turn back.
export const lapNear = (z, near) => (world.level === 2 ? loopNear(z, near) : z);
// Round the pipe, for monsters that climb (see catacombs.js): a place on its surface is (s, z).
export const onPipe = (s, z, out) => pipePoint(s, z, SEED, out);
export const pipeS = (x, y, z) => pipeCoord(x, y, z, SEED);
export const pipeRound = (z) => pipeAround(z, SEED);
export const hasPipe = () => world.level === 2;
// Keep the camera (a THREE.Vector3) out of solid rock: in the Catacombs, inside the pipe (a good
// arm's length off its walls, roof and floor), wherever in it the player has got to.
export function fitCamera(pos) {
  if (world.level === 3) return moonConfine(pos);   // the Moon: inside the crater wall
  if (world.level === 4) return houseConfine(pos);  // the House: inside its walls
  if (world.level === 5) return descentConfine(pos);   // the hill: between its banks
  if (world.level !== 2) return;
  const r = route(pos.z, SEED), off = pos.x - r.x, side = off < 0 ? -1 : 1, d = Math.abs(off) - r.w, R = CATA.ceiling / 2, GAP = 1.3;
  let h = Math.max(0.6, Math.min(2 * R - GAP, pos.y - r.floor));
  if (d > 0) {   // out by a wall: no further from the middle of its curve than the curve itself
    const rho = Math.hypot(d, h - R);
    if (rho > R - GAP) {
      const k = (R - GAP) / rho;
      pos.x = r.x + side * (r.w + d * k);
      h = R + (h - R) * k;
    }
  }
  pos.y = r.floor + h;
}

export const chunkAt = (x, z) => getChunk(Math.floor(x / CHUNK), Math.floor(z / CHUNK));

export const heightAt = (x, z) => chunkHeight(chunkAt(x, z), x, z);
export const groundAt = (x, z) => chunkBase(chunkAt(x, z), x, z);   // the land alone, ignoring props
export const railsNear = (x, z) => chunkAt(x, z).rails;

const E = 0.03;      // finite-difference distance
const CLIFF = 8;     // slopes steeper than this are drops/walls, not ground
const KINK = 1;      // slope change bigger than this is a sharp edge (ramp lip)

// Slope along one axis. Ignores cliffs, and at a sharp edge uses the side we
// came from (v = velocity along this axis) so ramps launch at their true angle.
function slope(hL, hC, hR, v) {
  const sL = (hC - hL) / E, sR = (hR - hC) / E;
  const cliffL = Math.abs(sL) > CLIFF, cliffR = Math.abs(sR) > CLIFF;
  if (cliffL && cliffR) return 0;
  if (cliffL) return sR;
  if (cliffR) return sL;
  if (Math.abs(sR - sL) > KINK) {
    if (v > 0) return sL;
    if (v < 0) return sR;
  }
  return (sL + sR) / 2;
}

// Writes the ground normal into `out` (a THREE.Vector3). vx/vz are optional.
export function normalAt(x, z, vx, vz, out) {
  const hC = heightAt(x, z);
  const sx = slope(heightAt(x - E, z), hC, heightAt(x + E, z), vx);
  const sz = slope(heightAt(x, z - E), hC, heightAt(x, z + E), vz);
  return out.set(-sx, 1, -sz).normalize();
}
