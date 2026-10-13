// Power-ups won from HotBox Zones. They are permanent for the run, they stack
// (capturing the same one again levels it up), and all of them work on their
// own with no input from the player. Level-up upgrades can strengthen the ones
// you own (see the "requires" entries in systems/upgrades.js).
//
// Each power-up's numbers are in POWERUPS below as a function of
//   L = its level (how many times you've won it), and
//   m = its upgrade bonuses { damage, size, rate, count } (multipliers, count is added).
// To add a power-up: add an entry here and make it act in update().
// `explain` is the text on the card shown the first time you win it in a run.
//
// What each looks like is made here too, sculpted and painted with the monsters' kit (enemies/sculpt.js), with its
// pictures painted on canvases below. And every one that hurts something shows that it has: a flash and a burst of
// sparks in its own colour where it landed, a sound of its own (playPowerHit in fx/audio.js), and whatever it does
// to the monster left on the monster (burning, sick, frozen). None of that stops the game for a moment or moves
// the camera.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { props } from '../world/props.js';
import { stats, POWER_IDS } from './stats.js';
import { config } from '../config.js';
import { world, LEVELS } from '../world/level.js';
import { heightAt } from '../world/terrain.js';
import { glowTexture } from '../world/textures.js';
import { tube, lump, sculpt, dent, dirty, paint, noise, fineSkull, spikes } from '../enemies/sculpt.js';
import { playPowerHit } from '../fx/audio.js';

export const POWERUPS = {
  shield: {
    name: 'Shield', color: 0x58b7ff, max: 5, description: 'a bubble soaks up damage, then recharges',
    explain: 'A bubble round you takes the hits instead of your health. Leave it alone for a few seconds and it recharges by itself.',
    numbers: (L, m) => ({ capacity: (20 + 12 * L) * m.size, delay: 9 / m.rate, regen: 10 }),   // HP it holds, seconds unhit before it refills, HP per second
  },
  gas: {
    name: 'TozToxik', color: 0x8dff5a, max: 5, description: 'toxic gas round you and in a trail behind you',
    explain: 'A cloud of toxic gas follows you and damages every monster inside it. It also hangs in a trail behind you: the faster you skate, the longer the trail.',
    numbers: (L, m) => ({ radius: (4 + 0.6 * (L - 1)) * m.size, dps: (14 + 6 * (L - 1)) * m.damage, linger: 2.2 + 0.3 * (L - 1) }),   // linger: seconds the trail hangs about
  },
  fire: {
    name: 'Ring of Fire', color: 0xff7a2a, max: 5, description: 'fireballs circle you and set alight what they touch',
    explain: 'Fireballs circle you, sweeping in and out as far as the burning ring on the ground, and set alight any monster they pass through. Nothing to aim: just skate close.',
    numbers: (L, m) => ({ orbs: Math.min(8, 1 + L + m.count), radius: 3.2 * m.size, damage: (22 + 6 * (L - 1)) * m.damage, spin: 2.6, burn: 1.1 }),   // burn: seconds what it touches stays alight (a fifth of the hit again, over that)
  },
  seekers: {
    name: 'Grave Seekers', color: 0xc9a6ff, max: 5, description: 'homing skulls hunt the nearest monsters',
    explain: 'Every second or two, skulls fly out on their own and home in on the nearest monsters.',
    numbers: (L, m) => ({ volley: 1 + Math.floor(L / 2) + m.count, every: 1.6 / m.rate, damage: (26 + 8 * (L - 1)) * m.damage, speed: 30, range: 45 }),
  },
  thorns: {
    name: 'Thorns', color: 0xc8d0d6, max: 5, description: 'anything that gets close is torn up and thrown back',
    explain: 'A ring of barbs spins round you. Anything that gets close enough to claw you is torn up and thrown back.',
    numbers: (L, m) => ({ radius: 1.9 * m.size, dps: (26 + 12 * (L - 1)) * m.damage, knock: 2.5 }),
  },
  lightning: {
    name: 'Chain Lightning', color: 0x9fe8ff, max: 5, description: 'bolts strike nearby monsters and jump between them',
    explain: 'Every few seconds a bolt strikes the nearest monster, then jumps on to the ones next to it.',
    numbers: (L, m) => ({ every: 2.6 / m.rate, damage: (45 + 15 * (L - 1)) * m.damage, jumps: 2 + L + m.count, range: 30, hop: 9 }),
  },
  float: {
    name: 'Moon Rocks', color: 0xdfe8ff, max: 4, description: 'lower gravity: bigger air',
    explain: 'Gravity pulls on you less. You jump higher, hang longer and have more time for tricks and flips.',
    numbers: (L) => ({ gravity: Math.max(0.5, 1 - 0.12 * L) }),
  },
  frost: {
    name: 'Frost Aura', color: 0x9fd8ff, max: 5, description: 'a ring of cold: monsters near you slow right down',
    explain: 'A ring of cold surrounds you. Any monster inside it is chilled: it moves far slower, and the cold eats at it.',
    numbers: (L, m) => ({ radius: (5 + 0.8 * (L - 1)) * m.size, slow: Math.max(0.35, 0.72 - 0.07 * L), dps: (5 + 3 * (L - 1)) * m.damage }),
  },
  rain: {
    name: 'Bone Rain', color: 0xe8dfc8, max: 5, description: 'bones fall out of the dark onto monsters and burst',
    explain: 'Every few seconds, huge bones drop out of the dark onto monsters near you and burst, hurting everything around where they land.',
    numbers: (L, m) => ({ every: 3.2 / m.rate, strikes: 1 + Math.floor(L / 2) + m.count, damage: (50 + 15 * (L - 1)) * m.damage, radius: 3.6 * m.size, range: 28 }),
  },
  pact: {
    name: 'Blood Pact', color: 0xd0201b, max: 4, description: 'killing heals you, a little',
    explain: 'Kill enough monsters and you get some health back. The more of these you have, the fewer kills it takes.',
    numbers: (L) => ({ every: Math.max(6, 20 - 4 * L), heal: 3 + L }),   // kills per heal, HP per heal
  },
};

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
const Z = new THREE.Vector3(0, 0, 1), UP = new THREE.Vector3(0, 1, 0);
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), e3 = new THREE.Euler(), a = new THREE.Vector3(), b = new THREE.Vector3(), sc = new THREE.Vector3(), tint = new THREE.Color();
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const level = (id) => stats.power[id].level;
const numbers = (id) => POWERUPS[id].numbers(level(id), stats.power[id]);
const basic = (color, extra = {}) => new THREE.MeshBasicMaterial({ color, toneMapped: false, ...extra });
const lit = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false };   // (a thing made of light)
// Where a monster is hit: about its chest.
const chest = (e, out) => out.set(e.x, e.y + e.T.height * e.scale * 0.55, e.z);

// ---- Their pictures (each painted once, on a canvas) --------------------------------------------
function painted(size, draw) {
  const c = Object.assign(document.createElement('canvas'), { width: size, height: size }), g = c.getContext('2d');
  draw(g, size);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
// A billow of smoke: a heap of soft lumps, each lit from above. (White: whatever uses it gives it its colour.)
const smokeTexture = (seed) => painted(256, (g, s) => {
  let r = seed;
  const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 18; i++) {
    const ang = rnd() * 6.283, far = rnd() * 0.25 * s, x = s / 2 + Math.cos(ang) * far, y = s / 2 + Math.sin(ang) * far, rad = (0.14 + rnd() * 0.17) * s;
    const lump = g.createRadialGradient(x, y - rad * 0.25, 0, x, y, rad);
    lump.addColorStop(0, 'rgba(255,255,255,0.55)'); lump.addColorStop(0.5, 'rgba(205,205,205,0.3)'); lump.addColorStop(1, 'rgba(110,110,110,0)');
    g.fillStyle = lump; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill();
  }
});
// What TozToxik leaves on the ground: a ragged blot of it, brighter at its edge, with bubbles coming up through it.
const sludgeTexture = () => painted(256, (g, s) => {
  g.translate(s / 2, s / 2);
  const edge = (t) => 0.36 * s * (1 + 0.16 * Math.sin(t * 3 + 1) + 0.1 * Math.sin(t * 7 + 2) + 0.06 * Math.sin(t * 13));
  g.beginPath();
  for (let i = 0; i <= 72; i++) { const t = (i / 72) * 6.2832, r = edge(t); g.lineTo(Math.cos(t) * r, Math.sin(t) * r); }
  g.closePath();
  const fill = g.createRadialGradient(0, 0, 0, 0, 0, 0.42 * s);
  fill.addColorStop(0, 'rgba(60,110,26,0.9)'); fill.addColorStop(0.7, 'rgba(118,200,40,0.9)'); fill.addColorStop(1, 'rgba(214,255,92,1)');
  g.fillStyle = fill; g.fill();
  g.lineWidth = 5; g.strokeStyle = 'rgba(236,255,150,0.95)'; g.stroke();
  for (let i = 0; i < 22; i++) {
    const t = i * 2.4, far = (0.05 + (((i * 37) % 100) / 100) * 0.26) * s, x = Math.cos(t) * far, y = Math.sin(t) * far, r = 3 + (i % 5) * 2.2;
    g.beginPath(); g.arc(x, y, r, 0, 7); g.strokeStyle = 'rgba(236,255,160,0.95)'; g.lineWidth = 1.6; g.stroke();
    g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.3, 0, 7); g.fillStyle = 'rgba(255,255,225,0.95)'; g.fill();
  }
});
// The Ring of Fire's reach, on the ground: a circle of flame (the brightest of it 0.894 of the way out to the edge).
const RING_AT = 0.894;
const emberRingTexture = () => painted(512, (g, s) => {
  g.translate(s / 2, s / 2);
  g.globalCompositeOperation = 'lighter';
  const band = g.createRadialGradient(0, 0, 0.36 * s, 0, 0, 0.5 * s);
  band.addColorStop(0, 'rgba(255,90,10,0)'); band.addColorStop(0.5, 'rgba(255,110,20,0.16)'); band.addColorStop(0.6, 'rgba(255,170,60,0.6)'); band.addColorStop(0.62, 'rgba(255,230,150,0.95)'); band.addColorStop(0.66, 'rgba(255,130,30,0.45)'); band.addColorStop(0.85, 'rgba(255,60,10,0.1)'); band.addColorStop(1, 'rgba(255,40,0,0)');
  g.fillStyle = band; g.beginPath(); g.arc(0, 0, 0.5 * s, 0, 7); g.fill();
  g.lineCap = 'round';
  for (let i = 0; i < 240; i++) {   // (licks of it, leaning the way the ring turns)
    const t = i * 0.618 * 6.2832, h = ((i * 7919) % 100) / 100, r0 = 0.44 * s, r1 = r0 + (0.012 + 0.045 * h) * s;
    g.strokeStyle = `rgba(255,${120 + Math.round(110 * h)},30,${0.18 + 0.34 * h})`;
    g.lineWidth = 1.5 + 2 * h;
    g.beginPath(); g.moveTo(Math.cos(t) * r0, Math.sin(t) * r0); g.lineTo(Math.cos(t + 0.06) * r1, Math.sin(t + 0.06) * r1); g.stroke();
  }
});
// The Frost Aura's reach: a rim of ice (0.92 of the way out), ferns of frost growing in from it, and a haze inside.
const FROST_AT = 0.92;
const frostTexture = () => painted(512, (g, s) => {
  g.translate(s / 2, s / 2);
  g.globalCompositeOperation = 'lighter';
  g.lineCap = 'round';
  const R = 0.46 * s;
  g.strokeStyle = 'rgba(150,215,255,0.34)'; g.lineWidth = 14; g.beginPath(); g.arc(0, 0, R, 0, 7); g.stroke();
  g.strokeStyle = 'rgba(224,246,255,0.95)'; g.lineWidth = 4; g.beginPath(); g.arc(0, 0, R, 0, 7); g.stroke();
  const fern = (x, y, t, long, wide, depth) => {
    const ex = x + Math.cos(t) * long, ey = y + Math.sin(t) * long;
    g.strokeStyle = `rgba(204,236,255,${0.34 + 0.16 * depth})`; g.lineWidth = wide;
    g.beginPath(); g.moveTo(x, y); g.lineTo(ex, ey); g.stroke();
    if (depth <= 0) return;
    for (const k of [0.35, 0.6, 0.82]) for (const turn of [-1, 1]) fern(x + (ex - x) * k, y + (ey - y) * k, t + turn * 1.05, long * 0.34 * (1.1 - k * 0.5), wide * 0.6, depth - 1);
  };
  for (let i = 0; i < 28; i++) { const t = (i / 28) * 6.2832; fern(Math.cos(t) * R, Math.sin(t) * R, t + Math.PI + (((i * 53) % 7) - 3) * 0.05, (0.07 + 0.09 * (((i * 37) % 10) / 10)) * s, 2.4, 2); }
  const haze = g.createRadialGradient(0, 0, 0, 0, 0, R);
  haze.addColorStop(0, 'rgba(150,215,255,0)'); haze.addColorStop(0.75, 'rgba(150,215,255,0.05)'); haze.addColorStop(1, 'rgba(180,230,255,0.22)');
  g.fillStyle = haze; g.beginPath(); g.arc(0, 0, R, 0, 7); g.fill();
});
// Where a bone is about to come down: a broken ring and four ticks, in red.
const markTexture = () => painted(256, (g, s) => {
  g.translate(s / 2, s / 2);
  g.globalCompositeOperation = 'lighter';
  const fill = g.createRadialGradient(0, 0, 0, 0, 0, 0.44 * s);
  fill.addColorStop(0, 'rgba(255,60,30,0.3)'); fill.addColorStop(1, 'rgba(255,60,30,0.04)');
  g.fillStyle = fill; g.beginPath(); g.arc(0, 0, 0.44 * s, 0, 7); g.fill();
  g.strokeStyle = 'rgba(255,84,48,0.95)'; g.lineWidth = 6; g.setLineDash([26, 14]); g.beginPath(); g.arc(0, 0, 0.44 * s, 0, 7); g.stroke();
  g.setLineDash([]); g.lineWidth = 3;
  for (let i = 0; i < 4; i++) { const t = i * Math.PI / 2 + Math.PI / 4; g.beginPath(); g.moveTo(Math.cos(t) * 0.2 * s, Math.sin(t) * 0.2 * s); g.lineTo(Math.cos(t) * 0.36 * s, Math.sin(t) * 0.36 * s); g.stroke(); }
});

// ---- Their shapes (each sculpted once) ----------------------------------------------------------
// A fireball, flying toward +z: a hot core drawn out behind into tongues of flame, white in front, red where it trails off.
function fireball() {
  const core = sculpt(lump(0.27, 0xffffff, [0, 0, 0], [1, 1, 1], 18), (v) => {
    const back = Math.max(0, -v.z / 0.27), wob = noise(v.x * 11, v.y * 11, v.z * 6);
    v.x *= 1 - 0.45 * back * back; v.y *= 1 - 0.45 * back * back;
    v.z -= back * back * (0.34 + 0.16 * wob);
    v.x += wob * 0.035 * back; v.y += noise(v.y * 9, v.z * 9, v.x * 9) * 0.035 * back;
  });
  const tongues = [];
  for (let i = 0; i < 6; i++) {
    const t = (i / 6) * Math.PI * 2 + 0.4, r = 0.17, long = 0.55 + 0.25 * (((i * 7) % 3) / 2);
    tongues.push(tube([[Math.cos(t) * r, Math.sin(t) * r, -0.05], [Math.cos(t + 0.5) * r * 1.25, Math.sin(t + 0.5) * r * 1.25, -long * 0.5], [Math.cos(t + 1.1) * r * 0.5, Math.sin(t + 1.1) * r * 0.5, -long]], [0.1, 0.075, 0.012], 0xffffff, { sides: 6, steps: 4 }));
  }
  const geo = mergeGeometries([core, ...tongues]), p = geo.attributes.position, c = geo.attributes.color;
  const hot = new THREE.Color(1.0, 0.96, 0.72), mid = new THREE.Color(1.0, 0.5, 0.08), cool = new THREE.Color(0.75, 0.1, 0.02), col = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const k = Math.min(1, Math.max(0, (0.27 - p.getZ(i)) / 1.0));
    (k < 0.4 ? col.copy(hot).lerp(mid, k / 0.4) : col.copy(mid).lerp(cool, (k - 0.4) / 0.6)).multiplyScalar(0.9 + 0.2 * noise(p.getX(i) * 14, p.getY(i) * 14, p.getZ(i) * 14));
    c.setXYZ(i, col.r, col.g, col.b);
  }
  return geo;
}
// A Grave Seeker: a skull, its jaw open, facing the way it flies (+z).
const seekerSkull = () => mergeGeometries(fineSkull(0.21, { bone: 0xe6def5, old: 0xb7a9d6, dark: 0x16082a, teeth: 0xf6f2ff }, { fine: 14, jaw: 0.42 }));
// Thorns: two stems wound round each other in a hoop (of radius 1: it is scaled to fit), thorns all the way round
// it, in iron gone to rust, with blood on the points.
function briar() {
  const IRON = 0x34383d, RUST = 0x5a3322, BLOOD = 0xa01014, parts = [];
  for (const [phase, lift] of [[0, 1], [Math.PI, -1]]) {
    const pts = [];
    for (let i = 0; i <= 40; i++) { const t = (i / 40) * Math.PI * 2, r = 1 + 0.06 * Math.sin(t * 5 + phase); pts.push([Math.cos(t) * r, 0.07 * Math.cos(t * 5 + phase) * lift, Math.sin(t) * r]); }
    parts.push(tube(pts, [0.045, 0.038, 0.05, 0.036, 0.046], phase ? RUST : IRON, { sides: 6, steps: 2, caps: false }));
  }
  parts.push(...spikes(34, (i) => {
    const t = (i / 34) * Math.PI * 2 + 0.09, out = 0.24 + 0.14 * (((i * 5) % 3) / 2), up = ((i % 3) - 1) * 0.16;
    return [[Math.cos(t) * 1.02, 0, Math.sin(t) * 1.02], [Math.cos(t + 0.12) * (1.02 + out), up, Math.sin(t + 0.12) * (1.02 + out)], 0.036];
  }, IRON));
  const geo = dirty(mergeGeometries(parts), { mottle: 0.45, freq: 12, under: 0.3 }), p = geo.attributes.position, c = geo.attributes.color, red = new THREE.Color(BLOOD), col = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const far = Math.hypot(p.getX(i), p.getZ(i));
    if (far > 1.14) { col.fromBufferAttribute(c, i).lerp(red, Math.min(1, (far - 1.14) / 0.12)); c.setXYZ(i, col.r, col.g, col.b); }
  }
  return geo;
}
// A lump of the Moon: pitted, with two craters.
function moonRock() {
  const geo = sculpt(lump(0.15, 0x9a9ba2, [0, 0, 0], [1, 0.8, 0.9], 14), (v) => {
    v.multiplyScalar(1 + 0.3 * noise(v.x * 7 + 3, v.y * 7, v.z * 7) + 0.12 * noise(v.x * 19, v.y * 19 + 3, v.z * 19));
    dent(v, [0.1, 0.06, 0.05], 0.09, 0.04, [-0.7, -0.5, -0.4]);
    dent(v, [-0.08, 0.02, -0.1], 0.07, 0.03, [0.6, -0.2, 0.7]);
  });
  return dirty(geo, { mottle: 0.5, freq: 14, under: 0.5, stains: [[0.1, 0.06, 0.05, 0.07, 0x4a4b52, 0.8], [-0.08, 0.02, -0.1, 0.055, 0x4a4b52, 0.8]] });
}
// The Frost Aura's rim: clusters of crystal standing round a circle of radius 1 (scaled up with the ring), each a
// tall spike and two shorter ones leaning away from it.
function iceShards() {
  const parts = [];
  for (let i = 0; i < 12; i++) {
    const t = (i / 12) * Math.PI * 2 + 0.2 * Math.sin(i * 3.1), x = Math.cos(t), z = Math.sin(t);
    for (let k = 0; k < 3; k++) {
      const tall = (0.1 + 0.08 * (((i * 3 + k * 5) % 4) / 3)) * (k ? 0.7 : 1), off = (k - 1) * 0.035;
      parts.push(paint(new THREE.CylinderGeometry(0.002, 0.022 * (k ? 0.8 : 1), tall, 6, 1).translate(0, tall / 2, 0).rotateZ((k - 1) * 0.35 + 0.1 * Math.sin(i)).rotateY(-t)
        .translate(x * (1 + off * 0.3) - z * off, 0, z * (1 + off * 0.3) + x * off), k ? 0x7cc6f2 : 0xe8f8ff));
    }
  }
  return mergeGeometries(parts);
}

// The Shield: a shell of six-sided cells, bright where you look across it, with a ring that runs out over it from
// wherever it has just been hit.
const shieldMaterial = () => new THREE.ShaderMaterial({
  ...lit, side: THREE.DoubleSide,
  uniforms: { time: { value: 0 }, charge: { value: 1 }, flash: { value: 0 }, wave: { value: 1 }, hit: { value: new THREE.Vector3(0, 0, 1) }, tint: { value: new THREE.Color(POWERUPS.shield.color) } },
  vertexShader: `
    varying vec3 vN; varying vec3 vV; varying vec3 vP;
    void main() {
      vP = normalize(position);
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vN = normalize(normalMatrix * normal);
      vV = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    uniform float time, charge, flash, wave; uniform vec3 hit, tint;
    varying vec3 vN; varying vec3 vV; varying vec3 vP;
    float hexDist(vec2 p) { p = abs(p); return max(dot(p, vec2(0.5, 0.8660254)), p.x); }
    // how far a place is from the nearest edge of the honeycomb it is in (0 on an edge, 0.5 in the middle of a cell)
    float hexEdge(vec2 uv) {
      vec2 r = vec2(1.0, 1.7320508), h = r * 0.5;
      vec2 a = mod(uv, r) - h, b = mod(uv - h, r) - h;
      vec2 g = dot(a, a) < dot(b, b) ? a : b;
      return 0.5 - hexDist(g);
    }
    void main() {
      float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.4);
      vec2 uv = vec2(atan(vP.z, vP.x), asin(clamp(vP.y, -1.0, 1.0))) * 2.2281692;   // (fourteen cells round it)
      float line = smoothstep(0.07, 0.0, hexEdge(uv + vec2(0.0, time * 0.1)));
      float d = acos(clamp(dot(vP, hit), -1.0, 1.0));
      float ripple = smoothstep(0.24, 0.0, abs(d - wave * 3.3)) * (1.0 - wave);
      float low = charge < 0.3 ? 0.55 + 0.45 * sin(time * 26.0) : 1.0;   // (nearly gone: it gutters)
      float alpha = (0.04 + 0.5 * rim + 0.24 * line * (0.35 + 0.65 * rim)) * (0.35 + 0.65 * charge) * low + flash * (0.3 + 0.45 * line) + ripple * 0.9;
      gl_FragColor = vec4(mix(tint, vec3(1.0), clamp(0.3 * rim + 0.6 * ripple + 0.5 * flash, 0.0, 1.0)), alpha);
      #include <colorspace_fragment>
    }`,
});

const SPARKS = 720, FLARES = 28, RIPPLES = 10;

export class Powerups {
  constructor(scene) {
    const glow = glowTexture(), smoke = [smokeTexture(7), smokeTexture(131)];
    const sprite = (material) => {
      const s = new THREE.Sprite(material);
      s.visible = false;
      scene.add(s);
      return s;
    };
    const lightSprite = (color, opacity = 0.9) => sprite(new THREE.SpriteMaterial({ map: glow, color, opacity, ...lit }));
    const flat = (texture, color = 0xffffff) => {   // (a picture lying on the ground, two metres across until it is scaled)
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), basic(color, { map: texture, ...lit, side: THREE.DoubleSide, fog: false }));
      mesh.visible = false;
      scene.add(mesh);
      return mesh;
    };
    this.at = new THREE.Vector3();   // where he is (kept from the last update, for what happens between them)
    this.horde = null;

    // ---- What a hit looks like: sparks, a flash, a ring out across the ground. ----
    this.sparkPos = new Float32Array(SPARKS * 3);
    this.sparkCol = new Float32Array(SPARKS * 3);
    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3));
    sparkGeo.setAttribute('color', new THREE.BufferAttribute(this.sparkCol, 3));
    this.sparkPoints = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ map: glow, size: 0.36, vertexColors: true, ...lit, fog: false }));
    this.sparkPoints.frustumCulled = false;
    scene.add(this.sparkPoints);
    this.sparks = Array.from({ length: SPARKS }, () => ({ life: 0, span: 1, vel: new THREE.Vector3(), color: new THREE.Color(), fall: 0 }));
    this.nextSpark = 0;
    this.flares = Array.from({ length: FLARES }, () => ({ sprite: lightSprite(0xffffff, 0), life: 0, span: 1, size: 1 }));
    this.nextFlare = 0;
    this.ripples = Array.from({ length: RIPPLES }, () => {
      const mesh = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2), basic(0xffffff, { ...lit, opacity: 0, side: THREE.DoubleSide, fog: false }));
      mesh.visible = false;
      scene.add(mesh);
      return { mesh, life: 0, span: 1, size: 1 };
    });
    this.nextRipple = 0;

    // Shield: the shell.
    this.bubble = new THREE.Mesh(new THREE.SphereGeometry(1.25, 44, 30), shieldMaterial());
    this.bubble.visible = false;
    scene.add(this.bubble);

    // TozToxik: a cloud that stays with you, and what it leaves along your path: a blot of it on the ground, and
    // the gas coming up off that.
    this.cloud = Array.from({ length: 16 }, (_, i) => {
      const puff = sprite(new THREE.SpriteMaterial({ map: smoke[i % 2], color: i % 3 ? 0x7dea4a : 0xc8f56a, transparent: true, opacity: 0, depthWrite: false }));
      puff.userData = { angle: i * 2.4, reach: 0.3 + ((i * 7) % 10) / 14, height: 0.3 + (i % 5) * 0.4, speed: 0.5 + (i % 4) * 0.3 };
      return puff;
    });
    this.trail = Array.from({ length: 44 }, (_, i) => ({
      life: 0, total: 1, pos: new THREE.Vector3(), ground: 0, turn: i * 1.7,
      puff: sprite(new THREE.SpriteMaterial({ map: smoke[i % 2], color: i % 2 ? 0x86f04e : 0xb9f862, transparent: true, opacity: 0, depthWrite: false })),
    }));
    this.slicks = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), basic(0xffffff, { map: sludgeTexture(), ...lit, side: THREE.DoubleSide }), this.trail.length);
    this.slicks.frustumCulled = false;
    this.trail.forEach((_, i) => { this.slicks.setMatrixAt(i, HIDDEN); this.slicks.setColorAt(i, tint.setRGB(0, 0, 0)); });
    scene.add(this.slicks);
    this.nextPatch = 0;
    this.sinceDrop = 0;   // metres travelled since the last patch

    // Ring of Fire: the fireballs, the light each carries, and the ring on the ground that shows how far they reach.
    this.orbs = new THREE.InstancedMesh(fireball(), basic(0xffffff, { vertexColors: true }), 8);
    this.orbs.frustumCulled = false;
    this.orbs.count = 0;
    scene.add(this.orbs);
    this.orbGlow = Array.from({ length: 8 }, () => lightSprite(POWERUPS.fire.color, 0.85));
    this.orbAt = Array.from({ length: 8 }, () => new THREE.Vector3());
    this.fireRing = flat(emberRingTexture());

    // Grave Seekers: skulls with a light behind their eyes.
    this.skulls = new THREE.InstancedMesh(seekerSkull(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, emissive: 0x7a4ae0, emissiveIntensity: 0.55 }), 24);
    this.skulls.frustumCulled = false;
    for (let i = 0; i < 24; i++) this.skulls.setMatrixAt(i, HIDDEN);
    scene.add(this.skulls);
    this.seekers = Array.from({ length: 24 }, () => ({ flare: lightSprite(POWERUPS.seekers.color, 0.45), pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, target: null, damage: 0 }));

    // Thorns: a hoop of briar.
    this.hoop = new THREE.Mesh(briar(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.65 }));
    this.hoop.castShadow = true;
    this.hoop.visible = false;
    scene.add(this.hoop);

    // Chain Lightning: each bolt a white-hot core inside a wider glow, in jagged pieces, with forks off it.
    const bar = new THREE.BoxGeometry(1, 1, 1);
    this.bolts = new THREE.InstancedMesh(bar, basic(0xffffff, { ...lit, fog: false }), 128);
    this.boltGlow = new THREE.InstancedMesh(bar, basic(POWERUPS.lightning.color, { ...lit, fog: false }), 128);
    for (const mesh of [this.bolts, this.boltGlow]) { mesh.frustumCulled = false; mesh.count = 0; scene.add(mesh); }
    this.boltLight = new THREE.PointLight(POWERUPS.lightning.color, 0, 30, 2);
    scene.add(this.boltLight);

    // Moon Rocks: lumps of it, turning round your ankles.
    this.rocks = new THREE.InstancedMesh(moonRock(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), 6);
    this.rocks.frustumCulled = false;
    this.rocks.castShadow = true;
    this.rocks.count = 0;
    scene.add(this.rocks);

    // Frost Aura: frost on the ground out to its edge, and crystals standing round that.
    this.frostRing = flat(frostTexture());
    this.frostShards = new THREE.Mesh(iceShards(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.18, emissive: 0x4aa8d8, emissiveIntensity: 0.55, transparent: true, opacity: 0.92 }));
    this.frostShards.visible = false;
    scene.add(this.frostShards);

    // Bone Rain: bones on their way down, and the mark on the ground where each is going to land.
    const femur = new THREE.CylinderGeometry(0.13, 0.13, 1.9, 8), mark = markTexture();
    this.drops = Array.from({ length: 8 }, () => {
      const mesh = new THREE.Mesh(femur, new THREE.MeshStandardMaterial({ color: 0xe8dfc8, roughness: 0.6, emissive: 0x3a352a }));
      for (const y of [-0.95, 0.95]) for (const x of [-0.13, 0.13]) { const knob = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), mesh.material); knob.position.set(x, y, 0); mesh.add(knob); }
      props().then((P) => { if (P.power_femur) { mesh.clear(); mesh.geometry = P.power_femur; mesh.material.vertexColors = true; mesh.material.color.set(0xffffff); mesh.material.needsUpdate = true; } });   // (the bone modelled in Blender, when it arrives)
      mesh.visible = false;
      scene.add(mesh);
      return { mesh, mark: flat(mark), life: 0, at: new THREE.Vector3(), damage: 0, radius: 0 };
    });

    // Blood Pact: what comes back to you from the kill that paid for it.
    this.bloods = Array.from({ length: 10 }, () => ({ sprite: lightSprite(0xff2a22, 0.95), from: new THREE.Vector3(), life: 0 }));

    this.clock = 0;
    this.reset();
  }

  reset() {
    this.shieldHp = 0;
    this.sinceHit = 99;
    this.shieldFlash = 0;
    this.shieldWave = 1;
    this.tick = 0;          // shared timer for damage that ticks (gas, thorns)
    this.seekTimer = 0;
    this.boltTimer = 0;
    this.boltLife = 0;
    this.sinceDrop = 0;
    this.bubble.visible = this.hoop.visible = this.fireRing.visible = this.frostRing.visible = this.frostShards.visible = false;
    for (const p of this.cloud) p.visible = false;
    this.trail.forEach((t, i) => { t.life = 0; t.puff.visible = false; this.slicks.setMatrixAt(i, HIDDEN); });
    this.slicks.instanceMatrix.needsUpdate = true;
    this.orbs.count = this.rocks.count = 0;
    for (const g of this.orbGlow) g.visible = false;
    this.seekers.forEach((s, i) => { s.life = 0; s.flare.visible = false; this.skulls.setMatrixAt(i, HIDDEN); });
    this.skulls.instanceMatrix.needsUpdate = true;
    this.bolts.count = this.boltGlow.count = 0;
    this.boltLight.intensity = 0;
    this.rainTimer = 2;
    for (const d of this.drops) { d.life = 0; d.mesh.visible = d.mark.visible = false; }
    for (const o of this.bloods) { o.life = 0; o.sprite.visible = false; }
    for (const s of this.sparks) s.life = 0;
    this.sparkCol.fill(0);
    this.sparkPoints.geometry.attributes.color.needsUpdate = true;
    for (const f of this.flares) { f.life = 0; f.sprite.visible = false; }
    for (const r of this.ripples) { r.life = 0; r.mesh.visible = false; }
    this.pactKills = 0;
  }

  // Blood Pact: a monster has died (at x, y, z). Returns the HP that heals you (usually 0).
  onKill(x, y, z) {
    if (!level('pact')) return 0;
    const N = numbers('pact');
    if (++this.pactKills < N.every) return 0;
    this.pactKills = 0;
    if (x !== undefined) {   // (it comes back to you from where it was taken)
      for (let k = 0; k < 4; k++) {
        const o = this.bloods.find((s) => s.life <= 0);
        if (!o) break;
        o.life = 1 + k * 0.12;
        o.from.set(x + (Math.random() - 0.5) * 0.8, y + 0.6 + Math.random() * 0.9, z + (Math.random() - 0.5) * 0.8);
      }
      this.burst(x, y + 1, z, 0xff2018, 10, 4, 0.5, 6);
      playPowerHit('pact');
    }
    return N.heal;
  }

  // ---- Winning them ---------------------------------------------------------------

  // Levels a power-up up by one. Returns its new level.
  grant(id) {
    const p = stats.power[id];
    p.level = Math.min(POWERUPS[id].max, p.level + 1);
    if (id === 'shield') this.shieldHp = numbers('shield').capacity;   // comes up full
    return p.level;
  }

  // The shield, full (a run taken up again where it was left: main.js).
  refill() { if (level('shield')) this.shieldHp = numbers('shield').capacity; }

  // A random power-up that can still be levelled, or null if everything is maxed.
  random() {
    // Once you hold as many different ones as you're allowed, a zone can only level up what you have.
    const full = POWER_IDS.filter((id) => level(id) > 0).length >= config.hotbox.maxPowers;
    const open = POWER_IDS.filter((id) => level(id) < POWERUPS[id].max && (!full || level(id) > 0));
    return open.length ? open[Math.floor(Math.random() * open.length)] : null;
  }

  // "TozToxik III" style label for a power-up at its current level.
  label(id) { return `${POWERUPS[id].name} ${ROMAN[level(id)] || level(id)}`; }

  // What you own, for the HUD: [{ label, color }].
  owned() {
    return POWER_IDS.filter((id) => level(id) > 0).map((id) => ({ label: this.label(id), color: POWERUPS[id].color }));
  }

  // 0..1: how charged the shield is (0 if you don't have one).
  shieldCharge() { return level('shield') ? this.shieldHp / numbers('shield').capacity : 0; }

  // The shield takes the hit if it has any charge. Returns true if it did. (It shows where it was hit: on the side
  // of whatever is nearest, which is what did it more often than not.)
  absorb(damage) {
    if (this.shieldHp <= 0) return false;
    this.shieldHp = Math.max(0, this.shieldHp - damage);
    this.sinceHit = 0;
    this.shieldFlash = 1;
    this.shieldWave = 0;
    const near = this.horde ? this.nearest(this.horde.enemies, this.at, 30) : null, hit = this.bubble.material.uniforms.hit.value;
    if (near) hit.set(near.x - this.at.x, 0.25, near.z - this.at.z).normalize(); else hit.set(0, 0.2, 1).normalize();
    a.copy(hit).multiplyScalar(1.3).add(this.at).y += 1;
    this.burst(a.x, a.y, a.z, POWERUPS.shield.color, 16, 6, 0.4, 5);
    this.flare(a.x, a.y, a.z, 0xbfe4ff, 2.2, 0.22);
    return true;
  }

  // ---- What a hit looks like ------------------------------------------------------------

  // Sparks flung out from a place: `count` of them, at up to `speed`, lasting `life` seconds, falling at `fall`
  // (less than nothing: they rise).
  burst(x, y, z, color, count, speed, life, fall = 9) {
    for (let i = 0; i < count; i++) {
      const k = this.nextSpark++ % SPARKS, s = this.sparks[k];
      s.life = s.span = life * (0.6 + Math.random() * 0.7);
      s.vel.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.35 + Math.random() * 0.65));
      s.color.set(color);
      s.fall = fall;
      this.sparkPos[k * 3] = x; this.sparkPos[k * 3 + 1] = y; this.sparkPos[k * 3 + 2] = z;
    }
  }
  // A flash of light at a place, `size` metres across at its biggest.
  flare(x, y, z, color, size, time = 0.2) {
    const f = this.flares[this.nextFlare++ % FLARES];
    f.life = f.span = time;
    f.size = size;
    f.sprite.position.set(x, y, z);
    f.sprite.material.color.set(color);
    f.sprite.visible = true;
  }
  // A ring out across the ground from a place, to `radius`.
  ripple(x, y, z, color, radius, time = 0.4) {
    const r = this.ripples[this.nextRipple++ % RIPPLES];
    r.life = r.span = time;
    r.size = radius;
    r.mesh.position.set(x, y + 0.14, z);
    r.mesh.material.color.set(color);
    r.mesh.visible = true;
  }
  updateFx(dt) {
    const pos = this.sparkPos, col = this.sparkCol;
    let lit = false;
    for (let k = 0; k < SPARKS; k++) {
      const s = this.sparks[k];
      if (s.life <= 0) continue;
      lit = true;
      s.life -= dt;
      if (s.life <= 0) { col[k * 3] = col[k * 3 + 1] = col[k * 3 + 2] = 0; continue; }
      s.vel.y -= s.fall * dt;
      s.vel.multiplyScalar(1 - Math.min(0.9, 2.2 * dt));
      pos[k * 3] += s.vel.x * dt; pos[k * 3 + 1] += s.vel.y * dt; pos[k * 3 + 2] += s.vel.z * dt;
      const fade = (s.life / s.span) ** 1.3;
      col[k * 3] = s.color.r * fade; col[k * 3 + 1] = s.color.g * fade; col[k * 3 + 2] = s.color.b * fade;
    }
    this.sparkPoints.visible = lit;   // (with none of them alight there is nothing to draw)
    if (lit) {
      this.sparkPoints.geometry.attributes.position.needsUpdate = true;
      this.sparkPoints.geometry.attributes.color.needsUpdate = true;
    }
    for (const f of this.flares) {
      if (f.life <= 0) continue;
      f.life -= dt;
      const k = Math.max(0, f.life / f.span);
      f.sprite.visible = f.life > 0;
      f.sprite.scale.setScalar(f.size * (1.25 - 0.75 * k));   // (it opens out as it goes)
      f.sprite.material.opacity = k;
    }
    for (const r of this.ripples) {
      if (r.life <= 0) continue;
      r.life -= dt;
      const k = Math.max(0, r.life / r.span);
      r.mesh.visible = r.life > 0;
      r.mesh.scale.setScalar(r.size * (1 - k * k));
      r.mesh.material.opacity = 0.85 * k;
    }
  }

  // ---- Every frame ------------------------------------------------------------------

  // player: the skater (for speed). pos: where to draw things round him.
  update(dt, player, pos, horde) {
    this.clock += dt;
    this.at.copy(pos);
    this.horde = horde;
    const ticking = (this.tick -= dt) <= 0;   // gas and thorns bite four times a second
    if (ticking) this.tick = 0.25;
    const alive = horde.enemies;

    stats.gravity = (level('float') ? numbers('float').gravity : 1) * (LEVELS[world.level].gravity || 1);   // (the Moon's is low to begin with)

    this.updateShield(dt, pos);
    this.updateGas(dt, player, pos, horde, ticking);
    this.updateFire(dt, pos, horde);
    this.updateSeekers(dt, pos, horde, alive);
    this.updateThorns(dt, pos, horde, ticking);
    this.updateLightning(dt, pos, horde);
    this.updateFrost(dt, pos, horde, ticking);
    this.updateRain(dt, pos, horde, alive);
    this.updateRocks(dt, pos);
    this.updateBlood(dt, pos);
    this.updateFx(dt);
  }

  updateRocks(dt, pos) {
    const n = level('float') ? Math.min(6, 2 + level('float')) : 0;
    this.rocks.count = n;
    for (let i = 0; i < n; i++) {
      const ang = this.clock * (0.9 + 0.12 * i) + (i / n) * Math.PI * 2, r = 0.72 + 0.14 * Math.sin(this.clock * 0.7 + i * 2);
      this.rocks.setMatrixAt(i, m4.compose(a.set(pos.x + Math.cos(ang) * r, pos.y + 0.32 + 0.16 * Math.sin(this.clock * 1.6 + i * 1.9), pos.z + Math.sin(ang) * r),
        q.setFromEuler(e3.set(this.clock * (0.5 + 0.2 * i), i * 1.3 + this.clock * 0.4, i)), sc.setScalar(0.7 + 0.3 * ((i * 7) % 4) / 3)));
    }
    if (n) this.rocks.instanceMatrix.needsUpdate = true;
  }

  updateBlood(dt, pos) {
    for (const o of this.bloods) {
      if (o.life <= 0) continue;
      o.life -= dt * 2.6;
      const k = 1 - Math.min(1, Math.max(0, o.life));   // (0: where it was taken; 1: with you)
      o.sprite.visible = o.life > 0 && o.life <= 1;
      o.sprite.position.set(o.from.x + (pos.x - o.from.x) * k * k, o.from.y + (pos.y + 1.1 - o.from.y) * k + Math.sin(k * Math.PI) * 1.2, o.from.z + (pos.z - o.from.z) * k * k);
      o.sprite.scale.setScalar(0.55 + 0.35 * Math.sin(k * Math.PI));
      if (o.life <= 0) { this.flare(pos.x, pos.y + 1.1, pos.z, 0xff3024, 1.8, 0.25); this.burst(pos.x, pos.y + 1.1, pos.z, 0xff2a20, 5, 2.5, 0.35, 2); }
    }
  }

  updateFrost(dt, pos, horde, ticking) {
    const on = level('frost') > 0;
    this.frostRing.visible = this.frostShards.visible = on;
    if (!on) return;
    const N = numbers('frost'), breathe = 1 + 0.03 * Math.sin(this.clock * 3);
    this.frostRing.position.set(pos.x, pos.y + 0.12, pos.z);
    this.frostRing.scale.setScalar((N.radius / FROST_AT) * breathe);
    this.frostRing.rotation.y = this.clock * 0.25;
    this.frostRing.material.opacity = 0.8 + 0.15 * Math.sin(this.clock * 2.2);
    this.frostShards.position.set(pos.x, pos.y + 0.05, pos.z);
    this.frostShards.scale.setScalar(N.radius * breathe);
    this.frostShards.rotation.y = -this.clock * 0.25;
    // (snow, drifting down inside it)
    for (let n = dt * 16 + Math.random(); n >= 1; n--) {
      const ang = Math.random() * 6.283, r = Math.sqrt(Math.random()) * N.radius;
      this.burst(pos.x + Math.cos(ang) * r, pos.y + 0.4 + Math.random() * 2.2, pos.z + Math.sin(ang) * r, 0xcfeaff, 1, 0.5, 1.3, 0.9);
    }
    if (!ticking) return;
    for (const e of [...horde.enemies]) {
      if (e.rise < 1 || Math.abs(e.y - pos.y) > 6) continue;
      if (Math.hypot(e.x - pos.x, e.z - pos.z) > N.radius + (e.T.boss ? e.T.radius * e.scale : 0)) continue;
      const caught = !(e.chill > 0);   // (this is the moment it takes hold of it)
      horde.chill(e, 0.7, N.slow);
      horde.damage(e, N.dps * 0.25, 0, 0, false, 0, true);
      if (e.dead) continue;
      e.flash = 0;   // (it does not flinch at the cold: it is slowed by it, and goes blue)
      if (caught) {
        chest(e, a);
        this.burst(a.x, a.y, a.z, 0xd8f2ff, 9, 3.5, 0.5, 4);
        this.flare(a.x, a.y, a.z, 0xbfe6ff, 1.9, 0.22);
        playPowerHit('frost');
      }
    }
  }

  updateRain(dt, pos, horde, alive) {
    if (level('rain') && (this.rainTimer -= dt) <= 0) {
      const N = numbers('rain');
      this.rainTimer = N.every;
      const near = alive.filter((e) => e.rise >= 1 && Math.hypot(e.x - pos.x, e.z - pos.z) < N.range);
      for (let k = 0; k < N.strikes && near.length; k++) {
        const e = near[Math.floor(Math.random() * near.length)], d = this.drops.find((x) => x.life <= 0);
        if (!d) break;
        d.life = 0.5;
        d.at.set(e.x, e.y, e.z);
        d.damage = N.damage;
        d.radius = N.radius;
        d.mesh.visible = d.mark.visible = true;
      }
    }
    for (const d of this.drops) {
      if (d.life <= 0) continue;
      d.life -= dt;
      const coming = 1 - Math.max(0, d.life) / 0.5;   // (0: just let go of; 1: landing)
      d.mesh.position.set(d.at.x, d.at.y + Math.max(0, d.life) * 28, d.at.z);   // (half a second to fall 14 m)
      d.mesh.rotation.set(this.clock * 13, 0, 0.6);
      d.mark.position.set(d.at.x, d.at.y + 0.1, d.at.z);
      d.mark.scale.setScalar(d.radius * (1.25 - 0.25 * coming));   // (it closes in on where it will land)
      d.mark.rotation.y = this.clock * 2;
      d.mark.material.opacity = 0.35 + 0.65 * coming;
      if (d.life <= 0) {
        d.mesh.visible = d.mark.visible = false;
        horde.shockwave(d.at, d.radius, d.damage);
        this.flare(d.at.x, d.at.y + 0.6, d.at.z, 0xfff0d0, 5, 0.25);
        this.burst(d.at.x, d.at.y + 0.3, d.at.z, 0xe8dfc8, 26, 10, 0.7, 16);
        this.burst(d.at.x, d.at.y + 0.3, d.at.z, 0x9a8f7a, 14, 4, 0.9, 3);   // (and the dust of it)
        this.ripple(d.at.x, d.at.y, d.at.z, 0xfff0d0, d.radius, 0.35);
        playPowerHit('rain');
      }
    }
  }

  updateShield(dt, pos) {
    const on = level('shield') > 0;
    if (on) {
      const N = numbers('shield');
      this.sinceHit += dt;
      if (this.sinceHit > N.delay) this.shieldHp = Math.min(N.capacity, this.shieldHp + N.regen * dt);   // recharges once you've been left alone
    }
    this.shieldFlash = Math.max(0, this.shieldFlash - dt * 4);
    this.shieldWave = Math.min(1, this.shieldWave + dt * 2.6);
    this.bubble.visible = on && (this.shieldHp > 0 || this.shieldFlash > 0);
    if (!this.bubble.visible) return;
    const U = this.bubble.material.uniforms;
    this.bubble.position.set(pos.x, pos.y + 1, pos.z);
    this.bubble.scale.setScalar(1 + 0.1 * this.shieldFlash);
    U.time.value = this.clock;
    U.charge.value = this.shieldCharge();
    U.flash.value = this.shieldFlash;
    U.wave.value = this.shieldWave;
  }

  updateGas(dt, player, pos, horde, ticking) {
    const on = level('gas') > 0, N = on ? numbers('gas') : null, patchRadius = on ? N.radius * 0.8 : 0;
    if (on) {
      // Drop a patch every couple of metres travelled: the faster you go, the longer the trail.
      this.sinceDrop += player.speed * dt;
      while (this.sinceDrop >= 2.2) {
        this.sinceDrop -= 2.2;
        const t = this.trail[this.nextPatch++ % this.trail.length];
        t.life = t.total = N.linger;
        t.pos.copy(pos);
        const ground = heightAt(pos.x, pos.z);
        t.ground = pos.y - ground < 1.6 ? ground : null;   // (dropped from up in the air, it leaves nothing on the ground under it)
      }
      if (ticking) {
        let sick = 0;
        for (const e of [...horde.enemies]) {
          if (e.rise < 1 || Math.abs(e.y - pos.y) > 6) continue;
          const girth = e.T.boss ? e.T.radius * e.scale : 0;   // the boss is far wider than the rest
          let inGas = Math.hypot(e.x - pos.x, e.z - pos.z) < N.radius + girth;
          for (let i = 0; !inGas && i < this.trail.length; i++) {
            const t = this.trail[i];
            inGas = t.life > 0 && Math.hypot(e.x - t.pos.x, e.z - t.pos.z) < patchRadius + girth && Math.abs(e.y - t.pos.y) < 4;
          }
          if (!inGas) continue;
          horde.damage(e, N.dps * 0.25, 0, 0, false, 0, true);
          if (e.dead) continue;
          e.flash = 0;     // (it does not flinch at it: it sickens, and goes green)
          e.sick = 0.6;
          if (sick++ < 8) { chest(e, a); this.burst(a.x, a.y, a.z, 0x9dff5a, 3, 1.6, 0.7, -2.2); }   // (and it comes off it in bubbles)
        }
        if (sick) playPowerHit('gas');
      }
      for (const puff of this.cloud) {
        const u = puff.userData, ang = u.angle + this.clock * u.speed, r = u.reach * N.radius;
        puff.visible = true;
        puff.position.set(pos.x + Math.cos(ang) * r, pos.y + u.height, pos.z + Math.sin(ang) * r);
        puff.scale.setScalar(N.radius * 0.62 + Math.sin(this.clock * 1.3 + u.angle) * 0.5);
        puff.material.rotation = u.angle + this.clock * 0.3 * (u.speed - 0.9);
        puff.material.opacity = 0.2;
      }
    } else {
      for (const puff of this.cloud) puff.visible = false;
    }
    // (what is already lying about goes on thinning out, whether or not there is more coming)
    this.trail.forEach((t, i) => {
      if (t.life <= 0) return;
      t.life -= dt;
      const k = Math.max(0, t.life / t.total), size = (patchRadius || 3.2) * (1.5 + (1 - k) * 0.9);
      t.puff.visible = t.life > 0;
      t.puff.position.set(t.pos.x, t.pos.y + 0.55 + (1 - k) * 0.7, t.pos.z);   // (it lies low, where it can be seen over, and drifts upward as it thins)
      t.puff.scale.setScalar(size);
      t.puff.material.rotation = t.turn + this.clock * 0.25;
      t.puff.material.opacity = 0.2 * Math.min(1, k * 2.2);
      if (t.ground === null || t.life <= 0) this.slicks.setMatrixAt(i, HIDDEN);
      else {
        this.slicks.setMatrixAt(i, m4.compose(a.set(t.pos.x, t.ground + 0.07, t.pos.z), q.setFromAxisAngle(UP, t.turn), sc.setScalar((patchRadius || 3.2) * (0.4 + 0.15 * (1 - k)))));   // (a blot at each place he dropped it: a string of them, not a carpet)
        this.slicks.setColorAt(i, tint.setRGB(0.5, 0.72, 0.36).multiplyScalar(0.11 * Math.min(1, k * 2.5)));   // (a stain, not a light: it is there to be noticed, not looked at)
        if (Math.random() < dt * 0.8) this.burst(t.pos.x + (Math.random() - 0.5) * 2, t.ground + 0.15, t.pos.z + (Math.random() - 0.5) * 2, 0x6f9a3a, 1, 0.5, 1.1, -1.6);   // (a bubble comes up out of it)
      }
    });
    this.slicks.visible = this.trail.some((t) => t.life > 0);
    if (this.slicks.visible) { this.slicks.instanceMatrix.needsUpdate = true; this.slicks.instanceColor.needsUpdate = true; }
  }

  updateFire(dt, pos, horde) {
    const N = level('fire') ? numbers('fire') : null, n = N ? N.orbs : 0;
    this.orbs.count = n;
    this.fireRing.visible = !!N;
    this.orbGlow.forEach((g, i) => { g.visible = i < n; });
    if (!N) return;
    // How far they reach, on the ground.
    this.fireRing.position.set(pos.x, pos.y + 0.1, pos.z);
    this.fireRing.scale.setScalar(N.radius / RING_AT);
    this.fireRing.rotation.y = -this.clock * 0.7;
    this.fireRing.material.opacity = 0.7 + 0.25 * Math.sin(this.clock * 9) * Math.sin(this.clock * 5.3);
    for (let i = 0; i < n; i++) {
      // The ring breathes in and out as it turns, so it sweeps the ground between you and its edge
      // (otherwise monsters standing right next to you would be safely inside it).
      const ang = this.clock * N.spin + (i / n) * Math.PI * 2;
      const r = 1.3 + (N.radius - 1.3) * (0.5 + 0.5 * Math.sin(this.clock * 1.9 + i * 0.5));
      const at = this.orbAt[i].set(pos.x + Math.cos(ang) * r, pos.y + 0.9 + Math.sin(this.clock * 3 + i) * 0.12, pos.z + Math.sin(ang) * r);
      // (it flies the way it is going, turning about that as a flame does)
      q.setFromUnitVectors(Z, a.set(-Math.sin(ang), 0, Math.cos(ang))).multiply(q2.setFromAxisAngle(Z, this.clock * 7 + i));
      this.orbs.setMatrixAt(i, m4.compose(at, q, sc.setScalar(1 + 0.1 * Math.sin(this.clock * 17 + i * 2.3))));
      this.orbGlow[i].position.copy(at);
      this.orbGlow[i].scale.setScalar(2 + 0.3 * Math.sin(this.clock * 13 + i));
      if (Math.random() < dt * 46) this.burst(at.x, at.y, at.z, i % 2 ? 0xff8a2a : 0xffc04a, 1, 0.7, 0.34, -1);   // (and leaves a streak of sparks behind it)
      // Set alight whatever it passes through (each monster at most a couple of times a second).
      for (const e of [...horde.enemies]) {
        if (e.rise < 1 || (e.burnAt || 0) > this.clock) continue;
        const dx = e.x - at.x, dz = e.z - at.z, reach = 0.75 + e.T.radius * e.scale;
        if (dx * dx + dz * dz >= reach * reach || at.y < e.y - 0.3 || at.y > e.y + e.T.height * e.scale + 0.3) continue;
        e.burnAt = this.clock + 0.4;
        const d = Math.hypot(e.x - pos.x, e.z - pos.z) || 1;
        chest(e, b);
        horde.damage(e, N.damage, (e.x - pos.x) / d, (e.z - pos.z) / d, false, 0.6, true);
        if (!e.dead) horde.ignite(e, N.burn, (N.damage * 0.2) / N.burn);
        this.flare(b.x, b.y, b.z, 0xffb04a, 3, 0.22);
        this.burst(b.x, b.y, b.z, 0xff9a30, 14, 7, 0.5, 5);
        this.burst(b.x, b.y, b.z, 0xffe08a, 6, 3, 0.35, -3);
        playPowerHit('fire');
      }
    }
    this.orbs.instanceMatrix.needsUpdate = true;
  }

  updateSeekers(dt, pos, horde, alive) {
    if (level('seekers')) {
      const N = numbers('seekers');
      if ((this.seekTimer -= dt) <= 0) {
        this.seekTimer = N.every;
        // Send a skull at each of the nearest few monsters.
        const targets = alive.filter((e) => e.rise >= 1).map((e) => [Math.hypot(e.x - pos.x, e.z - pos.z), e]).filter(([d]) => d < N.range).sort((p, r) => p[0] - r[0]).slice(0, N.volley);
        targets.forEach(([, e], i) => {
          const s = this.seekers.find((x) => x.life <= 0);
          if (!s) return;
          s.life = 3.2;
          s.target = e;
          s.damage = N.damage;
          s.pos.set(pos.x, pos.y + 1.6, pos.z);
          const ang = this.clock * 3 + i * 2.1;
          s.vel.set(Math.cos(ang) * 6, 9, Math.sin(ang) * 6);   // they leap up and out, then swing round onto their target
          this.flare(s.pos.x, s.pos.y, s.pos.z, POWERUPS.seekers.color, 1.4, 0.18);
        });
      }
    }
    this.seekers.forEach((s, i) => {
      if (s.life <= 0) { s.flare.visible = false; return; }
      s.life -= dt;
      if (!s.target || s.target.hp <= 0) s.target = this.nearest(alive, s.pos, 40);   // target gone: find another
      if (s.target) {
        const e = s.target;
        a.set(e.x, e.y + e.T.height * e.scale * 0.6, e.z).sub(s.pos);
        const dist = a.length();
        if (dist < 0.9) {
          horde.damage(e, s.damage, a.x / (dist || 1), a.z / (dist || 1), false, 1, true);
          s.life = 0;
          this.flare(s.pos.x, s.pos.y, s.pos.z, 0xd9c2ff, 2.6, 0.22);
          this.burst(s.pos.x, s.pos.y, s.pos.z, 0xb98aff, 12, 7, 0.45, 6);
          this.burst(s.pos.x, s.pos.y, s.pos.z, 0xf1e9ff, 7, 5, 0.5, 14);   // (and what is left of the skull)
          playPowerHit('seekers');
        } else s.vel.lerp(a.multiplyScalar(30 / dist), Math.min(1, 7 * dt));
      }
      s.pos.addScaledVector(s.vel, dt);
      const flying = s.life > 0;
      s.flare.visible = flying;
      if (!flying) { this.skulls.setMatrixAt(i, HIDDEN); return; }
      // (it looks where it is going, and chatters)
      this.skulls.setMatrixAt(i, m4.compose(s.pos, q.setFromUnitVectors(Z, a.copy(s.vel).normalize()).multiply(q2.setFromAxisAngle(Z, 0.25 * Math.sin(this.clock * 22 + i))), sc.setScalar(1)));
      s.flare.position.copy(s.pos).addScaledVector(a, -0.25);
      s.flare.scale.setScalar(1.15);
      if (Math.random() < dt * 40) this.burst(s.pos.x, s.pos.y, s.pos.z, 0xa57aff, 1, 0.6, 0.4, -0.5);
    });
    this.skulls.visible = this.seekers.some((s) => s.life > 0);
    if (this.skulls.visible) this.skulls.instanceMatrix.needsUpdate = true;
  }

  updateThorns(dt, pos, horde, ticking) {
    const on = level('thorns') > 0;
    this.hoop.visible = on;
    if (!on) return;
    const N = numbers('thorns');
    this.hoop.position.set(pos.x, pos.y + 0.75, pos.z);
    this.hoop.rotation.set(0.08 * Math.sin(this.clock * 2.1), this.clock * 5, 0.08 * Math.cos(this.clock * 1.7));
    this.hoop.scale.setScalar(N.radius * 0.55);
    if (!ticking) return;
    let torn = 0;
    for (const e of [...horde.enemies]) {
      const dx = e.x - pos.x, dz = e.z - pos.z, d = Math.hypot(dx, dz) || 1;
      if (e.rise < 1 || d >= N.radius + e.T.radius * e.scale || Math.abs(e.y - pos.y) >= 2.2) continue;
      horde.damage(e, N.dps * 0.25, dx / d, dz / d, false, N.knock, true);
      if (torn++ < 6) {   // (where the hoop met it)
        const r = Math.min(d, N.radius * 0.75);
        a.set(pos.x + (dx / d) * r, pos.y + 0.8, pos.z + (dz / d) * r);
        this.burst(a.x, a.y, a.z, 0xd0201b, 6, 6, 0.4, 14);
        this.burst(a.x, a.y, a.z, 0xdfe6ea, 4, 8, 0.25, 8);
        this.flare(a.x, a.y, a.z, 0xffd0c8, 1.3, 0.14);
      }
    }
    if (torn) playPowerHit('thorns');
  }

  updateLightning(dt, pos, horde) {
    if (level('lightning') && (this.boltTimer -= dt) <= 0) {
      const N = numbers('lightning');
      this.boltTimer = N.every;
      // Hit the nearest monster, then keep jumping to the nearest one not yet hit.
      const hit = new Set();
      let from = a.set(pos.x, pos.y + 1.3, pos.z).clone(), reach = N.range, pieces = 0;
      for (let j = 0; j <= N.jumps; j++) {
        const e = this.nearest(horde.enemies, from, reach, hit);
        if (!e) break;
        hit.add(e);
        const to = new THREE.Vector3(e.x, e.y + e.T.height * e.scale * 0.6, e.z);
        pieces = this.drawBolt(from, to, pieces);
        horde.damage(e, N.damage, 0, 0, false, 0.5, true);
        this.flare(to.x, to.y, to.z, 0xe6fbff, 3.4, 0.2);
        this.burst(to.x, to.y, to.z, 0x9fe8ff, 12, 9, 0.35, 10);
        from = to;
        reach = N.hop;
      }
      if (pieces) {
        this.bolts.count = this.boltGlow.count = pieces;
        this.bolts.instanceMatrix.needsUpdate = this.boltGlow.instanceMatrix.needsUpdate = true;
        this.boltLife = 1;
        this.boltLight.position.copy(from);
        this.boltLight.intensity = 300;
        playPowerHit('lightning');
      }
    }
    this.boltLife = Math.max(0, this.boltLife - dt * 5);
    this.bolts.material.opacity = Math.min(1, this.boltLife * 1.6) * (0.75 + 0.25 * Math.sin(this.clock * 90));   // (it flickers as it goes)
    this.boltGlow.material.opacity = 0.4 * this.boltLife;
    this.bolts.visible = this.boltGlow.visible = this.boltLife > 0;
    this.boltLight.intensity *= Math.exp(-20 * dt);
  }

  // A jagged line of bars from one point to another, with a fork or two off it. Returns the new count of bars used.
  drawBolt(from, to, used) {
    const steps = 6, bar = (p, n, thick) => {
      const len = p.distanceTo(n);
      q.setFromUnitVectors(Z, b.copy(n).sub(p).normalize());
      b.copy(p).lerp(n, 0.5);
      this.bolts.setMatrixAt(used, m4.compose(b, q, sc.set(0.07 * thick, 0.07 * thick, len)));
      this.boltGlow.setMatrixAt(used++, m4.compose(b, q, sc.set(0.34 * thick, 0.34 * thick, len)));
    };
    let last = from.clone();
    for (let i = 1; i <= steps && used < 126; i++) {
      const next = from.clone().lerp(to, i / steps);
      if (i < steps) next.add(a.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(1.3));
      bar(last, next, 1);
      if (i < steps && Math.random() < 0.4 && used < 126) bar(next, next.clone().add(a.set(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).multiplyScalar(2.2)), 0.55);   // (a fork: it goes nowhere)
      last = next;
    }
    return used;
  }

  // The closest live monster to a point within `range`, skipping any in `except`.
  nearest(enemies, point, range, except) {
    let best = null, bestDist = range;
    for (const e of enemies) {
      if (e.rise < 1 || e.hp <= 0 || (except && except.has(e))) continue;
      const d = Math.hypot(e.x - point.x, e.z - point.z);
      if (d < bestDist) { best = e; bestDist = d; }
    }
    return best;
  }
}
