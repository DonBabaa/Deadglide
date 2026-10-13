// What the House (level 4) looks like beyond its floor and the props you ride. It is the players' casino over again
// (casino/room.js), K times the size: the same walls and ceiling, the same fittings (casino/decor.js) in the same
// places, each of them K times as big. Nothing here can be touched (what can be, world/house.js has); arena.js shows
// it for level 4 and calls update() every frame.
import * as THREE from 'three';
import { HOUSE, WALL_TOP, houseHeight } from './house.js';
import * as FIT from '../casino/decor.js';
import { standIn, laughing } from '../enemies/standIn.js';

const ROOM = { w: 38, d: 30, h: 9 };   // the casino it is made from, in its own metres (see W, D, H in casino/room.js)
const CEILING = ROOM.h * HOUSE.k;

export function buildHouseScene() {
  const group = new THREE.Group(), H = HOUSE, K = H.k, SX = H.halfX, SZ = H.halfZ, PI = Math.PI;
  group.position.set(H.x, 0, H.z);
  const std = (color, roughness = 0.7, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
  const lit = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: false });
  const fitted = FIT.painted(), cloth = FIT.painted({ roughness: 0.92, metalness: 0, side: THREE.DoubleSide, emissive: 0x000000 });
  const gold = std(0xc9a44a, 0.35, { metalness: 0.5, emissive: 0x2a1c04 }), wood = std(0x3a2116, 0.5);
  // Stand one of the casino's fittings in it: made the size it is there, drawn `size` times that (K, unless said).
  const stand = (geo, x, y, z, turn = 0, material = fitted, size = K, parent = group) => { const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.rotation.y = turn; m.scale.setScalar(size); parent.add(m); return m; };
  const floorAt = (x, z) => houseHeight(H.x + x, H.z + z, true);

  // Walls: silk in gilt frames over a dado of dark marble, from the top of the curve to the ceiling, with their
  // mouldings; the windows are cut through them ([x, z, which way it faces], in the casino's own metres), and what
  // is seen through those is a long way off (see outside() in decor.js). And the coffered ceiling.
  const WINDOWS = [[-11, -1, 0], [11, -1, 0], [-1, -7.5, PI / 2], [-1, 0, PI / 2], [-1, 7.5, PI / 2], [1, 7.5, -PI / 2]], WIN = { w: 3.2, h: 6.2, sill: 0.95 };
  group.add(FIT.outside(210, 5));
  for (const [w, x, z, turn] of [[SX * 2, 0, -(SZ - 0.4), 0], [SX * 2, 0, SZ - 0.4, PI], [SZ * 2, -(SX - 0.4), 0, PI / 2], [SZ * 2, SX - 0.4, 0, -PI / 2]]) {
    const map = FIT.wallPanels();
    map.wrapS = THREE.RepeatWrapping;
    map.repeat.set(Math.round(w / K / 3.8), 1);
    const holes = WINDOWS.filter((o) => o[2] === turn).map(([wx, wz]) => (turn === 0 ? wx : turn > 0 ? -wz : wz));
    stand(FIT.wall(w / K, ROOM.h, holes, WIN, WALL_TOP / K), x, 0, z, turn, std(0xffffff, 0.82, { map }));
    stand(FIT.mouldings(w / K, ROOM.h, 2.2), x, 0, z, turn);
  }
  const lid = new THREE.Mesh(new THREE.PlaneGeometry(SX * 2, SZ * 2).rotateX(PI / 2), std(0xffffff, 0.9, { map: FIT.cofferPanel([Math.round(ROOM.w / 3.2), Math.round(ROOM.d / 3.2)]) }));
  lid.position.y = CEILING;
  group.add(lid);
  stand(FIT.coffers(ROOM.w, ROOM.d, 3.2), 0, CEILING, 0);

  // The carpets: one under his table, and a runner from the doors.
  const carpet = (w, d, x, z, map) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-PI / 2), std(0xffffff, 0.95, { map, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); m.position.set(x, 0.04, z); group.add(m); };
  carpet(9 * K, 9 * K, 0, -4.4 * K, FIT.rug());
  const runner = FIT.rug();
  runner.wrapT = THREE.RepeatWrapping;
  runner.repeat.set(1, 3);
  carpet(3.4 * K, 11 * K, 0, 9.4 * K, runner);

  // Columns down both sides (house.js stops you riding through them).
  const pillar = FIT.column(ROOM.h, 0.45);
  for (const [x, z] of H.columns) stand(pillar, x, CEILING / 2, z);

  // Chandeliers, each from a plaster rose: the great one over his table (the one real light, and the signal for what
  // Babitus is about to do), and three more that only glow.
  const bulb = lit(0xffe6b0), signal = lit(0xffe6b0);
  const hung = [[H.light.x / K, H.light.z / K, 1.25, signal], [-10, 5, 1, bulb], [10, 5, 1, bulb], [0, 10, 0.8, bulb]].map(([x, z, big, glow]) => {
    const size = 0.5 * big * K, c = FIT.chandelier(size, glow, 0.6 * K);
    c.position.set(x * K, CEILING - 0.6 * K - size * 2.9, z * K);
    group.add(c);
    stand(FIT.ceilingRose(1.5 * big), x * K, CEILING - 0.3 * K, z * K);
    return c;
  });
  const great = hung[0];
  const lamp = new THREE.PointLight(0xffe2b0, 2600, 170, 1.6);
  lamp.position.set(0, CEILING - 10, 0);
  group.add(lamp);

  // Arched windows on the harbour, each in a gilt frame under velvet curtains caught back with a cord, a lamp on a
  // bracket either side. The glass is clear.
  const flame = lit(0xffd9a0), clear = FIT.glass(), plaster = std(0xe7dcc4, 0.85, { side: THREE.DoubleSide });
  const frame = FIT.windowFrame(WIN.w, WIN.h), pane = FIT.windowPane(WIN.w, WIN.h), reveal = FIT.windowReveal(WIN), curtains = FIT.drapes(6.4, 7.0), light = FIT.sconce(0.42);
  for (const [wx, wz, turn] of WINDOWS) {
    const g = new THREE.Group();
    g.position.set(turn === 0 ? wx * K : wx * (SX - 0.4), 0, turn === 0 ? wz * (SZ - 0.4) : wz * K);
    g.rotation.y = turn;
    g.scale.setScalar(K);
    stand(reveal, 0, WIN.sill, 0, 0, plaster, 1, g);
    stand(pane, 0, WIN.sill, -0.22, 0, clear, 1, g);
    stand(frame, 0, WIN.sill, 0.03, 0, fitted, 1, g);
    stand(curtains, 0, 8.05, 0.06, 0, cloth, 1, g);
    for (const side of [-1, 1]) { stand(light.lamp, side * 3.65, 3.3, 0.02, 0, fitted, 1, g); stand(light.flames, side * 3.65, 3.3, 0.02, 0, flame, 1, g); }
    group.add(g);
  }

  // The signs: the rules and the house's boast on the far wall, the casino's name over the doors.
  const board = (lines, w, h, x, y, z, turn, o) => { const s = FIT.sign(lines, w, h, o); s.scale.setScalar(K); s.position.set(x, y, z); s.rotation.y = turn; group.add(s); };
  board(['BLACKJACK PAYS 3 TO 2', 'DEALER STANDS ON 17'], 5.6, 1.3, -5.2 * K, 5.2 * K, -(SZ - 0.6), 0, { size: 0.42 });
  board(['BABITUS GOYITUS', 'THE HOUSE ALWAYS WINS'], 5.6, 1.3, 5.2 * K, 5.2 * K, -(SZ - 0.6), 0, { size: 0.42, color: '#ffd76a' });
  { const s = FIT.sign(['CASINO DE DEADSLIDE', 'MONTE-CARLO'], 9, 2.2, { size: 0.5 }); s.scale.setScalar(K * 0.5); s.position.set(0, CEILING - 3.4, SZ - 0.6); s.rotation.y = PI; group.add(s); }   // (smaller than it is there, and higher: these doors stand on the top of the curve, and their arch comes up to it)

  // The man himself in gilt, twice, on dark marble either side of his table; and palms in gilt urns in the corners.
  const block = FIT.plinth(1.1, 1.3);
  for (const [x, z] of H.statues) {
    const y = floorAt(x, z);
    stand(block, x, y, z);
    const idol = standIn('boss3');
    for (const part of idol.parts) part.mesh.material = gold;
    idol.group.scale.setScalar(0.9 * K);
    idol.group.position.set(x, y + 1.3 * K, z);
    idol.group.rotation.y = x < 0 ? 0.3 : -0.3;
    group.add(idol.group);
    idol.pose('cards', 0.3, null, 0, 0, false, (P) => laughing(P, 1, 0.065));   // (as he is when the house wins)
  }
  const tree = FIT.palm(1.05);
  for (const [x, z] of [[-16.5, -12.8], [16.5, -12.8], [-16.5, 12.8], [16.5, 12.8]]) stand(tree, x * K, floorAt(x * K, z * K), z * K, x * z);
  // A gilt post where each of the velvet ropes from the doors is hung (the ropes themselves are rails: house.js).
  const post = FIT.ropePost();
  for (const x of [-2.3 * K, 2.3 * K]) for (const z of [12.4 * K, 9.6 * K, 6.8 * K]) stand(post, x, 0, z, 0, fitted, 0.56);

  // His blackjack table (house.js has the slab of it): the baize as it is printed, and the padded rim round it.
  {
    const T = H.table, mid = T.z - T.deep / 2 + T.back;
    stand(FIT.baizeTop(2.4, 0.6), T.x, T.high + 0.035, mid, 0, std(0xffffff, 0.95, { map: FIT.baize(2.4, 0.6, [-64, -32, 0, 32, 64]), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    stand(new THREE.TorusGeometry(2.4, 0.11, 10, 56, PI).rotateX(PI / 2), T.x, T.high - 0.1, mid, 0, std(0x3a1a12, 0.35));
    stand(new THREE.TorusGeometry(2.5, 0.025, 6, 56, PI).rotateX(PI / 2), T.x, T.high - 0.3, mid, 0, gold);
    stand(new THREE.BoxGeometry(4.9, 0.05, 0.14), T.x, T.high + 0.02, T.z - T.deep / 2 + 0.25, 0, gold);
    // (and a buttoned velvet cushion on each of the stools in front of it, with a gilt band round it)
    const cushion = FIT.stool(0.2, 0.3);
    for (const deg of [-64, -32, 0, 32, 64]) { const a = (deg * PI) / 180; stand(cushion, T.x + Math.sin(a) * 12.4, 0.74, mid + Math.cos(a) * 12.4, 0, fitted, 3.4); }
  }

  // The slot machines down the left-hand wall, stood on the curve, screens flickering.
  const cabinet = std(0x5a0f1a, 0.45), screens = [], works = FIT.slotTrim(1), [cw, ch, cd] = FIT.SLOT.size, SL = 0.5 * K;
  for (const [sx, sz] of H.slots) {
    const g = new THREE.Group();
    g.position.set(sx, floorAt(sx, sz) + (ch / 2 + 0.3) * SL, sz);
    g.rotation.y = PI / 2;
    g.scale.setScalar(SL);
    g.add(new THREE.Mesh(new THREE.BoxGeometry(cw, ch, cd), cabinet), new THREE.Mesh(works, fitted));
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(...FIT.SLOT.screen), lit(0xffc233));
    screen.position.set(FIT.SLOT.screenAt[0], FIT.SLOT.screenAt[1], FIT.SLOT.screenAt[2] + 0.004);
    screen.userData.beat = Math.random() * 6;
    screens.push(screen);
    g.add(screen);
    group.add(g);
  }

  // The doors you came in by (the way out, once he is dead). Kirky came through them without knocking: they hang
  // open, one off its top hinge, and the night is outside.
  const DS = 0.32 * K, [lw, lh, ld] = FIT.DOOR.leaf.map((n) => n * DS);
  const night = new THREE.Mesh(new THREE.PlaneGeometry(FIT.DOOR.gap * DS, lh), new THREE.MeshBasicMaterial({ color: 0x0b1424, toneMapped: false }));
  night.position.set(H.doors.x, WALL_TOP + lh / 2, SZ - 0.45);
  night.rotation.y = PI;
  group.add(night);
  let wayOut = false;   // (lit up, once it is the way out)
  stand(FIT.doorway(DS), H.doors.x, WALL_TOP, SZ - 0.4, 0, fitted, 1);
  const leafTrim = FIT.doorTrim(DS);
  for (const side of [-1, 1]) {
    const a = side < 0 ? 1.3 : 1.05, leaf = new THREE.Mesh(new THREE.BoxGeometry(lw, lh, ld), wood);
    leaf.position.set(H.doors.x + side * (lw + 0.1 - (lw / 2) * Math.cos(a)), WALL_TOP + lh / 2, SZ - 0.7 - (lw / 2) * Math.sin(a));
    leaf.rotation.set(0, side * a, side > 0 ? 0.1 : 0);
    leaf.add(new THREE.Mesh(leafTrim, fitted));
    group.add(leaf);
  }

  // The bar, down the right-hand wall (house.js has its counter): its panelled front with the brass rail for your
  // feet, lamps hung over it, and behind it shelves of bottles in front of a mirror in a gilt frame.
  const B = H.bar, BASE = 1.95 * K, back = FIT.backBar(11.6, 0.33);
  stand(FIT.barFront(B.long, 1.3), B.x + 4.02 * B.out, 0, B.z, 0, fitted, 1);
  { const board2 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3.5 * K, 11.9 * K), std(0x2e1a10, 0.6)); board2.position.set(SX - 0.6, BASE + 1.6 * K, B.z); group.add(board2); }
  { const mirror = new THREE.Mesh(new THREE.PlaneGeometry(back.mirror[0] * K, back.mirror[1] * K), std(0x9fb6c4, 0.08, { metalness: 0.6, emissive: 0x1a2228 })); mirror.position.set(SX - 0.85, BASE + back.mirror[2] * K, B.z); mirror.rotation.y = -PI / 2; group.add(mirror); }
  stand(back.geo, SX - 0.9, BASE, B.z);
  const N = 23, bottles = new THREE.InstancedMesh(FIT.bottle(0.25 * K), lit(0xffffff), N * 3), m = new THREE.Matrix4(), tint = new THREE.Color();
  for (let i = 0; i < N * 3; i++) {
    const k = i % 3, tall = 0.85 + (0.3 * ((i * 7) % 5)) / 4;
    m.makeScale(1, tall, 1).setPosition(SX - 0.9 - back.deep * K, BASE + (back.shelves[k] + 0.03 + 0.65 * 0.25 * tall) * K, B.z + (-5.2 + Math.floor(i / 3) * (10.4 / (N - 1)) + (k - 1) * 0.07) * K);
    bottles.setMatrixAt(i, m);
    bottles.setColorAt(i, tint.setHSL([0.08, 0.3, 0.55, 0.0, 0.12, 0.78][i % 6], 0.75, 0.42 + 0.12 * (i % 2)));
  }
  group.add(bottles);
  const pendant = FIT.pendant(1.5);
  for (const z of [-8.6, -5.5, -2.4, 0.7]) { stand(pendant.shade, B.x + 2 * B.out, 4.3 * K, z * K); stand(pendant.bulb, B.x + 2 * B.out, 4.3 * K, z * K, 0, bulb); }
  // The drink that is slid out for you: a tall glowing glass on the counter.
  const drink = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.26, 1.1, 10), lit(0x6fe3ff));
  drink.position.set(B.x + 2 * B.out, 2.4, B.z);
  group.add(drink);

  const colour = new THREE.Color(), want = new THREE.Color(0xffe6b0);
  group.userData = {
    drink,
    // The doorway: glowing (the way out, once he is dead) or just the night.
    exit(on) { wayOut = on; },
    // What the great chandelier is showing: 'red', 'black' (it dims), 'green', or null for its ordinary light.
    signal(name) { want.set(name === 'red' ? 0xff3a2a : name === 'green' ? 0x3dff7a : name === 'black' ? 0x6a5cff : 0xffe6b0); },
    update(dt, time) {
      colour.copy(signal.color).lerp(want, 1 - Math.exp(-9 * dt));
      signal.color.copy(colour);
      lamp.color.copy(colour);
      great.rotation.y += dt * 0.15;
      for (const s of screens) s.material.color.setHSL((time * 0.3 + s.userData.beat) % 1, 0.9, 0.5 + 0.2 * Math.sin(time * 9 + s.userData.beat));
      night.material.color.set(0x0b1424).lerp(colour.set(0x7dffb0), wayOut ? 0.45 + 0.3 * Math.sin(time * 4) : 0);
      drink.rotation.y += dt * 2;
      drink.position.y = 2.4 + Math.sin(time * 3) * 0.12;
    },
  };
  return group;
}
