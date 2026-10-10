// The ground as a pure height function over an endless, procedurally
// generated world: heightAt(x, z), normalAt(x, z) and the rails near a point.
// Physics samples this directly; chunkMesh.js builds matching meshes.
import { CHUNK, generateChunk, chunkHeight, chunkPaved } from './worldgen.js';

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
export const chunkAt = (x, z) => getChunk(Math.floor(x / CHUNK), Math.floor(z / CHUNK));

export const heightAt = (x, z) => chunkHeight(chunkAt(x, z), x, z);
export const pavedAt = (x, z) => chunkPaved(chunkAt(x, z), x, z);
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
