// Packs the game's models for a build: every dist/models/*.glb becomes a .glbz a fraction of the size, and the .glb
// is taken out of the build. Nothing is lost by it: the game unpacks each one into the very bytes it was made from
// (src/unpack.js), and this checks that it does, file by file, before it lets the build finish.
//
// vite.config.js runs it at the end of `npm run build`. By itself it only reports:
//   node tools/pack_models.mjs            what each model in public/models would come to
//
// How: a .glb is mostly long runs of numbers (the corners of a mesh and which way each faces, its triangles, the keys
// of a clip). Each run is rearranged so that it zips well (see src/unpack.js for exactly how: three ways, and the one
// that comes out smallest for that run is the one used), and then the whole file is zipped.
import { gzipSync, gunzipSync, deflateSync } from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unpack } from '../src/unpack.js';

const BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }, ACROSS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

// One stretch of numbers, rearranged in way `how` (see src/unpack.js).
function rearranged(part, rows, across, size, how, real) {
  let from = part;
  if (how > 1) {
    from = new Uint8Array(part);   // (a copy: its own bytes, from the start of them)
    const n = size === 1 ? from : size === 2 ? new Uint16Array(from.buffer) : new Uint32Array(from.buffer);
    if (how === 2) for (let i = n.length - 1; i >= across; i--) n[i] -= n[i - across];
    else for (let i = n.length - 1; i >= across; i--) n[i] ^= n[i - across];
  }
  const wide = across * size, out = new Uint8Array(rows * wide);
  for (let p = 0, to = 0; p < wide; p++) for (let i = 0, at = p; i < rows; i++, at += wide) out[to++] = from[at];
  return out;
}

export function pack(glb) {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength), jsonLong = view.getUint32(12, true);
  const doc = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLong))), bin = 20 + jsonLong + 8;
  const out = new Uint8Array(glb), stretches = [], done = [];
  for (const a of doc.accessors || []) {
    if (a.bufferView === undefined || a.sparse) continue;
    const v = doc.bufferViews[a.bufferView], size = BYTES[a.componentType], across = ACROSS[a.type];
    if (!size || !across || (v.byteStride && v.byteStride !== size * across)) continue;   // (woven in with something else: left alone)
    const start = bin + (v.byteOffset || 0) + (a.byteOffset || 0), long = a.count * across * size;
    if (!long || done.some(([s, e]) => start < e && start + long > s)) continue;          // (already done: two things can share a run)
    done.push([start, start + long]);
    const part = glb.subarray(start, start + long), real = a.componentType === 5126;
    let best = null;
    for (const how of [1, real ? 3 : 2]) {
      const made = rearranged(part, a.count, across, size, how), zipped = deflateSync(made, { level: 6 }).length;
      if (!best || zipped < best.zipped) best = { how, made, zipped };
    }
    if (best.zipped >= deflateSync(part, { level: 6 }).length) continue;                   // (it zips better as it is)
    out.set(best.made, start);
    stretches.push([start, a.count, across, size, best.how]);
  }
  const head = new TextEncoder().encode(JSON.stringify({ v: 1, f: stretches })), whole = new Uint8Array(4 + head.length + out.length);
  new DataView(whole.buffer).setUint32(0, head.length, true);
  whole.set(head, 4);
  whole.set(out, 4 + head.length);
  const packed = gzipSync(whole, { level: 9, memLevel: 9 });
  const back = unpack(new Uint8Array(gunzipSync(packed)));
  if (back.length !== glb.length || Buffer.compare(Buffer.from(back.buffer, back.byteOffset, back.length), Buffer.from(glb.buffer, glb.byteOffset, glb.length)) !== 0) throw new Error('A packed model did not unpack into what it was made from.');
  return packed;
}

// Pack every model in `dir` (a build's models folder): each name.glb is replaced by name.glbz.
export function packFolder(dir, log = console.log) {
  let before = 0, after = 0;
  for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.glb')).sort()) {
    const glb = new Uint8Array(fs.readFileSync(path.join(dir, name))), packed = pack(glb);
    fs.writeFileSync(path.join(dir, `${name}z`), packed);
    fs.rmSync(path.join(dir, name));
    before += glb.length; after += packed.length;
    log(`  ${name.padEnd(20)} ${(glb.length / 1e6).toFixed(2).padStart(6)} MB -> ${(packed.length / 1e6).toFixed(2).padStart(5)} MB`);
  }
  log(`  models, in all       ${(before / 1e6).toFixed(2).padStart(6)} MB -> ${(after / 1e6).toFixed(2).padStart(5)} MB  (each unpacked again and found the same, byte for byte)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'models');
  let before = 0, after = 0;
  for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.glb')).sort()) {
    const glb = new Uint8Array(fs.readFileSync(path.join(dir, name))), packed = pack(glb);
    before += glb.length; after += packed.length;
    console.log(`${name.padEnd(20)} ${(glb.length / 1e6).toFixed(2).padStart(6)} MB -> ${(packed.length / 1e6).toFixed(2).padStart(5)} MB`);
  }
  console.log(`${'in all'.padEnd(20)} ${(before / 1e6).toFixed(2).padStart(6)} MB -> ${(after / 1e6).toFixed(2).padStart(5)} MB`);
}
