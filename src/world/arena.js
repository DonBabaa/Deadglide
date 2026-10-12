// The visible world: night sky, moonlight, mist, and the chunks of cemetery
// around the player. Chunks are built as you approach and dropped behind you,
// so the world goes on for as long as you keep skating.
import * as THREE from 'three';
import { getChunk, groundAt } from './terrain.js';
import { CHUNK } from './worldgen.js';
import { createChunkBuilder } from './chunkMesh.js';
import { seededRandom } from './random.js';
import { glowTexture, regolithTexture, lavaTexture } from './textures.js';
import { buildCemeteryBackdrop, buildMoonOutside } from './backdrop.js';
import { CATA, floorAt } from './catacombs.js';
import { buildHouseScene } from './houseScene.js';
import { MOON, moonHeight, daylight, VENTS, BEACONS, LAVA_Y, LAVA_LAKE } from './moon.js';

const HORIZON = 0x1c2535;
const MOON_DIR = new THREE.Vector3(-0.6, 0.62, -0.4).normalize();
const VIEW = 2;          // chunks loaded in every direction (2 = a 5x5 block, ~240 m of visibility)
const LAMP_LIGHTS = 6;   // real lights shared between the nearest street lamps

export function buildArena(scene) {
  // Fog hides the edge of the loaded world.
  scene.fog = new THREE.FogExp2(HORIZON, 0.0085);
  scene.background = new THREE.Color(HORIZON);

  // Moonlight (casts the shadows) + sky fill.
  const fill = new THREE.HemisphereLight(0x7f95c4, 0x20241c, 0.75);
  scene.add(fill);
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
  const backdrop = buildCemeteryBackdrop(HORIZON);   // the Cemetery's horizon: what is painted round it, far off
  scene.add(sky, mist.group, far, backdrop);

  // The Catacombs: a roof (only drawn; nothing can reach it), a lamp on Kirky's head pointing where he
  // aims, and a little glow round him. They stay switched off in the Cemetery.
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshStandardMaterial({ color: 0x2c2620, roughness: 1, side: THREE.DoubleSide }));
  roof.rotation.x = -Math.PI / 2 + Math.atan(CATA.slope);   // (it slopes down with the floor)
  roof.visible = false;
  const headlamp = new THREE.SpotLight(0xfff0d6, 0, 120, 0.62, 0.55, 1.5);
  const glow = new THREE.PointLight(0xa8b8e0, 0, 30, 1.6);
  scene.add(roof, headlamp, headlamp.target, glow);
  let level = 1, view = VIEW, moonFar = null, house = null;

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
    for (let dx = -view; dx <= view; dx++) {
      for (let dz = -view; dz <= view; dz++) {
        if (!loaded.has(`${pcx + dx},${pcz + dz}`)) missing.push([dx * dx + dz * dz, pcx + dx, pcz + dz]);
      }
    }
    missing.sort((a, b) => a[0] - b[0]);
    for (const [, cx, cz] of missing.slice(0, budget)) load(cx, cz);

    for (const [key, entry] of loaded) {
      if (Math.abs(entry.cx - pcx) > view + 1 || Math.abs(entry.cz - pcz) > view + 1) {
        scene.remove(entry.group);
        builder.dispose(entry.group);
        loaded.delete(key);
      }
    }
    if (!centre || centre[0] !== pcx || centre[1] !== pcz) {
      centre = [pcx, pcz];
      far.position.set((pcx + 0.5) * CHUNK, groundAt((pcx + 0.5) * CHUNK, (pcz + 0.5) * CHUNK) - 4, (pcz + 0.5) * CHUNK);   // (roughly level with the land round here)
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
        const l = lamps[i][1], off = l.dx ?? -1.6;   // (street lamps hang out from their post; braziers burn where they stand)
        light.position.set(l.x + off, l.y + (l.h ?? 6.4), l.z + off);
        light.intensity = l.power ?? 900;
      } else light.intensity = 0;
    });
  }

  let lampTimer = 0;
  return {
    // Change level: drop everything on screen and redress the place. (terrain.js's setLevel comes first.)
    setLevel(n) {
      level = n;
      for (const entry of loaded.values()) { scene.remove(entry.group); builder.dispose(entry.group); }
      loaded.clear();
      centre = null;
      const under = n === 2, lunar = n === 3, casino = n === 4;
      view = lunar ? 3 : VIEW;   // (no mist on the Moon to hide the edge of what's loaded: load more of it)
      const dark = under ? 0x060508 : lunar ? 0x000000 : casino ? 0x241a12 : HORIZON;
      scene.fog.color.set(dark);
      scene.fog.density = under ? 0.017 : lunar ? 0.0012 : casino ? 0.002 : 0.0085;
      scene.background.set(dark);
      fill.intensity = under ? 0.22 : lunar ? 0.3 : casino ? 0.85 : 0.75;
      fill.color.set(casino ? 0xffe9c4 : 0x7f95c4);
      fill.groundColor.set(casino ? 0x5a4630 : 0x20241c);
      moon.intensity = under ? 0 : lunar ? 3.4 : casino ? 0.9 : 1.9;       // (on the Moon this light is the Sun; in the House, the chandeliers)
      moon.color.set(lunar ? 0xfff6e8 : casino ? 0xffe2b0 : 0xc3d4ff);
      sky.visible = !under && !casino;
      sky.userData.dome.material.uniforms.horizon.value.set(lunar ? 0x000000 : HORIZON);
      sky.userData.dome.material.uniforms.top.value.set(lunar ? 0x000000 : 0x04060c);
      for (const o of sky.userData.moon) o.visible = !lunar && n !== 5;   // (...and the Long Way Down has its own, dead ahead)   // (you're standing on it)
      sky.userData.earth.visible = lunar;
      far.visible = backdrop.visible = n === 1;
      mist.group.visible = !lunar && !casino;
      roof.visible = under;
      headlamp.intensity = under ? 2400 : 0;
      glow.intensity = under ? 90 : 0;
      // The whole arena, coarsely, under the detailed ground near you: so the far side is always there to see.
      if (lunar && !moonFar) { moonFar = buildMoonFar(); scene.add(moonFar); }
      if (moonFar) moonFar.visible = lunar;
      // The House: its walls, ceiling, chandeliers and furniture.
      if (casino && !house) { house = buildHouseScene(); scene.add(house); }
      if (house) house.visible = casino;
    },
    // The House: what the great chandelier is showing ('red', 'black', 'green' or null), and its floating drink.
    houseSignal(name) { house?.userData.signal(name); },
    houseDrink(on) { if (house) house.userData.drink.visible = on; },
    houseExit(on) { house?.userData.exit(on); },
    // Build everything around the start point up front.
    prime(pos) {
      stream(pos, Infinity);
      sky.position.copy(pos);   // (a scene may play here before the first update)
      backdrop.position.copy(pos);
      assignLampLights(pos);
    },
    // aim: the point the player is aiming at (the Catacombs' headlamp points there).
    update(dt, playerPos, aim) {
      stream(playerPos, 1);   // one new chunk per frame at most, to avoid hitches
      if ((lampTimer -= dt) <= 0) {
        lampTimer = 0.25;
        assignLampLights(playerPos);
      }
      // Keep the shadow map, sky and mist centred on the player.
      moon.target.position.copy(playerPos);
      moon.position.copy(playerPos).addScaledVector(MOON_DIR, 150);
      sky.position.copy(playerPos);
      backdrop.position.copy(playerPos);
      mist.update(dt, playerPos);
      if (level === 2) roof.position.set(playerPos.x, floorAt(playerPos.z) + CATA.ceiling, playerPos.z);
      if (level === 3) {
        // The Moon has a day side and a night side: the sun fades as you cross over, and your headlamp comes on.
        const day = daylight(playerPos.x, playerPos.z);
        moon.intensity = 3.4 * (0.14 + 0.86 * day);
        fill.intensity = 0.55 * (0.45 + 0.55 * day);   // (some bounce light, or everything facing away from the sun is pure black)
        const night = Math.max(0, 1 - day / 0.6);   // (the lamp only comes on once it's properly getting dark)
        headlamp.intensity = 2000 * night;
        glow.intensity = 60 * night;
        if (moonFar) {
          moonFar.userData.lava.material.map.offset.x += dt * 0.012;   // the lava creeps, and its light flickers
          moonFar.userData.lavaLight.intensity = 800 + 250 * Math.sin(performance.now() / 130) * Math.sin(performance.now() / 47);
        }
        if (moonFar) for (const v of moonFar.userData.vents) v.material.opacity = 0.55 + 0.35 * Math.sin(performance.now() / 180 + v.position.x);   // vents pulse
      }
      if (level === 4 && house) house.userData.update(dt, performance.now() / 1000);
      if (level !== 1) {
        glow.position.copy(playerPos).y += 2.4;
        headlamp.position.copy(playerPos).y += 1.7;
        if (aim) headlamp.target.position.copy(aim);
      }
    },
  };
}

// The Moon's whole arena as one coarse sheet (a point every 4.5 m), sunk a little so the detailed ground covers it.
function buildMoonFar() {
  const N = 132, span = (MOON.radius + 45) * 2, step = span / N, x0 = MOON.x - span / 2, z0 = MOON.z - span / 2;
  const positions = [], indices = [], colors = [], uvs = [];
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const x = x0 + i * step, z = z0 + j * step;
    uvs.push(x / 14, z / 14);
    positions.push(x, moonHeight(x, z, true) - (Math.hypot(x - MOON.x, z - MOON.z) > MOON.radius - MOON.wall ? 2.5 : 0.6), z);   // (sunk further on the wall's curve, which it can only follow roughly)
    const lightness = 0.42 + 0.58 * daylight(x, z);
    colors.push(lightness, lightness, lightness);
  }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = j * (N + 1) + i, b = a + 1, d = a + N + 1;
    indices.push(a, d, b, b, d, d + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: regolithTexture(), color: 0x9b9a9c, roughness: 1, vertexColors: true }));
  mesh.frustumCulled = false;
  // Beyond the lip there is no wall to see (only one to stop you): the plain the crater sits in, and what is out on it.
  mesh.add(buildMoonOutside());
  // The lava in the Lava Pit: a glowing lake (it creeps: see update), and the light it throws.
  const lava = new THREE.Mesh(new THREE.PlaneGeometry(LAVA_LAKE.length, LAVA_LAKE.width).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: lavaTexture(), toneMapped: false }));
  lava.material.map.repeat.set(LAVA_LAKE.length / 14, LAVA_LAKE.width / 14);
  lava.position.set(LAVA_LAKE.x, LAVA_Y, LAVA_LAKE.z);
  lava.rotation.y = LAVA_LAKE.turn;
  const lavaLight = new THREE.PointLight(0xff6a1a, 900, 90, 1.6);
  lavaLight.position.set(LAVA_LAKE.x, LAVA_Y + 5, LAVA_LAKE.z);
  mesh.add(lava, lavaLight);
  mesh.userData.lava = lava;
  mesh.userData.lavaLight = lavaLight;
  // Gas vents: a pulsing ring on the ground. (What they do to you is in main.js.)
  mesh.userData.vents = VENTS.map((v) => {
    const ring = new THREE.Mesh(new THREE.RingGeometry(MOON.ventRadius * 0.55, MOON.ventRadius, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x7ff0ff, transparent: true, opacity: 0.8, toneMapped: false, side: THREE.DoubleSide, depthWrite: false }));
    ring.position.set(v.x, moonHeight(v.x, v.z) + 0.12, v.z);
    mesh.add(ring);
    return ring;
  });
  // Beacons: a mast at each place with a coloured light on top, to steer by.
  const glowMap = glowTexture();
  for (const b of BEACONS) {
    const y = moonHeight(b.x, b.z), mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 18, 6), new THREE.MeshBasicMaterial({ color: 0x55565c }));
    mast.position.set(b.x, y + 9, b.z);
    const light = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap, color: b.color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    light.position.set(b.x, y + 18.5, b.z);
    light.scale.setScalar(11);
    mesh.add(mast, light);
  }
  return mesh;
}

function earthTexture() {
  const c = Object.assign(document.createElement('canvas'), { width: 256, height: 256 }), g = c.getContext('2d');
  g.beginPath(); g.arc(128, 128, 120, 0, Math.PI * 2); g.clip();
  g.fillStyle = '#1f55b8'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#2f8a4a';   // land
  for (const [x, y, rx, ry, turn] of [[90, 95, 44, 30, 0.5], [150, 150, 36, 52, -0.3], [70, 175, 22, 30, 0.2], [185, 80, 26, 18, 0.8]]) { g.beginPath(); g.ellipse(x, y, rx, ry, turn, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = 'rgba(255, 255, 255, 0.75)';   // cloud
  for (const [x, y, rx, ry, turn] of [[120, 60, 60, 9, 0.2], [80, 130, 50, 8, -0.3], [170, 190, 55, 10, 0.4], [150, 110, 40, 7, 0.1], [128, 228, 80, 12, 0]]) { g.beginPath(); g.ellipse(x, y, rx, ry, turn, 0, Math.PI * 2); g.fill(); }
  const night = g.createLinearGradient(40, 0, 220, 256);   // the terminator across it
  night.addColorStop(0.45, 'rgba(0, 0, 8, 0)'); night.addColorStop(0.7, 'rgba(0, 0, 8, 0.93)');
  g.fillStyle = night; g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
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
  // The Earth, as seen from the Moon: a blue disc half in shadow.
  const earth = new THREE.Sprite(new THREE.SpriteMaterial({ map: earthTexture(), fog: false, depthWrite: false }));
  earth.position.set(0.35, 0.62, 0.7).normalize().multiplyScalar(1150);
  earth.scale.setScalar(190);
  earth.visible = false;
  group.add(disc, halo, earth);
  group.traverse((o) => { o.frustumCulled = false; });
  group.userData = { dome, moon: [disc, halo], earth };
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
