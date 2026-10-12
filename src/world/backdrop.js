// What is beyond where you can go: only ever looked at.
//   the Cemetery   a painted horizon all the way round (two rings of it, one behind the other): hills, a town with
//                  its church, a ruined abbey, a castle on a crag, a windmill; nearer, a dead wood, a manor, graves
//   the Moon       the plain the crater sits in, out to the mountains, with what else is out there: another base, a
//                  rocket on its pad, a great dish, a field of panels, a rover at the end of its tracks, boulders
// (The Long Way Down's is in descentScene.js, with the rest of the hill.)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MOON, WALL_AT, moonHeight, daylight } from './moon.js';
import { seededRandom } from './random.js';
import { regolithTexture } from './textures.js';
import { tube, paint, noise } from '../enemies/sculpt.js';
import { decor } from './scenery.js';

const PI = Math.PI;
const canvas = (w, h, draw) => { const c = Object.assign(document.createElement('canvas'), { width: w, height: h }); draw(c.getContext('2d'), w, h); return c; };
const textured = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 4; return t; };
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

// ---- The Cemetery's horizon ----
// A ring of painted skyline: `draw(g, w, y0)` paints its silhouettes standing on the line y0; below that it is the
// colour of the fog (`horizon`), so it meets the ground without a seam, and it thins to that colour toward its foot.
function ring(radius, tall, horizon, ink, draw, hazy = true) {
  const map = textured(canvas(4096, 512, (g, w, h) => {
    const y0 = h * 0.5, haze = g.createLinearGradient(0, y0 - 210, 0, y0);   // the sky is paler low down, so what stands on the horizon shows against it
    haze.addColorStop(0, 'rgba(74,98,150,0)');
    haze.addColorStop(1, 'rgba(92,120,180,0.75)');
    g.fillStyle = haze;
    if (hazy) g.fillRect(0, y0 - 210, w, 210);
    g.fillStyle = ink;
    g.strokeStyle = ink;
    draw(g, w, y0);
    const mist = g.createLinearGradient(0, y0 - 50, 0, y0);   // mist at its foot
    mist.addColorStop(0, 'rgba(0,0,0,0)');
    mist.addColorStop(1, hex(horizon));
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = mist;
    g.fillRect(0, y0 - 50, w, 52);
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = hex(horizon);
    g.fillRect(0, y0, w, h - y0);
  }));
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, tall, 64, 1, true), new THREE.MeshBasicMaterial({ map, transparent: true, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false }));
  mesh.frustumCulled = false;
  return mesh;
}
// Things to paint on it. (x, y: where it stands. s: its size.)
const lit = (g, x, y, w = 2.2, h = 3, color = '#ffcf7a') => { const was = g.fillStyle; g.fillStyle = color; g.fillRect(x, y, w, h); g.fillStyle = was; };
function bareTree(g, x, y, s, rand) {
  const grow = (x, y, a, len, wide, depth) => {
    const ex = x + Math.sin(a) * len, ey = y - Math.cos(a) * len;
    g.lineWidth = wide;
    g.beginPath(); g.moveTo(x, y); g.lineTo(ex, ey); g.stroke();
    if (depth) for (let i = 0; i < 2 + (rand() < 0.4 ? 1 : 0); i++) grow(ex, ey, a + (rand() - 0.5) * 1.5, len * (0.62 + rand() * 0.16), Math.max(0.6, wide * 0.6), depth - 1);
  };
  g.lineCap = 'round';
  grow(x, y, (rand() - 0.5) * 0.2, s * 0.34, s * 0.07, 5);
}
function house(g, x, y, w, h, rand, windows = true) {
  g.fillRect(x, y - h, w, h);
  g.beginPath(); g.moveTo(x - 2, y - h); g.lineTo(x + w / 2, y - h - w * 0.55); g.lineTo(x + w + 2, y - h); g.fill();
  g.fillRect(x + w * 0.68, y - h - w * 0.5, w * 0.14, w * 0.4);                                              // a chimney
  if (windows) for (let wx = x + 3; wx < x + w - 4; wx += 6) if (rand() < 0.35) lit(g, wx, y - h * (0.35 + 0.4 * rand()), 2.4, 3.2);
}
function church(g, x, y, s, rand) {
  g.fillRect(x, y - s * 0.42, s * 0.8, s * 0.42);
  g.beginPath(); g.moveTo(x - 2, y - s * 0.42); g.lineTo(x + s * 0.4, y - s * 0.68); g.lineTo(x + s * 0.8 + 2, y - s * 0.42); g.fill();
  g.fillRect(x + s * 0.8, y - s * 0.85, s * 0.22, s * 0.85);                                                  // the tower
  g.beginPath(); g.moveTo(x + s * 0.78, y - s * 0.85); g.lineTo(x + s * 0.91, y - s * 1.5); g.lineTo(x + s * 1.04, y - s * 0.85); g.fill();
  g.fillRect(x + s * 0.9, y - s * 1.6, 1.4, s * 0.14); g.fillRect(x + s * 0.875, y - s * 1.56, s * 0.07, 1.4);   // its cross
  for (let i = 0; i < 4; i++) lit(g, x + s * (0.1 + i * 0.17), y - s * 0.3, 2.6, s * 0.16, i === 2 ? '#a8ccff' : '#ffcf7a');
  lit(g, x + s * 0.88, y - s * 0.7, 3, 5, '#ffcf7a');
}
function castle(g, x, y, s) {
  g.beginPath(); g.moveTo(x - s * 0.9, y); g.lineTo(x - s * 0.3, y - s * 0.75); g.lineTo(x + s * 0.5, y - s * 0.8); g.lineTo(x + s * 1.1, y); g.fill();   // the crag
  const top = y - s * 0.78;
  g.fillRect(x - s * 0.28, top - s * 0.36, s * 0.75, s * 0.4);
  for (const [tx, tw, th] of [[-0.34, 0.16, 0.7], [0.36, 0.18, 0.86], [0.02, 0.14, 0.56]]) {
    g.fillRect(x + s * tx, top - s * th, s * tw, s * th);
    for (let k = 0; k < 3; k++) g.fillRect(x + s * tx + (k * s * tw) / 2.6, top - s * th - 3, s * tw * 0.22, 3);   // battlements
  }
  g.beginPath(); g.moveTo(x + s * 0.34, top - s * 0.86); g.lineTo(x + s * 0.45, top - s * 1.2); g.lineTo(x + s * 0.56, top - s * 0.86); g.fill();
  lit(g, x + s * 0.42, top - s * 0.66, 2.6, 4, '#ff9a5a');
}
function abbey(g, x, y, s) {   // a ruin: a gable with its great window empty, and a row of broken arches
  g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - s * 0.7); g.lineTo(x + s * 0.18, y - s); g.lineTo(x + s * 0.36, y - s * 0.62); g.lineTo(x + s * 0.36, y); g.fill();
  g.globalCompositeOperation = 'destination-out';
  g.beginPath(); g.moveTo(x + s * 0.1, y - s * 0.2); g.lineTo(x + s * 0.1, y - s * 0.55); g.quadraticCurveTo(x + s * 0.18, y - s * 0.78, x + s * 0.26, y - s * 0.55); g.lineTo(x + s * 0.26, y - s * 0.2); g.fill();
  g.globalCompositeOperation = 'source-over';
  for (let k = 0; k < 5; k++) {
    const ax = x + s * (0.42 + k * 0.2), tall = s * (0.5 - 0.07 * ((k * 3) % 4));
    g.fillRect(ax, y - tall, s * 0.05, tall);
    if (k < 4 && k !== 2) { g.lineWidth = s * 0.04; g.beginPath(); g.arc(ax + s * 0.125, y - tall + s * 0.06, s * 0.1, PI, 0); g.stroke(); }
  }
}
function windmill(g, x, y, s, turn) {
  g.beginPath(); g.moveTo(x - s * 0.16, y); g.lineTo(x - s * 0.09, y - s * 0.7); g.lineTo(x + s * 0.09, y - s * 0.7); g.lineTo(x + s * 0.16, y); g.fill();
  g.beginPath(); g.arc(x, y - s * 0.7, s * 0.1, PI, 0); g.fill();
  g.lineWidth = 1.6;
  for (let k = 0; k < 4; k++) { const a = turn + k * PI / 2; g.beginPath(); g.moveTo(x, y - s * 0.72); g.lineTo(x + Math.cos(a) * s * 0.55, y - s * 0.72 + Math.sin(a) * s * 0.55); g.stroke(); g.save(); g.translate(x, y - s * 0.72); g.rotate(a); g.fillRect(s * 0.16, 0, s * 0.38, s * 0.07); g.restore(); }
}
// A line of hills right round: it comes back to where it started. (bumps: how many, and how big.)
const hills = (g, w, y0, tall, bumps, seed) => {
  const at = (x) => { let y = 0; bumps.forEach(([n, a], i) => { y += a * (0.5 + 0.5 * Math.sin((x / w) * PI * 2 * n + seed * (i + 1.7))); }); return y0 - tall * y; };
  g.beginPath(); g.moveTo(0, y0 + 2);
  for (let x = 0; x <= w; x += 8) g.lineTo(x, at(x));
  g.lineTo(w, y0 + 2); g.fill();
  return at;
};

export function buildCemeteryBackdrop(horizon) {
  const group = new THREE.Group(), rand = seededRandom(1888);
  // Far off: two ranges of hills, and on them a town, an abbey, a castle, a windmill.
  group.add(ring(760, 560, horizon, '#141b29', (g, w, y0) => {
    g.fillStyle = '#131a28';
    hills(g, w, y0, 70, [[3, 0.5], [7, 0.3], [17, 0.14], [41, 0.06]], 2.1);
    g.fillStyle = g.strokeStyle = '#0b1019';
    const at = hills(g, w, y0, 46, [[2, 0.45], [5, 0.3], [13, 0.18], [29, 0.07]], 0.6);
    castle(g, 620, at(620) + 8, 56);
    abbey(g, 1500, at(1560) + 4, 70);
    for (let i = 0; i < 16; i++) { const x = 2280 + i * 17 + rand() * 6; house(g, x, at(x) + 3, 12 + rand() * 8, 9 + rand() * 9, rand); }   // the town...
    church(g, 2420, at(2440) + 2, 40, rand);                                                                                               // ...and its church
    windmill(g, 3300, at(3300) + 2, 46, 0.5);
    for (let i = 0; i < 5; i++) { const x = 3700 + i * 26; g.fillRect(x, at(x) - 16 - (i % 2) * 6, 5 + (i % 3) * 2, 20 + (i % 2) * 6); }   // standing stones
    g.fillRect(3760, at(3770) - 30, 60, 5);
    for (let i = 0; i < 26; i++) { const x = (i * 163 + 40) % w; bareTree(g, x, at(x) + 2, 22 + rand() * 18, rand); }
    for (let i = 0; i < 9; i++) { const x = 980 + i * 13 + rand() * 5; house(g, x, at(x) + 3, 10 + rand() * 6, 8 + rand() * 6, rand); }      // a hamlet under the castle
  }));
  // Nearer: a rise with a dead wood along it, a manor with its lights on, a gibbet, old graves, a fence.
  group.add(ring(470, 330, horizon, '#0d121b', (g, w, y0) => {
    const at = hills(g, w, y0, 26, [[4, 0.4], [9, 0.3], [23, 0.2], [61, 0.08]], 4.4);
    for (let i = 0; i < 150; i++) { const x = rand() * w; if (x > 1880 && x < 2140) continue; bareTree(g, x, at(x) + 2, 26 + rand() * 46, rand); }
    { const x = 1930, y = at(2000) + 4;                                                                         // the manor
      g.fillRect(x, y - 40, 150, 40); house(g, x - 8, y, 46, 52, rand, false); house(g, x + 112, y, 46, 52, rand, false);
      g.beginPath(); g.moveTo(x - 2, y - 40); g.lineTo(x + 75, y - 62); g.lineTo(x + 152, y - 40); g.fill();
      for (let k = 0; k < 5; k++) g.fillRect(x + 12 + k * 30, y - 74 + (k % 2) * 6, 5, 18);
      for (let r = 0; r < 2; r++) for (let k = 0; k < 11; k++) if ((k * 7 + r * 3) % 5 < 2) lit(g, x - 2 + k * 13.6, y - 34 + r * 16, 4, 7, k === 4 ? '#a8ccff' : '#ffcf7a');
      lit(g, x + 9, y - 60, 4, 6, '#ff9a5a'); }
    { const x = 3050, y = at(x) + 2; g.fillRect(x, y - 62, 4, 62); g.fillRect(x, y - 62, 34, 4); g.lineWidth = 2; g.beginPath(); g.moveTo(x, y - 46); g.lineTo(x + 16, y - 62); g.stroke(); g.lineWidth = 1; g.beginPath(); g.moveTo(x + 30, y - 60); g.lineTo(x + 30, y - 42); g.stroke(); g.beginPath(); g.ellipse(x + 30, y - 38, 3, 5, 0, 0, PI * 2); g.stroke(); }   // a gibbet, and its rope
    for (let i = 0; i < 90; i++) {                                                                              // graves up the rise
      const x = (2400 + rand() * 560) % w, y = at(x) + 3, s = 6 + rand() * 6;
      if (i % 3) { g.fillRect(x, y - s * 1.6, 1.6, s * 1.6); g.fillRect(x - s * 0.35, y - s * 1.2, s * 0.8, 1.6); } else { g.fillRect(x - s * 0.4, y - s, s * 0.8, s); g.beginPath(); g.arc(x, y - s, s * 0.4, PI, 0); g.fill(); }
    }
    g.lineWidth = 1;
    for (let x = 200; x < 1700; x += 9) { const y = at(x) + 2; g.fillRect(x, y - 13, 1.2, 13); if (x % 81 < 9) g.fillRect(x - 1, y - 18, 3.4, 18); }   // an iron fence
    for (let x = 200; x < 1690; x += 9) { g.beginPath(); g.moveTo(x, at(x) - 9); g.lineTo(x + 9, at(x + 9) - 9); g.stroke(); }
    g.fillStyle = '#0d121b';
    for (let i = 0; i < 40; i++) { const x = 2700 + rand() * 500, y = y0 - 110 - rand() * 90, s = 2 + rand() * 2.5; g.beginPath(); g.moveTo(x - s * 2, y - s * 0.6); g.quadraticCurveTo(x - s, y - s * 1.4, x, y); g.quadraticCurveTo(x + s, y - s * 1.4, x + s * 2, y - s * 0.6); g.lineWidth = 1.2; g.stroke(); }   // crows over it
  }, false));
  group.renderOrder = -1;
  group.traverse((o) => { o.renderOrder = -1; });
  return group;
}

// ---- Outside the Moon's crater ----
const smooth = (k) => { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); };
const FAR = [[640, 0.4, 150, 26], [820, 2.2, 210, 34], [560, 3.6, 120, 20], [900, 4.9, 260, 40], [700, 5.7, 110, 18], [1050, 1.3, 180, 30]].map(([r, a, size, deep]) => ({ x: Math.cos(a) * r, z: Math.sin(a) * r, size, deep }));   // craters out on the plain
// How high the ground is out there. Up to the lip it is the arena's own; then mountains come up, further off.
export function outsideHeight(x, z) {
  const dx = x - MOON.x, dz = z - MOON.z, r = Math.hypot(dx, dz), far = smooth((r - 430) / 280);
  let h = moonHeight(x, z, true) - 0.35 * (1 - far);   // (a little under the detailed ground where the two overlap)
  h += far * (Math.max(0, noise(dx / 300 + 9, 1.5, dz / 300)) * 230 + noise(dx / 110, 4, dz / 110) * 34 + noise(dx / 37, 8, dz / 37) * 7);
  h += smooth((r - 900) / 500) * 150 * (0.55 + 0.45 * noise(Math.atan2(dz, dx) * 2.2, 3, 0.5));   // the ranges at the horizon
  for (const c of FAR) {
    const d = Math.hypot(dx - c.x, dz - c.z) / c.size;
    if (d < 1.9) h += (d < 1 ? -c.deep * (1 - d * d) ** 1.4 : 0) + c.deep * 0.3 * Math.exp(-(((d - 1) / 0.22) ** 2));
  }
  return h;
}

export function buildMoonOutside() {
  const group = new THREE.Group(), rand = seededRandom(1969);
  // The ground: rings of it from the lip of the crater out to the horizon, closer together near to.
  const RINGS = 56, AROUND = 220, R0 = WALL_AT + 0.4, R1 = 1700, pos = [], col = [], uv = [], idx = [];
  for (let j = 0; j <= RINGS; j++) {
    const r = R0 + (R1 - R0) * (j / RINGS) ** 1.7;
    for (let i = 0; i <= AROUND; i++) {
      const a = (i / AROUND) * PI * 2, x = MOON.x + Math.cos(a) * r, z = MOON.z + Math.sin(a) * r, y = outsideHeight(x, z);
      pos.push(x, y, z);
      uv.push(x / 14, z / 14);
      const k = (0.42 + 0.58 * daylight(x, z)) * (0.9 + 0.1 * noise(x / 60, 2, z / 60));
      col.push(k, k, k);
    }
  }
  for (let j = 0; j < RINGS; j++) for (let i = 0; i < AROUND; i++) { const a = j * (AROUND + 1) + i, b = a + 1, c = a + AROUND + 1; idx.push(a, b, c, b, c + 1, c); }
  const ground = new THREE.BufferGeometry();
  ground.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  ground.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  ground.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  ground.setIndex(idx);
  ground.computeVertexNormals();
  // (No fog on any of it: there is no air out there to hide it in.)
  group.add(new THREE.Mesh(ground, new THREE.MeshStandardMaterial({ map: regolithTexture(), color: 0x9b9a9c, roughness: 1, vertexColors: true, fog: false })));

  // Boulders, all the way out.
  const rocks = [];
  for (let i = 0; i < 260; i++) { const a = rand() * PI * 2, r = WALL_AT + 14 + rand() * rand() * 900, size = 1.5 + rand() * rand() * 13; rocks.push([MOON.x + Math.cos(a) * r, MOON.z + Math.sin(a) * r, size, rand() * 6, 0.5 + rand() * 0.5]); }
  const boulders = new THREE.InstancedMesh(decor().rock, new THREE.MeshStandardMaterial({ map: regolithTexture(), color: 0x8a898c, roughness: 1, flatShading: true, fog: false }), rocks.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), s = new THREE.Vector3();
  rocks.forEach(([x, z, size, turn, flat], i) => boulders.setMatrixAt(i, m.compose(v.set(x, outsideHeight(x, z) + size * 0.15, z), q.setFromAxisAngle(up, turn), s.set(size, size * flat, size * 0.85))));
  group.add(boulders);

  // What people left out there. Each is built where it stands: at(bearing, how far) gives the place.
  const HULL = 0xe2e3e8, GREY = 0x8e9098, DARK = 0x2b2c31, FOIL = 0xd9ad3e, RED = 0xc8201b, BLUE = 0x24408c, pieces = [], lights = [];
  const box = (w, h, d, color, at, turn = 0) => paint(new THREE.BoxGeometry(w, h, d).rotateY(turn).translate(...at), color);
  const turned = (profile, color, at, around = 20) => paint(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), around).translate(...at), color);
  const place = (bearing, far) => { const x = MOON.x + Math.cos(bearing) * far, z = MOON.z + Math.sin(bearing) * far; return [x, outsideHeight(x, z), z]; };
  const lamp = (at, color, size = 1) => lights.push(paint(new THREE.SphereGeometry(size, 8, 6).translate(...at), color));
  { // A rocket on its pad, with the tower it was fuelled from.
    const [x, y, z] = place(-0.85, 560);
    pieces.push(paint(new THREE.CylinderGeometry(26, 30, 3, 8).translate(x, y + 1.5, z), GREY),
      turned([[0, 4], [3.2, 4], [4.2, 9], [4.2, 46], [3.6, 54], [2.4, 62], [0.8, 70], [0, 72]], HULL, [x, y, z]),
      paint(new THREE.CylinderGeometry(4.25, 4.25, 4, 20, 1, true).translate(x, y + 30, z), DARK), paint(new THREE.CylinderGeometry(4.25, 4.25, 2, 20, 1, true).translate(x, y + 44, z), RED),
      turned([[1.2, 4.2], [2.6, 2.2], [2.9, 1.6], [2.5, 1.6]], DARK, [x, y + 0.6, z], 12),
      ...[0, 1, 2, 3].map((k) => paint(new THREE.BoxGeometry(0.4, 12, 6).translate(0, 6, 6.4).rotateY(k * PI / 2 + PI / 4).translate(x, y + 3, z), k % 2 ? RED : HULL)),   // fins
      ...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => tube([[x + 16 + a * 3, y + 3, z + b * 3], [x + 16 + a * 2.2, y + 66, z + b * 2.2]], [0.4, 0.3], GREY, { sides: 4 })),   // the tower's legs...
      ...Array.from({ length: 10 }, (_, k) => [tube([[x + 13, y + 6 + k * 6, z - 3], [x + 19, y + 12 + k * 6, z + 3]], [0.18, 0.18], GREY, { sides: 3 }), tube([[x + 19, y + 6 + k * 6, z - 3], [x + 13, y + 12 + k * 6, z + 3]], [0.18, 0.18], GREY, { sides: 3 })]).flat(),   // ...and lattice
      ...[22, 40, 58].map((h) => box(13, 1, 2.4, GREY, [x + 9, y + h, z])),                                    // arms across to it
      paint(new THREE.SphereGeometry(7, 12, 8).translate(x - 34, y + 7, z + 12), HULL), paint(new THREE.SphereGeometry(5, 12, 8).translate(x - 30, y + 5, z - 14), HULL), tube([[x - 34, y + 2, z + 12], [x - 12, y + 2.5, z + 5], [x - 3, y + 4, z]], [0.6, 0.6, 0.6], DARK, { sides: 5, steps: 4 }));   // fuel
    lamp([x + 16, y + 68, z], 0xff3a2a, 1.4); lamp([x + 13, y + 3.5, z - 20], 0xfff2c8, 1.6); lamp([x - 14, y + 3.5, z + 22], 0xfff2c8, 1.6); lamp([x, y + 72.5, z], 0xff3a2a, 0.9);
  }
  { // The other base: three domes joined by tubes, lit from inside, a mast.
    const [x, y, z] = place(2.5, 500);
    for (const [ox, oz, r] of [[0, 0, 22], [38, 12, 15], [-30, 26, 17]]) {
      pieces.push(paint(new THREE.SphereGeometry(r, 20, 10, 0, PI * 2, 0, PI / 2).translate(x + ox, y - 1, z + oz), HULL),
        ...Array.from({ length: 8 }, (_, k) => tube(Array.from({ length: 6 }, (_, n) => { const e = (n / 5) * PI / 2; return [x + ox + Math.cos(k * PI / 4) * Math.cos(e) * r * 1.005, y - 1 + Math.sin(e) * r * 1.005, z + oz + Math.sin(k * PI / 4) * Math.cos(e) * r * 1.005]; }), [0.35, 0.35], GREY, { sides: 4, steps: 2 })),
        paint(new THREE.CylinderGeometry(r * 1.04, r * 1.08, 2.4, 20).translate(x + ox, y, z + oz), GREY));
      for (let k = 0; k < 9; k++) { const a = k * 0.7 + ox; lamp([x + ox + Math.cos(a) * r * 0.93, y + r * 0.34, z + oz + Math.sin(a) * r * 0.93], k % 3 ? 0xffe2a8 : 0x9fdcff, 0.9); }
    }
    pieces.push(tube([[x + 20, y + 3, z + 6], [x + 26, y + 3, z + 8]], [3.2, 3.2], HULL, { sides: 10 }), tube([[x - 18, y + 3, z + 14], [x - 20, y + 3, z + 16]], [3.2, 3.2], HULL, { sides: 10 }),
      tube([[x + 6, y, z - 34], [x + 6, y + 48, z - 34]], [0.5, 0.2], GREY, { sides: 5 }), ...[18, 30, 40].map((h) => tube([[x + 1, y + h, z - 34], [x + 11, y + h, z - 34]], [0.15, 0.15], GREY, { sides: 3 })),
      ...Array.from({ length: 6 }, (_, k) => box(11, 0.4, 5, BLUE, [x + 60 + (k % 3) * 14, y + 3.5, z - 20 - Math.floor(k / 3) * 9], 0)), ...Array.from({ length: 6 }, (_, k) => tube([[x + 60 + (k % 3) * 14, y, z - 20 - Math.floor(k / 3) * 9], [x + 60 + (k % 3) * 14, y + 3.4, z - 20 - Math.floor(k / 3) * 9]], [0.3, 0.3], GREY, { sides: 4 })));
    lamp([x + 6, y + 48.6, z - 34], 0xff3a2a, 1.1);
  }
  { // A great dish, listening.
    const [x, y, z] = place(0.75, 640);
    pieces.push(paint(new THREE.SphereGeometry(36, 24, 8, 0, PI * 2, 0, 0.7).rotateX(PI).translate(0, 36, 0).rotateX(-0.6).rotateY(0.9).translate(x, y + 34, z), HULL),
      ...[0, 1, 2].map((k) => tube([[x + Math.cos(k * 2.09) * 16, y, z + Math.sin(k * 2.09) * 16], [x, y + 30, z]], [0.9, 0.6], GREY, { sides: 5 })),
      ...[0, 1, 2].map((k) => tube([[x + Math.cos(k * 2.09) * 16, y + 0.5, z + Math.sin(k * 2.09) * 16], [x + Math.cos(k * 2.09 + 2.09) * 16, y + 0.5, z + Math.sin(k * 2.09 + 2.09) * 16]], [0.4, 0.4], GREY, { sides: 4 })),
      box(8, 5, 6, GREY, [x + 24, y + 2.5, z + 6], 0.4));
    lamp([x, y + 31.5, z], 0xff3a2a, 0.9);
  }
  { // A rover that got this far: six wheels, a mast, a dish, and the tracks it made coming.
    const [x, y, z] = place(4.3, 350);
    pieces.push(box(5, 1.6, 3.2, FOIL, [x, y + 2.2, z], 0.5), box(3, 0.3, 4.4, BLUE, [x, y + 3.4, z], 0.5), tube([[x, y + 3, z], [x + 0.6, y + 6.4, z + 0.3]], [0.14, 0.08], GREY, { sides: 4 }), box(0.9, 0.6, 0.6, HULL, [x + 0.6, y + 6.6, z + 0.3], 0.5),
      paint(new THREE.SphereGeometry(1.1, 10, 5, 0, PI * 2, 0, PI / 2).rotateX(PI + 0.5).translate(x - 1.6, y + 4.6, z - 0.6), HULL),
      ...[-1.9, 0, 1.9].flatMap((along) => [-1, 1].map((side) => paint(new THREE.CylinderGeometry(0.9, 0.9, 0.7, 12).rotateX(PI / 2).translate(along, 0, side * 2.1).rotateY(0.5).translate(x, y + 0.9, z), DARK))));
    for (const side of [-1, 1]) pieces.push(tube(Array.from({ length: 14 }, (_, k) => { const px = x - 4 - k * 9 + Math.sin(0.5) * side * 2.1 * 0, pz = z + 2 + k * 4.6 + Math.sin(k * 0.6) * 5 + side * 2.1; return [px, outsideHeight(px, pz) + 0.12, pz]; }), [0.45, 0.45], 0x4a4a4e, { sides: 3, steps: 3, squash: 0.15 }));
  }
  { // Somebody's flag, and what they came in, on the rim of a crater out west.
    const [x, y, z] = place(3.45, 420);
    pieces.push(paint(new THREE.CylinderGeometry(3.4, 3.9, 2.4, 8).translate(x, y + 3.6, z), FOIL), paint(new THREE.CylinderGeometry(2.2, 2.8, 2.6, 8).translate(x, y + 6, z), HULL),
      ...[0, 1, 2, 3].map((k) => tube([[x + Math.cos(k * 1.57 + 0.78) * 3.2, y + 3.4, z + Math.sin(k * 1.57 + 0.78) * 3.2], [x + Math.cos(k * 1.57 + 0.78) * 6.4, y + 0.2, z + Math.sin(k * 1.57 + 0.78) * 6.4]], [0.16, 0.16], GREY, { sides: 4 })),
      tube([[x + 10, y, z + 4], [x + 10, y + 5, z + 4]], [0.06, 0.06], HULL, { sides: 4 }), box(2.4, 1.4, 0.05, RED, [x + 11.2, y + 4.3, z + 4], 0));
  }
  const built = new THREE.Mesh(mergeGeometries(pieces), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, fog: false }));
  const glow = new THREE.Mesh(mergeGeometries(lights), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, toneMapped: false }));
  group.add(built, glow);
  group.traverse((o) => { o.frustumCulled = false; });
  return group;
}
