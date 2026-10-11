// The casino: a grand Monte Carlo gaming room you walk round on foot, with a
// blackjack table in the middle of it. This file builds the room and everything
// you can see in it: Kirky walking and sitting, the camera, the dealer (Babitus
// Goyitus, a zombie in a dinner suit who wears more jewels the more the players lose),
// and the cards and chips on the table. The game itself is in blackjack.js;
// casino.js ties them together.
import * as THREE from 'three';
import { SkaterModel } from '../player/skaterModel.js';
import { createEmoter } from '../player/emotes.js';
import { Bar, DRINKS } from './bar.js';
import { WHEEL, SPOTS, LAYOUT, colour } from './roulette.js';
import { config } from '../config.js';
import { playGulp, playGlassDown, playLaugh, playThunder, playHic, playWoozy, playGurgle, playRetch, playSplash } from '../fx/audio.js';

const W = 38, D = 30, H = 9;                       // the room: width (x), depth (z), height
const TABLE = new THREE.Vector3(0, 0, -5);         // where the blackjack table stands (the dealer is on its -z side)
const FELT_Y = 1.02, CARD_W = 0.27, CARD_H = 0.378;   // table height; card size (oversized so they read)
const STOOL = 3.05, STOOL_Y = 0.78;                // how far out the stools are, and how high
const SEAT_ANGLES = [-64, -32, 0, 32, 64];         // degrees round the table's curved edge, left to right
const SUIT_SYMBOL = { S: '♠', H: '♥', D: '♦', C: '♣' };
const TAU = Math.PI * 2;
const GLOAT_TIME = 3.6;                            // seconds of the dealer's cut-in when he makes a long 21
const SICK_TIME = 6.4;                             // seconds of the cut-in when it all comes back up
const SICK_AFTER = 5;                              // drinks before it does
const CUT_OFF = 40;                                // seconds the barman refuses to serve you afterwards
const SKIN = new THREE.Color(0xc99873), QUEASY = new THREE.Color(0x8fae5e);
const WIN_TIME = 3.4;                              // seconds of the cut-in for a big win on the slots
const ROU = new THREE.Vector3(-6.5, 0, 5.5);       // where the roulette table stands (you play it from its +z side)
const ROU_WHEEL_X = -1.6, ROU_LAYOUT_X = 0.95, ROU_CELL = 0.2;   // along the table: the wheel, the middle of the layout; the size of one layout cell
const ROU_DISC = 0.68, ROU_RIM = 0.74, ROU_POCKET = 0.39;        // the wheel: its radius, where the ball runs, where it comes to rest
const ROU_DROP = 4.2, ROU_CALL = 4.7, ROU_END = 6.2, ROU_CHEER = 1.7;   // a spin, in seconds: the ball is home; the number is called; it's over; (winners) celebrating
const CROUPIER_X = -0.55;                          // where the croupier stands along the roulette table (the wheel is on his right)
const WOOZY_TIME = 4.8;                            // seconds of the cut-in when the drink catches up with you
const TIPSY_AFTER = 3;                             // drinks before it does
const SMOKE_TIME = 4.4;                            // seconds of the cut-in for a smoke at the blackjack table
const DRINK_TIME = 3.6;                            // seconds to down a drink
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (k) => { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); };
const v = new THREE.Vector3(), v2 = new THREE.Vector3();

// What Babitus puts on as the house's winnings grow: [gold taken from the players, what appears].
const RICHES = [
  [100, 'ring'], [250, 'watch'], [500, 'chain'], [900, 'diamonds'], [1400, 'hat'],
  [2200, 'teeth'], [3500, 'medallion'], [5000, 'fur'], [8000, 'hoard'], [12000, 'throne'],
];

// ---- Painted textures -------------------------------------------------------------

function paint(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  if (repeat) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(...repeat); }
  return tex;
}

// Veins through a slab of marble.
function veins(g, x, y, w, h, color, count) {
  g.strokeStyle = color;
  for (let i = 0; i < count; i++) {
    g.lineWidth = 0.6 + Math.random() * 1.4;
    g.beginPath();
    let px = x + Math.random() * w, py = y;
    g.moveTo(px, py);
    while (py < y + h) { px += (Math.random() - 0.5) * 26; py += 8 + Math.random() * 14; g.lineTo(Math.max(x, Math.min(x + w, px)), Math.min(y + h, py)); }
    g.stroke();
  }
}

// Polished marble floor: cream and black squares set on the diagonal, with thin gold lines between.
const marbleFloor = () => paint(256, 256, (g, s) => {
  const h = s / 2;
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    const dark = (i + j) % 2;
    g.fillStyle = dark ? '#1c1a1d' : '#ece4d2';
    g.fillRect(i * h, j * h, h, h);
    veins(g, i * h, j * h, h, h, dark ? 'rgba(255, 255, 255, 0.13)' : 'rgba(120, 100, 80, 0.3)', 4);
  }
  g.strokeStyle = '#c9a44a';
  g.lineWidth = 3;
  g.strokeRect(0, 0, h, h); g.strokeRect(h, h, h, h);
}, [W / 3, D / 3]);

// Walls: cream panels framed in gold leaf above a dark marble dado.
const wallPanels = () => paint(256, 512, (g, w, h) => {
  g.fillStyle = '#e9dfc8';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#c9a44a';
  g.lineWidth = 6; g.strokeRect(22, 30, w - 44, h - 190);
  g.lineWidth = 2; g.strokeRect(34, 42, w - 68, h - 214);
  g.fillStyle = '#c9a44a';
  for (const [x, y] of [[w / 2, 30], [w / 2, h - 160]]) { g.beginPath(); g.ellipse(x, y, 20, 9, 0, 0, TAU); g.fill(); }   // a flourish top and bottom
  g.fillStyle = '#2a2326';                 // the dado
  g.fillRect(0, h - 130, w, 130);
  veins(g, 0, h - 130, w, 130, 'rgba(255, 255, 255, 0.14)', 5);
  g.fillStyle = '#c9a44a';
  g.fillRect(0, h - 138, w, 9); g.fillRect(0, 0, w, 12);
});

// Coffered ceiling: sunken cream squares with a gold rosette in each.
const coffers = () => paint(128, 128, (g, s) => {
  g.fillStyle = '#c9a44a';
  g.fillRect(0, 0, s, s);
  g.fillStyle = '#d8ccb0';
  g.fillRect(8, 8, s - 16, s - 16);
  g.fillStyle = '#efe6d2';
  g.fillRect(18, 18, s - 36, s - 36);
  g.fillStyle = '#c9a44a';
  for (let k = 0; k < 8; k++) { g.beginPath(); g.ellipse(s / 2 + Math.cos(k * 0.785) * 12, s / 2 + Math.sin(k * 0.785) * 12, 9, 5, k * 0.785, 0, TAU); g.fill(); }
  g.beginPath(); g.arc(s / 2, s / 2, 7, 0, TAU); g.fill();
}, [W / 3, D / 3]);

// A tall arched window on the harbour at night: moon, a ridge of hills, lights on the water, yachts.
const harbourWindow = () => paint(256, 512, (g, w, h) => {
  g.fillStyle = '#e9dfc8';
  g.fillRect(0, 0, w, h);
  const arch = () => { g.beginPath(); g.moveTo(26, h - 20); g.lineTo(26, 150); g.arc(w / 2, 150, w / 2 - 26, Math.PI, 0); g.lineTo(w - 26, h - 20); g.closePath(); };
  arch();
  g.save();
  g.clip();
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#0a1230'); sky.addColorStop(0.62, '#1d2f5c'); sky.addColorStop(0.63, '#0b1836'); sky.addColorStop(1, '#050b1c');
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#fff3d0';
  g.beginPath(); g.arc(178, 120, 20, 0, TAU); g.fill();
  for (let i = 0; i < 40; i++) g.fillRect(Math.random() * w, Math.random() * 280, 1.5, 1.5);   // stars
  g.fillStyle = '#0c1326';   // the hills behind the port
  g.beginPath(); g.moveTo(0, 322); g.quadraticCurveTo(70, 250, 130, 300); g.quadraticCurveTo(190, 262, w, 310); g.lineTo(w, 322); g.closePath(); g.fill();
  for (let i = 0; i < 70; i++) {   // the town's lights, and their reflections
    const x = Math.random() * w, y = 285 + Math.random() * 36;
    g.fillStyle = ['#ffd27a', '#ffe9b8', '#ff9a5a'][i % 3];
    g.fillRect(x, y, 2, 2);
    g.globalAlpha = 0.25; g.fillRect(x, 324 + (y - 285) * 2.2, 2, 12); g.globalAlpha = 1;
  }
  g.fillStyle = '#f1f1f4';   // two yachts
  for (const [x, y, s] of [[70, 400, 1], [170, 440, 1.3]]) { g.beginPath(); g.moveTo(x - 26 * s, y); g.lineTo(x + 30 * s, y); g.lineTo(x + 22 * s, y + 8 * s); g.lineTo(x - 20 * s, y + 8 * s); g.closePath(); g.fill(); g.fillRect(x - 12 * s, y - 7 * s, 24 * s, 7 * s); }
  g.restore();
  g.strokeStyle = '#c9a44a';   // gilded frame and glazing bars
  g.lineWidth = 9; arch(); g.stroke();
  g.lineWidth = 3;
  g.beginPath(); g.moveTo(w / 2, 48); g.lineTo(w / 2, h - 20); g.moveTo(26, 150); g.lineTo(w - 26, 150); g.moveTo(26, 330); g.lineTo(w - 26, 330); g.stroke();
});

// Red rug with a gold border, for under the table and down the middle of the room.
const rug = () => paint(256, 256, (g, s) => {
  g.fillStyle = '#5a0f1a';
  g.fillRect(0, 0, s, s);
  g.strokeStyle = '#c9a44a';
  g.lineWidth = 8; g.strokeRect(12, 12, s - 24, s - 24);
  g.lineWidth = 2; g.strokeRect(26, 26, s - 52, s - 52);
  g.fillStyle = '#7a1826';
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const x = 52 + i * 51, y = 52 + j * 51; g.beginPath(); g.moveTo(x, y - 16); g.lineTo(x + 16, y); g.lineTo(x, y + 16); g.lineTo(x - 16, y); g.closePath(); g.fill(); }
});

// A sign: text on a board. Returns the mesh, with redraw(lines) to change what it says.
function sign(lines, width, height, { color = '#c9a44a', board = '#17120f', size = 0.5 } = {}) {
  const c = document.createElement('canvas');
  c.width = 768; c.height = Math.round((768 * height) / width);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  mesh.redraw = (text) => {
    const g = c.getContext('2d'), w = c.width, h = c.height;
    g.fillStyle = board;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = color;
    g.lineWidth = 8; g.strokeRect(8, 8, w - 16, h - 16);
    g.lineWidth = 2; g.strokeRect(22, 22, w - 44, h - 44);
    g.fillStyle = color;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    text.forEach((line, i) => {
      const px = (h / (text.length + 0.7)) * size * 2 * (i === 0 ? 1 : 0.72);
      g.font = `${px}px Anton, Impact, sans-serif`;
      g.fillText(line, w / 2, (h * (i + 0.85)) / (text.length + 0.7), w - 60);
    });
    tex.needsUpdate = true;
  };
  mesh.redraw(lines);
  return mesh;
}

const faces = {};
function cardFace(card) {
  const key = card.r + card.s;
  if (!faces[key]) {
    faces[key] = paint(160, 224, (g, w, h) => {
      const red = card.s === 'H' || card.s === 'D';
      g.fillStyle = '#f6f2e6';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#1a1a1c';
      g.lineWidth = 5;
      g.strokeRect(3, 3, w - 6, h - 6);
      g.fillStyle = red ? '#c8201b' : '#16161a';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = '62px Anton, Impact, sans-serif';
      g.fillText(card.r, 40, 42);
      g.font = '48px serif';
      g.fillText(SUIT_SYMBOL[card.s], 40, 96);
      g.font = '120px serif';
      g.fillText(SUIT_SYMBOL[card.s], w / 2 + 22, h / 2 + 34);
    });
  }
  return faces[key];
}

// ---- The room -----------------------------------------------------------------------

export class CasinoRoom {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0508);
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
    const std = (color, roughness = 0.8, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
    const add = (geometry, material, x, y, z, parent = this.scene) => {
      const m = new THREE.Mesh(geometry, material);
      m.position.set(x, y, z);
      parent.add(m);
      return m;
    };
    this.std = std;
    this.add = add;
    const gold = (this.gold = std(0xd9b24a, 0.3, { metalness: 0.35, emissive: 0x3a2a08 }));
    const marble = std(0xefe8da, 0.25), darkMarble = std(0x2a2326, 0.25), velvet = std(0x6a0f1c, 0.9);
    const glow = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: false });

    // Shell: marble floor, panelled walls, coffered ceiling.
    add(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), std(0xffffff, 0.22, { map: marbleFloor() }), 0, 0, 0);
    add(new THREE.PlaneGeometry(W, D).rotateX(Math.PI / 2), std(0xffffff, 0.9, { map: coffers() }), 0, H, 0);
    for (const [w, x, z, turn] of [[W, 0, -D / 2, 0], [W, 0, D / 2, Math.PI], [D, -W / 2, 0, Math.PI / 2], [D, W / 2, 0, -Math.PI / 2]]) {
      const tex = wallPanels();
      tex.wrapS = THREE.RepeatWrapping;
      tex.repeat.set(w / 4.5, 1);
      add(new THREE.PlaneGeometry(w, H), std(0xffffff, 0.85, { map: tex }), x, H / 2, z).rotation.y = turn;
      add(new THREE.BoxGeometry(w, 0.35, 0.3), gold, x, H - 0.18, z).rotation.y = turn;   // cornice
    }
    add(new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2), std(0xffffff, 0.95, { map: rug() }), TABLE.x, 0.012, TABLE.z + 0.6);        // rug under the table...
    const runner = rug();
    runner.wrapT = THREE.RepeatWrapping;
    runner.repeat.set(1, 3);
    add(new THREE.PlaneGeometry(3.4, 11).rotateX(-Math.PI / 2), std(0xffffff, 0.95, { map: runner }), 0, 0.01, 9.4);                       // ...and a runner from the door

    // Light: warm and generous, from three crystal chandeliers.
    this.scene.add(new THREE.HemisphereLight(0xfff0d8, 0x4a3a30, 0.8));
    const crystal = glow(0xfff6e0), bulb = glow(0xffd9a0);
    this.crystals = [];
    for (const [x, z, big] of [[0, -5, 1.25], [-10, 5, 1], [10, 5, 1], [0, 10, 0.8]]) {
      const lamp = new THREE.PointLight(0xffd9a8, 95 * big, 34, 1.6);
      lamp.position.set(x, H - 2.6, z);
      this.scene.add(lamp);
      const c = new THREE.Group();
      c.position.set(x, H, z);
      add(new THREE.CylinderGeometry(0.035, 0.035, 1.3, 6), gold, 0, -0.65, 0, c);
      for (const [r, y, n] of [[1.15 * big, -1.7, 12], [0.7 * big, -1.25, 8], [0.35 * big, -2.15, 6]]) {   // three tiers
        add(new THREE.TorusGeometry(r, 0.035, 6, 28).rotateX(Math.PI / 2), gold, 0, y, 0, c);
        for (let k = 0; k < n; k++) {
          const a = (k / n) * TAU, cx = Math.cos(a) * r, cz = Math.sin(a) * r;
          add(new THREE.SphereGeometry(0.07, 8, 6), bulb, cx, y + 0.12, cz, c);                              // candle bulbs
          this.crystals.push(add(new THREE.OctahedronGeometry(0.07), crystal, cx, y - 0.2, cz, c));           // hanging crystals
        }
      }
      this.crystals.push(add(new THREE.OctahedronGeometry(0.17), crystal, 0, -2.5, 0, c));
      this.scene.add(c);
    }

    // Marble columns with gilded bases and capitals, down both sides.
    for (const x of [-12.5, 12.5]) for (const z of [-11, -4, 3, 10]) {
      add(new THREE.CylinderGeometry(0.45, 0.5, H - 1.2, 20), marble, x, H / 2, z);
      add(new THREE.CylinderGeometry(0.62, 0.7, 0.6, 20), gold, x, 0.3, z);
      add(new THREE.CylinderGeometry(0.8, 0.5, 0.6, 20), gold, x, H - 0.3, z);
    }

    // Arched windows on the harbour, each between heavy velvet drapes.
    const view = harbourWindow();
    const windowAt = (x, z, turn) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = turn;
      add(new THREE.PlaneGeometry(3.4, 6.6), new THREE.MeshBasicMaterial({ map: view, toneMapped: false }), 0, 3.9, 0.04, g);
      for (const s of [-1, 1]) for (let k = 0; k < 3; k++) add(new THREE.CylinderGeometry(0.2, 0.26, 6.8, 8), velvet, s * (2.05 + k * 0.3), 3.8, 0.22, g);   // drape folds
      add(new THREE.CylinderGeometry(0.06, 0.06, 5.6, 8).rotateZ(Math.PI / 2), gold, 0, 7.3, 0.25, g);                                                       // curtain pole
      this.scene.add(g);
    };
    for (const x of [-11, 11]) windowAt(x, -D / 2, 0);
    for (const z of [-7.5, 0, 7.5]) windowAt(-W / 2, z, Math.PI / 2);
    for (const z of [7.5]) windowAt(W / 2, z, -Math.PI / 2);

    // Signs.
    const title = sign(['CASINO DE DEADSLIDE', 'MONTE-CARLO'], 9, 2.2, { size: 0.5 });
    title.position.set(0, H - 2.0, D / 2 - 0.06);
    title.rotation.y = Math.PI;
    const rules = sign(['BLACKJACK PAYS 3 TO 2', 'DEALER STANDS ON 17'], 5.6, 1.3, { size: 0.42 });
    rules.position.set(TABLE.x - 5.2, 5.2, -D / 2 + 0.06);
    this.houseSign = sign(['BABITUS GOYITUS', 'THE HOUSE HAS TAKEN 0'], 5.6, 1.3, { size: 0.42, color: '#ffd76a' });
    this.houseSign.position.set(TABLE.x + 5.2, 5.2, -D / 2 + 0.06);
    this.scene.add(title, rules, this.houseSign);

    // Gilded statues on marble plinths either side of the table, and palms in the corners.
    for (const x of [-7, 7]) {
      add(new THREE.BoxGeometry(1.1, 1.3, 1.1), darkMarble, x, 0.65, -12.2);
      add(new THREE.CylinderGeometry(0.2, 0.34, 1.5, 12), gold, x, 2.05, -12.2);       // robes...
      add(new THREE.SphereGeometry(0.26, 12, 10), gold, x, 2.6, -12.2);                // ...shoulders...
      add(new THREE.SphereGeometry(0.17, 12, 10), gold, x, 3.0, -12.2);                // ...head
      add(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 6), gold, x + 0.3, 2.9, -12.2).rotation.z = -0.5;   // an arm raised
    }
    const leaf = std(0x1f5a32, 0.8, { side: THREE.DoubleSide });
    for (const [x, z] of [[-16.5, -12.8], [16.5, -12.8], [-16.5, 12.8], [16.5, 12.8]]) {
      add(new THREE.CylinderGeometry(0.55, 0.4, 0.9, 14), gold, x, 0.45, z);
      add(new THREE.CylinderGeometry(0.09, 0.13, 2.6, 8), std(0x4a3320, 0.9), x, 2.1, z);
      for (let k = 0; k < 9; k++) {
        const frond = add(new THREE.ConeGeometry(0.28, 2.2, 4).scale(1, 1, 0.12).translate(0, 1.1, 0), leaf, x, 3.3, z);
        frond.rotation.set(0, (k / 9) * TAU, 1.05 + (k % 3) * 0.18);
        frond.rotation.order = 'YXZ';
      }
    }

    // Velvet ropes on gold posts, either side of the way in.
    const rope = std(0x8a1626, 0.8);
    for (const s of [-1, 1]) {
      const zs = [12.4, 9.6, 6.8];
      zs.forEach((z, i) => {
        add(new THREE.CylinderGeometry(0.05, 0.05, 1.05, 8), gold, s * 2.3, 0.525, z);
        add(new THREE.SphereGeometry(0.09, 10, 8), gold, s * 2.3, 1.1, z);
        add(new THREE.CylinderGeometry(0.2, 0.22, 0.05, 12), gold, s * 2.3, 0.025, z);
        if (i) add(new THREE.TorusGeometry(1.5, 0.035, 6, 14, 1.9).rotateZ(Math.PI + 0.62).rotateY(Math.PI / 2), rope, s * 2.3, 2.08, (z + zs[i - 1]) / 2);   // the rope sagging between posts
      });
    }

    this.buildRoulette();

    // Slot machines along the left wall. Walk up to one to play it (the game itself is in slots.js).
    const cabinet = std(0x1b1014, 0.4), chrome = std(0xb9bec4, 0.25, { metalness: 0.6 });
    this.screens = [];
    this.machines = [];   // { stand: where you play it from, lever }
    for (const z of [-11.2, -3.8, 3.7, 11.2]) {
      const g = new THREE.Group();
      g.position.set(-W / 2 + 0.85, 0, z);
      g.rotation.y = Math.PI / 2;
      add(new THREE.BoxGeometry(1.1, 2.3, 1), cabinet, 0, 1.15, 0, g);
      add(new THREE.BoxGeometry(1.16, 0.28, 1.06), gold, 0, 2.42, 0, g);
      add(new THREE.BoxGeometry(1.16, 0.1, 1.06), gold, 0, 0.05, 0, g);
      this.screens.push(add(new THREE.PlaneGeometry(0.85, 0.6), glow(0x7dffb0), 0, 1.55, 0.51, g));
      const lever = new THREE.Group();   // hinged at the bottom, so it can be pulled
      lever.position.set(0.66, 1.0, 0.2);
      add(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 6), chrome, 0, 0.3, 0, lever);
      add(new THREE.SphereGeometry(0.08, 8, 6), glow(0xc8201b), 0, 0.62, 0, lever);
      g.add(lever);
      this.machines.push({ stand: new THREE.Vector3(-W / 2 + 2.25, 0, z), lever });
      this.scene.add(g);
    }

    // The bar on the right: a marble counter with a gilded front, bottles against a mirror, stools.
    add(new THREE.BoxGeometry(1.3, 1.15, 12), darkMarble, W / 2 - 3.1, 0.575, -4);
    add(new THREE.BoxGeometry(0.06, 0.9, 11.6), gold, W / 2 - 3.78, 0.6, -4);
    add(new THREE.BoxGeometry(1.7, 0.1, 12.4), marble, W / 2 - 3.1, 1.2, -4);
    add(new THREE.PlaneGeometry(11.4, 3.6), std(0x9fb6c4, 0.08, { metalness: 0.85 }), W / 2 - 0.08, 3.4, -4).rotation.y = -Math.PI / 2;   // mirror
    for (const y of [2.1, 3.2, 4.3]) add(new THREE.BoxGeometry(0.4, 0.05, 11.2), gold, W / 2 - 0.3, y, -4);
    const bottles = [0x3fbf6a, 0xc8201b, 0xffb347, 0x7fc8ff, 0xd0a6ff, 0xf3efe4];
    for (let i = 0; i < 66; i++) add(new THREE.CylinderGeometry(0.06, 0.085, 0.42, 8), glow(bottles[i % 6]), W / 2 - 0.3, 2.34 + (i % 3) * 1.1, -9.3 + Math.floor(i / 3) * 0.5);
    // Bar stools you can sit on, and the barman who serves them (see bar.js).
    this.barShop = new Bar(this.scene, { counterY: 1.25, serveX: W / 2 - 3.84, backX: W / 2 - 1.7, homeZ: -4 });
    this.barStools = [];
    for (let i = 0; i < 6; i++) {
      const x = W / 2 - 4.62, z = -9 + i * 2;
      add(new THREE.CylinderGeometry(0.26, 0.26, 0.1, 14), velvet, x, STOOL_Y - 0.05, z);
      add(new THREE.CylinderGeometry(0.045, 0.045, STOOL_Y - 0.1, 8), gold, x, (STOOL_Y - 0.1) / 2, z);
      add(new THREE.CylinderGeometry(0.24, 0.26, 0.04, 14), gold, x, 0.02, z);
      add(new THREE.TorusGeometry(0.19, 0.02, 6, 16).rotateX(Math.PI / 2), gold, x, 0.3, z);
      // One glass of each drink per stool: whichever a friend sitting there has ordered is the one shown.
      const drinks = DRINKS.map((kind) => {
        const glass = this.barShop.makeGlass(kind);
        glass.position.set(x + 0.78, 1.25, z + 0.12);
        glass.liquid.scale.y = 1;
        glass.level = 1;
        glass.garnish.visible = true;
        glass.visible = false;
        this.scene.add(glass);
        return glass;
      });
      this.barStools.push({ stand: new THREE.Vector3(x, 0, z), drinks });
    }

    this.buildTable();
    // Two of him: the first one built goes to the roulette table to spin the wheel, the second deals the cards.
    this.buildDealer();
    this.croupier = { group: this.dealer, arms: this.dealerArms, head: this.dealerHead, riches: this.riches };
    this.croupier.group.position.set(ROU.x + CROUPIER_X, 0, ROU.z - 1.5);
    this.buildDealer();

    // Kirky, on foot: no board, facing the way he walks.
    this.kirky = new SkaterModel(this.scene);
    this.emoter = createEmoter(this.kirky, true);
    const k = this.kirky;
    k.board.visible = false;
    k.rider.position.y = 0;
    k.rider.rotation.y = 0;
    for (const id in k.guns) k.guns[id].group.visible = false;   // (he checked his guns at the door)

    this.guests = new Map();  // other players: id -> { model, tag, pos, yaw, ... }
    // For when someone has one too many: a gold ice bucket the barman shoves across, and what goes into it.
    this.bucket = new THREE.Group();
    const bucketGold = this.gold.clone();   // (its own copy: you can see inside it)
    bucketGold.side = THREE.DoubleSide;
    add(new THREE.CylinderGeometry(0.17, 0.13, 0.26, 18, 1, true), bucketGold, 0, 0.13, 0, this.bucket);
    add(new THREE.CylinderGeometry(0.13, 0.13, 0.02, 18), this.gold, 0, 0.01, 0, this.bucket);
    add(new THREE.TorusGeometry(0.17, 0.012, 6, 20).rotateX(Math.PI / 2), this.gold, 0, 0.26, 0, this.bucket);
    this.scene.add(this.bucket);
    this.drops = Array.from({ length: 90 }, () => ({ life: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3() }));
    this.dropMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 6, 5), new THREE.MeshBasicMaterial({ toneMapped: false }), this.drops.length);
    this.dropMesh.frustumCulled = false;
    const sick = [0x9fbf3a, 0xc9c24a, 0x7a9a2a, 0xd9a35a];
    this.drops.forEach((_, i) => { this.dropMesh.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0)); this.dropMesh.setColorAt(i, new THREE.Color(sick[i % 4])); });
    this.scene.add(this.dropMesh);
    this.nextDrop = 0;

    this.cards = new Map();   // "owner:index" -> card mesh
    this.chips = [];
    this.time = 0;
    this.laughing = 0;        // seconds of the dealer's laugh left
    this.reset();
  }

  // The blackjack table: a half-round of green baize with a padded leather rim on a gilded
  // pedestal, a card shoe, a chip tray, a betting ring for each seat and velvet stools.
  buildTable() {
    const { std, add, gold } = this, t = new THREE.Group();
    t.position.copy(TABLE);
    const felt = std(0x0d4129, 0.95), leather = std(0x3a1a12, 0.35), wood = std(0x4a2a14, 0.35), R = 2.4;
    add(new THREE.CylinderGeometry(R, R, 0.1, 48, 1, false, -Math.PI / 2, Math.PI), felt, 0, FELT_Y - 0.05, 0, t);   // the half-round the players sit at
    add(new THREE.BoxGeometry(R * 2, 0.1, 0.6), felt, 0, FELT_Y - 0.05, -0.3, t);                                    // the dealer's side
    add(new THREE.TorusGeometry(R, 0.11, 8, 40, Math.PI).rotateX(Math.PI / 2), leather, 0, FELT_Y, 0, t);            // padded rim
    add(new THREE.TorusGeometry(R + 0.1, 0.025, 6, 40, Math.PI).rotateX(Math.PI / 2), gold, 0, FELT_Y - 0.06, 0, t); // a gold bead under it
    add(new THREE.BoxGeometry(R * 2 + 0.2, 0.2, 0.12), wood, 0, FELT_Y - 0.02, -0.62, t);
    add(new THREE.CylinderGeometry(0.45, 0.6, FELT_Y - 0.25, 14), wood, 0, (FELT_Y - 0.25) / 2 + 0.15, 0.5, t);     // pedestal...
    add(new THREE.CylinderGeometry(0.85, 0.95, 0.15, 18), gold, 0, 0.075, 0.5, t);                                  // ...on a gold foot
    add(new THREE.BoxGeometry(0.34, 0.2, 0.5), std(0x121214, 0.4), 1.75, FELT_Y + 0.1, -0.25, t);                   // card shoe
    add(new THREE.BoxGeometry(1.1, 0.05, 0.3), wood, 0, FELT_Y + 0.025, -0.36, t);                                  // chip tray
    for (let i = 0; i < 6; i++) add(new THREE.CylinderGeometry(0.06, 0.06, 0.07, 10), [gold, std(0xc8201b, 0.5), std(0x1b1c20, 0.5)][i % 3], -0.45 + i * 0.18, FELT_Y + 0.07, -0.36, t);
    const line = new THREE.MeshBasicMaterial({ color: 0xd9c98a, toneMapped: false });
    add(new THREE.RingGeometry(1.98, 2.0, 48, 1, 0, Math.PI).rotateX(-Math.PI / 2).rotateY(Math.PI / 2), line, 0, FELT_Y + 0.004, 0, t);   // a line round the layout
    this.seats = SEAT_ANGLES.map((deg) => {
      const a = (deg * Math.PI) / 180, sin = Math.sin(a), cos = Math.cos(a);
      add(new THREE.RingGeometry(0.2, 0.225, 24).rotateX(-Math.PI / 2), line, sin * 0.95, FELT_Y + 0.004, cos * 0.95, t);   // where the bet goes
      add(new THREE.CylinderGeometry(0.3, 0.3, 0.1, 16), std(0x6a0f1c, 0.85), sin * STOOL, STOOL_Y - 0.05, cos * STOOL, t);  // stool: velvet seat...
      add(new THREE.CylinderGeometry(0.045, 0.045, STOOL_Y - 0.1, 8), this.gold, sin * STOOL, (STOOL_Y - 0.1) / 2, cos * STOOL, t);   // ...gold leg...
      add(new THREE.CylinderGeometry(0.26, 0.28, 0.04, 16), this.gold, sin * STOOL, 0.02, cos * STOOL, t);                   // ...and foot
      add(new THREE.TorusGeometry(0.2, 0.02, 6, 16).rotateX(Math.PI / 2), this.gold, sin * STOOL, 0.3, cos * STOOL, t);      // footrest ring
      return {
        angle: a,
        stand: new THREE.Vector3(TABLE.x + sin * STOOL, 0, TABLE.z + cos * STOOL),         // the stool
        bet: new THREE.Vector3(TABLE.x + sin * 0.95, FELT_Y, TABLE.z + cos * 0.95),
        cards: new THREE.Vector3(TABLE.x + sin * 1.55, FELT_Y, TABLE.z + cos * 1.55),
      };
    });
    this.shoe = new THREE.Vector3(TABLE.x + 1.75, FELT_Y + 0.25, TABLE.z - 0.1);
    this.scene.add(t);
  }

  // Babitus Goyitus: a zombie who keeps himself in shape, in a tailored black dinner suit.
  // Broad shoulders, narrow waist, slicked-back hair. His riches (see RICHES) are built
  // here too, hidden until the house has won enough. Feet at y = 0, facing +z.
  buildDealer() {
    const { std, add, gold } = this;
    const d = (this.dealer = new THREE.Group());
    const skin = std(0x7d8c64, 0.8), rot = std(0x56624a, 0.9), bone = std(0xd8d2bf, 0.6), dark = std(0x121110, 0.9);
    const suit = std(0x0e0e12, 0.55), satin = std(0x1d1d25, 0.22), white = std(0xf3f0e8, 0.7), red = std(0xa3101a, 0.4), hair = std(0x14110d, 0.35);
    const eye = new THREE.MeshBasicMaterial({ color: 0xffb347, toneMapped: false }), diamond = new THREE.MeshBasicMaterial({ color: 0xbff4ff, toneMapped: false });
    // A rounded limb from one point to another.
    const limb = (from, to, radius, material, parent) => {
      const A = new THREE.Vector3(...from), B = new THREE.Vector3(...to), m = add(new THREE.CapsuleGeometry(radius, A.distanceTo(B), 3, 10), material, 0, 0, 0, parent);
      m.position.copy(A).lerp(B, 0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.sub(A).normalize());
      return m;
    };
    const flat = (m, z) => { m.scale.z = z; return m; };   // bodies are wider than they are deep

    // Legs and shoes (mostly behind the table, but they show when you walk round).
    for (const s of [-1, 1]) {
      limb([s * 0.12, 0.95, 0], [s * 0.13, 0.12, 0], 0.085, suit, d);
      add(new THREE.BoxGeometry(0.11, 0.07, 0.28), std(0x09090b, 0.2), s * 0.13, 0.035, 0.06, d);
    }
    // Jacket: a wedge from wide shoulders down to a narrow waist, then a short skirt over the hips.
    flat(add(new THREE.CylinderGeometry(0.33, 0.2, 0.52, 20), suit, 0, 1.44, 0, d), 0.6);
    flat(add(new THREE.CylinderGeometry(0.2, 0.235, 0.3, 20), suit, 0, 1.04, 0, d), 0.68);
    flat(add(new THREE.SphereGeometry(0.33, 20, 10, 0, TAU, 0, Math.PI / 2), suit, 0, 1.7, 0, d), 0.6).scale.y = 0.28;   // the slope of the shoulders
    // Shirt, tie and the V of the lapels.
    add(new THREE.BoxGeometry(0.2, 0.44, 0.02), white, 0, 1.5, 0.178, d);
    add(new THREE.BoxGeometry(0.058, 0.36, 0.02).rotateX(-0.04), red, 0, 1.47, 0.192, d);
    add(new THREE.BoxGeometry(0.07, 0.055, 0.035), red, 0, 1.675, 0.185, d);                                          // knot
    for (const s of [-1, 1]) {
      add(new THREE.BoxGeometry(0.12, 0.46, 0.025).rotateZ(s * 0.27), satin, s * 0.115, 1.5, 0.19, d);               // satin lapel...
      add(new THREE.BoxGeometry(0.09, 0.1, 0.025).rotateZ(s * -0.7), satin, s * 0.185, 1.66, 0.185, d);              // ...and its notch
      add(new THREE.BoxGeometry(0.075, 0.05, 0.03).rotateZ(s * -0.5).rotateY(s * 0.4), white, s * 0.055, 1.705, 0.165, d);   // shirt collar points
      add(new THREE.SphereGeometry(0.115, 14, 10), suit, s * 0.335, 1.64, 0, d);                                     // shoulder
      add(new THREE.BoxGeometry(0.1, 0.02, 0.012), satin, s * 0.14, 1.06, 0.166, d);                                 // pocket flaps
    }
    add(new THREE.BoxGeometry(0.07, 0.03, 0.02).rotateZ(0.15), white, 0.2, 1.585, 0.175, d);                          // pocket square
    for (const y of [1.2, 1.275]) add(new THREE.SphereGeometry(0.014, 8, 6), gold, 0.0, y, 0.19, d);                  // two buttons

    // Arms, each hanging from its shoulder: upper arm, forearm on the table, a cuff, a hand.
    this.dealerArms = [-1, 1].map((s) => {
      const arm = new THREE.Group();
      arm.position.set(s * 0.345, 1.63, 0);
      limb([0, 0, 0], [s * 0.06, -0.32, 0.2], 0.078, suit, arm);
      limb([s * 0.06, -0.32, 0.2], [s * -0.08, -0.535, 0.6], 0.066, suit, arm);
      limb([s * -0.08, -0.535, 0.6], [s * -0.095, -0.545, 0.66], 0.062, white, arm);                                 // shirt cuff
      add(new THREE.SphereGeometry(0.014, 6, 5), gold, s * -0.03, -0.53, 0.635, arm);                                // cufflink
      add(new THREE.SphereGeometry(0.058, 10, 8).scale(1, 0.6, 1.25), skin, s * -0.1, -0.552, 0.735, arm);           // hand, flat on the baize
      for (let f = 0; f < 4; f++) add(new THREE.BoxGeometry(0.02, 0.02, 0.075), rot, s * -0.1 + (f - 1.5) * 0.026, -0.556, 0.81, arm);   // fingers
      d.add(arm);
      return arm;
    });
    const [armA, armB] = this.dealerArms;

    // Head: lean jaw, hollow cheeks, burning eyes, hair slicked straight back.
    const h = (this.dealerHead = new THREE.Group());
    h.position.set(0, 1.74, 0.01);
    add(new THREE.CylinderGeometry(0.06, 0.07, 0.12, 10), skin, 0, -0.02, 0, h);                                      // neck
    add(new THREE.SphereGeometry(0.135, 18, 14).scale(0.9, 1.12, 1), skin, 0, 0.16, 0.02, h);                         // skull
    add(new THREE.BoxGeometry(0.17, 0.09, 0.15), skin, 0, 0.055, 0.045, h);                                           // square jaw
    add(new THREE.BoxGeometry(0.11, 0.035, 0.03), rot, 0, 0.022, 0.12, h);                                            // chin
    add(new THREE.SphereGeometry(0.136, 18, 10, 0, TAU, 0, 1.25).scale(0.92, 1.1, 1.06), hair, 0, 0.175, -0.012, h);  // hair
    add(new THREE.BoxGeometry(0.2, 0.03, 0.05).rotateX(-0.25), rot, 0, 0.205, 0.118, h);                              // heavy brow
    for (const s of [-1, 1]) {
      add(new THREE.SphereGeometry(0.03, 10, 8), dark, s * 0.05, 0.175, 0.118, h);                                    // eye socket
      add(new THREE.SphereGeometry(0.014, 8, 6), eye, s * 0.05, 0.175, 0.142, h);                                     // eye
      add(new THREE.SphereGeometry(0.035, 8, 6).scale(1, 1.3, 0.5), rot, s * 0.092, 0.1, 0.07, h);                    // hollow cheek
      add(new THREE.SphereGeometry(0.03, 8, 6).scale(0.5, 1, 0.8), skin, s * 0.125, 0.16, 0, h);                      // ear
    }
    add(new THREE.BoxGeometry(0.03, 0.06, 0.04), skin, 0, 0.13, 0.14, h);                                             // nose
    add(new THREE.BoxGeometry(0.1, 0.022, 0.02), dark, 0, 0.068, 0.126, h);                                           // mouth: a grin...
    for (const x of [-0.03, -0.01, 0.01, 0.03]) add(new THREE.BoxGeometry(0.016, 0.018, 0.012), bone, x, 0.07, 0.134, h);   // ...full of teeth
    add(new THREE.SphereGeometry(0.03, 8, 6).scale(1, 1, 0.4), rot, -0.08, 0.22, 0.09, h);                            // a patch of rot on his temple
    d.add(h);

    // His riches.
    const rich = (this.riches = {});
    const item = (name, ...meshes) => { rich[name] = (rich[name] || []).concat(meshes); for (const m of meshes) m.visible = false; };
    item('ring', add(new THREE.TorusGeometry(0.016, 0.007, 6, 12).rotateY(Math.PI / 2), gold, -0.1 - 0.013, -0.55, 0.8, armB), add(new THREE.OctahedronGeometry(0.016), diamond, -0.113, -0.535, 0.8, armB));
    item('watch', limb([0.075, -0.53, 0.575], [0.082, -0.535, 0.6], 0.074, gold, armA), add(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 12), white, 0.078, -0.455, 0.588, armA));
    item('chain', add(new THREE.TorusGeometry(0.15, 0.012, 6, 28).rotateX(1.2), gold, 0, 1.6, 0.1, d));
    item('diamonds', add(new THREE.OctahedronGeometry(0.022), diamond, 0, 1.5, 0.21, d), ...[-1, 1].map((s) => add(new THREE.OctahedronGeometry(0.02), diamond, s * 0.13, 0.12, 0, h)));   // tie pin, earrings
    item('hat', add(new THREE.CylinderGeometry(0.115, 0.12, 0.24, 18), suit, 0, 0.45, 0, h), add(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 20), suit, 0, 0.33, 0, h), add(new THREE.CylinderGeometry(0.123, 0.123, 0.045, 18), gold, 0, 0.365, 0, h));
    item('teeth', add(new THREE.BoxGeometry(0.082, 0.02, 0.014), gold, 0, 0.07, 0.136, h));
    item('medallion', add(new THREE.TorusGeometry(0.2, 0.016, 6, 28).rotateX(1.3), gold, 0, 1.55, 0.13, d), add(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 18).rotateX(Math.PI / 2), gold, 0, 1.36, 0.2, d), add(new THREE.OctahedronGeometry(0.03), diamond, 0, 1.36, 0.215, d));
    const fur = std(0xf4f1ea, 1);
    item('fur', ...[-1, 1].flatMap((s) => [0, 1, 2, 3].map((k) => add(new THREE.SphereGeometry(0.1, 8, 6), fur, s * (0.1 + k * 0.1), 1.74 - k * 0.035, k < 2 ? 0.1 : 0.02, d))), add(new THREE.SphereGeometry(0.12, 8, 6), fur, 0, 1.74, -0.12, d));   // a fur stole round his shoulders
    const hoard = [];
    for (let i = 0; i < 14; i++) hoard.push(add(new THREE.BoxGeometry(0.34, 0.11, 0.16), gold, -1.9 + (i % 5) * 0.37 + (Math.floor(i / 5) % 2) * 0.18, 0.06 + Math.floor(i / 5) * 0.115, -0.45, d));   // gold bars stacked beside him
    for (const x of [1.4, 1.9]) hoard.push(add(new THREE.SphereGeometry(0.3, 10, 8).scale(1, 0.85, 1), std(0x6b5a3a, 0.95), x, 0.26, -0.4, d), add(new THREE.CylinderGeometry(0.07, 0.12, 0.14, 8), std(0x6b5a3a, 0.95), x, 0.56, -0.4, d));   // money bags
    item('hoard', ...hoard);
    item('throne', add(new THREE.BoxGeometry(1.3, 2.7, 0.2), gold, 0, 1.35, -0.42, d), add(new THREE.BoxGeometry(1.0, 2.1, 0.05), std(0x6a0f1c, 0.85), 0, 1.4, -0.31, d),
      ...[-1, 1].map((s) => add(new THREE.SphereGeometry(0.14, 10, 8), gold, s * 0.65, 2.78, -0.42, d)), add(new THREE.OctahedronGeometry(0.17), diamond, 0, 2.86, -0.42, d));

    d.position.set(TABLE.x, 0, TABLE.z - 1.36);
    this.scene.add(d);
    this.wealth = -1;
  }

  // Dress the dealer for how much the house has taken from the players, and put it on his sign.
  setWealth(amount) {
    amount = Math.max(0, Math.floor(amount));
    if (amount === this.wealth) return;
    this.wealth = amount;
    for (const [at, name] of RICHES) {
      for (const m of this.riches[name]) m.visible = amount >= at;
      for (const m of this.croupier.riches[name]) m.visible = amount >= at && name !== 'hoard' && name !== 'throne';   // (the croupier wears it all too, but the gold and the throne stay at the card table)
    }
    this.houseSign.redraw(['BABITUS GOYITUS', `THE HOUSE HAS TAKEN ${amount.toLocaleString()}`]);
  }

  // He's dealt himself a blackjack.
  laugh() { this.laughing = 2.4; }

  // He's made 21 with three cards or more. A cut-in: the cards, then his face as it dawns on him,
  // then the whole table from behind him as he throws his arms up and roars with laughter.
  showdown() {
    this.gloat = GLOAT_TIME;
    playThunder();
  }
  dealerShot() {
    if (!(this.gloat > 0)) return null;
    const t = GLOAT_TIME - this.gloat, d = this.dealer.position, at = (x, y, z) => new THREE.Vector3(TABLE.x + x, y, TABLE.z + z);
    const pop = (when) => (t >= when ? Math.exp(-(t - when) * 7) : 0), head = new THREE.Vector3(d.x, 1.9, d.z);
    let s;
    if (t < 0.95) s = { pos: at(0.45, FELT_Y + 1.0 - 0.45 * smooth(t / 0.4), 0.95), look: at(-0.05, FELT_Y, 0.2), fov: 44 - 20 * smooth(t / 0.35), lines: 0.8 };                 // snap zoom: the cards
    else if (t < 2.05) s = { pos: at(-0.55, 1.12, -0.2), look: head, fov: 40 - 12 * smooth((t - 0.95) / 0.25), shake: 0.01, lines: 1, title: '21' };                          // from the baize, looking up at him
    else s = { pos: at(1.9 - 0.5 * smooth((t - 2.05) / 1.5), 2.7, -3.6), look: at(0, 1.25, 1.2), fov: 54, shake: 0.006, title: '21' };                                        // behind him: the table he's just beaten
    return { shake: 0, lines: 0, title: '', ...s, flash: Math.max(pop(0), pop(0.95), pop(2.05) * 0.6) };
  }

  // Back to the door, on your feet.
  reset() {
    this.pos = new THREE.Vector3(0, 0, D / 2 - 3);
    this.yaw = Math.PI;        // facing into the room
    this.speed = 0;
    this.walk = 0;             // how far through a stride
    this.seat = -1;            // the seat at the blackjack table you're sitting at, or -1
    this.bar = -1;             // the bar stool you're sitting on, or -1
    this.slot = -1;            // the slot machine you're standing at, or -1
    // The reels, drawn on the screen of the machine being played.
    if (!this.reels) {
      this.reelCanvas = Object.assign(document.createElement('canvas'), { width: 340, height: 240 });
      this.reelTexture = new THREE.CanvasTexture(this.reelCanvas);
      this.reelTexture.colorSpace = THREE.SRGBColorSpace;
      this.reels = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.6), new THREE.MeshBasicMaterial({ map: this.reelTexture, toneMapped: false }));
      this.reels.rotation.y = Math.PI / 2;
      this.scene.add(this.reels);
    }
    this.reels.visible = false;
    this.pulled = 9;           // seconds since the lever was last pulled
    this.win = 0;              // seconds of the big-win cut-in left
    this.winTitle = '';
    this.roulette = false;     // standing at the roulette table
    this.rtime = -1;           // seconds into a spin of the wheel (-1: it's idling)
    this.called = false;       // this spin's number has been called
    this.rtitle = this.rwin = '';
    this.rlost = false;
    this.croupierLaugh = 0;
    if (this.glass) this.scene.remove(this.glass);
    this.glass = null;         // your drink (see order / drink)
    this.sip = 0;              // 0..1: the glass raised to drink
    this.drinking = 0;         // seconds of the drinking animation left
    this.tipsy = 0;            // how many drinks are still in you (it wears off)
    this.isTipsy = false;      // past the point where it shows
    this.sick = 0;             // seconds of the being-sick cut-in left
    this.heave = 0;            // 0..1: doubled over the bar
    this.cutOff = 0;           // seconds until the barman will serve you again
    this.bucket.visible = false;
    for (const drop of this.drops) drop.life = 0;
    this.kirky?.mats.skin.color.copy(SKIN);
    this.woozy = 0;            // seconds of the "it's hit you" cut-in left
    this.hic = 0;              // 0..1: a hiccup jolting through him
    this.lean = 0;             // how far he's toppling sideways on his stool (radians)
    this.slammed = false;      // (the glass has gone back down, this drink)
    this.gloat = 0;            // seconds of the dealer's 21 cut-in left
    this.cine = { on: false, lines: 0, flash: 0, title: '', blur: false };   // the cut-in being filmed, for casino.js to dress the screen
    this.smokeLeft = 0;        // seconds of a smoke at the table left
    this.drag = 0;             // 0..1: his hand up at his mouth
    this.puffing = 0;          // 1: drawing on it, 2: blowing it out (what the others are told)
    this.firstPerson = !!this.firstPerson;   // looking out of his eyes rather than over his shoulder
    this.barShop.reset();
    this.tableBlend = 0;       // 0..1: the camera easing to its place over the blackjack table
    this.sitBlend = 0;         // 0 = on his feet, 1 = sat down
    this.orbit = 0;            // the camera swung round by dragging with the left mouse button...
    this.tilt = 0;             // ...and tipped up or down
    this.laughing = 0;
    this.showTable({ dealer: [], seats: [] });
  }

  // The stool you're close enough to take (-1 if none).
  // taken[i]: someone is already on stool i.
  nearSeat(taken = []) {
    let best = -1, bestDist = 1.7;
    this.seats.forEach((s, i) => {
      const d = Math.hypot(this.pos.x - s.stand.x, this.pos.z - s.stand.z);
      if (!taken[i] && d < bestDist) { best = i; bestDist = d; }
    });
    return best;
  }

  // One too many. A cut-in in six shots: his face going green, the barman seeing what's coming, a
  // bucket fired down the bar, the moment itself (slowed right down), the barman unable to watch,
  // and the aftermath. It sobers him up, and he's cut off for a while.
  updateSick(dt, k) {
    const skin = k.mats.skin.color;
    if (this.sick > 0 && this.bar >= 0) {
      const before = this.sickClock;
      const t = (this.sickClock += dt * (before > 3.0 && before < 3.5 ? 0.4 : 1));   // (the first heave hangs)
      this.sick = SICK_TIME - t;
      const crossed = (at) => before < at && t >= at, st = this.barStools[this.bar].stand, backX = this.barShop.at.backX;
      for (const at of [0.5, 1.15, 1.8]) if (crossed(at)) { this.hicAt = this.time; playGurgle(); }   // his stomach turning over
      skin.copy(SKIN).lerp(QUEASY, smooth(t / 1.4) * (1 - smooth((t - 5.2) / 1.0)));
      if (crossed(1.5)) this.barShop.alarm(st.z, SICK_TIME - 1.5);
      // The bucket: shot down the marble from the barman's side, just in time.
      const slide = smooth((t - 2.5) / 0.42);
      this.bucket.visible = t > 2.45;
      this.bucket.position.set(lerp(backX - 0.7, st.x + 0.86, slide), 1.25, st.z - 0.3 * slide);
      if (crossed(2.5)) playGlassDown();
      this.heave = smooth((t - 2.9) / 0.14) * (1 - 0.35 * smooth((t - 4.3) / 0.5));   // doubled over; afterwards, slumped
      if (crossed(3.0)) { this.retched = true; playRetch(); }
      if (t > 3.0 && t < 4.2) {
        // Out it comes, in an arc, into the bucket.
        k.root.updateMatrixWorld(true);
        k.torso.localToWorld(v.set(0.03, 0.74, 0.16));
        for (let n = 0; n < 4; n++) {
          const drop = this.drops[this.nextDrop++ % this.drops.length];
          drop.life = 0.9;
          drop.pos.copy(v);
          drop.vel.copy(this.bucket.position).setY(1.45).sub(v).multiplyScalar(2.6).add(v2.set((Math.random() - 0.5) * 0.5, 1.7 + Math.random() * 0.8, (Math.random() - 0.5) * 0.5));
        }
        if (this.time - (this.splashed || 0) > 0.16) { this.splashed = this.time; playSplash(); }
      }
      if (this.sick <= 0) {
        // Better out than in. He's a good deal soberer, and the barman has had enough of him for now.
        this.sick = 0;
        this.heave = 0;
        this.tipsy = 1;
        this.isTipsy = false;
        this.cutOff = CUT_OFF;
        this.bucket.visible = false;
        skin.copy(SKIN);
      }
    }
    // The drops fly whether or not the cut-in is still on them.
    const sc = v2, m = this.dropM || (this.dropM = new THREE.Matrix4());
    this.drops.forEach((drop, i) => {
      if (drop.life > 0) {
        drop.life -= dt;
        drop.vel.y -= 7 * dt;
        drop.pos.addScaledVector(drop.vel, dt);
        if (drop.pos.y < 1.27 && drop.vel.y < 0) drop.life = 0;   // into the bucket (or onto the bar)
      }
      this.dropMesh.setMatrixAt(i, drop.life > 0 ? m.makeTranslation(drop.pos.x, drop.pos.y, drop.pos.z) : m.makeScale(0, 0, 0));
    });
    this.dropMesh.instanceMatrix.needsUpdate = true;
  }

  sickShot() {
    if (this.sick <= 0 || this.bar < 0) return null;
    const t = this.sickClock, st = this.barStools[this.bar].stand, backX = this.barShop.at.backX, b = this.bucket.position;
    const at = (dx, y, dz) => new THREE.Vector3(st.x + dx, y, st.z + dz), headAt = at(0.14, 1.6, 0);
    const pop = (when) => (t >= when ? Math.exp(-(t - when) * 7) : 0);
    let s;
    if (t < 1.5) s = { pos: at(1.8 - 0.35 * smooth(t / 1.5), 1.52, 0.42), look: headAt, fov: 36 - 12 * smooth(t / 1.4), lines: 0.3 + 0.5 * smooth(t / 1.4), shake: 0.025 * this.hic, title: t > 0.9 ? 'Uh oh.' : '' };   // his face, going green
    else if (t < 2.5) s = { pos: new THREE.Vector3(backX - 2.0, 1.72, st.z + 0.45), look: new THREE.Vector3(backX, 1.82, st.z), fov: 46 - 22 * smooth((t - 1.5) / 0.16), lines: 1, shake: 0.01 };            // the barman has seen that colour before
    else if (t < 3.0) s = { pos: new THREE.Vector3(b.x - 0.25, 1.36, b.z + 0.75), look: b.clone().setY(1.4), fov: 38, lines: 1 };                                                                              // the bucket, at speed
    else if (t < 4.35) s = { pos: at(0.45, 1.55, 2.1), look: at(0.42, 1.28, -0.1), fov: 46 - 6 * smooth((t - 3.0) / 0.5), shake: 0.03, lines: 0.8, title: 'Bleurgh!' };                                          // and there it goes, in slow motion
    else if (t < 5.2) s = { pos: new THREE.Vector3(backX - 1.9, 1.75, st.z - 0.5), look: new THREE.Vector3(backX, 1.8, st.z), fov: 30, lines: 0.4 };                                                           // he can't look
    else s = { pos: new THREE.Vector3(backX - 0.9, 2.2, st.z + 1.6), look: at(0.45, 1.3, 0), fov: 44, title: 'Cut off' };                                                                                      // from behind the bar: the damage
    return { shake: 0, lines: 0, title: '', ...s, flash: Math.max(pop(1.5) * 0.7, pop(3.0), pop(5.2) * 0.6) };
  }

  // How tipsy he is, once it has caught up with him (0 until then). Sways the camera and his walk.
  get drunk() { return this.isTipsy ? Math.max(0, this.tipsy - 1.2) : 0; }

  // The camera's shots for the moment the drink hits: his face as he hiccups, the bar swimming
  // through his own eyes, the barman shaking his head, then from the side as he nearly leaves his stool.
  woozyShot() {
    if (this.woozy <= 0 || this.bar < 0) return null;
    const t = WOOZY_TIME - this.woozy, st = this.barStools[this.bar].stand, backX = this.barShop.at.backX;
    const at = (dx, y, dz) => new THREE.Vector3(st.x + dx, y, st.z + dz), headAt = at(0.14, 1.6, 0);
    const pop = (when) => (t >= when ? Math.exp(-(t - when) * 7) : 0);
    let s;
    if (t < 0.95) s = { pos: at(1.75, 1.52, 0.4), look: headAt, fov: 36 - 10 * smooth(t / 0.3), lines: 0.5, shake: 0.02 * this.hic, title: t > 0.35 ? 'Hic!' : '' };       // his face. Hic.
    else if (t < 2.1) s = { pos: at(0.3, 1.62, 0), look: at(4, 1.95 + Math.sin(t * 2.3) * 0.5, Math.sin(t * 1.7) * 1.6), fov: 72 + Math.sin(t * 3.1) * 9, roll: Math.sin(t * 2.6) * 0.3, blur: true };   // through his eyes: the bottles swim
    else if (t < 3.05) s = { pos: new THREE.Vector3(backX - 2.0, 1.72, st.z + 0.45), look: new THREE.Vector3(backX, 1.82, st.z), fov: 46 - 22 * smooth((t - 2.1) / 0.18), lines: 1 };   // snap zoom: the barman has seen this before
    else s = { pos: at(0.35, 1.45, 2.5), look: at(0.15, 1.15, 0), fov: 44 - 6 * smooth((t - 3.9) / 0.4), roll: this.lean * 0.25, lines: t > 3.9 ? 0.7 : 0, shake: 0.02 * this.hic, title: t > 3.9 ? 'Tipsy' : '' };   // from the side: over he goes... and back
    return { shake: 0, lines: 0, title: '', ...s, flash: Math.max(pop(0.35), pop(2.1) * 0.7, pop(3.9)) };
  }

  // The camera's shots while you drink (see Bar.shot for the idea): the glass, the lift, the long
  // swallow in profile with a punch-in on every gulp, and the glass banged back down.
  drinkShot() {
    if (this.drinking <= 0 || !this.glass || this.bar < 0) return null;
    const t = DRINK_TIME - this.drinking, g = this.glass.position, st = this.barStools[this.bar].stand;
    const at = (dx, y, dz) => new THREE.Vector3(st.x + dx, y, st.z + dz), headAt = at(0.12, 1.6, 0);
    const gulp = Math.max(0, 1 - (t - (this.gulpAt ?? -9)) * 5);   // 1 on each swallow, fading
    const slam = this.slammed ? Math.exp(-(this.time - this.slamAt) * 7) : 0;
    let s;
    if (t < 0.6) s = { pos: at(1.2, 1.4, 0.62), look: g.clone().setY(1.36), fov: 30 - 6 * smooth(t / 0.6) };                                   // the glass, waiting; his hand comes for it
    else if (t < 1.35) s = { pos: at(2.0, 1.42, 0.55), look: headAt, fov: 44 - 14 * smooth((t - 0.6) / 0.5), lines: 0.6 };                      // from across the bar: up it comes
    else if (t < 2.75) s = { pos: at(0.3, 1.66, 1.05 - 0.1 * gulp), look: at(0.22, 1.62, 0), fov: 30 - 4 * gulp, shake: 0.004 * gulp, lines: 0.35 + 0.5 * gulp };   // in profile: down it goes
    else if (t < 3.1) s = { pos: at(1.25, 1.38, 0.6), look: at(0.78, 1.3, 0.12), fov: 32 };                                                      // back over the bar: the glass on its way down
    else s = { pos: at(1.25, 1.38, 0.6), look: at(0.78, 1.3, 0.12), fov: 30, shake: 0.03 * slam, title: 'Ahhh.' };                               // bang
    return { shake: 0, lines: 0, title: '', ...s, flash: slam * 0.9 };
  }

  // ---- A smoke at the table --------------------------------------------------------------
  // Sat at the blackjack table: a long drag and a slow cloud, filmed as a cut-in. Returns false if he can't just now.
  smoke() {
    if (this.seat < 0 || this.smokeLeft > 0 || this.cine.on) return false;
    this.emoter.stop();
    this.smokeLeft = SMOKE_TIME;
    this.light(this.kirky, true);
    return true;
  }
  // Put a lit cigarette in a model's mouth whatever it usually has there (on), or give it back its own (off).
  light(model, on) {
    if (!on) return model.applyLook(model.look);
    for (const kind in model.mouth) for (const piece of model.mouth[kind]) piece.visible = kind === 'cigarette';
    model.ember.visible = model.smoking = true;
  }
  // Its shots: a snap zoom on him, the ember in close-up as he draws on it, a hard cut to his profile holding it in,
  // then from low across the felt as the cloud rolls out.
  smokeShot() {
    if (this.smokeLeft <= 0 || this.seat < 0) return null;
    const t = SMOKE_TIME - this.smokeLeft, k = this.kirky;
    k.root.updateMatrixWorld(true);
    const head = k.torso.localToWorld(new THREE.Vector3(0, 0.8, 0));
    const ahead = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)), across = new THREE.Vector3(ahead.z, 0, -ahead.x);
    const at = (a, b, up) => head.clone().addScaledVector(ahead, a).addScaledVector(across, b).setY(head.y + up);
    const pop = (when) => (t >= when ? Math.exp(-(t - when) * 7) : 0);
    let s;
    if (t < 0.7) s = { pos: at(1.5, 0.55, 0.15), look: head, fov: 46 - 22 * smooth(t / 0.18), lines: 1 };                                                    // snap zoom: his hand comes up
    else if (t < 1.9) s = { pos: at(0.6, 0.3, -0.02), look: at(0.14, 0.03, -0.04), fov: 24 - 5 * smooth((t - 0.7) / 1.2), lines: 0.3 + 0.6 * k.inhale, shake: 0.003 * k.inhale };   // the ember, flaring
    else if (t < 2.15) s = { pos: at(0.45, -1.4, -0.05), look: at(0.3, 0, 0.05), fov: 30, lines: 1 };                                                          // hard cut: in profile, holding it
    else s = { pos: at(1.3 + 0.3 * smooth((t - 2.15) / 2), -0.9, -0.3), look: at(0.4, 0, 0.12), fov: 42 - 6 * smooth((t - 2.15) / 2), title: t > 3.1 ? 'Smooth.' : '' };   // and out it rolls
    return { shake: 0, lines: 0, title: '', ...s, flash: Math.max(pop(0), pop(0.7) * 0.6, pop(1.9), pop(2.15) * 0.8) };
  }

  // Left-button drag: swing the camera round (dx) and tip it (dy), in pixels.
  look(dx, dy) {
    this.orbit -= dx * 0.006;
    this.tilt = Math.max(-0.5, Math.min(0.75, this.tilt + dy * 0.004));
  }

  // ---- Roulette ---------------------------------------------------------------------------
  // The table: a wheel at the left end, the betting layout on the felt beside it. (The rules are in roulette.js.)
  buildRoulette() {
    const std = this.std, add = this.add, gold = this.gold, t = new THREE.Group();
    t.position.copy(ROU);
    const wood = std(0x3a2116, 0.45), basic = (map) => new THREE.MeshBasicMaterial({ map, toneMapped: false });
    const canvasTexture = (w, h, draw) => {
      const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
      draw(c.getContext('2d'));
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      return tex;
    };
    const INK = { red: '#b3201b', black: '#16161a', green: '#1f7a45', out: '#0d4129' };
    add(new THREE.BoxGeometry(5.3, 0.16, 2.3), wood, 0, FELT_Y - 0.09, 0, t);
    add(new THREE.BoxGeometry(5.36, 0.05, 2.36), gold, 0, FELT_Y - 0.19, 0, t);
    add(new THREE.PlaneGeometry(5.0, 2.0).rotateX(-Math.PI / 2), std(0x0d4129, 0.95), 0, FELT_Y, 0, t);
    for (const x of [-1.7, 1.7]) {
      add(new THREE.BoxGeometry(0.7, FELT_Y - 0.2, 1.2), wood, x, (FELT_Y - 0.2) / 2, 0, t);
      add(new THREE.BoxGeometry(0.9, 0.08, 1.4), gold, x, 0.04, 0, t);
    }
    // The layout, painted from the same list of spots the on-screen board is built from.
    const CELL = 80;
    add(new THREE.PlaneGeometry(LAYOUT.width * ROU_CELL, LAYOUT.height * ROU_CELL).rotateX(-Math.PI / 2), basic(canvasTexture(LAYOUT.width * CELL, LAYOUT.height * CELL, (g) => {
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 4;
      g.strokeStyle = '#e9e4d4';
      for (const s of SPOTS) {
        g.fillStyle = INK[s.kind];
        g.fillRect(s.x * CELL, s.y * CELL, s.w * CELL, s.h * CELL);
        g.strokeRect(s.x * CELL + 2, s.y * CELL + 2, s.w * CELL - 4, s.h * CELL - 4);
        g.fillStyle = '#f6f2e6';
        g.font = `${s.w > 1 ? 34 : 40}px Anton, Impact, sans-serif`;
        g.fillText(s.label.toUpperCase(), (s.x + s.w / 2) * CELL, (s.y + s.h / 2) * CELL + 3);
      }
    })), ROU_LAYOUT_X, FELT_Y + 0.004, 0, t);

    // The wheel: a wooden bowl, and in it the part that turns.
    const cx = ROU_WHEEL_X;
    add(new THREE.CylinderGeometry(0.86, 0.8, 0.16, 40), wood, cx, FELT_Y + 0.08, 0, t);
    add(new THREE.TorusGeometry(0.85, 0.035, 8, 40).rotateX(Math.PI / 2), gold, cx, FELT_Y + 0.17, 0, t);
    add(new THREE.CircleGeometry(0.8, 40).rotateX(-Math.PI / 2), std(0x24130c, 0.5), cx, FELT_Y + 0.163, 0, t);
    const wheel = new THREE.Group();
    wheel.position.set(cx, FELT_Y + 0.17, 0);
    const seg = TAU / WHEEL.length;
    add(new THREE.CircleGeometry(ROU_DISC, 74).rotateX(-Math.PI / 2), basic(canvasTexture(1024, 1024, (g) => {
      const c = 512, wedge = (i, from, to, color) => {
        g.beginPath();
        g.arc(c, c, to * c, i * seg - seg / 2 - Math.PI / 2, i * seg + seg / 2 - Math.PI / 2);
        g.arc(c, c, from * c, i * seg + seg / 2 - Math.PI / 2, i * seg - seg / 2 - Math.PI / 2, true);
        g.closePath();
        g.fillStyle = color;
        g.fill();
        g.stroke();
      };
      g.strokeStyle = '#d9b24a';
      g.lineWidth = 4;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = '58px Anton, Impact, sans-serif';
      WHEEL.forEach((n, i) => {
        wedge(i, 0.7, 1, INK[colour(n)]);                                                             // the number...
        wedge(i, 0.44, 0.7, { red: '#7a1512', black: '#0c0c0e', green: '#14532f' }[colour(n)]);       // ...and its pocket
        g.save();
        g.translate(c + Math.cos(i * seg - Math.PI / 2) * 0.855 * c, c + Math.sin(i * seg - Math.PI / 2) * 0.855 * c);
        g.rotate(i * seg);
        g.fillStyle = '#f6f2e6';
        g.fillText(`${n}`, 0, 4);
        g.restore();
      });
      g.beginPath();
      g.arc(c, c, 0.44 * c, 0, TAU);
      g.fillStyle = '#3a2116';
      g.fill();
      g.stroke();
    })), 0, 0, 0, wheel);
    add(new THREE.ConeGeometry(0.2, 0.2, 20), gold, 0, 0.1, 0, wheel);
    add(new THREE.SphereGeometry(0.05, 10, 8), gold, 0, 0.22, 0, wheel);
    for (let i = 0; i < 4; i++) add(new THREE.CylinderGeometry(0.014, 0.014, 0.52, 6).rotateZ(Math.PI / 2), gold, 0, 0.05, 0, wheel).rotation.y = i * Math.PI / 4;
    // (The ball rides on the wheel's group, so "in a pocket" is just a fixed angle on it.)
    const ball = add(new THREE.SphereGeometry(0.034, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), 0, 0.03, -ROU_POCKET, wheel);
    t.add(wheel);
    // The marker that goes on the winning number.
    const marker = add(new THREE.CylinderGeometry(0.045, 0.06, 0.16, 12), gold, 0, FELT_Y + 0.09, 0, t);
    marker.visible = false;
    this.scene.add(t);
    this.rou = {
      wheel, ball, marker, table: t, speed: 0.35, index: 0,
      centre: new THREE.Vector3(ROU.x + cx, 0, ROU.z),
      stand: new THREE.Vector3(ROU.x + ROU_LAYOUT_X, 0, ROU.z + 1.8),
      chips: new Map(),
    };
  }
  // Where a spot is on the felt (in the table's own space).
  spotPlace(s) {
    return v2.set(ROU_LAYOUT_X + (s.x + s.w / 2 - LAYOUT.width / 2) * ROU_CELL, FELT_Y, (s.y + s.h / 2 - LAYOUT.height / 2) * ROU_CELL);
  }
  nearRoulette() {
    return Math.hypot(Math.max(0, Math.abs(this.pos.x - ROU.x) - 2.65), Math.max(0, Math.abs(this.pos.z - ROU.z) - 1.15)) < 1.0;
  }
  // Step up to the table: the first free place along its near side (others: where everyone else is standing).
  playRoulette(others = []) {
    this.orbit = this.tilt = 0;
    this.roulette = true;
    this.pos.copy(this.rou.stand);
    const free = [0, -1.1, 1.1, -2.2, 2.0].find((dx) => !others.some((p) => Math.hypot(p.x - (this.rou.stand.x + dx), p.z - this.rou.stand.z) < 0.6));
    this.pos.x += free || 0;
    this.yaw = Math.PI;   // facing the table
    this.speed = 0;
  }
  // Put chips on the felt: yours ({ spot id: gold }), and beside them everyone else's put together (in blue).
  showBets(mine, theirs = {}) {
    const chips = this.rou.chips;
    const stack = (key, s, amount, dx, dz, color) => {
      let chip = chips.get(key);
      if (!amount) { if (chip) chip.visible = false; return; }
      if (!chip) {
        chip = this.add(new THREE.CylinderGeometry(0.05, 0.05, 1, 14), this.std(0xffffff, 0.5), 0, 0, 0, this.rou.table);
        chips.set(key, chip);
      }
      const tall = 0.014 * Math.min(12, Math.ceil(amount / 10));
      chip.visible = true;
      chip.scale.y = tall;
      chip.position.copy(this.spotPlace(s));
      chip.position.x += dx;
      chip.position.y += tall / 2 + 0.005;
      chip.position.z += dz;
      chip.material.color.set(color);
    };
    for (const s of SPOTS) {
      const me = mine[s.id] || 0, them = theirs[s.id] || 0, both = me && them ? 1 : 0;
      stack(s.id, s, me, -0.04 * both, 0.03 * both, me >= 100 ? 0xd9b24a : me >= 25 ? 0x3fbf6a : 0xc8201b);
      stack(`${s.id}:others`, s, them, 0.04 * both, -0.03 * both, 0x4f9fe0);
    }
  }
  // `lost`: you got nothing back, and the croupier is going to enjoy it.
  // `cine`: film it (you're at the table), rather than just letting the wheel spin across the room.
  spinRoulette(number, title, winTitle = '', lost = false, cine = true) {
    this.rlost = lost;
    this.rcine = cine;
    this.rou.index = WHEEL.indexOf(number);
    this.rou.number = number;
    this.rou.marker.visible = false;
    this.rtime = 0;
    this.called = false;
    this.rtitle = title;
    this.rwin = winTitle;
  }
  rouletteShot() {
    if (this.rtime < 0 || !this.rcine || (this.rtime >= ROU_END && !this.rwin && !this.rlost)) return null;
    const t = this.rtime, w = this.rou.centre, st = this.pos;
    const at = (x, y, z) => new THREE.Vector3(w.x + x, y, w.z + z), me = (x, y, z) => new THREE.Vector3(st.x + x, y, st.z + z);
    const pop = (when) => (t >= when ? Math.exp(-(t - when) * 7) : 0);
    let s;
    if (t < 1.3) s = { pos: at(1.5 - 0.3 * smooth(t / 1.3), 1.55, 1.3), look: at(0, 1.15, 0), fov: 54 - 14 * smooth(t / 0.2), lines: 0.9, shake: 0.012 };               // snap in: the wheel, spinning up
    else if (t < 2.3) s = { pos: me(-0.4, 1.62, -1.0), look: me(0, 1.64, 0), fov: 30 - 7 * smooth((t - 1.3) / 1.0), lines: 0.35 };                                      // his face, watching it
    else if (t < ROU_CALL) s = { pos: at(0.01, 3.1 - 1.1 * smooth((t - 2.3) / (ROU_CALL - 2.3)), 0.3), look: at(0, 1.15, 0), fov: 40, roll: (t - 2.3) * 0.25, shake: 0.004 };   // from above, turning, as the ball slows and drops
    else if (t < ROU_END) {                                                                                                                                              // right in on the pocket
      const b = this.rou.ball.getWorldPosition(new THREE.Vector3());
      s = { pos: b.clone().add(v2.set(0.05, 0.6 - 0.15 * smooth((t - ROU_CALL) / 1.2), 0.5)), look: b, fov: 32, title: this.rtitle };
    } else if (this.rlost) {                                                                                                                                             // (cleaned out) from the baize, looking up at him laughing
      const c = this.croupier.group.position;
      s = { pos: new THREE.Vector3(c.x + 0.8, 1.15, c.z + 2.1), look: new THREE.Vector3(c.x, 1.62, c.z), fov: 48 - 10 * smooth((t - ROU_END) / 0.25), lines: 1, shake: 0.01, title: 'The house wins' };
    } else s = { pos: me(1.5, 0.7, 0.7), look: me(0, 1.5, 0), fov: 46, lines: 0.8, shake: 0.008, title: this.rwin };                                                    // (a winner) from the floor: arms up
    return { shake: 0, lines: 0, title: '', ...s, flash: Math.max(pop(0), pop(1.3), pop(2.3), pop(ROU_CALL), this.rwin || this.rlost ? pop(ROU_END) : 0) };
  }
  updateRoulette(dt) {
    const R = this.rou;
    if (this.rtime >= 0) {
      this.rtime += dt;
      if (!this.called && this.rtime >= ROU_CALL) {
        this.called = true;
        R.marker.visible = true;
        R.marker.position.copy(this.spotPlace(SPOTS.find((s) => s.id === `n${R.number}`))).y += 0.09;
      }
      if (this.rlost && this.croupierLaugh <= 0 && this.rtime >= ROU_END && this.rtime < ROU_END + 0.5) { this.croupierLaugh = 2.4; playLaugh(); }
      if (this.rtime >= ROU_END + ROU_CHEER) this.rtime = -1;   // (the same length for everyone, win or lose, so the next spin starts together)
    }
    // The croupier: breathing like his twin; he reaches across and flicks the wheel to start a spin, watches the ball, and laughs when you lose.
    {
      const c = this.croupier, t = this.rtime;
      this.croupierLaugh = Math.max(0, this.croupierLaugh - dt);
      const ha = Math.min(1, this.croupierLaugh * 2) * Math.min(1, (2.4 - this.croupierLaugh) * 5), shake = Math.sin(this.time * 24) * ha;
      const back = t >= 0 ? 1 - smooth((t - 0.7) / 0.5) : 0, reach = t >= 0 ? smooth(t / 0.3) * back : 0, flick = t >= 0 ? smooth((t - 0.38) / 0.12) * back : 0;
      const watching = t >= 0 && t < ROU_CALL ? smooth(t / 0.3) : 0;
      c.group.rotation.set(-0.16 * ha + shake * 0.025 + 0.12 * reach, Math.sin(this.time * 0.6 + 2) * 0.04 - 0.35 * reach, 0);
      c.group.position.y = Math.abs(shake) * 0.05;
      c.group.scale.y = 1 + Math.sin(this.time * 1.7 + 1) * 0.005 - shake * 0.02;
      c.head.rotation.set(-0.45 * ha + shake * 0.06 + 0.25 * watching, lerp(Math.sin(this.time * 0.4) * 0.18 * (1 - ha), -0.85, watching), 0);
      c.arms.forEach((arm, i) => arm.rotation.set(-ha * (1.5 + Math.sin(this.time * 24 + i * 2) * 0.22) - (i === 0 ? 0.3 * reach : 0), i === 0 ? -1.2 * reach + 0.95 * flick : 0, 0));
    }
    R.speed = lerp(R.speed, this.rtime >= 0.4 && this.rtime < ROU_DROP ? 2.6 : 0.35, 1 - Math.exp(-(this.rtime >= 0.4 && this.rtime < 0.9 ? 9 : 1.5) * dt));   // (it takes off when he flicks it)
    R.wheel.rotation.y += R.speed * dt;
    // The ball: whirling round the rim against the wheel, slowing, then spiralling down into its pocket with a bounce or two.
    const left = this.rtime >= 0 ? Math.max(0, ROU_DROP - this.rtime) : 0, fall = smooth(1 - left / 1.1);
    const angle = R.index * (TAU / WHEEL.length) - Math.PI / 2 - 3.0 * left ** 1.5, r = lerp(ROU_RIM, ROU_POCKET, fall);
    R.ball.position.set(Math.cos(angle) * r, lerp(0.09, 0.03, fall) + Math.abs(Math.sin(left * 15)) * 0.05 * fall * smooth(left / 0.5), Math.sin(angle) * r);
    return this.rwin && this.rtime >= ROU_END ? smooth((this.rtime - ROU_END) / 0.2) * smooth((ROU_END + ROU_CHEER - this.rtime) / 0.3) : 0;   // (how hard he's celebrating)
  }

  // The slot machine you're close enough to play (-1 if none).
  nearSlot() {
    let best = -1, bestDist = 1.5;
    this.machines.forEach((m, i) => {
      const d = Math.hypot(this.pos.x - m.stand.x, this.pos.z - m.stand.z);
      if (d < bestDist) { best = i; bestDist = d; }
    });
    return best;
  }
  playSlot(index) {
    this.orbit = this.tilt = 0;
    this.slot = index;
    this.pos.copy(this.machines[index].stand);
    this.yaw = -Math.PI / 2;   // facing the machine
    this.speed = 0;
    this.reels.position.set(-W / 2 + 1.37, 1.55, this.pos.z);
    this.reels.visible = true;
  }
  // Draw the reels: three strings (an emoji, '7' or 'BAR').
  showReels(symbols) {
    const g = this.reelCanvas.getContext('2d');
    g.fillStyle = '#0a0a0c';
    g.fillRect(0, 0, 340, 240);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    symbols.forEach((s, i) => {
      const x = 12 + i * 108, dark = s === 'BAR';
      g.fillStyle = dark ? '#16161a' : '#f6f2e6';
      g.fillRect(x, 30, 100, 180);
      g.strokeStyle = '#d9b24a';
      g.lineWidth = 5;
      g.strokeRect(x, 30, 100, 180);
      g.fillStyle = dark ? '#f6f2e6' : s === '7' ? '#c8201b' : '#16161a';
      g.font = s === '7' ? '130px Anton, Impact, sans-serif' : dark ? '44px Anton, Impact, sans-serif' : '68px serif';
      g.fillText(s, x + 50, 124);
    });
    this.reelTexture.needsUpdate = true;
  }
  // Pull the lever (the reels are casino.js's business).
  pull() { this.pulled = 0; }
  // A big win: a cut-in, with `title` across the screen at the end of it.
  bigWin(title) { this.win = WIN_TIME; this.winTitle = title; }
  winShot() {
    if (this.win <= 0 || this.slot < 0) return null;
    const t = WIN_TIME - this.win, m = this.machines[this.slot].stand, at = (dx, y, dz) => new THREE.Vector3(m.x + dx, y, m.z + dz);
    const pop = (when) => (t >= when ? Math.exp(-(t - when) * 7) : 0), screen = at(-0.85, 1.55, 0);
    let s;
    if (t < 0.8) s = { pos: at(0.25, 1.6, 0.5), look: screen, fov: 44 - 22 * smooth(t / 0.2), lines: 1, shake: 0.012 };                               // snap zoom: the reels, lined up
    else if (t < 1.9) s = { pos: at(-0.55, 0.75, 1.3), look: at(0.05, 1.55, 0), fov: 50 - 8 * smooth((t - 0.8) / 0.3), lines: 0.8, shake: 0.01 };     // from the carpet, looking up: both arms in the air
    else s = { pos: at(2.6 - 0.4 * smooth((t - 1.9) / 1.2), 1.9, 1.7), look: at(-0.3, 1.4, 0), fov: 46, title: this.winTitle };                       // pulled back: him, the machine, and what he's won
    return { shake: 0, lines: 0, title: '', ...s, flash: Math.max(pop(0), pop(0.8), pop(1.9)) };
  }

  // The free bar stool you're close enough to take (-1 if none). taken[i]: someone is on stool i.
  nearBar(taken = []) {
    let best = -1, bestDist = 1.5;
    this.barStools.forEach((s, i) => {
      const d = Math.hypot(this.pos.x - s.stand.x, this.pos.z - s.stand.z);
      if (!taken[i] && d < bestDist) { best = i; bestDist = d; }
    });
    return best;
  }

  // Order a drink at the bar (you must be sat there). Returns false if the barman is busy.
  order(drink) {
    if (this.bar < 0 || this.barShop.busy || this.drinking > 0 || this.woozy > 0 || this.sick > 0 || this.cutOff > 0) return false;
    if (this.glass) this.scene.remove(this.glass);   // he clears the old glass away
    const glass = (this.glass = this.barShop.makeGlass(drink));
    glass.ready = false;
    glass.drinkId = drink.id;
    return this.barShop.order(drink, glass, this.barStools[this.bar].stand.z, () => { glass.ready = true; });
  }
  // A full glass in front of you, waiting to be drunk?
  get canDrink() { return !!this.glass && this.glass.ready && this.glass.level > 0 && this.drinking <= 0 && this.woozy <= 0 && this.sick <= 0; }
  // Drink it: up to his mouth, head back, down in one, glass back on the bar.
  drink() {
    if (!this.canDrink) return false;
    this.drinking = DRINK_TIME;
    return true;
  }

  sitBar(index) {
    this.orbit = this.tilt = 0;
    this.bar = index;
    this.pos.copy(this.barStools[index].stand);
    this.yaw = Math.PI / 2;   // facing the bar
    this.speed = 0;
  }

  sit(index) {
    this.orbit = this.tilt = 0;
    this.seat = this.lastSeat = index;
    this.pos.copy(this.seats[index].stand);
    this.yaw = Math.atan2(TABLE.x - this.pos.x, TABLE.z - this.pos.z);
    this.speed = 0;
  }
  // Up, and a step back from the stool.
  stand() {
    if (this.roulette) {
      if (this.rtime >= 0) return;   // not while the wheel's spinning
      this.orbit = this.tilt = 0;
      this.pos.z += 0.4;
      this.roulette = false;
      return;
    }
    if (this.slot >= 0) {
      if (this.win > 0) return;
      this.orbit = this.tilt = 0;
      this.pos.x += 0.8;
      this.slot = -1;
      this.reels.visible = false;
      return;
    }
    if (this.bar >= 0) {
      if (this.barShop.busy || this.drinking > 0 || this.woozy > 0 || this.sick > 0) return;   // not while he's making it, mid-swallow, mid-wobble or mid-heave
      this.orbit = this.tilt = 0;
      this.pos.x -= 0.9;
      this.bar = -1;
      if (this.glass) this.scene.remove(this.glass);       // (he clears your glass when you go)
      this.glass = null;
      return;
    }
    if (this.seat < 0) return;
    this.orbit = this.tilt = 0;
    const s = this.seats[this.seat];
    this.pos.set(s.stand.x + Math.sin(s.angle) * 0.9, 0, s.stand.z + Math.cos(s.angle) * 0.9);
    this.seat = -1;
  }

  // Pose a model for someone walking (stride, a little bob, arms swinging) or sat on a stool
  // (thighs level, shins hanging down, forearms on the table). who: { pos, yaw, speed, walk, sitBlend, seat }.
  pose(k, who, dt) {
    const C = config.casino;
    const sat = (who.sitBlend = lerp(who.sitBlend, who.seat >= 0 || who.bar >= 0 ? 1 : 0, 1 - Math.exp(-7 * dt)));
    const moving = Math.min(1, Math.abs(who.speed) / C.walkSpeed);
    who.walk += who.speed * dt * 2.3;
    const swing = Math.sin(who.walk) * 0.6 * moving;
    k.root.position.set(who.pos.x, lerp(Math.abs(Math.sin(who.walk)) * 0.04 * moving, STOOL_Y - 0.83, sat), who.pos.z);
    k.root.rotation.set(0, who.yaw, 0);
    k.root.visible = true;
    k.frontLeg.rotation.x = lerp(swing, -1.5, sat);
    k.backLeg.rotation.x = lerp(-swing, -1.5, sat);
    k.frontLeg.knee.rotation.x = lerp(Math.max(0, -swing) * 1.3, 1.4, sat);   // on foot, the trailing knee bends
    k.backLeg.knee.rotation.x = lerp(Math.max(0, swing) * 1.3, 1.25, sat);
    k.backLeg.rotation.z = 0;
    const sip = who.sip || 0;   // raising a glass: the arm comes up and he leans back into it
    const hand = Math.max(sip, who.drag || 0);   // (the same arm comes up for a drag on a cigarette, without the lean)
    const reach = who.reach || 0, cheer = who.cheer || 0;   // pulling a slot machine's lever; both arms up for a big win
    const hic = who.hic || 0;   // a hiccup: his chest jumps
    k.root.rotation.z = who.lean || 0;
    k.root.position.y += 0.05 * hic;
    k.torso.rotation.x = lerp(0.06 + 0.05 * moving, 0.22, sat) + Math.sin(this.time * 1.4 + who.pos.x) * 0.012 - 0.34 * sip - 0.3 * hic + 0.5 * (who.heave || 0);   // (heave: bent over the bar)
    k.gunArm.rotation.set(lerp(lerp(lerp(1.48 - swing * 0.5, 0.5, sat), -0.95, hand), -1.25, cheer) - 1.15 * reach * (1 - cheer), lerp(lerp(0.1, -0.2, sat), -0.5, hand), 0);
    k.leftArm.rotation.set(lerp(lerp(swing * 0.5, -1.15, sat), -2.7, cheer), 0, lerp(0, 0.35, sat));
    if (cheer) k.root.position.y += Math.abs(Math.sin(this.time * 11)) * 0.12 * cheer;   // (and he's jumping)
    k.updateSmoke(dt);
  }

  // The other players in the room. list: [{ id, name, look, x, z, yaw, seat }] (seat -1 = on their feet).
  // Each gets a model of their own, dressed as they are, with their name over their head.
  showOthers(list, dt) {
    const seen = new Set();
    for (const p of list) {
      seen.add(p.id);
      let o = this.guests.get(p.id);
      if (!o) {
        const model = new SkaterModel(this.scene);
        model.board.visible = false;
        model.rider.position.y = 0;
        model.rider.rotation.y = 0;
        for (const id in model.guns) model.guns[id].group.visible = false;
        try { model.applyLook({ hoodie: '#7a2f2b', beanie: '#24262c', deck: 'wood', wheels: '#e9e4d4', smoke: 'cigarette', ...p.look, goldGuns: new Set() }); } catch {}
        const tag = sign([p.name], 0.95, 0.22, { size: 0.62, color: '#f3efe4', board: 'rgba(12, 12, 14, 0.7)' });
        tag.material.transparent = true;
        this.scene.add(tag);
        o = { model, tag, pos: new THREE.Vector3(p.x, 0, p.z), yaw: p.yaw, speed: 0, walk: 0, sitBlend: 0, seat: -1, bar: -1, slot: -1, pulled: 9, reach: 0, cheer: 0, sip: 0, spinning: false };
        this.guests.set(p.id, o);
      }
      o.seat = p.seat;
      o.bar = p.seat < 0 && p.bar >= 0 && p.bar < this.barStools.length ? p.bar : -1;
      // At a slot machine: pulling its lever when they spin, both arms up when they win big.
      o.slot = p.seat < 0 && o.bar < 0 && p.slot >= 0 && p.slot < this.machines.length ? p.slot : -1;
      if (p.spin && !o.spinning) o.pulled = 0;
      o.spinning = !!p.spin;
      o.pulled += dt;
      o.reach = o.slot >= 0 ? Math.sin(Math.min(1, o.pulled / 0.55) * Math.PI) : 0;
      o.cheer = lerp(o.cheer, o.slot >= 0 && p.win ? 1 : 0, 1 - Math.exp(-9 * dt));
      // At the bar: which drink is in front of them (-1: none yet), and how far it's raised.
      o.glass = o.bar >= 0 && Number.isInteger(p.glass) ? p.glass : -1;
      o.sip = lerp(o.sip, o.bar >= 0 ? Math.max(0, Math.min(1, Number(p.sip) || 0)) : 0, 1 - Math.exp(-12 * dt));
      // Glide to where they say they are (or onto their stool, facing the table).
      const spot = p.seat >= 0 ? this.seats[p.seat].stand : o.bar >= 0 ? this.barStools[o.bar].stand : o.slot >= 0 ? this.machines[o.slot].stand : v.set(p.x, 0, p.z);
      const before = v2.copy(o.pos);
      o.pos.lerp(spot, 1 - Math.exp(-10 * dt));
      o.speed = before.distanceTo(o.pos) / Math.max(dt, 1e-3);
      const face = p.seat >= 0 ? Math.atan2(TABLE.x - spot.x, TABLE.z - spot.z) : o.bar >= 0 ? Math.PI / 2 : o.slot >= 0 ? -Math.PI / 2 : p.yaw;
      o.yaw += Math.atan2(Math.sin(face - o.yaw), Math.cos(face - o.yaw)) * (1 - Math.exp(-10 * dt));
      // Having a smoke at the table: 1 = drawing on it, 2 = blowing it out.
      const smoking = p.seat >= 0 && (p.smoke === 1 || p.smoke === 2) ? p.smoke : 0;
      if (!!smoking !== !!o.lit) { o.lit = !!smoking; this.light(o.model, o.lit); }
      o.drag = lerp(o.drag || 0, smoking === 1 ? 1 : 0, 1 - Math.exp(-8 * dt));
      o.model.inhale = smoking === 1 ? o.drag : 0;
      if (smoking === 2) o.model.exhale(dt);
      this.pose(o.model, o, dt);
      o.emoter ||= createEmoter(o.model, true);
      o.emoter.match(o.lit ? 0 : p.emote | 0);   // (not on top of a smoke at the table)
      o.emoter.update(dt);
      o.tag.position.set(o.pos.x, lerp(2.2, 2.05, o.sitBlend), o.pos.z);
      o.tag.quaternion.copy(this.camera.quaternion);   // always facing you
    }
    for (const [id, o] of this.guests) {
      if (seen.has(id)) continue;
      o.model.setVisible(false);
      this.scene.remove(o.model.root, o.tag);
      this.guests.delete(id);
    }
  }

  // inp: the game's input (W / S walk, A / D turn). others: everyone else in the room (see showOthers).
  update(dt, inp, others = []) {
    this.time += dt;
    const C = config.casino, k = this.kirky;

    if (this.seat < 0 && this.bar < 0 && this.slot < 0 && !this.roulette) {
      this.yaw += inp.steer * C.turnRate * dt + Math.sin(this.time * 1.7) * 0.3 * this.drunk * Math.min(1, Math.abs(this.speed)) * dt;   // (a few drinks in, he weaves)
      const want = (inp.push ? 1 : 0) * C.walkSpeed - (inp.brake ? 1 : 0) * C.walkSpeed * 0.55;
      this.speed = lerp(this.speed, want, 1 - Math.exp(-10 * dt));
      this.pos.x += Math.sin(this.yaw) * this.speed * dt;
      this.pos.z += Math.cos(this.yaw) * this.speed * dt;
      // Stay inside the room, and out of the slots, the bar and the table.
      this.pos.x = Math.max(-W / 2 + 2, Math.min(W / 2 - 5.4, this.pos.x));
      this.pos.z = Math.max(-D / 2 + 1.2, Math.min(D / 2 - 0.9, this.pos.z));
      const rx = this.pos.x - ROU.x, rz = this.pos.z - ROU.z, hx = 3.1, hz = 1.6;   // (the roulette table is a box)
      if (Math.abs(rx) < hx && Math.abs(rz) < hz) {
        if (hx - Math.abs(rx) < hz - Math.abs(rz)) this.pos.x = ROU.x + Math.sign(rx || 1) * hx;
        else this.pos.z = ROU.z + Math.sign(rz || 1) * hz;
      }
      const dx = this.pos.x - TABLE.x, dz = this.pos.z - (TABLE.z + 0.4), d = Math.hypot(dx, dz);
      if (d < STOOL - 0.1 && d > 1e-3) { this.pos.x = TABLE.x + (dx / d) * (STOOL - 0.1); this.pos.z = TABLE.z + 0.4 + (dz / d) * (STOOL - 0.1); }
    }

    if (this.smokeLeft > 0) {
      const t = SMOKE_TIME - (this.smokeLeft -= dt);
      this.drag = smooth(t / 0.5) * (1 - smooth((t - 1.9) / 0.3));
      k.inhale = smooth((t - 0.7) / 0.4) * (1 - smooth((t - 1.85) / 0.1));
      this.puffing = t > 2.15 && t < 3.6 ? 2 : t < 2.15 ? 1 : 0;
      if (this.puffing === 2) k.exhale(dt);
      if (this.smokeLeft <= 0 || this.seat < 0) {
        this.smokeLeft = this.drag = this.puffing = k.inhale = 0;
        this.light(k, false);
      }
    }
    this.pose(k, this, dt);
    this.emoter.update(dt);
    const sat = (this.tableBlend = lerp(this.tableBlend, this.seat >= 0 ? 1 : 0, 1 - Math.exp(-7 * dt)));   // (the camera only leaves him for the blackjack table)
    this.showOthers(others, dt);
    // A drink on the bar for everyone else sitting at it. (Yours is whatever you ordered.)
    // Everyone else's drink, on the bar in front of them: the one they ordered, and gone from the bar while it's at their lips.
    this.barStools.forEach((stool, i) => {
      let who = null;
      for (const o of this.guests.values()) if (o.bar === i) who = o;
      stool.drinks.forEach((glass, k) => { glass.visible = !!who && who.glass === k && who.sip < 0.25; });
    });
    this.barShop.update(dt);

    // Drinking: he reaches for the glass, lifts it, throws his head back, drains it and bangs it down.
    if (this.drinking > 0 && this.glass) {
      const t = DRINK_TIME - (this.drinking -= dt), g = this.glass;
      this.sip = smooth((t - 0.45) / 0.6) * (1 - smooth((t - 2.75) / 0.35));
      g.level = 1 - smooth((t - 1.35) / 1.3);
      g.liquid.scale.y = Math.max(0.001, g.level);
      if (t > 1.35 && t < 2.6 && this.time - (this.gulped || 0) > 0.4) { this.gulped = this.time; this.gulpAt = t; playGulp(); }
      if (t >= 3.1 && !this.slammed) { this.slammed = true; this.slamAt = this.time; g.garnish.visible = false; playGlassDown(); }
      if (this.drinking <= 0) {
        this.drinking = 0;
        this.sip = 0;
        this.slammed = false;
        this.tipsy = Math.min(6, this.tipsy + 1);
        if (this.tipsy > SICK_AFTER - 0.8) {   // one too many
          this.sick = SICK_TIME;
          this.sickClock = 0;
          this.retched = false;
          playGurgle();
        } else if (!this.isTipsy && this.tipsy > TIPSY_AFTER - 0.8) {   // that one did it
          this.isTipsy = true;
          this.woozy = WOOZY_TIME;
          playWoozy();
        }
      }
    }
    this.tipsy = Math.max(0, this.tipsy - dt / 45);   // it wears off
    if (this.isTipsy && this.tipsy < 1.2) this.isTipsy = false;

    this.cutOff = Math.max(0, this.cutOff - dt);
    this.updateSick(dt, k);

    // The cut-in when it hits him: a hiccup, the room swimming, the barman's disapproval, and very nearly the floor.
    if (this.woozy > 0) {
      const t = WOOZY_TIME - this.woozy;
      this.woozy -= dt;
      const now = WOOZY_TIME - this.woozy, crossed = (at) => t < at && now >= at;
      for (const at of [0.35, 4.15]) if (crossed(at)) { this.hicAt = this.time; playHic(); }
      if (crossed(2.1)) this.barShop.scold(this.barStools[Math.max(0, this.bar)].stand.z);
      // He goes over sideways... and hauls himself back.
      this.lean = now > 3.1 && now < 4.1 ? Math.sin(((now - 3.1) / 1.0) * Math.PI) * 0.62 : 0;
    } else this.lean = Math.sin(this.time * 1.1) * 0.05 * this.drunk * (this.bar >= 0 ? 1 : 0);   // (afterwards he just sways on his stool)
    this.hic = Math.max(0, 1 - (this.time - (this.hicAt ?? -9)) * 4);
    if (this.glass && this.glass.ready) {
      const g = this.glass, rest = this.barStools[Math.max(0, this.bar)].stand;
      k.root.updateMatrixWorld(true);
      k.gunArm.localToWorld(v.set(0, 0.03, 0.62));   // his hand
      g.position.set(lerp(rest.x + 0.78, v.x, this.sip), lerp(1.25, v.y - g.lip * 0.5, this.sip), lerp(rest.z + 0.12, v.z, this.sip));
      g.rotation.set(0, 0, 1.15 * smooth((this.sip - 0.6) / 0.4));   // tipped back into his mouth
    }

    if (this.gloat > 0) {
      const before = GLOAT_TIME - this.gloat;
      this.gloat -= dt;
      if (before < 0.95 && GLOAT_TIME - this.gloat >= 0.95) { this.laugh(); playLaugh(); }   // (the laugh starts as the camera finds his face)
    }
    // The dealer breathes and sways. When he laughs he rocks back, shaking, with his arms in the air.
    this.laughing = Math.max(0, this.laughing - dt);
    const ha = Math.min(1, this.laughing * 2) * Math.min(1, (2.4 - this.laughing) * 5), shake = Math.sin(this.time * 24) * ha;
    const d = this.dealer;
    d.rotation.set(-0.16 * ha + shake * 0.025, Math.sin(this.time * 0.7) * 0.04, 0);
    d.position.y = Math.abs(shake) * 0.05;
    d.scale.y = 1 + Math.sin(this.time * 1.8) * 0.005 - shake * 0.02;
    this.dealerHead.rotation.set(-0.45 * ha + shake * 0.06, Math.sin(this.time * 0.45) * 0.22 * (1 - ha), 0);   // looking from player to player; thrown back to laugh
    this.dealerArms.forEach((arm, i) => { arm.rotation.x = -ha * (1.5 + Math.sin(this.time * 24 + i * 2) * 0.22); });

    // Slot screens cycle colours; chandelier crystals glint.
    // Slot machines: the one being played flickers faster (and strobes on a big win); its lever dips when pulled.
    this.pulled += dt;
    this.win = Math.max(0, this.win - dt);
    this.reach = this.slot >= 0 ? Math.sin(Math.min(1, this.pulled / 0.55) * Math.PI) : 0;
    this.cheer = Math.max(this.updateRoulette(dt), this.win > 0 ? smooth((WIN_TIME - this.win - 0.7) / 0.2) * smooth(this.win / 0.3) : 0);
    // (A machine someone else is playing does the same for them.)
    const at = this.machines.map(() => null);
    for (const o of this.guests.values()) if (o.slot >= 0) at[o.slot] = o;
    this.machines.forEach((m, i) => { m.lever.rotation.x = (i === this.slot ? this.reach : at[i] ? at[i].reach : 0) * 1.1; });
    this.screens.forEach((s, i) => {
      const mine = i === this.slot, winning = (mine && this.win > 0) || (at[i] && at[i].cheer > 0.3), spinning = (mine && this.pulled < 2.4) || (at[i] && at[i].spinning);
      if (winning) s.material.color.setHSL((this.time * 4) % 1, 1, 0.5 + 0.25 * Math.sin(this.time * 40));
      else s.material.color.setHSL((this.time * (spinning ? 1.6 : 0.15) + i * 0.17) % 1, 0.8, 0.55);
    });
    this.crystals.forEach((c, i) => { c.rotation.y = this.time * 0.6 + i; });

    // Camera: behind Kirky while he walks. When he sits it rises over his shoulder to look down the table.
    const sway = Math.sin(this.time * 0.9) * 0.07 * this.drunk;   // tipsy: the room moves
    const cam = this.camera, behind = this.roulette ? 2.6 : this.slot >= 0 ? 2.5 : this.bar >= 0 ? 4.8 - 2.8 * this.sitBlend : 4.8, round = this.yaw + this.orbit + sway;   // (closer at the bar: there are columns behind the stools)
    cam.position.set(this.pos.x - Math.sin(round) * behind * Math.cos(this.tilt * 0.6), (this.roulette ? 4.6 : this.slot >= 0 ? 2.25 : 2.8) + this.tilt * 4, this.pos.z - Math.cos(round) * behind * Math.cos(this.tilt * 0.6));
    cam.position.x = Math.max(-W / 2 + 0.5, Math.min(W / 2 - 0.5, cam.position.x));
    cam.position.z = Math.max(-D / 2 + 0.5, Math.min(D / 2 - 0.5, cam.position.z));
    v.set(this.pos.x + Math.sin(round) * 2, 1.5, this.pos.z + Math.cos(round) * 2);
    if (this.roulette) {   // looking down over his shoulder at the whole table, held high in the frame (the betting board is below it)
      const dx = this.rou.stand.x - 0.95 - this.pos.x;   // (framed on the table, whichever place he's standing at)
      v.set(this.pos.x + Math.sin(round) * 0.5 + dx, -0.4, this.pos.z + Math.cos(round) * 0.5);
      cam.position.x += dx;
    }
    if (sat > 0.001 && this.lastSeat !== undefined) {
      const s = this.seats[this.lastSeat];
      // Out past the stool, a little to one side so Kirky's head isn't in the way of his cards.
      // (Dragging swings it round the table and raises or lowers it.)
      const a = s.angle + 0.3 + this.orbit, far = 5.0;
      v2.set(TABLE.x + Math.sin(a) * far, 4.1 + this.tilt * 3, TABLE.z + Math.cos(a) * far);
      cam.position.lerp(v2, sat);
      v.lerp(v2.set(lerp(TABLE.x, s.stand.x, 0.3), FELT_Y, lerp(TABLE.z, s.stand.z, 0.3) + 0.25), sat);
    }
    if (this.firstPerson) {   // out of his own eyes: dragging turns his head
      k.root.updateMatrixWorld(true);
      k.torso.localToWorld(cam.position.set(0, 0.83, 0.05));
      const down = (this.roulette ? 0.75 : this.seat >= 0 ? 0.5 : this.bar >= 0 ? 0.15 : 0.06) + this.tilt * 1.2;   // (at a table he is looking at the felt)
      v.set(cam.position.x + Math.sin(round) * Math.cos(down), cam.position.y - Math.sin(down), cam.position.z + Math.cos(round) * Math.cos(down));
    }
    cam.lookAt(v);
    cam.rotateZ(Math.sin(this.time * 0.7 + 1) * 0.05 * this.drunk);
    cam.aspect = window.innerWidth / window.innerHeight;
    cam.fov = this.firstPerson ? 72 : lerp(62, 56, sat);

    // A cut-in takes the camera over completely: the barman's performance, or you drinking.
    const shot = this.barShop.shot() || this.smokeShot() || this.drinkShot() || this.sickShot() || this.woozyShot() || this.winShot() || this.rouletteShot() || this.dealerShot();
    this.cine.on = !!shot;
    if (this.firstPerson && !shot) k.root.visible = false;   // (you don't see yourself, except in a cut-in)
    if (shot) {
      cam.position.copy(shot.pos);
      if (shot.shake) cam.position.add(v2.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(shot.shake * 2));
      cam.lookAt(shot.look);
      if (shot.roll) cam.rotateZ(shot.roll);
      cam.fov = shot.fov;
      Object.assign(this.cine, { lines: shot.lines, flash: shot.flash, title: shot.title, blur: !!shot.blur });
    }
    cam.updateProjectionMatrix();

    // Cards slide to their places.
    for (const card of this.cards.values()) card.position.lerp(card.userData.target, 1 - Math.exp(-11 * dt));
  }

  // Lay the table out to match the game: state is Blackjack.state.
  showTable(state) {
    const wanted = new Set();
    const place = (owner, index, card, at, along) => {
      const key = `${owner}:${index}`;
      wanted.add(key);
      let mesh = this.cards.get(key);
      if (!mesh) {
        mesh = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W, CARD_H).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: cardFace(card), toneMapped: false }));   // (unlit, so they stay readable under the lamps)
        mesh.position.copy(this.shoe);   // dealt from the shoe
        mesh.userData = { target: new THREE.Vector3() };
        this.cards.set(key, mesh);
        this.scene.add(mesh);
      }
      mesh.userData.target.copy(at).addScaledVector(along, (index - 0.5) * CARD_W * 0.62);
      mesh.userData.target.y = FELT_Y + 0.006 + index * 0.003;   // each card a hair above the last
      mesh.rotation.y = Math.atan2(-along.z, along.x);           // the right way up for whoever is sitting there
    };
    const across = new THREE.Vector3(1, 0, 0), dealerSpot = new THREE.Vector3(TABLE.x - 0.1, FELT_Y, TABLE.z + 0.18);
    state.dealer.forEach((card, i) => place('d', i, card, dealerSpot, across));
    state.seats.forEach((seat, s) => {
      if (!seat) return;
      const spot = this.seats[s], along = new THREE.Vector3(Math.cos(spot.angle), 0, -Math.sin(spot.angle));
      // After a split the two hands sit side by side: the first to the player's left, the second to the right.
      const apart = seat.second ? CARD_W * 1.25 : 0;
      seat.cards.forEach((card, i) => place(`s${s}`, i, card, v2.copy(spot.cards).addScaledVector(along, -apart).clone(), along));
      if (seat.second) seat.second.cards.forEach((card, i) => place(`s${s}b`, i, card, v2.copy(spot.cards).addScaledVector(along, apart).clone(), along));
    });
    for (const [key, mesh] of this.cards) {
      if (wanted.has(key)) continue;
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
      this.cards.delete(key);
    }

    // Chips: a stack in each betting ring, taller for bigger bets.
    for (const chip of this.chips) this.scene.remove(chip);
    this.chips.length = 0;
    this.chipGeo ||= new THREE.CylinderGeometry(0.075, 0.075, 0.022, 14);
    this.chipMats ||= [0xffc233, 0xc8201b, 0x1b1c20, 0x3f7fd6].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.45 }));
    // What each stack is worth, written over it: everyone at the table can read everyone's bet.
    this.betTags ||= new Map();
    const tagFor = (bet) => {
      if (!this.betTags.has(bet)) {
        const c = Object.assign(document.createElement('canvas'), { width: 192, height: 96 }), g = c.getContext('2d');
        g.fillStyle = '#0c0c0e'; g.fillRect(4, 4, 184, 88);
        g.lineWidth = 6; g.strokeStyle = '#ffc233'; g.strokeRect(7, 7, 178, 82);
        g.font = '60px Anton, Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ffc233';
        g.fillText(String(bet), 96, 52, 160);
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        this.betTags.set(bet, new THREE.SpriteMaterial({ map: tex, toneMapped: false }));
      }
      return this.betTags.get(bet);
    };
    state.seats.forEach((seat, s) => {
      if (!seat || seat.bet <= 0) return;
      // One stack per hand (two after a split).
      const hands = seat.second ? [[seat.bet, -0.11], [seat.second.bet, 0.11]] : [[seat.bet, 0]], a = this.seats[s].angle;
      for (const [bet, aside] of hands) {
        const count = Math.min(14, 1 + Math.floor(bet / 40));
        for (let i = 0; i < count; i++) {
          const chip = new THREE.Mesh(this.chipGeo, this.chipMats[(i + s) % 4]);
          chip.position.copy(this.seats[s].bet).setY(FELT_Y + 0.012 + i * 0.023);
          chip.position.x += Math.cos(a) * aside;
          chip.position.z -= Math.sin(a) * aside;
          this.chips.push(chip);
          this.scene.add(chip);
        }
        const tag = new THREE.Sprite(tagFor(bet));
        tag.scale.set(0.34, 0.17, 1);
        tag.position.copy(this.seats[s].bet).setY(FELT_Y + 0.14 + count * 0.023);
        tag.position.x += Math.cos(a) * aside;
        tag.position.z -= Math.sin(a) * aside;
        this.chips.push(tag);
        this.scene.add(tag);
      }
    });
  }
}
