// The visible world: night sky, moonlight, mist, and the chunks of cemetery
// around the player. Chunks are built as you approach and dropped behind you,
// so the world goes on for as long as you keep skating.
import * as THREE from 'three';
import { getChunk, groundAt } from './terrain.js';
import { CHUNK } from './worldgen.js';
import { createChunkBuilder } from './chunkMesh.js';
import { seededRandom } from './random.js';
import { glowTexture, regolithTexture, lavaTexture, relief } from './textures.js';
import { buildCemeteryBackdrop, buildMoonOutside } from './backdrop.js';
import { CATA, floorAt } from './catacombs.js';
import { buildHouseScene } from './houseScene.js';
import { MOON, moonHeight, daylight, VENTS, BEACONS, LAVA_Y, LAVA_LAKE, DOME, domeAt, HOOPS, GEYSER } from './moon.js';

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
  moon.shadow.mapSize.set(4096, 4096);   // (sharp: a headstone's shadow has an edge)
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

  const stats = { build: 0 };   // build: the longest a chunk has lately taken to make (ms): F3 shows it
  function load(cx, cz) {
    const t0 = performance.now();
    const chunk = getChunk(cx, cz), group = builder.build(chunk);
    stats.build = Math.max(stats.build * 0.9, performance.now() - t0);
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
    stats,
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
        if (moonFar && moonFar.userData.geyser) {   // the Geyser blows: its gas climbs, fast in the jet and slower in the column over it
          const G = moonFar.userData.geyser, now = performance.now() / 1000;
          G.jet.material.map.offset.y = -(now * 1.9) % 1;
          G.column.material.map.offset.y = -(now * 0.55) % 1;
          G.light.intensity = 230 + 90 * Math.sin(now * 9) * Math.sin(now * 3.1);
          G.paint.material.opacity = 0.8 + 0.2 * Math.sin(now * 4);
        }
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
  const dust = regolithTexture();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: dust, normalMap: relief(dust, 2.2), color: 0x9b9a9c, roughness: 1, vertexColors: true }));
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
  const dome = buildDome();
  mesh.add(dome);
  mesh.userData.geyser = dome.userData.geyser;
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

// The Moon is a base under glass: a dome over the whole crater. The glass (barely there: a tint, and a sheen low down
// where you look through most of it), the frame that holds it (ribs up to its crown, rings round it, a beam at its
// foot), the hoops that hang from it, and the Geyser that throws you up to them.
function buildDome() {
  const group = new THREE.Group(), R = DOME.radius, H = DOME.height;
  const on = (a, k) => new THREE.Vector3(MOON.x + Math.cos(a) * R * Math.sin(k), H * Math.cos(k), MOON.z + Math.sin(a) * R * Math.sin(k));   // (a: round it; k: 0 at its crown, a quarter turn at its foot)
  const shell = new THREE.SphereGeometry(1, 72, 22, 0, Math.PI * 2, 0, Math.PI / 2).scale(R, H, R).translate(MOON.x, 0, MOON.z);
  const glass = new THREE.Mesh(shell, new THREE.MeshBasicMaterial({ color: 0x8fd0ff, transparent: true, opacity: 0.055, side: THREE.BackSide, depthWrite: false, fog: false }));
  glass.renderOrder = 3;
  // (the sheen: light on the glass, strongest in a band above its foot, in long soft streaks)
  const c = Object.assign(document.createElement('canvas'), { width: 512, height: 256 }), g = c.getContext('2d');
  const band = g.createLinearGradient(0, 0, 0, 256);
  band.addColorStop(0, 'rgba(160,215,255,0.02)'); band.addColorStop(0.55, 'rgba(160,215,255,0.045)'); band.addColorStop(0.86, 'rgba(190,230,255,0.15)'); band.addColorStop(1, 'rgba(160,215,255,0.04)');
  g.fillStyle = band; g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 26; i++) { const x = (i * 97) % 512, w = 6 + ((i * 53) % 30); const streak = g.createLinearGradient(x, 0, x + w, 0); streak.addColorStop(0, 'rgba(255,255,255,0)'); streak.addColorStop(0.5, 'rgba(255,255,255,0.07)'); streak.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = streak; g.fillRect(x, 60, w, 196); }
  const sheenMap = new THREE.CanvasTexture(c);
  sheenMap.wrapS = THREE.RepeatWrapping; sheenMap.repeat.set(3, 1); sheenMap.colorSpace = THREE.SRGBColorSpace;
  const sheen = new THREE.Mesh(shell, new THREE.MeshBasicMaterial({ map: sheenMap, transparent: true, side: THREE.BackSide, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  sheen.renderOrder = 4;
  group.add(glass, sheen);
  // The frame: fine glazing bars all over it, and eight great ribs.
  const bars = [];
  for (let i = 0; i < 48; i++) for (let j = 0; j < 22; j++) { const a = (i / 48) * Math.PI * 2; bars.push(on(a, (j / 22) * Math.PI / 2), on(a, ((j + 1) / 22) * Math.PI / 2)); }
  for (let j = 1; j <= 9; j++) for (let i = 0; i < 96; i++) { const k = (j / 9.6) * Math.PI / 2; bars.push(on((i / 96) * Math.PI * 2, k), on(((i + 1) / 96) * Math.PI * 2, k)); }
  group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(bars), new THREE.LineBasicMaterial({ color: 0xa9cbe6, transparent: true, opacity: 0.3, fog: false, depthWrite: false })));
  const steel = new THREE.MeshStandardMaterial({ color: 0x59636f, roughness: 0.5, metalness: 0.7, fog: false });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2, line = new THREE.CatmullRomCurve3(Array.from({ length: 15 }, (_, j) => on(a, (j / 14) * Math.PI / 2 * 0.995)));
    group.add(new THREE.Mesh(new THREE.TubeGeometry(line, 56, 0.85, 6), steel));
  }
  const crown = new THREE.Mesh(new THREE.TorusGeometry(R * Math.sin(0.12), 0.9, 6, 40).rotateX(Math.PI / 2), steel);
  crown.position.set(MOON.x, H * Math.cos(0.12), MOON.z);
  const foot = new THREE.Mesh(new THREE.TorusGeometry(R * Math.sin(Math.PI / 2 * 0.93), 1.6, 6, 120).rotateX(Math.PI / 2), steel);
  foot.position.set(MOON.x, H * Math.cos(Math.PI / 2 * 0.93), MOON.z);
  group.add(crown, foot);
  // The hoops: a lit ring each (and across a small one a film of light: something to go through), held in steel
  // clamps on cables from the glass over it. One lying flat hangs by its rim, from two sides, or a big one from four;
  // one stood on edge hangs by its top.
  const lit = new THREE.MeshBasicMaterial({ color: 0x7ff0ff, toneMapped: false }), wire = new THREE.LineBasicMaterial({ color: 0x8aa0b4, transparent: true, opacity: 0.6 }), wires = [];
  const film = new THREE.MeshBasicMaterial({ map: filmTexture(), color: 0x7ff0ff, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const Z = new THREE.Vector3(0, 0, 1), clamp = new THREE.BoxGeometry(1, 1, 1);
  for (const h of HOOPS) {
    const tube = Math.min(0.34, Math.max(0.13, h.r * 0.05)), flat = h.ny > 0.5;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(h.r, tube, 8, Math.max(36, Math.round(h.r * 6))), lit);
    ring.position.set(h.x, h.y, h.z);
    ring.quaternion.setFromUnitVectors(Z, new THREE.Vector3(h.nx, h.ny, h.nz));
    group.add(ring);
    if (h.r < 8) {
      const skin = new THREE.Mesh(new THREE.CircleGeometry(h.r - tube, 36), film);
      skin.position.copy(ring.position);
      skin.quaternion.copy(ring.quaternion);
      skin.renderOrder = 2;
      group.add(skin);
    }
    for (const [sx, sz] of flat ? (h.r > 8 ? [[1, 0], [-1, 0], [0, 1], [0, -1]] : [[1, 0], [-1, 0]]) : [[0, 0]]) {
      const x = h.x + sx * h.r, z = h.z + sz * h.r, y = h.y + (flat ? 0 : h.r);
      wires.push(new THREE.Vector3(x, y, z), new THREE.Vector3(x, domeAt(x, z) - 0.4, z));
      const block = new THREE.Mesh(clamp, steel);
      block.position.set(x, y + tube * 0.6, z);
      block.scale.set(tube * 3.4, tube * 3, tube * 3.4);
      group.add(block);
    }
  }
  group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(wires), wire));
  // The Geyser: its mouth (a steel collar bolted down round the hole, and the paint round that which says where to
  // ride, laid on the ground as it lies), the jet out of it, and the column of gas the jet becomes, as tall as it
  // throws you.
  const gy = moonHeight(GEYSER.x, GEYSER.z), geyser = new THREE.Group(), wide = GEYSER.radius * 1.5;
  geyser.position.set(GEYSER.x, gy, GEYSER.z);
  const lawn = new THREE.PlaneGeometry(wide * 2, wide * 2, 14, 14).rotateX(-Math.PI / 2), spots = lawn.attributes.position;
  for (let i = 0; i < spots.count; i++) spots.setY(i, moonHeight(GEYSER.x + spots.getX(i), GEYSER.z + spots.getZ(i)) - gy + 0.13);
  const paint = new THREE.Mesh(lawn, new THREE.MeshBasicMaterial({ map: geyserPaint(), transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  const collar = new THREE.Mesh(new THREE.TorusGeometry(GEYSER.radius * 0.46, 0.14, 6, 36).rotateX(Math.PI / 2), steel);
  collar.position.y = 0.1;
  geyser.add(paint, collar);
  const bolt = new THREE.CylinderGeometry(0.09, 0.09, 0.16, 6);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2, lug = new THREE.Mesh(bolt, steel);
    lug.position.set(Math.cos(a) * GEYSER.radius * 0.46, 0.24, Math.sin(a) * GEYSER.radius * 0.46);
    geyser.add(lug);
  }
  // (gas: an open tube with wisps climbing it (see update), bright at its foot and gone by its top)
  const wisps = wispTexture();
  const gas = (foot, head, tall, opacity, repeat) => {
    const map = wisps.clone(), tube = new THREE.CylinderGeometry(head, foot, tall, 24, 10, true), at = tube.attributes.position, shade = [];
    map.needsUpdate = true;
    map.repeat.set(2, repeat);
    for (let i = 0; i < at.count; i++) { const up = at.getY(i) / tall + 0.5, k = (1 - up) ** 1.6 * Math.min(1, up * 14); shade.push(k, k, k); }
    tube.setAttribute('color', new THREE.Float32BufferAttribute(shade, 3));
    const column = new THREE.Mesh(tube, new THREE.MeshBasicMaterial({ map, color: 0xffc070, vertexColors: true, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }));
    column.position.y = tall / 2;
    column.renderOrder = 5;
    geyser.add(column);
    return column;
  };
  const jet = gas(GEYSER.radius * 0.4, GEYSER.radius * 0.75, 30, 0.9, 2), column = gas(GEYSER.radius * 0.6, GEYSER.radius * 1.5, GEYSER.reach, 0.38, 7);
  const light = new THREE.PointLight(0xffb060, 260, 40, 1.6);
  light.position.y = 3;
  geyser.add(light);
  group.add(geyser);
  group.userData.geyser = { jet, column, light, paint };
  return group;
}
// (the film across a hoop: next to nothing in its middle, bright against its ring)
function filmTexture() {
  const c = Object.assign(document.createElement('canvas'), { width: 128, height: 128 }), g = c.getContext('2d');
  const fade = g.createRadialGradient(64, 64, 8, 64, 64, 64);
  fade.addColorStop(0, 'rgba(255,255,255,0.02)'); fade.addColorStop(0.72, 'rgba(255,255,255,0.07)'); fade.addColorStop(1, 'rgba(255,255,255,0.5)');
  g.fillStyle = fade; g.fillRect(0, 0, 128, 128);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}
// (the paint round the Geyser: the glow of its hole, a dashed ring where it takes you, arrows pointing in at it)
function geyserPaint() {
  const c = Object.assign(document.createElement('canvas'), { width: 512, height: 512 }), g = c.getContext('2d'), R = 256 / 1.5;
  g.translate(256, 256);
  const glow = g.createRadialGradient(0, 0, 0, 0, 0, R * 0.95);
  glow.addColorStop(0, 'rgba(255,236,170,0.95)'); glow.addColorStop(0.4, 'rgba(255,170,60,0.6)'); glow.addColorStop(1, 'rgba(255,120,30,0)');
  g.fillStyle = glow; g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#ffb347'; g.lineWidth = 9; g.setLineDash([30, 15]);
  g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.stroke();
  g.setLineDash([]); g.lineWidth = 3; g.globalAlpha = 0.7;
  g.beginPath(); g.arc(0, 0, 250, 0, Math.PI * 2); g.stroke();
  g.globalAlpha = 0.95; g.lineWidth = 9; g.lineJoin = 'miter';
  for (let i = 0; i < 12; i++) {
    g.save(); g.rotate((i / 12) * Math.PI * 2);
    for (const far of [236, 212]) { g.beginPath(); g.moveTo(-15, far); g.lineTo(0, far - 15); g.lineTo(15, far); g.stroke(); }
    g.restore();
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  return map;
}
// (gas: soft streaks that run the height of the picture, swelling and thinning, which join up where it repeats)
function wispTexture() {
  const W = 128, H = 256, c = Object.assign(document.createElement('canvas'), { width: W, height: H }), g = c.getContext('2d'), image = g.createImageData(W, H);
  const streaks = Array.from({ length: 16 }, (_, i) => ({ x: (i * 37 + 11) % W, w: 3 + ((i * 13) % 9), n: 1 + (i % 4), at: i * 1.7, a: 0.35 + ((i * 29) % 50) / 100 }));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = 0;
    for (const s of streaks) {
      const d = Math.min(Math.abs(x - s.x), W - Math.abs(x - s.x)) / s.w;
      if (d < 3) v += Math.exp(-d * d) * s.a * (0.5 + 0.5 * Math.sin((y / H) * Math.PI * 2 * s.n + s.at)) ** 2;
    }
    const k = (y * W + x) * 4, lit = Math.min(255, v * 255);
    image.data[k] = image.data[k + 1] = image.data[k + 2] = lit;
    image.data[k + 3] = 255;
  }
  g.putImageData(image, 0, 0);
  const map = new THREE.CanvasTexture(c);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
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
