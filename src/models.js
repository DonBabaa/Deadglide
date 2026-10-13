// Fetching the game's models (public/models/*.glb).
//
//   loadModel('mobs.glb')   a promise of what GLTFLoader makes of it (.scene, .animations)
//
// In a build they are not shipped as they are: each has been packed to a fraction of its size (name.glbz: see
// tools/pack_models.mjs, which vite.config.js runs), and is unzipped and unpacked here into the very bytes it was
// made from before it is read. While the game is being worked on (`npm run dev`) the files are read as they stand.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { unpack } from './unpack.js';

const BASE = `${import.meta.env.BASE_URL}models/`;

// What a zipped response holds. (Every browser the game runs in can unzip by itself; one that cannot is handed
// three's own unzipper, fetched only then.)
async function unzipped(response) {
  if (typeof DecompressionStream === 'function') return new Uint8Array(await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  const { gunzipSync } = await import('three/addons/libs/fflate.module.js');
  return gunzipSync(new Uint8Array(await response.arrayBuffer()));
}

export async function loadModel(name) {
  if (import.meta.env.DEV) return new GLTFLoader().loadAsync(BASE + name);
  const response = await fetch(`${BASE}${name}z`);
  if (!response.ok) throw new Error(`${name}: ${response.status}`);
  const glb = unpack(await unzipped(response));
  return new GLTFLoader().parseAsync(glb.buffer, BASE);
}
