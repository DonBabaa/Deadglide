// The casino: a grand Monte Carlo gaming room you walk round on foot, with a
// blackjack table in the middle of it. This file builds the room and everything
// you can see in it: Kirky walking and sitting, the camera, the dealer (Babitus
// Goyitus, a zombie in a dinner suit who wears more jewels the more the players lose),
// and the cards and chips on the table. The game itself is in blackjack.js;
// casino.js ties them together.
import * as THREE from 'three';
import { SkaterModel } from '../player/skaterModel.js';
import { createEmoter } from '../player/emotes.js';
import { Bar, DRINKS, SERVED } from './bar.js';
import { standIn, laughing } from '../enemies/standIn.js';
import * as FIT from './decor.js';
import { ENEMY_PARTS } from '../enemies/enemyModels.js';
import { WHEEL, SPOTS, LAYOUT, colour } from './roulette.js';
import { config } from '../config.js';
import { glowTexture } from '../world/textures.js';
import { playGulp, playGlassDown, playLaugh, playThunder, playHic, playWoozy, playGurgle, playRetch, playSplash, playCough } from '../fx/audio.js';

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
const TABLE_SIP = 3.4;                             // seconds his drink takes, at the blackjack table: down in one, with a cut-in
const TABLE_FULL = 0.75, REFILL = 16;              // how full his glass is there, and seconds until it is full again
const JACK_TIME = 3.4;                             // seconds of the cut-in when he is dealt a blackjack (the length of his cheer: `cheerup`)
// A jump on the casino floor. up: how fast he leaves it (m/s); down: how hard he comes back (m/s2): high enough to
// get up on a table, or the bar. From a standstill it is his `jump` clip, the whole of it: the crouch (wind: seconds
// of that before he goes; rate: how fast the clip is played through it), up and over (OFF to DOWN: the frames of the
// clip he is in the air for, at 30 a second), and the landing (land: seconds of that). On the run, his knees come up.
const JUMP = { up: 7.6, down: 17, wind: 0.32, rate: 2.4, off: 23, on: 40, end: 57, land: 0.3 };
const TIPSY_AFTER = 3;                             // drinks before it does
const COUGH_TIME = 3.3;                            // seconds the dealer spends coughing and waving the smoke away
const HAZE_LIMIT = 3;                              // smokes hanging over his table before he does
const SMOKE_TIME = 4.4;                            // seconds of the cut-in for a smoke at the blackjack table
// How Babitus deals: a stretch of his clip (`cards`: tools/build_mob_anims.py) that is one card off the deck and
// back, played round and round while there are cards to go out. from, to: its frames. flick: the frame the card
// leaves his hand on. rate: how fast it is played (a card every (to - from) / 30 / rate seconds).
const DEAL = { from: 85, to: 109, flick: 103, rate: 2.3 };
const DEALER_SIZE = 0.93;                          // how big he is, against how he was made (he comes to a little over two metres)
const DRINK_TIME = 3.6;                            // seconds to down a drink
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (k) => { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); };
const v = new THREE.Vector3(), v2 = new THREE.Vector3(), turned = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0), RIGHT = new THREE.Vector3(1, 0, 0);

// What Babitus puts on as the house's winnings grow: [gold taken from the players, what appears].
const RICHES = [
  [100, 'ring'], [250, 'watch'], [500, 'chain'], [900, 'diamonds'], [1400, 'hat'],
  [2200, 'teeth'], [3500, 'medallion'], [5000, 'cuffs'], [8000, 'hoard'], [12000, 'throne'],
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
    const glow = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: false });

    // ---- The room: polished marble underfoot, silk on the walls in gilt frames over a dado of dark marble, a coffered
    // ceiling. Its fittings are sculpted, and are the ones Babitus's own house is furnished with (see decor.js). ----
    const fitted = FIT.painted(), cloth = FIT.painted({ roughness: 0.92, metalness: 0, side: THREE.DoubleSide, emissive: 0x000000 });
    const stand = (geo, x = 0, y = 0, z = 0, turn = 0, material = fitted, parent = this.scene) => { const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.rotation.y = turn; parent.add(m); return m; };
    this.scene.environment = FIT.roomLight();   // (what the gilt and the marble have to shine with)
    this.scene.environmentIntensity = 0.5;
    const NX = Math.round(W / 3.2), NZ = Math.round(D / 3.2);
    add(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), std(0xffffff, 0.14, { map: FIT.marbleFloor([W / 4.2, D / 4.2]), metalness: 0.08 }), 0, 0, 0);
    add(new THREE.PlaneGeometry(W, D).rotateX(Math.PI / 2), std(0xffffff, 0.9, { map: FIT.cofferPanel([NX, NZ]) }), 0, H, 0);
    stand(FIT.coffers(W, D, 3.2), 0, H, 0);
    // (The windows are cut through the walls: [x, z, which way it faces]. What is seen through them is a long way off.)
    const WINDOWS = [[-11, -D / 2, 0], [11, -D / 2, 0], [-W / 2, -7.5, Math.PI / 2], [-W / 2, 0, Math.PI / 2], [-W / 2, 7.5, Math.PI / 2], [W / 2, 7.5, -Math.PI / 2]], WIN = { w: 3.2, h: 6.2, sill: 0.95 };
    this.scene.add(FIT.outside(75, 1.4));
    for (const [w, x, z, turn] of [[W, 0, -D / 2, 0], [W, 0, D / 2, Math.PI], [D, -W / 2, 0, Math.PI / 2], [D, W / 2, 0, -Math.PI / 2]]) {
      const tex = FIT.wallPanels();
      tex.wrapS = THREE.RepeatWrapping;
      tex.repeat.set(Math.round(w / 3.8), 1);
      const holes = WINDOWS.filter((o) => o[2] === turn).map(([wx, wz]) => (turn === 0 ? wx : turn > 0 ? -wz : wz));   // (where each is along its wall)
      add(FIT.wall(w, H, holes, WIN), std(0xffffff, 0.8, { map: tex }), x, 0, z).rotation.y = turn;
      stand(FIT.mouldings(w, H, 2.2), x, 0, z, turn);   // skirting, dado rail, cornice
    }
    add(new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2), std(0xffffff, 0.95, { map: FIT.rug() }), TABLE.x, 0.012, TABLE.z + 0.6);        // a carpet under the table...
    const runner = FIT.rug();
    runner.wrapT = THREE.RepeatWrapping;
    runner.repeat.set(1, 3);
    add(new THREE.PlaneGeometry(3.4, 11).rotateX(-Math.PI / 2), std(0xffffff, 0.95, { map: runner }), 0, 0.01, 9.4);                           // ...and a runner from the door

    // Light: warm and generous, from four chandeliers, each hung from a plaster rose.
    this.scene.add(new THREE.HemisphereLight(0xfff0d8, 0x4a3a30, 0.8));
    const bulb = glow(0xffe2b0);
    this.chandeliers = [];
    for (const [x, z, big] of [[0, -5, 1.25], [-10, 5, 1], [10, 5, 1], [0, 10, 0.8]]) {
      const lamp = new THREE.PointLight(0xffd9a8, 95 * big, 34, 1.6);
      lamp.position.set(x, H - 2.6, z);
      this.scene.add(lamp);
      const size = 0.5 * big, c = FIT.chandelier(size, bulb, 0.6);
      c.position.set(x, H - 0.6 - size * 2.9, z);
      this.scene.add(c);
      stand(FIT.ceilingRose(1.5 * big), x, H - 0.3, z);
      this.chandeliers.push(c);
    }

    // Fluted columns down both sides.
    const pillar = FIT.column(H, 0.45);
    for (const x of [-12.5, 12.5]) for (const z of [-11, -4, 3, 10]) stand(pillar, x, H / 2, z);

    // Arched windows on the harbour, each in a gilt frame under velvet curtains caught back with a cord, a lamp on
    // a bracket either side. The glass is clear: the harbour is out there (see outside() in decor.js).
    const flame = glow(0xffd9a0), clear = FIT.glass(), plaster = std(0xe7dcc4, 0.85, { side: THREE.DoubleSide });
    const frame = FIT.windowFrame(WIN.w, WIN.h), pane = FIT.windowPane(WIN.w, WIN.h), reveal = FIT.windowReveal(WIN), hung = FIT.drapes(6.4, 7.0), light = FIT.sconce(0.42);
    for (const [x, z, turn] of WINDOWS) {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = turn;
      stand(reveal, 0, WIN.sill, 0, 0, plaster, g);
      stand(pane, 0, WIN.sill, -0.22, 0, clear, g);
      stand(frame, 0, WIN.sill, 0.03, 0, fitted, g);
      stand(hung, 0, 8.05, 0.06, 0, cloth, g);
      for (const side of [-1, 1]) { stand(light.lamp, side * 3.65, 3.3, 0.02, 0, fitted, g); stand(light.flames, side * 3.65, 3.3, 0.02, 0, flame, g); }
      this.scene.add(g);
    }

    // Signs.
    const title = FIT.sign(['CASINO DE DEADSLIDE', 'MONTE-CARLO'], 9, 2.2, { size: 0.5 });
    title.position.set(0, H - 2.0, D / 2 - 0.06);
    title.rotation.y = Math.PI;
    const rules = FIT.sign(['BLACKJACK PAYS 3 TO 2', 'DEALER STANDS ON 17'], 5.6, 1.3, { size: 0.42 });
    rules.position.set(TABLE.x - 5.2, 5.2, -D / 2 + 0.06);
    this.houseSign = FIT.sign(['BABITUS GOYITUS', 'THE HOUSE HAS TAKEN 0'], 5.6, 1.3, { size: 0.42, color: '#ffd76a' });
    this.houseSign.position.set(TABLE.x + 5.2, 5.2, -D / 2 + 0.06);
    this.scene.add(title, rules, this.houseSign);

    // The doors you came in by, under the casino's name: shut behind you.
    {
      const S = 0.32, trim = FIT.doorTrim(S), [lw, lh, ld] = FIT.DOOR.leaf.map((n) => n * S), oak = std(0x3a2116, 0.5);
      stand(FIT.doorway(S), 0, 0, D / 2);
      for (const side of [-1, 1]) {
        const leaf = add(new THREE.BoxGeometry(lw, lh, ld), oak, side * (lw / 2 + 0.01), lh / 2, D / 2 - 0.12);
        leaf.rotation.y = side > 0 ? Math.PI : 0;   // (its hinges on the outside edge)
        stand(trim, 0, 0, 0, 0, fitted, leaf);
      }
    }

    // The man himself in gilt, twice, on dark marble either side of his table; and palms in gilt urns in the corners.
    const gilded = new THREE.MeshStandardMaterial({ color: 0xe0b548, roughness: 0.3, metalness: 0.85, emissive: 0x2a1c06 }), block = FIT.plinth(1.1, 1.3);
    for (const x of [-7, 7]) {
      stand(block, x, 0, -12.2);
      const idol = standIn('boss3');
      for (const part of idol.parts) part.mesh.material = gilded;
      idol.group.scale.setScalar(0.9);
      idol.group.position.set(x, 1.3, -12.2);
      idol.group.rotation.y = x < 0 ? 0.3 : -0.3;
      this.scene.add(idol.group);
      idol.pose('cards', 0.3, null, 0, 0, false, (P) => laughing(P, 1, 0.065));   // (as he is when the house wins)
    }
    const tree = FIT.palm(1.05);
    for (const [x, z] of [[-16.5, -12.8], [16.5, -12.8], [-16.5, 12.8], [16.5, 12.8]]) stand(tree, x, 0, z, x * z);

    // Velvet ropes on gilt posts, either side of the way in.
    const post = FIT.ropePost();
    for (const side of [-1, 1]) {
      const zs = [12.4, 9.6, 6.8];
      zs.forEach((z, i) => {
        stand(post, side * 2.3, 0, z);
        if (i) stand(FIT.rope([side * 2.3, 0.99, zs[i - 1] - 0.07], [side * 2.3, 0.99, z + 0.07]), 0, 0, 0, 0, cloth);
      });
    }

    this.buildRoulette();

    // Slot machines along the left wall. Walk up to one to play it (the game itself is in slots.js).
    const cabinet = std(0x5a0f1a, 0.45), chrome = std(0xb9bec4, 0.25, { metalness: 0.6 }), SLOT = 0.5, works = FIT.slotTrim(SLOT, false), [cw, ch, cd] = FIT.SLOT.size.map((n) => n * SLOT);
    this.screens = [];
    this.machines = [];   // { stand: where you play it from, lever }
    for (const z of [-11.2, -3.8, 3.7, 11.2]) {
      const g = new THREE.Group();
      g.position.set(-W / 2 + 0.85, 0, z);
      g.rotation.y = Math.PI / 2;
      add(new THREE.BoxGeometry(cw, ch, cd), cabinet, 0, ch / 2 + 0.1, 0, g);
      stand(works, 0, ch / 2 + 0.1, 0, 0, fitted, g);
      this.screens.push(add(new THREE.PlaneGeometry(FIT.SLOT.screen[0] * SLOT, FIT.SLOT.screen[1] * SLOT), glow(0x7dffb0), 0, ch / 2 + 0.1 + FIT.SLOT.screenAt[1] * SLOT, FIT.SLOT.screenAt[2] * SLOT + 0.002, g));
      const lever = new THREE.Group();   // hinged at the bottom, so it can be pulled
      lever.position.set(cw / 2 + 0.09, 1.0, 0.2);
      add(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 6), chrome, 0, 0.3, 0, lever);
      add(new THREE.SphereGeometry(0.08, 8, 6), glow(0xc8201b), 0, 0.62, 0, lever);
      add(new THREE.SphereGeometry(0.055, 8, 6), chrome, 0, 0, 0, lever);
      g.add(lever);
      this.machines.push({ stand: new THREE.Vector3(-W / 2 + 2.25, 0, z), lever });
      this.scene.add(g);
    }

    // The bar on the right: a marble top on a panelled front with a brass rail for your feet, lamps hung over it,
    // and behind it shelves of bottles in front of a mirror in a gilt frame. And stools.
    add(new THREE.BoxGeometry(1.3, 1.15, 12), std(0x2e1a10, 0.5), W / 2 - 3.1, 0.575, -4);
    stand(FIT.barFront(12, 1.15), W / 2 - 3.75, 0, -4);
    add(new THREE.BoxGeometry(1.7, 0.1, 12.4), std(0xefe8da, 0.12, { metalness: 0.05 }), W / 2 - 3.1, 1.2, -4);
    {
      const back = FIT.backBar(11.6, 0.33), BASE = 1.95;
      add(new THREE.BoxGeometry(0.12, 3.5, 11.9), std(0x2e1a10, 0.6), W / 2 - 0.07, BASE + 1.6, -4);
      add(new THREE.PlaneGeometry(back.mirror[0], back.mirror[1]), std(0x9fb6c4, 0.06, { metalness: 0.9 }), W / 2 - 0.14, BASE + back.mirror[2], -4).rotation.y = -Math.PI / 2;
      stand(back.geo, W / 2 - 0.15, BASE, -4);
      const N = 23, bottles = new THREE.InstancedMesh(FIT.bottle(0.25), glow(0xffffff), N * 3), m = new THREE.Matrix4(), tint = new THREE.Color();
      for (let i = 0; i < N * 3; i++) {
        const k = i % 3, tall = 0.85 + 0.3 * ((i * 7) % 5) / 4;
        m.makeScale(1, tall, 1).setPosition(W / 2 - 0.15 - back.deep, BASE + back.shelves[k] + 0.03 + 0.65 * 0.25 * tall, -4 - 5.2 + Math.floor(i / 3) * (10.4 / (N - 1)) + (k - 1) * 0.07);
        bottles.setMatrixAt(i, m);
        bottles.setColorAt(i, tint.setHSL([0.08, 0.3, 0.55, 0.0, 0.12, 0.78][i % 6], 0.75, 0.42 + 0.12 * (i % 2)));
      }
      this.scene.add(bottles);
      const hang = FIT.pendant(1.5);
      for (const z of [-8.6, -5.5, -2.4, 0.7]) { stand(hang.shade, W / 2 - 3.1, 4.3, z); stand(hang.bulb, W / 2 - 3.1, 4.3, z, 0, bulb); const p = new THREE.PointLight(0xffd9a8, 6, 6, 1.8); p.position.set(W / 2 - 3.1, 2.7, z); this.scene.add(p); }
    }
    // Bar stools you can sit on, and the barman who serves them (see bar.js).
    this.barShop = new Bar(this.scene, { counterY: 1.25, serveX: W / 2 - 3.84, backX: W / 2 - 1.7, homeZ: -4 });
    this.barStools = [];
    this.stoolGeo = FIT.stool(STOOL_Y, 0.27);
    this.fitted = fitted;
    for (let i = 0; i < 6; i++) {
      const x = W / 2 - 4.62, z = -9 + i * 2;
      stand(this.stoolGeo, x, 0, z);
      // One glass of each drink per stool: whichever a friend sitting there has ordered is the one shown.
      const drinks = DRINKS.map((kind) => {
        const glass = this.barShop.makeGlass(kind);
        glass.position.set(x + 0.78, 1.25, z + SERVED);
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
    this.buildLounge(stand, fitted, cloth, glow);
    // What is in the way of his feet, and what he can get up on. A blocker stops him below `below` (Infinity: always);
    // a top is somewhere to land. Each is a box (x0, x1, z0, z1) or a circle (x, z, r).
    const boxed = (x, z, hx, hz) => ({ x0: x - hx, x1: x + hx, z0: z - hz, z1: z + hz });
    this.blockers = [
      { x: TABLE.x, z: TABLE.z + 0.4, r: STOOL - 0.1, below: 0.72 },                       // the stools round the blackjack table
      { x: TABLE.x, z: TABLE.z - 0.05, r: 2.52, below: FELT_Y - 0.03 },                    // the table itself
      { x: TABLE.x, z: TABLE.z - 1.25, r: 0.7, below: Infinity },                          // its dealer
      { ...boxed(ROU.x, ROU.z, 3.1, 1.6), below: FELT_Y - 0.03 },                          // the roulette table
      { x: ROU.x + CROUPIER_X, z: ROU.z - 1.5, r: 0.6, below: Infinity },                  // its croupier
      { x0: W / 2 - 5.4, x1: W / 2 - 4.0, z0: -10.6, z1: 2.6, below: 0.72 },               // the stools along the bar
      { x0: W / 2 - 4.0, x1: W / 2 - 2.2, z0: -10.6, z1: 2.6, below: 1.22 },               // the bar itself
      { x0: W / 2 - 2.25, x1: W / 2, z0: -11, z1: 3, below: Infinity },                    // behind it
      ...[-12.5, 12.5].flatMap((x) => [-11, -4, 3, 10].map((z) => ({ x, z, r: 0.78, below: Infinity }))),   // the columns
      ...[-7, 7].map((x) => ({ ...boxed(x, -12.2, 0.85, 0.85), below: Infinity })),        // his statues
      ...this.lounges.solids.map((s) => ({ ...s, below: s.top - 0.03 })),
    ];
    this.tops = [
      { x: TABLE.x, z: TABLE.z, r: 2.4, z0: TABLE.z - 0.62, top: FELT_Y },
      { ...boxed(ROU.x, ROU.z, 2.62, 1.12), top: FELT_Y },
      { x0: W / 2 - 3.95, x1: W / 2 - 2.0, z0: -10.2, z1: 2.2, top: 1.25 },   // (the bar: a little past its back edge, which is as far as he can go)
      ...this.lounges.solids,
      ...[...this.seats, ...this.barStools].map((seat) => ({ x: seat.stand.x, z: seat.stand.z, r: 0.34, z0: -Infinity, top: STOOL_Y })),   // (a stool will take his weight too: a step up)
    ];
    // Two of him: one at the roulette table to spin the wheel, one to deal the cards.
    this.croupier = this.buildDealer(false);
    this.croupier.group.position.set(ROU.x + CROUPIER_X, 0, ROU.z - 1.5);
    this.banker = this.buildDealer(true);
    this.dealer = this.banker.group;
    this.dealer.position.set(TABLE.x, 0, TABLE.z - 1.22);
    this.toDeal = [];         // cards he has yet to deal: each leaves his hand as it flicks
    this.dealing = 0;         // 0..1: how far into dealing he is
    this.dealClock = 0;       // seconds of his dealing clip gone through, this run of cards
    this.dealtNow = 0;        // cards out, this run of them

    // Kirky, on foot: no board, facing the way he walks.
    this.lips = new THREE.Vector3();
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

  // The lounge: two corners of the room to sit down in, each a sofa and two armchairs round a low marble table (an
  // ashtray on it, a bottle and glasses), on a carpet, under a standing lamp. Sit in any of them (E), and smoke (F) or
  // drink (G) there as at the blackjack table. Leaves this.lounges: { seats: [{ stand, yaw }], solids: [what of it
  // can be stood on: a box and how high its top is] }.
  buildLounge(stand, fitted, cloth, glow) {
    const { std, add } = this, couch = FIT.sofa(2.3), chair = FIT.armchair(), low = FIT.lowTable(), things = FIT.tableThings(), lamp = FIT.floorLamp(), shade = glow(0xffe2b0);
    const seats = [], solids = [], PI = Math.PI;
    // One corner: its table at (x, z), and `turn` which way the sofa faces (it is on the far side of the table from that).
    const corner = (x, z, turn) => {
      const fx = Math.sin(turn), fz = Math.cos(turn), sx = fz, sz = -fx;   // (the way the sofa faces; and across that, to its left)
      const at = (a, b) => [x + fx * a + sx * b, z + fz * a + sz * b];
      const box = (px, pz, hx, hz, top) => { const [wx, wz] = Math.abs(fx) > 0.5 ? [hz, hx] : [hx, hz]; solids.push({ x0: px - wx, x1: px + wx, z0: pz - wz, z1: pz + wz, top }); };
      const rug = add(new THREE.PlaneGeometry(4.6, 4.9).rotateX(-PI / 2), std(0xffffff, 0.95, { map: FIT.rug() }), x, 0.011, z);
      rug.rotation.y = turn;
      stand(low, x, 0, z, turn);
      stand(things, x, FIT.TABLE_TOP, z, turn);
      box(x, z, 0.7, 0.38, FIT.TABLE_TOP);
      { const [px, pz] = at(-1.42, 0); stand(couch, px, 0, pz, turn, cloth); box(px, pz, 1.3, 0.46, FIT.SEAT); for (const b of [-0.76, 0, 0.76]) { const [qx, qz] = at(-1.34, b); seats.push({ stand: new THREE.Vector3(qx, 0, qz), yaw: turn }); } }
      for (const b of [-0.98, 0.98]) { const [px, pz] = at(1.42, b); stand(chair, px, 0, pz, turn + PI, cloth); box(px, pz, 0.55, 0.46, FIT.SEAT); const [qx, qz] = at(1.34, b); seats.push({ stand: new THREE.Vector3(qx, 0, qz), yaw: turn + PI }); }
      { const [px, pz] = at(-1.6, 1.75); stand(lamp.stand, px, 0, pz); stand(lamp.shade, px, 0, pz, 0, shade); const light = new THREE.PointLight(0xffd9a8, 9, 7, 1.8); light.position.set(px, 1.5, pz); this.scene.add(light); }
    };
    corner(8.6, 8.4, PI);            // by the doors, on the right: its sofa against the front of the room, looking in
    corner(-9.4, -7.6, PI / 2);      // up the far end, on the left: its sofa between the columns, looking across at the table
    this.lounges = { seats, solids };
  }

  // The blackjack table: a half-round of printed baize with a padded leather rim, on a turned pedestal with a gilt
  // foot; a card shoe, a tray of chips, and buttoned velvet stools.
  buildTable() {
    const { std, add, gold } = this, t = new THREE.Group();
    t.position.copy(TABLE);
    const felt = std(0x0d4129, 0.95), leather = std(0x3a1a12, 0.35), wood = std(0x4a2a14, 0.35), R = 2.4, BACK = 0.6;
    add(new THREE.CylinderGeometry(R, R, 0.1, 48, 1, false, -Math.PI / 2, Math.PI), felt, 0, FELT_Y - 0.05, 0, t);   // the half-round the players sit at
    add(new THREE.BoxGeometry(R * 2, 0.1, BACK), felt, 0, FELT_Y - 0.05, -BACK / 2, t);                              // the dealer's side
    add(FIT.baizeTop(R, BACK), std(0xffffff, 0.95, { map: FIT.baize(R, BACK, SEAT_ANGLES) }), 0, FELT_Y + 0.002, 0, t);   // (the baize itself, as it is printed: one piece, the shape of the top)
    add(new THREE.TorusGeometry(R, 0.11, 10, 56, Math.PI).rotateX(Math.PI / 2), leather, 0, FELT_Y, 0, t);            // padded rim
    add(new THREE.TorusGeometry(R + 0.1, 0.025, 6, 56, Math.PI).rotateX(Math.PI / 2), gold, 0, FELT_Y - 0.06, 0, t); // a gold bead under it
    add(new THREE.CylinderGeometry(R + 0.04, R - 0.1, 0.22, 48, 1, true, -Math.PI / 2, Math.PI), wood, 0, FELT_Y - 0.2, 0, t);   // the apron under it
    add(new THREE.BoxGeometry(R * 2 + 0.2, 0.2, 0.12), wood, 0, FELT_Y - 0.02, -BACK - 0.02, t);
    add(new THREE.BoxGeometry(R * 2 + 0.2, 0.03, 0.14), gold, 0, FELT_Y + 0.09, -BACK - 0.02, t);
    { const leg = new THREE.Mesh(FIT.pedestal(FELT_Y - 0.1, 0.3), this.fitted); leg.position.set(0, 0, 0.5); t.add(leg); }
    // The shoe (a wedge of dark wood with a brass lip, a card showing at its mouth), and the tray of chips in rows.
    add(new THREE.BoxGeometry(0.34, 0.2, 0.5), std(0x121214, 0.4), 1.75, FELT_Y + 0.1, -0.25, t);
    add(new THREE.BoxGeometry(0.36, 0.03, 0.06), gold, 1.75, FELT_Y + 0.205, 0.0, t);
    add(new THREE.BoxGeometry(0.26, 0.012, 0.1), std(0xf6f2e6, 0.6), 1.75, FELT_Y + 0.03, 0.03, t);
    add(new THREE.BoxGeometry(1.24, 0.05, 0.34), wood, 0, FELT_Y + 0.025, -0.36, t);
    add(new THREE.BoxGeometry(1.28, 0.02, 0.38), gold, 0, FELT_Y + 0.008, -0.36, t);
    const chipMats = [gold, std(0xc8201b, 0.5), std(0x1b1c20, 0.5), std(0x2f6fd0, 0.5), std(0x1f8a4a, 0.5), std(0xf3efe4, 0.5)];
    for (let i = 0; i < 6; i++) for (let k = 0; k < 2; k++) {
      const high = 0.05 + 0.02 * ((i * 3 + k * 5) % 4);
      add(new THREE.CylinderGeometry(0.058, 0.058, high, 14), chipMats[i], -0.47 + i * 0.188, FELT_Y + 0.05 + high / 2, -0.43 + k * 0.14, t);
      add(new THREE.CylinderGeometry(0.06, 0.06, 0.006, 14), std(0xf3efe4, 0.5), -0.47 + i * 0.188, FELT_Y + 0.05 + high, -0.43 + k * 0.14, t);
    }
    this.seats = SEAT_ANGLES.map((deg) => {
      const a = (deg * Math.PI) / 180, sin = Math.sin(a), cos = Math.cos(a);
      const seat = new THREE.Mesh(this.stoolGeo, this.fitted);
      seat.position.set(sin * STOOL, 0, cos * STOOL);
      t.add(seat);
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

  // Babitus Goyitus: as he is in his own house (the same body: see enemies/realMobs.js), in his dinner suit, dealing
  // by the clip he deals by there. His riches (see RICHES) are put on him here, hidden until the house has won enough:
  // his gold, as he puts it on in the fight (three lots of it, each the one before and more), and round that a ring,
  // a watch, diamonds, a top hat, gold teeth, and what he keeps by him at the card table (`banker`: the one who
  // has that). Feet at y = 0, facing +z. Returns { him (see standIn.js), group, riches, worn (his gold), face (where
  // his eyes are, in the world) }.
  buildDealer(banker) {
    const { std, add, gold } = this, him = standIn('boss3'), d = new THREE.Group();
    him.group.scale.setScalar(DEALER_SIZE);
    him.group.position.y = 0.06;   // (he deals up on his toes: this puts them on the floor)
    d.add(him.group);
    const rich = {}, item = (name, ...meshes) => { rich[name] = (rich[name] || []).concat(meshes); for (const m of meshes) m.visible = false; };
    const diamond = new THREE.MeshBasicMaterial({ color: 0xbff4ff, toneMapped: false }), white = std(0xf3f0e8, 0.7), suit = std(0x0e0e12, 0.55);
    const shine = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    const worn = ['boss3b', 'boss3c', 'boss3d'].map((name) => {
      const lot = ENEMY_PARTS[name]().filter((part) => part.glow).pop(), m = new THREE.Mesh(lot.geometry, shine);
      m.visible = false;
      him.body.add(m);
      return m;
    });
    // (what goes on his head and his trunk is measured from his eyes; what goes on a hand, along it from his elbow)
    const E = him.eyes, body = him.body, right = him.hand(-1), left = him.hand(1), along = (side, k) => him.tip(side).clone().multiplyScalar(k);
    const round = (mesh, side) => { mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), him.tip(side).clone().normalize()); return mesh; };   // (a band, about his arm)
    const deck = add(new THREE.BoxGeometry(0.075, 0.035, 0.105), white, 0, 0, 0, left);   // the deck, in his left hand
    deck.position.copy(along(1, 1.02)).y += 0.03;
    add(new THREE.BoxGeometry(0.077, 0.004, 0.107), std(0x7a1020, 0.5), 0, 0.02, 0, deck);
    { const at = along(-1, 1.06); item('ring', round(add(new THREE.TorusGeometry(0.022, 0.008, 6, 14), gold, at.x, at.y, at.z, right), -1), add(new THREE.OctahedronGeometry(0.017), diamond, at.x, at.y + 0.03, at.z, right)); }
    { const at = along(1, 0.66); item('watch', round(add(new THREE.TorusGeometry(0.058, 0.016, 8, 20), gold, at.x, at.y, at.z, left), 1), add(new THREE.CylinderGeometry(0.036, 0.036, 0.02, 14), white, at.x, at.y + 0.06, at.z, left)); }
    item('chain', worn[0]);
    item('diamonds', add(new THREE.OctahedronGeometry(0.03), diamond, 0, E.y - 0.3, E.z + 0.03, body), ...[-1, 1].map((side) => add(new THREE.OctahedronGeometry(0.022), diamond, side * 0.125, E.y - 0.05, E.z - 0.15, body)));   // tie pin, earrings
    item('hat', add(new THREE.CylinderGeometry(0.135, 0.14, 0.27, 20), suit, 0, E.y + 0.34, E.z - 0.14, body), add(new THREE.CylinderGeometry(0.23, 0.23, 0.022, 24), suit, 0, E.y + 0.2, E.z - 0.14, body), add(new THREE.CylinderGeometry(0.143, 0.143, 0.05, 20), gold, 0, E.y + 0.24, E.z - 0.14, body));
    item('teeth', add(new THREE.BoxGeometry(0.085, 0.022, 0.016), gold, 0, E.y - 0.105, E.z + 0.012, body));
    item('medallion', worn[1]);
    item('cuffs', ...[-1, 1].flatMap((side) => { const at = along(side, 0.74); return [add(new THREE.OctahedronGeometry(0.02), diamond, at.x - side * 0.05, at.y, at.z, him.hand(side))]; }));   // a diamond at each cuff
    const hoard = [];
    if (banker) {
      for (let i = 0; i < 14; i++) hoard.push(add(new THREE.BoxGeometry(0.34, 0.11, 0.16), gold, -1.9 + (i % 5) * 0.37 + (Math.floor(i / 5) % 2) * 0.18, 0.06 + Math.floor(i / 5) * 0.115, -0.55, d));   // gold bars stacked beside him
      for (const x of [1.4, 1.9]) hoard.push(add(new THREE.SphereGeometry(0.3, 10, 8).scale(1, 0.85, 1), std(0x6b5a3a, 0.95), x, 0.26, -0.5, d), add(new THREE.CylinderGeometry(0.07, 0.12, 0.14, 8), std(0x6b5a3a, 0.95), x, 0.56, -0.5, d));   // money bags
    }
    item('hoard', ...hoard);
    item('throne', worn[2], ...(banker ? [add(new THREE.BoxGeometry(1.5, 3.0, 0.2), gold, 0, 1.5, -0.6, d), add(new THREE.BoxGeometry(1.16, 2.35, 0.05), std(0x6a0f1c, 0.85), 0, 1.55, -0.49, d),
      ...[-1, 1].map((side) => add(new THREE.SphereGeometry(0.15, 10, 8), gold, side * 0.75, 3.08, -0.6, d)), add(new THREE.OctahedronGeometry(0.18), diamond, 0, 3.17, -0.6, d)] : []));
    this.scene.add(d);
    this.wealth = -1;
    return { him, group: d, riches: rich, worn, face: new THREE.Vector3(0, 1.8, 0) };
  }

  // Dress the dealer for how much the house has taken from the players, and put it on his sign.
  setWealth(amount) {
    amount = Math.max(0, Math.floor(amount));
    if (amount === this.wealth) return;
    this.wealth = amount;
    // (the croupier wears it all too; the gold and the throne are at the card table)
    const got = (name) => amount >= RICHES.find((r) => r[1] === name)[0], lot = got('throne') ? 2 : got('medallion') ? 1 : got('chain') ? 0 : -1;
    for (const who of [this.banker, this.croupier]) {
      for (const [at, name] of RICHES) for (const m of who.riches[name]) m.visible = amount >= at;
      who.worn.forEach((m, i) => { m.visible = i === lot; });   // (his gold: one lot of it or the next, not one over another)
      if (lot === 2) for (const m of who.riches.hat) m.visible = false;   // (and his crown, when he has it, in place of his hat)
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
    const pop = (when) => (t >= when ? Math.exp(-(t - when) * 7) : 0), head = this.banker.face.clone();
    let s;
    if (t < 0.95) s = { pos: at(0.45, FELT_Y + 1.0 - 0.45 * smooth(t / 0.4), 0.95), look: at(-0.05, FELT_Y, 0.2), fov: 44 - 20 * smooth(t / 0.35), lines: 0.8 };                 // snap zoom: the cards
    else if (t < 2.05) s = { pos: at(-0.6, 1.1, 0.0), look: head, fov: 44 - 12 * smooth((t - 0.95) / 0.25), shake: 0.01, lines: 1, title: '21' };                          // from the baize, looking up at him
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
    this.tableSip = 0;         // seconds of his drink left, at the blackjack table (he has a glass by his cards there)
    this.refill = 0;           // ...and seconds until that glass is full again
    this.rising = 0;           // seconds left of him up off his stool cheering (a blackjack)
    this.glad = 0;             // seconds left of him cheering where he sits (a hand won)
    this.jumping = null;       // a jump on the floor: { t: seconds into it, run: on the run, off: he has left the floor, down: seconds since he landed }
    this.y = 0;                // how high his feet are (on a table, on the bar, in the air)
    this.vy = 0;
    this.lounge = -1;          // which seat in the lounge he is in (-1: none)
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
    this.haze = 0;             // how much smoke is hanging over the blackjack table (one per cigarette; it thins out slowly)
    this.coughing = 0;         // seconds of the dealer's coughing fit left
    if (!this.hazeSprites) {   // the smoke itself: soft grey puffs adrift over the felt
      const map = glowTexture();
      this.hazeSprites = Array.from({ length: 16 }, (_, i) => {
        const puff = new THREE.Sprite(new THREE.SpriteMaterial({ map, color: 0xaeb3c0, transparent: true, opacity: 0, depthWrite: false }));
        puff.userData = { a: i * 2.4, r: 0.5 + (i % 5) * 0.42, y: 1.45 + (i % 4) * 0.26, size: 1.8 + (i % 3) * 0.7, rate: 0.12 + (i % 4) * 0.05 };
        this.scene.add(puff);
        return puff;
      });
    }
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
    const at = (dx, y, dz) => new THREE.Vector3(st.x + dx, y, st.z + dz), headAt = this.faceOf(at(0.14, 1.6, 0));
    const pop = (when) => (t >= when ? Math.exp(-(t - when) * 7) : 0);
    let s;
    if (t < 1.5) s = { pos: at(1.8 - 0.35 * smooth(t / 1.5), 1.52, 0.42), look: headAt, fov: 36 - 12 * smooth(t / 1.4), lines: 0.3 + 0.5 * smooth(t / 1.4), shake: 0.025 * this.hic, title: t > 0.9 ? 'Uh oh.' : '' };   // his face, going green
    else if (t < 2.5) s = { pos: new THREE.Vector3(backX - 2.0, 1.72, st.z + 0.45), look: this.barShop.headAt.clone(), fov: 46 - 22 * smooth((t - 1.5) / 0.16), lines: 1, shake: 0.01 };            // the barman has seen that colour before
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
    const at = (dx, y, dz) => new THREE.Vector3(st.x + dx, y, st.z + dz), headAt = this.faceOf(at(0.14, 1.6, 0));
    const pop = (when) => (t >= when ? Math.exp(-(t - when) * 7) : 0);
    let s;
    if (t < 0.95) s = { pos: at(1.75, 1.52, 0.4), look: headAt, fov: 36 - 10 * smooth(t / 0.3), lines: 0.5, shake: 0.02 * this.hic, title: t > 0.35 ? 'Hic!' : '' };       // his face. Hic.
    else if (t < 2.1) s = { pos: at(0.3, 1.62, 0), look: at(4, 1.95 + Math.sin(t * 2.3) * 0.5, Math.sin(t * 1.7) * 1.6), fov: 72 + Math.sin(t * 3.1) * 9, roll: Math.sin(t * 2.6) * 0.3, blur: true };   // through his eyes: the bottles swim
    else if (t < 3.05) s = { pos: new THREE.Vector3(backX - 2.0, 1.72, st.z + 0.45), look: this.barShop.headAt.clone(), fov: 46 - 22 * smooth((t - 2.1) / 0.18), lines: 1 };   // snap zoom: the barman has seen this before
    else s = { pos: at(0.35, 1.45, 2.5), look: at(0.15, 1.15, 0), fov: 44 - 6 * smooth((t - 3.9) / 0.4), roll: this.lean * 0.25, lines: t > 3.9 ? 0.7 : 0, shake: 0.02 * this.hic, title: t > 3.9 ? 'Tipsy' : '' };   // from the side: over he goes... and back
    return { shake: 0, lines: 0, title: '', ...s, flash: Math.max(pop(0.35), pop(2.1) * 0.7, pop(3.9)) };
  }

  // The camera's shots while you drink (see Bar.shot for the idea): the glass, the lift, the long
  // swallow in profile with a punch-in on every gulp, and the glass banged back down.
  drinkShot() {
    if (this.drinking <= 0 || !this.glass || this.bar < 0) return null;
    const t = DRINK_TIME - this.drinking, g = this.glass.position, st = this.barStools[this.bar].stand;
    const at = (dx, y, dz) => new THREE.Vector3(st.x + dx, y, st.z + dz), headAt = this.faceOf(at(0.12, 1.6, 0));
    const gulp = Math.max(0, 1 - (t - (this.gulpAt ?? -9)) * 5);   // 1 on each swallow, fading
    const big = 1 + ((this.kirky.faceBig || 1) - 1) * 0.72;   // (his head is bigger than the one these shots were set for)
    const slam = this.slammed ? Math.exp(-(this.time - this.slamAt) * 7) : 0;
    let s;
    // (the glass shots: from over the bar with him right behind his drink, not off the edge of the frame)
    if (t < 0.6) s = { pos: at(1.22, 1.4, SERVED - 0.62), look: at(0.55, 1.4, SERVED + 0.08), fov: 40 - 8 * smooth(t / 0.6), lines: 0.4 };                     // the glass, waiting; his hand comes for it
    else if (t < 1.35) s = { pos: at(2.0, 1.42, 0.55), look: headAt, fov: 44 - 14 * smooth((t - 0.6) / 0.5), lines: 0.6 };                      // from across the bar: up it comes
    else if (t < 2.75) s = { pos: headAt.clone().add(v.set(0.16, 0.05, (1.05 - 0.1 * gulp) * big)), look: headAt.clone().add(v.set(0.1, 0.02, 0)), fov: 31 - 4 * gulp, shake: 0.004 * gulp, lines: 0.35 + 0.5 * gulp };   // in profile: down it goes (on his face, where it is, his head thrown back)
    else if (t < 3.1) s = { pos: at(1.22, 1.4, SERVED - 0.62), look: at(0.55, 1.4, SERVED + 0.08), fov: 34 };                                                     // back over the bar: the glass on its way down
    else s = { pos: at(1.55, 1.5, 0.5), look: headAt.clone().lerp(at(0.78, 1.3, SERVED), 0.3), fov: 34 - 8 * smooth((t - 3.1) / 0.12), shake: 0.03 * slam, lines: 0.5, title: 'Ahhh.' };                              // bang
    return { shake: 0, lines: 0, title: '', ...s, flash: slam * 0.9 };
  }

  // ---- A drink at the blackjack table ---------------------------------------------------
  // The whisky by his cards, down in one, filmed as the one at the bar is. Returns false if he can't just now (it is
  // empty: it is topped up after a while).
  tableDrink() {
    if ((this.seat < 0 && this.lounge < 0) || this.tableSip > 0 || this.smokeLeft > 0 || this.rising > 0 || this.cine.on || !this.tableGlass || this.tableGlass.level < TABLE_FULL * 0.9) return false;
    this.emoter.stop();
    this.tableSip = TABLE_SIP;
    return true;
  }
  // What is in front of him at the table, for a camera: at(a, b, y) is `a` metres ahead of his stool (towards the
  // middle of the table), `b` to his left, and `y` up.
  tableAt() {
    const st = this.pos, ax = Math.sin(this.yaw), az = Math.cos(this.yaw);   // (sat down, he faces what he is sat at)
    return (a, b, y) => new THREE.Vector3(st.x + ax * a + az * b, y, st.z + az * a - ax * b);
  }
  // How high the top of what he is sat at is (the blackjack table, or a low table in the lounge), and how far in front of him his glass stands on it.
  get tableTop() { return this.lounge >= 0 ? FIT.TABLE_TOP : FELT_Y; }
  tableDrinkShot() {
    if (this.tableSip <= 0 || (this.seat < 0 && this.lounge < 0)) return null;
    const t = TABLE_SIP - this.tableSip, at = this.tableAt(), headAt = this.faceOf(at(0.1, 0, 1.6)), big = 1 + ((this.kirky.faceBig || 1) - 1) * 0.72, FELT_Y = this.tableTop;   // (FELT_Y: the top he is drinking at, here)
    const gulp = Math.max(0, 1 - (t - (this.gulpAt ?? -9)) * 5), slam = this.slammed ? Math.exp(-(this.time - this.slamAt) * 7) : 0;
    const side = at(0.16, -(1.05 - 0.1 * gulp) * big, 0).sub(at(0, 0, 0));   // (off to his right: the hand his glass is in is his left)
    let s;
    if (t < 0.55) s = { pos: at(0.86, 0.98, FELT_Y + 0.16), look: at(0.56, 0.24, FELT_Y + 0.13), fov: 42 - 10 * smooth(t / 0.5), lines: 0.5 };          // along the felt: the glass, and his hand coming for it
    else if (t < 1.25) s = { pos: at(1.85, -0.5, 1.5), look: headAt, fov: 46 - 16 * smooth((t - 0.55) / 0.4), lines: 0.6 };                               // from across the table: up it comes
    else if (t < 2.55) s = { pos: headAt.clone().add(side).setY(headAt.y + 0.05), look: headAt.clone().add(at(0.1, 0, 0).sub(at(0, 0, 0))).setY(headAt.y + 0.02), fov: 31 - 4 * gulp, shake: 0.004 * gulp, lines: 0.35 + 0.5 * gulp };   // in profile: down it goes, a punch-in on every swallow
    else if (t < 2.9) s = { pos: at(0.86, 0.98, FELT_Y + 0.16), look: at(0.56, 0.24, FELT_Y + 0.13), fov: 34 };                                           // along the felt again: back it comes
    else s = { pos: at(1.6, -0.45, 1.52), look: headAt.clone().lerp(at(0.6, 0.3, FELT_Y), 0.25), fov: 36 - 8 * smooth((t - 2.9) / 0.12), shake: 0.03 * slam, lines: 0.5, title: 'Ahhh.' };   // bang
    return { shake: 0, lines: 0, title: '', ...s, flash: slam * 0.9 };
  }

  // ---- A hand won ------------------------------------------------------------------------
  // He cheers where he sits; and for a blackjack he is up off his stool, with a cut-in: the two cards, his face as he
  // sees them, and all of him from low over the felt as he goes up.
  celebrate(blackjack) {
    if (this.seat < 0) return;
    if (!blackjack) { this.glad = 2.1; return; }
    this.rising = JACK_TIME;
    this.kirky.express?.('smile', JACK_TIME);
    playThunder();
  }
  jackShot() {
    if (this.rising <= 0 || this.seat < 0) return null;
    const t = JACK_TIME - this.rising, at = this.tableAt(), headAt = this.faceOf(at(0.1, 0, 1.6)), big = 1 + ((this.kirky.faceBig || 1) - 1) * 0.72;
    const cards = this.seats[this.seat].cards, pop = (when) => (t >= when ? Math.exp(-(t - when) * 7) : 0);
    let s;
    if (t < 0.7) s = { pos: cards.clone().add(at(-0.42, 0.1, 0).sub(at(0, 0, 0))).setY(FELT_Y + 1.0 - 0.45 * smooth(t / 0.3)), look: cards, fov: 50 - 20 * smooth(t / 0.28), lines: 0.9 };              // snap zoom: an ace and a face
    else if (t < 1.5) s = { pos: headAt.clone().add(at(1.15 * big, 0.3 * big, 0).sub(at(0, 0, 0))).setY(headAt.y - 0.12), look: headAt, fov: 36 - 11 * smooth((t - 0.7) / 0.2), lines: 1, shake: 0.008, title: 'Blackjack!' };   // his face, from the felt, as it sinks in
    else s = { pos: at(1.75, -1.05, FELT_Y + 0.16), look: at(0, 0, 1.3 + 0.32 * smooth((t - 1.5) / 0.6)), fov: 50, lines: 0.8, shake: 0.006, title: 'Blackjack!' };                                      // from low over the felt: up he goes
    return { shake: 0, lines: 0, title: '', ...s, flash: Math.max(pop(0), pop(0.7), pop(1.5) * 0.7) };
  }

  // ---- A smoke at the table --------------------------------------------------------------
  // Sat at the blackjack table or the bar: a long drag and a slow cloud, filmed as a cut-in. Returns false if he
  // can't just now. At the table the smoke hangs about (this.haze), and too much of it sets the dealer coughing.
  smoke() {
    if ((this.seat < 0 && this.bar < 0 && this.lounge < 0) || this.smokeLeft > 0 || this.cine.on || this.drinking > 0 || this.tableSip > 0 || this.rising > 0 || this.barShop.busy) return false;
    this.emoter.stop();
    this.smokeLeft = SMOKE_TIME;
    this.light(this.kirky, true);
    return true;
  }
  // Put a lit cigarette in a model's mouth whatever it usually has there (on), or give it back its own (off).
  // The middle of Kirky's face, for a shot that is on it (or `otherwise`, a guess at it, if his body cannot say).
  faceOf(otherwise) {
    const k = this.kirky;
    if (!k.faceAt) return otherwise;
    k.root.updateMatrixWorld(true);
    return k.faceAt(otherwise);
  }
  light(model, on) {
    if (!on) return model.applyLook(model.look);
    for (const kind in model.mouth) for (const piece of model.mouth[kind]) piece.visible = kind === 'cigarette';
    model.ember.visible = model.smoking = true;
    model.placeEmber?.('cigarette');   // (on the end of the one he is smoking now, not of whatever he usually has in his mouth: the golden one's is somewhere else)
    model.emberSize = 1;
  }
  // Its shots: a snap zoom on him, the ember in close-up as he draws on it, a hard cut to his profile holding it in,
  // then from low across the felt as the cloud rolls out.
  smokeShot() {
    if (this.smokeLeft <= 0 || (this.seat < 0 && this.bar < 0 && this.lounge < 0)) return null;
    const t = SMOKE_TIME - this.smokeLeft, k = this.kirky;
    k.root.updateMatrixWorld(true);
    // (the middle of his face, where it is now, and standing off by as much as his head is bigger than the one
    // these shots were set for)
    const head = k.faceAt ? k.faceAt(new THREE.Vector3()) : k.torso.localToWorld(new THREE.Vector3(0, 0.8, 0)), big = 1 + ((k.faceBig || 1) - 1) * 0.72;
    const ahead = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)), across = new THREE.Vector3(ahead.z, 0, -ahead.x);
    const at = (a, b, up) => head.clone().addScaledVector(ahead, a * big).addScaledVector(across, b * big).setY(head.y + up * big);
    const tip = k.ember.getWorldPosition(new THREE.Vector3());
    const pop = (when) => (t >= when ? Math.exp(-(t - when) * 7) : 0);
    let s;
    // (At the bar what is in front of him is the bar, and behind that the wall. So its shots are from over the
    // counter itself, looking back at him with the room behind him: up at him from the bar top for the snap zoom,
    // right on the ember, a hard cut to him in profile from low along the bar with the frame tipped, and from the
    // bar top a long way down it as the cloud rolls out. Cut as hard as the table's: closer, lower, tighter.)
    const out = smooth((t - 2.15) / 2), bar = this.bar >= 0;
    const from = bar ? [[0.78, 0.3, -0.16], [0.44, 0.17, 0.0], [0.22, -1.1, -0.2], [0.55, -1.25 - 0.3 * out, 0.03]] : [[1.5, 0.55, 0.15], [0.6, 0.3, -0.02], [0.45, -1.4, -0.05], [1.5 + 0.3 * out, -0.8, -0.1]];
    if (t < 0.7) s = { pos: at(...from[0]), look: head, fov: (bar ? 54 : 46) - (bar ? 30 : 22) * smooth(t / 0.18), lines: 1, shake: bar ? 0.012 * Math.exp(-t * 6) : 0 };          // snap zoom: his hand comes up
    else if (t < 1.9) s = { pos: at(...from[1]), look: tip.lerp(head, bar ? 0.2 : 0.35), fov: (bar ? 22 : 26) - 5 * smooth((t - 0.7) / 1.2), lines: 0.4 + 0.6 * k.inhale, shake: 0.004 * k.inhale };   // the ember, flaring
    else if (t < 2.15) s = { pos: at(...from[2]), look: at(0.15, 0, 0.02), fov: bar ? 26 : 30, lines: 1, roll: bar ? 0.16 : 0 };                                // hard cut: in profile, holding it
    else s = { pos: at(...from[3]), look: at(0.08, 0, -0.02), fov: (bar ? 48 : 40) - (bar ? 10 : 6) * out, lines: bar ? 0.5 * (1 - out) : 0, roll: bar ? 0.05 * (1 - out) : 0, title: t > 3.1 ? 'Smooth.' : '' };   // and out it rolls: on him, the cloud coming at the camera
    return { shake: 0, lines: 0, title: '', ...s, flash: Math.max(pop(0), pop(0.7) * 0.6, pop(1.9), pop(2.15) * 0.8) };
  }

  // The dealer's coughing fit, if you are sat at his table to see it: up at him from the baize, from the side as
  // he bats at the air, and the whole table from behind the players.
  coughShot() {
    if (this.coughing <= 0 || this.seat < 0) return null;
    const t = COUGH_TIME - this.coughing, at = (x, y, z) => new THREE.Vector3(TABLE.x + x, y, TABLE.z + z);
    const pop = (when) => (t >= when ? Math.exp(-(t - when) * 7) : 0), head = this.banker.face.clone(), hack = Math.max(0, Math.sin(t * 9)) ** 3;
    let s;
    if (t < 0.95) s = { pos: at(-0.5, 1.15, -0.15), look: head, fov: 44 - 16 * smooth(t / 0.2), lines: 1, shake: 0.012 * hack };                      // snap zoom, from the baize
    else if (t < 2.3) s = { pos: this.dealer.position.clone().add(new THREE.Vector3(2.3, 1.95, 1.55)), look: head, fov: 34, lines: 0.5 + 0.5 * hack, shake: 0.014 * hack, title: 'Koff! Koff!' };      // from the side: one fist at his mouth, the other hand flapping
    else s = { pos: at(0.4, 2.7, 3.4 - 0.3 * smooth((t - 2.3) / 1)), look: at(0, 1.45, -0.6), fov: 50, title: 'Put that out.' };                    // and the table he has to work at
    return { shake: 0, lines: 0, title: '', ...s, flash: Math.max(pop(0), pop(0.95) * 0.7, pop(2.3) * 0.6) };
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
    else if (t < 2.3) { const face = this.faceOf(me(0, 1.64, 0)), big = 1 + ((this.kirky.faceBig || 1) - 1) * 0.72; s = { pos: face.clone().add(v2.set(-0.42 * big, -0.4, -0.98 * big)), look: face, fov: 33 - 7 * smooth((t - 1.3) / 1.0), lines: 0.35 }; }   // his face, watching it: up at it from the felt, where he is looking (and on it where it is: his head is not where a man's would be)
    else if (t < ROU_CALL) s = { pos: at(0.01, 3.1 - 1.1 * smooth((t - 2.3) / (ROU_CALL - 2.3)), 0.3), look: at(0, 1.15, 0), fov: 40, roll: (t - 2.3) * 0.25, shake: 0.004 };   // from above, turning, as the ball slows and drops
    else if (t < ROU_END) {                                                                                                                                              // right in on the pocket
      const b = this.rou.ball.getWorldPosition(new THREE.Vector3());
      s = { pos: b.clone().add(v2.set(0.05, 0.6 - 0.15 * smooth((t - ROU_CALL) / 1.2), 0.5)), look: b, fov: 32, title: this.rtitle };
    } else if (this.rlost) {                                                                                                                                             // (cleaned out) from the baize, looking up at him laughing
      const c = this.croupier.group.position;
      s = { pos: new THREE.Vector3(c.x + 0.8, 1.15, c.z + 2.1), look: this.croupier.face.clone().setY(this.croupier.face.y - 0.15), fov: 48 - 10 * smooth((t - ROU_END) / 0.25), lines: 1, shake: 0.01, title: 'The house wins' };
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
    // The croupier: stood like his twin; he reaches across and flicks the wheel to start a spin, turns to watch the
    // ball, and laughs when you lose.
    {
      const c = this.croupier, t = this.rtime;
      this.croupierLaugh = Math.max(0, this.croupierLaugh - dt);
      const ha = Math.min(1, this.croupierLaugh * 2) * Math.min(1, (2.4 - this.croupierLaugh) * 5), shake = Math.sin(this.time * 24) * ha;
      const back = t >= 0 ? 1 - smooth((t - 0.7) / 0.5) : 0, reach = t >= 0 ? smooth(t / 0.3) * back : 0, flick = t >= 0 ? smooth((t - 0.38) / 0.12) * back : 0;
      const watching = t >= 0 && t < ROU_CALL ? smooth(t / 0.3) : 0;
      c.group.rotation.set(-0.1 * ha + shake * 0.02 + 0.14 * reach, Math.sin(this.time * 0.6 + 2) * 0.04 - 0.3 * reach, 0);
      c.group.position.y = Math.abs(shake) * 0.05;
      c.him.pose('cards', 0.3 + 0.22 * Math.sin(this.time * 0.8 + 1), null, 0, 0, false, (P) => {
        if (ha > 0) laughing(P, ha, this.time);
        if (watching > 0) { turned.setFromAxisAngle(UP, -0.75 * watching * (1 - ha)); P.hips.premultiply(turned); P.chest.premultiply(turned); }   // (the wheel is on his right)
        if (reach > 0) {   // (his right arm: out over the wheel, and across it)
          P.upperR.lerp(v.set(-0.62, -0.3, 0.72).normalize(), reach).normalize();
          P.foreR.lerp(v.set(-0.85 + 1.1 * flick, -0.22, 0.5).normalize(), reach).normalize();
        }
      });
      c.him.eyesAt(c.face);
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

  // His glass, wherever he has it. sip 0: stood on its spot (`rest`). sip 1: at his mouth, its rim on his lip, and
  // tipped into it by `tip` (radians) about that: it is its rim that stays where it is as it tips, not its foot (which
  // swung the whole glass down into his chin, out of sight). Leaves where his hand is to be, to have hold of it, in
  // this.gripAt (see pose(): it goes out to the glass before it is lifted, and comes away after it is put down).
  lift(g, rest, sip, tip) {
    const k = this.kirky, ax = Math.sin(this.yaw), az = Math.cos(this.yaw);
    const lean = tip * smooth((sip - 0.45) / 0.55), c = Math.cos(lean), s = Math.sin(lean);
    k.root.updateMatrixWorld(true);
    if (k.mouthWorld) k.mouthWorld(v2); else k.cig.getWorldPosition(v2);   // (his mouth)
    const along = -g.rim * c - g.lip * s, up = -g.rim * s + g.lip * c;   // (from its foot to the nearest of its rim to him, tipped that far)
    g.position.set(lerp(rest.x, v2.x + ax * (0.012 - along), sip), lerp(rest.y, v2.y - 0.016 - up, sip) + 0.05 * Math.sin(Math.PI * sip), lerp(rest.z, v2.z + az * (0.012 - along), sip));
    g.rotation.set(0, this.yaw - Math.PI / 2, lean);
    // His hand: on the side of it nearest him while it stands, and round to his left of it (the hand it is in) and
    // under it as it comes up, clear of his face.
    const [high, wide] = g.grip, lx = az, lz = -ax, round = 0.35 + 0.65 * sip;
    const sx = -ax * (1 - sip) + lx * round, sy = -0.35 * sip, sz = -az * (1 - sip) + lz * round, far = Math.hypot(sx, sy, sz), out = wide + 0.012;
    (this.gripAt ||= new THREE.Vector3()).set(g.position.x - ax * high * s + (sx / far) * out, g.position.y + high * c + (sy / far) * out, g.position.z - az * high * s + (sz / far) * out);
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

  // The free seat in the lounge you're close enough to take (-1 if none). taken[i]: someone is in seat i.
  nearLounge(taken = []) {
    let best = -1, bestDist = 1.25;
    this.lounges.seats.forEach((s, i) => {
      const d = Math.hypot(this.pos.x - (s.stand.x + Math.sin(s.yaw) * 0.75), this.pos.z - (s.stand.z + Math.cos(s.yaw) * 0.75));
      if (!taken[i] && d < bestDist && this.y < 0.2) { best = i; bestDist = d; }
    });
    return best;
  }
  sitLounge(index) {
    const s = this.lounges.seats[index];
    this.orbit = this.tilt = 0;
    this.lounge = index;
    this.pos.copy(s.stand);
    this.yaw = s.yaw;
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
    if (this.lounge >= 0) {
      if (this.smokeLeft > 0 || this.tableSip > 0) return;   // not with it half way to his mouth
      this.orbit = this.tilt = 0;
      this.pos.x += Math.sin(this.yaw) * 0.8;
      this.pos.z += Math.cos(this.yaw) * 0.8;
      this.lounge = -1;
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
    const sat = (who.sitBlend = lerp(who.sitBlend, who.seat >= 0 || who.bar >= 0 || who.lounge >= 0 ? 1 : 0, 1 - Math.exp(-7 * dt)));
    if (who.seat >= 0 || who.bar >= 0) who.perch = STOOL_Y; else if (who.lounge >= 0) who.perch = FIT.SEAT;   // (how high what he is sat on is: a stool, or a sofa)
    const moving = Math.min(1, Math.abs(who.speed) / C.walkSpeed);
    who.walk += who.speed * dt * 2.3;
    const swing = Math.sin(who.walk) * 0.6 * moving;
    k.root.position.set(who.pos.x, lerp(Math.abs(Math.sin(who.walk)) * 0.04 * moving + (who.y || 0), (who.perch ?? STOOL_Y) - 0.83, sat), who.pos.z);
    k.root.rotation.set(0, who.yaw, 0);
    k.root.visible = true;
    // (on his feet: motion capture. Standing, walking, or running if he is in a hurry. Sat down, he is posed by hand.)
    // His arms too, unless one of them is busy (a glass, a drag, a lever, a win).
    const busy = Math.max(who.sip || 0, who.drag || 0, who.reach || 0, who.cheer || 0, who.hic || 0, who.heave || 0, who.hold || 0) > 0.01 || who.glass > 0;
    // A few drinks in (you, not the others: nobody is told how many you have had): he stands, walks, backs up and
    // turns as a drunk does. A big win on a machine: he cheers. Sat down, at the table or the bar: sat as a man sits
    // (his hips stay on the stool, where he has been put), and cheering sat down. An arm that is busy is still posed
    // by hand under all of these: see `busy`.
    const cheering = (who.cheer || 0) > 0.3 || who.glad > 0, drunk = who === this && this.drunk > 0.15, up = who.jumping;
    const swung = Math.atan2(Math.sin(who.yaw - (who.yawWas ?? who.yaw)), Math.cos(who.yaw - (who.yawWas ?? who.yaw)));
    who.turned = lerp(who.turned || 0, Math.abs(swung) / Math.max(dt, 1e-3), 1 - Math.exp(-6 * dt));
    who.yawWas = who.yaw;
    k.sitting = sat > 0.5;
    if (sat < 0.3) {
      const pace = Math.abs(who.speed) / C.walkSpeed;
      const clip = cheering ? 'cheer'
        : drunk ? (moving > 0.12 ? (who.speed < 0 ? 'drunkback' : 'drunkwalk') : who.turned > 0.7 ? 'drunkturn' : 'drunkidle')
        : pace > 1.65 ? 'sprint' : pace > 1.25 ? 'run' : moving > 0.12 ? 'walk' : Math.floor(this.time / 11 + who.pos.x) % 2 ? 'idle2' : 'idle';
      // (a jump: from where he stands, his whole clip of one, wind-up and landing and all; on the run, his knees up
      // under him for as long as he is off the floor)
      if (up && !up.run) k.play?.('jump', 1, 1, !up.off ? up.t * JUMP.rate : up.down > 0 ? (JUMP.on + (JUMP.end - JUMP.on) * Math.min(1, up.down / JUMP.land)) / 30 : (JUMP.off + (JUMP.on - JUMP.off) * Math.min(1, Math.max(0, (JUMP.up - (who.vy || 0)) / (2 * JUMP.up)))) / 30, true);
      else if (up) k.play?.('leap', 1, 1, Math.min(0.24, up.t * 0.6), true);
      else k.play?.(clip, 1 - sat * 3, pace > 1.25 ? 0.75 + 0.2 * pace : moving > 0.12 && !cheering ? 0.6 + 0.6 * moving : 1, undefined, !busy || cheering);
    } else {
      // (settling onto it first: the end of a man sitting down, for the second it takes him)
      who.satFor = (who.satFor || 0) + dt;
      const settling = !cheering && who.satFor < 0.95;
      if (who.rising > 0) k.play?.('cheerup', 1, 1, JACK_TIME - who.rising, true);   // (a blackjack: up off his stool, his arms in the air, and down onto it again)
      else k.play?.(cheering ? 'cheersit' : settling ? 'sitdown' : 'sit', Math.min(1, (sat - 0.3) * 3), 1, settling ? 1.3 + who.satFor : undefined, !busy || cheering, { seated: true, upright: cheering ? 0.3 : settling ? 0.55 : 0.85 });
    }
    if (sat < 0.05) who.satFor = 0;   // (upright: the clip has his chin on his chest: his back and his head are mostly as he holds them himself, looking at the table)
    k.frontLeg.rotation.x = lerp(swing, -1.5, sat);
    k.backLeg.rotation.x = lerp(-swing, -1.5, sat);
    k.frontLeg.knee.rotation.x = lerp(Math.max(0, -swing) * 1.3, 1.4, sat);   // on foot, the trailing knee bends
    k.backLeg.knee.rotation.x = lerp(Math.max(0, swing) * 1.3, 1.25, sat);
    k.backLeg.rotation.z = 0;
    const sip = who.sip || 0;   // raising a glass: the arm comes up and he leans back into it
    const hold = who.gripAt ? who.hold || 0 : 0;   // (his hand on his glass: before it leaves the bar, and until it is back on it)
    const hand = Math.max(sip, who.drag || 0, hold);   // (the same arm comes up for a drag on a cigarette, without the lean)
    const reach = who.reach || 0, cheer = who.cheer || 0;   // pulling a slot machine's lever; both arms up for a big win
    const hic = who.hic || 0;   // a hiccup: his chest jumps
    k.root.rotation.z = who.lean || 0;
    k.root.position.y += 0.05 * hic;
    k.torso.rotation.x = lerp(0.06 + 0.05 * moving, 0.22, sat) + Math.sin(this.time * 1.4 + who.pos.x) * 0.012 - 0.34 * sip + 0.42 * hold * (1 - sip) - 0.3 * hic + 0.5 * (who.heave || 0);   // (heave: bent over the bar)
    // Arms: swinging against the legs on foot, forearms on the table sat down, straight up for a win, out to a lever.
    k.gunArm.rotation.set(lerp(lerp(1.42 - swing * 0.5, 0.95, sat), -1.25, cheer) - 1.15 * reach * (1 - cheer), lerp(0.06, -0.15, sat), 0);
    k.foreArm.rotation.set(-lerp(lerp(0.25 + Math.max(0, -swing) * 0.7, 1.05, sat), 0.15, Math.max(cheer, reach)), 0, 0);   // (all of it, every frame: whatever kept his arm out of his belly last frame had turned it, and it was never turned back: his hand shook)
    k.leftArm.rotation.set(lerp(lerp(swing * 0.5, -0.6, sat), -2.7, cheer), 0, lerp(-0.08, 0.2, sat) * (1 - cheer));
    k.leftFore.rotation.x = -lerp(lerp(0.25 + Math.max(0, swing) * 0.7, 1.05, sat), 0.15, cheer);
    // A glass, or what he is smoking: the hand comes up to his mouth, bending at the elbow to get there.
    if (hand > 0.001) {
      k.root.updateMatrixWorld(true);
      if (k.toMouth) k.toMouth(smooth(hand), hold > (who.drag || 0) ? who.gripAt : sip > (who.drag || 0)); else k.handTo(k.torso.localToWorld(this.lips.set(0.07, 0.68, 0.23)), smooth(hand));   // (a glass: to his lips, held under them)
    }
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
        try { model.applyLook({ hoodie: '#7a2f2b', beanie: 'none', deck: 'wood', wheels: '#e9e4d4', smoke: 'cigarette', ...p.look, goldGuns: new Set() }); } catch {}
        const tag = FIT.sign([p.name], 0.95, 0.22, { size: 0.62, color: '#f3efe4', board: 'rgba(12, 12, 14, 0.7)' });
        tag.material.transparent = true;
        this.scene.add(tag);
        o = { model, tag, pos: new THREE.Vector3(p.x, 0, p.z), yaw: p.yaw, speed: 0, walk: 0, sitBlend: 0, seat: -1, bar: -1, slot: -1, pulled: 9, reach: 0, cheer: 0, sip: 0, spinning: false };
        this.guests.set(p.id, o);
      }
      o.seat = p.seat;
      o.bar = p.seat < 0 && p.bar >= 0 && p.bar < this.barStools.length ? p.bar : -1;
      o.lounge = p.seat < 0 && o.bar < 0 && p.lounge >= 0 && p.lounge < this.lounges.seats.length ? p.lounge : -1;
      o.y = lerp(o.y || 0, o.lounge >= 0 || o.bar >= 0 || p.seat >= 0 ? 0 : Math.max(0, Math.min(3, Number(p.y) || 0)), 1 - Math.exp(-14 * dt));   // (up on a table, or in the air)
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
      const spot = p.seat >= 0 ? this.seats[p.seat].stand : o.bar >= 0 ? this.barStools[o.bar].stand : o.lounge >= 0 ? this.lounges.seats[o.lounge].stand : o.slot >= 0 ? this.machines[o.slot].stand : v.set(p.x, 0, p.z);
      const before = v2.copy(o.pos);
      o.pos.lerp(spot, 1 - Math.exp(-10 * dt));
      o.speed = before.distanceTo(o.pos) / Math.max(dt, 1e-3);
      const face = p.seat >= 0 ? Math.atan2(TABLE.x - spot.x, TABLE.z - spot.z) : o.bar >= 0 ? Math.PI / 2 : o.lounge >= 0 ? this.lounges.seats[o.lounge].yaw : o.slot >= 0 ? -Math.PI / 2 : p.yaw;
      o.yaw += Math.atan2(Math.sin(face - o.yaw), Math.cos(face - o.yaw)) * (1 - Math.exp(-10 * dt));
      // Having a smoke at the table: 1 = drawing on it, 2 = blowing it out.
      const smoking = (p.seat >= 0 || o.bar >= 0 || o.lounge >= 0) && (p.smoke === 1 || p.smoke === 2) ? p.smoke : 0;
      if (smoking === 2 && o.smokeWas !== 2 && p.seat >= 0) this.haze++;   // (their cloud joins the rest over the table)
      o.smokeWas = smoking;
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

    if (this.seat < 0 && this.bar < 0 && this.lounge < 0 && this.slot < 0 && !this.roulette) {
      this.yaw += inp.steer * C.turnRate * dt + Math.sin(this.time * 1.7) * 0.3 * this.drunk * Math.min(1, Math.abs(this.speed)) * dt;   // (a few drinks in, he weaves)
      // (Shift: flat out, if he is sober enough for it. Space: a jump, from where he stands or on the run.)
      const up = this.jumping, rooted = up && !up.run && !up.off ? 0 : up && up.down > 0 ? 0.3 : 1;   // (crouched to jump, he stays put; and for a moment where he lands)
      const want = ((inp.push ? 1 : 0) * (inp.drift && this.drunk < 0.15 ? C.sprintSpeed : C.walkSpeed) - (inp.brake ? 1 : 0) * C.walkSpeed * 0.55) * rooted;
      this.speed = lerp(this.speed, want, 1 - Math.exp(-(this.y > 0 && this.vy !== 0 ? 2.5 : Math.abs(want) > C.walkSpeed ? 5 : 10) * dt));
      if (up) {
        up.t += dt;
        if (!up.off && (up.run || up.t >= JUMP.wind)) { up.off = true; this.vy = JUMP.up; }
        else if (up.off && this.vy === 0 && (up.down = (up.down || 0) + dt) >= (up.run ? 0.05 : JUMP.land)) this.jumping = null;
      } else if (inp.jumpHeld && !this.jumpWas && !this.cine.on && this.vy === 0) this.jumping = { t: 0, run: Math.abs(this.speed) > 1.5, off: false, down: 0 };
      this.jumpWas = inp.jumpHeld;
      this.pos.x += Math.sin(this.yaw) * this.speed * dt;
      this.pos.z += Math.cos(this.yaw) * this.speed * dt;
      // Stay inside the room, and out of what stands in it: unless he is high enough to be over it, or on it.
      this.pos.x = Math.max(-W / 2 + 2, Math.min(W / 2 - 1.2, this.pos.x));
      this.pos.z = Math.max(-D / 2 + 1.2, Math.min(D / 2 - 0.9, this.pos.z));
      for (const b of this.blockers) {
        if (this.y >= b.below) continue;
        if (b.r) {
          const dx = this.pos.x - b.x, dz = this.pos.z - b.z, d = Math.hypot(dx, dz);
          if (d < b.r && d > 1e-3) { this.pos.x = b.x + (dx / d) * b.r; this.pos.z = b.z + (dz / d) * b.r; }
        } else if (this.pos.x > b.x0 && this.pos.x < b.x1 && this.pos.z > b.z0 && this.pos.z < b.z1) {
          const out = [this.pos.x - b.x0, b.x1 - this.pos.x, this.pos.z - b.z0, b.z1 - this.pos.z], least = out.indexOf(Math.min(...out));
          if (least === 0) this.pos.x = b.x0; else if (least === 1) this.pos.x = b.x1; else if (least === 2) this.pos.z = b.z0; else this.pos.z = b.z1;
        }
      }
      // What is under his feet (the highest thing he is over, and not below the top of), and whether he is on it.
      let ground = 0;
      for (const s of this.tops) {
        const over = s.r ? Math.hypot(this.pos.x - s.x, this.pos.z - s.z) < s.r && this.pos.z > s.z0 : this.pos.x > s.x0 && this.pos.x < s.x1 && this.pos.z > s.z0 && this.pos.z < s.z1;
        if (over && this.y >= s.top - 0.05 && s.top > ground) ground = s.top;
      }
      if (this.y > ground || this.vy > 0) {
        this.vy -= JUMP.down * dt;
        this.y += this.vy * dt;
        if (this.y <= ground && this.vy <= 0) { this.y = ground; this.vy = 0; }
      } else { this.y = ground; this.vy = 0; }
    } else { this.jumping = null; this.y = this.vy = 0; }
    this.rising = Math.max(0, this.rising - dt);
    this.glad = Math.max(0, this.glad - dt);

    if (this.smokeLeft > 0) {
      const t = SMOKE_TIME - (this.smokeLeft -= dt);
      this.drag = smooth(t / 0.5) * (1 - smooth((t - 1.9) / 0.3));
      k.inhale = smooth((t - 0.7) / 0.4) * (1 - smooth((t - 1.85) / 0.1));
      k.light?.(smooth(t / 0.3) * (1 - smooth((t - 0.85) / 0.25)), smooth((t - 0.3) / 0.08) * (1 - smooth((t - 0.72) / 0.1)), t > 0.24 && t < 0.36 ? 1 : 0);   // (his lighter to it first)
      const was = this.puffing;
      this.puffing = t > 2.15 && t < 3.6 ? 2 : t < 2.15 ? 1 : 0;
      if (this.puffing === 2 && was !== 2 && this.seat >= 0) this.haze++;
      if (this.puffing === 2) k.exhale(dt);
      if (this.smokeLeft <= 0 || (this.seat < 0 && this.bar < 0 && this.lounge < 0)) {
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
    this.hold = 0;
    if (this.drinking > 0 && this.glass) {
      const t = DRINK_TIME - (this.drinking -= dt), g = this.glass;
      this.hold = smooth(t / 0.4) * (1 - smooth((t - 3.12) / 0.2));   // (and up off it as soon as it is down: he comes up out of it for the camera)
      k.pluck?.(smooth(t / 0.55) * (1 - smooth((t - 3.1) / 0.45)));   // (what he is smoking: out of his mouth for it, in his other hand)
      this.sip = smooth((t - 0.45) / 0.6) * (1 - smooth((t - 2.75) / 0.35));
      g.level = 1 - smooth((t - 1.35) / 1.3);
      g.liquid.scale.y = Math.max(0.001, g.level);
      if (t > 1.35 && t < 2.6 && this.time - (this.gulped || 0) > 0.4) { this.gulped = this.time; this.gulpAt = t; playGulp(); }
      if (t >= 3.1 && !this.slammed) { this.slammed = true; this.slamAt = this.time; g.garnish.visible = false; playGlassDown(); k.express?.('smile', 1.1); }
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
    // At the blackjack table: a whisky by his cards, and a mouthful of it every so often (not with a smoke on the go).
    // It is by his left hand, the one that lifts it; raised, it goes where that hand goes.
    if (!this.tableGlass) {
      this.tableGlass = this.barShop.makeGlass(DRINKS[0]);
      this.tableGlass.level = TABLE_FULL;
      this.tableGlass.garnish.visible = true;
      this.tableGlass.visible = false;
      this.scene.add(this.tableGlass);
    }
    // (see tableDrink(): his hand goes out to it, it comes up, down it goes in three swallows, and back on the felt)
    const tg = this.tableGlass;
    if ((this.seat >= 0 || this.lounge >= 0) && this.tableSip > 0) {
      const t = TABLE_SIP - (this.tableSip -= dt);
      this.hold = smooth(t / 0.35) * (1 - smooth((t - 2.92) / 0.2));
      k.pluck?.(smooth(t / 0.5) * (1 - smooth((t - 2.9) / 0.4)));
      this.sip = smooth((t - 0.4) / 0.55) * (1 - smooth((t - 2.5) / 0.35));
      tg.level = TABLE_FULL * (1 - smooth((t - 1.25) / 1.15));
      if (t > 1.25 && t < 2.4 && this.time - (this.gulped || 0) > 0.4) { this.gulped = this.time; this.gulpAt = t; playGulp(); }
      if (t >= 2.88 && !this.slammed) { this.slammed = true; this.slamAt = this.time; tg.garnish.visible = false; playGlassDown(); k.express?.('smile', 1.1); }
      if (this.tableSip <= 0) {
        this.tableSip = this.sip = 0;
        this.slammed = false;
        this.refill = REFILL;
        // (it tells on him as a drink at the bar does, short of his being ill: there is no bucket at this table)
        this.tipsy = Math.max(this.tipsy, Math.min(SICK_AFTER - 1.3, this.tipsy + 1));
        if (this.tipsy > TIPSY_AFTER - 0.8) this.isTipsy = true;
      }
    } else {
      if (this.tableSip > 0) { this.tableSip = this.sip = 0; this.slammed = false; }
      if (this.refill > 0 && (this.refill -= dt) <= 0) { tg.level = TABLE_FULL; tg.garnish.visible = true; }   // (topped up, while nobody was looking)
    }
    tg.liquid.scale.y = Math.max(0.001, tg.level);
    this.tableGlass.visible = (this.seat >= 0 && this.tableBlend > 0.5) || (this.lounge >= 0 && this.sitBlend > 0.5);
    if (this.tableGlass.visible) {
      const g = this.tableGlass;
      v.copy(this.tableAt()(this.lounge >= 0 ? 0.72 : 0.6, 0.3, this.tableTop + 0.005));   // (on the top in front of him, to his left)
      this.lift(g, v, this.sip, 0.95 + 0.5 * (1 - g.level / TABLE_FULL));   // (tipped back into his mouth: further as it empties)
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
      this.lift(g, v.set(rest.x + 0.78, 1.25, rest.z + SERVED), this.sip, 0.95 + 0.5 * (1 - g.level));   // (tipped back into his mouth: further as it empties)
    }

    if (this.gloat > 0) {
      const before = GLOAT_TIME - this.gloat;
      this.gloat -= dt;
      if (before < 0.95 && GLOAT_TIME - this.gloat >= 0.95) { this.laugh(); playLaugh(); }   // (the laugh starts as the camera finds his face)
    }
    // The dealer: stood at his table, the deck in his hands; dealing, when there are cards to go out (each leaves his
    // hand as it flicks); thrown back and shaking when he laughs; and, when the smoke gets to him, bent over a fist,
    // batting the air clear with his other hand (which does clear it).
    this.laughing = Math.max(0, this.laughing - dt);
    const ha = Math.min(1, this.laughing * 2) * Math.min(1, (2.4 - this.laughing) * 5), shake = Math.sin(this.time * 24) * ha;
    const B = this.banker, d = this.dealer, CYCLE = (DEAL.to - DEAL.from) / 30;
    if (this.toDeal.length > 7) for (const card of this.toDeal.splice(0, this.toDeal.length - 7)) { card.visible = true; card.position.copy(card.userData.target); }   // (a table found half way through a hand: most of it is down already)
    const due = this.toDeal.length > 0;
    this.dealing = lerp(this.dealing, due ? 1 : 0, 1 - Math.exp(-(due ? 16 : 6) * dt));
    if (due || this.dealing > 0.04) this.dealClock += dt * DEAL.rate; else this.dealClock = this.dealtNow = 0;
    this.haze = Math.max(0, this.haze - dt / 50);
    if (this.haze >= HAZE_LIMIT && this.coughing <= 0 && this.smokeLeft <= 0 && !this.cine.on && ha <= 0) { this.coughing = COUGH_TIME; playCough(); }
    let fit = 0, hack = 0, flap = 0;
    if (this.coughing > 0) {
      const t = COUGH_TIME - (this.coughing -= dt);
      fit = smooth(t / 0.25) * smooth(this.coughing / 0.3);
      hack = t < 2.5 ? Math.max(0, Math.sin(t * 9)) ** 3 : 0;   // each cough
      flap = Math.sin(t * 14);
      this.haze = Math.max(0.3, this.haze - dt * 1.4);
    }
    d.rotation.set(-0.1 * ha + shake * 0.02, Math.sin(this.time * 0.7) * 0.04, 0);
    d.position.y = Math.abs(shake) * 0.05 + 0.03 * hack;
    const laugh = ha > 0;
    B.him.pose('cards', 0.3 + 0.22 * Math.sin(this.time * 0.9), 'cards', (DEAL.from - 1) / 30 + (this.dealClock % CYCLE), this.dealing * (1 - fit) * (1 - ha), false, (P) => {
      if (laugh) laughing(P, ha, this.time);
      if (fit <= 0) return;
      turned.setFromAxisAngle(RIGHT, (0.3 + 0.2 * hack) * fit);   // (bent over it)
      P.hips.multiply(turned); P.chest.multiply(turned);
      P.upperR.lerp(v.set(-0.2, -0.5, 0.84).normalize(), fit).normalize();             // his fist to his mouth
      P.foreR.lerp(v.set(0.42, 0.86, 0.28).normalize(), fit).normalize();
      P.upperL.lerp(v.set(0.5, -0.05, 0.86).normalize(), fit).normalize();             // his other hand, batting at it
      P.foreL.lerp(v.set(0.2 + 0.55 * flap, 0.72, 0.66).normalize(), fit).normalize();
    });
    B.him.eyesAt(B.face);
    // (a card goes as his hand flicks: once in each turn of the stretch he deals by)
    if (due && this.dealClock >= this.dealtNow * CYCLE + (DEAL.flick - DEAL.from) / 30) {
      const card = this.toDeal.shift();
      this.dealtNow++;
      card.visible = true;
      B.him.handAt(-1, card.position);
    }

    const thick = Math.min(1, this.haze / 4);
    for (const puff of this.hazeSprites) {
      const u = puff.userData, a = u.a + this.time * u.rate;
      puff.position.set(TABLE.x + Math.cos(a) * u.r * 1.5, u.y + Math.sin(this.time * 0.4 + u.a) * 0.12, TABLE.z + 0.3 + Math.sin(a) * u.r);
      puff.scale.setScalar(u.size);
      puff.material.opacity += (thick * 0.6 - puff.material.opacity) * (1 - Math.exp(-2.5 * dt));
      puff.visible = puff.material.opacity > 0.004;
    }

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
    this.chandeliers.forEach((c, i) => { c.rotation.y = Math.sin(this.time * 0.22 + i * 1.7) * 0.07; });   // (they stir a little, on their chains)

    // Camera: behind Kirky while he walks. When he sits it rises over his shoulder to look down the table.
    const sway = Math.sin(this.time * 0.9) * 0.07 * this.drunk;   // tipsy: the room moves
    const cam = this.camera, behind = this.roulette ? 2.6 : this.slot >= 0 ? 2.5 : this.bar >= 0 ? 4.8 - 2.8 * this.sitBlend : 4.8, round = this.yaw + this.orbit + sway;   // (closer at the bar: there are columns behind the stools)
    cam.position.set(this.pos.x - Math.sin(round) * behind * Math.cos(this.tilt * 0.6), (this.roulette ? 4.6 : this.slot >= 0 ? 2.25 : 2.8) + this.tilt * 4, this.pos.z - Math.cos(round) * behind * Math.cos(this.tilt * 0.6));
    cam.position.x = Math.max(-W / 2 + 0.5, Math.min(W / 2 - 0.5, cam.position.x));
    cam.position.z = Math.max(-D / 2 + 0.5, Math.min(D / 2 - 0.5, cam.position.z));
    v.set(this.pos.x + Math.sin(round) * 2, 1.5 + this.y * 0.8, this.pos.z + Math.cos(round) * 2);
    cam.position.y += this.y * 0.7;   // (up on a table, or in the air: it goes with him)
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
    const shot = this.barShop.shot() || this.smokeShot() || this.drinkShot() || this.tableDrinkShot() || this.jackShot() || this.sickShot() || this.woozyShot() || this.winShot() || this.rouletteShot() || this.dealerShot() || this.coughShot();
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
    for (const card of this.cards.values()) if (card.visible) card.position.lerp(card.userData.target, 1 - Math.exp(-11 * dt));
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
        mesh.visible = false;            // (in his deck, until his hand flicks it out: see update)
        mesh.userData = { target: new THREE.Vector3() };
        this.toDeal.push(mesh);
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
      if (this.toDeal.includes(mesh)) this.toDeal.splice(this.toDeal.indexOf(mesh), 1);
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
