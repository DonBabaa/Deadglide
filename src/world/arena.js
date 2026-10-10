// The visible world: night sky, moonlight, mist, and the chunks of cemetery
// around the player. Chunks are built as you approach and dropped behind you,
// so the world goes on for as long as you keep skating.
import * as THREE from 'three';
import { getChunk, groundAt } from './terrain.js';
import { CHUNK } from './worldgen.js';
import { createChunkBuilder } from './chunkMesh.js';
import { seededRandom } from './random.js';
import { glowTexture } from './textures.js';

const HORIZON = 0x1c2535;
const MOON_DIR = new THREE.Vector3(-0.6, 0.62, -0.4).normalize();
const VIEW = 2;          // chunks loaded in every direction (2 = a 5x5 block, ~240 m of visibility)
const LAMP_LIGHTS = 6;   // real lights shared between the nearest street lamps

export function buildArena(scene) {
  // Fog hides the edge of the loaded world.
  scene.fog = new THREE.FogExp2(HORIZON, 0.0085);
  scene.background = new THREE.Color(HORIZON);

  // Moonlight (casts the shadows) + sky fill.
  scene.add(new THREE.HemisphereLight(0x7f95c4, 0x20241c, 0.75));
  const moon = new THREE.DirectionalLight(0xc3d4ff, 1.9);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  Object.assign(moon.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 300 });
  moon.shadow.bias = -0.0004;
  moon.shadow.normalBias = 0.06;
  scene.add(moon, moon.target);

  const sky = buildSky();
  const mist = buildMist();
  const far = buildFarGround();
  scene.add(sky, mist.group, far);

  const lampLights = Array.from({ length: LAMP_LIGHTS }, () => {
    const light = new THREE.PointLight(0xffc488, 0, 70, 2);
    scene.add(light);
    return light;
  });

  // ---- Chunk streaming ----
  const builder = createChunkBuilder();
  const loaded = new Map();   // "cx,cz" -> { group, chunk }
  let centre = null;

  function load(cx, cz) {
    const chunk = getChunk(cx, cz), group = builder.build(chunk);
    scene.add(group);
    loaded.set(`${cx},${cz}`, { group, chunk, cx, cz });
  }

  // Loads at most `budget` missing chunks (nearest first) and drops far ones.
  function stream(pos, budget) {
    const pcx = Math.floor(pos.x / CHUNK), pcz = Math.floor(pos.z / CHUNK);
    const missing = [];
    for (let dx = -VIEW; dx <= VIEW; dx++) {
      for (let dz = -VIEW; dz <= VIEW; dz++) {
        if (!loaded.has(`${pcx + dx},${pcz + dz}`)) missing.push([dx * dx + dz * dz, pcx + dx, pcz + dz]);
      }
    }
    missing.sort((a, b) => a[0] - b[0]);
    for (const [, cx, cz] of missing.slice(0, budget)) load(cx, cz);

    for (const [key, entry] of loaded) {
      if (Math.abs(entry.cx - pcx) > VIEW + 1 || Math.abs(entry.cz - pcz) > VIEW + 1) {
        scene.remove(entry.group);
        builder.dispose(entry.group);
        loaded.delete(key);
      }
    }
    if (!centre || centre[0] !== pcx || centre[1] !== pcz) {
      centre = [pcx, pcz];
      far.position.set((pcx + 0.5) * CHUNK, -1, (pcz + 0.5) * CHUNK);
    }
  }

  // Put the few real lights on the lamps nearest the player.
  const lamps = [];
  function assignLampLights(pos) {
    lamps.length = 0;
    for (const { chunk } of loaded.values()) {
      for (const l of chunk.lamps) lamps.push([(l.x - pos.x) ** 2 + (l.z - pos.z) ** 2, l]);
    }
    lamps.sort((a, b) => a[0] - b[0]);
    lampLights.forEach((light, i) => {
      if (i < lamps.length) {
        light.position.set(lamps[i][1].x - 1.6, lamps[i][1].y + 6.4, lamps[i][1].z - 1.6);
        light.intensity = 900;
      } else light.intensity = 0;
    });
  }

  let lampTimer = 0;
  return {
    // Build everything around the start point up front.
    prime(pos) {
      stream(pos, Infinity);
      assignLampLights(pos);
    },
    update(dt, playerPos) {
      stream(playerPos, 1);   // one new chunk per frame at most, to avoid hitches
      if ((lampTimer -= dt) <= 0) {
        lampTimer = 0.25;
        assignLampLights(playerPos);
      }
      // Keep the shadow map, sky and mist centred on the player.
      moon.target.position.copy(playerPos);
      moon.position.copy(playerPos).addScaledVector(MOON_DIR, 150);
      sky.position.copy(playerPos);
      mist.update(dt, playerPos);
    },
  };
}

function buildSky() {
  const group = new THREE.Group();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1500, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(0x04060c) }, horizon: { value: new THREE.Color(HORIZON) } },
      vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 horizon; varying vec3 vDir; void main() { float t = pow(clamp(vDir.y, 0.0, 1.0), 0.45); gl_FragColor = vec4(mix(horizon, top, t), 1.0); }',
    }));
  group.add(dome);

  const rand = seededRandom(42), pts = [];
  for (let i = 0; i < 1400; i++) {
    const a = rand() * Math.PI * 2, el = 0.12 + rand() * 1.4, r = 1300;
    pts.push(Math.cos(a) * Math.cos(el) * r, Math.sin(el) * r, Math.sin(a) * Math.cos(el) * r);
  }
  const stars = new THREE.BufferGeometry();
  stars.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  group.add(new THREE.Points(stars, new THREE.PointsMaterial({ color: 0xcfd8ee, size: 1.3, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8 })));

  const disc = new THREE.Mesh(new THREE.CircleGeometry(38, 40), new THREE.MeshBasicMaterial({ color: 0xf2f4ff, fog: false }));
  disc.position.copy(MOON_DIR).multiplyScalar(1200);
  disc.lookAt(0, 0, 0);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0x9fb4e8, fog: false, transparent: true, opacity: 0.55, depthWrite: false }));
  halo.position.copy(MOON_DIR).multiplyScalar(1190);
  halo.scale.setScalar(420);
  group.add(disc, halo);
  group.traverse((o) => { o.frustumCulled = false; });
  return group;
}

// Plain dark ground beyond the loaded chunks (a big sheet with a hole where they are),
// so there is never a visible edge in the fog.
function buildFarGround() {
  const outer = 3000, inner = (VIEW + 0.5) * CHUNK - 2;
  const square = (s, flip) => {
    const pts = [new THREE.Vector2(-s, -s), new THREE.Vector2(s, -s), new THREE.Vector2(s, s), new THREE.Vector2(-s, s)];
    return flip ? pts.reverse() : pts;
  };
  const sheet = new THREE.Shape(square(outer));
  sheet.holes.push(new THREE.Path(square(inner, true)));
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(sheet), new THREE.MeshStandardMaterial({ color: 0x35452a, roughness: 1 }));
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

// Low mist drifting across the ground, always around the player.
function buildMist() {
  const group = new THREE.Group(), rand = seededRandom(5), tex = glowTexture(), SPAN = 170;
  const puffs = [];
  for (let i = 0; i < 46; i++) {
    const puff = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0x8fa3c4, transparent: true, opacity: 0.05 + rand() * 0.05, depthWrite: false }));
    puff.position.set((rand() - 0.5) * 2 * SPAN, 1 + rand() * 1.5, (rand() - 0.5) * 2 * SPAN);
    const size = 30 + rand() * 30;
    puff.scale.set(size, size * 0.22, 1);
    puff.userData.speed = 0.6 + rand() * 1.2;
    puff.userData.height = puff.position.y;
    puffs.push(puff);
    group.add(puff);
  }
  // Wrap a coordinate so it stays within SPAN of the player.
  const wrap = (v, centre) => centre + ((((v - centre + SPAN) % (2 * SPAN)) + 2 * SPAN) % (2 * SPAN)) - SPAN;
  return {
    group,
    update(dt, pos) {
      for (const puff of puffs) {
        puff.position.x = wrap(puff.position.x + puff.userData.speed * dt, pos.x);
        puff.position.z = wrap(puff.position.z, pos.z);
        puff.position.y = groundAt(puff.position.x, puff.position.z) + puff.userData.height;   // hug the hills
      }
    },
  };
}
