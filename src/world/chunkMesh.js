// Turns one chunk of generated world data into something you can see.
// Materials and repeated shapes (headstones, trees) are made once and shared;
// everything else is built per chunk and thrown away when the chunk unloads.
import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { CHUNK, chunkBase, chunkHeight, chunkPaved } from './worldgen.js';
import { seededRandom } from './random.js';
import { groundTexture, rampTexture, stoneWallTexture, stoneTexture, glowTexture } from './textures.js';

const CONCRETE = new THREE.Color(0x9c9b96), GRASS = new THREE.Color(0x35452a);
const Y = new THREE.Vector3(0, 1, 0);
const shared = (geo) => { geo.userData.shared = true; return geo; };

export function createChunkBuilder() {
  const stoneMap = stoneTexture(), glow = glowTexture();
  const mat = {
    ground: new THREE.MeshStandardMaterial({ map: groundTexture(), vertexColors: true, roughness: 0.95 }),
    ramp: new THREE.MeshStandardMaterial({ map: rampTexture(), roughness: 0.8, side: THREE.DoubleSide }),
    tomb: new THREE.MeshStandardMaterial({ map: stoneMap, roughness: 0.95, side: THREE.DoubleSide }),
    wall: new THREE.MeshStandardMaterial({ map: stoneWallTexture(), roughness: 0.95 }),
    stone: new THREE.MeshStandardMaterial({ map: stoneMap, roughness: 0.95 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xb9bec4, roughness: 0.3, metalness: 0.55 }),
    iron: new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.6, metalness: 0.4 }),
    bark: new THREE.MeshStandardMaterial({ color: 0x2a231d, roughness: 1 }),
    dirt: new THREE.MeshStandardMaterial({ color: 0x2b221a, roughness: 1 }),
    bulb: new THREE.MeshBasicMaterial({ color: 0xffe2b0 }),
    window: new THREE.MeshBasicMaterial({ color: 0xd9a35a }),
    flare: new THREE.SpriteMaterial({ map: glow, color: 0xffc98a, transparent: true, opacity: 0.6, depthWrite: false }),
    flame: new THREE.PointsMaterial({ map: glow, color: 0xffb060, size: 0.9, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  };
  const rand = seededRandom(11);
  const headstones = headstoneGeometries().map(shared);
  const trees = [0, 1, 2, 3].map(() => shared(treeGeometry(rand)));
  const moundGeo = shared(new THREE.SphereGeometry(1, 10, 6));

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();

  function build(c) {
    const group = new THREE.Group();
    group.add(buildGround(c, mat));
    for (const b of c.bowls) {   // steel coping round each bowl, following the ground at its lip
      const ring = [];
      for (let k = 0; k <= 72; k++) {
        const a = (k / 72) * Math.PI * 2, x = b.x + Math.cos(a) * b.outer, z = b.z + Math.sin(a) * b.outer;
        ring.push(new THREE.Vector3(x, chunkBase(c, b.x + Math.cos(a) * (b.outer + 0.2), b.z + Math.sin(a) * (b.outer + 0.2)) + 0.02, z));
      }
      group.add(new THREE.Mesh(mergeGeometries(ring.slice(1).map((pt, k) => tubeGeometry(ring[k], pt, 0.06))), mat.steel));
    }

    const stones = [[], [], []];
    for (const p of c.props) {
      if (p.type === 'headstone') stones[p.kind].push(p);
      else if (p.type === 'tree') {
        const tree = new THREE.Mesh(trees[p.variant], mat.bark);
        tree.position.set(p.x, p.y0 - 0.5, p.z);
        tree.rotation.y = p.variant * 1.7 + p.x;
        tree.scale.setScalar(p.scale);
        tree.castShadow = true;
        group.add(tree);
      }
      else if (p.type === 'mausoleum') group.add(buildMausoleum(p, mat));
      else if (p.type === 'monument') group.add(buildMonument(p, mat));
      else if (p.type === 'chapel') group.add(buildChapel(p, mat));
      else if (p.type === 'lamp') group.add(buildLamp(p, mat));
      else group.add(buildProp(p, mat, c));
    }

    // Headstones: one instanced mesh per shape.
    stones.forEach((list, kind) => {
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(headstones[kind], mat.stone, list.length);
      list.forEach((p, i) => mesh.setMatrixAt(i, m.compose(v.set(p.x, p.y0 - 0.12, p.z), q.setFromAxisAngle(Y, p.yaw), sc.setScalar(p.scale))));
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
    });

    // Grave plots: a stone kerb round each, fresh dirt mounds, candles.
    const kerbs = [];
    for (const plot of c.plots) {
      // Walk round the plot's edge in short pieces so the kerb follows the slope.
      const hw = plot.w / 2, hd = plot.d / 2, corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd], [-hw, -hd]];
      for (let k = 0; k < 4; k++) {
        const [ax, az] = corners[k], [bx, bz] = corners[k + 1], steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 2);
        const at = (t) => {
          const x = plot.x + ax + (bx - ax) * t, z = plot.z + az + (bz - az) * t;
          return new THREE.Vector3(x, chunkBase(c, x, z) + 0.04, z);
        };
        for (let s = 0; s < steps; s++) kerbs.push(tubeGeometry(at(s / steps), at((s + 1) / steps), 0.11));
      }
    }
    if (kerbs.length) group.add(new THREE.Mesh(mergeGeometries(kerbs), mat.stone));
    if (c.dirt.length) {
      const mounds = new THREE.InstancedMesh(moundGeo, mat.dirt, c.dirt.length);
      c.dirt.forEach(([x, z, y], i) => mounds.setMatrixAt(i, m.compose(v.set(x, y, z), q.identity(), sc.set(0.5, 0.16, 0.95))));
      mounds.receiveShadow = true;
      group.add(mounds);
    }
    if (c.flames.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(c.flames, 3));
      group.add(new THREE.Points(geo, mat.flame));
    }

    // Rails: every rail and post in the chunk merged into one mesh.
    const tubes = [];
    for (const r of c.rails) {
      const a = new THREE.Vector3(r.ax, r.ay, r.az), b = new THREE.Vector3(r.bx, r.by, r.bz);
      tubes.push(tubeGeometry(a, b, 0.05));
      const posts = Math.max(1, Math.round(r.len / 2.5));
      for (let i = 0; i <= posts; i++) {
        const top = a.clone().lerp(b, 0.04 + (0.92 * i) / posts);
        tubes.push(tubeGeometry(top, new THREE.Vector3(top.x, chunkHeight(c, top.x, top.z), top.z), 0.035));
      }
    }
    if (tubes.length) {
      const rails = new THREE.Mesh(mergeGeometries(tubes), mat.steel);
      rails.castShadow = true;
      group.add(rails);
    }
    return group;
  }

  function dispose(group) {
    group.traverse((o) => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); });
  }

  return { build, dispose };
}

// ---- Ground ------------------------------------------------------------------

// One grid per chunk, 1 m cells, tinted concrete or grass per vertex.
function buildGround(c, mat) {
  const n = CHUNK, positions = [], uvs = [], colors = [], indices = [];
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const x = c.x0 + i, z = c.z0 + j;
      positions.push(x, chunkBase(c, x, z), z);
      uvs.push(x / 6, z / 6);
      const col = chunkPaved(c, x, z) ? CONCRETE : GRASS;
      colors.push(col.r, col.g, col.b);
    }
  }
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i, b = a + 1, d = a + n + 1, e = d + 1;
      indices.push(a, d, b, b, d, e);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, mat.ground);
  ground.receiveShadow = true;
  return ground;
}

// ---- Ramps, pipes, tombs -------------------------------------------------------

// Grid lines no more than `max` apart (keeping the originals), so a big flat
// prop still bends with the ground under it.
function refine(lines, max = 2) {
  const out = [lines[0]];
  for (let i = 1; i < lines.length; i++) {
    const a = lines[i - 1], b = lines[i], n = Math.ceil((b - a) / max);
    for (let k = 1; k <= n; k++) out.push(a + ((b - a) * k) / n);
  }
  return out;
}

// Mesh for one skate prop: its top surface laid over the ground, plus side walls.
function buildProp(p, mat, c) {
  if (p.type === 'fence') return buildFence(p, mat, c);
  const us = refine(p.us), ws = refine(p.ws), pos = [], uv = [];
  // Ground height under a point given in the prop's own coordinates.
  const ground = (u, w) => chunkBase(c, p.x + u * p.cos + w * p.sin, p.z - u * p.sin + w * p.cos);
  const P = (i, j) => [us[i], ground(us[i], ws[j]) + p.localHeight(us[i], ws[j]), ws[j]];
  const floor = ([x, , z]) => [x, ground(x, z) - 0.4, z];
  const tri = (a, b, c, side) => {
    pos.push(...a, ...b, ...c);
    for (const v of [a, b, c]) uv.push(side ? (v[0] + v[2]) / 3 : v[0] / 3, side ? v[1] / 3 : v[2] / 3);
  };
  const wall = (a, b) => { tri(a, b, floor(b), true); tri(a, floor(b), floor(a), true); };

  for (let i = 0; i < us.length - 1; i++) {
    for (let j = 0; j < ws.length - 1; j++) {
      tri(P(i, j), P(i, j + 1), P(i + 1, j));
      tri(P(i + 1, j), P(i, j + 1), P(i + 1, j + 1));
    }
    wall(P(i, 0), P(i + 1, 0));
    wall(P(i, ws.length - 1), P(i + 1, ws.length - 1));
  }
  for (let j = 0; j < ws.length - 1; j++) {
    wall(P(0, j), P(0, j + 1));
    wall(P(us.length - 1, j), P(us.length - 1, j + 1));
  }

  let geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo = toCreasedNormals(geo, Math.PI / 5);   // smooth curves, crisp edges
  const mesh = new THREE.Mesh(geo, p.type === 'box' ? mat.tomb : mat.ramp);   // boxes are stone tombs
  mesh.castShadow = mesh.receiveShadow = true;

  // Steel coping along quarter-pipe lips.
  if (p.type === 'quarter') {
    const lip = ws.map((w) => new THREE.Vector3(p.lipU, ground(p.lipU, w) + p.lipY, w));
    mesh.add(new THREE.Mesh(mergeGeometries(lip.slice(1).map((pt, k) => tubeGeometry(lip[k], pt, 0.06))), mat.steel));
  }
  mesh.position.set(p.x, 0.01, p.z);
  mesh.rotation.y = p.yaw;
  return mesh;
}

// A cylinder between two points, as bare geometry (for merging).
// Leaning fence round a grave plot: wrought-iron railings you can see through.
// Only the look is bars: what you ride on is still the solid ramp from features.js.
// Bars run up the long outer face, over the top (ending in a spike) and down the
// short inner face; rails run along the fence to hold them together.
function buildFence(p, mat, c) {
  const ground = (u, w) => chunkBase(c, p.x + u * p.cos + w * p.sin, p.z - u * p.sin + w * p.cos);
  const at = (u, w, lift = 0.03) => new THREE.Vector3(u, ground(u, w) + p.localHeight(u, w) + lift, w);
  const tubes = [], top = p.lipU, end = p.u1, width = p.w1 - p.w0;

  const count = Math.max(2, Math.round(width / 0.42));
  for (let i = 0; i <= count; i++) {
    const w = p.w0 + (width * i) / count, post = i % 6 === 0;   // every sixth bar is a thicker post
    const foot = at(0, w, -0.15), lip = at(top, w), inner = at(end, w, -0.15);
    tubes.push(tubeGeometry(foot, lip, post ? 0.05 : 0.024), tubeGeometry(lip, inner, post ? 0.05 : 0.024));
    // The spike: the bar carries on a little past the top, along the same lean.
    const spike = lip.clone().sub(foot).normalize().multiplyScalar(post ? 0.5 : 0.32).add(lip);
    tubes.push(tubeGeometry(lip, spike, post ? 0.05 : 0.024, post ? 0.012 : 0.004));
  }
  // Rails: near the foot, part-way up and along the top of the outer face, and one across the inner face.
  const steps = Math.max(1, Math.ceil(width / 2));
  for (const u of [top * 0.1, top * 0.55, top, top + (end - top) * 0.55]) {
    for (let k = 0; k < steps; k++) tubes.push(tubeGeometry(at(u, p.w0 + (width * k) / steps), at(u, p.w0 + (width * (k + 1)) / steps), u === top ? 0.045 : 0.032));
  }

  const mesh = new THREE.Mesh(mergeGeometries(tubes), mat.iron);
  mesh.castShadow = true;
  mesh.position.set(p.x, 0.01, p.z);
  mesh.rotation.y = p.yaw;
  return mesh;
}

// tip: the radius at b, if it tapers.
function tubeGeometry(a, b, radius, tip = radius) {
  const len = a.distanceTo(b), mid = a.clone().lerp(b, 0.5);
  const geo = new THREE.CylinderGeometry(tip, radius, len, 8);
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, b.clone().sub(a).normalize()));
  return geo.translate(mid.x, mid.y, mid.z);
}

// Box whose texture repeats every `tile` metres instead of stretching.
function texturedBox(w, h, d, material, tile = 4) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv, sizes = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let i = 0; i < uv.count; i++) {
    const [su, sv] = sizes[Math.floor(i / 4)];
    uv.setXY(i, (uv.getX(i) * su) / tile, (uv.getY(i) * sv) / tile);
  }
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

// Puts a group where its solid prop is. Prop local +u is the group's +X.
function placed(group, p) {
  group.position.set(p.x, p.y0, p.z);
  group.rotation.y = p.yaw;
  return group;
}

// ---- Cemetery pieces -----------------------------------------------------------

function headstoneGeometries() {
  // Rounded-top slab
  const shape = new THREE.Shape();
  shape.moveTo(-0.4, 0); shape.lineTo(-0.4, 0.9); shape.absarc(0, 0.9, 0.4, Math.PI, 0, true); shape.lineTo(0.4, 0); shape.closePath();
  const slab = new THREE.ExtrudeGeometry(shape, { depth: 0.18, bevelEnabled: false });
  slab.translate(0, 0, -0.09);
  // Cross
  const cross = mergeGeometries([
    new THREE.BoxGeometry(0.22, 1.7, 0.2).translate(0, 0.85, 0),
    new THREE.BoxGeometry(0.9, 0.22, 0.2).translate(0, 1.2, 0),
    new THREE.BoxGeometry(0.6, 0.2, 0.5).translate(0, 0.1, 0),
  ]);
  // Obelisk
  const obelisk = mergeGeometries([
    new THREE.CylinderGeometry(0.16, 0.34, 2.4, 4).translate(0, 1.5, 0),
    new THREE.ConeGeometry(0.23, 0.35, 4).translate(0, 2.87, 0),
    new THREE.BoxGeometry(0.8, 0.3, 0.8).translate(0, 0.15, 0),
  ]);
  return [slab, cross, obelisk];
}

// A bare tree: a trunk that keeps forking.
function treeGeometry(rand) {
  const parts = [], q = new THREE.Quaternion();
  const grow = (start, dir, len, radius, depth) => {
    const end = start.clone().addScaledVector(dir, len);
    const geo = new THREE.CylinderGeometry(radius * 0.65, radius, len, 5, 1, true);
    geo.translate(0, len / 2, 0).applyQuaternion(q.setFromUnitVectors(Y, dir)).translate(start.x, start.y, start.z);
    parts.push(geo);
    if (depth === 0) return;
    const forks = depth > 2 ? 2 : 2 + Math.floor(rand() * 2);
    for (let i = 0; i < forks; i++) {
      const bend = new THREE.Vector3(rand() - 0.5, rand() * 0.5 + 0.1, rand() - 0.5).normalize();
      grow(end, dir.clone().lerp(bend, 0.55).normalize(), len * (0.62 + rand() * 0.15), radius * 0.62, depth - 1);
    }
  };
  grow(new THREE.Vector3(), new THREE.Vector3((rand() - 0.5) * 0.15, 1, (rand() - 0.5) * 0.15).normalize(), 3.6, 0.32, 4);
  return mergeGeometries(parts);
}

// Flat-roofed tomb house: matches its solid box exactly, plus trim.
function buildMausoleum(p, mat) {
  const l = p.u1 - p.u0, w = p.w1 - p.w0, h = p.height;
  const house = new THREE.Group();
  const body = texturedBox(l, h, w, mat.wall, 3);
  body.position.y = h / 2;
  const cornice = texturedBox(l + 0.5, 0.35, w + 0.5, mat.stone, 3);
  cornice.position.y = h - 0.18;
  const step = texturedBox(l + 0.8, 0.2, w + 0.8, mat.stone, 3);
  step.position.y = 0.1;
  const footing = texturedBox(l + 0.8, 3, w + 0.8, mat.stone, 3);
  footing.position.y = -1.5;
  house.add(body, cornice, step, footing);
  // Front (+u side): door, columns, a cross on the roof.
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.7), mat.iron);
  door.position.set(l / 2 + 0.02, 1.35, 0);
  door.rotation.y = Math.PI / 2;
  house.add(door);
  for (const s of [-1, 1]) {
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, h - 0.5, 10), mat.stone);
    column.position.set(l / 2 + 0.3, (h - 0.5) / 2, s * 1.5);
    column.castShadow = true;
    house.add(column);
  }
  const cross = new THREE.Mesh(mergeGeometries([new THREE.BoxGeometry(0.12, 0.9, 0.12), new THREE.BoxGeometry(0.12, 0.12, 0.6).translate(0, 0.15, 0)]), mat.stone);
  cross.position.set(l / 2 - 0.3, h + 0.45, 0);
  house.add(cross);
  return placed(house, p);
}

// Pedestal (solid) with a statue on top.
function buildMonument(p, mat) {
  const monument = new THREE.Group();
  const base = texturedBox(1.9, 0.3, 1.9, mat.stone, 2);
  base.position.y = 0.15;
  const pedestal = texturedBox(1.6, 1.6, 1.6, mat.stone, 2);
  pedestal.position.y = 0.8;
  const footing = texturedBox(1.9, 2, 1.9, mat.stone, 2);
  footing.position.y = -1;
  monument.add(base, pedestal, footing);
  const add = (geo, x, y, z, rz = 0) => {
    const mesh = new THREE.Mesh(geo, mat.stone);
    mesh.position.set(x, y, z);
    mesh.rotation.z = rz;
    mesh.castShadow = true;
    monument.add(mesh);
  };
  if (p.statue === 0) {          // angel
    add(new THREE.ConeGeometry(0.5, 1.9, 10), 0, 2.55, 0);
    add(new THREE.SphereGeometry(0.22, 12, 8), 0, 3.6, 0);
    add(new THREE.ConeGeometry(0.28, 1.5, 3), -0.42, 3.0, -0.22, 2.75);   // folded wings
    add(new THREE.ConeGeometry(0.28, 1.5, 3), 0.42, 3.0, -0.22, -2.75);
  } else if (p.statue === 1) {   // tall cross
    add(new THREE.BoxGeometry(0.3, 2.8, 0.3), 0, 3.0, 0);
    add(new THREE.BoxGeometry(1.5, 0.3, 0.3), 0, 3.6, 0);
  } else {                       // urn
    add(new THREE.CylinderGeometry(0.2, 0.35, 0.5, 10), 0, 1.85, 0);
    add(new THREE.SphereGeometry(0.55, 14, 10), 0, 2.55, 0);
    add(new THREE.CylinderGeometry(0.3, 0.2, 0.25, 10), 0, 3.1, 0);
  }
  return placed(monument, p);
}

// Chapel: nave (the solid part is 13 x 24 x 9) with a tall tower and spire at one end.
function buildChapel(p, mat) {
  const chapel = new THREE.Group();
  const nave = texturedBox(13, 9, 24, mat.wall);
  nave.position.y = 4.5;
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-7, 0); roofShape.lineTo(0, 4.5); roofShape.lineTo(7, 0); roofShape.closePath();
  const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(roofShape, { depth: 25, bevelEnabled: false }), mat.stone);
  roof.position.set(0, 9, -12.5);
  roof.castShadow = true;
  const tower = texturedBox(6, 22, 6, mat.wall);
  tower.position.set(0, 11, 9);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(4.6, 12, 4), mat.stone);
  spire.position.set(0, 28, 9);
  spire.rotation.y = Math.PI / 4;
  const door = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 4), mat.iron);
  door.position.set(0, 2, 12.03);
  const footing = texturedBox(13.6, 5, 24.6, mat.stone);
  footing.position.y = -2.5;
  chapel.add(nave, roof, tower, spire, door, footing);
  for (const [x, y, z, ry] of [[0, 17, 12.03, 0], [6.53, 5, -6, Math.PI / 2], [6.53, 5, 0, Math.PI / 2], [-6.53, 5, -6, -Math.PI / 2], [-6.53, 5, 0, -Math.PI / 2]]) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.8), mat.window);
    win.position.set(x, y, z);
    win.rotation.y = ry;
    chapel.add(win);
  }
  return placed(chapel, p);
}

// Street lamp. The real lights are a small pool moved between the nearest lamps (see arena.js).
function buildLamp(p, mat) {
  const lamp = new THREE.Group();
  const pole = new THREE.Mesh(mergeGeometries([
    tubeGeometry(new THREE.Vector3(0, -1.5, 0), new THREE.Vector3(0, 7, 0), 0.09),
    tubeGeometry(new THREE.Vector3(0, 7, 0), new THREE.Vector3(-1.6, 6.8, -1.6), 0.06),
    new THREE.CylinderGeometry(0.2, 0.26, 0.5, 8).translate(0, 0.25, 0),
  ]), mat.iron);
  pole.castShadow = true;
  const bulb = new THREE.Mesh(shared(BULB), mat.bulb);
  bulb.position.set(-1.6, 6.7, -1.6);
  const flare = new THREE.Sprite(mat.flare);
  flare.position.copy(bulb.position);
  flare.scale.setScalar(5);
  lamp.add(pole, bulb, flare);
  lamp.position.set(p.x, p.y0, p.z);
  return lamp;
}
const BULB = new THREE.SphereGeometry(0.22, 10, 8);
