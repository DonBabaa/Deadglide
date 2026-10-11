// The Long Way Down: everything you ride past. None of it can be touched (what you ride over is world/descent.js);
// it is here to make the hill somewhere.
//   the city       two rows of buildings with lit windows either side of the street, shop signs, street lamps,
//                  parked cars, palms, strings of lights across the road
//   the cemetery   its gates, crosses and slabs in rows up both slopes, mausoleums, bare trees, an iron fence, a chapel
//   the drain      a portal at each end, concrete ribs overhead with lamps under them, pipes along the walls, outfalls
//   the hillside   pines and boulders up the slopes, marker posts down the edges, a line of pylons
//   far off        a ring of skyline and the lights of the town below, all the way round
// Built once, out of instanced meshes: a few dozen draw calls for the whole three kilometres.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DESCENT, descentHeight } from './descent.js';
import { seededRandom } from './random.js';
import { glowTexture } from './textures.js';

const X0 = 48, Z0 = 48, D = DESCENT;
const H = (x, s) => descentHeight(X0 + x, Z0 - s);            // the ground, `x` from the middle of the course, `s` down it
const tilt = (x, s) => Math.atan(H(x, s + 1) - H(x, s));      // how far something lying down the hill there is tipped

// One instanced mesh from a list of { x, y, z (y: its middle), sx, sy, sz, rx, ry, rz, color }: x and s as above.
const m4 = new THREE.Matrix4(), quat = new THREE.Quaternion(), euler = new THREE.Euler(), at = new THREE.Vector3(), size = new THREE.Vector3(), tint = new THREE.Color();
function instanced(geometry, material, list) {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, list.length));
  list.forEach((o, i) => {
    quat.setFromEuler(euler.set(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ'));
    mesh.setMatrixAt(i, m4.compose(at.set(X0 + o.x, o.y, Z0 - o.s), quat, size.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1)));
    if (o.color !== undefined) mesh.setColorAt(i, tint.set(o.color));
  });
  mesh.count = list.length;
  mesh.frustumCulled = false;   // (its instances are spread down the whole hill)
  return mesh;
}
const canvas = (w, h, draw) => { const c = Object.assign(document.createElement('canvas'), { width: w, height: h }); draw(c.getContext('2d'), w, h); return c; };
const textured = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };

// A building's wall: `cols` x `rows` windows, some lit. Returns [what it looks like, what glows].
function wallTextures(cols, rows, rand) {
  const W = 256, Hh = 512, cw = W / cols, rh = Hh / rows, lights = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) lights.push(rand() < 0.42 ? (rand() < 0.15 ? '#a8ccff' : rand() < 0.5 ? '#ffd98a' : '#ffbf6a') : null);
  const paint = (g, glow) => {
    g.fillStyle = glow ? '#000' : '#d9d2c4';
    g.fillRect(0, 0, W, Hh);
    if (!glow) { g.fillStyle = 'rgba(0,0,0,0.12)'; for (let r = 0; r <= rows; r++) g.fillRect(0, r * rh - 2, W, 4); }
    lights.forEach((lit, i) => {
      const x = (i % cols) * cw + cw * 0.22, y = Math.floor(i / cols) * rh + rh * 0.2;
      if (glow && !lit) return;
      g.fillStyle = lit || '#191c24';
      g.fillRect(x, y, cw * 0.56, rh * 0.6);
    });
  };
  return [textured(canvas(W, Hh, (g) => paint(g, false))), textured(canvas(W, Hh, (g) => paint(g, true)))];
}

// The far skyline: hills, towers with lit windows along them, and the lights of the town spread out below.
function skylineTexture(rand) {
  return textured(canvas(2048, 512, (g, w, h) => {
    const horizon = h * 0.3;   // (from the top)
    g.fillStyle = '#0d1420';
    g.beginPath(); g.moveTo(0, h);
    for (let x = 0; x <= w; x += 16) g.lineTo(x, horizon - 26 - 22 * Math.sin((x / w) * Math.PI * 6) - 14 * Math.sin((x / w) * Math.PI * 22 + 1));
    g.lineTo(w, h); g.fill();
    g.fillStyle = '#0a0f18';
    g.fillRect(0, horizon, w, h);
    for (let x = 0; x < w;) {   // towers
      const bw = 10 + rand() * 26, bh = 14 + rand() * rand() * 90;
      g.fillStyle = '#080c14';
      g.fillRect(x, horizon - bh, bw, bh + 4);
      for (let wy = horizon - bh + 4; wy < horizon - 2; wy += 6) for (let wx = x + 2; wx < x + bw - 3; wx += 5) {
        if (rand() < 0.3) { g.fillStyle = rand() < 0.2 ? '#a8ccff' : '#ffcf7a'; g.fillRect(wx, wy, 2.4, 3); }
      }
      x += bw + rand() * 8;
    }
    for (let i = 0; i < 2600; i++) {   // the town below: thick near the horizon, thinning out
      const y = horizon + 4 + rand() * rand() * (h - horizon - 60), bright = 0.25 + rand() * 0.75;
      g.fillStyle = rand() < 0.12 ? `rgba(168,204,255,${bright})` : rand() < 0.1 ? `rgba(255,90,70,${bright})` : `rgba(255,207,122,${bright})`;
      g.fillRect(rand() * w, y, 1.6 + rand() * 1.6, 1.6);
    }
  }));
}

export function buildDescentScene() {
  const group = new THREE.Group(), rand = seededRandom(90210);
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const matt = (color, more = {}) => new THREE.MeshLambertMaterial({ color, ...more });
  const glowing = (color = 0xffffff) => new THREE.MeshBasicMaterial({ color, toneMapped: false });
  const box = new THREE.BoxGeometry(1, 1, 1), post = new THREE.CylinderGeometry(1, 1, 1, 7);
  const add = (...things) => group.add(...things);
  // Lights you can see from a long way off (lamps, lanterns, beacons): two sizes of soft dot.
  const dots = { small: [], big: [] };
  const dot = (kind, x, y, s, color) => dots[kind].push(X0 + x, y, Z0 - s, ...tint.set(color).toArray());

  // ---- The city -------------------------------------------------------------------------------
  {
    const PAVE = 4.86, LANE = D.lane, [from, to] = D.city;   // (the pavement is this far above the road)
    const kinds = [wallTextures(5, 10, rand), wallTextures(5, 6, rand), wallTextures(8, 5, rand), wallTextures(6, 12, rand)];
    const roof = matt(0x23262b);
    const lists = kinds.map(() => []), signs = [], poles = [], arms = [], bodies = [], cabins = [], tails = [], cables = [], trunks = [], crowns = [];
    const WALLS = [0xd9cdb4, 0xc9b7a0, 0xb8a58c, 0xd4b89c, 0xa9a39a, 0xc2a48c, 0xbfc4c8], NEON = [0xff4f9a, 0x4fd8ff, 0xffd24f, 0xff7a3d, 0x7dff8a, 0xc084ff];
    for (const side of [-1, 1]) {
      // The row on the street: shoulder to shoulder, doors on the pavement.
      for (let s = from - 6; s < to - 14;) {
        const w = 13 + rand() * 10, h = 15 + rand() * rand() * 30, base = H(0, s + w) + PAVE - 2.5;
        lists[h > 30 ? 0 : w > 19 ? 2 : 1].push({ x: side * (LANE + D.terrace + 8), y: base + h / 2, s: s + w / 2, sx: 16, sy: h, sz: w, color: pick(WALLS) });
        if (rand() < 0.7) signs.push({ x: side * (LANE + D.terrace - 0.25), y: H(0, s + w / 2) + PAVE + 3.4 + rand() * 1.5, s: s + w / 2, sx: 0.3, sy: 0.9 + rand() * 0.6, sz: w * (0.35 + rand() * 0.3), color: pick(NEON) });
        s += w;
      }
      // The row behind it, up on the hill: taller, darker.
      for (let s = from - 20; s < to + 10;) {
        const w = 20 + rand() * 14, h = 40 + rand() * 45, base = H(0, s + w) + 10;
        lists[3].push({ x: side * (LANE + D.terrace + 30), y: base + h / 2, s: s + w / 2, sx: 26, sy: h, sz: w, color: pick([0x8f8a84, 0x7d8690, 0x9a8f82]) });
        s += w + rand() * 6;
      }
      // Street lamps along the buildings, cars at the kerb, palms between them.
      for (let s = from + 14; s < to - 10; s += 30) {
        const x = side * (LANE + 12.3), y = H(x, s);
        poles.push({ x, y: y + 3.5, s, sx: 0.12, sy: 7, sz: 0.12 });
        arms.push({ x: x - side * 1, y: y + 6.9, s, sx: 2, sy: 0.12, sz: 0.12 });
        dot('big', x - side * 2, y + 6.7, s, 0xffc978);
      }
      for (let s = from + 6; s < to - 8; s += 7.5) {
        if (rand() > 0.42) continue;
        const x = side * (LANE + 10.4), y = H(x, s), rx = tilt(x, s), color = pick([0xb3261e, 0x1f4f9a, 0xd9d9d9, 0x23262b, 0xd9a52a, 0x2f7a4a, 0x8a8f92]);
        bodies.push({ x, y: y + 0.62, s, sx: 1.9, sy: 0.75, sz: 4.3, rx, color });
        cabins.push({ x, y: y + 1.28, s: s + 0.2, sx: 1.7, sy: 0.6, sz: 2.2, rx });
        tails.push({ x, y: y + 0.75, s: s - 2.17, sx: 1.6, sy: 0.14, sz: 0.06, rx });   // (its tail lights, toward you as you come down)
      }
      for (let s = from + 30; s < to - 10; s += 38) {
        const x = side * (LANE + 9.6), y = H(x, s + side * 9), lean = (rand() - 0.5) * 0.2;
        trunks.push({ x, y: y + 4, s: s + side * 9, sx: 0.22, sy: 8.4, sz: 0.22, rz: lean });
        crowns.push({ x: x - lean * 4, y: y + 8.3, s: s + side * 9, sx: 3.4, sy: 0.9, sz: 3.4, ry: rand() * 3 }, { x: x - lean * 4, y: y + 8.9, s: s + side * 9, sx: 2, sy: 0.8, sz: 2, ry: rand() * 3 });
      }
    }
    // Strings of lights across the street.
    for (let s = from + 40; s < to - 20; s += 62) {
      const y = H(0, s) + PAVE + 11;
      cables.push({ x: 0, y, s, sx: 2 * (LANE + D.terrace), sy: 0.06, sz: 0.06 });
      for (let i = 1; i < 16; i++) dot('small', (i / 16 - 0.5) * 2 * (LANE + D.terrace), y - 2.4 * Math.sin((i / 16) * Math.PI), s, NEON[i % NEON.length]);
    }
    kinds.forEach(([map, emissiveMap], i) => {
      const wall = matt(0xffffff, { map, emissive: 0xffffff, emissiveMap });
      add(instanced(box, [wall, wall, roof, roof, wall, wall], lists[i]));
    });
    const metal = matt(0x2a2d31);
    add(instanced(box, glowing(), signs), instanced(post, metal, poles), instanced(box, metal, arms), instanced(box, metal, cables));
    add(instanced(box, matt(0xffffff), bodies), instanced(box, matt(0x15181c), cabins), instanced(box, glowing(0xff2a1a), tails));
    add(instanced(post, matt(0x5a4a38), trunks), instanced(new THREE.SphereGeometry(1, 7, 4), matt(0x24502c), crowns));
  }

  // ---- The cemetery ---------------------------------------------------------------------------
  {
    const from = D.city[1] + 10, to = D.sewer[0] - 14, LANE = D.lane, TOP = 15.5;   // (TOP: the top of the bank, where the fence runs)
    const stone = matt(0x8b877c), dark = matt(0x14110f), iron = matt(0x1b1d20);
    const cross = mergeGeometries([new THREE.BoxGeometry(0.32, 2.1, 0.26).translate(0, 1.05, 0), new THREE.BoxGeometry(1.2, 0.32, 0.26).translate(0, 1.45, 0)]);
    const slab = new THREE.BoxGeometry(1.05, 1.5, 0.3).translate(0, 0.75, 0);
    const crosses = [], slabs = [], tombs = [], roofs = [], doors = [], trees = [], posts = [], rails = [], blocks = [];
    for (const side of [-1, 1]) {
      for (let e = 18.5; e < 70; e += 5.2) for (let s = from + 14; s < to; s += 4.2) {
        if (rand() > 0.6) continue;
        const x = side * (LANE + e + (rand() - 0.5) * 1.6), ss = s + (rand() - 0.5) * 1.2, scale = 0.9 + rand() * 0.9;
        (rand() < 0.5 ? crosses : slabs).push({ x, y: H(x, ss) - 0.1, s: ss, sx: scale, sy: scale, sz: scale, ry: (rand() - 0.5) * 0.5, rz: (rand() - 0.5) * 0.16, color: pick([0x9a968a, 0x7f7b72, 0xaaa69a, 0x6d6a62]) });
        if (rand() < 0.14) dot('small', x + 0.8, H(x, ss) + 0.5, ss - 0.6, rand() < 0.25 ? 0x8dffb0 : 0xffa64a);   // (someone left a candle)
      }
      for (let s = from + 30; s < to - 10; s += 52 + rand() * 30) {
        const x = side * (LANE + 22 + rand() * 26), y = H(x, s + 3) - 0.6;
        tombs.push({ x, y: y + 2.4, s, sx: 5, sy: 4.8, sz: 6 });
        roofs.push({ x, y: y + 5.9, s, sx: 4.4, sy: 2.4, sz: 5, ry: Math.PI / 4 });
        doors.push({ x: x - side * 2.5, y: y + 1.9, s, sx: 0.2, sy: 2.8, sz: 1.5 });
      }
      for (let s = from + 8; s < to; s += 13 + rand() * 16) {
        const x = side * (LANE + 18 + rand() * 40), scale = 1 + rand() * 0.9;
        trees.push({ x, y: H(x, s) - 0.3, s, sx: scale, sy: scale, sz: scale, ry: rand() * 6 });
      }
      // The iron fence along the top of the bank.
      for (let s = from + 12; s < to; s += 3) { const x = side * (LANE + TOP); posts.push({ x, y: H(x, s) + 1.1, s, sx: 0.12, sy: 2.2, sz: 0.12 }); }
      for (let s = from + 12; s < to - 6; s += 6) { const x = side * (LANE + TOP); rails.push({ x, y: H(x, s + 3) + 1.9, s: s + 3, sx: 0.07, sy: 0.07, sz: 6.1, rx: tilt(x, s + 3) }); }
      // The gates: a pillar each side of the course, and the wall running off up the slope from it.
      blocks.push({ x: side * (LANE + 2.4), y: H(0, from) + 6.5, s: from, sx: 3.4, sy: 14, sz: 3.4 }, { x: side * (LANE + 20), y: H(side * (LANE + 20), from) + 1.5, s: from, sx: 32, sy: 6, sz: 1.2, rz: side * 0.3 });
    }
    blocks.push({ x: 0, y: H(0, from) + 13.6, s: from, sx: 2 * LANE + 9, sy: 2.2, sz: 2.8 });
    {
      const name = textured(canvas(1024, 128, (g) => {
        g.fillStyle = '#17150f'; g.fillRect(0, 0, 1024, 128);
        g.fillStyle = '#cfc8b0'; g.font = '84px Anton, Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('D E A D S L I D E   C E M E T E R Y', 512, 70);
      }));
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(40, 2), new THREE.MeshBasicMaterial({ map: name, toneMapped: false }));
      sign.position.set(X0, H(0, from) + 13.6, Z0 - from + 1.45);   // (facing up the hill, at you)
      add(sign);
      for (const x of [-D.lane - 2.4, D.lane + 2.4]) dot('big', x, H(0, from) + 14.2, from - 1.9, 0xffa64a);
    }
    // The chapel, up the left-hand slope: a nave, a tower with a spire, three lit windows.
    {
      const s = (from + to) / 2, x = -(LANE + 42), y = H(x, s + 9) - 1;
      blocks.push({ x, y: y + 4.5, s, sx: 10, sy: 9, sz: 18 }, { x, y: y + 11, s: s - 11.5, sx: 5.5, sy: 22, sz: 5.5 });
      roofs.push({ x, y: y + 27, s: s - 11.5, sx: 3.9, sy: 10, sz: 3.9, ry: Math.PI / 4 });
      add(instanced(box, dark, [{ x, y: y + 9, s, sx: 7.2, sy: 7.2, sz: 18.4, rz: Math.PI / 4 }]));
      add(instanced(box, glowing(0xffc46a), [-5, 0, 5].map((o) => ({ x: x + 5.05, y: y + 5, s: s + o, sx: 0.15, sy: 4, sz: 1.5 }))));
      dot('big', x + 7, y + 5, s, 0xffb04a);
    }
    const branch = (len, r, y, ry, lean) => new THREE.CylinderGeometry(r * 0.4, r, len, 5).translate(0, len / 2, 0).rotateZ(lean).rotateY(ry).translate(0, y, 0);
    const tree = mergeGeometries([branch(6.2, 0.36, 0, 0, 0.06), branch(3.4, 0.16, 3, 0.4, 0.9), branch(3, 0.15, 3.8, 2.5, 0.8), branch(2.6, 0.13, 4.6, 4.4, 0.95), branch(2.2, 0.11, 5.3, 1.4, 0.6), branch(1.9, 0.08, 4.2, 5.6, 1.2)]);
    add(instanced(cross, matt(0xffffff), crosses), instanced(slab, matt(0xffffff), slabs), instanced(box, stone, tombs), instanced(new THREE.ConeGeometry(1, 1, 4), dark, roofs), instanced(box, dark, doors));
    add(instanced(tree, matt(0x1d1a17), trees), instanced(box, iron, posts), instanced(box, iron, rails), instanced(box, stone, blocks));
  }

  // ---- The storm drain ------------------------------------------------------------------------
  {
    const [from, to] = D.sewer, WALK = D.walk, concrete = matt(0x6f7478), rust = matt(0x7a4a2e), wet = matt(0x3d5a4a);
    const beams = [], columns = [], pipes = [[], []], rings = [], holes = [], housings = [], tanks = [];
    const floor = (s) => H(20, s);   // (the walkway beside the pipe)
    for (let s = from + 44; s < to - 30; s += 43) {
      const y = floor(s);
      beams.push({ x: 0, y: y + 19, s, sx: 2 * WALK + 3, sy: 1.6, sz: 2.2 });
      for (const side of [-1, 1]) {
        columns.push({ x: side * (WALK - 0.8), y: y + 9.5, s, sx: 1.6, sy: 19, sz: 1.6 });
        housings.push({ x: side * 11, y: y + 17.9, s, sx: 2.4, sy: 0.5, sz: 0.9 });
        dot('big', side * 11, y + 17.4, s, 0x9dffc4);
        [0, 1].forEach((k) => pipes[k].push({ x: side * (WALK - 0.9 - k * 0.9), y: floor(s + 21.5) + 0.6 + k * 1.5, s: s + 21.5, sx: 0.5 - k * 0.15, sy: 0.5 - k * 0.15, sz: 43.2, rx: tilt(20, s + 21.5) }));
      }
      if ((s - from) % 86 < 43) {
        const side = (s - from) % 172 < 86 ? -1 : 1;
        rings.push({ x: side * (WALK + 0.1), y: floor(s + 21) + 1.5, s: s + 21, ry: Math.PI / 2, sx: 0.55, sy: 0.55, sz: 0.55 });
        holes.push({ x: side * (WALK + 0.15), y: floor(s + 21) + 1.5, s: s + 21, sx: 0.2, sy: 1.8, sz: 1.8 });
        dot('small', side * (WALK - 0.6), floor(s + 21) + 1.2, s + 21, 0x7dffa0);
      }
    }
    // Beyond the walls: the works the drain belongs to. Tanks, chimneys with a light on top, floodlight masts.
    for (const side of [-1, 1]) for (let s = from + 30; s < to - 20; s += 34 + rand() * 40) {
      const x = side * (WALK + 12 + rand() * 30), y = H(x, s), kind = rand();
      if (kind < 0.5) { const r = 4 + rand() * 4, h = 7 + rand() * 9; tanks.push({ x, y: y + h / 2 - 1, s, sx: r, sy: h, sz: r, color: pick([0x8a8f92, 0x6f7478, 0x9a8a72, 0x5f6a70]) }); }
      else if (kind < 0.75) { const h = 26 + rand() * 20; tanks.push({ x, y: y + h / 2 - 1, s, sx: 1.4, sy: h, sz: 1.4, color: 0x5a5350 }); dot('big', x, y + h, s, 0xff3a2a); }
      else { tanks.push({ x, y: y + 8, s, sx: 0.2, sy: 18, sz: 0.2, color: 0x2a2d31 }); dot('big', x, y + 17, s, 0xd8ecff); }
    }
    add(instanced(post, matt(0xffffff), tanks));
    // A portal at each end, with its name over it.
    for (const s of [from + 8, to - 8]) {
      const y = floor(s);
      beams.push({ x: 0, y: y + 27, s, sx: 2 * WALK + 16, sy: 6, sz: 4 });
      for (const side of [-1, 1]) columns.push({ x: side * (WALK + 4), y: y + 12, s, sx: 8, sy: 26, sz: 4 });
      const name = textured(canvas(1024, 128, (g) => {
        g.fillStyle = '#c9a227'; g.fillRect(0, 0, 1024, 128);
        g.fillStyle = '#17150f';
        for (let x = -128; x < 1024; x += 96) { g.beginPath(); g.moveTo(x, 128); g.lineTo(x + 48, 128); g.lineTo(x + 176, 0); g.lineTo(x + 128, 0); g.fill(); }
        g.fillStyle = '#c9a227'; g.fillRect(190, 18, 644, 92);
        g.fillStyle = '#17150f'; g.font = '78px Anton, Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(s < to - 100 ? 'S T O R M   D R A I N   7' : 'E N D   O F   D R A I N', 512, 68);
      }));
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(36, 4.5), new THREE.MeshBasicMaterial({ map: name, toneMapped: false }));
      sign.position.set(X0, y + 27, Z0 - s + 2.05);
      add(sign);
    }
    const along = new THREE.CylinderGeometry(1, 1, 1, 8).rotateX(Math.PI / 2);
    add(instanced(box, concrete, beams), instanced(box, concrete, columns), instanced(box, matt(0x2a2d31), housings));
    add(instanced(along, rust, pipes[0]), instanced(along, wet, pipes[1]), instanced(new THREE.TorusGeometry(2.3, 0.38, 6, 16), rust, rings), instanced(box, matt(0x070909), holes));
  }

  // ---- The hillside ---------------------------------------------------------------------------
  {
    const from = D.sewer[1] + 14, to = D.edge[0], LANE = D.lane;
    const paint = (geometry, color) => { const c = tint.set(color), n = geometry.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3); geometry.setAttribute('color', new THREE.BufferAttribute(a, 3)); return geometry.toNonIndexed(); };
    const pine = mergeGeometries([
      paint(new THREE.CylinderGeometry(0.25, 0.36, 2.2, 6).translate(0, 1.1, 0), 0x3a2c20),
      paint(new THREE.ConeGeometry(2.3, 4.2, 7).translate(0, 3.9, 0), 0x1f3d2a),
      paint(new THREE.ConeGeometry(1.7, 3.6, 7).translate(0, 6.1, 0), 0x25472f),
      paint(new THREE.ConeGeometry(1.05, 2.8, 7).translate(0, 8, 0), 0x2b5236),
    ]);
    const pines = [], rocks = [], markers = [], caps = [], legs = [], spars = [], wires = [];
    for (const side of [-1, 1]) {
      for (let i = 0; i < 170; i++) {
        const x = side * (LANE + 16.5 + rand() * rand() * 70), s = from + rand() * (to - from + 60), scale = 0.8 + rand() * 0.9;
        pines.push({ x, y: H(x, s) - 0.4, s, sx: scale, sy: scale * (0.9 + rand() * 0.4), sz: scale, ry: rand() * 6 });
      }
      for (let i = 0; i < 60; i++) {
        const x = side * (LANE + 16.5 + rand() * 60), s = from + rand() * (to - from), scale = 0.8 + rand() * rand() * 3.4;
        rocks.push({ x, y: H(x, s) + scale * 0.15, s, sx: scale * 1.3, sy: scale * 0.8, sz: scale, ry: rand() * 6, rx: rand(), color: pick([0x6a6c6e, 0x585a5e, 0x77756e]) });
      }
      for (let s = from + 10; s < to + 80; s += 22) {
        const x = side * (LANE - 0.6), y = H(x, s);
        markers.push({ x, y: y + 0.55, s, sx: 0.2, sy: 1.1, sz: 0.2 });
        caps.push({ x, y: y + 1.05, s, sx: 0.24, sy: 0.24, sz: 0.24 });
      }
    }
    // Pylons up the right-hand slope, a red light on each, wires between them.
    let last = null;
    for (let s = from + 60; s < to + 40; s += 150) {
      const x = LANE + 40, y = H(x, s);
      legs.push({ x, y: y + 17, s });
      spars.push({ x, y: y + 28, s, sx: 15, sy: 0.4, sz: 0.4 }, { x, y: y + 23, s, sx: 11, sy: 0.4, sz: 0.4 });
      dot('big', x, y + 34.5, s, 0xff3a2a);
      if (last) for (const off of [-7, 7]) wires.push({ x: x + off, y: (y + last.y) / 2 + 27, s: s - 75, sx: 0.06, sy: 0.06, sz: Math.hypot(150, y - last.y), rx: Math.atan((y - last.y) / 150) });
      last = { y };
    }
    add(instanced(pine, matt(0xffffff, { vertexColors: true }), pines), instanced(new THREE.IcosahedronGeometry(1, 0), matt(0xffffff, { flatShading: true }), rocks));
    add(instanced(box, matt(0xd8d8d2), markers), instanced(box, glowing(0xff3a2a), caps));
    add(instanced(new THREE.ConeGeometry(5, 34, 4, 4, true), new THREE.MeshBasicMaterial({ color: 0x4a545e, wireframe: true }), legs), instanced(box, matt(0x4a545e), spars), instanced(box, matt(0x15181c), wires));
  }

  // ---- The lights, and what is far off -------------------------------------------------------
  const glow = glowTexture();
  for (const [kind, size] of [['small', 2.6], ['big', 11]]) {
    const geometry = new THREE.BufferGeometry(), raw = new Float32Array(dots[kind]), n = raw.length / 6, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos.set(raw.subarray(i * 6, i * 6 + 3), i * 3); col.set(raw.subarray(i * 6 + 3, i * 6 + 6), i * 3); }
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const points = new THREE.Points(geometry, new THREE.PointsMaterial({ map: glow, size, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    points.frustumCulled = false;
    add(points);
  }
  const skyline = skylineTexture(rand);
  skyline.wrapS = THREE.RepeatWrapping;
  skyline.repeat.x = 3;
  const far = new THREE.Mesh(new THREE.CylinderGeometry(820, 820, 330, 48, 1, true), new THREE.MeshBasicMaterial({ map: skyline, transparent: true, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false }));
  far.renderOrder = -1;
  add(far);

  return {
    group,
    // Keep what is far off centred on `pos` (the player), so it never gets any nearer.
    follow(pos) { far.position.set(pos.x, pos.y - 60, pos.z); },
  };
}
