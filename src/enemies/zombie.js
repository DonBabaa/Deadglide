// The zombie, in detail: a rotting corpse in what is left of a suit. This is the model you see close up (the horde
// draws the plain one, in enemyModels.js, for zombies further off: both have the same parts in the same order, hinged
// in the same places, so one can stand in for the other).
//
// It is sculpted, not assembled: the torso, the limbs and the fingers are skins drawn through runs of points, the head
// is a ball pushed into the shape of a skull, the cloth is crumpled and the whole of it is painted with grime, rot and
// blood (see sculpt.js for the tools). Faces +z, feet at y = 0, 1.8 m tall.
import * as THREE from 'three';
import { tube, lump, sculpt, dent, rough, dirty, sheet, fineHand, fineFoot, paint, part, slab, between, noise } from './sculpt.js';

const PI = Math.PI;

export function zombie() {
  const skin = 0x7b8a63, skinDark = 0x5f6d4c, rot = 0x4a553c, nail = 0x2b2a1e, jacket = 0x3f4238, jacketDark = 0x2a2c25, shirt = 0x8d8975, tie = 0x5a1f22, trousers = 0x2a2b30;
  const shoe = 0x1a1714, leather = 0x2b2018, blood = 0x6a1a14, bloodDark = 0x3a0e0b, gut = 0x8c3a34, bone = 0xd8d2bf, teeth = 0xcfc8ae, dark = 0x0c0b0a, hair = 0x1d1a16, eye = 0xdfe6a0, dull = 0x8a8f6a, metal = 0x8a8f96, mud = 0x3a3226;
  const flesh = { skin, joint: skinDark, nail };

  // ---- The trunk ----
  const SPINE = [[0, 1.0, 0.005], [0, 1.13, 0.035], [0, 1.27, 0.075], [0, 1.4, 0.115], [0, 1.47, 0.14]];
  const front = (y, k = 1) => { const u = (y - 1.0) / 0.47; return 0.005 + 0.135 * u + (0.152 + 0.03 * Math.sin(u * PI)) * 0.74 * k; };   // how far forward his front is, at a height
  const WOUND = [-0.075, 1.25, 0.19];
  const body = part([
    // Hips and belt.
    dirty(rough(tube([[0, 0.84, 0], [0, 0.93, 0], [0, 1.02, 0.01]], [0.13, 0.178, 0.166], trousers, { sides: 16, steps: 3, squash: 0.8 }), 0.004, 24), { mottle: 0.25 }),
    paint(new THREE.TorusGeometry(0.169, 0.022, 6, 22).rotateX(PI / 2).scale(1, 1, 0.8).translate(0, 1.03, 0.008), leather),
    slab(0.058, 0.048, 0.02, metal, [0, 1.03, 0.146]), slab(0.03, 0.022, 0.024, leather, [0, 1.03, 0.148]),
    ...[-0.11, 0.11].map((x) => slab(0.02, 0.06, 0.012, trousers, [x, 1.03, 0.128], [0, x > 0 ? 0.6 : -0.6, 0])),
    // The shirt: one skin from waist to collar, crumpled, with what has come out of the wound run down it.
    dirty(rough(tube(SPINE, [0.15, 0.156, 0.176, 0.166, 0.076], shirt, { sides: 18, steps: 5, squash: 0.74 }), 0.006, 22), {
      mottle: 0.3, freq: 14, stains: [[...WOUND, 0.16, bloodDark], [-0.06, 1.12, 0.17, 0.11, blood], [-0.04, 1.03, 0.15, 0.07, blood, 0.6], [0.05, 1.38, 0.2, 0.06, mud, 0.5]],
    }),
    ...[1.1, 1.18, 1.34].map((y) => lump(0.011, bone, [0.004, y, front(y) + 0.002], [1, 1, 0.5], 6)),   // buttons (one is gone)
    // The tie: pulled loose, hanging off to one side.
    dirty(tube([[0.005, 1.445, 0.195], [0.028, 1.36, 0.232], [0.046, 1.22, 0.208], [0.06, 1.1, 0.172]], [0.016, 0.027, 0.036, 0.004], tie, { sides: 8, steps: 4, squash: 0.25 }), { mottle: 0.4 }),
    lump(0.022, tie, [0.004, 1.447, 0.196], [1, 0.8, 0.7], 8),
    // The jacket: a shell round his back and sides, open down the front, its hem in rags.
    dirty(rough(sculpt(tube([[0, 0.97, 0], [0, 1.13, 0.035], [0, 1.27, 0.075], [0, 1.4, 0.115], [0, 1.455, 0.132]], [0.2, 0.19, 0.202, 0.192, 0.115], jacket, { sides: 20, steps: 5, squash: 0.77, arc: [1.5 * PI + 0.55, 2 * PI - 1.1] }),
      (v) => { if (v.y < 1.03) v.y += Math.abs(noise(v.x * 14, 3, v.z * 14)) * 0.07 - 0.02; }), 0.005, 20), { mottle: 0.35, freq: 11, muck: [1.05, 0.5, mud] }),
    dirty(sheet([0, 1.38, 0.088], [0.186, 0.207], 1.5 * PI + 0.18, 0.42, 0.47, jacket, { squash: 0.8, ragged: 0.07 }), { mottle: 0.35 }),      // its right front, hanging...
    dirty(sheet([0, 1.38, 0.088], [0.186, 0.205], 1.5 * PI - 0.6, 0.4, 0.38, jacket, { squash: 0.8, ragged: 0.1 }), { mottle: 0.35, stains: [[...WOUND, 0.16, bloodDark]] }),   // ...and its left, torn shorter
    sheet([0, 1.425, 0.1], [0.19, 0.2], 1.5 * PI + 0.14, 0.2, 0.22, jacketDark, { squash: 0.82, ragged: 0, across: 4, down: 3 }),              // lapels
    sheet([0, 1.425, 0.1], [0.19, 0.2], 1.5 * PI - 0.34, 0.2, 0.2, jacketDark, { squash: 0.82, ragged: 0, across: 4, down: 3 }),
    slab(0.09, 0.028, 0.012, jacketDark, [0.135, 1.09, 0.176], [0.15, -0.5, 0]),                                                               // a pocket flap
    ...[2.2, 3.3, 4.0, 0.6].map((a, i) => sheet([0, 1.0, 0.0], [0.2, 0.2], a, 0.22, 0.1 + 0.05 * (i % 2), jacketDark, { squash: 0.8, ragged: 0.08, across: 4, down: 3 })),   // rags off the hem
    dirty(lump(0.13, jacket, [0, 1.385, -0.01], [1.3, 0.8, 0.85], 14), { mottle: 0.3 }),                                                       // the hunch of his back
    paint(new THREE.TorusGeometry(0.078, 0.02, 6, 16).rotateX(PI / 2 - 0.45).scale(1, 1, 0.9).translate(0, 1.465, 0.146), jacketDark),         // jacket collar
    paint(new THREE.TorusGeometry(0.066, 0.014, 5, 14).rotateX(PI / 2 - 0.45).translate(0.004, 1.478, 0.156), shirt),                          // shirt collar
    dirty(lump(0.092, jacket, [0.215, 1.42, 0.1], [1, 0.9, 1], 12), { mottle: 0.3 }),                                                          // right shoulder, padded
    dirty(lump(0.072, skin, [-0.215, 1.4, 0.1], [1, 1, 1], 12), { mottle: 0.4, freq: 25 }),                                                    // left shoulder, bare
    rough(tube([[-0.19, 1.425, 0.09], [-0.24, 1.37, 0.135]], [0.092, 0.084], jacketDark, { sides: 12, steps: 3, caps: false }), 0.01, 40),     // what is left of that sleeve
    // The wound: a hole in his left side, four ribs across it, and a length of gut coming out.
    lump(0.075, bloodDark, [WOUND[0], WOUND[1], WOUND[2] - 0.012], [1, 1.15, 0.45], 10),
    ...[1.19, 1.225, 1.262, 1.298].map((y) => { const z = front(y, 0.96); return tube([[-0.142, y + 0.006, z - 0.03], [-0.075, y - 0.006, z + 0.012], [-0.012, y + 0.004, z - 0.006]], [0.008, 0.011, 0.008], bone, { sides: 6, steps: 3 }); }),
    dirty(tube([[-0.095, 1.2, 0.2], [-0.04, 1.165, 0.228], [-0.078, 1.115, 0.222], [-0.03, 1.07, 0.205], [-0.062, 1.02, 0.19], [-0.05, 0.975, 0.185]], [0.022, 0.027, 0.025, 0.022, 0.016, 0.008], gut, { sides: 8, steps: 4 }), { mottle: 0.5, freq: 40 }),
    // Neck: craned forward, with the cords of it standing out and something torn at the side.
    dirty(tube([[0, 1.45, 0.14], [0.006, 1.51, 0.172], [0.012, 1.575, 0.207]], [0.058, 0.05, 0.05], skin, { sides: 12, steps: 4 }), { mottle: 0.4, freq: 30, stains: [[-0.04, 1.51, 0.19, 0.045, blood]] }),
    tube([[-0.03, 1.455, 0.165], [-0.02, 1.51, 0.2], [-0.012, 1.562, 0.228]], [0.012, 0.014, 0.011], blood, { sides: 6, steps: 3 }),
    tube([[0.035, 1.455, 0.165], [0.03, 1.51, 0.198], [0.028, 1.562, 0.226]], [0.01, 0.012, 0.01], skinDark, { sides: 6, steps: 3 }),
    lump(0.016, skinDark, [0.008, 1.5, 0.214], [1, 1.2, 0.8], 6),
  ]);

  // ---- The head (it lolls: its own part, hinged at the neck) ----
  const NECK = [0.01, 1.53, 0.18], LOLL = [0.05, 0, 0.09], H = [0.02, 1.64, 0.24];
  const onHead = (geo) => geo.translate(...H);
  const skull = sculpt(new THREE.SphereGeometry(0.125, 24, 18), (v) => {
    v.y *= 1.1; v.z *= 1.06;
    if (v.y < -0.015) { const t = Math.min(1, (-0.015 - v.y) / 0.11), k = t * t * (3 - 2 * t); v.x *= 1 - 0.42 * k; v.z = v.z * (1 - 0.22 * k) + 0.014 * k; }   // down to a jaw
    dent(v, [-0.047, 0.02, 0.118], 0.046, 0.036); dent(v, [0.047, 0.02, 0.118], 0.046, 0.036);       // eye sockets
    dent(v, [0, 0.06, 0.118], 0.085, -0.014);                                                        // the brow, out
    dent(v, [0.082, -0.012, 0.085], 0.05, 0.012, [1, 0, 0.4]);                                       // a cheekbone
    dent(v, [-0.11, 0.05, 0.03], 0.05, 0.008, [1, 0, 0]); dent(v, [0.11, 0.05, 0.03], 0.05, 0.008, [-1, 0, 0]);   // temples, in
    dent(v, [0, -0.025, 0.13], 0.03, 0.022);                                                         // where his nose was
    dent(v, [-0.072, -0.05, 0.09], 0.055, 0.028, [0.7, 0, -0.7]);                                    // the cheek that is gone
    dent(v, [0, -0.075, 0.1], 0.05, 0.03);                                                           // his mouth, open
  });
  const TEETH = [-3.5, -2.5, -1.5, 0.5, 1.5, 2.5, 3.5];   // (one is missing)
  const head = part([
    onHead(dirty(rough(paint(skull, skin), 0.0025, 45), { mottle: 0.4, freq: 26, under: 0.5, stains: [[-0.075, -0.05, 0.085, 0.06, blood], [0, -0.075, 0.09, 0.05, dark, 0.9], [-0.05, 0.11, 0.04, 0.06, bloodDark], [0.06, -0.09, 0.05, 0.05, rot, 0.7], [0, -0.025, 0.12, 0.028, dark, 0.9]] })),
    onHead(lump(0.03, dark, [-0.047, 0.02, 0.092], [1, 0.9, 0.6], 8)), onHead(lump(0.03, dark, [0.047, 0.02, 0.092], [1, 0.9, 0.6], 8)),      // the dark in his sockets
    onHead(lump(0.017, dull, [-0.047, 0.018, 0.1], [1, 1, 1], 8)),                                                                          // the eye that has gone milky
    onHead(tube([[0, 0.032, 0.122], [0, 0.006, 0.14], [0, -0.012, 0.134]], [0.011, 0.016, 0.008], skinDark, { sides: 7, steps: 3 })),      // the bridge of a nose
    // Hair: a cap of it, ragged at the edge, and clumps hanging off.
    onHead(dirty(paint(sculpt(new THREE.SphereGeometry(0.13, 18, 9, 0, PI * 2, 0, 1.15).scale(0.97, 1.1, 1.04).rotateX(-0.35).rotateZ(-0.12), (v) => { v.y += noise(v.x * 30, 1, v.z * 30) * 0.014; }), hair), { mottle: 0.4, freq: 40 })),
    ...Array.from({ length: 16 }, (_, i) => {
      const a = (i / 16) * PI * 2 + 0.3, out = 0.118, x = Math.cos(a) * out * 0.95, z = Math.sin(a) * out - 0.02, y = 0.07 + 0.03 * Math.sin(i * 2.1), long = 0.05 + 0.05 * Math.abs(Math.sin(i * 1.7));
      if (z > 0.06 && Math.abs(x) < 0.07) return null;   // (not over his face)
      return onHead(tube([[x * 0.9, y + 0.02, z * 0.9], [x * 1.05, y - long * 0.4, z * 1.05], [x * 1.02, y - long, z * 1.03]], [0.016, 0.013, 0.003], hair, { sides: 5, steps: 3 }));
    }).filter(Boolean),
    onHead(tube([[0.07, 0.11, 0.07], [0.098, 0.07, 0.085], [0.1, 0.02, 0.08]], [0.014, 0.011, 0.003], hair, { sides: 5, steps: 3 })),      // a lock over his temple
    onHead(lump(0.046, bone, [-0.052, 0.112, 0.04], [1, 0.3, 1], 8)),                                                                       // his skull, where the scalp has come away
    // Mouth: top teeth in an arc, the dark behind them, a jaw hanging askew with its own teeth, and a tongue.
    ...TEETH.map((t) => { const a = t * 0.21; return onHead(slab(0.0115, 0.02 + 0.004 * Math.cos(t), 0.01, teeth, [Math.sin(a) * 0.058, -0.06, 0.062 + Math.cos(a) * 0.058], [0, a, 0])); }),
    onHead(lump(0.05, dark, [0, -0.085, 0.072], [1.05, 0.75, 0.8], 8)),
    ...[-0.086, -0.1].map((x, i) => onHead(slab(0.012, 0.018, 0.014, teeth, [x + 0.012, -0.058, 0.07 - i * 0.02]))),                        // molars, through the cheek
    onHead(dirty(sculpt(lump(0.072, skinDark, [0.014, -0.128, 0.06], [0.98, 0.42, 1.08], 14), (v) => { if (v.y > -0.118) v.y = -0.118 - (v.y + 0.118) * 0.3; }), { mottle: 0.45, freq: 30 })),
    ...[-2.5, -1.5, -0.5, 0.5, 1.5, 2.5].map((t) => { const a = t * 0.24; return onHead(slab(0.011, 0.017, 0.009, teeth, [0.014 + Math.sin(a) * 0.052, -0.108, 0.06 + Math.cos(a) * 0.055], [0, a, 0])); }),
    onHead(tube([[0.004, -0.112, 0.055], [0.01, -0.106, 0.098], [0.02, -0.122, 0.128]], [0.02, 0.022, 0.012], gut, { sides: 7, steps: 3, squash: 0.5 })),
    // Ears: one whole, one mostly not.
    onHead(dirty(lump(0.033, skinDark, [0.127, 0.0, -0.004], [0.4, 1, 0.75], 10), { mottle: 0.4 })), onHead(lump(0.014, dark, [0.134, 0.0, 0.0], [0.4, 1, 0.8], 6)),
    onHead(lump(0.02, bloodDark, [-0.124, 0.004, -0.004], [0.5, 0.8, 0.8], 8)),
  ], NECK, LOLL, PI / 2);
  const eyes = { ...part([onHead(lump(0.021, eye, [0.047, 0.02, 0.1], [1, 1, 1], 8))], NECK, LOLL, PI / 2), glow: true };   // the one eye still shining

  // ---- Right arm: in its sleeve, reaching high ----
  const RS = [0.22, 1.42, 0.1], RE = [0.245, 1.3, 0.36], RW = [0.24, 1.335, 0.63], RC = between(RE, RW, 0.55);
  const armR = part([
    dirty(rough(tube([RS, between(RS, RE, 0.5), RE, between(RE, RW, 0.3), RC], [0.076, 0.072, 0.064, 0.059, 0.056], jacket, { sides: 14, steps: 4 }), 0.006, 30), { mottle: 0.35, freq: 12 }),
    ...[0, 1, 2, 3, 4, 5].map((i) => { const a = (i / 6) * PI * 2, x = RC[0] + Math.cos(a) * 0.05, y = RC[1] + Math.sin(a) * 0.05; return tube([[x, y, RC[2] - 0.01], [x * 1.0, y - 0.012, RC[2] + 0.03 + 0.03 * (i % 2)]], [0.016, 0.003], jacketDark, { sides: 5, steps: 2, squash: 0.35 }); }),   // the torn edge of the cuff
    dirty(tube([between(RE, RW, 0.5), between(RE, RW, 0.66)], [0.047, 0.045], shirt, { sides: 12, steps: 2 }), { mottle: 0.5, stains: [[...between(RE, RW, 0.6), 0.05, mud, 0.6]] }),   // his shirt cuff
    dirty(rough(tube([RC, between(RE, RW, 0.78), RW], [0.04, 0.038, 0.03], skin, { sides: 12, steps: 4 }), 0.002, 50), { mottle: 0.45, freq: 30 }),
    tube([between(RE, RW, 0.6), between(RE, RW, 0.8), RW].map(([x, y, z], i) => [x + 0.012 * (i - 1), y + 0.034, z]), [0.005, 0.006, 0.004], rot, { sides: 5, steps: 3 }),   // a vein
    lump(0.022, skinDark, [RW[0] + 0.026, RW[1] + 0.006, RW[2] - 0.01], [1, 1, 1], 6),                                                          // the bone of his wrist
    paint(new THREE.TorusGeometry(0.036, 0.008, 5, 14).translate(...between(RE, RW, 0.9)), leather),                                           // a watch, stopped
    paint(new THREE.CylinderGeometry(0.019, 0.019, 0.009, 10).translate(RW[0], RW[1] + 0.036, between(RE, RW, 0.9)[2]), metal),
    ...fineHand(RW, [0, -0.12, 1], 0.075, flesh, { curl: 0.75, thumb: -1 }),
  ], RS, [0.16, 0, 0], 0);

  // ---- Left arm: bare, lower, and bitten through to the bone ----
  const LS = [-0.22, 1.4, 0.1], LE = [-0.262, 1.2, 0.3], LW = [-0.24, 1.125, 0.55], B0 = between(LE, LW, 0.34), B1 = between(LE, LW, 0.64);
  const BITE = between(LE, LW, 0.5);
  const armL = part([
    dirty(rough(tube([LS, between(LS, LE, 0.45), LE], [0.056, 0.059, 0.046], skin, { sides: 14, steps: 5 }), 0.0025, 40), { mottle: 0.45, freq: 28, stains: [[...between(LS, LE, 0.6), 0.05, rot, 0.6]] }),
    dirty(lump(0.048, skinDark, LE, [1, 1, 1], 10), { mottle: 0.4 }),
    dirty(tube([LE, B0], [0.045, 0.041], skin, { sides: 12, steps: 3 }), { mottle: 0.45, freq: 28, stains: [[...BITE, 0.1, blood]] }),
    dirty(tube([B1, LW], [0.036, 0.03], skin, { sides: 12, steps: 3 }), { mottle: 0.45, freq: 28, stains: [[...BITE, 0.1, blood]] }),
    ...[-0.011, 0.012].map((dx) => tube([[B0[0] + dx, B0[1], B0[2] - 0.01], [B1[0] + dx, B1[1], B1[2] + 0.01]], [0.011, 0.01], bone, { sides: 6, steps: 2 })),   // the two bones of the forearm
    ...[0, 1, 2, 3, 4, 5, 6].map((i) => { const a = (i / 7) * PI * 2, end = i % 2 ? B0 : B1; return lump(0.016 + 0.006 * (i % 3), i % 3 ? blood : bloodDark, [end[0] + Math.cos(a) * 0.03, end[1] + Math.sin(a) * 0.03, end[2] + (i % 2 ? 0.012 : -0.012)], [1, 1, 1.4], 6); }),   // the ragged edges of the bite
    tube([[B0[0] + 0.02, B0[1] - 0.02, B0[2]], [BITE[0] + 0.03, BITE[1] - 0.07, BITE[2]], [BITE[0] + 0.02, BITE[1] - 0.12, BITE[2] + 0.01]], [0.007, 0.005, 0.003], blood, { sides: 5, steps: 3 }),   // a tendon, hanging
    lump(0.03, skinDark, LW, [1, 1, 1], 8),
    ...fineHand(LW, [0, -0.75, 0.66], 0.07, { skin: rot, joint: skinDark, nail }, { curl: 0.25, thumb: 1, missing: [3] }),
  ], LS, [0.22, 0, 0], PI);

  // ---- Legs ----
  const leg = (side, stride, phase) => {
    const x = side * 0.1, HIP = [x, 0.92, 0], K = [x * 1.05, 0.5, 0.05], A = [x, 0.1, 0], shod = side > 0;
    const pieces = [
      dirty(rough(tube([HIP, between(HIP, K, 0.5), K, between(K, A, 0.5), [x, 0.15, 0]], [0.1, 0.09, 0.076, 0.068, 0.064], trousers, { sides: 14, steps: 4 }), 0.006, 26), { mottle: 0.3, freq: 10, muck: [0.55, 0.65, mud] }),
      ...[0, 1, 2, 3, 4].map((i) => { const a = (i / 5) * PI * 2 + side; return tube([[x + Math.cos(a) * 0.058, 0.16, Math.sin(a) * 0.058], [x + Math.cos(a) * 0.062, 0.1 - 0.03 * (i % 2), Math.sin(a) * 0.062]], [0.018, 0.003], jacketDark, { sides: 5, steps: 2, squash: 0.35 }); }),   // the frayed trouser end
    ];
    if (shod) {
      const upper = sculpt(new THREE.SphereGeometry(0.1, 16, 12).scale(0.56, 0.52, 1.5).translate(x, 0.06, 0.06), (v) => {
        if (v.y < 0.022) v.y = 0.022;                                                    // flat on its sole
        if (v.z > 0.12) v.y = 0.022 + (v.y - 0.022) * 0.72;                              // a lower toe
        dent(v, [x, 0.11, -0.01], 0.06, 0.03, [0, -1, 0]);                               // the opening his ankle goes into
      });
      pieces.push(
        dirty(paint(upper, shoe), { mottle: 0.5, freq: 30, muck: [0.08, 0.7, mud] }),
        slab(0.112, 0.022, 0.3, dark, [x, 0.011, 0.06]), slab(0.1, 0.026, 0.085, dark, [x, 0.018, -0.045]),                                    // sole, and heel
        ...[0.03, 0.06, 0.09].map((z) => tube([[x - 0.03, 0.098 - z * 0.25, z], [x, 0.106 - z * 0.25, z], [x + 0.03, 0.098 - z * 0.25, z]], [0.004, 0.005, 0.004], shirt, { sides: 5, steps: 2 })),   // laces
        tube([[x, 0.2, 0], [x, 0.11, 0.004]], [0.05, 0.047], 0x55584f, { sides: 10, steps: 2 }),                                               // a sock
      );
    } else {
      pieces.push(
        dirty(lump(0.052, skinDark, [K[0], K[1], K[2] + 0.04], [1, 1.15, 0.6], 10), { mottle: 0.45, stains: [[K[0], K[1], K[2] + 0.06, 0.04, blood]] }),   // his knee, out of the trouser
        dirty(tube([[x, 0.2, 0], [x, 0.1, 0.004]], [0.044, 0.04], skin, { sides: 10, steps: 2 }), { mottle: 0.45 }),
        ...fineFoot([x, 0.1, 0.0], 0.24, { skin: skinDark, joint: rot, nail }, 0.1).map((g) => dirty(g, { mottle: 0.35, muck: [0.06, 0.6, mud] })),
      );
    }
    return part(pieces, HIP, [stride, 0, 0], phase);
  };

  return [body, head, eyes, armR, armL, leg(-1, 0.42, 0), leg(1, 0.2, PI)];
}
